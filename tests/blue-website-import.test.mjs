import test from 'node:test';
import assert from 'node:assert/strict';
import { publicIPv4, importWebsite, readableText, relevantLinks, extractCatalogFacts } from '../api/_lib/layla/website-import.js';
import { validateReviewProfile, previewAnswer } from '../api/_lib/layla/review-profile.js';
import { extractCatalogRows, readCatalogFile } from '../src/lib/catalog-import.js';
test('website imports reject private addresses and revalidate redirect destinations',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','::1','198.18.0.1','224.0.0.1']) assert.equal(publicIPv4(ip),false);
  assert.equal(publicIPv4('93.184.216.34'),true);
  let requests=0;
  await assert.rejects(importWebsite('https://example.com',{resolve:async()=>[{address:'127.0.0.1'}],get:()=>{requests++;}}));assert.equal(requests,0);
  await assert.rejects(importWebsite('https://example.com',{resolve:async()=>[{address:'93.184.216.34'}],get:async()=>{requests++;return {status:302,location:'https://127.0.0.1/secrets'};}}));assert.equal(requests,1);
  for(const url of ['http://example.com','https://user:pass@example.com','https://example.com:8080','https://localhost','file:///etc/passwd']) await assert.rejects(importWebsite(url));
});
test('website extraction strips executable content and pins the validated address',async()=>{
  let pinned;
  const r=await importWebsite('https://example.com',{resolve:async()=>[{address:'93.184.216.34'}],get:async(url,address)=>{pinned=address;return {status:200,type:'text/html',body:'<script>bad()</script><h1>Portraits</h1><p>Open Monday</p>'};}});
  assert.equal(pinned,'93.184.216.34');assert.equal(r.text,'Portraits Open Monday');
  assert.equal(readableText('<style>bad</style><p>A &amp; B</p>'),'A & B');
});
test('website extraction scans relevant same-domain pages and ignores account or external links',async()=>{
  const root='<h1>Studio</h1><a href="/services">Services</a><a href="/pricing">Pricing</a><a href="/account">Account</a><a href="https://other.example/menu">Other</a>';
  assert.deepEqual(relevantLinks(root,'https://example.com/'),['https://example.com/services','https://example.com/pricing']);
  const requested=[];
  const result=await importWebsite('https://example.com/',{resolve:async()=>[{address:'93.184.216.34'}],get:async url=>{requested.push(url.href);return url.pathname==='/'?{status:200,type:'text/html',body:root}:{status:200,type:'text/html',body:`<p>${url.pathname==='\/services'?'Portrait package 20 OMR':'Prices help customers plan.'}</p>`};}});
  assert.deepEqual(requested,['https://example.com/','https://example.com/services','https://example.com/pricing']);
  assert.equal(result.pages.length,3);assert.equal(result.extracted.entries[0].prices[0].currency,'OMR');
  assert.match(result.text,/Prices help customers plan/);
});
test('catalog text and local text files become owner-reviewable service drafts',async()=>{
  const entries=extractCatalogRows('Haircut - 12 OMR | تنظيف الأسنان 25 ريال','menu.csv');
  assert.equal(entries.length,2);assert.equal(entries[0].nameEn,'Haircut');assert.equal(entries[1].nameAr,'تنظيف الأسنان');
  const bytes=new TextEncoder().encode('Consultation - 30 OMR');
  const file={name:'prices.csv',type:'text/csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer};
  const parsed=await readCatalogFile(file);assert.equal(parsed.entries[0].source,'prices.csv');assert.equal(parsed.entries[0].prices[0].label,'30 OMR');
  assert.equal(extractCatalogFacts('Delivery service helps customers. Express delivery 5 OMR').entries.length,1);
});
test('reviewed FAQs are exact normalized answers and unknown queries still fall back',()=>{
  const profile={businessName:'Studio',...validateReviewProfile({sector:'Studio',services:'Portraits',reviewed:true,faqs:[{question:'Do you deliver photos?',answer:'Digital delivery in two days.'}]})};
  assert.equal(previewAnswer('Do you deliver photos',profile).text,'Digital delivery in two days.');
  assert.deepEqual(previewAnswer('Do you deliver photos?',profile).sourceFields,['faqs']);
  assert.equal(previewAnswer('Can you fly a plane?',profile).needsHuman,true);
  assert.throws(()=>validateReviewProfile({...profile,faqs:[{question:'',answer:'bad'}]}));
});
