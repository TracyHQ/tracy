/**
 * The Business facts sub-page keeps what the seller left off the site: the item stays in its band with a small
 * muted tag, and its control flips to Show on the site. The choices sit beside the value they change (the rating
 * cell, the last hours cell, each person of the Team row); Edit stays in the band's title column (the corner of the
 * business band). Bundles the real page with React 18 and renders it to static markup.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-facts-leave-off.test.mjs
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
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-facts-leave-off-'))
  const outfile = path.join(outDir, 'facts.cjs')
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
const DAYS = ['Monday', 'Tuesday', 'Wednesday']
const person = (extra) => ({
  id: 't1',
  label: 'Rina',
  quote: 'q',
  source: { kind: 'review' },
  role: 'coach',
  ...extra
})
const profile = ({ rating, hoursCheck, team }) => ({
  address: '12 Lagoon Walk',
  phone: '+10 555 0100',
  googleRating: rating,
  hoursCheck,
  readingCard: { method: 'model', services: [], audience: [], serviceAreas: [], team, keyMessages: [] }
})
const CLAIMS = [{ source: 'google', hours: DAYS.map((d) => `${d}: 09:00-17:00`) }]
const MEDIA = {
  logo: { state: 'notCollected' },
  colors: { state: 'none' },
  photos: { groups: [], hidden: [] },
  videos: { tiles: [] },
  files: []
}
const draw = (p, { media = MEDIA, running = true, sources = [] } = {}) => {
  const view = lib.businessFactsView({
    profile: p,
    candidate: { name: 'Harbour Kite Lessons' },
    name: 'Harbour Kite Lessons',
    researched: true,
    approval: { profile: 'needed' },
    briefCreatedAt: null,
    colors: [],
    reviews: [],
    sources
  })
  const doors = {
    nameRow: null,
    saveName: async () => true,
    field: () => null,
    saveHours: async () => 'ok',
    saveRating: async () => true,
    pickReading: async () => true,
    readingRows: () => null,
    keyMessages: null,
    uploadMedia: async () => null,
    retryLogo: { busy: false, failed: false, onPress: () => {} }
  }
  return lib.renderToStaticMarkup(
    lib.createElement(lib.BusinessFactsPage, {
      t,
      locale: 'en',
      view,
      media,
      doors,
      food: false,
      websiteLink: (u) => u,
      researchDetails: null,
      running
    })
  )
}
// One band of the page, from its section to the next one.
const band = (html, card) => {
  const at = html.indexOf(`data-card="${card}"`)
  const end = html.indexOf('<section', at)
  return html.slice(at, end === -1 ? undefined : end)
}
// The title column of a band: its title, chips and controls (Show all, Edit).
const head = (html, card) => {
  const b = band(html, card)
  return b.slice(b.indexOf('tracy-wo-facts-band-label'), b.indexOf('tracy-wo-facts-band-body'))
}
// The business band's Edit sits in its top right corner.
const corner = (html) => {
  const at = html.indexOf('tracy-wo-facts-corner')
  return html.slice(at, html.indexOf('</button>', at) + 9)
}
// The rating choice sits in the rating cell, after the stars, not beside Edit.
const ratingLine = (html) => {
  const at = html.indexOf('tracy-wo-facts-stars')
  return html.slice(at, html.indexOf('class="tracy-wo-facts-cell"', at))
}
// The last cell of the hours band: the check, the tag and the choices.
const status = (html) => {
  const b = band(html, 'hours')
  return b.slice(b.indexOf('tracy-wo-facts-status'))
}
const labels = (html) =>
  [...html.matchAll(/class="tracy-wo-facts-act"[^>]*>(?:<svg.*?<\/svg>)?([^<]*)</g)].map((m) => m[1])

test('a rating left off stays in the business band with the tag; Show on the site sits in the rating cell, Edit alone in the corner', () => {
  const html = draw(
    profile({
      rating: { state: 'left', score: 4.8, reviews: 40, few: false, choice: 'leave' },
      hoursCheck: { state: 'agreed', hours: DAYS.map((d) => `${d}: 09:00-17:00`) },
      team: []
    })
  )
  assert.match(html, /tracy-wo-facts-stars/)
  assert.match(band(html, 'business'), /tracy-wo-facts-off">\[facts\.leftOff\]/)
  assert.deepEqual(labels(corner(html)), ['[profile.edit]'])
  assert.deepEqual(labels(ratingLine(html)), ['[rating.show]'])
})

test('a rating that shows offers Leave off the site in the rating cell and no tag', () => {
  const html = draw(
    profile({
      rating: { state: 'shown', score: 4.8, reviews: 40, few: false, choice: 'show' },
      hoursCheck: { state: 'agreed', hours: DAYS.map((d) => `${d}: 09:00-17:00`) },
      team: []
    })
  )
  assert.deepEqual(labels(corner(html)), ['[profile.edit]'])
  assert.deepEqual(labels(ratingLine(html)), ['[rating.leave]'])
  assert.doesNotMatch(html, /facts\.leftOff/)
})

test('hours left off keep their days with the tag; the last cell offers Show on the site, the title column only Edit', () => {
  const html = draw(
    profile({
      rating: null,
      hoursCheck: { state: 'chosen', choice: 'leave', hours: [], claims: CLAIMS },
      team: []
    })
  )
  const hours = band(html, 'hours')
  assert.match(hours, /Monday/)
  assert.match(hours, /tracy-wo-facts-cells" data-off=""/)
  assert.match(status(html), /tracy-wo-facts-off">\[facts\.leftOff\]/)
  assert.deepEqual(labels(status(html)), ['[reading.show]'])
  assert.deepEqual(labels(head(html, 'hours')), ['[profile.edit]'])
  assert.doesNotMatch(hours, /hours\.leave/)
})

test('hours that wait for a check offer Keep and Leave off the site in the last cell; the note opens in Show all, not in the band', () => {
  const html = draw(
    profile({ rating: null, hoursCheck: { state: 'check', hours: [], claims: CLAIMS }, team: [] })
  )
  assert.deepEqual(labels(status(html)), ['[name.keep]', '[hours.leave]'])
  assert.deepEqual(labels(head(html, 'hours')), [
    '[facts.showAll.count{&quot;count&quot;:3}]',
    '[profile.edit]'
  ])
  assert.doesNotMatch(band(html, 'hours'), /tracy-wo-facts-note/)
  assert.match(status(html), /title="\[hours\.note/)
})

test('a team member left off stays in the row with the tag and its own Show on the site', () => {
  const html = draw(
    profile({
      rating: null,
      hoursCheck: { state: 'agreed', hours: DAYS.map((d) => `${d}: 09:00-17:00`) },
      team: [
        person({ reviewsOnly: true, onSite: false }),
        person({ id: 't2', label: 'Omar', reviewsOnly: true, onSite: true })
      ]
    })
  )
  const team = band(html, 'team')
  const [rina, omar] = team
    .split('<li')
    .slice(1, 3)
    .map((x) => x.slice(0, x.indexOf('</li>')))
  assert.match(rina, /Rina/)
  assert.match(rina, /facts\.leftOff/)
  assert.deepEqual(labels(rina), ['[reading.show]'])
  assert.doesNotMatch(omar, /facts\.leftOff/)
  assert.deepEqual(labels(omar), ['[reading.hide]'])
})

test('source chips sit right after their values, and a photo carries its glyph badge', () => {
  const tile = (id, source) => ({
    id,
    kind: 'image',
    category: 'photo',
    stored: true,
    source,
    sourceUrl: null
  })
  const html = draw(
    {
      ...profile({
        rating: null,
        hoursCheck: { state: 'agreed', hours: ['Monday: 09:00-17:00'], claims: CLAIMS },
        team: []
      }),
      provenance: { address: { source: 'google' } }
    },
    {
      running: false,
      sources: [{ source: 'google-places', collectedAt: '2026-11-09T08:00:00Z' }],
      media: {
        ...MEDIA,
        photos: { groups: [{ tiles: [tile('m1', 'instagram'), tile('m2', 'owner')] }], hidden: [] }
      }
    }
  )
  assert.doesNotMatch(html, /brief\.source\.from|reading\.from\./)
  assert.match(
    html,
    /title="12 Lagoon Walk">12 Lagoon Walk<\/span><span class="tracy-wo-sc" data-word="google" title="\[chip\.title\.collected/
  )
  assert.match(head(html, 'hours'), /tracy-wo-sc" data-word="google"/)
  // No source for the phone: no chip.
  assert.doesNotMatch(
    html.slice(
      html.indexOf('+10 555 0100'),
      html.indexOf('class="tracy-wo-facts-cell"', html.indexOf('+10 555 0100'))
    ),
    /tracy-wo-sc/
  )
  const media = band(html, 'media')
  assert.equal((media.match(/tracy-wo-facts-bdg/g) ?? []).length, 1)
  assert.match(media, /source\.owner/)
})
