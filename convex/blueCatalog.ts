import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { syncServicesForOwner } from './hasib/serviceSync.js';

const price=v.object({type:v.string(),currency:v.string(),amount:v.optional(v.number()),minimum:v.optional(v.number()),maximum:v.optional(v.number()),unit:v.string(),label:v.string()});
const entry=v.object({entryKey:v.string(),kind:v.string(),nameEn:v.string(),nameAr:v.string(),category:v.string(),benefitEn:v.string(),benefitAr:v.string(),descriptionEn:v.string(),descriptionAr:v.string(),availability:v.string(),prices:v.array(price),source:v.string(),confidence:v.number(),laylaUseEn:v.string(),laylaUseAr:v.string(),sortOrder:v.number()});
const clean=(s:string,n:number)=>typeof s==='string' && s.length<=n && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
function valid(e:any){return /^[a-f0-9-]{36}$/.test(e?.entryKey||'') && ['service','product'].includes(e.kind) && clean(e.nameEn,160) && clean(e.nameAr,160) && !!(e.nameEn.trim()||e.nameAr.trim()) && ['category','benefitEn','benefitAr','descriptionEn','descriptionAr','availability','source','laylaUseEn','laylaUseAr'].every(k=>clean(e[k],700)) && Number.isFinite(e.confidence) && e.confidence>=0 && e.confidence<=1 && Number.isSafeInteger(e.sortOrder) && e.sortOrder>=0 && e.prices.length<=20 && e.prices.every((p:any)=>['fixed','from','range','free','quote','recurring','unavailable'].includes(p.type)&&clean(p.currency,8)&&clean(p.unit,80)&&clean(p.label,160));}
export const execute=internalMutation({args:{operation:v.union(...['list','match','save','saveMany','archive','approve','publish','summary'].map(x=>v.literal(x))),ownerKey:v.string(),cursor:v.optional(v.number()),limit:v.optional(v.number()),entry:v.optional(entry),entries:v.optional(v.array(entry)),entryKey:v.optional(v.string()),query:v.optional(v.string())},handler:async(ctx,args)=>{
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(args.ownerKey)) return {ok:false,reason:'catalog_unauthorized'};
  const meta=await ctx.db.query('blueCatalogMeta').withIndex('by_owner',q=>q.eq('ownerKey',args.ownerKey)).unique();
  const revision=meta?.revision||1, now=Date.now();
  // Products synced from Stock are edited in Stock only.
  const managed=async(entryKey:string)=>(await ctx.db.query('blueCatalogEntries').withIndex('by_owner_key',q=>q.eq('ownerKey',args.ownerKey).eq('entryKey',entryKey)).unique())?.source==='hasib_stock';
  if(['save','archive','approve'].includes(args.operation) && await managed(args.operation==='save'?args.entry?.entryKey||'':args.entryKey||'')) return {ok:false,reason:'managed_by_stock'};
  if(args.operation==='saveMany'){for(const e of args.entries||[]) if(await managed(e.entryKey)) return {ok:false,reason:'managed_by_stock'};}
  if(args.operation==='list'){
    const rows=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','draft')).collect();
    const approved=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','approved')).collect();
    const all=[...rows,...approved].sort((a,b)=>a.sortOrder-b.sortOrder),start=Math.max(0,args.cursor||0),limit=Math.min(50,Math.max(1,args.limit||25));
    return {ok:true,value:{entries:all.slice(start,start+limit).map(({_id,_creationTime,ownerKey,...r})=>r),cursor:start+limit<all.length?start+limit:null,total:all.length,revision}};
  }
  if(args.operation==='match'){
    if(!clean(args.query||'',1000))return {ok:false,reason:'invalid_catalog_query'};
    const query=(args.query||'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
    const approved=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','approved')).collect();
    const matches=approved.filter(row=>[row.nameEn,row.nameAr].some(name=>name.trim()&&query.includes(name.toLocaleLowerCase()))).slice(0,10).map(({_id,_creationTime,ownerKey,...row})=>row);
    return {ok:true,value:{entries:matches,revision}};
  }
  if(args.operation==='saveMany'){
    const entries=args.entries||[];if(!entries.length||entries.length>25||!entries.every(valid)||new Set(entries.map(e=>e.entryKey)).size!==entries.length)return {ok:false,reason:'invalid_catalog_entry'};
    const current=[...(await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','draft')).collect()),...(await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','approved')).collect())];
    const currentKeys=new Set(current.map(row=>row.entryKey)),newCount=entries.filter(e=>!currentKeys.has(e.entryKey)).length;if(current.length+newCount>1000)return {ok:false,reason:'catalog_limit'};
    for(const item of entries){const existing=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_key',q=>q.eq('ownerKey',args.ownerKey).eq('entryKey',item.entryKey)).unique();const value={...item,ownerKey:args.ownerKey,status:'draft',revision,updatedAt:now};if(existing)await ctx.db.patch(existing._id,value);else await ctx.db.insert('blueCatalogEntries',{...value,createdAt:now});}
  } else if(args.operation==='save'){
    if(!valid(args.entry)) return {ok:false,reason:'invalid_catalog_entry'};
    const count=(await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','draft')).collect()).length+(await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','approved')).collect()).length;
    const existing=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_key',q=>q.eq('ownerKey',args.ownerKey).eq('entryKey',args.entry!.entryKey)).unique();
    if(!existing&&count>=1000)return {ok:false,reason:'catalog_limit'};
    const value={...args.entry!,ownerKey:args.ownerKey,status:'draft',revision,updatedAt:now};
    if(existing)await ctx.db.patch(existing._id,value);else await ctx.db.insert('blueCatalogEntries',{...value,createdAt:now});
  } else if(['archive','approve'].includes(args.operation)){
    const row=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_key',q=>q.eq('ownerKey',args.ownerKey).eq('entryKey',args.entryKey||'')).unique();if(!row)return {ok:false,reason:'catalog_not_found'};await ctx.db.patch(row._id,{status:args.operation==='approve'?'approved':'archived',updatedAt:now});
  } else if(args.operation==='publish'){
    const drafts=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','draft')).collect();for(const row of drafts)await ctx.db.patch(row._id,{status:'approved',revision:revision+1,updatedAt:now});
    if(meta)await ctx.db.patch(meta._id,{revision:revision+1,publishedAt:now,updatedAt:now});else await ctx.db.insert('blueCatalogMeta',{ownerKey:args.ownerKey,revision:2,publishedAt:now,updatedAt:now});
  }
  // Clinics charge visits from these services: keep Hasib's service items in step. Never blocks the catalog write.
  if(['save','saveMany','archive','approve','publish'].includes(args.operation)){try{await syncServicesForOwner(ctx,args.ownerKey,now);}catch(error){console.error('hasib_service_sync_failed',error instanceof Error?error.message:'unknown');}}
  const approved=await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',args.ownerKey).eq('status','approved')).collect();
  const summary=approved.slice(0,100).map(r=>`${r.nameEn||r.nameAr}${r.prices[0]?.label?`: ${r.prices[0].label}`:''}`).join('; ').slice(0,350);
  return {ok:true,value:{revision:args.operation==='publish'?revision+1:revision,summary}};
}});
