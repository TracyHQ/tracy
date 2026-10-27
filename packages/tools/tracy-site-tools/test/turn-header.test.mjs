/**
 * Which chat turn a site call belongs to (`x-tracy-turn`, plan `tasks/todo-site-changes.md` §6, Q2):
 * the ROOT agent's `<session id>:<turn>`, also for a call a subagent makes — the person's turn is the
 * root's, and the Site changes tab joins a write to its turn by that id alone.
 *
 *   node --test packages/tools/tracy-site-tools/test/turn-header.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createTurnLedger } from '../src/host/turn-header.mjs'

/** dsh's agent registry, as much of it as the ledger reads: who is a root, who owns whom. */
function registry(owners) {
  const agents = Object.keys(owners).map((id) => ({ session: { id } }))
  const byId = new Map(agents.map((a) => [a.session.id, a]))
  return {
    roots: () => agents.filter((a) => owners[a.session.id] === null),
    list: () => [...agents],
    isOwnedBy: (id, owner) => owners[id] === owner.session.id,
    get: (id) => byId.get(id)
  }
}

test("a root agent's call carries its own current turn; a turn it has not reached yet is not guessed", () => {
  const agents = registry({ 'session-root': null })
  const ledger = createTurnLedger(() => agents)
  assert.equal(ledger.turnIdFor('session-root'), null, 'no step seen yet')
  ledger.noteStep('session-root', 3)
  assert.equal(ledger.turnIdFor('session-root'), 'session-root:3')
  ledger.noteStep('session-root', 4)
  assert.equal(ledger.turnIdFor('session-root'), 'session-root:4')
})

test("a subagent's call — two levels deep too — carries the ROOT agent's turn; its own steps never become one", () => {
  const agents = registry({
    'session-root': null,
    'session-sub': 'session-root',
    'session-subsub': 'session-sub'
  })
  const ledger = createTurnLedger(() => agents)
  ledger.noteStep('session-root', 2)
  ledger.noteStep('session-sub', 9) // a subagent's own turn numbering: not the person's turn
  assert.equal(ledger.turnIdFor('session-sub'), 'session-root:2')
  assert.equal(ledger.turnIdFor('session-subsub'), 'session-root:2')
})

test('no registry, a session nobody knows, or a malformed id: null — the write goes out as "unknown turn", never refused', () => {
  const none = createTurnLedger(() => undefined)
  none.noteStep('session-root', 1)
  assert.equal(none.turnIdFor('session-root'), null)
  const ledger = createTurnLedger(() => registry({ 'session-root': null }))
  ledger.noteStep('session-root', 1)
  assert.equal(ledger.turnIdFor('session-gone'), null)
  assert.equal(ledger.turnIdFor(null), null)
  ledger.noteStep('bad id', 1)
  assert.equal(ledger.turnIdFor('bad id'), null)
})
