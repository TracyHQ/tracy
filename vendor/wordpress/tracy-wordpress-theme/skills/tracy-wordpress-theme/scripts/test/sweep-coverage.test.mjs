// lib/sweep-coverage.mjs: what a measure covers, and the gate a patch release holds it to. All readings are synthetic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverageOf, coverageProblems, expectedSweepCells, mergeCoverage, sweepOutcomeProblems, validateCoverage } from '../lib/sweep-coverage.mjs'
import { judgeTargetBehaviour } from '../visual/site-sweep-behaviour-judge.mjs'

const CHECKS = ['overflow', 'scheme', 'heights']
const EXPECTED = { checks: CHECKS, routes: ['/', '/a'], widths: [320, 1440], heightsWidths: [320, 576, 1440], schemes: ['light', 'dark'] }
const full = (o = {}) => coverageOf({ mode: 'full', checks: CHECKS, routes: ['/', '/a'], widths: [320, 1440], heightsWidths: [320, 576, 1440], schemes: ['light', 'dark'], ...o })
const measure = (coverage, ids = CHECKS) => ({ coverage, checks: ids.map((id) => ({ id, pass: true })) })
const codes = (m) => coverageProblems(m, EXPECTED).map((p) => p.code)

test('coverage: a full run of every check over every route on the standard axes has no problem', () => {
  assert.deepEqual(validateCoverage(full()), [])
  assert.deepEqual(coverageProblems(measure(full()), EXPECTED), [])
  // route order does not matter, the set does
  assert.deepEqual(codes(measure(full({ routes: ['/a', '/'] }))), [])
})

test('coverage: a measure with no coverage, or a malformed one, is never enough', () => {
  assert.deepEqual(codes({ checks: [] }), ['measure-coverage-missing'])
  assert.deepEqual(codes({ coverage: null, checks: [] }), ['measure-coverage-missing'])
  assert.deepEqual(codes(measure({ mode: 'full' })), ['measure-coverage-invalid'])
  assert.ok(validateCoverage({ ...full(), mode: 'all' }).length)
  assert.ok(validateCoverage({ ...full(), widths: ['320'] }).length)
})

test('coverage: scoped, narrowed and carried evidence is refused, whatever else it holds', () => {
  assert.deepEqual(codes(measure(full({ mode: 'scoped', explicit: ['--only'] }))), ['measure-scoped'])
  assert.deepEqual(codes(measure(full({ explicit: ['--pages'] }))), ['measure-scoped'])
  assert.deepEqual(codes(measure(full({ carried: true }))), ['measure-carried'])
  assert.match(coverageProblems(measure(full({ mode: 'scoped', explicit: ['--widths', '--schemes'] })), EXPECTED)[0].message, /--widths, --schemes/)
})

test('coverage: a check the run did not measure, or the measure does not list, is named', () => {
  const lacking = coverageProblems(measure(full({ checks: ['overflow', 'scheme'] })), EXPECTED)
  assert.deepEqual(lacking.map((p) => p.code), ['measure-checks-missing'])
  assert.match(lacking[0].message, /1 of the 3 check\(s\): heights/)
  const unlisted = coverageProblems(measure(full(), ['overflow', 'scheme']), EXPECTED)
  assert.match(unlisted[0].message, /no result for 1 check\(s\): heights/)
})

test('coverage: routes are compared by identity — one replaced by another, or one missing, is refused', () => {
  const swapped = coverageProblems(measure(full({ routes: ['/', '/b'] })), EXPECTED)
  assert.deepEqual(swapped.map((p) => p.code), ['measure-routes-missing'])
  assert.match(swapped[0].message, /1 not measured \(\/a\); 1 not in the contract \(\/b\)/)
  assert.deepEqual(codes(measure(full({ routes: ['/'] }))), ['measure-routes-missing'])
  assert.deepEqual(codes(measure(full({ routes: ['/', '/a', '/b'] }))), ['measure-routes-missing'])
})

test('coverage: each axis is the standard one — widths, heights widths, schemes', () => {
  assert.deepEqual(codes(measure(full({ widths: [1440] }))), ['measure-axes-missing'])
  assert.deepEqual(codes(measure(full({ heightsWidths: [320, 1440] }))), ['measure-axes-missing'])
  assert.deepEqual(codes(measure(full({ schemes: ['light'] }))), ['measure-axes-missing'])
  assert.deepEqual(codes(measure(full({ widths: [320, 1440, 99] }))), ['measure-axes-missing'])
})

test('coverage: blocks merge only when they are the same block — scoped runs never add up to a full one', () => {
  assert.equal(mergeCoverage([undefined, null]), null)
  assert.deepEqual(mergeCoverage([undefined, full()]), full())
  assert.deepEqual(mergeCoverage([full(), full()]), full())
  assert.equal(mergeCoverage([full({ checks: ['overflow'], mode: 'scoped' }), full({ checks: ['scheme'], mode: 'scoped' })]), null)
})

test('sweep outcomes: a spec-bound none page needs every typed comparison N/A and each target measurement', () => {
  const pages = [{ path: '/', referenceKind: 'none' }]
  const widths = [390, 768, 1024, 1180, 1440]
  const schemes = ['light', 'dark']
  const heights = [390, 576, 768, 992, 1024, 1180, 1440]
  const expected = expectedSweepCells({ pages, widths, heightsWidths: heights, schemes })
  const axis = (cell, state = cell.state) => ({ route: cell.route, ...(cell.width !== undefined ? { width: cell.width } : {}), ...(cell.scheme !== undefined ? { scheme: cell.scheme } : {}), ...(state !== undefined ? { state } : {}) })
  const outcomes = expected.flatMap((cell) => {
    const comparison = { check: `sweep-${cell.check}-comparison`, ...axis(cell), status: 'not-applicable', reason: 'reference.kind=none' }
    if (!['overflow', 'scheme', 'fixed-widgets', 'icons', 'forms', 'first-interaction'].includes(cell.check)) return [comparison]
    const targetState = cell.state?.replace(/^theme:/, '').replace(/\/none$/, '/no-choice').replace(/\/auto$/, '/old-auto-value')
    const produced = cell.check === 'forms'
      ? judgeTargetBehaviour('forms', [{ route: cell.route, referenceKind: 'none', width: cell.width, scheme: cell.scheme, port: { forms: [] } }]).outcomes[0]
      : { check: cell.check, ...axis(cell, targetState), status: 'pass' }
    return [comparison, produced]
  })
  const report = { widths, schemes, heights: { widths: heights }, applicability: { version: 1, outcomes }, rows: [], stateRows: [], behaviourRows: {}, owed: [] }
  assert.deepEqual(sweepOutcomeProblems(report, pages), [])
  const targetFail = outcomes.find((x) => x.check === 'overflow')
  targetFail.status = 'fail'
  assert.ok(sweepOutcomeProblems(report, pages).some((x) => /target invariant failed/.test(x)))
  targetFail.status = 'pass'
  const comparison = outcomes.find((x) => x.status === 'not-applicable')
  comparison.reason = 'forged'
  assert.ok(sweepOutcomeProblems(report, pages).some((x) => /missing or invalid spec-bound N\/A/.test(x)))
  comparison.reason = 'reference.kind=none'
  report.applicability.outcomes.splice(report.applicability.outcomes.findIndex((x) => x.status === 'not-applicable'), 1)
  assert.ok(sweepOutcomeProblems(report, pages).some((x) => /missing or invalid spec-bound N\/A/.test(x)))
})
