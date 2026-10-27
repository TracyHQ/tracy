/**
 * Gradient stops left in the template's colours (D2 of PR 2, 14/10/2026). The slot rewrites colour
 * roles, but a gradient is a list of stops, and a stop the role swap misses keeps the template's hue:
 * ja-space's button periwinkle to coral, ja-trip's section headings periwinkle then template cyan and
 * purple, ja-sensei's purple hero, ja-mood's indigo app band. Every stop is judged, not only the first.
 *
 * A stop is the template's when it is a brand colour (chroma), is not a colour of the system, and the
 * plain page painted it (the same element's gradient, or any colour of the plain page). Gradients on
 * text (background-clip: text) count at any size; others from a small area, so a hairline does not.
 *
 * The words a gradient ground carries are judged too: a text drawn straight on a gradient has no flat
 * ground, so the preview probe's CON-2 reading (`lowText`) leaves it out. A text under the CON floor
 * against an opaque stop of its gradient on the worn page, where the plain page read it against every
 * opaque stop of the same gradient, is the system's doing (`by: 'system'`), whatever the stop's colour.
 */
import {
  byPath,
  chroma,
  DETECTOR_LIMITS,
  dist,
  hex,
  ofSystem,
  PAGE_HELPERS,
  ratio,
  rgbOf,
  systemOf
} from './lib/colour.mjs'

export const kind = 'gradient-stop'

/** Smallest box (px²) a gradient that is not on text is judged from. */
const MIN_AREA = 300
/** A neutral template stop this far (contrast) from a system stop of the same gradient is a glare. */
const GLARE_RATIO = 3
/** A gradient ground this large (px²) is judged against the worn page too: a band, not a chip. */
const BAND_AREA = 20000
/** The CON floor (PREVIEW_LIMITS.textFloor, CON-2): a text on a stop under this contrast is unreadable. */
const TEXT_FLOOR = 3
/** At most this many texts are read per gradient ground. */
const MAX_TEXTS = 12

export const probe = `(() => {${PAGE_HELPERS}
  // a stop is rgb()/rgba() or, from a color-mix(), color(srgb …) / oklab(…) / oklch(…)
  const stops = (bi) => (bi.match(/(rgba?|color|oklab|oklch|lab|lch|hsla?)\\([^)]*\\)/g) || []).map(ch).filter(Boolean)
  // the texts drawn straight on e's own gradient: an element with words of its own whose every
  // ancestor up to e has no opaque fill and no picture or gradient of its own
  const onIt = (d, e) => { for (let x = d; x && x !== e; x = x.parentElement) { const c = getComputedStyle(x); if (c.backgroundImage !== 'none') return false; const f = ch(c.backgroundColor); if (f && f.a > 0.9) return false } return true }
  const wordsOn = (e) => {
    const got = []
    for (const d of [e, ...e.querySelectorAll('*')]) {
      if (got.length >= ${MAX_TEXTS}) break
      if (![...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      const dc = getComputedStyle(d)
      if (!seen(d, dc) || !onIt(d, e)) continue
      const fg = ch(dc.color)
      if (fg) got.push({ path: pathOf(d), at: label(d), text: (d.textContent || '').trim().slice(0, 30), fg, size: parseFloat(dc.fontSize) })
    }
    return got
  }
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 400) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    for (const [part, s] of [['', cs], ['::before', getComputedStyle(e, '::before')], ['::after', getComputedStyle(e, '::after')]]) {
      if (part && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue
      if (!/gradient\\(/.test(s.backgroundImage)) continue
      const w = part ? parseFloat(s.width) || r.width : r.width
      const h = part ? parseFloat(s.height) || r.height : r.height
      const clip = /text/.test(s.backgroundClip + ' ' + (s.webkitBackgroundClip || ''))
      out.push({ path: pathOf(e) + part, at: label(e) + part, area: Math.round(w * h), clip, stops: stops(s.backgroundImage), texts: part || clip ? [] : wordsOn(e) })
    }
  }
  return out
})()`

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }, t = DETECTOR_LIMITS) {
  const sys = systemOf(systemColours)
  const plainOf = byPath(plain?.data)
  // every colour the plain page shows: gradient stops, block fills, text colours
  const plainColours = [
    ...(plain?.data ?? []).flatMap((g) => g.stops),
    ...(plain?.base?.blocks ?? []).map((b) => b.bg),
    ...(plain?.base?.texts ?? []).map((x) => x.fg)
  ].filter(Boolean)
  // the worn page's own ground: the system's page colour when the page states it
  const page = rgbOf(worn?.base?.said?.['--ds-c-bg'] ?? '') ?? worn?.base?.page ?? null
  const findings = []
  for (const g of worn?.data ?? []) {
    if (!g.clip && g.area < MIN_AREA) continue
    const was = plainOf.get(g.path)
    // the words on this ground the system made unreadable
    const lost = lostWords(g, was, sys, t)
    const plainHad = (/** @type {any} */ s) =>
      (was?.stops ?? []).some((/** @type {any} */ p) => dist(p, s) <= t.same) ||
      plainColours.some((p) => dist(p, s) <= t.same)
    // the system's own opaque stops in this gradient: a neutral stop of the template's that stands
    // apart from them (3:1 or more) fades the system's ground into the template's own light or dark.
    // JA Kinetic Joomla's closing card under Toggl Track's dark side: the system's purple to the light
    // look's white #ffffff, a glare at the card's foot the flat-colour rules never read (14/10/2026)
    const own = g.stops.filter((/** @type {any} */ s) => s.a >= t.alpha && ofSystem(s, sys, t))
    const left = g.stops.filter(
      (/** @type {any} */ s) =>
        s.a >= t.alpha &&
        !ofSystem(s, sys, t) &&
        plainHad(s) &&
        (chroma(s) >= t.brandChroma ||
          (!g.clip && own.some((/** @type {any} */ o) => ratio(o, s) >= GLARE_RATIO)) ||
          // a band whose gradient has no stop of the system at all: its opaque neutral stop is the
          // template's ground, judged against the worn page. JA Kinetic Joomla's tags masthead under
          // Moxie's dark side kept its #F2F5EE wash on the black page while its title turned light
          // (washed out, 15/10/2026); with no system stop the branch above never ran
          (!g.clip && !own.length && g.area >= BAND_AREA && page && ratio(page, s) >= GLARE_RATIO))
    )
    if (!left.length && !lost.length) continue
    findings.push({
      at: g.at,
      stops: g.stops.filter((/** @type {any} */ s) => s.a >= t.alpha).map(hex),
      template: [...new Set(left.map(hex))],
      half: g.stops.some((/** @type {any} */ s) => s.a >= t.alpha && ofSystem(s, sys, t)),
      text: g.clip,
      ...(lost.length ? { words: lost, by: 'system' } : {})
    })
  }
  return { count: findings.length, findings }
}

/**
 * The texts on gradient `g` (worn) that fall under the CON floor against one of its opaque stops,
 * where the plain page's same text read against every opaque stop of the same gradient. The tags
 * masthead of JA Kinetic Joomla under Moxie's dark side: its title turned cream (#f4efd4) on the
 * template's #f2f5ee wash, 1.0:1, and no detector fired (found by eye, 15/10/2026).
 * @param {any} g @param {any} was @param {any[]} sys
 */
function lostWords(g, was, sys, t = DETECTOR_LIMITS) {
  const opaque = (/** @type {any} */ list) => (list ?? []).filter((/** @type {any} */ s) => s.a >= t.alpha)
  // only the stops the system did not paint: a text on the system's own stop is the system's pairing
  // of its roles, the palette's business (CON-2), not a template stop left behind
  const worn = opaque(g.stops).filter((/** @type {any} */ s) => !ofSystem(s, sys, t))
  if (!worn.length || !g.texts?.length || !was) return []
  const plain = opaque(was.stops)
  const plainText = new Map((was.texts ?? []).map((/** @type {any} */ x) => [x.path, x]))
  const worst = (/** @type {any} */ fg, /** @type {any[]} */ stops) =>
    stops.reduce(
      (/** @type {any} */ low, /** @type {any} */ s) =>
        !low || ratio(fg, s) < low.ratio ? { s, ratio: ratio(fg, s) } : low,
      null
    )
  const out = []
  for (const x of g.texts) {
    if (!x.fg || x.fg.a < t.alpha) continue
    const low = worst(x.fg, worn)
    if (!low || low.ratio >= TEXT_FLOOR) continue
    // the template had it readable: the same text on the plain page clears the floor on every
    // opaque stop of its gradient (or that gradient had no opaque stop under it at all)
    const p = plainText.get(x.path)
    if (!p?.fg) continue
    const before = worst(p.fg, plain)
    if (before && before.ratio < TEXT_FLOOR) continue
    out.push({
      at: x.at,
      text: x.text,
      fg: hex(x.fg),
      stop: hex(low.s),
      ratio: Math.round(low.ratio * 100) / 100
    })
  }
  return out
}
