// The check record as a page the owner reads (ticket #585, product decision 6): the verdict, the accounting of the
// universe, the write step gaps, every leak with its page, place and source, what the build wrote that no page shows,
// the demo scan and its checks, and the screenshots (paths relative to the record). Pure: the record in, HTML out.

const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
const sourceText = (s) =>
  !s ? 'not found' : [s.kind, s.file, s.key, s.table, s.host].filter(Boolean).join(' · ')
const table = (head, rows) =>
  rows.length
    ? `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`
    : '<p class="muted">None.</p>'

const STYLE = `
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--line:#e7e5e4;--card:#fff;--bad:#b91c1c;--ok:#15803d}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--line:#44403c;--card:#292524;--bad:#f87171;--ok:#4ade80}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
.muted{color:var(--muted)}.bad{color:var(--bad)}.ok{color:var(--ok)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.tile b{display:block;font-size:22px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--card)}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;font-size:13px}
td{max-width:420px;overflow-wrap:anywhere}details{margin:8px 0}summary{cursor:pointer}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.shots img{width:100%;height:220px;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:6px}`

/** @param {object} record a `tracy-ai-quickstart-check-record/v1` document */
export function recordHtml(record) {
  const v = record.verdict
  const u = record.universe
  const m = record.markerTest
  const tile = (label, value, cls = '') =>
    `<div class="tile"><span class="muted">${esc(label)}</span><b class="${cls}">${esc(value)}</b></div>`
  const groups = Object.entries(m.byGroup)
    .map(([g, n]) => {
      const rows = m.findings
        .filter((f) => f.group === g)
        .map((f) => [
          f.page,
          f.place?.element,
          f.rest ?? f.value,
          f.visible ? 'seen' : 'hidden',
          sourceText(f.source) + (f.why ? ` (${f.why})` : ''),
          f.where.join(', ')
        ])
      return `<details${n ? ' open' : ''}><summary><b>${esc(g)}</b> ${n}</summary>${table(['Page', 'Place', 'Value', 'Seen', 'Source', 'Where'], rows)}</details>`
    })
    .join('')
  const notSeen = Object.entries(m.notSeenByReason)
    .map(([reason, n]) => {
      const rows = m.notSeen
        .filter((x) => x.reason === reason)
        .map((x) => [
          x.code ?? x.picture,
          x.entry,
          x.op,
          x.module ?? '',
          x.loc ? [x.loc.slot ?? x.loc.entity, (x.loc.jsonPath ?? []).join('/')].join(' ') : ''
        ])
      return `<details><summary><b>${esc(reason)}</b> ${n}</summary>${table(['Marker', 'Plan entry', 'Operation', 'Module', 'Place'], rows)}</details>`
    })
    .join('')
  const w = record.write
  const c = record.demoScan.checks
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Check record</title><style>${STYLE}</style></head><body><main>
<h1>Check record: ${esc(record.template?.slug)} ${esc(record.template?.version)}</h1>
<p class="muted">${esc(record.kit)} · plugin ${esc(record.plugin?.start)} to ${esc(record.plugin?.end)} · ${esc(record.finishedAt)}</p>
<p class="${v.pass ? 'ok' : 'bad'}"><b>${v.pass ? 'Pass' : 'Not passed'}</b>: ${v.leaks} leaks, ${v.demoFindings} demo findings, ${v.unexplained} unexplained places.</p>
<div class="tiles">${tile('Places declared', u.universe)}${tile('Written', u.written)}${tile('Declared not written', u.declared_not_written)}${tile('Skipped by the write step', u.skipped_by_writer)}${tile('Unexplained', u.unexplained, u.unexplained ? 'bad' : 'ok')}${tile('Renders', record.render.renders)}${tile('Markers seen', m.codesSeen)}${tile('Written, not seen', m.notSeen.length, m.notSeen.length ? 'bad' : 'ok')}</div>
<h2>Write</h2><p>Memory site: ${esc(w.memory.status)} · real site: ${esc(w.site?.status ?? 'not run')} ${esc(w.site?.code ?? '')}</p>
<details><summary>Write step gaps ${w.gaps.length}</summary>${table(
    ['Code', 'Cause', 'Record', 'Blocks taken out'],
    w.gaps.map((g) => [g.code, g.cause, g.record, g.blocks.join(', ')])
  )}</details>
<details><summary>Refusals of the real plugin the memory site lacks ${w.measuredRefusals.length}</summary>${table(
    ['Code', 'Door', 'Message', 'Why'],
    w.measuredRefusals.map((r) => [r.code, r.door, r.message, r.why])
  )}</details>
<h2>Leaks</h2>${groups}
<h2>Written, not seen</h2>${notSeen || '<p class="muted">None.</p>'}
<h2>Demo scan</h2>${table(
    ['Kind', 'Page', 'Place', 'Excerpt'],
    record.demoScan.findings.map((f) => [f.kind, f.page, f.place?.element, f.excerpt])
  )}
<details><summary>Interface words the demo scan lets through ${c.interfaceLetThrough.length}</summary>${table(
    ['Value', 'Page', 'Source'],
    c.interfaceLetThrough.map((x) => [x.value, x.page, sourceText(x.source)])
  )}</details>
<details><summary>Raw HTML against the browser: ${c.htmlVersusBrowser.blockDiffers.length} of ${c.htmlVersusBrowser.blocks} blocks read differently</summary>${table(
    ['Page', 'Side', 'Block (browser)'],
    c.htmlVersusBrowser.blockDiffers.map((d) => [d.page, `${d.theme} ${d.width}`, d.value])
  )}</details>
<details><summary>Pictures under cache or resized paths ${c.pictureAddresses.length}</summary>${table(
    ['Page', 'Address', 'Demo file name', 'Caught'],
    c.pictureAddresses.map((p) => [p.page, p.value, p.demoName, p.caught])
  )}</details>
<h2>Screenshots</h2><div class="shots">${record.render.shots.map((s) => `<a href="${esc(s.file)}"><img src="${esc(s.file)}" alt="${esc(`${s.page} ${s.theme} ${s.width}`)}" loading="lazy"></a>`).join('')}</div>
<h2>Not run</h2><p class="muted">Minimum items and the link check: ticket 586.</p>
</main></body></html>`
}
