// /ops/wo › Settings › Provider order: per capability group a Default card, then "If <default> can't
// answer, try these next, in order" with Move up / Move down, and each provider's state. The order
// logic is pure (`wo-provider-order.ts`); the panel is rendered to markup and read back.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { en } from '../src/i18n/ns/wo-misc.ts'
import { translate } from '../src/i18n/translator.ts'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

// Read from the bundle below: the order logic reaches the i18n barrel (relative time), which only a bundle resolves.
let asDefault,
  draftOrderOf,
  misorderText,
  moved,
  providerReportText,
  providerStateText,
  withGroupOrder,
  withoutProvider

/** The screens' English, as `useT()` reads it with no language loaded. */
const t = (key, params) => translate('en', {}, en, key, params)

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.resolve(pkgRoot, '../../../package.json'))
const NOW = Date.parse('2026-10-23T12:00:00Z')

const FACEBOOK = {
  id: 'facebook',
  label: 'Facebook page',
  providers: [
    { id: 'scrapecreators', label: 'ScrapeCreators', credential: 'scrapecreators', state: 'connected' },
    {
      id: 'rapidapi-scraper3',
      label: 'RapidAPI · Facebook Scraper3',
      credential: 'rapidapi',
      state: 'missing_key'
    },
    {
      id: 'apify',
      label: 'Apify',
      credential: 'apify',
      state: 'error',
      lastError: { reason: 'credential_invalid', at: '2026-10-23T10:00:00Z' }
    }
  ],
  order: ['scrapecreators', 'rapidapi-scraper3', 'apify'],
  declared: false,
  defaultOrder: ['scrapecreators', 'rapidapi-scraper3', 'apify']
}
const INSTAGRAM = {
  id: 'instagram',
  label: 'Instagram profile',
  providers: [
    { id: 'scrapecreators', label: 'ScrapeCreators', credential: 'scrapecreators', state: 'limit_reached' },
    { id: 'apify', label: 'Apify', credential: 'apify', state: 'connected' }
  ],
  order: [],
  declared: true,
  defaultOrder: ['scrapecreators', 'apify']
}

test('order edits: move, make default, remove; a group edit declares it, a reset forgets it', () => {
  assert.deepEqual(moved(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b'])
  assert.deepEqual(moved(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'], 'the first stays first')
  assert.deepEqual(moved(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c'], 'the last stays last')
  assert.deepEqual(asDefault(['a', 'b', 'c'], 'c'), ['c', 'a', 'b'])
  assert.deepEqual(asDefault(['a'], 'z'), ['z', 'a'], 'a provider not in use becomes the default')
  assert.deepEqual(withoutProvider(['a', 'b'], 'a'), ['b'])
  const declared = withGroupOrder({ tiktok: [] }, 'facebook', ['apify'])
  assert.deepEqual(declared, { tiktok: [], facebook: ['apify'] })
  assert.deepEqual(withGroupOrder(declared, 'facebook', null), { tiktok: [] })
})

test("the draft order: what the operator declared, else the group's default", () => {
  assert.deepEqual(draftOrderOf(FACEBOOK, {}), { order: FACEBOOK.defaultOrder, declared: false })
  assert.deepEqual(draftOrderOf(FACEBOOK, { facebook: ['apify'] }), { order: ['apify'], declared: true })
  assert.deepEqual(draftOrderOf(INSTAGRAM, { instagram: [] }), { order: [], declared: true })
})

test('each provider state reads as a short phrase', () => {
  assert.equal(providerStateText(t, FACEBOOK.providers[0], NOW), 'Connected')
  assert.equal(providerStateText(t, FACEBOOK.providers[1], NOW), 'Missing key')
  assert.equal(providerStateText(t, INSTAGRAM.providers[0], NOW), 'Limit reached today')
  assert.equal(providerStateText(t, FACEBOOK.providers[2], NOW), 'Last error: key refused, 2 hours ago')
})

let lib
before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { WoProviderOrderPanel } from './WoProviderOrder'; export * from './wo-provider-order'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom/server'],
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports)
  lib = module.exports
  ;({
    asDefault,
    draftOrderOf,
    misorderText,
    moved,
    providerReportText,
    providerStateText,
    withGroupOrder,
    withoutProvider
  } = lib)
})

const render = (props) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.WoProviderOrderPanel, { writable: true, onChange: () => {}, now: NOW, ...props })
  )
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

test("the panel: Default card, the fallback list in order, each provider's state", () => {
  const html = render({ groups: [FACEBOOK], providerOrder: {} })
  const t = text(html)
  assert.match(t, /Facebook page/)
  assert.match(t, /ScrapeCreators Default Connected/)
  assert.match(t, /If ScrapeCreators can't answer, try these next, in order/)
  assert.ok(t.indexOf('RapidAPI · Facebook Scraper3') < t.indexOf('Apify'), 'fallbacks keep the order')
  assert.match(t, /1 RapidAPI · Facebook Scraper3 Missing key/)
  assert.match(t, /2 Apify Last error: key refused, 2 hours ago/)
  assert.match(t, /Make default/)
  assert.match(t, /Default order/)
  assert.equal((html.match(/aria-label="Move up"/g) ?? []).length, 2)
  assert.equal((html.match(/aria-label="Move down"/g) ?? []).length, 2)
  // The first fallback cannot go up, the last cannot go down.
  assert.match(html, /aria-label="Move up"[^>]*disabled=""|disabled=""[^>]*aria-label="Move up"/)
})

test('a group switched off says so and offers its providers back', () => {
  const t = text(render({ groups: [INSTAGRAM], providerOrder: { instagram: [] } }))
  assert.match(t, /Off: research does not ask anyone for this/)
  assert.match(t, /Not used/)
  assert.match(t, /Reset to default/)
  assert.match(t, /ScrapeCreators Limit reached today/)
})

test('read-only viewers see the order without controls', () => {
  const html = render({ groups: [FACEBOOK], providerOrder: {}, writable: false })
  assert.equal((html.match(/<button/g) ?? []).length, 0)
})

test('a group research does not read yet is shown without controls', () => {
  const html = render({
    groups: [{ ...FACEBOOK, id: 'map-discovery', label: 'Find places in an area', wired: false }],
    providerOrder: {}
  })
  assert.match(text(html), /Not wired yet/)
  assert.equal((html.match(/<button/g) ?? []).length, 0)
})

test('a wired group with one provider shows its Default card and a switch-off, with no empty fallback list', () => {
  const MENU_PHOTOS = {
    id: 'menu-photos',
    label: 'Menu photos',
    providers: [
      {
        id: 'serpapi-google-maps',
        label: 'SerpApi Google Maps (Menu photos)',
        credential: 'serpapi',
        state: 'connected'
      }
    ],
    order: ['serpapi-google-maps'],
    defaultOrder: ['serpapi-google-maps'],
    declared: false,
    wired: true
  }
  const html = render({ groups: [MENU_PHOTOS], providerOrder: {} })
  const words = text(html)
  assert.match(words, /SerpApi Google Maps \(Menu photos\)/)
  assert.doesNotMatch(words, /Not wired yet/)
  assert.doesNotMatch(words, /try these next/, 'nothing to fall back to')
  assert.ok((html.match(/<button/g) ?? []).length >= 1, 'it can be switched off')
})

test('no capability block from the server: the panel says nothing is loaded', () => {
  assert.match(text(render({ groups: undefined, providerOrder: {} })), /Provider order is not available/)
})

// Numbers per provider and the bold "misordered" mark (Lee, 23/10/2026): read-only, the operator re-orders.
const REPORTED = {
  ...FACEBOOK,
  order: ['apify', 'scrapecreators', 'rapidapi-scraper3'],
  defaultOrder: ['apify', 'scrapecreators', 'rapidapi-scraper3'],
  reportMinCalls: 30,
  providers: [
    {
      ...FACEBOOK.providers[2],
      state: 'connected',
      lastError: undefined,
      report: {
        enough: true,
        calls: 40,
        usable: 40,
        usableRate: 1,
        cost: { kind: 'real', perCallCents: 30, perUsableCents: 30 },
        misordered: { basis: 'cost', than: 'scrapecreators', times: 3 }
      }
    },
    {
      ...FACEBOOK.providers[0],
      report: {
        enough: true,
        calls: 50,
        usable: 40,
        usableRate: 0.8,
        cost: { kind: 'ceiling', perCallCents: 2, perUsableCents: 2.5 }
      }
    },
    { ...FACEBOOK.providers[1], report: { enough: false, calls: 12 } }
  ]
}

test('report text: numbers, a ceiling said as one, and the muted line under 30 calls', () => {
  const [apify, sc, scraper3] = REPORTED.providers
  assert.equal(
    providerReportText(t, apify, 30),
    '40 calls · 100% usable · $0.300 a call · $0.300 a usable result'
  )
  assert.equal(
    providerReportText(t, sc, 30),
    '50 calls · 80% usable · at most $0.020 a call · at most $0.025 a usable result · reserved ceiling, not a bill'
  )
  assert.equal(providerReportText(t, scraper3, 30), 'Not enough data yet: 12 of 30 calls')
  assert.equal(providerReportText(t, FACEBOOK.providers[0], 30), null, 'an older server sends no report')
})

test('the misorder reason names the provider placed after it', () => {
  assert.equal(
    misorderText(t, { basis: 'cost', than: 'scrapecreators', times: 3 }, 'ScrapeCreators'),
    'Costs 3× more per usable result than ScrapeCreators, which is placed after it'
  )
  assert.equal(
    misorderText(t, { basis: 'rate', than: 'scrapecreators', times: 2.5 }, 'ScrapeCreators'),
    'Gives a usable result 2.5× less often than ScrapeCreators, which is placed after it'
  )
  assert.equal(
    misorderText(t, { basis: 'cost', than: 'scrapecreators', times: null }, 'ScrapeCreators'),
    'Costs money per usable result, while ScrapeCreators, placed after it, costs nothing'
  )
  assert.equal(
    misorderText(t, { basis: 'rate', than: 'scrapecreators', times: null }, 'ScrapeCreators'),
    'Never gave a usable result, while ScrapeCreators, placed after it, did'
  )
})

test('the panel: a bold mark on the misordered provider, the muted line on one short of data', () => {
  const html = render({ groups: [REPORTED], providerOrder: {} })
  assert.match(html, /<strong class="font-semibold">Apify<\/strong>/)
  assert.match(
    html,
    /<p class="font-semibold text-foreground" data-misordered="cost">Costs 3× more per usable result than ScrapeCreators, which is placed after it<\/p>/
  )
  assert.match(html, /<p class="text-muted-foreground">Not enough data yet: 12 of 30 calls<\/p>/)
  assert.equal(html.match(/data-misordered/g)?.length, 1, 'only the misordered provider is marked')
  assert.doesNotMatch(html, /<strong[^>]*>ScrapeCreators/)
  // No press applies a suggestion: the presses are the manual ones the panel always had.
  assert.doesNotMatch(text(html), /Apply|Suggest|Auto/i)
})
