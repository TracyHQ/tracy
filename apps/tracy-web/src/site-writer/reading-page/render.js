// Renders the copy reading page's model (model.js) as one self-contained HTML string: no script, no external file.
// Every value from a plan, a copy file or a brief goes through esc(). Images are passed in already resolved as src
// strings (data URIs or relative paths). Red (class "bad") marks only what the copy check failed.
import { CSS } from './styles.js'

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c])
const slugOf = (id) => `p-${String(id).replace(/[^a-zA-Z0-9]+/g, '-')}`

const failLines = (list) =>
  list
    .map((f) => `<div class="fail"><b>${esc(f.rule)}</b> ${esc(f.cause ?? '')} ${esc(f.detail)}</div>`)
    .join('')

const factLine = (f) =>
  `<div class="fact"><code>${esc(f.id)}</code> ${f.field ? `${esc(f.field)}: ` : ''}${esc(f.value ?? 'not in the brief')}${
    f.evidence ? ` <q>${esc(f.evidence)}</q>` : ''
  }</div>`

function slotHtml(s) {
  const bad = s.failures.length > 0 || (!s.written && !s.returnedReason)
  const over = s.limit !== null && s.chars > s.limit
  const count = s.written
    ? `<span class="count${over ? ' over' : ''}">${s.chars}${s.limit !== null ? ` / ${s.limit}` : ''} characters${
        s.items.length > 1 ? `, ${s.items.length} items` : ''
      }</span>`
    : ''
  let text
  if (s.written)
    text = `<div class="text${s.owner === 'plan-label' ? ' label' : ''}">${s.items.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`
  else if (s.returnedReason) text = `<div class="ret">returned to the planner: ${esc(s.returnedReason)}</div>`
  else text = '<div class="empty">no text written</div>'
  return `<div class="slot${bad ? ' bad' : ''}" id="${slugOf(s.slot)}">
<div><span class="id">${esc(s.slot)}</span>${s.label ? ` <span class="chip">${esc(s.label)}</span>` : ''}${
    s.owner === 'plan-label' ? ' <span class="chip">label from the plan</span>' : ''
  }${s.basis ? ` <span class="chip">${esc(s.basis)}</span>` : ''} ${count}</div>
${s.says ? `<div class="note">Plan: ${esc(s.says)}</div>` : ''}
${s.facts.length ? `<div class="facts">${s.facts.map(factLine).join('')}</div>` : ''}
${text}${failLines(s.failures)}</div>`
}

function pictureHtml(p) {
  const bad = p.failures.length > 0
  return `<div class="alt${bad ? ' bad' : ''}"><span class="id">${esc(p.frame)}</span>
${[p.kind, p.size]
  .filter(Boolean)
  .map((x) => `<span class="chip">${esc(x)}</span>`)
  .join('')}
<div class="note">Picture wish: ${esc(p.shows ?? 'not stated')}</div>
<div class="text">${p.alt === null ? '<span class="empty">no alt text written</span>' : `Alt: ${esc(p.alt)} <span class="count${[...p.alt].length > 125 ? ' over' : ''}">${[...p.alt].length} / 125</span>`}</div>
${failLines(p.failures)}</div>`
}

function blockHtml(b, imageSrc) {
  if (b.decision !== 'keep')
    return `<section class="block dim"><header><h3>${esc(b.id)}</h3><span class="chip">${esc(b.decision)}</span><span class="muted small">${esc(b.why)}</span></header></section>`
  const shot = imageSrc
    ? `<img src="${esc(imageSrc)}" alt="Block ${esc(b.id)} at 1440 px" loading="lazy">`
    : '<div class="none muted">No 1440 image found for this block.</div>'
  const hidden = b.hidden.length
    ? `<div class="muted small">Hidden slots: ${b.hidden.map((h) => `${esc(h.slot)} (${esc(h.why)})`).join('; ')}</div>`
    : ''
  return `<section class="block"><header><h3>${esc(b.id)}</h3><span class="muted small">${esc(b.why)}</span></header>
<div class="body"><div class="shot">${shot}</div><div class="slots">${b.slots.map(slotHtml).join('')}${b.pictures.map(pictureHtml).join('')}${hidden}</div></div></section>`
}

const seoHtml = (s) =>
  `<dl class="seo"><dt>Page title ${s.title ? `<span class="count${[...s.title].length > 60 ? ' over' : ''}">${[...s.title].length} / 60</span>` : ''}</dt>
<dd class="${s.titleFailures.length ? 'copy bad' : ''}">${s.title === null ? '<span class="empty">missing</span>' : esc(s.title)}${failLines(s.titleFailures)}</dd>
<dt>Meta description ${s.description ? `<span class="count${[...s.description].length > 160 ? ' over' : ''}">${[...s.description].length} / 160</span>` : ''}</dt>
<dd class="${s.descriptionFailures.length ? 'copy bad' : ''}">${s.description === null ? '<span class="empty">missing</span>' : esc(s.description)}${failLines(s.descriptionFailures)}</dd></dl>`

const bodyHtml = (p) =>
  p
    ? `<dl class="seo"><dt>Page heading</dt><dd>${esc(p.title)}</dd>${p.body
        .map(
          (b) =>
            `<dd class="${b.failures.length ? 'copy bad' : ''}"><p>${esc(b.text)}</p>${failLines(b.failures)}</dd>`
        )
        .join('')}</dl>`
    : '<div class="seo empty">no page text written</div>'

/**
 * @param {ReturnType<import('./model.js').buildModel>} m
 * @param {(blockId: string) => string | null} imageFor
 */
export function renderPage(m, imageFor = () => null) {
  const cards = (list) => list.map((b) => blockHtml(b, imageFor(b.id))).join('')
  const pageBad = (p) => p.blocks.some((b) => b.slots.some((s) => s.failures.length)) || p.failures?.length
  const nav = [
    '<a href="#shared">Shared</a>',
    ...m.pages.map((p) => `<a${pageBad(p) ? ' class="bad"' : ''} href="#${slugOf(p.id)}">${esc(p.id)}</a>`),
    '<a href="#legal">Legal and 404</a>',
    '<a href="#notebook">Notebook</a>',
    '<a href="#returns">Returns</a>'
  ].join('')
  const run = m.run
  const stat = (n, label, bad = false) =>
    `<div class="stat${bad && n ? ' bad' : ''}"><b>${n}</b>${esc(label)}</div>`
  const pages = m.pages
    .map((p) =>
      p.decision !== 'keep'
        ? `<h2 id="${slugOf(p.id)}">${esc(p.id)} <span class="chip">${esc(p.decision)}</span></h2><div class="muted">${esc(p.why)}</div>`
        : `<h2 id="${slugOf(p.id)}">${esc(p.id)}</h2>${failLines(p.failures ?? [])}${seoHtml(p.seo)}${cards(p.blocks)}`
    )
    .join('')
  const legal = m.legal
    .map(
      (l) =>
        `<h3>${esc(l.kind)} page <span class="id muted">${esc(l.id)}</span></h3><div class="note">Plan: ${esc(l.says)}</div>${failLines(l.failures)}${seoHtml(l.seo)}${bodyHtml(l.page)}`
    )
    .join('')
  const notebook = m.notebook.length
    ? `<table><tr><th>Page</th><th>Main points</th><th>Openings</th><th>Calls to action</th><th>Phrases used</th></tr>${m.notebook
        .map(
          (n) =>
            `<tr><td>${esc(n.page)}</td>${['points', 'openings', 'calls', 'phrases'].map((k) => `<td><ul class="tight">${n[k].map((x) => `<li>${esc(x)}</li>`).join('')}</ul></td>`).join('')}</tr>`
        )
        .join('')}</table>`
    : '<p class="muted">The writer kept no notebook.</p>'
  const returns = m.returns.length
    ? `<table><tr><th>Slot or page</th><th>Reason</th></tr>${m.returns.map((r) => `<tr><td>${esc(r.slot ?? r.page)}</td><td>${esc(r.reason)}</td></tr>`).join('')}</table>`
    : '<p class="muted">Nothing was returned to the planner.</p>'
  const standing = m.standing.length
    ? `<h2>Failures still standing</h2>${m.standing.map((l) => `<div class="fail">${esc(l)}</div>`).join('')}`
    : ''
  const unplaced = m.unplaced.length
    ? `<h2>Failures not placed on a slot</h2>${m.unplaced.map((f) => `<div class="fail"><b>${esc(f.rule)}</b> ${esc(f.where)}: ${esc(f.detail)}</div>`).join('')}`
    : ''
  const strays = m.strays.length
    ? `<h2>Written slots outside the plan blocks</h2>${m.strays.map(slotHtml).join('')}`
    : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site copy reading page</title><style>${CSS}</style></head><body><main>
<h1>Site copy reading page</h1>
<div class="muted">${esc(m.kit)} · language ${esc(m.language)} · checker ${esc(m.checker ?? 'not run')}${run ? ` · run ${esc(run.id)} · ${esc(run.model)}` : ''}</div>
<div class="stats">${stat(m.counts.slots, 'slots')}${stat(m.counts.failing, 'slots in red', true)}${stat(m.counts.failures, 'check failures', true)}${stat(m.counts.returns, 'returned to planner')}${
    run?.costUsd !== undefined ? stat(`$${Number(run.costUsd).toFixed(4)}`, 'cost') : ''
  }</div>
<nav class="toc">${nav}</nav>
${standing}${unplaced}
<h2 id="shared">Shared blocks</h2>${cards(m.sharedBlocks)}
${pages}
<h2 id="legal">Legal pages and not found</h2>${legal}
<h3>Not found page <span class="muted">${esc(m.notFound.says)}</span></h3>${failLines(m.notFound.failures)}${bodyHtml(m.notFound.page)}
${strays}
<h2 id="notebook">Copy notebook</h2>${notebook}
<h2 id="returns">Returns to planner</h2>${returns}
</main></body></html>
`
}
