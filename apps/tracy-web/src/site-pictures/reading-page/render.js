// Renders the picture reading page's model (model.js) as one HTML string: a script only for the click-to-enlarge.
// Every value from a plan, a manifest or a brief goes through esc(). Pictures arrive as { src, width, height } (src a
// path relative to the page) or null when the file is not there, which the page shows as missing and never hides.
import { escapeHtml } from '../../lib/html.js'
import { aroundHtml } from './around-render.js'
import { CSS, WHERE_JS, ZOOM_JS } from './styles.js'
import { surfaceHtml, whereHtml } from './where-render.js'

const esc = (v) => escapeHtml(v ?? '')

const slug = (id) => `g-${String(id).replace(/[^a-zA-Z0-9]+/g, '-')}`
const money = (n) => (typeof n === 'number' ? `$${n.toFixed(4)}` : 'not recorded')
const seconds = (ms) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)} s` : 'not recorded')
const list = (v) => (Array.isArray(v) ? v.join(', ') : v)

const img = (pic, alt) =>
  `<button type="button" class="zoom" title="Click to enlarge"><img src="${esc(pic.src)}" alt="${esc(alt)}" loading="lazy"${pic.width ? ` width="${pic.width}"` : ''}></button>`
const gone = (what, bad = false) => `<div class="gone${bad ? ' bad' : ''}">${what}</div>`

// The owner's original with the cut area drawn as a box (the manifest crop, in pixels of the original).
function originalFig(f, pic) {
  const crop = f.entry?.crop
  let body
  if (!f.entry?.asset) body = gone('No owner photo in this frame.')
  else if (!pic) body = gone(`Original missing: ${esc(f.entry.asset)}`, true)
  else {
    const box =
      crop && pic.width
        ? `<span class="cut" style="left:${(crop.x / pic.width) * 100}%;top:${(crop.y / pic.height) * 100}%;width:${(crop.width / pic.width) * 100}%;height:${(crop.height / pic.height) * 100}%"></span>`
        : ''
    body = `<span class="frame-img">${img(pic, `Original ${f.entry.asset}`)}${box}</span>${
      crop && !pic.width ? '<div class="muted small">Cut area not drawn: original size unknown.</div>' : ''
    }`
  }
  return `<div class="fig"><h4>Owner original, cut area boxed</h4>${body}</div>`
}

// An icon's two files, each on a light and a dark ground.
function iconFig(f, pics) {
  const files = [
    [f.entry.file, pics.out],
    [f.entry.dark?.file, pics.dark]
  ].filter(([file]) => file)
  const tiles = files.flatMap(([file, pic]) =>
    ['light', 'dark'].map(
      (ground) =>
        `<div class="ground ${ground}">${pic ? `<img src="${esc(pic.src)}" alt="Icon ${esc(file)} on a ${ground} ground">` : '<span>missing</span>'}<span>${ground} ground</span></div>`
    )
  )
  return `<div class="fig"><h4>Icon previews on light and dark grounds</h4><div class="grounds">${tiles.join('')}</div>${
    f.entry.icon
      ? `<div class="muted small">light ${esc(f.entry.icon.light)}, dark ${esc(f.entry.icon.dark)}</div>`
      : ''
  }</div>`
}

// A painted picture's colour roles (paint.js): the colour is the Design system's, decided when the site is written.
function paintHtml(e) {
  const p = e?.paint
  if (!p) return ''
  const variant = (v) => `${v.glyph}${v.plate ? ` on a ${v.plate.role} plate` : ''}`
  const roles =
    'light' in p
      ? `${variant(p.light)}${JSON.stringify(p.dark) !== JSON.stringify(p.light) ? `, other theme ${variant(p.dark)}` : ''}${p.holds ? `; this frame holds the ${p.holds} file` : ''}`
      : `${p.background}, letters ${p.foreground}`
  return `<div class="paint"><b>Colour:</b> ${esc(roles)} <span class="muted">(decided when written)</span></div>`
}

function finishedFig(f, pic, displayWidth) {
  const e = f.entry
  let body
  if (!e)
    body = gone(
      f.label === 'no entry' ? 'No entry for this frame in the manifest.' : esc(f.reason ?? f.label),
      f.label === 'no entry'
    )
  else if (e.source === 'hide') body = gone(`Hidden: ${esc(e.reason)}`)
  else if (!pic) body = gone(`File missing: ${esc(e.file)}`, true)
  else
    body = `<span class="frame-img" style="width:${displayWidth ?? pic.width ?? 320}px">${img(pic, `${e.paint ? 'Preview' : 'Finished picture'} of ${f.frame}`)}</span>`
  const size = e?.width ? ` <span class="muted small">${esc(e.width)} x ${esc(e.height)} px</span>` : ''
  const title = e?.paint ? 'Preview, neutral colours' : 'Finished picture'
  return `<div class="fig"><h4>${title}${size}</h4>${body}${paintHtml(e)}</div>`
}

function requestHtml(w) {
  const rows = [
    ['Shows', w.shows],
    ['Must include', list(w.mustInclude)],
    ['Avoid', list(w.avoid)],
    ['Mood', w.mood],
    ['Size', typeof w.size === 'object' && w.size ? `${w.size.width} x ${w.size.height}` : w.size],
    ['Match', w.match],
    ['Same as', w.sameAs]
  ].filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
  return rows.length
    ? `<dl class="req">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('')}</dl>`
    : '<div class="req muted">The plan states no request for this frame.</div>'
}

const chips = (f) => {
  const e = f.entry
  const warn = f.label === 'no entry' || f.label === 'returned' ? ' warn' : ''
  const out = [
    `<span class="chip src${warn}">${esc(f.label)}${f.waitsFor ? `, waits for ${esc(f.waitsFor)}` : ''}${e?.twinOf ? ` of ${esc(e.twinOf)}` : ''}</span>`
  ]
  if (f.setting) out.push('<span class="chip">template setting</span>')
  if (e?.enlarge && e.enlarge > 1) out.push(`<span class="chip">enlarged x${esc(e.enlarge)}</span>`)
  if (e?.darkened) out.push('<span class="chip">darkened</span>')
  if (e?.filledBy?.rung === 'redraw-alt') out.push('<span class="chip">drawn in another composition</span>')
  if (e?.filledBy?.rung === 'best-rejected')
    out.push(`<span class="chip warn">kept with minor faults: ${esc(e.filledBy.faults.join(', '))}</span>`)
  if (e?.reuse?.with) out.push(`<span class="chip">reused, also in ${esc(e.reuse.with.join(', '))}</span>`)
  if (e?.paint) out.push('<span class="chip">preview, colour decided when written</span>')
  if (e?.sharpness && e.sharpness.passed === false) out.push('<span class="chip warn">not sharp</span>')
  return out.join('')
}

function lookerHtml(f) {
  const e = f.entry
  const verdict = e?.verdict ?? e?.looker?.verdict ?? null
  const seen = e?.seen ?? f.alt?.seen ?? null
  const parts = [
    `<div><b>Looker verdict:</b> ${verdict ? esc(typeof verdict === 'object' ? JSON.stringify(verdict) : verdict) : '<span class="empty">not looked at yet</span>'}</div>`,
    `<div><b>Seen:</b> ${seen ? esc(seen) : '<span class="empty">no sentence yet</span>'}</div>`
  ]
  if (f.alt) parts.push(`<div><b>Writer alt:</b> ${esc(f.alt.alt)}</div>`)
  if (e?.reason) parts.push(`<div class="muted small">${esc(e.reason)}</div>`)
  return `<div class="seen">${parts.join('')}</div>`
}

function frameHtml(f, media) {
  const pics = media(f.frame) ?? {}
  const demo = pics.demo
    ? img(pics.demo, `Kit demo picture of ${f.frame}`)
    : gone('No kit demo image found for this frame.')
  const figs = [
    `<div class="fig"><h4>Kit demo</h4>${pics.demo ? `<span class="frame-img">${demo}</span>` : demo}</div>`,
    originalFig(f, pics.original),
    finishedFig(f, pics.out, pics.displayWidth),
    ...(f.entry?.source === 'icon' ? [iconFig(f, pics)] : [])
  ]
  const gap = f.label === 'no entry' || (f.entry && f.entry.source !== 'hide' && !pics.out)
  return `<article class="frame${gap ? ' gap' : ''}" id="${slug(f.frame)}"><header><span class="id">${esc(f.frame)}</span>${
    f.block ? `<span class="muted small">${esc(f.block)}</span>` : ''
  }${f.wish.kind ? `<span class="chip">${esc(f.wish.kind)}</span>` : ''}${chips(f)}</header>
${requestHtml(f.wish)}${surfaceHtml(f)}${aroundHtml(f.around)}${f.reason && !f.entry ? `<div class="note ret">${esc(f.reason)}</div>` : ''}
${whereHtml(f, pics.where)}<div class="figs">${figs.join('')}</div>${lookerHtml(f)}</article>`
}

const table = (head, rows) =>
  rows.length
    ? `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
    : ''

/**
 * @param {ReturnType<import('./model.js').buildModel>} m
 * @param {(frame: string) => { demo?: object | null, original?: object | null, out?: object | null, dark?: object | null } | undefined} media
 */
export function renderPage(m, media = () => ({})) {
  const stat = (n, label) => `<div class="stat${n ? '' : ' zero'}"><b>${n}</b>${esc(label)}</div>`
  const nav = m.groups.map((g) => `<a href="#${slug(g.id)}">${esc(g.title)}</a>`).join('')
  const groups = m.groups
    .map(
      (g) =>
        `<h2 id="${slug(g.id)}">${esc(g.title)} <span class="muted small">${g.frames.length} frames</span></h2>${g.frames.map((f) => frameHtml(f, media)).join('')}`
    )
    .join('')
  const totalCost = m.cost.reduce((n, c) => n + (typeof c.usd === 'number' ? c.usd : 0), 0)
  const returns = m.returns.length
    ? table(
        ['Frame', 'Reason'],
        m.returns.map((r) => [r.frame, r.reason])
      )
    : '<p class="muted">Nothing was returned to the planner.</p>'
  const alts = m.altNotes.length
    ? table(
        ['Frame', 'Writer alt', 'Seen'],
        m.altNotes.map((n) => [n.frame, n.alt, n.seen])
      )
    : '<p class="muted">No alt notes.</p>'
  const costs = m.cost.length
    ? table(
        ['Role', 'Cost', 'Time'],
        [
          ...m.cost.map((c) => [c.role, money(c.usd), seconds(c.ms)]),
          ['all roles', money(totalCost), seconds(m.cost.reduce((n, c) => n + (c.ms ?? 0), 0))]
        ]
      )
    : '<p class="muted">No cost or timing recorded.</p>'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site pictures reading page</title><style>${CSS}</style></head><body><main>
<h1>Site pictures reading page</h1>
<div class="muted">${esc(m.kit)}${m.run?.id ? ` · run ${esc(m.run.id)}` : ''} · ${m.total} planned frames</div>
<div class="sum">${Object.entries(m.counts)
    .map(([label, n]) => stat(n, label))
    .join(
      ''
    )}${stat(m.returns.length, 'returns to planner')}${stat(m.altNotes.length, 'alt notes')}${stat(money(totalCost), 'cost')}${stat(seconds(m.cost.reduce((n, c) => n + (c.ms ?? 0), 0)), 'time')}</div>
<nav class="toc">${nav}<a href="#returns">Returns</a><a href="#alts">Alt notes</a><a href="#costs">Cost and time</a></nav>
${groups}
<h2 id="returns">Returns to planner</h2>${returns}
<h2 id="alts">Alt notes</h2>${alts}
<h2 id="costs">Cost and time per role</h2>${costs}
</main><script>${ZOOM_JS}${WHERE_JS}</script></body></html>
`
}
