// Which slot is a page's title, from what the page prints: the words the page reading found as its main title, among
// the slots the page's own blocks show. The content map's list a slot sits in, and its role, say nothing about it: a
// banner block prints one row per page, and a classifier may have put one of those rows in another list. The answer
// is added beside the slots (`pages[].titleSlot`, `pageTitleOf` on the slot); no slot id, list or role changes, so a
// plan or a copy made on an earlier kit of the same contract still names everything it named.
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'
import { indexMap, ownerOfPath } from './map-index.mjs'

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

const titledOnPage = (controls, path) => (controls ?? []).some((c) => c.title && c.page === path)

/** The title slot of one page, or null with the slots it could not tell apart. */
function titleOf(page, { blocks, samples, slotsOfEntity, ownersOf, drives }) {
  const measured = Object.keys(drives).filter((id) => titledOnPage(drives[id]?.controls, page.path))
  if (measured.length === 1) return { slot: measured[0], from: 'field measurement' }
  const text = normText(page.h1?.text ?? '')
  if (!text) return { slot: null, candidates: measured }
  const same = (id) => samples.get(id)?.type === 'text' && normText(samples.get(id).sample) === text
  // A link's label names another page, whatever words it shares with this page's title.
  const inBlock = (id) => {
    const block = blocks.get(id) ?? {}
    const labels = new Set((block.links ?? []).map((l) => l.labelId))
    return [...new Set(shownIds(block).filter((s) => same(s) && !labels.has(s)))]
  }
  if (page.h1.block && blocks.has(page.h1.block)) {
    const named = inBlock(page.h1.block)
    if (named.length === 1) return { slot: named[0], from: 'page reading' }
    if (named.length > 1) return { slot: null, candidates: named }
  }
  const own = ownersOf(page)
    .flatMap((e) => slotsOfEntity.get(e) ?? [])
    .filter(same)
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
    drives
  }
  const titles = new Map()
  for (const page of kit.pages ?? []) {
    const t = titleOf(page, context)
    page.titleSlot = t.slot
    delete page.titleCandidates
    if (t.candidates?.length) page.titleCandidates = t.candidates
    if (t.slot) titles.set(t.slot, [...(titles.get(t.slot) ?? []), page.id])
  }
  for (const b of kit.blocks) markSlots(b, titles)
  return kit
}

/** Every page has exactly one title slot. Returns how many do not, each passed to `fail`. */
export function pageTitleChecks(kit, fail) {
  let wrong = 0
  for (const p of kit.pages ?? []) {
    if (p.titleSlot) continue
    wrong++
    fail(
      'pageTitleSlots',
      `pages[${p.id}]`,
      p.titleCandidates?.length
        ? `${p.path}: ${p.titleCandidates.length} slots print the title "${p.h1?.text}": ${p.titleCandidates.join(', ')}`
        : `${p.path}: no page title slot${p.h1?.text ? ` prints "${p.h1.text}"` : ` (${p.h1?.reason ?? 'no title read'})`}`
    )
  }
  return wrong
}
