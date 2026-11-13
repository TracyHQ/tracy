/**
 * The time and cost of each step of a step chain build, as the doors give them (#537): a done step carries its own
 * recorded minutes and USD, a running step its minutes since it started and no spend yet, a waiting step what it
 * usually takes. Pure functions and a fake pool; no Postgres.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { chainSummary } from '../src/sites/brief-engines/step-chain.js'
import { chainEstimates, chainRunView, chainStepEstimates } from '../src/lib/wo-chain-builds.js'

const START = Date.parse('2026-11-10T10:00:00Z')
const min = (n) => START + n * 60_000
const iso = (n) => new Date(min(n)).toISOString()

test('a running snapshot keeps when each running step started; an ended run does not', () => {
  const record = [{ step: 'kit', startMs: 0, endMs: 6_000, usd: 0.01, outcome: 'done' }]
  const running = chainSummary(record, null, 60_000, ['brand', 'plan'], { brand: iso(1), plan: iso(1) })
  assert.deepEqual(running.running, ['brand', 'plan'])
  assert.deepEqual(running.runningSince, { brand: iso(1), plan: iso(1) })
  const ended = chainSummary(record, null, 60_000)
  assert.equal(ended.runningSince, undefined)
  // An ended run whose record does not end with a completed Write step is never complete (#591).
  assert.equal(ended.ending, 'stopped')
  assert.equal(ended.stop.code, 'STEP_CHAIN_INCOMPLETE')
  const written = [...record, { step: 'write', startMs: 6_000, endMs: 9_000, usd: 0, outcome: 'done' }]
  assert.equal(chainSummary(written, null, 60_000).ending, 'complete')
  // An older caller with no starts still writes the snapshot it wrote before.
  assert.equal(chainSummary(record, null, 60_000, ['brand']).runningSince, undefined)
})

test('per step: done carries its minutes and spend, running its minutes so far, waiting its estimate', () => {
  const chain = {
    ending: 'running',
    running: ['copy', 'pictures'],
    runningSince: { copy: iso(8), pictures: iso(9) },
    steps: [
      { step: 'kit', minutes: 0.1, usd: 0.01 },
      { step: 'brand', minutes: 2, usd: 0.06 },
      { step: 'plan', minutes: 6, usd: 0.08 }
    ]
  }
  const run = chainRunView({
    chain,
    open: true,
    startedAt: new Date(START),
    now: min(11),
    estimate: { minutes: 26, usd: 1.84 },
    stepEstimates: { write: { minutes: 4, usd: 0.3 } }
  })
  const by = Object.fromEntries(run.steps.map((s) => [s.id, s]))
  assert.deepEqual(by.kit, { id: 'kit', label: 'Template kit', state: 'done', minutes: 0.1, usd: 0.01 })
  assert.deepEqual(by.plan, { id: 'plan', label: 'Page plan', state: 'done', minutes: 6, usd: 0.08 })
  assert.deepEqual(by.copy, { id: 'copy', label: 'Page texts', state: 'current', minutes: 3, usd: null })
  assert.equal(by.pictures.minutes, 2)
  assert.deepEqual(by.write, {
    id: 'write',
    label: 'Writing to the site',
    state: 'upcoming',
    minutes: null,
    usd: null,
    estimate: { minutes: 4, usd: 0.3 }
  })
  // The run total stays the sum of the recorded steps.
  assert.equal(run.usd, 0.15)
  assert.equal(run.minutes, 11)
})

test('a running step with no recorded start, and a waiting step never measured, say nothing', () => {
  const run = chainRunView({
    chain: { ending: 'running', running: ['kit'], steps: [] },
    open: true,
    startedAt: new Date(START),
    now: min(1),
    estimate: null
  })
  assert.equal(run.steps[0].state, 'current')
  assert.equal(run.steps[0].minutes, null)
  assert.equal(run.steps[1].estimate, null)
})

test('a step estimate is the median minutes and USD that step took in the builds given', () => {
  const builds = [
    {
      steps: [
        { step: 'kit', minutes: 0.1, usd: 0.01 },
        { step: 'write', minutes: 3, usd: 0.2 }
      ]
    },
    {
      steps: [
        { step: 'kit', minutes: 0.3, usd: 0.03 },
        { step: 'write', minutes: 5, usd: 0.4 }
      ]
    },
    {
      steps: [
        { step: 'site', minutes: 9, usd: 0 },
        { step: 'write', minutes: 4, usd: 0.3 }
      ]
    }
  ]
  assert.deepEqual(chainStepEstimates(builds), {
    kit: { minutes: 0.2, usd: 0.02 },
    write: { minutes: 4, usd: 0.3 }
  })
})

test('chainEstimates gives per-step estimates by the same template rule as the whole run', async () => {
  const row = (quickstart, writeMinutes) => ({
    quickstart,
    chain: { totalMinutes: 10, totalUsd: 1, steps: [{ step: 'write', minutes: writeMinutes, usd: 0.5 }] }
  })
  const rows = [row('ja_a', 2), row('ja_a', 2), row('ja_a', 2), row('ja_b', 8)]
  const pool = { query: async () => ({ rows }) }
  const estimateOf = await chainEstimates(pool)
  assert.deepEqual(estimateOf('ja_a'), { minutes: 10, usd: 1 })
  // ja_a has enough builds of its own; ja_b falls back to every template's builds.
  assert.deepEqual(estimateOf.steps('ja_a').write, { minutes: 2, usd: 0.5 })
  assert.deepEqual(estimateOf.steps('ja_b').write, { minutes: 2, usd: 0.5 })
})
