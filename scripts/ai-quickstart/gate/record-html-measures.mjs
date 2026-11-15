// The measurements of the check record as the review page shows them (ticket #586), for an owner who does not read
// code: one short line per measurement, then what write safety found, the broken links of each structure variant, the
// quality regressions and missing search engine items, and the secrets by their file, place and rule, never a value.
// The one line per measurement is `record-html-lines.mjs`. Pure: the record's measurements in, HTML out.
import { measurementLines } from './record-html-lines.mjs'

const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
const n = (count, one, many) => count + ' ' + (count === 1 ? one : many)

export { measurementLines }

/** What happened to a value written as a customer could type it, in plain words. */
const KIND = {
  server_error: 'The site answered an error',
  site_unreachable: 'The site stopped answering',
  unclassified: 'It stopped with a code the gate does not know',
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

/** The written places write safety does not probe, by reason, with the universe's count beside them. */
const coverageHtml = (c) => {
  if (!c) return ''
  const counts = c.notProbed ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const head =
    (c.universeWritten ?? 'unknown') +
    ' written places in the universe, ' +
    c.locations +
    ' written by the plain build, ' +
    c.probed +
    ' probed, ' +
    total +
    ' not probed.'
  return section(
    'Written places write safety does not probe',
    '<p class="muted">' +
      esc(head) +
      '</p>' +
      table(
        ['Reason', 'Places', 'Why'],
        Object.entries(counts).map(([k, v]) => [k, v, c.why?.[k] ?? ''])
      )
  )
}

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
      'Pages hidden after the build (a link to a hidden page fails; a deleted page is measured as a hidden one)',
      table(['Page', 'Link', 'Leads to', 'Hidden'], linkRows(s.hidden?.broken))
    ) +
    section(
      'Blocks not shown at the items the variant asks for',
      table(
        ['Variant', 'Page', 'Block', 'Shown', 'Expected'],
        [
          ...(s.linkCheck?.items ?? []).map((i) => ['all items', i.page, i.block, i.items, i.expected]),
          ...(s.minItems?.items ?? []).map((i) => ['fewest items', i.page, i.block, i.items, i.expected])
        ]
      )
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
        (q.seo?.blocking ?? q.seo?.missing ?? []).map((x) => [x.page, x.item, x.detail ?? ''])
      )
    ) +
    '<p class="muted">' +
    esc(n(q.sameAsTemplate?.length ?? 0, 'problem', 'problems')) +
    ' the untouched template has too: recorded, not blocking.</p>' +
    coverageHtml(m.writeSafety?.coverage) +
    '<h2>Secrets (named, never shown)</h2>' +
    table(['File', 'Place', 'Rule', 'Fingerprint'], secrets)
  )
}
