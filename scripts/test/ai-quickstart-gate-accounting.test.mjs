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
import { IGNORED_MAPPING_KEYS, uncoveredLocations, universeOf } from '../ai-quickstart/gate/universe.mjs'

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

test('an invented mapping: written, cut, design, kept language, skipped, and the gate own coverage gap unexplained', () => {
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
    skipped_by_writer: 1,
    unexplained: 1
  })
  // A block the gate's own plan did not place is a failure of the gate's coverage, not a skip of the build.
  const unused = places.find((p) => p.block === 'unused-a')
  assert.equal(unused.why, 'block not placed by the marker plan')
  assert.deepEqual(
    [unused.account, unused.by, unused.code],
    ['unexplained', 'marker_plan', 'block_not_placed']
  )
})

test('every kind of kit place is in the universe: SEO, slot-less overrides, emptied, build sets, detail positions, escapes', () => {
  const mapping = {
    ...MAPPING,
    seo: {
      titleLimit: 60,
      menuItem: {
        title: [{ entity: 'page', column: 'params', jsonPath: ['page_title'] }],
        ogTitle: {
          sameAs: 'title',
          locations: [{ entity: 'page', column: 'params', jsonPath: ['og_title'] }]
        }
      }
    },
    overrides: {
      language: [
        ...MAPPING.overrides.language,
        { key: 'KIT_FOOTER_LINE', extension: 'mod_footer', keep: 'the line prints the site name fact' },
        { key: 'KIT_FOOTER_NOTE', extension: 'mod_footer', value: '', why: 'hidden by an empty value' }
      ]
    },
    emptiedNotWritten: [{ entity: 'mailConfig-from_name', column: 'value', why: 'the owner sets it' }],
    buildSets: {
      'module-2:params:catid.0': {
        entity: 'module-2',
        column: 'params',
        jsonPath: ['catid', 0],
        sets: 'category'
      }
    },
    pages: {
      post: {
        under: {
          page: 'news',
          detailPositions: { positions: ['detail-1'], assignTo: 'list-page', why: 'measured' }
        }
      }
    },
    escapes: { why: 'measured', places: [{ match: { kind: 'article', column: 'title' }, escaped: 'mixed' }] },
    notEmptied: [{ entity: 'module-9', why: 'trashed in the demo' }],
    blocks: {
      ...MAPPING.blocks,
      'steps-a': {
        lists: {
          rounds: {
            fields: { name: [loc('module-5.0')] },
            lists: { steps: { fields: { step: [[loc('module-5.1'), loc('module-5.2')]] } } }
          }
        }
      }
    }
  }
  mapping.overrides.settings = [
    { location: { entity: 'siteSetting-1', column: 'value' }, value: '', why: 'the site name stays empty' }
  ]
  const u = universeOf(mapping)
  const by = (owner) => [...u.values()].filter((p) => p.owner === owner)
  assert.equal(by('seo').length, 2)
  assert.deepEqual(
    by('language').map((p) => p.field),
    ['KIT_WORD', 'KIT_FOOTER_LINE', 'KIT_FOOTER_NOTE']
  )
  assert.equal(by('emptied').length, 1)
  assert.equal(by('setting').length, 1)
  // A child list of a child list is walked too.
  assert.equal(by('block').filter((p) => p.block === 'steps-a').length, 3)
  assert.deepEqual(uncoveredLocations(mapping), [])
  assert.equal(by('build_set').length, 1)
  assert.ok(u.has('build:pages.post.under.detailPositions'))
  assert.ok(u.has('build:escapes.places.0'))
  const writePlan = {
    ops: [
      {
        key: 'menuItem:home',
        values: [
          { loc: { entity: 'page', column: 'params', jsonPath: ['page_title'] }, entry: 'seo:home.title' },
          { loc: { entity: 'module-2', column: 'params', jsonPath: ['catid', 0] }, entry: null }
        ]
      }
    ]
  }
  const { places } = accountFor({ mapping, blockStore: STORE }, { writePlan, order: { pages: [] } })
  const at = (key) => places.find((p) => p.key === key)
  assert.equal(at('entity:page.params|page_title|').account, 'written')
  assert.equal(at('entity:page.params|og_title|').account, 'unexplained')
  assert.equal(at('entity:module-2.params|catid/0|').account, 'written')
  assert.deepEqual(
    places.filter((p) => p.owner === 'language').map((p) => p.code),
    ['language_kept', 'language_kept', 'language_set']
  )
  assert.equal(at('entity:mailConfig-from_name.value||').code, 'emptied_not_written')
  assert.equal(at('build:escapes.places.0').code, 'key_not_read')
  assert.equal(at('entity:siteSetting-1.value||').code, 'setting_set')
})

test('the completeness guard: a location the universe does not hold and no ignore names is unexplained', () => {
  const mapping = {
    ...MAPPING,
    newKey: { somewhere: { entity: 'module-7', column: 'params', jsonPath: ['x'] } }
  }
  const { places, counts } = accountFor(
    { mapping, blockStore: STORE },
    { writePlan: { ops: [] }, order: { pages: [] } }
  )
  const lost = places.filter((p) => p.code === 'location_not_in_universe')
  assert.equal(lost.length, 1)
  assert.equal(lost[0].account, 'unexplained')
  assert.match(lost[0].why, /newKey\.somewhere/)
  assert.ok(counts.unexplained >= 1)
  // The mapping keys the guard ignores each carry a reason.
  for (const [key, why] of Object.entries(IGNORED_MAPPING_KEYS)) assert.ok(why.length > 20, key)
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
    assert.match(gap.code, /^(record_kind_unsupported|redo_failed|read_back_mismatch|record_name_empty)$/)
  // Every skip names who left it and the code given; the marker plan itself leaves nothing.
  const { places } = accountFor(kit, built)
  for (const p of places.filter((x) => x.account === 'skipped_by_writer')) assert.ok(p.by && p.code, p.key)
  assert.equal(places.filter((p) => p.by === 'marker_plan').length, 0)
  // A page type the kit declares unbuilt is declared, not skipped.
  assert.ok(places.some((p) => p.account === 'declared_not_written' && p.code === 'record_kind_unsupported'))
})
