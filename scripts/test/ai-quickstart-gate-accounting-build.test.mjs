// The build places are accounted by what the write step does with each (ticket #585 on #597, asked by the build team):
// every key the write step reads (`DRAFT_WRITE_KIT_KEYS`) is found in the write plan it made, written or skipped with
// a reason of the write step, never `key_not_read`. A place the plan shows nothing for keeps `key_not_read`, so a key
// the write step stops reading is seen. Real JA Boxing kit through the marker build on a memory site, and small
// invented write plans for each reason.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { accountFor } from '../ai-quickstart/gate/accounting.mjs'
import { accountBuildPlace, KEY_NOT_READ } from '../ai-quickstart/gate/accounting-build.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'

const NAMED = [
  'pages.menuItem',
  'pages.under',
  'pages.record',
  'pages.record.category',
  'pages.under.detailPositions',
  'escapes.places',
  'pages.ownItem',
  'hides',
  'createdFrames'
]

let boxing
async function boxingPlaces() {
  if (boxing) return boxing
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
  boxing = { built, places: accountFor(kit, built).places.filter((p) => p.owner === 'build') }
  return boxing
}

const kindOf = (p) => p.field

test('JA Boxing: no place of a key the write step reads is left key_not_read', async () => {
  const { places } = await boxingPlaces()
  const left = places.filter((p) => NAMED.includes(kindOf(p)) && p.code === KEY_NOT_READ)
  assert.deepEqual(
    left.map((p) => p.key + ': ' + p.why),
    []
  )
  for (const kind of NAMED)
    assert.ok(
      places.some((p) => kindOf(p) === kind),
      kind + ' has places in JA Boxing'
    )
})

test('JA Boxing: each build place is written or skipped with a reason, as its plan shows', async () => {
  const { places } = await boxingPlaces()
  const at = (key) => places.find((p) => p.key === key)
  assert.equal(at('build:pages.home.menuItem').account, 'written')
  assert.equal(at('build:pages.news-post.under').account, 'written')
  assert.equal(at('build:pages.news-post.under.detailPositions').account, 'written')
  assert.equal(at('build:pages.news-post.record').account, 'written')
  assert.equal(at('build:pages.news-post.record.category').account, 'written')
  assert.equal(at('build:pages.contact.record.category').account, 'written')
  // An item page reached under its list page takes no menu item of its own: the write step's rule, not a gap.
  assert.equal(at('build:pages.news-post.ownItem').account, 'skipped_by_writer')
  assert.equal(at('build:pages.news-post.ownItem').code, 'page_reached_under_list')
  // A frame the created records write a piece into is written; one no piece sits in is skipped with its reason.
  assert.equal(at('build:createdFrames.0.article-16').account, 'written')
  assert.equal(at('build:createdFrames.1.contact-1').account, 'written')
  const frames = places.filter((p) => kindOf(p) === 'createdFrames' && p.account !== 'written')
  for (const f of frames) assert.match(f.code, /^(no_record_created|no_piece_in_frame)$/, f.key)
  // The hides: the first item's control taken out, packed rows, and a control that is written.
  assert.equal(at('build:hides.block-167.0').account, 'written')
  assert.equal(at('build:hides.block-167.2').account, 'written')
  for (const p of places.filter((x) => kindOf(x) === 'hides'))
    assert.ok(p.account === 'written' || p.code.startsWith('control_'), p.key + ' ' + p.code)
  // Every escape entry is used by a value the build writes, or says why none is.
  const escapes = places.filter((p) => kindOf(p) === 'escapes.places')
  assert.ok(escapes.some((p) => p.account === 'written'))
  for (const e of escapes.filter((p) => p.account !== 'written'))
    assert.match(e.code, /^(escape_entry_not_used|escape_place_not_written)$/, e.key)
})

// Small invented plans: a florist kit's page types, one page each.
const ctx = (writePlan, order = { pages: [] }, mapping = {}) => ({
  writePlan,
  order,
  gaps: [],
  unbuilt: new Map(),
  mapping
})
const page = (id, pageType) => ({ id, pageType, blocks: [] })

test('a menu item the plan does not make keeps key_not_read; the one it makes is written', () => {
  const place = { kind: 'pages.menuItem', pageType: 'shop', declared: { link: 'x' } }
  const order = { pages: [page('shop', 'shop')] }
  assert.equal(accountBuildPlace(place, ctx({ ops: [] }, order)).code, KEY_NOT_READ)
  const made = { kind: 'menuItem.create', pageType: 'shop', link: { own: false } }
  assert.equal(accountBuildPlace(place, ctx({ ops: [made] }, order)).account, 'written')
})

test('an own menu item is skipped when the page is reached under its list page, written when it is made', () => {
  const place = { kind: 'pages.ownItem', pageType: 'bouquet', declared: { link: 'x' } }
  const order = { pages: [page('bouquets', 'bouquets'), page('bouquet-1', 'bouquet')] }
  const under = { ops: [], under: { 'bouquet-1': { list: 'bouquets' } } }
  assert.equal(accountBuildPlace(place, ctx(under, order)).code, 'page_reached_under_list')
  const own = { ops: [{ kind: 'menuItem.create', pageType: 'bouquet', link: { own: true } }], under: {} }
  assert.equal(accountBuildPlace(place, ctx(own, order)).account, 'written')
  const under2 = { kind: 'pages.under', pageType: 'bouquet', declared: { page: 'bouquets' } }
  assert.equal(accountBuildPlace(under2, ctx(own, order)).code, 'list_page_not_in_plan')
})

test('an escape entry no written value takes is skipped with its reason', () => {
  const entry = { match: { kind: 'article', column: 'title' }, escaped: true, unsafe: [] }
  const mapping = { escapes: { places: [entry] } }
  const place = { kind: 'escapes.places', path: ['escapes', 'places', 0], match: entry.match }
  const none = accountBuildPlace(place, ctx({ ops: [] }, { pages: [] }, mapping))
  assert.equal(none.code, 'escape_entry_not_used')
  const op = {
    kind: 'article.create',
    recordKind: 'article',
    fields: {},
    values: [{ loc: { column: 'title' } }]
  }
  assert.equal(accountBuildPlace(place, ctx({ ops: [op] }, { pages: [] }, mapping)).account, 'written')
})
