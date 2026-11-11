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
function partFaults(kit, items) {
  const shape = slotShape(kit)
  if (!shape.points || items.length < 2) return []
  const out = []
  const points = shape.lead ? items.slice(1) : items
  if (shape.lead) {
    const lead = boundsOf(shape.leadChars, 0)
    const n = items[0].trim().length
    if (lead && n < lead.floor)
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
    if (mean < part.floor)
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

// Compare explicit row metadata and the authoritative planned social fact. A class may be valid in the
// template and still draw the wrong network for its link; a citation alone does not establish the link.
function socialIconTargets({ plan, kit, brief }) {
  const arr = (value) => (Array.isArray(value) ? value : [])
  const blocks = new Map(arr(kit?.blocks).map((b) => [b?.id, b]))
  const facts = new Map(arr(brief?.facts).map((f) => [f?.id, f]))
  const out = new Map()
  // The research brief calls Twitter "x"; the released kit names the same network "twitter".
  const networkOf = (value) => {
    const name = value.trim().toLowerCase()
    return name === 'x' ? 'twitter' : name
  }
  const decisions = [...arr(plan?.sharedBlocks), ...arr(plan?.pages).flatMap((p) => arr(p?.blocks))]
  for (const decision of decisions) {
    if (decision?.decision !== 'keep') continue
    const block = blocks.get(decision.block)
    const hidden = new Set(arr(decision.hiddenSlots).map((s) => s?.slot))
    for (const list of arr(block?.lists))
      for (const row of arr(list?.rows)) {
        const urls = arr(row?.slots).filter((s) => s?.type === 'url' && s.role === 'contact.social_url')
        if (urls.length !== 1) continue
        const url = urls[0]
        const link = arr(decision.links).find((l) => l?.link === url.id)
        const label = arr(block?.links).find((l) => l?.id === url.id)?.labelId
        if (hidden.has(url.id) || (label && hidden.has(label))) continue
        const match = /^social:(.+)$/.exec(String(link?.leadsTo ?? ''))
        const fact = match && facts.get(match[1])
        if (fact?.field !== 'socials' || typeof fact.value?.kind !== 'string') continue
        const target = networkOf(fact.value.kind)
        if (!target) continue
        for (const icon of arr(row?.slots)) {
          if (
            icon?.type !== 'icon' ||
            typeof icon.field !== 'string' ||
            typeof icon.fieldValue !== 'string' ||
            typeof icon.network !== 'string'
          )
            continue
          out.set(icon.field, { target, network: networkOf(icon.network), value: icon.fieldValue })
        }
      }
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
    const floor = bounds ? Math.min(bounds.floor, limit ?? Infinity) : 0
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
      fail('icon field must use a class declared by its kit icon', 'icon-field')
    const social = socialTargets.get(s.slot)
    if (social && s.items.join(' ') === social.value && social.network !== social.target)
      fail(
        `declared ${social.network} icon links to the planned ${social.target} profile; return this row to planner when the kit declares no matching icon class`,
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
    if (chars > 0 && kit && bounds) for (const d of partFaults(kit, s.items)) fail(d.detail, d.cause)
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
