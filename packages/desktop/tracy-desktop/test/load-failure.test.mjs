// A product window whose page cannot load (offline, the server down, a name that does not resolve)
// shows the shell's local "can't reach" page with Retry, instead of Chromium's blank
// `chrome-error://chromewebdata/` (measured 11/10/2026 on 0.6.0-dev.1 with the network cut: an empty
// window, not one word). src/load-failure.js decides when, and what the page is handed.
//
//   node --test packages/desktop/tracy-desktop/test/load-failure.test.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { retryTarget, unreachableQuery, watchLoadFailure } = require('../src/load-failure.js')
const { STRINGS } = require('../src/shell-strings.js')

const HOME = 'https://cowork.example/'

/** Electron's `did-fail-load` arguments after the event: code, description, URL, main frame. */
const fail = (contents, { code = -106, description = 'ERR_INTERNET_DISCONNECTED', url, mainFrame = true }) =>
  contents.emit('did-fail-load', {}, code, description, url, mainFrame, 1, 1)

function watched() {
  const contents = new EventEmitter()
  const shown = []
  watchLoadFailure(contents, { home: HOME, show: (failure) => shown.push(failure) })
  return { contents, shown }
}

test('the main frame failing to load a Tracy page shows the page, Retry going back to that page', () => {
  const { contents, shown } = watched()
  fail(contents, { url: 'https://cowork.example/lantern/' })
  assert.deepEqual(shown, [{ retry: 'https://cowork.example/lantern/', detail: 'ERR_INTERNET_DISCONNECTED' }])
})

test('a sub-frame failing never replaces the window (a site preview, an embedded page)', () => {
  const { contents, shown } = watched()
  fail(contents, { url: 'https://lantern.example/', mainFrame: false })
  fail(contents, { url: 'https://cowork.example/lantern/', mainFrame: false })
  assert.deepEqual(shown, [])
})

test('ERR_ABORTED is a navigation someone stopped, not a failure: nothing is shown', () => {
  const { contents, shown } = watched()
  fail(contents, { code: -3, description: 'ERR_ABORTED', url: 'https://cowork.example/' })
  assert.deepEqual(shown, [])
})

test('a local page of the shell failing (file:, data:, about:) is left alone, so the page cannot loop', () => {
  for (const url of ['file:///app/src/unreachable.html?x=1', 'data:text/html,x', 'about:blank', '']) {
    assert.equal(retryTarget({ errorCode: -6, isMainFrame: true, url, home: HOME }), null, url)
  }
})

test('Retry stays on Tracy: a main-frame failure elsewhere retries the window’s home page', () => {
  assert.equal(
    retryTarget({ errorCode: -105, isMainFrame: true, url: 'https://elsewhere.example/x', home: HOME }),
    HOME
  )
  assert.equal(
    retryTarget({ errorCode: -102, isMainFrame: true, url: 'https://cowork.example/?a=1', home: HOME }),
    'https://cowork.example/?a=1'
  )
})

test('the page is handed the Retry address, the error code and its words in the system language', () => {
  const query = unreachableQuery({
    retry: 'https://cowork.example/',
    detail: 'ERR_NAME_NOT_RESOLVED',
    app: 'Tracy Cowork',
    languages: ['vi-VN', 'en-US']
  })
  assert.deepEqual(Object.keys(query).sort(), ['detail', 'lang', 'retry', 't'])
  assert.equal(query.lang, 'vi')
  assert.equal(query.retry, 'https://cowork.example/')
  assert.equal(query.detail, 'ERR_NAME_NOT_RESOLVED')
  const words = JSON.parse(query.t)
  assert.equal(words['unreachable.retry'], STRINGS.vi['unreachable.retry'])
  // Placeholders are filled in the main process; the page only copies text.
  assert.ok(words['unreachable.body'].includes('Tracy Cowork'), words['unreachable.body'])
  assert.doesNotMatch(Object.values(words).join(' '), /\{\w+\}/)
  // Only the page's own words ride along.
  assert.ok(
    Object.keys(words).every((key) => key.startsWith('unreachable.')),
    Object.keys(words).join(', ')
  )
})

test('an OS language outside the eight: English', () => {
  const query = unreachableQuery({ retry: HOME, detail: '', app: 'Tracy Cowork', languages: ['ja-JP'] })
  assert.equal(query.lang, 'en')
  assert.equal(JSON.parse(query.t)['unreachable.title'], STRINGS.en['unreachable.title'])
})

test('the page draws exactly the unreachable.* words the table holds', async () => {
  const { readFile } = await import('node:fs/promises')
  const html = await readFile(new URL('../src/unreachable.html', import.meta.url), 'utf8')
  const drawn = [...html.matchAll(/data-t="([^"]+)"/g)].map((m) => m[1]).sort()
  const held = Object.keys(STRINGS.en)
    .filter((key) => key.startsWith('unreachable.'))
    .sort()
  assert.deepEqual(drawn, held)
  // A local page: nothing fetched, no inline script.
  assert.match(html, /default-src 'none'/)
  assert.doesNotMatch(html, /<script>/)
})
