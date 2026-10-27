/**
 * The main process's half of link routing (`src/open-requests.js`): it asks the page where a link
 * goes, checks the answer, and carries it out exactly once — or opens the browser when the page
 * cannot answer in time.
 *
 *   node --test packages/desktop/tracy-desktop/test/open-requests.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createOpenRouter, externalAllowed } = require('../src/open-requests.js')

const ORIGIN = 'http://tracy.test:8080'

/** A router with recorded effects and a hand-driven clock. */
function harness() {
  const asked = []
  const executed = []
  const external = []
  const windows = []
  const timers = []
  const router = createOpenRouter({
    origin: ORIGIN,
    timeoutMs: 2000,
    ask: (requestId, url, disposition) => asked.push({ requestId, url, disposition }),
    execute: (requestId, decision) => executed.push({ requestId, decision }),
    openExternal: (url) => external.push(url),
    openWindow: (url) => windows.push(url),
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    }
  })
  const fire = () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.fn()
  }
  return { router, asked, executed, external, windows, fire }
}

test('with no page listening, a link opens in the browser and nothing is asked', () => {
  const h = harness()
  h.router.open({ url: 'https://discord.gg/x', disposition: 'foreground-tab' })
  assert.deepEqual(h.asked, [])
  assert.deepEqual(h.external, ['https://discord.gg/x'])
})

test('a plain click is asked about; the answer is carried out once, a repeat is ignored', () => {
  const h = harness()
  h.router.setReady(true)
  h.router.open({ url: 'http://r1.tracy.test:8080/about/', disposition: 'foreground-tab' })
  assert.equal(h.asked.length, 1)
  assert.equal(h.asked[0].disposition, 'foreground-tab')
  const { requestId } = h.asked[0]
  const decision = { kind: 'tab', url: 'http://r1.tracy.test:8080/about/', siteKey: 'r1.tracy.test' }
  h.router.answer(requestId, decision)
  h.router.answer(requestId, decision)
  h.fire()
  assert.deepEqual(h.executed, [{ requestId, decision }])
  assert.deepEqual(h.external, [])
})

test('a page that cannot open windows (an older bundle): Cmd+click, middle click and Shift+click go to the browser without asking', () => {
  const h = harness()
  h.router.setReady(true)
  for (const disposition of ['background-tab', 'new-window', 'other'])
    h.router.open({ url: `https://example.com/${disposition}`, disposition })
  assert.deepEqual(h.asked, [])
  assert.deepEqual(h.external, [
    'https://example.com/background-tab',
    'https://example.com/new-window',
    'https://example.com/other'
  ])
})

test('no answer in time: the browser, once; a late answer then does nothing', () => {
  const h = harness()
  h.router.setReady(true)
  h.router.open({ url: 'https://example.com/slow', disposition: 'foreground-tab' })
  h.fire()
  h.router.answer(h.asked[0].requestId, { kind: 'navigate', url: `${ORIGIN}/new/` })
  assert.deepEqual(h.external, ['https://example.com/slow'])
  assert.deepEqual(h.executed, [])
})

test('the page going away (navigation, crash, close) drops what was asked: no browser, no execution', () => {
  const h = harness()
  h.router.setReady(true)
  h.router.open({ url: 'https://example.com/x', disposition: 'foreground-tab' })
  h.router.reset()
  h.fire()
  h.router.answer(h.asked[0].requestId, { kind: 'external' })
  assert.deepEqual(h.external, [])
  assert.deepEqual(h.executed, [])
  // And the next document has to say again that it listens.
  h.router.open({ url: 'https://example.com/y', disposition: 'foreground-tab' })
  assert.equal(h.asked.length, 1)
  assert.deepEqual(h.external, ['https://example.com/y'])
})

test('an answer that oversteps is not obeyed: the browser opens the link the person pressed', () => {
  const cases = [
    // A navigation must stay on Tracy's origin.
    { kind: 'navigate', url: 'https://evil.example/' },
    // A tab opens the very address asked about, nothing else.
    { kind: 'tab', url: 'https://evil.example/', siteKey: 'r1.tracy.test' },
    { kind: 'tab', url: 'http://r1.tracy.test:8080/about/' },
    { kind: 'teleport' },
    null
  ]
  for (const decision of cases) {
    const h = harness()
    h.router.setReady(true)
    h.router.open({ url: 'http://r1.tracy.test:8080/', disposition: 'foreground-tab' })
    h.router.answer(h.asked[0].requestId, decision)
    assert.deepEqual(h.executed, [], JSON.stringify(decision))
    assert.deepEqual(h.external, ['http://r1.tracy.test:8080/'], JSON.stringify(decision))
  }
})

test('an answer to a request never asked is ignored', () => {
  const h = harness()
  h.router.setReady(true)
  h.router.answer('made-up', { kind: 'navigate', url: `${ORIGIN}/new/` })
  assert.deepEqual(h.executed, [])
})

test('only http(s) and mailto ever reach the operating system', () => {
  for (const url of ['https://x.example/', 'http://x.example/', 'mailto:a@b.example'])
    assert.equal(externalAllowed(url), true, url)
  for (const url of [
    'blob:http://tracy.test:8080/1',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'x-apple.systempreferences:',
    'not a url',
    undefined
  ])
    assert.equal(externalAllowed(url), false, String(url))
  const h = harness()
  h.router.open({ url: 'file:///etc/passwd', disposition: 'foreground-tab' })
  assert.deepEqual(h.external, [])
})

/** A page that says it can answer with a second window (`tracyDesktop` links, `windows: true`). */
function windowPage() {
  const h = harness()
  h.router.setReady(true, { windows: true })
  return h
}

test('a page that opens windows is asked about Cmd+click, middle click and Shift+click, with how it was pressed', () => {
  const h = windowPage()
  h.router.open({ url: `${ORIGIN}/r2.tracy.test/`, disposition: 'background-tab' })
  h.router.open({ url: `${ORIGIN}/r3.tracy.test/`, disposition: 'new-window' })
  assert.deepEqual(
    h.asked.map((a) => [a.url, a.disposition]),
    [
      [`${ORIGIN}/r2.tracy.test/`, 'background-tab'],
      [`${ORIGIN}/r3.tracy.test/`, 'new-window']
    ]
  )
  assert.deepEqual(h.external, [])
})

test('a second window on Tracy is opened by the app itself, exactly once; the page is not handed it', () => {
  const h = windowPage()
  h.router.open({ url: `${ORIGIN}/r2.tracy.test/`, disposition: 'background-tab' })
  const { requestId } = h.asked[0]
  const decision = { kind: 'window', url: `${ORIGIN}/r2.tracy.test/?open=browser&page=%2F` }
  h.router.answer(requestId, decision)
  h.router.answer(requestId, decision)
  h.fire()
  assert.deepEqual(h.windows, [`${ORIGIN}/r2.tracy.test/?open=browser&page=%2F`])
  assert.deepEqual(h.executed, [])
  assert.deepEqual(h.external, [])
})

test('a second window anywhere but Tracy is not obeyed: the browser opens the link pressed', () => {
  const h = windowPage()
  h.router.open({ url: 'https://example.com/x', disposition: 'background-tab' })
  h.router.answer(h.asked[0].requestId, { kind: 'window', url: 'https://example.com/x' })
  assert.deepEqual(h.windows, [])
  assert.deepEqual(h.external, ['https://example.com/x'])
})

test('a plain click never opens a second window', () => {
  const h = windowPage()
  h.router.open({ url: `${ORIGIN}/r2.tracy.test/`, disposition: 'foreground-tab' })
  h.router.answer(h.asked[0].requestId, { kind: 'window', url: `${ORIGIN}/r2.tracy.test/` })
  assert.deepEqual(h.windows, [])
  assert.deepEqual(h.external, [`${ORIGIN}/r2.tracy.test/`])
})

test('Cmd+click never moves this window or its side card: such an answer opens the browser', () => {
  for (const decision of [
    { kind: 'navigate', url: `${ORIGIN}/r2.tracy.test/` },
    { kind: 'tab', url: 'http://r1.tracy.test:8080/', siteKey: 'r1.tracy.test' }
  ]) {
    const h = windowPage()
    h.router.open({ url: 'http://r1.tracy.test:8080/', disposition: 'background-tab' })
    h.router.answer(h.asked[0].requestId, decision)
    assert.deepEqual(h.executed, [], decision.kind)
    assert.deepEqual(h.windows, [], decision.kind)
    assert.deepEqual(h.external, ['http://r1.tracy.test:8080/'], decision.kind)
  }
})

test('Cmd+click on a third-party link: the page says browser, the browser opens it', () => {
  const h = windowPage()
  h.router.open({ url: 'https://discord.gg/x', disposition: 'background-tab' })
  h.router.answer(h.asked[0].requestId, { kind: 'external' })
  assert.deepEqual(h.external, ['https://discord.gg/x'])
})

test('a new document has to say again that it opens windows', () => {
  const h = windowPage()
  h.router.reset()
  h.router.setReady(true)
  h.router.open({ url: `${ORIGIN}/r2.tracy.test/`, disposition: 'background-tab' })
  assert.deepEqual(h.asked, [])
  assert.deepEqual(h.external, [`${ORIGIN}/r2.tracy.test/`])
})
