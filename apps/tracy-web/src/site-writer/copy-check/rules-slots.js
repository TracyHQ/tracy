// W02 and W03 (ADR 0042): the copy matches the plan slot for slot, and each text fits its slot.
//
// W03 length (2026-11-04): a text whose demo is over SHORT_DEMO_MAX (40) characters is written between DEMO_FLOOR_RATIO (80%)
// of the demo and the demo itself, plus DEMO_CEILING_TOLERANCE (3) characters for rounding, never over the slot limit. The demo
// is the kit's `demoChars` (lib/site-copy/slot-shape.js; measured on the sample for an older kit). It is judged part by part:
// the total, the lead paragraph against the demo lead, and the average point against the average demo point. A short heading
// (demo of 40 characters or less) keeps only its limit.
import {
  boundsOf,
  DEMO_FLOOR_RATIO,
  demoPointMean,
  demoTotalFor,
  SHORT_DEMO_MAX,
  slotShape
} from '../../lib/site-copy/slot-shape.js'

import { networkOfClass } from '../../lib/template-kit/icon-classes.js'
import { socialIconTargets } from '../../lib/template-kit/social-icon-targets.js'
import { ownerPostExcerptFor } from '../../lib/site-copy/owner-post-excerpts.js'

export const FLOOR_RATIO = DEMO_FLOOR_RATIO // W03: a text must reach this share of the demo text length ...
export const FLOOR_DEMO_MIN = SHORT_DEMO_MAX // ... when the demo text is longer than this many characters.

export const PAGE_TITLE_MAX = 60 // W03: a pages entry title.

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
  for (const c of idx.labelConflicts ?? [])
    R.w02.fail(
      c.slot,
      `${c.slot}: the plan gives this slot different text in two places: ${c.places.join(', ')}`,
      'conflict'
    )
  for (const p of idx.menuProblems ?? []) R.w02.note(`main menu, return to planner: ${p.detail}`)
  const seen = new Set()
  for (const s of view.slots) {
    if (seen.has(s.slot)) continue
    seen.add(s.slot)
    const exp = idx.expected.get(s.slot)
    const text = s.items.join(' ')
    if (exp) {
      // A label slot is the plan's words (plan-label) or the writer's text with the plan label it replaced.
      if (exp.label !== null && s.owner === 'writer' && s.replacedPlanLabel !== exp.label)
        R.w02.fail(
          s.slot,
          `${s.slot}: owner is "writer" on a label slot without the plan label it replaced ("${exp.label}")`,
          'owner'
        )
      else if (exp.label === null && s.replacedPlanLabel !== undefined)
        R.w02.fail(s.slot, `${s.slot}: replacedPlanLabel on a slot the plan gives no label words`, 'owner')
      else if (exp.label === null && s.owner === 'plan-label')
        R.w02.fail(
          s.slot,
          `${s.slot}: owner is "plan-label" but the plan gives no label words for this slot`,
          'owner'
        )
      else if (exp.label !== null && s.owner === 'plan-label' && text !== exp.label)
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

/** The parts of a lead and points slot measured against the same parts of the demo. */
function partFaults(kit, items, excerpt = false) {
  const shape = slotShape(kit)
  if (!shape.points || items.length < 2) return []
  const out = []
  const points = shape.lead ? items.slice(1) : items
  if (shape.lead) {
    const lead = boundsOf(shape.leadChars, 0)
    const n = items[0].trim().length
    if (!excerpt && lead && n < lead.floor)
      out.push({
        detail: `lead paragraph ${n} characters, floor ${lead.floor} (${Math.round(FLOOR_RATIO * 100)}% of the ${shape.leadChars} character demo lead)`,
        cause: 'under'
      })
    else if (lead && n > lead.ceiling)
      out.push({
        detail: `lead paragraph ${n} characters, ceiling ${lead.ceiling} (the ${shape.leadChars} character demo lead is the top)`,
        cause: 'over-demo'
      })
  }
  const demoMean = demoPointMean(kit)
  const part = boundsOf(demoMean === null ? null : Math.round(demoMean), 0)
  if (part && points.length) {
    const mean = Math.round(points.reduce((a, t) => a + t.trim().length, 0) / points.length)
    const demo = Math.round(demoMean)
    if (!excerpt && mean < part.floor)
      out.push({
        detail: `points average ${mean} characters, floor ${part.floor} (${Math.round(FLOOR_RATIO * 100)}% of the ${demo} character average demo point)`,
        cause: 'under'
      })
    else if (mean > part.ceiling)
      out.push({
        detail: `points average ${mean} characters, ceiling ${part.ceiling} (the ${demo} character average demo point is the top)`,
        cause: 'over-demo'
      })
  }
  return out
}

export function checkW03({ R, view, idx, plan, kit: templateKit, brief }) {
  const socialTargets = socialIconTargets({ plan, kit: templateKit, brief })
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
    const demo = demoTotalFor(kit ?? {}, s.items.length)
    const bounds = kit ? boundsOf(demo) : null
    const excerpt = ownerPostExcerptFor(s, idx, brief)?.valid === true
    const floor = bounds && !excerpt ? Math.min(bounds.floor, limit ?? Infinity) : 0
    const ceiling = bounds ? Math.min(bounds.ceiling, limit ?? Infinity) : null
    // A lead and points slot holds its lead paragraph and every point; otherwise the larger of the two counts.
    const shape = kit ? slotShape(kit) : null
    const allowed = shape?.lead
      ? Math.max(1, kit?.paragraphs ?? 1) + shape.points
      : Math.max(1, kit?.paragraphs ?? 1, kit?.bullets ?? 1)
    let bad = false
    const fail = (detail, cause) => {
      bad = true
      R.w03.fail(s.slot, `${s.slot}: ${detail}`, cause)
    }
    const pct = (n) => `${Math.round(n * 100)}%`
    if (idx.iconFields?.has(s.slot) && !idx.iconFields.get(s.slot).has(s.items.join(' ')))
      fail('icon field must use a class supported by its kit icon family', 'icon-field')
    const social = socialTargets.get(s.slot)
    const glyph = networkOfClass(s.items.join(' '))
    const actualNetwork =
      { 'x-twitter': 'twitter', 'facebook-f': 'facebook', 'linkedin-in': 'linkedin' }[glyph] ??
      glyph ??
      (s.items.join(' ') === social?.value ? social.network : null)
    if (social && actualNetwork && actualNetwork !== social.target)
      fail(
        social.expected
          ? `declared ${actualNetwork} icon links to the planned ${social.target} profile; use ${social.expected} from the template icon family`
          : `declared ${actualNetwork} icon links to the planned ${social.target} profile; return this row to planner when the kit declares no matching icon class`,
        'icon-network'
      )
    if (chars === 0) fail('text is empty', 'empty')
    else if (limit !== null && chars > limit) fail(`${chars} characters, limit ${limit}`, 'over')
    else if (floor && chars < floor)
      fail(
        `${chars} characters, floor ${floor} (${pct(FLOOR_RATIO)} of the ${demo} character demo text)`,
        'under'
      )
    else if (ceiling !== null && chars > ceiling)
      fail(
        `${chars} characters, ceiling ${ceiling} (the ${demo} character demo text is the top)`,
        'over-demo'
      )
    if (chars > 0 && kit && bounds) for (const d of partFaults(kit, s.items, excerpt)) fail(d.detail, d.cause)
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
