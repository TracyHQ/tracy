// The write step bench settles the demo baseline of a quickstart version once (ADR 0044, decision 8): create-site makes an
// untouched site, and the baseline of the kit's version is reused when stored, measured once when not, and measured again
// only when the operator forces it. Driven the way an operator does, with a fake door and a fake host. Invented pages.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileBaselineStore } from '../src/site-check/demo-baseline.js'
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
