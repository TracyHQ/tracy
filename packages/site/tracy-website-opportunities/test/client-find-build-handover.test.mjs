/**
 * Build demo handed over from the public Find (`wo-build=<placeId>`, tasks/plan-wo-public-research.md):
 * the signed-in Find, mounted in jsdom, searches, selects the place, and starts Build through the
 * existing flow only when its own row says the published research can be built; a replay of the same
 * address after the demo started starts nothing.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-find-build-handover.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

const REACT = fromStore('react@18.3.1', 'react')
const REACT_DOM = fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let dom
const located = []

before(async () => {
  const { JSDOM } = createRequire(path.join(fromStore('jsdom@', 'jsdom'), 'package.json'))('jsdom')
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://cowork.tracy.test/new/'
  })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'navigator',
    'localStorage',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLSelectElement',
    'KeyboardEvent',
    'MouseEvent',
    'CustomEvent',
    'FocusEvent',
    'Event',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  }
  // A visitor who already allowed location: public mode must still not ask for it on its own.
  Object.defineProperty(window.navigator, 'geolocation', {
    value: {
      getCurrentPosition: (ok) => {
        located.push('asked')
        ok({ coords: { latitude: 1, longitude: 2, accuracy: 10 } })
      }
    },
    configurable: true
  })
  Object.defineProperty(window.navigator, 'permissions', {
    value: { query: async () => ({ state: 'granted' }) },
    configurable: true
  })
  window.isSecureContext = true
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const target of [globalThis, window]) target.ResizeObserver ??= ResizeObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const Channel = globalThis.MessageChannel
  globalThis.MessageChannel = class extends Channel {
    constructor() {
      super()
      queueMicrotask(() => this.port1.unref())
    }
  }
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-find-build-'))
  const outfile = path.join(outDir, 'find-build.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createRoot } from 'react-dom/client'
        export { createElement, act, useReducer, useMemo } from 'react'
        export { FindView } from './find.tsx'
        export { flowReducer, initialFlow } from './flow.ts'
        export { createRequestIds } from './request-ids.ts'
        export { en } from './strings.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: { react: REACT, 'react-dom': REACT_DOM },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'error'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const frames = (n = 6) => lib.act(() => new Promise((r) => setTimeout(r, n * 20)))
const t = (key, params) =>
  String(lib.en[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? String(params[k]) : m))
const HANDED =
  '/new/?tab=tracy:website-opportunities&wo-view=find&wo-at=16.06,108.22&wo-radius=3000&wo-pick=ChIJ-0&wo-build=ChIJ-0'

function row(findAction) {
  return {
    provider: 'google-places',
    providerId: 'ChIJ-0',
    name: 'Place 0',
    kind: 'restaurants',
    lat: 16.06,
    lon: 108.22,
    status: 'researched',
    research: { researchedAt: '2026-10-23T10:05:00.000Z', canBuild: findAction.kind === 'build' },
    findAction
  }
}

function signedInApi(findAction) {
  const calls = []
  const api = new Proxy(
    {},
    {
      get:
        (_, name) =>
        async (...args) => {
          calls.push([String(name), ...args])
          if (name === 'capabilities') return { ok: true, status: 200, body: {} }
          if (name === 'search')
            return {
              ok: true,
              status: 200,
              body: {
                provider: 'google-places',
                center: { lat: 16.06, lon: 108.22 },
                candidates: [row(findAction)]
              }
            }
          if (name === 'create') return { ok: true, status: 201, body: { opportunity: { id: 'opp-1' } } }
          if (name === 'buildDemo') return { ok: true, status: 202, body: { actions: [] } }
          return { ok: false, status: 404, code: 'UNSUPPORTED' }
        }
    }
  )
  return { api, calls }
}

async function mount(api) {
  window.history.replaceState(null, '', HANDED)
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  function Harness() {
    const [flow, dispatch] = lib.useReducer(lib.flowReducer, undefined, () => ({
      ...lib.initialFlow(),
      view: { name: 'find' }
    }))
    const ids = lib.useMemo(() => lib.createRequestIds(() => crypto.randomUUID()), [])
    return lib.createElement(lib.FindView, { t, api, ids, flow, dispatch, onSent() {} })
  }
  await lib.act(async () => root.render(lib.createElement(Harness)))
  await frames(15)
  return { host, root }
}

const picked = []
function pickTemplate(event) {
  event.preventDefault()
  picked.push(1)
  event.detail.resolve({ cms: 'wordpress', quickstart: 'qs-1', design: 'd-1' })
}

test('wo-build on a buildable row: one create, one Build, through the template pick; the address forgets it', async () => {
  window.addEventListener('tracy:pick-template', pickTemplate)
  try {
    const { api, calls } = signedInApi({ kind: 'build' })
    const { root } = await mount(api)
    assert.equal(picked.length, 1, 'the person picks the design, as on a Find row')
    assert.deepEqual(
      calls.filter((c) => c[0] === 'create').map((c) => c[1].candidate.providerId),
      ['ChIJ-0']
    )
    const builds = calls.filter((c) => c[0] === 'buildDemo')
    assert.equal(builds.length, 1)
    assert.equal(builds[0][1], 'opp-1')
    assert.ok(!calls.some((c) => c[0] === 'research'), 'no research again')
    assert.ok(!window.location.search.includes('wo-build'), 'read once')
    await lib.act(async () => root.unmount())
  } finally {
    window.removeEventListener('tracy:pick-template', pickTemplate)
    picked.length = 0
  }
})

test('replaying the address once the demo started, or for research that cannot be built, starts nothing', async () => {
  window.addEventListener('tracy:pick-template', pickTemplate)
  try {
    for (const findAction of [
      { kind: 'building', opportunityId: 'opp-1' },
      { kind: 'view', opportunityId: 'opp-1', siteKey: 'demo-1' },
      { kind: 'research' }
    ]) {
      const { api, calls } = signedInApi(findAction)
      const { host, root } = await mount(api)
      assert.equal(picked.length, 0, findAction.kind)
      assert.ok(!calls.some((c) => ['create', 'buildDemo', 'research'].includes(c[0])), findAction.kind)
      const box = host.querySelector('.tracy-wo-results tbody [role="checkbox"]')
      assert.equal(box?.getAttribute('aria-checked'), 'true', 'the place is still selected')
      await lib.act(async () => root.unmount())
    }
  } finally {
    window.removeEventListener('tracy:pick-template', pickTemplate)
  }
})
