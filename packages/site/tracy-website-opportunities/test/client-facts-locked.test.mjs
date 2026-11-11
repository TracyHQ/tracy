/**
 * Approved Business facts are final (#537 R23): with the page locked, no band draws Edit, an On the site switch, Add
 * more or any other control that writes, the items kept off still read dimmed, and one notice offers Add this
 * business again, which presses the create door once however often it is clicked while the answer is out. The card
 * is rebuilt from its own inputs (`againBodyOf`), and the line naming the same place's other cards links to them.
 * The page is mounted with React 18 in jsdom against stubbed doors. Every business in this file is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-facts-locked.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { addAgain, againBodyOf } from '../src/client/api.ts'
import { sameAsLine, sameAsOf } from '../src/client/same-as-model.ts'

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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-facts-locked-'))
  const outfile = path.join(outDir, 'facts-locked.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { BusinessFactsPage } from './business-facts-page.tsx'
        export { businessFactsView } from './business-facts-model.ts'
        export { SameAsLine } from './same-as-line.tsx'
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
  bands: { brand: false, keyMessages: true, reviews: true, media: true, socials: true },
  setBand: async () => true,
  setMediaHidden: async () => true,
  setReviewHidden: async () => true,
  team: async () => null,
  uploadTeamPhoto: async () => ({ code: 'HTTP' }),
  networks: [{ id: 'instagram', label: 'Instagram', placeholder: '' }],
  socials: [],
  setSocial: async () => null
}
const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const MEDIA = {
  logo: { state: 'none' },
  colors: { state: 'none' },
  photos: { groups: [], hidden: [] },
  videos: { tiles: [] },
  files: []
}
const DOORS = {
  nameRow: null,
  saveName: async () => true,
  profileField: (f, value) => ({ value, save: async () => true }),
  saveHours: async () => 'ok',
  saveRating: async () => true,
  pickReading: async () => true,
  factSwitch: () => ({ on: true, set: async () => true }),
  readingRows: () => null,
  keyMessages: null,
  uploadMedia: async () => null,
  retryLogo: { busy: false, failed: false, onPress: () => {} },
  owner: OWNER
}

/** Mounts the page, locked or not; `addAgain` is the notice's door. */
function mount(locked) {
  const view = lib.businessFactsView({
    profile: { phone: '+10 555 0100', address: '12 Lagoon Walk', bio: 'Kite lessons on the lagoon.' },
    candidate: { name: 'Harbour Kite Lessons' },
    name: 'Harbour Kite Lessons',
    researched: true,
    colors: [],
    reviews: [],
    sources: []
  })
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
        doors: DOORS,
        food: false,
        websiteLink: (u) => u,
        running: false,
        locked
      })
    )
  )
  return { host, done: () => lib.act(() => root.unmount()) }
}

const WRITES = [
  '.tracy-wo-facts-cl',
  '.tracy-wo-facts-act',
  '.tracy-wo-facts-sw',
  '[data-slot="switch"]',
  'input[type="file"]'
]

test('unlocked, every band has its controls (the baseline the locked page is measured against)', () => {
  const m = mount(null)
  try {
    for (const sel of ['.tracy-wo-facts-cl', '.tracy-wo-facts-act', '[data-slot="switch"]'])
      assert.ok(m.host.querySelectorAll(sel).length > 0, sel)
    assert.equal(m.host.querySelector('.tracy-wo-facts-locked'), null)
  } finally {
    m.done()
  }
})

test('locked: no Edit, no switch, no Add, no upload on any band; one notice; items kept off still dimmed', () => {
  const m = mount({ line: 'approved line', addAgain: async () => null })
  try {
    for (const sel of WRITES) assert.equal(m.host.querySelectorAll(sel).length, 0, sel)
    const buttons = [...m.host.querySelectorAll('button')].map((b) => b.textContent)
    assert.deepEqual(buttons, ['[facts.addAgain]'], 'the only button on the page is Add this business again')
    const notice = m.host.querySelectorAll('.tracy-wo-facts-locked')
    assert.equal(notice.length, 1)
    assert.equal(notice[0].querySelector('p').textContent, 'approved line')
    assert.equal(m.host.querySelector('.tracy-wo-facts > *'), notice[0], 'the notice sits at the top')
    assert.equal(m.host.querySelector('[data-card="brand"]').hasAttribute('data-off'), true)
    assert.ok(m.host.querySelectorAll('[data-card]').length >= 8, 'every band is still drawn')
  } finally {
    m.done()
  }
})

test('Add this business again: disabled while the request runs, a double click presses the door once', async () => {
  let presses = 0
  let finish
  const m = mount({
    line: 'approved line',
    addAgain: () => {
      presses += 1
      return new Promise((resolve) => {
        finish = resolve
      })
    }
  })
  try {
    const button = () => m.host.querySelector('.tracy-wo-facts-locked button')
    await lib.act(async () => {
      button().dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      button().dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(presses, 1)
    assert.equal(button().disabled, true)
    await lib.act(async () => {
      finish('HTTP_500')
      await new Promise((r) => setTimeout(r, 5))
    })
    assert.equal(button().disabled, false)
    assert.equal(m.host.querySelector('.tracy-wo-facts-locked [role="alert"]').textContent, '[gate.other]')
  } finally {
    m.done()
  }
})

test('the create body: a pasted links card sends its links, the typed name and its Google place', () => {
  const opportunity = {
    candidate: {
      provider: 'google-places',
      providerId: 'ChIJ-invented-place',
      name: 'Harbour Kite Lessons',
      typedName: 'Harbour Kite',
      website: 'https://harbour-kite.example',
      pastedLinks: [
        { source: 'google-places', url: 'https://maps.example/harbour' },
        { source: 'website', url: 'https://harbour-kite.example' }
      ],
      profileEdits: { phone: { at: '2026-11-01T10:00:00Z' } }
    }
  }
  assert.deepEqual(againBodyOf(opportunity), {
    links: ['https://maps.example/harbour', 'https://harbour-kite.example'],
    name: 'Harbour Kite',
    place: { provider: 'google-places', providerId: 'ChIJ-invented-place', name: 'Harbour Kite Lessons' }
  })
  // A links card with no Google place: the links alone.
  assert.deepEqual(
    againBodyOf({
      candidate: {
        provider: 'url',
        providerId: 'https://kite.example',
        name: 'kite.example',
        pastedLinks: [{ source: 'website', url: 'https://kite.example' }]
      }
    }),
    { links: ['https://kite.example'] }
  )
})

test('the create body: a card picked on Find sends its candidate; a card with nothing to send is refused here', () => {
  const candidate = { provider: 'google-places', providerId: 'ChIJ-invented', name: 'Example Padel Club' }
  assert.deepEqual(againBodyOf({ candidate }), { candidate })
  assert.equal(againBodyOf({ candidate: { name: 'No id' } }), null)
  assert.equal(againBodyOf(null), null)
})

test('addAgain presses the create door once and answers the new card id, or the refusal code', async () => {
  const sent = []
  const api = (answer) => ({
    create: async (body) => {
      sent.push(body)
      return answer
    }
  })
  const opportunity = { candidate: { provider: 'google-places', providerId: 'ChIJ-x', name: 'Example Club' } }
  assert.deepEqual(
    await addAgain(api({ ok: true, status: 201, body: { opportunity: { id: 'opp-new' } } }), opportunity),
    { id: 'opp-new' }
  )
  assert.deepEqual(await addAgain(api({ ok: false, status: 400, code: 'INVALID_CANDIDATE' }), opportunity), {
    code: 'INVALID_CANDIDATE'
  })
  assert.equal(sent.length, 2)
  assert.deepEqual(await addAgain(api({ ok: true }), { candidate: {} }), { code: 'INVALID_REQUEST' })
  assert.equal(sent.length, 2, 'nothing is sent for a card with no inputs')
})

test('sameAs: the newest other card in words, a link to it, and how many more', () => {
  const cards = sameAsOf([
    { id: 'opp-a', createdAt: '2026-11-09T10:00:00Z', stage: 'research' },
    { id: 'opp-b', createdAt: '2026-11-01T10:00:00Z', stage: 'outreach' },
    { createdAt: 'no id, dropped' }
  ])
  assert.equal(cards.length, 2)
  const line = sameAsLine(t, cards, 'en-GB')
  assert.equal(line.text, '[sameAs.line{"date":"9 Nov","stage":"[v3.research]"}]')
  assert.equal(line.more, '[sameAs.more{"count":1}]')
  assert.equal(sameAsLine(t, [], 'en'), null)
  assert.equal(sameAsLine(t, sameAsOf(null), 'en'), null)
  let opened = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  lib.act(() => root.render(lib.createElement(lib.SameAsLine, { t, cards, onOpen: (id) => (opened = id) })))
  lib.act(() => host.querySelector('button').dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  assert.equal(opened, 'opp-a')
  lib.act(() => root.unmount())
})
