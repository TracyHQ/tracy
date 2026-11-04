// The "where on the template" strip of a frame card (#341): the template shot cropped around the frame with its box
// outlined, beside the same crop with the finished picture in the box. The crop links to the full shot, which the
// page script opens with the box marked. A frame the kit cannot place says so instead of showing a box.
import { escapeHtml } from '../../lib/html.js'

const esc = (v) => escapeHtml(v ?? '')

const SHOWN_OTHERS = 6

function othersHtml(others) {
  if (!others.length) return ''
  const more = others.length > SHOWN_OTHERS ? ` and ${others.length - SHOWN_OTHERS} more` : ''
  return `<div class="muted small">Also on ${others.length} other page${others.length > 1 ? 's' : ''}: ${others
    .slice(0, SHOWN_OTHERS)
    .map((p) => `<code>${esc(p)}</code>`)
    .join(', ')}${more}</div>`
}

const afterText = (f) => {
  if (f.entry?.source === 'hide') return 'Hidden: the frame is taken off the page.'
  if (!f.entry) return 'Nothing to place yet.'
  return f.entry.file ? `File missing: ${esc(f.entry.file)}` : 'No finished picture to place.'
}

// "80% black" for rgba(0,0,0,0.8); the colour as written for any other.
export function overlayName(o) {
  const pct = `${Math.round(Number(o.strength) * 100)}%`
  const m = /^rgba\((\d+),(\d+),(\d+),/.exec(String(o.colour).replace(/\s+/g, ''))
  const name =
    m && m[1] === '0' && m[2] === '0' && m[3] === '0'
      ? 'black'
      : m && m.slice(1, 4).every((x) => x === '255')
        ? 'white'
        : o.colour
  return `${pct} ${name}`
}

/** The frame's surface (ADR 0043 section 3e): text over its picture, the template's overlay, the title background. */
export function surfaceHtml(f) {
  const s = f.surface
  if (!s) return ''
  const lines = []
  if (s.textOver)
    lines.push(
      `Text sits over this picture${s.textOverFrom === 'derived' ? ' (derived: the picture fills its block, which has text)' : ''}.`
    )
  if (s.overlay && typeof s.overlay === 'object')
    lines.push(
      `Template overlay: ${esc(overlayName(s.overlay))} over the picture (<code>${esc(s.overlay.from)}</code>); no overlay is baked in for it.`
    )
  else if (s.overlay === 'unknown' && s.textOver) lines.push('Template overlay: not known for this frame.')
  else if (s.overlay === null && s.textOver)
    lines.push('Template overlay: none, the picture itself must carry the text.')
  if (s.behindTitle)
    lines.push(
      `Also shown dimmed behind the page title (${esc(s.behindTitle.layout)} article layout, <code>.bg-mask</code>).`
    )
  return lines.length ? `<div class="note surface">${lines.map((l) => `<div>${l}</div>`).join('')}</div>` : ''
}

/**
 * @param {object} f a frame of the model
 * @param {{ place: object, shot?: object | null, before?: object | null, after?: object | null } | null | undefined} w
 */
export function whereHtml(f, w) {
  if (!w) return ''
  const p = w.place
  const page = p.page ? `<code>${esc(p.page.path)}</code>` : 'no page'
  const via = p.via ? ` <span class="muted small">(position of its twin ${esc(p.via)})</span>` : ''
  const head = `<h4>Where on the template: ${page}${p.how === 'block' ? ' <span class="muted small">(block shot)</span>' : ''}${via}</h4>`
  if (p.how === 'none' || !w.before)
    return `<div class="where">${head}<div class="gone">Position not measured: ${esc(p.reason ?? 'no shot found')}.</div>${othersHtml(p.others)}</div>`
  const box = [p.box.left, p.box.top, p.box.width, p.box.height].map((n) => Math.round(n)).join(',')
  const before = `<a class="where-shot" href="${esc(w.shot.src)}" data-box="${box}" data-size="${p.shotSize.width},${p.shotSize.height}" title="Open the whole ${p.how === 'block' ? 'block' : 'page'} with the box marked"><img src="${esc(w.before.src)}" alt="Template shot around ${esc(f.frame)}, box outlined" loading="lazy" width="${w.before.width}"></a>`
  const after = w.after
    ? `<button type="button" class="zoom" title="Click to enlarge"><img src="${esc(w.after.src)}" alt="Finished picture of ${esc(f.frame)} in the box" loading="lazy" width="${w.after.width}"></button>`
    : `<div class="gone">${afterText(f)}</div>`
  return `<div class="where">${head}<div class="pair"><figure><figcaption>Demo, box outlined</figcaption>${before}</figure><figure><figcaption>Our picture in the box${w.overlay ? `, template overlay ${esc(overlayName(w.overlay))} drawn` : ''}</figcaption>${after}</figure></div>${w.after ? `<div class="muted small">Pasted at the box size, ${w.fit === 'contain' ? 'whole picture shown' : 'cropped to fill'}${w.overlay ? `; the template's own overlay (${esc(overlayName(w.overlay))}, <code>${esc(w.overlay.from)}</code>) is drawn over it as the site shows it` : ''}; text the site lays over a picture is not redrawn.</div>` : ''}${othersHtml(p.others)}</div>`
}
