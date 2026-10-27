/**
 * Colour helpers shared by the preview detectors (a folder, so `index.mjs` does not load it as a kind).
 * Colours are `{ r, g, b, a }` on 0–255, as the probes hand them back.
 */
import { COLOUR_IN_PAGE } from '../../../src/sites/design-system-preview-probe.js'
import { WIDGETS_IN_PAGE } from './widgets.mjs'

/** In the page: the helpers a probe needs, as source to paste at the head of its expression. */
export const PAGE_HELPERS = `
${COLOUR_IN_PAGE}
  const pathOf = (e) => { const out = []; for (let x = e; x && x !== document.body && out.length < 30; x = x.parentElement) { let i = 1; for (let s = x.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === x.tagName) i++; out.unshift(x.tagName.toLowerCase() + ':' + i) } return out.join('/') }
  const label = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')
  const W = document.documentElement.clientWidth
${WIDGETS_IN_PAGE}
  // a box the visitor sees: displayed, not hidden or faded out, not in a closed <details>, on screen; a 1×1
  // absolute box is text for a screen reader (.visually-hidden, .sr-only: JA Morgan's legend, 16/10/2026).
  // seenAny counts a third-party widget too (embed-error judges the embed itself); seen leaves it out
  const seenAny = (e, cs) => { if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; const shut = e.closest('details:not([open])'); if (shut && shut !== e && !e.closest('summary')) return null; const r = e.getBoundingClientRect(); if (cs.position === 'absolute' && r.width <= 1 && r.height <= 1) return null; return r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= W ? null : r }
  // a third-party widget's box is the provider's, never judged (lib/widgets.mjs)
  const seen = (e, cs) => (inWidget(e) ? null : seenAny(e, cs))
`

const lin = (/** @type {number} */ v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** Relative luminance (WCAG). */
export const lum = (/** @type {any} */ c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
/** WCAG contrast of two colours. */
export const ratio = (/** @type {any} */ a, /** @type {any} */ b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Chroma on 0–255 (max − min channel). */
export const chroma = (/** @type {any} */ c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
/** Largest channel distance. */
export const dist = (/** @type {any} */ a, /** @type {any} */ b) =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
export const hex = (/** @type {any} */ c) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
/** `#rrggbb` to a colour, or null. */
export const rgbOf = (/** @type {string} */ h) => {
  const m = /^#?([0-9a-f]{6})/i.exec(String(h ?? ''))
  return m
    ? {
        r: Number.parseInt(m[1].slice(0, 2), 16),
        g: Number.parseInt(m[1].slice(2, 4), 16),
        b: Number.parseInt(m[1].slice(4, 6), 16),
        a: 1
      }
    : null
}

/** The limits the five detectors of D2 judge with. One table. */
export const DETECTOR_LIMITS = Object.freeze({
  /** a colour counts as a brand colour from this chroma (as PREVIEW_LIMITS.keptChroma) */
  brandChroma: 48,
  /** a colour within this channel distance of a system colour is the system's (no neutral loosening) */
  systemTolerance: 24,
  /** the same colour on the plain and the worn page: within this channel distance */
  same: 6,
  /** a stop or a fill is seen from this alpha */
  alpha: 0.5
})

/**
 * Is `c` one of the colours the system paints with? Strict: a channel distance only, so a template's
 * light grey (#f4f5f6) is not taken for a system's cream (#f4efd4).
 * @param {any} c @param {any[]} sys colours of the system
 */
export const ofSystem = (c, sys, t = DETECTOR_LIMITS) => sys.some((s) => dist(c, s) <= t.systemTolerance)

/** The system's colours as `{ r, g, b }`. */
export const systemOf = (/** @type {string[]} */ colours) => (colours ?? []).map(rgbOf).filter(Boolean)

/** Entries by path, for the plain page. */
export const byPath = (/** @type {any[] | undefined} */ list) => new Map((list ?? []).map((x) => [x.path, x]))

/** The outermost entries of a nest (by path prefix). */
export const outermost = (/** @type {any[]} */ list) =>
  list.filter((b) => !list.some((o) => o !== b && b.path.startsWith(`${o.path}/`)))

/**
 * In the page (after PAGE_HELPERS): `rolesOf()`, every resolved `--ds-c-*` of the worn page by name,
 * `[{ name, c }]`, read as `SYSTEM_COLOURS_PROBE` of preview-check.mjs reads them, but keeping the
 * name so a detector can tell a ground role (bg, surface, muted…) from an ink (fg, accent, border).
 * Empty on the plain page (no slot).
 */
export const ROLES_IN_PAGE = `
  const rolesOf = () => {
    const names = new Set()
    const walk = (list) => { for (const r of list) { try { if (r.cssRules) walk(r.cssRules) } catch {} const t = r.style ? r.style.cssText || '' : ''; for (const m of t.matchAll(/--ds-c-[\\w-]+/g)) names.add(m[0]) } }
    for (const sh of document.styleSheets) { try { walk(sh.cssRules) } catch {} }
    for (const e of document.querySelectorAll('[style*="--ds-c-"]')) for (const m of e.getAttribute('style').matchAll(/--ds-c-[\\w-]+/g)) names.add(m[0])
    const out = []
    for (const n of names) {
      if (!getComputedStyle(document.body).getPropertyValue(n).trim()) continue
      // a fresh element per role, no transition, important: a template's * { transition } or
      // i { color: … !important } left every role reading as the body's colour (JA Kinetic Joomla)
      const probe = document.createElement('span')
      probe.style.setProperty('transition', 'none', 'important')
      probe.style.setProperty('color', 'var(' + n + ', rgb(1, 2, 3))', 'important')
      document.body.appendChild(probe)
      const v = getComputedStyle(probe).color
      probe.remove()
      const c = ch(v)
      if (c && v !== 'rgb(1, 2, 3)') out.push({ name: n.slice(7), c })
    }
    return out
  }
`

/**
 * A role that paints a ground (not a text colour, accent, border, link, focus ring or status). `ink` is
 * the system's own dark band (`--ds-c-ink`, Tracy Business EmDash's band-ink and footer): a ground the
 * system designs, never a text colour put on a block; `on-ink` is its text and stays out. `accent-band`
 * is the band painted in the accent (role-variables.mjs: the accent moved until its own button stands
 * out on it, which can take most of its hue, Moxie light's #2e3c58): the call bands of the Tracy themes
 * that read the roles were "off-ground" on every page (16/10/2026); `on-accent-band` stays out.
 */
export const isGroundRole = (/** @type {string} */ name) =>
  /^(bg|surface|ground|card|band|panel|raised|sunken|inverse|overlay|ink|accent-band)(-|$)/.test(String(name))

/** The ground roles of a probe's `roles` list, as colours. */
export const groundsOf = (/** @type {{ name: string, c: any }[] | undefined} */ roles) =>
  (roles ?? []).filter((r) => isGroundRole(r.name)).map((r) => r.c)
