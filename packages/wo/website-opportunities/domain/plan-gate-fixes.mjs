// The fixes the plan gate makes itself (#614), recorded, instead of failing the whole plan. A fix is allowed only when
// the fault is mechanical: code knows the single right answer from the plan alone, and nothing the site shows changes.
// Never a fix: a change to which facts, items, blocks or pages the plan shows, to any value, or to any id of `data`.
// Each fix returns `{code, at, rule, was, now}`; `code` is the gate rule it settles, `at` the place in the composition.
// - `left_out_but_shown`: an item a block shows and the model also leaves out keeps showing (the block decides) and
//   its left out entry goes, so the plan never says it left out what the site shows;
// - `contract_b` of an assumption: an assumption that names a block by its block store id
//   (`pages[home].blocks[block-160].data`, the only block id the model is ever given) is pointed at the plan's id of
//   that block on that page (one at most, a block sits once on a page); an assumption about a block the page does not
//   keep goes with the block, as one about a dropped page goes with the page;
// - `label_repeats_data`: a label that is the name of its block's one datum takes the section name of the block's
//   type (an English plan only, the names here are English);
// - `reason_count_mismatch`: a counted claim ("the four remaining offerings") over a block that shows another number
//   loses its number ("the remaining offerings"). Not a claim of the whole ("all four"): without its number it would
//   still say every one is shown, so it goes back to the model. Pure.
import { parseFieldPath } from './build-contract-shared.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The section name of a block type, as the plan card reads it. */
export const SECTION_LABELS = Object.freeze({
  header: 'Menu',
  footer: 'Footer',
  hero: 'Hero',
  about: 'About',
  text: 'Text',
  call_to_action: 'Call to action',
  contact: 'Contact details',
  map: 'Map',
  video: 'Video',
  newsletter: 'Newsletter',
  services: 'Services',
  menu: 'Menu',
  pricing: 'Prices',
  schedule: 'Schedule',
  team: 'Team',
  stats: 'Figures',
  steps: 'Steps',
  reviews: 'Reviews',
  claims: 'Awards',
  faq: 'Questions',
  events: 'Events',
  posts: 'Articles',
  gallery: 'Photos'
})

/** The section name of a block: a masthead hero is the page header, any other block the name of its type. */
export function sectionLabelOf(description) {
  if (description?.type === 'hero' && list(description.positions).includes('masthead')) return 'Page header'
  return SECTION_LABELS[description?.type] ?? null
}

/** The composition without the left out entries of items its blocks show; one fix per entry taken off. */
export function withoutShownLeftOut(composition, data, fix) {
  const shown = new Set(
    list(composition?.pages).flatMap((p) => list(p?.blocks).flatMap((b) => list(b?.data)))
  )
  const leftOut = list(composition?.leftOut)
  if (!leftOut.some((e) => e?.item !== undefined && shown.has(e.item) && data.byId.has(e.item)))
    return composition
  const kept = []
  leftOut.forEach((entry, i) => {
    if (entry?.item === undefined || !shown.has(entry.item) || !data.byId.has(entry.item))
      return kept.push(entry)
    fix({
      code: 'left_out_but_shown',
      at: `leftOut[${i}].item`,
      rule: 'shown wins: the left out entry of an item a block shows is taken off',
      was: entry.item,
      now: null
    })
  })
  return { ...composition, leftOut: kept }
}

/**
 * The field of a model assumption on the plan's own block ids. `pages[<page>].blocks[<store id>]...` names the one
 * block of that store id the page keeps: the field then names its plan id. Returns `{field}`, or `{drop: true}` when
 * `id` is a block of the list (`blocks`) the page does not keep; any other field is returned as it is.
 */
export function assumptionFieldOf(field, pages, blocks) {
  const segments = parseFieldPath(field)
  if (!segments || segments[0]?.key !== 'pages' || segments[1]?.key !== 'blocks' || !segments[1].id)
    return { field }
  const page = pages.find((p) => p.id === segments[0].id)
  if (!page || page.blocks.some((b) => b.id === segments[1].id)) return { field }
  const named = page.blocks.filter((b) => b.block === segments[1].id)
  if (named.length !== 1) return named.length === 0 && blocks.has(segments[1].id) ? { drop: true } : { field }
  const rest = segments.slice(2).map((s) => (s.id === null ? s.key : `${s.key}[${s.id}]`))
  return { field: [`pages[${page.id}]`, `blocks[${named[0].id}]`, ...rest].join('.') }
}

/** The reason without the number of a counted claim (`countedClaimsOf`), or null when the claim is of the whole. */
export function uncountedReason(reason, claim) {
  if (/^all\b/i.test(claim.words)) return null
  const words = claim.words.split(/\s+/)
  const without = [words[0], ...words.slice(2)].join(' ')
  return reason.replace(claim.words, without).replace(/\s{2,}/g, ' ')
}
