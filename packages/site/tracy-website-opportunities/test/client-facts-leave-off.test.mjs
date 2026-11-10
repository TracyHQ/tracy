/**
 * The Business facts sub-page keeps what the seller left off the site: the item stays on the card with a small
 * muted tag, and its control flips to Show on the site. The choices sit next to Edit in the card header (and right
 * aligned on a Team row). Bundles the real page with React 18 and renders it to static markup.
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
const head = (html, card) => {
  const at = html.indexOf(`data-card="${card}"`)
  return html.slice(at, html.indexOf('</div>', html.indexOf('tracy-wo-facts-card-head', at)))
}
// The rating choice sits on the rating line, after the stars, not in the card header.
const ratingLine = (html) => {
  const at = html.indexOf('tracy-wo-facts-stars')
  return html.slice(at, html.indexOf('</ul>', at))
}
const labels = (html) =>
  [...html.matchAll(/class="tracy-wo-facts-act"[^>]*>(?:<svg.*?<\/svg>)?([^<]*)</g)].map((m) => m[1])

test('a rating left off stays on the card with the tag, and Show on the site sits on the rating line and the header keeps only Edit', () => {
  const html = draw(
    profile({
      rating: { state: 'left', score: 4.8, reviews: 40, few: false, choice: 'leave' },
      hoursCheck: { state: 'agreed', hours: DAYS.map((d) => `${d}: 09:00-17:00`) },
      team: []
    })
  )
  const business = head(html, 'business')
  assert.match(html, /tracy-wo-facts-stars/)
  assert.match(html, /tracy-wo-facts-off">\[facts\.leftOff\]/)
  assert.deepEqual(labels(business), ['[profile.edit]'])
  assert.deepEqual(labels(ratingLine(html)), ['[rating.show]'])
})

test('a rating that shows offers Leave off the site on the rating line and no tag', () => {
  const html = draw(
    profile({
      rating: { state: 'shown', score: 4.8, reviews: 40, few: false, choice: 'show' },
      hoursCheck: { state: 'agreed', hours: DAYS.map((d) => `${d}: 09:00-17:00`) },
      team: []
    })
  )
  assert.deepEqual(labels(head(html, 'business')), ['[profile.edit]'])
  assert.deepEqual(labels(ratingLine(html)), ['[rating.leave]'])
  assert.doesNotMatch(html, /facts\.leftOff/)
})

test('hours left off keep their lines with the tag; the header offers Show on the site, then Edit', () => {
  const html = draw(
    profile({
      rating: null,
      hoursCheck: { state: 'chosen', choice: 'leave', hours: [], claims: CLAIMS },
      team: []
    })
  )
  const card = html.slice(html.indexOf('data-card="hours"'))
  assert.match(card, /Monday/)
  assert.match(card, /tracy-wo-facts-off">\[facts\.leftOff\]/)
  assert.deepEqual(labels(head(html, 'hours')), ['[reading.show]', '[profile.edit]'])
  assert.doesNotMatch(head(html, 'hours'), /hours\.leave/)
})

test('hours that wait for a check offer Keep and Leave off the site before Edit, the note keeps only its words', () => {
  const html = draw(
    profile({ rating: null, hoursCheck: { state: 'check', hours: [], claims: CLAIMS }, team: [] })
  )
  assert.deepEqual(labels(head(html, 'hours')), ['[name.keep]', '[hours.leave]', '[profile.edit]'])
  const note = html.slice(html.indexOf('tracy-wo-facts-note'))
  assert.doesNotMatch(note.slice(0, note.indexOf('</div>')), /<button/)
})

test('a team member left off stays in the list with the tag and a right aligned Show on the site', () => {
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
  const team = html.slice(html.indexOf('data-card="team"'))
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

test('source chips sit after their values, the old footer line is gone, and a photo carries its glyph badge', () => {
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
    /12 Lagoon Walk<span class="tracy-wo-sc" data-word="google" title="\[chip\.title\.collected/
  )
  assert.match(head(html, 'hours'), /tracy-wo-sc" data-word="google"/)
  // No source for the phone: no chip.
  assert.doesNotMatch(
    html.slice(html.indexOf('+10 555 0100'), html.indexOf('</li>', html.indexOf('+10 555 0100'))),
    /tracy-wo-sc/
  )
  const media = html.slice(html.indexOf('data-card="media"'))
  assert.equal((media.match(/tracy-wo-facts-bdg/g) ?? []).length, 1)
  assert.match(media, /source\.owner/)
})
