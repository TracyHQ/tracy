/**
 * A long-open /ops tab learns that a new bundle was deployed.
 *
 * 12/10/2026: Akemi's tab kept running a bundle from before PR #1255 and showed "Reading…" on
 * Design Inspiration for good; a hard reload fixed it. Nothing told the tab a new deploy was out.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { entryScriptOf, watchBundle } = await import(
  new URL('../src/shell/bundle-freshness.ts', import.meta.url).href
)

const page = (entry) =>
  `<!doctype html><html><head><script type="module" crossorigin src="/ops/assets/${entry}"></script>` +
  '<link rel="stylesheet" crossorigin href="/ops/assets/index-AAA.css"></head><body></body></html>'

test('the entry script is read off the served index.html', () => {
  assert.equal(entryScriptOf(page('index-Cr-8PZoc.js')), '/ops/assets/index-Cr-8PZoc.js')
  assert.equal(entryScriptOf('<html>no bundle</html>'), null)
})

/** A window with the events the watcher listens to, and a clock the test moves by hand. */
function fakeWindow() {
  const target = new EventTarget()
  const timers = []
  return Object.assign(target, {
    document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    setInterval: (fn) => {
      timers.push(fn)
      return timers.length
    },
    clearInterval: (id) => {
      timers[id - 1] = null
    },
    tick: async () => {
      for (const fn of timers) await fn?.()
    }
  })
}

test('a deploy that changed the bundle is reported once, and the watch stops', async () => {
  const win = fakeWindow()
  let served = page('index-OLD.js')
  const stale = []
  const stop = watchBundle({
    win,
    current: '/ops/assets/index-OLD.js',
    fetchPage: async () => served,
    onStale: (next) => stale.push(next)
  })
  await win.tick()
  assert.deepEqual(stale, [], 'the same bundle is not news')
  served = page('index-NEW.js')
  await win.tick()
  assert.deepEqual(stale, ['/ops/assets/index-NEW.js'])
  await win.tick()
  assert.equal(stale.length, 1, 'said once, not on every tick')
  stop()
})

test('coming back to the tab checks at once, without waiting for the next tick', async () => {
  const win = fakeWindow()
  const stale = []
  watchBundle({
    win,
    current: '/ops/assets/index-OLD.js',
    fetchPage: async () => page('index-NEW.js'),
    onStale: (next) => stale.push(next)
  })
  win.document.dispatchEvent(new Event('visibilitychange'))
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(stale, ['/ops/assets/index-NEW.js'])
})

test('a failed read or a page with no entry is not a new version', async () => {
  const win = fakeWindow()
  const stale = []
  let answer = () => Promise.reject(new Error('offline'))
  watchBundle({
    win,
    current: '/ops/assets/index-OLD.js',
    fetchPage: () => answer(),
    onStale: (next) => stale.push(next)
  })
  await win.tick()
  answer = async () => '<html>Ops bundle not built</html>'
  await win.tick()
  assert.deepEqual(stale, [])
})

test('a tab that cannot name its own bundle (the dev server) never watches', async () => {
  const win = fakeWindow()
  let asked = 0
  watchBundle({
    win,
    current: null,
    fetchPage: async () => {
      asked++
      return page('index-NEW.js')
    },
    onStale: () => assert.fail('no stale report without a known bundle')
  })
  await win.tick()
  assert.equal(asked, 0)
})
