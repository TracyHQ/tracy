// What the write order hides (ticket #597): a section with no real data is hidden, never padded. The saved step values
// of the invented florist (`fixtures/write-order/invented-florist.mjs`) are changed the way a later step would change
// them: a picture reduction, reviews the block cannot show, a missing photo, a network the icon library has no mark for.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-hide.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import { SOCIAL, floristBuild } from './fixtures/write-order/invented-florist.mjs'

const saved = await floristBuild()
const fresh = () => structuredClone(saved)
const blockOf = (order, pageId, blockId) =>
  order.pages.find((p) => p.id === pageId).blocks.find((b) => b.block === blockId)
const values = (order) => placesOfOrder(order).flatMap(({ place }) => place.fields.map((e) => e.value))

test('a picture reduction below the minimum hides the whole block with list_below_min, never padded', () => {
  const input = fresh()
  input.pictures.reduced = [
    { page: 'home', block: 'home-b4', item: 'service-seasonal-posy', reason: 'no_own_photo' }
  ]
  const order = buildWriteOrder(input)
  const bouquets = blockOf(order, 'home', 'bouquets')
  assert.deepEqual([bouquets.state, bouquets.reason], ['hidden', 'list_below_min'])
  assert.deepEqual(bouquets.counts, { min: 2, max: 4, available: 1, shown: 0 })
  assert.deepEqual(bouquets.fields, [])
  assert.deepEqual(
    bouquets.items.map((i) => [i.id, i.state, i.fields.length]),
    [
      ['service-wild-meadow-bouquet', 'hidden', 0],
      ['service-seasonal-posy', 'hidden', 0]
    ]
  )
  // The dropped item takes its writer fields, pictures and icons with it.
  assert.equal(
    order.pictures.some((p) => p.block === 'home-b4'),
    false
  )
  assert.equal(
    order.icons.some((i) => i.block === 'home-b4'),
    false
  )
  assert.ok(
    order.hidden.some((h) => h.at === 'home.home-b4.service-seasonal-posy' && h.reason === 'item_dropped')
  )
  assert.ok(order.hidden.some((h) => h.at === 'home.home-b4' && h.reason === 'list_below_min'))
  assert.deepEqual(checkWriteOrder(order), [])
})

test('a gallery with fewer own photos than its minimum is hidden', () => {
  const input = fresh()
  const gallery = input.approval.plan.pages[0].blocks.find((b) => b.block === 'gallery-strip')
  gallery.data = gallery.data.slice(0, 2)
  input.pictures.frames = input.pictures.frames.filter(
    (f) => !f.id.endsWith('window-jpg.photo') && !f.id.endsWith('workbench-jpg.photo')
  )
  const order = buildWriteOrder(input)
  const strip = blockOf(order, 'home', 'gallery-strip')
  assert.deepEqual([strip.state, strip.reason, strip.counts.shown], ['hidden', 'list_below_min', 0])
  assert.deepEqual(checkWriteOrder(order), [])
})

test('the reviews block renders the Google reviews, and with too few 4 or 5 star reviews it is hidden, not an error', () => {
  const shown = buildWriteOrder(fresh())
  const reviews = blockOf(shown, 'home', 'tracy-reviews')
  assert.equal(reviews.state, 'show')
  assert.deepEqual(reviews.position, {
    request: 'content',
    declared: ['content'],
    afterBlock: 'home-b6',
    beforeBlock: 'home-b7'
  })
  assert.deepEqual(
    reviews.library.shown.map((r) => [r.author, r.rating]),
    [
      ['Pellam O.', 5],
      ['Wenna C.', 4]
    ]
  )
  assert.match(reviews.library.html, /The meadow bouquet lasted two weeks on our table\./)
  assert.match(reviews.library.html, /query_place_id=invented-place-larkspur/)
  const listing = reviews.fields.find((e) => e.field === 'listingUrl')
  assert.deepEqual([listing.from, listing.data], ['data', 'source:gmaps'])

  const input = fresh()
  for (const quote of input.approval.profile.items.quote) quote.fields['quote.rating_or_source'].value = '3'
  const order = buildWriteOrder(input)
  const hidden = blockOf(order, 'home', 'tracy-reviews')
  assert.deepEqual([hidden.state, hidden.reason, hidden.library], ['hidden', 'no_reviews', undefined])
  assert.ok(order.hidden.some((h) => h.at === 'home.home-extra-8' && h.reason === 'no_reviews'))
  assert.deepEqual(checkWriteOrder(order), [])
})

test('one review set aside is a hidden item with the block reason', () => {
  const input = fresh()
  input.approval.profile.items.quote[1].fields['quote.rating_or_source'].value = '2'
  const reviews = blockOf(buildWriteOrder(input), 'home', 'tracy-reviews')
  assert.deepEqual(
    reviews.items.map((i) => [i.state, i.reason ?? null]),
    [
      ['show', null],
      ['hidden', 'only reviews of four or five stars are shown']
    ]
  )
})

test('a network icon hidden for want of a mark hides its link: the link is written nowhere', () => {
  const order = buildWriteOrder(fresh())
  const footer = blockOf(order, 'home', 'footer-main')
  const tiktok = footer.items.find((i) => i.id === 'contact-social-url-3')
  assert.deepEqual([tiktok.state, tiktok.reason], ['hidden', 'item_empty'])
  assert.equal(values(order).includes(SOCIAL.tiktok), false)
  assert.equal(
    order.icons.some((i) => i.link === SOCIAL.tiktok),
    false
  )

  // Where the place keeps other content (here a label the writer wrote), the link entry is hidden and the icon names it.
  const input = fresh()
  const footerStore = input.aiq.blockStore.blocks.find((b) => b.id === 'footer-main')
  footerStore.itemFields.push({ name: 'social-label', kind: 'contact.social_label', type: 'text', limit: 40 })
  input.writers[0].page.fields.push({
    key: 'home-b7/contact-social-url-3/social-label',
    block: 'home-b7',
    item: 'contact-social-url-3',
    field: 'social-label',
    kind: 'contact.social_label',
    from: 'writer',
    value: 'Watch us on video'
  })
  const kept = buildWriteOrder(input)
  const item = blockOf(kept, 'home', 'footer-main').items.find((i) => i.id === 'contact-social-url-3')
  const link = item.fields.find((e) => e.field === 'social-url')
  assert.deepEqual(
    [item.state, link.from, link.action, link.reason],
    ['show', 'no-data', 'hide', 'network_icon_hidden']
  )
  const hiddenIcon = kept.icons.find((i) => i.id === 'home.home-b7.contact-social-url-3.social-icon')
  assert.deepEqual(
    [hiddenIcon.source, hiddenIcon.network, hiddenIcon.reason, hiddenIcon.hidesLink],
    ['none', 'tiktok', 'social_icon_not_in_library', 'home.home-b7.contact-social-url-3.social-url']
  )
  // The labels the writer did not write follow the no data rule: accounted for, not missing.
  assert.deepEqual(checkWriteOrder(kept), [])
  Object.assign(link, { from: 'data', value: SOCIAL.tiktok, data: 'contact-social-url-3' })
  delete link.action
  assert.ok(checkWriteOrder(kept).some((p) => p.code === 'network_link_shown'))
})
