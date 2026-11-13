// The memory site (ticket #597): the fake write step applies the invented florist's write order to a blank site in
// memory, reports in the shape the step chain's write step accepts, refuses an invalid order and fails on the calls
// its script names, so the re-run rule can be tested.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-memory-site.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { memorySite } from '../domain/write-order-memory-site.mjs'
import { ANSWERED_LABEL, SOCIAL, floristBuild } from './fixtures/write-order/invented-florist.mjs'

const order = buildWriteOrder(await floristBuild())

test('the memory site applies the order: pages, menu, block copy and fields', async () => {
  const site = memorySite()
  const { report, site: built } = await site.apply(order)
  console.log(`memory site: ${JSON.stringify(report)}`)
  assert.equal(report.status, 'done')
  assert.ok(Number.isInteger(report.counts.written) && report.counts.written > 0)
  assert.ok(Number.isInteger(report.counts.skipped))
  assert.deepEqual(
    built.menu.map((m) => [m.page, m.label]),
    [
      ['home', 'Home'],
      ['bouquet', 'Wild meadow bouquet'],
      ['contact', 'Visit us']
    ]
  )
  const home = built.pages[0]
  assert.equal(home.home, true)
  const header = home.blocks.find((b) => b.block === 'header-main')
  assert.deepEqual(header.fields, {
    cta_label: ANSWERED_LABEL,
    cta_link: 'https://larkspur-florist.example/order'
  })
  const bouquets = home.blocks.find((b) => b.block === 'bouquets')
  assert.deepEqual(
    bouquets.items.map((i) => [i.index, i.fields.name, i.fields.price, i.fields.more?.page ?? null]),
    [
      [0, 'Wild meadow bouquet', '$42', 'bouquet'],
      [1, 'Seasonal posy', '$28', null]
    ]
  )
  const contact = home.blocks.find((b) => b.block === 'contact-strip')
  assert.deepEqual(
    contact.lists[0].rows.map((r) => r.fields.link),
    [SOCIAL.instagram, SOCIAL.facebook]
  )
  assert.equal(built.icons['home.home-b6.social.1.network-icon'].network, 'instagram')
  assert.match(home.blocks.find((b) => b.block === 'tracy-reviews').html, /tracy-reviews/)
  assert.equal(site.calls, 1)
})

test('a scripted failure fails exactly the calls it names, then the same order applies', async () => {
  const site = memorySite({ failOn: 1 })
  await assert.rejects(site.apply(order), { code: 'memory_site_failed' })
  const again = await site.apply(order)
  assert.equal(again.report.status, 'done')
  const twice = memorySite({ failOn: [1, 2] })
  await assert.rejects(twice.apply(order), { code: 'memory_site_failed' })
  await assert.rejects(twice.apply(order), { code: 'memory_site_failed' })
  assert.equal(twice.calls, 2)
})

test('an order that fails its check is refused with its problems', async () => {
  const broken = structuredClone(order)
  broken.pages[1].home = true
  await assert.rejects(memorySite().apply(broken), (error) => {
    assert.equal(error.code, 'order_invalid')
    assert.deepEqual(
      error.details.problems.map((p) => p.code),
      ['home_count']
    )
    return true
  })
})
