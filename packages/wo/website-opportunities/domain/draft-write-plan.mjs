// The write plan of a draft build (ticket #597): a checked write order and the AI quickstart declarations in, the
// ordered door operations that build the site into a blank site out. Deterministic, no I/O. Every operation carries
// the order entries it writes and the contract rules it follows; every order entry is written by exactly one operation
// or listed in `skipped` with its reason (`draftWriteCoverage`). The guards of `draft-write-guards.mjs` run on the plan
// before any door is called. Spec: docs/references/draft-write-step.md.
import { DraftWriteError } from './draft-write-error.mjs'
import { guardPlan } from './draft-write-guards.mjs'
import { planBlocks } from './draft-write-plan-blocks.mjs'
import { planCopies } from './draft-write-plan-copies.mjs'
import { planFacts, planLook } from './draft-write-plan-facts.mjs'
import { opsOf } from './draft-write-plan-ops.mjs'
import { mainMenuOf, planCategories, planMenuItems, planPages } from './draft-write-plan-pages.mjs'
import { consume, recordOf, sinkOf } from './draft-write-sink.mjs'
import { siteOf } from './draft-write-site.mjs'
import { blockRecordOf, placesWithScope } from './draft-write-targets.mjs'
import { checkWriteOrder } from './write-order-check.mjs'

export { draftWriteCoverage, entriesOfOrder } from './draft-write-coverage.mjs'
export const DRAFT_WRITE_PLAN_SCHEMA = 'tracy-draft-write-plan/v1'

const list = (value) => (Array.isArray(value) ? value : [])

/** What the planner reads of the kit, indexed once (the guards' `kit`). */
export function draftWriteKitOf(aiq) {
  const mapping = aiq?.mapping
  if (!mapping?.placements || !mapping?.blocks || !aiq?.blockStore?.blocks)
    throw new DraftWriteError(
      'kit_missing',
      'the draft write needs the block store and the mapping file with placements'
    )
  const ownerOf = new Map()
  for (const [block, p] of Object.entries(mapping.placements)) if (p.entity) ownerOf.set(p.entity, block)
  const rowHides = new Map()
  for (const [block, hides] of Object.entries(mapping.hides ?? {}))
    if (list(hides).some((h) => h.by === 'row')) rowHides.set(block, true)
  return {
    mapping,
    store: new Map(aiq.blockStore.blocks.map((b) => [b.id, b])),
    slots: new Map(list(aiq.blankContract?.slots).map((s) => [s.key, s])),
    ownerOf,
    rowHides,
    mainMenu: mainMenuOf(mapping)
  }
}

/** Every copy and in-place record the order places, made before any value so a block with no words is still copied. */
function placeRecords(state) {
  for (const page of state.order.pages)
    for (const block of page.blocks) {
      if (block.state === 'hidden') continue
      const own = blockRecordOf(state.kit, page, block)
      if (!own) continue
      const record = recordOf(state.sink, own.key, own.init)
      record.pages.add(page.id)
      record.order ??= block.order
      record.rank ??= page.blocks.indexOf(block) + 1
    }
}

/** A Tracy library block: its rendered HTML written as a new module at its resolved position on its page. */
function planLibrary(state) {
  for (const at of state.library) {
    const key = `library:${at.page.id}.${at.block.id}`
    const record = recordOf(state.sink, key, {
      kind: 'library',
      recordKind: 'module',
      block: at.block.block,
      html: at.block.library?.html ?? '',
      position: at.block.position?.resolved ?? at.block.position?.request ?? null,
      page: at.page.id,
      rank: at.page.blocks.indexOf(at.block) + 1
    })
    for (const id of [
      ...list(at.place.fields).map((e) => e.place),
      ...list(at.place.pictures).map((p) => p.frame),
      ...list(at.place.icons).map((i) => i.id)
    ])
      consume(state.sink, id, record.key)
  }
}

/**
 * The write plan.
 * @param {object} order a write order (`tracy-write-order/v1`); refused when `checkWriteOrder` finds a problem
 * @param {{blockStore: object, mapping: object, pageRecipes?: object, blankContract?: object}} aiq the AI quickstart
 *   declarations; `blankContract`: the blank site contract's content map (its slots: limits, `opensEmpty`)
 * @param {{stored?: Record<string, {id: string, mime?: string}>, withheld?: object, approved?: object,
 *   iconKeys?: string[]}} [options] `stored`: the stored bytes of every picture and icon the site shows, by frame or
 *   icon id; `withheld`: the profile's held texts; `approved`: the approved plan; `iconKeys`: the icon library's names
 * @returns {{schema: string, ops: object[], skipped: object[], unproven: object[]}}
 */
export function writePlanOf(order, aiq, options = {}) {
  const problems = checkWriteOrder(order)
  if (problems.length)
    throw new DraftWriteError('order_invalid', `${problems.length} problem(s) in the write order`, {
      codes: [...new Set(problems.map((p) => p.code))]
    })
  const kit = draftWriteKitOf(aiq)
  const sink = sinkOf()
  const state = {
    order,
    kit,
    sink,
    site: siteOf(order, kit, sink),
    facts: [],
    menuLinks: [],
    library: [],
    pictures: new Map(),
    rows: new Map(),
    stored: options.stored ?? {}
  }
  placeRecords(state)
  planBlocks(state)
  planFacts(state)
  planMenuItems(state)
  planPages(state)
  planLibrary(state)
  planLook(state)
  planCopies(state)
  planCategories(state)
  for (const record of sink.records.values())
    if (record.recordKind === 'article' && !record.title) {
      const title = [...record.values.values()].find(
        (v) => !v.loc.jsonPath && !v.loc.xpath && v.loc.column === 'title'
      )
      record.title = title?.value ?? state.site.pageOfSubject(record.subject)?.name ?? record.subject
    }
  const ops = opsOf(state)
  for (const op of ops)
    if (op.unproven === 'created_record_frame' || op.unproven === 'initials_drawn_as_figure')
      sink.unproven.push({ code: op.unproven, op: op.key })
  const plan = {
    schema: DRAFT_WRITE_PLAN_SCHEMA,
    mainMenu: kit.mainMenu,
    order: {
      run: order.run,
      plan: order.plan,
      template: { slug: order.template?.slug, version: order.template?.version }
    },
    ops,
    skipped: sink.skipped.filter((s) => !sink.consumed.has(s.entry)),
    unproven: sink.unproven,
    controls: [...sink.records.values()].flatMap((r) =>
      list(r.controls).map((c) => ({ record: r.key, ...c }))
    )
  }
  plan.pairs = pairsOf(state)
  guardPlan(plan, { order, kit, ...options })
  delete plan.pairs
  return plan
}

/** Light and dark versions of one icon or picture (`variantOf`) where one is written and the other is not. */
function pairsOf(state) {
  const out = []
  for (const at of placesWithScope(state.order)) {
    const decls = [
      ...list(state.kit.store.get(at.block.block)?.fields),
      ...list(state.kit.store.get(at.block.block)?.itemFields),
      ...list(state.kit.store.get(at.block.block)?.lists).flatMap((l) => list(l.fields)),
      ...list(state.kit.store.get(at.block.block)?.itemLists).flatMap((l) => list(l.fields))
    ]
    const ids = new Map(
      [...list(at.place.pictures), ...list(at.place.icons)].map((p) => [
        p.field,
        p.frame && !p.id ? p.frame : (p.id ?? p.frame)
      ])
    )
    for (const d of decls) {
      if (!d.variantOf || !ids.has(d.name) || !ids.has(d.variantOf)) continue
      const a = state.sink.consumed.has(ids.get(d.name))
      const b = state.sink.consumed.has(ids.get(d.variantOf))
      if (a !== b) out.push({ entry: ids.get(a ? d.variantOf : d.name), fields: [d.variantOf, d.name] })
    }
  }
  return out
}
