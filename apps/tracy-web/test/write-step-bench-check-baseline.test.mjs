// The write step bench's check uses the demo baseline create-site settled (ADR 0044, decision 8; carried over from #419):
// an operator creates a site, the site is written, and check says whether the baseline of the quickstart version was
// reused from the store or is missing. Driven through the bench's command line with a fake door and a fake host. Invented
// pages of an invented club.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileBaselineStore } from '../src/site-check/demo-baseline.js'
import { runCli } from '../src/write-step-bench-cli.js'
import { checkSite } from './_site-check.mjs'
import { demoRead, fakeHost, keptPages, OWN_WORDS, pageRead, writtenReport } from './_site-check-pages.mjs'
import { fakeClock, fakeDoor, kitIndex, memoryStore } from './_write-step-bench.mjs'
import { memoryRunStore } from './_write-step-run.mjs'

const VERSION = 'demo-gym/j6/1.2.3'
const kits = kitIndex({ tool: 'template-kit 3.1.0' })
const dirs = []
after(async () => {
  kits.done()
  await Promise.all(dirs.map((d) => rm(d, { recursive: true })))
})

/** One operator: the baseline folder, the run store and the host persist across commands. */
async function operator({ store = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'bench-check-baseline-'))
  dirs.push(dir)
  const reads = { '/': demoRead('/'), '/about': demoRead('/about') }
  const { host } = fakeHost(reads)
  const runs = memoryRunStore()
  // The written site answers the version create-site made, and holds the words its report ordered.
  const site = checkSite(
    {},
    {
      inspect: {
        ok: true,
        contract: VERSION,
        revision: 'rev-1',
        pages: keptPages(2),
        slots: [{ key: 'module-2.1', entity: 'module-2', type: 'text', current: OWN_WORDS }]
      }
    }
  )
  const out = []
  const run = async (argv) => {
    out.length = 0
    const clock = fakeClock()
    const code = await runCli(argv, {
      store: memoryStore(),
      runs,
      index: kits.index,
      makeDoor: () => ({ ...fakeDoor(), apply: site.door.apply }),
      makeHost: async () => host,
      ...(store ? { baselines: fileBaselineStore(dir) } : {}),
      out: (l) => out.push(l),
      err: (l) => out.push(l),
      now: clock.now,
      sleep: clock.sleep
    })
    return { code, out: [...out] }
  }
  /** The site written: its pages now show the owner's words, and the run that wrote it ended with its report. */
  const write = (siteKey) => {
    reads['/'] = pageRead('/')
    reads['/about'] = pageRead('/about')
    runs.rows.push({
      id: 'run-1',
      siteKey,
      kit: VERSION,
      status: 'done',
      phase: 'done',
      report: writtenReport({ site: siteKey, kit: VERSION, contract: VERSION, slots: [writtenWords] })
    })
  }
  return { run, write }
}

const writtenWords = {
  slot: 'block-2.1',
  key: 'module-2.1',
  owner: 'writer',
  status: 'written',
  reason: null,
  readBack: null,
  ordered: OWN_WORDS
}

const baselineLine = (out) => out.find((l) => l.startsWith('baseline'))
const check = ['check', '--run', 'run-1', '--account', 'bench@example.test']

test('check after create-site reuses the baseline create-site stored and says so', async () => {
  const op = await operator()
  const created = await op.run(['create-site', '--kit', VERSION, '--account', 'bench@example.test'])
  assert.equal(created.code, 0)
  assert.match(baselineLine(created.out), /^baseline measured \(none was stored\)/)
  op.write(created.out[0])
  const checked = await op.run(check)
  assert.match(baselineLine(checked.out), /^baseline reused \(stored\) for demo-gym\/j6\/1\.2\.3/)
  // Judged against the stored baseline, the written pages show no demo words.
  assert.match(
    checked.out.find((l) => l.startsWith('demo-words:')),
    /^demo-words: green/
  )
})

test('check on a version with no stored baseline says the demo groups go unmeasured', async () => {
  const op = await operator({ store: false })
  const created = await op.run(['create-site', '--kit', VERSION, '--account', 'bench@example.test'])
  op.write(created.out[0])
  const checked = await op.run(check)
  assert.match(baselineLine(checked.out), /^baseline: none stored for demo-gym\/j6\/1\.2\.3/)
  assert.match(
    checked.out.find((l) => l.startsWith('demo-words:')),
    /^demo-words: unmeasured/
  )
})
