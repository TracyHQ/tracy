// The write order (ticket #597): the saved step values of an invented florist's build, each made by the real module
// with scripted fake models (`fixtures/write-order/invented-florist.mjs`), assembled into the write step's only input
// and checked. Values are asserted, not just presence.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WRITE_ORDER_SCHEMA, buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import {
  ANSWERED_LABEL,
  SOCIAL,
  WRITTEN_LABEL,
  floristBuild
} from './fixtures/write-order/invented-florist.mjs'

const saved = await floristBuild()
const fresh = () => structuredClone(saved)
const orderOf = (values = fresh()) => buildWriteOrder(values)
const page = (order, id) => order.pages.find((p) => p.id === id)
const blockOf = (order, pageId, blockId) => page(order, pageId).blocks.find((b) => b.block === blockId)
const entries = (order) => placesOfOrder(order).flatMap(({ place }) => place.fields)
const entry = (order, place) => entries(order).find((e) => e.place === place)

test('the florist order is complete and passes its check', () => {
  const order = orderOf()
  console.log(JSON.stringify(order, null, 1).slice(0, 2400))
  assert.equal(order.schema, WRITE_ORDER_SCHEMA)
  assert.deepEqual(checkWriteOrder(order), [])
  assert.deepEqual(order.run, { id: 'run-larkspur-1', kind: 'build' })
  assert.deepEqual(order.plan, { id: 'plan-larkspur', revision: 1, language: 'en' })
  assert.deepEqual(order.template, {
    slug: 'example-petal',
    version: '1.0.0',
    kitRef: 'example-petal/j6@1.0.0',
    aiQuickstart: { version: '1.0.0' }
  })
  assert.deepEqual(order.unplaced, [])
})

test('home first, exactly one; menu labels and SEO from the plan page names and the settled facts', () => {
  const order = orderOf()
  assert.deepEqual(
    order.pages.map((p) => [p.id, p.home, p.menu.label, p.menu.order]),
    [
      ['home', true, 'Home', 0],
      ['bouquet', false, 'Wild meadow bouquet', 1],
      ['contact', false, 'Visit us', 2]
    ]
  )
  assert.deepEqual(page(order, 'home').seo, {
    title: 'Example Larkspur Florist',
    description: 'Example Larkspur Florist, 7 Wrenfield Row, Ambermoor',
    shareImage: { frame: 'home.home-b3.photo', source: 'generated' }
  })
  assert.equal(page(order, 'bouquet').seo.title, 'Wild meadow bouquet | Example Larkspur Florist')
  // A page without a picture of its own shares the home page's picture.
  assert.deepEqual(page(order, 'bouquet').seo.shareImage, {
    frame: 'home.home-b3.photo',
    source: 'generated',
    from: 'home'
  })
})

test('link and phone values come from the plan data, never from the writer', () => {
  const order = orderOf()
  assert.deepEqual(
    ['home.home-b6.phone', 'home.home-b6.email', 'home.home-b1.cta_link'].map((p) => {
      const { from, value, data } = entry(order, p)
      return [from, value, data]
    }),
    [
      ['data', '+1 555 0100 214', 'contact-phone'],
      ['data', 'hello@larkspur-florist.example', 'contact-email'],
      ['data', 'https://larkspur-florist.example/order', 'contact-cta-url']
    ]
  )
  assert.deepEqual(
    ['from', 'value', 'data'].map((k) => entry(order, 'home.home-b4.service-wild-meadow-bouquet.price')[k]),
    ['data', '$42', 'service-wild-meadow-bouquet']
  )
  // A link the plan data does not hold follows the block's no data rule.
  assert.deepEqual(
    ['from', 'action'].map((k) => entry(order, 'contact.contact-b2.email')[k]),
    ['no-data', 'hide']
  )
  const broken = orderOf()
  Object.assign(entry(broken, 'home.home-b6.phone'), { from: 'writer', value: '+1 555 0199 999' })
  assert.deepEqual(
    checkWriteOrder(broken).map((p) => p.code),
    ['link_not_from_data']
  )
})

test('the answered main button label is kept verbatim although the writer wrote another', () => {
  const order = orderOf()
  const labels = entries(order).filter((e) => e.kind === 'contact.cta_label')
  assert.equal(labels.length, 3)
  for (const label of labels) {
    assert.equal(label.from, 'answer')
    assert.equal(label.value, ANSWERED_LABEL)
    assert.equal(label.written, WRITTEN_LABEL)
  }
  const broken = orderOf()
  entry(broken, 'home.home-b1.cta_label').value = 'Order a bouquet Today'
  assert.deepEqual(
    checkWriteOrder(broken).map((p) => p.code),
    ['main_button_changed']
  )
})

test('a sameAs variant takes its base picture file; pictures are own, generated or none only', () => {
  const values = fresh()
  values.pictures.frames.find((f) => f.id === 'home.home-b3.photo').file = 'pictures/hero-generated.webp'
  for (const f of values.pictures.frames.filter((x) => x.source === 'own'))
    f.file = `pictures/${f.picture}.webp`
  const order = orderOf(values)
  const dark = order.pictures.find((p) => p.frame === 'home.home-b3.photo-dark')
  assert.deepEqual(
    [dark.source, dark.sameAs, dark.file],
    ['generated', 'home.home-b3.photo', 'pictures/hero-generated.webp']
  )
  assert.deepEqual(dark.size, { width: 1600, height: 900 })
  assert.deepEqual(page(order, 'home').seo.shareImage, {
    frame: 'home.home-b3.photo',
    file: 'pictures/hero-generated.webp',
    source: 'generated'
  })
  assert.deepEqual([...new Set(order.pictures.map((p) => p.source))].sort(), ['generated', 'own'])
  assert.deepEqual(checkWriteOrder(order), [])
  order.pictures[2].source = 'stock'
  order.pictures[1].sameAs = 'home.nowhere.photo'
  assert.deepEqual(
    checkWriteOrder(order).map((p) => p.code),
    ['same_as_missing', 'picture_source']
  )
})

test('a class-name network icon carries its network and link, and its row link is that link', () => {
  const order = orderOf()
  const icon = order.icons.find((i) => i.id === 'home.home-b6.social.1.network-icon')
  assert.deepEqual(
    [icon.source, icon.storage, icon.network, icon.link],
    ['network', 'class-name', 'instagram', SOCIAL.instagram]
  )
  const link = entry(order, 'home.home-b6.social.1.link')
  assert.deepEqual(
    [link.from, link.value, link.data, link.row, link.list],
    ['data', SOCIAL.instagram, 'contact-social-url', 'social.1', 'social']
  )
})

test('a derived item page link and the rows keyed to a page point at pages the order creates', () => {
  const values = fresh()
  const home = values.writers.find((w) => w.page.id === 'home').page
  // The child list rows the real page writer wrote (#615); a key this assembler does not know passes through.
  const written = home.fields.find((e) => e.row === 'pages.1' && e.field === 'title')
  assert.deepEqual([written.from, written.list], ['writer', 'pages'])
  written.writtenBy = 'child-list-writer'
  // The page of each row is the planned row's page, not its rank: the first two planned rows are swapped here.
  const masthead = values.approval.plan.pages[0].blocks.find((b) => b.block === 'masthead')
  const rows = masthead.lists.find((l) => l.name === 'pages').rows
  assert.deepEqual(
    rows.map((r) => r.page),
    ['home', 'bouquet', 'contact']
  )
  ;[rows[0].page, rows[1].page] = [rows[1].page, rows[0].page]
  const order = orderOf(values)
  assert.deepEqual(checkWriteOrder(order), [])
  const more = entry(order, 'home.home-b4.service-wild-meadow-bouquet.more')
  assert.deepEqual(
    [more.from, more.derived, more.target],
    ['derived', 'the item page address', { page: 'bouquet' }]
  )
  const pages = blockOf(order, 'home', 'masthead').lists.find((g) => g.list === 'pages')
  assert.deepEqual(
    pages.rows.map((r) => [r.row, r.state, r.fields.map((e) => e.value ?? e.target?.page)]),
    [
      ['pages.1', 'show', ['Our bouquets', 'bouquet']],
      ['pages.2', 'show', ['Our bouquets', 'home']],
      ['pages.3', 'show', ['Our bouquets', 'contact']]
    ]
  )
  const title = pages.rows[0].fields[0]
  assert.deepEqual([title.writtenBy, title.list, title.row], ['child-list-writer', 'pages', 'pages.1'])
  assert.deepEqual(
    order.derived.map((d) => [d.place, d.target.page]),
    [
      ['home.home-b2.pages.1.page', 'bouquet'],
      ['home.home-b2.pages.2.page', 'home'],
      ['home.home-b2.pages.3.page', 'contact'],
      ['home.home-b4.service-wild-meadow-bouquet.more', 'bouquet']
    ]
  )
  order.derived[0].target.page = 'about'
  assert.deepEqual(
    checkWriteOrder(order).map((p) => p.code),
    ['derived_target_missing']
  )
})

test('a design field is never in the order', () => {
  const order = orderOf()
  assert.equal(entries(order).filter((e) => e.type === 'design').length, 0)
  const header = blockOf(order, 'home', 'header-main')
  assert.deepEqual(
    header.declared.find((f) => f.name === 'sticky'),
    { name: 'sticky', type: 'design' }
  )
  assert.equal(
    entries(order).some((e) => e.field === 'sticky' || e.field === 'background'),
    false
  )
  header.fields.push({
    place: 'home.home-b1.sticky',
    field: 'sticky',
    type: 'design',
    from: 'writer',
    value: 'on'
  })
  assert.deepEqual(
    checkWriteOrder(order).map((p) => p.code),
    ['design_field', 'design_field']
  )
})

test('a malformed input is a typed error with a code', () => {
  const values = fresh()
  values.writers = values.writers.filter((w) => w.page.id !== 'contact')
  assert.throws(() => buildWriteOrder(values), { code: 'writer_missing' })
  assert.throws(() => buildWriteOrder({ ...fresh(), approval: { plan: { pages: [] } } }), {
    code: 'plan_missing'
  })
})
