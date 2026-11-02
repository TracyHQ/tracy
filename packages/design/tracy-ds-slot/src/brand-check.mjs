/**
 * Brand mode measured on a built site (ADR 0031 revision 02/11/2026, BRAND-3): what `scripts/brand-measure.mjs`
 * reads off each page under a brand id, and the judge the readiness check scores the file with.
 *
 * The door (src/brand.mjs) promises three things on every template, and only a built site shows whether the
 * template's own sheets keep them:
 *   1. accent words read at 4.5:1 (3:1 when large) on the ground under them, in the brand's own hue: never
 *      the body text colour standing in for an accent that does not read (JA Boxing, 02/11/2026);
 *   2. a shape filled with the accent (a button, its border) stands out from its ground at 3:1;
 *   3. no template accent is left painted (a literal the slot does not reach), inside a kept band or out.
 *
 * File `brand-measurement.json` (schema tracy-brand-measurement/v1), beside design-system-measurement.json in
 * the contract folder of the version: { schema, tag, version, template, measuredAt, machine, templateAccents,
 * runs: [{ id, accent, side, page, spots: [{ scope, words: [{ text, colour, ground, ratio, need }],
 * fills: [{ el, colour, ground, ratio }], left: [{ el, prop, value }] }] }] }. PURE.
 */
import { contrast, parseHex } from './colour.mjs'

export const BRAND_MEASUREMENT_SCHEMA = 'tracy-brand-measurement/v1'

/** Hue (degrees) and saturation (0..1, HSL) of a #rrggbb colour. */
export function hueSat(/** @type {string} */ hex) {
  const c = parseHex(hex)
  if (!c) return null
  const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d === 0) return { hue: null, sat: 0 }
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { hue: (h * 60 + 360) % 360, sat }
}

/** How far a hue may drift (degrees) and how grey a colour may turn before it no longer carries the brand hue. */
export const HUE_DRIFT = 25
export const GREY = 0.08

/** Whether `colour` still carries the hue of `accent` (an accent with no hue of its own: always). */
export function keepsHue(/** @type {string} */ colour, /** @type {string} */ accent) {
  const a = hueSat(accent)
  const c = hueSat(colour)
  if (!a || !c || a.hue === null || a.sat < 0.15) return true
  if (c.hue === null || c.sat < GREY) return false
  const d = Math.abs(c.hue - a.hue)
  return Math.min(d, 360 - d) <= HUE_DRIFT
}

/**
 * In the page: per scope (the page outside the kept bands, then each kept band present), the accent words, the
 * accent fills and any template accent left. `scopes`: the kept band selectors; `accents`: the template accent
 * hexes. Returns { side, spots }.
 * @param {string[]} scopes @param {string[]} accents
 */
export const brandProbe = (scopes, accents) => `(() => {
  const SCOPES = ${JSON.stringify(scopes)}
  const ACCENTS = ${JSON.stringify(accents)}
  const P = (s) => (String(s).match(/[\\d.]+/g) || []).map(Number)
  // a custom property reads back as written (#4f665b), a computed colour as rgb(): both to [r, g, b(, a)]
  const C = (s) => { const t = String(s).trim(); const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t); if (!m) return P(t); const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }
  const hex = (v) => '#' + v.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
  const opaque = (v) => v.length >= 3 && (v[3] === undefined || v[3] > 0.5)
  const same = (a, b) => a && b && Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i]))) <= 2
  const lum = (v) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]) }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2) }
  const groundOf = (e) => { for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/url\\(/.test(cs.backgroundImage)) return null; const v = P(cs.backgroundColor); if (opaque(v)) return v } return [255, 255, 255] }
  const seen = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width >= 1 && r.height >= 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0 }
  const name = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim() || (e.tagName === 'INPUT' && /^(submit|button)$/.test(e.type) ? e.value : '')
  const tpl = ACCENTS.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
  const kept = SCOPES.flatMap((s) => [...document.querySelectorAll(s)])
  const inKept = (e) => kept.some((k) => k !== e && k.contains(e))
  const spot = (root, scope, skipKept) => {
    const cs = getComputedStyle(root)
    const accent = C(cs.getPropertyValue('--ds-c-accent')), text = C(cs.getPropertyValue('--ds-c-accent-text'))
    const out = { scope, words: [], fills: [], left: [] }
    for (const e of [root, ...root.querySelectorAll('*')]) {
      if ((skipKept && inKept(e)) || !seen(e)) continue
      const s = getComputedStyle(e)
      const t = own(e)
      const fg = P(s.color)
      if (t && text.length >= 3 && same(fg, text)) {
        const g = groundOf(e)
        if (g) { const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700); out.words.push({ text: t.slice(0, 40), colour: hex(fg), ground: hex(g), ratio: ratio(fg, g), need: large ? 3 : 4.5 }) }
      }
      const bg = P(s.backgroundColor)
      if (accent.length >= 3 && opaque(bg) && same(bg, accent)) {
        const g = e.parentElement ? groundOf(e.parentElement) : null
        if (g) out.fills.push({ el: name(e), colour: hex(bg), ground: hex(g), ratio: ratio(bg, g) })
      }
      for (const p of ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'fill', 'stroke']) {
        const v = P(s.getPropertyValue(p))
        if (!opaque(v) || !tpl.some((c) => same(c, v))) continue
        if (p === 'color' && !t) continue
        if (p.startsWith('border') && parseFloat(s.getPropertyValue(p.replace('color', 'width'))) === 0) continue
        out.left.push({ el: name(e), prop: p, value: hex(v) })
      }
    }
    for (const k of ['words', 'fills', 'left']) out[k] = out[k].slice(0, 60)
    return out
  }
  const side = document.body.classList.contains('dark-active') || document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const spots = [spot(document.body, 'page', true)]
  for (const s of SCOPES) { const el = document.querySelector(s); if (el && seen(el)) spots.push(spot(el, s, false)) }
  return { side, spots }
})()`

/**
 * What a measured run breaks of the door's three promises, one line each.
 * @param {{ id: string, accent: string, side: string, page: string, spots: any[] }} run
 * @returns {string[]}
 */
export function brandRunFindings(run) {
  const out = []
  const at = (/** @type {any} */ s) =>
    `${run.id} ${run.side} ${run.page}${s.scope === 'page' ? '' : ` ${s.scope}`}`
  for (const s of run.spots ?? []) {
    for (const w of s.words ?? [])
      if (w.ratio < w.need)
        out.push(
          `${at(s)}: accent words "${w.text}" ${w.colour} on ${w.ground} read ${w.ratio}:1 (need ${w.need}:1)`
        )
    const lost = (s.words ?? []).find((/** @type {any} */ w) => !keepsHue(w.colour, run.accent))
    if (lost)
      out.push(`${at(s)}: accent words "${lost.text}" ${lost.colour} lost the brand hue of ${run.accent}`)
    for (const f of s.fills ?? [])
      if (f.ratio < 3)
        out.push(`${at(s)}: ${f.el} filled ${f.colour} on ${f.ground} stands out ${f.ratio}:1 (need 3:1)`)
    for (const l of (s.left ?? []).slice(0, 3))
      out.push(`${at(s)}: ${l.el} still paints the template accent ${l.value} (${l.prop})`)
  }
  return out
}

/**
 * The whole file judged: findings over every run, or the reason it cannot be scored.
 * @param {any} doc
 * @returns {{ ok: boolean, findings: string[], runs: number, problem: string | null }}
 */
export function judgeBrandMeasurement(doc) {
  if (!doc || doc.schema !== BRAND_MEASUREMENT_SCHEMA || !Array.isArray(doc.runs) || doc.runs.length === 0)
    return { ok: false, findings: [], runs: 0, problem: `not a ${BRAND_MEASUREMENT_SCHEMA} file with runs` }
  const findings = doc.runs.flatMap(brandRunFindings)
  return { ok: findings.length === 0, findings, runs: doc.runs.length, problem: null }
}

/** Contrast of two hexes, two decimals (for scripts that print a run). */
export const ratioOf = (/** @type {string} */ a, /** @type {string} */ b) => +(contrast(a, b) ?? 0).toFixed(2)
