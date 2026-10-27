/**
 * Whether a vendored fixture can be shown dark by overriding its tokens — pure rules, no DOM.
 *
 * `DARK_OVERRIDES` (design-system plugin) repaints the 56 shared tokens, `body` and `.page`. What it
 * cannot reach is a LITERAL colour in the author's CSS: a `#ffffff` input on a dark page is a white
 * block, a `#111` heading on a dark page is ink on ink. Measured 06/09 over 152 fixtures: 113 have
 * no such literal outside the paper wrapper, 39 do. This module is the judge; `build-od-dark.mjs`
 * writes its verdicts to `dark.json`, and the dialog reads them as `direction.dark`.
 */
const NAMED = {
  white: '#ffffff',
  black: '#000000',
  ivory: '#fffff0',
  beige: '#f5f5dc',
  snow: '#fffafa',
  linen: '#faf0e6',
  cream: '#fffdd0',
  whitesmoke: '#f5f5f5',
  gainsboro: '#dcdcdc',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  navy: '#000080'
}
export function parseColor(tok) {
  tok = tok.trim().toLowerCase()
  if (NAMED[tok]) tok = NAMED[tok]
  let m
  if ((m = /^#([0-9a-f]{3,8})$/.exec(tok))) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a
    }
  }
  if ((m = /^rgba?\(([^)]+)\)$/.exec(tok))) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (p.length < 3 || p.some(isNaN)) return null
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
  }
  if ((m = /^hsla?\(([^)]+)\)$/.exec(tok))) {
    const p = m[1]
      .replace(/%/g, '')
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (p.length < 3 || p.some(isNaN)) return null
    const [h, s, l] = [p[0] / 360, p[1] / 100, p[2] / 100]
    const f = (n) => {
      const k = (n + h * 12) % 12
      const a = s * Math.min(l, 1 - l)
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: p[3] ?? 1 }
  }
  return null
}
export function luminance({ r, g, b }) {
  const c = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
/** Every literal colour token in a CSS value (hex, rgb(), hsl(), a few names). `var(...)` is not literal. */
export function literalColors(value) {
  const out = []
  for (const m of value.matchAll(
    /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|ivory|beige|snow|linen|cream|whitesmoke|gainsboro|silver|lightgr[ae]y|gr[ae]y|navy)\b/gi
  )) {
    const c = parseColor(m[0])
    if (c) out.push(c)
  }
  return out
}
/** The `<style>` rules of a fixture as [selector, declarations], plus inline `style=` as ['@inline', decl]. */
export function rulesOf(html) {
  const rules = []
  for (const st of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = st[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@media[^{]*\{/g, '')
      .replace(/@keyframes[^{]*\{[\s\S]*?\}\s*\}/g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push([m[1].trim(), m[2]])
  }
  for (const m of html.matchAll(/style="([^"]*)"/gi)) rules.push(['@inline', m[1]])
  return rules
}
const PAPER = /^(html|body|\.page)(\s*,\s*(html|body|\.page))*$/
/**
 * Why a fixture cannot simply be turned dark: literal paints the token override does not reach.
 * A LIGHT literal background (luminance ≥ 0.5, opaque enough) outside the paper wrapper becomes a
 * light block on a dark page; a DARK literal text colour (luminance ≤ 0.25) becomes ink on ink.
 */
export function darkReport(html) {
  const lightBg = [],
    darkText = []
  for (const [sel, decl] of rulesOf(html)) {
    if (PAPER.test(sel)) continue
    // `color-mix(... var(--x) ...)` follows the token it mixes with; the literal in it is a tint.
    for (const d of decl.split(';')) {
      const i = d.indexOf(':')
      if (i < 0) continue
      const prop = d.slice(0, i).trim().toLowerCase(),
        val = d.slice(i + 1)
      if (/color-mix\(/i.test(val)) continue
      if (/^background(-color|-image)?$/.test(prop))
        for (const c of literalColors(val)) {
          if (c.a >= 0.5 && luminance(c) >= 0.5)
            lightBg.push(`${sel.slice(0, 40)} ${val.trim().slice(0, 40)}`)
        }
      else if (prop === 'color')
        for (const c of literalColors(val)) {
          if (c.a >= 0.5 && luminance(c) <= 0.25)
            darkText.push(`${sel.slice(0, 40)} ${val.trim().slice(0, 30)}`)
        }
    }
  }
  return { safe: lightBg.length === 0 && darkText.length === 0, lightBg, darkText }
}
