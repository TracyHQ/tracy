/**
 * The host's decisions, pinned. Every case here is a request that must NOT become a file read, plus
 * the few that must. No server, no filesystem: `gallery.mjs` is pure on purpose.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  brandHostOf,
  brandRows,
  chipOfToken,
  chipToken,
  chosenId,
  copyFileName,
  fitScore,
  inlineBrandFonts,
  measure,
  parseRoute,
  slotLimits,
  validCopy,
  resolveBrandFile,
  resolveSystemFile,
  slimCatalog,
  systemsDirFor,
  validPicks
} from '../src/host/gallery.mjs'

const PREFIX = '/api/tracy-design-inspiration'
const IDS = new Set(['airbnb', 'bugatti'])

test('parseRoute: the four doors, and nothing else', () => {
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/catalog`), { kind: 'catalog' })
  assert.deepEqual(
    parseRoute(PREFIX, 'GET', `${PREFIX}/catalog?systems=all`),
    { kind: 'catalog', systems: 'all' },
    "the Design system panel's read"
  )
  assert.deepEqual(
    parseRoute(PREFIX, 'GET', `${PREFIX}/catalog?systems=yes`),
    { kind: 'catalog' },
    'only the one value'
  )
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/site?x=1`), { kind: 'site' })
  assert.deepEqual(parseRoute(PREFIX, 'POST', `${PREFIX}/choose`), { kind: 'choose' })
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/systems/airbnb/tokens.css`), {
    kind: 'system',
    id: 'airbnb',
    file: 'tokens.css'
  })
  assert.equal(parseRoute(PREFIX, 'GET', `${PREFIX}/choose`), null, 'choose is POST only')
  assert.equal(parseRoute(PREFIX, 'POST', `${PREFIX}/catalog`), null, 'catalog is GET only')
  assert.equal(parseRoute(PREFIX, 'GET', `${PREFIX}/systems/airbnb`), null, 'a directory is not a file')
  assert.deepEqual(
    parseRoute(PREFIX, 'GET', `${PREFIX}/systems/airbnb/system/kit.html`),
    { kind: 'system', id: 'airbnb', file: 'system/kit.html' },
    'a nested guideline file names itself; the list decides'
  )
  assert.equal(parseRoute(PREFIX, 'GET', '/api/other/catalog'), null)
})

test('resolveSystemFile: only a catalog id, only a listed file', () => {
  const ok = resolveSystemFile('/opt/x/systems', IDS, 'airbnb', 'tokens.css')
  assert.deepEqual(ok, { path: '/opt/x/systems/airbnb/tokens.css', type: 'text/css; charset=utf-8' })
  assert.equal(resolveSystemFile('/opt/x/systems', IDS, 'stripe', 'tokens.css'), null, 'not in this catalog')
  assert.equal(
    resolveSystemFile('/opt/x/systems', IDS, 'airbnb', 'manifest.json'),
    null,
    'file outside the list'
  )
  assert.equal(resolveSystemFile('/opt/x/systems', IDS, '..', 'tokens.css'), null)
  assert.equal(resolveSystemFile('/opt/x/systems', IDS, '../airbnb', 'tokens.css'), null)
  assert.equal(resolveSystemFile('/opt/x/systems', IDS, 'airbnb', '../bugatti/tokens.css'), null)
  assert.equal(resolveSystemFile('/opt/x/systems', IDS, 'airbnb', '/etc/passwd'), null)
  assert.equal(resolveSystemFile('/opt/x/systems', IDS, 'airbnb', 'constructor'), null, 'no prototype keys')
  assert.deepEqual(resolveSystemFile('/opt/x/systems', IDS, 'airbnb', 'system/kit.dark.html'), {
    path: '/opt/x/systems/airbnb/system/kit.dark.html',
    type: 'text/html; charset=utf-8'
  })
  assert.equal(
    resolveSystemFile('/opt/x/systems', IDS, 'airbnb', 'system/seed.json'),
    null,
    'nested but unlisted'
  )
})

test('slimCatalog: the grid fields, with shape defaults for a pre-classification catalog', () => {
  const slim = slimCatalog({
    systems: [
      {
        id: 'airbnb',
        name: 'Airbnb',
        category: 'E-Commerce & Retail',
        description: 'long',
        docLanguages: ['fr', 'vi'],
        nav: 'top-centered',
        hero: 'stack'
      },
      { id: 'old', name: 'Old' },
      { nope: true },
      null
    ]
  })
  assert.deepEqual(slim, [
    {
      id: 'airbnb',
      name: 'Airbnb',
      category: 'E-Commerce & Retail',
      nav: 'top-centered',
      hero: 'stack',
      dark: true,
      provider: 'Tracy',
      // A design system names no platform: see the rule test below.
      platforms: []
    },
    {
      id: 'old',
      name: 'Old',
      category: 'Uncategorised',
      nav: 'top-left',
      hero: 'split',
      dark: true,
      provider: 'Tracy',
      // A design system names no platform: see the rule test below.
      platforms: []
    }
  ])
  // dark.json decides; a row it does not know (a brand) stays true.
  const judged = slimCatalog(
    { systems: [{ id: 'airbnb' }, { id: 'playstation' }, { id: 'brand:x' }] },
    { airbnb: { safe: true }, playstation: { safe: false } }
  )
  assert.deepEqual(
    judged.map((r) => [r.id, r.dark]),
    [
      ['airbnb', true],
      ['playstation', false],
      ['brand:x', true]
    ]
  )
  assert.deepEqual(slimCatalog(null), [])
  assert.deepEqual(slimCatalog({ systems: 'x' }), [])
})

test('systemsDirFor: systems/ sits next to the real catalog.json', () => {
  assert.equal(
    systemsDirFor('/usr/lib/node_modules/@tracy/od-design-system/catalog.json'),
    '/usr/lib/node_modules/@tracy/od-design-system/systems'
  )
})

test('chosenId: one known id, nothing else', () => {
  assert.equal(chosenId({ id: 'bugatti' }, IDS), 'bugatti')
  assert.equal(chosenId({ id: 'stripe' }, IDS), null)
  assert.equal(chosenId({ id: 1 }, IDS), null)
  assert.equal(chosenId('bugatti', IDS), null)
  assert.equal(chosenId(null, IDS), null)
})

test('validPicks: catalog ids only, three at most, no duplicates, why trimmed', () => {
  assert.deepEqual(validPicks({ picks: [{ id: 'airbnb', why: ' warm ' }, { id: 'bugatti' }] }, IDS), [
    { id: 'airbnb', why: 'warm' },
    { id: 'bugatti', why: '' }
  ])
  assert.deepEqual(validPicks({ picks: [{ id: 'airbnb' }, { id: 'airbnb' }, { id: 'bugatti' }] }, IDS), [
    { id: 'airbnb', why: '' },
    { id: 'bugatti', why: '' }
  ])
  assert.equal(
    validPicks({ picks: [{ id: 'stripe' }] }, IDS),
    null,
    'an id outside the catalog refuses the call'
  )
  assert.equal(validPicks({ picks: [] }, IDS), null)
  assert.equal(validPicks({ picks: 'airbnb' }, IDS), null)
  assert.equal(validPicks(null, IDS), null)
  assert.equal(validPicks({ picks: [{ id: 'airbnb' }, 'bugatti'] }, IDS), null)
})

test('brandHostOf: only brand:<safe host> names a folder; the image ids and any path tricks do not', () => {
  assert.equal(brandHostOf('brand:fijitrips.example'), 'fijitrips.example')
  assert.equal(brandHostOf('brand:lucaswp.tracy.ai'), 'lucaswp.tracy.ai')
  assert.equal(brandHostOf('airbnb'), null)
  assert.equal(brandHostOf('brand:'), null)
  assert.equal(brandHostOf('brand:..'), null)
  assert.equal(brandHostOf('brand:../airbnb'), null)
  assert.equal(brandHostOf('brand:127.0.0.1'), null)
  assert.equal(brandHostOf('brand:localhost'), null, 'a single label is not a public host')
  assert.equal(brandHostOf('brand:Stripe.com'), null, 'ids are lowercase; the engine wrote them so')
})

test('resolveBrandFile: the same closed list, under the site folder', () => {
  assert.deepEqual(resolveBrandFile('/site', 'stripe.com', 'tokens.css'), {
    path: '/site/Brand/stripe.com/tokens.css',
    type: 'text/css; charset=utf-8'
  })
  assert.deepEqual(resolveBrandFile('/site', 'stripe.com', 'system/artifacts/poster.html'), {
    path: '/site/Brand/stripe.com/system/artifacts/poster.html',
    type: 'text/html; charset=utf-8'
  })
  assert.equal(resolveBrandFile('/site', 'stripe.com', 'manifest.json'), null, 'not a file the route serves')
  assert.equal(resolveBrandFile('/site', 'stripe.com', 'brand.json'), null)
  assert.equal(resolveBrandFile('/site', 'stripe.com', '../../etc/passwd'), null)
})

test('brandRows: own first, then newest reference; a manifest that does not match its folder is not a row', () => {
  const m = (host, kind, at, name) => ({
    id: `brand:${host}`,
    host,
    kind,
    name,
    category: kind === 'own' ? 'Your brand' : 'Reference',
    nav: 'top-left',
    hero: 'centered',
    source: { extractedAt: at }
  })
  const rows = brandRows([
    { dir: 'stripe.com', manifest: m('stripe.com', 'reference', '2026-09-06T01:00:00Z', 'Stripe') },
    {
      dir: 'fijitrips.example',
      manifest: m('fijitrips.example', 'own', '2026-09-05T00:00:00Z', 'Fiji Trips')
    },
    { dir: 'linear.app', manifest: m('linear.app', 'reference', '2026-09-06T02:00:00Z', 'Linear') },
    { dir: 'evil', manifest: m('stripe.com', 'reference', '2026-09-07T00:00:00Z', 'Spoof') },
    { dir: 'broken.example', manifest: null }
  ])
  assert.deepEqual(
    rows.map((r) => r.id),
    ['brand:fijitrips.example', 'brand:linear.app', 'brand:stripe.com']
  )
  assert.deepEqual(rows[0], {
    id: 'brand:fijitrips.example',
    name: 'Fiji Trips',
    category: 'Your brand',
    nav: 'top-left',
    hero: 'centered',
    dark: true,
    // A brand is Tracy's own reading of a site, styled by Tracy's themes — same provider as the 152.
    provider: 'Tracy',
    // 🔒 BUT BUILDABLE NOWHERE, AND THIS LINE USED TO SAY THE OPPOSITE. It read
    // `['joomla', 'wordpress']`, so both Create-with buttons lit up on a brand card — and the build
    // that followed provisioned a whole site and then failed at stage 1 of 6, because `checkStage`
    // refuses every `brand:` inspiration ("A brand has no theme style yet"). The customer paid a
    // provision to be asked whether to retry a step that cannot succeed. An empty list greys the
    // buttons and the dialog says why; `undefined` would mean "buildable everywhere".
    platforms: []
  })
  assert.deepEqual(brandRows([]), [])
})

test('inlineBrandFonts: ../fonts/ and ../../fonts/ urls become data: URLs; unknown files stay', () => {
  const html = `<style>@font-face{font-family:P;src:url("../fonts/poppins-400.woff2") format("woff2")}
@font-face{src:url(../../fonts/poppins-700.woff2)} .x{background:url(../fonts/nope.woff2)} .y{background:url(../imagery/a.jpg)}</style>`
  const out = inlineBrandFonts(html, (f) => (f.startsWith('poppins') ? Buffer.from(`<${f}>`) : null))
  assert.match(out, /src:url\(data:font\/woff2;base64,PHBvcHBpbnMtNDAwLndvZmYyPg==\) format/)
  assert.match(out, /url\(data:font\/woff2;base64,PHBvcHBpbnMtNzAwLndvZmYyPg==\)/)
  assert.match(out, /url\(\.\.\/fonts\/nope\.woff2\)/, 'a missing file is left alone')
  assert.match(out, /url\(\.\.\/imagery\/a\.jpg\)/, 'only fonts/ is inlined')
  assert.equal(
    inlineBrandFonts('<p>no fonts</p>', () => null),
    '<p>no fonts</p>'
  )
})

test('parseRoute: the copy doors — the file, one more version, one fewer, the remembered choice', () => {
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/copy/airbnb`), {
    kind: 'copy',
    id: 'airbnb',
    lang: ''
  })
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/copy/brand%3Astripe.com`), {
    kind: 'copy',
    id: 'brand:stripe.com',
    lang: ''
  })
  assert.deepEqual(parseRoute(PREFIX, 'POST', `${PREFIX}/copy/airbnb/pages/~about~/versions`), {
    kind: 'copyVersionCreate',
    id: 'airbnb',
    chip: '/about/',
    lang: ''
  })
  assert.deepEqual(parseRoute(PREFIX, 'POST', `${PREFIX}/copy/airbnb/pages/${chipToken('/')}/versions`), {
    kind: 'copyVersionCreate',
    id: 'airbnb',
    chip: '/',
    lang: ''
  })
  assert.equal(chipToken('/pricing/'), '~pricing~')
  assert.equal(chipToken('lucaswp.tracy.ai_landing'), 'lucaswp.tracy.ai_landing')
  assert.equal(chipOfToken('~pricing~'), '/pricing/')
  assert.deepEqual(parseRoute(PREFIX, 'DELETE', `${PREFIX}/copy/airbnb/pages/form/versions/v-1`), {
    kind: 'copyVersionDelete',
    id: 'airbnb',
    chip: 'form',
    vid: 'v-1',
    lang: ''
  })
  assert.deepEqual(parseRoute(PREFIX, 'PUT', `${PREFIX}/copy/airbnb/pages/form/selected`), {
    kind: 'copySelect',
    id: 'airbnb',
    chip: 'form',
    lang: ''
  })
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/copy/airbnb/jobs/v-1-ab`), {
    kind: 'copyJob',
    id: 'airbnb',
    job: 'v-1-ab',
    lang: ''
  })
  assert.equal(parseRoute(PREFIX, 'POST', `${PREFIX}/copy/airbnb`), null, 'the file itself is never POSTed')
  assert.equal(parseRoute(PREFIX, 'GET', `${PREFIX}/copy/airbnb/pages/form/versions`), null)
  assert.equal(
    parseRoute(PREFIX, 'DELETE', `${PREFIX}/copy/airbnb/pages/form`),
    null,
    'the old page door is gone'
  )
  assert.equal(copyFileName('brand:stripe.com'), 'brand--stripe.com.json')
  // One file per language, and the site's OWN first language keeps the bare name whatever it is —
  // a Vietnamese site's main file is `<id>.json` too, not `<id>.vi.json`. The bare name is what
  // every file written before today is called, so a site already running reads where it always did.
  // The language rides in the query, so no route changes shape and a client that names none still
  // asks for the site's own first language exactly as it did.
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/copy/airbnb?lang=vi`), {
    kind: 'copy',
    id: 'airbnb',
    lang: 'vi'
  })
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/copy/airbnb`), {
    kind: 'copy',
    id: 'airbnb',
    lang: ''
  })
  assert.equal(parseRoute(PREFIX, 'POST', `${PREFIX}/copy/airbnb/pages/~/versions?lang=ja`).lang, 'ja')
  assert.equal(copyFileName('airbnb'), 'airbnb.json')
  assert.equal(copyFileName('airbnb', ''), 'airbnb.json')
  assert.equal(copyFileName('airbnb', 'vi'), 'airbnb.vi.json')
  assert.equal(copyFileName('brand:stripe.com', 'ja'), 'brand--stripe.com.ja.json')
})

test('slotLimits / measure: paragraphs in characters, buttons ±15% words, the rest ±25% words', () => {
  assert.deepEqual(slotLimits({ role: 'paragraph', words: 46, chars: 300 }), {
    unit: 'chars',
    min: 225,
    max: 375
  })
  assert.deepEqual(slotLimits({ role: 'button', words: 4, chars: 20 }), { unit: 'words', min: 3, max: 5 })
  assert.deepEqual(slotLimits({ role: 'headline', words: 9, chars: 52 }), { unit: 'words', min: 6, max: 12 })
  assert.deepEqual(slotLimits({ role: 'label', words: 1, chars: 3 }), { unit: 'words', min: 1, max: 2 })
  assert.equal(measure('  one two  three ', 'words'), 3)
  assert.equal(measure(' abc ', 'chars'), 3)
})

const SLOTS = [
  { id: 'h1.0', role: 'headline', words: 9, chars: 52 },
  { id: 'p.1', role: 'paragraph', words: 46, chars: 300 },
  { id: 'a.0', role: 'button', words: 4, chars: 20 }
]

test('validCopy: over the ceiling is refused by name; under the floor passes with a warning; unknown ids refused', () => {
  const ok = validCopy(
    {
      slots: {
        'h1.0': 'One desk for every site you run, and one agent each',
        'a.0': 'Download for macOS',
        'p.1': 'x'.repeat(240)
      },
      lang: 'vi',
      brief: { goal: 'g', voice: 'v' }
    },
    SLOTS
  )
  assert.equal(ok.ok, true)
  assert.equal(ok.lang, 'vi')
  assert.deepEqual(ok.brief, { goal: 'g', voice: 'v' })
  assert.deepEqual(Object.keys(ok.slots), ['h1.0', 'a.0', 'p.1'])
  assert.deepEqual(ok.warnings, [])
  const long = validCopy({ slots: { 'h1.0': 'a b c d e f g h i j k l m n' } }, SLOTS)
  assert.equal(long.ok, false)
  assert.match(long.error, /h1\.0 14\/12 words/)
  assert.equal(long.offending[0].id, 'h1.0')
  const short = validCopy({ slots: { 'h1.0': 'Two words' } }, SLOTS)
  assert.equal(short.ok, true)
  assert.match(short.warnings[0], /^h1\.0: 2 words, below 6/)
  const unknown = validCopy({ slots: { 'h9.9': 'x' } }, SLOTS)
  assert.equal(unknown.ok, false)
  assert.match(unknown.error, /h9\.9/)
  assert.equal(validCopy({ slots: {} }, SLOTS).ok, false)
  assert.equal(validCopy({ slots: { 'h1.0': '   ' } }, SLOTS).ok, false)
  assert.equal(validCopy({}, SLOTS).ok, false)
  assert.equal(validCopy({ slots: { 'h1.0': 'x' }, lang: 'not a lang' }, SLOTS).lang, 'en')
})

test('fitScore: the brand itself is 1; a matching hue on the same canvas scores high; the opposite hue on a dark canvas low', () => {
  const brand = ':root {\n  --accent: #0071e3;\n  --bg: #ffffff;\n  --font-display: Inter, sans-serif;\n}'
  assert.equal(fitScore(brand, brand), 1)
  const close = ':root {\n  --accent: #1a6fd0;\n  --bg: #fafafa;\n  --font-display: Inter, sans-serif;\n}'
  const far = ':root {\n  --accent: #e3720a;\n  --bg: #0b0b0b;\n  --font-display: Playfair Display, serif;\n}'
  assert.ok(fitScore(brand, close) > 0.9, String(fitScore(brand, close)))
  assert.ok(fitScore(brand, far) < 0.15, String(fitScore(brand, far)))
  // A grey accent has no hue: the hue term falls to its middle, the canvas still counts.
  const grey = ':root {\n  --accent: #333333;\n  --bg: #ffffff;\n  --font-display: Inter;\n}'
  const g = fitScore(brand, grey)
  assert.ok(g > 0.6 && g < 0.9, String(g))
  assert.equal(fitScore('nothing', 'here'), 0)
})

test('parseRoute: the artifact slot map door', () => {
  assert.deepEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/systems/airbnb/artifact-slots/form`), {
    kind: 'artifactSlots',
    id: 'airbnb',
    type: 'form'
  })
  // Without a kind it is an ordinary (unknown) file request, refused later by the closed list.
  assert.notEqual(parseRoute(PREFIX, 'GET', `${PREFIX}/systems/airbnb/artifact-slots`)?.kind, 'artifactSlots')
})

/**
 * 🔒 THE GRID MUST NOT OFFER A BUILD THAT THE BUILD ITSELF REFUSES.
 *
 * `checkStage` refuses every `brand:` inspiration at stage 1 of 6 — "A brand has no theme style
 * yet" (`tracy-site-build-core/src/host/stages-shared.mjs`). A brand card that named platforms
 * therefore lit a button whose only possible ending was a provisioned site, a failed stage, and a
 * retry question nobody designed: `retryQuestion` raises it whenever a stage fails, so the cost of
 * one wrong field here is a question asked of every customer who presses, every time.
 *
 * This is pinned as a RULE over both functions rather than as one row's expected value, because the
 * value was already pinned once — with a comment explaining why it was right — and the pin is what
 * made the bug survive.
 */
test('no row from the catalog is ever offered as buildable, on either path into the grid', () => {
  const brandish = { id: 'brand:example.com', name: 'Example', category: 'Your brand' }
  const system = { id: 'acme', name: 'Acme', category: 'Bold' }

  // Every row this function makes is a design system — a look, not a site — and turning one into
  // a site is the dressing run, which is no longer a way in (24/09/2026: one creation flow, the
  // Add site wizard). What a customer can make is a quickstart, and those rows come from
  // `templates.mjs` with their own platforms. So "nowhere" is the honest answer for both kinds
  // here, and the grid shows them as Coming soon.
  const viaCatalog = slimCatalog({ systems: [brandish, system] })
  assert.deepEqual(viaCatalog.find((r) => r.id === 'brand:example.com').platforms, [])
  assert.deepEqual(viaCatalog.find((r) => r.id === 'acme').platforms, [])

  const viaBrandRows = brandRows([{ dir: 'example.com', manifest: { ...brandish, kind: 'own' } }])
  assert.deepEqual(viaBrandRows[0].platforms, [])

  // An empty list and an absent one are not the same thing to the dialog: it greys a button only
  // when the row NAMES platforms and this one is missing, so `undefined` reads as buildable
  // everywhere — which is exactly the state being fixed.
  assert.notEqual(viaBrandRows[0].platforms, undefined)
})
