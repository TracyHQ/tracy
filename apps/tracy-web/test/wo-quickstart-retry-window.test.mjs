import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quickstartRetryWindow } from '../src/opportunities-build/quickstart-retry-window.js'

function fixture() {
  const clock = { now: Date.parse('2026-10-21T17:45:00Z') }
  const source = {
    id: 'build',
    account_id: 'account',
    opportunity_id: 'opportunity',
    revision_id: 'revision',
    request_id: 'request'
  }
  const run = { intent_id: 'original-intent' }
  const root = { state: 'pending', deadline: '2026-10-21T16:30:00Z', policy: { maxRunMs: 25 * 60_000 } }
  const state = {
    action: {
      id: 'accepted-retry',
      retry_of: 'failed-parent',
      status: 'queued',
      protocol: 'legacy',
      revision_id: source.revision_id,
      opportunity_id: source.opportunity_id,
      accepted_at: '2026-10-21T17:40:00Z',
      parent_status: 'failed',
      parent_account_id: source.account_id,
      parent_opportunity_id: source.opportunity_id,
      parent_revision_id: source.revision_id,
      parent_request_id: source.request_id
    },
    unknown: false
  }
  const pool = {
    query: async (sql) => {
      if (sql.includes('from wo_demo_action')) return { rows: [state.action] }
      if (sql.includes('from wo_quality_attempt')) return { rows: state.unknown ? [{ id: 'unknown' }] : [] }
      throw Error('Unexpected write or query')
    }
  }
  return {
    clock,
    source,
    run,
    root,
    state,
    pool,
    make: () => quickstartRetryWindow({ pool, source, run, actionId: 'accepted-retry', now: () => clock.now })
  }
}

test('explicit Retry pins a fixed time window without changing the original intent or counters', async () => {
  const h = fixture(),
    frozen = structuredClone(h.root),
    resolve = await h.make()
  assert.equal(resolve.actionId, 'accepted-retry')
  assert.deepEqual(await resolve({ root: h.root }), {
    actionId: 'accepted-retry',
    deadline: '2026-10-21T18:05:00.000Z',
    originalDeadline: h.root.deadline
  })
  h.clock.now += 5 * 60_000
  assert.equal((await resolve({ root: h.root })).deadline, '2026-10-21T18:05:00.000Z')
  assert.deepEqual(h.root, frozen)
  h.clock.now = Date.parse('2026-10-21T18:05:00Z')
  assert.equal(await resolve({ root: h.root }), null)
})

test('old workers cannot borrow a newer Retry and rejected scope never gets extra time', async () => {
  for (const change of [
    { id: 'newer-action' },
    { status: 'cancelled' },
    { revision_id: 'other' },
    { parent_account_id: 'other' },
    { parent_request_id: 'other' },
    { parent_status: 'queued' },
    { protocol: 'quality-v1' },
    { accepted_at: '2026-10-21T16:20:00Z' }
  ]) {
    const h = fixture(),
      resolve = await h.make()
    Object.assign(h.state.action, change)
    assert.equal(await resolve({ root: h.root }), null, JSON.stringify(change))
  }
  const h = fixture(),
    resolve = await h.make()
  assert.equal(await resolve({ root: { ...h.root, state: 'cancelled' } }), null)
  assert.equal(await resolve({ root: { ...h.root, state: 'failed' } }), null)
  h.state.unknown = true
  await assert.rejects(resolve({ root: h.root }), /QUALITY_ATTEMPT_UNCERTAIN/)
})

test('Retry accepted at the original deadline boundary keeps its own fixed window', async () => {
  for (const delta of [-160, 0, 160]) {
    const h = fixture()
    h.state.action.accepted_at = new Date(Date.parse(h.root.deadline) + delta).toISOString()
    h.clock.now = Date.parse(h.root.deadline) + 1000
    const resolve = await h.make()
    const window = await resolve({ root: h.root })
    assert.equal(Date.parse(window.deadline), Date.parse(h.state.action.accepted_at) + h.root.policy.maxRunMs)
    h.clock.now += 1000
    assert.deepEqual(await resolve({ root: h.root }), window)
  }
  const h = fixture()
  h.state.action.accepted_at = new Date(Date.parse(h.root.deadline) - h.root.policy.maxRunMs).toISOString()
  h.clock.now = Date.parse(h.root.deadline) - 1000
  assert.equal(await (await h.make())({ root: h.root }), null)
})
