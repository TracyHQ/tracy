/**
 * Buttons and links whose hover or focus state the system made unreadable (E3 of PR 2, 14/10/2026).
 * Every other check reads the page at rest; a state rule (`.btn-outline-dark:hover`) is only seen
 * when the pointer is on it. JA Seven Joomla under Moxie: "Start your project now" turns cream with
 * white words on hover, 1.16:1, and the label disappears under the visitor's pointer.
 *
 * The preview runs no script, so the probe does not move a pointer: it reads the stylesheets (CSSOM)
 * and gives every `:hover` / `:focus` / `:focus-visible` rule a twin right after it, on a class
 * (`.__tdsr-on`), so cascade order and specificity stay the template's. Transitions are switched off
 * while it reads. Then, button by button (and link by link), it puts that class on the element and its
 * ancestors (a card's hover reaches its button), reads the words' colour and the ground they sit on,
 * and takes the class off again. The twins stay in the sheets, matching nothing.
 *
 * A finding is an element that reads at least `FLOOR` at rest and under it in its state on the worn
 * page, whose state read at least `FLOOR` on the template's own page.
 *
 * Each reading also carries `cue`, what else the state may change (underline, border, shadow, ring, lift,
 * opacity), for hover-same (HOVER-2), which judges this probe's data: a state that looks exactly like rest.
 */
import { byPath, hex, PAGE_HELPERS, ratio } from './lib/colour.mjs'
import { BUTTON_SELECTOR } from './lib/buttons.mjs'

export const kind = 'hover-unreadable'

/** CON-2's floor: words that no longer read. */
const FLOOR = 3

const ON = '__tdsr-on'

/**
 * In the page: what else a state may change besides the words and their ground (hover-same reads it: an
 * underline, a border on any side, a shadow, a ring, a lift is a visible hover even when no colour
 * moves). Its own source, so a test can run it on stand-in computed styles.
 */
export const CUE_OF = `(e, w) => { const a = getComputedStyle(e); const b = getComputedStyle(w); return [b.textDecorationLine, b.textDecorationColor, a.borderTopWidth !== '0px' || a.borderBottomWidth !== '0px' || a.borderLeftWidth !== '0px' || a.borderRightWidth !== '0px' ? a.borderColor : '', a.boxShadow, a.outlineStyle === 'none' ? '' : a.outlineColor + ' ' + a.outlineWidth, a.transform, a.opacity].join('|') }`

export const probe = `(() => {${PAGE_HELPERS}
  const still = document.createElement('style')
  still.textContent = '*, *::before, *::after { transition: none !important; animation: none !important }'
  document.head.appendChild(still)
  if (!window.__tdsrTwins) {
    window.__tdsrTwins = 1
    const twin = (sel) => sel.replace(/:(hover|focus-visible|focus)(?![\\w-])/g, '.${ON}')
    const walk = (list, owner) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i]
        // a group rule (@media) and a style rule holding nested rules alike: the slot sheet nests its
        // band states (:where(:not(.btn)) { .tb-topbar a:hover& {...} }), which no twin reached before
        if (r.cssRules && r.cssRules.length) { try { walk(r.cssRules, r) } catch {} }
        if (r.cssRules && !r.selectorText) continue
        if (!r.selectorText || !/:(hover|focus)(?![\\w-])|:focus-visible/.test(r.selectorText)) continue
        try { owner.insertRule(twin(r.selectorText) + '{' + r.style.cssText + '}', i + 1) } catch {}
      }
    }
    for (const sh of document.styleSheets) { try { walk(sh.cssRules, sh) } catch {} }
  }
  const blend = (c, under) => c.a >= 0.99 ? c : { r: c.r * c.a + under.r * (1 - c.a), g: c.g * c.a + under.g * (1 - c.a), b: c.b * c.a + under.b * (1 - c.a), a: 1 }
  // the ground words sit on: the fills from the element up to the first opaque one, blended; null
  // when a picture or a gradient comes first (a page's hatch far behind an opaque band does not count)
  const groundOf = (e) => {
    const fills = []
    let g = { r: 255, g: 255, b: 255, a: 1 }
    for (let x = e; x; x = x.parentElement) {
      const cs = getComputedStyle(x)
      if (/url\\(|gradient/.test(cs.backgroundImage) || /^(IMG|VIDEO|PICTURE)$/.test(x.tagName)) return null
      const c = ch(cs.backgroundColor)
      if (c && c.a > 0.9) { g = c; break }
      if (c && c.a > 0.05) fills.push(c)
    }
    for (const c of fills.reverse()) g = blend(c, g)
    return g
  }
  const wordsOf = (e) => { if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return e; for (const x of e.querySelectorAll('*')) if ([...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return x; return null }
  const cueOf = ${CUE_OF}
  const read = (e, w) => { const g = groundOf(w); const c = ch(getComputedStyle(w).color); return g && c ? { fg: blend(c, g), bg: g, cue: cueOf(e, w) } : null }
  const ancestors = (e) => { const out = []; for (let x = e; x && x !== document.documentElement; x = x.parentElement) out.push(x); return out }
  const out = []
  const done = new Set()
  for (const e of document.querySelectorAll('${BUTTON_SELECTOR}, a[href]')) {
    if (out.length >= 300) break
    if (done.has(e) || (e.parentElement && e.parentElement.closest('${BUTTON_SELECTOR}'))) continue
    done.add(e)
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width < 8 || r.height < 8) continue
    const w = wordsOf(e)
    const text = w ? (w.textContent || '').trim() : ''
    if (!w || text.length < 2) continue
    const rest = read(e, w)
    if (!rest) continue
    const chain = ancestors(e)
    for (const x of chain) x.classList.add('${ON}')
    const on = read(e, w)
    for (const x of chain) x.classList.remove('${ON}')
    if (!on) continue
    out.push({ path: pathOf(e), at: label(e), text: text.slice(0, 40), rest, on })
  }
  still.remove()
  return out
})()`

const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data)
  const findings = []
  for (const x of worn?.data ?? []) {
    const rest = ratio(x.rest.fg, x.rest.bg)
    const on = ratio(x.on.fg, x.on.bg)
    if (rest < FLOOR || on >= FLOOR) continue
    const p = was.get(x.path)
    if (!p || ratio(p.on.fg, p.on.bg) < FLOOR) continue
    findings.push({
      at: `${x.at} "${x.text.slice(0, 32)}"`,
      ratio: r2(on),
      rest: r2(rest),
      was: r2(ratio(p.on.fg, p.on.bg)),
      colour: hex(x.on.fg),
      ground: hex(x.on.bg)
    })
  }
  return { count: findings.length, findings }
}
