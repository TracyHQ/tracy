// Where the writer says each of the owner's facts (decision D46, #609; `owner-facts-flow.mjs` carries them to the plan
// data). The plan step never places them: the plan composer reads only plan facts and items. So the writer places each
// fact in code, on ONE block, so it is said once on the site:
//   - a service the owner stated (`services`): the first block, in plan order, that shows a service, a package or a
//     dish and has a copy field;
//   - a team member's fact (`team`): the first such block that shows a person;
//   - any other fact (a story line, a fact, a key message, a USP theme, an audience, a service area): the home page
//     (the page of type `home`, else the first page), on its block with the most room to write (the largest sum of
//     the limits of its copy fields about the business, `editorial.*` and `business.*` but the copyright line and the
//     name; never a button label), the first on a tie.
// A fact with no such block is never forced onto another page: it is reported in `unplaced` with its reason, by id and
// group, never its text. A placed fact reaches the writer in its block's `data` as an entry marked to be reworded
// (`ownerFactView`), and the copy check counts its text as a value the plan data holds (`knownOf`). Pure.

/** The data kind of an owner's fact in a writer request. */
export const OWNER_FACT_DATA_KIND = 'owner.fact'
/** The plain instruction an owner's fact carries in the writer request (no prompt file says it). */
export const OWNER_FACT_USE =
  'reword only: a true fact the owner told us about this block; say it in your own words, never these words, never as a quote'
/** Why a fact found no block. */
export const OWNER_FACT_UNPLACED = Object.freeze({
  services: 'no block of the plan shows a service and has a copy field',
  team: 'no block of the plan shows a person and has a copy field',
  home: 'the home page has no copy field'
})

const list = (value) => (Array.isArray(value) ? value : [])
const KINDS = { services: new Set(['service', 'package', 'menu_item']), team: new Set(['person']) }

/** An owner's fact as the writer reads it, among a block's data. */
export const ownerFactView = ({ id, text }) => ({
  id,
  kind: OWNER_FACT_DATA_KIND,
  label: 'What the owner states',
  value: text,
  use: OWNER_FACT_USE
})

/** A copy field a fact can be said in: words about the business, never a button label, a copyright line or a name. */
const SAYS = (kind) =>
  typeof kind === 'string' &&
  (kind.startsWith('editorial.') || kind.startsWith('business.')) &&
  !['business.copyright', 'business.name'].includes(kind)

/** The copy room of a block: the sum of the limits of the copy fields a fact can be said in (0 when none). */
const roomOf = (block, slots) =>
  slots
    .filter((s) => s.block === block.id && SAYS(s.field?.kind))
    .reduce((sum, s) => sum + (s.field?.limit ?? 0), 0)

/**
 * The block of each owner's fact.
 * @param {object} plan the approved plan
 * @param {{data: object}} context the writer context (`writerContextOf`): `data.ownerFacts`, `data.byId`
 * @param {object[][]} fieldsByPage each page's fields (`writerFieldsOf`), in plan page order
 * @returns {{byBlock: Map<string, object[]>, placed: Array<{id: string, page: string, block: string}>,
 *   unplaced: Array<{id: string, group: string, reason: string}>}}
 */
export function placeOwnerFacts(plan, context, fieldsByPage) {
  const out = { byBlock: new Map(), placed: [], unplaced: [] }
  const facts = list(context?.data?.ownerFacts)
  if (facts.length === 0) return out
  const pages = list(plan?.pages)
  const slotsOf = (i) => list(fieldsByPage[i]).filter((f) => f.from === 'writer')
  const shows = (block, kinds) => list(block.data).some((id) => kinds.has(context.data.byId?.get(id)?.kind))
  const firstShowing = (kinds) => {
    for (const [i, page] of pages.entries())
      for (const block of list(page.blocks))
        if (shows(block, kinds) && roomOf(block, slotsOf(i)) > 0) return { page, block }
    return null
  }
  const homeIndex = Math.max(
    0,
    pages.findIndex((p) => p.pageType === 'home')
  )
  const home = pages[homeIndex]
  const homeBlock = home
    ? list(home.blocks).reduce((best, b) => {
        const room = roomOf(b, slotsOf(homeIndex))
        return room > (best?.room ?? 0) ? { block: b, room } : best
      }, null)
    : null
  for (const fact of facts) {
    const where = KINDS[fact.group]
      ? firstShowing(KINDS[fact.group])
      : homeBlock
        ? { page: home, block: homeBlock.block }
        : null
    if (!where) {
      out.unplaced.push({
        id: fact.id,
        group: fact.group,
        reason: OWNER_FACT_UNPLACED[fact.group] ?? OWNER_FACT_UNPLACED.home
      })
      continue
    }
    out.byBlock.set(where.block.id, [...(out.byBlock.get(where.block.id) ?? []), fact])
    out.placed.push({ id: fact.id, page: where.page.id, block: where.block.id })
  }
  return out
}

/** The known values of the copy check with every owner's fact added: a writer using one invents nothing. */
export const knownOf = (known, data) => [
  ...known,
  ...list(data?.ownerFacts).map((f) => ({ kind: OWNER_FACT_DATA_KIND, value: f.text }))
]

/** The record of the placement: counts and ids, never a text. */
export const ownerFactsRecordOf = (placement) =>
  placement.placed.length || placement.unplaced.length
    ? { placed: placement.placed, unplaced: placement.unplaced }
    : null
