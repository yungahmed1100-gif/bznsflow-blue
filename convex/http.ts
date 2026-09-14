import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
const http = httpRouter();
http.route({ path: '/blue-review', method: 'POST', handler: httpAction(async (ctx, request) => {
  const secret = process.env.BLUE_REVIEW_SERVICE_SECRET;
  const supplied = request.headers.get('Authorization') || '';
  const expected = `Bearer ${secret}`;
  let mismatch = supplied.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret) || mismatch) return new Response(null, { status: 401 });
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  try {
    const text = await request.text();
    if (text.length > 16000) return new Response(null, { status: 413 });
    const args = JSON.parse(text);
    if (!/^[a-f0-9]{64}$/.test(args.sessionHash || '')) return new Response(null, { status: 400 });
    const result = await ctx.runMutation(internal.review.execute, args);
    return new Response(JSON.stringify(result), { headers });
  } catch { return new Response(JSON.stringify({ ok: false, reason: 'review_backend_unavailable' }), { status: 503, headers }); }
}) });
http.route({path:'/blue-auth',method:'POST',handler:httpAction(async(ctx,request)=>{
  const secret=process.env.BLUE_REVIEW_SERVICE_SECRET;
  const supplied=request.headers.get('Authorization') || '', expected=`Bearer ${secret}`;
  let mismatch=supplied.length ^ expected.length;
  for(let i=0;i<expected.length;i++) mismatch|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);
  if(!secret || !/^[a-f0-9]{64}$/i.test(secret) || mismatch) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text(); if(raw.length>4000) return new Response(null,{status:413});
    const result=await ctx.runMutation(internal.blueAuth.execute,JSON.parse(raw));
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'account_unavailable'}),{status:503,headers});}
})});
http.route({path:'/blue-messaging',method:'POST',handler:httpAction(async(ctx,request)=>{
  const secret=process.env.BLUE_REVIEW_SERVICE_SECRET;
  const supplied=request.headers.get('Authorization') || '', expected=`Bearer ${secret}`;
  let mismatch=supplied.length ^ expected.length;
  for(let i=0;i<expected.length;i++) mismatch|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);
  if(!secret || !/^[a-f0-9]{64}$/i.test(secret) || mismatch) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text();if(raw.length>262144) return new Response(null,{status:413});
    const result=await ctx.runMutation(internal.blueMessaging.execute,JSON.parse(raw));
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'messaging_unavailable'}),{status:503,headers});}
})});
// Shared bearer check for the dashboard and campaign routes.
function serviceAuthorized(request: Request) {
  const secret=process.env.BLUE_REVIEW_SERVICE_SECRET;
  const supplied=request.headers.get('Authorization') || '', expected=`Bearer ${secret}`;
  let mismatch=supplied.length ^ expected.length;
  for(let i=0;i<expected.length;i++) mismatch|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);
  return !!secret && /^[a-f0-9]{64}$/i.test(secret) && !mismatch;
}
http.route({path:'/blue-dashboard',method:'POST',handler:httpAction(async(ctx,request)=>{
  if(!serviceAuthorized(request)) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text();if(raw.length>262144) return new Response(null,{status:413});
    const args=JSON.parse(raw);
    if(!/^[a-f0-9]{64}$/.test(args.sessionHash || '')) return new Response(null,{status:400});
    const result=await ctx.runMutation(internal.blueDashboard.execute,args);
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'dashboard_unavailable'}),{status:503,headers});}
})});
http.route({path:'/blue-campaign',method:'POST',handler:httpAction(async(ctx,request)=>{
  if(!serviceAuthorized(request)) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text();if(raw.length>16000) return new Response(null,{status:413});
    const result=await ctx.runMutation(internal.blueCampaign.execute,JSON.parse(raw));
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'campaign_unavailable'}),{status:503,headers});}
})});
http.route({path:'/blue-catalog',method:'POST',handler:httpAction(async(ctx,request)=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};if(!serviceAuthorized(request))return new Response(null,{status:401});
  try{const raw=await request.text();if(raw.length>262144)return new Response(null,{status:413});const result=await ctx.runMutation((internal as any).blueCatalog.execute,JSON.parse(raw));return new Response(JSON.stringify(result),{headers});}catch{return new Response(JSON.stringify({ok:false,reason:'catalog_unavailable'}),{status:503,headers});}
})});
export default http;
