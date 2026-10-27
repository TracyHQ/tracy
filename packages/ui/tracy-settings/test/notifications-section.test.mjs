/**
 * Settings › Notifications (spec #809 step 5), rendered to markup: two column headers, the Team and
 * Comments headings over five rows, two switches per row named by row and column, the join-request
 * row locked on with its sub-line; plus the optimistic toggle and the `?settings=` deep link.
 * Bundled with esbuild the same way `settings-modal-render.test.mjs` bundles the page.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, '..', 'src', 'client')
const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'ts-notifications-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { NotificationsTable, NotificationsSection, DesktopNotifyView, applyToggle, desktopNotifications, desktopNotifyActions } from './notifications-section'
        import { sectionFromSearch, takeSettingsLink, withoutSettingsParam } from './settings-link'
        import { en } from './strings'
        const t = (key) => en[key] ?? key
        export { applyToggle, sectionFromSearch, takeSettingsLink, withoutSettingsParam, desktopNotifications, desktopNotifyActions }
        export function section(desktop) {
          return renderToStaticMarkup(createElement(NotificationsSection, { t, desktop }))
        }
        export function desktopRow(status) {
          return renderToStaticMarkup(createElement(DesktopNotifyView, { t, status, onToggle: () => {}, onTest: () => {}, onSound: () => {} }))
        }
        export function table(groups) {
          return renderToStaticMarkup(createElement(NotificationsTable, { t, groups, onToggle: () => {} }))
        }
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    nodePaths: [coreModules],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** The door's answer for a person who turned the teammates email off. */
const GROUPS = [
  { id: 'about-you', section: 'team', locked: false, inbox: true, email: true },
  { id: 'join-requests', section: 'team', locked: true, inbox: true, email: true },
  { id: 'teammates', section: 'team', locked: false, inbox: true, email: false },
  { id: 'site-changes', section: 'team', locked: false, inbox: true, email: true },
  { id: 'mentions-replies', section: 'comments', locked: false, inbox: true, email: true },
  { id: 'resolved-reopened', section: 'comments', locked: false, inbox: true, email: true }
]

test('headers, headings and the six rows in order', () => {
  const html = lib.table(GROUPS)
  const heads = [...html.matchAll(/role="columnheader"[^>]*>([^<]*)</g)].map((m) => m[1])
  assert.deepEqual(heads, ['', 'Inbox', 'Email'])
  const text = [
    ...html.matchAll(
      /(?:class="ts-row-title"[^>]*|class="ts-nrow ts-nsection" role="row"><span role="rowheader")>([^<]+)</g
    )
  ].map((m) => m[1])
  assert.deepEqual(text, [
    'Team',
    'About you and your invitations',
    'Join requests to your sites',
    'Teammates joining or leaving',
    'Site changes',
    'Comments',
    'Mentions and replies',
    'Resolved and reopened'
  ])
})

test('twelve switches named by row and column; the stored values show', () => {
  const html = lib.table(GROUPS)
  const switches = [...html.matchAll(/<span[^>]*role="switch"[^>]*>/g)].map((m) => m[0])
  assert.equal(switches.length, 12)
  for (const s of switches) assert.match(s, /aria-labelledby="[^" ]+ [^" ]+"/)
  const teammates = html.slice(html.indexOf('data-group="teammates"'))
  const [inbox, email] = [...teammates.matchAll(/role="switch"[^>]*aria-checked="(true|false)"/g)].map(
    (m) => m[1]
  )
  assert.deepEqual([inbox, email], ['true', 'false'])
})

test('the Site changes row says what it covers', () => {
  const html = lib.table(GROUPS)
  const row = html.slice(
    html.indexOf('data-group="site-changes"'),
    html.indexOf('data-group="mentions-replies"')
  )
  assert.match(row, /class="ts-row-desc">Restores and address changes</)
})

test('the join-request row is locked on, with its sub-line', () => {
  const html = lib.table(GROUPS)
  const row = html.slice(html.indexOf('data-group="join-requests"'), html.indexOf('data-group="teammates"'))
  assert.match(row, /Owners always receive this/)
  const switches = [...row.matchAll(/<span[^>]*role="switch"[^>]*>/g)].map((m) => m[0])
  assert.equal(switches.length, 2)
  for (const s of switches) {
    assert.match(s, /aria-checked="true"/)
    assert.match(s, /aria-disabled="true"|data-disabled/)
  }
})

test('a toggle changes one channel of one group and never the locked one', () => {
  const next = lib.applyToggle(GROUPS, 'mentions-replies', 'email', false)
  assert.equal(next.find((g) => g.id === 'mentions-replies').email, false)
  assert.equal(next.find((g) => g.id === 'mentions-replies').inbox, true)
  assert.equal(GROUPS.find((g) => g.id === 'mentions-replies').email, true, 'the input is not changed')
  const locked = lib.applyToggle(GROUPS, 'join-requests', 'inbox', false)
  assert.equal(locked.find((g) => g.id === 'join-requests').inbox, true)
})

test('?settings=notifications opens the Notifications section and is stripped', () => {
  assert.equal(lib.sectionFromSearch('?settings=notifications'), 'tracy-notifications')
  assert.equal(lib.sectionFromSearch('?settings=toString'), null)
  assert.equal(lib.sectionFromSearch('?tab=tracy:inbox'), null)
  assert.equal(lib.withoutSettingsParam('?settings=notifications&tab=tracy:inbox'), '?tab=tracy:inbox')
  assert.equal(lib.withoutSettingsParam('?settings=notifications'), '')
  const replaced = []
  const history = { state: { k: 1 }, replaceState: (state, _title, url) => replaced.push([state, url]) }
  const asked = lib.takeSettingsLink(
    { pathname: '/kinetic.vn/', search: '?settings=notifications', hash: '#x' },
    history
  )
  assert.deepEqual(asked, { section: 'tracy-notifications', vendor: null })
  assert.deepEqual(replaced, [[{ k: 1 }, '/kinetic.vn/#x']])
  assert.equal(lib.takeSettingsLink({ pathname: '/', search: '?tab=a', hash: '' }, history), null)
  assert.equal(replaced.length, 1, 'an address without the parameter is left alone')
})

/** `window.tracyDesktop.app.notifications` at protocol 2, recording every call. */
function notifyBridge(status = { supported: true, enabled: true, permission: 'unknown', lastShownAt: null }) {
  const calls = []
  let current = status
  return {
    calls,
    notifications: {
      status: async () => (calls.push(['status']), current),
      setEnabled: async (on) => (calls.push(['setEnabled', on]), (current = { ...current, enabled: on })),
      test: async () => (calls.push(['test']), current),
      setSound: async (name) => {
        calls.push(['setSound', name])
        if (name === 'Nope') throw new Error('unknown sound')
        return (current = { ...current, sound: name })
      },
      turnFinished: async () => ({ decision: 'shown' }),
      openSystemSettings: async () => {}
    }
  }
}

test('on the web the Desktop row is absent; in the app it is the first row', () => {
  assert.equal(lib.desktopNotifications(undefined), null)
  assert.equal(lib.desktopNotifications({ tracyDesktop: { app: { protocolVersion: 1 } } }), null)
  const { notifications } = notifyBridge()
  assert.equal(
    lib.desktopNotifications({ tracyDesktop: { app: { protocolVersion: 2, notifications } } }),
    notifications
  )
  assert.doesNotMatch(lib.section(null), /data-row="desktop"/)
  const html = lib.section(notifications)
  assert.match(html, /data-row="desktop"/)
  assert.match(html, /Desktop/)
  assert.match(html, /Shown when the agent finishes and no Tracy window is in front\./)
  assert.match(html, /Send a test notification/)
})

test('the Desktop row shows the stored switch, and says so when the computer has no notifications', () => {
  const on = lib.desktopRow({ supported: true, enabled: true, permission: 'unknown', lastShownAt: null })
  assert.match(on, /role="switch"[^>]*aria-checked="true"/)
  assert.doesNotMatch(on, /not supported/)
  const off = lib.desktopRow({ supported: true, enabled: false, permission: 'unknown', lastShownAt: null })
  assert.match(off, /role="switch"[^>]*aria-checked="false"/)
  const none = lib.desktopRow({ supported: false, enabled: true, permission: 'unknown', lastShownAt: null })
  assert.match(none, /Notifications are not supported on this computer\./)
})

test('the switch saves through the app and the button asks the app for a test', async () => {
  const { notifications, calls } = notifyBridge()
  const actions = lib.desktopNotifyActions(notifications)
  assert.equal((await actions.load()).enabled, true)
  assert.equal((await actions.setEnabled(false)).enabled, false)
  await actions.test()
  assert.deepEqual(calls, [['status'], ['setEnabled', false], ['test']])
})

const withSound = (sound) => ({
  supported: true,
  enabled: true,
  permission: 'unknown',
  lastShownAt: null,
  sound
})

test('the Sound picker lists System Default and the fourteen macOS sounds, the stored one chosen', () => {
  const html = lib.desktopRow(withSound('Glass'))
  assert.match(html, /<label[^>]*for="([^"]+)"[^>]*>Sound<\/label>/)
  const id = html.match(/<label[^>]*for="([^"]+)"/)[1]
  assert.match(html, new RegExp(`<select[^>]*id="${id}"`))
  const options = [...html.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]])
  assert.deepEqual(options, [
    ['system', 'System Default'],
    ...[
      'Basso',
      'Blow',
      'Bottle',
      'Frog',
      'Funk',
      'Glass',
      'Hero',
      'Morse',
      'Ping',
      'Pop',
      'Purr',
      'Sosumi',
      'Submarine',
      'Tink'
    ].map((name) => [name, name])
  ])
  assert.match(html, /<option[^>]*value="Glass"[^>]*selected=""/)
  assert.match(html, /Send a test notification/)
})

test('an app that does not report a sound gets no Sound picker', () => {
  const html = lib.desktopRow({ supported: true, enabled: true, permission: 'unknown', lastShownAt: null })
  assert.doesNotMatch(html, /<select/)
  assert.doesNotMatch(html, />Sound</)
  assert.match(html, /Send a test notification/)
})

test('choosing a sound saves it through the app; a refusal answers null so the row goes back', async () => {
  const { notifications, calls } = notifyBridge(withSound('system'))
  const actions = lib.desktopNotifyActions(notifications)
  assert.equal((await actions.setSound('Ping')).sound, 'Ping')
  assert.equal(await actions.setSound('Nope'), null)
  assert.deepEqual(calls, [
    ['setSound', 'Ping'],
    ['setSound', 'Nope']
  ])
  const { setSound: _gone, ...older } = notifications
  assert.equal(await lib.desktopNotifyActions(older).setSound('Ping'), null)
})
