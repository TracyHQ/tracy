// A page the write plan reaches under its list page (`plan.under`, #597) has no main menu item of its own: the pages
// check expects none for it, and still finds it, or reports it missing, at its record's alias below the list page.
// Every other plan page still needs its main menu item. An invented bakery; nothing here is a real business.
//
//   node --test --test-concurrency=1 scripts/test/built-site-check-under-pages.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPages } from '../built-site-check/check-pages.mjs'
import { expectedPagesOf } from '../built-site-check/inputs.mjs'

const base = new URL('http://bakery.invalid/')
const plan = {
  pages: [
    { id: 'home', pageType: 'home', name: 'Home' },
    { id: 'cakes', pageType: 'classes', name: 'Our cakes' },
    { id: 'tart', pageType: 'class', name: 'Lemon tart' },
    { id: 'visit', pageType: 'contact', name: 'Visit us' }
  ]
}
const item = (page, alias) => ({
  key: `menuItem:main:${page}`,
  kind: 'menuItem.create',
  page,
  fields: { alias }
})
const write = {
  plan: {
    mainMenu: 'main',
    under: { tart: { list: 'cakes', link: { refs: { record: { ref: 'article:tart' } } } } },
    ops: [
      item('home', 'home'),
      item('cakes', 'our-cakes'),
      item('visit', 'visit-us'),
      { key: 'article:tart', kind: 'record.create', fields: { alias: 'sour-lemon-tart' } }
    ]
  }
}
const page = (path, links = []) => ({ path, abs: new URL(path.slice(1), base).href, status: 200, links })
const menu = [
  { href: '/', menu: true, label: 'Home' },
  { href: '/our-cakes', menu: true, label: 'Our cakes' },
  { href: '/visit-us', menu: true, label: 'Visit us' }
]
const site = () => [
  page('/', menu),
  page('/our-cakes', [...menu, { href: '/our-cakes/sour-lemon-tart', label: 'Lemon tart' }]),
  page('/our-cakes/sour-lemon-tart', menu),
  page('/visit-us', menu)
]
const findingsOf = (pages, w = write) =>
  checkPages({ expected: expectedPagesOf(plan, w), pages, base }).findings.map((f) => [
    f.kind,
    f.page,
    f.place.path
  ])

test('a page reached under its list page needs no menu item and is found at its alias below the list page', () => {
  const tart = expectedPagesOf(plan, write).find((e) => e.page === 'tart')
  assert.deepEqual(tart, {
    page: 'tart',
    pageType: 'class',
    alias: 'sour-lemon-tart',
    path: '/our-cakes/sour-lemon-tart',
    under: 'cakes'
  })
  assert.deepEqual(findingsOf(site()), [])
})

test('a page reached under its list page that does not open at its address is a missing plan page', () => {
  const pages = site().filter((p) => p.path !== '/our-cakes/sour-lemon-tart')
  assert.deepEqual(findingsOf(pages), [['plan_page_missing', 'tart', '/our-cakes/sour-lemon-tart']])
})

test('a page the write plan gives a menu item still reports that item missing', () => {
  const pages = site().map((p) => ({ ...p, links: p.links.filter((l) => l.href !== '/visit-us') }))
  assert.deepEqual(findingsOf(pages), [['plan_menu_item_missing', 'visit', '/visit-us']])
})

test('without the write plan saying a page is reached under its list page, its menu item is expected', () => {
  const plain = { plan: { ...write.plan, under: {} } }
  assert.deepEqual(
    findingsOf([...site(), page('/lemon-tart', menu)], plain).filter((f) => f[1] === 'tart'),
    [['plan_menu_item_missing', 'tart', '/lemon-tart']]
  )
})
