/**
 * The Business facts sub-page keeps what the seller left off the site (#537, design A): the item stays in its band,
 * and its switch reads Off the site. The rating keeps its own choice in its cell; Opening hours are kept or left off
 * by the band's switch (no Keep / Leave off links), with the check note as an amber Check this chip in the header;
 * each Team member has its own small switch. Bundles the real page with React 18 and renders it to static markup.
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
    profileField: () => null,
    factSwitch: () => null,
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
// The header row of a band: its title, chips and the action cluster.
const head = (html, card) => {
  const b = band(html, card)
  return b.slice(b.indexOf('tracy-wo-facts-bh'), b.indexOf('tracy-wo-facts-band-body'))
}
// The rating choice sits in the rating cell, after the stars, not in the header.
const ratingLine = (html) => {
  const at = html.indexOf('tracy-wo-facts-stars')
  return html.slice(at, html.indexOf('class="tracy-wo-facts-cell"', at))
}
// The band switch in a header: its state and whether it can be pressed.
const bandSwitch = (html, card) => {
  const h = head(html, card)
  return h.slice(h.indexOf('tracy-wo-facts-slot-sw'), h.indexOf('tracy-wo-facts-slot-edit'))
}
const labels = (html) =>
  [...html.matchAll(/class="tracy-wo-facts-act"[^>]*>(?:<svg.*?<\/svg>)?([^<]*)</g)].map((m) => m[1])

test('a rating left off stays in the business band with the tag; Show on the site sits in the rating cell, only Edit in the header', () => {
  const html = draw(
    profile({
      rating: { state: 'left', score: 4.8, reviews: 40, few: false, choice: 'leave' },
      hoursCheck: { state: 'agreed', hours: DAYS.map((d) => `${d}: 09:00-17:00`) },
      team: []
    })
  )
  assert.match(html, /tracy-wo-facts-stars/)
  assert.match(band(html, 'business'), /tracy-wo-facts-off">\[facts\.leftOff\]/)
  assert.deepEqual(labels(head(html, 'business')), ['[profile.edit]'])
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
  assert.deepEqual(labels(head(html, 'business')), ['[profile.edit]'])
  assert.deepEqual(labels(ratingLine(html)), ['[rating.leave]'])
  assert.doesNotMatch(html, /facts\.leftOff/)
})

test('hours left off keep their days, dimmed; the band switch reads Off the site and can put them back', () => {
  const html = draw(
    profile({
      rating: null,
      hoursCheck: { state: 'chosen', choice: 'leave', hours: [], claims: CLAIMS },
      team: []
    })
  )
  const hours = band(html, 'hours')
  assert.match(hours, /Monday/)
  assert.match(html, /data-card="hours" data-off=""/)
  assert.match(bandSwitch(html, 'hours'), /aria-checked="false"/)
  assert.doesNotMatch(bandSwitch(html, 'hours'), /aria-disabled="true"/)
  assert.match(bandSwitch(html, 'hours'), /\[facts\.off\]/)
  assert.deepEqual(labels(head(html, 'hours')), ['[profile.edit]'])
  assert.doesNotMatch(hours, /hours\.leave|name\.keep|reading\.show|tracy-wo-facts-status/)
})

test('hours that wait for a check show the amber Check this chip with the note on hover; no Keep or Leave off links', () => {
  const html = draw(
    profile({ rating: null, hoursCheck: { state: 'check', hours: [], claims: CLAIMS }, team: [] })
  )
  assert.match(
    head(html, 'hours'),
    /<span class="tracy-wo-facts-chk" title="\[hours\.note[^"]*"><svg.*?<\/svg>\[name\.chip\.check\]<\/span>/
  )
  assert.match(bandSwitch(html, 'hours'), /aria-checked="true"/)
  assert.deepEqual(labels(head(html, 'hours')), ['[profile.edit]'])
  assert.doesNotMatch(band(html, 'hours'), /name\.keep|hours\.leave|tracy-wo-facts-note/)
})

test('each team member carries its own small switch: off for a person left off, on for one shown', () => {
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
  const body = team.slice(team.indexOf('tracy-wo-facts-band-body'))
  const [rina, omar] = body
    .split('<li')
    .slice(1, 3)
    .map((x) => x.slice(0, x.indexOf('</li>')))
  assert.match(rina, /^ data-off=""/)
  assert.match(rina, /Rina[^]*role="switch"[^]*aria-checked="false"[^]*\[facts\.off\]/)
  assert.match(omar, /Omar[^]*role="switch"[^]*aria-checked="true"[^]*\[facts\.on\]/)
  assert.doesNotMatch(team, /reading\.show|reading\.hide|facts\.leftOff/)
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
