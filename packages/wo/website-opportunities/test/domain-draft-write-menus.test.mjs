// The menu items of the draft write (ticket #597): the page items of the main menu come before the items of any other
// menu (a footer item links to its page's main menu item), and a menu block that draws the main menu (the phone menu,
// block-187) reuses the page items instead of making rival records. The fixture places block-187 and block-174 (the
// site-map footer menu) on the home and contact pages (`fixtures/draft-write/boxing-site.mjs`). Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-menus.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteKitOf, writePlanOf } from '../domain/draft-write-plan.mjs'
import { opsOf } from '../domain/draft-write-plan-ops.mjs'
import { planMenuItems, planPages } from '../domain/draft-write-plan-pages.mjs'
import { sinkOf } from '../domain/draft-write-sink.mjs'
import { siteOf } from '../domain/draft-write-site.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const plan = writePlanOf(site.order, site.aiq, { stored: site.stored })
const menuOps = (ops) => ops.filter((op) => op.kind === 'menuItem.create')

test('the fixture places the phone menu (main menu) and a footer menu with items', () => {
  const blocks = site.order.pages.flatMap((p) => p.blocks)
  for (const id of ['block-187', 'block-174'])
    assert.ok(
      blocks.some((b) => b.block === id && b.state === 'show' && b.items.length > 0),
      id
    )
})

test('every main menu item is created before any item of another menu', () => {
  const ops = menuOps(plan.ops)
  const lastMain = ops.findLastIndex((op) => op.fields.menutype === plan.mainMenu)
  const firstOther = ops.findIndex((op) => op.fields.menutype !== plan.mainMenu)
  assert.ok(firstOther > lastMain, 'site-map items come after the page items')
  assert.deepEqual(
    ops.filter((op) => op.fields.menutype === 'site-map').map((op) => op.link),
    ['classes', 'plans', 'contact'].map((page) => ({ ref: `page:${page}`, form: 'alias' }))
  )
})

test('the phone menu reuses the page items: one main menu item per page, the home one is home with its label', () => {
  const main = menuOps(plan.ops).filter((op) => op.fields.menutype === plan.mainMenu)
  assert.equal(main.length, site.order.pages.length)
  const home = main.find((op) => op.key === `menuItem:${plan.mainMenu}:home`)
  assert.deepEqual([home.fields.home, home.fields.title], [1, 'Home'])
  const phone = plan.skipped.filter((s) => s.reason === 'menu_item_is_page_item')
  assert.ok(phone.length > 0)
  for (const s of phone) assert.match(s.entry, /-m1\./)
})

test('the menu items are ordered right even when the footer items are planned before the pages', () => {
  const kit = draftWriteKitOf(site.aiq)
  const sink = sinkOf()
  const block = (id) => ({ block: id })
  const page = site.order.pages[0]
  const link = (id, target) => [
    {
      at: { page, block: block(id), item: { at: target } },
      entry: { place: `${id}.label`, type: 'text', value: 'Go' }
    },
    {
      at: { page, block: block(id), item: { at: target } },
      entry: { place: `${id}.link`, from: 'derived', target: { page: target } }
    }
  ]
  const state = {
    order: site.order,
    kit,
    sink,
    site: siteOf(site.order, kit, sink),
    library: [],
    pictures: new Map(),
    rows: new Map(),
    menuLinks: [...link('block-174', 'contact'), ...link('block-187', 'home')]
  }
  planMenuItems(state)
  planPages(state)
  const keys = menuOps(opsOf(state)).map((op) => op.key)
  assert.ok(keys.indexOf('menuItem:site-map:contact') > keys.indexOf(`menuItem:${kit.mainMenu}:contact`))
  const home = sink.records.get(`menuItem:${kit.mainMenu}:home`)
  assert.deepEqual([home.home, home.title], [true, 'Home'])
})
