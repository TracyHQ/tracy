// The site writer's input (ADR 0042, #329): what the writer reads, trimmed from the plan, the brief and the kit. Pure:
// inputs in, a new object out, nothing modified.
//
// - The whole site plan, as given.
// - From the brief, only the facts the plan cites (any `factIds` anywhere in the plan), each as { id, field, value,
//   evidence } where `evidence` lists the quotes the fact was read from; and the full text of every review the plan
//   quotes (a `brief.reviews[]` entry whose id the plan names, or that names a cited fact as its own).
// - From the kit, a slim view of every block the plan uses (every block decision but "hide", on shared blocks and
//   kept pages): its look text and, per text slot, id, role, type, maxCharacters, sample, paragraphs and bullets; per
//   list, its row slots and the slots of demo rows the row slots do not name. Also the footer column headings
//   (the kit's navigation group of each `site.footerMenu[].group`) and the two name slots the brand step hands over
//   (`kit.site.nameSlots` printed at the document title and the meta description).
// - From the content map (when the template has one), the main menu dropdown slots the writer writes, grouped under
//   their parent's label slot (main-menu.js).
// No image: the writer reads the block look text instead.
import { mainMenuOf } from './main-menu.js'

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
  'These slots print run together as one sentence, in this order, with nothing added between them. Write them so the joined text reads as one sentence: each piece carries its own spaces, and only the first starts with a capital unless a word needs one.'
const slimSentences = (groups) =>
  arr(groups).map((g) => ({ slots: g.slots, demoPrints: g.sample, note: SENTENCE_NOTE }))

const slimSlot = (s) => ({
  id: s.id,
  role: s.role ?? null,
  type: s.type ?? null,
  maxCharacters: s.maxCharacters ?? null,
  sample: s.sample ?? '',
  paragraphs: s.paragraphs ?? 0,
  bullets: s.bullets ?? 0,
  ...(arr(s.pageTitleOf).length ? { pageTitleOf: s.pageTitleOf } : {})
})
const textSlots = (slots) =>
  arr(slots)
    .filter((s) => isObject(s) && s.type === 'text')
    .map(slimSlot)

function slimBlock(b) {
  const look = typeof b.look === 'string' ? b.look : typeof b.look?.text === 'string' ? b.look.text : null
  return {
    id: b.id,
    role: b.role ?? null,
    ...(b.shared ? { shared: true } : {}),
    look,
    slots: textSlots(b.slots),
    lists: arr(b.lists)
      .filter(isObject)
      .map((l) => {
        const rowSlots = textSlots(l.rowSlots)
        const named = new Set(rowSlots.map((s) => s.id))
        const rows = arr(l.rows)
          .filter(isObject)
          .map((r) => ({ index: r.index ?? null, slots: textSlots(r.slots).filter((s) => !named.has(s.id)) }))
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
      .map((id) => slimBlock(blocks.get(id))),
    footerHeadings: footerHeadings(plan, kit),
    nameSlots: nameSlots(kit),
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
