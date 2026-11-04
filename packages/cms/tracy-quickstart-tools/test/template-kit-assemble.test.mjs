// template-kit.json from a fabricated content map and capture index: page groups, blocks in neutral words,
// lists with their minimum and its source, frames, links, template words, demo facts, and every gap in errors.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { imagesDigest } from '../../../../apps/tracy-web/src/lib/template-kit/reader.js'
import { contactSheetPages, sheetCells } from '../template-kit/lib/contact-sheet.mjs'
import { blockIdOf, neutralKey } from '../template-kit/lib/ids.mjs'
import { buildKit } from '../template-kit/lib/kit.mjs'
import { roleOf } from '../template-kit/lib/kit-blocks.mjs'
import { shapeOfBox } from '../template-kit/lib/kit-frames.mjs'
import { itemRows, listingMax } from '../template-kit/lib/listing-rows.mjs'
import { indexMap, ownerOfPath } from '../template-kit/lib/map-index.mjs'
import { layoutCheck, linesOf, matchRepeat, minOfCounts, ruleOneMin } from '../template-kit/lib/rows.mjs'
import { buildStamp, imageChecksums, templateVersionOf } from '../template-kit/lib/stamp.mjs'

const SITE = 'http://site.example'
const assigned = (n, position) => ({ entity: `module-${n}`, position })
const MAP = {
  entities: [
    { key: 'module-10', kind: 'module', identity: { title: 'Hero' } },
    { key: 'module-11', kind: 'module', identity: { title: 'Coaches' } },
    { key: 'article-1', kind: 'article', identity: { alias: 'first-round' } },
    { key: 'article-2', kind: 'article', identity: { alias: 'hidden-draft' } },
    { key: 'category-5', kind: 'category', identity: { path: 'blog' } },
    { key: 'contact-1', kind: 'contact', identity: { alias: 'visit-us' } },
    { key: 'tag-3', kind: 'tag', identity: { path: 'gloves' } },
    { key: 'menuItem-101', kind: 'menuItem', identity: { path: 'home', menutype: 'mainmenu' } },
    { key: 'menuItem-102', kind: 'menuItem', identity: { path: 'blog', menutype: 'mainmenu' } },
    { key: 'menuItem-103', kind: 'menuItem', identity: { path: 'visit', menutype: 'footer' } }
  ],
  slots: [
    {
      key: 'module-10.0',
      entity: 'module-10',
      type: 'text',
      sample: 'Punch above your weight',
      role: 'editorial.heading'
    },
    {
      key: 'module-10.1',
      entity: 'module-10',
      type: 'text',
      sample: 'Book a session',
      role: 'contact.cta_label',
      group: { id: 'module-10.cta.0' }
    },
    {
      key: 'module-10.2',
      entity: 'module-10',
      type: 'url',
      sample: '/visit',
      role: 'contact.cta_url',
      group: { id: 'module-10.cta.0' }
    },
    {
      key: 'module-11.0',
      entity: 'module-11',
      type: 'text',
      sample: 'Alex Example',
      role: 'person.name',
      group: { id: 'module-11.person.0' }
    },
    {
      key: 'module-11.1',
      entity: 'module-11',
      type: 'image',
      sample: 'images/coach-1.jpg',
      role: 'person.image',
      group: { id: 'module-11.person.0' },
      fit: { aspect: 1, minWidth: 400 }
    },
    {
      key: 'module-11.2',
      entity: 'module-11',
      type: 'text',
      sample: 'Sam Sample',
      role: 'person.name',
      group: { id: 'module-11.person.1' }
    },
    {
      key: 'module-11.3',
      entity: 'module-11',
      type: 'image',
      sample: 'images/coach-2.jpg',
      role: 'person.image',
      group: { id: 'module-11.person.1' }
    },
    {
      key: 'siteSetting-1.0',
      entity: 'siteSetting-1',
      type: 'image',
      sample: 'images/logo.svg',
      role: 'business.logo'
    }
  ],
  pages: [
    {
      entity: 'menuItem-101',
      route: 'home',
      link: 'index.php?option=com_content&view=featured',
      assignedModules: [assigned(10, 'hero'), assigned(11, 'section-1')]
    },
    {
      entity: 'menuItem-102',
      route: 'blog',
      link: 'index.php?option=com_content&view=category&layout=blog&id=5',
      assignedModules: []
    },
    {
      entity: 'menuItem-103',
      route: 'visit',
      link: 'index.php?option=com_contact&view=contact&id=1',
      assignedModules: []
    }
  ],
  fitGroups: {
    'module-10.cta': { items: 1 },
    'module-11.person': {
      items: 2,
      min: null,
      minFrom: 'unknown',
      rowKind: 'items',
      source: { kind: 'category', id: 'category-9' },
      shownItems: ['article-3', 'article-4']
    }
  }
}

const row = (left, top) => ({ left, top, width: 100, height: 100 })
const details = (extra = {}) => ({ links: [], texts: [], repeats: [], ...extra })
const CAPTURE = {
  widths: [1440, 390],
  pages: [
    {
      path: '/',
      slug: 'home',
      aliases: ['/old-home'],
      from: ['content-map'],
      widths: {
        1440: { full: 'images/page-home-1440.jpg', blocks: ['header', 'block-10', 'block-11'] },
        390: { full: 'images/page-home-390.jpg', blocks: ['header', 'block-10'] }
      }
    },
    {
      path: '/blog',
      slug: 'blog',
      from: ['content-map'],
      widths: { 1440: { full: 'images/page-blog-1440.jpg', blocks: ['header', 'body-blog'] } }
    },
    {
      path: '/blog?start=3',
      slug: 'blog--start-3',
      from: ['/blog'],
      widths: { 1440: { blocks: ['header'] } }
    },
    {
      path: '/blog/1-first-round',
      slug: 'blog_1-first-round',
      from: ['/blog'],
      widths: { 1440: { blocks: ['header'] } }
    },
    {
      path: '/component/tags/tag/3-gloves',
      slug: 'tag',
      from: ['/blog/1-first-round'],
      widths: { 1440: { blocks: ['header'] } }
    },
    { path: '/visit', slug: 'visit', from: ['/'], widths: { 1440: { blocks: ['header'] } } }
  ],
  blocks: {
    header: {
      id: 'header',
      source: 'header',
      kind: 'template-header',
      widths: {
        1440: {
          pages: ['home', 'blog'],
          image: 'images/header-1440.jpg',
          details: details({ links: [{ label: 'Blog', href: 'http://studio.example.test/index.php/blog' }] })
        }
      }
    },
    'block-10': {
      id: 'block-10',
      source: 'module-10',
      kind: 'module',
      widths: {
        1440: {
          pages: ['home'],
          image: 'images/block-10-1440.jpg',
          details: details({
            links: [
              { label: 'Book a session', href: '/index.php/visit' },
              { label: 'Read more', href: 'https://elsewhere.example/x' }
            ],
            texts: ['Punch above your weight', 'Book a session', 'Read more', '2026']
          })
        },
        390: { pages: ['home'], image: 'images/block-10-390.jpg' }
      }
    },
    'block-11': {
      id: 'block-11',
      source: 'module-11',
      kind: 'module',
      widths: {
        1440: {
          pages: ['home'],
          image: 'images/block-11-1440.jpg',
          details: details({
            repeats: [
              { path: [0, 1], shape: 'DIV.card', count: 2, firstLine: 2, inSlider: false, inTabs: false }
            ]
          })
        },
        390: { pages: [], hiddenOn: ['home'] }
      }
    },
    'block-12': {
      id: 'block-12',
      source: 'module-12',
      kind: 'module',
      offCanvas: true,
      widths: { 1440: { pages: [], hiddenOn: ['home'] } }
    },
    'body-blog': {
      id: 'body-blog',
      source: 'main-body',
      kind: 'component',
      widths: { 1440: { pages: ['blog'], image: 'images/body-blog-1440.jpg', details: details() } }
    }
  },
  dead: [{ path: '/about', status: 404, from: ['content-map'] }],
  failures: []
}
const STAMP = {
  tool: 'test',
  contract: 'demo/j6/1.0.0',
  template: { name: 'demo', version: '2.0.0' },
  quickstart: { version: '1.0.0' },
  images: {
    files: [{ file: 'header-1440.jpg', sha256: 'a'.repeat(64), bytes: 3 }]
  }
}
const kitOf = (extra = {}) =>
  buildKit({
    map: MAP,
    capture: CAPTURE,
    stamp: STAMP,
    siteUrl: SITE,
    aliasHosts: ['studio.example.test'],
    ...extra
  })

test('neutral ids never carry the CMS word', () => {
  assert.equal(neutralKey('module-163.4'), 'block-163.4')
  assert.equal(blockIdOf('module-7', 'home'), 'block-7')
  assert.equal(blockIdOf('main-body', 'blog'), 'body-blog')
  const json = JSON.stringify({ ...kitOf(), blocks: kitOf().blocks.map(({ source: _source, ...b }) => b) })
  assert.doesNotMatch(json, /module/i)
})

test('the kit keeps the top-level keys Road to live reads', () => {
  const kit = kitOf()
  for (const k of ['template', 'quickstart', 'images', 'pages', 'errors', 'approval']) assert.ok(k in kit, k)
  assert.equal(kit.approval, null)
  assert.deepEqual(kit.images, [
    { id: 'header-1440', path: 'images/header-1440.jpg', sha256: 'a'.repeat(64), bytes: 3 }
  ])
  assert.equal(kit.imagesSha256, imagesDigest(kit.images))
})

test('pages carry their group, main-menu place, blocks per width and overview images', () => {
  const kit = kitOf()
  const home = kit.pages.find((p) => p.id === 'page-home')
  assert.equal(home.inMainMenu, true)
  assert.deepEqual(home.blocks, { 1440: ['header', 'block-10', 'block-11'], 390: ['header', 'block-10'] })
  assert.deepEqual(home.images, { 1440: 'page-home-1440', 390: 'page-home-390' })
  assert.equal(kit.pages.find((p) => p.id === 'page-visit').inMainMenu, false)
  const blog = kit.pageGroups.find((g) => g.root === 'page-blog')
  assert.deepEqual(blog.children.sort(), ['page-blog--start-3', 'page-blog_1-first-round', 'page-tag'])
  assert.equal(kit.pages.find((p) => p.id === 'page-tag').group, blog.id)
})

test('blocks: role, shared, lists with min sources, frames, links, template words and demo facts', () => {
  const kit = kitOf()
  const by = Object.fromEntries(kit.blocks.map((b) => [b.id, b]))
  assert.equal(by.header.role, 'header')
  assert.equal(by.header.shared, true)
  assert.deepEqual(by.header.links, [{ id: 'header.link-1', position: 0, label: 'Blog', target: '/blog' }])
  assert.equal(by['block-10'].role, 'hero')
  assert.deepEqual(by['block-10'].links, [
    { id: 'block-10.2', position: 0, label: 'Book a session', target: '/visit' },
    { id: 'block-10.link-2', position: 1, label: 'Read more', target: 'https://elsewhere.example/x' }
  ])
  assert.deepEqual(by['block-10'].fixedText, [{ text: 'Read more', source: null }])
  const people = by['block-11'].lists.find((l) => l.id === 'block-11.person')
  assert.deepEqual(
    [people.rowKind, people.source, people.shownItems],
    ['items', { kind: 'category', id: 'category-9' }, ['article-3', 'article-4']],
    'what the content map says of a list is carried as it is'
  )
  // A row template's text slot says its paragraphs and bullets like any text slot (coverage gate).
  assert.deepEqual(by['block-10'].lists[0], {
    id: 'block-10.cta',
    rowKind: 'slots',
    min: 1,
    max: 1,
    rowSlots: [
      {
        id: 'block-10.1',
        role: 'contact.cta_label',
        type: 'text',
        paragraphs: 1,
        bullets: 0,
        formatFrom: 'page',
        sample: 'Book a session'
      },
      { id: 'block-10.2', role: 'contact.cta_url', type: 'url' }
    ],
    minSource: 'row-count'
  })
  assert.deepEqual(
    by['block-10'].demoOwned.map((d) => d.id),
    ['block-10.1', 'block-10.2']
  )
  const coaches = by['block-11'].lists[0]
  assert.equal(coaches.min, 2)
  assert.equal(coaches.minSource, 'row-count')
  // No frame evidence: every measured field is null and named in errors, never taken from the map.
  const frame = by['block-11'].frames[0]
  assert.equal(frame.id, 'block-11.1')
  assert.deepEqual([frame.kind, frame.width, frame.canHide, frame.shape], [null, null, null, null])
  assert.ok(kit.errors.some((e) => e.field === 'blocks[block-11].frames[block-11.1].kind'))
  assert.ok(!kit.errors.some((e) => /minWidth/.test(e.field ?? '')))
  assert.deepEqual(by['block-11'].visibleAt, ['1440'])
  assert.equal(by['block-12'].role, 'mobile-menu')
  assert.deepEqual(by['block-12'].images, {})
  const body = by['body-blog']
  assert.equal(body.role, 'page-body')
  assert.equal(body.source.owner, 'category-5')
  assert.equal(body.lists[0].rowKind, 'items')
  assert.ok(kit.errors.some((e) => e.field === 'blocks[body-blog].lists[body-blog.items].min'))
})

test('a measured minimum wins over the row count, with its evidence', () => {
  const minEvidence = {
    'block-11.person': {
      min: 1,
      max: 2,
      okCounts: [1, 2],
      images: { 1: { 1440: 'images/block-11.person-min-1-1440.jpg' } },
      checks: { 1: { 1440: { ok: true, reason: 'the last line is centered' } } },
      faithfulness: 'columns come from a setting'
    }
  }
  const list = kitOf({ minEvidence }).blocks.find((b) => b.id === 'block-11').lists[0]
  assert.equal(list.min, 1)
  assert.equal(list.minSource, 'measured')
  assert.deepEqual(list.minEvidence.layoutOkAt, [1, 2])
  assert.equal(list.minEvidence.layoutOkContiguous, true)
  assert.equal(list.minEvidence.checks[1][1440], 'the last line is centered')
  // Evidence stored under an older rule (min 8) is read again under the current one.
  const gappy = { 'block-11.person': { min: 8, max: 8, okCounts: [4, 8], images: {}, checks: {} } }
  const again = kitOf({ minEvidence: gappy }).blocks.find((b) => b.id === 'block-11').lists[0]
  assert.equal(again.min, 4)
  assert.equal(again.minEvidence.layoutOkContiguous, false)
})

test('the measured minimum is the smallest count that looks right, gaps reported', () => {
  assert.deepEqual(minOfCounts([4, 8], 8), { min: 4, layoutOkContiguous: false })
  assert.deepEqual(minOfCounts([2, 3, 4], 4), { min: 2, layoutOkContiguous: true })
  assert.deepEqual(minOfCounts([4], 4), { min: 4, layoutOkContiguous: true })
  assert.deepEqual(minOfCounts([], 4), { min: null, layoutOkContiguous: false })
})

test('a block that holds other blocks (tabs) carries their lists', () => {
  const capture = {
    ...CAPTURE,
    blocks: {
      tabs: {
        id: 'block-30',
        source: 'module-30',
        kind: 'module',
        contains: ['module-11'],
        widths: { 1440: { pages: ['home'], image: 'x', details: details() } }
      }
    }
  }
  const block = buildKit({ map: MAP, capture, stamp: STAMP, siteUrl: SITE }).blocks[0]
  assert.deepEqual(
    block.lists.map((l) => l.id),
    ['block-11.person']
  )
  assert.deepEqual(block.source.contains, ['module-11'])
})

test('dead paths and content no link leads to are errors', () => {
  const kit = kitOf()
  assert.deepEqual(
    kit.errors.find((e) => e.kind === 'dead-path'),
    { kind: 'dead-path', path: '/about', status: 404, linkedFrom: ['content-map'] }
  )
  assert.deepEqual(kit.errors.find((e) => e.kind === 'unreached-content').items, ['article-2'])
})

test('rows: lines, layout check, matching and the rule-one minimum', () => {
  assert.equal(linesOf([row(0, 0), row(120, 2), row(0, 200)]).length, 2)
  const container = { left: 0, top: 0, width: 400, height: 400 }
  assert.equal(layoutCheck([row(0, 0), row(100, 0), row(200, 0), row(300, 0)], container).ok, true)
  assert.equal(layoutCheck([row(150, 0)], container).ok, true, 'one row centered')
  assert.equal(
    layoutCheck([row(0, 0), row(100, 0), row(200, 0), row(300, 0), row(0, 120)], container).ok,
    false
  )
  assert.equal(layoutCheck([row(0, 0), row(200, 0), row(100, 120)], { left: 0, width: 300 }).ok, true)
  const sets = [
    { path: [0], count: 3, firstLine: 3 },
    { path: [1], count: 3, firstLine: 1, inSlider: true }
  ]
  const used = new Set()
  assert.equal(matchRepeat(sets, 3, used).path[0], 0)
  assert.equal(matchRepeat(sets, 3, used).path[0], 1)
  assert.equal(matchRepeat(sets, 3, used), null)
  assert.deepEqual(ruleOneMin(sets[1], 3), { min: 1, minSource: 'slider-or-tab' })
  assert.deepEqual(ruleOneMin(sets[0], 3), { min: 3, minSource: 'row-count' })
  assert.deepEqual(ruleOneMin(null, 1), { min: 1, minSource: 'row-count' })
  assert.equal(ruleOneMin(null, 4), null)
})

test('owners, roles and shapes', () => {
  const idx = indexMap(MAP)
  assert.deepEqual(ownerOfPath(idx, '/blog?start=3'), {
    owner: 'category-5',
    kind: 'category listing (list position 3)'
  })
  assert.deepEqual(ownerOfPath(idx, '/component/tags/tag/3-gloves'), { owner: 'tag-3', kind: 'tag listing' })
  assert.equal(ownerOfPath(idx, '/blog/author/alex').owner, null)
  // A category view of another component (a category of news feeds) is not a category of content items.
  const feeds = indexMap({
    ...MAP,
    pages: [
      ...(MAP.pages ?? []),
      { route: 'feeds', link: 'index.php?option=com_newsfeeds&view=category&id=5' }
    ]
  })
  assert.deepEqual(ownerOfPath(feeds, '/feeds'), { owner: null, kind: 'newsfeeds category' })
  assert.equal(roleOf({ id: 'x', kind: 'module' }, 'footnav-2'), 'footer')
  assert.equal(shapeOfBox(160, 100).name, 'landscape')
  assert.equal(shapeOfBox(50, 100).name, 'portrait')
  assert.equal(shapeOfBox(undefined, 100), null)
})

test('stamp: template version from templateDetails.xml and image checksums', () => {
  assert.equal(
    templateVersionOf('<extension type="template"><version> 2.3.4 </version></extension>'),
    '2.3.4'
  )
  const dir = mkdtempSync(join(tmpdir(), 'kit-stamp-'))
  try {
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'a-1440.jpg'), 'one')
    writeFileSync(join(dir, 'notes.txt'), 'ignored')
    const images = imageChecksums(dir)
    assert.deepEqual(images, [
      {
        file: 'sub/a-1440.jpg',
        bytes: 3,
        sha256: '7692c3ad3540bb803c020b3aee66cd8887123234ea0c6e7143c0add73ff431ed'
      }
    ])
    const stamp = buildStamp({
      manifest: { id: 'x', template: 't', quickstart: { version: '1.0.0' } },
      templateVersion: '2.3.4',
      templateVersionFrom: 'site',
      images,
      tool: 'test'
    })
    assert.equal(stamp.quickstart.version, '1.0.0')
    assert.equal(stamp.images.count, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('contact sheet: every block image once per width', () => {
  const kit = kitOf({
    minEvidence: {
      'block-11.person': {
        min: 1,
        max: 2,
        okCounts: [1],
        images: { 1: { 1440: 'images/e.jpg' } },
        checks: {}
      }
    }
  })
  const cells = sheetCells(kit)
  assert.deepEqual(
    cells.map((c) => `${c.label}:${c.width}`),
    ['header:1440', 'block-10:1440', 'block-10:390', 'block-11:1440', 'body-blog:1440']
  )
  assert.equal(cells[1].file, 'block-10-1440', 'an id without a listed image stays as it is')
  const pages = contactSheetPages(cells, { title: 'Kit <demo>', perPage: 3 })
  assert.equal(pages.length, 2)
  assert.match(pages[0], /Kit &lt;demo&gt;/)
})

test('a listing max is its page size from the pager, else the item rows the demo shows', () => {
  const item = (p) => p.startsWith('/news/')
  const at = (...paths) => paths.map((p) => `${SITE}${p}`)
  const repeats = [
    {
      path: [0, 1],
      shape: 'LI.page-item',
      count: 3,
      rowLinks: at('/news', '/news?start=4', '/news?start=8')
    },
    { path: [0, 0], shape: 'DIV.card', count: 4, rowLinks: at('/news/a', '/news/b', '/news/c', '/news/d') },
    { path: [0, 2], shape: 'LI.more', count: 2, rowLinks: at('/news/e', '/news/f') },
    { path: [0, 3], shape: 'DIV.tag', count: 2, rowLinks: at('/news/a', '/news/a') }
  ]
  assert.equal(itemRows(repeats, { isItemPage: item, siteUrl: SITE }).shape, 'DIV.card')
  const opts = { repeats, isItemPage: item, siteUrl: SITE }
  assert.deepEqual(
    listingMax({ ...opts, path: '/news', pagePaths: ['/news', '/news?start=4', '/news?start=8'] }),
    {
      max: 4,
      maxSource: 'page-size',
      maxEvidence: { nextPage: '/news?start=4', rowsShown: 4, rows: { path: [0, 0], shape: 'DIV.card' } }
    }
  )
  assert.equal(
    listingMax({ ...opts, path: '/news?start=8', pagePaths: ['/news', '/news?start=4', '/news?start=8'] })
      .max,
    4
  )
  assert.deepEqual(listingMax({ ...opts, path: '/news', pagePaths: ['/news'] }).maxSource, 'captured-rows')
  assert.equal(listingMax({ ...opts, repeats: [], path: '/news', pagePaths: ['/news'] }), null)
})

test('rows of uneven shapes with no row set to measure take the demo count as their minimum, said as not measured', () => {
  const map = structuredClone(MAP)
  const capture = structuredClone(CAPTURE)
  capture.blocks['block-11'].widths[1440].details.repeats = []
  const list = (m) =>
    buildKit({ map: m, capture, stamp: STAMP, siteUrl: SITE, aliasHosts: [] }).blocks.find(
      (b) => b.id === 'block-11'
    )
  // Even rows that were not found stay an error: their minimum can still be measured.
  const even = buildKit({ map, capture, stamp: STAMP, siteUrl: SITE, aliasHosts: [] })
  assert.ok(even.errors.some((e) => e.field === 'blocks[block-11].lists[block-11.person].min'))
  map.fitGroups['module-11.person'].uniform = false
  const masonry = list(map).lists.find((l) => l.id === 'block-11.person')
  assert.deepEqual([masonry.min, masonry.minSource], [2, 'demo count (not measured)'])
  const kit = buildKit({ map, capture, stamp: STAMP, siteUrl: SITE, aliasHosts: [] })
  assert.ok(!kit.errors.some((e) => e.field === 'blocks[block-11].lists[block-11.person].min'))
})
