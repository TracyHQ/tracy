/**
 * The system's accent painted over whole sections, with text on it that does not read (D2 of PR 2,
 * 14/10/2026). An accent is meant in small doses (buttons, a kicker); a role swap that maps a
 * template's section ground to it paints thousands of pixels in it, and the texts on that section
 * keep a colour chosen for the old ground: ja-vital's services band, timetable cards and footnav
 * (about 2,500 px of periwinkle) with labels at 1.07:1 and 1.09:1.
 *
 * A finding is one section (outermost) whose ground is a brand colour of the system, at least
 * `minArea` px², with at least one text on it under `textFloor` (WCAG AA for body text). A loud accent
 * section whose texts all read (Tracy Base's stats band, black on periwinkle at 9:1) is not counted:
 * loud is a taste, unreadable is a defect.
 */
import { chroma, DETECTOR_LIMITS, dist, hex, PAGE_HELPERS, systemOf } from './lib/colour.mjs'

export const kind = 'accent-surface'

/** A section from this many px² (1200 × 150). */
const MIN_AREA = 180000
/** Text on the accent under this contrast does not read. */
const TEXT_FLOOR = 4.5

export const probe = `(() => {${PAGE_HELPERS}
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const out = []
  const H = Math.max(document.documentElement.scrollHeight, 1)
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 80) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width * r.height < ${MIN_AREA}) continue
    const bg = ch(cs.backgroundColor)
    if (!bg || bg.a < 0.9 || cs.backgroundImage !== 'none') continue
    if (Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) < 48) continue
    // the texts on this ground: own text nodes whose nearest opaque ground is this element's fill
    const low = []
    let texts = 0
    for (const x of e.querySelectorAll('*')) {
      if (![...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue
      const xs = getComputedStyle(x)
      if (!seen(x, xs)) continue
      let g = null
      for (let y = x; y && !g; y = y === e ? null : y.parentElement) { const c = ch(getComputedStyle(y).backgroundColor); if (/url\\(|gradient/.test(getComputedStyle(y).backgroundImage)) break; if (c && c.a > 0.9) g = { el: y, c } }
      if (!g || g.el !== e && Math.max(Math.abs(g.c.r - bg.r), Math.abs(g.c.g - bg.g), Math.abs(g.c.b - bg.b)) > 6) continue
      texts++
      const fg = ch(xs.color)
      if (!fg) continue
      const k = ratio(fg, bg)
      if (k < ${TEXT_FLOOR} && low.length < 6) low.push({ text: x.textContent.trim().slice(0, 40), fg, ratio: Math.round(k * 100) / 100 })
    }
    out.push({ path: pathOf(e), at: label(e), area: Math.round(r.width * r.height), height: Math.round(r.height), share: Math.round((r.width * r.height) / (W * H) * 10000) / 10000, bg, texts, low })
  }
  return out
})()`

/** @param {{ worn: any, systemColours: string[], statusColours?: string[] }} input */
export function detect({ worn, systemColours, statusColours = [] }, t = DETECTOR_LIMITS) {
  // the system's accents: its brand colours, not the status colours only the slot's status roles paint
  const status = systemOf(statusColours)
  const accents = systemOf(systemColours).filter(
    (c) => chroma(c) >= t.brandChroma && !status.some((s) => dist(s, c) === 0)
  )
  const onAccent = (worn?.data ?? []).filter((s) => accents.some((a) => dist(a, s.bg) <= t.systemTolerance))
  // the outermost section of a nest of the same accent; a nested one only if its own texts fail
  const findings = onAccent
    .filter((s) => s.low.length)
    .filter(
      (s) =>
        !onAccent.some(
          (o) => o !== s && s.path.startsWith(`${o.path}/`) && o.low.length && dist(o.bg, s.bg) <= t.same
        )
    )
    .map((s) => ({
      at: s.at,
      colour: hex(s.bg),
      height: s.height,
      share: s.share,
      low: s.low.map((/** @type {any} */ x) => ({ text: x.text, colour: hex(x.fg), ratio: x.ratio }))
    }))
  return { count: findings.length, findings }
}
