// The changes of a change request applied to the current plan (ticket #617). The plan is turned back into the
// composition the rules gate reads (`plan-gate.mjs`), every page and block keeping the id it has on the plan as its
// `origin` (the gate keeps it too, `givenIdsOf`), so a change names exactly what it touches. Only the changes are
// applied: nothing else of the plan can move, which is how what the customer settled before (earlier answers and plan
// edits) stays as it is. Each applied change records the unit of the plan it changes (`unitOf`). Problems for the
// re-compose: a change naming a page or block the plan does not have, or one this answer adds (`new-<i>`); a page's
// main section removed (prompt rule 4: a page keeps its recipe's main block); a page renamed or added with the name
// of another page. A page added with the type and the main data of a page the plan has is not added: a not done line.
// Data only a removed page showed leaves the plan with it (`REMOVED_PAGE_DATA_REASON`), so the gate's placement does
// not move it to another page; a contact channel is the exception, as the contact rules decide where it goes.
// Pure: the plan given is never changed.
import { CONTACT_CHANNEL_KINDS } from './plan-gate-contact.mjs'
import { REQUESTED_OFF_REASON } from './plan-request-taken-off.mjs'
import { sameWords } from './plan-request-words.mjs'

/** The left out reason of data only a page the customer asked to remove showed. */
export const REMOVED_PAGE_DATA_REASON = 'It was only on a page you asked to remove.'
const MAIN_BLOCK_KEPT =
  'a page cannot lose its main section: remove the page only when the request asks for that, or report the wish under notDone with reason outside_plan'

const list = (value) => (Array.isArray(value) ? value : [])
const blockOf = ({ block, label, data, reason, targets }) => ({
  block,
  label,
  data: [...data],
  reason,
  ...(targets ? { targets: [...targets] } : {})
})
const workingPagesOf = (plan) =>
  list(plan?.pages).map((page) => ({
    origin: page.id,
    pageType: page.pageType,
    name: page.name,
    blocks: page.blocks.map((b) => ({ origin: b.id, ...blockOf(b) }))
  }))
const isNew = (id) => typeof id === 'string' && id.startsWith('new-')

/** The composition the gate reads, from working pages: no ids. */
export const compositionPagesOf = (pages) =>
  pages.map(({ pageType, name, blocks }) => ({ pageType, name, blocks: blocks.map(blockOf) }))

/** The plan ids the gate keeps, per page of the composition: `null` for a page or block this answer adds. */
export const givenIdsOf = (pages) =>
  pages.map((p) => ({
    page: isNew(p.origin) ? null : p.origin,
    blocks: p.blocks.map((b) => (isNew(b.origin) ? null : b.origin))
  }))

const shownIn = (pages) => new Set(pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
const mainDataOf = (page, recipes) =>
  page.blocks
    .filter((b) => b.block === recipes.get(page.pageType)?.mainBlock)
    .flatMap((b) => b.data)
    .sort()
    .join()

/**
 * Apply the changes in order to working pages.
 * @param {object} plan the current plan
 * @param {object[]} changes the model's changes, shape already checked (`plan-request-reply.mjs`)
 * @param {(code: string, at: string, message: string) => void} problem
 * @param {{recipes: Map<string, object>, data: object}} context the composer context
 * @returns {{pages: object[], units: Array<string | null>, takenOff: Map<string, string>, removedPages: object[],
 *   refused: Set<number>, notDone: object[]}} `units[i]`: the unit change `i` changes; `takenOff`: each id the changes
 *   took off the plan, with its left out reason; `refused`: the changes not made, each with its line in `notDone`
 */
export function applyRequestChanges(plan, changes, problem, { recipes, data }) {
  const pages = workingPagesOf(plan)
  const units = []
  const removed = new Set()
  const removedPages = []
  const refused = new Set()
  const notDone = []
  const named = new Set()
  const pageAt = (id, at) => {
    if (isNew(id)) {
      problem(
        'change_target_new',
        at,
        'a page this answer adds cannot be changed again by it: add it as it should be'
      )
      return undefined
    }
    const page = pages.find((p) => p.origin === id)
    if (!page) problem('change_target_missing', at, `${JSON.stringify(id)} is not a page id of the plan`)
    return page
  }
  const blockAt = (page, id, at) => {
    const block = page?.blocks.find((b) => b.origin === id && !isNew(id))
    if (page && !block)
      problem('change_target_missing', at, `${JSON.stringify(id)} is not a block id of page ${page.origin}`)
    return block
  }
  const insertAfter = (items, after, item, at) => {
    const index = after === undefined ? items.length - 1 : items.findIndex((x) => x.origin === after)
    if (index < 0 && after !== undefined)
      return problem('change_target_missing', at, `${JSON.stringify(after)} is not an id here`)
    items.splice(index + 1, 0, item)
  }
  changes.forEach((change, i) => {
    const at = `changes[${i}]`
    let unit = null
    const page = change.page === undefined ? null : pageAt(change.page, `${at}.page`)
    if (change.op === 'remove_page' && page) {
      pages.splice(pages.indexOf(page), 1)
      removedPages.push(page)
      unit = `page-removed:${page.origin}`
    } else if (change.op === 'rename_page' && page) {
      page.name = change.name
      named.add(page)
      unit = `page-renamed:${page.origin}`
    } else if (change.op === 'order_pages') {
      const now = pages.map((p) => p.origin)
      const same = change.pages.length === now.length && now.every((id) => change.pages.includes(id))
      if (!same) problem('change_target_missing', `${at}.pages`, `list every page id once: ${now.join(', ')}`)
      else pages.sort((a, b) => change.pages.indexOf(a.origin) - change.pages.indexOf(b.origin))
      unit = 'page-order'
    } else if (change.op === 'add_page') {
      const added = { origin: `new-${i}`, pageType: change.pageType, name: change.name }
      const blocks = change.blocks.map((b, j) => ({ origin: `new-${i}-${j}`, ...blockOf(b) }))
      const twin = pages.find(
        (p) =>
          p.pageType === change.pageType &&
          mainDataOf(p, recipes) === mainDataOf({ ...added, blocks }, recipes)
      )
      if (twin) {
        refused.add(i)
        notDone.push({ what: change.name, reason: 'outside_plan', why: 'The plan already has this page.' })
      } else {
        const page = { ...added, blocks }
        insertAfter(pages, change.after, page, `${at}.after`)
        named.add(page)
        unit = `page-added:new-${i}`
      }
    } else if (change.op === 'remove_block' && page) {
      const block = blockAt(page, change.block, `${at}.block`)
      if (block && block.block === recipes.get(page.pageType)?.mainBlock)
        problem(
          'main_block_removed',
          `${at}.block`,
          `${block.origin} is the main section of page ${page.origin}: ${MAIN_BLOCK_KEPT}`
        )
      else if (block) {
        page.blocks.splice(page.blocks.indexOf(block), 1)
        for (const id of block.data) removed.add(id)
        unit = `block-removed:${page.origin}:${block.origin}`
      }
    } else if (change.op === 'add_block' && page) {
      insertAfter(page.blocks, change.after, { origin: `new-${i}`, ...blockOf(change.add) }, `${at}.after`)
      unit = `block-added:${page.origin}:new-${i}`
    } else if (change.op === 'set_block_data' && page) {
      const block = blockAt(page, change.block, `${at}.block`)
      if (block) {
        for (const id of block.data) if (!change.data.includes(id)) removed.add(id)
        block.data = [...change.data]
        unit = `block-data:${page.origin}:${block.origin}`
      }
    }
    units.push(unit)
  })
  for (const page of named)
    if (pages.some((p) => p !== page && sameWords(p.name, page.name)))
      problem(
        'page_name_taken',
        `pages[${page.origin}].name`,
        `${JSON.stringify(page.name)} is the name of another page of the plan: give each page its own name`
      )
  const shown = shownIn(pages)
  const takenOff = new Map()
  for (const id of removed) if (!shown.has(id)) takenOff.set(id, REQUESTED_OFF_REASON)
  const channel = (id) =>
    data.byId.get(id)?.what === 'fact' && CONTACT_CHANNEL_KINDS.includes(data.byId.get(id)?.kind)
  for (const page of removedPages)
    for (const id of page.blocks.flatMap((b) => b.data))
      if (!shown.has(id) && !takenOff.has(id) && !channel(id)) takenOff.set(id, REMOVED_PAGE_DATA_REASON)
  return { pages, units, takenOff, removedPages, refused, notDone }
}
