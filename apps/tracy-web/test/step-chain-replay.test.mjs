// The replay of a finished chain build's write (src/step-chain-replay.js), driven through its own entry point with a fake
// database, fake bench runs and a fake write step bench: it takes the build's frozen inputs, makes its own trial site,
// writes and checks it in that order, and answers what the chain's diagnostics answer. No model, no site, no database.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { createChainReplays, REPLAY_BY } from '../src/step-chain-replay.js'

const KIT = 'ja-diner/j6/1.0.8'
const SITE = 'arabian-tea-lat33.tracy.site'
const CHAIN = {
  steps: [
    { step: 'site' },
    { step: 'brand', runId: 'brand-1' },
    { step: 'plan', runId: 'plan-1' },
    { step: 'pictures', runId: 'pictures-1' },
    { step: 'copy', runId: 'copy-1', draftRunId: 'draft-1' },
    { step: 'write' }
  ]
}

function fakePool({ chain = CHAIN, plan = { pages: [{ id: 'page-home' }] } } = {}) {
  return {
    async query(sql, params) {
      if (sql.includes("timings -> 'chain'")) return { rows: params[0] === SITE && chain ? [{ chain }] : [] }
      if (sql.includes('from site_planner_run')) return { rows: [{ kit_ref: KIT, revision_id: 'rev-1' }] }
      if (sql.includes('from wo_revision'))
        return { rows: [{ brief: { business: { name: 'Arabian Tea House' }, facts: [] } }] }
      if (sql.includes('from site_planner_round')) return { rows: plan ? [{ plan }] : [] }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

/** The bench runs' `get`: the files each run keeps, or a refusal for the names in `gone`. */
function fakeSteps({ gone = [], stale = false } = {}) {
  const asked = []
  return {
    asked,
    async filesOf(name, runId, dir) {
      asked.push([name, runId])
      if (gone.includes(name)) throw new Error(`the ${name} run ${runId} gave no files: No run ${runId}.`)
      await mkdir(dir, { recursive: true })
      const files = {
        copy: { 'site-copy.json': { version: 'site-copy/1', slots: [] } },
        brand: {
          'brand-file.json': { version: 'brand-file/1', spots: [{ file: 'spots/logo-header-1.v3.png' }] }
        },
        pictures: {
          'mapping.json': {
            mapping: { changes: { 'module-1.2': 'images/tracy-content/a.jpg' } },
            uploads: [{ file: 'files/a.jpg' }]
          },
          'site-pictures.json': { frames: [] }
        }
      }[name]
      for (const [file, doc] of Object.entries(files))
        await writeFile(path.join(dir, file), JSON.stringify(doc))
      // The pictures beside the documents, unless the run is older than the last deploy (`stale`).
      if (!stale && name === 'brand') {
        await mkdir(path.join(dir, 'spots'), { recursive: true })
        await writeFile(path.join(dir, 'spots', 'logo-header-1.v3.png'), 'png')
      }
      if (!stale && name === 'pictures') {
        await mkdir(path.join(dir, 'files'), { recursive: true })
        await writeFile(path.join(dir, 'files', 'a.jpg'), 'jpg')
      }
      // The picture bench says its mapping's problems and ends 3, its files written all the same.
      return name === 'pictures'
        ? { code: 3, out: [], err: ['mapping problem article-2.14: drawn'] }
        : { code: 0, out: [], err: [] }
    }
  }
}

const option = (argv, name) => argv[argv.indexOf(name) + 1]

/** The write step bench: a trial site, a write run, a red check and its report, each call kept. */
function fakeBench({ siteFails = false } = {}) {
  const calls = []
  const run = async (argv, d) => {
    calls.push(argv)
    const [command] = argv
    if (command === 'create-site') {
      if (siteFails) {
        d.err('SITE_JOB_FAILED: the host stopped')
        return 1
      }
      d.out('write-bench-abc.tracy.site')
      d.out('creation time 61.0 s')
      return 0
    }
    if (command === 'run') {
      d.out('write-run-1')
      d.out('done: 40 written, 3 hidden, 0 skipped, 0 failed')
      return 0
    }
    if (command === 'check') {
      const dir = option(argv, '--out')
      await mkdir(dir, { recursive: true })
      const check = {
        status: 'red',
        counts: { block: 1, warn: 0, unmeasured: 0, notApplicable: 0 },
        groups: [{ name: 'demo-words', status: 'red', checked: 9, failures: [{ slot: 'module-94.1' }] }]
      }
      await writeFile(path.join(dir, 'site-check.json'), JSON.stringify(check))
      return 1
    }
    if (command === 'get') {
      const dir = option(argv, '--out')
      await mkdir(dir, { recursive: true })
      await writeFile(
        path.join(dir, 'site-write-report.json'),
        JSON.stringify({ status: 'done', counts: { written: 40, hidden: 3, skipped: 0, failed: 0 } })
      )
      return 0
    }
    throw new Error(`unexpected bench command ${command}`)
  }
  return { run, calls }
}

async function finished(replays, id) {
  for (let i = 0; i < 400; i += 1) {
    const r = replays.get(id)
    if (r.state !== 'running') return r
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('the replay never finished')
}

function replaysWith(over = {}) {
  const steps = over.steps ?? fakeSteps()
  const bench = over.bench ?? fakeBench()
  const replays = createChainReplays({
    pool: over.pool ?? fakePool(),
    steps,
    benchDeps: () => ({ store: 'the bench wiring' }),
    runBench: bench.run,
    log: { warn() {}, info() {} },
    ...(over.tmp ? { tmp: over.tmp } : {})
  })
  return { replays, steps, bench }
}

test("a replay writes the build's own inputs to its own trial site, then checks it, and answers as the chain does", async () => {
  const { replays, steps, bench } = replaysWith()
  const started = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  assert.equal(started.ok, true)
  assert.equal(started.replay.state, 'running')
  const r = await finished(replays, started.replay.id)
  assert.equal(r.state, 'done', JSON.stringify(r.error))
  assert.deepEqual(steps.asked, [
    ['copy', 'copy-1'],
    ['brand', 'brand-1'],
    ['pictures', 'pictures-1']
  ])
  assert.deepEqual(
    bench.calls.map((a) => a[0]),
    ['create-site', 'run', 'check', 'get']
  )
  const [site, run, check] = bench.calls
  // Its own trial site, never another bench line's.
  assert.deepEqual(site, [
    'create-site',
    '--kit',
    KIT,
    '--account',
    'staff@tracy.test',
    '--by',
    REPLAY_BY,
    '--keep-others'
  ])
  assert.equal(option(run, '--site'), 'write-bench-abc.tracy.site')
  assert.equal(option(run, '--kit'), KIT)
  assert.match(option(run, '--plan-file'), /plan\.json$/)
  assert.match(option(run, '--copy-file'), /copy\/site-copy\.json$/)
  assert.match(option(run, '--brand-file'), /brand\/brand-file\.json$/)
  assert.match(option(run, '--pictures-file'), /pictures\/mapping\.json$/)
  assert.match(option(run, '--brief-file'), /brief\.json$/)
  assert.equal(option(check, '--run'), 'write-run-1')
  assert.match(option(check, '--site-pictures-file'), /pictures\/site-pictures\.json$/)
  assert.equal(r.trialSite, 'write-bench-abc.tracy.site')
  assert.equal(r.writeRun, 'write-run-1')
  assert.deepEqual(r.inputs.made, { plan: true, copy: true, brand: true, pictures: true })
  assert.equal(r.inputs.kit, KIT)
  assert.equal(r.inputs.revisionId, 'rev-1')
  // The chain's own summary of a write and its final check.
  assert.equal(r.diagnostics.write.status, 'done')
  assert.equal(r.diagnostics.finalCheck.status, 'red')
  assert.equal(r.diagnostics.finalCheck.counts.block, 1)
  assert.deepEqual(
    r.diagnostics.finalCheck.groups.map((g) => [g.name, g.failureCount]),
    [['demo-words', 1]]
  )
  for (const phase of ['inputs', 'site', 'write', 'check']) assert.equal(typeof r.minutes[phase], 'number')
  assert.equal(replays.list()[0].id, r.id)
})

test('one replay at a time: a second start while one runs is refused, and starts again once it ends', async () => {
  const { replays } = replaysWith()
  const first = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  const second = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  assert.equal(second.ok, false)
  assert.equal(second.code, 'REPLAY_BUSY')
  await finished(replays, first.replay.id)
  const third = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  assert.equal(third.ok, true)
  await finished(replays, third.replay.id)
})

test('a site with no chain build, or a start with no account, is refused before anything runs', async () => {
  const { replays, bench } = replaysWith({ pool: fakePool({ chain: null }) })
  const none = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  assert.equal(none.code, 'NO_CHAIN_BUILD')
  const nobody = await replays.start({ siteKey: SITE, account: '' })
  assert.equal(nobody.code, 'REPLAY_NO_ACCOUNT')
  assert.deepEqual(bench.calls, [])
})

test("a step whose run is gone gets the chain's own stand-in, and the replay says it was not the build's", async () => {
  const { replays, bench } = replaysWith({ steps: fakeSteps({ gone: ['copy', 'pictures'] }) })
  const started = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  const r = await finished(replays, started.replay.id)
  assert.equal(r.state, 'done', JSON.stringify(r.error))
  assert.deepEqual(r.inputs.made, { plan: true, copy: false, brand: true, pictures: false })
  const run = bench.calls.find((a) => a[0] === 'run')
  assert.match(option(run, '--copy-file'), /site-copy-stand-in\.json$/)
  assert.equal(run.includes('--pictures-file'), false)
  const stand = JSON.parse(await readFile(option(run, '--copy-file'), 'utf8').catch(() => 'null'))
  assert.equal(stand, null, 'the stand-in file goes with the replay folder')
  assert.ok(r.lines.some((l) => /copy: the copy run copy-1 gave no files/.test(l)))
})

test('a trial site that is not made ends the replay with its words, and nothing is written', async () => {
  const { replays, bench } = replaysWith({ bench: fakeBench({ siteFails: true }) })
  const started = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  const r = await finished(replays, started.replay.id)
  assert.equal(r.state, 'failed')
  assert.equal(r.error.code, 'REPLAY_SITE_FAILED')
  assert.match(r.error.reason, /SITE_JOB_FAILED/)
  assert.deepEqual(
    bench.calls.map((a) => a[0]),
    ['create-site']
  )
})

test('a replay whose files cannot be laid out fails in words, and the next one can start', async () => {
  const { replays, bench } = replaysWith({ tmp: '/nowhere/at/all' })
  const started = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  const r = await finished(replays, started.replay.id)
  assert.equal(r.state, 'failed')
  assert.equal(r.error.code, 'REPLAY_FAILED')
  assert.match(r.error.reason, /ENOENT/)
  assert.deepEqual(bench.calls, [])
  const again = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  assert.equal(again.ok, true)
  await finished(replays, again.replay.id)
})

test('a run older than the last deploy has its documents but not its pictures: they are set aside and the replay says so', async () => {
  const { replays, bench } = replaysWith({ steps: fakeSteps({ stale: true }) })
  const started = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  const r = await finished(replays, started.replay.id)
  assert.equal(r.state, 'done', JSON.stringify(r.error))
  assert.deepEqual(r.inputs.made, { plan: true, copy: true, brand: false, pictures: false })
  assert.deepEqual(r.inputs.gone, { brand: 1, pictures: 1 })
  const run = bench.calls.find((a) => a[0] === 'run')
  assert.match(option(run, '--brand-file'), /brand-stand-in\.json$/)
  assert.equal(run.includes('--pictures-file'), false)
  assert.ok(
    r.lines.some((l) => /brand: 1 of its pictures are gone \(spots\/logo-header-1\.v3\.png\)/.test(l))
  )
})

test('a picture run whose get ends 3 on mapping problems is still used, as the chain uses it', async () => {
  const { replays, bench } = replaysWith()
  const started = await replays.start({ siteKey: SITE, account: 'staff@tracy.test' })
  const r = await finished(replays, started.replay.id)
  assert.equal(r.inputs.made.pictures, true)
  assert.equal(r.inputs.gone, undefined)
  assert.match(
    option(
      bench.calls.find((a) => a[0] === 'run'),
      '--pictures-file'
    ),
    /pictures\/mapping\.json$/
  )
  assert.ok(r.lines.some((l) => /pictures: get ended 3: mapping problem/.test(l)))
})
