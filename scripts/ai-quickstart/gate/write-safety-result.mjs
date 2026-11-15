// The write safety measurement from what its passes found (ticket #586): failed on a finding that fails, else
// incomplete with the first reason (passes left, a stop with no named code, a probe the build did not write, a place
// never tested on the site), else passed. It keeps every list a reviewer or the release guard needs to count again:
// the places probed, the ledger, the probes missing, the places not tested, and the coverage table with the places
// probed in a pass, tested, and the rest by reason (`write-safety-coverage.mjs`). Pure.
import { FAILING } from './write-safety-judge.mjs'

/** Why a place a pass could probe was not probed in any pass. */
const notProbedWhy = (rows) =>
  rows.some((r) => r.status === 'not_written')
    ? 'probe_not_written'
    : rows.length
      ? 'refused_or_failed'
      : 'no_pass_reached_it'

/** The measurement from what the passes found: failed, incomplete with the first reason, or passed. */
export function resultOf({
  places,
  written,
  ledger,
  probes,
  findings,
  passes,
  incomplete,
  stop,
  coverage,
  was,
  spent
}) {
  const missing = ledger.missing(places, probes)
  const rows = ledger.rows()
  const onSite = new Set(rows.filter((r) => r.status === 'written' && r.reached).map((r) => r.place))
  const inPass = new Set(rows.filter((r) => r.site).map((r) => r.place))
  const notWritten = [...new Set(rows.filter((r) => r.status === 'not_written').map((r) => r.place))]
  const notSiteTested = places.filter((p) => !onSite.has(p.key)).map((p) => p.key)
  const notProbedInPass = {}
  for (const p of places)
    if (!inPass.has(p.key)) {
      const why = notProbedWhy(rows.filter((r) => r.place === p.key))
      notProbedInPass[why] = (notProbedInPass[why] ?? 0) + 1
    }
  const failed = findings.some((f) => FAILING.has(f.kind))
  const why =
    incomplete ??
    (missing.length
      ? 'passes'
      : findings.some((f) => f.kind === 'unclassified')
        ? 'unclassified_stop'
        : notWritten.length
          ? 'probe_not_written'
          : notSiteTested.length
            ? 'not_site_tested'
            : null)
  return {
    status: failed ? 'failed' : why ? 'incomplete' : 'passed',
    ...(why ? { incomplete: why } : {}),
    ...(stop ? { stop: { code: stop } } : {}),
    places: { written: written.length, probed: places.length, tested: onSite.size },
    placeKeys: places.map((p) => p.key),
    passes,
    findings,
    ledger: rows,
    missing,
    notSiteTested,
    notWritten,
    coverage: {
      ...coverage,
      places: {
        couldTakeProbe: places.length,
        probedInPass: inPass.size,
        tested: onSite.size,
        notProbedInPass
      }
    },
    ...spent(),
    ...(was ? { resumedFrom: was.passes.length } : {})
  }
}
