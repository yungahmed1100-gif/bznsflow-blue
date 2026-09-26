// Runs every synthetic browser suite against one local Vite server.
//
//   npm run test:browser
//
// None of these touch Meta, Convex or a real account: each suite either mocks
// /api/layla-meta or aborts non-local traffic. They need Playwright's Chromium.
import { spawn, spawnSync } from 'node:child_process';

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const SUITES = [
  'tests/onboarding-browser.mjs',
  'tests/review-onboarding-browser.mjs',
  'tests/instagram-browser.mjs',
  'tests/layla-dashboard-browser.mjs',
];

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const stop = () => { if (!server.killed) server.kill(); };
process.on('exit', stop);

async function waitForServer(deadline = Date.now() + 30000) {
  while (Date.now() < deadline) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Vite did not start on ${BASE}`);
}

try {
  await waitForServer();
  const failed = [];
  for (const suite of SUITES) {
    console.log(`\n▶ ${suite}`);
    const { status } = spawnSync('node', [suite, BASE], { stdio: 'inherit' });
    if (status !== 0) failed.push(suite);
  }
  console.log(failed.length ? `\n✗ failed: ${failed.join(', ')}` : `\n✓ all ${SUITES.length} browser suites passed`);
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stop();
}
