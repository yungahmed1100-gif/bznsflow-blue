import test from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES } from '../src/lib/industries.js';
import { PRIMARY_SECTOR_IDS, sectorPack } from '../config/layla-sector-packs.js';

test('every primary industry has a complete bilingual sector pack', () => {
  const primary = INDUSTRIES.filter(i => i.id !== 'other').map(i => i.id);
  assert.deepEqual(new Set(PRIMARY_SECTOR_IDS), new Set(primary));
  for (const id of primary) {
    const pack = sectorPack(id);
    assert.ok(pack.intents.length >= 6 && pack.intents.length <= 10, id);
    assert.ok(pack.slots.length >= 3, id);
    for (const key of ['greeting','services','price','human','missing']) {
      assert.ok(pack.templates[key].en.length > 10, `${id} ${key} en`);
      assert.ok(pack.templates[key].ar.length > 10, `${id} ${key} ar`);
    }
    assert.equal(pack.fallback.maxClarifications, 1);
    assert.equal(pack.fallback.similarityFloor, 0.72);
  }
});

test('sector packs expose only approved routing intents', () => {
  for (const id of PRIMARY_SECTOR_IDS) {
    const pack = sectorPack(id);
    assert.ok(pack.intents.includes('human') && pack.intents.includes('optout'));
    assert.ok(['booking','catalog','project'].includes(pack.archetype));
  }
});
