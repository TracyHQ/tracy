// The one validator of the intrinsic probe's evidence (#65): a closed schema, totals recomputed from the readings and
// compared with every stored copy, exact route × width coverage, and the verdict's reading of the literal intrinsic.json.
// One fixture per invariant, plus every contradiction the reviews named; each refusal is asserted by name.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, truncateSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { INTRINSIC_WIDTHS, buildIntrinsicReport, intrinsicBlocking, validateIntrinsicReport } from '../visual/intrinsic-report.mjs'
import { assessFastGate } from '../visual/fast-gate.mjs'
import { writeRun } from '../visual/report.mjs'
import { classify } from '../visual/intrinsic-mobile.mjs'
import { WIDTHS, claimsOf, clone, reportOf, row } from './lib/intrinsic-fixtures.mjs'
import { STAGE, visualOf, writeRunDir } from './lib/visual-evidence-fixtures.mjs'

const OWED = ['/']
const check = (rep, o = {}) => validateIntrinsicReport(rep, { owedRoutes: OWED, claims: claimsOf(rep), ...o })
/** `mutate` breaks a clone of a valid report; the stored claims stay those of the VALID one unless `claims` is given. */
function refused(base, mutate, re, why, o = {}) {
  const rep = clone(base)
  const claims = claimsOf(base)
  const r = mutate(rep, claims)
  const out = validateIntrinsicReport(r === undefined ? rep : r, { owedRoutes: OWED, claims, ...o })
  assert.ok(out.length, `${why}: accepted`)
  assert.match(out.join(' | '), re, why)
}
const A = '/@320'

test('valid controls: clean, shared, source-fixed, site-only and failed reports validate; a verdict never allows a failed reading', () => {
  assert.deepEqual(check(reportOf()), [])
  for (const cls of ['shared-source-defect', 'source-fixed', 'site-only']) for (const kind of ['control-wrap', 'text-clipped', 'page-overflow']) assert.deepEqual(check(reportOf({ rowsAt: { [A]: [row(cls, kind)] } })), [], `${cls} ${kind}`)
  assert.deepEqual(check(reportOf({ rowsAt: { [A]: [row('site-only', 'control-wrap', { withSource: true, lines: 3 })] } })), [], 'worse than the source')
  assert.deepEqual(check(reportOf({ sourceRead: false, rowsAt: { [A]: [row('site-only')] } })), [], 'site only, no source read')
  const failed = reportOf({ errorAt: { [A]: 'timeout' } })
  assert.match(check(failed).join(), /1 failed reading/)
  assert.deepEqual(check(failed, { allowFailedReadings: true }), [])
  assert.deepEqual(validateIntrinsicReport(reportOf({ routes: ['/a', '/b'], widths: [320, 414] }), { owedRoutes: ['/b', '/a'], owedWidths: [414, 320] }), [], 'a standalone probe names its own widths; no claims to compare')
  assert.equal(intrinsicBlocking({ status: 'run', siteOnly: 1, errors: 0 }), 1)
  assert.equal(intrinsicBlocking({ status: 'run', siteOnly: 0, shared: 4, errors: 0 }), 0)
})

test('schema: missing, empty, mistyped and unknown fields are named refusals at every level', () => {
  const base = reportOf({ rowsAt: { [A]: [row('shared-source-defect')] } })
  refused(base, () => 'x', /not an object/, 'a string is no report')
  refused(base, () => null, /not an object/, 'null is no report')
  for (const k of ['widths', 'sourceRead', 'routes', 'measured', 'readings', 'findings', 'errors', 'summary']) refused(base, (r) => void delete r[k], new RegExp(`lacks ${k}`), `missing ${k}`)
  refused(base, (r) => void (r.summary = {}), /summary siteOnly is not a non-negative integer/, 'an empty summary')
  refused(base, (r) => void (r.summary = 5), /summary is not an object/, 'a scalar summary')
  for (const v of [-1, 1.5, '1', 2 ** 60, null, Number.NaN]) refused(base, (r) => void (r.summary.shared = v), /summary shared is not a non-negative integer/, `summary count ${String(v)}`)
  refused(base, (r) => void (r.measured = -1), /measured is not a non-negative integer/, 'negative measured')
  refused(base, (r) => void (r.sourceRead = 'yes'), /sourceRead must be true or false/, 'mistyped sourceRead')
  refused(base, (r) => void (r.readings = 'x'), /must each be a list/, 'readings not a list')
  refused(base, (r) => void (r.extra = 1), /unknown report field\(s\) extra/, 'unknown report key')
  refused(base, (r) => void (r.summary.extra = 1), /unknown summary field/, 'unknown summary key')
  refused(base, (r) => void (r.readings[0].extra = 1), /reading 0 has unknown field/, 'unknown reading key')
  refused(base, (r) => void (r.readings[0].rows[0].extra = 1), /row 0 has unknown field/, 'unknown row key')
  refused(base, (r) => void (r.readings[0].rows[0].source.extra = 1), /source measurements/, 'unknown source key')
  refused(base, (r) => void (r.readings[0].rows[0].kind = 'mystery'), /unsupported kind/, 'unsupported kind')
  refused(base, (r) => void (r.readings[0].rows[0].class = 'mystery'), /unsupported class/, 'unsupported class')
  for (const k of ['selector', 'key', 'label', 'lines', 'boxWidth', 'class']) refused(base, (r) => void delete r.readings[0].rows[0][k], new RegExp(`lacks ${k}`), `a row without ${k}`)
  refused(base, (r) => void (r.readings[0].rows[0].lines = 1), /lines below 2/, 'lines below 2')
  refused(base, (r) => void (r.readings[0].rows[0].boxWidth = -4), /invalid boxWidth/, 'negative boxWidth')
  refused(base, (r) => void (r.readings[0].rows[0].selector = ''), /no selector/, 'an empty selector')
  refused(base, (r) => void (r.readings[0].rows[0].key = 'other|x'), /invalid key/, 'a key of another kind')
  refused(base, (r) => void (r.readings[0].error = ''), /missing or mistyped/, 'an empty error message')
  refused(base, (r) => void (r.readings[0].route = 4), /missing or mistyped/, 'a numeric route')
  refused(base, (r) => void (r.widths[0] = 1.5), /widths integers/, 'a fractional width')
  const over = reportOf({ rowsAt: { [A]: [row('site-only', 'page-overflow')] } })
  refused(over, (r) => void (r.readings[0].rows[0].over = 0), /invalid over/, 'a zero overflow')
  refused(over, (r) => void (r.readings[0].rows[0].label = 'x'), /invalid label/, 'page-overflow has no label')
})

test('reconciliation: every total is recomputed from the rows; changing all copied counts together cannot hide missing evidence', () => {
  const site = reportOf({ rowsAt: { [A]: [row('site-only')] } })
  refused(site, (r) => void (r.readings[0].defects = 0), /declares 0 defect\(s\) but retains 1/, 'a reading that understates its rows')
  refused(site, (r) => void (r.readings[1].defects = 1), /declares 1 defect\(s\) but retains 0/, 'a reading that declares a defect with no row (cross-width balancing)')
  refused(site, (r) => void (r.readings[0].fixed = 1), /declares 1 source-fixed but retains 0/, 'an invented fixed count')
  refused(site, (r) => void (r.measured = 9), /measured count disagrees/, 'measured total')
  for (const k of ['siteOnly', 'shared', 'sourceFixed', 'errors']) refused(site, (r) => void (r.summary[k] += 1), new RegExp(`summary ${k}`), `summary ${k}`)
  refused(site, (r) => void (r.findings = []), /findings \(0\) are not the 1 classified row/, 'a finding dropped')
  refused(site, (r) => void r.findings.push({ ...r.findings[0], route: '/gone' }), /findings/, 'a finding on an unmeasured route')
  refused(site, (r) => void (r.findings[0].width = 360), /findings/, 'a finding of another width')
  refused(site, (r) => void (r.findings[0].class = 'shared-source-defect'), /findings/, 'a finding of another class than its row')
  refused(site, (r) => void (r.findings[0].over = 3), /findings/, 'a finding that differs from its row')
  refused(site, (r) => void (r.findings[0] = { class: 'site-only', kind: 'control-wrap', route: '/', width: 320 }), /findings/, 'an incomplete finding')
  refused(site, (r) => void r.findings.push(clone(r.findings[0])), /findings \(2\)/, 'a finding counted twice')
  // source-fixed counted with no row: every stored copy agrees, the evidence is missing
  const clean = reportOf()
  const forged = clone(clean)
  forged.readings[0].defects = 1
  forged.readings[0].fixed = 1
  forged.summary.sourceFixed = 1
  const forgedClaims = claimsOf(forged)
  assert.match(validateIntrinsicReport(forged, { owedRoutes: OWED, claims: forgedClaims }).join(), /retains 0 row/, 'all copies changed together')
  // negative sourceFixed cancelling a finding
  refused(site, (r) => void (r.summary.siteOnly = 2) || void (r.summary.sourceFixed = -1), /summary sourceFixed is not a non-negative integer/, 'negative sourceFixed')
  // duplicate defect identity in one reading
  const dup = reportOf({ rowsAt: { [A]: [row('site-only'), row('site-only')] } })
  assert.match(check(dup).join(), /repeats defect identity/)
  // two controls with one label are two rows (distinct keys)
  assert.deepEqual(check(reportOf({ rowsAt: { [A]: [row('site-only'), row('site-only', 'control-wrap', { key: 'control-wrap|Contact Us|footer|1' })] } })), [])
})

test('errors: clean readings cannot claim errors, every error copy is the failed readings, and substitutes are multisets', () => {
  const clean = reportOf()
  refused(clean, (r) => void (r.summary.errors = 1), /summary errors 1 ≠ 0/, 'clean readings with summary.errors 1')
  const failed = reportOf({ errorAt: { [A]: 'timeout' } })
  const c = claimsOf(failed)
  c.intrinsic.errors = 0
  assert.match(validateIntrinsicReport(failed, { owedRoutes: OWED, claims: c, allowFailedReadings: true }).join(), /visual\.json intrinsic errors 0 ≠ 1/, 'summary.errors 1 against visual.intrinsic.errors 0')
  const c2 = claimsOf(failed)
  c2.summary.errors = 0
  assert.match(validateIntrinsicReport(failed, { owedRoutes: OWED, claims: c2, allowFailedReadings: true }).join(), /summary\.intrinsic errors 0 ≠ 1/)
  const o = { allowFailedReadings: true }
  refused(failed, (r) => void (r.errors = []), /errors list \(0\) is not the 1 failed/, 'omitted error rows', o)
  refused(clean, (r) => void (r.errors = [{ route: '/', width: 320, error: 'x' }]), /errors list \(1\) is not the 0 failed/, 'error-only rows', o)
  refused(failed, (r) => void (r.errors[0].error = 'other'), /errors list/, 'a changed message', o)
  const two = reportOf({ errorAt: { [A]: 'timeout', '/@360': 'refused' } })
  assert.deepEqual(check(two, { allowFailedReadings: true }), [])
  refused(two, (r) => void (r.errors[1] = clone(r.errors[0])), /errors list/, 'a duplicate of one failed reading in place of another', o)
  refused(failed, (r) => void (r.errors[0].extra = 1), /malformed error row/, 'an error row with an unknown key', o)
  refused(failed, (r) => void (r.readings[0].rows = [row('site-only')]), /failed yet holds rows/, 'a failed reading that holds rows', o)
  refused(failed, () => {}, /1 failed reading/, 'a verdict allows no failed reading')
})

test('inventory: coverage is complete exactly when every owed route × width is present once, and nothing else', () => {
  const base = reportOf({ routes: ['/', '/b'] })
  const owed = { owedRoutes: ['/', '/b'] }
  assert.deepEqual(check(base, owed), [])
  refused(base, (r) => void r.routes.push('/'), /duplicate route\(s\) \//, 'a duplicate route', owed)
  refused(base, (r) => void r.widths.push(320), /duplicate width\(s\) 320/, 'a duplicate width', owed)
  refused(base, (r) => void r.readings.push(clone(r.readings[0])), /not exactly one reading for \/@320/, 'a duplicate reading', owed)
  refused(base, (r) => void r.readings.shift(), /not exactly one reading for \/@320/, 'a missing pair', owed)
  refused(base, (r) => void r.readings.push({ route: '/zzz', width: 320, defects: 0, fixed: 0, rows: [] }), /outside the routes × widths/, 'a stray pair', owed)
  refused(base, (r) => void r.readings.push({ route: '/', width: 500, defects: 0, fixed: 0, rows: [] }), /outside the routes × widths/, 'a stray width', owed)
  refused(base, (r) => void (r.routes = []), /no route measured/, 'no routes', owed)
  refused(base, (r) => void (r.widths = [320]), /width\(s\) 360\/375\/390\/414 not measured/, 'missing widths', owed)
  // extra, fully measured routes and widths are not owed
  const extraRoute = reportOf({ routes: ['/', '/b', '/extra'] })
  assert.match(check(extraRoute, owed).join(), /not in the page-map: \/extra/)
  const extraWidth = reportOf({ routes: ['/', '/b'], widths: [...WIDTHS, 500] })
  assert.match(check(extraWidth, owed).join(), /width\(s\) 500 measured that are not owed/)
  // the owed routes are independent input
  const miss = (owedRoutes) => validateIntrinsicReport(base, { owedRoutes, claims: claimsOf(base) }).join()
  assert.match(miss(['/', '/b', '/c']), /not measured: \/c/)
  for (const bad of [null, undefined, [], ['/', '/'], ['/', 4]]) assert.match(miss(bad), /no valid page-map route inventory/, JSON.stringify(bad))
  for (const bad of [[], [320, 320], [320, 1.5]]) assert.match(validateIntrinsicReport(base, { owedRoutes: ['/', '/b'], owedWidths: bad, claims: claimsOf(base) }).join(), /no valid width inventory/, JSON.stringify(bad))
  assert.deepEqual(INTRINSIC_WIDTHS, WIDTHS)
})

test('source: sourceRead false derives nothing from the source; classes agree with the retained source measurements', () => {
  const nosrc = (rowsAt, errorAt) => reportOf({ sourceRead: false, rowsAt, errorAt })
  const claimFalse = (rep) => claimsOf(rep)
  const shared = nosrc({ [A]: [row('shared-source-defect')] })
  assert.match(check(shared, { claims: claimFalse(shared) }).join(), /derived from the source although sourceRead is false/, 'shared findings')
  const fixed = nosrc({ [A]: [row('source-fixed')] })
  assert.match(check(fixed, { claims: claimFalse(fixed) }).join(), /derived from the source/, 'source-fixed rows')
  const withSource = nosrc({ [A]: [row('site-only', 'control-wrap', { withSource: true, lines: 3 })] })
  assert.match(check(withSource, { claims: claimFalse(withSource) }).join(), /derived from the source/, 'source measurements')
  // sourceRead false with the totals patched to hide it
  const hidden = reportOf({ sourceRead: true, rowsAt: { [A]: [row('source-fixed')] } })
  refused(hidden, (r) => void (r.sourceRead = false), /sourceRead is false yet 0 shared and 1 source-fixed|derived from the source/, 'a report that denies its own source read')
  // disagreement between the copied sourceRead fields
  const clean = reportOf()
  refused(clean, (_, c) => void (c.intrinsic.sourceRead = false), /intrinsic sourceRead false ≠ true/, 'claim sourceRead')
  // classification inconsistent with retained measurements
  const sharedOk = reportOf({ rowsAt: { [A]: [row('shared-source-defect')] } })
  refused(sharedOk, (r) => void (r.readings[0].rows[0].source = { lines: 1 }) || void (r.findings[0].source = { lines: 1 }), /source measurement|lines below 2/, 'shared with a source that is smaller')
  refused(sharedOk, (r) => { r.readings[0].rows[0].lines = 4; r.findings[0].lines = 4 }, /is shared-source-defect yet its source measurement is smaller/, 'shared although the site is worse')
  refused(sharedOk, (r) => { delete r.readings[0].rows[0].source; delete r.findings[0].source }, /without a source measurement/, 'shared without a source measurement')
  const siteOk = reportOf({ rowsAt: { [A]: [row('site-only', 'control-wrap', { withSource: true, lines: 3 })] } })
  refused(siteOk, (r) => { r.readings[0].rows[0].source = { lines: 3 }; r.findings[0].source = { lines: 3 } }, /is site-only yet its source measurement is not smaller/, 'site-only that is not worse')
  refused(fixed.sourceRead ? fixed : reportOf({ rowsAt: { [A]: [row('source-fixed')] } }), (r) => void (r.readings[0].rows[0].source = { lines: 2 }), /source-fixed yet carries a source block/, 'source-fixed with a source block')
  refused(sharedOk, (r) => void (r.readings[0].rows[0].source = { over: 3 }), /source measurements that are not \{ lines \}/, 'the wrong source measurement for the kind')
})

test('claims: visual.json intrinsic and summary.intrinsic are required, closed and equal to the recomputed values', () => {
  const site = reportOf({ rowsAt: { [A]: [row('site-only')] } })
  const cl = (mutate, re, why) => refused(site, (r, c) => void mutate(c), re, why)
  for (const name of ['intrinsic', 'summary']) for (const bad of [undefined, null, [], 'x']) {
    const out = validateIntrinsicReport(site, { owedRoutes: OWED, claims: { ...claimsOf(site), [name]: bad } }).join()
    assert.match(out, name === 'intrinsic' ? /no intrinsic block/ : /no summary\.intrinsic block/, `${name} ${JSON.stringify(bad)}`)
  }
  assert.match(validateIntrinsicReport(site, { owedRoutes: OWED, claims: { intrinsic: claimsOf(site).intrinsic } }).join(), /no summary\.intrinsic block/)
  cl((c) => void (c.summary = {}), /summary\.intrinsic status/, 'an empty summary claim')
  cl((c) => void (c.summary.blocking = 0), /blocking 0 ≠ 1/, 'a contradictory blocking')
  cl((c) => void (c.summary.siteOnly = 0), /summary\.intrinsic siteOnly 0 ≠ 1/, 'a contradictory site-only count')
  cl((c) => void (c.summary.status = 'failed'), /summary\.intrinsic status/, 'a summary status other than run')
  cl((c) => void (c.summary.extra = 1), /unknown field\(s\) extra in visual\.json's summary\.intrinsic/, 'an unknown summary-claim key')
  cl((c) => void (c.summary.shared = -1), /summary\.intrinsic shared is not a non-negative integer/, 'a negative claim count')
  cl((c) => void (c.intrinsic.siteOnly = 0), /intrinsic siteOnly 0 ≠ 1/, 'a contradictory intrinsic count')
  cl((c) => void (c.intrinsic.measured = 3), /intrinsic measured 3 ≠ 5/, 'measured')
  cl((c) => void (c.intrinsic.routes = 2), /intrinsic routes 2 ≠ 1/, 'routes')
  cl((c) => void (c.intrinsic.widths = [320]), /widths differ/, 'widths')
  cl((c) => void (c.intrinsic.file = 'other.json'), /intrinsic file "other.json"/, 'file')
  cl((c) => void (c.intrinsic.status = 'failed'), /intrinsic status/, 'status')
  cl((c) => void (c.intrinsic.reason = 'x'), /unknown field\(s\) reason/, 'reason on a run')
  cl((c) => void (c.intrinsic.extra = 1), /unknown field\(s\) extra in visual\.json's intrinsic/, 'unknown key')
  cl((c) => void (c.intrinsic.sourceFixed = 1.5), /sourceFixed is not a non-negative integer/, 'fractional')
  const shared = reportOf({ rowsAt: { [A]: [row('shared-source-defect')] } })
  assert.equal(claimsOf(shared).summary.blocking, 0, 'a shared defect does not block')
  assert.equal(claimsOf(reportOf({ errorAt: { [A]: 'x' } })).summary.blocking, 1)
})

// ── the verdict's reading of the literal intrinsic.json ─────────────────────────────────────────────
function runDir(rep, { claim, summaryClaim } = {}) {
  const dir = testDir('intrinsic-run')
  const claims = claimsOf(rep ?? reportOf())
  writeRunDir(dir, { 'visual.json': visualOf({ intrinsic: claim ?? claims.intrinsic, summaryIntrinsic: summaryClaim ?? claims.summary }), 'intrinsic.json': false })
  return dir
}
const intrinsicReasons = (dir, routes = OWED) => assessFastGate(dir, { expectedRoutes: routes }).reasons.filter((r) => /intrinsic/.test(r)).join(' | ')

test('verdict: only the literal intrinsic.json, a regular file read whole, is evidence', () => {
  const rep = reportOf()
  const dir = runDir(rep)
  writeFileSync(path.join(dir, 'intrinsic.json'), JSON.stringify(rep))
  assert.equal(intrinsicReasons(dir), '', 'a valid report passes through the same path')
  // absent, alternate (even a valid one), traversal and absolute names
  const absent = runDir(rep)
  assert.match(intrinsicReasons(absent), /intrinsic\.json not readable/)
  for (const name of ['other.json', '../intrinsic.json', path.join(absent, 'x.json'), 'sub/intrinsic.json']) {
    const d = runDir(rep, { claim: { ...claimsOf(rep).intrinsic, file: name } })
    writeFileSync(path.join(d, 'other.json'), JSON.stringify(rep))
    assert.match(intrinsicReasons(d), /only intrinsic\.json is read/, name)
  }
  // a contradictory canonical file next to a valid alternate
  const contra = runDir(rep)
  const bad = clone(rep)
  bad.summary.siteOnly = 3
  writeFileSync(path.join(contra, 'intrinsic.json'), JSON.stringify(bad))
  writeFileSync(path.join(contra, 'other.json'), JSON.stringify(rep))
  assert.match(intrinsicReasons(contra), /summary siteOnly 3 ≠ 0/)
  // empty, truncated, oversized
  for (const [name, body] of [['empty', ''], ['truncated', JSON.stringify(rep).slice(0, 40)], ['array', '[]'], ['null', 'null']]) {
    const d = runDir(rep)
    writeFileSync(path.join(d, 'intrinsic.json'), body)
    assert.match(intrinsicReasons(d), /not readable|not an object/, name)
  }
  const big = runDir(rep)
  const fd = openSync(path.join(big, 'intrinsic.json'), 'w')
  closeSync(fd)
  truncateSync(path.join(big, 'intrinsic.json'), 40 * 1024 * 1024)
  assert.match(intrinsicReasons(big), /larger than/)
  // a directory, a link, a FIFO: refused without following or blocking
  const dirAsFile = runDir(rep)
  mkdirSync(path.join(dirAsFile, 'intrinsic.json'))
  assert.match(intrinsicReasons(dirAsFile), /not a regular file|not readable/)
  const linked = runDir(rep)
  writeFileSync(path.join(linked, 'real.json'), JSON.stringify(rep))
  symlinkSync(path.join(linked, 'real.json'), path.join(linked, 'intrinsic.json'))
  assert.match(intrinsicReasons(linked), /is a link/)
  const fifo = runDir(rep)
  spawnSync('mkfifo', [path.join(fifo, 'intrinsic.json')])
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import { assessFastGate } from ${JSON.stringify(new URL('../visual/fast-gate.mjs', import.meta.url).href)}; const v = assessFastGate(${JSON.stringify(fifo)}, { expectedRoutes: ['/'] }); console.log(v.reasons.join('|'))`], { timeout: 15000, encoding: 'utf8' })
  assert.equal(child.status, 0, `a FIFO must not block the verdict: ${String(child.error ?? child.stderr)}`)
  assert.match(child.stdout, /not a regular file/)
})

test('producer → writer → verdict: the viewport width survives, every class round-trips, and the gate refuses what the producer could not emit', () => {
  // the control is narrower than the viewport: finding.width is the reading's viewport, boxWidth the element's
  const rep = reportOf({ rowsAt: { [A]: [row('site-only', 'control-wrap', { boxWidth: 110 })] } })
  assert.equal(rep.findings[0].width, 320)
  assert.equal(rep.findings[0].boxWidth, 110)
  const cases = {
    clean: reportOf(),
    shared: reportOf({ rowsAt: { [A]: [row('shared-source-defect')] } }),
    fixed: reportOf({ rowsAt: { [A]: [row('source-fixed')] } }),
    siteOnly: reportOf({ rowsAt: { [A]: [row('site-only')] } }),
    siteOnlyNoSource: reportOf({ sourceRead: false, rowsAt: { [A]: [row('site-only')] } }),
    failedRead: reportOf({ errorAt: { [A]: 'timeout' } })
  }
  for (const [name, r] of Object.entries(cases)) {
    const claims = claimsOf(r)
    const out = testDir('intrinsic-roundtrip')
    writeFileSync(path.join(out, 'intrinsic.json'), JSON.stringify(r))
    const report = writeRun({ out, site: 'http://x', contractFile: 'c.json', identity: { contractHash: 'sha256:c', capturedAt: '2026-09-30T00:00:00.000Z' }, stageReports: [{ id: STAGE, variants: [], pages: 0, axes: 0, findings: 0, reused: 0, status: 'pass' }], pages: [], stageOf: () => STAGE, method: 'test', intrinsic: { ...claims.intrinsic, rows: r.findings.filter((f) => f.class === 'site-only'), errorRows: r.errors } })
    assert.deepEqual(report.summary.intrinsic, claims.summary, name)
    const reasons = assessFastGate(out, { expectedRoutes: OWED }).reasons.filter((x) => /intrinsic/.test(x)).join(' | ')
    if (name === 'siteOnly' || name === 'siteOnlyNoSource') assert.match(reasons, /1 site-only defect/, name)
    else if (name === 'failedRead') assert.match(reasons, /1 failed reading/, name)
    else assert.equal(reasons, '', name)
  }
  // classify → build: what the page returns, classed, is what the validator accepts
  const site = [{ kind: 'control-wrap', label: 'Contact Us', key: 'control-wrap|Contact Us|main|1', selector: 'a.cta', lines: 2, boxWidth: 90 }, { kind: 'page-overflow', label: '', key: 'page-overflow', selector: 'html', over: 40 }]
  const source = [{ ...site[0], boxWidth: 90 }, { kind: 'page-overflow', label: '', key: 'page-overflow', selector: 'html', over: 10 }, { kind: 'text-clipped', label: 'Gone', key: 'text-clipped|Gone|main|1', selector: 'h2', over: 5 }]
  const built = buildIntrinsicReport({ widths: WIDTHS, sourceRead: true, routes: ['/'], readings: WIDTHS.map((width) => ({ route: '/', width, rows: width === 320 ? classify(site, source) : [] })) })
  assert.deepEqual(check(built), [])
  assert.deepEqual(built.summary, { siteOnly: 1, shared: 1, sourceFixed: 1, errors: 0 })
})

test('hostile inputs: visual.json, the page-map and the other run files are read through the verified reader — link, FIFO, directory, oversize, null and wrong shape are named refusals within a deadline', () => {
  const mk = (kind, file) => {
    const d = testDir('intrinsic-hostile')
    const f = path.join(d, file)
    if (kind === 'null') writeFileSync(f, 'null')
    else if (kind === 'array') writeFileSync(f, '[]')
    else if (kind === 'scalar') writeFileSync(f, '3')
    else if (kind === 'empty') writeFileSync(f, '')
    else if (kind === 'dir') mkdirSync(f)
    else if (kind === 'link') {
      writeFileSync(path.join(d, 'real'), '{}')
      symlinkSync(path.join(d, 'real'), f)
    } else if (kind === 'fifo') spawnSync('mkfifo', [f])
    else if (kind === 'big') {
      closeSync(openSync(f, 'w'))
      truncateSync(f, 40 * 1024 * 1024)
    }
    return d
  }
  const run = (code) => spawnSync(process.execPath, ['--input-type=module', '-e', code], { timeout: 15000, encoding: 'utf8' })
  const href = (p) => JSON.stringify(new URL(p, import.meta.url).href)
  for (const kind of ['null', 'array', 'scalar', 'empty', 'dir', 'link', 'fifo', 'big']) {
    // visual.json through the verdict
    const d = mk(kind, 'visual.json')
    const a = run(`import { assessFastGate } from ${href('../visual/fast-gate.mjs')}; const v = assessFastGate(${JSON.stringify(d)}, { expectedRoutes: ['/'] }); console.log(v.status + '|' + v.reasons.join('|'))`)
    assert.equal(a.status, 0, `visual.json ${kind}: ${String(a.error ?? a.stderr)}`)
    assert.match(a.stdout, /^fail\|no usable visual\.json/, `visual.json ${kind}`)
    // the page-map, through the probe's own run step
    const s = mk(kind, 'page-map.json')
    const b = run(`import { runIntrinsic } from ${href('../visual/visual-qa.mjs')}; const r = await runIntrinsic({ spec: ${JSON.stringify(s)}, site: 'http://127.0.0.1:1', out: ${JSON.stringify(s)} }); console.log(r.status + '|' + (r.reason ?? ''))`)
    assert.equal(b.status, 0, `page-map ${kind}: ${String(b.error ?? b.stderr)}`)
    assert.match(b.stdout, /^failed\|/, `page-map ${kind}`)
    // the standalone probe's --page-map: usage-class exit, no browser
    const c = spawnSync(process.execPath, [fileURLToPath(new URL('../visual/intrinsic-mobile.mjs', import.meta.url)), '--page-map', path.join(s, 'page-map.json'), '--site', 'http://127.0.0.1:1', '--source-site', 'http://127.0.0.1:2'], { timeout: 15000, encoding: 'utf8' })
    assert.ok(!c.error, `--page-map ${kind} must not block: ${String(c.error)}`)
    assert.equal(c.status, 2, `--page-map ${kind}: ${c.stderr}`)
  }
})
