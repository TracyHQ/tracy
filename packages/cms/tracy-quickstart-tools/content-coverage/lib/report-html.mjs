// Self-contained report.html: summary, then each page with annotated screenshots and its hole list.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CSS } from './report-style.mjs'
import { coverage } from './items.mjs'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 3) + '...' : String(s))
const CLASS_NAME = {
  a: 'a · capture hole (in DB, not in map)',
  b: 'b · template hole (hard-coded in template files)',
  c: 'c · core / language string (acceptable)',
  d: 'd · source not found (investigate)'
}

function countsRow(label, c) {
  return `<tr><td>${label}</td><td class=n>${c.total}</td><td class="n ok">${c.matched}</td><td class=n>${c.locked}</td>${['a', 'b', 'c', 'd'].map((k) => `<td class=n>${c[k]}${k === 'a' && c.a ? ` <span class=muted>(${c.aLocked} locked / ${c.aUndeclared} undeclared)</span>` : ''}</td>`).join('')}<td class=n><b>${coverage(c)}%</b></td><td class="n muted">${c.ignored}</td></tr>`
}
const countsTable = (
  counts
) => `<table><tr><th></th><th class=n>items</th><th class=n>matched</th><th class=n>locked</th><th class=n>a</th><th class=n>b</th><th class=n>c</th><th class=n>d</th><th class=n>coverage</th><th class=n>ignored</th></tr>
${countsRow('Text (blocks, attributes, meta)', counts.text)}${countsRow('Images', counts.images)}${countsRow('Links (external / buttons)', counts.links)}</table>`

function overlay(page, vp, holeNo) {
  const shot = page.shots[vp]
  const W = shot.width || (vp === 'phone' ? 390 : 1440)
  const H = shot.height
  const fs = Math.round(W / 45)
  const parts = []
  for (const it of page.items) {
    const v = it.viewports[vp]
    if (!v?.visible || !v.rect || v.rect.y > H || it.status === 'ignored') continue
    const { x, y, w, h } = v.rect
    const hole = it.status === 'hole' && it.class !== 'c'
    const color = it.status === 'matched' ? '#1f8a4c' : hole ? '#e53935' : '#9e9e9e'
    const dash = hole || it.status === 'matched' ? '' : ` stroke-dasharray="${fs / 3}"`
    parts.push(
      `<rect x="${x}" y="${y}" width="${Math.max(w, 4)}" height="${Math.max(h, 4)}" fill="${hole ? 'rgba(229,57,53,.12)' : 'none'}" stroke="${color}" stroke-width="${hole ? fs / 7 : fs / 10}"${dash}/>`
    )
    if (hole && holeNo.has(it)) {
      const n = holeNo.get(it)
      parts.push(
        `<rect x="${x}" y="${Math.max(0, y - fs)}" width="${fs * (String(n).length * 0.7 + 0.6)}" height="${fs}" fill="#e53935"/><text x="${x + fs * 0.3}" y="${Math.max(0, y - fs) + fs * 0.82}" font-size="${fs * 0.85}" font-family="sans-serif" font-weight="700" fill="#fff">${n}</text>`
      )
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${parts.join('')}</svg>`
}

/** Page hygiene, whole site: each problem once, with every page it was seen on (a customer must never see these). */
function hygieneCard(pages) {
  const by = new Map()
  for (const p of pages)
    for (const f of p.hygiene ?? []) {
      const k = `${f.kind}|${f.value}`
      const g = by.get(k) ?? { ...f, at: [] }
      g.at.push(p)
      by.set(k, g)
    }
  if (!by.size)
    return '<div class=card><b>Page hygiene</b> <span class=ok>nothing a customer must never see</span></div>'
  const rows = [...by.values()]
    .map(
      (g) =>
        `<tr><td><span class="chip c-a">${esc(g.kind)}</span></td><td>${esc(cut(g.value, 160))}${g.token ? ` <span class=muted>(${esc(g.token)})</span>` : ''}</td><td>${esc(g.where)}${g.visible ? '' : ' <span class=muted>hidden here</span>'}</td><td>${g.at
          .slice(0, 4)
          .map((p) => `<a href="#p${p.n}">#${p.n}</a>`)
          .join(' ')}${g.at.length > 4 ? ` +${g.at.length - 4}` : ''}</td></tr>`
    )
    .join('')
  return `<div class=card><b class=bad>Page hygiene: ${by.size} problem${by.size === 1 ? '' : 's'} a customer must never see</b> <span class=muted>(raw language constants, PHP errors, unfilled placeholders; they hold Publish like holes)</span><table><tr><th>kind</th><th>what</th><th>where</th><th>pages</th></tr>${rows}</table></div>`
}

function holeList(page, holes) {
  const main = holes.filter((h) => h.class !== 'c')
  const core = holes.filter((h) => h.class === 'c')
  const li = (it) => {
    const vis = Object.entries(it.viewports)
      .map(([vp, v]) => `${vp}${v.visible ? '' : ' (hidden)'}`)
      .join(', ')
    const what =
      it.kind === 'image'
        ? `image <code>${esc(it.path ?? it.value)}</code> <span class=muted>[${esc(it.source)}]</span>`
        : it.kind === 'link'
          ? `link <code>${esc(cut(it.value, 120))}</code>${it.text ? ` "${esc(cut(it.text, 60))}"` : ''}`
          : `${it.kind === 'text' ? `&lt;${esc(it.tag)}&gt;` : esc(it.kind + ':' + it.attr)} "${esc(cut(it.remainder ?? it.value, 200))}"${it.remainder ? ' <span class=muted>(unmatched part of a block that also holds slots)</span>' : ''}`
    return `<li value="${it._n}"><span class="chip c-${it.class}">${it.class}</span> ${what}<br><span class=muted>${esc(it.classLabel)}${it.evidence?.length ? ': ' : ''}</span><code>${esc(cut((it.evidence ?? []).join(' | '), 260))}</code><br><code title="${esc(Object.values(it.viewports)[0]?.selector)}">${esc(vis)}</code></li>`
  }
  return `<ol class=holes>${main.map(li).join('')}</ol>${core.length ? `<details><summary class=muted>${core.length} core / language strings (c)</summary><ol class=holes>${core.map(li).join('')}</ol></details>` : ''}`
}

export async function buildReport({ result, outDir, shrinker, meta, budgetBytes = 9_000_000 }) {
  const { pages, summary } = result
  const shotCount = pages.reduce((n, p) => n + Object.keys(p.shots).length, 0) || 1
  const perShot = (budgetBytes * 0.75) / shotCount // base64 costs 4/3
  const ladder = [
    [760, 0.55],
    [640, 0.45],
    [560, 0.38],
    [480, 0.32],
    [400, 0.26],
    [320, 0.22]
  ]
  async function embed(file, vp) {
    const raw = readFileSync(join(outDir, file))
    let out
    for (const [w, q] of ladder) {
      out = await shrinker.shrink(raw, vp === 'phone' ? Math.round(w * 0.45) : w, q)
      if (out.length <= perShot) break
    }
    return 'data:image/jpeg;base64,' + out.toString('base64')
  }
  const sections = []
  for (const p of pages) {
    const holes = p.items
      .filter((i) => i.status === 'hole')
      .sort(
        (a, b) =>
          (a.class === 'c') - (b.class === 'c') ||
          b.visibleAnywhere - a.visibleAnywhere ||
          (Object.values(a.viewports)[0]?.rect?.y ?? 1e9) - (Object.values(b.viewports)[0]?.rect?.y ?? 1e9)
      )
    const holeNo = new Map()
    holes.forEach((h, i) => {
      h._n = i + 1
      holeNo.set(h, i + 1)
    })
    const shotHtml = async (vp) =>
      p.shots[vp]
        ? `<div class="shot ${vp}"><img loading=lazy src="${await embed(p.shots[vp].file, vp)}" alt="${vp} screenshot">${overlay(p, vp, holeNo)}</div>${p.shots[vp].truncated ? '<div class=muted>screenshot cut at 16000 px</div>' : ''}`
        : '<div class=muted>no screenshot</div>'
    const c = p.counts
    const bad =
      c.text.a +
      c.text.b +
      c.text.d +
      c.images.a +
      c.images.b +
      c.images.d +
      c.links.a +
      c.links.b +
      c.links.d
    const where = p.unmapped
      ? `<span class="chip c-a">not in map</span>${p.rendersEntity ? ` <span class=muted>renders ${esc(p.rendersEntity.entity)} (${esc(p.rendersEntity.via)})</span>` : ''}`
      : p.mapPages.map((m) => `<span class=chip>${esc(m.entity)} /${esc(m.route)}</span>`).join(' ')
    sections.push(`<details class=page id="p${p.n}"${bad ? ' open' : ''}><summary><b>#${p.n}</b> <a href="${esc(p.url)}">${esc(cut(new URL(p.url).pathname + new URL(p.url).search, 90))}</a> ${where}
<span class=muted>text ${c.text.matched}/${c.text.total} · images ${c.images.matched}/${c.images.total}</span> <span class="${bad ? 'bad' : 'ok'}">${bad} holes</span></summary>
<div class=pbody><div class=split><div>${await shotHtml('desktop')}</div><div><div class=muted>${esc(p.title)}</div>${holeList(p, holes)}
<details><summary>Phone 390 px</summary>${await shotHtml('phone')}</details></div></div></div></details>`)
  }
  const s = summary
  const unmapped = pages.filter((p) => p.unmapped)
  return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Content coverage audit</title><style>${CSS}</style></head><body><main>
<h1>Content coverage audit · ${esc(meta.contractId)}</h1><div class=muted>${esc(meta.site)} · ${esc(meta.generatedAt)} · viewports ${esc(meta.viewports.join(', '))}</div>
<div class="kpis card"><div class=kpi><span class=muted>Pages audited</span><b>${s.pages}</b>${s.mappedPages} in map · ${s.unmappedPages} not in map</div>
<div class=kpi><span class=muted>Text coverage</span><b>${s.coverage.text}%</b>${s.uniqueItems.text.matched} of ${s.uniqueItems.text.total} distinct</div>
<div class=kpi><span class=muted>Image coverage</span><b>${s.coverage.images}%</b>${s.uniqueItems.images.matched} of ${s.uniqueItems.images.total} distinct</div>
<div class=kpi><span class=muted>Holes needing a slot (a+b+d)</span><b class=bad>${['text', 'images', 'links'].reduce((n, k) => n + s.uniqueItems[k].a + s.uniqueItems[k].b + s.uniqueItems[k].d, 0)}</b>distinct values</div></div>
<div class=card><b>Distinct items, whole site</b> <span class=muted>(each value counted once; coverage = matched / (matched + a + b + d))</span>${countsTable(s.uniqueItems)}
<p class=muted>${Object.entries(CLASS_NAME)
    .map(([k, v]) => `<span class="chip c-${k}">${k}</span> ${esc(v.slice(4))}`)
    .join(
      ' &nbsp; '
    )} · locked = design asset pinned by presentation-lock (outside images/) · ignored = no words, or an internal link generated from an entity route.</p>
<p class="legend muted"><span class=box-ok>■ green box: matched a slot</span><span class=box-bad>■ red box (numbered): hole a/b/d</span><span>▭ grey dashed: locked or core</span></p></div>
${s.byCause ? `<div class=card><b>Holes by root cause</b> <span class=muted>(distinct values)</span><table><tr><th>class</th><th>cause</th><th class=n>values</th><th>examples</th></tr>${s.byCause.map((g) => `<tr><td><span class="chip c-${g.class}">${g.class}</span></td><td>${esc(g.cause)}</td><td class=n>${g.count}</td><td>${g.examples.map((e) => `"${esc(cut(e.value, 60))}"`).join('<br>')}</td></tr>`).join('')}</table></div>` : ''}
${hygieneCard(pages)}
${unmapped.length ? `<div class=card><b>Public pages not declared in content-map pages (${unmapped.length})</b><ul>${unmapped.map((p) => `<li><a href="#p${p.n}">${esc(p.url)}</a>${p.rendersEntity ? ` <span class=muted>renders ${esc(p.rendersEntity.entity)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
${result.failures.length ? `<div class=card><b>Pages that failed to render (${result.failures.length})</b><ul>${result.failures.map((f) => `<li>${esc(f.url)} ${esc(f.mapPage ?? '')} status ${esc(f.status)} ${esc(f.error ?? '')}</li>`).join('')}</ul></div>` : ''}
${result.duplicates?.length ? `<div class="card muted">${result.duplicates.length} crawled URLs were the SEF address of a map page already audited (same item-N/view on body) and were skipped.</div>` : ''}
${result.skipped.length ? `<div class=card><b>Map pages not rendered on purpose (${result.skipped.length})</b><ul>${result.skipped.map((f) => `<li>${esc(f.entity)} /${esc(f.route)}: ${esc(f.reason)}</li>`).join('')}</ul></div>` : ''}
${result.capReached ? '<div class="card bad">Page cap reached: some crawled pages were not audited.</div>' : ''}
<h2>Pages</h2>${sections.join('\n')}
</main></body></html>`
}
