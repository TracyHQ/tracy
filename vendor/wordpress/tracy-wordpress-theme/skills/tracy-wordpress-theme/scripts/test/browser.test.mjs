// lib/browser.mjs is the one place every Playwright tool opens a browser, a context and a page.
// These tests drive it with a fake browser so they say what the contract is without Chromium:
// one browser for the whole run, one context per page and never leaked, N pages in flight at
// most, results in input order however the work finishes, and a page.evaluate that hangs
// becomes a named error instead of a silent stall.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  withBrowser,
  withPage,
  mapLimit,
  darkInitScript,
  initScriptFor,
  withTimeout,
  concurrencyFrom,
  lazyBrowser,
  isAlive
} from '../lib/browser.mjs'

function fakeBrowser() {
  const log = []
  const browser = {
    contexts: 0,
    open: 0,
    closed: false,
    async newContext(opts) {
      browser.contexts++
      browser.open++
      const ctx = {
        opts,
        scripts: [],
        cookies: [],
        pages: 0,
        async addInitScript(s) {
          ctx.scripts.push(s)
        },
        async addCookies(list) {
          for (const c of list) ctx.cookies.push({ ...c, beforePage: ctx.pages === 0 })
        },
        async newPage() {
          ctx.pages++
          const page = {
            gotoCalls: [],
            async goto(url, o) {
              page.gotoCalls.push([url, o])
              return { status: () => 200 }
            },
            async evaluate(fn, arg) {
              if (fn === 'hang') return new Promise(() => {})
              return typeof fn === 'function' ? fn(arg) : arg
            }
          }
          return page
        },
        async close() {
          browser.open--
          log.push('close')
        }
      }
      return ctx
    },
    async close() {
      browser.closed = true
    }
  }
  return { browser, log }
}

test('withBrowser launches once, hands the browser to the work, closes it even when the work throws', async () => {
  const { browser } = fakeBrowser()
  let launches = 0
  const launch = async () => {
    launches++
    return browser
  }
  const r = await withBrowser(async (b) => (b === browser ? 'ran' : 'wrong'), { launch })
  assert.equal(r, 'ran')
  assert.equal(launches, 1)
  assert.equal(browser.closed, true)
  const { browser: b2 } = fakeBrowser()
  await assert.rejects(() => withBrowser(async () => { throw new Error('boom') }, { launch: async () => b2 }), /boom/)
  assert.equal(b2.closed, true)
})

test('withPage: one context per page, dark hook installed before the page loads, context closed on error', async () => {
  const { browser } = fakeBrowser()
  let seenCtx
  const out = await withPage(
    browser,
    { viewport: { width: 390, height: 844 }, theme: 'dark', darkHook: 'attr:data-theme=dark' },
    async (page, ctx) => {
      seenCtx = ctx
      await page.goto('http://x/')
      return 'done'
    }
  )
  assert.equal(out, 'done')
  assert.equal(browser.contexts, 1)
  assert.equal(browser.open, 0, 'context closed')
  assert.equal(seenCtx.opts.colorScheme, 'dark')
  assert.deepEqual(seenCtx.opts.viewport, { width: 390, height: 844 })
  assert.match(seenCtx.scripts.join('\n'), /setAttribute\("data-theme", "dark"\)/)
  await assert.rejects(
    () => withPage(browser, { theme: 'light' }, async () => { throw new Error('nope') }),
    /nope/
  )
  assert.equal(browser.open, 0, 'context closed after a throw')
  assert.equal(browser.contexts, 2)
})

test('withPage: light pages get no dark hook; extra init scripts still apply', async () => {
  const { browser } = fakeBrowser()
  let seenCtx
  await withPage(browser, { theme: 'light', darkHook: 'class:t4-dark', initScripts: ['window.x=1'] }, async (_p, ctx) => {
    seenCtx = ctx
  })
  assert.equal(seenCtx.opts.colorScheme, 'light')
  assert.deepEqual(seenCtx.scripts, ['window.x=1'])
})

test('withPage: a cookie light hook is a request cookie for the site\'s origin, set before the page opens; dark pages ignore it', async () => {
  const { browser } = fakeBrowser()
  let light
  await withPage(browser, { theme: 'light', lightHook: 'cookie:ja_kinetic-theme=light', hookUrl: 'http://127.0.0.1:52002/index.php/pages/x', initScripts: ['window.x=1'] }, async (_p, ctx) => {
    light = ctx
  })
  assert.deepEqual(light.cookies, [{ name: 'ja_kinetic-theme', value: 'light', url: 'http://127.0.0.1:52002/', beforePage: true }])
  assert.deepEqual(light.scripts, ['window.x=1'], 'a cookie hook is not an init script')
  let dark
  await withPage(browser, { theme: 'dark', lightHook: 'cookie:ja_kinetic-theme=light', hookUrl: 'http://x/' }, async (_p, ctx) => {
    dark = ctx
  })
  assert.deepEqual(dark.cookies, [])
  assert.equal(browser.open, 0)
})

test('withPage: a light hook of another kind is an init script; a cookie hook without hookUrl is a named error; no hook, nothing', async () => {
  const { browser } = fakeBrowser()
  let seen
  await withPage(browser, { theme: 'light', lightHook: 'attr:data-theme=light+cookie:t=light', hookUrl: 'http://x/' }, async (_p, ctx) => {
    seen = ctx
  })
  assert.match(seen.scripts.join('\n'), /setAttribute\("data-theme", "light"\)/)
  assert.deepEqual(seen.cookies.map((c) => `${c.name}=${c.value}`), ['t=light'])
  await assert.rejects(() => withPage(browser, { theme: 'light', lightHook: 'cookie:t=light' }, async () => {}), /needs hookUrl/)
  let plain
  await withPage(browser, { theme: 'light' }, async (_p, ctx) => {
    plain = ctx
  })
  assert.deepEqual([plain.cookies, plain.scripts], [[], []])
  assert.equal(browser.open, 0)
})

test('withPage: a dark request hook is a request cookie on the dark pass only, next to the init-script dark hook; a cookie without hookUrl is a named error', async () => {
  const { browser } = fakeBrowser()
  let dark
  await withPage(browser, { theme: 'dark', darkHook: 'attr:data-theme=dark', darkRequestHook: 'cookie:ja_kinetic-theme=dark', hookUrl: 'http://127.0.0.1:52002/index.php/home-menu/home-blueprint' }, async (_p, ctx) => {
    dark = ctx
  })
  assert.deepEqual(dark.cookies, [{ name: 'ja_kinetic-theme', value: 'dark', url: 'http://127.0.0.1:52002/', beforePage: true }])
  assert.match(dark.scripts.join('\n'), /setAttribute\("data-theme", "dark"\)/)
  let light
  await withPage(browser, { theme: 'light', darkRequestHook: 'cookie:ja_kinetic-theme=dark', hookUrl: 'http://x/' }, async (_p, ctx) => {
    light = ctx
  })
  assert.deepEqual(light.cookies, [])
  await assert.rejects(() => withPage(browser, { theme: 'dark', darkRequestHook: 'cookie:t=dark' }, async () => {}), /dark request hook cookie:t=dark needs hookUrl/)
  assert.equal(browser.open, 0)
})

test('withPage wraps page.evaluate in a timeout so a hung page is a named error', async () => {
  const { browser } = fakeBrowser()
  await assert.rejects(
    () => withPage(browser, { evaluateTimeoutMs: 20 }, async (page) => page.evaluate('hang')),
    /page\.evaluate timed out after 20 ms/
  )
  assert.equal(browser.open, 0)
  const v = await withPage(browser, { evaluateTimeoutMs: 20 }, async (page) => page.evaluate((a) => a + 1, 1))
  assert.equal(v, 2)
})

test('mapLimit runs at most N at once and returns results in input order', async () => {
  let inFlight = 0
  let peak = 0
  const finished = []
  const results = await mapLimit([30, 10, 20, 5], 2, async (ms, i) => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, ms))
    inFlight--
    finished.push(i)
    return `r${i}`
  })
  assert.deepEqual(results, ['r0', 'r1', 'r2', 'r3'])
  assert.equal(peak, 2)
  assert.notDeepEqual(finished, [0, 1, 2, 3], 'work really finished out of order')
})

test('mapLimit flushes onDone in input order as results become available', async () => {
  const seen = []
  await mapLimit([20, 5], 2, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms))
    return i
  }, { onDone: (i, r) => seen.push([i, r]) })
  assert.deepEqual(seen, [[0, 0], [1, 1]])
})

test('mapLimit with a failing item rejects with that error (fail loudly, not silently partial)', async () => {
  await assert.rejects(() => mapLimit([1, 2], 2, async (x) => { if (x === 2) throw new Error('item 2'); return x }), /item 2/)
})

test('dark hooks: class, attr, cookie, ls, and the T4 double hook', () => {
  assert.match(initScriptFor('class:t4-dark'), /classList\.add\("t4-dark"\)/)
  assert.match(initScriptFor('class:t4-dark'), /MutationObserver/, 'waits for <html> to exist')
  assert.match(initScriptFor('attr:data-theme=dark'), /setAttribute\("data-theme", "dark"\)/)
  assert.equal(initScriptFor('cookie:tracy_theme=dark'), 'document.cookie = "tracy_theme=dark;path=/";')
  assert.equal(initScriptFor('ls:ngi-theme=dark'), 'localStorage.setItem("ngi-theme", "dark");')
  assert.match(darkInitScript('class:t4-dark+attr:data-bs-theme=dark'), /classList\.add\("t4-dark"\)[\s\S]*\n[\s\S]*setAttribute\("data-bs-theme", "dark"\)/)
  assert.throws(() => initScriptFor('magic:x'), /unknown dark hook/)
})

test('withTimeout names what timed out', async () => {
  await assert.rejects(() => withTimeout(new Promise(() => {}), 10, 'goto /about'), /goto \/about timed out after 10 ms/)
  assert.equal(await withTimeout(Promise.resolve(7), 10, 'x'), 7)
})

test('concurrencyFrom reads --concurrency, then TRACY_CONCURRENCY, then 4', () => {
  assert.equal(concurrencyFrom(['--concurrency', '2'], {}), 2)
  assert.equal(concurrencyFrom([], { TRACY_CONCURRENCY: '6' }), 6)
  assert.equal(concurrencyFrom([], {}), 4)
  assert.throws(() => concurrencyFrom(['--concurrency', '0'], {}), /concurrency/)
})

test('lazyBrowser.restart: a dead browser is replaced once however many jobs saw it die; a live one is kept', async () => {
  let launches = 0
  const make = () => {
    launches++
    let connected = true
    return { id: launches, isConnected: () => connected, kill: () => (connected = false), async close() { connected = false } }
  }
  const lb = lazyBrowser({ launch: async () => make() })
  const first = await lb.get()
  assert.equal(await lb.restart(first), first, 'a live browser is not replaced')
  assert.equal(launches, 1)
  first.kill()
  assert.equal(isAlive(first), false)
  // three in-flight jobs notice the same death
  const [a, b, c] = await Promise.all([lb.restart(first), lb.restart(first), lb.restart(first)])
  assert.equal(a.id, 2)
  assert.equal(b, a)
  assert.equal(c, a)
  assert.equal(launches, 2, 'one relaunch for one death')
  assert.equal(lb.restarts(), 1)
  assert.equal(await lb.get(), a)
  assert.equal(isAlive({}), true, 'a fake without isConnected counts as alive')
})
