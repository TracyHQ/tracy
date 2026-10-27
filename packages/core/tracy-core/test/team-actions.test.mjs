/**
 * The Team tab's presses, mounted (#792): one control, one action.
 *
 * Revoke access, Cancel invitation and Decline request were three labels over one bodyless DELETE.
 * These tests press the real `TeamView` (`src/site-tabs/TeamView.tsx`) with its real `Roster` and
 * `RevokeDialog`: each row's destructive press opens a confirm step that names ONE act, and
 * confirming sends one DELETE whose body names that same act. A press made twice sends one request,
 * a refusal is said and nothing is retried, and an answer that arrives after the tab closed is
 * dropped.
 *
 * The component is bundled by esbuild in memory (nothing is written to disk) and mounted with React into jsdom (resolved from a workspace
 * member that declares it, as `popover-escape.test.mjs` does); `fetch` is a fixture and `t` echoes
 * the key it is given, so what is asserted is WHICH string is shown, not its wording (the wording
 * and its translations are the `interface-languages` gate's). No seat book, no browser layout.
 *
 *   node --test packages/core/tracy-core/test/team-actions.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
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

const SITE = 'one.example'
const ME = 'lee@example.com'
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const deferred = () => {
  let resolve = () => {}
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
/** `t` as a test reads it: the key, and the variables it was given. */
const t = (key, vars) => (vars ? `${key}${JSON.stringify(vars)}` : key)

const seat = (id, over = {}) => ({
  id,
  email: `${id}@example.com`,
  displayName: null,
  role: 'editor',
  status: 'active',
  grantedAt: '2026-09-01T00:00:00Z',
  grantedBy: 'acct-lee',
  grantedByEmail: ME,
  revokedAt: null,
  removalKind: null,
  requestedAt: null,
  scope: 'site',
  ...over
})
const OWNER = seat('lee', { role: 'owner' })
const ACTIVE = seat('ana')
const INVITED = seat('ivo', { status: 'invited' })
const ASKED = seat('ask', { status: 'invited', requestedAt: '2026-09-04T00:00:00Z' })
/** The three rows a removal can be pressed on, with the one act each press is. */
const REMOVALS = [
  [ACTIVE, 'revoke', 'action.revoke', 'dialog.revokeConsequence'],
  [INVITED, 'cancel_invite', 'action.cancelInvite', 'dialog.cancelInviteConsequence'],
  [ASKED, 'decline_request', 'action.declineRequest', 'dialog.declineRequestConsequence']
]

/** @type {any} */
let lib
/** @type {any} */
let dom
const mounted = []

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://tracy.test/'
  })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'KeyboardEvent',
    'MouseEvent',
    'Event',
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
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const name of ['ResizeObserver', 'IntersectionObserver']) {
    window[name] ??= Observer
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true })
  }
  // The dialog schedules its open/close on animation frames; without one it throws mid-commit.
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    value: (fn) => setTimeout(() => fn(Date.now()), 0),
    configurable: true,
    writable: true
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    value: (id) => clearTimeout(id),
    configurable: true,
    writable: true
  })
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  window.HTMLElement.prototype.scrollIntoView ??= () => {}
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { TeamView } from './TeamView'
      `,
      resolveDir: path.join(here, '..', 'src', 'site-tabs'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    // React stays outside the bundle and is loaded by Node itself: bundled, its `act` cannot find
    // `module.require` and falls back to a MessageChannel that keeps the test process alive.
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

after(() => {
  dom?.window.close()
})

afterEach(async () => {
  for (const ui of mounted.splice(0)) await ui.unmount()
  document.body.replaceChildren()
})

/**
 * Mount the tab over a book. `write(call)` answers a PATCH or DELETE: a `[status, body]` pair, a
 * Response, or a promise of either (a rejection is a dropped connection).
 */
async function mount({ seats, myRole = 'owner', write = () => [200, { revoked: true }] }) {
  const calls = []
  const book = { seats }
  globalThis.fetch = window.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://tracy.test')
    const method = (init.method ?? 'GET').toUpperCase()
    const call = { method, path: url.pathname, body: init.body ?? null, headers: init.headers ?? {} }
    calls.push(call)
    if (url.pathname === '/auth/me') return json(200, { email: ME })
    if (url.pathname === '/api/team' && method === 'GET')
      return json(200, {
        sites: [{ siteKey: SITE, platform: 'wordpress', myRole, status: 'accepted', seats: book.seats }]
      })
    const got = await write(call)
    return got instanceof Response ? got : json(got[0], got[1])
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => {
    root.render(
      lib.createElement(lib.TeamView, {
        siteKey: SITE,
        role: myRole,
        sites: [{ siteKey: SITE, role: myRole }],
        onPick: () => {},
        t
      })
    )
  })
  const settle = () => lib.act(async () => tick(5))
  await settle()
  await settle()
  let live = true
  const ui = {
    calls,
    book,
    settle,
    writes: () => calls.filter((c) => c.method !== 'GET'),
    reads: () => calls.filter((c) => c.method === 'GET' && c.path === '/api/team').length,
    row: (s) => [...host.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(s.email)),
    rowButton: (s, label) => ui.row(s)?.querySelector(`button[aria-label="${label}"]`) ?? null,
    dialog: () => document.querySelector('[role="dialog"]'),
    // The confirm button names its act in `data-removal-kind`; before #792 it carried no kind and
    // is found as the dialog's button that says one of the three acts.
    confirm: () =>
      document.querySelector('[role="dialog"] button[data-removal-kind]') ??
      [...(document.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])].find((b) =>
        REMOVALS.some(([, , label]) => b.textContent === label)
      ) ??
      null,
    alert: () => host.querySelector('[role="alert"]')?.textContent ?? null,
    /** Click `target()` `times` times inside one tick, before React can redraw it. */
    press: async (target, times = 1) => {
      await lib.act(async () => {
        for (let i = 0; i < times; i += 1) {
          const el = typeof target === 'function' ? target() : target
          el?.click()
        }
        await tick(5)
      })
      await settle()
    },
    unmount: async () => {
      if (!live) return
      live = false
      await lib.act(async () => root.unmount())
      host.remove()
    }
  }
  mounted.push(ui)
  return ui
}

const grantPath = (s) => `/api/sites/${SITE}/seats/${s.id}`

// ── Three presses, three acts ────────────────────────────────────────────────────────────────────

for (const [target, kind, labelKey, consequenceKey] of REMOVALS) {
  test(`${labelKey}: the confirm step names that act and the write sends {kind: ${kind}}`, async () => {
    const ui = await mount({ seats: [OWNER, ACTIVE, INVITED, ASKED] })
    // The row offers this act and neither of the other two.
    for (const [, , other] of REMOVALS)
      assert.equal(ui.rowButton(target, other) !== null, other === labelKey, `${other} on ${target.id}`)

    await ui.press(ui.rowButton(target, labelKey))
    assert.equal(ui.writes().length, 0, 'the first press only asks')
    const dialog = ui.dialog()
    assert.ok(dialog, 'the confirm step is open')
    assert.ok(dialog.textContent.includes(labelKey))
    assert.ok(dialog.textContent.includes(`${consequenceKey}{"name":"${target.email}"}`))
    for (const [, , other, otherConsequence] of REMOVALS) {
      if (other === labelKey) continue
      assert.equal(dialog.textContent.includes(other), false, `the dialog also says ${other}`)
      assert.equal(dialog.textContent.includes(otherConsequence), false)
    }
    assert.equal(ui.confirm().textContent, labelKey)

    await ui.press(ui.confirm)
    assert.deepEqual(
      ui.writes().map((c) => [c.method, c.path, c.body && JSON.parse(c.body)]),
      [['DELETE', grantPath(target), { kind }]]
    )
    assert.equal(ui.dialog(), null, 'the confirm step closed')
    assert.equal(ui.alert(), null)
  })
}

test('a write the seat book accepted tells the page this site changed; a refused one does not', async () => {
  const heard = []
  const listen = (event) => heard.push(event.detail)
  window.addEventListener('tracy:team-changed', listen)
  try {
    const [target, , labelKey] = REMOVALS[0]
    const ok = await mount({ seats: [OWNER, ACTIVE, INVITED, ASKED] })
    await ok.press(ok.rowButton(target, labelKey))
    await ok.press(ok.confirm)
    assert.deepEqual(heard, [{ siteKey: SITE }])
    await ok.unmount()

    const refused = await mount({
      seats: [OWNER, ACTIVE, INVITED, ASKED],
      write: () => [403, { code: 'NOT_SITE_OWNER' }]
    })
    await refused.press(refused.rowButton(target, labelKey))
    await refused.press(refused.confirm)
    assert.deepEqual(heard, [{ siteKey: SITE }], 'nothing more for a refusal')
  } finally {
    window.removeEventListener('tracy:team-changed', listen)
  }
})

test('a confirm pressed twice in one tick is one request', async () => {
  for (const [target, kind, labelKey] of REMOVALS) {
    const answer = deferred()
    const ui = await mount({ seats: [OWNER, ACTIVE, INVITED, ASKED], write: () => answer.promise })
    await ui.press(ui.rowButton(target, labelKey))
    await ui.press(ui.confirm, 3)
    assert.equal(ui.writes().length, 1, `${kind}: one press, one DELETE`)
    // While it is in flight every row's actions are off: a second act cannot start under it.
    for (const [other, , otherLabel] of REMOVALS) assert.equal(ui.rowButton(other, otherLabel).disabled, true)
    answer.resolve([200, { revoked: true, kind }])
    await ui.settle()
    assert.equal(ui.rowButton(target, labelKey).disabled, false)
    await ui.unmount()
  }
})

test('a refusal is said in its own words, the list is read again, and nothing is sent twice', async () => {
  const cases = [
    [[409, { code: 'SEAT_STATE_CHANGED', kind: 'revoke' }], 'error.changed'],
    [[404, { code: 'GRANT_UNKNOWN' }], 'error.gone'],
    [[403, { code: 'CANNOT_REVOKE_SELF' }], 'error.self'],
    [[403, { code: 'CANNOT_REVOKE_LAST_OWNER' }], 'error.lastOwner'],
    [[403, { code: 'NOT_SITE_OWNER' }], 'error.notSiteOwner'],
    [[429, { code: 'RATE_LIMITED' }], 'error.rateLimited'],
    [[400, { code: 'INVALID_REQUEST' }], 'error.failed'],
    [[500, 'Internal Server Error'], 'error.failed'],
    // A failed answer that is not what the door promises: no body, not JSON, null, a code that is
    // not text. One sentence, never a thrown error or a printed object.
    [new Response('', { status: 502 }), 'error.failed'],
    [new Response('<html>bad gateway</html>', { status: 502 }), 'error.failed'],
    [[500, 'null'], 'error.failed'],
    [[403, { code: { is: 'CANNOT_REVOKE_SELF' } }], 'error.failed'],
    [[403, { code: ['NOT_SITE_OWNER'] }], 'error.failed'],
    [[409, { code: 409 }], 'error.failed']
  ]
  for (const [answer, said] of cases) {
    const ui = await mount({ seats: [OWNER, ACTIVE, INVITED], write: () => answer })
    const reads = ui.reads()
    await ui.press(ui.rowButton(INVITED, 'action.cancelInvite'))
    await ui.press(ui.confirm)
    assert.equal(ui.alert(), said, JSON.stringify(answer))
    assert.equal(ui.writes().length, 1, 'a refused press is not pressed again for the person')
    assert.equal(ui.reads(), reads + 1, 'the book is read again after a refusal')
    assert.equal(ui.rowButton(INVITED, 'action.cancelInvite').disabled, false, 'busy is cleared')
    await ui.unmount()
  }
})

test('a dropped connection is said, clears busy, and is not retried', async () => {
  const ui = await mount({
    seats: [OWNER, ACTIVE],
    write: () => Promise.reject(new TypeError('Failed to fetch'))
  })
  await ui.press(ui.rowButton(ACTIVE, 'action.revoke'))
  await ui.press(ui.confirm)
  assert.equal(ui.alert(), 'error.failed')
  assert.equal(ui.writes().length, 1)
  assert.equal(ui.rowButton(ACTIVE, 'action.revoke').disabled, false)
})

test('an answer that arrives after the tab closed changes nothing and starts no further read', async () => {
  const answer = deferred()
  const ui = await mount({ seats: [OWNER, ACTIVE], write: () => answer.promise })
  await ui.press(ui.rowButton(ACTIVE, 'action.revoke'))
  await ui.press(ui.confirm)
  assert.equal(ui.writes().length, 1)
  await ui.unmount()
  const calls = ui.calls.length
  answer.resolve([409, { code: 'SEAT_STATE_CHANGED', kind: 'revoke' }])
  await tick(20)
  assert.equal(ui.calls.length, calls, 'nothing is asked on behalf of a tab that is gone')
})

test('leaving the confirm step sends nothing; opening it on another row asks about that row', async () => {
  const ui = await mount({ seats: [OWNER, ACTIVE, INVITED] })
  await ui.press(ui.rowButton(ACTIVE, 'action.revoke'))
  const cancel = [...ui.dialog().querySelectorAll('button')].find((b) => b.textContent === 'action.cancel')
  await ui.press(cancel)
  assert.equal(ui.dialog(), null)
  assert.equal(ui.writes().length, 0)
  await ui.press(ui.rowButton(INVITED, 'action.cancelInvite'))
  assert.ok(ui.dialog().textContent.includes('dialog.cancelInviteConsequence'))
  await ui.press(ui.confirm)
  assert.deepEqual(
    ui.writes().map((c) => [c.path, JSON.parse(c.body)]),
    [[grantPath(INVITED), { kind: 'cancel_invite' }]]
  )
})

// ── The role change is its own press ─────────────────────────────────────────────────────────────

test('Change role sends one PATCH with the role, and never a removal', async () => {
  const ui = await mount({ seats: [OWNER, ACTIVE], write: () => [200, { id: ACTIVE.id, role: 'viewer' }] })
  await ui.press(ui.rowButton(ACTIVE, 'action.changeRole'))
  const dialog = ui.dialog()
  assert.ok(dialog.textContent.includes('dialog.changeRoleBody'))
  const submit = () =>
    [...ui.dialog().querySelectorAll('button')].find((b) => b.textContent === 'action.changeRole')
  // Seeded to the role the seat holds: an unchanged role cannot be submitted.
  assert.equal(submit().disabled, true)
  // The same icon rows as the wizard, Editor / Viewer / Owner, under the dialog's own scope.
  assert.ok(ui.dialog().classList.contains('tv-team-dialog'))
  assert.deepEqual(
    [...ui.dialog().querySelectorAll('.tv-team-row-title')].map((el) => el.textContent),
    ['role.editor', 'role.viewer', 'role.owner']
  )
  await ui.press(ui.dialog().querySelector('#tracy-mysites-role-viewer'))
  assert.equal(submit().disabled, false)
  // The legend opens on what a Viewer CAN do, so it never reads as "a Viewer can do nothing".
  const legend = [...ui.dialog().querySelectorAll('li')].map((li) => li.textContent)
  assert.deepEqual(legend.slice(0, 3), [
    '✓permission.view',
    '✓permission.commentAsk',
    '×permission.changeSite'
  ])
  await ui.press(submit, 2)
  assert.deepEqual(
    ui.writes().map((c) => [c.method, c.path, JSON.parse(c.body)]),
    [['PATCH', grantPath(ACTIVE), { role: 'viewer' }]]
  )
})

// ── What is offered, and how a closed row reads ──────────────────────────────────────────────────

test('nothing the seat book would refuse is offered: a reader, your own row, the last owner', async () => {
  const labels = ['action.revoke', 'action.cancelInvite', 'action.declineRequest', 'action.changeRole']
  const none = (ui, s) => labels.every((label) => ui.rowButton(s, label) === null)
  const reader = await mount({ seats: [OWNER, ACTIVE, INVITED, ASKED], myRole: 'editor' })
  for (const s of [OWNER, ACTIVE, INVITED, ASKED]) assert.ok(none(reader, s), `an editor on ${s.id}`)
  await reader.unmount()

  const owner = await mount({ seats: [OWNER, ACTIVE] })
  assert.ok(none(owner, OWNER), 'your own row, and the last owner')
  await owner.unmount()

  const viewer = await mount({ seats: [OWNER, ACTIVE, INVITED, ASKED], myRole: 'viewer' })
  for (const s of [OWNER, ACTIVE, INVITED, ASKED]) assert.ok(none(viewer, s), `a viewer on ${s.id}`)
  await viewer.unmount()

  // With a second owner, one owner may change and remove the other (ADR 0028 §5).
  const coOwner = seat('lee2', { email: 'x@example.com', role: 'owner' })
  const two = await mount({ seats: [OWNER, coOwner, ACTIVE] })
  assert.ok(two.rowButton(coOwner, 'action.revoke'))
  assert.ok(two.rowButton(ACTIVE, 'action.changeRole'))
})

test('a closed row reads as the act that closed it, and offers no removal', async () => {
  const closed = (id, removalKind) =>
    seat(id, {
      status: 'revoked',
      revokedAt: '2026-10-01T00:00:00Z',
      ...(removalKind === undefined ? {} : { removalKind })
    })
  const rows = [
    [closed('rev', 'revoke'), 'status.revoked', 'access.revoked'],
    [closed('can', 'cancel_invite'), 'status.inviteCancelled', 'access.inviteCancelled'],
    [closed('dec', 'decline_request'), 'status.requestDeclined', 'access.requestDeclined'],
    // The book does not say (a row closed before #792, an older server, a kind not known here).
    [closed('old', null), 'status.revoked', 'access.revoked'],
    [closed('new', 'something_new'), 'status.revoked', 'access.revoked']
  ]
  const { removalKind: _absent, ...older } = closed('abs', null)
  rows.push([older, 'status.revoked', 'access.revoked'])
  const ui = await mount({ seats: [OWNER, ...rows.map(([s]) => s)] })
  for (const [s, statusKey, accessKey] of rows) {
    const row = ui.row(s)
    const statuses = [...row.querySelectorAll('[data-status]')].map((el) => el.textContent)
    assert.ok(statuses.length > 0 && statuses.every((text) => text === statusKey), `${s.id}: ${statuses}`)
    assert.ok(row.textContent.includes(`${accessKey}{"ago":`), `${s.id} access line`)
    for (const label of ['action.revoke', 'action.cancelInvite', 'action.declineRequest'])
      assert.equal(ui.rowButton(s, label), null)
  }
})
