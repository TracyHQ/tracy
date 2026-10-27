/**
 * Icon controls the system painted into their ground (E3 of PR 2, 14/10/2026). A menu toggle or an
 * icon button draws its glyph with bars (a span with a fill), an SVG, an icon font or a pseudo-element,
 * never with words, so the text rules never look at it. JA Spa Joomla under Moxie: the sidebar
 * hamburger's bars (`span.patty`) took the sidebar's own #1a1a1a, 1:1, and the visitor lost the menu.
 *
 * In the page: every small control with no words (a button, a link, a toggle) and the marks that draw
 * it, each with the ground it sits on: the control's own fill and outline against the ground around
 * it, every bar, border, SVG fill or stroke, icon glyph and pseudo-element inside it against the
 * control's fill (or that ground when it has none). Its visibility is the best contrast of those.
 * A finding is a control that reads under `FLOOR` on the worn page and read at least that on the
 * template's own page (the system made it vanish). Controls over or holding a picture or a gradient
 * are left out: their glyph's ground is not a colour.
 */
import { byPath, PAGE_HELPERS, ratio, hex } from './lib/colour.mjs'

export const kind = 'icon-invisible'

/** WCAG 1.4.11: a control's graphics read from 3:1 against what is next to them. */
const FLOOR = 3

export const probe = `(() => {${PAGE_HELPERS}
  const SEL = 'button, a, [role=button], label, .btn, [class*=toggle], [class*=Toggle], [class*=hamburger], [class*=burger], [class*=menu-btn], [class*=offcanvas], [class*=off-canvas]'
  const opaque = (cs) => { const c = ch(cs.backgroundColor); return c && c.a >= 0.5 && cs.backgroundImage === 'none' ? c : null }
  // the ground around a box: the first opaque fill of its ancestors; null over a picture
  const groundOf = (e) => { for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (/url\\(|gradient/.test(cs.backgroundImage) || /^(IMG|VIDEO|PICTURE)$/.test(x.tagName)) return null; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const glyph = (s) => s.content && !/^(none|normal|""|'')$/.test(s.content)
  const lines = (cs, out) => ['Top', 'Right', 'Bottom', 'Left'].forEach((k) => { const c = ch(cs['border' + k + 'Color']); if ((parseFloat(cs['border' + k + 'Width']) || 0) >= 1 && !/none|hidden/.test(cs['border' + k + 'Style']) && c && c.a >= 0.5) out.push(c) })
  // what draws a glyph inside a control: bars (a fill), lines, SVG paint, an icon font, pseudo-elements
  const marksOf = (x, cs, out, self) => {
    if (!self) { const f = opaque(cs); if (f) out.push(f); lines(cs, out) }
    if (x instanceof SVGElement) { for (const p of ['fill', 'stroke']) { const c = /^url/.test(cs[p]) ? null : ch(cs[p]); if (c && c.a >= 0.5) out.push(c) } }
    if ([...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { const c = ch(cs.color); if (c) out.push(c) }
    for (const part of ['::before', '::after']) {
      const s = getComputedStyle(x, part)
      if (s.content === 'none' || s.content === 'normal' || s.display === 'none' || +s.opacity === 0) continue
      const f = opaque(s); if (f) out.push(f)
      lines(s, out)
      if (glyph(s)) { const c = ch(s.color); if (c) out.push(c) }
    }
  }
  const out = []
  for (const e of document.querySelectorAll(SEL)) {
    if (out.length >= 200) break
    if (e.parentElement && e.parentElement.closest(SEL)) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width < 8 || r.height < 8 || r.width > 200 || r.height > 200) continue
    if ((e.innerText || '').trim().length > 1 || e.querySelector('img, picture, video, canvas, image, input, select, textarea')) continue
    // a submit or button input writes its words in its value, not in a text node: it is a worded
    // button, which the text rules judge (JA Kinetic Joomla's footer Subscribe, black on the light
    // side's blue at 5.8:1, was read as a wordless control at 2.87:1 against the footer, 14/10/2026)
    if (e instanceof HTMLInputElement && /^(submit|button|reset)$/i.test(e.type) && (e.value || '').trim().length > 1) continue
    const ground = groundOf(e.parentElement)
    if (!ground) continue
    // a glyph on a gradient or a picture (a play disc) has a ground the probe cannot read
    if ([e, ...e.querySelectorAll('*')].some((x) => getComputedStyle(x).backgroundImage !== 'none')) continue
    const own = opaque(cs)
    // the control's own fill and outline stand on the ground around it
    const outer = []
    lines(cs, outer)
    if (own) outer.push(own)
    // its glyph, its pseudo-elements and everything inside stand on its fill
    const inner = []
    marksOf(e, cs, inner, true)
    let n = 0
    for (const x of e.querySelectorAll('*')) {
      if (++n > 40) break
      const xs = getComputedStyle(x)
      if (!seen(x, xs)) continue
      marksOf(x, xs, inner, false)
    }
    if (!outer.length && !inner.length) continue
    out.push({ path: pathOf(e), at: label(e), w: Math.round(r.width), h: Math.round(r.height), ground, own, outer, inner })
  }
  return out
})()`

/**
 * How well a control reads: the best contrast of its fill and outline against the ground around it,
 * and of its inner marks against its fill (or that ground).
 * @param {any} x one control of the probe
 */
export const visibility = (x) => {
  const on = x.own ?? x.ground
  const outer = (x.outer ?? []).map((/** @type {any} */ c) => ratio(c, x.ground))
  const inner = (x.inner ?? []).map((/** @type {any} */ c) => ratio(c, on))
  return Math.max(1, ...outer, ...inner)
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data)
  const findings = []
  for (const x of worn?.data ?? []) {
    const v = visibility(x)
    if (v >= FLOOR) continue
    const p = was.get(x.path)
    if (!p || visibility(p) < FLOOR) continue
    findings.push({
      at: x.at,
      size: `${x.w}×${x.h}`,
      ratio: Math.round(v * 100) / 100,
      was: Math.round(visibility(p) * 100) / 100,
      ground: hex(x.own ?? x.ground)
    })
  }
  return { count: findings.length, findings }
}
