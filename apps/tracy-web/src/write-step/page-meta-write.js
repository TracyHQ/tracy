// Page titles, descriptions and hidden main menu items (ADR 0044, decision 4, item 4). A Joomla page's title and
// description live in its menu item's `params` (`page_title`, `menu-meta_description`), one JSON column written whole,
// so every other setting of the item is kept as read. The kit says which path a page opens; the live menu says which
// item has that path. A menu item the plan hides is unpublished through the same `content.update` door that hides a
// module. A page that is an article routed under a category's menu item has no item of its own: its title and description
// live on the article (`attribs.article_page_title`, `metadesc`), which Joomla prefers when the active item is not the
// article's. Nothing here names a template: a page with neither is reported skipped, never guessed.
import { NO_LAST } from './no-last-report.js'
import { readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const slashless = (path) =>
  String(path ?? '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
const PAGE_ROWS = 25
const FIELDS = [
  ['title', 'page_title'],
  ['description', 'menu-meta_description']
]

/** A row's params as an object; a column that is not JSON counts as empty and is written over. */
export function paramsOf(value) {
  try {
    const read = typeof value === 'string' ? JSON.parse(value) : value
    return read && typeof read === 'object' && !Array.isArray(read) ? read : {}
  } catch {
    return {}
  }
}

/** Every menu item, whole rows, a page of the door at a time. */
export async function menuRows(call) {
  const rows = []
  for (let offset = 0; offset < 5000; offset += PAGE_ROWS) {
    const answer = await call('content.list', {
      kind: 'menuItem',
      limit: PAGE_ROWS,
      offset,
      include_body: true
    })
    const items = each(answer?.items)
    rows.push(...items)
    if (items.length < PAGE_ROWS) break
  }
  return rows
}

/** The published items that open this kit page: the home item for the root path, else the item at the path. */
export function rowsOpening(page, rows, menutype = null) {
  const path = slashless(page.path)
  const found = rows.filter(
    (row) =>
      Number(row.published) === 1 &&
      Number(row.id) > 1 &&
      (path === '' ? Number(row.home) === 1 : slashless(row.path) === path)
  )
  const inMenu = menutype ? found.filter((row) => row.menutype === menutype) : []
  return inMenu.length ? inMenu : found
}

/** The article a kit page prints as its body, as its row id; a page that is a menu item has none of its own. */
export function articleOfPage(page, kit) {
  const blocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const ids = new Set(Object.values(page?.blocks ?? {}).flat())
  for (const id of ids) {
    const match = /^article-(\d+)$/.exec(String(blocks.get(id)?.source?.owner ?? ''))
    if (match && blocks.get(id).source.ownerKind === 'article') return Number(match[1])
  }
  return null
}

const skipped = (reason) => ({ status: 'skipped', reason })
const failed = (reason) => ({ status: 'failed', reason })

/** The fields that differ, on the article a page prints; its other settings stay as read. */
async function writeArticleMeta({ call, id, fresh, results }) {
  const title = fresh.find((f) => f.name === 'title')
  const description = fresh.find((f) => f.name === 'description')
  try {
    const fields = {}
    if (title) {
      const answer = await call('content.get', { kind: 'article', id })
      fields.attribs = JSON.stringify({ ...paramsOf(answer?.item?.attribs), article_page_title: title.value })
    }
    if (description) fields.metadesc = description.value
    await call('content.update', { kind: 'article', id, fields })
    if (title)
      results.set(title.slot, {
        status: 'written',
        ordered: title.value,
        readFrom: readRow('article', id, 'attribs', ['article_page_title'])
      })
    if (description)
      results.set(description.slot, {
        status: 'written',
        ordered: description.value,
        readFrom: readRow('article', id, 'metadesc')
      })
  } catch (error) {
    for (const f of fresh) results.set(f.slot, failed(error.message))
  }
}

/**
 * @param {{ call: (action: string, params: object) => Promise<any>, kit: object,
 *   pageMeta: Record<string, { title: string, description: string }>,
 *   hide: { item: string }[], menutype?: string | null, results: Map<string, object>, last?: object }} input
 *   `results` is filled by line slot: `<page>:title`, `<page>:description`, and the hidden item's key; `last`: the last report
 */
export async function writePageMeta({ call, kit, pageMeta, hide, menutype = null, results, last = NO_LAST }) {
  const pages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const wanted = Object.entries(pageMeta ?? {})
  const reasons = (page, reason) => {
    results.set(`${page}:title`, skipped(reason))
    results.set(`${page}:description`, skipped(reason))
  }
  const mappable = wanted.filter(([page]) => {
    if (pages.has(page)) return true
    reasons(page, 'the kit has no page with this id, so no site page to put the words on')
    return false
  })
  // A field the site holds already is not written, so an unchanged page needs no row at all.
  const stale = new Map()
  for (const [page, meta] of mappable) {
    const fields = FIELDS.map(([name, key]) => ({ name, key, value: meta[name], slot: `${page}:${name}` }))
    const fresh = fields.filter((f) => !last.same(f.slot, f.value))
    for (const f of fields)
      if (!fresh.includes(f))
        results.set(f.slot, { status: 'written', ordered: f.value, readFrom: last.line(f.slot).readFrom })
    if (fresh.length) stale.set(page, fresh)
  }
  const items = each(hide).filter((entry) => {
    if (!last.same(entry.item, '0')) return true
    results.set(entry.item, { status: 'written', ordered: '0', readFrom: last.line(entry.item).readFrom })
    return false
  })
  if (!stale.size && !items.length) return
  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    const reason = `the menu could not be read: ${error.message}`
    for (const fresh of stale.values()) for (const f of fresh) results.set(f.slot, failed(reason))
    rows = null
  }
  for (const [page, fresh] of rows ? stale : []) {
    const opening = rowsOpening(pages.get(page), rows, menutype)
    if (!opening.length) {
      const article = articleOfPage(pages.get(page), kit)
      if (article === null) {
        const reason =
          'no published menu item or article opens this page, so a page title has no place to live'
        for (const f of fresh) results.set(f.slot, skipped(reason))
      } else await writeArticleMeta({ call, id: article, fresh, results })
      continue
    }
    let written = null
    let refusal = null
    for (const row of opening) {
      const next = { ...paramsOf(row.params) }
      for (const f of fresh) next[f.key] = f.value
      try {
        await call('content.update', {
          kind: 'menuItem',
          id: Number(row.id),
          fields: { params: JSON.stringify(next) }
        })
        written ??= Number(row.id)
      } catch (error) {
        refusal = error.message
      }
    }
    for (const f of fresh)
      results.set(
        f.slot,
        refusal !== null || written === null
          ? failed(refusal ?? 'no menu item took the write')
          : { status: 'written', ordered: f.value, readFrom: readRow('menuItem', written, 'params', [f.key]) }
      )
  }
  for (const entry of items) {
    const id = Number(String(entry.item).replace(/^menuItem-/, ''))
    if (!Number.isInteger(id) || id <= 1) {
      results.set(entry.item, skipped(`${entry.item} names no menu item id`))
      continue
    }
    try {
      await call('content.update', { kind: 'menuItem', id, fields: { published: 0 } })
      results.set(entry.item, {
        status: 'written',
        ordered: '0',
        readFrom: readRow('menuItem', id, 'published')
      })
    } catch (error) {
      results.set(entry.item, failed(error.message))
    }
  }
}
