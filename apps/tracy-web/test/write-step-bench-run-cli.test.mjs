// The write step bench's run, list, status, get and cancel (ADR 0044): the run happens in the command's own process, on a
// site the bench made. The site door and the stores are fakes; the kit is a made-up one in a temporary contract folder.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step/bench-cli.js'
import { memoryStore } from './_write-step-bench.mjs'
import { copy, fakeSite, frozenFiles, KIT, memoryRunStore } from './_write-step-run.mjs'

const SITE = 'write-bench-abc.sites.example'
const benchSite = () => ({
  id: 'site-1',
  label: 'write-bench-abc',
  siteKey: SITE,
  status: 'ready',
  contract: 'demo-gym/j6/1.0.0'
})

const contractDir = mkdtempSync(path.join(tmpdir(), 'write-step-contract-'))
const made = {
  ...KIT().doc,
  kit: 'tracy-template-kit/2',
  quickstart: { version: '1.0.0' },
  images: [{ id: 'block-1-1440', path: 'images/block-1-1440.jpg', sha256: 'e'.repeat(64) }]
}
writeFileSync(path.join(contractDir, 'template-kit.json'), JSON.stringify(made))
const index = new Map([
  ['demo-gym/j6@1.0.0', { id: 'demo-gym/j6/1.0.0', dir: contractDir, platform: 'joomla' }]
])
after(() => rmSync(contractDir, { recursive: true, force: true }))

function harness({ site = fakeSite(), sites = memoryStore([benchSite()]), runs = memoryRunStore() } = {}) {
  const out = []
  const err = []
  const accounts = []
  const cli = (argv) =>
    runCli(argv, {
      runs,
      store: sites,
      index,
      makeDoor: (input) => (accounts.push(input), site.door),
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      sleep: async () => {}
    })
  return { cli, out, err, runs, site, accounts }
}

const runArgs = (files, over = []) => [
  'run',
  '--site',
  SITE,
  '--kit',
  'demo-gym/j6/1.0.0',
  '--plan-file',
  files.plan,
  '--copy-file',
  files.copy,
  '--account',
  'bench@example.test',
  ...over
]

test('run writes the copy inside the command and prints the run id and the counts', async () => {
  const frozen = frozenFiles()
  const h = harness()
  const code = await h.cli(runArgs(frozen.files, ['--by', 'tester']))
  frozen.done()
  assert.equal(code, 0)
  assert.equal(h.out[0], 'run-1')
  assert.ok(h.out.some((l) => /^done: 9 written, 0 hidden, \d+ skipped, 0 failed$/.test(l)))
  assert.equal(h.site.held['module-5.1'], 'Nia Brook')
  assert.deepEqual(h.accounts, [{ account: 'bench@example.test', platform: 'joomla' }])
  const row = h.runs.rows[0]
  assert.equal(row.status, 'done')
  assert.equal(row.startedBy, 'cli:tester')
  assert.equal(row.report.version, 'site-write-report/1')
})

test('list and status read the run; get writes the report file', async () => {
  const frozen = frozenFiles()
  const h = harness()
  await h.cli(runArgs(frozen.files))
  frozen.done()
  h.out.length = 0
  assert.equal(await h.cli(['list']), 0)
  assert.match(
    h.out[0],
    /^run-1 {2}done {2}write-bench-abc\.sites\.example {2}demo-gym\/j6\/1\.0\.0 {2}9 written/
  )
  h.out.length = 0
  assert.equal(await h.cli(['status', 'run-1']), 0)
  assert.ok(h.out.some((l) => /^status done$/.test(l)))
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-get-'))
  assert.equal(await h.cli(['get', 'run-1', '--out', dir]), 0)
  const report = JSON.parse(readFileSync(path.join(dir, 'site-write-report.json'), 'utf8'))
  rmSync(dir, { recursive: true, force: true })
  assert.equal(report.status, 'done')
  assert.equal(report.counts.written, 9)
})

test('a dispute exits 1 and records the cause', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'Words the plan hides', factIds: [] })
  const frozen = frozenFiles({ copy: c })
  const h = harness()
  assert.equal(await h.cli(runArgs(frozen.files)), 1)
  frozen.done()
  assert.ok(h.err.some((l) => /SLOT_DISPUTE/.test(l) && /block-2\.3/.test(l)))
  const row = h.runs.rows[0]
  assert.deepEqual([row.status, row.code], ['stopped', 'SLOT_DISPUTE'])
  assert.equal(h.site.applies().length, 0)
})

test('a missing file is a recorded stop, not a usage error', async () => {
  const frozen = frozenFiles({ plan: null })
  const h = harness()
  assert.equal(await h.cli(runArgs(frozen.files)), 1)
  frozen.done()
  assert.deepEqual([h.runs.rows[0].status, h.runs.rows[0].code], ['stopped', 'MISSING_FILE'])
})

test('a site this bench did not make is never written', async () => {
  const frozen = frozenFiles()
  const h = harness({ sites: memoryStore([]) })
  const code = await h.cli(runArgs(frozen.files))
  frozen.done()
  assert.equal(code, 1)
  assert.match(h.err[0], /NOT_A_BENCH_SITE/)
  assert.equal(h.site.calls.length, 0)
  assert.equal(h.runs.rows.length, 0)
})

test('an unknown kit is refused with the readable ones named; a second run on a busy site is refused', async () => {
  const frozen = frozenFiles()
  const h = harness()
  const args = runArgs(frozen.files)
  args[args.indexOf('demo-gym/j6/1.0.0')] = 'nope/j6/1.0.0'
  assert.equal(await h.cli(args), 1)
  assert.match(h.err[0], /demo-gym\/j6\/1\.0\.0/)
  const busy = memoryRunStore()
  await busy.begin({ siteKey: SITE, kit: 'demo-gym/j6/1.0.0', startedBy: 'cli' })
  const h2 = harness({ runs: busy })
  assert.equal(await h2.cli(runArgs(frozen.files)), 1)
  frozen.done()
  assert.match(h2.err[0], /run-1/)
  assert.equal(h2.site.calls.length, 0)
})

test('cancel sets the flag; the run stops at the next phase and writes nothing', async () => {
  const frozen = frozenFiles()
  const runs = memoryRunStore()
  // Another shell cancels as soon as the run reaches its first phase.
  const phase = runs.phase
  runs.phase = async (id, name) => {
    await phase(id, name)
    if (name === 'check') await runs.requestCancel(id)
  }
  const h = harness({ runs })
  assert.equal(await h.cli(runArgs(frozen.files)), 1)
  frozen.done()
  assert.equal(runs.rows[0].status, 'cancelled')
  assert.equal(h.site.calls.length, 0)
})

test('cancel answers for a running run, an ended run and an unknown one', async () => {
  const runs = memoryRunStore()
  const { run } = await runs.begin({ siteKey: SITE, kit: 'k', startedBy: 'cli' })
  const h = harness({ runs })
  assert.equal(await h.cli(['cancel', run.id]), 0)
  assert.equal(runs.rows[0].cancelRequested, true)
  assert.match(h.out[0], /asked to stop/)
  await runs.finish(run.id, { status: 'stopped' })
  assert.equal(await h.cli(['cancel', run.id]), 1)
  assert.equal(await h.cli(['cancel', 'run-99']), 1)
  assert.equal(await h.cli(['status', 'run-99']), 1)
})

test('wrong usage exits 2; the site commands keep working from the same command', async () => {
  const h = harness()
  assert.equal(await h.cli([]), 2)
  assert.equal(await h.cli(['run', '--site', SITE]), 2)
  assert.equal(await h.cli(['status']), 2)
  assert.equal(await h.cli(['get', 'run-1']), 2)
  assert.equal(await h.cli(['site-list']), 0)
  assert.ok(h.out.some((l) => l.startsWith('site-1')))
})
