// What the hide stage orders (ADR 0044, decisions 2 and 4), from the plan, the kit and one reading of the site; nothing here
// writes. Each hide decision gets one order: it goes with its dropped block or its menu item, by the kit's language constant,
// as an emptied slot, or it cannot be taken and says why. A menu item a kept page depends on is left published and reported:
// Joomla answers 404 on the path of an unpublished item, and a page beneath it goes too.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { goneRowSlots, listRowCounts, slotsToRemove } from './hide-rows.js'
import { iconsOf } from './kit-slot-routes.js'
import { menuItemOfLabel } from './menu-hides.js'
import { NO_LAST } from './no-last-report.js'

const each = (value) => (Array.isArray(value) ? value : [])
const slashless = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')
const blocksOfPage = (page) => [...new Set(Object.values(page?.blocks ?? {}).flat())]
const MODULE = /^module-\d+$/
const ADDRESS_MOVES = /\/(?:text\(\)(?:\[\d+\])?|@[A-Za-z-]+)$/

/** A hide the plugin cannot take needs a contract that captures the whole unit. */
export const NEW_CONTRACT = 'TracyHQ/tracy#369'

/** The kit's blocks the plan drops whole, as module keys: no kept page keeps or shows one. */
export function droppedBlocks(plan, kit) {
  const kitBlocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const kept = each(plan?.pages).filter((p) => p?.decision === 'keep')
  const shared = each(plan?.sharedBlocks)
  const decisions = [...shared, ...kept.flatMap((p) => each(p.blocks))]
  const hides = new Set(decisions.filter((d) => d?.decision === 'hide').map((d) => d.block))
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const dropped = new Map()
  for (const block of hides) {
    const module = kitBlocks.get(block)?.source?.entity
    if (!MODULE.test(String(module))) continue
    if (decisions.some((d) => d?.block === block && d.decision !== 'hide')) continue
    const sharedHide = shared.some((d) => d?.block === block)
    const shownOnKept = kept.some(
      (p) =>
        blocksOfPage(kitPages.get(p.id)).includes(block) && !each(p.blocks).some((d) => d?.block === block)
    )
    if (!sharedHide && shownOnKept) continue
    dropped.set(block, module)
  }
  return dropped
}

/** What keeps a menu item at this path published: a kept page at or under it, or a kept link to one. */
export function pageDependingOn(path, { plan, kit }) {
  const item = slashless(path)
  if (item === '') return 'the home page'
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, slashless(p?.path)]))
  const needs = (target) => target === item || target?.startsWith(`${item}/`)
  const kept = each(plan?.pages).filter((p) => p?.decision === 'keep')
  for (const page of kept)
    if (kitPages.has(page.id) && needs(kitPages.get(page.id)))
      return `the kept page ${page.id} (/${kitPages.get(page.id)})`
  const decisions = [...each(plan?.sharedBlocks), ...kept.flatMap((p) => each(p.blocks))]
  for (const decision of decisions.filter((d) => d?.decision !== 'hide'))
    for (const link of each(decision?.links))
      if (kitPages.has(link?.leadsTo) && needs(kitPages.get(link.leadsTo)))
        return `the kept link ${link.link} (/${kitPages.get(link.leadsTo)})`
  return null
}

/** The menu items the plan hides, parted by whether unpublishing one would break a kept page. */
function menuOrders({ plan, kit, hide }) {
  const orders = new Map()
  for (const entry of each(hide)) {
    const depends = pageDependingOn(entry.path, { plan, kit })
    orders.set(entry.slot, {
      item: entry.item,
      path: entry.path,
      ...(depends
        ? {
            refused: `leaves its menu, but ${depends} needs ${entry.path}: an unpublished item takes its page with it, so it stays published and stays in the menu`
          }
        : {})
    })
  }
  return orders
}

/** Every fixed sentence of the kit that a plan can name, by its id. */
function fixedTexts(kit) {
  const out = new Map()
  for (const block of each(kit?.blocks))
    for (const text of each(block?.fixedText)) if (typeof text?.id === 'string') out.set(text.id, text)
  return out
}

/** The language constants that take a kit's fixed sentence away, or the reason there are none. */
function fixedOrder(text, template) {
  if (text.canHide !== true)
    return { reason: `the kit measured that this sentence cannot leave the page alone (${text.id})` }
  const constants = [text.hiddenBy?.constant ?? text.source?.constants ?? text.source?.constant]
    .flat()
    .filter((c) => typeof c === 'string' && c)
  if (!constants.length)
    return { reason: 'the template prints these words itself: no language constant holds them' }
  if (typeof template !== 'string' || !template)
    return { reason: 'the kit names no template to write the override for' }
  return { constants }
}

/** Why the plugin cannot empty this slot of the site, in terms of the slot. */
function notEmptiable(key, slot) {
  if (!slot)
    return `${key} is no slot of this site, so nothing can empty it; a new contract would need one: ${NEW_CONTRACT}`
  if (ADDRESS_MOVES.test(String(slot.xpath ?? '')))
    return `the plugin does not empty one text node or attribute of an HTML field, because its address would move: this needs a contract that captures the whole unit: ${NEW_CONTRACT}`
  const where = slot.column ? `the column ${slot.column} of ${slot.entity ?? key}` : key
  return `the plugin's review for this contract does not list ${where}, so it cannot be emptied: this needs a new contract: ${NEW_CONTRACT}`
}

/** What a plan hides and cannot take off the site, each with the reason: the check's answer before anything is written. */
function noWayOutOf(orders, pages) {
  const out = []
  for (const [slot, order] of orders) {
    if (order.via === 'failed') out.push({ slot, reason: order.reason })
    else if (order.via === 'menu' && order.refused) out.push({ slot, reason: order.refused })
  }
  for (const { page, depends } of pages)
    if (depends)
      out.push({ slot: page.id, reason: `the plan drops this page, but ${depends} needs its path` })
  return out
}

/** What the door takes and what it must leave: every other claim keeps its slot, but a link whose words go leaves with them. */
function removalOf({ plan, kit, owners, onSite, changes, icons, menu, fixed, gone }) {
  const hidden = new Set()
  const keep = new Set(Object.keys(changes))
  const hiddenIds = new Set([...owners.values()].filter((c) => c.kind === 'hide').map((c) => c.slot))
  const goneKeys = new Set(
    [...goneRowSlots({ plan, kit })].map((id) => contentMapKey(icons.get(id)?.field ?? id))
  )
  for (const claim of owners.values()) {
    const key = contentMapKey(icons.get(claim.slot)?.field ?? claim.slot)
    if (claim.kind !== 'hide') {
      // A plan link on a row the plan gives up writes nothing there (link-stage.js): it does not hold the row.
      if (claim.kind === 'link' && goneKeys.has(key)) continue
      if (claim.kind !== 'link' || !hiddenIds.has(claim.label)) keep.add(key)
      continue
    }
    if (menu.has(claim.slot) || fixed.has(claim.slot)) continue
    if (!gone.has(key.slice(0, key.lastIndexOf('.'))) && !(key in changes)) hidden.add(key)
  }
  const remove = slotsToRemove({ hidden, keep, gone: goneKeys, onSite })
  return { remove, keep: [...keep].filter((key) => onSite.has(key)) }
}

/**
 * @param {{ plan: object, kit: object, owners: Map<string, object>, extras: object, reading: object,
 *   changes: Record<string, string>, cannotHide: string | null, rowsRemove?: boolean, last?: object }} input `cannotHide`: why
 *   this plugin takes no hide order, or null when it does; `rowsRemove`: whether it has the door that takes a row or an element;
 *   `last`: the last report, whose hidden lines are off the site already
 * @returns {{ orders: Map<string, object>, blocks: Map<string, string>, emptySlots: string[], removeSlots: string[],
 *   keepSlots: string[], rowRest: string[], rowLists: object[], strings: Record<string, string>, pages: object[], menu: Map<string, object>,
 *   noWayOut: { slot: string, reason: string }[] }} `orders`: by the line's slot, each with a `via`; `blocks`: block id to module
 *   key; `removeSlots`, `keepSlots`: what `rows.remove` is sent; `noWayOut`: what the plan hides and cannot take off
 */
export function hideOrders({
  plan,
  kit,
  owners,
  extras,
  reading,
  changes,
  cannotHide,
  rowsRemove = false,
  last = NO_LAST
}) {
  const onSite = new Map(each(reading?.slots).map((s) => [s?.key, s]))
  const icons = iconsOf(kit)
  const fixed = fixedTexts(kit)
  const menu = menuOrders({ plan, kit, hide: extras?.mainMenu?.hide })
  const blocks = droppedBlocks(plan, kit)
  const gone = new Set(blocks.values())
  const removal =
    cannotHide || !rowsRemove
      ? null
      : removalOf({ plan, kit, owners, onSite, changes, icons, menu, fixed, gone })
  const removedAlready = reading?.removedSlots ?? {}
  const orders = new Map()
  const emptySlots = []
  const strings = {}
  const fixedPart = { key: null, part: 'fixed-text' }
  for (const claim of owners.values()) {
    if (claim.kind !== 'hide') continue
    const { slot } = claim
    if (last.hidden(slot)) {
      orders.set(slot, { via: 'kept', line: last.line(slot) })
      continue
    }
    if (menu.has(slot)) {
      orders.set(slot, { via: 'menu', ...menu.get(slot) })
      continue
    }
    if (fixed.has(slot)) {
      const order = cannotHide ? { reason: cannotHide } : fixedOrder(fixed.get(slot), kit?.template?.name)
      if (order.reason) orders.set(slot, { via: 'failed', ...fixedPart, reason: order.reason })
      else {
        for (const constant of order.constants) strings[constant] = ''
        orders.set(slot, { via: 'fixed', constants: order.constants })
      }
      continue
    }
    const icon = icons.get(slot)
    const key = contentMapKey(icon?.field ?? slot)
    const failedAs = (reason) => orders.set(slot, { via: 'failed', key, reason })
    const held = onSite.get(key)
    const entity = key.slice(0, key.lastIndexOf('.'))
    if (key in removedAlready || removal?.remove.has(key)) {
      if (key in changes) failedAs(`the write step also writes ${key}, so it cannot be removed as well`)
      else orders.set(slot, { via: 'removed', key, ...(key in removedAlready ? { already: true } : {}) })
    } else if (gone.has(entity)) {
      if (cannotHide) failedAs(cannotHide)
      else orders.set(slot, { via: 'block', key, module: entity })
    } else if (typeof held?.current === 'string' && held.current.trim() === '') {
      orders.set(slot, { via: 'empty', key })
    } else if (cannotHide) {
      failedAs(cannotHide)
    } else if (key in changes) {
      failedAs(`the write step also writes ${key}, so it cannot be emptied as well`)
    } else if (icon && !icon.field) {
      failedAs(notEmptiable(key, null))
    } else if (menuItemOfLabel(slot)) {
      failedAs(
        `Joomla needs the title of ${menuItemOfLabel(slot)}, so it cannot be emptied, and the content map does not know this item, so nothing says what depends on it if it were unpublished`
      )
    } else if (held?.canHide) {
      emptySlots.push(key)
      orders.set(slot, { via: 'slot', key })
    } else {
      failedAs(notEmptiable(key, held))
    }
  }
  // A button leaves whole or not at all: words gone and an address left draw an empty button, and the other way a dead one.
  const buttons = new Map()
  for (const claim of owners.values())
    if (claim.kind === 'hide' && claim.button)
      buttons.set(claim.button, [...(buttons.get(claim.button) ?? []), claim.slot])
  const stuck = new Set()
  for (const slots of buttons.values()) {
    const refused = slots.map((slot) => orders.get(slot)).find((o) => o?.via === 'failed')
    if (!refused) continue
    for (const slot of slots) {
      const key = orders.get(slot)?.key
      stuck.add(key)
      orders.set(slot, { via: 'failed', key, reason: `this button cannot leave whole: ${refused.reason}` })
    }
  }
  const taken = new Set(each(extras?.mainMenu?.hide).map((h) => slashless(h.path)))
  const pages = each(plan?.pages)
    .filter((p) => p?.decision === 'drop')
    .map((p) => each(kit?.pages).find((k) => k?.id === p.id))
    .filter((page) => page && !taken.has(slashless(page.path)))
    .map((page) => ({ page, depends: pageDependingOn(page.path, { plan, kit }) }))
  const claimed = new Set(
    [...owners.values()]
      .filter((c) => c.kind === 'hide')
      .map((c) => contentMapKey(icons.get(c.slot)?.field ?? c.slot))
  )
  // The rest of a row the plan gives up, which no hide claim names (a url slot, an empty slot, the address a plan link would have
  // written): it goes with the row, and is named so its line can say so.
  const rowRest = removal
    ? [...removal.remove].filter((key) => !claimed.has(key) && !(key in removedAlready) && !stuck.has(key))
    : []
  const removeSlots = [
    ...[...orders.values()].filter((o) => o.via === 'removed' && !o.already).map((o) => o.key),
    ...rowRest
  ]
  const keepSlots = removal ? [...removal.keep] : []
  return {
    orders,
    blocks,
    emptySlots: [...new Set(emptySlots)].filter((key) => !stuck.has(key)),
    removeSlots: [...new Set(removeSlots)],
    keepSlots,
    rowRest,
    // Those of them no claim at all names get a line of their own; a plan link's line already speaks for its address.
    rowLined: rowRest.filter(
      (key) => ![...owners.values()].some((c) => contentMapKey(icons.get(c.slot)?.field ?? c.slot) === key)
    ),
    rowLists: listRowCounts({ plan, kit }, (id) => contentMapKey(icons.get(id)?.field ?? id)),
    strings,
    pages,
    menu,
    noWayOut: noWayOutOf(orders, pages)
  }
}
