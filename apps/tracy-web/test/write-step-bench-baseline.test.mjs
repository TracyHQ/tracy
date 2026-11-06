// The write step bench settles the demo baseline of a quickstart version once (ADR 0044, decision 8): create-site makes an
// untouched site, and the baseline of the kit's version is reused when stored, measured once when not, and measured again
// only when the operator forces it. Driven the way an operator does, with a fake door and a fake host. Invented pages.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { BASELINE_FILE } from '../src/lib/template-kit/demo-baseline-file.js'
import {
  baselineOutcome,
  contractBaselineStore,
  ensureBaseline,
  fileBaselineStore
} from '../src/site-check/demo-baseline.js'
import { runCli } from '../src/write-step/bench-site-cli.js'
import { fakeHost, demoRead } from './_site-check-pages.mjs'
import { fakeClock, fakeDoor, kitIndex, memoryStore } from './_write-step-bench.mjs'

const kits = kitIndex()
const dirs = []
after(async () => {
  kits.done()
  await Promise.all(dirs.map((d) => rm(d, { recursive: true })))
})

const VERSION = 'demo-gym/j6/1.2.3'
const reads = { '/': demoRead('/'), '/about': demoRead('/about') }

/** One operator session: the baseline folder and the host persist across `create-site` runs, the site does not. */
async function operator() {
  const dir = await mkdtemp(path.join(tmpdir(), 'bench-baseline-'))
  dirs.push(dir)
  const baselines = fileBaselineStore(dir)
  const { host, calls } = fakeHost(reads)
  const run = async (argv, over = {}) => {
    const out = []
    const err = []
    const clock = fakeClock()
    const code = await runCli(argv, {
      ensureBaseline,
      baselineOutcome,
      store: memoryStore(),
      index: kits.index,
      makeDoor: () => fakeDoor(),
      makeHost: async () => host,
      baselines,
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      now: clock.now,
      sleep: clock.sleep,
      ...over
    })
    return { code, out, err }
  }
  return { run, calls, baselines }
}

const create = (...extra) => ['create-site', '--kit', VERSION, '--account', 'bench@example.test', ...extra]
const baselineLine = (out) => out.find((l) => l.startsWith('baseline'))

test('a version with no stored baseline is measured once on the new untouched site and stored', async () => {
  const { run, calls, baselines } = await operator()
  const first = await run(create())
  assert.equal(first.code, 0)
  assert.match(baselineLine(first.out), /^baseline measured \(none was stored\) for demo-gym\/j6\/1\.2\.3/)
  assert.ok(calls.length > 0)
  assert.equal((await baselines.read(VERSION)).source, 'host')
})

test('a second run reuses the stored baseline and asks the host nothing', async () => {
  const { run, calls } = await operator()
  await run(create())
  const asked = calls.length
  const second = await run(create())
  assert.equal(second.code, 0)
  assert.match(baselineLine(second.out), /^baseline reused \(stored\) for demo-gym\/j6\/1\.2\.3/)
  assert.equal(calls.length, asked, 'a stored baseline is not measured again')
})

test('forcing is an explicit choice: --force-baseline measures again and says so', async () => {
  const { run, calls } = await operator()
  await run(create())
  const asked = calls.length
  const forced = await run(create('--force-baseline'))
  assert.equal(forced.code, 0)
  assert.match(baselineLine(forced.out), /^baseline measured again \(forced\)/)
  assert.ok(calls.length > asked)
})

test('a measurement that fails stores nothing and the run exits 1 with the reason', async () => {
  const { run, baselines } = await operator()
  const failing = await run(create(), {
    makeHost: async () => async () => {
      throw new Error('host down')
    }
  })
  assert.equal(failing.code, 1)
  assert.match(failing.err.join('\n'), /baseline: not stored for demo-gym\/j6\/1\.2\.3: host down/)
  assert.equal(await baselines.read(VERSION), null)
})

/**
 * The bench's store as `write-step-bench.mjs` wires it: the baseline committed beside the contract at step 0 first, the
 * baseline folder only as a fallback cache. A kit index of its own, so the file written beside its contract stays there.
 */
async function contractOperator() {
  const own = kitIndex()
  const dir = await mkdtemp(path.join(tmpdir(), 'bench-baseline-cache-'))
  dirs.push(dir)
  const cache = fileBaselineStore(dir)
  const [contract] = [...own.index.values()]
  const { host, calls } = fakeHost(reads)
  const baselines = contractBaselineStore({ index: own.index, cache })
  const run = async (argv, over = {}) => {
    const out = []
    const err = []
    const clock = fakeClock()
    const code = await runCli(argv, {
      ensureBaseline,
      baselineOutcome,
      store: memoryStore(),
      index: own.index,
      makeDoor: () => fakeDoor(),
      makeHost: async () => host,
      baselines,
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      now: clock.now,
      sleep: clock.sleep,
      ...over
    })
    return { code, out, err }
  }
  return { run, calls, cache, baselines, contract, done: own.done }
}

/** A baseline as step 0 commits it beside the contract: no machine time, one made-up text key of its own. */
const committed = (version) => ({
  schema: 'demo-baseline/1',
  quickstart: version,
  source: 'host',
  texts: ['c0ffee00c0ffee00'],
  labels: [],
  pictures: { files: [], shas: [] },
  unread: []
})

test('the baseline beside the contract is read first: no measurement, and the cache is not consulted', async () => {
  const op = await contractOperator()
  try {
    writeFileSync(path.join(op.contract.dir, BASELINE_FILE), JSON.stringify(committed(VERSION)))
    await op.cache.save(VERSION, { ...committed(VERSION), texts: ['cache000cache000'] })
    const made = await op.run(create())
    assert.equal(made.code, 0)
    assert.match(baselineLine(made.out), /^baseline reused \(stored\) for demo-gym\/j6\/1\.2\.3/)
    assert.equal(op.calls.length, 0, 'a committed baseline is never measured again')
    assert.deepEqual((await op.baselines.read(VERSION)).texts, ['c0ffee00c0ffee00'])
  } finally {
    op.done()
  }
})

test('with no file beside the contract the cache is the fallback: measured once, kept there, then reused', async () => {
  const op = await contractOperator()
  try {
    const first = await op.run(create())
    assert.match(baselineLine(first.out), /^baseline measured \(none was stored\)/)
    assert.equal((await op.cache.read(VERSION)).source, 'host')
    const asked = op.calls.length
    const second = await op.run(create())
    assert.match(baselineLine(second.out), /^baseline reused \(stored\)/)
    assert.equal(op.calls.length, asked)
  } finally {
    op.done()
  }
})

test('with neither a file beside the contract nor a cache, nothing is measured that could not be kept', async () => {
  const own = kitIndex()
  try {
    const { host, calls } = fakeHost(reads)
    const out = []
    const clock = fakeClock()
    const code = await runCli(create(), {
      ensureBaseline,
      baselineOutcome,
      store: memoryStore(),
      index: own.index,
      makeDoor: () => fakeDoor(),
      makeHost: async () => host,
      baselines: contractBaselineStore({ index: own.index, cache: null }),
      out: (l) => out.push(l),
      err: (l) => out.push(l),
      now: clock.now,
      sleep: clock.sleep
    })
    assert.equal(code, 0)
    assert.match(baselineLine(out), /^baseline: none beside the contract and no baseline folder/)
    assert.equal(calls.length, 0)
  } finally {
    own.done()
  }
})
