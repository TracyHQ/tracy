/**
 * The template's brand hue kept through a status role (15/10/2026, Tracy Business WordPress). The
 * template paints its orange eyebrows and labels ("ENERGY · 2024", card meta, slide kickers) with its
 * `warn` preset, which is the brand orange. Under a system the status roles are the template's own hues
 * moved a fifth toward the system's text and made readable (tokens56), so those labels stayed orange
 * under Figma's indigo and Moxie's periwinkle. keptText (TPL-1) does not see it: the colour moved a
 * little (more than its "same colour" step) and it is a colour of the system's slot (the status role).
 *
 * A finding is a text that is no status message (no alert, notice, error or success container, no
 * tinted box or side rule of its own hue around it) whose colour, on the worn page, is a status role
 * of the slot (`--ds-c-success`, `--ds-c-warn`, `--ds-c-danger`), keeps the hue of its colour on the
 * template's own page (a brand colour there), whose hue the system's accent does not share, and the
 * template paints that colour on several texts outside messages (a label colour, not one field error).
 * The fix is the template's: a label painted with a status colour as its accent takes the accent. TPL-1.
 */
import { byPath, chroma, DETECTOR_LIMITS, dist, hex, PAGE_HELPERS, ROLES_IN_PAGE } from './lib/colour.mjs'

export const kind = 'status-hue'

const LIMITS = Object.freeze({
  /** the worn colour keeps the plain one's hue within this many degrees */
  sameHue: 20,
  /** the system's accent shares the hue within this many degrees (the system is that hue itself) */
  accentHue: 30,
  /** at most this many texts read per page */
  texts: 400,
  /** a label colour: the template paints this many texts or more with it outside messages (one red
   * field error is a message without a container; the brand orange labels a page many times) */
  repeats: 3
})

export const probe = `(() => {${PAGE_HELPERS}${ROLES_IN_PAGE}
  const roles = rolesOf()
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\\s+/g, ' ').trim()
  const hueOf = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360 }
  const near = (a, b) => a !== null && b !== null && Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) <= 30
  const MESSAGE = '[role=alert], [role=status], [class*=alert], [class*=notice], [class*=error], [class*=warning], [class*=success], [class*=message], [class*=not-valid], [class*=response-output]'
  const texts = []
  for (const e of document.querySelectorAll('body *')) {
    if (texts.length >= ${LIMITS.texts}) break
    const text = own(e)
    if (text.length < 2) continue
    const cs = getComputedStyle(e)
    if (!seen(e, cs)) continue
    const fg = ch(cs.color)
    if (!fg || fg.a < 0.5) continue
    const hue = hueOf(fg)
    // a status message: a container that says so, or a tinted box or side rule of the text's own hue
    let message = !!e.closest(MESSAGE)
    for (let x = e, i = 0; x && x !== document.body && i < 4 && !message; x = x.parentElement, i++) {
      const xs = getComputedStyle(x)
      const bg = ch(xs.backgroundColor)
      if (bg && bg.a > 0.1 && Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) >= 8 && near(hueOf(bg), hue)) message = true
      for (const side of ['Left', 'Top']) {
        const w = parseFloat(xs['border' + side + 'Width']) || 0
        const bc = ch(xs['border' + side + 'Color'])
        if (w >= 2 && bc && near(hueOf(bc), hue)) message = true
      }
    }
    texts.push({ path: pathOf(e), at: label(e), text: text.slice(0, 40), fg, message })
  }
  return { roles, texts }
})()`

/** Hue in degrees, or null for a grey. @param {any} c */
const hueOf = (c) => {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  if (!d) return null
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
/** The angle between two hues. @param {number | null} a @param {number | null} b */
const apart = (a, b) => (a === null || b === null ? 360 : Math.min(Math.abs(a - b), 360 - Math.abs(a - b)))

const STATUS = /^(success|warn|warning|danger|error)$/

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = LIMITS, d = DETECTOR_LIMITS) {
  const roles = worn?.data?.roles ?? []
  const status = roles.filter((/** @type {any} */ r) => STATUS.test(r.name))
  if (!status.length) return { count: 0, findings: [] }
  const accents = roles
    .filter((/** @type {any} */ r) => /^accent(-text)?$/.test(r.name))
    .map((/** @type {any} */ r) => hueOf(r.c))
  const was = byPath(plain?.data?.texts)
  /** how many texts outside messages the template paints with each colour */
  const uses = new Map()
  for (const p of plain?.data?.texts ?? [])
    if (!p.message && p.fg) uses.set(hex(p.fg), (uses.get(hex(p.fg)) ?? 0) + 1)
  const findings = []
  for (const x of worn?.data?.texts ?? []) {
    if (x.message) continue
    const p = was.get(x.path)
    if (!p?.fg || chroma(p.fg) < d.brandChroma || chroma(x.fg) < d.brandChroma / 2) continue
    if ((uses.get(hex(p.fg)) ?? 0) < t.repeats) continue
    const role = status.find((/** @type {any} */ r) => dist(r.c, x.fg) <= d.systemTolerance)
    if (!role) continue
    const hue = hueOf(x.fg)
    if (apart(hue, hueOf(p.fg)) > t.sameHue) continue
    if (accents.some((/** @type {number | null} */ a) => apart(a, hue) <= t.accentHue)) continue
    findings.push({ at: x.at, text: x.text, colour: hex(x.fg), was: hex(p.fg), role: role.name })
  }
  return { count: findings.length, findings }
}
