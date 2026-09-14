// SME starter packs. Tenant facts still come from reviewed signup/website data;
// these packs define safe routing vocabulary and consistent bilingual wording.
import { packDescription, qualificationPack, questionText } from './layla-qualification.js';
const booking = ['greeting','services','price','hours_location','appointment_info','preparation','reschedule','cancel','human','optout'];
const catalog = ['greeting','identity','catalog_item','price','availability_request','order_policy','delivery_info','human','optout'];
const project = ['greeting','identity','services','project_scope','quote_requirements','coverage','lead_qualification','human','optout'];
const labels = {
  'real-estate':['project','property listings','قوائم العقارات'], dental:['booking','dental care','رعاية الأسنان'], clinic:['booking','medical care','الرعاية الطبية'],
  hvac:['project','air-conditioning services','خدمات التكييف'], construction:['project','construction services','خدمات المقاولات'], cakes:['catalog','cakes','الكيك'],
  cafe:['catalog','coffee and desserts','القهوة والحلويات'], restaurant:['catalog','restaurant menu and orders','قائمة المطعم والطلبات'], retail:['catalog','products and online orders','المنتجات والطلبات الإلكترونية'],
  beauty:['booking','salon services','خدمات الصالون'], fitness:['booking','fitness and wellness','اللياقة والعافية'], education:['project','courses and training','الدورات والتدريب'],
  automotive:['booking','vehicle services','خدمات السيارات'], logistics:['project','delivery services','خدمات التوصيل'], travel:['project','travel and hospitality','السفر والضيافة'],
  events:['project','events and weddings','المناسبات والأعراس'], legal:['booking','legal services','الخدمات القانونية'], finance:['booking','accounting and finance','المحاسبة والمالية'],
  marketing:['project','marketing services','خدمات التسويق'], technology:['project','software services','خدمات البرمجيات'], manufacturing:['project','manufacturing products','منتجات التصنيع'], cleaning:['booking','cleaning services','خدمات التنظيف']
};
const core = (id, archetype, en, ar) => ({
  id, archetype, intents: archetype === 'booking' ? booking : archetype === 'catalog' ? catalog : project,
  slots: archetype === 'catalog' ? ['product','quantity','delivery_area'] : archetype === 'booking' ? ['service','date','time','branch'] : ['service','project_type','area','budget'],
  templates: {
    greeting:{en:`Hello — how can I help with ${en}?`,ar:`مرحباً — كيف يمكنني مساعدتك بخصوص ${ar}؟`},
    services:{en:`We can share confirmed information about ${en}. Tell me what you need and I’ll check the approved details.`,ar:`يمكنني تزويدك بالمعلومات المؤكدة عن ${ar}. أخبرني بما تحتاج وسأتحقق من التفاصيل المعتمدة.`},
    price:{en:'I can confirm the price from the approved business information. Which service or item are you asking about?',ar:'يمكنني تأكيد السعر من معلومات النشاط المعتمدة. ما الخدمة أو المنتج الذي تسأل عنه؟'},
    human:{en:'I’ll connect you with the team so they can help you directly.',ar:'سأوصلك مع الفريق ليساعدك مباشرة.'},
    missing:{en:'I don’t have a confirmed answer for that yet. I can connect you with the team.',ar:'لا تتوفر لدي إجابة مؤكدة عن ذلك حالياً. يمكنني توصيلك مع الفريق.'}
  },
  fallback:{maxClarifications:1, similarityFloor:0.72, afterHours:{en:'The team will follow up during working hours.',ar:'سيتابع الفريق معك خلال ساعات العمل.'}},
  // Required fields plus the grouped prompts Layla appends after answering.
  qualification:{...packDescription(id), prompts:qualificationPack(id).groups.map(group=>{
    const fields=group.map(key=>qualificationPack(id).fields.find(f=>f.key===key)).filter(f=>f.required);
    return {fields:fields.map(f=>f.key), en:questionText(fields,'en'), ar:questionText(fields,'ar')};
  }).filter(p=>p.fields.length)}
});
export const SECTOR_PACKS = Object.fromEntries(Object.entries(labels).map(([id,[archetype,en,ar]]) => [id, core(id,archetype,en,ar)]));
export const PRIMARY_SECTOR_IDS = Object.keys(SECTOR_PACKS);
export function sectorPack(id) { return SECTOR_PACKS[id] || null; }
