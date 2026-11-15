// The measurements of the check record as the review page shows them (ticket #586), for an owner who does not read
// code: one short line per measurement, then what write safety found, the broken links of each structure variant, the
// quality regressions and missing search engine items, and the secrets by their file, place and rule, never a value.
// Pure: the record's measurements in, HTML out.

const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
const n = (count, one, many) => count + ' ' + (count === 1 ? one : many)

/** Why a measurement did not run or did not finish, in plain words. */
const WHY = {
  no_reset_hook: 'the run had no reset command to make the site fresh again',
  marker_test_not_written: 'the marker test did not write the site',
  marker_test_not_rendered: 'the marker test did not read the pages',
  no_page_reader: 'no browser was given to read the pages',
  time: 'it ran out of time',
  passes: 'it ran out of passes before every value reached every field',
  steps: 'it ran out of steps while looking for the field that caused a problem'
}
const why = (m) => {
  const code = m?.reason ?? m?.incomplete
  if (WHY[code]) return WHY[code]
  if (code) return String(code).replaceAll('_', ' ')
  return m?.status === 'not_run' ? 'this run did not include it' : 'it did not finish'
}

const STATUS = { passed: 'Passed', failed: 'Failed', incomplete: 'Not finished', not_run: 'Not measured' }

/** The line of each measurement: what it found when it ran, why not when it did not. */
const FOUND = {
  markerTest: (m) =>
    m.status === 'passed'
      ? 'every place the build writes shows the value written, and nothing else leaks.'
      : 'see the findings below.',
  demoScan: (m) =>
    m.status === 'passed'
      ? 'no demo text or picture is left after the build.'
      : 'demo text or pictures are left, or the scan is blind.',
  writeSafety: (m) => {
    const bad = (m.findings ?? []).filter((f) => f.kind !== 'refused_by_build').length
    const p = m.places ?? {}
    return (
      'tested ' +
      (p.tested ?? 0) +
      ' of ' +
      (p.probed ?? 0) +
      ' places the build writes, in ' +
      n((m.passes ?? []).length, 'pass', 'passes') +
      '; ' +
      (bad
        ? n(bad, 'value', 'values') + ' a customer could type broke a page or was refused.'
        : 'nothing a customer could type broke the site.')
    )
  },
  structure: (m) => {
    const broken = (m.linkCheck?.broken?.length ?? 0) + (m.minItems?.broken?.length ?? 0)
    const errors = (m.linkCheck?.errors?.length ?? 0) + (m.minItems?.errors?.length ?? 0)
    return (
      (broken || errors
        ? n(broken, 'broken link', 'broken links') + ' and ' + n(errors, 'page error', 'page errors')
        : 'every page answers and no link is broken') + ' with all items and with the fewest items.'
    )
  },
  quality: (m) =>
    n(m.regressions?.length ?? 0, 'problem', 'problems') +
    ' the untouched template does not have, ' +
    n(m.seo?.missing?.length ?? 0, 'missing search engine item', 'missing search engine items') +
    '; ' +
    n(m.sameAsTemplate?.length ?? 0, 'problem', 'problems') +
    ' the template has already.',
  secrets: (m) =>
    m.findings?.length
      ? n(m.findings.length, 'secret', 'secrets') + ' found in the files to publish.'
      : 'No secret in the files to publish' +
        (m.control?.status === 'right' ? ', and the scan found the ones the original quickstart holds.' : '.')
}

const NAMES = {
  markerTest: 'The marker test',
  demoScan: 'The demo scan',
  writeSafety: 'Write safety',
  structure: 'Structure',
  quality: 'Template quality',
  secrets: 'Secret scan'
}

/** One line per measurement: `{key, name, status, line}`. */
export function measurementLines(measurements = {}) {
  return Object.entries(NAMES).map(([key, name]) => {
    const m = measurements[key] ?? { status: 'not_run' }
    const ran = m.status === 'passed' || m.status === 'failed'
    const head = (STATUS[m.status] ?? 'Not finished') + ': '
    return { key, name, status: m.status ?? 'not_run', line: head + (ran ? FOUND[key](m) : why(m) + '.') }
  })
}

/** What happened to a value written as a customer could type it, in plain words. */
const KIND = {
  server_error: 'The site answered an error',
  door_refused: 'The site refused it',
  markup_injected: 'The page ran it as code',
  refused_by_build: 'The build refused it (recorded only)'
}

const table = (head, rows) =>
  rows.length
    ? '<table><thead><tr>' +
      head.map((h) => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + r.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>'
    : '<p class="muted">None.</p>'
const section = (title, body) => '<h3>' + esc(title) + '</h3>' + body

const linkRows = (links) =>
  (links ?? []).map((l) => [l.page, l.href, l.target ?? '', (l.hidden ?? []).join(', ')])

/** The measurement details: write safety findings, broken links by variant, quality, secrets. */
export function measurementsHtml(measurements = {}) {
  const m = measurements
  const lines = measurementLines(m)
    .map((l) => '<div><span>' + esc(l.name) + '</span><span>' + esc(l.line) + '</span></div>')
    .join('')
  const findings = (m.writeSafety?.findings ?? []).map((f) => [
    f.page,
    f.storeBlock ?? f.block,
    f.field,
    f.probe,
    KIND[f.kind] ?? f.kind
  ])
  const s = m.structure ?? {}
  const q = m.quality ?? {}
  const secrets = (m.secrets?.findings ?? []).map((f) => [f.file, f.at, f.rule, f.fingerprint])
  return (
    '<div class="reasons">' +
    lines +
    '</div>' +
    '<h2>Write safety: what a customer could type</h2>' +
    table(['Page', 'Block', 'Field', 'Value tried', 'What happened'], findings) +
    '<h2>Broken links</h2>' +
    section('All items', table(['Page', 'Link', 'Leads to', ''], linkRows(s.linkCheck?.broken))) +
    section('Fewest items', table(['Page', 'Link', 'Leads to', ''], linkRows(s.minItems?.broken))) +
    section(
      'Pages hidden after the build (recorded only)',
      table(['Page', 'Link', 'Leads to', 'Hidden'], linkRows(s.hidden?.recorded))
    ) +
    '<h2>Template quality</h2>' +
    section(
      'Worse than the untouched template',
      table(
        ['Check', 'Page', 'Width', 'Where', 'What'],
        (q.regressions ?? []).map((r) => [r.group, r.page, r.width ?? '', r.selector ?? '', r.reason])
      )
    ) +
    section(
      'Missing search engine items',
      table(
        ['Page', 'Item', 'Detail'],
        (q.seo?.missing ?? []).map((x) => [x.page, x.item, x.detail ?? ''])
      )
    ) +
    '<p class="muted">' +
    esc(n(q.sameAsTemplate?.length ?? 0, 'problem', 'problems')) +
    ' the untouched template has too: recorded, not blocking.</p>' +
    '<h2>Secrets (named, never shown)</h2>' +
    table(['File', 'Place', 'Rule', 'Fingerprint'], secrets)
  )
}
