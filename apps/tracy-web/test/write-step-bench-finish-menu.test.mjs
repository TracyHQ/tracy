// The repair menu of a fault (spec #418): a real run lost most of its orders to addresses the fixer guessed (article ids as
// block ids, blocks of another page, a CSS target `h2` on a heading served as `span.h2`). The fixer is now sent the menu of
// the fault's page, built by code from the kit and the page as served, and an order naming anything off it is refused with a
// reason the fixer is told on a second ask. Driven through the step 9 bench's `finish` on the invented written site; only
// what comes out is asserted: what the fixer was sent, the repair log and the site's writes.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { menuRefusal, repairMenu } from '../src/write-step/finisher/repair-menu.js'
import { RAW } from './_write-step-finisher.mjs'
import { cleanUp, finishOn, scriptedDoor } from './_write-step-finish-run.mjs'

after(cleanUp)

/** The home page as the template serves it: module wrappers by id, the heading a span with the class of a heading. */
const served = (held) => (page) =>
  page === '/'
    ? `<html><body><div id="Mod2" class="t4-module"><span class="h2 main-title">${held['module-2.1']}<br/><span>now</span></span></div><section id="acm-features-3"><p class="lead">${held['module-3.1']}</p><p>${held['module-3.2']}</p></section></body></html>`
    : '<html><body><div id="Mod4"><p>About us</p></div></body></html>'

/** What the fixer was sent on its nth call, as the JSON object it reads. */
const sent = (fixer, n = 0) => JSON.parse(fixer.asked[n].content[0].text)

const glued = {
  page: '/',
  viewport: 'phone',
  tile: 0,
  slot: null,
  kind: 'broken-layout',
  seen: 'the heading reads "Strengthnow" with no space'
}
const finder = (fault) => scriptedDoor('Finisher finder', [{ faults: [fault] }, { faults: [] }])
const style = (over) => ({
  kind: 'style-block',
  block: 'block-2',
  styles: { 'word-spacing': '0.1em' },
  ...over
})

test("the fixer is sent the menu of the fault's page: its blocks, their slots with the words held, their targets as served", async () => {
  const fixer = scriptedDoor('Finisher fixer', [{}])
  const run = await finishOn({
    finder: finder({ ...glued, kind: 'raw-markup', slot: 'block-2.1' }),
    fixer,
    checker: scriptedDoor('Finisher checker', []),
    served
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const { menu } = sent(fixer)
  assert.equal(menu.page, '/')
  assert.equal(menu.served, true)
  assert.deepEqual(
    menu.blocks.map((b) => b.block),
    ['block-2', 'block-3'],
    'only the blocks of the home page'
  )
  const [heading, features] = menu.blocks
  assert.deepEqual(heading.slots, [{ slot: 'block-2.1', words: RAW }])
  assert.deepEqual(heading.targets, ['span.h2.main-title', 'span.h2.main-title span'])
  assert.equal(heading.style, true)
  assert.deepEqual(features.targets, ['p.lead', 'p'], 'an ACM block is found by its acm-<name>-<N> id')
})

test('a style order on a block of another page is refused, the fixer is told why, and its second order is the one checked', async () => {
  const fixer = scriptedDoor('Finisher fixer', [
    style({ block: 'block-4', target: 'p' }),
    style({ target: 'span.h2.main-title span' })
  ])
  const run = await finishOn({
    finder: finder(glued),
    fixer,
    checker: scriptedDoor('Finisher checker', []),
    served
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(fixer.asked.length, 2)
  const [refused] = sent(fixer, 1).refused
  assert.equal(refused.order.block, 'block-4')
  assert.match(refused.reason, /block-4.* not on the menu of \/.*block-2, block-3/)
  const [record] = run.log.records
  assert.deepEqual(
    record.order,
    style({ target: 'span.h2.main-title span' }),
    'the second order is the one logged'
  )
  assert.doesNotMatch(String(record.reason), /menu/)
})

test('a CSS target the served block does not hold is refused, with the targets it does hold', async () => {
  const fixer = scriptedDoor('Finisher fixer', [style({ target: 'h2' })])
  const run = await finishOn({
    finder: finder(glued),
    fixer,
    checker: scriptedDoor('Finisher checker', []),
    served
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  const [record] = run.log.records
  assert.equal(record.outcome, 'dropped')
  assert.match(record.reason, /target "h2" is not on the menu of block-2.*span\.h2\.main-title/)
})

test('an article id, or a block the served page does not hold, is no block a style order may name', async () => {
  const fixer = scriptedDoor('Finisher fixer', [style({ block: 'article-2' })])
  const run = await finishOn({
    finder: finder(glued),
    fixer,
    checker: scriptedDoor('Finisher checker', []),
    // The page as served holds the heading's module, not the features block.
    served: (held) => () => `<div id="Mod2"><h2>${held['module-2.1']}</h2></div>`
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const { menu } = sent(fixer)
  assert.deepEqual(
    menu.blocks.map((b) => [b.block, b.style]),
    [
      ['block-2', true],
      ['block-3', false]
    ]
  )
  const [record] = run.log.records
  assert.equal(record.outcome, 'dropped')
  assert.match(
    record.reason,
    /"article-2" is not on the menu of \/ for a style order: its blocks are block-2$/
  )
})

test('a slot order off the menu is refused before any other check', async () => {
  const fixer = scriptedDoor('Finisher fixer', [
    { kind: 'fix-text', slot: 'block-4.1', text: 'Our story began in a garage' }
  ])
  const run = await finishOn({
    finder: finder({ ...glued, kind: 'raw-markup', slot: null, seen: 'the heading prints ((span))' }),
    fixer,
    checker: scriptedDoor('Finisher checker', []),
    served
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.match(
    run.log.records[0].reason,
    /slot "block-4\.1" is not on the menu of \/: its slots are block-2\.1/
  )
})

test('a gallery picture is on the menu with the slot of its alt, and an alt order must name that slot', () => {
  const gallery = {
    id: 'block-8',
    slots: [{ id: 'block-8.1', type: 'text' }],
    lists: [
      {
        id: 'block-8.gallery',
        rows: [
          {
            slots: [
              { id: 'block-8.5', type: 'image' },
              { id: 'block-8.11', type: 'text' }
            ]
          }
        ]
      }
    ]
  }
  const group = { kind: 'gallery', id: 'g1' }
  const contentMap = {
    slots: [
      { key: 'module-8.5', entity: 'module-8', type: 'image', group },
      {
        key: 'module-8.11',
        entity: 'module-8',
        type: 'text',
        sample: '',
        jsonPath: ['items', '[alt]'],
        group
      }
    ]
  }
  const menu = repairMenu({
    fault: { page: '/' },
    blocks: [gallery],
    html: null,
    wordsOf: () => null,
    contentMap
  })
  assert.deepEqual(menu.blocks[0].frames, [{ frame: 'block-8.5', alt: 'block-8.11' }])
  assert.equal(menu.blocks[0].targets, null, 'the page was not read, so no target is listed')
  const alt = (slot) => ({ kind: 'fix-alt', slot, frame: 'block-8.5', text: 'x' })
  assert.equal(menuRefusal(alt('block-8.11'), menu), null)
  assert.match(menuRefusal(alt('block-8.1'), menu), /the alt of frame block-8\.5 is slot block-8\.11/)
  assert.match(menuRefusal(alt('block-8.5'), menu), /block-8\.11/)
})
