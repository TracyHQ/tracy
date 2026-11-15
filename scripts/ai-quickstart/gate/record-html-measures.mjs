// The measurements of the check record as the review page shows them (ticket #586), for an owner who does not read
// code: one short line per measurement, then what write safety found, the broken links of each structure variant, the
// quality regressions and missing search engine items, and the secrets by their file, place and rule, never a value.
// The one line per measurement is `record-html-lines.mjs`. Pure: the record's measurements in, HTML out.
import { measurementLines, whyOf } from './record-html-lines.mjs'

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

const table = (head, rows, empty = 'None.') =>
  rows.length
    ? '<table><thead><tr>' +
      head.map((h) => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + r.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>'
    : '<p class="muted">' + esc(empty) + '</p>'

/** What an empty table means: nothing ran (and why), or it ran and found nothing. */
const emptyOf = (m, found) =>
  m?.status === 'passed' || m?.status === 'failed' ? 'Measured: ' + found : 'Not measured: ' + whyOf(m) + '.'
const section = (title, body) => '<h3>' + esc(title) + '</h3>' + body

/** How the places counted written, the plain build's locations and the probes add up, then the reasons. */
const coverageHtml = (c) => {
  if (!c) return ''
  const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0)
  const p = c.places ?? {}
  const lines = [
    (c.universeWritten ?? 'unknown') +
      ' places the universe counts written = ' +
      (c.inBoth ?? 'unknown') +
      ' also in the plain build + ' +
      (c.onlyInUniverse ?? 'unknown') +
      ' only in the universe',
    c.locations +
      ' locations the plain build writes = ' +
      (c.inBoth ?? 'unknown') +
      ' in both + ' +
      sum(c.onlyInPlan) +
      ' only in the plain build (' +
      Object.entries(c.onlyInPlan ?? {})
        .map(([k, v]) => v + ' ' + k)
        .join(', ') +
      ')',
    c.locations + ' = ' + c.probed + ' could take a probe + ' + sum(c.notProbed) + ' not probed',
    (p.couldTakeProbe ?? 'unknown') +
      ' places could take a probe: ' +
      (p.inFinishedPass ?? 'unknown') +
      ' in a pass that finished, ' +
      (p.tested ?? 0) +
      ' reached the site'
  ]
  return section(
    'What write safety covers of what the build writes',
    lines.map((l) => '<p class="muted">' + esc(l) + '.</p>').join('') +
      table(
        ['Reason', 'Locations', 'Why'],
        Object.entries(c.notProbed ?? {}).map(([k, v]) => [k, v, c.why?.[k] ?? ''])
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
  const links = (v) =>
    table(['Page', 'Link', 'Leads to', 'Hidden'], linkRows(v?.broken), emptyOf(v, 'no broken link.'))
  const shape =
    s.linkCheck?.status === 'passed' || s.linkCheck?.status === 'failed' ? s.linkCheck : s.minItems
  const halfWritten = q.status === 'incomplete' && q.reason === 'write_stopped'
  const same = q.seo?.same?.length ?? 0
  return (
    '<div class="reasons">' +
    lines +
    '</div>' +
    '<h2>Write safety: what a customer could type</h2>' +
    table(
      ['Page', 'Block', 'Field', 'Value tried', 'What happened'],
      findings,
      emptyOf(m.writeSafety, 'no value a customer could type broke a page or was refused.')
    ) +
    '<h2>Broken links</h2>' +
    section('All items', links(s.linkCheck)) +
    section('Fewest items', links(s.minItems)) +
    section(
      'Pages hidden after the build (a link to a hidden page fails; a deleted page is measured as a hidden one)',
      links(s.hidden)
    ) +
    section(
      'Blocks not shown at the items the variant asks for',
      table(
        ['Variant', 'Page', 'Block', 'Shown', 'Expected'],
        [
          ...(s.linkCheck?.items ?? []).map((i) => ['all items', i.page, i.block, i.items, i.expected]),
          ...(s.minItems?.items ?? []).map((i) => ['fewest items', i.page, i.block, i.items, i.expected])
        ],
        emptyOf(shape, 'every block shows the items its variant asks for.')
      )
    ) +
    '<h2>Template quality</h2>' +
    (halfWritten
      ? '<p class="muted">' +
        esc(
          'Not counted: the build did not finish writing the site (' +
            (q.write?.code ?? q.write?.status ?? 'stopped') +
            '), so what its pages show says nothing about the template.'
        ) +
        '</p>'
      : section(
          'Worse than the untouched template',
          table(
            ['Check', 'Page', 'Width', 'Where', 'What'],
            (q.regressions ?? []).map((r) => [r.group, r.page, r.width ?? '', r.selector ?? '', r.reason]),
            emptyOf(q, 'no page is worse than the untouched template.')
          )
        ) +
        section(
          'Missing search engine items',
          table(
            ['Page', 'Item', 'Detail'],
            (q.seo?.blocking ?? q.seo?.missing ?? []).map((x) => [x.page, x.item, x.detail ?? '']),
            emptyOf(q, 'no page the build writes misses a search engine item.')
          )
        ) +
        '<p class="muted">' +
        esc(n(q.sameAsTemplate?.length ?? 0, 'problem', 'problems')) +
        ' the untouched template has too, and ' +
        esc(n(same, 'search engine item', 'search engine items')) +
        ' the untouched template is missing too (its own system pages): recorded, not blocking.</p>') +
    coverageHtml(m.writeSafety?.coverage) +
    '<h2>Secrets (named, never shown)</h2>' +
    table(['File', 'Place', 'Rule', 'Fingerprint'], secrets, emptyOf(m.secrets, 'no secret found.'))
  )
}
