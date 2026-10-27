/**
 * The chip at the head of a chat rendered to markup (`src/client/ModelChip.tsx` `ModelChipView`):
 * the words for each state, vendor names and model ids kept verbatim, and nothing at all when the
 * chip has nothing true to say. Bundled with esbuild and rendered with `react-dom/server`.
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
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-model-chip-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { ModelChipView } from './ModelChip'
        import { en } from './strings'
        const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
        export function view(chip) { return renderToStaticMarkup(createElement(ModelChipView, { t, chip })) }
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** @param {string} html */
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'")

test('a chat on a plan reads "<vendor> · <model id>", both verbatim', () => {
  const html = lib.view({ kind: 'plan', vendor: 'ChatGPT Codex', model: 'gpt-6-sol' })
  assert.equal(text(html), 'ChatGPT Codex · gpt-6-sol')
  assert.match(html, /data-model-chip="plan"/)
  // A narrow header drops the vendor half by its own span; the full label stays in the title.
  assert.match(html, /<span class="tracy-model-chip-vendor">ChatGPT Codex · <\/span>gpt-6-sol/)
  assert.match(html, /title="ChatGPT Codex · gpt-6-sol"/)
})

test('a chat that has not sent anything yet names only the vendor of the plan it will use', () => {
  assert.equal(text(lib.view({ kind: 'plan', vendor: 'Claude' })), 'Claude')
})

test('a chat on the deployment model reads "Tracy model" and names no vendor model', () => {
  const html = lib.view({ kind: 'tracy' })
  assert.equal(text(html), 'Tracy model')
  assert.doesNotMatch(html, /deepseek/i)
})

test('a chat whose plan is gone reads "<vendor> · Reconnect", with the way back in its title', () => {
  const html = lib.view({ kind: 'reconnect', vendor: 'Claude' })
  assert.equal(text(html), 'Claude · Reconnect')
  assert.match(html, /data-model-chip="reconnect"/)
  assert.match(
    html,
    /title="The Claude plan this chat runs on is not connected\. Reconnect it in Settings › AI accounts\."/
  )
})

test('no chip, no markup', () => {
  assert.equal(lib.view(undefined), '')
})

/**
 * The chip mounted (`ModelChip`), reading the chat's route from `/api/seat-plan/session`
 * (`apps/tracy-web/src/seat-plan/broker.js` `inspect`): a chat on Tracy AI because Tracy AI is the
 * configured default (`route: null`, or a plain pin) says only "Tracy model"; a chat put on Tracy AI
 * after a failover (`provider 'seat-plan-tracy'` with `switchedFrom`, possible from its first turn
 * when the Default is cooling down) adds where it came from. No "usage limits" sentence anywhere.
 */
import { realpathSync } from 'node:fs'
import { afterEach, beforeEach } from 'node:test'

const repo = path.resolve(here, '..', '..', '..', '..')

function loadJsdom() {
  for (const home of ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']) {
    try {
      return createRequire(path.join(repo, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error('jsdom is not installed in the workspace; run pnpm install')
}

const MOUNT_SOURCE = `
  import { createElement, act } from 'react'
  import { createRoot } from 'react-dom/client'
  import { ModelChip } from './ModelChip'
  import { en } from './strings'
  const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
  export { act }
  export function mount(container, selection) {
    const root = createRoot(container)
    act(() => root.render(createElement(ModelChip, { t, sessionId: 's1', useProjection: () => selection })))
    return () => act(() => root.unmount())
  }
`
let mountDir = ''
let mountFile = ''
/** @type {any} */
let dom
/** @type {any} */
let mountLib
/** @type {(() => void) | undefined} */
let unmount
/** What `/api/seat-plan/session` answers. */
/** @type {any} */
let session

before(async () => {
  mountDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'tracy-model-chip-mount-')))
  mountFile = path.join(mountDir, 'chip.cjs')
  await require('esbuild').build({
    stdin: { contents: MOUNT_SOURCE, resolveDir: clientDir, loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    define: { __TAILWIND_CSS__: '""' },
    loader: { '.css': 'empty' },
    outfile: mountFile,
    logLevel: 'silent'
  })
})

beforeEach(() => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Event']) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.fetch = async (url) => {
    const at = String(url)
    if (at.startsWith('/api/seat-plan/session'))
      return { ok: true, status: 200, json: async () => ({ route: session }) }
    if (at === '/api/seat-plan/status') return { ok: false, status: 404, json: async () => ({}) }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  delete require.cache[mountFile]
  mountLib = require(mountFile)
})

afterEach(() => {
  unmount?.()
  unmount = undefined
  dom?.window.close()
})

after(() => {
  if (mountDir) rmSync(mountDir, { recursive: true, force: true })
})

async function chip(
  route,
  selection = { lastUsed: { provider: 'deepseek-account', model: 'deepseek-v4' }, next: null }
) {
  session = route
  const container = document.createElement('div')
  document.body.append(container)
  unmount = mountLib.mount(container, selection)
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve))
  mountLib.act(() => {})
  return container
}

test('Tracy AI by configuration (no pin): "Tracy model" alone, no "Switched" line', async () => {
  const root = await chip(null)
  assert.equal(root.querySelector('[data-model-chip]')?.dataset.modelChip, 'tracy')
  assert.equal(root.querySelector('[role="status"]'), null)
  assert.doesNotMatch(root.textContent, /usage limits/i)
})

test('a tracy pin with no switchedFrom (Tracy AI first in the order): "Tracy model" alone', async () => {
  const root = await chip({
    provider: 'seat-plan-tracy',
    model: 'default',
    connectionId: null,
    version: 1,
    switchedFrom: null
  })
  assert.equal(root.querySelector('[data-model-chip]')?.dataset.modelChip, 'tracy')
  assert.equal(root.querySelector('[role="status"]'), null)
})

test('a tracy pin after a failover says where the chat came from, from its first turn on', async () => {
  const root = await chip({
    provider: 'seat-plan-tracy',
    model: 'default',
    connectionId: null,
    version: 1,
    switchedFrom: { vendor: 'Claude', reason: 'limit' }
  })
  assert.equal(root.querySelector('[data-model-chip]')?.dataset.modelChip, 'tracy')
  assert.equal(
    root.querySelector('[role="status"]')?.textContent,
    'Switched from Claude because it reached its usage limit.'
  )
  assert.doesNotMatch(root.textContent, /usage limits/i)
})

test('a plan pin after a failover names the plan and where the chat came from', async () => {
  const root = await chip({
    provider: 'seat-plan-codex',
    model: 'gpt-6-sol',
    connectionId: 'c1',
    version: 2,
    switchedFrom: { vendor: 'Claude', reason: 'limit' }
  })
  assert.equal(root.querySelector('[data-model-chip]')?.textContent, 'gpt-6-sol')
  assert.equal(
    root.querySelector('[role="status"]')?.textContent,
    'Switched from Claude because it reached its usage limit.'
  )
})

test('the failover line says the reason the broker stored: a sign-out, or "unavailable" for any other or none', async () => {
  const pin = (switchedFrom) => ({
    provider: 'seat-plan-tracy',
    model: 'default',
    connectionId: null,
    version: 1,
    switchedFrom
  })
  const line = async (switchedFrom) =>
    (await chip(pin(switchedFrom))).querySelector('[role="status"]')?.textContent
  assert.equal(
    await line({ vendor: 'Claude', reason: 'reconnect' }),
    'Switched from Claude because it was signed out.'
  )
  assert.equal(
    await line({ vendor: 'Claude', reason: 'unavailable' }),
    'Switched from Claude because it was unavailable.'
  )
  // a pin written before the reason was stored
  assert.equal(await line({ vendor: 'Claude' }), 'Switched from Claude because it was unavailable.')
})
