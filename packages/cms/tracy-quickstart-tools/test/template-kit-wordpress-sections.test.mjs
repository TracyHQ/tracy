// A WordPress page is read as the sections a visitor sees (hero, menu list, booking form...), one block each, the way
// a Joomla page is read as its modules: the top-level blocks of the post content. Fabricated pages of a bakery.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { indexMap } from '../template-kit/lib/map-index.mjs'
import { postSections } from '../template-kit/lib/site/adapters/wordpress-sections.mjs'
import { withWordPressPages } from '../template-kit/lib/site/adapters/wordpress-map.mjs'

const group = (attrs, inner) =>
  `<!-- wp:group ${JSON.stringify(attrs)} -->\n<div>${inner}</div>\n<!-- /wp:group -->`
const heading = (name, text) =>
  `<!-- wp:heading {"metadata":{"name":"${name}"}} -->\n<h2 class="wp-block-heading">${text}</h2>\n<!-- /wp:heading -->`
const paragraph = (text, name) =>
  `<!-- wp:paragraph ${name ? `{"metadata":{"name":"${name}"}} ` : ''}-->\n<p>${text}</p>\n<!-- /wp:paragraph -->`

const FRONT = [
  group({ metadata: { name: 'hero.root' }, anchor: 'hero-1' }, heading('hero.title', 'Fresh bread daily')),
  group(
    { metadata: { name: 'breads.root' } },
    `${heading('breads.title', 'Our breads')}${paragraph('Rye and spelt')}`
  ),
  group(
    { metadata: { name: 'breads.root' } },
    `${heading('breads.title', 'More breads')}${paragraph('Baked at dawn')}`
  ),
  paragraph('Open every day', 'hours.note')
].join('\n\n')

test('a post content splits into its top-level blocks, each with the names it holds first and its selector', () => {
  const s = postSections(FRONT)
  assert.deepEqual(
    s.map((x) => [x.label, x.selector]),
    [
      ['hero', '#hero-1'],
      ['breads', '.wp-block-post-content > :nth-child(2)'],
      ['breads-2', '.wp-block-post-content > :nth-child(3)'],
      ['hours-note', '.wp-block-post-content > :nth-child(4)']
    ]
  )
  // A name the page repeats is addressed in its first block only (the plugin's rule: the first block of that name).
  assert.deepEqual(s[1].names, ['breads.root', 'breads.title'])
  assert.deepEqual(s[2].names, [])
  // Unnamed blocks are addressed by type and 1-based occurrence in the page: the range each section holds.
  assert.deepEqual(s[1].occurrences, { group: [2, 2], heading: [2, 2], paragraph: [1, 1] })
  assert.deepEqual(s[2].occurrences, { group: [3, 3], heading: [3, 3], paragraph: [2, 2] })
})

const MAP = {
  entities: [{ key: 'page-home', kind: 'page', identity: { postType: 'page', slug: 'home' } }],
  slots: [
    {
      key: 'home.hero.title',
      entity: 'page-home',
      target: { block: 'hero.title', attr: 'content' },
      type: 'text'
    },
    {
      key: 'home.breads.title',
      entity: 'page-home',
      target: { block: 'breads.title', attr: 'content' },
      type: 'text'
    },
    {
      key: 'home.paragraph.2',
      entity: 'page-home',
      target: { blockType: 'paragraph', occurrence: 2 },
      type: 'text'
    },
    {
      key: 'home.hours.note',
      entity: 'page-home',
      target: { block: 'hours.note', attr: 'content' },
      type: 'text'
    }
  ]
}
const INVENTORY = {
  options: { page_on_front: 7 },
  posts: [{ id: 7, type: 'page', status: 'publish', slug: 'home', parent: 0 }]
}

test('a page with sections lists the header, one block per section and the footer; each section owns its slots', () => {
  const map = withWordPressPages(MAP, INVENTORY, { 7: postSections(FRONT) })
  const page = map.pages.find((p) => p.entity === 'page-home')
  assert.deepEqual(
    page.assignedModules.map((a) => a.entity),
    [
      'header',
      'block-home-hero',
      'block-home-breads',
      'block-home-breads-2',
      'block-home-hours-note',
      'footer'
    ]
  )
  const hero = page.assignedModules[1]
  assert.equal(hero.selector, '#hero-1')
  assert.equal(hero.position, 'hero')
  assert.equal(hero.kind, 'section')
  const idx = indexMap(map)
  const keysOf = (e) => (idx.slotsBy.get(e) ?? []).map((s) => s.key)
  assert.deepEqual(keysOf('block-home-hero'), ['home.hero.title'])
  assert.deepEqual(keysOf('block-home-breads'), ['home.breads.title'])
  assert.deepEqual(keysOf('block-home-breads-2'), ['home.paragraph.2'])
  assert.deepEqual(keysOf('block-home-hours-note'), ['home.hours.note'])
  assert.deepEqual(keysOf('page-home'), [])
  // The section is an entity of the shaped map, tied to its page.
  assert.equal(idx.entities.get('block-home-breads').identity.page, 'page-home')
  // The contract's own map is left as it was.
  assert.equal(MAP.slots[0].entity, 'page-home')
})

test('a page a slot of which no section holds keeps its whole post content as one block', () => {
  const map = withWordPressPages(
    {
      ...MAP,
      slots: [
        ...MAP.slots,
        {
          key: 'home.gone',
          entity: 'page-home',
          target: { block: 'gone.title', attr: 'content' },
          type: 'text'
        }
      ]
    },
    INVENTORY,
    { 7: postSections(FRONT) }
  )
  const page = map.pages.find((p) => p.entity === 'page-home')
  assert.deepEqual(
    page.assignedModules.map((a) => a.entity),
    ['header', 'main-body', 'footer']
  )
  assert.ok(map.sectionGaps.some((g) => g.field === 'blocks[page-home]' && /gone\.title/.test(g.reason)))
})

test('without the sections read from the site, every page is the three areas, as before', () => {
  const map = withWordPressPages(MAP, INVENTORY)
  assert.deepEqual(
    map.pages[0].assignedModules.map((a) => a.entity),
    ['header', 'main-body', 'footer']
  )
})

test('a page the map does not list (a single post) is read as the three areas, not as the front page sections', async () => {
  const { assignedAt } = await import('../template-kit/lib/map-index.mjs')
  const idx = indexMap(withWordPressPages(MAP, INVENTORY, { 7: postSections(FRONT) }))
  assert.deepEqual(
    assignedAt(idx, '/a-post-about-rye/').map((a) => a.entity),
    ['header', 'main-body', 'footer']
  )
  assert.equal(assignedAt(idx, '/')[1].entity, 'block-home-hero')
})
