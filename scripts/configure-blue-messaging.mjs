// Provision only the dedicated Blue worker secret; never print secret values.
import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
const root=new URL('..',import.meta.url);
const project=JSON.parse(readFileSync(new URL('.vercel/project.json',root),'utf8'));
if(project.projectId!=='prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q') throw Error('Wrong Blue project');
const path=new URL('.env.blue-worker.local',root);
if(!existsSync(path)) writeFileSync(path,`BLUE_MESSAGING_WORKER_SECRET=${randomBytes(32).toString('hex')}\n`,{mode:0o600,flag:'wx'});
chmodSync(path,0o600);
const secret=parseEnv(readFileSync(path,'utf8')).BLUE_MESSAGING_WORKER_SECRET;
if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Invalid worker key');
function run(command,args,input) {
  const result=spawnSync(command,args,{cwd:root,input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  if(result.status!==0)throw Error('Blue configuration failed; provider output suppressed to protect credentials');
}
run('node_modules/.bin/convex',['env','set','BLUE_MESSAGING_WORKER_SECRET','--deployment','quaint-nightingale-675'],secret);
run('vercel',['env','add','BLUE_MESSAGING_WORKER_SECRET','production','--force','--sensitive'],secret);
run('vercel',['env','add','BLUE_LIVE_MESSAGING_ENABLED','production','--force'],process.argv.includes('--enable')?'true':'false');
console.log(`Blue worker configured; live environment flag ${process.argv.includes('--enable')?'enabled':'disabled'}. Deployment and durable global activation are separate.`);
