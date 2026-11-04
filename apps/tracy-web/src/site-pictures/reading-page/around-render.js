// The "Copy around this picture" panel of a frame card (copy-around.js). A body longer than TRIM characters is cut
// at a word with the whole text one click away, so a card stays a card.
import { escapeHtml } from '../../lib/html.js'

const esc = (v) => escapeHtml(v ?? '')

const TRIM = 300

function textHtml(items) {
  if (!items) return '<span class="empty">no text written</span>'
  const full = items.join('\n\n')
  const para = (t) => `<p>${esc(t)}</p>`
  if (full.length <= TRIM) return items.map(para).join('')
  const cut = full.slice(0, TRIM).replace(/\s+\S*$/, '')
  return `<details><summary><span class="cut-text">${esc(cut)}</span> <span class="more">more</span></summary>${items.map(para).join('')}</details>`
}

const rowsHtml = (rows) =>
  rows
    .map(
      (r) =>
        `<div class="row"><span class="lab">${esc(r.label)}</span><div class="val">${textHtml(r.items)}</div></div>`
    )
    .join('')

/** @param {ReturnType<import('./copy-around.js').copyAround>} a */
export function aroundHtml(a) {
  if (!a) return ''
  const head = [
    a.role ? `<div><b>Role of the block:</b> ${esc(a.role)}</div>` : '',
    a.message ? `<div><b>Block message:</b> ${esc(a.message)}</div>` : ''
  ].join('')
  const block = a.blockText.length
    ? `<h5>Text of the block</h5>${rowsHtml(a.blockText)}`
    : '<div class="muted small">The plan gives this block no text.</div>'
  let card = ''
  if (a.card) {
    const title = a.card.about ? `This card: ${esc(a.card.about)}` : 'This card'
    card = a.card.text.length
      ? `<h5>${title}</h5>${rowsHtml(a.card.text)}`
      : `<h5>${title}</h5><div class="muted small">This card has no text of its own.</div>`
  }
  const alt = a.alt ? `<h5>Alt of this picture</h5><div class="alt">${esc(a.alt)}</div>` : ''
  return `<section class="around"><h4>Copy around this picture${a.block ? ` <code>${esc(a.block)}</code>` : ''}</h4>${head}${block}${card}${alt}</section>`
}
