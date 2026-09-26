import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
const http = httpRouter();

// The bearer check for every route below. Three of them inlined their own copy
// of this until 2026-09-16, purely because it was declared after them.
//
// The comparison is deliberately constant-time: it always walks the whole
// expected string, so a wrong token cannot be narrowed by timing how quickly it
// is refused. Keep it that way — an early `return` on first mismatch would be
// the natural "tidy-up" and would reintroduce the leak.
function serviceAuthorized(request: Request) {
  const secret=process.env.BLUE_REVIEW_SERVICE_SECRET;
  const supplied=request.headers.get('Authorization') || '', expected=`Bearer ${secret}`;
  let mismatch=supplied.length ^ expected.length;
  for(let i=0;i<expected.length;i++) mismatch|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);
  return !!secret && /^[a-f0-9]{64}$/i.test(secret) && !mismatch;
}

http.route({ path: '/blue-review', method: 'POST', handler: httpAction(async (ctx, request) => {
  if (!serviceAuthorized(request)) return new Response(null, { status: 401 });
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
  if(!serviceAuthorized(request)) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text(); if(raw.length>4000) return new Response(null,{status:413});
    const result=await ctx.runMutation(internal.blueAuth.execute,JSON.parse(raw));
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'account_unavailable'}),{status:503,headers});}
})});
http.route({path:'/blue-messaging',method:'POST',handler:httpAction(async(ctx,request)=>{
  if(!serviceAuthorized(request)) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text();if(raw.length>262144) return new Response(null,{status:413});
    const result=await ctx.runMutation(internal.blueMessaging.execute,JSON.parse(raw));
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'messaging_unavailable'}),{status:503,headers});}
})});
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
http.route({path:'/blue-hasib',method:'POST',handler:httpAction(async(ctx,request)=>{
  if(!serviceAuthorized(request)) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text();if(raw.length>65536) return new Response(null,{status:413});
    const args=JSON.parse(raw);
    if(!/^[a-f0-9]{64}$/.test(args.sessionHash || '')) return new Response(null,{status:400});
    const result=await ctx.runMutation((internal as any).blueHasib.execute,args);
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'hasib_unavailable'}),{status:503,headers});}
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
http.route({path:'/blue-instagram',method:'POST',handler:httpAction(async(ctx,request)=>{
  if(!serviceAuthorized(request)) return new Response(null,{status:401});
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try {
    const raw=await request.text();if(raw.length>20000) return new Response(null,{status:413});
    const result=await ctx.runMutation(internal.blueInstagram.execute,JSON.parse(raw));
    return new Response(JSON.stringify(result),{headers});
  } catch {return new Response(JSON.stringify({ok:false,reason:'instagram_unavailable'}),{status:503,headers});}
})});
export default http;
