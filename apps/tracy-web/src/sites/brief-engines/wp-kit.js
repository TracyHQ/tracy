/**
 * The kit and system pages of a WordPress template (TCH #1013, K3 of the TCQR spec): typography, the error and offline pages,
 * the login, registration and profile forms, search and tag lists, a newsletter, email, form, slide or style-guide sample.
 * They show what the template can draw, not the customer's business, so they keep the template's content: their words are
 * never rewritten for the business, and are translated when the site is written in another language than the template's.
 *
 * Told apart the way the readiness rules tell a system page (`UTILITY_WORDS`, `site-pages/page-rule.js`) or a kit sample.
 */
import { UTILITY_WORDS } from '../../lib/template-customization-question-readiness/site-pages/page-rule.js'
import { translateKit } from './joomla-kit.js'

/** A kit sample page by its slug or title. */
const KIT_SAMPLE = /^(newsletter|e-?mail|form|slides?|style[ -]?guide)(?:$|[^a-z])/i

/**
 * Whether a page is one of the template's kit or system pages: a system word in its slug (a title says "Our profile" on a
 * business page), or a kit sample's name in its slug or its title.
 * @param {{ slug: string, title?: string }} page
 */
export const isKitPage = (page) =>
  UTILITY_WORDS.test(page.slug) || [page.slug, page.title ?? ''].some((name) => KIT_SAMPLE.test(name.trim()))

/**
 * The lines of the kit pages in the site's language: translated from the template's own words, never rewritten. Nothing when
 * no model is set; never rejects: what could not be translated keeps the template's words, said (`translateKit`).
 * @param {object} input
 * @param {Array<{ slug: string, lines: Array<{ text: string }> }>} input.pages - a page of the line map: a kit page's body
 *   under its slug, its metas under `meta-<slug>`
 * @param {string} input.locale - the language the site is written in
 * @param {{ chat: Function } | null} input.model
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @returns {Promise<Array<{ slug: string, text: string, value: string }>>}
 */
export async function translateKitLines({ pages, locale, model, signal, note }) {
  const slots = pages.flatMap((page) =>
    page.lines.map((line, i) => ({
      key: `${page.slug}\u0000${i}`,
      type: 'text',
      sample: line.text,
      maxCharacters: Math.max(40, Math.ceil(line.text.length * 1.5))
    }))
  )
  if (slots.length === 0) return []
  const said = await translateKit({ slots, locale, source: 'en', model, shipped: new Map(), signal, note })
  return slots.flatMap((slot) =>
    slot.key in said ? [{ slug: slot.key.split('\u0000')[0], text: slot.sample, value: said[slot.key] }] : []
  )
}
