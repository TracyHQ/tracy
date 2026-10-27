import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { FIX_MEASURE_SCHEMA, baselineOf, carriedEvidence, mergeFixMeasures, validateFixMeasure, writeFixMeasure } from '../lib/fix-measure.mjs'
import { coverageOf } from '../lib/sweep-coverage.mjs'
import { fingerprintOf } from '../lib/source-fingerprint.mjs'

const input = () => ({
  tool: 'measure.mjs',
  site: 'http://127.0.0.1:8449',
  source: 'http://127.0.0.1:8451',
  themeZipSha256: 'a'.repeat(64),
  ranAt: '2026-10-04T12:00:00.000Z',
  checks: [
    { id: 'A1', title: 'Header height', pass: true, cases: 4, defects: 0 },
    { id: 'B1', title: 'Overflow', pass: false, cases: 372, defects: 2, note: 'category-style-2 at 1024' }
  ],
  baseline: { version: '1.0.4', passed: 7, total: 10, ranAt: '2026-10-04T10:00:00.000Z' },
  notDefects: [{ what: 'Home 4 dark logo', why: 'the source picture answers 404', evidence: 'B3 output' }]
})
const valid = () => {
  const i = input()
  i.checks[1] = { id: 'B1', title: 'Overflow', pass: true, cases: 372, defects: 0 }
  return i
}

test('writeFixMeasure: writes the schema with passed and total counted from the checks, and returns what it wrote', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-measure-'))
  try {
    const file = path.join(dir, 'm.json')
    const doc = writeFixMeasure(file, valid())
    assert.equal(doc.schema, FIX_MEASURE_SCHEMA)
    assert.deepEqual([doc.passed, doc.total], [2, 2])
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), doc)
    assert.deepEqual(Object.keys(doc), ['schema', 'tool', 'ranAt', 'site', 'source', 'artifact', 'checks', 'passed', 'total', 'baseline', 'notDefects'])
    assert.deepEqual(doc.artifact, { themeZipSha256: 'a'.repeat(64) })
    assert.deepEqual(validateFixMeasure(doc), [])
    // a failing check is a valid measure (release.mjs refuses it); the counts follow the checks
    const failing = writeFixMeasure(file, input())
    assert.deepEqual([failing.passed, failing.total], [1, 2])
    assert.deepEqual(validateFixMeasure(failing), [])
    // baseline and notDefects default to none, ranAt to now
    const bare = writeFixMeasure(file, { ...valid(), baseline: undefined, notDefects: undefined, ranAt: undefined })
    assert.equal(bare.baseline, null)
    assert.deepEqual(bare.notDefects, [])
    assert.ok(Math.abs(Date.parse(bare.ranAt) - Date.now()) < 60_000)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeFixMeasure: a document that does not validate is never written', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-measure-'))
  try {
    const file = path.join(dir, 'm.json')
    assert.throws(() => writeFixMeasure(file, { ...valid(), checks: [] }), /checks is not a non-empty list/)
    assert.throws(() => writeFixMeasure(file, { ...valid(), site: 'build-stand' }), /site "build-stand" is not an http\(s\) URL/)
    assert.throws(() => writeFixMeasure(file, { ...valid(), themeZipSha256: 'sha256:' + 'a'.repeat(64) }), /themeZipSha256 is not a hex sha256/)
    assert.ok(!existsSync(file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('validateFixMeasure: each way the document is not the schema is named', () => {
  const doc = () => JSON.parse(JSON.stringify(writeFixMeasureOf(valid())))
  const writeFixMeasureOf = (i) => {
    const d = { schema: FIX_MEASURE_SCHEMA, tool: i.tool, ranAt: i.ranAt, site: i.site, source: i.source, artifact: { themeZipSha256: i.themeZipSha256 }, checks: i.checks, passed: i.checks.filter((c) => c.pass).length, total: i.checks.length, baseline: i.baseline, notDefects: i.notDefects }
    return d
  }
  assert.deepEqual(validateFixMeasure(doc()), [])
  const cases = [
    [(d) => (d.schema = 'tracy-fix-measure/v2'), /schema is "tracy-fix-measure\/v2"/],
    [(d) => (d.tool = ' '), /tool is empty/],
    [(d) => (d.ranAt = '2026-10-04 12:00'), /ranAt .* is not an ISO-8601/],
    [(d) => (d.ranAt = '2026-10-04T12:00:00'), /ranAt .* is not an ISO-8601 timestamp with a zone/],
    [(d) => (d.site = 'ftp://x'), /site "ftp:\/\/x" is not an http\(s\) URL/],
    [(d) => (d.site = 'http://user:pw@x'), /not an http\(s\) URL/],
    [(d) => (d.source = ''), /source is empty/],
    [(d) => delete d.artifact, /artifact.themeZipSha256 is not a hex sha256/],
    [(d) => (d.artifact.themeZipSha256 = 'abc'), /artifact.themeZipSha256 is not a hex sha256/],
    [(d) => (d.checks = []), /checks is not a non-empty list/],
    [(d) => (d.checks[0].id = ''), /checks\[0\].id is empty/],
    [(d) => (d.checks[1].id = 'A1'), /checks\[1\].id A1 is listed twice/],
    [(d) => (d.checks[0].title = ''), /checks\[0\].title is empty/],
    [(d) => (d.checks[0].pass = 'yes'), /checks\[0\].pass is not true or false/],
    [(d) => (d.checks[0].cases = -1), /checks\[0\].cases is not a count/],
    [(d) => (d.checks[0].defects = 1.5), /checks\[0\].defects is not a count/],
    [(d) => (d.checks[0].note = 3), /checks\[0\].note is not text/],
    [(d) => (d.checks[0].defects = 2), /checks\[0\] passes with 2 defect\(s\)/],
    [(d) => (d.passed = 1), /passed says 1, the checks give 2/],
    [(d) => (d.total = 3), /total says 3, the checks give 2/],
    [(d) => delete d.baseline, /baseline is neither null nor an object/],
    [(d) => (d.baseline.version = ''), /baseline.version is empty/],
    [(d) => (d.baseline.passed = '7'), /baseline.passed and baseline.total are not counts/],
    [(d) => (d.baseline.passed = 11), /baseline passed 11 of 10/],
    [(d) => (d.baseline.ranAt = 'then'), /baseline.ranAt "then" is not an ISO-8601/],
    [(d) => (d.notDefects = {}), /notDefects is not a list/],
    [(d) => (d.notDefects[0].evidence = ''), /notDefects\[0\].evidence is empty/],
    [(d) => (d.notDefects = [null]), /notDefects\[0\].what is empty/]
  ]
  for (const [change, pattern] of cases) {
    const d = doc()
    change(d)
    const problems = validateFixMeasure(d)
    assert.ok(problems.some((p) => pattern.test(p)), `${pattern} in ${JSON.stringify(problems)}`)
  }
  assert.deepEqual(validateFixMeasure(null), ['the measure is not a JSON object'])
  assert.deepEqual(validateFixMeasure([]), ['the measure is not a JSON object'])
  const none = doc()
  none.baseline = null
  assert.deepEqual(validateFixMeasure(none), [])
})

test('validateFixMeasure: defects stays a count — a list is refused with where the detail goes; rows and note carry it', () => {
  const d = writeFixMeasure(path.join(tmpdir(), `fm-${process.pid}.json`), { ...valid(), checks: [{ id: 'A1', title: 'A', pass: false, cases: 3, defects: 2, rows: [{ route: '/a' }, 'b'], note: 'two rows' }] })
  assert.deepEqual(d.checks[0].rows, [{ route: '/a' }, 'b'])
  const bad = { ...d, checks: [{ ...d.checks[0], defects: ['/a', '/b'] }] }
  assert.ok(validateFixMeasure(bad).some((p) => /defects is not a count \(a list was given: defects is the number, put the list in rows\)/.test(p)))
  assert.ok(validateFixMeasure({ ...d, checks: [{ ...d.checks[0], rows: 'x' }] }).some((p) => /rows is not a list/.test(p)))
})

test('validateFixMeasure: a new check says why; the baseline may list its checks and they must add up', () => {
  const m = valid()
  m.checks[1] = { ...m.checks[1], new: true }
  assert.ok(validateFixMeasure({ ...m, schema: FIX_MEASURE_SCHEMA, passed: 2, total: 2, artifact: { themeZipSha256: 'a'.repeat(64) } }).some((p) => /declared new without a why/.test(p)))
  m.checks[1].why = 'the port script added it in 1.0.6'
  const base = { ...m, schema: FIX_MEASURE_SCHEMA, passed: 2, total: 2, artifact: { themeZipSha256: 'a'.repeat(64) }, baseline: { version: '1.0.5', passed: 0, total: 1, ranAt: '2026-10-04T10:00:00.000Z', checks: [{ id: 'A1', pass: false }] } }
  assert.deepEqual(validateFixMeasure(base), [])
  base.baseline.total = 2
  assert.ok(validateFixMeasure(base).some((p) => /baseline.total says 2, baseline.checks give 1/.test(p)))
  const stray = { ...base, baseline: null }
  stray.checks[0] = { ...stray.checks[0], why: 'x' }
  assert.ok(validateFixMeasure(stray).some((p) => /why is given on a check that is not declared new/.test(p)))
})

test('typed N/A survives measure and baseline creation without counting as a pass or failure', () => {
  const applicability = { version: 1, binding: { version: 1, kinds: { '/': 'none' }, specHash: 'spec', contractHash: 'contract' }, outcomes: [{ check: 'sweep-background-comparison', route: '/', width: 390, scheme: 'light', status: 'not-applicable', reason: 'reference.kind=none' }] }
  const doc = measureOf([
    { id: 'background', title: 'Background', status: 'not-applicable', cases: 0, defects: 0 },
    { id: 'overflow', title: 'Overflow', status: 'pass', pass: true, cases: 6, defects: 0 }
  ], { source: null, applicability })
  assert.deepEqual(validateFixMeasure(doc), [])
  assert.equal(doc.passed, 1)
  const baseline = baselineOf(doc, '1.0.0')
  assert.deepEqual(baseline.checks[0], { id: 'background', status: 'not-applicable' })
  assert.deepEqual(baseline.applicability, applicability)
  assert.equal(baseline.passed, 1)
  assert.notEqual(baseline.checks[0].pass, false)
})

test('mergeFixMeasures keeps the available all-none baseline binding when a port-check baseline has none', () => {
  const applicability = { version: 1, binding: { version: 1, kinds: { '/': 'none' }, specHash: 'spec', contractHash: 'contract' }, outcomes: [] }
  const baseline = (id, withApplicability = false) => ({
    version: '1.0.0', passed: 0, total: 1, ranAt: '2026-10-01T10:00:00.000Z', checks: [{ id, pass: false }],
    ...(withApplicability ? { applicability } : {})
  })
  const sweep = measureOf([{ id: 'overflow', title: 'Overflow', pass: true }], { source: null, applicability, baseline: baseline('overflow', true) })
  const port = measureOf([{ id: 'port-check', title: 'Port check', pass: true }], { source: null, baseline: baseline('port-check') })
  const merged = mergeFixMeasures([sweep, port])
  assert.deepEqual(merged.applicability.binding, applicability.binding)
  assert.deepEqual(merged.baseline.applicability.binding, applicability.binding)
  assert.deepEqual(merged.baseline.checks.map((check) => check.id), ['overflow', 'port-check'])

  const different = { ...baseline('port-check', true), applicability: { ...applicability, binding: { ...applicability.binding, kinds: { '/': 'html' } } } }
  const conflictingPort = measureOf([{ id: 'port-check', title: 'Port check', pass: true }], { source: null, baseline: different })
  assert.throws(() => mergeFixMeasures([sweep, conflictingPort]), /different reference applicability bindings do not merge/)
})

const measureOf = (checks, extra = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-merge-'))
  const doc = writeFixMeasure(path.join(dir, 'x.json'), { ...valid(), checks, baseline: null, ...extra })
  rmSync(dir, { recursive: true, force: true })
  return doc
}
const earlier = (version, passMap) => ({ schema: FIX_MEASURE_SCHEMA, ranAt: '2026-10-01T10:00:00.000Z', checks: Object.entries(passMap).map(([id, pass]) => ({ id, title: id, pass })), theme: { version } })

test('mergeFixMeasures: same zip and site merge — checks side by side, earliest ranAt, notDefects joined, baseline from the earlier runs, new checks declared', () => {
  const sweep = measureOf([{ id: 'overflow', title: 'Overflow', pass: true, cases: 10, defects: 0 }, { id: 'chips', title: 'Chips', pass: true, cases: 4, defects: 0 }], { tool: 'site-sweep.mjs', ranAt: '2026-10-04T12:00:00.000Z' })
  const port = measureOf([{ id: 'wording', title: 'Wording', pass: true, cases: 7, defects: 0 }], { tool: 'measure106.mjs', ranAt: '2026-10-04T11:00:00.000Z', notDefects: [] })
  const merged = mergeFixMeasures([sweep, port], {
    baselineMeasure: { docs: [earlier('1.0.5', { overflow: true, chips: false })], version: '1.0.5' },
    declareNew: { wording: 'the port script added it in 1.0.6' }
  })
  assert.equal(merged.tool, 'site-sweep.mjs + measure106.mjs')
  assert.equal(merged.ranAt, '2026-10-04T11:00:00.000Z')
  assert.deepEqual(merged.checks.map((c) => c.id), ['overflow', 'chips', 'wording'])
  assert.deepEqual(merged.checks[2].new, true)
  assert.deepEqual(merged.baseline, { version: '1.0.5', passed: 1, total: 2, ranAt: '2026-10-01T10:00:00.000Z', checks: [{ id: 'overflow', pass: true }, { id: 'chips', pass: false }] })
  assert.deepEqual(merged.notDefects, sweep.notDefects)
  // the merged document is valid once written
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-merge-'))
  try {
    assert.deepEqual(validateFixMeasure(writeFixMeasure(path.join(dir, 'm.json'), merged)), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mergeFixMeasures: another theme zip, another site, a check twice, a counts-only baseline, baselines that disagree — each refused by name', () => {
  const a = measureOf([{ id: 'a', title: 'A', pass: true }])
  const b = measureOf([{ id: 'b', title: 'B', pass: true }])
  assert.throws(() => mergeFixMeasures([a, measureOf([{ id: 'b', title: 'B', pass: true }], { themeZipSha256: 'b'.repeat(64) })]), /different artifacts do not merge/)
  assert.throws(() => mergeFixMeasures([a, measureOf([{ id: 'b', title: 'B', pass: true }], { site: 'http://127.0.0.1:9999' })]), /different sites do not merge/)
  assert.throws(() => mergeFixMeasures([a, measureOf([{ id: 'a', title: 'A', pass: true }])]), /check a is in measure 1 \(tool measure\.mjs\) and in measure 2 \(tool measure\.mjs\): a check id is listed once.*prefix it/)
  assert.throws(() => mergeFixMeasures([a]), /at least two/)
  const counts = measureOf([{ id: 'c', title: 'C', pass: true }], { baseline: { version: '1.0.5', passed: 0, total: 1, ranAt: '2026-10-01T10:00:00.000Z' } })
  assert.throws(() => mergeFixMeasures([a, counts]), /counts only.*--baseline-measure/)
  const withChecks = (version, checks) => measureOf([{ id: 'x' + version + checks[0].pass, title: 'X', pass: true }], { baseline: { version, passed: checks.filter((c) => c.pass).length, total: checks.length, ranAt: '2026-10-01T10:00:00.000Z', checks } })
  assert.throws(() => mergeFixMeasures([withChecks('1.0.5', [{ id: 'k', pass: true }]), withChecks('1.0.4', [{ id: 'l', pass: true }])]), /different versions/)
  assert.throws(() => mergeFixMeasures([withChecks('1.0.5', [{ id: 'k', pass: true }]), withChecks('1.0.5', [{ id: 'k', pass: false }])]), /baseline check k passed in one baseline and failed in another/)
  assert.throws(() => mergeFixMeasures([a, b], { declareNew: { zzz: 'why' } }), /--new zzz: no such check/)
  assert.deepEqual(baselineOf({ fixMeasure: earlier('1.0.5', { k: false }) }, '1.0.5').checks, [{ id: 'k', pass: false }])
})

test('fix-measure.mjs merge: the CLI writes the merged file; an error exits 2 and writes nothing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-merge-cli-'))
  try {
    const f = (n, doc) => {
      writeFileSync(path.join(dir, n), JSON.stringify(doc))
      return path.join(dir, n)
    }
    const a = f('a.json', measureOf([{ id: 'overflow', title: 'Overflow', pass: true }]))
    const b = f('b.json', measureOf([{ id: 'wording', title: 'Wording', pass: true }]))
    const prev = f('prev.json', earlier('1.0.5', { overflow: false }))
    const out = path.join(dir, 'merged.json')
    const cli = (...args) => spawnSync(process.execPath, [new URL('../lib/fix-measure.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' })
    const ok = cli('merge', a, b, '--baseline-measure', prev, '--baseline-version', '1.0.5', '--new', 'wording=added in 1.0.6', '--out', out)
    assert.equal(ok.status, 0, ok.stderr)
    const doc = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual([doc.passed, doc.total, doc.baseline.version, doc.checks[1].new, doc.checks[1].why], [2, 2, '1.0.5', true, 'added in 1.0.6'])
    const bad = cli('merge', a, '--out', path.join(dir, 'x.json'))
    assert.equal(bad.status, 2)
    assert.match(bad.stderr, /at least two measures/)
    assert.ok(!existsSync(path.join(dir, 'x.json')))
    assert.equal(cli('merge', a, b, '--baseline-measure', prev, '--out', path.join(dir, 'y.json')).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mergeFixMeasures: an id both a port script and the sweep emit names both measures, with their file names on the command line', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-merge-clash-'))
  try {
    const f = (n, doc) => {
      writeFileSync(path.join(dir, n), JSON.stringify(doc))
      return path.join(dir, n)
    }
    const sweepFile = f('sweep.json', { ...measureOf([{ id: 'icons', title: 'Icons', pass: true }]), tool: 'site-sweep.mjs' })
    const portFile = f('port.json', { ...measureOf([{ id: 'icons', title: 'Icons of the port', pass: true }]), tool: 'measure106.mjs' })
    const r = spawnSync(process.execPath, [new URL('../lib/fix-measure.mjs', import.meta.url).pathname, 'merge', sweepFile, portFile, '--out', path.join(dir, 'o.json')], { encoding: 'utf8' })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /check icons is in measure 1 \(.*sweep\.json, tool site-sweep\.mjs\) and in measure 2 \(.*port\.json, tool measure106\.mjs\)/)
    assert.ok(!existsSync(path.join(dir, 'o.json')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('validateFixMeasure: notMeasurable on a check is a list of {cause, cases, reason, measurement, evidence}', () => {
  const base = measureOf([{ id: 'icons', title: 'Icons', pass: true }])
  const doc = (nm) => ({ ...base, checks: [{ ...base.checks[0], notMeasurable: nm }] })
  const ok = { cause: 'icons-unpairable', cases: 3, reason: 'r', measurement: 'm', evidence: 'e.png' }
  assert.deepEqual(validateFixMeasure(doc([ok])), [])
  assert.match(validateFixMeasure(doc([{ ...ok, evidence: '' }])).join(), /notMeasurable\[0\]/)
  assert.match(validateFixMeasure(doc('x')).join(), /notMeasurable is not a list/)
})

// ---- scope and source (synthetic) ----------------------------------------------------------------------------------------------
const cover = (o = {}) => coverageOf({ mode: 'full', checks: ['A1', 'B1'], routes: ['/'], widths: [320], heightsWidths: [320], schemes: ['light'], ...o })
const print = (html = '<p>synthetic</p>') => fingerprintOf({ url: 'http://127.0.0.1:8451/', html })

test('writeFixMeasure: coverage and the source fingerprint are written and validated; one that is malformed is never written', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-measure-'))
  try {
    const doc = writeFixMeasure(path.join(dir, 'm.json'), { ...valid(), coverage: cover(), sourceFingerprint: print() })
    assert.deepEqual(validateFixMeasure(doc), [])
    assert.equal(doc.coverage.mode, 'full')
    assert.equal(doc.sourceFingerprint.id, print().id)
    assert.throws(() => writeFixMeasure(path.join(dir, 'x.json'), { ...valid(), coverage: { mode: 'all' } }), /coverage/)
    assert.throws(() => writeFixMeasure(path.join(dir, 'x.json'), { ...valid(), sourceFingerprint: { id: 'x' } }), /algorithm/)
    assert.throws(() => writeFixMeasure(path.join(dir, 'x.json'), { ...valid(), baseline: { version: '1', passed: 0, total: 1, ranAt: '2026-10-04T10:00:00.000Z', sourceFingerprint: { id: 'x' } } }), /baseline\./)
    // a measure without either is still a valid document (a port's own script)
    assert.deepEqual(validateFixMeasure(writeFixMeasure(path.join(dir, 'y.json'), valid())), [])
    assert.equal('coverage' in writeFixMeasure(path.join(dir, 'z.json'), valid()), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mergeFixMeasures: the sweep\'s coverage and source survive the merge with a port\'s script; scoped runs do not add up; two sources do not merge', () => {
  const sweep = { ...writeShape(valid(), [{ id: 'S1', title: 's', pass: true }]), coverage: cover({ checks: ['S1'] }), sourceFingerprint: print() }
  const own = writeShape(valid(), [{ id: 'P1', title: 'p', pass: true }])
  const merged = mergeFixMeasures([sweep, own])
  assert.deepEqual(merged.coverage, cover({ checks: ['S1'] }))
  assert.equal(merged.sourceFingerprint.id, print().id)
  // the merged document validates as written
  assert.deepEqual(validateFixMeasure(JSON.parse(JSON.stringify({ schema: FIX_MEASURE_SCHEMA, ...merged, artifact: { themeZipSha256: merged.themeZipSha256 }, passed: 2, total: 2 }))), [])
  // two scoped sweeps of different checks do not make a full one: no coverage survives
  const a = { ...writeShape(valid(), [{ id: 'S1', title: 's', pass: true }]), coverage: cover({ mode: 'scoped', explicit: ['--only'], checks: ['S1'] }), sourceFingerprint: print() }
  const b = { ...writeShape(valid(), [{ id: 'S2', title: 's', pass: true }]), coverage: cover({ mode: 'scoped', explicit: ['--only'], checks: ['S2'] }), sourceFingerprint: print() }
  assert.equal(mergeFixMeasures([a, b]).coverage, undefined)
  // measures against two sources do not merge
  assert.throws(() => mergeFixMeasures([sweep, { ...own, sourceFingerprint: print('<p>another</p>') }]), /different sources/)
  // the baseline keeps its fingerprint, and baselines of two sources do not merge
  const base = (id, html) => ({ ...writeShape(valid(), [{ id, title: 't', pass: false }]), sourceFingerprint: print(html) })
  const withBase = mergeFixMeasures([sweep, own], { baselineMeasure: { docs: [base('S1', undefined), base('P1', undefined)], version: '1.0.0' } })
  assert.equal(withBase.baseline.sourceFingerprint.id, print().id)
  assert.throws(() => mergeFixMeasures([sweep, own], { baselineMeasure: { docs: [base('S1'), base('P1', '<p>x</p>')], version: '1.0.0' } }), /different sources/)
})

test('carriedEvidence and baselineOf: a measure of a scoped or carrying run is not a baseline; a full run\'s fingerprint travels with the baseline', () => {
  const doc = (coverage) => ({ ...writeShape(valid(), [{ id: 'A1', title: 'a', pass: false }]), coverage, sourceFingerprint: print() })
  assert.equal(carriedEvidence(doc(cover())), null)
  assert.equal(carriedEvidence(doc(cover({ mode: 'scoped', explicit: ['--only'] }))), null, 'a run narrowed by --only is a legitimate baseline of those checks')
  assert.match(carriedEvidence(doc(cover({ carried: true }))), /carries evidence/)
  assert.throws(() => baselineOf(doc(cover({ carried: true })), '1.0.0'), /is not a baseline/)
  assert.equal(baselineOf(doc(cover()), '1.0.0').sourceFingerprint.id, print().id)
})

test('validateFixMeasure: a check that passes with intermittent groups is inconsistent', () => {
  const m = writeShape(valid(), [{ id: 'A1', title: 'a', pass: true, intermittent: 1 }])
  assert.match(validateFixMeasure(m).join(), /passes with 1 intermittent group/)
  assert.deepEqual(validateFixMeasure(writeShape(valid(), [{ id: 'A1', title: 'a', pass: false, intermittent: 1 }])), [])
  assert.match(validateFixMeasure(writeShape(valid(), [{ id: 'A1', title: 'a', pass: false, intermittent: -1 }])).join(), /intermittent is not a count/)
})

/** A parsed document as writeFixMeasure would write it, with `checks` in place of the input's. */
function writeShape(i, checks) {
  const { themeZipSha256, ...rest } = i
  return { schema: FIX_MEASURE_SCHEMA, ...rest, themeZipSha256, artifact: { themeZipSha256 }, checks, passed: checks.filter((c) => c.pass).length, total: checks.length, baseline: null }
}
