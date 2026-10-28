import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DemoReadCache } from '../src/demo-read-cache.js'

test('QA cache is bounded by bytes and entries and evicts least recently used reads', () => {
  const cache = new DemoReadCache({ maxBytes: 400, maxEntries: 2 })
  cache.set('a', { read: 'a' })
  cache.set('b', { read: 'b' })
  assert.deepEqual(cache.get('a'), { read: 'a' })
  cache.set('c', { read: 'c' })
  assert.equal(cache.get('b'), null)
  cache.set('huge', { text: 'x'.repeat(1000) })
  assert.equal(cache.get('huge'), null)
  assert.ok(cache.bytes <= 400)
  cache.set('a', { text: 'x'.repeat(80) })
  assert.ok(cache.bytes <= 400)
  assert.equal(cache.get('c'), null)
})

test('QA cache expires reads and retains no screenshot or base64 payload', () => {
  let time = 0
  const cache = new DemoReadCache({ ttlMs: 10, now: () => time })
  for (const value of [
    { screenshot: 'large' },
    { nested: { base64: 'large' } },
    { src: `data:image/png;base64,${'A'.repeat(20_000)}` }
  ]) {
    cache.set('image', value)
    assert.equal(cache.get('image'), null)
  }
  // 28/10/2026: a page's own stylesheet inlines small pictures (T4's form-select arrow); its read is kept.
  const sheets = new DemoReadCache()
  for (const css of [
    `.form-select{--t4-form-select-bg-img:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg'%3e%3c/svg%3e")}`,
    '.icon{background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)}'
  ]) {
    sheets.set('sheet', { fingerprint: 'f', read: { cssRules: css } })
    assert.notEqual(sheets.get('sheet'), null, css.slice(0, 40))
  }
  cache.set('a', { fingerprint: 'same', read: { text: 'all evidence' } })
  time = 10
  assert.equal(cache.get('a'), null)
  assert.equal(cache.bytes, 0)
})

test('host QA serializes different sites so decoded page images do not multiply across requests', async () => {
  const { makeDemoQa } = await import('../src/demo-qa-browser.js')
  let active = 0
  let peak = 0
  let launches = 0
  const browser = {
    isConnected: () => true,
    newContext: async () => {
      active++
      peak = Math.max(peak, active)
      return {
        close: async () => {
          active--
        },
        newPage: async () => ({
          on() {},
          off() {},
          route: async () => {},
          unroute: async () => {},
          close: async () => {},
          setViewportSize: async () => {},
          goto: async () => {
            await new Promise((r) => setTimeout(r, 10))
            throw new Error('fixture page unavailable')
          }
        })
      }
    }
  }
  const qa = await makeDemoQa({
    playwright: {
      chromium: {
        launch: async () => {
          launches++
          return browser
        }
      }
    }
  })
  await Promise.all(
    ['a', 'b'].map((label) => qa({ asked: { label, pages: ['/'] }, base: `https://${label}.test` }))
  )
  assert.equal(peak, 1)
  assert.equal(active, 0)
  assert.equal(launches, 1)
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('an aborted QA waiter opens no context and cannot let a later run pass its predecessor', async () => {
  const { makeDemoQa } = await import('../src/demo-qa-browser.js')
  const opened = []
  const firstRead = deferred()
  const firstPage = deferred()
  const closeStarted = deferred()
  const finishClose = deferred()
  let count = 0
  const browser = {
    isConnected: () => true,
    newContext: async () => {
      const first = count++ === 0
      opened.push(first ? 'first' : 'later')
      return {
        close: async () => {
          if (first) {
            closeStarted.resolve()
            firstPage.reject(new Error('context closed'))
            await finishClose.promise
          }
        },
        newPage: async () => ({
          on() {},
          off() {},
          route: async () => {},
          unroute: async () => {},
          close: async () => {},
          setViewportSize: async () => {},
          goto: async () => {
            if (first) {
              firstRead.resolve()
              return firstPage.promise
            }
            throw new Error('fixture page unavailable')
          }
        })
      }
    }
  }
  const qa = await makeDemoQa({ playwright: { chromium: { launch: async () => browser } } })
  const a = new AbortController()
  const b = new AbortController()
  const input = (label, signal) => ({ asked: { label, pages: ['/'] }, base: `https://${label}.test`, signal })
  const first = qa(input('first', a.signal))
  const firstRejected = assert.rejects(first, /stop running/)
  await firstRead.promise
  const waiter = qa(input('expired', b.signal))
  const waiterRejected = assert.rejects(waiter, /stop waiting/)
  const later = qa(input('later'))
  b.abort(new Error('stop waiting'))
  await waiterRejected
  assert.deepEqual(opened, ['first'])
  a.abort(new Error('stop running'))
  await closeStarted.promise
  assert.deepEqual(opened, ['first'], 'context cleanup must finish before a later run starts')
  finishClose.resolve()
  await firstRejected
  await later
  assert.deepEqual(opened, ['first', 'later'])
})

test('an expired QA deadline aborts a hanging browser read and lets the next request run', async (t) => {
  const { makeDemoQa } = await import('../src/demo-qa-browser.js')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const reading = deferred()
  const hanging = deferred()
  let closed = 0
  let contexts = 0
  const browser = {
    isConnected: () => true,
    newContext: async () => {
      const first = contexts++ === 0
      return {
        close: async () => {
          closed++
          if (first) hanging.reject(new Error('context closed'))
        },
        newPage: async () => ({
          on() {},
          off() {},
          route: async () => {},
          unroute: async () => {},
          close: async () => {},
          setViewportSize: async () => {},
          goto: async () => {
            if (first) {
              reading.resolve()
              return hanging.promise
            }
            throw new Error('fixture page unavailable')
          }
        })
      }
    }
  }
  const qa = await makeDemoQa({ playwright: { chromium: { launch: async () => browser } } })
  const first = qa({
    asked: { label: 'slow', pages: ['/', '/unread'], budgetMs: 1 },
    base: 'https://slow.test'
  })
  const rejected = assert.rejects(first, { code: 'DEMO_QA_DEADLINE' })
  await reading.promise
  t.mock.timers.tick(15_001)
  await rejected
  assert.equal(contexts, 1, 'the unread page must never open after expiry')
  assert.equal(closed, 1)
  const next = await qa({ asked: { pages: ['/'] }, base: 'https://next.test' })
  assert.deepEqual(next.pages, ['/'])
  assert.equal(closed, 2)
})
