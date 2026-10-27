/**
 * The Contract row of the Quickstart settings tab (`QuickstartSettings`, Akemi 11/10/2026): ONE line
 * in the value column, built from the typed contract status.
 *
 *   - No contract: a small "None" mark, then "Needs a contract, see Road to live step 3", where
 *     "step 3" opens the release's Road to live group and goes to its contract step.
 *   - A contract: its id with a check; one made for an earlier release adds "(older version)".
 *   - No second icon and no second line in any state.
 *
 * Mounted with react-dom on a linkedom document; nothing leaves the process.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const { parseHTML } = rootRequire('linkedom')

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const GLOBALS = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'IS_REACT_ACT_ENVIRONMENT']
const saved = new Map()
let lib
let dom
const cleanups = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { QuickstartSettings } from './QuickstartSettings'`,
      resolveDir: path.join(pkgRoot, 'src', 'cms'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('HTMLElement', dom.window.HTMLElement)
  set('Element', dom.window.Element)
  set('Node', dom.window.Node)
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

const TAG = 'quickstart/ja-restaurant/j6'
const DETAIL = { tracy: 'ready', github: 'published', assets: [], sites: [], setting: { install: {} } }

async function mount(contractStatus) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  await lib.act(async () => {
    root.render(
      lib.createElement(lib.QuickstartSettings, {
        tag: TAG,
        detail: DETAIL,
        writable: false,
        onChanged: () => {},
        contract: 'caller node',
        contractStatus
      })
    )
    await tick(5)
  })
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  const value = host.querySelector('[data-settings-section="contract"] dd')
  return { host, value }
}

test('no contract: one line, a None mark and a link to the contract step', async () => {
  const { value } = await mount({ state: 'none', profile: null, version: '1.0.2' })
  assert.match(value.textContent, /^NoneNeeds a contract, see Road to live step 3$/)
  assert.equal(value.querySelectorAll('svg').length, 0, 'no icon beside the mark')
  assert.doesNotMatch(value.textContent, /caller node|cannot be published/)
  assert.ok(value.querySelector('[data-contract-go]'))
})

test('step 3 opens the release group on the Road to live and goes to its contract step', async () => {
  // A Road to live group as RoadToLive draws it, collapsed.
  const group = dom.document.createElement('div')
  group.setAttribute('data-road-release', TAG)
  group.setAttribute('data-open', 'false')
  const toggle = dom.document.createElement('button')
  toggle.setAttribute('data-road-toggle', '')
  let opened = 0
  toggle.addEventListener('click', () => {
    opened += 1
  })
  group.appendChild(toggle)
  dom.document.body.appendChild(group)
  cleanups.push(() => group.remove())

  const { value } = await mount({ state: 'none', profile: null, version: '1.0.2' })
  await lib.act(async () => {
    value.querySelector('[data-contract-go]').dispatchEvent(new dom.window.Event('click', { bubbles: true }))
    await tick(5)
  })
  assert.equal(opened, 1, 'the collapsed group was opened')
})

test('a contract shows its id with a check; an older one says so', async () => {
  const exact = await mount({ state: 'exact', profile: 'ja-restaurant/j6/1.0.2', version: '1.0.2' })
  assert.equal(exact.value.textContent, 'ja-restaurant/j6/1.0.2')
  assert.equal(exact.value.querySelectorAll('svg').length, 1)

  const lower = await mount({ state: 'lower', profile: 'ja-restaurant/j6/1.0.0', version: '1.0.2' })
  assert.equal(lower.value.textContent, 'ja-restaurant/j6/1.0.0(older version)')
  assert.equal(lower.value.querySelectorAll('svg').length, 1)
})

test('without a typed status the caller node is drawn as it is, with no mark', async () => {
  const { value } = await mount(undefined)
  assert.equal(value.textContent, 'caller node')
  assert.equal(value.querySelectorAll('svg').length, 0)
})
