/**
 * The rules of the site plan check (`site-plan-check.js`) for pages the plan adds (spec TracyHQ/tracy#231, ticket #238). A
 * page is added only by copying a template page layout the build knows how to copy, and only for an item of the brief that
 * no other page of that layout shows: never a new layout, never more pages than the brief has items for.
 */

const norm = (/** @type {unknown} */ s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])

/**
 * Whether the build can copy a template page layout, and how: a record page family by one of its records, joined to the
 * family's parent so its listing lists the copy; a page by the article it opens as its body. A page whose body is a list, a
 * component view or nothing is no layout to copy: a copy would show the same thing again.
 * @param {any} element - an inventory element
 * @returns {string | null} why it cannot be copied, or null when it can
 */
export function uncopiable(element) {
  if (!element) return 'it is not a page of the template'
  if (element.kind === 'record-page')
    return !list(element.entities).length
      ? 'its family lists no record page'
      : element.listing
        ? null
        : 'no page lists its family (the content map declares no listing)'
  if (element.kind === 'page')
    return /^article-\d+$/.test(String(element.body ?? ''))
      ? null
      : 'it opens no article of its own (a list or a component view: a copy would show the same again)'
  return 'it is not a page or record page'
}

/** The names of the brief's items an added page may show: its offerings and its people. */
function briefItems(/** @type {any} */ site) {
  const sheet = site?.factSheet ?? {}
  return new Set(
    [...list(sheet.offerings), ...list(sheet.people)].map((i) => norm(i?.name)).filter(Boolean)
  )
}

/**
 * Every added page shows exactly one item of the brief, which no other added page and no record of the layout it copies
 * already shows: the plan never adds more pages than the brief has items for.
 * @param {any} plan @param {Map<string, any>} elements @param {any} site
 */
export function addedItemReasons(plan, elements, site) {
  const out = []
  const items = briefItems(site)
  const decisionOf = new Map(list(plan?.decisions).map((d) => [String(d?.element), d]))
  const pageOf = new Map(list(plan?.pages).map((p) => [String(p?.id), p]))
  /** The items the template's own pages of a layout already show. */
  const shownBy = (/** @type {string} */ layout) =>
    new Set(
      [...list(decisionOf.get(layout)?.items), ...list(pageOf.get(layout)?.items)].map(norm).filter(Boolean)
    )
  /** @type {Map<string, string>} item → the added page that shows it */
  const taken = new Map()
  for (const page of list(plan?.pages).filter((p) => p?.decision === 'add')) {
    const id = String(page.id)
    const named = list(page.items).map(norm).filter(Boolean)
    const refuse = (/** @type {string} */ message) => out.push({ rule: 'added-page-item', element: id, message })
    if (named.length !== 1) {
      refuse(`added page ${id} must show exactly one item of the brief in "items"; it names ${named.length}`)
      continue
    }
    const [item] = named
    const copies = String(page.copies ?? '')
    if (!items.has(item))
      refuse(
        `added page ${id} shows "${page.items[0]}", which is no offering or person of the brief: a page is added only for an item the brief lists`
      )
    else if (taken.has(item))
      refuse(`added page ${id} shows "${page.items[0]}", which added page ${taken.get(item)} already shows`)
    else if (elements.get(copies)?.kind === 'record-page' && shownBy(copies).has(item))
      refuse(`added page ${id} shows "${page.items[0]}", which a record page of ${copies} already shows`)
    else taken.set(item, id)
  }
  return out
}
