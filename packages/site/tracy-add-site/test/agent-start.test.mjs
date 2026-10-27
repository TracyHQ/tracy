#!/usr/bin/env node
/**
 * The last step of the wizard: the agent, started by the wizard itself once the copy is built.
 *
 * "Ready" has ONE definition, shared with My Sites: the site's row in `GET /api/sites` carries a
 * non-null `agent`. Pinned here so the wizard and My Sites cannot drift apart on what "up" means,
 * and so the patience window — the only thing that turns a long wait into a failure — is a number
 * someone chose, not a number that happened.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { agentStage, handoverAction, START_PATIENCE_MS, START_POLL_MS } from '../src/client/agent-start.mjs'

const T0 = 1_700_000_000_000

test('ready the moment the site row carries an agent', () => {
  const rows = [{ siteKey: 'shop.example', agent: 'shop-example-agent.tracy.ai' }]
  assert.equal(agentStage({ rows, siteKey: 'shop.example', since: T0, now: T0 + 1000 }), 'ready')
})

test('still starting while the row has no agent and patience is not out', () => {
  const rows = [{ siteKey: 'shop.example', agent: null }]
  assert.equal(
    agentStage({ rows, siteKey: 'shop.example', since: T0, now: T0 + START_PATIENCE_MS - 1 }),
    'starting'
  )
})

test('still starting while the list does not carry the row at all — a stale list is not a verdict', () => {
  assert.equal(agentStage({ rows: [], siteKey: 'shop.example', since: T0, now: T0 + 5000 }), 'starting')
})

test('failed once patience runs out with no agent', () => {
  const rows = [{ siteKey: 'shop.example', agent: null }]
  assert.equal(
    agentStage({ rows, siteKey: 'shop.example', since: T0, now: T0 + START_PATIENCE_MS }),
    'failed'
  )
})

test("another site's agent does not count", () => {
  const rows = [{ siteKey: 'other.example', agent: 'other-agent.tracy.ai' }]
  assert.equal(agentStage({ rows, siteKey: 'shop.example', since: T0, now: T0 + 1000 }), 'starting')
})

test('an agent that appears after patience ran out still wins — ready beats failed', () => {
  const rows = [{ siteKey: 'shop.example', agent: 'shop-example-agent.tracy.ai' }]
  assert.equal(
    agentStage({ rows, siteKey: 'shop.example', since: T0, now: T0 + START_PATIENCE_MS * 2 }),
    'ready'
  )
})

test('the handover offers exactly one action per stage', () => {
  assert.equal(handoverAction('ready'), 'open')
  assert.equal(handoverAction('failed'), 'retry')
  assert.equal(handoverAction('starting'), 'wait')
})

test('poll and patience mirror My Sites, so both surfaces wait the same way', () => {
  // My Sites keeps its two numbers module-private (`src/client/index.tsx`), so they are read there.
  const mySites = readFileSync(new URL('../../tracy-my-sites/src/client/index.tsx', import.meta.url), 'utf8')
  const valueOf = (name) => {
    const expr = new RegExp(`^const ${name} = ([\\d_ *]+)$`, 'm').exec(mySites)?.[1]
    assert.ok(expr, `tracy-my-sites no longer declares ${name} as a plain number`)
    return expr.split('*').reduce((product, n) => product * Number(n.trim().replaceAll('_', '')), 1)
  }
  assert.equal(START_POLL_MS, valueOf('START_POLL_MS'))
  assert.equal(START_PATIENCE_MS, valueOf('START_PATIENCE_MS'))
})
