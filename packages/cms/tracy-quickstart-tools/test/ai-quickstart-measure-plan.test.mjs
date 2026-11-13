// The measurement plan of the AI quickstart draft (#583): which page to open at 390 px for each text limit the kit
// could not give, and what to fill there. Invented template only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { limitFromReadings, planMeasurements, shownTextOf } from '../ai-quickstart/lib/measure-plan.mjs'

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

test('a slot with no demo words, or a block no page shows at 390 px, is skipped with its reason', () => {
  const unmeasured = [
    { block: 'block-7', slot: 'module-7.1' },
    { block: 'block-8', slot: 'module-8.0' }
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
  assert.match(rec.limitFrom, /^measured at 390px on the running template, page \/: 390px 31 .*1440px 24/)
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

test('a text the phone layout hides is measured at the widest width, and says so', () => {
  const rec = limitFromReadings({ 1440: { limit: 18, demo: 10, lines: 1 } }, '/', { hiddenAtNarrowest: true })
  assert.equal(rec.limit, 18)
  assert.match(rec.limitFrom, /^measured at 1440px .* hides it at 390px/)
})

test('the tight form of a sample joins the words a hidden line break splits', () => {
  assert.equal(shownTextOf('WHAT((br/))((span))TO BRING((/span))', ''), 'WHATTO BRING')
})
