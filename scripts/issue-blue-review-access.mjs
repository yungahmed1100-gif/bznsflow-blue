// Creates an isolated reviewer account and saves its expiring link locally.
// The link is a credential: supply it only in the Meta review access field.
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('..',import.meta.url);
const project=JSON.parse(readFileSync(new URL('.vercel/project.json',root),'utf8'));
if(project.projectId!=='prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q')throw Error('Wrong project');
const path=new URL('.env.blue-review-access.local',root);
if(existsSync(path))throw Error('Reviewer access already exists locally; do not overwrite an issued credential');
const access=randomBytes(32).toString('hex'),accessHash=createHash('sha256').update(access).digest('hex');
const result=spawnSync('node_modules/.bin/convex',['run','blueAuth:issueReviewAccess',JSON.stringify({accessHash}),'--deployment','quaint-nightingale-675'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
if(result.status!==0)throw Error('Reviewer provisioning failed');
writeFileSync(path,`BLUE_REVIEW_ACCESS_URL=https://bznsflow-blue.vercel.app/en/layla/review#access=${access}\n`,{mode:0o600,flag:'wx'});
console.log('Dedicated reviewer access saved in ignored .env.blue-review-access.local; expires after seven days. No access link printed.');
