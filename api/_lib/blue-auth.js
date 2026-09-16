import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { blueAuthStore, convexConfigured } from './convex.js';

import { parseCookies, ensureCsrfToken, verifyCsrf, appendCookie, serializeCookie } from './cookies.js';
import { isValidEmail, normalizeEmail } from './auth.js';
import { readBody, send, sendPilotError } from './http.js';
import { PilotError } from './layla/config.js';

// blueAuthStore is built in convex.js alongside the other five Convex route
// clients; re-exported here because this module is where its callers look.
export { blueAuthStore };

export const BLUE_ACCOUNT_COOKIE = '__Host-blue_account';
const origin = 'https://bznsflow-blue.vercel.app';
export const hashAccountToken = value => createHash('sha256').update(value).digest('hex');
export function blueAccountsAvailable(env = process.env) {
  return convexConfigured(env) && env.BLUE_ACCOUNT_SAVE_ENABLED === 'true' && /^re_[\w-]{10,}$/.test(env.BLUE_RESEND_API_KEY || '') &&
    typeof env.BLUE_AUTH_FROM === 'string' && env.BLUE_AUTH_FROM.length < 200 && !/[\r\n]/.test(env.BLUE_AUTH_FROM) && isValidEmail(env.BLUE_AUTH_FROM.match(/<([^<>]+)>$/)?.[1] || env.BLUE_AUTH_FROM);
}
export async function blueAccount(req, store) {
  const token = parseCookies(req)[BLUE_ACCOUNT_COOKIE];
  return /^[a-f0-9]{64}$/.test(token || '') ? store('session',{tokenHash:hashAccountToken(token)}) : null;
}
export async function sendBlueCode({email,code,lang,id,env,fetcher = fetch}) {
  if (!blueAccountsAvailable(env)) throw new PilotError('account_unavailable',503);
  const ar = lang === 'ar';
  const response = await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.BLUE_RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`blue-signin/${id}`},body:JSON.stringify({from:env.BLUE_AUTH_FROM,to:[email],subject:ar ? 'رمز الدخول إلى BznsFlow' : 'Your BznsFlow sign-in code',text:ar ? `رمز الدخول: ${code}\nتنتهي صلاحيته بعد 10 دقائق. لا تشاركه مع أي شخص.\nإذا لم تطلب الرمز، تجاهل هذه الرسالة.` : `Your sign-in code is ${code}.\nIt expires in 10 minutes. Do not share it with anyone.\nIf you did not request this code, ignore this email.`})});
  if (!response.ok) throw new PilotError('send_failed',502);
  const result = await response.json();
  if (typeof result.id !== 'string') throw new PilotError('send_failed',502);
}
export function createBlueAuthHandler({env = process.env,fetcher = fetch,store = blueAuthStore({env,fetcher}),sendCode = sendBlueCode} = {}) {
  return async (req,res,action) => {
    try {
      if (req.headers?.host !== new URL(origin).host || (req.method !== 'GET' && req.headers?.origin !== origin)) throw new PilotError('origin',403);
      if (!blueAccountsAvailable(env)) return send(res,503,{ok:false,reason:'account_unavailable'},{vary:'Cookie'});
      if (req.method === 'GET' && action === 'session') {
        const account = await blueAccount(req,store);
        return send(res,200,{ok:true,csrfToken:ensureCsrfToken(req,res),account:account ? {id:account.id,email:account.email,name:account.name || '',profileComplete:true} : null,providers:[]},{vary:'Cookie'});
      }
      if (!verifyCsrf(req)) throw new PilotError('csrf',403);
      if (req.method === 'DELETE' && action === 'session') {
        const token = parseCookies(req)[BLUE_ACCOUNT_COOKIE];
        if (token) await store('signout',{tokenHash:hashAccountToken(token)});
        appendCookie(res,serializeCookie(BLUE_ACCOUNT_COOKIE,'',{maxAge:0,httpOnly:true}));
        appendCookie(res,serializeCookie('__Host-blue_review','',{maxAge:0,httpOnly:true}));
        return send(res,200,{ok:true},{vary:'Cookie'});
      }
      if (req.method !== 'POST') throw new PilotError('method',405);
      const body = readBody(req);
      if(action==='session' && typeof body?.reviewAccess==='string') {
        if(!/^[a-f0-9]{64}$/.test(body.reviewAccess)) throw new PilotError('session_expired',401);
        const raw=randomBytes(32).toString('hex');
        const account=await store('review_access',{accessHash:hashAccountToken(body.reviewAccess),tokenHash:hashAccountToken(raw)});
        delete body.reviewAccess;
        appendCookie(res,serializeCookie(BLUE_ACCOUNT_COOKIE,raw,{maxAge:86400,httpOnly:true}));
        appendCookie(res,serializeCookie('__Host-blue_review','',{maxAge:0,httpOnly:true}));
        return send(res,200,{ok:true,account:{id:account.id,email:account.email,profileComplete:true}},{vary:'Cookie'});
      }
      if (!body || JSON.stringify(body).length > 2000 || !isValidEmail(body.email)) throw new PilotError('email');
      const email = normalizeEmail(body.email);
      const hash = value => createHmac('sha256',env.BLUE_REVIEW_SERVICE_SECRET).update(`blue-auth:${value}`).digest('hex');
      const ipHash = hash(String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0]);
      if (action === 'code') {
        let code = String(randomInt(1000000)).padStart(6,'0');
        const id = randomUUID();
        await store('request_code',{email,codeHash:hash(`${email}:${code}`),ipHash,challengeId:id});
        try {
          await sendCode({email,code,lang:body.lang,id,env,fetcher});
          await store('code_sent',{email,challengeId:id});
        } finally { code = undefined; }
        return send(res,200,{ok:true},{vary:'Cookie'});
      }
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code.replace(/\s/g,''))) throw new PilotError('code_invalid',409);
      const raw = randomBytes(32).toString('hex');
      const account = await store('verify_code',{email,codeHash:hash(`${email}:${body.code.replace(/\s/g,'')}`),ipHash,tokenHash:hashAccountToken(raw)});
      delete body.code;
      appendCookie(res,serializeCookie(BLUE_ACCOUNT_COOKIE,raw,{maxAge:2592000,httpOnly:true}));
      return send(res,200,{ok:true,account:{id:account.id,email:account.email,name:account.name || '',profileComplete:true}},{vary:'Cookie'});
    } catch (error) { return sendPilotError(res, error, { fallback: 'account_unavailable', vary: 'Cookie' }); }
  };
}
