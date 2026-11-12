import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listChainBuilds } from '../src/lib/wo-chain-builds.js'
import { chainSummary, createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { repairSummary } from '../src/write-step/repair-pass/repair-summary.js'

const repair = (costs) =>
  repairSummary({
    outcome: {
      status: 'done',
      turns: costs.map((costUsd, i) => ({ turnId: String(i), costUsd, faults: [] }))
    },
    clock: { elapsed: () => 1, limits: { stopNewWorkMs: 10, returnByMs: 20 } },
    site: 'example.test'
  })
const record = (usd, knownUsd) => ({
  step: 'write',
  usd,
  ...(knownUsd === undefined ? {} : { knownUsd }),
  startMs: 0,
  endMs: 1,
  outcome: 'done'
})
const rows = (chain) => ({
  async query() {
    return {
      rows: [
        {
          site_key: 'example.test',
          state: 'applied',
          created_at: '2026-11-01T00:00:00Z',
          attempt_started_at: 1793491200000,
          chain
        }
      ]
    }
  }
})

test('unknown and mixed native turn costs stay unknown with their known subtotal', () => {
  assert.deepEqual(repair([null]).costUsd, { agent: null, agentKnown: 0 })
  assert.deepEqual(repair([0.2, null]).costUsd, { agent: null, agentKnown: 0.2 })
  assert.deepEqual(repair([0, 0.2]).costUsd, { agent: 0.2 })
  assert.deepEqual(repair([]).costUsd, { agent: 0 })
})

test('chain totals preserve unknown write spend alongside earlier known spend', () => {
  const chain = chainSummary([{ ...record(0.6741), step: 'pictures' }, record(null, 0.2)], null, 1)
  assert.equal(chain.totalUsd, null)
  assert.equal(chain.knownUsd, 0.8741)
  assert.equal(chain.steps[1].usd, null)
  assert.equal(chain.steps[1].knownUsd, 0.2)
  const zero = chainSummary([record(0)], null, 1)
  assert.equal(zero.totalUsd, 0)
  assert.equal(zero.steps[0].usd, 0)
})

test('the real chain engine retains an explicitly unknown repair answer', async () => {
  const steps = Object.fromEntries(
    ['kit', 'brand', 'plan', 'copy', 'pictures'].map((name) => [
      name,
      async () => ({ value: {}, usd: name === 'brand' ? 0.3 : 0 })
    ])
  )
  steps.write = async () => ({ value: { report: { status: 'done' } }, usd: null, knownUsd: 0.2 })
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({}), timer: () => () => {} })
  const ctx = { runId: 'unknown-cost', signal: new AbortController().signal }
  const out = await engine.apply(ctx, await engine.prepare(ctx))
  assert.equal(out.chain.totalUsd, null)
  assert.equal(out.chain.knownUsd, 0.5)
  assert.equal(out.chain.steps.find((s) => s.step === 'write').usd, null)
})

test('Ops keeps a terminal partial subtotal without zero filling unknown write spend', async () => {
  const chain = {
    ending: 'soft-failure',
    totalMinutes: 55.08,
    totalUsd: null,
    knownUsd: 0.6741,
    steps: [
      { step: 'copy', usd: 0.6741, minutes: 1 },
      { step: 'write', usd: null, knownUsd: 0, minutes: 54.08 }
    ]
  }
  const [build] = (await listChainBuilds(rows(chain), {})).builds
  assert.equal(build.totalUsd, null)
  assert.equal(build.knownUsd, 0.6741)
  assert.equal(build.steps[1].usd, null)
  assert.equal(build.steps[1].knownUsd, 0)
})

test('Ops preserves historical measured numeric totals and genuine zero costs', async () => {
  for (const usd of [0, 0.6741]) {
    const chain = {
      ending: 'complete',
      totalMinutes: 1,
      totalUsd: usd,
      steps: [{ step: 'write', usd, minutes: 1 }]
    }
    const [build] = (await listChainBuilds(rows(chain), {})).builds
    assert.equal(build.totalUsd, usd)
    assert.equal(build.steps[0].usd, usd)
  }
})

test('Ops running snapshots retain unknown recorded spend and existing known spend semantics', async () => {
  for (const usd of [null, 0.3]) {
    const chain = {
      ending: 'running',
      totalMinutes: 1,
      totalUsd: 0,
      steps: [{ step: 'brand', usd, knownUsd: 0.1, minutes: 1 }]
    }
    const [build] = (await listChainBuilds(rows(chain), {})).builds
    assert.equal(build.totalUsd, usd)
    if (usd === null) assert.equal(build.knownUsd, 0.1)
  }
})
