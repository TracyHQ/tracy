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
    : rows.some((r) => r.status === 'not_judged')
      ? 'judged_by_no_page'
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
  spent,
  parked = new Map(),
  ranFor = null
}) {
  const missing = ledger.missing(places, probes)
  const rows = ledger.rows()
  const onSite = new Set(rows.filter((r) => r.status === 'written' && r.reached).map((r) => r.place))
  const inPass = new Set(rows.filter((r) => r.site).map((r) => r.place))
  const notWritten = [...new Set(rows.filter((r) => r.status === 'not_written').map((r) => r.place))]
  // Pairs no page judged, every print of the place cut short (review 6 S2).
  const notJudged = [...new Set(rows.filter((r) => r.status === 'not_judged').map((r) => r.place))]
  const notSiteTested = places.filter((p) => !onSite.has(p.key)).map((p) => p.key)
  const notInFinishedPass = {}
  for (const p of places)
    if (!inPass.has(p.key)) {
      const why = notProbedWhy(rows.filter((r) => r.place === p.key))
      notInFinishedPass[why] = (notInFinishedPass[why] ?? 0) + 1
    }
  const failed = findings.some((f) => FAILING.has(f.kind))
  // How each place ends: tested on the site, refused with its own evidence (a finding names it), or untested with why.
  const named = new Set(findings.filter((f) => f.place).map((f) => f.place))
  // `parkedTested`: places tested in an earlier pass and set aside in a later one, whose later probes were never tried.
  const ends = { tested: 0, refused: 0, untested: [], parkedTested: 0 }
  for (const p of places) {
    if (onSite.has(p.key)) {
      ends.tested += 1
      if (parked.has(p.key)) ends.parkedTested += 1
    } else if (parked.has(p.key)) ends.untested.push({ place: p.key, ...parked.get(p.key) })
    else if (named.has(p.key) && !missing.some((m) => m.place === p.key)) ends.refused += 1
    else
      ends.untested.push({
        place: p.key,
        why: named.has(p.key) ? 'probes_left' : notProbedWhy(rows.filter((r) => r.place === p.key))
      })
  }
  // A resumed measurement took its earlier passes on trust: it never says it passed (review 4 X5).
  const why =
    incomplete ??
    (was ? 'resumed' : null) ??
    (missing.length
      ? 'passes'
      : findings.some((f) => f.kind === 'unclassified')
        ? 'unclassified_stop'
        : notWritten.length
          ? 'probe_not_written'
          : notJudged.length
            ? 'probe_not_judged'
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
    ends,
    ledger: rows,
    missing,
    notSiteTested,
    notWritten,
    notJudged,
    coverage: {
      ...coverage,
      places: {
        couldTakeProbe: places.length,
        inFinishedPass: inPass.size,
        tested: onSite.size,
        notInFinishedPass
      }
    },
    ...spent(),
    // The seconds this run measured for: the passes it ran fit in it, passes carried from a state do not.
    ...(ranFor == null ? {} : { ranFor }),
    ...(was ? { resumedFrom: was.passes.length } : {})
  }
}
