/**
 * Settings › Help & about (tasks/todo-desktop-help-about.md): the pure helpers (links per language,
 * the app version an older app announces, release-note lines), the plugin-level source of the
 * desktop update state, the section drawn for the web, an older app and each update state, and the
 * nav dot that follows the source while another section is open, and the `settings.help.item` rows
 * other plugins add (Getting started) between the update rows and the release notes.
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ts-help-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { SettingsPage, createSectionsProjection } from './index'
        import { HelpAboutSection, HelpAboutView } from './help-about-section'
        import * as model from './help-about-model'
        import { createUpdateSource, desktopBridge } from './desktop-updates'
        import { sectionFromSearch } from './settings-link'
        import { en } from './strings'
        const t = (key, params) =>
          (en[key] ?? key).replace(/\\{(\\w+)\\}/g, (m, name) => (params && name in params ? String(params[name]) : m))
        export const createMarker = () => createElement('i', { 'data-help-item-marker': '1' })
        export { model, createUpdateSource, desktopBridge, sectionFromSearch, createSectionsProjection, en }
        export function view(props) {
          return renderToStaticMarkup(
            createElement(HelpAboutView, {
              t,
              locale: 'en',
              now: Date.UTC(2026, 9, 9, 12, 0, 0),
              build: null,
              onAction: () => {},
              onToggle: () => {},
              onOpen: () => {},
              ...props
            })
          )
        }
        /** The section as registered, with a renderSlot that records each call and draws a marker. */
        export function section(renderCalls) {
          const updates = { present: false, subscribe: () => () => {}, getSnapshot: () => null }
          const renderSlot = (name, owner) => {
            renderCalls.push([name, owner])
            return createElement('i', { 'data-rendered': name })
          }
          return renderToStaticMarkup(createElement(HelpAboutSection, { t, updates, renderSlot }))
        }
        export function page(rows, activeId) {
          const renderSlot = (name, _owner, options) =>
            createElement('i', { 'data-rendered': name + (options && options.only ? ':' + options.only : '') })
          return renderToStaticMarkup(
            createElement(SettingsPage, { t, renderSlot, rows, activeId, onSelect: () => {}, onClose: () => {} })
          )
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
    define: { __TAILWIND_CSS__: '""' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const SHA = '1e4df87c0ffee0123456789abcdef0123456789a'
const NOW = Date.UTC(2026, 9, 9, 12, 0, 0)
const MIN = 60_000

/** A desktop update state as the bridge sends it. */
const state = (over = {}) => ({
  revision: 1,
  status: 'idle',
  version: null,
  percent: null,
  releaseNotes: null,
  lastCheckedAt: null,
  nextRetryAt: null,
  autoCheck: true,
  ...over
})
const app = (over = {}, info = {}) => ({
  kind: 'app',
  info: { protocolVersion: 1, version: '0.3.0-dev.4', arch: 'arm64', channel: 'dev', updates: true, ...info },
  state: state(over),
  saveFailed: false
})

/** Visible text, tags dropped, entities decoded enough for the assertions. */
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────

test('tracy.ai links follow the interface language where the site has it, the root otherwise', () => {
  const { tracyUrl } = lib.model
  assert.equal(tracyUrl('/help/', 'de'), 'https://tracy.ai/de/help/')
  assert.equal(tracyUrl('/help/faq/', 'nl-NL'), 'https://tracy.ai/nl/help/faq/')
  assert.equal(tracyUrl('/pricing/', 'es'), 'https://tracy.ai/es/pricing/')
  for (const locale of ['en', 'vi', 'zh-CN', undefined, 'xx'])
    assert.equal(tracyUrl('/terms/', locale), 'https://tracy.ai/terms/')
  assert.equal(tracyUrl('/', 'fr'), 'https://tracy.ai/fr/')
  assert.equal(tracyUrl('/', 'en'), 'https://tracy.ai/')
})

test('an address is shown without its scheme and closing slash', () => {
  assert.equal(lib.model.shownAddress('https://tracy.ai/de/help/faq/'), 'tracy.ai/de/help/faq')
  assert.equal(lib.model.shownAddress('https://tracy.ai/'), 'tracy.ai')
})

test('an app built before the bridge is told apart from a browser by its user agent', () => {
  const { appVersionFromUserAgent } = lib.model
  assert.equal(
    appVersionFromUserAgent(
      'Mozilla/5.0 (Macintosh) Chrome/142.0 Electron/40.1 Safari/537.36 TracyCowork/0.2.0'
    ),
    '0.2.0'
  )
  assert.equal(appVersionFromUserAgent('Mozilla/5.0 TracyCowork/0.3.0-dev.4'), '0.3.0-dev.4')
  assert.equal(appVersionFromUserAgent('Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36'), null)
  assert.equal(appVersionFromUserAgent('TracyCowork/<script>'), null)
})

test('release notes become lines: "- " starts a bullet, an empty line a gap, the rest is text', () => {
  assert.deepEqual(lib.model.noteLines('New\n- one\n- two\n\nFixed\n-not a bullet'), [
    { kind: 'text', text: 'New' },
    { kind: 'bullet', text: 'one' },
    { kind: 'bullet', text: 'two' },
    { kind: 'gap', text: '' },
    { kind: 'text', text: 'Fixed' },
    { kind: 'text', text: '-not a bullet' }
  ])
})

test('the dot shows for a version waiting for the person, not for checks or downloads', () => {
  const { waitingUpdate } = lib.model
  for (const status of ['downloaded', 'available-manual', 'install-error'])
    assert.equal(waitingUpdate(state({ status, version: '0.3.0' })), true, status)
  for (const status of ['off', 'idle', 'checking', 'current', 'downloading', 'error', 'installing'])
    assert.equal(waitingUpdate(state({ status })), false, status)
  assert.equal(waitingUpdate(null), false)
})

test('the nav dot says why: an update required, a version waiting, what is new — or nothing', () => {
  const { helpBadge } = lib.model
  assert.equal(helpBadge(null), null)
  assert.equal(helpBadge(state({ status: 'current' })), null)
  assert.equal(helpBadge(state({ status: 'downloaded', version: '0.6.1' })), 'update')
  assert.equal(helpBadge(state({ status: 'available-manual', version: '0.6.1' })), 'update')
  const pending = { pending: true, from: '0.5.1', to: '0.6.0', page: '0.6' }
  assert.equal(helpBadge(state({ status: 'current', whatsNew: pending })), 'whatsNew')
  assert.equal(helpBadge(state({ status: 'current', whatsNew: { ...pending, pending: false } })), null)
  // A waiting version outranks what is new in the running one: pressing Restart is the next step.
  assert.equal(helpBadge(state({ status: 'downloaded', version: '0.6.1', whatsNew: pending })), 'update')
  const warn = { level: 'warn', minimumVersion: '0.6.0', after: Date.UTC(2026, 9, 20, 12) }
  assert.equal(helpBadge(state({ status: 'downloaded', version: '0.6.1', policy: warn })), 'required')
  assert.equal(helpBadge(state({ policy: { ...warn, level: 'blocked' } })), 'required')
  assert.equal(helpBadge(state({ policy: { ...warn, level: 'ok' } })), null)
  // An app from before protocol 3 sends neither field, and an old one may still send `postponed`.
  assert.equal(helpBadge(state({ status: 'current', postponed: true })), null)
})

test('the dot’s words for a screen reader follow its reason', () => {
  const { helpBadgeKey } = lib.model
  assert.equal(helpBadgeKey(state({ status: 'current' })), null)
  assert.equal(helpBadgeKey(state({ status: 'downloaded', version: '0.6.1' })), 'help.badge')
  assert.equal(
    helpBadgeKey(state({ whatsNew: { pending: true, from: '0.5.1', to: '0.6.0', page: '0.6' } })),
    'help.badge.whatsNew'
  )
  assert.equal(
    helpBadgeKey(state({ policy: { level: 'warn', minimumVersion: '0.6.0', after: null } })),
    'help.badge.required'
  )
  for (const key of ['help.badge', 'help.badge.whatsNew', 'help.badge.required']) assert.ok(lib.en[key], key)
})

test('the policy line: a date to update by, no longer supported, or nothing', () => {
  const { policyNotice } = lib.model
  const after = Date.UTC(2026, 9, 20, 12)
  assert.equal(policyNotice(null), null)
  assert.equal(policyNotice(undefined), null)
  assert.equal(policyNotice({ level: 'ok', minimumVersion: '0.6.0', after }), null)
  assert.deepEqual(policyNotice({ level: 'warn', minimumVersion: '0.6.0', after }), {
    tone: 'warn',
    key: 'help.policy.stopsOn',
    minimumVersion: '0.6.0',
    after
  })
  assert.deepEqual(policyNotice({ level: 'warn', minimumVersion: '0.6.0', after: null }), {
    tone: 'warn',
    key: 'help.policy.unsupported',
    minimumVersion: '0.6.0',
    after: null
  })
  // Blocked: the date has passed or there never was one, so the line never names a date.
  assert.deepEqual(policyNotice({ level: 'blocked', minimumVersion: '0.6.0', after }), {
    tone: 'error',
    key: 'help.policy.unsupported',
    minimumVersion: '0.6.0',
    after: null
  })
  // No version to name: nothing honest to say, so nothing is said.
  assert.equal(policyNotice({ level: 'warn', minimumVersion: null, after }), null)
})

test('a time ago and a time ahead read in the interface language', () => {
  const { relativeTime } = lib.model
  assert.equal(relativeTime(NOW - 2 * MIN, NOW, 'en'), '2 minutes ago')
  assert.equal(relativeTime(NOW + 10 * MIN, NOW, 'en'), 'in 10 minutes')
  assert.equal(relativeTime(NOW - 10_000, NOW, 'en'), 'now')
  assert.equal(relativeTime(NOW - 3 * 3_600_000, NOW, 'de'), 'vor 3 Stunden')
})

// ── the plugin-level source of the update state ─────────────────────────────────────────────────

function fakeBridge(initial = state()) {
  const watchers = new Set()
  const bridge = {
    protocolVersion: 1,
    pending: [],
    info: async () => ({ version: '0.3.0-dev.4', arch: 'arm64', channel: 'dev', updates: true }),
    update: {
      getState: () => new Promise((resolve) => bridge.pending.push(() => resolve(initial))),
      check: async () => state({ status: 'checking', revision: 9 }),
      restart: async () => initial,
      download: async () => initial,
      setAutoCheck: async () => {
        if (bridge.failSave) throw new Error('disk full')
        return state({ autoCheck: false, revision: 50 })
      },
      onState: (fn) => {
        watchers.add(fn)
        return () => watchers.delete(fn)
      }
    },
    push: (s) => {
      for (const fn of watchers) fn(s)
    },
    watchers
  }
  return bridge
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('no bridge: no source to read (a browser, or an app from before the bridge)', () => {
  assert.equal(lib.desktopBridge({}), null)
  assert.equal(lib.desktopBridge({ tracyDesktop: { links: {} } }), null)
  assert.equal(lib.desktopBridge({ tracyDesktop: { app: { protocolVersion: 0, update: {} } } }), null)
  const bridge = fakeBridge()
  assert.equal(lib.desktopBridge({ tracyDesktop: { app: bridge } }), bridge)
})

test('a snapshot that arrives after a newer pushed state does not replace it', async () => {
  const bridge = fakeBridge(state({ revision: 3, status: 'current' }))
  const source = lib.createUpdateSource(bridge)
  const stop = source.start()
  bridge.push(state({ revision: 7, status: 'downloaded', version: '0.3.0' }))
  bridge.pending.shift()()
  await flush()
  assert.equal(source.getSnapshot().state.status, 'downloaded')
  assert.equal(source.getSnapshot().info.version, '0.3.0-dev.4')
  stop()
})

test('after stop, no state is received and no watcher is left on the bridge', async () => {
  const bridge = fakeBridge()
  const source = lib.createUpdateSource(bridge)
  let calls = 0
  const off = source.subscribe(() => calls++)
  const stop = source.start()
  bridge.pending.shift()()
  await flush()
  stop()
  assert.equal(bridge.watchers.size, 0)
  const before = calls
  bridge.push(state({ revision: 99, status: 'checking' }))
  assert.equal(calls, before)
  off()
})

test('a switch the app could not save comes back as not saved, and the state stays as it was', async () => {
  const bridge = fakeBridge(state({ revision: 3, autoCheck: true }))
  const source = lib.createUpdateSource(bridge)
  source.start()
  bridge.pending.shift()()
  await flush()
  bridge.failSave = true
  assert.equal(await source.setAutoCheck(false), false)
  assert.equal(source.getSnapshot().state.autoCheck, true)
  assert.equal(source.getSnapshot().saveFailed, true)
  bridge.failSave = false
  assert.equal(await source.setAutoCheck(false), true)
  assert.equal(source.getSnapshot().state.autoCheck, false)
  assert.equal(source.getSnapshot().saveFailed, false)
})

/** A protocol-3 bridge: What's new, the changelog, and the app's request to open Help & about. */
function fakeBridge3(initial = state()) {
  const bridge = fakeBridge(initial)
  bridge.protocolVersion = 3
  bridge.calls = []
  bridge.helpWatchers = new Set()
  bridge.whatsNew = {
    seen: async () => {
      bridge.calls.push('seen')
      return state({ revision: 60, whatsNew: { pending: false, from: '0.5.1', to: '0.6.0', page: '0.6' } })
    },
    setNotify: async (on) => {
      bridge.calls.push(`notify:${on}`)
      if (bridge.failSave) throw new Error('disk full')
      return state({ revision: 61, showWhatsNew: on })
    }
  }
  bridge.openChangelog = async () => {
    bridge.calls.push('changelog')
  }
  bridge.onOpenHelp = (fn) => {
    bridge.helpWatchers.add(fn)
    return () => bridge.helpWatchers.delete(fn)
  }
  return bridge
}

test('protocol 3: seen() hands back the state that clears What’s new', async () => {
  const pending = { pending: true, from: '0.5.1', to: '0.6.0', page: '0.6' }
  const bridge = fakeBridge3(state({ revision: 5, status: 'current', whatsNew: pending }))
  const source = lib.createUpdateSource(bridge)
  source.start()
  bridge.pending.shift()()
  await flush()
  assert.equal(source.getSnapshot().state.whatsNew.pending, true)
  await source.seen()
  assert.deepEqual(bridge.calls, ['seen'])
  assert.equal(source.getSnapshot().state.whatsNew.pending, false)
})

test('protocol 3: the What’s new switch saves, or comes back as not saved', async () => {
  const bridge = fakeBridge3(state({ revision: 5, showWhatsNew: true }))
  const source = lib.createUpdateSource(bridge)
  source.start()
  bridge.pending.shift()()
  await flush()
  bridge.failSave = true
  assert.equal(await source.setNotify(false), false)
  assert.equal(source.getSnapshot().state.showWhatsNew, true)
  assert.equal(source.getSnapshot().notifySaveFailed, true)
  // The other switch's failure is its own: it says nothing about this one.
  assert.equal(source.getSnapshot().saveFailed, false)
  bridge.failSave = false
  assert.equal(await source.setNotify(false), true)
  assert.equal(source.getSnapshot().state.showWhatsNew, false)
  assert.equal(source.getSnapshot().notifySaveFailed, false)
})

test('protocol 3: the changelog opens through the app, and the app can ask for Help & about', async () => {
  const bridge = fakeBridge3()
  const source = lib.createUpdateSource(bridge)
  assert.equal(source.canOpenChangelog, true)
  await source.openChangelog()
  assert.deepEqual(bridge.calls, ['changelog'])
  let asked = 0
  const off = source.onOpenHelp(() => asked++)
  for (const fn of bridge.helpWatchers) fn()
  assert.equal(asked, 1)
  off()
  assert.equal(bridge.helpWatchers.size, 0)
})

test('an app before protocol 3: no seen, no switch, no changelog, no request — and nothing throws', async () => {
  const bridge = fakeBridge(state({ revision: 5, status: 'current' }))
  bridge.protocolVersion = 2
  const source = lib.createUpdateSource(bridge)
  source.start()
  bridge.pending.shift()()
  await flush()
  assert.equal(source.canOpenChangelog, false)
  await source.seen()
  await source.openChangelog()
  assert.equal(await source.setNotify(false), false)
  const off = source.onOpenHelp(() => assert.fail('an old app never asks'))
  off()
  assert.equal(source.getSnapshot().state.status, 'current')
  // No source at all (a browser): the same calls are harmless.
  const none = lib.createUpdateSource(null)
  assert.equal(none.canOpenChangelog, false)
  await none.seen()
  none.onOpenHelp(() => {})()
})

// ── the section ──────────────────────────────────────────────────────────────────────────────

test('on the web: server build and desktop download, without an update row', () => {
  const html = lib.view({
    surface: { kind: 'web' },
    build: { commit: SHA, builtAt: '2026-10-09T08:12:00.000Z' }
  })
  const words = text(html)
  assert.match(words, /Tracy Cowork/)
  assert.match(words, /Claude Design, but for CMS/)
  assert.match(words, /Server Oct 9, 2026 · 1e4df87/)
  assert.doesNotMatch(words, /Tracy on the web updates|Reload the page|Desktop app updates/)
  assert.match(html, /href="https:\/\/tracy\.ai\/download"/)
  assert.match(words, /Download Desktop App/)
  assert.doesNotMatch(html, /role="switch"/)
  assert.doesNotMatch(words, /What’s new|Desktop app updates|App 0/)
})

test('no build info: no Server label, never a made-up one', () => {
  assert.doesNotMatch(text(lib.view({ surface: { kind: 'web' }, build: null })), /Server/)
  assert.doesNotMatch(
    text(lib.view({ surface: { kind: 'web' }, build: { commit: null, builtAt: null } })),
    /Server/
  )
})

test('five help links and two legal links, localized, opening a new tab on the web', () => {
  const html = lib.view({ surface: { kind: 'web' }, locale: 'de' })
  const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[0])
  const urls = hrefs.map((a) => a.match(/href="([^"]+)"/)[1])
  assert.deepEqual(urls, [
    'https://tracy.ai/download',
    'https://tracy.ai/de/help/',
    'https://tracy.ai/de/help/faq/',
    'https://tracy.ai/de/pricing/',
    'https://tracy.ai/de/',
    'https://discord.gg/BM9TMRcEBb',
    'https://tracy.ai/de/privacy/',
    'https://tracy.ai/de/terms/'
  ])
  for (const a of hrefs) {
    assert.match(a, /target="_blank"/)
    assert.match(a, /rel="noopener noreferrer"/)
  }
  const words = text(html)
  for (const label of [
    'Help center',
    'FAQ',
    'Pricing',
    'Website',
    'Community',
    'Privacy policy',
    'Terms of use'
  ])
    assert.match(words, new RegExp(label))
  assert.match(words, /tracy\.ai\/de\/help\/faq/)
  assert.match(words, /Questions and feedback on Discord/)
  // Each Open button is named by its row for a screen reader.
  assert.match(html, /aria-label="Open Help center"/)
})

test('an app from before the bridge shows its version and asks for an update, not the web line', () => {
  const words = text(lib.view({ surface: { kind: 'old-app', version: '0.2.0' } }))
  assert.match(words, /App 0\.2\.0/)
  assert.match(words, /Update the app to manage updates here\./)
  assert.doesNotMatch(words, /on the web/)
})

test('the app card: version and the Dev chip on the dev channel, no chip on stable', () => {
  assert.match(
    text(lib.view({ surface: app() })),
    /Tracy Cowork Dev Claude Design, but for CMS App 0\.3\.0-dev\.4/
  )
  const stable = text(lib.view({ surface: app({}, { channel: 'stable', version: '0.3.0' }) }))
  assert.match(stable, /Tracy Cowork Claude Design, but for CMS App 0\.3\.0/)
})

const STATES = [
  ['idle', {}, /Updates have not been checked yet\./, ['Check for updates']],
  [
    'current',
    { status: 'current', lastCheckedAt: NOW - 2 * MIN },
    /You’re up to date\. Last checked 2 minutes ago\./,
    ['Check for updates']
  ],
  ['checking', { status: 'checking' }, /Checking for updates…/, []],
  ['downloading', { status: 'downloading', version: '0.3.0', percent: 42 }, /Downloading 0\.3\.0 — 42%/, []],
  // An app before protocol 3: no install mode, so the Windows sentence; Later is gone either way.
  [
    'downloaded',
    { status: 'downloaded', version: '0.3.0' },
    /Version 0\.3\.0 is ready to install\.$/,
    ['Restart to update']
  ],
  // An old app may still send `postponed`: it is read as plain downloaded.
  [
    'downloaded, an old app’s postponed',
    { status: 'downloaded', version: '0.3.0', postponed: true },
    /Version 0\.3\.0 is ready to install\.$/,
    ['Restart to update']
  ],
  [
    'available-manual',
    { status: 'available-manual', version: '0.3.0' },
    /Version 0\.3\.0 is out\. This copy can’t update itself — download it and replace the app\./,
    ['Download']
  ],
  [
    'error',
    { status: 'error', nextRetryAt: NOW + 10 * MIN },
    /Couldn’t reach the update server\. Trying again in 10 minutes\./,
    ['Try again']
  ],
  ['error, no retry', { status: 'error' }, /Couldn’t reach the update server\.$/, ['Try again']],
  ['installing', { status: 'installing', version: '0.3.0' }, /Restarting to install 0\.3\.0…/, []],
  [
    'install-error',
    { status: 'install-error', version: '0.3.0' },
    /Version 0\.3\.0 could not be installed\./,
    ['Try again']
  ],
  ['off', { status: 'off', autoCheck: false }, /This copy doesn’t update itself\./, []]
]

for (const [name, over, line, buttons] of STATES) {
  test(`app, ${name}: the status line and its buttons`, () => {
    const html = lib.view({ surface: app(over) })
    const status = html.match(/<p class="ts-help-status"[^>]*>([\s\S]*?)<\/p>/)
    assert.ok(status, 'a status line')
    assert.match(text(status[1]), line)
    const actions = html.match(/<div class="ts-help-actions">([\s\S]*?)<\/div>/)
    const labels = actions
      ? [...actions[1].matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
      : []
    // A button that is drawn but locked (checking, downloading) is not offered.
    const enabled = actions
      ? [...actions[1].matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)]
          .filter((m) => !/\sdisabled=""/.test(m[1]))
          .map((m) => text(m[2]))
      : []
    assert.deepEqual(enabled, buttons, labels.join('|'))
  })
}

/** The status line's words and its enabled buttons. */
function statusOf(html) {
  const status = html.match(/<p class="ts-help-status"[^>]*>([\s\S]*?)<\/p>/)
  const actions = html.match(/<div class="ts-help-actions">([\s\S]*?)<\/div>/)
  const buttons = actions
    ? [...actions[1].matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)]
        .filter((m) => !/\sdisabled=""/.test(m[1]))
        .map((m) => text(m[2]))
    : []
  return { line: status ? text(status[1]) : null, tone: status?.[1].match(/data-tone="(\w+)"/)?.[1], buttons }
}

test('downloaded on a Mac or AppImage: installs when you quit once staged, preparing before that', () => {
  const staged = statusOf(
    lib.view({
      surface: app(
        { status: 'downloaded', version: '0.6.1', stagedVersion: '0.6.1' },
        { protocolVersion: 3, installMode: 'quit' }
      )
    })
  )
  assert.equal(staged.line, 'Version 0.6.1 installs when you quit.')
  assert.equal(staged.tone, 'ready')
  assert.deepEqual(staged.buttons, ['Restart to update'])
  // A newer version downloaded while an older one is already staged: the staged one is what quits into.
  assert.equal(
    statusOf(
      lib.view({
        surface: app(
          { status: 'downloaded', version: '0.6.2', stagedVersion: '0.6.1' },
          { protocolVersion: 3, installMode: 'quit' }
        )
      })
    ).line,
    'Version 0.6.1 installs when you quit.'
  )
  const preparing = statusOf(
    lib.view({
      surface: app(
        { status: 'downloaded', version: '0.6.1', stagedVersion: null },
        { protocolVersion: 3, installMode: 'quit' }
      )
    })
  )
  assert.equal(preparing.line, 'Preparing version 0.6.1 to install…')
  assert.equal(preparing.tone, 'ready')
  assert.deepEqual(preparing.buttons, ['Restart to update'])
})

test('downloaded on Windows: ready to install, Restart to update, no Later', () => {
  const win = statusOf(
    lib.view({
      surface: app(
        { status: 'downloaded', version: '0.6.1', stagedVersion: null },
        { protocolVersion: 3, installMode: 'restart' }
      )
    })
  )
  assert.equal(win.line, 'Version 0.6.1 is ready to install.')
  assert.deepEqual(win.buttons, ['Restart to update'])
})

test('the status line is announced politely, and the download has a progress bar with its value', () => {
  const html = lib.view({ surface: app({ status: 'downloading', version: '0.3.0', percent: 42 }) })
  assert.match(html, /class="ts-help-status"[^>]*aria-live="polite"/)
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="42"/)
})

test('desktop update preferences stay out of the UI for either saved value', () => {
  for (const autoCheck of [true, false]) {
    const html = lib.view({ surface: app({ status: 'current', autoCheck }) })
    assert.doesNotMatch(html, /role="switch"|Check for updates automatically|ts-help-download/)
    assert.match(text(html), /Desktop app updates/)
  }
})

test('the waiting version’s notes: as text in a scrollable box, only with a waiting version and notes', () => {
  const notes = 'New\n- <b>Bold</b> & <script>alert(1)</script>\n- two'
  const html = lib.view({ surface: app({ status: 'downloaded', version: '0.3.0', releaseNotes: notes }) })
  assert.match(text(html), /0\.3\.0 — ready to install/)
  const box = html.match(/<div class="ts-help-notes-box"([^>]*)>([\s\S]*?)<\/div>/)
  assert.ok(box)
  assert.match(box[1], /tabindex="0"/)
  assert.match(box[1], /role="region"/)
  assert.doesNotMatch(box[2], /<b>|<script>/)
  assert.match(box[2], /&lt;b&gt;Bold&lt;\/b&gt; &amp; &lt;script&gt;/)
  assert.equal((box[2].match(/<li>/g) ?? []).length, 2)
  assert.deepEqual(noteTitles(lib.view({ surface: app({ status: 'downloaded', version: '0.3.0' }) })), [])
  // An app before protocol 3 sends no notes of its own: with nothing waiting, no box at all.
  assert.doesNotMatch(
    text(lib.view({ surface: app({ status: 'current', releaseNotes: 'x', lastCheckedAt: NOW }) })),
    /What’s new/
  )
  // Not downloaded (a copy that cannot update itself): the notes are what is new, not ready to install.
  const manual = text(
    lib.view({ surface: app({ status: 'available-manual', version: '0.3.0', releaseNotes: 'x' }) })
  )
  assert.match(manual, /What’s new in 0\.3\.0/)
  assert.doesNotMatch(manual, /ready to install/)
})

/** An app at protocol 3 running 0.6.0, with the notes its bundle carries. */
const app3 = (over = {}, info = {}) =>
  app(over, {
    protocolVersion: 3,
    version: '0.6.0',
    channel: 'stable',
    installMode: 'quit',
    releaseNotes: 'Highlights\n- Installs when you quit',
    notesPage: '0.6',
    docsOrigin: 'https://docs.tracy.ai',
    ...info
  })

/** The headings of the notes boxes, top to bottom. */
const noteTitles = (html) =>
  [...html.matchAll(/<h3 class="ts-help-notes-title"[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => text(m[1]))

test('up to date: What’s new in the running version, from the bundle, with Full changelog', () => {
  const html = lib.view({
    surface: { ...app3({ status: 'current', lastCheckedAt: NOW }), changelog: true }
  })
  assert.deepEqual(noteTitles(html), ['What’s new in 0.6.0'])
  assert.match(text(html), /Highlights Installs when you quit/)
  assert.match(html, /<button[^>]*>Full changelog<\/button>/)
  assert.doesNotMatch(html, /ts-help-new/)
  // An app that cannot open the changelog, or a bundle without its page: no button.
  assert.doesNotMatch(
    lib.view({ surface: { ...app3({ status: 'current', lastCheckedAt: NOW }), changelog: false } }),
    /Full changelog/
  )
  assert.doesNotMatch(
    lib.view({
      surface: { ...app3({ status: 'current', lastCheckedAt: NOW }, { notesPage: null }), changelog: true }
    }),
    /Full changelog/
  )
})

test('a version waiting: its notes, ready to install, stand above the running version’s', () => {
  const html = lib.view({
    surface: {
      ...app3({
        status: 'downloaded',
        version: '0.6.1',
        stagedVersion: '0.6.1',
        releaseNotes: '- Fixed a crash'
      }),
      changelog: true
    }
  })
  assert.deepEqual(noteTitles(html), ['0.6.1 — ready to install', 'What’s new in 0.6.0'])
  const boxes = [...html.matchAll(/<div class="ts-help-notes-box"[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
    text(m[1])
  )
  assert.deepEqual(boxes, ['Fixed a crash', 'Highlights Installs when you quit'])
})

test('just moved to a new minor: the running version’s box says New', () => {
  const pending = { pending: true, from: '0.5.1', to: '0.6.0', page: '0.6' }
  const html = lib.view({ surface: app3({ status: 'current', lastCheckedAt: NOW, whatsNew: pending }) })
  assert.deepEqual(noteTitles(html), ['What’s new in 0.6.0 New'])
  assert.match(html, /<span class="ts-help-new">New<\/span>/)
})

test('a bundle without notes: no running-version box, and nothing breaks', () => {
  for (const releaseNotes of [null, undefined, '']) {
    const html = lib.view({ surface: app3({ status: 'current', lastCheckedAt: NOW }, { releaseNotes }) })
    assert.deepEqual(noteTitles(html), [], String(releaseNotes))
    assert.match(text(html), /You’re up to date/)
  }
})

test('the policy: a warning with the date to update by, or no longer supported', () => {
  const policyLine = (html) => {
    const p = html.match(/<p class="ts-help-status ts-help-policy"[^>]*>([\s\S]*?)<\/p>/)
    return p ? { words: text(p[1]), tone: p[1].match(/data-tone="(\w+)"/)?.[1] } : null
  }
  const warn = policyLine(
    lib.view({
      surface: app3({
        status: 'current',
        lastCheckedAt: NOW,
        policy: { level: 'warn', minimumVersion: '0.6.0', after: Date.UTC(2026, 9, 20, 12) }
      })
    })
  )
  assert.deepEqual(warn, {
    words: 'This version stops working on Oct 20, 2026. Update to 0.6.0 or later.',
    tone: 'warn'
  })
  const blocked = policyLine(
    lib.view({
      surface: app3({ status: 'current', policy: { level: 'blocked', minimumVersion: '0.6.0', after: null } })
    })
  )
  assert.deepEqual(blocked, {
    words: 'This version is no longer supported. Update to 0.6.0 or later.',
    tone: 'error'
  })
  assert.equal(
    policyLine(
      lib.view({
        surface: app3({ status: 'current', policy: { level: 'ok', minimumVersion: null, after: null } })
      })
    ),
    null
  )
  assert.equal(policyLine(lib.view({ surface: app({ status: 'current' }) })), null)
})

test('desktop notification preferences stay out of the UI for either saved value', () => {
  for (const showWhatsNew of [true, false]) {
    const html = lib.view({ surface: app3({ status: 'current', showWhatsNew }) })
    assert.doesNotMatch(html, /role="switch"|Notify me what’s new/)
  }
})

test('web download version links to its changelog and respects the operator switch', () => {
  const props = { surface: { kind: 'web' }, build: { desktopVersion: '0.6.0' } }
  const html = lib.view(props)
  assert.match(html, /href="https:\/\/docs\.tracy\.ai\/changelog\/desktop\/0\.6\/"/)
  assert.match(html, /ts-help-version-link ts-help-version-ok/)
  assert.match(text(html), /App 0\.6\.0/)
  assert.doesNotMatch(lib.view({ ...props, downloadShown: false }), /ts-help-download|App 0\.6\.0/)
})

test('an app at protocol 2: today’s section without Later — no new box, switch, line or button', () => {
  const html = lib.view({
    surface: {
      ...app({ status: 'downloaded', version: '0.5.2', releaseNotes: '- one' }, { protocolVersion: 2 }),
      changelog: false
    }
  })
  assert.deepEqual(noteTitles(html), ['0.5.2 — ready to install'])
  assert.deepEqual(statusOf(html).buttons, ['Restart to update'])
  assert.doesNotMatch(html, /Notify me|Full changelog|ts-help-policy|ts-help-new/)
})

// ── the nav ────────────────────────────────────────────────────────────────────────────────────

test('Help & about sits last, under no heading, and carries the dot with words for a screen reader', () => {
  const html = lib.page(
    [
      { id: 'general', order: 0, label: 'General', group: '', badge: null },
      { id: 'tracy-account', order: 20, label: 'Account', group: 'user', badge: null },
      { id: 'tracy-help-about', order: 1000, label: 'Help & about', group: 'help', badge: 'Update available' }
    ],
    'general'
  )
  const items = [...html.matchAll(/<button[^>]*class="ts-nav"[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    text(m[1])
  )
  assert.deepEqual(items, ['Account', 'General', 'Help & about Update available'])
  assert.match(html, /<span class="ts-nav-badge"[^>]*><span class="ts-sr">Update available<\/span><\/span>/)
  const headings = [...html.matchAll(/<p class="ts-nav-group m-0 px-2[^"]*">([^<]+)<\/p>/g)].map((m) => m[1])
  assert.deepEqual(headings, ['User settings', 'Sitespace'])
})

test('?settings=help opens Help & about', () => {
  assert.equal(lib.sectionFromSearch('?settings=help'), 'tracy-help-about')
})

/**
 * A ledger like dsh's: a registration keeps ONLY key, id, order, label and priority
 * (vendor/tracy/deepseek-harness/packages/client/ui-slots/src/index.ts, `StoredEntry.options`) —
 * anything else a registrant passes (a `group`, a `badge`) never reaches a reader.
 */
function fakeCtx(registrations) {
  const keep = ({ key, id, order, label, priority }) =>
    Object.fromEntries(Object.entries({ key, id, order, label, priority }).filter(([, v]) => v !== undefined))
  return {
    slots: {
      entries: () => registrations.map((options) => ({ options: keep(options) })),
      subscribe: () => () => {}
    },
    locale: { subscribe: () => () => {} }
  }
}

test('the nav follows a badge source while the section is not open, and lets go of it', () => {
  const watchers = new Set()
  let value = null
  const badge = {
    getSnapshot: () => value,
    subscribe: (fn) => {
      watchers.add(fn)
      return () => watchers.delete(fn)
    }
  }
  const ui = { keepShown: (ids) => ids, subscribe: () => () => {} }
  const ctx = fakeCtx([
    { id: 'general', order: 0, label: 'General' },
    // What the plugin registers: a `badge` or `group` here would be dropped by dsh, so neither is relied on.
    { id: 'tracy-help-about', order: 1000, label: () => 'Help & about', group: 'help', badge }
  ])
  const projection = lib.createSectionsProjection(ctx, ui, new Map([['tracy-help-about', badge]]))
  let told = 0
  const off = projection.subscribe(() => told++)
  const first = projection.getSnapshot()
  const help = (rows) => rows.find((r) => r.id === 'tracy-help-about')
  assert.equal(help(first).badge, null)
  // Placed in the heading-less last group by its id, since dsh drops the `group` option.
  assert.equal(help(first).group, 'help')
  value = 'Update available'
  for (const fn of watchers) fn()
  assert.equal(told, 1)
  const second = projection.getSnapshot()
  assert.notEqual(second, first)
  assert.equal(help(second).badge, 'Update available')
  // Unchanged: the same array, so React does not re-render for nothing.
  assert.equal(projection.getSnapshot(), second)
  off()
  assert.equal(watchers.size, 0)
})

test('?settings=help with the operator switch off opens the first section instead, never an empty page', () => {
  // The switch removes the row from the projection (keepShown); the page falls back on its own.
  const html = lib.page(
    [{ id: 'general', order: 0, label: 'General', group: '', badge: null }],
    'tracy-help-about'
  )
  assert.match(html, /<h2 class="ts-page-title">General<\/h2>/)
  assert.match(html, /data-rendered="settings.section:general"/)
  assert.doesNotMatch(html, /Help &amp; about/)
})

test('the notes box fits short notes and caps long ones so they scroll', () => {
  const { notesBoxHeight, NOTES_BOX_CAP_PX } = lib.model
  assert.equal(NOTES_BOX_CAP_PX, 150)
  // Two short lines: no fixed height, the box is as tall as its text (no empty band under it).
  assert.equal(notesBoxHeight(64), null)
  assert.equal(notesBoxHeight(150), null)
  // Longer than the cap: fixed at the cap, the rest scrolls (and the reader can still drag it taller).
  assert.equal(notesBoxHeight(151), 150)
  assert.equal(notesBoxHeight(2000), 150)
  // Nothing measured yet (server render, hidden) keeps the cap rather than guessing.
  assert.equal(notesBoxHeight(0), 150)
  assert.equal(notesBoxHeight(Number.NaN), 150)
})

// ── settings.help.item: rows other plugins add (Getting started, Lee 12/10/2026) ────────────────

const ITEM = '<i data-help-item-marker="1"></i>'

test('the help items sit after the update row and its switches, before the release notes', () => {
  const seen = []
  const html = lib.view({
    surface: { ...app3({ status: 'current', lastCheckedAt: NOW, showWhatsNew: true }), changelog: true },
    renderItems: (props) => {
      seen.push(props)
      return lib.createMarker()
    }
  })
  const at = (needle) => {
    const i = html.indexOf(needle)
    assert.ok(i >= 0, `missing ${needle}`)
    return i
  }
  const updates = at('Desktop app updates')
  const item = at(ITEM)
  const notes = at('What’s new in 0.6.0')
  assert.ok(updates < item && item < notes, 'updates, items, notes')
  assert.doesNotMatch(html, /role="switch"/)
  assert.equal(seen.length, 1)
  // The rows' buttons wear the class of the section's own "Check for updates".
  const check = /<button[^>]*class="([^"]+)"[^>]*>Check for updates<\/button>/.exec(html)
  assert.ok(check, "the section's button")
  const unescaped = check[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  assert.equal(seen[0].buttonClassName, unescaped)
})

test('on the web the help items follow the web line, inside the first box, before the links', () => {
  const html = lib.view({ surface: { kind: 'web' }, renderItems: () => lib.createMarker() })
  const item = html.indexOf(ITEM)
  assert.ok(item > html.indexOf('ts-help-row'), 'after the web line')
  assert.ok(item < html.indexOf('ts-help-link'), 'before the links box')
})

test('the section as registered renders the settings.help.item slot, handing over the button class', () => {
  const calls = []
  const html = lib.section(calls)
  const slot = calls.filter(([name]) => name === 'settings.help.item')
  assert.equal(slot.length, 1)
  assert.equal(typeof slot[0][1].buttonClassName, 'string')
  assert.ok(slot[0][1].buttonClassName.length > 0)
  assert.match(html, /data-rendered="settings.help.item"/)
})
