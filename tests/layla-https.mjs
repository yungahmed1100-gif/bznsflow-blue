// Public read-only/negative ingress checks. Never fetch or print credentials.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const base = new URL(process.argv[2] || 'https://www.bznsflowai.com');
if (base.protocol !== 'https:') throw new Error('HTTPS required');
const existingOnly = process.argv.includes('--existing');
const cases = [
  ['/', 'GET', 200], ['/signin', 'GET', 200], ['/owner/layla', 'GET', 200], ['/api/auth-session', 'GET', 200],
  ['/api/layla-meta', 'GET', 401], ['/api/layla-meta-readiness', 'GET', 401],
  ...existingOnly ? [] : [['/api/layla-meta-activation', 'GET', 401], ['/api/layla-meta-test', 'GET', 401]],
  ['/api/layla-meta-webhook?hub.mode=subscribe&hub.verify_token=invalid-test-token&hub.challenge=negative-test', 'GET', 403],
  ['/api/layla-meta-webhook', 'POST', 403],
];
const results = await Promise.all(cases.map(async ([path, method, expected]) => {
  try {
    const args = ['--ipv4', '--silent', '--show-error', '--max-time', '15', '--retry', '2', '--retry-delay', '0', '--retry-all-errors', '--output', '/dev/null', '--write-out', '%{http_code} %{redirect_url}',
      '--request', method, ...(method === 'POST' ? ['--header', 'Content-Type: application/json', '--data', '{}'] : [])];
    const { stdout } = process.argv.includes('--vercel')
      ? await run('vercel', ['curl', path, '--deployment', base.origin, '--', ...args])
      : await run('curl', [...args, new URL(path, base).href]);
    const [status, redirect] = stdout.trim().split(' ');
    return { path: path.split('?')[0], method, status: Number(status), expected, noRedirect: !redirect, passed: Number(status) === expected && !redirect };
  } catch { return { path: path.split('?')[0], method, passed: false, reason: 'connection_unavailable' }; }
}));
for (const result of results) console.log(JSON.stringify(result));
if (results.some(r => !r.passed)) process.exitCode = 1;
