import assert from 'node:assert/strict'
import test from 'node:test'
import { listChainBuilds } from '../src/lib/wo-chain-builds.js'

const start = Date.parse('2026-11-11T13:01:00Z')
const snapshot = () => ({
  ending: 'running',
  running: ['plan'],
  totalMinutes: 0.04,
  totalUsd: 0,
  steps: [{ step: 'kit', minutes: 0.04, usd: 0, outcome: 'done' }]
})
const row = (extra = {}) => ({
  site_key: 'interrupted.tracy.test',
  quickstart: 'quickstart/ja-boxing/j6',
  state: 'failed',
  created_at: new Date(start - 7_200_000),
  attempt_started_at: start,
  updated_at: new Date(start + 12 * 60_000),
  error: 'The process stopped during preparation.',
  timings: { lostFrom: 'preparing' },
  chain: snapshot(),
  ...extra
})
const read = async (r, at = start + 60 * 60_000) =>
  (
    await listChainBuilds(
      { query: async () => ({ rows: [r] }) },
      { origin: 'https://cowork.tracy.test' },
      { now: () => at }
    )
  ).builds[0]

test('an interrupted chain keeps elapsed attempt time and its actual error without inventing step measurements', async () => {
  const r = row({ timings: { interruptedAt: start + 12 * 60_000 } })
  const b = await read(r)
  assert.equal(b.totalMinutes, 12)
  assert.equal(b.ending, 'failed')
  assert.equal(b.failedStep, 'plan')
  assert.equal(b.interruption.reason, r.error)
  assert.equal(b.interruption.timeSource, 'settled')
  assert.equal(b.interruption.bound, null)
  assert.equal(b.interruption.executionEndedAt, null)
  assert.deepEqual(b.interruption.steps, [{ step: 'plan', minutes: null, usd: null }])
  assert.deepEqual(b.rawChain, snapshot())
  assert.deepEqual(
    b.steps,
    snapshot().steps.map((s) => ({ ...s, error: null }))
  )
})

test('an interrupted chain freezes settlement time after later unrelated brief updates', async () => {
  const b = await read(
    row({ updated_at: new Date(start + 90 * 60_000), timings: { interruptedAt: start + 12 * 60_000 } })
  )
  assert.equal(b.totalMinutes, 12)
  assert.equal(b.interruption.endedAt, new Date(start + 12 * 60_000).toISOString())
})

test('a legacy interrupted snapshot reports last-update elapsed as an upper bound', async () => {
  const b = await read(row())
  assert.equal(b.totalMinutes, 12)
  assert.equal(b.interruption.timeSource, 'last-update')
  assert.equal(b.interruption.bound, 'upper')
  assert.equal(b.rawChain.totalMinutes, 0.04)
})

test('malformed interruption times cannot replace a measured lower bound or create negative elapsed time', async () => {
  for (const interruptedAt of [null, 'bad', 0, start - 1, start + 120 * 60_000]) {
    const b = await read(row({ updated_at: new Date(start - 1), timings: { interruptedAt } }))
    assert.equal(b.totalMinutes, 0.04)
    assert.equal(b.interruption.endedAt, null)
    assert.equal(b.interruption.timeSource, 'snapshot')
    assert.equal(b.interruption.bound, 'lower')
  }
})

test('running and completed chains retain their existing timing and verdicts', async () => {
  const active = await read(row({ state: 'preparing' }), start + 10 * 60_000)
  assert.equal(active.totalMinutes, 10)
  assert.equal(active.interruption, null)
  assert.equal(active.ending, 'running')
  const chain = { ending: 'soft-failure', totalMinutes: 25, totalUsd: 1.2, failedStep: 'write', steps: [] }
  const complete = await read(row({ state: 'applied', chain }))
  assert.equal(complete.totalMinutes, 25)
  assert.equal(complete.totalUsd, 1.2)
  assert.equal(complete.interruption, null)
  assert.equal(complete.ending, 'soft-failure')
})
