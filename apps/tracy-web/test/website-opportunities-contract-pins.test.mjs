/**
 * The slot maps of Website Opportunities (`slot-roles/<cms>.json`) read against the content contracts this repo ships: the
 * newest release of each Tracy template, so a release that renames or retypes a mapped slot turns this red.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

const CONTRACTS = {
  joomla: new URL('../../../packages/cms/tracy-joomla-quickstart/contracts/', import.meta.url),
  wordpress: new URL('../../../packages/cms/tracy-wordpress-quickstart/contracts/', import.meta.url)
}
const LINE = { joomla: 'j6', wordpress: 'wp7' }

const semver = (v) => v.split('.').map(Number)
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
function newest(cms, template) {
  const dir = new URL(`${template}/${LINE[cms]}/`, CONTRACTS[cms])
  const version = readdirSync(dir)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name) && existsSync(new URL(`${name}/content-map.json`, dir)))
    .sort(newer)
    .at(-1)
  return {
    version,
    contentMap: JSON.parse(readFileSync(new URL(`${version}/content-map.json`, dir), 'utf8'))
  }
}

const card = (n) => ({
  value: { title: `Dish ${n}`, text: `Dish ${n} is slow cooked for six hours.` },
  source: `post:instagram:${n}`
})
const PINNED = {
  'hero.title': { value: 'The Larch House', source: 'business.name' },
  'hero.lead': { value: 'A Highland kitchen and wine bar in the old town of Hoi An.', source: 'profile.bio' },
  'hero.cta': { value: { label: 'Call', href: 'tel:+842350000102' }, source: 'business.phone' },
  'about.story': {
    value: { title: 'Our story', text: 'We opened in Sapa in 2015. The blue door came with us.' },
    source: 'post:facebook:1'
  },
  cards: [card(1), card(2), card(3), card(4), card(5), card(6)],
  contact: {}
}

// Independent of the map files: the slot a visitor reads the restaurant's name in, per template, as surveyed 19/10/2026.
const NAME_SLOT = {
  joomla: { 'tracy-base': 'module-228.1', 'tracy-business': 'module-441.1' },
  wordpress: { 'tracy-base': 'home-variation.hero.title', 'tracy-business': 'home.hero.heading' }
}

for (const cms of ['joomla', 'wordpress'])
  for (const template of ['tracy-base', 'tracy-business'])
    test(`${template} on ${cms}: every mapped slot is in the newest release, of the kind its field wants`, async () => {
      const { contractCopyPins, slotRolesFor } = await websiteOpportunitiesDomain()
      const { version, contentMap } = newest(cms, template)
      const map = slotRolesFor(cms, template)
      assert.ok(map, 'a map for this template')
      const { pins, skipped } = contractCopyPins({ map, contentMap, pinned: PINNED })
      assert.deepEqual(skipped, [], `${template}/${LINE[cms]}/${version}`)
      const mapped = Object.values(map.roles).flatMap((groups) => groups.flatMap((g) => Object.values(g)))
      assert.deepEqual(Object.keys(pins).sort(), [...new Set(mapped)].sort())
      assert.equal(pins[NAME_SLOT[cms][template]], 'The Larch House')
      // The map says which release it was read from; a newer one is read again before it is trusted further.
      assert.equal(map.checked, `${template}/${LINE[cms]}/${version}`)
    })

// JA Restaurant on WordPress (pilot, 22/10/2026): the home page's menu holds the restaurant's dishes, nothing else of the demo's.
const dish = (n, name) => ({
  value: { name, description: `${name}, as the restaurant describes it.` },
  source: `post:facebook:${n}`
})

test('ja-restaurant on wordpress: every mapped slot is in the newest release, of the kind and length its field wants', async () => {
  const { contractCopyPins, slotRolesFor, forbiddenFillerText } = await websiteOpportunitiesDomain()
  const { version, contentMap } = newest('wordpress', 'ja-restaurant')
  const map = slotRolesFor('wordpress', 'ja-restaurant')
  assert.equal(map.checked, `ja-restaurant/wp7/${version}`)
  const slots = new Map(contentMap.slots.map((s) => [s.key, s]))
  for (const [role, groups] of Object.entries(map.roles))
    for (const group of groups)
      for (const [field, key] of Object.entries(group)) {
        if (field.startsWith('$')) continue
        assert.equal(slots.get(key)?.type, field === 'href' ? 'url' : 'text', `${role} ${key}`)
        assert.ok(slots.get(key).maxCharacters >= 80, `${key} holds a line`)
      }
  for (const h of map.placeholders) for (const key of h.slots) assert.ok(slots.has(key), key)
  const pinned = {
    ...PINNED,
    'hero.accent': { value: 'Vietnamese, Wine bar', source: 'business.cuisine' },
    'contact.address': { value: '14 Example Lane, Hoi An', source: 'business.address' },
    dishes: [dish(1, 'Cao lau'), dish(2, 'Banh xeo')]
  }
  const { pins, skipped, sources, hidden } = contractCopyPins({ map, contentMap, pinned })
  assert.equal(hidden, undefined, 'nothing is hidden (replace, never remove: product owner, 22/10/2026)')
  assert.deepEqual(skipped, [])
  assert.equal(pins['homepage.hero.hero-heading'], 'The Larch House')
  assert.equal(pins['homepage.menu.dish-name.2'], 'Banh xeo')
  assert.equal(pins['homepage.menu.dish-description.1'], 'Cao lau, as the restaurant describes it.')
  assert.equal(pins['contact-us.contact-map.map-title'], '14 Example Lane, Hoi An')
  // No price was collected: every dish price is empty, never the demo's, a guess or a filler (plan §7, 26/10/2026).
  for (const n of [1, 2, 3, 4, 5, 6]) {
    assert.equal(pins[`homepage.menu.dish-price.${n}`], '', `price ${n}`)
    assert.equal(sources[`homepage.menu.dish-price.${n}`], 'placeholder')
  }
  // Dishes 3-6 have no dish of the restaurant: each item stays under the neutral name, its description empty.
  assert.equal(pins['homepage.menu.dish-name.3'], 'Menu item')
  assert.equal(pins['homepage.menu.dish-name.5'], 'Menu item')
  assert.equal(pins['homepage.menu.dish-description.5'], '')
  assert.equal(pins['menu-with-image.menu.dish-extra-class.1'], '', 'a badge is never collected')
  // The specials and the testimonials are the demo's own facts: their bodies and prices are emptied.
  assert.equal(pins['homepage.home-news.testimonial-text.1'], '')
  // Nothing else stands in: the neutral dish name, every other unsourced line empty, never a filler.
  for (const [key, value] of Object.entries(pins)) {
    assert.equal(forbiddenFillerText(value), false, key)
    if (sources[key] === 'placeholder') assert.equal(value, /dish-name/.test(key) ? 'Menu item' : '', key)
  }
})

test("ja-restaurant on wordpress: the map's hidden sections and dish items hold exactly the slots it names (the release's pages)", async () => {
  const { slotRolesFor } = await websiteOpportunitiesDomain()
  const { contentMap } = newest('wordpress', 'ja-restaurant')
  const { parseBlocks, namedBlocks } = await import('../src/sites/brief-engines/wp-blocks.js')
  /** One page of the release as its database ships it, with the slots its blocks hold. */
  const pageOf = (/** @type {string} */ slug) => {
    const body = readFileSync(
      new URL(`./fixtures/ja-restaurant-wp7-1.0.1-${slug}.html`, import.meta.url),
      'utf8'
    )
    const root = parseBlocks(body)
    assert.ok(root, slug)
    const parents = new Map()
    const walk = (n) => n.children.forEach((c) => (parents.set(c, n), walk(c)))
    walk(root)
    // A slot is the FIRST block of its name on the page (the one the contract door writes).
    const first = (name) => namedBlocks(root, name)[0]
    const inside = (outer, type = null) =>
      contentMap.slots
        .filter((s) => s.entity === `page-${slug}` && s.target?.block && (!type || s.type === type))
        .filter((s) => {
          const b = first(s.target.block)
          return b && b.start >= outer.start && b.end <= outer.end
        })
        .map((s) => s.key)
    return { root, parents, inside }
  }
  const map = slotRolesFor('wordpress', 'ja-restaurant')
  for (const h of map.placeholders) {
    const { root, parents, inside } = pageOf(h.page)
    let node = namedBlocks(root, h.block)[(h.nth ?? 1) - 1]
    for (let i = 0; i < (h.up ?? 0); i++) node = parents.get(node)
    assert.ok(node, `${h.page} ${h.block}#${h.nth}`)
    assert.deepEqual(inside(node).sort(), [...h.slots].sort(), `${h.page} ${h.block}#${h.nth}`)
  }
  // Each dish group lives in its own item block, in the first tab or list of its page.
  for (const [role, groups] of Object.entries(map.roles).filter(([r]) => r.startsWith('dishes'))) {
    const slug = role === 'dishes' ? 'homepage' : role.slice('dishes:'.length)
    const { root, inside } = pageOf(slug)
    for (const group of groups) {
      const item = namedBlocks(root, group.$item)[0]
      const fields = Object.entries(group).filter(([f]) => !f.startsWith('$'))
      assert.deepEqual(inside(item, 'text').sort(), fields.map(([, k]) => k).sort(), `${role} ${group.$item}`)
    }
  }
  // Every price slot of every menu page is in a dish group: none is left for the planner (Sol review, 22/10/2026).
  const grouped = new Set(
    Object.entries(map.roles)
      .filter(([r]) => r.startsWith('dishes'))
      .flatMap(([, groups]) => groups.map((g) => g.price))
  )
  const hiddenSlots = new Set(map.placeholders.flatMap((h) => h.slots))
  const prices = contentMap.slots.filter(
    (s) =>
      /\.dish-price\.\d+$/.test(s.key) &&
      /^page-(homepage|menu|simple-menu|menu-with-image|2-column-menu)$/.test(s.entity)
  )
  assert.ok(prices.length >= 40)
  for (const s of prices) assert.ok(grouped.has(s.key) || hiddenSlots.has(s.key), s.key)
})

test('ja-restaurant on wordpress: no dish of the restaurant at all keeps the whole menu section, its dish items under the neutral name', async () => {
  const { contractCopyPins, slotRolesFor } = await websiteOpportunitiesDomain()
  const { contentMap } = newest('wordpress', 'ja-restaurant')
  const map = slotRolesFor('wordpress', 'ja-restaurant')
  const { pins, hidden, dishes } = contractCopyPins({ map, contentMap, pinned: { ...PINNED, dishes: [] } })
  assert.equal(hidden, undefined)
  assert.deepEqual(dishes, [])
  assert.equal(pins['homepage.menu.dish-name.1'], 'Menu item')
  assert.equal(pins['homepage.menu.dish-description.1'], '')
  assert.equal(pins['homepage.menu.dish-price.1'], '')
  assert.equal(pins['menu.menu.dish-name.2'], 'Menu item')
  // The section's heading is left to the brief's words: no placeholder takes a title.
  assert.equal('homepage.tabs.heading' in pins, false)
})
