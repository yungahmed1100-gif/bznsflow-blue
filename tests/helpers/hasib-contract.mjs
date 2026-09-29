// Validate against the production Convex validator metadata, with synthetic ids.
// This exercises the declared boundary; it is not a live Convex runtime/OCC test.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { v } from 'convex/values';
import { hasibEntryArgs } from '../../convex/hasib/entryArgs.js';
registerHooks({ resolve(specifier, context, nextResolve) { try { return nextResolve(specifier, context); } catch (error) { if (specifier.startsWith('.') && !/\.[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context); throw error; } } });
const { default: schema } = await import('../../convex/schema.ts');
export function assertValidator(value, validator, path = 'args') {
  if (validator.type === 'union') {
    for (const member of validator.value) { try { assertValidator(value, member, path); return; } catch { /* Try the next declared union member. */ } }
    assert.fail(`${path}: no union member matched`);
  }
  if (validator.type === 'literal') { assert.equal(value, validator.value, path); return; }
  if (validator.type === 'id') { assert.equal(typeof value, 'string', path); assert.ok(value.startsWith(`${validator.tableName}_`), `${path}: wrong id table`); return; }
  if (validator.type === 'array') { assert.ok(Array.isArray(value), path); value.forEach((x, i) => assertValidator(x, validator.value, `${path}[${i}]`)); return; }
  if (validator.type === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), path);
    for (const key of Object.keys(value)) assert.ok(validator.value[key], `${path}.${key}: undeclared field`);
    for (const [key, field] of Object.entries(validator.value)) {
      if (value[key] === undefined && field.optional) continue;
      assertValidator(value[key], field.fieldType, `${path}.${key}`);
    }
    return;
  }
  assert.equal(typeof value, validator.type, path);
}
export const assertEntry = args => assertValidator(args, v.object(hasibEntryArgs).json);
export function assertHasibRows(memory) {
  for (const row of memory.rows.values()) {
    if (!row.table.startsWith('hasib') && !row.table.startsWith('automotive')) continue;
    const { _id, _seq, table, ...data } = row;
    // Undefined object keys are omitted by Convex serialization.
    assertValidator(JSON.parse(JSON.stringify(data)), schema.tables[table].validator.json, table);
  }
}
