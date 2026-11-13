// The AI quickstart mapping file (ticket #584): the block store, the draft report and the content map of a template,
// plus its reviewed mapping decisions, in; mapping.json out. Pure. Format: docs/references/ai-quickstart-contract.md,
// "The mapping file". Every location keeps the shape of a content map slot (mapping-locations.mjs).
import { blocksEntries, factOfPlace } from './mapping-blocks.mjs'
import { entitiesNamed, entitiesTable, locationOf, slotsByKey } from './mapping-locations.mjs'

export const MAPPING_TOOL = 'tracy-ai-quickstart-mapping/1'

/** A fact place of the decisions as a location: a content map place, or an entity the decisions declare. */
function factLocation(p, slots) {
  const loc = p.place
    ? locationOf(p.place, slots)
    : { entity: p.entity, column: p.column, ...(p.jsonPath ? { jsonPath: p.jsonPath } : {}) }
  return { ...loc, ...(p.as ? { as: p.as } : {}), why: p.why }
}

function factsOf(decisions, slots) {
  return Object.fromEntries(
    Object.entries(decisions.facts ?? {}).map(([name, places]) => [
      name,
      places.map((p) => factLocation(p, slots))
    ])
  )
}

/** Every use of each stored place by a block field: place -> [{block, field, limit?}]. */
function fieldUsesOf(blocks) {
  const uses = new Map()
  const add = (b, f, places) => {
    for (const p of places.flat(3)) {
      const key = p.split('@')[0]
      uses.set(key, [
        ...(uses.get(key) ?? []),
        { block: b.id, field: f.name, ...(Number.isInteger(f.limit) ? { limit: f.limit } : {}) }
      ])
    }
  }
  const walk = (b, lists) => {
    for (const l of lists ?? []) {
      for (const f of l.fields ?? []) add(b, f, f.slots ?? [])
      walk(b, l.lists)
    }
  }
  for (const b of blocks) {
    for (const f of b.fields ?? []) if (f.slot && f.type !== 'design') add(b, f, [f.slot])
    for (const f of b.itemFields ?? []) add(b, f, f.slots ?? [])
    walk(b, b.lists)
    walk(b, b.itemLists)
  }
  return uses
}

/**
 * One language override per template language string of the content map: a string a field shows takes its value
 * from that field (`filledBy`, written once within the smallest limit when several fields share it); a string no
 * field shows keeps the template's words (`keep`, the draft report's reason). Then the decisions' own entries
 * (platform strings: a value, or `keep`).
 */
function languageOverrides({ contentMap, blocks, report, decisions }) {
  const uses = fieldUsesOf(blocks)
  const classed = new Map(
    [...(report.outsideStore ?? []), ...(report.unlisted ?? [])].map((e) => [e.slot, e])
  )
  const out = []
  for (const e of contentMap.entities ?? []) {
    if (e.kind !== 'languageString') continue
    const slot = (contentMap.slots ?? []).find((s) => s.entity === e.key)
    const by = slot ? uses.get(slot.key) : null
    const base = { key: e.identity.key, extension: e.identity.extension, language: e.identity.language }
    if (by?.length) {
      const limits = by.map((u) => u.limit).filter(Number.isInteger)
      out.push({
        ...base,
        slot: slot.key,
        filledBy: by.map(({ block, field }) => ({ block, field })),
        ...(limits.length ? { limit: Math.min(...limits) } : {})
      })
    } else {
      const c = slot && classed.get(slot.key)
      if (!c) throw new Error(`${e.key}: a template string neither a field nor classed by the draft report`)
      out.push({ ...base, slot: slot.key, keep: `${c.as}: ${c.why}` })
    }
  }
  return [...out, ...(decisions.overrides?.language ?? [])]
}

/**
 * @param {{blockStore: object, pageRecipes: object, report: object, contentMap: object, draftDecisions: object, decisions: object}} input
 *   `report`: draft-report.json; `draftDecisions`: draft-decisions.json (removedWithPage); `decisions`: mapping-decisions.json
 */
export function draftMapping({ blockStore, report, contentMap, draftDecisions, decisions }) {
  const slots = slotsByKey(contentMap)
  const factOf = factOfPlace(decisions.facts)
  const blocks = blocksEntries(blockStore, { slots, factOf })
  const facts = factsOf(decisions, slots)
  const overrides = {
    settings: decisions.overrides?.settings ?? [],
    language: languageOverrides({ contentMap, blocks: blockStore.blocks ?? [], report, decisions })
  }
  const buildSets = Object.fromEntries(
    Object.entries(decisions.buildSets ?? {}).map(([ref, d]) => {
      const [, entity, column, path] = /^([^:]+):([^:]+):(.+)$/.exec(ref) ?? []
      if (!entity) throw new Error(`${ref}: a build-sets reference is <entity>:<column>:<json path>`)
      const jsonPath = path.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k))
      return [ref, { entity, column, jsonPath, sets: d.sets, pageType: d.pageType, why: d.why }]
    })
  )
  const named = entitiesNamed([blocks, facts, overrides.settings, buildSets])
  const entities = entitiesTable({
    named,
    contentMap,
    decisions,
    removedWithPage: draftDecisions.removedWithPage ?? {}
  })
  return {
    schema: 'tracy-ai-quickstart-mapping/v1',
    template: blockStore.template,
    draftedBy: { tool: MAPPING_TOOL },
    entities,
    blocks,
    facts,
    factExceptions: decisions.factExceptions ?? [],
    notFacts: decisions.notFacts ?? [],
    seo: { shareImageFrame: { width: 1200, height: 630 }, ...decisions.seo },
    library: decisions.library,
    ...(decisions.networkIconClasses ? { networkIconClasses: decisions.networkIconClasses } : {}),
    buildSets,
    overrides,
    notEmptied: decisions.notEmptied ?? [],
    inlineMarkup: report.inlineMarkup
      ? {
          class: report.inlineMarkup.class,
          count: report.inlineMarkup.count,
          owners: report.inlineMarkup.owners
        }
      : undefined
  }
}
