/**
 * The preview dialog of a TEMPLATE card asks nothing a design system has (#9 of the 04/10 dev E2E,
 * J16.1-J12). A template (a JoomlArt quickstart) is drawn from its live demo by `TemplateBody`; it
 * has no fixture, no slot map, no sample artifacts and no copy file. The dialog used to ask for all
 * of them under the template's id anyway — `systems/ja-impact/{components.html, slots.json,
 * artifact-slots/landing.json, system/artifacts/landing.html}` on the library and `copy/ja-impact`
 * on the door — and every one answered 404 (the library's 404 page has no CORS header, so Chrome
 * reported it as a CORS failure).
 *
 * Pinned on the real `PreviewDialog`, bundled in memory and mounted with react-dom on a linkedom
 * document, `fetch` a fixture that records every address asked: opening a template asks for no
 * system file and no copy, and opening a design system still asks for its own (so the test cannot
 * pass by the dialog asking nothing at all).
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'

import { openDialogDom } from './fixtures/preview-dialog-dom.mjs'

const TEMPLATE = {
  id: 'ja-impact',
  name: 'JA Impact',
  category: 'business',
  nav: 'top-left',
  hero: 'split',
  dark: false,
  provider: 'JoomlArt',
  template: {
    quickstarts: { joomla: 'ja-impact-j6' },
    version: '1.0.0',
    image: null,
    demo: { url: 'https://demo.example.test/ja-impact/', version: '1.0.0' },
    languages: ['en'],
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: null, mobile: null } }]
  }
}
const SYSTEM = {
  id: 'sys-alpha',
  name: 'Alpha',
  category: 'saas',
  nav: 'top-left',
  hero: 'split',
  dark: false
}

let harness
/** @type {(() => Promise<void>)[]} */
let cleanups = []

before(async () => {
  harness = await openDialogDom()
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
after(() => harness?.restore())

/** Open the dialog on `card` and answer every request; returns the addresses asked. */
async function open(card) {
  /** @type {string[]} */
  const asked = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://lane.test')
    asked.push(url.pathname)
    if (/\/copy\/[^/]+$/.test(url.pathname))
      return Response.json({
        schemaVersion: '2',
        system: card.id,
        writtenAt: '2026-10-01T00:00:00Z',
        lang: 'en',
        brief: null,
        pages: {},
        defaultPrompts: {}
      })
    if (/slots(\.json)?$|artifact-slots\//.test(url.pathname)) return Response.json({ slots: [] })
    return new Response('<!doctype html><html><head></head><body><h1>Sample</h1></body></html>')
  }
  const unmount = await harness.mount({ list: [card], index: 0 })
  cleanups.push(unmount)
  return asked
}

test('sweep 9: a template card asks for no design system file and no copy file under its id', async () => {
  const asked = await open(TEMPLATE)
  const wrong = asked.filter((p) => p.includes('/systems/ja-impact') || p.includes('/copy/ja-impact'))
  assert.deepEqual(wrong, [], `a template asked for files only a design system has: ${wrong.join(', ')}`)
})

test('sweep 9: a design system card still asks for its own fixture, slots and copy', async () => {
  const asked = await open(SYSTEM)
  assert.ok(
    asked.some((p) => p.includes('/systems/sys-alpha/components.html')),
    `no fixture asked: ${asked.join(', ')}`
  )
  assert.ok(
    asked.some((p) => p.endsWith('/copy/sys-alpha')),
    `no copy asked: ${asked.join(', ')}`
  )
})
