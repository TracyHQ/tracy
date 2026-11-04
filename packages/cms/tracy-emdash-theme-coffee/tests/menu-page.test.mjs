// The Menu page: items grouped by the `menu_group` taxonomy, "Order online" / "Call us" buttons that hide when their
// cell is empty, and every place a new page has to be registered. The pure half (`src/lib/menu.ts`) runs here; the
// wiring in the view and the router is held at the SOURCE, since no Astro renderer runs in this package's node tests.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { featuredItems, groupMenu, menuButtons } from '../src/lib/menu.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const json = (file) => JSON.parse(read(file))

const item = (slug, groups = []) => ({ slug, data: { title: slug }, groups })
const TERMS = [
  { slug: 'coffee', label: 'Coffee' },
  { slug: 'tea', label: 'Tea' },
  { slug: 'pastries', label: 'Pastries' }
]

test('groups follow the taxonomy order and each holds the items that chose it', () => {
  const out = groupMenu(
    [item('latte', ['coffee']), item('chai', ['tea']), item('espresso', ['coffee'])],
    TERMS,
    'More'
  )
  assert.deepEqual(
    out.map((g) => [g.slug, g.items.map((i) => i.slug)]),
    [
      ['coffee', ['latte', 'espresso']],
      ['tea', ['chai']]
    ]
  )
})

test('an item in several groups shows in each; an item in none goes to a last "More" group; an empty group is hidden', () => {
  const out = groupMenu([item('mocha', ['coffee', 'pastries']), item('water')], TERMS, 'More')
  assert.deepEqual(
    out.map((g) => [g.slug, g.label, g.items.map((i) => i.slug)]),
    [
      ['coffee', 'Coffee', ['mocha']],
      ['pastries', 'Pastries', ['mocha']],
      ['more', 'More', ['water']]
    ]
  )
  assert.deepEqual(groupMenu([], TERMS, 'More'), [])
})

test('a group named "more" and the group of ungrouped items get two different anchors', () => {
  const out = groupMenu([item('latte', ['more']), item('water')], [{ slug: 'more', label: 'More' }], 'More')
  assert.equal(out.length, 2)
  assert.notEqual(out[0].anchor, out[1].anchor)
  assert.equal(
    new Set(groupMenu([item('a', ['coffee']), item('b')], TERMS, 'More').map((g) => g.anchor)).size,
    2
  )
})

test('the home page cards: the featured items in menu order, up to three, never topped up', () => {
  const it = (slug, featured, sort) => ({ slug, data: { title: slug, featured, sort }, groups: [] })
  const slugs = (items) => featuredItems(items).map((i) => i.slug)
  assert.deepEqual(
    slugs([it('a', true, 3), it('b', false, 1), it('c', true, 2), it('d', true, 4), it('e', true, 5)]),
    ['c', 'a', 'd']
  )
  assert.deepEqual(slugs([it('a', false, 1), it('b', true, 2)]), ['b'], 'one featured item is one card')
  assert.deepEqual(
    slugs([it('a', false, 2), it('b', false, 1), it('c', false, 3), it('d', false, 4)]),
    ['b', 'a', 'c'],
    'none featured: the first three'
  )
  assert.deepEqual(slugs([]), [])
})

test('the buttons show only for a filled cell: link and label for Order, phone and label for Call', () => {
  const full = {
    orderLabel: 'Order online',
    orderUrl: 'https://example.com/order',
    callLabel: 'Call us',
    phone: '+1 555 0142'
  }
  assert.deepEqual(menuButtons(full), [
    { kind: 'order', label: 'Order online', href: 'https://example.com/order' },
    { kind: 'call', label: 'Call us', href: 'tel:+15550142' }
  ])
  assert.deepEqual(
    menuButtons({ ...full, orderUrl: '  ' }).map((b) => b.kind),
    ['call']
  )
  assert.deepEqual(
    menuButtons({ ...full, phone: '' }).map((b) => b.kind),
    ['order']
  )
  assert.deepEqual(
    menuButtons({ ...full, orderLabel: '' }).map((b) => b.kind),
    ['call']
  )
  assert.deepEqual(menuButtons({ orderLabel: 'Order', callLabel: 'Call' }), [])
})

test('the Order button never links a script or a non-web scheme', () => {
  const base = { orderLabel: 'Order online', callLabel: '', phone: '' }
  assert.deepEqual(menuButtons({ ...base, orderUrl: 'javascript:alert(1)' }), [])
  assert.equal(menuButtons({ ...base, orderUrl: '/contact' })[0].href, '/contact')
})

test('the Menu view draws the buttons from menuButtons, the groups from groupMenu, a price only when set', () => {
  const view = read('src/views/Menu.astro')
  assert.match(view, /menuButtons\(/)
  assert.match(view, /groupMenu\(/)
  assert.ok(view.includes('{d.price && '), 'a priced item prints the price, an unpriced one prints nothing')
  assert.ok(view.includes('data-menu-group'), 'each group is marked for the group bar and the page checks')
})

test('the new page is registered: router, link gate, primary menu, Content API map, content order', () => {
  assert.match(read('src/pages/[...path].astro'), /menu: \(\) => import\('@\/views\/Menu\.astro'\)/)
  assert.match(read('src/lib/link-gate.ts'), /menu: \{ collection: 'menu_page', slug: 'menu_page' \}/)
  const seed = json('seed/seed.json')
  const primary = seed.menus.find((m) => m.name === 'primary').items.map((i) => i.label)
  assert.deepEqual(primary, ['Home', 'Menu', 'About', 'News', 'Contact'])
  assert.deepEqual(json('seed/content-api-map.json').collections.menu_page, {
    type: 'page',
    urlPattern: '/menu'
  })
  assert.ok(json('seed/content-api-map.json').collections.menu_items)
  assert.ok(json('template.config.json').contentOrder.includes('menu_page'))
  assert.ok(json('template.config.json').audit.unknownProbes.includes('/menu/nope'))
  assert.ok(json('qa.contract.json').pages.some((p) => p.path === '/menu' && p.layout === 'Menu'))
})

test('the demo menu: four groups of three, three featured, a price on each item, an Order link and a count of "Call us"', () => {
  const seed = json('seed/seed.json')
  const groups = seed.taxonomies.find((t) => t.name === 'menu_group')
  assert.deepEqual(
    groups.terms.map((t) => t.label),
    ['Coffee', 'Tea', 'Iced drinks', 'Pastries']
  )
  const items = seed.content.menu_items
  assert.equal(items.length, 12)
  for (const g of groups.terms)
    assert.equal(items.filter((i) => i.taxonomies.menu_group.includes(g.slug)).length, 3, g.slug)
  assert.equal(items.filter((i) => i.data.featured).length, 3)
  assert.ok(items.every((i) => i.data.price && i.data.title && i.data.excerpt))
  const page = seed.content.menu_page[0].data
  assert.equal(page.order_url, 'https://example.com/order')
  assert.equal(page.order_label, 'Order online')
  assert.equal(page.call_label, 'Call us')
})

test('prices are claims: personalisation empties them for a described business, and each cell has a slot role', () => {
  const rules = json('seed/personalize.json')
  assert.ok(rules.facts.some((f) => f.collection === 'menu_items' && f.field === 'price'))
  assert.ok(rules.terms.some((t) => t.taxonomy === 'menu_group' && t.collections.includes('menu_items')))
  assert.ok(rules.rewrite.some((r) => r.collection === 'menu_items'))
  const map = json('seed/field-map.json')
  const fields = Object.fromEntries(
    map.collections.find((c) => c.collection === 'menu_items').fields.map((f) => [f.slug, f.role])
  )
  assert.equal(fields.price, 'offering.price')
  assert.equal(fields.title, 'offering.name')
  assert.equal(fields.excerpt, 'offering.description')
  assert.equal(fields.image, 'offering.image')
  const page = Object.fromEntries(
    map.collections.find((c) => c.collection === 'menu_page').fields.map((f) => [f.slug, f.role])
  )
  assert.equal(page.order_label, 'editorial.button_label')
  assert.equal(page.call_label, 'editorial.button_label')
})

test('a rewritten menu item keeps the kind of the item it replaces (a tea stays a tea)', () => {
  // The writer is shown each item's own example text and nothing of its group (tools/personalize.mjs), so
  // the rule has to say the example decides the kind. Without it a Tea item came back as "Our house-roasted
  // coffee" (Tracy site build, 2026-10-31): the group still said Tea, the item under it was coffee.
  const rule = json('seed/personalize.json').rewrite.find((r) => r.collection === 'menu_items')
  assert.match(rule.brief, /same kind as its example/)
  for (const kind of ['tea', 'pastry', 'iced drink', 'coffee'])
    assert.match(rule.brief, new RegExp(`\\b${kind}\\b`))
  assert.deepEqual(rule.fields, ['title', 'excerpt'], 'the example carries the name and the description')
})

test('personalisation empties the order link (a new site has none until its owner types one)', () => {
  const rule = json('seed/personalize.json').identity.find(
    (r) => r.collection === 'menu_page' && r.field === 'order_url'
  )
  assert.equal(rule?.value, '')
})

test('menu items are searchable and a result lands on the Menu page at the item', () => {
  const items = json('seed/seed.json').collections.find((c) => c.slug === 'menu_items')
  assert.ok(items.supports.includes('search'))
  const search = read('src/views/Search.astro')
  assert.match(search, /menu_items: '\/menu'/)
  assert.ok(search.includes('`/menu#item-${r.slug}`'))
  assert.ok(read('src/views/Menu.astro').includes('`item-${i.slug}`'))
})

// The field map must pass Tracy's own role check (the one that marks a template's roles `invalid` before Publish).
// It lives in the Tracy checkout the other tests already need; without one there is nothing to run it against.
const CHECKOUT = process.env.TRACY_CHECKOUT
test('Tracy reads the whole field map as valid slot roles', { skip: !CHECKOUT }, async () => {
  const mod = await import(path.join(CHECKOUT, 'apps/tracy-web/src/lib/emdash-field-map-roles.js'))
  const out = mod.fieldMapRolesOf(path.join(ROOT, 'seed'))
  assert.deepEqual(out.errors, [])
  assert.equal(out.ok, true)
})
