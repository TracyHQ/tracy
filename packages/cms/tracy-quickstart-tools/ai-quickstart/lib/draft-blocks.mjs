// Draft the block store of an AI quickstart from a template kit and its content map (ADR 0046, ticket #583). Pure:
// kit + content map + the template's reviewed decisions in, blocks out, with everything the draft could not decide
// listed beside them (`unmeasured`, `unlisted`, `undecided`, ...). Nothing is guessed: a block without a decided type
// keeps no type, a text without a limit measured at 390 px keeps no limit, and the contract check then reports it.
//
// A kit block becomes one store block. Its own slots become `fields`; a list of one row becomes fields named after the
// list; the first repeating list becomes `itemFields` with `items`; a list of a module the block contains becomes a
// block of its own (`inside:<container>`). Menu labels and template strings are written by the build elsewhere (page
// titles, language overrides) and are listed in `derived`, except in a navigation block, whose menu is its items.
import { draftOne, listSlotIds } from './draft-one-block.mjs'

const emptyReport = () => ({
  unmeasured: [],
  derived: [],
  unlisted: [],
  undecided: [],
  skipped: [],
  notInMap: [],
  problems: [],
  omitted: []
})

/**
 * A text the demo shows only where no page of the build shows it (a masthead's default title, drawn when a page has
 * no title row of its own) takes the measured limit of the box that draws it (`decisions.sameBoxAs`: key -> key).
 */
function applySameBox(blocks, sameBoxAs, out) {
  const fields = blocks.flatMap((b) => [...b.fields, ...(b.itemFields ?? [])])
  const holds = (f, key) => f.slot === key || (f.slots ?? []).includes(key)
  for (const [key, target] of Object.entries(sameBoxAs ?? {})) {
    const field = fields.find((f) => holds(f, key) && !Number.isInteger(f.limit))
    const box = fields.find((f) => holds(f, target) && Number.isInteger(f.limit))
    if (!field || !box) continue
    Object.assign(field, { limit: box.limit, limitFrom: `the same box as ${target}: ${box.limitFrom}` })
    out.unmeasured = out.unmeasured.filter((u) => u.slot !== key)
  }
}

/**
 * The place of a field within its record, so pages of one layout line up: where the content map stores it (column,
 * JSON path, XPath), since two articles of one layout number their slots differently when one stores a row more
 * (`article-2.13` is a schedule row where `article-16.13` is a heading). The slot number stands in only for a slot the
 * content map does not describe.
 */
function placeOf(field, mapSlots) {
  const key = String(field.slot ?? field.slots?.[0] ?? '')
  const slot = mapSlots?.get(key)
  if (slot && (slot.column || slot.jsonPath || slot.xpath))
    return JSON.stringify([slot.column ?? '', slot.jsonPath ?? [], slot.xpath ?? ''])
  return key.replace(/^[^.]+/, '')
}

/** The report lists a merged page fills: what that page leaves open is open for the store block too. */
const MERGED_REPORT_KEYS = ['unmeasured', 'derived', 'unlisted', 'notInMap', 'omitted', 'problems']

/** Adds a merged page's open entries to the report, once per block and slot, naming the page (`on`). */
function mergeReport(out, scratch, memberId) {
  for (const key of MERGED_REPORT_KEYS)
    for (const entry of scratch[key] ?? []) {
      const same = (e) => e.block === entry.block && (e.slot ?? e.problem) === (entry.slot ?? entry.problem)
      if (key === 'unmeasured' || out[key].some(same)) continue
      out[key].push({ ...entry, on: memberId })
    }
}

/**
 * Several kit blocks of one layout (the bodies of pages of one type) are one store block. A text field takes the
 * least limit measured on any of those pages, so copy fits every page of the type.
 */
export function mergeLimits(store, member, memberId, mapSlots) {
  for (const key of ['fields', 'itemFields']) {
    const byPlace = new Map((member[key] ?? []).map((f) => [placeOf(f, mapSlots), f]))
    for (const field of store[key] ?? []) {
      const other = byPlace.get(placeOf(field, mapSlots))
      if (field.type !== 'text' || !Number.isInteger(other?.limit)) continue
      if (!Number.isInteger(field.limit) || other.limit < field.limit)
        Object.assign(field, { limit: other.limit, limitFrom: `${other.limitFrom} (on ${memberId})` })
    }
  }
}

/**
 * @param {{kit: object, contentMap: object, decisions: object, measured?: Record<string, {limit: number, limitFrom: string}>}} input
 */
export function draftBlocks({ kit, contentMap, decisions = {}, measured = {} }) {
  const mapSlots = new Map((contentMap.slots ?? []).map((s) => [s.key, s]))
  const slotsByEntity = new Map()
  for (const s of contentMap.slots ?? [])
    slotsByEntity.set(s.entity, [...(slotsByEntity.get(s.entity) ?? []), s])
  const frames = new Map()
  for (const b of kit.blocks ?? []) for (const f of b.frames ?? []) if (!frames.has(f.id)) frames.set(f.id, f)
  const shownAnywhere = new Set()
  for (const b of kit.blocks ?? []) {
    for (const s of [...(b.slots ?? []), ...(b.demoOwned ?? []), ...(b.frames ?? [])]) shownAnywhere.add(s.id)
    for (const x of listSlotIds(b.lists)) shownAnywhere.add(x)
  }
  const groups = (decisions.groups ?? []).map((g) => ({ ...g, re: new RegExp(g.match) }))
  const decisionOf = (kitId) => decisions.blocks?.[kitId] ?? {}
  const decided = (kb) => decisions.blocks?.[kb.id] ?? groups.find((g) => g.re.test(kb.id)) ?? {}
  const storeKitIds = new Set((kit.blocks ?? []).filter((kb) => !decided(kb).skip).map((kb) => kb.id))
  // A text never drawn in a box (an icon link's label, a picture's alt text) has no width to measure; the decisions
  // name each with its reason and the cap it keeps, and the draft records it as such, never as a measurement.
  const nonVisual = Object.fromEntries(
    Object.entries(decisions.nonVisual ?? {}).map(([key, v]) => [
      key,
      { limit: v.limit, limitFrom: `not drawn at any width: ${v.why}` }
    ])
  )
  const omit = decisions.omit ?? {}
  const ctx = {
    omit,
    mapSlots,
    slotsByEntity,
    frames,
    shownAnywhere,
    measured: { ...nonVisual, ...measured },
    decisionOf,
    storeKitIds
  }
  const out = { ...emptyReport(), nested: [] }
  const blocks = []
  const storeIdOf = {}
  for (const kb of kit.blocks ?? []) {
    const own = decisions.blocks?.[kb.id]
    const group = own ? null : groups.find((g) => g.re.test(kb.id))
    const decision = own ?? group ?? {}
    if (decision.skip) {
      out.skipped.push({ kit: kb.id, reason: decision.skip })
      continue
    }
    const id = decision.id ?? kb.id
    const existing = blocks.find((b) => b.id === id)
    if (existing) {
      const scratch = { ...emptyReport(), nested: [] }
      mergeLimits(existing, draftOne(kb, id, decision, ctx, scratch), kb.id, mapSlots)
      mergeReport(out, scratch, kb.id)
      existing.from.kit.push(kb.id)
      storeIdOf[kb.id] = id
      continue
    }
    blocks.push(draftOne(kb, id, decision, ctx, out))
    storeIdOf[kb.id] = id
    for (const make of out.nested.splice(0)) {
      const nested = make()
      blocks.push(nested)
      storeIdOf[nested.id] = nested.id
    }
  }
  delete out.nested
  applySameBox(blocks, decisions.sameBoxAs, out)
  return { blocks, storeIdOf, ...out }
}
