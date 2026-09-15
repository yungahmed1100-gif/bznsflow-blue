// A tab opened before a redeploy still asks for the old build's files. Vercel answers
// those with an HTML 404, and vite-react-ssg's router parses its loader manifest as
// JSON, so the first in-app navigation crashed with "Unexpected token '<'".
// Reload once to pick up the current build; if the file is still missing, render
// without prerendered loader data instead of crashing.
const MANIFEST = /\/static-loader-data-manifest-[a-z0-9]+\.json(?:[?#]|$)/i;

function reloadOnce(win, key) {
  try {
    if (win.sessionStorage.getItem(key)) return false;
    win.sessionStorage.setItem(key, '1');
  } catch {
    return false;
  }
  win.location.reload();
  return true;
}

export function installDeploySkewGuard(win = typeof window === 'undefined' ? undefined : window) {
  if (!win?.fetch || win.__bznsflowDeployGuard) return;
  win.__bznsflowDeployGuard = true;
  const original = win.fetch.bind(win);
  win.fetch = async (input, init) => {
    const response = await original(input, init);
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (!MANIFEST.test(url)) return response;
    if (response.ok && /json/i.test(response.headers.get('content-type') || '')) return response;
    // Hold the router while the page reloads, so no error screen flashes.
    if (reloadOnce(win, `bznsflow-deploy-reload:${url}`)) return new Promise(() => {});
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  // Vite raises this when a lazily loaded chunk from the previous build is gone.
  win.addEventListener('vite:preloadError', event => {
    if (reloadOnce(win, `bznsflow-chunk-reload:${win.location.pathname}`)) event.preventDefault();
  });
}
