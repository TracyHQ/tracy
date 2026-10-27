/**
 * Five defects met installing the ja-restaurant demo from /ops on dev (11/10/2026), plus the Create
 * listing that filled nothing, each pressed on the real screens:
 *
 *   1. One Retry install made three provision jobs: the row let a press through while a new job was
 *      in flight, because the last job it followed (failed) still stood for it until the next poll.
 *   2. A failure on the copy an older broken attempt left behind ("refuses a nonempty site") had no
 *      way forward on the Demo Site card: it now says so and offers Remove there.
 *   3. A removal in flight read "Installing · taking the old copy down" on the Demos screen.
 *   4. A removal that finished kept that label until reload.
 *   5. The Listing card stayed locked ("Waiting for the demo site.") after the demo went live.
 *   6. Create listing on a demo the host could not read printed "the door answered 502".
 *
 * Mounted with react-dom on a linkedom document; `fetch` is a fixture, nothing leaves the process.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const { parseHTML } = rootRequire('linkedom')

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const deferred = () => {
  /** @type {(value: any) => void} */
  let resolve = () => {}
  /** @type {(reason: any) => void} */
  let reject = () => {}
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const json = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })

const GLOBALS = [
  'window',
  'document',
  'location',
  'fetch',
  'ResizeObserver',
  'MutationObserver',
  'HTMLElement',
  'Element',
  'Node',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT'
]
const saved = new Map()
/** @type {any} */
let lib
/** @type {any} */
let dom
/** @type {(() => Promise<void>)[]} */
let cleanups = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { Demos } from './Demos'
        export { ReleaseDemo } from './ReleaseDemo'
        export { DesignInspirationPanel } from './DesignInspiration'
        export { failedInstallGuide } from './demo-failure-guides'`,
      resolveDir: path.join(pkgRoot, 'src', 'cms'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    // React stays outside the bundle and is loaded by Node itself: bundled, its `act` cannot find
    // `module.require` and falls back to a MessageChannel that keeps the test process alive.
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('location', { origin: 'http://harness.test', href: 'http://harness.test/cms', pathname: '/cms' })
  set('MutationObserver', window.MutationObserver)
  set('HTMLElement', window.HTMLElement)
  set('Element', window.Element)
  set('Node', window.Node)
  set(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const styles = () => new Proxy({ getPropertyValue: () => '' }, { get: (t, k) => (k in t ? t[k] : '') })
  set('getComputedStyle', styles)
  set('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0))
  set('cancelAnimationFrame', (id) => clearTimeout(id))
  for (const [name, value] of Object.entries({
    getComputedStyle: styles,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ResizeObserver: globalThis.ResizeObserver,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  }))
    if (typeof window[name] !== 'function') window[name] = value
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

/** Mount one component; `render(next)` draws it again with those props merged in. */
async function mountOf(component, props) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  let current = props
  const render = (next = {}) =>
    lib.act(async () => {
      current = { ...current, ...next }
      root.render(lib.createElement(component, current))
    })
  const settle = () => lib.act(async () => tick(5))
  let mounted = true
  const unmount = async () => {
    if (!mounted) return
    mounted = false
    await lib.act(async () => root.unmount())
    host.remove()
  }
  cleanups.push(unmount)
  await render()
  await settle()
  await settle()
  const fire = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }))
  return {
    host,
    render,
    settle,
    unmount,
    buttons: (scope = host) => [...scope.querySelectorAll('button')],
    /** Press `button()` `times` times in one tick, before React can redraw it. */
    press: async (button, times = 1) => {
      await lib.act(async () => {
        for (let i = 0; i < times; i += 1) {
          const el = typeof button === 'function' ? button() : button
          if (el) fire(el, 'click')
        }
        await tick(5)
      })
      await settle()
    },
    leave: (el) => lib.act(async () => void fire(el, 'focusout')),
    /** Everything the screen prints in its error colour. */
    errors: () =>
      [...host.querySelectorAll('.text-destructive')]
        .filter((el) => el.tagName !== 'BUTTON' && el.closest('button') === null)
        .map((el) => el.textContent.trim())
        .filter((text) => text !== '')
  }
}

const TAG = 'quickstart/ja-restaurant/j6'
const LABEL = 'ja-restaurant-joomla'
const STALE = 'quickstart restore refuses a nonempty site not owned by this provision'
const deployedOf = (over = {}) => ({
  label: LABEL,
  host: 'fleet-01',
  address: `https://${LABEL}.tracy.test/`,
  version: '1.0.3',
  jobId: 'job-old',
  kind: 'provision',
  state: 'failed',
  step: 'provision',
  reason: STALE,
  deployedAt: '2026-09-24T00:00:00Z',
  live: false,
  ...over
})
const rowOf = (deployed) => ({
  tag: TAG,
  platform: 'joomla',
  label: LABEL,
  defaultLabel: LABEL,
  address: `https://${LABEL}.tracy.test/`,
  pinned: false,
  revision: 1,
  updatedBy: null,
  updatedAt: null,
  deployed
})
const listingOf = (deployed) => ({
  host: 'fleet-01',
  target: 'tracy',
  targets: [{ name: 'tracy', kind: 'host', zone: 'tracy.test', serverName: 'fleet-01', serverIp: null }],
  servers: [],
  defaultServer: 'fleet-01',
  zone: 'tracy.test',
  writable: true,
  reason: null,
  demos: [rowOf(deployed)]
})

/**
 * The demo doors as one moving server: `deployed` is what the listing answers, `polls[id]` the
 * answers the job door gives for that id, in order (the last one repeats), each a value or a
 * promise the test resolves.
 */
function demoServer(deployed) {
  const server = { deployed, polls: {}, installs: 0, removes: 0, sent: [] }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://harness.test')
    const method = init.method ?? 'GET'
    server.sent.push(`${method} ${url.pathname}${url.search}`)
    if (url.pathname === '/api/ops/demos/install') {
      server.installs += 1
      const jobId = `job-${server.installs}`
      server.deployed = deployedOf({ jobId, state: 'queued', step: null, reason: undefined })
      return json(202, { jobId })
    }
    if (url.pathname === '/api/ops/demos' && method === 'DELETE') {
      server.removes += 1
      server.deployed = deployedOf({ jobId: 'job-rm', kind: 'remove', state: 'queued', step: null })
      return json(202, { jobId: 'job-rm' })
    }
    if (url.pathname === '/api/ops/demos/job') {
      const list = server.polls[url.searchParams.get('id')] ?? []
      const next = list.length > 1 ? list.shift() : list[0]
      if (next === undefined) return json(404, { error: 'JOB_UNKNOWN' })
      const answer = await next
      // The listing moves with the job, as tracy-web's row does.
      if (answer.removed) server.deployed = null
      else if (answer.state === 'failed')
        server.deployed = deployedOf({ jobId: answer.jobId, kind: answer.kind, reason: answer.reason })
      return json(200, answer)
    }
    if (url.pathname === '/api/ops/demos') return json(200, listingOf(server.deployed))
    if (url.pathname === '/api/ops/quickstarts')
      return json(200, { releases: [{ tag: TAG, version: '1.0.3' }] })
    return json(404, {})
  }
  return server
}
const view = (jobId, over = {}) => ({
  jobId,
  kind: 'provision',
  state: 'running',
  step: 'provision',
  live: false,
  ...over
})
const buttonNamed = (ui, re) => ui.buttons().find((b) => re.test(b.textContent)) ?? null

// ── 1. One press, at most one job ────────────────────────────────────────────────────────────────

test('1: after a failed job, a new install holds every press until the new job is known', async () => {
  const server = demoServer(deployedOf({ reason: 'something else' }))
  const ui = await mountOf(lib.ReleaseDemo, { tag: TAG, releaseVersion: '1.0.3' })
  // First Retry: it fails at once.
  server.polls['job-1'] = [view('job-1', { state: 'failed', reason: 'boom' })]
  await ui.press(() => buttonNamed(ui, /Retry install/))
  await ui.press(() => buttonNamed(ui, /Install over/))
  assert.equal(server.installs, 1)
  await ui.settle()
  assert.match(ui.host.textContent, /Retry install/)

  // Second Retry: its job's first poll has not answered yet.
  const held = deferred()
  server.polls['job-2'] = [held.promise]
  await ui.press(() => buttonNamed(ui, /Retry install/))
  await ui.press(() => buttonNamed(ui, /Install over/))
  assert.equal(server.installs, 2)
  await ui.settle()
  const main = ui.buttons().find((b) => /Install|Retry|Working/.test(b.textContent))
  assert.equal(main.disabled, true, `the row is busy while job-2 runs: ${main.textContent}`)
  await ui.press(main, 3)
  assert.equal(server.installs, 2, 'no press reaches the door while a job is in flight')
  held.resolve(view('job-2', { state: 'failed', reason: 'boom' }))
  await ui.settle()
})

test('1: the door saying a job is already running is printed, and nothing is followed', async () => {
  const server = demoServer(deployedOf({ reason: 'x' }))
  globalThis.fetch = (
    (inner) =>
    async (input, init = {}) => {
      if (String(input).startsWith('/api/ops/demos/install'))
        return json(409, { error: 'DEMO_BUSY', reason: 'A job is already running for this demo.' })
      return inner(input, init)
    }
  )(globalThis.fetch)
  const ui = await mountOf(lib.ReleaseDemo, { tag: TAG, releaseVersion: '1.0.3' })
  await ui.press(() => buttonNamed(ui, /Retry install/))
  await ui.press(() => buttonNamed(ui, /Install over/))
  assert.ok(
    ui.errors().some((t) => /already running/.test(t)),
    JSON.stringify(ui.errors())
  )
  assert.ok(!ui.errors().some((t) => /may or may not/.test(t)), 'a refusal by name is certain')
  assert.equal(server.sent.filter((s) => s.startsWith('GET /api/ops/demos/job')).length, 0)
})

// ── 2. The broken copy in the way ────────────────────────────────────────────────────────────────

test('2: the stale-copy refusal has a guide, short and with no dashes', () => {
  const guide = lib.failedInstallGuide(STALE, 'provision')
  assert.equal(guide.whatToDo, 'An old broken copy is in the way. Press Remove, then Install demo.')
  assert.doesNotMatch(guide.whatToDo, /[—–-]/)
})

test('2: a demo that failed on the old copy offers Remove on the card; two presses send one DELETE', async () => {
  const server = demoServer(deployedOf())
  const ui = await mountOf(lib.ReleaseDemo, { tag: TAG, releaseVersion: '1.0.3' })
  assert.match(ui.host.querySelector('[data-demo-failed-guide]').textContent, /Press Remove/)
  const remove = () => buttonNamed(ui, /Remove/)
  assert.ok(remove(), 'Remove is on the card')
  server.polls['job-rm'] = [deferred().promise]
  await ui.press(remove)
  assert.equal(server.removes, 0, 'the first press only asks')
  assert.match(remove().textContent, /Remove for good\?/)
  await ui.press(remove)
  assert.equal(server.removes, 1)
  await ui.settle()
  assert.match(ui.host.textContent, /Removing/)
})

test('2: any other failure keeps the card to Retry install alone', async () => {
  demoServer(deployedOf({ reason: 'PHP Fatal error: x' }))
  const ui = await mountOf(lib.ReleaseDemo, { tag: TAG, releaseVersion: '1.0.3' })
  assert.equal(buttonNamed(ui, /Remove/), null)
})

// ── 3 and 4. The Demos row during and after a removal ───────────────────────────────────────────

async function mountDemosScreen(server) {
  const ui = await mountOf(lib.Demos, { cms: 'all' })
  for (let i = 0; i < 10 && ui.host.querySelector('tbody tr') === null; i += 1) await ui.settle()
  const deployedCell = () => [...ui.host.querySelector('tbody tr').children][4].textContent
  return { ...ui, server, deployedCell }
}

test('3, 4: a removal reads "Removing…" while it runs, then "Not installed" once it is done', async () => {
  const server = demoServer(deployedOf({ state: 'done', reason: undefined, live: true }))
  const held = deferred()
  server.polls['job-rm'] = [view('job-rm', { kind: 'remove', step: 'teardown' }), held.promise]
  const ui = await mountDemosScreen(server)
  await ui.press(() => buttonNamed(ui, /^Remove$/))
  await ui.press(() => buttonNamed(ui, /Remove for good/))
  assert.equal(server.removes, 1)
  await ui.settle()
  assert.match(ui.deployedCell(), /Removing…/)
  assert.doesNotMatch(ui.deployedCell(), /Installing/)

  // Done: the row is forgotten on the server.
  server.deployed = null
  await lib.act(async () => {
    held.resolve(view('job-rm', { kind: 'remove', state: 'done', step: 'gone', removed: true }))
    await tick(3100)
  })
  await ui.settle()
  await ui.settle()
  assert.equal(ui.deployedCell(), 'Not installed')
  assert.match(ui.host.textContent, /Install demo/)
})

test('4: a removal whose job the server no longer knows still settles to "Not installed"', async () => {
  // The sweep finished the removal first: the job door answers 404 for a row that is gone.
  const server = demoServer(deployedOf({ state: 'done', reason: undefined, live: true }))
  server.polls['job-rm'] = [view('job-rm', { kind: 'remove', step: 'teardown' }), undefined]
  const ui = await mountDemosScreen(server)
  await ui.press(() => buttonNamed(ui, /^Remove$/))
  await ui.press(() => buttonNamed(ui, /Remove for good/))
  server.polls['job-rm'] = []
  server.deployed = null
  await lib.act(async () => {
    await tick(3100)
  })
  await ui.settle()
  await ui.settle()
  assert.equal(ui.deployedCell(), 'Not installed')
})

test('3: a screen opened mid-removal reads it as a removal', async () => {
  const server = demoServer(
    deployedOf({ jobId: 'job-rm', kind: 'remove', state: 'running', step: 'teardown' })
  )
  server.polls['job-rm'] = [deferred().promise]
  const ui = await mountDemosScreen(server)
  assert.match(ui.deployedCell(), /Removing…/)
})

// ── 5. The Listing lock follows the demo ─────────────────────────────────────────────────────────

const sheet = (over = {}) => ({
  tag: TAG,
  writable: true,
  refusal: null,
  label: 'JA Restaurant',
  version: '1.0.3',
  languages: ['en'],
  platform: 'joomla',
  template: 'ja_restaurant',
  demo: null,
  platforms: [],
  card: null,
  published: false,
  shots: [],
  categories: ['Business'],
  reason: null,
  ...over
})

/** The Templates page's Design Inspiration tab, with `server.sheet` as what the sheet door answers. */
async function mountListing(props = {}, generate) {
  const server = { sheet: sheet(), reads: 0, generates: 0 }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://harness.test')
    if (url.pathname === '/api/ops/quickstart/inspiration' && (init.method ?? 'GET') === 'GET') {
      server.reads += 1
      return json(200, server.sheet)
    }
    if (url.pathname.endsWith('/generate')) {
      server.generates += 1
      return generate ? generate() : json(404, {})
    }
    return json(404, {})
  }
  const ui = await mountOf(lib.DesignInspirationPanel, {
    tag: TAG,
    cell: null,
    writable: true,
    onChanged: () => {},
    cardOnly: true,
    ...props
  })
  for (let i = 0; i < 10 && ui.host.querySelector('[data-card-actions]') === null; i += 1) await ui.settle()
  const create = () => buttonNamed(ui, /Create listing/)
  const locked = () => ui.host.querySelector('[data-card-locked]') !== null
  return { ...ui, server, create, locked }
}

test('5: once the demo is live, the next page read unlocks the Listing card without F5', async () => {
  const ui = await mountListing({ readKey: 0 })
  assert.equal(ui.locked(), true)
  assert.equal(ui.create().disabled, true)

  // The demo job settles, the page reads its list again (a new read generation).
  ui.server.sheet = sheet({ demo: { url: `https://${LABEL}.tracy.test/`, version: '1.0.3' } })
  await ui.render({ readKey: 1 })
  await ui.settle()
  await ui.settle()
  assert.equal(ui.locked(), false, 'the lock reads the demo again with the page')
  assert.equal(ui.create().disabled, false)
})

test('5: the lock follows the road the page drew, the same answer the Road to live shows', async () => {
  const ui = await mountListing({ demoLive: false })
  assert.equal(ui.locked(), true)
  await ui.render({ demoLive: true })
  await ui.settle()
  assert.equal(ui.locked(), false)
  assert.equal(ui.create().disabled, false)
  await ui.render({ demoLive: false })
  await ui.settle()
  assert.equal(ui.locked(), true)
})

// ── 6. Create listing on a demo that could not be read ──────────────────────────────────────────

const liveSheet = () => sheet({ demo: { url: `https://${LABEL}.tracy.test/`, version: '1.0.3' } })

test('6: a gateway page instead of an answer is said in words, never "the door answered 502"', async () => {
  const ui = await mountListing(
    {},
    () =>
      new Response('<html>origin_bad_gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' }
      })
  )
  ui.server.sheet = liveSheet()
  await ui.render({ readKey: 1 })
  await ui.settle()
  await ui.press(ui.create)
  const said = ui.host.textContent
  assert.match(
    said,
    /Couldn’t read the demo to fill the form \(server error 502\)\. Fill it by hand or try again\./
  )
  assert.doesNotMatch(said, /door answered/)
})

test('6: the door’s own reason is printed as it is', async () => {
  const ui = await mountListing({}, () =>
    json(424, {
      error: 'OUTLINE_FAILED',
      reason: 'Couldn’t read the demo: its server did not answer in time.'
    })
  )
  ui.server.sheet = liveSheet()
  await ui.render({ readKey: 1 })
  await ui.settle()
  await ui.press(ui.create)
  assert.match(ui.host.textContent, /its server did not answer in time/)
})

// ── 7. Opening a template: the page's re-read lands before the sheet's first read ──────────────

test('7: a page re-read that answers before the first sheet read still draws the sheet, not "Reading…"', async () => {
  // Measured on dev 12/10/2026 (ja-prodex): opening a template reads the sheet, and the page's own
  // list re-read bumps `readKey` at once, so a second read (keep the card) starts and the first one
  // is dropped as stale. The second one kept a card that was never read: "Reading…" stayed 20 s+,
  // until a tab switch mounted the sheet again (then it drew in about 1 s).
  const first = deferred()
  let reads = 0
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://harness.test')
    if (url.pathname === '/api/ops/quickstart/inspiration' && (init.method ?? 'GET') === 'GET') {
      reads += 1
      if (reads === 1) await first.promise
      return json(200, sheet())
    }
    return json(404, {})
  }
  const ui = await mountOf(lib.DesignInspirationPanel, {
    tag: TAG,
    cell: null,
    writable: true,
    onChanged: () => {},
    cardOnly: true,
    readKey: 0
  })
  await ui.render({ readKey: 1 })
  await ui.settle()
  first.resolve()
  await ui.settle()
  await ui.settle()
  assert.equal(reads, 2)
  assert.doesNotMatch(ui.host.textContent, /Reading…/)
  assert.ok(ui.host.querySelector('[data-card-actions]'), 'the Listing form is drawn')
})
