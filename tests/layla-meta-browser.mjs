// Local browser/UI checks call the real pilot handler with synthetic identity and memory storage.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createHandler } from '../api/layla-meta.js';
import { initialState } from '../api/_lib/layla/domain.js';
import { settings } from '../api/_lib/layla/config.js';
const BASE=process.argv[2] || 'http://127.0.0.1:5175';
const OUT=process.env.LAYLA_BROWSER_OUT || 'work/layla-meta-browser';
await mkdir(OUT,{recursive:true});
const c=settings({LAYLA_OWNER_ACCOUNT_ID:'11111111-1111-4111-8111-111111111111',LAYLA_META_KILL_SWITCH:'false'});
let state=initialState(c),revision=0,isOwner=true;
const store={async read(){return {state:structuredClone(state),revision};},async cas(_,v,s){if(v!==revision)return false;state=structuredClone(s);revision++;return true;}};
const handler=createHandler({store,configuration:()=>c,sessionLookup:async()=>({ok:true,account:{id:isOwner?c.owner:'other'}})});
const browser=await chromium.launch();let count=0;
try {
 for(const width of [390,1280]) {
  const ctx=await browser.newContext({viewport:{width,height:900}}),page=await ctx.newPage();
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==new URL(BASE).origin)return route.abort();
   if(url.pathname==='/api/auth-session')return route.fulfill({json:{ok:true,csrfToken:'a'.repeat(64),account:null,providers:[]}});
   if(url.pathname==='/api/layla-meta') {
    const request=route.request();
    const req={method:request.method(),headers:{...request.headers(),host:url.host,origin:url.origin,cookie:`bf_session=${'b'.repeat(64)}; bf_csrf=${'a'.repeat(64)}`},body:request.postDataJSON()};
    const res={code:0,headers:{},status(n){this.code=n;},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
    await handler(req,res);return route.fulfill({status:res.code,headers:res.headers,body:res.body});
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:false}});
   return route.continue();
  });
  isOwner=false;await page.goto(`${BASE}/owner/layla`);await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').textContent(),/restricted/);assert.equal(await page.locator('textarea').count(),0);count+=2;
  isOwner=true;await page.reload();await page.getByRole('heading',{name:/MOCK/}).waitFor();count++;
  for(const [label,value] of [['Sector /','Business automation'],['Approved services /','Website FAQ assistance / مساعدة أسئلة الموقع'],['Actual human contact /','owner@example.test']])await page.getByLabel(label,{exact:false}).fill(value);
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:/Save review/}).click();await page.waitForFunction(()=>!document.querySelector('button[type=submit]:disabled'));await page.getByRole('button',{name:/Enable processing/}).click();
  await page.getByLabel('Customer question /').fill('كم التكلفة؟');await page.getByRole('button',{name:/Preview grounded/}).click();await page.locator('.layla-preview').waitFor();assert.match(await page.locator('.layla-preview').textContent(),/معلومة مؤكدة/);count++;
  await page.getByRole('button',{name:'Queue mock incoming message'}).click();await page.waitForFunction(()=>document.querySelector('pre')?.textContent.includes('queued'));
  await page.getByRole('button',{name:'Process one mock message'}).click();await page.waitForFunction(()=>document.querySelector('pre')?.textContent.includes('submitted'));
  await page.getByRole('button',{name:'Simulate delivery receipt'}).click();await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('Reply delivered'));count+=3;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);count++;
  assert.equal(await page.locator('a,button').filter({hasText:/^Connect$/}).count(),0);count++;
  const accessibility=await new AxeBuilder({page}).include('.layla-pilot').analyze();
  assert.deepEqual(accessibility.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id),[]);count++;
  await page.screenshot({path:`${OUT}/owner-${width}.png`,fullPage:true});await ctx.close();
  state=initialState(c);revision=0;
 }
 console.log(`${count} pilot browser assertions passed. Real handler; mocked identity, storage and provider. No external network permitted by browser test.`);
} finally {await browser.close();}
