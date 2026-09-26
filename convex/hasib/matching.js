// Matching free text (what a customer asked for, what Layla captured) to one of
// the business's own products. Conservative on purpose: an exact or contained
// name, never "one word in common", so a black shayla never counts as a black abaya.
// Punctuation is ignored, so "iPhone 13 (used)" and "iPhone 13 used" are the same product name.
const norm = s => String(s || '').toLocaleLowerCase().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[()\[\]{}\-_.,/|:;'"«»،]+/g, ' ').replace(/\s+/g, ' ').trim();

export function nameMatches(item, text) {
  const t = norm(text);
  if (t.length < 2) return false;
  return [item.nameEn, item.nameAr].some(name => { const n = norm(name); return n && (n === t || n.includes(t) || t.includes(n)); });
}

export async function matchItem(ctx, accountId, text) {
  const query = norm(text);
  if (query.length < 2) return null;
  const candidates = await ctx.db.query('hasibItems').withSearchIndex('search_items', q => q.search('searchText', query).eq('accountId', accountId).eq('archived', false)).take(10);
  return candidates.find(item => nameMatches(item, text)) || null;
}
export const demandKey = text => norm(text).slice(0, 80);
