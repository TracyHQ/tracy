/**
 * Buttons that run into each other once the system dresses them (E2 of PR 2, 14/10/2026). On JA
 * Symphony Joomla under Moxie the "Tickets" and "Rspv" pills of an event, side by side on the
 * template's page, grew with the slot's button padding and wrapped: Rspv drops under Tickets, the two
 * pills stacked edge to edge, offset, with no gap.
 *
 * Buttons (BUTTON_SELECTOR, the buttons every button detector reads) of one row are judged by pair,
 * against the template's own page (same paths):
 * - they cover each other by `overlap` of the smaller box or more, where they did not before;
 * - or they stood side by side on one row and now one dropped under the other with less than `gap`
 *   px between them (the row wrapped with no room for it).
 * A button inside another one is not a pair.
 */
import { BUTTON_SELECTOR } from './lib/buttons.mjs'
import { PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'button-overlap'

export const OVERLAP_LIMITS = Object.freeze({ overlap: 0.1, gap: 4 })

export const probe = `(() => {${PAGE_HELPERS}
  const list = []
  for (const e of document.querySelectorAll(${JSON.stringify(BUTTON_SELECTOR)})) {
    if (list.length >= 300) break
    const r = seen(e, getComputedStyle(e))
    if (r && (e.innerText || e.value || '').trim()) list.push({ e, r })
  }
  // pairs of buttons near each other (a row, its wrap): within one button's height and a button's width
  const out = []
  for (let i = 0; i < list.length && out.length < 200; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue
      const dx = Math.max(a.r.left, b.r.left) - Math.min(a.r.right, b.r.right)
      const dy = Math.max(a.r.top, b.r.top) - Math.min(a.r.bottom, b.r.bottom)
      if (dx > 40 || dy > 40) continue
      const box = (x) => ({ x: Math.round(x.r.left), y: Math.round(x.r.top + scrollY), w: Math.round(x.r.width), h: Math.round(x.r.height) })
      const txt = (x) => (x.innerText || x.value || '').trim().slice(0, 30)
      out.push({ key: pathOf(a.e) + '|' + pathOf(b.e), at: label(a.e), text: txt(a.e) + ' / ' + txt(b.e), a: box(a), b: box(b) })
    }
  return out
})()`

/** How the pair collides on the worn page, or null. @param {any} p worn pair @param {any} was plain pair */
export function collides(p, was, t = OVERLAP_LIMITS) {
  const { a, b } = p
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  const share = w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0
  const overlapped = (/** @type {any} */ q) => {
    if (!q) return false
    const qw = Math.min(q.a.x + q.a.w, q.b.x + q.b.w) - Math.max(q.a.x, q.b.x)
    const qh = Math.min(q.a.y + q.a.h, q.b.y + q.b.h) - Math.max(q.a.y, q.b.y)
    return qw > 0 && qh > 0 && (qw * qh) / Math.min(q.a.w * q.a.h, q.b.w * q.b.h) >= t.overlap
  }
  if (share >= t.overlap && !overlapped(was))
    return `the two buttons overlap by ${Math.round(share * 100)}% of the smaller`
  if (!was) return null
  const oneRow = (/** @type {any} */ q) =>
    Math.abs(q.a.y + q.a.h / 2 - (q.b.y + q.b.h / 2)) < Math.min(q.a.h, q.b.h) / 2
  // wrapped: one row on the template's page, stacked now, with the columns crossing and no gap between
  if (oneRow(was) && !oneRow(p) && w > 0 && h > -t.gap)
    return `side by side on the template's page, wrapped onto two rows with ${Math.max(0, -h)}px between them`
  return null
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const before = new Map((plain?.data ?? []).map((/** @type {any} */ p) => [p.key, p]))
  const findings = []
  for (const p of worn?.data ?? []) {
    const why = collides(p, before.get(p.key))
    if (why) findings.push({ at: p.at, text: p.text, why })
  }
  return { count: findings.length, findings }
}
