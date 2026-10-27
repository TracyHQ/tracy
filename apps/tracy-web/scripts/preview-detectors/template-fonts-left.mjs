/**
 * Template fonts left (Moxie audit, 14/10/2026: ja-space kept Metropolis on its lead statements,
 * ja-trip kept DM Sans on its section headings and ja-vogue Cormorant Infant on its titles, while the
 * rest of the page moved to the system's IBM Plex: two type systems on one page).
 *
 * The probe counts, per primary font family (the first name of the computed `font-family`), the text
 * blocks the visitor reads: an element with a text node of its own of three letters or more. Icon
 * glyphs (Private Use Area characters) are not text and are left out, whatever font draws them, and so are
 * words drawn inside an SVG (a logo's wordmark is the picture's own lettering).
 *
 * `detect` reads the system's families from the slot the worn page carries (`#tracy-ds-slot`: every
 * `--ds-font-*` and `font-family` value). When the system moves the type (its families are on the
 * worn page), every worn text block whose family is one of the template's own (read on the template's
 * page) and none of the system's is left behind: one count per block, one finding per family.
 */
import { WIDGETS_IN_PAGE } from './lib/widgets.mjs'

export const kind = 'template-fonts-left'

export const probe = `(() => {${WIDGETS_IN_PAGE}
  const W = document.documentElement.clientWidth
  const fams = {}
  for (const e of document.querySelectorAll('body *')) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|svg|SVG)$/.test(e.tagName)) continue
    // words drawn inside an SVG are part of the picture (a logo's wordmark), not a text block: Tracy Base's
    // demo logo sets its name in an SVG <text> with its own face on every page (FONT-2, 16/10/2026)
    if (e.closest('svg')) continue
    const txt = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/[\\uE000-\\uF8FF]/g, '')
    if ((txt.match(/\\p{L}/gu) || []).length < 3) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    // a third-party widget sets its own face (Google Maps' Roboto error box): the provider's, not the template's
    if (inWidget(e)) continue
    // words hidden behind a picture (Bootstrap's .text-hide: font 0/0, transparent) are never read: JA
    // Space's footer "Powered By T3 Framework" counted as a block in the family "a" (16/10/2026)
    if (parseFloat(cs.fontSize) < 1 || /^rgba\\([^)]*,\\s*0\\)$|^transparent$/.test(cs.color)) continue
    const r = e.getBoundingClientRect()
    if (r.width < 4 || r.height < 4 || r.right <= 0 || r.left >= W) continue
    const fam = (cs.fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '').toLowerCase()
    if (!fam) continue
    const f = (fams[fam] ??= { blocks: 0, chars: 0, at: [] })
    f.blocks++
    f.chars += txt.trim().length
    const label = e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')
    if (f.at.length < 6 && !f.at.includes(label)) f.at.push(label)
  }
  return { families: fams }
})()`

/** Families that name no font of anyone's: the browser's generic ones. */
const GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong|inherit|initial|unset|-apple-system|blinkmacsystemfont)$/

/** The families the system's slot declares, lower case, from the worn page's HTML. */
export function systemFamilies(/** @type {string} */ html) {
  const slot =
    String(html ?? '').match(/<style\b[^>]*id=["']tracy-ds-slot["'][^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? ''
  const out = new Set()
  for (const m of slot.matchAll(/(?:--ds-font-[\w-]*|font-family)\s*:\s*([^;}]+)/gi))
    for (const name of m[1].split(',')) {
      const n = name
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s*!important$/i, '')
        .toLowerCase()
      if (n && !n.startsWith('var(') && !GENERIC.test(n)) out.add(n)
    }
  return out
}

/**
 * @typedef {{ families: Record<string, { blocks: number, chars: number, at: string[] }> }} FontData
 * @param {{ worn: { data?: FontData, html?: string }, plain: { data?: FontData } }} input
 * @returns {{ count: number, findings: { at: string, family: string, blocks: number, where: string[] }[] }}
 */
export function detect({ worn, plain }) {
  const after = worn?.data?.families ?? {}
  const before = plain?.data?.families ?? {}
  // the template's own: a family its own page sets on text
  const template = (/** @type {string} */ f) => !!before[f]
  const system = systemFamilies(worn?.html ?? '')
  // the system did not move the type on this page: nothing can be left behind
  if (!system.size || !Object.keys(after).some((f) => system.has(f))) return { count: 0, findings: [] }
  const findings = Object.entries(after)
    .filter(([family]) => !GENERIC.test(family) && !system.has(family) && template(family))
    .map(([family, f]) => ({ at: f.at[0] ?? family, family, blocks: f.blocks, where: f.at }))
    .sort((a, b) => b.blocks - a.blocks)
  return { count: findings.reduce((a, f) => a + f.blocks, 0), findings }
}
