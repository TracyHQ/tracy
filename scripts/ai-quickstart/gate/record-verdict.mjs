// The verdict of a check record worked out again from the record itself (ticket #586): the release guard never takes a
// verdict on trust. Every part the marker test and the demo scan own is recomputed from what the record keeps (the
// write's status, the findings, the written values not seen, the universe's unexplained places, the demo findings, the
// renders that failed, the human control, the order and observation problems), the four measurements of #586 from
// their statuses, and each measurement's status is checked against what it holds (a write safety finding that fails,
// a structure variant that failed, a quality regression, a secret found). Pure.
import { FAILING } from './write-safety-judge.mjs'
import { structureStatusOf } from './structure.mjs'
import { MEASURED_PARTS, verdictOf } from './verdict.mjs'

/** The verdict a record's own contents give: `{pass, failing, measurements}`. */
export function verdictFromRecord(record) {
  const r = record ?? {}
  const v = verdictOf({
    real: r.write?.site ?? null,
    accounting: { counts: r.universe ?? {} },
    findings: r.markerTest?.findings ?? [],
    notSeen: r.markerTest?.notSeen ?? [],
    demo: { browser: r.demoScan?.findings ?? [], html: r.demoScan?.html ?? [] },
    failedRenders: r.render?.failed?.length ?? 0,
    renderCount: r.render?.renders ?? 0,
    controls: r.demoScan?.controls ?? {},
    orderProblems: r.write?.orderProblems ?? [],
    observationProblems: r.markerTest?.observationProblems ?? [],
    measurements: Object.fromEntries(MEASURED_PARTS.map((p) => [p, r.measurements?.[p]]))
  })
  const pass = v.pass && v.measurements.markerTest === 'passed' && v.measurements.demoScan === 'passed'
  return { pass, failing: v.failing, measurements: v.measurements }
}

/** The measurements whose status says more than what they hold, as `[{code, message}]`. */
export function measurementProblems(record) {
  const m = record?.measurements ?? {}
  const out = []
  const say = (name, why) =>
    out.push({ code: 'measurement_inconsistent', message: name + ' is ' + m[name]?.status + ' but ' + why })
  const ws = m.writeSafety
  if (ws?.status === 'passed') {
    if ((ws.passes ?? []).some((p) => p?.resumed) || ws.resumedFrom != null)
      say('writeSafety', 'it holds passes carried from a saved state')
    if ((ws.findings ?? []).some((f) => FAILING.has(f.kind))) say('writeSafety', 'it holds a failing finding')
    if (!ws.places?.tested || ws.places.tested < ws.places.probed)
      say('writeSafety', 'not every probed place reached the site')
    if ((ws.missing ?? []).length || (ws.notSiteTested ?? []).length) say('writeSafety', 'probes are missing')
  }
  const st = m.structure
  if (st?.status && st.status !== structureStatusOf(st.linkCheck, st.minItems, st.hidden))
    say('structure', 'its variants say ' + structureStatusOf(st.linkCheck, st.minItems, st.hidden))
  if (
    m.quality?.status === 'passed' &&
    ((m.quality.regressions ?? []).length || (m.quality.seo?.blocking ?? []).length)
  )
    say('quality', 'it holds a regression or a missing search engine item')
  if (
    m.secrets?.status === 'passed' &&
    ((m.secrets.findings ?? []).length || (m.secrets.unusedAllows ?? []).length)
  )
    say('secrets', 'it holds a finding or an unused allow entry')
  return out
}

/**
 * Whether two verdicts say the same: the pass, the failing parts and the status of each measurement of #586 (a marker
 * test that threw is kept as `incomplete` where the recomputation says `not_run`: both fail).
 */
export const sameVerdict = (a, b) =>
  a?.pass === b?.pass &&
  JSON.stringify(a?.failing ?? []) === JSON.stringify(b?.failing ?? []) &&
  MEASURED_PARTS.every((p) => a?.measurements?.[p] === b?.measurements?.[p])
