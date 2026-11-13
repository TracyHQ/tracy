// The AI quickstart draft (ticket #583): a template's content contract (template kit + content map) and its reviewed
// decisions in, the block store description and page recipes out, plus a report of what is still open. Pure.
// Format of the output: docs/references/ai-quickstart-contract.md. Keys beyond the format (`slot`, `slots`,
// `limitFrom`, `from`, `storage`, `optional`, `derived`, `designFrom`) say where each field came from, for the mapping
// file (#584) and for a reviewer; the contract check ignores them.
import { draftBlocks } from './draft-blocks.mjs'
import { draftRecipes } from './draft-recipes.mjs'

export const DRAFT_TOOL = 'tracy-ai-quickstart-draft/1'

/**
 * @param {{kit: object, contentMap: object, decisions?: object, measured?: object, template: {slug: string, version: string}}} input
 */
export function draftAiQuickstart({ kit, contentMap, decisions = {}, measured = {}, template }) {
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
  return { blockStore, pageRecipes, report }
}

/** Counts a reviewer reads first: blocks, fields by type, limits by source, open items. */
export function summaryOf({ blockStore, pageRecipes, report }) {
  const byType = {}
  const limits = { kitFrame390: 0, contentMapFitPhone: 0, measuredOnSite: 0, notDrawn: 0, missing: 0 }
  for (const b of blockStore.blocks)
    for (const f of [...b.fields, ...(b.itemFields ?? [])]) {
      byType[f.type] = (byType[f.type] ?? 0) + 1
      if (f.type !== 'text') continue
      const from = String(f.limitFrom ?? '')
      if (!Number.isInteger(f.limit)) limits.missing++
      else if (from.startsWith('measured at 390px')) limits.measuredOnSite++
      else if (from.startsWith('not drawn at any width')) limits.notDrawn++
      else if (/content map fit/.test(from) && !/kit frame/.test(from)) limits.contentMapFitPhone++
      else limits.kitFrame390++
    }
  return {
    blocks: blockStore.blocks.length,
    fieldsByType: byType,
    textLimits: limits,
    pageTypes: pageRecipes.recipes.map((r) => r.pageType),
    excludedPageGroups: pageRecipes.excluded.length,
    open: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]))
  }
}
