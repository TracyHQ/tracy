// A live source for the visual review: a from-joomla spec-pack names its source pages by URL
// (reference.json `kind: url`, no rendered `path`) and carries no `locale`. The contract then reads
// each page's source at the `from` of the run's pairs, on the source's own origin, with the switch
// that puts a dark-by-default source into light. A pack that already has locales and rendered files
// takes the old road unchanged — that is visual-contract.test.mjs, not repeated here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContract, validateContract, pairFor } from '../visual/contract.mjs'
import { sourceUrlOf, siteLightHookOf } from '../visual/visual-qa.mjs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const pageMap = {
  source: { kind: 'joomla' },
  theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } },
  pages: [
    { file: 'index.html', view: 'front-page', title: 'Home', path: '/' },
    { file: 'pricing.html', view: 'page', title: 'Pricing', path: '/pricing' },
    { file: 'single.html', view: 'single', title: 'Post', path: '/index.php/blog/1-post', synthetic: true },
    { file: '404.html', view: '404', title: 'Not found', path: '/404', synthetic: true },
    { file: 'x.html', view: 'category', title: 'x', path: '/news', synthetic: true }
  ]
}
const reference = { kind: 'url', pages: [{ page: 'index.html', url: 'http://gone.test/home' }, { page: 'pricing.html', url: 'http://gone.test/pricing' }] }
const reviewConfig = { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, templates: { '/': 'front-page', '/pricing': 'page', '/index.php/blog/1-post': 'single', '/404': '404', '/nope': '404', '/home-blue': 'page-landing' } }
const seedReport = { routes: [{ path: '/index.php/blog/1-post', status: 301, location: 'http://wp.test/first-post/' }, { path: '/404', status: 404 }] }
const pairs = [
  { from: '/index.php/', to: '/' },
  { from: '/index.php/pricing', to: '/pricing' },
  { from: '/index.php/blog/1-post', to: '/first-post/' },
  { from: '/index.php/nope', to: '/nope', status: 404 },
  { from: '/index.php/home-blue', to: '/home-blue', view: 'page-landing', title: 'Blue' }
]
// The built theme has every template the config declares (contract.mjs checks each one).
const themeTemplates = new Set(Object.values(reviewConfig.templates))
const SITE = 'http://127.0.0.1:52002'
const build = (extra = {}) =>
  buildContract({ pageMap, reference, reviewConfig, themeTemplates, seedReport, specHash: 'sha256:abc', id: 'live', pairs, sourceSite: SITE, sourceLightHook: 'cookie:theme=light', ...extra })

test('a page-map without locales: every page is in the default locale, and the contract validates', () => {
  const c = buildContract({ pageMap, reference, reviewConfig, themeTemplates, specHash: 'sha256:abc', id: 'live' })
  assert.deepEqual(c.locales, ['en'])
  assert.ok(c.pages.every((p) => p.locale === 'en' && p.identity.lang === 'en'))
  assert.deepEqual(c.pages.map((p) => p.id), ['en-home', 'en-pricing'])
  // #75: the three synthetic pages are skipped but reported — validation names each until --pairs gives it a rule.
  assert.deepEqual(c.unpairedSynthetic.map((u) => u.path).sort(), ['/404', '/index.php/blog/1-post', '/news'])
  assert.equal(validateContract(c).length, 3)
  assert.ok(validateContract(c).every((e) => /^unpaired synthetic page /.test(e)))
})

test('without pairs nothing changes for a live source: synthetic pages skipped, no source route, no source site', () => {
  const c = buildContract({ pageMap, reference, reviewConfig, themeTemplates, specHash: 'sha256:abc', id: 'live' })
  assert.equal(c.pages.length, 2)
  assert.ok(c.pages.every((p) => p.sourceRendered === null && !('sourceRoute' in p)))
  assert.ok(!('site' in c.source) && !('lightHook' in c.source))
})

test('with pairs: each page reads its source at the pair `from`; the article and the 404 a pair names are measured; a pair with a view adds its page', () => {
  const c = build()
  const by = Object.fromEntries(c.pages.map((p) => [p.id, p]))
  assert.deepEqual(Object.keys(by).sort(), ['en-404', 'en-home', 'en-home-blue', 'en-index-php-blog-1-post', 'en-pricing'])
  assert.equal(by['en-pricing'].sourceRoute, '/index.php/pricing')
  assert.equal(by['en-home'].sourceRoute, '/index.php/')
  // the article: matched by its page-map path, measured where the visitor lands
  assert.equal(by['en-index-php-blog-1-post'].path, '/first-post/')
  assert.equal(by['en-index-php-blog-1-post'].sourceRoute, '/index.php/blog/1-post')
  // the 404: the pair that declares 404
  assert.equal(by['en-404'].path, '/nope')
  assert.equal(by['en-404'].status, 404)
  assert.equal(by['en-404'].sourceRoute, '/index.php/nope')
  // a pair-only page
  assert.equal(by['en-home-blue'].layout, 'page-landing')
  assert.deepEqual(by['en-home-blue'].source, ['/index.php/home-blue'])
  // the synthetic category no pair names stays out
  assert.ok(!c.pages.some((p) => p.pagemapPath === '/news'))
  assert.equal(c.source.site, SITE)
  assert.equal(c.source.lightHook, 'cookie:theme=light')
  assert.equal(c.source.darkHook, 'attr:data-theme=dark')
  // #75: the category no pair names is reported, not covered.
  assert.deepEqual(validateContract(c), ['unpaired synthetic page /news (category) has no source pair — give --pairs a rule for it'])
  assert.equal(build({ pairs: [...pairs, { from: '/index.php/news', to: '/news' }] }).unpairedSynthetic, undefined)
})

test('a pair that names no page and has no view is refused by name', () => {
  assert.throws(() => build({ pairs: [...pairs, { from: '/index.php/x', to: '/x' }] }), /pair \/index\.php\/x → \/x names no page-map page/)
})

test('a live-source page without a source site is refused by the validator', () => {
  const c = build({ sourceSite: null })
  assert.ok(validateContract(c).some((e) => /source route \/index\.php\/pricing but no source\.site/.test(e)))
})

test('pairFor: target path, page-map path, trailing slash, then the 404 pair', () => {
  assert.equal(pairFor(pairs, { path: '/pricing/' }).from, '/index.php/pricing')
  assert.equal(pairFor(pairs, { path: '/index.php/blog/1-post' }).to, '/first-post/')
  assert.equal(pairFor(pairs, { path: '/404', view: '404' }).status, 404)
  assert.equal(pairFor(pairs, { path: '/news', view: 'category' }), null)
  assert.equal(pairFor(null, { path: '/' }), null)
})

test('sourceUrlOf: a live page resolves on the contract source site; a rendered page keeps its file road; neither is null', () => {
  const contract = { source: { site: SITE } }
  assert.equal(sourceUrlOf({ sourceRendered: null, sourceRoute: '/index.php/pricing' }, { contract }), `${SITE}/index.php/pricing`)
  assert.equal(sourceUrlOf({ sourceRendered: null, sourceRoute: '/index.php/pricing' }, { contract: { source: {} } }), null)
  assert.equal(sourceUrlOf({ sourceRendered: null }, { contract }), null)
  // rendered snapshot whose file is not there: null, as before
  assert.equal(sourceUrlOf({ sourceRendered: 'reference/rendered/a--1440-light.html' }, { spec: '/nonexistent', contract }), null)
})

test('a URL pack with a captured reference uses the snapshot for visual QA, keeping live URL metadata out of the source route', () => {
  const capturedReference = {
    kind: 'html',
    pages: [{ page: 'index.html', path: 'reference/capture/pages/index.html' }]
  }
  const c = build({ reference: capturedReference })
  const home = c.pages.find((p) => p.id === 'en-home')
  assert.equal(home.sourceRendered, 'reference/capture/pages/index.html')
  assert.ok(!('sourceRoute' in home))

  const spec = mkdtempSync(join(tmpdir(), 'url-source-snapshot-'))
  try {
    const file = join(spec, 'reference/capture/pages/index.html')
    mkdirSync(join(spec, 'reference/capture/pages'), { recursive: true })
    writeFileSync(file, '<!doctype html><title>Captured</title>')
    const url = sourceUrlOf({
      sourceRendered: 'reference/capture/pages/index.html',
      sourceRoute: '/',
      url: 'https://source.test/'
    }, { spec, sourceSite: 'https://changed-live-site.test', contract: { source: { site: 'https://changed-live-site.test' } } })
    assert.equal(url, 'https://changed-live-site.test/capture/pages/index.html')
  } finally {
    rmSync(spec, { recursive: true, force: true })
  }
})

// The SITE side of a light axis: a port that is dark with no stored choice (review config
// `defaultTheme: "dark"`) must store "light" before the first request, or the light axis measures
// a dark site. Every other site sets nothing, as before.
test('siteLightHookOf: only a site declared dark by default (or an explicit flag) gets the light cookie', () => {
  const darkByDefault = build({ reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, defaultTheme: 'dark' } })
  assert.equal(darkByDefault.design.theme.default, 'dark')
  assert.equal(siteLightHookOf(darkByDefault), 'cookie:tracy_theme=light')
  const plain = build({ reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' } } })
  assert.ok(!('default' in plain.design.theme))
  assert.equal(siteLightHookOf(plain), null)
  assert.equal(siteLightHookOf(plain, 'cookie:x=light'), 'cookie:x=light')
  // dark by default but no cookie to store the choice in: nothing to set, not a guess
  const noStorage = build({ reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, defaultTheme: 'dark' } })
  assert.equal(siteLightHookOf(noStorage), null)
})

test('a source dark request hook is recorded only when given, and read by the runner from the contract', () => {
  const c = build({ sourceDarkRequestHook: 'cookie:ja_kinetic-theme=dark' })
  assert.equal(c.source.darkRequestHook, 'cookie:ja_kinetic-theme=dark')
  assert.ok(!('darkRequestHook' in build().source))
})

test('sourceUrlOf: the source site given on this run wins over the one baked into the contract', () => {
  const contract = { source: { site: 'http://127.0.0.1:52002' } }
  assert.equal(
    sourceUrlOf({ sourceRendered: null, sourceRoute: '/pricing' }, { contract, sourceSite: 'http://127.0.0.1:8251' }),
    'http://127.0.0.1:8251/pricing'
  )
  assert.equal(sourceUrlOf({ sourceRendered: null, sourceRoute: '/pricing' }, { contract }), 'http://127.0.0.1:52002/pricing')
})
