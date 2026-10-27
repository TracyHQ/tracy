/**
 * Headings the system made quieter than the body text on their own ground (E1 of PR 2, 14/10/2026).
 * Under Moxie JA Phio's hero headline (BRAND / EXPERIENCE / STUDIO) and JA Prodex's hero went to a
 * khaki dimmer than the cream body text beside them: the biggest type of the page became the dullest.
 * It can come from the system's own heading colour, so the rule (HIER-2) is worth fixing, not
 * blocking, but /ops says it.
 *
 * The probe reads every heading (h1 to h3, the .h1 to .h3 and display classes, a headline class, or
 * any text of 32px and up) with words of its own, and the body text (runs of 20 characters and more
 * under 24px, whatever box holds them) per ground:
 * for each opaque ground under it, the colour that carries the most characters.
 *
 * `detect` pairs a worn heading with its twin on the plain page and compares it with the dominant body
 * text on the same ground of the same page. A finding is a heading under `QUIET` of that body text's
 * contrast on the worn page that read at least as strongly as the body text on the plain page.
 */
import {
  byPath,
  chroma,
  DETECTOR_LIMITS,
  dist,
  hex,
  PAGE_HELPERS,
  ratio,
  rgbOf,
  ROLES_IN_PAGE
} from './lib/colour.mjs'

export const kind = 'heading-quiet'

/** a heading is quieter when its contrast is under this share of the body text's on its ground */
export const QUIET = 0.8

const HEADING =
  'h1, h2, h3, .h1, .h2, .h3, .display-1, .display-2, .display-3, .display-4, [class*="headline"], [class*="hero-title"]'

export const probe = `(() => {${PAGE_HELPERS}${ROLES_IN_PAGE}
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\\s+/g, ' ').trim()
  const hx = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  // the first opaque fill under the words; none over a picture on the way: its colours are unknown, and the
  // fill under it is not what the words are read on (JA Resort's masthead heading, white on its photo, was
  // judged on the section the system repainted white, 16/10/2026)
  const groundOf = (e) => { for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (/url\\(|gradient/.test(cs.backgroundImage)) return null; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return pictureUnder(e, x) ? null : c } return pictureUnder(e, document.documentElement) ? null : ch(getComputedStyle(document.documentElement).backgroundColor) }
  const headings = []
  const body = {}
  for (const e of document.querySelectorAll('body *')) {
    if (headings.length >= 200) break
    const text = own(e)
    if (text.length < 2 || e.closest('a, button, nav, header, footer')) continue
    const cs = getComputedStyle(e)
    if (!seen(e, cs)) continue
    const fg = ch(cs.color)
    const ground = groundOf(e)
    if (!fg || !ground) continue
    if (e.matches(${JSON.stringify(HEADING)}) || parseFloat(cs.fontSize) >= 32) {
      headings.push({ path: pathOf(e), at: label(e), text: text.slice(0, 40), fg, ground, size: Math.round(parseFloat(cs.fontSize)) })
    } else if (text.length >= 20 && parseFloat(cs.fontSize) < 24) {
      // body text: a run of words in a small size, whatever box holds it (JA Phio's hero copy is a div)
      const g = hx(ground)
      const k = hx(fg)
      body[g] = body[g] || {}
      body[g][k] = (body[g][k] || 0) + text.length
    }
  }
  // per ground, the body colour that carries the most characters
  const dominant = {}
  for (const [g, m] of Object.entries(body)) { const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; dominant[g] = { fg: top[0], chars: top[1] } }
  // the system's accent roles on the worn page (none on the plain page): a heading in the accent is one
  // the rule's own fix allows
  const accents = rolesOf().filter((r) => /^accent(-text)?(-hover)?$/.test(r.name)).map((r) => r.c)
  return { headings, body: dominant, accents }
})()`

/** The body text a heading is judged against: the dominant one on its ground. @param {any} data @param {any} h */
const bodyOf = (data, h) => {
  const b = data?.body?.[hex(h.ground)]
  return b ? rgbOf(b.fg) : null
}

/** Large text reads from this contrast (WCAG AA for 24px, or 18.67px bold). */
const LARGE = 3

/**
 * A heading the template paints in its accent (a brand colour on its page) that wears the system's
 * accent, readable as large text: the accent is what the rule's fix asks for besides the full text
 * colour. JA Kinetic WordPress's feature numerals ("01" to "06", 34px) are its lime accent on its dark
 * page and Figma's accent text (#7e7bf8, 4.66:1) under its dark side: the accent, not a muted role,
 * read as "quieter than the body" (16/10/2026).
 * @param {any} h the worn heading @param {any} p its twin on the plain page @param {any[] | undefined} accents
 */
export function accented(h, p, accents, d = DETECTOR_LIMITS) {
  return (
    chroma(p.fg) >= d.brandChroma &&
    (accents ?? []).some((a) => dist(a, h.fg) <= d.same) &&
    ratio(h.fg, h.ground) >= LARGE
  )
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data?.headings)
  const findings = []
  for (const h of worn?.data?.headings ?? []) {
    const p = was.get(h.path)
    if (!p || p.text !== h.text) continue
    const wb = bodyOf(worn.data, h)
    const pb = bodyOf(plain.data, p)
    if (!wb || !pb) continue
    const mine = ratio(h.fg, h.ground)
    const theirs = ratio(wb, h.ground)
    if (mine >= QUIET * theirs || ratio(p.fg, p.ground) < ratio(pb, p.ground)) continue
    if (accented(h, p, worn.data.accents)) continue
    findings.push({
      at: `${h.at} "${h.text.slice(0, 32)}"`,
      text: h.text,
      why: `${hex(h.fg)} reads ${mine.toFixed(2)}:1 where the body text on its ground (${hex(wb)}) reads ${theirs.toFixed(2)}:1`
    })
  }
  return { count: findings.length, findings }
}
