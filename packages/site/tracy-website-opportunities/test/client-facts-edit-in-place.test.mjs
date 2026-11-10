/**
 * Business facts, design A (#537): Edit turns one band into its fields in place, with Cancel and Save at the band's
 * bottom right, and saves through the calls the page already had; the other bands do not change, and nothing opens
 * a sheet or a dialog. The band switch flips through its door. The page is mounted with React 18 in jsdom against
 * stubbed doors. Every business in this file is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-facts-edit-in-place.test.mjs
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

let outDir = ''
let lib
let dom
let pendingScheduler
before(async () => {
  pendingScheduler = setInterval(() => {}, 1000)
  const { JSDOM } = createRequire(path.join(fromStore('jsdom@', 'jsdom'), 'package.json'))('jsdom')
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'HTMLElement',
    'MouseEvent',
    'KeyboardEvent',
    'Event'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const Channel = globalThis.MessageChannel
  globalThis.MessageChannel = class extends Channel {
    constructor() {
      super()
      queueMicrotask(() => this.port1.unref())
    }
  }
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-facts-edit-'))
  const outfile = path.join(outDir, 'facts-edit.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { BusinessFactsPage } from './business-facts-page.tsx'
        export { businessFactsView } from './business-facts-model.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  clearInterval(pendingScheduler)
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const OWNER = {
  bands: { brand: true, keyMessages: true, reviews: true, media: true, socials: true },
  setBand: async () => true,
  setMediaHidden: async () => true,
  setReviewHidden: async () => true,
  team: async () => null,
  uploadTeamPhoto: async () => ({ code: 'HTTP' }),
  networks: [],
  socials: [],
  setSocial: async () => null
}
const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MEDIA = {
  logo: { state: 'none' },
  colors: { state: 'none' },
  photos: { groups: [], hidden: [] },
  videos: { tiles: [] },
  files: []
}

/** Mounts the page with stubbed doors that record every call. */
function mount() {
  const calls = []
  const view = lib.businessFactsView({
    profile: {
      phone: '+10 555 0100',
      address: '12 Lagoon Walk',
      bio: 'Kite lessons on the lagoon.',
      hoursCheck: {
        state: 'check',
        hours: [],
        claims: [{ source: 'google', hours: DAYS.map((d) => `${d}: Open 24 hours`) }]
      }
    },
    candidate: { name: 'Harbour Kite Lessons' },
    name: 'Harbour Kite Lessons',
    researched: true,
    approval: { profile: 'needed' },
    briefCreatedAt: null,
    colors: [],
    reviews: [],
    sources: []
  })
  const field = (name) => (f, value) => ({
    value,
    save: async (typed) => {
      calls.push([name, f, typed])
      return true
    }
  })
  const doors = {
    nameRow: null,
    saveName: async (n) => (calls.push(['name', n]), true),
    profileField: field('profile'),
    saveHours: async (choice) => (calls.push(['hours', choice]), 'ok'),
    saveRating: async () => true,
    pickReading: async () => true,
    factSwitch: (fields) =>
      fields.includes('services')
        ? { on: true, set: async (on) => (calls.push(['fact', fields, on]), true) }
        : null,
    readingRows: () => null,
    keyMessages: null,
    uploadMedia: async () => null,
    retryLogo: { busy: false, failed: false, onPress: () => {} },
    owner: OWNER
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  lib.act(() =>
    root.render(
      lib.createElement(lib.BusinessFactsPage, {
        t,
        locale: 'en',
        view,
        media: MEDIA,
        doors,
        food: false,
        websiteLink: (u) => u,
        researchDetails: null,
        running: false
      })
    )
  )
  const band = (id) => host.querySelector(`[data-card="${id}"]`)
  const press = (el) => lib.act(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  const pressAsync = (el) =>
    lib.act(async () => {
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
    })
  const edit = (id) => press(band(id).querySelector('.tracy-wo-facts-slot-edit button'))
  const button = (id, label) => [...band(id).querySelectorAll('button')].find((b) => b.textContent === label)
  const type = (input, value) =>
    lib.act(() => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      set.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
  const done = () => lib.act(() => root.unmount())
  return { host, calls, band, press, pressAsync, edit, button, type, done }
}

test('Edit turns Opening hours into seven fields in place, with the check strip and Cancel and Save at its bottom right', () => {
  const m = mount()
  try {
    const servicesBefore = m.band('services').outerHTML
    m.edit('hours')
    const hours = m.band('hours')
    assert.equal(hours.hasAttribute('data-editing'), true)
    assert.equal(hours.querySelector('.tracy-wo-facts-band-body'), null)
    assert.equal(hours.querySelectorAll('.tracy-wo-facts-band-edit input').length, 7)
    assert.match(
      hours.querySelector('.tracy-wo-facts-band-edit > .tracy-wo-facts-note').textContent,
      /hours\.note/
    )
    const footer = hours.querySelector('.tracy-wo-facts-band-edit > .tracy-wo-facts-bf:last-child')
    assert.deepEqual(
      [...footer.querySelectorAll('button')].map((b) => b.textContent),
      ['[profile.edit.cancel]', '[profile.edit.save]']
    )
    // The Edit control waits while the band is open; the other bands do not change, nothing opens elsewhere.
    assert.equal(hours.querySelector('.tracy-wo-facts-slot-edit button').disabled, true)
    assert.equal(m.band('services').outerHTML, servicesBefore)
    assert.equal(document.querySelector('[role="dialog"], .tracy-wo-facts-sheet'), null)
    assert.equal(m.host.querySelectorAll('[data-editing]').length, 1)
    // Cancel closes the band without a call.
    m.press(m.button('hours', '[profile.edit.cancel]'))
    assert.equal(m.band('hours').hasAttribute('data-editing'), false)
    assert.ok(m.band('hours').querySelector('.tracy-wo-facts-band-body'))
    assert.deepEqual(m.calls, [])
  } finally {
    m.done()
  }
})

test('Save sends the edited hours through the hours call, then the band closes', async () => {
  const m = mount()
  try {
    m.edit('hours')
    m.type(m.band('hours').querySelector('.tracy-wo-facts-band-edit input'), '09:00 - 17:00')
    await m.pressAsync(m.button('hours', '[profile.edit.save]'))
    assert.deepEqual(m.calls, [
      [
        'hours',
        {
          choice: 'edit',
          hours: ['Monday: 09:00 - 17:00', ...DAYS.slice(1).map((d) => `${d}: Open 24 hours`)]
        }
      ]
    ])
    assert.equal(m.band('hours').hasAttribute('data-editing'), false)
  } finally {
    m.done()
  }
})

test('Saving unchanged hours that wait for a check keeps them', async () => {
  const m = mount()
  try {
    m.edit('hours')
    await m.pressAsync(m.button('hours', '[profile.edit.save]'))
    assert.deepEqual(m.calls, [['hours', { choice: 'keep' }]])
  } finally {
    m.done()
  }
})

test('the business band edits its name, phone and address in place and sends only what changed', async () => {
  const m = mount()
  try {
    m.edit('business')
    const inputs = m.band('business').querySelectorAll('.tracy-wo-facts-band-edit input')
    assert.equal(inputs.length, 3)
    m.type(inputs[1], '+10 555 0199')
    await m.pressAsync(m.button('business', '[profile.edit.save]'))
    assert.deepEqual(m.calls, [['profile', 'phone', '+10 555 0199']])
  } finally {
    m.done()
  }
})

test('About edits its whole text in place', async () => {
  const m = mount()
  try {
    m.edit('about')
    const area = m.band('about').querySelector('textarea')
    assert.equal(area.value, 'Kite lessons on the lagoon.')
    lib.act(() => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      set.call(area, 'Kite and wing lessons on the lagoon.')
      area.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await m.pressAsync(m.button('about', '[profile.edit.save]'))
    assert.deepEqual(m.calls, [['profile', 'bio', 'Kite and wing lessons on the lagoon.']])
  } finally {
    m.done()
  }
})

test('a band switch flips through its door', async () => {
  const m = mount()
  try {
    await m.pressAsync(m.band('services').querySelector('[role="switch"]'))
    assert.deepEqual(m.calls, [['fact', ['services', 'audience', 'serviceAreas'], false]])
  } finally {
    m.done()
  }
})
