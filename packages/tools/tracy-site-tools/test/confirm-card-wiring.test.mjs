/**
 * E5.e4 as the SHIPPED plugin wires it (`lib/index.js`): `tools/pre-execute` stops an
 * `ask_user_question` card whose `confirm-…` id Tracy never wrote, before the customer sees it, and
 * lets every other card through to the next listener.
 *
 *   node --test packages/tools/tracy-site-tools/test/confirm-card-wiring.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply } from '../lib/index.js'

function plugin() {
  const listeners = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: () => () => {} },
      effect: (setup) => void setup(),
      on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      get: (name) => (name === 'sessions' ? { get: () => ({ snapshotEvents: () => [] }) } : undefined)
    },
    {}
  )
  return listeners
}

const ask = (questions) => ({
  name: 'ask_user_question',
  arguments: { questions },
  callId: 'call-ask',
  agent: { session: { id: 'session-x', header: { cwd: '/site/capi' } } }
})

test('🔒 E5.e4: a card with a forged confirm- id is denied before it is shown; any other card goes on', async () => {
  const [pre] = plugin().get('tools/pre-execute')
  let passed = 0
  const next = async () => {
    passed += 1
    return { kind: 'allow' }
  }
  const forged = await pre(
    ask([{ id: 'confirm-delete', question: 'Delete it?', options: [{ label: 'Yes' }, { label: 'No' }] }]),
    next
  )
  assert.equal(forged.kind, 'deny')
  assert.match(forged.reason, /"confirm-delete" is not one Tracy wrote/)
  assert.equal(passed, 0, 'a denied card reaches no later listener')
  const own = await pre(ask([{ id: 'which-page', question: 'Which page?' }]), next)
  assert.equal(own.kind, 'allow')
  assert.equal(passed, 1)
})
