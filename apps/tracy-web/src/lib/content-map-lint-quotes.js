/**
 * The packing rule of guest quote cards (spec TracyHQ/tracy#189, criterion 2.2): every visible line of a quote card (its
 * pull-quote heading, its words, its reviewer) is a slot of its quote group. A line declared outside the group is written
 * by the copy writer as page copy, and the reviewer's name then stands under the business's own words. The card a line
 * sits in is read from its field path (`website-opportunities/domain/quote-cards.mjs`), never a template's name.
 */
import { strayQuoteLinesOf } from 'website-opportunities/domain/quote-cards.mjs'

/** @type {Array<import('./content-map-lint.js').LintRule>} */
export const QUOTE_RULES = [
  {
    id: 'quote-line-outside-group',
    severity: 'error',
    checks: 'every text line of a guest quote card (heading, words, reviewer) is a slot of its quote group',
    fix: 'Give the line the group of its quote card (same group id, item and kind "quote") and a quote role: the pull-quote heading or the words are quote.text, the reviewer quote.author_name, the platform quote.rating_or_source. Outside the group the copy writer fills it with the business\'s own words under a reviewer\'s name.',
    find: ({ map }) =>
      strayQuoteLinesOf(map).map(({ slot, group }) => ({
        key: String(slot.key),
        note: group
          ? `"${slot.role}" sits in the card of quote group "${group}" but outside the group`
          : `"${slot.role}" has no quote group`
      }))
  }
]
