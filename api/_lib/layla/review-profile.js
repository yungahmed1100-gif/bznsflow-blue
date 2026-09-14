import { PilotError } from './config.js';
import { answer } from './domain.js';

const fields = ['sector', 'services', 'prices', 'hours', 'location', 'humanContact'];
export function validateReviewProfile(input) {
  if (!input || input.reviewed !== true) throw new PilotError('profile_unreviewed', 409);
  const profile = { reviewed: true };
  for (const field of fields) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > (field === 'humanContact' ? 120 : 350) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new PilotError('invalid_profile');
    profile[field] = value.trim();
  }
  if (!profile.sector || !profile.services) throw new PilotError('invalid_profile');
  const faqs = input.faqs || [];
  if (!Array.isArray(faqs) || faqs.length > 12 || faqs.some(f=>!f || typeof f.question !== 'string' || !f.question.trim() || f.question.length>200 || typeof f.answer !== 'string' || !f.answer.trim() || f.answer.length>700)) throw new PilotError('invalid_profile');
  profile.faqs = faqs.map(f=>({question:f.question.trim(),answer:f.answer.trim()}));
  return profile;
}
export function previewAnswer(question, profile, catalog = []) {
  const normalize = text => text.toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/[\p{P}\p{Z}\s]+/gu,' ').trim();
  const faq = profile.faqs?.find(f=>normalize(f.question) === normalize(question));
  if (faq) return {question,text:faq.answer,sourceFields:['faqs'],needsHuman:false,intent:'faq'};
  const q=normalize(question), ar=/[\u0600-\u06ff]/.test(question);
  const item=catalog.find(row=>[row.nameEn,row.nameAr].filter(Boolean).some(name=>q.includes(normalize(name))));
  if(item){const price=item.prices?.[0],name=(ar?item.nameAr:item.nameEn)||item.nameEn||item.nameAr;const benefit=(ar?item.benefitAr:item.benefitEn)||item.descriptionEn||item.descriptionAr;const priceText=price?.label||'';const text=[name,benefit,priceText].filter(Boolean).join(' — ');return {question,text:text.slice(0,700),sourceFields:['catalog'],needsHuman:!price&&/سعر|تكلفة|بكم|price|cost|how much/i.test(question),intent:price?'prices':'services'};}
  const result = answer(question, profile, true);
  const sourceFields = ['services', 'prices', 'hours', 'location'].includes(result.intent) && profile[result.intent] ? [result.intent] : [];
  const needsHuman = ['human', 'unknown', 'disabled'].includes(result.intent) || (['services','prices','hours','location'].includes(result.intent) && !sourceFields.length);
  let text = result.text;
  if (['greeting', 'identity'].includes(result.intent)) text = ar ? `أنا ليلى، المساعدة الافتراضية لدى ${profile.businessName}. كيف أساعدك؟` : `I’m Layla, the virtual assistant for ${profile.businessName}. How can I help?`;
  if (result.intent === 'optout') text = ar ? 'هذه معاينة فقط. لن نرسل أي رسائل واتساب.' : 'This is a preview. No WhatsApp messages will be sent.';
  if (needsHuman && !profile.humanContact) text += ar ? ' أضف جهة اتصال للفريق قبل تفعيل الردود.' : 'Add your team’s contact details before activating replies.';
  return { question, text, sourceFields, needsHuman, intent: result.intent };
}
