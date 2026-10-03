// Layla's setup help answers the situations real owners get stuck in, in English and Arabic
// (including Gulf phrasing), and hands anything unrecognised to the team instead of guessing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, SUGGESTED, SUGGESTION_LABELS, matchScenario, setupHelpReply } from '../src/lib/onboarding/setupHelp.js';

const CASES = [
  ['I only have normal WhatsApp, not the business one', 'regular_whatsapp'],
  ['انا استخدم الواتساب العادي مو حق الاعمال', 'regular_whatsapp'],
  ['how do i know which whatsapp i have?', 'which_app'],
  ['كيف اعرف اي واتساب عندي', 'which_app'],
  ['it says my app version is too old', 'update_app'],
  ['يقول لازم تحديث التطبيق', 'update_app'],
  ["I don't have facebook", 'no_facebook'],
  ['ما عندي فيسبوك ابدا', 'no_facebook'],
  ['I forgot my facebook password', 'forgot_facebook'],
  ['نسيت كلمة السر حق الفيس', 'forgot_facebook'],
  ['do I need a meta business account or a facebook page?', 'no_business_account'],
  ['لازم يكون عندي حساب أعمال في ميتا؟', 'no_business_account'],
  ['it asks me to choose a business portfolio', 'no_business_account'],
  ['where do I scan the QR code', 'qr_code'],
  ['كيف امسح الباركود', 'qr_code'],
  ["I didn't get the message from facebook", 'no_message'],
  ['ما وصلني اي شي من فيسبوك', 'no_message'],
  ['I press the button and nothing happens', 'popup'],
  ['اضغط الزر ما يفتح شي', 'popup'],
  ['the facebook window says the feature is invalid', 'facebook_error'],
  ['طلع لي خطأ في نافذة فيسبوك', 'facebook_error'],
  ['will I lose my chats?', 'lose_chats'],
  ['محادثاتي بتنحذف؟', 'lose_chats'],
  ['how much does it cost?', 'cost'],
  ['هل هو مجاني ولا لازم ادفع', 'cost'],
  ['I have two numbers, which number should I use', 'which_number'],
  ['عندي رقمين اي رقم اربط', 'which_number'],
  ['my number is already connected to twilio', 'other_provider'],
  ['I got a new phone and Layla stopped', 'changed_phone'],
  ['غيرت الجوال ووقفت ليلى', 'changed_phone'],
  ['what is the team contact number for?', 'team_contact'],
  ['the sign in code email never arrived', 'email_code'],
  ['the button is greyed out and I cant press it', 'stuck_checklist'],
  ['الزر رمادي ما اقدر اضغط', 'stuck_checklist'],
  ['how long does this take?', 'how_long'],
  ['is it safe? do you see my password?', 'safe'],
  ['do I need commercial registration documents?', 'verification'],
  ['how do I stop layla if she gives a wrong answer', 'pause_layla'],
  ['can I connect instagram too', 'instagram'],
  ['can someone just do it for me', 'human_help'],
  ['ساعدوني ابي احد يكلمني', 'human_help'],
];

test('Layla recognises the situations owners actually get stuck in, in English and Arabic', () => {
  const misses = CASES.filter(([q, id]) => matchScenario(q)?.id !== id).map(([q, id]) => `${q} → ${matchScenario(q)?.id ?? 'none'} (want ${id})`);
  assert.deepEqual(misses, []);
});

test('every scenario answers in both languages, and the suggested questions exist', () => {
  for (const s of SCENARIOS) {
    assert.ok(s.en.length > 20 && s.ar.length > 20, s.id);
    assert.match(s.ar, /[؀-ۿ]/, `${s.id} Arabic`);
    assert.ok(s.words.length >= 3, `${s.id} has phrasings`);
  }
  for (const id of SUGGESTED) { assert.ok(SCENARIOS.some(s => s.id === id), id); assert.equal(SUGGESTION_LABELS[id].length, 2); }
});

test('an unrecognised question goes to the team with the question attached, never a guess', () => {
  const r = setupHelpReply('what is the meaning of life', 'en', 'S-123');
  assert.equal(r.handoff, true);
  assert.match(r.handoffContext, /S-123/);
  assert.match(r.handoffContext, /meaning of life/);
  const known = setupHelpReply('هل هو مجاني؟', 'ar');
  assert.equal(known.handoff, false);
  assert.match(known.reply, /رسوم|فوترة/);
  assert.equal(setupHelpReply('it says error invalid', 'en').handoff, true, 'a Facebook error offers the team');
});

test('support handoff never echoes likely passwords, PINs, tokens or verification codes', () => {
  for (const question of ['My Facebook password is hunter2', 'the OTP is 123456', 'my WhatsApp PIN 908172', 'رمز التحقق ١٢٣٤٥٦', 'كلمة المرور abc123', 'my email is me@example.com', 'رقمي ٩٦٨٩٢١٨٣٥٠٢']) {
    const r = setupHelpReply(question, question.includes('رمز') || question.includes('كلمة') ? 'ar' : 'en');
    assert.equal(r.handoff, true);
    assert.doesNotMatch(r.handoffContext, /hunter2|123456|908172|١٢٣٤٥٦|abc123|me@example\.com|٩٦٨٩٢١٨٣٥٠٢/i, question);
  }
});
