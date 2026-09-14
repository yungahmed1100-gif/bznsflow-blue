/**
 * BznsFlow — Lead capture → Google Sheet
 * Bound Web App for: https://docs.google.com/spreadsheets/d/125VxXDHIlesWDZijAkzwCOKcSBDT-sSMXMQnwSmcSYY
 * Hosted on ahmed@bznsflowai.com → GmailApp sends from ahmed natively (no send-as alias needed).
 *
 * Appends one row per lead. Matches incoming JSON keys to the sheet's HEADER ROW
 * by normalized name (case/space/punctuation-insensitive), so the same endpoint
 * works for the simple email modal today AND the full Growth Assessment later —
 * each form just sends whatever fields it has; unmatched columns stay blank.
 *
 * Deploy: Extensions → Apps Script → paste this → Deploy → New deployment →
 *   type "Web app" → Execute as "Me" → Who has access "Anyone" → Deploy →
 *   copy the /exec URL.
 */

var SHEET_ID = '125VxXDHIlesWDZijAkzwCOKcSBDT-sSMXMQnwSmcSYY';
var SHEET_NAME = '';            // '' = use SHEET_GID / first tab. Set to a tab name to force it.
var SHEET_GID = 580821186;     // the tab from the URL (#gid=...). Targets the RIGHT tab even if it isn't leftmost.
var HEADER_ROW = 2;            // Row 1 is the banner (CAPTURE/QUALIFICATION/...). Real headers live on row 2.

// ── Playbook lead-magnet email delivery ─────────────────────────────────────
// When a submission carries { playbook: true }, the visitor is auto-emailed the
// playbook: the body is built by playbookHtml_() below, and the PDF is fetched
// from the live site and attached, so the PDF must be deployed first.
//
// The body used to be fetched too, from a public HTML file on the site. That URL
// no longer exists. Building it here removes a network call from the send path,
// removes the 404 that call could return, and removes a page anyone could open.
var SENDER_EMAIL  = 'ahmed@bznsflowai.com';   // must be the script account OR a verified "Send mail as" alias
var SENDER_NAME   = 'Ahmed — BznsFlow';
var EMAIL_SUBJECT = 'دليل عملي للتطور بمشروعك — BznsFlow Growth Playbook';
// FALLBACK ONLY. /api/lead sends `playbookUrl` with every playbook submission,
// so the filename lives in ONE place (src/lib/constants.js) and this file cannot
// drift out of step with what is actually deployed.
//
// It already did once: commit d5ec7b6 renamed the PDF to the SME edition and this
// constant kept pointing at bznsflow-growth-playbook-realestate.pdf. The fetch
// 404'd, the try/catch around sendPlaybook_ swallowed it, and every lead from
// then on was recorded in the sheet while silently never receiving the email.
var PLAYBOOK_URL  = 'https://www.bznsflowai.com/bznsflow-sme-operating-playbook.pdf';
var SITE_URL      = 'https://bznsflowai.com';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Sign-in codes are NOT leads: this branch returns before any appendRow.
    // A row is written later, by PATCH /api/auth-session, once the visitor has
    // proved the address and filled in their profile.
    if (data.action === 'sendOtp') return sendOtp_(data);

    var sheet = getSheet_();
    var hr = detectHeaderRow_(sheet);
    var headers = sheet.getRange(hr, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Server-stamped timestamp always wins (don't trust the client clock).
    data.Timestamp = new Date();

    // Build a normalized lookup of the incoming payload.
    var payload = {};
    Object.keys(data).forEach(function (k) { payload[norm_(k)] = data[k]; });

    var row = headers.map(function (h) {
      var key = norm_(h);
      return payload.hasOwnProperty(key) ? payload[key] : '';
    });

    var target = nextDataRow_(sheet, hr);
    ensureRowExists_(sheet, target);
    sheet.getRange(target, 1, 1, row.length).setValues([row]);
    forcePhoneToText_(sheet, headers, row, target);

    // Auto-deliver the playbook — never let an email failure break lead capture.
    if (data.playbook === true && data.email) {
      try {
        sendPlaybook_(String(data.email).trim(), data.name ? String(data.name).trim() : '',
                      data.playbookUrl);
      } catch (mailErr) {
        // The row is already saved, so capture is never lost to a mail failure —
        // but this is exactly how the 404 above stayed invisible for weeks. The
        // caller now gets `emailed` back so a failure is at least observable.
        console.error('Playbook email failed: ' + mailErr);
        return json_({ ok: true, emailed: false, emailError: String(mailErr) });
      }
      return json_({ ok: true, emailed: true });
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// The row a new lead should be written to.
//
// REPLACES sheet.appendRow(), which appends after the last row Sheets believes
// holds content — and Sheets keeps believing that after "Clear contents",
// because clearing empties the cells but leaves the rows in the used range.
// So emptying the CRM the obvious way left appendRow still writing at row 15,
// with eleven blank rows above it. Deleting the rows instead would have worked,
// but a sheet that only behaves if it was cleaned up the right way is a trap
// waiting for the next person.
//
// Scans BACKWARDS for the last row holding anything at all, and returns the row
// after it. Nothing is ever overwritten, and mid-sheet gaps are left alone so a
// new lead cannot be filed out of chronological order. With every row below the
// header empty, this returns headerRow + 1 — row 4 on this sheet.
function nextDataRow_(sheet, headerRow) {
  var lastRow = sheet.getLastRow();
  var cols = sheet.getLastColumn();
  if (lastRow <= headerRow || cols < 1) return headerRow + 1;

  var values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, cols).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    for (var j = 0; j < values[i].length; j++) {
      var v = values[i][j];
      if (v !== '' && v !== null) return headerRow + 2 + i;
    }
  }
  return headerRow + 1;
}

// Grow the grid if the target row does not physically exist yet.
//
// The one thing appendRow did for free that setValues does not. appendRow adds
// a row when the sheet runs out; getRange(row, ...) simply throws "out of
// bounds" — and because the Apps Script echo URL swallows every response
// (see the 405 note in api/_lib/mailer.js), that exception surfaced as a lead
// silently never arriving, with a 200-looking failure on our side.
//
// Deleting the used rows from the CRM is what triggers it: the grid can end at
// the header row, and the very next lead asks for the row after it.
function ensureRowExists_(sheet, row) {
  var max = sheet.getMaxRows();
  if (row > max) sheet.insertRowsAfter(max, row - max);
}

// Rewrites the phone cell as TEXT.
//
// setValues lets Sheets parse each value, and "+96899656590" parses as the
// NUMBER 96899656590 — the leading + is gone, which breaks every wa.me link
// built from this column. Setting the format to '@' and writing the value again
// is what makes it stick; setting the format alone does not retroactively
// restore a value Sheets has already coerced.
//
// The column is found by normalised header name, not a fixed index, because the
// header row has already moved once (row 2 -> row 3).
//
// `targetRow` is passed in rather than read back from getLastRow(): the write
// no longer necessarily lands on the last row of the sheet, so re-deriving it
// here would format the wrong cell the moment the two disagree.
function forcePhoneToText_(sheet, headers, row, targetRow) {
  for (var i = 0; i < headers.length; i++) {
    if (norm_(headers[i]) !== 'phonewhatsapp') continue;
    var value = row[i];
    if (value === '' || value == null) return;
    sheet.getRange(targetRow, i + 1)
         .setNumberFormat('@')
         .setValue(String(value));
    return;
  }
}

// Emails the playbook: the body built here, the PDF fetched and attached.
// playbookUrl comes from the caller so the filename has a single source of truth
// on the site side; the module constant is only a fallback.
function sendPlaybook_(email, name, playbookUrl) {
  var playbook = playbookUrl || PLAYBOOK_URL;

  // Guard the fetch — a non-200 would otherwise attach an error page as a PDF.
  var pdfResp = UrlFetchApp.fetch(playbook, { muteHttpExceptions: true });
  if (pdfResp.getResponseCode() !== 200) {
    throw new Error('PDF fetch ' + pdfResp.getResponseCode() + ' for ' + playbook);
  }
  var pdf = pdfResp.getBlob().setName('BznsFlow-Operating-Playbook.pdf');

  GmailApp.sendEmail(email, EMAIL_SUBJECT,
    'Your BznsFlow Growth Playbook is attached. If it doesn\'t open, reply and we\'ll resend it.',
    { htmlBody: playbookHtml_(name), attachments: [pdf], name: SENDER_NAME, from: SENDER_EMAIL });
}

// ── The playbook email body ─────────────────────────────────────────────────
// Inline styles and table layout on purpose, the same as otpHtml_() below and
// for the same reason: Gmail strips <style> blocks. The version this replaced
// was a 600-line stylesheet in a fetched HTML file, essentially none of which
// survived the trip to an inbox.
//
// The palette matches otpHtml_() and src/styles/base.css — the two emails this
// account sends should not look like they came from different companies.
//
// THE WORDS ARE NOT NEW. Every line is lifted from the file this replaced,
// character for character, including the Arabic. Two things were changed and
// neither is a claim: the edition label now names the document actually
// attached (the SME playbook, not the Real Estate edition), and the unsubscribe
// line is an instruction that works instead of text styled to look like a link
// with nothing behind it.
var INK = '#1A1A1A', PAPER = '#F6EFDF', RULED = '#EBE1C9', CARD = '#FFFFFF';
var BLUE = '#5C95C6', GREEN = '#51A47B', ORANGE = '#F28C54', CORAL = '#E16B71';
var INK_2 = '#4B5563';
var FONT = "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif";

/** One of the four leak figures. */
function leakCell_(figure, color, title, desc) {
  return ''
    + '<td width="50%" valign="top" style="padding:8px;">'
    +   '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
    +          'style="background:' + CARD + ';border:1px solid rgba(0,0,0,0.08);border-radius:4px;">'
    +     '<tr><td style="padding:16px;">'
    +       '<div style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:' + color + ';">' + figure + '</div>'
    +       '<div style="margin-top:6px;font-size:14px;font-weight:700;color:' + INK + ';">' + title + '</div>'
    +       '<div style="margin-top:6px;font-size:13px;line-height:1.7;color:' + INK_2 + ';">' + desc + '</div>'
    +     '</td></tr>'
    +   '</table>'
    + '</td>';
}

/** One of the four steps. */
function stepRow_(n, color, titleAr, titleEn, desc) {
  return ''
    + '<tr><td style="padding:0 0 18px;">'
    +   '<div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:' + color + ';">' + n + '</div>'
    +   '<div style="margin-top:4px;font-size:15px;font-weight:700;color:' + INK + ';">' + titleAr + '</div>'
    +   '<div style="margin-top:2px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:' + INK_2 + ';">' + titleEn + '</div>'
    +   '<div style="margin-top:6px;font-size:13px;line-height:1.8;color:' + INK_2 + ';">' + desc + '</div>'
    + '</td></tr>';
}

function playbookHtml_(name) {
  var greeting = name
    ? '<div style="margin:0 0 18px;font-size:15px;color:' + INK + ';">'
      + 'مرحباً ' + escapeHtml_(name) + '، إليك دليلك العملي 👇 / Hi ' + escapeHtml_(name) + ', here is your playbook 👇'
      + '</div>'
    : '';

  var rule = '<div style="height:1px;background:rgba(0,0,0,0.15);margin:26px 0;"></div>';

  return ''
  + '<div dir="rtl" style="margin:0;padding:24px 12px;background:' + PAPER + ';font-family:' + FONT + ';">'
  +   '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
  +          'style="max-width:640px;margin:0 auto;background:' + PAPER + ';">'
  +     '<tr><td style="padding:28px 24px;">'

  // Header
  +       greeting
  +       '<div style="font-size:13px;font-weight:800;letter-spacing:0.18em;color:' + INK + ';">BZNSFLOW</div>'
  +       '<div style="margin-top:2px;font-size:11px;letter-spacing:0.06em;color:' + INK_2 + ';">AI-Powered Growth Systems</div>'
  +       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">'
  +         '<tr>'
  +           '<td width="44" height="4" style="background:' + GREEN + ';font-size:0;line-height:0;">&nbsp;</td>'
  +           '<td width="44" height="4" style="background:' + BLUE + ';font-size:0;line-height:0;">&nbsp;</td>'
  +           '<td width="44" height="4" style="background:' + CORAL + ';font-size:0;line-height:0;">&nbsp;</td>'
  +           '<td width="44" height="4" style="background:' + ORANGE + ';font-size:0;line-height:0;">&nbsp;</td>'
  +         '</tr>'
  +       '</table>'

  // Hero
  +       '<div style="margin-top:26px;font-size:11px;font-weight:600;letter-spacing:0.1em;color:' + INK_2 + ';">'
  +         'The SME Operating Playbook · 2026'
  +       '</div>'
  +       '<div style="margin-top:10px;font-size:26px;font-weight:800;line-height:1.3;color:' + INK + ';">'
  +         'وكالتك تخسر أكثر مما تتخيل'
  +       '</div>'
  +       '<div style="margin-top:6px;font-size:13px;font-weight:600;letter-spacing:0.04em;color:' + INK_2 + ';">'
  +         "YOUR AGENCY IS BLEEDING REVENUE — HERE'S THE PROOF."
  +       '</div>'
  +       '<div style="margin-top:12px;font-size:14px;line-height:1.9;color:' + INK_2 + ';">'
  +         'لقد أعددنا لك دليلاً مجانياً يكشف الثغرات الأربع التي تُنزف أموالك كل يوم — وكيف يمكنك إيقافها بنظام '
  +         'ذكاء اصطناعي مُثبَّت في أقل من أسبوع.'
  +       '</div>'

  +       rule

  // 01 — the four leaks
  +       '<div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:' + INK_2 + ';">01 · تدقيق الإيرادات</div>'
  +       '<div style="margin-top:8px;font-size:19px;font-weight:800;color:' + INK + ';">الثغرات الأربع التي تُنزف وكالتك الآن</div>'
  +       '<div style="margin-top:2px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:' + INK_2 + ';">THE 4 LEAKS BLEEDING YOUR AGENCY RIGHT NOW</div>'
  +       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px -8px 0;">'
  +         '<tr>'
  +           leakCell_('10 دقائق', INK, 'العتبة اللي بيموت بعدها العميل',
                        'بعد عشر دقائق من وصول الاستفسار، المشتري غالباً يكون راح لوكالة تانية.')
  +           leakCell_('80%', BLUE, 'انخفاض التحويل',
                        'ده مقدار اللي بيضيع من معدل التحويل لما الرد يتأخر عن العتبة دي.')
  +         '</tr><tr>'
  +           leakCell_('21x', ORANGE, 'الارتفاع تحت 5 دقائق',
                        'الرد في أقل من خمس دقائق بيرفع فرصة التحويل إلى 21 ضعف.')
  +           leakCell_('5,000+ ر.ع', GREEN, 'عمولة مشتري واحد',
                        'العمولة المفقودة من مشتري واحد عالي القيمة في السوق العُماني.')
  +         '</tr>'
  +       '</table>'

  // The disclaimer that keeps those figures honest. It travelled with them
  // before and it travels with them now.
  +       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
  +              'style="margin-top:14px;background:' + RULED + ';border-radius:4px;">'
  +         '<tr><td style="padding:14px 16px;">'
  +           '<div style="font-size:13px;line-height:1.7;color:' + INK + ';">الأرقام دي من بيانات السوق، مش قياساً لوكالتك. الدليل بيشرح إزاي تقيسها عندك.</div>'
  +           '<div style="margin-top:4px;font-size:12px;line-height:1.6;color:' + INK_2 + ';">Market figures — not a measurement of your agency. The playbook shows how to measure your own.</div>'
  +         '</td></tr>'
  +       '</table>'

  +       rule

  // 02 — what is inside
  +       '<div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:' + INK_2 + ';">02 · ما في الدليل</div>'
  +       '<div style="margin-top:8px;font-size:19px;font-weight:800;color:' + INK + ';">النظام المكون من 4 خطوات لإيقاف النزيف</div>'
  +       '<div style="margin:2px 0 18px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:' + INK_2 + ';">THE 4-STEP SYSTEM INSIDE THE PLAYBOOK</div>'
  +       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
  +         stepRow_('01', INK, 'نشر ليلى — موظفة الاستقبال الذكية على واتساب',
                     'DEPLOY LAYLA — AI WHATSAPP RECEPTIONIST',
                     'ليلى ترد فوراً بالعربي والإنجليزي، تؤهّل العميل، وتحجز المشاهدة تلقائياً — على مدار الساعة.')
  +         stepRow_('02', BLUE, 'تثبيت نظام CRM مع متابعة تلقائية',
                     'CRM PIPELINE + AUTO FOLLOW-UP SEQUENCES',
                     'كل عميل يدخل نظام المتابعة تلقائياً — يوم 1، يوم 3، يوم 7 عبر واتساب. لا عميل يُنسى.')
  +         stepRow_('03', GREEN, 'لوحة تحكم ذكية — رؤية كل ريال في الوكالة',
                     'BI DASHBOARD — REAL-TIME REVENUE VISIBILITY',
                     'أوقف التخمين. ابدأ الإدارة بالأرقام. معظم الوكالات تكتشف وفراً بنسبة 25% في 60 يوماً.')
  +         stepRow_('04', CORAL, 'وصال — التواصل وإعادة تنشيط العملاء',
                     'WISAL — OUTREACH &amp; REACTIVATION',
                     'وصال يعيد تنشيط العملاء الخاملين والقوائم القديمة بتسلسلات مخصّصة — بمحادثة عربية طبيعية — ويحوّل المهتمّ منهم إلى فريقك فوراً.')
  +       '</table>'

  +       rule

  // The arithmetic, and the guarantee that sits under it
  +       '<div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:' + INK_2 + ';">THE MATH — حساب العائد</div>'
  +       '<div style="margin-top:10px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:' + CORAL + ';">OMR 5,000+</div>'
  +       '<div style="margin-top:4px;font-size:13px;color:' + INK_2 + ';">عمولة مشتري واحد مفقود · One missed buyer</div>'
  +       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
  +              'style="margin-top:16px;border-inline-start:3px solid ' + GREEN + ';border-right:3px solid ' + GREEN + ';">'
  +         '<tr><td style="padding:12px 14px;">'
  +           '<div style="font-size:14px;font-weight:700;color:' + INK + ';">✓ ضمان 30 يوم — إذا لم نحدد تسرباً حقيقياً في إيراداتك، لا تدفع شيئاً</div>'
  +           '<div style="margin-top:4px;font-size:12px;line-height:1.6;color:' + INK_2 + ';">30-Day Leak Guarantee: If our audit finds no measurable revenue leakage, you owe us nothing.</div>'
  +         '</td></tr>'
  +       '</table>'

  // CTA
  +       '<div style="margin-top:26px;font-size:17px;font-weight:800;color:' + INK + ';">احجز مكالمة تدقيق الإيرادات المجانية</div>'
  +       '<div style="margin-top:4px;font-size:12px;color:' + INK_2 + ';">Book your free revenue leak audit call</div>'
  +       '<div style="margin-top:14px;">'
  +         '<a href="' + SITE_URL + '" style="display:inline-block;padding:14px 26px;background:' + INK + ';color:' + PAPER + ';'
  +            'font-size:13px;font-weight:700;letter-spacing:0.06em;text-decoration:none;border-radius:4px;">'
  +           'BOOK FREE AUDIT CALL →'
  +         '</a>'
  +       '</div>'
  +       '<div style="margin-top:14px;font-size:12px;line-height:1.8;color:' + INK_2 + ';" dir="ltr">'
  +         'bznsflowai.com · WhatsApp: +20 1036755930 · Oman: +968 99656590'
  +       '</div>'

  // Footer
  +       '<div style="margin-top:26px;padding-top:16px;border-top:1px solid rgba(0,0,0,0.08);">'
  +         '<div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:' + INK_2 + ';">BZNSFLOW · AI-POWERED GROWTH SYSTEMS</div>'
  +         '<div style="margin-top:6px;font-size:11px;color:' + INK_2 + ';" dir="ltr">bznsflowai.com · GCC &amp; European SMEs · © 2026</div>'
  // The old line said "click here to unsubscribe" and was not a link. This one
  // is an instruction that actually works, and it is answerable by a human.
  +         '<div style="margin-top:8px;font-size:11px;line-height:1.7;color:' + INK_2 + ';">'
  +           'تم إرسال هذا الدليل تلقائياً لأنك طلبته من موقعنا · للتوقف عن استلام رسائلنا، ردّ على هذه الرسالة بكلمة "إلغاء"'
  +         '</div>'
  +         '<div style="margin-top:2px;font-size:11px;line-height:1.7;color:' + INK_2 + ';">'
  +           'You received this because you requested it on our site. Reply "unsubscribe" and we will stop.'
  +         '</div>'
  +       '</div>'

  +     '</td></tr>'
  +   '</table>'
  + '</div>';
}

// ── Sign-in one-time codes ──────────────────────────────────────────────────
// Called server-to-server by /api/auth-code on Vercel. Two things make this safe
// to expose on an "Anyone" deployment:
//   1. the shared secret, which lives in Script Properties and is never committed;
//   2. the fact that this endpoint takes an ADDRESS and a CODE, never a subject
//      or a body. Even with the secret, the worst an attacker can send from
//      ahmed@bznsflowai.com is a BznsFlow login code — not arbitrary mail. Moving
//      the template to the caller would turn this into an open relay.
function sendOtp_(data) {
  var expected = PropertiesService.getScriptProperties().getProperty('OTP_SHARED_SECRET');
  if (!expected) return json_({ ok: false, error: 'OTP_SHARED_SECRET not set in Script Properties' });
  if (String(data.secret || '') !== expected) return json_({ ok: false, error: 'forbidden' });

  var email = String(data.email || '').trim();
  var code = String(data.code || '').replace(/\D/g, '');
  if (!email || code.length !== 6) return json_({ ok: false, error: 'invalid' });

  var ar = data.language === 'ar';
  var subject = ar ? ('رمز الدخول: ' + code + ' — BznsFlow')
                   : ('Your sign-in code: ' + code + ' — BznsFlow');

  GmailApp.sendEmail(email, subject, otpPlain_(code, ar), {
    htmlBody: otpHtml_(code, ar),
    name: SENDER_NAME,
    from: SENDER_EMAIL,
  });

  return json_({ ok: true });
}

// Plain-text fallback, for clients that refuse HTML.
function otpPlain_(code, ar) {
  return ar
    ? 'رمز الدخول الخاص بك هو: ' + code + '\nصالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.'
    : 'Your sign-in code is: ' + code + '\nIt is valid for 10 minutes. If you did not request it, you can ignore this email.';
}

// Inline styles and a table layout on purpose — Gmail strips <style> blocks, and
// the brand palette here is copied from src/styles/base.css rather than invented.
function otpHtml_(code, ar) {
  var dir = ar ? 'rtl' : 'ltr';
  var font = ar ? "'Cairo', Tahoma, Arial, sans-serif" : "'Outfit', Arial, Helvetica, sans-serif";
  var title = ar ? 'رمز الدخول' : 'Your sign-in code';
  var lede = ar ? 'استخدم هذا الرمز لإكمال تسجيل الدخول إلى BznsFlow.'
                : 'Use this code to finish signing in to BznsFlow.';
  var expiry = ar ? 'الرمز صالح لمدة 10 دقائق.' : 'This code expires in 10 minutes.';
  var ignore = ar ? 'إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.'
                  : 'If you did not request this code, you can safely ignore this email.';

  return ''
    + '<div dir="' + dir + '" style="margin:0;padding:24px;background:#F6EFDF;font-family:' + font + ';">'
    +   '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(0,0,0,0.08);border-radius:20px;">'
    +     '<tr><td style="padding:32px;text-align:' + (ar ? 'right' : 'left') + ';">'
    +       '<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#5C95C6;">BznsFlow</p>'
    +       '<h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#1A1A1A;">' + title + '</h1>'
    +       '<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4B5563;">' + lede + '</p>'
    +       '<div style="margin:0 0 20px;padding:18px;background:#F6EFDF;border-radius:12px;text-align:center;">'
    +         '<span style="font-size:32px;font-weight:800;letter-spacing:0.28em;color:#1A1A1A;">' + code + '</span>'
    +       '</div>'
    +       '<p style="margin:0 0 6px;font-size:13px;color:#565E6B;">' + expiry + '</p>'
    +       '<p style="margin:0;font-size:13px;color:#565E6B;">' + ignore + '</p>'
    +     '</td></tr>'
    +   '</table>'
    + '</div>';
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Diagnostic health check — open the /exec URL in a browser to see exactly which
// tab the script writes to, its headers, and all tabs in the spreadsheet.
function doGet() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var tabs = ss.getSheets().map(function (s) {
      return { name: s.getName(), gid: s.getSheetId(), rows: s.getLastRow(), cols: s.getLastColumn() };
    });
    var target = getSheet_();
    var hr = detectHeaderRow_(target);
    var cols = target.getLastColumn();
    var lastRow = target.getLastRow();
    var headers = cols ? target.getRange(hr, 1, 1, cols).getValues()[0] : [];
    var lastRowValues = (cols && lastRow >= hr) ? target.getRange(lastRow, 1, 1, cols).getValues()[0] : [];
    return json_({
      ok: true, status: 'alive',
      writesTo: { name: target.getName(), gid: target.getSheetId() },
      detectedHeaderRow: hr, headers: headers,
      lastRow: lastRow, lastRowValues: lastRowValues,
      // maxRows is the size of the GRID; lastRow is how much of it holds data.
      // The two are easy to conflate and the difference matters: writing past
      // maxRows throws, which is invisible from outside because the echo URL
      // eats every response. nextWriteRow lets a caller confirm where the next
      // lead will land without having to send one.
      maxRows: target.getMaxRows(),
      nextWriteRow: nextDataRow_(target, hr),
      allTabs: tabs,
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  if (SHEET_NAME) return ss.getSheetByName(SHEET_NAME);
  if (SHEET_GID !== '' && SHEET_GID != null) {
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === SHEET_GID) return sheets[i];
    }
  }
  return ss.getSheets()[0];
}

// Auto-find the real header row: the first of the top rows that contains an
// "Email" or "Timestamp" cell. Resilient to title/banner rows above it.
function detectHeaderRow_(sheet) {
  var n = Math.min(6, sheet.getLastRow() || 1);
  var cols = sheet.getLastColumn() || 1;
  var probe = sheet.getRange(1, 1, n, cols).getValues();
  for (var r = 0; r < probe.length; r++) {
    for (var c = 0; c < probe[r].length; c++) {
      var v = norm_(probe[r][c]);
      if (v === 'email' || v === 'timestamp') return r + 1;
    }
  }
  return HEADER_ROW; // fallback
}

// "Phone / WhatsApp" -> "phonewhatsapp", "Page URL" -> "pageurl", "Language" -> "language"
function norm_(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
