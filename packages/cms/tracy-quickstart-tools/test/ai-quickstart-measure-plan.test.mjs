// The measurement plan of the AI quickstart draft (#583): which page to open at 390 px for each text limit the kit
// could not give, and what to fill there. Invented template only.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MEASURE_WIDTHS,
  limitAcrossPages,
  limitFromReadings,
  pieceTextOf,
  planMeasurements,
  shownTextOf
} from '../ai-quickstart/lib/measure-plan.mjs'

const contentMap = {
  slots: [
    { key: 'module-7.0', sample: 'Fresh ((br/))((span))bread((/span))', fit: { lines: { phone: 2 } } },
    { key: 'module-7.1', sample: '' },
    { key: 'module-8.0', sample: 'Opening soon' }
  ]
}
const blockStore = {
  blocks: [
    { id: 'block-7', from: { kit: ['block-7'] } },
    { id: 'block-8', from: { kit: ['block-8'] } }
  ]
}
const kit = {
  pages: [
    { path: '/', blocks: { 390: ['header', 'block-7'], 1440: ['header', 'block-7'] } },
    { path: '/about', blocks: { 390: ['header'], 1440: ['header', 'block-8'] } }
  ]
}

test('inline markers of a sample are dropped, its words kept', () => {
  assert.equal(shownTextOf('Fresh ((br/))((span))bread((/span))'), 'Fresh bread')
})

test('each slot is filled on the first page that shows its block at 390 px, on the lines the demo shows', () => {
  const unmeasured = [
    { block: 'block-7', slot: 'module-7.0' },
    { block: 'block-7', slot: 'module-7.0' }
  ]
  const plan = planMeasurements({ unmeasured, blockStore, kit, contentMap })
  assert.deepEqual(plan.pages, [
    {
      path: '/',
      texts: [{ id: 'module-7.0', slot: 'module-7.0', text: 'Fresh bread', tight: 'Fresh bread' }]
    }
  ])
})

test('a slot with no demo words, or a block no page shows at any width, is skipped with its reason', () => {
  const unmeasured = [
    { block: 'block-7', slot: 'module-7.1' },
    { block: 'block-9', slot: 'module-8.0' }
  ]
  const plan = planMeasurements({ unmeasured, blockStore, kit, contentMap })
  assert.equal(plan.pages.length, 0)
  assert.deepEqual(
    plan.skipped.map((s) => s.slot),
    ['module-7.1', 'module-8.0']
  )
})

test('a limit is the smallest reading over the widths, and needs a reading at 390 px', () => {
  const rec = limitFromReadings(
    { 390: { limit: 31, demo: 11, lines: 2 }, 1440: { limit: 24, demo: 11, lines: 1 } },
    '/'
  )
  assert.equal(rec.limit, 24)
  assert.match(
    rec.limitFrom,
    /^measured on the running template at 390, 1440px, page \/: 390px 31 .*1440px 24 .*; the limit is the smallest reading, 24 at 1440px;/
  )
  assert.equal(limitFromReadings({ 1440: { limit: 24, demo: 11, lines: 1 } }, '/'), null)
})

test('a decision moves a slot to another page and opens a tab first', () => {
  const plan = planMeasurements({
    unmeasured: [{ block: 'block-8', slot: 'module-8.0' }],
    blockStore,
    kit,
    contentMap,
    measureOn: { 'module-8.0': { path: '/about', click: 'Later' } }
  })
  assert.deepEqual(plan.pages, [
    {
      path: '/about',
      click: 'Later',
      texts: [{ id: 'module-8.0', slot: 'module-8.0', text: 'Opening soon', tight: 'Opening soon' }]
    }
  ])
})

test('a text the phone layout hides is measured at the narrowest width that draws it, 768 px included', () => {
  const readings = { 768: { limit: 14, demo: 10, lines: 1 }, 1440: { limit: 18, demo: 10, lines: 1 } }
  const rec = limitFromReadings(readings, '/', { hiddenAt: [390] })
  assert.equal(rec.limit, 14)
  assert.match(
    rec.limitFrom,
    /^measured on the running template at 768, 1440px, page \/: 768px 14 .*1440px 18/
  )
  assert.match(rec.limitFrom, /the limit is the smallest reading, 14 at 768px/)
  assert.match(rec.limitFrom, /hides it at 390px/)
  assert.equal(limitFromReadings(readings, '/'), null, 'a text not read at 390 px and not hidden there')
})

test('the measured widths are the phone, the tablet and the desktop width of the kit', () => {
  assert.deepEqual(MEASURE_WIDTHS, [390, 768, 1440])
})

test('a block no page shows at 390 px is opened on a page that shows it at a wider width', () => {
  const wide = { pages: [{ path: '/wide', blocks: { 390: ['header'], 768: ['header', 'block-8'] } }] }
  const plan = planMeasurements({
    unmeasured: [{ block: 'block-8', slot: 'module-8.0' }],
    blockStore,
    kit: wide,
    contentMap
  })
  assert.equal(plan.pages[0].path, '/wide')
})

test('the tight form of a sample joins the words a hidden line break splits', () => {
  assert.equal(shownTextOf('WHAT((br/))((span))TO BRING((/span))', ''), 'WHATTO BRING')
})

test('a decision can open a menu by a selector before the slot is read', () => {
  const plan = planMeasurements({
    unmeasured: [{ block: 'block-8', slot: 'module-8.0' }],
    blockStore,
    kit,
    contentMap,
    measureOn: { 'module-8.0': { path: '/', clickSelector: '#menu-toggle' } }
  })
  assert.deepEqual(plan.pages[0], {
    path: '/',
    clickSelector: '#menu-toggle',
    texts: [{ id: 'module-8.0', slot: 'module-8.0', text: 'Opening soon', tight: 'Opening soon' }]
  })
})

test('a decision opens each submenu of a menu on a visit of its own', () => {
  const plan = planMeasurements({
    unmeasured: [{ block: 'block-8', slot: 'module-8.0' }],
    blockStore,
    kit,
    contentMap,
    measureOn: { 'module-8.0': { path: '/', clickSelector: '#menu-toggle', openEach: '.submenu-toggle' } }
  })
  assert.deepEqual(plan.pages[0], {
    path: '/',
    clickSelector: '#menu-toggle',
    openEach: '.submenu-toggle',
    texts: [{ id: 'module-8.0', slot: 'module-8.0', text: 'Opening soon', tight: 'Opening soon' }]
  })
})

test('a place two store blocks draw is filled on the page of each block', () => {
  const shared = {
    blocks: [
      { id: 'block-7', from: { kit: ['block-7'] }, fields: [{ name: 'heading', slot: 'module-7.0' }] },
      { id: 'list-8', from: { kit: ['block-8'] }, itemFields: [{ name: 'title', slots: ['module-7.0'] }] }
    ]
  }
  const plan = planMeasurements({
    unmeasured: [{ block: 'block-7', slot: 'module-7.0' }],
    blockStore: shared,
    kit,
    contentMap
  })
  assert.deepEqual(
    plan.pages.map((p) => [p.path, p.texts.map((t) => t.slot)]),
    [
      ['/', ['module-7.0']],
      ['/about', ['module-7.0']]
    ]
  )
})

test('a place read on several pages takes the smallest limit of any page, and names each page', () => {
  const home = limitFromReadings({ 390: { limit: 36, demo: 12, lines: 1 } }, '/')
  const list = limitFromReadings({ 390: { limit: 29, demo: 12, lines: 1 } }, '/classes')
  const rec = limitAcrossPages([home, list])
  assert.equal(rec.limit, 29)
  assert.match(
    rec.limitFrom,
    /^measured on the running template on 2 pages, the smallest limit taken \(29, page \/classes\):/
  )
  assert.match(rec.limitFrom, /page \/: 390px 36/)
  assert.deepEqual(limitAcrossPages([home]), home)
  assert.equal(limitAcrossPages([]), null)
})

test('a piece of a stored HTML value shows the words of its own element', () => {
  const sample =
    '((ul))\n\t((li))Fresh ((br/))bread((/li))\n\t((li))Warm ((span))soup((/span))((/li))\n((/ul))'
  assert.equal(pieceTextOf(sample, '/html/body/ul/li[1]'), 'Fresh bread')
  assert.equal(pieceTextOf(sample, '/html/body/ul/li[2]'), 'Warm soup')
  assert.equal(pieceTextOf(sample, '/html/body/ul/li[3]'), null)
  assert.equal(pieceTextOf(sample, '/html/body/ul/li[1]/@class'), null)
})

test('a piece is filled with its own words, on the page and tab its stored value is read on', () => {
  const map = {
    slots: [{ key: 'module-9.0', sample: '((ul))((li))Fresh bread((/li))((li))Warm soup((/li))((/ul))' }]
  }
  const store = {
    blocks: [
      {
        id: 'block-9',
        from: { kit: ['block-9'] },
        itemLists: [
          {
            name: 'lines',
            fields: [
              { name: 'line', slots: [['module-9.0@/html/body/ul/li[1]', 'module-9.0@/html/body/ul/li[2]']] }
            ]
          }
        ]
      }
    ]
  }
  const plan = planMeasurements({
    unmeasured: [
      { block: 'block-9', slot: 'module-9.0@/html/body/ul/li[1]' },
      { block: 'block-9', slot: 'module-9.0@/html/body/ul/li[2]' }
    ],
    blockStore: store,
    kit,
    contentMap: map,
    measureOn: { 'module-9.0': { path: '/menu', click: 'Lunch' } }
  })
  assert.deepEqual(plan.pages, [
    {
      path: '/menu',
      click: 'Lunch',
      texts: [
        {
          id: 'module-9.0@/html/body/ul/li[1]',
          slot: 'module-9.0@/html/body/ul/li[1]',
          text: 'Fresh bread',
          tight: 'Fresh bread'
        },
        {
          id: 'module-9.0@/html/body/ul/li[2]',
          slot: 'module-9.0@/html/body/ul/li[2]',
          text: 'Warm soup',
          tight: 'Warm soup'
        }
      ]
    }
  ])
})
