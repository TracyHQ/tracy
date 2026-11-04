// A page's title slot is decided by what the page prints, whatever list the content map put the slot in. Fabricated
// swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverageGate } from '../template-kit/lib/coverage-gate.mjs'
import { settlePageTitles } from '../template-kit/lib/page-titles.mjs'

const slot = (key, sample, extra = {}) => ({
  key,
  entity: key.replace(/\.\d+$/, ''),
  type: 'text',
  role: 'editorial.menu_label',
  sample,
  ...extra
})
const MAP = {
  slots: [
    slot('module-9.0', 'Lane Hire', { group: { id: 'module-9.page.0' } }),
    // The last row of the banner: the map's classifier read a figure in its text and put it in another list.
    slot('module-9.1', 'Our Lessons', { group: { id: 'module-9.stat.1' } }),
    // The same words on another block: a section heading of the home page.
    slot('module-4.0', 'Our Lessons', { role: 'editorial.heading' }),
    slot('menuItem-7.0', 'Timetable'),
    slot('menuItem-8.0', 'Our Lessons'),
    slot('article-3.0', 'Learn to Swim', { role: 'offering.name' }),
    slot('article-3.1', 'Learn to Swim', { role: 'editorial.heading' }),
    slot('article-5.0', 'Pool Rules', { role: 'offering.name' }),
    slot('user-2.0', 'Dana Reef', { role: 'person.name' })
  ],
  entities: [
    { key: 'article-3', kind: 'article', identity: { alias: 'learn-to-swim' } },
    { key: 'article-5', kind: 'article', identity: { alias: 'pool-rules' } }
  ],
  pages: [
    { entity: 'menuItem-7', route: 'timetable' },
    { entity: 'menuItem-8', route: 'lessons-menu' }
  ]
}
const page = (id, path, text, blocks, extra = {}) => ({
  id,
  path,
  blocks: { 1440: blocks },
  h1: text
    ? { via: 'content-slot', slot: 'module-4.0', text }
    : { via: null, reason: 'the page shows no h1' },
  ...extra
})
const kit = (pages) => ({
  pages,
  errors: [],
  checks: {},
  site: {},
  blocks: [
    {
      id: 'header',
      role: 'header',
      slots: [{ id: 'menuItem-8.0', type: 'text', sample: 'Our Lessons' }]
    },
    {
      id: 'block-9',
      role: 'hero',
      lists: [
        { id: 'block-9.page', rowSlots: [{ id: 'block-9.0', type: 'text', sample: 'Lane Hire' }] },
        { id: 'block-9.stat', rowSlots: [{ id: 'block-9.1', type: 'text', sample: 'Our Lessons' }] }
      ]
    },
    { id: 'block-4', role: 'section', slots: [{ id: 'block-4.0', type: 'text', sample: 'Our Lessons' }] },
    {
      id: 'body-learn',
      role: 'page-body',
      slots: [{ id: 'article-3.0', type: 'text', sample: 'Learn to Swim' }],
      lists: [
        {
          id: 'items',
          rowKind: 'items',
          rowSlots: [{ field: 'custom:lead', slots: [{ item: 'article-3', id: 'article-3.1' }] }]
        }
      ]
    },
    {
      id: 'body-rules',
      role: 'page-body',
      slots: [{ id: 'article-5.0', type: 'text', sample: 'Pool Rules' }]
    }
  ]
})

const onePage = (p, drives) => {
  const k = kit([p])
  settlePageTitles(k, { map: MAP, drives })
  return k
}

test('the title is the slot the page prints in the block it shows, not the first slot with the same words', () => {
  // Nothing on the page says block-4: the words are the banner's, and the reading named a slot of another block.
  const k = onePage(page('page-lessons', '/lessons', 'OUR LESSONS', ['header', 'block-9']))
  assert.equal(k.pages[0].titleSlot, 'block-9.1')
})

test('the slot says which page it titles, in whichever list it sits', () => {
  const k = onePage(page('page-lessons', '/lessons', 'OUR LESSONS', ['header', 'block-9']))
  const stat = k.blocks.find((b) => b.id === 'block-9').lists[1]
  assert.deepEqual(stat.rowSlots[0].pageTitleOf, ['page-lessons'])
  assert.equal(stat.id, 'block-9.stat', 'no slot moves: frozen plans still name this list')
})

test('a label in the menu with the same words is not the title', () => {
  const k = onePage(page('page-lessons', '/lessons', 'Our Lessons', ['header', 'block-9']))
  assert.equal(k.pages[0].titleSlot, 'block-9.1')
})

test('a link label in a side block with the same words is not the title, nor is the page own menu item', () => {
  const k = kit([page('page-lessons', '/lessons-menu', 'Our Lessons', ['block-9', 'block-side'])])
  k.blocks.push({
    id: 'block-side',
    role: 'sidebar',
    slots: [{ id: 'menuItem-9.0', type: 'text' }],
    links: [{ id: 'l', labelId: 'menuItem-9.0' }]
  })
  const map = { ...MAP, slots: [...MAP.slots, slot('menuItem-9.0', 'Our Lessons')] }
  settlePageTitles(k, { map })
  assert.equal(k.pages[0].titleSlot, 'block-9.1')
})

test('the block the page reading found the title in decides between two blocks showing the words', () => {
  const p = page('page-lessons', '/lessons', 'Our Lessons', ['block-4', 'block-9'])
  assert.deepEqual(onePage(structuredClone(p)).pages[0].titleCandidates, ['block-4.0', 'block-9.1'])
  p.h1.block = 'block-4'
  assert.equal(onePage(p).pages[0].titleSlot, 'block-4.0')
})

test('two fields of the page entity with the title words stay open until a field measurement settles them', () => {
  const p = page('page-learn', '/learn-to-swim', 'LEARN TO SWIM', ['body-learn'])
  const open = onePage(structuredClone(p)).pages[0]
  assert.equal(open.titleSlot, null)
  assert.deepEqual(open.titleCandidates, ['article-3.0', 'article-3.1'])
  const measured = onePage(p, {
    'article-3.1': { controls: [{ page: '/learn-to-swim', attribute: 'text', title: true }] }
  }).pages[0]
  assert.equal(measured.titleSlot, 'article-3.1')
  assert.equal(measured.titleCandidates, undefined)
})

test('a page titled by a person or a menu item the page belongs to takes that slot', () => {
  const author = page('page-dana', '/authors/dana', 'Dana Reef', ['header'])
  author.h1.slot = 'user-2.0'
  assert.equal(onePage(author).pages[0].titleSlot, 'user-2.0')
  const own = page('page-timetable', '/timetable', 'Timetable', ['header'])
  assert.equal(onePage(own).pages[0].titleSlot, 'menuItem-7.0')
})

test('the gate names every page without exactly one title slot', () => {
  const k = kit([
    page('page-lessons', '/lessons', 'Our Lessons', ['block-9']),
    page('page-learn', '/learn-to-swim', 'Learn to Swim', ['body-learn']),
    page('page-empty', '/empty', null, ['header'])
  ])
  settlePageTitles(k, { map: MAP })
  coverageGate(k, { map: MAP })
  assert.equal(k.coverage.parts.pageTitleSlots, 2)
  const reasons = k.coverage.failures.filter((f) => f.part === 'pageTitleSlots')
  assert.deepEqual(
    reasons.map((f) => f.where),
    ['pages[page-learn]', 'pages[page-empty]']
  )
  assert.match(reasons[0].reason, /article-3\.0, article-3\.1/)
  assert.match(reasons[1].reason, /no page title slot/)
})
