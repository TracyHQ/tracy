// Write order details from the #597 review: limits from the stored places, the order's own keys over a writer's,
// codes that a re-run cannot fix, one home page, the logo text, picture alt texts, list counts by path, the fallback
// state, and the Contract A additions (network icon classes, library positions, a row label naming its network).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-review.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WriteOrderError, buildWriteOrder } from '../domain/write-order.mjs'
import { placesOfOrder, checkWriteOrder } from '../domain/write-order-check.mjs'
import { MemorySiteError, memorySite } from '../domain/write-order-memory-site.mjs'
import { SOCIAL, floristBuild } from './fixtures/write-order/invented-florist.mjs'

const saved = await floristBuild()
const fresh = () => structuredClone(saved)
const entries = (order) => placesOfOrder(order).flatMap(({ place }) => place.fields)
const entry = (order, place) => entries(order).find((e) => e.place === place)
const storeBlock = (values, id) => values.aiq.blockStore.blocks.find((b) => b.id === id)
const blockOf = (order, pageId, blockId) =>
  order.pages.find((p) => p.id === pageId).blocks.find((b) => b.block === blockId)

test('a text limit is the smallest of its stored places, and a writer entry never overrides the order keys', () => {
  const values = fresh()
  storeBlock(values, 'bouquet-detail').itemFields[0].slots = ['article-1.1']
  storeBlock(values, 'bouquet-detail').itemFields[0].limit = 50
  storeBlock(values, 'bouquets').itemFields[0].limit = 26
  const heading = values.writers[0].page.fields.find((e) => e.block === 'home-b4' && e.field === 'heading')
  Object.assign(heading, { limit: 1000, kind: 'business.name', type: 'design', from: 'data', place: 'x.y' })
  const order = buildWriteOrder(values)
  const name = entry(order, 'bouquet.bouquet-b2.service-wild-meadow-bouquet.name')
  assert.deepEqual([name.limit, name.slots], [26, ['article-1.1']])
  const written = entry(order, 'home.home-b4.heading')
  assert.deepEqual(
    [written.limit, written.kind, written.type, written.from, written.place, written.slots],
    [30, 'editorial.heading', 'text', 'writer', 'home.home-b4.heading', ['module-4.1']]
  )
  assert.deepEqual(checkWriteOrder(order), [])
})

test('codes a re-run cannot fix carry noRerun; a failed write call does not', async () => {
  const cases = [
    ['plan_missing', (v) => (v.approval.plan.pages = [])],
    ['profile_missing', (v) => delete v.approval.profile],
    ['pictures_missing', (v) => delete v.pictures.frames],
    ['writer_missing', (v) => (v.writers = v.writers.slice(1))],
    ['unknown_block', (v) => (v.approval.plan.pages[0].blocks[0].block = 'no-such-block')],
    ['home_repeated', (v) => (v.approval.plan.pages[2].pageType = 'home')]
  ]
  for (const [code, change] of cases) {
    const values = fresh()
    change(values)
    assert.throws(
      () => buildWriteOrder(values),
      (e) => e instanceof WriteOrderError && e.code === code && e.noRerun === true
    )
  }
  const site = memorySite({ failOn: 1 })
  const order = buildWriteOrder(fresh())
  await assert.rejects(site.apply(order), (e) => e.code === 'memory_site_failed' && e.noRerun === false)
  order.pages[0].home = false
  await assert.rejects(site.apply(order), (e) => e instanceof MemorySiteError && e.noRerun === true)
})

test('a text logo takes the business name; a generated picture has an alt text', () => {
  const values = fresh()
  values.look.logo = { kind: 'text' }
  const order = buildWriteOrder(values)
  assert.deepEqual(order.look.logo, { kind: 'text', text: 'Example Larkspur Florist' })
  const alts = order.pictures.filter((p) => p.source === 'generated').map((p) => [p.frame, p.alt])
  assert.deepEqual(alts, [
    ['home.home-b3.photo', 'Example Larkspur Florist'],
    ['home.home-b3.photo-dark', 'Example Larkspur Florist'],
    ['home.home-b4.service-wild-meadow-bouquet.photo', 'Wild meadow bouquet'],
    ['home.home-b4.service-seasonal-posy.photo', 'Seasonal posy'],
    ['home.home-b4.service-wedding-table-set.photo', 'Wedding table set']
  ])
})

test('list counts are keyed by the full path, so a nested list of the same name never lends its minimum', () => {
  const values = fresh()
  const social = storeBlock(values, 'contact-strip').lists[0]
  social.lists = [{ name: 'social', items: { min: 2, max: 2 }, fields: [] }]
  const group = blockOf(buildWriteOrder(values), 'home', 'contact-strip').lists[0]
  assert.deepEqual([group.list, group.state, group.counts], ['social', 'show', { min: 0, max: 3, shown: 2 }])
})

test('a repeating block below its minimum with a fallback rule takes state fallback, written by the memory site', async () => {
  const values = fresh()
  storeBlock(values, 'bouquets').noData = { rule: 'fallback', fallback: 'the template bouquets' }
  values.pictures.reduced = ['service-seasonal-posy', 'service-wedding-table-set'].map((item) => ({
    page: 'home',
    block: 'home-b4',
    item,
    reason: 'x'
  }))
  const order = buildWriteOrder(values)
  const block = blockOf(order, 'home', 'bouquets')
  assert.deepEqual(
    [block.state, block.reason, block.fallback, block.counts.shown, block.items.map((i) => i.state)],
    ['fallback', 'list_below_min', 'the template bouquets', 0, ['hidden', 'hidden', 'hidden']]
  )
  assert.ok(order.hidden.some((h) => h.at === 'home.home-b4' && h.fallback === 'the template bouquets'))
  assert.deepEqual(checkWriteOrder(order), [])
  const { site } = await memorySite().apply(order)
  const written = site.pages[0].blocks.find((b) => b.id === 'home-b4')
  assert.deepEqual(
    [written.state, written.fallback, written.items],
    ['fallback', 'the template bouquets', []]
  )
})

test('a network icon class table gives each class-name icon its class, and hides a network it lacks', () => {
  const values = fresh()
  values.aiq.mapping = {
    networkIconClasses: { classes: { instagram: 'icon-ig' }, why: 'The font has one mark.' }
  }
  const order = buildWriteOrder(values)
  const [instagram] = order.icons.filter((i) => i.id.startsWith('home.home-b6.social.'))
  assert.deepEqual([instagram.network, instagram.className], ['instagram', 'icon-ig'])
  const row = blockOf(order, 'home', 'contact-strip').lists[0].rows[1]
  assert.deepEqual([row.state, row.reason], ['hidden', 'social_icon_not_in_template'])
  assert.ok(order.hidden.some((h) => h.at === 'home.home-b6.social.2' && h.reason === row.reason))
  assert.deepEqual(checkWriteOrder(order), [])
  // Without the table the class-name icons stay as they are.
  const plain = buildWriteOrder(fresh()).icons.find((i) => i.id === 'home.home-b6.social.2.network-icon')
  assert.deepEqual([plain.source, plain.className], ['network', undefined])
})

test('a library block takes the position the mapping gives its page type, next to its request', () => {
  const values = fresh()
  values.aiq.mapping = { library: { position: 'content', pageTypes: { home: 'content-bottom' } } }
  const reviews = blockOf(buildWriteOrder(values), 'home', 'tracy-reviews')
  assert.deepEqual([reviews.position.request, reviews.position.resolved], ['content', 'content-bottom'])
})

test('a row label declared as its network name is derived data from the row link, never copy', () => {
  const values = fresh()
  const social = storeBlock(values, 'contact-strip').lists[0]
  social.fields.push({
    name: 'label',
    kind: 'contact.social_label',
    type: 'text',
    limit: 20,
    textOf: 'network'
  })
  const order = buildWriteOrder(values)
  const labels = ['social.1', 'social.2'].map((r) => entry(order, `home.home-b6.${r}.label`))
  assert.deepEqual(
    labels.map((e) => [e.from, e.value, e.textOf, e.data]),
    [
      ['data', 'Instagram', 'network', 'contact-social-url'],
      ['data', 'Facebook', 'network', 'contact-social-url-2']
    ]
  )
  assert.equal(entry(order, 'home.home-b6.social.1.link').value, SOCIAL.instagram)
  assert.deepEqual(checkWriteOrder(order), [])
  labels[0].value = 'Insta'
  assert.deepEqual(
    checkWriteOrder(order).map((p) => p.code),
    ['network_label_changed']
  )
})
