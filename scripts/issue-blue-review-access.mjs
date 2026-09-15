// Creates an isolated reviewer account and saves its expiring link locally.
// The link is a credential: supply it only in the Meta review access field.
//   node scripts/issue-blue-review-access.mjs            issue a first link
//   node scripts/issue-blue-review-access.mjs --rotate   revoke the saved link, then issue a new one
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('..',import.meta.url);
const project=JSON.parse(readFileSync(new URL('.vercel/project.json',root),'utf8'));
if(project.projectId!=='prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q')throw Error('Wrong project');
const path=new URL('.env.blue-review-access.local',root);
const rotate=process.argv.includes('--rotate');
const hashOf=access=>createHash('sha256').update(access).digest('hex');
const convex=(fn,args)=>spawnSync('node_modules/.bin/convex',['run',fn,JSON.stringify(args),'--deployment','quaint-nightingale-675'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});

if(existsSync(path)){
  if(!rotate)throw Error('Reviewer access already exists locally; pass --rotate to revoke it and issue a new link');
  const saved=/#access=([a-f0-9]{64})\s*$/.exec(readFileSync(path,'utf8'))?.[1];
  if(!saved)throw Error('Saved reviewer access is unreadable; revoke it manually before rotating');
  if(convex('blueAuth:revokeReviewAccess',{accessHash:hashOf(saved)}).status!==0)throw Error('Revoking the saved reviewer access failed; nothing was changed');
  unlinkSync(path);
  console.log('Previous reviewer access revoked.');
}

const access=randomBytes(32).toString('hex');
const result=convex('blueAuth:issueReviewAccess',{accessHash:hashOf(access)});
if(result.status!==0)throw Error('Reviewer provisioning failed');
const expiresAt=JSON.parse(result.stdout.trim()||'{}').expiresAt;
writeFileSync(path,`BLUE_REVIEW_ACCESS_URL=https://bznsflow-blue.vercel.app/en/layla/review#access=${access}\n`,{mode:0o600,flag:'wx'});
console.log(`Dedicated reviewer access saved in ignored .env.blue-review-access.local; expires ${expiresAt?new Date(expiresAt).toISOString().slice(0,10):'after one year'}. No access link printed.`);
