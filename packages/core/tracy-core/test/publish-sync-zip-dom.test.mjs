/**
 * The Sync and ZIP steps of the Publish wizard (23/10/2026), moved from the My Sites dialogs they
 * replace (`live-sync-dialog.test.mjs`, `export-install-code-dom.test.mjs` of `@tracy/dsh-my-sites`):
 * the same doors, the same answers, said on the step instead of in a dialog.
 *
 *   Sync   one status per phase, the footer worded from it, and no button that cannot act; a sync
 *          that brought the original site's changes is said on the page, even after the step left.
 *   ZIP    the install code of a ready package, of an earlier one, and nothing when there is none.
 *
 * The REAL steps and their hooks, bundled by esbuild and mounted with React into jsdom; `fetch` is
 * the one thing replaced. The words are the real English table of `@tracy/dsh-site-tabs`.
 *
 *   node --test packages/core/tracy-core/test/publish-sync-zip-dom.test.mjs
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

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'core-publish-sync-zip-'))
  const outfile = path.join(outDir, 'steps.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { SyncStep } from './site-tabs/publish/SyncStep'
        import { ZipStep } from './site-tabs/publish/ZipStep'
        import { useLiveSync } from './site-tabs/publish/use-live-sync'
        import { useSiteExport } from './site-tabs/publish/use-site-export'
        export { PublishWizard } from './site-tabs/publish/PublishWizard'
        export { PublishView } from './site-tabs/PublishView'
        export { createElement }
        export { createRoot } from 'react-dom/client'
        export { agoText, busyPartsText, failureText, whereText } from './site-tabs/publish/sync-words'
        /** The Sync step over its hook, as the wizard's SyncHost holds them. */
        export function SyncHere({ siteKey, t }) {
          const live = useLiveSync({ siteKey })
          return createElement(SyncStep, { live, onBack: () => {}, onNext: () => {}, t })
        }
        /** The ZIP step over its hook, as the wizard's ZipHost holds them. */
        export function ZipHere({ siteKey, t, expose }) {
          const zip = useSiteExport({ siteKey, backupTitle: 'Before export', syncs: false })
          if (expose) expose(zip)
          return createElement(ZipStep, { zip, onBack: () => {}, t })
        }
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

// ── Sync ────────────────────────────────────────────────────────────────────────────────────────

const SYNC = 'GET /api/sites/shop.example/sync'
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
const sync = (fields) => ({
  conflicts: [],
  kept: [],
  held: [],
  summary: null,
  step: null,
  error: null,
  liveReadAt: null,
  startedAt: ago(3),
  ...fields
})

/** Open the Sync step with `GET …/sync` answering `reply`; its status and its Sync button. */
async function openSync(reply) {
  const calls = answer({ [SYNC]: reply })
  await mount(lib.createElement(lib.SyncHere, { siteKey: 'shop.example', t }))
  const panel = document.querySelector('[data-live-sync]')
  return {
    calls,
    panel,
    phase: panel?.getAttribute('data-live-sync-phase'),
    text: panel?.textContent ?? '',
    go: document.querySelector('[data-sync-now]')
  }
}

test('Sync, never synced: says so, and the footer button is Sync now', async () => {
  const { phase, text, go } = await openSync(() => json(200, { available: true, sync: null }))
  assert.equal(phase, 'never')
  assert.match(text, new RegExp(t('sync.status.never')))
  assert.equal(go.textContent.trim(), t('sync.now'))
  assert.equal(go.disabled, false)
})

test('Sync, running: the three stages, the one under way marked, and no button that cannot act', async () => {
  const { phase, go } = await openSync(() =>
    json(200, { available: true, sync: sync({ id: 's1', state: 'running', step: 'merging' }) })
  )
  assert.equal(phase, 'running')
  const steps = [...document.querySelectorAll('[data-live-sync-steps] [data-check-step]')].map((li) => [
    li.getAttribute('data-check-step'),
    li.getAttribute('data-check-state')
  ])
  assert.deepEqual(steps, [
    ['reading', 'done'],
    ['merging', 'now'],
    ['applying', 'next']
  ])
  assert.equal(go, null, 'nothing to press while it runs: the button is hidden, not greyed')
})

test('Sync, up to date: when, what came over, and Sync again', async () => {
  const { phase, text } = await openSync(() =>
    json(200, {
      available: true,
      sync: sync({
        id: 's2',
        state: 'applied',
        liveReadAt: ago(5),
        summary: {
          backup: 7,
          files: { fromTheirs: 3, merged: 1 },
          database: { rowsFromTheirs: 12, rowsMerged: 2, rowsDeleted: 1 }
        }
      })
    })
  )
  assert.equal(phase, 'applied')
  assert.match(text, new RegExp(t('sync.status.upToDate')))
  assert.ok(text.includes(t('sync.status.brought', { files: '4', records: '15' })), text)
  assert.match(text, /5 minutes ago/)
  assert.equal(document.querySelector('[data-sync-again]').textContent.trim(), t('sync.again'))
  assert.ok(document.querySelector('[data-publish-next]'), 'Continue goes on to the last step')
})

/** The Sync step after an applied sync that brought `database` (and `files`): its words. */
async function appliedText(database, files = { fromTheirs: 0, merged: 0 }) {
  const { text } = await openSync(() =>
    json(200, {
      available: true,
      sync: sync({
        id: 's-counted',
        state: 'applied',
        liveReadAt: ago(1),
        summary: { backup: 3, files, database }
      })
    })
  )
  return text
}

test('Sync, up to date: a live title change in a table the copy left alone is one record, not "nothing"', async () => {
  // Taken whole (dev, 26/10/2026): the step said "Nothing had changed on your original site".
  const text = await appliedText({
    rowsFromTheirs: 0,
    rowsMerged: 0,
    rowsDeleted: 0,
    tablesFromTheirs: 1,
    records: 1
  })
  assert.ok(text.includes(t('sync.status.brought', { files: '0', records: '1' })), text)
  assert.ok(!text.includes(t('sync.status.nothingNew')), text)
})

test('Sync, up to date: a host that sent row counts only is still not "nothing" when a table came whole', async () => {
  const text = await appliedText({ rowsFromTheirs: 0, rowsMerged: 0, rowsDeleted: 0, tablesFromTheirs: 1 })
  assert.ok(!text.includes(t('sync.status.nothingNew')), text)
})

test('Sync, up to date: versions, logs and stamps only are small changes, not records', async () => {
  const text = await appliedText({
    rowsFromTheirs: 1,
    rowsMerged: 9,
    rowsDeleted: 0,
    tablesFromTheirs: 1,
    records: 0
  })
  assert.ok(text.includes(t('sync.status.broughtSmall')), text)
})

test('Sync, up to date: nothing at all came over: nothing had changed', async () => {
  const text = await appliedText({
    rowsFromTheirs: 0,
    rowsMerged: 0,
    rowsDeleted: 0,
    tablesFromTheirs: 0,
    records: 0
  })
  assert.ok(text.includes(t('sync.status.nothingNew')), text)
})

test('Sync, failed: the reason in words, the code for support, and Try again', async () => {
  const { phase, text, go } = await openSync(() =>
    json(200, { available: true, sync: sync({ id: 's3', state: 'failed', error: 'LIVE_BUSY' }) })
  )
  assert.equal(phase, 'failed')
  assert.match(text, new RegExp(t('sync.status.failed')))
  assert.ok(text.includes(t('sync.error.liveBusy')), text)
  assert.ok(text.includes(t('sync.status.code', { code: 'LIVE_BUSY' })), text)
  assert.equal(go.textContent.trim(), t('sync.retry'))
})

test('Sync, running: each stage ended says how long it took, and the one under way how long so far (#1649)', async () => {
  // Started ten minutes ago: read for eight, merging for the two since.
  const startedAt = new Date(Date.now() - 600_000).toISOString()
  await openSync(() =>
    json(200, {
      available: true,
      sync: sync({
        id: 's1',
        state: 'running',
        step: 'merging',
        startedAt,
        timing: {
          steps: [
            { at: 0, step: 'reading the live site', stage: 'reading' },
            { at: 480, step: 'the live site read', stage: 'reading' },
            { at: 481, step: 'the copy: sealing its files', stage: 'merging' }
          ],
          read: null
        }
      })
    })
  )
  const seconds = Object.fromEntries(
    [...document.querySelectorAll('[data-live-sync-step]')].map((li) => [
      li.getAttribute('data-live-sync-step'),
      li.getAttribute('data-live-sync-step-seconds')
    ])
  )
  assert.equal(seconds.reading, '481')
  assert.ok(Math.abs(Number(seconds.merging) - 119) <= 3, `merging so far: ${seconds.merging}`)
  assert.equal(seconds.applying, null, 'a stage not begun says no time')
  assert.match(document.querySelector('[data-live-sync-step="reading"]').textContent, /8 min/)
})

test('Sync, running with no timing yet (an older host): the stages, and no time made up', async () => {
  await openSync(() =>
    json(200, { available: true, sync: sync({ id: 's1', state: 'running', step: 'reading' }) })
  )
  const steps = document.querySelectorAll('[data-live-sync-step]')
  assert.equal(steps.length, 3)
  for (const li of steps) assert.equal(li.getAttribute('data-live-sync-step-seconds'), null)
})

test('Sync, failed LIVE_BUSY: which part of the original site kept changing, in words (#1664)', async () => {
  const { text } = await openSync(() =>
    json(200, {
      available: true,
      sync: sync({
        id: 's4',
        state: 'failed',
        error: 'LIVE_BUSY',
        busy: { parts: ['settings', 'files', 'nonsense'] }
      })
    })
  )
  assert.ok(text.includes(t('sync.error.liveBusy')), text)
  assert.match(text, /What kept changing: site settings and files\./)
  assert.ok(text.includes(t('sync.status.code', { code: 'LIVE_BUSY' })), text)
})

test('Sync, failed LIVE_BUSY from a host that named nothing: no line of parts (#1664)', async () => {
  const { text } = await openSync(() =>
    json(200, { available: true, sync: sync({ id: 's5', state: 'failed', error: 'LIVE_BUSY', busy: null }) })
  )
  assert.doesNotMatch(text, /What kept changing/)
  assert.equal(lib.busyPartsText([], t), '')
  assert.equal(
    lib.busyPartsText(['other', 'content'], t),
    t('sync.error.liveBusyParts', { parts: 'pages and posts and other data' })
  )
})

test('Sync: a kept place inside a JSON column names the key both changed, and how many more', () => {
  const base = { id: 'x', kind: 'column', table: 'ng_modules', column: 'params', key: { id: '441' } }
  assert.equal(lib.whereText(base, t), 'Module #441 · Settings')
  assert.equal(
    lib.whereText({ ...base, fields: ['jatools-config › tb-hero › tb-hero[title]'] }, t),
    'Module #441 · Settings › tb-hero[title]'
  )
  assert.equal(
    lib.whereText({ ...base, fields: ['jatools-config › tb-hero › tb-hero[title]', 'cache', 'style'] }, t),
    'Module #441 · Settings › tb-hero[title] +2'
  )
})

/** Open the Sync step on an applied sync and unfold its lists; the step's element. */
async function openApplied(fields) {
  const { panel } = await openSync(() =>
    json(200, {
      available: true,
      sync: sync({ id: 'applied-1', state: 'applied', liveReadAt: ago(1), summary: {}, ...fields })
    })
  )
  for (const trigger of panel.querySelectorAll(
    '[data-live-sync-kept] button, [data-live-sync-dropped] button'
  ))
    await press(trigger)
  return panel
}

test('Sync, after Sync anyway: every content record the copy did not take is named, with why; never a log row (#1648)', async () => {
  const panel = await openApplied({
    dropped: [
      {
        id: 'db:ng_phocacart_products:["6"]',
        kind: 'row',
        table: 'ng_phocacart_products',
        reason: 'added-both',
        key: { id: '6' },
        values: {
          base: null,
          ours: { title: { text: 'Tracy mug' } },
          theirs: { title: { text: 'Live mug' } }
        }
      },
      {
        id: 'held:ng_x.item_id=4',
        kind: 'reference',
        table: 'ng_x',
        column: 'item_id',
        reason: 'unhandled-reference',
        live: 4
      },
      {
        id: 'db:ng_action_logs:["37"]',
        kind: 'row',
        table: 'ng_action_logs',
        reason: 'log-added-both',
        key: { id: '37' }
      }
    ]
  })
  const list = panel.querySelector('[data-live-sync-dropped]')
  assert.ok(list, 'the list is there')
  const text = list.textContent
  assert.ok(text.includes(t('sync.dropped', { count: '2' })), text)
  assert.ok(text.includes(t('sync.heldRow', { table: 'ng_phocacart_products', id: '6' })))
  assert.ok(text.includes(`${t('sync.keptLive')} Live mug`))
  assert.ok(text.includes(t('sync.dropReason.addedBoth')))
  assert.ok(text.includes(t('sync.heldReference', { table: 'ng_x', column: 'item_id', id: '4' })))
  assert.ok(text.includes(t('sync.dropReason.reference')))
  assert.ok(!text.includes('ng_action_logs'), 'a skipped log row is not shown')
})

test('Sync, kept places read: a setting’s two values, a JSON column’s keys, a menu’s two orders, a whole table (#1648)', async () => {
  const panel = await openApplied({
    kept: [
      {
        id: 'file:configuration.php#sitename',
        kind: 'setting',
        path: 'configuration.php',
        setting: 'sitename',
        ours: "'Shop (Tracy)'",
        theirs: "'Shop \\'n Co'"
      },
      {
        id: 'db:ng_template_styles:["12"]:params',
        kind: 'column',
        table: 'ng_template_styles',
        column: 'params',
        key: { id: '12' },
        fields: ['logo'],
        fieldValues: [{ path: 'logo', ours: 'tracy.png', theirs: null }],
        values: { ours: { params: { text: '{"logo":"tracy.png"}' } }, theirs: { params: { text: '{}' } } }
      },
      {
        id: 'db:ng_menu:order:["1"]',
        kind: 'order',
        table: 'ng_menu',
        key: { parent_id: '1' },
        ours: ['Privacy', 'Legal'],
        theirs: ['Legal', 'Privacy']
      },
      { id: 'db:ng_loose', kind: 'table', table: 'ng_loose', reason: 'no-primary-key' }
    ]
  })
  const item = (id) =>
    [...panel.querySelectorAll('[data-kept]')].find((li) => li.dataset.kept === id).textContent
  const setting = item('file:configuration.php#sitename')
  assert.ok(setting.includes(`${t('sync.keptTracy')} Shop (Tracy)`), setting)
  assert.ok(setting.includes(`${t('sync.keptLive')} Shop 'n Co`), setting)
  assert.ok(!setting.includes(t('sync.deleted')))
  const params = item('db:ng_template_styles:["12"]:params')
  assert.ok(params.includes(`${t('sync.keptTracy')} tracy.png`), params)
  assert.ok(params.includes(`${t('sync.keptLive')} ${t('sync.deleted')}`), params)
  assert.ok(!params.includes('{"logo"'), 'no raw JSON')
  const order = item('db:ng_menu:order:["1"]')
  assert.ok(order.includes(t('sync.keptOrder')))
  assert.ok(order.includes(`${t('sync.keptTracy')} Privacy, Legal`), order)
  assert.ok(order.includes(`${t('sync.keptLive')} Legal, Privacy`), order)
  const table = item('db:ng_loose')
  assert.ok(table.includes(t('sync.keptTable')))
  assert.ok(!table.includes(t('sync.deleted')), 'never “deleted / deleted”')
})

test('Sync, not here (not connected): the reason, Continue, and no Sync button', async () => {
  const { phase, text, go } = await openSync(() =>
    json(200, { available: false, why: 'not-connected', sync: null })
  )
  assert.equal(phase, 'unavailable')
  assert.ok(text.includes(t('sync.why.not-connected')), text)
  assert.equal(go, null)
  assert.ok(document.querySelector('[data-publish-next]'))
})

test('Sync, a door that does not answer: said, with Try again that asks again; no Sync button', async () => {
  let asked = 0
  const { phase, text, go, calls } = await openSync(() => {
    asked++
    return asked === 1 ? json(500, { code: 'BOOM' }) : json(200, { available: true, sync: null })
  })
  assert.equal(phase, 'unreadable')
  assert.match(text, /BOOM/)
  assert.equal(go, null)
  await press(t('sync.retry'))
  assert.equal(document.querySelector('[data-live-sync]').getAttribute('data-live-sync-phase'), 'never')
  assert.equal(calls.filter((c) => c.key === SYNC).length, 2)
})

test('Sync, records held for a decision: the list and Sync anyway, no Sync button', async () => {
  const { phase, go } = await openSync(() =>
    json(200, {
      available: true,
      sync: sync({
        id: 's4',
        state: 'needs_resolution',
        held: [
          {
            id: 'db:jos_forms:["4"]',
            kind: 'row',
            table: 'jos_forms',
            reason: 'added-both',
            key: { id: '4' }
          }
        ]
      })
    })
  )
  assert.equal(phase, 'held')
  assert.ok(document.querySelector('[data-sync-allow-held]'))
  assert.ok(document.querySelector('[data-held]'))
  assert.equal(go, null)
})

test('Sync, a refused press says why in words, not a code alone', async () => {
  answer({
    [SYNC]: () => json(200, { available: true, sync: null }),
    'POST /api/sites/shop.example/sync': () => json(409, { code: 'SYNC_SITE_BUSY', holder: 'owner@x.y' })
  })
  await mount(lib.createElement(lib.SyncHere, { siteKey: 'shop.example', t }))
  await press(t('sync.now'))
  await settle()
  const panel = document.querySelector('[data-live-sync]')
  assert.equal(panel.getAttribute('data-live-sync-phase'), 'failed')
  assert.ok(panel.textContent.includes(t('sync.busy')), panel.textContent)
})

test('every code the host or the door can end a sync with has words of its own or the generic sentence', () => {
  for (const code of [
    'LIVE_BUSY',
    'LIVE_READ_FAILED',
    'SYNC_NO_LIVE_DOOR',
    'COPY_CHANGED',
    'NO_DISK_SPACE',
    'SYNC_AFTER_FAILED',
    'SYNC_SITE_BUSY',
    'MERGE_FAILED'
  ]) {
    const said = lib.failureText(code, t)
    assert.ok(said && !said.includes('⟦'), code)
  }
  // #1563 · #1564: a sync a deploy cut off, and a live site that kept changing, each say so.
  assert.equal(lib.failureText('SYNC_INTERRUPTED', t), t('sync.error.interrupted'))
  assert.equal(lib.failureText('LIVE_BUSY', t), t('sync.error.liveBusy'))
  assert.equal(lib.failureText('APPLY_INTERRUPTED_KEPT', t), t('sync.error.interruptedKept'))
  assert.match(lib.failureText('MERGE_FAILED', t), /MERGE_FAILED/)
  assert.equal(lib.agoText(null), '')
})

/**
 * Press Sync now with `POST …/sync` starting `id`; `GET …/sync` answers never synced until the press,
 * then running once, then `ended`. Resolves with the `tracy:site-synced` events said on the page
 * once the follow has had time to see the end (two polls of 3 s).
 */
async function pressAndFollow(id, ended) {
  let pressed = false
  let reads = 0
  answer({
    [SYNC]: () => {
      if (!pressed) return json(200, { available: true, sync: null })
      reads++
      return json(200, { available: true, sync: reads === 1 ? sync({ id, state: 'running' }) : ended })
    },
    'POST /api/sites/shop.example/sync': () => {
      pressed = true
      return json(202, { sync: sync({ id, state: 'running' }) })
    }
  })
  const said = []
  const hear = (event) => said.push(event.detail)
  window.addEventListener('tracy:site-synced', hear)
  try {
    await mount(lib.createElement(lib.SyncHere, { siteKey: 'shop.example', t }))
    await press(document.querySelector('[data-sync-now]'))
    // The tab goes away while the sync runs: the follow carries on without it.
    for (const { root } of mounted.splice(0)) root.unmount()
    await new Promise((resolve) => setTimeout(resolve, 6600))
    await settle()
  } finally {
    window.removeEventListener('tracy:site-synced', hear)
  }
  return said
}

test('Sync: a sync that brought the original site’s changes is said on the page, even after the step left', async () => {
  const said = await pressAndFollow(
    'brought-1',
    sync({
      id: 'brought-1',
      state: 'applied',
      summary: { files: { fromTheirs: 0, merged: 1 }, database: { rowsFromTheirs: 0, tablesFromTheirs: 1 } }
    })
  )
  assert.deepEqual(said, [{ siteKey: 'shop.example', syncId: 'brought-1' }])
})

test('Sync: a sync that brought nothing is not said, so the previews keep their page', async () => {
  const said = await pressAndFollow(
    'nothing-1',
    sync({
      id: 'nothing-1',
      state: 'applied',
      summary: { files: { fromTheirs: 0, merged: 0 }, database: { rowsFromTheirs: 0, tablesFromTheirs: 0 } }
    })
  )
  assert.deepEqual(said, [])
})

// ── ZIP: the install code ───────────────────────────────────────────────────────────────────────

const SITE = 'lantern.example'
const READY = {
  exportId: '11111111-1111-4111-8111-111111111111',
  version: 7,
  state: 'ready',
  bytes: 4096,
  expiresAt: '2026-10-20T08:00:00.000Z',
  downloaded: false,
  installCode: '042917'
}

/** The ZIP step over a server that answers `latest` and the status of `exports` by id. */
async function openZip({ latest = null, status = {} } = {}) {
  const asked = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), window.location.origin)
    asked.push(url.pathname)
    if (url.pathname === `/api/sites/${SITE}/export/latest`) return json(200, { export: latest })
    const id = url.pathname.split('/').at(-1)
    if (status[id]) return json(200, status[id])
    return json(404, { code: 'EXPORT_UNKNOWN' })
  }
  await mount(lib.createElement(lib.ZipHere, { siteKey: SITE, t }))
  return { asked }
}
const codeBlock = () => document.querySelector('[data-install-code]')
const stage = () => document.querySelector('[data-export-stage]')?.getAttribute('data-export-stage')

test('ZIP: a ready package shows its install code, the copy button and the one line', async () => {
  const { asked } = await openZip({ latest: READY })
  assert.ok(asked.includes(`/api/sites/${SITE}/export/latest`), 'the step asks for the last package')
  assert.equal(stage(), 'ready')
  const block = codeBlock()
  assert.ok(block, 'the install code is shown')
  assert.equal(block.querySelector('[data-install-code-value]').textContent, '042917')
  assert.ok(block.textContent.includes(t('zip.installCode')))
  assert.ok(block.textContent.includes(t('zip.installCodeHint')))
  assert.ok(!block.textContent.includes('⟦'), block.textContent)
  const copy = block.querySelector(`button[aria-label="${t('zip.installCodeCopy')}"]`)
  assert.ok(copy, 'a copy button with its own accessible name')
  const written = []
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (text) => written.push(text) },
    configurable: true
  })
  copy.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await settle()
  assert.deepEqual(written, ['042917'])
  // Said beside the button, in the bar the site address uses: the button itself keeps its width.
  assert.equal(block.querySelector('[data-copied]').textContent, t('publish.copied'))
})

test('ZIP: a package downloaded earlier and since expired starts fresh and still shows its code', async () => {
  await openZip({ latest: { ...READY, state: 'expired', downloaded: true } })
  assert.equal(stage(), 'confirm', 'a new export can be prepared')
  const block = codeBlock()
  assert.ok(block, 'the earlier install code is shown')
  assert.equal(block.querySelector('[data-install-code-value]').textContent, '042917')
  assert.ok(block.textContent.includes(t('zip.installCodeEarlier', { version: 7 })))
})

test('ZIP: no package yet, or one without a code (EmDash): nothing about an install code', async () => {
  await openZip({ latest: null })
  assert.equal(stage(), 'confirm')
  assert.equal(codeBlock(), null)
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    await settle()
    host.remove()
  }
  const { installCode: _, ...emdash } = READY
  await openZip({ latest: emdash })
  assert.equal(stage(), 'ready')
  assert.equal(codeBlock(), null)
})

test('ZIP: the confirm step lists what the package holds as tags and keeps the privacy line, with no collapsible box', async () => {
  await openZip({ latest: null })
  assert.equal(stage(), 'confirm')
  const tags = [...document.querySelectorAll('[data-export-details] li')].map((li) => li.textContent)
  assert.deepEqual(tags, [
    'Fresh backup of files and database',
    'Files over 50 MB included',
    'Up to 1 GiB',
    'README with steps to move the site'
  ])
  assert.equal(
    document.querySelector('[data-export-privacy]')?.textContent,
    'Contains personal data and site secrets. Keep it private.'
  )
  assert.equal(document.querySelector('[data-export-privacy]')?.getAttribute('data-severity'), 'warning')
  assert.equal(document.querySelector('[data-slot="collapsible-trigger"]'), null)
})

test('ZIP: a server that cannot say (an older server, an error) opens on Prepare ZIP', async () => {
  globalThis.fetch = async () => json(404, { code: 'NOT_FOUND' })
  await mount(lib.createElement(lib.ZipHere, { siteKey: SITE, t }))
  assert.equal(stage(), 'confirm')
  assert.equal(codeBlock(), null)
  assert.ok(document.querySelector('[data-export-start]'))
})

// ── ZIP: the stages, moved from `dialogs-fit-360.test.mjs` of My Sites ─────────────────────────

/** Wait until `check` stops throwing, up to `ms`. */
async function until(check, what, ms = 10_000) {
  const end = Date.now() + ms
  for (;;) {
    try {
      return check()
    } catch (error) {
      if (Date.now() > end) throw new Error(`${what}: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

/**
 * The export doors by path, as `dialogs-fit-360.test.mjs` routed them: a fresh backup 2, its export
 * `export-2` ready at once, a code sent, and a link to download. `over` replaces any of them.
 */
function exportServer(over = {}) {
  const count = { backup: 0, code: 0, status: 0, download: 0 }
  globalThis.fetch = async (input, init = {}) => {
    const { pathname } = new URL(String(input), window.location.origin)
    const method = (init.method ?? 'GET').toUpperCase()
    const pick = (name, fallback) => (over[name] ? over[name](count) : fallback())
    if (pathname.endsWith('/export/latest')) return json(200, { export: null })
    if (pathname.endsWith('/backups') && method === 'GET') return json(200, { latest: { version: 1 } })
    if (pathname.endsWith('/backup')) {
      count.backup++
      return json(201, { version: 2 })
    }
    if (pathname.endsWith('/backups/2/export')) return json(202, { exportId: 'export-2' })
    if (pathname.endsWith('/export/export-2')) {
      count.status++
      return pick('status', () => json(200, { state: 'ready' }))
    }
    if (pathname.endsWith('/export/export-2/code')) {
      count.code++
      return pick('code', () => json(200, { challengeId: 'challenge-1' }))
    }
    if (pathname.endsWith('/export/export-2/download')) {
      count.download++
      return pick('download', () => json(200, { url: `${window.location.origin}/download-test` }))
    }
    return json(404, { code: 'NOT_FOUND' })
  }
  return count
}

/** Open the ZIP step and press Prepare ZIP, then Send code; resolves with the hook's latest face. */
async function toCode() {
  const face = { zip: null }
  await mount(lib.createElement(lib.ZipHere, { siteKey: SITE, t, expose: (zip) => (face.zip = zip) }))
  await press(document.querySelector('[data-export-start]'))
  await until(() => assert.equal(stage(), 'ready'), 'the ZIP is ready')
  await press(document.querySelector('[data-export-send-code]'))
  return face
}

test('ZIP: Prepare, Send code, then Download only once six digits are typed, and Downloaded', async () => {
  exportServer()
  const face = await toCode()
  await until(() => assert.equal(stage(), 'code'), 'the code is asked for')
  assert.ok(document.querySelector('[data-export-code]'))
  const download = () => document.querySelector('[data-export-download]')
  assert.equal(download().disabled, true, 'Download waits for six digits')
  face.zip.setCode('12345')
  await settle()
  assert.equal(download().disabled, true, 'five digits are not a code')
  face.zip.setCode('123456')
  await settle()
  assert.equal(download().disabled, false)
  await press(download())
  await until(() => assert.equal(stage(), 'downloaded'), 'downloaded')
  assert.equal(document.querySelector('[data-export-code]'), null)
  assert.ok(document.querySelector('[data-export-downloaded]'))
})

test('ZIP: a non-code refusal of the download shows the failed state, not the code error', async () => {
  exportServer({ download: () => json(409, { code: 'EXPORT_NOT_READY' }) })
  const face = await toCode()
  await until(() => assert.equal(stage(), 'code'), 'the code is asked for')
  face.zip.setCode('123456')
  await settle()
  await press(document.querySelector('[data-export-download]'))
  await until(() => assert.equal(stage(), 'failed'), 'failed')
  assert.equal(document.querySelector('[data-export-code]'), null)
  assert.ok(document.querySelector('[data-export-retry]'), 'Try again')
})

test('ZIP: retrying a failed Send code reuses the ZIP already made', async () => {
  const count = exportServer({
    code: (n) =>
      n.code === 1 ? json(503, { code: 'SERVICE_UNAVAILABLE' }) : json(200, { challengeId: 'c-1' })
  })
  await toCode()
  await until(() => assert.equal(stage(), 'failed'), 'the send failed')
  await press(document.querySelector('[data-export-retry]'))
  await until(() => assert.equal(stage(), 'code'), 'the code is asked for')
  assert.equal(count.code, 2)
  assert.equal(count.backup, 1, 'no second backup')
})

test('ZIP: retrying a failed download checks the ZIP already made before another backup', async () => {
  const count = exportServer({ download: () => json(500, { code: 'INTERNAL_ERROR' }) })
  const face = await toCode()
  await until(() => assert.equal(stage(), 'code'), 'the code is asked for')
  face.zip.setCode('123456')
  await settle()
  const before = count.status
  await press(document.querySelector('[data-export-download]'))
  await until(() => assert.equal(stage(), 'failed'), 'the download failed')
  await press(document.querySelector('[data-export-retry]'))
  await until(() => assert.ok(document.querySelector('[data-export-send-code]')), 'Send code again')
  assert.ok(count.status > before, 'the existing ZIP was read again')
  assert.equal(count.backup, 1, 'no second backup')
})

test('ZIP: a backup whose database copy did not finish says so in words, and Try again makes a new backup', async () => {
  const count = exportServer({
    status: () => json(200, { state: 'failed', error: 'BACKUP_NOT_FULL' })
  })
  await mount(lib.createElement(lib.ZipHere, { siteKey: SITE, t }))
  await press(document.querySelector('[data-export-start]'))
  await until(() => assert.equal(stage(), 'failed'), 'the export failed')
  const notice = document.querySelector('[data-export-failed]')
  const paragraphs = [...notice.querySelectorAll('p')].map((p) => p.textContent)
  assert.deepEqual(paragraphs, [
    'Tracy could not finish a full backup of your site, so the ZIP was not made. Your site files were saved, but the copy of your database did not complete, and a ZIP without it would not work on a new host.',
    'Press Try again to make a new backup. If it stops at the same point again, your site’s database may be unavailable: check that your site opens, then try again in a few minutes.'
  ])
  assert.ok(!notice.textContent.includes('(BACKUP_NOT_FULL)'), 'not the generic sentence with the code')
  assert.ok(document.querySelector('[data-export-retry]'), 'Try again')
  await press(document.querySelector('[data-export-retry]'))
  await until(() => assert.equal(count.backup, 2), 'Try again makes a new backup')
})

// ── The whole wizard: where the menu lands, and what a sync goes on to ─────────────────────────

const KEY = 'shop.example'

/**
 * The doors of one imported Joomla site as `apps/tracy-web` answers them. `door`: the sync door's
 * own answer before any press (`available`, `why`). A press of Sync now answers 202 with a running
 * sync, applied on its second read. `latest`: the package `export/latest` finds.
 */
function wizardServer({ door = { available: true }, latest = null, publishing = null } = {}) {
  let pressed = false
  let reads = 0
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const { pathname } = new URL(String(input), window.location.origin)
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push(`${method} ${pathname}`)
    if (pathname === `/api/sites/${KEY}/settings`) return json(200, snapshotOf({ publishing }))
    if (pathname === `/api/sites/${KEY}/state`) return json(200, { plan: 'standard', ...publishing })
    if (pathname === `/api/sites/${KEY}/sync`) {
      if (method === 'POST') {
        pressed = true
        return json(202, { sync: sync({ id: 'zip-sync-1', state: 'running' }) })
      }
      if (!pressed) return json(200, { ...door, sync: null })
      reads++
      return json(200, {
        available: true,
        sync:
          reads === 1
            ? sync({ id: 'zip-sync-1', state: 'running' })
            : sync({ id: 'zip-sync-1', state: 'applied', liveReadAt: ago(0) })
      })
    }
    if (pathname.endsWith('/export/latest')) return json(200, { export: latest })
    if (pathname.endsWith('/backups') && method === 'GET') return json(200, { latest: { version: 1 } })
    if (pathname.endsWith('/backup') && method === 'POST') return json(201, { version: 2 })
    if (pathname.endsWith('/backups/2/export') && method === 'POST')
      return json(202, { exportId: 'export-2' })
    if (pathname.endsWith('/export/export-2')) return json(200, { state: 'queued' })
    if (pathname.endsWith('/export/export-1')) return json(200, latest ?? { state: 'expired' })
    return json(404, { code: 'NOT_FOUND' })
  }
  return calls
}

const snapshotOf = ({ platform = 'joomla', publishing = null } = {}) => ({
  siteKey: KEY,
  siteUrl: `https://${KEY}/`,
  platform,
  role: 'owner',
  state: 'ready',
  values: { title: 'Shop' },
  addressChange: { allowed: true, managedDomain: 'tracy.test', status: 'ready' },
  ...(publishing ? { publishing } : {})
})
const idle = { publishing: null, pressed: null, notice: null, press: () => {}, read: () => {} }

/** The real wizard of an Owner on `KEY`. */
function wizardOf(props = {}) {
  return lib.createElement(lib.PublishWizard, {
    siteKey: KEY,
    siteName: 'Shop',
    snapshot: snapshotOf(),
    control: idle,
    refresh: () => {},
    role: 'owner',
    imported: true,
    arrival: null,
    t,
    ...props
  })
}
const wizard = () => document.querySelector('[data-publish-wizard]')
const stepIs = () => wizard()?.getAttribute('data-publish-step') ?? null

/** Choose a kind on the first step and press Continue. */
async function chooseKind(at) {
  const radios = document.querySelectorAll('[data-publish-kinds] [role="radio"]')
  await press(radios[at])
  await press(document.querySelector('[data-wizard-continue]'))
}

/**
 * The ZIP flow entered by the person ("Export site as ZIP" in the "…" menu): the flow's Sync step
 * comes first, and a sync pressed there goes on to the export once it is in place, without a press
 * of Prepare ZIP: what "Sync from live, then export" of the old Export dialog did.
 */
test('Sync then ZIP: in the ZIP flow, once the sync started here is applied, the export starts without Prepare ZIP', async () => {
  const calls = wizardServer()
  await mount(wizardOf({ arrival: { entry: 'zip', n: 1 } }))
  assert.equal(wizard().getAttribute('data-publish-kind'), 'zip')
  assert.equal(stepIs(), 'sync')
  await press(document.querySelector('[data-sync-now]'))
  await until(() => assert.equal(stepIs(), 'zip'), 'the wizard moves to the ZIP', 12_000)
  await until(
    () => assert.ok(calls.includes(`POST /api/sites/${KEY}/backups/2/export`), calls.join('\n')),
    'the export is started by itself',
    3_000
  )
  assert.notEqual(stage(), 'confirm', 'not left waiting on Prepare ZIP')
})

test('Sync then ZIP: the ZIP flow chosen on the first step chains the same way', async () => {
  const calls = wizardServer()
  await mount(wizardOf())
  assert.equal(stepIs(), 'kind')
  await chooseKind(1)
  assert.equal(stepIs(), 'sync')
  await press(document.querySelector('[data-sync-now]'))
  await until(() => assert.equal(stepIs(), 'zip'), 'the wizard moves to the ZIP', 12_000)
  await until(
    () => assert.ok(calls.includes(`POST /api/sites/${KEY}/backup`), calls.join('\n')),
    'the export is started by itself',
    3_000
  )
})

/**
 * "Sync from live" in the "…" menu only syncs, as its dialog did (`mode='sync'`): once the sync is
 * applied the step says so and stays; the person goes on to the ZIP and presses Prepare ZIP there.
 */
test('Sync from live (menu): the sync is applied and said on the Sync step; no export is started', async () => {
  const calls = wizardServer()
  await mount(wizardOf({ arrival: { entry: 'sync', n: 1 } }))
  assert.equal(stepIs(), 'sync')
  await press(document.querySelector('[data-sync-now]'))
  await until(
    () =>
      assert.equal(
        document.querySelector('[data-live-sync]')?.getAttribute('data-live-sync-phase'),
        'applied'
      ),
    'the sync is said applied',
    12_000
  )
  await new Promise((resolve) => setTimeout(resolve, 300))
  await settle()
  assert.equal(stepIs(), 'sync', 'the step stays on the result')
  assert.equal(
    calls.some((call) => call.startsWith('POST') && /\/backups?(\/|$)/.test(call)),
    false,
    calls.join('\n')
  )
  // Continue leads to the ZIP, which waits for Prepare ZIP.
  await press(document.querySelector('[data-publish-next]'))
  assert.equal(stepIs(), 'zip')
  await until(() => assert.equal(stage(), 'confirm'), 'Prepare ZIP is offered', 3_000)
})

/**
 * The sync door decides whether the ZIP flow syncs, as the old Export dialog's panel did: a door
 * that answers `available: false` (not connected) leaves the flow as for a site with no sync, and a
 * ready package found there is offered as it is.
 */
test('Sync door says unavailable: the ZIP flow has no Sync step, and a ready package is offered', async () => {
  const ready = { exportId: 'export-1', version: 1, state: 'ready', installCode: '482913' }
  wizardServer({ door: { available: false, why: 'not-connected' }, latest: ready })
  await mount(wizardOf({ arrival: { entry: 'zip', n: 1 } }))
  await until(() => assert.equal(stepIs(), 'zip'), 'the ZIP step', 3_000)
  assert.equal(document.querySelector('[data-wizard-goto="sync"]') === null, true, 'no Sync step is named')
  await until(() => assert.equal(stage(), 'ready'), 'the ready package is offered', 3_000)
})

test('Sync door says unavailable: reached from "Sync from live", the Sync step says why', async () => {
  wizardServer({ door: { available: false, why: 'not-connected' } })
  await mount(wizardOf({ arrival: { entry: 'sync', n: 1 } }))
  await until(() => assert.equal(stepIs(), 'sync'), 'the Sync step', 3_000)
  const panel = document.querySelector('[data-live-sync]')
  assert.equal(panel.getAttribute('data-live-sync-phase'), 'unavailable')
  assert.match(panel.textContent, new RegExp(t('sync.why.not-connected')))
})

/** The sites list says whether the site was imported; until it answers the plan is not made. */
function publishView(props) {
  return lib.createElement(lib.PublishView, {
    siteKey: KEY,
    role: 'owner',
    sites: [],
    onPick: () => {},
    t,
    ...props
  })
}

test('Sites list still loading: no plan is made; once it answers, the menu Sync landing has its Sync step', async () => {
  wizardServer()
  const { root } = await mount(publishView({ sitesState: 'loading', arrival: { entry: 'sync', n: 1 } }))
  await settle()
  assert.equal(wizard() === null, true, 'no wizard while the list is read')
  root.render(
    publishView({
      sites: [{ siteKey: KEY, role: 'owner', platform: 'joomla', imported: true }],
      sitesState: 'ready',
      arrival: { entry: 'sync', n: 1 }
    })
  )
  await until(() => assert.equal(stepIs(), 'sync'), 'the Sync step', 3_000)
})

test('Sites list failed: said with a way to ask again, never a plan without Sync', async () => {
  wizardServer()
  let asked = 0
  await mount(
    publishView({ sitesState: 'failed', onRetrySites: () => asked++, arrival: { entry: 'sync', n: 1 } })
  )
  await settle()
  assert.equal(wizard() === null, true, 'no wizard without the list')
  assert.match(document.body.textContent, new RegExp(t('state.failed')))
  await press(t('action.retry'))
  assert.equal(asked, 1)
})

// ── The domain step ─────────────────────────────────────────────────────────────────────────────

const LIVE = { publish: 'published', mayPublish: true, operation: null }

/** An Owner's live WordPress site, walked to its last step: Your own domain. */
const onWordPress = (control) =>
  wizardOf({ snapshot: snapshotOf({ platform: 'wordpress', publishing: LIVE }), control, imported: false })
async function toDomain(control) {
  wizardServer({ publishing: LIVE })
  const { root } = await mount(onWordPress(control))
  await chooseKind(0)
  assert.equal(stepIs(), 'address')
  await press(document.querySelector('[data-publish-next]'))
  assert.equal(stepIs(), 'domain')
  return root
}

test('Domain step, the last step: Back, and no Skip (there is nothing after it)', async () => {
  await toDomain({ ...idle, publishing: LIVE })
  assert.ok(document.querySelector('[data-wizard-back]'))
  assert.equal(document.querySelector('[data-wizard-skip]') === null, true)
})

test('Domain step while a publish runs: no name field and no Save, the working line instead', async () => {
  const root = await toDomain({ ...idle, publishing: LIVE })
  assert.ok(document.querySelector('[data-own-domain-entry]'), 'the name field, while nothing runs')
  // A publish starts while the step is open (the card's own press, another tab of the same site).
  const running = { ...LIVE, operation: { state: 'running', op: 'live', jobId: 'j1', confirmed: true } }
  root.render(onWordPress({ ...idle, publishing: running }))
  await settle()
  assert.equal(document.querySelector('[data-own-domain-entry]') === null, true, 'no name field')
  assert.equal(document.querySelector('[data-action="save-domain"]') === null, true, 'no Save')
  assert.ok(document.querySelector('[data-publish-step="domain"] [data-working]'), 'the working line')
})

// ── Relative times ──────────────────────────────────────────────────────────────────────────────

test('Sync: "x minutes ago" is redrawn every half minute while the step is open', async () => {
  const realInterval = globalThis.setInterval
  const realNow = Date.now
  const ticks = []
  globalThis.setInterval = (fn, ms, ...rest) => {
    if (ms === 30_000) ticks.push(fn)
    return realInterval(fn, ms, ...rest)
  }
  try {
    await openSync(() =>
      json(200, { available: true, sync: sync({ id: 's1', state: 'applied', liveReadAt: ago(2) }) })
    )
    const line = () => document.querySelector('[data-live-sync] [title]')?.textContent ?? ''
    assert.match(line(), /2 minutes ago/)
    assert.equal(ticks.length, 1, 'one half-minute timer')
    const shifted = realNow() + 3 * 60_000
    Date.now = () => shifted
    ticks[0]()
    await settle()
    assert.match(line(), /5 minutes ago/)
  } finally {
    globalThis.setInterval = realInterval
    Date.now = realNow
  }
})

test('Sync: firewall, HTTP password, rate limit and token each have actionable words', () => {
  const keys = {
    LIVE_BLOCKED: 'sync.error.liveBlocked',
    LIVE_PASSWORD_PROTECTED: 'sync.error.livePassword',
    LIVE_RATE_LIMITED: 'sync.error.liveRateLimited',
    TOKEN_REFUSED: 'sync.error.liveToken'
  }
  for (const [code, key] of Object.entries(keys)) {
    assert.equal(lib.failureText(code, t), t(key))
    assert.ok(!t(key).includes('⟦'))
  }
  assert.equal(new Set(Object.keys(keys).map((code) => lib.failureText(code, t))).size, 4)
})
