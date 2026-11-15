// The verdict of the release gate's check record (ticket #585). Passed only when every part was measured and is
// clean: the real write finished; every written marker is seen on a page or carries a declared reason; no leak; no
// unexplained place of the universe; no demo word or picture in the browser's read nor in the raw HTML (a picture in
// `noscript`, `data-src` or an unchosen `srcset` candidate is only in the HTML); every page answered as it should; the
// demo scan found demo on the untouched human quickstart (zero there means the scan is blind on this template); the
// write order had no problem; and the measurements of the next ticket ran and passed. The blank site before the write
// serves no page by design (no home menu item), so its control is recorded as not applicable and never judged. Pure.

/** The measurements of #586 the record holds a slot for: `not_run` until that ticket fills them. */
export const PENDING = Object.freeze({
  minItems: { ticket: 586, status: 'not_run' },
  linkCheck: { ticket: 586, status: 'not_run' }
})

/**
 * The blank control as a record: not applicable, with the statuses the blank site answered.
 * @param {object[]} renders the blank site's renders before the write
 */
export function blankControlOf(renders) {
  return {
    status: 'not_applicable',
    reason:
      'the blank site before the write serves no page by design (it has no home menu item), so a demo scan of it measures nothing',
    statuses: (renders ?? []).map((r) => ({ path: r.path, status: r.status, expected: r.expected ?? 200 }))
  }
}

/** The human control in the verdict's words: `right`, `scan_blind` (no demo found) or `not_run`. */
const humanControl = (c) =>
  c?.status !== 'run' || c.failed ? 'not_run' : c.findings > 0 ? 'right' : 'scan_blind'

/**
 * @param {{real: object | null, accounting: {counts: object}, findings: object[], notSeen: object[],
 *   demo: {browser: object[], html: object[]}, renders: object[], controls?: object, orderProblems?: object[],
 *   observationProblems?: object[], measurements?: Record<string, {status: string}>}} input
 */
export function verdictOf(input) {
  const leaks = (input.findings ?? []).filter((f) => f.group !== 'outside_request')
  const notSeenUnexplained = (input.notSeen ?? []).filter((n) => !n.declared).length
  const demoFindings = (input.demo?.browser?.length ?? 0) + (input.demo?.html?.length ?? 0)
  const failedRenders = (input.renders ?? []).filter((r) => r.status !== (r.expected ?? 200)).length
  const notRun = Object.keys(PENDING).filter((k) => input.measurements?.[k]?.status !== 'passed')
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
    observation: (input.observationProblems ?? []).length === 0,
    pending: notRun.length === 0
  }
  const failing = Object.entries(parts)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
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
    notRun,
    failing,
    pass: failing.length === 0
  }
}
