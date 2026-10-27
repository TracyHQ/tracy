// Which Apply calls change the site (`changesSite`, `src/sites/route.js`) — the rule that decides the
// write lease and the Site changes row. No Postgres: the rule alone.
//
//   node --test apps/tracy-web/test/apply-door-writes.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changesSite } from '../src/sites/route.js'

/**
 * 🔒 14/10/2026 (ladder DL14/DL15): the agent's `tracy_site` now carries `site.identity`, the site name's
 * recorded door, and reads the name before it changes it. The plugin writes on `set` alone (`read` is its
 * default operation); a read counted as a write took the site's write lease and wrote a Site changes row
 * for a change that never happened.
 */
test('site.identity changes the site on "set" only; its read, with or without an operation, does not', () => {
  assert.equal(
    changesSite('site.identity', { operation: 'set', fields: { sitename: 'x' }, apply_id: 'a' }),
    true
  )
  assert.equal(changesSite('site.identity', { operation: 'read' }), false)
  assert.equal(changesSite('site.identity', {}), false)
  assert.equal(changesSite('site.identity', { fields: ['sitename'] }), false)
})

test('the rule for every other action stands: writes write, reads and the receipts list do not', () => {
  assert.equal(changesSite('content.update', { kind: 'article', id: 1, fields: { featured: 0 } }), true)
  assert.equal(changesSite('content.delete', { kind: 'article', id: 1 }), true)
  assert.equal(changesSite('apply.revert', { apply_id: 'a' }), true)
  assert.equal(changesSite('apply.list', {}), false)
  assert.equal(changesSite('content.get', { kind: 'article', id: 1 }), false)
  assert.equal(changesSite('content.contract', { operation: 'inspect' }), false)
  assert.equal(changesSite('content.contract', { operation: 'apply' }), true)
})

test('the template settings and language override doors write on set only, like site.identity (the plugin rule)', () => {
  for (const action of ['site.identity', 'template.siteSettings', 'template.languageOverrides']) {
    assert.equal(changesSite(action, { operation: 'set' }), true, `${action} set`)
    assert.equal(changesSite(action, { operation: 'read' }), false, `${action} read`)
    assert.equal(changesSite(action, {}), false, `${action} with no operation reads`)
  }
  // Apply reads the overrides page by page: none of those reads is a change
  assert.equal(
    changesSite('template.languageOverrides', { operation: 'read', language: 'nl-NL', page: 2 }),
    false
  )
})
