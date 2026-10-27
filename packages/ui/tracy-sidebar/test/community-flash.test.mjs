/**
 * Hiding the Need help? pill flashes the account face once, to show where Community lives now
 * (`src/client/community.tsx`). That flash points at the Community row of the account menu, so it
 * must not happen when the operator switched that row off (`community-link` in
 * `@tracy/core/ui-switches`): the face would point at a row that is not there.
 *
 * The real `HelpButton` is bundled by esbuild and mounted with React into jsdom; the operator's
 * switches answer from a stubbed `/api/ui`. Each case bundles its own copy, so each has its own
 * page of switches.
 *
 *   node --test packages/ui/tracy-sidebar/test/community-flash.test.mjs
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
let dom
/** What `/api/ui` answers: the ids the operator switched off. */
let hidden = []

before(() => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://tracy.test/'
  })
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'MutationObserver']) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = window.ResizeObserver = Observer
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.fetch = async (url) =>
    String(url) === '/api/ui'
      ? new Response(JSON.stringify({ hidden }), { status: 200 })
      : new Response('', { status: 404 })
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'community-flash-'))
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

/** A fresh bundle on a new page, so its switches are read again from `/api/ui`. */
async function load(name) {
  // A new page: the switches are read once per page and kept on globalThis by
  // @tracy/core/ui-switches, so forget the last case's read.
  delete globalThis[Symbol.for('@tracy/core/ui-switches#page-read')]
  const outfile = path.join(outDir, `${name}.cjs`)
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { HelpButton } from './community'
        export { uiSwitches } from '@tracy/core/ui-switches'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    // react-dom is not this plugin's dependency (dsh provides it); tracy-core's copy, as the e2e does.
    nodePaths: [
      path.join(here, '..', 'node_modules'),
      path.join(repo, 'packages/core/tracy-core/node_modules')
    ],
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  return require(outfile)
}

/** Mount the pill beside a face, hide the pill, and say whether the face flashed. */
async function hideThePill(name) {
  const lib = await load(name)
  await lib.uiSwitches().ready
  document.body.replaceChildren()
  const face = document.createElement('button')
  face.setAttribute('data-tracy-account-trigger', '')
  const host = document.createElement('div')
  document.body.append(face, host)
  const root = lib.createRoot(host)
  lib.act(() => root.render(lib.createElement(lib.HelpButton, { t: (key) => key })))
  try {
    lib.act(() => document.querySelector('.tch-help-pill').click())
    lib.act(() => document.querySelector('.tch-help-hide').click())
    return face.classList.contains('tsb-community-flash')
  } finally {
    lib.act(() => root.unmount())
    window.localStorage.clear()
  }
}

test('hiding the pill flashes the face that opens the menu holding Community', async () => {
  hidden = []
  assert.equal(await hideThePill('community-on'), true)
})

test('with the Community row switched off, hiding the pill does not flash the face', async () => {
  hidden = ['community-link']
  assert.equal(await hideThePill('community-off'), false, 'the face pointed at a row that is not there')
})
