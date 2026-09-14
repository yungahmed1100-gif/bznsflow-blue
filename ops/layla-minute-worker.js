// Cloudflare scheduled handler. No public trigger, payload, credential logging
// or provider access. The durable Vercel worker enforces all messaging limits.
export default {
  async scheduled(_event, env) {
    if (!env.LAYLA_META_WORKER_SECRET) throw new Error('worker_configuration_missing');
    let response;
    try {
      response = await fetch('https://www.bznsflowai.com/api/layla-meta-worker', {
        // Inspect redirects explicitly; never forward the bearer credential.
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(55000),
        headers: { Authorization: `Bearer ${env.LAYLA_META_WORKER_SECRET}` },
      });
    } catch (error) {
      // Only fixed categories leave this boundary, never exception messages.
      const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'worker_timeout'
        : error?.name === 'TypeError' ? 'worker_request_failed' : 'worker_unavailable';
      throw new Error(reason);
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('worker_redirect_rejected');
    }
    if (!response.ok) throw new Error(`worker_http_${response.status}`);
    // The worker endpoint returns only sanitized aggregate status.
    await response.body?.cancel();
  },
  fetch() { return new Response('Not found', { status: 404 }); },
};
