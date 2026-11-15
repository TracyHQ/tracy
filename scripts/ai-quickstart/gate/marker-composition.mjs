// The marker build's plan composition (ticket #585): one page per page recipe of the kit and one per recipe variant
// (a variant's own blocks are reached only there), every block of the page once, each with the most data its block
// declares, in the reply shape of the plan composer (`plan-composer-prompt.md`), so the real rules gate settles it.
// Page names are markers. Pure.
import { idOf } from '../../../packages/wo/website-opportunities/domain/plan-data.mjs'
import {
  BLOCK_TYPES,
  GROUP_KINDS_V3
} from '../../../packages/wo/website-opportunities/domain/place-content-roles.mjs'
import { textMarker } from './marker-codec.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const SOCIAL = 'contact.social_url'
const fieldsOf = (block) => [
  ...list(block.fields),
  ...list(block.itemFields),
  ...list(block.lists).flatMap((l) => list(l?.fields)),
  ...list(block.itemLists).flatMap((l) => list(l?.fields))
]
const factId = (kind, n) => (n === 0 ? idOf(kind) : `${idOf(kind)}-${n + 1}`)

/** The fact ids a block shows: the facts of the kinds its fields declare, else the business name. */
function factIdsOf(block, profile) {
  const kinds = new Set(fieldsOf(block).map((f) => f.kind))
  const ids = []
  for (const [kind, values] of Object.entries(profile.facts)) {
    if (!kinds.has(kind) || kind === 'contact.cta_label') continue
    values.forEach((_, n) => ids.push(factId(kind, n)))
  }
  if (kinds.has('contact.cta_url') && !ids.includes('contact-cta-label')) ids.push('contact-cta-label')
  return ids.length ? ids : ['business-name']
}

/**
 * The item kind a block shows best: of the kinds its type allows, the one whose required role its item fields declare
 * (a pricing block whose cards name offerings shows services), else its type's own kind.
 */
export function itemKindOf(block) {
  const own = BLOCK_TYPES[block.type]?.itemKind
  if (!own) return null
  const kinds = new Set(list(block.itemFields).map((f) => f.kind))
  const fits = (k) => list(GROUP_KINDS_V3[k]?.requiredRoles).every((r) => kinds.has(r))
  if (fits(own)) return own
  return list(GROUP_KINDS_V3[own]?.allowedKinds).find(fits) ?? own
}

/**
 * How many items a block shows in a composition shape: `max` its maximum (the marker test); `min` its minimum, at least
 * one, so the block still shows (the minimum variant of the structure measurement, #586).
 */
export const countOf = (block, shape = 'max') =>
  shape === 'min' ? Math.max(1, block.items?.min ?? 1) : (block.items?.max ?? 1)

/** The data of one block on one page: items of its kind not shown yet on the page, up to its count; or its facts. */
function dataOf(block, profile, usedOnPage, createdBy, shape) {
  const kind = itemKindOf(block)
  // Social links are contact channels the rules gate wants on every page with room for them, whatever the shape.
  if (list(block.itemFields).some((f) => f.kind === SOCIAL))
    return list(profile.facts[SOCIAL])
      .slice(0, block.items?.max ?? 1)
      .map((_, n) => factId(SOCIAL, n))
  if (!kind) return factIdsOf(block, profile)
  // A created block makes a record of each item it shows, in the frame of its own blank site entity: an item two created
  // blocks show would get two frames on one record, so each created block shows items of its own.
  const created = block.placement === 'created'
  const free = list(profile.items[kind]).filter(
    (i) => !usedOnPage.has(i.id) && (!created || (createdBy.get(i.id) ?? block.id) === block.id)
  )
  const taken = free.slice(0, countOf(block, shape)).map((i) => i.id)
  for (const id of taken) {
    usedOnPage.add(id)
    if (created) createdBy.set(id, block.id)
  }
  return taken
}

/** The page types the kit declares the write step cannot make (`pages.<type>.unbuilt`), with their code. */
export const unbuiltOf = (mapping) =>
  new Map(
    Object.entries(mapping?.pages ?? {})
      .filter(([, p]) => p?.unbuilt)
      .map(([type, p]) => [type, p.unbuilt])
  )

/** Every page the composition lists: a recipe's blocks, then each variant's; a page type the kit declares unbuilt none. */
export function pageShapesOf(pageRecipes, mapping) {
  const unbuilt = unbuiltOf(mapping)
  return list(pageRecipes?.recipes)
    .filter((r) => !unbuilt.has(r.pageType))
    .flatMap((r) => [
      { pageType: r.pageType, blocks: list(r.blocks), mainBlock: r.mainBlock },
      ...list(r.variants).map((v) => ({
        pageType: r.pageType,
        blocks: list(v.blocks),
        mainBlock: r.mainBlock
      }))
    ])
}

/**
 * The composition of the marker build.
 * @param {{blockStore: object, pageRecipes: object, mapping?: object}} kit
 * @param {object} profile the marker needs profile (`markerProfile`)
 * @param {{take: Function}} registry
 * @param {{shape?: 'max' | 'min', pages?: (page: {pageType: string, blocks: string[]}) => boolean}} [options] `shape`:
 *   each block at its most items (the default) or its least; `pages`: the pages kept (all by default)
 */
export function markerComposition(
  { blockStore, pageRecipes, mapping },
  profile,
  registry,
  { shape: count = 'max', pages: keep = () => true } = {}
) {
  const byId = new Map(list(blockStore?.blocks).map((b) => [b.id, b]))
  const createdBy = new Map()
  const pages = pageShapesOf(pageRecipes, mapping)
    .filter(keep)
    .map((shape) => {
      const used = new Set()
      const blocks = shape.blocks
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((b) => ({
          block: b.id,
          label: `Block ${b.id}`,
          data: dataOf(b, profile, used, createdBy, count),
          reason: 'Marker test.'
        }))
      const name = textMarker(registry.take({ what: 'page', pageType: shape.pageType }))
      return { pageType: shape.pageType, name, blocks }
    })
  // At its least, the items no block shows are left out, so the rules gate does not place them itself.
  const shown = new Set(pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const leftOut =
    count === 'min'
      ? Object.values(profile.items ?? {})
          .flat()
          .filter((i) => !shown.has(i.id))
          .map((i) => ({ item: i.id, reason: 'The minimum variant shows the fewest items.' }))
      : []
  return { pages, assumptions: [], leftOut }
}
