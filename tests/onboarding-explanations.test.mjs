import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPLANATIONS, explain, instagramReturnMessage } from '../src/lib/onboarding/explanations.js';
import { INSTAGRAM_CALLBACK_REASONS } from '../api/_lib/layla/instagram.js';

test('every setup failure reason is written in both English and Arabic', () => {
  for (const [reason, text] of Object.entries(EXPLANATIONS)) {
    assert.ok(text.en?.trim(), `${reason} has no English`);
    assert.ok(text.ar?.trim(), `${reason} has no Arabic`);
    assert.match(text.ar, /[؀-ۿ]/, `${reason}: the Arabic text is not Arabic`);
  }
});

test('an unknown or inherited reason falls back to the generic message', () => {
  assert.match(explain('no_such_reason', 'en'), /could not finish that step/);
  assert.match(explain('toString', 'ar'), /تعذّر إكمال الخطوة/);
  assert.equal(explain('meta_sdk_unavailable', 'ar'), EXPLANATIONS.meta_sdk_unavailable.ar);
});

test('every reason the Instagram callback may send has a banner in both languages', () => {
  for (const reason of INSTAGRAM_CALLBACK_REASONS) {
    for (const lang of ['en', 'ar']) {
      const text = instagramReturnMessage('connection_failed', reason, lang);
      assert.notEqual(text, instagramReturnMessage('connection_failed', undefined, lang), `${reason} (${lang}) has no specific message`);
    }
  }
  assert.equal(instagramReturnMessage(null, 'asset_in_use', 'en'), null);
  assert.match(instagramReturnMessage('connected', 'asset_in_use', 'en'), /Instagram connected/);
  assert.match(instagramReturnMessage('connection_failed', '<script>', 'en'), /could not finish/);
});

test('connection failures that used to hide behind a generic banner now say what to do', () => {
  for (const reason of ['instagram_subscription_failed', 'instagram_provider_failed', 'instagram_provider_unavailable']) {
    assert.ok(INSTAGRAM_CALLBACK_REASONS.includes(reason), `${reason} reaches the setup page`);
  }
});
