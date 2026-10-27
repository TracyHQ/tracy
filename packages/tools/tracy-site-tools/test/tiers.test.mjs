import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LOCAL_ACTIONS, RELAY_ACTIONS } from '../src/host/site.mjs'
import { SURFACE_ACTIONS } from '../src/host/surface.mjs'
import { DESTRUCTIVE_ACTIONS, TIERS, tierOf, tiersSentenceFor } from '../src/host/tiers.mjs'

// ADR 0022 opened every door on a quickstart site; what keeps a customer's site safe now is not a
// lock but a TIER on each action: readonly runs freely, mutating runs at once (undo exists), and
// destructive asks the customer first — the door refuses CONFIRM_FIRST until an ask_user_question
// was answered, then takes the same call with confirm:true once (the EmDash D34 rule, on tracy_site).

test('every action tracy_site can run has exactly one tier', () => {
  const all = new Set([...LOCAL_ACTIONS, ...RELAY_ACTIONS, ...Object.values(SURFACE_ACTIONS).flat()])
  for (const action of all)
    assert.ok(['readonly', 'mutating', 'destructive'].includes(TIERS[action]), `${action} has no tier`)
  for (const action of Object.keys(TIERS)) assert.ok(all.has(action), `${action} is a tier of no action`)
})

test('the tiers are what the site context has told the agent to confirm, and reads are never gated', () => {
  assert.deepEqual([...DESTRUCTIVE_ACTIONS].sort(), [
    'content.delete',
    'core.upgrade',
    'db.rollback',
    'extension.enable',
    'extension.install',
    'media.delete',
    'plugin.activate',
    'plugin.install',
    'theme.activate',
    'theme.install'
  ])
  for (const read of [
    'info',
    'content.list',
    'content.get',
    'content.read',
    'db.tables',
    'db.dump',
    'core.manifest',
    'apply.list',
    'page.text',
    'page.look',
    'media.scan',
    'content.find'
  ])
    assert.equal(tierOf(read, {}), 'readonly', read)
  for (const write of [
    'content.update',
    'content.batch',
    'content.replace',
    'media.draw',
    'media.upload',
    'apply.revert',
    'db.snapshot',
    'theme.style',
    'language.install',
    'content.language'
  ])
    assert.equal(tierOf(write, {}), 'mutating', write)
  assert.equal(tierOf('media.delete', {}), 'destructive')
})

test('content.contract is readonly to inspect, mutating to apply, and destructive to retire languages', () => {
  assert.equal(tierOf('content.contract', { operation: 'inspect' }), 'readonly')
  assert.equal(tierOf('content.contract', { operation: 'apply' }), 'mutating')
  assert.equal(tierOf('content.contract', { operation: 'multilingual.restore' }), 'mutating')
  assert.equal(tierOf('content.contract', { operation: 'multilingual.retire' }), 'destructive')
  assert.equal(tierOf('content.contract', {}), 'mutating', 'an apply with no operation named is the default')
})

// 🔒 30/09/2026: "answers CONFIRM_FIRST until you ask_user_question — then the same call with
// confirm:true" read as "ask first": on a quickstart site, where this line is the only word on
// deletes, every v7 delete case asked its own question first and the door asked again.
test('the tiers line says the order: call first, then the one question CONFIRM_FIRST gives', () => {
  const line = tiersSentenceFor(['content.delete', 'content.update'])
  assert.match(line, /destructive \(content\.delete\): call first; CONFIRM_FIRST gives the one question,/)
  assert.match(line, /then the same call with confirm:true\.$/)
  assert.doesNotMatch(line, /until you ask_user_question/)
  // 09/10/2026 (`delete-group.mjs`): a record in several languages is one delete, said where deletes are.
  assert.match(line, /content\.delete takes every language of a record unless locale names one; destructive/)
  assert.doesNotMatch(tiersSentenceFor(['theme.install']), /every language/)
  assert.equal(
    tiersSentenceFor(['content.update']),
    'Tiers: reads run freely; writes run at once, undoably, but hiding, site-wide, 6+ places or money ask too: call first; CONFIRM_FIRST gives the one question, then the same call with confirm:true. Nothing here is destructive.'
  )
  // ADR 0034: the writes that ask (`consequence.mjs`) are named before the deletes, in the same order.
  assert.match(
    line,
    /^Tiers: reads run freely; writes run at once, undoably, but hiding, site-wide, 6\+ places or money ask too; /
  )
})

test('the set-only doors are mutating on set (or new values with no operation) and read-only otherwise', () => {
  for (const action of ['site.identity', 'template.siteSettings', 'template.languageOverrides']) {
    assert.equal(tierOf(action, { operation: 'set' }), 'mutating', `${action} set`)
    assert.equal(tierOf(action, { operation: 'read' }), 'readonly', `${action} read`)
    assert.equal(tierOf(action, {}), 'readonly', `${action} with no operation`)
  }
  assert.equal(tierOf('site.identity', { fields: { sitename: 'Kapsalon' } }), 'mutating')
})
