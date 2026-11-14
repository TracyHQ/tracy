// The build run of an approved draft as Contract B (#610, `build-draft/build-progress.js`): what the site creation and
// the step chain recorded, turned into the progress event and outcome the chat draws. Pure; every value is invented.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-build-progress.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { progressOf, stoppedOf } from '../../../packages/core/tracy-core/src/build-chat/index.mjs'
import { buildRunOf, engineLinesOf } from '../src/build-draft/build-progress.js'

const pages = [
  { id: 'home', name: 'Home' },
  { id: 'classes', name: 'Classes' }
]
const APPROVED = '2026-11-14T10:00:00.000Z'
const build = (extra = {}) => ({
  id: '0f0e0d0c-0b0a-4908-8706-050403020100',
  plan: { id: 'plan-1', revision: 3 },
  approvedAt: APPROVED,
  snapshot: { plan: { id: 'plan-1', revision: 3, pages } },
  site: { siteKey: 'site-rivermoor.tracy.test' },
  refusal: null,
  endedAt: null,
  ...extra
})
const at = (seconds) => Date.parse(APPROVED) + seconds * 1000
const line = (step, outcome = 'done', attempt = 1, extra = {}) => ({ step, attempt, outcome, ...extra })

test('while the host installs the site every step is pending and the run is running', () => {
  const made = buildRunOf({ build: build(), brief: null, job: { state: 'running' }, now: at(42) })
  assert.deepEqual(made.problems, [])
  assert.equal(made.final, false)
  const event = made.run.events[0]
  assert.equal(event.schema, 'tracy-build-progress/v1')
  assert.equal(event.elapsedSeconds, 42)
  assert.deepEqual(
    event.steps.map((s) => [s.id, s.kind, s.state]),
    [
      ['look', 'look', 'pending'],
      ['writer:home', 'writer', 'pending'],
      ['writer:classes', 'writer', 'pending'],
      ['pictures', 'pictures', 'pending'],
      ['write', 'write', 'pending']
    ]
  )
  assert.equal(progressOf(made.run).running, true)
})

test('the draft run steps map onto Contract B: the reading steps carry the look, copy carries every page', () => {
  const lines = engineLinesOf([line('site'), line('kit'), line('copy')], pages)
  assert.deepEqual(
    lines.map((l) => l.step),
    ['look', 'writer:home', 'writer:classes']
  )
  const made = buildRunOf({
    build: build(),
    brief: {
      state: 'preparing',
      timings: {
        chain: {
          ending: 'running',
          steps: [line('doors'), line('kit'), line('brand'), line('plan')],
          running: ['copy', 'pictures']
        }
      }
    },
    now: at(90)
  })
  assert.deepEqual(made.problems, [])
  const items = progressOf(made.run).items.map((i) => [i.id, i.state])
  assert.deepEqual(items, [
    ['look', 'done'],
    ['writer:home', 'running'],
    ['writer:classes', 'running'],
    ['pictures', 'running'],
    ['write', 'pending']
  ])
})

test('a run whose write step completed is a done outcome', () => {
  const steps = ['doors', 'kit', 'brand', 'plan', 'copy', 'pictures', 'icons', 'order', 'write'].map((s) =>
    line(s)
  )
  const made = buildRunOf({
    build: build({ endedAt: '2026-11-14T10:07:48.000Z' }),
    brief: { state: 'applied', timings: { chain: { ending: 'complete', steps } } },
    now: at(9999)
  })
  assert.deepEqual(made.problems, [])
  assert.equal(made.final, true)
  assert.equal(made.run.outcome.result, 'done')
  assert.equal(made.run.outcome.elapsedSeconds, 468)
  assert.equal(stoppedOf(made.run.outcome), null)
})

test('a page writer that failed twice stops the run at a writer step, with the reason kept for the team', () => {
  const steps = [
    ...['doors', 'kit', 'brand', 'plan', 'pictures'].map((s) => line(s)),
    line('copy', 'failed, re-running', 1),
    line('copy', 'failed', 2, { code: 'copy_check_failed' })
  ]
  const made = buildRunOf({
    build: build(),
    brief: {
      state: 'failed',
      timings: {
        chain: {
          ending: 'stopped',
          steps,
          stop: { step: 'copy', attempts: 2, code: 'copy_check_failed', error: 'x' }
        }
      }
    },
    now: at(300)
  })
  assert.deepEqual(made.problems, [])
  const outcome = made.run.outcome
  assert.equal(outcome.result, 'stopped')
  assert.equal(outcome.stopped.step, 'writer:home')
  assert.equal(outcome.stopped.teamNotified, true)
  const notice = stoppedOf(outcome)
  assert.equal(notice.step, 'Write the Home page')
  assert.equal(notice.twice, true)
  assert.equal(notice.siteUnchanged, true)
})

test('a site the create door refused, or a provision that failed, stops the run before any step', () => {
  for (const input of [
    { build: build({ site: null, refusal: { code: 'STEP_CHAIN_OFF', status: 409 } }) },
    { build: build(), job: { state: 'failed', reason: 'install failed' } }
  ]) {
    const made = buildRunOf({ ...input, now: at(20) })
    assert.deepEqual(made.problems, [])
    assert.equal(made.final, true)
    assert.equal(made.run.outcome.result, 'stopped')
    assert.equal(made.run.outcome.steps.filter((s) => s.state === 'failed').length, 1)
    assert.equal(made.run.outcome.steps.find((s) => s.state === 'failed').noRerun, true)
  }
})

test('a write step that failed once is a stopped outcome at the write step', () => {
  const steps = [
    ...['doors', 'kit', 'brand', 'plan', 'copy', 'pictures', 'icons', 'order'].map((s) => line(s)),
    line('write', 'failed', 1, { code: 'write_not_ready_for_draft' })
  ]
  const made = buildRunOf({
    build: build(),
    brief: {
      state: 'failed',
      timings: {
        chain: {
          ending: 'stopped',
          steps,
          stop: { step: 'write', attempts: 1, code: 'write_not_ready_for_draft' }
        }
      }
    },
    now: at(200)
  })
  assert.deepEqual(made.problems, [])
  assert.equal(made.run.outcome.stopped.step, 'write')
  assert.equal(stoppedOf(made.run.outcome).writtenPages, 2)
})
