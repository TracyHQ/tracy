/**
 * Business facts, the owner's own edits (#537 R14 to R16): the band switches read `bands` and write `band_<band>`;
 * a person's switch is greyed while the Team band is off; each review card and photo tile has its own switch that
 * flips at once and flips back on a refusal; the Team band edits its people in place and adds one; the Social pages
 * band adds a link from the preset networks in a row of its own, with a sentence per refusal; and a photo kept off
 * the site is not a thumbnail of the Workspace card. The page is mounted with React 18 in jsdom against stubbed
 * doors. Every business and person in this file is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-facts-owner-edits.test.mjs
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
    'HTMLInputElement',
    'File',
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-facts-owner-'))
  const outfile = path.join(outDir, 'facts-owner.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { BusinessFactsPage } from './business-facts-page.tsx'
        export { businessFactsView } from './business-facts-model.ts'
        export { factsBodyView } from './facts-body-model.ts'
        export { mediaRowView, mediaTile } from './detail-model.ts'
        export { ownerDoorsOf } from './owner-doors.ts'
        export { ownerBandsOf, socialSetBody, uploadedMediaId } from './owner-edits-model.ts'
        export { readingRowsView } from './profile-reading-model.ts'
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

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const PHOTO = '0b7c6a52-3f4e-4d1a-9a9e-2a1f0c3b5d71'
const MEDIA_ROWS = [
  {
    id: 'a1111111-1111-4111-8111-111111111111',
    kind: 'image',
    category: 'people',
    status: 'stored',
    source: 'owner'
  },
  {
    id: 'b2222222-2222-4222-8222-222222222222',
    kind: 'image',
    category: 'people',
    status: 'stored',
    source: 'instagram',
    ownerHidden: true
  }
]
const PROFILE = {
  readingCard: {
    method: 'model',
    services: [],
    audience: [],
    serviceAreas: [],
    team: [
      {
        id: 'tm_reef',
        label: 'Ana Reef',
        role: 'Head coach',
        quote: 'Ana runs the lessons.',
        source: { kind: 'bio' }
      },
      { id: 'ow_sam', label: 'Sam Tideway', source: { kind: 'owner' }, owner: true, photo: { id: PHOTO } }
    ]
  }
}
const REVIEWS = [
  {
    author: 'Guest One',
    text: 'A calm day on the lagoon.',
    rating: 5,
    source: 'google',
    key: 'rv_one',
    ownerHidden: false
  },
  {
    author: 'Guest Two',
    text: 'Kind teachers.',
    rating: 4,
    source: 'google',
    key: 'rv_two',
    ownerHidden: true
  }
]
const NETWORKS = [
  { id: 'instagram', label: 'Instagram', placeholder: '@yourhandle' },
  { id: 'whatsapp', label: 'WhatsApp', placeholder: '+971 50 123 4567' },
  { id: 'other', label: 'Other', placeholder: 'https://' }
]

/** Mounts the page with doors that record every call; `answers` overrides what a door answers. */
function mount({ bands = {}, teamOn = true, answers = {} } = {}) {
  const calls = []
  const view = lib.businessFactsView({
    profile: PROFILE,
    candidate: { name: 'Harbour Kite Lessons' },
    name: 'Harbour Kite Lessons',
    researched: true,
    approval: { profile: 'needed' },
    briefCreatedAt: null,
    colors: [],
    reviews: REVIEWS,
    sources: []
  })
  const media = lib.mediaRowView({ profile: PROFILE, media: MEDIA_ROWS.map(lib.mediaTile), sources: [] })
  const record =
    (name, answer) =>
    async (...args) => (calls.push([name, ...args]), answers[name] ?? answer)
  const owner = {
    bands: { ...lib.ownerBandsOf({}), ...bands },
    setBand: record('band', true),
    setMediaHidden: record('media', true),
    setReviewHidden: record('review', true),
    team: record('team', null),
    uploadTeamPhoto: record('upload', { id: PHOTO }),
    networks: NETWORKS,
    socials: [{ network: 'instagram', url: 'https://www.instagram.com/harbourkite', label: null }],
    setSocial: record('social', null)
  }
  const doors = {
    nameRow: null,
    saveName: async () => true,
    profileField: () => null,
    saveHours: async () => 'ok',
    saveRating: async () => true,
    pickReading: record('reading', true),
    factSwitch: (fields) =>
      fields.includes('team')
        ? { on: teamOn, set: async (on) => (calls.push(['fact', fields, on]), true) }
        : null,
    readingRows: () => null,
    keyMessages: null,
    uploadMedia: async () => null,
    retryLogo: { busy: false, failed: false, onPress: () => {} },
    owner
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
        media,
        doors,
        food: false,
        websiteLink: (u) => u,
        running: false
      })
    )
  )
  const band = (id) => host.querySelector(`[data-card="${id}"]`)
  const settle = (fn) =>
    lib.act(async () => {
      fn()
      await new Promise((r) => setTimeout(r, 10))
    })
  const press = (el) => settle(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  const button = (id, label) => [...band(id).querySelectorAll('button')].find((b) => b.textContent === label)
  const setValue = (el, value, proto = window.HTMLInputElement.prototype, kind = 'input') =>
    lib.act(() => {
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      el.dispatchEvent(new window.Event(kind, { bubbles: true }))
    })
  const choose = (select, value) => setValue(select, value, window.HTMLSelectElement.prototype, 'change')
  const headSwitch = (id) => band(id).querySelector('.tracy-wo-facts-slot-sw [role="switch"]')
  const done = () => lib.act(() => root.unmount())
  return { host, calls, band, press, button, setValue, choose, headSwitch, settle, done }
}

test('the band switches read bands and write band_<band> through the facts door', async () => {
  const m = mount({ bands: { brand: false } })
  try {
    assert.equal(m.headSwitch('brand').getAttribute('aria-checked'), 'false')
    for (const id of ['messages', 'reviews', 'social', 'media'])
      assert.equal(m.headSwitch(id).getAttribute('aria-checked'), 'true', id)
    assert.doesNotMatch(m.host.innerHTML, /notStored/)
    await m.press(m.headSwitch('reviews'))
    await m.press(m.headSwitch('brand'))
    assert.deepEqual(m.calls, [
      ['band', 'reviews', false],
      ['band', 'brand', true]
    ])
  } finally {
    m.done()
  }
  // The door sends the band as a fact id.
  const sent = []
  const doors = lib.ownerDoorsOf({
    api: {},
    id: 'opp',
    body: { bands: { media: false }, socialNetworks: NETWORKS },
    setFact: async (factId, on) => (sent.push([factId, on]), true),
    refresh: async () => {}
  })
  assert.equal(doors.bands.media, false)
  assert.equal(doors.bands.socials, true)
  await doors.setBand('keyMessages', false)
  assert.deepEqual(sent, [['band_keyMessages', false]])
})

test('while the Team band is off every person switch is greyed with the reason on hover', () => {
  const off = mount({ teamOn: false })
  try {
    const people = off.band('team').querySelectorAll('.tracy-wo-facts-people [role="switch"]')
    assert.equal(people.length, 2)
    for (const sw of people) {
      assert.equal(sw.getAttribute('aria-disabled') === 'true' || sw.hasAttribute('data-disabled'), true)
      assert.equal(sw.closest('.tracy-wo-facts-sw').title, '[facts.team.bandOff]')
    }
  } finally {
    off.done()
  }
  const on = mount({ teamOn: true })
  try {
    for (const sw of on.band('team').querySelectorAll('.tracy-wo-facts-people [role="switch"]'))
      assert.equal(sw.getAttribute('aria-disabled') === 'true' || sw.hasAttribute('data-disabled'), false)
    // The owner's photo is the avatar; a person without one keeps the initials.
    const avatars = [...on.band('team').querySelectorAll('.tracy-wo-facts-avatar')]
    assert.equal(avatars[0].textContent, 'AR')
    assert.match(avatars[1].querySelector('img').src, new RegExp(`/media/${PHOTO}$`))
  } finally {
    on.done()
  }
})

test('a review switch hides the review through its door, and flips back with the reason when refused', async () => {
  const m = mount({ answers: { review: false } })
  try {
    const cards = m.band('reviews').querySelectorAll('.tracy-wo-facts-cards > li')
    assert.equal(cards[1].hasAttribute('data-off'), true)
    assert.equal(cards[1].querySelector('[role="switch"]').getAttribute('aria-checked'), 'false')
    const sw = cards[0].querySelector('[role="switch"]')
    await m.press(sw)
    assert.deepEqual(m.calls, [['review', 'rv_one', true]])
    assert.equal(sw.getAttribute('aria-checked'), 'true')
    assert.match(cards[0].querySelector('[role="alert"]').textContent, /facts\.failed/)
  } finally {
    m.done()
  }
})

test('a photo tile switch keeps it off at once; a tile kept off is dimmed and can be put back', async () => {
  const m = mount()
  try {
    const tiles = m.band('media').querySelectorAll('.tracy-wo-facts-strip > li')
    assert.equal(tiles.length, 2)
    assert.equal(tiles[1].hasAttribute('data-off'), true)
    const sw = tiles[0].querySelector('[role="switch"]')
    await m.press(sw)
    assert.equal(sw.getAttribute('aria-checked'), 'false')
    await m.press(tiles[1].querySelector('[role="switch"]'))
    assert.deepEqual(m.calls, [
      ['media', MEDIA_ROWS[0].id, true],
      ['media', MEDIA_ROWS[1].id, false]
    ])
  } finally {
    m.done()
  }
})

test('the Team band edits each person in place, removes one and adds one, then shows Done', async () => {
  const m = mount()
  try {
    await m.press(m.band('team').querySelector('.tracy-wo-facts-slot-edit button'))
    const rows = m.band('team').querySelectorAll('.tracy-wo-facts-team-ed > li')
    assert.equal(rows.length, 3)
    const [reef, , add] = rows
    assert.deepEqual(
      [...reef.querySelectorAll('input:not([type="file"])')].map((i) => i.value),
      ['Ana Reef', 'Head coach']
    )
    m.setValue(reef.querySelectorAll('input:not([type="file"])')[1], 'Lead coach')
    await m.press([...reef.querySelectorAll('button')].find((b) => b.textContent === '[profile.edit.save]'))
    await m.press([...rows[1].querySelectorAll('button')].find((b) => b.textContent === '[team.remove]'))
    const addButton = [...add.querySelectorAll('button')].find((b) => b.textContent === '[team.add]')
    assert.equal(addButton.disabled, true)
    m.setValue(add.querySelectorAll('input[type="text"], input:not([type])')[0], 'Lea Shore')
    await m.press(addButton)
    assert.deepEqual(m.calls, [
      ['team', { action: 'update', id: 'tm_reef', role: 'Lead coach' }],
      ['team', { action: 'remove', id: 'ow_sam' }],
      ['team', { action: 'add', label: 'Lea Shore' }]
    ])
    assert.deepEqual(
      [...m.band('team').querySelectorAll('.tracy-wo-facts-bf button')].map((b) => b.textContent),
      ['[facts.done]']
    )
  } finally {
    m.done()
  }
})

test('a photo picked for a person goes to Photos & video as a team photo, then to the person', async () => {
  const m = mount()
  try {
    await m.press(m.band('team').querySelector('.tracy-wo-facts-slot-edit button'))
    const input = m.band('team').querySelector('.tracy-wo-facts-team-ed > li input[type="file"]')
    const file = new window.File(['x'], 'ana.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await m.settle(() => input.dispatchEvent(new window.Event('change', { bubbles: true })))
    assert.equal(m.calls[0][0], 'upload')
    assert.deepEqual(m.calls[1], ['team', { action: 'update', id: 'tm_reef', photoMediaId: PHOTO }])
  } finally {
    m.done()
  }
  // A file already added gives its own id back.
  assert.deepEqual(lib.uploadedMediaId({ ok: false, code: 'MEDIA_ALREADY_ADDED', media: { id: PHOTO } }), {
    id: PHOTO
  })
  assert.deepEqual(lib.uploadedMediaId({ ok: true, body: { media: { id: PHOTO } } }), { id: PHOTO })
  assert.deepEqual(lib.uploadedMediaId({ ok: false, code: 'NOT_MEDIA' }), { code: 'NOT_MEDIA' })
})

test('Social pages add a link in a row of the band from the preset networks, with a sentence per refusal', async () => {
  const m = mount({ answers: { social: 'INVALID_PHONE' } })
  try {
    const social = m.band('social')
    // The owner's link shows beside the research pages.
    assert.match(social.querySelector('.tracy-wo-facts-band-body').textContent, /Instagram/)
    await m.press(m.button('social', '[media.add]'))
    assert.equal(social.hasAttribute('data-editing'), true)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    const select = social.querySelector('select')
    assert.deepEqual(
      [...select.options].map((o) => o.textContent),
      ['Instagram', 'WhatsApp', 'Other']
    )
    m.choose(select, 'whatsapp')
    const field = social.querySelector('.tracy-wo-facts-social-add input')
    assert.equal(field.placeholder, '+971 50 123 4567')
    assert.match(social.textContent, /social\.add\.number/)
    m.setValue(field, '+971 50 000 0000')
    await m.press(m.button('social', '[profile.edit.save]'))
    assert.deepEqual(m.calls, [
      ['social', { network: 'whatsapp', action: 'set', number: '+971 50 000 0000' }]
    ])
    assert.equal(social.querySelector('[role="alert"]').textContent, '[social.error.INVALID_PHONE]')
    // Other asks for the link's name too; Cancel closes the row without a call.
    m.choose(social.querySelector('select'), 'other')
    assert.equal(social.querySelectorAll('.tracy-wo-facts-social-add input').length, 2)
    await m.press(m.button('social', '[profile.edit.cancel]'))
    assert.equal(social.hasAttribute('data-editing'), false)
    assert.equal(m.calls.length, 1)
  } finally {
    m.done()
  }
  assert.deepEqual(lib.socialSetBody('instagram', ' @harbourkite ', ''), {
    network: 'instagram',
    action: 'set',
    handle: '@harbourkite'
  })
  assert.deepEqual(lib.socialSetBody('other', 'https://example.test/page', 'Booking page'), {
    network: 'other',
    action: 'set',
    url: 'https://example.test/page',
    label: 'Booking page'
  })
})

test('Edit of Social pages removes a link the owner typed; research pages are not offered', async () => {
  const m = mount()
  try {
    await m.press(m.band('social').querySelector('.tracy-wo-facts-slot-edit button'))
    const remove = [...m.band('social').querySelectorAll('button')].filter(
      (b) => b.textContent === '[social.remove]'
    )
    assert.equal(remove.length, 1)
    await m.press(remove[0])
    assert.deepEqual(m.calls, [['social', { network: 'instagram', action: 'remove' }]])
  } finally {
    m.done()
  }
})

test('a photo kept off the site is not a thumbnail of the Workspace card', () => {
  const media = lib.mediaRowView({ profile: PROFILE, media: MEDIA_ROWS.map(lib.mediaTile), sources: [] })
  const body = lib.factsBodyView({
    profile: PROFILE,
    candidate: {},
    media,
    locale: 'en',
    name: 'Harbour Kite Lessons'
  })
  assert.deepEqual(
    body.tiles.map((m) => m.id),
    [MEDIA_ROWS[0].id]
  )
})

test('a person the owner added reads as theirs, with no quote, even before any reading', () => {
  const view = lib.readingRowsView({
    readingCard: {
      method: 'owner',
      services: [],
      audience: [],
      serviceAreas: [],
      team: [{ id: 'ow_sam', label: 'Sam Tideway', source: { kind: 'owner' }, owner: true, photo: null }]
    }
  })
  assert.equal(view.team.length, 1)
  assert.equal(view.team[0].from, 'owner')
  assert.equal(view.team[0].owner, true)
  assert.equal(view.team[0].photoId, null)
})
