// The build chat's real tool results as data (#609): what `tracy_build` answered (in the shape `build-tool.mjs` renders
// it, one JSON text block) becomes the template card, the one living plan card and a quiet tool row, folded from the
// session's own `tool/call` and `tool/result` events. The events below are recorded shapes with invented data.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BUILD_TOOL,
  buildToolFoldOf,
  buildToolResultOf,
  buildToolRowOf,
  canRetryStop,
  isPlanReviewRequest,
  PLAN_REVIEW_ID,
  planReviewRequestOf
} from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments, TEMPLATES } from './fixtures/build-chat/stages.mjs'

const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan

let seq = 0
const call = (turn, callId, args, name = BUILD_TOOL) => ({
  type: 'tool/call',
  seq: ++seq,
  data: { turn, name, callId, arguments: JSON.stringify(args) }
})
const result = (turn, callId, value, extra = {}) => ({
  type: 'tool/result',
  seq: ++seq,
  surfaceOp: 'append',
  data: {
    turn,
    message: { source: { callId }, isError: false, content: [{ type: 'text', text: JSON.stringify(value) }] },
    ...extra
  }
})
const planResult = (revision) => ({ plan: { id: 'plan-1', revision }, review: planReviewRequestOf(plan()) })

test('every result shape the tool returns is told apart', () => {
  assert.equal(
    buildToolResultOf(JSON.stringify({ profile: { business: 'Sunrise', counts: {} } })).kind,
    'research'
  )
  assert.equal(buildToolResultOf(JSON.stringify({ options: TEMPLATES, none: false })).kind, 'templates')
  assert.deepEqual(buildToolResultOf(JSON.stringify(planResult(3))), {
    kind: 'plan',
    id: 'plan-1',
    revision: 3
  })
  assert.equal(buildToolResultOf(JSON.stringify({ running: true, say: 'Still working.' })).kind, 'running')
  assert.equal(buildToolResultOf(JSON.stringify({ stopped: true, say: 'Not prepared.' })).kind, 'stopped')
  assert.equal(buildToolResultOf(JSON.stringify({ refused: true, next: 'x' })).kind, 'quiet')
  assert.equal(buildToolResultOf(JSON.stringify({ stale: true, next: 'x' })).kind, 'quiet')
  assert.equal(buildToolResultOf(JSON.stringify({ idle: true, next: 'x' })).kind, 'quiet')
  assert.equal(buildToolResultOf(JSON.stringify({ missing: 'template', next: 'x' })).kind, 'quiet')
  assert.equal(buildToolResultOf(JSON.stringify({ look: 'ready', next: 'x' })).kind, 'quiet')
  assert.equal(buildToolResultOf('not json'), null)
  assert.equal(
    buildToolResultOf(JSON.stringify({ plan: { id: 'p' } })),
    null,
    'a plan without a revision is no plan'
  )
})

test('the tool row says what happened in plain words, never the JSON', () => {
  const research = buildToolRowOf(
    JSON.stringify({ action: 'research', links: ['https://sunrise.example', 'https://maps.example/x'] }),
    JSON.stringify({ profile: { business: 'Sunrise Tennis Club', counts: { services: 4 } } })
  )
  assert.deepEqual(research, { kind: 'research', sources: 2, business: 'Sunrise Tennis Club' })
  assert.deepEqual(
    buildToolRowOf(JSON.stringify({ action: 'research', description: 'A tennis club' }), null),
    { kind: 'working', step: 'research' }
  )
  assert.deepEqual(buildToolRowOf(JSON.stringify({ action: 'plan' }), JSON.stringify(planResult(1))), {
    kind: 'plan'
  })
  assert.deepEqual(buildToolRowOf(JSON.stringify({ action: 'edit' }), JSON.stringify(planResult(2))), {
    kind: 'edit'
  })
  assert.deepEqual(
    buildToolRowOf(
      JSON.stringify({ action: 'templates' }),
      JSON.stringify({ options: TEMPLATES, none: false })
    ),
    { kind: 'templates' }
  )
  assert.deepEqual(buildToolRowOf('{"action":"status"}', JSON.stringify({ running: true, say: 'x' })), {
    kind: 'working',
    step: 'status'
  })
  assert.deepEqual(buildToolRowOf('{"action":"plan"}', JSON.stringify({ stopped: true, say: 'x' })), {
    kind: 'stopped'
  })
  assert.equal(buildToolRowOf('{"action":"edit"}', JSON.stringify({ stale: true })), null)
  assert.equal(buildToolRowOf('{"action":"edit"}', 'garbage'), null)
})

test('the fold keeps the latest templates and the latest plan of the session, by turn', () => {
  const events = [
    { type: 'turn/start', seq: ++seq, data: { turn: 0 } },
    call(0, 'c1', { action: 'research', links: ['https://sunrise.example'] }),
    result(0, 'c1', { profile: { business: 'Sunrise', counts: {} } }),
    call(1, 'c2', { action: 'templates' }),
    result(1, 'c2', { options: TEMPLATES, none: false }),
    call(2, 'c3', { action: 'plan' }),
    result(2, 'c3', planResult(1)),
    // another tool and an unrelated result never count
    call(2, 'x1', { path: 'a' }, 'read_file'),
    result(2, 'x1', planResult(9)),
    call(3, 'c4', { action: 'edit', changes: [] }),
    result(3, 'c4', planResult(2))
  ]
  const fold = events.reduce(buildToolFoldOf, undefined)
  assert.equal(fold.templates.turn, 1)
  assert.equal(fold.templates.options.length, TEMPLATES.length)
  assert.deepEqual(
    { turn: fold.plan.turn, id: fold.plan.id, revision: fold.plan.revision },
    {
      turn: 3,
      id: 'plan-1',
      revision: 2
    }
  )
})

test('an error, a replaced result or a stop never moves the plan', () => {
  const start = [call(0, 'c1', { action: 'plan' }), result(0, 'c1', planResult(1))].reduce(
    buildToolFoldOf,
    undefined
  )
  const err = result(1, 'c2', planResult(5))
  err.data.message.isError = true
  const replaced = { ...result(1, 'c3', planResult(6)), surfaceOp: 'replace' }
  const after = [
    call(1, 'c2', { action: 'edit' }),
    err,
    call(1, 'c3', { action: 'edit' }),
    replaced,
    call(1, 'c5', { action: 'plan' }),
    result(1, 'c5', { stopped: true, say: 'x' })
  ].reduce(buildToolFoldOf, start)
  assert.equal(after.plan.turn, 0)
  assert.equal(after.plan.revision, 1)
})

test('the fold says a tracy_build call is still working: unanswered or answered running, until another answer', () => {
  const steps = [
    call(4, 'w1', { action: 'plan' }),
    result(4, 'w1', { running: true, say: 'Still working.' }),
    call(4, 'w2', { action: 'status' }),
    result(4, 'w2', { look: 'ready' })
  ]
  const seen = []
  steps.reduce((state, event) => {
    const next = buildToolFoldOf(state, event)
    seen.push(next.working && { turn: next.working.turn, step: next.working.step })
    return next
  }, undefined)
  assert.deepEqual(seen, [
    { turn: 4, step: 'plan' },
    { turn: 4, step: 'plan' },
    { turn: 4, step: 'status' },
    null
  ])
  const failed = result(5, 'w3', { plan: { id: 'plan-1', revision: 3 } })
  failed.data.message.isError = true
  const afterError = [call(5, 'w3', { action: 'plan' }), failed].reduce(buildToolFoldOf, undefined)
  assert.equal(afterError.working, null, 'an error ends the wait')
  const other = [call(6, 'w4', { action: 'plan' }), call(6, 'r1', { path: 'a' }, 'read_file')].reduce(
    buildToolFoldOf,
    undefined
  )
  assert.equal(other.working.step, 'plan', 'another tool never ends it')
})

test('the plan review request is told by its id alone: dsh drops detail and intent', () => {
  const asked = planReviewRequestOf(plan()).questions.map(({ id, question, options }) => ({
    id,
    question,
    options
  }))
  assert.equal(PLAN_REVIEW_ID, 'plan-review')
  assert.equal(isPlanReviewRequest(asked), true)
  assert.equal(isPlanReviewRequest([...asked, { id: 'q-2', question: 'x', options: [] }]), false)
  assert.equal(isPlanReviewRequest([{ id: 'main-button', question: 'x', options: [] }]), false)
  assert.equal(
    isPlanReviewRequest([{ id: 'plan-review', question: 'x', options: [] }]),
    false,
    'a review that names no plan revision is not claimed'
  )
  assert.equal(isPlanReviewRequest(undefined), false)
})

test('a change request answer carries what changed and what was not done, for the plan card', () => {
  const revised = {
    ...planResult(4),
    unchanged: false,
    revision: {
      changed: ['Changed the tagline.', 42, 'Removed a service.'],
      notDone: [
        { what: 'Change the language', why: 'The language is set on the plan card.' },
        { what: 'bad entry' }
      ]
    }
  }
  assert.deepEqual(buildToolResultOf(JSON.stringify(revised)), {
    kind: 'plan',
    id: 'plan-1',
    revision: 4,
    revised: {
      changed: ['Changed the tagline.', 'Removed a service.'],
      notDone: [{ what: 'Change the language', why: 'The language is set on the plan card.' }]
    }
  })
  const fold = [call(7, 'c1', { action: 'revise' }), result(7, 'c1', revised)].reduce(
    buildToolFoldOf,
    undefined
  )
  assert.equal(fold.plan.revision, 4)
  assert.deepEqual(fold.plan.revised.changed, ['Changed the tagline.', 'Removed a service.'])
  // A compose or edit answer has no change request: no note.
  assert.equal('revised' in buildToolResultOf(JSON.stringify(planResult(2))), false)
})

test('the codes of a change request answer stay beside the lines they name; an answer without codes has none', () => {
  const revised = {
    ...planResult(4),
    unchanged: false,
    revision: {
      changed: ['Your answer is saved: Opening hours, Mon to Sat 06:30 to 21:30.', 42, 'A model line.'],
      notDone: [
        { what: 'bad entry' },
        { what: 'Services', why: 'The plan already has this page.' },
        { what: 'A gallery', why: 'The model said so.' }
      ],
      codes: {
        changed: ['owner_value_saved', 'page-added', null],
        notDone: ['nothing_to_change', 'page_already_on_plan', null]
      }
    }
  }
  const read = buildToolResultOf(JSON.stringify(revised))
  assert.deepEqual(read.revised, {
    changed: ['Your answer is saved: Opening hours, Mon to Sat 06:30 to 21:30.', 'A model line.'],
    notDone: [
      { what: 'Services', why: 'The plan already has this page.' },
      { what: 'A gallery', why: 'The model said so.' }
    ],
    codes: { changed: ['owner_value_saved', null], notDone: ['page_already_on_plan', null] }
  })
  const fold = [call(7, 'c1', { action: 'revise' }), result(7, 'c1', revised)].reduce(
    buildToolFoldOf,
    undefined
  )
  assert.deepEqual(fold.plan.revised.codes, read.revised.codes)
  // Codes that are not texts, or lists that run short, read as null; no codes at all, no `codes`.
  const odd = { ...revised, revision: { ...revised.revision, codes: { changed: [7], notDone: 'x' } } }
  assert.deepEqual(buildToolResultOf(JSON.stringify(odd)).revised.codes, {
    changed: [null, null],
    notDone: [null, null]
  })
  const none = { ...revised, revision: { changed: ['A line.'], notDone: [] } }
  assert.equal('codes' in buildToolResultOf(JSON.stringify(none)).revised, false)
})

test('an edit the agent made leaves a note of the values it changed; a compose leaves none', () => {
  const changes = [
    { field: 'look.accent', value: '#123456' },
    { field: 'facts[name].value', value: { not: 'text' } },
    { field: 'pictures.generated.frames', value: 3 }
  ]
  const fold = [call(8, 'e1', { action: 'edit', changes }), result(8, 'e1', planResult(5))].reduce(
    buildToolFoldOf,
    undefined
  )
  assert.deepEqual(fold.plan.revised, {
    changed: [],
    notDone: [],
    edits: [
      { field: 'look.accent', value: '#123456' },
      { field: 'pictures.generated.frames', value: 3 }
    ]
  })
  const composed = [call(9, 'p1', { action: 'plan' }), result(9, 'p1', planResult(6))].reduce(
    buildToolFoldOf,
    fold
  )
  assert.equal('revised' in composed.plan, false, 'a newer compose has no note')
})

/** The events of one stopped answer and what the owner may do about it (#609). */
const stoppedRun = (turn, id, action, answer) => [call(turn, id, { action }), result(turn, id, answer)]
const RERUN = { stopped: true, say: 'It stopped.', step: 'compose', rerun: true }

test('a stopped answer says whether the step may be rerun, and which step it was', () => {
  assert.deepEqual(buildToolResultOf(JSON.stringify(RERUN)), {
    kind: 'stopped',
    step: 'compose',
    rerun: true
  })
  assert.deepEqual(buildToolResultOf(JSON.stringify({ stopped: true, say: 'It stopped.' })), {
    kind: 'stopped',
    rerun: false
  })
  assert.equal(buildToolResultOf(JSON.stringify({ ...RERUN, rerun: 'yes' })).rerun, false)
})

test('the fold keeps the latest stop, counts the retries in a row and clears it when the engine runs again', () => {
  let fold = stoppedRun(1, 's1', 'plan', RERUN).reduce(buildToolFoldOf, undefined)
  assert.deepEqual(fold.stop, { turn: 1, seq: fold.stop.seq, step: 'compose', rerun: true, retries: 0 })
  assert.equal(canRetryStop(fold.stop), true)
  // The owner presses Try again: the agent calls the tool again, so the stop goes while it runs.
  fold = buildToolFoldOf(fold, call(2, 's2', { action: 'plan' }))
  assert.equal(fold.stop, null)
  // A guidance answer in the middle of the retry (look ready) neither counts nor resets.
  fold = [result(2, 's2', { look: 'ready' }), ...stoppedRun(2, 's3', 'plan', RERUN)].reduce(
    buildToolFoldOf,
    fold
  )
  assert.equal(fold.stop.retries, 1)
  assert.equal(canRetryStop(fold.stop), true)
  fold = stoppedRun(3, 's4', 'plan', RERUN).reduce(buildToolFoldOf, fold)
  assert.equal(fold.stop.retries, 2)
  assert.equal(canRetryStop(fold.stop), false, 'after two retries that stop again only the sentence stays')
})

test('a stop that may not be rerun never offers a retry, and a step that moved on resets the count', () => {
  const noRerun = stoppedRun(1, 'n1', 'plan', { stopped: true, say: 'x', step: 'compose' }).reduce(
    buildToolFoldOf,
    undefined
  )
  assert.equal(noRerun.stop.rerun, false)
  assert.equal(canRetryStop(noRerun.stop), false)
  assert.equal(canRetryStop(null), false)
  let fold = stoppedRun(1, 'r1', 'plan', RERUN).reduce(buildToolFoldOf, undefined)
  fold = stoppedRun(2, 'r2', 'plan', RERUN).reduce(buildToolFoldOf, fold)
  assert.equal(fold.stop.retries, 1)
  // Another step stopping starts its own count; a plan answer ends the run of stops.
  fold = stoppedRun(3, 'r3', 'research', { ...RERUN, step: 'research' }).reduce(buildToolFoldOf, fold)
  assert.equal(fold.stop.retries, 0)
  fold = stoppedRun(4, 'r4', 'plan', { plan: { id: 'plan-1', revision: 1 } }).reduce(buildToolFoldOf, fold)
  assert.equal(fold.stop, null)
  fold = stoppedRun(5, 'r5', 'plan', RERUN).reduce(buildToolFoldOf, fold)
  assert.equal(fold.stop.retries, 0)
})

test('a stop read from a status call counts under the step the engine named', () => {
  const fold = [...stoppedRun(1, 't1', 'plan', RERUN), ...stoppedRun(2, 't2', 'status', RERUN)].reduce(
    buildToolFoldOf,
    undefined
  )
  assert.equal(fold.stop.retries, 1)
})
