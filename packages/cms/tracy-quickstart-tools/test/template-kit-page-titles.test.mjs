// A page's title slot is decided by what the page prints, whatever list the content map put the slot in. Fabricated
// swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverageGate } from '../template-kit/lib/coverage-gate.mjs'
import { indexMap, ownerOfPath } from '../template-kit/lib/map-index.mjs'
import { settlePageTitles } from '../template-kit/lib/page-titles.mjs'
import { settleSlotRoles } from '../template-kit/lib/slot-roles.mjs'
import { gapId } from '../template-kit/lib/template-gaps.mjs'

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

test('two fields measured at the title size: the one printed in the h1 is the title', () => {
  const p = page('page-learn', '/learn-to-swim', 'LEARN TO SWIM', ['body-learn'])
  const at = (tag) => ({ controls: [{ page: '/learn-to-swim', tag, attribute: 'text', title: true }] })
  const measured = onePage(p, { 'article-3.0': at('div'), 'article-3.1': at('h1') }).pages[0]
  assert.equal(measured.titleSlot, 'article-3.1')
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

test('a page not for customers needs no title: the page of an account the content map does not declare', () => {
  const k = kit([
    page('page-staff', '/team/author/site-owner', null, ['header']),
    page('page-dana', '/team/author/dana reef', null, ['header'])
  ])
  const map = {
    ...MAP,
    entities: [...MAP.entities, { key: 'user-2', kind: 'user', identity: { name: 'Dana Reef' } }]
  }
  settlePageTitles(k, { map })
  coverageGate(k, { map })
  assert.equal(k.coverage.parts.pageTitleSlots, 1, 'a declared account still owes its title')
  assert.deepEqual(
    k.coverage.failures.filter((f) => f.part === 'pageTitleSlots').map((f) => f.where),
    ['pages[page-dana]']
  )
  assert.deepEqual(
    k.coverage.notForCustomers.map((p) => p.path),
    ['/team/author/site-owner']
  )
})

test('settling the slot roles again counts the same pages out', () => {
  const k = kit([page('page-staff', '/team/author/site-owner', null, ['header'])])
  const r = settleSlotRoles(k, { map: MAP })
  assert.equal(r.pageTitleSlots, 0)
  assert.equal(k.checks.slotCoverage, 0)
  assert.deepEqual(
    k.coverage.notForCustomers.map((p) => p.path),
    ['/team/author/site-owner']
  )
})

test('a path that only looks like an account is a page of the map, and owes its title', () => {
  const map = { ...MAP, pages: [...MAP.pages, { entity: 'menuItem-7', route: 'team/author/site-owner' }] }
  const k = kit([page('page-menu', '/team/author/site-owner', null, ['header'])])
  settlePageTitles(k, { map })
  coverageGate(k, { map })
  assert.equal(k.coverage.parts.pageTitleSlots, 1)
})

// A tag listing: the tags menu page lists the club's tags, and each tag page prints the tag with a mark of the template.
const TAG_MAP = {
  ...MAP,
  slots: [
    ...MAP.slots,
    slot('tag-4.0', 'Squads', { role: 'editorial.heading' }),
    // The same word on a card the tag page lists: another item's words, never the page's title.
    slot('article-5.9', 'Squads', { role: 'editorial.paragraph' })
  ],
  entities: [...MAP.entities, { key: 'tag-4', kind: 'tag', identity: { path: 'squads' } }],
  pages: [
    ...MAP.pages,
    { entity: 'menuItem-12', route: 'club/topics', link: 'index.php?option=com_tags&view=tags' }
  ]
}

test('a page under a tags menu page is owned by the tag its last segment names', () => {
  const idx = indexMap(TAG_MAP)
  assert.equal(ownerOfPath(idx, '/club/topics').owner, null, 'the tags menu page itself lists every tag')
  assert.equal(ownerOfPath(idx, '/club/topics/squads').owner, 'tag-4')
  assert.equal(ownerOfPath(idx, '/club/topics/squads?start=9').owner, 'tag-4')
})

test('a tag page printing its tag with a mark of the template around it is titled by the tag', () => {
  const k = kit([
    {
      id: 'page-club_topics_squads',
      path: '/club/topics/squads',
      blocks: { 1440: ['body-rules'] },
      h1: { via: 'template', text: '#Squads', block: 'body-rules' }
    }
  ])
  k.blocks
    .find((b) => b.id === 'body-rules')
    .slots.push({ id: 'article-5.9', type: 'text', sample: 'Squads' })
  settlePageTitles(k, { map: TAG_MAP })
  assert.equal(k.pages[0].titleSlot, 'tag-4.0', 'the mark is matched on the page entity only, not on a card')
})

const noH1 = (id, path) => ({
  id,
  path,
  blocks: { 1440: ['header'] },
  h1: { via: null, reason: 'the page shows no h1' }
})

test('a missing title explained by its accepted no-h1 gap or a person still counts, but holds the kit no more', () => {
  const k = kit([
    noH1('page-a', '/a'),
    noH1('page-b', '/b'),
    noH1('page-c', '/c'),
    page('page-learn', '/learn-to-swim', 'Learn to Swim', ['body-learn'])
  ])
  const gapAccepts = {
    [gapId('page-without-h1', { pageId: 'page-a' })]: { reason: 'the masthead prints it as h2', by: 'owner' },
    // A gap of another kind on the same page explains nothing.
    [gapId('dead-path', { pageId: 'page-c' })]: { reason: 'unrelated', by: 'owner' }
  }
  const accepts = [
    { check: 'pageTitleSlots', where: 'pages[page-learn]', reason: 'reached by no visitor', by: 'owner' },
    { check: 'pageTitleSlots', where: 'pages[page-gone]', reason: 'stale', by: 'owner' }
  ]
  settlePageTitles(k, { map: MAP })
  coverageGate(k, { map: MAP, gapAccepts, accepts })
  assert.equal(k.coverage.parts.pageTitleSlots, 4, 'every failure is counted')
  assert.deepEqual(
    k.coverage.failures.filter((f) => f.part === 'pageTitleSlots').map((f) => f.where),
    ['pages[page-b]', 'pages[page-c]']
  )
  assert.deepEqual(k.checkAccepts.slotCoverage, [
    { part: 'pageTitleSlots', where: 'pages[page-a]', reason: 'the masthead prints it as h2', by: 'owner' },
    { part: 'pageTitleSlots', where: 'pages[page-learn]', reason: 'reached by no visitor', by: 'owner' }
  ])
  const stale = k.coverage.failures.filter((f) => f.part === 'checkAcceptsUnmatched')
  assert.deepEqual(
    stale.map((f) => [f.check, f.where]),
    [['pageTitleSlots', 'pages[page-gone]']]
  )
  const r = settleSlotRoles(k, { map: MAP, gapAccepts, accepts })
  assert.equal(r.pageTitleSlots, 4)
  assert.equal(r.pageTitlesExplained, 2)
  assert.equal(
    k.coverage.failures.filter((f) => f.part === 'checkAcceptsUnmatched').length,
    1,
    'settling again names the stale entry once'
  )
  assert.equal(k.checkAccepts.slotCoverage.length, 2)
})

test('a page printing its title in two h1 with the same words still has that title; two different h1 stay open', () => {
  const twice = page('page-rules', '/pool-rules', null, ['body-rules'])
  twice.h1 = { via: null, reason: 'the page shows 2 h1', texts: ['Pool Rules', 'POOL RULES'] }
  assert.equal(onePage(twice).pages[0].titleSlot, 'article-5.0')
  const two = page('page-rules', '/pool-rules', null, ['body-rules'])
  two.h1 = { via: null, reason: 'the page shows 2 h1', texts: ['Pool Rules', 'Lane Hire'] }
  assert.equal(onePage(two).pages[0].titleSlot, null)
})

test('two measured H1 fields remain ambiguous', () => {
  const p = page('page-learn', '/learn-to-swim', 'LEARN TO SWIM', ['body-learn'])
  const at = () => ({ controls: [{ page: '/learn-to-swim', tag: 'h1', attribute: 'text', title: true }] })
  const measured = onePage(p, { 'article-3.0': at(), 'article-3.1': at() }).pages[0]
  assert.equal(measured.titleSlot, null)
  assert.deepEqual(measured.titleCandidates, ['article-3.0', 'article-3.1'])
})

test('a title the page reading took from a menu parameter is the slot of that parameter; later pages of a list share it', () => {
  // JA Nova 1.0.12: /tagged-items prints its menu item's page_title, which holds the same words as the item's title,
  // and /tagged-items?start=20 is the second page of that list
  const map = {
    ...MAP,
    slots: [
      ...MAP.slots,
      slot('menuItem-48.0', 'Tagged Items', { column: 'title' }),
      slot('menuItem-48.1', 'Tagged Items', { column: 'params', jsonPath: ['page_title'] })
    ],
    pages: [...MAP.pages, { entity: 'menuItem-48', route: 'tagged-items' }]
  }
  const tagged = (id, path, h1) => ({ id, path, blocks: { 1440: ['header'] }, h1 })
  const k = kit([
    tagged('page-tagged-2', '/tagged-items?start=20', {
      via: 'content-slot',
      slot: 'menuItem-48.0',
      text: 'Tagged Items'
    }),
    tagged('page-tagged', '/tagged-items', { via: 'menu-param', param: 'page_title', text: 'Tagged Items' })
  ])
  settlePageTitles(k, { map })
  assert.deepEqual(
    k.pages.map((p) => [p.path, p.titleSlot, p.titleCandidates]),
    [
      ['/tagged-items?start=20', 'menuItem-48.1', undefined],
      ['/tagged-items', 'menuItem-48.1', undefined]
    ]
  )
  // a parameter the page did not read its title from settles nothing
  const other = kit([
    tagged('page-tagged', '/tagged-items', { via: 'menu-param', param: 'layout_type', text: 'Tagged Items' })
  ])
  settlePageTitles(other, { map })
  assert.equal(other.pages[0].titleSlot, null)
})
