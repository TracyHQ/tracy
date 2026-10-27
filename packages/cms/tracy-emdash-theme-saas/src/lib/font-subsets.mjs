/**
 * The subsets every web font of a template is cut in, whatever subsets its design named (`src/fonts.json`).
 *
 * 🔒 A SITE WRITTEN IN VIETNAMESE IS DRAWN IN VIETNAMESE LETTERS (LANG-2, TCH #1013, g62). Measured 11/10/2026 on dev
 * g61-biz-emd-full (Tracy Business 1.7.9): Archivo and Newsreader were downloaded in `latin` and `latin-ext` only, so the
 * page had no face for ệ ể ụ ầ ế ố ủ ớ, and the browser built them from a base letter and a loose accent. Both families
 * have a `vietnamese` subset on Google Fonts; the design simply never named it. The language is chosen when a customer
 * builds a site, long after the template is built, so every font carries the subsets of the languages Tracy writes whose
 * letters `latin` and `latin-ext` leave out. A face of a subset has a `unicode-range`: a page that prints none of those
 * letters never downloads it. A family Google does not cut in a subset gets no face for it (the provider skips it), and
 * the built-site audit's `font-glyphs` check names the family.
 *
 * Add a subset here when a language joins `LANGUAGE_RANGES` of `apps/tracy-web/src/lib/font-glyphs.js`.
 *
 *   fonts: withLanguageSubsets(fonts).map((font) => ({ provider: fontProviders.google(), ...font }))
 */

/** Subsets of the languages Tracy writes that `latin` and `latin-ext` do not cover. */
export const LANGUAGE_SUBSETS = Object.freeze(['vietnamese'])

/**
 * The design's fonts, each with the language subsets added after its own (no duplicates, the design's order kept).
 * @template {{ subsets?: string[] }} F
 * @param {F[]} fonts
 * @returns {F[]}
 */
export function withLanguageSubsets(fonts) {
  return (Array.isArray(fonts) ? fonts : []).map((font) => ({
    ...font,
    subsets: [...new Set([...(font.subsets ?? ['latin']), ...LANGUAGE_SUBSETS])]
  }))
}
