/**
 * QS Inventory: an instance held for review can be approved from the screen (#795, F-S8-007).
 *
 * "Hold for review" parks every build of a pool in `awaiting_review`. The door that releases one
 * (`POST /api/ops/inventory/approve`) has existed all along; the screen had no control that called
 * it, so a held pool could only be emptied, never released.
 *
 * These tests mount the real `Inventory` and press it: the review shows the generation and what
 * was read back from the instance, the request carries exactly that instance and those hashes,
 * and only the door's own `released: true` is drawn as done. A refusal, a dropped request, an
 * answer that does not confirm, a second press, a review that was closed or replaced while the
 * answer was on its way, and a re-read that fails afterwards are each pressed too. So is the
 * state behind the screen (`inventory-read-state`): the two doors are drawn together or not at
 * all, in one order, and a "could not be read again" mark is cleared only by a read that carried
 * the same thing — pressed here with two pools, answers held back and answers of the wrong shape.
 * An answer counts as read only when every field of every row is what the door declares ([P]).
 *
 * The screen is bundled in memory by esbuild and mounted with react-dom into jsdom (resolved from
 * a workspace member that declares it); `fetch` is a fixture. What is proven is the screen's own
 * behaviour: no tracy-web, no database, no same-origin guard and no seat check is involved, and no
 * real browser draws anything.
 *
 *   node --test packages/web/tracy-harness/test/inventory-approval.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
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

/** jsdom, from a workspace member that declares it. A tree without it fails here, by name. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(repoRoot, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error(`jsdom is not installed under ${homes.join(' or ')}; run pnpm install`)
}

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
  'navigator',
  'fetch',
  'ResizeObserver',
  'MutationObserver',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
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
  // A tree from before the read state was one module still bundles: `lib.reads` is then missing,
  // and the tests that need it say so as an assertion instead of failing to build.
  const readState = existsSync(path.join(pkgRoot, 'src', 'cms', 'inventory-read-state.ts'))
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { Inventory } from './Inventory'
        export * as api from './inventory-api'
        ${readState ? "export * as reads from './inventory-read-state'" : ''}`,
      resolveDir: path.join(pkgRoot, 'src', 'cms'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    // React stays outside the bundle and is loaded by Node itself: bundled, its `act` cannot find
    // `module.require` and falls back to a MessageChannel that keeps the test process alive.
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  // Which source files went into the bundle, for whoever needs to prove what tree was pressed.
  if (process.env.INVENTORY_TEST_MANIFEST)
    writeFileSync(
      process.env.INVENTORY_TEST_MANIFEST,
      `${JSON.stringify(
        Object.keys(built.metafile.inputs)
          .filter((input) => input !== '<stdin>' && !input.includes('node_modules'))
          .map((input) => path.resolve(pkgRoot, input))
          .sort(),
        null,
        2
      )}\n`
    )

  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://harness.test/cms/inventory'
  })
  const { window } = dom
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', window)
  for (const name of [
    'document',
    'navigator',
    'MutationObserver',
    'HTMLElement',
    'Element',
    'Node',
    'Event',
    'MouseEvent',
    'KeyboardEvent'
  ])
    set(name, window[name])
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  set('ResizeObserver', ResizeObserver)
  window.ResizeObserver ??= ResizeObserver
  set('getComputedStyle', window.getComputedStyle.bind(window))
  set('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0))
  set('cancelAnimationFrame', (id) => clearTimeout(id))
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

after(() => {
  dom?.window.close()
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────

const POOL_KEY = 'dev:h1:wordpress:tracy-base/wp7:1.1.0:9f3c1a7be2d44c05'
const GENERATION = '9f3c1a7be2d44c05a1b2c3d4e5f60718'
const HASHES = { platform: 'wordpress', platformVersion: '7.0', cowork: '0.17.3', contractDeclared: null }
const DOOR = '/api/ops/inventory/approve'
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
/** A second pool, with one instance of its own. */
const POOL_B = 'dev:h1:wordpress:pool-b/wp7:2.0.0:5a5a5a5a5a5a5a5a'
const GENERATION_B = '5a5a5a5a5a5a5a5a0f1e2d3c4b5a6978'
const ID_C = '33333333-3333-4333-8333-333333333333'

const poolRow = (supply = {}) => ({
  poolKey: POOL_KEY,
  environment: 'dev',
  host: 'h1',
  platform: 'wordpress',
  quickstartTag: 'tracy-base/wp7',
  quickstartVersion: '1.1.0',
  generation: GENERATION,
  policy: {
    enabled: true,
    lowWatermark: 1,
    targetReady: 2,
    maxStock: 4,
    maxConcurrentPrepares: 1,
    reviewHold: true,
    maxAttempts: 3,
    healthTtlSeconds: 86400,
    paused: false,
    pausedReason: null
  },
  revision: 1,
  supply: {
    ready: 0,
    preparing: 0,
    awaitingReview: 1,
    reserved: 0,
    assigned: 0,
    quarantined: 0,
    draining: 0,
    stock: 1,
    handedOver: 0,
    ...supply
  }
})

const instance = (id, over = {}) => ({
  id,
  poolKey: POOL_KEY,
  siteKey: `stock-${id.slice(0, 4)}.tracy.test`,
  label: `stock-${id.slice(0, 4)}`,
  url: `http://stock-${id.slice(0, 4)}.tracy.test`,
  host: 'h1',
  generation: GENERATION,
  state: 'awaiting_review',
  jobId: null,
  attempts: 0,
  nextAttemptAt: null,
  healthOk: true,
  healthCheckedAt: new Date().toISOString(),
  healthDetail: null,
  hashes: { ...HASHES },
  reserved: false,
  reservedAt: null,
  lastError: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over
})

/**
 * A `fetch` that answers the Inventory's doors from `state` and records every call.
 * `state.instances(poolKey)` answers the instances door for the pool the request named.
 * `state.approve(call)` answers the approve door: a Response, a `[status, body]` pair or a promise
 * of either; a rejection is a request that never completed.
 */
function fixtureOf(state) {
  const calls = []
  const answer = async (said) => {
    const got = await said
    return got instanceof Response ? got : json(got[0], got[1])
  }
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      body: init.body === undefined ? undefined : JSON.parse(init.body)
    }
    calls.push(call)
    const { pathname } = new URL(call.url, 'http://harness.test')
    if (pathname === DOOR) return answer(state.approve(call))
    if (pathname === '/api/ops/inventory/instances')
      return answer(state.instances(new URL(call.url, 'http://harness.test').searchParams.get('pool'), call))
    if (pathname === '/api/ops/inventory/eligible')
      return state.eligible ? answer(state.eligible()) : json(200, { recorded: 0, quickstarts: [] })
    if (pathname === '/api/ops/inventory/retire' && state.retire) return answer(state.retire(call))
    if (pathname === '/api/ops/inventory') return answer(state.pools())
    return json(404, { code: 'NOT_FOUND' })
  }
  return {
    calls,
    posts: () => calls.filter((call) => call.method === 'POST'),
    reads: (pathname) =>
      calls.filter(
        (call) => call.method === 'GET' && new URL(call.url, 'http://harness.test').pathname === pathname
      ).length
  }
}

/**
 * Mount the Inventory with one pool open and its instances listed. `state.rows` holds the rows of
 * every pool; the instances door answers a pool with the rows that are its own.
 */
async function mountInventory(rows, approve = () => [200, { released: true }], over = {}) {
  const state = {
    rows,
    pools: () => [200, { pools: [poolRow()] }],
    instances: (poolKey) => [200, { instances: state.rows.filter((row) => row.poolKey === poolKey) }],
    approve,
    ...over
  }
  const net = fixtureOf(state)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = lib.createRoot(host)
  const settle = () => lib.act(async () => tick(5))
  let mounted = true
  const unmount = async () => {
    if (!mounted) return
    mounted = false
    await lib.act(async () => root.unmount())
    host.remove()
  }
  cleanups.push(unmount)
  await lib.act(async () => root.render(lib.createElement(lib.Inventory, { cms: 'wordpress' })))
  await settle()
  const press = async (target, times = 1) => {
    await lib.act(async () => {
      for (let i = 0; i < times; i += 1) {
        const el = typeof target === 'function' ? target() : target
        if (el) el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      }
      await tick(5)
    })
    await settle()
  }
  const header = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('tracy-base/wp7'))
  assert.ok(header, 'the pool is listed')
  await press(header)
  const ui = {
    state,
    net,
    host,
    settle,
    press,
    unmount,
    text: () => host.textContent,
    approveButton: (id) => host.querySelector(`[data-approve="${id}"]`),
    review: () => document.querySelector('[data-review]'),
    confirm: () => document.querySelector('[data-review-confirm]'),
    reviewError: () => document.querySelector('[data-review-error]')?.textContent ?? null,
    notice: () => host.querySelector('[role="status"]')?.textContent ?? null,
    unconfirmed: () => host.querySelector('[data-unconfirmed]'),
    /** The sentence about the whole list, when the counts on screen are not confirmed. */
    listMark: () => host.querySelector('[data-unconfirmed-list]'),
    /** The pool keys named as not read again, in the order they were marked; null when none. */
    poolMark: () =>
      host.querySelector('[data-unconfirmed-pools]')?.getAttribute('data-unconfirmed-pools') ?? null,
    moved: () => document.querySelector('[data-review-moved]'),
    reviewUnread: () => document.querySelector('[data-review-unread]'),
    headerOf: (tag) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(tag)),
    unread: () => host.querySelector('[data-unread]'),
    header,
    refresh: () => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Refresh'),
    /** Open the review of one instance; fails as an assertion when the screen offers no Approve. */
    open: async (id) => {
      const button = ui.approveButton(id)
      assert.ok(button, `the row of ${id} offers Approve`)
      assert.equal(button.disabled, false, `Approve of ${id} can be pressed`)
      await press(button)
      assert.ok(ui.review(), 'pressing Approve opens the review')
    },
    /** Close the open review the way a person does: the "Not yet" button. */
    cancel: async () => {
      const no = [...(ui.review()?.querySelectorAll('button') ?? [])].find((b) =>
        b.textContent.includes('Not yet')
      )
      assert.ok(no, 'the review can be left without approving')
      await press(no)
    }
  }
  return ui
}

// ── the call ─────────────────────────────────────────────────────────────────────────────────────

test('F-S8-007: the client has an approve call, and it posts the instance and the hashes it was given', async () => {
  assert.equal(typeof lib.api.approveInstance, 'function', 'inventory-api exports approveInstance')
  const net = fixtureOf({ approve: () => [200, { released: true, alreadyApproved: false }] })
  const hashes = { b: 'two', a: null, nested: { z: 1 } }
  const answer = await lib.api.approveInstance(ID_A, hashes)
  assert.deepEqual(answer, { released: true, alreadyApproved: false })
  assert.equal(net.calls.length, 1)
  assert.equal(net.calls[0].url, DOOR)
  assert.equal(net.calls[0].method, 'POST')
  assert.equal(net.calls[0].headers['content-type'], 'application/json')
  assert.deepEqual(net.calls[0].body, { instanceId: ID_A, expectedHashes: hashes })
  assert.deepEqual(Object.keys(net.calls[0].body).sort(), ['expectedHashes', 'instanceId'])
})

test('F-S8-007: only an instance waiting for review, held by nobody, with read-back hashes can be approved', () => {
  assert.equal(typeof lib.api.reviewable, 'function', 'inventory-api exports reviewable')
  assert.equal(lib.api.reviewable(instance(ID_A)), true)
  const no = {
    'no row': null,
    'not awaiting review': instance(ID_A, { state: 'ready' }),
    quarantined: instance(ID_A, { state: 'quarantined' }),
    reserved: instance(ID_A, { reserved: true }),
    'reserved unknown': instance(ID_A, { reserved: undefined }),
    'no id': instance(ID_A, { id: '' }),
    'id not text': instance(ID_A, { id: 7 }),
    'no generation': instance(ID_A, { generation: '' }),
    'generation missing': instance(ID_A, { generation: undefined }),
    'hashes missing': instance(ID_A, { hashes: undefined }),
    'hashes null': instance(ID_A, { hashes: null }),
    'hashes empty': instance(ID_A, { hashes: {} }),
    'hashes a list': instance(ID_A, { hashes: ['wordpress'] }),
    'hashes text': instance(ID_A, { hashes: 'abc' }),
    'hashes a number': instance(ID_A, { hashes: 3 })
  }
  for (const [name, row] of Object.entries(no)) assert.equal(lib.api.reviewable(row), false, name)
})

// ── the control ──────────────────────────────────────────────────────────────────────────────────

test('F-S8-007: Approve is offered on a row waiting for review and on no other', async () => {
  const ui = await mountInventory([
    instance(ID_A),
    instance(ID_B, { state: 'ready' }),
    instance('33333333-3333-4333-8333-333333333333', { state: 'preparing' }),
    instance('44444444-4444-4444-8444-444444444444', { state: 'quarantined' })
  ])
  const offered = [...ui.host.querySelectorAll('[data-approve]')].map((b) => b.getAttribute('data-approve'))
  assert.deepEqual(offered, [ID_A])
  assert.match(ui.approveButton(ID_A).textContent, /Approve/)
  assert.equal(ui.approveButton(ID_A).disabled, false)
})

test('F-S8-007: a row that cannot be approved has a disabled Approve, and pressing it sends nothing', async () => {
  const blocked = {
    '55555555-5555-4555-8555-555555555551': { reserved: true },
    '55555555-5555-4555-8555-555555555552': { hashes: {} },
    '55555555-5555-4555-8555-555555555553': { hashes: null },
    '55555555-5555-4555-8555-555555555554': { hashes: ['x'] },
    '55555555-5555-4555-8555-555555555555': { hashes: 'x' },
    '55555555-5555-4555-8555-555555555556': { generation: '' }
  }
  const ui = await mountInventory([
    instance(ID_A),
    ...Object.entries(blocked).map(([id, over]) => instance(id, over))
  ])
  assert.ok(ui.approveButton(ID_A), 'the screen offers Approve at all')
  for (const id of Object.keys(blocked)) {
    const button = ui.approveButton(id)
    assert.ok(button, `${id}: the control is drawn`)
    assert.equal(button.disabled, true, `${id}: and cannot be pressed`)
    await ui.press(button)
    assert.equal(ui.review(), null, `${id}: no review opens`)
  }
  assert.equal(ui.net.posts().length, 0)
})

test('F-S8-007: the first press only shows what is approved — the generation and the hashes read back', async () => {
  const ui = await mountInventory([instance(ID_A)])
  await ui.open(ID_A)
  assert.equal(ui.net.posts().length, 0, 'opening the review sends nothing')
  const review = ui.review()
  assert.equal(review.getAttribute('data-review'), ID_A)
  assert.ok(review.textContent.includes('stock-1111'), 'names the instance')
  assert.equal(review.querySelector('[data-review-generation]').textContent, GENERATION)
  assert.match(review.textContent, /whole generation/, 'says the approval is for the generation')
  const shown = Object.fromEntries(
    [...review.querySelectorAll('[data-review-hash]')].map((row) => [
      row.getAttribute('data-review-hash'),
      row.lastElementChild.textContent
    ])
  )
  assert.deepEqual(shown, {
    platform: 'wordpress',
    platformVersion: '7.0',
    cowork: '0.17.3',
    contractDeclared: 'null'
  })
})

test('F-S8-007: leaving the review approves nothing', async () => {
  const ui = await mountInventory([instance(ID_A)])
  await ui.open(ID_A)
  await ui.cancel()
  assert.equal(ui.review(), null)
  assert.equal(ui.net.posts().length, 0)
  assert.equal(ui.notice(), null)
})

test('F-S8-007: confirming sends one approval for that instance with the hashes shown, and a release is drawn only once re-read', async () => {
  const ui = await mountInventory([instance(ID_A)], () => {
    ui.state.rows = [instance(ID_A, { state: 'ready' })]
    return [200, { released: true, alreadyApproved: false, generation: GENERATION, approval: { id: 1 } }]
  })
  await ui.open(ID_A)
  const before = {
    pools: ui.net.reads('/api/ops/inventory'),
    rows: ui.net.reads('/api/ops/inventory/instances')
  }
  await ui.press(ui.confirm)
  const posts = ui.net.posts()
  assert.equal(posts.length, 1)
  assert.equal(new URL(posts[0].url, 'http://harness.test').pathname, DOOR)
  assert.deepEqual(posts[0].body, { instanceId: ID_A, expectedHashes: HASHES })
  assert.equal(ui.review(), null, 'the review closes on a confirmed release')
  assert.match(ui.notice(), /stock-1111 is released to ready/)
  assert.match(ui.notice(), /generation 9f3c1a7b is approved/)
  assert.equal(ui.net.reads('/api/ops/inventory'), before.pools + 1, 'the pools are read again')
  assert.equal(ui.net.reads('/api/ops/inventory/instances'), before.rows + 1, 'the instances are read again')
  assert.equal(ui.approveButton(ID_A), null, 'the re-read row is ready, so nothing is left to approve')
  assert.equal(ui.unconfirmed(), null)
})

test('F-S8-007: an instance released on an earlier approval of its generation is done too, and says so', async () => {
  const ui = await mountInventory([instance(ID_A)], () => [
    200,
    { released: true, alreadyApproved: true, generation: GENERATION, approval: { id: 1 } }
  ])
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 1)
  assert.equal(ui.review(), null)
  assert.match(ui.notice(), /stock-1111 is released to ready/)
  assert.match(ui.notice(), /already approved/)
})

// ── while it is on its way ───────────────────────────────────────────────────────────────────────

test('F-S8-007: pressing again while the approval is on its way sends nothing more', async () => {
  const gate = deferred()
  const ui = await mountInventory([instance(ID_A)], () => gate.promise)
  await ui.open(ID_A)
  await ui.press(ui.confirm, 3)
  assert.equal(ui.net.posts().length, 1, 'three presses in one tick are one request')
  assert.equal(ui.confirm().disabled, true, 'the button is locked while it runs')
  assert.match(ui.confirm().textContent, /Approving/)
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 1)
  assert.equal(ui.notice(), null, 'nothing is claimed before the door answers')
  await lib.act(async () => {
    gate.resolve([200, { released: true }])
    await tick(5)
  })
  await ui.settle()
  assert.equal(ui.net.posts().length, 1)
  assert.equal(ui.review(), null)
})

test('F-S8-007: a review of the same instance opened again while its approval runs cannot send a second one', async () => {
  const gate = deferred()
  const ui = await mountInventory([instance(ID_A)], () => gate.promise)
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  await ui.cancel()
  await ui.open(ID_A)
  assert.equal(ui.confirm().disabled, true)
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 1)
  await lib.act(async () => {
    gate.resolve([200, { released: true }])
    await tick(5)
  })
  await ui.settle()
  assert.equal(ui.review(), null, 'a confirmed release leaves nothing to review for that instance')
})

// ── refusals and answers that do not confirm ─────────────────────────────────────────────────────

const REFUSALS = [
  ['401 with no body', () => new Response('', { status: 401 }), /refused the request — nothing was approved/],
  ['403 with no body', () => new Response('', { status: 403 }), /refused the request — nothing was approved/],
  ['404 NOT_FOUND', () => [404, { code: 'NOT_FOUND' }], /does not know this instance — nothing was approved/],
  ['400 BAD_INSTANCE_ID', () => [400, { code: 'BAD_INSTANCE_ID' }], /nothing was approved/],
  [
    '409 HASH_MISMATCH',
    () => [409, { code: 'HASH_MISMATCH', hashes: { platform: 'joomla' } }],
    /changed after you opened it — nothing was approved/
  ],
  [
    '409 NOT_AWAITING_REVIEW',
    () => [409, { code: 'NOT_AWAITING_REVIEW', state: 'quarantined' }],
    /no longer waiting for review \(it is quarantined\) — nothing was approved/
  ],
  [
    '409 NOT_AWAITING_REVIEW, state not text',
    () => [409, { code: 'NOT_AWAITING_REVIEW', state: { a: 1 } }],
    /no longer waiting for review — nothing was approved/
  ],
  ['500 with a body', () => [500, { code: 'INTERNAL' }], /did not confirm the approval/],
  ['500 with no body', () => new Response('', { status: 500 }), /did not confirm the approval/],
  [
    '502 that is not JSON',
    () => new Response('<html>bad gateway</html>', { status: 502 }),
    /did not confirm the approval/
  ],
  [
    'a request that never completed',
    () => Promise.reject(new TypeError('fetch failed')),
    /did not confirm the approval/
  ]
]

test('F-S8-007: a refusal or a dropped request is printed, and nothing is drawn as approved', async () => {
  for (const [name, said, sentence] of REFUSALS) {
    const ui = await mountInventory([instance(ID_A)], said)
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assert.equal(ui.net.posts().length, 1, `${name}: one request, no retry`)
    assert.ok(ui.review(), `${name}: the review stays open`)
    assert.match(ui.reviewError() ?? '', sentence, name)
    assert.match(ui.notice() ?? '', sentence, `${name}: the page says it too, by name`)
    assert.ok(ui.notice().startsWith('stock-1111: '), name)
    assert.doesNotMatch(ui.notice(), /is released to ready/, name)
    assert.doesNotMatch(ui.text(), /is released to ready/, name)
    assert.equal(ui.confirm().disabled, false, `${name}: the press is free again`)
    assert.ok(ui.approveButton(ID_A), `${name}: the row is still waiting for review`)
    await ui.unmount()
  }
})

const UNCONFIRMED = [
  ['an empty body', () => new Response('', { status: 200 })],
  ['broken JSON', () => new Response('{"released":', { status: 200 })],
  ['null', () => [200, 'null']],
  ['a list', () => [200, [{ released: true }]]],
  ['text', () => [200, '"released"']],
  ['an empty object', () => [200, {}]],
  ['no released', () => [200, { alreadyApproved: true, generation: GENERATION }]],
  ['released: "true"', () => [200, { released: 'true' }]],
  ['released: 1', () => [200, { released: 1 }]],
  ['released: null', () => [200, { released: null }]],
  ['released: false', () => [200, { released: false, alreadyApproved: true }]],
  ['released: true beside a code', () => [200, { released: true, code: 'SOMETHING' }]]
]

test('F-S8-007: a 200 that does not say released: true is not a release', async () => {
  for (const [name, said] of UNCONFIRMED) {
    const ui = await mountInventory([instance(ID_A)], said)
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assert.equal(ui.net.posts().length, 1, `${name}: one request, no retry`)
    assert.ok(ui.review(), `${name}: the review stays open`)
    assert.ok(ui.reviewError(), `${name}: and says the approval is not confirmed`)
    assert.doesNotMatch(
      ui.reviewError(),
      /nothing was approved/,
      `${name}: without claiming nothing happened`
    )
    assert.doesNotMatch(ui.text(), /is released to ready/, name)
    assert.ok(ui.approveButton(ID_A), `${name}: the row is still drawn as waiting`)
    await ui.unmount()
  }
})

// ── answers that land late ───────────────────────────────────────────────────────────────────────

test('F-S8-007: a review whose instance was read again with other hashes is not sent — not with the old hashes, not with the new', async () => {
  const first = deferred()
  const ui = await mountInventory([instance(ID_A), instance(ID_B)], (call) =>
    call.body.instanceId === ID_B ? first.promise : [200, { released: true }]
  )
  await ui.open(ID_B)
  await ui.press(ui.confirm)
  await ui.cancel()
  await ui.open(ID_A)
  // B's answer lands now, and the re-read after it brings A with other hashes.
  const OTHER = { platform: 'joomla', cowork: '9.9.9' }
  ui.state.rows = [instance(ID_A, { hashes: OTHER }), instance(ID_B, { state: 'ready' })]
  await lib.act(async () => {
    first.resolve([200, { released: true }])
    await tick(5)
  })
  await ui.settle()
  assert.ok(ui.review(), 'the answer for another instance does not close this review')
  assert.equal(ui.review().getAttribute('data-review'), ID_A)
  assert.equal(ui.reviewError(), null)
  assert.match(
    ui.notice(),
    /^stock-2222 is released to ready/,
    'the late answer is reported under its own name'
  )
  const shown = () =>
    [...ui.review().querySelectorAll('[data-review-hash]')].map((row) => row.getAttribute('data-review-hash'))
  assert.deepEqual(shown(), Object.keys(HASHES), 'the review still shows what was opened')
  assert.ok(ui.moved(), 'and says the inventory no longer shows the instance that way')
  assert.equal(ui.confirm().disabled, true)
  await ui.press(ui.confirm, 2)
  const mine = () => ui.net.posts().filter((call) => call.body.instanceId === ID_A)
  assert.equal(mine().length, 0, 'nothing is sent for a build the screen no longer shows')
  // Opened again from the row as it is now, the review shows and sends what was read last.
  await ui.cancel()
  await ui.open(ID_A)
  assert.deepEqual(shown(), Object.keys(OTHER))
  assert.equal(ui.moved(), null)
  ui.state.rows = [instance(ID_A, { state: 'ready' }), instance(ID_B, { state: 'ready' })]
  await ui.press(ui.confirm)
  assert.equal(mine().length, 1)
  assert.deepEqual(mine()[0].body.expectedHashes, OTHER)
})

test('F-S8-007: a refusal that lands after another instance was opened is not printed in that review', async () => {
  const first = deferred()
  const ui = await mountInventory([instance(ID_A), instance(ID_B)], () => first.promise)
  await ui.open(ID_B)
  await ui.press(ui.confirm)
  await ui.cancel()
  await ui.open(ID_A)
  await lib.act(async () => {
    first.resolve([409, { code: 'NOT_AWAITING_REVIEW', state: 'ready' }])
    await tick(5)
  })
  await ui.settle()
  assert.equal(ui.review().getAttribute('data-review'), ID_A)
  assert.equal(ui.reviewError(), null, 'the open review is about another instance')
  assert.equal(ui.confirm().disabled, false)
  assert.match(ui.notice(), /^stock-2222: /)
  assert.equal(ui.net.posts().length, 1, 'and nothing was sent for the instance now on screen')
})

test('F-S8-007: an answer that lands after the review was closed opens nothing and is still reported', async () => {
  const gate = deferred()
  const ui = await mountInventory([instance(ID_A)], () => gate.promise)
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  await ui.cancel()
  await lib.act(async () => {
    gate.resolve([500, { code: 'INTERNAL' }])
    await tick(5)
  })
  await ui.settle()
  assert.equal(ui.review(), null)
  assert.match(ui.notice(), /^stock-1111: .*did not confirm the approval/)
})

test('F-S8-007: an answer that lands after the screen was left reads nothing again', async () => {
  const gate = deferred()
  const ui = await mountInventory([instance(ID_A)], () => gate.promise)
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  const calls = ui.net.calls.length
  await ui.unmount()
  gate.resolve([200, { released: true }])
  await tick(20)
  assert.equal(ui.net.calls.length, calls, 'no re-read is started for a screen that is gone')
})

// ── the re-read afterwards ───────────────────────────────────────────────────────────────────────

const BROKEN_READS = [
  ['the pools door answers 500', { pools: () => [500, { code: 'INTERNAL' }] }],
  ['the pools door answers nothing readable', { pools: () => new Response('', { status: 200 }) }],
  ['the instances door answers 500', { instances: () => [500, { code: 'INTERNAL' }] }],
  ['the instances door answers a wrong shape', { instances: () => [200, { instances: 'none' }] }],
  [
    'both reads are dropped',
    {
      pools: () => Promise.reject(new TypeError('fetch failed')),
      instances: () => Promise.reject(new TypeError('fetch failed'))
    }
  ]
]

test('F-S8-007: when the re-read after an approval fails, the old rows stay, marked as not confirmed, with a reload', async () => {
  for (const [name, broken] of BROKEN_READS) {
    const ui = await mountInventory([instance(ID_A)], () => {
      Object.assign(ui.state, broken)
      return [200, { released: true }]
    })
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assert.match(ui.notice(), /released to ready/, `${name}: the door's own answer is reported`)
    assert.ok(ui.unconfirmed(), `${name}: the screen says its rows are not confirmed`)
    assert.match(ui.unconfirmed().textContent, /not confirmed/)
    assert.doesNotMatch(ui.text(), /Could not read the inventory/, `${name}: the screen is not replaced`)
    assert.doesNotMatch(ui.text(), /Nothing in this pool yet/, `${name}: the pool is not drawn empty`)
    assert.ok(ui.text().includes('stock-1111'), `${name}: the row read before is still there`)
    assert.match(ui.text(), /0 \/ 2 ready/, `${name}: and no ready count was made up`)
    // Reading again, once the doors answer, clears the mark and draws what they say.
    ui.state.pools = () => [200, { pools: [poolRow({ ready: 1, awaitingReview: 0 })] }]
    ui.state.instances = () => [200, { instances: [instance(ID_A, { state: 'ready' })] }]
    const reload = [...ui.unconfirmed().querySelectorAll('button')].find((b) =>
      b.textContent.includes('Reload')
    )
    assert.ok(reload, `${name}: a reload is offered`)
    await ui.press(reload)
    assert.equal(ui.unconfirmed(), null, name)
    assert.match(ui.text(), /1 \/ 2 ready/, name)
    assert.equal(ui.approveButton(ID_A), null, name)
    assert.equal(ui.net.posts().length, 1, `${name}: reloading approves nothing again`)
    await ui.unmount()
  }
})

const READY_POOLS = (ready) => [200, { pools: [poolRow({ ready, awaitingReview: 2 - ready })] }]
const reloadButton = (ui) =>
  [...(ui.unconfirmed()?.querySelectorAll('button') ?? [])].find((b) => b.textContent.includes('Reload'))
/** Let promises resolved by the test reach the screen. */
const land = async (ui, fn) => {
  await lib.act(async () => {
    fn()
    await tick(5)
  })
  await ui.settle()
}

const HALF_READS = [
  [
    'the pools door answers a new count and the instances door fails',
    {
      pools: () => [200, { pools: [poolRow({ ready: 1, awaitingReview: 0 })] }],
      instances: () => [500, { code: 'INTERNAL' }]
    }
  ],
  [
    'the pools door answers a new count and the instances door answers a wrong shape',
    {
      pools: () => [200, { pools: [poolRow({ ready: 1, awaitingReview: 0 })] }],
      instances: () => [200, { instances: null }]
    }
  ],
  [
    'the instances door answers new rows and the pools door fails',
    {
      pools: () => [500, { code: 'INTERNAL' }],
      instances: () => [200, { instances: [instance(ID_A, { state: 'ready' })] }]
    }
  ],
  [
    'the instances door answers new rows and the pools door is dropped',
    {
      pools: () => Promise.reject(new TypeError('fetch failed')),
      instances: () => [200, { instances: [instance(ID_A, { state: 'ready' })] }]
    }
  ]
]

test('F-S8-007: a re-read that got one door and not the other draws neither — no new count beside old rows', async () => {
  for (const [name, half] of HALF_READS) {
    const ui = await mountInventory([instance(ID_A)], () => {
      Object.assign(ui.state, half)
      return [200, { released: true }]
    })
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assert.ok(ui.unconfirmed(), `${name}: the pool is marked as not confirmed`)
    assert.match(ui.text(), /0 \/ 2 ready/, `${name}: the count is the one read with the rows on screen`)
    assert.doesNotMatch(ui.text(), /1 \/ 2 ready/, name)
    assert.ok(ui.approveButton(ID_A), `${name}: the row is the one read with that count`)
    assert.match(ui.unconfirmed().textContent, /tracy-base\/wp7 9f3c1a7b/, `${name}: and named`)
    // The door said released; the row could not be read. It is not offered for approval again.
    assert.equal(ui.approveButton(ID_A).disabled, true, name)
    await ui.press(() => ui.approveButton(ID_A))
    assert.equal(ui.review(), null, name)
    ui.state.pools = () => [200, { pools: [poolRow({ ready: 1, awaitingReview: 0 })] }]
    ui.state.instances = () => [200, { instances: [instance(ID_A, { state: 'ready' })] }]
    await ui.press(reloadButton(ui))
    assert.equal(ui.unconfirmed(), null, name)
    assert.match(ui.text(), /1 \/ 2 ready/, name)
    assert.equal(ui.approveButton(ID_A), null, name)
    assert.equal(ui.net.posts().length, 1, name)
    await ui.unmount()
  }
})

/**
 * Two approvals in one pool, the first one's re-read held back until the second one's has landed.
 * `first` answers the held re-read; `second` is what the later re-read answers at once.
 */
async function twoRereads(second) {
  const held = { pools: deferred(), instances: deferred() }
  const ui = await mountInventory([instance(ID_A), instance(ID_B)], () => [200, { released: true }])
  ui.state.pools = () => held.pools.promise
  ui.state.instances = () => held.instances.promise
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 1)
  ui.state.pools = second.pools
  ui.state.instances = second.instances
  await ui.open(ID_B)
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 2)
  return { ui, held }
}
const BOTH_READY = {
  pools: () => READY_POOLS(2),
  instances: () => [
    200,
    { instances: [instance(ID_A, { state: 'ready' }), instance(ID_B, { state: 'ready' })] }
  ]
}
const FAILING = { pools: () => [500, { code: 'INTERNAL' }], instances: () => [500, { code: 'INTERNAL' }] }

test('F-S8-007: an older re-read that lands after a later one failed does not clear the mark', async () => {
  const { ui, held } = await twoRereads(FAILING)
  assert.ok(ui.unconfirmed(), 'the later re-read failed: the pool is not confirmed')
  // The older read was started before the second approval was answered: it cannot confirm it.
  await land(ui, () => {
    held.pools.resolve(READY_POOLS(1))
    held.instances.resolve([200, { instances: [instance(ID_A, { state: 'ready' }), instance(ID_B)] }])
  })
  assert.ok(ui.unconfirmed(), 'the mark of the latest re-read stays')
  assert.equal(ui.approveButton(ID_A), null, 'the first instance was read again after its answer')
  assert.ok(ui.approveButton(ID_B), 'the second one is drawn as that older read saw it')
  assert.equal(
    ui.approveButton(ID_B).disabled,
    true,
    'and is not offered again: no read is later than its answer'
  )
  Object.assign(ui.state, BOTH_READY)
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
  assert.match(ui.text(), /2 \/ 2 ready/)
  assert.equal(ui.net.posts().length, 2)
})

test('F-S8-007: an older re-read that fails after a later one was drawn marks nothing', async () => {
  const { ui, held } = await twoRereads(BOTH_READY)
  assert.equal(ui.unconfirmed(), null)
  assert.match(ui.text(), /2 \/ 2 ready/)
  await land(ui, () => {
    held.pools.resolve([500, { code: 'INTERNAL' }])
    held.instances.reject(new TypeError('fetch failed'))
  })
  assert.equal(ui.unconfirmed(), null, 'the later read is on screen and was read whole')
  assert.match(ui.text(), /2 \/ 2 ready/)
  assert.equal(ui.host.querySelector('[data-approve]'), null)
})

test('F-S8-007: an older re-read that lands after a later one does not draw over it', async () => {
  const { ui, held } = await twoRereads(BOTH_READY)
  await land(ui, () => {
    held.pools.resolve(READY_POOLS(1))
    held.instances.resolve([200, { instances: [instance(ID_A, { state: 'ready' }), instance(ID_B)] }])
  })
  assert.match(ui.text(), /2 \/ 2 ready/, 'the count of the later read stays')
  assert.doesNotMatch(ui.text(), /1 \/ 2 ready/)
  assert.equal(ui.host.querySelector('[data-approve]'), null, 'and so do its rows')
  assert.equal(ui.unconfirmed(), null)
})

// ── between the answer and the re-read ───────────────────────────────────────────────────────────

test('F-S8-007: a released instance cannot be approved again while its row is still being read', async () => {
  const held = { pools: deferred(), instances: deferred() }
  const ui = await mountInventory([instance(ID_A)], () => {
    ui.state.pools = () => held.pools.promise
    ui.state.instances = () => held.instances.promise
    return [200, { released: true }]
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.match(ui.notice(), /released to ready/)
  assert.equal(ui.review(), null)
  // The row on screen is the one from before the approval: still waiting for review.
  const button = ui.approveButton(ID_A)
  assert.ok(button, 'the old row is still drawn')
  assert.equal(button.disabled, true, 'and cannot be opened for a second approval')
  await ui.press(button, 2)
  assert.equal(ui.review(), null)
  assert.equal(ui.net.posts().length, 1)
  await land(ui, () => {
    held.pools.resolve([200, { pools: [poolRow({ ready: 1, awaitingReview: 0 })] }])
    held.instances.resolve([200, { instances: [instance(ID_A, { state: 'ready' })] }])
  })
  assert.equal(ui.approveButton(ID_A), null)
  assert.equal(ui.unconfirmed(), null)
  assert.equal(ui.net.posts().length, 1)
})

test('F-S8-007: after an answer that did not confirm, the same review sends nothing until the row is read again', async () => {
  const held = { pools: deferred(), instances: deferred() }
  let answers = 0
  const ui = await mountInventory([instance(ID_A)], () => {
    answers += 1
    if (answers > 1) return [200, { released: true }]
    ui.state.pools = () => held.pools.promise
    ui.state.instances = () => held.instances.promise
    return [500, { code: 'INTERNAL' }]
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.match(ui.reviewError(), /did not confirm the approval/)
  assert.equal(ui.confirm().disabled, true, 'locked while the row is read again')
  assert.doesNotMatch(ui.confirm().textContent, /Approving/, 'and not drawn as a request on its way')
  assert.equal(ui.approveButton(ID_A).disabled, true)
  await ui.press(ui.confirm, 2)
  assert.equal(ui.net.posts().length, 1)
  // The re-read shows it still waiting: it can be approved again, by a new press.
  ui.state.pools = () => [200, { pools: [poolRow()] }]
  ui.state.instances = () => [200, { instances: ui.state.rows }]
  await land(ui, () => {
    held.pools.resolve([200, { pools: [poolRow()] }])
    held.instances.resolve([200, { instances: [instance(ID_A)] }])
  })
  assert.equal(ui.unconfirmed(), null)
  assert.equal(ui.confirm().disabled, false)
  assert.equal(ui.approveButton(ID_A).disabled, false)
  ui.state.rows = [instance(ID_A, { state: 'ready' })]
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 2)
  assert.equal(ui.approveButton(ID_A), null)
})

test('F-S8-007: [R3] after an answer that did not confirm and a re-read that failed, nothing is sent again until a read shows the row', async () => {
  let answers = 0
  const ui = await mountInventory([instance(ID_A)], () => {
    answers += 1
    if (answers > 1) {
      ui.state.pools = () => [200, { pools: [poolRow({ ready: 1, awaitingReview: 0 })] }]
      ui.state.rows = [instance(ID_A, { state: 'ready' })]
      return [200, { released: true, alreadyApproved: true }]
    }
    Object.assign(ui.state, FAILING)
    return new Response('', { status: 502 })
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.match(ui.reviewError(), /did not confirm the approval/)
  assert.ok(ui.unconfirmed(), 'the failed re-read is said')
  // The request is over and the re-read failed: neither says where the instance stands.
  assert.equal(ui.confirm().disabled, true, 'a re-read that failed frees nothing')
  assert.doesNotMatch(ui.confirm().textContent, /Approving/)
  assert.ok(ui.reviewUnread(), 'and the review says why it is locked')
  assert.equal(ui.moved(), null)
  await ui.press(ui.confirm, 3)
  assert.equal(ui.net.posts().length, 1, 'three presses send nothing')
  assert.equal(ui.approveButton(ID_A).disabled, true, 'the row is held too')
  // Another read that fails changes nothing.
  await ui.press(ui.refresh())
  assert.equal(ui.confirm().disabled, true)
  await ui.press(ui.confirm, 2)
  assert.equal(ui.net.posts().length, 1)
  // A read that carries the pool shows the row as it was opened: the review is free again.
  ui.state.pools = () => [200, { pools: [poolRow()] }]
  ui.state.instances = (poolKey) => [200, { instances: ui.state.rows.filter((r) => r.poolKey === poolKey) }]
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
  assert.equal(ui.reviewUnread(), null)
  assert.equal(ui.confirm().disabled, false)
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 2)
  assert.match(ui.notice(), /already approved/)
  assert.equal(ui.unconfirmed(), null, 'the re-read after the second answer was whole')
  assert.equal(ui.approveButton(ID_A), null)
})

test('F-S8-007: [R3] after a re-read that failed, a Reload that shows the instance changed leaves the old review locked', async () => {
  for (const [name, said, after] of MOVED) {
    const ui = await mountInventory([instance(ID_A)], () => {
      Object.assign(ui.state, FAILING)
      return said()
    })
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assert.ok(ui.reviewUnread(), `${name}: the review says the instance could not be read again`)
    assert.equal(ui.confirm().disabled, true, name)
    ui.state.pools = () => [200, { pools: [poolRow()] }]
    ui.state.instances = () => [200, { instances: after() }]
    await ui.press(reloadButton(ui))
    assert.equal(ui.unconfirmed(), null, name)
    assert.equal(ui.reviewUnread(), null, name)
    assert.ok(ui.moved(), `${name}: read again, the row is not the build this review shows`)
    assert.equal(ui.confirm().disabled, true, name)
    await ui.press(ui.confirm, 3)
    assert.equal(ui.net.posts().length, 1, `${name}: the old review is not sent again`)
    await ui.unmount()
  }
})

// ── a review and the row it was opened on ────────────────────────────────────────────────────────

test('F-S8-007: a review is the same build only while the row is approvable with that generation and those hashes', () => {
  assert.equal(typeof lib.api.sameReview, 'function', 'inventory-api exports sameReview')
  const opened = instance(ID_A, { hashes: { a: 1, nested: { x: [1, { y: null }], z: 'q' } } })
  const same = {
    'the same row': opened,
    'a copy': instance(ID_A, { hashes: { a: 1, nested: { x: [1, { y: null }], z: 'q' } } }),
    'keys in another order': instance(ID_A, { hashes: { nested: { z: 'q', x: [1, { y: null }] }, a: 1 } }),
    'only its times changed': { ...opened, updatedAt: 'later', healthCheckedAt: 'later' }
  }
  for (const [name, now] of Object.entries(same)) assert.equal(lib.api.sameReview(now, opened), true, name)
  const other = {
    'no row': undefined,
    'null row': null,
    'another instance': instance(ID_B, { hashes: opened.hashes }),
    'another pool': { ...opened, poolKey: POOL_B },
    ready: { ...opened, state: 'ready' },
    quarantined: { ...opened, state: 'quarantined' },
    reserved: { ...opened, reserved: true },
    'another generation': { ...opened, generation: 'ffff' },
    'hashes gone': { ...opened, hashes: null },
    'hashes empty': { ...opened, hashes: {} },
    'a value changed': instance(ID_A, { hashes: { a: 2, nested: { x: [1, { y: null }], z: 'q' } } }),
    'a nested value changed': instance(ID_A, { hashes: { a: 1, nested: { x: [1, { y: 0 }], z: 'q' } } }),
    'a list reordered': instance(ID_A, { hashes: { a: 1, nested: { x: [{ y: null }, 1], z: 'q' } } }),
    'a list shorter': instance(ID_A, { hashes: { a: 1, nested: { x: [1], z: 'q' } } }),
    'a key added': instance(ID_A, { hashes: { a: 1, b: 1, nested: { x: [1, { y: null }], z: 'q' } } }),
    'a key dropped': instance(ID_A, { hashes: { nested: { x: [1, { y: null }], z: 'q' } } }),
    'a key renamed': instance(ID_A, { hashes: { b: 1, nested: { x: [1, { y: null }], z: 'q' } } }),
    'null for an object': instance(ID_A, { hashes: { a: 1, nested: null } }),
    'a list for an object': instance(ID_A, { hashes: { a: 1, nested: [] } }),
    'text for a number': instance(ID_A, { hashes: { a: '1', nested: { x: [1, { y: null }], z: 'q' } } })
  }
  for (const [name, now] of Object.entries(other)) assert.equal(lib.api.sameReview(now, opened), false, name)
  assert.equal(
    lib.api.sameReview(opened, { ...opened, state: 'ready' }),
    false,
    'a review not approvable itself'
  )
})

const MOVED = [
  [
    'HASH_MISMATCH, and the re-read brings other hashes',
    () => [409, { code: 'HASH_MISMATCH' }],
    () => [instance(ID_A, { hashes: { platform: 'joomla' } })]
  ],
  [
    'HASH_MISMATCH, and the re-read brings another generation',
    () => [409, { code: 'HASH_MISMATCH' }],
    () => [instance(ID_A, { generation: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })]
  ],
  [
    'NOT_AWAITING_REVIEW, and the re-read shows it quarantined',
    () => [409, { code: 'NOT_AWAITING_REVIEW', state: 'quarantined' }],
    () => [instance(ID_A, { state: 'quarantined' })]
  ],
  [
    'an answer that did not confirm, and the re-read shows it ready',
    () => new Response('', { status: 502 }),
    () => [instance(ID_A, { state: 'ready' })]
  ],
  [
    'released: false, and the re-read shows it ready',
    () => [200, { released: false, alreadyApproved: true }],
    () => [instance(ID_A, { state: 'ready' })]
  ],
  [
    'a 500, and the re-read shows a customer holding it',
    () => [500, { code: 'INTERNAL' }],
    () => [instance(ID_A, { reserved: true })]
  ],
  ['a 500, and the re-read has no such row', () => [500, { code: 'INTERNAL' }], () => [instance(ID_B)]],
  [
    'a 500, and the re-read has nothing read back from it',
    () => [500, { code: 'INTERNAL' }],
    () => [instance(ID_A, { hashes: {} })]
  ]
]

test('F-S8-007: after an answer that was not a release, a review the re-read no longer matches cannot be sent again', async () => {
  for (const [name, said, after] of MOVED) {
    const ui = await mountInventory([instance(ID_A)], () => {
      ui.state.rows = after()
      return said()
    })
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assert.equal(ui.net.posts().length, 1, name)
    assert.equal(ui.unconfirmed(), null, `${name}: the re-read was whole`)
    assert.ok(ui.review(), `${name}: the review stays open, with what the door said`)
    assert.ok(ui.reviewError(), name)
    assert.ok(ui.moved(), `${name}: and says the inventory no longer shows the instance that way`)
    assert.equal(ui.confirm().disabled, true, `${name}: the press is locked`)
    assert.doesNotMatch(ui.confirm().textContent, /Approving/, name)
    await ui.press(ui.confirm, 3)
    assert.equal(ui.net.posts().length, 1, `${name}: the refused payload is not sent again`)
    await ui.unmount()
  }
})

test('F-S8-007: a refusal whose re-read shows the same build leaves the review free to send, and says nothing moved', async () => {
  const ui = await mountInventory([instance(ID_A)], () => [409, { code: 'HASH_MISMATCH' }])
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.ok(ui.reviewError())
  assert.equal(ui.moved(), null)
  assert.equal(ui.confirm().disabled, false)
})

test('F-S8-007: a Refresh that brings the instance changed locks the review that is open', async () => {
  const ui = await mountInventory([instance(ID_A)])
  await ui.open(ID_A)
  assert.equal(ui.confirm().disabled, false)
  ui.state.rows = [instance(ID_A, { hashes: { platform: 'joomla' } })]
  await ui.press(ui.refresh())
  assert.ok(ui.moved())
  assert.equal(ui.confirm().disabled, true)
  await ui.press(ui.confirm, 2)
  assert.equal(ui.net.posts().length, 0)
  // Read back the way it was opened: the same build again, and it can be sent.
  ui.state.rows = [instance(ID_A)]
  await ui.press(ui.refresh())
  assert.equal(ui.moved(), null)
  assert.equal(ui.confirm().disabled, false)
})

// ── one read for everything on screen ────────────────────────────────────────────────────────────

const WHOLE = {
  pools: () => [200, { pools: [poolRow({ ready: 1, awaitingReview: 0 })] }],
  instances: () => [200, { instances: [instance(ID_A, { state: 'ready' })] }]
}
const OLD = {
  pools: () => [200, { pools: [poolRow()] }],
  instances: () => [200, { instances: [instance(ID_A)] }]
}
const holdReads = (ui) => {
  const held = { pools: deferred(), instances: deferred() }
  ui.state.pools = () => held.pools.promise
  ui.state.instances = () => held.instances.promise
  return held
}
const assertOld = (ui, name) => {
  assert.match(ui.text(), /0 \/ 2 ready/, `${name}: the count is the one read with the rows on screen`)
  assert.doesNotMatch(ui.text(), /1 \/ 2 ready/, name)
  assert.ok(ui.approveButton(ID_A), `${name}: the row is the one read with that count`)
  assert.doesNotMatch(ui.text(), /Nothing in this pool yet/, name)
  assert.doesNotMatch(ui.text(), /Could not read the inventory/, name)
}
const assertNew = (ui, name) => {
  assert.match(ui.text(), /1 \/ 2 ready/, name)
  assert.equal(ui.approveButton(ID_A), null, name)
  assert.ok(ui.text().includes('stock-1111'), name)
}

test('F-S8-007: Refresh reads the count and the rows of the open pool together, and draws both or neither', async () => {
  for (const [name, half] of HALF_READS) {
    const ui = await mountInventory([instance(ID_A)])
    const before = {
      pools: ui.net.reads('/api/ops/inventory'),
      rows: ui.net.reads('/api/ops/inventory/instances')
    }
    Object.assign(ui.state, half)
    await ui.press(ui.refresh())
    assert.equal(ui.net.reads('/api/ops/inventory'), before.pools + 1, name)
    assert.equal(
      ui.net.reads('/api/ops/inventory/instances'),
      before.rows + 1,
      `${name}: the rows are read too`
    )
    assertOld(ui, name)
    assert.ok(ui.unconfirmed(), `${name}: and the pool is marked`)
    assert.match(ui.unconfirmed().textContent, /tracy-base\/wp7 9f3c1a7b/, name)
    Object.assign(ui.state, WHOLE)
    await ui.press(ui.refresh())
    assertNew(ui, name)
    assert.equal(ui.unconfirmed(), null, name)
    await ui.unmount()
  }
})

test('F-S8-007: opening a pool reads its count with its rows, and draws both or neither', async () => {
  for (const [name, half] of HALF_READS) {
    const ui = await mountInventory([instance(ID_A)])
    await ui.press(ui.header)
    assert.equal(ui.approveButton(ID_A), null, 'the pool is closed')
    Object.assign(ui.state, half)
    await ui.press(ui.header)
    assertOld(ui, name)
    assert.ok(ui.unconfirmed(), name)
    Object.assign(ui.state, WHOLE)
    await ui.press(ui.header)
    await ui.press(ui.header)
    assertNew(ui, name)
    assert.equal(ui.unconfirmed(), null, name)
    await ui.unmount()
  }
})

test('F-S8-007: a pool whose rows were never read is not drawn as empty', async () => {
  const ui = await mountInventory([instance(ID_A)], undefined, {
    instances: () => [500, { code: 'INTERNAL' }]
  })
  assert.doesNotMatch(ui.text(), /Nothing in this pool yet/)
  assert.match(ui.unread()?.textContent ?? '', /could not be read/)
  assert.ok(ui.unconfirmed())
  ui.state.instances = () => [200, { instances: ui.state.rows }]
  await ui.press(reloadButton(ui))
  assert.equal(ui.unread(), null)
  assert.equal(ui.unconfirmed(), null)
  assert.ok(ui.approveButton(ID_A))
  // A pool that was read and has nothing in it is still said to be empty.
  ui.state.rows = []
  await ui.press(ui.refresh())
  assert.match(ui.text(), /Nothing in this pool yet/)
})

test('F-S8-007: a Refresh without any pool open that fails keeps the list and marks it, with no pool named', async () => {
  const ui = await mountInventory([instance(ID_A)])
  await ui.press(ui.header)
  ui.state.pools = () => [500, { code: 'INTERNAL' }]
  await ui.press(ui.refresh())
  assert.doesNotMatch(ui.text(), /Could not read the inventory/)
  assert.match(ui.text(), /0 \/ 2 ready/)
  assert.ok(ui.unconfirmed())
  assert.doesNotMatch(ui.unconfirmed().textContent, /tracy-base/)
  ui.state.pools = WHOLE.pools
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
  assert.match(ui.text(), /1 \/ 2 ready/)
})

test('F-S8-007: a Refresh started before an approval lands after its re-read and does not draw over it', async () => {
  for (const [name, late] of [
    ['whole, with what it read before the approval', OLD],
    ...HALF_READS,
    ['failed', FAILING]
  ]) {
    const ui = await mountInventory([instance(ID_A)])
    const held = holdReads(ui)
    await ui.press(ui.refresh())
    Object.assign(ui.state, WHOLE)
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assertNew(ui, name)
    await land(ui, () => {
      held.pools.resolve(late.pools())
      held.instances.resolve(late.instances())
    })
    assertNew(ui, `${name}: the older Refresh changes nothing`)
    assert.equal(ui.unconfirmed(), null, name)
    assert.equal(ui.net.posts().length, 1, name)
    await ui.unmount()
  }
})

test('F-S8-007: a Refresh pressed while the re-read after an approval is pending is drawn, and that older re-read is not', async () => {
  for (const [name, late] of [['whole', OLD], ...HALF_READS, ['failed', FAILING]]) {
    let held
    const ui = await mountInventory([instance(ID_A)], () => {
      held = holdReads(ui)
      return [200, { released: true }]
    })
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assertOld(ui, name)
    assert.equal(ui.approveButton(ID_A).disabled, true, `${name}: held until read again`)
    Object.assign(ui.state, WHOLE)
    await ui.press(ui.refresh())
    assertNew(ui, name)
    await land(ui, () => {
      held.pools.resolve(late.pools())
      held.instances.resolve(late.instances())
    })
    assertNew(ui, `${name}: the older re-read changes nothing`)
    assert.equal(ui.unconfirmed(), null, name)
    await ui.unmount()
  }
})

test('F-S8-007: a Refresh that fails while the re-read after an approval is pending keeps the mark when that re-read is drawn', async () => {
  let held
  const ui = await mountInventory([instance(ID_A)], () => {
    held = holdReads(ui)
    return [500, { code: 'INTERNAL' }]
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  await ui.cancel()
  Object.assign(ui.state, FAILING)
  await ui.press(ui.refresh())
  assert.ok(ui.unconfirmed(), 'the later read failed')
  assertOld(ui, 'before the re-read lands')
  await land(ui, () => {
    held.pools.resolve(WHOLE.pools())
    held.instances.resolve(WHOLE.instances())
  })
  assertNew(ui, 'the re-read is whole and nothing later is on screen: it is drawn')
  assert.ok(ui.unconfirmed(), 'and the mark of the later, failed read stays')
  Object.assign(ui.state, WHOLE)
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
})

test('F-S8-007: a Refresh after a failed re-read draws the pair and clears the mark; a half one clears nothing', async () => {
  const ui = await mountInventory([instance(ID_A)], () => {
    Object.assign(ui.state, FAILING)
    return [200, { released: true }]
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.ok(ui.unconfirmed())
  for (const [name, half] of HALF_READS) {
    Object.assign(ui.state, half)
    await ui.press(ui.refresh())
    assertOld(ui, name)
    assert.ok(ui.unconfirmed(), name)
    assert.equal(ui.approveButton(ID_A).disabled, true, `${name}: the released row is still held`)
  }
  Object.assign(ui.state, WHOLE)
  await ui.press(ui.refresh())
  assertNew(ui, 'whole')
  assert.equal(ui.unconfirmed(), null)
  assert.equal(ui.net.posts().length, 1)
})

test('F-S8-007: opening a pool again while an older read is pending draws the later read, whichever lands last', async () => {
  const ui = await mountInventory([instance(ID_A)])
  const held = holdReads(ui)
  await ui.press(ui.refresh())
  Object.assign(ui.state, WHOLE)
  await ui.press(ui.header)
  await ui.press(ui.header)
  assertNew(ui, 'the read of the opening')
  await land(ui, () => {
    held.pools.resolve(OLD.pools())
    held.instances.resolve(OLD.instances())
  })
  assertNew(ui, 'the older Refresh changes nothing')
  assert.equal(ui.unconfirmed(), null)
})

// ── two pools: what a read may say about a pool it did not carry ─────────────────────────────────

const poolB = (supply = {}) => ({
  ...poolRow({ awaitingReview: 0, stock: 1, ready: 1, ...supply }),
  poolKey: POOL_B,
  quickstartTag: 'pool-b/wp7',
  quickstartVersion: '2.0.0',
  generation: GENERATION_B
})
const rowC = (over = {}) =>
  instance(ID_C, { poolKey: POOL_B, generation: GENERATION_B, state: 'ready', ...over })
const INTERNAL = () => [500, { code: 'INTERNAL' }]

/**
 * Two pools listed, the first one open. `ui.doors[poolKey]` answers the instances door of one
 * pool, so one pool can fail, or be held back, while the other answers.
 */
async function mountTwoPools(approve) {
  const ui = await mountInventory([instance(ID_A), rowC()], approve, {
    pools: () => [200, { pools: [poolRow(), poolB()] }]
  })
  ui.doors = {
    [POOL_KEY]: () => [200, { instances: ui.state.rows.filter((row) => row.poolKey === POOL_KEY) }],
    [POOL_B]: () => [200, { instances: ui.state.rows.filter((row) => row.poolKey === POOL_B) }]
  }
  ui.state.instances = (poolKey) => ui.doors[poolKey]()
  ui.headerB = () => ui.headerOf('pool-b/wp7')
  assert.ok(ui.approveButton(ID_A), 'the first pool is open and its held row offers Approve')
  assert.ok(ui.headerB(), 'the second pool is listed')
  assert.equal(ui.unconfirmed(), null)
  return ui
}
const A_READY = (ui) => {
  ui.state.rows = [instance(ID_A, { state: 'ready' }), rowC()]
  ui.state.pools = () => [200, { pools: [poolRow({ ready: 1, awaitingReview: 0 }), poolB()] }]
}

const LIST_FAILURES = [
  ['answers 500', INTERNAL],
  ['is dropped', () => Promise.reject(new TypeError('fetch failed'))],
  ['answers 200 with nothing readable', () => new Response('', { status: 200 })],
  ['answers a 500 that carries a pool list', () => [500, { pools: [poolRow({ ready: 2 }), poolB()] }]]
]

test('F-S8-007: [F1] when the pools door fails with a pool open, the whole list is marked, not only that pool', async () => {
  for (const [name, said] of LIST_FAILURES) {
    const ui = await mountTwoPools()
    ui.state.pools = said
    await ui.press(ui.refresh())
    assert.ok(ui.listMark(), `${name}: the mark is about every count on screen`)
    assert.match(ui.listMark().textContent, /Every count shown/, name)
    assert.equal(ui.poolMark(), POOL_KEY, `${name}: and about the rows of the pool that read covered`)
    assert.doesNotMatch(ui.unconfirmed().textContent, /pool-b/, `${name}: no pool it did not cover is named`)
    assert.match(ui.text(), /0 \/ 2 ready/, `${name}: the counts are the ones read before`)
    assert.doesNotMatch(ui.text(), /2 \/ 2 ready/, name)
    assert.ok(ui.approveButton(ID_A), `${name}: and so are the rows`)
    // Opening the other pool while the door still fails clears nothing, and marks that pool too.
    await ui.press(ui.headerB())
    assert.ok(ui.listMark(), name)
    assert.equal(ui.poolMark(), `${POOL_KEY} ${POOL_B}`, name)
    assert.match(ui.unread()?.textContent ?? '', /could not be read/, `${name}: its rows are not drawn empty`)
    A_READY(ui)
    await ui.press(reloadButton(ui))
    assert.equal(ui.unconfirmed(), null, name)
    assert.match(ui.text(), /1 \/ 2 ready/, name)
    assert.ok(ui.text().includes('stock-3333'), `${name}: the open pool's rows are drawn`)
    assert.equal(ui.net.posts().length, 0, name)
    await ui.unmount()
  }
})

test('F-S8-007: [F2] a failed re-read of one pool stays marked when another pool is opened and read', async () => {
  const ui = await mountTwoPools(() => {
    A_READY(ui)
    ui.doors[POOL_KEY] = INTERNAL
    return [200, { released: true }]
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.match(ui.notice(), /released to ready/)
  assert.equal(ui.poolMark(), POOL_KEY, 'the re-read of the first pool failed')
  assert.ok(ui.listMark(), 'and nothing of that read was drawn')
  assert.match(ui.text(), /0 \/ 2 ready/, 'no new count beside the old rows')
  // The second pool is read whole. That read did not carry the first pool's instances.
  await ui.press(ui.headerB())
  assert.ok(ui.text().includes('stock-3333'), 'the second pool is drawn')
  assert.equal(ui.listMark(), null, 'the list was read again')
  assert.equal(ui.poolMark(), POOL_KEY, 'the first pool is still not confirmed')
  assert.match(ui.unconfirmed().textContent, /tracy-base\/wp7 9f3c1a7b/)
  assert.doesNotMatch(ui.unconfirmed().textContent, /pool-b/)
  // Nor does a Refresh, which reads the list and the pool that is open.
  await ui.press(ui.refresh())
  assert.equal(ui.poolMark(), POOL_KEY)
  // Reload reads the marked pool with the open one; while its door fails nothing of that read is
  // drawn, so the mark stays and the open pool, read in the same attempt, is not confirmed either.
  await ui.press(reloadButton(ui))
  assert.equal(ui.poolMark(), `${POOL_KEY} ${POOL_B}`)
  assert.ok(ui.listMark())
  assert.ok(ui.text().includes('stock-3333'), 'the rows read before stay')
  ui.doors[POOL_KEY] = () => [200, { instances: [instance(ID_A, { state: 'ready' })] }]
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
  await ui.press(ui.header)
  assert.ok(ui.text().includes('stock-1111'))
  assert.equal(ui.approveButton(ID_A), null, 'read again, the first pool shows the release')
  assert.equal(ui.net.posts().length, 1)
})

test('F-S8-007: [F2] an instance stays held when another pool is read, until a read carries its own pool', async () => {
  const ui = await mountTwoPools(() => {
    ui.doors[POOL_KEY] = INTERNAL
    return [500, { code: 'INTERNAL' }]
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  assert.equal(ui.confirm().disabled, true, 'answered, and not read again')
  assert.ok(ui.reviewUnread())
  await ui.press(ui.headerB())
  assert.ok(ui.text().includes('stock-3333'), 'the second pool is read whole')
  assert.equal(ui.poolMark(), POOL_KEY)
  assert.equal(ui.confirm().disabled, true, 'a read of another pool says nothing about this instance')
  await ui.press(ui.confirm, 3)
  assert.equal(ui.net.posts().length, 1)
  ui.doors[POOL_KEY] = () => [200, { instances: [instance(ID_A)] }]
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
  assert.equal(ui.reviewUnread(), null)
  assert.equal(ui.confirm().disabled, false, 'its own pool was read, and the row is the build opened')
  await ui.press(ui.confirm)
  assert.equal(ui.net.posts().length, 2)
})

test('F-S8-007: [F3] an older read of one pool that fails after a later read of another pool was drawn still marks its pool', async () => {
  const ui = await mountTwoPools()
  const held = deferred()
  ui.doors[POOL_KEY] = () => held.promise
  await ui.press(ui.refresh())
  await ui.press(ui.headerB())
  assert.ok(ui.text().includes('stock-3333'), 'the later read, of the second pool, is drawn')
  assert.equal(ui.unconfirmed(), null)
  await land(ui, () => held.resolve([500, { code: 'INTERNAL' }]))
  assert.equal(
    ui.poolMark(),
    POOL_KEY,
    'the read on screen did not carry the first pool: its failure is said'
  )
  assert.equal(ui.listMark(), null, 'the list on screen is from a later read')
  assert.ok(ui.text().includes('stock-3333'), 'and what is drawn does not change')
  ui.doors[POOL_KEY] = () => [200, { instances: [instance(ID_A)] }]
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
})

test('F-S8-007: [F3] an older read of one pool that lands whole after a later read of another pool draws and marks nothing', async () => {
  const ui = await mountTwoPools()
  const held = deferred()
  ui.doors[POOL_KEY] = () => held.promise
  await ui.press(ui.refresh())
  ui.state.pools = () => [200, { pools: [poolRow(), poolB({ ready: 2 })] }]
  await ui.press(ui.headerB())
  assert.match(ui.text(), /2 \/ 2 ready/)
  await land(ui, () => held.resolve([200, { instances: [instance(ID_A, { state: 'ready' })] }]))
  assert.equal(ui.unconfirmed(), null)
  assert.match(ui.text(), /2 \/ 2 ready/, 'the later count stays')
  assert.ok(ui.text().includes('stock-3333'))
  assert.equal(ui.approveButton(ID_A), null, 'the first pool is closed; its older rows are not drawn')
})

test('F-S8-007: [F4] a Reload over two marked pools that reads only one of them clears neither mark', async () => {
  const ui = await mountTwoPools(() => {
    A_READY(ui)
    ui.doors[POOL_KEY] = INTERNAL
    return [200, { released: true }]
  })
  await ui.open(ID_A)
  await ui.press(ui.confirm)
  ui.doors[POOL_B] = INTERNAL
  await ui.press(ui.headerB())
  assert.equal(ui.poolMark(), `${POOL_KEY} ${POOL_B}`, 'both pools are marked')
  const whole = {
    [POOL_KEY]: () => [200, { instances: [instance(ID_A, { state: 'ready' })] }],
    [POOL_B]: () => [200, { instances: [rowC()] }]
  }
  for (const [name, failing] of [
    ['the second pool fails', POOL_B],
    ['the first pool fails', POOL_KEY]
  ]) {
    Object.assign(ui.doors, whole, { [failing]: INTERNAL })
    await ui.press(reloadButton(ui))
    assert.equal(
      ui.poolMark(),
      `${POOL_KEY} ${POOL_B}`,
      `${name}: a read that was not drawn confirms no pool`
    )
    assert.ok(ui.listMark(), name)
    assert.match(ui.text(), /0 \/ 2 ready/, `${name}: and no count of it is drawn`)
    assert.match(ui.unread()?.textContent ?? '', /could not be read/, name)
  }
  Object.assign(ui.doors, whole)
  await ui.press(reloadButton(ui))
  assert.equal(ui.unconfirmed(), null)
  assert.match(ui.text(), /1 \/ 2 ready/)
  assert.ok(ui.text().includes('stock-3333'))
  assert.equal(ui.net.posts().length, 1)
})

// ── every kind of read against a pending re-read ─────────────────────────────────────────────────

test('F-S8-007: [N3] a Reload pressed while the re-read after an approval is pending is drawn, and that older re-read is not', async () => {
  for (const [name, late] of [['whole', OLD], ...HALF_READS, ['failed', FAILING]]) {
    let held
    const ui = await mountInventory([instance(ID_A)], () => {
      held = holdReads(ui)
      return [200, { released: true }]
    })
    Object.assign(ui.state, FAILING)
    await ui.press(ui.refresh())
    assert.ok(reloadButton(ui), `${name}: a failed Refresh offers Reload`)
    Object.assign(ui.state, OLD)
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assertOld(ui, name)
    assert.ok(ui.unconfirmed(), `${name}: the mark waits for a read that is drawn`)
    Object.assign(ui.state, WHOLE)
    await ui.press(reloadButton(ui))
    assertNew(ui, name)
    assert.equal(ui.unconfirmed(), null, name)
    await land(ui, () => {
      held.pools.resolve(late.pools())
      held.instances.resolve(late.instances())
    })
    assertNew(ui, `${name}: the older re-read changes nothing`)
    assert.equal(ui.unconfirmed(), null, `${name}: and marks nothing`)
    assert.equal(ui.net.posts().length, 1, name)
    await ui.unmount()
  }
})

test('F-S8-007: [N3] opening the pool again while the re-read after an approval is pending is drawn, and that older re-read is not', async () => {
  for (const [name, late] of [['whole', OLD], ...HALF_READS, ['failed', FAILING]]) {
    let held
    const ui = await mountInventory([instance(ID_A)], () => {
      held = holdReads(ui)
      return [200, { released: true }]
    })
    await ui.open(ID_A)
    await ui.press(ui.confirm)
    assert.equal(ui.approveButton(ID_A).disabled, true, `${name}: held until read again`)
    Object.assign(ui.state, WHOLE)
    await ui.press(ui.header)
    await ui.press(ui.header)
    assertNew(ui, name)
    await land(ui, () => {
      held.pools.resolve(late.pools())
      held.instances.resolve(late.instances())
    })
    assertNew(ui, `${name}: the older re-read changes nothing`)
    assert.equal(ui.unconfirmed(), null, name)
    await ui.unmount()
  }
})

// ── answers the screen cannot draw ───────────────────────────────────────────────────────────────

const text = (body) => () => new Response(body, { status: 200 })
const UNDRAWABLE_POOLS = [
  ['an empty body', text('')],
  ['broken JSON', text('{"pools":[')],
  ['null', text('null')],
  ['a list', () => [200, [poolRow({ ready: 1 })]]],
  ['text', text('"pools"')],
  ['no pools', () => [200, {}]],
  ['pools that is not a list', () => [200, { pools: { 0: poolRow({ ready: 1 }) } }]],
  ['a row that is null', () => [200, { pools: [null] }]],
  ['a row with no key', () => [200, { pools: [{ ...poolRow({ ready: 1 }), poolKey: '' }] }]],
  ['a row with no generation', () => [200, { pools: [{ ...poolRow({ ready: 1 }), generation: undefined }] }]],
  ['a row with no counts', () => [200, { pools: [{ ...poolRow({ ready: 1 }), supply: null }] }]],
  ['a row with no thresholds', () => [200, { pools: [{ ...poolRow({ ready: 1 }), policy: undefined }] }]],
  ['the same pool twice', () => [200, { pools: [poolRow({ ready: 1 }), poolRow({ ready: 1 })] }]],
  ['a timer row with no period', () => [200, { pools: [poolRow({ ready: 1 })], sweep: { revision: 1 } }]],
  ['a refusal that carries pools', () => [403, { pools: [poolRow({ ready: 1 })] }]]
]
const READY_ROW = () => instance(ID_A, { state: 'ready' })
const UNDRAWABLE_INSTANCES = [
  ['an empty body', text('')],
  ['broken JSON', text('{"instances":[')],
  ['null', text('null')],
  ['a list', () => [200, [READY_ROW()]]],
  ['no instances', () => [200, {}]],
  ['instances that is not a list', () => [200, { instances: {} }]],
  ['a row that is null', () => [200, { instances: [null] }]],
  ['a row with no id', () => [200, { instances: [{ ...READY_ROW(), id: undefined }] }]],
  ['a row with an empty id', () => [200, { instances: [{ ...READY_ROW(), id: '' }] }]],
  ['a row with no state', () => [200, { instances: [{ ...READY_ROW(), state: null }] }]],
  ['a row of another pool', () => [200, { instances: [{ ...READY_ROW(), poolKey: POOL_B }] }]],
  ['the same instance twice', () => [200, { instances: [READY_ROW(), READY_ROW()] }]],
  ['a refusal that carries rows', () => [500, { instances: [READY_ROW()] }]]
]

test('F-S8-007: an answer the screen cannot draw is not drawn as half of a read, nor as an empty list', async () => {
  for (const [door, cases] of [
    ['pools', UNDRAWABLE_POOLS],
    ['instances', UNDRAWABLE_INSTANCES]
  ]) {
    for (const [what, said] of cases) {
      const name = `the ${door} door answers ${what}`
      const ui = await mountInventory([instance(ID_A)])
      assert.ok(ui.approveButton(ID_A), 'the held row offers Approve')
      Object.assign(ui.state, WHOLE, { [door]: said })
      await ui.press(ui.refresh())
      assertOld(ui, name)
      assert.doesNotMatch(ui.text(), /Nothing stocked/, name)
      assert.ok(ui.listMark(), `${name}: the read was not drawn, and the screen says so`)
      assert.equal(ui.poolMark(), POOL_KEY, name)
      Object.assign(ui.state, WHOLE)
      await ui.press(reloadButton(ui))
      assertNew(ui, name)
      assert.equal(ui.unconfirmed(), null, name)
      await ui.unmount()
    }
  }
})

test('F-S8-007: a first read the screen cannot draw says the inventory could not be read, not that nothing is stocked', async () => {
  for (const [what, said] of UNDRAWABLE_POOLS) {
    fixtureOf({ pools: said, instances: INTERNAL, approve: INTERNAL })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = lib.createRoot(host)
    cleanups.push(async () => {
      await lib.act(async () => root.unmount())
      host.remove()
    })
    // An answer of the wrong shape must not take the screen down either: a throw while drawing is
    // caught here and reported as what it is.
    let crash = null
    try {
      await lib.act(async () => root.render(lib.createElement(lib.Inventory, { cms: 'wordpress' })))
      await lib.act(async () => tick(5))
    } catch (error) {
      crash = String(error?.message ?? error)
    }
    assert.equal(crash, null, `${what}: the screen draws without throwing`)
    assert.match(host.textContent, /Could not read the inventory/, what)
    assert.doesNotMatch(host.textContent, /Nothing stocked/, what)
    for (const cleanup of cleanups.splice(0)) await cleanup()
  }
})

// ── the state behind the screen ──────────────────────────────────────────────────────────────────

test('F-S8-007: the read state applies a read whole or not at all, and clears a mark only with a read that carried it', () => {
  const R = lib.reads
  assert.equal(typeof R?.settle, 'function', 'inventory-read-state exports settle')
  const list = { pools: [poolRow(), poolB()], sweep: null }
  const rowsA = [instance(ID_A)]
  const rowsB = [rowC()]
  const start = (state, targets, open = null) => R.begin(state, targets, open)

  // A ticket is fixed when the read starts.
  let { state, ticket: t1 } = start(R.NOTHING_READ, [POOL_KEY, POOL_KEY], POOL_B)
  assert.deepEqual([t1.seq, [...t1.covered]], [1, [POOL_KEY, POOL_B]])
  assert.ok(Object.isFrozen(t1) && Object.isFrozen(t1.covered))

  // Whole: applied, with exactly the pools it covered.
  let got = R.settle(state, t1, list, [rowsA, rowsB])
  assert.equal(got.applied, true)
  assert.deepEqual(Object.keys(got.state.snapshot.instances), [POOL_KEY, POOL_B])
  assert.equal(got.state.snapshot.seq, 1)
  state = got.state

  // Any door missing: nothing applied; the list and every covered pool are marked.
  for (const [name, pools, instances] of [
    ['the list', null, [rowsA, rowsB]],
    ['one pool', list, [rowsA, null]],
    ['the other pool', list, [null, rowsB]],
    ['fewer answers than pools', list, [rowsA]]
  ]) {
    const next = start(state, [POOL_KEY], POOL_B)
    const failed = R.settle(next.state, next.ticket, pools, instances)
    assert.equal(failed.applied, false, name)
    assert.equal(failed.state.snapshot, state.snapshot, `${name}: the snapshot is the same object`)
    assert.equal(R.listUnconfirmed(failed.state), true, name)
    assert.deepEqual(R.unconfirmedPools(failed.state), [POOL_KEY, POOL_B], name)
  }

  // A mark is cleared by a later applied read that carried that pool — and by no other.
  let next = start(state, [POOL_KEY])
  state = R.settle(next.state, next.ticket, list, [null]).state
  assert.deepEqual(R.unconfirmedPools(state), [POOL_KEY])
  next = start(state, [], POOL_B)
  got = R.settle(next.state, next.ticket, list, [rowsB])
  assert.equal(got.applied, true)
  assert.equal(R.listUnconfirmed(got.state), false, 'the list was read again')
  assert.deepEqual(R.unconfirmedPools(got.state), [POOL_KEY], 'the first pool was not')
  assert.equal(got.state.snapshot.instances[POOL_KEY], undefined, 'and has no rows, not older ones')
  state = got.state
  next = start(state, [POOL_KEY])
  got = R.settle(next.state, next.ticket, list, [rowsA])
  assert.deepEqual(R.unconfirmedPools(got.state), [])
  state = got.state

  // Order: an older read never replaces a later one; failing late, it marks only what the later
  // read did not carry.
  const older = start(state, [POOL_KEY])
  const later = start(older.state, [], POOL_B)
  state = R.settle(later.state, later.ticket, list, [rowsB]).state
  const lateWhole = R.settle(state, older.ticket, list, [rowsA])
  assert.equal(lateWhole.applied, false)
  assert.equal(lateWhole.state, state, 'an older whole read changes nothing')
  const lateFailed = R.settle(state, older.ticket, null, [null])
  assert.equal(R.listUnconfirmed(lateFailed.state), false)
  assert.deepEqual(R.unconfirmedPools(lateFailed.state), [POOL_KEY])
  const sameOlder = start(state, [], POOL_B)
  const sameLater = start(sameOlder.state, [], POOL_B)
  state = R.settle(sameLater.state, sameLater.ticket, list, [rowsB]).state
  assert.deepEqual(
    R.unconfirmedPools(R.settle(state, sameOlder.ticket, null, [null]).state),
    [],
    'a pool the later read carried is not marked by the older failure'
  )

  // A hold is lifted only by an applied read, started after the answer, that carried its pool.
  const opened = instance(ID_A)
  let held = R.withHold(state, ID_A, { phase: 'sending' })
  assert.equal(R.approvalBlock(held, opened, POOL_KEY), 'sending')
  const before = start(held, [POOL_KEY])
  held = R.withHold(before.state, ID_A, { phase: 'settling', poolKey: POOL_KEY, since: before.state.started })
  assert.equal(R.approvalBlock(held, opened, POOL_KEY), 'settling')
  const startedBefore = R.settle(held, before.ticket, list, [rowsA])
  assert.equal(startedBefore.applied, true)
  assert.equal(
    R.approvalBlock(startedBefore.state, opened, POOL_KEY),
    'settling',
    'a read started before the answer'
  )
  const other = start(startedBefore.state, [], POOL_B)
  const otherPool = R.settle(other.state, other.ticket, list, [rowsB]).state
  assert.equal(R.approvalBlock(otherPool, opened, POOL_KEY), 'settling', 'a read of another pool')
  const failing = start(otherPool, [POOL_KEY])
  const failedRead = R.settle(failing.state, failing.ticket, list, [null]).state
  assert.equal(R.approvalBlock(failedRead, opened, POOL_KEY), 'settling', 'a read that failed')
  const own = start(failedRead, [POOL_KEY])
  const ownPool = R.settle(own.state, own.ticket, list, [rowsA]).state
  assert.equal(R.approvalBlock(ownPool, opened, POOL_KEY), null, 'its own pool, read after the answer')
  assert.equal(R.approvalBlock(ownPool, opened, POOL_B), 'moved', 'a review filed under another pool')
  const changed = start(ownPool, [POOL_KEY])
  const moved = R.settle(changed.state, changed.ticket, list, [[instance(ID_A, { state: 'ready' })]]).state
  assert.equal(R.approvalBlock(moved, opened, POOL_KEY), 'moved')
  const gone = start(moved, [], POOL_B)
  assert.equal(
    R.approvalBlock(R.settle(gone.state, gone.ticket, list, [rowsB]).state, opened, POOL_KEY),
    'moved',
    'no row on screen for it at all'
  )

  // What a door may answer.
  assert.deepEqual(R.poolsAnswer({ pools: [poolRow()] }), { pools: [poolRow()], sweep: null })
  assert.equal(R.poolsAnswer({ pools: [poolRow()], code: 'HTTP_500' }), null)
  assert.deepEqual(
    R.instancesAnswer({ instances: [] }, POOL_KEY),
    [],
    'an empty pool is a pool that was read'
  )
  assert.equal(R.instancesAnswer({ instances: [rowC()] }, POOL_KEY), null)
  assert.equal(R.instancesAnswer({ instances: [], code: 'NO_ANSWER' }, POOL_KEY), null)
})

// ── every field of every row ([P]) ───────────────────────────────────────────────────────────────

const STAMP = '2026-10-03T08:00:00.000Z'
const sweepRow = (over = {}) => ({
  periodMs: 30_000,
  lastStartedAt: STAMP,
  lastFinishedAt: STAMP,
  lastError: null,
  lastOutcome: { advanced: 0, ready: 1, retired: 0, enqueued: 0, started: 0, failed: 0 },
  revision: 1,
  updatedBy: null,
  updatedAt: null,
  ...over
})
const eligibleRow = (over = {}) => ({
  tag: 'tracy-shop/wp7',
  platform: 'wordpress',
  attestedVersion: '1.0.0',
  currentVersion: '1.0.0',
  eligible: true,
  drift: null,
  reason: null,
  ...over
})

/**
 * What each kind of field must refuse, and what it must take. Written here from the door
 * (`ops/inventory.js`, migrations 026 and 027), not read from the module under test.
 */
const KINDS = {
  text: { bad: [undefined, null, '', 7, true, {}, ['x']], good: ['x'] },
  str: { bad: [undefined, null, 7, true, {}, ['x']], good: ['', 'x'] },
  strOrNull: { bad: [undefined, 7, true, {}, ['x']], good: [null, '', 'x'] },
  flag: { bad: [undefined, null, 'true', 1, {}], good: [true, false] },
  flagOrNull: { bad: [undefined, 'true', 1, {}], good: [null, true, false] },
  count: { bad: [undefined, null, '3', -1, 1.5, Number.NaN, true, {}, [3]], good: [0, 3] },
  period: { bad: [undefined, null, '30000', 0, -1, 1.5, {}], good: [10_000] },
  stamp: { bad: [undefined, null, '', 'yesterday', 7, {}], good: [STAMP] },
  stampOrNull: { bad: [undefined, '', 'yesterday', 7, {}], good: [null, STAMP] },
  recordOrNull: { bad: [undefined, 'x', 7, ['x']], good: [null, {}, { ok: true }] },
  optionalCount: { bad: [null, '3', -1, 1.5, {}, [3]], good: [undefined, 0, 3] },
  part: { bad: [undefined, null, {}, [], 'x', 7], good: [] },
  partOrNull: { bad: [undefined, [], 'x', 7], good: [null, {}] },
  any: { bad: [], good: [undefined, null, {}, [], 'x', 7] }
}
const FIELDS = {
  pool: {
    poolKey: 'text',
    environment: 'str',
    host: 'str',
    platform: 'str',
    quickstartTag: 'text',
    quickstartVersion: 'str',
    generation: 'text',
    policy: 'part',
    revision: 'count',
    supply: 'part'
  },
  policy: {
    enabled: 'flag',
    lowWatermark: 'count',
    targetReady: 'count',
    maxStock: 'count',
    maxConcurrentPrepares: 'count',
    reviewHold: 'flag',
    maxAttempts: 'count',
    healthTtlSeconds: 'count',
    paused: 'flag',
    pausedReason: 'strOrNull'
  },
  supply: {
    ready: 'count',
    preparing: 'count',
    awaitingReview: 'count',
    reserved: 'count',
    assigned: 'count',
    quarantined: 'count',
    draining: 'count',
    stock: 'count',
    handedOver: 'count'
  },
  sweep: {
    periodMs: 'period',
    lastStartedAt: 'stampOrNull',
    lastFinishedAt: 'stampOrNull',
    lastError: 'strOrNull',
    lastOutcome: 'partOrNull',
    revision: 'count',
    updatedBy: 'strOrNull',
    updatedAt: 'stampOrNull'
  },
  outcome: {
    advanced: 'optionalCount',
    ready: 'optionalCount',
    retired: 'optionalCount',
    enqueued: 'optionalCount',
    started: 'optionalCount',
    failed: 'optionalCount'
  },
  instance: {
    id: 'text',
    siteKey: 'str',
    label: 'str',
    url: 'strOrNull',
    host: 'str',
    // Empty is drawn with a disabled Approve; `reviewable` is what refuses it.
    generation: 'str',
    state: 'text',
    jobId: 'strOrNull',
    attempts: 'count',
    nextAttemptAt: 'stampOrNull',
    healthOk: 'flagOrNull',
    healthCheckedAt: 'stampOrNull',
    healthDetail: 'recordOrNull',
    // Never drawn from a row as read: `reviewable` checks it before the review shows or sends it.
    hashes: 'any',
    reserved: 'flag',
    reservedAt: 'stampOrNull',
    lastError: 'strOrNull',
    createdAt: 'stamp',
    updatedAt: 'stamp'
  },
  eligible: {
    tag: 'text',
    platform: 'strOrNull',
    attestedVersion: 'strOrNull',
    currentVersion: 'strOrNull',
    eligible: 'flag',
    drift: 'strOrNull',
    reason: 'strOrNull'
  }
}
const said = (value) => (value === undefined ? 'missing' : (JSON.stringify(value) ?? String(value)))

test('F-S8-007: [P] an answer is read only when every field of every row is what the door declares', () => {
  const R = lib.reads
  assert.equal(typeof R?.poolsAnswer, 'function', 'inventory-read-state exports poolsAnswer')
  assert.equal(typeof R?.instancesAnswer, 'function', 'inventory-read-state exports instancesAnswer')
  assert.equal(typeof R?.eligibleAnswer, 'function', 'inventory-read-state exports eligibleAnswer')

  /** Each part of an answer: the whole row, how one field of it is replaced, and how it is read. */
  const parts = {
    pool: [poolRow(), (row) => R.poolsAnswer({ pools: [row] })],
    policy: [poolRow().policy, (policy) => R.poolsAnswer({ pools: [{ ...poolRow(), policy }] })],
    supply: [poolRow().supply, (supply) => R.poolsAnswer({ pools: [{ ...poolRow(), supply }] })],
    sweep: [sweepRow(), (sweep) => R.poolsAnswer({ pools: [poolRow()], sweep })],
    outcome: [
      sweepRow().lastOutcome,
      (lastOutcome) => R.poolsAnswer({ pools: [poolRow()], sweep: sweepRow({ lastOutcome }) })
    ],
    instance: [instance(ID_A), (row) => R.instancesAnswer({ instances: [row] }, POOL_KEY)],
    eligible: [eligibleRow(), (row) => R.eligibleAnswer({ quickstarts: [row] })]
  }
  for (const [part, [whole, read]] of Object.entries(parts)) {
    assert.notEqual(read(whole), null, `${part}: the whole row is read`)
    // The table names every field the fixture has, so a field with no rule fails here.
    const fields = Object.keys(whole).filter((key) => !(part === 'instance' && key === 'poolKey'))
    assert.deepEqual(Object.keys(FIELDS[part]).sort(), fields.sort(), `${part}: every field has a rule`)
    for (const [field, kind] of Object.entries(FIELDS[part])) {
      for (const bad of KINDS[kind].bad) {
        const row = { ...whole, [field]: bad }
        if (bad === undefined) delete row[field]
        assert.equal(read(row), null, `${part}.${field} ${said(bad)} is not read`)
      }
      for (const good of KINDS[kind].good)
        assert.notEqual(read({ ...whole, [field]: good }), null, `${part}.${field} ${said(good)} is read`)
    }
  }

  // The envelope of each door, and what is not a field: the pool of a row, and a row said twice.
  assert.equal(
    R.poolsAnswer({ pools: [poolRow()], sweep: undefined })?.sweep,
    null,
    'no timer row is no timer'
  )
  assert.deepEqual(R.eligibleAnswer({ recorded: 0, quickstarts: [] }), [])
  for (const [name, body] of [
    ['nothing', null],
    ['a list', [eligibleRow()]],
    ['no quickstarts', {}],
    ['quickstarts that is not a list', { quickstarts: { 0: eligibleRow() } }],
    ['a row that is null', { quickstarts: [null] }],
    ['the same tag twice', { quickstarts: [eligibleRow(), eligibleRow()] }],
    ['a refusal that carries rows', { quickstarts: [eligibleRow()], code: 'HTTP_403' }]
  ])
    assert.equal(R.eligibleAnswer(body), null, `the eligible door answers ${name}`)
  for (const poolKey of [undefined, null, '', 7, POOL_B])
    assert.equal(
      R.instancesAnswer({ instances: [{ ...instance(ID_A), poolKey }] }, POOL_KEY),
      null,
      `instance.poolKey ${said(poolKey)} is not read`
    )
})

/** Run `fn`; a throw while the screen draws is reported as what it is, an assertion that failed. */
async function drawing(name, fn) {
  try {
    return await fn()
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error
    assert.fail(`${name}: the screen threw while drawing — ${String(error?.message ?? error)}`)
  }
}

const newPools = (over = {}, more = {}) => [
  200,
  { pools: [{ ...poolRow({ ready: 1, awaitingReview: 0 }), ...over }], ...more }
]
const newRows = (over) => [200, { instances: [{ ...READY_ROW(), ...over }] }]
const HOLED_POOLS = [
  ['counts that are empty', () => newPools({ supply: {} })],
  ['thresholds that are empty', () => newPools({ policy: {} })],
  ['a count that is text', () => newPools({ supply: { ...poolRow().supply, ready: '1' } })],
  ['a count that is negative', () => newPools({ supply: { ...poolRow().supply, ready: -1 } })],
  ['a count that is an object', () => newPools({ supply: { ...poolRow().supply, preparing: { n: 1 } } })],
  ['a threshold that is an object', () => newPools({ policy: { ...poolRow().policy, targetReady: {} } })],
  [
    'a threshold that is missing',
    () => newPools({ policy: { ...poolRow().policy, healthTtlSeconds: undefined } })
  ],
  [
    'a pause reason that is an object',
    () => newPools({ policy: { ...poolRow().policy, paused: true, pausedReason: { why: 'x' } } })
  ],
  ['a host that is an object', () => newPools({ host: { name: 'h1' } })],
  ['a version that is a list', () => newPools({ quickstartVersion: ['1.1.0'] })],
  ['a revision that is text', () => newPools({ revision: '1' })],
  [
    'a timer error that is an object',
    () => newPools({}, { sweep: sweepRow({ lastError: { message: 'x' } }) })
  ],
  ['a timer period that is text', () => newPools({}, { sweep: sweepRow({ periodMs: '30000' }) })],
  [
    'a timer start that is not a date',
    () => newPools({}, { sweep: sweepRow({ lastStartedAt: 'yesterday' }) })
  ],
  ['a timer outcome that is a list', () => newPools({}, { sweep: sweepRow({ lastOutcome: [1] }) })],
  [
    'a timer outcome whose number is an object',
    () => newPools({}, { sweep: sweepRow({ lastOutcome: { ready: {} } }) })
  ],
  ['a timer changed by an object', () => newPools({}, { sweep: sweepRow({ updatedBy: { email: 'x' } }) })]
]
const HOLED_INSTANCES = [
  ['a label that is an object', () => newRows({ label: { text: 'stock-1111' } })],
  ['a label that is missing', () => newRows({ label: undefined })],
  ['an error that is an object', () => newRows({ lastError: { message: 'x' } })],
  ['an address that is an object', () => newRows({ url: { href: 'http://x' } })],
  ['tries that are text', () => newRows({ attempts: '2' })],
  ['tries that are an object', () => newRows({ attempts: { n: 2 } })],
  ['a state that is an object', () => newRows({ state: { name: 'ready' } })],
  ['no word on who holds it', () => newRows({ reserved: undefined })],
  ['a health check time that is a number', () => newRows({ healthCheckedAt: 7 })],
  ['an updated time that is not a date', () => newRows({ updatedAt: 'yesterday' })],
  ['a generation that is a number', () => newRows({ generation: 7 })]
]

test('F-S8-007: [P] a row with a field the screen cannot draw is not drawn — the last read stays, marked', async () => {
  for (const [door, cases] of [
    ['pools', HOLED_POOLS],
    ['instances', HOLED_INSTANCES]
  ]) {
    for (const [what, holed] of cases) {
      const name = `the ${door} door answers ${what}`
      await drawing(name, async () => {
        const ui = await mountInventory([instance(ID_A)])
        assert.ok(ui.approveButton(ID_A), 'the held row offers Approve')
        Object.assign(ui.state, WHOLE, { [door]: holed })
        await ui.press(ui.refresh())
        assertOld(ui, name)
        assert.doesNotMatch(
          ui.text(),
          /undefined|NaN|\[object Object\]/,
          `${name}: nothing is drawn with a hole in it`
        )
        assert.ok(ui.listMark(), `${name}: the read was not drawn, and the screen says so`)
        assert.equal(ui.poolMark(), POOL_KEY, name)
        Object.assign(ui.state, WHOLE)
        await ui.press(reloadButton(ui))
        assertNew(ui, name)
        assert.equal(ui.unconfirmed(), null, name)
        await ui.unmount()
      })
      for (const cleanup of cleanups.splice(0)) await cleanup().catch(() => {})
    }
  }
})

test('F-S8-007: [P] a whole answer with a timer row is drawn, timer and all', async () => {
  const ui = await mountInventory([instance(ID_A)])
  Object.assign(ui.state, WHOLE, {
    pools: () =>
      newPools({}, { sweep: sweepRow({ lastError: 'host h1 did not answer', updatedBy: 'ops@tracy.test' }) })
  })
  await ui.press(ui.refresh())
  assertNew(ui, 'a whole answer')
  assert.equal(ui.unconfirmed(), null)
  assert.match(ui.text(), /runs every 30 seconds/)
  assert.match(ui.text(), /host h1 did not answer/)
  assert.match(ui.text(), /Last changed by ops@tracy\.test/)
})

const HOLED_ELIGIBLE = [
  ['an empty body', text('')],
  ['null', text('null')],
  ['quickstarts that is not a list', () => [200, { quickstarts: { 0: eligibleRow() } }]],
  ['a row that is null', () => [200, { quickstarts: [null] }]],
  [
    'a reason that is an object',
    () => [200, { quickstarts: [eligibleRow({ eligible: false, reason: { why: 'x' } })] }]
  ],
  ['a tag that is an object', () => [200, { quickstarts: [eligibleRow({ tag: { name: 'x' } })] }]],
  ['a version that is an object', () => [200, { quickstarts: [eligibleRow({ currentVersion: { v: 1 } })] }]],
  [
    'no word on whether it may be stocked',
    () => [200, { quickstarts: [eligibleRow({ eligible: undefined })] }]
  ],
  [
    'one row that cannot be drawn beside one that can',
    () => [200, { quickstarts: [eligibleRow(), eligibleRow({ tag: 'other/wp7', reason: 7 })] }]
  ],
  ['a refusal that carries rows', () => [403, { quickstarts: [eligibleRow()] }]]
]

test('F-S8-007: [P] a list of what may be stocked that cannot be drawn offers nothing to stock', async () => {
  await drawing('a whole list', async () => {
    const ui = await mountInventory([instance(ID_A)], undefined, {
      eligible: () => [200, { recorded: 0, quickstarts: [eligibleRow()] }]
    })
    assert.match(ui.text(), /Not stocked yet/, 'a whole list is drawn')
    assert.match(ui.text(), /tracy-shop\/wp7/)
    await ui.unmount()
  })
  for (const [what, holed] of HOLED_ELIGIBLE) {
    const name = `the eligible door answers ${what}`
    await drawing(name, async () => {
      const ui = await mountInventory([instance(ID_A)], undefined, { eligible: holed })
      assert.ok(ui.approveButton(ID_A), `${name}: the pools are drawn all the same`)
      assert.doesNotMatch(ui.text(), /Not stocked yet/, name)
      assert.doesNotMatch(ui.text(), /Stock this/, name)
      await ui.unmount()
    })
    for (const cleanup of cleanups.splice(0)) await cleanup().catch(() => {})
  }
})

const quarantine = (ui) =>
  [...ui.host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Quarantine' && !b.disabled)
const HOLED_REFUSALS = [
  ['a detail that is an object', [409, { code: 'INVALID', detail: { field: 'state' } }], /INVALID/],
  ['a detail that is a list', [400, { code: 'BAD_TARGET', detail: ['to'] }], /BAD_TARGET/],
  ['a code that is an object', [409, { code: { name: 'HAS_OWNER' } }], /No answer from this deployment/],
  [
    'a host that is an object',
    [502, { code: 'HOST_UNREACHABLE', host: { name: 'h1' } }],
    /Could not reach the host/
  ],
  [
    'a detail that is text',
    [409, { code: 'INVALID', detail: 'not in a state to quarantine' }],
    /not in a state to quarantine/
  ]
]

test('F-S8-007: [P] a refusal is printed as a sentence, whatever its body carries', async () => {
  for (const [what, refusal, sentence] of HOLED_REFUSALS) {
    const name = `the retire door refuses with ${what}`
    await drawing(name, async () => {
      const ui = await mountInventory([instance(ID_A)], undefined, { retire: () => refusal })
      assert.ok(quarantine(ui), 'the row offers Quarantine')
      await ui.press(quarantine(ui))
      assert.ok(ui.approveButton(ID_A), `${name}: the screen is still drawn`)
      assert.match(ui.notice() ?? '', sentence, name)
      assert.doesNotMatch(ui.notice() ?? '', /\[object Object\]/, name)
      await ui.unmount()
    })
    for (const cleanup of cleanups.splice(0)) await cleanup().catch(() => {})
  }
})
