/**
 * The research card's source list: every source the place's research tried, Google and Tripadvisor too, each with its
 * status and reason, and a Retry on the rows of the place that were not collected.
 * Bundles the real component with React 18 (the one dsh's page runs) and renders it to static markup.
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-sources-'))
  const outfile = path.join(outDir, 'sources.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { Sources } from './inspector.tsx'
        export { ResearchAgainButton } from './research-again-dialog.tsx'
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
const SAGA = [
  { source: 'website', ref: 'http://www.cafevela.example/', status: 'complete', shared: true },
  {
    source: 'facebook',
    ref: 'https://www.facebook.com/cafevelaharbor',
    status: 'blocked',
    reason: 'credential_invalid',
    shared: true
  },
  {
    source: 'instagram',
    ref: 'https://www.instagram.com/cafe_vela',
    status: 'blocked',
    reason: 'credential_invalid',
    shared: true
  },
  { source: 'google-places', ref: 'ChIJ7GLyiwiEDFJCqesFGebCZqB', status: 'complete', shared: true },
  {
    source: 'google-maps',
    ref: 'https://www.google.com/maps/search/?api=1',
    status: 'complete',
    shared: true
  },
  { source: 'tripadvisor', ref: null, status: 'skipped', reason: 'not_found', shared: true }
]
const draw = (sources, retry) =>
  lib.renderToStaticMarkup(lib.createElement(lib.Sources, { t, sources, retry }))
const names = (html) => [...html.matchAll(/tracy-wo-src-name">.*?<\/svg>([^<]+)</g)].map((m) => m[1])

test('every source of the place is listed by name with its status and reason', () => {
  const html = draw(SAGA)
  assert.deepEqual(names(html), [
    '[source.website]',
    'Facebook',
    'Instagram',
    'Google Places',
    'Google Maps',
    'TripAdvisor'
  ])
  assert.match(html, /TripAdvisor<\/span><span class="tracy-wo-muted">\[source\.status\.skipped\]/)
  assert.match(html, /\[reason\.not_found\]/)
  assert.equal((html.match(/\[source\.status\.blocked\]/g) ?? []).length, 2)
  assert.equal((html.match(/\[reason\.other\]/g) ?? []).length, 2)
})

test('Retry shows on each source not collected, and only when the page can retry', () => {
  const retry = { busy: null, failed: null, onPress: () => {} }
  assert.equal((draw(SAGA, retry).match(/\[action\.retry\]/g) ?? []).length, 3)
  assert.doesNotMatch(draw(SAGA), /\[action\.retry\]/)
})

test('the source being retried has its button disabled, and a Retry that did not start says so on its row', () => {
  const html = draw(SAGA, { busy: 'facebook', failed: 'instagram', onPress: () => {} })
  assert.match(html, /<button[^>]*disabled=""[^>]*>\[action\.retry\]/)
  assert.equal((html.match(/role="alert"/g) ?? []).length, 1)
  assert.match(html, /role="alert">\[source\.retryFailed\]/)
})

const PAGES = {
  source: 'instagram-search',
  status: 'complete',
  reason: 'pending',
  shared: true,
  queries: 3,
  pages: [
    {
      url: 'https://www.instagram.com/samplesushi',
      network: 'instagram',
      verdict: 'pending',
      title: 'Sample Sushi (@samplesushi)',
      proofs: ['phone'],
      reasons: ['name_near', 'page_closed']
    },
    {
      url: 'https://www.instagram.com/sampleramen',
      network: 'instagram',
      verdict: 'rejected',
      title: null,
      proofs: [],
      reasons: ['locality_mismatch']
    }
  ]
}

test('a search row says what it found: each page with Needs a check or Not used, its proof and why; no confirm button', () => {
  const html = draw([PAGES], { busy: null, failed: null, onPress: () => {} })
  assert.deepEqual(names(html), ['[source.instagramSearch]'])
  assert.match(html, /<details class="tracy-wo-src" open="">/)
  assert.match(html, /tracy-wo-muted">\[again\.search\.pending\]/)
  assert.match(html, /\[again\.search\.queries\{&quot;count&quot;:3\}\]/)
  assert.match(html, /\[again\.page\.pending\].*instagram\.com\/samplesushi.*\[again\.page\.rejected\]/s)
  assert.match(html, /\[again\.proofs\{&quot;list&quot;:&quot;\[again\.proof\.phone\]&quot;\}\]/)
  assert.match(html, /\[again\.why\.name_near\] · \[again\.why\.page_closed\]/)
  assert.match(html, /\[again\.page\.pendingNote\]/)
  // A searched row is not a failure: no reason word, no Try again; customers never confirm a page.
  assert.doesNotMatch(html, /\[reason\.|\[action\.retry\]/)
})

test('a search that found nothing reads as such and can be tried again alone', () => {
  const html = draw(
    [
      {
        source: 'facebook-search',
        status: 'skipped',
        reason: 'not_found',
        shared: true,
        coverage: { version: 'social-search-2', queries: 3, pages: [] }
      }
    ],
    { busy: null, failed: null, onPress: () => {} }
  )
  assert.match(html, /\[source\.facebookSearch\].*\[again\.search\.none\]/s)
  assert.doesNotMatch(html, /\[reason\.not_found\]/)
  assert.match(html, /\[action\.retry\]/)
})

const control = (over) => ({
  phase: 'ready',
  open: false,
  busy: false,
  errorKey: null,
  onOpen() {},
  onClose() {},
  onConfirm() {},
  ...over
})
const button = (c) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.ResearchAgainButton, { t, locale: 'en', name: 'Sample Sushi Bar', control: c })
  )

test('Research again says how many parts need a new look; nothing due is a disabled Everything is up to date', () => {
  const plan = {
    run: [
      { part: 'tripadvisor', reason: 'failed', ceilingCents: 2 },
      { part: 'facebook-search', reason: 'never', ceilingCents: 4 }
    ],
    kept: [],
    ceilingCents: 6
  }
  const due = button(control({ preview: { plan, payer: 'account', open: true, left: 5 } }))
  assert.match(due, /<button[^>]*>.*\[again\.button\]<\/button>/s)
  assert.doesNotMatch(due, /disabled=""/)
  assert.match(due, /\[again\.due\.other\{&quot;count&quot;:2\}\]/)
  const fresh = button(
    control({
      preview: { plan: { run: [], kept: [], ceilingCents: 0 }, payer: 'account', open: true, left: 5 }
    })
  )
  assert.match(fresh, /<button[^>]*disabled=""[^>]*>.*\[again\.upToDate\]/s)
})

test('a closed door disables the button and says why; a place never researched shows no button', () => {
  const plan = { run: [{ part: 'website', reason: 'outdated', ceilingCents: 1 }], kept: [], ceilingCents: 1 }
  const closed = button(control({ preview: { plan, payer: 'tracy', open: false, left: null } }))
  assert.match(closed, /disabled=""/)
  assert.match(closed, /\[again\.closed\.public\]/)
  assert.equal(button(control({ preview: { plan: null, payer: 'tracy', open: true, left: null } })), '')
})
