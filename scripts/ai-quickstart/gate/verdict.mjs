// The verdict of the release gate's check record (tickets #585 and #586). Passed only when every part was measured
// and is clean: the real write finished; every written marker is seen on a page or carries a declared reason; no leak;
// no unexplained place of the universe; no demo word or picture in the browser's read nor in the raw HTML (a picture in
// `noscript`, `data-src` or an unchosen `srcset` candidate is only in the HTML); every page answered as it should; the
// demo scan found demo on the untouched human quickstart (zero there means the scan is blind on this template); the
// write order had no problem; and the four measurements of #586 (write safety, structure, quality, secrets) each say
// `passed`. The blank site before the write serves no page by design (no home menu item), so its control is recorded
// as not applicable and never judged. Pure.

/** The status a measurement holds. A part of the verdict passes only on `passed`. */
export const STATUSES = Object.freeze(['passed', 'failed', 'incomplete', 'not_run'])

/** The measurements of #586 the gate runs beside the marker test and the demo scan, in record order. */
export const MEASURED_PARTS = Object.freeze(['writeSafety', 'structure', 'quality', 'secrets'])

/** Each measurement of #586 before it ran: `structure` holds its three variants (all items, fewest, pages hidden). */
export function notRunMeasurements() {
  return {
    writeSafety: { ticket: 586, status: 'not_run' },
    structure: {
      ticket: 586,
      status: 'not_run',
      linkCheck: { status: 'not_run' },
      minItems: { status: 'not_run' },
      hidden: { status: 'not_run' }
    },
    quality: { ticket: 586, status: 'not_run' },
    secrets: { ticket: 586, status: 'not_run' }
  }
}

/** The status of the structure measurement from its three variants when it gives none: failed beats incomplete. */
export function structureStatus(structure) {
  const parts = [structure?.linkCheck?.status, structure?.minItems?.status, structure?.hidden?.status]
  if (parts.every((s) => s === 'passed')) return 'passed'
  if (parts.includes('failed')) return 'failed'
  if (parts.includes('passed') || parts.includes('incomplete')) return 'incomplete'
  return 'not_run'
}

/**
 * The four measurements of #586 filled from the run's own, every missing one `not_run`; an unknown status reads as
 * `incomplete`, so a typo never passes.
 */
export function measurementsOf(given = {}) {
  const out = notRunMeasurements()
  for (const name of MEASURED_PARTS) {
    if (given[name]) out[name] = { ...out[name], ...structuredClone(given[name]) }
  }
  if (!given.structure?.status) out.structure.status = structureStatus(out.structure)
  for (const name of MEASURED_PARTS) if (!STATUSES.includes(out[name].status)) out[name].status = 'incomplete'
  return out
}

/**
 * The blank control as a record: not applicable, with the statuses the blank site answered.
 * @param {object[]} renders the blank site's renders before the write
 */
export function blankControlOf(renders) {
  const statuses = (renders ?? []).map((r) => ({
    path: r.path,
    status: r.status,
    expected: r.expected ?? 200
  }))
  // A 404 is the blank site's design (it has no home menu item); a server error is not, and is said apart, by count.
  const errors = statuses.filter((r) => r.status >= 500 && r.status !== r.expected).length
  const said = errors
    ? `; ${errors} ${errors === 1 ? 'address answers' : 'addresses answer'} a server error (500) there, recorded below and not judged here`
    : ''
  return {
    status: 'not_applicable',
    reason: `the blank site before the write is not judged: its pages answer 404 by design (it has no home menu item), so a demo scan of it measures nothing${said}`,
    statuses
  }
}

/** The human control in the verdict's words: `right`, `scan_blind` (no demo found) or `not_run`. */
const humanControl = (c) =>
  c?.status !== 'run' || c.failed ? 'not_run' : c.findings > 0 ? 'right' : 'scan_blind'

/** The parts of the verdict the marker test owns, and the ones the demo scan owns. */
const MARKER_PARTS = ['write', 'leaks', 'notSeen', 'accounting', 'renders', 'order', 'observation']
const DEMO_PARTS = ['demo', 'controls']

/**
 * @param {{real: object | null, accounting: {counts: object}, findings: object[], notSeen: object[],
 *   demo: {browser: object[], html: object[]}, renders: object[], controls?: object, orderProblems?: object[],
 *   observationProblems?: object[], measurements?: Record<string, {status: string}>, failedRenders?: number,
 *   renderCount?: number}} input `failedRenders`, `renderCount`: the counts a record keeps, in place of `renders`
 */
export function verdictOf(input) {
  const leaks = (input.findings ?? []).filter((f) => f.group !== 'outside_request')
  const notSeenUnexplained = (input.notSeen ?? []).filter((n) => !n.declared).length
  const demoFindings = (input.demo?.browser?.length ?? 0) + (input.demo?.html?.length ?? 0)
  // A record read back gives the counts it keeps (`record-verdict.mjs`); a run gives its renders.
  const failedRenders =
    input.failedRenders ?? (input.renders ?? []).filter((r) => r.status !== (r.expected ?? 200)).length
  const renderCount = input.renderCount ?? (input.renders ?? []).length
  const measured = measurementsOf(input.measurements)
  const controls = humanControl(input.controls?.human)
  const write = input.real?.status ?? 'not_run'
  const parts = {
    write: write === 'done',
    leaks: leaks.length === 0,
    notSeen: notSeenUnexplained === 0,
    accounting: (input.accounting?.counts?.unexplained ?? 1) === 0,
    demo: demoFindings === 0,
    renders: failedRenders === 0,
    controls: controls === 'right',
    order: (input.orderProblems ?? []).length === 0,
    // A part of a page the reader could not read (structured data that does not parse) is not vouched for.
    observation: (input.observationProblems ?? []).length === 0
  }
  for (const name of MEASURED_PARTS) parts[name] = measured[name].status === 'passed'
  const failing = Object.entries(parts)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
  const statusOf = (names, ran) => (!ran ? 'not_run' : names.every((n) => parts[n]) ? 'passed' : 'failed')
  const statuses = {
    markerTest: statusOf(MARKER_PARTS, write !== 'not_run'),
    demoScan: statusOf(DEMO_PARTS, renderCount > 0 || controls !== 'not_run'),
    ...Object.fromEntries(MEASURED_PARTS.map((n) => [n, measured[n].status]))
  }
  return {
    write,
    leaks: leaks.length,
    unexplained: input.accounting?.counts?.unexplained ?? null,
    notSeenUnexplained,
    demoFindings,
    demoInBrowser: input.demo?.browser?.length ?? 0,
    demoInHtml: input.demo?.html?.length ?? 0,
    failedRenders,
    controls,
    orderProblems: (input.orderProblems ?? []).length,
    observationProblems: (input.observationProblems ?? []).length,
    measurements: statuses,
    notRun: MEASURED_PARTS.filter((n) => measured[n].status === 'not_run'),
    failing,
    pass: failing.length === 0
  }
}
