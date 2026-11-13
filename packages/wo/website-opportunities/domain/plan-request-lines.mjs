// What changed, in lines the customer reads (ticket #617), WRITTEN BY CODE from the real difference between the current
// plan and the revised one, unit by unit: a page removed, added, renamed (its final name), the page order, a section
// removed, added, its data, the order of a page's sections, the data no longer or newly shown (and the data the
// customer took off before and asked for again), and the pictures estimate. Pages and sections are matched by id: the
// revision keeps the id of every page and section it keeps (`pagesOf`), so a line never names one thing for another.
// The model writes no changed line: what it might say is never shown, so a line cannot say what did not happen. A page
// or section the model added that the gate left out becomes a `no_data` not done line. A dropped assumption has no
// line: it explained a part of the plan the revision removed, and that removal has its own line. Lines are English,
// as every line the rules gate writes. Pure.

const list = (value) => (Array.isArray(value) ? value : [])
const cap = (text, max = 200) =>
  [...text].length <= max ? text : `${[...text].slice(0, max - 3).join('')}...`
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** The lines of the pictures estimate, when the revision changes it (the plan's own words, `plan-look-pictures.mjs`). */
function picturesLines(current, revised, add) {
  const own = [current, revised].map((p) => p.pictures?.own?.frames ?? 0)
  const drawn = [current, revised].map((p) => p.pictures?.generated?.frames ?? 0)
  if (own[0] !== own[1])
    add('pictures-own', `The plan now uses ${count(own[1], 'photo', 'photos')} of yours.`)
  if (drawn[0] !== drawn[1])
    add(
      'pictures-drawn',
      drawn[1] === 0
        ? 'No picture will be drawn now.'
        : `About ${count(drawn[1], 'picture', 'pictures')} will be drawn for spots with no fitting photo of yours.`
    )
}

/** The lines of the sections of one page the revision keeps. */
function sectionLines(page, now, labels, add) {
  const was = new Map(page.blocks.map((b) => [b.id, b]))
  const is = new Map(now.blocks.map((b) => [b.id, b]))
  for (const [id, b] of was)
    if (!is.has(id))
      add(`block-removed:${page.id}:${id}`, `The ${b.label} section is removed from the ${now.name} page.`)
  for (const [id, b] of is) {
    const old = was.get(id)
    if (!old) add(`block-added:${page.id}:${id}`, `A ${b.label} section is added to the ${now.name} page.`)
    else if (old.data.join() !== b.data.join()) {
      const line = `The ${b.label} section of the ${now.name} page now shows ${b.data.map((d) => labels.get(d) ?? d).join(', ')}.`
      add(
        `block-data:${page.id}:${id}`,
        [...line].length <= 200
          ? line
          : `The ${b.label} section of the ${now.name} page now shows ${b.data.length} things.`
      )
    }
  }
  const common = (blocks, other) => blocks.map((b) => b.id).filter((id) => other.has(id))
  if (common(page.blocks, is).join() !== common(now.blocks, was).join())
    add(`block-order:${page.id}`, `The sections of the ${now.name} page are in a new order.`)
}

/**
 * The lines of the revision: every unit it really changes, in order.
 * @param {Set<string>} [again] the ids the customer took off before and the request asked for again
 * @returns {string[]}
 */
export function changedLinesOf(current, revised, again = new Set()) {
  const out = []
  const add = (_unit, line) => out.push(cap(line))
  const labels = new Map([...list(revised.facts), ...list(revised.items)].map((d) => [d.id, d.label]))
  const byId = new Map(revised.pages.map((p) => [p.id, p]))
  const was = new Set(current.pages.map((p) => p.id))
  for (const page of current.pages)
    if (!byId.has(page.id)) add('page-removed', `The ${page.name} page is removed.`)
  for (const page of revised.pages) if (!was.has(page.id)) add('page-added', `A ${page.name} page is added.`)
  for (const page of current.pages) {
    const now = byId.get(page.id)
    if (now && now.name !== page.name) add('page-renamed', `The ${page.name} page is now called ${now.name}.`)
  }
  const before = current.pages.map((p) => p.id).filter((id) => byId.has(id))
  const order = revised.pages.map((p) => p.id).filter((id) => was.has(id))
  if (before.join() !== order.join())
    add('page-order', `The pages are now in this order: ${revised.pages.map((p) => p.name).join(', ')}.`)
  for (const page of current.pages) if (byId.has(page.id)) sectionLines(page, byId.get(page.id), labels, add)
  // What a change shows or hides beyond the sections it names (the gate's placement, a page taken off): one line each.
  const ids = (plan) => new Set(plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const shownBefore = ids(current)
  const shownAfter = ids(revised)
  const named = (set) => [...set].map((id) => labels.get(id) ?? id).join(', ')
  const off = new Set([...shownBefore].filter((id) => !shownAfter.has(id)))
  const on = [...shownAfter].filter((id) => !shownBefore.has(id))
  const back = new Set(on.filter((id) => again.has(id)))
  const fresh = new Set(on.filter((id) => !again.has(id)))
  if (off.size) add('data-off', `No longer shown: ${named(off)}.`)
  if (fresh.size) add('data-on', `Now shown: ${named(fresh)}.`)
  if (back.size) add('data-again', `Now shown again: ${named(back)}, which you had taken off earlier.`)
  picturesLines(current, revised, add)
  return out
}

/**
 * The not done lines: the model's, those of the changes code refused (`applyRequestChanges`), and one for each page
 * or section the model added that the gate did not keep.
 */
export function notDoneLinesOf({ current, revised, changes, refused, notDone, codeNotDone }) {
  const known = new Set(current.pages.map((p) => p.id))
  const newPages = revised.pages.filter((p) => !known.has(p.id))
  const lost = []
  changes.forEach((change, i) => {
    if (refused.has(i)) return
    const kept =
      change.op === 'add_page'
        ? newPages.some((p) => p.pageType === change.pageType && p.name === change.name)
        : change.op === 'add_block'
          ? revised.pages.some(
              (p) =>
                p.id === change.page &&
                p.blocks.some(
                  (b) =>
                    b.block === change.add.block &&
                    !current.pages.some((c) => c.blocks.some((x) => x.id === b.id))
                )
            )
          : true
    if (!kept)
      lost.push({
        what: cap(change.name ?? change.add?.label ?? 'A new section', 80),
        reason: 'no_data',
        why: 'There is nothing of your business to fill it, so it is not added.'
      })
  })
  return [
    ...notDone.map(({ what, reason, why }) => ({ what, reason, why })),
    ...codeNotDone.map((e) => ({ ...e, what: cap(e.what, 80) })),
    ...lost
  ]
}
