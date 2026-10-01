import { signupInit } from './layla-signup.js';

// Loads Meta's JavaScript SDK once per page. A failed load is retried on the next call.
let sdkPromise;
const SDK_TIMEOUT_MS = 15000;
export function loadFacebook() {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://connect.facebook.net/en_US/sdk.js'; script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('meta_sdk_unavailable')); };
    const timer = setTimeout(fail, SDK_TIMEOUT_MS);
    script.onload = () => { clearTimeout(timer); if (window.FB) resolve(); else fail(); };
    script.onerror = fail; document.head.appendChild(script);
  }).catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}

// FB.login must run synchronously inside the click that opens Meta's window, or
// browsers block the popup. The SDK is therefore initialised before that click.
export async function prepareFacebook(prepared) {
  await loadFacebook();
  window.FB.init(signupInit(prepared));
}
