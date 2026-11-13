// Buttons, item pages and block data of the write order on the real JA Boxing store (ticket #597 review): the invented
// florist built with the real composer, writer and pictures step and scripted fake models
// (`fixtures/write-order/boxing-florist.mjs`). Values are asserted, not just presence.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-buttons.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerLimitOf, buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import { ANSWERED_LABEL } from './fixtures/write-order/invented-florist.mjs'
import {
  boxingComposition,
  boxingFloristBuild,
  boxingProfile,
  boxingStore
} from './fixtures/write-order/boxing-florist.mjs'

const saved = await boxingFloristBuild()
const orderOf = (values = structuredClone(saved)) => buildWriteOrder(values)
const entries = (order) => placesOfOrder(order).flatMap(({ place }) => place.fields)
const entry = (order, place) => entries(order).find((e) => e.place === place)
const pick = (e, keys) => keys.map((k) => e?.[k])

test('a button label beside a main button link is the customer answer, character for character', () => {
  const order = orderOf()
  assert.deepEqual(checkWriteOrder(order), [])
  const label = entry(order, 'home.home-b2.button-label')
  assert.deepEqual(pick(label, ['kind', 'from', 'value', 'data', 'written', 'button']), [
    'editorial.button_label',
    'answer',
    ANSWERED_LABEL,
    'contact-cta-label',
    'Written editorial.button_label',
    'home.home-b2.button-link'
  ])
  assert.equal(entry(order, 'home.home-b2.button-link').button, 'home.home-b2.button-label')
  // The same rule on every page the block is placed on.
  for (const page of ['classes', 'class', 'class-2', 'contact'])
    assert.equal(entry(order, `${page}.${page}-b2.button-label`).value, ANSWERED_LABEL)
  label.from = 'writer'
  label.value = 'Shop now'
  assert.deepEqual(
    checkWriteOrder(order).map((p) => [p.code, p.at]),
    [['main_button_changed', 'home.home-b2.button-label']]
  )
})

test('a button whose link has no data is hidden whole: the label leaves with its link', () => {
  const order = orderOf()
  const dead = ['home.home-b4.button-label', 'home.home-b5.cta-label'].map((p) =>
    pick(entry(order, p), ['from', 'action', 'reason', 'button'])
  )
  assert.deepEqual(dead, [
    ['no-data', 'hide', 'button_link_hidden', 'home.home-b4.button-link'],
    ['no-data', 'hide', 'button_link_hidden', 'home.home-b5.cta-url']
  ])
  // A label without a link of its own stays written.
  assert.equal(entry(order, 'home.home-b4.try-button-label').from, 'writer')
  const label = entry(order, 'home.home-b4.button-label')
  Object.assign(label, { from: 'writer', value: 'See more' })
  delete label.action
  assert.deepEqual(
    checkWriteOrder(order).map((p) => [p.code, p.at]),
    [['link_dead', 'home.home-b4.button-label']]
  )
})

test('an item page address is the page that shows only that item, never a page that merely lists it', () => {
  const order = orderOf()
  const targets = (pageId, blockId) =>
    order.pages
      .find((p) => p.id === pageId)
      .blocks.find((b) => b.id === blockId)
      .items.map((i) => [i.id, i.fields.find((e) => e.field === 'link')?.target?.page])
  const [wild, posy] = saved.approval.profile.items.service.map((s) => s.id)
  assert.deepEqual(targets('classes', 'classes-b3'), [
    [wild, 'class'],
    [posy, 'class-2']
  ])
  assert.deepEqual(targets('home', 'home-b4'), [[wild, 'class']])
  assert.deepEqual(orderOf().derived, order.derived)
})

test('a derived link to its own page is hidden with derived_self', async () => {
  const profile = boxingProfile()
  const composition = boxingComposition(profile)
  const wild = profile.items.service[0].id
  composition.pages[2].blocks.push({ block: 'block-159', label: 'More', data: [wild], reason: 'More.' })
  const order = buildWriteOrder(await boxingFloristBuild({ profile, composition }))
  const link = entry(order, `class.class-b4.${wild}.link`)
  assert.deepEqual(pick(link, ['from', 'action', 'reason']), ['no-data', 'hide', 'derived_self'])
  assert.deepEqual(checkWriteOrder(order), [])
})

test('a block field reads the one item its block shows when its data is that item alone', () => {
  const order = orderOf()
  const [wild, posy] = saved.approval.profile.items.service
  assert.deepEqual(pick(entry(order, 'class.class-b3.name'), ['from', 'value', 'data']), [
    'data',
    wild.fields['offering.name'].value,
    wild.id
  ])
  assert.equal(entry(order, 'class-2.class-2-b3.name').value, posy.fields['offering.name'].value)
})

test('an answer longer than the smallest field it fills is refused before the build, naming the limit', async () => {
  const { plan } = saved.approval
  assert.equal(answerLimitOf({ blockStore: boxingStore, plan, kind: 'contact.cta_label' }), 35)
  // The composer itself takes no answer longer than the template's shortest main button field (32 characters).
  const values = await boxingFloristBuild({ label: 'Order a hand tied bouquet today' })
  assert.equal(buildWriteOrder(values).facts.find((f) => f.kind === 'contact.cta_label').value.length, 31)
  const long = structuredClone(values)
  long.approval.profile.facts['contact.cta_label'][0].value = 'Order a hand tied seasonal bouquet today'
  assert.throws(
    () => buildWriteOrder(long),
    (error) => {
      assert.deepEqual([error.code, error.noRerun, error.details.limit], ['answer_over_limit', true, 35])
      return true
    }
  )
})
