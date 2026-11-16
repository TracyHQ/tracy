// The one line per measurement of the review page (ticket #586), for an owner who does not read code. Every sentence
// is true for the state it describes: a line says a thing was fine only when it was measured and passed; a measurement
// that did not finish says what did not finish and why; build refusals are named apart, never as values tested on the
// site. The structure line names each of its three variants. Pure.

const n = (count, one, many) => count + ' ' + (count === 1 ? one : many)

/** Why a measurement or a variant did not run or did not finish, in plain words. */
const WHY = {
  no_reset_hook: 'the run had no reset command to make the site fresh again',
  marker_test_not_written: 'the marker test did not write the site',
  marker_test_not_rendered: 'the marker test did not read the pages',
  no_page_reader: 'no browser was given to read the pages',
  time: 'it ran out of time (run it again into the same folder to resume)',
  passes: 'it ran out of passes before every value reached every field',
  steps: (m) =>
    'it ran out of site steps' +
    (m?.steps == null ? '' : ' (' + m.steps + ' used)') +
    ' while looking for the field that caused a problem',
  unattributed:
    'a stop or a broken page needs several values together, and no single one was found to cause it',
  reruns: 'one pass met more stops than it may write again',
  plain_write_stopped: 'the plain marker build did not finish writing the site',
  plain_pages_broken: 'a page of the plain marker build did not answer as planned',
  plain_build_failed: 'the plain marker build could not be made',
  not_site_tested: 'some places never received a value on the real site',
  unclassified_stop: 'a stop came with a code the gate does not know',
  no_probes: 'it had no values to try',
  no_places: 'the build writes no place it can try values in',
  write_stopped: 'the build did not finish writing the site',
  full_not_written: 'the build did not finish writing the site',
  no_pages: 'no page was read',
  items_not_at_shape:
    'some blocks were not shown at the number of items the variant asks for, with no reason given',
  no_hide_door: 'the site has no way to hide a page',
  hide_door_failed: 'hiding or publishing a page failed',
  pages_not_back: 'some pages did not answer again once published',
  nothing_hidden: 'the site has no page it could hide',
  hidden_page_still_answers: 'a hidden page still answered as shown, so nothing was hidden',
  link_probe_cap: 'its links reached the most the link check reads, so some were not read',
  run_state: 'the run state stopped the write (a run record of another plan, a stored picture gone)',
  probe_not_written: 'the build wrote other values than the probes at some places',
  probe_not_judged: 'some pages printed a value only cut short, so no page showed whether it ran',
  red_without_failures: 'a check reported a problem without naming it',
  record_not_scanned: 'the record itself was not scanned',
  record_gitleaks_not_run: 'gitleaks did not run over the record itself',
  record_scan_failed: 'the scan of the record itself failed',
  record_scan_unsettled: 'the scan of the record itself did not settle',
  run_stopped: 'the run stopped before this measurement'
}
export const whyOf = (m) => {
  const code = m?.reason ?? m?.incomplete
  if (typeof WHY[code] === 'function') return WHY[code](m)
  if (WHY[code]) return WHY[code]
  if (code) return String(code).replaceAll('_', ' ')
  return m?.status === 'not_run' ? 'this run did not include it' : 'it did not finish'
}

/** One structure variant in words. */
/**
 * The unplanned links of a variant, with the two kinds the hidden variant meets (review 5 Z6): the category list of a
 * blog page (hiding the page's menu item does not hide its category) and a doubled `index.php` address.
 */
function unplannedOf(links, hidden) {
  if (!links?.length) return ''
  const head = n(links.length, 'link reaches', 'links reach') + ' a page the plan has not got (recorded only'
  if (!hidden) return '; ' + head + ')'
  const category = links.filter((l) => /[?&]view=category(?:&|$)/.test(String(l.href ?? ''))).length
  const doubled = links.filter((l) => /\/index\.php\/index\.php\//.test(String(l.href ?? ''))).length
  const kinds = [
    category ? category + ' a category list, which hiding a page does not hide' : '',
    doubled ? doubled + ' a doubled index.php address' : ''
  ].filter(Boolean)
  return '; ' + head + (kinds.length ? ': ' + kinds.join('; ') : '') + ')'
}

function variantLine(name, v, hidden = false) {
  if (!v || v.status === 'not_run') return name + ': not measured, ' + whyOf(v ?? { status: 'not_run' })
  const unplanned =
    unplannedOf(v.unplanned, hidden) +
    (v.elsewhere?.length
      ? '; ' +
        n(v.elsewhere.length, 'link reaches', 'links reach') +
        ' a planned page at another menu address (recorded only)'
      : '')
  // A variant that did not finish still says what it read before it stopped.
  if (v.status === 'incomplete')
    return (
      name +
      ': not finished, ' +
      whyOf(v) +
      (v.broken?.length ? '; ' + n(v.broken.length, 'broken link', 'broken links') + ' so far' : '') +
      unplanned
    )
  const broken = v.broken?.length ?? 0
  if (hidden) {
    const down = v.shownBroken?.length
      ? '; ' +
        n(v.shownBroken.length, 'page not hidden', 'pages not hidden') +
        ' did not answer while others were'
      : ''
    return (
      name +
      ': ' +
      (broken
        ? n(broken, 'link leads', 'links lead') + ' to a hidden page (or one still served at another address)'
        : "no link leads to a hidden page's own address") +
      down +
      unplanned
    )
  }
  const errors = v.errors?.length ?? 0
  const items = v.items?.length
    ? '; ' + n(v.items.length, 'block', 'blocks') + ' not at the items the variant asks for'
    : ''
  if (v.status === 'passed' && !broken && !errors)
    return name + ': every page answers and no link is broken' + unplanned
  return (
    name +
    ': ' +
    n(broken, 'broken link', 'broken links') +
    ' and ' +
    n(errors, 'page error', 'page errors') +
    items +
    unplanned
  )
}

/** Why a place ended untested, in plain words. */
const UNTESTED = {
  suspect_of_untraced_stop: 'set aside as suspects of a stop no step was left to trace',
  suspect_of_untraced_page: 'set aside as suspects of a broken page no step was left to trace',
  suspect_of_unattributed_stop: 'set aside as suspects of a stop no single value was found to cause',
  suspect_of_unattributed_page: 'set aside as suspects of a broken page no single value was found to cause',
  no_pass_reached_it: 'no pass reached them',
  refused_or_failed: 'every probe they got was refused or failed',
  probe_not_written: 'the build wrote another value than the probe',
  normalized_by_build: 'every probe they got the build normalized, so none reached the site',
  judged_by_no_page: 'every page printed their value only cut short, so it was judged by none',
  probes_left: 'named by a finding, its other probes never tried'
}

/** Each way a value can fail write safety, in plain words, counted apart (review 7 S6). */
const FAILED_AS = {
  door_refused: 'the site refused or kept otherwise',
  markup_injected: 'a page ran as code',
  server_error: 'the site answered an error',
  site_unreachable: 'the site stopped answering',
  normalized_unsafe: 'the build wrote with their code but not their marker'
}
/** The class each (place, probe) pair ended in, in the order the line says them. */
const PAIR_AS = {
  written: 'tested on the site',
  refused_by_build: 'refused by the build',
  normalized_by_build: 'normalized by the build',
  not_written: 'the build wrote otherwise or dropped (not tested)',
  not_judged: 'judged by no page (printed only cut short)',
  ...FAILED_AS,
  unclassified: 'the build threw with a code the gate does not know'
}
const byKind = (items, key) => {
  const out = {}
  for (const i of items) out[i[key]] = (out[i[key]] ?? 0) + 1
  return out
}
const said = (counts, words) =>
  Object.keys(words)
    .filter((k) => counts[k])
    .map((k) => counts[k] + ' ' + words[k])

/** What write safety reached and found, true in every state. */
function writeSafetyLine(m) {
  const p = m.places ?? {}
  const findings = m.findings ?? []
  const untraced = findings.filter((f) => f.culprit === 'not_traced').length
  const failed = byKind(
    findings.filter((f) => f.culprit !== 'not_traced' && FAILED_AS[f.kind]),
    'kind'
  )
  const site = Object.values(failed).reduce((a, b) => a + b, 0)
  const thrown = findings.filter((f) => f.kind === 'unclassified').length
  const build = findings.filter((f) => f.kind === 'refused_by_build').length
  const could = m.coverage?.places?.couldTakeProbe
  // A place counts as tested from any one probe that reached it: every applicable (place, probe) pair is counted by
  // the class it ended in, so a pair the build wrote otherwise is never counted a result (review 7 S6).
  const known = Array.isArray(m.missing)
  const missing = known ? m.missing : []
  const short = new Set(missing.map((x) => x.place)).size
  const ledger = Array.isArray(m.ledger) ? m.ledger : null
  const pairs = ledger
    ? [
        n(ledger.length + missing.length, '(place, probe) pair applies', '(place, probe) pairs apply') +
          ': ' +
          [
            ...said(byKind(ledger, 'status'), PAIR_AS),
            ...(missing.length ? [missing.length + ' never tried, at ' + n(short, 'place', 'places')] : [])
          ].join(', ')
      ]
    : missing.length
      ? [
          n(missing.length, '(place, probe) pair', '(place, probe) pairs') +
            ' never tried, at ' +
            n(short, 'place', 'places')
        ]
      : []
  const parts = [
    (p.tested ?? 0) +
      ' of ' +
      (p.probed ?? 0) +
      ' places given a probe had at least one probe reach the site' +
      (could == null ? '' : ' (' + could + ' places could take one)'),
    ...pairs,
    n((m.passes ?? []).length, 'pass', 'passes')
  ]
  const notProbed = Object.values(m.coverage?.notProbed ?? {}).reduce((a, b) => a + b, 0)
  if (notProbed)
    parts.push(n(notProbed, 'written place', 'written places') + ' not probed (listed with the reason)')
  // An untraced stop is at least one value: its field was not named, so the count is a floor.
  const kinds = said(failed, FAILED_AS).join(', ')
  if (untraced)
    parts.push(
      'at least ' +
        n(site + untraced, 'value', 'values') +
        ' a customer could type failed (' +
        (site ? site + ' traced to a field: ' + kinds + '; ' : '') +
        n(untraced, 'stop', 'stops') +
        ' left untraced)'
    )
  else if (site) parts.push(n(site, 'value', 'values') + ' a customer could type failed: ' + kinds)
  if (thrown)
    parts.push(
      n(thrown, 'value', 'values') +
        ' the build threw in memory with a code the gate does not know, before any site saw it (the measurement cannot pass)'
    )
  if (build)
    parts.push(n(build, 'value', 'values') + ' the build refused, recorded and not tested on the site')
  const untested = m.ends?.untested ?? []
  if (untested.length) {
    const by = {}
    for (const u of untested) by[u.why] = (by[u.why] ?? 0) + 1
    parts.push(
      n(untested.length, 'place', 'places') +
        ' untested (' +
        Object.entries(by)
          .map(([k, v]) => v + ' ' + (UNTESTED[k] ?? k.replaceAll('_', ' ')))
          .join(', ') +
        ')'
    )
  }
  const parked = m.ends?.parkedTested ?? 0
  if (parked)
    parts.push(
      n(parked, 'tested place', 'tested places') +
        ' set aside in a later pass, their later probes never tried'
    )
  // A failed measurement that also stopped early says so: the counts are of what it reached, not of every place.
  if (m.status === 'failed' && m.incomplete) parts.push('the measurement then stopped: ' + whyOf(m))
  if (m.status === 'passed') parts.push('nothing a customer could type broke a page')
  return parts.join('; ')
}

const FOUND = {
  markerTest: (m) =>
    m.status === 'passed'
      ? 'every place the build writes shows the value written, and nothing else leaks.'
      : 'see the findings below.',
  demoScan: (m) =>
    m.status === 'passed'
      ? 'no demo text or picture is left after the build.'
      : 'demo text or pictures are left, or the scan is blind.',
  writeSafety: (m) => writeSafetyLine(m) + '.',
  structure: (m) =>
    [
      variantLine('all items', m.linkCheck),
      variantLine('fewest items', m.minItems),
      variantLine('pages hidden', m.hidden, true)
    ].join('; ') + '.',
  quality: (m) =>
    n(m.regressions?.length ?? 0, 'problem', 'problems') +
    ' the untouched template does not have, ' +
    n(
      m.seo?.blocking?.length ?? m.seo?.missing?.length ?? 0,
      'missing search engine item',
      'missing search engine items'
    ) +
    '; ' +
    n(m.sameAsTemplate?.length ?? 0, 'problem', 'problems') +
    ' the template has already.',
  secrets: (m) => {
    if (m.findings?.length)
      return n(m.findings.length, 'secret', 'secrets') + ' found in the files to publish or the record.'
    if (m.reason === 'unused_allow')
      return (
        'the allow file has allow entries that match nothing: ' +
        String(m.message ?? '').replace(/^[^:]*: /, '') +
        '.'
      )
    const allowed = m.allowed?.length ?? 0
    return (
      'No secret in the files to publish or in this record' +
      (m.control?.status === 'right' ? ', and the scan found the ones the original quickstart holds' : '') +
      (allowed
        ? `; ${n(allowed, "finding the kit's allow file allows", "findings the kit's allow file allows")}, listed below with its reason.`
        : '.')
    )
  }
}

const STATUS = { passed: 'Passed', failed: 'Failed', incomplete: 'Not finished', not_run: 'Not measured' }
const NAMES = {
  markerTest: 'The marker test',
  demoScan: 'The demo scan',
  writeSafety: 'Write safety',
  structure: 'Structure',
  quality: 'Template quality',
  secrets: 'Secret scan'
}
// A measurement that did not finish still says what it reached, after why: write safety its places, structure its
// variants; the others only why.
const PARTIAL = { writeSafety: true, structure: true }

/** One line per measurement: `{key, name, status, line}`. */
export function measurementLines(measurements = {}) {
  return Object.entries(NAMES).map(([key, name]) => {
    const m = measurements[key] ?? { status: 'not_run' }
    const status = STATUS[m.status] ? m.status : 'incomplete'
    const head = STATUS[status] + ': '
    let line
    if (status === 'passed' || status === 'failed') line = FOUND[key](m)
    else if (status === 'incomplete' && key === 'structure') line = FOUND.structure(m)
    else if (status === 'incomplete' && PARTIAL[key]) line = whyOf(m) + '; ' + FOUND[key](m)
    else line = whyOf(m) + '.'
    return { key, name, status, line: head + line }
  })
}

/** The parts of a verdict that failed, apart from the measurements that only did not finish: `{failed, unfinished}`. */
export function partsOf(record, names) {
  const failed = []
  const unfinished = []
  for (const k of record?.verdict?.failing ?? []) {
    const status = record?.measurements?.[k]?.status
    ;(status === 'incomplete' || status === 'not_run' ? unfinished : failed).push(names[k] ?? k)
  }
  return { failed: failed.join('; '), unfinished: unfinished.join('; ') }
}

/** What the first lines must say before any count: a write that stopped makes every count of a half-written site. */
export function headNotes(record) {
  const site = record?.write?.site
  if (!site || site.status === 'done') return []
  return [
    'The write on the site stopped (' +
      (site.code ?? site.status ?? 'stopped') +
      '): the leaks and the written values not seen come from a half-written site, not from the finished build.'
  ]
}
