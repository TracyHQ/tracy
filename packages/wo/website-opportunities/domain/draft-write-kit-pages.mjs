// The page of every page type as the kit declares it (`mapping.pages`, ticket #597): the menu item of a page (its link,
// template style, params and parent), an item page reached under its list page (`under`) or on a menu item of its own
// (`ownItem`), the record and category a page creates (`record`), and a page type the write cannot make (`unbuilt`).
// Pure; part of `writePlanOf`. Spec: docs/references/ai-quickstart-contract.md, "What the build writes besides the
// blocks". A kit with no `pages` key keeps the older planner (the featured view, flagged `menu_item_link_not_declared`).
import { CATEGORY_TITLE_FALLBACK, CATEGORY_TITLE_FROM } from './ai-quickstart-build-words.mjs'
import { DraftWriteError } from './draft-write-error.mjs'
import { recordOf } from './draft-write-sink.mjs'
import { checkUnderBlocks } from './draft-write-under-blocks.mjs'

const PLACEHOLDER = /\{([^}]*)\}/g

/** The declaration of a page's type, or null for a kit with no `pages`; stops typed when the kit cannot make it. */
export function pageDeclOf(kit, page) {
  const pages = kit.mapping.pages
  if (!pages) return null
  const decl = pages[page.pageType]
  if (!decl)
    throw new DraftWriteError('page_type_not_declared', `the kit declares no page for ${page.pageType}`, {
      page: page.id,
      pageType: page.pageType
    })
  // A page type the write step cannot make is never planned, so it is never reported written.
  if (decl.unbuilt)
    throw new DraftWriteError('page_unbuilt', `the kit says the write cannot make a ${page.pageType} page`, {
      page: page.id,
      pageType: page.pageType,
      code: decl.unbuilt.code
    })
  return decl
}

const firstOfType = (order, type) => order.pages.find((p) => p.pageType === type) ?? null

/**
 * The pages reached under their list page: `{<page id>: {list, link}}`, the list page's id and the address of the
 * page under it. An item page whose list page is not in the plan is not here: it takes its own menu item (`ownItem`).
 */
export function underPagesOf(state) {
  const out = {}
  for (const page of state.order.pages) {
    const decl = pageDeclOf(state.kit, page)
    const list = decl?.under ? firstOfType(state.order, decl.under.page) : null
    if (!list) continue
    out[page.id] = { list: list.id, link: linkOf(state, page, decl.under.address) }
    checkUnderBlocks(state, page, list, decl.under.detailPositions)
  }
  return out
}

/** The record a page shows (`{record}` of a link): its article or its contact. */
function pageRecordRef(state, page) {
  const kind = state.kit.mapping.pages?.[page.pageType]?.record?.kind
  if (!kind) return null
  return { ref: `${kind}:${state.site.subjectOf(page)}`, form: 'id' }
}

/**
 * The title of a category (`record.category.title`): `{from: "page-name", pageType, fallback: "business-name"}` is the
 * name of the first plan page of `pageType`, else the business name; any other word stops (`category_title_unknown`).
 * A kit that declares no title keeps the name of the list page (`listTitleOf`).
 */
function categoryTitleOf(state, pageType, title) {
  if (title === undefined) return state.site.listTitleOf(pageType)
  if (!CATEGORY_TITLE_FROM.includes(title?.from) || !CATEGORY_TITLE_FALLBACK.includes(title?.fallback))
    throw new DraftWriteError(
      'category_title_unknown',
      `the ${pageType} category title is not one the write knows`,
      {
        pageType,
        from: title?.from ?? null,
        fallback: title?.fallback ?? null
      }
    )
  const page = state.order.pages.find((p) => p.pageType === title.pageType)
  return page?.name ?? (state.order.facts ?? []).find((f) => f.kind === 'business.name')?.value ?? null
}

/** The category the build files the records of a page type in (`pages.<type>.record.category`). */
export function categoryRecordOf(state, pageType) {
  const c = state.kit.mapping.pages?.[pageType]?.record?.category
  return recordOf(state.sink, `category:${pageType}`, {
    kind: 'created',
    recordKind: 'category',
    pageType,
    title: categoryTitleOf(state, pageType, c?.title),
    ...(c ? { extension: c.extension, params: c.params ?? {} } : {})
  })
}

const unresolved = (page, name, why) =>
  new DraftWriteError('page_link_unresolved', `{${name}} of the ${page.pageType} page: ${why}`, {
    page: page.id,
    pageType: page.pageType,
    placeholder: name
  })

/** A link of the kit with its placeholders: kept records written as their ids, the rest as references. */
export function linkOf(state, page, link) {
  const refs = {}
  let template = String(link)
  for (const [whole, name] of String(link).matchAll(PLACEHOLDER)) {
    const [kind, arg] = name.split(':')
    if (kind === 'entity') {
      const id = state.kit.kept.get(arg)?.sourceId
      if (id === undefined || id === null) throw unresolved(page, name, 'no record of the blank site')
      template = template.replace(whole, String(id))
    } else if (name === 'record') {
      refs[name] = pageRecordRef(state, page)
      if (!refs[name]) throw unresolved(page, name, 'the page creates no record')
    } else if (name === 'category' || kind === 'category') {
      const type = arg ?? page.pageType
      if (!state.kit.mapping.pages?.[type]?.record?.category)
        throw unresolved(page, name, 'no category is declared for that page type')
      refs[name] = { ref: categoryRecordOf(state, type).key, form: 'id' }
    } else if (kind === 'page') {
      const target = firstOfType(state.order, arg)
      if (!target) throw unresolved(page, name, 'the plan has no page of that type')
      refs[name] = { ref: `page:${target.id}`, form: 'id' }
    } else throw unresolved(page, name, 'not a placeholder the write knows')
  }
  return { template, refs }
}

/** A template style of the kit: 0 (the default style) or the id of a kept template style. */
function styleOf(state, page, style) {
  if (style === 0 || style === '0') return 0
  const id = state.kit.kept.get(String(style))?.sourceId
  if (id === undefined || id === null)
    throw new DraftWriteError('page_style_unresolved', `${style} is no template style of the blank site`, {
      page: page.id,
      pageType: page.pageType
    })
  return Number(id)
}

/**
 * The menu item of a page as the kit declares it (`menuItem`, or `ownItem` for an item page with no list page in the
 * plan): its link, template style, params and parent page. A parent page type the plan has no page of puts the item at
 * the top of the main menu, as the step chain placed every page the plan did not nest (`menuPlacements`, parent 1): a
 * planned page is written whether or not its kit parent is planned, and the site map lists it as a top level page
 * (`menuItemPagesOf`, the same rule).
 */
export function pageItemOf(state, page, decl) {
  const item = decl.menuItem ?? decl.ownItem
  const at = item.parent === undefined ? null : firstOfType(state.order, item.parent)
  const parent = at ? { ref: `page:${at.id}`, form: 'id' } : null
  return {
    link: linkOf(state, page, item.link),
    item: {
      templateStyle: styleOf(state, page, item.templateStyle),
      params: item.params ?? {},
      ...(parent ? { parent } : {})
    },
    own: Boolean(decl.ownItem && !decl.menuItem)
  }
}
