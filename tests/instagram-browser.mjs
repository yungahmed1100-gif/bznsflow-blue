// Synthetic browser rehearsal. All external requests are blocked; no Meta messages.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE=process.argv[2] || 'http://127.0.0.1:5199';
await mkdir('work/instagram-browser',{recursive:true});
const browser=await chromium.launch();
let checks=0;
try {
  for(const lang of ['en','ar']) for(const width of [375,1280]) {
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
    const errors=[],calls=[];let active=false,connected=true;
    page.on('pageerror',e=>errors.push(e.message));
    const contact={id:'contact1',channel:'instagram',igId:'178900000000001',name:'Instagram Customer',nameSource:'instagram',source:'inbound',status:'new',fields:[],consent:{status:'unknown'},optout:false};
    const conversation={id:'chat1',channel:'instagram',takeover:false,optout:false,windowOpenUntil:Date.now()-1000};
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.origin!==BASE) return route.abort();
      if(u.pathname==='/api/layla-meta') {
        const surface=u.searchParams.get('surface'),body=route.request().postDataJSON() || {};
        calls.push({surface,...body});
        let result={};
        if(surface==='instagram') {
          if(body.action==='disconnect') connected=false;
          result={connection:connected?{username:'bznsflow',status:'connected'}:{username:'bznsflow',status:'disconnected'},active,sendingEnabled:true};
        } else if(surface==='messaging') {
          if(body.action==='activate') active=true;
          if(body.action==='pause') active=false;
          result={active,available:true};
        } else if(surface==='dashboard' && !body.action) result={connected:true,business:{name:'Blue Studio'},integration:null,instagram:{username:'bznsflow',status:'connected'},messaging:{available:true,active:false,limits:{}},instagramMessaging:{active},qualification:{fields:[]},timezone:'Asia/Muscat',broadcastEnabled:false};
        else if(body.action==='conversations') result={items:[{...conversation,contact,updatedAt:Date.now(),lastMessage:{text:'Hello',at:Date.now(),direction:'in'}}],cursor:null};
        else if(body.action==='thread') result={conversation,contact,messages:[],before:null};
        return route.fulfill({json:{ok:true,csrfToken:'a'.repeat(64),...result}});
      }
      if(u.pathname.startsWith('/api/')) return route.fulfill({status:404,json:{ok:false}});
      return route.continue();
    });
    await page.goto(`${BASE}/${lang==='en'?'en/':''}layla/dashboard?tab=channels`);
    await page.getByRole('heading',{name:lang==='en'?'Your channels':'قنواتك'}).waitFor();checks++;
    await page.getByRole('button',{name:lang==='en'?'Activate replies':'تفعيل الردود',exact:true}).click();
    await page.getByText(lang==='en'?'Instagram replies are active.':'ردود إنستغرام مفعّلة.',{exact:true}).waitFor();
    assert(calls.some(c=>c.action==='activate' && c.channel==='instagram'));checks++;
    await page.getByRole('button',{name:lang==='en'?'Pause replies':'إيقاف الردود',exact:true}).click();
    await page.getByText(lang==='en'?'Instagram replies are paused.':'ردود إنستغرام متوقفة.',{exact:true}).waitFor();checks++;
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
    const violations=(await new AxeBuilder({page}).include('.ld').analyze()).violations.filter(v=>['critical','serious'].includes(v.impact));
    assert.deepEqual(violations.map(v=>v.id),[]);checks++;
    await page.screenshot({path:`work/instagram-browser/${lang}-${width}-channels.png`,fullPage:true});
    await page.locator('a[href="?tab=chats"]').click();
    await page.getByRole('button').filter({hasText:'Instagram Customer'}).click();
    assert.equal(await page.getByRole('button',{name:lang==='en'?'Send a template':'إرسال قالب',exact:true}).count(),0);checks++;
    assert.equal(await page.locator('.ld-composer textarea').count(),0);checks++;
    assert.deepEqual(errors,[]);checks++;
    await context.close();
  }
  console.log(`Instagram browser: ${checks} checks passed (English/Arabic, mobile/desktop).`);
} finally {await browser.close();}
