// An invented florist kit for the gate's unit tests (ticket #585): the invented florist block store and page recipes
// with a small mapping, blank site contract and presentation lock made from the store itself. Every module block with a
// stored field is copied per site from its blank site module; each stored field is one contract slot with an invented
// demo sample. Small on purpose: enough for the accounting, the memory write, the written but not seen check, the
// pages and the doors to run on a template that is not a real one.
import {
  FLORIST_TEMPLATE,
  floristBlockStore,
  floristPageRecipes
} from '../../../../packages/wo/website-opportunities/test/fixtures/write-order/florist-store.mjs'

/** The invented demo words of a slot of the blank site: what a page shows before the write. */
export const demoSampleOf = (block, field) => `Petal demo ${block} ${field}`

export function floristKit() {
  const blockStore = floristBlockStore()
  const entities = {}
  const placements = {}
  const blocks = {}
  const slots = []
  const lock = {}
  for (const b of blockStore.blocks) {
    const fields = {}
    let entity = null
    for (const f of b.fields ?? []) {
      if (!f.slot?.startsWith('module-')) continue
      const [e, n] = f.slot.split('.')
      entity = e
      fields[f.name] = { slot: f.slot, entity: e, column: 'params' }
      slots.push({
        key: f.slot,
        entity: e,
        column: 'params',
        jsonPath: ['fields', n],
        type: f.type === 'link' ? 'link' : 'text',
        sample: demoSampleOf(b.id, f.name),
        maxCharacters: f.limit ?? 200,
        role: f.kind
      })
    }
    if (!entity) continue
    b.placement = 'copy'
    entities[entity] = { kind: 'module', sourceId: Number(entity.slice('module-'.length)) }
    placements[b.id] = { entity, assign: 'every-page' }
    blocks[b.id] = { fields }
    lock[entity] = {
      title: b.id,
      module: 'mod_custom',
      position: b.positions[0],
      published: '1',
      showtitle: '0',
      params: '{}',
      content: ''
    }
  }
  return {
    ref: 'example-petal/j6@1.0.0',
    blockStore,
    pageRecipes: floristPageRecipes(),
    template: { slug: FLORIST_TEMPLATE.slug, version: FLORIST_TEMPLATE.version },
    mapping: {
      entities,
      placements,
      blocks,
      overrides: { language: [{ key: 'TPL_PETAL_FOLLOW', keep: 'kept: the label of the social row' }] }
    },
    blankContract: { slots, entities: Object.entries(entities).map(([key, e]) => ({ key, kind: e.kind })) },
    lock: { entities: lock }
  }
}
