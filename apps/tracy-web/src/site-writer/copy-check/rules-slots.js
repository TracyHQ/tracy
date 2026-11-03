// W02 and W03 (ADR 0042): the copy matches the plan slot for slot, and each text fits its slot.
export const FLOOR_RATIO = 0.6 // W03: a text must reach this share of the demo text length ...
export const FLOOR_DEMO_MIN = 40 // ... when the demo text is longer than this many characters.

export const PAGE_TITLE_MAX = 60 // W03: a pages entry title.

import { stripEllipsis } from './text-tools.js'

const lengthOf = (items) => items.join(' ').trim().length

export function checkW02({ R, view, idx }) {
  const returned = new Set(view.returns.map((r) => r.slot).filter(Boolean))
  const counts = new Map()
  for (const s of view.slots) counts.set(s.slot, (counts.get(s.slot) ?? 0) + 1)
  for (const [id, n] of counts) {
    if (n > 1) R.w02.fail(id, `${id}: slot is written twice (${n} entries)`, 'duplicate')
  }
  for (const id of idx.expected.keys()) {
    if (!counts.has(id) && !returned.has(id)) R.w02.fail(id, `${id}: slot is missing`, 'missing')
    else R.w02.ok()
  }
  const returnedPages = new Set(view.returns.map((r) => r.page).filter(Boolean))
  const pageCounts = new Map()
  for (const p of view.pages) pageCounts.set(p.page, (pageCounts.get(p.page) ?? 0) + 1)
  for (const [id, n] of pageCounts)
    if (n > 1) R.w02.fail(id, `${id}: pages entry is written twice (${n} entries)`, 'duplicate')
    else if (!idx.textPages.includes(id))
      R.w02.fail(id, `${id}: unknown pages entry (the plan has no such page without kit slots)`, 'unknown')
  for (const id of idx.textPages) {
    if (!pageCounts.has(id) && !returnedPages.has(id))
      R.w02.fail(id, `${id}: pages entry is missing`, 'missing')
    else R.w02.ok()
  }
  const seen = new Set()
  for (const s of view.slots) {
    if (seen.has(s.slot)) continue
    seen.add(s.slot)
    const exp = idx.expected.get(s.slot)
    const text = s.items.join(' ')
    if (exp) {
      if (exp.label !== null && s.owner !== 'plan-label')
        R.w02.fail(
          s.slot,
          `${s.slot}: owner is "writer" but the plan gives this label slot its words`,
          'owner'
        )
      else if (exp.label === null && s.owner === 'plan-label')
        R.w02.fail(
          s.slot,
          `${s.slot}: owner is "plan-label" but the plan gives no label words for this slot`,
          'owner'
        )
      else if (exp.label !== null && text !== exp.label)
        R.w02.fail(
          s.slot,
          `${s.slot}: label differs from the plan's words: "${text}" instead of "${exp.label}"`,
          'label'
        )
    } else if (idx.hidden.has(s.slot)) {
      if (text.trim() !== '') R.w02.fail(s.slot, `${s.slot}: hidden slot has text`, 'hidden')
    } else R.w02.fail(s.slot, `${s.slot}: unknown slot (the plan has no decision for it)`, 'unknown')
  }
}

export function checkW03({ R, view, idx }) {
  const returned = new Set(view.returns.map((r) => r.slot).filter(Boolean))
  const seen = new Set()
  for (const s of view.slots) {
    if (s.owner !== 'writer' || returned.has(s.slot) || seen.has(s.slot) || idx.hidden.has(s.slot)) continue
    seen.add(s.slot)
    const kit = idx.kitSlots.get(s.slot)
    const exp = idx.expected.get(s.slot)
    if (!kit && !exp) continue
    const limits = [kit?.maxCharacters, exp?.maxCharacters].filter((n) => typeof n === 'number' && n > 0)
    const limit = limits.length ? Math.min(...limits) : null
    const chars = lengthOf(s.items)
    const demo = typeof kit?.sample === 'string' ? stripEllipsis(kit.sample).length : 0
    const floor = demo > FLOOR_DEMO_MIN ? Math.min(Math.ceil(demo * FLOOR_RATIO), limit ?? Infinity) : 0
    const allowed = Math.max(1, kit?.paragraphs ?? 1, kit?.bullets ?? 1)
    let bad = false
    const fail = (detail, cause) => {
      bad = true
      R.w03.fail(s.slot, `${s.slot}: ${detail}`, cause)
    }
    if (chars === 0) fail('text is empty', 'empty')
    else if (limit !== null && chars > limit) fail(`${chars} characters, limit ${limit}`, 'over')
    else if (floor && chars < floor)
      fail(
        `${chars} characters, floor ${floor} (${FLOOR_RATIO * 100}% of the ${demo} character demo text)`,
        'under'
      )
    if (s.items.length > allowed)
      fail(`${s.items.length} paragraphs, the kit allows ${allowed}`, 'paragraphs')
    if (!bad) R.w03.ok()
  }
  checkW03Pages({ R, view })
}

// W03 for the pages entries: title within PAGE_TITLE_MAX and not empty, every paragraph non-empty. No demo floor,
// because there is no demo text for a page without kit slots.
export function checkW03Pages({ R, view }) {
  const seen = new Set()
  for (const p of view.pages) {
    if (seen.has(p.page)) continue
    seen.add(p.page)
    let bad = false
    const fail = (detail, cause) => {
      bad = true
      R.w03.fail(p.page, `${p.page}: ${detail}`, cause)
    }
    if (p.title.trim() === '') fail('title is empty', 'empty')
    else if (p.title.length > PAGE_TITLE_MAX)
      fail(`title is ${p.title.length} characters, limit ${PAGE_TITLE_MAX}`, 'over')
    p.body.forEach((t, i) => {
      if (t.trim() === '') fail(`paragraph ${i + 1} is empty`, 'empty')
    })
    if (!bad) R.w03.ok()
  }
}
