// The items of the menu blocks (`placements.<id>.menu.items`, ticket #597), as the write plan reads them. `from:
// "main-menu"` draws the page items. `from: "pages"` lists pages by the kit's rule (`menuItemPagesOf`, owned by the
// kit: never copied here), each a `url` menu item linking the page's own address (`link: "page-address"`, measured,
// fact K3). Items the order gives a block are written as the order gives them, at most `max`; a block the order shows
// with none of its own lists the pages of the rule, each with its page's menu label. Pure; part of `writePlanOf`.
import { MENU_ITEMS_LINK, menuItemPagesOf } from './ai-quickstart-menu-items.mjs'
import { DraftWriteError } from './draft-write-error.mjs'
import { recordOf } from './draft-write-sink.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const itemsOf = (kit, blockId) => kit.mapping.placements?.[blockId]?.menu?.items

/** Whether a menu block draws the main menu: its items are the page items. */
export const drawsMainMenu = (kit, blockId) => {
  const menu = kit.mapping.placements?.[blockId]?.menu
  return menu?.items ? menu.items.from === 'main-menu' : menu?.menutype === kit.mainMenu
}

/** The form of the link a menu block's item takes: `address` (a `url` item, `page-address`), else an alias item. */
export const menuLinkFormOf = (kit, blockId) =>
  itemsOf(kit, blockId)?.link === 'page-address' ? 'address' : 'alias'

/**
 * Check the menu blocks the order shows, and keep the pages each `from: "pages"` block with no items of its own lists
 * (`state.ruleMenus`: `[{block, pages}]`, once per block). A link the write does not know stops
 * (`menu_items_link_unknown`); more items than `max` stop (`menu_items_over_max`). A block the order leaves to its
 * fallback (`list_below_min`) lists nothing: the order's own reason says why it is empty.
 */
export function checkMenuItems(state) {
  state.ruleMenus = []
  for (const page of state.order.pages)
    for (const block of page.blocks) {
      const items = itemsOf(state.kit, block.block)
      if (items?.from !== 'pages' || block.state !== 'show') continue
      const at = { page: page.id, block: block.block }
      if (!MENU_ITEMS_LINK.includes(items.link))
        throw new DraftWriteError(
          'menu_items_link_unknown',
          `${block.block} links its items as "${items.link}"`,
          {
            ...at,
            link: items.link ?? null
          }
        )
      const own = list(block.items).filter((i) => i.state !== 'hidden')
      if (Number.isInteger(items.max) && own.length > items.max)
        throw new DraftWriteError('menu_items_over_max', `${block.block} holds at most ${items.max} items`, {
          ...at,
          max: items.max,
          items: own.length
        })
      if (own.length || state.ruleMenus.some((m) => m.block === block.block)) continue
      const pages = menuItemPagesOf(items, state.order.pages, state.kit.mapping)
      state.ruleMenus.push({ block: block.block, pages: pages.map((p) => p.id) })
    }
}

/** The menu items the rule lists (`state.ruleMenus`): one `url` item per page, labelled with its page's menu label. */
export function planRuleMenuItems(state) {
  for (const { block, pages } of list(state.ruleMenus)) {
    const menutype = state.kit.mapping.placements[block].menu.menutype
    pages.forEach((target, rank) => {
      const page = state.order.pages.find((p) => p.id === target)
      const record = recordOf(state.sink, `menuItem:${menutype}:${target}`, {
        kind: 'created',
        recordKind: 'menuItem',
        menutype,
        page: target,
        linkTo: target,
        link: { ref: `page:${target}`, form: 'address' },
        title: page?.menu?.label ?? page?.name ?? target,
        order: rank
      })
      record.rules.add('menu_items:rule')
    })
  }
}
