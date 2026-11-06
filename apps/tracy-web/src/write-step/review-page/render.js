// The review page's HTML (#357): one self-contained file. Pictures arrive as data URIs from the caller; every value that
// came from a run is escaped, and the only script is the page's own (client.js).
import { CLIENT_SOURCE } from './client.js'
import { STYLES } from './styles.js'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c])
const short = (text, n = 220) => (text.length > n ? `${text.slice(0, n)}...` : text)

const chip = (state, L) =>
  `<span class="chip ${state}">${esc({ failed: L.stateFailed, ok: L.stateOk, unchecked: L.stateUnchecked, skipped: L.stateSkipped }[state])}</span>`

function slotHtml(s, L, images) {
  const thumb =
    s.sha && images.byHash[s.sha] ? `<img class="thumb" src="${images.byHash[s.sha]}" alt="">` : ''
  const value = s.ordered === null ? '' : thumb || esc(short(String(s.ordered)))
  return `<div class="slot"><span class="id">${esc(s.slot)}</span>${chip(s.state, L)}${value ? `<div class="val">${value}</div>` : ''}${s.reason ? `<div class="why">${esc(short(s.reason, 400))}</div>` : ''}</div>`
}

function shotHtml(row, L, images) {
  const one = (width, caption) => {
    const shot = images.pageShots[row.id]?.[width]
    return `<figure><figcaption>${esc(caption)}</figcaption>${shot ? `<div class="shot"><img src="${shot}" alt=""></div>` : `<div class="missing">${esc(L.noCapture)}</div>`}</figure>`
  }
  return `<div class="shots">${one(1440, L.capture1440)}${one(390, L.capture390)}</div>`
}

function rowHtml(row, L, images, siteUrl) {
  const failed = row.slots.filter((s) => s.state === 'failed').length
  const link =
    row.path && siteUrl ? new URL(row.path.replace(/^\//, ''), `${siteUrl.replace(/\/$/, '')}/`).href : null
  const skipped = row.skipped.length
    ? `<details><summary>${esc(L.skippedSlots)} (${row.skipped.length})</summary>${row.skipped.map((s) => slotHtml(s, L, images)).join('')}</details>`
    : ''
  return `<section class="row" id="${esc(row.id ?? 'shared')}"><div class="row-head"><h2>${esc(row.title ?? L.shared)}</h2>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(row.path)}</a>` : ''}${failed ? `<span class="chip failed">${failed} ${esc(L.stateFailed)}</span>` : ''}</div>
<div class="row-body">${row.id ? shotHtml(row, L, images) : '<div></div>'}<div>${row.slots.map((s) => slotHtml(s, L, images)).join('') || `<p class="muted">${esc(L.noSlots)}</p>`}${skipped}</div></div></section>`
}

function framePlanHtml(f, L) {
  const p = f.planned
  const lines = p
    ? [
        p.shows,
        [p.kind, p.mood, p.size].filter(Boolean).join(', '),
        p.avoid.length ? `-: ${p.avoid.join(', ')}` : '',
        p.mustInclude.length ? `+: ${p.mustInclude.join(', ')}` : ''
      ].filter(Boolean)
    : []
  return lines.length
    ? `<h3>${esc(L.planned)}</h3>${lines.map((l) => `<div class="small">${esc(l)}</div>`).join('')}`
    : ''
}

function frameHtml(f, L, images) {
  const crop = (width, caption) => {
    const src = images.crops[f.id]?.[width]
    return `<figure><figcaption>${esc(caption)}</figcaption>${src ? `<img src="${src}" alt="">` : `<div class="missing">${esc(L.frameNotFound)}</div>`}</figure>`
  }
  const pic = (src, caption) =>
    src ? `<figure><figcaption>${esc(caption)}</figcaption><img src="${src}" alt=""></figure>` : ''
  const near = f.nearby.length
    ? f.nearby
        .map(
          (n) =>
            `<div class="near"><span class="id muted small">${esc(n.slot)}</span><br>${esc(short(n.text))}</div>`
        )
        .join('')
    : `<p class="muted small">${esc(L.noNearbyCopy)}</p>`
  return `<article class="frame" data-frame="${esc(f.id)}" data-state="${f.state}">
<div class="row-head"><h2>${esc(f.id)}</h2>${chip(f.state, L)}<span class="muted small">${esc(f.source ?? '')}</span></div>
<div class="crops">${crop(1440, L.crop1440)}${crop(390, L.crop390)}</div>
${f.reason ? `<p class="small" style="color:var(--bad)">${esc(short(f.reason, 300))}</p>` : ''}
<h3>${esc(L.nearbyCopy)}</h3>${near}${framePlanHtml(f, L)}
<div class="pics">${pic(images.made[f.id], L.madePicture)}${pic(images.source[f.id], L.sourcePicture)}</div>
<div class="acts"><button class="btn" data-verdict="approve" aria-pressed="false">${esc(L.approve)}</button><button class="btn bad" data-verdict="reject" aria-pressed="false">${esc(L.reject)}</button></div>
<textarea placeholder="${esc(L.notePlaceholder)}" aria-label="${esc(L.note)}"></textarea></article>`
}

/**
 * @param {object} model from buildReviewModel
 * @param {object} labels from withLabels
 * @param {{ pageShots: object, crops: object, made: object, source: object, byHash: object }} images data URIs
 */
export function renderReviewPage(model, labels, images) {
  const L = labels
  const stat = (n, text, cls = '') => `<div class="stat ${cls}"><b>${n}</b>${esc(text)}</div>`
  const config = { runKey: `${model.run.site ?? ''}|${model.run.kit ?? ''}`, copied: L.copied }
  const filters = [
    ['all', L.filterAll],
    ['failed', L.filterFailed],
    ['rejected', L.filterRejected],
    ['open', L.filterOpen]
  ]
  return `<!doctype html>
<html lang="${esc(L.htmlLang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(L.title)}</title><style>${STYLES}</style></head><body><main>
<header class="top"><div><h1>${esc(L.title)}</h1><div class="muted small">${esc(L.kit)}: ${esc(model.run.kit)} | ${esc(L.siteCheck)}: ${esc(model.run.check ?? '-')}</div></div>
<div>${model.siteUrl ? `<a class="btn" href="${esc(model.siteUrl)}" target="_blank" rel="noopener">${esc(L.openSite)}</a> ` : ''}<button class="btn" id="theme" type="button">${esc(L.theme)}</button></div></header>
<div class="stats">${stat(model.stats.failed, L.statFailed, model.stats.failed ? 'bad' : '')}${stat(model.stats.written, L.statWritten)}${stat(model.stats.skipped, L.statSkipped)}${stat(model.stats.frames, L.statFrames)}</div>
<nav class="tabs"><button class="btn" type="button" data-tab="pages">${esc(L.tabPages)}</button><button class="btn" type="button" data-tab="pictures">${esc(L.tabPictures)}</button></nav>
<div data-panel="pages"><p class="muted small">${esc(L.failedFirst)}</p>${[...model.pages, model.shared]
    .filter((r) => r.id || r.slots.length || r.skipped.length)
    .map((r) => rowHtml(r, L, images, model.siteUrl))
    .join('')}</div>
<div data-panel="pictures" hidden><div class="bar">${filters.map(([k, t]) => `<button class="btn" type="button" data-filter="${k}">${esc(t)}</button>`).join('')}<span class="muted small">${esc(L.redoCount)}: <b id="redo-count">0</b></span><button class="btn" id="copy-redo" type="button">${esc(L.copyRedo)}</button><button class="btn" id="copy-notes" type="button">${esc(L.copyNotes)}</button></div>
<div class="frame-grid">${model.frames.map((f) => frameHtml(f, L, images)).join('')}</div></div>
</main><script type="application/json" id="review-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script><script>${CLIENT_SOURCE}</script></body></html>
`
}
