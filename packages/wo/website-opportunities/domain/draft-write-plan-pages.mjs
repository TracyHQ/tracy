// The pages of the draft write (ticket #597): the menu item of every order page in the menu the header draws, the SEO
// title, description and share image of each page on the record `mapping.seo.pageTypes` names (a menu item, or the
// article of an article page), the items of the footer menus, and the category each created article is filed in.
// Pure; part of `writePlanOf`.
import { consume, put, recordOf, skip, unproven } from './draft-write-sink.mjs'

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

/** The page menu items, then each page's SEO. */
export function planPages(state) {
  const menutype = mainMenuOf(state.kit.mapping)
  const featured = state.kit.mapping.seo?.featuredView
  for (const page of state.order.pages) {
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
    record.link = linkOf(state, page)
    seoOfPage(state, page)
    if (list(featured?.pageTypes).includes(page.pageType) && page.home)
      unproven(state.sink, 'featured_article_needed', { page: page.id, why: featured.needs })
  }
}

/** The items of the menu blocks (a footer menu): one menu item per item, its label and its page together. */
export function planMenuItems(state) {
  const byItem = new Map()
  for (const { at, entry } of state.menuLinks) {
    const key = `${at.page.id}.${at.item.at}`
    byItem.set(key, [...(byItem.get(key) ?? []), { at, entry }])
  }
  for (const group of byItem.values()) {
    const { at } = group[0]
    const menutype = state.kit.mapping.placements[at.block.block].menu.menutype
    const label = group.find((g) => g.entry.type === 'text' && g.entry.value)?.entry
    const link = group.find((g) => g.entry.from === 'derived')?.entry
    const target = link?.target?.page
    if (!label || !target) {
      for (const g of group) skip(state.sink, g.entry.place, 'menu_item_without_page')
      continue
    }
    const key = `menuItem:${menutype}:${target}`
    if (state.sink.records.has(key)) {
      for (const g of group) skip(state.sink, g.entry.place, 'address_shared', { record: key })
      continue
    }
    const record = recordOf(state.sink, key, {
      kind: 'created',
      recordKind: 'menuItem',
      menutype,
      page: target,
      linkTo: target,
      link: { ref: `page:${target}`, form: 'alias' },
      title: label.value
    })
    for (const g of group) consume(state.sink, g.entry.place, record.key)
  }
}

/** The category every created article is filed in, from the `buildSets` place that reads it, and those categories. */
export function planCategories(state) {
  const sets = Object.values(state.kit.mapping.buildSets ?? {}).filter((s) => s.sets === 'category')
  const types = new Set(sets.map((s) => s.pageType))
  // The articles first: a category record is added while they are walked.
  const articles = [...state.sink.records.values()].filter((record) => record.recordKind === 'article')
  for (const record of articles) {
    const page = state.site.pageOfSubject(record.subject)
    const pageType = page?.pageType ?? state.site.listedTypeOf(record.subject)
    if (!types.has(pageType)) {
      unproven(state.sink, 'article_category_not_declared', { record: record.key })
      continue
    }
    record.category = `category:${pageType}`
    recordOf(state.sink, record.category, {
      kind: 'created',
      recordKind: 'category',
      pageType,
      title: state.site.listTitleOf(pageType)
    })
  }
}
