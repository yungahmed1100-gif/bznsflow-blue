// UI rehearsal only: all provider/API responses are synthetic, external traffic blocked.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const BASE=process.argv[2] || 'http://127.0.0.1:5199';
await mkdir('work/review-onboarding',{recursive:true});
const browser=await chromium.launch();let checks=0;
try {
  for(const lang of ['en','ar']) {
    const ar=lang==='ar',t=(en,arabic)=>ar?arabic:en;
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
    const calls=[],errors=[];let connected=false,active=false;
    const state={available:true,account:{email:'reviewer@example.test'},accountSaveAvailable:true,savedToAccount:true,journeyStep:2,profileVersion:1,
      profile:{businessName:'Review Studio',sector:'Studio',services:'Portrait photography',humanContact:'team@example.test',prices:'',hours:'',location:'',faqs:[],reviewed:true},integration:null};
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.origin!==BASE) return route.abort();
      if(u.pathname==='/api/layla-meta') {
        const body=route.request().postDataJSON() || {},surface=u.searchParams.get('surface');calls.push({surface,...body});
        let result=state;
        if(surface==='customer') {
          if(body.action==='preview') state.lastPreview={text:'Portrait photography',question:body.text,sourceFields:['services']};
          if(body.action==='save_progress') state.journeyStep=body.journeyStep;
          if(body.action==='catalog_list') result={...state,catalog:{entries:[],cursor:null}};
        } else if(surface==='instagram') {
          if(body.action==='connect') {
            connected=true;
            // Stand-in for returning from the external provider. Never used as review evidence.
            result={url:`${BASE}/${ar?'':'en/'}layla/setup?instagram=connected`};
          } else result={connection:connected?{username:'bznsflow',status:'connected'}:null,active,sendingEnabled:true};
        } else if(surface==='messaging') {
          if(body.action==='activate') active=true;
          result={active,available:true};
        } else if(surface==='dashboard') {
          result=body.action?{items:[],cursor:null}:{connected:true,business:{name:'Review Studio'},integration:null,instagram:{username:'bznsflow',status:'connected'},messaging:{limits:{}},qualification:{fields:[]},broadcastEnabled:false};
        }
        return route.fulfill({json:{ok:true,csrfToken:'a'.repeat(64),...result}});
      }
      if(u.pathname.startsWith('/api/')) return route.fulfill({status:404,json:{ok:false}});
      return route.continue();
    });
    await page.goto(`${BASE}/${ar?'':'en/'}layla/setup`);
    // Saved, confirmed facts open straight on the channels step: no preview approval.
    await page.getByRole('heading',{name:t('Connect your channels','ربط قنواتك'),exact:true}).waitFor();checks++;
    assert.equal(await page.getByRole('button',{name:t('The answer looks right','الإجابة مناسبة')}).count(),0,'no approval step');checks++;
    const ig=page.getByRole('region',{name:'Instagram',exact:true});
    await ig.getByRole('button',{name:t('Connect Instagram','ربط إنستغرام'),exact:true}).click();
    await page.waitForURL(/instagram=connected/);
    await ig.getByText('@bznsflow',{exact:true}).waitFor();checks++;
    await ig.getByRole('button',{name:t('Check connection','تحقق من الاتصال'),exact:true}).click();
    await ig.getByText(t('Instagram connection is healthy.','اتصال إنستغرام سليم.'),{exact:true}).waitFor();checks++;
    await ig.getByRole('button',{name:t('Activate replies','تفعيل الردود'),exact:true}).click();
    await ig.getByText(t('Instagram replies are active.','ردود إنستغرام مفعّلة.'),{exact:true}).waitFor();checks++;
    assert.equal(calls.some(c=>c.action==='begin' || c.action==='finish'),false,'No WhatsApp authorization required');checks++;
    await page.screenshot({path:`work/review-onboarding/${lang}-connected.png`,fullPage:true});
    await ig.getByRole('link',{name:t('Open inbox','فتح المحادثات')}).click();
    await page.getByRole('heading',{name:t('Chats','المحادثات'),exact:true}).waitFor();checks++;
    assert.deepEqual(errors,[]);checks++;
    await context.close();
  }
  console.log(`${checks} review onboarding checks passed. Synthetic UI rehearsal; no Meta consent or delivery evidence.`);
} finally {await browser.close();}
