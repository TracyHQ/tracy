// Wording rules of the plan gate (#617 review, 2026-11-14), held on the plan the gate made: after placement and after
// the over limit rule took data off a block (`plan-data-limits.mjs`). The locked planner prompt asks for a label and a
// reason per block and nothing more; these rules keep what the customer reads on the plan card true:
// - `reason_count_mismatch`: a block's reason counts its items ("All three services you offer") and the block shows
//   another number of them, often because the gate took an item off it for its length. The message names what the
//   gate took off, so the second attempt leaves it out and words the reason for what the block shows;
// - `label_repeats_data`: a block's label is the name of the one thing it shows ("Business name" for a page header
//   showing the business name), so the card reads the same words twice; a label names the section.
// On a change request only the blocks the revision adds are checked: a kept block keeps the words the customer
// already read, and the request model cannot rewrite them. Where code knows the single right wording the gate fixes it
// and records the fix (`plan-gate-fixes.mjs`, #614): a repeated label takes the block's section name on an English
// plan, and a counted claim that is not of the whole loses its number. Any other case is a problem that goes back to
// the model once, as every gate problem does (`plan-composer.mjs`, `plan-request.mjs`). Pure but for the fixed words,
// written on the gated pages.
import { compositionAt } from './plan-emptied-blocks.mjs'
import { sectionLabelOf, uncountedReason } from './plan-gate-fixes.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const NUMBERS = Object.freeze({
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
})
/** The nouns a reason counts the items of a kind with. */
const NOUNS = Object.freeze({
  service: [
    'services',
    'classes',
    'courses',
    'sessions',
    'programs',
    'programmes',
    'lessons',
    'treatments',
    'offerings'
  ],
  person: ['people', 'trainers', 'coaches', 'instructors', 'members', 'teachers', 'staff'],
  gallery: ['photos', 'pictures', 'images'],
  quote: ['reviews', 'testimonials', 'quotes'],
  package: ['packages', 'plans', 'memberships', 'prices'],
  menu_item: ['dishes', 'items'],
  event: ['events'],
  post: ['posts', 'articles', 'stories'],
  faq: ['questions'],
  step: ['steps'],
  stat_item: ['figures', 'numbers'],
  claim: ['awards']
})
const NUMBER = `(\\d+|${Object.keys(NUMBERS).join('|')})`
/** A counted claim: a determiner, a number, at most one more word, then a plural noun. */
const claimPattern = (nouns) =>
  new RegExp(`\\b(?:all|your|the|these|our|its)\\s+${NUMBER}\\s+(?:[a-z]+\\s+)?(${nouns.join('|')})\\b`, 'gi')
const numberOf = (word) => (/^\d+$/.test(word) ? Number(word) : NUMBERS[word.toLowerCase()])

/** The counts a reason states for the items of the given kinds, as `{said, noun}`. */
export function countedClaimsOf(reason, kinds) {
  const nouns = [...new Set(kinds.flatMap((k) => NOUNS[k] ?? []))]
  if (!nouns.length || typeof reason !== 'string') return []
  return [...reason.matchAll(claimPattern(nouns))].map((m) => ({
    said: numberOf(m[1]),
    noun: m[2],
    words: m[0]
  }))
}

const isEnglish = (language) => typeof language === 'string' && /^en\b/i.test(language)

/**
 * Fix or report the wording problems of the gated pages.
 * @param {object[]} pages the pages the gate made; a fixed label or reason is written on its block
 * @param {{data: object, dropped: object[], index: Map<string, number>, givenIds?: object[], blocks?: Map<string,
 *   object>, language?: string, fix?: (fix: object) => void}} context `dropped`: what the over limit rule took off
 *   (`dropOverLimitData`); `index`: page id -> its index in the composition; `blocks` and `fix`: without them every
 *   case is reported
 * @param {(code: string, at: string, message: string) => void} problem
 */
export function wordingProblems(pages, context, problem) {
  const { data, dropped, index, givenIds, blocks, language, fix } = context
  const kept = new Set(list(givenIds).flatMap((g) => list(g?.blocks).filter(Boolean)))
  const labelOf = (id) => data.byId.get(id)?.entry?.label
  for (const page of pages)
    for (const block of page.blocks) {
      if (kept.has(block.id)) continue
      const at = compositionAt(page, block, index)
      const items = list(block.data).filter((id) => data.byId.get(id)?.what === 'item')
      const kinds = [...new Set(items.map((id) => data.byId.get(id).kind))]
      const off = list(dropped).filter((d) => d.page === page.id && d.block === block.id && !d.cleared)
      for (const claim of countedClaimsOf(block.reason, kinds)) {
        if (claim.said === items.length) continue
        const reason = fix ? uncountedReason(block.reason, claim) : null
        if (reason) {
          const rule = 'a counted claim over a block that shows another number loses its number'
          fix({ code: 'reason_count_mismatch', at: `${at}.reason`, rule, was: block.reason, now: reason })
          block.reason = reason
          continue
        }
        const taken = off.length
          ? `; the gate took ${off.map((d) => JSON.stringify(d.id)).join(', ')} off it as longer than its field, so leave ${off.length === 1 ? 'it' : 'them'} out of this block`
          : ''
        problem(
          'reason_count_mismatch',
          `${at}.reason`,
          `the reason says "${claim.words}" and the block shows ${items.length}${taken}: write a reason that holds for what the block shows`
        )
      }
      const only = list(block.data).length === 1 ? labelOf(block.data[0]) : null
      const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
      if (typeof only !== 'string' || !same(only, block.label)) continue
      const section = fix && isEnglish(language) ? sectionLabelOf(blocks?.get(block.block)) : null
      if (section && !same(section, only)) {
        const rule = "a label that is the name of the block's one datum takes the section name of the block"
        fix({ code: 'label_repeats_data', at: `${at}.label`, rule, was: block.label, now: section })
        block.label = section
      } else
        problem(
          'label_repeats_data',
          `${at}.label`,
          `the label "${block.label}" is the name of the one thing the block shows: give the section its own short name, what it is on the page (for example "Page header"), not the name of its data`
        )
    }
}
