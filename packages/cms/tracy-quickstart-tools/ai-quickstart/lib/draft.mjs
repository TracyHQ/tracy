// The AI quickstart draft (ticket #583): a template's content contract (template kit + content map) and its reviewed
// decisions in, the block store description and page recipes out, plus a report of what is still open. Pure.
// Format of the output: docs/references/ai-quickstart-contract.md. Keys beyond the format (`slot`, `slots`,
// `limitFrom`, `from`, `storage`, `optional`, `derived`, `designFrom`) say where each field came from, for the mapping
// file (#584) and for a reviewer; the contract check ignores them.
import { draftBlocks } from './draft-blocks.mjs'
import { accountForPlaces } from './draft-coverage.mjs'
import { accountForReferences } from './draft-references.mjs'
import { draftRecipes } from './draft-recipes.mjs'

export const DRAFT_TOOL = 'tracy-ai-quickstart-draft/1'

/**
 * @param {{kit: object, contentMap: object, lock?: object, decisions?: object, measured?: object, template: {slug: string, version: string}}} input
 *   `lock`: the contract's presentation-lock.json, whose stored settings are swept for references (draft-references.mjs)
 */
export function draftAiQuickstart({ kit, contentMap, lock, decisions = {}, measured = {}, template }) {
  const drafted = draftBlocks({ kit, contentMap, decisions, measured })
  const { blocks, storeIdOf, ...report } = drafted
  const { recipes, excluded } = draftRecipes({ kit, storeIdOf, blocks, decisions })
  const blockStore = {
    schema: 'tracy-ai-quickstart-block-store/v1',
    roleVocabularyVersion: contentMap.roleVocabularyVersion,
    template,
    draftedBy: { tool: DRAFT_TOOL, kit: kit.contract ?? null, kitTool: kit.tool ?? null },
    blocks
  }
  const pageRecipes = {
    schema: 'tracy-ai-quickstart-page-recipes/v1',
    orderFrom: 'the kit pages at the widest measured width, where blocks sit in their layout positions',
    recipes,
    excluded
  }
  const placed = new Set(
    recipes.flatMap((r) => [...r.blocks, ...(r.variants ?? []).flatMap((v) => v.blocks)])
  )
  report.notPlaced = blocks.filter((b) => !placed.has(b.id)).map((b) => b.id)
  // What the reviewed decisions tell the mapping file (#584) beside the blocks: how a block without fields is
  // filled, why a page has no recipe.
  report.notes = decisions.notes ?? []
  // Every stored place of the content map is a field, a classed report entry, or removed with its page; draft.mjs
  // writes nothing while one is unaccounted (`coverage.unaccounted`).
  const coverage = accountForPlaces({ contentMap, blocks, report, decisions })
  // A stored place several fields use: a build writes it within the smallest of their limits.
  report.sharedPlaces = sharedPlacesOf(blocks)
  // Every reference a surviving record makes to another record; draft.mjs writes nothing while one is unaccounted.
  const references = lock ? accountForReferences({ lock, contentMap, blocks, report, decisions }) : null
  if (references)
    report.references = { total: references.total, byClass: references.byClass, classed: references.classed }
  return { blockStore, pageRecipes, report, coverage, references }
}

/** Every stored place more than one field uses, with each use and the smallest text limit among them. */
export function sharedPlacesOf(blocks) {
  const uses = new Map()
  const listFields = (lists) => (lists ?? []).flatMap((l) => [...l.fields, ...listFields(l.lists)])
  for (const b of blocks)
    for (const f of [
      ...b.fields,
      ...(b.itemFields ?? []),
      ...listFields(b.lists),
      ...listFields(b.itemLists)
    ]) {
      if (f.type === 'design') continue
      for (const place of new Set([f.slot, ...(f.slots ?? []).flat()].filter(Boolean)))
        uses.set(place, [
          ...(uses.get(place) ?? []),
          { block: b.id, field: f.name, ...(Number.isInteger(f.limit) ? { limit: f.limit } : {}) }
        ])
    }
  return [...uses]
    .filter(([, list]) => list.length > 1)
    .map(([place, list]) => {
      const limits = list.map((u) => u.limit).filter(Number.isInteger)
      return { place, ...(limits.length ? { limit: Math.min(...limits) } : {}), uses: list }
    })
}

/** The child fields of a list of child lists, nested lists included. */
const childFieldsOf = (lists) => (lists ?? []).flatMap((l) => [...l.fields, ...childFieldsOf(l.lists)])

/** Counts a reviewer reads first: blocks, fields by type, limits by source, open items. */
export function summaryOf({ blockStore, pageRecipes, report, coverage }) {
  const byType = {}
  const childByType = {}
  const limits = { kitFrame390: 0, measuredOnSite: 0, notDrawn: 0, other: 0, missing: 0 }
  for (const b of blockStore.blocks)
    for (const [f, child] of [
      ...[...b.fields, ...(b.itemFields ?? [])].map((f) => [f, false]),
      ...childFieldsOf([...(b.lists ?? []), ...(b.itemLists ?? [])]).map((f) => [f, true])
    ]) {
      const counts = child ? childByType : byType
      counts[f.type] = (counts[f.type] ?? 0) + 1
      if (f.type !== 'text') continue
      const from = String(f.limitFrom ?? '')
      if (!Number.isInteger(f.limit)) limits.missing++
      else if (/not drawn at any width/.test(from)) limits.notDrawn++
      else if (/measured (at \d+px )?on the running template/.test(from)) limits.measuredOnSite++
      else if (/kit frame[^;]*\b390px \d+/.test(from)) limits.kitFrame390++
      else limits.other++
    }
  return {
    blocks: blockStore.blocks.length,
    fieldsByType: byType,
    childFieldsByType: childByType,
    textLimits: limits,
    pageTypes: pageRecipes.recipes.map((r) => r.pageType),
    excludedPageGroups: pageRecipes.excluded.length,
    open: Object.fromEntries(
      Object.entries(report)
        .filter(([k]) => k !== 'references')
        .map(([k, v]) => [k, Array.isArray(v) ? v.length : v])
    ),
    unlistedUnclassified: (report.unlisted ?? []).filter((u) => !u.as).length,
    ...(report.references
      ? { references: { total: report.references.total, ...report.references.byClass } }
      : {}),
    ...(coverage ? { coverage: { ...coverage, unaccounted: coverage.unaccounted.length } } : {})
  }
}
