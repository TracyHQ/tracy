/**
 * Each step drawn from data (`AccountStep.tsx`, `AppearanceStep.tsx`, `NotificationStep.tsx`), no
 * bridge, no network: step 1's three states of the mock (found / nothing found / still looking), the
 * pick's check mark, the warning strip with "Install instructions", the "turned off" line; step 2's
 * picked card; step 3's status card, which never claims the system allowed notifications.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-render-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { AccountStep } from './AccountStep'
        import { AppearanceStep } from './AppearanceStep'
        import { NotificationStep } from './NotificationStep'
        import { SignInStep } from './SignInStep'
        import { accountView, initialState, reduce } from './flow'
        import { en } from './strings'
        const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
        const noop = () => {}
        export function account(catalogue, actions, panel = { kind: 'none' }, connected = []) {
          const state = actions.reduce(reduce, initialState())
          return renderToStaticMarkup(createElement(AccountStep, {
            t, view: accountView(catalogue, state), picked: state.picked, panel, connected, account: 'lee@example.com',
            onPick: noop, onToggleMore: noop, onRefresh: noop, onInstall: noop,
            onConnect: noop, onCancel: noop, onReopen: noop, onSubmit: noop, onCopy: noop, onOpenAccounts: noop
          }))
        }
        export function signIn(viewer) {
          return renderToStaticMarkup(createElement(SignInStep, { t, viewer }))
        }
        export function appearance(theme, note = null) {
          return renderToStaticMarkup(createElement(AppearanceStep, {
            t, theme, onTheme: noop, note, language: createElement('div', { 'data-language-row': '' })
          }))
        }
        export function notification(status, sound = false) {
          return renderToStaticMarkup(createElement(NotificationStep, {
            t, status, formatTime: () => '20:41', onToggle: noop, onTest: noop, onOpenSettings: noop,
            onSound: sound ? noop : undefined
          }))
        }
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'text' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const CATALOGUE = [
  { id: 'claude', name: 'Claude', homepage: 'https://claude.ai' },
  { id: 'codex', name: 'ChatGPT Codex', homepage: 'https://chatgpt.com/codex' },
  { id: 'antigravity', name: 'Antigravity (Gemini)', homepage: null },
  { id: 'copilot', name: 'GitHub Copilot', homepage: 'https://github.com/features/copilot' },
  { id: 'grok', name: 'Grok', homepage: 'https://grok.com' },
  { id: 'cursor', name: 'Cursor', homepage: null },
  { id: 'kiro', name: 'Kiro', homepage: null }
]
const detected = (found, scanComplete) => ({
  type: 'detected',
  detection: {
    results: CATALOGUE.map((v) => ({ id: v.id, status: found.includes(v.id) ? 'found' : 'not-found' })),
    scanComplete
  }
})
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
/** The vendor cards, after the Tracy AI card that always leads. */
const cards = (html) =>
  [...html.matchAll(/data-agent="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== 'tracy')
const badge = (html, id) =>
  new RegExp(`data-agent="${id}"[^>]*>(?:(?!</button>).)*data-badge="([a-z]+)"`).exec(html)?.[1] ?? null
const pressed = (html) => [...html.matchAll(/aria-pressed="true"[^>]*data-agent="([^"]+)"/g)].map((m) => m[1])

test('(a) found: "Found on this computer 2", the two cards, Claude picked, the rest behind "Show 5 more →"', () => {
  const html = lib.account(CATALOGUE, [detected(['claude', 'codex'], true)])
  assert.match(text(html), /Found on this computer 2 Refresh/)
  assert.deepEqual(cards(html), ['claude', 'codex'])
  assert.deepEqual(pressed(html), ['claude'])
  assert.match(html, /Show 5 more →/)
  assert.doesNotMatch(html, /No AI tools were found/)
  assert.doesNotMatch(html, /tv-ob-warn/)
  assert.match(html, /data-agent="claude"[^>]*>.*?<svg/, 'Claude wears its mark')
})

test('(b) nothing found: the note, "Popular 6", the first six cards, letter marks for unknown vendors', () => {
  const html = lib.account(CATALOGUE, [detected([], true)])
  assert.match(text(html), /^No AI tools were found on this computer\./)
  assert.match(text(html), /Popular Refresh/, 'no count when nothing was found (the mock shows none)')
  assert.deepEqual(cards(html), ['claude', 'codex', 'antigravity', 'copilot', 'grok', 'cursor'])
  assert.deepEqual(pressed(html), [], 'nothing chosen for the person')
  assert.match(html, /tv-ob-letter">C</, 'Cursor has no mark: its first letter')
  assert.match(html, /Show 1 more →/)
})

test('(c) still looking: the spinner, the heading, the found-so-far count, Refresh disabled, no note', () => {
  const html = lib.account(CATALOGUE, [])
  assert.match(html, /tv-ob-spinner/)
  assert.match(text(html), /Looking for AI tools on this computer… Refresh/, 'no count while looking')
  assert.match(html, /data-action="refresh" disabled=""/)
  assert.doesNotMatch(html, /No AI tools were found/)
})

test('a picked vendor not on this computer: the warning names it in bold, with Install instructions', () => {
  const html = lib.account(CATALOGUE, [detected(['claude'], true), { type: 'pick', id: 'copilot' }])
  assert.match(html, /data-warn="copilot"/)
  assert.match(html, /<b>GitHub Copilot<\/b> isn&#x27;t on this computer yet\./)
  assert.match(html, /data-action="install"/)
  assert.match(html, /aria-expanded="true"/, 'the pick keeps "Show more" open')
  assert.deepEqual(pressed(html), ['copilot'])
  const noHome = lib.account(CATALOGUE, [detected(['claude'], true), { type: 'pick', id: 'kiro' }])
  assert.match(noHome, /data-warn="kiro"/)
  assert.doesNotMatch(noHome, /data-action="install"/, 'no homepage known: no link invented')
})

test('connecting turned off on /ops: the line says so, the grid stays', () => {
  const html = lib.account(CATALOGUE, [detected(['claude'], true)], { kind: 'off' })
  assert.match(html, /data-connect="off"/)
  assert.match(text(html), /Connecting your own account is turned off on this deployment\./)
  assert.deepEqual(cards(html), ['claude'])
})

test('appearance & language: the Language row on top, then "Appearance" and three cards, the current preference pressed, the footnote', () => {
  const html = lib.appearance('dark')
  assert.match(html, /data-language-row=""[\s\S]*Appearance[\s\S]*data-theme-pick="system"/)
  assert.doesNotMatch(html, /tv-ob-lang-note/, 'no line while the device language is offered')
  assert.deepEqual(
    [...html.matchAll(/data-theme-pick="([a-z]+)"/g)].map((m) => m[1]),
    ['system', 'dark', 'light']
  )
  assert.match(html, /aria-pressed="true" data-theme-pick="dark"/)
  assert.match(text(html), /System Match this computer Dark Easy on the eyes Light Bright and crisp/)
  assert.match(html, /More options in <b>Settings › Appearance<\/b>\./)
  assert.match(html, /tv-ob-pv-dark tv-ob-pv-split-l/, 'System previews both halves')
})

test('notifications: the switch follows `enabled`; the status row says sent at / not sent, never "allowed"', () => {
  const base = { supported: true, enabled: true, permission: 'unknown', lastShownAt: null }
  const fresh = lib.notification(base)
  assert.match(fresh, /role="switch" aria-checked="true"/)
  assert.match(fresh, /data-status="not-sent"/)
  assert.match(text(fresh), /No test notification sent yet\./)
  assert.match(fresh, /data-action="open-settings"/)

  const sent = lib.notification({ ...base, enabled: false, permission: 'allowed', lastShownAt: 1 })
  assert.match(sent, /aria-checked="false"/)
  assert.match(text(sent), /Test notification sent at 20:41\./)
  assert.doesNotMatch(text(sent), /Check Focus/, 'the permission is known: no reminder')

  const unsupported = lib.notification({ ...base, supported: false })
  assert.match(unsupported, /tv-ob-status tv-ob-blocked/)
  assert.match(text(unsupported), /does not offer notifications/)
  assert.match(unsupported, /data-action="send-test" disabled=""/)

  const waiting = lib.notification(null)
  assert.doesNotMatch(waiting, /data-status=/)
  for (const html of [fresh, sent, unsupported, waiting]) assert.doesNotMatch(html, /granted/i)
})

test('notifications, permission unknown: the on-card says the permission cannot be read; after a test, the Focus reminder', () => {
  const base = { supported: true, enabled: true, permission: 'unknown', lastShownAt: null }
  assert.match(
    text(lib.notification(base)),
    /^Notifications are on Tracy's switch is on\. Tracy can't read this computer's notification permission\./
  )
  assert.match(
    text(lib.notification({ ...base, lastShownAt: 1 })),
    /Test notification sent at 20:41\. Didn't see or hear it\? Check Focus and the notification permission of Tracy Cowork\./
  )
  // An app that answers something else than allowed/denied is treated as unknown.
  assert.match(
    text(lib.notification({ ...base, permission: 'notDetermined' })),
    /can't read this computer's notification permission/
  )
})

test('notifications, macOS blocks them: the amber card with Open System Settings; sound and test disabled with the reason, not hidden', () => {
  const blocked = lib.notification(
    { supported: true, enabled: true, permission: 'denied', lastShownAt: null, sound: 'Glass' },
    true
  )
  assert.match(blocked, /tv-ob-enabled-card tv-ob-blocked/)
  assert.match(blocked, /data-notify="blocked"/)
  assert.match(
    text(blocked),
    /^macOS is blocking notifications from Tracy Cowork Turn on Allow notifications for Tracy Cowork in System Settings › Notifications, then come back here\. Open System Settings/
  )
  assert.match(blocked, /<b>Allow notifications<\/b>/)
  assert.match(blocked, /data-action="open-settings"/)
  assert.doesNotMatch(blocked, /data-status=/, 'no status row while blocked')
  assert.match(blocked, /aria-disabled="true"/)
  assert.match(blocked, /data-action="sound" disabled=""/)
  assert.match(blocked, /data-action="send-test" disabled=""/)
  assert.match(text(blocked), /Allow notifications in System Settings to choose a sound and send a test\./)
})

test('notifications: "Notifications are on / off" above the switch; the sound picker only when the app has one', () => {
  const base = { supported: true, enabled: true, permission: 'allowed', lastShownAt: null }
  const on = lib.notification(base)
  assert.match(on, /data-notify="on"/)
  assert.match(
    text(on),
    /^Notifications are on Tracy will alert you when the agent finishes\. Notify me when the agent finishes/
  )
  assert.doesNotMatch(on, /data-action="sound"/, 'an app without setSound: no picker')
  assert.match(
    text(lib.notification({ ...base, enabled: false })),
    /^Notifications are off Turn them on to be told when the agent finishes\./
  )

  const picker = lib.notification({ ...base, sound: 'Glass' }, true)
  const options = [...picker.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]])
  assert.equal(options.length, 15)
  assert.deepEqual(options[0], ['system', 'System Default'])
  assert.deepEqual(options.at(-1), ['Tink', 'Tink'])
  assert.match(picker, /<option value="Glass" selected="">/)
  assert.match(text(picker), /Choose a sound The sound played with a notification\./)
  assert.match(picker, /data-action="sound"[\s\S]*data-action="send-test"/, 'on one row with the test button')
})

test('a vendor already connected wears "Connected" on its card', () => {
  const html = lib.account(CATALOGUE, [detected(['claude', 'codex'], true)], { kind: 'none' }, ['codex'])
  assert.match(
    html,
    /data-agent="codex"[^>]*>.*?<span class="tv-ob-badge tv-ob-order" data-badge="connected">Connected<\/span>/
  )
  assert.doesNotMatch(html, /data-agent="claude"[^>]*>(?:(?!<\/button>).)*tv-ob-badge/)
})

test('the Tracy AI card leads under "Included with your Tracy account": Default while nothing is connected, Included once one is', () => {
  const none = lib.account(CATALOGUE, [detected(['claude', 'codex'], true)])
  assert.match(
    text(none),
    /^Included with your Tracy account T Tracy AI Default Found on this computer 2 Refresh/
  )
  assert.match(
    none,
    /data-agent="tracy"[^>]*>\s*<span class="tv-ob-agent-icon"><span class="tv-ob-mark-tracy">T<\/span>/
  )
  assert.equal(badge(none, 'tracy'), 'default')
  assert.match(none, /data-agent="tracy"[\s\S]*data-agent="claude"/, 'first on the page')
  const one = lib.account(CATALOGUE, [detected(['claude', 'codex'], true)], { kind: 'none' }, ['codex'])
  assert.equal(badge(one, 'tracy'), 'included')
  assert.equal(badge(one, 'codex'), 'connected')
  assert.equal(badge(one, 'claude'), null)
})

test('Tracy AI picked: its panel names the signed-in account and offers nothing to connect', () => {
  const html = lib.account(CATALOGUE, [detected([], true), { type: 'pick', id: 'tracy' }], { kind: 'tracy' })
  assert.deepEqual(pressed(html), ['tracy'])
  assert.match(html, /data-connect="tracy"/)
  assert.match(html, /data-state="connected"/)
  assert.match(
    text(html),
    /Tracy AI Part of your Tracy account, signed in as lee@example\.com\. Your default: new chats use it\. Connect your own plan to use it instead\./
  )
  assert.doesNotMatch(html, /data-action="connect"/)
  assert.doesNotMatch(html, /tv-ob-warn/, 'nothing to install for the built-in card')
  assert.match(html, /aria-expanded="false"/, 'the fold stays closed: tracy is not behind it')
})

test('the picked card wears the check with its accessible name', () => {
  const html = lib.account(CATALOGUE, [detected(['claude'], true)])
  assert.match(
    html,
    /data-agent="claude"[^>]*>(?:(?!<\/button>).)*<span class="tv-ob-check" aria-label="Selected" role="img">/
  )
})

test('sign in: the signed-in card with the face, the name and the email; nothing invented while unknown', () => {
  const html = lib.signIn({
    state: 'signedIn',
    name: 'Lee',
    email: 'lee@example.com',
    face: { initial: 'L', color: '#2a7', avatarUrl: null }
  })
  assert.match(html, /tv-ob-who/)
  assert.match(html, /data-tracy-face=""[^>]*>L</)
  assert.match(text(html), /L Lee lee@example\.com Signed in/)
  const noName = lib.signIn({ state: 'signedIn', name: null, email: 'lee@example.com', face: null })
  assert.match(text(noName), /^lee@example\.com Signed in$/)
  const loading = lib.signIn({ state: 'loading', name: null, email: null, face: null })
  assert.doesNotMatch(loading, /tv-ob-who/)
})

test('the connect panel sits under the grid and above "Show N more"', () => {
  const html = lib.account(CATALOGUE, [detected(['claude', 'codex'], true)], {
    kind: 'idle',
    vendor: { id: 'claude', name: 'Claude' }
  })
  assert.match(html, /data-agent="codex"[\s\S]*data-connect="idle"[\s\S]*Show 5 more/)
})

test('connect panel A idle: "Connect Claude to finish this step" with Connect now', () => {
  const html = lib.account(CATALOGUE, [], { kind: 'idle', vendor: { id: 'claude', name: 'Claude' } })
  assert.match(
    text(html),
    /Connect Claude to finish this step Tracy works on your Claude plan\. Sign in once in your browser\. Connect now/
  )
  assert.match(html, /data-action="connect"/)
})

test('connect panel B pending (browser): waiting, Cancel, open again, and the paste link', () => {
  const html = lib.account(CATALOGUE, [], {
    kind: 'pending',
    vendor: { id: 'claude', name: 'Claude' },
    authorizeUrl: 'https://claude.ai/oauth',
    device: null,
    busy: false
  })
  assert.match(html, /data-connect="pending"/)
  assert.match(html, /tv-ob-spinner/)
  assert.match(
    text(html),
    /Waiting for Claude… Finish signing in to Claude in your browser, then come back here\. Cancel Open sign-in page again Browser didn't come back to the app\? Paste the callback URL/
  )
  for (const action of ['cancel', 'reopen', 'paste'])
    assert.match(html, new RegExp(`data-action="${action}"`))
})

test('connect panel B pending (device): the code to type, Copy, and the vendor page', () => {
  const html = lib.account(CATALOGUE, [], {
    kind: 'pending',
    vendor: { id: 'copilot', name: 'GitHub Copilot' },
    authorizeUrl: 'https://github.com/login/device',
    device: { code: 'WDJB-MJHT' },
    busy: false
  })
  assert.match(
    text(html),
    /Enter this code on the GitHub Copilot page in your browser, then come back here\./
  )
  assert.match(html, /tv-ob-code[^>]*>WDJB-MJHT</)
  assert.match(text(html), /Copy code/)
  assert.match(text(html), /Open the GitHub Copilot page/)
  assert.doesNotMatch(html, /data-action="paste"/, 'a device sign-in has no callback URL')
})

test('connect panel C connected / D error / E API key', () => {
  const vendor = { id: 'claude', name: 'Claude' }
  const connected = lib.account(CATALOGUE, [], { kind: 'connected', vendor, account: 'lee@example.com' })
  assert.match(text(connected), /Claude connected Signed in as lee@example\.com\. New chats use this plan\./)
  assert.match(
    text(lib.account(CATALOGUE, [], { kind: 'connected', vendor, account: null })),
    /Claude connected New chats use this plan\./
  )
  const error = lib.account(CATALOGUE, [], { kind: 'error', vendor })
  assert.match(text(error), /Could not connect Claude The sign-in expired or was declined\. Try again/)
  assert.match(error, /data-action="retry"/)
  const key = lib.account(CATALOGUE, [], { kind: 'key', vendor: { id: 'gemini', name: 'Gemini' } })
  assert.match(
    text(key),
    /Gemini connects with an API key Paste the key in Settings › AI accounts\. Open AI accounts/
  )
  assert.match(key, /data-action="open-accounts"/)
  assert.doesNotMatch(lib.account(CATALOGUE, [], { kind: 'none' }), /tv-ob-connect/)
})

test('appearance & language: the line under the Language row when the device language is not offered or unreadable', () => {
  const unsupported = lib.appearance('system', { kind: 'unsupported', system: '日本語', fallback: 'English' })
  assert.match(unsupported, /tv-ob-lang-note/)
  assert.match(
    text(unsupported),
    /This computer uses 日本語 ?\. Tracy doesn't offer it yet, so it uses English ?\. You can pick another language above\./
  )
  assert.match(unsupported, /<b>日本語<\/b>[\s\S]*<b>English<\/b>/)
  const failed = lib.appearance('system', { kind: 'failed', fallback: 'English' })
  assert.match(text(failed), /Tracy couldn't read this computer's language, so it uses English ?\./)
})
