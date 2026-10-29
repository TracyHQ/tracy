/**
 * Sync to live as a flow of the Publish wizard (25/10/2026), moved from the My Sites dialog it replaces
 * (`live-push-dialog.test.mjs` of `@tracy/dsh-my-sites`): the same doors, the same answers, said on the
 * wizard's Review and Send steps instead of in a dialog. The ••• menu's "Sync to live" lands here.
 *
 *   Review  ready, the preview under way, what it found in groups, removals and PHP with their own tick
 *   Send    Confirm with the count, the push under way, its result, Undo asked once more
 *
 * The REAL wizard and its hooks, bundled by esbuild and mounted with React into jsdom; `fetch` is the
 * one thing replaced. The words are the real English table of `@tracy/dsh-site-tabs`.
 *
 *   node --test packages/core/tracy-core/test/publish-push-dom.test.mjs
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
    url: 'http://tracy.test/shop.example/'
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
  // No `act`, as in `error-next-step.test.mjs`: `settle` waits for the ordinary schedule.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'core-publish-push-'))
  const outfile = path.join(outDir, 'push.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { createRoot } from 'react-dom/client'
        export { PublishWizard } from './site-tabs/publish/PublishWizard'
        export { kindsFor, stepsFor, entryKind, entryStep } from './site-tabs/publish/plan'
        export {
          itemLine,
          itemName,
          pushFailureText,
          pushPhaseOf,
          pushStepOf,
          unsupportedReasonText,
          withNotes
        } from './site-tabs/publish/push-words'
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
})

async function mount(element) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  root.render(element)
  await settle()
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

const KEY = 'shop.example'
const PUSH = `GET /api/sites/${KEY}/push`
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
const item = (id, title, extra = {}) => ({ id, kind: 'article', title, ...extra })
const row = (fields) => ({
  id: 'p1',
  state: 'previewed',
  phase: 'preview',
  step: null,
  error: null,
  undoError: null,
  startedAt: ago(2),
  pushedAt: null,
  undoneAt: null,
  expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  preview: null,
  deletes: false,
  result: null,
  undo: null,
  undoable: false,
  maxItems: 200,
  ...fields
})
const PREVIEW = {
  // A new record: the host names every column it writes (dev, 25/10/2026).
  add: [item('a1', 'Opening hours', { fields: ['note', 'urls', 'alias', 'catid', 'state', 'title'] })],
  change: [item('c1', 'About us', { fields: ['title', 'introtext'] })],
  remove: [item('r1', 'Old news'), item('r2', null, { liveId: '12' })],
  unsupported: [{ kind: 'template-file', name: 'templates/cassiopeia/css/user.css' }],
  liveChanged: [item('l1', 'Contact')],
  held: 0,
  limit: 200,
  itemsTotal: 4,
  unsupportedTotal: 1
}

const snapshotOf = ({ platform = 'joomla' } = {}) => ({
  siteKey: KEY,
  siteUrl: `https://${KEY}/`,
  platform,
  role: 'owner',
  state: 'ready',
  values: { title: 'Shop' },
  addressChange: { allowed: true, managedDomain: 'tracy.test', status: 'ready' }
})
const idle = { publishing: null, pressed: null, notice: null, press: () => {}, read: () => {} }

/** The real wizard of an Owner on `KEY`, landed by the ••• menu's "Sync to live" unless told otherwise. */
function wizardOf(props = {}) {
  return lib.createElement(lib.PublishWizard, {
    siteKey: KEY,
    siteName: 'Shop',
    snapshot: snapshotOf(),
    control: idle,
    refresh: () => {},
    role: 'owner',
    imported: true,
    arrival: { entry: 'push', n: 1 },
    t,
    ...props
  })
}

/** The Sync from live door of the same site, never synced: the wizard asks it before any step. */
const SYNC_DOOR = { [`GET /api/sites/${KEY}/sync`]: () => json(200, { available: true, sync: null }) }

/** Open the wizard on Sync to live with `GET …/push` answering `reply` (and the POST doors from `more`). */
async function open(reply, more = {}) {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    host.remove()
  }
  const calls = answer({ ...SYNC_DOOR, [PUSH]: reply, ...more })
  await mount(wizardOf())
  await settle()
  return { calls }
}
const wizard = () => document.querySelector('[data-publish-wizard]')
const stepIs = () => wizard()?.getAttribute('data-publish-step') ?? null
const phase = () => document.querySelector('[data-live-push]')?.getAttribute('data-live-push-phase')
const go = () => document.querySelector('[data-push-go]')
const text = () => wizard()?.textContent ?? ''

test('the ••• menu lands on Sync to live: its own kind, Review first; Back goes to the choice of kind', async () => {
  await open(() => json(200, { available: true, push: null, lastPush: null }))
  assert.equal(wizard().getAttribute('data-publish-kind'), 'live')
  assert.equal(stepIs(), 'push')
  // The step bar: Choose how › Review › Send.
  assert.match(text(), new RegExp(t('flow.name.live')))
  await press(document.querySelector('[data-wizard-back]'))
  assert.equal(stepIs(), 'kind')
  const kinds = [...document.querySelectorAll('[data-publish-kinds] [role="radio"]')]
  assert.equal(kinds.length, 3, 'online, ZIP and Sync to live')
  assert.match(text(), new RegExp(t('flow.kind.live')))
})

test('the plan: Sync to live is a kind only where it is offered, in two steps, and the menu lands on it', () => {
  const facts = { owner: true, syncs: true, domainStep: true, pushes: true }
  assert.deepEqual(lib.kindsFor(facts), ['online', 'zip', 'live'])
  assert.deepEqual(lib.kindsFor({ ...facts, pushes: false }), ['online', 'zip'])
  assert.deepEqual(lib.kindsFor({ ...facts, owner: false }), ['online'])
  assert.deepEqual(lib.stepsFor(facts, 'live'), ['kind', 'push', 'send'])
  assert.equal(lib.entryKind(facts, 'push'), 'live')
  assert.equal(lib.entryStep(facts, 'push'), 'push')
  // Switched off, the menu has no Sync to live row; a stale landing falls back to the ZIP flow.
  assert.equal(lib.entryKind({ ...facts, pushes: false }, 'push'), 'zip')
})

test('a site that is not the Owner’s, or not imported, has no Sync to live kind', async () => {
  answer({ ...SYNC_DOOR, [PUSH]: () => json(200, { available: true, push: null, lastPush: null }) })
  await mount(wizardOf({ imported: false, arrival: null }))
  assert.equal(stepIs(), 'kind')
  assert.equal(document.querySelectorAll('[data-publish-kinds] [role="radio"]').length, 2)
})

test('ready: says what happens first, and the button is Preview changes, which asks for a preview', async () => {
  let previewed = false
  const { calls } = await open(
    () =>
      json(200, {
        available: true,
        push: previewed ? row({ state: 'running', step: 'syncing' }) : null,
        lastPush: null
      }),
    {
      [`POST /api/sites/${KEY}/push/preview`]: () => {
        previewed = true
        return json(202, { push: row({ state: 'running' }) })
      }
    }
  )
  assert.equal(phase(), 'ready')
  assert.match(text(), new RegExp(t('push.status.ready')))
  assert.equal(go().textContent.trim(), t('push.preview'))
  await press(go())
  await settle()
  assert.ok(calls.some((c) => c.key === `POST /api/sites/${KEY}/push/preview`))
  assert.equal(phase(), 'previewing')
  assert.equal(stepIs(), 'push')
  // While the host works, the running list says so; no button that cannot act.
  assert.equal(go(), null)
  assert.ok(document.querySelector('[data-push-step="syncing"]'))
})

test('review: every group named, a removal unticked by default; Continue goes to Send, then Confirm sends no removal', async () => {
  const { calls } = await open(
    () => json(200, { available: true, push: row({ preview: PREVIEW }), lastPush: null }),
    { [`POST /api/sites/${KEY}/push`]: () => json(202, { push: row({ state: 'running', phase: 'apply' }) }) }
  )
  assert.equal(phase(), 'review')
  assert.equal(stepIs(), 'push')
  for (const group of ['add', 'change', 'remove', 'liveChanged', 'unsupported'])
    assert.ok(document.querySelector(`[data-push-group="${group}"]`), `${group} is listed`)
  assert.match(text(), /Will remove \(2\)/)
  assert.match(text(), /Not supported yet \(1\)/)
  assert.match(text(), /Changed on your live site since the last sync \(1\)/)
  // Named, never a bare id: a title, or the kind and the live number when there is none.
  assert.match(text(), /About us/)
  assert.match(text(), /Article #12/)
  // Will add names the record and its kind, never its columns; Will change names the fields changed.
  const added = document.querySelector('[data-push-item="a1"]').textContent
  assert.equal(added, 'Opening hoursArticle')
  assert.match(document.querySelector('[data-push-item="c1"]').textContent, /Article · Title, Content/)
  const boxes = document.querySelectorAll('[data-push-remove]')
  assert.equal(boxes.length, 1, 'one box for the removals')
  assert.notEqual(boxes[0].getAttribute('aria-checked'), 'true', 'removals start unticked')
  assert.match(text(), /Will remove \(2\)/)
  assert.match(
    text(),
    /Also remove these from my live site/,
    'the count is the group\'s, not the tick\'s (no "these 1")'
  )
  assert.equal(go().textContent.trim(), t('push.continue'))
  await press(go())
  assert.equal(phase(), 'confirm')
  assert.equal(stepIs(), 'send')
  assert.match(text(), /2 changes go to your live site: 1 added, 1 changed, 0 removed/)
  assert.equal(go().textContent.trim(), t('push.confirm'))
  assert.ok(!calls.some((c) => c.key === `POST /api/sites/${KEY}/push`), 'nothing is written before Confirm')
  await press(go())
  const sent = calls.find((c) => c.key === `POST /api/sites/${KEY}/push`)
  assert.deepEqual(JSON.parse(sent.body), { previewId: 'p1', confirm: { deletes: false, php: false } })
})

test('Confirm’s Back returns to the groups with nothing sent, the ticks kept', async () => {
  const { calls } = await open(() =>
    json(200, { available: true, push: row({ preview: PREVIEW }), lastPush: null })
  )
  await press(document.querySelector('[data-push-remove]'))
  await press(go())
  assert.equal(stepIs(), 'send')
  await press(document.querySelector('[data-wizard-back]'))
  assert.equal(stepIs(), 'push')
  assert.equal(phase(), 'review')
  assert.equal(document.querySelector('[data-push-remove]').getAttribute('aria-checked'), 'true')
  assert.ok(!calls.some((c) => c.key.startsWith('POST ')))
})

test('files, settings and PHP files: their own groups, names and sizes only; PHP goes only with its own tick; why the rest stays', async () => {
  const preview = {
    ...PREVIEW,
    add: [],
    change: [],
    remove: [],
    liveChanged: [],
    files: [item('f1', 'media/templates/site/cassiopeia/css/user.css', { kind: 'file', size: 2048 })],
    settings: [item('s1', 'Global Configuration', { kind: 'siteIdentity', fields: ['Site Name'] })],
    php: [item('p1', 'media/mod_a/helper.php', { kind: 'file', size: 300 })],
    unsupported: [
      { kind: 'file', name: 'templates/t4/css/custom.css', reason: 'engine-has-no-file-write' },
      { kind: 'file', name: 'images/huge.png', reason: 'too-large', size: 9 * 1024 * 1024 },
      { kind: 'setting', name: 'Permalink structure', reason: 'permalink' }
    ],
    itemsTotal: 3,
    unsupportedTotal: 3
  }
  const { calls } = await open(() => json(200, { available: true, push: row({ preview }), lastPush: null }), {
    [`POST /api/sites/${KEY}/push`]: () => json(202, { push: row({ state: 'running', phase: 'apply' }) })
  })
  assert.equal(phase(), 'review', 'files and settings alone are something to send')
  for (const group of ['files', 'settings', 'php', 'unsupported'])
    assert.ok(document.querySelector(`[data-push-group="${group}"]`), `${group} is listed`)
  assert.match(text(), /Will change files \(1\)/)
  assert.match(text(), /Will change settings \(1\)/)
  assert.match(text(), /PHP files — needs your OK \(1\)/)
  assert.match(text(), /media\/templates\/site\/cassiopeia\/css\/user\.css2 kB/)
  assert.match(text(), /media\/mod_a\/helper\.php300 bytes/, 'a size under 1 kB reads as bytes, plural')
  assert.match(text(), /Also send these PHP files to my live site/)
  assert.match(text(), /Global ConfigurationSetting · Site name/)
  // The unsupported group opens on a press: each named with why.
  await press(document.querySelector('[data-push-group="unsupported"] button'))
  assert.match(text(), /Claude Cowork on your live site cannot write this file/)
  assert.match(text(), /Larger than 8 MB/)
  assert.match(text(), /Page addresses on your live site are never changed/)
  const php = document.querySelector('[data-push-tick="php"]')
  assert.notEqual(php.getAttribute('aria-checked'), 'true', 'PHP starts unticked')
  assert.equal(document.querySelectorAll('[data-push-remove]').length, 0, 'no removals, no removal box')
  await press(go())
  assert.match(text(), /2 changes go to your live site: 0 added, 2 changed, 0 removed/)
  await press(go())
  let sent = calls.filter((c) => c.key === `POST /api/sites/${KEY}/push`).at(-1)
  assert.deepEqual(JSON.parse(sent.body).confirm, { deletes: false, php: false })

  // Once more, with the PHP files ticked: counted, and said to the host.
  const second = await open(
    () => json(200, { available: true, push: row({ id: 'p2', preview }), lastPush: null }),
    {
      [`POST /api/sites/${KEY}/push`]: () => json(202, { push: row({ state: 'running', phase: 'apply' }) })
    }
  )
  await press(document.querySelector('[data-push-tick="php"]'))
  await press(go())
  assert.match(text(), /3 changes go to your live site: 0 added, 3 changed, 0 removed/)
  await press(go())
  sent = second.calls.filter((c) => c.key === `POST /api/sites/${KEY}/push`).at(-1)
  assert.deepEqual(JSON.parse(sent.body).confirm, { deletes: false, php: true })
})

test('template files: under Will change files (PHP under PHP), a parent theme’s file warned; why the rest stays, the live site’s switch named', async () => {
  const preview = {
    ...PREVIEW,
    platform: 'wordpress',
    add: [],
    change: [],
    liveChanged: [],
    remove: [
      item('file:wp-content/themes/astra-child/old.css', 'wp-content/themes/astra-child/old.css', {
        kind: 'file',
        size: 10
      })
    ],
    files: [
      item('file:wp-content/themes/astra-child/style.css', 'wp-content/themes/astra-child/style.css', {
        kind: 'file',
        size: 1024
      }),
      item('file:wp-content/themes/astra/style.css', 'wp-content/themes/astra/style.css', {
        kind: 'file',
        size: 512,
        warning: 'parent-theme'
      })
    ],
    php: [
      item(
        'file:wp-content/themes/astra-child/functions.php',
        'wp-content/themes/astra-child/functions.php',
        { kind: 'file', size: 300 }
      )
    ],
    unsupported: [
      { kind: 'file', name: 'wp-content/themes/astra-child/header.php', reason: 'php-disabled' },
      {
        kind: 'file',
        name: 'wp-content/themes/astra-child/big.css',
        reason: 'too-large',
        size: 3 * 1024 * 1024,
        limit: 2 * 1024 * 1024
      },
      { kind: 'file', name: 'wp-content/themes/twentytwentyfive/style.css', reason: 'not-a-live-template' },
      { kind: 'file', name: 'wp-content/themes/astra-child/readme.txt', reason: 'not-a-template-file' }
    ],
    itemsTotal: 4,
    unsupportedTotal: 4
  }
  await open(() => json(200, { available: true, push: row({ preview }), lastPush: null }))
  assert.equal(phase(), 'review')
  const files = document.querySelector('[data-push-group="files"]').textContent
  assert.match(files, /Will change files \(2\)/)
  assert.match(files, /wp-content\/themes\/astra-child\/style\.css/)
  assert.match(files, new RegExp(t('push.warning.parentTheme')))
  assert.match(document.querySelector('[data-push-group="php"]').textContent, /functions\.php/)
  assert.match(document.querySelector('[data-push-group="remove"]').textContent, /old\.css/)
  await press(document.querySelector('[data-push-group="unsupported"] button'))
  // WordPress words its switch the way its settings page does.
  assert.match(text(), /“Allow PHP in theme files” in Settings › Claude Cowork/)
  assert.match(text(), /Larger than 2 MB, the most Claude Cowork on your live site takes for one file/)
  assert.match(text(), new RegExp(t('push.reason.notLiveTemplate')))
  assert.match(text(), new RegExp(t('push.reason.notTemplateFile')))
})

test('a push the live site refused for its switch says where to turn it on; a failure shows why it stopped', async () => {
  const preview = { ...PREVIEW, platform: 'joomla' }
  const result = {
    pushed: [
      item('file:templates/ja_vega/css/custom.css', 'templates/ja_vega/css/custom.css', { kind: 'file' })
    ],
    conflicts: [],
    failed: [
      item(
        'file:templates/ja_vega/html/mod_menu/default.php',
        'templates/ja_vega/html/mod_menu/default.php',
        {
          kind: 'file',
          code: 'php_disabled'
        }
      )
    ],
    skipped: []
  }
  await open(() =>
    json(200, {
      available: true,
      push: row({ state: 'pushed', phase: 'apply', pushedAt: ago(1), preview, result, undoable: true }),
      lastPush: null
    })
  )
  assert.equal(phase(), 'pushed')
  assert.equal(stepIs(), 'send', 'a push already made lands on its result')
  assert.match(
    document.querySelector('[data-push-group="failed"]').textContent,
    /“Allow PHP in template files” in the Claude Cowork options/
  )

  // An Apply stopped after some writes by a live PHP too old for Claude Cowork: the partial result
  // says which PHP it runs and which it needs, the code beside it for support.
  await open(() =>
    json(200, {
      available: true,
      push: row({
        id: 'p8',
        state: 'failed',
        phase: 'apply',
        error: 'LIVE_PHP_TOO_OLD',
        php: { php: '7.3.33', min: '7.4.0' },
        pushedAt: ago(1),
        preview,
        result: { ...result, failed: [] }
      }),
      lastPush: null
    })
  )
  assert.equal(phase(), 'pushed')
  assert.ok(
    document.body.textContent.includes(t('sync.error.livePhpTooOld', { php: '7.3.33', min: '7.4.0' })),
    document.body.textContent
  )

  // A preview that stopped: its code and why, one line for support, on the Review step.
  const detail = 'SqlError: ERROR 1267 (HY000) at line 125: Illegal mix of collations'
  await open(() =>
    json(200, {
      available: true,
      push: row({ id: 'p9', state: 'failed', error: 'CHANGESET_FAILED', errorDetail: detail }),
      lastPush: null
    })
  )
  assert.equal(phase(), 'failed')
  assert.equal(stepIs(), 'push')
  const code = [...document.querySelectorAll('[data-push-code]')].at(-1).textContent
  assert.match(code, /CHANGESET_FAILED — SqlError: ERROR 1267/)
  assert.equal(go().textContent.trim(), t('push.previewAgain'))
})

test('a push that wrote nothing says so — never a success of "0 changes"; one open in an editor names whose, and what to do', async () => {
  // The Owner's push on dev, 26/10/2026: the Hero module open in the live site's editor.
  const result = {
    pushed: [],
    conflicts: [
      item('module:441', 'Home - Hero', {
        kind: 'module',
        liveId: '441',
        reason: 'open-in-editor',
        lockedBy: 'Victor Luu',
        fields: []
      }),
      item('article:7', 'About us', { liveId: '7', reason: 'gone-on-live', fields: [] }),
      item('article:8', 'Contact', { liveId: '8', reason: 'changed-on-live', fields: ['title'] })
    ],
    failed: [],
    skipped: []
  }
  await open(() =>
    json(200, {
      available: true,
      push: row({
        state: 'pushed',
        phase: 'apply',
        pushedAt: ago(1),
        preview: PREVIEW,
        result,
        undoable: false
      }),
      lastPush: null
    })
  )
  assert.equal(phase(), 'pushed')
  const notice = document.querySelector('[data-push-nothing-sent]')
  assert.ok(notice, 'the nothing-sent notice')
  assert.match(notice.textContent, new RegExp(t('push.status.nothingSent')))
  assert.match(notice.textContent, /open in an editor on your live site/)
  assert.doesNotMatch(text(), new RegExp(t('push.status.pushed')), 'no "Synced to live"')
  const open_ = document.querySelector('[data-push-group="open"]').textContent
  assert.match(open_, /Home - Hero/)
  assert.match(open_, /open by Victor Luu/)
  const changed = document.querySelector('[data-push-group="conflicts"]').textContent
  assert.match(changed, /About us/)
  assert.match(changed, /deleted on your live site/)
  assert.match(changed, /Contact/)
  assert.doesNotMatch(changed, /Home - Hero/, 'the open one is not said to have changed')
  assert.equal(go().textContent.trim(), t('push.previewAgain'))

  // Nothing open, nothing written: the plain words, still no success.
  await open(() =>
    json(200, {
      available: true,
      push: row({
        state: 'pushed',
        phase: 'apply',
        pushedAt: ago(1),
        preview: PREVIEW,
        result: { ...result, conflicts: result.conflicts.slice(2) }
      }),
      lastPush: null
    })
  )
  assert.match(
    document.querySelector('[data-push-nothing-sent]').textContent,
    new RegExp(t('push.status.nothingSentBody').slice(0, 30))
  )
  assert.equal(document.querySelector('[data-push-group="open"]'), null)
})

test('ticking the removals sends them, counted at Confirm', async () => {
  const { calls } = await open(
    () => json(200, { available: true, push: row({ preview: PREVIEW }), lastPush: null }),
    {
      [`POST /api/sites/${KEY}/push`]: () => json(202, { push: row({ state: 'running', phase: 'apply' }) })
    }
  )
  await press(document.querySelector('[data-push-remove]'))
  assert.equal(document.querySelector('[data-push-remove]').getAttribute('aria-checked'), 'true')
  await press(go())
  assert.match(text(), /4 changes go to your live site: 1 added, 1 changed, 2 removed/)
  await press(go())
  const sent = calls.find((c) => c.key === `POST /api/sites/${KEY}/push`)
  assert.equal(JSON.parse(sent.body).confirm.deletes, true)
})

test('over the host’s limit: said, not refused; the first ones go now', async () => {
  await open(() =>
    json(200, { available: true, push: row({ preview: PREVIEW, maxItems: 1 }), lastPush: null })
  )
  assert.ok(document.querySelector('[data-push-over-limit]'))
  assert.match(text(), /at most 1 changes at once/)
  assert.equal(go().disabled, false)
})

test('pushing: on the Send step, the two stages with the one under way marked, and no button that cannot act', async () => {
  await open(() =>
    json(200, {
      available: true,
      push: row({ state: 'running', phase: 'apply', step: 'settling' }),
      lastPush: null
    })
  )
  assert.equal(phase(), 'pushing')
  assert.equal(stepIs(), 'send')
  const steps = [...document.querySelectorAll('[data-push-step]')].map((li) => [
    li.getAttribute('data-push-step'),
    li.getAttribute('data-push-step-state')
  ])
  assert.deepEqual(steps, [
    ['writing', 'done'],
    ['settling', 'now']
  ])
  assert.equal(go(), null)
})

test('pushed: what reached the live site, the conflicts named; Undo asks once more, then undoes', async () => {
  const { calls } = await open(
    () =>
      json(200, {
        available: true,
        push: row({
          state: 'pushed',
          phase: 'apply',
          pushedAt: ago(1),
          undoable: true,
          result: {
            pushed: [item('a1', 'Opening hours'), item('c1', 'About us')],
            conflicts: [item('c2', 'Prices', { reason: 'changed-on-live' })],
            failed: [],
            skipped: [item('r1', 'Old news', { reason: 'deletes-not-confirmed' })]
          }
        }),
        lastPush: null
      }),
    {
      [`POST /api/sites/${KEY}/push/p1/undo`]: () =>
        json(202, { push: row({ state: 'running', phase: 'undo' }) })
    }
  )
  assert.equal(phase(), 'pushed')
  assert.match(text(), /2 changes reached your live site/)
  assert.match(text(), /Not sent: changed on your live site \(1\)/)
  assert.match(text(), /Prices/)
  assert.match(text(), /Not sent this time \(1\)/)
  assert.equal(go().textContent.trim(), t('push.previewAgain'))
  await press(document.querySelector('[data-push-undo-ask]'))
  assert.match(text(), new RegExp(t('push.undoConfirm').slice(0, 30)))
  assert.ok(!calls.some((c) => c.key.endsWith('/undo')), 'the first press only asks')
  await press(document.querySelector('[data-push-undo-now]'))
  assert.ok(calls.some((c) => c.key === `POST /api/sites/${KEY}/push/p1/undo`))
})

test('undone: said with what could not be put back', async () => {
  await open(() =>
    json(200, {
      available: true,
      push: row({
        state: 'undone',
        phase: 'undo',
        pushedAt: ago(5),
        undoneAt: ago(1),
        undo: { restored: [item('a1', 'Opening hours')], conflicts: [item('c1', 'About us')], failed: [] }
      }),
      lastPush: null
    })
  )
  assert.equal(phase(), 'undone')
  assert.equal(stepIs(), 'send')
  assert.match(text(), /1 changes on your live site were put back as they were/)
  assert.match(text(), /Not put back: changed again on your live site \(1\)/)
})

test('an older push stays undoable under a newer preview', async () => {
  await open(() =>
    json(200, {
      available: true,
      push: row({ id: 'p2', preview: PREVIEW }),
      lastPush: row({
        id: 'p1',
        state: 'pushed',
        phase: 'apply',
        pushedAt: ago(10),
        undoable: true,
        result: { pushed: [item('a1', 'Opening hours')], conflicts: [], failed: [], skipped: [] }
      })
    })
  )
  assert.equal(phase(), 'review')
  assert.match(text(), /Last sync to live 10 minutes ago: 1 changes/)
  assert.ok(document.querySelector('[data-push-undo-ask]'))
})

test('expired, held, unavailable: each says so; no dead button', async () => {
  await open(() =>
    json(200, { available: true, push: row({ state: 'expired', preview: PREVIEW }), lastPush: null })
  )
  assert.equal(phase(), 'expired')
  assert.equal(go().textContent.trim(), t('push.previewAgain'))
  await open(() => json(200, { available: true, push: row({ state: 'held' }), lastPush: null }))
  assert.equal(phase(), 'held')
  assert.match(text(), new RegExp(t('push.status.held')))
  assert.equal(go(), null)
  await open(() => json(200, { available: false, why: 'platform', push: null, lastPush: null }))
  assert.equal(phase(), 'unavailable')
  assert.match(text(), /imported WordPress and Joomla sites/)
  assert.equal(go(), null)
})

test('a refused press says why in words, the code kept for support', async () => {
  await open(() => json(200, { available: true, push: null, lastPush: null }), {
    [`POST /api/sites/${KEY}/push/preview`]: () => json(409, { code: 'PUSH_SITE_BUSY', holder: 'editor@x.y' })
  })
  await press(go())
  await settle()
  assert.match(text(), new RegExp(t('push.error.busy')))
  assert.match(text(), /Code for support: PUSH_SITE_BUSY/)
})

test('the pure parts: phases from answers, the step each is drawn on, failure words, names', () => {
  const answer = (push) => ({ available: true, push, lastPush: null })
  const no = { unreadable: false, confirming: false }
  assert.equal(lib.pushPhaseOf(null, no), 'loading')
  assert.equal(lib.pushPhaseOf(answer(null), { unreadable: true, confirming: false }), 'unreadable')
  assert.equal(
    lib.pushPhaseOf(answer(row({ preview: { ...PREVIEW, add: [], change: [], remove: [] } })), no),
    'nothing'
  )
  assert.equal(lib.pushPhaseOf(answer(row({ state: 'running', phase: 'undo' })), no), 'undoing')
  assert.equal(
    lib.pushPhaseOf(
      answer(
        row({
          state: 'failed',
          phase: 'apply',
          result: { pushed: [item('a', 'A')], conflicts: [], failed: [], skipped: [] }
        })
      ),
      no
    ),
    'pushed',
    'a push that stopped part way reads as its result, with Undo'
  )
  for (const p of [
    'loading',
    'unreadable',
    'unavailable',
    'ready',
    'previewing',
    'held',
    'review',
    'nothing',
    'expired'
  ])
    assert.equal(lib.pushStepOf(p, null), 'push', p)
  for (const p of ['confirm', 'pushing', 'pushed', 'undoing', 'undone'])
    assert.equal(lib.pushStepOf(p, null), 'send', p)
  assert.equal(lib.pushStepOf('failed', row({ state: 'failed', phase: 'preview' })), 'push')
  assert.equal(lib.pushStepOf('failed', row({ state: 'failed', phase: 'apply' })), 'send')
  assert.equal(lib.pushFailureText('PREVIEW_STALE', t), t('push.error.copyChanged'))
  assert.equal(lib.pushFailureText('LIVE_UNREACHABLE', t), t('push.error.liveUnreachable'))
  for (const [code, key] of Object.entries({
    LIVE_BLOCKED: 'sync.error.liveBlocked',
    LIVE_PASSWORD_PROTECTED: 'sync.error.livePassword',
    LIVE_RATE_LIMITED: 'sync.error.liveRateLimited',
    TOKEN_REFUSED: 'sync.error.liveToken'
  }))
    assert.equal(lib.pushFailureText(code, t), t(key))
  assert.equal(
    lib.pushFailureText('LIVE_PHP_TOO_OLD', t, 200, { php: '7.3.33', min: '7.4.0' }),
    t('sync.error.livePhpTooOld', { php: '7.3.33', min: '7.4.0' })
  )
  assert.equal(lib.pushFailureText('LIVE_PHP_TOO_OLD', t), t('sync.error.livePhpTooOldPlain'))
  assert.equal(lib.pushFailureText('NOT_PUSHED', t), t('push.error.notPushed'))
  assert.equal(lib.pushFailureText('WEIRD', t), t('push.failed', { error: 'WEIRD' }))
  assert.equal(lib.itemName({ id: 'x', kind: 'post', title: null }, t), 'Post')
  // A change named in the Owner's words, not the host's columns (dev, 27/10/2026: "post · post_title").
  assert.equal(
    lib.itemLine(
      { id: 'x', kind: 'post', what: 'page', fields: ['post_title', 'post_content', 'zz'] },
      t,
      true
    ),
    'Page · Title, Content, Other details'
  )
  assert.equal(
    lib.itemName(
      { id: 'c', kind: 'post', title: 'Additional CSS · astra', label: 'additionalCss', subject: 'astra' },
      t
    ),
    'Additional CSS · astra'
  )
  assert.equal(
    lib.itemLine({ id: 'p', kind: 'product', fields: ['constructor'] }, t, true),
    'product · Other details'
  )
  assert.equal(lib.unsupportedReasonText('template-files-off', t), t('push.reason.templateFilesOff'))
  assert.equal(
    lib.unsupportedReasonText('template-files-off', t, { platform: 'wordpress' }),
    t('push.reason.templateFilesOffWordpress')
  )
  assert.equal(
    lib.unsupportedReasonText('too-large', t, { limit: 8 * 1024 * 1024 }),
    t('push.reason.tooLarge')
  )
  assert.deepEqual(
    lib.withNotes([{ id: 'k', kind: 'file', title: 'a.css', reason: 'template-files-off' }], t, 'joomla')[0]
      .note,
    t('push.reason.templateFilesOff')
  )
})
