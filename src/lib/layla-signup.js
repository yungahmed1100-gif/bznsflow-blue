// Meta's SDK can default to FedCM through app configuration. That path does
// not support Login for Business config_id/code responses (verified 2026-09-12).
export function signupInit(prepared) {
  return {appId:prepared.appId,autoLogAppEvents:false,xfbml:false,version:prepared.version,fedCM:false};
}

// Embedded Signup and Graph API versions are independent.
export function signupOptions(prepared) {
  // Keep extras object-shaped, as in the supplied Meta sample.
  return { config_id: prepared.configId, auth_type: 'rerequest', response_type: 'code', override_default_response_type: true,
    extras: { setup: signupSetup(prepared), version: signupVersion(prepared), sessionInfoVersion: '3', ...(prepared.path === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' } : {}) } };
}

// The existing-API path uses the business-first flow (portfolio → WABA → number), as
// Tech Providers like Twilio do; the server names the version. Other paths stay on v4.
const SIGNUP_VERSIONS = ['v2', 'v3', 'v4'];
function signupVersion({ path, esVersion }) {
  return path === 'existing_cloud' && SIGNUP_VERSIONS.includes(esVersion) ? esVersion : 'v4';
}

// Meta's phone-number-first flow scopes its number list to one business portfolio.
// Pre-filling the owner's portfolio and WABA opens the flow on the right assets.
// Coexistence keeps Meta's own WhatsApp Business app screens.
function signupSetup({ path, preselect }) {
  if (path === 'coexistence' || !preselect) return {};
  return { ...(preselect.business ? { business: { id: preselect.business } } : {}), ...(preselect.waba ? { whatsAppBusinessAccount: { ids: [preselect.waba] } } : {}) };
}

export function signupEvent(event, path) {
  if (!['https://www.facebook.com', 'https://web.facebook.com', 'https://facebook.com'].includes(event.origin)) return null;
  let payload;
  try { payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return null; }
  if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return null;
  if (['CANCEL', 'ERROR'].includes(payload.event)) return { cancelled: true };
  // Coexistence and existing API numbers may finish with only a WABA; the server then lists its numbers.
  const expected = path === 'coexistence' ? ['FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'] : path === 'existing_cloud' ? ['FINISH', 'FINISH_ONLY_WABA'] : ['FINISH'];
  const phoneOptional = path === 'coexistence' || path === 'existing_cloud';
  if (!expected.includes(payload.event) || !/^\d{1,30}$/.test(payload.data?.waba_id || '') || (payload.data?.phone_number_id ? !/^\d{1,30}$/.test(payload.data.phone_number_id) : !phoneOptional)) return null;
  return { assets: { waba: payload.data.waba_id, ...(payload.data.phone_number_id ? { phone: payload.data.phone_number_id } : {}) } };
}

// One coordinator belongs to one popup attempt. Both SDK callback orders are
// supported; only messages from the captured popup can contribute assets.
export function createSignupAttempt({ prepared, complete, failed, now = Date.now }) {
  let popup, code, assets, settled = false;
  const fail = reason => { if (settled) return; settled = true; code = undefined; assets = undefined; failed(reason); };
  const finish = () => {
    if (settled) return;
    if (now() >= prepared.expiresAt) return fail('attempt_expired');
    if (!code || !assets) return;
    settled = true;
    const body = {action:'finish',attempt:prepared.attempt,state:prepared.state,code,...assets};
    code = undefined; assets = undefined;
    Promise.resolve().then(() => complete(body)).catch(() => failed('review_backend_unavailable')).finally(() => { delete body.code; });
  };
  return {
    capture(value) { popup = value; if (!popup) fail('popup_blocked'); },
    callback(response) {
      if (settled) return;
      if (typeof response?.authResponse?.code !== 'string' || !response.authResponse.code) return fail(response?.status === 'not_authorized' ? 'permission_rejected' : 'missing_code');
      code = response.authResponse.code; finish();
    },
    message(event) {
      if (settled || !popup || event.source !== popup) return;
      const result = signupEvent(event,prepared.path);
      if (!result) return;
      if (result.cancelled) return fail('meta_cancelled');
      assets = result.assets; finish();
    },
    cancel: fail,
    dispose() { settled = true; code = undefined; assets = undefined; popup = undefined; },
  };
}
