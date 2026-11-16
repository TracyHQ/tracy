// No link to an author page the build does not make (ticket #597, gate run 7): a built post printed "Written by" with a
// link to its author's page while the kit declares the author pages unbuilt (`pages.author.unbuilt`,
// `pages.authors.unbuilt`). T4 prints that line, a link to the author view, wherever `show_author` is on
// (`html/layouts/joomla/content/info_block/author.php` of its base theme, through `T4\Helper\Author::authorInfo`), and
// com_content's own setting turns it on for every article and every list that does not turn it off. The param belongs
// to the kit's declarations: a created article's `pages.<type>.record.base.attribs`, a page's
// `pages.<type>.menuItem.params`; the write never sets a param the kit does not declare. So the plan names, typed, every
// article and every content list menu item it writes with `show_author` not `"0"` while the author pages are unbuilt
// (`author_link_to_unbuilt_page`, with the kit key that would turn it off), and the kit's team adds those keys. Pure;
// part of `opsOf`.

const AUTHOR_PAGES = ['author', 'authors']
/** The menu item views of com_content that print an article's info block (a list's items or the article). */
const PRINTS_ITEMS = /option=com_content&view=(?:featured|category|article)\b/

const parsed = (value) => {
  if (value && typeof value === 'object') return value
  try {
    return JSON.parse(String(value ?? '{}'))
  } catch {
    return {}
  }
}
const off = (params) => String(parsed(params).show_author ?? '') === '0'

/** Whether the kit declares no author page built. */
const authorsUnbuilt = (mapping) =>
  AUTHOR_PAGES.some((type) => mapping.pages?.[type]?.unbuilt) &&
  !AUTHOR_PAGES.some((type) => mapping.pages?.[type] && !mapping.pages[type].unbuilt)

/** Flag every written article and content list item that would print a link to an unbuilt author page. */
export function flagAuthorLinks(state, ops) {
  if (!authorsUnbuilt(state.kit.mapping)) return
  const at = new Set()
  for (const op of ops) {
    if (op.kind === 'article.create' && op.pageType && !off(op.base?.attribs))
      at.add(`pages.${op.pageType}.record.base.attribs.show_author`)
    const link = String(op.link?.template ?? '')
    const page = op.key.startsWith(`menuItem:${state.kit.mainMenu}:`) ? op.key.split(':')[2] : null
    if (op.kind === 'menuItem.create' && page && PRINTS_ITEMS.test(link) && !off(op.item?.params))
      at.add(
        `pages.${state.order.pages.find((p) => p.id === page)?.pageType ?? page}.menuItem.params.show_author`
      )
  }
  for (const key of [...at].sort())
    state.sink.unproven.push({ code: 'author_link_to_unbuilt_page', kitKey: key, wants: '0' })
}
