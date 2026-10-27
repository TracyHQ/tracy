import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { testDir } from './lib/test-root.mjs'
import { writePreviousRelease } from './lib/previous-release.mjs'
import { fingerprintOf } from '../lib/source-fingerprint.mjs'
import { ALL_CHECKS, DEFAULT_SCHEMES, DEFAULT_WIDTHS, sweepInputs } from '../visual/site-sweep.mjs'
import { CHAIN_PHASES, SWEEP_FULL_REASON, chainPlan, failureLines, previousThemeZip, resolvePlugin, runChain } from '../quickstart/patch-chain.mjs'

function fixture(metadata = {}) {
  const root = testDir('chain')
  const previous = path.join(root, 'prev')
  writePreviousRelease(previous, { metadata })
  const o = {
    out: path.join(root, 'out'), stand: path.join(root, 'stand'), themeZip: path.join(root, 'wp-x-1.0.1.zip'), source: 'http://src', baseline: path.join(root, 'base'),
    previous, runRoot: path.join(root, 'dossier'), spec: path.join(root, 'spec'), routes: path.join(root, 'spec', 'page-map.json'), contract: 'x/wp7/1.0.1',
    id: 'quickstart/x/wp7', version: '1.0.1', siteA: 'http://a', siteB: 'http://b', wpA: 'wpa', wpB: 'wpb', rootB: 'rootb', admin: 'tracyagent', darkHook: 'attr:data-theme=dark',
    dbHost: 'verify-db', dbPasswordEnv: 'MARIADB_ROOT_PASSWORD', plugin: 'plugin.zip'
  }
  return { root, o }
}
const tools = (calls) => calls.map((a) => path.basename(a[0]))

test('the phases run in order and each is one child process', async () => {
  const { o } = fixture()
  const calls = []
  const lines = []
  const r = await runChain(o, { run: async (argv) => (calls.push(argv), { code: 0, output: '' }), write: (s) => lines.push(s) })
  assert.equal(r.ok, true)
  assert.deepEqual(tools(calls), ['cycle.mjs', 'site-sweep.mjs', 'port-audit.mjs', 'contract-bind.mjs', 'release.mjs'])
  assert.equal(lines.length, CHAIN_PHASES.length)
  assert.ok(lines.every((l) => /^[a-z]+: ok in \d+s( \(full run: [^)]+\))?\n$/.test(l)))
  const state = JSON.parse(readFileSync(path.join(o.out, 'chain-state.json'), 'utf8'))
  for (const p of CHAIN_PHASES) assert.equal(state.phases[p].exit, 0)
  assert.ok(state.phases.release.command.includes('--patch'))
})

test('the argv carries the previous theme zip, the sweep measure and the baseline version', () => {
  const { o } = fixture()
  const steps = chainPlan({ ...o, changedFrom: previousThemeZip(o.previous), baselineVersion: '1.0.0' })
  assert.ok(steps.cycle.argv.includes('--patch') && steps.cycle.argv.includes('--to'))
  assert.equal(steps.cycle.argv[steps.cycle.argv.indexOf('--to') + 1], 'verify')
  assert.ok(!steps.cycle.argv.includes('--measure'))
  const rel = steps.release.argv
  assert.equal(rel[rel.indexOf('--measure') + 1], path.join(o.out, 'sweep', 'fix-measure.json'))
  assert.equal(rel[rel.indexOf('--out') + 1], path.join(o.out, 'release'))
  assert.equal(rel[rel.indexOf('--baseline-version') + 1], '1.0.0')
  assert.equal(steps.sweep.argv[steps.sweep.argv.indexOf('--baseline-version') + 1], '1.0.0')
  assert.equal(steps.sweep.argv[steps.sweep.argv.indexOf('--zip') + 1], o.themeZip)
})

test('the sweep phase is always the full sweep with the release reason, whatever extra arguments it is given and wherever the chain resumes', async () => {
  const { o } = fixture()
  const fullOf = (argv) => [argv.includes('--full'), argv[argv.indexOf('--reason') + 1], argv.filter((a) => a === '--full' || a === '--reason').length]
  assert.equal(SWEEP_FULL_REASON, 'release gate')
  const steps = chainPlan({ ...o, changedFrom: previousThemeZip(o.previous) })
  assert.deepEqual(fullOf(steps.sweep.argv), [true, 'release gate', 2])
  // the reason is one argument, and no scope flag is added: the sweep measures every check, route and width
  assert.ok(!steps.sweep.argv.some((a) => ['--only', '--pages', '--widths'].includes(a)))
  assert.equal(steps.sweep.argv.at(-2), '--out')
  const extra = chainPlan({ ...o, changedFrom: previousThemeZip(o.previous), sweepArg: ['--concurrency 2', '--verbose'] })
  assert.deepEqual(fullOf(extra.sweep.argv), [true, 'release gate', 2])
  assert.equal(extra.sweep.argv[extra.sweep.argv.indexOf('--concurrency') + 1], '2')
  // an argument that narrows the sweep or states its own full/reason is refused, in every spelling
  for (const bad of ['--pages /a', '--pages=/a', '--widths 390', '--widths=390', '--only overflow', '--only=overflow', '--schemes light', '--schemes=light', '--full', '--reason x', '--reason=x'])
    assert.throws(() => chainPlan({ ...o, changedFrom: previousThemeZip(o.previous), sweepArg: ['--concurrency 2', bad] }), /full release sweep/, bad)
  // no other phase takes the flag
  for (const phase of CHAIN_PHASES.filter((p) => p !== 'sweep')) assert.ok(!steps[phase].argv.includes('--full') && !steps[phase].argv.includes('--reason'), phase)
  // run and resumed, the child process gets it; a failing sweep still stops the chain with exit state 1 and resumes at the sweep
  const calls = []
  const run = (code) => async (argv) => (calls.push(argv), { code: path.basename(argv[0]) === 'site-sweep.mjs' ? code : 0, output: '' })
  const failed = await runChain(o, { run: run(1), write: () => {} })
  assert.deepEqual([failed.ok, failed.phase, failed.state.phases.sweep.exit, failed.state.phases.audit], [false, 'sweep', 1, undefined])
  assert.match(failed.state.phases.sweep.command, /--full --reason release gate/)
  const owed = await runChain({ ...o, from: 'sweep' }, { run: run(3), write: () => {} })
  assert.deepEqual([owed.ok, owed.phase, owed.state.phases.sweep.exit], [false, 'sweep', 3])
  const resumed = await runChain({ ...o, from: 'sweep' }, { run: run(0), write: () => {} })
  assert.equal(resumed.ok, true)
  const sweeps = calls.filter((a) => path.basename(a[0]) === 'site-sweep.mjs')
  assert.equal(sweeps.length, 3)
  for (const argv of sweeps) assert.deepEqual(fullOf(argv), [true, 'release gate', 2])
})

test('the chain stops at the first failing phase and shows the tool\'s refusal lines and the log path', async () => {
  const { o } = fixture()
  const calls = []
  const lines = []
  const noise = Array.from({ length: 300 }, (_, i) => `progress ${i}`).join('\n')
  const r = await runChain(o, {
    run: async (argv) => (calls.push(argv), path.basename(argv[0]) === 'site-sweep.mjs' ? { code: 1, output: `${noise}\n[sweep-regression] 3 cases worse\n${noise}` } : { code: 0, output: '' }),
    write: (s) => lines.push(s)
  })
  assert.equal(r.ok, false)
  assert.equal(r.phase, 'sweep')
  assert.deepEqual(tools(calls), ['cycle.mjs', 'site-sweep.mjs'])
  const text = lines.join('')
  assert.match(text, /sweep: FAILED \(exit 1\)/)
  assert.match(text, /\[sweep-regression\] 3 cases worse/)
  assert.match(text, new RegExp(`log: ${path.join(o.out, 'logs', 'sweep.log').replace(/\./g, '\\.')}`))
  assert.ok(text.split('\n').length <= 45)
  const state = JSON.parse(readFileSync(path.join(o.out, 'chain-state.json'), 'utf8'))
  assert.equal(state.phases.sweep.exit, 1)
  assert.equal(state.phases.audit, undefined)
})

test('failureLines falls back to the tail when no line looks like a refusal, capped at 40', () => {
  const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
  const got = failureLines(text)
  assert.equal(got.length, 40)
  assert.equal(got.at(-1), 'line 99')
})

test('--from resumes at a phase when the earlier ones are green, and refuses when they are not', async () => {
  const { o } = fixture()
  let calls = []
  const run = (failOn) => async (argv) => (calls.push(argv), { code: path.basename(argv[0]) === failOn ? 1 : 0, output: '' })
  await runChain(o, { run: run('port-audit.mjs'), write: () => {} })
  calls = []
  const r = await runChain({ ...o, from: 'audit' }, { run: run(null), write: () => {} })
  assert.equal(r.ok, true)
  assert.deepEqual(tools(calls), ['port-audit.mjs', 'contract-bind.mjs', 'release.mjs'])
  const fresh = fixture()
  await assert.rejects(runChain({ ...fresh.o, from: 'bind' }, { run: run(null), write: () => {} }), /phase cycle is not green/)
})

test('--from prune|pack|restore|verify resumes inside the cycle', async () => {
  const { o } = fixture()
  await runChain(o, { run: async () => ({ code: 0, output: '' }), write: () => {} })
  const calls = []
  await runChain({ ...o, from: 'restore' }, { run: async (argv) => (calls.push(argv), { code: 0, output: '' }), write: () => {} })
  assert.equal(path.basename(calls[0][0]), 'cycle.mjs')
  assert.equal(calls[0][calls[0].indexOf('--from') + 1], 'restore')
  assert.equal(calls.length, 5)
})

test('the plugin comes from the injected resolver only when --plugin is not given', async () => {
  const { o } = fixture()
  const { plugin: _drop, ...bare } = o
  let asked = 0
  const argvs = []
  await runChain(bare, { run: async (a) => (argvs.push(a), { code: 0, output: '' }), plugin: () => (asked++, 'https://example.invalid/p.zip'), write: () => {} })
  assert.equal(asked, 1)
  const bind = argvs.find((a) => path.basename(a[0]) === 'contract-bind.mjs')
  assert.equal(bind[bind.indexOf('--plugin') + 1], 'https://example.invalid/p.zip')
  asked = 0
  await runChain(o, { run: async () => ({ code: 0, output: '' }), plugin: () => asked++, write: () => {} })
  assert.equal(asked, 0)
})

test('resolvePlugin takes the newest wordpress-v* release and its zip asset, ignoring other tags', () => {
  const calls = []
  const gh = (args) => {
    calls.push(args)
    if (args[1] === 'list')
      return JSON.stringify([
        { tagName: 'wordpress-theme-9.9.9', publishedAt: '2026-09-01T00:00:00Z' },
        { tagName: 'wordpress-v0.17.4', publishedAt: '2026-07-01T00:00:00Z' },
        { tagName: 'wordpress-v0.18.0', publishedAt: '2026-08-01T00:00:00Z' },
        { tagName: 'joomla-v1.0.0', publishedAt: '2026-09-02T00:00:00Z' }
      ])
    return JSON.stringify({ assets: [{ name: 'notes.txt', url: 'u/notes.txt' }, { name: 'claude-cowork-0.18.0.zip', url: 'u/claude-cowork-0.18.0.zip' }] })
  }
  assert.equal(resolvePlugin(gh), 'u/claude-cowork-0.18.0.zip')
  assert.equal(calls[1][2], 'wordpress-v0.18.0')
  assert.throws(() => resolvePlugin(() => JSON.stringify([{ tagName: 'joomla-v1.0.0' }])), /no wordpress-v\* release/)
})

const argOf = (argv, flag) => argv[argv.indexOf(flag) + 1]
const argsOf = (argv, flag) => argv.flatMap((a, i) => (a === flag ? [argv[i + 1]] : []))
const releaseArgv = async (o) => {
  const calls = []
  await runChain(o, { run: async (argv) => (calls.push(argv), { code: 0, output: '' }), write: () => {} })
  return calls.find((a) => path.basename(a[0]) === 'release.mjs')
}
const METADATA = Object.fromEntries(['tracy_setting.json', 'tracy_design_inspiration.json', 'tracy_other.json', 'tracy_more.json'].map((n) => [n, `{"file":"${n}"}\n`]))

test('the release takes tracy_setting.json and the card from --previous and every other tracy_*.json as an asset; what the operator passes wins', async () => {
  const { o } = fixture(METADATA)
  const release = await releaseArgv(o)
  assert.equal(argOf(release, '--setting-template'), path.join(o.previous, 'tracy_setting.json'))
  assert.equal(argOf(release, '--card'), path.join(o.previous, 'tracy_design_inspiration.json'))
  assert.deepEqual(argsOf(release, '--asset').sort(), [path.join(o.previous, 'tracy_more.json'), path.join(o.previous, 'tracy_other.json')])
  const own = await releaseArgv({ ...o, settingTemplate: '/mine/setting.json', card: '/mine/card.json', asset: [path.join(o.previous, 'tracy_other.json')] })
  assert.equal(argOf(own, '--setting-template'), '/mine/setting.json')
  assert.equal(argOf(own, '--card'), '/mine/card.json')
  assert.deepEqual(argsOf(own, '--asset').sort(), [path.join(o.previous, 'tracy_more.json'), path.join(o.previous, 'tracy_other.json')])
  const bare = await releaseArgv(fixture().o)
  assert.ok(!bare.includes('--setting-template') && !bare.includes('--card') && !bare.includes('--asset'), 'a previous release with none carries none')
})

test('a --previous whose checksummed manifest.json is malformed or names an asset that is not there stops the chain, naming manifest.json or the asset', async () => {
  const run = async () => {
    throw new Error('no phase may run')
  }
  const { o } = fixture(METADATA)
  const sums = path.join(o.previous, 'SHA256SUMS')
  const manifest = path.join(o.previous, 'manifest.json')
  const goodSums = readFileSync(sums, 'utf8')
  const goodManifest = JSON.parse(readFileSync(manifest, 'utf8'))
  const seal = (text) => {
    writeFileSync(manifest, text)
    const hash = createHash('sha256').update(text).digest('hex')
    writeFileSync(sums, goodSums.split('\n').map((l) => (l.endsWith('  manifest.json') ? `${hash}  manifest.json` : l)).join('\n'))
  }
  const variants = {
    notJson: ['{ not json', /manifest\.json cannot be read as a release manifest/],
    assetsNotList: [JSON.stringify({ ...goodManifest, assets: 'x' }), /manifest\.json cannot be read as a release manifest/],
    unsafeAsset: [JSON.stringify({ ...goodManifest, assets: [{ file: '../x.json' }] }), /manifest\.json cannot be read as a release manifest/],
    objectUnlisted: [JSON.stringify({ ...goodManifest, assets: [...goodManifest.assets, { file: 'missing.json' }] }), /does not list missing\.json/],
    nameUnlisted: [JSON.stringify({ ...goodManifest, assets: [...goodManifest.assets, { name: 'missing.json' }] }), /does not list missing\.json/],
    pathUnlisted: [JSON.stringify({ ...goodManifest, assets: [...goodManifest.assets, { path: 'missing.json' }] }), /does not list missing\.json/]
  }
  for (const [name, [text, pattern]] of Object.entries(variants)) {
    seal(text)
    await assert.rejects(runChain(o, { run, write: () => {} }), (e) => pattern.test(e.message), name)
  }
})

test('a --previous that cannot be read or whose SHA256SUMS does not verify stops the chain before any phase, naming the file', async () => {
  const run = async () => {
    throw new Error('no phase may run')
  }
  const attempt = async (o) => runChain(o, { run, write: () => {} })
  const { o } = fixture(METADATA)
  const sums = path.join(o.previous, 'SHA256SUMS')
  const good = readFileSync(sums, 'utf8')
  const bad = '0'.repeat(64)
  const variants = {
    empty: ['', /SHA256SUMS is empty/],
    malformed: [`${good}not a line\n`, /SHA256SUMS has a line/],
    repeated: [`${good}${good.split('\n')[0]}\n`, /more than once/],
    unsafeName: [`${good}${bad}  ../x\n`, /SHA256SUMS has a line/],
    absent: [`${good}${bad}  gone.json\n`, /does not hold for gone\.json/],
    wrongHash: [good.replace(/^[0-9a-f]{64}(?=  tracy_other\.json)/m, bad), /does not hold for tracy_other\.json/],
    wrongNotes: [`${good}${bad}  release-notes.md\n`, /does not hold for release-notes\.md/],
    unlisted: [good.split('\n').filter((l) => !l.endsWith('tracy_more.json')).join('\n'), /does not list tracy_more\.json/],
    manifestUnlisted: [good.split('\n').filter((l) => !l.endsWith('  manifest.json')).join('\n'), /does not list manifest\.json/],
    verificationUnlisted: [good.split('\n').filter((l) => !l.endsWith('  VERIFICATION.json')).join('\n'), /does not list VERIFICATION\.json/],
    readmeUnlisted: [good.split('\n').filter((l) => !l.endsWith('  README.md')).join('\n'), /does not list README\.md/]
  }
  for (const [name, [text, pattern]] of Object.entries(variants)) {
    writeFileSync(sums, text)
    await assert.rejects(attempt(o), (e) => pattern.test(e.message) && e.message.includes('SHA256SUMS'), name)
  }
  rmSync(sums)
  await assert.rejects(attempt(o), /SHA256SUMS cannot be read/)
  mkdirSync(sums)
  await assert.rejects(attempt(o), /SHA256SUMS cannot be read/)
  rmSync(sums, { recursive: true })
  writeFileSync(sums, good)
  symlinkSync(path.join(o.previous, 'manifest.json'), path.join(o.previous, 'tracy_link.json'))
  await assert.rejects(attempt(o), /tracy_link\.json is not a regular file/)
  rmSync(path.join(o.previous, 'tracy_link.json'))
  await assert.rejects(attempt({ ...o, previous: path.join(o.previous, 'nowhere') }), /nowhere/)
})

// ---- the full sweep of the output is not run again when it is the sweep the chain would run ---------------------------------
// Synthetic artifacts: a fix-measure.json and a site-sweep.json as a full release sweep writes them, a baseline and a restore report.

const sourceFp = (html = '<p>synthetic source home</p>') => fingerprintOf({ url: 'http://src/', html })

function sweepFixture() {
  const { root, o } = fixture()
  mkdirSync(o.spec, { recursive: true })
  mkdirSync(o.runRoot, { recursive: true })
  mkdirSync(path.join(o.stand, 'pack'), { recursive: true })
  mkdirSync(o.baseline, { recursive: true })
  writeFileSync(path.join(o.spec, 'page-map.json'), JSON.stringify({ pages: [{ id: 'home', path: '/' }] }))
  writeFileSync(path.join(o.runRoot, 'visual.contract.json'), JSON.stringify({ pages: [{ id: 'home', path: '/' }] }))
  writeFileSync(o.themeZip, 'synthetic theme zip bytes')
  const zipSha = createHash('sha256').update(readFileSync(o.themeZip)).digest('hex')
  const checks = (pass = true) => ALL_CHECKS.map((id) => ({ id, title: id, pass, cases: 4, defects: pass ? 0 : 1 }))
  mkdirSync(path.join(o.spec, 'reference'), { recursive: true })
  writeFileSync(path.join(o.spec, 'reference', 'home.html'), '<p>synthetic rendered source</p>')
  writeFileSync(path.join(o.baseline, 'fix-measure.json'), JSON.stringify({ schema: 'tracy-fix-measure/v1', tool: 'site-sweep.mjs', ranAt: '2026-01-01T00:00:00.000Z', site: 'http://old', source: 'http://src', artifact: { themeZipSha256: 'a'.repeat(64) }, checks: checks(), passed: ALL_CHECKS.length, total: ALL_CHECKS.length, baseline: null, notDefects: [] }))
  const baselineVersion = '1.0.0'
  const restoredAt = '2026-03-01T10:00:00.000Z'
  writeFileSync(path.join(o.stand, 'pack', 'restore.json'), JSON.stringify({ finishedAt: restoredAt }))
  const ranAt = '2026-03-01T10:30:00.000Z'
  const fix = { schema: 'tracy-fix-measure/v1', tool: 'site-sweep.mjs', ranAt, site: 'http://b', source: 'http://src', artifact: { themeZipSha256: zipSha }, checks: checks(), passed: ALL_CHECKS.length, total: ALL_CHECKS.length, baseline: { version: baselineVersion, passed: ALL_CHECKS.length, total: ALL_CHECKS.length, ranAt: '2026-01-01T00:00:00.000Z', checks: ALL_CHECKS.map((id) => ({ id, pass: true })) }, notDefects: [], sourceFingerprint: sourceFp() }
  const doc = { schema: 'tracy-site-sweep/v1', tool: 'site-sweep.mjs', ranAt, site: 'http://b', source: 'http://src', widths: DEFAULT_WIDTHS, schemes: DEFAULT_SCHEMES, only: [...ALL_CHECKS], routesTotal: 1, routesMeasured: 1, checks: checks().map((c) => ({ ...c, defects: 0, notMeasured: 0, acceptErrors: 0 })), exit: 0, owed: [], theme: { version: '1.0.1', zipSha256: zipSha }, run: { mode: 'full', reason: 'release gate' }, inputs: sweepInputs(o.runRoot, o.spec), baselineInput: { sha256: createHash('sha256').update(readFileSync(path.join(o.baseline, 'fix-measure.json'))).digest('hex'), version: baselineVersion }, sourceFingerprint: sourceFp(), fixMeasure: fix }
  const write = (patch = {}) => {
    const d = { ...doc, ...patch }
    const f = patch.fixMeasure ?? d.fixMeasure
    mkdirSync(path.join(o.out, 'sweep'), { recursive: true })
    writeFileSync(path.join(o.out, 'sweep', 'fix-measure.json'), JSON.stringify(f, null, 2))
    writeFileSync(path.join(o.out, 'sweep', 'site-sweep.json'), JSON.stringify(d, null, 2))
  }
  write()
  // the cycle of an earlier attempt is green: the chain resumes at the sweep
  writeFileSync(path.join(o.out, 'chain-state.json'), JSON.stringify({ phases: { cycle: { exit: 0 } } }))
  return { root, o: { ...o, baselineVersion }, fix, doc, write, restoreAt: (iso) => writeFileSync(path.join(o.stand, 'pack', 'restore.json'), JSON.stringify({ finishedAt: iso })) }
}
const liveSource = (fingerprint = sourceFp()) => ({ ok: true, fingerprint })
const runAll = async (o, readSource = () => liveSource()) => {
  const calls = []
  const lines = []
  const r = await runChain(o, { run: async (argv) => (calls.push(argv), { code: 0, output: '' }), write: (s) => lines.push(s), readSource })
  return { r, calls: tools(calls), line: lines.find((l) => l.startsWith('sweep:')) }
}

test('sweep reuse: a full sweep of this zip, site, source, dossier and baseline taken after the restore is not run again; the chain says so and the measure is untouched', async () => {
  const f = sweepFixture()
  const before = readFileSync(path.join(f.o.out, 'sweep', 'fix-measure.json'), 'utf8')
  const { r, calls, line } = await runAll({ ...f.o, from: 'sweep' })
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['port-audit.mjs', 'contract-bind.mjs', 'release.mjs'])
  assert.match(line, /^sweep: ok in \d+s \(reused: the full sweep of 2026-03-01T10:30:00\.000Z /)
  assert.deepEqual([r.state.phases.sweep.exit, r.state.phases.sweep.sweep.mode, r.state.phases.sweep.sweep.ranAt], [0, 'reused', '2026-03-01T10:30:00.000Z'])
  assert.equal(readFileSync(path.join(f.o.out, 'sweep', 'fix-measure.json'), 'utf8'), before)
  // the log chain-state points at is this run's decision
  assert.match(readFileSync(r.state.phases.sweep.log, 'utf8'), /^sweep reused at .*\nmeasure: .*fix-measure\.json\nreport: .*site-sweep\.json\nsweep ran at: 2026-03-01T10:30:00\.000Z/s)
})

test('sweep reuse: a different zip, baseline, site, source, dossier or spec content, a scoped or carried run, a red one, one older than the restore, or an extra sweep argument runs the full sweep', async () => {
  const mismatches = {
    'another theme zip': (f) => writeFileSync(f.o.themeZip, 'other bytes'),
    'another baseline version': (f) => { f.o.baselineVersion = '0.9.0' },
    'another baseline content': (f) => writeFileSync(path.join(f.o.baseline, 'fix-measure.json'), JSON.stringify({ ...JSON.parse(readFileSync(path.join(f.o.baseline, 'fix-measure.json'), 'utf8')), ranAt: '2026-01-02T00:00:00.000Z' })),
    'another site': (f) => { f.o.siteB = 'http://elsewhere' },
    'another source': (f) => { f.o.source = 'http://other-src' },
    'spec content changed at the same path': (f) => writeFileSync(path.join(f.o.spec, 'page-map.json'), JSON.stringify({ pages: [{ id: 'home', path: '/' }, { id: 'a', path: '/a' }] })),
    'a rendered source file of the spec changed at the same path': (f) => writeFileSync(path.join(f.o.spec, 'reference', 'home.html'), '<p>another rendered source</p>'),
    'a baseline with the same counts and another content': (f) => writeFileSync(path.join(f.o.baseline, 'fix-measure.json'), JSON.stringify({ ...JSON.parse(readFileSync(path.join(f.o.baseline, 'fix-measure.json'), 'utf8')), notDefects: [{ what: 'x', why: 'y', evidence: 'z' }] })),
    'no baseline recorded by the sweep': (f) => f.write({ baselineInput: undefined }),
    'a check that measured no case': (f) => f.write({ checks: f.doc.checks.map((c, i) => (i ? c : { ...c, cases: 0, pass: false })) }),
    'a symbolic link in the spec-pack': (f) => symlinkSync(path.join(f.o.spec, 'reference', 'home.html'), path.join(f.o.spec, 'reference', 'link.html')),
    'dossier accept rows changed': (f) => writeFileSync(path.join(f.o.runRoot, 'review.config.json'), JSON.stringify({ sweep: { accept: [] } })),
    'a scoped re-run': (f) => f.write({ run: { mode: 'scoped', reason: null } }),
    'carried checks': (f) => f.write({ checks: f.doc.checks.map((c, i) => (i ? c : { ...c, carried: true })) }),
    'a check that did not run': (f) => f.write({ only: ALL_CHECKS.slice(1), checks: f.doc.checks.slice(1) }),
    'a red check': (f) => f.write({ checks: f.doc.checks.map((c, i) => (i ? c : { ...c, pass: false, defects: 1 })), exit: 1 }),
    'a case not measured': (f) => f.write({ checks: f.doc.checks.map((c, i) => (i ? c : { ...c, notMeasured: 1 })) }),
    'something owed': (f) => f.write({ owed: [{ route: '/x', reason: 'unreachable' }] }),
    'a report that is not the one the measure was written with': (f) => writeFileSync(path.join(f.o.out, 'sweep', 'fix-measure.json'), JSON.stringify({ ...f.fix, ranAt: '2026-03-01T10:31:00.000Z' })),
    'no dossier inputs recorded': (f) => f.write({ inputs: undefined }),
    'older than the restore': (f) => f.restoreAt('2026-03-01T11:00:00.000Z'),
    'an extra sweep argument': (f) => { f.o.sweepArg = ['--concurrency 2'] },
    'no earlier sweep': (f) => rmSync(path.join(f.o.out, 'sweep'), { recursive: true })
  }
  for (const [name, mutate] of Object.entries(mismatches)) {
    const f = sweepFixture()
    mutate(f)
    const { r, calls, line } = await runAll({ ...f.o, from: 'sweep' })
    assert.deepEqual(calls.slice(0, 2), ['site-sweep.mjs', 'port-audit.mjs'], name)
    assert.match(line, /\(full run: .+\)/, name)
    assert.equal(r.state.phases.sweep.sweep.mode, 'full', name)
  }
})

test('sweep reuse: the source read now must be the one the sweep and its measure recorded; a missing, disagreeing, different or unreadable one runs the full sweep', async () => {
  const reads = []
  const matching = await runAll({ ...sweepFixture().o, from: 'sweep' }, (url, template) => (reads.push([url, template]), liveSource()))
  assert.equal(matching.r.state.phases.sweep.sweep.mode, 'reused')
  assert.deepEqual(reads, [['http://src/', null]])
  const cases = {
    'the sweep records none': [(f) => f.write({ sourceFingerprint: undefined }), undefined, /sweep records no fingerprint/],
    'the measure records none': [(f) => f.write({ fixMeasure: { ...f.fix, sourceFingerprint: undefined } }), undefined, /fix-measure\.json records no fingerprint/],
    'the sweep and the measure disagree': [(f) => f.write({ sourceFingerprint: sourceFp('<p>another</p>') }), undefined, /different source fingerprints/],
    'the live fingerprint differs': [() => {}, () => liveSource(sourceFp('<p>changed source home</p>')), /not the one the earlier sweep measured/],
    'the live source cannot be read': [() => {}, () => ({ ok: false, error: 'http://src/ answered 503, not 200' }), /cannot be fingerprinted now: http:\/\/src\/ answered 503/]
  }
  for (const [name, [mutate, readSource, why]] of Object.entries(cases)) {
    const f = sweepFixture()
    mutate(f)
    const { r, calls } = await runAll({ ...f.o, from: 'sweep' }, readSource)
    assert.equal(r.state.phases.sweep.sweep.mode, 'full', name)
    assert.match(r.state.phases.sweep.sweep.why, why, name)
    assert.equal(calls[0], 'site-sweep.mjs', name)
  }
})

test('sweep reuse: a chain that runs the cycle restores again, so an earlier sweep is older than that restore and the sweep runs', async () => {
  const f = sweepFixture()
  const calls = []
  const r = await runChain(f.o, { run: async (argv) => { calls.push(path.basename(argv[0])); if (path.basename(argv[0]) === 'cycle.mjs') f.restoreAt(new Date(Date.now() + 1000).toISOString()); return { code: 0, output: '' } }, write: () => {} })
  assert.equal(r.ok, true)
  assert.deepEqual(calls.slice(0, 2), ['cycle.mjs', 'site-sweep.mjs'])
})
