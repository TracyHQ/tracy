// The history of the sweeps (site-sweep-scope.mjs): what it is read as, and what is refused before a scope is taken from it.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ALL_CHECKS } from '../visual/site-sweep.mjs'
import { CHECKS, HistoryError, LOG_KEEP, STATE_FILE, STATE_SCHEMA, acceptCells, cellProblem, entryAfter, readState, resolveEntry, runRecord, scopeOf, stateProblems } from '../visual/site-sweep-scope.mjs'
import { publishState } from '../visual/site-sweep-publish.mjs'
import { HEIGHT_WIDTHS, IDENTITY, acc, KEY, PAGES, acceptError, at, docOf, entryOf, fullScope, group, later, rec, record, storedOf } from './lib/sweep-history-fixture.mjs'

const tmps = []
after(() => {
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
  const d = mkdtempSync(path.join(tmpdir(), 'sweep-history-'))
  tmps.push(d)
  return d
}

const open = () => ({ overflow: rec('overflow', { open: [group('page-overflow|div', [['/a', 320, 'light']])] }) })
const problems = (mutate, checks = open(), o = {}) => {
  const e = structuredClone(storedOf(checks, o))
  mutate(e)
  return stateProblems(docOf(e)).join('; ')
}
const refused = (mutate, re, checks, o) => assert.match(problems(mutate, checks, o), re, String(mutate))

test('the sweep checks are the checks site-sweep runs', () => {
  assert.deepEqual([...CHECKS], [...ALL_CHECKS])
})

test('state: absent is a first run; empty, malformed, another schema or another shape is refused, never a first run', () => {
  const dir = tmp()
  assert.deepEqual(readState(dir), { file: path.join(dir, STATE_FILE), doc: null })
  const refuse = (text, re) => {
    writeFileSync(path.join(dir, STATE_FILE), text)
    assert.throws(() => readState(dir), (e) => e instanceof HistoryError && re.test(e.message), text.slice(0, 40))
  }
  refuse('', /is empty; move .* away to start again with a full run/)
  refuse('  \n', /is empty/)
  refuse('{"schema": ', /is not valid JSON/)
  refuse('[]', /it is not a JSON object/)
  refuse('null', /it is not a JSON object/)
  refuse(JSON.stringify({ schema: 'tracy-site-sweep-state/v1', runs: {} }), /its schema is "tracy-site-sweep-state\/v1", not tracy-site-sweep-state\/v2/)
  refuse(JSON.stringify({ schema: STATE_SCHEMA }), /no `runs` object/)
  refuse(JSON.stringify({ schema: STATE_SCHEMA, runs: {}, extra: 1 }), /no `runs` object, or has fields besides/)
  refuse(JSON.stringify({ schema: STATE_SCHEMA, runs: { [KEY]: { identity: {}, revision: 0 } } }), /is not a history entry/)
  refuse(JSON.stringify({ schema: STATE_SCHEMA, runs: { [KEY]: null } }), /is not a history entry/)
  const bad = structuredClone(storedOf({}))
  bad.effective.checks.overflow.open = [{ cause: 'x' }]
  refuse(JSON.stringify({ schema: STATE_SCHEMA, runs: { [KEY]: bad } }), /effective\.checks\.overflow is not a check record/)
  // too large to be a history
  writeFileSync(path.join(dir, STATE_FILE), Buffer.alloc(33 * 1024 * 1024, 32))
  assert.throws(() => readState(dir), /bytes: too large to be one/)
  writeFileSync(path.join(dir, STATE_FILE), JSON.stringify(docOf(storedOf({}))))
  assert.equal(readState(dir).doc.runs[KEY].revision, 1)
})

test('state: a symbolic link, a directory or a FIFO in the place of the history is refused without being opened', () => {
  const real = tmp()
  writeFileSync(path.join(real, 'elsewhere.json'), JSON.stringify({ schema: STATE_SCHEMA, runs: {} }))
  const link = tmp()
  symlinkSync(path.join(real, 'elsewhere.json'), path.join(link, STATE_FILE))
  assert.throws(() => readState(link), /is a symbolic link, not a regular file: refused/)
  const dangling = tmp()
  symlinkSync(path.join(real, 'nowhere.json'), path.join(dangling, STATE_FILE))
  assert.throws(() => readState(dangling), /is a symbolic link/)
  const dirCase = tmp()
  mkdirSync(path.join(dirCase, STATE_FILE))
  assert.throws(() => readState(dirCase), /is a directory, not a regular file: refused/)
  const fifo = tmp()
  execFileSync('mkfifo', [path.join(fifo, STATE_FILE)])
  const t0 = Date.now()
  assert.throws(() => readState(fifo), /is a FIFO, not a regular file: refused/)
  assert.ok(Date.now() - t0 < 2000)
})

test('history: a history the writer produces is read back whole; heights at 576 and 992, the interactive states and accepted-only checks are valid', () => {
  assert.equal(problems(() => {}), '')
  assert.equal(problems(() => {}, {}), '')
  const heights = { heights: rec('heights', { open: [group('heights|footer|padding-step', [['/a', 576, null], ['/b', 992, null], ['/c', 1440, 'dark']])] }) }
  assert.equal(problems(() => {}, heights), '')
  const states = {
    scheme: rec('scheme', { open: [group('page-surface|main', [['/c', 1440, 'os-dark/no-choice'], ['/c', 1440, 'os-light/saved-dark']])] }),
    'first-interaction': rec('first-interaction', { open: [group('theme-first-click-noop|x', [['/', 390, 'os-dark/old-auto-value'], ['/', 1180, 'touch'], ['/', 768, 'drawer']])] }),
    chips: rec('chips', { open: [group('chip-background|span', [['/a', 1440, 'dark'], ['/a', 390, 'dark']])] })
  }
  assert.equal(problems(() => {}, states), '')
  const accepted = { overflow: rec('overflow', { accepted: [acc([['/a', 320, 'dark']])] }) }
  assert.equal(problems(() => {}, accepted), '')
  const owed = { header: rec('header', { debt: [{ route: '/b', width: null, scheme: 'dark', cause: 'owed', reason: 'timeout', measured: at('t1') }] }) }
  assert.equal(problems(() => {}, owed), '')
  // an accept error as recordsOf writes it, and one that names a row of nothing
  const row = { check: 'chips', cause: 'chip-background|span.old', routes: ['/a', '/gone'], widths: [1440], decision: 'D-1', kind: 'decided' }
  assert.equal(problems(() => {}, { chips: rec('chips', { acceptErrors: [acceptError('chips', row), acceptError('chips', null)] }) }), '')
  // a scoped latest run inside the full run, and a log that keeps its order
  assert.equal(problems(() => {}, open(), { latest: later('t2'), log: ['t1', 't2'] }), '')
})

test('history: every instance of a field that is not what the writer produces is refused — shape, enum, repeats, unknown fields', () => {
  refused((e) => (e.effective.checks = {}), /its effective result holds 0 check\(s\), the full run measured \d+/)
  refused((e) => delete e.effective.checks.chips, /its effective result holds \d+ check\(s\)/)
  refused((e) => delete e.effective, /is not a history entry/)
  refused((e) => (e.effective = null), /has no effective result/)
  refused((e) => (e.effective.checks.chips.debt = [null]), /effective\.checks\.chips is not a check record/)
  refused((e) => (e.effective.checks.chips.accepted = [null]), /effective\.checks\.chips is not a check record/)
  refused((e) => (e.effective.checks.chips.acceptErrors = [null]), /effective\.checks\.chips is not a check record/)
  refused((e) => (e.effective.checks.chips.accepted = [{ cause: 'x' }]), /effective\.checks\.chips is not a check record/)
  refused((e) => (e.effective.checks.chips.open = null), /effective\.checks\.chips is not a check record/)
  refused((e) => (e.effective.checks.chips.extra = 1), /effective\.checks\.chips is not a check record/)
  refused((e) => (e.effective.checks.overflow.open[0].cells = [['/a', 'wide', null]]), /effective\.checks\.overflow is not a check record/)
  refused((e) => (e.effective.checks.overflow.open[0].cells = [['/a', 320]]), /effective\.checks\.overflow is not a check record/)
  refused((e) => (e.effective.checks.overflow.open[0].cells = [['/a', 320, 'light'], ['/a', 320, 'light']]), /effective\.checks\.overflow is not a check record/)
  refused((e) => (e.effective.checks.overflow.open[0].measured = null), /effective\.checks\.overflow is not a check record/)
  refused((e) => (e.effective.checks.overflow.open[0].occurrences = -1), /effective\.checks\.overflow is not a check record/)
  refused((e) => (e.effective.checks.overflow.open[0].secret = 1), /effective\.checks\.overflow is not a check record/)
  refused((e) => (e.effective.checks.overflow.open = [e.effective.checks.overflow.open[0], e.effective.checks.overflow.open[0]]), /two open groups of one cause/)
  // an open group with no cell can never be measured again
  refused((e) => (e.effective.checks.overflow.open[0].cells = []), /effective\.checks\.overflow is not a check record/)
  // the row of an accept error whose routes, widths or schemes are not lists of the right type is not a row; its cells are whole
  const row = (r) => problems((e) => (e.effective.checks.chips.acceptErrors = [{ message: 'm', cause: null, row: r, cells: [['/a', 1440, null]], measured: at('t1') }]))
  assert.equal(row({ routes: ['/a'], widths: [390], schemes: ['dark'] }), '')
  assert.equal(row(null), '')
  for (const bad of [{ routes: 1 }, { routes: [1] }, { widths: ['390'] }, { widths: 390 }, { schemes: [null] }, { schemes: 'dark' }, []]) assert.match(row(bad), /effective\.checks\.chips is not a check record/, JSON.stringify(bad))
  const cells = (c) => problems((e) => (e.effective.checks.chips.acceptErrors = [{ message: 'm', cause: null, row: null, cells: c, measured: at('t1') }]))
  for (const bad of [[], undefined, [['/a']], [[1, 2, 3]]]) assert.match(cells(bad), /effective\.checks\.chips is not a check record/, JSON.stringify(bad))
  // the runs: whole records named by their ranAt, the full run measuring something, in the schemes there are
  refused((e) => (e.runs.t1.scope.schemes = []), /its full run record is not a full run with its checks/)
  refused((e) => (e.runs.t1.scope.routes = []), /its full run record is not a full run with its checks/)
  refused((e) => (e.runs.t1.scope.widths = []), /its full run record is not a full run with its checks/)
  refused((e) => (e.runs.t1.scope.heightsWidths = []), /its full run record is not a full run with its checks/)
  refused((e) => (e.runs.t1.scope.checks = []), /its full run record is not a full run with its checks/)
  refused((e) => (e.runs.t1.scope.schemes = ['sepia']), /is not a whole run record/)
  refused((e) => (e.runs.t1.scope.widths = ['390']), /is not a whole run record/)
  refused((e) => (e.runs.t1.scope.widths = [390, 390]), /is not a whole run record/)
  refused((e) => (e.runs.t1.scope.routes = ['/', '/']), /is not a whole run record/)
  refused((e) => (e.runs.t1.scope.checks = ['nope']), /is not a whole run record/)
  refused((e) => (e.runs.t1.mode = 'partial'), /is not a whole run record/)
  refused((e) => (e.runs.t1.exit = 2), /is not a whole run record/)
  refused((e) => (e.runs.t1.reason = 5), /is not a whole run record/)
  refused((e) => (e.runs.t1.wallMs = '1'), /is not a whole run record/)
  refused((e) => (e.runs.t1.extra = 1), /is not a whole run record/)
  refused((e) => delete e.runs.t1.scope.heightsWidths, /is not a whole run record/)
  refused((e) => (e.runs.other = e.runs.t1), /is not a whole run record named by its ranAt/)
  refused((e) => (e.runs = {}), /has no run records/)
  refused((e) => (e.runs = []), /has no run records/)
  refused((e) => (e.full = 'nope'), /its full or latest run is not one of its run records/)
  refused((e) => (e.latest = 5), /its full or latest run is not one of its run records/)
  refused((e) => (e.runs.t1.mode = 'scoped'), /its full run record is not a full run/)
  // the entry: identity, key, revision, fields
  refused((e) => (e.identity.site = 'http://other'), /its key is not the key of its identity/)
  refused((e) => (e.identity.extra = 'x'), /has no identity/)
  refused((e) => (e.identity.spec = 1), /has no identity/)
  refused((e) => (e.revision = 0), /has no revision/)
  refused((e) => (e.revision = '1'), /has no revision/)
  refused((e) => (e.extra = 1), /is not a history entry/)
  // the exit is the exit of the checks, nothing else
  refused((e) => (e.effective.exit = 0), /its effective exit 0 does not agree with its checks/)
  refused((e) => (e.effective.exit = 3), /its effective exit 3 does not agree with its checks/)
  refused((e) => (e.effective.exit = 2), /has no effective result/)
  const clean = (mutate) => problems(mutate, {})
  assert.match(clean((e) => (e.effective.exit = 3)), /its effective exit 3 does not agree/)
  assert.match(clean((e) => (e.effective.exit = 1)), /its effective exit 1 does not agree/)
  assert.match(clean((e) => ((e.effective.checks.chips.debt = [{ route: '/a', width: null, scheme: null, cause: 'owed', reason: '', measured: at('t1') }]), (e.effective.exit = 1))), /its effective exit 1 does not agree/)
})

test('history: a check that is not a sweep check, a cell outside what the full run measured, and a scope outside the full run are refused', () => {
  // an unsupported check named by the full run and the effective result alike is still not a check
  refused((e) => ((e.runs.t1.scope.checks = [...e.runs.t1.scope.checks, 'colours']), (e.effective.checks.colours = rec('colours'))), /is not a whole run record|not a sweep check/)
  refused((e) => (e.effective.checks.colours = rec('colours')), /not a sweep check: colours/)
  // the latest run lies inside the full run
  refused((e) => ((e.runs.t2.scope.routes = ['/zzz']), 0), /a run after the full run that is not a scoped run inside it/, open(), { latest: later('t2'), log: ['t1', 't2'] })
  refused((e) => (e.runs.t2.scope.widths = [999]), /a run after the full run that is not a scoped run inside it/, open(), { latest: later('t2'), log: ['t1', 't2'] })
  refused((e) => (e.runs.t2.scope.heightsWidths = [999]), /a run after the full run that is not a scoped run inside it/, open(), { latest: later('t2'), log: ['t1', 't2'] })
  assert.equal(problems((e) => (e.runs.t2.scope.schemes = ['light']), open(), { latest: later('t2'), log: ['t1', 't2'] }), '')
  refused((e) => (e.runs.t2.scope.checks = ['nope']), /is not a whole run record/, open(), { latest: later('t2'), log: ['t1', 't2'] })
  refused((e) => (e.runs.t1.scope.schemes = ['light']), /a run after the full run that is not a scoped run inside it/, open(), { latest: later('t2'), log: ['t1', 't2'] })
  // a latest run that says it is full is the full run
  refused((e) => (e.runs.t2 = { ...e.runs.t1, ranAt: 't2' }) && (e.latest = 't2') && (e.log = ['t1', 't2']), /its latest run is a full run that is not its full run/)
  // cells: outside the routes of the full run, the widths the check was measured at, the schemes of the full run
  const cell = (id, c, o) => problems(() => {}, { [id]: rec(id, { open: [group('x|y', [c])] }) }, o)
  assert.match(cell('overflow', ['/zzz', 320, 'light']), /overflow\.open: route \/zzz is not a route of the full run/)
  assert.match(cell('overflow', ['/a', 999, 'light']), /overflow\.open: width 999 is not a width overflow was measured at/)
  assert.match(cell('heights', ['/a', 390.5, null]), /heights\.open: width 390.5 is not a width heights was measured at/)
  assert.equal(cell('heights', ['/a', 1024, null]), '')
  assert.match(cell('chips', ['/a', 768, 'light']), /chips\.open: width 768 is not a width chips was measured at/)
  assert.equal(cell('chips', ['/a', 390, 'light']), '')
  assert.match(cell('overflow', ['/a', 320, 'sepia']), /scheme or state sepia is not one overflow reads/)
  assert.match(cell('overflow', ['/a', 320, 'os-dark/no-choice']), /scheme or state os-dark\/no-choice is not one overflow reads/)
  assert.match(cell('chips', ['/a', 1440, 'touch']), /scheme or state touch is not one chips reads/)
  assert.match(cell('scheme', ['/a', 1440, 'touch']), /scheme or state touch is not one scheme reads/)
  assert.match(cell('scheme', ['/a', 1440, 'os-dark/old-auto-value']), /is not one scheme reads/)
  assert.match(cell('first-interaction', ['/a', 1440, 'os-dark/elsewhere']), /is not one first-interaction reads/)
  // a scheme the full run did not measure
  const lightOnly = { runs: { t1: record({ scope: fullScope(['light']) }) } }
  assert.match(cell('overflow', ['/a', 320, 'dark'], lightOnly), /overflow\.open: scheme dark is not a scheme of the full run/)
  assert.match(cell('scheme', ['/a', 1440, 'os-dark/no-choice'], lightOnly), /scheme\.open: scheme os-dark\/no-choice is not a scheme of the full run/)
  assert.equal(cell('scheme', ['/a', 1440, 'os-light/no-choice'], lightOnly), '')
  // the other places a cell is held
  assert.match(problems((e) => (e.effective.checks.header.debt = [{ route: '/zzz', width: null, scheme: null, cause: 'owed', reason: '', measured: at('t1') }]), { header: rec('header') }), /header\.debt: route \/zzz/)
  assert.match(problems((e) => (e.effective.checks.header.accepted = [acc([['/a', 999, null]], at('t1'))]), { header: rec('header') }), /header\.accepted: width 999/)
  assert.match(problems((e) => (e.effective.checks.header.acceptErrors = [{ message: 'm', cause: null, row: null, cells: [['/a', 999, null]], measured: at('t1') }]), { header: rec('header') }), /header\.acceptErrors: width 999/)
  // heights is measured at its own widths
  assert.equal(HEIGHT_WIDTHS.includes(576) && HEIGHT_WIDTHS.includes(992), true)
})

test('history: the log is made of recorded runs, in order, ends with the latest run; every measured-by is a recorded run; nothing is recorded that nothing stands on', () => {
  const two = { latest: later('t2'), log: ['t1', 't2'] }
  refused((e) => (e.log = [{}]), /its log is not a list of its run records/, open(), two)
  refused((e) => (e.log = ['x']), /its log is not a list of its run records/, open(), two)
  refused((e) => (e.log = []), /its log is not a list of its run records/, open(), two)
  refused((e) => delete e.log, /is not a history entry/, open(), two)
  refused((e) => (e.log = ['t1', 't1', 't2']), /its log is not a list of its run records/, open(), two)
  refused((e) => (e.log = ['t1']), /its log does not end with its latest run, in order/, open(), two)
  refused((e) => (e.log = ['t2', 't1']), /its log does not end with its latest run, in order/, open(), two)
  refused((e) => (e.log = Array.from({ length: LOG_KEEP + 1 }, (_, i) => `t${i}`)), /its log is not a list of its run records, at most 20/, open(), two)
  // provenance: a run that is not recorded, or recorded with another out or mode
  refused((e) => (e.effective.checks.overflow.open[0].measured = at('t9')), /effective\.checks\.overflow\.open was measured by a run that is not one of its run records/)
  refused((e) => (e.effective.checks.overflow.open[0].measured = at('t1', '/elsewhere')), /was measured by a run that is not one of its run records/)
  refused((e) => (e.effective.checks.overflow.open[0].measured = at('t1', '/runs/one', 'scoped')), /was measured by a run that is not one of its run records/)
  refused((e) => (e.effective.checks.overflow.measured = at('t9')), /effective\.checks\.overflow was measured by a run that is not one of its run records/)
  refused((e) => (e.effective.checks.chips.debt = [{ route: '/a', width: null, scheme: null, cause: 'owed', reason: '', measured: at('t9') }]), /chips\.debt was measured by a run that is not/)
  refused((e) => (e.effective.checks.chips.accepted = [acc([], at('t9'))]), /chips\.accepted was measured by a run that is not/)
  refused((e) => (e.effective.checks.chips.acceptErrors = [{ message: 'm', cause: null, row: null, cells: [[null, null, null]], measured: at('t9') }]), /chips\.acceptErrors was measured by a run that is not/)
  // a run record nothing stands on
  refused((e) => (e.runs.t0 = { ...e.runs.t1, ranAt: 't0' }), /it holds run records nothing stands on: t0/)
  // a result stands on a run of the full run or after it; the log may still hold older runs
  refused((e) => ((e.runs.t0 = { ...e.runs.t1, ranAt: 't0' }), (e.effective.checks.overflow.open[0].measured = at('t0'))), /was measured by a run before the full run/)
  // a run the effective result stands on but the log has dropped is kept
  const zero = later('t15', { out: '/runs/zero' })
  const kept = storedOf({ overflow: rec('overflow', { open: [group('page-overflow|div', [['/a', 320, 'light']], at('t15', '/runs/zero', 'scoped'))] }) }, { latest: later('t2'), log: ['t1', 't2'], runs: { t15: zero } })
  assert.equal(stateProblems(docOf(kept)).join('; '), '')
  assert.match(stateProblems(docOf({ ...kept, runs: Object.fromEntries(Object.entries(kept.runs).filter(([k]) => k !== 't15')) })).join('; '), /was measured by a run that is not one of its run records/)
})

test('history: the writer keeps what a result stands on beyond the log, refuses a run recorded twice, and publishes a history the decoder passes', () => {
  const dir = tmp()
  const mk = (n, previous, checks) => {
    const rec1 = { ...later(`t${String(n).padStart(3, '0')}`), out: `/runs/${n}` }
    const merged = { checks }
    return entryAfter({ previous, identity: IDENTITY, record: rec1, merged, exit: 1 })
  }
  // a first (full) run, then more scoped runs than the log keeps; the open group is carried from the first run throughout
  const full = record({ ranAt: 't000', out: '/runs/full' })
  const carried = rec('overflow', { open: [group('page-overflow|div', [['/a', 320, 'light']], at('t000', '/runs/full'))] }, at('t000', '/runs/full'))
  const checks = Object.fromEntries(ALL_CHECKS.map((id) => [id, id === 'overflow' ? carried : rec(id, {}, at('t000', '/runs/full'))]))
  let entry = entryAfter({ previous: null, identity: IDENTITY, record: full, merged: { checks }, exit: 1 })
  assert.equal(stateProblems(docOf({ ...entry, revision: 1 })).join('; '), '')
  publishState({ runRoot: dir, key: KEY, expectedRevision: 0, entry })
  for (let n = 1; n <= LOG_KEEP + 5; n++) {
    entry = mk(n, resolveEntry(readState(dir).doc.runs[KEY]), checks)
    publishState({ runRoot: dir, key: KEY, expectedRevision: n, entry })
  }
  const now = readState(dir).doc.runs[KEY]
  assert.equal(now.log.length, LOG_KEEP)
  assert.ok(now.runs.t000 && now.full === 't000', 'the full run and the run the result carries from stay recorded though the log dropped them')
  assert.equal(now.log.includes('t000'), false)
  assert.equal(Object.keys(now.runs).length, LOG_KEEP + 1)
  // a run whose ranAt is recorded already is refused
  assert.throws(() => entryAfter({ previous: resolveEntry(now), identity: IDENTITY, record: { ...later(now.latest), out: '/runs/again' }, merged: { checks }, exit: 1 }), /a run of .* is already in the sweep history/)
  // a result that stands on a run the writer did not record is not published
  const stray = structuredClone(entry)
  stray.effective.checks.overflow.open[0].measured = at('t-nowhere')
  assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: LOG_KEEP + 5 + 1, entry: stray }), (e) => e instanceof HistoryError && /not a tracy-site-sweep-state\/v2 history: .* not published/.test(e.message))
  assert.equal(readState(dir).doc.runs[KEY].revision, LOG_KEEP + 5 + 1)
})

test('scope: a history is read only for the dossier it is of; a scope is taken from a decoded history', () => {
  const e = entryOf({ overflow: rec('overflow', { open: [group('page-overflow|div', [['/a', 320, 'light']])] }) })
  assert.deepEqual(scopeOf(e, { schemes: ['light', 'dark'], pages: PAGES }).checks, ['overflow'])
  assert.throws(() => scopeOf(e, { schemes: ['light', 'dark'], pages: ['/', '/a'] }), HistoryError)
  assert.throws(() => scopeOf(e, { schemes: ['light', 'dark'], pages: [...PAGES].reverse() }), HistoryError)
})

test('accept errors: the cells a row in error is measured at again are put inside the full run when they are recorded', () => {
  const sc = fullScope()
  assert.deepEqual(acceptCells({ routes: ['/a', '/gone'], widths: [1440], schemes: ['dark'] }, 'chips', sc), [['/a', 1440, 'dark']])
  assert.deepEqual(acceptCells({ routes: ['/gone'], widths: [999] }, 'chips', sc), [[null, null, null]])
  assert.deepEqual(acceptCells(null, 'chips', sc), [[null, null, null]])
  assert.deepEqual(acceptCells({ routes: ['/a', '/b'], widths: [320, 1440] }, 'overflow', sc), [['/a', 320, null], ['/a', 1440, null], ['/b', 320, null], ['/b', 1440, null]])
  // the widths of heights are its own
  assert.deepEqual(acceptCells({ routes: ['/a'], widths: [576, 320] }, 'heights', sc), [['/a', 576, null], ['/a', 320, null]])
  assert.deepEqual(acceptCells({ routes: ['/a'], widths: [1180] }, 'chips', sc), [['/a', null, null]])
  assert.equal(cellProblem('chips', ['/a', 1440, null], sc), null)
  // what is recorded is what the decoder passes, whatever the row says
  for (const row of [{ routes: [1] }, { widths: [1, 2] }, { schemes: ['sepia'] }, { routes: ['/a', '/x'], widths: [5], schemes: ['os-dark/saved-dark'] }, 5, 'x', [], undefined])
    assert.equal(problems((en) => (en.effective.checks.chips.acceptErrors = [{ message: 'm', cause: null, row: null, cells: acceptCells(row, 'chips', sc), measured: at('t1') }])), '', JSON.stringify(row))
})

test('runRecord: the record of a run carries its scope and its exit', () => {
  const r = runRecord({ report: { ranAt: 't1', timing: { totalMs: 5 } }, mode: 'full', reason: 'release gate', out: '/o', scope: fullScope(), exit: 1 })
  assert.deepEqual([r.ranAt, r.reason, r.wallMs, r.exit, Object.keys(r.scope)], ['t1', 'release gate', 5, 1, ['checks', 'routes', 'widths', 'heightsWidths', 'schemes']])
})

test('history: a history with no entry, and the metadata the consumers read, are refused', () => {
  assert.match(stateProblems({ schema: STATE_SCHEMA, runs: {} }).join('; '), /it holds no history entry/)
  const dir = tmp()
  writeFileSync(path.join(dir, STATE_FILE), JSON.stringify({ schema: STATE_SCHEMA, runs: {} }))
  assert.throws(() => readState(dir), (e) => e instanceof HistoryError && /holds no history entry/.test(e.message))
  for (const k of ['what', 'routes', 'widths', 'schemes', 'examples', 'evidence', 'occurrences']) refused((e) => delete e.effective.checks.overflow.open[0][k], /effective\.checks\.overflow is not a check record/)
  for (const k of ['what', 'routes', 'widths', 'schemes', 'decision', 'evidence', 'occurrences']) {
    const a = { cause: 'k', what: null, kind: 'decided', decision: 'D-1', evidence: null, occurrences: 1, routes: ['/a'], widths: [320], schemes: ['dark'], cells: [['/a', 320, 'dark']], measured: at('t1') }
    assert.equal(problems(() => {}, { overflow: rec('overflow', { accepted: [a] }) }), '')
    const { [k]: _gone, ...bad } = a
    assert.match(problems(() => {}, { overflow: rec('overflow', { accepted: [bad] }) }), /effective\.checks\.overflow is not a check record/, k)
  }
  refused((e) => (e.effective.checks.overflow.open[0].examples = [{ route: '/a' }]), /effective\.checks\.overflow is not a check record/)
  refused((e) => (e.effective.checks.overflow.open[0].examples = [{ route: '/a', width: 1, scheme: null, source: '1', port: '2', secret: 1 }]), /effective\.checks\.overflow is not a check record/)
})

test('history: a cell is at the widths its check reads — the scheme states at one width, a touch case at 1024/1180, a drawer case at 390/768', () => {
  const cell = (id, c) => problems(() => {}, { [id]: rec(id, { open: [group('x|y', [c])] }) })
  assert.match(cell('scheme', ['/a', 320, 'os-dark/no-choice']), /scheme\.open: width 320 is not a width scheme was measured at/)
  assert.equal(cell('scheme', ['/a', 1440, 'os-dark/no-choice']), '')
  assert.equal(cell('scheme', ['/a', null, 'os-dark/no-choice']), '')
  assert.match(cell('first-interaction', ['/', 320, 'touch']), /first-interaction\.open: width 320 is not a width first-interaction was measured at/)
  assert.equal(cell('first-interaction', ['/', 1024, 'touch']), '')
  assert.equal(cell('first-interaction', ['/', 1180, 'touch']), '')
  assert.match(cell('first-interaction', ['/', 1024, 'drawer']), /width 1024 is not a width first-interaction/)
  assert.equal(cell('first-interaction', ['/', 768, 'drawer']), '')
  assert.match(cell('first-interaction', ['/', 1024, 'os-dark/no-choice']), /width 1024 is not a width first-interaction/)
  assert.match(cell('first-interaction', ['/', 320, 'os-dark/no-choice']), /width 320 is not a width first-interaction/)
  assert.equal(cell('first-interaction', ['/', 390, 'os-dark/no-choice']), '')
  assert.equal(cell('heights', ['/a', 320, 'dark']), '')
  // the widths the code measures at are the ones the decoder knows
  const check = (c) => cellProblem('first-interaction', c, fullScope())
  assert.equal(check(['/', 1180, 'touch']), null)
})

test('history: a result stands on runs that measured it — the check, the route, the width and the scheme are inside the run', () => {
  const two = (mutate, checks, scope) => problems(mutate, checks, { latest: later('t2', { scope: { ...fullScope(), checks: ['overflow', 'chips'], routes: ['/a'], widths: [390], schemes: ['light'], heightsWidths: [] } }), log: ['t1', 't2'], ...scope })
  const by = (id, c, extra = {}) => ({ [id]: rec(id, { open: [group('x|y', [c], at('t2', '/runs/one', 'scoped'))], ...extra }, at('t2', '/runs/one', 'scoped')) })
  assert.equal(two(() => {}, by('overflow', ['/a', 320, 'light'])), '')
  // a check the run did not measure
  assert.match(two(() => {}, by('header', ['/a', 320, 'light'])), /header was measured by a run that did not measure header/)
  // a debt or an accepted cell outside what the run measured
  const debt = (c) => ({ chips: rec('chips', { debt: [{ route: c[0], width: c[1], scheme: c[2], cause: 'owed', reason: '', measured: at('t2', '/runs/one', 'scoped') }] }, at('t2', '/runs/one', 'scoped')) })
  assert.equal(two(() => {}, debt(['/a', 390, 'light'])), '')
  assert.match(two(() => {}, debt(['/b', 390, 'light'])), /chips\.debt: route \/b is not a route of the run/)
  assert.match(two(() => {}, debt(['/a', 1440, 'light'])), /chips\.debt: width 1440 is not a width of the run/)
  assert.match(two(() => {}, debt(['/a', 390, 'dark'])), /chips\.debt: scheme dark is not a scheme of the run/)
})

test('ja-fresco S-33: what the sweep writes into the dossier names its files relative to the dossier, never by a machine path', async () => {
  const { dossierPath, dossierName, recordsOf } = await import('../visual/site-sweep-scope.mjs')
  const root = tmp()
  const out = path.join(root, 'site-sweep-evidence', KEY, 'run-1')
  const r = runRecord({ report: { ranAt: 't1', timing: { totalMs: 5 } }, mode: 'full', reason: 'release gate', out, runRoot: root, scope: fullScope(), exit: 1 })
  assert.equal(r.out, `site-sweep-evidence/${KEY}/run-1`)
  const recs = recordsOf({ ranAt: 't1', checks: [{ id: 'overflow', title: 'Overflow', cases: 1 }], groups: {}, defects: {} }, { out, runRoot: root, mode: 'full', fullScope: fullScope() })
  assert.equal(recs.overflow.measured.out, `site-sweep-evidence/${KEY}/run-1`)
  assert.equal(dossierPath(root, path.join(root, 'site-sweep-state.json')), 'site-sweep-state.json')
  // a dossier inside a git checkout is named by its path in the checkout; outside one, by its folder name
  mkdirSync(path.join(root, 'repo', '.git'), { recursive: true })
  mkdirSync(path.join(root, 'repo', 'tasks', 'x-wp7'), { recursive: true })
  assert.equal(dossierName(path.join(root, 'repo', 'tasks', 'x-wp7')), 'tasks/x-wp7')
  assert.equal(dossierName(path.join(root, 'repo', 'tasks')), 'tasks')
})

// ---- intermittent groups and the source fingerprint of an entry (synthetic) --------------------------------------------------------

const inter = (cause = 'page-overflow|gone', cells = [['/a', 320, 'light']], absent = 1) => ({ ...group(cause, cells), absent })
const withInter = (list = [inter()], o = {}) => ({ overflow: rec('overflow', { intermittent: list, ...o }) })
const PRINT = { algorithm: 'tracy-source-fingerprint/v1', url: 'http://s.test/', htmlSha256: 'a'.repeat(64), template: null }
const printed = () => ({ ...PRINT, id: fingerprintId(PRINT) })
function fingerprintId(f) {
  return createHash('sha256').update(JSON.stringify([f.algorithm, f.url, f.htmlSha256, f.template])).digest('hex')
}

test('history: an intermittent group is a valid record of the result; one that has been absent long enough, repeats an open cause, or lies outside the full run is refused', () => {
  assert.equal(stateProblems(docOf(storedOf(withInter()))).length, 0)
  refused((e) => (e.effective.checks.overflow.intermittent[0].absent = 2), /effective\.checks\.overflow is not a check record/, withInter())
  refused((e) => (e.effective.checks.overflow.intermittent[0].absent = -1), /effective\.checks\.overflow is not a check record/, withInter())
  refused((e) => (e.effective.checks.overflow.intermittent = []), /effective\.checks\.overflow is not a check record/, withInter())
  refused((e) => delete e.effective.checks.overflow.intermittent[0].absent, /effective\.checks\.overflow is not a check record/, withInter())
  refused((e) => (e.effective.checks.overflow.intermittent[0].cells = [['/nowhere', 320, 'light']]), /route \/nowhere is not a route of the full run/, withInter())
  refused((e) => (e.effective.checks.overflow.intermittent[0].measured = at('t9')), /measured by a run that is not one of its run records/, withInter())
  refused((e) => e.effective.checks.overflow.intermittent.push(structuredClone(e.effective.checks.overflow.intermittent[0])), /intermittent group of a cause that is open or listed twice/, withInter())
  refused((e) => e.effective.checks.overflow.open.push(group('page-overflow|gone', [['/b', 320, 'light']])), /intermittent group of a cause that is open or listed twice/, withInter())
})

test('history: an intermittent group fails the effective exit and is measured again by the next scope', () => {
  const entry = entryOf(withInter())
  assert.equal(entry.effective.exit, 1)
  refused((e) => (e.effective.exit = 0), /effective exit 0 does not agree/, withInter())
  assert.deepEqual(scopeOf(entry, { schemes: ['light', 'dark'], pages: PAGES }).routes, ['/a'])
})

test('history: the source fingerprint of an entry is optional, and a malformed one is refused', () => {
  assert.equal(stateProblems(docOf(storedOf({}, { sourceFingerprint: printed() }))).length, 0)
  refused((e) => (e.sourceFingerprint = { ...e.sourceFingerprint, htmlSha256: 'x' }), /its sourceFingerprint: htmlSha256/, {}, { sourceFingerprint: printed() })
  refused((e) => (e.sourceFingerprint = { ...e.sourceFingerprint, id: 'f'.repeat(64) }), /its sourceFingerprint: id does not follow/, {}, { sourceFingerprint: printed() })
  refused((e) => (e.other = 1), /is not a history entry/, {}, { sourceFingerprint: printed() })
})

test('history: the entry written after a run keeps the intermittent groups, the runs they were last seen in, and the source fingerprint, through the log limit', () => {
  let entry = null
  for (let i = 0; i < LOG_KEEP + 3; i++) {
    const ranAt = `t${String(i + 1).padStart(3, '0')}`
    const first = i === 0
    const mode = first ? 'full' : 'scoped'
    const out = `/runs/${ranAt}`
    const run = first ? record({ ranAt, mode, out, exit: 1 }) : { ...record({ ranAt, mode, out, exit: 1 }), scope: { ...fullScope(), checks: ['overflow'] } }
    // the group was last seen in the full run and every later run carries it unchanged
    const checks = Object.fromEntries(ALL_CHECKS.map((id) => [id, id === 'overflow' ? rec(id, { intermittent: [{ ...inter(), measured: at('t001', '/runs/t001') }] }, at(ranAt, out, mode)) : rec(id, {}, at('t001', '/runs/t001'))]))
    entry = entryAfter({ previous: entry ? resolveEntry(entry) : null, identity: IDENTITY, record: run, merged: { checks }, exit: 1, sourceFingerprint: printed() })
    entry.revision = i + 1
  }
  assert.equal(entry.log.length, LOG_KEEP)
  assert.ok(entry.runs.t001, 'the run the group was last seen in is kept beyond the log')
  assert.equal(entry.sourceFingerprint.id, printed().id)
  assert.equal(stateProblems(docOf(entry)).length, 0, stateProblems(docOf(entry)).join('; '))
})
