/**
 * The letters of a site's language its template's fonts cannot draw, given a font that can (LANG-2, TCH #1013).
 *
 * 🔒 A SITE WRITTEN IN VIETNAMESE IS DRAWN IN VIETNAMESE LETTERS. Measured 10/10/2026 on dev g60-ess-wp-full and g60-ess-j-full
 * (JA Essence): the heading font Jost has no Vietnamese glyphs anywhere, so "đề" was drawn as "đê" with a loose grave, and
 * JA Essence WordPress ships its Noto Serif cut to Latin. Once the site speaks its language, its home page is read as a visitor
 * reads it (`lib/font-glyphs.js`): each family it uses that cannot draw the letters it prints is given faces of the SAME family
 * name, limited to those letters, from the same family on Google Fonts or a look-alike. The plugin prints them after the
 * template's faces (Claude Cowork for WordPress 0.18.9: option `tracy_glyph_fallback`; for Joomla 0.24.13:
 * `template.siteSettings` `other_glyphFaces`). Soft: what cannot be read, found or written is said, never fails the Apply.
 */
import { fallbackFaces, glyphGaps } from '../../lib/font-glyphs.js'

/**
 * @typedef {object} SiteReader what a site serves, read as a visitor reads it (`app.js` `siteReader`)
 * @property {string} base - the site's own address, with its trailing slash
 * @property {(url: string, headers?: Record<string, string>) => Promise<string>} text - a page or a stylesheet of the site, or a
 *   Google Fonts sheet
 * @property {(url: string) => Promise<Uint8Array | null>} bytes - a font file the site serves
 */

/** The most faces the plugins print (GlyphFallback::MAX_FACES in both): a value with more is refused whole. */
export const MAX_GLYPH_FACES = 24

/** The weights a template's text is set in most, first: the ones kept when a site needs more faces than are printed. */
const WEIGHT_ORDER = ['400', '700', '600', '500', '300', '800']

/**
 * At most MAX_GLYPH_FACES faces, every family kept: its weights in WEIGHT_ORDER, one round across the families at a time.
 * Five families lacking a language's letters in six weights each (30 faces) were refused whole, and the site kept none.
 * @template {{ family: string, weight: string }} F
 * @param {F[]} faces
 * @returns {F[]}
 */
export function fewestFaces(faces) {
  if (faces.length <= MAX_GLYPH_FACES) return faces
  const rank = (/** @type {string} */ w) => WEIGHT_ORDER.indexOf(String(w)) + 1 || WEIGHT_ORDER.length + 1
  /** @type {Map<string, F[]>} */
  const byFamily = new Map()
  for (const f of faces) byFamily.set(f.family, [...(byFamily.get(f.family) ?? []), f])
  const queues = [...byFamily.values()].map((list) =>
    [...list].sort((a, b) => rank(a.weight) - rank(b.weight))
  )
  /** @type {F[]} */
  const kept = []
  for (let round = 0; kept.length < MAX_GLYPH_FACES && queues.some((q) => q.length > round); round++)
    for (const q of queues) if (q[round] && kept.length < MAX_GLYPH_FACES) kept.push(q[round])
  return kept
}

/** What a refusal says. */
const said = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error))

/**
 * Find the families the site's home page cannot draw its language with, and write the faces that can.
 * @param {object} input
 * @param {'wordpress' | 'joomla'} input.platform
 * @param {SiteReader | null} input.reader
 * @param {string} input.lang - the language the site is written in (`vi`, `vi-VN`)
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.write - the Apply door; a refusal throws or
 *   answers `ok: false`
 * @param {string | null} [input.template] - Joomla: the site template's folder
 * @param {(note: string) => void} input.note
 * @returns {Promise<{ families: string[], faces: number }>}
 */
export async function giveGlyphs({ platform, reader, lang, write, template = null, note }) {
  const none = { families: [], faces: 0 }
  if (!reader) return none
  let gaps
  try {
    gaps = await glyphGaps({
      html: await reader.text(reader.base),
      base: reader.base,
      lang,
      fetchText: reader.text,
      fetchBytes: reader.bytes
    })
  } catch (error) {
    note(`the site's fonts could not be read to check they draw its language: ${said(error)}`)
    return none
  }
  if (gaps.length === 0) return none
  const faces = fewestFaces(await fallbackFaces({ gaps, fetchText: reader.text }).catch(() => []))
  const lacking = gaps.map((g) => `${g.family} (${g.missing.slice(0, 4).join(' ')})`).join(', ')
  if (faces.length === 0) {
    note(
      `the template's fonts cannot draw every letter of the site's language and no font was found to draw them: ${lacking}`
    )
    return { families: gaps.map((g) => g.family), faces: 0 }
  }
  const value = JSON.stringify({
    faces: faces.map(({ family, weight, style, src, subset }) => ({ family, weight, style, src, subset }))
  })
  const applyId = `glyphs-${Date.now().toString(36)}`
  try {
    const answer =
      platform === 'wordpress'
        ? await write('content.update', {
            kind: 'option',
            id: 0,
            key: 'tracy_glyph_fallback',
            fields: { value },
            apply_id: applyId
          })
        : await write('template.siteSettings', {
            operation: 'set',
            template,
            fields: { other_glyphFaces: value },
            apply_id: applyId
          })
    if (answer?.ok === false)
      throw Object.assign(new Error(answer?.message ?? answer?.error ?? 'refused'), { answer })
  } catch (error) {
    const answer = /** @type {any} */ (error)?.answer
    const old = /^(bad_action|unsupported)$/.test(String(answer?.error ?? ''))
    note(
      `the template's fonts cannot draw every letter of the site's language (${lacking}) and the site did not take the fonts that can: ${
        old
          ? `the Claude Cowork plugin needs ${platform === 'wordpress' ? '0.18.9' : '0.24.13'} or later`
          : said(error)
      }`
    )
    return { families: gaps.map((g) => g.family), faces: 0 }
  }
  const from = [...new Set(faces.map((f) => `${f.family} ← ${f.from}`))].join(', ')
  note(
    `the letters of the site's language the template's fonts cannot draw (${lacking}) are drawn from ${from}`
  )
  return { families: gaps.map((g) => g.family), faces: faces.length }
}
