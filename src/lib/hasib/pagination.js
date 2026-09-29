/** Read a bounded number of cursor pages, preserving order and deduplicating IDs. */
export async function loadWorkflowPages(loadPage, maxPages = 20) {
  const items = [], ids = new Set(), cursors = new Set();
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const result = await loadPage(cursor);
    for (const item of result.items || []) {
      if (!ids.has(item.id)) { ids.add(item.id); items.push(item); }
    }
    cursor = result.cursor || null;
    if (!cursor) break;
    if (cursors.has(cursor)) throw Object.assign(new Error('The record list did not advance.'), { reason: 'invalid_cursor' });
    cursors.add(cursor);
  }
  return { items, cursor };
}
