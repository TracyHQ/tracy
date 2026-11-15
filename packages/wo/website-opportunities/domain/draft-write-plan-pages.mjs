// The pages of the draft write (ticket #597): the menu item of every order page in the menu the header draws, the SEO
// title, description and share image of each page on the record `mapping.seo.pageTypes` names (a menu item, or the
// article of an article page) and the items of the footer menus (the categories: `draft-write-plan-categories.mjs`).
// Pure; part of `writePlanOf`. The page of each page type as the kit declares it: `draft-write-kit-pages.mjs`.
import { DraftWriteError } from './draft-write-error.mjs'
import { drawsMainMenu } from './draft-write-kit-build.mjs'
import { pageDeclOf, pageItemOf } from './draft-write-kit-pages.mjs'
import { conflict, consume, put, recordOf, skip, unproven } from './draft-write-sink.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The menu every page goes in: the menu the layout-drawn header names (`placements.header.menu`). */
export const mainMenuOf = (mapping) =>
  Object.values(mapping.placements ?? {}).find((p) => p.layout && p.menu)?.menu.menutype ?? 'mainmenu'

function seoOfPage(state, page) {
  const decl = state.kit.mapping.seo ?? {}
  const ids = ['title', 'description', 'shareImage'].map((f) => `seo:${page.id}.${f}`)
  const name = decl.pageTypes?.[page.pageType]
  if (typeof name !== 'string' || !decl[name]) {
    for (const id of ids) skip(state.sink, id, name ? 'seo_derived_by_template' : 'seo_record_not_declared')
    if (!name) unproven(state.sink, 'seo_record_not_declared', { page: page.id, pageType: page.pageType })
    return
  }
  const target = state.site.pageRecordOf(page)
  const at = (locs, value, entry) => {
    for (const loc of list(locs))
      put(state.sink, target.key, loc, value, { entry, rule: 'seo', init: target.init })
  }
  const record = decl[name]
  at(record.title, page.seo.title, ids[0])
  at(record.ogTitle?.locations, page.seo.title, ids[0])
  at(record.description, page.seo.description, ids[1])
  const share = page.seo.shareImage
  const picture = share?.frame ? state.order.pictures.find((p) => p.frame === share.frame) : null
  if (!picture)
    return skip(state.sink, ids[2], share?.source === 'logo' ? 'share_image_is_logo' : 'share_image_none')
  state.pictures.set(picture.frame, { id: picture.frame, kind: 'picture', picture })
  at(record.shareImage, { ref: `picture:${picture.frame}` }, ids[2])
}

/**
 * What a page's menu item opens: the article of an article page, the contact of the contact page, else the CMS's
 * featured view, the view the copy proof built every landing page with. The mapping file names no menu item link per
 * page type, so a page that is neither is reported `unproven`.
 */
function linkOf(state, page) {
  if (state.kit.mapping.seo?.pageTypes?.[page.pageType] === 'article')
    return { ref: `article:${state.site.subjectOf(page)}`, form: 'articleLink' }
  const contact = page.blocks.find(
    (b) =>
      state.kit.store.get(b.block)?.type === 'contact' &&
      state.kit.store.get(b.block)?.placement === 'created'
  )
  if (contact) return { ref: `contact:${state.site.subjectOf(page)}`, form: 'contactLink' }
  if (!page.home)
    unproven(state.sink, 'menu_item_link_not_declared', { page: page.id, pageType: page.pageType })
  return { fixed: 'index.php?option=com_content&view=featured' }
}

/**
 * Positions T4 prints only under its `detail-article` sub layout, which it applies only to an article reached under its
 * list page's menu item, never on the article's own menu item (measured on JA Boxing 1.0.11, "Page facts"). The kit
 * does not declare them: these are the measured ones.
 */
export const DETAIL_POSITIONS = Object.freeze(['detail-bottom-1', 'main-bottom-2'])

/** The blocks of a page whose menu item opens its own article that sit only in a detail position: they print nothing. */
export const unprintedBlocksOf = (kit, page, link) =>
  link?.form !== 'articleLink' && !link?.own
    ? []
    : page.blocks
        .filter((b) => b.state !== 'hidden')
        .filter((b) => {
          const positions = kit.store.get(b.block)?.positions ?? []
          return positions.length > 0 && positions.every((p) => DETAIL_POSITIONS.includes(p))
        })
        .map((b) => b.id)

/**
 * The page menu items, then each page's SEO. A page reached under its list page (`state.under`) has no menu item of
 * its own: its address is the list page's item, and its menu entry is skipped (`page_reached_under`).
 */
export function planPages(state) {
  const menutype = mainMenuOf(state.kit.mapping)
  for (const page of state.order.pages) {
    const decl = pageDeclOf(state.kit, page)
    if (state.under?.[page.id]) {
      skip(state.sink, `menu:${page.id}`, 'page_reached_under', { list: state.under[page.id].list })
      seoOfPage(state, page)
      continue
    }
    const record = recordOf(state.sink, `menuItem:${menutype}:${page.id}`, {
      kind: 'created',
      recordKind: 'menuItem',
      menutype,
      page: page.id,
      pageType: page.pageType,
      home: page.home === true,
      title: page.menu.label,
      order: page.menu.order
    })
    consume(state.sink, `menu:${page.id}`, record.key)
    if (decl) {
      const declared = pageItemOf(state, page, decl)
      record.link = { ...declared.link, own: declared.own }
      record.item = declared.item
    } else record.link = linkOf(state, page)
    for (const block of unprintedBlocksOf(state.kit, page, record.link))
      unproven(state.sink, 'detail_position_not_printed', { page: page.id, block })
    seoOfPage(state, page)
  }
}

/**
 * The items of the menu blocks: one menu item per item, its label and its page together. A menu block that draws the
 * main menu (the phone menu) shows the page items `planPages` made: its items make no rival record, and their entries
 * are skipped (`menu_item_is_page_item`), since the page's own item already holds its label and page; a label in
 * other words than the page's menu label is a conflict the page item wins (`address_conflict`, `kept: page_item`).
 * Two items of another menu for one page make one item: the second is `address_shared`, or `address_conflict` when
 * its label differs.
 */
export function planMenuItems(state) {
  const byItem = new Map()
  for (const { at, entry } of state.menuLinks) {
    const key = `${at.page.id}.${at.item.at}`
    byItem.set(key, [...(byItem.get(key) ?? []), { at, entry }])
  }
  for (const group of byItem.values()) {
    const { at } = group[0]
    const menutype = state.kit.mapping.placements[at.block.block].menu.menutype
    const main = drawsMainMenu(state.kit, at.block.block)
    const label = group.find((g) => g.entry.type === 'text' && g.entry.value)?.entry
    const link = group.find((g) => g.entry.from === 'derived')?.entry
    const target = link?.target?.page
    if (!label || !target) {
      const reason = target ? 'menu_item_without_label' : 'menu_item_without_page'
      for (const g of group) skip(state.sink, g.entry.place, reason)
      continue
    }
    // A page reached under its list page has no item: the main menu does not show it, and another menu's item
    // would have to link to an address, which no door has been measured to write.
    if (state.under?.[target]) {
      if (!main)
        throw new DraftWriteError(
          'menu_item_to_under_page',
          `${at.block.block} links to a page with no menu item`,
          {
            block: at.block.block,
            page: target
          }
        )
      for (const g of group) skip(state.sink, g.entry.place, 'page_reached_under')
      continue
    }
    const key = `menuItem:${menutype}:${target}`
    // The main menu's item of a page is the page item (`planPages`, its label the page's menu label); another menu's
    // item of a page already listed there is that item. The same words are shared; other words are a conflict.
    const held = main ? null : state.sink.records.get(key)
    if (main || held) {
      const words = main ? state.order.pages.find((p) => p.id === target)?.menu?.label : held.title
      for (const g of group)
        if (g.entry === label && words !== undefined && words !== label.value)
          conflict(state.sink, g.entry.place, {
            by: main ? `menu:${target}` : held.labelEntry,
            record: key,
            address: 'title',
            kept: main ? 'page_item' : 'first'
          })
        else
          skip(state.sink, g.entry.place, main ? 'menu_item_is_page_item' : 'address_shared', { record: key })
      continue
    }
    const record = recordOf(state.sink, key, {
      kind: 'created',
      recordKind: 'menuItem',
      menutype,
      page: target,
      linkTo: target,
      link: { ref: `page:${target}`, form: 'alias' },
      title: label.value,
      labelEntry: label.place
    })
    for (const g of group) consume(state.sink, g.entry.place, record.key)
  }
}
