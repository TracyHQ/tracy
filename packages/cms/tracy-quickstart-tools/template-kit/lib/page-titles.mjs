// Which slot is a page's title, from what the page prints: the words the page reading found as its main title, among
// the slots the page's own blocks show. The content map's list a slot sits in, and its role, say nothing about it: a
// banner block prints one row per page, and a classifier may have put one of those rows in another list. The answer
// is added beside the slots (`pages[].titleSlot`, `pageTitleOf` on the slot); no slot id, list or role changes, so a
// plan or a copy made on an earlier kit of the same contract still names everything it named.
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { UNMATCHED_PART } from './check-accepts.mjs'
import { accountOfPath, knownAccounts, pathPattern } from './exclude.mjs'
import { neutralKey } from './ids.mjs'
import { indexMap, ownerOfPath } from './map-index.mjs'
import { gapId } from './template-gaps.mjs'

/** Blocks that print a page's name as a link to it, never as its title. */
const NAVIGATION = new Set(['header', 'footer', 'mobile-menu'])

/** Every slot id a block shows: its slots, demo facts, list rows and card fields. */
function shownIds(block) {
  const ids = [...(block.slots ?? []), ...(block.demoOwned ?? [])].map((s) => s.id)
  for (const l of block.lists ?? []) {
    for (const r of l.rowSlots ?? []) ids.push(r.id, ...(r.slots ?? []).map((s) => s.id))
    for (const r of l.rows ?? []) ids.push(...(r.slots ?? []).map((s) => s.id))
  }
  return ids.filter(Boolean)
}

/** Words without the marks a template prints around them (`#`, quotes, a trailing colon). */
const unmarked = (text) => normText(text).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

/** The words of several h1 that all print the same title (a masthead and a body heading), else nothing. */
const oneText = (texts) => {
  const words = new Set((texts ?? []).map(normText).filter(Boolean))
  return words.size === 1 ? [...words][0] : ''
}

const titledOnPage = (controls, path) => (controls ?? []).some((c) => c.title && c.page === path)

/** The title slot of one page, or null with the slots it could not tell apart. */
function titleOf(page, { blocks, samples, slotsOfEntity, ownersOf, menuItemOf, drives, formats }) {
  const measured = Object.keys(drives).filter((id) => titledOnPage(drives[id]?.controls, page.path))
  if (measured.length === 1) return { slot: measured[0], from: 'field measurement' }
  // Two fields printed at the title's size (a slide's second line styled as an h1): the title is the one in the h1.
  const inH1 = measured.filter((id) =>
    drives[id].controls.some((c) => c.title && c.page === page.path && c.tag === 'h1')
  )
  if (inH1.length === 1) return { slot: inH1[0], from: 'field measurement' }
  const text = normText(page.h1?.text ?? oneText(page.h1?.texts))
  if (!text) return { slot: null, candidates: measured }
  // An image's text alternative is read aloud, never printed as the page's heading.
  const same = (id) =>
    samples.get(id)?.type === 'text' &&
    !/_alt$/.test(samples.get(id).jsonPath?.at(-1) ?? '') &&
    normText(samples.get(id).sample) === text
  // The page reading took the title from a parameter of the page's menu item (Joomla `page_title`): that field is it,
  // even when the item's own title holds the same words.
  if (page.h1?.via === 'menu-param' && page.h1.param) {
    const param = ownersOf(page)
      .flatMap((e) => slotsOfEntity.get(e) ?? [])
      .filter((id) => {
        const s = samples.get(id)
        return (
          same(id) && s.column === 'params' && s.jsonPath?.length === 1 && s.jsonPath[0] === page.h1.param
        )
      })
    if (param.length === 1) return { slot: param[0], from: 'menu parameter' }
  }
  // A link's label names another page, whatever words it shares with this page's title.
  const inBlock = (id) => {
    const block = blocks.get(id) ?? {}
    const labels = new Set((block.links ?? []).map((l) => l.labelId))
    return [...new Set(shownIds(block).filter((s) => same(s) && !labels.has(s)))]
  }
  if (page.h1?.block && blocks.has(page.h1.block)) {
    const named = inBlock(page.h1.block)
    if (named.length === 1) return { slot: named[0], from: 'page reading' }
    if (named.length > 1) return { slot: null, candidates: named }
  }
  let own = ownersOf(page)
    .flatMap((e) => slotsOfEntity.get(e) ?? [])
    .filter(same)
  // Joomla prints the title of the page's menu item as its h1 only through the page heading: beside the item the page
  // shows (a category, an article) with the same words, it is the menu label.
  if (own.length > 1 && page.h1?.via !== 'page-heading') {
    const items = own.filter((id) => samples.get(id).entity !== menuItemOf(page))
    if (items.length) own = items
  }
  const shown = new Set()
  for (const id of Object.values(page.blocks ?? {}).flat()) {
    if (NAVIGATION.has(blocks.get(id)?.role)) continue
    for (const s of inBlock(id)) shown.add(s)
  }
  // A second field of the same stored item holding the same words may be the one printed: that stays open.
  for (const s of shown)
    for (const twin of slotsOfEntity.get(neutralKey(samples.get(s).entity)) ?? [])
      if (same(twin)) shown.add(twin)
  if (shown.size === 1) return { slot: [...shown][0], from: 'page reading' }
  if (shown.size > 1) return { slot: null, candidates: [...shown].sort() }
  if (own.length === 1) return { slot: own[0], from: 'the page entity' }
  if (own.length > 1) return { slot: null, candidates: own }
  // The template may print the page entity's words inside a mark of its own (`#Squads` for a tag): matched so on the
  // page's own entity only, never on another item's words a block shows.
  // Or inside a template string with one blank (`Tagged: %s`), a language string slot of the content map.
  const fills = (words) =>
    unmarked(words) === unmarked(text) || formats.some((f) => normText(f.replace('%s', words)) === text)
  const marked = ownersOf(page)
    .flatMap((e) => slotsOfEntity.get(e) ?? [])
    .filter((id) => samples.get(id)?.type === 'text' && fills(samples.get(id).sample))
  if (marked.length === 1) return { slot: marked[0], from: 'the page entity' }
  if (marked.length > 1) return { slot: null, candidates: marked }
  // Printed by nothing a block lists (an author's name on the author's page): the slot the site part read it from.
  return page.h1.slot ? { slot: page.h1.slot, from: 'page reading' } : { slot: null, candidates: [] }
}

/** Set `pageTitleOf` on every entry of a block that holds a title slot. */
function markSlots(value, titles) {
  if (Array.isArray(value)) return value.forEach((v) => markSlots(v, titles))
  if (!value || typeof value !== 'object') return
  if (titles.has(value.id) && (value.type !== undefined || value.sample !== undefined || value.item))
    value.pageTitleOf = titles.get(value.id)
  for (const key of ['slots', 'lists', 'rowSlots', 'rows', 'demoOwned'])
    if (value[key]) markSlots(value[key], titles)
}

/**
 * Decide every page's title slot.
 * @param {object} kit changed in place: `pages[].titleSlot` (id or null), `titleCandidates` when several fit
 * @param {{map: object, drives?: Record<string, {controls?: object[]}>}} o `drives`: field-drives.json, what a field
 *   measurably changes on the pages (field-drives.mjs)
 */
export function settlePageTitles(kit, { map, drives = {} }) {
  const idx = indexMap({ entities: [], ...map })
  const samples = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s]))
  const slotsOfEntity = new Map()
  for (const [id, s] of samples) {
    const e = neutralKey(s.entity)
    slotsOfEntity.set(e, [...(slotsOfEntity.get(e) ?? []), id])
  }
  const ownersOf = (page) => {
    const base = page.path.split('?')[0]
    const owner = ownerOfPath(idx, page.path).owner
    return [owner, idx.pageByPath.get(base)?.entity].filter(Boolean).map(neutralKey)
  }
  const context = {
    blocks: new Map(kit.blocks.map((b) => [b.id, b])),
    samples,
    slotsOfEntity,
    ownersOf,
    menuItemOf: (page) => idx.pageByPath.get(page.path.split('?')[0])?.entity,
    drives,
    formats: [...samples.values()]
      .map((s) => (s.type === 'text' ? String(s.sample ?? '') : ''))
      .filter((f) => f.split('%s').length === 2)
  }
  const titles = new Map()
  for (const page of kit.pages ?? []) {
    const t = titleOf(page, context)
    page.titleSlot = t.slot
    delete page.titleCandidates
    if (t.candidates?.length) page.titleCandidates = t.candidates
  }
  // A later page of a list (`?start=20`) prints the title of its first page: the slot settled there, when it is one
  // of the slots this page could not tell apart.
  const byPath = new Map((kit.pages ?? []).map((p) => [p.path, p]))
  for (const page of kit.pages ?? []) {
    if (page.titleSlot || !page.titleCandidates) continue
    const first = byPath.get(page.path.replace(/[?&](limit)?start=\d+$/, ''))
    if (first?.titleSlot && page.titleCandidates.includes(first.titleSlot)) {
      page.titleSlot = first.titleSlot
      delete page.titleCandidates
    }
  }
  for (const page of kit.pages ?? [])
    if (page.titleSlot) titles.set(page.titleSlot, [...(titles.get(page.titleSlot) ?? []), page.id])
  for (const b of kit.blocks) markSlots(b, titles)
  return kit
}

/**
 * Pages no customer writes: the page of an account the content map does not declare (the site administrator, say) prints a
 * name that is no slot of anything, and it has nothing to write. The rule needs no name, as `decideExclusions` does.
 * @returns {{page: string, path: string, reason: string}[]}
 */
export function pagesNotForCustomers(kit, map) {
  const routes = new Set(indexMap({ entities: [], ...map }).pageByPath.keys())
  const known = knownAccounts(map)
  return (kit.pages ?? []).flatMap((p) => {
    const account = accountOfPath(p.path, routes)
    return account && !known.has(account)
      ? [{ page: p.id, path: p.path, reason: 'the page of an account the content map does not declare' }]
      : []
  })
}

/**
 * Every page for customers has exactly one title slot. Every page without one is counted; one whose missing title a
 * person explained is listed in `kit.checkAccepts.slotCoverage` (`{part, where, reason, by}`) instead of passed to
 * `fail`: a page that shows no h1 by its accepted `page-without-h1` gap (gap-accepts.json, the same cause), any other
 * by a `pageTitleSlots` entry of reach-accepts.json (check-accepts.mjs). An entry matching no such page is passed to
 * `fail` as part `checkAcceptsUnmatched`, so a stale reason holds the kit.
 * @param {object} kit
 * @param {(part: string, where: string, reason: string, extra?: object) => void} fail
 * @param {{map?: object, gapAccepts?: Record<string, {reason?: string, by?: string}>, accepts?: object[]}} [o]
 * @returns {number} every page without a title slot, explained or not
 */
export function pageTitleChecks(kit, fail, { map, gapAccepts = {}, accepts = [] } = {}) {
  const skipped = new Set(map ? pagesNotForCustomers(kit, map).map((p) => p.page) : [])
  const rules = (accepts ?? [])
    .filter((a) => a?.check === 'pageTitleSlots')
    .map((a) => ({ a, test: pathPattern(a.where) }))
  const used = new Set()
  const explained = []
  let wrong = 0
  for (const p of kit.pages ?? []) {
    if (p.titleSlot || skipped.has(p.id)) continue
    wrong++
    const where = `pages[${p.id}]`
    const gap = gapAccepts?.[gapId('page-without-h1', { pageId: p.id })]
    const noH1 = !p.h1?.via && /no h1/.test(p.h1?.reason ?? '')
    const hit = rules.find((r) => r.a.where === where) ?? rules.find((r) => r.test(where))
    const why = noH1 && gap?.reason?.trim() ? { reason: gap.reason.trim(), by: gap.by ?? null } : hit?.a
    if (hit && why === hit.a) used.add(hit.a)
    if (why) {
      explained.push({ part: 'pageTitleSlots', where, reason: why.reason, by: why.by ?? null })
      continue
    }
    fail(
      'pageTitleSlots',
      where,
      p.titleCandidates?.length
        ? `${p.path}: ${p.titleCandidates.length} slots print the title "${p.h1?.text ?? p.h1?.texts?.[0]}": ${p.titleCandidates.join(', ')}`
        : `${p.path}: no page title slot${p.h1?.text ? ` prints "${p.h1.text}"` : ` (${p.h1?.reason ?? 'no title read'})`}`
    )
  }
  for (const { a } of rules)
    if (!used.has(a))
      fail(
        UNMATCHED_PART,
        a.where,
        `an explanation of pageTitleSlots at ${a.where} matches no page without a title slot: remove it from reach-accepts.json or fix its where`,
        { check: 'pageTitleSlots' }
      )
  const others = (kit.checkAccepts?.slotCoverage ?? []).filter((e) => e.part !== 'pageTitleSlots')
  kit.checkAccepts = { ...kit.checkAccepts, slotCoverage: [...others, ...explained] }
  return wrong
}
