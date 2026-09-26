// The regex front of Layla's router: the safety guards and the phrases that
// are precise enough to match exactly.
//
// WHY THIS IS ITS OWN FILE. api/_lib/layla/route.js layers a lexicon and the
// tenant's own profile text on top of these rules, and domain.js's `classify()`
// is now that layered router — so domain.js imports route.js and route.js
// needs these rules. Left in domain.js they would be an import cycle. Pulled
// out here they are what they always were: a small pure function with no
// dependencies, which is also the easiest thing in the system to test.
//
// NOTHING IN HERE MAY BE LOOSENED CASUALLY. The opt-out pattern is a
// compliance boundary and the injection pattern is a security one.

/**
 * The regex router, plus WHY it landed on `unknown`.
 *
 * `unknown` collapses three very different outcomes: a prompt-injection
 * attempt, a request for regulated advice, and a question nobody has written a
 * rule for. Downstream must not treat them alike — refusing an injection is
 * permanent and correct, while refusing "what treatments do you offer?" is a
 * dentist losing a customer — so the guard that fired is returned with it.
 *
 * `guard` is `'injection'`, `'medical'` or null. route.js may reopen a
 * `'medical'` guard for a question about what the business offers, and must
 * never reopen `'injection'`.
 *
 * @param {string} text
 * @returns {{intent: string, guard: 'injection'|'medical'|null}}
 */
export function classifyWithGuard(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (/^(please\s+)?(stop|unsubscribe|stopall|opt out|do not message me|توقف|إيقاف|ايقاف|لا تراسلني|إلغاء الاشتراك)[.!؟]*$/.test(t)) return { intent: 'optout', guard: null };
  if (/\b(who are you|are you (human|a bot)|your name)\b|من أنت|من انت|اسمك|روبوت/.test(t)) return { intent: 'identity', guard: null };
  if (/\b(human|person|agent|complaint)\b|موظف|بشري|شكوى|شخص حقيقي/.test(t)) return { intent: 'human', guard: null };
  if (/ignore|instructions|system prompt|jailbreak|تجاهل|تعليمات|اكشف/.test(t)) return { intent: 'unknown', guard: 'injection' };

  // Capabilities Layla does not have: she answers questions, she does not act.
  //
  // `marketing` and `تسويق` USED to be in this list and are deliberately gone.
  // `marketing` is one of our 23 sectors, so "what marketing services do you
  // offer?" — an agency's own service question — was answered with "I cannot
  // make bookings or appointments", which is both wrong and baffling. The
  // marketing FEATURE is still disabled, enforced where it belongs: `guard()`
  // in domain.js rejects any job whose `feature` is not 'faq'. A noun in a
  // customer's question was never the right place to enforce a feature flag.
  //
  // `follow.?up` and `متابعة` stay: those ask Layla to DO something later.
  if (/\b(book|booking|schedule|appointment|follow.?up)\b|حجز|احجز|موعد|متابعة/.test(t)) return { intent: 'disabled', guard: null };

  if (/\b(medical|diagnos|medicine|treatment)\w*|تشخيص|علاج|دواء/.test(t)) return { intent: 'unknown', guard: 'medical' };

  const matches = [
    ['prices', /\b(price|prices|cost|costs|how much)\b|سعر|أسعار|اسعار|تكلفة|التكلفة|بكم/],
    ['hours', /\b(hours|open|opening|close)\b|دوام|ساعات|متى تفتح/],
    ['location', /\b(where|location|address)\b|موقع|عنوان|وين|أين/],
    ['services', /\b(services|offer|do you do)\b|خدمات|تقدمون/],
  ].filter(([, re]) => re.test(t));
  // Ranked precedence, and the array order above IS the ranking:
  // prices > hours > location > services. Do not reshuffle it casually.
  //
  // This used to demand a UNIQUE match, so any question naming two of them fell
  // through to `unknown` and Layla answered "I don't have confirmed information
  // about that" to "how much are your services?" / "كم سعر الخدمات؟" — a quarter
  // of the labelled eval set. Someone asking price-and-something wants the price.
  if (matches.length) return { intent: matches[0][0], guard: null };

  // A bare greeting, with any trailing punctuation ("hello?" is someone checking
  // Layla is there, not a question she cannot answer) and an optional "there" or
  // her name. Anything longer keeps its real meaning via the rules above.
  if (/^(hi|hiya|hello|hey|good (morning|afternoon|evening)|مرحبا|مرحباً|أهلا|اهلا|أهلاً|اهلاً|السلام عليكم|صباح الخير|مساء الخير)( there| layla| ليلى)?[\s!.?؟،,]*$/.test(t)) return { intent: 'greeting', guard: null };
  return { intent: 'unknown', guard: null };
}

/**
 * The regexes alone, with no lexicon and no profile.
 *
 * This is what `classify()` used to be, kept as a named export so
 * scripts/eval-intents.mjs can report the before-and-after in one table. It is
 * NOT what production calls — production calls `classify()` in domain.js,
 * which is the layered router.
 */
export const regexClassify = (text) => classifyWithGuard(text).intent;
