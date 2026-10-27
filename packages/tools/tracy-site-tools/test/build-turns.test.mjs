import assert from 'node:assert/strict'
import test from 'node:test'
import { createBuildTurns } from '../src/host/build-turns.mjs'

test('build assignment and plan agreement belong only to the current turn', () => {
  const turns = createBuildTurns()
  turns.observe('a', 7, { ok: true, planHash: 'saved' }, 7, 100)
  assert.equal(turns.state('a', 7)?.build, true)
  assert.equal(turns.state('a', 7)?.planned, true)
  assert.equal(turns.state('a', 8), null)
  turns.observe('a', 8, { ok: true }, 8, 200)
  assert.equal(turns.state('a', 8)?.build, true)
  assert.equal(turns.state('a', 8)?.planned, false)
  // A late success or refusal from the former build cannot change the retry.
  turns.observe('a', 7, { ok: true, planHash: 'old' }, 8, 300)
  turns.observe('a', 7, { code: 'AGENT_DEMO_ACTION_CLOSED' }, 8, 400)
  assert.deepEqual(turns.state('a', 8), {
    closedBuild: false,
    build: true,
    planned: false,
    planCheckedAt: null
  })
})

test('closed and unbound demo calls cannot create or retain a build exemption', () => {
  for (const code of ['AGENT_DEMO_NOT_GRANTED', 'AGENT_DEMO_ACTION_CLOSED', 'AGENT_DEMO_TURN_NOT_BOUND']) {
    const turns = createBuildTurns()
    turns.observe('a', 3, { code }, 3, 10)
    assert.equal(turns.state('a', 3)?.build ?? false, false)
    turns.observe('a', 4, { ok: true, planHash: 'p' }, 4, 20)
    turns.observe('a', 4, { ok: false, code }, 4, 30)
    assert.equal(turns.state('a', 3)?.build ?? false, false)
    assert.equal(turns.state('a', 4)?.planned ?? false, false)
    turns.observe('a', 4, { ok: true, planHash: 'late success' }, 4, 25)
    assert.equal(turns.state('a', 4)?.build, false)
  }
})

test('same-turn transient refusals retain assignment; unknown turn and old bounded entries cannot grant it', () => {
  const turns = createBuildTurns(2)
  turns.observe('a', null, { ok: true }, null, 1)
  assert.equal(turns.state('a', null), null)
  turns.observe('a', 1, { ok: true, planHash: 'p' }, 1, 2)
  turns.observe('a', 1, { code: 'AGENT_DEMO_PLAN_FROZEN' }, 1, 3)
  assert.equal(turns.state('a', 1)?.planned, true)
  turns.observe('b', 1, { ok: true }, 1, 4)
  turns.observe('c', 1, { ok: true }, 1, 5)
  assert.equal(turns.state('a', 1), null)
  assert.equal(turns.state('b', 1)?.build, true)
})

test('ordinary responses do not postpone a negative plan lookup', () => {
  const turns = createBuildTurns()
  turns.observe('a', 1, { ok: true }, 1, 100, true)
  turns.observe('a', 1, { ok: true }, 1, 5000)
  assert.equal(turns.state('a', 1)?.planCheckedAt, 100)
  turns.observe('a', 1, { ok: true, planHash: 'saved' }, 1, 6000)
  assert.equal(turns.state('a', 1)?.planned, true)
})

test('closed build latch blocks only that turn without granting a confirmation exemption', () => {
  for (const code of ['AGENT_DEMO_ACTION_CLOSED', 'AGENT_DEMO_TURN_NOT_BOUND']) {
    const turns = createBuildTurns()
    turns.observe('a', 1, { ok: true, planHash: 'p' }, 1)
    turns.observe('a', 1, { code }, 1)
    assert.equal(turns.state('a', 1)?.closedBuild, true)
    assert.equal(turns.state('a', 1)?.build, false)
    for (const answer of [{ ok: true }, { code: 'AGENT_DEMO_NOT_GRANTED' }]) {
      turns.observe('a', 1, answer, 1)
      assert.equal(turns.state('a', 1)?.closedBuild, true)
      assert.equal(turns.state('a', 1)?.build, false)
    }
    turns.observe('a', 2, { ok: true }, 2)
    turns.observe('a', 1, { code }, 2)
    assert.equal(turns.state('a', 2)?.closedBuild, false)
    assert.equal(turns.state('a', 2)?.build, true)
  }
})

test('first closed response fences the build; an ordinary owner without a binding stays ordinary', () => {
  for (const code of ['AGENT_DEMO_NOT_GRANTED', 'AGENT_DEMO_TURN_NOT_BOUND', 'AGENT_DEMO_ACTION_CLOSED']) {
    const turns = createBuildTurns()
    turns.observe('a', 1, { code }, 1)
    assert.equal(turns.state('a', 1)?.closedBuild, code === 'AGENT_DEMO_ACTION_CLOSED')
    turns.observe('a', 2, { code: 'AGENT_DEMO_NOT_GRANTED' }, 2)
    assert.equal(turns.state('a', 2)?.closedBuild, false)
  }
})

test('a closed-action refusal tightens a prior not-granted terminal answer without restoring build rights', () => {
  const turns = createBuildTurns()
  turns.observe('a', 1, { code: 'AGENT_DEMO_NOT_GRANTED' }, 1)
  assert.equal(turns.state('a', 1)?.closedBuild, false)
  turns.observe('a', 1, { code: 'AGENT_DEMO_ACTION_CLOSED' }, 1)
  assert.equal(turns.state('a', 1)?.closedBuild, true)
  turns.observe('a', 1, { ok: true, planHash: 'late' }, 1)
  assert.equal(turns.state('a', 1)?.build, false)
  assert.equal(turns.state('a', 1)?.planned, false)
})
