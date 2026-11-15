// A chain started again after a restart takes over the bench run its lost attempt queued, instead of waiting for that
// run to end and then starting the same work again (step-chain-steps.js ownActiveRun). It looks for that run before
// every start: a bench holds several runs (#633), so a start is no longer refused while the build's own run goes on.
// Fake bench commands and a fake pool: no database, no model.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { benchFullRefusal } from '../src/lib/bench-sql.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'

/** What the planner bench's `run` prints when the bench is full, as the product words it. */
const FULL = benchFullRefusal('SITE_PLANNER_RUN_ACTIVE', 'planner runs', [
  { id: 'other-run', startedBy: 'cli:step-chain', step: 'planning' }
])
const REFUSED = `${FULL.code}: ${FULL.reason}`
const PLAN = { version: 'site-plan/3', pages: [{ id: 'page-home', decision: 'keep' }] }

/**
 * A fake pool for one bench: `active` is the run the adoption query finds (null: none of this build's), `runs` the
 * status each run id reports. Every adoption query is recorded with its parameters.
 */
function fakePool({ active, runs, plan = PLAN }) {
  const adoption = []
  return {
    adoption,
    async query(sql, params = []) {
      if (/where status = 'queued' and started_by = \$1/.test(sql)) {
        adoption.push({ sql, params })
        return { rows: active ? [{ id: active }] : [] }
      }
      if (/from site_planner_round/.test(sql)) return { rows: [{ plan }] }
      const id = params[0]
      if (id in runs)
        return { rows: [{ status: runs[id], error: null, standing_failures: null, cost_usd: 0.1 }] }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

/** A fake bench command line: `run` refused (the bench is full) while `refuse` says so, then answers `fresh-run`. */
function fakeBench({ refuse }) {
  const calls = []
  const cli = async (argv, io) => {
    calls.push(argv[0])
    if (argv[0] === 'run') {
      if (refuse()) {
        io.err(REFUSED)
        return 1
      }
      io.out('fresh-run')
      return 0
    }
    if (argv[0] === 'get' || argv[0] === 'cancel') return 0
    throw new Error(`unexpected bench command ${argv[0]}`)
  }
  return { calls, cli }
}

const ctx = (runId) => ({ runId, brief: { researchRevisionId: 'revision-1' } })
const kit = { ref: 'ja-boxing/j6/1.0.11' }

test('a plan step started again takes over its own active planner run and queues no second one', async () => {
  const pool = fakePool({ active: 'lost-run', runs: { 'lost-run': 'succeeded' } })
  // The bench is full: before #633 the refusal was what sent the step looking for its own run.
  const bench = fakeBench({ refuse: () => true })
  const logged = []
  const steps = createStepChainSteps({
    config: {},
    pool,
    benchCli: { plan: bench.cli },
    sleep: async () => {
      throw new Error('a plan step that can take over its own run never waits')
    },
    log: { info: (line) => logged.push(line) }
  })
  const c = ctx('resumed-plan')
  try {
    const answer = await steps.plan(c, { kit }, { signal: new AbortController().signal })
    assert.ok(answer.value.file.endsWith('plan.json'))
    assert.deepEqual(bench.calls, ['get'])
    // The adoption asks for this build's own run: started by the chain, same revision, same kit, no plan for a plan step.
    assert.equal(pool.adoption.length, 1)
    assert.deepEqual(pool.adoption[0].params, ['cli:step-chain', 'revision-1', 'ja-boxing/j6/1.0.11'])
    assert.doesNotMatch(pool.adoption[0].sql, /plan = /)
    assert.ok(logged.some((line) => /took over the run lost-run/.test(line)))
  } finally {
    await steps.dispose(c)
  }
})

test('with room on the bench, a plan step started again still takes over its own run and starts none beside it', async () => {
  const pool = fakePool({ active: 'lost-run', runs: { 'lost-run': 'succeeded' } })
  // Every start would be accepted: the bench has room for more runs (#633).
  const bench = fakeBench({ refuse: () => false })
  const steps = createStepChainSteps({
    config: {},
    pool,
    benchCli: { plan: bench.cli },
    sleep: async () => {
      throw new Error('a plan step that can take over its own run never waits')
    },
    log: { info: () => {} }
  })
  const c = ctx('resumed-plan-room')
  try {
    await steps.plan(c, { kit }, { signal: new AbortController().signal })
    assert.deepEqual(bench.calls, ['get'], 'no second planner run is queued beside the build own')
    assert.equal(pool.adoption.length, 1)
  } finally {
    await steps.dispose(c)
  }
})

test('the refusal of a full bench reads as one the step waits on', async () => {
  const pool = fakePool({ active: null, runs: { 'fresh-run': 'succeeded' } })
  let refusals = 1
  const bench = fakeBench({ refuse: () => refusals-- > 0 })
  let waits = 0
  const steps = createStepChainSteps({
    config: {},
    pool,
    benchCli: { plan: bench.cli },
    sleep: async () => {
      waits++
    },
    log: { info: () => {} }
  })
  const c = ctx('full-bench')
  try {
    await steps.plan(c, { kit }, { signal: new AbortController().signal })
    assert.equal(waits, 1)
    assert.deepEqual(bench.calls, ['run', 'run', 'get'])
  } finally {
    await steps.dispose(c)
  }
})

test("another build's active run is still waited for, then this step starts its own", async () => {
  const pool = fakePool({ active: null, runs: { 'fresh-run': 'succeeded' } })
  let refusals = 2
  const bench = fakeBench({ refuse: () => refusals-- > 0 })
  let waits = 0
  const steps = createStepChainSteps({
    config: {},
    pool,
    benchCli: { plan: bench.cli },
    sleep: async () => {
      waits++
    },
    log: { info: () => {} }
  })
  const c = ctx('other-build-active')
  try {
    await steps.plan(c, { kit }, { signal: new AbortController().signal })
    assert.equal(waits, 2)
    assert.deepEqual(bench.calls, ['run', 'run', 'run', 'get'])
    // Its own run was looked for before each of the three starts, and none was found.
    assert.equal(pool.adoption.length, 3)
  } finally {
    await steps.dispose(c)
  }
})

test('a pictures step adopts only a run on the same plan, and nothing when its plan cannot be read', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'own-run-'))
  try {
    const planFile = path.join(dir, 'plan.json')
    await writeFile(planFile, JSON.stringify(PLAN))
    const pool = fakePool({ active: 'lost-pictures', runs: { 'lost-pictures': 'succeeded' } })
    const bench = fakeBench({ refuse: () => true })
    const steps = createStepChainSteps({
      config: {},
      pool,
      benchCli: { pictures: bench.cli },
      sleep: async () => {
        throw new Error('never waits when its own run is active')
      },
      log: { info: () => {} }
    })
    const c = ctx('resumed-pictures')
    try {
      await steps.pictures(c, { kit, plan: { file: planFile } }, { signal: new AbortController().signal })
      // It took the run over before any start: only the adopted run's files are taken out.
      assert.deepEqual(bench.calls, ['get'])
      assert.match(pool.adoption[0].sql, /and plan = \$4::jsonb/)
      assert.deepEqual(JSON.parse(pool.adoption[0].params[3]), PLAN)
    } finally {
      await steps.dispose(c)
    }

    // With the plan file gone, no run is adopted: the step waits as before (the fake refuses once, then starts).
    const pool2 = fakePool({ active: 'lost-pictures', runs: { 'fresh-run': 'succeeded' } })
    let refusals = 1
    const bench2 = fakeBench({ refuse: () => refusals-- > 0 })
    let waits = 0
    const steps2 = createStepChainSteps({
      config: {},
      pool: pool2,
      benchCli: { pictures: bench2.cli },
      sleep: async () => {
        waits++
      },
      log: { info: () => {} }
    })
    const c2 = ctx('pictures-no-plan')
    try {
      await steps2.pictures(
        c2,
        { kit, plan: { file: path.join(dir, 'gone.json') } },
        { signal: new AbortController().signal }
      )
      assert.equal(waits, 1)
      assert.equal(pool2.adoption.length, 0)
      assert.deepEqual(bench2.calls, ['run', 'run', 'get'])
    } finally {
      await steps2.dispose(c2)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
