// site-sweep-scope.mjs: the scope a re-run takes from the history, the merge of what it measured with what it carries, the state
// file (refusals, lock, revision), sweep.accept in a scoped run, and the command line end to end on small local pages served by
// the test: first run full, re-run narrowed, fixed, carried, --full with and without --reason, an explicit scope.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { ALL_CHECKS, DEFAULT_WIDTHS, emptyReport, formatSummary, readBaseline } from '../visual/site-sweep.mjs'
import { baselineOf, carriedEvidence } from '../lib/fix-measure.mjs'
import { behaviourProblems } from '../quickstart/release.mjs'
import { summarise, summaryLines } from '../visual/site-sweep-summary.mjs'
import { applyAccept } from '../visual/site-sweep-accept.mjs'
import { HistoryError, STATE_FILE, STATE_SCHEMA, applyHistory, coversOf, effectiveExit, entryAfter, identityOf, keyOf, mergeRun, readState, recordsOf, rejudgeChecks, resolveEntry, runRecord, scopeLine, scopeOf, stateProblems } from '../visual/site-sweep-scope.mjs'
import { sweepStep } from '../visual/round.mjs'
import { reusableSweep } from '../quickstart/sweep-reuse.mjs'
import { fingerprintOf, readSourceFingerprint } from '../lib/source-fingerprint.mjs'
import { PAGES, HEIGHT_WIDTHS, KEY, acc, acceptError, at, docOf, entryOf, exitOf, fullScope, group, rec, record, scopeBits, storedOf } from './lib/sweep-history-fixture.mjs'

const sha256 = (t) => createHash('sha256').update(t).digest('hex')
const SWEEP = fileURLToPath(new URL('../visual/site-sweep.mjs', import.meta.url))
const servers = []
const tmps = []
after(() => {
  for (const s of servers) s.close()
  for (const t of tmps) {
    try {
      chmodSync(t, 0o755)
    } catch {
      // already gone
    }
    rmSync(t, { recursive: true, force: true })
  }
})
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'sweep-scope-'))
  tmps.push(d)
  return d
}

test('scope: exactly the checks, routes, widths and schemes of the open groups; accepted groups and clean checks are left out', () => {
  const entry = entryOf({
    overflow: rec('overflow', { open: [group('page-overflow|div.wide', [['/a', 320, 'light'], ['/a', 390, 'light']])], accepted: [{ cause: 'page-overflow|table', kind: 'decided', routes: ['/c'], widths: [1440], schemes: ['dark'], cells: [['/c', 1440, 'dark']], occurrences: 1, measured: at('t1') }] }),
    chips: rec('chips', { open: [group('chip-background|span.badge', [['/b', 1440, 'dark']])] })
  })
  const s = scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual(scopeBits(s), { checks: ['overflow', 'chips'], routes: ['/a', '/b'], widths: [320, 390, 1440], heightsWidths: [], schemes: ['light', 'dark'] })
  // the chips are read where the full run read them, never at a width it did not read them at
  assert.deepEqual(s.anchorWidths, [1440, 390])
  assert.equal(s.empty, false)
})

test('scope: heights keeps its own widths (576 and 992 included) and one scheme; a scheme state gives its system scheme and no width; a touch or drawer case one scheme', () => {
  const heights = scopeOf(entryOf({ heights: rec('heights', { open: [group('heights|footer|padding-step', [['/a', 576, null], ['/b', 992, null]])] }) }), { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual(scopeBits(heights), { checks: ['heights'], routes: ['/a', '/b'], widths: [], heightsWidths: [576, 992], schemes: ['light'] })
  const state = scopeOf(entryOf({ scheme: rec('scheme', { open: [group('page-surface|main', [['/c', 1440, 'os-dark/no-choice']])] }) }), { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual(scopeBits(state), { checks: ['scheme'], routes: ['/c'], widths: [], heightsWidths: [], schemes: ['dark'] })
  assert.equal(state.schemeWidth, 1440)
  const first = scopeOf(entryOf({ 'first-interaction': rec('first-interaction', { open: [group('drawer-rows|rows', [['/', 390, 'drawer']]), group('touch-first-tap|"About"', [['/', 1024, 'touch']])] }) }), { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual(scopeBits(first), { checks: ['first-interaction'], routes: ['/'], widths: [390, 1024], heightsWidths: [], schemes: ['light'] })
  assert.deepEqual(first.themeWidths, [390])
  assert.equal(first.homePath, '/')
})

test('scope: what was owed and a sweep.accept row in error are unresolved too; a case with no route, width or scheme is owed everywhere', () => {
  const owed = scopeOf(entryOf({ header: rec('header', { debt: [{ route: '/b', width: null, scheme: 'dark', cause: 'owed', reason: 'timeout', measured: at('t1') }] }) }), { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual(scopeBits(owed), { checks: ['header'], routes: ['/b'], widths: DEFAULT_WIDTHS, heightsWidths: [], schemes: ['dark'] })
  const unreachable = scopeOf(entryOf({ icons: rec('icons', { debt: [{ route: '/c', width: null, scheme: null, cause: 'owed', reason: 'answered 500', measured: at('t1') }] }) }), { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual(scopeBits(unreachable), { checks: ['icons'], routes: ['/c'], widths: [390, 1440], heightsWidths: [], schemes: ['light', 'dark'] })
  const row = { check: 'chips', cause: 'chip-background|span.old', routes: ['/a', '/gone'], widths: [1440], decision: 'D-1', evidence: 'e.png', kind: 'decided' }
  const stale = scopeOf(entryOf({ chips: rec('chips', { acceptErrors: [acceptError('chips', row)] }) }), { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual(scopeBits(stale), { checks: ['chips'], routes: ['/a'], widths: [1440], heightsWidths: [], schemes: ['light', 'dark'] })
})

test('scope: nothing unresolved, or only accepted groups, is an empty scope; --schemes keeps constraining and what it leaves out is counted', () => {
  const clean = scopeOf(entryOf({ chips: rec('chips', { accepted: [{ cause: 'k', kind: 'decided', routes: ['/a'], widths: [1440], schemes: ['dark'], cells: [['/a', 1440, 'dark']], occurrences: 1, measured: at('t1') }] }) }), { schemes: ['light', 'dark'], pages: PAGES })
  assert.deepEqual([clean.empty, clean.checks, clean.routes, clean.excluded], [true, [], [], 0])
  const entry = entryOf({ background: rec('background', { open: [group('page-background|body', [['/a', 390, 'dark']])] }), overflow: rec('overflow', { open: [group('page-overflow|p', [['/b', 320, 'light'], ['/b', 320, 'dark']])] }) })
  const light = scopeOf(entry, { schemes: ['light'], pages: PAGES })
  assert.deepEqual(scopeBits(light), { checks: ['overflow'], routes: ['/b'], widths: [320], heightsWidths: [], schemes: ['light'] })
  assert.equal(light.excluded, 2)
  const none = scopeOf(entryOf({ background: entry.effective.checks.background }), { schemes: ['light'], pages: PAGES })
  assert.deepEqual([none.empty, none.excluded], [true, 1])
  assert.match(scopeLine({ mode: 'scoped', scope: scopeBits(none), excluded: none.excluded, previous: at('t1') }, 4), /nothing was open .* in the schemes of this run \(1 cell\(s\) in another scheme stay carried\) — nothing measured/)
})

// what a scoped run measured, as a report: `rows` are [check, cause, route, width, scheme]
const reportOf = (ids, rows = [], o = {}) => {
  const defects = Object.fromEntries(ids.map((id) => [id, rows.filter((r) => r[0] === id).map(([, cause, route, width, scheme]) => ({ cause, what: cause.split('|')[0], route, width, scheme, source: 0, port: 9 }))]))
  const groups = Object.fromEntries(
    ids.map((id) => [
      id,
      [...new Set(defects[id].map((d) => d.cause))].map((cause) => {
        const mine = defects[id].filter((d) => d.cause === cause)
        return { cause, what: mine[0].what, occurrences: mine.length, routes: [...new Set(mine.map((d) => d.route))], widths: [...new Set(mine.map((d) => d.width))], schemes: [...new Set(mine.map((d) => d.scheme).filter(Boolean))], example: mine[0], examples: [mine[0]] }
      })
    ])
  )
  const checks = ids.map((id) => ({ id, title: id, cases: 4, defects: groups[id].length, defectRows: defects[id].length, listed: 0, notDefects: 0, accepted: 0, acceptErrors: 0, notMeasured: (o.notMeasured?.[id] ?? []).length + (o.owed ?? []).filter((x) => x.checks.includes(id)).length, pass: !groups[id].length, probeMs: 1 }))
  for (const c of checks) if (c.notMeasured) c.pass = false
  return { ...emptyReport({ site: 'http://p', source: 'http://s' }), ranAt: 't2', widths: [320, 390], schemes: ['light', 'dark'], only: ids, routesTotal: 2, routesMeasured: 2, checks, defects, groups, notMeasured: o.notMeasured ?? {}, owed: o.owed ?? [], accepted: o.accepted ?? [], notDefectCases: o.notDefectCases ?? [], acceptErrors: o.acceptErrors ?? [], exit: checks.some((c) => c.defects) ? 1 : checks.some((c) => c.notMeasured) ? 3 : 0 }
}
const scopedRun = (entry, scope) => ({ mode: 'scoped', reason: null, fullWithoutReason: false, scope: scopeBits(scope), excluded: scope.excluded, previous: at(entry.latest.ranAt, entry.latest.out), full: { ranAt: entry.full.ranAt, out: entry.full.out, reason: entry.full.reason }, history: '/d/site-sweep-state.json' })
const rerun = (entry, report, { schemes = ['light', 'dark'], acceptRows = [] } = {}) => {
  const scope = scopeOf(entry, { schemes, pages: PAGES })
  const fresh = recordsOf(report, { out: '/runs/two', mode: 'scoped', acceptRows, fullScope: entry.full.scope })
  const merged = mergeRun({ prev: entry.effective.checks, fresh, covers: coversOf(scope, { pages: PAGES, fullSchemes: entry.full.scope.schemes }), full: false, acceptRows, order: ALL_CHECKS })
  applyHistory(report, { merged, run: scopedRun(entry, scope), order: ALL_CHECKS })
  return { scope, merged, report }
}

test('merge: a group clean on every cell measured again is intermittent, then fixed when absent twice; one that is still there stays open; a check that was not measured is carried and is no pass', () => {
  const entry = entryOf({
    overflow: rec('overflow', { open: [group('page-overflow|div.wide', [['/a', 320, 'light'], ['/a', 390, 'light']]), group('page-overflow|table', [['/b', 320, 'light']])] }),
    header: rec('header', { cases: 48 })
  })
  const table = [['overflow', 'page-overflow|table', '/b', 320, 'light']]
  const { merged, report } = rerun(entry, reportOf(['overflow'], table))
  // confirmed before, absent now, every cell measured again: not fixed yet — it may be flaky
  assert.deepEqual(merged.fixed, {})
  assert.deepEqual(merged.checks.overflow.intermittent.map((g) => [g.cause, g.absent, g.measured.ranAt]), [['page-overflow|div.wide', 1, 't1']])
  assert.deepEqual(merged.checks.overflow.open.map((g) => g.cause), ['page-overflow|table'])
  assert.equal(merged.checks.overflow.open[0].measured.ranAt, 't2')
  assert.equal(merged.checks.header.measured.ranAt, 't1')
  const header = report.checks.find((c) => c.id === 'header')
  assert.deepEqual([header.carried, header.pass, header.carriedFrom.ranAt], [true, false, 't1'])
  assert.deepEqual(report.checks.map((c) => c.id), ALL_CHECKS)
  assert.equal(report.exit, 1)
  assert.equal(report.checks.find((c) => c.id === 'overflow').intermittent, 1)
  assert.deepEqual(report.intermittent.overflow.map((g) => [g.cause, g.absent, g.needs]), [['page-overflow|div.wide', 1, 2]])
  const { summary, md } = summarise(report)
  assert.equal(summary.run.mode, 'scoped')
  // the primary summary holds the intermittent group, counted, with its last sighting and its status
  const sum = summary.checks.find((c) => c.id === 'overflow')
  assert.deepEqual([sum.intermittent, sum.groupList.filter((g) => g.status === 'intermittent').map((g) => [g.key, g.absent, g.needs, g.lastSeen])], [1, [['page-overflow|div.wide', 1, 2, 't1']]])
  assert.match(md, /`page-overflow\|div\.wide` — .*INTERMITTENT: confirmed \(last seen t1\), absent from 1 of 2 consecutive covering run\(s\)/)
  assert.doesNotMatch(md, /## overflow — fail\n\nNo group/)
  assert.equal(summary.checks.find((c) => c.id === 'header').verdict, 'carried')
  assert.match(md, /## header — carried\n\nNot measured in this run: carried from the run of t1\./)
  assert.doesNotMatch(md, /header \| pass/)
  assert.match(summaryLines(summary, 'S').find((l) => l.startsWith('header:')), /^header: carried, 0 group\(s\), 0 not measured — not measured in this run, from the run of t1$/)
  assert.match(formatSummary(report), /## header — carried\n\nCarried from the run of t1 \(`\/runs\/one`\): not measured in this run\./)
  assert.match(formatSummary(report), /- INTERMITTENT: `page-overflow\|div\.wide` — confirmed \(last seen t1\), absent from 1 of 2/)
  // the next re-run measures the intermittent group again, where it was seen
  const after1 = resolveEntry(entryAfter({ previous: entry, identity: entry.identity, record: runRecord({ report, mode: 'scoped', reason: null, out: '/runs/two', scope: report.run.scope, exit: report.exit }), merged, exit: report.exit }))
  assert.deepEqual(scopeBits(scopeOf(after1, { schemes: ['light', 'dark'], pages: PAGES })), { checks: ['overflow'], routes: ['/a', '/b'], widths: [320, 390], heightsWidths: [], schemes: ['light'] })
  // reappearing resets the count: open again, no longer intermittent
  const back = rerun(after1, { ...reportOf(['overflow'], [...table, ['overflow', 'page-overflow|div.wide', '/a', 320, 'light']]), ranAt: 't3' })
  assert.deepEqual(back.merged.checks.overflow.open.map((g) => g.cause).sort(), ['page-overflow|div.wide', 'page-overflow|table'])
  assert.equal(back.merged.checks.overflow.intermittent, undefined)
  // absent a second time in a run that measured every cell of it: fixed, and the fixed group stays resolved
  const second = rerun(after1, { ...reportOf(['overflow'], table), ranAt: 't3' })
  assert.deepEqual(second.merged.fixed, { overflow: ['page-overflow|div.wide'] })
  assert.equal(second.merged.checks.overflow.intermittent, undefined)
  assert.equal(second.report.checks.find((c) => c.id === 'overflow').intermittent, undefined)
  assert.match(formatSummary(second.report), /- fixed: `page-overflow\|div\.wide`/)
  assert.deepEqual(summarise(second.report).summary.checks.find((c) => c.id === 'overflow').fixedSinceLast, ['page-overflow|div.wide'])
  const after2 = resolveEntry(entryAfter({ previous: after1, identity: entry.identity, record: runRecord({ report: second.report, mode: 'scoped', reason: null, out: '/runs/three', scope: second.report.run.scope, exit: second.report.exit }), merged: second.merged, exit: second.report.exit }))
  assert.deepEqual(scopeBits(scopeOf(after2, { schemes: ['light', 'dark'], pages: PAGES })), { checks: ['overflow'], routes: ['/b'], widths: [320], heightsWidths: [], schemes: ['light'] })
})

test('merge: an intermittent group is not counted absent by a run that did not measure all its cells, or whose cells are owed; a full run counts', () => {
  const entry = entryOf({ overflow: rec('overflow', { open: [group('page-overflow|p', [['/b', 320, 'light'], ['/b', 320, 'dark']])] }) })
  // --schemes light: the dark cell is not measured, so the group stays open with that cell (carried), nothing is absent
  const part = rerun(entry, reportOf(['overflow']), { schemes: ['light'] })
  assert.equal(part.merged.checks.overflow.intermittent, undefined)
  assert.deepEqual(part.merged.checks.overflow.open[0].cells, [['/b', 320, 'dark']])
  // a cell owed in the run is not measured: the group keeps that cell open, nothing is absent
  const owed = rerun(entry, reportOf(['overflow'], [], { owed: [{ route: '/b', width: 320, scheme: 'light', reason: 'timeout', checks: ['overflow'] }] }))
  assert.deepEqual(owed.merged.fixed, {})
  assert.equal(owed.merged.checks.overflow.intermittent, undefined)
  assert.deepEqual(owed.merged.checks.overflow.open.map((g) => g.cells), [[['/b', 320, 'light']]])
  // a full run with a cell owed: the group is kept as intermittent and the count does not move
  const blocked = mergeRun({ prev: entry.effective.checks, fresh: recordsOf(reportOf(['overflow'], [], { owed: [{ route: '/b', width: 320, scheme: 'light', reason: 'timeout', checks: ['overflow'] }] }), { out: '/runs/full', mode: 'full', fullScope: fullScope() }), covers: () => true, full: true, order: ALL_CHECKS })
  assert.deepEqual(blocked.checks.overflow.intermittent.map((g) => [g.cause, g.absent]), [['page-overflow|p', 0]])
  assert.deepEqual(blocked.fixed, {})
  const full = mergeRun({ prev: entry.effective.checks, fresh: recordsOf(reportOf(['overflow']), { out: '/runs/full', mode: 'full', fullScope: fullScope() }), covers: () => true, full: true, order: ALL_CHECKS })
  assert.deepEqual(full.checks.overflow.intermittent.map((g) => [g.cause, g.absent]), [['page-overflow|p', 1]])
  assert.equal(effectiveExit(full.checks, 0), 1)
  // and a second full run closes it
  const next = mergeRun({ prev: full.checks, fresh: recordsOf({ ...reportOf(['overflow']), ranAt: 't3' }, { out: '/runs/full2', mode: 'full', fullScope: fullScope() }), covers: () => true, full: true, order: ALL_CHECKS })
  assert.deepEqual(next.fixed, { overflow: ['page-overflow|p'] })
})

test('merge: an intermittent group that comes back in a run that measured only some of its cells keeps the others owed, and cannot be fixed without them', () => {
  const cells = [['/a', 320, 'light'], ['/a', 320, 'dark']]
  const entry = entryOf({ overflow: rec('overflow', { intermittent: [{ ...group('page-overflow|p', cells), absent: 1 }] }) })
  // --schemes light: the dark cell is not measured; the group shows again on the light cell
  const back = rerun(entry, reportOf(['overflow'], [['overflow', 'page-overflow|p', '/a', 320, 'light']]), { schemes: ['light'] })
  assert.equal(back.merged.checks.overflow.intermittent, undefined)
  const [open] = back.merged.checks.overflow.open
  assert.deepEqual([open.cause, open.cells, open.carriedCells], ['page-overflow|p', cells, 1])
  assert.deepEqual(back.merged.carried.overflow.cells['page-overflow|p'], [['/a', 320, 'dark']])
  // the next run measures the dark cell too, and a clean light cell alone does not close the group
  const next = resolveEntry(entryAfter({ previous: entry, identity: entry.identity, record: runRecord({ report: back.report, mode: 'scoped', reason: null, out: '/runs/two', scope: back.report.run.scope, exit: back.report.exit }), merged: back.merged, exit: back.report.exit }))
  assert.deepEqual(scopeBits(scopeOf(next, { schemes: ['light', 'dark'], pages: PAGES })).schemes, ['light', 'dark'])
  const light = rerun(next, { ...reportOf(['overflow']), ranAt: 't3' }, { schemes: ['light'] })
  assert.deepEqual(light.merged.fixed, {})
  assert.deepEqual(light.merged.checks.overflow.open.map((g) => g.cells), [[['/a', 320, 'dark']]])
})

test('merge: in a full run, a group that is seen again keeps the earlier cells that timed out or are owed — open or intermittent before', () => {
  const cells = [['/a', 320, 'light'], ['/a', 320, 'dark']]
  const owed = { owed: [{ route: '/a', width: 320, scheme: 'dark', reason: 'timeout', checks: ['overflow'] }] }
  const seen = [['overflow', 'page-overflow|p', '/a', 320, 'light']]
  const fullMerge = (prev) => mergeRun({ prev, fresh: recordsOf(reportOf(['overflow'], seen, owed), { out: '/runs/full', mode: 'full', fullScope: fullScope() }), covers: () => true, full: true, order: ALL_CHECKS })
  for (const earlier of [rec('overflow', { intermittent: [{ ...group('page-overflow|p', cells), absent: 1 }] }), rec('overflow', { open: [group('page-overflow|p', cells)] })]) {
    const merged = fullMerge({ overflow: earlier })
    const [open] = merged.checks.overflow.open
    assert.deepEqual([open.cells, open.carriedCells], [cells, 1])
    assert.equal(merged.checks.overflow.intermittent, undefined)
    assert.deepEqual(merged.fixed, {})
  }
})

test('merge: a group outside the measured scope is carried with the run that measured it and keeps the run failing, whatever the scope found', () => {
  const entry = entryOf({
    background: rec('background', { open: [group('page-background|body', [['/a', 390, 'dark']])] }),
    overflow: rec('overflow', { open: [group('page-overflow|p', [['/b', 320, 'light'], ['/b', 320, 'dark']])] })
  })
  // --schemes light: the dark cells are not measured. The light cell of the overflow group is clean now
  const { merged, report } = rerun(entry, reportOf(['overflow']), { schemes: ['light'] })
  assert.deepEqual(merged.fixed, {})
  assert.deepEqual(merged.checks.overflow.open.map((g) => [g.cause, g.cells, g.measured.ranAt]), [['page-overflow|p', [['/b', 320, 'dark']], 't1']])
  assert.deepEqual(merged.carried.overflow.open.map((g) => g.cause), ['page-overflow|p'])
  assert.equal(merged.carried.background.whole, true)
  const overflow = report.checks.find((c) => c.id === 'overflow')
  assert.deepEqual([overflow.pass, overflow.defects, overflow.carriedGroups, overflow.scoped], [false, 1, 1, true])
  assert.equal(report.ownExit, 0)
  assert.equal(report.exit, 1)
  const { summary, md } = summarise(report)
  const carried = summary.checks.find((c) => c.id === 'overflow').groupList[0]
  assert.deepEqual([carried.status, carried.carriedFrom, carried.evidence], ['carried', 't1', '/runs/one/site-sweep.json#groups.x[0]'])
  assert.deepEqual(summary.checks.find((c) => c.id === 'overflow').verdict, 'fail')
  assert.deepEqual([summary.checks.find((c) => c.id === 'background').verdict, summary.checks.find((c) => c.id === 'background').groups], ['carried', 1])
  assert.match(md, /`page-overflow\|p` — page-overflow; .*CARRIED DEFECT; carried from the run of t1, not measured in this run/)
  assert.match(md, /`page-background\|body` — .*CARRIED DEFECT/)
  assert.doesNotMatch(md, /— fixed \(/)
  // the example of a carried group is one of the cells it still has
  assert.deepEqual(carried.examples, [])
  assert.match(formatSummary(report), /- CARRIED page-overflow — 1 cell\(s\) on 1 route\(s\).*measured t1, evidence `\/runs\/one`/)
  // the output of a scoped re-run is no baseline, no behaviour pass and no fix-measure baseline: it carries what it did not measure
  assert.equal(report.run.mode, 'scoped')
  const dir = tmp()
  writeFileSync(path.join(dir, 'site-sweep.json'), JSON.stringify(report))
  assert.throws(() => readBaseline(dir, '1.0.0'), /a scoped re-run .* is not a baseline/)
  assert.throws(() => baselineOf(report, '1.0.0'), /a scoped re-run .* is not a baseline/)
  const behaviour = behaviourProblems({ file: path.join(dir, 'site-sweep.json') }).problems.map((x) => x.code)
  assert.ok(behaviour.includes('behaviour-pass-scoped'), behaviour.join())
  const full = { ...report, run: { ...report.run, mode: 'full' }, carried: {}, checks: report.checks.map(({ carried, scoped, carriedGroups, carriedNotMeasured, carriedFrom, ...c }) => c) }
  writeFileSync(path.join(dir, 'site-sweep.json'), JSON.stringify(full))
  assert.ok(!behaviourProblems({ file: path.join(dir, 'site-sweep.json') }).problems.some((x) => x.code === 'behaviour-pass-scoped'))
  // any sign of a carried result is refused at the three gates, whatever the run record says: no run record, a full one, a carried check, carried groups
  const signs = {
    'no run record': { ...report, run: undefined },
    'a run record that says full': { ...report, run: { ...report.run, mode: 'full' } },
    'carried groups with a full record': { ...full, carried: report.carried },
    'a carried check': { ...full, checks: [{ ...full.checks[0], carried: true }, ...full.checks.slice(1)] },
    'a scoped check': { ...full, checks: [{ ...full.checks[0], scoped: true }, ...full.checks.slice(1)] },
    'carried groups on a check': { ...full, checks: [{ ...full.checks[0], carriedGroups: 1 }, ...full.checks.slice(1)] },
    'a run record that is not an object': { ...full, run: 'full' },
    'a carried check in the fix-measure it holds': { ...full, fixMeasure: { schema: 'tracy-fix-measure/v1', checks: [{ id: 'overflow', pass: false, carried: true }] } }
  }
  for (const [what, doc] of Object.entries(signs)) {
    assert.equal(typeof carriedEvidence(doc), 'string', what)
    writeFileSync(path.join(dir, 'site-sweep.json'), JSON.stringify(doc))
    assert.throws(() => readBaseline(dir, '1.0.0'), /is not a baseline/, what)
    assert.throws(() => baselineOf(doc, '1.0.0'), /is not a baseline/, what)
    assert.ok(behaviourProblems({ file: path.join(dir, 'site-sweep.json') }).problems.some((x) => x.code === 'behaviour-pass-scoped'), what)
  }
  assert.equal(carriedEvidence(full), null)
  assert.equal(carriedEvidence({ ...full, run: undefined, carried: undefined }), null)
})

test('merge: a group found again in the scope keeps the cells that were not measured; a cell owed now is not measured, so its group is not fixed', () => {
  const entry = entryOf({ overflow: rec('overflow', { open: [group('page-overflow|p', [['/b', 320, 'light'], ['/b', 320, 'dark']])] }) })
  const part = rerun(entry, reportOf(['overflow'], [['overflow', 'page-overflow|p', '/b', 320, 'light']]), { schemes: ['light'] })
  assert.deepEqual(part.merged.checks.overflow.open.map((g) => [g.cells.length, g.carriedCells, g.measured.ranAt]), [[2, 1, 't2']])
  assert.match(summarise(part.report).md, /DEFECT; 1 of its cell\(s\) carried, not measured in this run/)
  const owed = rerun(entry, reportOf(['overflow'], [], { owed: [{ route: '/b', scheme: 'dark', reason: 'timeout', checks: ['overflow'] }] }))
  assert.deepEqual(owed.merged.fixed, {})
  assert.deepEqual(owed.merged.checks.overflow.open.map((g) => [g.cells, g.measured.ranAt]), [[[['/b', 320, 'dark']], 't1']])
  assert.equal(owed.merged.checks.overflow.debt.length, 1)
  assert.equal(owed.report.exit, 1)
})

test('merge: what was owed stays owed until it is measured; an empty scope measures nothing and passes nothing', () => {
  const debt = { route: '/c', width: 1440, scheme: 'dark', cause: 'repeated-label', reason: 'twice', measured: at('t1') }
  const entry = entryOf({ chips: rec('chips', { debt: [debt] }), overflow: rec('overflow', { open: [group('page-overflow|p', [['/b', 320, 'light']])] }) })
  // --schemes light leaves the dark chip case out: the overflow group is fixed, the owed case is carried and the run is 3, not 0
  const { merged, report } = rerun(entry, reportOf(['overflow']), { schemes: ['light'] })
  assert.deepEqual(merged.fixed, {})
  assert.deepEqual(merged.checks.overflow.intermittent.map((g) => [g.cause, g.absent]), [['page-overflow|p', 1]])
  assert.deepEqual(merged.checks.chips.debt, [debt])
  // the group that is absent once is intermittent: it still fails the run (1), over the owed case (3)
  assert.equal(report.exit, 1)
  assert.equal(effectiveExit(merged.checks, 0), 1)
  assert.match(summarise(report).md, /\*\*carried: repeated-label\*\* — 1 case\(s\) in chips/)
  // measured in a later run and readable: the owed case is gone
  const later = rerun(entryOf({ chips: rec('chips', { debt: [debt] }) }), reportOf(['chips']))
  assert.deepEqual([later.merged.checks.chips.debt, later.report.exit], [[], 0])
  // nothing unresolved: no check runs, every check is carried, none passes
  const clean = entryOf({})
  const scope = scopeOf(clean, { schemes: ['light', 'dark'], pages: PAGES })
  const empty = emptyReport({ site: 'http://p', source: 'http://s' })
  applyHistory(empty, { merged: mergeRun({ prev: clean.effective.checks, fresh: recordsOf(empty, { out: '/runs/two', mode: 'scoped', fullScope: clean.full.scope }), covers: coversOf(scope, { pages: PAGES, fullSchemes: ['light', 'dark'] }), full: false, order: ALL_CHECKS }), run: scopedRun(clean, scope), order: ALL_CHECKS })
  assert.equal(empty.exit, 0)
  assert.deepEqual([empty.checks.length, empty.checks.every((c) => c.carried && !c.pass)], [ALL_CHECKS.length, true])
  const s = summarise(empty)
  assert.ok(s.summary.checks.every((c) => c.verdict === 'carried'))
  assert.match(s.md, /\*\*Scoped re-run\*\*: nothing was unresolved, nothing was measured\./)
  assert.match(scopeLine(empty.run, 4), /^scoped re-run: nothing was open in the run of t1 — nothing measured; every check is carried/)
})

test('merge: a sweep.accept error is carried until its row is gone or matches; a full run carries nothing and reports what is gone as fixed', () => {
  const row = { check: 'chips', cause: 'chip-background|span.old', routes: ['/a'], decision: 'D-1', evidence: 'e.png', kind: 'decided' }
  const entry = entryOf({ chips: rec('chips', { acceptErrors: [acceptError('chips', row, 'sweep.accept[0] chips: stale')] }) })
  const kept = rerun(entry, reportOf(['chips']), { acceptRows: [row] })
  assert.equal(kept.merged.checks.chips.acceptErrors.length, 1)
  assert.equal(kept.report.exit, 1)
  assert.equal(kept.report.checks.find((c) => c.id === 'chips').acceptErrors, 1)
  assert.match(summarise(kept.report).md, /carried from the run of t1: sweep\.accept\[0\] chips: stale/)
  const gone = rerun(entry, reportOf(['chips']), { acceptRows: [] })
  assert.deepEqual([gone.merged.checks.chips.acceptErrors, gone.report.exit], [[], 0])
  const matched = rerun(entry, reportOf(['chips'], [], { accepted: [{ check: 'chips', cause: row.cause, what: 'chip-background', kind: 'decided', decision: 'D-1', evidence: 'e.png', occurrences: 1, routes: ['/a'], widths: [1440], schemes: ['dark'] }] }), { acceptRows: [row] })
  assert.deepEqual(matched.merged.checks.chips.acceptErrors, [])
  // a full run: every check is measured, nothing is carried
  const before = entryOf({ overflow: rec('overflow', { open: [group('page-overflow|p', [['/b', 320, 'light']])], debt: [{ route: '/c', width: null, scheme: 'dark', cause: 'owed', reason: 'timeout', measured: at('t1') }] }) })
  const full = mergeRun({ prev: before.effective.checks, fresh: recordsOf(reportOf(ALL_CHECKS), { out: '/runs/full', mode: 'full', fullScope: fullScope() }), covers: () => true, full: true, order: ALL_CHECKS })
  assert.deepEqual([full.fixed, full.carried, Object.values(full.checks).every((c) => c.measured.out === '/runs/full' && !c.open.length && !c.debt.length)], [{}, {}, true])
  assert.deepEqual(full.checks.overflow.intermittent.map((g) => [g.cause, g.absent]), [['page-overflow|p', 1]])
  // a second full run that does not see it closes it
  const closed = mergeRun({ prev: full.checks, fresh: recordsOf({ ...reportOf(ALL_CHECKS), ranAt: 't3' }, { out: '/runs/full2', mode: 'full', fullScope: fullScope() }), covers: () => true, full: true, order: ALL_CHECKS })
  assert.deepEqual([closed.fixed, closed.checks.overflow.intermittent], [{ overflow: ['page-overflow|p'] }, undefined])
})

test('sweep.accept in a scoped run: a row whose group is outside the measured cells is left unvalidated, never a stale error; the same row is an error in a full run', () => {
  const judged = () => ({ chips: { defects: [{ route: '/a', width: 390, scheme: 'light', what: 'chip-background', cause: 'chip-background|span.badge', source: 'a', port: 'b' }], notDefects: [], notMeasured: [] } })
  const rows = [
    // its group occurs on /b at 1440 only, which this run did not measure
    { check: 'chips', cause: 'chip-radius|span.badge', routes: ['/a', '/b'], decision: 'D-1', evidence: 'e', kind: 'decided' },
    // it covers /a at 390 and names /b and dark, where the scope did not look
    { check: 'chips', cause: 'chip-background|span.badge', routes: ['/a', '/b'], schemes: ['light', 'dark'], decision: 'D-2', evidence: 'e', kind: 'decided' },
    { check: 'chips', cause: 'icons-unpairable', kind: 'not-measurable', cases: 2, reason: 'r', measurement: 'm', evidence: 'e' }
  ]
  const scoped = applyAccept(judged(), rows, { routes: ['/a', '/b'], widths: [390], partial: true })
  assert.deepEqual(scoped.errors, [])
  assert.deepEqual(scoped.skipped.map((x) => [x.row, x.unvalidated]), [[0, true], [2, true]])
  assert.deepEqual(scoped.accepted.map((a) => [a.cause, a.occurrences]), [['chip-background|span.badge', 1]])
  const whole = applyAccept(judged(), rows, { routes: ['/a', '/b'], widths: [390] })
  assert.deepEqual(whole.errors.map((e) => e.row), [0, 1, 2])
  assert.match(whole.errors[0].message, /stale exception/)
  assert.match(whole.errors[1].message, /names route \/b, scheme dark where the group does not occur/)
  // a defect row two rows cover is an error in a scoped run too
  const twice = applyAccept(judged(), [rows[1], { ...rows[1], decision: 'D-3' }], { routes: ['/a'], widths: [390], partial: true })
  assert.match(twice.errors[0].message, /also covered by sweep\.accept\[0\]/)
})

// ---- the state file ---------------------------------------------------------------------------------------------------------

const planOf = (paths) => ({ pages: paths.map((p) => ({ id: p, path: p, status: 200, view: null, sourceRoute: p, sourceRendered: null })), hooks: { site: { dark: 'cookie:t=dark' } }, marks: {}, selectors: {}, behaviour: {} })

test('identity: the two origins and the dossier inputs; another site, source, page list or switch is another history', () => {
  const a = identityOf({ site: 'http://p', source: 'http://s', plan: planOf(PAGES) })
  assert.equal(identityOf({ site: 'http://p', source: 'http://s', plan: planOf(PAGES) }).key, a.key)
  const others = [
    identityOf({ site: 'http://q', source: 'http://s', plan: planOf(PAGES) }),
    identityOf({ site: 'http://p', source: 'http://t', plan: planOf(PAGES) }),
    identityOf({ site: 'http://p', source: 'http://s', plan: planOf(['/', '/a']) }),
    identityOf({ site: 'http://p', source: 'http://s', plan: { ...planOf(PAGES), hooks: { site: { dark: 'attr:data-theme=dark' } } } }),
    identityOf({ site: 'http://p', source: 'http://s', plan: planOf(PAGES), specDir: '/spec' }),
    identityOf({ site: 'http://p', source: 'http://s', plan: { ...planOf(PAGES), marks: [{ id: 'm' }] } }),
    identityOf({ site: 'http://p', source: 'http://s', plan: { ...planOf(PAGES), selectors: { x: '.y' } } }),
    identityOf({ site: 'http://p', source: 'http://s', plan: { ...planOf(PAGES), behaviour: { forms: false } } })
  ]
  assert.equal(new Set([a.key, ...others.map((o) => o.key)]).size, 9)
  // the sweep.accept rows are judged against the history, not part of what it belongs to: adding, changing or removing a row keeps the key
  const row = { check: 'overflow', cause: 'k', routes: ['/a'], kind: 'decided', decision: 'D-1', evidence: 'e.png' }
  assert.equal(identityOf({ site: 'http://p', source: 'http://s', plan: { ...planOf(PAGES), accept: [row] } }).key, a.key)
  assert.equal(identityOf({ site: 'http://p', source: 'http://s', plan: { ...planOf(PAGES), accept: [row, { ...row, routes: ['/b'] }] } }).key, a.key)
  // a key made by the algorithm that hashed the rows is another key: such an entry is no previous run
  assert.notEqual(keyOf({ site: 'http://p', source: 'http://s', spec: sha256('{"pages":[]}') }), a.key)
})

test('none history identity binds kind and spec reference files without requiring a source fingerprint', () => {
  const spec = mkdtempSync(path.join(tmpdir(), 'sweep-none-identity-'))
  tmps.push(spec)
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [{ path: '/', file: 'home.html' }] }))
  writeFileSync(path.join(spec, 'reference.json'), JSON.stringify({ kind: 'none' }))
  const pages = planOf(['/']).pages.map((p) => ({ ...p, pagemapPath: '/', referenceKind: 'none' }))
  const plan = { ...planOf(['/']), pages, applicabilityVersion: 1 }
  const none = identityOf({ site: 'http://p', source: null, plan, specDir: spec })
  assert.match(none.source, /^not-applicable:/)
  assert.equal(identityOf({ site: 'http://p', source: null, plan, specDir: spec }).key, none.key)
  writeFileSync(path.join(spec, 'reference.json'), JSON.stringify({ kind: 'html' }))
  assert.notEqual(identityOf({ site: 'http://p', source: null, plan, specDir: spec }).key, none.key)
  const mixed = identityOf({ site: 'http://p', source: 'http://s', plan: { ...plan, pages: [...pages, { ...pages[0], id: '/b', path: '/b', referenceKind: 'html' }] }, specDir: spec })
  assert.equal(mixed.source, 'http://s')
})

// ---- the accept rows against the evidence of a history ---------------------------------------------------------------------

const ROW = (cause, routes, o = {}) => ({ check: 'overflow', cause, routes, kind: 'decided', decision: 'D-1', evidence: 'e.png', ...o })
const judged = (stored, rows) => rejudgeChecks(stored.effective.checks, rows, { fullScope: fullScope() })
const valid = (stored, checks) => stateProblems(docOf({ ...stored, effective: { exit: exitOf(checks), checks } }))
const G = (cause = 'page-overflow|div.wide') => group(cause, [['/a', 320, 'light'], ['/a', 390, 'light'], ['/b', 320, 'light']])

test('rejudge: a row added covers the carried group and only the cells it names; a row removed owes them again; the history stays valid', () => {
  const st = storedOf({ overflow: rec('overflow', { open: [G()] }) })
  const none = judged(st, [])
  assert.equal(none.overflow.open[0], st.effective.checks.overflow.open[0], 'no row: the group is as it was')
  const one = judged(st, [ROW('page-overflow|div.wide', ['/a'])])
  assert.deepEqual(one.overflow.open.map((g) => [g.cause, g.cells, g.occurrences]), [['page-overflow|div.wide', [['/b', 320, 'light']], 1]])
  assert.deepEqual(one.overflow.accepted.map((a) => [a.cause, a.cells, a.occurrences, a.notCovered, a.decision]), [['page-overflow|div.wide', [['/a', 320, 'light'], ['/a', 390, 'light']], 2, 1, 'D-1']])
  assert.deepEqual(valid(st, one), [])
  const all = judged(st, [ROW('page-overflow|div.wide', ['/a', '/b'])])
  assert.deepEqual([all.overflow.open, all.overflow.accepted.length, all.overflow.acceptErrors], [[], 1, []])
  assert.equal(exitOf(all), 0)
  assert.deepEqual(valid(st, all), [])
  // the row is removed (or narrowed): the cells it covered are open again, with the examples of the group
  const accepted = { ...st, effective: { exit: 0, checks: all } }
  const back = judged(accepted, [])
  assert.deepEqual(back.overflow.open.map((g) => [g.cause, g.cells.length, g.occurrences, g.examples.length]), [['page-overflow|div.wide', 3, 3, 1]])
  assert.deepEqual([back.overflow.accepted, back.overflow.acceptErrors], [[], []])
  const narrow = judged(accepted, [ROW('page-overflow|div.wide', ['/b'])])
  assert.deepEqual(narrow.overflow.open[0].cells, [['/a', 320, 'light'], ['/a', 390, 'light']])
  assert.deepEqual(valid(accepted, narrow), [])
  // a round trip is stable
  assert.deepEqual(judged({ ...st, effective: { exit: 1, checks: one } }, [ROW('page-overflow|div.wide', ['/a'])]), one)
})

test('rejudge: a row that matches nothing, names a route the group is not on, or covers a cell another row covers is an accept error, with its cells; nothing is accepted by it', () => {
  const st = storedOf({ overflow: rec('overflow', { open: [G()] }), chips: rec('chips') })
  const stale = judged(st, [ROW('page-overflow|gone', ['/a'])])
  assert.match(stale.overflow.acceptErrors[0].message, /^sweep\.accept\[0\] overflow "page-overflow\|gone": matches no defect group in this run — a stale exception/)
  assert.deepEqual([stale.overflow.acceptErrors[0].row.cause, stale.overflow.acceptErrors[0].cells.length > 0, stale.overflow.accepted, stale.overflow.open.length], ['page-overflow|gone', true, [], 1])
  assert.equal(exitOf(stale), 1)
  assert.deepEqual(valid(st, stale), [])
  const over = judged(st, [ROW('page-overflow|div.wide', ['/a', '/c'])])
  assert.match(over.overflow.acceptErrors[0].message, /names route \/c where the group does not occur/)
  assert.deepEqual(over.overflow.accepted, [])
  const twice = judged(st, [ROW('page-overflow|div.wide', ['/a']), ROW('page-overflow|div.wide', ['/a', '/b'])])
  assert.match(twice.overflow.acceptErrors[0].message, /^sweep\.accept\[1\] .*also covered by sweep\.accept\[0\]/)
  assert.deepEqual(twice.overflow.accepted.map((a) => a.occurrences), [2])
  // a row of a check this history does not hold is not judged
  assert.deepEqual(judged(st, [ROW('x', ['/a'], { check: 'forms' })].map((r) => ({ ...r, check: 'unknown' }))).overflow.acceptErrors, [])
  // a row that is gone takes its error with it
  assert.deepEqual(judged({ ...st, effective: { exit: 1, checks: stale } }, []).overflow.acceptErrors, [])
})

test('merge: a cause that is accepted on some cells and open on others keeps its accepted cells through a scoped run that finds the open ones again; a row removed owes them all', () => {
  const rows = [ROW('page-overflow|div.wide', ['/a'])]
  const st = storedOf({ overflow: rec('overflow', { open: [G()] }) })
  const entry = resolveEntry({ ...st, effective: { exit: 1, checks: judged(st, rows) } })
  assert.equal(entry.effective.checks.overflow.accepted[0].cells.length, 2)
  const scope = scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })
  const fresh = recordsOf(reportOf(['overflow'], [['overflow', 'page-overflow|div.wide', '/b', 320, 'light']]), { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope })
  const merged = mergeRun({ prev: entry.effective.checks, fresh, covers: coversOf(scope, { pages: PAGES, fullSchemes: ['light', 'dark'] }), full: false, acceptRows: rows, order: ALL_CHECKS })
  assert.deepEqual(merged.checks.overflow.accepted.map((a) => a.cells), [[['/a', 320, 'light'], ['/a', 390, 'light']]])
  assert.deepEqual(merged.checks.overflow.open.map((g) => g.cells), [[['/b', 320, 'light']]])
  const after = { ...st, runs: { ...st.runs, t2: record({ ranAt: 't2', mode: 'scoped', exit: 1, out: '/runs/two', scope: scopeBits(scope) }) }, latest: 't2', log: ['t1', 't2'], effective: { exit: 1, checks: merged.checks } }
  assert.deepEqual(stateProblems(docOf(after)), [])
  const back = rejudgeChecks(merged.checks, [], { fullScope: fullScope() })
  assert.deepEqual([back.overflow.accepted, back.overflow.open.map((g) => g.cells.length)], [[], [3]])
})

test('merge: an accepted cell the run covered but owed (not measured) is kept; one it read is judged by the run', () => {
  const rows = [ROW('page-overflow|a', ['/a'])]
  const st = storedOf({ overflow: rec('overflow', { open: [G('page-overflow|a'), group('page-overflow|b', [['/a', 320, 'light']])] }) })
  const entry = resolveEntry({ ...st, effective: { exit: 1, checks: judged(st, rows) } })
  const scope = scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })
  const owed = { overflow: [{ route: '/a', width: 320, scheme: 'light', cause: 'timeout', reason: 'synthetic: the read timed out' }] }
  const report = reportOf(['overflow'], [], { notMeasured: owed })
  const fresh = recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope })
  const merged = mergeRun({ prev: entry.effective.checks, fresh, covers: coversOf(scope, { pages: PAGES, fullSchemes: ['light', 'dark'] }), full: false, acceptRows: rows, order: ALL_CHECKS })
  assert.deepEqual(merged.checks.overflow.accepted.map((a) => a.cells.find((c) => c[0] === '/a' && c[1] === 320)), [['/a', 320, 'light']], 'the owed cell stays accepted')
  const back = rejudgeChecks(merged.checks, [], { fullScope: fullScope() })
  assert.ok(back.overflow.open.find((g) => g.cause === 'page-overflow|a').cells.some((c) => c[0] === '/a' && c[1] === 320))
})

test('merge: a cell the run owes as a case a not-measurable row closed is not read either: the accepted cell and the open group on it stay', () => {
  const rows = [ROW('page-overflow|a', ['/a'])]
  const st = storedOf({ overflow: rec('overflow', { open: [G('page-overflow|a'), group('page-overflow|b', [['/a', 320, 'light']])] }) })
  const entry = resolveEntry({ ...st, effective: { exit: 1, checks: judged(st, rows) } })
  const scope = scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })
  const report = { ...reportOf(['overflow'], []), closedNotMeasured: { overflow: [{ route: '/a', width: 320, scheme: 'light', cause: 'synthetic-cause', reason: 'synthetic: closed by a hand measurement' }] } }
  const fresh = recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope })
  const merged = mergeRun({ prev: entry.effective.checks, fresh, covers: coversOf(scope, { pages: PAGES, fullSchemes: ['light', 'dark'] }), full: false, acceptRows: rows, order: ALL_CHECKS })
  assert.ok(merged.checks.overflow.accepted.some((a) => a.cells.some((c) => c[0] === '/a' && c[1] === 320)), 'the accepted cell stays')
  assert.deepEqual(merged.checks.overflow.open.map((g) => g.cause), ['page-overflow|b'], 'and so does the other cause')
  // the open cell of cause a that this run did read clean (/b) is absent once: intermittent, not fixed; cause b, on the owed cell, is neither
  assert.deepEqual(merged.fixed, {})
  assert.deepEqual(merged.checks.overflow.intermittent.map((g) => [g.cause, g.absent, g.cells]), [['page-overflow|a', 1, [['/b', 320, 'light']]]])
  // a second consecutive run that reads every cell of a: fixed; the accepted cells and the owed cell of b still stay
  const second = { ...report, ranAt: 't3' }
  const after1 = resolveEntry(entryAfter({ previous: entry, identity: entry.identity, record: runRecord({ report, mode: 'scoped', reason: null, out: '/runs/two', scope: scopeBits(scope), exit: 1 }), merged, exit: 1 }))
  const next = rerun(after1, second, { acceptRows: rows })
  assert.deepEqual(next.merged.fixed, { overflow: ['page-overflow|a'] })
  assert.equal(next.merged.checks.overflow.intermittent, undefined)
  assert.ok(next.merged.checks.overflow.accepted.some((a) => a.cells.some((c) => c[0] === '/a' && c[1] === 320)), 'the accepted cell stays')
  assert.deepEqual(next.merged.checks.overflow.open.map((g) => g.cause), ['page-overflow|b'], 'and the owed cell stays open')
})

test('merge: a row of this run that accepts some cells of an earlier open or intermittent group leaves its other cells pending — intermittent, never dropped; fixed only after two covering absences', () => {
  const row = ROW('page-overflow|div.wide', ['/a'])
  const accepted = [{ check: 'overflow', cause: 'page-overflow|div.wide', what: 'overflow', kind: 'decided', decision: 'D-1', evidence: 'e.png', occurrences: 2, routes: ['/a'], widths: [320, 390], schemes: ['light'] }]
  const notDefectCases = [320, 390].map((width) => ({ check: 'overflow', route: '/a', width, scheme: 'light', accepted: true, acceptCause: 'page-overflow|div.wide' }))
  const entry = resolveEntry(storedOf({ overflow: rec('overflow', { open: [G()] }) }))
  const one = rerun(entry, reportOf(['overflow'], [], { accepted, notDefectCases }), { acceptRows: [row] })
  const check = one.merged.checks.overflow
  assert.deepEqual(check.accepted.map((a) => a.cells), [[['/a', 320, 'light'], ['/a', 390, 'light']]])
  assert.deepEqual(check.open, [])
  assert.deepEqual(check.intermittent.map((g) => [g.cause, g.absent, g.cells, g.occurrences]), [['page-overflow|div.wide', 1, [['/b', 320, 'light']], 1]], 'the cell the row does not name is pending')
  assert.deepEqual(one.merged.fixed, {})
  assert.equal(exitOf(one.merged.checks), 1)
  // the next run measures only the pending cell (the accepted cells are carried); absent twice, it is fixed and the accepted cells stay
  const after = resolveEntry(entryAfter({ previous: entry, identity: entry.identity, record: runRecord({ report: one.report, mode: 'scoped', reason: null, out: '/runs/two', scope: scopeBits(one.scope), exit: 1 }), merged: one.merged, exit: 1 }))
  const two = rerun(after, { ...reportOf(['overflow'], []), ranAt: 't3' }, { acceptRows: [row] })
  assert.deepEqual(two.merged.fixed, { overflow: ['page-overflow|div.wide'] })
  assert.equal(two.merged.checks.overflow.intermittent, undefined)
  assert.deepEqual(two.merged.checks.overflow.accepted.map((a) => a.cells), [[['/a', 320, 'light'], ['/a', 390, 'light']]])
})

test('merge: a cell this run read clean beside a cell a row accepts and a cell it owes stays pending with the group — it owes its second absence', () => {
  const row = ROW('page-overflow|div.wide', ['/a'], { widths: [320] })
  const accepted = [{ check: 'overflow', cause: 'page-overflow|div.wide', what: 'overflow', kind: 'decided', decision: 'D-1', evidence: 'e.png', occurrences: 1, routes: ['/a'], widths: [320], schemes: ['light'] }]
  const notDefectCases = [{ check: 'overflow', route: '/a', width: 320, scheme: 'light', accepted: true, acceptCause: 'page-overflow|div.wide' }]
  const owed = { overflow: [{ route: '/b', width: 320, scheme: 'light', cause: 'timeout', reason: 'synthetic: the read timed out' }] }
  const entry = resolveEntry(storedOf({ overflow: rec('overflow', { open: [G()] }) }))
  // /a 320 accepted, /a 390 read clean, /b 320 owed: the group is not absent, and no cell of it but the accepted one leaves it
  const one = rerun(entry, reportOf(['overflow'], [], { accepted, notDefectCases, notMeasured: owed }), { acceptRows: [row] })
  const check = one.merged.checks.overflow
  assert.deepEqual(check.accepted.map((a) => a.cells), [[['/a', 320, 'light']]])
  assert.deepEqual(check.open.map((g) => [g.cause, g.cells]), [['page-overflow|div.wide', [['/a', 390, 'light'], ['/b', 320, 'light']]]])
  assert.equal(check.intermittent, undefined)
  assert.deepEqual(one.merged.fixed, {})
  assert.equal(exitOf(one.merged.checks), 1)
  // the next run reads both pending cells clean: intermittent over both, and fixed only after a second covering absence
  const after = resolveEntry(entryAfter({ previous: entry, identity: entry.identity, record: runRecord({ report: one.report, mode: 'scoped', reason: null, out: '/runs/two', scope: scopeBits(one.scope), exit: 1 }), merged: one.merged, exit: 1 }))
  const two = rerun(after, { ...reportOf(['overflow'], []), ranAt: 't3' }, { acceptRows: [row] })
  assert.deepEqual(two.merged.checks.overflow.intermittent.map((g) => [g.cause, g.absent, g.cells]), [['page-overflow|div.wide', 1, [['/a', 390, 'light'], ['/b', 320, 'light']]]])
  assert.deepEqual(two.merged.fixed, {})
})

test('merge: an earlier owed case and an earlier closed one stay while the run still cannot read their cell; the same case owed again is one entry; a cell read clean releases them', () => {
  const item = (route, cause) => ({ route, width: 1440, scheme: 'light', cause, reason: 'synthetic', measured: at('t1') })
  const st = storedOf({ icons: rec('icons', { debt: [item('/a', 'old-owed'), item('/b', 'same-owed')], closed: [item('/c', 'old-closed')] }) })
  const entry = resolveEntry(st)
  const scope = { ...scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES }) }
  const covers = () => true
  const run = (notMeasured, closed) => {
    const report = { ...reportOf(['icons'], [], { notMeasured: { icons: notMeasured } }), closedNotMeasured: { icons: closed } }
    return mergeRun({ prev: entry.effective.checks, fresh: recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope }), covers, full: false, order: ALL_CHECKS }).checks.icons
  }
  const still = run([{ route: '/a', width: 1440, scheme: 'light', cause: 'new-owed', why: 'synthetic' }, { route: '/b', width: 1440, scheme: 'light', cause: 'same-owed', why: 'synthetic' }], [{ route: '/c', width: 1440, scheme: 'light', cause: 'new-closed', reason: 'synthetic' }])
  assert.deepEqual(still.debt.map((d) => `${d.route}:${d.cause}`).sort(), ['/a:new-owed', '/a:old-owed', '/b:same-owed'])
  assert.deepEqual(still.closed.map((d) => `${d.route}:${d.cause}`).sort(), ['/c:new-closed', '/c:old-closed'])
  const clean = run([], [])
  assert.deepEqual([clean.debt, clean.closed], [[], undefined])
})

test('merge: two cases of one cause, one carried and one found by the scoped run, are judged together against a not-measurable row that records one: the check fails and the exit follows', () => {
  const item = (route) => ({ route, width: 1440, scheme: 'light', cause: 'icons-unpairable', reason: 'synthetic', measured: at('t1') })
  const NM = { check: 'icons', cause: 'icons-unpairable', kind: 'not-measurable', cases: 1, reason: 'r', measurement: 'm', evidence: 'e.png' }
  const st = storedOf({ icons: rec('icons', { debt: [item('/a')] }) })
  const entry = resolveEntry({ ...st, effective: { exit: 0, checks: rejudgeChecks(st.effective.checks, [NM], { fullScope: fullScope() }) } })
  assert.deepEqual([entry.effective.checks.icons.closed.length, entry.effective.checks.icons.debt.length, entry.effective.checks.icons.acceptErrors.length], [1, 0, 0])
  const report = { ...reportOf(['icons'], []), closedNotMeasured: { icons: [{ route: '/b', width: 1440, scheme: 'light', cause: 'icons-unpairable', reason: 'synthetic' }] } }
  const fresh = recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope })
  const merged = mergeRun({ prev: entry.effective.checks, fresh, covers: (id, cell) => cell[0] === '/b', full: false, acceptRows: [NM], order: ALL_CHECKS, fullScope: entry.full.scope })
  const icons = merged.checks.icons
  assert.match(icons.acceptErrors[0].message, /2 case\(s\) of this cause are not measured, the row records 1/)
  assert.deepEqual([icons.debt.map((d) => d.route).sort(), icons.closed, icons.accepted], [['/a', '/b'], undefined, []])
  applyHistory(report, { merged, run: scopedRun(entry, { ...scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES }) }), order: ALL_CHECKS, acceptRows: [NM] })
  const c = report.checks.find((x) => x.id === 'icons')
  assert.deepEqual([c.notMeasured, c.acceptErrors, c.pass, report.exit], [2, 1, false, 1])
  // every list the reports print comes from the same merged evidence: the error is there, /b is not accepted, the counts equal the lists
  const s = summarise(report).summary
  assert.match(s.acceptErrors[0], /2 case\(s\) of this cause are not measured, the row records 1/)
  assert.equal(s.acceptErrors.length, report.acceptErrors.length)
  assert.deepEqual([report.accepted, c.accepted, s.checks.find((x) => x.id === 'icons').accepted], [[], 0, 0])
  assert.equal(s.checks.find((x) => x.id === 'icons').groupList.some((g) => g.status === 'accepted'), false)
  assert.doesNotMatch(formatSummary(report), /## Accepted by the dossier/)
  assert.match(formatSummary(report), /## sweep\.accept rows in ERROR \(1\)/)
  assert.deepEqual([report.notMeasured.icons.length, report.owed.length, report.notDefects.length], [2, 0, 0])
  assert.equal(c.notMeasured, report.notMeasured.icons.length + report.owed.length)
})

test('merge: a not-measurable row that records both cases of its cause is accepted, and every list shows it', () => {
  const item = (route) => ({ route, width: 1440, scheme: 'light', cause: 'icons-unpairable', reason: 'synthetic', measured: at('t1') })
  const NM = { check: 'icons', cause: 'icons-unpairable', kind: 'not-measurable', cases: 2, reason: 'r', measurement: 'm', evidence: 'e.png' }
  const st = storedOf({ icons: rec('icons', { debt: [item('/a')] }) })
  const entry = resolveEntry({ ...st, effective: { exit: 0, checks: rejudgeChecks(st.effective.checks, [NM], { fullScope: fullScope() }) } })
  const report = { ...reportOf(['icons'], []), closedNotMeasured: { icons: [{ route: '/b', width: 1440, scheme: 'light', cause: 'icons-unpairable', reason: 'synthetic' }] } }
  const fresh = recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope })
  const merged = mergeRun({ prev: entry.effective.checks, fresh, covers: (id, cell) => cell[0] === '/b', full: false, acceptRows: [NM], order: ALL_CHECKS, fullScope: entry.full.scope })
  assert.deepEqual([merged.checks.icons.accepted.length, merged.checks.icons.acceptErrors.length, merged.checks.icons.closed.length], [1, 0, 2])
  applyHistory(report, { merged, run: scopedRun(entry, { ...scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES }) }), order: ALL_CHECKS, acceptRows: [NM] })
  const c = report.checks.find((x) => x.id === 'icons')
  assert.deepEqual([c.accepted, c.acceptErrors, c.notMeasured, report.exit], [0, 0, 0, 0])
  assert.deepEqual(report.accepted.map((a) => [a.check, a.cause, a.kind, a.occurrences, a.reason, a.measurement, a.recordedCases]), [['icons', 'icons-unpairable', 'not-measurable', 2, 'r', 'm', 2]])
  assert.deepEqual([report.acceptErrors, report.notMeasured.icons, report.closedNotMeasured.icons.length], [[], [], 2])
  assert.match(report.notDefects[0].what, /icons: icons-unpairable not measurable by the tool, 2 case\(s\) \(recorded 2\)/)
  const s = summarise(report).summary
  assert.deepEqual([s.acceptErrors, s.checks.find((x) => x.id === 'icons').groupList.map((g) => [g.key, g.status])], [[], [['icons-unpairable', 'accepted']]])
  assert.match(formatSummary(report), /## Accepted by the dossier \(1 group/)
})

test('merge: the not-measured cause tables of a scoped report count the cases of the merged evidence, the chips of a case with several causes kept', () => {
  const item = (route) => ({ route, width: 1440, scheme: 'light', cause: 'repeated-label+x-cause', causes: ['repeated-label', 'x-cause'], reason: 'older', measured: at('t1') })
  const entry = entryOf({ chips: rec('chips', { debt: [item('/a')] }) })
  const fresh = { route: '/b', width: 1440, scheme: 'light', causes: [{ cause: 'repeated-label', chips: 3, why: 'w', detail: ['d'] }, { cause: 'x-cause', chips: 2, why: 'w2', detail: ['d2'] }], why: 'w', detail: 'd' }
  const report = reportOf(['chips'], [], { notMeasured: { chips: [fresh] } })
  const scope = scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })
  const merged = mergeRun({ prev: entry.effective.checks, fresh: recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope }), covers: (id, cell) => cell[0] === '/b', full: false, order: ALL_CHECKS })
  applyHistory(report, { merged, run: scopedRun(entry, scope), order: ALL_CHECKS })
  const c = report.checks.find((x) => x.id === 'chips')
  assert.equal(c.notMeasured, 2)
  assert.deepEqual(report.notMeasured.chips.map((n) => n.route).sort(), ['/a', '/b'])
  assert.deepEqual(report.notMeasured.chips.find((n) => n.route === '/b').causes.map((x) => x.chips), [3, 2])
  assert.deepEqual([c.notMeasuredCauses['repeated-label'].pages, c.notMeasuredCauses['x-cause'].pages, c.notMeasuredCauses['x-cause'].chips, 'chips' in c.notMeasuredCauses['repeated-label']], [2, 2, undefined, false])
  const s = summarise(report).summary
  assert.deepEqual(s.notMeasured.filter((x) => x.checks.includes('chips')).map((x) => [x.cause, x.count]).sort(), [['repeated-label', 2], ['x-cause', 2]])
  assert.match(formatSummary(report), /not measured, \*\*repeated-label\*\* — 2 page case\(s\)/)
})

test('merge: a group the scoped run accepted but the whole evidence refuses is an open group of the report, with the cells carried into it', () => {
  const cause = 'page-overflow|x'
  const ROWX = { check: 'overflow', cause, kind: 'decided', decision: 'D-1', evidence: 'e.png', routes: ['/b'], widths: [320], schemes: ['light'] }
  const entry = entryOf({ overflow: rec('overflow', { open: [group(cause, [['/a', 320, 'light']])] }) })
  const fresh = { overflow: rec('overflow', { accepted: [acc([['/b', 320, 'light']], at('t2'), { cause, what: 'page-overflow', examples: [{ route: '/b', width: 320, scheme: 'light', source: '0', port: '9' }] })] }, at('t2')) }
  const report = reportOf(['overflow'], [])
  const merged = mergeRun({ prev: entry.effective.checks, fresh, covers: (id, cell) => cell[0] === '/b', full: false, acceptRows: [ROWX], order: ALL_CHECKS, fullScope: entry.full.scope })
  applyHistory(report, { merged, run: scopedRun(entry, scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })), order: ALL_CHECKS, acceptRows: [ROWX] })
  const c = report.checks.find((x) => x.id === 'overflow')
  assert.deepEqual([c.defects, c.defectRows, c.accepted, report.exit], [1, 1, 1, 1])
  // the reopened cell is the history's: no row or example of this run is shown for it, and it names the run that measured it
  assert.deepEqual([report.groups.overflow, report.defects.overflow], [[], []])
  assert.deepEqual(report.carried.overflow.open.map((g) => [g.cause, g.occurrences, g.routes, g.measured.ranAt, g.examples.map((e) => e.route)]), [[cause, 1, ['/a'], 't1', ['/a']]])
  assert.deepEqual(report.accepted.map((a) => [a.check, a.cause, a.occurrences, a.example?.route]), [['overflow', cause, 1, '/b']])
  const o = summarise(report).summary.checks.find((x) => x.id === 'overflow')
  assert.deepEqual(o.groupList.map((g) => [g.key, g.status, g.cells, g.carriedFrom ?? null, g.examples.map((e) => e.route)]).sort(), [[cause, 'accepted', 1, null, ['/b']], [cause, 'carried', 1, 't1', ['/a']]])
  assert.match(formatSummary(report), /CARRIED|Carried from/)
})

test('merge: a cause accepted on an earlier cell and found on a new one, its row gone, is one open group: this run\'s row, the earlier cell named with its run', () => {
  const cause = 'page-overflow|x'
  const entry = entryOf({ overflow: rec('overflow', { accepted: [acc([['/a', 320, 'light']], at('t1'), { cause, what: 'page-overflow', examples: [{ route: '/a', width: 320, scheme: 'light', source: '5', port: '6' }], groupEvidence: 'site-sweep.json#accepted[0]' })] }) })
  const report = reportOf(['overflow'], [['overflow', cause, '/b', 320, 'light']])
  const merged = mergeRun({ prev: entry.effective.checks, fresh: recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope }), covers: (id, cell) => cell[0] === '/b', full: false, acceptRows: [], order: ALL_CHECKS, fullScope: entry.full.scope })
  assert.deepEqual([merged.checks.overflow.open.map((g) => g.occurrences), merged.checks.overflow.accepted], [[2], []])
  applyHistory(report, { merged, run: scopedRun(entry, scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })), order: ALL_CHECKS })
  const c = report.checks.find((x) => x.id === 'overflow')
  assert.deepEqual([c.defects, c.defectRows], [1, 2])
  assert.deepEqual([report.defects.overflow.map((d) => d.route), report.groups.overflow.map((g) => [g.occurrences, g.carriedCells, g.carriedFrom.map((x) => [x.ranAt, x.cells]), g.example.route])], [['/b'], [[2, 1, [['t1', 1]], '/b']]])
  const g = summarise(report).summary.checks.find((x) => x.id === 'overflow').groupList[0]
  assert.deepEqual([g.status, g.cells, g.carriedCells, g.carriedCellsFrom.map((x) => x.ranAt), g.examples.map((e) => e.route)], ['defect', 2, 1, ['t1'], ['/b']])
  const md = formatSummary(report)
  assert.match(md, /1 row\(s\) on 1 route\(s\) measured in this run; 1 more cell\(s\)/)
  assert.match(md, /1 of its cell\(s\) carried from the run of t1/)
})

test('merge: a cause open on one earlier cell and accepted on another, its row gone and neither measured again, is ONE carried group naming both runs', () => {
  const cause = 'page-overflow|x'
  const entry = entryOf({ overflow: rec('overflow', { open: [group(cause, [['/a', 320, 'light']])], accepted: [acc([['/c', 320, 'light']], at('t0', '/runs/zero'), { cause, what: 'page-overflow', examples: [{ route: '/c', width: 320, scheme: 'light', source: '5', port: '6' }], groupEvidence: 'site-sweep.json#accepted[0]' })] }) })
  const report = reportOf(['overflow'], [])
  const merged = mergeRun({ prev: entry.effective.checks, fresh: recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: entry.full.scope }), covers: (id, cell) => cell[0] === '/b', full: false, acceptRows: [], order: ALL_CHECKS, fullScope: entry.full.scope })
  assert.deepEqual(merged.checks.overflow.open.map((g) => [g.cause, g.occurrences]), [[cause, 2]])
  applyHistory(report, { merged, run: scopedRun(entry, scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES })), order: ALL_CHECKS })
  const c = report.checks.find((x) => x.id === 'overflow')
  assert.deepEqual([c.defects, c.defectRows, report.groups.overflow, report.defects.overflow], [1, 2, [], []])
  assert.deepEqual(report.carried.overflow.open.map((g) => [g.cause, g.occurrences, g.routes.sort(), g.parts.map((x) => [x.ranAt, x.cells]).sort()]), [[cause, 2, ['/a', '/c'], [['t0', 1], ['t1', 1]]]])
  const list = summarise(report).summary.checks.find((x) => x.id === 'overflow').groupList
  assert.deepEqual(list.map((g) => [g.key, g.status, g.cells, g.carriedCellsFrom.length]), [[cause, 'carried', 2, 2]])
  assert.match(formatSummary(report), /its cells come from the runs of /)
  assert.doesNotMatch(formatSummary(report), /measured in this run; /)
})

test('merge: the not-defect count of a check is in rows, as the accepted group is: two rows on one cell are two', () => {
  const entry = entryOf({ overflow: rec('overflow', { accepted: [acc([['/c', 1440, 'dark']], at('t1'), { cause: 'page-overflow|t', occurrences: 2 })] }) })
  const { report } = rerun(entry, reportOf(['header']))
  assert.deepEqual([report.checks.find((x) => x.id === 'overflow').notDefects, report.accepted.map((a) => a.occurrences)], [2, [2]])
})

test('rejudge: two groups on the same cells are each matched by their own row', () => {
  const st = storedOf({ overflow: rec('overflow', { open: [G('page-overflow|a'), G('page-overflow|b')] }) })
  const both = judged(st, [ROW('page-overflow|a', ['/a', '/b']), ROW('page-overflow|b', ['/a', '/b'])])
  assert.deepEqual([both.overflow.open, both.overflow.acceptErrors, both.overflow.accepted.map((a) => a.cause)], [[], [], ['page-overflow|a', 'page-overflow|b']])
})

test('rejudge: a not-measurable row closes the cases of its cause and keeps them; removing it owes them again; more cases than it records closes nothing', () => {
  const debt = (route, cause = 'icons-unpairable') => ({ route, width: 1440, scheme: 'light', cause, reason: 'x', measured: at('t1') })
  const st = storedOf({ icons: rec('icons', { debt: [debt('/a'), debt('/b'), debt('/c', 'icon-covered')] }) })
  const NM = (cause, cases) => ({ check: 'icons', cause, kind: 'not-measurable', cases, reason: 'r', measurement: 'm', evidence: 'e.png' })
  const closed = judged(st, [NM('icons-unpairable', 2)])
  assert.deepEqual([closed.icons.debt.map((d) => d.route), closed.icons.closed.map((d) => d.route), closed.icons.accepted.map((a) => [a.cause, a.kind, a.occurrences])], [['/c'], ['/a', '/b'], [['icons-unpairable', 'not-measurable', 2]]])
  assert.deepEqual(valid(st, closed), [])
  const reopened = judged({ ...st, effective: { exit: 3, checks: closed } }, [])
  assert.deepEqual([reopened.icons.debt.map((d) => d.route).sort(), reopened.icons.closed, reopened.icons.accepted], [['/a', '/b', '/c'], undefined, []])
  const grown = judged(st, [NM('icons-unpairable', 1)])
  assert.match(grown.icons.acceptErrors[0].message, /2 case\(s\) of this cause are not measured, the row records 1/)
  assert.equal(grown.icons.debt.length, 3)
  assert.match(judged(st, [NM('form-purpose-unknown', 1)]).icons.acceptErrors[0].message, /matches no not-measured cause/)
})

test('rejudge: the scope of the next run follows the rows of now — a covered group is no longer measured, an uncovered one is', () => {
  const st = storedOf({ overflow: rec('overflow', { open: [G()] }), background: rec('background', { open: [group('page-background|body', [['/c', 390, 'dark']])] }) })
  const entry = (checks) => resolveEntry({ ...st, effective: { exit: exitOf(checks), checks } })
  assert.deepEqual(scopeOf(entry(judged(st, [])), { schemes: ['light', 'dark'], pages: PAGES }).checks, ['overflow', 'background'])
  const covered = entry(judged(st, [ROW('page-overflow|div.wide', ['/a', '/b'])]))
  assert.deepEqual(scopeOf(covered, { schemes: ['light', 'dark'], pages: PAGES }).checks, ['background'])
  // and the run that follows keeps the accepted group, as accepted, with the other check's open one
  const report = reportOf(['background'], [['background', 'page-background|body', '/c', 390, 'dark']])
  const scope = scopeOf(covered, { schemes: ['light', 'dark'], pages: PAGES })
  const fresh = recordsOf(report, { out: '/runs/two', mode: 'scoped', fullScope: covered.full.scope })
  const merged = mergeRun({ prev: covered.effective.checks, fresh, covers: coversOf(scope, { pages: PAGES, fullSchemes: ['light', 'dark'] }), full: false, order: ALL_CHECKS })
  assert.deepEqual([merged.checks.overflow.open, merged.checks.overflow.accepted.length, merged.fixed], [[], 1, {}])
})

// ---- the command line on small local pages ---------------------------------------------------------------------------------

const serve = (routes) =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const r = routes()[req.url.split('?')[0]]
      if (!r) {
        res.writeHead(404, { 'content-type': 'text/html' })
        return res.end('<!doctype html><title>404</title><body>not found')
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(r)
    })
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      resolve(`http://127.0.0.1:${server.address().port}`)
    })
  })
// both sides take the saved dark choice the same way: the port from its cookie, the source from the attribute the dossier's switch writes
const THEME = "if(/tracy_theme=dark/.test(document.cookie))document.documentElement.setAttribute('data-theme','dark')"
const page = (main, css = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><script>${THEME}</script><style>html,body{background:#fff}body{margin:0;min-height:100vh;font:16px/24px Arial;color:#111}html[data-theme="dark"],html[data-theme="dark"] body{background:rgb(17,21,31);color:rgb(230,230,230)}${css}</style></head><body><header><a href="/">Site</a></header><main><h1>Title</h1>${main}</main><footer><p>foot</p></footer></body></html>`
const PLAIN = page('<p>text</p>')
const MORE = '<section class="extra"><h2>More</h2><p>text</p></section>'
const SOURCE = { '/': PLAIN, '/wide': PLAIN, '/dark': PLAIN, '/tall': page(MORE), '/fine': PLAIN }
const PORT = {
  '/': PLAIN,
  // sideways overflow at 320 and 390, in both schemes
  '/wide': page('<p class="wide" style="width:620px">text</p>'),
  // another page background in the dark scheme, at narrow widths only
  '/dark': page('<p>text</p>', '@media (max-width:400px){html[data-theme="dark"],html[data-theme="dark"] body{background:rgb(70,10,10)}}'),
  // 300 px more at wide widths only
  '/tall': page(MORE.replace('</section>', '<div class="tall"></div></section>'), '.tall{display:none;height:300px}@media (min-width:1100px){.tall{display:block}}'),
  '/fine': PLAIN
}
const CONTRACT = (routes) => ({
  design: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storage: { type: 'cookie', key: 'tracy_theme' } } },
  source: { kind: 'live', darkHook: 'attr:data-theme=dark', lightHook: 'attr:data-theme=light' },
  pages: routes.map((r) => ({ id: r, path: r, status: 200, sourceRoute: r }))
})
// the fixture pages have no theme switch, no drawer and no parent menu item: the dossier records them as measured by hand
const NOT_MEASURABLE = ['theme-control-not-found', 'touch-control-not-found', 'drawer-control-not-found'].map((cause) => ({ check: 'first-interaction', cause, kind: 'not-measurable', cases: 40, reason: 'the fixture pages have no such control', measurement: 'read by hand: neither side has it', evidence: 'hand.txt' }))

const cli = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [SWEEP, ...args])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill(), 240000)
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, stdout, stderr })
    })
  })
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
const openOf = (dir) => {
  const doc = json(path.join(dir, 'site-sweep.json'))
  return [...Object.entries(doc.groups).flatMap(([id, list]) => list.map((g) => `${id}: ${g.cause}`)), ...Object.entries(doc.carried ?? {}).flatMap(([id, kept]) => kept.open.map((g) => `${id}: ${g.cause} (carried)`))].sort()
}

test('command line: the first run is full; a re-run with no scope flag measures exactly what was open; fixed, carried, --full with and without --reason, an explicit scope', { timeout: 540000 }, async () => {
  let port = { ...PORT }
  const [p, s] = await Promise.all([serve(() => port), serve(() => SOURCE)])
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(CONTRACT(Object.keys(PORT))))
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept: NOT_MEASURABLE } }))
  writeFileSync(path.join(dossier, 'hand.txt'), 'x')
  const stateFile = path.join(dossier, STATE_FILE)
  const entry = () => resolveEntry(Object.values(json(stateFile).runs).find((e) => e.identity.site === p))
  const base = ['--site', p, '--source', s, '--run-root', dossier, '--settle-ms', '50', '--concurrency', '6']
  const run = async (extra = []) => {
    const out = tmp()
    const t0 = Date.now()
    const r = await cli([...base, '--out', out, ...extra])
    return { ...r, out, ev: (() => { try { return entry()?.latest.out } catch { return null } })(), ms: Date.now() - t0, doc: existsSync(path.join(out, 'site-sweep.json')) ? json(path.join(out, 'site-sweep.json')) : null, md: existsSync(path.join(out, 'summary.md')) ? readFileSync(path.join(out, 'summary.md'), 'utf8') : '' }
  }

  // 1. the first run: full, no reason asked, recorded
  const one = await run()
  assert.equal(one.status, 1, one.stderr + one.stdout)
  assert.deepEqual([one.doc.run.mode, one.doc.run.reason, one.doc.run.previous], ['full', null, null])
  assert.deepEqual(one.doc.only, ALL_CHECKS)
  assert.doesNotMatch(one.stdout, /scoped re-run|full run:/)
  assert.match(one.md, /Full run \(the first of this site, source and dossier\)\./)
  const open1 = openOf(one.out)
  assert.deepEqual([...new Set(open1.map((g) => g.split(':')[0]))], ['background', 'heights', 'overflow'], open1.join('\n') + one.md)
  const spans = (id) => one.doc.groups[id].map((g) => [g.routes, g.widths, g.schemes])
  assert.deepEqual(spans('overflow'), [[['/wide'], [320, 390], ['light', 'dark']]])
  for (const span of spans('background')) assert.deepEqual(span, [['/dark'], [320, 390], ['dark']])
  for (const span of spans('heights')) assert.deepEqual(span, [['/tall'], [1180, 1440], []])
  const causes = (id) => one.doc.groups[id].map((g) => g.cause).sort()
  assert.deepEqual(one.doc.checks.filter((c) => c.notMeasured).map((c) => c.id), [], one.md)
  assert.deepEqual([entry().revision, entry().full.out, entry().latest.mode, entry().log.length], [1, one.ev, 'full', 1])

  // 2. no scope flag: the run narrows itself to the open groups' checks, routes, widths and schemes, and reports the same open groups
  const two = await run()
  assert.equal(two.status, 1, two.stderr + two.stdout)
  assert.deepEqual(two.doc.run.scope, { checks: ['overflow', 'background', 'heights'], routes: ['/wide', '/dark', '/tall'], widths: [320, 390], heightsWidths: [1180, 1440], schemes: ['light', 'dark'] })
  assert.deepEqual([two.doc.only, two.doc.widths, two.doc.schemes, two.doc.routesTotal], [['overflow', 'background', 'heights'], [320, 390], ['light', 'dark'], 3])
  assert.deepEqual(two.doc.heights.widths, [1180, 1440])
  assert.equal(two.stdout.split('\n')[0], `scoped re-run: checks overflow,background,heights; routes /wide, /dark, /tall (3 of 5); widths 320,390; heights widths 1180,1440; schemes light,dark; the rest is carried from the run of ${one.doc.ranAt} (${one.ev}); a full run needs --full --reason "<text>"`)
  assert.deepEqual(openOf(two.out), open1)
  assert.deepEqual(two.doc.fixed, {})
  // the checks that were not measured are carried, none of them a pass
  const carried = two.doc.checks.filter((c) => c.carried).map((c) => c.id)
  assert.deepEqual(carried, ALL_CHECKS.filter((c) => !['overflow', 'background', 'heights'].includes(c)))
  assert.ok(two.doc.checks.filter((c) => c.carried).every((c) => c.pass === false))
  for (const id of carried) assert.match(two.stdout, new RegExp(`^${id}: carried, 0 group\\(s\\).* — not measured in this run, from the run of ${one.doc.ranAt.replace(/[.]/g, '\\.')}$`, 'm'))
  assert.match(two.md, /\*\*Scoped re-run\*\*: checks overflow, background, heights; 3 route\(s\) \(\/wide, \/dark, \/tall\); widths 320, 390; heights widths 1180, 1440; schemes light, dark\./)
  assert.match(two.md, /## header — carried\n\nNot measured in this run: carried from the run of /)
  assert.ok(two.doc.timing.totalMs < one.doc.timing.totalMs, `${two.doc.timing.totalMs} ms against ${one.doc.timing.totalMs} ms`)
  assert.deepEqual([entry().revision, entry().full.out, entry().latest.mode, entry().latest.out], [2, one.ev, 'scoped', two.ev])

  // 3. the overflow is gone on the port: absent once is INTERMITTENT, not fixed — counted, failing the check, and measured again; --verbose says the scope too
  port = { ...port, '/wide': PLAIN }
  const three = await run(['--verbose'])
  assert.equal(three.status, 1, three.stderr)
  assert.match(three.stdout.split('\n')[0], /^scoped re-run: checks overflow,background,heights; /)
  assert.match(three.stdout, /# Site sweep — /)
  assert.match(three.stdout, /- INTERMITTENT: `page-overflow\|p\.wide` — confirmed \(last seen /)
  assert.deepEqual(three.doc.fixed, {})
  assert.deepEqual(three.doc.intermittent.overflow.map((g) => [g.cause, g.absent, g.needs]), causes('overflow').map((c) => [c, 1, 2]))
  assert.equal(three.doc.checks.find((c) => c.id === 'overflow').intermittent, causes('overflow').length)
  assert.equal(three.doc.checks.find((c) => c.id === 'overflow').pass, false)
  assert.deepEqual(entry().effective.checks.overflow.open, [])
  assert.equal(entry().effective.checks.overflow.intermittent.length, causes('overflow').length)
  // 3b. absent from a second run that measured every cell of it: fixed
  const threeB = await run()
  assert.deepEqual(threeB.doc.fixed, { overflow: causes('overflow') })
  assert.deepEqual(threeB.doc.intermittent ?? {}, {})
  assert.match(threeB.md, /`page-overflow\|p\.wide` — fixed \(/)
  assert.deepEqual(openOf(threeB.out), open1.filter((g) => !g.startsWith('overflow')))
  assert.equal(entry().effective.checks.overflow.intermittent, undefined)

  // 4. --schemes still constrains: the dark background group is not measured, it is carried and keeps the run failing though the scope is clean
  port = { ...port, '/tall': SOURCE['/tall'] }
  const four = await run(['--schemes', 'light'])
  assert.equal(four.status, 1, four.stderr)
  assert.deepEqual(four.doc.run.scope, { checks: ['heights'], routes: ['/tall'], widths: [], heightsWidths: [1180, 1440], schemes: ['light'] })
  assert.deepEqual([four.doc.ownExit, four.doc.exit, four.doc.fixed], [0, 1, {}])
  assert.deepEqual(Object.keys(four.doc.intermittent), ['heights'])
  assert.deepEqual(openOf(four.out), causes('background').map((k) => `background: ${k} (carried)`))
  assert.match(four.stdout, new RegExp(`^background: carried, ${causes('background').length} group\\(s\\), 0 not measured — not measured in this run`, 'm'))
  assert.match(four.stdout, /^heights: fail, 0 group\(s\)/m)
  assert.equal(four.doc.checks.find((c) => c.id === 'heights').pass, false)
  assert.match(four.md, /CARRIED DEFECT; carried from the run of /)
  assert.equal(json(path.join(four.out, 'summary.json')).checks.find((c) => c.id === 'background').groupList[0].status, 'carried')
  // the carried group names the run that measured it last
  assert.equal(four.doc.carried.background.open[0].measured.out, threeB.ev)
  // 4b. the second clean run closes the heights group
  const fourB = await run(['--schemes', 'light'])
  assert.deepEqual(fourB.doc.fixed, { heights: causes('heights') })

  // 5. --full without --reason, and with a blank one, narrows: no error, no full run; a scoped re-run with --zip writes no fix-measure.json
  const zip = path.join(tmp(), 'theme.zip')
  writeFileSync(zip, ZIP)
  const five = await run(['--full', '--zip', zip])
  assert.equal(five.status, 1, five.stderr)
  assert.match(five.stdout.split('\n')[0], /^scoped re-run \(--full without --reason narrows\): checks background; routes \/dark \(1 of 5\); widths 320,390; schemes dark; /)
  assert.deepEqual([five.doc.run.mode, five.doc.run.fullWithoutReason, five.doc.only], ['scoped', true, ['background']])
  assert.equal(existsSync(path.join(five.out, 'fix-measure.json')), false)
  assert.match(five.stderr, /fix-measure\.json not written: a scoped re-run is not the measure of a theme zip/)
  const blank = await run(['--full', '--reason', '   '])
  assert.deepEqual([blank.status, blank.doc.run.mode, blank.doc.only], [1, 'scoped', ['background']])
  const emptyReason = await run(['--full', '--reason', ''])
  assert.deepEqual([emptyReason.status, emptyReason.doc.run.mode], [1, 'scoped'])
  assert.equal((await cli([...base, '--out', tmp(), '--reason', 'release gate'])).status, 2)
  assert.equal(entry().full.out, one.ev)

  // 6. an explicit scope is the caller's: no narrowing, the history neither read nor written
  const revision = entry().revision
  const explicit = await run(['--only', 'overflow,header', '--pages', '/fine,/wide', '--full'])
  assert.equal(explicit.status, 0, explicit.stderr)
  assert.deepEqual([explicit.doc.only, explicit.doc.routesTotal, explicit.doc.widths, explicit.doc.run], [['overflow', 'header'], 2, DEFAULT_WIDTHS, undefined])
  assert.doesNotMatch(explicit.stdout, /scoped re-run|carried/)
  const widthsOnly = await run(['--widths', '390', '--only', 'background'])
  assert.deepEqual([widthsOnly.status, widthsOnly.doc.run, widthsOnly.doc.groups.background.length], [1, undefined, causes('background').length])
  assert.equal(entry().revision, revision)

  // 7. --full --reason: everything is measured again, the reason is in the summary, the report and the history; the measure is written
  const gate = await run(['--full', '--reason', 'release gate', '--zip', zip])
  assert.equal(gate.status, 1, gate.stderr)
  assert.equal(gate.stdout.split('\n')[0], 'full run: release gate')
  assert.deepEqual([gate.doc.run.mode, gate.doc.run.reason, gate.doc.only, gate.doc.widths, gate.doc.routesTotal], ['full', 'release gate', ALL_CHECKS, DEFAULT_WIDTHS, 5])
  assert.match(gate.md, /Full run — reason: release gate\./)
  assert.match(readFileSync(path.join(gate.out, 'site-sweep.md'), 'utf8'), /Full run — reason: release gate\./)
  assert.deepEqual([entry().full.reason, entry().full.out, entry().latest.mode, entry().log.at(-1).reason], ['release gate', gate.ev, 'full', 'release gate'])
  assert.ok(gate.doc.checks.every((c) => !c.carried))
  assert.deepEqual(openOf(gate.out), causes('background').map((k) => `background: ${k}`))
  assert.equal(json(path.join(gate.out, 'fix-measure.json')).checks.length, ALL_CHECKS.length)

  // 7b. the sweep.accept rows are not part of the history's identity: a row added keeps the history, the run is scoped, and the carried group is
  // accepted by it without a browser; the row removed owes the group again, and that run measures it
  writeFileSync(path.join(dossier, 'DECISIONS.md'), '- **D-1** · the port keeps this background by decision.\n')
  const bgRows = causes('background').map((cause) => ({ check: 'background', cause, routes: ['/dark'], widths: [320, 390], schemes: ['dark'], kind: 'decided', decision: 'D-1', evidence: 'hand.txt' }))
  const keysBefore = Object.keys(json(stateFile).runs)
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept: [...NOT_MEASURABLE, ...bgRows] } }))
  const rowed = await run()
  assert.equal(rowed.status, 0, rowed.stderr + rowed.stdout)
  assert.deepEqual(Object.keys(json(stateFile).runs), keysBefore)
  assert.equal(rowed.doc.run.mode, 'scoped')
  assert.deepEqual([rowed.doc.only, rowed.doc.rows, rowed.doc.run.previous.out], [[], [], gate.ev])
  assert.doesNotMatch(rowed.stderr, /route\(s\) × /, 'the rows are judged against the history, no browser starts')
  assert.deepEqual([entry().effective.checks.background.open, entry().effective.checks.background.accepted.map((a) => a.cause).sort()], [[], causes('background')])
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept: NOT_MEASURABLE } }))
  const unrowed = await run()
  assert.equal(unrowed.status, 1, unrowed.stderr)
  assert.deepEqual([unrowed.doc.run.mode, unrowed.doc.run.scope.checks, unrowed.doc.run.scope.routes], ['scoped', ['background'], ['/dark']])
  assert.deepEqual(Object.keys(json(stateFile).runs), keysBefore)
  assert.deepEqual(openOf(unrowed.out), causes('background').map((k) => `background: ${k}`))

  // 8. the last group is fixed: the scoped re-run is clean, exit 0, and the checks it did not measure are still carried, not passes
  port = { ...port, '/dark': PLAIN }
  const clean = await run()
  // absent once: intermittent, still failing
  assert.equal(clean.status, 1, clean.stderr + clean.stdout)
  assert.deepEqual([clean.doc.run.scope.checks, clean.doc.fixed, Object.keys(clean.doc.intermittent)], [['background'], {}, ['background']])
  const cleanB = await run()
  assert.equal(cleanB.status, 0, cleanB.stderr + cleanB.stdout)
  assert.deepEqual([cleanB.doc.run.scope.checks, { background: cleanB.doc.fixed.background.slice().sort() }], [['background'], { background: causes('background') }])
  assert.match(cleanB.stdout, /^background: pass in scope, 0 group\(s\)/m)
  assert.equal(cleanB.doc.checks.filter((c) => c.carried).length, ALL_CHECKS.length - 1)
  // nothing open now: the next run measures nothing, launches no browser, passes nothing and is not a full run
  const nothing = await run()
  assert.equal(nothing.status, 0, nothing.stderr)
  assert.match(nothing.stdout.split('\n')[0], /^scoped re-run: nothing was open in the run of .* — nothing measured; every check is carried from /)
  assert.deepEqual([nothing.doc.only, nothing.doc.rows, nothing.doc.checks.every((c) => c.carried && !c.pass)], [[], [], true])
  assert.doesNotMatch(nothing.stdout, /: pass/)
  assert.doesNotMatch(nothing.stderr, /route\(s\) × /)

  // 8c. the same source URL serving other content (a rebuilt source) is a new source: the history is not reused, a scoped re-run is refused, a full run with a reason starts over
  assert.equal(entry().sourceFingerprint.id, one.doc.sourceFingerprint.id)
  const before = entry().sourceFingerprint.id
  const revisionBefore = entry().revision
  SOURCE['/'] = PLAIN.replace('<body>', '<body><!-- rebuilt -->')
  const moved = await cli([...base, '--out', tmp()])
  assert.equal(moved.status, 2, moved.stderr)
  assert.match(moved.stderr, /was not taken on this source \(the source differs in the served home page\)/)
  assert.equal(entry().sourceFingerprint.id, before)
  const fresh = await run(['--full', '--reason', 'source rebuilt'])
  assert.equal(fresh.status, 0, fresh.stderr + fresh.stdout)
  assert.deepEqual([fresh.doc.run.mode, fresh.doc.run.source, fresh.doc.merged ?? null], ['full', 'changed', null])
  assert.notEqual(entry().sourceFingerprint.id, before)
  // the history of the new source holds none of the old source's runs; only the revision carries on
  assert.deepEqual([entry().log.length, Object.keys(entry().runs).length, entry().revision], [1, 1, revisionBefore + 1])
  assert.equal(entry().sourceFingerprint.id, fresh.doc.sourceFingerprint.id)

  // 9. another source is another history: a full first run, nothing carried from this one, and this one stays
  const s2 = await serve(() => SOURCE)
  const other = tmp()
  const foreign = await cli(['--site', p, '--source', s2, '--run-root', dossier, '--settle-ms', '50', '--concurrency', '6', '--out', other])
  assert.equal(foreign.status, 0, foreign.stderr)
  assert.deepEqual([json(path.join(other, 'site-sweep.json')).run.mode, json(path.join(other, 'site-sweep.json')).run.previous, json(path.join(other, 'site-sweep.json')).only], ['full', null, ALL_CHECKS])
  // the sweep accepts a source at another origin and fingerprints the page that origin serves: its own home URL, the same page
  const movedFp = json(path.join(other, 'site-sweep.json')).sourceFingerprint
  assert.deepEqual([movedFp.url, movedFp.htmlSha256], [`${s2}/`, fresh.doc.sourceFingerprint.htmlSha256])
  assert.equal(Object.keys(json(stateFile).runs).length, 2)
  assert.equal(entry().latest.out, fresh.ev)

  // 10. a run into the --out of an earlier run leaves the evidence that run is cited by, and a fix-measure.json that is not this run's is gone
  const prevEv = entry().latest.out
  const cited = readFileSync(path.resolve(dossier, prevEv, 'site-sweep.json'), 'utf8')
  writeFileSync(path.join(two.out, 'fix-measure.json'), '{}')
  const reuse = await cli([...base, '--out', two.out])
  assert.ok([0, 1, 3].includes(reuse.status), reuse.stderr)
  assert.equal(readFileSync(path.resolve(dossier, prevEv, 'site-sweep.json'), 'utf8'), cited)
  assert.notEqual(entry().latest.out, prevEv)
  assert.equal(existsSync(path.join(two.out, 'fix-measure.json')), false)
  assert.deepEqual(readdirSync(two.out).filter((n) => n.startsWith('.')), [])
})

test('round: the default sweep command of a deploy round carries no --only, so the second round reads and updates the history and measures only what was open', { timeout: 300000 }, async () => {
  const [p, s] = await Promise.all([serve(() => ({ '/': PLAIN, '/wide': page('<p class="wide" style="width:620px">text</p>') })), serve(() => ({ '/': PLAIN, '/wide': PLAIN }))])
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(CONTRACT(['/', '/wide'])))
  const cfg = { site: p, sourceSite: s, runRoot: dossier, steps: {} }
  const roundSweep = (out) => {
    const step = sweepStep(cfg, out)
    assert.equal(step.cmd.includes('--only'), false)
    return new Promise((resolve) => {
      const child = spawn(step.cmd[0], [...step.cmd.slice(1), '--settle-ms', '50', '--schemes', 'light'])
      child.on('close', (status) => resolve({ status, doc: json(path.join(out, 'site-sweep.json')) }))
    })
  }
  const first = await roundSweep(tmp())
  assert.deepEqual([first.status, first.doc.run.mode, first.doc.only], [1, 'full', ALL_CHECKS])
  assert.equal(existsSync(path.join(dossier, STATE_FILE)), true, 'the first round wrote the history')
  const second = await roundSweep(tmp())
  assert.deepEqual([second.status, second.doc.run.mode, second.doc.run.scope.checks.includes('overflow'), second.doc.run.scope.checks.length < ALL_CHECKS.length], [1, 'scoped', true, true])
  assert.equal(Object.values(json(path.join(dossier, STATE_FILE)).runs)[0].revision, 2, 'and updated it')
  // a steps.sweep.cmd of the config still wins
  assert.deepEqual(sweepStep({ ...cfg, steps: { sweep: { cmd: ['echo', 'x'] } } }, '/o').cmd, ['echo', 'x', '--out', '/o'])
})

test('a real full sweep with --zip and --baseline is the measure the patch chain reuses; its dossier or zip changed, it is not', { timeout: 300000 }, async () => {
  // a page with an icon control, a form, a nav and long text, so that every check reads a case (synthetic)
  const RICH = page('<nav><a href="/">Home</a> <a href="/about">About</a></nav><form action="/q"><label>Name <input name="n" required placeholder="Name"></label><button type="submit">Send</button></form><p>' + 'Synthetic body text for the text check. '.repeat(12) + '</p>').replace('<header><a href="/">Site</a></header>', '<header><a href="/">Site</a><a class="social" href="/s" aria-label="Social"><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="#111"/></svg></a></header>')
  const [p, s] = await Promise.all([serve(() => ({ '/': RICH })), serve(() => ({ '/': RICH }))])
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(CONTRACT(['/'])))
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept: NOT_MEASURABLE } }))
  writeFileSync(path.join(dossier, 'hand.txt'), 'x')
  const zip = path.join(tmp(), 'theme.zip')
  writeFileSync(zip, ZIP)
  const base = tmp()
  // a baseline measured on the previous version: every check passed (synthetic)
  writeFileSync(path.join(base, 'fix-measure.json'), JSON.stringify({ schema: 'tracy-fix-measure/v1', tool: 'site-sweep.mjs', ranAt: '2026-01-01T00:00:00.000Z', site: 'http://old.test', source: 'http://src.test', artifact: { themeZipSha256: 'b'.repeat(64) }, checks: ALL_CHECKS.map((id) => ({ id, title: id, pass: true })), passed: ALL_CHECKS.length, total: ALL_CHECKS.length, baseline: null, notDefects: [] }))
  const out = tmp()
  const r = await cli(['--site', p, '--source', s, '--run-root', dossier, '--settle-ms', '50', '--concurrency', '6', '--zip', zip, '--baseline', base, '--baseline-version', '1.0.0', '--full', '--reason', 'release gate', '--out', out])
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const restore = path.join(tmp(), 'restore.json')
  writeFileSync(restore, JSON.stringify({ finishedAt: '2020-01-01T00:00:00.000Z' }))
  // the live read is the reader the sweep used, taken here on the in-process server (a synchronous child read would block the server it asks)
  const live = await readSourceFingerprint({ url: `${s}/`, template: null })
  assert.equal(live.ok, true, live.error)
  const ask = (o = {}) => reusableSweep({ sweepDir: out, themeZip: zip, site: p, source: s, baseline: base, baselineVersion: '1.0.0', runRoot: dossier, spec: null, restoreReport: restore, readSource: () => live, ...o })
  const ok = ask()
  assert.equal(ok.reuse, true, ok.why)
  assert.match(ask({ readSource: () => ({ ok: true, fingerprint: fingerprintOf({ url: `${s}/`, html: '<p>another source</p>' }) }) }).why, /not the one the earlier sweep measured/)
  assert.equal(ask({ baselineVersion: '0.9.0' }).reuse, false)
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept: NOT_MEASURABLE.slice(1) } }))
  assert.match(ask().why, /dossier or the spec-pack changed/)
  const other = path.join(tmp(), 'other.zip')
  writeFileSync(other, Buffer.concat([ZIP, Buffer.from('x')]))
  assert.match(ask({ themeZip: other }).why, /another theme zip/)
})

// a stored zip with style.css naming the version
const ZIP = (() => {
  const name = Buffer.from('t/style.css')
  const data = Buffer.from('Theme Name: T\nVersion: 2.0.1\n')
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt32LE(data.length, 18)
  lh.writeUInt32LE(data.length, 22)
  lh.writeUInt16LE(name.length, 26)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0)
  ch.writeUInt32LE(data.length, 20)
  ch.writeUInt32LE(data.length, 24)
  ch.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(46 + name.length, 12)
  end.writeUInt32LE(30 + name.length + data.length, 16)
  return Buffer.concat([lh, name, data, ch, name, end])
})()

test('command line: a history that cannot be trusted, or an output that is not a file, is refused before any browser starts; a failed write leaves the history as it was', { timeout: 240000 }, async () => {
  const [p, s] = await Promise.all([serve(() => ({ '/': PLAIN })), serve(() => ({ '/': PLAIN }))])
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(CONTRACT(['/'])))
  const stateFile = path.join(dossier, STATE_FILE)
  const base = ['--site', p, '--source', s, '--run-root', dossier, '--settle-ms', '50', '--schemes', 'light']
  const refused = async (re, extra = []) => {
    const out = tmp()
    const r = await cli(extra.includes('--out') ? [...base, ...extra] : [...base, '--out', out, ...extra])
    assert.equal(r.status, 2, r.stderr)
    assert.match(r.stderr, re)
    assert.doesNotMatch(r.stderr, /route\(s\) × /)
    assert.equal(existsSync(path.join(out, 'site-sweep.json')), false)
  }
  writeFileSync(stateFile, '{"schema":')
  await refused(/the sweep history .* is not valid JSON/)
  // --full --reason does not make a damaged history a first run; an explicit scope does not read it
  await refused(/is not valid JSON/, ['--full', '--reason', 'release gate'])
  writeFileSync(stateFile, '')
  await refused(/the sweep history .* is empty/)
  writeFileSync(stateFile, JSON.stringify({ schema: 'tracy-site-sweep-state/v9', runs: {} }))
  await refused(/its schema is "tracy-site-sweep-state\/v9"/)
  const explicit = await cli([...base, '--out', tmp(), '--only', 'overflow'])
  assert.equal(explicit.status, 0, explicit.stderr)
  assert.equal(readFileSync(stateFile, 'utf8'), JSON.stringify({ schema: 'tracy-site-sweep-state/v9', runs: {} }))
  rmSync(stateFile)
  const elsewhere = path.join(tmp(), 'state.json')
  writeFileSync(elsewhere, JSON.stringify({ schema: STATE_SCHEMA, runs: {} }))
  symlinkSync(elsewhere, stateFile)
  await refused(/is a symbolic link, not a regular file: refused/)
  rmSync(stateFile)
  // an output name that is a directory or a link
  const out = tmp()
  mkdirSync(path.join(out, 'summary.md'))
  const dirOut = await cli([...base, '--out', out, '--only', 'overflow'])
  assert.equal(dirOut.status, 2)
  assert.match(dirOut.stderr, /the output file .*summary\.md is a directory, not a regular file: refused/)
  const linked = tmp()
  symlinkSync(elsewhere, path.join(linked, 'site-sweep.json'))
  const linkOut = await cli([...base, '--out', linked, '--only', 'overflow'])
  assert.equal(linkOut.status, 2)
  assert.equal(readFileSync(elsewhere, 'utf8'), JSON.stringify({ schema: STATE_SCHEMA, runs: {} }))
  assert.equal(existsSync(stateFile), false)

  const file = path.join(tmp(), 'not-a-dir')
  writeFileSync(file, 'x')
  await refused(/--out .*not-a-dir: not a directory/, ['--out', file])
  // a first run whose reports cannot be written is not a complete run: exit 4, no history
  const sealed = tmp()
  chmodSync(sealed, 0o555)
  const unwritable = await cli([...base, '--out', sealed])
  assert.equal(unwritable.status, 4, unwritable.stderr)
  assert.match(unwritable.stderr, /the reports could not be written to .*: .*; the history is unchanged/)
  assert.equal(existsSync(stateFile), false)
  // so the next run is still the first: full, published
  const first = tmp()
  const ok = await cli([...base, '--out', first])
  assert.equal(json(path.join(first, 'site-sweep.json')).run.mode, 'full', ok.stderr)
  const published = readFileSync(stateFile, 'utf8')
  assert.equal(Object.values(JSON.parse(published).runs)[0].revision, 1)
  // a history that cannot be published (the lock is held): no report replaces the output, exit 4, the history as it was
  writeFileSync(`${stateFile}.lock`, `${JSON.stringify({ pid: process.pid, token: 'held' })}\n`)
  const busyOut = tmp()
  const busy = await cli([...base, '--out', busyOut])
  rmSync(`${stateFile}.lock`)
  assert.equal(busy.status, 4, busy.stderr)
  assert.match(busy.stderr, /is being written by another sweep/)
  assert.deepEqual([existsSync(path.join(busyOut, 'summary.md')), existsSync(path.join(dossier, 'site-sweep-evidence')) ? readdirSync(path.join(dossier, 'site-sweep-evidence', readdirSync(path.join(dossier, 'site-sweep-evidence'))[0])).length : 0], [false, 1])
  assert.equal(readFileSync(stateFile, 'utf8'), published)
  // the same refusal over an output that holds the reports of the first run: they are as they were, nothing is left aside
  const reports = readdirSync(first).sort()
  const summaryBefore = readFileSync(path.join(first, 'summary.md'), 'utf8')
  writeFileSync(`${stateFile}.lock`, `${JSON.stringify({ pid: process.pid, token: 'held' })}\n`)
  const busyAgain = await cli([...base, '--out', first])
  rmSync(`${stateFile}.lock`)
  assert.equal(busyAgain.status, 4, busyAgain.stderr)
  assert.deepEqual(readdirSync(first).sort(), reports)
  assert.equal(readFileSync(path.join(first, 'summary.md'), 'utf8'), summaryBefore)
  assert.equal(json(path.join(first, 'site-sweep.json')).run.mode, 'full')
  assert.equal(readFileSync(stateFile, 'utf8'), published)
  // a route the source does not answer is owed by every check: the re-run measures that route again, it is still owed, and nothing reads as fixed or clean
  const dossier2 = tmp()
  writeFileSync(path.join(dossier2, 'visual.contract.json'), JSON.stringify(CONTRACT(['/', '/gone'])))
  const [p2, s2] = await Promise.all([serve(() => ({ '/': PLAIN.replace('<p>text</p>', '<p class="wide" style="width:620px">text</p>'), '/gone': PLAIN })), serve(() => ({ '/': PLAIN }))])
  const owedRun = async (extra = []) => {
    const out = tmp()
    const r = await cli(['--site', p2, '--source', s2, '--run-root', dossier2, '--settle-ms', '50', '--schemes', 'light', '--out', out, ...extra])
    return { ...r, doc: json(path.join(out, 'site-sweep.json')) }
  }
  const owedFirst = await owedRun()
  assert.equal(owedFirst.status, 1, owedFirst.stderr)
  assert.ok(owedFirst.doc.owed.some((o) => o.route === '/gone'))
  const owedAgain = await owedRun()
  assert.equal(owedAgain.status, 1, owedAgain.stderr)
  assert.equal(owedAgain.doc.run.mode, 'scoped')
  assert.ok(owedAgain.doc.run.scope.routes.includes('/gone') && owedAgain.doc.run.scope.checks.includes('overflow'))
  assert.ok(owedAgain.doc.owed.some((o) => o.route === '/gone'))
  assert.deepEqual(owedAgain.doc.fixed, {})
  assert.deepEqual(owedAgain.doc.groups.overflow.map((g) => g.routes), [['/']])
  const overflowRec = Object.values(json(path.join(dossier2, STATE_FILE)).runs)[0].effective.checks.overflow
  assert.ok(overflowRec.open.length === 1 && overflowRec.debt.some((d) => d.route === '/gone'))
  // a deadline that cuts the re-run short: what was not read is owed, the open group is not fixed
  const late = await owedRun(['--deadline-ms', '1000'])
  assert.notEqual(late.status, 0, late.stderr)
  assert.deepEqual(late.doc.fixed, {})
  assert.equal(Object.values(json(path.join(dossier2, STATE_FILE)).runs)[0].effective.checks.overflow.open.length, 1)
  // usage errors stay usage errors, before the history is read
  for (const bad of [['--only', 'colours'], ['--widths', '12'], ['--schemes', 'sepia'], ['--pages', '/nowhere'], ['--full', '--full'], ['--reason']]) {
    const r = await cli([...base.filter((a) => !['--schemes', 'light'].includes(a)), '--out', tmp(), ...bad])
    assert.equal(r.status, 2, bad.join(' '))
  }
  assert.equal((await cli(['--site', 'ftp://x', '--source', s, '--run-root', dossier, '--out', tmp()])).status, 2)
  assert.equal(readFileSync(stateFile, 'utf8'), published)
})
