/**
 * A design system's fonts held to the language the site is written in (LANG-2 for a worn system, TCH #1013, 13/10/2026).
 *
 * 🔒 A FONT THAT CANNOT DRAW THE SITE'S LANGUAGE IS REPLACED WHOLE, NEVER PATCHED LETTER BY LETTER. Measured 13/10/2026 on
 * the local stand: a Vietnamese Tracy Business EmDash site wearing Balsa (Bebas Neue, which Google serves without a
 * Vietnamese cut) printed "BÁNH MÌ NướNG MỗI SÁNG". The accented letters fell to another face, in lower case, inside
 * capital words. The fallback faces Apply gives a template's own families (`brief-engines/glyph-fallback.js`) would draw
 * the same letters from yet another face, so a caps-only display face would still read as two fonts. A site is built in
 * ONE language (D10), so the family is swapped site-wide for one that has the cut and is close in build (`SWAPS`, then
 * the generic look-alikes of `lib/font-glyphs.js`), in the very bytes the write carries. One write keeps the system's own
 * Undo whole. This is the rule the template readiness check holds templates to (spec TCQR, "rule 6").
 *
 * Runs when a design system is written, from the Design system button or at create: the Apply that measured the
 * template's fonts ran before the system's fonts existed (`design-system-at-create.js` waits for the brief).
 *
 * Soft: a site that cannot be read, a language with no known letters, or a Google answer that cannot be read leaves the
 * bytes as the system made them.
 */
import { BROWSER_UA, LANGUAGE_RANGES, LOOK_ALIKES, fontFaces } from '../lib/font-glyphs.js'

const GOOGLE_CSS = 'https://fonts.googleapis.com/css2'

/**
 * Display and text faces the library names (`GET /api/design-system/library`, 13/10/2026: 22 of its 64 Google families
 * have no Vietnamese cut, worn by 78 of 1,081 systems) mapped to one that has the cut and keeps the build: condensed
 * caps to condensed, display serif to display serif, geometric to geometric. Anything not here takes the generic
 * look-alike of the stack's last generic (`LOOK_ALIKES`).
 */
export const SWAPS = Object.freeze({
  vietnamese: Object.freeze({
    'bebas neue': 'Oswald',
    antonio: 'Oswald',
    'archivo black': 'Anton',
    'bowlby one': 'Anton',
    boldonse: 'Anton',
    'climate crisis': 'Anton',
    'bagel fat one': 'Anton',
    'dm serif display': 'Playfair Display',
    'dm serif text': 'Noto Serif',
    'bodoni moda': 'Playfair Display',
    'libre caslon text': 'Noto Serif',
    'libre baskerville': 'Noto Serif',
    'pt serif': 'Noto Serif',
    'dm sans': 'Be Vietnam Pro',
    poppins: 'Be Vietnam Pro',
    outfit: 'Be Vietnam Pro',
    sora: 'Be Vietnam Pro',
    jost: 'Be Vietnam Pro',
    'sofia sans': 'Be Vietnam Pro',
    'schibsted grotesk': 'Be Vietnam Pro',
    'instrument sans': 'Be Vietnam Pro',
    'fira code': 'Roboto Mono'
  })
})

/** The weights asked of a replacement: the ones a system's text and headings are set in. */
const WEIGHTS = '300;400;500;600;700;800'

const key = (/** @type {string} */ name) => String(name).trim().replace(/\s+/g, ' ').toLowerCase()
const plus = (/** @type {string} */ name) => encodeURIComponent(name).replace(/%20/g, '+')
const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The text a visitor reads on a page: no markup, no scripts or styles. */
function visibleText(/** @type {string} */ html) {
  return String(html ?? '')
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
}

/** The Google families the write loads, by the css2 links it carries (`family=Bebas+Neue:wght@400`). */
export function googleFamilies(/** @type {string} */ text) {
  const out = new Set()
  for (const m of String(text).matchAll(/fonts\.googleapis\.com\/css2\?([^\s"'<>*)]+)/g))
    for (const part of m[1].replace(/&amp;/g, '&').split('&')) {
      const f = /^family=([^:&]+)/.exec(part)?.[1]
      if (f) out.add(decodeURIComponent(f.replace(/\+/g, ' ')))
    }
  return [...out]
}

/** The text of a write, whatever the CMS carries it in. */
const textOf = (/** @type {any} */ out) =>
  out.platform === 'emdash' ? out.css : out.platform === 'joomla' ? out.html : JSON.stringify(out.variation)

/**
 * Which of the system's families cannot draw the site's language, and what each is replaced with.
 * @param {{
 *   out: any,
 *   reader: { base: string, text: (url: string, headers?: Record<string, string>) => Promise<string> } | null
 * }} input `out` is `ds.emitFor`'s answer; `reader` reads the site and Google Fonts (`route.js` `glyphReader`)
 * @returns {Promise<{ lang: string | null, swaps: Array<{ from: string, to: string, subset: string, param: string }> }>}
 */
export async function swapsFor({ out, reader }) {
  const none = { lang: null, swaps: [] }
  if (!reader || !out?.ok) return none
  const html = await reader.text(reader.base)
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z-]+)/i.exec(html)?.[1] ?? null
  const need = lang ? LANGUAGE_RANGES[lang.toLowerCase().split(/[-_]/)[0]] : undefined
  if (!need) return { lang, swaps: [] }
  // only a site that prints its language's own letters needs a font that draws them
  const prints = [...visibleText(html)].some((ch) => {
    const cp = ch.codePointAt(0) ?? 0
    return need.ranges.some(([a, b]) => cp >= a && cp <= b)
  })
  if (!prints) return { lang, swaps: [] }

  /** The css2 query that loads `family` with the subset, or null when Google has no such cut. */
  const cut = async (/** @type {string} */ family) => {
    for (const param of [`family=${plus(family)}:wght@${WEIGHTS}`, `family=${plus(family)}`]) {
      let css = ''
      try {
        css = await reader.text(`${GOOGLE_CSS}?${param}&display=swap`, { 'user-agent': BROWSER_UA })
      } catch {
        css = ''
      }
      if (!/@font-face/i.test(css)) continue
      return fontFaces(css, GOOGLE_CSS).some((f) => f.subset === need.subset) ? param : null
    }
    return undefined // not read: judge nothing
  }

  const swaps = []
  const text = textOf(out)
  for (const family of googleFamilies(text)) {
    const own = await cut(family)
    if (own !== null) continue // drawn, or not read
    const generic = /monospace|mono\b|code/i.test(family)
      ? 'monospace'
      : /serif/i.test(family) && !/sans/i.test(family)
        ? 'serif'
        : 'sans-serif'
    for (const to of [SWAPS[need.subset]?.[key(family)], LOOK_ALIKES[need.subset]?.[generic]].filter(
      Boolean
    )) {
      const param = await cut(/** @type {string} */ (to))
      if (!param) continue
      swaps.push({ from: family, to: /** @type {string} */ (to), subset: need.subset, param })
      break
    }
  }
  return { lang, swaps }
}

/** Replace a family by name in CSS or markup: quoted, in a stack, and in a css2 link (weights asked again). */
function swapText(/** @type {string} */ text, /** @type {{ from: string, to: string, param: string }} */ s) {
  return text
    .replace(new RegExp(`family=${esc(plus(s.from))}(?::[^&"'<>\\s*)]*)?`, 'g'), s.param)
    .replace(new RegExp(`(["'])${esc(s.from)}\\1`, 'g'), `$1${s.to}$1`)
    .replace(new RegExp(`(^|[\\s,:(])${esc(s.from)}(?=\\s*[,;)"'}]|\\s*$)`, 'gm'), `$1${s.to}`)
}

/**
 * The write with its families replaced. EmDash and Joomla carry CSS and markup; WordPress carries a style variation,
 * whose family stacks are renamed and whose faces of a replaced family are those of its replacement (`fontFaces`, the
 * same Google read the write uses), or dropped so the link loads it.
 * @param {any} out `ds.emitFor`'s answer
 * @param {Array<{ from: string, to: string, subset: string, param: string }>} swaps
 * @param {{ fontFaces?: (href: string | null) => Promise<any[]> }} [opts]
 */
export async function withSwaps(out, swaps, { fontFaces: resolveFaces } = {}) {
  if (!out?.ok || swaps.length === 0) return out
  if (out.platform === 'emdash') return { ...out, css: swaps.reduce(swapText, out.css) }
  if (out.platform === 'joomla') return { ...out, html: swaps.reduce(swapText, out.html) }
  const variation = structuredClone(out.variation)
  for (const fam of variation?.settings?.typography?.fontFamilies ?? []) {
    const s = swaps.find((x) =>
      new RegExp(`(^|["',\\s])${esc(x.from)}(["',\\s]|$)`).test(String(fam.fontFamily ?? ''))
    )
    if (!s) continue
    fam.fontFamily = swapText(String(fam.fontFamily), s)
    if (fam.name) fam.name = String(fam.name).replace(s.from, s.to)
    let faces = []
    try {
      faces = resolveFaces ? await resolveFaces(`${GOOGLE_CSS}?${s.param}&display=swap`) : []
    } catch {
      faces = []
    }
    const own = faces.filter((f) => key(f.fontFamily) === key(s.to))
    if (own.length) fam.fontFace = own.map((f) => ({ ...f, fontDisplay: 'swap' }))
    else delete fam.fontFace
  }
  return { ...out, variation: JSON.parse(swaps.reduce(swapText, JSON.stringify(variation))) }
}
