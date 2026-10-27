/**
 * The Template Customization Question Readiness built-site check's `font-glyphs` check (LANG-2, glyphs): whether the web fonts a page loads can draw its language. The
 * detector is the one the Apply uses to give a site the faces it lacks (`apps/tracy-web/src/lib/font-glyphs.js`); this reads
 * a crawled page with it, the same-origin stylesheets the crawl already holds served from memory.
 *
 *   glyphGaps({ doc, sheets, lang, fetchText, fetchBytes, base })
 *   // [{ family: 'jost', missing: ['ề', 'ạ'], subset: 'vietnamese' }]
 */
import { glyphGaps as gapsOfHtml } from '../../../apps/tracy-web/src/lib/font-glyphs.js'

export {
  fontCovers,
  fontFaces,
  LANGUAGE_RANGES,
  unicodeRanges
} from '../../../apps/tracy-web/src/lib/font-glyphs.js'

/**
 * @param {{
 *   doc: any, lang: string, sheets: Array<{ href: string, text: string }>,
 *   fetchText: (url: string, headers?: Record<string, string>) => Promise<string>,
 *   fetchBytes: (url: string) => Promise<Uint8Array | null>, base?: string
 * }} input - `sheets`: the same-origin stylesheets the page links, already read; `base`: the page's address
 * @returns {Promise<Array<{ family: string, missing: string[], subset: string }>>}
 */
export async function glyphGaps({ doc, lang, sheets, fetchText, fetchBytes, base }) {
  const known = new Map(sheets.map((s) => [s.href, s.text]))
  const gaps = await gapsOfHtml({
    html: String(doc.documentElement?.outerHTML ?? doc.toString?.() ?? ''),
    base: base ?? 'https://site.invalid/',
    lang,
    fetchText: async (url, headers) => known.get(url) ?? fetchText(url, headers),
    fetchBytes
  })
  return gaps.map((g) => ({ family: g.key, missing: g.missing, subset: g.subset }))
}
