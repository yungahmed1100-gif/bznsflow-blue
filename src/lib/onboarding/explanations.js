// Every customer-facing failure reason on the Layla setup page, in both
// languages. One entry per reason so English and Arabic cannot drift apart:
// a reason added in one language only is a missing translation, and the
// completeness test in tests/onboarding-explanations.test.mjs fails.
export const EXPLANATIONS = {
  sign_in_required: {
    en: "Save your setup with a verified email before connecting WhatsApp.",
    ar: "احفظ إعدادك ببريد إلكتروني موثّق قبل ربط واتساب.",
  },
  customer_invitation_required: {
    en: "The review path is open to Meta reviewers without a BznsFlow invitation.",
    ar: "مسار المراجعة متاح لمراجعي Meta دون دعوة من BznsFlow.",
  },
  customer_onboarding_not_enabled: {
    en: "The review path is open without a BznsFlow invitation. Meta connection is waiting for the Blue test configuration.",
    ar: "مسار المراجعة متاح دون دعوة من BznsFlow. ينتظر ربط Meta إعداد اختبار Blue.",
  },
  coexistence_not_verified: {
    en: "Facebook couldn’t confirm this number is on the WhatsApp Business app. Check you typed the number your shop uses in WhatsApp Business, then try again.",
    ar: "لم يتمكن فيسبوك من التأكد أن هذا الرقم على تطبيق واتساب للأعمال. تأكد أنك كتبت رقم متجرك في واتساب للأعمال ثم حاول مجدداً.",
  },
  business_app_requires_coexistence: {
    en: "This number uses WhatsApp Business. Choose “Keep using my WhatsApp Business app.”",
    ar: "هذا الرقم يستخدم تطبيق واتساب للأعمال. اختر «الاستمرار في استخدام تطبيق واتساب للأعمال».",
  },
  onboarding_in_progress_or_limited: {
    en: "A connection is already in progress, or you have reached the attempt limit. Finish the current connection or try again later.",
    ar: "هناك عملية ربط قيد التنفيذ، أو بلغت حد المحاولات. أكمل الربط الحالي أو حاول لاحقاً.",
  },
  whatsapp_app_update_required: {
    en: "Your WhatsApp Business app is too old. Update it in the App Store or Google Play, then try again.",
    ar: "تطبيق واتساب للأعمال لديك قديم. حدّثه من App Store أو Google Play ثم حاول مجدداً.",
  },
  whatsapp_not_business_app: {
    en: "This number uses regular WhatsApp. Switch it to the free WhatsApp Business app first — your chats move with you — then try again.",
    ar: "هذا الرقم يستخدم واتساب العادي. انقله أولاً إلى تطبيق واتساب للأعمال المجاني (تنتقل محادثاتك معك) ثم حاول مجدداً.",
  },
  draft_expired: {
    en: "This setup was not saved in time and has expired. Enter your business details again; it takes a minute.",
    ar: "انتهت صلاحية هذا الإعداد قبل حفظه. أدخل معلومات نشاطك مجدداً، ولن يستغرق ذلك سوى دقيقة.",
  },
  draft_already_claimed: {
    en: "This setup is already saved to an account. Sign in with that account to continue.",
    ar: "هذا الإعداد محفوظ بالفعل في حساب. سجّل الدخول بذلك الحساب للمتابعة.",
  },
  draft_operation_in_progress: {
    en: "A connection step is still finishing. Wait a few seconds, then press Try again.",
    ar: "خطوة ربط ما زالت قيد الإنهاء. انتظر بضع ثوانٍ ثم اضغط «حاول مجدداً».",
  },
  draft_selection_pending: {
    en: "Choose the WhatsApp number to connect first, or cancel that choice, then save your setup.",
    ar: "اختر رقم واتساب الذي تريد ربطه أولاً أو ألغِ الاختيار، ثم احفظ إعدادك.",
  },
  draft_attempt_active: {
    en: "A Meta connection window is still open. Close or cancel it, then press Try again.",
    ar: "ما زالت نافذة ربط Meta مفتوحة. أغلقها أو ألغِ المحاولة ثم اضغط «حاول مجدداً».",
  },
  draft_details_unconfirmed: {
    en: "Confirm your business details first: tick “I reviewed this business information” and save.",
    ar: "أكّد معلومات نشاطك أولاً: ضع علامة على «راجعت معلومات النشاط هذه» واحفظ.",
  },
  draft_not_claimable: {
    en: "Finish or cancel the current Meta operation, then save your setup again. Your account is already signed in.",
    ar: "أكمل عملية Meta الحالية أو ألغها، ثم احفظ إعدادك مجدداً. حسابك مسجّل الدخول بالفعل.",
  },
  too_soon: {
    en: "Please wait one minute before requesting another code.",
    ar: "انتظر دقيقة قبل طلب رمز آخر.",
  },
  too_many: {
    en: "Too many attempts. Please wait before trying again.",
    ar: "محاولات كثيرة. انتظر قبل إعادة المحاولة.",
  },
  code_invalid: {
    en: "This sign-in code is invalid or expired. Check it or request a new code.",
    ar: "رمز الدخول غير صحيح أو انتهت صلاحيته.",
  },
  send_failed: {
    en: "The sign-in email could not be confirmed. Please wait before requesting another code.",
    ar: "تعذّر تأكيد إرسال رمز الدخول. انتظر قبل طلب رمز جديد.",
  },
  account_unavailable: {
    en: "Account saving is not available yet. Your website preview still works.",
    ar: "حفظ الحساب غير متاح حالياً. يمكنك متابعة المعاينة.",
  },
  refresh_throttled: {
    en: "Please wait a few seconds before checking again.",
    ar: "انتظر بضع ثوانٍ قبل التحقق مجدداً.",
  },
  profile_changed: {
    en: "Your business facts changed while this was loading. Try again.",
    ar: "تغيّرت معلومات النشاط أثناء التحميل. حاول مجدداً.",
  },
  test_routing_not_verified: {
    en: "This number has an existing connection. Assisted setup is needed to preserve its routing.",
    ar: "الرقم مرتبط بإعداد آخر. نحتاج إلى مساعدتك على الربط دون تعطيل الاتصال الحالي.",
  },
  meta_connection_unavailable: {
    en: "Meta’s connection could not be confirmed. Check again or contact support with the reference below.",
    ar: "تعذّر تأكيد اتصال Meta. تحقّق من الاتصال أو تواصل معنا برقم المرجع أدناه.",
  },
  website_url_invalid: {
    en: "Use a public HTTPS website address.",
    ar: "استخدم رابط HTTPS لموقع عام.",
  },
  website_unavailable: {
    en: "This page could not be read. Paste your business facts instead.",
    ar: "تعذّرت قراءة الصفحة. الصق معلومات نشاطك بدلاً من ذلك.",
  },
  website_empty: {
    en: "No readable text was found. Paste your facts instead.",
    ar: "لم نجد نصاً قابلاً للقراءة. الصق المعلومات مباشرة.",
  },
  website_too_large: {
    en: "This page is too large to import. Paste a short excerpt instead.",
    ar: "الصفحة كبيرة جداً. الصق مقتطفاً قصيراً.",
  },
  website_redirect_limit: {
    en: "This website redirects too many times. Use its final page address.",
    ar: "تحويلات كثيرة في الرابط. استخدم الرابط النهائي للصفحة.",
  },
  catalog_file_too_large: {
    en: "Use a file smaller than 15 MB.",
    ar: "استخدم ملفاً أصغر من ١٥ ميجابايت.",
  },
  catalog_file_type: {
    en: "Use PDF, CSV, XLSX, DOCX, TXT, JPG, PNG or WebP.",
    ar: "استخدم PDF أو CSV أو XLSX أو DOCX أو TXT أو JPG أو PNG أو WebP.",
  },
  catalog_file_empty: {
    en: "No readable catalog information was found.",
    ar: "لم نجد معلومات كتالوج قابلة للقراءة.",
  },
  catalog_limit: {
    en: "A catalog can contain up to 1,000 active services or products.",
    ar: "يمكن أن يحتوي الكتالوج على ١٠٠٠ خدمة أو منتج نشط كحد أقصى.",
  },
  invalid_catalog_entry: {
    en: "Review the extracted item name and price, then try again.",
    ar: "راجع اسم العنصر وسعره المستخرج ثم حاول مجدداً.",
  },
  catalog_unavailable: {
    en: "The catalog could not be saved. Please try again.",
    ar: "تعذّر حفظ الكتالوج. حاول مجدداً.",
  },
  owner_connection_unavailable: {
    en: "Direct connection is only available to the BznsFlow owner account while its server credential is configured.",
    ar: "الربط المباشر متاح فقط لحساب مالك BznsFlow عند إعداد بيانات اعتماد الخادم.",
  },
  customer_live_release_pending_review: {
    en: "Automatic customer replies will become available after Meta approval and our connection checks.",
    ar: "ستتوفر الردود التلقائية للعملاء بعد موافقة Meta وفحوص الربط لدينا.",
  },
  asset_in_use: {
    en: "This WhatsApp number or business account is already connected to another BznsFlow account. Sign in with that account, or choose a different number.",
    ar: "رقم واتساب هذا أو حساب الأعمال مرتبط بحساب آخر في BznsFlow. سجّل الدخول بذلك الحساب، أو اختر رقماً مختلفاً.",
  },
  attempt_limit: {
    en: "This setup has reached its connection attempt limit. Contact ahmed@bznsflowai.com with the reference below.",
    ar: "بلغ هذا الإعداد الحد الأقصى لمحاولات الربط. تواصل مع ahmed@bznsflowai.com برقم المرجع أدناه.",
  },
  attempt_expired: {
    en: "The Meta connection window expired. Press Connect with Facebook to start again.",
    ar: "انتهت مهلة نافذة Meta. اضغط «الربط عبر فيسبوك» للبدء من جديد.",
  },
  attempt_used: {
    en: "This Meta connection attempt was already used. Press Connect with Facebook to start again.",
    ar: "استُخدمت محاولة ربط Meta هذه من قبل. اضغط «الربط عبر فيسبوك» للبدء من جديد.",
  },
  operation_conflict: {
    en: "Another connection step is still running. Reload to check your setup before retrying.",
    ar: "خطوة ربط أخرى ما زالت قيد التنفيذ. أعد تحميل الصفحة للتحقق قبل المحاولة.",
  },
  session_expired: {
    en: "Your setup session expired. Reload the page to continue.",
    ar: "انتهت جلسة الإعداد. أعد تحميل الصفحة للمتابعة.",
  },
  invalid_signup_result: {
    en: "Meta did not return the WhatsApp business account and number you chose. Check any IDs you entered, then retry and select both.",
    ar: "لم ترسل Meta حساب واتساب للأعمال والرقم اللذين اخترتهما. تحقّق من المعرّفات التي أدخلتها ثم أعد المحاولة واختر كليهما.",
  },
  token_permissions_incomplete: {
    en: "Meta did not grant every permission Layla needs. Retry and keep all requested permissions selected.",
    ar: "لم تمنح Meta كل الأذونات التي تحتاجها ليلى. أعد المحاولة وأبقِ جميع الأذونات المطلوبة محددة.",
  },
  waba_not_granted: {
    en: "The selected WhatsApp business account was not shared with BznsFlow. Retry and select it in the Meta window.",
    ar: "لم يُشارَك حساب أعمال واتساب المحدد مع BznsFlow. أعد المحاولة واختره في نافذة Meta.",
  },
  phone_not_in_customer_waba: {
    en: "The selected number does not belong to the shared WhatsApp business account. Retry and choose a number from that account.",
    ar: "الرقم المحدد لا يتبع حساب الأعمال المشارَك. أعد المحاولة واختر رقماً من ذلك الحساب.",
  },
  sender_not_verified: {
    en: "Meta has not confirmed this number’s details yet. Please try again in a few minutes.",
    ar: "لم تؤكد Meta تفاصيل هذا الرقم بعد. حاول مجدداً بعد بضع دقائق.",
  },
  popup_blocked: {
    en: "Your browser blocked Facebook’s window. Allow pop-ups for this page, then press the button again.",
    ar: "منع متصفحك نافذة فيسبوك. اسمح بالنوافذ المنبثقة لهذه الصفحة ثم اضغط الزر مجدداً.",
  },
  meta_cancelled: {
    en: "The Meta connection was cancelled. You can try again.",
    ar: "أُلغيت محاولة ربط Meta. يمكنك المحاولة مجدداً.",
  },
  meta_feature_invalid: {
    en: "Facebook stopped the connection on its side. Nothing changed on your WhatsApp. You can try again or ask Layla in the chat below.",
    ar: "أوقف فيسبوك الربط من جهته، ولم يتغيّر شيء في واتساب لديك. يمكنك المحاولة مجدداً أو سؤال ليلى في المحادثة أدناه.",
  },
  meta_error: {
    en: "Meta’s window reported an error. You can try again or ask Layla in the chat below and include this support reference.",
    ar: "أبلغت نافذة Meta عن خطأ. يمكنك المحاولة مجدداً أو سؤال ليلى في المحادثة أدناه مع إرفاق مرجع الدعم هذا.",
  },
  signup_configuration_not_in_app: {
    en: "WhatsApp connection is being reconfigured by BznsFlow. Your setup is saved; please try again shortly.",
    ar: "تعيد BznsFlow ضبط ربط واتساب حالياً. إعدادك محفوظ؛ حاول مجدداً بعد قليل.",
  },
  signup_configuration_unverified: {
    en: "Meta could not confirm BznsFlow’s WhatsApp signup settings right now. Your setup is saved; please try again in a few minutes.",
    ar: "تعذّر على Meta تأكيد إعدادات تسجيل واتساب لدى BznsFlow حالياً. إعدادك محفوظ؛ حاول مجدداً بعد بضع دقائق.",
  },
  permission_rejected: {
    en: "Meta permissions were declined. Please review the requested permissions and retry.",
    ar: "رُفضت أذونات Meta. راجعها وأعد المحاولة.",
  },
  missing_code: {
    en: "Meta did not return a connection code. Please retry.",
    ar: "لم ترسل Meta رمز الربط. أعد المحاولة.",
  },
  meta_sdk_unavailable: {
    en: "Facebook’s sign-in window could not load. Check your connection or turn off content blockers, then reload the page.",
    ar: "تعذّر تحميل نافذة تسجيل الدخول من فيسبوك. تحقّق من الاتصال أو أوقف مانع المحتوى، ثم أعد تحميل الصفحة.",
  },
  cancel_failed: {
    en: "The cancellation could not be saved. Reload to check your setup before retrying.",
    ar: "تعذّر حفظ الإلغاء. أعد تحميل الصفحة للتحقق من إعدادك قبل المحاولة مجدداً.",
  },
  restore_failed: {
    en: "We could not restore your saved setup. Reload to try again.",
    ar: "تعذّر استعادة إعدادك المحفوظ. أعد تحميل الصفحة للمحاولة مجدداً.",
  },
  review_access_invalid: {
    en: "Reviewer access expired or could not be verified.",
    ar: "انتهى رابط المراجعة أو تعذّر التحقق منه.",
  },
};

const FALLBACK = {
  en: "We could not finish that step. Your setup is saved. Please try again or contact ahmed@bznsflowai.com.",
  ar: "تعذّر إكمال الخطوة. يبقى إعدادك محفوظاً. حاول مجدداً أو تواصل معنا.",
};

/** The message for a failure reason, or a safe generic one. */
export function explain(reason, lang = "en") {
  const key = lang === "ar" ? "ar" : "en";
  return (Object.hasOwn(EXPLANATIONS, reason) ? EXPLANATIONS[reason][key] : null) || FALLBACK[key];
}

// Messages for the banner shown after Instagram sends the customer back.
// `reason` is allowlisted server-side (INSTAGRAM_CALLBACK_REASONS).
const INSTAGRAM_RETURN = {
  connected: {
    en: "Instagram connected. Review your answers, then activate replies below.",
    ar: "تم ربط إنستغرام. راجع إجاباتك ثم فعّل الردود أدناه.",
  },
  cancelled: {
    en: "Instagram connection was cancelled. You can connect again below whenever you are ready.",
    ar: "تم إلغاء ربط إنستغرام. يمكنك الربط مجدداً أدناه متى كنت جاهزاً.",
  },
  connection_failed: {
    en: "Instagram connection could not finish. Try connecting again below.",
    ar: "تعذّر إكمال ربط إنستغرام. حاول الربط مجدداً أدناه.",
  },
  asset_in_use: {
    en: "This Instagram account is already connected to another BznsFlow account. Sign in with that account, or connect a different Instagram account.",
    ar: "حساب إنستغرام هذا مرتبط بحساب آخر في BznsFlow. سجّل الدخول بذلك الحساب، أو اربط حساب إنستغرام مختلفاً.",
  },
  different_account: {
    en: "This BznsFlow account already uses a different Instagram account. Reconnect that one, or contact us to switch accounts.",
    ar: "يستخدم حساب BznsFlow هذا حساب إنستغرام مختلفاً. أعد ربط ذلك الحساب أو تواصل معنا لتغييره.",
  },
  connection_busy: {
    en: "Instagram is still disconnecting. Wait a minute, then connect again.",
    ar: "ما زال فصل إنستغرام قيد التنفيذ. انتظر دقيقة ثم أعد الربط.",
  },
  instagram_permissions_missing: {
    en: "Instagram did not grant both permissions Layla needs. Connect again and keep both options switched on.",
    ar: "لم يمنح إنستغرام الإذنين اللذين تحتاجهما ليلى. أعد الربط وأبقِ الخيارين مفعّلين.",
  },
  invalid_oauth_state: {
    en: "That Instagram link expired or was already used. Start the connection again below.",
    ar: "انتهت صلاحية رابط إنستغرام أو استُخدم من قبل. ابدأ الربط مجدداً أدناه.",
  },
  sign_in_required: {
    en: "Your session ended while you were on Instagram. Sign in again, then reconnect.",
    ar: "انتهت جلستك أثناء وجودك في إنستغرام. سجّل الدخول مجدداً ثم أعد الربط.",
  },
  instagram_unavailable: {
    en: "Instagram connections are not available right now. Please try again later.",
    ar: "ربط إنستغرام غير متاح حالياً. حاول مجدداً لاحقاً.",
  },
  instagram_subscription_failed: {
    en: "Instagram signed you in, but Meta did not confirm that your messages will reach BznsFlow. In Instagram, turn on Settings → Messages → Connected tools → Allow access to messages, then connect again.",
    ar: "سجّل إنستغرام دخولك، لكن Meta لم تؤكد وصول رسائلك إلى BznsFlow. فعّل في إنستغرام: الإعدادات ← الرسائل ← الأدوات المتصلة ← السماح بالوصول إلى الرسائل، ثم أعد الربط.",
  },
  instagram_provider_failed: {
    en: "Instagram refused the connection. Make sure you log in with a professional (Business or Creator) account, then connect again.",
    ar: "رفض إنستغرام الربط. تأكد من تسجيل الدخول بحساب احترافي (نشاط تجاري أو صانع محتوى)، ثم أعد الربط.",
  },
  instagram_provider_unavailable: {
    en: "Instagram did not answer in time. Wait a minute, then connect again.",
    ar: "لم يستجب إنستغرام في الوقت المناسب. انتظر دقيقة ثم أعد الربط.",
  },
  instagram_rate_limited: {
    en: "Meta is limiting how often BznsFlow can set up Instagram right now. Nothing is broken; wait about ten minutes, then connect again.",
    ar: "تحدّ Meta حالياً من عدد مرات إعداد إنستغرام من BznsFlow. لا يوجد عطل؛ انتظر نحو عشر دقائق ثم أعد الربط.",
  },
};

/** Banner text for ?instagram=<status>&reason=<reason>, or null when absent. */
export function instagramReturnMessage(status, reason, lang = "en") {
  const key = lang === "ar" ? "ar" : "en";
  if (!status) return null;
  if (status !== "connected" && Object.hasOwn(INSTAGRAM_RETURN, reason)) return INSTAGRAM_RETURN[reason][key];
  return (INSTAGRAM_RETURN[status] || INSTAGRAM_RETURN.connection_failed)[key];
}
