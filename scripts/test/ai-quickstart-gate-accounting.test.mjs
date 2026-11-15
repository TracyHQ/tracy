// The accounting of the marker test (ticket #585): every place a mapping declares is written, declared not written by
// the kit, or skipped by the build team's chain with its reason, and none is unexplained. First on an invented mapping
// and write plan, then on the JA Boxing kit run end to end on a memory site (the build team's write step and the plugin
// rules it measured), which is the gate's own first write before any real site.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { accountFor } from '../ai-quickstart/gate/accounting.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { universeOf } from '../ai-quickstart/gate/universe.mjs'

const loc = (slot, extra = {}) => ({ slot, entity: slot.split('.')[0], column: 'params', ...extra })
const MAPPING = {
  blocks: {
    'hero-a': { fields: { heading: loc('module-1.0'), design: loc('module-1.9') } },
    'list-a': {
      itemFields: {
        name: [0, 1, 2].map((i) => loc(`module-2.${i}`, { jsonPath: ['cards', 'title', i] }))
      }
    },
    'unused-a': { fields: { heading: loc('module-3.0') } }
  },
  facts: { phone: [loc('module-1.5')] },
  overrides: { language: [{ key: 'KIT_WORD', slot: 'languageString-1.0', keep: 'not drawn' }] }
}
const STORE = { blocks: [{ id: 'hero-a', fields: [{ name: 'design', type: 'design' }] }] }

test('an invented mapping: written, cut, design, kept language, skipped, and nothing unexplained', () => {
  assert.equal(universeOf(MAPPING).size, 8)
  const writePlan = {
    ops: [
      { key: 'copy:home.home-b1', values: [{ loc: loc('module-1.0'), entry: 'home.home-b1.heading' }] },
      {
        key: 'copy:home.home-b2',
        values: [
          { loc: loc('module-2.0', { jsonPath: ['cards', 'title', 0] }), entry: 'home.home-b2.i1.name' }
        ],
        cuts: [
          {
            row: { entity: 'module-2', column: 'params', parent: ['cards'], arrays: ['title'] },
            kept: [0],
            rule: 'hides.row'
          }
        ]
      }
    ],
    skipped: [{ entry: 'home.home-b1.phone', reason: 'fact_fanned_out', fact: 'phone' }],
    conflicts: []
  }
  const order = {
    pages: [
      {
        id: 'home',
        blocks: [
          { id: 'home-b1', block: 'hero-a' },
          { id: 'home-b2', block: 'list-a' }
        ]
      }
    ],
    hidden: []
  }
  const { counts, places } = accountFor({ mapping: MAPPING, blockStore: STORE }, { writePlan, order })
  assert.deepEqual(counts, {
    universe: 8,
    written: 4,
    declared_not_written: 2,
    skipped_by_writer: 2,
    unexplained: 0
  })
  assert.equal(places.find((p) => p.block === 'unused-a').why, 'block not placed by the chain')
})

test('JA Boxing on a memory site: every place accounted, none unexplained', async () => {
  const dir = new URL(
    '../../packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
    import.meta.url
  )
  const json = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
  const kit = {
    ref: 'ja-boxing/j6@1.0.11',
    template: { slug: 'ja-boxing', version: '1.0.11' },
    blockStore: json('block-store.json'),
    pageRecipes: json('page-recipes.json'),
    mapping: json('mapping.json'),
    blankContract: json('blank-site-contract/content-map.json'),
    lock: json('blank-site-contract/presentation-lock.json')
  }
  const built = await markerBuild(kit, {
    iconLibrary: { set: PHOSPHOR_SET, icons: phosphorCatalog() },
    tryWrite: memoryTryWrite(kit)
  })
  assert.equal(built.written.report.status, 'done')
  const { counts } = accountFor(kit, built)
  assert.equal(counts.unexplained, 0)
  assert.equal(counts.universe, counts.written + counts.declared_not_written + counts.skipped_by_writer)
  assert.ok(counts.written > 0)
  // The write step gaps are reported, each with the refusal code of the write step.
  for (const gap of built.gaps)
    assert.match(gap.code, /^(record_kind_unsupported|redo_failed|read_back_mismatch)$/)
})
