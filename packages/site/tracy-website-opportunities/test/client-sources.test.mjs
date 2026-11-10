/**
 * The Sources table of Details (#537): every source the place's research tried, one line each with its state pill, a
 * Try again on the rows that could not be collected, and the remove control on the links the owner pasted. The
 * Sources sub-page and its Also looked at group are gone. Research again's button (the public Find) is here too.
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
        export * as parts from './details-parts.tsx'
        export { SourcesTable } from './details-parts.tsx'
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
const draw = (sources, extra = {}) =>
  lib.renderToStaticMarkup(lib.createElement(lib.SourcesTable, { t, sources, researched: true, ...extra }))
const names = (html) => [...html.matchAll(/tracy-wo-stab-name">([^<]+)</g)].map((m) => m[1])
const noRetry = { busy: null, failed: null, onPress: () => {} }

test('the Sources sub-page list is gone: only the table is drawn', () => {
  assert.equal(lib.parts.Sources, undefined)
  assert.equal(typeof lib.parts.SourcesTable, 'function')
})

test('every source of the place is listed by name with its state pill, never a key error', () => {
  const html = draw(SAGA)
  assert.deepEqual(names(html), [
    '[source.website]',
    'Facebook',
    'Instagram',
    'Google Places',
    'Google Maps',
    'TripAdvisor'
  ])
  assert.equal((html.match(/class="tracy-wo-stab-word">\[source\.state\.failed\]/g) ?? []).length, 3)
  assert.doesNotMatch(html, /\[reason\.other\]|\[source\.status\.blocked\]|<details|tracy-wo-src-chip/)
})

test('Try again shows under the pill of each source not collected, and only when the page can retry', () => {
  const html = draw(SAGA, { retry: noRetry })
  assert.equal((html.match(/\[action\.retry\]/g) ?? []).length, 3)
  // Under the pill: inside the State part of a failed row, after its pill.
  assert.match(
    html,
    /data-state="failed">(?:(?!<\/li>).)*class="tracy-wo-stab-pill" data-state="failed">(?:(?!<\/li>).)*class="tracy-wo-stab-act"[^>]*>\[action\.retry\]/s
  )
  assert.doesNotMatch(draw(SAGA), /\[action\.retry\]/)
  // A collected row never offers it.
  assert.doesNotMatch(draw(SAGA.slice(0, 1), { retry: noRetry }), /\[action\.retry\]/)
})

test('the source being retried has its button disabled, and a Try again that did not start says so on its row', () => {
  const html = draw(SAGA, { retry: { busy: 'facebook', failed: 'instagram', onPress: () => {} } })
  assert.match(html, /<button[^>]*disabled=""[^>]*>\[action\.retry\]/)
  assert.equal((html.match(/role="alert"/g) ?? []).length, 1)
  assert.match(html, /role="alert">\[source\.retryFailed\]/)
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

test('no Also looked at group and no search pages after research, whatever the rows hold', () => {
  const html = draw(PASTED, { retry: noRetry })
  assert.doesNotMatch(html, /alsoLookedAt|usedHere|again\.page|again\.search|tracy-wo-search-page/)
  assert.equal((html.match(/class="tracy-wo-src-link tracy-wo-stab-link"/g) ?? []).length, 3)
  assert.match(html, /<a href="https:\/\/maps\.app\.goo\.gl\/SampleBistro"/)
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

test('the Sources table of the Workspace card: one line per source, the state pill on the right, no chips (#537)', () => {
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
  assert.doesNotMatch(html, /<details|<summary|tracy-wo-src-chip|role="table"|role="cell"/)
  assert.match(html, /<ul class="tracy-wo-stab" aria-label="\[details\.section\.sources\]">/)
  assert.deepEqual(
    [...html.matchAll(/<li class="tracy-wo-stab-row" data-state="(\w+)"/g)].map((m) => m[1]),
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

const INSTAGRAM = 'https://www.instagram.com/sample_bistro'
const LISTING = 'https://www.listing.example/dubai/sample-bistro/store/1'
const removeAt = (over = {}) => ({
  step: null,
  notice: null,
  onAsk() {},
  onKeep() {},
  onConfirm() {},
  ...over
})

test('each pasted link has a remove control after its pill; the Google place and rows research found have none', () => {
  const html = draw(PASTED, { remove: removeAt() })
  const labels = [...html.matchAll(/class="tracy-wo-stab-remove"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1])
  assert.equal(labels.length, 2)
  assert.equal(labels[0], '[source.remove.label{&quot;name&quot;:&quot;Instagram&quot;}]')
  assert.match(labels[1], /^\[source\.remove\.label\{&quot;name&quot;:&quot;\[source\.listing/)
  // After the pill, at the end of the row's line.
  assert.match(
    html,
    /class="tracy-wo-stab-state">(?:(?!<\/li>).)*<\/span><button type="button" class="tracy-wo-stab-remove"/s
  )
  // No remove where the page cannot remove.
  assert.doesNotMatch(draw(PASTED), /tracy-wo-stab-remove/)
})

test('pressing remove turns the row state into an inline confirm with Remove and Keep', () => {
  const html = draw(PASTED, { remove: removeAt({ step: { url: INSTAGRAM, phase: 'confirm' } }) })
  assert.equal((html.match(/\[source\.remove\.ask\]/g) ?? []).length, 1)
  assert.match(
    html,
    /data-state="collected"><span class="tracy-wo-stab-line">(?:(?!<\/li>).)*\[source\.remove\.ask\](?:(?!<\/li>).)*data-danger=""[^>]*>\[source\.remove\.confirm\]<\/button><button[^>]*>\[source\.remove\.keep\]/s
  )
  // The row asked about shows the question in place of its pill, and its own remove control steps aside.
  assert.equal((html.match(/class="tracy-wo-stab-remove"/g) ?? []).length, 1)
})

test('while the remove runs the row is muted with a spinner node and its control is disabled', () => {
  const html = draw(PASTED, { remove: removeAt({ step: { url: LISTING, phase: 'pending' } }) })
  assert.match(html, /<li class="tracy-wo-stab-row" data-state="collected" data-pending="" aria-busy="true">/)
  assert.match(
    html,
    /aria-busy="true">(?:(?!<\/li>).)*\[source\.remove\.removing\](?:(?!<\/li>).)*class="tracy-wo-stab-remove is-on"[^>]*disabled=""/s
  )
})

test('a refusal leaves its one line under the row it was pressed on', () => {
  for (const key of [
    'source.remove.error.LAST_SOURCE',
    'source.remove.error.JOB_ACTIVE',
    'source.remove.error.GOOGLE_LINK_NOT_REMOVED',
    'action.failed'
  ]) {
    const html = draw(PASTED, { remove: removeAt({ notice: { url: INSTAGRAM, key } }) })
    assert.match(
      html,
      new RegExp(
        `instagram\\.com/sample_bistro<\\/a>(?:(?!<\\/li>).)*<p class="tracy-wo-error tracy-wo-stab-notice" role="alert">\\[${key.replace(/\./g, '\\.')}\\]<\\/p><\\/li>`,
        's'
      ),
      key
    )
  }
})

test('Already gone shows at the foot once the row went; a row still there after it reads the generic error', () => {
  const gone = { url: 'https://gone.example/', key: 'source.remove.error.NOT_FOUND' }
  const foot = draw(PASTED, { remove: removeAt({ notice: gone }) })
  assert.match(
    foot,
    /<li class="tracy-wo-stab-foot"><p[^>]*role="alert">\[source\.remove\.error\.NOT_FOUND\]<\/p><\/li><\/ul>$/
  )
  const still = draw(PASTED, { remove: removeAt({ notice: { url: INSTAGRAM, key: gone.key } }) })
  assert.match(still, /role="alert">\[action\.failed\]/)
  assert.doesNotMatch(still, /NOT_FOUND/)
})
