import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { slotMap } from '../domain/pictures/slot-map.mjs'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/pictures/${name}.json`, import.meta.url), 'utf8'))
const restaurant = fixture('ja-restaurant-j6-1.0.5')
const impact = fixture('ja-impact-j6-1.0.3')
const kinetic = fixture('ja-kinetic-wp7-1.0.10')

const byFile = (map) => new Map(map.groups.map((g) => [g.file, g]))

test('ja-restaurant: the three slides are heroes of the home page, in order, before anything else', () => {
  const map = slotMap(restaurant)
  const heroes = map.groups.filter((g) => g.role === 'hero')
  assert.deepEqual(
    heroes.map((g) => g.file),
    [
      'images/joomlart/slideshow/slide-1.jpg',
      'images/joomlart/slideshow/slide-2.jpg',
      'images/joomlart/slideshow/slide-3.jpg'
    ]
  )
  assert.ok(heroes.every((g) => g.home))
  assert.equal(map.groups[0].file, 'images/joomlart/slideshow/slide-1.jpg')
})

test('ja-restaurant: a cut-out PNG, avatars, logos, a map and the team of evidence are never replaced, each with its reason', () => {
  const map = slotMap(restaurant)
  const never = new Map(map.never.map((n) => [n.file, n.reason]))
  assert.match(never.get('images/joomlart/hero/chef.png'), /cut-out/)
  assert.match(never.get('images/joomlart/avatars/avt-2.jpg'), /avatar|face/)
  assert.match(never.get('images/joomlart/logo.png'), /logo|mark/)
  assert.ok([...never.keys()].some((f) => f.startsWith('https://www.google.com/maps')))
  assert.match(never.get('images/joomlart/avatars/chef-1.jpg'), /evidence/)
  const placed = new Set(map.groups.map((g) => g.file))
  for (const file of never.keys()) assert.ok(!placed.has(file), file)
})

test('ja-restaurant: a demo file shown in two slots is one group with both occurrences and both pages', () => {
  const fd1 = byFile(slotMap(restaurant)).get('images/joomlart/food/fd-1.jpg')
  assert.equal(fd1.role, 'dish')
  assert.deepEqual(fd1.occurrences.map((o) => o.label).sort(), [
    'Menu with Image / dish-image',
    'Sea food / dish-image'
  ])
  assert.deepEqual(fd1.routes, ['menu', 'menu/menu-with-image'])
  assert.ok(fd1.topic.includes('sea'))
  assert.ok(fd1.topic.includes('food'))
})

test('ja-restaurant: an article picture lives on the page that shows the article; error pages are never replaced', () => {
  const map = slotMap(restaurant)
  const history = byFile(map).get('images/joomlart/blog/rest-8.jpg')
  assert.deepEqual(history.routes, ['about-us/our-history'])
  const never = new Map(map.never.map((n) => [n.file, n.reason]))
  assert.match(never.get('images/joomlart/404-page.jpg'), /error|offline/)
  assert.match(never.get('images/joomlart/offline-page.jpg'), /error|offline/)
})

test('ja-restaurant: pages the site does not keep take no picture', () => {
  const kept = new Set(['homepage', 'menu', 'contact'])
  const map = slotMap(restaurant, { keepRoute: (route) => kept.has(route) })
  const files = new Set(map.groups.map((g) => g.file))
  assert.ok(files.has('images/joomlart/food/fd-1.jpg'))
  assert.ok(!files.has('images/joomlart/gallery/big-photo-1.jpg'))
  assert.deepEqual(byFile(map).get('images/joomlart/food/fd-1.jpg').routes, ['menu'])
})

test('ja-impact: the size a sample declares is the demo size; an empty sample and 65px icons are not content', () => {
  const map = slotMap(impact)
  const heroes = map.groups.filter((g) => g.role === 'hero')
  assert.deepEqual(
    heroes.map((g) => [g.file, g.demo]),
    [
      ['images/joomlart/hero/item-1.jpg', { width: 1920, height: 824 }],
      ['images/joomlart/hero/item-2.jpg', { width: 3500, height: 2388 }]
    ]
  )
  assert.ok(!map.groups.some((g) => g.file === ''))
  assert.ok(map.never.some((n) => n.file === 'images/joomlart/acm/assistance_1.png'))
})

test('a PNG whose transparency is measured opaque may be replaced; one measured transparent never is', () => {
  const opaque = slotMap(restaurant, {
    demo: new Map([['images/joomlart/hero/chef.png', { width: 600, height: 700, alpha: false }]])
  })
  assert.ok(byFile(opaque).has('images/joomlart/hero/chef.png'))
  const cut = slotMap(restaurant, {
    demo: new Map([['images/joomlart/hero/chef.png', { width: 600, height: 700, alpha: true }]])
  })
  assert.ok(!byFile(cut).has('images/joomlart/hero/chef.png'))
})

test('ja-kinetic (WordPress): every face is kept, the home tile is a section of the home page', () => {
  const map = slotMap(kinetic, { cms: 'wordpress' })
  assert.deepEqual(
    map.groups.map((g) => [g.file, g.home]),
    [['wp-content/uploads/2026/09/bento-telemetry-chart.webp', true]]
  )
  // Seven people's faces, each one file shown on several pages.
  assert.equal(map.never.filter((n) => /avatar|face/.test(n.reason)).length, 7)
})

test('the same contract always gives the same map', () => {
  assert.deepEqual(slotMap(restaurant), slotMap(structuredClone(restaurant)))
})

const spa = fixture('ja-spa-j6-1.0.6')

test('ja-spa: the background of the Hero section is the hero, not a background', () => {
  const hero = byFile(slotMap(spa)).get('images/joomlart/hero/item-1.jpg')
  assert.equal(hero.role, 'hero')
  assert.ok(hero.home)
})

test('a blog post no page of the contract shows keeps its picture, said: the engine keeps demo posts as written', () => {
  const map = slotMap(spa)
  assert.ok(!byFile(map).has('images/joomlart/blog/5.jpg'))
  assert.match(map.skipped.find((s) => s.file === 'images/joomlart/blog/5.jpg').reason, /blog post/)
  // An article a page shows is still placed.
  assert.equal(byFile(map).get('images/joomlart/others/about-1.jpg').role, 'article')
  assert.ok(!byFile(slotMap(impact)).has('images/joomlart/gallery/detail-donate-1.jpg'))
})

test('the demo file the site serves beats the size the contract declares (ja-impact item-2 declares 3500×2388, is 1920×824)', () => {
  const map = slotMap(impact, {
    demo: new Map([['images/joomlart/hero/item-2.jpg', { width: 1920, height: 824 }]])
  })
  assert.deepEqual(byFile(map).get('images/joomlart/hero/item-2.jpg').demo, { width: 1920, height: 824 })
})
