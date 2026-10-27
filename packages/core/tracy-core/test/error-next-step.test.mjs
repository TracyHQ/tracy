/**
 * The seat book's refusals on the three shared screens, each with a next step (#796):
 * the invite wizard's per-site outcome, a write on the Team tab, and the site address form.
 *
 * The REAL components are bundled by esbuild and mounted with React into jsdom; `fetch` is the one
 * thing replaced, and every press is a real DOM event. The words are the real English table of
 * `@tracy/dsh-site-tabs` (the plugin that mounts these screens), so an assertion on a sentence is an
 * assertion on what a person reads.
 *
 * What jsdom does not do: lay out, paint, or run a real network. Nothing here shows how a sentence
 * wraps in a narrow panel.
 *
 *   node --test packages/core/tracy-core/test/error-next-step.test.mjs
 *
 * `TRACY_TEST_DEPS_ROOT`: where esbuild, jsdom and the npm packages are resolved from when this
 * file runs from a copy of the tree with no install of its own (the red-before-fix run against the
 * base sources). The sources under test always come from the tree this file stands in.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const depsRoot = process.env.TRACY_TEST_DEPS_ROOT || repo
const PACKAGE = 'packages/core/tracy-core'
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

const { en } = await import(
  pathToFileURL(path.join(repo, 'packages/site/tracy-site-tabs/src/client/strings.ts')).href
)
/** The plugin's own English, `{name}` filled; a key the table lacks reads as `⟦key⟧`, never as text. */
const t = (key, params) =>
  Object.hasOwn(en, key) ? en[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? '')) : `⟦${key}⟧`

/** Machine codes and internal words that must never be on screen. */
const RAW =
  /NOT_SITE_OWNER|SEAT_NOT_AUTHORIZED|GRANT_UNKNOWN|NOT_SIGNED_IN|SITE_UNKNOWN|SITE_NOT_READY|NAME_NOT_RESERVED|RATE_LIMITED|MADE_UP_CODE|seat book|⟦/

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let dom
const realFetch = globalThis.fetch

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://tracy.test/a.example/'
  })
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
    'getComputedStyle'
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

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'core-error-next-step-'))
  const outfile = path.join(outDir, 'screens.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { createRoot } from 'react-dom/client'
        export { InviteWizard } from './team/wizard'
        export { TeamView } from './site-tabs/TeamView'
        export { PublishView } from './site-tabs/PublishView'
      `,
      resolveDir: path.join(repo, PACKAGE, 'src'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    nodePaths: [path.join(depsRoot, PACKAGE, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  globalThis.fetch = realFetch
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const mounted = []

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    await settle()
    host.remove()
  }
  document.body.replaceChildren()
  globalThis.fetch = realFetch
})

/** Let pending promises, renders and effects run: a few turns of the timer queue. */
async function settle() {
  for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function mount(element) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  root.render(element)
  await settle()
  return { root, host }
}

const buttons = () => [...document.querySelectorAll('button')]
/** The one enabled-or-not button whose text or accessible name is exactly `name`. */
function button(name) {
  const found = buttons().filter(
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
/** Type into a React-controlled input the way a browser does. */
async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  await settle()
}
const text = () => document.body.textContent
const alerts = () => [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim())

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const notJson = (status) => new Response('<html>Bad Gateway</html>', { status })

/** Replace `fetch` with a table of `"METHOD /path" → () => Response`, recording every call. */
function answer(table) {
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://tracy.test')
    const key = `${(init.method ?? 'GET').toUpperCase()} ${url.pathname}`
    calls.push({ key, search: url.search, body: init.body ?? null })
    const route = table[key]
    if (!route) return json(404, { code: 'NOT_FOUND' })
    return route({ url, init })
  }
  return calls
}

// ── F-S3-005: the invite wizard ─────────────────────────────────────────────────────────────────

const INVITABLE = ['one', 'two', 'three', 'four', 'five', 'six'].map((name) => ({
  siteKey: `${name}.example`,
  platform: null,
  myRole: 'owner'
}))

/** The wizard opened on Role for one address and every site, taken to Review and sent. */
async function sendInvite(route) {
  const calls = answer({ 'POST /api/team/invite': route })
  let sent = 0
  await mount(
    lib.createElement(lib.InviteWizard, {
      open: true,
      onOpenChange: () => {},
      sites: INVITABLE,
      preset: { emails: ['new@example.test'], siteKeys: INVITABLE.map((s) => s.siteKey) },
      onSent: () => {
        sent += 1
      },
      t
    })
  )
  await press(t('wizard.continue'))
  await press(t('wizard.send'))
  return { calls, sent: () => sent }
}

const ALL_SITES = INVITABLE.map((s) => s.siteKey)
/** One person's entry of the door's answer, every named site invited. */
const answered = (email, siteKeys) => ({
  email,
  notified: true,
  sites: siteKeys.map((siteKey) => ({ siteKey, outcome: 'invited' }))
})

/** The outcome row of one site on the Sent step, as text. */
function outcomeRow(siteKey) {
  const row = [...document.querySelectorAll('li')].find(
    (li) => li.querySelector('li') === null && li.textContent.includes(siteKey)
  )
  assert.ok(row, `no outcome row for ${siteKey}`)
  return row.textContent
}

test('F-S3-005: each refused site says why and what to do next; the outcome stays per site', async () => {
  const { sent } = await sendInvite(() =>
    json(200, {
      results: [
        {
          email: 'new@example.test',
          notified: true,
          sites: [
            { siteKey: 'one.example', outcome: 'refused', code: 'NOT_SITE_OWNER' },
            { siteKey: 'two.example', outcome: 'refused', code: 'SEAT_NOT_AUTHORIZED' },
            { siteKey: 'three.example', outcome: 'refused', code: 'GRANT_UNKNOWN' },
            { siteKey: 'four.example', outcome: 'invited' },
            { siteKey: 'five.example', outcome: 'already_granted' },
            { siteKey: 'six.example', outcome: 'approved' }
          ]
        }
      ]
    })
  )
  assert.equal(sent(), 1)
  const rows = Object.fromEntries(INVITABLE.map((s) => [s.siteKey, outcomeRow(s.siteKey)]))
  const generic = `${'x.example'}${t('outcome.refused')}`.replace('x.example', '')
  // The three named refusals are three different lines, none of them the bare generic one.
  const named = [rows['one.example'], rows['two.example'], rows['three.example']].map((row, i) =>
    row.replace(INVITABLE[i].siteKey, '')
  )
  assert.equal(new Set(named).size, 3, `the three refusals read the same: ${JSON.stringify(named)}`)
  for (const line of named) assert.notEqual(line, generic)
  assert.ok(rows['one.example'].includes(t('outcome.next.notSiteOwner')))
  assert.ok(rows['two.example'].includes(t('outcome.next.notAuthorized')))
  assert.ok(rows['three.example'].includes(t('outcome.next.changed')))
  // A site that went through keeps its own outcome beside the refused ones.
  assert.equal(rows['four.example'], `four.example${t('outcome.invited')}`)
  assert.doesNotMatch(text(), RAW)
})

test('F-S3-005: the answer to what was sent is drawn, whatever the case of an address or the order', async () => {
  const { sent } = await sendInvite(() =>
    json(200, { results: [answered('New@Example.test', [...ALL_SITES].reverse())] })
  )
  assert.equal(sent(), 1)
  assert.deepEqual(alerts(), [])
  assert.ok(button(t('wizard.done')), 'the Sent step')
  // One address that went out to every site is the Done step's single sentence (#809), naming
  // the address and the sites as the door answered them.
  const sites = [...ALL_SITES].reverse().join(', ')
  assert.ok(text().includes(t('wizard.doneTitle')))
  assert.ok(text().includes(t('wizard.doneBody', { email: 'New@Example.test', site: sites })))
})

// `reread`: whether the tab is told to read the books again. A 4xx is the door refusing before it
// wrote anything; a 5xx can follow seats already written, so its outcome is not known.
for (const [name, route, key, reread] of [
  ['the session ended', () => json(401, { code: 'NOT_SIGNED_IN' }), 'state.signedOut', 0],
  ['a 401 that is not JSON', () => notJson(401), 'state.signedOut', 0],
  ['too many invitations', () => json(429, { code: 'RATE_LIMITED' }), 'error.rateLimited', 0],
  ['an unnamed refusal', () => json(400, { code: 'MADE_UP_CODE' }), 'wizard.failed', 0],
  // A code is read only on the status the invite door sends it with; elsewhere the status decides.
  ['a 404 that names an ended session', () => json(404, { code: 'NOT_SIGNED_IN' }), 'wizard.failed', 0],
  ['a 400 that names a rate limit', () => json(400, { code: 'RATE_LIMITED' }), 'wizard.failed', 0],
  ['a 401 that names a rate limit', () => json(401, { code: 'RATE_LIMITED' }), 'state.signedOut', 0],
  ['a 429 that names an ended session', () => json(429, { code: 'NOT_SIGNED_IN' }), 'error.rateLimited', 0],
  ['a gateway page', () => notJson(502), 'wizard.unknown', 1],
  ['a failure after the door began', () => json(500, { code: 'MADE_UP_CODE' }), 'wizard.unknown', 1],
  // A failed door is unconfirmed whatever code its body carries: seats may already be written.
  ['a 500 that names an ended session', () => json(500, { code: 'NOT_SIGNED_IN' }), 'wizard.unknown', 1],
  ['a 503 that names a rate limit', () => json(503, { code: 'RATE_LIMITED' }), 'wizard.unknown', 1]
]) {
  test(`F-S3-005: a run refused whole (${name}) stays on Review with its own sentence`, async () => {
    const { sent } = await sendInvite(route)
    assert.equal(sent(), reread)
    assert.deepEqual(alerts(), [t(key)])
    assert.ok(button(t('wizard.send')), 'still on Review, the send can be pressed again')
    assert.doesNotMatch(text(), RAW)
  })
}

for (const [name, route] of [
  ['an empty object', () => json(200, {})],
  ['a list', () => json(200, [])],
  ['null', () => json(200, null)],
  ['results that is not a list', () => json(200, { results: 'done' })],
  ['an entry with no sites', () => json(200, { results: [{ email: 'new@example.test', notified: true }] })],
  [
    'an outcome nobody knows',
    () =>
      json(200, {
        results: [
          { email: 'new@example.test', notified: true, sites: [{ siteKey: 'one.example', outcome: 'maybe' }] }
        ]
      })
  ],
  ['a body that is not JSON', () => notJson(200)],
  // A refusal the door never writes: a code nobody named, or none. Not drawn as a bare "Refused".
  ...[
    ['a code nobody named', 'MADE_UP_CODE'],
    ['no code', undefined]
  ].map(([what, code]) => [
    `a refused site with ${what}`,
    () =>
      json(200, {
        results: [
          {
            email: 'new@example.test',
            notified: false,
            sites: ALL_SITES.map((siteKey) => ({ siteKey, outcome: 'refused', code }))
          }
        ]
      })
  ]),
  [
    'a network failure',
    () => {
      throw new TypeError('fetch failed')
    }
  ],
  // Whether the email went is part of the answer: without it, "not sent" would be a guess.
  ...[
    ['left out', undefined],
    ['null', null],
    ['a word', 'yes'],
    ['a number', 1]
  ].map(([what, notified]) => [
    `whether the email went is ${what}`,
    () => json(200, { results: [{ ...answered('new@example.test', ALL_SITES), notified }] })
  ]),
  // Well-formed, and not the answer to what was sent (one address, six sites).
  ['no results at all', () => json(200, { results: [] })],
  ['an entry with no site outcomes', () => json(200, { results: [answered('new@example.test', [])] })],
  ['a site left out', () => json(200, { results: [answered('new@example.test', ALL_SITES.slice(1))] })],
  [
    'a site answered twice',
    () => json(200, { results: [answered('new@example.test', [...ALL_SITES.slice(1), ALL_SITES[1]])] })
  ],
  [
    'a site nobody asked for',
    () => json(200, { results: [answered('new@example.test', [...ALL_SITES.slice(1), 'other.example'])] })
  ],
  ['another person', () => json(200, { results: [answered('else@example.test', ALL_SITES)] })],
  [
    'the person answered twice',
    () =>
      json(200, {
        results: [answered('new@example.test', ALL_SITES), answered('new@example.test', ALL_SITES)]
      })
  ],
  [
    'a person nobody asked for beside the one asked',
    () =>
      json(200, {
        results: [answered('new@example.test', ALL_SITES), answered('else@example.test', ALL_SITES)]
      })
  ]
]) {
  test(`F-S3-005: a reply that cannot be read (${name}) is a failure, never an empty "sent"`, async () => {
    const { sent } = await sendInvite(route)
    // The request left, so the books may have changed: the tab reads them again, and the screen
    // says the outcome is unknown instead of "sent" or "nothing was changed".
    assert.equal(sent(), 1, 'the tab reads the books again')
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('wizard.done')).length, 0)
    assert.deepEqual(alerts(), [t('wizard.unknown')])
    assert.ok(button(t('wizard.send')), 'still on Review')
    assert.doesNotMatch(text(), RAW)
  })
}

// ── F-S3-015: a write on the Team tab ───────────────────────────────────────────────────────────

const seat = (id, email, role) => ({
  id,
  email,
  displayName: null,
  role,
  status: 'active',
  grantedAt: '2026-09-30T08:00:00.000Z',
  grantedBy: 'acct-1',
  revokedAt: null,
  requestedAt: null,
  scope: 'site'
})

async function revokeOnTeam(route) {
  const calls = answer({
    'GET /api/team': () =>
      json(200, {
        sites: [
          {
            siteKey: 'a.example',
            platform: 'wordpress',
            myRole: 'owner',
            status: 'accepted',
            seats: [
              seat('acct-1', 'owner@example.test', 'owner'),
              seat('acct-2', 'editor@example.test', 'editor')
            ]
          }
        ]
      }),
    'GET /auth/me': () => json(200, { email: 'owner@example.test' }),
    'DELETE /api/sites/a.example/seats/acct-2': route
  })
  await mount(
    lib.createElement(lib.TeamView, {
      siteKey: 'a.example',
      role: 'owner',
      sites: [{ siteKey: 'a.example', role: 'owner' }],
      onPick: () => {},
      t
    })
  )
  // The row's own Revoke opens the dialog; the dialog's Revoke is the write.
  await press(t('action.revoke'))
  const confirm = [...document.querySelectorAll('[role="dialog"] button')].filter(
    (b) => b.textContent.trim() === t('action.revoke')
  )
  assert.equal(confirm.length, 1)
  await press(confirm[0])
  return calls
}

for (const [name, route, key] of [
  ['the session ended', () => json(401, { code: 'NOT_SIGNED_IN' }), 'error.signedOut'],
  ['a 401 that is not JSON', () => notJson(401), 'error.signedOut'],
  ['the viewer has no seat any more', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.noSeat'],
  ['the row changed under its dialog', () => json(409, { code: 'SEAT_STATE_CHANGED' }), 'error.changed'],
  // The seats door has four reasons for a 403: without its own code none of them is guessed.
  ['a 403 that is not JSON', () => notJson(403), 'error.failed'],
  ['a 403 with no code', () => json(403, {}), 'error.failed'],
  ['a 403 with a code that is not a word', () => json(403, { code: 7 }), 'error.failed'],
  ['a 403 that names a code of another door', () => json(403, { code: 'NOT_REPO_OWNER' }), 'error.failed'],
  // A 404 is "that seat is gone" only under the door's own code; it is also how a site goes missing.
  ['a 404 that is not JSON', () => notJson(404), 'error.failed'],
  ['a 404 that names a missing site', () => json(404, { code: 'SITE_UNKNOWN' }), 'error.failed'],
  ['a role the viewer lacks', () => json(403, { code: 'NOT_SITE_OWNER' }), 'error.notSiteOwner'],
  ['the last Owner', () => json(403, { code: 'CANNOT_REVOKE_LAST_OWNER' }), 'error.lastOwner'],
  ['the viewer’s own seat', () => json(403, { code: 'CANNOT_REVOKE_SELF' }), 'error.self'],
  ['a seat already gone', () => json(404, { code: 'GRANT_UNKNOWN' }), 'error.gone'],
  ['too many changes', () => json(429, { code: 'RATE_LIMITED' }), 'error.rateLimited'],
  // A code is read only on the status the seats door sends it with; elsewhere the status decides.
  ['a 404 that names an ended session', () => json(404, { code: 'NOT_SIGNED_IN' }), 'error.failed'],
  ['a 400 that names an ended session', () => json(400, { code: 'NOT_SIGNED_IN' }), 'error.failed'],
  ['a 401 that names a seat already gone', () => json(401, { code: 'GRANT_UNKNOWN' }), 'error.signedOut'],
  ['a 400 that names a role', () => json(400, { code: 'NOT_SITE_OWNER' }), 'error.failed'],
  ['a 409 that names the last Owner', () => json(409, { code: 'CANNOT_REVOKE_LAST_OWNER' }), 'error.failed'],
  ['a 404 that names the viewer’s own seat', () => json(404, { code: 'CANNOT_REVOKE_SELF' }), 'error.failed'],
  ['a 400 that names a rate limit', () => json(400, { code: 'RATE_LIMITED' }), 'error.failed'],
  ['an unnamed refusal', () => json(500, { code: 'MADE_UP_CODE' }), 'error.failed'],
  // A failed door is not a refusal, whatever its body names: the write may have gone through.
  ['a 500 that names an ended session', () => json(500, { code: 'NOT_SIGNED_IN' }), 'error.failed'],
  ['a 503 that names a seat already gone', () => json(503, { code: 'GRANT_UNKNOWN' }), 'error.failed'],
  [
    'a network failure',
    () => {
      throw new TypeError('fetch failed')
    },
    'error.failed'
  ]
]) {
  test(`F-S3-015: a Team write refused (${name}) says its own sentence`, async () => {
    const calls = await revokeOnTeam(route)
    assert.equal(calls.filter((c) => c.key.startsWith('DELETE ')).length, 1)
    assert.deepEqual(alerts(), [t(key)])
    assert.doesNotMatch(text(), RAW)
  })
}

// ── Approve is another door and another line of work (#809): it keeps its own reading ───────────

/** A join request on the Team tab, approved through its role dialog. */
async function approveOnTeam(route) {
  const calls = answer({
    'GET /api/team': () =>
      json(200, {
        sites: [
          {
            siteKey: 'a.example',
            platform: 'wordpress',
            myRole: 'owner',
            status: 'accepted',
            seats: [
              seat('acct-1', 'owner@example.test', 'owner'),
              {
                ...seat('acct-3', 'asker@example.test', 'editor'),
                status: 'invited',
                requestedAt: '2026-10-01T08:00:00.000Z'
              }
            ]
          }
        ]
      }),
    'GET /auth/me': () => json(200, { email: 'owner@example.test' }),
    'POST /api/team/invite': route
  })
  await mount(
    lib.createElement(lib.TeamView, {
      siteKey: 'a.example',
      role: 'owner',
      sites: [{ siteKey: 'a.example', role: 'owner' }],
      onPick: () => {},
      t
    })
  )
  // The row's own Approve (drawn twice, once per panel width) opens the role pick; the dialog's
  // Approve is the write.
  const onRow = buttons().filter((b) => b.textContent.trim() === t('action.approve'))
  assert.equal(onRow.length, 2)
  await press(onRow[0])
  const confirm = [...document.querySelectorAll('[role="dialog"] button')].filter(
    (b) => b.textContent.trim() === t('action.approve')
  )
  assert.equal(confirm.length, 1)
  await press(confirm[0])
  return calls
}

// The same answers the seat write reads by exact status and code (above) are read here as the
// Approve flow reads them on its own branch: this change does not touch that flow.
for (const [name, route, key] of [
  ['the session ended', () => json(401, { code: 'NOT_SIGNED_IN' }), 'error.failed'],
  ['a 401 that is not JSON', () => notJson(401), 'error.failed'],
  ['no seat any more', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'error.failed'],
  ['a 404 that is not JSON', () => notJson(404), 'error.gone'],
  ['a 404 that names a missing site', () => json(404, { code: 'SITE_UNKNOWN' }), 'error.gone'],
  ['a 400 that names a role', () => json(400, { code: 'NOT_SITE_OWNER' }), 'error.notSiteOwner'],
  ['a 400 that names a rate limit', () => json(400, { code: 'RATE_LIMITED' }), 'error.rateLimited'],
  ['a 503 that names a seat already gone', () => json(503, { code: 'GRANT_UNKNOWN' }), 'error.gone'],
  ['too many changes', () => json(429, { code: 'RATE_LIMITED' }), 'error.rateLimited']
]) {
  test(`F-S3-015: Approve keeps its own reading of a refusal (${name}), apart from a seat write`, async () => {
    const calls = await approveOnTeam(route)
    assert.equal(calls.filter((c) => c.key === 'POST /api/team/invite').length, 1)
    assert.deepEqual(alerts(), [t(key)])
  })
}

// ── F-S3-015: the site address form ─────────────────────────────────────────────────────────────

const snapshot = (pending) => ({
  // The server names the site it read; a snapshot that names none is never drawn.
  siteKey: 'a.example',
  siteUrl: 'https://a.tracy.test',
  adminUrl: null,
  platform: 'wordpress',
  state: 'ready',
  values: {},
  displayName: 'a',
  addressChange: {
    allowed: true,
    managedDomain: 'tracy.test',
    status: pending ? 'pending' : 'ready',
    ...(pending
      ? {
          pending: {
            name: 'shop.example',
            verification: { type: 'TXT', name: '_tracy.shop.example', value: 'token' },
            readiness: { ownership: false, routing: false, tls: false }
          }
        }
      : {})
  }
})

async function openPublish(table, { pending = false } = {}) {
  const calls = answer({ 'GET /api/sites/a.example/settings': () => json(200, snapshot(pending)), ...table })
  const view = await mount(
    lib.createElement(lib.PublishView, {
      siteKey: 'a.example',
      role: 'owner',
      sites: [{ siteKey: 'a.example', role: 'owner' }],
      onPick: () => {},
      t
    })
  )
  // The Publish tab opens on its first step (which way to publish); pick a kind and go on to the
  // address step, the way a reader does.
  const kind = document.querySelector('[data-publish-kinds] [role="radio"]')
  if (kind) {
    await press(kind)
    const next = document.querySelector('[data-wizard-continue]')
    if (next) await press(next)
  }
  return { calls, view }
}

/** Go on from the address step to the domain step: Continue, or the way a draft reaches its domain. */
async function toDomainStep() {
  const next = document.querySelector('[data-publish-next], [data-action="to-domain"]')
  assert.ok(next, 'expected a way on to the domain step')
  await press(next)
}

const AVAILABILITY = 'GET /api/sites/a.example/address/availability'
const SAVE = 'PUT /api/sites/a.example/address'
const VERIFY = 'POST /api/sites/a.example/address/verify'
const available = () => json(200, { name: 'b', kind: 'managed', available: true })

async function checkName(name = 'b') {
  await press(t('flow.address.change'))
  await type(document.querySelector('.tv-site-address-form input'), name)
  await press(t('settings.url.check'))
}

for (const [name, route, key] of [
  ['the site is gone', () => json(404, { code: 'SITE_UNKNOWN' }), 'settings.url.siteUnknown'],
  ['the session ended', () => json(401, { code: 'NOT_SIGNED_IN' }), 'settings.url.signedOut'],
  ['a 401 that is not JSON', () => notJson(401), 'settings.url.signedOut'],
  ['no seat any more', () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }), 'settings.url.noAccess'],
  ['not the Owner', () => json(403, { code: 'NOT_SITE_OWNER' }), 'settings.url.ownerOnly'],
  ['a name that is not an address', () => json(400, { code: 'INVALID_SITE_KEY' }), 'settings.url.invalid'],
  ['an unnamed refusal', () => json(500, { code: 'MADE_UP_CODE' }), 'settings.url.failed'],
  ['a gateway page', () => notJson(502), 'settings.url.failed'],
  // A code is read only on the status the address door sends it with; elsewhere the status decides.
  ['a 404 that names an ended session', () => json(404, { code: 'NOT_SIGNED_IN' }), 'settings.url.failed'],
  ['a 401 that names a taken name', () => json(401, { code: 'NAME_TAKEN' }), 'settings.url.signedOut'],
  ['a 400 that names a missing site', () => json(400, { code: 'SITE_UNKNOWN' }), 'settings.url.failed'],
  [
    'a 403 that names a name not reserved',
    () => json(403, { code: 'NAME_NOT_RESERVED' }),
    'settings.url.failed'
  ],
  ['a 409 that names a role', () => json(409, { code: 'NOT_SITE_OWNER' }), 'settings.url.failed'],
  ['a 500 that names an ended session', () => json(500, { code: 'NOT_SIGNED_IN' }), 'settings.url.failed'],
  ['a 502 that names a missing site', () => json(502, { code: 'SITE_UNKNOWN' }), 'settings.url.failed'],
  // A success status is a verdict only when it carries one.
  ['an answer that is not an object', () => json(200, null), 'settings.url.failed'],
  ['a 200 with no verdict', () => json(200, {}), 'settings.url.failed'],
  ['a 200 that is not JSON', () => notJson(200), 'settings.url.failed'],
  ['"available" without the name judged', () => json(200, { available: true }), 'settings.url.failed'],
  ['a name that is taken', () => json(200, { name: 'b', available: false }), 'settings.url.taken'],
  [
    'a taken name, as the door says it',
    () => json(200, { name: 'b', available: false, code: 'NAME_TAKEN' }),
    'settings.url.taken'
  ],
  // The door says "not available" one way; a 200 naming any other code is not its answer.
  [
    'a 200 naming a refusal of another status',
    () => json(200, { available: false, code: 'INVALID_SITE_KEY' }),
    'settings.url.failed'
  ],
  ['a 200 naming an ended session', () => json(200, { code: 'NOT_SIGNED_IN' }), 'settings.url.failed']
]) {
  test(`F-S3-015: checking an address refused (${name}) says its own sentence`, async () => {
    await openPublish({ [AVAILABILITY]: route })
    await checkName()
    assert.deepEqual(alerts(), [t(key)])
    assert.doesNotMatch(text(), RAW)
    // Nothing was accepted: Save is not offered (hidden until a name is free, not greyed).
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('settings.url.save')).length, 0)
  })
}

test('F-S3-015: saving while the site is still being set up says so', async () => {
  const { calls } = await openPublish({
    [AVAILABILITY]: available,
    [SAVE]: () => json(409, { code: 'SITE_NOT_READY' })
  })
  await checkName()
  assert.deepEqual(alerts(), [])
  await press(t('settings.url.save'))
  assert.equal(calls.filter((c) => c.key === SAVE).length, 1)
  assert.deepEqual(alerts(), [t('settings.url.notReady')])
  assert.doesNotMatch(text(), RAW)
})

for (const [code, key] of [
  ['ADDRESS_APPLY_FAILED', 'settings.url.applyFailed'],
  ['ADDRESS_PROBE_FAILED', 'settings.url.probeFailed'],
  ['ADDRESS_ROLLBACK_FAILED', 'settings.url.rollbackFailed']
]) {
  test(`F-S3-015: a save the address door failed by name (${code}) keeps its own sentence`, async () => {
    await openPublish({ [AVAILABILITY]: available, [SAVE]: () => json(502, { code }) })
    await checkName()
    await press(t('settings.url.save'))
    assert.deepEqual(alerts(), [t(key)])
    assert.doesNotMatch(text(), RAW)
  })
}

// The host's reason is read only beside the code and status the door sends it with (502
// `ADDRESS_APPLY_FAILED`). On any other failed answer the body decides nothing.
for (const [name, status, body, key] of [
  [
    'the door’s own 502 with the WordPress reason',
    502,
    { code: 'ADDRESS_APPLY_FAILED', reason: 'WP_ADDRESS_CONSTANT' },
    'settings.url.wpAddressConstant'
  ],
  [
    'the door’s own 502 with a reason this screen has no sentence for',
    502,
    { code: 'ADDRESS_APPLY_FAILED', reason: 'ADDRESS_CONFLICT' },
    'settings.url.applyFailed'
  ],
  ['a 503 carrying the WordPress reason', 503, { reason: 'WP_ADDRESS_CONSTANT' }, 'settings.url.failed'],
  [
    'a 503 naming the apply failure and the WordPress reason',
    503,
    { code: 'ADDRESS_APPLY_FAILED', reason: 'WP_ADDRESS_CONSTANT' },
    'settings.url.failed'
  ],
  [
    'a 500 naming the apply failure and the WordPress reason',
    500,
    { code: 'ADDRESS_APPLY_FAILED', reason: 'WP_ADDRESS_CONSTANT' },
    'settings.url.failed'
  ],
  [
    'a 502 naming another code beside the WordPress reason',
    502,
    { code: 'NOT_SIGNED_IN', reason: 'WP_ADDRESS_CONSTANT' },
    'settings.url.failed'
  ],
  [
    'a 502 with the WordPress reason and no code',
    502,
    { reason: 'WP_ADDRESS_CONSTANT' },
    'settings.url.failed'
  ],
  ['a 500 naming the apply failure', 500, { code: 'ADDRESS_APPLY_FAILED' }, 'settings.url.failed'],
  ['a 504 naming the rollback failure', 504, { code: 'ADDRESS_ROLLBACK_FAILED' }, 'settings.url.failed'],
  [
    'a 400 refusal carrying the WordPress reason',
    400,
    { code: 'INVALID_SITE_KEY', reason: 'WP_ADDRESS_CONSTANT' },
    'settings.url.invalid'
  ],
  ['a 409 naming the apply failure', 409, { code: 'ADDRESS_APPLY_FAILED' }, 'settings.url.failed']
]) {
  test(`F-S3-015: a save answered with ${name} is read by its status first`, async () => {
    await openPublish({ [AVAILABILITY]: available, [SAVE]: () => json(status, body) })
    await checkName()
    await press(t('settings.url.save'))
    assert.deepEqual(alerts(), [t(key)])
    assert.doesNotMatch(text(), RAW)
  })
}

test('F-S3-015: checking ownership of a domain that is no longer reserved says how to start over', async () => {
  const { calls } = await openPublish(
    { [VERIFY]: () => json(404, { code: 'NAME_NOT_RESERVED' }) },
    { pending: true }
  )
  await toDomainStep()
  // The control on the own domain's card (`SiteDomains.tsx` `data-action="check-dns"`): it asks the
  // same door the "Check ownership" button of the old address form asked.
  const check = document.querySelector(
    '[data-card="own-domain"][data-domain="shop.example"] [data-action="check-dns"]'
  )
  assert.equal(check?.textContent.trim(), t('domains.check'))
  await press(check)
  assert.equal(calls.filter((c) => c.key === VERIFY).length, 1)
  assert.deepEqual(alerts(), [t('settings.url.notReserved')])
  assert.doesNotMatch(text(), RAW)
})

test('F-S3-015: one request at a time, and an answer that arrives after the form is gone changes nothing', async () => {
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const { calls, view } = await openPublish({
    [AVAILABILITY]: async () => {
      await held
      return json(404, { code: 'SITE_UNKNOWN' })
    }
  })
  await checkName()
  // Busy: the check button is off, and Save is not offered, so a second press cannot start a
  // second request.
  assert.equal(button(t('settings.url.checking')).disabled, true)
  assert.equal(buttons().filter((b) => b.textContent.trim() === t('settings.url.save')).length, 0)
  await press(t('settings.url.checking'))
  assert.equal(calls.filter((c) => c.key === AVAILABILITY).length, 1)
  // The tab closes while the request is out; its late answer must not throw or write anything.
  const failures = []
  const onError = (event) => failures.push(event.reason ?? event.error)
  process.on('unhandledRejection', onError)
  try {
    view.root.unmount()
    mounted.splice(0)
    release()
    await new Promise((resolve) => setTimeout(resolve, 20))
  } finally {
    process.off('unhandledRejection', onError)
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(alerts(), [])
})

/** A sentence about a role or a lost seat tells the reader what to do next, not only who may. */
for (const key of [
  'error.notSiteOwner',
  'error.noSeat',
  'error.lastOwner',
  'error.self',
  'outcome.next.notSiteOwner',
  'outcome.next.notSiteEditor',
  'outcome.next.notAuthorized',
  'settings.url.ownerOnly',
  'settings.url.noAccess',
  'backup.err.forbidden',
  'backup.forbidden.content'
]) {
  test(`F-S3-015: the role sentence ${key} names a next step`, () => {
    assert.ok(Object.hasOwn(en, key), `${key} is missing from the English table`)
    assert.match(en[key], /\b(Ask|ask|Make|Choose|Reload)\b/)
    assert.doesNotMatch(en[key], /seat book|[A-Z]{3,}_[A-Z_]+/)
  })
}

test('F-S3-015: a role refusal on a Team write does not name a role that may still be refused', () => {
  // An Admin who changes an Owner's seat gets the same code, so "an Owner or Admin can" is not true.
  assert.doesNotMatch(en['error.notSiteOwner'], /Only an Owner or Admin can/)
})

test('the sentences these screens show exist in the plugin that mounts them', () => {
  // `en` is that plugin's own table, imported above.
  for (const key of [
    'outcome.next.notSiteOwner',
    'outcome.next.notSiteEditor',
    'outcome.next.notAuthorized',
    'outcome.next.changed',
    'wizard.failed',
    'wizard.unknown',
    'error.changed',
    'error.failed',
    'error.signedOut',
    'error.noSeat',
    'settings.url.siteUnknown',
    'settings.url.notReady',
    'settings.url.notReserved',
    'settings.url.signedOut',
    'settings.url.noAccess'
  ]) {
    assert.ok(Object.hasOwn(en, key), `${key} is missing from the English table`)
    assert.doesNotMatch(en[key], /seat book|\bhost\b|\bdoor\b|[A-Z]{3,}_[A-Z_]+/)
  }
})

test('an Owner answering a request for edit access is told each refusal by its own sentence', async () => {
  const { editAccessErrorKey } = await import(
    pathToFileURL(path.join(repo, 'packages/core/tracy-core/src/team/refusals.ts')).href
  )
  assert.equal(editAccessErrorKey(409, 'NO_EDIT_REQUEST'), 'error.editRequestGone')
  assert.equal(editAccessErrorKey(403, 'NOT_SITE_OWNER'), 'error.notSiteOwner')
  assert.equal(editAccessErrorKey(403, 'SEAT_NOT_AUTHORIZED'), 'error.noSeat')
  assert.equal(editAccessErrorKey(404, 'GRANT_UNKNOWN'), 'error.gone')
  assert.equal(editAccessErrorKey(400, 'INVALID_REQUEST'), 'error.failed')
  // A code read on a status its door never sends it with decides nothing.
  assert.equal(editAccessErrorKey(500, 'NO_EDIT_REQUEST'), 'error.failed')
  assert.ok(Object.hasOwn(en, 'error.editRequestGone'))
  assert.doesNotMatch(en['error.editRequestGone'], RAW)
})
