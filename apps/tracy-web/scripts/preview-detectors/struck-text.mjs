/**
 * Words a drawn line now runs through (CON-2, Akemi 14/10/2026). JA Kinetic's "From alert to resolved"
 * timeline draws a 2px connector across each step (`.hx-inc-line`, the template's --border) behind its
 * node and its time label (t+0s, t+30s…). On the template's page that line is a hairline barely apart
 * from its ground (1.1:1), so the labels read clean; under Figma (black borders) or Moxie dark (cream
 * borders) the same line became a hard stroke through every label, on WordPress and Joomla alike. Every
 * colour was the system's, so no colour rule read it.
 *
 * The probe reads every LINE of the page (a visible box at most `thin` px across, `minLength` px or
 * more long, painted with an opaque fill or border and holding no words) and every run of WORDS whose
 * box the line crosses through its middle (not along an edge, which is an underline or a rule
 * between blocks), with nothing opaque of their own between them and the line (a label on its own
 * chip masks the line: not struck). For each crossing: the line's colour and
 * its contrast with the ground under it.
 *
 * `detect` pairs each worn crossing with the same one on the template's page: a finding is a line that
 * stands out from its ground (`STRUCK.lineRatio` or more) through words the template's line did not
 * strike as hard (its own crossing under the limit, or no line there at all).
 */
import { hex, PAGE_HELPERS, ratio } from './lib/colour.mjs'

export const kind = 'struck-text'

export const STRUCK = Object.freeze({
  /** a line this far apart from its ground reads as a stroke through words (a hairline is ~1.1:1) */
  lineRatio: 1.5,
  /** a line is at most this thick */
  thin: 3,
  /** and at least this long */
  minLength: 24,
  /** it crosses the words between these shares of their height (an underline sits outside) */
  band: [0.2, 0.8]
})

export const probe = `(() => {${PAGE_HELPERS}
  const T = ${JSON.stringify(STRUCK)}
  const opaque = (c) => c && c.a > 0.5
  const groundOf = (e) => { for (let x = e; x; x = x.parentElement) { const c = ch(getComputedStyle(x).backgroundColor); if (c && c.a > 0.9) return c } return ch(getComputedStyle(document.documentElement).backgroundColor) }
  const lines = []
  for (const e of document.querySelectorAll('body *')) {
    if (lines.length >= 400) break
    if (e.textContent.trim()) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const flat = r.height <= T.thin && r.width >= T.minLength
    const tall = r.width <= T.thin && r.height >= T.minLength
    if (!flat && !tall) continue
    const fill = ch(cs.backgroundColor)
    const edge = flat ? ch(cs.borderTopColor) : ch(cs.borderLeftColor)
    const edgeW = parseFloat(flat ? cs.borderTopWidth : cs.borderLeftWidth)
    const c = opaque(fill) ? fill : edgeW >= 1 && opaque(edge) ? edge : null
    if (!c) continue
    lines.push({ e, r, c, flat, ground: groundOf(e.parentElement) })
  }
  const crossings = []
  if (lines.length) for (const t of document.querySelectorAll('body *')) {
    if (crossings.length >= 60) break
    const words = [...t.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
    if (!words.length) continue
    const cs = getComputedStyle(t)
    if (!seen(t, cs)) continue
    const range = document.createRange()
    range.selectNodeContents(t)
    const b = range.getBoundingClientRect()
    if (b.width < 1 || b.height < 4) continue
    for (const l of lines) {
      if (l.e.contains(t) || t.contains(l.e)) continue
      const x0 = Math.max(b.left, l.r.left), x1 = Math.min(b.right, l.r.right)
      const y0 = Math.max(b.top, l.r.top), y1 = Math.min(b.bottom, l.r.bottom)
      if (x1 - x0 < 2 || y1 - y0 <= 0) continue
      const mid = l.flat ? (l.r.top + l.r.bottom) / 2 : (l.r.left + l.r.right) / 2
      const lo = l.flat ? b.top + T.band[0] * b.height : b.left + T.band[0] * b.width
      const hi = l.flat ? b.top + T.band[1] * b.height : b.left + T.band[1] * b.width
      if (mid < lo || mid > hi) continue
      // nothing of the words' own (a chip, a label ground) between them and the line masks it
      let masked = false
      for (let x = t; x && !x.contains(l.e); x = x.parentElement) if (opaque(ch(getComputedStyle(x).backgroundColor))) { masked = true; break }
      if (masked) continue
      const text = words.map((n) => n.textContent).join(' ').replace(/\\s+/g, ' ').trim()
      crossings.push({ path: pathOf(t), at: label(t), text: text.slice(0, 40), line: pathOf(l.e), c: l.c, ground: l.ground })
      break
    }
  }
  return { crossings }
})()`

/** How hard one crossing strikes: the line's contrast with its ground. @param {any} x */
export const strike = (x) => (x?.c && x?.ground ? ratio(x.c, x.ground) : 0)

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = new Map((plain?.data?.crossings ?? []).map((x) => [x.path, x]))
  const findings = []
  for (const x of worn?.data?.crossings ?? []) {
    const now = strike(x)
    if (now < STRUCK.lineRatio) continue
    const p = was.get(x.path)
    const then = p && p.text === x.text ? strike(p) : 0
    if (then >= STRUCK.lineRatio) continue
    findings.push({
      at: `${x.at} "${x.text.slice(0, 24)}"`,
      why: `a line (${hex(x.c)}, ${now.toFixed(2)}:1 on its ground) runs through the words; ${then ? `the template's reads ${then.toFixed(2)}:1` : 'the template draws none there'}`
    })
  }
  return { count: findings.length, findings }
}
