const CLINICAL = /(?:pain|hurt|bleed|swollen|fever|diagnos|prescri|medicine|dose|allerg|treat(?:ment)?|symptom|lab\s*result|x[- ]?ray|ألم|وجع|نزيف|تورم|حمى|تشخيص|وصفة|دواء|جرعة|حساسية|علاج|أعراض|تحاليل|أشعة)/iu;
const CLINIC_SECTOR = /(?:medical\s+clinic|dental|clinic|عياد|أسنان)/iu;

export const isClinicSector = profile => CLINIC_SECTOR.test(String(profile?.sector || profile || ''));
export const containsClinicalContent = text => typeof text === 'string' && CLINICAL.test(text);
export const clinicSafetyMessage = language => language === 'ar'
  ? 'لا أستطيع التعامل مع الأعراض أو التشخيص أو العلاج هنا. سيتابع معك موظف الاستقبال. للحالات الطارئة في عُمان اتصل على 9999.'
  : 'I cannot handle symptoms, diagnosis, or treatment here. Reception will follow up. For emergencies in Oman, call 9999.';

export function clinicIngressDecision(text, profile) {
  const withheld = isClinicSector(profile) && containsClinicalContent(text);
  return { withheld, language:/[؀-ۿ]/u.test(String(text||''))?'ar':'en' };
}
