// The viewer page: summary + filters on top, one block per component, then the slots not located / not shown.
import { levelOf } from './crops.mjs'
import { roleMeaning } from './role-meanings.mjs'
import { CSS, SCRIPT } from './page-assets.mjs'

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
const plain = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>|\(\(\/?[a-z][^()]*\)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const cut = (s, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s)
const fileOf = (s) =>
  String(s ?? '')
    .split('#')[0]
    .split('?')[0]
    .trim()
    .replace(/^\/+/, '')
const box = (b) => (b ? `${Math.round(b.width)}×${Math.round(b.height)}` : '?')

function sampleCell(slot, site) {
  if (slot.type === 'image') {
    const f = fileOf(slot.sample)
    const src = /^https?:/.test(f) ? f : site + f
    return `<a href="${esc(src)}" class="zoom"><img class="thumb" loading="lazy" src="${esc(src)}" alt=""></a><div class="mono small">${esc(cut(f.split('/').pop(), 40))}</div>`
  }
  return `<span class="${slot.type === 'url' ? 'mono small' : ''}">${esc(cut(plain(slot.sample)))}</span>`
}

function fitCell(fit) {
  if (!fit) return '<span class="muted">no fit</span>'
  const parts = []
  if (fit.kind) parts.push(`<b>${esc(fit.kind)}</b>`)
  if (fit.replace)
    parts.push(fit.replace === 'keep' ? '<span class="keep">keep</span>' : `replace (${esc(fit.replace)})`)
  if (typeof fit.transparent === 'boolean')
    parts.push(fit.transparent ? 'transparent background' : 'solid background')
  if (fit.measured === false) parts.push('<span class="muted">not measured</span>')
  return parts.join('<br>') || '<span class="muted">text</span>'
}

function sizeCell(fit) {
  if (!fit?.boxes) return '<span class="muted">none</span>'
  const mc = fit.maxChars
    ? `<br>max ${fit.maxChars.desktop ?? '?'} / ${fit.maxChars.phone ?? '?'} characters`
    : ''
  return `${box(fit.boxes.desktop)} / ${box(fit.boxes.phone)}${mc}`
}

function row(r, ctx, page) {
  const s = r.slot
  const fact = ctx.isFactRole(s.role)
  const lv = levelOf(r.flags)
  const g = s.group
    ? `${esc(s.group.id)} #${esc(s.group.item)}<br><span class="muted">${esc(s.group.kind)}</span>`
    : '<span class="muted">none</span>'
  const search = [s.key, s.label, plain(s.sample), s.role, s.fit?.kind].join(' ').toLowerCase()
  const note =
    r.by && !/^(exact|path|href)$/.test(r.by) ? `<div class="muted small">matched by: ${esc(r.by)}</div>` : ''
  const why = r.flags.map((f) => `<div class="why ${f.level}">${esc(f.reason)}</div>`).join('')
  const reason = r.reason ? `<div class="muted small">${esc(r.reason)}</div>` : ''
  return `<tr class="lv-${lv}" data-page="${page ?? ''}" data-flag="${r.flags.length ? 1 : 0}" data-type="${s.type}" data-fact="${fact ? 1 : 0}" data-q="${esc(search)}">
<td class="num"><span class="n ${lv}">${r.n ?? ''}</span></td>
<td class="cell-key"><div class="mono key">${esc(s.key)}</div><div class="small">${esc(s.label)}</div>${note}${reason}${why}</td>
<td class="sample">${sampleCell(s, ctx.site)}</td>
<td class="cell-role"><div class="mono small">${esc(s.role ?? 'unassigned')}</div><div class="small muted">${esc(roleMeaning(s.role))}</div></td>
<td><span class="pill ${fact ? 'fact' : 'edit'}">${s.role ? (fact ? 'Fact' : 'Editorial') : 'Unassigned'}</span></td>
<td class="small">${g}</td>
<td class="small cell-fit">${fitCell(s.fit)}</td>
<td class="small cell-size">${sizeCell(s.fit)}</td></tr>`
}

const HEAD = `<thead><tr><th>No.</th><th>Slot</th><th>Sample</th><th>Role</th><th>Kind</th><th>Group</th><th>Fit</th><th>Box desktop / phone</th></tr></thead>`

function block(c, ctx) {
  const p = ctx.pageOf(c.page)
  const flagged = c.rows.filter((r) => r.flags.length).length
  const imgs = ['desktop', 'phone']
    .filter((vp) => c.images?.[vp])
    .map(
      (vp) =>
        `<figure class="${vp}"><a href="${c.images[vp]}" class="zoom"><img loading="lazy" src="${c.images[vp]}" alt="${esc(c.entity)} ${vp}"></a><figcaption>${vp === 'desktop' ? 'Desktop 1440' : 'Phone 390'}</figcaption></figure>`
    )
    .join('')
  return `<section class="comp" data-page="${c.page}" id="${esc(c.id)}">
<header><h2><span class="mono">${esc(c.entity)}</span> ${flagged ? `<span class="badge red">${flagged} suspicious</span>` : ''}</h2>
<div class="muted small">Page ${esc(p.label)}${c.home ? '' : ' (the rest of this component shows on another page)'} · ${c.rows.length} slots</div></header>
<div class="grid"><div class="shots">${imgs || '<div class="muted">No crop (the area lies outside the page screenshot)</div>'}</div>
<div class="tablewrap"><table>${HEAD}<tbody>${c.rows.map((r) => row(r, ctx, c.page)).join('')}</tbody></table></div></div></section>`
}

export function buildHtml({ model, label, site, generatedAt, isFactRole }) {
  const pageOf = (n) => {
    const p = model.pages.find((x) => x.n === n)
    const path = p ? new URL(p.url).pathname + new URL(p.url).search : ''
    return { label: `${n}: ${p?.title ?? ''} (${path})` }
  }
  const ctx = { site, isFactRole, pageOf }
  const usedPages = [...new Set(model.components.map((c) => c.page))]
  const k = model.counts
  const every = [...model.components.flatMap((c) => c.rows), ...model.notLocated, ...model.notShown]
  const RULES = {
    1: 'face picture with the wrong role',
    2: 'figure filed as editorial',
    3: 'fact kept as is',
    4: 'not measured but shown'
  }
  const perRule = Object.entries(RULES)
    .map(
      ([id, name]) =>
        `${name}: <b>${every.filter((r) => r.flags.some((f) => f.rule === Number(id))).length}</b>`
    )
    .join(' · ')
  const tableOf = (rows) =>
    `<div class="tablewrap"><table>${HEAD}<tbody>${rows.map((r) => row(r, ctx, '')).join('')}</tbody></table></div>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Content map verification ${esc(label)}</title><style>${CSS}</style></head><body>
<div class="top"><div class="wrap">
<h1>Content map verification, contract ${esc(label)}</h1>
<div class="muted small">Template site ${esc(site)} · captured ${esc(generatedAt)}</div>
<div class="stats"><div><b>${k.components}</b>components</div><div><b>${k.located}</b>slots located on a page</div><div><b>${k.notLocated}</b>slots not located</div><div><b>${k.notShown}</b>slots not shown on any page</div><div class="warn"><b>${k.suspicious}</b>suspicious slots</div></div>
<div class="small muted rules">By rule: ${perRule}</div>
</div></div><div class="bar"><div class="wrap filters"><select id="fPage"><option value="">Every page</option>${usedPages.map((n) => `<option value="${n}">${esc(pageOf(n).label)}</option>`).join('')}</select>
<label><input type="checkbox" id="fFlag"> Only suspicious slots</label><label><input type="checkbox" id="fImg"> Only pictures</label><label><input type="checkbox" id="fFact"> Only Fact</label>
<input type="search" id="fQ" placeholder="Search key, label, sample, role"><span id="shown" class="muted small"></span></div></div>
<div class="wrap"><details class="legend small"><summary>How to read this page and the marking rules</summary><p>Each block is one component (a module or an article) on a page. On the left is a real screenshot where every content map slot is outlined and numbered; the numbers match the No. column on the right. Blue outlines are normal, <span class="why red">red</span> and <span class="why amber">amber</span> are suspicious.</p>
<p>The tool marks by four rules only, a person judges the rest:</p><ol><li><b>Red:</b> a picture whose fit kind is avatar, avatar-group or signature but whose role is not person.* or quote.*</li><li><b>Red:</b> text that looks like a real figure (a number with k, +, %, a year or a price) but whose role is editorial.*</li><li><b>Amber:</b> a Fact role whose fit says keep</li><li><b>Amber:</b> fit says not measured (measured false) but the slot is shown on the page</li></ol>
<p>Fact = the slot must come from the real business data. Editorial = text or picture of the template, free to rewrite. Box = the measured size of the slot on desktop / phone.</p></details></div>
<main class="wrap">${model.components.map((c) => block(c, ctx)).join('')}
<section class="comp extra" data-page="" id="not-located"><header><h2>Not located on a page (${model.notLocated.length})</h2><div class="muted small">No visible element could be matched to this slot; the reason is written under the slot name. A position is never guessed.</div></header>${tableOf(model.notLocated)}</section>
<details class="comp extra" data-page="" id="not-shown"><summary><h2>Not shown on any page, fit not measured (${model.notShown.length})</h2></summary>${tableOf(model.notShown)}</details>
</main><div id="lb" hidden><img alt=""></div><script>${SCRIPT}</script></body></html>`
}
