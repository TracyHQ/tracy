// Template kit, EmDash: which fields a block holds comes from the content API, not from the words a page shows. The
// theme stamps the entry field each element prints (`data-tracy-src`, read on a page fetched with
// `X-Tracy-Preview: pick`): a stamp on one repeater cell places every row of that field in the block, every field a
// block's stamps place is listed in it whether the read pass saw it or not (a closed tab), each repeater is a list
// whose rows are the stored rows, another block's words never become this block's field, and a part is found again on
// the page the kit captures (no stamps, no page owner element). No browser, no site: made-up data only.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { parseHTML } from 'linkedom'

import { useEmdashSections } from '../template-kit/lib/contract-read.mjs'
import { buildBlock } from '../template-kit/lib/kit-blocks.mjs'
import { indexMap } from '../template-kit/lib/map-index.mjs'
import { orphanTextChecks, settleForeignTexts } from '../template-kit/lib/orphan-text.mjs'
import { sampleIndex } from '../template-kit/lib/sample-index.mjs'
import { assignSlotOwners, slotOwnerChecks } from '../template-kit/lib/slot-owners.mjs'
import { rootField, withEmdashPages } from '../template-kit/lib/site/adapters/emdash-map.mjs'
import {
  EMDASH_SECTIONS_FILE,
  EMDASH_SECTIONS_READER,
  settleEmdashSections
} from '../template-kit/lib/site/emdash-sections-file.mjs'
import { readEmdashSections } from '../template-kit/lib/site/read-emdash-sections.js'

const text = (key, sample, role, extra = {}) => slotOf(key, 'text', sample, role, extra)
const slotOf = (key, type, sample, role, extra = {}) => {
  const [collection, entry, ...rest] = key.split('.')
  const path = rest.join('.')
  const row = /^([a-z_]+)\[(\d+)\]\.([a-z_]+)$/.exec(path)
  return {
    key,
    entity: `${collection}.${entry}`,
    target: row
      ? { collection, entry, field: row[1], item: Number(row[2]), sub: row[3] }
      : { collection, entry, field: path },
    type,
    sample,
    role,
    ...extra
  }
}
const group = (id, item, kind) => ({ group: { id, item, kind } })

const MAP = {
  schemaVersion: 'tracy-quickstart-content-map/emdash/v1',
  template: 'tracy-cafe',
  version: '0.3.0',
  entities: [
    { key: 'pages.home', kind: 'entry', identity: { collection: 'pages', slug: 'home' } },
    { key: 'features.visit', kind: 'entry', identity: { collection: 'features', slug: 'visit' } },
    { key: 'menu.food', kind: 'entry', identity: { collection: 'menu', slug: 'food' } },
    { key: 'menu.drinks', kind: 'entry', identity: { collection: 'menu', slug: 'drinks' } },
    { key: 'chrome.chrome', kind: 'entry', identity: { collection: 'chrome', slug: 'chrome' } }
  ],
  pages: [{ entity: 'pages.home', route: '/', openAs: '/', title: 'Home', view: 'front-page' }],
  slots: [
    text('pages.home.title', 'Home', 'editorial.heading'),
    text('features.visit.title', 'Visit us.', 'editorial.heading'),
    text('features.visit.items[0].title', 'Address.', 'editorial.label'),
    text(
      'features.visit.items[0].text',
      '1 Harbour Road',
      'contact.address',
      group('features.visit.contact.0', 0, 'contact')
    ),
    slotOf('features.visit.items[0].photo', 'image', 'a.jpg', 'editorial.illustration'),
    text('features.visit.items[1].title', 'Hours.', 'editorial.label'),
    text(
      'features.visit.items[1].text',
      'Daily 8-4',
      'contact.hours',
      group('features.visit.contact.0', 0, 'contact')
    ),
    slotOf('features.visit.items[1].photo', 'image', 'b.jpg', 'editorial.illustration'),
    text('menu.food.title', 'Food', 'editorial.menu_label'),
    text('menu.food.items[0].name', 'Soup', 'offering.name', group('menu.food.items.0', 0, 'menu_item')),
    text('menu.food.items[1].name', 'Stew', 'offering.name', group('menu.food.items.1', 1, 'menu_item')),
    text('menu.drinks.title', 'Drinks', 'editorial.menu_label'),
    text('menu.drinks.items[0].name', 'Tea', 'offering.name', group('menu.drinks.items.0', 0, 'menu_item')),
    text(
      'menu.drinks.items[1].name',
      'Coffee',
      'offering.name',
      group('menu.drinks.items.1', 1, 'menu_item')
    ),
    text('chrome.chrome.address_title', 'Address', 'editorial.label'),
    text('chrome.chrome.copyright', 'All rights kept', 'editorial.legal')
  ],
  fitGroups: {
    'features.visit.contact': {
      items: 1,
      shown: 1,
      uniform: true,
      min: null,
      minFrom: 'unknown',
      max: 1,
      maxFrom: 'demo-count'
    },
    'menu.food.items': {
      items: 2,
      shown: 2,
      uniform: true,
      min: null,
      minFrom: 'unknown',
      max: 2,
      maxFrom: 'demo-count'
    },
    'menu.drinks.items': {
      items: 2,
      shown: 2,
      uniform: true,
      min: null,
      minFrom: 'unknown',
      max: 2,
      maxFrom: 'demo-count'
    }
  }
}

const stamp = (collection, slug, field, kind = 'field') => ({ collection, slug, kind, field })
const part = (selector, classes, stamps, extra = {}) => ({
  selector,
  tag: 'section',
  classes,
  height: 400,
  hasHeaderTag: false,
  isFooter: false,
  shown: true,
  headings: [],
  stamps,
  ...extra
})
// The page as the stamped read saw it: the cells of a repeater are stamped with their row, as the views print them
// (`$s(\`items[${i}].title\`)`), and the closed tab's rows are in the page (stamped) though not shown.
const SECTIONS = {
  '/': {
    before: [],
    main: [
      part(
        'body > div > main#main > section:nth-of-type(1)',
        ['cf-section'],
        [
          stamp('features', 'visit', 'title'),
          stamp('features', 'visit', 'items[0].title'),
          stamp('features', 'visit', 'items[0].text'),
          stamp('features', 'visit', 'items[0].photo'),
          stamp('features', 'visit', 'items[1].title'),
          stamp('features', 'visit', 'items[1].text'),
          stamp('features', 'visit', 'items[1].photo')
        ]
      ),
      part(
        'body > div > main#main > section:nth-of-type(2)',
        ['cf-section'],
        [
          stamp('menu', 'food', 'title'),
          stamp('menu', 'food', 'items[0].name'),
          stamp('menu', 'food', 'items[1].name'),
          stamp('menu', 'drinks', 'title'),
          stamp('menu', 'drinks', 'items[0].name'),
          stamp('menu', 'drinks', 'items[1].name')
        ]
      )
    ],
    after: [
      part(
        'body > div > footer.cf-footer',
        ['cf-footer'],
        [stamp('chrome', 'chrome', 'address_title'), stamp('chrome', 'chrome', 'copyright')],
        { tag: 'footer', isFooter: true }
      )
    ]
  }
}

const placedMap = () => withEmdashPages(MAP, SECTIONS)
const recOf = (id, texts) => ({
  id,
  source: id,
  widths: { 1440: { pages: ['home'], details: { texts, links: [], repeats: [] } } }
})
const build = (map, rec, errors = []) =>
  buildBlock({
    rec,
    entity: rec.source,
    idx: indexMap(map),
    samples: sampleIndex(map),
    errors,
    minEvidence: {},
    siteUrl: 'http://site.example',
    aliasHosts: [],
    widths: ['1440']
  })
const ids = (rows) => rows.map((s) => s.id)

test('a stamp names its stored field whatever the row or block part it carries', () => {
  assert.equal(rootField('items[0].title'), 'items')
  assert.equal(rootField('items.title'), 'items')
  assert.equal(rootField('items'), 'items')
  assert.equal(rootField('footer_contact[2].value'), 'footer_contact')
  assert.equal(rootField('description.k3f9a'), 'description')
  assert.equal(rootField('title'), 'title')
})

test('a stamp on one cell of a repeater places every row of that field in the block that prints it', () => {
  const map = withEmdashPages(
    {
      ...MAP,
      // A third drink the demo stores but the page does not print: still a row of the block that prints the field.
      slots: [...MAP.slots, text('menu.drinks.items[2].name', 'Juice', 'offering.name')]
    },
    SECTIONS
  )
  const owner = Object.fromEntries(map.slots.map((s) => [s.key, s]))
  assert.equal(owner['features.visit.items[0].text'].entity, 'block-features-visit')
  assert.equal(owner['features.visit.items[1].photo'].entity, 'block-features-visit')
  assert.equal(owner['menu.drinks.items[1].name'].entity, owner['menu.food.title'].entity)
  assert.equal(
    owner['menu.drinks.items[2].name'].entity,
    owner['menu.food.title'].entity,
    'an unprinted row too'
  )
  assert.equal(
    owner['menu.drinks.items[2].name'].mapEntity,
    'menu.drinks',
    'the entry it is a field of is kept'
  )
  assert.equal(owner['menu.drinks.items[2].name'].placedBy, 'stamp')
  assert.equal(owner['chrome.chrome.address_title'].entity, 'footer')
  assert.equal(owner['pages.home.title'].entity, 'pages.home', 'a field no stamp names stays with its entry')
  assert.equal(owner['pages.home.title'].placedBy, undefined)
})

test('a block lists every field its stamps place, shown at the read width or not, and each repeater as a list', () => {
  const map = placedMap()
  const tabs = map.slots.find((s) => s.key === 'menu.food.title').entity
  const errors = []
  // The drinks tab is closed: the read pass saw only the food tab's words.
  const b = build(map, recOf(tabs, ['Food', 'Drinks', 'Soup', 'Stew']), errors)
  assert.deepEqual(ids(b.slots), ['menu.food.title', 'menu.drinks.title'])
  assert.deepEqual(
    b.lists.map((l) => [l.id, l.rowsFrom, l.max, l.rows.map((r) => ids(r.slots))]),
    [
      ['menu.food.items', 'repeater', 2, [['menu.food.items[0].name'], ['menu.food.items[1].name']]],
      ['menu.drinks.items', 'repeater', 2, [['menu.drinks.items[0].name'], ['menu.drinks.items[1].name']]]
    ]
  )
  assert.equal(b.lists[1].whenFewer, undefined)
  assert.equal(b.lists[0].maxFrom, 'demo-count', "the map's group of the same name gives the bounds")
  assert.ok(
    errors.some((e) => e.field === `blocks[${tabs}].lists[menu.drinks.items].min`),
    'a list with no measured minimum says so'
  )
})

test("a repeater's rows are the unit: a map group whose every slot sits in those rows adds no list", () => {
  const map = placedMap()
  const b = build(
    map,
    recOf('block-features-visit', ['Visit us.', 'Address.', '1 Harbour Road', 'Hours.', 'Daily 8-4'])
  )
  assert.deepEqual(
    b.lists.map((l) => [l.id, l.rows.map((r) => ids(r.slots))]),
    [
      [
        'features.visit.items',
        [
          ['features.visit.items[0].title', 'features.visit.items[0].text', 'features.visit.items[0].photo'],
          ['features.visit.items[1].title', 'features.visit.items[1].text', 'features.visit.items[1].photo']
        ]
      ]
    ]
  )
  assert.equal(b.lists[0].max, 2, 'a repeater the map gives no bounds is bounded by its stored rows')
  assert.deepEqual(ids(b.frames), ['features.visit.items[0].photo', 'features.visit.items[1].photo'])
  assert.deepEqual(ids(b.slots), ['features.visit.title'])
})

test("another block's words are never this block's field: the footer's \"Address.\" is its own stamped label", () => {
  const map = placedMap()
  const tabs = map.slots.find((s) => s.key === 'menu.food.title').entity
  const blocks = [
    build(
      map,
      recOf('block-features-visit', ['Visit us.', 'Address.', '1 Harbour Road', 'Hours.', 'Daily 8-4'])
    ),
    build(map, recOf(tabs, ['Food', 'Drinks', 'Soup', 'Stew'])),
    // The theme prints the chrome label with a full stop after it ("Address" + "."), the same words as a stored row.
    build(map, recOf('footer', ['Address.', 'All rights kept']))
  ]
  const footer = blocks[2]
  assert.deepEqual(ids(footer.slots), ['chrome.chrome.copyright', 'chrome.chrome.address_title'])
  settleForeignTexts(blocks)
  const bySlot = new Map(map.slots.map((s) => [s.key, s]))
  assignSlotOwners({
    blocks,
    slotOf: (id) => bySlot.get(id) ?? null,
    textsOf: (id) => (id === 'footer' ? 'address. | all rights kept' : '')
  })
  assert.ok(!footer.slots.some((s) => s.id === 'features.visit.items[0].title'))
  assert.equal(slotOwnerChecks({ blocks, errors: [] }), 0, 'no slot is listed by two blocks')
  assert.equal(orphanTextChecks({ blocks, errors: [] }), 0, 'every shown word comes from a declared slot')
})

test('a stamped slot stays with its block when only another block shows its words; without a stamp the shown one wins', () => {
  const blocks = () => [
    { id: 'block-a', source: { entity: 'block-a' }, slots: [{ id: 's.one.title' }], lists: [], frames: [] },
    { id: 'block-b', source: { entity: 'block-b' }, slots: [{ id: 's.one.title' }], lists: [], frames: [] }
  ]
  const textsOf = (id) => (id === 'block-b' ? 'two words' : '')
  const stamped = blocks()
  assignSlotOwners({
    blocks: stamped,
    slotOf: () => ({ entity: 'block-a', sample: 'Two words', placedBy: 'stamp' }),
    textsOf
  })
  assert.deepEqual(
    stamped.map((b) => ids(b.slots)),
    [['s.one.title'], []]
  )
  const unstamped = blocks()
  assignSlotOwners({ blocks: unstamped, slotOf: () => ({ entity: 'block-a', sample: 'Two words' }), textsOf })
  assert.deepEqual(
    unstamped.map((b) => ids(b.slots)),
    [[], ['s.one.title']]
  )
})

test('a block of a platform that places no slot by stamp keeps its lists from its own groups only', () => {
  // A Joomla-shaped map: no `mapEntity`, no `placedBy`, no stored repeater rows.
  const map = {
    entities: [{ key: 'module-7', kind: 'module', identity: {} }],
    pages: [],
    slots: [
      {
        key: 'module-7.0',
        entity: 'module-7',
        type: 'text',
        sample: 'One',
        role: 'offering.name',
        group: { id: 'module-7.dish.0', item: 0 }
      },
      {
        key: 'module-7.1',
        entity: 'module-7',
        type: 'text',
        sample: 'Two',
        role: 'offering.name',
        group: { id: 'module-7.dish.1', item: 1 }
      },
      {
        key: 'module-7.2',
        entity: 'module-7',
        type: 'text',
        sample: 'Hidden words',
        role: 'editorial.paragraph'
      }
    ],
    fitGroups: { 'module-7.dish': { items: 2, max: 2 }, 'module-8.dish': { items: 1, max: 1 } }
  }
  const b = buildBlock({
    rec: {
      id: 'block-7',
      source: 'module-7',
      widths: { 1440: { pages: ['home'], details: { texts: ['One', 'Two'], links: [], repeats: [] } } }
    },
    entity: 'module-7',
    idx: indexMap(map),
    samples: sampleIndex(map),
    errors: [],
    minEvidence: {},
    siteUrl: 'http://site.example',
    aliasHosts: [],
    widths: ['1440']
  })
  assert.deepEqual(
    b.lists.map((l) => [l.id, l.rowsFrom, l.rows.length]),
    [['block-7.dish', undefined, 2]]
  )
  assert.deepEqual(b.slots, [], 'a slot it does not show is not listed')
})

/** Run the in-page reader on `html` with a DOM that has no layout: every element has a size and is displayed. */
function readOn(html) {
  const win = parseHTML(html)
  const saved = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle }
  const proto = win.HTMLElement.prototype
  const rect = proto.getBoundingClientRect
  globalThis.document = win.document
  globalThis.getComputedStyle = () => ({ display: 'block' })
  proto.getBoundingClientRect = () => ({ width: 100, height: 40, left: 0, top: 0 })
  try {
    return readEmdashSections()
  } finally {
    proto.getBoundingClientRect = rect
    globalThis.document = saved.document
    globalThis.getComputedStyle = saved.getComputedStyle
  }
}

test('a section read on the stamped page is found again on the page the kit captures, without the page owner', () => {
  const page = (stamped) => {
    const src = (v) => (stamped ? ` data-tracy-src="${v}"` : '')
    return `<html><body><div class="cf-page">
      <nav class="cf-nav"><a href="/">Home</a></nav>
      <main id="main">
        ${stamped ? '<template data-tracy-owner="emdash:pages:01H:home"></template>' : ''}
        <section class="cf-section"><h2${src('emdash:features:01V:visit field:title')}>Visit us.</h2></section>
        <section class="cf-section"><h2${src('emdash:menu:01F:food field:title')}>Food</h2></section>
        <section class="cf-section"><h2>News</h2></section>
        <section class="cf-chef"><h2>Chef</h2></section>
      </main>
      <footer class="cf-footer"><h3${src('emdash:chrome:01C:chrome field:address_title')}>Address.</h3></footer>
    </div></body></html>`
  }
  const read = readOn(page(true))
  assert.deepEqual(
    read.main.map((p) => p.headings[0]),
    ['Visit us.', 'Food', 'News', 'Chef']
  )
  assert.deepEqual(read.main[0].stamps, [
    { collection: 'features', slug: 'visit', kind: 'field', field: 'title' }
  ])
  const { document } = parseHTML(page(false))
  for (const p of [...read.before, ...read.main, ...read.after]) {
    assert.doesNotMatch(p.selector, /:nth-child\(/)
    const found = document.querySelectorAll(p.selector)
    assert.equal(found.length, 1, p.selector)
    const heading = found[0].querySelector('h2, h3, a')?.textContent
    assert.equal(heading, p.headings[0] ?? 'Home', `${p.selector} finds the part it was read from`)
  }
})

test('a sections file an older reader wrote is named stale when no browser can read it again', async () => {
  const out = mkdtempSync(join(tmpdir(), 'kit-emdash-sections-'))
  const settle = () => settleEmdashSections({ platform: 'emdash', out, map: MAP, chromium: null })
  try {
    writeFileSync(
      join(out, EMDASH_SECTIONS_FILE),
      JSON.stringify({ pages: SECTIONS, failures: [], media: null })
    )
    assert.deepEqual(await settle(), { pages: 1, from: EMDASH_SECTIONS_FILE, stale: true })
    writeFileSync(
      join(out, EMDASH_SECTIONS_FILE),
      JSON.stringify({ reader: EMDASH_SECTIONS_READER, pages: SECTIONS, failures: [], media: null })
    )
    assert.deepEqual(await settle(), { pages: 1, from: EMDASH_SECTIONS_FILE })
  } finally {
    useEmdashSections(null)
    rmSync(out, { recursive: true, force: true })
  }
})

test('a build with a site reads a stale sections file again, with the pick header, and stamps the reader', async () => {
  const out = mkdtempSync(join(tmpdir(), 'kit-emdash-sections-'))
  const asked = []
  // A stand-in for Playwright's chromium: every page answers 200 and reads as the fixture's home page.
  const page = {
    setExtraHTTPHeaders: async (h) => asked.push(h),
    goto: async () => ({ status: () => 200 }),
    waitForLoadState: async () => {},
    evaluate: async () => SECTIONS['/'],
    close: async () => {}
  }
  const browser = {
    newContext: async () => ({ route: async () => {}, newPage: async () => page }),
    close: async () => {}
  }
  try {
    writeFileSync(
      join(out, EMDASH_SECTIONS_FILE),
      JSON.stringify({ pages: SECTIONS, failures: [], media: null })
    )
    const r = await settleEmdashSections({
      platform: 'emdash',
      out,
      map: MAP,
      siteUrl: 'http://127.0.0.1:4361',
      chromium: { launch: async () => browser }
    })
    assert.deepEqual(r, { pages: 1, from: 'site' })
    assert.deepEqual(asked, [{ 'X-Tracy-Preview': 'pick' }])
    const written = JSON.parse(readFileSync(join(out, EMDASH_SECTIONS_FILE), 'utf8'))
    assert.equal(written.reader, EMDASH_SECTIONS_READER)
  } finally {
    useEmdashSections(null)
    rmSync(out, { recursive: true, force: true })
  }
})
