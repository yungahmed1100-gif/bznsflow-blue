// Reads only Blue's local email configuration and installs it without logging secrets.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
const project=JSON.parse(readFileSync(new URL('../.vercel/project.json',import.meta.url),'utf8'));
if(project.projectId!=='prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q') throw Error('Wrong project');
const source=parseEnv(readFileSync(new URL('../.env.local',import.meta.url),'utf8'));
if(!/^re_[\w-]{10,}$/.test(source.BLUE_RESEND_API_KEY || '')) throw Error('Blue Resend key missing or malformed');
if(source.BLUE_AUTH_FROM !== 'BznsFlow <onboarding@bznsflowai.com>') throw Error('Unexpected Blue sender');
for(const [name,value] of Object.entries({BLUE_RESEND_API_KEY:source.BLUE_RESEND_API_KEY,BLUE_AUTH_FROM:source.BLUE_AUTH_FROM,BLUE_ACCOUNT_SAVE_ENABLED:'true'})) {
  const result=spawnSync('vercel',['env','add',name,'production','--force',...(name==='BLUE_RESEND_API_KEY'?['--sensitive']:[])],{cwd:new URL('..',import.meta.url),input:value,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  if(result.status!==0) throw Error(`Failed to configure ${name}; no secret output retained`);
  console.log(`Configured ${name} in Blue Production`);
}
