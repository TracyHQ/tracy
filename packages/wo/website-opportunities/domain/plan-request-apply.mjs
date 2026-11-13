// The changes of a change request applied to the current plan (ticket #617). The plan is turned back into the
// composition the rules gate reads (`plan-gate.mjs`), every page and block keeping the id it has on the plan, so a
// change names exactly what it touches. Only the changes are applied: nothing else of the plan can move, which is
// how what the customer settled before (earlier answers and plan edits) stays as it is. Each applied change records the
// unit of the plan it changes (`unitOf`), so the readable lines can later be held to the real difference
// (`plan-request-lines.mjs`). A change naming a page or block the plan does not have is a problem for the re-compose.
// Pure: the plan given is never changed.

/** The left out reason of data the customer asked to take off the plan. */
export const REQUESTED_OFF_REASON = 'You asked to take this off the plan.'

const list = (value) => (Array.isArray(value) ? value : [])
const blockOf = ({ block, label, data, reason, targets }) => ({
  block,
  label,
  data: [...data],
  reason,
  ...(targets ? { targets: [...targets] } : {})
})

/** The plan's pages as a working composition: each page and block with its plan id as `origin`. */
export function workingPagesOf(plan) {
  return list(plan?.pages).map((page) => ({
    origin: page.id,
    pageType: page.pageType,
    name: page.name,
    blocks: page.blocks.map((b) => ({ origin: b.id, ...blockOf(b) }))
  }))
}

/** The composition the gate reads, from working pages: no ids. */
export const compositionPagesOf = (pages) =>
  pages.map(({ pageType, name, blocks }) => ({ pageType, name, blocks: blocks.map(blockOf) }))

const shownIn = (pages) => new Set(pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))

/**
 * Apply the changes in order to working pages.
 * @param {object} plan the current plan
 * @param {object[]} changes the model's changes, shape already checked (`plan-request-reply.mjs`)
 * @param {(code: string, at: string, message: string) => void} problem
 * @returns {{pages: object[], units: Array<string | null>, takenOff: Set<string>}} `units[i]`: the unit change `i`
 *   changes (`page-removed:<id>`, `page-renamed:<id>`, `page-order`, `page-added:new-<i>`, `block-removed:<page>:<block>`,
 *   `block-added:<page>:<block>`, `block-data:<page>:<block>`); `takenOff`: ids a removed section or a shortened data
 *   list took off that no block shows any more
 */
export function applyRequestChanges(plan, changes, problem) {
  const pages = workingPagesOf(plan)
  const units = []
  const removed = new Set()
  const pageAt = (id, at) => {
    const page = pages.find((p) => p.origin === id)
    if (!page) problem('change_target_missing', at, `${JSON.stringify(id)} is not a page id of the plan`)
    return page
  }
  const blockAt = (page, id, at) => {
    const block = page?.blocks.find((b) => b.origin === id)
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
      unit = `page-removed:${page.origin}`
    } else if (change.op === 'rename_page' && page) {
      page.name = change.name
      unit = `page-renamed:${page.origin}`
    } else if (change.op === 'order_pages') {
      const now = pages.map((p) => p.origin)
      const same = change.pages.length === now.length && now.every((id) => change.pages.includes(id))
      if (!same) problem('change_target_missing', `${at}.pages`, `list every page id once: ${now.join(', ')}`)
      else pages.sort((a, b) => change.pages.indexOf(a.origin) - change.pages.indexOf(b.origin))
      unit = 'page-order'
    } else if (change.op === 'add_page') {
      const added = { origin: `new-${i}`, pageType: change.pageType, name: change.name }
      insertAfter(pages, change.after, { ...added, blocks: change.blocks.map(blockOf) }, `${at}.after`)
      unit = `page-added:new-${i}`
    } else if (change.op === 'remove_block' && page) {
      const block = blockAt(page, change.block, `${at}.block`)
      if (block) {
        page.blocks.splice(page.blocks.indexOf(block), 1)
        for (const id of block.data) removed.add(id)
        unit = `block-removed:${page.origin}:${block.block}`
      }
    } else if (change.op === 'add_block' && page) {
      insertAfter(page.blocks, change.after, { origin: `new-${i}`, ...blockOf(change.add) }, `${at}.after`)
      unit = `block-added:${page.origin}:${change.add.block}`
    } else if (change.op === 'set_block_data' && page) {
      const block = blockAt(page, change.block, `${at}.block`)
      if (block) {
        for (const id of block.data) if (!change.data.includes(id)) removed.add(id)
        block.data = [...change.data]
        unit = `block-data:${page.origin}:${block.block}`
      }
    }
    units.push(unit)
  })
  const shown = shownIn(pages)
  return { pages, units, takenOff: new Set([...removed].filter((id) => !shown.has(id))) }
}
