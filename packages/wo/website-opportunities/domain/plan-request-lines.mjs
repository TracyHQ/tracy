// What changed, in lines the customer reads (ticket #617), WRITTEN BY CODE from the real difference between the current
// plan and the revised one, unit by unit: a page removed, added, renamed (its final name), the page order, a section
// removed, added, its data, the order of a page's sections, the data no longer or newly shown (and the data the
// customer took off before and asked for again), and the pictures estimate. Pages and sections are matched by id: the
// revision keeps the id of every page and section it keeps (`pagesOf`), so a line never names one thing for another.
// Data that repeats a name is said once with its count ("12 photos"). The model writes no changed line: what it might say is never shown, so a line cannot say what did not happen. A page
// or section the model added that the gate left out becomes a `no_data` not done line. A dropped assumption has no
// line: it explained a part of the plan the revision removed, and that removal has its own line. Lines are English,
// as every line the rules gate writes. Pure.

import { sectionCodeOf } from './plan-wording-codes.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const cap = (text, max = 200) =>
  [...text].length <= max ? text : `${[...text].slice(0, max - 3).join('')}...`
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`
/** The plural of a generic data name ("Photo" gives "photos", "Social link" gives "social links"). */
const pluralOf = (name) => {
  const low = name.charAt(0).toLowerCase() + name.slice(1)
  if (/(?:s|x|z|ch|sh)$/i.test(low)) return `${low}es`
  if (/[^aeiou]y$/i.test(low)) return `${low.slice(0, -1)}ies`
  return `${low}s`
}
/** Names in order, each once, with how often each repeats: the parts of `groupedNames`, as data for a translator. */
export function namesWithCounts(names) {
  const counts = new Map()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts].map(([name, n]) => ({ name, count: n }))
}
/** Names in order, each once: a name that repeats is said once with its count ("12 photos"). */
export function groupedNames(names) {
  return namesWithCounts(names)
    .map(({ name, count: n }) => (n === 1 ? name : `${n} ${pluralOf(name)}`))
    .join(', ')
}

/** The lines of the pictures estimate, when the revision changes it (the plan's own words, `plan-look-pictures.mjs`). */
function picturesLines(current, revised, add) {
  const own = [current, revised].map((p) => p.pictures?.own?.frames ?? 0)
  const drawn = [current, revised].map((p) => p.pictures?.generated?.frames ?? 0)
  if (own[0] !== own[1])
    add('pictures-own', `The plan now uses ${count(own[1], 'photo', 'photos')} of yours.`, { count: own[1] })
  if (drawn[0] !== drawn[1])
    add(
      'pictures-drawn',
      drawn[1] === 0
        ? 'Tracy will not create any pictures now.'
        : `About ${count(drawn[1], 'picture', 'pictures')} will be created where you have no suitable photo.`,
      { count: drawn[1] }
    )
}

/** The lines of the sections of one page the revision keeps. */
function sectionLines(page, now, labels, add, blocks) {
  const was = new Map(page.blocks.map((b) => [b.id, b]))
  const is = new Map(now.blocks.map((b) => [b.id, b]))
  // The parameters of a line about a section: the page (id and name), the section (id, its label and the code of that
  // label where the block's type has one) and, for its data, the names with their counts.
  const of = (b) => ({
    page: page.id,
    pageName: now.name,
    block: b.id,
    label: b.label,
    ...(sectionCodeOf(blocks?.get(b.block)) ? { section: sectionCodeOf(blocks.get(b.block)) } : {})
  })
  for (const [id, b] of was)
    if (!is.has(id))
      add(
        `block-removed:${page.id}:${id}`,
        `The ${b.label} section is removed from the ${now.name} page.`,
        of(b)
      )
  for (const [id, b] of is) {
    const old = was.get(id)
    if (!old)
      add(`block-added:${page.id}:${id}`, `A ${b.label} section is added to the ${now.name} page.`, of(b))
    else if (old.data.join() !== b.data.join()) {
      const names = b.data.map((d) => labels.get(d) ?? d)
      const line = `The ${b.label} section of the ${now.name} page now shows ${groupedNames(names)}.`
      const short = [...line].length > 200
      add(
        `block-data:${page.id}:${id}`,
        short ? `The ${b.label} section of the ${now.name} page now shows ${b.data.length} items.` : line,
        { ...of(b), count: b.data.length, ...(short ? {} : { names: namesWithCounts(names) }) }
      )
    }
  }
  const common = (blocks, other) => blocks.map((b) => b.id).filter((id) => other.has(id))
  if (common(page.blocks, is).join() !== common(now.blocks, was).join())
    add(`block-order:${page.id}`, `The sections of the ${now.name} page are in a new order.`, {
      page: page.id,
      pageName: now.name
    })
}

/**
 * The lines of the revision: every unit it really changes, in order.
 * @param {Set<string>} [again] the ids the customer took off before and the request asked for again
 * @returns {string[]}
 */
export const changedLinesOf = (current, revised, again = new Set(), blocks = null) =>
  changedEntriesOf(current, revised, again, blocks).map((e) => e.text)

/**
 * The lines of the revision with a stable `code` each (the kind of unit it says: `page-removed`, `block-data`,
 * `data-on`, `pictures-own` and so on) and its `params` (the page id and name, the section id, label and label code,
 * the counts and the names with their counts, per line), for a reader that translates by code.
 * @param {Map<string, object> | null} [blocks] block id -> its description, for the label code of a section
 * @returns {Array<{code: string, text: string, params: object}>}
 */
export function changedEntriesOf(current, revised, again = new Set(), blocks = null) {
  const out = []
  const add = (unit, line, params = {}) => out.push({ code: unit.split(':')[0], text: cap(line), params })
  const labels = new Map([...list(revised.facts), ...list(revised.items)].map((d) => [d.id, d.label]))
  const byId = new Map(revised.pages.map((p) => [p.id, p]))
  const was = new Set(current.pages.map((p) => p.id))
  for (const page of current.pages)
    if (!byId.has(page.id))
      add('page-removed', `The ${page.name} page is removed.`, { page: page.id, name: page.name })
  for (const page of revised.pages)
    if (!was.has(page.id))
      add('page-added', `A ${page.name} page is added.`, { page: page.id, name: page.name })
  for (const page of current.pages) {
    const now = byId.get(page.id)
    if (now && now.name !== page.name)
      add('page-renamed', `The ${page.name} page is now called ${now.name}.`, {
        page: page.id,
        from: page.name,
        name: now.name
      })
  }
  const before = current.pages.map((p) => p.id).filter((id) => byId.has(id))
  const order = revised.pages.map((p) => p.id).filter((id) => was.has(id))
  if (before.join() !== order.join())
    add('page-order', `The pages are now in this order: ${revised.pages.map((p) => p.name).join(', ')}.`, {
      pages: revised.pages.map((p) => p.id),
      names: revised.pages.map((p) => p.name)
    })
  for (const page of current.pages)
    if (byId.has(page.id)) sectionLines(page, byId.get(page.id), labels, add, blocks)
  // What a change shows or hides beyond the sections it names (the gate's placement, a page taken off): one line each.
  const ids = (plan) => new Set(plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const shownBefore = ids(current)
  const shownAfter = ids(revised)
  const nameOf = (id) => labels.get(id) ?? id
  const named = (set) => groupedNames([...set].map(nameOf))
  const dataParams = (set) => ({ names: namesWithCounts([...set].map(nameOf)), count: set.size })
  const off = new Set([...shownBefore].filter((id) => !shownAfter.has(id)))
  const on = [...shownAfter].filter((id) => !shownBefore.has(id))
  const back = new Set(on.filter((id) => again.has(id)))
  const fresh = new Set(on.filter((id) => !again.has(id)))
  if (off.size) add('data-off', `No longer shown: ${named(off)}.`, dataParams(off))
  if (fresh.size) add('data-on', `Now shown: ${named(fresh)}.`, dataParams(fresh))
  if (back.size)
    add('data-again', `Now shown again: ${named(back)}, which you had taken off earlier.`, dataParams(back))
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
        code: 'section_not_filled',
        params: { name: cap(change.name ?? change.add?.label ?? 'A new section', 80) },
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
