/**
 * The cowork's bridge listener (`src/Cowork.tsx`) takes context only from the site pane's own window.
 *
 * `source: 'tracy-bridge'` inside the message is whatever the sender wrote, so before the fix any
 * frame or opener holding a reference to this window could post a fake "picked element" and have it
 * shown (and offered to the agent) as the site's. The listener now compares `event.source` with the
 * site pane iframe's `contentWindow`; the site's own bridge keeps working exactly as before.
 *
 * The component is bundled by esbuild and mounted with React into jsdom; jsdom is resolved from a
 * workspace member that declares it, as in `popover-escape.test.mjs`.
 *
 *   node --test packages/core/tracy-core/test/cowork-bridge-source.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
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

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Event']) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'cowork-bridge-'))
  const outfile = path.join(outDir, 'cowork.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { Cowork } from './Cowork'
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
})

/** A bridge message carrying a marker the context panel would print if it took the message. */
function bridgeMessage(marker) {
  return { source: 'tracy-bridge', id: 'pick', payload: { kind: 'error', message: marker } }
}

/** Synchronous `act` only: the async form leaves a MessageChannel open in this bundle and the run never exits. */
function post(data, source) {
  lib.act(() => {
    window.dispatchEvent(new window.MessageEvent('message', { data, source }))
  })
}

test('a bridge message from any window but the site pane is ignored; the site pane is still heard', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  lib.act(() => {
    root.render(lib.createElement(lib.Cowork, { agentUrl: 'about:blank', siteUrl: 'about:blank' }))
  })
  const frames = host.querySelectorAll('iframe')
  assert.equal(frames.length, 2, 'the agent pane and the site pane')
  const [agentPane, sitePane] = frames
  const frameWindows = [...frames].map((frame) => frame.contentWindow)

  const stranger = document.createElement('iframe')
  document.body.append(stranger)
  post(bridgeMessage('FROM-STRANGER'), stranger.contentWindow)
  post(bridgeMessage('FROM-AGENT-PANE'), agentPane.contentWindow)
  post(bridgeMessage('FROM-NOWHERE'), null)
  assert.doesNotMatch(host.textContent, /FROM-STRANGER|FROM-AGENT-PANE|FROM-NOWHERE/)

  post(bridgeMessage('FROM-SITE-PANE'), sitePane.contentWindow)
  assert.match(host.textContent, /FROM-SITE-PANE/)

  lib.act(() => root.unmount())
  host.remove()
  stranger.remove()
  // Each iframe has a jsdom window of its own; left open, they keep the process alive.
  for (const w of [...frameWindows, stranger.contentWindow]) w?.close()
})
