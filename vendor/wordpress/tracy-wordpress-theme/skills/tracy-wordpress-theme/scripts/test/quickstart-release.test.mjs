// release.mjs acceptance: a release is assembled only on a complete four-tier Visual QA checkpoint
// bound to the theme zip, webroot archive and database archive being released, measured no earlier
// than any of them, and on a green restore + parity whose access probes ran as the runtime user.
// Every refusal is named; a refusal writes nothing and leaves an earlier release as it was.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { testBase, withHome } from './lib/test-root.mjs'
import { recordPath, resolveRecordPath } from '../lib/record-paths.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractHash, CANONICAL } from '../lib/canonical.mjs'
import { STAGES } from '../visual/contract.mjs'
import { writeContracts } from './quickstart-contracts.mjs'
import { acceptedConfig, webrootTar } from './lib/webroot-tar.mjs'
import { cleanAudit } from './lib/finish-audit.mjs'
import { acquireLock, sumsText } from '../quickstart/lib.mjs'
import { baselineOf, mergeFixMeasures, writeFixMeasure } from '../lib/fix-measure.mjs'
import { coverageOf, expectedSweepCells } from '../lib/sweep-coverage.mjs'
import { fingerprintOf } from '../lib/source-fingerprint.mjs'
import { ALL_CHECKS, DEFAULT_SCHEMES, DEFAULT_WIDTHS, sweepInputs } from '../visual/site-sweep.mjs'
import { heightsWidths } from '../visual/site-sweep-heights.mjs'
import { acceptRelease, assembleRelease, behaviourProblems, compareVersions, portableVerification, runRelease, sweepAuthority, BINDING_FILE, BINDING_SCHEMA, SMOKE_TIER, TIER_IDS, AcceptanceError } from '../quickstart/release.mjs'
import { DARK_DERIVED_REASON } from '../visual/site-sweep-judge.mjs'
import { bindingFor, packArtifacts, writeBinding } from '../visual/round.mjs'
import { COUNT_OPTIONS, COUNT_TYPES } from '../quickstart/verify-parity.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const hex = (b) => createHash('sha256').update(b).digest('hex')
const tag = (b) => `sha256:${hex(b)}`
const iso = (ms) => new Date(ms).toISOString()
const T0 = Date.now() - 3600_000 // the archives and the theme zip were written an hour ago
const at = (min) => iso(T0 + min * 60_000)
const roots = []
// the source home page the fixtures were measured against (synthetic); `f.currentSource` is what the release reads of it now
const SOURCE_HTML = '<!doctype html><html><body>synthetic source home</body></html>'
const SOURCE_FP = fingerprintOf({ url: 'http://source.test/', html: SOURCE_HTML })
const N_CHECKS = ALL_CHECKS.length + 2 // the sweep's checks and the port's own A1 and B1
const SOURCE_REBUILT = fingerprintOf({ url: 'http://source.test/', html: '<!doctype html><html><body>synthetic source home, rebuilt</body></html>' })
test.after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/**
 * A complete, clean, fresh release input set on disk. Returns paths and helpers; `o` is what
 * release.mjs parses from its flags. `exceptions` go to the canonical visual contract.
 */
function fixture({ exceptions = null, pages = [{ id: 'home', path: '/' }], id = 'tracy-base/wp7', source = null, theme = null, sourceSite = 'http://source.test', sourceHtml = SOURCE_HTML, specFiles = {} } = {}) {
  const root = mkdtempSync(path.join(testBase(), 'p3-release-'))
  roots.push(root)
  const spec = path.join(root, 'spec')
  mkdirSync(spec)
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages, ...(theme ? { theme } : {}) }))
  writeFileSync(path.join(spec, 'sections.json'), '{}')
  writeFileSync(path.join(spec, 'content.json'), '{}')
  for (const [name, text] of Object.entries(specFiles)) {
    mkdirSync(path.dirname(path.join(spec, name)), { recursive: true })
    writeFileSync(path.join(spec, name), text)
  }
  const runRoot = path.join(root, 'dossier')
  mkdirSync(runRoot)
  // the decision an exception may cite (the release resolves every citation against the dossier's DECISIONS.md)
  writeFileSync(path.join(runRoot, 'DECISIONS.md'), '- D-1: the decorative elements p.x (p x) and p.y (p y) are accepted as decoration.\n')
  const { visual: visualContract } = writeContracts({ runRoot, specDir: spec, exceptions, source, sourceSite })
  const visualPath = path.join(runRoot, CANONICAL.visual)

  const pack = path.join(root, 'pack')
  mkdirSync(pack)
  const themeZip = path.join(root, 'tracy-base-1.0.0.zip')
  const f = {
    root,
    spec,
    runRoot,
    pack,
    themeZip,
    out: path.join(root, 'release'),
    ledger: path.join(root, 'evidence', 'rounds.jsonl'),
    parity: path.join(root, 'parity.json'),
    restore: path.join(root, 'restore.json'),
    contractBind: path.join(root, 'contract-bind.json'),
    visualPath,
    visualContract
  }
  const manifest = {
    schemaVersion: 'tracy-quickstart/v1',
    id,
    version: '1.0.0',
    platform: 'wordpress',
    wpVersion: '7.1',
    phpVersion: '8.3',
    prefix: 'tr_',
    theme: { name: 'tracy-base', version: '1.0.0' },
    plugins: [],
    webroot: { file: 'tracy-base-wp7-webroot-1.0.0.tar.gz', bytes: 0, sha256: '' },
    database: { file: 'tracy-base-wp7-database-1.0.0.sql.gz', bytes: 0, sha256: '' }
  }
  /** (Re)write the pack whole: archives, a manifest naming them and SHA256SUMS that hold. */
  f.writePack = (webroot = webrootTar(), database = 'database-bytes') => {
    for (const [k, bytes] of [['webroot', webroot], ['database', database]]) {
      writeFileSync(path.join(pack, manifest[k].file), bytes)
      manifest[k].sha256 = hex(Buffer.from(bytes))
      manifest[k].bytes = Buffer.byteLength(bytes)
    }
    const m = JSON.stringify(manifest, null, 2)
    writeFileSync(path.join(pack, 'manifest.json'), m)
    writeFileSync(path.join(pack, 'SHA256SUMS'), sumsText([{ file: 'manifest.json', sha256: hex(Buffer.from(m)) }, { file: manifest.webroot.file, sha256: manifest.webroot.sha256 }, { file: manifest.database.file, sha256: manifest.database.sha256 }]))
    f.age()
    return m
  }
  /** Artifact mtimes: `min` minutes after T0 (default 0). */
  f.age = (min = 0, which = ['webroot', 'database', 'theme']) => {
    const t = new Date(T0 + min * 60_000)
    for (const k of which) utimesSync(k === 'theme' ? themeZip : path.join(pack, manifest[k].file), t, t)
  }
  f.manifest = manifest
  writeFileSync(themeZip, 'theme-zip-bytes')
  const manifestText = f.writePack()
  f.hashes = () => ({
    theme: { file: path.basename(themeZip), sha256: tag(readFileSync(themeZip)) },
    webroot: { file: manifest.webroot.file, sha256: tag(readFileSync(path.join(pack, manifest.webroot.file))) },
    database: { file: manifest.database.file, sha256: tag(readFileSync(path.join(pack, manifest.database.file))) }
  })

  // restore report + parity.json, bound to this pack and one stand, probes as uid 33
  const binding = { manifest: hex(Buffer.from(manifestText)), webrootArchive: manifest.webroot.sha256, databaseArchive: manifest.database.sha256, webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33 }
  f.restoreReport = { ok: true, runtimeUid: 33, identity: { euid: 33, user: 'www-data' }, access: { beforeBootstrap: { ok: true, entries: 120, problems: [] }, afterRestore: { ok: true, themes: ['tracy-base'], entries: 120, problems: [] } }, binding: { ...binding }, steps: [{ name: 'extract' }], finishedAt: at(10) }
  // every count collectCounts takes, as verify-parity writes them: post/term counts, option values as text
  const counts = [...COUNT_TYPES.map((t, i) => [`post:${t}`, i + 1]), ['term:category', 3], ...COUNT_OPTIONS.map((o) => [`option:${o}`, o === 'show_on_front' ? 'page' : o === 'stylesheet' || o === 'template' ? 'tracy-base' : `${o}-value`])]
  f.parityReport = {
    a: 'http://a',
    b: 'http://b/',
    generatedAt: at(20),
    ok: true,
    access: {
      ok: true,
      ran: true,
      runtimeUid: 33,
      cli: { euid: 33, user: null, sapi: 'cli', entries: 120, themes: ['tracy-base'] },
      http: { euid: 33, user: 'www-data', sapi: 'apache2handler', entries: 120, themes: ['tracy-base'] },
      binding: { ...binding },
      problems: []
    },
    routes: [{ path: '/', expected: 200, a: 200, b: 200, ok: true }],
    counts: counts.map(([name, v]) => ({ name, a: v, b: v, ok: true })),
    countErrors: [],
    styles: { axes: 4, checked: 10, perAxis: { '/|1440|light': 3, '/|1440|dark': 3, '/|390|light': 2, '/|390|dark': 2 }, mismatches: [], captureFailures: [], themes: ['light', 'dark'], viewports: '1440x900,390x844' },
    summary: { routes: 1, routesMatching: 1, routes200: 1, counts: counts.length, countsMatching: counts.length, axes: 4, styleChecks: 10, styleMismatches: 0 }
  }

  // contract-bind.json as contract-bind.mjs --pack --theme-zip writes it: bound, on this pack and theme zip, after the restore
  f.bind = {
    tool: 'contract-bind', contract: 'tracy-base/wp7/1.0.0', pluginVersion: '2.4.0', bound: true, refused: false, alreadyBound: false, error: null, problems: [],
    warnings: 3, warningCodes: { PRESENTATION_DRIFT: 3 }, entities: 12, ranAt: at(15)
  }
  f.bindOverride = {} // keys to change or, set to undefined, to drop from the evidence written
  f.bindIdentity = () => ({ pack: { manifest: hex(readFileSync(path.join(pack, 'manifest.json'))), webrootArchive: manifest.webroot.sha256, databaseArchive: manifest.database.sha256 }, themeZipSha256: hex(readFileSync(themeZip)) })

  // the checkpoint: four tiers measured at T0+35 min, a line from T0+30 to T0+40
  const evidence = path.dirname(f.ledger)
  f.line = { run: 'rolling/cp-1', kind: 'checkpoint', scope: { kind: 'full', pages: 1 }, complete: true, start: at(30), end: at(40), findings: { total: 0, unclassified: 0 }, axisErrors: 0, determinism: { errors: [] }, stages: [...TIER_IDS], tiers: {} }
  f.reports = {}
  for (const s of STAGES) {
    const dir = path.join(evidence, 'cp-1', s.id)
    mkdirSync(dir, { recursive: true })
    f.line.tiers[s.id] = { out: dir, exit: 0, findings: { total: 0, unclassified: 0 } }
    f.reports[s.id] = {
      schemaVersion: 1,
      at: at(35),
      site: 'http://b',
      identity: { contractPath: visualPath, contractHash: contractHash(visualContract), stale: [], capturedAt: at(35), artifactHash: tag(readFileSync(themeZip)) },
      scope: { kind: 'full' },
      stages: STAGES.map((x) => ({ id: x.id, status: x.id === s.id ? 'pass' : 'skipped', findings: 0 })),
      summary: { findings: 0, unclassified: 0 },
      pages: [{ id: 'home', axes: s.variants.map((v) => ({ variant: v, measured: 'now', findings: [] })) }]
    }
  }
  f.dir = (stage) => f.line.tiers[stage]?.out
  /** Write every piece of evidence from the in-memory objects; bindings recomputed unless `bind: false`. */
  f.write = ({ bind = true, bindingFor = (b) => b } = {}) => {
    writeFileSync(f.restore, JSON.stringify(f.restoreReport))
    writeFileSync(f.sweepFile, JSON.stringify(f.sweep))
    writeFileSync(f.parity, JSON.stringify(f.parityReport))
    writeFileSync(f.contractBind, JSON.stringify({ ...f.bind, ...f.bindIdentity(), ...f.bindOverride }))
    writeFileSync(f.ledger, JSON.stringify(f.line) + '\n')
    for (const [stage, rep] of Object.entries(f.reports)) {
      const dir = f.dir(stage)
      if (!dir || !existsSync(dir)) continue
      const bytes = Buffer.from(JSON.stringify(rep))
      writeFileSync(path.join(dir, 'visual.json'), bytes)
      if (bind) writeFileSync(path.join(dir, BINDING_FILE), JSON.stringify(bindingFor({ schema: BINDING_SCHEMA, stage, report: { file: 'visual.json', sha256: tag(bytes) }, measuredAt: rep.at, artifactHash: f.hashes() }, stage)))
    }
    // the finish audit of the dossier: a clean, current receipt written through the shared helper (lib/finish-audit.mjs) —
    // over the four tiers' interaction records, or (f.auditScope = 'patch') bound to the theme zip
    const routes = pages.map((p) => p.path)
    if (f.auditScope === 'patch') cleanAudit({ dossier: runRoot, site: 'http://b', source: sourceSite, routes, theme: tag(readFileSync(themeZip)) })
    else cleanAudit({ dossier: runRoot, site: 'http://b', source: sourceSite, routes, runs: Object.keys(f.reports).map((s) => f.dir(s)).filter((d) => d && existsSync(d)), pages: routes })
    f.age()
    return f
  }
  // the behaviour pass of a first release: a clean site-sweep.json of all eleven checks, on the restored site and this theme zip
  f.sweepFile = path.join(root, 'site-sweep.json')
  f.sweep = {
    schema: 'tracy-site-sweep/v1',
    tool: 'site-sweep.mjs',
    ranAt: at(40),
    site: 'http://b',
    source: sourceSite,
    only: [...ALL_CHECKS],
    routesTotal: pages.length,
    routesMeasured: pages.length,
    checks: ALL_CHECKS.map((id) => ({ id, cases: 4, defects: 0, notMeasured: 0, accepted: 0, acceptErrors: 0, pass: true })),
    accepted: [],
    owed: [],
    theme: { version: '1.0.0', zipSha256: hex(readFileSync(themeZip)) },
    sourceFingerprint: fingerprintOf({ url: `${sourceSite}/`, html: sourceHtml })
  }
  f.currentSource = { ok: true, fingerprint: f.sweep.sourceFingerprint }
  f.readSource = () => f.currentSource
  f.o = () => ({ pack, readSource: f.readSource, behaviourSweep: f.sweepFile, out: f.out, parity: f.parity, restoreReport: f.restore, runRoot, spec, themeZip, visualLedger: f.ledger, checkpoint: f.line.run, contractBind: f.contractBind, repo: 'JoomlArt-Products/joomlart-products', admin: 'tracyagent' })
  return f.write()
}

/** A source home page served by a process of its own (the release reads it synchronously, so it cannot be served from the test's own event loop). */
const startSource = (html) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', `require('http').createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(${JSON.stringify(html)}) }).listen(0, '127.0.0.1', function () { console.log(this.address().port) })`], { stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.once('data', (d) => resolve({ url: `http://127.0.0.1:${Number(d)}`, stop: () => child.kill() }))
    child.once('error', reject)
  })

const quiet = { state: { exists: false }, log: () => {} }
/** The codes of an acceptance refusal (and the message, for naming checks). */
function refusal(f, o = f.o()) {
  try {
    acceptRelease(o)
  } catch (e) {
    assert.ok(e instanceof AcceptanceError, `an AcceptanceError, got ${e.stack}`)
    return { codes: e.problems.map((p) => p.code), text: e.message }
  }
  assert.fail('the release was accepted')
}
const refuses = (f, code, pattern, o) => {
  const r = refusal(f, o)
  assert.ok(r.codes.includes(code), `expected [${code}] in:\n${r.text}`)
  if (pattern) assert.match(r.text, pattern)
  assert.ok(!existsSync(f.out), 'nothing written')
  return r
}

const countOf = (f, name) => f.parityReport.counts.find((c) => c.name === name)

test('release: a complete, fresh, clean four-tier checkpoint bound to the three artifacts assembles a release that records what it was accepted on', () => {
  const f = fixture()
  const done = runRelease(f.o(), quiet)
  const files = readdirSync(f.out).sort()
  assert.deepEqual(files, ['README.md', 'SHA256SUMS', 'VERIFICATION.json', 'manifest.json', 'release-notes.md', 'tracy-base-1.0.0.zip', 'tracy-base-wp7-database-1.0.0.sql.gz', 'tracy-base-wp7-webroot-1.0.0.tar.gz'])
  assert.deepEqual(done.files.sort(), files)
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  const h = f.hashes()
  assert.deepEqual(Object.fromEntries(Object.entries(v.acceptance.artifacts).map(([k, a]) => [k, { file: a.file, sha256: a.sha256 }])), h)
  assert.equal(v.acceptance.visual.checkpoint, 'rolling/cp-1')
  assert.deepEqual(v.acceptance.visual.tiers.map((t) => t.stage), TIER_IDS)
  for (const t of v.acceptance.visual.tiers) assert.equal(t.report, tag(readFileSync(path.join(f.dir(t.stage), 'visual.json'))))
  assert.equal(v.acceptance.runtime.runtimeUid, 33)
  assert.deepEqual(v.acceptance.runtime.parity.http, { euid: 33, user: 'www-data' })
  assert.equal(v.parity.ok, true)
  assert.equal(v.visual.contractHash, contractHash(f.visualContract))
  // SHA256SUMS covers every shipped file, and the copies are the accepted bytes
  const sums = readFileSync(path.join(f.out, 'SHA256SUMS'), 'utf8')
  for (const file of files.filter((x) => x !== 'SHA256SUMS' && x !== 'release-notes.md')) assert.ok(sums.includes(`${hex(readFileSync(path.join(f.out, file)))}  ${file}\n`), file)
  for (const [k, a] of Object.entries(h)) assert.equal(tag(readFileSync(path.join(f.out, a.file))), a.sha256, k)
  // a person's notes survive a re-run; no temporary directory is left beside the release
  writeFileSync(path.join(f.out, 'release-notes.md'), 'filled in')
  runRelease(f.o(), quiet)
  assert.equal(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), 'filled in')
  assert.deepEqual(readdirSync(f.root).filter((e) => e.includes('assembling') || e.includes('previous')), [])
})

test('release: each missing tier is refused by name, and so are unknown and duplicated tiers', () => {
  for (const stage of TIER_IDS) {
    const f = fixture()
    delete f.line.tiers[stage]
    f.line.stages = f.line.stages.filter((s) => s !== stage)
    f.write()
    refuses(f, 'tier-missing', new RegExp(`no ${stage} tier`))
  }
  const u = fixture()
  u.line.tiers['sepia-desktop'] = { out: path.join(u.root, 'x'), exit: 0 }
  refuses(u.write(), 'tier-unknown', /sepia-desktop/)
  const d = fixture()
  d.line.stages = [...TIER_IDS, TIER_IDS[0]]
  refuses(d.write(), 'tier-duplicate', /lists a tier twice/)
  const same = fixture()
  same.line.tiers['dark-responsive'] = { ...same.line.tiers['dark-desktop'] }
  refuses(same.write(), 'tier-duplicate', /name the same report directory/)
  const rel = fixture()
  rel.line.tiers['light-desktop'].out = 'cp-1/light-desktop'
  refuses(rel.write(), 'tier-report', /not an absolute path/)
})

test('release: an incomplete, interrupted, targeted, dirty, missing or ambiguous checkpoint is refused', () => {
  const cases = [
    ['checkpoint-incomplete', (l) => Object.assign(l, { complete: false, incomplete: 'no report from dark-desktop' })],
    ['checkpoint-incomplete', (l) => Object.assign(l, { interrupted: true })],
    ['checkpoint-incomplete', (l) => Object.assign(l, { failedStep: 'deploy' })],
    ['checkpoint-incomplete', (l) => Object.assign(l, { axisErrors: 2 })],
    ['checkpoint-not-full', (l) => Object.assign(l, { kind: 'recheck' })],
    ['checkpoint-not-full', (l) => Object.assign(l, { scope: { kind: 'targeted' } })],
    ['checkpoint-findings', (l) => Object.assign(l, { findings: { total: 3, unclassified: 0 } })],
    ['checkpoint-findings', (l) => Object.assign(l, { findings: undefined })]
  ]
  for (const [code, mutate] of cases) {
    const f = fixture()
    mutate(f.line)
    refuses(f.write(), code)
  }
  const missing = fixture()
  refuses(missing, 'checkpoint-missing', /no line for run "rolling\/cp-9"/, { ...missing.o(), checkpoint: 'rolling/cp-9' })
  refuses(missing, 'checkpoint-missing', /no --checkpoint/, { ...missing.o(), checkpoint: undefined })
  const twice = fixture()
  writeFileSync(twice.ledger, JSON.stringify(twice.line) + '\n' + JSON.stringify(twice.line) + '\n')
  refuses(twice, 'checkpoint-ambiguous', /2 lines for run/)
  const cut = fixture()
  writeFileSync(cut.ledger, JSON.stringify(cut.line) + '\n{"run":"x"')
  refuses(cut, 'checkpoint-unreadable', /line 2 is not JSON/)
})

test('release: a tier report that is not the full clean measurement of the canonical contract is refused', () => {
  const cases = [
    ['tier-report', /page axis\/axes not measured/, (r) => (r.pages = [])],
    ['tier-report', /not measured by this run/, (r) => (r.pages[0].axes[0].measured = 'reused')],
    ['tier-report', /scope targeted-debug, not full/, (r) => (r.scope = { kind: 'targeted-debug' })],
    ['tier-failed', /stage is fail, not pass/, (r) => (r.stages.find((s) => s.status === 'pass').status = 'fail')],
    ['tier-failed', /1 finding/, (r) => (r.summary = { findings: 1, unclassified: 0 })],
    ['tier-contract', /the canonical is sha256:/, (r) => (r.identity.contractHash = tag('another contract'))],
    ['tier-contract', /stale or unrecorded/, (r) => (r.identity.stale = ['specHash moved'])],
    ['tier-contract', /no contract identity/, (r) => delete r.identity]
  ]
  for (const [code, pattern, mutate] of cases) {
    const f = fixture()
    mutate(f.reports['dark-desktop'])
    refuses(f.write(), code, pattern)
  }
  const exit = fixture()
  exit.line.tiers['light-responsive'].exit = 1
  refuses(exit.write(), 'tier-failed', /light-responsive: visual-qa exited 1/)
  const gone = fixture()
  rmSync(path.join(gone.dir('dark-responsive'), 'visual.json'))
  refuses(gone, 'checkpoint-incomplete')
})

test('release: every tier must carry a binding to all three artifacts; each missing binding is refused', () => {
  for (const stage of TIER_IDS) {
    const f = fixture()
    rmSync(path.join(f.dir(stage), BINDING_FILE))
    refuses(f, 'binding-missing', new RegExp(`${stage}: ${BINDING_FILE}`))
  }
  for (const key of ['theme', 'webroot', 'database']) {
    const f = fixture()
    f.write({ bindingFor: (b, stage) => (stage === 'light-desktop' ? { ...b, artifactHash: { ...b.artifactHash, [key]: undefined } } : b) })
    refuses(f, 'binding-missing', new RegExp(`light-desktop: ${BINDING_FILE} records no ${key} artifactHash`))
  }
  const cases = [
    [(b) => ({ ...b, schema: 'tracy-visual-artifact-binding/v0' }), /schema is/],
    [(b) => ({ ...b, stage: 'dark-desktop' }), /is for stage/],
    [(b) => ({ ...b, report: { file: 'visual.json', sha256: tag('another report') } }), /binds report/],
    [(b) => ({ ...b, artifactHash: { ...b.artifactHash, theme: { file: '../x.zip', sha256: b.artifactHash.theme.sha256 } } }), /theme is not \{file, sha256/],
    [(b) => ({ ...b, artifactHash: { ...b.artifactHash, database: { file: b.artifactHash.database.file, sha256: 'abc' } } }), /database is not/]
  ]
  for (const [mutate, pattern] of cases) {
    const f = fixture()
    f.write({ bindingFor: (b, stage) => (stage === 'light-desktop' ? mutate(b) : b) })
    refuses(f, 'binding-invalid', pattern)
  }
  // a report edited after it was bound is not the report the binding vouches for
  const edited = fixture()
  const file = path.join(edited.dir('dark-desktop'), 'visual.json')
  writeFileSync(file, readFileSync(file, 'utf8').replace('"measured":"now"', '"measured":"now","note":1'))
  refuses(edited, 'binding-invalid', /dark-desktop: artifact-binding\.json binds report/)
})

test('release: an artifact changed after measurement is refused per artifact — the theme zip, and archives whose manifest and sums were updated to match', () => {
  const theme = fixture()
  writeFileSync(theme.themeZip, 'theme-zip-rebuilt')
  theme.age()
  const r = refuses(theme, 'artifact-mismatch', /bound to theme tracy-base-1\.0\.0\.zip/)
  assert.equal(r.text.match(/bound to theme/g).length, 4, 'every tier names the theme zip')
  const webroot = fixture()
  webroot.writePack(webrootTar({ 'repacked.txt': 'x' }), 'database-bytes')
  refuses(webroot, 'artifact-mismatch', /bound to webroot tracy-base-wp7-webroot/)
  const database = fixture()
  database.writePack(webrootTar(), 'database-redumped')
  refuses(database, 'artifact-mismatch', /bound to database tracy-base-wp7-database/)
  // an archive changed without its manifest is a pack that does not check out at all
  const raw = fixture()
  writeFileSync(path.join(raw.pack, raw.manifest.webroot.file), 'tampered')
  refuses(raw, 'pack-invalid', /SHA256SUMS mismatch/)
  // the report's own scalar artifact identity must agree with the theme binding
  const scalar = fixture()
  scalar.reports['light-desktop'].identity.artifactHash = tag('some other zip')
  refuses(scalar.write(), 'artifact-mismatch', /identity\.artifactHash/)
})

test('release: evidence measured before any bound artifact was written is stale even when the bytes match; timestamps must be valid and consistent', () => {
  for (const key of ['theme', 'webroot', 'database']) {
    const f = fixture()
    f.age(36, [key]) // written one minute after the tiers were measured, same bytes
    const r = refuses(f, 'evidence-stale', new RegExp(`before the ${key} artifact`))
    assert.ok(!r.codes.includes('artifact-mismatch'))
  }
  // a report file touched now does not make an old measurement new
  const touched = fixture()
  touched.age(36, ['theme'])
  const now = new Date()
  for (const s of TIER_IDS) utimesSync(path.join(touched.dir(s), 'visual.json'), now, now)
  refuses(touched, 'evidence-stale')
  const cases = [
    [(f) => (f.reports['light-desktop'].at = 'yesterday'), /is not an ISO-8601 timestamp/],
    [(f) => delete f.reports['light-desktop'].at, /is not an ISO-8601 timestamp/],
    [(f) => (f.reports['light-desktop'].identity.capturedAt = at(34)), /its identity at/],
    [(f) => (f.reports['light-desktop'].at = f.reports['light-desktop'].identity.capturedAt = at(45)), /outside its checkpoint/],
    [(f) => delete f.line.start, /no valid start\/end/],
    [(f) => (f.line.end = f.reports['light-desktop'].at = f.reports['light-desktop'].identity.capturedAt = iso(Date.now() + 3600_000)), /later than now/]
  ]
  for (const [mutate, pattern] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), 'timestamp-invalid', pattern)
  }
  const drift = fixture()
  drift.write({ bindingFor: (b, stage) => (stage === 'dark-responsive' ? { ...b, measuredAt: at(39) } : b) })
  refuses(drift, 'timestamp-invalid', /dark-responsive: artifact-binding\.json says measured at/)
})

test('release: a tier measured on another site, of an unnamed theme, without its capture time or before the restore finished is refused', () => {
  const cases = [
    ['tier-site', /light-desktop: measured http:\/\/build\.stand, not the restored site http:\/\/b/, (f) => (f.reports['light-desktop'].site = 'http://build.stand')],
    ['tier-site', /dark-responsive: the report records no measured site/, (f) => delete f.reports['dark-responsive'].site],
    ['binding-missing', /light-responsive: the report's identity\.artifactHash is null/, (f) => delete f.reports['light-responsive'].identity.artifactHash],
    ['binding-missing', /identity\.artifactHash is "abc"/, (f) => (f.reports['dark-desktop'].identity.artifactHash = 'abc')],
    ['timestamp-invalid', /its identity at null/, (f) => delete f.reports['dark-desktop'].identity.capturedAt],
    ['evidence-stale', /before the restore it measured finished/, (f) => Object.assign(f.restoreReport, { finishedAt: at(36) }) && Object.assign(f.parityReport, { generatedAt: at(37) })]
  ]
  for (const [code, pattern, mutate] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), code, pattern)
  }
  // the restored site is compared without a trailing slash, as restore and parity compare it
  const slash = fixture()
  for (const r of Object.values(slash.reports)) r.site = 'http://b/'
  runRelease(slash.write().o(), quiet)
  const v = JSON.parse(readFileSync(path.join(slash.out, 'VERIFICATION.json'), 'utf8'))
  assert.deepEqual(v.acceptance.visual.tiers.map((t) => t.site), TIER_IDS.map(() => 'http://b/'))
})

test('release: timestamps in the future or out of order are refused on every source of evidence', () => {
  const later = iso(Date.now() + 3600_000)
  const cases = [
    [/restore report says it finished at .*, later than now/, (f) => Object.assign(f.restoreReport, { finishedAt: later }) && Object.assign(f.parityReport, { generatedAt: later })],
    [/parity\.json says it was measured at .*, later than now/, (f) => (f.parityReport.generatedAt = later)],
    [/rolling\/cp-1 ends at .*, later than now/, (f) => (f.line.end = later)],
    [/ends at .*, before it started/, (f) => Object.assign(f.line, { start: at(40), end: at(30) })]
  ]
  for (const [pattern, mutate] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), 'timestamp-invalid', pattern)
  }
})

test('release: malformed ledger lines, tier reports, restore reports, parity.json and contracts are named refusals, never a TypeError', () => {
  const cases = [
    ['checkpoint-invalid', /tiers is not an object of tier records/, (f) => (f.line.tiers['dark-desktop'] = null)],
    ['checkpoint-invalid', /tiers is not an object of tier records/, (f) => (f.line.tiers = ['x'])],
    ['checkpoint-invalid', /stages is not a list of tier ids/, (f) => (f.line.stages = 'light-desktop')],
    ['checkpoint-invalid', /findings is not an object/, (f) => (f.line.findings = 0)],
    ['checkpoint-invalid', /determinism\.errors is not a list/, (f) => (f.line.determinism = { errors: 'none' })],
    ['tier-report', /light-desktop: visual\.json is malformed — stages is not a list of objects/, (f) => (f.reports['light-desktop'].stages = { id: 'light-desktop' })],
    ['tier-report', /pages is not a list of objects/, (f) => (f.reports['light-desktop'].pages = [null])],
    ['tier-report', /page home axes is not a list of objects/, (f) => (f.reports['light-desktop'].pages[0].axes = 'all')],
    ['tier-report', /findings is not a list of objects/, (f) => (f.reports['light-desktop'].pages[0].axes[0].findings = 'none')],
    ['tier-report', /containers\.rows is not a list/, (f) => (f.reports['light-desktop'].pages[0].axes[0].containers = { key: 'k', rows: 3 })],
    ['tier-report', /summary is not an object/, (f) => (f.reports['light-desktop'].summary = null)],
    ['tier-report', /summary\.stale is not a list of strings/, (f) => (f.reports['light-desktop'].summary.stale = 'yes')],
    ['tier-report', /identity is not an object/, (f) => (f.reports['light-desktop'].identity = 'v')],
    ['restore-invalid', /access\.afterRestore is not \{ok, problems/, (f) => (f.restoreReport.access.afterRestore = { ok: false, problems: 'unreadable' })],
    ['restore-invalid', /access is not an object/, (f) => (f.restoreReport.access = [])],
    ['restore-invalid', /identity is not an object/, (f) => (f.restoreReport.identity = 33)],
    ['parity-invalid', /access is not \{ran, ok, problems/, (f) => (f.parityReport.access.problems = 'none')],
    ['parity-invalid', /access\.cli is not an object/, (f) => (f.parityReport.access.cli = 33)],
    ['parity-invalid', /summary is not an object/, (f) => delete f.parityReport.summary],
    ['parity-invalid', /routes is not a list/, (f) => (f.parityReport.routes = {})],
    ['parity-invalid', /styles\.themes is not a list of names/, (f) => (f.parityReport.styles.themes = 'light')],
    ['parity-invalid', /b \(the restored site\) null is not an http\(s\) URL/, (f) => delete f.parityReport.b],
    ['parity-invalid', /a \(the build stand\) "build" is not an http\(s\) URL/, (f) => (f.parityReport.a = 'build')],
    ['restore-invalid', /binding\.siteUrl "stand" is not an http\(s\) URL/, (f) => (f.restoreReport.binding.siteUrl = 'stand')],
    ['tier-report', /page home 1440-light coverage is not \{unclassified/, (f) => (f.reports['light-desktop'].pages[0].axes[0].coverage = { unclassified: 'none' })],
    ['tier-report', /page home findings is not a list of objects/, (f) => (f.reports['light-desktop'].pages[0].findings = [1])]
  ]
  for (const [code, pattern, mutate] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), code, pattern)
  }
  // a ledger line that is not an object is not the run
  const scalar = fixture()
  writeFileSync(scalar.ledger, '42\n"rolling/cp-1"\n' + JSON.stringify(scalar.line) + '\n')
  assert.ok(acceptRelease(scalar.o()))
  // contracts bound to the spec-pack but not of the structure their gates require
  const design = fixture()
  const d = JSON.parse(readFileSync(path.join(design.runRoot, CANONICAL.design), 'utf8'))
  delete d.rules
  writeFileSync(path.join(design.runRoot, CANONICAL.design), JSON.stringify(d))
  refuses(design, 'contract-invalid', /design-contract\.json is not a valid design contract: Design rules are required/)
  const visual = fixture()
  writeFileSync(visual.visualPath, JSON.stringify({ ...visual.visualContract, pages: 'home', layouts: [] }))
  refuses(visual, 'contract-invalid', /visual\.contract\.json is not a valid visual contract/)
  // a shape the gate itself does not foresee (it throws) is the same named refusal
  const stages = fixture()
  writeFileSync(stages.visualPath, JSON.stringify({ ...stages.visualContract, visual: { stages: { 'light-desktop': {} } } }))
  refuses(stages, 'contract-invalid', /visual\.contract\.json is not a valid visual contract/)
  // a site that is not a URL on both sides does not make the two agree
  const site = fixture()
  site.parityReport.b = 'stand'
  for (const r of Object.values(site.reports)) r.site = 'stand'
  const siteRefusal = refuses(site.write(), 'parity-invalid', /b \(the restored site\) "stand" is not an http\(s\) URL/)
  assert.ok(siteRefusal.codes.includes('tier-site'), siteRefusal.text)
  assert.match(siteRefusal.text, /no measured site URL \("stand"\)/)
  // manifest fields the release reads (title, README, notes) are held before anything is written
  for (const [mutate, pattern] of [
    [(m) => (m.id = 'abc'), /id "abc" is not <product>\/<cms>/],
    [(m) => (m.id = 'tracy--base/wp7'), /id "tracy--base\/wp7" is not/],
    [(m) => (m.phpVersion = 8.3), /phpVersion 8\.3 is not a non-empty string/],
    [(m) => (m.theme.version = null), /theme\.version is not a non-empty string/],
    [(m) => (m.placeholderUrl = 'placeholder'), /placeholderUrl "placeholder" is not an http\(s\) URL/]
  ]) {
    const m = fixture()
    mutate(m.manifest)
    const text = m.writePack()
    const sha = hex(Buffer.from(text))
    m.restoreReport.binding.manifest = sha
    m.parityReport.access.binding.manifest = sha
    refuses(m.write(), 'pack-invalid', pattern)
  }
})

test('release: a tier is clean by what its pages carry — a finding, an unrecorded unclassified element or an acceptance the contract does not make under totals of 0 is refused', () => {
  const cases = [
    [/pages carry 1 finding\(s\), 0 unclassified/, (r) => r.pages[0].axes[0].findings.push({ kind: 'parity', element: 'h1' })],
    [/pages carry 1 finding\(s\), 1 unclassified/, (r) => r.pages[0].axes[0].findings.push({ kind: 'unclassified-element', element: 'p.x' })],
    [/1 unclassified coverage element\(s\) neither a finding nor an accepted exception \(home /, (r) => (r.pages[0].axes[0].coverage = { examined: 3, classified: [], unclassified: ['p.x'] })],
    [/1 accepted entry the canonical contract's exceptions do not accept/, (r) => (r.pages[0].axes[0].accepted = [{ kind: 'parity', element: 'h1' }])],
    // a reason written into the report is not an exception: the contract declares none
    [/1 accepted entry the canonical contract's exceptions do not accept \(home 1440-dark parity\)/, (r) => (r.pages[0].axes[0].accepted = [{ kind: 'parity', element: 'h1', exception: { reason: 'looks fine', decision: 'D-1' } }])],
    [/page findings disagree with their axes: home \(1 listed, 0 on its axes\)/, (r) => (r.pages[0].findings = [{ kind: 'parity' }])]
  ]
  for (const [pattern, mutate] of cases) {
    const f = fixture()
    mutate(f.reports['dark-desktop'])
    refuses(f.write(), 'tier-findings', pattern)
  }
  // an accepted unclassified element is not a defect when the contract's exception accepts it —
  // same kind, a match on the finding, and the reason and decision the contract records
  const decorative = { kind: 'unclassified-element', match: 'p\\.x', reason: 'decorative', decision: 'DECISIONS.md D-1' }
  const withAccepted = (exceptions, cited = { reason: 'decorative', decision: 'DECISIONS.md D-1' }, element = 'p.x') => {
    const f = fixture({ exceptions })
    const axis = f.reports['dark-desktop'].pages[0].axes[0]
    axis.coverage = { examined: 3, classified: [], unclassified: [element] }
    axis.accepted = [{ kind: 'unclassified-element', element, exception: cited }]
    return f.write()
  }
  assert.ok(acceptRelease(withAccepted([decorative]).o()))
  const notAccepted = /1 accepted entry the canonical contract's exceptions do not accept \(home 1440-dark unclassified-element\)/
  for (const f of [
    withAccepted(null), // the contract has no exception
    withAccepted([{ ...decorative, kind: 'parity' }]), // an exception of another kind
    withAccepted([{ ...decorative, match: 'p\\.y' }]), // one that does not match this finding
    withAccepted([decorative], { reason: 'looks fine', decision: 'DECISIONS.md D-1' }), // another reason
    withAccepted([decorative], { reason: 'decorative', decision: 'D-99' }), // another decision
    withAccepted([decorative], { reason: 'decorative' }) // no decision cited
  ])
    refuses(f, 'tier-findings', notAccepted)
  // every total must give the count the pages carry: the summary, the stage row, the ledger entry
  const totals = [
    [/the report's dark-desktop stage row says 2 finding/, (f) => (f.reports['dark-desktop'].stages.find((s) => s.id === 'dark-desktop').findings = 2)],
    [/the report's dark-desktop stage row says null finding/, (f) => delete f.reports['dark-desktop'].stages.find((s) => s.id === 'dark-desktop').findings],
    [/the ledger tier entry says null finding/, (f) => delete f.line.tiers['dark-desktop'].findings],
    [/the ledger tier entry says 0 finding\(s\), 3 unclassified/, (f) => (f.line.tiers['dark-desktop'].findings.unclassified = 3)],
    [/the ledger tier entry records 2 axis error/, (f) => (f.line.tiers['dark-desktop'].axisErrors = 2)]
  ]
  for (const [pattern, mutate] of totals) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), 'tier-findings', pattern)
  }
})

test('release: a theme zip or pack archive named as a file the release writes, or as another asset, is refused before anything is read into the release', () => {
  for (const name of ['manifest.json', 'SHA256SUMS', 'README.md', 'VERIFICATION.json', 'release-notes.md']) {
    const f = fixture()
    const zip = path.join(f.root, 'zips', name)
    mkdirSync(path.dirname(zip), { recursive: true })
    writeFileSync(zip, readFileSync(f.themeZip))
    refuses(f, 'unsafe-file', /a name the release writes itself/, { ...f.o(), themeZip: zip })
  }
  const clash = fixture()
  const zip = path.join(clash.root, 'zips', clash.manifest.webroot.file)
  mkdirSync(path.dirname(zip), { recursive: true })
  writeFileSync(zip, readFileSync(clash.themeZip))
  refuses(clash, 'unsafe-file', /the name of a pack archive/, { ...clash.o(), themeZip: zip })
  const asset = fixture()
  const twin = path.join(asset.root, 'other', path.basename(asset.themeZip))
  mkdirSync(path.dirname(twin), { recursive: true })
  writeFileSync(twin, 'another zip')
  refuses(asset, 'unsafe-file', /a second asset with this name/, { ...asset.o(), asset: [twin] })
  const pack = fixture()
  rmSync(path.join(pack.pack, pack.manifest.database.file))
  pack.manifest.database.file = 'README.md'
  pack.writePack()
  refuses(pack, 'pack-invalid')
})

test('release: a missing, failed, stale or mismatched restore / parity, or probes not run as the runtime user, are refused', () => {
  const cases = [
    ['restore-failed', (f) => Object.assign(f.restoreReport, { ok: false, error: 'the restored webroot is not usable' })],
    ['runtime-access', (f) => (f.restoreReport.access.afterRestore = { ok: false, problems: ['wp-cli: runtime path wp-config.php (wp-config.php) is not readable'] })],
    ['runtime-access', (f) => delete f.restoreReport.access.beforeBootstrap],
    ['runtime-access', (f) => (f.restoreReport.identity.euid = 0)],
    ['runtime-access', (f) => (f.restoreReport.runtimeUid = 0)],
    ['parity-failed', (f) => (f.parityReport.ok = false)],
    ['runtime-access', (f) => (f.parityReport.access.ran = false)],
    ['runtime-access', (f) => (f.parityReport.access.problems = ['http: runtime path wp-content/uploads (uploads) is not readable'])],
    ['runtime-access', (f) => (f.parityReport.access.cli.euid = 0)],
    ['runtime-access', (f) => delete f.parityReport.access.http],
    // what verify-parity writes for a wp-cli probe run as root: no cli record, the reason in problems
    ['runtime-access', (f) => Object.assign(f.parityReport.access, { ok: false, cli: null, problems: ['wp-cli runs as root — the fleet runs PHP and wp-cli as www-data, so a root probe proves nothing'] })],
    ['runtime-access', (f) => (f.parityReport.access.http = null)],
    ['runtime-access', (f) => (f.parityReport.access.runtimeUid = 1001)],
    ['restore-mismatch', (f) => (f.restoreReport.binding.siteUrl = 'http://elsewhere')],
    ['restore-mismatch', (f) => (f.restoreReport.binding.webrootArchive = hex('an older pack'))],
    ['restore-mismatch', (f) => delete f.restoreReport.binding],
    ['restore-mismatch', (f) => (f.parityReport.access.binding.databaseArchive = hex('an older dump'))],
    ['restore-mismatch', (f) => (f.parityReport.b = 'http://c')],
    ['evidence-stale', (f) => (f.parityReport.generatedAt = at(5))],
    ['evidence-stale', (f) => (f.restoreReport.finishedAt = iso(T0 - 60_000))],
    ['timestamp-invalid', (f) => (f.restoreReport.finishedAt = 'x')]
  ]
  for (const [code, mutate] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), code)
  }
  const none = fixture()
  refuses(none, 'restore-missing', /no --restore-report/, { ...none.o(), restoreReport: undefined })
  rmSync(none.parity)
  refuses(none, 'parity-missing', /--parity: .*cannot be read/)
})

test('release: a restore report or parity.json that contradicts itself is refused — the verdict is recomputed from its rows, never read from ok or the totals', () => {
  const cases = [
    // restore: ok beside the problems it names
    ['runtime-access', /afterRestore access check says ok and names 1 problem\(s\): theme unreadable/, (f) => (f.restoreReport.access.afterRestore = { ok: true, problems: ['theme unreadable'] })],
    ['runtime-access', /beforeBootstrap access check says ok and names 1 problem/, (f) => (f.restoreReport.access.beforeBootstrap.problems = ['uploads not listable'])],
    ['restore-invalid', /access\.afterRestore is not \{ok, problems: \[text\]\}/, (f) => delete f.restoreReport.access.afterRestore.problems],
    ['restore-invalid', /access\.afterRestore is not/, (f) => (f.restoreReport.access.afterRestore.ok = 'yes')],
    ['restore-failed', /says ok and also records an error: tar exited 2/, (f) => (f.restoreReport.error = 'tar exited 2')],
    // parity: ok true over rows that do not match, rows whose ok lies, totals that are not the rows
    ['parity-failed', /routes \/about: 200 vs 404/, (f) => (f.parityReport.routes.push({ path: '/about', expected: 200, a: 200, b: 404, ok: false }), (f.parityReport.summary.routes = 2))],
    ['parity-failed', /routes \/ says ok true for 200 vs 500/, (f) => (f.parityReport.routes[0].b = 500)],
    ['parity-failed', /routes \/ says ok false for 200 vs 200/, (f) => (f.parityReport.routes[0].ok = false)],
    ['parity-failed', /routes \/ says ok true for 200 vs "error: fetch failed"/, (f) => (f.parityReport.routes[0].b = 'error: fetch failed')],
    ['parity-failed', /counts post:post says ok true for 1 vs 11/, (f) => (countOf(f, 'post:post').b = 11)],
    ['parity-failed', /counts post:post: null vs 1/, (f) => Object.assign(countOf(f, 'post:post'), { a: null, ok: false })],
    ['parity-failed', /1 computed-style mismatch/, (f) => f.parityReport.styles.mismatches.push({ axis: '/|1440|light', selector: 'h1', property: 'color', a: '#000', b: '#111' })],
    ['parity-failed', /1 style capture failure/, (f) => f.parityReport.styles.captureFailures.push({ route: '/', error: 'timeout' })],
    ['parity-failed', /1 count error/, (f) => f.parityReport.countErrors.push({ side: 'b', error: 'wp-cli failed' })],
    ['parity-failed', /summary\.routesMatching says 0, the rows give 1/, (f) => (f.parityReport.summary.routesMatching = 0)],
    ['parity-failed', /summary\.styleMismatches says 3, the rows give 0/, (f) => (f.parityReport.summary.styleMismatches = 3)],
    ['parity-failed', /the front page \/ was not compared/, (f) => Object.assign(f.parityReport, { routes: [{ path: '/about', expected: 200, a: 200, b: 200, ok: true }] })],
    ['parity-failed', /access says ok true with 1 problem/, (f) => (f.parityReport.access.problems = ['http: uploads not listable'])],
    // rows that are not what verify-parity writes are named, never read
    ['parity-invalid', /routes\[0\] is not \{path, a, b, ok\}/, (f) => (f.parityReport.routes[0].ok = 'yes')],
    ['parity-invalid', /routes\[0\] \(\/\) records no declared status it was held to \(expected null\)/, (f) => delete f.parityReport.routes[0].expected],
    ['parity-invalid', /routes\[0\] \(\/\) records no declared status it was held to \(expected 204\)/, (f) => (f.parityReport.routes[0].expected = 204)],
    ['parity-invalid', /counts\[0\] is not \{name, a, b, ok\}/, (f) => (f.parityReport.counts[0] = null)],
    ['parity-invalid', /counts\[6\] is not \{name, a, b, ok\}/, (f) => (countOf(f, 'option:show_on_front').b = { value: 'page' })],
    ['parity-failed', /counts option:show_on_front says ok true for "page" vs "posts"/, (f) => (countOf(f, 'option:show_on_front').b = 'posts')],
    ['parity-invalid', /countErrors is not a list/, (f) => delete f.parityReport.countErrors],
    ['parity-invalid', /styles\.captureFailures is not a list/, (f) => delete f.parityReport.styles.captureFailures],
    ['parity-invalid', /summary\.styleChecks is not a count/, (f) => (f.parityReport.summary.styleChecks = '10')],
    ['parity-invalid', /access is not \{ran, ok, problems/, (f) => delete f.parityReport.access.problems]
  ]
  for (const [code, pattern, mutate] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), code, pattern)
  }
})

test('release: parity that agrees without measuring — an HTTP error or 404 on both stands, counts or styles skipped — is refused', () => {
  const route = (f, path, a, b) => {
    f.parityReport.routes.push({ path, expected: 200, a, b, ok: true })
    Object.assign(f.parityReport.summary, { routes: 2, routesMatching: 2 })
    Object.assign(f.parityReport.styles, { axes: 8, checked: 20 })
    Object.assign(f.parityReport.styles.perAxis, { [`${path}|1440|light`]: 3, [`${path}|1440|dark`]: 3, [`${path}|390|light`]: 2, [`${path}|390|dark`]: 2 })
    f.parityReport.summary.axes = 8
    f.parityReport.summary.styleChecks = 20
  }
  const cases = [
    // two stands failing the same way match, and prove nothing
    ['parity-failed', /route \/ answered "error: timeout" on the build stand and "error: timeout" on the restored one, not its declared 200 on both/, (f) => Object.assign(f.parityReport.routes[0], { a: 'error: timeout', b: 'error: timeout' }) && (f.parityReport.summary.routes200 = 0)],
    ['parity-failed', /route \/ answered 404 on the build stand and 404 on the restored one/, (f) => Object.assign(f.parityReport.routes[0], { a: 404, b: 404 }) && (f.parityReport.summary.routes200 = 0)],
    ['parity-failed', /route \/about answered 301 on the build stand and 301 on the restored one/, (f) => route(f, '/about', 301, 301)],
    // counts: none (no --wp-a/--wp-b), one missing, a post count that is text
    ['parity-incomplete', /count post:post was not measured[\s\S]*count option:stylesheet was not measured/, (f) => Object.assign(f.parityReport, { counts: [] }) && Object.assign(f.parityReport.summary, { counts: 0, countsMatching: 0 })],
    ['parity-incomplete', /count term:category was not measured/, (f) => (f.parityReport.counts = f.parityReport.counts.filter((c) => c.name !== 'term:category')) && Object.assign(f.parityReport.summary, { counts: f.parityReport.counts.length, countsMatching: f.parityReport.counts.length })],
    ['parity-failed', /count post:page is "2" vs "2", not a number on both/, (f) => Object.assign(countOf(f, 'post:page'), { a: '2', b: '2' })],
    // styles: --skip-styles, a theme or a viewport not measured, an axis short, axes with no checks
    ['parity-incomplete', /styles cover 0 axes, not the 1 page route\(s\) × 2 viewport\(s\) × 2 theme\(s\) = 4 measured/, (f) => Object.assign(f.parityReport.styles, { axes: 0, checked: 0 }) && Object.assign(f.parityReport.summary, { axes: 0, styleChecks: 0 })],
    ['parity-incomplete', /styles were not measured on the dark theme/, (f) => Object.assign(f.parityReport.styles, { themes: ['light'], axes: 2 }) && (f.parityReport.summary.axes = 2)],
    ['parity-incomplete', /styles\.viewports "wide" names no WxH viewports/, (f) => (f.parityReport.styles.viewports = 'wide')],
    ['parity-incomplete', /styles\.viewports null names no WxH viewports/, (f) => delete f.parityReport.styles.viewports],
    ['parity-incomplete', /styles cover 3 axes, not the 1 page route\(s\) × 2 viewport\(s\) × 2 theme\(s\) = 4/, (f) => (f.parityReport.styles.axes = 3) && (f.parityReport.summary.axes = 3)],
    ['parity-incomplete', /styles\.perAxis adds up to 10 checks, styles\.checked says 2/, (f) => (f.parityReport.styles.checked = 2) && (f.parityReport.summary.styleChecks = 2)],
    // per axis: one axis with 0 checks while the others carry the total over the axis count
    ['parity-incomplete', /styles axis \/\|390\|dark made 0 checks — it compared nothing/, (f) => Object.assign(f.parityReport.styles.perAxis, { '/|1440|light': 5, '/|390|dark': 0 })],
    ['parity-incomplete', /styles axis \/\|390\|dark was not compared[\s\S]*styles axis \/\|390\|sepia is not a route × viewport × theme/, (f) => {
      const per = f.parityReport.styles.perAxis
      per['/|390|sepia'] = per['/|390|dark']
      delete per['/|390|dark']
      return true
    }],
    ['parity-incomplete', /styles\.perAxis names 3 axes, styles\.axes says 4/, (f) => (delete f.parityReport.styles.perAxis['/|390|dark']) && (f.parityReport.styles.perAxis['/|390|light'] = 4)],
    ['parity-incomplete', /a style mismatch on axis "light-desktop" is not an axis perAxis records/, (f) => f.parityReport.styles.mismatches.push({ axis: 'light-desktop', selector: 'h1', property: 'color', a: '#000', b: '#111' })],
    ['parity-invalid', /styles\.perAxis is not a count per axis/, (f) => delete f.parityReport.styles.perAxis],
    ['parity-invalid', /styles\.perAxis is not a count per axis/, (f) => (f.parityReport.styles.perAxis['/|1440|light'] = '3')]
  ]
  for (const [code, pattern, mutate] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), code, pattern)
  }
  // a second route, 200 on both, measured on every axis: accepted
  const two = fixture()
  route(two, '/about', 200, 200)
  two.parityReport.summary.routes200 = 2
  runRelease(two.write().o(), quiet)
  assert.ok(existsSync(path.join(two.out, 'VERIFICATION.json')))
})

// ---------------------------------------------------------------- declared route statuses (#60)
const ERROR_PAGE = { id: 'error', path: '/404', view: '404', synthetic: true }
/** Add `path` to parity.json as verify-parity writes it: held to `expected`, measured on every axis when it draws a page. */
function parityRoute(f, { path: p, expected, a = expected, b = a, axes = true }) {
  const matches = a === b && a === expected
  f.parityReport.routes.push({ path: p, expected, a, b, ok: matches })
  const s = f.parityReport.summary
  Object.assign(s, { routes: s.routes + 1, routesMatching: s.routesMatching + (matches ? 1 : 0), routes200: s.routes200 + (a === 200 && b === 200 ? 1 : 0) })
  if (!axes) return f
  for (const k of [`${p}|1440|light`, `${p}|1440|dark`, `${p}|390|light`, `${p}|390|dark`]) f.parityReport.styles.perAxis[k] = 2
  Object.assign(f.parityReport.styles, { axes: f.parityReport.styles.axes + 4, checked: f.parityReport.styles.checked + 8 })
  Object.assign(s, { axes: s.axes + 4, styleChecks: s.styleChecks + 8 })
  return f
}

test('release (#60): a page map\'s /404 (view 404) answering 404 on both stands, measured light and dark, is released', () => {
  const f = fixture({ pages: [{ id: 'home', path: '/' }, ERROR_PAGE] })
  parityRoute(f, { path: '/404', expected: 404 })
  runRelease(f.write().o(), quiet)
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.deepEqual(v.parity.routes.table.map((r) => [r.path, r.expected, r.a, r.b, r.ok]), [['/', 200, 200, 200, true], ['/404', 404, 404, 404, true]])
  assert.match(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), /2\/2 routes answer their declared status on both stands \(1 of them 200\)/)
})

test('release (#60): a route is held to the status the spec-pack declares — a wrong answer, a forged expectation or a declaration it cannot read is refused', () => {
  const cases = [
    // the declared 404 page answering 200 (or another error) on both stands is not the declaration
    ['parity-failed', /route \/404 answered 200 on the build stand and 200 on the restored one, not its declared 404 on both/, { pages: [{ id: 'home', path: '/' }, ERROR_PAGE] }, (f) => parityRoute(f, { path: '/404', expected: 404, a: 200 })],
    ['parity-failed', /routes \/404: 500 vs 500 \(declared 404\)/, { pages: [{ id: 'home', path: '/' }, ERROR_PAGE] }, (f) => parityRoute(f, { path: '/404', expected: 404, a: 500 })],
    ['parity-failed', /route \/404 answered 404 on the build stand and 200 on the restored one/, { pages: [{ id: 'home', path: '/' }, ERROR_PAGE] }, (f) => parityRoute(f, { path: '/404', expected: 404, b: 200 })],
    // an expectation written into parity.json that the spec-pack does not declare
    ['parity-expectation', /route \/missing was held to status 404, the spec-pack declares 200/, {}, (f) => parityRoute(f, { path: '/missing', expected: 404 })],
    ['parity-expectation', /route \/ was held to status 500, the spec-pack declares 200/, {}, (f) => Object.assign(f.parityReport.routes[0], { expected: 500, a: 500, b: 500 }) && (f.parityReport.summary.routes200 = 0)],
    ['parity-expectation', /route \/404 was held to status 200, the spec-pack declares 404/, { pages: [{ id: 'home', path: '/' }, ERROR_PAGE] }, (f) => parityRoute(f, { path: '/404', expected: 200 })],
    // the declaration itself: conflicting or not a route status
    ['parity-expectation', /route declarations cannot be read: .*\/404 is declared twice, answering 404 and 200/, { pages: [{ id: 'home', path: '/' }, ERROR_PAGE, { path: '/404' }] }, (f) => parityRoute(f, { path: '/404', expected: 404 })],
    ['parity-expectation', /route declarations cannot be read: .*\/soon declares status "later"/, { pages: [{ id: 'home', path: '/' }, { path: '/soon', status: 'later' }] }, () => true],
    // a declared route parity never compared: a run over / alone does not stand in for it
    ['parity-incomplete', /route \/404, which the spec-pack's page map declares, was not compared/, { pages: [{ id: 'home', path: '/' }, ERROR_PAGE] }, () => true],
    ['parity-incomplete', /route \/old, which the spec-pack's page map declares, was not compared/, { pages: [{ id: 'home', path: '/' }, { path: '/old', status: 301 }] }, () => true],
    ['parity-incomplete', /route \/about, which the spec-pack's page map declares, was not compared/, { pages: [{ id: 'home', path: '/' }, { path: '/about' }] }, () => true],
    // a declared page answering as declared still owes every style axis
    ['parity-incomplete', /styles axis \/404\|1440\|light was not compared/, { pages: [{ id: 'home', path: '/' }, ERROR_PAGE] }, (f) => parityRoute(f, { path: '/404', expected: 404, axes: false })]
  ]
  for (const [code, pattern, opts, mutate] of cases) {
    const f = fixture(opts)
    mutate(f)
    refuses(f.write(), code, pattern)
  }
  const unreadable = fixture()
  rmSync(path.join(unreadable.spec, 'page-map.json'))
  const r = refusal(unreadable)
  assert.ok(r.codes.includes('parity-expectation'), r.text)
  assert.match(r.text, /route declarations cannot be read: .*page-map\.json cannot be read \(ENOENT\)/)
})

test('release (#60): a declared redirect is held to its status and draws no style axes; the pages beside it still owe theirs', () => {
  const f = fixture({ pages: [{ id: 'home', path: '/' }, { path: '/old', status: 301 }] })
  parityRoute(f, { path: '/old', expected: 301, axes: false })
  runRelease(f.write().o(), quiet)
  assert.ok(existsSync(path.join(f.out, 'VERIFICATION.json')))
  const moved = fixture({ pages: [{ id: 'home', path: '/' }, { path: '/old', status: 301 }] })
  parityRoute(moved, { path: '/old', expected: 301, a: 200, axes: false })
  refuses(moved.write(), 'parity-failed', /route \/old answered 200 on the build stand and 200 on the restored one, not its declared 301 on both/)
  const skipped = fixture({ pages: [{ id: 'home', path: '/' }, { path: '/old', status: 301 }] })
  parityRoute(skipped, { path: '/old', expected: 301, axes: false })
  Object.assign(skipped.parityReport.styles, { axes: 0, checked: 0, perAxis: {} })
  Object.assign(skipped.parityReport.summary, { axes: 0, styleChecks: 0 })
  refuses(skipped.write(), 'parity-incomplete', /styles cover 0 axes, not the 1 page route\(s\) × 2 viewport\(s\) × 2 theme\(s\) = 4 measured/)
})

// ---------------------------------------------------------------- bindings written at measurement (#59)
test('release (#59): the bindings round.mjs writes when each tier is measured are accepted as they are — no hand-written binder', () => {
  // the fixture's hand-written bindings removed: only what round.mjs writes is read
  const unbound = () => {
    const x = fixture()
    for (const stage of TIER_IDS) rmSync(path.join(x.dir(stage), BINDING_FILE))
    return x.write({ bind: false })
  }
  const f = unbound()
  const cfg = { pack: f.pack, artifact: f.themeZip }
  const before = packArtifacts(cfg)
  for (const stage of TIER_IDS) {
    const bytes = readFileSync(path.join(f.dir(stage), 'visual.json'))
    writeBinding(f.dir(stage), bindingFor({ stage, bytes, report: JSON.parse(bytes), before, after: packArtifacts(cfg) }))
  }
  runRelease(f.o(), quiet)
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.deepEqual(v.acceptance.visual.tiers.map((t) => t.stage), TIER_IDS)

  // a report changed after it was bound, or an artifact rebuilt after the measurement, is refused
  const edited = unbound()
  const at = packArtifacts({ pack: edited.pack, artifact: edited.themeZip })
  for (const stage of TIER_IDS) {
    const bytes = readFileSync(path.join(edited.dir(stage), 'visual.json'))
    writeBinding(edited.dir(stage), bindingFor({ stage, bytes, report: JSON.parse(bytes), before: at, after: at }))
  }
  writeFileSync(path.join(edited.dir('dark-desktop'), 'visual.json'), JSON.stringify({ ...edited.reports['dark-desktop'], note: 'edited' }))
  refuses(edited, 'binding-invalid', /dark-desktop: artifact-binding\.json binds report/)
  const rebuilt = unbound()
  const was = packArtifacts({ pack: rebuilt.pack, artifact: rebuilt.themeZip })
  for (const stage of TIER_IDS) {
    const bytes = readFileSync(path.join(rebuilt.dir(stage), 'visual.json'))
    writeBinding(rebuilt.dir(stage), bindingFor({ stage, bytes, report: JSON.parse(bytes), before: was, after: was }))
  }
  rebuilt.writePack(webrootTar({ 'rebuilt.txt': 'x' }))
  refuses(rebuilt, 'artifact-mismatch', /bound to webroot .*, the release's webroot is/)
})

test('release: a probe record whose identity is not the pass verify-parity grants is refused, whatever its ok says', () => {
  const cases = [
    // evaluateAccess holds the HTTP probe to the user www-data, not only its uid
    [/the http probe ran as user "root", not www-data/, (f) => (f.parityReport.access.http.user = 'root')],
    [/the http probe ran as user null, not www-data/, (f) => (f.parityReport.access.http.user = null)],
    [/the http probe ran under SAPI "cli", not a web server's/, (f) => (f.parityReport.access.http.sapi = 'cli')],
    [/the http probe ran under SAPI null/, (f) => delete f.parityReport.access.http.sapi],
    [/the cli probe ran under SAPI "apache2handler", not cli/, (f) => (f.parityReport.access.cli.sapi = 'apache2handler')],
    [/the cli probe's user 0 is not a name/, (f) => (f.parityReport.access.cli.user = 0)],
    // a probe that walked nothing, or did not check the manifest's theme
    [/the http probe walked 0 entries/, (f) => (f.parityReport.access.http.entries = 0)],
    [/the cli probe walked null entries/, (f) => delete f.parityReport.access.cli.entries],
    [/the cli probe checked themes \["other"\], not the manifest's tracy-base/, (f) => (f.parityReport.access.cli.themes = ['other'])],
    [/the http probe records no list of the themes it checked/, (f) => delete f.parityReport.access.http.themes],
    [/the restore's afterRestore check checked themes \[\], not the manifest's tracy-base/, (f) => (f.restoreReport.access.afterRestore.themes = [])],
    [/the restore's afterRestore check walked null entries/, (f) => delete f.restoreReport.access.afterRestore.entries]
  ]
  for (const [pattern, mutate] of cases) {
    const f = fixture()
    mutate(f)
    refuses(f.write(), 'runtime-access', pattern)
  }
})

test('release: stale or unbound contracts are refused before any evidence is trusted', () => {
  const stale = fixture()
  writeFileSync(path.join(stale.spec, 'content.json'), '{"moved":1}')
  refuses(stale, 'contract-stale', /design-contract\.json is stale — specHash/)
  const unbound = fixture()
  writeFileSync(path.join(unbound.runRoot, CANONICAL.design), JSON.stringify({ schemaVersion: 1, id: 'd' }))
  refuses(unbound, 'contract-unbound', /records no specHash binding/)
  refuses(unbound, 'spec-missing', null, { ...unbound.o(), spec: undefined })
})

test('release: symlinks and FIFOs where regular files are required are refused without blocking', () => {
  const link = fixture()
  const file = path.join(link.dir('light-desktop'), 'visual.json')
  const real = path.join(link.root, 'elsewhere.json')
  writeFileSync(real, readFileSync(file))
  rmSync(file)
  symlinkSync(real, file)
  refuses(link, 'tier-report', /is a symlink/)
  const fifo = fixture()
  const b = path.join(fifo.dir('dark-desktop'), BINDING_FILE)
  rmSync(b)
  assert.equal(spawnSync('mkfifo', [b]).status, 0)
  refuses(fifo, 'binding-invalid', /not a regular file/)
  const zip = fixture()
  const target = path.join(zip.root, 'real.zip')
  writeFileSync(target, readFileSync(zip.themeZip))
  rmSync(zip.themeZip)
  symlinkSync(target, zip.themeZip)
  refuses(zip, 'theme-zip-invalid', /is a symlink/)
  // what readPack, specHash and identityOf read with readFileSync is checked before they read it
  const fifoAt = (file) => {
    rmSync(file)
    assert.equal(spawnSync('mkfifo', [file]).status, 0)
  }
  const sums = fixture()
  fifoAt(path.join(sums.pack, 'SHA256SUMS'))
  refuses(sums, 'pack-invalid', /SHA256SUMS is not a regular file/)
  const archive = fixture()
  fifoAt(path.join(archive.pack, archive.manifest.database.file))
  refuses(archive, 'pack-invalid', /sql\.gz is not a regular file/)
  const manifest = fixture()
  fifoAt(path.join(manifest.pack, 'manifest.json'))
  refuses(manifest, 'pack-invalid', /manifest\.json is not a regular file/)
  const spec = fixture()
  fifoAt(path.join(spec.spec, 'content.json'))
  refuses(spec, 'spec-unreadable', /content\.json is not a regular file/)
  const ref = fixture()
  writeFileSync(path.join(ref.root, 'reference.json'), '{}')
  symlinkSync(path.join(ref.root, 'reference.json'), path.join(ref.spec, 'reference.json'))
  refuses(ref, 'spec-unreadable', /reference\.json is a symlink/)
})

test('release: a refusal, a busy output or a source replaced during assembly leaves the earlier release as it was and no partial output', () => {
  const f = fixture()
  runRelease(f.o(), quiet)
  writeFileSync(path.join(f.out, 'release-notes.md'), 'filled in')
  const before = Object.fromEntries(readdirSync(f.out).map((x) => [x, readFileSync(path.join(f.out, x), 'utf8')]))
  const same = () => assert.deepEqual(Object.fromEntries(readdirSync(f.out).map((x) => [x, readFileSync(path.join(f.out, x), 'utf8')])), before)
  const leftovers = () => assert.deepEqual(readdirSync(f.root).filter((e) => e.includes('assembling') || e.includes('previous')), [])
  // refused: parity went red
  f.parityReport.ok = false
  f.write()
  assert.throws(() => runRelease(f.o(), quiet), /\[parity-failed\]/)
  same()
  f.parityReport.ok = true
  f.write()
  // busy: another assembly holds the lock on this --out
  const lock = acquireLock(`release\n${path.resolve(f.out)}`)
  try {
    assert.throws(() => runRelease(f.o(), quiet), /\[output-busy\]/)
  } finally {
    lock.release()
  }
  same()
  // replaced between acceptance and copying: the copy is aborted
  const accepted = acceptRelease(f.o())
  writeFileSync(f.themeZip, 'swapped-in')
  assert.throws(() => assembleRelease(accepted, f.o()), /changed while the release was assembled[\s\S]*\[artifact-mismatch\] light-desktop: bound to theme/)
  same()
  leftovers()
  // an --out that is a file is not replaced
  const g = fixture()
  writeFileSync(g.out, 'not a directory')
  assert.throws(() => runRelease(g.o(), quiet), /\[unsafe-file\]/)
  assert.equal(readFileSync(g.out, 'utf8'), 'not a directory')
  // nor is a directory that is not an earlier release (someone's data given as --out)
  const h = fixture()
  mkdirSync(path.join(h.out, 'photos'), { recursive: true })
  writeFileSync(path.join(h.out, 'notes.txt'), 'mine')
  assert.throws(() => runRelease(h.o(), quiet), /\[output-not-release\] --out .* is not a completed earlier release/)
  assert.deepEqual(readdirSync(h.out).sort(), ['notes.txt', 'photos'])
  rmSync(path.join(h.out, 'photos'), { recursive: true })
  assert.throws(() => runRelease(h.o(), quiet), /\[output-not-release\].*lacks manifest\.json, VERIFICATION\.json, README\.md, SHA256SUMS/)
})

test('release: every input is read again just before the swap — same bytes with a newer mtime, evidence rewritten, a report or contract touched abort the assembly', () => {
  const cases = [
    ['evidence-stale', /before the theme artifact/, (f) => f.age(36, ['theme'])],
    ['evidence-stale', /before the webroot artifact/, (f) => f.age(36, ['webroot'])],
    ['input-changed', /restore\.json changed while the release was assembled/, (f) => writeFileSync(f.restore, JSON.stringify({ ...f.restoreReport, note: 'rewritten' }))],
    ['input-changed', /parity\.json changed/, (f) => writeFileSync(f.parity, JSON.stringify({ ...f.parityReport, note: 'rewritten' }))],
    ['input-changed', /dark-desktop\/visual\.json changed/, (f) => utimesSync(path.join(f.dir('dark-desktop'), 'visual.json'), new Date(), new Date())],
    ['input-changed', new RegExp(`light-responsive/${BINDING_FILE.replace('.', '\\.')} changed`), (f) => utimesSync(path.join(f.dir('light-responsive'), BINDING_FILE), new Date(), new Date())],
    ['input-changed', /rounds\.jsonl changed/, (f) => writeFileSync(f.ledger, readFileSync(f.ledger, 'utf8') + JSON.stringify({ run: 'rolling/cp-2', kind: 'recheck' }) + '\n')],
    ['audit-stale', /design-contract\.json was written .* after the audit/, (f) => utimesSync(path.join(f.runRoot, CANONICAL.design), new Date(), new Date())],
    ['input-changed', /manifest\.json changed/, (f) => utimesSync(path.join(f.pack, 'manifest.json'), new Date(), new Date())],
    ['input-changed', /sections\.json changed/, (f) => utimesSync(path.join(f.spec, 'sections.json'), new Date(), new Date())]
  ]
  for (const [code, pattern, mutate] of cases) {
    const f = fixture()
    runRelease(f.o(), quiet)
    const before = Object.fromEntries(readdirSync(f.out).map((x) => [x, readFileSync(path.join(f.out, x), 'utf8')]))
    const accepted = acceptRelease(f.o())
    mutate(f)
    assert.throws(
      () => assembleRelease(accepted, f.o()),
      (e) => e instanceof AcceptanceError && /release aborted/.test(e.message) && e.problems.some((p) => p.code === code) && pattern.test(e.message),
      `${code} ${pattern}`
    )
    assert.deepEqual(Object.fromEntries(readdirSync(f.out).map((x) => [x, readFileSync(path.join(f.out, x), 'utf8')])), before, 'the earlier release is as it was')
    assert.deepEqual(readdirSync(f.root).filter((e) => e.includes('assembling') || e.includes('previous')), [])
  }
})

test('release: only an empty directory or a completed earlier release is replaced, and notes that cannot be read are never replaced by the template', () => {
  // a manifest.json alone does not make a directory a release
  const lone = fixture()
  mkdirSync(lone.out)
  writeFileSync(path.join(lone.out, 'manifest.json'), '{"id":"mine"}')
  assert.throws(() => runRelease(lone.o(), quiet), /\[output-not-release\].*lacks VERIFICATION\.json, README\.md, SHA256SUMS.*names no release/)
  // nor a release manifest with no assets and a SHA256SUMS that holds for it alone
  const bare = fixture()
  mkdirSync(bare.out)
  const bareManifest = '{"release":"x","assets":[]}'
  writeFileSync(path.join(bare.out, 'manifest.json'), bareManifest)
  writeFileSync(path.join(bare.out, 'SHA256SUMS'), sumsText([{ file: 'manifest.json', sha256: hex(Buffer.from(bareManifest)) }]))
  assert.throws(() => runRelease(bare.o(), quiet), /\[output-not-release\].*lacks VERIFICATION\.json, README\.md.*assets are not a list of distinct plain file names/)
  assert.deepEqual(readdirSync(bare.out).sort(), ['SHA256SUMS', 'manifest.json'])
  // a completed release whose SHA256SUMS and manifest were cut to fewer files than it ships
  const cut = fixture()
  runRelease(cut.o(), quiet)
  const cutManifest = JSON.parse(readFileSync(path.join(cut.out, 'manifest.json'), 'utf8'))
  rmSync(path.join(cut.out, cutManifest.assets[2]))
  const cutSums = readFileSync(path.join(cut.out, 'SHA256SUMS'), 'utf8').split('\n').filter((l) => !l.endsWith(`  ${cutManifest.assets[2]}`)).join('\n')
  writeFileSync(path.join(cut.out, 'SHA256SUMS'), cutSums)
  assert.throws(() => runRelease(cut.o(), quiet), /\[output-not-release\].*its SHA256SUMS lists .*, the release it describes is /)
  // a VERIFICATION.json of another release
  const other = fixture()
  runRelease(other.o(), quiet)
  writeFileSync(path.join(other.out, 'VERIFICATION.json'), '{"release":"someone/else"}')
  const otherSums = readFileSync(path.join(other.out, 'SHA256SUMS'), 'utf8').replace(/^[0-9a-f]{64}(  VERIFICATION\.json)$/m, `${hex(Buffer.from('{"release":"someone/else"}'))}$1`)
  writeFileSync(path.join(other.out, 'SHA256SUMS'), otherSums)
  assert.throws(() => runRelease(other.o(), quiet), /\[output-not-release\].*VERIFICATION\.json is of "someone\/else"/)
  assert.deepEqual(readdirSync(lone.out), ['manifest.json'])
  // a completed release edited since, or holding a file its SHA256SUMS does not list, is not replaced
  const edited = fixture()
  runRelease(edited.o(), quiet)
  writeFileSync(path.join(edited.out, 'README.md'), 'edited by hand')
  assert.throws(() => runRelease(edited.o(), quiet), /\[output-not-release\].*SHA256SUMS does not hold for README\.md/)
  assert.equal(readFileSync(path.join(edited.out, 'README.md'), 'utf8'), 'edited by hand')
  const extra = fixture()
  runRelease(extra.o(), quiet)
  writeFileSync(path.join(extra.out, 'draft.txt'), 'mine')
  assert.throws(() => runRelease(extra.o(), quiet), /\[output-not-release\].*draft\.txt, not in its SHA256SUMS/)
  assert.equal(readFileSync(path.join(extra.out, 'draft.txt'), 'utf8'), 'mine')
  // an empty directory is taken
  const empty = fixture()
  mkdirSync(empty.out)
  runRelease(empty.o(), quiet)
  assert.ok(existsSync(path.join(empty.out, 'SHA256SUMS')))
  // notes that exist and cannot be read stop the run; --force-notes puts the template back
  if (process.getuid?.() !== 0) {
    const n = fixture()
    runRelease(n.o(), quiet)
    const notes = path.join(n.out, 'release-notes.md')
    writeFileSync(notes, 'filled in')
    chmodSync(notes, 0o000)
    try {
      assert.throws(() => runRelease(n.o(), quiet), /\[output-notes-unreadable\].*release-notes\.md cannot be read/)
    } finally {
      chmodSync(notes, 0o644)
    }
    assert.equal(readFileSync(notes, 'utf8'), 'filled in')
    chmodSync(notes, 0o000)
    runRelease({ ...n.o(), forceNotes: true }, quiet)
    assert.match(readFileSync(notes, 'utf8'), /\{\{ONE_LINE_WHAT_THIS_IS\}\}/)
  }
})

test('release.mjs: the checkpoint and contract-bind flags are required; a refusal exits non-zero and writes nothing', () => {
  const f = fixture()
  const tool = path.join(HERE, '..', 'quickstart', 'release.mjs')
  const flags = ['--pack', f.pack, '--out', f.out, '--parity', f.parity, '--restore-report', f.restore, '--run-root', f.runRoot, '--spec', f.spec, '--theme-zip', f.themeZip, '--visual-ledger', f.ledger, '--contract-bind', f.contractBind]
  const usage = spawnSync('node', [tool, ...flags], { encoding: 'utf8' })
  assert.equal(usage.status, 2, usage.stderr)
  assert.match(usage.stderr, /--checkpoint/)
  const noBind = spawnSync('node', [tool, ...flags.slice(0, -2), '--checkpoint', f.line.run], { encoding: 'utf8' })
  assert.equal(noBind.status, 2, noBind.stderr)
  assert.match(noBind.stderr, /--contract-bind/)
  f.restoreReport.ok = false
  f.write()
  const refused = spawnSync('node', [tool, ...flags, '--checkpoint', f.line.run], { encoding: 'utf8' })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /release refused — nothing was written[\s\S]*\[restore-failed\]/)
  assert.ok(!existsSync(f.out))
})

// ---------------------------------------------------------------- the bound content contract
test('release: the contract bind is recorded in VERIFICATION.json (contract, plugin, warnings by code, entities, evidence hash)', () => {
  const f = fixture()
  runRelease(f.o(), quiet)
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.deepEqual(v.contractBind, {
    contract: 'tracy-base/wp7/1.0.0', pluginVersion: '2.4.0', alreadyBound: false, warnings: 3, warningCodes: { PRESENTATION_DRIFT: 3 }, entities: 12, ranAt: at(15),
    evidence: tag(readFileSync(f.contractBind))
  })
  // a re-run on an already bound restore is the state the test wants
  const again = fixture()
  again.bind.alreadyBound = true
  assert.equal(JSON.parse(runRelease(again.write().o(), quiet) && readFileSync(path.join(again.out, 'VERIFICATION.json'), 'utf8')).contractBind.alreadyBound, true)
})

test('release: every reason the contract bind does not back the release is refused by its own code', () => {
  const cases = [
    ['contract-bind-refused', /not bound \(refused: contract_failed\)/, (f) => Object.assign(f.bind, { bound: false, refused: true, error: 'contract_failed', problems: ['Slot x'] })],
    ['contract-bind-refused', /did not run to an answer/, (f) => Object.assign(f.bind, { bound: false, error: 'no token' })],
    ['contract-bind-refused', /not bound/, (f) => Object.assign(f.bind, { bound: false })],
    ['contract-bind-unbound', /no pack identity/, (f) => (f.bindOverride = { pack: undefined })],
    ['contract-bind-unbound', /no pack identity/, (f) => (f.bindOverride = { pack: { manifest: 'x' } })],
    ['contract-bind-unbound', /no theme zip sha256/, (f) => (f.bindOverride = { themeZipSha256: undefined })],
    ['contract-bind-pack-mismatch', /webrootArchive/, (f) => (f.bindOverride = { pack: { ...f.bindIdentity().pack, webrootArchive: 'b'.repeat(64) } })],
    ['contract-bind-pack-mismatch', /manifest/, (f) => (f.bindOverride = { pack: { ...f.bindIdentity().pack, manifest: 'c'.repeat(64) } })],
    ['contract-bind-theme-mismatch', /theme zip/, (f) => (f.bindOverride = { themeZipSha256: 'd'.repeat(64) })],
    ['contract-bind-stale', /before the restore finished/, (f) => Object.assign(f.bind, { ranAt: at(5) })],
    ['contract-bind-invalid', /later than now/, (f) => Object.assign(f.bind, { ranAt: iso(Date.now() + 3600_000) })],
    ['contract-bind-invalid', /not contract-bind\.mjs evidence: tool is "other"/, (f) => Object.assign(f.bind, { tool: 'other' })],
    ['contract-bind-invalid', /ranAt/, (f) => Object.assign(f.bind, { ranAt: 'yesterday' })],
    ['contract-bind-invalid', /contract "nope" is not/, (f) => Object.assign(f.bind, { contract: 'nope' })],
    ['contract-bind-invalid', /warnings says 3, warningCodes add up to 1/, (f) => Object.assign(f.bind, { warningCodes: { A: 1 } })],
    ['contract-bind-invalid', /pluginVersion is empty/, (f) => Object.assign(f.bind, { pluginVersion: null })],
    ['contract-bind-invalid', /bound is not true or false/, (f) => Object.assign(f.bind, { bound: 'yes' })]
  ]
  for (const [code, pattern, change] of cases) {
    const f = fixture()
    change(f)
    refuses(f.write(), code, pattern)
  }
  const none = fixture()
  refuses(none, 'contract-bind-missing', /no --contract-bind/, { ...none.o(), contractBind: undefined })
  const gone = fixture()
  refuses(gone, 'contract-bind-unreadable', /--contract-bind/, { ...gone.o(), contractBind: path.join(gone.root, 'absent.json') })
  const text = fixture()
  writeFileSync(text.contractBind, 'not json')
  const r = (() => { try { acceptRelease(text.o()) } catch (e) { return e } })()
  assert.ok(r.problems.some((p) => p.code === 'contract-bind-unreadable'))
  const link = fixture()
  rmSync(link.contractBind)
  symlinkSync(link.parity, link.contractBind)
  refuses(link, 'contract-bind-unreadable', /symlink/)
})

test('release: a change to contract-bind.json while the release is assembled aborts it', () => {
  const f = fixture()
  const accepted = acceptRelease(f.o())
  writeFileSync(f.contractBind, JSON.stringify({ ...f.bind, ...f.bindIdentity(), warnings: 4, warningCodes: { PRESENTATION_DRIFT: 4 } }))
  assert.throws(() => assembleRelease(accepted, f.o()), /\[input-changed\][^\n]*contract-bind\.json/)
})

// ---------------------------------------------------------------- --patch: a fix release
/** A stored zip of `files` ({name: text}) — a central directory is all the reader needs. */
// ── the behaviour pass of a first release ──
test('sweep authority: N/A is accepted only when the spec binds none and every scheduled case is explicit', () => {
  const root = mkdtempSync(path.join(testBase(), 'p3-sweep-authority-'))
  roots.push(root)
  const spec = path.join(root, 'spec')
  mkdirSync(spec)
  const pageMap = { pages: [{ id: 'home', path: '/', file: 'home.html' }] }
  const writeReference = (kind) => writeFileSync(path.join(spec, 'reference.json'), JSON.stringify({ kind }))
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify(pageMap))
  writeReference('none')
  const contract = { pages: [{ id: 'home', path: '/', pagemapPath: '/', referenceKind: 'none' }] }
  const widths = DEFAULT_WIDTHS
  const heights = heightsWidths(widths, false)
  const schemes = DEFAULT_SCHEMES
  const cells = expectedSweepCells({ pages: [{ path: '/', referenceKind: 'none' }], widths, heightsWidths: heights, schemes })
  const target = new Set(['overflow', 'scheme', 'fixed-widgets', 'icons', 'forms', 'first-interaction'])
  const outcomes = cells.flatMap((cell) => {
    const axis = (state = cell.state) => ({ route: cell.route, ...(cell.width !== undefined ? { width: cell.width } : {}), ...(cell.scheme ? { scheme: cell.scheme } : {}), ...(state !== undefined ? { state } : {}) })
    const rows = [{ check: `sweep-${cell.check}-comparison`, ...axis(), status: 'not-applicable', reason: 'reference.kind=none' }]
    if (target.has(cell.check)) rows.push({ check: cell.check, ...axis(cell.state?.replace(/^theme:/, '').replace(/\/none$/, '/no-choice').replace(/\/auto$/, '/old-auto-value')), status: 'pass' })
    return rows
  })
  const report = { widths, schemes, heights: { widths: heights }, applicability: { version: 1, binding: { version: 1, kinds: { '/': 'none' } }, outcomes }, rows: [], stateRows: [], behaviourRows: {}, owed: [] }
  const accepted = sweepAuthority({ report, contract, specDir: spec })
  assert.deepEqual(accepted.problems, [])
  assert.equal(accepted.allNone, true)
  assert.ok(sweepAuthority({ report, contract }).problems.some((x) => /requires --spec/.test(x)))
  writeReference('html')
  const forged = sweepAuthority({ report, contract: { pages: [{ id: 'home', path: '/', pagemapPath: '/', referenceKind: 'html' }] }, specDir: spec })
  assert.ok(forged.problems.some((x) => /does not match|N\/A is not allowed|unauthorized N\/A/.test(x)))
})

test('behaviour pass: a first release without --behaviour-sweep is refused with a named code and the next step', () => {
  const f = fixture()
  const r = refusal(f, { ...f.o(), behaviourSweep: undefined })
  assert.deepEqual(r.codes, ['behaviour-pass-missing'])
  assert.match(r.text, /all 11 checks \(overflow, scheme, background, header, chips, fixed-widgets, icons, forms, text, first-interaction, heights\)/)
  assert.match(r.text, /Next step: run node scripts\/visual\/site-sweep\.mjs (?!.*--only ).*--zip .*--behaviour-sweep/)
  assert.ok(acceptRelease(f.o()).acceptance.behaviour, 'a clean pass is accepted and recorded')
  assert.deepEqual(acceptRelease(f.o()).acceptance.behaviour.checks, ALL_CHECKS)
})

test('behaviour pass: a sweep that did not run all eleven checks, or is not a site-sweep.json, is refused', () => {
  const run = (mutate, code, pattern) => {
    const f = fixture()
    mutate(f.sweep)
    const r = refusal(f.write())
    assert.deepEqual(r.codes, [code], r.text)
    assert.match(r.text, pattern)
  }
  run((s) => { s.checks = s.checks.filter((c) => c.id !== 'forms' && c.id !== 'icons') }, 'behaviour-pass-checks', /did not run icons, forms/)
  run((s) => { s.checks = s.checks.filter((c) => c.id !== 'heights') }, 'behaviour-pass-checks', /did not run heights/)
  run((s) => { s.schema = 'tracy-fix-measure/v1' }, 'behaviour-pass-invalid', /not a tracy-site-sweep\/v1 site-sweep\.json/)
  const f = fixture()
  writeFileSync(f.sweepFile, '{ not json')
  assert.deepEqual(refusal(f, f.o()).codes, ['behaviour-pass-invalid'])
})

test('behaviour pass: every reported group is fixed or recorded; unrecorded, mis-recorded and unmeasured ones are refused', () => {
  const run = (mutate, code, pattern) => {
    const f = fixture()
    mutate(f.sweep)
    const r = refusal(f.write())
    assert.deepEqual(r.codes, [code], r.text)
    assert.match(r.text, pattern)
  }
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'forms'), { defects: 2, pass: false }) }, 'behaviour-pass-defects', /forms 2 group\(s\).*sweep\.accept/)
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'icons'), { acceptErrors: 1, pass: false }) }, 'behaviour-pass-accept', /icons/)
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'text'), { notMeasured: 3, pass: false }) }, 'behaviour-pass-unmeasured', /text 3 case/)
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'overflow'), { defects: 1, pass: false }) }, 'behaviour-pass-defects', /overflow 1 group\(s\)/)
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'heights'), { notMeasured: 1, pass: false }) }, 'behaviour-pass-unmeasured', /heights 1 case/)
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'chips'), { acceptErrors: 1, pass: false }) }, 'behaviour-pass-accept', /chips/)
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'header'), { cases: 0, pass: false }) }, 'behaviour-pass-unmeasured', /header no case measured/)
  run((s) => { Object.assign(s.checks.find((c) => c.id === 'scheme'), { pass: false }) }, 'behaviour-pass-defects', /scheme as not passed/)
  run((s) => { s.owed = [{ route: '/x', reason: 'unreachable' }] }, 'behaviour-pass-unmeasured', /1 owed/)
  // a group recorded through sweep.accept is counted as accepted, not as a defect: the release goes through and says how many
  const f = fixture()
  Object.assign(f.sweep.checks.find((c) => c.id === 'forms'), { defects: 0, accepted: 1 })
  f.sweep.accepted = [{ check: 'forms', what: 'x', decision: 'D-1' }]
  assert.equal(acceptRelease(f.write().o()).acceptance.behaviour.accepted, 1)
})

test('behaviour pass: dark cells the sweep closed on the source\'s declared lack of dark pass only with the contract\'s source.darkDerived, and are carried on the receipt (ja-restaurant S-40)', () => {
  const f = fixture()
  const dark = (o = {}) => ({ route: '/', width: 1440, scheme: 'dark', checks: ['fixed-widgets'], reason: DARK_DERIVED_REASON, ...o })
  f.sweep.schemes = ['light', 'dark']
  const codes = (notOwed, sourceDarkDerived) => {
    f.sweep.notOwed = notOwed
    f.write()
    return behaviourProblems({ file: f.sweepFile, sourceDarkDerived })
  }
  const ok = codes([dark(), dark({ width: 390 })], true)
  assert.deepEqual(ok.problems, [])
  assert.deepEqual(ok.behaviour.notOwed, [{ reason: DARK_DERIVED_REASON, cells: 2 }])
  assert.match(codes([dark()], false).problems.map((p) => p.message).join(), /does not declare source\.darkDerived/)
  assert.match(codes([dark({ reason: 'the tool could not read it' })], true).problems.map((p) => p.message).join(), /another reason/)
  assert.match(codes([dark({ scheme: 'light' })], true).problems.map((p) => p.message).join(), /another reason/)
  assert.ok(codes([dark({ scheme: 'light' })], true).problems.every((p) => p.code === 'behaviour-pass-unmeasured'))
  // the release reads the declaration from its own canonical visual contract: the fixture's declares none
  f.sweep.notOwed = [dark()]
  const r = refusal(f.write())
  assert.deepEqual(r.codes, ['behaviour-pass-unmeasured'], r.text)
  const derived = (theme) => {
    const g = fixture({ source: { kind: 'live', darkHook: null, darkDerived: true }, theme })
    Object.assign(g.sweep, { notOwed: [dark()], schemes: ['light', 'dark'] })
    return g.write()
  }
  assert.deepEqual(acceptRelease(derived({ darkDerived: true }).o()).acceptance.behaviour.notOwed, [{ reason: DARK_DERIVED_REASON, cells: 1 }])
  // review: the contract says darkDerived but the spec-pack being released no longer does — not taken
  assert.ok(refusal(derived({ hook: { attribute: 'data-theme', darkValue: 'dark' } })).codes.includes('behaviour-pass-unmeasured'))
  // a sweep that closed dark cells with no light pass measured nothing of those pages
  const g = derived({ darkDerived: true })
  g.sweep.schemes = ['dark']
  const nolight = refusal(g.write())
  assert.deepEqual(nolight.codes, ['behaviour-pass-unmeasured'], nolight.text)
  assert.match(nolight.text, /ran no light pass/)
})

test('behaviour pass: a sweep that read no cell of the behaviour checks is refused, whatever it closed or owed (review)', () => {
  // a sweep over no route at all (what site-sweep writes for an empty page set) is one of them
  const noRoute = (s) => Object.assign(s, { routesTotal: 0, routesMeasured: 0, measuredCells: 0, exit: 3, checks: s.checks.map((c) => ({ ...c, cases: 0, pass: false })) })
  for (const mutate of [(s) => { for (const c of s.checks) c.cases = 0 }, (s) => { s.measuredCells = 0 }, noRoute]) {
    const f = fixture()
    mutate(f.sweep)
    const r = refusal(f.write())
    // a sweep over no route is also narrower than the contract (behaviour-pass-narrow); unmeasured is refused either way
    assert.deepEqual(r.codes.filter((c) => c !== 'behaviour-pass-narrow'), ['behaviour-pass-unmeasured'], r.text)
    assert.match(r.text, /measured no cell/)
  }
})

test('behaviour pass: another site, another theme zip, older than the restore, or narrower than the contract is refused', () => {
  const run = (mutate, code, pattern) => {
    const f = fixture()
    mutate(f.sweep)
    const r = refusal(f.write())
    assert.deepEqual(r.codes, [code], r.text)
    assert.match(r.text, pattern)
  }
  run((s) => { s.site = 'http://elsewhere' }, 'behaviour-pass-site', /not the restored site/)
  run((s) => { s.theme.zipSha256 = 'a'.repeat(64) }, 'behaviour-pass-artifact', /theme zip/)
  run((s) => { s.theme = { version: null, zipSha256: null } }, 'behaviour-pass-artifact', /--zip/)
  run((s) => { s.ranAt = at(5) }, 'behaviour-pass-stale', /before the restore finished/)
  run((s) => { s.routesTotal = 0 }, 'behaviour-pass-narrow', /without --pages/)
})

test('behaviour pass: a fix release (--patch) is unchanged — it takes no behaviour pass', () => {
  const f = patchFixture()
  assert.ok(acceptRelease({ ...f.po(), behaviourSweep: undefined }).fix)
})

function zipOf(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text)
    const n = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(n.length, 26)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(20, 6)
    head.writeUInt32LE(crc32(data), 16)
    head.writeUInt32LE(data.length, 20)
    head.writeUInt32LE(data.length, 24)
    head.writeUInt16LE(n.length, 28)
    head.writeUInt32LE(offset, 42)
    central.push(head, n)
    parts.push(local, n, data)
    offset += 30 + n.length + data.length
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dir, end])
}

/**
 * A fix-release input set on top of the full fixture: the runtime evidence and the contract bind of the
 * full gate, plus `previous` (the VERIFICATION.json of 0.9.0) and `measure` (tracy-fix-measure/v1, two
 * checks, a baseline on 0.9.0 that failed one). `f.patch()` writes them; `f.po()` is the options.
 */
function patchFixture(opts) {
  const f = fixture(opts)
  f.previousFile = path.join(f.root, 'previous', 'VERIFICATION.json')
  f.measureFile = path.join(f.root, 'measure.json')
  f.previousZip = path.join(f.root, 'tracy-base-0.9.0.zip')
  mkdirSync(path.dirname(f.previousFile))
  f.prev = { release: 'tracy-base/wp7', version: '0.9.0', gate: 'full', visual: { run: 'rolling/cp-0', findings: 0 }, artifacts: { theme: { file: 'tracy-base-0.9.0.zip', sha256: null } } }
  f.m = {
    tool: 'measure.mjs', site: 'http://b', source: 'http://source.test', themeZipSha256: hex(readFileSync(f.themeZip)), ranAt: at(25),
    // the port's own two checks beside the eleven of a full sweep, which the patch gate requires
    checks: [{ id: 'A1', title: 'The header does not wrap at 1023', pass: true, cases: 4, defects: 0 }, { id: 'B1', title: 'No sideways overflow at 1024', pass: true, cases: 12, defects: 0, note: 'category pages' }, ...ALL_CHECKS.map((id) => ({ id, title: `sweep check ${id}`, pass: true, cases: 6, defects: 0 }))],
    sourceFingerprint: SOURCE_FP,
    coverage: undefined,
    baseline: { version: '0.9.0', passed: ALL_CHECKS.length + 1, total: ALL_CHECKS.length + 2, ranAt: at(-5), sourceFingerprint: SOURCE_FP },
    notDefects: [{ what: 'Home 4 dark logo', why: 'the source picture is a 404', evidence: 'measure.json B3' }]
  }
  /** SHA256SUMS of the previous release directory, over the files in it. */
  f.sealPrevious = () => {
    const dir = path.dirname(f.previousFile)
    for (const [n, t] of Object.entries({ 'manifest.json': JSON.stringify({ release: f.prev.release, assets: [] }) + '\n', 'README.md': '# previous\n' }))
      if (!existsSync(path.join(dir, n))) writeFileSync(path.join(dir, n), t)
    const names = readdirSync(dir).filter((n) => n !== 'SHA256SUMS').sort()
    writeFileSync(path.join(dir, 'SHA256SUMS'), sumsText(names.map((file) => ({ file, sha256: hex(readFileSync(path.join(dir, file))) }))))
  }
  f.noBaseline = undefined
  f.auditScope = 'patch'
  f.zipBefore = { 'tracy-base/style.css': 'a', 'tracy-base/inc/extra.php': 'b', 'tracy-base/templates/index.html': 't' }
  f.zipAfter = { 'tracy-base/style.css': 'a2', 'tracy-base/inc/extra.php': 'b', 'tracy-base/templates/index.html': 't', 'tracy-base/assets/new.js': 'n' }
  // what the full sweep the measure stands on covered; `f.patch()` writes it as the sweep's rows and as the measure's declared coverage
  f.cov = { mode: 'full', explicit: [], carried: false, checks: [...ALL_CHECKS], routes: ['/'], widths: DEFAULT_WIDTHS, heightsWidths: heightsWidths(DEFAULT_WIDTHS, false), schemes: DEFAULT_SCHEMES }
  f.sweepOf = () => {
    const cov = coverageOf(f.cov)
    return {
      schema: 'tracy-site-sweep/v1',
      tool: 'site-sweep.mjs',
      ranAt: f.m.ranAt,
      site: f.m.site,
      source: f.m.source,
      theme: { version: '1.0.0', zipSha256: f.m.themeZipSha256 },
      sourceFingerprint: f.m.sourceFingerprint,
      run: { mode: 'full' },
      coverage: cov,
      checks: f.m.checks.filter((c) => f.cov.checks.includes(c.id)).map((c) => ({ id: c.id, cases: c.cases, defects: c.defects, pass: c.pass })),
      rows: f.cov.routes.flatMap((route) => f.cov.widths.flatMap((width) => f.cov.schemes.map((scheme) => ({ route, width, scheme })))),
      heights: { widths: f.cov.heightsWidths, cells: f.cov.routes.flatMap((route) => f.cov.heightsWidths.map((width) => ({ route, width }))) }
    }
  }
  f.sweepFull = path.join(f.root, 'full-sweep', 'site-sweep.json')
  f.patch = () => {
    f.write()
    mkdirSync(path.dirname(f.sweepFull), { recursive: true })
    if (f.m.coverage !== null) f.m.coverage = coverageOf(f.cov)
    writeFileSync(f.sweepFull, JSON.stringify(f.sweepDoc ?? f.sweepOf()))
    writeFileSync(f.previousZip, zipOf(f.zipBefore))
    f.prev.artifacts.theme.sha256 = tag(readFileSync(f.previousZip))
    writeFileSync(f.previousFile, JSON.stringify(f.prev))
    f.sealPrevious()
    writeFixMeasure(f.measureFile, f.m)
    // the theme zip released is a real zip when a diff is asked for
    return f
  }
  f.po = (extra = {}) => ({ ...f.o(), visualLedger: undefined, checkpoint: undefined, patch: true, previous: f.previousFile, measure: f.measureFile, sweep: f.sweepFull, ...extra })
  return f.patch()
}
const patchRefuses = (f, code, pattern, o = f.po()) => refuses(f, code, pattern, o)

/** A patch fixture whose measure and baseline were written from a spec-bound all-none sweep. */
function allNonePatchFixture() {
  const f = patchFixture()
  writeFileSync(path.join(f.spec, 'reference.json'), JSON.stringify({ kind: 'none' }))
  writeFileSync(path.join(f.runRoot, 'page-map.json'), readFileSync(path.join(f.spec, 'page-map.json')))
  writeFileSync(path.join(f.runRoot, 'reference.json'), readFileSync(path.join(f.spec, 'reference.json')))
  const visualFile = path.join(f.runRoot, CANONICAL.visual)
  const { visual } = writeContracts({ runRoot: f.runRoot, specDir: f.spec, sourceSite: 'http://source.test' })
  visual.pages[0].referenceKind = 'none'
  visual.pages[0].pagemapPath = '/'
  writeFileSync(visualFile, JSON.stringify(visual))
  f.visualContract = visual

  const input = sweepInputs(f.runRoot, f.spec)
  const binding = { version: 1, kinds: { '/': 'none' }, specHash: input.files.spec, contractHash: input.files.contract }
  const pages = [{ path: '/', referenceKind: 'none' }]
  const cells = expectedSweepCells({ pages, widths: f.cov.widths, heightsWidths: f.cov.heightsWidths, schemes: f.cov.schemes })
  const targetChecks = new Set(['overflow', 'scheme', 'fixed-widgets', 'icons', 'forms', 'first-interaction'])
  const outcomes = cells.flatMap((cell) => {
    const axis = (state = cell.state) => ({ route: cell.route, ...(cell.width !== undefined ? { width: cell.width } : {}), ...(cell.scheme !== undefined ? { scheme: cell.scheme } : {}), ...(state !== undefined ? { state } : {}) })
    const result = [{ check: `sweep-${cell.check}-comparison`, ...axis(), status: 'not-applicable', reason: 'reference.kind=none' }]
    if (targetChecks.has(cell.check)) result.push({ check: cell.check, ...axis(cell.state?.replace(/^theme:/, '').replace(/\/none$/, '/no-choice').replace(/\/auto$/, '/old-auto-value')), status: 'pass' })
    return result
  })
  const applicability = { version: 1, binding, outcomes }
  f.m.source = null
  delete f.m.sourceFingerprint
  f.m.applicability = applicability
  f.m.checks = f.m.checks.map((check) => {
    if (!ALL_CHECKS.includes(check.id) || targetChecks.has(check.id)) return check
    const { pass, ...rest } = check
    return { ...rest, status: 'not-applicable', cases: 0, defects: 0 }
  })

  const baselineFile = path.join(f.root, 'previous-fix-measure.json')
  const baselineMeasure = writeFixMeasure(baselineFile, {
    tool: 'site-sweep.mjs', site: f.m.site, source: null, themeZipSha256: f.m.themeZipSha256,
    ranAt: at(0), checks: f.m.checks.map((check) => check.id === 'A1' ? { ...check, pass: false } : check),
    applicability
  })
  f.m.baseline = baselineOf(baselineMeasure, '0.9.0')

  const originalSweepOf = f.sweepOf
  f.sweepOf = () => {
    const sweep = originalSweepOf()
    return {
      ...sweep,
      source: null,
      sourceFingerprint: undefined,
      widths: f.cov.widths,
      schemes: f.cov.schemes,
      heights: { widths: f.cov.heightsWidths, cells: f.cov.routes.flatMap((route) => f.cov.heightsWidths.map((width) => ({ route, width }))) },
      applicability,
      checks: f.m.checks.filter((check) => ALL_CHECKS.includes(check.id)).map(({ id, cases, defects, pass, status }) => ({ id, cases, defects, ...(status === 'not-applicable' ? { status } : { pass }) }))
    }
  }
  return f.patch()
}

function mergeAllNonePatchFixture(f) {
  const sweepMeasure = JSON.parse(readFileSync(f.measureFile, 'utf8'))
  const portFile = path.join(f.root, 'port-check.json')
  const portMeasure = writeFixMeasure(portFile, {
    tool: 'port-check.mjs', site: sweepMeasure.site, source: null, themeZipSha256: sweepMeasure.artifact.themeZipSha256,
    ranAt: at(24), checks: [{ id: 'port-check', title: 'Port check', pass: true, cases: 1, defects: 0 }],
    baseline: { version: '0.9.0', passed: 0, total: 1, ranAt: at(-5), checks: [{ id: 'port-check', pass: false }] }
  })
  const merged = mergeFixMeasures([sweepMeasure, portMeasure])
  writeFixMeasure(f.measureFile, merged)
  return merged
}

test('patch: a baseline written from an all-none fix measure keeps its binding; a changed or removed baseline binding is refused', () => {
  const accepted = allNonePatchFixture()
  const merged = mergeAllNonePatchFixture(accepted)
  const release = acceptRelease(accepted.po())
  assert.deepEqual(release.fix.baseline.applicability.binding, merged.applicability.binding)
  assert.equal(release.fix.measure.source, null)
  assert.ok(release.fix.measure.checks.some((check) => check.id === 'port-check'))

  const changed = allNonePatchFixture()
  const changedMeasure = mergeAllNonePatchFixture(changed)
  changedMeasure.baseline.applicability.binding.kinds['/'] = 'html'
  writeFixMeasure(changed.measureFile, changedMeasure)
  patchRefuses(changed, 'measure-baseline-applicability', /another reference applicability binding/)

  const removed = allNonePatchFixture()
  const removedMeasure = mergeAllNonePatchFixture(removed)
  delete removedMeasure.baseline.applicability
  writeFixMeasure(removed.measureFile, removedMeasure)
  patchRefuses(removed, 'measure-baseline-applicability', /another reference applicability binding/)
})

test('patch: a fix release is accepted on the measure, with no checkpoint, run-root or ledger, and says so in VERIFICATION.json', () => {
  const f = patchFixture()
  const lines = []
  const done = runRelease({ ...f.po(), visualLedger: '/nowhere.jsonl', checkpoint: 'x' }, { state: { exists: false }, log: (l) => lines.push(l) })
  assert.match(lines[0], /^note: --visual-ledger, --checkpoint ignored in --patch mode/)
  assert.ok(lines.some((l) => new RegExp(`fix release of 0\\.9\\.0.*${N_CHECKS}/${N_CHECKS} targeted checks`).test(l)))
  assert.ok(lines.some((l) => /Publish \(not run by this tool\)/.test(l)))
  assert.equal(done.placeholders, false)
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.equal(v.gate, 'patch')
  assert.deepEqual(v.visual, { checkpoint: null, reason: 'fix release: targeted measurement instead of a four-tier checkpoint' })
  assert.equal(v.contracts, null)
  assert.equal(v.acceptance.visual, null)
  assert.equal(v.acceptance.gate, 'patch')
  // VERIFICATION.json goes on a public release: paths and stand origins are written as portableVerification makes them
  assert.deepEqual(v.previous, { release: 'tracy-base/wp7', version: '0.9.0', file: portableVerification(recordPath(f.previousFile)), evidence: tag(readFileSync(f.previousFile)), gate: 'full', visual: f.prev.visual })
  assert.deepEqual([v.measure.passed, v.measure.total, v.measure.site, v.measure.source, v.measure.tool, v.measure.evidence], [N_CHECKS, N_CHECKS, 'http://b', portableVerification('http://source.test'), 'measure.mjs', tag(readFileSync(f.measureFile))])
  assert.deepEqual(v.measure.checks.map((c) => c.id), ['A1', 'B1', ...ALL_CHECKS])
  assert.deepEqual([v.measure.coverage.mode, v.measure.sourceFingerprint.id], ['full', SOURCE_FP.id])
  assert.deepEqual(v.baseline, f.m.baseline)
  assert.equal(v.noBaseline, undefined)
  assert.deepEqual(v.notDefects, f.m.notDefects)
  assert.equal(v.changedFrom, null)
  assert.equal(v.contractBind.contract, 'tracy-base/wp7/1.0.0')
  assert.equal(v.parity.ok, true)
  assert.equal(JSON.parse(readFileSync(path.join(f.out, 'manifest.json'), 'utf8')).release, 'tracy-base/wp7')
  // the same three artifacts as the full gate ships
  assert.deepEqual(Object.fromEntries(Object.entries(v.acceptance.artifacts).map(([k, a]) => [k, a.sha256])), Object.fromEntries(Object.entries(f.hashes()).map(([k, a]) => [k, a.sha256])))
  // and the full gate says so too
  const full = fixture()
  runRelease(full.o(), quiet)
  assert.equal(JSON.parse(readFileSync(path.join(full.out, 'VERIFICATION.json'), 'utf8')).gate, 'full')
})

test('patch: the previous release may be its directory, and its version is compared as a dotted number', () => {
  const f = patchFixture()
  assert.ok(acceptRelease(f.po({ previous: path.dirname(f.previousFile) })).fix.previous.file.endsWith('VERIFICATION.json'))
  assert.equal(compareVersions('1.0.9', '1.0.10'), -1)
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0-rc', '1.0.0'), null)
})

test('patch: every reason the previous release does not back the fix is refused by its own code', () => {
  const cases = [
    ['previous-missing', /no --previous/, (f) => ({ previous: undefined })],
    ['previous-unreadable', /--previous/, (f) => ({ previous: path.join(f.root, 'gone.json') })],
    ['previous-invalid', /not a release's VERIFICATION\.json/, (f) => ((f.prev.release = undefined), {})],
    ['previous-invalid', /not a release's VERIFICATION\.json/, (f) => ((f.prev.version = ''), {})],
    ['previous-invalid', /not a dotted number/, (f) => ((f.prev.version = '0.9.0-rc'), {})],
    ['previous-mismatch', /release of other\/wp7/, (f) => ((f.prev.release = 'other/wp7'), {})],
    ['previous-not-lower', /not lower than this release's 1\.0\.0/, (f) => ((f.prev.version = '1.0.0'), {})],
    ['previous-not-lower', /not lower/, (f) => ((f.prev.version = '1.2.0'), {})]
  ]
  for (const [code, pattern, change] of cases) {
    const f = patchFixture()
    const extra = change(f)
    writeFileSync(f.previousFile, JSON.stringify(f.prev))
    patchRefuses(f, code, pattern, f.po(extra))
  }
})

test('patch: every reason the measure does not back the fix is refused by its own code', () => {
  const cases = [
    ['measure-failed', new RegExp(`1 of ${N_CHECKS} check\\(s\\) fail: B1`), (f) => ((f.m.checks[1].pass = false), {})],
    ['measure-artifact-mismatch', /theme zip/, (f) => ((f.m.themeZipSha256 = 'e'.repeat(64)), {})],
    ['measure-site', /not the restored site http:\/\/b/, (f) => ((f.m.site = 'http://build.test:8452'), {})],
    ['measure-stale', /before the restore finished/, (f) => ((f.m.ranAt = at(5)), {})],
    ['measure-baseline-missing', /no baseline on the previous version/, (f) => ((f.m.baseline = null), {})],
    ['measure-baseline-missing', /no baseline/, (f) => ((f.m.baseline = null), { noBaseline: '   ' })],
    ['measure-baseline-passed', /never failed proves nothing/, (f) => ((f.m.baseline = { ...f.m.baseline, passed: N_CHECKS }), {})],
    ['measure-baseline-mismatch', /version 0\.8\.0, the previous release is 0\.9\.0|of version 0\.8\.0/, (f) => ((f.m.baseline = { ...f.m.baseline, version: '0.8.0' }), {})],
    ['measure-baseline-mismatch', /not the same checks/, (f) => ((f.m.baseline = { ...f.m.baseline, total: N_CHECKS + 1 }), {})],
    ['measure-baseline-conflict', /--no-baseline/, (f) => ({ noBaseline: 'cannot measure' })],
    ['measure-missing', /no --measure/, (f) => ({ measure: undefined })],
    ['measure-unreadable', /--measure/, (f) => ({ measure: path.join(f.root, 'gone.json') })]
  ]
  for (const [code, pattern, change] of cases) {
    const f = patchFixture()
    const extra = change(f)
    // a deliberately wrong document is written by hand: writeFixMeasure only writes valid ones
    writeFileSync(f.measureFile, JSON.stringify({ schema: 'tracy-fix-measure/v1', ...f.m, artifact: { themeZipSha256: f.m.themeZipSha256 }, themeZipSha256: undefined, passed: f.m.checks.filter((c) => c.pass).length, total: f.m.checks.length }))
    patchRefuses(f, code, pattern, f.po(extra))
  }
  const future = patchFixture()
  future.m.ranAt = iso(Date.now() + 3600_000)
  writeFileSync(future.measureFile, JSON.stringify({ schema: 'tracy-fix-measure/v1', ...future.m, artifact: { themeZipSha256: future.m.themeZipSha256 }, passed: N_CHECKS, total: N_CHECKS }))
  patchRefuses(future, 'measure-invalid', /later than now/)
  const bad = patchFixture()
  writeFileSync(bad.measureFile, JSON.stringify({ schema: 'other', checks: [] }))
  patchRefuses(bad, 'measure-invalid', /not a tracy-fix-measure\/v1 document: schema is "other"/)
  const text = patchFixture()
  writeFileSync(text.measureFile, 'not json')
  patchRefuses(text, 'measure-unreadable', /not JSON/)
})

test('patch: --no-baseline is recorded verbatim and stands in for a baseline only when the measure has none', () => {
  const f = patchFixture()
  f.m.baseline = null
  f.patch()
  const reason = 'the previous version cannot be restored on any stand: its database is gone'
  runRelease(f.po({ noBaseline: reason }), quiet)
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.equal(v.noBaseline, reason)
  assert.equal(v.baseline, null)
})

test('patch: a measure that is not a full run of every check over every route on the standard axes is refused, each by its own code', () => {
  const full = patchFixture()
  assert.doesNotThrow(() => acceptRelease(full.po()), 'a full run of every check over every route is accepted')
  const widths = DEFAULT_WIDTHS.slice(1)
  const cases = [
    // a scoped run of one check, however clean it is
    ['measure-scoped', /scoped run \(--only\)/, (f) => {
      f.m.checks = f.m.checks.filter((c) => c.id === 'overflow')
      f.m.baseline = null
      f.cov = { ...f.cov, mode: 'scoped', explicit: ['--only'], checks: ['overflow'] }
      return { noBaseline: 'the previous version cannot be restored' }
    }],
    ['measure-scoped', /--pages/, (f) => ((f.cov = { ...f.cov, mode: 'scoped', explicit: ['--pages'] }), {})],
    // an option the caller named is a scope even when its value is the whole scope: the sweep records it
    ['measure-scoped', /narrowed by --only/, (f) => ((f.cov = { ...f.cov, explicit: ['--only'] }), {})],
    ['measure-carried', /carries evidence it did not measure/, (f) => ((f.cov = { ...f.cov, carried: true }), {})],
    // the check is missing from the run and from the measure
    ['measure-checks-missing', /did not measure 1 of the 11 check\(s\): heights/, (f) => ((f.cov = { ...f.cov, checks: ALL_CHECKS.filter((c) => c !== 'heights') }), {})],
    ['measure-checks-missing', /lists no result for 1 check\(s\): text/, (f) => ((f.m.checks = f.m.checks.filter((c) => c.id !== 'text')), (f.m.baseline = { ...f.m.baseline, passed: N_CHECKS - 2, total: N_CHECKS - 1 }), {})],
    // one route replaced by another: the same number of routes, not the contract's
    ['measure-routes-missing', /1 not measured \(\/\).*1 not in the contract \(\/other\)/, (f) => ((f.cov = { ...f.cov, routes: ['/other'] }), {})],
    ['measure-routes-missing', /1 not measured \(\/\)/, (f) => ((f.cov = { ...f.cov, routes: [] }), {})],
    ['measure-axes-missing', /widths measured are/, (f) => ((f.cov = { ...f.cov, widths }), {})],
    ['measure-axes-missing', /heights widths measured are/, (f) => ((f.cov = { ...f.cov, heightsWidths: [390] }), {})],
    ['measure-axes-missing', /schemes measured are light/, (f) => ((f.cov = { ...f.cov, schemes: ['light'] }), {})],
    // a measure that declares no coverage (a port's own script, an older sweep) is never enough
    ['measure-coverage-missing', /records no coverage/, (f) => ((f.m.coverage = null), {})]
  ]
  for (const [code, pattern, change] of cases) {
    const f = patchFixture()
    const extra = change(f)
    f.patch()
    patchRefuses(f, code, pattern, f.po(extra))
  }
  // the visual contract of the dossier names the routes: with none, the scope cannot be told
  const none = patchFixture()
  rmSync(path.join(none.runRoot, CANONICAL.visual))
  patchRefuses(none, 'measure-contract-missing', /no visual\.contract\.json/, none.po())
})

test('patch: a measure cannot certify itself — what it covers is proven by the site-sweep.json it stands on, row by row', () => {
  // a measure that declares a full run and has no sweep behind it
  const solo = patchFixture()
  const lone = path.join(solo.root, 'solo', 'measure.json')
  mkdirSync(path.dirname(lone))
  writeFileSync(lone, readFileSync(solo.measureFile))
  patchRefuses(solo, 'measure-sweep-missing', /stands on no site-sweep\.json/, solo.po({ measure: lone, sweep: undefined }))
  patchRefuses(solo, 'measure-sweep-unreadable', /--sweep/, solo.po({ sweep: path.join(solo.root, 'gone', 'site-sweep.json') }))
  // a sweep with no rows (or too few) proves nothing, whatever the measure declares
  const empty = patchFixture()
  empty.sweepDoc = { ...empty.sweepOf(), rows: [], heights: { widths: [], cells: [] } }
  empty.patch()
  const r = refusal(empty, empty.po())
  assert.ok(r.codes.includes('measure-routes-missing') && r.codes.includes('measure-axes-missing'), r.text)
  const fewer = patchFixture()
  fewer.sweepDoc = { ...fewer.sweepOf(), rows: fewer.sweepOf().rows.filter((x) => x.scheme === 'light') }
  fewer.patch()
  patchRefuses(fewer, 'measure-axes-missing', /schemes measured are light/, fewer.po())
  // and the sweep must be the one the measure stands on
  const cases = [
    ['measure-sweep-mismatch', /sweep ran on theme zip/, (d) => (d.theme = { zipSha256: 'e'.repeat(64) })],
    ['measure-sweep-mismatch', /sweep measured http:\/\/elsewhere\.test/, (d) => (d.site = 'http://elsewhere.test')],
    ['measure-sweep-mismatch', /another source fingerprint/, (d) => (d.sourceFingerprint = SOURCE_REBUILT)],
    ['measure-sweep-mismatch', /not the coverage the sweep recorded/, (d) => (d.coverage = { ...d.coverage, explicit: ['--widths'] })],
    ['measure-sweep-mismatch', /result differs from the sweep's for overflow/, (d) => (d.checks.find((c) => c.id === 'overflow').cases = 99)],
    ['measure-carried', /sweep the measure stands on is a scoped re-run/, (d) => (d.run = { mode: 'scoped' })],
    ['measure-carried', /carries groups it did not measure/, (d) => (d.carried = { overflow: { whole: true } })],
    ['measure-sweep-invalid', /not a tracy-site-sweep\/v1/, (d) => (d.schema = 'other')],
    // a full sweep from before the restore, joined to a measure written after it
    ['measure-sweep-stale', /sweep ran at .*before the restore finished/, (d) => (d.ranAt = at(5))],
    ['measure-sweep-mismatch', /measure is dated .*after the sweep it stands on/, (d) => (d.ranAt = at(20))],
    ['measure-sweep-invalid', /sweep says it ran at .*later than now/, (d) => (d.ranAt = iso(Date.now() + 3600_000))],
    ['measure-sweep-invalid', /ranAt "yesterday" is not a timestamp/, (d) => (d.ranAt = 'yesterday')]
  ]
  for (const [code, pattern, change] of cases) {
    const f = patchFixture()
    f.sweepDoc = f.sweepOf()
    change(f.sweepDoc)
    f.patch()
    patchRefuses(f, code, pattern, f.po())
  }
})

test('patch: --no-baseline stays free text, is recorded as an unverified exception, and shows in the notes — also in notes that were kept', () => {
  const reason = 'the previous version cannot be restored on any stand'
  const f = patchFixture()
  f.m.baseline = null
  f.patch()
  runRelease(f.po({ noBaseline: reason }), quiet)
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.deepEqual([v.noBaseline, v.noBaselineVerified], [reason, false])
  const notes = readFileSync(path.join(f.out, 'release-notes.md'), 'utf8')
  assert.match(notes, /\*\*Unverified exception:\*\* no baseline was measured on the previous version/)
  assert.ok(notes.includes(reason))
  // a release with a baseline has no exception to record
  const g = patchFixture()
  runRelease(g.po(), quiet)
  assert.equal(JSON.parse(readFileSync(path.join(g.out, 'VERIFICATION.json'), 'utf8')).noBaselineVerified, undefined)
  assert.doesNotMatch(readFileSync(path.join(g.out, 'release-notes.md'), 'utf8'), /Unverified exception/)
  // notes a person kept still carry the exception of this release
  writeFileSync(path.join(f.out, 'release-notes.md'), 'written by hand\n')
  runRelease(f.po({ noBaseline: reason }), quiet)
  const kept = readFileSync(path.join(f.out, 'release-notes.md'), 'utf8')
  assert.ok(kept.startsWith('written by hand\n') && kept.includes('Unverified exception') && kept.includes(reason))
  // notes that happen to mention the reason, without the statement, still get the statement
  writeFileSync(path.join(f.out, 'release-notes.md'), `The previous version: ${reason}.\n`)
  runRelease(f.po({ noBaseline: reason }), quiet)
  const mentioned = readFileSync(path.join(f.out, 'release-notes.md'), 'utf8')
  assert.equal(mentioned.match(/\*\*Unverified exception:\*\*/g)?.length, 1)
  runRelease(f.po({ noBaseline: reason }), quiet)
  assert.equal(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), mentioned)
  writeFileSync(path.join(f.out, 'release-notes.md'), kept)
  // and are not changed again once they hold it
  runRelease(f.po({ noBaseline: reason }), quiet)
  assert.equal(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), kept)
  // an empty reason is still refused
  const h = patchFixture()
  h.m.baseline = null
  h.patch()
  patchRefuses(h, 'measure-baseline-missing', /no baseline/, h.po({ noBaseline: '  ' }))
})

test('source: a measure or a behaviour pass taken against another source at the same URL is refused — changed, unreadable, missing, other origin, baseline of another source', () => {
  // unchanged: accepted (the fixture reads the same page)
  const same = patchFixture()
  assert.doesNotThrow(() => acceptRelease(same.po()))
  const cases = [
    ['measure-source-changed', /source differs in the served home page/, (f) => ((f.currentSource = { ok: true, fingerprint: SOURCE_REBUILT }), {})],
    ['measure-source-unreadable', /cannot be fingerprinted now: http:\/\/source\.test\/ answered 500/, (f) => ((f.currentSource = { ok: false, error: 'http://source.test/ answered 500, not 200' }), {})],
    ['measure-source-missing', /records no fingerprint/, (f) => ((f.m.sourceFingerprint = undefined), {})],
    ['measure-source-mismatch', /taken against http:\/\/elsewhere\.test/, (f) => ((f.m.source = 'http://elsewhere.test'), {})],
    ['measure-baseline-source', /records no source fingerprint/, (f) => ((f.m.baseline = { ...f.m.baseline, sourceFingerprint: undefined }), {})],
    ['measure-baseline-source', /another source than the measure/, (f) => ((f.m.baseline = { ...f.m.baseline, sourceFingerprint: SOURCE_REBUILT }), {})]
  ]
  for (const [code, pattern, change] of cases) {
    const f = patchFixture()
    const extra = change(f)
    f.patch()
    patchRefuses(f, code, pattern, f.po(extra))
  }
  // the full release: the behaviour pass carries the fingerprint of the source it ran against
  const changed = fixture()
  changed.currentSource = { ok: true, fingerprint: SOURCE_REBUILT }
  refuses(changed, 'behaviour-source-changed', /behaviour sweep was not taken against the source as it is now/)
  const missing = fixture()
  delete missing.sweep.sourceFingerprint
  missing.write()
  refuses(missing, 'behaviour-source-missing', /records no fingerprint/)
})

// ---- evidence taken against the same source served at another origin than the contract's
const MOVED = 'http://moved.test'
const MOVED_HOME = `${MOVED}/`
const OTHER_HTML = '<!doctype html><html><body>another site\'s home</body></html>'
/**
 * Point a fixture's evidence at a source served at MOVED: the evidence names it and carries the fingerprint of its home page. `live` maps the
 * home URLs readable now to their HTML (a missing URL is unreadable); the reader records every URL it was asked for in `f.asked`.
 */
function relocate(f, { html = SOURCE_HTML, live = { [MOVED_HOME]: SOURCE_HTML, 'http://source.test/': SOURCE_HTML }, template = null } = {}) {
  const fp = fingerprintOf({ url: MOVED_HOME, html, template })
  f.asked = []
  f.live = live
  f.readSource = (url, tpl) => {
    f.asked.push(url)
    return url in f.live ? { ok: true, fingerprint: fingerprintOf({ url, html: f.live[url], template: tpl }) } : { ok: false, error: `${url} could not be read` }
  }
  if (f.m) {
    Object.assign(f.m, { source: MOVED, sourceFingerprint: fp })
    f.m.baseline = { ...f.m.baseline, sourceFingerprint: fp }
    f.patch()
  } else {
    Object.assign(f.sweep, { source: MOVED, sourceFingerprint: fp })
    f.write()
  }
  return fp
}
const withReader = (f, o) => ({ ...o, readSource: f.readSource })

test('source: evidence taken against the same source at another origin is accepted in both modes, and VERIFICATION.json records that origin', () => {
  const full = fixture()
  relocate(full)
  const done = runRelease(withReader(full, full.o()), quiet)
  assert.ok(done, 'the first release is accepted')
  assert.equal(JSON.parse(readFileSync(path.join(full.out, 'VERIFICATION.json'), 'utf8')).acceptance.behaviour.source, portableVerification(MOVED))
  assert.ok(full.asked.includes(MOVED_HOME), 'the source the evidence names is the one read')

  const patch = patchFixture()
  relocate(patch)
  runRelease(withReader(patch, patch.po()), quiet)
  assert.equal(JSON.parse(readFileSync(path.join(patch.out, 'VERIFICATION.json'), 'utf8')).measure.source, portableVerification(MOVED))
  assert.ok(patch.asked.includes(MOVED_HOME))
})

test('source: evidence at another origin is still refused when it records no fingerprint, the source is unreadable or changed, or it is another source', () => {
  const cases = [
    ['source-missing', /records no fingerprint/, (f) => { relocate(f); delete (f.m ?? f.sweep).sourceFingerprint }, (f) => (f.m ? f.patch() : f.write())],
    ['source-unreadable', /cannot be fingerprinted now/, (f) => relocate(f, { live: { 'http://source.test/': SOURCE_HTML } })],
    ['source-changed', /source differs in the served home page/, (f) => relocate(f, { live: { [MOVED_HOME]: OTHER_HTML, 'http://source.test/': SOURCE_HTML } })],
    // the fingerprint is of another URL than the one the evidence names
    ['source-mismatch', /records the fingerprint of http:\/\/source\.test\/, not of http:\/\/moved\.test\//, (f) => { relocate(f); (f.m ?? f.sweep).sourceFingerprint = SOURCE_FP }, (f) => (f.m ? f.patch() : f.write())],
    ['source-mismatch', /source fingerprint is not valid/, (f) => { relocate(f); (f.m ?? f.sweep).sourceFingerprint = { ...(f.m ?? f.sweep).sourceFingerprint, id: 'x' } }, (f) => (f.m ? f.patch() : f.write())],
    // another site's content: the evidence and its live source agree with each other, the dossier's source says otherwise
    ['source-mismatch', /whose home page is not the dossier's source/, (f) => relocate(f, { html: OTHER_HTML, live: { [MOVED_HOME]: OTHER_HTML, 'http://source.test/': SOURCE_HTML } })],
    // the contract's source cannot be read and the spec holds no home reference: nothing shows it is the same source
    ['source-mismatch', /nothing shows that http:\/\/moved\.test is the same source/, (f) => relocate(f, { live: { [MOVED_HOME]: SOURCE_HTML } })]
  ]
  for (const [code, pattern, change, rewrite] of cases) {
    for (const mode of ['behaviour', 'measure']) {
      if (mode === 'measure' && /not valid/.test(String(pattern))) continue // writeFixMeasure refuses to write one
      const f = mode === 'measure' ? patchFixture() : fixture()
      change(f)
      rewrite?.(f)
      refuses(f, `${mode}-${code}`, pattern, withReader(f, mode === 'measure' ? f.po() : f.o()))
    }
  }
  // another declared template
  for (const mode of ['behaviour', 'measure']) {
    const f = mode === 'measure' ? patchFixture() : fixture()
    relocate(f, { template: { name: 'another-template', version: null } })
    refuses(f, `${mode}-source-mismatch`, /template identity/, withReader(f, mode === 'measure' ? f.po() : f.o()))
  }
})

test('source: a spec-pack home HTML reference stands in for a canonical source that cannot be read, and a different one does not', () => {
  for (const [html, accepted] of [[SOURCE_HTML, true], [OTHER_HTML, false]]) {
    const f = fixture({
      pages: [{ id: 'home', path: '/', file: 'index.html' }],
      specFiles: { 'reference.json': JSON.stringify({ kind: 'html', pages: [{ page: 'index.html', path: 'reference/index.html' }] }), 'reference/index.html': html }
    })
    relocate(f, { live: { [MOVED_HOME]: SOURCE_HTML } })
    if (accepted) assert.ok(runRelease(withReader(f, f.o()), quiet))
    else refuses(f, 'behaviour-source-mismatch', /whose home page is not the dossier's source/, withReader(f, f.o()))
  }
})

test('source: the spec-pack home HTML reference outranks the contract\'s source URL when that URL still answers — in both modes', () => {
  const withReference = (html, make) =>
    make({
      pages: [{ id: 'home', path: '/', file: 'index.html' }],
      specFiles: { 'reference.json': JSON.stringify({ kind: 'html', pages: [{ page: 'index.html', path: 'reference/index.html' }] }), 'reference/index.html': html }
    })
  for (const mode of ['behaviour', 'measure']) {
    const run = (f) => (mode === 'measure' ? f.po() : f.o())
    // the old URL now serves another site: unchanged relocated evidence still belongs to the dossier
    const kept = withReference(SOURCE_HTML, mode === 'measure' ? patchFixture : fixture)
    relocate(kept, { live: { [MOVED_HOME]: SOURCE_HTML, 'http://source.test/': OTHER_HTML } })
    assert.ok(runRelease(withReader(kept, run(kept)), quiet), `${mode}: accepted`)
    // both URLs serve the same foreign page: the evidence agrees with it, the spec-pack does not
    const foreign = withReference(SOURCE_HTML, mode === 'measure' ? patchFixture : fixture)
    relocate(foreign, { html: OTHER_HTML, live: { [MOVED_HOME]: OTHER_HTML, 'http://source.test/': OTHER_HTML } })
    refuses(foreign, `${mode}-source-mismatch`, /whose home page is not the dossier's source \(the spec-pack reference\)/, withReader(foreign, run(foreign)))
  }
})

test('source: the gate is held again at the acceptance just before the release is published — a source that changes while it is assembled aborts it', () => {
  const f = patchFixture()
  let reads = 0
  const o = f.po({ readSource: () => ({ ok: true, fingerprint: ++reads > 1 ? SOURCE_REBUILT : SOURCE_FP }) })
  assert.throws(() => runRelease(o, quiet), (e) => e instanceof AcceptanceError && e.problems.some((p) => p.code === 'measure-source-changed'))
  assert.equal(reads, 2)
  assert.ok(!existsSync(f.out), 'nothing is published')
})

test('patch: the runtime evidence and the contract bind are held exactly as the full gate holds them', () => {
  const restore = patchFixture()
  restore.restoreReport.ok = false
  restore.patch()
  patchRefuses(restore, 'restore-failed', undefined)
  const probe = patchFixture()
  probe.parityReport.access.http.euid = 0
  probe.patch()
  patchRefuses(probe, 'runtime-access', /http probe ran as uid 0/)
  const parity = patchFixture()
  parity.parityReport.routes[0].b = 500
  parity.patch()
  patchRefuses(parity, 'parity-failed', undefined)
  const stale = patchFixture()
  stale.parityReport.generatedAt = at(5)
  stale.patch()
  patchRefuses(stale, 'evidence-stale', /before the restore finished/)
  const other = patchFixture()
  other.restoreReport.binding.webrootArchive = 'f'.repeat(64)
  other.patch()
  patchRefuses(other, 'restore-mismatch', undefined)
  const nobind = patchFixture()
  patchRefuses(nobind, 'contract-bind-missing', undefined, { ...nobind.po(), contractBind: undefined })
  const unbound = patchFixture()
  unbound.bind.bound = false
  unbound.patch()
  patchRefuses(unbound, 'contract-bind-refused', undefined)
  const bound = patchFixture()
  bound.bindOverride = { themeZipSha256: 'a'.repeat(64) }
  bound.patch()
  patchRefuses(bound, 'contract-bind-theme-mismatch', undefined)
  // the status each parity route must answer comes from the spec-pack's page map, which a patch reads for that alone
  const nospec = patchFixture()
  patchRefuses(nospec, 'parity-expectation', /no route declarations/, nospec.po({ spec: undefined }))
})

test('patch: the full gate still requires its own evidence, and a patch needs none of it', () => {
  const f = patchFixture()
  const full = { ...f.o() }
  refuses(f, 'checkpoint-missing', undefined, { ...full, runRoot: undefined, visualLedger: undefined, checkpoint: undefined })
  // a patch reads no contract, but it does read the dossier: its finish audit is the dossier's port-audit.json
  assert.ok(acceptRelease(f.po()).fix)
  rmSync(f.runRoot, { recursive: true, force: true })
  refuses(f, 'audit-missing', /does not exist/, f.po())
})

test('patch: --changed-from records the theme files that differ, and warns — never refuses — when it looks like more than a fix', () => {
  const f = patchFixture()
  writeFileSync(f.themeZip, zipOf(f.zipAfter))
  f.m.themeZipSha256 = hex(readFileSync(f.themeZip))
  f.patch()
  f.age()
  const accepted = acceptRelease(f.po({ changedFrom: f.previousZip }))
  const c = accepted.fix.changedFrom
  assert.deepEqual([c.added, c.removed, c.changed], [['assets/new.js'], [], ['style.css']])
  assert.deepEqual(c.counts, { added: 1, removed: 0, changed: 1, structural: 0 })
  assert.equal(c.sha256, tag(readFileSync(f.previousZip)))
  assert.equal(c.matchesPrevious, true)
  assert.deepEqual(accepted.fix.warnings, [])
  const lines = []
  runRelease(f.po({ changedFrom: f.previousZip }), { state: { exists: false }, log: (l) => lines.push(l) })
  assert.equal(JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8')).changedFrom.changed[0], 'style.css')
  assert.ok(!lines.some((l) => /WARNING/.test(l)))

  // more than three templates/parts/patterns files: a warning, and the release is still accepted
  const wide = patchFixture()
  wide.zipBefore = { 'tracy-base/style.css': 'a' }
  wide.zipAfter = { 'tracy-base/style.css': 'a', 'tracy-base/templates/a.html': '1', 'tracy-base/templates/b.html': '1', 'tracy-base/parts/c.html': '1', 'tracy-base/patterns/d.php': '1' }
  writeFileSync(wide.themeZip, zipOf(wide.zipAfter))
  wide.m.themeZipSha256 = hex(readFileSync(wide.themeZip))
  wide.patch()
  wide.age()
  const w = []
  runRelease(wide.po({ changedFrom: wide.previousZip }), { state: { exists: false }, log: (l) => w.push(l) })
  assert.ok(w.some((l) => /^WARNING: 4 templates\/parts\/patterns files differ .*more than a fix/.test(l)), w.join('\n'))
  assert.equal(JSON.parse(readFileSync(path.join(wide.out, 'VERIFICATION.json'), 'utf8')).changedFrom.warnings.length, 1)

  // more than fifteen files overall
  const many = patchFixture()
  many.zipBefore = { 'tracy-base/style.css': 'a' }
  many.zipAfter = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`tracy-base/assets/f${i}.js`, String(i)]))
  writeFileSync(many.themeZip, zipOf(many.zipAfter))
  many.m.themeZipSha256 = hex(readFileSync(many.themeZip))
  many.patch()
  many.age()
  assert.match(acceptRelease(many.po({ changedFrom: many.previousZip })).fix.warnings.join('\n'), /17 theme files differ \(more than 15\)/)

  // nothing differs
  const same = patchFixture()
  writeFileSync(same.themeZip, zipOf(same.zipBefore))
  same.m.themeZipSha256 = hex(readFileSync(same.themeZip))
  same.patch()
  same.age()
  assert.match(acceptRelease(same.po({ changedFrom: same.previousZip })).fix.warnings.join('\n'), /changes nothing in the theme/)
})

test('patch: --changed-from must be the previous release\'s theme zip, and a zip', () => {
  const f = patchFixture()
  writeFileSync(f.themeZip, zipOf(f.zipAfter))
  f.m.themeZipSha256 = hex(readFileSync(f.themeZip))
  f.patch()
  const other = path.join(f.root, 'other.zip')
  writeFileSync(other, zipOf({ 'tracy-base/style.css': 'x' }))
  patchRefuses(f, 'changed-from-mismatch', /the theme zip the previous release records/, f.po({ changedFrom: other }))
  const notZip = path.join(f.root, 'not.zip')
  writeFileSync(notZip, 'plain text')
  patchRefuses(f, 'changed-from-invalid', /not a zip/, f.po({ changedFrom: notZip }))
})

test('patch: release-notes.md is written whole from the measure and never holds a placeholder; an existing file is kept', () => {
  const f = patchFixture()
  const done = runRelease(f.po(), quiet)
  const notes = readFileSync(path.join(f.out, 'release-notes.md'), 'utf8')
  assert.equal(done.placeholders, false)
  assert.doesNotMatch(notes, /\{\{/)
  assert.match(notes, /^## Tracy Base \/ WordPress 7 1\.0\.0\n/)
  assert.match(notes, /### Fixed in 1\.0\.0\n\n- The header does not wrap at 1023\n- No sideways overflow at 1024\n/)
  assert.match(notes, /A fix release of 0\.9\.0/)
  assert.match(notes, new RegExp(`${N_CHECKS}/${N_CHECKS} targeted checks pass on a clean restore of this pack; on 0\\.9\\.0 ${N_CHECKS - 1}/${N_CHECKS} passed`))
  assert.match(notes, /Home 4 dark logo — the source picture is a 404/)
  assert.match(notes, /1\/1 routes answer their declared status/)
  // kept on a re-run (notes written by hand survive), also when the file is the old template
  writeFileSync(path.join(f.out, 'release-notes.md'), 'written by hand')
  runRelease(f.po(), quiet)
  assert.equal(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), 'written by hand')
})

test('both modes finish without a publish command and the CLI exits 1 while release-notes.md holds a {{placeholder}}', async () => {
  const lines = []
  const full = fixture()
  const first = runRelease(full.o(), { state: { exists: false }, log: (l) => lines.push(l) })
  assert.equal(first.placeholders, true)
  assert.match(lines.join('\n'), /release-notes\.md still has \{\{placeholders\}\}/)
  assert.ok(!lines.some((l) => /Publish \(not run by this tool\)/.test(l)))
  assert.ok(existsSync(path.join(full.out, 'SHA256SUMS')), 'the release is written; its notes are filled in place')
  writeFileSync(path.join(full.out, 'release-notes.md'), 'filled in {{ONE_LINE}}')
  assert.equal(runRelease(full.o(), quiet).placeholders, true, 'kept notes are checked too')
  writeFileSync(path.join(full.out, 'release-notes.md'), 'filled in')
  assert.equal(runRelease(full.o(), quiet).placeholders, false)
  // patch mode: notes the person kept with a placeholder
  const f = patchFixture()
  runRelease(f.po(), quiet)
  writeFileSync(path.join(f.out, 'release-notes.md'), 'TODO {{what}}')
  const kept = []
  assert.equal(runRelease(f.po(), { state: { exists: false }, log: (l) => kept.push(l) }).placeholders, true)
  assert.ok(!kept.some((l) => /Publish \(not run by this tool\)/.test(l)))
  // the command line: exit 1 on the first full run (the template), 2 for a missing patch flag
  const tool = path.join(HERE, '..', 'quickstart', 'release.mjs')
  const source = await startSource(SOURCE_HTML)
  after(() => source.stop())
  const cli = fixture({ sourceSite: source.url })
  const flags = ['--pack', cli.pack, '--out', cli.out, '--parity', cli.parity, '--restore-report', cli.restore, '--run-root', cli.runRoot, '--spec', cli.spec, '--theme-zip', cli.themeZip, '--visual-ledger', cli.ledger, '--checkpoint', cli.line.run, '--contract-bind', cli.contractBind]
  const noPass = spawnSync('node', [tool, ...flags], { encoding: 'utf8' })
  assert.equal(noPass.status, 1, 'a first release without the behaviour pass is refused')
  assert.match(noPass.stderr, /\[behaviour-pass-missing\].*Next step/s)
  assert.ok(!existsSync(cli.out))
  const run = spawnSync('node', [tool, ...flags, '--behaviour-sweep', cli.sweepFile], { encoding: 'utf8' })
  assert.equal(run.status, 1, run.stderr)
  assert.match(run.stdout, /still has \{\{placeholders\}\}/)
  const p = patchFixture()
  const patchFlags = ['--pack', p.pack, '--out', p.out, '--parity', p.parity, '--restore-report', p.restore, '--spec', p.spec, '--run-root', p.runRoot, '--theme-zip', p.themeZip, '--contract-bind', p.contractBind, '--patch']
  const noPrev = spawnSync('node', [tool, ...patchFlags, '--measure', p.measureFile], { encoding: 'utf8' })
  assert.equal(noPrev.status, 2, noPrev.stderr)
  assert.match(noPrev.stderr, /--previous is required with --patch/)
  const noMeasure = spawnSync('node', [tool, ...patchFlags, '--previous', p.previousFile], { encoding: 'utf8' })
  assert.equal(noMeasure.status, 2)
  const refused = spawnSync('node', [tool, ...patchFlags, '--previous', p.previousFile, '--measure', path.join(p.root, 'gone.json')], { encoding: 'utf8' })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /\[measure-unreadable\]/)
  assert.ok(!existsSync(p.out))
})

// ---------------------------------------------------------------- the finish audit (docs/follow-ups/audit-gates.md §1), both modes
const AUDIT = 'port-audit.json'
const touchLater = (file, ms = 5000) => utimesSync(file, new Date(Date.now() + ms), new Date(Date.now() + ms))

test('audit: a full release needs a clean, current receipt of its own dossier, bound to the four tiers\' interaction records — each refusal by its own code', () => {
  const f = fixture()
  assert.ok(acceptRelease(f.o()).acceptance.audit.sha256.startsWith('sha256:'), 'the acceptance records the receipt it stood on')
  // no receipt
  rmSync(path.join(f.runRoot, AUDIT))
  refuses(f, 'audit-missing', /port-audit\.mjs --dossier/)
  // not clean, another site, a route the page map declares that the audit did not cover
  f.write()
  const edit = (fn) => {
    const doc = JSON.parse(readFileSync(path.join(f.runRoot, AUDIT), 'utf8'))
    fn(doc)
    writeFileSync(path.join(f.runRoot, AUDIT), JSON.stringify(doc))
  }
  edit((d) => { d.ok = false; d.blocking = 1; d.checks['cms-leftovers'].ok = false })
  refuses(f, 'audit-not-clean', /cms-leftovers/)
  f.write()
  edit((d) => { d.receipt.site = 'http://elsewhere'; d.site = 'http://elsewhere' })
  refuses(f, 'audit-site', /http:\/\/elsewhere/)
  f.write()
  edit((d) => { d.receipt.routes = ['/other'] })
  refuses(f, 'audit-routes', /does not cover 1 route/)
  // made before DECISIONS.md was touched (bytes unchanged)
  f.write()
  touchLater(path.join(f.runRoot, 'DECISIONS.md'))
  refuses(f, 'audit-stale', /DECISIONS\.md was written/)
  // a receipt made for another dossier whose files have the same names
  const other = fixture()
  writeFileSync(path.join(other.runRoot, 'DECISIONS.md'), '- D-1: another port\n')
  other.write()
  const g = fixture()
  writeFileSync(path.join(g.runRoot, AUDIT), readFileSync(path.join(other.runRoot, AUDIT)))
  refuses(g, 'audit-inputs', /DECISIONS\.md is sha256:/)
  // interaction.json absent in one tier, and one that left an owed case unmeasured in another
  const h = fixture()
  rmSync(path.join(h.dir('dark-desktop'), 'interaction.json'))
  refuses(h, 'audit-interaction-missing', /interaction\.json does not exist/)
  const k = fixture()
  const file = path.join(k.dir('light-responsive'), 'interaction.json')
  const rec = JSON.parse(readFileSync(file, 'utf8'))
  rec.coverage.find((c) => c.check === 'form').measured = false
  writeFileSync(file, JSON.stringify(rec))
  cleanAudit({ dossier: k.runRoot, site: 'http://b', source: 'http://source.test', routes: ['/'], runs: Object.keys(k.reports).map((s) => k.dir(s)) })
  refuses(k, 'audit-interaction', /form \/ 1440px was owed and NOT measured/)
  // a symlinked DECISIONS.md or an oversize receipt never gets read
  const m = fixture()
  rmSync(path.join(m.runRoot, 'DECISIONS.md'))
  symlinkSync(path.join(m.root, 'spec', 'page-map.json'), path.join(m.runRoot, 'DECISIONS.md'))
  refuses(m, 'audit-input-unsafe', /DECISIONS\.md is a symbolic link/)
})

test('a fix release names its theme zip after the theme and keeps the zip it was given whatever its file name or mtime', () => {
  const f = patchFixture()
  const renamed = path.join(path.dirname(f.themeZip), 'build-output.zip')
  writeFileSync(renamed, readFileSync(f.themeZip))
  touchLater(renamed)
  const done = acceptRelease({ ...f.po(), themeZip: renamed })
  assert.equal(done.themeName, `${done.manifest.theme.name}-${done.manifest.theme.version}.zip`)
  assert.ok(done.files.has(done.themeName))
})

test('audit: a fix release (--patch) needs a clean current receipt of its dossier bound to the theme zip and the restored site — made after the restore', () => {
  const f = patchFixture()
  const done = acceptRelease(f.po())
  assert.equal(done.acceptance.audit.scope, 'patch')
  assert.equal(done.acceptance.audit.file, AUDIT)
  rmSync(path.join(f.runRoot, AUDIT))
  patchRefuses(f, 'audit-missing')
  // a receipt of the full kind (four-tier interaction records) is not a fix receipt
  const full = fixture()
  writeFileSync(path.join(f.runRoot, AUDIT), readFileSync(path.join(full.runRoot, AUDIT)))
  patchRefuses(f, 'audit-scope')
  // another theme zip than the one released
  f.patch()
  writeFileSync(f.themeZip, 'another-theme-bytes')
  f.age()
  patchRefuses(f, 'audit-theme', /the audit was made for theme sha256:/)
  // the theme zip rewritten after the audit (same bytes would still be later), DECISIONS.md touched, another site
  const g = patchFixture()
  touchLater(path.join(g.runRoot, 'DECISIONS.md'))
  patchRefuses(g, 'audit-stale', /DECISIONS\.md was written/)
  const h = patchFixture()
  cleanAudit({ dossier: h.runRoot, site: 'http://not-the-restored-site', routes: ['/'], theme: tag(readFileSync(h.themeZip)) })
  patchRefuses(h, 'audit-site', /not-the-restored-site/)
  // an audit made before the restore finished measured another site state
  const k = patchFixture()
  cleanAudit({ dossier: k.runRoot, site: 'http://b', routes: ['/'], theme: tag(readFileSync(k.themeZip)), at: at(5) })
  patchRefuses(k, 'audit-stale', /before the measurement it must follow/)
  // not clean
  const m = patchFixture()
  cleanAudit({ dossier: m.runRoot, site: 'http://b', routes: ['/'], theme: tag(readFileSync(m.themeZip)), ok: false, checks: { 'cms-leftovers': { ok: false } } })
  patchRefuses(m, 'audit-not-clean', /cms-leftovers/)
  // the CLI: --run-root is required with --patch
  const p = patchFixture()
  const tool = path.join(HERE, '..', 'quickstart', 'release.mjs')
  const noRoot = spawnSync('node', [tool, '--pack', p.pack, '--out', p.out, '--parity', p.parity, '--restore-report', p.restore, '--spec', p.spec, '--theme-zip', p.themeZip, '--contract-bind', p.contractBind, '--patch', '--previous', p.previousFile, '--measure', p.measureFile], { encoding: 'utf8' })
  assert.equal(noRoot.status, 2)
  assert.match(noRoot.stderr, /--run-root is required with --patch/)
})

test('audit: a fix release is clean on SITE-FACING findings only — the bookkeeping classes are advisories, recorded in VERIFICATION.json and warned about', () => {
  const f = patchFixture()
  const theme = tag(readFileSync(f.themeZip))
  // 811 acceptance rows that cite no decision and 13 decisions without a substitution do not make a fix release unclean
  cleanAudit({ dossier: f.runRoot, site: 'http://b', routes: ['/'], theme, checks: { decisions: { ok: false, blocking: 13 }, exceptions: { ok: false, errors: new Array(811).fill('row') } } })
  const lines = []
  const done = runRelease(f.po(), { state: { exists: false }, log: (l) => lines.push(l) })
  assert.deepEqual(JSON.parse(readFileSync(path.join(done.out, 'VERIFICATION.json'), 'utf8')).acceptance.audit.advisories, { decisions: 13, exceptions: 811 })
  assert.ok(lines.some((l) => /^WARNING: 811 acceptance row\(s\) \/ 13 decision\(s\) do not validate; a full release of this port needs migrate-port first/.test(l)), lines.join('\n'))
  // a site-facing finding still refuses, whatever the paperwork says
  for (const check of ['cms-leftovers', 'behavior-copy']) {
    const g = patchFixture()
    cleanAudit({ dossier: g.runRoot, site: 'http://b', routes: ['/'], theme: tag(readFileSync(g.themeZip)), ok: false, checks: { [check]: { ok: false } } })
    patchRefuses(g, 'audit-not-clean', new RegExp(check))
  }
  // the FULL gate keeps every class: a failed decisions check refuses a full release
  const full = fixture()
  cleanAudit({ dossier: full.runRoot, site: 'http://b', source: 'http://source.test', routes: ['/'], runs: Object.keys(full.reports).map((s) => full.dir(s)).filter((d) => d && existsSync(d)), pages: ['/'], ok: false, checks: { decisions: { ok: false } } })
  refuses(full, 'audit-not-clean', /decisions/)
})

test('patch: a release reads nothing from the dossier but what the audit binds — stale or absent design / visual contracts do not matter', () => {
  const f = patchFixture()
  // the contracts are gone from the dossier, and one that remains would be stale against the spec-pack
  rmSync(path.join(f.runRoot, CANONICAL.design))
  // (the routes and the source the measure is held to still come from it: a measure's scope is read from the visual contract)
  writeFileSync(path.join(f.runRoot, CANONICAL.visual), JSON.stringify({ schemaVersion: 1, id: 'stale', source: { site: 'http://source.test' }, pages: [{ id: 'home', path: '/', status: 200 }], bindings: { specHash: `sha256:${'0'.repeat(64)}` } }))
  cleanAudit({ dossier: f.runRoot, site: 'http://b', routes: ['/'], theme: tag(readFileSync(f.themeZip)) })
  const done = acceptRelease(f.po())
  assert.equal(done.acceptance.audit.scope, 'patch')
  // and no contract problem is raised for the same dossier, even with no spec-pack named
  assert.doesNotThrow(() => acceptRelease({ ...f.po(), spec: f.spec }))
  // the full release of the very same dossier does refuse on its contracts
  const full = fixture()
  rmSync(path.join(full.runRoot, CANONICAL.design))
  cleanAudit({ dossier: full.runRoot, site: 'http://b', source: 'http://source.test', routes: ['/'], runs: Object.keys(full.reports).map((s) => full.dir(s)).filter((d) => d && existsSync(d)), pages: ['/'] })
  refuses(full, 'contract-missing')
})

// ---------------------------------------------------------------- the patch chain (baseline per check, previous prefix, metadata)
const perCheckBaseline = (f, given = f.m.checks.map((c) => ({ id: c.id, pass: c.id !== 'A1' }))) => {
  // the sweep's own checks ran on the previous version too, unless the test says otherwise
  const checks = [...given, ...ALL_CHECKS.filter((id) => !given.some((c) => c.id === id) && !given.some((c) => c.id === 'Z1')).map((id) => ({ id, pass: true }))]
  f.m.baseline = { version: '0.9.0', passed: checks.filter((c) => c.pass).length, total: checks.length, ranAt: at(-5), checks, sourceFingerprint: SOURCE_FP }
  return f
}
/** The theme zip as a real zip (its style.css carries `version`), the measure rebound to it. */
const withThemeVersion = (f, version) => {
  writeFileSync(f.themeZip, zipOf({ 'tracy-base/style.css': `/*\nTheme Name: Tracy Base\nVersion: ${version}\n*/` }))
  f.m.themeZipSha256 = hex(readFileSync(f.themeZip))
  return f.patch()
}

test('patch: the baseline is held per check — a check is in the baseline by id or declared new with a why; none may disappear; one shared check must have failed', () => {
  // a port script adds checks the previous version never ran: declared new, the release is accepted
  const ok = perCheckBaseline(patchFixture())
  ok.m.checks.push({ id: 'W1', title: 'The wording is the source\'s', pass: true, cases: 7, defects: 0, new: true, why: 'the port script added it in 0.9.1' })
  ok.patch()
  const done = acceptRelease(ok.po())
  assert.equal(done.fix.measure.total, N_CHECKS + 1)
  assert.equal(done.fix.baseline.checks.length, N_CHECKS)
  // the same check without the declaration, or declared without a baseline that lacks it
  const undeclared = perCheckBaseline(patchFixture())
  undeclared.m.checks.push({ id: 'W1', title: 'Wording', pass: true })
  undeclared.patch()
  patchRefuses(undeclared, 'measure-baseline-undeclared', /not in the baseline on 0\.9\.0 and are not declared new: W1/, undeclared.po())
  const claimed = perCheckBaseline(patchFixture())
  claimed.m.checks[0] = { ...claimed.m.checks[0], new: true, why: 'it is new' }
  claimed.patch()
  patchRefuses(claimed, 'measure-baseline-mismatch', /declared new but the baseline on 0\.9\.0 ran them: A1/, claimed.po())
  // a check of the baseline that the measure no longer has
  const dropped = perCheckBaseline(patchFixture(), [{ id: 'A1', pass: false }, { id: 'B1', pass: true }, { id: 'C1', pass: true }])
  dropped.patch()
  patchRefuses(dropped, 'measure-baseline-dropped', /C1.*cannot silently disappear/, dropped.po())
  // the checks that ran on both versions all passed before: the new ones prove nothing about the fix
  const passed = perCheckBaseline(patchFixture(), [{ id: 'A1', pass: true }, { id: 'B1', pass: true }])
  passed.m.checks.push({ id: 'W1', title: 'Wording', pass: true, new: true, why: 'added in 0.9.1' })
  passed.patch()
  patchRefuses(passed, 'measure-baseline-passed', /no check that ran on 0\.9\.0 failed there/, passed.po())
  // a failing baseline check that is not in the measure does not count as a check that failed in both
  const onlyNew = perCheckBaseline(patchFixture(), [{ id: 'Z1', pass: false }])
  onlyNew.m.checks = onlyNew.m.checks.map((c) => ({ ...c, new: true, why: 'renamed' }))
  onlyNew.patch()
  const r = refusal(onlyNew, onlyNew.po())
  assert.ok(r.codes.includes('measure-baseline-dropped') && r.codes.includes('measure-baseline-passed'), r.text)
  // a baseline of counts only keeps the count rule and cannot declare new checks
  const counts = patchFixture()
  counts.m.checks.push({ id: 'W1', title: 'Wording', pass: true })
  counts.patch()
  patchRefuses(counts, 'measure-baseline-mismatch', new RegExp(`baseline ran ${N_CHECKS} check\\(s\\), the measure ${N_CHECKS + 1}.*fix-measure\\.mjs merge --baseline-measure`), counts.po())
  const countsNew = patchFixture()
  countsNew.m.checks.push({ id: 'W1', title: 'Wording', pass: true, new: true, why: 'added' })
  countsNew.m.baseline.total = N_CHECKS + 1
  countsNew.patch()
  patchRefuses(countsNew, 'measure-baseline-mismatch', /lists no checks, so a check cannot be declared new/, countsNew.po())
})

test('patch: --previous whose release lacks the manifest id\'s quickstart/ prefix is accepted once, with a note and a record; any other mismatch is still refused', () => {
  const f = patchFixture({ id: 'quickstart/tracy-base/wp7' })
  f.prev.release = 'tracy-base/wp7'
  f.patch()
  writeFileSync(f.previousFile, JSON.stringify(f.prev))
  const lines = []
  runRelease(f.po(), { state: { exists: false }, log: (l) => lines.push(l) })
  assert.ok(lines.some((l) => /^note: --previous names its release tracy-base\/wp7, the manifest id is quickstart\/tracy-base\/wp7: the quickstart\/ prefix is the only difference/.test(l)), lines.join('\n'))
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.deepEqual(v.previous.normalised, { release: { from: 'tracy-base/wp7', to: 'quickstart/tracy-base/wp7' } })
  assert.equal(v.previous.release, 'tracy-base/wp7', 'what the previous release says of itself stays verbatim')
  // the same id, or the prefix on the previous side only, records nothing
  const same = patchFixture({ id: 'quickstart/tracy-base/wp7' })
  same.prev.release = 'quickstart/tracy-base/wp7'
  same.patch()
  writeFileSync(same.previousFile, JSON.stringify(same.prev))
  assert.equal(acceptRelease(same.po()).fix.previous.normalised, undefined)
  // every other difference is a mismatch: another port, the prefix of another namespace, the prefix the wrong way round
  for (const release of ['other/wp7', 'x/tracy-base/wp7', 'quickstart/other/wp7']) {
    const g = patchFixture({ id: 'quickstart/tracy-base/wp7' })
    g.prev.release = release
    g.patch()
    writeFileSync(g.previousFile, JSON.stringify(g.prev))
    patchRefuses(g, 'previous-mismatch', new RegExp(`release of ${release}`), g.po())
  }
  const rev = patchFixture()
  rev.prev.release = 'quickstart/tracy-base/wp7'
  rev.patch()
  writeFileSync(rev.previousFile, JSON.stringify(rev.prev))
  patchRefuses(rev, 'previous-mismatch', /release of quickstart\/tracy-base\/wp7, this pack is tracy-base\/wp7/, rev.po())
})

test('release: an --out that holds only release-notes.md is an empty target and the notes are kept; --force-notes puts the template back', () => {
  const f = patchFixture()
  mkdirSync(f.out)
  writeFileSync(path.join(f.out, 'release-notes.md'), 'written ahead of the first run')
  const done = runRelease(f.po(), quiet)
  assert.equal(done.notes, true)
  assert.equal(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), 'written ahead of the first run')
  assert.ok(existsSync(path.join(f.out, 'SHA256SUMS')))
  const forced = patchFixture()
  mkdirSync(forced.out)
  writeFileSync(path.join(forced.out, 'release-notes.md'), 'old')
  runRelease(forced.po({ forceNotes: true }), quiet)
  assert.match(readFileSync(path.join(forced.out, 'release-notes.md'), 'utf8'), /### Fixed in/)
  // the notes file next to anything else is still not a release
  const other = patchFixture()
  mkdirSync(other.out)
  writeFileSync(path.join(other.out, 'release-notes.md'), 'x')
  writeFileSync(path.join(other.out, 'mine.txt'), 'y')
  assert.throws(() => runRelease(other.po(), quiet), /\[output-not-release\]/)
  // a directory called release-notes.md is not notes
  const dir = patchFixture()
  mkdirSync(path.join(dir.out, 'release-notes.md'), { recursive: true })
  assert.throws(() => runRelease(dir.po(), quiet), /\[output-not-release\]/)
})

const settingOf = (extra = {}) => ({
  schemaVersion: 'tracy-setting/v1', platform: 'wordpress', label: 'Tracy Base', version: '0.9.0', cms: '7.1.2',
  install: { webroot: { file: 'old-webroot-0.9.0.tar.gz', sha256: '0'.repeat(64) }, database: { file: 'old-database-0.9.0.sql.gz', sha256: '1'.repeat(64) } },
  template: 'tracy-base', ...extra
})

test('release: --setting-template writes tracy_setting.json (version, archives, hashes), --card is copied byte for byte, the measure travels as fix-measure.json; all in SHA256SUMS, the setting uploaded last', () => {
  const f = patchFixture()
  const template = path.join(f.root, 'published-setting.json')
  const card = path.join(f.root, 'card.json')
  const cardBytes = '{"schemaVersion":"tracy-design-inspiration/v1",\n  "template":"tracy-base",  "x":[1,2]}'
  writeFileSync(template, JSON.stringify(settingOf(), null, 2) + '\n')
  writeFileSync(card, cardBytes)
  const lines = []
  runRelease(f.po({ settingTemplate: template, card }), { state: { exists: true }, log: (l) => lines.push(l) })
  const read = (n) => readFileSync(path.join(f.out, n), 'utf8')
  const wanted = {
    ...settingOf({ cms: f.manifest.wpVersion }),
    version: '1.0.0',
    install: { webroot: { file: f.manifest.webroot.file, sha256: f.manifest.webroot.sha256 }, database: { file: f.manifest.database.file, sha256: f.manifest.database.sha256 } }
  }
  assert.equal(read('tracy_setting.json'), JSON.stringify(wanted, null, 2) + '\n')
  assert.deepEqual(Object.keys(JSON.parse(read('tracy_setting.json'))), Object.keys(settingOf()), 'the template\'s order is kept')
  assert.equal(read('tracy_design_inspiration.json'), cardBytes)
  assert.equal(read('fix-measure.json'), readFileSync(f.measureFile, 'utf8'))
  const sums = read('SHA256SUMS')
  for (const n of ['tracy_setting.json', 'tracy_design_inspiration.json', 'fix-measure.json']) assert.ok(sums.includes(`${hex(readFileSync(path.join(f.out, n)))}  ${n}\n`), n)
  assert.ok(JSON.parse(read('manifest.json')).assets.includes('tracy_setting.json'))
  const uploads = lines.filter((l) => l.startsWith('  gh release upload'))
  assert.match(uploads.at(-1), /'[^']*tracy_setting\.json'$/)
  assert.equal(uploads.filter((l) => l.includes('tracy_setting.json')).length, 1, 'the setting has a command of its own')
  // a re-run on the release it wrote still holds (the earlier release is replaced, not refused)
  runRelease(f.po({ settingTemplate: path.join(f.out, 'tracy_setting.json'), card }), quiet)
  assert.equal(read('tracy_setting.json'), JSON.stringify(wanted, null, 2) + '\n')
  // the measure is copied without any flag, the other two only with theirs
  const bare = patchFixture()
  runRelease(bare.po(), quiet)
  assert.deepEqual(readdirSync(bare.out).sort(), ['README.md', 'SHA256SUMS', 'VERIFICATION.json', 'fix-measure.json', 'manifest.json', 'release-notes.md', 'tracy-base-1.0.0.zip', 'tracy-base-wp7-database-1.0.0.sql.gz', 'tracy-base-wp7-webroot-1.0.0.tar.gz'])
  // the full gate takes the same two flags
  const full = fixture()
  writeFileSync(template, JSON.stringify(settingOf(), null, 2) + '\n')
  runRelease({ ...full.o(), settingTemplate: template, card }, quiet)
  assert.equal(JSON.parse(readFileSync(path.join(full.out, 'tracy_setting.json'), 'utf8')).install.webroot.sha256, full.manifest.webroot.sha256)
  assert.equal(readFileSync(path.join(full.out, 'tracy_design_inspiration.json'), 'utf8'), cardBytes)
  assert.ok(!existsSync(path.join(full.out, 'fix-measure.json')))
})

test('release: a setting template or card of another port, or one that cannot be read, is refused by name; WordPress version is taken from the manifest', () => {
  const cases = [
    [settingOf({ template: 'someone-else' }), undefined, /--setting-template is of template "someone-else", this pack is tracy-base\/wp7 \(tracy-base\)/],
    [settingOf({ platform: 'joomla' }), undefined, /--setting-template is of platform "joomla"/],
    [{ ...settingOf(), install: undefined }, undefined, /no install\.webroot \/ install\.database/],
    ['not json', undefined, /--setting-template is not valid JSON/],
    [undefined, '{"template":"someone-else"}', /--card is of template "someone-else"/],
    [undefined, '[1]', /--card is not a JSON object/],
    [undefined, 'nope', /--card is not valid JSON/]
  ]
  for (const [setting, card, pattern] of cases) {
    const f = patchFixture()
    const o = {}
    if (setting !== undefined) {
      o.settingTemplate = path.join(f.root, 's.json')
      writeFileSync(o.settingTemplate, typeof setting === 'string' ? setting : JSON.stringify(setting))
    }
    if (card !== undefined) {
      o.card = path.join(f.root, 'c.json')
      writeFileSync(o.card, card)
    }
    patchRefuses(f, 'metadata-invalid', pattern, f.po(o))
  }
  const gone = patchFixture()
  patchRefuses(gone, 'metadata-invalid', /--card/, gone.po({ card: path.join(gone.root, 'gone.json') }))
  const wp = patchFixture()
  const template = path.join(wp.root, 's.json')
  writeFileSync(template, JSON.stringify(settingOf({ cms: '6.0.0' })))
  const lines = []
  runRelease(wp.po({ settingTemplate: template }), { state: { exists: false }, log: (l) => lines.push(l) })
  assert.equal(JSON.parse(readFileSync(path.join(wp.out, 'tracy_setting.json'), 'utf8')).cms, wp.manifest.wpVersion)
  assert.ok(lines.some((l) => /^note: tracy_setting\.json: cms 6\.0\.0 → /.test(l)))
  // an --asset of the same name is a second asset, not a silent override
  const dup = patchFixture()
  const asset = path.join(dup.root, 'tracy_setting.json')
  writeFileSync(asset, '{}')
  writeFileSync(template, JSON.stringify(settingOf()))
  patchRefuses(dup, 'unsafe-file', /the release writes tracy_setting\.json itself \(from --setting-template\)/, dup.po({ asset: [asset], settingTemplate: template }))
})

test('patch: a reminder is printed with the publish commands when the theme zip\'s version is not higher than the previous release\'s', () => {
  const run = (version) => {
    const f = withThemeVersion(patchFixture(), version)
    const lines = []
    runRelease(f.po(), { state: { exists: false }, log: (l) => lines.push(l) })
    return lines
  }
  const same = run('0.9.0')
  const at = same.findIndex((l) => /Publish \(not run/.test(l))
  assert.ok(at >= 0)
  assert.ok(same.slice(at).some((l) => /REMINDER: the theme zip's style\.css says Version: 0\.9\.0, not higher than 0\.9\.0, the previous release's.*bump the theme version/.test(l)), same.join('\n'))
  assert.ok(run('0.8.9').some((l) => /REMINDER.*Version: 0\.8\.9/.test(l)))
  assert.ok(!run('1.0.0').some((l) => /REMINDER/.test(l)))
  // a zip whose version cannot be read says so instead of staying silent
  const raw = patchFixture()
  const lines = []
  runRelease(raw.po(), { state: { exists: false }, log: (l) => lines.push(l) })
  assert.ok(lines.some((l) => /REMINDER: the theme version could not be read from style\.css/.test(l)))
})

test('patch: --baseline-version names the theme version the baseline ran on when it is not the previous release version', () => {
  const f = patchFixture()
  f.m.baseline = { ...f.m.baseline, version: '0.8.5' }
  f.patch()
  patchRefuses(f, 'measure-baseline-mismatch', /version 0\.8\.5, the previous release is 0\.9\.0/)
  runRelease(f.po({ baselineVersion: '0.8.5' }), quiet)
  assert.equal(JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8')).baseline.version, '0.8.5')
  const g = patchFixture()
  g.m.baseline = { ...g.m.baseline, version: '0.8.5' }
  g.patch()
  patchRefuses(g, 'measure-baseline-mismatch', /the previous release is 0\.8\.0/, g.po({ baselineVersion: '0.8.0' }))
})

test('release: a webroot archive whose wp-config.php is not the accepted form is refused, naming the archive, the file and the line', () => {
  const proxyBlock = /if \(isset\(\$_SERVER\['HTTP_X_FORWARDED_PROTO'\][\s\S]*?\n}\n/
  const name = /tracy-base-wp7-webroot-1\.0\.0\.tar\.gz wp-config\.php differs from the accepted form at line \d+/
  const cases = [
    acceptedConfig.replace(proxyBlock, ''),
    acceptedConfig.replace("'utf8mb4'", "'utf8'"),
    acceptedConfig.replace('<?php\n', '<?php\n// edited\n'),
    acceptedConfig.replace(proxyBlock, (m) => `if (false):\n${m}endif;\n`),
    acceptedConfig.replace(proxyBlock, (m) => `if (true) { return; }\n${m}`),
    `${acceptedConfig}phpinfo();\n`
  ]
  for (const config of cases) {
    assert.notEqual(config, acceptedConfig)
    const f = fixture()
    f.writePack(webrootTar({ 'wp-config.php': config }))
    refuses(f, 'pack-invalid', name)
  }
  // an archive that cannot be read, or holds no wp-config.php, is one named problem
  const broken = fixture()
  broken.writePack('webroot-bytes')
  refuses(broken, 'pack-invalid', /the webroot archive cannot be read/)
  const none = fixture()
  none.writePack(webrootTar({ 'wp-config.php': null }))
  refuses(none, 'pack-invalid', /wp-config\.php missing from the archive/)
  // line endings and the site's own values are not differences
  const own = acceptedConfig.replace(/\n/g, '\r\n').replace("'tr_'", "'site9_'")
  const ok = fixture()
  ok.writePack(webrootTar({ 'wp-config.php': own }))
  assert.ok(!refusal(ok).codes.includes('pack-invalid'), 'only the bindings of the measured pack differ')
  assert.ok(acceptRelease(fixture().o()))
})

test('release: the archive is held to restore\'s member rule before wp-config.php is read — a lone ./wp-config.php, a non-canonical path, a duplicate, a link and a file under a file are refused as restore refuses them', () => {
  const stray = Buffer.concat([Buffer.from(acceptedConfig.replace("'tr_'", "'tr_")), Buffer.from([0xff]), Buffer.from("';\n" + acceptedConfig.slice(acceptedConfig.indexOf('\n', acceptedConfig.indexOf('$table_prefix')) + 1))])
  const other = `${acceptedConfig}// other\n`
  const cases = [
    [{ 'wp-config.php': null, './wp-config.php': acceptedConfig }, /unsafe path "\.\/wp-config\.php"/],
    [{ 'wp-config.php': acceptedConfig, 'a/../readme.txt': 'x' }, /unsafe path "a\/\.\.\/readme\.txt"/],
    [{ 'wp-config.php': acceptedConfig, '././wp-config.php': other }, /unsafe path "\.\/\.\/wp-config\.php"/],
    [{ 'wp-config.php': acceptedConfig, 'a/../wp-config.php': other }, /unsafe path "a\/\.\.\/wp-config\.php"/],
    [{ 'wp-config.php': acceptedConfig, 'a/b/../../wp-config.php': other }, /unsafe path/],
    [{ 'wp-config.php': acceptedConfig, 'a.txt': 'x', 'a.txt/': 'y' }, /duplicate a\.txt/],
    [{ 'wp-config.php': acceptedConfig, 'link': { type: '2', linkname: 'wp-config.php' } }, /symlink link/],
    [{ 'wp-config.php': acceptedConfig, 'f.txt': 'x', 'f.txt/inner.txt': 'y' }, /f\.txt\/inner\.txt is below f\.txt, which is not a directory/],
    [{ 'wp-config.php': null, 'dir/': { type: '5' } }, /wp-config\.php missing from the archive/],
    [{ 'wp-config.php': stray }, /wp-config\.php is not valid UTF-8/]
  ]
  for (const [files, pattern] of cases) {
    const f = fixture()
    f.writePack(webrootTar(files))
    refuses(f, 'pack-invalid', pattern)
  }
})

const TRACY_JSON = { 'tracy_design_inspiration.json': '{"template":"tracy-base","x":1}', 'tracy_other.json': '{"schema":"tracy-other/v1"}\n' }

/** A patch fixture whose previous release directory also holds the port's setting, card and one more metadata file. */
function carriedFixture() {
  const f = patchFixture()
  const prevDir = path.dirname(f.previousFile)
  writeFileSync(path.join(prevDir, 'tracy_setting.json'), JSON.stringify({ ...settingOf(), extra: { keep: 'me' } }, null, 2) + '\n')
  for (const [n, t] of Object.entries(TRACY_JSON)) writeFileSync(path.join(prevDir, n), t)
  f.sealPrevious()
  f.prevDir = prevDir
  f.carried = (extra = {}) => f.po({ previous: prevDir, settingTemplate: path.join(prevDir, 'tracy_setting.json'), card: path.join(prevDir, 'tracy_design_inspiration.json'), asset: [path.join(prevDir, 'tracy_other.json')], ...extra })
  return f
}

test('patch: a metadata file of the previous release that this release would not carry is refused by name; carried, every file written is in SHA256SUMS once', () => {
  const f = carriedFixture()
  const r = refusal(f, f.po({ previous: f.prevDir }))
  assert.ok(r.codes.includes('metadata-missing'))
  for (const n of ['tracy_setting.json', 'tracy_design_inspiration.json', 'tracy_other.json']) assert.match(r.text, new RegExp(n))
  assert.ok(!existsSync(f.out))
  runRelease(f.carried(), quiet)
  for (const [n, t] of Object.entries(TRACY_JSON)) assert.equal(readFileSync(path.join(f.out, n), 'utf8'), t, `${n} is carried unchanged`)
  const setting = JSON.parse(readFileSync(path.join(f.out, 'tracy_setting.json'), 'utf8'))
  assert.equal(setting.version, f.manifest.version)
  assert.deepEqual(setting.extra, { keep: 'me' }, 'the other fields of the setting stay')
  const lines = readFileSync(path.join(f.out, 'SHA256SUMS'), 'utf8').trim().split('\n')
  const written = readdirSync(f.out).filter((n) => n !== 'SHA256SUMS').sort()
  assert.ok(written.includes('release-notes.md') && written.includes('tracy_other.json'))
  assert.deepEqual(lines.map((l) => l.slice(66)).sort(), written)
  for (const l of lines) assert.equal(l.slice(0, 64), hex(readFileSync(path.join(f.out, l.slice(66)))), l)
})

test('patch: carried metadata is the previous release\'s bytes — an asset cannot stand in for the setting, a changed copy or a link among the files is refused by name', () => {
  const f = carriedFixture()
  const edited = path.join(f.root, 'edited')
  mkdirSync(edited)
  writeFileSync(path.join(edited, 'tracy_other.json'), '{"a":2}\n')
  const stale = path.join(edited, 'tracy_setting.json')
  writeFileSync(stale, readFileSync(path.join(f.prevDir, 'tracy_setting.json')))
  const asSetting = refusal(f, f.carried({ settingTemplate: undefined, asset: [stale, path.join(f.prevDir, 'tracy_other.json')] }))
  assert.ok(asSetting.codes.includes('unsafe-file'))
  assert.match(asSetting.text, /the release writes tracy_setting\.json itself/)
  const changed = refusal(f, f.carried({ asset: [path.join(edited, 'tracy_other.json')] }))
  assert.deepEqual(changed.codes.filter((c) => c === 'metadata-changed'), ['metadata-changed'])
  assert.match(changed.text, /tracy_other\.json is not the bytes --previous carried/)
  symlinkSync(path.join(f.prevDir, 'tracy_other.json'), path.join(f.prevDir, 'tracy_link.json'))
  const linked = refusal(f, f.carried())
  assert.match(linked.text, /tracy_link\.json is not a regular file/)
  assert.ok(!existsSync(f.out))
})

test('patch: every file of --previous that the release reads is covered by its SHA256SUMS — manifest.json, VERIFICATION.json, README.md, each asset and any other file; the card is the previous release\'s bytes', () => {
  const f = carriedFixture()
  const sums = path.join(f.prevDir, 'SHA256SUMS')
  const good = readFileSync(sums, 'utf8')
  const lines = good.trim().split('\n')
  for (const file of ['manifest.json', 'VERIFICATION.json', 'README.md', ...JSON.parse(readFileSync(path.join(f.prevDir, 'manifest.json'), 'utf8')).assets.slice(0, 1)]) {
    writeFileSync(sums, lines.filter((l) => !l.endsWith(`  ${file}`)).join('\n') + '\n')
    const r = refusal(f, f.carried())
    assert.ok(r.codes.includes('metadata-invalid'), file)
    assert.match(r.text, new RegExp(`SHA256SUMS does not list [^:]*${file.replace('.', '\\.')}`), file)
  }
  writeFileSync(path.join(f.prevDir, 'stray.txt'), 'x')
  writeFileSync(sums, good)
  assert.match(refusal(f, f.carried()).text, /SHA256SUMS does not list stray\.txt/)
  rmSync(path.join(f.prevDir, 'stray.txt'))
  const other = path.join(f.root, 'other-card')
  mkdirSync(other)
  writeFileSync(path.join(other, 'tracy_design_inspiration.json'), '{"template":"tracy-base","x":2}')
  const r = refusal(f, f.carried({ card: path.join(other, 'tracy_design_inspiration.json') }))
  assert.ok(r.codes.includes('metadata-changed'))
  assert.match(r.text, /tracy_design_inspiration\.json is not the bytes --previous carried/)
  assert.ok(runRelease(f.carried(), quiet))
})

test('patch: a --previous whose SHA256SUMS cannot be read or does not verify is refused naming the file — missing, empty, malformed, repeated, unsafe name, absent member, wrong hash (release-notes.md included), a metadata file not listed', () => {
  const f = carriedFixture()
  const sums = path.join(f.prevDir, 'SHA256SUMS')
  const good = readFileSync(sums, 'utf8')
  const lines = good.trim().split('\n')
  const line = (file) => lines.find((l) => l.endsWith(`  ${file}`))
  const bad = '0'.repeat(64)
  writeFileSync(path.join(f.prevDir, 'release-notes.md'), 'notes\n')
  const notes = `${hex(Buffer.from('notes\n'))}  release-notes.md`
  const variants = {
    empty: ['', /SHA256SUMS is empty/],
    malformed: [`${good}not a line\n`, /not "<sha256>  <plain file name>"/],
    repeated: [`${good}${line('VERIFICATION.json')}\n`, /lists VERIFICATION\.json more than once/],
    unsafeName: [`${good}${bad}  ../escape\n`, /not "<sha256>  <plain file name>"/],
    absentMember: [`${good}${bad}  gone.json\n`, /does not hold for gone\.json \(missing\)/],
    wrongHash: [good.replace(line('tracy_setting.json').slice(0, 64), bad), /does not hold for tracy_setting\.json/],
    wrongNotes: [`${good}${bad}  release-notes.md\n`, /does not hold for release-notes\.md/],
    unlisted: [lines.filter((l) => !l.endsWith('tracy_other.json')).join('\n') + `\n${notes}\n`, /does not list tracy_other\.json/]
  }
  for (const [name, [text, pattern]] of Object.entries(variants)) {
    writeFileSync(sums, text)
    const r = refusal(f, f.carried())
    assert.ok(r.codes.includes('metadata-invalid'), name)
    assert.match(r.text, pattern, name)
    assert.match(r.text, /SHA256SUMS/, name)
  }
  rmSync(sums)
  assert.match(refusal(f, f.carried()).text, /SHA256SUMS cannot be read/)
  mkdirSync(sums)
  assert.match(refusal(f, f.carried()).text, /SHA256SUMS cannot be read/)
  rmSync(sums, { recursive: true })
  writeFileSync(sums, good)
  assert.ok(!existsSync(f.out))
  assert.ok(runRelease(f.carried(), quiet), 'the same directory with its sums intact is accepted')
})

test('release: SHA256SUMS lists release-notes.md at most once for an earlier release to be replaced', () => {
  const f = patchFixture()
  runRelease(f.po(), quiet)
  const sumsFile = path.join(f.out, 'SHA256SUMS')
  const text = readFileSync(sumsFile, 'utf8')
  const notesLine = text.split('\n').find((l) => l.endsWith('release-notes.md'))
  assert.ok(notesLine, 'the notes are listed once')
  writeFileSync(sumsFile, `${text}${notesLine}\n`)
  assert.throws(() => runRelease(f.po(), quiet), /\[output-not-release\].*lists release-notes\.md more than once/)
  assert.ok(existsSync(path.join(f.out, 'manifest.json')), 'the earlier release stays')
})

test('release: a re-run replaces a release whose SHA256SUMS does not list release-notes.md (the earlier form) and keeps notes a person edited', () => {
  const f = patchFixture()
  runRelease(f.po(), quiet)
  const sumsFile = path.join(f.out, 'SHA256SUMS')
  writeFileSync(sumsFile, readFileSync(sumsFile, 'utf8').split('\n').filter((l) => !l.endsWith('release-notes.md')).join('\n'))
  writeFileSync(path.join(f.out, 'release-notes.md'), 'My own notes.\n')
  runRelease(f.po(), quiet)
  assert.equal(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), 'My own notes.\n')
  assert.match(readFileSync(sumsFile, 'utf8'), new RegExp(`${hex(Buffer.from('My own notes.\n'))}  release-notes\\.md\n`))
  writeFileSync(path.join(f.out, 'release-notes.md'), 'Edited again.\n')
  runRelease(f.po(), quiet)
  assert.equal(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8'), 'Edited again.\n')
})


// ---- the reuse path: the build stand's four tiers + one smoke tier on the restore --------------------------------------------

/** A tier report of `stage` on `site`, measured at minute `min`, and its directory under `dir`. */
function tierRun(f, { dir, stage, site, min }) {
  const s = STAGES.find((x) => x.id === stage)
  mkdirSync(dir, { recursive: true })
  return {
    dir,
    report: {
      schemaVersion: 1,
      at: at(min),
      site,
      identity: { contractPath: f.visualPath, contractHash: contractHash(f.visualContract), stale: [], capturedAt: at(min), artifactHash: tag(readFileSync(f.themeZip)) },
      scope: { kind: 'full' },
      stages: STAGES.map((x) => ({ id: x.id, status: x.id === stage ? 'pass' : 'skipped', findings: 0 })),
      summary: { findings: 0, unclassified: 0 },
      pages: [{ id: 'home', axes: s.variants.map((v) => ({ variant: v, measured: 'now', findings: [] })) }]
    }
  }
}

/**
 * The restored-site fixture turned into the reuse shape: a four-tier checkpoint of the BUILD stand (http://a, measured between the
 * artifacts and parity) and a one-tier smoke of the restore (http://b, after it). `reuse.write()` writes the ledger, reports, bindings
 * and the finish audit over the smoke's interaction record; edit `reuse.build` / `reuse.smoke` first to break one thing.
 */
function reuseFixture() {
  const f = fixture()
  const evidence = path.dirname(f.ledger)
  const build = { line: { run: 'rolling/build-1', kind: 'checkpoint', scope: { kind: 'full', pages: 1 }, complete: true, start: at(2), end: at(8), findings: { total: 0, unclassified: 0 }, axisErrors: 0, determinism: { errors: [] }, stages: [...TIER_IDS], tiers: {} }, runs: {} }
  for (const id of TIER_IDS) {
    const r = tierRun(f, { dir: path.join(evidence, 'build-1', id), stage: id, site: 'http://a', min: 5 })
    build.runs[id] = r
    build.line.tiers[id] = { out: r.dir, exit: 0, findings: { total: 0, unclassified: 0 } }
  }
  const sm = tierRun(f, { dir: path.join(evidence, 'smoke-1', SMOKE_TIER), stage: SMOKE_TIER, site: 'http://b', min: 35 })
  const smoke = { line: { run: 'rolling/smoke-1', kind: 'checkpoint', scope: { kind: 'full', pages: 1 }, complete: true, start: at(30), end: at(40), findings: { total: 0, unclassified: 0 }, axisErrors: 0, determinism: { errors: [] }, stage: SMOKE_TIER, out: sm.dir, exit: 0 }, run: sm, dir: sm.dir }
  const reuse = { build, smoke, auditRuns: () => [smoke.dir], bindingFor: (b) => b }
  reuse.write = ({ bind = true } = {}) => {
    f.write()
    writeFileSync(f.ledger, [build.line, smoke.line].map((l) => JSON.stringify(l)).join('\n') + '\n')
    const all = [...Object.entries(build.runs).map(([stage, r]) => [stage, r]), [SMOKE_TIER, smoke.run]]
    for (const [stage, r] of all) {
      const bytes = Buffer.from(JSON.stringify(r.report))
      writeFileSync(path.join(r.dir, 'visual.json'), bytes)
      rmSync(path.join(r.dir, BINDING_FILE), { force: true })
      if (bind) writeFileSync(path.join(r.dir, BINDING_FILE), JSON.stringify(reuse.bindingFor({ schema: BINDING_SCHEMA, stage, report: { file: 'visual.json', sha256: tag(bytes) }, measuredAt: r.report.at, artifactHash: f.hashes() }, r)))
    }
    rmSync(path.join(f.runRoot, 'port-audit.json'), { force: true })
    cleanAudit({ dossier: f.runRoot, site: 'http://b', source: 'http://source.test', routes: ['/'], runs: reuse.auditRuns(), pages: ['/'] })
    f.age()
    return reuse
  }
  reuse.o = () => ({ ...f.o(), checkpoint: build.line.run, restoreSmoke: smoke.line.run })
  f.reuse = reuse
  return reuse.write() && f
}

const reuseAccepted = (f, o = f.reuse.o()) => acceptRelease(o).acceptance.visual
const ineligible = (f, pattern) => {
  const r = refuses(f, 'restore-smoke-ineligible', pattern, f.reuse.o())
  // the full requirement stays: the build checkpoint alone is not four tiers on the restored site
  assert.ok(r.codes.some((c) => c === 'tier-site' || c === 'binding-missing' || c === 'artifact-mismatch' || c === 'binding-invalid' || c === 'evidence-stale' || c === 'tier-missing' || c === 'checkpoint-incomplete' || c === 'timestamp-invalid' || c === 'tier-failed' || c === 'tier-report' || c === 'tier-findings' || c === 'checkpoint-ambiguous' || c === 'checkpoint-not-full'), r.text)
  return r
}

test('reuse: the build stand\'s four bound tiers plus the dark-responsive smoke on the restore are accepted, and the release says which path it took', () => {
  const f = reuseFixture()
  const v = reuseAccepted(f)
  assert.equal(v.path, 'build-checkpoint-plus-smoke')
  assert.equal(v.checkpoint, 'rolling/build-1')
  assert.deepEqual(v.tiers.map((t) => [t.stage, t.site]), TIER_IDS.map((id) => [id, 'http://a']))
  assert.equal(v.restoreSmoke.checkpoint, 'rolling/smoke-1')
  assert.deepEqual(v.restoreSmoke.tiers.map((t) => [t.stage, t.site]), [[SMOKE_TIER, 'http://b']])
  assert.deepEqual(v.reuse.artifacts, Object.fromEntries(Object.entries(f.hashes()).map(([k, a]) => [k, a.sha256])))
  assert.deepEqual([v.reuse.parity.styleMismatches, v.reuse.parity.styleCaptureFailures, v.reuse.buildSite, v.reuse.restoredSite], [0, 0, 'http://a', 'http://b'])
  const lines = []
  runRelease(f.reuse.o(), { state: { exists: false }, log: (l) => lines.push(l) })
  assert.ok(lines.some((l) => /accepted on the build checkpoint rolling\/build-1.*dark-responsive smoke rolling\/smoke-1/.test(l)), lines.join('\n'))
  const ver = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.equal(ver.visual.path, 'build-checkpoint-plus-smoke')
  assert.equal(ver.visual.run, 'rolling/build-1')
  assert.equal(ver.visual.restoreSmoke.run ?? ver.visual.restoreSmoke.checkpoint, 'rolling/smoke-1')
  assert.equal(ver.acceptance.audit.scope, 'visual')
})

test('reuse: without --restore-smoke the build checkpoint is refused as before; with a valid four-tier checkpoint on the restore the full path is taken even when a smoke is named', () => {
  const f = reuseFixture()
  refuses(f, 'tier-site', /not the restored site/, { ...f.reuse.o(), restoreSmoke: undefined })
  // today's gate: four tiers on the restored site, after the restore
  const full = fixture()
  assert.equal(acceptRelease(full.o()).acceptance.visual.path, 'restored-checkpoint')
  // a smoke that cannot stand in does not matter when the checkpoint IS the full one; the refusal is recorded on the record
  writeFileSync(full.ledger, readFileSync(full.ledger, 'utf8') + JSON.stringify({ run: 'rolling/smoke-x', kind: 'recheck' }) + '\n')
  const v = acceptRelease({ ...full.o(), restoreSmoke: 'rolling/smoke-x' }).acceptance.visual
  assert.equal(v.path, 'restored-checkpoint')
  assert.match(v.reuseRefused.join(' '), /rolling\/smoke-x/)
})

test('reuse: each binding mismatch of the build checkpoint — theme, webroot, database — keeps the full four-tier requirement', () => {
  for (const key of ['theme', 'webroot', 'database']) {
    const f = reuseFixture()
    f.reuse.bindingFor = (b, r) => (r === f.reuse.build.runs['light-desktop'] ? { ...b, artifactHash: { ...b.artifactHash, [key]: { ...b.artifactHash[key], sha256: tag(`another ${key}`) } } } : b)
    f.reuse.write()
    ineligible(f, new RegExp(`build checkpoint: \\[artifact-mismatch\\] light-desktop: bound to ${key}`))
  }
})

test('reuse: a build tier with no binding, a binding written for another pack, or a report measured before the artifacts keeps the full requirement', () => {
  const missing = reuseFixture()
  missing.reuse.write({ bind: false })
  ineligible(missing, /build checkpoint: \[binding-missing\]/)
  const early = reuseFixture()
  for (const r of Object.values(early.reuse.build.runs)) r.report.at = r.report.identity.capturedAt = at(-5)
  early.reuse.build.line.start = at(-8)
  early.reuse.build.line.end = at(-2)
  early.reuse.write()
  ineligible(early, /build checkpoint: \[evidence-stale\].*before the (theme|webroot|database)/)
  // a checkpoint of the build stand measured after parity was measured does not describe what parity compared
  const late = reuseFixture()
  for (const r of Object.values(late.reuse.build.runs)) r.report.at = r.report.identity.capturedAt = at(25)
  late.reuse.build.line.start = at(22)
  late.reuse.build.line.end = at(28)
  late.reuse.write()
  ineligible(late, /build checkpoint: \[evidence-stale\].*after parity was measured/)
})

test('reuse: a build checkpoint measured on the restored site, or a restored-site smoke on the build stand, keeps the full requirement', () => {
  const wrongBuild = reuseFixture()
  for (const r of Object.values(wrongBuild.reuse.build.runs)) r.report.site = 'http://b'
  wrongBuild.reuse.write()
  ineligible(wrongBuild, /build checkpoint: \[tier-site\].*not the build stand http:\/\/a/)
  const wrongSmoke = reuseFixture()
  wrongSmoke.reuse.smoke.run.report.site = 'http://a'
  wrongSmoke.reuse.write()
  ineligible(wrongSmoke, /restored smoke: \[tier-site\].*not the restored site http:\/\/b/)
})

test('reuse: parity with style drift or a capture failure refuses the release outright (parity-failed), whatever the checkpoints say', () => {
  for (const mutate of [(p) => p.styles.mismatches.push({ axis: '/|390|dark' }), (p) => p.styles.captureFailures.push({ axis: '/|390|dark' })]) {
    const f = reuseFixture()
    mutate(f.parityReport)
    f.reuse.write()
    const r = refusal(f, f.reuse.o())
    assert.ok(r.codes.includes('parity-failed'), r.text)
    assert.ok(r.codes.includes('restore-smoke-ineligible') || r.codes.includes('tier-site'), r.text)
    assert.match(r.text, /style/)
  }
})

test('reuse: the smoke must be the dark-responsive tier of its own run, on the restore, after it, full and clean, with a binding', () => {
  const cases = [
    ['another tier', (r) => { r.smoke.line.stage = 'light-desktop' }, /restored smoke: \[tier-missing\] run rolling\/smoke-1 has no dark-responsive tier/],
    ['measured before the restore finished', (r) => { r.smoke.run.report.at = r.smoke.run.report.identity.capturedAt = at(5); r.smoke.line.start = at(2); r.smoke.line.end = at(8) }, /restored smoke: \[evidence-stale\].*before the restore/],
    ['a page left out', (r) => { r.smoke.run.report.pages = [] }, /restored smoke: \[tier-report\]/],
    ['a finding', (r) => { r.smoke.run.report.summary.findings = 1 }, /restored smoke: \[tier-failed\]|restored smoke: \[tier-findings\]/],
    ['not a checkpoint', (r) => { r.smoke.line.kind = 'recheck' }, /restored smoke: \[checkpoint-not-full\]/],
    ['the same run as the build checkpoint', (r) => { r.smoke.line.run = r.build.line.run }, /name the same run|\[checkpoint-ambiguous\]/]
  ]
  for (const [, edit, pattern] of cases) {
    const f = reuseFixture()
    edit(f.reuse)
    f.reuse.write()
    ineligible(f, pattern)
  }
  const unbound = reuseFixture()
  unbound.reuse.write({ bind: false })
  rmSync(path.join(unbound.reuse.build.runs['light-desktop'].dir, BINDING_FILE), { force: true })
  ineligible(unbound, /binding-missing/)
  // a smoke whose binding belongs to another theme
  const other = reuseFixture()
  other.reuse.bindingFor = (b, r) => (r === other.reuse.smoke.run ? { ...b, artifactHash: { ...b.artifactHash, theme: { ...b.artifactHash.theme, sha256: tag('another theme') } } } : b)
  other.reuse.write()
  ineligible(other, /restored smoke: \[artifact-mismatch\]/)
})

test('reuse: the finish audit covers the smoke\'s interaction record of the restored site; the build tiers\' records, or a receipt of another stand, are refused', () => {
  const f = reuseFixture()
  // a receipt over the four build tiers (a stand the audit does not vouch for here) is not the smoke's record
  f.reuse.auditRuns = () => Object.values(f.reuse.build.runs).map((r) => r.dir)
  f.reuse.write()
  const r = refusal(f, f.reuse.o())
  assert.ok(r.codes.some((c) => c.startsWith('audit-')), r.text)
  const wrongSite = reuseFixture()
  const smokeDir = wrongSite.reuse.smoke.dir
  writeFileSync(path.join(smokeDir, 'interaction.json'), '{}')
  const x = refusal(wrongSite, wrongSite.reuse.o())
  assert.ok(x.codes.some((c) => c.startsWith('audit-')), x.text)
})

// ---------------------------------------------------------------- paths in VERIFICATION.json (lib/record-paths.mjs)

/** Every string in a JSON value, at any depth. */
const stringsIn = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(stringsIn) : [])

test('release: VERIFICATION.json names no path as this machine lays it out — the dossier\'s repository relative to its root, everything else under ~', () => {
  const f = fixture()
  // the dossier is a repository of its own here; the evidence, the pack and the output are outside it, under "home"
  mkdirSync(path.join(f.runRoot, '.git'))
  withHome(f.root, () => runRelease(f.o(), quiet))
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.equal(v.visual.contractPath, CANONICAL.visual)
  assert.equal(v.acceptance.visual.contractPath, CANONICAL.visual)
  // a path outside the dossier's repository is recorded under ~ and then cut by portableVerification: the public record keeps its name only
  assert.equal(v.acceptance.visual.ledger, portableVerification(`~/${path.relative(f.root, f.ledger)}`))
  for (const t of v.acceptance.visual.tiers) assert.equal('dir' in t, false, `tier ${t.stage}`)
  assert.deepEqual(stringsIn(v).filter((s) => s.includes(f.root) || s.startsWith('~/')), [])
  const paths = { repoRoot: f.runRoot, home: f.root }
  assert.equal(resolveRecordPath(v.visual.contractPath, paths), path.join(f.runRoot, CANONICAL.visual), 'the recorded contract resolves to the canonical file')
  // the hashes the release was accepted on are those of the bytes, whatever the paths are written as
  assert.equal(v.visual.contractHash, contractHash(JSON.parse(readFileSync(path.join(f.runRoot, CANONICAL.visual), 'utf8'))))
})

test('patch: previous.file is recorded under ~, a later fix release reads a previous VERIFICATION.json of either form', () => {
  const f = patchFixture()
  withHome(f.root, () => runRelease(f.po(), quiet))
  const v = JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8'))
  assert.equal(v.previous.file, portableVerification(`~/${path.relative(f.root, f.previousFile)}`))
  assert.equal(v.previous.evidence, tag(readFileSync(f.previousFile)), 'the evidence is the hash of the file the path names')
  assert.deepEqual(stringsIn(v).filter((s) => s.includes(f.root)), [])
  // the previous release's own record: an older tool wrote absolute paths in it, a current one writes ~ — both back a fix
  for (const file of ['/srv/legacy/data/site/release-0.8.0/VERIFICATION.json', '~/data/site/release-0.8.0/VERIFICATION.json']) {
    const g = patchFixture()
    g.prev.previous = { release: 'tracy-base/wp7', version: '0.8.0', file, evidence: `sha256:${'a'.repeat(64)}`, gate: 'full', visual: null }
    g.patch()
    assert.equal(acceptRelease(g.po()).fix.previous.version, '0.9.0', file)
  }
})

test('patch: a --no-baseline reason that names a path is written the same way in VERIFICATION.json and in notes kept across a re-run', () => {
  const f = patchFixture()
  f.m.baseline = null
  f.patch()
  const reason = `the previous version's pack at ${path.join(f.root, 'old', 'pack')} cannot be restored`
  const recorded = portableVerification("the previous version's pack at ~/old/pack cannot be restored")
  withHome(f.root, () => runRelease(f.po({ noBaseline: reason }), quiet))
  assert.equal(JSON.parse(readFileSync(path.join(f.out, 'VERIFICATION.json'), 'utf8')).noBaseline, recorded)
  assert.ok(readFileSync(path.join(f.out, 'release-notes.md'), 'utf8').includes(recorded))
  // notes written by hand outlive a re-run: the exception added to them names the path as the record does, once
  writeFileSync(path.join(f.out, 'release-notes.md'), 'written by hand\n')
  for (let i = 0; i < 2; i++) withHome(f.root, () => runRelease(f.po({ noBaseline: reason }), quiet))
  const kept = readFileSync(path.join(f.out, 'release-notes.md'), 'utf8')
  assert.ok(kept.includes(recorded))
  assert.ok(!kept.includes(f.root), kept)
  assert.equal(kept.match(/\*\*Unverified exception:\*\*/g)?.length, 1)
})
