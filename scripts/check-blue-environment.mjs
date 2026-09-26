import { existsSync, readFileSync } from 'node:fs';

export function checkBlue(env, project) {
  if (project && project.projectId !== 'prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q') throw Error('Blue deployment must target bznsflow-blue');
  if (env.VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID !== 'prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q') throw Error('Wrong Vercel project');
  if (env.SUPABASE_URL || env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Blue review uses Convex only');
  const cloud = 'https://quaint-nightingale-675.eu-west-1.convex.cloud';
  for (const key of ['CONVEX_CLOUD_URL','VITE_CONVEX_URL']) if (env[key] && env[key] !== cloud) throw Error('Wrong Blue Convex target');
  if (env.VITE_CONVEX_SITE_URL && env.VITE_CONVEX_SITE_URL !== cloud.replace('.cloud','.site')) throw Error('Wrong Blue Convex HTTP target');
  for (const key of ['LAYLA_META_ACCESS_TOKEN', 'LAYLA_META_WORKER_SECRET', 'CRON_SECRET', 'LEAD_ENDPOINT', 'VITE_LEAD_ENDPOINT', 'GOOGLE_CLIENT_SECRET', 'LINKEDIN_CLIENT_SECRET', 'OPENAI_API_KEY']) {
    if (env[key]) throw Error(`External integration is not enabled for Blue: ${key}`);
  }
  if (env.LAYLA_META_APP_SECRET || env.LAYLA_CUSTOMER_ONBOARDING_ENABLED === 'true') {
    if (env.BLUE_CUSTOMER_SETUP_ENABLED !== 'true' || env.CONVEX_CLOUD_URL !== cloud || !/^[a-f0-9]{64}$/i.test(env.BLUE_REVIEW_SERVICE_SECRET || '') || !/^[a-f0-9]{64}$/i.test(env.LAYLA_CREDENTIAL_ENCRYPTION_KEY || '')) throw Error('Blue customer setup requires isolated storage and verified webhook routing');
  }
  if (env.LAYLA_META_MODE && env.LAYLA_META_MODE !== 'mock') throw Error('Blue must use mock mode');
  if (env.BLUE_LIVE_MESSAGING_ENABLED === 'true' && (env.CONVEX_CLOUD_URL !== cloud || !/^[a-f0-9]{64}$/i.test(env.BLUE_MESSAGING_WORKER_SECRET || '') || !/^[a-f0-9]{64}$/i.test(env.BLUE_REVIEW_SERVICE_SECRET || '') || !/^[a-f0-9]{64}$/i.test(env.LAYLA_CREDENTIAL_ENCRYPTION_KEY || '') || !env.LAYLA_META_APP_SECRET || env.BLUE_ACCOUNT_SAVE_ENABLED !== 'true')) throw Error('Blue live messaging requires isolated account storage and dedicated worker credentials');
  if (env.BLUE_DASHBOARD_ENABLED === 'true' && (env.CONVEX_CLOUD_URL !== cloud || !/^[a-f0-9]{64}$/i.test(env.BLUE_REVIEW_SERVICE_SECRET || '') || env.BLUE_ACCOUNT_SAVE_ENABLED !== 'true')) throw Error('Blue dashboard requires isolated account storage');
  // Broadcast sends real template messages: it needs the dashboard, live messaging and the worker.
  if (env.BLUE_BROADCAST_ENABLED === 'true' && (env.BLUE_DASHBOARD_ENABLED !== 'true' || env.BLUE_LIVE_MESSAGING_ENABLED !== 'true' || !/^[a-f0-9]{64}$/i.test(env.BLUE_MESSAGING_WORKER_SECRET || ''))) throw Error('Blue broadcast requires the dashboard, live messaging and dedicated worker credentials');
  // Hasib lives inside the dashboard and shares its storage and session boundary.
  if (env.BLUE_HASIB_ENABLED === 'true' && env.BLUE_DASHBOARD_ENABLED !== 'true') throw Error('Blue Hasib requires the dashboard');
  if (env.LAYLA_META_KILL_SWITCH === 'false' || env.LAYLA_OPEN_TEST_ENABLED === 'true') throw Error('Blue live controls must remain disabled');
}

if (process.argv[1]?.endsWith('/check-blue-environment.mjs')) {
  const path = new URL('../.vercel/project.json', import.meta.url);
  checkBlue(process.env, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
  console.log('Blue isolation checks passed');
}
