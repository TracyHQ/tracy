/**
 * The emitted bundle, run: two generations on one page, the picker's gate, and the picker itself.
 *
 * The two-generations tests run against the ACTUAL first release — the refresh-only bundle the
 * Tracy themes shipped before the picker (`fixtures/legacy-tracy-preview-49bbcdfb1.js.txt`, taken
 * with `git show 98d22a78b~1:packages/cms/tracy-wordpress-theme/src/tracy/assets/js/tracy-preview.js`)
 * — because the promise is about code already on customer sites, which a re-creation would only
 * approximate. The fixture is `.txt` so no linter or formatter rewrites it.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CHANNEL,
  PICK,
  VERSION,
  VIEW,
  holdMessage,
  pickMessage,
  refreshMessage,
  revealMessage,
  scrollToMessage,
  trackMessage,
  viewFrom,
  LOCKSTEP_WAIT_MS
} from '../protocol.mjs'
import { RUNTIME_VERSION, bundle } from '../scripts/build.mjs'
import { doc, h } from './stub-dom.mjs'

const LEGACY = readFileSync(
  new URL('./fixtures/legacy-tracy-preview-49bbcdfb1.js.txt', import.meta.url),
  'utf8'
)
/**
 * Runtime 4 as it shipped (one pick at a time, `picked {moved:true}`, no `track`), taken from the
 * WordPress theme's copy at 9050d42d5 before runtime 5 replaced it: pages built before a site's theme
 * or image is rebuilt still carry it, and runtime 5 must live beside it.
 */
const RUNTIME_4 = readFileSync(new URL('./fixtures/runtime-4-9050d42d5.js.txt', import.meta.url), 'utf8')
/**
 * Runtime 5 as it shipped (tracked elements, no `pick-reveal`, no `pending`), taken from the WordPress
 * theme's copy at 516d4a517 before runtime 7 (6 = `inside`, 7 = `inside` + reveal) replaced it:
 * runtime 7 must live beside it, and the side card may send it `pick-reveal` before the site's theme
 * or image is rebuilt.
 */
const RUNTIME_5 = readFileSync(new URL('./fixtures/runtime-5-516d4a517.js.txt', import.meta.url), 'utf8')
const PARENT = 'https://cowork.tracy.site'
const STRANGER = 'https://evil.example'

/**
 * A framed page with a nav item, a marked article and a password field.
 * @param {{ extra?: object[] }} [options] - more elements appended to the body (built with `h`).
 */
function stage({ extra = [] } = {}) {
  const posted = []
  const parent = { postMessage: (message, target) => posted.push({ message, target }) }
  const span = h('span', { rect: [110, 20, 60, 16], text: 'Home' })
  const li = h('li', { rect: [100, 10, 90, 36], cls: 'item-101' }, [
    h('a', { rect: [105, 15, 80, 26] }, [span])
  ])
  const nav = h('nav', { rect: [0, 0, 1280, 56] }, [h('ul', { rect: [100, 10, 400, 36] }, [li])])
  const password = h('input', { rect: [100, 300, 200, 30], attrs: { type: 'password', value: 'hunter2' } })
  const article = h('article', { rect: [80, 100, 800, 400], attrs: { 'data-tracy-src': 'post:12:lake' } }, [
    password
  ])
  const body = h('body', { rect: [0, 0, 1280, 4000] }, [nav, article, ...extra])
  const document = doc(body)
  const listeners = { window: new Map(), document: new Map() }
  const on = (table) => (name, fn, capture) => {
    if (!table.has(name)) table.set(name, [])
    table.get(name).push({ fn, capture: capture === true })
  }
  const off = (table) => (name, fn, capture) => {
    const list = table.get(name) ?? []
    const i = list.findIndex((entry) => entry.fn === fn && entry.capture === (capture === true))
    if (i >= 0) list.splice(i, 1)
  }
  let reloads = 0
  const frames = []
  const timers = []
  /** The delay each `setTimeout` asked for, in call order. */
  const delays = []
  /** Every MutationObserver the page made, so a test can report a DOM change to it. */
  const observers = []
  class MutationObserver {
    constructor(fn) {
      this.fn = fn
      this.watching = false
      observers.push(this)
    }
    observe() {
      this.watching = true
    }
    disconnect() {
      this.watching = false
    }
  }
  /** Every `scrollTo` the page made, as `[x, y]`. */
  const scrolledTo = []
  const window = {
    MutationObserver,
    scrollX: 0,
    scrollY: 0,
    scrollTo(a, b) {
      const x = typeof a === 'object' && a !== null ? a.left : a
      const y = typeof a === 'object' && a !== null ? a.top : b
      scrolledTo.push([x, y])
      window.scrollX = x
      window.scrollY = Math.min(y, window.maxScrollY ?? Infinity)
    },
    TracyPreviewStarted: undefined,
    TracyPreviewRuntime: undefined,
    parent,
    location: {
      origin: 'https://site.example',
      href: 'https://site.example/about/',
      reload() {
        reloads += 1
      }
    },
    addEventListener: on(listeners.window),
    removeEventListener: off(listeners.window),
    requestAnimationFrame: (fn) => frames.push(fn),
    setTimeout: (fn, ms) => {
      delays.push(ms)
      return timers.push(fn)
    },
    clearTimeout: () => {
      timers.length = 0
    }
  }
  document.addEventListener = on(listeners.document)
  document.removeEventListener = off(listeners.document)
  document.createElement = (tag) => {
    const node = h(tag, { rect: [0, 0, 0, 0] })
    node.ownerDocument = document
    return node
  }
  document.currentScript = null
  document.readyState = 'complete'
  document.baseURI = 'https://site.example/'
  const stylesheet = document.querySelectorAll.bind(document)
  document.querySelectorAll = (selector) => (selector.startsWith('link') ? [] : stylesheet(selector))
  const html = document.documentElement
  html.appendChild = (node) => {
    node.parentElement = html
    node.parentNode = html
    html.children.push(node)
  }
  html.removeChild = (node) => {
    html.children.splice(html.children.indexOf(node), 1)
    node.parentNode = null
  }
  const fire = (table, name, event) => {
    // A copy, not the live list: a listener may remove itself (or others) while this runs.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const { fn } of [...(listeners[table].get(name) ?? [])]) fn(event)
  }
  /**
   * An event on the page as the browser dispatches it: the window's listeners first (capture), then
   * the document's, unless one stopped it; `stopImmediatePropagation` also stops the rest on its target.
   */
  const flow = (name, event) => {
    let stopped = false
    let immediate = false
    const e = Object.create(event)
    e.stopPropagation = () => {
      stopped = true
      if (typeof event.stopPropagation === 'function') event.stopPropagation()
    }
    e.stopImmediatePropagation = () => {
      stopped = true
      immediate = true
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
    }
    for (const table of ['window', 'document']) {
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const { fn } of [...(listeners[table].get(name) ?? [])]) {
        if (immediate) return
        fn(e)
      }
      if (stopped) return
    }
  }
  return {
    window,
    document,
    posted,
    listeners,
    span,
    article,
    password,
    reloads: () => reloads,
    /** Deliver a message as the browser would, from `source` at `origin`. */
    send: (data, { source = parent, origin = PARENT } = {}) =>
      fire('window', 'message', { data, source, origin }),
    fire: (name, event = {}) => fire('window', name, event),
    /** An event dispatched on the page (window capture, then document): what a pointer or key does. */
    fireDoc: (name, event) => flow(name, event),
    delays,
    scrolledTo,
    /** Run the oldest queued timer only (frames stay queued). */
    step() {
      if (timers.length > 0) timers.shift()()
    },
    /** Run the animation frames queued so far — one painted frame; frames they queue wait. */
    frame() {
      for (const fn of frames.splice(0)) fn()
    },
    /** How many animation frames are queued. */
    queuedFrames: () => frames.length,
    /** Run every queued animation frame, then every queued timer. */
    flush() {
      while (frames.length > 0) frames.shift()()
      while (timers.length > 0) timers.shift()()
    },
    overlay: () => html.children.find((node) => node.tagName === 'TRACY-PICK') ?? null,
    /** The tracked outlines the page drew, in drawing order. */
    outlines: () => html.children.filter((node) => node.tagName === 'TRACY-PIN'),
    /** Tell every watching MutationObserver that `target` changed. */
    mutate(target) {
      for (const observer of observers)
        if (observer.watching) observer.fn([{ type: 'childList', target }], observer)
    },
    watching: () => observers.filter((observer) => observer.watching).length,
    replies: (kind) => posted.filter((entry) => entry.message.kind === kind)
  }
}

/**
 * The `data-*` attributes of one script tag, as the site proxy writes them: `data-parent-origin` for a
 * vouched picker, `data-report-origin` for a page that only says where it is (runtime 18).
 * @param {{ parentOrigin?: string, reportOrigin?: string }} script
 */
function datasetOf(script) {
  const dataset = {}
  if (script.parentOrigin !== undefined) dataset.parentOrigin = script.parentOrigin
  if (script.reportOrigin !== undefined) dataset.reportOrigin = script.reportOrigin
  return dataset
}

/**
 * Evaluate scripts on one page, in order, each as its own `<script>` tag.
 * @param {ReturnType<typeof stage>} page
 * @param {Array<{ source: string, parentOrigin?: string, reportOrigin?: string }>} scripts
 * @param {() => void} body - runs while the page is the global one (listeners read globals lazily).
 */
function run(page, scripts, body) {
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = page.window
  globalThis.document = page.document
  try {
    for (const script of scripts) {
      page.document.currentScript = { dataset: datasetOf(script) }
      // eslint-disable-next-line no-eval -- the emitted IIFE is the artefact under test
      ;(0, eval)(script.source)
      page.document.currentScript = null
    }
    body()
  } finally {
    globalThis.window = previous.window
    globalThis.document = previous.document
  }
}

const current = await bundle()
const newer = await bundle({ runtimeVersion: RUNTIME_VERSION + 1 })
const legacy = { source: LEGACY }
const plain = { source: current }
const vouched = { source: current, parentOrigin: PARENT }
const newerVouched = { source: newer, parentOrigin: PARENT }

/** Send one full refresh and one pick-start; report how many reloads and whether anyone answered. */
function exercise(page) {
  page.send(refreshMessage('full'))
  page.send(pickMessage(PICK.start))
  page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
  return { reloads: page.reloads(), picked: page.replies(PICK.picked).length }
}

// ── Two generations on one page ───────────────────────────────────────────────────────────────

test('old then new: the old agent keeps refresh, the new one adds only the picker', () => {
  const page = stage()
  run(page, [legacy, vouched], () => {
    assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    assert.equal(page.window.TracyPreviewRuntime.legacyOwnsRefresh, true)
  })
})

test('new then old: the old agent backs off on the flag, the new one does both', () => {
  const page = stage()
  run(page, [vouched, legacy], () => {
    assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    assert.equal(page.window.TracyPreviewStarted, true)
  })
})

test('new then newer: the newer disposes the older, one listener answers', () => {
  const page = stage()
  run(page, [vouched, newerVouched], () => {
    assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION + 1)
    assert.equal(page.listeners.window.get('message').length, 1)
  })
})

test('newer then older: the older finds a higher version and installs nothing', () => {
  const page = stage()
  run(page, [newerVouched, vouched], () => {
    assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION + 1)
  })
})

test('old then new₁ then new₂: the flag is inherited, no second refresh listener appears', () => {
  const page = stage()
  run(page, [legacy, vouched, newerVouched], () => {
    assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    assert.equal(page.window.TracyPreviewRuntime.legacyOwnsRefresh, true)
  })
})

test('the same copy included twice installs once', () => {
  const page = stage()
  run(page, [vouched, vouched], () => {
    assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    assert.equal(page.replies('ready').length, 1)
  })
})

test('a newer theme copy without the attribute keeps the picker the proxy vouched for', () => {
  const page = stage()
  run(page, [vouched, { source: newer }], () => {
    assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    assert.equal(page.window.TracyPreviewRuntime.parentOrigin, PARENT)
  })
})

// ── Refresh reads the stylesheet on disk, not the one in the cache (V5S-2) ───────────────────────

/**
 * A page with two stylesheets of its own (one already stamped by an earlier swap) and one from a font
 * service, and a `fetch` that records each call and settles only when the test says so.
 */
function sheetStage() {
  const page = stage()
  const head = { children: [] }
  const link = (href) => {
    const node = {
      href,
      parentNode: head,
      listeners: {},
      addEventListener(name, fn) {
        node.listeners[name] = fn
      },
      cloneNode: () => link(href)
    }
    return node
  }
  head.insertBefore = (node, after) => {
    node.parentNode = head
    head.children.splice(head.children.indexOf(after) + 1, 0, node)
  }
  head.removeChild = (node) => {
    head.children.splice(head.children.indexOf(node), 1)
    node.parentNode = null
  }
  head.children.push(
    link('https://site.example/wp-content/themes/t/assets/css/sections.css?ver=1.1.2'),
    link('https://site.example/wp-content/themes/t/assets/css/tracy.css?ver=1.1.2&tracy-preview=17'),
    link('https://fonts.example/css2?family=Inter')
  )
  const select = page.document.querySelectorAll
  page.document.querySelectorAll = (selector) =>
    selector.startsWith('link') ? [...head.children] : select(selector)
  const fetches = []
  page.window.fetch = (url, init) =>
    new Promise((resolve) => {
      fetches.push({ url, init, resolve })
    })
  return { page, head, fetches }
}

/** Like `run`, but the page stays the global one until `body`'s promise settles. */
async function runAsync(page, scripts, body) {
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = page.window
  globalThis.document = page.document
  try {
    for (const script of scripts) {
      page.document.currentScript = { dataset: datasetOf(script) }
      // eslint-disable-next-line no-eval -- the emitted IIFE is the artefact under test
      ;(0, eval)(script.source)
      page.document.currentScript = null
    }
    await body()
  } finally {
    globalThis.window = previous.window
    globalThis.document = previous.document
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('🔒 a full refresh fetches the page’s own stylesheets past the cache, then reloads (V5S-2)', async () => {
  const { page, fetches } = sheetStage()
  await runAsync(page, [vouched], async () => {
    page.send(refreshMessage('full'))
    assert.equal(page.replies('applied').at(-1).message.mode, 'full')
    // The bare addresses the next load asks for — the earlier swap's stamp gone, the font service left alone.
    assert.deepEqual(
      fetches.map((f) => f.url),
      [
        'https://site.example/wp-content/themes/t/assets/css/sections.css?ver=1.1.2',
        'https://site.example/wp-content/themes/t/assets/css/tracy.css?ver=1.1.2'
      ]
    )
    for (const f of fetches)
      assert.deepEqual(f.init, { cache: 'reload', mode: 'no-cors', credentials: 'include' })
    assert.equal(page.reloads(), 0, 'no reload while the fresh copies are still on their way')
    for (const f of fetches) f.resolve({})
    await settle()
    assert.equal(page.reloads(), 1)
    page.step()
    assert.equal(page.reloads(), 1, 'the time cap does not reload a second time')
  })
})

test('a full refresh whose stylesheet fetch hangs still reloads once the cap runs out', async () => {
  const { page, fetches } = sheetStage()
  await runAsync(page, [vouched], async () => {
    page.send(refreshMessage('full'))
    assert.equal(fetches.length, 2)
    assert.equal(page.reloads(), 0)
    page.step()
    assert.equal(page.reloads(), 1)
    for (const f of fetches) f.resolve({})
    await settle()
    assert.equal(page.reloads(), 1)
  })
})

test('a page without fetch, or without a stylesheet of its own, reloads at once', async () => {
  const { page } = sheetStage()
  delete page.window.fetch
  await runAsync(page, [vouched], async () => {
    page.send(refreshMessage('full'))
    assert.equal(page.reloads(), 1)
  })
})

test('🔒 a style refresh swaps stamped copies AND refreshes the bare address the next load reads (V5S-2)', async () => {
  const { page, head, fetches } = sheetStage()
  await runAsync(page, [vouched], async () => {
    page.send(refreshMessage('style'))
    assert.equal(page.replies('applied').at(-1).message.mode, 'style')
    assert.equal(page.reloads(), 0)
    assert.deepEqual(
      fetches.map((f) => [f.url, f.init.cache]),
      [
        ['https://site.example/wp-content/themes/t/assets/css/sections.css?ver=1.1.2', 'reload'],
        ['https://site.example/wp-content/themes/t/assets/css/tracy.css?ver=1.1.2', 'reload']
      ]
    )
    const hrefs = head.children.map((node) => node.href)
    assert.equal(hrefs.length, 5, 'each own sheet has its fresh copy beside it until that one loads')
    const swapped = hrefs.filter((href) => /[?&]tracy-preview=\d+/.test(href))
    assert.equal(swapped.length, 3)
    assert.ok(
      swapped.every((href) => (href.match(/tracy-preview=/g) ?? []).length === 1),
      'one stamp, never two'
    )
  })
})

test('dispose removes every listener the runtime added', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.window.TracyPreviewRuntime.dispose()
    for (const table of Object.values(page.listeners))
      for (const [name, list] of table) assert.equal(list.length, 0, `${name} still has a listener`)
    assert.equal(page.overlay(), null)
    assert.equal(page.document.documentElement.style.cursor, '')
  })
})

// ── The gate ──────────────────────────────────────────────────────────────────────────────────

test('without data-parent-origin there is no picker: no feature, pick-* ignored', () => {
  const page = stage()
  run(page, [plain], () => {
    assert.deepEqual(page.replies('ready')[0].message, {
      channel: CHANNEL,
      v: VERSION,
      kind: 'ready',
      features: []
    })
    assert.deepEqual(exercise(page), { reloads: 1, picked: 0 })
    assert.equal(page.overlay(), null)
  })
})

test('with it, ready names pick and the page, and goes to the vouched origin only', () => {
  // 28/09/2026: ready went to '*' and so could not say which page it was; after a link followed
  // inside the frame the side card located the pick, and told the agent, on the page it had opened.
  // The proxy's `frame-ancestors <origin>` means the parent IS that origin, so nothing is lost.
  const page = stage()
  run(page, [vouched], () => {
    const [ready] = page.replies('ready')
    assert.deepEqual(ready.message, {
      channel: CHANNEL,
      v: VERSION,
      kind: 'ready',
      features: [
        'pick',
        'track',
        'reveal',
        'text',
        'hold',
        'scroll',
        'follow',
        'lockstep',
        'name',
        'clip',
        'route',
        'refocus',
        'pins60',
        'wheel',
        'widen'
      ],
      url: 'https://site.example/about/'
    })
    assert.equal(ready.target, PARENT)
    page.fire('pageshow')
    assert.deepEqual(
      page.replies('ready').map((entry) => [entry.target, entry.message.url]),
      [
        [PARENT, 'https://site.example/about/'],
        [PARENT, 'https://site.example/about/']
      ]
    )
  })
})

test('an address past the limit is left out of ready, not cut', () => {
  const page = stage()
  page.window.location.href = `https://site.example/${'a'.repeat(2048)}`
  run(page, [vouched], () => {
    const [ready] = page.replies('ready')
    assert.equal(ready.target, PARENT)
    assert.equal('url' in ready.message, false)
  })
})

/**
 * 🔒 WHAT IS SENT IS THE PAGE, NOT ITS CREDENTIALS (28/09/2026). It was `location.href` whole, and that
 * address rides into `content.locate` and into the agent's turn: `user:password@` from a basic-auth
 * preview, a `#access_token=…` fragment from an admin screen, and the one-time `tracy_preview` ticket,
 * which stays in the bar after the proxy redeems it (a redeemed ticket gets no 303).
 */
test('🔒 the address sent carries no ticket, no credentials and no fragment', () => {
  const cases = [
    ['https://site.example/about/?tracy_preview=pv1abc&page=2', 'https://site.example/about/?page=2'],
    ['https://u:p@site.example/about/', 'https://site.example/about/'],
    ['https://site.example/wp-admin/#access_token=ya29.secret', 'https://site.example/wp-admin/'],
    ['https://site.example/x/?token=t&api_key=k&id=7', 'https://site.example/x/?id=7'],
    ['https://site.example/x/?TRACY_PREVIEW=pv1', 'https://site.example/x/']
  ]
  for (const [href, want] of cases) {
    const page = stage()
    page.window.location.href = href
    run(page, [vouched], () => {
      assert.equal(page.replies('ready')[0].message.url, want, href)
    })
  }
})

/**
 * 🔒 A LONG ADDRESS NAMES ITS OWN PAGE OR NONE — never the tab's. Over the limit the whole address was
 * dropped, and the side card fell back to the address it had opened: a pick on `/about/` reported as
 * the home page, the very bug `url` was added to fix. The query is trimmed instead, so origin and path
 * survive; only a path that is itself too long has nothing left to send.
 */
test('🔒 a long address keeps its own origin and path, trimming the query', () => {
  const page = stage()
  page.window.location.href = `https://site.example/about/?keep=1&big=${'a'.repeat(2100)}`
  run(page, [vouched], () => {
    const url = page.replies('ready')[0].message.url
    assert.ok(url.length <= 2048, String(url.length))
    assert.ok(url.startsWith('https://site.example/about/'), url)
    assert.doesNotMatch(url, /aaaa/)
  })
})

test('an origin that is not exactly an http(s) origin turns nothing on', () => {
  for (const parentOrigin of [
    'https://cowork.tracy.site/',
    'javascript:alert(1)',
    '*',
    'null',
    'cowork.tracy.site'
  ]) {
    const page = stage()
    run(page, [{ source: current, parentOrigin }], () => {
      assert.deepEqual(page.replies('ready')[0].message.features, [], parentOrigin)
    })
  }
})

test('pick-* from another origin or another window is ignored', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start), { origin: STRANGER })
    page.send(pickMessage(PICK.start), { source: {} })
    page.send(pickMessage(PICK.start), { source: page.window })
    assert.equal(page.listeners.document.get('click'), undefined, 'the picker never started')
  })
})

test('every pick reply goes to the vouched origin, never to *', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('mousemove', { clientX: 130, clientY: 28 })
    page.flush()
    page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
    page.send(pickMessage(PICK.stop))
    const replies = page.posted.filter(
      (entry) => String(entry.message.kind).startsWith('pick') || entry.message.kind === 'picked'
    )
    assert.deepEqual(
      replies.map((entry) => entry.message.kind),
      [PICK.scroll, PICK.step, PICK.hover, PICK.picked, PICK.cancel]
    )
    for (const entry of replies) assert.equal(entry.target, PARENT)
  })
})

// ── The picker ────────────────────────────────────────────────────────────────────────────────

test('picking: a thin faint outline follows the pointer, a click fixes it 2px solid and reports the target', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    assert.equal(page.document.documentElement.style.cursor, 'crosshair')
    page.fireDoc('mousemove', { clientX: 130, clientY: 28 })
    page.flush()
    const outline = page.overlay()
    assert.ok(outline !== null)
    // Hover and picked are one family that differs in strength (Akemi 01/10/2026): 1px solid at 70%
    // with a faint fill under the pointer, 2px solid with a stronger fill once picked.
    assert.doesNotMatch(outline.style.cssText, /dashed/)
    assert.match(outline.style.cssText, /border:1px solid rgba\(191,91,61,\.7\) !important/)
    assert.match(outline.style.cssText, /background:rgba\(191,91,61,\.06\) !important/)
    assert.match(outline.style.cssText, /pointer-events:none !important/)
    assert.match(outline.style.cssText, /^all:initial !important/)
    assert.equal(page.replies(PICK.hover)[0].message.target.text, 'Home')
    let prevented = 0
    page.fireDoc('click', {
      clientX: 130,
      clientY: 28,
      preventDefault: () => (prevented += 1),
      stopPropagation() {}
    })
    assert.equal(prevented, 1, 'the click must not open the link')
    assert.match(outline.style.cssText, /border:2px solid rgb\(191,91,61\) !important/)
    assert.match(outline.style.cssText, /background:rgba\(191,91,61,\.1\) !important/)
    const target = page.replies(PICK.picked)[0].message.target
    assert.equal(target.tag, 'span')
    assert.deepEqual(target.marks, ['menuItem:101'])
    assert.equal(page.document.documentElement.style.cursor, '', 'the cursor is given back once picked')
    // Runtime 15: the move listener lives as long as the runtime (added once at load) and does nothing
    // once picked.
    const hovers = page.replies(PICK.hover).length
    page.fireDoc('mousemove', { clientX: 400, clientY: 200 })
    page.flush()
    assert.equal(page.replies(PICK.hover).length, hovers, 'hover stops once picked')
    assert.match(outline.style.cssText, /solid/)
  })
})

test('hover is sent once per element, not once per mouse move', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    for (let x = 120; x < 160; x += 2) {
      page.fireDoc('mousemove', { clientX: x, clientY: 28 })
      page.flush()
    }
    assert.equal(page.replies(PICK.hover).length, 1)
  })
})

test('pick-level moves the solid outline to that level, and ignores an index it never reported', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 150, clientY: 310, preventDefault() {}, stopPropagation() {} })
    const target = page.replies(PICK.picked)[0].message.target
    assert.deepEqual(
      target.levels.map((level) => level.tag),
      ['input', 'article']
    )
    assert.ok(!JSON.stringify(target).includes('hunter2'), 'a password never leaves the page')
    page.send({ ...pickMessage(PICK.level, 1) })
    assert.match(page.overlay().style.cssText, /left:76px/)
    page.send({ channel: CHANNEL, v: VERSION, kind: PICK.level, index: 9 })
    page.send({ channel: CHANNEL, v: VERSION, kind: PICK.level, index: 0.5 })
    assert.match(page.overlay().style.cssText, /left:76px/)
    page.send(pickMessage(PICK.level, 0))
    assert.match(page.overlay().style.cssText, /left:96px/)
  })
})

test('pick-level (runtime 19, widen) moves the pick: a fresh picked for that level, the first levels kept', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 150, clientY: 310, preventDefault() {}, stopPropagation() {} })
    const first = page.replies(PICK.picked)[0].message.target
    page.send(pickMessage(PICK.level, 1))
    const picks = page.replies(PICK.picked)
    assert.equal(picks.length, 2, 'one fresh report for the level')
    const wide = picks[1].message
    assert.equal(wide.moved, undefined, 'a new place, not a box that moved')
    assert.equal(wide.target.level, 1)
    assert.equal(wide.target.tag, 'article')
    assert.notEqual(wide.target.selector, first.selector)
    assert.deepEqual(wide.target.marks, ['post:12:lake'])
    assert.deepEqual(wide.target.levels, first.levels)
    page.send({ channel: CHANNEL, v: VERSION, kind: PICK.level, index: 7 })
    assert.equal(page.replies(PICK.picked).length, 2, 'an index never reported says nothing')
    page.send(pickMessage(PICK.level, 0))
    const back = page.replies(PICK.picked)[2].message.target
    assert.equal(back.level, 0)
    assert.equal(back.selector, first.selector)
  })
})

test('Escape and pick-stop cancel and clean up; pagehide resets without a word', () => {
  for (const leave of ['escape', 'stop', 'pagehide']) {
    const page = stage()
    run(page, [vouched], () => {
      page.send(pickMessage(PICK.start))
      page.fireDoc('mousemove', { clientX: 130, clientY: 28 })
      page.flush()
      if (leave === 'escape')
        page.fireDoc('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} })
      if (leave === 'stop') page.send(pickMessage(PICK.stop))
      if (leave === 'pagehide') page.fire('pagehide')
      assert.equal(page.overlay(), null, leave)
      assert.equal(page.document.documentElement.style.cursor, '', leave)
      assert.equal(page.replies(PICK.cancel).length, leave === 'pagehide' ? 0 : 1, leave)
      // Runtime 15: the listeners stay (added once at load, ahead of the page's) and leave the page alone.
      assert.equal(clickThrough(page, 'click').prevented, 0, `${leave}: the page has its clicks back`)
      assert.equal(clickThrough(page, 'mousedown').prevented, 0, leave)
    })
  }
})

test('pick-stop when not picking says nothing', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.stop))
    assert.equal(page.replies(PICK.cancel).length, 0)
  })
})

test('the bundle is safe to inline in a <script> and stays small', () => {
  assert.ok(!/<\/script/i.test(current))
  assert.ok(!current.includes('<!--'))
  // 12000 until runtime 5; tracked elements (validation, outlines by state, the observer) cost ~3 KB
  // of minified code, so the ceiling moved once, to 14000; runtime 7's reveal (scroll, flash) ~0.8 KB
  // and `inside` (a container's words) together put it just past 15000 (15202 at the merge), so
  // 16000; runtime 11's hold (three capture listeners and a report, +~0.3 KB) and its scroll report
  // and restore (~0.9 KB), merged, put it at 17506, so 18000; runtime 12's `follow` (where an outline
  // is placed from: the ancestor walk, the root's box, the page edges; ~1.7 KB) put it at 19197, so
  // 20000; runtime 14 (lockstep scrolling, `hidden`, names for icons, images and embeds, a steadier
  // selector found again by its words, open shadow roots, the frame check for layout that moves without
  // a scroll, the focus guard, route changes, modal dialogs; ~14.7 KB) put it at 33894, so 36000;
  // runtime 15's focus guard grew it to 35949, and fetching the page's stylesheets past the cache on
  // every refresh (V5S-2, ~0.55 KB) put it at 36498, so 37000; runtime 16 (content at the pointer,
  // the press gap between a pick and its hold, `pick-wheel`, finding an element whose id went; ~2 KB)
  // put it at 38522, so 40000; runtime 17's view report (address, scroll, window, scheme; ~1 KB) put it
  // at 39495, still under; runtime 19's `widen` (the pick moved to a level, the boxed-ancestor walk;
  // ~0.6 KB) put it at 40504, so 42000; runtime 20's level names (labels, landmarks, title headings,
  // the run of wrappers kept as one; ~1.8 KB) put it at 42289, so 44000. It still exists to catch a
  // dependency or a table dragged into a script inlined into every framed page.
  assert.ok(current.length < 44000, `bundle is ${String(current.length)} bytes`)
})

test('hover and pick replies name the page the customer is on; nothing posted to * does', () => {
  // The address bar of the Browser tab does not follow a click inside the frame (27/09/2026: a pick on
  // /about/ after an in-frame click was sent as the home page). Only messages to the vouched origin
  // carry the page's own address.
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('mousemove', { clientX: 130, clientY: 28 })
    page.flush()
    page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
    page.send(refreshMessage('style'))
    assert.equal(page.replies(PICK.hover)[0].message.url, 'https://site.example/about/')
    assert.equal(page.replies(PICK.picked)[0].message.url, 'https://site.example/about/')
    for (const entry of page.posted.filter((e) => e.target === '*'))
      assert.equal('url' in entry.message, false)
  })
  const bare = stage()
  run(bare, [plain], () => {
    const [ready] = bare.replies('ready')
    assert.equal(ready.target, '*')
    assert.equal('url' in ready.message, false)
  })
})

// ── The pick follows the page ─────────────────────────────────────────────────────────────────

/**
 * Pick the nav span, then let the test move it: the stub's boxes are fixed, so its
 * `getBoundingClientRect` is swapped for one reading `where`.
 * @param {ReturnType<typeof stage>} page
 */
function pickSpan(page) {
  const where = { x: 110, y: 20 }
  page.send(pickMessage(PICK.start))
  page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
  page.span.getBoundingClientRect = () => ({
    x: where.x,
    y: where.y,
    left: where.x,
    top: where.y,
    width: 60,
    height: 16,
    right: where.x + 60,
    bottom: where.y + 16
  })
  return where
}

/** @param {ReturnType<typeof stage>} page - the `picked` replies sent again for a moved box. */
const moves = (page) => page.replies(PICK.picked).filter((entry) => entry.message.moved === true)

test('a picked element reports its new box on scroll, once per frame, to the vouched origin', () => {
  // 28/09/2026: the page redrew its outline on scroll but never said where the element went, so the
  // side card's popover stayed where the element had been.
  const page = stage()
  run(page, [vouched], () => {
    const where = pickSpan(page)
    const first = page.replies(PICK.picked)[0].message.target
    where.y = -80
    page.fire('scroll')
    page.fire('scroll')
    page.fire('scroll')
    assert.equal(moves(page).length, 0, 'nothing before the frame')
    page.flush()
    assert.equal(moves(page).length, 1, 'one report per frame, however many scroll events')
    const [move] = moves(page)
    assert.equal(move.target, PARENT)
    assert.equal(move.message.url, 'https://site.example/about/')
    assert.deepEqual(move.message.target.rect, { x: 110, y: -80, width: 60, height: 16 })
    assert.deepEqual(move.message.target.levels[0].rect, { x: 110, y: -80, width: 60, height: 16 })
    // The same pick: only the boxes moved.
    assert.deepEqual({ ...move.message.target, rect: first.rect, levels: first.levels }, first)
    assert.match(page.overlay().style.cssText, /top:-84px/, 'the outline follows on every event')
  })
})

test('a resize reports too; a scroll that moved nothing reports nothing', () => {
  const page = stage()
  run(page, [vouched], () => {
    const where = pickSpan(page)
    page.fire('scroll')
    page.flush()
    assert.equal(moves(page).length, 0)
    where.x = 40
    page.fire('resize')
    page.flush()
    assert.deepEqual(
      moves(page).map((entry) => entry.message.target.rect.x),
      [40]
    )
  })
})

test('no box is reported once the pick is left; an element taken out of the page is reported clipped, once', () => {
  for (const leave of ['stop', 'escape', 'start', 'queued', 'removed']) {
    const page = stage()
    run(page, [vouched], () => {
      const where = pickSpan(page)
      where.y = 300
      if (leave === 'queued') page.fire('scroll')
      if (leave === 'stop' || leave === 'queued') page.send(pickMessage(PICK.stop))
      if (leave === 'escape')
        page.fireDoc('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} })
      // The popover's X, or a send that landed: the tab asks the page to point again.
      if (leave === 'start') page.send(pickMessage(PICK.start))
      if (leave === 'removed') page.span.isConnected = false
      page.fire('scroll')
      page.fire('resize')
      page.flush()
      if (leave !== 'removed') assert.equal(moves(page).length, 0, leave)
      else {
        // Runtime 14 (acceptance v3 J19): its selector finds nothing, so it is gone — at its last box.
        assert.equal(moves(page).length, 1, leave)
        assert.equal(moves(page)[0].message.target.hidden, 'clipped')
        assert.deepEqual(moves(page)[0].message.target.rect, page.replies(PICK.picked)[0].message.target.rect)
      }
    })
  }
})

// ── Tracked elements (feature `track`, runtime 5) ─────────────────────────────────────────────

const track = (items) => ({ channel: CHANNEL, v: VERSION, kind: PICK.track, items })
const item = (id, selector, text, state = 'saved') => ({ id, selector, text, state })

/**
 * Give an element a box the test can move: `el.box = [x, y, w, h]` from now on.
 * @param {object} el
 */
function movable(el) {
  const [x, y, width, height] = [
    el.getBoundingClientRect().left,
    el.getBoundingClientRect().top,
    el.getBoundingClientRect().width,
    el.getBoundingClientRect().height
  ]
  el.box = [x, y, width, height]
  el.getBoundingClientRect = () => {
    const [bx, by, bw, bh] = el.box
    return { x: bx, y: by, left: bx, top: by, width: bw, height: bh, right: bx + bw, bottom: by + bh }
  }
  return el
}

/**
 * A page with things worth commenting on below the nav: a heading, a paragraph with a link, an
 * image, twelve cards, two list items one selector matches, and a private account box. Selectors
 * resolve through a table (the stub has no CSS engine), each entry answering what is in the page NOW.
 */
function trackPage() {
  const title = movable(h('h2', { rect: [80, 600, 400, 40], text: 'Our services' }))
  const link = h('a', { rect: [160, 660, 40, 20], text: 'fast' })
  const para = movable(
    h('p', { rect: [80, 660, 600, 60] }, ['We build ', link, ' websites for small teams and big ones'])
  )
  const photo = movable(h('img', { rect: [80, 740, 300, 200], src: 'https://site.example/a.jpg' }))
  const cards = Array.from({ length: 13 }, (_, i) =>
    movable(h('div', { rect: [80 + 50 * i, 1000, 40, 40], id: `c${String(i)}`, text: `Card ${String(i)}` }))
  )
  const twins = [
    h('li', { rect: [80, 1100, 100, 20], text: 'Twin' }),
    h('li', { rect: [200, 1100, 100, 20], text: 'Twin' })
  ]
  const account = movable(h('span', { rect: [90, 1200, 100, 20], text: 'Account of Ann' }))
  const secret = h('div', { rect: [80, 1190, 300, 40], attrs: { 'data-tracy-private': '' } }, [account])
  const page = stage({
    extra: [title, para, photo, ...cards, h('ul', { rect: [80, 1100, 400, 20] }, twins), secret]
  })
  const here = (el) => () => (el.isConnected === false ? [] : [el])
  const table = new Map([
    ['main > h2', here(title)],
    ['main > p', here(para)],
    ['main > img:nth-child(3)', () => (photo.swapped ? [photo.swapped] : [photo])],
    ['ul > li', () => twins],
    ['#account', here(account)],
    ['main > div:nth-child(9)', here(cards[4])]
  ])
  const base = page.document.querySelectorAll
  page.document.querySelectorAll = (selector) => {
    if (selector === 'div:has(') throw new SyntaxError('not a selector')
    return table.has(selector) ? table.get(selector)() : base(selector)
  }
  return { page, title, para, photo, cards, twins, account }
}

const THREE = [
  item('t', 'main > h2', 'Our services'),
  item('p', 'main > p', 'We build fast websites for small teams and big ones', 'active'),
  item('i', 'main > img:nth-child(3)', '', 'done')
]

/** @param {ReturnType<typeof stage>} page @param {number} [from] - only replies after this many posts. */
const tracked = (page, from = 0) =>
  page.posted
    .slice(from)
    .filter((entry) => entry.message.kind === PICK.rect || entry.message.kind === PICK.lost)
    .map((entry) => entry.message)

test('ready names track and reveal beside pick on a vouched page; a theme copy names none', () => {
  const page = stage()
  run(page, [vouched], () =>
    assert.deepEqual(page.replies('ready')[0].message.features, [
      'pick',
      'track',
      'reveal',
      'text',
      'hold',
      'scroll',
      'follow',
      'lockstep',
      'name',
      'clip',
      'route',
      'refocus',
      'pins60',
      'wheel',
      'widen'
    ])
  )
  const bare = stage()
  run(bare, [plain], () => assert.deepEqual(bare.replies('ready')[0].message.features, []))
})

test('pick-track with 0, 1, 3, 13 or 60 items answers a pick-rect per item at once, before any frame', () => {
  for (const n of [0, 1, 3, 13, 60]) {
    const { page, cards } = trackPage()
    run(page, [vouched], () => {
      page.send(pickMessage(PICK.start))
      // Runtime 16 (`pins60`): 60 per set. Past the 13 cards, ids repeat a card's selector.
      const items = Array.from({ length: n }, (_, i) =>
        item(`k${String(i)}`, `#${cards[i % 13].id}`, `Card ${String(i % 13)}`)
      )
      page.send(track(items))
      const replies = page.replies(PICK.rect)
      assert.equal(replies.length, n, String(n))
      for (const [i, entry] of replies.entries()) {
        assert.equal(entry.target, PARENT)
        assert.deepEqual(entry.message, {
          channel: CHANNEL,
          v: VERSION,
          kind: 'pick-rect',
          id: `k${String(i)}`,
          rect: { x: 80 + 50 * (i % 13), y: 1000, width: 40, height: 40 }
        })
      }
      assert.equal(page.outlines().length, n)
      assert.equal(page.replies(PICK.lost).length, 0)
    })
  }
})

test('61 items is not a set: the message is ignored and the tracked set stays as it was', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('a', '#c0', 'Card 0')]))
    const before = page.posted.length
    page.send(
      track(
        Array.from({ length: 61 }, (_, i) =>
          item(`k${String(i)}`, `#c${String(i % 13)}`, `Card ${String(i % 13)}`)
        )
      )
    )
    assert.deepEqual(tracked(page, before), [])
    assert.equal(page.outlines().length, 1)
    // A bad item, an unknown state, or an id too long: ignored whole, the same way.
    page.send(track([item('a', '#c0', 'Card 0'), item('b', '#c1', 'Card 1', 'lost')]))
    page.send(track([item('x'.repeat(65), '#c0', 'Card 0')]))
    assert.deepEqual(tracked(page, before), [])
    assert.equal(page.outlines().length, 1)
  })
})

test('a scroll of 200 px sends one pick-rect per item, coalesced into one frame', () => {
  const { page, title, para, photo } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    const before = page.posted.length
    for (const el of [title, para, photo]) el.box[1] -= 200
    page.fire('scroll')
    page.fire('scroll')
    page.fire('resize')
    page.fire('scroll')
    assert.deepEqual(tracked(page, before), [], 'nothing before the frame')
    page.flush()
    assert.deepEqual(
      tracked(page, before).map((m) => [m.kind, m.id, m.rect.y]),
      [
        ['pick-rect', 't', 400],
        ['pick-rect', 'p', 460],
        ['pick-rect', 'i', 540]
      ]
    )
    assert.match(page.outlines()[0].style.cssText, /top:396px/, 'the outline moved with it')
    // Nothing moved since: nothing is said.
    const after = page.posted.length
    page.fire('scroll')
    page.flush()
    assert.deepEqual(tracked(page, after), [])
  })
})

test('a DOM change is watched too, and only an item whose box changed is reported', () => {
  const { page, para } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    assert.equal(page.watching(), 1)
    const before = page.posted.length
    para.box[1] += 30
    page.mutate(page.document.body)
    page.mutate(page.document.body)
    page.flush()
    assert.deepEqual(
      tracked(page, before).map((m) => [m.id, m.rect.y]),
      [['p', 690]]
    )
  })
})

test('an element taken out of the page is lost as missing, once, and its outline goes', () => {
  const { page, title } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    assert.equal(page.outlines().length, 3)
    const before = page.posted.length
    title.isConnected = false
    page.mutate(page.document.body)
    page.flush()
    page.fire('scroll')
    page.flush()
    assert.deepEqual(tracked(page, before), [
      { channel: CHANNEL, v: VERSION, kind: 'pick-lost', id: 't', reason: 'missing' }
    ])
    assert.equal(page.replies(PICK.lost)[0].target, PARENT)
    assert.equal(page.outlines().length, 2)
    // Back again and still the same words: it is reported where it is.
    title.isConnected = true
    page.mutate(page.document.body)
    page.flush()
    assert.deepEqual(
      tracked(page, before)
        .slice(1)
        .map((m) => [m.kind, m.id]),
      [['pick-rect', 't']]
    )
  })
})

test('a selector that matches two elements, or none, or is not a selector, is lost at once', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(
      track([item('two', 'ul > li', 'Twin'), item('none', '#nowhere', 'x'), item('bad', 'div:has(', 'x')])
    )
    assert.deepEqual(
      tracked(page).map((m) => [m.kind, m.id, m.reason]),
      [
        ['pick-lost', 'two', 'many'],
        ['pick-lost', 'none', 'missing'],
        ['pick-lost', 'bad', 'missing']
      ]
    )
    assert.equal(page.outlines().length, 0, 'never an outline on a guess')
  })
})

test('words that no longer begin with the first 40 characters picked are lost as changed', () => {
  const { page, title, para } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    // Only the first 40 characters are held: a paragraph whose tail changed is still itself.
    page.send(
      track([
        item('t', 'main > h2', 'Our services'),
        item('p', 'main > p', 'We build fast websites for small teams and SOME OTHER TAIL')
      ])
    )
    assert.deepEqual(
      tracked(page).map((m) => m.kind),
      ['pick-rect', 'pick-rect']
    )
    const before = page.posted.length
    title.childNodes[0].nodeValue = 'What we do'
    page.mutate(title)
    page.flush()
    assert.deepEqual(tracked(page, before), [
      { channel: CHANNEL, v: VERSION, kind: 'pick-lost', id: 't', reason: 'changed' }
    ])
    assert.equal(page.outlines().length, 1)
    void para
  })
})

test('an element picked with no words is held by its tag: an image replaced by a box is changed', () => {
  const { page, photo } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('i', 'main > img:nth-child(3)', '')]))
    assert.equal(page.replies(PICK.rect).length, 1)
    const before = page.posted.length
    photo.swapped = h('div', { rect: [80, 740, 300, 200] })
    page.mutate(page.document.body)
    page.flush()
    assert.deepEqual(tracked(page, before), [
      { channel: CHANNEL, v: VERSION, kind: 'pick-lost', id: 'i', reason: 'changed' }
    ])
  })
})

test('outlines are thin and unfilled, solid for the open one, coloured by state', () => {
  const { page, cards } = trackPage()
  const states = ['saved', 'active', 'sent', 'working', 'done', 'failed', 'asked']
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(states.map((state, i) => item(state, `#${cards[i].id}`, `Card ${String(i)}`, state))))
    const css = Object.fromEntries(page.outlines().map((node, i) => [states[i], node.style.cssText]))
    for (const state of states) {
      assert.match(css[state], /^all:initial !important/, state)
      assert.match(css[state], /pointer-events:none !important/, state)
      // In the page's coordinates: the stub's cards move with the page (runtime 12, `follow`).
      assert.match(css[state], /position:absolute !important/, state)
    }
    for (const node of page.outlines())
      assert.equal(node.hasAttribute('data-tracy-picker'), true, 'the picker never picks it')
    assert.match(css.active, /border:2px solid rgb\(191,91,61\)/)
    assert.match(css.active, /background:rgba\(191,91,61,\.1\)/, 'the open one reads like the live pick')
    const thin = {
      saved: 'rgba(191,91,61,.6)',
      sent: 'rgb(191,91,61)',
      working: 'rgb(191,91,61)',
      done: 'rgb(0,188,125)',
      failed: 'rgb(231,0,11)',
      asked: 'rgb(240,177,0)'
    }
    for (const [state, colour] of Object.entries(thin)) {
      assert.ok(css[state].includes(`border:1px solid ${colour} !important`), `${state}: ${css[state]}`)
      assert.match(css[state], /background:transparent/, state)
    }
  })
})

test('nothing is drawn over a [data-tracy-private] element; its box is still reported', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('acc', '#account', '')]))
    assert.equal(page.outlines().length, 0)
    assert.deepEqual(page.replies(PICK.rect)[0].message.rect, { x: 90, y: 1200, width: 100, height: 20 })
  })
})

test('pick-stop and Escape clear every tracked outline and stop reporting; pick-start shows the set again', () => {
  for (const leave of ['stop', 'escape']) {
    const { page, title } = trackPage()
    run(page, [vouched], () => {
      page.send(pickMessage(PICK.start))
      page.send(track(THREE))
      if (leave === 'stop') page.send(pickMessage(PICK.stop))
      else page.fireDoc('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} })
      assert.equal(page.outlines().length, 0, leave)
      assert.equal(page.watching(), 0, leave)
      const before = page.posted.length
      title.box[1] -= 200
      page.fire('scroll')
      page.flush()
      assert.deepEqual(tracked(page, before), [], leave)
      // Edit again: the set the side card gave is shown and reported afresh.
      page.send(pickMessage(PICK.start))
      assert.deepEqual(
        tracked(page, before).map((m) => [m.kind, m.id]),
        [
          ['pick-rect', 't'],
          ['pick-rect', 'p'],
          ['pick-rect', 'i']
        ],
        leave
      )
      assert.equal(page.outlines().length, 3, leave)
    })
  }
})

test('a pick-track outside Edit is kept, not shown, and applied on the next pick-start', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(track(THREE))
    assert.deepEqual(tracked(page), [])
    assert.equal(page.outlines().length, 0)
    assert.equal(page.watching(), 0)
    page.send(pickMessage(PICK.start))
    assert.equal(page.replies(PICK.rect).length, 3)
    assert.equal(page.outlines().length, 3)
  })
})

test('an id no longer tracked is never reported, even from a frame queued before the new set', () => {
  const { page, title, para, photo } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    for (const el of [title, para, photo]) el.box[1] -= 50
    page.fire('scroll')
    const before = page.posted.length
    page.send(track([THREE[1]]))
    title.isConnected = false
    page.mutate(page.document.body)
    page.flush()
    page.fire('scroll')
    page.flush()
    const ids = new Set(tracked(page, before).map((m) => m.id))
    assert.deepEqual([...ids], ['p'])
    assert.equal(page.outlines().length, 1)
    // The empty set: nothing tracked, nothing drawn. Edit itself still watches the page for the pick
    // (runtime 14's frame check), with one observer.
    page.send(track([]))
    assert.equal(page.outlines().length, 0)
    assert.equal(page.watching(), 1)
  })
})

test('pick-track from another origin, another window or another version is ignored', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE), { origin: STRANGER })
    page.send(track(THREE), { source: {} })
    page.send({ ...track(THREE), v: VERSION + 1 })
    page.send({ ...track(THREE), channel: 'other' })
    assert.deepEqual(tracked(page), [])
    assert.equal(page.outlines().length, 0)
  })
  // No picker (a theme's own copy): tracking does not exist either.
  const bare = trackPage()
  run(bare.page, [plain], () => {
    bare.page.send(pickMessage(PICK.start))
    bare.page.send(track(THREE))
    assert.deepEqual(tracked(bare.page), [])
    assert.equal(bare.page.outlines().length, 0)
  })
})

test('adding another: picked, then pick-track and pick-start keep the tracked outlines and the live pick works', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
    assert.equal(page.replies(PICK.picked).length, 1)
    page.send(track(THREE))
    assert.equal(page.replies(PICK.rect).length, 3, 'tracked while picked: Edit is on')
    page.send(pickMessage(PICK.start))
    assert.equal(page.outlines().length, 3, 'pointing again does not drop the tracked set')
    assert.equal(page.replies(PICK.rect).length, 3, 'nor re-sends it')
    page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
    assert.equal(page.replies(PICK.picked).length, 2)
    assert.notEqual(page.overlay(), null, 'the live pick keeps its own outline')
  })
})

test('with tracking on, a live pick still reports picked {moved:true} as before', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(track(THREE))
    const where = pickSpan(page)
    where.y = -80
    page.fire('scroll')
    page.flush()
    assert.equal(moves(page).length, 1)
    assert.deepEqual(moves(page)[0].message.target.rect, { x: 110, y: -80, width: 60, height: 16 })
  })
})

test('pagehide forgets the set; dispose leaves no outline, listener or observer', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    page.fire('pagehide')
    assert.equal(page.outlines().length, 0)
    assert.equal(page.watching(), 0)
    page.send(pickMessage(PICK.start))
    assert.equal(page.replies(PICK.rect).length, 3, 'nothing re-sent after the document went away')
    page.send(track(THREE))
    page.window.TracyPreviewRuntime.dispose()
    assert.equal(page.outlines().length, 0)
    assert.equal(page.watching(), 0)
    for (const table of Object.values(page.listeners))
      for (const [name, list] of table) assert.equal(list.length, 0, `${name} still has a listener`)
  })
})

// ── Runtime 4 beside runtime 5 ────────────────────────────────────────────────────────────────

const v4 = { source: RUNTIME_4, parentOrigin: PARENT }

test('a runtime-4 page names pick only, ignores pick-track and still reports picked {moved:true}', () => {
  const { page } = trackPage()
  run(page, [v4], () => {
    assert.deepEqual(page.replies('ready')[0].message.features, ['pick'])
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    assert.deepEqual(tracked(page), [])
    const where = pickSpan(page)
    where.y = -80
    page.fire('scroll')
    page.flush()
    assert.equal(moves(page).length, 1)
    assert.equal(page.window.TracyPreviewRuntime.version, 4)
  })
})

test('runtime 4 then 5 on one page: 5 takes over and tracks; 5 then 4: 4 installs nothing', () => {
  for (const order of [
    [v4, vouched],
    [vouched, v4]
  ]) {
    const { page } = trackPage()
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      page.send(pickMessage(PICK.start))
      page.send(track(THREE))
      assert.equal(page.replies(PICK.rect).length, 3)
      assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    })
  }
})

test('a done item whose words Tracy changed keeps its box and its outline; a saved one is changed', () => {
  const { page, title, para } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(
      track([
        item('t', 'main > h2', 'Our services', 'done'),
        item('p', 'main > p', 'We build fast websites', 'saved')
      ])
    )
    const before = page.posted.length
    title.childNodes[0].nodeValue = 'What we do'
    para.childNodes[0].nodeValue = 'We sell '
    title.box[1] -= 10
    page.mutate(page.document.body)
    page.flush()
    assert.deepEqual(
      tracked(page, before).map((m) => [m.kind, m.id, m.reason ?? m.rect.y]),
      [
        ['pick-rect', 't', 590],
        ['pick-lost', 'p', 'changed']
      ]
    )
    assert.equal(page.outlines().length, 1)
    assert.match(page.outlines()[0].style.cssText, /rgb\(0,188,125\)/, 'the done outline stays, green')
  })
})

test('every sent state is held by its selector alone; missing and many still apply', () => {
  for (const state of ['sent', 'working', 'done', 'failed', 'asked']) {
    const { page, title } = trackPage()
    run(page, [vouched], () => {
      page.send(pickMessage(PICK.start))
      page.send(
        track([item('t', 'main > h2', 'Something else entirely', state), item('two', 'ul > li', 'x', state)])
      )
      assert.deepEqual(
        tracked(page).map((m) => [m.kind, m.id, m.reason]),
        [
          ['pick-rect', 't', undefined],
          ['pick-lost', 'two', 'many']
        ],
        state
      )
      title.isConnected = false
      page.mutate(page.document.body)
      page.flush()
      assert.equal(page.replies(PICK.lost).at(-1).message.reason, 'missing', state)
    })
  }
})

test('an item sent again as saved after done is checked by its words again', () => {
  const { page, title } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('t', 'main > h2', 'Our services', 'done')]))
    title.childNodes[0].nodeValue = 'What we do'
    page.mutate(title)
    page.flush()
    assert.equal(page.replies(PICK.lost).length, 0)
    page.send(track([item('t', 'main > h2', 'Our services', 'saved')]))
    assert.deepEqual(page.replies(PICK.lost).at(-1).message, {
      channel: CHANNEL,
      v: VERSION,
      kind: 'pick-lost',
      id: 't',
      reason: 'changed'
    })
    assert.equal(page.outlines().length, 0)
  })
})

// ── Reveal and pending (runtime 7) ────────────────────────────────────────────────────────────

/**
 * Let the page's elements be scrolled to: each `scrollIntoView` call is recorded with its element.
 * @param {object[]} els
 */
function scrollable(els) {
  const calls = []
  for (const el of els) el.scrollIntoView = (options) => calls.push({ el, options })
  return calls
}

/** @param {ReturnType<typeof stage>} page @param {boolean} reduce */
function motion(page, reduce) {
  page.window.matchMedia = (query) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query
  })
}

const LIT = /border:3px solid rgb\(191,91,61\)/

test('pick-reveal scrolls the tracked element to the centre, flashes it twice in ~600 ms, then reports its rect', () => {
  const { page, title } = trackPage()
  const calls = []
  // The real page scrolls: the title lands in the middle of the viewport.
  title.scrollIntoView = (options) => {
    calls.push(options)
    title.box[1] = 380
  }
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    const before = page.posted.length
    const start = page.delays.length
    page.send(revealMessage('t'))
    assert.deepEqual(calls, [{ block: 'center', behavior: 'smooth' }])
    // Reported at once, where the element now is, to the vouched origin.
    assert.deepEqual(
      page.posted.slice(before).filter((entry) => entry.message.kind === PICK.rect),
      [
        {
          message: {
            channel: CHANNEL,
            v: VERSION,
            kind: 'pick-rect',
            id: 't',
            rect: { x: 80, y: 380, width: 400, height: 40 }
          },
          target: PARENT
        }
      ]
    )
    // Lit now, then off · on · off on timers: two flashes, the last ending by 600 ms.
    assert.deepEqual(page.delays.slice(start), [150, 300, 450])
    const outline = page.outlines()[0]
    const seen = [LIT.test(outline.style.cssText)]
    for (let i = 0; i < 3; i++) {
      page.step()
      seen.push(LIT.test(outline.style.cssText))
    }
    assert.deepEqual(seen, [true, false, true, false])
    assert.match(outline.style.cssText, /top:376px/, 'drawn where the element is now')
    assert.ok(
      outline.style.cssText.includes('border:1px solid rgba(191,91,61,.6) !important'),
      'back to saved'
    )
    assert.equal(page.outlines().length, 3, 'no outline added or lost')
  })
})

test('reduced motion: no smooth scroll and one flash', () => {
  const { page, title } = trackPage()
  const calls = scrollable([title])
  run(page, [vouched], () => {
    motion(page, true)
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    const start = page.delays.length
    page.send(revealMessage('t'))
    assert.deepEqual(calls[0].options, { block: 'center', behavior: 'auto' })
    assert.ok(LIT.test(page.outlines()[0].style.cssText), 'lit once')
    assert.deepEqual(page.delays.slice(start), [300], 'one flash: lit, then back after 300 ms')
    page.flush()
    assert.ok(!LIT.test(page.outlines()[0].style.cssText))
  })
  // Motion allowed: smooth.
  const other = trackPage()
  const smooth = scrollable([other.title])
  run(other.page, [vouched], () => {
    motion(other.page, false)
    other.page.send(pickMessage(PICK.start))
    other.page.send(track(THREE))
    other.page.send(revealMessage('t'))
    assert.equal(smooth[0].options.behavior, 'smooth')
  })
})

test('pick-reveal for an id not tracked, or badly formed, does nothing', () => {
  const { page, title, para, photo } = trackPage()
  const calls = scrollable([title, para, photo])
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    const before = page.posted.length
    const start = page.delays.length
    page.send(revealMessage('nope'))
    page.send({ channel: CHANNEL, v: VERSION, kind: PICK.reveal, id: 7 })
    page.send({ channel: CHANNEL, v: VERSION, kind: PICK.reveal })
    page.flush()
    assert.deepEqual(calls, [])
    assert.equal(page.posted.length, before)
    assert.equal(page.delays.length, start)
    for (const node of page.outlines()) assert.ok(!LIT.test(node.style.cssText))
  })
})

test('pick-reveal from another origin, another window or another version is ignored', () => {
  const { page, title } = trackPage()
  const calls = scrollable([title])
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    const before = page.posted.length
    page.send(revealMessage('t'), { origin: STRANGER })
    page.send(revealMessage('t'), { source: {} })
    page.send({ ...revealMessage('t'), v: VERSION + 1 })
    page.send({ ...revealMessage('t'), channel: 'other' })
    assert.deepEqual(calls, [])
    assert.equal(page.posted.length, before)
  })
  // No picker (a theme's own copy): no reveal either.
  const bare = trackPage()
  const none = scrollable([bare.title])
  run(bare.page, [plain], () => {
    bare.page.send(track(THREE))
    bare.page.send(revealMessage('t'))
    assert.deepEqual(none, [])
  })
})

test('pick-reveal of a tracked element that is gone reports it lost and scrolls nowhere', () => {
  const { page, title } = trackPage()
  const calls = scrollable([title])
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    title.isConnected = false
    const before = page.posted.length
    page.send(revealMessage('t'))
    assert.deepEqual(calls, [])
    assert.deepEqual(tracked(page, before), [
      { channel: CHANNEL, v: VERSION, kind: 'pick-lost', id: 't', reason: 'missing' }
    ])
  })
})

test('outside Edit a tracked element is still revealed: scrolled, flashed on a passing outline, reported', () => {
  const { page, title } = trackPage()
  const calls = scrollable([title])
  run(page, [vouched], () => {
    page.send(track(THREE))
    assert.equal(page.outlines().length, 0)
    page.send(revealMessage('t'))
    assert.equal(calls.length, 1)
    assert.equal(page.outlines().length, 1, 'one passing outline for the flash')
    assert.ok(LIT.test(page.outlines()[0].style.cssText))
    assert.deepEqual(
      page.replies(PICK.rect).map((entry) => entry.message.id),
      ['t']
    )
    page.flush()
    assert.equal(page.outlines().length, 0, 'gone when the flash ends')
    assert.equal(page.watching(), 0, 'nothing kept watching')
  })
})

test('Edit starting during an outside-Edit flash leaves one outline per element, never a stray passing one', () => {
  // The stray terracotta box (01/10/2026): a reveal outside Edit drew a passing outline, pick-start
  // arrived mid-flash, and the later flash steps took the in-Edit branch and never took it down; it
  // stayed where the element stood at the start and looked misplaced once the frame was resized.
  for (const steps of [0, 1, 2]) {
    const { page, title } = trackPage()
    scrollable([title])
    run(page, [vouched], () => {
      page.send(track(THREE))
      page.send(revealMessage('t'))
      assert.equal(page.outlines().length, 1, 'the passing outline is up')
      for (let i = 0; i < steps; i++) page.step()
      page.send(pickMessage(PICK.start))
      assert.equal(
        page.outlines().length,
        3,
        `one outline per tracked element (start after ${String(steps)} steps)`
      )
      page.flush()
      assert.equal(page.outlines().length, 3, 'still one each once the flash ends')
      assert.equal(page.outlines().filter((node) => LIT.test(node.style.cssText)).length, 0, 'none left lit')
    })
  }
})

test('a reveal over a [data-tracy-private] element scrolls but draws nothing on it', () => {
  const { page, account } = trackPage()
  const calls = scrollable([account])
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('acc', '#account', '')]))
    page.send(revealMessage('acc'))
    assert.equal(calls.length, 1)
    assert.equal(page.outlines().length, 0)
    page.flush()
    assert.equal(page.outlines().length, 0)
  })
})

test('pick-stop, a new set or pagehide during a flash leave no lit outline behind', () => {
  for (const leave of ['stop', 'track', 'pagehide']) {
    const { page, title } = trackPage()
    scrollable([title])
    run(page, [vouched], () => {
      page.send(pickMessage(PICK.start))
      page.send(track(THREE))
      page.send(revealMessage('t'))
      if (leave === 'stop') page.send(pickMessage(PICK.stop))
      else if (leave === 'track') page.send(track(THREE))
      else page.fire('pagehide')
      page.flush()
      for (const node of page.outlines()) assert.ok(!LIT.test(node.style.cssText), leave)
      if (leave !== 'track') assert.equal(page.outlines().length, 0, leave)
    })
  }
})

test('a pending comment wears a thin grey outline with no fill, and is checked by its words', () => {
  const { page, title, cards } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(
      track([
        item('g', `#${cards[0].id}`, 'Card 0', 'pending'),
        item('t', 'main > h2', 'Our services', 'pending')
      ])
    )
    const css = page.outlines()[0].style.cssText
    assert.ok(css.includes('border:1px solid rgba(115,115,115,.5) !important'), css)
    assert.match(css, /background:transparent/)
    // Not sent yet: its words are what it is held by, as for `saved`.
    const before = page.posted.length
    title.childNodes[0].nodeValue = 'What we do'
    page.mutate(title)
    page.flush()
    assert.deepEqual(tracked(page, before), [
      { channel: CHANNEL, v: VERSION, kind: 'pick-lost', id: 't', reason: 'changed' }
    ])
  })
})

test('resolved is not a page state: a set carrying one is ignored whole', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([THREE[0]]))
    const before = page.posted.length
    page.send(track([THREE[0], item('r', 'main > p', 'We build', 'resolved')]))
    assert.deepEqual(tracked(page, before), [])
    assert.equal(page.outlines().length, 1)
  })
})

// ── Runtime 5 beside runtime 7 ────────────────────────────────────────────────────────────────

const v5 = { source: RUNTIME_5, parentOrigin: PARENT }

test('a runtime-5 page names no reveal, ignores pick-reveal harmlessly and keeps tracking', () => {
  const { page, title } = trackPage()
  const calls = scrollable([title])
  run(page, [v5], () => {
    assert.equal(page.window.TracyPreviewRuntime.version, 5)
    assert.deepEqual(page.replies('ready')[0].message.features, ['pick', 'track'], 'no reveal named')
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    assert.equal(page.replies(PICK.rect).length, 3)
    const before = page.posted.length
    page.send(revealMessage('t'))
    page.flush()
    assert.deepEqual(calls, [])
    assert.equal(page.posted.length, before)
    assert.equal(page.outlines().length, 3)
  })
})

test('runtime 5 then 7 on one page: 7 takes over and reveals; 7 then 5: 5 installs nothing', () => {
  for (const order of [
    [v5, vouched],
    [vouched, v5]
  ]) {
    const { page, title } = trackPage()
    const calls = scrollable([title])
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      page.send(pickMessage(PICK.start))
      page.send(track(THREE))
      assert.equal(page.replies(PICK.rect).length, 3)
      page.send(revealMessage('t'))
      assert.equal(calls.length, 1)
      assert.deepEqual(exercise(page), { reloads: 1, picked: 1 })
    })
  }
})

// ── The words now (runtime 9) ─────────────────────────────────────────────────────────────────

/**
 * Runtime 8 as it shipped (tracked elements, reveal, a wrapper's sole image; no `pick-text`), taken
 * from the WordPress theme's copy at f25981a07 before runtime 9 replaced it: pages built before a
 * site's theme or image is rebuilt still carry it, and the side card then sends the words from pick
 * time, as before.
 */
const RUNTIME_8 = readFileSync(new URL('./fixtures/runtime-8-f25981a07.js.txt', import.meta.url), 'utf8')
const v8 = { source: RUNTIME_8, parentOrigin: PARENT }

/** @param {ReturnType<typeof stage>} page @param {number} [from] */
const texts = (page, from = 0) =>
  page.posted
    .slice(from)
    .filter((entry) => entry.message.kind === PICK.text)
    .map((entry) => [entry.message.id, entry.message.text])

test("F16: pick-track answers pick-text with each found element's words now, to the vouched origin, in Edit", () => {
  const { page, title } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    title.childNodes[0].nodeValue = '  Our   services\n '
    page.send(track([...THREE, item('two', 'ul > li', 'Twin', 'done')]))
    assert.deepEqual(texts(page), [
      ['t', 'Our services'],
      ['p', 'We build fast websites for small teams and big ones'],
      ['i', '']
    ])
    const one = page.replies(PICK.text)[0]
    assert.equal(one.target, PARENT)
    assert.deepEqual(one.message, {
      channel: CHANNEL,
      v: VERSION,
      kind: 'pick-text',
      id: 't',
      text: 'Our services'
    })
  })
})

test('F16: outside Edit pick-track still answers pick-text, drawing nothing and reporting no box', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(track(THREE))
    assert.deepEqual(
      texts(page).map(([id]) => id),
      ['t', 'p', 'i']
    )
    assert.deepEqual(tracked(page), [])
    assert.equal(page.outlines().length, 0)
    assert.equal(page.watching(), 0)
  })
})

test('F16: in Edit, words Tracy changed are said once when they change, never again while the same', () => {
  const { page, title } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('t', 'main > h2', 'Our services', 'done')]))
    const before = page.posted.length
    title.box[1] -= 10
    page.fire('scroll')
    page.flush()
    assert.deepEqual(texts(page, before), [], 'a box that moved says no words')
    title.childNodes[0].nodeValue = 'EST. CHARLIE'
    page.mutate(title)
    page.flush()
    page.mutate(title)
    page.flush()
    assert.deepEqual(texts(page, before), [['t', 'EST. CHARLIE']])
  })
})

test('F16: a lost element says no words; a private one says none either', () => {
  const { page } = trackPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(
      track([
        item('gone', '#nothing', 'x', 'done'),
        item('two', 'ul > li', 'Twin', 'done'),
        item('acc', '#account', '', 'done')
      ])
    )
    assert.deepEqual(texts(page), [['acc', '']])
  })
})

test('F16: long words are cut as a pick cuts them, 300 characters ending in …', () => {
  const { page, para } = trackPage()
  run(page, [vouched], () => {
    para.childNodes.length = 0
    para.childNodes.push({ nodeType: 3, nodeValue: `We build ${'a'.repeat(400)}` })
    page.send(track([item('p', 'main > p', 'We build', 'done')]))
    const [[, words]] = texts(page)
    assert.equal(words.length, 300)
    assert.ok(words.endsWith('…'))
    assert.ok(words.startsWith('We build aaa'))
  })
})

test('F16: runtime 8 then 9 on one page: 9 takes over and says the words; 9 then 8: 8 installs nothing', () => {
  for (const order of [
    [v8, vouched],
    [vouched, v8]
  ]) {
    const { page } = trackPage()
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      page.send(pickMessage(PICK.start))
      page.send(track(THREE))
      assert.equal(page.replies(PICK.rect).length, 3)
      assert.equal(page.replies(PICK.text).length, 3)
    })
  }
})

test('F16: a runtime-8 page names no text and answers pick-track with boxes only', () => {
  const { page } = trackPage()
  run(page, [v8], () => {
    assert.equal(page.window.TracyPreviewRuntime.version, 8)
    assert.deepEqual(page.replies('ready')[0].message.features, ['pick', 'track', 'reveal'])
    page.send(pickMessage(PICK.start))
    page.send(track(THREE))
    assert.equal(page.replies(PICK.rect).length, 3)
    assert.equal(page.replies('pick-text').length, 0)
  })
})

// ── Hold (runtime 11, feature `hold`): the side card has a box open ──────────────────────────
//
// Brian 29/09 23:08: with a popover or a thread card open in the side card, a click on the page
// must not pick another element or follow a link; the first click only closes the box (or, with
// words typed in it, makes it flash). The side card could shield the frame itself, but that also
// took the wheel: the person could not scroll the page while writing. So the PAGE swallows the
// click and says where it was; the wheel, scrolling and keys pass as ever.

/** A click as the browser delivers it: window capture first, then the document's own listeners. */
function clickThrough(page, name, at = { clientX: 130, clientY: 28 }) {
  const seen = { prevented: 0, stopped: false }
  const event = {
    ...at,
    detail: 1,
    preventDefault: () => (seen.prevented += 1),
    stopPropagation: () => (seen.stopped = true),
    stopImmediatePropagation: () => (seen.stopped = true)
  }
  page.fireDoc(name, event)
  return seen
}

test('ready names hold on a vouched page (runtime 11)', () => {
  const page = stage()
  run(page, [vouched], () =>
    assert.deepEqual(page.replies('ready')[0].message.features, [
      'pick',
      'track',
      'reveal',
      'text',
      'hold',
      'scroll',
      'follow',
      'lockstep',
      'name',
      'clip',
      'route',
      'refocus',
      'pins60',
      'wheel',
      'widen'
    ])
  )
  assert.ok(RUNTIME_VERSION >= 11)
})

test('pick-hold on: every click is swallowed — no pick, no link — and reported as pick-outside {x, y}', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(holdMessage(true))
    for (const name of ['pointerdown', 'mousedown']) {
      const seen = clickThrough(page, name)
      assert.equal(seen.prevented, 1, `${name} must not move focus or start a drag`)
      assert.equal(seen.stopped, true)
    }
    const seen = clickThrough(page, 'click')
    assert.equal(seen.prevented, 1, 'the click must not open the link')
    assert.equal(seen.stopped, true, 'the picker never hears it')
    assert.equal(page.replies(PICK.picked).length, 0)
    const outside = page.replies(PICK.outside)
    assert.equal(outside.length, 1)
    assert.deepEqual(outside[0].message, { channel: CHANNEL, v: VERSION, kind: PICK.outside, x: 130, y: 28 })
    assert.equal(outside[0].target, PARENT)
    // Still held (the box may stay open with words typed): the next click is swallowed too.
    clickThrough(page, 'click', { clientX: 10, clientY: 500 })
    assert.equal(page.replies(PICK.outside).length, 2)
    assert.equal(page.replies(PICK.picked).length, 0)
  })
})

test('pick-hold off: the next click picks again', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(holdMessage(true))
    page.send(holdMessage(false))
    clickThrough(page, 'click')
    assert.equal(page.replies(PICK.picked).length, 1)
    assert.equal(page.replies(PICK.outside).length, 0)
  })
})

test('a hold covers a page that already picked (its own listeners are gone): a link is still not followed', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    clickThrough(page, 'click')
    assert.equal(page.replies(PICK.picked).length, 1)
    // Runtime 16: unheld, a picked page still keeps the click (acceptance v5 PICK-new-7, below).
    assert.equal(clickThrough(page, 'click').prevented, 1)
    assert.equal(page.replies(PICK.outside).length, 0, 'not held: nobody is told')
    page.send(holdMessage(true))
    const seen = clickThrough(page, 'click')
    assert.equal(seen.prevented, 1)
    assert.equal(page.replies(PICK.outside).length, 1)
  })
})

test('the wheel, scrolling and keys are never held', () => {
  const page = stage()
  run(page, [vouched], () => {
    const before = (table) => [...page.listeners[table]].map(([name, list]) => [name, list.length])
    const window0 = new Map(before('window'))
    const doc0 = new Map(before('document'))
    page.send(holdMessage(true))
    for (const name of ['wheel', 'scroll', 'keydown', 'keyup', 'touchmove'])
      for (const [table, start] of [
        ['window', window0],
        ['document', doc0]
      ])
        assert.equal((page.listeners[table].get(name) ?? []).length, start.get(name) ?? 0, `${table} ${name}`)
  })
})

test('a hold from another origin or window is ignored; pagehide and dispose let go of it', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(holdMessage(true), { origin: STRANGER })
    page.send(holdMessage(true), { source: {} })
    assert.equal(clickThrough(page, 'click').prevented, 0)
    page.send(holdMessage(true))
    page.fire('pagehide', { persisted: true })
    assert.equal(clickThrough(page, 'click').prevented, 0, 'a restored page starts unheld')
    page.send(holdMessage(true))
    page.window.TracyPreviewRuntime.dispose()
    for (const table of Object.values(page.listeners))
      for (const [name, list] of table) assert.equal(list.length, 0, `${name} still has a listener`)
  })
})

// ── Where the page is scrolled (runtime 11) ───────────────────────────────────────────────────
//
// Brian 29/09/2026: the picker's continuation lapsed while a page was shown in Edit, the side card's
// recovery loaded the page again at a ticketed address — a new navigation, which the browser opens at
// the TOP (scroll 3085 → 0). The side card cannot read a cross-origin frame's scroll, so the page
// says where it is, and puts itself back there when the side card asks.

const RUNTIME_9 = readFileSync(new URL('./fixtures/runtime-9-d93cb9f5c.js.txt', import.meta.url), 'utf8')
const v9 = { source: RUNTIME_9, parentOrigin: PARENT }

test('scroll: a vouched page says where it is scrolled to once it settles, to the vouched origin only', () => {
  const page = stage()
  run(page, [vouched], () => {
    // Right after ready: where the page opened.
    assert.deepEqual(
      page.replies(PICK.scroll).map((entry) => [entry.target, entry.message.x, entry.message.y]),
      [[PARENT, 0, 0]]
    )
    page.window.scrollY = 1200
    page.fire('scroll', {})
    page.window.scrollY = 3085.4
    page.fire('scroll', {})
    // Not per event: once, after the scrolling settles.
    assert.equal(page.replies(PICK.scroll).length, 1)
    page.flush()
    assert.deepEqual(page.replies(PICK.scroll).at(-1).message, {
      channel: CHANNEL,
      v: VERSION,
      kind: PICK.scroll,
      x: 0,
      y: 3085
    })
    assert.equal(page.replies(PICK.scroll).at(-1).target, PARENT)
    // The same place is never said twice; leaving the page says the last place at once.
    page.fire('scroll', {})
    page.flush()
    assert.equal(page.replies(PICK.scroll).length, 2)
    page.window.scrollY = 3100
    page.fire('scroll', {})
    page.fire('pagehide')
    assert.equal(page.replies(PICK.scroll).at(-1).message.y, 3100)
  })
})

test('scroll: a theme copy with no vouched parent says nothing about where it is', () => {
  const page = stage()
  run(page, [plain], () => {
    page.window.scrollY = 500
    page.fire('scroll', {})
    page.flush()
    page.fire('pagehide')
    assert.equal(page.replies(PICK.scroll).length, 0)
  })
})

test('pick-scroll-to puts the page back at once, and again at load when the page was still too short', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(scrollToMessage(0, 3085))
    assert.deepEqual(page.scrolledTo, [[0, 3085]])
    assert.equal(page.window.scrollY, 3085)
  })
  // A document still loading (images not in yet) cannot reach the place: it goes there again at load.
  const loading = stage()
  loading.document.readyState = 'loading'
  loading.window.maxScrollY = 900
  run(loading, [vouched], () => {
    loading.send(scrollToMessage(0, 3085))
    assert.equal(loading.window.scrollY, 900)
    loading.window.maxScrollY = Infinity
    loading.fire('load')
    assert.deepEqual(loading.scrolledTo, [
      [0, 3085],
      [0, 3085]
    ])
    assert.equal(loading.window.scrollY, 3085)
  })
  // Unless the person scrolled away meanwhile: then the page stays where they went.
  const moved = stage()
  moved.document.readyState = 'loading'
  moved.window.maxScrollY = 900
  run(moved, [vouched], () => {
    moved.send(scrollToMessage(0, 3085))
    moved.window.scrollY = 100
    moved.window.maxScrollY = Infinity
    moved.fire('load')
    assert.equal(moved.scrolledTo.length, 1)
  })
})

test('pick-scroll-to from another origin, another window, badly formed, or to a theme copy is ignored', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(scrollToMessage(0, 400), { origin: STRANGER })
    page.send(scrollToMessage(0, 400), { source: {} })
    page.send({ ...scrollToMessage(0, 400), v: VERSION + 1 })
    page.send({ channel: CHANNEL, v: VERSION, kind: PICK.scrollTo, x: 0, y: -5 })
    page.send({ channel: CHANNEL, v: VERSION, kind: PICK.scrollTo, x: 0, y: 'far' })
    assert.deepEqual(page.scrolledTo, [])
  })
  const theme = stage()
  run(theme, [plain], () => {
    theme.send(scrollToMessage(0, 400))
    assert.deepEqual(theme.scrolledTo, [])
  })
  assert.equal(scrollToMessage(0, -1), null)
  assert.equal(scrollToMessage(Number.NaN, 1), null)
  assert.deepEqual(scrollToMessage(0.4, 12.6), {
    channel: CHANNEL,
    v: VERSION,
    kind: PICK.scrollTo,
    x: 0,
    y: 13
  })
})

test('scroll: runtime 9 then 11 on one page: 11 takes over and says where it is; 11 then 9: 9 installs nothing', () => {
  for (const order of [
    [v9, vouched],
    [vouched, v9]
  ]) {
    const page = stage()
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      page.send(scrollToMessage(0, 700))
      assert.deepEqual(page.scrolledTo, [[0, 700]])
      page.fire('scroll', {})
      page.flush()
      assert.equal(page.replies(PICK.scroll).at(-1).message.y, 700)
    })
  }
})

test('a runtime-9 page names no scroll, and ignores pick-scroll-to harmlessly', () => {
  const page = stage()
  run(page, [v9], () => {
    assert.deepEqual(page.replies('ready')[0].message.features, ['pick', 'track', 'reveal', 'text'])
    page.send(scrollToMessage(0, 700))
    page.flush()
    assert.deepEqual(page.scrolledTo, [])
    assert.equal(page.replies(PICK.scroll).length, 0)
  })
})

// ── Outlines stay on their element (runtime 12, feature `follow`) ─────────────────────────────
//
// Brian 30/09/2026: with a comment open, scrolling made the outline trail the element — every wheel
// step painted one frame with the outline where the element had been (a screencast of a real Chrome
// measured a full step, 60 px, on every step). The browser scrolls the page on its compositor and
// runs `scroll` listeners afterwards, so an outline in viewport coordinates (`position:fixed`)
// redrawn from `scroll` is always one painted frame behind. An outline in the page's own
// coordinates is scrolled by the compositor together with the element, in the same frame.

const RUNTIME_11 = readFileSync(new URL('./fixtures/runtime-11-473deefda.js.txt', import.meta.url), 'utf8')
const v11 = { source: RUNTIME_11, parentOrigin: PARENT }

/** A page with one element in each kind of place an element can be scrolled from. */
function followPage() {
  const plain = movable(h('p', { rect: [100, 600, 300, 40], id: 'plain', text: 'Plain words' }))
  const fixedLink = movable(h('a', { rect: [1000, 10, 80, 20], id: 'fixed-a', text: 'Call us' }))
  const fixedBar = h('div', { rect: [900, 0, 380, 40], css: { position: 'fixed' } }, [fixedLink])
  const stickyLink = movable(h('a', { rect: [600, 150, 80, 20], id: 'sticky-a', text: 'Menu' }))
  const sticky = h('div', { rect: [560, 146, 300, 30], css: { position: 'sticky' } }, [stickyLink])
  const inner = movable(h('p', { rect: [100, 900, 200, 30], id: 'inner', text: 'Inside a box' }))
  const box = h(
    'div',
    {
      rect: [80, 880, 400, 100],
      css: { overflowX: 'hidden', overflowY: 'auto' },
      scroll: [400, 600, 400, 100]
    },
    [inner]
  )
  const page = stage({ extra: [plain, fixedBar, sticky, box] })
  return { page, plain, fixedLink, stickyLink, inner }
}

/** Pick the element under (x, y). */
function pickAtPoint(page, x, y) {
  page.send(pickMessage(PICK.start))
  page.fireDoc('click', { clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} })
}

/** Scroll the page by `dy`: the window's offset moves and so does every element that scrolls with it. */
function scrollPage(page, dy, els) {
  page.window.scrollY += dy
  for (const el of els) el.box = [el.box[0], el.box[1] - dy, el.box[2], el.box[3]]
  page.fire('scroll', { target: page.document })
}

test('follow: a picked element that moves with the page is outlined in the page, so a scroll never moves it apart', () => {
  const { page, plain } = followPage()
  run(page, [vouched], () => {
    page.window.scrollY = 200
    pickAtPoint(page, 150, 620)
    const css = page.overlay().style.cssText
    assert.match(css, /position:absolute !important/)
    assert.match(css, /left:96px !important/)
    assert.match(css, /top:796px !important/, 'the page coordinate: 600 in view + 200 scrolled − 4')
    scrollPage(page, 300, [plain])
    page.flush()
    assert.equal(
      page.overlay().style.cssText,
      css,
      'the browser scrolls it with the element; nothing redrawn'
    )
    // The side card still hears where the element went, for its popover.
    assert.deepEqual(moves(page).at(-1).message.target.rect, { x: 100, y: 300, width: 300, height: 40 })
  })
})

test('follow: under a fixed or sticky box the outline is fixed, and redrawn on scroll', () => {
  for (const [name, x, y] of [
    ['fixed-a', 1010, 15],
    ['sticky-a', 610, 155]
  ]) {
    const all = followPage()
    const { page } = all
    const el = { 'fixed-a': all.fixedLink, 'sticky-a': all.stickyLink }[name]
    run(page, [vouched], () => {
      page.window.scrollY = 100
      pickAtPoint(page, x, y)
      const [ex, ey] = el.box
      assert.match(page.overlay().style.cssText, /position:fixed !important/, name)
      assert.match(page.overlay().style.cssText, new RegExp(`top:${String(ey - 4)}px !important`), name)
      // A sticky box coming unstuck moves its element in the viewport: the outline follows.
      el.box = [ex, ey - 7, el.box[2], el.box[3]]
      page.fire('scroll', { target: page.document })
      assert.match(
        page.overlay().style.cssText,
        new RegExp(`top:${String(ey - 7 - 4)}px !important`),
        `${name} follows`
      )
    })
  }
})

test("follow: inside a box that scrolls itself the outline stays in the page, and the box's own scroll redraws it", () => {
  const { page, inner } = followPage()
  run(page, [vouched], () => {
    page.window.scrollY = 100
    pickAtPoint(page, 110, 910)
    assert.match(page.overlay().style.cssText, /position:absolute !important/)
    assert.match(page.overlay().style.cssText, /top:996px !important/)
    // The page scrolls: the browser moves both; nothing to redraw.
    const css = page.overlay().style.cssText
    scrollPage(page, 40, [inner])
    assert.equal(page.overlay().style.cssText, css)
    // The box scrolls by 50: the element moves up in the page, and so does its outline.
    inner.box = [inner.box[0], inner.box[1] - 50, inner.box[2], inner.box[3]]
    page.fire('scroll', { target: inner.parentElement })
    assert.match(page.overlay().style.cssText, /top:946px !important/)
  })
})

test('follow: a positioned or transformed root holds the outline, so it is placed from the root box', () => {
  for (const css of [{ position: 'relative' }, { transform: 'matrix(1, 0, 0, 1, 0, 0)' }]) {
    const { page } = followPage()
    const html = page.document.documentElement
    html.computed = css
    // Scrolled 250 px, with a 10 px margin above the root.
    html.getBoundingClientRect = () => ({
      x: 0,
      y: -240,
      left: 0,
      top: -240,
      width: 1280,
      height: 4000,
      right: 1280,
      bottom: 3760
    })
    run(page, [vouched], () => {
      page.window.scrollY = 250
      pickAtPoint(page, 150, 620)
      assert.match(page.overlay().style.cssText, /position:absolute !important/, JSON.stringify(css))
      assert.match(page.overlay().style.cssText, /top:836px !important/, JSON.stringify(css))
    })
  }
  // A transformed root also holds fixed boxes: a fixed outline is placed from its box too.
  const { page } = followPage()
  const html = page.document.documentElement
  html.computed = { transform: 'matrix(1, 0, 0, 1, 0, 0)' }
  html.getBoundingClientRect = () => ({
    x: 0,
    y: -240,
    left: 0,
    top: -240,
    width: 1280,
    height: 4000,
    right: 1280,
    bottom: 3760
  })
  run(page, [vouched], () => {
    pickAtPoint(page, 1010, 15)
    assert.match(page.overlay().style.cssText, /position:fixed !important/)
    assert.match(page.overlay().style.cssText, /top:246px !important/)
  })
})

test('follow: an outline in the page never widens it — a full-width block is outlined inside the page edges', () => {
  const wide = movable(h('section', { rect: [0, 200, 1280, 100], id: 'wide', text: 'Wide band' }))
  const foot = movable(h('footer', { rect: [0, 3950, 1280, 50], id: 'foot', text: 'Foot' }))
  const page = stage({ extra: [wide, foot] })
  const html = page.document.documentElement
  html.scrollWidth = 1280
  html.scrollHeight = 4000
  run(page, [vouched], () => {
    pickAtPoint(page, 640, 250)
    const css = page.overlay().style.cssText
    assert.match(css, /left:0px !important/)
    assert.match(css, /width:1280px !important/)
    assert.match(css, /top:196px !important/)
    assert.match(css, /height:108px !important/)
    page.send(pickMessage(PICK.stop))
    pickAtPoint(page, 640, 3970)
    assert.match(page.overlay().style.cssText, /top:3946px !important/)
    assert.match(
      page.overlay().style.cssText,
      /height:54px !important/,
      'the foot stops at the end of the page'
    )
  })
})

test('follow: tracked outlines take the same place as the pick — in the page, or fixed', () => {
  const { page, plain } = followPage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('a', '#plain', 'Plain words', 'active'), item('b', '#fixed-a', 'Call us')]))
    const [inPage, inView] = page.outlines()
    assert.match(inPage.style.cssText, /position:absolute !important/)
    assert.match(inView.style.cssText, /position:fixed !important/)
    const before = inPage.style.cssText
    scrollPage(page, 120, [plain])
    page.flush()
    assert.equal(inPage.style.cssText, before, 'scrolled by the browser, not redrawn')
    assert.deepEqual(tracked(page).at(-1), {
      channel: CHANNEL,
      v: VERSION,
      kind: PICK.rect,
      id: 'a',
      rect: { x: 100, y: 480, width: 300, height: 40 }
    })
  })
})

test('follow: runtime 11 then 12 on one page: 12 takes over and names follow; 12 then 11: 11 installs nothing', () => {
  for (const order of [
    [v11, vouched],
    [vouched, v11]
  ]) {
    const page = stage()
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      assert.ok(page.replies('ready').at(-1).message.features.includes('follow'))
    })
  }
  const old = stage()
  run(old, [v11], () => {
    assert.deepEqual(old.replies('ready')[0].message.features, [
      'pick',
      'track',
      'reveal',
      'text',
      'hold',
      'scroll'
    ])
  })
})

// ── Runtime 13: picking lands on content (stage 6 acceptance v2, K01 / K04, 30/09/2026) ───────
//
// Nothing on the wire changes; the page's hit-test does (`pick.mjs` `pickAt`). A click on a
// "Dark" toggle's CSS icon span picked the empty span, so `picked` carried a tag and no words.

const RUNTIME_12 = readFileSync(new URL('./fixtures/runtime-12-86e015c14.js.txt', import.meta.url), 'utf8')
const v12 = { source: RUNTIME_12, parentOrigin: PARENT }

/** A page with a theme toggle: an empty 15 px icon span, then the word, inside one button. */
function togglePage() {
  const icon = h('span', { rect: [938, 9, 15, 15], cls: 'icon-moon' })
  const button = h('button', { rect: [930, 4, 70, 26] }, [
    icon,
    h('span', { rect: [958, 9, 36, 16], text: 'Dark' })
  ])
  return stage({ extra: [h('div', { rect: [900, 0, 380, 40] }, [button])] })
}

function clickIcon(page) {
  page.send(pickMessage(PICK.start))
  page.fireDoc('click', { clientX: 945, clientY: 16, preventDefault() {}, stopPropagation() {} })
  return page.replies(PICK.picked).at(-1).message.target
}

test('content: runtime 13 picks the worded button where runtime 12 picked its empty icon span', () => {
  const old = togglePage()
  run(old, [v12], () => {
    const target = clickIcon(old)
    assert.equal(target.tag, 'span')
    assert.equal(target.text, '')
  })
  const page = togglePage()
  run(page, [vouched], () => {
    const target = clickIcon(page)
    assert.equal(target.tag, 'button')
    assert.equal(target.text, 'Dark')
  })
})

test('content: runtime 12 then 13 on one page: 13 takes over; 13 then 12: 12 installs nothing', () => {
  for (const order of [
    [v12, vouched],
    [vouched, v12]
  ]) {
    const page = togglePage()
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      assert.equal(clickIcon(page).tag, 'button')
    })
  }
})

// ── Round 5 (stage 6 acceptance v3, 30/09/2026; runtime 14) ───────────────────────────────────────

/**
 * A page that really scrolls: `window.scrollTo` moves every element given in `movers` (they scroll with
 * the page), and the document is 4000 px tall in a 1280×700 viewport.
 * @param {object[]} movers - elements from `movable`.
 * @param {{ extra?: object[] }} [options]
 */
function scrollingStage(movers, { extra = [] } = {}) {
  const page = stage({ extra })
  const html = page.document.documentElement
  html.scrollHeight = 4000
  html.scrollWidth = 1280
  html.clientHeight = 700
  html.clientWidth = 1280
  page.document.scrollingElement = html
  page.window.innerWidth = 1280
  page.window.innerHeight = 700
  const plain = page.window.scrollTo
  page.window.scrollTo = (a, b) => {
    const before = page.window.scrollY
    plain(a, b)
    page.window.scrollY = Math.max(0, Math.min(page.window.scrollY, 4000 - 700))
    const dy = page.window.scrollY - before
    for (const el of movers) el.box = [el.box[0], el.box[1] - dy, el.box[2], el.box[3]]
  }
  return page
}

/** A wheel event on the window, as the browser delivers it (the listener may call preventDefault). */
function wheel(target, deltaY, more = {}) {
  const event = {
    target,
    deltaX: 0,
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true
    },
    ...more
  }
  return event
}

test('lockstep: in Edit the wheel scrolls in whole frames — the new box is posted first, the page moves a frame later', () => {
  // Acceptance v3 B01/B12: the side card placed its popover from `picked {moved}`, which the page could
  // only send after the browser had already painted the scrolled page: the popover trailed its element
  // by one or two frames on every step (up to 125 px in a smooth 300 px scroll).
  const p = movable(h('p', { rect: [100, 600, 300, 40], id: 'words', text: 'Four core service lines' }))
  const page = scrollingStage([p], { extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 150, clientY: 620, preventDefault() {}, stopPropagation() {} })
    const before = moves(page).length
    const event = wheel(p, 20)
    page.fire('wheel', event)
    assert.equal(event.defaultPrevented, true, 'the page takes the wheel')
    assert.equal(page.window.scrollY, 0, 'nothing has moved yet')
    const posted = moves(page).slice(before)
    assert.equal(posted.length, 1)
    assert.deepEqual(
      posted[0].message.target.rect,
      { x: 100, y: 580, width: 300, height: 40 },
      'where it WILL be'
    )
    page.frame()
    assert.equal(page.window.scrollY, 0, 'the frame of the wheel itself: the side card is still drawing')
    page.frame()
    assert.equal(page.window.scrollY, 20, 'one frame later the page lands where it said')
    page.fire('scroll', { target: page.document })
    page.flush()
    assert.equal(moves(page).length, before + 1, 'the box it posted was right: nothing posted again')
  })
})

test('lockstep: a big wheel step glides over several frames, each frame posted one frame before it lands', () => {
  const p = movable(h('p', { rect: [100, 600, 300, 40], id: 'words', text: 'Four core service lines' }))
  const page = scrollingStage([p], { extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 150, clientY: 620, preventDefault() {}, stopPropagation() {} })
    const before = moves(page).length
    page.fire('wheel', wheel(p, 300))
    page.frame()
    const landed = []
    for (let i = 0; i < 40 && page.queuedFrames() > 0; i += 1) {
      const said = moves(page).at(-1).message.target.rect.y
      page.frame()
      landed.push([said, p.box[1]])
    }
    assert.equal(page.window.scrollY, 300, 'it ends where the wheel asked')
    assert.ok(landed.length > 2, `a glide of several frames, not a jump (${String(landed.length)})`)
    for (const [said, now] of landed) assert.equal(now, said, 'every frame lands on the box posted before it')
    assert.ok(moves(page).length - before === landed.length)
  })
})

test('lockstep: a box under the pointer that can still scroll takes the wheel itself, in lockstep too', () => {
  const row = movable(h('p', { rect: [100, 900, 200, 30], id: 'row', text: 'Nested row 5' }))
  const box = h(
    'div',
    {
      rect: [80, 880, 400, 100],
      css: { overflowX: 'hidden', overflowY: 'auto' },
      scroll: [400, 600, 400, 100]
    },
    [row]
  )
  box.scrollTo = ({ top }) => {
    const dy = top - box.scrollTop
    box.scrollTop = top
    row.box = [row.box[0], row.box[1] - dy, row.box[2], row.box[3]]
  }
  const page = scrollingStage([], { extra: [box] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 110, clientY: 910, preventDefault() {}, stopPropagation() {} })
    const event = wheel(row, 16)
    page.fire('wheel', event)
    assert.equal(event.defaultPrevented, true)
    assert.equal(box.scrollTop, 0)
    assert.equal(moves(page).at(-1).message.target.rect.y, 884)
    page.frame()
    page.frame()
    assert.equal(box.scrollTop, 16)
    assert.equal(page.window.scrollY, 0, 'the page itself did not move')
    assert.match(
      page.overlay().style.cssText,
      /top:880px !important/,
      'the outline redrawn in the same frame'
    )
    // At its end the box lets the page take the wheel.
    box.scrollTop = 500
    page.fire('wheel', wheel(row, 16))
    page.frame()
    page.frame()
    assert.equal(page.window.scrollY, 16)
  })
})

test('lockstep: pick-scroll-to (the wheel over a side card box) goes the same way', () => {
  const p = movable(h('p', { rect: [100, 600, 300, 40], id: 'words', text: 'Four core service lines' }))
  const page = scrollingStage([p], { extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 150, clientY: 620, preventDefault() {}, stopPropagation() {} })
    const before = moves(page).length
    page.send(scrollToMessage(0, 24))
    assert.equal(moves(page).length, before, 'a message arrives between frames: the step waits for one')
    page.frame()
    assert.equal(page.window.scrollY, 0)
    assert.equal(moves(page).at(-1).message.target.rect.y, 576)
    page.frame()
    assert.equal(page.window.scrollY, 24, 'posted in one frame, landed in the next')
  })
})

test("lockstep: outside Edit the wheel stays the browser's; a pinch (ctrl + wheel) is never taken", () => {
  const p = movable(h('p', { rect: [100, 600, 300, 40], id: 'words', text: 'Words' }))
  const page = scrollingStage([p], { extra: [p] })
  run(page, [vouched], () => {
    const idle = wheel(p, 20)
    page.fire('wheel', idle)
    assert.equal(idle.defaultPrevented, false)
    page.send(pickMessage(PICK.start))
    const pinch = wheel(p, 20, { ctrlKey: true })
    page.fire('wheel', pinch)
    assert.equal(pinch.defaultPrevented, false)
    page.send(pickMessage(PICK.stop))
    const after = wheel(p, 20)
    page.fire('wheel', after)
    assert.equal(after.defaultPrevented, false, 'leaving Edit gives the wheel back')
  })
})

test('clip: a tracked row scrolled out of its nested box is reported hidden and not outlined; back in view it is plain again', () => {
  // Acceptance v3 B04: the row's outline and the popover floated over the video below the box.
  const row = movable(h('p', { rect: [100, 900, 200, 30], id: 'row', text: 'Nested row 5' }))
  const box = h(
    'div',
    {
      rect: [80, 880, 400, 100],
      css: { overflowX: 'hidden', overflowY: 'auto' },
      scroll: [400, 600, 400, 100]
    },
    [row]
  )
  const page = scrollingStage([], { extra: [box] })
  run(page, [vouched], () => {
    page.send(trackMessage([item('c1', '#row', 'Nested row 5')]))
    page.send(pickMessage(PICK.start))
    assert.equal(page.replies(PICK.rect).at(-1).message.hidden, undefined)
    row.box = [100, 1000, 200, 30]
    page.fire('scroll', { target: box })
    page.flush()
    const last = page.replies(PICK.rect).at(-1).message
    assert.equal(last.hidden, 'clipped')
    assert.deepEqual(last.rect, { x: 100, y: 1000, width: 200, height: 30 })
    assert.match(page.outlines()[0].style.cssText, /display:none !important/)
    row.box = [100, 900, 200, 30]
    page.fire('scroll', { target: box })
    page.flush()
    assert.equal(page.replies(PICK.rect).at(-1).message.hidden, undefined)
    assert.match(page.outlines()[0].style.cssText, /display:block !important/)
  })
})

test('clip: the picked element leaves with its box too — hidden rides on the moved target and the outline goes', () => {
  const row = movable(h('p', { rect: [100, 900, 200, 30], id: 'row', text: 'Nested row 5' }))
  const box = h(
    'div',
    { rect: [80, 880, 400, 100], css: { overflowY: 'auto' }, scroll: [400, 600, 400, 100] },
    [row]
  )
  const page = scrollingStage([], { extra: [box] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 110, clientY: 910, preventDefault() {}, stopPropagation() {} })
    row.box = [100, 820, 200, 30]
    page.fire('scroll', { target: box })
    page.flush()
    assert.equal(moves(page).at(-1).message.target.hidden, 'clipped')
    assert.match(page.overlay().style.cssText, /display:none !important/)
  })
})

test('clip: an element whose top-left corner lies under a fixed bar is reported covered (no pin over the admin bar)', () => {
  // Acceptance v3 B13: pins were clamped to the frame's top, over WordPress's admin bar.
  const heading = movable(h('h2', { rect: [100, 20, 400, 40], id: 'under', text: 'Four core service lines' }))
  const bar = h(
    'div',
    {
      rect: [0, 0, 1280, 32],
      id: 'wpadminbar',
      css: { position: 'fixed', zIndex: '99999', backgroundColor: 'rgb(29, 35, 39)' }
    },
    [h('a', { rect: [10, 5, 80, 20], text: 'Edit Page' })]
  )
  const page = scrollingStage([heading], { extra: [heading, bar] })
  run(page, [vouched], () => {
    page.send(trackMessage([item('c1', '#under', 'Four core service lines')]))
    page.send(pickMessage(PICK.start))
    assert.equal(page.replies(PICK.rect).at(-1).message.hidden, 'covered')
    heading.box = [100, 120, 400, 40]
    page.fire('scroll', { target: page.document })
    page.flush()
    assert.equal(page.replies(PICK.rect).at(-1).message.hidden, undefined)
  })
})

test('clip: a see-through layer or an invisible slide over the element does not cover it (acceptance v3 K01, K11)', () => {
  const heading = h('h1', { rect: [32, 270, 448, 60], id: 'hero-h1', text: 'Industrial parks' })
  const layer = h('div', { rect: [0, 150, 1280, 700], cls: 'hero-overlay' })
  const slide = h(
    'div',
    { rect: [0, 150, 1280, 700], css: { opacity: '0', backgroundColor: 'rgb(255, 255, 255)' } },
    [h('p', { rect: [32, 270, 448, 60], text: 'Slide two' })]
  )
  const page = stage({ extra: [heading, layer, slide] })
  run(page, [vouched], () => {
    page.send(trackMessage([item('c1', '#hero-h1', 'Industrial parks')]))
    page.send(pickMessage(PICK.start))
    assert.equal(page.replies(PICK.rect).at(-1).message.hidden, undefined)
  })
})

test("clip: an outline is painted in its element's stacking layer, so a fixed bar above the element covers it", () => {
  // Acceptance v3 B06: the outline (z-index 2147483647) was painted over the admin bar (z 99999).
  const heading = h('h2', { rect: [100, 20, 400, 40], id: 'under', text: 'Words' })
  const menu = h('nav', { rect: [0, 40, 1280, 60], css: { position: 'sticky', zIndex: '50' } }, [
    h('a', { rect: [10, 50, 80, 20], id: 'navlink', text: 'Services' })
  ])
  const page = stage({ extra: [heading, menu] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 150, clientY: 40, preventDefault() {}, stopPropagation() {} })
    assert.match(page.overlay().style.cssText, /z-index:0 !important/)
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 20, clientY: 60, preventDefault() {}, stopPropagation() {} })
    assert.match(page.overlay().style.cssText, /z-index:50 !important/, 'inside a sticky menu: its layer')
  })
})

test('embeds: while picking, iframes let the pointer through so the page hears it; leaving picking gives it back', () => {
  const page = stage()
  run(page, [vouched], () => {
    const sheet = () => page.document.documentElement.children.find((n) => n.tagName === 'STYLE')
    page.send(pickMessage(PICK.start))
    assert.ok(sheet(), 'a stylesheet of the picker is on the page')
    assert.match(sheet().textContent, /iframe,embed,object\{pointer-events:none!important\}/)
    assert.ok(sheet().hasAttribute('data-tracy-picker'))
    page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
    assert.equal(sheet(), undefined, 'picked: embeds are live again')
    page.send(pickMessage(PICK.start))
    page.send(pickMessage(PICK.stop))
    assert.equal(sheet(), undefined)
  })
})

test('disabled: a disabled button (no click from the browser) is picked on pointerup; a normal press picks once', () => {
  // Acceptance v3 K09: "Send request" stays disabled until consent is ticked, and Chrome sends no click
  // for a disabled control, so it could not be commented on.
  const submit = h('button', { rect: [100, 700, 120, 30], attrs: { disabled: '' }, text: 'Send request' })
  const page = stage({ extra: [submit] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    const press = {
      clientX: 110,
      clientY: 710,
      button: 0,
      target: submit,
      preventDefault() {},
      stopPropagation() {}
    }
    page.fireDoc('pointerup', press)
    const picked = page.replies(PICK.picked)
    assert.equal(picked.length, 1)
    assert.equal(picked[0].message.target.text, 'Send request')
    page.send(pickMessage(PICK.start))
    page.fireDoc('pointerup', {
      clientX: 130,
      clientY: 28,
      button: 0,
      target: page.span,
      preventDefault() {},
      stopPropagation() {}
    })
    assert.equal(page.replies(PICK.picked).length, 1, 'an enabled target waits for its click')
    page.fireDoc('click', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
    assert.equal(page.replies(PICK.picked).length, 2)
  })
})

test('a fresh document armed again with its carried pick outlines it solid (acceptance v3 K15, after a reload)', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(trackMessage([item('pick:1', 'nav > ul > li', 'Home', 'active')]))
    page.send(pickMessage(PICK.start))
    const [outline] = page.outlines()
    assert.ok(outline, 'the carried pick is outlined')
    assert.match(outline.style.cssText, /2px solid/)
  })
})

const RUNTIME_13 = readFileSync(new URL('./fixtures/runtime-13-c8497a953.js.txt', import.meta.url), 'utf8')
const v13 = { source: RUNTIME_13, parentOrigin: PARENT }

test('runtime 13 then 14 on one page: 14 takes over and names lockstep, name and clip; 14 then 13: 13 installs nothing', () => {
  for (const order of [
    [v13, vouched],
    [vouched, v13]
  ]) {
    const page = stage()
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      const { features } = page.replies('ready').at(-1).message
      for (const one of ['lockstep', 'name', 'clip']) assert.ok(features.includes(one), one)
    })
  }
  const old = stage()
  run(old, [v13], () => {
    assert.ok(
      !old.replies('ready')[0].message.features.includes('lockstep'),
      'a runtime-13 page names none of them'
    )
  })
})

// ── Round 5, JS area (acceptance v3 J01–J42, 30/09/2026; runtime 14) ─────────────────────────────

test('A: an element in a fixed drawer slid off screen, not displayed, or invisible is clipped — no outline, no pin, after a reload too', () => {
  // Acceptance v3 J06/J-new-3: a comment on a Joomla offcanvas item; the offcanvas closed by a transform
  // left a fixed outline and a pin floating over the hero for every seat, at every scroll, after reloads.
  const item = movable(h('a', { rect: [100, 100, 200, 40], id: 'svc', text: 'Services' }))
  const drawer = h('div', { rect: [0, 0, 700, 800], css: { position: 'fixed' } }, [item])
  const gone = h('p', { rect: [0, 0, 0, 0], id: 'none', text: 'Tab two text' })
  const unseen = h('p', {
    rect: [100, 900, 200, 40],
    id: 'hid',
    text: 'Hidden panel',
    css: { visibility: 'hidden' }
  })
  const faded = h('div', { rect: [100, 1000, 200, 40], css: { opacity: '0' } }, [
    h('p', { rect: [100, 1000, 200, 40], id: 'fade', text: 'Faded slide' })
  ])
  const page = scrollingStage([], { extra: [drawer, gone, unseen, faded] })
  run(page, [vouched], () => {
    page.send(
      trackMessage([
        item_('d', '#svc', 'Services'),
        item_('n', '#none', 'Tab two text'),
        item_('h', '#hid', 'Hidden panel'),
        item_('f', '#fade', 'Faded slide')
      ])
    )
    page.send(pickMessage(PICK.start))
    const hidden = (id) =>
      page
        .replies(PICK.rect)
        .filter((r) => r.message.id === id)
        .at(-1).message.hidden
    assert.equal(hidden('d'), undefined, 'the drawer is open')
    for (const id of ['n', 'h', 'f']) assert.equal(hidden(id), 'clipped', id)
    // The drawer slides out by a transform: its item is left of the viewport, which is all a fixed box shows.
    item.box = [-600, 100, 200, 40]
    page.mutate(drawer)
    page.flush()
    assert.equal(hidden('d'), 'clipped')
    for (const node of page.outlines()) assert.match(node.style.cssText, /display:none !important/)
  })
})

const item_ = (id, selector, text, state = 'saved') => ({ id, selector, text, state })

test('B: the picked element moving without a scroll (an image loads above) moves the outline and the popover', () => {
  // Acceptance v3 J11/J12: the popover ended up on top of its own element (−205 px), the outline too.
  const p = movable(h('p', { rect: [100, 300, 400, 30], id: 'para', text: 'Paragraph under an image' }))
  const page = stage({ extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 110, clientY: 310, preventDefault() {}, stopPropagation() {} })
    p.box = [100, 524, 400, 30]
    page.mutate(page.document.body)
    page.flush()
    assert.equal(moves(page).at(-1).message.target.rect.y, 524)
    assert.match(page.overlay().style.cssText, /top:520px !important/)
  })
})

test('B: an animation that moves the element without any DOM change is followed while it runs, then the frame loop stops', () => {
  const p = movable(h('p', { rect: [100, 300, 400, 30], id: 'para', text: 'Sliding words' }))
  const page = stage({ extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 110, clientY: 310, preventDefault() {}, stopPropagation() {} })
    page.fire('animationstart', { target: p })
    for (const y of [290, 270, 240]) {
      p.box = [100, y, 400, 30]
      page.frame()
      assert.equal(moves(page).at(-1).message.target.rect.y, y)
    }
    page.flush()
    assert.equal(page.queuedFrames(), 0, 'once the element stands still the page stops checking')
  })
})

test('B: a picked element the page re-renders is found again by its selector; gone for good it is clipped (the draft stays)', () => {
  const p = movable(h('p', { rect: [100, 300, 400, 30], id: 'para', text: 'Rendered twice' }))
  const page = stage({ extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 110, clientY: 310, preventDefault() {}, stopPropagation() {} })
    const fresh = movable(h('p', { rect: [100, 344, 400, 30], id: 'para', text: 'Rendered twice' }))
    fresh.ownerDocument = page.document
    p.isConnected = false
    const base = page.document.querySelectorAll
    page.document.querySelectorAll = (selector) => (selector === '#para' ? [fresh] : base(selector))
    page.mutate(page.document.body)
    page.flush()
    assert.equal(moves(page).at(-1).message.target.rect.y, 344)
    assert.equal(moves(page).at(-1).message.target.hidden, undefined)
    fresh.isConnected = false
    page.document.querySelectorAll = (selector) => (selector === '#para' ? [] : base(selector))
    page.mutate(page.document.body)
    page.flush()
    assert.equal(moves(page).at(-1).message.target.hidden, 'clipped')
    assert.match(page.overlay().style.cssText, /display:none !important/)
  })
})

test("C: while a box is open, the page's own focus() calls cannot pull the typing into the page", () => {
  // Acceptance v3 J27: a page calling input.focus() every 250 ms took 34 of 36 typed characters.
  const page = stage()
  let focused = 0
  class HTMLElement {}
  HTMLElement.prototype.focus = function focus() {
    focused += 1
  }
  page.window.HTMLElement = HTMLElement
  run(page, [vouched], () => {
    const input = new HTMLElement()
    page.send(pickMessage(PICK.start))
    page.send(holdMessage(true))
    input.focus()
    assert.equal(focused, 0, 'held: the page cannot take the focus')
    page.send(holdMessage(false))
    input.focus()
    assert.equal(focused, 1, 'let go: focus() is the page’s again')
    assert.equal(HTMLElement.prototype.focus.name, 'focus')
  })
})

test('F: while picking, every press, release and menu event is the picker’s; while held too', () => {
  // Acceptance v3 J-new-1: a modal the page opens on pointerup opened on the click that picked.
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    const names = ['pointerup', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'auxclick', 'contextmenu']
    for (const name of names) {
      const seen = clickThrough(page, name)
      assert.equal(seen.prevented, 1, name)
      assert.equal(seen.stopped, true, name)
    }
    clickThrough(page, 'click')
    page.send(holdMessage(true))
    for (const name of names) assert.equal(clickThrough(page, name).stopped, true, `held ${name}`)
  })
})

test('G: a page listener on window (capture) that stops a click or a move cannot stop the picker', () => {
  // Acceptance v3 J24/J25: `window.addEventListener('click', e => e.stopPropagation(), true)` made
  // picking impossible and hid the hover outline, because the picker listened on the document.
  const page = stage()
  const stop = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }
  for (const name of ['click', 'mousedown', 'pointerdown', 'mousemove'])
    page.window.addEventListener(name, stop, true)
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('mousemove', { clientX: 130, clientY: 28, preventDefault() {}, stopPropagation() {} })
    page.flush()
    assert.ok(page.overlay(), 'the hover outline is drawn')
    page.fireDoc('click', { clientX: 130, clientY: 28, detail: 1, preventDefault() {}, stopPropagation() {} })
    assert.equal(page.replies(PICK.picked).length, 1)
  })
})

test('I: a click a page script makes (not the person) while held is swallowed but closes nothing', () => {
  // Acceptance v3 J-new-2: an analytics `el.click()` closed an empty popover as if the person clicked out.
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(holdMessage(true))
    const seen = clickThrough(page, 'click', { clientX: 5, clientY: 5, isTrusted: false })
    assert.equal(seen.prevented, 1, 'still no link followed')
    assert.equal(page.replies(PICK.outside).length, 0)
    clickThrough(page, 'click')
    assert.equal(page.replies(PICK.outside).length, 1)
  })
})

test('E: an element in an open modal dialog is outlined inside the dialog (its top layer), and back outside once it closes', () => {
  // Acceptance v3 J05/J39: the outline, a child of <html>, was under the top layer of Joomla's language
  // dialog — invisible — and hung on the page after the dialog closed.
  const flag = h('img', { rect: [300, 200, 26, 20], id: 'pl', alt: 'Polski', src: 'https://s.test/pl.png' })
  const dialog = h(
    'dialog',
    { rect: [250, 150, 300, 200], attrs: { open: '' }, css: { position: 'fixed' } },
    [flag]
  )
  dialog.appendChild = (node) => {
    node.parentElement = dialog
    node.parentNode = dialog
    dialog.children.push(node)
  }
  dialog.removeChild = (node) => {
    dialog.children.splice(dialog.children.indexOf(node), 1)
    node.parentNode = null
  }
  dialog.matches = (selector) => selector === ':modal' && dialog.hasAttribute('open')
  const page = stage({ extra: [dialog] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', {
      clientX: 305,
      clientY: 205,
      detail: 1,
      preventDefault() {},
      stopPropagation() {}
    })
    const outline = dialog.children.find((n) => n.tagName === 'TRACY-PICK')
    assert.ok(outline, 'drawn inside the dialog')
    delete dialog.computed.position
    dialog.getAttribute = () => null
    dialog.hasAttribute = () => false
    flag.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0
    })
    page.mutate(dialog)
    page.flush()
    assert.equal(
      dialog.children.find((n) => n.tagName === 'TRACY-PICK'),
      undefined,
      'not left in the closed dialog'
    )
    assert.match(page.overlay().style.cssText, /display:none !important/, 'and not shown where the flag was')
  })
})

test('H: a route change by the page (pushState, replaceState, Back) announces the page again with its new address', () => {
  // Acceptance v3 J16: after `history.pushState` the address bar stayed on the old page and its pins stayed.
  const page = stage()
  const calls = []
  page.window.history = {
    pushState(...args) {
      calls.push(['push', ...args])
      page.window.location.href = `https://site.example${args[2]}`
    },
    replaceState(...args) {
      calls.push(['replace', ...args])
      page.window.location.href = `https://site.example${args[2]}`
    }
  }
  run(page, [vouched], () => {
    const readies = () => page.replies('ready').map((r) => r.message.url)
    assert.deepEqual(readies(), ['https://site.example/about/'])
    page.window.history.pushState({}, '', '/virtual-route')
    assert.equal(calls.length, 1, 'the page’s own call still runs')
    assert.deepEqual(readies(), ['https://site.example/about/', 'https://site.example/virtual-route'])
    page.window.history.replaceState({}, '', '/virtual-route#tab-2')
    assert.equal(readies().length, 2, 'a fragment names no other page')
    page.window.location.href = 'https://site.example/about/'
    page.fire('popstate')
    assert.equal(readies().at(-1), 'https://site.example/about/')
    assert.ok(page.replies('ready').at(-1).message.features.includes('route'))
    page.window.TracyPreviewRuntime.dispose()
    page.window.history.pushState({}, '', '/after-dispose')
    assert.equal(readies().length, 3, 'disposed: the history methods are the page’s own again')
  })
})

test('H: a theme copy with no vouched parent leaves history alone', () => {
  const page = stage()
  const push = () => {}
  page.window.history = { pushState: push, replaceState: push }
  run(page, [plain], () => assert.equal(page.window.history.pushState, push))
})

test('lockstep with a side card that answers pick-drawn: each step lands only once drawn — a slow side card slows the scroll, it never falls behind', () => {
  // Measured under heavy load (load average 40+): the side card's render slipped several frames and
  // the boxes trailed by up to 105 px while the page kept landing its steps on time.
  const p = movable(h('p', { rect: [100, 600, 300, 40], id: 'words', text: 'Four core service lines' }))
  const page = scrollingStage([p], { extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', {
      clientX: 150,
      clientY: 620,
      detail: 1,
      preventDefault() {},
      stopPropagation() {}
    })
    const steps = () => page.replies(PICK.step).map((r) => r.message.step)
    const drawn = (step) => page.send({ channel: CHANNEL, v: VERSION, kind: PICK.drawn, step })
    assert.deepEqual(steps(), [0], 'asked at pick-start, before any scroll')
    page.fire('wheel', wheel(p, 20))
    assert.deepEqual(steps(), [0, 1], 'the boxes of step 1, then its number')
    page.flush()
    assert.equal(page.window.scrollY, 20, 'no answer seen yet: landed a frame later, as without one')
    drawn(1)
    // From now on the page waits for the answer.
    page.fire('wheel', wheel(p, 20))
    page.frame()
    page.frame()
    page.frame()
    assert.equal(page.window.scrollY, 20, 'three frames, no answer: not landed')
    drawn(2)
    page.frame()
    assert.equal(page.window.scrollY, 40, 'the answer: landed in the next frame')
    // An answer for an older step does nothing; no answer at all lands after the wait.
    page.fire('wheel', wheel(p, 20))
    drawn(2)
    page.frame()
    assert.equal(page.window.scrollY, 40)
    page.step()
    assert.equal(page.window.scrollY, 60, 'no answer within the wait: it lands anyway')
    assert.deepEqual(page.delays.slice(-1), [LOCKSTEP_WAIT_MS])
  })
})

// ── Round 8 (stage 6 acceptance v5, JS area, 30/09/2026; decided by the agent while Brian slept) ──

test('R8 focus: while held, a saved focus reference, select(), setSelectionRange() and window.focus() take nothing', () => {
  // Acceptance v5 JS-v5-new-4a/b/c: a page that kept `HTMLElement.prototype.focus` from load, one that
  // called `input.select()`, and one that called `window.focus()` took 23, 22 and 22 of 26 typed characters.
  const page = stage()
  const calls = { focus: 0, select: 0, range: 0, window: 0 }
  class HTMLElement {}
  HTMLElement.prototype.focus = function focus() {
    calls.focus += 1
  }
  class HTMLInputElement extends HTMLElement {}
  HTMLInputElement.prototype.select = function select() {
    calls.select += 1
  }
  HTMLInputElement.prototype.setSelectionRange = function setSelectionRange() {
    calls.range += 1
  }
  class HTMLTextAreaElement extends HTMLElement {}
  HTMLTextAreaElement.prototype.select = HTMLInputElement.prototype.select
  HTMLTextAreaElement.prototype.setSelectionRange = HTMLInputElement.prototype.setSelectionRange
  Object.assign(page.window, { HTMLElement, HTMLInputElement, HTMLTextAreaElement })
  page.window.focus = function focus() {
    calls.window += 1
  }
  run(page, [vouched], () => {
    // A page script that runs after the runtime and keeps its own references.
    const savedFocus = HTMLElement.prototype.focus
    const savedWindowFocus = page.window.focus
    const input = new HTMLInputElement()
    const area = new HTMLTextAreaElement()
    const trap = () => {
      savedFocus.call(input)
      input.select()
      area.select()
      input.setSelectionRange(0, 1)
      page.window.focus()
      savedWindowFocus.call(page.window)
    }
    page.send(pickMessage(PICK.start))
    page.send(holdMessage(true))
    trap()
    assert.deepEqual(calls, { focus: 0, select: 0, range: 0, window: 0 }, 'held: nothing moves the focus')
    page.send(holdMessage(false))
    trap()
    assert.deepEqual(
      calls,
      { focus: 1, select: 2, range: 1, window: 2 },
      'let go: every call is the page’s again'
    )
  })
})

test('R8 focus: the frame taking the focus while held (a reference kept from before the runtime) asks the side card for it back', () => {
  const page = stage()
  let blurred = 0
  const input = h('input', { rect: [100, 300, 200, 30] })
  input.blur = () => {
    blurred += 1
  }
  run(page, [vouched], () => {
    page.document.activeElement = input
    page.send(pickMessage(PICK.start))
    page.fire('focus', { target: input, isTrusted: true })
    assert.equal(page.replies(PICK.refocus).length, 0, 'not held: the page may take the focus')
    page.send(holdMessage(true))
    page.fire('focus', { target: input, isTrusted: true })
    assert.equal(page.replies(PICK.refocus).length, 1)
    assert.equal(page.replies(PICK.refocus)[0].target, PARENT, 'to the vouched origin only')
    assert.equal(blurred, 1, 'the page field lets go of the focus')
    // The person pressing inside the frame is theirs to decide (a click outside closes or flashes).
    clickThrough(page, 'pointerdown', { clientX: 5, clientY: 5, isTrusted: true })
    page.fire('focus', { target: input, isTrusted: true })
    assert.equal(page.replies(PICK.refocus).length, 1, 'focus after a press by the person is not taken back')
  })
})

test('R8 listeners: a page window listener that stops presses, added after load, cannot block Edit after Interactive → Edit', () => {
  // Acceptance v5 JS-v5-new-5: begin() added the picker's window listeners again after the page's, so a
  // page listener calling stopImmediatePropagation ran first and the click picked nothing.
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(pickMessage(PICK.stop))
    const stop = (e) => {
      e.stopImmediatePropagation()
      e.preventDefault()
    }
    for (const name of ['pointerdown', 'mousedown', 'click']) page.window.addEventListener(name, stop, true)
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 130, clientY: 28, detail: 1, preventDefault() {}, stopPropagation() {} })
    assert.equal(page.replies(PICK.picked).length, 1, 'the click still picks')
    page.send(holdMessage(true))
    clickThrough(page, 'click', { clientX: 5, clientY: 5 })
    assert.equal(page.replies(PICK.outside).length, 1, 'and a held click is still reported')
  })
})

test('R8 clip: a box that cuts its overflow cuts at its padding box — an element under its 1px border only is clipped', () => {
  // Acceptance v5 J01 / JS-v5-new-2: a slide moved out of a carousel with a 1px border kept a 37 px
  // outline sliver and its popover, because the cut was measured on the border box.
  const slide = movable(h('div', { rect: [101, 101, 400, 200], id: 'slide1', text: 'Slide one' }))
  const track = h(
    'div',
    { rect: [100, 100, 402, 202], css: { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden' } },
    [slide]
  )
  Object.assign(track, { clientLeft: 1, clientTop: 1, clientWidth: 400, clientHeight: 200 })
  const page = stage({ extra: [track] })
  run(page, [vouched], () => {
    page.send(trackMessage([item('s', '#slide1', 'Slide one')]))
    page.send(pickMessage(PICK.start))
    assert.equal(page.replies(PICK.rect).at(-1).message.hidden, undefined)
    slide.box = [-299, 101, 400, 200]
    page.mutate(track)
    page.flush()
    assert.equal(page.replies(PICK.rect).at(-1).message.hidden, 'clipped')
  })
})

test('R8 clip: clip-path, content-visibility and a screen-reader-only box count as hidden', () => {
  // Acceptance v5 JS-v5-new-6, 7c, 7d: the outline and popover hung over empty space.
  const clipped = h('p', {
    rect: [100, 600, 400, 30],
    id: 'cp',
    text: 'Clip path',
    css: { clipPath: 'inset(100%)' }
  })
  const skipped = h('section', { rect: [100, 700, 400, 100], css: { contentVisibility: 'hidden' } }, [
    h('p', { rect: [100, 700, 400, 30], id: 'cv', text: 'Skipped words' })
  ])
  const sr = h('span', {
    rect: [100, 900, 1, 1],
    id: 'sr',
    text: 'Screen reader words',
    css: { position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)', overflow: 'hidden' }
  })
  const plainP = h('p', {
    rect: [100, 1000, 400, 30],
    id: 'ok',
    text: 'Shown words',
    css: { clipPath: 'inset(10%)' }
  })
  const page = stage({ extra: [clipped, skipped, sr, plainP] })
  run(page, [vouched], () => {
    page.send(
      trackMessage([
        item('cp', '#cp', 'Clip path'),
        item('cv', '#cv', 'Skipped words'),
        item('sr', '#sr', 'Screen reader words'),
        item('ok', '#ok', 'Shown words')
      ])
    )
    page.send(pickMessage(PICK.start))
    const hidden = (id) =>
      page
        .replies(PICK.rect)
        .filter((r) => r.message.id === id)
        .at(-1).message.hidden
    for (const id of ['cp', 'cv', 'sr']) assert.equal(hidden(id), 'clipped', id)
    assert.equal(hidden('ok'), undefined)
  })
})

test('R8: ready names refocus on a vouched page (runtime 15)', () => {
  const page = stage()
  run(page, [vouched], () => assert.ok(page.replies('ready')[0].message.features.includes('refocus')))
})

// ── Round 10 (acceptance v5 pick, 30/09/2026; runtime 16) ─────────────────────────────────────────

test('R10 item 2: a double-click in Edit — the second click never reaches the page, before the hold arrives', () => {
  // Acceptance v5 PICK-new-7: the first click picked and let go of the pointer; the hold came from the
  // side card ~5–10 ms later, and the second click of a double-click fell into that gap — a menu link
  // navigated the frame, a heading's word was selected.
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    assert.equal(clickThrough(page, 'click').prevented, 1)
    assert.equal(page.replies(PICK.picked).length, 1)
    for (const name of [
      'pointerdown',
      'mousedown',
      'selectstart',
      'pointerup',
      'mouseup',
      'click',
      'dblclick',
      'auxclick'
    ]) {
      const seen = clickThrough(page, name)
      assert.equal(seen.prevented, 1, `${name} after the pick, before the hold`)
      assert.equal(seen.stopped, true, name)
    }
    assert.equal(page.replies(PICK.picked).length, 1, 'the second click picks nothing new')
    assert.equal(page.replies(PICK.outside).length, 0)
  })
})

test('R10 item 2: selecting text is the picker’s while picking and while held; Edit off gives it back', () => {
  const page = stage()
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    assert.equal(clickThrough(page, 'selectstart').prevented, 1, 'picking')
    page.send(holdMessage(true))
    assert.equal(clickThrough(page, 'selectstart').prevented, 1, 'held')
    page.send(holdMessage(false))
    page.send(pickMessage(PICK.stop))
    for (const name of ['selectstart', 'click', 'dblclick'])
      assert.equal(clickThrough(page, name).prevented, 0, `Edit off: ${name}`)
  })
})

/** A nested list whose row can be picked: the box scrolls itself (acceptance v5 B04). */
function nestedList() {
  const row = movable(h('p', { rect: [100, 900, 200, 30], id: 'row', text: 'Nested row 5' }))
  const box = h(
    'div',
    {
      rect: [80, 880, 400, 100],
      css: { overflowX: 'hidden', overflowY: 'auto' },
      scroll: [400, 600, 400, 100]
    },
    [row]
  )
  box.scrollTo = ({ top }) => {
    const dy = top - box.scrollTop
    box.scrollTop = top
    row.box = [row.box[0], row.box[1] - dy, row.box[2], row.box[3]]
  }
  return { row, box }
}

const wheelOver = (dx, dy, id) => {
  const message = { channel: CHANNEL, v: VERSION, kind: PICK.wheel, dx, dy }
  return id === undefined ? message : { ...message, id }
}

test('R10 item 4: pick-wheel over the popover scrolls the nested box its element is in, in lockstep — not the page', () => {
  const { row, box } = nestedList()
  const page = scrollingStage([], { extra: [box] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 110, clientY: 910, preventDefault() {}, stopPropagation() {} })
    page.send(wheelOver(0, 16))
    page.frame()
    assert.equal(box.scrollTop, 0, 'posted first')
    assert.equal(moves(page).at(-1).message.target.rect.y, 884)
    page.frame()
    assert.equal(box.scrollTop, 16, 'landed a frame later')
    assert.equal(page.window.scrollY, 0, 'the page did not move')
    // At its end the box lets the page take the step.
    box.scrollTop = 500
    page.send(wheelOver(0, 16))
    page.frame()
    page.frame()
    assert.equal(page.window.scrollY, 16)
    assert.equal(row.isConnected, undefined)
  })
})

test('R10 item 4: pick-wheel with a tracked id (a thread card, a pin) scrolls that element’s box', () => {
  const { box } = nestedList()
  const page = scrollingStage([], { extra: [box] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.send(track([item('c1', '#row', 'Nested row 5')]))
    page.send(wheelOver(0, 20, 'c1'))
    page.frame()
    page.frame()
    assert.equal(box.scrollTop, 20)
    assert.equal(page.window.scrollY, 0)
    // An id not tracked: the page scrolls, as the side card's old pick-scroll-to did.
    page.send(wheelOver(0, 30, 'nope'))
    page.frame()
    page.frame()
    assert.equal(page.window.scrollY, 30)
  })
})

test('R10 item 4: pick-wheel outside Edit, from another origin, or malformed does nothing', () => {
  const { box } = nestedList()
  const page = scrollingStage([], { extra: [box] })
  run(page, [vouched], () => {
    page.send(wheelOver(0, 20))
    page.flush()
    assert.equal(page.window.scrollY, 0, 'outside Edit')
    page.send(pickMessage(PICK.start))
    page.send(wheelOver(0, 20), { origin: STRANGER })
    page.send(wheelOver('x', 20))
    page.send(wheelOver(0, Number.NaN))
    page.flush()
    assert.equal(page.window.scrollY, 0)
    assert.equal(box.scrollTop, 0)
  })
})

test('R10 item 4: a picked element re-rendered without its id is found again by its words', () => {
  // Acceptance v5 PICK-new-2: the node was replaced, same words, same place, no id — the popover fell
  // to the frame corner because the selector (`#para`) names nothing any more.
  const p = movable(h('p', { rect: [100, 300, 400, 30], id: 'para', text: 'Rendered without an id' }))
  const page = stage({ extra: [p] })
  run(page, [vouched], () => {
    page.send(pickMessage(PICK.start))
    page.fireDoc('click', { clientX: 110, clientY: 310, preventDefault() {}, stopPropagation() {} })
    const fresh = movable(h('p', { rect: [100, 344, 400, 30], text: 'Rendered without an id' }))
    fresh.ownerDocument = page.document
    p.isConnected = false
    const base = page.document.querySelectorAll
    page.document.querySelectorAll = (selector) =>
      selector === '#para' ? [] : selector === 'p' ? [fresh, ...base('p')] : base(selector)
    page.mutate(page.document.body)
    page.flush()
    assert.equal(moves(page).at(-1).message.target.rect.y, 344)
    assert.equal(moves(page).at(-1).message.target.hidden, undefined)
  })
})

const RUNTIME_15 = readFileSync(new URL('./fixtures/runtime-15-83b643ec6.js.txt', import.meta.url), 'utf8')
const v15 = { source: RUNTIME_15, parentOrigin: PARENT }

test('runtime 15 then 16 on one page: 16 takes over and names pins60 and wheel; 16 then 15: 15 installs nothing', () => {
  for (const order of [
    [v15, vouched],
    [vouched, v15]
  ]) {
    const page = stage()
    run(page, order, () => {
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
      assert.equal(page.listeners.window.get('message').length, 1)
      const { features } = page.replies('ready').at(-1).message
      for (const one of ['pins60', 'wheel']) assert.ok(features.includes(one), one)
    })
  }
  const old = stage()
  run(old, [v15], () => {
    const { features } = old.replies('ready')[0].message
    assert.ok(features.includes('refocus') && !features.includes('pins60'), 'a runtime-15 page names neither')
    // It refuses a set of 13 whole: the side card sends it 12 at most (TRACK_LIMITS.itemsBefore16).
    old.send(pickMessage(PICK.start))
    const before = old.posted.length
    old.send(track(Array.from({ length: 13 }, (_, i) => item(`k${String(i)}`, '#x', 'X'))))
    assert.equal(old.posted.length, before)
  })
})

// ── the view report (runtime 17) ───────────────────────────────────────────────────────────────────

/** A page as a customer's Browser tab shows it: scrolled, in a narrow window, preferring a dark scheme. */
function shownPage({ dark = true } = {}) {
  const page = stage()
  Object.assign(page.window, {
    scrollY: 1200,
    innerWidth: 640,
    innerHeight: 800,
    matchMedia: (query) => ({ matches: dark && query.includes('prefers-color-scheme: dark') }),
    performance: { timeOrigin: 1700000000123.4 }
  })
  return page
}

const views = (page) => page.replies('view').map((entry) => entry.message)

test('a page with a picker says where it is when shown — to the vouched origin, never to *', () => {
  const page = shownPage()
  run(page, [vouched], () => {
    assert.deepEqual(views(page), [
      {
        channel: CHANNEL,
        v: VERSION,
        kind: 'view',
        url: 'https://site.example/about/',
        y: 1200,
        w: 640,
        h: 800,
        dark: true,
        t: 1700000000123
      }
    ])
    assert.equal(page.replies('view')[0].target, PARENT)
    assert.notEqual(viewFrom(views(page)[0]), null, 'the reader the chat uses accepts what the page sends')
    assert.ok(
      page.posted.every((entry) => entry.target === PARENT),
      'nothing of a picker page goes to *'
    )
  })
})

test('the report is as clean as `ready.url`: no credentials, no fragment, no secret-looking parameter', () => {
  const page = shownPage({ dark: false })
  page.window.location.href = 'https://user:pass@site.example/a?token=abc&page=2#access_token=zzz'
  run(page, [vouched], () => {
    assert.equal(views(page)[0].url, 'https://site.example/a?page=2')
    assert.equal(views(page)[0].dark, false)
  })
})

test('🔒 a theme’s own copy, with no picker, says nothing about the page', () => {
  const page = shownPage()
  run(page, [plain], () => {
    assert.equal(views(page).length, 0)
    assert.equal(page.listeners.window.get('scroll'), undefined, 'and listens for no scroll')
    assert.equal(page.listeners.window.get('resize'), undefined)
  })
})

test('a scroll is reported once it settles, once per gap however many events, and only when something moved', () => {
  const page = shownPage()
  run(page, [vouched], () => {
    assert.equal(views(page).length, 1)
    page.window.scrollY = 1500
    page.fire('scroll')
    page.fire('scroll')
    page.fire('scroll')
    assert.equal(views(page).length, 1, 'not on every event')
    assert.equal(page.delays.filter((ms) => ms === VIEW.gap).length, 1, 'one timer for the burst')
    page.flush()
    assert.equal(views(page).length, 2)
    assert.equal(views(page)[1].y, 1500)
    // A scroll event that moved nothing measured (a box inside the page scrolled) costs nothing.
    page.fire('scroll')
    page.flush()
    assert.equal(views(page).length, 2)
  })
})

test('a resize is reported the same way, with the new window', () => {
  const page = shownPage()
  run(page, [vouched], () => {
    page.window.innerWidth = 900
    page.window.innerHeight = 700
    page.fire('resize')
    page.flush()
    assert.equal(views(page).length, 2)
    assert.deepEqual([views(page)[1].w, views(page)[1].h], [900, 700])
  })
})

test('a page shown again (back/forward cache) says so even when nothing moved; the top is a scroll of 0', () => {
  const page = shownPage()
  page.window.scrollY = 0
  run(page, [vouched], () => {
    assert.equal(views(page)[0].y, 0)
    page.fire('pageshow')
    assert.equal(views(page).length, 2)
    assert.deepEqual(views(page)[1], views(page)[0], 'the same numbers, sent again on purpose')
  })
})

test('each document is its own: a new one carries another `t`, the same one keeps it across reports', () => {
  const first = shownPage()
  const second = shownPage()
  second.window.performance = { timeOrigin: 1700000009999.9 }
  let a
  let b
  run(first, [vouched], () => {
    first.window.scrollY = 10
    first.fire('scroll')
    first.flush()
    a = views(first)
  })
  run(second, [vouched], () => {
    b = views(second)
  })
  assert.equal(a[0].t, a[1].t)
  assert.notEqual(a[0].t, b[0].t)
})

test('a page that leaves says nothing more: pagehide cancels a report that was waiting', () => {
  const page = shownPage()
  run(page, [vouched], () => {
    page.window.scrollY = 2000
    page.fire('scroll')
    page.fire('pagehide')
    page.flush()
    assert.equal(views(page).length, 1)
  })
})

test('a newer copy takes over the report: the older one lets go of scroll and resize', () => {
  // One copy alone holds some number of scroll and resize listeners (the view report's, and since the
  // merge with runtime 16 the scroll watch's too); a newer copy taking over must hold exactly as many.
  const alone = shownPage()
  const counts = {}
  run(alone, [vouched], () => {
    counts.scroll = alone.listeners.window.get('scroll').length
    counts.resize = alone.listeners.window.get('resize').length
  })
  const page = shownPage()
  run(page, [vouched, newerVouched], () => {
    assert.equal(page.listeners.window.get('scroll').length, counts.scroll)
    assert.equal(page.listeners.window.get('resize').length, counts.resize)
    page.window.scrollY = 1500
    page.fire('scroll')
    page.flush()
    assert.equal(views(page).at(-1).y, 1500)
    assert.equal(views(page).filter((v) => v.y === 1500).length, 1, 'reported once, not by both copies')
  })
})

// ── The address without a picker (runtime 18, feature `address`) ─────────────────────────────
//
// Brian 30/09/2026, EmDash `capiel1647` on the local stand: the frame held a page the proxy served
// WITHOUT the picker (its request carried no session for the seat the ticket named, so the ticket was
// not redeemed). Edit mode then picked nothing, a click on the site's own "Contact" link loaded
// `/contact`, and nothing in that page said where it was: EmDash has no copy of this runtime at all,
// and a theme's copy says `ready` to '*' with no address. The Browser tab's address bar, the dsh
// page's `page=` and the Comments view stayed on `/careers`. Measured on the stand (message log in
// `tasks/nhat-ky/2026-09-30-browser-address-follow.md`): the same click WITH a picker was followed on
// all three CMSs; WITHOUT one, on none. So the proxy now names Tracy's own origin on every framed page
// it does not vouch a picker for (`data-report-origin`), and the page tells exactly that origin its
// address — nothing else, since no text of the page leaves it.

const RUNTIME_17 = readFileSync(new URL('./fixtures/runtime-17-7b39fcddf.js.txt', import.meta.url), 'utf8')
const reporter = { source: current, reportOrigin: PARENT }
const addressReadies = (page) => page.replies('ready').filter((r) => r.message.url !== undefined)

test('address: a page with a report origin and no picker says its address to that origin only', () => {
  const page = stage()
  run(page, [reporter], () => {
    const [said] = addressReadies(page)
    assert.deepEqual(said.message, {
      channel: CHANNEL,
      v: VERSION,
      kind: 'ready',
      features: ['address', 'route'],
      url: 'https://site.example/about/'
    })
    assert.equal(said.target, PARENT)
    assert.ok(
      addressReadies(page).every((r) => r.target === PARENT),
      'the address never goes to anyone else'
    )
    // It still refreshes (nothing on the page does it for it), and it still picks nothing.
    assert.deepEqual(exercise(page), { reloads: 1, picked: 0 })
    assert.equal(page.overlay(), null)
    assert.equal(page.replies(PICK.picked).length, 0)
  })
})

test('address: the anonymous ready still goes to anyone, with no address in it', () => {
  // A local dsh at 127.0.0.1 (allowed by the proxy's `frame-ancestors`) is not the origin the proxy
  // names; it kept its refresh through the '*' ready and must keep it.
  const page = stage()
  run(page, [reporter], () => {
    const open = page.replies('ready').filter((r) => r.target === '*')
    assert.equal(open.length, 1)
    assert.deepEqual(open[0].message, { channel: CHANNEL, v: VERSION, kind: 'ready', features: [] })
  })
})

test('address: every document says it — the page after a link followed inside the frame names itself', () => {
  // A full navigation is a new document running the runtime again: `/careers`, then `/contact`.
  const careers = stage()
  careers.window.location.href = 'https://site.example/careers'
  run(careers, [reporter], () => {
    assert.deepEqual(
      addressReadies(careers).map((r) => r.message.url),
      ['https://site.example/careers']
    )
  })
  const contact = stage()
  contact.window.location.href = 'https://site.example/contact?tracy_preview=pv1.secret#top'
  run(contact, [reporter], () => {
    assert.deepEqual(
      addressReadies(contact).map((r) => r.message.url),
      ['https://site.example/contact']
    )
    contact.fire('pageshow')
    assert.equal(addressReadies(contact).length, 2, 'a back/forward restore says it again')
  })
})

test('address: a route change inside a single-page site is said again, and dispose gives history back', () => {
  const page = stage()
  const push = function pushState(...args) {
    page.window.location.href = `https://site.example${args[2]}`
  }
  page.window.history = { pushState: push, replaceState: push }
  run(page, [reporter], () => {
    page.window.history.pushState({}, '', '/contact')
    assert.deepEqual(
      addressReadies(page).map((r) => r.message.url),
      ['https://site.example/about/', 'https://site.example/contact']
    )
    assert.equal(addressReadies(page).at(-1).target, PARENT)
    page.window.TracyPreviewRuntime.dispose()
    assert.equal(page.window.history.pushState, push)
  })
})

test('address: beside the first release in a theme, in either order, it still says the address and refreshes once', () => {
  for (const order of [
    [legacy, reporter],
    [reporter, legacy]
  ]) {
    const page = stage()
    run(page, order, () => {
      assert.deepEqual(
        addressReadies(page).map((r) => r.message.url),
        ['https://site.example/about/']
      )
      assert.deepEqual(exercise(page), { reloads: 1, picked: 0 })
    })
  }
})

test('address: beside a runtime-17 theme copy, in either order, the address is said once per show', () => {
  const old = { source: RUNTIME_17 }
  for (const order of [
    [old, reporter],
    [reporter, old]
  ]) {
    const page = stage()
    run(page, order, () => {
      assert.deepEqual(
        addressReadies(page).map((r) => r.message.url),
        ['https://site.example/about/']
      )
      assert.deepEqual(exercise(page), { reloads: 1, picked: 0 })
      assert.equal(page.window.TracyPreviewRuntime.version, RUNTIME_VERSION)
    })
  }
})

test('address: a newer theme copy without attributes keeps saying the address to the named origin', () => {
  const page = stage()
  run(page, [reporter, { source: newer }], () => {
    assert.equal(page.window.TracyPreviewRuntime.reportOrigin, PARENT)
    page.fire('pageshow')
    assert.equal(addressReadies(page).at(-1).target, PARENT)
    // Said by the first copy, again by the newer one taking over, and once more on `pageshow`.
    assert.equal(page.replies('ready').filter((r) => r.target === PARENT).length, 3)
  })
})

test('address: a picker wins over a report origin, and a malformed report origin names nobody', () => {
  const both = stage()
  run(both, [{ source: current, parentOrigin: PARENT, reportOrigin: STRANGER }], () => {
    assert.ok(both.posted.every((p) => p.target !== STRANGER))
    assert.ok(addressReadies(both)[0].message.features.includes('pick'))
  })
  for (const reportOrigin of ['', 'javascript:alert(1)', `${PARENT}/path`, 'not a url']) {
    const page = stage()
    run(page, [{ source: current, reportOrigin }], () => {
      assert.deepEqual(addressReadies(page), [], reportOrigin)
    })
  }
})
