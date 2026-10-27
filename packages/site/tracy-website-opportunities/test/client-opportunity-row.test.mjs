/**
 * One row of My opportunities, read for the screen (`src/client/opportunity-row.ts`): which stage it
 * is at, whether it needs the customer, what its Status says, the one next action, and what the
 * Research column shows. The server's own `stage` wins when it sends one.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ACTION_VIEW,
  demoFailureKey,
  nextAction,
  relativeTime,
  researchSummary,
  nextStepText,
  needsAttention,
  stageOf,
  statusView
} from '../src/client/opportunity-row.ts'
import { en } from '../src/client/strings.ts'

const row = (over = {}) => ({
  id: 'o1',
  name: 'Paavo’s Pizza',
  job: null,
  latestRevision: null,
  sites: [],
  ...over
})
const job = (state, over = {}) => ({ id: 'j1', state, ...over })
const revision = { id: 'r1', n: 1, cms: 'wordpress' }

test('three stages: research until complete, Demo until QA passes, then Outreach', () => {
  assert.equal(stageOf(row()), 'research')
  for (const state of ['queued', 'running', 'paused', 'blocked', 'failed'])
    assert.equal(stageOf(row({ job: job(state) })), 'research')
  assert.equal(stageOf(row({ job: job('completed') })), 'demo')
  assert.equal(stageOf(row({ latestRevision: revision })), 'demo')
  assert.equal(
    stageOf(row({ latestBuild: { state: 'done', siteKey: 'paavo' } })),
    'demo',
    'provision is not QA PASS'
  )
  assert.equal(stageOf(row({ demo: { qa: 'passed' } })), 'outreach')
  assert.equal(stageOf(row({ job: job('cancelled') })), 'cancelled')
  assert.equal(stageOf(row({ stage: 'outreach' })), 'outreach', 'server stage wins')
  assert.equal(stageOf(row({ stage: 'later' })), 'research')
})

test('Attention includes failed research, pipeline and QA; a ready demo has one Send action', () => {
  for (const state of ['paused', 'blocked', 'failed'])
    assert.equal(needsAttention(row({ job: job(state) })), true)
  assert.equal(needsAttention(row({ demoAction: { state: 'failed' } })), true)
  assert.equal(needsAttention(row({ demo: { qa: 'failed' } })), true)
  assert.equal(needsAttention(row({ demo: { qa: 'passed' } })), false)
  assert.equal(statusView(row()).key, 'v3.notStarted')
  assert.equal(statusView(row({ job: job('completed') })).key, 'v3.readyToBuild')
  assert.equal(statusView(row({ demoAction: { state: 'queued' } })).key, 'v3.building')
  assert.equal(statusView(row({ demoAction: { state: 'failed' } })).key, 'v3.needsReview')
  assert.equal(statusView(row({ demo: { qa: 'passed' } })).key, 'v3.demoReady')
  assert.equal(nextAction(row()), 'start')
  assert.equal(nextAction(row({ job: job('running') })), 'cancel')
  assert.equal(nextAction(row({ job: job('failed') })), 'resume')
  assert.equal(nextAction(row({ job: job('completed') })), 'build', 'one press creates its own revision')
  assert.equal(nextAction(row({ demoAction: { state: 'failed' } })), 'retry-demo')
  assert.equal(nextAction(row({ demo: { qa: 'passed' } })), 'send-demo')
  for (const view of Object.values(ACTION_VIEW)) assert.equal(typeof en[view.labelKey], 'string')
})

test('next-step copy follows the three stages and preserves a stopped research reason', () => {
  assert.equal(nextStepText(row()).key, 'next.new')
  assert.equal(nextStepText(row({ job: job('running') })).key, 'next.running')
  assert.equal(
    nextStepText(row({ job: job('failed', { lastError: { code: 'rate_limited' } }) })).reasonKey,
    'reason.rate_limited'
  )
  assert.equal(nextStepText(row({ job: job('completed') })).key, 'v3.nextDemo')
  assert.equal(nextStepText(row({ demo: { qa: 'passed' } })).key, 'v3.nextOutreach')
})

const T0 = '2026-10-17T09:00:00.000Z'
const T1 = '2026-10-18T10:00:00.000Z'

test('researchSummary: a running job shows its step of five and the sources counted so far', () => {
  const r = row({
    job: job('running', { stage: 'media', createdAt: T0 }),
    sourceCounts: { done: 1, total: 3 }
  })
  assert.deepEqual(researchSummary(r), {
    kind: 'running',
    stageKey: 'job.stage.media',
    step: 3,
    steps: 5,
    sources: { done: 1, total: 3 },
    at: T0
  })
  const first = researchSummary(row({ job: job('running') }))
  assert.equal(first.step, 1)
  assert.equal(first.stageKey, 'job.stage.discovery')
  assert.equal(first.sources, null)
  assert.equal(researchSummary(row({ job: job('running', { stage: 'done' }) })).step, 5)
})

test('researchSummary: waiting, stopped (soft only when paused), done, cancelled and not started', () => {
  assert.deepEqual(researchSummary(row({ job: job('queued', { createdAt: T0 }) })), {
    kind: 'queued',
    at: T0
  })
  assert.deepEqual(
    researchSummary(
      row({ job: job('paused', { lastError: { reason: 'quota' } }), sourceCounts: { done: 1, total: 2 } })
    ),
    {
      kind: 'stopped',
      state: 'paused',
      reasonKey: 'reason.quota',
      soft: true,
      sources: { done: 1, total: 2 }
    }
  )
  assert.deepEqual(researchSummary(row({ job: job('failed', { lastError: { code: 'rate_limited' } }) })), {
    kind: 'stopped',
    state: 'failed',
    reasonKey: 'reason.rate_limited',
    soft: false,
    sources: null
  })
  assert.equal(researchSummary(row({ job: job('blocked') })).soft, false)
  assert.deepEqual(
    researchSummary(row({ job: job('completed', { updatedAt: T1 }), sourceCounts: { done: 3, total: 3 } })),
    {
      kind: 'done',
      at: T1,
      sources: { done: 3, total: 3 }
    }
  )
  assert.deepEqual(researchSummary(row({ job: job('cancelled', { updatedAt: T1 }) })), {
    kind: 'cancelled',
    at: T1,
    sources: null
  })
  assert.deepEqual(researchSummary(row({ createdAt: T0 })), { kind: 'none', at: T0 })
})

test('researchSummary: a malformed source count is left out rather than drawn as 0 of 0', () => {
  for (const sourceCounts of [
    { done: 2 },
    { done: 0, total: 0 },
    { done: 'x', total: 3 },
    { done: 4, total: 3 }
  ])
    assert.equal(researchSummary(row({ job: job('completed'), sourceCounts })).sources, null)
})

test('relativeTime: minutes, hours, then days, in the interface language; a bad date is null', () => {
  const now = Date.parse('2026-10-19T12:00:00.000Z')
  assert.equal(relativeTime('2026-10-19T11:48:00.000Z', now, 'en'), '12 minutes ago')
  assert.equal(relativeTime('2026-10-19T11:59:50.000Z', now, 'en'), 'this minute')
  assert.equal(relativeTime('2026-10-19T09:00:00.000Z', now, 'en'), '3 hours ago')
  assert.equal(relativeTime('2026-10-18T09:00:00.000Z', now, 'en'), 'yesterday')
  assert.equal(relativeTime('2026-10-15T12:00:00.000Z', now, 'en'), '4 days ago')
  assert.equal(relativeTime('2026-10-15T12:00:00.000Z', now, 'vi'), '4 ngày trước')
  assert.equal(relativeTime('not a date', now, 'en'), null)
  assert.equal(relativeTime(null, now, 'en'), null)
})

test('client-send queued demos can reopen their existing chat without another build', () => {
  assert.equal(
    nextAction(row({ demoAction: { id: 'accepted', state: 'queued', chatMode: 'client-send/1' } })),
    'open-demo-chat'
  )
  assert.equal(nextAction(row({ demoAction: { id: 'accepted', state: 'queued' } })), 'build')
  assert.equal(
    nextAction(row({ demoAction: { id: 'accepted', state: 'failed', chatMode: 'client-send/1' } })),
    'retry-demo'
  )
})

test('researchSummary keeps the not found count beside the done count', async () => {
  const { researchSummary } = await import('../src/client/opportunity-row.ts')
  const summary = researchSummary({
    id: 'o',
    job: { id: 'j', state: 'completed' },
    sourceCounts: { done: 3, notFound: 1, total: 6 }
  })
  assert.deepEqual(summary.sources, { done: 3, notFound: 1, total: 6 })
  const bad = researchSummary({
    id: 'o',
    job: { id: 'j', state: 'completed' },
    sourceCounts: { done: 3, notFound: 4, total: 6 }
  })
  assert.equal(bad.sources, null)
  const old = researchSummary({
    id: 'o',
    job: { id: 'j', state: 'completed' },
    sourceCounts: { done: 3, total: 6 }
  })
  assert.deepEqual(old.sources, { done: 3, total: 6 })
})

test('a failed demo names why it stopped next to Retry; a code with no words of its own reads the generic reason', () => {
  const row = (state, error) => ({ id: 'o1', demoAction: { id: 'a1', state, step: 'fill', error } })
  for (const [code, key] of [
    ['DEMO_STEP_TIMEOUT', 'reason.demo_step_timeout'],
    ['AGENT_DEMO_TURN_STOPPED', 'reason.agent_demo_turn_stopped'],
    ['AGENT_DEMO_TURN_LOST', 'reason.agent_demo_turn_lost'],
    ['AGENT_DEMO_ENDED_UNCHECKED', 'reason.agent_demo_ended_unchecked'],
    ['QA_NEEDS_REVIEW', 'reason.qa_needs_review']
  ]) {
    assert.equal(demoFailureKey(row('failed', code)), key, code)
    assert.equal(nextAction(row('failed', code)), 'retry-demo', code)
  }
  assert.equal(demoFailureKey(row('failed', 'SOMETHING_NEW')), 'reason.demo_failed')
  assert.equal(demoFailureKey(row('queued', 'DEMO_STEP_TIMEOUT')), null)
  assert.equal(demoFailureKey({ id: 'o1' }), null)
})

test('a failed action wins over an older passed check: Demo stage, Retry, and its reason', () => {
  const row = {
    id: 'o1',
    demoAction: { id: 'a1', state: 'failed', step: 'check', error: 'DEMO_STEP_TIMEOUT' },
    latestBuild: { id: 'b1', state: 'done', done: true, qa: 'passed' }
  }
  assert.equal(stageOf(row), 'demo')
  assert.equal(nextAction(row), 'retry-demo')
  assert.equal(nextAction({ ...row, stage: 'outreach' }), 'retry-demo', 'an older server stage too')
  assert.equal(demoFailureKey(row), 'reason.demo_step_timeout')
})

test('a Retry still running over an older passed check stays in Demo with its progress, not Send demo', () => {
  for (const state of ['queued', 'running']) {
    const row = {
      id: 'o1',
      demoAction: { id: 'a2', state, step: 'brief', error: null },
      latestBuild: { id: 'b1', state: 'done', done: true, qa: 'passed' }
    }
    for (const r of [row, { ...row, stage: 'outreach' }]) {
      assert.equal(stageOf(r), 'demo', state)
      assert.deepEqual(statusView(r), { key: 'v3.building', variant: 'secondary', check: false }, state)
      assert.notEqual(nextAction(r), 'send-demo', state)
    }
  }
  const done = {
    id: 'o1',
    demoAction: { id: 'a2', state: 'completed', step: 'check', error: null },
    latestBuild: { id: 'b1', state: 'done', done: true, qa: 'passed' }
  }
  assert.equal(stageOf(done), 'outreach', 'a completed action over a passed check')
  assert.equal(nextAction(done), 'send-demo')
  const none = { id: 'o1', latestBuild: { id: 'b1', state: 'done', done: true, qa: 'passed' } }
  assert.equal(stageOf(none), 'outreach', 'a passed build with no action at all')
})

// Every code the server writes to a failed demo action (`apps/tracy-web/src/opportunities-build/`: demo-runner,
// client-demo, quality-runner, public-demos, lib/wo-demo-marks, the queue's own `attempts`), plus the ones a door
// answers with that already have a reason of their own.
const DEMO_ACTION_CODES = [
  'ACCOUNT_NOT_FOUND',
  'AGENT_DEMO_ENDED_UNCHECKED',
  'AGENT_DEMO_NOT_GRANTED',
  'AGENT_DEMO_OTHER_WRITER',
  'AGENT_DEMO_TURN_LOST',
  'AGENT_DEMO_TURN_STOPPED',
  'BRIEF_INVALID',
  'BUILD_FAILED',
  'BUILD_UNREACHABLE',
  'DEMO_BASELINE_UNAVAILABLE',
  'DEMO_CANCELLED',
  'DEMO_CHAT_UNAVAILABLE',
  'DEMO_QA_UNAVAILABLE',
  'DEMO_SELECTION_CHANGED',
  'DEMO_SESSION_UNAVAILABLE',
  'DEMO_SITE_DELETED',
  'DEMO_STEP_FAILED',
  'DEMO_STEP_TIMEOUT',
  'DEMO_WORKFLOW_CHANGED',
  'NOT_FOUND',
  'PROVISION_FAILED',
  'QA_NEEDS_REVIEW',
  'QA_RETRY_FAILED',
  'QUALITY_APPLY_DISABLED',
  'QUALITY_FILL_NEEDS_ATTENTION',
  'QUALITY_STEP_FAILED',
  'QUICKSTART_QA_INCOMPLETE',
  'SITE_ACCESS_DENIED',
  'SITE_FILL_FAILED',
  'TEMPLATE_VERSION_CHANGED',
  'TEMPLATES_UNREADABLE',
  'attempts'
]

test('every code a failed demo action can carry names a reason in words; an unknown one a generic reason', () => {
  const missing = DEMO_ACTION_CODES.filter((code) => {
    const key = demoFailureKey({
      id: 'o1',
      demoAction: { id: 'a1', state: 'failed', step: 'build', error: code }
    })
    return !key || key === 'reason.other' || !(key in en)
  })
  assert.deepEqual(missing, [])
  assert.ok('reason.demo_failed' in en)
  assert.equal(
    demoFailureKey({ id: 'o1', demoAction: { id: 'a1', state: 'failed', step: 'build', error: null } }),
    'reason.demo_failed'
  )
})
