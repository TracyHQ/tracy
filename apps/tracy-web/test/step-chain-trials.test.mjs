// The chain build's staff measurement switches (`chainTrials` of the WO settings, step-chain-steps.js trialArgs): the
// plan step reads them when it starts, adds the bench flag of each switch that is on, and records the switches on its
// step. Off, the planner run is started exactly as before. Fake bench command line and fake pool: no database, no model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CHAIN_TRIALS,
  normalizeWoOpsSettings,
  parseWoOpsSettingsInput
} from 'website-opportunities/src/wo-settings.js'
import { createStepChainSteps, planArgs, trialArgs } from '../src/step-chain-steps.js'

const PLAN = { version: 'site-plan/3', pages: [{ id: 'page-home', decision: 'keep' }] }
const kit = { ref: 'ja-boxing/j6/1.0.11' }

/** A pool whose WO settings hold `chainTrials`, with one planner run that succeeds. */
function fakePool(chainTrials) {
  return {
    async query(sql, params = []) {
      if (/from wo_ops_setting/.test(sql))
        return {
          rows: chainTrials ? [{ settings: { chainTrials }, updated_by: null, updated_at: null }] : []
        }
      if (/where status = 'queued' and started_by = \$1/.test(sql)) return { rows: [] }
      if (/from site_planner_round/.test(sql)) return { rows: [{ plan: PLAN }] }
      if (params[0] === 'fresh-run')
        return { rows: [{ status: 'succeeded', error: null, standing_failures: null, cost_usd: 0.1 }] }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

/** The planner run's `run` arguments, from a plan step on a pool with these switches. */
async function planRun(chainTrials) {
  const runs = []
  const cli = async (argv, io) => {
    if (argv[0] === 'run') {
      runs.push(argv.slice(1))
      io.out('fresh-run')
      return 0
    }
    if (argv[0] === 'get' || argv[0] === 'cancel') return 0
    throw new Error(`unexpected bench command ${argv[0]}`)
  }
  const steps = createStepChainSteps({
    config: {},
    pool: fakePool(chainTrials),
    benchCli: { plan: cli },
    sleep: async () => {}
  })
  const ctx = { runId: `trial-${Math.random()}`, brief: { researchRevisionId: 'revision-1' } }
  try {
    const answer = await steps.plan(ctx, { kit }, { signal: new AbortController().signal })
    return { argv: runs[0], answer }
  } finally {
    await steps.dispose(ctx)
  }
}

test('with planTurns on, the plan step plans round 0 in turns and records the switch; off, it starts as before', async () => {
  const on = await planRun({ planTurns: true })
  assert.ok(on.argv.includes('--plan-turns'))
  assert.deepEqual(on.answer.trials, ['planTurns'])
  for (const flag of planArgs(kit.ref, 'revision-1')) assert.ok(on.argv.includes(flag))

  const off = await planRun({ planTurns: false })
  assert.ok(!off.argv.includes('--plan-turns'))
  assert.equal('trials' in off.answer, false)
  const none = await planRun(null)
  assert.deepEqual(none.argv, off.argv)
})

test('a switch adds its flag only to its own step', () => {
  assert.deepEqual(trialArgs('plan', { planTurns: true }), { argv: ['--plan-turns'], names: ['planTurns'] })
  // wholeShared takes the default split away in copyArgs: it adds no flag of its own.
  assert.deepEqual(trialArgs('copy', { wholeShared: true }), { argv: [], names: ['wholeShared'] })
  assert.deepEqual(trialArgs('plan', { wholeShared: true }), { argv: [], names: [] })
  for (const step of ['copy', 'pictures'])
    assert.deepEqual(trialArgs(step, { planTurns: true }), { argv: [], names: [] })
  assert.deepEqual(trialArgs('plan', {}), { argv: [], names: [] })
  assert.deepEqual(trialArgs('plan', null), { argv: [], names: [] })
})

test('the settings keep only known switches that are on, and the door refuses an unknown name or a value that is not a boolean', () => {
  // Every switch the settings accept is one a step acts on: none would be stored and silently do nothing.
  for (const name of CHAIN_TRIALS)
    assert.ok(
      ['plan', 'copy', 'pictures'].some((step) => trialArgs(step, { [name]: true }).names.includes(name)),
      `${name} has a step`
    )
  assert.deepEqual(normalizeWoOpsSettings({}).chainTrials, {})
  assert.deepEqual(
    normalizeWoOpsSettings({ chainTrials: { planTurns: true, framedParts: true } }).chainTrials,
    {
      planTurns: true
    }
  )
  assert.deepEqual(normalizeWoOpsSettings({ chainTrials: { planTurns: false } }).chainTrials, {})
  assert.deepEqual(parseWoOpsSettingsInput({ chainTrials: { planTurns: true } }).settings.chainTrials, {
    planTurns: true
  })
  for (const chainTrials of [{ planTurns: 'yes' }, { parallelPages: true }, [true], 'planTurns']) {
    const parsed = parseWoOpsSettingsInput({ chainTrials })
    assert.equal(parsed.ok, false)
    assert.equal(parsed.error, 'INVALID_CHAIN_TRIALS')
  }
})

test('a build keeps the switches read at its first step: turned on after its plan started, its draft copy still splits', async () => {
  let settings = { planTurns: false }
  const pool = fakePool(null)
  const query = pool.query
  pool.query = async (sql, params) =>
    /from wo_ops_setting/.test(sql)
      ? { rows: [{ settings: { chainTrials: settings }, updated_by: null, updated_at: null }] }
      : query(sql, params)
  const runs = []
  const cli = async (argv, io) => {
    if (argv[0] === 'run') {
      runs.push(argv.slice(1))
      io.out('fresh-run')
      return 0
    }
    if (argv[0] === 'get' || argv[0] === 'cancel') return 0
    throw new Error(`unexpected bench command ${argv[0]}`)
  }
  const steps = createStepChainSteps({
    config: {},
    pool,
    benchCli: { plan: cli, copy: cli },
    sleep: async () => {}
  })
  const signal = new AbortController().signal
  const build = { runId: `trial-${Math.random()}`, brief: { researchRevisionId: 'revision-1' } }
  const next = { runId: `trial-${Math.random()}`, brief: { researchRevisionId: 'revision-1' } }
  const plan = { file: null }
  try {
    const planned = await steps.plan(build, { kit }, { signal })
    plan.file = planned.value.file
    // wholeShared goes on for the next build while this one plans.
    settings = { wholeShared: true }
    await steps.copyDraft(build, { kit, plan }, { signal })
    await steps.copyDraft(next, { kit, plan }, { signal })
    const [, thisDraft, nextDraft] = runs
    assert.ok(thisDraft.includes('--split-shared'), 'the build that started with the default split')
    assert.ok(!nextDraft.includes('--split-shared'), 'a build that started after wholeShared went on')
  } finally {
    await steps.dispose(build)
    await steps.dispose(next)
  }
})
