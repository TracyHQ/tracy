// A bench holds up to BENCH_RUNS_AT_ONCE active runs and its worker plays them side by side (#633): two step chain builds
// started together no longer play their plan, copy, pictures and brand steps one after the other. The start of each of
// the four benches admits that many runs and refuses one more, naming the limit, even when processes start at once; the
// shared run loop leases that many runs at once across workers, never one run twice, and a cancel stops only its run;
// the picture step keeps each run's looker apart; and a chain build takes over only its own active run among several.
// The model is a gated fake of _agent-over-door-fake.mjs: no real model is called.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { createRun as createBrandRun } from '../src/brand-step/brand-store.js'
import { createPool } from '../src/db/index.js'
import { createBenchQueue } from '../src/lib/bench-run-loop.js'
import { benchStore } from '../src/lib/bench-run-store.js'
import { BENCH_RUNS_AT_ONCE, benchFullRefusal } from '../src/lib/bench-sql.js'
import { DrawerProviderError } from '../src/site-pictures/ladder-draw.js'
import { withLooker } from '../src/site-pictures/looker-round.js'
import { createRun as createPicturesRun } from '../src/site-pictures/bench-store.js'
import { createRun as createPlannerRun, saveRound } from '../src/site-planner/bench-store.js'
import { createRun as createWriterRun } from '../src/site-writer/bench-store.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import { DOOR, finalReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }
const HASH = 'a'.repeat(64)
const source = { kind: 'file', name: 'x.json' }

/** Wait until `cond` holds, polling; a test that never gets there fails instead of hanging. */
async function until(cond, what, ms = 10_000) {
  const end = Date.now() + ms
  while (!(await cond())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

// ── The start of each bench ──────────────────────────────────────────────────────────────────────

/** Each bench's own start, on the least each run table takes. */
const BENCHES = [
  {
    table: 'site_planner_run',
    code: 'SITE_PLANNER_RUN_ACTIVE',
    start: (pool, startedBy) =>
      createPlannerRun(pool, {
        startedBy,
        brief: { facts: [] },
        briefSource: source,
        kit: { ref: 'k' },
        promptSha256: HASH,
        checkerVersion: 'v',
        door: { model: 'm' },
        harness: {}
      })
  },
  {
    table: 'site_writer_run',
    code: 'SITE_WRITER_RUN_ACTIVE',
    start: (pool, startedBy) =>
      createWriterRun(pool, {
        startedBy,
        plan: { pages: [] },
        planSource: source,
        brief: { facts: [] },
        briefSource: source,
        kit: { ref: 'k' },
        promptSha256: HASH,
        checkerVersion: 'v',
        door: { model: 'm' },
        harness: {}
      })
  },
  {
    table: 'site_picture_run',
    code: 'SITE_PICTURES_RUN_ACTIVE',
    start: (pool, startedBy) =>
      createPicturesRun(pool, {
        startedBy,
        plan: { pages: [] },
        planSource: source,
        brief: { facts: [] },
        briefSource: source,
        photoSource: { kind: 'folder', name: null, files: 0, used: 0 },
        kit: { ref: 'k' },
        prompts: { sha256: HASH, roles: {} },
        checkerVersion: 'v'
      })
  },
  {
    table: 'brand_run',
    code: 'BRAND_RUN_ACTIVE',
    start: (pool, startedBy) =>
      createBrandRun(pool, {
        startedBy,
        brief: { brand: {} },
        briefSource: source,
        kit: { ref: 'k' },
        promptSha256: HASH,
        door: { agent: { model: 'm' } },
        tools: [],
        harness: {}
      })
  }
]

for (const bench of BENCHES) {
  test(
    `${bench.table}: the start admits the bench limit of runs and refuses one more, naming them`,
    opts,
    async () => {
      const { pool } = db
      const admitted = []
      for (let n = 0; n < BENCH_RUNS_AT_ONCE; n++) {
        const created = await bench.start(pool, `operator${n}`)
        assert.equal(created.error, undefined, `run ${n + 1} of ${BENCH_RUNS_AT_ONCE} is admitted`)
        admitted.push(created.run.id)
      }
      const past = await bench.start(pool, 'one-too-many')
      assert.equal(past.error, bench.code)
      assert.equal(past.active.id, admitted[0], 'the oldest active run is the one named first')
      assert.deepEqual(
        past.activeRuns.map((r) => r.id),
        admitted
      )
      const { rows } = await pool.query(
        `select count(*)::int as n from ${bench.table} where status = 'queued'`
      )
      assert.equal(rows[0].n, BENCH_RUNS_AT_ONCE, 'the refused start wrote nothing')
      // The words a refusal carries name the limit and every active run.
      const refusal = benchFullRefusal(past.error, 'runs', past.activeRuns)
      assert.match(refusal.reason, new RegExp(`^At most ${BENCH_RUNS_AT_ONCE} runs at a time: `))
      for (const id of admitted) assert.match(refusal.reason, new RegExp(id))
      // A run that ends frees its place.
      await pool.query(`update ${bench.table} set status = 'succeeded' where id = $1`, [admitted[1]])
      assert.equal((await bench.start(pool, 'next')).error, undefined)
    }
  )
}

test('starts made at once from two processes never pass the limit together', opts, async () => {
  const { pool } = db
  const other = createPool(db.url)
  try {
    const [planner] = BENCHES
    const tries = BENCH_RUNS_AT_ONCE + 4
    const results = await Promise.all(
      Array.from({ length: tries }, (_, n) => planner.start(n % 2 ? other : pool, `process${n % 2}`))
    )
    assert.equal(results.filter((r) => r.run).length, BENCH_RUNS_AT_ONCE)
    assert.equal(results.filter((r) => r.error === planner.code).length, tries - BENCH_RUNS_AT_ONCE)
    const { rows } = await pool.query(`select count(*)::int as n from site_planner_run`)
    assert.equal(rows[0].n, BENCH_RUNS_AT_ONCE)
  } finally {
    await other.end()
  }
})

// ── The worker: the shared run loop over a toy step ──────────────────────────────────────────────

const PROMPT = Object.freeze({ text: 'You write a toy draft of notes.', sha256: HASH })

/** The toy step's tables: the planner's shape, its round document in a column of its own name. */
async function toyTables(pool) {
  await pool.query(`
    drop table if exists toy_bench_turn, toy_bench_round, toy_bench_run;
    create table toy_bench_run (like site_planner_run including all);
    create table toy_bench_round (like site_planner_round including all);
    alter table toy_bench_round rename column plan to draft;
    create table toy_bench_turn (like site_planner_turn including all);`)
}

/** A step of the shared loop whose first message names its run, so the fake model knows whose call it answers. */
const TOY_STEP = Object.freeze({
  name: 'toy-bench',
  codePrefix: 'TOY_BENCH',
  store: benchStore({
    runTable: 'toy_bench_run',
    roundTable: 'toy_bench_round',
    turnTable: 'toy_bench_turn',
    docColumn: 'draft'
  }),
  maxFixRounds: 2,
  prompt: () => PROMPT,
  checker: {
    version: 'toy-check/1',
    check: () => ({ summary: { pass: 1, fail: 0, skip: 0 } }),
    failureListText: () => ''
  },
  changes: {
    applyValidChanges: (previous) => ({ doc: previous, rejected: [] }),
    oversized: () => [],
    smallEditsMessage: () => 'unused',
    invalidChangesMessage: () => 'unused'
  },
  messages: { changesInstruction: 'unused', wholeDoc: 'unused', notADoc: 'unused' },
  prepare: async () => ({ ok: true, kit: { platform: 'joomla' }, door: DOOR }),
  agentRequest: ({ row }) => ({ firstUser: `Write the draft of run ${row.id}.`, tools: [] })
})

/** A toy run inserted straight into its table (the worker's cap holds whatever the table holds). */
async function queueToyRun(pool) {
  const { rows } = await pool.query(
    `insert into toy_bench_run
       (started_by, brief, brief_source, brief_sha256, kit, prompt_sha256, checker_version, door, harness)
     values ('test', '{}', '{"kind":"file","name":"toy.json"}', $1, '{"ref":"toy-kit"}', $2, 'toy-check/1',
             '{"model":"vendor/test-model"}', '{"retry":{"attempts":1}}')
     returning id`,
    ['b'.repeat(64), PROMPT.sha256]
  )
  return rows[0].id
}

/**
 * A model whose every call waits until `open()`, or until its request is aborted. It counts the calls in flight, the
 * most at once, and the calls each run made (read from the run's first message).
 */
function gatedModel() {
  const gate = Promise.withResolvers()
  const calls = new Map()
  let inFlight = 0
  let most = 0
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    const first = body.messages.find((m) => m.role === 'user')
    const text = typeof first.content === 'string' ? first.content : first.content.map((p) => p.text).join('')
    const runId = /run ([0-9a-f-]{36})/.exec(text)?.[1] ?? null
    calls.set(runId, (calls.get(runId) ?? 0) + 1)
    inFlight++
    most = Math.max(most, inFlight)
    try {
      await new Promise((resolve, reject) => {
        void gate.promise.then(resolve)
        init.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
    } finally {
      inFlight--
    }
    const reply = finalReply({
      content: JSON.stringify({ notes: [{ id: 'n1', text: 'fine' }] }),
      usage: usageOf({ cost: 0.25 })
    })
    return new Response(JSON.stringify(reply.body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { fetchImpl, open: () => gate.resolve(), inFlight: () => inFlight, most: () => most, calls }
}

const toyRows = async (pool) =>
  (
    await pool.query(
      `select id, status, error, attempts, lease_until is not null and lease_until > now() as held
         from toy_bench_run order by queued_at, id`
    )
  ).rows

test(
  'two workers lease the bench limit of runs side by side, never one run twice; the next waits for a free place',
  opts,
  async () => {
    const { pool } = db
    await toyTables(pool)
    const ids = []
    for (let n = 0; n <= BENCH_RUNS_AT_ONCE; n++) ids.push(await queueToyRun(pool))
    const other = createPool(db.url)
    const model = gatedModel()
    // Two processes, each with its own worker over the same table.
    const workers = [pool, other].map((p) =>
      createBenchQueue(TOY_STEP, { pool: p, fetchImpl: model.fetchImpl, log: quiet })
    )
    try {
      await Promise.all(workers.map((w) => w.tick()))
      await until(() => model.inFlight() === BENCH_RUNS_AT_ONCE, 'the limit of model calls in flight')
      // Full: neither worker leases another run while those are held.
      assert.deepEqual(await Promise.all(workers.map((w) => w.tick())), [0, 0])
      const held = await toyRows(pool)
      assert.equal(held.filter((r) => r.held).length, BENCH_RUNS_AT_ONCE)
      const waiting = held.filter((r) => !r.held)
      assert.equal(waiting.length, 1)
      assert.equal(waiting[0].attempts, 0, 'the run past the limit is not leased yet')
      model.open()
      await Promise.all(workers.map((w) => w.drain()))
      const done = await toyRows(pool)
      assert.deepEqual(
        done.map((r) => [r.status, r.attempts]),
        ids.map(() => ['succeeded', 1]),
        JSON.stringify(done)
      )
      // Every run made exactly its own one call: no run was played by two workers.
      assert.deepEqual(
        ids.map((id) => model.calls.get(id)),
        ids.map(() => 1)
      )
      assert.equal(model.most(), BENCH_RUNS_AT_ONCE)
    } finally {
      model.open()
      await other.end()
    }
  }
)

test('a cancel asked for one of the runs side by side stops that run only', opts, async () => {
  const { pool } = db
  await toyTables(pool)
  const ids = []
  for (let n = 0; n < BENCH_RUNS_AT_ONCE; n++) ids.push(await queueToyRun(pool))
  const model = gatedModel()
  const worker = createBenchQueue(TOY_STEP, { pool, fetchImpl: model.fetchImpl, log: quiet })
  try {
    await worker.tick()
    await until(() => model.inFlight() === BENCH_RUNS_AT_ONCE, 'every run calling the model')
    const [kept, stopped] = ids
    assert.ok(await TOY_STEP.store.requestCancel(pool, stopped))
    // The loop reads the Stop request while the call is in flight and cuts that call alone.
    await until(
      async () => (await TOY_STEP.store.readRun(pool, stopped)).status === 'cancelled',
      'the cancelled run to end'
    )
    assert.equal(model.inFlight(), BENCH_RUNS_AT_ONCE - 1)
    assert.equal((await TOY_STEP.store.readRun(pool, kept)).status, 'queued')
    model.open()
    await worker.drain()
    const statuses = (await toyRows(pool)).map((r) => [r.id, r.status])
    assert.deepEqual(
      statuses,
      ids.map((id) => [id, id === stopped ? 'cancelled' : 'succeeded'])
    )
  } finally {
    model.open()
  }
})

// ── The picture step's looker, per run ───────────────────────────────────────────────────────────

test('the picture step keeps the ready state of every run it plays side by side, each to its own run', async () => {
  const saved = []
  // Each run's finisher fails on a frame of its own, so a saved round shows whose ready state it used.
  const step = withLooker({
    name: 'site-pictures',
    maxFixRounds: 2,
    prepare: async (_deps, row) => ({
      ok: true,
      picker: null,
      looker: { look: async () => assert.fail('no look') },
      finisher: {
        finish: async () => {
          throw new DrawerProviderError(`frame-of-${row.id}`, 402, 'out of credits', 1)
        }
      }
    }),
    checker: { check: () => assert.fail('no check'), failureListText: () => '' },
    store: {
      saveRound: async (_pool, args) => {
        saved.push(args)
        return true
      }
    }
  })
  const round = (runId) =>
    step.store.saveRound(null, {
      runId,
      round: 0,
      state: 'checked',
      pictures: { frames: [], siteSettings: [] },
      checkResult: { rules: [] }
    })
  const runA = { id: 'run-a' }
  const runB = { id: 'run-b' }
  await step.prepare({}, runA)
  await step.prepare({}, runB)
  // Run A is played on after run B was prepared: it still finishes its rounds with its own state.
  await round('run-a')
  await round('run-b')
  assert.deepEqual(
    saved.map((s) => [s.runId, s.state, /frame frame-of-(run-\w)/.exec(s.error)?.[1]]),
    [
      ['run-a', 'failed', 'run-a'],
      ['run-b', 'failed', 'run-b']
    ]
  )
  // A run claimed again replaces its own state; the end of the older play never drops the newer one.
  const runAagain = { id: 'run-a' }
  await step.prepare({}, runAagain)
  step.release(runA)
  await round('run-a')
  assert.equal(saved.at(-1).state, 'failed', 'the newer play of run A is still held')
  // Once a run's play ends, its state is let go: a later save of it is a plain save, and run B is untouched.
  step.release(runAagain)
  await round('run-a')
  assert.equal(saved.at(-1).state, 'checked')
  await round('run-b')
  assert.equal(saved.at(-1).state, 'failed')
})

// ── A chain build among several active runs ──────────────────────────────────────────────────────

/** The planner bench's `run`, `get` and `cancel` as a chain calls them, starting runs through the real start. */
function plannerBench(pool) {
  const calls = []
  const cli = async (argv, io) => {
    calls.push(argv[0])
    if (argv[0] === 'get' || argv[0] === 'cancel') return 0
    if (argv[0] !== 'run') throw new Error(`unexpected bench command ${argv[0]}`)
    const value = (flag) => argv[argv.indexOf(flag) + 1]
    const created = await createPlannerRun(pool, {
      startedBy: `cli:${value('--by')}`,
      brief: { facts: [] },
      briefSource: { kind: 'revision', revisionId: value('--brief-revision') },
      kit: { ref: value('--kit') },
      promptSha256: HASH,
      checkerVersion: 'v',
      door: { model: 'm' },
      harness: {}
    })
    if (created.error) {
      const refused = benchFullRefusal(created.error, 'planner runs', created.activeRuns)
      io.err(`${refused.code}: ${refused.reason}`)
      return 1
    }
    io.out(created.run.id)
    return 0
  }
  return { calls, cli }
}

/** A planner run as a chain build (or a person) left it going. */
async function goingRun(pool, { by, revisionId, kitRef }) {
  const created = await createPlannerRun(pool, {
    startedBy: by,
    brief: { facts: [] },
    briefSource: { kind: 'revision', revisionId },
    kit: { ref: kitRef },
    promptSha256: HASH,
    checkerVersion: 'v',
    door: { model: 'm' },
    harness: {}
  })
  assert.ok(created.run, created.error)
  return created.run.id
}

/** End a run with a plan, as the worker would. */
async function finish(pool, runId) {
  await saveRound(pool, { runId, round: 0, state: 'checked', plan: { version: 'site-plan/3', pages: [] } })
  await pool.query(`update site_planner_run set status = 'succeeded' where id = $1`, [runId])
}

const KIT = 'ja-boxing/j6/1.0.11'
const REVISION = '11111111-1111-4111-8111-111111111111'

test(
  'a chain build takes over its own run among several active ones, never another build',
  opts,
  async () => {
    const { pool } = db
    const others = [
      await goingRun(pool, {
        by: 'cli:step-chain',
        revisionId: '22222222-2222-4222-8222-222222222222',
        kitRef: KIT
      }),
      await goingRun(pool, { by: 'cli:bench-operator', revisionId: REVISION, kitRef: KIT })
    ]
    const own = await goingRun(pool, { by: 'cli:step-chain', revisionId: REVISION, kitRef: KIT })
    const bench = plannerBench(pool)
    const steps = createStepChainSteps({
      config: {},
      pool,
      benchCli: { plan: bench.cli },
      // The poll waits on the run it follows: the worker ends it with a plan.
      sleep: async () => finish(pool, own),
      log: { info: () => {} }
    })
    const ctx = { runId: 'resumed-build', brief: { researchRevisionId: REVISION } }
    try {
      const answer = await steps.plan(ctx, { kit: { ref: KIT } }, { signal: new AbortController().signal })
      assert.deepEqual(bench.calls, ['get'], 'no start: the build took its own run over')
      assert.equal(JSON.parse(await readFile(answer.value.file, 'utf8')).version, 'site-plan/3')
      const { rows } = await pool.query(`select id, status from site_planner_run where id = any($1)`, [
        others
      ])
      assert.deepEqual(
        rows.map((r) => r.status),
        ['queued', 'queued'],
        'the runs of another build and of a person are left alone'
      )
    } finally {
      await steps.dispose(ctx)
    }
  }
)

test(
  'a run of the build asked to stop is not taken over: the step starts a run of its own',
  opts,
  async () => {
    const { pool } = db
    const stopping = await goingRun(pool, { by: 'cli:step-chain', revisionId: REVISION, kitRef: KIT })
    await pool.query(`update site_planner_run set cancel_requested_at = now() where id = $1`, [stopping])
    const bench = plannerBench(pool)
    const steps = createStepChainSteps({
      config: {},
      pool,
      benchCli: { plan: bench.cli },
      sleep: async () => {
        const { rows } = await pool.query(
          `select id from site_planner_run where status = 'queued' and cancel_requested_at is null`
        )
        for (const r of rows) await finish(pool, r.id)
      },
      log: { info: () => {} }
    })
    const ctx = { runId: 'after-a-stop', brief: { researchRevisionId: REVISION } }
    try {
      await steps.plan(ctx, { kit: { ref: KIT } }, { signal: new AbortController().signal })
      assert.deepEqual(bench.calls, ['run', 'get'])
      const { rows } = await pool.query(`select status from site_planner_run where id = $1`, [stopping])
      assert.equal(rows[0].status, 'queued', 'the stopping run is left to its worker')
    } finally {
      await steps.dispose(ctx)
    }
  }
)

test(
  'a chain build with no run of its own on a full bench waits, then starts its own beside the others',
  opts,
  async () => {
    const { pool } = db
    const others = []
    for (let n = 0; n < BENCH_RUNS_AT_ONCE; n++)
      others.push(
        await goingRun(pool, {
          by: 'cli:step-chain',
          revisionId: `3333333${n}-3333-4333-8333-333333333333`,
          kitRef: KIT
        })
      )
    const bench = plannerBench(pool)
    let waits = 0
    let started = null
    const steps = createStepChainSteps({
      config: {},
      pool,
      benchCli: { plan: bench.cli },
      sleep: async () => {
        waits++
        if (waits === 1) {
          // Another build's run ends: one place frees up.
          await finish(pool, others[0])
          return
        }
        started ??= (
          await pool.query(`select id from site_planner_run where brief_source ->> 'revisionId' = $1`, [
            REVISION
          ])
        ).rows[0].id
        await finish(pool, started)
      },
      log: { info: () => {} }
    })
    const ctx = { runId: 'new-build', brief: { researchRevisionId: REVISION } }
    try {
      await steps.plan(ctx, { kit: { ref: KIT } }, { signal: new AbortController().signal })
      assert.deepEqual(bench.calls, ['run', 'run', 'get'], 'refused once on the full bench, then started')
      const { rows } = await pool.query(
        `select count(*)::int as n from site_planner_run where status = 'queued' and id = any($1)`,
        [others.slice(1)]
      )
      assert.equal(rows[0].n, BENCH_RUNS_AT_ONCE - 1, 'the other builds go on beside it')
    } finally {
      await steps.dispose(ctx)
    }
  }
)
