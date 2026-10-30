/**
 * The words of a whole site settled to its one style sheet before they are applied (spec TracyHQ/tracy#189, COO criterion
 * 1.6): whichever writer wrote a line (the page pass, an offering line, a card body, a record page, a band, a button), a
 * word spelt in the other English is respelt the site's way. The writers are told the sheet (`styleSheetRule`); this is
 * the one place that makes sure, so a writer that drifts never shows the site two spellings of one word.
 * Rules by word family (`site-style-sheet.mjs`), never by template, trade or business; any CMS whose engine holds the
 * written lines by slot key.
 */
import { inSiteSpelling } from 'website-opportunities/domain/site-style-sheet.mjs'

/**
 * @param {Record<string, unknown>} written - the words each slot will hold, by slot key
 * @param {any} sheet - the site plan's `styleSheet`
 * @param {{keep?: Array<string | null | undefined>, slots?: any[]}} [options] - `keep`: names never respelt (the
 *   business's, its offerings'); `slots`: the content map's slots, so a url or image slot is never touched
 * @returns {{values: Record<string, string>, respelt: string[]}} the lines that changed, and their keys
 */
export function settleSiteSpelling(written, sheet, { keep = [], slots = [] } = {}) {
  const values = {}
  const respelt = []
  if (!sheet?.locale) return { values, respelt }
  const typeOf = new Map((slots ?? []).map((s) => [s?.key, s?.type]))
  for (const [key, value] of Object.entries(written ?? {})) {
    if (typeof value !== 'string' || (typeOf.has(key) && typeOf.get(key) !== 'text')) continue
    const next = inSiteSpelling(value, sheet, { keep })
    if (next !== value) {
      values[key] = next
      respelt.push(key)
    }
  }
  return { values, respelt }
}
