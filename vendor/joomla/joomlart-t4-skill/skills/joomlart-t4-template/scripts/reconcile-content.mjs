#!/usr/bin/env node
// Reconcile desired content against a read-only Joomla inventory. Never allocate database IDs.
import {readFileSync, realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const entities = {
  categories: ['extension','parent_id','alias','language'],
  articles: ['catid','alias','language'],
  menus: ['menutype'],
  menuItems: ['menutype','parent_id','alias','language','client_id'],
  modules: ['note','client_id']
};
const object = x => x && typeof x === 'object' && !Array.isArray(x);
export function reconcile(desired, inventory) {
  if (!object(desired) || !object(inventory)) throw new Error('Desired content and inventory must be objects');
  const operations = [];
  for (const [entity, keys] of Object.entries(entities)) {
    const rows = inventory[entity];
    if (!Array.isArray(rows)) throw new Error(`Inventory missing ${entity}; an omitted table is not an empty table`);
    const index = new Map();
    const keyOf = row => {
      if (!object(row) || keys.some(k => row[k] === undefined || row[k] === null || row[k] === ''))
        throw new Error(`${entity} identity requires ${keys.join(', ')}`);
      return JSON.stringify(keys.map(k => String(row[k])));
    };
    for (const row of rows) {
      if (entity === 'modules' && !row.note) continue;
      const key = keyOf(row);
      if (!Number.isSafeInteger(row.id) || row.id < 1 || index.has(key)) throw new Error(`Ambiguous inventory identity in ${entity}: ${key}`);
      index.set(key,row);
    }
    const seen = new Set();
    if (desired[entity] !== undefined && !Array.isArray(desired[entity])) throw new Error(`Desired ${entity} must be an array`);
    for (const row of desired[entity] ?? []) {
      if ('id' in row) throw new Error('Desired records use natural keys, not fixed IDs');
      const key = keyOf(row);
      if (seen.has(key)) throw new Error(`Duplicate desired identity in ${entity}: ${key}`);
      seen.add(key);
      const before = index.get(key);
      const values = Object.fromEntries(Object.entries(row).filter(([k,v]) => !before || JSON.stringify(before[k]) !== JSON.stringify(v)));
      operations.push({entity, action: !before ? 'create' : Object.keys(values).length ? 'update' : 'keep',
        id: before?.id ?? null, key: Object.fromEntries(keys.map(k=>[k,row[k]])), values,
        // Detect a stale inventory before applying, rather than overwrite intervening admin edits.
        expected: before ? Object.fromEntries(Object.keys(row).map(k=>[k,before[k] ?? null])) : null});
    }
  }
  return {version:1, operations, counts:Object.fromEntries(['create','update','keep'].map(k=>[k,operations.filter(o=>o.action===k).length])),
    next:'Apply with Joomla Table/model APIs inside a transaction; re-read identity and expected fields first, preserve unspecified fields and relationships. Re-export inventory and reconcile again: all rows must be keep.'};
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { const [desired, inventory] = process.argv.slice(2); console.log(JSON.stringify(reconcile(JSON.parse(readFileSync(desired)),JSON.parse(readFileSync(inventory))),null,2)); }
  catch(e) { console.error(e.message); process.exitCode=2; }
}
