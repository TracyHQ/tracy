// The site writer's input (ADR 0042, #329): what the writer reads, trimmed from the plan, the brief and the kit. Pure:
// inputs in, a new object out, nothing modified.
//
// - The whole site plan, as given.
// - From the brief, only the facts the plan cites (any `factIds` anywhere in the plan), each as { id, field, value,
//   evidence } where `evidence` lists the quotes the fact was read from; and the full text of every review the plan
//   quotes (a `brief.reviews[]` entry whose id the plan names, or that names a cited fact as its own).
// - From the kit, a slim view of every block the plan uses (every block decision but "hide", on shared blocks and
//   kept pages): its look text and, per text slot (its own and its `demoOwned` ones), id, role, type, maxCharacters, a preview of the sample (its first
//   SAMPLE_PREVIEW characters), demoChars and shape (lib/site-copy/slot-shape.js: the demo's lengths, which the copy
//   check judges against; 2026-11-04), `characters` (the window W03 holds the text to, below), paragraphs and bullets, and `inline`, a note naming the words the demo draws in the
//   accent colour when it marks some with a span (lib/site-copy/inline-emphasis.js); per
//   list, its row slots and the slots of demo rows the row slots do not name. Also the footer column headings
//   (the kit's navigation group of each `site.footerMenu[].group`) and the two name slots the brand step hands over
//   (`kit.site.nameSlots` printed at the document title and the meta description).
// - From the content map (when the template has one), the main menu dropdown slots the writer writes, grouped under
//   their parent's label slot (main-menu.js).
// - Every plan label slot (plan-labels.js): the planner's label as a suggestion, its `says`, and from the kit the demo
//   sample, role, limit and where the slot prints, so the writer keeps the label or rewrites it (2026-11-04).
// No image: the writer reads the block look text instead.
import { mainMenuOf } from '../lib/site-copy/main-menu.js'
import { emphasisNoteOf } from '../lib/site-copy/inline-emphasis.js'
import { indexInputs } from '../lib/site-copy/inputs-index.js'
import { demoCharsOf, lengthWindow, partWindows, slotShape } from '../lib/site-copy/slot-shape.js'
import { planLabelSlots } from './plan-labels.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The name slots the brand step hands over to the writer (#319): written as the home page's seo entry. */
export const HANDED_OVER_NAME_SLOTS = Object.freeze(['document-title', 'meta description'])

/** Every fact id the plan cites, in the order it first cites them. */
export function citedFactIds(plan) {
  const ids = new Set()
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!isObject(value)) return
    for (const [key, v] of Object.entries(value)) {
      if (key === 'factIds') for (const id of arr(v)) if (typeof id === 'string') ids.add(id)
      walk(v)
    }
  }
  walk(plan)
  return [...ids]
}

/** Every string anywhere in the plan, for finding the review ids it names. */
function stringsOf(value, out = new Set()) {
  if (typeof value === 'string') out.add(value)
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out)
  else if (isObject(value)) for (const v of Object.values(value)) stringsOf(v, out)
  return out
}

const quotesOf = (fact) =>
  arr(fact.evidence)
    .map((e) => (typeof e === 'string' ? e : (e?.quote ?? e?.text ?? e?.excerpt)))
    .filter((q) => typeof q === 'string' && q.trim() !== '')

function citedFacts(plan, brief) {
  const byId = new Map(
    arr(brief?.facts)
      .filter(isObject)
      .map((f) => [f.id, f])
  )
  return citedFactIds(plan)
    .filter((id) => byId.has(id))
    .map((id) => {
      const f = byId.get(id)
      return { id, field: f.field ?? null, value: f.value ?? null, evidence: quotesOf(f) }
    })
}

function quotedReviews(plan, brief, factIds) {
  const named = stringsOf(plan)
  const cited = new Set(factIds)
  return arr(brief?.reviews)
    .filter(isObject)
    .filter(
      (r) =>
        (typeof r.id === 'string' && (named.has(r.id) || cited.has(r.id))) ||
        [r.factId, r.fact].some((id) => typeof id === 'string' && cited.has(id))
    )
    .map((r) => ({ id: r.id ?? null, text: r.text ?? r.quote ?? r.body ?? '' }))
}

/** Slots the page prints as one sentence, with what the demo prints there; input data, the prompt is not touched. */
const SENTENCE_NOTE =
  'These slots print run together as one sentence, in this order, with nothing added between them. Write them so the joined text reads as one sentence: only the first starts with a capital unless a word needs one. A slot under endWithASpace must end with a space; every other space between them is kept for you.'
const slimSentences = (groups) =>
  arr(groups).map((g) => ({
    slots: g.slots,
    demoPrints: g.sample,
    note: SENTENCE_NOTE,
    endWithASpace: arr(g.slots).filter((_, i) => arr(g.joins)[i] === ' ' && !arr(g.kept)[i])
  }))

/** The writer reads the demo's length in `demoChars` and `shape`; of the sample it needs only enough to see what kind of text it is. */
export const SAMPLE_PREVIEW = 160
const preview = (sample) => {
  const text = typeof sample === 'string' ? sample : ''
  return text.length > SAMPLE_PREVIEW ? `${text.slice(0, SAMPLE_PREVIEW).trimEnd()}…` : text
}
const demoCharsFor = (s) => {
  const { total, lead, bullets } = demoCharsOf(s)
  return { total, lead, bullets }
}

// The length window the copy check's W03 holds each text slot to, given with the slot so the writer need not work it out
// (Central Padel 12/11/2026: 6 of round 0's 9 W03 failures were texts under the 80% floor, one over the demo ceiling and one
// over the limit). The numbers come from the same kit slot and plan limit the check reads (lib/site-copy/inputs-index.js) and
// the same arithmetic (lib/site-copy/slot-shape.js lengthWindow, partWindows), for as many items as the demo shows: `min` is
// the floor (none for a short demo or an article lead, whose owner-post excerpt has no floor), `max` the demo plus the
// rounding tolerance or the limit, whichever is smaller; a lead and points slot adds `lead` and `point` (its average point).
export const LENGTH_WINDOW_NOTE =
  "Each text slot's \"characters\" is how long the copy check holds the written text, counted the way it counts (the items of a text joined by one space): at least min and at most max characters. max is the most the check accepts: the demo length plus 3 characters of rounding, never over the smaller of the kit's and the plan's maxCharacters; a slot without min has no floor (a demo of 40 characters or less, or an owner post excerpt). For a lead and points slot, min and max hold the whole text with as many points as the demo shows, and lead and point hold its lead paragraph and its average point the same way."

const windowRange = (w, floorless) => {
  const out = {}
  if (!floorless && w.floor > 0) out.min = w.floor
  if (w.ceiling !== null && w.ceiling !== undefined) out.max = w.ceiling
  return out
}

/** The `characters` window of each text slot by id, or null when the check holds the slot to no length. */
function lengthWindows({ plan, kit, brief, contentMap }) {
  const idx = indexInputs({ plan, kit, brief, contentMap: contentMap ?? undefined })
  return (s) => {
    const slot = idx.kitSlots.get(s.id) ?? s
    const floorless = slot.role === 'article.lead'
    const shape = slotShape(slot)
    const written = shape.points ? (shape.lead ? 1 : 0) + shape.points : 1
    const whole = lengthWindow({
      slot,
      planLimit: idx.expected.get(s.id)?.maxCharacters ?? null,
      written,
      excerpt: floorless
    })
    const out = windowRange({ floor: whole.floor, ceiling: whole.ceiling ?? whole.limit }, floorless)
    const parts = partWindows(slot)
    if (parts.lead) out.lead = windowRange(parts.lead, floorless)
    if (parts.point) out.point = windowRange(parts.point, floorless)
    // A window that only repeats the slot's own maxCharacters (a short demo the plan does not narrow) adds nothing.
    const keys = Object.keys(out)
    if (!keys.length || (keys.length === 1 && out.max === s.maxCharacters)) return null
    return out
  }
}

const slimSlot = (s, windowOf) => ({
  id: s.id,
  role: s.role ?? null,
  type: s.type ?? null,
  maxCharacters: s.maxCharacters ?? null,
  sample: preview(s.sample),
  demoChars: demoCharsFor(s),
  shape: slotShape(s),
  ...(windowOf?.(s) ? { characters: windowOf(s) } : {}),
  paragraphs: s.paragraphs ?? 0,
  bullets: s.bullets ?? 0,
  ...(s.role === 'article.lead'
    ? {
        originalPost:
          'Use one faithful contiguous excerpt of the planned original owner post, preserving its words and order. Do not add event details. A verified excerpt has no demo minimum length; maximum characters and paragraph limits still apply. Return surplus slots when no distinct truthful excerpt fits.'
      }
    : {}),
  ...(arr(s.pageTitleOf).length ? { pageTitleOf: s.pageTitleOf } : {}),
  ...(emphasisNoteOf(s) ? { inline: emphasisNoteOf(s) } : {})
})
// A block's own text slots, then its demo-owned ones the plan replaces (the writer writes those too, so it needs their limit
// and the demo's accent); an id listed in both is shown once.
const ownAndDemoOwned = (b) => {
  const own = arr(b.slots)
  const named = new Set(own.map((s) => s?.id))
  return [...own, ...arr(b.demoOwned).filter((s) => !named.has(s?.id))]
}
const textSlots = (slots, windowOf) =>
  arr(slots)
    .filter((s) => isObject(s) && s.type === 'text')
    .map((s) => slimSlot(s, windowOf))

function slimBlock(b, windowOf) {
  const look = typeof b.look === 'string' ? b.look : typeof b.look?.text === 'string' ? b.look.text : null
  return {
    id: b.id,
    role: b.role ?? null,
    ...(b.shared ? { shared: true } : {}),
    look,
    slots: textSlots(ownAndDemoOwned(b), windowOf),
    lists: arr(b.lists)
      .filter(isObject)
      .map((l) => {
        const rowSlots = textSlots(l.rowSlots, windowOf)
        const named = new Set(rowSlots.map((s) => s.id))
        const rows = arr(l.rows)
          .filter(isObject)
          .map((r) => ({
            index: r.index ?? null,
            slots: textSlots(r.slots, windowOf).filter((s) => !named.has(s.id))
          }))
          .filter((r) => r.slots.length)
        return { id: l.id, rowSlots, ...(rows.length ? { rows } : {}) }
      }),
    ...(arr(b.sentences).length ? { sentences: slimSentences(b.sentences) } : {})
  }
}

/** The block ids the plan uses: every decision but "hide", on shared blocks and on kept pages, in plan order. */
export function usedBlockIds(plan) {
  const decisions = [
    ...arr(plan?.sharedBlocks),
    ...arr(plan?.pages)
      .filter((p) => isObject(p) && p.decision === 'keep')
      .flatMap((p) => arr(p.blocks))
  ]
  const ids = []
  for (const d of decisions)
    if (isObject(d) && d.decision !== 'hide' && typeof d.block === 'string' && !ids.includes(d.block))
      ids.push(d.block)
  return ids
}

function footerHeadings(plan, kit) {
  const groups = new Map(
    arr(kit?.site?.navigationGroups)
      .filter(isObject)
      .map((g) => [g.id, g])
  )
  return arr(plan?.site?.footerMenu)
    .filter((m) => isObject(m) && groups.has(m.group))
    .map((m) => {
      const g = groups.get(m.group)
      return { group: m.group, titleSlot: g.titleSlot ?? null, heading: g.heading ?? null }
    })
}

const nameSlots = (kit) =>
  arr(kit?.site?.nameSlots)
    .filter((n) => isObject(n) && n.kind === 'printed' && HANDED_OVER_NAME_SLOTS.includes(n.where))
    .map((n) => ({ where: n.where, sample: n.sample ?? '' }))

/** The dropdown slots to write, grouped under their parent's label slot, in menu order. */
export function mainMenuSection(menu) {
  const groups = new Map()
  for (const s of menu.slots) {
    const list = groups.get(s.parentSlot) ?? []
    list.push({
      slot: s.slot,
      page: s.page,
      intent: s.intent,
      maxCharacters: s.maxCharacters,
      sample: s.sample
    })
    groups.set(s.parentSlot, list)
  }
  return [...groups].map(([parent, dropdown]) => ({ parent, dropdown }))
}

/**
 * The writer's input.
 * @param {{ plan: object, brief: object, kit: object, contentMap?: object | null }} input `kit` is the kit document
 *   (template-kit.json); `contentMap` the content map beside it, when the template has one
 */
export function writerInput({ plan, brief, kit, contentMap = null }) {
  const facts = citedFacts(plan, brief)
  const blocks = new Map(
    arr(kit?.blocks)
      .filter(isObject)
      .map((b) => [b.id, b])
  )
  const windowOf = lengthWindows({ plan, kit, brief, contentMap })
  return {
    plan,
    facts,
    reviews: quotedReviews(
      plan,
      brief,
      facts.map((f) => f.id)
    ),
    blocks: usedBlockIds(plan)
      .filter((id) => blocks.has(id))
      .map((id) => slimBlock(blocks.get(id), windowOf)),
    footerHeadings: footerHeadings(plan, kit),
    nameSlots: nameSlots(kit),
    labels: planLabelSlots({ plan, kit, contentMap }),
    mainMenu: mainMenuSection(mainMenuOf({ plan, kit, contentMap }))
  }
}

/**
 * The pages of the site in writing order (#326 story 3): the shared blocks ("shared"), the kept pages in main menu
 * order (menu children after their parent, kept pages the menu does not name after it), the legal pages the plan
 * creates, then "notFound" when the plan has a not-found page.
 */
export function pagesInWritingOrder(plan) {
  const kept = arr(plan?.pages)
    .filter((p) => isObject(p) && p.decision === 'keep' && typeof p.id === 'string')
    .map((p) => p.id)
  const menu = arr(plan?.mainMenu).flatMap((m) => [m?.page, ...arr(m?.children).map((c) => c?.page)])
  const ordered = [...new Set(menu.filter((id) => kept.includes(id)))]
  for (const id of kept) if (!ordered.includes(id)) ordered.push(id)
  const legal = arr(plan?.site?.legalPages)
    .filter((l) => isObject(l) && l.use === 'create')
    .map((l) => (typeof l.id === 'string' ? l.id : `legal:${l.kind}`))
  return [
    ...(arr(plan?.sharedBlocks).length ? ['shared'] : []),
    ...ordered,
    ...legal,
    ...(isObject(plan?.site?.notFound) ? ['notFound'] : [])
  ]
}
