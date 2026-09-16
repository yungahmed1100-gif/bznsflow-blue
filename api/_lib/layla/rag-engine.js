import { createHash } from 'node:crypto';
import { answer } from './domain.js';

// Cost-aware answer pipeline. Storage and model calls are injected so the same
// policy can run against Convex actions, a local test double, or a later worker.
export const RAG_VERSION = 'blue-rag-v1';
export const CACHE_TTL_MS = 7 * 86400000;
const clamp = (s, n) => String(s || '').slice(0, n);
export const normalizeQuery = text => String(text || '').toLowerCase().normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').replace(/[\p{P}]/gu, '').trim();
export const normalizeArabicLexical = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').trim();
export const cacheKey = ({ tenantId, revision, locale = 'en', query }) => `blue:rag:${RAG_VERSION}:${tenantId}:${revision}:${locale}:${createHash('sha256').update(normalizeQuery(query)).digest('hex').slice(0, 32)}`;

export function chunkMarkdown(markdown, { title = 'Business facts', maxTokens = 600, overlap = 0.15 } = {}) {
  const source = String(markdown || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];
  const sections = source.split(/(?=^#{1,6}\s)/m).filter(Boolean);
  const rows = [];
  for (const section of sections) {
    const heading = section.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() || title;
    const words = section.trim().split(/\s+/);
    if (words.length <= maxTokens) rows.push({ title, sectionPath: heading, text: `# ${title} > ${heading}\n\n${section.trim()}` });
    else {
      const step = Math.max(1, Math.floor(maxTokens * (1 - overlap)));
      for (let start = 0; start < words.length; start += step) {
        const part = words.slice(start, start + maxTokens).join(' ');
        rows.push({ title, sectionPath: heading, text: `# ${title} > ${heading}\n\n${part}` });
        if (start + maxTokens >= words.length) break;
      }
    }
  }
  return rows;
}

export function extractSlots(text, { services = [], products = [] } = {}) {
  const value = normalizeArabicLexical(text);
  const digits = value.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const phone = digits.match(/(?:\+?\d[\d\s-]{6,14}\d)/)?.[0]?.replace(/[\s-]/g, '') || null;
  const amount = digits.match(/(?:\d+(?:\.\d{1,2})?)\s?(?:omr|ريال|aed|sar|دولار|usd)/i)?.[0] || null;
  const find = list => list.find(item => value.includes(normalizeArabicLexical(item.name || item)))?.id || null;
  return { serviceId: find(services), productId: find(products), phone, amount };
}

export function classifyKnn(text, examples = [], { k = 5 } = {}) {
  const query = normalizeArabicLexical(text);
  const ranked = examples.filter(e => e?.intent && e?.text).map(e => ({ ...e, score: Number(e.similarity ?? (query === normalizeArabicLexical(e.text) ? 1 : 0)) })).sort((a, b) => b.score - a.score).slice(0, k);
  const byIntent = new Map();
  for (const row of ranked) byIntent.set(row.intent, Math.max(byIntent.get(row.intent) || 0, row.score));
  const total = [...byIntent.values()].reduce((a, b) => a + Math.exp(b), 0) || 1;
  const probabilities = Object.fromEntries([...byIntent.entries()].map(([intent, score]) => [intent, Math.exp(score) / total]));
  const [top] = [...byIntent.entries()].sort((a, b) => b[1] - a[1]);
  return { intent: top?.[0] || 'unknown', confidence: top ? probabilities[top[0]] : 0, probabilities, slots: {} };
}

export function buildContext(turns = [], maxTurns = 6) {
  const safe = turns.filter(t => t && ['user', 'assistant'].includes(t.role)).slice(-maxTurns).map(t => ({ role: t.role, text: clamp(t.text, 1000) }));
  const older = Math.max(0, turns.length - safe.length);
  return { turns: safe, olderTurns: older, summary: older ? 'Earlier conversation was compacted; use only the visible turns and approved business facts.' : '' };
}

export function classifyIntent(text, config = {}) {
  const value = normalizeQuery(text);
  const rules = config.rules || [
    { intent: 'greeting', pattern: /^(hi|hello|hey|مرحبا|السلام عليكم)$/u },
    { intent: 'hours_location', pattern: /(hours|opening|open|location|address|where|وين|موقع|عنوان)/u },
    { intent: 'price', pattern: /(price|cost|how much|كم سعر|بكم|السعر)/u },
    { intent: 'services', pattern: /(service|offer|provide|what do you|خدمات|تقدم)/u },
    { intent: 'human', pattern: /(human|person|agent|complaint|موظف|بشري|شكوى)/u },
    { intent: 'optout', pattern: /^(stop|unsubscribe|إلغاء الاشتراك|توقف)$/u },
  ];
  const match = rules.find(rule => rule.pattern.test(value));
  return { intent: match?.intent || 'unknown', confidence: match ? 0.99 : 0.25, slots: {} };
}

export function reciprocalRankFusion(lists, k = 60, limit = 4) {
  const scores = new Map();
  for (let listIndex = 0; listIndex < lists.length; listIndex++) {
    const source = lists[listIndex];
    const list = Array.isArray(source) ? source : (source?.items || []);
    const name = source?.name || `list${listIndex}`;
    for (let i = 0; i < list.length; i++) {
      const item = list[i]; if (!item?.id) continue;
    const row = scores.get(item.id) || { ...item, score: 0, ranks: {} };
      row.score += 1 / (k + i + 1); row.ranks[name] = i + 1; scores.set(item.id, row);
    }
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

export async function answerMessage({ tenantId, revision, locale = 'en', text, profile, cache, router = classifyIntent, lexicalSearch, vectorSearch, generate }) {
  if (!tenantId || !revision || typeof text !== 'string' || !text.trim()) return { tier: 0, fallback: 'invalid_input', text: '' };
  const key = cacheKey({ tenantId, revision, locale, query: text });
  const cached = cache && await cache.get(key);
  if (cached?.revision === revision && cached?.tenantId === tenantId) return { ...cached.value, tier: 0, cache: 'hit' };
  const routed = router(text);
  if (routed.intent === 'optout') return { tier: 1, intent: routed.intent, text: '', fallback: 'optout', cache: 'miss' };
  if (['greeting', 'services', 'price', 'hours_location', 'human'].includes(routed.intent)) {
    const deterministic = answer(text, profile, true);
    if (deterministic.text && routed.intent !== 'human') {
      const value = { intent: routed.intent, text: deterministic.text, evidence: [], fallback: null };
      if (cache) await cache.set(key, { tenantId, revision, value }, CACHE_TTL_MS);
      return { ...value, tier: 1, cache: 'miss' };
    }
  }
  if (!lexicalSearch || !vectorSearch || !generate) return { tier: 1, intent: routed.intent, text: '', fallback: 'insufficient_evidence' };
  const [lexical, dense] = await Promise.all([lexicalSearch({ tenantId, revision, query: text, limit: 20 }), vectorSearch({ tenantId, revision, query: text, limit: 20 })]);
  const candidates = reciprocalRankFusion([{ name: 'lexical', items: lexical }, { name: 'dense', items: dense }]);
  const evidence = candidates.filter(item => item.tenantId === tenantId && (item.similarity == null || item.similarity >= 0.72)).slice(0, 3);
  if (!evidence.length) return { tier: 2, intent: routed.intent, text: '', fallback: 'low_retrieval_confidence', evidence: [] };
  const generated = await generate({ tenantId, revision, intent: routed.intent, question: clamp(text, 1000), evidence: evidence.map(e => ({ id: e.id, text: clamp(e.text, 1200), source: clamp(e.source, 200) })), context: buildContext([]) });
  if (!generated || generated.fallback === 'FALLBACK_TRIGGER' || typeof generated.text !== 'string' || generated.text.length > 1200) return { tier: 2, intent: routed.intent, text: '', fallback: 'generation_fallback', evidence: evidence.map(e => e.id) };
  const value = { intent: routed.intent, text: generated.text.trim(), evidence: evidence.map(e => e.id), fallback: null };
  if (cache) await cache.set(key, { tenantId, revision, value }, CACHE_TTL_MS);
  return { ...value, tier: 2, cache: 'miss' };
}

export function createDebouncer({ delayMs = 3000, maxMs = 10000, onFlush }) {
  const timers = new Map();
  return { push(key, message) { const existing = timers.get(key); if (existing) { clearTimeout(existing.timer); existing.messages.push(message); } else { timers.set(key, { messages: [message], started: Date.now() }); }
      const state = timers.get(key); const remaining = Math.max(0, maxMs - (Date.now() - state.started)); state.timer = setTimeout(() => { timers.delete(key); onFlush(key, state.messages.splice(0)); }, Math.min(delayMs, remaining)); },
    clear(key) { const state = timers.get(key); if (state) clearTimeout(state.timer); timers.delete(key); } };
}
