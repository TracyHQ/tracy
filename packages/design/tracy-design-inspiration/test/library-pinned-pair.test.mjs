/**
 * The pinned pair at the head of the Design system tab's grid, in the DOM (Akemi, 13/10/2026, D2): the worn
 * system's card first with its "Wearing now" badge, the synthetic "Template default" card right after it with
 * its badge; the Template default card first, badged "Wearing now", when nothing is worn. The Template default card
 * is drawn like every other card (14/10/2026): no button of its own; pressed, it opens the same preview popup, whose
 * primary button is the way back. The "Wearing now" row above the cards is gone. Under a search the pair follows the filter.
 *
 *   node --test packages/design/tracy-design-inspiration/test/library-pinned-pair.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { doors, openTabDom } from './fixtures/design-system-tab-dom.mjs'

/** @type {Awaited<ReturnType<typeof openTabDom>>} */
let ui

const BARE = {
  platform: 'wordpress',
  canApply: true,
  refused: [],
  worn: null,
  template: 'tracy-business',
  supported: true,
  last: null
}
const WORN = {
  ...BARE,
  worn: { id: null, slotId: 'refero:one', name: 'Calm Paper' },
  last: { applyId: 'apply-1', id: 'refero:one', name: 'Calm Paper', previous: null, undone: false }
}

before(async () => {
  ui = await openTabDom()
})
after(() => ui.restore())

// Never hand a linkedom element to `assert`: its diff would inspect the whole document. Strings and counts only.
const cards = (host) =>
  [...host.querySelectorAll('[data-system]')].map((el) => el.getAttribute('data-system'))
const badgeOf = (host, id) =>
  host.querySelector(`[data-system="${id}"] [data-card-badge]`)?.textContent ?? null
const count = (host, selector) => host.querySelectorAll(selector).length
/** Press the Template default card and give back its popup's primary button (the way back, or "in use"). */
const openDefault = async (host) => {
  await ui.fire(host.querySelector('[data-system="template-default"]'))
  await ui.settle()
  return ui.body().querySelector('[data-system-preview="template-default"] [data-undo-worn]')
}
const stroked = (host) =>
  [...host.querySelectorAll('[data-worn-card="true"]')].map((el) => el.getAttribute('data-system'))

test('a worn system: its card first with "Wearing now", the Template default card second; its popup holds the way back', async () => {
  const state = doors(WORN)
  const tab = await ui.mountTab({ state })
  assert.equal(count(tab.host, '[data-worn-now]'), 0, 'the Wearing now row is gone')
  assert.deepEqual(cards(tab.host), ['refero:one', 'template-default', 'refero:two'])
  assert.equal(badgeOf(tab.host, 'refero:one'), 'Wearing now')
  assert.deepEqual(stroked(tab.host), ['refero:one'], 'the terracotta stroke stays on the worn card alone')
  assert.equal(badgeOf(tab.host, 'template-default'), 'Template default')
  assert.equal(count(tab.host, '[data-undo-worn]'), 0, 'the card holds no button of its own')
  const back = await openDefault(tab.host)
  assert.ok(back, "the Template default card's popup holds the way back")
  assert.equal(back.textContent, 'Back to template default')
  assert.equal(back.disabled, false)
  assert.equal(
    ui.body().querySelectorAll('[data-system-preview="template-default"] [data-try-on]').length,
    0,
    'no Try on in the Template default popup'
  )
  assert.match(
    tab.host.querySelector('[data-system="template-default"]').textContent,
    /tracy-business/,
    'the card names the template'
  )

  await ui.fire(back)
  await ui.settle(10)
  // 15/10/2026: the way back is a write of its own (`template-default`), not the last apply undone.
  assert.deepEqual(
    state.applies,
    ['template-default'],
    'the apply door was pressed with the template default'
  )
  assert.deepEqual(state.undos, [], 'nothing was undone')
  assert.deepEqual(
    cards(tab.host),
    ['template-default', 'refero:one', 'refero:two'],
    'back to the template: its card is first'
  )
  assert.equal(badgeOf(tab.host, 'template-default'), 'Wearing now')
  assert.equal(badgeOf(tab.host, 'refero:one'), null)
  // Like a try, the popup closes: the site itself shows the look, and the try's bar offers Undo.
  assert.equal(ui.body().querySelectorAll('[data-system-preview="template-default"]').length, 0)
  const inUse = await openDefault(tab.host)
  assert.equal(inUse?.textContent, 'Your site uses this look', 'opened again, it says the look is in use')
  assert.equal(inUse?.disabled, true)
  await tab.unmount()
})

test('nothing worn: the Template default card is first and says "Wearing now"; its popup says the look is in use', async () => {
  const tab = await ui.mountTab({ state: doors(BARE) })
  assert.deepEqual(cards(tab.host), ['template-default', 'refero:one', 'refero:two'])
  assert.equal(badgeOf(tab.host, 'template-default'), 'Wearing now')
  const inUse = await openDefault(tab.host)
  assert.equal(inUse?.textContent, 'Your site uses this look')
  assert.equal(inUse?.disabled, true, 'nothing to undo: the button is off')
  assert.deepEqual(
    stroked(tab.host),
    ['template-default'],
    "the stroke marks the look in use: the template's own"
  )
  await tab.unmount()
})

test('the way back goes to the template, even when the last apply replaced another system', async () => {
  const over = { ...WORN, last: { ...WORN.last, previous: { id: 'refero:two', name: 'Bold Ink' } } }
  const tab = await ui.mountTab({ state: doors(over) })
  assert.equal((await openDefault(tab.host))?.textContent, 'Back to template default')
  await tab.unmount()
})

test("a worn system the library does not list still gets the first card, from the site's read alone", async () => {
  const foreign = {
    ...WORN,
    worn: { id: 'airbnb', slotId: 'od:airbnb', name: 'Airbnb' },
    last: { applyId: 'apply-1', id: 'od:airbnb', name: 'Airbnb', previous: null, undone: false }
  }
  const tab = await ui.mountTab({ state: doors(foreign) })
  assert.deepEqual(cards(tab.host), ['od:airbnb', 'template-default', 'refero:one', 'refero:two'])
  const card = tab.host.querySelector('[data-system="od:airbnb"]')
  assert.equal(card.getAttribute('data-synthetic'), '')
  assert.equal(badgeOf(tab.host, 'od:airbnb'), 'Wearing now')
  assert.match(card.textContent, /Airbnb/)
  assert.equal(count(card, '[data-open-preview]'), 0, 'no preview to open for a system outside the library')
  await tab.unmount()
})

test('a search narrows the pair too: no Template default card, the worn card only when it matched, still badged', async () => {
  const tab = await ui.mountTab({ state: doors(WORN) })
  const search = tab.host.querySelector('input[type="search"], input')
  assert.ok(search, 'the toolbar has its search')
  const type = (text) => ui.type(search, text)
  await type('bold')
  assert.deepEqual(cards(tab.host), ['refero:two'], 'the pair steps aside; the worn card did not match')
  await type('calm')
  assert.deepEqual(
    cards(tab.host),
    ['refero:one'],
    'the worn card matched: it is shown, no Template default card'
  )
  assert.equal(badgeOf(tab.host, 'refero:one'), 'Wearing now')
  await type('')
  assert.deepEqual(
    cards(tab.host),
    ['refero:one', 'template-default', 'refero:two'],
    'an empty search brings the pair back'
  )
  await tab.unmount()
})

test('the Template default card is the same shape as every other card: a button, picture, name and one line, no action of its own', async () => {
  const tab = await ui.mountTab({ state: doors(WORN) })
  const def = tab.host.querySelector('[data-system="template-default"]')
  const sys = tab.host.querySelector('[data-system="refero:two"]')
  assert.equal(def.tagName, 'BUTTON')
  assert.equal(def.className, sys.className, 'the same card classes, so the same height in the grid')
  assert.equal(def.children.length, sys.children.length, 'picture, words, Open preview pill')
  assert.equal(def.querySelectorAll('button').length, 0, 'no button inside the card')
  assert.equal(
    def.querySelectorAll('[data-open-preview]').length,
    1,
    'the Open preview pill, like the others'
  )
  assert.equal(def.getAttribute('aria-haspopup'), 'dialog')
  await tab.unmount()
})
