// What changed, in lines the customer reads (ticket #617), held to the REAL difference between the current plan and the
// revised one. The difference is worked out by code, unit by unit (a page removed, added, renamed, the page order, a
// section removed, added, its data, its place, the data no longer or newly shown), and each unit gets one line: the model's line of the change that made
// it, or a line code writes. A model line whose change left no difference (the gate dropped it, or it changed nothing)
// is dropped; a section or page the model added that the gate left out becomes a `no_data` not done line. Code lines
// are English, as every line the rules gate writes; the model's lines follow the site language. Pure.

const list = (value) => (Array.isArray(value) ? value : [])
const cap = (text, max = 200) =>
  [...text].length <= max ? text : `${[...text].slice(0, max - 3).join('')}...`

/** Each revised page with the origin it came from (a current page id, or `new-<i>` for an added page). */
function originsOf(revised, pages, recipes) {
  const kept = pages.filter((p) =>
    p.blocks.some((b) => b.block === recipes.get(p.pageType)?.mainBlock && b.data.length > 0)
  )
  if (kept.length === revised.pages.length)
    return revised.pages.map((p, i) => ({ page: p, origin: kept[i].origin }))
  return revised.pages.map((p) => ({ page: p, origin: p.id }))
}

/**
 * The units the revision really changes, in order, each with a line code can write.
 * @returns {Array<{unit: string, line: string}>}
 */
export function planDifferenceOf(current, revised, pages, recipes) {
  const out = []
  const add = (unit, line) => out.push({ unit, line: cap(line) })
  const labels = new Map([...list(revised.facts), ...list(revised.items)].map((d) => [d.id, d.label]))
  const after = originsOf(revised, pages, recipes)
  const byOrigin = new Map(after.map((x) => [x.origin, x.page]))
  for (const page of current.pages)
    if (!byOrigin.has(page.id)) add(`page-removed:${page.id}`, `The ${page.name} page is removed.`)
  for (const { page, origin } of after)
    if (origin.startsWith('new-')) add(`page-added:${origin}`, `A ${page.name} page is added.`)
  for (const page of current.pages) {
    const now = byOrigin.get(page.id)
    if (now && now.name !== page.name)
      add(`page-renamed:${page.id}`, `The ${page.name} page is now called ${now.name}.`)
  }
  const before = current.pages.map((p) => p.id).filter((id) => byOrigin.has(id))
  const order = after.map((x) => x.origin).filter((o) => before.includes(o))
  if (before.join() !== order.join())
    add('page-order', `The pages are now in this order: ${after.map((x) => x.page.name).join(', ')}.`)
  for (const page of current.pages) {
    const now = byOrigin.get(page.id)
    if (!now) continue
    const was = new Map(page.blocks.map((b) => [b.block, b]))
    const is = new Map(now.blocks.map((b) => [b.block, b]))
    for (const [id, b] of was)
      if (!is.has(id))
        add(`block-removed:${page.id}:${id}`, `The ${b.label} section is removed from the ${now.name} page.`)
    for (const [id, b] of is) {
      const old = was.get(id)
      if (!old) add(`block-added:${page.id}:${id}`, `A ${b.label} section is added to the ${now.name} page.`)
      else if (old.data.join() !== b.data.join()) {
        const shows = b.data.map((d) => labels.get(d) ?? d).join(', ')
        const line = `The ${b.label} section of the ${now.name} page now shows ${shows}.`
        add(
          `block-data:${page.id}:${id}`,
          [...line].length <= 200
            ? line
            : `The ${b.label} section of the ${now.name} page now shows ${b.data.length} things.`
        )
      }
    }
    const common = (blocks, other) => blocks.map((b) => b.block).filter((id) => other.has(id))
    if (common(page.blocks, is).join() !== common(now.blocks, was).join())
      add(`block-order:${page.id}`, `The sections of the ${now.name} page are in a new order.`)
  }
  // What a change shows or hides beyond the sections it names (the gate's placement, a page taken off): one line each.
  const ids = (plan) => new Set(plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const was = ids(current)
  const is = ids(revised)
  const named = (set) => [...set].map((id) => labels.get(id) ?? id).join(', ')
  const off = new Set([...was].filter((id) => !is.has(id)))
  const on = new Set([...is].filter((id) => !was.has(id)))
  if (off.size) add('data-off', `No longer shown: ${named(off)}.`)
  if (on.size) add('data-on', `Now shown: ${named(on)}.`)
  return out
}

/**
 * The readable result: one line per real unit (the model's when its change made that unit), and the not done lines,
 * with one more for each page or section the model added that the gate did not keep.
 * @param {object[]} changes the model's changes; `units[i]` the unit change `i` targets (`applyRequestChanges`)
 */
export function readableResultOf({ difference, changes, units, notDone }) {
  const real = new Map(difference.map((d) => [d.unit, d.line]))
  const said = new Map()
  const lost = []
  changes.forEach((change, i) => {
    const unit = units[i]
    if (unit && real.has(unit)) {
      if (!said.has(unit)) said.set(unit, change.said)
    } else if (change.op === 'add_page' || change.op === 'add_block')
      lost.push({
        what: cap(change.name ?? change.add?.label ?? 'A new section', 80),
        reason: 'no_data',
        why: 'There is nothing of your business to fill it, so it is not added.'
      })
  })
  return {
    changed: difference.map((d) => said.get(d.unit) ?? d.line),
    notDone: [...notDone.map(({ what, reason, why }) => ({ what, reason, why })), ...lost]
  }
}
