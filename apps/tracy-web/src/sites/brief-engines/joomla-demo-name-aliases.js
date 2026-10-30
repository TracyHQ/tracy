/**
 * A Joomla brief build moves the addresses that still carry a demo person's name (spec TracyHQ/tracy#189), with the rule of
 * `website-opportunities/domain/demo-name-aliases.mjs`: a kept menu item, article or contact whose title now names a real
 * person takes an address made from that name, and each menu item opening a renamed record follows it. Then the final
 * check names what is left.
 *
 * 🔒 DOORS: an article's and a contact's `alias` are columns of `content.update`. A menu item's is NOT (its path, and the
 * path of every entry under it, must move with it): it is written only when the site's Cowork plugin advertises the door in
 * `info` (`menu_item_alias`), and is a note otherwise. A page moved here is moved in the site plan too, so the later steps
 * read it at its new address.
 */
import { demoNameAliasesLeft, planDemoNameAliases } from 'website-opportunities/domain/demo-name-aliases.mjs'
import { readMenu, writeSteps } from './joomla-tidy.js'

const PAGE = 100

/** Every summary row of one kind (`content.list`); a kind the site does not list is none. */
async function listRows(
  /** @type {Function} */ apply,
  /** @type {string} */ siteKey,
  /** @type {string} */ kind
) {
  const rows = []
  for (let offset = 0; offset < 5000; offset += PAGE) {
    const answer = await apply({ siteKey, action: 'content.list', params: { kind, limit: PAGE, offset } })
    if (answer?.ok === false) return rows
    const items = Array.isArray(answer?.items) ? answer.items : []
    rows.push(...items)
    if (items.length < PAGE) break
  }
  return rows
}

/** The record a Joomla menu link opens (an article or a contact), or null. */
export function opensOf(/** @type {unknown} */ link) {
  const text = String(link ?? '')
  const id = Number(text.match(/[?&]id=(\d+)/)?.[1] ?? 0)
  if (!id) return null
  if (/option=com_content\b/.test(text) && /view=article\b/.test(text)) return { kind: 'article', id }
  if (/option=com_contact\b/.test(text) && /view=contact\b/.test(text)) return { kind: 'contact', id }
  return null
}

/** Whether the site's Cowork plugin takes a menu item's `alias` through `content.update` (`info.menu_item_alias`). */
export async function menuAliasDoor(/** @type {Function} */ apply, /** @type {string} */ siteKey) {
  try {
    const answer = await apply({ siteKey, action: 'info', params: {} })
    const info = answer?.info ?? answer
    return Number(info?.menu_item_alias?.version ?? 0) >= 1
  } catch {
    return false
  }
}

/** The site's rows as the domain reads them. */
export function recordsOf(/** @type {{menu?: any[], articles?: any[], contacts?: any[]}} */ rows) {
  return [
    ...(rows.menu ?? [])
      .filter((r) => Number(r.id) > 1 && String(r.client_id ?? '0') === '0')
      .map((r) => ({
        kind: 'menuItem',
        id: Number(r.id),
        alias: String(
          r.alias ??
            String(r.path ?? '')
              .split('/')
              .at(-1) ??
            ''
        ),
        path: String(r.path ?? ''),
        title: r.title,
        published: r.published,
        parent: r.parent_id ?? null,
        language: r.language ?? '*',
        opens: opensOf(r.link)
      })),
    ...(rows.articles ?? []).map((r) => ({
      kind: 'article',
      id: Number(r.id),
      alias: String(r.alias ?? ''),
      title: r.title,
      published: r.state ?? r.published,
      parent: r.catid ?? null,
      language: r.language ?? '*'
    })),
    ...(rows.contacts ?? []).map((r) => ({
      kind: 'contact',
      id: Number(r.id),
      alias: String(r.alias ?? ''),
      title: r.name ?? r.title,
      published: r.published,
      parent: r.catid ?? null,
      language: r.language ?? '*'
    }))
  ]
}

/** The site plan's kept pages moved with a menu item's new path (the item and every page under it). */
export function movePlanPages(/** @type {any} */ plan, /** @type {string} */ from, /** @type {string} */ to) {
  const strip = (/** @type {string} */ p) => p.replace(/^\/+/, '')
  for (const page of plan?.pages ?? []) {
    if (typeof page?.path !== 'string') continue
    const own = strip(page.path)
    if (own !== from && !own.startsWith(`${from}/`)) continue
    page.path = `${page.path.startsWith('/') ? '/' : ''}${to}${own.slice(from.length)}`
  }
}

/**
 * Plan, write and check the addresses that carry a demo name.
 * @param {{apply: Function, siteKey: string, contentMap: any, plan?: any, applyId: string, note: (line: string) => void,
 *   moved?: Array<{kind: string, id: number, alias: string, from: string}>}} input - `moved`: the articles the title rule
 *   of the same build renamed
 * @returns {Promise<{written: number, waiting: number, left: number}>}
 */
export async function writeDemoNameAliases({ apply, siteKey, contentMap, plan, applyId, note, moved = [] }) {
  const done = { written: 0, waiting: 0, left: 0 }
  if (!contentMap) return done
  const records = recordsOf({
    menu: await readMenu(apply, siteKey).catch(() => []),
    articles: await listRows(apply, siteKey, 'article'),
    contacts: await listRows(apply, siteKey, 'contact')
  })
  // The article rule already wrote its addresses: the rows are read as they are now.
  for (const m of moved) {
    const row = records.find((r) => r.kind === m.kind && r.id === Number(m.id))
    if (row) row.alias = m.alias
  }
  const steps = planDemoNameAliases({ contentMap, records, moved })
  const menuDoor = steps.some((s) => s.kind === 'menuItem') ? await menuAliasDoor(apply, siteKey) : false
  const writable = steps.filter((s) => s.kind !== 'menuItem' || menuDoor)
  for (const s of steps.filter((s) => s.kind === 'menuItem' && !menuDoor)) {
    done.waiting += 1
    note(
      `the menu item ${s.id} keeps the address "${s.from}" of a demo person (it should be "${s.alias}"): this site's ` +
        'Cowork plugin has no door for a menu item address (info.menu_item_alias)'
    )
  }
  if (writable.length > 0) {
    const wrote = await writeSteps({
      apply,
      siteKey,
      applyId,
      steps: writable.map((s) => ({ kind: s.kind, id: s.id, fields: { alias: s.alias } }))
    })
    for (const line of wrote.notes.slice(0, 3)) note(line)
    const refused = new Set(wrote.refused.map((s) => `${s.kind}:${s.id}`))
    for (const s of writable) {
      if (refused.has(`${s.kind}:${s.id}`)) continue
      done.written += 1
      const row = records.find((r) => r.kind === s.kind && r.id === s.id)
      if (!row) continue
      row.alias = s.alias
      if (s.kind === 'menuItem' && row.path) {
        const to = row.path.includes('/')
          ? `${row.path.slice(0, row.path.lastIndexOf('/') + 1)}${s.alias}`
          : s.alias
        movePlanPages(plan, row.path, to)
      }
    }
  }
  // The final check: no kept record left at an address named after a demo person it no longer shows.
  for (const r of demoNameAliasesLeft({ contentMap, records })) {
    done.left += 1
    note(`demo name left in an address: ${r.kind} ${r.id} is still at "${r.alias}" (demo name "${r.name}")`)
  }
  return done
}
