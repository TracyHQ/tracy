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
        export { Sources, SourcesTable } from './details-parts.tsx'
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
const names = (html) => [...html.matchAll(/tracy-wo-src-name">([^<]+)</g)].map((m) => m[1])

test('every source of the place is listed by name with its chip and one plain line, never a key error', () => {
  const html = draw(SAGA)
  assert.deepEqual(names(html), [
    '[source.website]',
    'Facebook',
    'Instagram',
    'Google Places',
    'Google Maps',
    'TripAdvisor'
  ])
  // Mock r5: Not available with Not found for this place, or Could not be read; never the server's own reason.
  assert.match(html, /TripAdvisor<\/span><span class="tracy-wo-src-sub">\[source\.notFoundHere\]/)
  assert.equal((html.match(/\[source\.chip\.notAvailable\]/g) ?? []).length, 3)
  assert.equal((html.match(/\[source\.couldNotRead\]/g) ?? []).length, 2)
  assert.doesNotMatch(html, /\[reason\.other\]|\[source\.status\.blocked\]/)
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
  assert.match(html, /tracy-wo-src-chip[^"]*">\[again\.search\.pending\]/)
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

// A business added by its links: a Google Maps link, an Instagram page and a listing page, all fictional.
const PASTED = [
  {
    source: 'instagram',
    ref: 'https://www.instagram.com/sample_bistro',
    status: 'complete',
    shared: true,
    pastedLink: 'https://www.instagram.com/sample_bistro'
  },
  { source: 'facebook-search', status: 'complete', reason: 'pending', shared: true },
  {
    source: 'google-places',
    ref: 'ChIJSampleBistroPlaceId00',
    status: 'complete',
    shared: true,
    pastedLink: 'https://maps.app.goo.gl/SampleBistro'
  },
  { source: 'google-maps', ref: null, status: 'failed', shared: true },
  { source: 'tripadvisor', ref: null, status: 'failed', shared: true },
  {
    source: 'listing',
    ref: 'https://www.listing.example/dubai/sample-bistro/store/1',
    status: 'complete',
    pastedLink: 'https://www.listing.example/dubai/sample-bistro/store/1'
  }
]

test('the links the owner pasted come first, each with The link you added and its address; the rest under Also looked at', () => {
  const html = draw(PASTED)
  assert.deepEqual(names(html), [
    'Instagram',
    'Google Places',
    '[source.listing{&quot;host&quot;:&quot;listing.example&quot;}]',
    '[source.facebookSearch]',
    'Google Maps',
    'TripAdvisor'
  ])
  assert.equal((html.match(/class="tracy-wo-src-link"/g) ?? []).length, 3)
  assert.match(
    html,
    /title="https:\/\/maps\.app\.goo\.gl\/SampleBistro"[^>]*>maps\.app\.goo\.gl\/SampleBistro</
  )
  assert.match(html, /<a href="https:\/\/maps\.app\.goo\.gl\/SampleBistro"/)
  const heading = html.indexOf('[source.alsoLookedAt]')
  assert.ok(heading > html.indexOf('[source.listing'), 'the heading comes after the pasted rows')
  assert.ok(heading < html.indexOf('[source.facebookSearch]'), 'and before what research found by itself')
  assert.equal((html.match(/\[source\.alsoLookedAt\]/g) ?? []).length, 1)
  // The pasted rows sit under their own heading, Used for this place.
  assert.ok(html.indexOf('[source.usedHere]') < html.indexOf('Instagram'))
})

test('Also looked at shows only when both groups have rows', () => {
  assert.doesNotMatch(draw(SAGA), /source\.alsoLookedAt/)
  assert.doesNotMatch(draw(PASTED.filter((s) => s.pastedLink)), /source\.alsoLookedAt|source\.usedHere/)
})

test('a listing row is named Listing with its host, and plain Listing when its address has none', () => {
  const plain = draw([{ source: 'listing', ref: null, status: 'complete' }])
  assert.deepEqual(names(plain), ['[source.listingPlain]'])
  const fromRef = draw([{ source: 'listing', ref: 'https://listing.example/p/1', status: 'complete' }])
  assert.deepEqual(names(fromRef), ['[source.listing{&quot;host&quot;:&quot;listing.example&quot;}]'])
})

test('a pasted link that is not an http address is not trusted as one', () => {
  const html = draw([
    {
      source: 'website',
      ref: 'https://bistro.example/',
      status: 'complete',
      pastedLink: 'javascript:alert(1)'
    }
  ])
  assert.doesNotMatch(html, /tracy-wo-src-pasted|javascript:/)
})

test('the Sources table of the Workspace card: a Source and a State column, no chips, no details (#537, option C)', () => {
  const sources = [
    {
      source: 'instagram',
      ref: 'https://www.instagram.com/sample_bistro',
      status: 'complete',
      collectedAt: '2026-11-10T08:00:00Z'
    },
    { source: 'listing', ref: 'https://www.listing.example/p/1', status: 'failed', reason: 'login_required' },
    { source: 'website', ref: 'https://bistro.example/', status: 'failed' },
    { source: 'facebook', ref: 'https://www.facebook.com/sample_bistro', status: null }
  ]
  const html = lib.renderToStaticMarkup(lib.createElement(lib.SourcesTable, { t, sources, researched: true }))
  assert.doesNotMatch(html, /<details|<summary|tracy-wo-src-chip|source\.alsoLookedAt|source\.usedHere/)
  assert.match(html, /\[source\.table\.source\][\s\S]*\[source\.table\.state\]/)
  assert.deepEqual(
    [...html.matchAll(/role="row" data-state="(\w+)"/g)].map((m) => m[1]),
    ['collected', 'failed', 'failed', 'new']
  )
  // Collected with its day; Could not collect with the server's reason, or alone when it sent none.
  assert.match(html, /\[source\.state\.collected\]<\/span><\/span><span class="tracy-wo-stab-detail">Nov 10</)
  assert.match(
    html,
    /\[source\.state\.failed\]<\/span><\/span><span class="tracy-wo-stab-detail">\[reason\.login_required\]</
  )
  // Each state is a pill that carries the Progress band's node: check, cross, hollow ring.
  const pills = [
    ...html.matchAll(
      /class="tracy-wo-stab-pill" data-state="(\w+)"><span class="tracy-wo-band-sub-node" data-node="(\w+)"/g
    )
  ]
  assert.deepEqual(
    pills.map((m) => [m[1], m[2]]),
    [
      ['collected', 'done'],
      ['failed', 'failed'],
      ['failed', 'failed'],
      ['new', 'waiting']
    ]
  )
  assert.equal((html.match(/tracy-wo-stab-detail/g) ?? []).length, 2)
  assert.match(html, /\[source\.state\.new\]/)
  // Each link stays an http(s) anchor opening a new tab, its full address in the title.
  assert.match(
    html,
    /<a href="https:\/\/www\.instagram\.com\/sample_bistro" target="_blank" rel="noopener noreferrer" title="https:\/\/www\.instagram\.com\/sample_bistro"[^>]*>instagram\.com\/sample_bistro<\/a>/
  )
})

test('while research runs, a row whose band item runs reads Reading now with the spinner node, in an accent pill', () => {
  const sources = [
    { source: 'google-places', status: null },
    { source: 'instagram', status: null, pastedLink: 'https://www.instagram.com/sample_bistro' },
    { source: 'website', status: null, pastedLink: 'https://bistro.example/' }
  ]
  const progress = new Map([
    ['google-places', 'done'],
    ['instagram', 'running']
  ])
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.SourcesTable, { t, sources, researched: false, progress })
  )
  assert.deepEqual(
    [...html.matchAll(/class="tracy-wo-stab-pill" data-state="(\w+)"/g)].map((m) => m[1]),
    ['collected', 'reading', 'waiting']
  )
  assert.match(html, /data-state="reading"><span class="tracy-wo-band-sub-node" data-node="running"/)
  assert.match(html, /\[source\.state\.reading\]/)
  assert.equal((html.match(/data-node="waiting"/g) ?? []).length, 1)
})

test('before research, the pasted links and the Google listing of a search read Waiting for research', () => {
  const sources = [
    { source: 'google-places', status: null, fromSearch: true },
    {
      source: 'instagram',
      ref: 'https://www.instagram.com/sample_bistro',
      status: null,
      pastedLink: 'https://www.instagram.com/sample_bistro'
    }
  ]
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.SourcesTable, { t, sources, researched: false })
  )
  assert.equal((html.match(/\[source\.state\.waiting\]/g) ?? []).length, 2)
  assert.match(
    html,
    /<a href="https:\/\/www\.instagram\.com\/sample_bistro"[^>]*>instagram\.com\/sample_bistro<\/a>/
  )
})
