/**
 * My Sites says what to do when the seat book refuses a row action (#796, F-S3-015).
 *
 * A session that ended while the tab stood open used to read "The seat book could not complete
 * that" for an accept and for a leave alike — true, and no help. The REAL `MySitesTab` is bundled by
 * esbuild and mounted with React into jsdom; `/api/sites`, `/api/team`, `/auth/me` and the write
 * itself are answered by a replaced `fetch`, and every press is a real DOM event.
 *
 * What jsdom does not do: lay out or paint; the e2e suites beside this file cover that in a browser.
 *
 *   node --test packages/site/tracy-my-sites/test/error-next-step.test.mjs
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
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PACKAGE = 'packages/site/tracy-my-sites'
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
    // The build inlines the plugin's stylesheet through this constant; a test needs none.
    define: { __TAILWIND_CSS__: '""' },
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

/** Let pending promises, renders and effects run: a few turns of the timer queue. */
async function settle() {
  for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    await settle()
    host.remove()
  }
  document.body.replaceChildren()
  globalThis.fetch = realFetch
  // The page keeps one `/api/sites` answer for every reader (tracy-sidebar `sites.mjs`); a case
  // that rereads the list must not hand its answer to the next case's first read.
  for (const scope of [globalThis, window]) delete scope[Symbol.for('tracy.api.sites.v2')]
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
  const target = typeof name === 'string' ? button(name) : name
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
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

before(async () => {
  browser('http://tracy.test/alpha.example/')
  lib = await bundle(
    'my-sites',
    `
      export { createElement } from 'react'
      export { createRoot } from 'react-dom/client'
      export { TabLoadingScope } from '@tracy/ui'
      export { MySitesTab } from './index'
      export { en } from './strings'
    `
  )
})

/** The plugin's own English, `{name}` filled; a key the table lacks reads as `⟦key⟧`. */
const t = (key, params) =>
  Object.hasOwn(lib.en, key)
    ? lib.en[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))
    : `⟦${key}⟧`

/** Machine codes that must never be on screen. */
const RAW =
  /NOT_SIGNED_IN|SEAT_NOT_AUTHORIZED|JOIN_REQUEST_PENDING|RATE_LIMITED|ALREADY_GRANTED|NOT_SITE_OWNER|CANNOT_REVOKE_LAST_OWNER|MADE_UP_CODE|seat book|⟦/

const row = (siteKey, extra = {}) => ({
  siteKey,
  platform: 'wordpress',
  role: 'editor',
  status: 'accepted',
  createdAt: '2026-09-30T08:00:00.000Z',
  agent: '/',
  copyUrl: `https://${siteKey}`,
  ...extra
})

/** The tab, standing in `alpha.example`, holding a seat there and an unanswered invitation. */
async function openTab(table) {
  const calls = answer({
    'GET /auth/me': () => json(200, { email: 'me@example.test' }),
    'GET /api/team': () => json(200, { sites: [] }),
    'GET /api/sites': () =>
      json(200, {
        sites: [row('alpha.example'), row('invited.example', { status: 'invited', agent: null })]
      }),
    ...table
  })
  await mount(
    lib,
    lib.createElement(
      lib.TabLoadingScope,
      { label: t('loading.label') },
      lib.createElement(lib.MySitesTab, { t })
    )
  )
  await settle()
  return calls
}

const alerts = () => [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim())

const ACCEPT = 'POST /api/sites/invited.example/accept'
const LEAVE = 'POST /api/sites/alpha.example/leave'

for (const [name, route, key] of [
  ['the session ended', () => json(401, { code: 'NOT_SIGNED_IN' }), 'error.signedOut'],
  ['a 401 that is not JSON', () => notJson(401), 'error.signedOut'],
  ['the invitation is gone', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.acceptGone'],
  [
    'it is the viewer’s own request',
    () => json(409, { code: 'JOIN_REQUEST_PENDING' }),
    'error.acceptRequested'
  ],
  ['too many changes', () => json(429, { code: 'RATE_LIMITED' }), 'error.rateLimited'],
  ['an unnamed failure', () => json(500, { code: 'MADE_UP_CODE' }), 'error.failed'],
  // A 4xx nobody named is still a considered refusal: nothing was changed (#801).
  ['an unnamed refusal', () => json(404, { code: 'SITE_UNKNOWN' }), 'error.refused'],
  ['a refusal that is not JSON', () => notJson(400), 'error.refused'],
  // A failed door is not a refusal, whatever its body names.
  ['a 500 that names an ended session', () => json(500, { code: 'NOT_SIGNED_IN' }), 'error.failed'],
  ['a 502 that names a gone invitation', () => json(502, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.failed'],
  // A code is read only on the status the accept door sends it with; elsewhere the status decides.
  ['a 404 that names an ended session', () => json(404, { code: 'NOT_SIGNED_IN' }), 'error.refused'],
  ['a 400 that names a rate limit', () => json(400, { code: 'RATE_LIMITED' }), 'error.refused'],
  ['a 409 that names a gone invitation', () => json(409, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.refused'],
  [
    'a 401 that names a pending request',
    () => json(401, { code: 'JOIN_REQUEST_PENDING' }),
    'error.signedOut'
  ],
  // A 403 is a gone invitation only when the accept door says so by its own code.
  ['a 403 that names a pending request', () => json(403, { code: 'JOIN_REQUEST_PENDING' }), 'error.refused'],
  ['a 403 that is not JSON', () => notJson(403), 'error.refused'],
  ['a 403 with no code', () => json(403, {}), 'error.refused'],
  ['a 403 that names a role', () => json(403, { code: 'NOT_SITE_OWNER' }), 'error.refused'],
  // The accept door never answers ALREADY_GRANTED: no failed answer is a quiet success.
  ['a 500 that names a seat already held', () => json(500, { code: 'ALREADY_GRANTED' }), 'error.failed'],
  ['a 502 that names a seat already held', () => json(502, { code: 'ALREADY_GRANTED' }), 'error.failed'],
  ['a 409 that names a seat already held', () => json(409, { code: 'ALREADY_GRANTED' }), 'error.refused'],
  ['a 401 that names a seat already held', () => json(401, { code: 'ALREADY_GRANTED' }), 'error.signedOut'],
  [
    'a network failure',
    () => {
      throw new TypeError('fetch failed')
    },
    'error.failed'
  ]
]) {
  test(`F-S3-015: accepting an invitation refused (${name}) says its own sentence`, async () => {
    const calls = await openTab({ [ACCEPT]: route })
    await press(t('action.accept'))
    assert.equal(calls.filter((c) => c.key === ACCEPT).length, 1)
    assert.deepEqual(alerts(), [t(key)])
    assert.doesNotMatch(document.body.textContent, RAW)
    // The invitation is still there to press again once the cause is dealt with.
    assert.equal(button(t('action.accept')).disabled, false)
  })
}

for (const [name, route, key] of [
  ['the session ended', () => json(401, { code: 'NOT_SIGNED_IN' }), 'error.signedOut'],
  ['a 401 that is not JSON', () => notJson(401), 'error.signedOut'],
  // The leave door's 403 SEAT_NOT_AUTHORIZED is "no seat any more" (seats/route.js), not a role.
  ['the seat is gone', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.noSeat'],
  // A 403 with no code of the door's has no known reason: neither a role nor a lost seat is guessed.
  ['a 403 that is not JSON', () => notJson(403), 'error.refused'],
  ['a 403 with no code', () => json(403, {}), 'error.refused'],
  ['a 403 with a code that is not a word', () => json(403, { code: 7 }), 'error.refused'],
  [
    'a 403 that names a code of another door',
    () => json(403, { code: 'CANNOT_REVOKE_SELF' }),
    'error.refused'
  ],
  ['the last Owner', () => json(403, { code: 'CANNOT_REVOKE_LAST_OWNER' }), 'error.lastOwner'],
  ['a role the viewer lacks', () => json(403, { code: 'NOT_SITE_OWNER' }), 'error.notSiteOwner'],
  ['too many changes', () => json(429, { code: 'RATE_LIMITED' }), 'error.rateLimited'],
  ['an unnamed failure', () => json(500, { code: 'MADE_UP_CODE' }), 'error.failed'],
  ['an unnamed refusal', () => json(404, { code: 'SITE_UNKNOWN' }), 'error.refused'],
  ['a refusal that is not JSON', () => notJson(400), 'error.refused'],
  // A code is read only on the status the leave door sends it with; elsewhere the status decides.
  ['a 404 that names an ended session', () => json(404, { code: 'NOT_SIGNED_IN' }), 'error.refused'],
  ['a 409 that names the last Owner', () => json(409, { code: 'CANNOT_REVOKE_LAST_OWNER' }), 'error.refused'],
  ['a 400 that names a role', () => json(400, { code: 'NOT_SITE_OWNER' }), 'error.refused'],
  ['a 400 that names a rate limit', () => json(400, { code: 'RATE_LIMITED' }), 'error.refused'],
  [
    'a 401 that names the last Owner',
    () => json(401, { code: 'CANNOT_REVOKE_LAST_OWNER' }),
    'error.signedOut'
  ],
  ['a 500 that names an ended session', () => json(500, { code: 'NOT_SIGNED_IN' }), 'error.failed'],
  ['a 503 that names the last Owner', () => json(503, { code: 'CANNOT_REVOKE_LAST_OWNER' }), 'error.failed']
]) {
  test(`F-S3-015: leaving a site refused (${name}) says its own sentence in the dialog`, async () => {
    const calls = await openTab({ [LEAVE]: route })
    const more = [...document.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.includes('alpha.example'))
      .querySelector(`button[aria-label="${t('action.more')}"]`)
    assert.ok(more, 'the row has a More menu')
    await press(more)
    const leave = [...document.querySelectorAll('[role="menuitem"], button')].find(
      (n) => n.textContent.trim() === t('more.leave')
    )
    assert.ok(leave, 'the menu offers Leave site')
    await press(leave)
    await press(t('leave.confirm'))
    assert.equal(calls.filter((c) => c.key === LEAVE).length, 1)
    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog, 'the dialog stays open on a refusal')
    assert.ok(dialog.textContent.includes(t(key)), dialog.textContent)
    assert.doesNotMatch(document.body.textContent, RAW)
  })
}

const DECLINE = 'POST /api/sites/invited.example/decline'
const SITES = 'GET /api/sites'

/** Press Decline on the invitation, then confirm in the dialog that asks first. */
async function declineInvitation(table) {
  const calls = await openTab(table)
  await press(t('action.decline'))
  const dialog = document.querySelector('[role="dialog"]')
  assert.ok(dialog, 'Decline asks first')
  const confirm = [...dialog.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === t('action.decline')
  )
  assert.ok(confirm, 'the dialog has its Decline button')
  await press(confirm)
  return calls
}

test('F-S3-015: declining an invitation already accepted (409 ALREADY_GRANTED) closes the dialog, rereads the list and says so', async () => {
  let accepted = false
  const calls = await declineInvitation({
    [SITES]: () =>
      json(200, {
        sites: [
          row('alpha.example'),
          row('invited.example', accepted ? {} : { status: 'invited', agent: null })
        ]
      }),
    [DECLINE]: () => {
      accepted = true
      return json(409, { code: 'ALREADY_GRANTED' })
    }
  })
  assert.equal(calls.filter((c) => c.key === DECLINE).length, 1)
  // A boolean, not the node: a failing comparison must not print the whole document.
  assert.ok(document.querySelector('[role="dialog"]') === null, 'the dialog is closed')
  // The list was read again after the answer, and the row is a site of theirs now.
  const order = calls.map((c) => c.key)
  assert.ok(order.lastIndexOf(SITES) > order.indexOf(DECLINE), 'the list is reread after the answer')
  assert.equal(
    [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === t('action.decline'))
      .length,
    0,
    'the row no longer offers Decline'
  )
  assert.ok(Object.hasOwn(lib.en, 'error.declineAccepted'), 'error.declineAccepted is missing')
  assert.deepEqual(alerts(), [t('error.declineAccepted')])
  assert.match(lib.en['error.declineAccepted'], /already accepted/)
  assert.match(lib.en['error.declineAccepted'], /Leave site/)
  assert.doesNotMatch(document.body.textContent, RAW)
})

for (const [name, route, key] of [
  // The decline door sends ALREADY_GRANTED with 409 only: elsewhere the status decides.
  ['a 500 that names a seat already held', () => json(500, { code: 'ALREADY_GRANTED' }), 'error.failed'],
  ['a 502 that names a seat already held', () => json(502, { code: 'ALREADY_GRANTED' }), 'error.failed'],
  ['a 404 that names a seat already held', () => json(404, { code: 'ALREADY_GRANTED' }), 'error.refused'],
  ['a 401 that names a seat already held', () => json(401, { code: 'ALREADY_GRANTED' }), 'error.signedOut'],
  ['a 409 with another code', () => json(409, { code: 'MADE_UP_CODE' }), 'error.refused'],
  ['a 409 that is not JSON', () => notJson(409), 'error.refused'],
  ['the invitation is gone', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.acceptGone'],
  [
    'it is the viewer’s own request',
    () => json(409, { code: 'JOIN_REQUEST_PENDING' }),
    'error.acceptRequested'
  ]
]) {
  test(`F-S3-015: declining an invitation refused (${name}) says its sentence in the dialog, which stays`, async () => {
    const calls = await declineInvitation({ [DECLINE]: route })
    assert.equal(calls.filter((c) => c.key === DECLINE).length, 1)
    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog, 'the dialog stays open on a failed answer')
    assert.deepEqual(
      [...dialog.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim()),
      [t(key)]
    )
    // Nothing was silently dropped: the list was not reread as if the answer were a success.
    const order = calls.map((c) => c.key)
    assert.ok(order.lastIndexOf(SITES) < order.indexOf(DECLINE), 'no reread after a failed answer')
    assert.doesNotMatch(document.body.textContent, RAW)
  })
}

// ── An answer that arrives after its dialog is gone ─────────────────────────────────────────
//
// A dialog's write can be answered after that dialog was dismissed and another one opened for
// another site. The answer belongs to the opening it was pressed in: it never closes, and never
// writes into, a dialog opened since. What it has to say is told above the list.

/** A promise the test settles when it chooses, to hold an answer back. */
function held() {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}
const rowOf = (siteKey) =>
  [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(siteKey))
const openDialogNode = () => document.querySelector('[role="dialog"]')
const dialogAlerts = () =>
  [...(openDialogNode()?.querySelectorAll('[role="alert"]') ?? [])].map((n) => n.textContent.trim())
/** Alerts on the page that are not inside a dialog. */
const pageAlerts = () =>
  [...document.querySelectorAll('[role="alert"]')]
    .filter((n) => !n.closest('[role="dialog"]'))
    .map((n) => n.textContent.trim())
/** Dismiss the open dialog the way a person can while its buttons are busy: Escape. */
async function dismiss() {
  const target = document.activeElement ?? document.body
  target.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
  await settle()
  assert.ok(openDialogNode() === null, 'Escape dismisses the dialog')
}
/** Open the Decline dialog of one invitation row; `confirm` also presses its Decline button. */
async function askDecline(siteKey, confirm) {
  const ask = [...rowOf(siteKey).querySelectorAll('button')].find(
    (b) => b.textContent.trim() === t('action.decline')
  )
  assert.ok(ask, `${siteKey} offers Decline`)
  await press(ask)
  const dialog = openDialogNode()
  assert.ok(dialog?.textContent.includes(siteKey), `the dialog asks about ${siteKey}`)
  if (!confirm) return
  await press(
    [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === t('action.decline'))
  )
}
const OTHER_DECLINE = 'POST /api/sites/other.example/decline'
const twoInvitations = (gone = []) =>
  json(200, {
    sites: [
      row('alpha.example'),
      ...['invited.example', 'other.example']
        .filter((k) => !gone.includes(k))
        .map((k) => row(k, { status: 'invited', agent: null }))
    ]
  })

for (const [name, late, sentence] of [
  ['409 ALREADY_GRANTED', () => json(409, { code: 'ALREADY_GRANTED' }), 'error.declineAccepted'],
  ['a 500', () => json(500, { code: 'MADE_UP_CODE' }), 'error.failed'],
  ['a refusal', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.acceptGone'],
  ['a network failure', () => Promise.reject(new TypeError('fetch failed')), 'error.failed'],
  ['a success', () => json(200, { ok: true }), null]
]) {
  test(`F-S3-015: a late Decline answer (${name}) leaves the dialog opened since for another site alone`, async () => {
    const wait = held()
    const calls = await openTab({
      [SITES]: () => twoInvitations(),
      [DECLINE]: async () => {
        await wait.promise
        return late()
      }
    })
    await askDecline('invited.example', true)
    await dismiss()
    await askDecline('other.example', false)
    wait.release()
    await settle()
    await settle()
    // The dialog of the other site is still open, still about that site, and says nothing.
    const dialog = openDialogNode()
    assert.ok(dialog?.textContent.includes('other.example'), 'the other site’s dialog stays open')
    assert.deepEqual(dialogAlerts(), [])
    // What the late answer has to say is above the list, not lost and not in that dialog.
    assert.deepEqual(pageAlerts(), sentence === null ? [] : [t(sentence)])
    // Nothing was sent for the other site.
    assert.equal(calls.filter((c) => c.key === OTHER_DECLINE).length, 0)
    assert.doesNotMatch(document.body.textContent, RAW)
  })
}

test('F-S3-015: a Decline answered 409 ALREADY_GRANTED whose reread is slow says so above the list, not in a dialog opened meanwhile', async () => {
  let answered = false
  const wait = held()
  const calls = await openTab({
    [SITES]: async () => {
      if (!answered) return twoInvitations()
      await wait.promise
      return json(200, {
        sites: [
          row('alpha.example'),
          row('invited.example'),
          row('other.example', { status: 'invited', agent: null })
        ]
      })
    },
    [DECLINE]: () => {
      answered = true
      return json(409, { code: 'ALREADY_GRANTED' })
    }
  })
  await askDecline('invited.example', true)
  // The answer is in and its dialog is closed; the reread of the list is still out.
  assert.ok(openDialogNode() === null, 'the answered dialog is closed')
  await askDecline('other.example', false)
  wait.release()
  await settle()
  await settle()
  assert.ok(openDialogNode()?.textContent.includes('other.example'), 'the other site’s dialog stays open')
  assert.deepEqual(dialogAlerts(), [])
  assert.deepEqual(pageAlerts(), [t('error.declineAccepted')])
  assert.equal(calls.filter((c) => c.key === OTHER_DECLINE).length, 0)
})

test('F-S3-015: a failure in a Decline dialog does not follow the person into the next dialog', async () => {
  await openTab({
    [SITES]: () => twoInvitations(),
    [DECLINE]: () => json(500, { code: 'MADE_UP_CODE' })
  })
  await askDecline('invited.example', true)
  assert.deepEqual(dialogAlerts(), [t('error.failed')])
  await dismiss()
  await askDecline('other.example', false)
  assert.deepEqual(dialogAlerts(), [])
  assert.deepEqual(pageAlerts(), [])
})

/** Open the Leave dialog of one row from its More menu; `confirm` also presses its button. */
async function askLeave(siteKey, confirm) {
  await press(rowOf(siteKey).querySelector(`button[aria-label="${t('action.more')}"]`))
  const leave = [...document.querySelectorAll('[role="menuitem"], button')].find(
    (n) => n.textContent.trim() === t('more.leave')
  )
  assert.ok(leave, 'the menu offers Leave site')
  await press(leave)
  assert.ok(openDialogNode()?.textContent.includes(siteKey), `the dialog asks about ${siteKey}`)
  if (confirm) await press(t('leave.confirm'))
}

for (const [name, late, sentence] of [
  ['a refusal', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.noSeat'],
  ['a 500', () => json(500, { code: 'MADE_UP_CODE' }), 'error.failed'],
  ['a network failure', () => Promise.reject(new TypeError('fetch failed')), 'error.failed'],
  ['a success', () => json(200, { ok: true }), null]
]) {
  test(`F-S3-015: a late Leave answer (${name}) leaves the dialog opened since for another site alone`, async () => {
    const wait = held()
    const calls = await openTab({
      [SITES]: () => json(200, { sites: [row('alpha.example'), row('beta.example')] }),
      [LEAVE]: async () => {
        await wait.promise
        return late()
      }
    })
    await askLeave('alpha.example', true)
    await dismiss()
    await askLeave('beta.example', false)
    wait.release()
    await settle()
    await settle()
    assert.ok(openDialogNode()?.textContent.includes('beta.example'), 'the other site’s dialog stays open')
    assert.deepEqual(dialogAlerts(), [])
    assert.deepEqual(pageAlerts(), sentence === null ? [] : [t(sentence)])
    assert.equal(calls.filter((c) => c.key === 'POST /api/sites/beta.example/leave').length, 0)
    assert.doesNotMatch(document.body.textContent, RAW)
  })
}

test('the sentence for an ended session is in the plugin’s English table and names the next step', () => {
  assert.ok(Object.hasOwn(lib.en, 'error.signedOut'), 'error.signedOut is missing')
  assert.match(lib.en['error.signedOut'], /sign in/i)
  assert.doesNotMatch(lib.en['error.signedOut'], /seat book|[A-Z]{3,}_[A-Z_]+/)
})

test('the sentence for a refusal nobody named says what to do, and names no internal part of Tracy', () => {
  assert.match(lib.en['error.failed'], /Reload the page/)
  assert.doesNotMatch(lib.en['error.failed'], /seat book|nothing was changed|[A-Z]{3,}_[A-Z_]+/i)
})

test('the sentence for an unnamed 4xx keeps saying nothing was changed (#801) and names the next step', () => {
  assert.ok(Object.hasOwn(lib.en, 'error.refused'), 'error.refused is missing')
  assert.match(lib.en['error.refused'], /nothing was changed/)
  assert.match(lib.en['error.refused'], /Reload the page/)
  assert.doesNotMatch(lib.en['error.refused'], /seat book|[A-Z]{3,}_[A-Z_]+/)
})

/**
 * The two readers on their own. Built apart from the tab so a tree that has no `row-errors.ts`
 * (the base commit) fails these cases by assertion and still mounts the tab for the others.
 */
let readersBuilt
const readers = () =>
  (readersBuilt ??= bundle('row-errors', `export { acceptErrorKey, rowErrorKey } from './row-errors'`).catch(
    () => null
  ))

// The delete door (`DELETE /api/sites/:key`, sites/route.js) answers through the same reader.
for (const [name, status, code, key] of [
  ['no seat on the site', 403, 'SEAT_NOT_AUTHORIZED', 'error.noSeat'],
  ['a seat that is not an Owner’s', 403, 'NOT_SITE_OWNER', 'error.notSiteOwner'],
  ['a 403 with no code', 403, undefined, 'error.refused'],
  ['a 403 with a code nobody knows', 403, 'MADE_UP_CODE', 'error.refused'],
  ['a 401 with no code', 401, undefined, 'error.signedOut'],
  ['a 502 that names a lost seat', 502, 'SEAT_NOT_AUTHORIZED', 'error.failed'],
  // The host could not take the site off it: not deleted, and said with what to do next.
  ['a teardown the host could not finish', 409, 'TEARDOWN_FAILED', 'error.deleteHostFailed'],
  ['that code on another status', 403, 'TEARDOWN_FAILED', 'error.refused'],
  ['a 409 with no code', 409, undefined, 'error.refused']
]) {
  test(`F-S3-015: deleting a site refused (${name}) is read by the door’s own status and code`, async () => {
    const read = await readers()
    assert.ok(read, 'row-errors.ts is missing')
    assert.equal(read.rowErrorKey(status, code), key)
    assert.ok(Object.hasOwn(lib.en, key), `${key} is missing`)
  })
}

test('F-S3-015: a 403 on an accept is a gone invitation only under the door’s own code', async () => {
  const read = await readers()
  assert.ok(read, 'row-errors.ts is missing')
  assert.equal(read.acceptErrorKey(403, 'SEAT_NOT_AUTHORIZED'), 'error.acceptGone')
  assert.equal(read.acceptErrorKey(403, undefined), 'error.refused')
})

/** A sentence about a role or a lost seat tells the reader what to do next, not only who may. */
const NEXT_STEP = /\b(Ask|Reload|Make|Choose)\b/
for (const key of ['error.notSiteOwner', 'error.noSeat', 'error.lastOwner', 'error.acceptGone']) {
  test(`F-S3-015: the My Sites sentence ${key} names a next step, and no role it cannot vouch for`, () => {
    assert.ok(Object.hasOwn(lib.en, key), `${key} is missing`)
    assert.match(lib.en[key], NEXT_STEP)
    assert.doesNotMatch(lib.en[key], /^Only an Owner or Admin can do this\.$/)
    assert.doesNotMatch(lib.en[key], /seat book|[A-Z]{3,}_[A-Z_]+/)
  })
}

test('F-S3-015: a lost seat is not told as a missing role', () => {
  assert.doesNotMatch(lib.en['error.noSeat'] ?? '', /role/i)
  assert.match(lib.en['error.noSeat'] ?? '', /no longer have a seat/)
})
