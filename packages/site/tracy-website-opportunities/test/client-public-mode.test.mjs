/**
 * The public Find (`find-entry.ts` › `PublicFind`): the real Find component in public mode, mounted
 * in jsdom with a recording api. Public mode governs effects, not only buttons (council 23/10/2026):
 * nothing is searched, located, restored or stored on mount; a search sends only the area and the
 * radius; rows carry no photo, no Map, no per-row action; at most 10 picks; Continue hands them on.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-public-mode.test.mjs
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
    url: 'https://wopf.tracy.test/find'
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-public-find-'))
  const outfile = path.join(outDir, 'public-find.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { PublicFind, PUBLIC_RADII_M, en } from './find-entry.ts'
        export { writeLastSearch, writePlace } from './find-memory.ts'
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
    logLevel: 'silent'
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

function candidate(i) {
  return {
    provider: 'google-places',
    providerId: `ChIJ-${i}`,
    name: `Place ${i}`,
    kind: 'restaurants',
    lat: 16.06 + i / 1000,
    lon: 108.22,
    distanceM: 100 * i,
    rating: 4.2,
    reviews: 10 * i,
    status: 'new',
    // A photo name the public server would never send: the view must still not draw an image.
    photo: { name: `places/ChIJ-${i}/photos/x`, credit: null }
  }
}

/** Every call the view makes; anything but `capabilities` and `search` is a refusal, like the page's adapter. */
function recordingApi() {
  const calls = []
  const refuse = (code) => ({ ok: false, status: 404, code })
  const api = new Proxy(
    {},
    {
      get(_, name) {
        return async (...args) => {
          calls.push([String(name), ...args])
          if (name === 'capabilities')
            return {
              ok: true,
              status: 200,
              body: {
                maps: { browserKey: null },
                socialStats: { providers: { rapidapi: false, youtube: false, apify: false } }
              }
            }
          if (name === 'search')
            return {
              ok: true,
              status: 200,
              body: {
                provider: 'google-places',
                center: { lat: 16.06, lon: 108.22 },
                candidates: Array.from({ length: 12 }, (_, i) => candidate(i))
              }
            }
          if (name === 'siteChecks') return refuse('CHECKS_UNAVAILABLE')
          if (name === 'socialStats') return refuse('SOCIAL_STATS_UNAVAILABLE')
          return refuse('UNSUPPORTED')
        }
      }
    }
  )
  return { api, calls }
}

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

test('public Find: nothing happens on its own, the search is the area alone, and Continue hands on at most 10', async () => {
  // A history the signed-in Find would reopen on, and a granted location it would search around.
  const now = Date.now()
  lib.writePlace(localStorage, { lat: 1, lon: 2, label: 'Old place' }, now)
  lib.writeLastSearch(
    localStorage,
    { place: { lat: 1, lon: 2, label: 'Old place' }, radius: 3000, answer: { candidates: [candidate(99)] } },
    now
  )
  const storedBefore = JSON.stringify(Object.entries(localStorage))

  const { api, calls } = recordingApi()
  const continued = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => {
    root.render(lib.createElement(lib.PublicFind, { t, api, onContinue: (picks) => continued.push(picks) }))
  })
  await frames(10)
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['capabilities'],
    'no search, no location, no history on mount'
  )
  assert.deepEqual(located, [])
  assert.equal(host.querySelector('.tracy-wo-results'), null, 'the old results are not restored')

  const radii = [...host.querySelectorAll('select option')].map((o) => Number(o.value))
  assert.deepEqual(radii, [1000, 3000, 5000, 10000])
  assert.deepEqual([...lib.PUBLIC_RADII_M], [1000, 3000, 5000, 10000])

  const input = host.querySelector('form input')
  await lib.act(async () => typeInto(input, 'https://example.com'))
  await lib.act(async () => typeInto(input, 'Hai Chau, Da Nang'))
  await frames()
  await lib.act(async () => {
    host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  })
  await frames(10)
  const searches = calls.filter((c) => c[0] === 'search')
  assert.equal(searches.length, 1)
  assert.deepEqual(searches[0][1], { query: 'Hai Chau, Da Nang', radiusM: 3000 })
  assert.ok(
    !calls.some((c) =>
      [
        'approxLocation',
        'resolvePlace',
        'refreshFind',
        'siteChecks',
        'socialStats',
        'create',
        'research'
      ].includes(c[0])
    ),
    JSON.stringify(calls.map((c) => c[0]))
  )

  assert.equal(host.querySelectorAll('img').length, 0, 'no photo is loaded')
  assert.equal(host.querySelector('[data-view="map"]'), null, 'no Map button')
  assert.equal(
    [...host.querySelectorAll('button')].filter((b) => b.textContent === t('job.start')).length,
    0,
    'no per-row action'
  )

  const boxes = () => [...host.querySelectorAll('.tracy-wo-results tbody [role="checkbox"]')]
  assert.equal(boxes().length, 12)
  for (const box of boxes().slice(0, 11)) await lib.act(async () => box.click())
  await frames()
  const checked = boxes().filter((b) => b.getAttribute('aria-checked') === 'true')
  assert.equal(checked.length, 10)
  assert.ok(host.textContent.includes(t('public.limit', { count: 10 })))

  const go = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === t('public.continue.other', { count: 10 })
  )
  assert.ok(go, 'the Continue button names the count')
  await lib.act(async () => go.click())
  assert.equal(continued.length, 1)
  assert.equal(continued[0].picks.length, 10)
  assert.deepEqual([continued[0].lat, continued[0].lon, continued[0].radiusM], [16.06, 108.22, 3000])
  assert.ok(
    !calls.some((c) => ['create', 'research', 'buildDemo'].includes(c[0])),
    'no research for a stranger'
  )
  assert.equal(
    JSON.stringify(Object.entries(localStorage)),
    storedBefore,
    'public mode writes nothing on the device'
  )
  await lib.act(async () => root.unmount())
})

test('public Find: a refused search says why in the visitor’s words', async () => {
  const calls = []
  const api = new Proxy(
    {},
    {
      get: (_, name) => async () => {
        calls.push(name)
        if (name === 'capabilities') return { ok: true, status: 200, body: {} }
        return { ok: false, status: 429, code: name === 'search' ? 'DAILY_LIMIT' : 'UNSUPPORTED' }
      }
    }
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(lib.createElement(lib.PublicFind, { t, api, onContinue() {} })))
  await lib.act(async () => typeInto(host.querySelector('form input'), 'Da Nang'))
  await lib.act(async () =>
    host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  )
  await frames()
  assert.ok(host.textContent.includes(t('public.error.daily')), host.textContent.slice(0, 300))
  await lib.act(async () => root.unmount())
})

const SUGGESTED = [
  {
    placeId: 'ChIJ-downtown',
    text: 'Downtown Dubai, Dubai, UAE',
    mainText: 'Downtown Dubai',
    secondaryText: 'Dubai, UAE',
    types: ['establishment', 'point_of_interest']
  }
]

function suggestingApi({ refuseSuggest = false } = {}) {
  const calls = []
  const api = new Proxy(
    {},
    {
      get:
        (_, name) =>
        async (...args) => {
          calls.push([String(name), ...args])
          if (name === 'capabilities') return { ok: true, status: 200, body: {} }
          if (name === 'suggestPlaces')
            return refuseSuggest
              ? { ok: false, status: 429, code: 'RATE_LIMITED' }
              : { ok: true, status: 200, body: { suggestions: SUGGESTED } }
          if (name === 'resolvePlace')
            return {
              ok: true,
              status: 200,
              body: { label: 'Downtown Dubai, UAE', lat: 25.1972, lon: 55.2744 }
            }
          if (name === 'search')
            return {
              ok: true,
              status: 200,
              body: {
                provider: 'google-places',
                center: { lat: 25.1972, lon: 55.2744 },
                candidates: [candidate(1)]
              }
            }
          return { ok: false, status: 404, code: 'UNSUPPORTED' }
        }
    }
  )
  return { api, calls }
}

test('public Find: the place box suggests as the signed-in one does, and a pick searches by its coordinates', async () => {
  const { api, calls } = suggestingApi()
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(lib.createElement(lib.PublicFind, { t, api, onContinue() {} })))
  const input = host.querySelector('form input')
  await lib.act(async () => {
    input.focus()
    typeInto(input, 'downtown')
  })
  await frames(25)
  const asked = calls.filter((c) => c[0] === 'suggestPlaces')
  assert.equal(asked.length, 1)
  assert.equal(asked[0][1], 'downtown')
  const option = [...document.querySelectorAll('[role="option"]')].find((o) =>
    o.textContent.includes('Downtown Dubai')
  )
  assert.ok(option, 'a suggestion is shown')
  await lib.act(async () => option.click())
  await frames(10)
  const resolved = calls.filter((c) => c[0] === 'resolvePlace')
  assert.equal(resolved.length, 1)
  assert.equal(resolved[0][1], 'ChIJ-downtown')
  assert.equal(resolved[0][2], asked[0][2], 'the pick bills in the typing session')
  const searches = calls.filter((c) => c[0] === 'search')
  assert.deepEqual(searches.at(-1)[1], { lat: 25.1972, lon: 55.2744, radiusM: 3000 })
  await lib.act(async () => root.unmount())
})

test('public Find: a refused suggestion leaves plain typing and Search working', async () => {
  const { api, calls } = suggestingApi({ refuseSuggest: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(lib.createElement(lib.PublicFind, { t, api, onContinue() {} })))
  const input = host.querySelector('form input')
  await lib.act(async () => {
    input.focus()
    typeInto(input, 'downtown')
  })
  await frames(25)
  assert.equal(document.querySelectorAll('[role="option"]').length, 0)
  await lib.act(async () =>
    host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  )
  await frames()
  assert.deepEqual(calls.filter((c) => c[0] === 'search').at(-1)[1], { query: 'downtown', radiusM: 3000 })
  await lib.act(async () => root.unmount())
})

test('public Find: Research on a row follows its steps to researched, then Build demo hands that place over', async () => {
  const calls = []
  const progress = [
    { state: 'running', stage: 'media', placeId: 'ChIJ-0' },
    { state: 'researched', researchedAt: '2026-10-23T10:05:00.000Z', canBuild: true, placeId: 'ChIJ-0' }
  ]
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
                candidates: [0, 1, 2].map(candidate)
              }
            }
          if (name === 'publicResearch') {
            const [ids] = args
            return {
              ok: true,
              status: 200,
              body: {
                places: ids.map((placeId) =>
                  placeId === 'ChIJ-0'
                    ? { placeId, state: 'queued', receipt: 'r-0' }
                    : placeId === 'ChIJ-1'
                      ? { placeId, state: 'refused', code: 'PUBLIC_RESEARCH_SPENT' }
                      : { placeId, state: 'stopped' }
                )
              }
            }
          }
          if (name === 'publicResearchStatus')
            return {
              ok: true,
              status: 200,
              body: { places: [], receipts: { 'r-0': progress.shift() ?? progress.at(-1) } }
            }
          return { ok: false, status: 404, code: 'UNSUPPORTED' }
        }
    }
  )
  const continued = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  await lib.act(async () =>
    root.render(lib.createElement(lib.PublicFind, { t, api, onContinue: (next) => continued.push(next) }))
  )
  await lib.act(async () => typeInto(host.querySelector('form input'), 'Da Nang'))
  await lib.act(async () =>
    host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  )
  await frames()
  const buttons = (label) => [...host.querySelectorAll('button')].filter((b) => b.textContent === label)
  assert.equal(buttons(t('public.research')).length >= 3, true, 'each new row offers Research')

  const rowOf = (name) =>
    [...host.querySelectorAll('.tracy-wo-results tbody tr')].find((tr) => tr.textContent.includes(name))
  const inRow = (name, label) =>
    [...rowOf(name).querySelectorAll('button')].find((b) => b.textContent === label)
  await lib.act(async () => inRow('Place 0', t('public.research')).click())
  await frames()
  assert.deepEqual(
    calls.filter((c) => c[0] === 'publicResearch').map((c) => c[1]),
    [['ChIJ-0']]
  )
  assert.ok(host.textContent.includes(t('research.waiting')), 'queued reads as waiting')

  await lib.act(() => new Promise((r) => setTimeout(r, 3200)))
  await frames()
  assert.deepEqual(calls.filter((c) => c[0] === 'publicResearchStatus')[0][1], { receipts: ['r-0'] })
  assert.ok(host.textContent.includes(t('job.stage.media')), 'the running step is shown')
  assert.ok(host.textContent.includes(t('research.step', { step: 3, steps: 5 })))

  await lib.act(() => new Promise((r) => setTimeout(r, 3200)))
  await frames()
  const build = buttons(t('public.build'))
  assert.ok(build.length > 0, 'a researched row offers Build demo')
  const polls = calls.filter((c) => c[0] === 'publicResearchStatus').length
  await lib.act(() => new Promise((r) => setTimeout(r, 3200)))
  assert.equal(
    calls.filter((c) => c[0] === 'publicResearchStatus').length,
    polls,
    'polling stops once researched'
  )

  await lib.act(async () => build[0].click())
  assert.deepEqual(continued, [
    { picks: ['ChIJ-0'], lat: 16.06, lon: 108.22, radiusM: 3000, build: 'ChIJ-0' }
  ])

  // Two picked rows: one press for both; a spent budget asks to sign in, a stopped job says so.
  for (const name of ['Place 1', 'Place 2'])
    await lib.act(async () => rowOf(name).querySelector('[role="checkbox"]').click())
  await frames()
  const many = buttons(t('public.research.selected.other', { count: 2 }))
  assert.equal(many.length, 1)
  await lib.act(async () => many[0].click())
  await frames()
  assert.deepEqual([...calls.filter((c) => c[0] === 'publicResearch').at(-1)[1]].sort(), ['ChIJ-1', 'ChIJ-2'])
  assert.ok(host.textContent.includes(t('public.research.spent')))
  assert.ok(host.textContent.includes(t('public.research.stopped')))
  assert.ok(!calls.some((c) => ['create', 'research', 'buildDemo'].includes(c[0])), 'nothing of an account')
  await lib.act(async () => root.unmount())
})
