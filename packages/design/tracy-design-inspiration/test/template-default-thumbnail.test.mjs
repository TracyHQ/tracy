/**
 * The Template default card's picture (14/10/2026): the template's own thumbnail, the one /ops Templates Management
 * draws for the site's release (the read's `templateImage`), asked card-sized from the shots door; the template's
 * name stays as the picture's alt, and is the picture itself when there is no thumbnail or it fails to load.
 *
 *   node --test packages/design/tracy-design-inspiration/test/template-default-thumbnail.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { doors, openTabDom } from './fixtures/design-system-tab-dom.mjs'

/** @type {Awaited<ReturnType<typeof openTabDom>>} */
let ui

const SHOT = 'https://tracy.test/api/templates/tracy-business/shots/home.png?v=abcdef12'
const READ = {
  platform: 'joomla',
  canApply: true,
  refused: [],
  worn: null,
  template: 'joomla/tracy-business',
  supported: true,
  last: null
}

before(async () => {
  ui = await openTabDom()
})
after(() => ui.restore())

const card = (host) => host.querySelector('[data-system="template-default"]')

test('a known template: the card shows its thumbnail, card-sized and covering the picture box, named by its alt', async () => {
  const tab = await ui.mountTab({ state: doors({ ...READ, templateImage: SHOT }) })
  const img = card(tab.host)?.querySelector('img[data-template-image]')
  assert.ok(img, 'the Template default card draws the thumbnail')
  assert.equal(
    img.getAttribute('src'),
    'https://tracy.test/api/templates/tracy-business/shots/home.png?v=abcdef12&w=720',
    'the card-sized copy of the shots door (cardThumb)'
  )
  assert.equal(img.getAttribute('alt'), 'joomla/tracy-business')
  assert.match(img.getAttribute('class') ?? '', /object-cover/)
  assert.equal(card(tab.host)?.querySelectorAll('[data-template-name]').length, 0, 'no grey name box over it')
  await tab.unmount()
})

test('no thumbnail: the template name stands in its place, as before', async () => {
  for (const templateImage of [null, undefined]) {
    const tab = await ui.mountTab({ state: doors({ ...READ, templateImage }) })
    assert.equal(card(tab.host)?.querySelectorAll('img').length, 0)
    assert.equal(card(tab.host)?.querySelector('[data-template-name]')?.textContent, 'joomla/tracy-business')
    await tab.unmount()
  }
})

test('a thumbnail that fails to load falls back to the template name, never a broken picture', async () => {
  const tab = await ui.mountTab({ state: doors({ ...READ, templateImage: SHOT }) })
  const img = card(tab.host)?.querySelector('img[data-template-image]')
  assert.ok(img)
  await ui.fire(img, 'error')
  await ui.settle()
  assert.equal(card(tab.host)?.querySelectorAll('img').length, 0)
  assert.equal(card(tab.host)?.querySelector('[data-template-name]')?.textContent, 'joomla/tracy-business')
  await tab.unmount()
})
