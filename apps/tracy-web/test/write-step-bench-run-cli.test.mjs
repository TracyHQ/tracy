// The write step bench's run, list, status, get and cancel (ADR 0044): the run happens in the command's own process, on a
// site the bench made. The site door and the stores are fakes; the kit is a made-up one in a temporary contract folder.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step-bench-cli.js'
import { memoryStore } from './_write-step-bench.mjs'
import { brandFile, brandKit, brandSite, frozenWithBrand } from './_write-step-brand.mjs'
import { frozenWithPictures, HERO, pictureKit, pictureSite } from './_write-step-pictures.mjs'
import { copy, fakeSite, frozenFiles, KIT, memoryRunStore, plan } from './_write-step-run.mjs'

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
  tool: 'template-kit 3.1.0',
  quickstart: { version: '1.0.0' },
  images: [{ id: 'block-1-1440', path: 'images/block-1-1440.jpg', sha256: 'e'.repeat(64) }]
}
writeFileSync(path.join(contractDir, 'template-kit.json'), JSON.stringify(made))
const index = new Map([
  ['demo-gym/j6@1.0.0', { id: 'demo-gym/j6/1.0.0', dir: contractDir, platform: 'joomla' }]
])
after(() => rmSync(contractDir, { recursive: true, force: true }))

function harness({
  site = fakeSite(),
  sites = memoryStore([benchSite()]),
  runs = memoryRunStore(),
  kits = index,
  makeHost
} = {}) {
  const out = []
  const err = []
  const accounts = []
  const cli = (argv) =>
    runCli(argv, {
      runs,
      store: sites,
      index: kits,
      makeDoor: (input) => (accounts.push(input), site.door),
      ...(makeHost ? { makeHost } : {}),
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
  assert.ok(h.out.some((l) => /^done: 9 written, 2 hidden, \d+ skipped, 0 failed$/.test(l)))
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

test('a dispute no longer stops the run: it exits 0, the run is done and the report keeps the dispute', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'Words the plan hides', factIds: [] })
  const frozen = frozenFiles({ copy: c })
  const h = harness()
  assert.equal(await h.cli(runArgs(frozen.files)), 0)
  frozen.done()
  const row = h.runs.rows[0]
  assert.equal(row.status, 'done')
  assert.ok(h.site.applies().length >= 1)
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

// The check command: reads the site of a run that ended, prints the result, and keeps it on the run's report.
function checkedSite() {
  const site = fakeSite()
  const door = {
    async apply(call) {
      const answer = await site.door.apply(call)
      if (call.params.operation !== 'inspect') return answer
      return { ...answer, slots: answer.slots.map((s) => ({ ...s, current: site.held[s.key] ?? '' })) }
    }
  }
  return { ...site, door }
}

async function ranRun() {
  const frozen = frozenFiles()
  const h = harness({ site: checkedSite() })
  await h.cli(runArgs(frozen.files))
  frozen.done()
  h.out.length = 0
  return h
}

const checkArgs = (over = []) => ['check', '--run', 'run-1', '--account', 'bench@example.test', ...over]

test('check prints the group and the verdict, exits 0 on green and writes nothing to the site', async () => {
  const h = await ranRun()
  const before = h.site.calls.filter((c) => c.params.operation !== 'inspect').length
  assert.equal(await h.cli(checkArgs()), 0)
  assert.equal(h.out[0], 'kit-version: green 1 checked')
  // Nothing found and nothing left out is not applicable, never green at 0 checked (ADR 0044, decision 27).
  assert.equal(
    h.out[1],
    "look-guard-findings: not-applicable 0 checked (the write step's look guard found nothing)"
  )
  assert.match(h.out[2], /^unaddressable-items: not-applicable 0 checked \(the write step left nothing out/)
  assert.match(h.out[3], /^slot-disputes: not-applicable 0 checked \(no two files claimed one slot/)
  assert.match(
    h.out[4],
    /^emphasis-codes-left: not-applicable 0 checked \(the write step wrote no emphasis codes/
  )
  assert.match(h.out[5], /^read-back: green 11 checked, \d+ skipped reads: content\.contract inspect \(11\)$/)
  assert.equal(h.out.at(-1), 'site-check: green (0 block, 0 warn, 0 unmeasured, 4 not applicable)')
  assert.equal(h.site.calls.filter((c) => c.params.operation !== 'inspect').length, before)
  const { report } = h.runs.rows[0]
  assert.equal(report.siteCheck.version, 'site-check/1')
  assert.equal(report.slots.find((s) => s.slot === 'block-2.1').readBack, 'match')
})

test('check exits 1 on red, printing the page, the slot, the step, and --out keeps the result', async () => {
  const h = await ranRun()
  h.site.held['module-2.1'] = 'Changed by hand'
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-check-'))
  assert.equal(await h.cli(checkArgs(['--out', dir])), 1)
  const line = h.out.find((l) => l.includes('slot=block-2.1'))
  assert.match(
    line,
    /block step 9 \(write\) page=- slot=block-2\.1 key=module-2\.1 measured="Changed by hand"/
  )
  assert.equal(h.out.at(-1), 'site-check: red (1 block, 0 warn, 0 unmeasured, 4 not applicable)')
  const saved = JSON.parse(readFileSync(path.join(dir, 'site-check.json'), 'utf8'))
  assert.equal(saved.status, 'red')
  assert.equal(h.runs.rows[0].report.slots.find((s) => s.slot === 'block-2.1').readBack, 'differs')
  rmSync(dir, { recursive: true, force: true })
})

test('check --all-groups runs the page groups after a red read-back; a default check does not', async () => {
  const host = async () => ({ checks: [], pageMeasures: [] })
  for (const [flags, wantAll] of [
    [['--all-groups'], true],
    [[], false]
  ]) {
    const h = await ranRun()
    h.site.held['module-2.1'] = 'Changed by hand'
    const asked = []
    const again = harness({
      site: h.site,
      runs: h.runs,
      makeHost: async () => (p) => (asked.push(p), host(p))
    })
    assert.equal(await again.cli(checkArgs(flags)), 1)
    const stopped = again.out.some((l) => /not-run/.test(l))
    assert.equal(stopped, !wantAll)
    assert.equal(
      again.out.some((l) => /ran although read-back is red/.test(l)),
      wantAll
    )
    // The page groups the host answers nothing for are unmeasured, and counted when they ran.
    assert.match(
      again.out.at(-1),
      wantAll
        ? /^site-check: red \(1 block, 0 warn, [1-9]\d* unmeasured(?:, \d+ not applicable)?\)$/
        : /^site-check: red \(1 block, 0 warn, 0 unmeasured, 4 not applicable\)$/
    )
  }
})

test('check says plainly when there is no run, no report, a run still going, or wrong usage', async () => {
  const h = harness({ site: checkedSite() })
  assert.equal(await h.cli(checkArgs()), 1)
  assert.match(h.err.at(-1), /No run run-1/)
  await h.runs.begin({ siteKey: SITE, kit: 'k', startedBy: 'cli' })
  assert.equal(await h.cli(checkArgs()), 1)
  assert.match(h.err.at(-1), /still going/)
  await h.runs.finish('run-1', { status: 'stopped', code: 'X', reason: 'y' })
  assert.equal(await h.cli(checkArgs()), 1)
  assert.match(h.err.at(-1), /left no report/)
  assert.equal(await h.cli(['check', '--account', 'a@example.test']), 2)
  assert.equal(await h.cli(['check', '--run', 'run-1']), 2)
})

test('run takes a brand file and writes it before the contract call', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-brand-kit-'))
  writeFileSync(
    path.join(dir, 'template-kit.json'),
    JSON.stringify({ ...brandKit().doc, kit: 'tracy-template-kit/2', images: made.images })
  )
  const kits = new Map([['demo-gym/j6@1.0.0', { id: 'demo-gym/j6/1.0.0', dir, platform: 'joomla' }]])
  const site = brandSite()
  const brand = brandFile()
  brand.colours = { decision: 'kept-template', module: null }
  const frozen = frozenWithBrand({ brand })
  const h = harness({ site, kits })
  const code = await h.cli(runArgs(frozen.files, ['--brand-file', frozen.files.brand]))
  frozen.done()
  rmSync(dir, { recursive: true, force: true })
  assert.equal(h.err.join('\n'), '')
  assert.equal(code, 0)
  assert.equal(site.of('site.identity', 'set').length, 1)
  assert.equal(site.of('content.contract', 'apply').length, 1)
})

test('run takes a picture package, relative to where it is called, and its files relative to the package', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-pictures-kit-'))
  writeFileSync(path.join(dir, 'template-kit.json'), JSON.stringify({ ...made, site: pictureKit().doc.site }))
  const kits = new Map([['demo-gym/j6@1.0.0', { id: 'demo-gym/j6/1.0.0', dir, platform: 'joomla' }]])
  const site = pictureSite()
  const frozen = frozenWithPictures()
  const out = []
  const runs = memoryRunStore()
  try {
    const code = await runCli(runArgs(frozen.files, ['--pictures-file', 'mapping.json']), {
      runs,
      store: memoryStore([benchSite()]),
      index: kits,
      makeDoor: () => site.door,
      out: (l) => out.push(l),
      err: (l) => out.push(l),
      sleep: async () => {},
      cwd: frozen.dir
    })
    assert.equal(code, 0, out.join('\n'))
    assert.equal(site.uploads.get(HERO.entry.sitePath), HERO.bytes.toString('base64'))
    const { report } = await runs.read('run-1')
    assert.equal(report.inputs.pictures.file, 'mapping.json')
    assert.equal(report.slots.find((s) => s.slot === 'block-2.pic').status, 'written')
  } finally {
    frozen.done()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('without --pictures-file a run sends no upload', async () => {
  const h = harness()
  const frozen = frozenFiles()
  try {
    assert.equal(await h.cli(runArgs(frozen.files)), 0)
    assert.ok(!h.site.calls.some((c) => c.action === 'media.upload'))
  } finally {
    frozen.done()
  }
})

test('a second run on the same site compares with the last report and writes only what differs', async () => {
  const h = harness()
  const frozen = frozenFiles()
  await h.cli(runArgs(frozen.files))
  frozen.done()
  const c = copy()
  c.slots.find((s) => s.slot === 'block-2.1').text = 'Train with a coach you trust'
  const changed = frozenFiles({ copy: c })
  h.out.length = 0
  h.site.calls.length = 0
  assert.equal(await h.cli(runArgs(changed.files)), 0)
  changed.done()
  const applies = h.site.calls.filter((call) => call.params.operation === 'apply')
  assert.deepEqual(applies[0].params.changes, { 'module-2.1': 'Train with a coach you trust' })
  assert.ok(
    h.out.some((l) => /^done: 1 written, 0 hidden, \d+ skipped, 0 failed, 10 unchanged in \d+ ms$/.test(l)),
    h.out.join('\n')
  )
  assert.equal(h.runs.rows[1].report.rewrite.from, 'run-1')
  assert.equal(typeof h.runs.rows[1].report.timings.total, 'number')
})

test('a change that needs a new site is refused in plain words and recorded, and the run after it still compares', async () => {
  const h = harness({ site: fakeSite() })
  const frozen = frozenFiles()
  await h.cli(runArgs(frozen.files))
  const shown = plan()
  shown.pages[0].blocks[0].hiddenSlots = []
  const refused = frozenFiles({ plan: shown })
  h.site.calls.length = 0
  assert.equal(await h.cli(runArgs(refused.files)), 1)
  refused.done()
  assert.equal(h.site.calls.length, 0)
  assert.match(h.err.at(-1), /NEEDS_NEW_SITE/)
  assert.match(h.err.at(-1), /block-2\.3/)
  assert.equal(h.runs.rows[1].code, 'NEEDS_NEW_SITE')
  assert.equal(await h.cli(runArgs(frozen.files)), 0)
  frozen.done()
  assert.equal(h.site.calls.filter((call) => call.params.operation === 'apply').length, 0)
  assert.equal(h.runs.rows[2].report.counts.written, 0)
})

test('a run that left no report makes the site unknown, so the next run is refused before it begins', async () => {
  const h = harness()
  const frozen = frozenFiles()
  await h.cli(runArgs(frozen.files))
  h.runs.rows[0].report = null
  h.runs.rows[0].status = 'stopped'
  h.runs.rows[0].code = 'CRASHED'
  h.site.calls.length = 0
  assert.equal(await h.cli(runArgs(frozen.files)), 1)
  frozen.done()
  assert.match(h.err.at(-1), /NEEDS_NEW_SITE/)
  assert.match(h.err.at(-1), /run-1/)
  assert.equal(h.runs.rows.length, 1, 'no run is recorded')
  assert.equal(h.site.calls.length, 0)
})

test('a run still going on the site is what a new run is told about, not its older report', async () => {
  const h = harness()
  const frozen = frozenFiles()
  await h.cli(runArgs(frozen.files))
  await h.runs.begin({ siteKey: SITE, kit: 'demo-gym/j6/1.0.0', startedBy: 'cli' })
  assert.equal(await h.cli(runArgs(frozen.files)), 1)
  frozen.done()
  assert.match(h.err.at(-1), /RUN_ACTIVE/)
})
