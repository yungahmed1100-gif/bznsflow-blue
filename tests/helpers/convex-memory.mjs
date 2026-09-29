// In-memory stand-in for the Convex database API used by Blue state modules.
// It honours index equality/range filters, ordering by the index's last field,
// search-index token matching, and structured-clone isolation like Convex.
import assert from 'node:assert/strict';

const ORDER_FIELD = {
  by_account_start: 'startsAt', by_account_due: 'dueAt', by_membership_created: 'createdAt',
  by_account_updated: 'updatedAt', by_conversation_at: 'at', by_account_at: 'at', by_account_state_activity: 'lastActivityAt', by_contact_at: 'at',
  by_account_created: 'createdAt', by_status_scheduled: 'scheduledAt', by_status_next: 'nextAttemptAt', by_account_synced: 'syncedAt', by_status_at: 'at',
  by_owner_status_order: 'sortOrder',
  by_account_archived_updated: 'updatedAt', by_account_status_created: 'createdAt', by_contact_created: 'createdAt', by_variant_at: 'at', by_order_at: 'at', by_account_paid: 'paidAt',
};

export function convexMemory({ start = 1_800_000_000_000 } = {}) {
  const rows = new Map(), scheduled = [];
  let seq = 0, time = start;
  const matching = table => [...rows.values()].filter(r => r.table === table);
  const db = {
    query(table) {
      const filters = [];
      let orderField = '_seq', descending = false, search = null;
      const range = {
        eq(k, v) { filters.push(r => r[k] === v); return range; },
        lt(k, v) { filters.push(r => r[k] < v); orderField = k; return range; },
        lte(k, v) { filters.push(r => r[k] <= v); orderField = k; return range; },
        gt(k, v) { filters.push(r => r[k] > v); orderField = k; return range; },
        gte(k, v) { filters.push(r => r[k] >= v); orderField = k; return range; },
        search(field, text) { search = { field, tokens: String(text).toLowerCase().split(/\s+/).filter(Boolean) }; return range; },
      };
      const run = () => {
        let out = matching(table).filter(r => filters.every(f => f(r)));
        if (search) out = out.filter(r => search.tokens.some(t => String(r[search.field] || '').toLowerCase().split(/\s+/).some(w => w.startsWith(t))));
        const key = orderField;
        out.sort((a, b) => ((a[key] ?? 0) - (b[key] ?? 0)) || (a._seq - b._seq));
        if (descending) out.reverse();
        return structuredClone(out);
      };
      const api = {
        withIndex(index, fn) { if (ORDER_FIELD[index]) orderField = ORDER_FIELD[index]; fn?.(range); return api; },
        withSearchIndex(_index, fn) { fn(range); return api; },
        order(direction) { descending = direction === 'desc'; return api; },
        async take(n) { return run().slice(0, n); },
        async collect() { return run(); },
        async paginate({numItems,cursor}) {
          const start=cursor===null?0:Number(cursor), all=run();
          assert(Number.isSafeInteger(start)&&start>=0,'invalid synthetic pagination cursor');
          const page=all.slice(start,start+numItems);
          return {page,isDone:start+numItems>=all.length,continueCursor:String(start+page.length)};
        },
        async first() { return run()[0] || null; },
        async unique() { const out = run(); assert(out.length < 2, `unique() matched ${out.length} rows in ${table}`); return out[0] || null; },
      };
      return api;
    },
    async insert(table, value) { const id = `${table}_${++seq}`; rows.set(id, { ...structuredClone(value), _id: id, _seq: seq, table }); return id; },
    async get(id) { const r = rows.get(id); return r ? structuredClone(r) : null; },
    async patch(id, value) {
      const r = rows.get(id);
      assert(r, `patch of missing ${id}`);
      for (const [k, v] of Object.entries(value)) { if (v === undefined) delete r[k]; else r[k] = structuredClone(v); }
    },
    async replace(id, value) { const r = rows.get(id); assert(r); rows.set(id, { ...structuredClone(value), _id: id, _seq: r._seq, table: r.table }); },
    async delete(id) { rows.delete(id); },
    normalizeId(table, id) { return String(id).startsWith(`${table}_`) ? id : null; },
  };
  // Convex file storage stand-in: files are `_storage_N` ids with system metadata.
  const files = new Map(), deleted = [];
  db.system = { get: async id => (files.has(id) ? { _id: id, ...files.get(id) } : null), normalizeId: (table, id) => db.normalizeId(table, id),
    // Only `_storage` by creation time, which is all Hasib reads.
    query: () => {
      const filters = [];
      const range = { gt: (k, v) => (filters.push(f => f[k] > v), range), gte: (k, v) => (filters.push(f => f[k] >= v), range), lt: (k, v) => (filters.push(f => f[k] < v), range), lte: (k, v) => (filters.push(f => f[k] <= v), range) };
      const api = { withIndex: (_index, fn) => (fn?.(range), api), take: async n => [...files].map(([id, f]) => ({ _id: id, ...f })).filter(f => filters.every(x => x(f))).sort((a, b) => a._creationTime - b._creationTime).slice(0, n) };
      return api;
    } };
  const storage = {
    generateUploadUrl: async () => `https://upload.test/${++seq}`,
    getUrl: async id => (files.has(id) ? `https://files.test/${id}` : null),
    get: async id => (files.has(id) ? new Blob([files.get(id).bytes || JPEG_HEAD]) : null),
    delete: async id => { files.delete(id); deleted.push(id); },
  };
  const putFile = ({ contentType = 'image/jpeg', size = 1000, bytes } = {}) => { const id = `_storage_${++seq}`; files.set(id, { contentType, size, bytes, _creationTime: time }); return id; };
  const ctx = { db, storage, scheduler: { runAfter: async (delay, fn, args) => { scheduled.push(args); } } };
  return { ctx, db, rows, scheduled, putFile, deletedFiles: deleted, table: name => matching(name), now: () => time, advance: ms => { time += ms; return time; } };
}

const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
export const SECRET = '9'.repeat(64);
export const APP = '1388038082832745';
