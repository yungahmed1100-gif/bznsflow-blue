/**
 * Minimal Ollama chat client for the offline authoring scripts.
 *
 * Deliberately lives in scripts/ and never in api/:
 *   - nothing here ships to Vercel, so a dev-only dependency cannot reach a
 *     serverless function;
 *   - tests/contracts.test.mjs scans api/ and ops/ for env reads and fails on
 *     any that .env.example does not document, and this keeps OLLAMA_* out of
 *     that surface;
 *   - the local model is an AUTHORING tool. It drafts material a person then
 *     reviews. It never answers a customer, and no production path may depend
 *     on a machine that can be asleep.
 */

const DEFAULT_HOST = 'http://192.168.100.4:11434';
const DEFAULT_MODEL = 'layla-ar';

// Generous: a 4B on a 1050 Ti runs ~20 tok/s, and a cold load can take a while
// if anything is hooking file I/O on the host.
const TIMEOUT_MS = 300000;

export const host = () => (process.env.OLLAMA_HOST || DEFAULT_HOST).replace(/\/+$/, '');
export const model = () => process.env.OLLAMA_MODEL || DEFAULT_MODEL;

/** Is a server there at all? Used to fail with advice instead of a stack trace. */
export async function reachable() {
  try {
    const res = await fetch(`${host()}/`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function installed() {
  const res = await fetch(`${host()}/api/tags`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`ollama /api/tags returned ${res.status}`);
  const body = await res.json();
  return (body?.models || []).map((m) => m.name);
}

/**
 * One chat turn. Returns the assistant's text.
 *
 * `keep_alive` matters more than it looks: a cold load on modest hardware costs
 * far more than the generation itself, so a batch run must hold the model
 * resident between calls rather than pay that per question.
 */
export async function chat(messages, { temperature = 0.8, numPredict = 500, keepAlive = '60m' } = {}) {
  const res = await fetch(`${host()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: model(),
      messages,
      stream: false,
      keep_alive: keepAlive,
      // Reasoning models otherwise spend the whole budget deliberating in
      // English about an Arabic prompt and never reach an answer.
      think: false,
      options: { temperature, num_predict: numPredict },
    }),
  });
  if (!res.ok) throw new Error(`ollama /api/chat returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = body?.message?.content;
  if (typeof text !== 'string') throw new Error('ollama returned no message content');
  return text.trim();
}

/**
 * Pull a numbered or bulleted list out of a model reply.
 *
 * Small models leak preamble however firmly you forbid it, so this keeps only
 * lines that actually look like list items and drops everything else rather
 * than trusting the format.
 */
export function parseList(text, { max = 50, maxChars = 200 } = {}) {
  const seen = new Set();
  const items = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!/^(\d+[.)\-،:]|[-*•])\s*/.test(line)) continue;
    const item = line.replace(/^(\d+[.)\-،:]|[-*•])\s*/, '').replace(/\s+/g, ' ').trim();
    if (!item || item.length > maxChars) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= max) break;
  }
  return items;
}
