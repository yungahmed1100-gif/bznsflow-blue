import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { hasibArgs } from '../api/_lib/hasib/validate.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { assertEntry, assertHasibRows } from './helpers/hasib-contract.mjs';
import { convertQuantity } from '../convex/hasib/units.js';

async function fixture(packId='cafe') {
  const h=blueHarness(); await h.enable(); await h.m.db.insert('blueMessagingSettings',{key:'hasib',enabled:true}); h.m.ctx.hasibPreview=true;
  const tenant=await seedTenant(h.m,{name:`food-${packId}`,sector:'Retail'});
  await grantPlan(h.m.ctx,{email:`food-${packId}@example.com`,plan:'ascend',packId:'retail'},h.m.now());
  const run=async(operation,input={})=>{
    const a={operation,sessionHash:tenant.sessionHash,...hasibArgs(operation,input)};
    assertEntry(a); const result=await executeHasib(h.m.ctx,{...a,hashSecret:SECRET},h.m.now());
    assertHasibRows(h.m); return result;
  };
  assert.equal((await run('settings_update',{packId})).ok,true);
  const call=async(op,a)=>{const r=await run(op,a);assert.equal(r.ok,true,`${op}: ${r.reason}`);return r.value;};
  const item=async(name,{stock=20,cost=1000,unit='piece',tracked=true,price=0}={})=>(await call('item_save',{requestId:randomUUID(),item:{kind:'product',nameEn:name,nameAr:name,category:'Food',unit,trackStock:tracked},variants:[{sku:name,options:[],priceMinor:price,...(cost!==null?{costMinor:cost}:{}),openingStock:stock,reorderPoint:2}]})).variants[0].id;
  return {h,run,call,item,tenant};
}

test('food HTTP shapes match production entry and persisted schema; fractional units and snapshots survive recipe edits',async()=>{
  const {h,call,run,item}=await fixture();
  const milk=await item('milk',{stock:10,unit:'l'}), oat=await item('oat',{stock:10,unit:'l',cost:2000});
  const drink=await item('latte',{stock:0,tracked:false,price:4000});
  let recipe=await call('recipe_save',{menuVariantId:drink,yieldQty:1,ingredients:[{variantId:milk,qty:250,unit:'ml'}],modifiers:[{key:'oat',label:'Oat milk',priceMinor:500,ingredients:[{variantId:milk,qty:-250,unit:'ml'},{variantId:oat,qty:250,unit:'ml'}]}]});
  let order=await call('order_create',{requestId:randomUUID(),channel:'walk_in',confirm:true,fulfilment:{type:'in_store'},lines:[{variantId:drink,qty:2,modifierKeys:['oat']}]});
  assert.equal(order.totalMinor,9000);assert.equal(order.lines[0].unitCostMinor,500);
  assert.equal((await h.m.db.get(milk)).onHand,10);assert.equal((await h.m.db.get(oat)).onHand,9.5);
  await call('recipe_save',{menuVariantId:drink,version:recipe.version,yieldQty:1,ingredients:[{variantId:milk,qty:1,unit:'l'}]});
  assert.equal((await run('recipe_save',{menuVariantId:drink,version:1,yieldQty:1,ingredients:[{variantId:milk,qty:1,unit:'l'}]})).reason,'recipe_conflict');
  assert.equal((await run('order_status',{orderId:order.id,version:order.version,to:'cancelled'})).reason,'food_disposition_required');
  await call('order_status',{orderId:order.id,version:order.version,to:'cancelled',disposition:'restock'});
  assert.equal((await h.m.db.get(oat)).onHand,10);assert.equal((await h.m.db.get(milk)).onHand,10);
  const lots=h.m.table('hasibStockLots').filter(l=>l.variantId===oat);assert.equal(lots.reduce((n,l)=>n+l.remainingQty,0),10);
  const revenue=(await call('insights',{period:'today'}));assert.equal(revenue.recordedProfitMinor,0);
});

test('physical counts calculate actual use using receipts, not expected plus waste; waste deducted once',async()=>{
  const {h,call,item}=await fixture('restaurant');
  const milk=await item('milk'),dish=await item('dish',{tracked:false,stock:0,price:5000});
  await call('recipe_save',{menuVariantId:dish,yieldQty:1,ingredients:[{variantId:milk,qty:1,unit:'piece'}]});
  await call('stock_count',{requestId:randomUUID(),variantId:milk,countedQty:20});h.m.advance(1);
  await call('stock_receive',{requestId:randomUUID(),vendor:'Dairy',receivedOn:'2027-01-15',lines:[{variantId:milk,qty:10,unitCostMinor:1000}]});h.m.advance(1);
  let order=await call('order_create',{requestId:randomUUID(),channel:'walk_in',confirm:true,fulfilment:{type:'in_store'},lines:[{variantId:dish,qty:2}]});
  await call('order_status',{orderId:order.id,version:order.version,to:'completed'});h.m.advance(1);
  const req={requestId:randomUUID(),variantId:milk,qty:3,reason:'spoilage'};await call('waste_create',req);await call('waste_create',req);h.m.advance(1);
  await call('stock_count',{requestId:randomUUID(),variantId:milk,countedQty:24});h.m.advance(1);
  const summary=await call('restaurant_summary',{period:'today'});assert.equal(summary.actualUsageMinor,6000);assert.equal(summary.theoreticalUsageMinor,2000);assert.equal(summary.usageVarianceMinor,4000);
  const money=await call('insights',{period:'today'});assert.equal(money.sales.cogsMinor,2000);assert.equal(money.recordedProfitMinor,5000);
});

test('batch compatible units, input/output rejection, missing cost versus explicit zero, and declared boundary failures',async()=>{
  const {call,run,item}=await fixture('cakes');
  const flour=await item('flour',{unit:'kg',stock:2,cost:1000}),sugar=await item('sugar',{unit:'kg',stock:2,cost:2000}),bread=await item('bread',{stock:0,cost:0,price:1000});
  const batch=await call('batch_create',{requestId:randomUUID(),outputVariantId:bread,outputQty:10,inputs:[{variantId:flour,qty:500,unit:'g'},{variantId:sugar,qty:250,unit:'g'}],producedOn:'2027-01-15',useBy:'2027-01-16'});assert.equal(batch.costMinor,100);
  assert.equal((await run('batch_create',{requestId:randomUUID(),outputVariantId:bread,outputQty:1,inputs:[{variantId:bread,qty:1}]})).reason,'invalid_batch');
  assert.equal(convertQuantity(2,'kg','ml'),null);
  assert.throws(()=>assertEntry({operation:'stock_receive',sessionHash:'x',lines:[{variantId:flour,qty:1,unitCostMinor:'bad'}]}));
  const unknown=await item('unknown',{cost:null,price:1000});
  let o=await call('order_create',{requestId:randomUUID(),channel:'walk_in',confirm:true,fulfilment:{type:'in_store'},lines:[{variantId:unknown,qty:1}]});
  await call('order_status',{orderId:o.id,version:o.version,to:'completed'});
  const money = await call('insights',{period:'today'});
  assert.equal(money.recordedProfitMinor,null);
  assert.equal(money.sales.grossProfitMinor,null);
  assert.equal(money.netProfitMinor,null);
  assert.equal(money.restaurant.foodCostBps,null);
  const today = await call('today');
  assert.equal(today.restaurant.foodCogsMinor,null);
});

test('oversale receipt and safe reversal reconcile on-hand and original dated lots',async()=>{
  const {h,call,item}=await fixture('cakes');
  const bread=await item('oversold-bread',{stock:2,cost:1000,price:2000});
  const order=await call('order_create',{requestId:randomUUID(),channel:'walk_in',confirm:true,fulfilment:{type:'in_store'},lines:[{variantId:bread,qty:5}]});
  await call('stock_receive',{requestId:randomUUID(),vendor:'Bakery',receivedOn:'2027-01-15',lines:[{variantId:bread,qty:5,unitCostMinor:1000,useBy:'2027-01-17'}]});
  await call('order_status',{orderId:order.id,version:order.version,to:'cancelled',disposition:'restock'});
  const lots=h.m.table('hasibStockLots').filter(l=>l.variantId===bread);
  assert.equal((await h.m.db.get(bread)).onHand,7);assert.equal(lots.reduce((n,l)=>n+l.remainingQty,0),7);
  assert.equal(lots.filter(l=>l.useBy==='2027-01-17').reduce((n,l)=>n+l.remainingQty,0),5);
});

test('discarded food cancellation retains consumption and records its loss once',async()=>{
  const {h,call,item}=await fixture('restaurant');
  const ingredient=await item('discard-milk'),dish=await item('discard-drink',{tracked:false,stock:0,price:5000});
  await call('recipe_save',{menuVariantId:dish,yieldQty:1,ingredients:[{variantId:ingredient,qty:1,unit:'piece'}]});
  const o=await call('order_create',{requestId:randomUUID(),channel:'walk_in',confirm:true,fulfilment:{type:'in_store'},lines:[{variantId:dish,qty:2}]});
  await call('order_status',{orderId:o.id,version:o.version,to:'cancelled',disposition:'discard'});
  assert.equal((await h.m.db.get(ingredient)).onHand,18);
  assert.equal(h.m.table('hasibWaste').length,1);
  assert.equal((await call('insights',{period:'today'})).recordedProfitMinor,-2000);
});

test('discard cannot bypass stock deduction when confirming a pending food order',async()=>{
  const {h,call,run,item}=await fixture('cakes');
  const bread=await item('confirm-bread',{stock:2,cost:1000,price:2000});
  const o=await call('order_create',{requestId:randomUUID(),channel:'walk_in',confirm:false,fulfilment:{type:'in_store'},lines:[{variantId:bread,qty:1}]});
  assert.equal((await run('order_status',{orderId:o.id,version:o.version,to:'confirmed',disposition:'discard'})).reason,'invalid_disposition');
  assert.equal((await h.m.db.get(bread)).onHand,2);
  await call('order_status',{orderId:o.id,version:o.version,to:'confirmed'});
  assert.equal((await h.m.db.get(bread)).onHand,1);
});
