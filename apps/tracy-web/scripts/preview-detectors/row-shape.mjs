/**
 * A button that took a shape of its own in a row of same-height cells (Akemi's eye check of JA Impact,
 * 17/10/2026). The header's Donate now is a flush, full-height cell of the bordered menu row; under Moxie
 * it wore the system's pill while the menu cells beside it stayed square, so the row looked broken. BTN-1
 * (button-role) leaves the corner of such a row cell to its row (ROW_CELL, 2b44950e5e); this is the
 * positive rule it left open: the cell must keep the row's shape.
 *
 * In the page: every button with a label (BUTTON_SELECTOR) whose row (the nearest ancestor wider than it)
 * starts and ends within `edgePx` of its own top and bottom, and the other cells of that row that draw a
 * box (an outline or a fill off their ground) with the same top and bottom; form fields are left out (a
 * button joined to a field is button-role's). The row's corner is the one most of those cells show.
 * A finding is a button whose corner is off the row's by more than `cornerPx` on the worn page; `by` says
 * whether the template's own page had it off already.
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'
import { BUTTON_SELECTOR } from './lib/buttons.mjs'

export const kind = 'row-shape'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const ROW_SHAPE_LIMITS = Object.freeze({ edgePx: 2, cornerPx: 4 })

export const probe = `(() => {${PAGE_HELPERS}
  const E = ${ROW_SHAPE_LIMITS.edgePx}
  const px = (v) => parseFloat(v) || 0
  // the corner a box shows: the roundest of its four, a radius past half its short side draws the same pill
  const corner = (x, r) => { const cs = getComputedStyle(x); return Math.round(Math.min(Math.max(px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomRightRadius), px(cs.borderBottomLeftRadius)), Math.min(r.width, r.height) / 2)) }
  const groundOf = (x) => { for (let p = x.parentElement; p; p = p.parentElement) { const c = ch(getComputedStyle(p).backgroundColor); if (c && c.a > 0.9) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const boxed = (x, cs) => {
    if (['Top', 'Right', 'Bottom', 'Left'].some((s) => px(cs['border' + s + 'Width']) >= 1 && cs['border' + s + 'Style'] !== 'none')) return true
    const f = ch(cs.backgroundColor)
    if (!f || f.a <= 0.5) return false
    const g = groundOf(x)
    return Math.max(Math.abs(f.r - g.r), Math.abs(f.g - g.g), Math.abs(f.b - g.b)) > 6
  }
  const out = []
  for (const e of document.querySelectorAll(${JSON.stringify(BUTTON_SELECTOR)})) {
    if (out.length >= 200) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || !(e.tagName === 'INPUT' ? e.value : e.innerText || '').trim()) continue
    let row = e.parentElement
    while (row && row !== document.body && row.getBoundingClientRect().width <= r.width + 6) row = row.parentElement
    if (!row || row === document.body) continue
    const rr = row.getBoundingClientRect()
    if (Math.abs(rr.top - r.top) > E || Math.abs(rr.bottom - r.bottom) > E) continue
    const corners = []
    for (const x of row.querySelectorAll('*')) {
      if (corners.length >= 40) break
      if (x === e || x.contains(e) || e.contains(x) || /^(INPUT|SELECT|TEXTAREA|OPTION)$/.test(x.tagName)) continue
      const xc = getComputedStyle(x)
      const q = seen(x, xc)
      if (!q || Math.abs(q.top - r.top) > E || Math.abs(q.bottom - r.bottom) > E || !boxed(x, xc)) continue
      // one cell per box: an outline drawn by a link inside its list item counts once
      if (corners.some((c) => c.x.contains(x) || x.contains(c.x))) continue
      corners.push({ x, c: corner(x, q) })
    }
    if (!corners.length) continue
    const cs2 = corners.map((c) => c.c).sort((a, b) => a - b)
    out.push({ path: pathOf(e), at: label(e), text: (e.tagName === 'INPUT' ? e.value : e.innerText).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), radius: corner(e, r), cells: corners.length, rowRadius: cs2[cs2.length >> 1] })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = ROW_SHAPE_LIMITS) {
  const plainOf = byPath(plain?.data)
  const off = (/** @type {any} */ b) => Math.abs(b.radius - b.rowRadius) > t.cornerPx
  const findings = []
  for (const b of worn?.data ?? []) {
    if (!off(b)) continue
    const was = plainOf.get(b.path)
    findings.push({
      at: b.at,
      text: b.text,
      why: `corner ${b.radius}px in a row of ${b.cells} cell(s) of ${b.h}px whose corner is ${b.rowRadius}px`,
      by: was && off(was) ? 'template' : 'system'
    })
  }
  return { count: findings.length, findings }
}
