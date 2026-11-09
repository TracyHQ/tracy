/**
 * The four steps of one place (mock r6-a): which steps are done, the current step with its one line, and the ONE
 * action, from the card's research, brief job, latest brief and demo state. The Details stepper and the list card
 * both read this model, so a card never offers Build demo before a brief exists.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-stepper.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { stepperView } from '../src/client/stepper-model.ts'

const RESEARCHED = { state: 'done', researchedAt: '2026-11-09T11:22:00Z', done: true }
const BRIEF = { id: 'b-3', n: 3, createdAt: '2026-11-09T12:00:00Z' }
const states = (view) => view.steps.map((s) => s.state).join(' ')

test('not started: Research is current with Start research', () => {
  const view = stepperView({
    research: { state: 'not_started', researchedAt: null, done: false },
    researchJob: null,
    demo: 'none'
  })
  assert.equal(states(view), 'current future future future')
  assert.equal(view.lineKey, 'stepper.research.notStarted')
  assert.deepEqual(view.action, { kind: 'start-research', labelKey: 'job.start' })
  assert.equal(view.running, false)
})

test('researching: Research runs, no button but Running', () => {
  const view = stepperView({
    research: { state: 'running', researchedAt: null, done: false },
    researchJob: { state: 'running' },
    demo: 'none'
  })
  assert.equal(view.current, 'research')
  assert.equal(view.running, true)
  assert.equal(view.action, null)
  assert.equal(view.lineKey, 'stepper.research.running')
})

test('a failed research says why and offers Try again', () => {
  const view = stepperView({
    research: { state: 'failed', researchedAt: null, done: false },
    researchJob: { state: 'failed' },
    demo: 'none'
  })
  assert.equal(view.steps[0].failed, true)
  assert.equal(view.errorKey, 'stepper.research.failed')
  assert.equal(view.action?.labelKey, 'action.tryAgain')
})

test('researched: step 1 done with its date, Make content brief', () => {
  const view = stepperView({ research: RESEARCHED, brief: null, demo: 'none' })
  assert.equal(states(view), 'done current future future')
  assert.equal(view.steps[0].doneAt, RESEARCHED.researchedAt)
  assert.equal(view.lineKey, 'stepper.brief.ready')
  assert.deepEqual(view.action, { kind: 'make-brief', labelKey: 'brief.make' })
})

test('brief running: step 2 current, Running', () => {
  const view = stepperView({
    research: RESEARCHED,
    briefJob: { state: 'running', step: 'labelling' },
    brief: null,
    demo: 'none'
  })
  assert.equal(view.current, 'brief')
  assert.equal(view.running, true)
  assert.equal(view.action, null)
  assert.equal(view.lineKey, 'stepper.brief.running')
})

test('brief failed: the failed step is named in plain words, Try again', () => {
  const view = stepperView({
    research: RESEARCHED,
    briefJob: { state: 'failed', step: 'labelling', error: { code: 'VISION_TIMEOUT' } },
    brief: null,
    demo: 'none'
  })
  assert.equal(view.current, 'brief')
  assert.equal(view.steps[1].failed, true)
  assert.equal(view.errorKey, 'brief.job.error.at.labelling')
  assert.doesNotMatch(view.errorKey, /VISION/)
  assert.deepEqual(view.action, { kind: 'retry-brief', labelKey: 'action.tryAgain' })
})

test('brief ready: steps 1 and 2 done, Build demo', () => {
  const view = stepperView({
    research: RESEARCHED,
    briefJob: { state: 'done' },
    brief: BRIEF,
    demo: 'none'
  })
  assert.equal(states(view), 'done done current future')
  assert.equal(view.steps[1].doneAt, BRIEF.createdAt)
  assert.deepEqual(view.action, { kind: 'build', labelKey: 'v3.buildDemo' })
})

test('demo building: step 3 runs', () => {
  for (const demo of ['queued', 'building']) {
    const view = stepperView({ research: RESEARCHED, brief: BRIEF, demo })
    assert.equal(view.current, 'build')
    assert.equal(view.running, true)
    assert.equal(view.action, null)
  }
})

test('a failed or expired demo keeps step 3 current with its own press', () => {
  const failed = stepperView({ research: RESEARCHED, brief: BRIEF, demo: 'failed' })
  assert.equal(failed.action?.kind, 'retry-build')
  assert.equal(failed.steps[2].failed, true)
  const expired = stepperView({ research: RESEARCHED, brief: BRIEF, demo: 'expired' })
  assert.equal(expired.action?.kind, 'rebuild')
})

test('demo ready: step 4 current with Send demo', () => {
  const view = stepperView({
    research: RESEARCHED,
    brief: BRIEF,
    demo: 'ready',
    demoAt: '2026-11-09T13:00:00Z'
  })
  assert.equal(states(view), 'done done done current')
  assert.equal(view.steps[2].doneAt, '2026-11-09T13:00:00Z')
  assert.deepEqual(view.action, { kind: 'send', labelKey: 'v3.sendDemo' })
})

test('demo sent: every step done, no action', () => {
  const view = stepperView({
    research: RESEARCHED,
    brief: BRIEF,
    demo: 'ready',
    sentAt: '2026-11-10T09:00:00Z'
  })
  assert.equal(states(view), 'done done done done')
  assert.equal(view.current, null)
  assert.equal(view.action, null)
  assert.equal(view.steps[3].doneAt, '2026-11-10T09:00:00Z')
})

test('a stale brief still counts as a brief: Build demo, never Make content brief again', () => {
  const view = stepperView({
    research: RESEARCHED,
    brief: { ...BRIEF, current: false },
    demo: 'none'
  })
  assert.equal(view.action?.kind, 'build')
})
