// What `checkWriteOrder` refuses (ticket #597 review): data fields that are not the plan's data, places whose state
// and `hidden` disagree, picture and icon links that point the wrong way, and search details a page cannot carry. Each
// probe changes one value of the invented florist's order (`fixtures/write-order/invented-florist.mjs`).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import { floristBuild } from './fixtures/write-order/invented-florist.mjs'

const saved = await floristBuild()
const orderOf = (values = structuredClone(saved)) => buildWriteOrder(values)
const entries = (order) => placesOfOrder(order).flatMap(({ place }) => place.fields)
const entry = (order, place) => entries(order).find((e) => e.place === place)
const codes = (order) => checkWriteOrder(order).map((p) => [p.code, p.at])
const blockOf = (order, pageId, blockId) =>
  order.pages.find((p) => p.id === pageId).blocks.find((b) => b.block === blockId)

test('a data role text is the plan data, whatever the writer returned', () => {
  const values = structuredClone(saved)
  const written = values.writers
    .find((w) => w.page.id === 'home')
    .page.fields.find((e) => e.block === 'home-b6' && e.field === 'address')
  Object.assign(written, { from: 'writer', value: '12 Invented Lane' })
  delete written.data
  const order = orderOf(values)
  const address = entry(order, 'home.home-b6.address')
  assert.deepEqual(
    [address.from, address.value, address.data],
    ['data', '7 Wrenfield Row, Ambermoor', 'contact-address']
  )
  assert.deepEqual(codes(order), [])
})

test('a data role text written by the writer, naming an unknown id or changing the value is refused', () => {
  const order = orderOf()
  Object.assign(entry(order, 'home.home-b6.address'), { from: 'writer', value: '12 Invented Lane' })
  Object.assign(entry(order, 'contact.contact-b2.address'), { data: 'contact-address-9' })
  const name = 'home.home-b4.service-wild-meadow-bouquet.name'
  entry(order, name).value = 'Wild meadow bunch'
  assert.deepEqual(codes(order).sort(), [
    ['data_role_written', 'home.home-b6.address'],
    ['data_unknown', 'contact.contact-b2.address'],
    ['data_value_changed', name]
  ])
})

test('the same fact reads the same everywhere in the order', () => {
  const order = orderOf()
  order.facts.find((f) => f.data === 'contact-address').value = '9 Other Row'
  entry(order, 'home.home-b6.address').value = '9 Other Row'
  assert.deepEqual(codes(order), [
    ['data_value_changed', 'contact.contact-b2.address'],
    ['data_value_differs', 'contact-address']
  ])
})

test('a state is show, hidden or fallback, and every place not shown is in hidden, and only those', () => {
  const order = orderOf()
  blockOf(order, 'home', 'masthead').state = 'weird'
  blockOf(order, 'contact', 'contact-strip').state = 'hidden'
  order.hidden.push({ at: 'home.home-b3', reason: 'no_data' })
  assert.deepEqual(codes(order), [
    ['state_unknown', 'home.home-b2'],
    ['hidden_unlisted', 'contact.contact-b2'],
    ['hidden_shown', 'home.home-b3']
  ])
})

test('a sameAs is never itself or a chain; a share image is never a hidden picture; an icon hides its own link', () => {
  const order = orderOf()
  const [first, second] = order.pictures.filter((p) => p.page === 'home' && p.source === 'own')
  first.sameAs = first.frame
  const dark = order.pictures.find((p) => p.frame === 'home.home-b3.photo-dark')
  order.pictures.find((p) => p.frame === dark.sameAs).sameAs = second.frame
  order.pictures.find((p) => p.frame === order.pages[0].seo.shareImage.frame).source = 'none'
  const icon = order.icons.find((i) => i.id === 'home.home-b6.social.2.network-icon')
  Object.assign(icon, { source: 'none', hidesLink: 'home.home-b6.social.1.link' })
  Object.assign(entry(order, 'home.home-b6.social.1.link'), { from: 'no-data', action: 'hide' })
  assert.deepEqual(
    codes(order)
      .map(([code]) => code)
      .sort(),
    [
      'hides_link_foreign',
      // The share picture set to none in a shown place is an empty frame left shown as well.
      'picture_empty_shown',
      'same_as_chain',
      'same_as_self',
      'share_image_none',
      'share_image_none',
      'share_image_none'
    ]
  )
})

test('every page carries a title and a description within their limits, never a page id or a repeated name', () => {
  const order = orderOf()
  assert.deepEqual(
    order.pages.map((p) => [p.seo.title, p.seo.description.length > 0, p.seo.shareImage?.frame]),
    [
      ['Example Larkspur Florist', true, 'home.home-b3.photo'],
      ['Wild meadow bouquet | Example Larkspur Florist', true, 'home.home-b3.photo'],
      ['Visit us | Example Larkspur Florist', true, 'home.home-b3.photo']
    ]
  )
  assert.equal(order.pages[1].seo.shareImage.from, 'home')
  const [home, bouquet, contact] = order.pages
  home.seo.description = ''
  bouquet.seo.title = 'Example Larkspur Florist | Example Larkspur Florist'
  bouquet.seo.description = 'x'.repeat(161)
  contact.seo.title = 'contact'
  order.pages[1].seo.shareImage = null
  assert.deepEqual(codes(order), [
    ['seo_description_empty', 'home'],
    ['seo_title_repeated', 'bouquet'],
    ['seo_description_over_limit', 'bouquet'],
    ['share_image_missing', 'bouquet'],
    ['seo_page_id', 'contact']
  ])
  contact.seo.title = 'A'.repeat(61)
  assert.deepEqual(codes(order).at(-1), ['seo_title_over_limit', 'contact'])
})

test('two pages never share a title', () => {
  const order = orderOf()
  order.pages[2].seo.title = order.pages[1].seo.title.toUpperCase()
  assert.deepEqual(codes(order), [['seo_title_not_unique', 'contact']])
})
