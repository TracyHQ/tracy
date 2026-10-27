/**
 * Light | Dark in the Design system preview popup (14/10/2026): the framed page runs no script, so the site's own
 * theme toggle cannot be pressed; a template with two modes (the read's `modes`) gets the gallery's Light | Dark
 * switch beside Desktop | Mobile. It opens on the side the worn sheet names (`/* mode: dark *\/`), and a press sets
 * `data-theme` on the framed page's root element — again after every load of the frame (a link followed, a device
 * switch). A one-look template shows no switch.
 *
 *   node --test packages/design/tracy-design-inspiration/test/preview-theme-switch.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { doors, openTabDom, SYSTEMS } from './fixtures/design-system-tab-dom.mjs'

/** @type {Awaited<ReturnType<typeof openTabDom>>} */
let ui

before(async () => {
  ui = await openTabDom()
})
after(() => ui.restore())

const PAGE =
  '<!doctype html><html><head><style>/* tracy-ds-slot: refero:two */\n/* mode: dark */</style></head><body>Home</body></html>'

/** The doors, with the preview door answering `html` as the page. */
function withPage(html) {
  const state = doors({})
  const inner = state.fetch
  state.fetch = async (input, init) =>
    String(input).includes('/design-system/preview?')
      ? new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
      : inner(input, init)
  return state
}

const frame = () => ui.body().querySelector('[data-system-preview-frame]')
const pressed = () =>
  [...ui.body().querySelectorAll('[data-preview-theme]')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('data-preview-theme'))

/**
 * Give the frame a document of its own (linkedom has none behind an iframe) and fire its `load`, as a browser does
 * when the srcdoc or a followed link has painted. Returns that document's root element.
 */
async function load(el) {
  const doc = new ui.dom.DOMParser().parseFromString(
    '<html><head></head><body>page</body></html>',
    'text/html'
  )
  Object.defineProperty(el, 'contentDocument', { configurable: true, get: () => doc })
  await ui.fire(el, 'load')
  await ui.settle()
  return doc.documentElement
}

test('a one-look template: no Light | Dark, only Desktop | Mobile', async () => {
  const popup = await ui.mountPreview({ system: SYSTEMS[1], state: withPage(PAGE), props: { modes: false } })
  assert.equal(ui.body().querySelectorAll('[data-theme-switch]').length, 0)
  assert.equal(ui.body().querySelectorAll('[data-device]').length, 2)
  const root = await load(frame())
  assert.equal(root.getAttribute('data-theme'), null, 'the page is left as it opens')
  await popup.unmount()
})

test('two modes: Light | Dark beside Desktop | Mobile, opening on the side the sheet names', async () => {
  const popup = await ui.mountPreview({ system: SYSTEMS[1], state: withPage(PAGE), props: { modes: true } })
  const group = ui.body().querySelector('[data-theme-switch]')
  assert.ok(group, 'the switch is there')
  assert.equal(group.getAttribute('aria-label'), ui.t('dialog.theme'))
  assert.equal(group.textContent, `${ui.t('dialog.light')}${ui.t('dialog.dark')}`)
  assert.equal(group.querySelectorAll('svg').length, 2, 'a sun and a moon')
  assert.ok(group.nextElementSibling?.querySelector('[data-device]'), 'right next to Desktop | Mobile')
  assert.deepEqual(pressed(), ['dark'], 'the mode line of the sheet: dark')
  const root = await load(frame())
  assert.equal(root.getAttribute('data-theme'), 'dark')
  await popup.unmount()
})

test('pressing Light then Dark sets data-theme on the framed page, and it survives a reload and a device switch', async () => {
  const page = PAGE.replace('/* mode: dark */', '')
  const popup = await ui.mountPreview({ system: SYSTEMS[0], state: withPage(page), props: { modes: true } })
  assert.deepEqual(pressed(), ['light'], 'no mode line, a light system: light')
  const root = await load(frame())
  assert.equal(root.getAttribute('data-theme'), 'light')

  await ui.fire(ui.body().querySelector('[data-preview-theme="dark"]'))
  assert.deepEqual(pressed(), ['dark'])
  assert.equal(root.getAttribute('data-theme'), 'dark', 'repainted in place, no reload')

  // A link followed inside the frame loads a new page: it opens on the side chosen.
  const next = await load(frame())
  assert.equal(next.getAttribute('data-theme'), 'dark')

  // Mobile remounts the frame; its first load is painted too.
  await ui.fire(ui.body().querySelector('[data-device="mobile"]'))
  const phone = await load(frame())
  assert.equal(phone.getAttribute('data-theme'), 'dark')

  await ui.fire(ui.body().querySelector('[data-preview-theme="light"]'))
  assert.equal(phone.getAttribute('data-theme'), 'light')
  await popup.unmount()
})
