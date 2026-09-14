import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { PilotError } from './config.js';

export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
export function readableText(html, limit=12000) {
  return html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,m=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[m]))
    .replace(/\s+/g,' ').trim().slice(0,limit);
}
const RELEVANT_PATH=/(service|product|menu|price|pricing|package|catalog|faq|book|contact|delivery|خدم|منتج|قائم|سعر|أسعار|حجز|تواصل|توصيل)/i;
const EXCLUDED_PATH=/(login|sign-in|signin|account|checkout|cart|privacy|terms|wp-admin|logout)/i;
export function relevantLinks(html,baseUrl,limit=19) {
  const base=new URL(baseUrl),links=[];
  const matches=String(html||'').matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi);
  for(const match of matches){
    const href=match[1]||match[2]||match[3];let candidate;
    try{candidate=new URL(href,base);}catch{continue;}
    candidate.hash='';
    if(candidate.protocol!=='https:'||candidate.hostname!==base.hostname||candidate.username||candidate.password||candidate.port||EXCLUDED_PATH.test(candidate.pathname)||!RELEVANT_PATH.test(`${candidate.pathname}${candidate.search}`))continue;
    const value=candidate.href;if(value!==base.href&&!links.includes(value))links.push(value);
    if(links.length>=limit)break;
  }
  return links;
}
export function extractCatalogFacts(text, source='website') {
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  const parts=clean.split(/(?<=[.!؟])\s+|\s*[|•·]\s*/).map(s=>s.trim()).filter(s=>s.length>=4&&s.length<=500);
  const price=/(?:OMR|RO|ر\.?\s?ع\.?|AED|SAR|USD|\$|د\.?\s?إ\.?|ر\.?\s?س\.?)\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:OMR|RO|ريال|AED|SAR|USD)/i;
  const entries=[];
  for(const part of parts){const match=part.match(price);if(!match)continue;const before=part.slice(0,match.index).replace(/^(price|prices|السعر|الأسعار)\s*[:—-]?\s*/i,'').trim();const name=before.split(/[:—-]/)[0].trim().slice(0,160);if(name.length<2)continue;entries.push({kind:'service',nameEn:/[\u0600-\u06ff]/.test(name)?'':name,nameAr:/[\u0600-\u06ff]/.test(name)?name:'',category:'',benefitEn:'',benefitAr:'',descriptionEn:/[\u0600-\u06ff]/.test(part)?'':part,descriptionAr:/[\u0600-\u06ff]/.test(part)?part:'',availability:'',prices:[{type:/from|starting|ابتداء|يبدأ/i.test(part)?'from':'fixed',currency:/OMR|RO|ر\.?\s?ع|ريال/i.test(match[0])?'OMR':/AED|د\.?\s?إ/i.test(match[0])?'AED':/SAR|ر\.?\s?س/i.test(match[0])?'SAR':'USD',label:match[0],unit:''}],source,confidence:.7,laylaUseEn:'Answer customer questions about this service and its approved price.',laylaUseAr:'الإجابة عن أسئلة العملاء حول هذه الخدمة وسعرها المعتمد.'});if(entries.length>=1000)break;}
  const named=entries.map(item=>`${item.nameEn||item.nameAr}${item.prices[0]?.label?` — ${item.prices[0].label}`:''}`);
  const serviceFacts=parts.filter(part=>/service|product|menu|package|offer|book|خدم|منتج|قائم|باق|نقدم|نوفر|حجز/i.test(part));
  const benefitFacts=parts.filter(part=>/help|benefit|save|support|deliver|customer|حل|يساعد|فائد|يوفر|دعم|توصيل|عميل/i.test(part));
  return {questions:{whatTheyAre:(named.length?named:serviceFacts.slice(0,6)).join('; ').slice(0,1000)||clean.slice(0,500),howTheyHelp:benefitFacts.slice(0,6).join(' ').slice(0,1000),howLaylaUsesIt:'Use only owner-approved services, prices, availability, policies, hours and contact facts to answer customer questions; hand off when a fact is missing.'},entries};
}
async function retrieve(url,address,signal) {
  return new Promise((resolve,reject)=>{
    // Pin the checked address to this request, retaining hostname TLS validation.
    const req=request(url,{method:'GET',signal,headers:{'User-Agent':'BznsFlow-Website-Preview/1.0','Accept':'text/html,text/plain','Accept-Encoding':'identity'},lookup:(hostname,options,callback)=>options.all ? callback(null,[{address,family:4}]) : callback(null,address,4)},res=>{
      let size=0; const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>2000000){res.destroy();resolve({status:res.statusCode,location:res.headers.location,type:res.headers['content-type'] || '',body:Buffer.concat(chunks).toString('utf8'),partial:true});}else chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>resolve({status:res.statusCode,location:res.headers.location,type:res.headers['content-type'] || '',body:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error',reject);req.end();
  });
}
export async function importWebsite(input,{resolve = lookup,get = retrieve} = {}) {
  if(typeof input !== 'string' || input.length>2000) throw new PilotError('website_url_invalid');
  let url;
  try {url=new URL(input);} catch {throw new PilotError('website_url_invalid');}
  const signal=AbortSignal.timeout(12000),originHost=url.hostname.replace(/^www\./i,'');
  async function fetchPage(startUrl) {
    let current=new URL(startUrl);
    for(let hop=0;hop<3;hop++) {
    if(current.protocol!=='https:' || current.username || current.password || (current.port && current.port!=='443') || isIP(current.hostname) || !current.hostname.includes('.') || current.hostname.replace(/^www\./i,'')!==originHost || /\.(local|localhost|internal|test|invalid)$/i.test(current.hostname)) throw new PilotError('website_url_invalid');
    let addresses;
    try {addresses=await Promise.race([resolve(current.hostname,{all:true,family:4}),new Promise((_,reject)=>{if(signal.aborted)reject(Error('timeout'));else signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true});})]);}
    catch {throw new PilotError('website_unavailable',502);}
    if(!addresses.length || !addresses.every(a=>publicIPv4(a.address))) throw new PilotError('website_url_invalid');
    let page;
    try {page=await get(current,addresses[0].address,signal);} catch(error) {if(error instanceof PilotError)throw error;throw new PilotError('website_unavailable',502);}
    if([301,302,303,307,308].includes(page.status) && page.location) {
      try {current=new URL(page.location,current);} catch {throw new PilotError('website_url_invalid');}
      continue;
    }
    if(page.status!==200 || !/^(text\/html|text\/plain)(;|$)/i.test(page.type)) throw new PilotError('website_unavailable',502);
    current.hash='';return {url:current,body:page.body,type:page.type,text:readableText(page.body),partial:!!page.partial};
    }
    throw new PilotError('website_redirect_limit',422);
  }
  const root=await fetchPage(url);
  if(!root.text) throw new PilotError('website_empty',422);
  const pages=[root.url.href],texts=[root.text];let partial=root.partial,total=Buffer.byteLength(root.body||'');
  const links=/^text\/html/i.test(root.type)?relevantLinks(root.body,root.url.href):[];
  for(const link of links){
    if(signal.aborted||total>=10000000){partial=true;break;}
    try{const page=await fetchPage(link);total+=Buffer.byteLength(page.body||'');if(total>10000000){partial=true;break;}if(page.text){pages.push(page.url.href);texts.push(page.text);partial=partial||page.partial;}}
    catch{partial=true;}
  }
  const text=texts.join(' ').replace(/\s+/g,' ').trim().slice(0,100000);
  if(text.length>=100000)partial=true;
  return {url:root.url.href,text,partial,pages,extracted:extractCatalogFacts(text,root.url.href)};
}
