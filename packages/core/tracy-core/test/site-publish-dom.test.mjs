/**
 * The site's Publish tab (its Domains section), state by state, as the DOM it draws: the status chip
 * beside the site's name, Publish / Back to draft, the running line, the failure line, and what each
 * role is shown. One test per state of the section, plus the ones a drawing cannot hold: a reload in
 * the middle of a publish, a second tab, a double click, an answer that arrives late, another site
 * picked while an answer is on its way.
 *
 * The real `PublishView` is bundled by esbuild and mounted with React into jsdom (and the real
 * `SettingsView` beside it, for what that tab no longer carries). `fetch` is a small
 * server that answers the three doors the section uses the way `apps/tracy-web` does
 * (`GET /api/sites/:key/settings`, `GET /api/sites/:key/state`, `POST /api/sites/:key/go-live`) and
 * keeps its own state, so "what the server reads back" is a fact each test controls. `t` returns the
 * key it is asked for: an assertion names a string by its key, never by its wording.
 *
 * WHAT THIS DOES NOT RUN: tracy-web (its doors are held by `apps/tracy-web/test/site-publish.test.mjs`),
 * a real browser (no layout, no focus ring, no clipboard permission), and the dsh page the tab sits in.
 *
 *   node --test packages/core/tracy-core/test/site-publish-dom.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PACKAGE = 'packages/core/tracy-core'
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
// Where esbuild, jsdom and the npm packages are resolved from when this file runs from a copy of
// the tree with no install of its own (the red-before-fix run against the base sources). The
// sources under test always come from the tree this file stands in.
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

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let dom
/** Every `MessageChannel` the bundle opens; an open port keeps Node alive (`team-invite.test.mjs`). */
const channels = []
const NativeMessageChannel = globalThis.MessageChannel
const realFetch = globalThis.fetch

before(async () => {
  globalThis.MessageChannel = class extends NativeMessageChannel {
    constructor() {
      super()
      channels.push(this)
    }
  }
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://tracy.test/'
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
    'CustomEvent',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const name of ['ResizeObserver', 'IntersectionObserver']) {
    window[name] ??= Observer
    globalThis[name] ??= Observer
  }
  window.PointerEvent ??= window.MouseEvent
  globalThis.PointerEvent ??= window.MouseEvent
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  window.Element.prototype.scrollIntoView ??= () => {}
  window.Element.prototype.getAnimations ??= () => []
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'site-publish-dom-'))
  const outfile = path.join(outDir, 'site-publish-dom.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { PublishView } from './site-tabs/PublishView'
        export { SettingsView } from './site-tabs/SettingsView'
        export { SITE_PUBLISH_EVENT } from './site-tabs/settings-rows'
      `,
      resolveDir: path.join(here, '..', 'src'),
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
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
  for (const channel of channels.splice(0)) {
    channel.port1.close()
    channel.port2.close()
  }
  globalThis.MessageChannel = NativeMessageChannel
})

const mounted = []

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    await lib.act(async () => root.unmount())
    host.remove()
  }
  document.body.replaceChildren()
  globalThis.fetch = realFetch
  delete window.navigator.clipboard
})

// ── the page around the tab ─────────────────────────────────────────────────────────────────────

/** `t` as a tab hands it over, answering with the key and its parameters: stable under rewording. */
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key)

const SITE = 'acme-studio.tracy.test'
const OTHER = 'harbor-bakery.tracy.test'
/** How often the mounted tab asks about a running publish: short, so a test does not wait. */
const POLL_MS = 15

const jsonReply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A promise and its handle, for an answer the test lets through when it chooses. */
function deferred() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * The server: one site's publishing as `apps/tracy-web` keeps it, behind the three doors.
 *
 *   state      what `GET /state` reads back — `{publish, mayPublish, operation, liveSince?}`
 *   goLive     how `POST /go-live` answers; the default is the real door's: one operation at a time
 *              (409 PUBLISH_BUSY with the state), a role refusal, else 202 and a running operation
 *   onState    replace one `GET /state` answer (a slow one, a broken one)
 *   end(how)   the host's job ended: `done` raises the flag (a `live`) and clears the operation;
 *              anything else is the failure code
 */
function server({ role = 'owner', publish = 'draft', operation = null, liveSince, legacy = false } = {}) {
  const srv = {
    role,
    state: {
      publish,
      mayPublish: role === 'owner' || role === 'admin',
      operation,
      ...(liveSince ? { liveSince } : {})
    },
    calls: [],
    posts: [],
    goLive: null,
    onState: null,
    // One-off answers of the address doors, by door: `routes['PUT address']`,
    // `routes['GET availability']` — each a function of the name asked about.
    routes: {},
    writes: [],
    sent: [],
    // How `GET /settings` answers for a site, when a test holds or replaces it: `onSettings(siteKey)`.
    onSettings: null,
    // The own domain being connected, and the connected ones (`ownDomain()` below).
    pending: null,
    connected: null,
    // Reservations that lapsed (`addressChange.lapsed`).
    lapsed: null,
    start(op) {
      srv.state.operation = {
        op,
        state: 'running',
        confirmed: true,
        jobId: `job-${srv.posts.length}`,
        startedAt: '2026-10-05T07:02:00.000Z'
      }
      if (op === 'draft') {
        srv.state.publish = 'draft'
        delete srv.state.liveSince
      }
    },
    end(how = 'done') {
      const { op, jobId, startedAt } = srv.state.operation
      if (how === 'done') {
        srv.state.operation = null
        if (op === 'live') {
          srv.state.publish = 'published'
          srv.state.liveSince = '2026-10-05T07:03:00.000Z'
        }
      } else {
        srv.state.operation = {
          op,
          state: 'failed',
          jobId,
          startedAt,
          code: how,
          endedAt: '2026-10-05T07:03:00.000Z'
        }
      }
    },
    snapshot(siteKey = SITE) {
      return {
        siteKey,
        siteUrl: `https://${siteKey}/`,
        adminUrl: `https://${siteKey}/wp-admin/`,
        platform: 'wordpress',
        role: srv.role,
        state: 'ready',
        values: { title: siteKey === SITE ? 'Acme Studio' : 'Harbor Bakery', version: '7.0' },
        displayName: siteKey,
        addressChange: {
          allowed: srv.role === 'owner',
          managedDomain: 'tracy.test',
          status: srv.pending ? 'pending' : 'ready',
          // The site's own domains, as `apps/tracy-web` `addressChangeState` sends them.
          ...(srv.pending ? { pending: structuredClone(srv.pending) } : {}),
          ...(srv.connected ? { connected: structuredClone(srv.connected) } : {}),
          ...(srv.lapsed ? { lapsed: structuredClone(srv.lapsed) } : {})
        },
        ...(legacy ? {} : { publishing: structuredClone(srv.state) })
      }
    }
  }
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input)
    const method = init.method ?? 'GET'
    srv.calls.push(`${method} ${url}`)
    const key = decodeURIComponent(url.split('/')[3] ?? '')
    if (url.endsWith('/settings')) {
      if (srv.onSettings) {
        const custom = await srv.onSettings(key, init)
        if (custom) return custom
      }
      return jsonReply(srv.snapshot(key))
    }
    if (url.endsWith('/state')) {
      if (srv.onState) {
        const custom = srv.onState
        srv.onState = null
        return custom()
      }
      if (legacy) return jsonReply({ publish: srv.state.publish, plan: 'standard' })
      return jsonReply({ plan: 'standard', ...structuredClone(srv.state) })
    }
    if (url.endsWith('/go-live') && method === 'POST') {
      const body = JSON.parse(init.body)
      srv.posts.push(body)
      if (srv.goLive) return srv.goLive(body)
      if (!srv.state.mayPublish) return jsonReply({ code: 'NOT_SITE_EDITOR' }, 403)
      if (srv.state.operation?.state === 'running')
        return jsonReply({ code: 'PUBLISH_BUSY', ...structuredClone(srv.state) }, 409)
      srv.start(body.op)
      return jsonReply({ jobId: srv.state.operation.jobId, op: body.op, state: 'running', ...srv.state }, 202)
    }
    const door = /\/address(\/[a-z]+)?(?:\?(.*))?$/.exec(url)
    if (door) {
      const what = `${method} ${door[1] ? door[1].slice(1) : 'address'}`
      const query = new URLSearchParams(door[2] ?? '')
      const asked = method === 'GET' ? (query.get('name') ?? '') : JSON.parse(init.body).name
      srv.writes.push(`${what} ${asked}`)
      // The whole of what was sent, for the tests that hold the request itself.
      srv.sent.push({ what, query: door[2] ?? null, body: method === 'GET' ? null : JSON.parse(init.body) })
      if (srv.routes[what]) return srv.routes[what](asked)
      // The door's own ordinary answer: the name is free.
      if (what === 'GET availability')
        return jsonReply({ name: asked.toLowerCase(), kind: 'managed', available: true })
    }
    throw new Error(`unexpected request: ${method} ${url}`)
  }
  return srv
}

async function mount(element) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(element))
  const entry = { root, host }
  mounted.push(entry)
  return entry
}

/** Let pending answers land and the effects they start run. */
const settleRaw = async (turns = 6) => {
  for (let turn = 0; turn < turns; turn++) await lib.act(async () => new Promise((r) => setTimeout(r, 0)))
}

/**
 * An Owner's Publish tab opens on the choice of kind (23/10/2026). Every test here is about putting
 * the site online, so a tab that shows the choice is walked past it the way a person does: "Put it
 * online with Tracy", then Continue.
 */
async function pastKind() {
  if (document.querySelector('[data-publish-wizard]')?.getAttribute('data-publish-step') !== 'kind') return
  const online = document.querySelector('[data-publish-kinds] [role="radio"]')
  if (!online) return
  await lib.act(async () => click(online))
  await settleRaw()
  const go = document.querySelector('[data-wizard-continue]')
  if (go) await lib.act(async () => click(go))
  await settleRaw()
}

const settle = async (turns = 6) => {
  await settleRaw(turns)
  await pastKind()
}

/** Wait until `read()` holds — the poll runs on a real, short timer. */
async function until(read, what) {
  const deadline = Date.now() + 5000
  for (;;) {
    await settle(2)
    try {
      return read()
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`${what}: ${error.message}`)
    }
    await lib.act(async () => new Promise((r) => setTimeout(r, POLL_MS)))
  }
}

const view = (srv, props = {}, tab = 'PublishView') =>
  lib.createElement(lib[tab], {
    siteKey: SITE,
    role: srv.role,
    sites: [
      { siteKey: SITE, role: srv.role },
      { siteKey: OTHER, role: 'owner' }
    ],
    onPick: () => {},
    pollMs: POLL_MS,
    t,
    ...props
  })

/**
 * Walk the wizard to `target` the way a person does: an Owner first chooses "Make it live on
 * Tracy" and presses Continue, then Continue on each step that offers it. Stops where the next step
 * is not offered (a draft has no way on to the domain step).
 */
async function walkTo(target) {
  for (let i = 0; i < 4; i++) {
    await pastKind()
    const at = document.querySelector('[data-publish-wizard]')?.getAttribute('data-publish-step')
    if (!at || at === target) return
    // Continue once live; on a draft that already has a domain, the card's way to it.
    const next = document.querySelector('[data-publish-next], [data-action="to-domain"]')
    if (!next) return
    await lib.act(async () => click(next))
    await settle()
  }
}

async function openPublish(options, props, step = 'address') {
  const srv = server(options)
  const entry = await mount(view(srv, props))
  await settle()
  await walkTo(step)
  return { srv, ...entry }
}

/** The site's Settings tab, over the same server. */
async function openSettings(options, props) {
  const srv = server(options)
  const entry = await mount(view(srv, props, 'SettingsView'))
  await settle()
  return { srv, ...entry }
}

// ── reading the DOM ─────────────────────────────────────────────────────────────────────────────

/** The Publish wizard: the step on screen and its footer (the old Domains section's place). */
const section = () => document.querySelector('[data-publish-wizard]')
/** The step's title: it takes the keyboard when a press replaced its own button. */
const stepTitle = () => document.querySelector('[data-publish-title]')
/** The site's state as the tab writes it: exactly one chip, in the address card's head. */
function chip() {
  // The Settings tab keeps the site head and its chip.
  if (document.querySelector('[data-publish-wizard]') === null) {
    const all = document.querySelectorAll('.tv-site-settings [data-status]')
    const head = document.querySelector('.tv-site-head [data-status]')
    assert.equal(all.length, 1, `the tab writes the site's state ${all.length} times, expected once`)
    assert.equal(head !== null, true, 'the one chip sits in the site head')
    return { status: head.getAttribute('data-status'), text: head.textContent.trim() }
  }
  const all = document.querySelectorAll('[data-publish-wizard] [data-status]')
  const head = document.querySelector('[data-card="primary"] .tv-pub-card-head [data-status]')
  assert.equal(all.length, 1, `the tab writes the site's state ${all.length} times, expected once`)
  assert.equal(head !== null, true, 'the one chip sits in the address card')
  return { status: head.getAttribute('data-status'), text: head.textContent.trim() }
}
const buttons = (root = document.body) => [...root.querySelectorAll('button')]
const named = (name, root = document.body) =>
  buttons(root).filter((b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name)
function button(name, root) {
  const found = named(name, root)
  assert.equal(found.length, 1, `expected one "${name}" button, found ${found.length}`)
  return found[0]
}
const click = (target) =>
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
async function press(name, root) {
  await lib.act(async () => click(button(name, root)))
  await settle()
}
const line = (kind) => document.querySelector(`[data-line="${kind}"]`)
const working = () => document.querySelector('[data-working]')?.getAttribute('data-working') ?? null
const alerts = () => [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim())
const dialog = () => document.querySelector('[role="alertdialog"]')
/**
 * Whether the confirmation is gone. Waited for: the dialog leaves on its next frame. Compared as a
 * boolean — an assertion that fails on a DOM node spends minutes printing it.
 */
const dialogGone = () => until(() => assert.equal(dialog() === null, true), 'the dialog closes')
const goLiveCalls = (srv) => srv.calls.filter((call) => call.startsWith('POST') && call.endsWith('/go-live'))

/**
 * Every enabled button of the section, by what a press of it would ask the server for. A state may
 * show none whose press the server would refuse for this seat.
 */
function offered() {
  const acts = []
  for (const b of buttons(section())) {
    if (b.disabled) continue
    // Continue to the domain step is the way to a domain of one's own.
    const action = b.hasAttribute('data-publish-next') ? 'continue' : b.getAttribute('data-action')
    if (action) acts.push(action)
  }
  return acts.sort()
}

// ── Draft ───────────────────────────────────────────────────────────────────────────────────────

test('Draft: the chip says Draft once, the card shows the address with its copy button and one Publish button', async () => {
  const { srv } = await openPublish()
  assert.deepEqual(chip(), { status: 'draft', text: 'publish.status.draft' })
  const primary = section().querySelector('[data-card="primary"]')
  assert.equal(primary.querySelector('[data-address]').textContent, SITE)
  assert.equal(primary.querySelector('[data-lead]').textContent, 'publish.lead.draft')
  assert.equal(button('publish.publish').disabled, false)
  assert.equal(button('publish.copyAddress').disabled, false)
  assert.equal(named('publish.backToDraft').length, 0)
  assert.equal(line('failed') === null, true)
  assert.deepEqual(alerts(), [])
  assert.equal(working(), null)
  assert.deepEqual(offered(), ['change-address', 'live'])
  // The step is named by its title.
  assert.equal(stepTitle().textContent, 'flow.address.titleDraft')
  // Nothing was asked of the publish doors just to draw a draft.
  assert.deepEqual(srv.calls, [`GET /api/sites/${encodeURIComponent(SITE)}/settings`])
})

test('Address bar: scheme, changeable name and Tracy suffix; Change opens the form; the own-domain hint only where a domain can be connected', async () => {
  await openPublish()
  const primary = section().querySelector('[data-card="primary"]')
  assert.equal(primary.querySelector('.tv-pub-name').textContent, 'acme-studio')
  assert.equal(primary.querySelector('.tv-pub-url .tv-pub-sfx').textContent, 'https://')
  assert.equal(primary.querySelector('[data-address] .tv-pub-sfx').textContent, '.tracy.test')
  const change = button('flow.address.change')
  assert.equal(change.getAttribute('aria-label'), 'flow.address.changeLabel')
  assert.equal(
    primary.querySelector('[data-own-domain-hint]').textContent,
    'flow.address.ownDomainflow.address.ownDomainDraft'
  )
  // Switched off, the promise goes with the way in.
  document.documentElement.setAttribute('data-tracy-hide', 'site-connect-domain')
  await settle()
  assert.equal(primary.querySelector('[data-own-domain-hint]'), null)
  document.documentElement.removeAttribute('data-tracy-hide')
  await settle()
  await press('flow.address.change')
  assert.ok(section().querySelector('form[data-form="address"]'))
  assert.equal(primary.querySelector('[data-own-domain-hint]'), null, 'the form is open: no hint')
})

test('Address bar: Live says the Live words in the hint; a seat that cannot connect a domain sees none', async () => {
  await openPublish({ publish: 'published' })
  assert.equal(
    section().querySelector('[data-own-domain-hint]').textContent,
    'flow.address.ownDomainflow.address.ownDomainLive'
  )
  for (const what of [{ role: 'admin', publish: 'published' }]) {
    document.body.innerHTML = ''
    await openPublish(what)
    assert.equal(section().querySelector('[data-own-domain-hint]'), null, what.role)
  }
  // ...but it is told why: the Owner connects the domain, no button in the note.
  for (const publish of ['draft', 'published']) {
    document.body.innerHTML = ''
    await openPublish({ role: 'editor', publish })
    const note = section().querySelector('[data-own-domain-editor]')
    assert.equal(note.textContent, 'flow.address.ownDomainflow.address.ownDomainEditor', publish)
    assert.equal(note.querySelector('button'), null)
  }
  document.body.innerHTML = ''
  await openPublish({ role: 'owner' })
  assert.equal(section().querySelector('[data-own-domain-editor]'), null, 'the Owner gets the real hint')
})

// ── Publishing, then Live ───────────────────────────────────────────────────────────────────────

test('Publishing: one press starts one job; the button gives way to one spinner line, the chip says Publishing…, and Live comes only from the server', async () => {
  const { srv } = await openPublish()
  await press('publish.publish')
  assert.deepEqual(srv.posts, [{ op: 'live' }])
  assert.deepEqual(chip(), { status: 'publishing', text: 'publish.status.publishing' })
  assert.equal(working(), 'live')
  const spinner = section().querySelector('[data-slot="spinner"]')
  assert.equal(spinner.getAttribute('aria-label'), 'publish.working.live')
  assert.ok(spinner.classList.contains('tv-spinner'), 'the class the reduced-motion rule stops')
  assert.equal(named('publish.publish').length, 0, 'the button is gone while the work runs')
  assert.equal(named('flow.address.change').length, 0, 'Change address gives way while the work runs')
  // The line above the address stays while the work runs: the row under it must not jump.
  assert.equal(section().querySelector('[data-lead]')?.textContent, 'publish.lead.draft')
  assert.deepEqual(offered(), [])
  assert.deepEqual(alerts(), [])
  // The press removed its own button: the keyboard is taken to the step's title.
  assert.equal(document.activeElement === stepTitle(), true)

  // Nothing here turns Live by itself: polls of a job still running keep the line.
  const before = srv.calls.length
  await until(() => assert.ok(srv.calls.length >= before + 2), 'the running job is asked about')
  assert.equal(chip().status, 'publishing')

  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'the chip follows the server')
  assert.equal(working(), null)
  assert.equal(button('publish.backToDraft').disabled, false)
  assert.ok(section().querySelector('[data-lead]').textContent.startsWith('publish.lead.live'))
  // Back to draft sits on the status line as a quiet text button, never the loud destructive style.
  const quietDraft = section().querySelector('[data-lead] button[data-action="draft"]')
  assert.ok(quietDraft, 'Back to draft is inline on the status line')
  assert.ok(quietDraft.classList.contains('tv-pub-back-draft'))
  assert.equal(quietDraft.classList.contains('tv-domain-draft'), false)
  assert.equal(goLiveCalls(srv).length, 1)
  // Once nothing runs, nothing is asked any more.
  const quiet = srv.calls.length
  await lib.act(async () => new Promise((r) => setTimeout(r, POLL_MS * 4)))
  assert.equal(srv.calls.length, quiet)
})

test('Live: the chip says Live, the one action is Back to draft, and no publish button is left', async () => {
  await openPublish({ publish: 'published', liveSince: '2026-10-05T07:03:00.000Z' })
  assert.deepEqual(chip(), { status: 'live', text: 'publish.status.live' })
  assert.equal(button('publish.backToDraft').disabled, false)
  assert.equal(named('publish.publish').length, 0)
  assert.deepEqual(offered(), ['change-address', 'continue', 'draft'])
})

test('Live with no moment on record: no "since" line is made up', async () => {
  await openPublish({ publish: 'published' })
  assert.equal(chip().status, 'live')
  assert.equal(section().querySelector('[data-lead]') === null, true)
})

// ── Back to draft ───────────────────────────────────────────────────────────────────────────────

test('Back to draft: a labelled dialog asks first; Cancel changes nothing, the confirmation sends one draft and the chip follows', async () => {
  const { srv } = await openPublish({ publish: 'published' })
  await press('publish.backToDraft')
  const asked = dialog()
  assert.equal(asked !== null, true, 'a dialog opened')
  const title = asked.querySelector('[data-slot="dialog-title"]')
  assert.equal(title.textContent, `publish.draftTitle${JSON.stringify({ site: 'Acme Studio' })}`)
  assert.equal(asked.getAttribute('aria-labelledby'), title.id, 'the dialog is named by its title')
  assert.ok(asked.textContent.includes('publish.draftBody'))
  assert.equal(document.activeElement.textContent, 'action.cancel', 'the safe answer has the keyboard')

  await press('action.cancel', asked)
  await dialogGone()
  assert.equal(chip().status, 'live')
  assert.deepEqual(srv.posts, [])
  // The keyboard goes back to the button that asked, not to the top of the page.
  await until(
    () => assert.equal(document.activeElement === button('publish.backToDraft'), true),
    'focus returns to Back to draft'
  )

  await press('publish.backToDraft')
  await press('publish.backToDraft', dialog())
  assert.deepEqual(srv.posts, [{ op: 'draft' }])
  await dialogGone()
  // The flag drops first on the server, so the chip reads Draft while the host still works.
  assert.equal(chip().status, 'draft')
  assert.equal(working(), 'draft')
  assert.deepEqual(offered(), [])
  srv.end('done')
  await until(() => assert.equal(working(), null), 'the work ends')
  assert.equal(chip().status, 'draft')
  assert.equal(button('publish.publish').disabled, false)
})

test('Back to draft: Escape closes the dialog without sending anything', async () => {
  const { srv } = await openPublish({ publish: 'published' })
  await press('publish.backToDraft')
  await lib.act(async () =>
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  )
  await settle()
  await dialogGone()
  assert.deepEqual(srv.posts, [])
  assert.equal(chip().status, 'live')
})

test('going back to draft that did not finish: the site reads draft, the line says so, and its own Try again sends draft again', async () => {
  const { srv } = await openPublish({
    operation: {
      op: 'draft',
      state: 'failed',
      jobId: 'job-9',
      startedAt: '2026-10-05T07:02:00.000Z',
      code: 'JOB_FAILED',
      endedAt: '2026-10-05T07:03:00.000Z'
    }
  })
  assert.equal(chip().status, 'draft')
  assert.equal(line('failed').getAttribute('data-failure'), 'draft')
  assert.deepEqual(alerts(), ['publish.failed.draft'])
  // The card's own button still publishes; the retry of the draft sits in the line.
  assert.equal(button('publish.publish').disabled, false)
  await press('action.retry', line('failed'))
  assert.deepEqual(srv.posts, [{ op: 'draft' }])
})

// ── recover after a reload, a second tab, a double click ────────────────────────────────────────

test('reload in the middle of a publish: the tab opens on the running state, with no button, and follows it to the end', async () => {
  const { srv } = await openPublish({
    operation: {
      op: 'live',
      state: 'running',
      confirmed: true,
      jobId: 'job-1',
      startedAt: '2026-10-05T07:02:00.000Z'
    }
  })
  assert.equal(chip().status, 'publishing')
  assert.equal(working(), 'live')
  assert.equal(named('publish.publish').length, 0)
  assert.deepEqual(offered(), [])
  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'the reloaded tab reaches Live')
  assert.deepEqual(srv.posts, [], 'the reload started nothing')
})

test('reload in the middle of a publish the host never confirmed: still one running line, never a second job offered', async () => {
  await openPublish({
    operation: {
      op: 'live',
      state: 'running',
      confirmed: false,
      jobId: null,
      startedAt: '2026-10-05T07:02:00.000Z'
    }
  })
  assert.equal(chip().status, 'publishing')
  assert.equal(working(), 'live')
  assert.deepEqual(offered(), [])
})

test('a second tab: looking at it again reads the state; a press there while the first tab publishes starts nothing and is told so calmly', async () => {
  const { srv } = await openPublish()
  assert.equal(chip().status, 'draft')
  // The first tab publishes. This one still shows Draft and its button.
  srv.start('live')
  assert.equal(button('publish.publish').disabled, false)
  await press('publish.publish')
  assert.equal(goLiveCalls(srv).length, 1)
  assert.equal(chip().status, 'publishing', 'the refusal carried the state, and it was read back')
  assert.equal(working(), 'live')
  const said = line('notice')
  assert.equal(said.getAttribute('data-notice'), 'publish.busy')
  assert.equal(said.getAttribute('role'), 'status', 'calmly: not an alert')
  assert.deepEqual(alerts(), [])
  assert.equal(line('failed') === null, true)

  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'the second tab reaches Live too')
  assert.equal(line('notice') === null, true, 'the calm line was about the operation that ended')
})

test('a second tab left open: it asks again when the window is looked at, with no press', async () => {
  const { srv } = await openPublish()
  srv.start('live')
  srv.end('done')
  assert.equal(chip().status, 'draft', 'not yet looked at')
  await lib.act(async () => window.dispatchEvent(new window.Event('focus')))
  await settle()
  assert.equal(chip().status, 'live')
  assert.deepEqual(srv.posts, [])
})

test('a double click sends one request', async () => {
  const { srv } = await openPublish()
  const publish = button('publish.publish')
  await lib.act(async () => {
    click(publish)
    click(publish)
    click(publish)
  })
  await settle()
  assert.equal(goLiveCalls(srv).length, 1)
  assert.equal(chip().status, 'publishing')
})

test('the operation moving is told to the rest of the page — when it starts, and when it ends — so My Sites in another mounted view follows without the window being focused', async () => {
  const heard = []
  const listen = (event) => heard.push(event.detail.siteKey)
  window.addEventListener('tracy:site-publish-changed', listen)
  try {
    const { srv } = await openPublish()
    assert.deepEqual(heard, [], 'the first reading of a site is not a change')
    await press('publish.publish')
    // The flag has not moved (the site is a draft until the host is done) — the operation has.
    assert.equal(srv.state.publish, 'draft')
    assert.deepEqual(heard, [SITE], 'a publish that started is told at once')
    // Polls that read the same running operation tell nobody again.
    await lib.act(async () => new Promise((r) => setTimeout(r, POLL_MS * 6)))
    await settle()
    assert.deepEqual(heard, [SITE])
    srv.end('done')
    await until(() => assert.equal(chip().status, 'live'), 'live')
    assert.deepEqual(heard, [SITE, SITE], 'and once more when it ended')
    await lib.act(async () => new Promise((r) => setTimeout(r, POLL_MS * 4)))
    await settle()
    assert.deepEqual(heard, [SITE, SITE])
  } finally {
    window.removeEventListener('tracy:site-publish-changed', listen)
  }
})

test('a publish that FAILED is told too, though the flag never moved — and so is the next one that starts', async () => {
  const heard = []
  const listen = (event) => heard.push(event.detail.siteKey)
  window.addEventListener('tracy:site-publish-changed', listen)
  try {
    const { srv } = await openPublish()
    await press('publish.publish')
    srv.end('JOB_FAILED')
    await until(() => assert.equal(line('failed') !== null, true), 'the failure line')
    assert.equal(srv.state.publish, 'draft')
    assert.deepEqual(heard, [SITE, SITE], 'started, then failed: the row stops reading Publishing…')
    // Try again is another operation: told when it starts.
    await press('action.retry')
    assert.deepEqual(heard, [SITE, SITE, SITE])
  } finally {
    window.removeEventListener('tracy:site-publish-changed', listen)
  }
})

test('an operation started in ANOTHER tab is told once this tab reads it, and picking another site tells nobody', async () => {
  const heard = []
  const listen = (event) => heard.push(event.detail.siteKey)
  window.addEventListener('tracy:site-publish-changed', listen)
  try {
    const { srv, root } = await openPublish()
    // Another tab starts a publish; this one learns of it when it is looked at.
    srv.start('live')
    await lib.act(async () => window.dispatchEvent(new window.Event('focus')))
    await until(() => assert.equal(chip().status, 'publishing'), 'publishing')
    assert.deepEqual(heard, [SITE])
    // Another site is picked: its first reading is not a change of anything.
    await lib.act(async () => root.render(view(srv, { siteKey: OTHER })))
    await settle()
    assert.deepEqual(heard, [SITE])
  } finally {
    window.removeEventListener('tracy:site-publish-changed', listen)
  }
})

// ── Failed, and "not set up" ────────────────────────────────────────────────────────────────────

test('Failed: one destructive line says the site is still a draft, the button reads Try again, and Details opens the reason and the reference', async () => {
  const { srv } = await openPublish()
  await press('publish.publish')
  srv.end('JOB_FAILED')
  await until(() => assert.equal(line('failed') !== null, true), 'the failure is read back')
  assert.equal(chip().status, 'draft')
  assert.equal(line('failed').getAttribute('data-failure'), 'publish')
  assert.deepEqual(alerts(), ['publish.failed.publish'])
  assert.equal(working(), null)
  assert.ok(!section().textContent.includes('publish.anytime'), 'the failure line stands alone')

  const details = button('publish.details')
  assert.equal(details.getAttribute('aria-expanded'), 'false')
  assert.equal(section().querySelector('[data-details]') === null, true)
  await press('publish.details')
  assert.equal(details.getAttribute('aria-expanded'), 'true')
  const opened = section().querySelector('[data-details]')
  assert.equal(details.getAttribute('aria-controls'), opened.id)
  assert.equal(opened.getAttribute('data-code'), 'JOB_FAILED')
  assert.ok(opened.textContent.includes('publish.reason.jobFailed'))
  assert.ok(opened.textContent.includes('publish.reference.job{"job":"job-1"'), opened.textContent)

  // Try again is a new publish; the old failure goes when the server says something new.
  await press('action.retry')
  assert.equal(goLiveCalls(srv).length, 2)
  assert.equal(line('failed') === null, true)
  assert.equal(chip().status, 'publishing')
})

test('Failed after a reload: the failure is still there, because the server keeps it', async () => {
  await openPublish({
    operation: {
      op: 'live',
      state: 'failed',
      jobId: null,
      startedAt: '2026-10-05T07:02:00.000Z',
      code: 'FLEET_REFUSED',
      endedAt: '2026-10-05T07:07:00.000Z'
    }
  })
  assert.deepEqual(alerts(), ['publish.failed.publish'])
  await press('publish.details')
  const opened = section().querySelector('[data-details]')
  assert.ok(opened.textContent.includes('publish.reason.refused'))
  assert.ok(!opened.textContent.includes('publish.reference.job'), 'no job, so no job reference')
})

test('a publish that failed on a site already live says the site is still live, and offers Back to draft, not a blind retry', async () => {
  await openPublish({
    publish: 'published',
    operation: {
      op: 'live',
      state: 'failed',
      jobId: 'job-4',
      startedAt: '2026-10-05T07:02:00.000Z',
      code: 'JOB_FAILED',
      endedAt: '2026-10-05T07:03:00.000Z'
    }
  })
  assert.equal(chip().status, 'live')
  assert.deepEqual(alerts(), ['publish.failed.republish'])
  assert.equal(button('publish.backToDraft').disabled, false)
  assert.equal(named('action.retry', section()).length, 0)
})

test('Not set up (501): no screen of its own — Publish stays a button, and pressing it answers with the failure line and a clear detail', async () => {
  const { srv } = await openPublish()
  srv.goLive = (body) => {
    // As the door does it: the refusal is kept as the failed operation the state reads back.
    srv.start(body.op)
    srv.end('NOT_CONFIGURED')
    srv.state.operation.jobId = null
    return jsonReply({ code: 'NOT_CONFIGURED' }, 501)
  }
  assert.equal(button('publish.publish').disabled, false)
  assert.equal(document.querySelector('[data-line="not-set-up"]') === null, true)
  await press('publish.publish')
  assert.equal(chip().status, 'draft')
  assert.deepEqual(alerts(), ['publish.failed.publish'])
  await press('publish.details')
  assert.ok(section().querySelector('[data-details]').textContent.includes('publish.reason.notConfigured'))
  assert.equal(button('action.retry').disabled, false)
})

test('every reason the server names has its own sentence under Details; one it does not name reads as a refusal', async () => {
  for (const [code, key] of [
    ['NOT_CONFIGURED', 'publish.reason.notConfigured'],
    // Codes of a held operation, never of a failed one: named here they read as a refusal too.
    ['HOST_UNREACHABLE', 'publish.reason.refused'],
    ['HOST_SILENT', 'publish.reason.refused'],
    ['JOB_FAILED', 'publish.reason.jobFailed'],
    ['JOB_NO_RESULT', 'publish.reason.noResult'],
    ['FLEET_REFUSED', 'publish.reason.refused'],
    ['GO_LIVE_BUSY', 'publish.reason.refused'],
    ['SOMETHING_NEW', 'publish.reason.refused']
  ]) {
    const { root, host } = await openPublish({
      operation: { op: 'live', state: 'failed', jobId: null, startedAt: '2026-10-05T07:02:00.000Z', code }
    })
    await press('publish.details')
    assert.ok(section().querySelector('[data-details]').textContent.includes(key), code)
    await lib.act(async () => root.unmount())
    host.remove()
    mounted.pop()
  }
})

// ── answers the door gives that start nothing ───────────────────────────────────────────────────

test('207, or any answer that neither starts the work nor does it: the state is read back and decides the words', async () => {
  // The host took the work but the flag could not be set: the read-back says draft, nothing running.
  const still = await openPublish()
  still.srv.goLive = () =>
    jsonReply({ jobId: 'j', op: 'live', publish: 'draft', warning: 'SITE_UNKNOWN' }, 207)
  await press('publish.publish')
  assert.equal(chip().status, 'draft', 'not called Live on the strength of a 2xx')
  assert.equal(line('notice').getAttribute('data-notice'), 'publish.unknown')
  assert.deepEqual(alerts(), ['publish.unknown'])
  assert.equal(button('publish.publish').disabled, false)
  await lib.act(async () => still.root.unmount())
  still.host.remove()
  mounted.pop()

  // The same answer, but the read-back says the site IS published: then it is, and nothing is added.
  const live = await openPublish()
  live.srv.goLive = () => {
    live.srv.state.publish = 'published'
    return jsonReply({ jobId: 'j', op: 'live', publish: 'draft', warning: 'SITE_UNKNOWN' }, 207)
  }
  await press('publish.publish')
  assert.equal(chip().status, 'live')
  assert.equal(line('notice') === null, true)
  assert.deepEqual(alerts(), [])
})

test('the host did not answer (504): the state reads back a publish that may be running, so the line stays and no second job is offered', async () => {
  const { srv } = await openPublish()
  srv.goLive = (body) => {
    srv.start(body.op)
    srv.state.operation.confirmed = false
    srv.state.operation.jobId = null
    return jsonReply({ code: 'HOST_UNREACHABLE' }, 504)
  }
  await press('publish.publish')
  assert.equal(chip().status, 'publishing')
  assert.equal(working(), 'live')
  assert.deepEqual(offered(), [])
  assert.deepEqual(alerts(), [])
  // The hold ends on the server: the failure is read back, with its reason.
  srv.end('HOST_UNREACHABLE')
  await until(() => assert.deepEqual(alerts(), ['publish.failed.publish']), 'the hold ended')
})

test("refusals that start nothing are said in the reader's words, and the state is still read back", async () => {
  const cases = [
    ['the session ended', () => jsonReply({ code: 'NOT_SIGNED_IN' }, 401), 'settings.url.signedOut'],
    [
      'a 401 that is not JSON',
      () => new Response('<html></html>', { status: 401 }),
      'settings.url.signedOut'
    ],
    ['no seat any more', () => jsonReply({ code: 'SEAT_NOT_AUTHORIZED' }, 403), 'settings.url.noAccess'],
    ['the site is gone', () => jsonReply({ code: 'SITE_UNKNOWN' }, 404), 'settings.url.siteUnknown'],
    ['a body the door refused', () => jsonReply({ code: 'INVALID_REQUEST' }, 400), 'publish.unknown'],
    // The door refuses a request that carries `domains` by name; this screen never sends one, so
    // the code reads as any other refusal it has no sentence for — and claims nothing.
    ['a request with domains', () => jsonReply({ code: 'DOMAINS_NOT_SUPPORTED' }, 400), 'publish.unknown'],
    [
      'a code of a door this screen does not use',
      () => jsonReply({ code: 'ADDRESS_CHANGE_BUSY' }, 409),
      'publish.unknown'
    ],
    ['a 403 that names no known reason', () => jsonReply({ code: 'MADE_UP' }, 403), 'publish.unknown'],
    ['a gateway page', () => new Response('<html>Bad Gateway</html>', { status: 502 }), 'publish.unknown'],
    ['no answer at all', () => Promise.reject(new TypeError('Failed to fetch')), 'publish.offline']
  ]
  for (const [what, goLive, key] of cases) {
    const { srv, root, host } = await openPublish()
    srv.goLive = goLive
    await press('publish.publish')
    assert.deepEqual(alerts(), [key], what)
    assert.equal(chip().status, 'draft', what)
    assert.equal(working(), null, what)
    const since = srv.calls.slice(srv.calls.findLastIndex((call) => call.endsWith('/go-live')))
    assert.ok(
      since.some((call) => call.endsWith('/state')),
      `${what}: the state was asked for after the press`
    )
    // A press that started nothing ran nothing: the tab's snapshot is not read again for it.
    assert.equal(
      since.some((call) => call.endsWith('/settings')),
      false,
      what
    )
    await lib.act(async () => root.unmount())
    host.remove()
    mounted.pop()
  }
})

// ── roles ───────────────────────────────────────────────────────────────────────────────────────

test('Editor and Developer: the state is shown, with no action at all and one sentence saying who can publish', async () => {
  for (const role of ['editor', 'developer']) {
    for (const publish of ['draft', 'published']) {
      const { srv, root, host } = await openPublish({ role, publish })
      assert.equal(chip().status, publish === 'draft' ? 'draft' : 'live', `${role} ${publish}`)
      assert.deepEqual(offered(), [], `${role} ${publish}: nothing the server would refuse`)
      assert.equal(named('publish.publish').length, 0, role)
      assert.equal(named('publish.backToDraft').length, 0, role)
      assert.equal(named('flow.address.change').length, 0, role)
      assert.equal(line('role').textContent, 'publish.adminOnly', role)
      // The address and its copy button are for everyone.
      assert.equal(button('publish.copyAddress').disabled, false)
      assert.deepEqual(srv.posts, [])
      await lib.act(async () => root.unmount())
      host.remove()
      mounted.pop()
    }
  }
})

test("Admin: publishes and unpublishes, and is shown no way to change the address — that is the Owner's", async () => {
  const { srv } = await openPublish({ role: 'admin' })
  assert.deepEqual(offered(), ['live'])
  assert.equal(named('flow.address.change').length, 0)
  assert.equal(line('role') === null, true)
  await press('publish.publish')
  assert.deepEqual(srv.posts, [{ op: 'live' }])
  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'live')
  assert.deepEqual(offered(), ['draft'])
  await press('publish.backToDraft')
  await press('publish.backToDraft', dialog())
  assert.deepEqual(srv.posts, [{ op: 'live' }, { op: 'draft' }])
})

test('Owner: every action of the section, and none that is refused', async () => {
  await openPublish({ role: 'owner' })
  assert.deepEqual(offered(), ['change-address', 'live'])
  assert.equal(line('role') === null, true)
})

test('no press ever carries a domain: every request to the go-live door is the direction alone', async () => {
  const { srv } = await openPublish()
  await press('publish.publish')
  srv.end('JOB_FAILED')
  await until(() => assert.equal(line('failed') !== null, true), 'failed')
  await press('action.retry')
  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'live')
  await press('publish.backToDraft')
  await press('publish.backToDraft', dialog())
  assert.deepEqual(srv.posts, [{ op: 'live' }, { op: 'live' }, { op: 'draft' }])
  for (const body of srv.posts) assert.deepEqual(Object.keys(body), ['op'])
})

test('a seat that lost the right to publish while the tab was open: the refusal is said, and the button goes with the state read back', async () => {
  const { srv } = await openPublish({ role: 'admin' })
  srv.role = 'editor'
  srv.state.mayPublish = false
  await press('publish.publish')
  assert.equal(line('notice').getAttribute('data-notice'), 'publish.adminOnly')
  assert.equal(named('publish.publish').length, 0)
  assert.deepEqual(offered(), [])
})

// ── answers that arrive late, a site that changed, a tab that closed ────────────────────────────

test('an answer that arrives after a newer one is dropped', async () => {
  const { srv } = await openPublish()
  // A read is asked for and held; meanwhile the person publishes and the job ends.
  const slow = deferred()
  srv.onState = () => slow.promise
  await lib.act(async () => window.dispatchEvent(new window.Event('focus')))
  await press('publish.publish')
  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'live')
  // The held read answers now, with what was true when it was asked: a draft.
  await lib.act(async () => slow.resolve(jsonReply({ publish: 'draft', mayPublish: true, operation: null })))
  await settle()
  assert.equal(chip().status, 'live', 'the stale answer did not write over the newer one')
})

test("another site picked while a read is on the wire: the old site's answer never lands on the new one", async () => {
  const srv = server()
  const slow = deferred()
  const { root } = await mount(view(srv))
  await settle()
  srv.onState = () => slow.promise
  await lib.act(async () => window.dispatchEvent(new window.Event('focus')))
  // The other site is a draft too; the held answer says "published" for the FIRST site.
  await lib.act(async () => root.render(view(srv, { siteKey: OTHER })))
  await settle()
  assert.equal(section().querySelector('[data-address]').textContent, OTHER)
  await lib.act(async () =>
    slow.resolve(jsonReply({ publish: 'published', mayPublish: true, operation: null }))
  )
  await settle()
  assert.equal(chip().status, 'draft')
})

test('a tab closed in the middle of a publish stops asking, and its late answer writes nowhere', async () => {
  const { srv, root, host } = await openPublish()
  await press('publish.publish')
  const slow = deferred()
  srv.onState = () => slow.promise
  await until(() => assert.equal(srv.onState, null), 'a poll is on the wire')
  await lib.act(async () => root.unmount())
  host.remove()
  mounted.pop()
  const calls = srv.calls.length
  await lib.act(async () =>
    slow.resolve(jsonReply({ publish: 'published', mayPublish: true, operation: null }))
  )
  await new Promise((r) => setTimeout(r, POLL_MS * 4))
  assert.equal(srv.calls.length, calls, 'no poll after the tab is gone')
})

test('a state answer the tab cannot read — a broken body, a 500, a half-formed object — changes nothing on screen', async () => {
  const { srv } = await openPublish({ publish: 'published' })
  for (const broken of [
    () => new Response('<html>', { status: 200 }),
    () => jsonReply({ code: 'BOOM' }, 500),
    () => jsonReply({ publish: 'sideways', mayPublish: true, operation: null }),
    () => jsonReply({ publish: 'draft', operation: null }),
    () => jsonReply({ publish: 'draft', mayPublish: true, operation: { op: 'live', state: 'exploding' } }),
    () => Promise.reject(new TypeError('Failed to fetch'))
  ]) {
    srv.onState = broken
    await lib.act(async () => window.dispatchEvent(new window.Event('focus')))
    await settle()
    assert.equal(chip().status, 'live')
    assert.equal(button('publish.backToDraft').disabled, false)
  }
})

test('a server that says nothing about publishing: the address is drawn, with no state and no action made up', async () => {
  const { srv } = await openPublish({ legacy: true })
  assert.equal(document.querySelectorAll('[data-status]').length, 0)
  assert.equal(section().querySelector('[data-address]').textContent, SITE)
  assert.equal(named('publish.publish').length, 0)
  assert.equal(named('publish.backToDraft').length, 0)
  await lib.act(async () => window.dispatchEvent(new window.Event('focus')))
  await settle()
  assert.equal(document.querySelectorAll('[data-status]').length, 0, 'a half answer stays unread')
  assert.deepEqual(srv.posts, [])
})

// ── the copy button ─────────────────────────────────────────────────────────────────────────────

test('Copy address writes the full address and says Copied; a browser that refuses is told as a refusal, never as Copied', async () => {
  await openPublish()
  const written = []
  window.navigator.clipboard = { writeText: async (text) => void written.push(text) }
  await press('publish.copyAddress')
  assert.deepEqual(written, [`https://${SITE}/`])
  assert.equal(section().querySelector('[data-copied]').textContent, 'publish.copied')
  assert.equal(line('copy-refused') === null, true)

  window.navigator.clipboard = { writeText: async () => Promise.reject(new Error('NotAllowedError')) }
  await press('publish.copyAddress')
  assert.equal(section().querySelector('[data-copied]').textContent, '')
  assert.deepEqual(alerts(), ['publish.copyRefused'])

  // No clipboard at all (an insecure page) is a refusal too.
  delete window.navigator.clipboard
  await press('publish.copyAddress')
  assert.equal(section().querySelector('[data-copied]').textContent, '')
  assert.deepEqual(alerts(), ['publish.copyRefused'])

  // And a press that works afterwards takes the refusal back.
  window.navigator.clipboard = { writeText: async () => {} }
  await press('publish.copyAddress')
  assert.equal(line('copy-refused') === null, true)
})

// ── the Settings tab beside it ──────────────────────────────────────────────────────────────────

test('Settings keeps the site head and the CMS rows and has no Domains section: no address card, no publishing or domain action, and it sends nothing', async () => {
  for (const [role, publish] of [
    ['owner', 'draft'],
    ['owner', 'published'],
    ['admin', 'draft'],
    ['editor', 'published']
  ]) {
    const what = `${role} ${publish}`
    const { srv, root, host } = await openSettings({ role, publish })
    assert.equal(section() === null, true, `${what}: no Domains section`)
    assert.equal(document.querySelectorAll('[data-action]').length, 0, `${what}: no action`)
    assert.equal(
      document.querySelector('[data-own-domain-entry]') === null,
      true,
      `${what}: no Connect domain`
    )
    assert.equal(document.querySelector('[data-site-screen]').getAttribute('data-site-screen'), 'settings')
    assert.equal(chip().status, publish === 'published' ? 'live' : 'draft', `${what}: the chip`)
    assert.equal(document.querySelectorAll('.tv-site-rows').length, 1, `${what}: the CMS rows`)
    assert.deepEqual(
      srv.calls.filter((call) => !call.startsWith('GET')),
      [],
      `${what}: reads only`
    )
    await lib.act(async () => root.unmount())
    host.remove()
    mounted.length = 0
  }
})

test('Settings with a domain of the site’s own: the domain, its records and its actions are not drawn there', async () => {
  const srv = server()
  srv.pending = ownDomain()
  await mount(view(srv, {}, 'SettingsView'))
  await settle()
  assert.equal(document.querySelector('[data-card="own-domain"]') === null, true)
  assert.equal(document.querySelectorAll('.tv-domain-record').length, 0)
  assert.equal(document.body.textContent.includes(DOMAIN), false)
})

test('the arrival for one section is gone: Settings takes no `focusSection`, and neither tab moves the keyboard when it opens', async () => {
  await openSettings({}, { focusSection: 'domains' })
  assert.equal(section() === null, true)
  assert.equal(document.activeElement === document.body, true, 'Settings leaves the keyboard where it was')
  await openPublish()
  assert.equal(document.activeElement === stepTitle(), false, 'opening the step takes no keyboard')
})

test('the Settings chip follows a publish the Publish tab of the same site read, and ignores one told of another site', async () => {
  const srv = server()
  await mount(view(srv, {}, 'SettingsView'))
  await settle()
  assert.equal(chip().status, 'draft')
  const states = () => srv.calls.filter((call) => call.endsWith('/state')).length
  const before = states()
  // Another site moved: nothing is asked.
  await lib.act(async () =>
    window.dispatchEvent(new window.CustomEvent(lib.SITE_PUBLISH_EVENT, { detail: { siteKey: OTHER } }))
  )
  await settle()
  assert.equal(states(), before, 'a publish of another site is not this tab’s')
  // This site was published elsewhere on the page: the state is read, and the chip is the server's.
  srv.state.publish = 'published'
  await lib.act(async () =>
    window.dispatchEvent(new window.CustomEvent(lib.SITE_PUBLISH_EVENT, { detail: { siteKey: SITE } }))
  )
  await until(() => assert.equal(chip().status, 'live'), 'the chip follows')
  // A malformed telling names no site.
  const read = states()
  await lib.act(async () => window.dispatchEvent(new window.CustomEvent(lib.SITE_PUBLISH_EVENT)))
  await settle()
  assert.equal(states(), read)
})

test('the Publish tab does not answer its own telling with a second read', async () => {
  const { srv } = await openPublish()
  const before = srv.calls.length
  await lib.act(async () =>
    window.dispatchEvent(new window.CustomEvent(lib.SITE_PUBLISH_EVENT, { detail: { siteKey: SITE } }))
  )
  await settle()
  assert.equal(srv.calls.length, before)
})

test('Settings reads its snapshot like the Publish tab: a failed read says so with Retry, and an answer naming another site is not drawn', async () => {
  const srv = server()
  srv.onSettings = () => jsonReply({ code: 'UNAVAILABLE' }, 503)
  await mount(view(srv, {}, 'SettingsView'))
  await settle()
  assert.equal(document.querySelector('.tv-site-head') === null, true)
  assert.equal(named('action.retry').length, 1)
  srv.onSettings = () => jsonReply(srv.snapshot(OTHER))
  await press('action.retry')
  assert.equal(document.querySelector('.tv-site-head') === null, true, 'another site’s snapshot is not drawn')
  srv.onSettings = null
  await press('action.retry')
  assert.equal(chip().status, 'draft')
})

// ── a press whose state could not be read back ─────────────────────────────────────────────────

/** `GET /state` goes on answering `broken()` until the test heals it (`srv.onState = null`). */
function stateDown(srv, broken) {
  const again = () => {
    srv.onState = again
    return broken()
  }
  srv.onState = again
}

test('the door took the press but the state after it cannot be read: no Publish button comes back, the state is asked for until it answers', async () => {
  for (const [what, broken] of [
    ['a 500', () => jsonReply({ code: 'BOOM' }, 500)],
    ['a body that is not the state', () => new Response('<html>', { status: 200 })],
    ['no answer', () => Promise.reject(new TypeError('Failed to fetch'))]
  ]) {
    const { srv } = await openPublish()
    stateDown(srv, broken)
    await press('publish.publish')
    assert.deepEqual(srv.posts, [{ op: 'live' }], what)
    // The earlier snapshot said Draft with a Publish button. Neither is offered again on it.
    assert.equal(named('publish.publish').length, 0, `${what}: no Publish on a stale reading`)
    assert.deepEqual(offered(), [], what)
    assert.equal(working(), 'live', `${what}: the wait is shown`)
    assert.deepEqual(alerts(), [], `${what}: nothing is called failed`)

    // It keeps asking, and a second press is not possible meanwhile.
    const before = srv.calls.filter((call) => call.endsWith('/state')).length
    await until(
      () => assert.ok(srv.calls.filter((call) => call.endsWith('/state')).length >= before + 3),
      `${what}: the state is asked for again`
    )
    assert.equal(goLiveCalls(srv).length, 1, what)
    assert.equal(named('publish.publish').length, 0, what)

    // The read gets through: the server's running job is what the screen shows, then its ending.
    srv.onState = null
    await until(() => assert.equal(chip().status, 'publishing'), `${what}: the running job is read`)
    assert.equal(named('publish.publish').length, 0, what)
    srv.end('done')
    await until(() => assert.equal(chip().status, 'live'), `${what}: live from the server`)
    assert.equal(goLiveCalls(srv).length, 1, what)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
  }
})

test('neither the press nor the read after it got an answer: the button waits, and comes back only with a reading — saying the press may not have arrived', async () => {
  const { srv } = await openPublish()
  srv.goLive = () => Promise.reject(new TypeError('Failed to fetch'))
  stateDown(srv, () => Promise.reject(new TypeError('Failed to fetch')))
  await press('publish.publish')
  assert.equal(named('publish.publish').length, 0)
  assert.equal(working(), 'live')
  await lib.act(async () => new Promise((r) => setTimeout(r, POLL_MS * 4)))
  assert.equal(named('publish.publish').length, 0, 'still waiting on a reading')
  srv.onState = null
  srv.goLive = null
  await until(
    () => assert.equal(named('publish.publish').length, 1),
    'the reading says draft, nothing running'
  )
  assert.equal(chip().status, 'draft')
  assert.deepEqual(alerts(), ['publish.offline'])
  assert.equal(goLiveCalls(srv).length, 1)
})

test('going back to draft whose state cannot be read back: no Back to draft or Publish is offered on the old reading', async () => {
  const { srv } = await openPublish({ publish: 'published' })
  stateDown(srv, () => jsonReply({ code: 'BOOM' }, 500))
  await press('publish.backToDraft')
  await press('publish.backToDraft', dialog())
  await dialogGone()
  assert.deepEqual(srv.posts, [{ op: 'draft' }])
  assert.deepEqual(offered(), [])
  assert.equal(working(), 'draft')
  srv.onState = null
  srv.end('done')
  await until(() => assert.equal(chip().status, 'draft'), 'draft from the server')
  assert.equal(button('publish.publish').disabled, false)
})

// ── the host has not confirmed ──────────────────────────────────────────────────────────────────

test('an operation the host has not confirmed: one line says the server is being waited for, no button is offered, and it becomes the ordinary line once the host has the job', async () => {
  for (const op of ['live', 'draft']) {
    const { srv, root, host } = await openPublish({
      publish: 'draft',
      operation: {
        op,
        state: 'running',
        confirmed: false,
        jobId: null,
        startedAt: '2026-10-05T07:02:00.000Z'
      }
    })
    assert.equal(working(), op, op)
    const lineOf = () => section().querySelector('[data-working]')
    assert.equal(lineOf().getAttribute('data-confirmed'), 'false', op)
    assert.equal(lineOf().textContent, 'publish.working.unconfirmed', op)
    assert.equal(
      section().querySelector('[data-slot="spinner"]').getAttribute('aria-label'),
      'publish.working.unconfirmed',
      op
    )
    assert.equal(chip().status, op === 'live' ? 'publishing' : 'draft', op)
    assert.deepEqual(offered(), [], `${op}: nothing can be started beside it`)
    assert.equal(line('failed') === null, true, `${op}: never said as failed`)
    assert.deepEqual(alerts(), [], op)
    // It is asked about, for as long as it is held.
    const before = srv.calls.length
    await until(() => assert.ok(srv.calls.length >= before + 2), 'asked about')
    assert.equal(lineOf().textContent, 'publish.working.unconfirmed', op)
    assert.deepEqual(goLiveCalls(srv), [], `${op}: reading it starts nothing`)

    // The host has the job: the ordinary line.
    srv.state.operation = { ...srv.state.operation, confirmed: true, jobId: 'job-1' }
    await until(() => assert.equal(lineOf().getAttribute('data-confirmed'), 'true'), 'confirmed')
    assert.equal(lineOf().textContent, `publish.working.${op}`, op)
    // And it may fall back: the host stopped answering for the job it had named.
    srv.state.operation = { ...srv.state.operation, confirmed: false }
    await until(() => assert.equal(lineOf().getAttribute('data-confirmed'), 'false'), 'unconfirmed again')
    assert.deepEqual(offered(), [], op)
    srv.end('done')
    await until(() => assert.equal(working(), null), 'ended')
    assert.equal(chip().status, op === 'live' ? 'live' : 'draft', op)
    await lib.act(async () => root.unmount())
    host.remove()
    mounted.pop()
  }
})

// ── a snapshot is drawn only for the site it belongs to ─────────────────────────────────────────

/** A snapshot of the OTHER site: live, as its own server state says. */
const otherSnapshot = (srv) => ({
  ...srv.snapshot(OTHER),
  publishing: {
    publish: 'published',
    mayPublish: true,
    operation: null,
    liveSince: '2026-10-01T10:00:00.000Z'
  }
})

test('another site picked while a quiet re-read of the first is pending: nothing of the first site is drawn for the second — not for one frame — and its late answer lands nowhere', async () => {
  const srv = server()
  const { root } = await mount(view(srv))
  await settle()
  await press('publish.publish')
  // The publish ends: the tab asks for its snapshot again, quietly, and that answer is held.
  const quietRead = deferred()
  const otherRead = deferred()
  const asked = []
  srv.onSettings = (key) => {
    asked.push(key)
    return key === SITE ? quietRead.promise : otherRead.promise
  }
  srv.end('done')
  await until(() => assert.deepEqual(asked, [SITE]), 'the quiet re-read is on its way')
  assert.equal(chip().status, 'live', 'the first site stays on screen while it is re-read')

  // The other site is picked now. Its own snapshot has not arrived.
  await lib.act(async () => root.render(view(srv, { siteKey: OTHER })))
  // The very first frame: no body at all — not the first site's address, chip or buttons.
  assert.equal(section() === null, true, 'no Domains section of the site before')
  assert.equal(document.querySelector('.tv-site-head') === null, true)
  assert.equal(document.querySelector('[data-status]') === null, true)
  assert.deepEqual(named('publish.backToDraft'), [])
  assert.deepEqual(named('publish.publish'), [])
  await settle()
  assert.deepEqual(asked, [SITE, OTHER])
  assert.equal(section() === null, true, 'still nothing until the new site answers')

  // The first site's held answer arrives late: it is of another site, and is drawn nowhere.
  await lib.act(async () => quietRead.resolve(jsonReply(srv.snapshot(SITE))))
  await settle()
  assert.equal(section() === null, true)
  assert.equal(document.body.textContent.includes(SITE), false, 'no address of the site before')

  // The new site's own snapshot: its address, its state, its actions.
  await lib.act(async () => otherRead.resolve(jsonReply(otherSnapshot(srv))))
  await settle()
  assert.equal(section().querySelector('[data-address]').textContent, OTHER)
  assert.equal(chip().status, 'live')
  assert.deepEqual(offered(), ['change-address', 'continue', 'draft'])
  // A press goes to the new site's door, and to no other.
  srv.onSettings = null
  const before = srv.calls.length
  await press('publish.backToDraft')
  await press('publish.backToDraft', dialog())
  const sent = srv.calls.slice(before).filter((call) => call.startsWith('POST'))
  assert.deepEqual(sent, [`POST /api/sites/${encodeURIComponent(OTHER)}/go-live`])
})

test("the quiet re-read and the pick of another site land in the same turn: the second site still starts from its own snapshot, never from the first site's publishing state", async () => {
  // The first site is LIVE with a failed draft on record; the second is a plain draft. If the
  // second site's body started from the first's snapshot it would show Live and a failure line.
  const srv = server({
    publish: 'draft',
    operation: {
      op: 'live',
      state: 'running',
      confirmed: true,
      jobId: 'job-1',
      startedAt: '2026-10-05T07:02:00.000Z'
    }
  })
  const { root } = await mount(view(srv))
  await settle()
  assert.equal(chip().status, 'publishing')
  const held = deferred()
  srv.onSettings = (key) => (key === OTHER ? held.promise : null)
  // In ONE turn: the state read that finds the publish ended (which asks for the quiet re-read),
  // and the render that picks the other site.
  srv.end('done')
  await lib.act(async () => {
    window.dispatchEvent(new window.Event('focus'))
    await new Promise((r) => setTimeout(r, 0))
    root.render(view(srv, { siteKey: OTHER }))
  })
  assert.equal(section() === null, true)
  assert.equal(document.querySelector('[data-status]') === null, true)
  await settle()
  assert.equal(section() === null, true)
  const plain = {
    ...srv.snapshot(OTHER),
    publishing: { publish: 'draft', mayPublish: true, operation: null }
  }
  await lib.act(async () => held.resolve(jsonReply(plain)))
  await settle()
  assert.equal(section().querySelector('[data-address]').textContent, OTHER)
  assert.equal(chip().status, 'draft', "the second site's own state")
  assert.deepEqual(offered(), ['change-address', 'live'])
})

test("an answer that names another site is not this site's snapshot: it is not drawn, and the tab says it could not read the site", async () => {
  const srv = server({ publish: 'published' })
  srv.onSettings = () => jsonReply(otherSnapshot(srv))
  await mount(view(srv))
  await settle()
  assert.equal(section() === null, true)
  assert.equal(document.querySelector('[data-status]') === null, true)
  assert.equal(document.body.textContent.includes(OTHER), false)
  assert.ok(document.body.textContent.includes('state.failed'))
  // Retry reads again; the right answer is drawn.
  srv.onSettings = null
  await press('action.retry')
  assert.equal(section().querySelector('[data-address]').textContent, SITE)
  assert.equal(chip().status, 'live')
})

test('the site key is compared the way the server writes it: another case, a scheme or `www.` in the key the tab was given is still this site', async () => {
  for (const given of [SITE.toUpperCase(), `https://${SITE}/`, `www.${SITE}`]) {
    const srv = server()
    srv.onSettings = () => jsonReply(srv.snapshot(SITE))
    const { root, host } = await mount(view(srv, { siteKey: given }))
    await settle()
    assert.equal(section().querySelector('[data-address]').textContent, SITE, given)
    await lib.act(async () => root.unmount())
    host.remove()
    mounted.pop()
  }
})

test('a snapshot that does not name its site is never drawn: no address, no chip, no Publish — the tab says it could not read the site, and a named answer after Retry is drawn', async () => {
  const nameless = {
    'no siteKey at all': (snapshot) => {
      const { siteKey: _siteKey, ...rest } = snapshot
      return rest
    },
    'siteKey null': (snapshot) => ({ ...snapshot, siteKey: null }),
    'siteKey empty': (snapshot) => ({ ...snapshot, siteKey: '' }),
    'siteKey only a scheme': (snapshot) => ({ ...snapshot, siteKey: 'https://' }),
    'siteKey a number': (snapshot) => ({ ...snapshot, siteKey: 7 }),
    'siteKey a list': (snapshot) => ({ ...snapshot, siteKey: [SITE] }),
    'siteKey of another site': (snapshot) => ({ ...snapshot, siteKey: `other.${SITE}` })
  }
  for (const [what, strip] of Object.entries(nameless)) {
    const srv = server()
    let says = false
    srv.onSettings = () => jsonReply(says ? srv.snapshot(SITE) : strip(srv.snapshot(SITE)))
    const { root, host } = await mount(view(srv))
    await settle()
    assert.equal(section() === null, true, `${what}: no Domains section`)
    assert.equal(document.querySelector('[data-address]') === null, true, `${what}: no address`)
    assert.equal(document.querySelectorAll('.tv-site-settings [data-status]').length, 0, `${what}: no chip`)
    assert.equal(named('publish.publish').length, 0, `${what}: no Publish`)
    assert.equal(named('publish.backToDraft').length, 0, `${what}: no Back to draft`)
    assert.equal(document.body.textContent.includes('state.failed'), true, `${what}: says it could not read`)
    assert.equal(srv.posts.length, 0, what)
    // The server names the site: the same tab draws it.
    says = true
    await lib.act(async () => button('action.retry').click())
    await settle()
    assert.equal(section().querySelector('[data-address]').textContent, SITE, what)
    assert.equal(chip().status, 'draft', what)
    await lib.act(async () => root.unmount())
    host.remove()
    mounted.pop()
  }
})

// ── the confirmation, and the address form under the card ───────────────────────────────────────

test('Back to draft says what really changes at a Tracy address — search engines, email, who can still open it — in every interface language, and never that visitors stop reaching the site or that a domain stops', async () => {
  await openPublish({ publish: 'published' })
  await press('publish.backToDraft')
  const body = dialog().querySelector('[data-slot="dialog-description"]')
  assert.equal(body.textContent, 'publish.draftBody')
  assert.equal(dialog().getAttribute('aria-describedby'), body.id, 'the dialog is described by that sentence')
  assert.equal(dialog().querySelector('ul') === null, true, 'no list of domains')

  const read = (file) => readFileSync(path.join(repo, file), 'utf8')
  const english = /'publish\.draftBody':\s*'([^']+)'/.exec(
    read('packages/site/tracy-site-tabs/src/client/strings.ts')
  )
  assert.equal(english !== null, true, 'the English sentence is in strings.ts')
  for (const said of [/search engines/, /stops sending email/, /people with the link can open it/]) {
    assert.match(english[1], said)
  }
  assert.doesNotMatch(english[1], /visitors|reach|domain/i)
  const visitors = {
    vi: /Khách truy cập/,
    de: /Besucher/,
    it: /visitatori/i,
    fr: /visiteurs/i,
    nl: /Bezoekers/,
    zh: /访客/,
    es: /visitantes/i
  }
  const domain = {
    vi: /tên miền|domain/i,
    de: /Domain/,
    it: /dominio/i,
    fr: /domaine/i,
    nl: /domein/i,
    zh: /域名/,
    es: /dominio/i
  }
  const engines = {
    vi: /công cụ tìm kiếm/,
    de: /Suchmaschinen/,
    it: /motori di ricerca/,
    fr: /moteurs de recherche/,
    nl: /zoekmachines/,
    zh: /搜索引擎/,
    es: /buscadores/
  }
  for (const language of Object.keys(visitors)) {
    const file =
      language === 'vi'
        ? 'packages/locale/tracy-locale-vi/vi/tracy-site-tabs.json'
        : `packages/locale/tracy-locales/${language}/tracy-site-tabs.json`
    const sentence = JSON.parse(read(file))['publish.draftBody']
    assert.equal(typeof sentence, 'string', language)
    assert.doesNotMatch(sentence, visitors[language], language)
    assert.doesNotMatch(sentence, domain[language], language)
    assert.match(sentence, engines[language], language)
    assert.notEqual(sentence, english[1], language)
  }
})

test("Change is the Owner's alone, gives way while the site is being published, and opens the address form this tab always had — the same doors, asked the same way", async () => {
  for (const role of ['admin', 'developer', 'editor']) {
    const { root, host } = await openPublish({ role })
    assert.equal(named('flow.address.change').length, 0, role)
    await lib.act(async () => root.unmount())
    host.remove()
    mounted.pop()
  }
  const { srv } = await openPublish()
  await press('publish.publish')
  assert.equal(named('flow.address.change').length, 0, 'Change address gives way while the work runs')
  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'live')
  assert.equal(button('flow.address.change').disabled, false)

  // While live, as while draft: the form opens under the card, and the card keeps its action.
  await press('flow.address.change')
  const form = section().querySelector('form.tv-site-address-form')
  assert.equal(form !== null, true)
  assert.equal(named('flow.address.change').length, 0, 'the form has the way out')
  assert.equal(button('publish.backToDraft').disabled, false)
  const input = form.querySelector('input')
  assert.equal(input.value, SITE, 'it starts from the address the site has')
  await press('settings.url.check')
  assert.deepEqual(srv.writes, [`GET availability ${SITE}`])
  const url = srv.calls.find((call) => call.includes('/address/availability'))
  assert.equal(
    url,
    `GET /api/sites/${encodeURIComponent(SITE)}/address/availability?name=${encodeURIComponent(SITE)}`
  )
  assert.ok(section().textContent.includes('settings.url.available'))
  // The door refuses the save: said as an alert in the section, nothing else changes.
  srv.routes['PUT address'] = () => jsonReply({ code: 'NAME_TAKEN' }, 409)
  await press('settings.url.save')
  assert.deepEqual(srv.writes, [`GET availability ${SITE}`, `PUT address ${SITE}`])
  assert.deepEqual(alerts(), ['settings.url.taken'])
  assert.equal(chip().status, 'live')
  await press('action.cancel')
  assert.equal(section().querySelector('form') === null, true)
  assert.equal(button('flow.address.change').disabled, false)
  assert.deepEqual(goLiveCalls(srv).length, 1, 'the address form never touched the publish door')
})

// ── A domain of the customer's own: one card, one state at a time, and only what a lookup returned ─

const DOMAIN = 'shop.example.com'
const TOKEN = 'a1b2c3d4e5f6'.repeat(4)
const TARGET = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90.cfargotunnel.com'
const CHECKED = '2026-10-06T09:15:00.000Z'

/**
 * An own domain as `apps/tracy-web` sends it. `ownership` / `routing` are the two readings
 * (`{ status, observed?, error? }`; default: never looked up); `owner: false` is what a seat that is
 * not the Owner is sent — no proof of ownership anywhere in it.
 */
function ownDomain({ state = 'pending', ownership, routing, owner = true, target = TARGET } = {}) {
  const reading = (given) =>
    given
      ? {
          status: given.status,
          observed: given.observed ?? [],
          ...(given.error ? { error: given.error } : {}),
          checkedAt: CHECKED
        }
      : { status: 'unchecked', observed: [] }
  const checked = Boolean(ownership || routing)
  const own = reading(ownership)
  return {
    name: DOMAIN,
    kind: 'custom',
    state,
    ...(owner ? { verification: { type: 'TXT', name: `_tracy.${DOMAIN}`, value: TOKEN } } : {}),
    ...(target ? { routing: { type: 'CNAME', name: DOMAIN, value: target } } : {}),
    readiness: { ownership: own.status === 'ok', routing: routing?.status === 'ok', tls: false },
    checks: [
      owner
        ? { record: 'ownership', type: 'TXT', name: `_tracy.${DOMAIN}`, expected: TOKEN, ...own }
        : {
            record: 'ownership',
            type: 'TXT',
            name: `_tracy.${DOMAIN}`,
            status: own.status,
            ...(own.checkedAt ? { checkedAt: CHECKED } : {})
          },
      { record: 'routing', type: 'CNAME', name: DOMAIN, expected: target ?? null, ...reading(routing) }
    ],
    ...(checked ? { checkedAt: CHECKED } : {})
  }
}
const OK = { status: 'ok', observed: [TOKEN] }
const ROUTED = { status: 'ok', observed: [TARGET] }

/** Open the tab on a site that has an own domain. `op`: the operation the server reads back. */
async function openWithDomain({ domain = ownDomain(), op = null, ...options } = {}) {
  const srv = server(options)
  if (domain.state === 'connected') srv.connected = [domain]
  else srv.pending = domain
  if (op)
    srv.state.operation = { jobId: 'job-9', startedAt: '2026-10-06T09:00:00.000Z', domains: [DOMAIN], ...op }
  const entry = await mount(view(srv))
  await settle()
  await walkTo('domain')
  return { srv, ...entry }
}
const domainCard = () => document.querySelector('[data-card="own-domain"]')
const domainStateOf = () => domainCard()?.getAttribute('data-domain-state') ?? null
const record = (kind) => domainCard().querySelector(`[data-record="${kind}"]`)
const found = (kind) => record(kind).querySelector('[data-found]')
const domainActions = () =>
  [...domainCard().querySelectorAll('button[data-action]')]
    .filter((b) => !b.disabled)
    .map((b) => b.getAttribute('data-action'))
    .sort()
const act = async (action, root = document.body) => {
  const target = root.querySelector(`button[data-action="${action}"]`)
  assert.equal(target !== null, true, `no "${action}" button`)
  await lib.act(async () => click(target))
  await settle()
}

/**
 * Every state the card may name: `[what, how the server reads, the state, the actions an Owner is
 * offered on the card]`. Each is drawn from the server's answer alone.
 */
const DOMAIN_STATES = [
  ['saved, never looked up', {}, 'waiting', ['check-dns', 'remove-domain']],
  [
    'both records missing',
    {
      domain: ownDomain({
        ownership: { status: 'missing', error: 'NXDOMAIN' },
        routing: { status: 'missing', error: 'NODATA' }
      })
    },
    'waiting',
    ['check-dns', 'remove-domain']
  ],
  [
    'the TXT record has another value',
    { domain: ownDomain({ ownership: { status: 'wrong', observed: ['not-the-token'] }, routing: ROUTED }) },
    'wrong',
    ['check-dns', 'remove-domain']
  ],
  [
    'the CNAME leads somewhere else',
    { domain: ownDomain({ ownership: OK, routing: { status: 'wrong', observed: ['parked.example.net'] } }) },
    'wrong',
    ['check-dns', 'remove-domain']
  ],
  [
    'a lookup that timed out',
    { domain: ownDomain({ ownership: { status: 'unknown', error: 'TIMEOUT' }, routing: ROUTED }) },
    'unknown',
    ['check-dns', 'remove-domain']
  ],
  [
    'one record right, the other not found',
    { domain: ownDomain({ ownership: OK, routing: { status: 'missing', error: 'NODATA' } }) },
    'waiting',
    ['check-dns', 'remove-domain']
  ],
  [
    'the host named another target since the check',
    { domain: ownDomain({ ownership: OK, routing: { status: 'unknown', error: 'TARGET_CHANGED' } }) },
    'unknown',
    ['check-dns', 'remove-domain']
  ],
  [
    'both records found, the site a draft',
    { domain: ownDomain({ ownership: OK, routing: ROUTED }) },
    'verified',
    ['check-dns', 'remove-domain']
  ],
  [
    'both records found, the site live',
    { publish: 'published', domain: ownDomain({ ownership: OK, routing: ROUTED }) },
    'verified',
    ['check-dns', 'connect-live', 'remove-domain']
  ],
  [
    'a publish that carries the domain is running',
    {
      domain: ownDomain({ ownership: OK, routing: ROUTED }),
      op: { op: 'live', state: 'running', confirmed: true }
    },
    'connecting',
    []
  ],
  [
    'connected, on a published site',
    { publish: 'published', domain: ownDomain({ state: 'connected', ownership: OK, routing: ROUTED }) },
    'live',
    ['check-dns', 'remove-domain']
  ],
  [
    'the site went live and the host did not say it connected the domain',
    {
      publish: 'published',
      domain: ownDomain({ ownership: OK, routing: ROUTED }),
      op: { op: 'live', state: 'failed', code: 'DOMAIN_NOT_ROUTED', endedAt: CHECKED }
    },
    'failed',
    ['check-dns', 'connect-live', 'remove-domain']
  ],
  [
    'a removal of the domain is running',
    {
      publish: 'published',
      domain: ownDomain({ state: 'connected', ownership: OK, routing: ROUTED }),
      op: { op: 'drop-domain', state: 'running', confirmed: true }
    },
    'removing',
    []
  ],
  [
    'a back to draft that takes the domain out is running',
    {
      domain: ownDomain({ state: 'connected', ownership: OK, routing: ROUTED }),
      op: { op: 'draft', state: 'running', confirmed: true }
    },
    'removing',
    []
  ],
  [
    'a removal that did not finish',
    {
      publish: 'published',
      domain: ownDomain({ state: 'connected', ownership: OK, routing: ROUTED }),
      op: { op: 'drop-domain', state: 'failed', code: 'DOMAIN_STILL_ROUTED', retry: true, endedAt: CHECKED }
    },
    'cleanup',
    ['retry-remove']
  ]
]

test('every state of an own domain has its screen: one card, one word for the state, the actions that state allows — and "Verified" or "Live" only when the server read it so', async () => {
  for (const [what, options, state, actions] of DOMAIN_STATES) {
    await openWithDomain(options)
    assert.equal(document.querySelectorAll('[data-card="own-domain"]').length, 1, what)
    assert.equal(domainStateOf(), state, what)
    const chips = domainCard().querySelectorAll('[data-domain-chip]')
    assert.equal(chips.length, 1, `${what}: the state is written once`)
    assert.equal(chips[0].textContent.trim(), `domains.state.${state}`, what)
    assert.deepEqual(domainActions(), actions, what)
    // Both records are always on the card, each with what was looked up at it.
    assert.equal(domainCard().querySelectorAll('[data-record]').length, 2, what)
    // While the server works, the card says so and offers nothing.
    const waitingLine = domainCard().querySelector('[data-working-domain]')
    assert.equal(waitingLine !== null, state === 'connecting' || state === 'removing', what)
    // A failure is said as one, on this card, and never as the site's own publish failing.
    assert.equal(
      domainCard().querySelector('[data-line="domain-failed"]') !== null,
      state === 'failed' || state === 'cleanup',
      what
    )
    assert.equal(line('failed') === null, true, `${what}: the address card has no failure line of its own`)
    // The field for a new domain is for a site with no domain of its own.
    assert.equal(document.querySelector('[data-own-domain-entry]') === null, true, what)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
  }
})

test('each record says what to create and what the last lookup found there — the value found, or why nothing was — with the time of that lookup', async () => {
  await openWithDomain({
    domain: ownDomain({
      ownership: { status: 'wrong', observed: ['v=spf1 -all', 'not-the-token'] },
      routing: { status: 'missing', error: 'NODATA' }
    })
  })
  const txt = record('ownership')
  assert.equal(txt.getAttribute('data-check'), 'wrong')
  assert.equal(txt.querySelector('[data-record-type]').textContent, 'TXT')
  assert.equal(txt.querySelector('[data-record-name]').textContent, `_tracy.${DOMAIN}`)
  assert.equal(txt.querySelector('[data-record-value]').textContent, TOKEN, 'what is expected')
  assert.equal(
    found('ownership').textContent,
    `domains.found.wrong${JSON.stringify({ found: 'v=spf1 -all, not-the-token' })}`
  )
  const cname = record('routing')
  assert.equal(cname.querySelector('[data-record-type]').textContent, 'CNAME')
  assert.equal(cname.querySelector('[data-record-name]').textContent, DOMAIN)
  assert.equal(cname.querySelector('[data-record-value]').textContent, TARGET)
  assert.equal(
    found('routing').textContent,
    `domains.found.missingRouting${JSON.stringify({ name: DOMAIN })}`
  )
  // The time is the lookup's, as the server stamped it; each name and each value has its own copy
  // button, right after the text it copies, and the type has none.
  const checked = domainCard().querySelector('[data-line="checked-at"]')
  assert.equal(checked.getAttribute('data-checked-at'), CHECKED)
  assert.match(checked.textContent, /^domains\.checkedAt\{"when":/)
  // The DNS only hint is its own line, straight after the checked-at line.
  assert.equal(checked.nextElementSibling.getAttribute('data-line'), 'dns-only')
  assert.equal(checked.nextElementSibling.textContent, 'domains.dnsOnly')
  assert.equal(domainCard().querySelectorAll('[data-line="dns-only"]').length, 1)
  assert.equal(domainCard().querySelectorAll('[data-copy]').length, 4)
  for (const [rec, type, name, value] of [
    [txt, 'TXT', `_tracy.${DOMAIN}`, TOKEN],
    [cname, 'CNAME', DOMAIN, TARGET]
  ]) {
    const copies = [...rec.querySelectorAll('[data-copy] button')].map((b) => b.getAttribute('aria-label'))
    assert.deepEqual(copies, [
      `domains.copyRecordName${JSON.stringify({ type })}`,
      `domains.copyRecord${JSON.stringify({ type })}`
    ])
    for (const [mark, text] of [
      ['[data-record-name]', name],
      ['[data-record-value]', value]
    ]) {
      const shown = rec.querySelector(mark)
      assert.equal(
        shown.nextElementSibling.matches('[data-copy]'),
        true,
        `${type} ${mark}: the button follows the text`
      )
      const wrote = []
      window.navigator.clipboard = { writeText: async (said) => void wrote.push(said) }
      await lib.act(async () => click(shown.nextElementSibling.querySelector('button')))
      await settle()
      assert.deepEqual(wrote, [text], `${type} ${mark}`)
    }
    assert.equal(rec.querySelector('[data-record-type]').querySelector('[data-copy]') === null, true)
  }

  // The other things a lookup may return, each in its own words.
  for (const [reading, kind, words] of [
    [{ status: 'ok', observed: [TOKEN] }, 'ownership', 'domains.found.ok'],
    [
      { status: 'missing', error: 'NXDOMAIN' },
      'ownership',
      `domains.found.missing${JSON.stringify({ type: 'TXT', name: `_tracy.${DOMAIN}` })}`
    ],
    [
      { status: 'unknown', error: 'ESERVFAIL' },
      'ownership',
      `domains.found.unknown${JSON.stringify({ reason: 'ESERVFAIL' })}`
    ],
    [
      { status: 'unknown', error: 'TIMEOUT' },
      'routing',
      `domains.found.unknown${JSON.stringify({ reason: 'TIMEOUT' })}`
    ],
    [{ status: 'unknown', error: 'TARGET_CHANGED' }, 'routing', 'domains.found.targetChanged'],
    [{ status: 'unknown', error: 'NO_TARGET' }, 'routing', 'domains.noRouting'],
    [
      { status: 'wrong', observed: ['a.example.net', 'b.example.net', 'a.example.net'], error: 'LOOP' },
      'routing',
      `domains.found.loop${JSON.stringify({ found: 'a.example.net, b.example.net, a.example.net' })}`
    ],
    [
      { status: 'wrong', observed: ['parked.example.net'] },
      'routing',
      `domains.found.wrong${JSON.stringify({ found: 'parked.example.net' })}`
    ]
  ]) {
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
    await openWithDomain({ domain: ownDomain({ [kind]: reading }) })
    assert.equal(found(kind).textContent, words, JSON.stringify(reading))
    assert.equal(found(kind).getAttribute('data-found'), reading.status)
  }
})

test('nothing reads verified by inference: a domain never looked up, an answer with no readings, readings that are not ones — all draw "not checked", and no way to connect', async () => {
  const bare = {
    name: DOMAIN,
    kind: 'custom',
    state: 'pending',
    verification: { type: 'TXT', name: `_tracy.${DOMAIN}`, value: TOKEN }
  }
  for (const [what, domain] of [
    [
      'an answer from a server older than the readings',
      { ...bare, readiness: { ownership: true, routing: true, tls: true } }
    ],
    ['readings that are not a list', { ...bare, checks: 'ok' }],
    [
      'a reading with a status nobody defined',
      {
        ...bare,
        checks: [
          { record: 'ownership', type: 'TXT', name: 'x', status: 'verified' },
          { record: 'routing', type: 'CNAME', name: 'x', status: true }
        ]
      }
    ],
    [
      'readings for records nobody defined',
      { ...bare, checks: [{ record: 'tls', type: 'A', name: 'x', status: 'ok' }, null, 7] }
    ],
    [
      'one record read right, the other not sent',
      {
        ...bare,
        checks: [
          {
            record: 'ownership',
            type: 'TXT',
            name: `_tracy.${DOMAIN}`,
            expected: TOKEN,
            status: 'ok',
            observed: [TOKEN]
          }
        ]
      }
    ],
    [
      'the same record twice, the second saying ok',
      {
        ...bare,
        checks: [
          { record: 'routing', type: 'CNAME', name: DOMAIN, status: 'missing', observed: [] },
          { record: 'routing', type: 'CNAME', name: DOMAIN, status: 'ok', observed: [] }
        ]
      }
    ]
  ]) {
    await openWithDomain({ publish: 'published', domain })
    assert.notEqual(domainStateOf(), 'verified', what)
    assert.notEqual(domainStateOf(), 'live', what)
    assert.equal(domainCard().querySelector('[data-action="connect-live"]') === null, true, what)
    assert.equal(
      domainCard().querySelectorAll('[data-record]').length,
      2,
      `${what}: both records are still shown`
    )
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
  }
  // A domain that is not one is not drawn at all — and then the site reads as having none.
  for (const pending of [null, 7, 'shop.example.com', { name: '' }, { name: 7 }, []]) {
    const srv = server()
    srv.onSettings = (key) => {
      const snapshot = srv.snapshot(key)
      snapshot.addressChange.pending = pending
      return jsonReply(snapshot)
    }
    const entry = await mount(view(srv))
    await settle()
    assert.equal(domainCard() === null, true, JSON.stringify(pending))
    await lib.act(async () => entry.root.unmount())
    entry.host.remove()
    mounted.splice(0)
  }
})

test('Connect domain: the Owner of a site with no domain of its own opens a form for one, and what is sent says it is a domain — a Tracy address typed there cannot rename the site', async () => {
  const { srv } = await openPublish({ publish: 'published' })
  // Once live, Continue is the way to a domain of one's own: its step opens on the field.
  assert.equal(offered().includes('continue'), true)
  await walkTo('domain')
  const form = document.querySelector('form[data-form="domain"]')
  assert.equal(form !== null, true)
  assert.equal(form.querySelector('label').textContent, 'domains.name')
  assert.equal(form.closest('[data-own-domain-entry]') !== null, true, 'the field is the step')
  const input = form.querySelector('input')
  assert.equal(input.value, '', "it does not start from the site's Tracy address")
  const type = async (value) => {
    await lib.act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await settle()
  }
  await type('Shop.Example.com')
  srv.routes['GET availability'] = (asked) =>
    jsonReply({ name: asked.toLowerCase(), kind: 'custom', available: true })
  await press('flow.domain.check', form)
  assert.deepEqual(srv.sent.at(-1), {
    what: 'GET availability',
    query: 'name=Shop.Example.com&kind=custom',
    body: null
  })
  srv.routes['PUT address'] = () => jsonReply({ state: 'pending', pending: ownDomain() }, 202)
  // Save is the step's footer press, once the door said the name is free.
  await press('settings.url.save', document.querySelector('[data-wizard-footer]'))
  assert.deepEqual(srv.sent.at(-1), {
    what: 'PUT address',
    query: null,
    body: { name: DOMAIN, kind: 'custom' }
  })
  // The card is what the door answered: saved, both records to create, nothing looked up yet.
  assert.equal(domainStateOf(), 'waiting')
  assert.equal(found('ownership').textContent, 'domains.found.unchecked')
  // Unchecked still gets the hint, right after the checked-at line.
  assert.equal(line('checked-at').nextElementSibling.getAttribute('data-line'), 'dns-only')
  assert.equal(document.querySelector('form[data-form]') === null, true)
  assert.equal(document.querySelector('[data-own-domain-entry]') === null, true, 'one own domain at a time')

  // The refusals of the door for a domain are said in the reader's words, under the form.
  for (const { root, host } of mounted.splice(0)) {
    await lib.act(async () => root.unmount())
    host.remove()
  }
  for (const [status, code, key] of [
    [400, 'DOMAIN_NOT_BARE', 'settings.url.notBare'],
    [400, 'DOMAIN_TOO_LONG', 'settings.url.tooLong'],
    [400, 'DOMAIN_IS_TRACY', 'settings.url.isTracy'],
    [409, 'DOMAIN_LIMIT', 'settings.url.limit'],
    [409, 'ADDRESS_CHANGE_BUSY', 'settings.url.busy'],
    [400, 'INVALID_SITE_KEY', 'settings.url.invalid'],
    [403, 'OWN_DOMAIN_DISABLED', 'settings.url.ownDomainOff'],
    // No Cloudflare for SaaS on this server, and a name still being released (#1037, slice 2).
    [503, 'OWN_DOMAIN_UNAVAILABLE', 'settings.url.ownDomainUnavailable'],
    [409, 'DOMAIN_RELEASING', 'settings.url.releasing'],
    // A refusal named on another status is not the door's answer.
    [409, 'OWN_DOMAIN_DISABLED', 'settings.url.failed'],
    [500, 'OWN_DOMAIN_UNAVAILABLE', 'settings.url.failed'],
    [503, 'UI_SETTING_UNREADABLE', 'settings.url.failed']
  ]) {
    const again = await openPublish({ publish: 'published' }, undefined, 'domain')
    const open = document.querySelector('form[data-form="domain"]')
    const field = open.querySelector('input')
    await lib.act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        field,
        'x.example.com'
      )
      field.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    again.srv.routes['GET availability'] = () => jsonReply({ code }, status)
    await press('flow.domain.check', open)
    assert.deepEqual(alerts(), [key], code)
    assert.equal(domainCard() === null, true, code)
    await lib.act(async () => again.root.unmount())
    again.host.remove()
    mounted.splice(0)
  }
})

test('Check again asks the door and draws what it answered — a record now found reads found, one taken away reads missing again, and a refusal changes nothing on the card', async () => {
  const { srv } = await openWithDomain({
    domain: ownDomain({
      ownership: { status: 'missing', error: 'NXDOMAIN' },
      routing: { status: 'missing', error: 'NODATA' }
    })
  })
  srv.routes['POST verify'] = () =>
    jsonReply({ state: 'pending', pending: ownDomain({ ownership: OK, routing: ROUTED }) }, 202)
  await act('check-dns', domainCard())
  assert.deepEqual(srv.sent.at(-1), { what: 'POST verify', query: null, body: { name: DOMAIN } })
  assert.equal(domainStateOf(), 'verified')
  assert.equal(found('ownership').textContent, 'domains.found.ok')
  // Taken away again: the next check says so; "verified" was only ever that one reading.
  srv.routes['POST verify'] = () =>
    jsonReply(
      {
        state: 'pending',
        pending: ownDomain({ ownership: OK, routing: { status: 'missing', error: 'NODATA' } })
      },
      202
    )
  await act('check-dns', domainCard())
  assert.equal(domainStateOf(), 'waiting')
  // A refusal, and an answer nobody can read: said under the cards, the card left as it was.
  for (const [answer, said] of [
    [() => jsonReply({ code: 'ADDRESS_CHANGE_BUSY' }, 409), 'settings.url.busy'],
    [() => jsonReply({ code: 'NAME_NOT_RESERVED' }, 404), 'settings.url.notReserved'],
    [() => jsonReply({ code: 'RESERVATION_LAPSED' }, 409), 'settings.url.lapsed'],
    [() => jsonReply({ code: 'OWN_DOMAIN_DISABLED' }, 403), 'settings.url.ownDomainOff'],
    [() => new Response('<html>bad gateway</html>', { status: 502 }), 'settings.url.failed'],
    [() => Promise.reject(new TypeError('offline')), 'settings.url.failed']
  ]) {
    srv.routes['POST verify'] = answer
    await act('check-dns', domainCard())
    assert.deepEqual(alerts(), [said])
    assert.equal(domainStateOf(), 'waiting', 'nothing was drawn from an answer that is not a reading')
  }
})

test('Remove domain asks first; a reservation leaves at once, a connected domain goes as an operation the screen follows — and a removal that did not finish is retried from the card', async () => {
  // Only a reservation: confirmed, removed, and the way in is back.
  const plain = await openWithDomain()
  await act('remove-domain', domainCard())
  assert.equal(dialog() !== null, true)
  assert.match(dialog().textContent, /domains\.removeTitle\{"domain":"shop\.example\.com"\}/)
  await press('action.cancel', dialog())
  await dialogGone()
  assert.equal(plain.srv.sent.length, 0, 'Cancel sends nothing')
  await act('remove-domain', domainCard())
  plain.srv.routes['DELETE domain'] = () => jsonReply({ ok: true, removed: DOMAIN })
  await lib.act(async () => click(dialog().querySelector('[data-confirm="remove-domain"]')))
  await settle()
  assert.deepEqual(plain.srv.sent.at(-1), { what: 'DELETE domain', query: null, body: { name: DOMAIN } })
  assert.equal(domainCard() === null, true)
  // The field for a new domain comes back on the same step.
  assert.equal(document.querySelector('[data-own-domain-entry] form[data-form="domain"]') !== null, true)
  for (const { root, host } of mounted.splice(0)) {
    await lib.act(async () => root.unmount())
    host.remove()
  }

  // Connected: the door answers 202, and the state read back is what the card then says.
  const { srv } = await openWithDomain({
    publish: 'published',
    domain: ownDomain({ state: 'connected', ownership: OK, routing: ROUTED })
  })
  await act('remove-domain', domainCard())
  srv.routes['DELETE domain'] = () => {
    srv.state.operation = {
      op: 'drop-domain',
      domains: [DOMAIN],
      state: 'running',
      confirmed: true,
      jobId: 'job-3',
      startedAt: CHECKED
    }
    return jsonReply({ jobId: 'job-3', op: 'drop-domain', state: 'running', ...srv.state }, 202)
  }
  await lib.act(async () => click(dialog().querySelector('[data-confirm="remove-domain"]')))
  await until(() => assert.equal(domainStateOf(), 'removing'), 'removing')
  assert.deepEqual(offered(), [])
  // The address step waits too: no Back to draft beside a removal.
  await lib.act(async () => click(document.querySelector('[data-wizard-back]')))
  await settle()
  assert.equal(working(), 'drop-domain')
  // Continue only moves back to the domain's card; it asks the server nothing.
  assert.deepEqual(
    offered().filter((action) => action !== 'continue'),
    []
  )
  // The chip lives on the address card: the site itself stays live.
  assert.equal(chip().status, 'live', 'the site itself stays live')
  await walkTo('domain')
  // It fails: on the card, with its own retry, which sends the same removal again.
  srv.state.operation = {
    op: 'drop-domain',
    domains: [DOMAIN],
    state: 'failed',
    code: 'DOMAIN_STILL_ROUTED',
    retry: true,
    jobId: 'job-3',
    startedAt: CHECKED,
    endedAt: CHECKED
  }
  await until(() => assert.equal(domainStateOf(), 'cleanup'), 'cleanup')
  assert.equal(domainCard().querySelector('[data-line="domain-failed"]').getAttribute('role'), 'alert')
  const before = srv.sent.length
  srv.routes['DELETE domain'] = () => {
    srv.state.operation = {
      op: 'drop-domain',
      domains: [DOMAIN],
      state: 'running',
      confirmed: true,
      jobId: 'job-3',
      startedAt: CHECKED
    }
    return jsonReply({ jobId: 'job-3', op: 'drop-domain', state: 'running', ...srv.state }, 202)
  }
  await act('retry-remove', domainCard())
  assert.equal(srv.sent.length, before + 1)
  assert.deepEqual(srv.sent.at(-1).body, { name: DOMAIN })
  await until(() => assert.equal(domainStateOf(), 'removing'), 'removing again')
  // Done: the server no longer has the domain, and the tab's next snapshot says so.
  srv.connected = null
  srv.state.operation = null
  await until(() => assert.equal(domainCard() === null, true), 'the card leaves with the domain')
  // The domain step stays, now offering a new domain; the address card still says Live.
  await lib.act(async () => click(document.querySelector('[data-wizard-back]')))
  await settle()
  assert.equal(chip().status, 'live')
})

test('connecting on a site that is already live is one more publish — the direction alone is sent — and the card follows the server to Live', async () => {
  const { srv } = await openWithDomain({
    publish: 'published',
    domain: ownDomain({ ownership: OK, routing: ROUTED })
  })
  srv.goLive = (body) => {
    srv.state.operation = {
      op: 'live',
      domains: [DOMAIN],
      state: 'running',
      confirmed: true,
      jobId: 'job-5',
      startedAt: CHECKED
    }
    return jsonReply({ jobId: 'job-5', op: body.op, state: 'running', ...srv.state }, 202)
  }
  await act('connect-live', domainCard())
  assert.deepEqual(srv.posts, [{ op: 'live' }], 'no domain is ever named by the screen')
  await until(() => assert.equal(domainStateOf(), 'connecting'), 'connecting')
  srv.pending = null
  srv.connected = [ownDomain({ state: 'connected', ownership: OK, routing: ROUTED })]
  srv.state.operation = null
  await until(() => assert.equal(domainStateOf(), 'live'), 'live')
  // Back to draft (on the address step) now warns, by name, that the domain stops reaching the site.
  await lib.act(async () => click(document.querySelector('[data-wizard-back]')))
  await settle()
  await act('draft')
  assert.match(dialog().textContent, /domains\.draftStops\{"domain":"shop\.example\.com"\}/)
  assert.equal(
    dialog().querySelector('[data-line="draft-domain"]').classList.contains('tv-domain-note-alert'),
    true
  )
})

test('a draft site offers no way to a new domain: the domain step comes once the site is live, and nothing is sent to get there', async () => {
  const { srv } = await openPublish()
  assert.equal(offered().includes('continue'), false)
  assert.equal(document.querySelector('[data-action="to-domain"]') === null, true)
  assert.equal(document.querySelector('form[data-form]') === null, true, 'no domain form on a draft site')
  // The step bar does not jump ahead either: the domain step is not done.
  const domainSegment = document.querySelector('[data-wizard-goto="domain"]')
  assert.equal(domainSegment.disabled, true)
  assert.deepEqual(goLiveCalls(srv), [])
  await press('publish.publish')
  srv.end('done')
  await until(() => assert.equal(chip().status, 'live'), 'live')
  assert.equal(offered().includes('continue'), true)
})

test('a seat that is not the Owner sees the domain and its state, never its proof and never an action it would be refused — an Admin may still connect a verified domain by publishing', async () => {
  for (const role of ['admin', 'developer', 'editor']) {
    await openWithDomain({
      role,
      publish: 'published',
      domain: ownDomain({ owner: false, ownership: OK, routing: ROUTED })
    })
    assert.equal(domainStateOf(), 'verified', role)
    assert.equal(
      document.body.textContent.includes(TOKEN),
      false,
      `${role}: the token is nowhere on the page`
    )
    assert.equal(record('ownership').querySelector('[data-record-value]') === null, true, role)
    assert.equal(record('routing').querySelector('[data-record-value]').textContent, TARGET, role)
    assert.equal(domainCard().querySelector('[data-line="domain-role"]') !== null, true, role)
    assert.deepEqual(domainActions(), role === 'admin' ? ['connect-live'] : [], role)
    assert.equal(document.querySelector('[data-own-domain-entry]') === null, true, role)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
  }
  // A seat with no domain to see is offered no way in either: no domain step at all.
  await openPublish({ role: 'admin', publish: 'published' })
  assert.equal(offered().includes('continue'), false)
  assert.equal(document.querySelector('[data-wizard-goto="domain"]') === null, true)
  assert.equal(document.querySelector('[data-own-domain-entry]') === null, true)
})

test('an operator can hide the way in: the Connect button sits in the one element the `site-connect-domain` switch hides, and a domain a site already has is outside it', async () => {
  await openPublish({ publish: 'published' }, undefined, 'domain')
  const entry = document.querySelector('[data-own-domain-entry]')
  assert.equal(entry !== null && entry.classList.contains('tv-own-domain-entry'), true)
  assert.equal(entry.querySelector('form[data-form="domain"]') !== null, true)
  // Switched off, a site with no domain has no domain step to go to.
  document.documentElement.setAttribute('data-tracy-hide', 'site-connect-domain')
  await settle()
  assert.equal(document.querySelector('[data-own-domain-entry]') === null, true)
  assert.equal(offered().includes('continue'), false)
  document.documentElement.removeAttribute('data-tracy-hide')
  const css = readFileSync(
    path.join(repo, 'packages/site/tracy-site-tabs/src/client/site-tabs-rules.css'),
    'utf8'
  )
  assert.match(
    css,
    /:root\[data-tracy-hide~="site-connect-domain"\] \.tracy-site-tabs \.tv-own-domain-entry \{ display: none; \}/
  )
  // The doors refuse to check DNS or reserve again while it is off: those buttons go with it too.
  for (const action of ['check-dns', 'reserve-again'])
    assert.match(
      css,
      new RegExp(
        `:root\\[data-tracy-hide~="site-connect-domain"\\] \\.tracy-site-tabs \\[data-action="${action}"\\]`
      ),
      action
    )
  const catalogue = JSON.parse(
    readFileSync(path.join(repo, 'packages/core/tracy-core/src/ui-switches/catalogue.json'), 'utf8')
  )
  assert.equal(
    catalogue.switches.filter((s) => s.id === 'site-connect-domain' && s.defaultOn === true).length,
    1
  )
  for (const { root, host } of mounted.splice(0)) {
    await lib.act(async () => root.unmount())
    host.remove()
  }
  await openWithDomain()
  assert.equal(domainCard().closest('[data-own-domain-entry]') === null, true)
})

test('a domain that starts with www. says how its bare name reaches the site; any other subdomain says nothing', async () => {
  const bare = () => domainCard().querySelector('[data-line="bare-name"]')
  await openWithDomain({ domain: { ...ownDomain(), name: 'www.example.com' } })
  assert.equal(
    bare().textContent,
    `domains.bareName${JSON.stringify({ bare: 'example.com', domain: 'www.example.com' })}`
  )
  for (const { root, host } of mounted.splice(0)) {
    await lib.act(async () => root.unmount())
    host.remove()
  }
  // `shop.example.com` has no bare name of its own to forward.
  await openWithDomain()
  assert.equal(bare(), null)
})

test('a domain card draws no focus halo of its own, and every colour it uses is a token', () => {
  const css = readFileSync(
    path.join(repo, 'packages/site/tracy-site-tabs/src/client/site-tabs-rules.css'),
    'utf8'
  )
  const mine = css.split('\n').filter((rule) => /tv-own-domain|tv-domain-(chip|record|found)/.test(rule))
  assert.ok(mine.length > 10)
  for (const rule of mine) {
    assert.doesNotMatch(rule, /box-shadow|ring-|outline:\s*[2-9]px/, rule)
    assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/, rule)
  }
})

// ── A bare domain, a reservation that lapsed (review findings after #988) ──────────────────────────

test('a bare domain typed into Connect domain is refused under the field, with the subdomain to enter instead', async () => {
  const { srv } = await openPublish({ publish: 'published' }, undefined, 'domain')
  const form = document.querySelector('form[data-form="domain"]')
  const input = form.querySelector('input')
  await lib.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      input,
      ' Example.com. '
    )
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  srv.routes['GET availability'] = () =>
    jsonReply({ code: 'DOMAIN_APEX_UNSUPPORTED', name: 'example.com', suggestion: 'www.example.com' }, 400)
  await press('flow.domain.check', form)
  const said = 'settings.url.apex{"domain":"example.com","suggestion":"www.example.com"}'
  assert.deepEqual(alerts(), [said])
  const under = form.querySelector('[data-line="field-error"]')
  assert.equal(under !== null && under.textContent === said, true, 'said inside the form, under the field')
  assert.equal(input.getAttribute('aria-invalid'), 'true')
  assert.equal(named('settings.url.save').length, 0, 'nothing to save: no Save at all')
  // The help says what to enter in the first place.
  assert.match(form.textContent, /domains\.help/)
})

test('a bare domain reserved before it was refused: the card says why it can never connect and what to use instead, asks for no record, and offers Remove only', async () => {
  const apex = {
    ...ownDomain(),
    name: 'example.com',
    problem: 'DOMAIN_APEX_UNSUPPORTED',
    suggestion: 'www.example.com'
  }
  delete apex.routing
  const { srv } = await openWithDomain({ domain: apex })
  assert.equal(domainStateOf(), 'unsupported')
  assert.equal(
    domainCard().querySelector('[data-domain-chip]').textContent.trim(),
    'domains.state.unsupported'
  )
  assert.equal(
    domainCard().querySelector('[data-line="domain-lead"]').textContent,
    'domains.lead.unsupported{"domain":"example.com","suggestion":"www.example.com"}'
  )
  assert.equal(domainCard().querySelector('.tv-domain-records'), null, 'no record to create')
  assert.equal(line('checked-at'), null)
  assert.equal(line('dns-only'), null)
  assert.deepEqual(domainActions(), ['remove-domain'])
  srv.routes['DELETE domain'] = () => {
    srv.pending = null
    return jsonReply({ ok: true, removed: 'example.com' })
  }
  // It never opened the site: removed at once, with no warning that it stops doing so.
  await act('remove-domain', domainCard())
  assert.equal(dialog(), null)
  assert.deepEqual(srv.sent.at(-1), { what: 'DELETE domain', query: null, body: { name: 'example.com' } })
  assert.equal(domainCard() === null, true)
  assert.equal(document.querySelector('[data-own-domain-entry] form[data-form="domain"]') !== null, true)
})

test('a bare domain reserved before it was refused, whose publish failed: still why it can never connect and Remove — not Failed, its records and Connect again', async () => {
  const apex = {
    ...ownDomain(),
    name: 'example.com',
    problem: 'DOMAIN_APEX_UNSUPPORTED',
    suggestion: 'www.example.com'
  }
  delete apex.routing
  await openWithDomain({
    domain: apex,
    op: { op: 'live', state: 'failed', code: 'SITE_LIVE_FAILED', domains: ['example.com'] }
  })
  assert.equal(domainStateOf(), 'unsupported')
  assert.equal(
    domainCard().querySelector('[data-line="domain-lead"]').textContent,
    'domains.lead.unsupported{"domain":"example.com","suggestion":"www.example.com"}'
  )
  assert.equal(domainCard().querySelector('.tv-domain-records'), null, 'no record to create')
  assert.deepEqual(domainActions(), ['remove-domain'])
})

test('a name under a suffix the server cannot tell is a registered one, reserved before it was refused: the card says it can never connect, suggests nothing, asks for no record, and offers Remove only — after a failed publish too', async () => {
  for (const op of [
    null,
    { op: 'live', state: 'failed', code: 'SITE_LIVE_FAILED', domains: ['shop.example'] }
  ]) {
    const odd = { ...ownDomain(), name: 'shop.example', problem: 'INVALID_SITE_KEY' }
    delete odd.routing
    const opened = await openWithDomain({ domain: odd, ...(op ? { op } : {}) })
    assert.equal(domainStateOf(), 'unsupported')
    assert.equal(
      domainCard().querySelector('[data-line="domain-lead"]').textContent,
      'domains.lead.unconnectable{"domain":"shop.example"}'
    )
    assert.equal(domainCard().querySelector('.tv-domain-records'), null, 'no record to create')
    assert.equal(line('checked-at'), null)
    assert.equal(line('dns-only'), null)
    assert.deepEqual(domainActions(), ['remove-domain'])
    await lib.act(async () => opened.root.unmount())
    opened.host.remove()
    mounted.splice(0)
  }
})

test('a pending domain says until when it holds its name; one that lapsed says so, offers Reserve again and Remove, and draws what the door answers', async () => {
  const held = await openWithDomain({ domain: { ...ownDomain(), holdUntil: '2026-10-10T09:15:00.000Z' } })
  assert.match(line('hold-until').textContent, /^domains\.holdUntil\{"when":/)
  assert.equal(line('hold-until').getAttribute('data-hold-until'), '2026-10-10T09:15:00.000Z')
  assert.equal(line('dns-only').textContent, 'domains.dnsOnly')
  await lib.act(async () => held.root.unmount())
  held.host.remove()
  mounted.splice(0)

  const srv = server()
  srv.lapsed = [{ name: DOMAIN, kind: 'custom', state: 'lapsed', lapsedAt: '2026-10-07T09:15:00.000Z' }]
  await mount(view(srv))
  await settle()
  await walkTo('domain')
  assert.equal(domainStateOf(), 'lapsed')
  assert.equal(
    domainCard().querySelector('[data-line="domain-lead"]').textContent,
    `domains.lead.lapsed{"domain":"${DOMAIN}"}`
  )
  assert.equal(domainCard().querySelector('.tv-domain-records'), null)
  assert.equal(line('hold-until'), null)
  assert.equal(line('dns-only'), null)
  assert.deepEqual(domainActions(), ['remove-domain', 'reserve-again'])
  // Somebody else has it now: said, and the card stays as the server last read it.
  srv.routes['PUT address'] = () => jsonReply({ code: 'NAME_TAKEN' }, 409)
  await act('reserve-again', domainCard())
  assert.deepEqual(srv.sent.at(-1), {
    what: 'PUT address',
    query: null,
    body: { name: DOMAIN, kind: 'custom' }
  })
  assert.deepEqual(alerts(), ['settings.url.taken'])
  assert.equal(domainStateOf(), 'lapsed')
  // Still free: a new reservation, with its own records to add.
  srv.routes['PUT address'] = () => jsonReply({ state: 'pending', pending: ownDomain() }, 202)
  await act('reserve-again', domainCard())
  assert.equal(domainStateOf(), 'waiting')
  assert.equal(found('ownership').textContent, 'domains.found.unchecked')
  assert.deepEqual(alerts(), [])
})

test('Remove on a lapsed reservation clears its notice, and the way in comes back', async () => {
  const srv = server()
  srv.lapsed = [{ name: DOMAIN, kind: 'custom', state: 'lapsed', lapsedAt: '2026-10-07T09:15:00.000Z' }]
  await mount(view(srv))
  await settle()
  await walkTo('domain')
  srv.routes['DELETE domain'] = () => {
    srv.lapsed = null
    return jsonReply({ ok: true, removed: DOMAIN })
  }
  await act('remove-domain', domainCard())
  assert.equal(dialog(), null)
  assert.deepEqual(srv.sent.at(-1), { what: 'DELETE domain', query: null, body: { name: DOMAIN } })
  assert.equal(domainCard() === null, true)
  assert.equal(document.querySelector('[data-own-domain-entry] form[data-form="domain"]') !== null, true)
})

test('#1037 slice 2: a record the certificate asks for is drawn after the two Tracy names, each its own line with its copy buttons, and a domain whose certificate is pending says so', async () => {
  const base = ownDomain({
    ownership: { status: 'ok', observed: [TOKEN] },
    routing: { status: 'ok', observed: [TARGET] }
  })
  const domain = {
    ...base,
    hostname: { ready: false, reason: 'CERT_PENDING' },
    connection: { status: 'failed', error: 'CERT_PENDING', checkedAt: CHECKED },
    checks: [
      ...base.checks,
      {
        record: 'validation',
        type: 'TXT',
        name: `_acme-challenge.${DOMAIN}`,
        expected: 'v-one',
        status: 'unchecked',
        observed: []
      },
      {
        record: 'validation',
        type: 'TXT',
        name: `_acme-challenge.${DOMAIN}`,
        expected: 'v-two',
        status: 'unchecked',
        observed: []
      }
    ]
  }
  await openWithDomain({ domain })
  const lines = [...domainCard().querySelectorAll('[data-record]')].map((r) => r.getAttribute('data-record'))
  assert.deepEqual(lines, ['ownership', 'routing', 'validation', 'validation'])
  const validation = [...domainCard().querySelectorAll('[data-record="validation"]')]
  assert.deepEqual(
    validation.map((r) => r.querySelector('[data-record-value]').textContent),
    ['v-one', 'v-two']
  )
  for (const r of validation) {
    assert.equal(r.querySelector('.tv-domain-record-title').textContent, 'domains.record.validation')
    assert.equal(r.querySelector('[data-found]').textContent, 'domains.found.validation')
    assert.equal(r.querySelectorAll('[data-copy]').length, 2)
  }
  assert.equal(domainStateOf(), 'unreachable')
  const line = domainCard().querySelector('[data-line="domain-unreachable"]')
  assert.match(line.textContent, /domains\.unreachable\.certificatePending/)
  // The probed-at branch keeps the DNS only hint: one line, straight after its checked-at line.
  const probed = domainCard().querySelector('[data-line="checked-at"]')
  assert.match(probed.textContent, /^domains\.probedAt\{"when":/)
  assert.equal(probed.nextElementSibling.getAttribute('data-line'), 'dns-only')
  assert.equal(probed.nextElementSibling.textContent, 'domains.dnsOnly')
  assert.equal(domainCard().querySelectorAll('[data-line="dns-only"]').length, 1)
})
