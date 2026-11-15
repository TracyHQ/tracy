// The other way round of the marker test (ticket #585): each value the write plan wrote that no render shows, with the
// reason the pages give. A block copy is a module the page prints as `id="Mod<id>"` (T4 and Joomla's own chrome): when
// the page's HTML has no such module, the block was not printed at all (its position is not in the page's layout, or it
// is assigned to no page); when it has it, the block was printed without that value (a place the template does not read,
// a value its layout leaves out). A row of a site-wide copy keyed to a page (a masthead row per menu item) is judged
// on the page its row names. Pure.
import { codesIn } from './marker-codec.mjs'
import { placeKeyOf, universeOf } from './universe.mjs'

/** The page id of a plan entry (`<page>.<block>.<field>`), or null. */
const pageOfEntry = (entry) => (typeof entry === 'string' ? entry.split('.')[0] : null)

/**
 * The page a keyed row of a copy shows on: a copy whose rows are keyed to pages (`<list>.<field>[i]` beside
 * `<list>.item_id[i]` that the plan writes as a page reference) shows row `i` on that page only, so a value of the row
 * is judged there, not on the page whose block created the copy. Null for a value of no keyed row.
 */
function rowPageOf(op, loc) {
  const p = loc?.jsonPath
  if (!Array.isArray(p) || p.length < 3 || typeof p[2] !== 'number') return null
  for (const v of op.values ?? []) {
    const q = v.loc?.jsonPath
    const ref = String(v.value?.ref ?? '')
    if (Array.isArray(q) && q[0] === p[0] && q[1] !== p[1] && q[2] === p[2] && ref.startsWith('page:'))
      return ref.slice('page:'.length)
  }
  return null
}

/**
 * The list items of a write plan a page's block does not show while it shows another of them (review 4): an item is an
 * article the plan creates whose entries sit under one block (`<page>.<block>.<item>.<field>`). Which items a list
 * shows is the site's choice (a blog sorts by date and the build writes every item within seconds, so ties fall in no
 * fixed order; a list shows one page of its items), so an item the page does not show, while it shows a sibling, is
 * not judged. Returns `Map<"<page>.<block>.<item>", {shown: number, items: number}>` for each item not shown.
 */
function listItemsNotShownOf(writePlan, htmlOf, uploaded) {
  const articles = new Set(
    (writePlan?.ops ?? [])
      .filter((o) => o.kind === 'article.create')
      .map((o) => o.key.slice('article:'.length))
  )
  const itemOf = (entry) => {
    const p = String(entry ?? '').split('.')
    return p.length >= 4 && articles.has(p[2]) ? { page: p[0], block: p[1], item: p[2] } : null
  }
  const blocks = new Map()
  const add = (at, shows) => {
    const key = `${at.page}.${at.block}`
    const items = blocks.get(key) ?? new Map()
    items.set(at.item, (items.get(at.item) ?? false) || shows)
    blocks.set(key, items)
  }
  const pageCodes = new Map()
  const codesOn = (page) => {
    if (!pageCodes.has(page)) pageCodes.set(page, new Set(codesIn(htmlOf.get(page) ?? '')))
    return pageCodes.get(page)
  }
  for (const op of writePlan?.ops ?? [])
    for (const v of op.values ?? []) {
      const at = typeof v.value === 'string' ? itemOf(v.entry) : null
      if (at)
        add(
          at,
          codesIn(v.value).some((c) => codesOn(at.page).has(c))
        )
    }
  for (const [key, path] of Object.entries(uploaded ?? {})) {
    const at = itemOf(key.replace(/^picture:/, ''))
    if (at) add(at, (htmlOf.get(at.page) ?? '').includes(String(path).replace(/^\/+/, '')))
  }
  const out = new Map()
  for (const [key, items] of blocks) {
    const shown = [...items.values()].filter(Boolean).length
    if (!shown || shown === items.size) continue
    for (const [item, shows] of items) if (!shows) out.set(`${key}.${item}`, { shown, items: items.size })
  }
  return out
}

/** The list item key of an entry (`<page>.<block>.<item>`). */
const listKeyOf = (entry) =>
  String(entry ?? '')
    .split('.')
    .slice(0, 3)
    .join('.')

/**
 * @param {{writePlan: object, registry: object[], seen: Set<string>, renders: object[], ids: Record<string, number>,
 *   uploaded: Record<string, string>, pictures: Set<string>}} input
 * @returns {Array<{code?: string, picture?: string, entry: string | null, op: string, loc: object | null,
 *   stood: string | null, reason: string, module?: number}>}
 */
export function notSeenOf({
  writePlan,
  registry,
  seen,
  renders,
  ids = {},
  uploaded = {},
  pictures = new Set()
}) {
  const what = new Map((registry ?? []).map((e) => [e.code, e]))
  const htmlOf = new Map()
  for (const r of renders ?? [])
    if (r.html) htmlOf.set(r.pageType, `${htmlOf.get(r.pageType) ?? ''}${r.html}`)
  const reasonOf = (op, entry, loc = null) => {
    const id = ids[op.key]
    const page = rowPageOf(op, loc) ?? pageOfEntry(entry)
    if (op.kind === 'module.copy' && id) {
      const html = htmlOf.get(page)
      if (html === undefined) return { reason: 'page_not_rendered', module: id }
      return html.includes(`id="Mod${id}"`)
        ? { reason: 'block_printed_without_value', module: id }
        : { reason: 'block_not_printed', module: id }
    }
    if (op.kind === 'article.create') {
      const item = op.key.split(':').slice(1).join(':')
      if (!htmlOf.has(`article:${item}`)) return { reason: 'article_not_rendered' }
    }
    return { reason: 'value_not_printed' }
  }
  const notChosen = listItemsNotShownOf(writePlan, htmlOf, uploaded)
  // A row of an item its list did not show carries that fact, so a record read back declares it the same way.
  const listOf = (entry) => {
    const hit = notChosen.get(listKeyOf(entry))
    return hit ? { listItem: { shown: hit.shown, items: hit.items } } : {}
  }
  const out = new Map()
  for (const op of writePlan?.ops ?? [])
    for (const v of op.values ?? []) {
      if (typeof v.value !== 'string') continue
      for (const code of codesIn(v.value))
        if (!seen.has(code) && !out.has(code))
          out.set(code, {
            code,
            entry: v.entry ?? null,
            op: op.key,
            loc: v.loc ?? null,
            stood: what.get(code)?.what ?? null,
            page: rowPageOf(op, v.loc) ?? pageOfEntry(v.entry),
            ...reasonOf(op, v.entry, v.loc),
            ...listOf(v.entry)
          })
    }
  const opsByKey = new Map((writePlan?.ops ?? []).map((o) => [o.key, o]))
  for (const [key, path] of Object.entries(uploaded ?? {})) {
    const file = String(path).replace(/^\/+/, '')
    if (pictures.has(file)) continue
    const entry = key.replace(/^picture:/, '')
    // The copy that shows the picture: the operation of its page block.
    const [page, block] = entry.split('.')
    const copy = opsByKey.get(`copy:${page}.${block}`) ?? opsByKey.get(key) ?? { key, kind: 'picture.upload' }
    out.set(file, {
      picture: file,
      entry,
      op: key,
      loc: null,
      stood: 'picture',
      ...reasonOf(copy, entry),
      ...listOf(entry)
    })
  }
  return [...out.values()]
}

/**
 * Each written value no page shows, with the declared reason it may not show (`declared`), or null: a conflict the
 * real write reported for its entry (`write_conflict`), a flag the write plan raised on its block or entry (its code),
 * the kit's own word that the place prints nothing (`prints: false` with `why` on the mapping location), or an item of
 * a list its block did not show while showing another (`list_item_not_shown`, from the row's `listItem`). A value with
 * no declared reason fails the verdict.
 * @param {object[]} notSeen `notSeenOf`
 * @param {{conflicts?: string[], unproven?: object[], mapping?: object}} context
 */
export function declareNotSeen(notSeen, { conflicts = [], unproven = [], mapping = null } = {}) {
  const conflicted = new Set(conflicts)
  const silent = new Map()
  for (const p of universeOf(mapping).values())
    if (p.loc?.prints === false) silent.set(p.key, p.loc.why ?? 'declared')
  return notSeen.map((n) => {
    const entry = String(n.entry ?? '')
    const flag = unproven.find(
      (u) =>
        (u.entry && (entry === u.entry || entry.startsWith(`${u.entry}.`))) ||
        (u.block && u.page && entry.startsWith(`${u.page}.${u.block}.`))
    )
    const kit = n.loc ? silent.get(placeKeyOf(n.loc)) : undefined
    const declared = conflicted.has(entry)
      ? 'write_conflict'
      : flag
        ? flag.code
        : kit
          ? `kit_declares_not_printed: ${kit}`
          : n.listItem
            ? 'list_item_not_shown'
            : null
    return { ...n, declared }
  })
}
