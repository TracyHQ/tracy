// The kit lists every button a visitor can see, each block's own, and records how the template presents a content page
// (TracyHQ/tracy#379). Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settleButtons } from '../template-kit/lib/button-slots.mjs'
import { settleContentPages } from '../template-kit/lib/content-pages.mjs'

const slot = (key, role, sample, over = {}) => ({
  key,
  entity: key.slice(0, key.lastIndexOf('.')),
  column: 'params',
  jsonPath: ['custom'],
  type: 'text',
  role,
  sample,
  ...over
})
const LABEL = 'editorial.button_label'
const URL = 'editorial.navigation_url'
const MAP = {
  slots: [
    slot('module-1.1', 'editorial.heading', 'Lanes'),
    slot('module-1.2', URL, 'index.php?Itemid=4', { type: 'url', xpath: '/html/div/a/@href' }),
    slot('module-1.3', LABEL, 'See lanes', { xpath: '/html/div/a/text()' }),
    // The other block prints the same words from a field of its own.
    slot('module-2.2', URL, 'index.php?Itemid=4', { type: 'url', xpath: '/html/div/a/@href' }),
    slot('module-2.3', LABEL, 'See lanes', { xpath: '/html/div/a/text()' }),
    // A row's button: the address in the row, not the other row's.
    slot('module-3.1', LABEL, 'Join', { group: { id: 'row-0' } }),
    slot('module-3.2', URL, '#a', { type: 'url', group: { id: 'row-0' } }),
    slot('module-3.3', LABEL, 'Leave', { group: { id: 'row-1' } }),
    slot('module-3.4', URL, '#b', { type: 'url', group: { id: 'row-1' } }),
    // Stored words no link of the block prints, and a blank one.
    slot('module-4.1', LABEL, 'Never printed'),
    slot('module-4.2', LABEL, '  ')
  ]
}
const block = (n, links, visibleAt = ['1440']) => ({
  id: `block-${n}`,
  source: { entity: `module-${n}` },
  visibleAt,
  links
})
const link = (id, label, target = '/lanes') => ({ id, label, target, labelId: 'block-1.3' })

test('each block lists its own button, though the links of both name the first block for the words', () => {
  const kit = {
    blocks: [block(1, [link('l1', 'SEE LANES')]), block(2, [link('l2', 'See lanes')])]
  }
  settleButtons(kit, { map: MAP })
  assert.deepEqual(kit.blocks[1].buttons, [
    { labelSlot: 'block-2.3', urlSlot: 'block-2.2', label: 'See lanes', link: 'l2', target: '/lanes' }
  ])
  assert.equal(kit.blocks[0].buttons[0].labelSlot, 'block-1.3')
})

test('a label finds the address of its own row, and only printed words on a shown block are buttons', () => {
  const kit = {
    blocks: [
      block(3, [link('l3', 'Join', '/join')]),
      block(4, []),
      block(2, [link('l2', 'See lanes')], []),
      { id: 'block-9', links: [] }
    ]
  }
  settleButtons(kit, { map: MAP })
  assert.deepEqual(
    kit.blocks[0].buttons.map((b) => [b.labelSlot, b.urlSlot]),
    [['block-3.1', 'block-3.2']]
  )
  for (const b of kit.blocks.slice(1)) assert.equal('buttons' in b, false)
})

test('a settled kit settled again is the same', () => {
  const kit = { blocks: [block(1, [link('l1', 'See lanes')])] }
  const once = structuredClone(settleButtons(kit, { map: MAP }))
  assert.deepEqual(settleButtons(kit, { map: MAP }), once)
})

const courses = (n, layout) => ({
  entity: `menuItem-${n}`,
  link: `index.php?option=com_content&view=category${layout ? `&layout=${layout}` : ''}&id=${n}`
})
const page = (id, path) => ({ id, path })
const onCategory = (n, route, path) => ({
  categoryPage: `menuItem-${n}`,
  categoryRoute: route,
  path
})

test('the route of the template content pages is recorded from its item pages, the one with most pages first', () => {
  const kit = {
    pages: [page('p1', '/news/one'), page('p2', '/courses/crawl'), page('p3', '/courses/butterfly')]
  }
  settleContentPages(kit, {
    map: {
      pages: [courses(5, 'quay:notice'), courses(6, 'quay:course')],
      itemPages: {
        'article-1': onCategory(5, 'news', '/index.php/news/one'),
        'article-2': onCategory(6, 'courses', '/index.php/courses/crawl'),
        'article-3': onCategory(6, 'courses', '/courses/butterfly')
      }
    }
  })
  assert.deepEqual(kit.site.contentPages, [
    {
      menuItem: 'menuItem-6',
      route: 'courses',
      layout: 'quay:course',
      pages: ['p2', 'p3'],
      articles: ['article-2', 'article-3']
    },
    { menuItem: 'menuItem-5', route: 'news', layout: 'quay:notice', pages: ['p1'], articles: ['article-1'] }
  ])
})

test('a template with no item pages under a category records nothing, and an old record goes', () => {
  const kit = { pages: [page('p1', '/one')], site: { contentPages: [{ route: 'stale' }] } }
  settleContentPages(kit, {
    map: {
      pages: [{ entity: 'menuItem-7', link: 'index.php?option=com_content&view=article&id=1' }],
      itemPages: { 'article-1': { categoryPage: 'menuItem-7', categoryRoute: 'x', path: '/one' } }
    }
  })
  assert.equal('contentPages' in kit.site, false)
})
