/**
 * A brand logo never wears a design system: the wordmark's face, the mark's paint and the site title
 * stay the template's under every system (JA Kinetic WordPress, 15/10/2026: the header wordmark
 * "Kinetic" turned into Moxie's serif because its rule read the display face role). PURE.
 */

// A class or id that names the brand itself: the logo, the wordmark, the site title. A colour utility
// (`btn-brand`, `text-brand-primary`) names the brand COLOUR, which is the accent role, not the logo.
const BRAND_NAME = /(^|[-_])(brand|branding|logo|wordmark|site-title|site-logo|custom-logo)([-_]|$)/i
const BRAND_COLOUR_UTILITY =
  /^(bg|text|border|btn|button|fill|stroke|ring|outline|from|via|to|shadow|accent|link|is|has)-|[-_](colou?r|primary|secondary|accent|bg|background|text|light|dark)$/i
// only `brand` is also a colour's name; a logo, a wordmark or a site title is always the logo itself
const isBrandName = (name) => {
  const m = BRAND_NAME.exec(name)
  if (!m) return false
  return !/^brand/i.test(m[2]) || !BRAND_COLOUR_UTILITY.test(name)
}
// the attributes of a markup tag that name what it is
const BRAND_ATTR = /\b(?:class|className|alt|aria-label|id)\s*=\s*\{?\s*["'`]([^"'`]*)["'`]/g
const REASON = 'brand logo: the wordmark, mark and site title keep the template look under every system'

/** The class/id names of the compound a selector paints: from the right, the first compound that has
 * one (`.tracy-brand a` → the `.tracy-brand` of the link inside the site title). */
function subjectNames(selector) {
  const compounds = selector
    .replace(/\[[^\]]*\]|::?[\w-]+(\([^)]*\))?/g, ' ')
    .split(/[\s>+~]+/)
    .filter(Boolean)
  for (let i = compounds.length - 1; i >= 0; i--) {
    const names = [...compounds[i].matchAll(/[.#]([\w-]+)/g)].map((m) => m[1])
    if (names.length) return names
  }
  return []
}

/**
 * A finding is brand when every selector of its rule paints a logo, brand or site-title element, or,
 * in markup, when the tag's class, id, alt or aria-label names one. A palette variable
 * (`--brand-primary`) is the accent, never the logo.
 * @param {{ selector?: string, kind?: string, lineText?: string, classString?: string }} f
 * @returns {string | null} the keep reason, or null
 */
export function brandKeepOf(f) {
  if (f.kind === 'custom') return null
  const sel = (f.selector ?? '').trim()
  if (sel) {
    const parts = sel
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return parts.length && parts.every((p) => subjectNames(p).some(isBrandName)) ? REASON : null
  }
  const attrs = [...String(f.lineText ?? '').matchAll(BRAND_ATTR)].map((m) => m[1])
  if (f.classString) attrs.push(f.classString)
  const words = attrs.flatMap((a) => a.split(/\s+/)).filter(Boolean)
  return words.some(isBrandName) ? REASON : null
}
