// Shared: the site writer's copy check and the write step read it, so it lives in lib/ (module-graph.test.mjs).
// Indexes the plan, the kit and the brief for the copy check rules (ADR 0042). Reads tolerantly: a missing or
// oddly shaped part yields an empty index and never throws. Nothing here modifies an input.
import { mainMenuOf, planCopyEntries } from './main-menu.js'
import { hiddenListsOf } from './hidden-lists.js'
import { sentencesOf, stripEllipsis, textOfValue, wordsOf } from './text-tools.js'
import { blockSlotsOf } from '../template-kit/kit-slots.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
// Footer headings (ADR 0042 amended): when the kit lists no slot for a heading's title slot id, the limit is derived
// from the demo heading text: HEADING_LIMIT_FACTOR times its length, never below HEADING_LIMIT_MIN characters.
export const HEADING_LIMIT_FACTOR = 2
export const HEADING_LIMIT_MIN = 20
const REVIEW_BLOCK = /review|testimonial/i
const REVIEW_SAYS = /\b(quote|review|testimonial)s?\b/i

// Text slots of the kit by id: block slots, list row slots, the slots of every demo row and the demo-owned slots.
function indexKit(kit) {
  const slots = new Map()
  const hiddenByBlock = new Map()
  const add = (s, block) => {
    if (!isObject(s) || s.type !== 'text' || typeof s.id !== 'string' || slots.has(s.id)) return
    slots.set(s.id, { ...s, blockId: block.id, blockRole: block.role })
  }
  for (const b of arr(kit?.blocks)) {
    if (!isObject(b)) continue
    for (const s of blockSlotsOf(b)) add(s, b)
    hiddenByBlock.set(
      b.id,
      [...slots.values()].filter((s) => s.blockId === b.id).map((s) => s.id)
    )
  }
  return { slots, slotsOfBlock: hiddenByBlock }
}

// The decisions of the plan (shared blocks and every page's blocks) and what they say about slots and frames.
// The footer column headings: plan.site.footerMenu[] joined to kit.site.navigationGroups[] by group id gives the kit
// slot id the writer fills. A kit slot is used as listed; otherwise (or without a limit) the limit comes from the
// demo heading. Returns the extra expected slots and adds the missing kit slots to the index.
function indexFooterHeadings(plan, kit, kitIdx) {
  const groups = new Map(
    arr(kit?.site?.navigationGroups)
      .filter(isObject)
      .map((g) => [g.id, g])
  )
  const out = []
  for (const m of arr(plan?.site?.footerMenu)) {
    const g = isObject(m) ? groups.get(m.group) : null
    if (!g || typeof g.titleSlot !== 'string' || !g.titleSlot) continue
    const demo = typeof g.heading === 'string' ? g.heading : ''
    const known = kitIdx.slots.get(g.titleSlot)
    const fallback = demo ? Math.max(HEADING_LIMIT_MIN, demo.length * HEADING_LIMIT_FACTOR) : null
    if (!known || typeof known.maxCharacters !== 'number')
      kitIdx.slots.set(g.titleSlot, {
        type: 'text',
        role: 'editorial.heading',
        paragraphs: 1,
        bullets: 0,
        sample: demo,
        ...known,
        id: g.titleSlot,
        maxCharacters: fallback ?? known?.maxCharacters
      })
    out.push({ slot: g.titleSlot, says: String(m.heading?.says ?? '') })
  }
  return out
}

function indexPlan(plan, kitIdx, headings, kit, compileHiddenLists) {
  const decisions = [...arr(plan?.sharedBlocks), ...arr(plan?.pages).flatMap((p) => arr(p?.blocks))].filter(
    isObject
  )
  const expected = new Map()
  const hidden = new Set()
  const frames = new Set()
  for (const d of decisions) {
    if (d.decision === 'hide') {
      for (const id of kitIdx.slotsOfBlock.get(d.block) ?? []) hidden.add(id)
      continue
    }
    const entries = [
      ...arr(d.copy),
      ...arr(d.lists).flatMap((l) => arr(l?.items).flatMap((i) => arr(i?.copy)))
    ]
    for (const c of entries) {
      if (!isObject(c) || typeof c.slot !== 'string' || expected.has(c.slot)) continue
      const kitSlot = kitIdx.slots.get(c.slot)
      expected.set(c.slot, {
        slot: c.slot,
        says: typeof c.says === 'string' ? c.says : '',
        factIds: arr(c.factIds).filter((x) => typeof x === 'string'),
        label: typeof c.text === 'string' ? c.text : null,
        maxCharacters: typeof c.maxCharacters === 'number' ? c.maxCharacters : null,
        isReview:
          REVIEW_SAYS.test(String(c.says ?? '')) || REVIEW_BLOCK.test(String(kitSlot?.blockRole ?? ''))
      })
    }
    for (const h of arr(d.hiddenSlots)) if (isObject(h) && typeof h.slot === 'string') hidden.add(h.slot)
    const pics = [
      ...arr(d.pictures),
      ...arr(d.lists).flatMap((l) => arr(l?.items).flatMap((i) => arr(i?.pictures)))
    ]
    for (const p of pics) if (isObject(p) && typeof p.frame === 'string') frames.add(p.frame)
  }
  for (const h of headings)
    if (!expected.has(h.slot))
      expected.set(h.slot, {
        slot: h.slot,
        says: h.says,
        factIds: [],
        label: null,
        maxCharacters: null,
        isReview: false
      })
  const hiddenLists = new Map()
  for (const [id, unit] of compileHiddenLists ? hiddenListsOf(plan, kit) : []) {
    if (!hidden.has(id)) continue
    if (!unit) {
      hiddenLists.set(id, { list: id, children: [], invalid: true })
      continue
    }
    hidden.delete(id)
    for (const child of unit.children) {
      hidden.add(child)
      hiddenLists.set(child, unit)
    }
  }
  for (const id of expected.keys()) if (!hiddenLists.has(id)) hidden.delete(id)
  const pages = arr(plan?.pages)
    .filter((p) => isObject(p) && p.decision === 'keep' && typeof p.id === 'string')
    .map((p) => p.id)
  for (const l of arr(plan?.site?.legalPages))
    if (isObject(l)) pages.push(typeof l.id === 'string' ? l.id : `legal:${l.kind}`)
  // Pages with no kit slots: each created legal page (by plan id) and the not-found page.
  const textPages = arr(plan?.site?.legalPages)
    .filter((l) => isObject(l) && l.use === 'create')
    .map((l) => (typeof l.id === 'string' ? l.id : `legal:${l.kind}`))
  if (isObject(plan?.site?.notFound)) textPages.push('notFound')
  return { expected, hidden, frames, pages, textPages, ...(compileHiddenLists ? { hiddenLists } : {}) }
}

const reviewTexts = (brief) => {
  const fromList = arr(brief?.reviews).map((r) =>
    typeof r === 'string' ? r : textOfValue(r?.text ?? r?.quote ?? r?.body ?? '')
  )
  const fromFacts = arr(brief?.facts)
    .filter((f) => isObject(f) && /review|testimonial/i.test(String(f.field ?? '')))
    .map((f) => textOfValue(isObject(f.value) ? (f.value.text ?? f.value) : f.value))
  return [...fromList, ...fromFacts].filter((t) => t.trim() !== '')
}

// What the template's demo business left behind: its sentences (at least three words) and its proper names.
function indexDemo(kit, kitIdx, iconFields) {
  const sentences = []
  const names = new Set()
  for (const s of kitIdx.slots.values()) {
    if (iconFields.get(s.id)?.has(s.sample)) continue
    const sample = typeof s.sample === 'string' ? stripEllipsis(s.sample) : ''
    for (const sentence of sentencesOf(sample))
      if (wordsOf(sentence).length >= 3) sentences.push(wordsOf(sentence).join(' '))
    if (/person\.name/.test(String(s.role)) && sample.trim()) names.add(sample.trim())
  }
  const template = kit?.template?.name
  if (typeof template === 'string' && template) {
    names.add(template)
    names.add(template.replace(/[_-]+/g, ' '))
  }
  for (const n of arr(kit?.site?.nameSlots)) {
    const named =
      n?.kind === 'slot' || (n?.kind === 'printed' && /title-attribute|alt-attribute/.test(String(n.where)))
    if (named && typeof n.sample === 'string' && n.sample.trim() && n.sample.length <= 40)
      names.add(n.sample.trim())
  }
  return { sentences: [...new Set(sentences)], names: [...names] }
}

// Main menu dropdowns (ADR 0042, site-copy-check/3): the dropdown slots the writer owns become expected slots with
// their limit and the plan child's intent; their kit entry is added when the kit blocks do not list them.
function indexMainMenu(menu, kitIdx, planIdx) {
  for (const s of menu.slots) {
    if (planIdx.expected.has(s.slot)) continue
    planIdx.expected.set(s.slot, {
      slot: s.slot,
      says: s.intent,
      factIds: [],
      label: null,
      maxCharacters: s.maxCharacters,
      isReview: false
    })
    planIdx.hidden.delete(s.slot)
    if (!kitIdx.slots.has(s.slot))
      kitIdx.slots.set(s.slot, {
        id: s.slot,
        type: 'text',
        role: 'editorial.menu_label',
        paragraphs: 1,
        bullets: 0,
        sample: s.sample,
        maxCharacters: s.maxCharacters
      })
  }
}

// Slots the plan words differently in two places (two labels that differ, or a label in one block and a writer slot
// in another): one slot holds one text, so the plan contradicts itself there.
function labelConflicts(plan) {
  const bySlot = new Map()
  for (const e of planCopyEntries(plan)) {
    const list = bySlot.get(e.slot) ?? []
    if (!list.some((x) => x.text === e.text)) list.push(e)
    bySlot.set(e.slot, list)
  }
  return [...bySlot]
    .filter(([, list]) => list.length > 1)
    .map(([slot, list]) => ({
      slot,
      places: list
        .map((e) => `${e.block} ${e.text === null ? '(written by the writer)' : `"${e.text}"`}`)
        .sort()
    }))
}

// Only the write step opts into compiling list hides; writer and copy-check semantics stay frozen.
export function indexInputs({ plan, kit, brief, contentMap, compileHiddenLists = false }) {
  const kitIdx = indexKit(kit)
  // A CMS text field can back an icon. Only the kit's explicit icon declaration establishes that relationship.
  const iconFields = new Map()
  for (const block of arr(kit?.blocks))
    for (const slot of blockSlotsOf(block)) {
      if (slot.type !== 'icon' || !kitIdx.slots.has(slot.field) || typeof slot.fieldValue !== 'string')
        continue
      const values = iconFields.get(slot.field) ?? new Set()
      values.add(slot.fieldValue)
      iconFields.set(slot.field, values)
    }
  const headings = indexFooterHeadings(plan, kit, kitIdx)
  const facts = new Map()
  for (const f of arr(brief?.facts))
    if (isObject(f) && typeof f.id === 'string') facts.set(f.id, textOfValue(f.value))
  const planIdx = indexPlan(plan, kitIdx, headings, kit, compileHiddenLists)
  const menu =
    contentMap === undefined ? { slots: [], hidden: [], problems: [] } : mainMenuOf({ plan, kit, contentMap })
  indexMainMenu(menu, kitIdx, planIdx)
  return {
    kitSlots: kitIdx.slots,
    iconFields,
    ...planIdx,
    menuProblems: menu.problems,
    labelConflicts: labelConflicts(plan),
    facts,
    reviews: reviewTexts(brief),
    demo: indexDemo(kit, kitIdx, iconFields)
  }
}

// Phrases the copy must not contain: the voice avoid list, the forbidden list and the withheld values of the
// brief's missing list. A phrase carries the list it came from for the failure text.
export function bannedPhrases(plan, brief) {
  const out = []
  const push = (text, list) =>
    typeof text === 'string' && text.trim() && out.push({ phrase: text.trim(), list })
  for (const a of arr(plan?.site?.voice?.avoid)) push(a, 'voice avoid list')
  for (const f of arr(plan?.site?.forbidden)) push(isObject(f) ? f.what : f, 'forbidden list')
  for (const m of arr(brief?.missing)) {
    if (typeof m === 'string') push(m, 'missing list')
    else for (const w of arr(m?.withheld)) for (const v of arr(w?.values)) push(v, 'missing list')
  }
  return out
}
