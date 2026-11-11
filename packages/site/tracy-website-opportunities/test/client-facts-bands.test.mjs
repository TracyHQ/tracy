/**
 * The Business facts sub-page as stacked bands (#537, design A): every band is drawn even when the profile is empty
 * (N/A alone, no chip), every band header carries the same action cluster in the same slots ([Add more] on Photos &
 * video only, the switch, Edit), the business and research bands are locked, no band offers Show all or opens a
 * sheet, every band shares one collapsed height and long rows scroll sideways, and the source chips still follow
 * their values. Bundles the real page with React 18 and renders it to static markup. Every business in this file
 * is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-facts-bands.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { BAND_BREAKPOINTS, BAND_HEIGHT, BAND_IDS } from '../src/client/business-facts-model.ts'
import { FACTS_BANDS_CSS } from '../src/client/facts-bands-css.ts'

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
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-facts-bands-'))
  const outfile = path.join(outDir, 'bands.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
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
  if (outDir) rmSync(outDir, { recursive: true, force: true })
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
const MEDIA = {
  logo: { state: 'none' },
  colors: { state: 'none' },
  photos: { groups: [], hidden: [] },
  videos: { tiles: [] },
  files: []
}
const message = (n) => ({
  id: `k${n}`,
  label: `Message ${n} of the kite school`,
  quotes: [{ quote: `Quote ${n}` }]
})
const service = (n) => ({ id: `s${n}`, label: `Lesson ${n}`, quote: 'q', source: { kind: 'bio' } })
const review = (n) => ({
  author: `Guest ${n}`,
  text: `A calm day on the lagoon, number ${n}.`,
  rating: 5,
  source: 'google'
})

const DOORS = {
  nameRow: null,
  saveName: async () => true,
  profileField: () => null,
  saveHours: async () => 'ok',
  saveRating: async () => true,
  pickReading: async () => true,
  factSwitch: () => null,
  readingRows: () => null,
  keyMessages: null,
  uploadMedia: async () => null,
  retryLogo: { busy: false, failed: false, onPress: () => {} },
  owner: OWNER
}

/** Draws the page with stubbed doors. */
function draw({
  profile = {},
  reviews = [],
  sources = [],
  researched = true,
  media = MEDIA,
  doors = {}
} = {}) {
  const view = lib.businessFactsView({
    profile,
    candidate: { name: 'Harbour Kite Lessons' },
    name: 'Harbour Kite Lessons',
    researched,
    approval: { profile: 'needed' },
    briefCreatedAt: null,
    colors: [],
    reviews,
    sources
  })
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.BusinessFactsPage, {
      t,
      locale: 'en',
      view,
      media,
      doors: { ...DOORS, ...doors },
      food: false,
      websiteLink: (u) => u,
      running: false
    })
  )
  return { html }
}
const band = (html, id) => {
  const at = html.indexOf(`data-card="${id}"`)
  const end = html.indexOf('<section', at)
  return html.slice(at, end === -1 ? undefined : end)
}
const head = (html, id) => {
  const b = band(html, id)
  return b.slice(0, b.indexOf('tracy-wo-facts-band-body'))
}
const switchOf = (html, id) => {
  const h = head(html, id)
  return h.slice(h.indexOf('tracy-wo-facts-slot-sw'), h.indexOf('tracy-wo-facts-slot-edit'))
}
const NA = 'tracy-wo-facts-na" title="[reason.not_found]">[facts.na]<'
const FULL = {
  readingCard: {
    method: 'model',
    services: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(service),
    audience: [],
    serviceAreas: [],
    team: [],
    keyMessages: [1, 2, 3].map(message)
  }
}

test('an empty profile still draws every band, in order, each with N/A', () => {
  const { html } = draw()
  const order = [...html.matchAll(/<section class="tracy-wo-facts-band" data-card="([a-z]+)"/g)].map(
    (m) => m[1]
  )
  assert.deepEqual(order, [...BAND_IDS])
  for (const id of [
    'hours',
    'services',
    'about',
    'team',
    'messages',
    'reviews',
    'social',
    'media',
    'research'
  ])
    assert.ok(band(html, id).includes(NA), `${id} reads N/A`)
  // The business band: no type, phone, address or website read N/A (the rating sits in What guests say).
  assert.equal((band(html, 'business').match(/\[facts\.na\]/g) ?? []).length, 4)
})

test('a missing value reads N/A alone: no source chip, no Not found chip, no second line', () => {
  const { html } = draw({ profile: { phone: '+10 555 0100' } })
  const business = band(html, 'business')
  const website = business.slice(business.indexOf('>[my.field.website]<') + 1)
  assert.match(
    website,
    /^\[my\.field\.website\]<\/span><span class="tracy-wo-facts-ln"><span class="tracy-wo-facts-na"[^>]*>\[facts\.na\]<\/span><\/span><\/div>/
  )
  assert.doesNotMatch(website, /tracy-wo-sc|\[facts\.website\.none\]/)
  // A band with nothing has no chip in its header either.
  for (const id of ['hours', 'about']) assert.doesNotMatch(head(html, id), /tracy-wo-sc/, id)
})

test('before research the bands say Not collected yet, never N/A', () => {
  const { html } = draw({ researched: false })
  assert.match(band(html, 'team'), /\[reason\.not_collected\]/)
  assert.doesNotMatch(band(html, 'team'), /\[facts\.na\]/)
})

test('every band header holds one cluster, in one order: [Add more] on Photos & video and Social pages, the switch, Edit', () => {
  const { html } = draw({ profile: FULL })
  for (const id of BAND_IDS) {
    const h = head(html, id)
    const slots = [...h.matchAll(/class="tracy-wo-facts-slot-([a-z]+)"/g)].map((m) => m[1])
    assert.deepEqual(slots, id === 'media' || id === 'social' ? ['add', 'sw', 'edit'] : ['sw', 'edit'], id)
    assert.equal((h.match(/class="tracy-wo-facts-cl"/g) ?? []).length, 1, id)
    assert.match(h, /role="switch"/, id)
    assert.match(h, /\[profile\.edit\]<\/button><\/span><\/span><\/div><div class="$/, id)
  }
  // The slots keep fixed widths so the switches and Edit line up down the page, close together.
  assert.match(FACTS_BANDS_CSS, /\.tracy-wo-facts-cl \{[^}]*gap: 8px; margin-left: auto; \}/)
  assert.match(FACTS_BANDS_CSS, /\.tracy-wo-facts-slot-sw \{ width: \d+px; \}/)
  assert.match(FACTS_BANDS_CSS, /\.tracy-wo-facts-slot-edit \{ width: \d+px;/)
})

test('locked bands: Business always on, Research details always off with its reason by the title', () => {
  const { html } = draw({ profile: FULL })
  const business = switchOf(html, 'business')
  assert.match(business, /title="\[facts\.lock\.business\]"/)
  assert.match(business, /aria-checked="true"/)
  assert.match(business, /aria-disabled="true"|data-disabled/)
  assert.match(business, /\[facts\.on\]<\/span><svg[^>]*tracy-wo-facts-lock/)
  const research = head(html, 'research')
  assert.match(
    research,
    /<span class="tracy-wo-facts-aside" title="\[facts\.lock\.research\]">\[facts\.lock\.research\]<\/span>/
  )
  assert.match(switchOf(html, 'research'), /aria-checked="false"/)
  assert.match(switchOf(html, 'research'), /tracy-wo-facts-lock/)
  assert.match(
    research,
    /<button type="button" class="tracy-wo-facts-act" disabled="" title="\[facts\.edit\.research\]"/
  )
  // What guests say is not locked: no lock, no tone-only sentence.
  assert.doesNotMatch(head(html, 'reviews'), /tracy-wo-facts-lock|facts\.reviews\.note/)
  for (const id of BAND_IDS.filter((b) => b !== 'business' && b !== 'research'))
    assert.doesNotMatch(switchOf(html, id), /tracy-wo-facts-lock/, id)
})

test('a band switch follows its facts and flips through the door; a band with nothing to leave off says so', () => {
  const { html } = draw({
    profile: FULL,
    doors: {
      factSwitch: (fields) => (fields.includes('services') ? { on: false, set: async () => true } : null)
    }
  })
  assert.match(switchOf(html, 'services'), /aria-checked="false"[^]*\[facts\.off\]/)
  assert.doesNotMatch(switchOf(html, 'services'), /aria-disabled="true"|data-disabled=""/)
  assert.match(html, /data-card="services" data-off=""/)
  assert.match(switchOf(html, 'about'), /title="\[facts\.switch\.nothing\]"/)
  assert.doesNotMatch(html, /facts\.switch\.notStored/)
})

test('no band offers Show all or Show less, and nothing opens a sheet or a dialog', () => {
  const { html } = draw({
    profile: FULL,
    reviews: [1, 2, 3, 4, 5, 6].map(review)
  })
  assert.doesNotMatch(html, /showAll|showLess|Show all|Show less|facts\.open\]|facts\.close\]/)
  assert.doesNotMatch(html, /aria-haspopup|role="dialog"|tracy-wo-facts-sheet/)
  // Every item is in its row: nine service chips, six review cards.
  assert.equal((band(html, 'services').match(/tracy-wo-facts-pill/g) ?? []).length, 9)
  assert.equal((band(html, 'reviews').match(/<q /g) ?? []).length, 6)
  // Key messages stay three cells.
  assert.equal((band(html, 'messages').match(/\[facts\.message\.n/g) ?? []).length, 3)
})

test('Photos & video has exactly one Add more, in the cluster, the formats as its title; no add tile', () => {
  const tile = (id, kind = 'image') => ({
    id,
    kind,
    stored: true,
    source: 'instagram',
    sourceUrl: null,
    category: 'other'
  })
  const media = {
    ...MEDIA,
    photos: { groups: [{ tiles: [tile('p1'), tile('p2')] }], hidden: [] },
    videos: { tiles: [tile('v1', 'video')] }
  }
  const { html } = draw({ media })
  assert.equal((band(html, 'media').match(/\[media\.add\]/g) ?? []).length, 1)
  assert.match(head(html, 'media'), /<span class="tracy-wo-facts-slot-add">.*title="\[media\.addHint\]"/)
  assert.doesNotMatch(html, /tracy-wo-add-tile|\[facts\.media\.more/)
  // The hint shows only as the title until Edit.
  assert.doesNotMatch(band(html, 'media'), />\[media\.addHint\]</)
  assert.match(band(html, 'media'), /aria-pressed="true">\[facts\.media\.all\{&quot;count&quot;:3\}\]/)
  assert.equal((band(html, 'media').match(/class="tracy-wo-tile"/g) ?? []).length, 3)
})

test('every band shares one collapsed height per breakpoint; long rows scroll sideways, the scrollbar hidden', () => {
  const [mid, narrow] = BAND_BREAKPOINTS
  const [wideH, midH, narrowH] = BAND_HEIGHT
  const midBlock = FACTS_BANDS_CSS.slice(
    FACTS_BANDS_CSS.indexOf(`@container wo-facts (max-width: ${mid - 1}px)`),
    FACTS_BANDS_CSS.indexOf(`@container wo-facts (max-width: ${narrow - 1}px)`)
  )
  const narrowBlock = FACTS_BANDS_CSS.slice(
    FACTS_BANDS_CSS.indexOf(`@container wo-facts (max-width: ${narrow - 1}px)`)
  )
  assert.match(
    FACTS_BANDS_CSS,
    new RegExp(`\\.tracy-wo-facts \\{ container: wo-facts / inline-size; --wo-band-h: ${wideH}px;`)
  )
  assert.ok(midBlock.includes(`--wo-band-h: ${midH}px;`))
  assert.ok(narrowBlock.includes(`--wo-band-h: ${narrowH}px;`))
  assert.match(
    FACTS_BANDS_CSS,
    /\.tracy-wo-facts-band \{[^}]*height: var\(--wo-band-h\);[^}]*overflow: hidden;/
  )
  // Only Edit makes a band taller; no per-band height is left.
  assert.match(FACTS_BANDS_CSS, /\.tracy-wo-facts-band\[data-editing\] \{ height: auto;/)
  assert.doesNotMatch(
    FACTS_BANDS_CSS,
    /--wo-band-(business|hours|services|about|team|brand|messages|reviews|social|media|research)/
  )
  assert.match(
    FACTS_BANDS_CSS,
    /\.tracy-wo-facts-row \{ overflow-x: auto; overflow-y: hidden; scrollbar-width: none;/
  )
  assert.match(FACTS_BANDS_CSS, /\.tracy-wo-facts-row::-webkit-scrollbar \{ display: none; \}/)
  // Tokens only: no colour literal, no alias of dsh, and no halo on focus.
  assert.doesNotMatch(FACTS_BANDS_CSS, /#[0-9a-f]{3,8}\b|rgba?\(|box-shadow: 0|--dsw-alias/i)
  assert.doesNotMatch(FACTS_BANDS_CSS, /`/)
  const tiles = {
    ...MEDIA,
    videos: { tiles: [{ id: 'v1', kind: 'video', stored: true, source: 'instagram', sourceUrl: null }] }
  }
  const { html } = draw({
    profile: { ...FULL, hoursCheck: { state: 'none' }, googleHours: [`Monday: 09:00 - 18:00`] },
    reviews: [review(1)],
    media: tiles,
    sources: [{ source: 'instagram', ref: 'https://instagram.example/harbourkite' }]
  })
  for (const id of ['services', 'reviews', 'media', 'social'])
    assert.match(band(html, id), /tracy-wo-facts-row/, id)
})

test('the business band draws the whole name, then phone, address and website; no rating cell', () => {
  const name = 'Harbour Kite Lessons and Paddle Club Bay'
  const view = lib.businessFactsView({
    profile: {
      phone: '+10 555 0100',
      address: '12 Lagoon Walk, Sandbar Bay',
      googleRating: { state: 'shown', score: 4.8, reviews: 40, few: false, choice: 'show' }
    },
    candidate: { name },
    name,
    researched: true,
    approval: { profile: 'needed' },
    briefCreatedAt: null,
    colors: [],
    reviews: [],
    sources: []
  })
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.BusinessFactsPage, {
      t,
      locale: 'en',
      view,
      media: MEDIA,
      doors: DOORS,
      food: false,
      websiteLink: (u) => u,
      running: false
    })
  )
  const business = band(html, 'business')
  assert.match(business, new RegExp(`<span class="tracy-wo-facts-ell" title="${name}">${name}</span>`))
  const labels = [...business.matchAll(/class="tracy-wo-facts-ck" title="([^"]*)"/g)].map((m) => m[1])
  assert.deepEqual(labels, ['[field.phone]', '[field.address]', '[my.field.website]'])
  assert.doesNotMatch(business, /tracy-wo-facts-stars/)
  assert.match(
    business,
    /<span class="tracy-wo-facts-ell tracy-wo-facts-keep" title="\+10 555 0100">\+10 555 0100<\/span>/
  )
  // Four cells in one row on a wide page, then any other business fact; the row scrolls sideways when narrower.
  assert.match(
    FACTS_BANDS_CSS,
    /\[data-card='business'\] \.tracy-wo-facts-cells \{ grid-template-columns: minmax\(200px, 1\.4fr\)/
  )
})

test('the source chips still follow their values in the bands', () => {
  const { html } = draw({
    profile: {
      readingCard: {
        method: 'model',
        services: [service(1)],
        audience: [],
        serviceAreas: [],
        team: [],
        keyMessages: []
      }
    },
    reviews: [review(1)],
    sources: [{ source: 'instagram', ref: 'https://instagram.example/harbourkite' }]
  })
  assert.match(band(html, 'services'), /Lesson 1<\/span><span class="tracy-wo-sc" data-word="bio"/)
  assert.match(band(html, 'reviews'), /Guest 1<\/span><span class="tracy-wo-sc" data-word="review"/)
  assert.match(
    band(html, 'social'),
    /<a href="https:\/\/instagram\.example\/harbourkite"[^>]*><svg[^>]*data-logo="instagram"/
  )
})
