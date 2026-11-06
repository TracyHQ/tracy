import { arr, has, norm, obj, str } from './rule-set.js'

// R04 menu labels, slugs
export function checkR04(ctx) {
  const {
    R,
    plan,
    kit,
    kitPages,
    slotRole,
    isLabelSlot,
    planPages,
    livePages,
    keptPageIds,
    keptDecisions,
    decisionParts,
    W
  } = ctx
  const r = R.r4
  const pageName = (p) => str(p.name || p.title || p.label || p.menuLabel)
  const planPageById = new Map(livePages.map((p) => [p.id, p]))
  const entries = []
  arr(plan.mainMenu).forEach((m, i) => {
    entries.push([`mainMenu[${i}]`, obj(m)])
    arr(obj(m).children).forEach((c, j) => entries.push([`mainMenu[${i}].children[${j}]`, obj(c)]))
  })
  if (!entries.length) r.note('cannot check: plan.mainMenu missing or empty')
  let labelsSeen = false
  entries.forEach(([w, e]) => {
    if (!keptPageIds.has(e.page))
      return r.fail(w, `menu entry points to ${e.page}, which is not a kept page in plan.pages`)
    r.ok()
    const label = str(e.label || e.name || e.title)
    const pg = planPageById.get(e.page)
    if (label && pg && pageName(pg)) {
      labelsSeen = true
      if (norm(label) !== norm(pageName(pg)))
        r.fail(w, `menu label "${label}" differs from page name "${pageName(pg)}"`)
    } else if (label) labelsSeen = true
  })
  if (entries.length && !labelsSeen)
    r.note(
      'cannot check: menu labels vs page names (plan has no label/name field on menu entries or pages; the menu is by page id, so the label follows the page by construction)'
    )
  const seenKeys = new Map()
  livePages.forEach((p) => {
    const kp = kitPages.get(p.id)
    const isHome = kp ? kp.path === '/' : false
    const slot = `pages ${p.id}`
    if (isHome) {
      if (has(p.slug)) r.fail(slot, `home page must have no slug, found "${p.slug}"`)
      else r.ok()
      return
    }
    if (!has(p.slug)) return r.fail(slot, 'kept page has no slug')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug))
      r.fail(slot, `slug "${p.slug}" is not lowercase words joined by hyphens`)
    else r.ok()
    const parent = kp ? str(kp.path).split('/').slice(0, -1).join('/') : '?'
    const key = `${parent}|${p.slug}`
    if (seenKeys.has(key))
      r.fail(slot, `slug "${p.slug}" is also used by ${seenKeys.get(key)} under the same parent`)
    else seenKeys.set(key, p.id)
  })
  if (!planPages.length) r.note('cannot check: plan.pages missing')
  r.note(
    'siblings are taken from the kit path (same parent segment); the real parent in the plan menu is not used'
  )
  // Label slots (kit role ending in "_label": menu item, button, tab, social link) carry the exact printed
  // words in "text"; "says" stays the intent note. A label slot in copy without "text" fails, and "text"
  // on any other slot fails.
  const allCopy = []
  keptDecisions.forEach((x) =>
    decisionParts(x.d).copy.forEach((c) => {
      if (has(c.slot)) allCopy.push({ x, c })
    })
  )
  allCopy.forEach(({ x, c }) => {
    if (isLabelSlot(c.slot)) {
      if (has(c.text)) r.ok()
      else
        r.fail(
          W(x, `slot ${c.slot}`),
          `label slot (${slotRole.get(c.slot)}) has no "text" with the exact printed words`,
          'plan'
        )
    } else if (c.text !== undefined)
      r.fail(
        W(x, `slot ${c.slot}`),
        `"text" is only for label slots; this slot's kit role is ${slotRole.get(c.slot) || 'unknown'}`,
        'plan'
      )
  })
  // Whole-row limit of the main menu: checked only when the kit gives one on a main-menu navigation group.
  // Two kit shapes are read: an object `rowLimit: { maxCharacters, items: [label slot ids] }` (kit from
  // 02/11), or an older plain number whose field name says row and max/limit.
  // The label slots are rowLimit.items when the kit lists them, else the label slots of the group's
  // level-1 items. A label is the plan's "text" for that slot, wherever the plan writes it; hidden slots do
  // not count.
  const mainGroups = arr(obj(kit.site).navigationGroups).filter((g) => /main/i.test(str(g.menu)))
  let rowLimit = null
  let rowItems = null
  for (const g of mainGroups) {
    if (rowLimit !== null) break
    const rl = obj(g.rowLimit)
    if (typeof rl.maxCharacters === 'number') {
      rowLimit = rl.maxCharacters
      if (Array.isArray(rl.items)) rowItems = rl.items.filter(has)
      continue
    }
    for (const [k, v] of Object.entries(g))
      if (rowLimit === null && typeof v === 'number' && /row/i.test(k) && /max|limit/i.test(k)) rowLimit = v
  }
  if (rowLimit === null) r.note('skip: the kit gives no whole-row limit for the main menu yet')
  else {
    const topSlots = new Set(
      rowItems ||
        mainGroups
          .flatMap((g) =>
            arr(g.items)
              .filter((it) => it.level === 1)
              .map((it) => it.labelSlot)
          )
          .filter(has)
    )
    const labels = new Map()
    allCopy.forEach(({ c }) => {
      if (!topSlots.has(c.slot) || labels.has(c.slot)) return
      const label = str(c.text).trim()
      if (label) labels.set(c.slot, label)
    })
    const total = [...labels.values()].reduce((n, l) => n + l.length, 0)
    const topCount = arr(plan.mainMenu).length
    const shown = [...labels.entries()].map(([s, l]) => `${s} "${l}"`).join(', ') || 'none'
    const src = 'from text'
    if (labels.size < topCount)
      r.note(
        `cannot check whole-row menu limit ${rowLimit}: the plan gives labels (${src}) for ${labels.size} of ${topCount} top-level menu entries (${shown})`
      )
    else if (total > rowLimit)
      r.fail(
        'main menu row',
        `top-level menu labels total ${total} characters (${src}: ${shown}), above the kit whole-row limit ${rowLimit}`,
        'plan'
      )
    else {
      r.ok()
      r.note(`whole-row menu limit ${rowLimit}: labels total ${total} characters (${src}: ${shown})`)
    }
  }
}
