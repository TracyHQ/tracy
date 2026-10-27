/**
 * The two Add site wizards refuse in words, with a next step (#796).
 *
 * S4-F002: the create wizard printed the machine code for every refusal it had no sentence for,
 * the session ending mid-wizard among them. S4-F003: the import wizard answered five named refusals
 * with "Something went wrong. Try again."
 *
 * `createSite` runs for real against a replaced `fetch`. The import wizard is the REAL component,
 * bundled by esbuild and mounted with React into jsdom, driven by DOM events from the address field
 * to the Start button. The create wizard's refusal line is mounted on its own (`refusal.tsx`): the
 * whole wizard needs dsh's sidebar services, which jsdom does not have.
 *
 * What these tests cannot show: a real session expiring, the real `/login` page in a second tab, or
 * how the line wraps in the panel.
 *
 *   node --test packages/site/tracy-add-site/test/error-next-step.test.mjs
 *
 * `TRACY_TEST_DEPS_ROOT`: where esbuild, jsdom and the npm packages are resolved from when this
 * file runs from a copy of the tree with no install of its own (the red-before-fix run against the
 * base sources). The sources under test always come from the tree this file stands in.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createRefusalGuidance, createRefusalTitle } from '../src/client/create-step-model.mjs'

import { POLL_MS } from '../src/client/import-watch.mjs'

const PACKAGE = 'packages/site/tracy-add-site'
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const depsRoot = process.env.TRACY_TEST_DEPS_ROOT || repo
const require = createRequire(path.join(depsRoot, PACKAGE, 'package.json'))

/** jsdom, from a workspace member that declares it. A tree without it fails here, by name. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(depsRoot, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error(`jsdom is not installed under ${homes.join(' or ')}; run pnpm install`)
}

/**
 * `@tracy/core/<door>` resolved to THIS tree's sources through the package's own `exports`, so a
 * copy of the tree is tested against its own core and never against the install's.
 */
const coreFromThisTree = {
  name: 'core-from-this-tree',
  setup(build) {
    const home = path.join(repo, 'packages/core/tracy-core')
    const doors = JSON.parse(readFileSync(path.join(home, 'package.json'), 'utf8')).exports
    build.onResolve({ filter: /^@tracy\/core(\/.*)?$/ }, (args) => {
      const door = `.${args.path.slice('@tracy/core'.length)}`
      if (typeof doors[door] !== 'string') return { errors: [{ text: `@tracy/core has no door ${door}` }] }
      return { path: path.join(home, doors[door]) }
    })
  }
}

/** Bundle `contents` (resolved from this package's client sources) and load it. */
async function bundle(name, contents) {
  const outfile = path.join(outDir, `${name}.cjs`)
  await require('esbuild').build({
    stdin: { contents, resolveDir: path.join(repo, PACKAGE, 'src', 'client'), loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    plugins: [coreFromThisTree],
    nodePaths: [
      path.join(depsRoot, PACKAGE, 'node_modules'),
      path.join(depsRoot, 'packages/core/tracy-core/node_modules')
    ],
    outfile,
    logLevel: 'silent'
  })
  return require(outfile)
}

let outDir = ''
/** @type {any} */
let dom
const realFetch = globalThis.fetch
const realSetTimeout = globalThis.setTimeout

function browser(url) {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'KeyboardEvent',
    'MouseEvent',
    'Event',
    'DocumentFragment',
    'MutationObserver',
    'getComputedStyle',
    'localStorage',
    'sessionStorage',
    'location'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  // What Radix asks of a browser that jsdom does not have.
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = window.ResizeObserver = Observer
  globalThis.PointerEvent = window.PointerEvent = window.MouseEvent
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  // No `act`: React's async `act` waits on a MessageChannel it never closes when it runs from a
  // bundle, and one open port per call keeps this process alive after the last test. Updates are
  // scheduled the ordinary way (`setImmediate` under Node) and `settle` waits for them.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'error-next-step-'))
}

after(() => {
  globalThis.fetch = realFetch
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const mounted = []

// Advance the import debounce and polling explicitly; settling React keeps its real timer queue.
beforeEach(() => mock.timers.enable({ apis: ['setInterval', 'setTimeout'] }))

/** Let pending promises, renders and effects run: a few turns of the timer queue. */
async function settle() {
  for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => realSetTimeout(resolve, 0))
}

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    await settle()
    host.remove()
  }
  document.body.replaceChildren()
  globalThis.fetch = realFetch
  // After the unmounts: their cleanups clear intervals the fake clock owns.
  mock.timers.reset()
})

async function mount(lib, element) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  root.render(element)
  await settle()
  return { root, host }
}

/** The one button whose text or accessible name is exactly `name`. */
function button(name) {
  const found = [...document.querySelectorAll('button')].filter(
    (b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name
  )
  assert.equal(found.length, 1, `expected one "${name}" button, found ${found.length}`)
  return found[0]
}
async function press(name) {
  if (name === t('import_start') && document.querySelector('[data-import-page="details"] input')) {
    await press(t('wizard_continue'))
  }
  const target = typeof name === 'string' ? button(name) : name
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await settle()
}
/** Type into a React-controlled input the way a browser does. */
async function type(input, value) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  await settle()
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const notJson = (status) => new Response('<html>Bad Gateway</html>', { status })

/** Replace `fetch` with a table of `"METHOD /path" → () => Response`, recording every call. */
function answer(table) {
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), window.location.origin)
    const key = `${(init.method ?? 'GET').toUpperCase()} ${url.pathname}`
    calls.push({ key, body: init.body ?? null })
    const route = table[key]
    if (!route) return json(404, { code: 'NOT_FOUND' })
    return route({ url, init })
  }
  return calls
}

/** @type {any} */
let lib
/** The refusal components, or `null` on a tree that has none (the base sources). */
/** @type {any} */
let refusal = null

before(async () => {
  browser('http://tracy.test/new/')
  lib = await bundle(
    'wizards',
    `
      export { createElement } from 'react'
      export { createRoot } from 'react-dom/client'
      export { ImportWizard } from './import-wizard'
      export { failedRunDetail, UNANSWERED_START_MS } from './import'
      export { createSite, OPENING_MS, openingId, openingUsed, started, wizardOpened, wizardStep } from './create'
      export { en } from './strings'
    `
  )
  try {
    refusal = await bundle('refusal', `export * from './refusal'`)
  } catch {
    refusal = null
  }
})

/** The plugin's own English, `{name}` filled; a key the table lacks reads as `⟦key⟧`. */
const t = (key, params) =>
  Object.hasOwn(lib.en, key)
    ? lib.en[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))
    : `⟦${key}⟧`

/** Machine codes and internal words that must never be on screen. */
const RAW =
  /NOT_SIGNED_IN|SEAT_BOOK_UNREACHABLE|NO_VIEWING_SESSION|INVALID_REQUEST|UNSUPPORTED_PLATFORM|CREATE_PENDING|MADE_UP_CODE|IDEMPOTENCY_CONFLICT|CLAIM_UNREADABLE|START_UNREADABLE|HTTP_\d|NETWORK|FLEET_|seat book|⟦|\{code\}/

/** The sign-in action: a link to tracy-web's own door that opens beside the wizard, not over it. */
function signInLinks(root = document) {
  return [...root.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/login')
}

// ── S4-F002: the create door ────────────────────────────────────────────────────────────────────

const create = (route) => {
  const calls = answer({ 'POST /api/sites': route })
  return lib.createSite('fixture', 'wordpress', undefined, 'build-1').then((outcome) => ({ outcome, calls }))
}

// Usage (plan tasks/todo-do-dung-that.md U4): an opening of the wizard is told once, and its Create carries the
// same id; neither waits on the other or says anything when tracy-web refuses.
test('the wizard tells tracy-web it opened, and Create carries the same wizard id; a refusal is silent', async () => {
  const calls = answer({
    'POST /api/sites/wizard': () => json(429, { code: 'RATE_LIMITED' }),
    'POST /api/sites': () => json(202, { siteKey: 'fixture.tracy.test', jobId: 'job-1' })
  })
  assert.equal(lib.wizardOpened('wiz-1', 'site'), undefined, 'not awaited')
  await new Promise((r) => realSetTimeout(r, 0))
  const outcome = await lib.createSite(
    'fixture',
    'wordpress',
    undefined,
    'build-1',
    undefined,
    undefined,
    'wiz-1'
  )
  assert.equal(lib.started(outcome), true)
  assert.deepEqual(
    calls.map((c) => [c.key, JSON.parse(c.body)]),
    [
      ['POST /api/sites/wizard', { wizardId: 'wiz-1', where: 'site' }],
      ['POST /api/sites', { label: 'fixture', platform: 'wordpress', buildId: 'build-1', wizardId: 'wiz-1' }]
    ]
  )
  answer({
    'POST /api/sites/wizard': () => {
      throw new TypeError('fetch failed')
    }
  })
  assert.doesNotThrow(() => lib.wizardOpened('wiz-2', 'new'))
  await new Promise((r) => realSetTimeout(r, 0))
})

// Usage: each page of an opening is told with the opening's id; like the opening, never awaited and silent on refusal.
test('the wizard tells tracy-web which page an opening reached; a refusal or a thrown fetch is silent', async () => {
  const calls = answer({ 'POST /api/sites/wizard': () => json(400, { code: 'INVALID_WIZARD_STEP' }) })
  assert.equal(lib.wizardStep('wiz-1', 'create:design'), undefined, 'not awaited')
  await new Promise((r) => realSetTimeout(r, 0))
  assert.deepEqual(
    calls.map((c) => [c.key, JSON.parse(c.body)]),
    [['POST /api/sites/wizard', { wizardId: 'wiz-1', step: 'create:design' }]]
  )
  answer({
    'POST /api/sites/wizard': () => {
      throw new TypeError('fetch failed')
    }
  })
  assert.doesNotThrow(() => lib.wizardStep('wiz-2', 'import:address'))
  await new Promise((r) => realSetTimeout(r, 0))
})

test('one opening of the wizard keeps one id across mounts in the same tab; a started Create or half an hour ends it', () => {
  const kept = new Map()
  const store = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, String(v)),
    removeItem: (k) => kept.delete(k)
  }
  const first = lib.openingId(store, 1_000)
  // Measured 17/10 on the stand: the form mounted twice, 12 ms apart.
  assert.equal(lib.openingId(store, 1_012), first)
  const later = lib.openingId(store, 1_000 + lib.OPENING_MS)
  assert.notEqual(later, first, 'half an hour later is another opening')
  lib.openingUsed(store)
  assert.notEqual(lib.openingId(store, 1_000 + lib.OPENING_MS + 1), later, 'a Create ended the opening')
  assert.notEqual(lib.openingId(null, 1), lib.openingId(null, 1), 'no storage: one id per mount')
  const refusing = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    }
  }
  assert.match(lib.openingId(refusing, 1), /^[0-9a-f-]{36}$/)
})

test('S4-F002: a session that ended is its own refusal, not "other"', async () => {
  for (const route of [
    () => json(401, { code: 'NOT_SIGNED_IN' }),
    () => notJson(401),
    () => json(401, null)
  ]) {
    const { outcome } = await create(route)
    assert.equal(lib.started(outcome), false)
    assert.equal(outcome.refusal, 'signed_out')
  }
})

test('S4-F002: a press still being answered is "pending", and nothing unreadable is ever a started build', async () => {
  const pending = await create(() =>
    json(202, { code: 'CREATE_PENDING', buildId: 'build-1', siteKey: 'fixture.tracy.test' })
  )
  assert.equal(pending.outcome.refusal, 'pending')
  for (const route of [
    () => json(200, {}),
    () => json(200, null),
    () => json(200, []),
    () => json(200, 'ok'),
    () => notJson(200),
    () => new Response('', { status: 200 }),
    () => json(200, { siteKey: 'fixture.tracy.test' }),
    () => json(200, { jobId: 'job-1' }),
    () => json(200, { siteKey: 7, jobId: {} }),
    () => {
      throw new TypeError('fetch failed')
    }
  ]) {
    const { outcome } = await create(route)
    assert.equal(lib.started(outcome), false, JSON.stringify(outcome))
    assert.equal(outcome.refusal, 'other')
  }
  const fine = await create(() => json(202, { siteKey: 'fixture.tracy.test', jobId: 'job-1' }))
  assert.deepEqual(fine.outcome, { siteKey: 'fixture.tracy.test', jobId: 'job-1' })
})

test('S4-F002: HOST_UPDATING is the deploy’s own answer only on the 503 the host sends it with; on any other status it decides nothing', async () => {
  for (const [status, kind] of [
    [503, 'host_updating'],
    [500, 'other'],
    [502, 'other'],
    [504, 'other'],
    [400, 'other'],
    [409, 'other']
  ]) {
    const { outcome } = await create(() => json(status, { code: 'HOST_UPDATING' }))
    assert.equal(lib.started(outcome), false)
    assert.equal(outcome.refusal, kind, `${status}`)
  }
})

test('S4-F002: the refusals the door already named keep their own kind', async () => {
  for (const [body, status, kind] of [
    [{ code: 'TAKEN' }, 409, 'taken'],
    [{ code: 'HOST_UPDATING' }, 503, 'host_updating'],
    [{ code: 'INVALID_LABEL', reason: 'shape' }, 400, 'shape'],
    [{ code: 'INVALID_LABEL', reason: 'reserved' }, 400, 'reserved'],
    [{ code: 'INVALID_LABEL', reason: 'looks_imported' }, 400, 'looks_imported'],
    [{ code: 'INVALID_LABEL', reason: 'made-up' }, 400, 'other'],
    [{ code: 'MADE_UP_CODE' }, 500, 'other'],
    // A failed door is the unknown outcome whatever its body names: the site may have been made.
    [{ code: 'NOT_SIGNED_IN' }, 500, 'other'],
    [{ code: 'TAKEN' }, 502, 'other'],
    [{ code: 'IDEMPOTENCY_CONFLICT' }, 503, 'other'],
    [{ code: 'UNSUPPORTED_PLATFORM' }, 500, 'other']
  ]) {
    const { outcome } = await create(() => json(status, body))
    assert.equal(outcome.refusal, kind)
  }
})

test('S4-F002: a code on a status the create door does not send it with decides nothing; the status does', async () => {
  for (const [status, body, kind] of [
    // Not the ended session: no sign-in is offered for these.
    [404, { code: 'NOT_SIGNED_IN' }, 'other'],
    [400, { code: 'NOT_SIGNED_IN' }, 'other'],
    [409, { code: 'NOT_SIGNED_IN' }, 'other'],
    // A 401 is the ended session whatever it names.
    [401, { code: 'TAKEN' }, 'signed_out'],
    [401, { code: 'INVALID_LABEL', reason: 'shape' }, 'signed_out'],
    [401, { code: 'UNSUPPORTED_PLATFORM' }, 'signed_out'],
    // "Taken", "conflict", the label reasons and "unsupported" only on their own status.
    [400, { code: 'TAKEN' }, 'other'],
    [404, { code: 'TAKEN' }, 'other'],
    [400, { code: 'IDEMPOTENCY_CONFLICT' }, 'other'],
    [409, { code: 'INVALID_LABEL', reason: 'shape' }, 'other'],
    [404, { code: 'INVALID_LABEL', reason: 'reserved' }, 'other'],
    [409, { code: 'UNSUPPORTED_PLATFORM' }, 'other'],
    [404, { code: 'UNKNOWN_DESIGN' }, 'other'],
    // A success status naming "pending" is not the 202 the door sends it with.
    [200, { code: 'CREATE_PENDING' }, 'other'],
    [201, { code: 'CREATE_PENDING' }, 'other']
  ]) {
    const { outcome } = await create(() => json(status, body))
    assert.equal(lib.started(outcome), false, `${status} ${body.code}`)
    assert.equal(outcome.refusal, kind, `${status} ${body.code}`)
    assert.equal(outcome.template, undefined)
  }
})

test('S4-F002: only the door’s own 400 for a design it cannot build drops the design and asks again', async () => {
  for (const [status, body, asks] of [
    [400, { code: 'UNSUPPORTED_DESIGN' }, 2],
    [400, { code: 'UNKNOWN_DESIGN' }, 2],
    [400, { code: 'UNSUPPORTED_PLATFORM', template: 'ja-x' }, 2],
    [409, { code: 'UNSUPPORTED_DESIGN' }, 1],
    [404, { code: 'UNKNOWN_DESIGN' }, 1],
    [500, { code: 'UNSUPPORTED_DESIGN' }, 1],
    [409, { code: 'TAKEN', template: 'ja-x' }, 1],
    [502, { code: 'MADE_UP_CODE', template: 'ja-x' }, 1]
  ]) {
    const calls = answer({ 'POST /api/sites': () => json(status, body) })
    const outcome = await lib.createSite('fixture', 'wordpress', 'ja-x', 'build-1')
    assert.equal(lib.started(outcome), false)
    assert.equal(calls.length, asks, `${status} ${body.code}`)
  }
})

test('S4-F002: a refusal that pressing again cannot change is not the unknown outcome', async () => {
  for (const [body, status, kind] of [
    [{ code: 'UNSUPPORTED_PLATFORM' }, 400, 'unsupported'],
    [{ code: 'UNSUPPORTED_QUICKSTART' }, 400, 'unsupported'],
    [{ code: 'UNSUPPORTED_DESIGN' }, 400, 'unsupported'],
    [{ code: 'UNKNOWN_DESIGN' }, 400, 'unsupported'],
    [{ code: 'DESIGN_SYSTEMS_OFF', design: 'x' }, 400, 'unsupported'],
    [{ code: 'IDEMPOTENCY_CONFLICT', buildId: 'build-1', siteKey: null }, 409, 'conflict']
  ]) {
    const { outcome, calls } = await create(() => json(status, body))
    assert.equal(outcome.refusal, kind, body.code)
    assert.equal(calls.length, 1, 'no design was sent, so nothing is asked a second time')
  }
  // Neither sentence tells the reader to press the same thing again unchanged.
  assert.match(lib.en.error_unsupported ?? '', /Choose another/)
  assert.match(lib.en.error_conflict ?? '', /My Sites/)
})

test('S4-F002: the sentence for an unknown outcome never says that nothing was created', async () => {
  // A lost answer, an unreadable 200 and a 5xx can each follow a site that was made.
  for (const route of [
    () => {
      throw new TypeError('fetch failed')
    },
    () => notJson(200),
    () => json(200, {}),
    () => json(502, { code: 'HOST_UNAVAILABLE' })
  ]) {
    const { outcome } = await create(route)
    assert.equal(outcome.refusal, 'other')
  }
  assert.doesNotMatch(lib.en.error_other, /nothing was created/i)
  assert.match(lib.en.error_other, /My Sites/)
})

test('S4-F002: every refusal has a sentence, and none of them shows a machine code', () => {
  for (const kind of [
    'shape',
    'reserved',
    'looks_imported',
    'taken',
    'host_updating',
    'signed_out',
    'pending',
    'unsupported',
    'conflict',
    'other'
  ]) {
    assert.ok(Object.hasOwn(lib.en, `error_${kind}`), `no sentence for the "${kind}" refusal`)
    assert.doesNotMatch(lib.en[`error_${kind}`], /\{code\}|[A-Z]{3,}_[A-Z_]+/, kind)
  }
})

test('S4-F002: on screen, a refusal is a sentence; the ended session comes with a sign-in action', async () => {
  assert.ok(refusal, 'the create wizard has no refusal line that can offer a sign-in action')
  for (const [kind, code] of [
    ['signed_out', 'NOT_SIGNED_IN'],
    ['pending', 'CREATE_PENDING'],
    ['other', 'MADE_UP_CODE'],
    ['other', 'NETWORK'],
    ['other', 'HTTP_502'],
    ['unsupported', 'UNSUPPORTED_PLATFORM'],
    ['conflict', 'IDEMPOTENCY_CONFLICT'],
    ['taken', 'TAKEN'],
    ['host_updating', 'HOST_UPDATING']
  ]) {
    const { root, host } = await mount(
      lib,
      lib.createElement(refusal.CreateRefusalNote, { refused: { refusal: kind, code }, t })
    )
    assert.ok(host.textContent.startsWith(t(`error_${kind}`)), `${kind}: ${host.textContent}`)
    assert.doesNotMatch(host.textContent, RAW, `${kind}/${code}`)
    const links = signInLinks(host)
    assert.equal(links.length, kind === 'signed_out' ? 1 : 0, `${kind}: sign-in links`)
    for (const link of links) {
      // A new tab: the name, the brief and everything else typed in the wizard stay where they are.
      assert.equal(link.getAttribute('target'), '_blank')
      assert.match(link.getAttribute('rel') ?? '', /noopener/)
      assert.equal(link.textContent, t('sign_in_new_tab'))
    }
    root.unmount()
    mounted.splice(0)
    host.remove()
    await settle()
  }
})

// ── S4-F003: the import wizard ──────────────────────────────────────────────────────────────────

const CLAIM = 'POST /api/sites'
const START = 'POST /api/tracy-add-site/start'
const STATUS = 'POST /api/tracy-add-site/status'
const PROVISION = 'POST /api/sites/old-shop.example/provision'
/** One poll period of the read (`import-watch.mjs`) on the fake clock, then its answers settle. */
async function onePoll() {
  mock.timers.tick(POLL_MS)
  await settle()
}
const lost = () => {
  throw new TypeError('fetch failed')
}
/** An answer that arrives when the test says so. */
function later() {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  return { route: (make) => () => gate.then(make), release: () => release() }
}

/**
 * The wizard taken from the address to the filled connect step, with `table` answering its doors.
 * A table that names no status door gets one that knows no run of the site (`NO_RUN`): the wizard
 * asks it before every start, and a door that is not there is an answer nobody can read.
 */
async function fillImport(table, props = {}, platform = 'joomla') {
  // These claim/start safety tests begin with a fresh panel, without its optional resume pointer.
  localStorage.removeItem('tracy.import.active')
  const calls = answer({ [STATUS]: statusDoor({ bySite: NO_RUN }), ...table })
  const provisioned = []
  const { root } = await mount(
    lib,
    lib.createElement(lib.ImportWizard, { t, onProvisioned: (input) => provisioned.push(input), ...props })
  )
  await type(document.querySelector('input[placeholder="yoursite.com"]'), 'old-shop.example')
  mock.timers.tick(300)
  await settle()
  mock.timers.tick(1200)
  await settle()
  await press(t('import_next'))
  await press(platform === 'wordpress' ? 'WordPress' : 'Joomla')
  await press(t('wizard_continue'))
  await press(t('wizard_continue'))
  const fields = [...document.querySelectorAll('input')].filter(
    (i) => i.type !== 'radio' && i.type !== 'checkbox'
  )
  const username = fields.find((i) => i.getAttribute('autocomplete') === 'username') ?? fields[1]
  const password = fields.find((i) => i.type === 'password')
  assert.ok(username && password, 'the connect step has a username and a password field')
  await type(username, 'admin')
  await type(password, 'correct horse')
  await press(t('wizard_continue'))
  const count = (key) => calls.filter((c) => c.key === key).length
  const deletes = () => calls.filter((c) => c.key.startsWith('DELETE ')).map((c) => c.key)
  return { calls, count, deletes, provisioned, username, password, root }
}

/** …and on to one press of Start. */
async function startImport(table) {
  const wizard = await fillImport(table)
  await press(t('import_start'))
  return wizard
}

const shownError = () =>
  [...document.querySelectorAll('[role="alert"], [data-import-problem] > [role="status"]')].map((n) =>
    n.textContent.trim()
  )

test('D1: a newly opened wizard retries a failed read only when the claim has no build', async () => {
  const wizard = await startImport({
    [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true, retryable: true }),
    [START]: () => json(202, { runId: 'retry-2' }),
    [STATUS]: statusDoor({ bySite: () => json(200, FAILED('old-1')) })
  })
  assert.equal(wizard.count(START), 1, 'the failed claim prevented another import')
  const started = wizard.calls.find((call) => call.key === START)
  assert.equal(JSON.parse(started.body).retryOf, 'old-1', 'retry names the failed run it replaces')
  assert.deepEqual(wizard.deletes(), [], 'a retry must not delete a claim another tab is using')
  assert.deepEqual(wizard.provisioned, [])
})

test('D1: after a failed Joomla read, correcting the platform to WordPress permits retry', async () => {
  const wizard = await fillImport(
    {
      [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true, retryable: true }),
      [START]: () => json(202, { runId: 'wordpress-retry' }),
      [STATUS]: statusDoor({ bySite: () => json(200, FAILED('failed-joomla')) })
    },
    {},
    'wordpress'
  )
  await press(t('import_start'))
  assert.equal(wizard.count(START), 1, 'the earlier platform choice blocked retry')
  const started = JSON.parse(wizard.calls.find((call) => call.key === START).body)
  assert.equal(started.platform, 'wordpress')
  assert.equal(started.retryOf, 'failed-joomla')
  assert.deepEqual(wizard.deletes(), [])
  assert.deepEqual(wizard.provisioned, [])
})

for (const [name, bySite] of [
  ['no known run', () => NO_RUN()],
  ['a successful read', () => json(200, DONE('old-1'))],
  ['a failed read of an unsupported platform', () => json(200, { ...FAILED('old-1'), platform: 'unknown' })],
  ['a malformed failed read', () => json(200, { ...FAILED('old-1'), detail: null })],
  ['an unreadable status', () => json(502, { code: 'INTERNAL_ERROR' })]
]) {
  test(`D1: a no-build claim with ${name} never authorizes a second start`, async () => {
    const wizard = await startImport({
      [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true, retryable: true }),
      [START]: () => json(202, { runId: 'must-not-start' }),
      [STATUS]: statusDoor({ bySite })
    })
    assert.equal(wizard.count(START), 0)
    assert.deepEqual(wizard.deletes(), [])
    assert.deepEqual(wizard.provisioned, [])
  })
}
test('manifest retry reloads extension information without starting another import', async () => {
  const extension = 'POST /api/tracy-add-site/extension'
  localStorage.setItem(
    'tracy.import.active',
    JSON.stringify({ siteKey: 'old-shop.example', platform: 'joomla', runId: 'failed-manifest' })
  )
  const calls = answer({
    [STATUS]: () =>
      json(
        200,
        run({
          id: 'failed-manifest',
          state: 'error',
          step: 'signing_in',
          error: 'EXTENSION_MANIFEST_UNAVAILABLE'
        })
      ),
    [extension]: () => json(200, { version: '0.24.49', packageUrl: 'https://downloads.example/plugin.zip' })
  })
  await mount(lib, lib.createElement(lib.ImportWizard, { t, onProvisioned: () => {} }))
  await settle()
  assert.ok(document.querySelector('[data-import-problem="p31"]'))
  const count = (key) => calls.filter((call) => call.key === key).length
  const manifests = count(extension)
  await press(t('import_problem_p31_action_0'))
  assert.equal(count(extension), manifests + 1)
  assert.equal(count(START), 0)
  assert.equal(count(CLAIM), 0)
  assert.equal(document.querySelector('[data-import-problem="p31"]'), null)
  assert.ok(document.querySelector('input[type="password"]'))
})
const importSubmitAction = () =>
  button(t(document.querySelector('[data-import-page="details"]') ? 'wizard_continue' : 'import_start'))
const buttons = (name) =>
  [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === name)
/** Compare the approved sentence as visible text; links and emphasis remain DOM semantics. */
function visibleText(markup) {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template.content.textContent
}
const approved = (key) =>
  visibleText(
    t(
      {
        import_error_signed_out: 'import_problem_p44_what',
        import_error_claim_taken: 'import_problem_pf1_taken_what',
        import_error_other: 'import_problem_p45_server_what',
        import_error_invalid_credential_joomla: 'import_problem_p6_what',
        import_error_blocked_by_cloudflare: 'import_problem_p16_what',
        import_error_blocked_by_firewall: 'import_firewall_unknown',
        import_error_run_lost: 'import_problem_p39_what',
        import_error_unreachable: 'import_problem_p20_what',
        import_error_host_updating: 'import_problem_p40_what',
        import_error_already_provisioned: 'import_problem_pf1_mine_what',
        import_unconfirmed: 'import_problem_p41_what'
      }[key] ?? key,
      { domain: 'old-shop.example' }
    )
  )
const sentence = (key) => (Object.hasOwn(lib.en, key) ? lib.en[key] : null)

/** A run as the status door tells it. */
const run = (over = {}) => ({
  id: 'found-1',
  siteKey: 'old-shop.example',
  platform: 'joomla',
  state: 'running',
  step: 'reading_content',
  detail: {},
  ...over
})
const KEYS = { webrootKey: 'w/1', dbKey: 'd/1', liveSite: 'https://old-shop.example' }
/** The status door: asked by site key (a reconcile) or by run id (the watch). */
const statusDoor =
  ({ bySite, byRun = () => json(404, { code: 'RUN_UNKNOWN' }) }) =>
  (request) =>
    JSON.parse(request.init.body).runId ? byRun(request) : bySite(request)
const siteAsks = (calls) => calls.filter((c) => c.key === STATUS && JSON.parse(c.body).siteKey)
const NO_RUN = () => json(404, { code: 'RUN_UNKNOWN' })
/** A door that gives its answers in order, one per ask, and the last one from then on. */
const inTurn = (...routes) => {
  let asked = 0
  return (request) => routes[Math.min(asked++, routes.length - 1)](request)
}
/** Unmount every wizard on the page, the way closing the panel does. */
async function closeWizards() {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    host.remove()
  }
  await settle()
}

/**
 * The state after a start nobody could confirm: the claim stands, one start was sent and no other
 * can be, and the only action is a status check that does not say "nothing happened". `asks`: the
 * look before the start, and one for every check since.
 */
function assertUnresolved(wizard, { asks = 2, starts = 1 } = {}) {
  assert.deepEqual(wizard.deletes(), [], 'a claim was released on an outcome nobody confirmed')
  assert.equal(wizard.count(START), starts, 'another start was sent')
  assert.deepEqual(wizard.provisioned, [])
  const asked = siteAsks(wizard.calls)
  assert.equal(asked.length, asks, 'status checks by site key')
  for (const call of asked) assert.deepEqual(JSON.parse(call.body), { siteKey: 'old-shop.example' })
  assert.equal(buttons(t('import_start')).length, 0, 'Start is on screen while the outcome is unknown')
  assert.ok(sentence('import_unconfirmed'), 'no sentence for an unconfirmed start')
  assert.deepEqual(shownError(), [approved('import_unconfirmed')])
  assert.ok(
    !document.body.textContent.includes(t('import_unconfirmed_still')),
    'the approved screen has no extra status note'
  )
  assert.doesNotMatch(document.body.textContent, /nothing (was|has been) (started|changed|created)/i)
  assert.equal(button(t('import_check_status')).disabled, false)
  assert.doesNotMatch(document.body.textContent, RAW)
}

/** The 4xx refusals the claim door names: said in words, with the form left as it was. */
for (const [code, key, status] of [
  ['NOT_SIGNED_IN', 'import_error_signed_out', 401],
  ['INVALID_SITE_KEY', 'import_error_invalid_site_key', 400],
  ['TAKEN', 'import_error_claim_taken', 409],
  ['INVALID_REQUEST', 'import_error_invalid_request', 400],
  ['UNSUPPORTED_PLATFORM', 'import_error_unsupported_platform', 400]
]) {
  test(`S4-F003: ${code} when the import is claimed says its own sentence`, async () => {
    const wizard = await startImport({ [CLAIM]: () => json(status, { code }) })
    assert.equal(wizard.count(CLAIM), 1)
    assert.equal(wizard.count(START), 0, 'a refused claim never starts a read')
    assert.deepEqual(wizard.deletes(), [])
    assert.deepEqual(wizard.provisioned, [])
    const [shown] = shownError()
    assert.ok(shown, 'no error on screen')
    assert.notEqual(shown, approved('import_error_other'), 'the generic line')
    assert.ok(shown.startsWith(approved(key)), shown)
    assert.doesNotMatch(document.body.textContent, RAW)
    assert.equal(signInLinks().length, code === 'NOT_SIGNED_IN' ? 1 : 0)
    // A sign-in refusal stands alone; returning from its new tab restores the same form values.
    assert.equal(wizard.username.value, 'admin')
    if (code === 'NOT_SIGNED_IN') {
      assert.equal(buttons(t('import_start')).length, 0)
      assert.equal(document.querySelector('input[type="password"]'), null)
      window.dispatchEvent(new window.Event('focus'))
      await settle()
      assert.equal(document.querySelector('input[type="password"]').value, 'correct horse')
    }
    assert.equal(importSubmitAction().disabled, false)
  })
}

test('S4-F003: every refusal the import shows has a sentence of its own, and a sign-in action only for the ended session', async () => {
  assert.ok(refusal, 'the import wizard has no refusal text that can offer a sign-in action')
  for (const [code, key] of [
    ['NOT_SIGNED_IN', 'import_error_signed_out'],
    ['HTTP_401', 'import_error_signed_out'],
    ['SEAT_BOOK_UNREACHABLE', 'import_error_access_check'],
    ['NO_VIEWING_SESSION', 'import_error_no_access'],
    ['INVALID_REQUEST', 'import_error_invalid_request'],
    ['UNSUPPORTED_PLATFORM', 'import_error_unsupported_platform'],
    ['MADE_UP_CODE', 'import_error_other'],
    ['NETWORK', 'import_error_other']
  ]) {
    const { root, host } = await mount(lib, lib.createElement(refusal.ImportErrorText, { code, t }))
    assert.ok(host.textContent.startsWith(t(key)), `${code}: ${host.textContent}`)
    assert.doesNotMatch(host.textContent, RAW, code)
    assert.equal(signInLinks(host).length, key === 'import_error_signed_out' ? 1 : 0, code)
    root.unmount()
    mounted.splice(0)
    host.remove()
    await settle()
  }
})

// The claim door: only a 4xx is a refusal. No answer, a 5xx (whatever it names) and a success that
// does not name the site establish nothing — no read starts, and nothing is released.
for (const [name, route] of [
  ['a 500 with a code nobody named', () => json(500, { code: 'MADE_UP_CODE' })],
  ['a 500 naming NOT_SIGNED_IN', () => json(500, { code: 'NOT_SIGNED_IN' })],
  ['a 502 naming SEAT_BOOK_UNREACHABLE', () => json(502, { code: 'SEAT_BOOK_UNREACHABLE' })],
  ['a 503 naming TAKEN', () => json(503, { code: 'TAKEN' })],
  ['a gateway page', () => notJson(502)],
  ['an empty 500', () => new Response('', { status: 500 })],
  ['a network failure', lost],
  ['an empty object', () => json(200, {})],
  ['a 201 with an empty object', () => json(201, {})],
  ['a 200 null', () => json(200, null)],
  ['a list', () => json(200, ['old-shop.example'])],
  ['a body that is not JSON', () => notJson(200)],
  ['no body', () => new Response('', { status: 201 })],
  ['a site key that is not text', () => json(200, { siteKey: 7 })],
  ['an empty site key', () => json(200, { siteKey: '  ' })],
  ['another site', () => json(200, { siteKey: 'someone-else.example' })],
  ['another site on a 201', () => json(201, { siteKey: 'old-shop.example.evil.example' })],
  ['the site in another spelling', () => json(200, { siteKey: 'https://OLD-SHOP.example/' })],
  ['the right site on a 202', () => json(202, { siteKey: 'old-shop.example' })],
  ['the right site on a 206', () => json(206, { siteKey: 'old-shop.example' })]
]) {
  test(`S4-F003: a claim answered with ${name} is not a claim: no read starts and nothing is released`, async () => {
    const wizard = await startImport({ [CLAIM]: route, [START]: () => json(202, { runId: 'run-1' }) })
    assert.equal(wizard.count(START), 0, 'the admin details were sent on')
    assert.deepEqual(wizard.provisioned, [])
    assert.deepEqual(shownError(), [
      name === 'a network failure' ? t('import_problem_p45_what') : approved('import_error_other')
    ])
    assert.equal(signInLinks().length, 0)
    // This answer did not establish whose row stands under the address (an earlier claim, an
    // import running in another tab), so nothing is released on its strength.
    assert.deepEqual(wizard.deletes(), [], 'a claim nobody confirmed was released')
    assert.equal(wizard.username.value, 'admin')
    // The approved standalone failure offers its own retry, without showing credential fields.
    assert.equal(buttons(t('import_start')).length, 0)
    assert.equal(document.querySelector('input[type="password"]'), null)
    assert.equal(button(t('import_retry')).disabled, false)
    assert.doesNotMatch(document.body.textContent, RAW)
  })
}

test('S4-F003: a confirmed claim sends the admin details under the key that was asked for', async () => {
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: () => json(202, { runId: 'run-1' })
  })
  const [start] = wizard.calls.filter((c) => c.key === START)
  assert.ok(start, 'no read started')
  const sent = JSON.parse(start.body)
  assert.equal(sent.siteKey, 'old-shop.example')
  assert.equal(sent.platform, 'joomla')
  assert.equal(sent.password, 'correct horse')
  assert.deepEqual(shownError(), [])
  assert.deepEqual(wizard.deletes(), [])
  // One look before the start (what the host knows of the site), and none after a confirmed one.
  assert.equal(siteAsks(wizard.calls).length, 1, 'a confirmed start needs no reconciling')
  const order = wizard.calls.map((c) => c.key).filter((key) => [CLAIM, STATUS, START].includes(key))
  assert.deepEqual(
    order,
    [CLAIM, STATUS, START],
    'the site is looked at after the claim and before the start'
  )
})

// The start door refuses BEFORE a read exists only in the exact answers `handleStart` gives at a
// 4xx. Even then no claim is released: the release door removes the site row without looking at
// reads, and nothing asked before the DELETE says what stands when it lands.
for (const [status, code, key] of [
  [401, 'NOT_SIGNED_IN', 'import_error_signed_out'],
  [400, 'INVALID_REQUEST', 'import_error_invalid_request']
]) {
  test(`S4-F003: a start refused ${status} ${code} says so, and releases nothing`, async () => {
    const wizard = await startImport({
      [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
      [START]: () => json(status, { code })
    })
    assert.equal(wizard.count(START), 1)
    assert.deepEqual(wizard.provisioned, [])
    assert.ok(shownError()[0]?.startsWith(approved(key)), shownError()[0])
    // The host knows no run of the site (the table's default), and the claim was this press's
    // own: the most that can be known from a browser, and still not a reason to remove the row.
    assert.deepEqual(wizard.deletes(), [])
    assert.equal(siteAsks(wizard.calls).length, 1, 'only the look before the start')
    const links = signInLinks()
    assert.equal(links.length, code === 'NOT_SIGNED_IN' ? 1 : 0)
    for (const link of links) assert.equal(link.getAttribute('target'), '_blank')
    // A sign-in refusal restores retained credentials when the person returns from its new tab.
    assert.equal(wizard.username.value, 'admin')
    if (code === 'NOT_SIGNED_IN') {
      assert.equal(buttons(t('import_start')).length, 0)
      assert.equal(document.querySelector('input[type="password"]'), null)
      window.dispatchEvent(new window.Event('focus'))
      await settle()
      assert.equal(document.querySelector('input[type="password"]').value, 'correct horse')
    }
    assert.equal(importSubmitAction().disabled, false)
    assert.doesNotMatch(document.body.textContent, RAW)
  })
}

// Every other answer of the start door leaves the outcome unknown: the request may have opened a
// read whose answer was lost. The claim stands, no second start is possible, status is asked.
const FAILED_BODIES = [
  ['no body', (status) => new Response('', { status })],
  ['a gateway page', (status) => notJson(status)],
  ['an empty object', (status) => json(status, {})],
  ['a code nobody named', (status) => json(status, { code: 'MADE_UP_CODE' })],
  ['NOT_SIGNED_IN', (status) => json(status, { code: 'NOT_SIGNED_IN' })],
  ['RATE_LIMITED', (status) => json(status, { code: 'RATE_LIMITED' })],
  ['HOST_UPDATING', (status) => json(status, { code: 'HOST_UPDATING' })],
  ['INVALID_REQUEST', (status) => json(status, { code: 'INVALID_REQUEST' })]
]
const UNCONFIRMED_STARTS = [
  ['a request that got no answer', lost],
  ['a 202 with an empty object', () => json(202, {})],
  ['a 202 null', () => json(202, null)],
  ['a 202 list', () => json(202, [{ runId: 'run-1' }])],
  ['a 202 that is not JSON', () => notJson(202)],
  ['a 202 with no body', () => new Response('', { status: 202 })],
  ['a 202 whose run id is not text', () => json(202, { runId: 7 })],
  ['a 202 with an empty run id', () => json(202, { runId: '' })],
  ['a 202 with a blank run id', () => json(202, { runId: '   ' })],
  ['a run on a 200', () => json(200, { runId: 'run-1' })],
  ['a run on a 201', () => json(201, { runId: 'run-1' })],
  ['a 204', () => new Response(null, { status: 204 })],
  ...[500, 502, 503, 504].flatMap((status) =>
    FAILED_BODIES.map(([name, make]) => [`a ${status} with ${name}`, () => make(status)])
  ),
  ['a 401 with no body', () => notJson(401)],
  ['a 401 naming another code', () => json(401, { code: 'MADE_UP_CODE' })],
  ['a 400 naming NOT_SIGNED_IN', () => json(400, { code: 'NOT_SIGNED_IN' })],
  ['a 403 naming NOT_SIGNED_IN', () => json(403, { code: 'NOT_SIGNED_IN' })],
  ['a 404', () => json(404, { code: 'UNKNOWN_STEP' })],
  ['a 409 naming TAKEN', () => json(409, { code: 'TAKEN' })],
  ['a 429 naming RATE_LIMITED', () => json(429, { code: 'RATE_LIMITED' })]
]
for (const [name, route] of UNCONFIRMED_STARTS) {
  test(`S4-F003: a start answered with ${name} (claim 201) is unconfirmed: the claim stays, no second start, status is asked`, async () => {
    const wizard = await startImport({
      [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
      [START]: route,
      [STATUS]: statusDoor({ bySite: NO_RUN })
    })
    assertUnresolved(wizard)
    assert.equal(signInLinks().length, 0)
    // The passwords went out with the start; they are not kept on screen.
    assert.equal(document.querySelectorAll('input[type="password"]').length, 0)
  })
}

// What the status door may say about a start nobody confirmed. Only a run of exactly this site and
// platform, in a form the wizard can follow, is adopted; nothing else resolves anything.
const UNRESOLVED_STATUS = [
  ['RUN_UNKNOWN', () => json(404, { code: 'RUN_UNKNOWN' })],
  ['no answer', lost],
  ['a 500', () => json(500, { code: 'INTERNAL_ERROR' })],
  ['a 503 carrying a run', () => json(503, run())],
  ['a 401', () => json(401, { code: 'NOT_SIGNED_IN' })],
  ['a 200 that is not JSON', () => notJson(200)],
  ['a 200 with no body', () => new Response('', { status: 200 })],
  ['a 200 null', () => json(200, null)],
  ['a 200 list', () => json(200, [run()])],
  ['an empty object', () => json(200, {})],
  ['a run of another site', () => json(200, run({ siteKey: 'someone-else.example' }))],
  ['a run of the site in another spelling', () => json(200, run({ siteKey: 'OLD-SHOP.example' }))],
  ['a run on another platform', () => json(200, run({ platform: 'wordpress' }))],
  ['a run with no platform', () => json(200, run({ platform: undefined }))],
  ['a run with no id', () => json(200, run({ id: undefined }))],
  ['a run with a blank id', () => json(200, run({ id: '  ' }))],
  ['a run whose id is not text', () => json(200, run({ id: 7 }))],
  ['a run in a state the door never gives', () => json(200, run({ state: 'queued' }))],
  ['a run with no state', () => json(200, run({ state: undefined }))],
  ['a run at a step the door never gives', () => json(200, run({ step: 'made_up' }))],
  ['a run with no detail', () => json(200, run({ detail: undefined }))],
  ['a run whose detail is a list', () => json(200, run({ detail: [] }))],
  ['a run that failed', () => json(200, run({ state: 'error', error: 'invalid_credential' }))],
  ['a finished run with no result', () => json(200, run({ state: 'done', step: 'handing_over' }))],
  [
    'a finished run with a blank key',
    () => json(200, run({ state: 'done', step: 'handing_over', result: { ...KEYS, dbKey: ' ' } }))
  ],
  [
    'a finished run with a key that is not text',
    () => json(200, run({ state: 'done', step: 'handing_over', result: { ...KEYS, webrootKey: 7 } }))
  ],
  ['a finished run whose result is a list', () => json(200, run({ state: 'done', result: [KEYS] }))]
]
const WAITED_FOR = [
  'a run of another site',
  'a run on another platform',
  'a run that failed',
  'a finished run with no result',
  'a finished run with a blank key'
]
for (const [name, bySite] of UNRESOLVED_STATUS) {
  test(`S4-F003: status answering ${name} resolves nothing: no release, no start, no handover, and Check status asks again`, async () => {
    const wizard = await startImport({
      [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
      [START]: lost,
      [STATUS]: statusDoor({ bySite: inTurn(NO_RUN, bySite) }),
      [PROVISION]: () => json(202, { jobId: 'job-1' })
    })
    assertUnresolved(wizard)
    await press(t('import_check_status'))
    assertUnresolved(wizard, { asks: 3 })
    // A watch started on the answer would already have left this screen (asserted above). For the
    // runs closest to one that is followed, also wait long enough for such a watch to have polled.
    if (WAITED_FOR.includes(name)) {
      await onePoll()
      assertUnresolved(wizard, { asks: 3 })
    }
    assert.equal(wizard.count(PROVISION), 0)
    assert.equal(wizard.calls.filter((c) => c.key === STATUS && JSON.parse(c.body).runId).length, 0)
  })
}

test('S4-F003: a matching running run is adopted and followed by its id; when it fails, its claim is not released', async () => {
  let polled = run()
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: () => json(502, { code: 'NOT_SIGNED_IN' }),
    [STATUS]: statusDoor({ bySite: inTurn(NO_RUN, () => json(200, run())), byRun: () => json(200, polled) })
  })
  // Followed: the progress screen, no recovery action, no start.
  assert.equal(siteAsks(wizard.calls).length, 2)
  assert.equal(buttons(t('import_check_status')).length, 0)
  assert.equal(buttons(t('import_start')).length, 0)
  assert.ok(document.body.textContent.includes(t('import_step_reading_content')))
  assert.deepEqual(shownError(), [])
  await onePoll()
  const polls = wizard.calls.filter((c) => c.key === STATUS && JSON.parse(c.body).runId)
  assert.ok(polls.length >= 1, 'the adopted run is not watched')
  for (const call of polls) assert.deepEqual(JSON.parse(call.body), { runId: 'found-1' })
  // The run may be another tab's: its end does not hand this wizard its claim to delete.
  polled = run({ state: 'error', error: 'invalid_credential' })
  await onePoll()
  assert.deepEqual(shownError(), [approved('import_error_invalid_credential_joomla')])
  assert.deepEqual(wizard.deletes(), [])
  assert.equal(wizard.count(START), 1)
  assert.deepEqual(wizard.provisioned, [])
  assert.equal(siteAsks(wizard.calls).length, 2, 'a claim that is not released is not asked about')
})

/** A read started and followed by its id, until the status door says it failed with `failed`. */
async function failedRead(failed) {
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: () => json(202, { runId: 'run-1' }),
    [STATUS]: statusDoor({
      bySite: NO_RUN,
      byRun: () => json(200, run({ id: 'run-1', state: 'error', step: 'signing_in', ...failed }))
    })
  })
  await onePoll()
  return wizard
}

test('a Cloudflare block shows its approved resolution open and never offers manual install', async () => {
  await failedRead({ error: 'blocked_by_firewall', errorDetail: { firewall: 'cloudflare' } })
  assert.deepEqual(shownError(), [approved('import_error_blocked_by_cloudflare')])
  const problem = document.querySelector('[data-import-problem="p16"]')
  assert.ok(problem)
  assert.equal(problem.querySelector('[data-slot="collapsible-trigger"]'), null)
  assert.equal(problem.querySelectorAll('ol > li').length, 6)
  assert.ok(problem.textContent.includes('Bot Fight Mode'))
  assert.ok(problem.textContent.includes('Under Attack Mode'))
  assert.equal(problem.querySelector('a[href="#install-myself"]'), null)
  assert.doesNotMatch(document.body.textContent, RAW)
})

test('the address view keeps a Cloudflare failure actionable when going back', async () => {
  await failedRead({ error: 'blocked_by_firewall', errorDetail: { firewall: 'cloudflare' } })
  await press(t('wizard_site_address'))
  assert.deepEqual(shownError(), [approved('import_error_blocked_by_cloudflare')])
  assert.ok(document.querySelector('[data-import-problem="p16"]').textContent.includes('Bot Fight Mode'))
})

for (const [name, errorDetail] of [
  ['Wordfence', { firewall: 'wordfence' }],
  ['ModSecurity', { firewall: 'modsecurity' }],
  ['an unnamed firewall', { firewall: 'firewall' }],
  ['no firewall named', undefined],
  ['a name Tracy does not give', { firewall: '<b>cloudflare</b>' }]
]) {
  test(`a block by ${name} names only a known firewall and has no Cloudflare instructions`, async () => {
    await failedRead({ error: 'blocked_by_firewall', ...(errorDetail ? { errorDetail } : {}) })
    assert.deepEqual(shownError(), [
      errorDetail?.firewall === 'wordfence' ? t('import_problem_p17_what') : t('import_firewall_unknown')
    ])
    assert.equal(document.querySelector('[data-import-problem="p16"]'), null)
  })
}

test('a failed run hands the sentence a firewall only when it is a name firewallOf gives', () => {
  const failed = (errorDetail) => run({ state: 'error', error: 'blocked_by_firewall', errorDetail })
  assert.deepEqual(lib.failedRunDetail(failed({ firewall: 'cloudflare' })), {
    firewall: 'cloudflare',
    platform: 'joomla'
  })
  assert.deepEqual(lib.failedRunDetail(failed({ firewall: 'Cloudflare <script>' })), { platform: 'joomla' })
  assert.deepEqual(lib.failedRunDetail(failed({ firewall: 7 })), { platform: 'joomla' })
  // The other values of the detail travel as they did.
  assert.deepEqual(
    lib.failedRunDetail({
      ...failed({ php: '7.4', minimumPhp: '8.1' }),
      diagnostic: { at: 'x', check: 'y' }
    }),
    { php: '7.4', minimumPhp: '8.1', check: 'y', platform: 'joomla' }
  )
})

test('S4-F003: an adopted run the host forgot is said so, and its claim is not released', async () => {
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: lost,
    [STATUS]: statusDoor({ bySite: inTurn(NO_RUN, () => json(200, run())) })
  })
  await onePoll()
  assert.deepEqual(shownError(), [approved('import_error_run_lost')])
  assert.deepEqual(wizard.deletes(), [])
  assert.equal(wizard.count(START), 1)
})

test('S4-F003: a matching finished run is handed over through the watch exactly once, under the submitted site and platform', async () => {
  const done = run({ state: 'done', step: 'handing_over', result: KEYS })
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: () => notJson(202),
    [STATUS]: statusDoor({ bySite: inTurn(NO_RUN, () => json(200, done)), byRun: () => json(200, done) }),
    [PROVISION]: () => json(202, { jobId: 'job-1' })
  })
  assert.equal(wizard.count(PROVISION), 0, 'handed over before the watch saw the run')
  await onePoll()
  await onePoll()
  assert.equal(wizard.count(PROVISION), 1)
  const [handover] = wizard.calls.filter((c) => c.key === PROVISION)
  assert.deepEqual(JSON.parse(handover.body), { platform: 'joomla', ...KEYS })
  assert.deepEqual(wizard.provisioned, [{ siteKey: 'old-shop.example', platform: 'joomla', jobId: 'job-1' }])
  assert.deepEqual(wizard.deletes(), [])
  assert.equal(wizard.count(START), 1)
  assert.ok(document.body.textContent.includes(t('import_handed_over_title', { domain: 'old-shop.example' })))
})

test('S4-F003: an unresolved check that later finds the run adopts it then, without another start', async () => {
  let found = NO_RUN
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: () => json(503, { code: 'HOST_UPDATING' }),
    [STATUS]: statusDoor({ bySite: () => found(), byRun: () => json(200, run()) })
  })
  assertUnresolved(wizard)
  found = () => json(200, run())
  await press(t('import_check_status'))
  assert.equal(siteAsks(wizard.calls).length, 3)
  assert.equal(buttons(t('import_check_status')).length, 0)
  assert.ok(document.body.textContent.includes(t('import_step_reading_content')))
  assert.equal(wizard.count(START), 1)
  assert.deepEqual(wizard.deletes(), [])
})

test('S4-F003: the run this wizard opened fails: its claim is not released, and Start opens the next read under it', async () => {
  let latest = NO_RUN
  const failed = run({ id: 'run-1', state: 'error', error: 'unreachable' })
  let polled = failed
  const wizard = await startImport({
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: inTurn(
      () => json(202, { runId: 'run-1' }),
      () => json(202, { runId: 'run-2' })
    ),
    // The site's latest run is this wizard's own ended one: everything a browser can ask says the
    // claim is idle — and the row still stays.
    [STATUS]: statusDoor({ bySite: () => latest(), byRun: () => json(200, polled) })
  })
  latest = () => json(200, failed)
  await onePoll()
  assert.deepEqual(shownError(), [approved('import_error_unreachable')])
  assert.deepEqual(wizard.deletes(), [], 'the claim of a failed run was released')
  assert.equal(siteAsks(wizard.calls).length, 1, 'only the look before the start')
  // The run it opened is over, so this wizard may start again under the claim it made.
  polled = run({ id: 'run-2' })
  await type(document.querySelector('input[type="password"]'), 'correct horse')
  await press(t('import_start'))
  assert.equal(wizard.count(CLAIM), 2)
  assert.equal(wizard.count(START), 2, 'the wizard that made the claim could not start again')
  assert.deepEqual(shownError(), [])
  assert.deepEqual(wizard.deletes(), [])
})

test('S4-F003: two presses of Start before the first is answered claim once and start once', async () => {
  const claim = later()
  const wizard = await fillImport({
    [CLAIM]: claim.route(() => json(201, { siteKey: 'old-shop.example' })),
    [START]: () => json(202, { runId: 'run-1' })
  })
  const start = button(t('import_start'))
  // Both clicks land in the same turn, before React has rendered the first one's `busy`.
  start.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  start.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await settle()
  assert.equal(wizard.count(CLAIM), 1)
  claim.release()
  await settle()
  assert.equal(wizard.count(CLAIM), 1)
  assert.equal(wizard.count(START), 1)
  assert.deepEqual(wizard.deletes(), [])
})

test('S4-F003: two presses of Check status before the first is answered ask once, and a late answer is used once', async () => {
  const second = later()
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: lost,
    [STATUS]: statusDoor({
      bySite: inTurn(
        NO_RUN,
        NO_RUN,
        second.route(() => json(200, run()))
      ),
      byRun: () => json(200, run())
    })
  })
  assertUnresolved(wizard)
  const check = button(t('import_check_status'))
  check.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  check.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await settle()
  assert.equal(
    siteAsks(wizard.calls).length,
    3,
    'the look before the start, one automatic check, one pressed'
  )
  // While the check is out there is no way to start, release or check again.
  assert.equal(buttons(t('import_start')).length, 0)
  assert.equal(button(t('import_check_status')).disabled, true)
  second.release()
  await settle()
  assert.equal(siteAsks(wizard.calls).length, 3)
  assert.equal(buttons(t('import_check_status')).length, 0)
  assert.equal(wizard.count(START), 1)
  assert.deepEqual(wizard.deletes(), [])
})

for (const [name, reply, claimStatus] of [
  ['a verified refusal', () => json(401, { code: 'NOT_SIGNED_IN' }), 201],
  ['an unconfirmed outcome', () => notJson(502), 201],
  ['a started run', () => json(202, { runId: 'run-1' }), 201]
]) {
  test(`S4-F003: ${name} that arrives after the wizard was closed does nothing: no release, no status check, no handover`, async () => {
    const start = later()
    const wizard = await startImport({
      [CLAIM]: () => json(claimStatus, { siteKey: 'old-shop.example' }),
      [START]: start.route(reply),
      [STATUS]: inTurn(NO_RUN, () => json(200, run({ state: 'done', step: 'handing_over', result: KEYS }))),
      [PROVISION]: () => json(202, { jobId: 'job-1' })
    })
    assert.equal(wizard.count(START), 1)
    wizard.root.unmount()
    await settle()
    start.release()
    await onePoll()
    assert.deepEqual(wizard.deletes(), [])
    assert.equal(wizard.count(STATUS), 1, 'only the look before the start')
    assert.equal(wizard.count(PROVISION), 0)
    assert.deepEqual(wizard.provisioned, [])
  })
}

test('S4-F003: a claim answered after the wizard was closed sends no admin details on', async () => {
  const claim = later()
  const wizard = await startImport({
    [CLAIM]: claim.route(() => json(201, { siteKey: 'old-shop.example' })),
    [START]: () => json(202, { runId: 'run-1' })
  })
  wizard.root.unmount()
  await settle()
  claim.release()
  await settle()
  assert.equal(wizard.count(START), 0)
  assert.deepEqual(wizard.deletes(), [])
})

test('S4-F003: a bare 401 with no body at the claim is the ended session too', async () => {
  await startImport({ [CLAIM]: () => notJson(401) })
  assert.ok(shownError()[0]?.startsWith(approved('import_error_signed_out')), shownError()[0])
  assert.equal(signInLinks().length, 1)
})

for (const [status, code, key, signIn] of [
  [404, 'NOT_SIGNED_IN', 'import_error_other', 0],
  [400, 'NOT_SIGNED_IN', 'import_error_other', 0],
  [409, 'NOT_SIGNED_IN', 'import_error_other', 0],
  [401, 'TAKEN', 'import_error_signed_out', 1],
  [401, 'UNSUPPORTED_PLATFORM', 'import_error_signed_out', 1],
  [400, 'TAKEN', 'import_error_other', 0],
  [404, 'TAKEN', 'import_error_other', 0],
  [409, 'INVALID_SITE_KEY', 'import_error_other', 0],
  [409, 'UNSUPPORTED_PLATFORM', 'import_error_other', 0],
  // Codes of other doors (the host half, the handover) are not this door's to say.
  [403, 'NO_VIEWING_SESSION', 'import_error_other', 0],
  [409, 'ALREADY_PROVISIONED', 'import_error_other', 0],
  [400, 'HOST_UPDATING', 'import_error_other', 0]
]) {
  test(`S4-F003: a claim answered ${status} naming ${code} is read by its status, not by a code the door does not send with it`, async () => {
    const wizard = await startImport({ [CLAIM]: () => json(status, { code }) })
    assert.equal(wizard.count(START), 0)
    assert.deepEqual(wizard.deletes(), [])
    const [shown] = shownError()
    assert.ok(shown?.startsWith(approved(key)), shown)
    assert.equal(signInLinks().length, signIn)
    assert.doesNotMatch(document.body.textContent, RAW)
  })
}

test('S4-F003: the refusals the wizard already named keep their sentences', async () => {
  for (const [code, key] of [['TAKEN', 'import_error_claim_taken']]) {
    await startImport({ [CLAIM]: () => json(409, { code }) })
    assert.deepEqual(shownError(), [approved(key)])
    await closeWizards()
  }
})

// ── S4-F003: a start, an adoption and a release are tied to a run that can be named ─────────────
//
// A claim says nothing about a read. One that already stood may carry a read from another tab, or
// from a start whose answer was lost before the wizard was opened again; the status door answers
// the site's LATEST run, which may be an earlier one; and the release door looks at build jobs,
// not at reads. So: the site is looked at before anything is started, an earlier run is never
// taken for this press's, and a claim goes only once the host is known to hold no read under it.

const DONE = (id) => run({ id, state: 'done', step: 'handing_over', result: KEYS })
const FAILED = (id) => run({ id, state: 'error', error: 'unreachable' })

// What the look before the start may find that is NOT "no read is going": nothing is started.
const NO_START = [
  ['no answer', lost],
  ['a 500', () => json(500, { code: 'INTERNAL_ERROR' })],
  ['a 500 naming RUN_UNKNOWN', () => json(500, { code: 'RUN_UNKNOWN' })],
  ['a 503 carrying an ended run', () => json(503, FAILED('old-1'))],
  ['a 401', () => json(401, { code: 'NOT_SIGNED_IN' })],
  ['a 404 that is not the door’s own', () => json(404, { code: 'UNKNOWN_STEP' })],
  ['a 404 gateway page', () => notJson(404)],
  ['a 200 that is not JSON', () => notJson(200)],
  ['a 200 with no body', () => new Response('', { status: 200 })],
  ['a 200 null', () => json(200, null)],
  ['a 200 list', () => json(200, [FAILED('old-1')])],
  ['an empty object', () => json(200, {})],
  ['an ended run of another site', () => json(200, { ...FAILED('old-1'), siteKey: 'someone-else.example' })],
  ['an ended run with no id', () => json(200, { ...FAILED('old-1'), id: undefined })],
  ['an ended run with a blank id', () => json(200, { ...FAILED('old-1'), id: '  ' })],
  ['a run in a state the door never gives', () => json(200, run({ state: 'queued' }))],
  ['a run with no state', () => json(200, run({ state: undefined }))],
  ['a read going on another platform', () => json(200, run({ platform: 'wordpress' }))],
  ['a read going at a step the door never gives', () => json(200, run({ step: 'made_up' }))],
  ['a read going with no detail', () => json(200, run({ detail: undefined }))]
]
for (const [name, bySite] of NO_START) {
  for (const claimStatus of [200, 201]) {
    test(`S4-F003: a claim ${claimStatus} whose site answers ${name} before the start starts nothing and releases nothing`, async () => {
      const wizard = await startImport({
        [CLAIM]: () => json(claimStatus, { siteKey: 'old-shop.example' }),
        [START]: () => json(202, { runId: 'run-1' }),
        [STATUS]: statusDoor({ bySite, byRun: () => json(200, run({ id: 'run-1' })) }),
        [PROVISION]: () => json(202, { jobId: 'job-1' })
      })
      assert.equal(wizard.count(START), 0, 'a read was started over a site nobody could vouch for')
      assert.deepEqual(wizard.deletes(), [])
      assert.deepEqual(wizard.provisioned, [])
      assert.equal(siteAsks(wizard.calls).length, 1)
      assert.deepEqual(shownError(), [approved('import_error_other')])
      // Nothing was sent, so values remain retained while the standalone failure offers Try again.
      assert.equal(wizard.username.value, 'admin')
      assert.equal(wizard.password.value, 'correct horse')
      assert.equal(buttons(t('import_start')).length, 0)
      assert.equal(document.querySelector('input[type="password"]'), null)
      assert.equal(button(t('import_retry')).disabled, false)
      assert.doesNotMatch(document.body.textContent, RAW)
    })
  }
}

for (const [name, bySite] of [
  ['knows no run of it', NO_RUN],
  ['has a failed run of it', () => json(200, FAILED('old-1'))],
  ['has a finished run of it', () => json(200, DONE('old-1'))],
  [
    'has a failed run of it on another platform',
    () => json(200, { ...FAILED('old-1'), platform: 'wordpress' })
  ]
]) {
  test(`S4-F003: a site whose host ${name} is started once, by this press`, async () => {
    const wizard = await startImport({
      [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
      [START]: () => json(202, { runId: 'run-1' }),
      [STATUS]: statusDoor({ bySite, byRun: () => json(200, run({ id: 'run-1' })) })
    })
    assert.equal(wizard.count(START), 1)
    assert.deepEqual(shownError(), [])
    assert.equal(buttons(t('import_start')).length, 0)
    assert.deepEqual(wizard.deletes(), [])
  })
}

for (const claimStatus of [200, 201]) {
  test(`S4-F003: a claim ${claimStatus} over a read that is already going follows that read: no second start, and its claim is never released`, async () => {
    let polled = run()
    const wizard = await startImport({
      [CLAIM]: () => json(claimStatus, { siteKey: 'old-shop.example' }),
      [START]: () => json(202, { runId: 'run-2' }),
      [STATUS]: statusDoor({ bySite: () => json(200, run()), byRun: () => json(200, polled) })
    })
    assert.equal(wizard.count(START), 0, 'a second read was started under the same claim')
    assert.equal(buttons(t('import_start')).length, 0)
    assert.ok(document.body.textContent.includes(t('import_step_reading_content')))
    assert.deepEqual(shownError(), [])
    // The details typed here were never sent, and are not kept on screen either.
    assert.equal(document.querySelectorAll('input[type="password"]').length, 0)
    await onePoll()
    const polls = wizard.calls.filter((c) => c.key === STATUS && JSON.parse(c.body).runId)
    assert.ok(polls.length >= 1, 'the read that was found is not watched')
    for (const call of polls) assert.deepEqual(JSON.parse(call.body), { runId: 'found-1' })
    polled = run({ state: 'error', error: 'invalid_credential' })
    await onePoll()
    assert.deepEqual(shownError(), [approved('import_error_invalid_credential_joomla')])
    assert.deepEqual(wizard.deletes(), [], 'the claim of a read this wizard did not open was released')
    assert.equal(wizard.count(START), 0)
    assert.equal(siteAsks(wizard.calls).length, 1)
  })
}

test('S4-F003: a wizard opened again after a start whose answer was lost finds the read and does not start a second one', async () => {
  // The first start reached the host; only its answer was lost. The host shows the read a moment later.
  let host = NO_RUN
  const table = {
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: lost,
    [STATUS]: statusDoor({ bySite: () => host(), byRun: () => json(200, run()) })
  }
  const first = await startImport(table)
  assertUnresolved(first)
  await closeWizards()
  host = () => json(200, run())
  const again = await startImport(table)
  assert.equal(again.count(CLAIM), 1)
  assert.equal(again.count(START), 0, 'the reopened wizard started a second read')
  assert.equal(buttons(t('import_start')).length, 0)
  assert.equal(buttons(t('import_check_status')).length, 0)
  assert.ok(document.body.textContent.includes(t('import_step_reading_content')))
  assert.deepEqual([...first.deletes(), ...again.deletes()], [])
})

test('S4-F003: after an unconfirmed start, the finished run that stood before it is not this press’s: no handover, no release, no start', async () => {
  const wizard = await startImport({
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
    [START]: lost,
    [STATUS]: statusDoor({ bySite: () => json(200, DONE('old-1')), byRun: () => json(200, DONE('old-1')) }),
    [PROVISION]: () => json(202, { jobId: 'job-1' })
  })
  assertUnresolved(wizard)
  await press(t('import_check_status'))
  await onePoll()
  assertUnresolved(wizard, { asks: 3 })
  assert.equal(wizard.count(PROVISION), 0, 'an earlier import was handed over as this one')
  assert.equal(wizard.calls.filter((c) => c.key === STATUS && JSON.parse(c.body).runId).length, 0)
})

for (const [name, found, handsOver] of [
  ['a new read that is going', () => run({ id: 'new-1' }), false],
  ['a new finished run', () => DONE('new-1'), true]
]) {
  test(`S4-F003: after an unconfirmed start over an earlier finished run, ${name} is the one followed`, async () => {
    let latest = DONE('old-1')
    const wizard = await startImport({
      [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
      [START]: () => notJson(502),
      [STATUS]: statusDoor({ bySite: () => json(200, latest), byRun: () => json(200, latest) }),
      [PROVISION]: () => json(202, { jobId: 'job-1' })
    })
    assertUnresolved(wizard)
    latest = found()
    await press(t('import_check_status'))
    assert.equal(buttons(t('import_check_status')).length, 0)
    await onePoll()
    await onePoll()
    const polls = wizard.calls.filter((c) => c.key === STATUS && JSON.parse(c.body).runId)
    assert.ok(polls.length >= 1)
    for (const call of polls) assert.deepEqual(JSON.parse(call.body), { runId: 'new-1' })
    assert.equal(wizard.count(PROVISION), handsOver ? 1 : 0)
    assert.equal(wizard.count(START), 1)
    assert.deepEqual(wizard.deletes(), [])
  })
}

// ── S4-F003: who may start, and that nobody releases ────────────────────────────────────────────
//
// Nothing a browser can ask proves, for the moment a request LANDS, that no read stands under a
// claim: a start may be on its way to the host with no run to show yet, and another tab may open
// one between a look at the status door and a DELETE. So a start is sent only by the wizard whose
// own press made the claim (201 — the book makes a row once) and only while no start of its own is
// unaccounted for; and no claim is released from the wizard at all.

/** The sentence for a claim this wizard did not make: nothing sent, nothing typed taken away. */
function assertClaimStands(wizard, { starts = 0 } = {}) {
  assert.ok(sentence('import_error_claim_stands'), 'no sentence for a claim that already stood')
  assert.deepEqual(shownError(), [approved('import_error_claim_stands')])
  const links = document.querySelectorAll('[data-import-problem] a[href="#my-sites"]')
  assert.equal(links.length, 1, 'the existing claim offers one My Sites link')
  assert.equal(links[0].textContent, 'My Sites')
  assert.equal(wizard.count(START), starts, 'a start was sent under a claim that already stood')
  assert.deepEqual(wizard.deletes(), [])
  assert.deepEqual(wizard.provisioned, [])
  assert.equal(importSubmitAction().disabled, false)
  assert.doesNotMatch(document.body.textContent, RAW)
  assert.doesNotMatch(document.body.textContent, /nothing (was|has been) (started|changed|created)/i)
}

for (const [name, bySite] of [
  ['knows no run of it', NO_RUN],
  ['has a failed run of it', () => json(200, FAILED('old-1'))],
  ['has a finished run of it', () => json(200, DONE('old-1'))],
  [
    'has a failed run of it on another platform',
    () => json(200, { ...FAILED('old-1'), platform: 'wordpress' })
  ]
]) {
  test(`S4-F003: a claim that already stood (200) on a site whose host ${name} sends no start: an earlier one may still be on its way`, async () => {
    const wizard = await startImport({
      [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true }),
      [START]: () => json(202, { runId: 'run-2' }),
      [STATUS]: statusDoor({ bySite, byRun: () => json(200, run({ id: 'run-2' })) })
    })
    assertClaimStands(wizard)
    assert.equal(siteAsks(wizard.calls).length, 1)
    // Nothing was sent, so nothing typed is taken away.
    assert.equal(wizard.username.value, 'admin')
    assert.equal(wizard.password.value, 'correct horse')
  })
}

// A 200 from the claim door proves one thing: the address is already on this account. The book
// answers the same for a site that was built here and is live as for a row an import left behind,
// so the sentence may name neither a past import nor a deletion.

/** What the claim-stands sentence must not say, per interface language: an origin, or "delete it". */
const CLAIM_STANDS_OVERCLAIMS = {
  en: /earlier|previous|\bfrom an? |delet|remov/i,
  vi: /xoá|xóa|gỡ bỏ|trước/i,
  de: /lösch|entfern|früher|vorherig/i,
  es: /elimin|borr|anterior|previ/i,
  fr: /supprim|effac|précédent|antérieur/i,
  it: /elimin|cancell|rimuov|precedent/i,
  nl: /verwijder|\bwis|eerder|vorig/i,
  zh: /删除|移除|之前|以前|先前/
}

/** A translation of the Add site namespace, read from the tree under test; null when it has none. */
function translated(language, key) {
  const home =
    language === 'vi' ? 'packages/locale/tracy-locale-vi/vi' : `packages/locale/tracy-locales/${language}`
  try {
    const table = JSON.parse(readFileSync(path.join(repo, home, 'tracy-add-site.json'), 'utf8'))
    return typeof table?.[key] === 'string' && table[key].trim() ? table[key] : null
  } catch {
    return null
  }
}

test('S4-F003: a claim that already stood (200) for a site that is live on the account names no earlier import and tells nobody to delete the site', async () => {
  // What the book answers for a site built on Tracy that the caller owns: the same 200.
  const wizard = await startImport({
    [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true }),
    [START]: () => json(202, { runId: 'run-2' }),
    [STATUS]: statusDoor({ bySite: NO_RUN, byRun: NO_RUN })
  })
  assertClaimStands(wizard)
  const [shown] = shownError()
  assert.doesNotMatch(shown, CLAIM_STANDS_OVERCLAIMS.en)
  // The next step it does give: try again from here, or find the site where sites are listed.
  assert.match(shown, /try again/i)
  assert.match(shown, /My Sites/)
})

for (const language of Object.keys(CLAIM_STANDS_OVERCLAIMS).filter((l) => l !== 'en')) {
  test(`S4-F003: the sentence for a claim that already stood, in ${language}, names no earlier import and tells nobody to delete the site`, () => {
    const shown = translated(language, 'import_error_claim_stands')
    assert.ok(shown, `no ${language} sentence for a claim that already stood`)
    assert.notEqual(shown, sentence('import_error_claim_stands'))
    assert.doesNotMatch(shown, CLAIM_STANDS_OVERCLAIMS[language])
  })
}

test('S4-F003: a wizard opened again while the first start is still on its way to the host sends no second start, and follows the read once the host shows it', async () => {
  // The first start's answer was lost; the host has no run to show yet when the wizard is reopened.
  let host = NO_RUN
  const table = {
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: lost,
    [STATUS]: statusDoor({ bySite: () => host(), byRun: () => json(200, run()) })
  }
  const first = await startImport(table)
  assertUnresolved(first)
  await closeWizards()
  const again = await startImport(table)
  assertClaimStands(again)
  // The start arrives; the next press finds its read and follows it.
  host = () => json(200, run())
  await press(t('import_start'))
  assert.equal(again.count(START), 0)
  assert.equal(buttons(t('import_start')).length, 0)
  assert.ok(document.body.textContent.includes(t('import_step_reading_content')))
  assert.deepEqual([...first.deletes(), ...again.deletes()], [])
})

test('S4-F003: after a refusal the door named, the wizard that made the claim starts again under it; a wizard opened anew does not', async () => {
  const table = {
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: inTurn(
      () => json(401, { code: 'NOT_SIGNED_IN' }),
      () => json(202, { runId: 'run-1' })
    ),
    [STATUS]: statusDoor({ bySite: NO_RUN, byRun: () => json(200, run({ id: 'run-1' })) })
  }
  const wizard = await startImport(table)
  assert.ok(shownError()[0]?.startsWith(approved('import_error_signed_out')), shownError()[0])
  assert.equal(buttons(t('import_start')).length, 0)
  // Signed in again in another tab: focus restores the retained form before another press.
  window.dispatchEvent(new window.Event('focus'))
  await settle()
  assert.equal(document.querySelector('input[type="password"]').value, 'correct horse')
  await press(t('import_start'))
  assert.equal(wizard.count(CLAIM), 2)
  assert.equal(wizard.count(START), 2)
  assert.deepEqual(shownError(), [])
  assert.equal(buttons(t('import_start')).length, 0)
  assert.deepEqual(wizard.deletes(), [])
  await closeWizards()

  // The same refusal, then the page is opened again: that wizard did not make the claim.
  const refusedThenClosed = {
    ...table,
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: () => json(401, { code: 'NOT_SIGNED_IN' })
  }
  const first = await startImport(refusedThenClosed)
  assert.equal(first.count(START), 1)
  await closeWizards()
  const again = await startImport(refusedThenClosed)
  assertClaimStands(again)
  assert.deepEqual([...first.deletes(), ...again.deletes()], [])
})

// ── #1665: a claim no start can still be on its way under ────────────────────────────────────────
//
// Every start is sent right after a press of the claim door, which answers how long before this
// press it was last pressed (`idleMs`). Once that reaches `UNANSWERED_START_MS`, a claim with no
// build job (`retryable`) and no run on the host carries no start still on its way, so any wizard may
// start under it. Before, a start the host refused (the 15-minute hold after a Remove) or a start a
// redeploy cut left a row that answered `claim_stands` to every later press.

/** The claim door's 200 for a claim last pressed `idle(lib)` ago (read once the bundle is built). */
const stood =
  (idle, over = {}) =>
  () =>
    json(200, {
      siteKey: 'old-shop.example',
      alreadyMine: true,
      retryable: true,
      idleMs: typeof idle === 'function' ? idle(lib.UNANSWERED_START_MS) : idle,
      press: PRESS,
      pressBefore: PRESS_BEFORE,
      ...over
    })
const PRESS = '1761264150000000'
const PRESS_BEFORE = '1761264000000000'
const IDLE = (wait) => wait
const JUST_UNDER = (wait) => wait - 1

test('#1665: a start the hold refused, then the page opened again, starts once the claim is idle', async () => {
  const refused = {
    [CLAIM]: () => json(201, { siteKey: 'old-shop.example', press: PRESS_BEFORE }),
    [START]: () => json(409, { code: 'IMPORT_REMOVING' })
  }
  const first = await startImport(refused)
  assert.equal(first.count(START), 1)
  // Every start names the press it follows; only a take-over names one it supersedes.
  assert.deepEqual(
    (({ press, after }) => ({ press, after }))(JSON.parse(first.calls.find((c) => c.key === START).body)),
    { press: PRESS_BEFORE, after: undefined }
  )
  assert.equal(importSubmitAction().disabled, false, 'Start stays after the refusal')
  await closeWizards()

  // Opened again right away: the refused press touched the claim, so it still stands.
  const soon = await startImport({ [CLAIM]: stood(JUST_UNDER), [START]: () => json(202, { runId: 'run-2' }) })
  assertClaimStands(soon)
  await closeWizards()

  // Opened again after the claim sat idle: the hold has lapsed, the start goes out and is followed.
  const later = await startImport({
    [CLAIM]: stood(IDLE),
    [START]: () => json(202, { runId: 'run-2' }),
    [STATUS]: statusDoor({ bySite: NO_RUN, byRun: () => json(200, run({ id: 'run-2' })) })
  })
  assert.equal(later.count(START), 1)
  const takeOver = JSON.parse(later.calls.find((c) => c.key === START).body)
  assert.equal(takeOver.retryOf, undefined)
  assert.equal(takeOver.press, PRESS)
  assert.equal(takeOver.after, PRESS_BEFORE, 'the take-over does not name the press it supersedes')
  assert.deepEqual(shownError(), [])
  assert.equal(buttons(t('import_start')).length, 0)
  assert.deepEqual([...first.deletes(), ...soon.deletes(), ...later.deletes()], [])
})

test('#1665: a start a redeploy cut off leaves no claim that refuses Start again', async (context) => {
  let clock = 1000000
  context.mock.method(Date, 'now', () => clock)
  let idle = 0
  const wizard = await startImport({
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => stood(idle)()
    ),
    [START]: inTurn(lost, () => json(202, { runId: 'run-2' })),
    [STATUS]: statusDoor({ bySite: NO_RUN, byRun: () => json(200, run({ id: 'run-2' })) })
  })
  assertUnresolved(wizard)
  // The screen offers Start again after the same wait the claim door's `idleMs` is held to.
  clock += lib.UNANSWERED_START_MS
  mock.timers.tick(5000)
  await settle()
  await press(t('import_restart'))
  idle = lib.UNANSWERED_START_MS
  await type(document.querySelector('input[type="password"]'), 'correct horse')
  await press(t('import_start'))
  assert.equal(wizard.count(START), 2)
  // Its own earlier start is unaccounted for, so this is a take-over too: the host follows the
  // first start's read if it turns up after all (`run.ts` `superseded`).
  assert.equal(JSON.parse(wizard.calls.filter((c) => c.key === START)[1].body).after, PRESS_BEFORE)
  assert.deepEqual(shownError(), [])
  assert.deepEqual(wizard.deletes(), [])
})

for (const [name, claim, bySite] of [
  ['pressed less than the wait ago', stood(JUST_UNDER), NO_RUN],
  ['with a build job (not retryable)', stood(IDLE, { retryable: undefined }), NO_RUN],
  ['with no idle time named', stood(undefined), NO_RUN],
  ['with no earlier press named', stood(IDLE, { pressBefore: undefined }), NO_RUN],
  ['whose site has a finished read', stood(IDLE), () => json(200, DONE('old-1'))],
  ['whose status is unreadable', stood(IDLE), () => json(502, { code: 'INTERNAL_ERROR' })]
]) {
  test(`#1665: a claim ${name} still sends no start`, async () => {
    const wizard = await startImport({
      [CLAIM]: claim,
      [START]: () => json(202, { runId: 'must-not-start' }),
      [STATUS]: statusDoor({ bySite })
    })
    assert.equal(wizard.count(START), 0)
    assert.deepEqual(wizard.deletes(), [])
    assert.deepEqual(wizard.provisioned, [])
  })
}

test('#1665: an idle claim whose read is live is followed, never started twice', async () => {
  const wizard = await startImport({
    [CLAIM]: stood((wait) => 10 * wait),
    [START]: () => json(202, { runId: 'must-not-start' }),
    [STATUS]: statusDoor({ bySite: () => json(200, run()), byRun: () => json(200, run()) })
  })
  assert.equal(wizard.count(START), 0)
  assert.ok(document.body.textContent.includes(t('import_step_reading_content')))
  assert.deepEqual(wizard.deletes(), [])
})

test('S4-F003: an unconfirmed start is not accounted for by a refusal of an earlier press: the read found afterwards is followed, and when it fails no second start is sent', async () => {
  let polled = run({ id: 'new-1' })
  let host = NO_RUN
  const wizard = await startImport({
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: inTurn(
      () => json(400, { code: 'INVALID_REQUEST' }),
      lost,
      () => json(202, { runId: 'run-3' })
    ),
    [STATUS]: statusDoor({ bySite: () => host(), byRun: () => json(200, polled) })
  })
  await press(t('import_start'))
  assertUnresolved(wizard, { asks: 3, starts: 2 })
  host = () => json(200, polled)
  await press(t('import_check_status'))
  assert.equal(buttons(t('import_check_status')).length, 0)
  // The read that was found ends in an error. It was not opened by an answer this wizard read, so
  // whether its own start is still out is not known: Start sends nothing more.
  polled = run({ id: 'new-1', state: 'error', error: 'invalid_credential' })
  await onePoll()
  assert.deepEqual(shownError(), [approved('import_error_invalid_credential_joomla')])
  await type(document.querySelector('input[type="password"]'), 'correct horse')
  await press(t('import_start'))
  assertClaimStands(wizard, { starts: 2 })
})

test('S4-F003: a read found under a claim that already stood fails: Start sends nothing, and says why', async () => {
  let polled = run()
  const wizard = await startImport({
    [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true }),
    [START]: () => json(202, { runId: 'run-2' }),
    [STATUS]: statusDoor({ bySite: () => json(200, polled), byRun: () => json(200, polled) })
  })
  assert.equal(wizard.count(START), 0)
  polled = run({ state: 'error', error: 'invalid_credential' })
  await onePoll()
  assert.deepEqual(shownError(), [approved('import_error_invalid_credential_joomla')])
  await type(document.querySelector('input[type="password"]'), 'correct horse')
  await press(t('import_start'))
  assertClaimStands(wizard)
})

test('S4-F003: a run the host forgot releases no claim, and the wizard that opened it may start again', async () => {
  const wizard = await startImport({
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: inTurn(
      () => json(202, { runId: 'run-1' }),
      () => json(202, { runId: 'run-2' })
    ),
    [STATUS]: statusDoor({ bySite: NO_RUN, byRun: inTurn(NO_RUN, () => json(200, run({ id: 'run-2' }))) })
  })
  await onePoll()
  assert.deepEqual(shownError(), [approved('import_error_run_lost')])
  assert.deepEqual(wizard.deletes(), [], 'the claim of a forgotten run was released')
  assert.equal(siteAsks(wizard.calls).length, 1)
  await type(document.querySelector('input[type="password"]'), 'correct horse')
  await press(t('import_start'))
  assert.equal(wizard.count(START), 2)
  assert.deepEqual(wizard.deletes(), [])
})

// The read another tab opens between a look at the host and a release cannot be seen from here.
// These are the orders in which the old release was sent; none sends one now.
for (const [name, start, byRun] of [
  ['a refused start', () => json(401, { code: 'NOT_SIGNED_IN' }), NO_RUN],
  ['a failed run', () => json(202, { runId: 'run-1' }), () => json(200, FAILED('run-1'))],
  ['a forgotten run', () => json(202, { runId: 'run-1' }), NO_RUN]
]) {
  test(`S4-F003: after ${name}, a read another tab opens right after the last look at the host keeps its site: no DELETE is ever sent`, async () => {
    // What the host says by site key: idle at every look this wizard takes, then the other tab's read.
    let looks = 0
    const wizard = await startImport({
      [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
      [START]: start,
      [STATUS]: statusDoor({
        bySite: () => (looks++ < 2 ? NO_RUN() : json(200, run({ id: 'other-tab-1' }))),
        byRun
      })
    })
    await onePoll()
    assert.equal(shownError().length, 1)
    assert.deepEqual(wizard.deletes(), [], 'the site row was removed with another tab’s read under it')
    assert.equal(
      wizard.calls.filter((c) => c.init?.method === 'DELETE' || c.key.startsWith('DELETE')).length,
      0
    )
  })
}

test('S4-F003: a handover the door failed (5xx) is not told as the refusal its body names', async () => {
  const done = run({ id: 'run-1', state: 'done', step: 'handing_over', result: KEYS })
  for (const [status, body, key] of [
    [500, { code: 'NOT_SIGNED_IN' }, 'import_error_other'],
    [502, { code: 'ALREADY_PROVISIONED' }, 'import_error_other'],
    [500, { code: 'HOST_UPDATING' }, 'import_error_other'],
    [503, { code: 'HOST_UPDATING' }, 'import_error_host_updating'],
    [409, { code: 'ALREADY_PROVISIONED' }, 'import_error_already_provisioned'],
    // A code on a status the handover door does not send it with decides nothing.
    [404, { code: 'NOT_SIGNED_IN' }, 'import_error_other'],
    [400, { code: 'HOST_UPDATING' }, 'import_error_other'],
    [403, { code: 'ALREADY_PROVISIONED' }, 'import_error_other'],
    [400, { code: 'TAKEN' }, 'import_error_other']
  ]) {
    const wizard = await startImport({
      [CLAIM]: () => json(201, { siteKey: 'old-shop.example' }),
      [START]: () => json(202, { runId: 'run-1' }),
      [STATUS]: statusDoor({ bySite: NO_RUN, byRun: () => json(200, done) }),
      [PROVISION]: () => json(status, body)
    })
    await onePoll()
    assert.equal(wizard.count(PROVISION), 1)
    assert.deepEqual(
      shownError(),
      [key === 'import_error_other' ? t('import_problem_p43_what') : approved(key)],
      `${status} ${body.code}`
    )
    assert.equal(signInLinks().length, 0, `${status} ${body.code}`)
    assert.equal(
      buttons(t(key === 'import_error_host_updating' ? 'import_retry_now' : 'import_setup_again')).length,
      1
    )
    await closeWizards()
  }
})

test('an unconfirmed import can reopen the form after two minutes without authorizing a duplicate start', async (context) => {
  let clock = 1000000
  context.mock.method(Date, 'now', () => clock)
  const wizard = await startImport({
    [CLAIM]: inTurn(
      () => json(201, { siteKey: 'old-shop.example' }),
      () => json(200, { siteKey: 'old-shop.example', alreadyMine: true })
    ),
    [START]: lost,
    [STATUS]: statusDoor({ bySite: NO_RUN })
  })
  assert.equal(buttons(t('import_restart')).length, 0)
  assert.equal(button(t('import_check_status')).disabled, false)
  clock += 120001
  mock.timers.tick(5000)
  await settle()
  assert.equal(buttons(t('import_check_status')).length, 0, 'the expired status action is replaced')
  assert.deepEqual(
    [...document.querySelectorAll('[data-import-problem="p41"] button')].map((b) => b.textContent.trim()),
    [t('import_restart')],
    'the approved two-minute screen has exactly one action'
  )
  await press(t('import_restart'))
  const password = document.querySelector('input[type="password"]')
  assert.ok(password, 'safe restart returns to the credential form')
  await type(password, 'correct horse')
  await press(t('import_start'))
  assert.equal(wizard.count(START), 1, 'the earlier unknown start remains out in the guard')
  assert.deepEqual(wizard.deletes(), [])
  assert.deepEqual(shownError(), [approved('import_error_claim_stands')])
})

test('a late TAKEN race offers only the server supplied join path and rejects outside destinations', async () => {
  for (const [joinPath, expected] of [
    ['/actual-site-label/join', '/actual-site-label/join'],
    ['//attacker.example/join', null],
    ['https://attacker.example/join', null],
    ['/guessed/path', null]
  ]) {
    await startImport({ [CLAIM]: () => json(409, { code: 'TAKEN', joinPath }) })
    const joins = [...document.querySelectorAll('a')].filter(
      (link) => link.textContent === 'request to join it'
    )
    assert.equal(joins.length, expected ? 1 : 0)
    if (expected) assert.equal(joins[0].getAttribute('href'), expected)
    assert.equal(
      document.querySelector('a[href="https://discord.gg/BM9TMRcEBb"]').textContent,
      'Ask us on Discord'
    )
    await closeWizards()
  }
})

test('a real failed claim request shows the network warning without sending credentials or starting a read', async () => {
  const wizard = await startImport({ [CLAIM]: lost, [START]: () => json(202, { runId: 'must-not-start' }) })
  assert.equal(wizard.count(START), 0)
  assert.deepEqual(wizard.deletes(), [])
  const warning = document.querySelector('[data-import-problem="p45"]')
  assert.ok(warning)
  assert.equal(warning.querySelector('[role="status"]').textContent.trim(), t('import_problem_p45_what'))
  assert.equal(
    warning.querySelector('[data-slot="collapsible-trigger"]'),
    null,
    'the retry action keeps its resolution open'
  )
  assert.ok(warning.textContent.includes(t('import_retry')))
  assert.equal(document.querySelector('[data-import-problem="p45.server"]'), null)
})

test('My Sites resolution focuses the app tab through its supplied opener without opening a browser page', async () => {
  let opened = 0
  const browserPages = []
  window.open = (...args) => browserPages.push(args)
  await fillImport(
    { [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true }) },
    {
      onMySites: () => {
        opened++
      }
    }
  )
  await press(t('import_start'))
  const link = [...document.querySelectorAll('[data-import-problem] a')].find(
    (a) => a.textContent === 'My Sites'
  )
  assert.ok(link, 'the refusal offers My Sites')
  assert.equal(link.getAttribute('href'), '#my-sites')
  assert.equal(link.getAttribute('target'), null)
  link.click()
  await settle()
  assert.equal(opened, 1, 'the app tab opener runs once')
  assert.deepEqual(browserPages, [], 'the resolution never opens a browser page')
})

// ── The import recovery page (`?import=<siteKey>`): the run is rebuilt from the host, not the tab ──
//
// tracy-web sends a person whose import never finished here instead of into a site with no folder
// (`apps/tracy-web/src/lib/import-pending.js`). The page opens with nothing in this tab's memory —
// after a reload, or on another device — and must still offer Retry (#1578) or Continue (#1565).

/** The wizard as the recovery page opens it, with no resume pointer in this browser. */
async function recoverImport(table) {
  localStorage.removeItem('tracy.import.active')
  const calls = answer(table)
  await mount(
    lib,
    lib.createElement(lib.ImportWizard, { t, onProvisioned: () => {}, recover: 'old-shop.example' })
  )
  await settle()
  const count = (key) => calls.filter((c) => c.key === key).length
  return { calls, count }
}

test('recovery page: a failed read found on the host offers Retry, which starts under the claim naming that run', async () => {
  // A read that failed while sending files (`call_failed`): its action is Try again, back to the form.
  const failed = () =>
    json(200, run({ id: 'old-1', state: 'error', error: 'call_failed', step: 'reading_files' }))
  const page = await recoverImport({
    [STATUS]: statusDoor({ bySite: failed, byRun: failed }),
    [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true, retryable: true }),
    [START]: () => json(202, { runId: 'retry-2' })
  })
  assert.ok(document.body.textContent.includes(t('import_progress_title', { domain: 'old-shop.example' })))
  assert.equal(
    document.querySelector('[data-import-step="reading_files"]')?.getAttribute('data-state'),
    'failed'
  )
  assert.equal(page.count(START), 0, 'opening the page starts nothing')
  // The problem's own action is the way back to the form: the address and platform come from the host.
  await press(t('import_problem_p37_action_0'))
  const password = document.querySelector('input[type="password"]')
  assert.ok(password, 'Retry asks for the sign-in details again')
  const fields = [...document.querySelectorAll('input')].filter(
    (i) => i.type !== 'radio' && i.type !== 'checkbox'
  )
  const username = fields.find((i) => i.getAttribute('autocomplete') === 'username') ?? fields[1]
  assert.equal(
    fields[0].value,
    'https://old-shop.example/administrator',
    'the admin address comes from the host'
  )
  await type(username, 'admin')
  await type(password, 'correct horse')
  await press(t('wizard_continue'))
  await press(t('import_start'))
  assert.equal(page.count(START), 1)
  const started = JSON.parse(page.calls.find((c) => c.key === START).body)
  assert.equal(started.siteKey, 'old-shop.example')
  assert.equal(started.platform, 'joomla')
  assert.equal(started.retryOf, 'old-1')
  assert.doesNotMatch(document.body.textContent, RAW)
})

test('recovery page: an interrupted read found on the host offers Continue, with nothing typed again', async () => {
  const cut = () =>
    json(
      200,
      run({ id: 'cut-1', state: 'error', error: 'interrupted', resumable: true, step: 'reading_files' })
    )
  const page = await recoverImport({
    [STATUS]: statusDoor({ bySite: cut, byRun: cut }),
    [CLAIM]: () => json(200, { siteKey: 'old-shop.example', alreadyMine: true, retryable: true }),
    [START]: () => json(202, { runId: 'cut-2' })
  })
  assert.equal(document.querySelector('input[type="password"]'), null)
  await press(t('import_problem_p53_action_0'))
  assert.equal(page.count(START), 1)
  const started = JSON.parse(page.calls.find((c) => c.key === START).body)
  assert.deepEqual(started, { siteKey: 'old-shop.example', platform: 'joomla', retryOf: 'cut-1' })
})

test('recovery page: a read still going is followed, never started again', async () => {
  const going = () => json(200, run({ id: 'going-1' }))
  const page = await recoverImport({ [STATUS]: statusDoor({ bySite: going, byRun: going }) })
  assert.ok(document.body.textContent.includes(t('import_problem_p52_what', { domain: 'old-shop.example' })))
  assert.equal(page.count(START), 0)
  assert.equal(page.count(CLAIM), 0)
})

test('recovery page: no run on the host says so and starts nothing; an unreadable answer can be asked again', async () => {
  const page = await recoverImport({ [STATUS]: statusDoor({ bySite: NO_RUN }) })
  assert.equal(document.querySelector('[data-import-recover]')?.getAttribute('data-import-recover'), 'none')
  assert.ok(document.body.textContent.includes(t('import_problem_p54_what', { domain: 'old-shop.example' })))
  assert.equal(page.count(START) + page.count(CLAIM), 0)
  await closeWizards()

  const again = await recoverImport({
    [STATUS]: statusDoor({ bySite: inTurn(() => json(502, { code: 'INTERNAL_ERROR' }), NO_RUN) })
  })
  assert.equal(
    document.querySelector('[data-import-recover]')?.getAttribute('data-import-recover'),
    'unknown'
  )
  await press(t('import_check_status'))
  assert.equal(document.querySelector('[data-import-recover]')?.getAttribute('data-import-recover'), 'none')
  assert.equal(again.count(STATUS), 2)
  assert.doesNotMatch(document.body.textContent, RAW)
})

// ── The recovery page's Remove (PR #1598 part 2): one press asks, the second goes to the one door ──

const REMOVE = 'DELETE /api/sites/old-shop.example/import'

test('recovery page: Remove on a page with no record asks first, then removes, and the form comes back empty', async () => {
  const page = await recoverImport({
    [STATUS]: statusDoor({ bySite: NO_RUN }),
    [REMOVE]: () => json(200, { removed: true, artifactsKept: 0 })
  })
  await press(t('import_remove'))
  assert.ok(document.body.textContent.includes(t('import_remove_confirm', { domain: 'old-shop.example' })))
  assert.equal(page.count(REMOVE), 0, 'the first press only asks')
  await press(t('import_remove_yes'))
  assert.equal(page.count(REMOVE), 1)
  assert.ok(document.querySelector('[data-import-removed]'))
  assert.ok(document.body.textContent.includes(t('import_removed_title', { domain: 'old-shop.example' })))
  await press(t('import_handed_over_another'))
  assert.equal(document.querySelector('input[placeholder="yoursite.com"]')?.value, '')
  assert.doesNotMatch(document.body.textContent, RAW)
})

test('recovery page: a failed read offers Remove beside Retry; a read still going is said, and nothing changes', async () => {
  const failed = () =>
    json(200, run({ id: 'old-1', state: 'error', error: 'call_failed', step: 'reading_files' }))
  const page = await recoverImport({
    [STATUS]: statusDoor({ bySite: failed, byRun: failed }),
    [REMOVE]: inTurn(
      () => json(409, { code: 'IMPORT_RUNNING' }),
      () => json(503, { code: 'HOST_UNAVAILABLE' })
    )
  })
  assert.ok(button(t('import_problem_p37_action_0')), 'Retry stays')
  await press(t('import_remove'))
  await press(t('import_remove_yes'))
  assert.ok(document.body.textContent.includes(t('import_remove_running', { domain: 'old-shop.example' })))
  await press(t('import_remove_yes'))
  assert.ok(document.body.textContent.includes(t('import_remove_later', { domain: 'old-shop.example' })))
  assert.equal(page.count(REMOVE), 2)
  assert.equal(document.querySelector('[data-import-removed]'), null)
  assert.equal(
    document.querySelector('[data-import-step="reading_files"]')?.getAttribute('data-state'),
    'failed'
  )
})

test('the import form (not the recovery page) offers no Remove', async () => {
  await fillImport({})
  assert.equal(buttons(t('import_remove')).length, 0)
})

test('a start, retry or Continue refused because the import is being removed says so', async () => {
  const wizard = await startImport({ [CLAIM]: () => json(409, { code: 'IMPORT_REMOVING' }) })
  assert.equal(wizard.count(START), 0)
  assert.deepEqual(shownError(), [t('import_error_import_removing')])
})

test('verified early refusals retain the exact code and route to request recovery only on their documented status', async () => {
  for (const [status, code, guidance] of [
    [403, 'CSRF_ORIGIN', 'reload'],
    [400, 'INVALID_REQUEST', 'request'],
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'request'],
    [400, 'INVALID_BUILD_ID', 'request'],
    [409, 'TEMPLATE_VERSION_CHANGED', 'template'],
    [409, 'DESIGN_PLAN_CHANGED', 'template'],
    [403, 'DS_TEMPLATE_LOCKED', 'system_locked'],
    [400, 'DEMO_WORKFLOW_INVALID', 'request'],
    [409, 'AGENT_DEMO_CREATE_REFUSED', 'request'],
    [403, 'ACCOUNT_NOT_ON_SHARD', 'account']
  ]) {
    const { outcome, calls } = await create(() => json(status, { code }))
    assert.equal(outcome.code, code)
    assert.equal(calls.length, 1)
    assert.equal(createRefusalGuidance(outcome), guidance, code)
    assert.equal(createRefusalTitle(guidance), 'create_title_request', code)
    const wrong = await create(() => json(502, { code }))
    assert.equal(wrong.outcome.code, 'HTTP_502', code)
    assert.equal(createRefusalGuidance(wrong.outcome), 'unconfirmed', code)
    assert.equal(createRefusalTitle(createRefusalGuidance(wrong.outcome)), 'create_title_unconfirmed')
  }
  assert.equal(createRefusalTitle('updating'), 'create_title_unconfirmed')
  assert.equal(lib.en.create_title_request, 'Your site was not created')
})
