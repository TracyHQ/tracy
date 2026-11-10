/**
 * The Business facts sub-page as stacked fixed-height bands (#537, layout C): every band is drawn even when the
 * profile is empty (N/A), each band kind has one fixed height in the CSS and clips what does not fit, Show all
 * appears only past a band's capacity, Edit opens the side sheet instead of growing the band, and the source chips
 * still follow their values. Bundles the real page with React 18 and renders it to static markup. Every business in
 * this file is invented.
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

import { BAND_HEIGHTS, BAND_IDS } from '../src/client/business-facts-model.ts'
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

/** Draws the page; `calls` counts each time a band's fields are drawn. */
function draw({ profile = {}, reviews = [], sources = [], researched = true } = {}) {
  const calls = { field: 0, readingRows: 0 }
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
  const doors = {
    nameRow: null,
    saveName: async () => true,
    field: () => {
      calls.field += 1
      return null
    },
    saveHours: async () => 'ok',
    saveRating: async () => true,
    pickReading: async () => true,
    readingRows: () => {
      calls.readingRows += 1
      return null
    },
    keyMessages: null,
    uploadMedia: async () => null,
    retryLogo: { busy: false, failed: false, onPress: () => {} }
  }
  const html = lib.renderToStaticMarkup(
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
  return { html, calls }
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
const NA = 'tracy-wo-facts-na" title="[reason.not_found]">[facts.na]<'

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
  // The business band: no rating, no phone, no address read N/A too.
  assert.ok((band(html, 'business').match(/\[facts\.na\]/g) ?? []).length >= 3)
  assert.doesNotMatch(html, /tracy-wo-facts-grid"|tracy-wo-facts-col"/)
})

test('before research the bands say Not collected yet, never N/A', () => {
  const { html } = draw({ researched: false })
  assert.match(band(html, 'team'), /\[reason\.not_collected\]/)
  assert.doesNotMatch(band(html, 'team'), /\[facts\.na\]/)
})

test('the CSS fixes one height per band kind, taller under 720px, and clips every band', () => {
  for (const id of BAND_IDS) {
    const [wide, narrow] = BAND_HEIGHTS[id]
    assert.match(
      FACTS_BANDS_CSS,
      new RegExp(`\\.tracy-wo-facts-band\\[data-card='${id}'\\] \\{ height: var\\(--wo-band-${id}\\); \\}`)
    )
    assert.ok(FACTS_BANDS_CSS.includes(`--wo-band-${id}: ${wide}px;`), `${id} wide`)
    const narrowBlock = FACTS_BANDS_CSS.slice(FACTS_BANDS_CSS.indexOf('@container (max-width: 719px)'))
    assert.ok(narrowBlock.includes(`--wo-band-${id}: ${narrow}px;`), `${id} narrow`)
  }
  assert.match(FACTS_BANDS_CSS, /\.tracy-wo-facts-band \{[^}]*overflow: hidden;/)
  assert.match(FACTS_BANDS_CSS, /\.tracy-wo-facts-band-body \{[^}]*overflow: hidden;/)
  // Tokens only: no colour literal, and no halo on focus.
  assert.doesNotMatch(FACTS_BANDS_CSS, /#[0-9a-f]{3,8}\b|rgba?\(|box-shadow/i)
  assert.doesNotMatch(FACTS_BANDS_CSS, /`/)
})

test('Show all (n) appears only when a list holds more than its band shows', () => {
  const fit = draw({
    profile: {
      readingCard: {
        method: 'model',
        services: [1, 2].map(service),
        audience: [],
        serviceAreas: [],
        team: [],
        keyMessages: [1, 2].map(message)
      }
    },
    reviews: [1, 2].map(review)
  }).html
  for (const id of ['services', 'messages', 'reviews'])
    assert.doesNotMatch(head(fit, id), /facts\.showAll/, id)
  const many = draw({
    profile: {
      readingCard: {
        method: 'model',
        services: [1, 2, 3, 4, 5, 6, 7].map(service),
        audience: [],
        serviceAreas: [],
        team: [],
        keyMessages: [1, 2, 3, 4].map(message)
      }
    },
    reviews: [1, 2, 3, 4, 5].map(review)
  }).html
  assert.match(head(many, 'services'), /\[facts\.showAll\.count\{&quot;count&quot;:7\}\]/)
  // Key messages hold three at most (MAX_KEY_MESSAGES): all three fit the band, so it never needs Show all.
  assert.doesNotMatch(head(many, 'messages'), /facts\.showAll/)
  assert.match(head(many, 'reviews'), /\[facts\.showAll\.count\{&quot;count&quot;:5\}\]/)
  // The band itself keeps its capacity: three messages, four review cards, six service chips.
  assert.equal((band(many, 'messages').match(/\[facts\.message\.n/g) ?? []).length, 3)
  assert.equal((band(many, 'reviews').match(/<q /g) ?? []).length, 4)
  assert.equal((band(many, 'services').match(/tracy-wo-facts-pill/g) ?? []).length, 6)
})

test('Edit opens the side sheet: the band draws no field until it is pressed', () => {
  const { html, calls } = draw({
    profile: {
      bio: 'Kite lessons on the lagoon',
      readingCard: {
        method: 'model',
        services: [service(1)],
        audience: [],
        serviceAreas: [],
        team: [],
        keyMessages: []
      }
    }
  })
  for (const id of ['services', 'about']) {
    assert.match(head(html, id), /aria-haspopup="dialog"[^>]*>(<svg.*?<\/svg>)?\[profile\.edit\]/, id)
  }
  assert.doesNotMatch(html, /tracy-wo-facts-edit|<textarea|<input(?![^>]*type="file")/)
  assert.deepEqual(calls, { field: 0, readingRows: 0 })
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
  // Social pages: a linked chip with its glyph.
  assert.match(
    band(html, 'social'),
    /<a href="https:\/\/instagram\.example\/harbourkite"[^>]*><svg[^>]*data-logo="instagram"/
  )
})
