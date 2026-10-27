/**
 * Who the Team tab lets invite, and which roles the wizard offers them — issue #798 (F-S3-004).
 *
 * The door `POST /api/team/invite` lets an accepted Owner or Editor invite a Viewer or an Editor,
 * a Viewer invites nobody, and nobody invites an Owner (ADR 0028). The screen once offered Invite
 * to Owner and Admin alone, and offered every role to whoever got in. These tests mount the real `TeamView` and `InviteWizard` and read the DOM they draw.
 *
 * The two components are bundled by esbuild and mounted with React into jsdom; `fetch` is a
 * recorder that answers `/api/team`, `/auth/me` and `/api/team/invite`. `t` returns the key it is
 * asked for, so an assertion names a string by its key and never by its wording. jsdom is resolved
 * the way `popover-escape.test.mjs` does it.
 *
 * WHAT THIS DOES NOT RUN: tracy-web (the door's replies here are written by hand), a real browser
 * (no layout, no focus trap, no pointer events beyond `click`), and the dsh page the tab sits in.
 *
 *   node --test packages/core/tracy-core/test/team-invite.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const require = createRequire(import.meta.url)

/** jsdom, from a workspace member that declares it. A tree without it fails here, by name. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(repo, home, 'package.json'))('jsdom')
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
/**
 * Every `MessageChannel` the bundle opens. The dialog's library opens one per scheduled step and
 * never closes it, and an open port keeps Node alive: the run ended and the process did not
 * (measured: several hundred ports left). They are closed once the last test is done.
 */
const channels = []
const NativeMessageChannel = globalThis.MessageChannel

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
  // Not in jsdom; the dialog and the scroll helpers ask for them.
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

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'team-invite-'))
  const outfile = path.join(outDir, 'team-invite.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { TeamView } from './site-tabs/TeamView'
        export { InviteWizard } from './team/wizard'
        export { ApproveDialog } from './team/team'
      `,
      resolveDir: path.join(here, '..', 'src'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
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

/** Mounted roots of the running test, unmounted afterwards so one test cannot leak into the next. */
const mounted = []

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    await lib.act(async () => root.unmount())
    host.remove()
  }
  document.body.replaceChildren()
  delete globalThis.fetch
})

// ── the page around the components ────────────────────────────────────────────────────────────────

/** `t` as a tab hands it over, answering with the key and its parameters: stable under rewording. */
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key)

const SITE = 'acme.test'
const OTHER = 'other.test'
const VIEWER = 'me@acme.test'

const jsonReply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A promise and its two handles, for an answer the test lets through when it chooses. */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Replace `fetch` with a recorder. `team` answers `GET /api/team`, `invite` answers the door; each
 * is a function of the request so a test can refuse, hang or break an answer.
 */
function stubFetch({
  team = () => jsonReply({ sites: [] }),
  invite = () => jsonReply({ results: [] })
} = {}) {
  const posts = []
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url)
    if (target === '/api/team') return team()
    if (target === '/auth/me') return jsonReply({ email: VIEWER })
    if (target === '/api/team/invite') {
      const body = JSON.parse(init.body)
      posts.push(body)
      return invite(body)
    }
    throw new Error(`unexpected request: ${target}`)
  }
  return posts
}

/** One site's book as `GET /api/team` sends it for an accepted seat of `myRole`. */
const book = (siteKey, myRole) => ({
  siteKey,
  platform: 'wordpress',
  myRole,
  status: 'accepted',
  seats: [
    {
      id: 'acc-me',
      email: VIEWER,
      displayName: null,
      avatarUrl: null,
      role: myRole,
      status: 'active',
      grantedAt: '2026-09-01T00:00:00Z',
      grantedBy: 'acc-boss',
      grantedByEmail: 'boss@acme.test',
      revokedAt: null,
      requestedAt: null,
      scope: 'site'
    }
  ]
})

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
const settle = async () => {
  for (let turn = 0; turn < 5; turn++) await lib.act(async () => new Promise((r) => setTimeout(r, 0)))
}

/** The Team tab of `SITE` for a viewer whose accepted-sites row and loaded book are as given. */
async function mountTeam({ role, sites, team, inviteOnOpen = false, invite } = {}) {
  const posts = stubFetch({
    team: team ?? (() => jsonReply({ sites: [book(SITE, role)] })),
    invite
  })
  await mount(
    lib.createElement(lib.TeamView, {
      siteKey: SITE,
      role,
      sites: sites ?? [{ siteKey: SITE, role }],
      onPick: () => {},
      inviteOnOpen,
      t
    })
  )
  await settle()
  return posts
}

/** The wizard by itself, over `sites` (`{siteKey, myRole}`), optionally with a preset. */
async function mountWizard({ sites, preset, invite, onSent = () => {}, onOpenChange = () => {} }) {
  const posts = stubFetch({ invite })
  const entry = await mount(
    lib.createElement(lib.InviteWizard, {
      open: true,
      onOpenChange,
      sites: sites.map((s) => ({ platform: null, ...s })),
      preset,
      onSent,
      t
    })
  )
  await settle()
  return { posts, entry }
}

// ── reading and pressing ──────────────────────────────────────────────────────────────────────────

const inviteButton = () => document.querySelector('button[title="action.invite"]')
const dialog = () => document.querySelector('[role="dialog"]')
const text = () => document.body.textContent ?? ''
const buttons = () => [...document.querySelectorAll('button')]
const buttonNamed = (key) => buttons().find((b) => (b.textContent ?? '').trim().startsWith(key))
const roleRadio = (role) => document.getElementById(`tracy-mysites-role-${role}`)
const offeredRoles = () => ['editor', 'viewer', 'owner'].filter((r) => roleRadio(r) !== null)
/** The id sits on the radio's native input or on its `role="radio"` element, by library version. */
const isChecked = (el) =>
  el?.checked === true ||
  el?.getAttribute('aria-checked') === 'true' ||
  Boolean(el?.closest('label')?.querySelector('[aria-checked="true"]'))
// 🔒 A jsdom node must never reach assert's own diff (it walks the whole window and the run dies of
// memory): compare first and hand `assert.ok` the boolean.
const isDisabled = (el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true'

async function click(element, label = 'element') {
  assert.ok(element, `${label} is on screen`)
  await lib.act(async () => element.click())
  await settle()
}

const press = (key) => click(buttonNamed(key), `the ${key} button`)

/** Type one address into Who and commit it the way Enter does. */
async function typeEmail(address) {
  const input = document.getElementById('tracy-mysites-invite-emails')
  assert.ok(input, 'the Who step shows the address box')
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await lib.act(async () => {
    setValue.call(input, address)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await lib.act(async () => {
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
  })
  await settle()
}

/** The Sites step's rows, by the site key each one shows. */
const siteCheckbox = (siteKey) =>
  [...document.querySelectorAll('li')]
    .find((li) => (li.textContent ?? '').includes(siteKey) && li.querySelector('[role="checkbox"]'))
    ?.querySelector('[role="checkbox"]')

const PRESET = { emails: ['new@acme.test'], siteKeys: [SITE] }

/** From a wizard opened for a fixed address (People, sites known): on to Review, then Send. */
async function sendFromRole() {
  await press('wizard.continue')
  await press('wizard.send')
}

// ── F-S3-004: who is offered Invite ───────────────────────────────────────────────────────────────

test('the Team tab offers no Invite to a Viewer (ADR 0028)', async () => {
  await mountTeam({ role: 'viewer', inviteOnOpen: true })
  assert.ok(text().includes('roster.member'), 'the book is drawn')
  assert.ok(inviteButton() === null, 'no Invite control')
  assert.ok(dialog() === null, 'no wizard, even when the tab was asked to open one')
})

for (const role of ['owner', 'editor']) {
  test(`the Team tab offers Invite to an accepted ${role}`, async () => {
    await mountTeam({ role })
    assert.ok(inviteButton(), `an accepted ${role} sees the Invite control`)
    await click(inviteButton(), 'Invite')
    assert.ok(dialog(), 'pressing it opens the wizard')
    assert.ok(text().includes('wizard.title'))
  })
}

test('the Team tab offers no Invite while the viewer’s accepted seat is not established', async () => {
  const cases = {
    'no accepted-sites row for this site': { role: null, sites: [] },
    'a role the seat book does not have': { role: 'member', sites: [{ siteKey: SITE, role: 'member' }] },
    'the book says the seat is still pending': {
      role: 'editor',
      team: () =>
        jsonReply({
          sites: [{ siteKey: SITE, platform: null, myRole: 'editor', status: 'invited', seats: null }]
        })
    },
    'the book carries no role for the viewer': {
      role: 'owner',
      team: () =>
        jsonReply({ sites: [{ siteKey: SITE, platform: null, myRole: null, status: 'accepted', seats: [] }] })
    },
    'the book could not be read (500)': { role: 'owner', team: () => jsonReply({ code: 'X' }, 500) },
    'the book does not list this site': { role: 'owner', team: () => jsonReply({ sites: [] }) },
    'the viewer is signed out': { role: 'editor', team: () => jsonReply({}, 401) },
    'the read was dropped': {
      role: 'admin',
      team: () => {
        throw new TypeError('network down')
      }
    }
  }
  for (const [label, options] of Object.entries(cases)) {
    const posts = await mountTeam({ ...options, inviteOnOpen: true })
    assert.ok(inviteButton() === null, `${label}: no Invite control`)
    assert.ok(dialog() === null, `${label}: no wizard, even when the tab was asked to open one`)
    assert.deepEqual(posts, [], label)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
    document.body.replaceChildren()
  }
})

test('"Invite member" from My Sites opens the wizard for an Editor once the book is read', async () => {
  await mountTeam({ role: 'editor', inviteOnOpen: true })
  assert.ok(dialog(), 'the wizard is open')
  assert.ok(document.getElementById('tracy-mysites-invite-emails'), 'at Who')
})

test('every reader gets the one sentence that explains the three roles', async () => {
  for (const role of ['viewer', 'editor', 'owner']) {
    await mountTeam({ role })
    assert.ok(text().includes('team.rolesHint'), role)
    assert.ok(!text().includes('team.inviteEditors') && !text().includes('team.people'), role)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
    document.body.replaceChildren()
  }
})

test('roster management stays with the Owner: an Editor gets Invite and nothing else', async () => {
  const twoSeats = (myRole) => {
    const site = book(SITE, myRole)
    site.seats.push({ ...site.seats[0], id: 'acc-other', email: 'other@acme.test', role: 'editor' })
    return jsonReply({ sites: [site] })
  }
  await mountTeam({ role: 'editor', team: () => twoSeats('editor') })
  assert.ok(inviteButton())
  assert.ok(
    document.querySelector('[aria-label^="action.changeRole"], [title^="action.changeRole"]') === null
  )
  assert.ok(document.querySelector('[aria-label^="action.revoke"], [title^="action.revoke"]') === null)
})

// ── F-S3-004: which roles the wizard offers ───────────────────────────────────────────────────────

for (const role of ['owner', 'editor']) {
  test(`the wizard offers an ${role} seat Editor and Viewer, Editor first`, async () => {
    const { posts } = await mountWizard({ sites: [{ siteKey: SITE, myRole: role }], preset: PRESET })
    assert.deepEqual(offeredRoles(), ['editor', 'viewer'])
    assert.ok(isChecked(roleRadio('editor')) && !isChecked(roleRadio('viewer')), 'Editor is the first choice')
    assert.ok(text().includes('wizard.ownerNote'), 'the line under the list says where Owners come from')
    await click(roleRadio('viewer'), 'the Viewer role')
    assert.ok(isChecked(roleRadio('viewer')) && !isChecked(roleRadio('editor')), 'Viewer is now picked')
    await sendFromRole()
    assert.deepEqual(posts, [{ emails: ['new@acme.test'], role: 'viewer', siteKeys: [SITE] }])
  })
}

test('an Editor opening Invite from the Team tab reaches a role step with Editor and Viewer', async () => {
  const posts = await mountTeam({
    role: 'editor',
    // An owner seat elsewhere must not widen what this site's wizard offers.
    sites: [
      { siteKey: SITE, role: 'editor' },
      { siteKey: OTHER, role: 'owner' }
    ],
    team: () => jsonReply({ sites: [book(SITE, 'editor'), book(OTHER, 'owner')] }),
    invite: (body) =>
      jsonReply({
        results: body.emails.map((email) => ({
          email,
          notified: true,
          sites: body.siteKeys.map((siteKey) => ({ siteKey, outcome: 'invited' }))
        }))
      })
  })
  await click(inviteButton(), 'Invite')
  await typeEmail('new@acme.test')
  assert.deepEqual(offeredRoles(), ['editor', 'viewer'], 'People offers what the open site accepts')
  await press('wizard.continue')
  await press('wizard.continue')
  await press('wizard.send')
  assert.deepEqual(posts, [{ emails: ['new@acme.test'], role: 'editor', siteKeys: [SITE] }])
  assert.ok(text().includes('wizard.doneTitle'))
})

// The accepted-sites list the tab was opened with can be older than the book: every site's role
// and standing come from the `GET /api/team` answer just read, never from that list.
test('a seat lowered on another site since the tab opened does not widen the roles offered there', async () => {
  const posts = await mountTeam({
    role: 'owner',
    // What `/api/sites` said when the tab opened: Owner on both.
    sites: [
      { siteKey: SITE, role: 'owner' },
      { siteKey: OTHER, role: 'owner' }
    ],
    // What the book says now: the seat on the other site is a Viewer's, which invites nobody.
    team: () => jsonReply({ sites: [book(SITE, 'owner'), book(OTHER, 'viewer')] })
  })
  await click(inviteButton(), 'Invite')
  await typeEmail('new@acme.test')
  await click(roleRadio('viewer'), 'the Viewer role')
  await press('wizard.continue')
  assert.ok(siteCheckbox(OTHER) === undefined, 'the lowered seat is not offered at all')
  await press('wizard.continue')
  await press('wizard.send')
  assert.deepEqual(posts, [{ emails: ['new@acme.test'], role: 'viewer', siteKeys: [SITE] }])
})

test('a site whose seat the book no longer establishes is not offered, whatever the older list says', async () => {
  const cases = {
    'the seat was revoked: the book does not list the site': [],
    'the seat is pending again': [
      { siteKey: OTHER, platform: null, myRole: 'owner', status: 'pending', seats: null }
    ],
    'the site’s book could not be read': [
      { siteKey: OTHER, platform: null, myRole: 'owner', status: 'accepted', seats: null }
    ],
    'the book carries no role there': [
      { siteKey: OTHER, platform: null, myRole: null, status: 'accepted', seats: [] }
    ]
  }
  for (const [label, others] of Object.entries(cases)) {
    const posts = await mountTeam({
      role: 'owner',
      sites: [
        { siteKey: SITE, role: 'owner' },
        { siteKey: OTHER, role: 'owner' }
      ],
      team: () => jsonReply({ sites: [book(SITE, 'owner'), ...others] })
    })
    await click(inviteButton(), 'Invite')
    await typeEmail('new@acme.test')
    assert.deepEqual(offeredRoles(), ['editor', 'viewer'], label)
    await click(roleRadio('viewer'), 'the Viewer role')
    await press('wizard.continue')
    assert.ok(siteCheckbox(SITE), `${label}: this site is listed`)
    assert.ok(siteCheckbox(OTHER) === undefined, `${label}: the other site is not listed`)
    await press('wizard.continue')
    await press('wizard.send')
    assert.deepEqual(posts, [{ emails: ['new@acme.test'], role: 'viewer', siteKeys: [SITE] }], label)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
    document.body.replaceChildren()
  }
})

test('a site the older list did not have is offered once the book establishes the seat', async () => {
  const posts = await mountTeam({
    role: 'editor',
    sites: [{ siteKey: SITE, role: 'editor' }],
    // A retired role from an older server reads as its successor (ADR 0028 §8).
    team: () => jsonReply({ sites: [book(SITE, 'editor'), book(OTHER, 'developer')] })
  })
  await click(inviteButton(), 'Invite')
  await typeEmail('new@acme.test')
  assert.deepEqual(offeredRoles(), ['editor', 'viewer'])
  await press('wizard.continue')
  await click(siteCheckbox(OTHER), `the ${OTHER} row`)
  await press('wizard.continue')
  await press('wizard.send')
  assert.deepEqual(posts, [{ emails: ['new@acme.test'], role: 'editor', siteKeys: [SITE, OTHER] }])
})

test('across several sites the wizard offers only the roles every ticked site would accept', async () => {
  const sites = [
    { siteKey: SITE, myRole: 'owner' },
    // An older list may still carry a Viewer seat; it accepts no invitation at all.
    { siteKey: OTHER, myRole: 'viewer' }
  ]
  await mountWizard({ sites })
  await typeEmail('new@acme.test')
  // No open site: every site starts ticked, and one of them accepts nothing.
  assert.deepEqual(offeredRoles(), [], 'both sites ticked')
  assert.ok(isDisabled(buttonNamed('wizard.continue')), 'no role, no way on')
})

test('a site that accepts no role cannot be ticked for the role picked', async () => {
  const sites = [
    { siteKey: SITE, myRole: 'owner' },
    { siteKey: OTHER, myRole: 'viewer' }
  ]
  const { posts } = await mountWizard({ sites, preset: { emails: [], siteKeys: [SITE] } })
  await typeEmail('new@acme.test')
  assert.deepEqual(offeredRoles(), ['editor', 'viewer'], 'the owned site alone')
  await click(roleRadio('viewer'), 'the Viewer role')
  await press('wizard.continue')
  assert.ok(isDisabled(siteCheckbox(OTHER)), 'the Viewer seat is not available')
  await press('wizard.continue')
  await press('wizard.send')
  assert.deepEqual(posts, [{ emails: ['new@acme.test'], role: 'viewer', siteKeys: [SITE] }])
})

test('a wizard with nowhere to invite to, or no role to give, cannot be sent', async () => {
  const cases = {
    'a preset naming a site the viewer cannot invite on': {
      sites: [{ siteKey: SITE, myRole: 'editor' }],
      preset: { emails: ['new@acme.test'], siteKeys: [OTHER] }
    },
    'a preset with no site': {
      sites: [{ siteKey: SITE, myRole: 'owner' }],
      preset: { emails: ['new@acme.test'], siteKeys: [] }
    },
    'no site at all': { sites: [], preset: PRESET },
    'a site whose seat has no known role': { sites: [{ siteKey: SITE, myRole: 'member' }], preset: PRESET }
  }
  for (const [label, options] of Object.entries(cases)) {
    const { posts } = await mountWizard(options)
    const go = buttonNamed('wizard.continue')
    assert.ok(go, `${label}: the wizard is at People`)
    assert.ok(isDisabled(go), `${label}: Continue is disabled`)
    await lib.act(async () => go.click())
    await settle()
    assert.ok(buttonNamed('wizard.send') === undefined, `${label}: Review is never reached`)
    assert.deepEqual(posts, [], label)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
    document.body.replaceChildren()
  }
})

test('Sites does not let the wizard go on with no site ticked', async () => {
  const { posts } = await mountWizard({ sites: [{ siteKey: SITE, myRole: 'editor' }] })
  await typeEmail('new@acme.test')
  await press('wizard.continue')
  await click(siteCheckbox(SITE), `the ${SITE} row`)
  assert.ok(isDisabled(buttonNamed('wizard.continue')))
  assert.deepEqual(posts, [])
})

// ── what the door answered ────────────────────────────────────────────────────────────────────────

const refusalRows = () =>
  [...document.querySelectorAll('[data-refusal]')].map((el) => ({
    code: el.getAttribute('data-refusal'),
    said: (el.textContent ?? '').trim()
  }))

test('a refusal inside an HTTP-200 reply is drawn as a refusal with its next step, beside the sites that worked', async () => {
  const sites = [
    { siteKey: SITE, myRole: 'owner' },
    { siteKey: OTHER, myRole: 'owner' },
    { siteKey: 'third.test', myRole: 'owner' },
    { siteKey: 'fourth.test', myRole: 'owner' },
    { siteKey: 'fifth.test', myRole: 'owner' }
  ]
  let sent = 0
  const { posts } = await mountWizard({
    sites,
    preset: { emails: ['new@acme.test'], siteKeys: sites.map((s) => s.siteKey) },
    onSent: () => sent++,
    invite: () =>
      jsonReply({
        results: [
          {
            email: 'new@acme.test',
            notified: true,
            sites: [
              { siteKey: SITE, outcome: 'invited' },
              { siteKey: OTHER, outcome: 'refused', code: 'NOT_SITE_OWNER' },
              { siteKey: 'third.test', outcome: 'refused', code: 'SEAT_NOT_AUTHORIZED' },
              { siteKey: 'fourth.test', outcome: 'refused', code: 'GRANT_UNKNOWN' },
              { siteKey: 'fifth.test', outcome: 'refused', code: 'NOT_SITE_EDITOR' }
            ]
          }
        ]
      })
  })
  await sendFromRole()
  assert.equal(posts.length, 1)
  assert.equal(sent, 1, 'the tab is told to read the book again')
  assert.ok(text().includes('outcome.next.notSiteOwner'), 'NOT_SITE_OWNER comes with what to do next')
  assert.ok(text().includes('outcome.next.notAuthorized'), 'SEAT_NOT_AUTHORIZED comes with what to do next')
  assert.deepEqual(
    refusalRows().map((r) => r.code),
    ['NOT_SITE_OWNER', 'SEAT_NOT_AUTHORIZED', 'GRANT_UNKNOWN', 'NOT_SITE_EDITOR']
  )
  const said = Object.fromEntries(refusalRows().map((r) => [r.code, r.said]))
  assert.ok(said.NOT_SITE_OWNER.includes('outcome.refused'), 'named as a refusal')
  assert.ok(said.NOT_SITE_OWNER.includes('outcome.next.notSiteOwner'), 'with what to do next')
  assert.ok(said.SEAT_NOT_AUTHORIZED.includes('outcome.refused'))
  assert.ok(said.SEAT_NOT_AUTHORIZED.includes('outcome.next.notAuthorized'))
  assert.ok(said.GRANT_UNKNOWN.includes('outcome.refused'))
  // A Viewer invites nobody (ADR 0028): the row says so and names who can.
  assert.ok(said.NOT_SITE_EDITOR.includes('outcome.refused'))
  assert.ok(said.NOT_SITE_EDITOR.includes('outcome.next.notSiteEditor'), 'a viewer is told who can invite')
  for (const row of refusalRows()) {
    assert.ok(
      !/outcome\.(invited|approved|alreadyGranted)/.test(row.said),
      `${row.code} is not drawn as done`
    )
  }
  assert.equal(document.querySelectorAll('[data-outcome="invited"]').length, 1, 'the site that worked stays')
  assert.equal(document.querySelectorAll('[data-outcome="refused"]').length, 4)
})

test('a reply where every site refused shows no invitation as sent', async () => {
  await mountWizard({
    sites: [{ siteKey: SITE, myRole: 'editor' }],
    preset: PRESET,
    invite: () =>
      jsonReply({
        results: [
          {
            email: 'new@acme.test',
            notified: false,
            sites: [{ siteKey: SITE, outcome: 'refused', code: 'SEAT_NOT_AUTHORIZED' }]
          }
        ]
      })
  })
  await sendFromRole()
  assert.ok(text().includes('outcome.next.notAuthorized'), 'the refusal comes with what to do next')
  assert.deepEqual(
    refusalRows().map((r) => r.code),
    ['SEAT_NOT_AUTHORIZED']
  )
  assert.ok(!text().includes('outcome.invited'))
  assert.ok(!text().includes('outcome.notMailed'), 'a refusal is not a mail that failed')
})

test('a seat that was recorded but not mailed says so, and a seat already held says that', async () => {
  const sites = [
    { siteKey: SITE, myRole: 'editor' },
    { siteKey: OTHER, myRole: 'editor' }
  ]
  await mountWizard({
    sites,
    preset: { emails: ['new@acme.test'], siteKeys: [SITE, OTHER] },
    invite: () =>
      jsonReply({
        results: [
          {
            email: 'new@acme.test',
            notified: false,
            sites: [
              { siteKey: SITE, outcome: 'invited' },
              { siteKey: OTHER, outcome: 'already_granted' }
            ]
          }
        ]
      })
  })
  await sendFromRole()
  assert.ok(text().includes('outcome.notMailed'))
  assert.ok(text().includes('outcome.alreadyGranted'))
  assert.ok(!text().includes('outcome.invited'), 'no delivery is claimed')
})

test('a refusal of the whole request is printed with its next step and nothing is drawn as sent', async () => {
  const cases = {
    NOT_SITE_OWNER: {
      reply: () => jsonReply({ code: 'NOT_SITE_OWNER' }, 403),
      says: 'outcome.next.notSiteOwner'
    },
    SEAT_NOT_AUTHORIZED: {
      reply: () => jsonReply({ code: 'SEAT_NOT_AUTHORIZED' }, 403),
      says: 'outcome.next.notAuthorized'
    },
    RATE_LIMITED: { reply: () => jsonReply({ code: 'RATE_LIMITED' }, 429), says: 'error.rateLimited' },
    'a 429 with no body': { reply: () => new Response('', { status: 429 }), says: 'error.rateLimited' },
    'signed out': { reply: () => jsonReply({ code: 'UNAUTHENTICATED' }, 401), says: 'state.signedOut' },
    INVALID_REQUEST: { reply: () => jsonReply({ code: 'INVALID_REQUEST' }, 400), says: 'wizard.failed' }
  }
  for (const [label, { reply, says }] of Object.entries(cases)) {
    let sent = 0
    const { posts } = await mountWizard({
      sites: [{ siteKey: SITE, myRole: 'owner' }],
      preset: PRESET,
      onSent: () => sent++,
      invite: reply
    })
    await sendFromRole()
    assert.equal(posts.length, 1, label)
    assert.ok(text().includes(says), `${label}: the wizard says ${says}`)
    const alert = document.querySelector('[data-invite-failure]')
    assert.ok(alert, `${label}: a failure is shown`)
    assert.ok(
      (alert.textContent ?? '').includes(says),
      `${label}: it says ${says}, got "${alert.textContent}"`
    )
    assert.ok(buttonNamed('wizard.send'), `${label}: the wizard stays at Review`)
    assert.ok(document.querySelector('[data-outcome]') === null, `${label}: no outcome row`)
    assert.ok(!text().includes('wizard.done'), label)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
    document.body.replaceChildren()
  }
})

test('an answer that never came, or cannot be read, is reported as unknown: not as sent, not as "nothing changed"', async () => {
  const whole = (over = {}) => ({
    email: 'new@acme.test',
    notified: true,
    sites: [{ siteKey: SITE, outcome: 'invited' }],
    ...over
  })
  const cases = {
    'the request was dropped': () => {
      throw new TypeError('network down')
    },
    'a 500': () => jsonReply({ code: 'INTERNAL' }, 500),
    'a 502 that is not JSON': () => new Response('<html>bad gateway</html>', { status: 502 }),
    'a 200 with an empty body': () => new Response('', { status: 200 }),
    'a 200 that is not JSON': () => new Response('<html>ok</html>', { status: 200 }),
    'a 200 that is null': () => jsonReply(null),
    'a 200 that is a list': () => jsonReply([whole()]),
    'a 200 with no results': () => jsonReply({}),
    'results that are not a list': () => jsonReply({ results: 'ok' }),
    'an empty results list': () => jsonReply({ results: [] }),
    'a null result': () => jsonReply({ results: [null] }),
    'a result for another address': () => jsonReply({ results: [whole({ email: 'else@acme.test' })] }),
    'a result with no sites': () => jsonReply({ results: [whole({ sites: undefined })] }),
    'a result with an empty site list': () => jsonReply({ results: [whole({ sites: [] })] }),
    'a result for another site': () =>
      jsonReply({ results: [whole({ sites: [{ siteKey: OTHER, outcome: 'invited' }] })] }),
    'a site row that is null': () => jsonReply({ results: [whole({ sites: [null] })] }),
    'an outcome the wizard does not know': () =>
      jsonReply({ results: [whole({ sites: [{ siteKey: SITE, outcome: 'queued' }] })] }),
    'no outcome': () => jsonReply({ results: [whole({ sites: [{ siteKey: SITE }] })] }),
    'notified that is not a boolean': () => jsonReply({ results: [whole({ notified: 'yes' })] }),
    // An outcome and a code that contradict each other, or a refusal with no reason the door names.
    ...Object.fromEntries(
      ['invited', 'approved', 'already_granted'].flatMap((outcome) =>
        ['NOT_SITE_OWNER', 'SEAT_NOT_AUTHORIZED', 'GRANT_UNKNOWN', '', null, 403].map((code) => [
          `"${outcome}" that also carries the code ${JSON.stringify(code)}`,
          () => jsonReply({ results: [whole({ sites: [{ siteKey: SITE, outcome, code }] })] })
        ])
      )
    ),
    ...Object.fromEntries(
      [undefined, null, '', 'not_site_owner', 'INVALID_REQUEST', 403, ['NOT_SITE_OWNER']].map((code) => [
        `"refused" with the code ${JSON.stringify(code) ?? 'left out'}`,
        () =>
          jsonReply({
            results: [whole({ notified: false, sites: [{ siteKey: SITE, outcome: 'refused', code }] })]
          })
      ])
    ),
    'a mail said to be sent for a refusal': () =>
      jsonReply({
        results: [whole({ sites: [{ siteKey: SITE, outcome: 'refused', code: 'NOT_SITE_OWNER' }] })]
      }),
    'a mail said to be sent for a seat already held': () =>
      jsonReply({ results: [whole({ sites: [{ siteKey: SITE, outcome: 'already_granted' }] })] }),
    'the same address twice': () => jsonReply({ results: [whole(), whole()] })
  }
  for (const [label, reply] of Object.entries(cases)) {
    let sent = 0
    const { posts } = await mountWizard({
      sites: [{ siteKey: SITE, myRole: 'editor' }],
      preset: PRESET,
      onSent: () => sent++,
      invite: reply
    })
    await sendFromRole()
    assert.equal(posts.length, 1, label)
    assert.ok(!text().includes('wizard.failed'), `${label}: it does not claim nothing was changed`)
    assert.ok(!text().includes('wizard.done'), `${label}: the wizard does not reach its last step`)
    const alert = document.querySelector('[data-invite-failure]')
    assert.ok(alert, `${label}: a failure is shown`)
    assert.equal(alert.getAttribute('data-invite-failure'), 'unknown', label)
    assert.ok((alert.textContent ?? '').includes('wizard.unknown'), `${label}: got "${alert.textContent}"`)
    assert.ok(document.querySelector('[data-outcome]') === null, `${label}: no outcome row`)
    assert.ok(
      !/outcome\.(invited|approved|alreadyGranted|refused)/.test(text()),
      `${label}: no invitation is drawn as sent, or as refused with nothing to do next`
    )
    assert.ok(!text().includes('wizard.done'), `${label}: the wizard does not reach its last step`)
    assert.equal(sent, 1, `${label}: the tab reads the book again, since something may have been written`)
    for (const { root, host } of mounted.splice(0)) {
      await lib.act(async () => root.unmount())
      host.remove()
    }
    document.body.replaceChildren()
  }
})

// ── one send at a time, and no answer drawn in a wizard that is gone ──────────────────────────────

test('pressing Send again while the invitation is on its way sends nothing more', async () => {
  const gate = deferred()
  const { posts } = await mountWizard({
    sites: [{ siteKey: SITE, myRole: 'editor' }],
    preset: PRESET,
    invite: () => gate.promise
  })
  await press('wizard.continue')
  const send = buttonNamed('wizard.send')
  await lib.act(async () => {
    send.click()
    send.click()
    send.click()
  })
  await settle()
  await lib.act(async () => (buttonNamed('wizard.sending') ?? send).click())
  await settle()
  assert.equal(posts.length, 1)
  gate.resolve(
    jsonReply({
      results: [{ email: 'new@acme.test', notified: true, sites: [{ siteKey: SITE, outcome: 'invited' }] }]
    })
  )
  await settle()
  assert.ok(text().includes('wizard.doneTitle'), 'the one answer is drawn once')
  assert.equal(posts.length, 1)
})

test('an answer that lands after the wizard was closed is not drawn in the next one', async () => {
  const gate = deferred()
  let sent = 0
  const errors = []
  const consoleError = console.error
  console.error = (...args) => errors.push(args.map(String).join(' '))
  try {
    const { posts, entry } = await mountWizard({
      sites: [{ siteKey: SITE, myRole: 'editor' }],
      preset: PRESET,
      onSent: () => sent++,
      invite: () => gate.promise
    })
    await sendFromRole()
    assert.equal(posts.length, 1)
    // The tab closes the wizard and opens another (a new key is a new instance).
    await lib.act(async () =>
      entry.root.render(
        lib.createElement(lib.InviteWizard, {
          key: 'second',
          open: true,
          onOpenChange: () => {},
          sites: [{ siteKey: SITE, platform: null, myRole: 'editor' }],
          onSent: () => sent++,
          t
        })
      )
    )
    await settle()
    gate.resolve(
      jsonReply({
        results: [{ email: 'new@acme.test', notified: true, sites: [{ siteKey: SITE, outcome: 'invited' }] }]
      })
    )
    await settle()
    assert.ok(document.getElementById('tracy-mysites-invite-emails'), 'the new wizard is still at Who')
    assert.ok(document.querySelector('[data-outcome]') === null, 'and shows no outcome of the old send')
    assert.equal(sent, 1, 'the tab still hears that the book changed')
    assert.deepEqual(errors, [], 'nothing was written to a wizard that is gone')
  } finally {
    console.error = consoleError
  }
})

// ── tracy:team-changed for every site the send wrote ──────────────────────────────────────────────

/** Every `tracy:team-changed` the page hears while `run` runs: the site keys, in order. */
async function heardDuring(run) {
  const heard = []
  const listen = (event) => heard.push(event.detail.siteKey)
  window.addEventListener('tracy:team-changed', listen)
  try {
    await run()
  } finally {
    window.removeEventListener('tracy:team-changed', listen)
  }
  return heard
}

const unmountAll = async () => {
  for (const { root, host } of mounted.splice(0)) {
    await lib.act(async () => root.unmount())
    host.remove()
  }
  document.body.replaceChildren()
}

test('a send to several sites tells the page every site it wrote, once each, and none it was refused', async () => {
  const sites = [
    { siteKey: SITE, myRole: 'owner' },
    { siteKey: OTHER, myRole: 'owner' },
    { siteKey: 'third.test', myRole: 'owner' },
    { siteKey: 'fourth.test', myRole: 'owner' }
  ]
  const heard = await heardDuring(async () => {
    await mountWizard({
      sites,
      preset: { emails: ['a@acme.test', 'b@acme.test'], siteKeys: sites.map((s) => s.siteKey) },
      invite: () =>
        jsonReply({
          results: [
            {
              email: 'a@acme.test',
              notified: true,
              sites: [
                { siteKey: SITE, outcome: 'invited' },
                { siteKey: OTHER, outcome: 'refused', code: 'NOT_SITE_OWNER' },
                { siteKey: 'third.test', outcome: 'approved' },
                { siteKey: 'fourth.test', outcome: 'already_granted' }
              ]
            },
            {
              email: 'b@acme.test',
              notified: true,
              sites: [
                { siteKey: SITE, outcome: 'invited' },
                { siteKey: OTHER, outcome: 'refused', code: 'NOT_SITE_OWNER' },
                { siteKey: 'third.test', outcome: 'invited' },
                { siteKey: 'fourth.test', outcome: 'already_granted' }
              ]
            }
          ]
        })
    })
    await sendFromRole()
  })
  assert.deepEqual(heard, [SITE, 'third.test'])
})

test('a refusal of the whole request tells the page nothing; an unknown answer names every site sent', async () => {
  const sites = [
    { siteKey: SITE, myRole: 'owner' },
    { siteKey: OTHER, myRole: 'owner' }
  ]
  const preset = { emails: ['new@acme.test'], siteKeys: [SITE, OTHER] }
  const refused = await heardDuring(async () => {
    await mountWizard({ sites, preset, invite: () => jsonReply({ code: 'NOT_SITE_OWNER' }, 403) })
    await sendFromRole()
  })
  assert.deepEqual(refused, [])
  await unmountAll()
  const unknown = await heardDuring(async () => {
    await mountWizard({ sites, preset, invite: () => jsonReply({ code: 'INTERNAL' }, 500) })
    await sendFromRole()
  })
  assert.deepEqual(unknown, [SITE, OTHER], 'the seat book may have written either')
})

test('an invitation sent from the Team tab is told once for its site, not twice', async () => {
  const heard = await heardDuring(async () => {
    await mountTeam({
      role: 'owner',
      inviteOnOpen: true,
      invite: () =>
        jsonReply({
          results: [
            { email: 'new@acme.test', notified: true, sites: [{ siteKey: SITE, outcome: 'invited' }] }
          ]
        })
    })
    await typeEmail('new@acme.test')
    await press('wizard.continue')
    await press('wizard.continue')
    await press('wizard.send')
  })
  assert.deepEqual(heard, [SITE])
})

// ── layout D3 and Approve V3 (Akemi 04/10/2026) ──────────────────────────────────────────────────

test('D3: the open site is listed first, ticked alone and marked "This site"; the dialog is the 560px one', async () => {
  const { posts } = await mountWizard({
    sites: [
      { siteKey: OTHER, myRole: 'owner' },
      { siteKey: SITE, myRole: 'owner' }
    ],
    preset: { emails: [], siteKeys: [SITE] }
  })
  assert.ok(dialog()?.classList.contains('tv-team-dialog'), 'the popup carries the scoped class')
  assert.ok(text().includes('wizard.stepOf{"n":1,"name":"wizard.step.people"}'))
  await typeEmail('new@acme.test')
  await press('wizard.continue')
  assert.ok(text().includes('wizard.stepOf{"n":2,"name":"wizard.step.sites"}'))
  const rows = [...document.querySelectorAll('.tv-team-sites > li')]
  assert.equal(rows.length, 2)
  assert.ok((rows[0].textContent ?? '').includes(SITE), 'the open site comes first')
  assert.ok((rows[0].textContent ?? '').includes('wizard.thisSite'))
  assert.ok(!(rows[1].textContent ?? '').includes('wizard.thisSite'))
  assert.ok(isChecked(siteCheckbox(SITE)) && !isChecked(siteCheckbox(OTHER)), 'only the open site is ticked')
  assert.ok(text().includes('wizard.selectedOne'))
  await click(siteCheckbox(OTHER), `the ${OTHER} row`)
  assert.ok(text().includes('wizard.selectedMany{"count":2}'))
  await press('wizard.continue')
  assert.ok(text().includes('wizard.reviewSummaryMany{"count":2}'))
  assert.deepEqual(posts, [])
})

test('D3: Done says it once for one address, and Invite more starts People again with the same role', async () => {
  const { posts } = await mountWizard({
    sites: [{ siteKey: SITE, myRole: 'owner' }],
    preset: { emails: [], siteKeys: [SITE] },
    invite: (body) =>
      jsonReply({
        results: body.emails.map((email) => ({
          email,
          notified: true,
          sites: body.siteKeys.map((siteKey) => ({ siteKey, outcome: 'invited' }))
        }))
      })
  })
  await typeEmail('new@acme.test')
  await click(roleRadio('viewer'), 'the Viewer role')
  await press('wizard.continue')
  await press('wizard.continue')
  assert.ok(text().includes('wizard.reviewSummaryOne'))
  await press('wizard.send')
  assert.ok(text().includes('wizard.doneTitle'))
  assert.ok(text().includes('wizard.doneBody{"email":"new@acme.test","site":"acme.test"}'))
  await press('wizard.inviteMore')
  assert.ok(document.getElementById('tracy-mysites-invite-emails'), 'back at People')
  assert.ok(!text().includes('new@acme.test'), 'the list of people is fresh')
  assert.ok(isChecked(roleRadio('viewer')), 'the role is kept')
  assert.equal(posts.length, 1)
})

/** One join request as the roster hands it to Approve. */
const request = {
  id: 'acc-req',
  email: 'myp@example.com',
  displayName: null,
  avatarUrl: null,
  role: 'editor',
  status: 'invited',
  grantedAt: null,
  grantedBy: null,
  grantedByEmail: null,
  revokedAt: null,
  requestedAt: new Date(Date.now() - 53 * 60000).toISOString(),
  scope: 'site'
}

test('V3: Approve shows who asked and when, the approved sentence, and folds what the role can do', async () => {
  const picked = []
  await mount(
    lib.createElement(lib.ApproveDialog, {
      seat: request,
      siteName: SITE,
      viewerRole: 'owner',
      busy: false,
      onOpenChange: () => {},
      onSubmit: (role) => picked.push(role),
      t
    })
  )
  await settle()
  assert.ok(dialog()?.classList.contains('tv-team-dialog'))
  const person = document.querySelector('.tv-team-person')
  assert.ok(person, 'the requester row is drawn')
  assert.ok((person.textContent ?? '').includes('myp'), 'the short name')
  assert.ok((person.textContent ?? '').includes('myp@example.com'), 'the address')
  assert.ok((person.textContent ?? '').includes('access.asked{"ago":"ago.minutes{\\"count\\":53}"}'))
  assert.ok(text().includes(`dialog.approveBody{"email":"${request.email}","site":"${SITE}"}`))
  assert.deepEqual(offeredRoles(), ['editor', 'viewer'])
  assert.ok(!text().includes('permission.changeSite'), 'the permission list starts folded')
  await press('dialog.approve.seeRole')
  assert.ok(text().includes('permission.changeSite'))
  assert.ok(text().includes('dialog.approve.hideRole{"role":"role.editor"}'))
  await click(roleRadio('viewer'), 'the Viewer role')
  assert.ok(text().includes('dialog.approve.hideRole{"role":"role.viewer"}'), 'it stays open across roles')
  await press('action.approve')
  assert.deepEqual(picked, ['viewer'])
})

test('D3: role rows read Editor first, then Viewer, and the Sites rows from the Team tab carry the book’s CMS logo', async () => {
  await mountTeam({ role: 'owner', inviteOnOpen: true })
  const order = [...document.querySelectorAll('[id^="tracy-mysites-role-"]')]
    .map((el) => el.id.replace('tracy-mysites-role-', ''))
    .filter((id) => !id.endsWith('-label'))
  assert.deepEqual(order, ['editor', 'viewer'])
  // Admin and Developer are gone; each row draws its translated name, never a code.
  assert.ok(!text().includes('role.admin') && !text().includes('role.developer'))
  await typeEmail('new@acme.test')
  await press('wizard.continue')
  const logo = document.querySelector('.tv-team-sites svg.tv-team-cms')
  assert.ok(logo !== null, 'a WordPress site in the book shows the WordPress logo')
})

// ── Spam hints D2 (Akemi 05/10): the Done step hands the inviter the invite link ─────────────────

const LINK = 'https://tracy.test/invite/abc.def'

/** Sends one invitation whose answer carries `extra` on the result, and lands on Done. */
async function sendWith(extra) {
  await mountWizard({
    sites: [{ siteKey: SITE, myRole: 'owner' }],
    preset: { emails: [], siteKeys: [SITE] },
    invite: (body) =>
      jsonReply({
        results: body.emails.map((email) => ({
          email,
          sites: body.siteKeys.map((siteKey) => ({ siteKey, outcome: 'invited' })),
          notified: true,
          ...extra
        }))
      })
  })
  await typeEmail('new@acme.test')
  await press('wizard.continue')
  await press('wizard.continue')
  await press('wizard.send')
}

/** A clipboard the test holds: records what was written, or refuses. */
function stubClipboard(refuse = false) {
  const written = []
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value) => {
        if (refuse) throw new Error('denied')
        written.push(value)
      }
    }
  })
  return written
}

test('D2: Done shows the invite link row and the email row, and copying the link says so', async () => {
  const written = stubClipboard()
  await sendWith({ inviteUrl: LINK })
  assert.ok(text().includes('wizard.linkTitle'))
  assert.ok(text().includes('wizard.linkHelp{"email":"new@acme.test"}'))
  assert.ok(text().includes('wizard.emailSentTitle'))
  assert.ok(text().includes('wizard.emailSentHelp'))
  await press('wizard.copyLink')
  assert.deepEqual(written, [LINK])
  assert.ok(text().includes('wizard.linkCopied'))
})

test('D2: the Copy button holds the width of its longer label, so the row does not reflow', async () => {
  stubClipboard()
  await sendWith({ inviteUrl: LINK })
  const button = buttonNamed('wizard.copyLink')
  assert.ok(button, 'the Copy button is drawn')
  /** Both labels sit in the button; the one not shown is hidden from sight and from readers. */
  const labels = () =>
    [...button.querySelectorAll('.tv-team-copy-label')].map((el) => ({
      text: el.textContent,
      hidden: el.getAttribute('aria-hidden') === 'true'
    }))
  assert.deepEqual(labels(), [
    { text: 'wizard.copyLink', hidden: false },
    { text: 'wizard.linkCopied', hidden: true }
  ])
  await press('wizard.copyLink')
  assert.deepEqual(labels(), [
    { text: 'wizard.copyLink', hidden: true },
    { text: 'wizard.linkCopied', hidden: false }
  ])
})

test('D2: a mail that did not go still leaves the link, and claims no email was sent', async () => {
  stubClipboard()
  await sendWith({ inviteUrl: LINK, notified: false })
  assert.ok(text().includes('wizard.linkTitle'))
  assert.ok(!text().includes('wizard.emailSentTitle'))
})

test('D2: no link row without a link, and a link that is not an address is dropped', async () => {
  await sendWith({})
  assert.ok(!text().includes('wizard.linkTitle'))
  assert.ok(text().includes('wizard.doneTitle'), 'the answer is still drawn')
})

test('D2: a link that is not an http(s) address is dropped, the answer stays whole', async () => {
  await sendWith({ inviteUrl: 'javascript:alert(1)' })
  assert.ok(!text().includes('wizard.linkTitle'))
  assert.ok(text().includes('wizard.doneTitle'))
})

test('D2: a clipboard that refuses shows the link to copy by hand', async () => {
  stubClipboard(true)
  await sendWith({ inviteUrl: LINK })
  await press('wizard.copyLink')
  assert.ok(text().includes('wizard.copyFailed'))
  const field = document.querySelector('input[readonly]')
  assert.equal(field?.value, LINK)
})
