// Shared: the site writer and the write step read it, so it lives in lib/ (module-graph.test.mjs).
// The main menu with its dropdowns (ADR 0042 section 1, "Main menu dropdowns"). The kit's header block names only the
// top-level menu items; the tree under them lives in the template's content map (the same file step 9 writes into).
// This module matches that tree with the plan's mainMenu: each item under a kept top-level item whose page the plan
// keeps as a child of that item becomes a writer slot (unless a kept block already labels it), and every other main
// menu item is listed as hidden, for step 9. Pure: inputs in, a new object out, nothing modified.
//
// Plan pages map to menu items through the kit's pages[].path ("/about-us/our-trainers" opens the menu item whose
// content map path is "about-us/our-trainers"). A plan child that maps to no menu item is reported in `problems`,
// never guessed.
//
// A WordPress content map has no menu item: its main menu is the theme's header navigation (main-menu-wordpress.js),
// read when the content map carries `navigationSource` (content-map-source.js).

import { mainMenuFromPages } from './main-menu-from-pages.js'
import { wordpressMainMenuOf } from './main-menu-wordpress.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

const MENU_LABEL = /^menuItem-(\d+)\.0$/
const labelSlotOf = (item) => `${item}.0`
const trimSlashes = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '')
const parentPath = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : null)

/** Every copy entry of the plan's kept block decisions (shared blocks and kept pages), with its block. */
export function planCopyEntries(plan) {
  const decisions = [
    ...arr(plan?.sharedBlocks),
    ...arr(plan?.pages)
      .filter((p) => isObject(p) && p.decision === 'keep')
      .flatMap((p) => arr(p.blocks))
  ].filter((d) => isObject(d) && d.decision !== 'hide')
  const out = []
  for (const d of decisions) {
    const hidden = new Set(arr(d.hiddenSlots).map((h) => h?.slot))
    const entries = [
      ...arr(d.copy),
      ...arr(d.lists).flatMap((l) => arr(l?.items).flatMap((i) => arr(i?.copy)))
    ]
    for (const c of entries)
      if (isObject(c) && typeof c.slot === 'string' && !hidden.has(c.slot))
        out.push({ block: d.block, slot: c.slot, text: typeof c.text === 'string' ? c.text : null })
  }
  return out
}

/** Text slots of the kit by id (first listing wins), and the slots of header blocks. */
function kitSlots(kit) {
  const all = new Map()
  const header = []
  for (const b of arr(kit?.blocks)) {
    if (!isObject(b)) continue
    const slots = [
      ...arr(b.slots),
      ...arr(b.lists).flatMap((l) => [...arr(l?.rowSlots), ...arr(l?.rows).flatMap((r) => arr(r?.slots))])
    ].filter((s) => isObject(s) && typeof s.id === 'string')
    for (const s of slots) if (!all.has(s.id)) all.set(s.id, s)
    if (b.role === 'header' || b.id === 'header') header.push(...slots)
  }
  return { all, header }
}

const empty = (problems = []) => ({ menutype: null, items: [], slots: [], hidden: [], problems })

/**
 * @param {{ plan: object, kit: object, contentMap: object | null }} input
 * @returns {{ menutype: string | null, items: object[], slots: object[], hidden: object[], problems: object[] }}
 *   items: the whole main menu tree in content map order, each with its state (top, shown, hidden); slots: the
 *   dropdown slots the writer writes; hidden: the items step 9 hides; problems: plan children matched to no item.
 */
export function mainMenuOf({ plan, kit, contentMap }) {
  if (isObject(contentMap?.navigationSource))
    return wordpressMainMenuOf({ plan, kit, navigationSource: contentMap.navigationSource })
  const withChildren = arr(plan?.mainMenu).filter((m) => isObject(m) && arr(m.children).length)
  if (!isObject(contentMap))
    return empty(
      withChildren.length
        ? [{ page: null, parent: null, detail: 'no content map: the dropdown children cannot be matched' }]
        : []
    )
  const slots = kitSlots(kit)
  const entities = new Map(
    arr(contentMap.entities)
      .filter((e) => isObject(e) && e.kind === 'menuItem' && typeof e.key === 'string')
      .map((e) => [e.key, e])
  )
  const demo = new Map(arr(contentMap.slots).map((s) => [s?.key, s?.sample]))
  // The main menu is the menu type of the top-level labels the header block shows (the most common one).
  const votes = new Map()
  for (const s of slots.header) {
    const n = MENU_LABEL.exec(s.id)?.[1]
    const type = n ? entities.get(`menuItem-${n}`)?.identity?.menutype : null
    if (type) votes.set(type, (votes.get(type) ?? 0) + 1)
  }
  const menutype = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  if (!menutype) return mainMenuFromPages({ plan, kit, entities, demo })

  const byPath = new Map()
  const tree = []
  for (const e of entities.values()) {
    if (e.identity?.menutype !== menutype) continue
    const path = trimSlashes(e.identity?.path)
    const node = { item: e.key, slot: labelSlotOf(e.key), path, parent: null }
    byPath.set(path, node)
    tree.push(node)
  }
  for (const n of tree) {
    const up = parentPath(n.path)
    n.parent = up !== null && byPath.has(up) ? byPath.get(up).item : null
  }
  const byItem = new Map(tree.map((n) => [n.item, n]))
  const topOf = (n) => (n.parent ? topOf(byItem.get(n.parent)) : n)

  const entries = planCopyEntries(plan)
  const labelOf = (slot) => entries.find((e) => e.slot === slot) ?? null
  const kitPages = new Map(arr(kit?.pages).map((p) => [p?.id, p]))
  const pathOfPage = (page) => (kitPages.has(page) ? trimSlashes(kitPages.get(page).path) : null)

  // Children the plan keeps, by the path of their top-level item.
  const keptUnder = new Map()
  const problems = []
  for (const m of withChildren) {
    const topPath = pathOfPage(m.page)
    const top = topPath !== null ? byPath.get(topPath) : null
    if (!top || top.parent) {
      for (const c of arr(m.children))
        problems.push({
          page: c?.page ?? null,
          parent: m.page,
          detail: `${c?.page}: its parent ${m.page} opens no top-level main menu item`
        })
      continue
    }
    const kept = keptUnder.get(top.path) ?? new Map()
    keptUnder.set(top.path, kept)
    for (const c of arr(m.children)) {
      const path = pathOfPage(c?.page)
      if (path === null) {
        problems.push({
          page: c?.page ?? null,
          parent: m.page,
          detail: `${c?.page}: the kit has no page ${c?.page}`
        })
        continue
      }
      const node = byPath.get(path)
      if (!node || node === top || topOf(node) !== top) {
        problems.push({
          page: c.page,
          parent: m.page,
          detail: `${c.page} (/${path}): no main menu item under /${top.path} opens this page`
        })
        continue
      }
      kept.set(path, typeof c.intent === 'string' ? c.intent : '')
    }
  }

  // Walk parents before children: an item is shown when its top-level item is kept, its parent is shown and the
  // plan keeps its page under that top-level item.
  const state = new Map()
  const items = []
  const out = { slots: [], hidden: [] }
  const ordered = [...tree].sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  for (const n of ordered) {
    const top = topOf(n)
    const label = labelOf(n.slot)
    const view = {
      item: n.item,
      slot: n.slot,
      path: `/${n.path}`,
      parent: n.parent,
      demo: demo.get(n.slot) ?? null
    }
    let why = null
    if (!n.parent) {
      if (label) {
        state.set(n.item, 'top')
        items.push({ ...view, state: 'top', labelFrom: labelFromOf(label) })
        continue
      }
      why = 'the plan hides this top-level label'
    } else if (state.get(top.item) !== 'top') why = `under the hidden top-level item /${top.path}`
    else if (state.get(n.parent) === 'hidden') why = `under the hidden item /${byItem.get(n.parent).path}`
    else if (!keptUnder.get(top.path)?.has(n.path))
      why = `the plan's main menu does not keep /${n.path} under /${top.path}`
    if (why) {
      state.set(n.item, 'hidden')
      items.push({ ...view, state: 'hidden', why })
      out.hidden.push({ item: n.item, slot: n.slot, path: `/${n.path}`, why })
      continue
    }
    state.set(n.item, 'shown')
    const intent = keptUnder.get(top.path).get(n.path)
    if (label) {
      items.push({ ...view, state: 'shown', intent, labelFrom: labelFromOf(label) })
      continue
    }
    const own = slots.all.get(n.slot)?.maxCharacters
    const parentLimit = slots.all.get(top.slot)?.maxCharacters
    const maxCharacters = typeof own === 'number' ? own : typeof parentLimit === 'number' ? parentLimit : null
    const sample = slots.all.get(n.slot)?.sample ?? demo.get(n.slot) ?? ''
    const s = {
      slot: n.slot,
      item: n.item,
      parentSlot: byItem.get(n.parent).slot,
      page: [...kitPages.values()].find((p) => trimSlashes(p.path) === n.path)?.id ?? null,
      intent,
      maxCharacters,
      sample
    }
    out.slots.push(s)
    items.push({ ...view, state: 'shown', intent, maxCharacters, labelFrom: { owner: 'writer', menu: true } })
  }
  const order = new Map(tree.map((n, i) => [n.item, i]))
  items.sort((a, b) => order.get(a.item) - order.get(b.item))
  out.hidden.sort((a, b) => order.get(a.item) - order.get(b.item))
  return { menutype, items, slots: out.slots, hidden: out.hidden, problems }
}

const labelFromOf = (entry) =>
  entry.text !== null
    ? { block: entry.block, owner: 'plan-label', text: entry.text }
    : { block: entry.block, owner: 'writer' }
