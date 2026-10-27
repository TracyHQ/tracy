/**
 * Dark buttons the system painted as the lightest thing on their ground (E1 of PR 2, 14/10/2026). A
 * template's dark button (`btn-dark`, `.btn-secondary-dark`, or a neutral fill darker than its ground)
 * is its quiet, heavy button next to the accent one. Under Moxie the slot mapped it to a cream fill: on
 * JA Podcast and JA Prodex Joomla "Start Listening", "Get started" and "View pricing" became the
 * lightest object on the page, louder than the accent button, and "Start Listening" lost its white label
 * on the cream (1.16:1). The role is inverted even where the label still reads.
 *
 * The probe reads each visible button with a label as button-role does: the outermost box hugging it
 * with an opaque fill, its classes, and the first opaque fill beyond it (a picture on the way is passed).
 *
 * `detect` pairs a worn button with its twin on the plain page. The button has the dark role when the
 * plain page says so (a dark class, its fill not clearly lighter than its ground; or a neutral fill clearly
 * darker than its ground). A finding is a dark-role button whose worn fill is lighter than its worn
 * ground and the lightest fill of every button on the worn page.
 */
import { byPath, chroma, DETECTOR_LIMITS, dist, hex, lum, PAGE_HELPERS, ratio } from './lib/colour.mjs'
import { BUTTON_SELECTOR } from './lib/buttons.mjs'

export const kind = 'button-dark'

const HUG = 6

export const DARK_LIMITS = Object.freeze({
  /** a fill is clearly darker or lighter than its ground from this contrast */
  apart: 1.3,
  /** a dark class names the role: btn-dark, btn-black, btn-secondary-dark, btn-outline-dark */
  darkClass: /\bbtn(-[a-z]+)*-(dark|black)\b/,
  /**
   * a light class names the template's white button (btn-white, btn-light, jim-btn--white): white on its light
   * look, which a template's dark look may repaint navy (JA Impact WordPress's "Join our event" and "Donate
   * today", #28354f under its dark mode, 19/10/2026). Its role is the light one: a system that keeps it white
   * did not invert it
   */
  lightClass: /(\bbtn-(white|light)\b|--(white|light)\b)/
})

export const probe = `(() => {${PAGE_HELPERS}
  const opaque = (cs) => { if (/gradient|url\\(/.test(cs.backgroundImage)) return null; const c = ch(cs.backgroundColor); return c && c.a > 0.5 ? c : null }
  const out = []
  for (const e of document.querySelectorAll(${JSON.stringify(BUTTON_SELECTOR)})) {
    if (out.length >= 300) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const text = (e.tagName === 'INPUT' ? e.value : e.innerText || '').trim()
    if (!text) continue
    const layers = [e]
    for (let x = e.parentElement; x && x !== document.body && layers.length < 4; x = x.parentElement) {
      const q = x.getBoundingClientRect()
      if (Math.abs(q.left - r.left) > ${HUG} || Math.abs(q.right - r.right) > ${HUG} || Math.abs(q.top - r.top) > ${HUG} || Math.abs(q.bottom - r.bottom) > ${HUG}) break
      layers.push(x)
    }
    let fill = null
    for (const x of layers) { const c = opaque(getComputedStyle(x)); if (c) fill = c }
    // the first opaque fill under the button; a picture on the way is passed (its colours are unknown)
    let ground = ch(getComputedStyle(document.documentElement).backgroundColor)
    // the words colour of the box that paints the ground: an inverse button takes it as its fill
    let words = ch(getComputedStyle(document.documentElement).color)
    for (let x = layers[layers.length - 1].parentElement; x; x = x.parentElement) { const xs = getComputedStyle(x); const c = ch(xs.backgroundColor); if (c && c.a > 0.9) { ground = c; words = ch(xs.color); break } }
    // the classes of the button and of the boxes that hug it (a block button's wrapper carries the variant)
    const cls = layers.map((x) => (typeof x.className === 'string' ? x.className.trim() : '')).filter(Boolean).join(' ').slice(0, 240)
    out.push({ path: pathOf(e), at: label(e), text: text.slice(0, 30), cls, fill, ground, words })
  }
  return out
})()`

/** Is the button dark on the template's own page? @param {any} b */
export function darkRole(b, t = DARK_LIMITS, d = DETECTOR_LIMITS) {
  if (!b) return false
  // lighter than its ground by a clear step: a btn-dark a shade above a dark band is still the dark one
  const lighter = b.fill && b.ground && lum(b.fill) > lum(b.ground) && ratio(b.fill, b.ground) >= t.apart
  if (t.lightClass.test(String(b.cls ?? ''))) return false
  if (t.darkClass.test(String(b.cls ?? ''))) return !lighter
  return !!(
    b.fill &&
    b.ground &&
    chroma(b.fill) < d.brandChroma &&
    lum(b.fill) < lum(b.ground) &&
    ratio(b.fill, b.ground) >= t.apart
  )
}

/**
 * An inverse button: its fill is the words colour of its own ground on the template's page and on the
 * worn one, so it is as light or as dark as the band's words, not a dark button (16/10/2026). Tracy Base
 * WordPress's call band paints "Start a conversation" in the band's on-accent colour: white on the
 * blue band of its light look, black on the brighter blue of its dark look, white on Figma's indigo.
 * Read on one side, the dark look's black fill took the dark role and the system's white "inverted" it.
 * @param {any} b the worn button @param {any} p its twin on the plain page
 */
export function inverse(b, p, d = DETECTOR_LIMITS) {
  return !!(
    p?.fill &&
    p?.words &&
    b?.fill &&
    b?.words &&
    dist(p.fill, p.words) <= d.same &&
    dist(b.fill, b.words) <= d.same
  )
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data)
  const buttons = worn?.data ?? []
  const top = Math.max(0, ...buttons.filter((b) => b.fill).map((b) => lum(b.fill)))
  const findings = []
  for (const b of buttons) {
    if (!b.fill || !b.ground || !darkRole(was.get(b.path))) continue
    if (inverse(b, was.get(b.path))) continue
    if (lum(b.fill) <= lum(b.ground) || ratio(b.fill, b.ground) < DARK_LIMITS.apart) continue
    if (lum(b.fill) < top - 1e-6) continue
    const p = was.get(b.path)
    findings.push({
      at: `${b.at} "${b.text}"`,
      text: b.text,
      why: `a dark button (${p.fill ? hex(p.fill) : p.cls}) painted ${hex(b.fill)}, the lightest fill of the page, on ${hex(b.ground)}`
    })
  }
  return { count: findings.length, findings }
}
