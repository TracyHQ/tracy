#!/usr/bin/env node
// Builds qa.contract.json for the pages built so far. Everything that is a DECISION (which pages, which rules, which strings the
// source says) is written here; every number is MEASURED:
//   - `design.rules[].styles` are measured on the running site (SITE_URL), per variant, then frozen in the contract;
//   - `source.files` are hashed by `tools/qa-contract.mjs init` (run first; this script keeps its `source` block).
//   node ingest/build-contract.mjs --site http://127.0.0.1:4360 [--out qa.contract.json]
// Run it from the package root after `node tools/qa-contract.mjs init source/snapshot qa.contract.json --config template.config.json`.
// Page families add their rows through `ingest/contract-pages/<family>.json` (one file each, so agents can work in parallel).
import { withPatches } from '../tools/qa-contract.mjs'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { launchBrowser } from '../tools/qa-browser.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const SITE = opt('--site', 'http://127.0.0.1:4360')
const OUT = opt('--out', 'qa.contract.json')
const contract = JSON.parse(readFileSync(OUT, 'utf8'))
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const HOME_SRC = 'index.html'
const POST_SRC = 'detail/layout-1/index.html'
const E404_SRC = 'nope-404/index.html'
const POST_PATH = '/blog/abstract-wonders-exploring-line-art-composition-blog-health'
const ALL = contract.variants.map((v) => v.id)

// ── rules: id → site selector, which page file it is read from, optional on pages/variants that may lack it ───
const RULES = [
  ['body-type', 'body', HOME_SRC],
  ['nav-link', '.es-nav li:not(.is-active) > a:not(:hover)', HOME_SRC, true],
  ['nav-font', '.es-nav li > a', HOME_SRC, true, ['font-size']],
  ['strip-title', '.es-strip-item h3', HOME_SRC],
  ['lead-title', '.es-lead-item h3', HOME_SRC],
  ['card-title', '.es-card-title', HOME_SRC],
  ['card-intro', '.es-card-intro', HOME_SRC],
  ['pill', '.es-card .es-pill', HOME_SRC],
  ['page-h1', 'main h1', HOME_SRC, true],
  ['pager', '.es-pagination a', HOME_SRC],
  ['page-count', '.es-page-count', HOME_SRC],
  ['strip-meta', '.es-strip-meta', HOME_SRC],
  ['footer-text', '.es-footer-left p', HOME_SRC],
  ['footer-button', '.es-footer-right .es-btn', HOME_SRC],
  ['copyright', '.es-copyright', HOME_SRC],
  ['nf-code', '.es-404 h1', E404_SRC],
  ['nf-title', '.es-404 h2', E404_SRC],
  ['nf-text', '.es-404 p', E404_SRC],
  ['nf-button', '.es-404 .es-btn', E404_SRC]
]
const DEFAULT_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'color',
  'background-color'
]
const BASE = ['body-type', 'nav-link', 'nav-font', 'footer-text', 'footer-button', 'copyright']
// Order matters: a rule is measured on the first page that carries it.
const PAGES_OF = {
  'en-home': [...BASE, 'strip-title', 'lead-title', 'card-title', 'card-intro', 'pill', 'page-h1', 'pager', 'page-count', 'strip-meta'],
  'en-not-found': [...BASE, 'nf-code', 'nf-title', 'nf-text', 'nf-button']
}
const PAGE_URL = { 'en-home': '/', 'en-not-found': '/404' }
// ── page families: ingest/contract-pages/<family>.json, one per family, each written by the agent that built it.
//   { layout: {id, view, family?}, rules: [[id, selector, sourceFile, optional?, props?]], parity: {name: {site, source}},
//     pages: [{ id, path, status?, source: [file], identity, collections, rules: [ids], parity: [names], content: [F-args] }] }
// `rules` of a page are the ones it adds to BASE; a rule id is measured on the first page that carries it.
const FRAGMENTS = existsSync('ingest/contract-pages')
  ? readdirSync('ingest/contract-pages')
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(readFileSync(`ingest/contract-pages/${f}`, 'utf8')))
  : []
for (const fr of FRAGMENTS) {
  for (const r of fr.rules ?? []) if (!RULES.some((x) => x[0] === r[0])) RULES.push(r)
  for (const pg of fr.pages) {
    PAGES_OF[pg.id] = [...BASE, ...(pg.rules ?? [])]
    PAGE_URL[pg.id] = pg.path
  }
}
const MEASURE_ON = (id) => Object.entries(PAGES_OF).find(([, ids]) => ids.includes(id))[0]

contract.design.theme = config.qa.theme
const hook = config.qa.theme
const browser = await launchBrowser()
const measured = {}
for (const v of contract.variants) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    reducedMotion: v.reducedMotion,
    colorScheme: v.theme
  })
  await ctx.addInitScript(([k, t]) => localStorage.setItem(k, t), [hook.storageKey, v.theme])
  const byPage = {}
  for (const [pageId, url] of Object.entries(PAGE_URL)) {
    const p = await ctx.newPage()
    await p.goto(new URL(url, SITE).href, { waitUntil: 'load' })
    await p.evaluate(() => document.fonts.ready)
    byPage[pageId] = await p.evaluate(
      ([rules, props]) =>
        Object.fromEntries(
          rules.map(([id, sel, only]) => {
            const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0)
            if (!el) return [id, null]
            const cs = getComputedStyle(el)
            return [id, Object.fromEntries((only ?? props).map((q) => [q, cs.getPropertyValue(q)]))]
          })
        ),
      [RULES.map((r) => [r[0], r[1], r[4] ?? null]), DEFAULT_PROPS]
    )
    await p.close()
  }
  await ctx.close()
  for (const [id] of RULES) {
    const got = byPage[MEASURE_ON(id)][id]
    if (got) (measured[id] ??= {})[v.id] = got
  }
}
await browser.close()

contract.design.rules = RULES.map(([id, selector, source, optional]) => {
  const styles = measured[id] ?? {}
  // an optional rule's element can be absent on a variant (the top menu is hidden below 992px): the validator still wants a
  // measured value per variant, so the same theme's 1440 value is repeated there; the tools skip an optional rule that
  // matches nothing, so the repeated value is never compared.
  if (optional) for (const v of contract.variants) styles[v.id] ??= styles[`1440-${v.theme}`]
  const rule = { id, selector, source, styles }
  if (optional) rule.optional = true
  if (!optional && Object.keys(styles).length !== ALL.length)
    throw new Error(
      `rule ${id} (${selector}) has no element on ${MEASURE_ON(id)} in ${ALL.filter((x) => !styles[x]).join(', ')}`
    )
  return rule
})

// ── content: strings the SOURCE says (never read back from the running site) ─────────────────────────────────
// qa-browser compares with innerText, case-sensitively: `expected` is the text as the visitor reads it.
const UPPER = new Set([])
const F = (id, selector, source, owner, binding, expected, attribute = 'text') => {
  const sel = selector.includes('>>') ? selector : `${selector} >> nth=0`
  return {
    id,
    selector: sel,
    source,
    owner,
    binding,
    attribute,
    expected: UPPER.has(selector) || UPPER.has(sel) ? expected.toUpperCase() : expected
  }
}
const homeContent = [
  F('strip-1', '.es-strip-item h3', HOME_SRC, 'derived', 'posts with home_lead (first by title)', 'Abstract Wonders: Exploring Line Art Composition'),
  F('card-1', '.es-card-title', HOME_SRC, 'derived', 'posts, featured, first of the first category', 'Capturing Essence: Expressive Line Art Techniques'),
  F('footer-cta', '.es-footer-right .es-btn', HOME_SRC, 'field', 'chrome.footer_cta_label', 'Become a subscriber'),
  F('gallery-btn', '.es-gallery-action .es-btn', HOME_SRC, 'field', 'gallery.gallery_title', '@Grazia on instagram')
]
const nfContent = [
  F('code', '.es-404 h1', E404_SRC, 'derived', 'template word', '404'),
  F('h1', '.es-404 h2', E404_SRC, 'derived', 'template word', 'Page not found'),
  F('text', '.es-404 p', E404_SRC, 'derived', 'template word', 'An error has occurred while processing your request.'),
  F('back', '.es-404 .es-btn', E404_SRC, 'derived', 'template word', 'Home Page')
]
const common = { locale: 'en', variants: ALL, states: ['default'] }
contract.pages = [
  {
    id: 'en-home',
    path: '/',
    ...common,
    states: ['default', 'offcanvas'],
    status: 200,
    identity: '.es-strip',
    source: [HOME_SRC],
    render: { view: 'src/views/Home.astro', collections: ['chrome', 'pages', 'posts', 'gallery', 'social'] },
    images: 'placeholders',
    rules: PAGES_OF['en-home'],
    parity: ['nav', 'stripTitle', 'cardTitle', 'footerButton', 'ground'],
    content: homeContent
  },
  {
    id: 'en-not-found',
    path: '/404',
    ...common,
    status: 404,
    identity: '.es-404',
    source: [E404_SRC],
    render: { view: 'src/views/NotFound.astro', collections: ['chrome'] },
    rules: PAGES_OF['en-not-found'],
    parity: ['nfTitle'],
    content: nfContent
  }
]
const FRAGMENT_PAGES = FRAGMENTS.flatMap((fr) =>
  fr.pages.map((pg) => ({
    id: pg.id,
    path: pg.path,
    ...common,
    status: pg.status ?? 200,
    identity: pg.identity,
    source: pg.source,
    render: { view: fr.layout.view, collections: pg.collections ?? ['chrome'] },
    rules: PAGES_OF[pg.id],
    parity: pg.parity ?? ['ground'],
    ...(pg.images ? { images: pg.images } : {}),
    content: (pg.content ?? []).map((c) => F(...c)),
    ...(pg.states ? { states: pg.states } : {})
  }))
)
contract.pages.push(...FRAGMENT_PAGES)
const layout = (id, view, rep, pages, family, states = ['default']) => ({
  id,
  view,
  representative: rep,
  pages,
  states,
  ...(family ? { family } : {}),
  hasSource: true
})
contract.layouts = [
  layout('Home', 'src/views/Home.astro', 'en-home', ['en-home'], undefined, ['default', 'offcanvas']),
  layout('NotFound', 'src/views/NotFound.astro', 'en-not-found', ['en-not-found'])
]
for (const fr of FRAGMENTS)
  contract.layouts.push({
    ...layout(
      fr.layout.id,
      fr.layout.view,
      fr.pages[0].id,
      fr.pages.map((p) => p.id),
      fr.layout.family
    ),
    ...(fr.layout.hasSource === false ? { hasSource: false } : {})
  })
// ── parity: the same logical element on the source render and on the site ─────────────────────────────────────
contract.design.parity = {
  selectors: {
    nav: { site: '.es-nav > ul > li:nth-child(1) > a', source: '.t4-megamenu .nav-item:nth-child(1) > a' },
    stripTitle: { site: '.es-strip-item h3', source: '.mod-view-article-slide h3' },
    cardTitle: { site: '.es-card-title', source: '.blog-items .item-title' },
    footerButton: { site: '.es-footer-right .es-btn', source: '.footer-info-right .btn-dark' },
    nfTitle: { site: '.es-404 h2', source: '.error-msg h2' },
    ground: 'body',
    ...Object.assign({}, ...FRAGMENTS.map((fr) => fr.parity ?? {}))
  },
  properties: ['font-size', 'font-weight', 'letter-spacing', 'padding-top', 'padding-left'],
  hexTolerance: 8,
  pxTolerance: 1
}
contract.design.coverage = [
  { selector: 'main h1, main h2, main h3', properties: ['font-family', 'font-weight'] },
  { selector: 'main p', properties: ['font-family'] },
  { selector: '.es-nav li > a', properties: ['font-size'] }
]
contract.design.images = { scope: 'body', placeholder: null }
contract.design.exceptions = [
  {
    kind: 'scan:white-surface',
    match: 'es-strip-pill',
    reason:
      "The category pill on the Home strip sits on a photograph and stays light in dark mode, as the source's own dark stylesheet keeps it (css/darkmode.css, 'OVER-IMAGE badges')",
    decision: 'DECISIONS D21'
  }
]
// the active menu item and the page buttons are the accent in both themes
contract.design.accentBorders = ['rgb(77, 107, 255)']
// the off-canvas menu: the hamburger on every page at every width (the 768 tablet menu included); Home carries the state
contract.interactions = {
  offcanvas: {
    trigger: '[data-offcanvas-toggle]',
    panel: '#offcanvas',
    link: '#offcanvas li:nth-child(3) > a',
    open: 'click',
    fullWidth: false
  }
}
contract.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span', 'li'],
  platform:
    'Chromium (Playwright). Local files served by Astro (src/fonts.json): Jost (display) and Noto Serif (body); Be Vietnam Pro only under :lang(vi).',
  allowed: { en: ['Jost', 'Noto Serif'] }
}
contract.capabilities = ['audit-log', 'seo', 'media', 'forms']
contract.reviews.forms = { mode: 'required' } // the init skeleton predates the form bindings; the contact and newsletter forms are real
contract.visual = {
  stages: [
    { id: 'light-desktop', variants: ['1440-light'] },
    { id: 'light-responsive', variants: ['768-light', '390-light'] },
    { id: 'dark-desktop', variants: ['1440-dark'] },
    { id: 'dark-responsive', variants: ['768-dark', '390-dark'] }
  ],
  shots: [
    {
      stages: ['light-desktop'],
      side: 'site',
      locales: ['en'],
      consumers: ['layout', 'typography', 'color', 'images', 'interaction']
    },
    {
      stages: ['light-responsive'],
      side: 'site',
      locales: ['en'],
      consumers: ['layout', 'typography', 'images']
    },
    { stages: ['dark-desktop'], side: 'site', locales: ['en'], consumers: ['color', 'layout'] },
    { stages: ['dark-responsive'], side: 'site', locales: ['en'], consumers: ['layout', 'color'] },
    {
      stages: ['light-desktop', 'light-responsive'],
      side: 'source',
      locales: ['en'],
      consumers: ['layout', 'typography', 'images'],
      ownSourceOnly: true
    }
  ],
  fastGate: {
    add: [
      { page: 'en-contact', reason: 'Contact draws the form box (own components, not shared with the other pages)' },
      { page: 'en-search', reason: 'Search draws its own result list (own components)' },
      { page: 'en-cat-stack', reason: 'the stack list style puts the picture beside the text (own card, not the grid card)' },
      { page: 'en-cat-sidebar', reason: 'the sidebar list style carries the sidebar next to the cards' },
      { page: 'en-post-type2', reason: 'article layout type-2: title above the picture and the author box' },
      { page: 'en-post-gallery', reason: 'a gallery article draws the slider in place of the hero picture' },
      { page: 'en-post-video', reason: 'a video article draws the player in place of the hero picture' },
      { page: 'en-post-type1', reason: 'article layout type-1: centred narrow column, no sidebar' }
    ]
  },
  renderInputs: [
    'src/styles/**',
    'src/layouts/Base.astro',
    'src/components/**',
    'src/lib/**',
    'astro.config.mjs',
    'template.config.json',
    'seed/seed.json',
    'public/**'
  ]
}
// source pages no built view reads yet: `excluded` with the reason, never a silent drop
const mapped = new Set(contract.pages.flatMap((p) => p.source))
const REASONS = [
  [/pages\/user\//, 'visitor accounts are not ported: a customer site has no front-end sign-in (DECISIONS D8)'],
  [/home\/home-/, 'a Home demo (header and sidebar variants of the one Home): not ported, not as a page and not as a preset (DECISIONS D8, owner answer 1)'],
  [/pages\/j-pages|typography|featured-articles|tagged-items/, 'demo page of the source (error and offline pages, typography, featured and tagged lists): not ported (DECISIONS D8)'],
  [/category\/category-style-4\/|pages\/j-content\/category-blog/, 'a copy of the same articles listed under another category or layout demo (DECISIONS D10, D15): one view serves them'],
  [/\/(templates|plugins|media)\//, 'a stylesheet, script, font or picture of the source site: the source of the measurements, not a page'],
  [/.*/, 'no built page reads this file (see the reason in DECISIONS)']
]
for (const f of contract.source.files)
  if ((f.disposition === 'converted' || f.disposition === 'excluded') && !mapped.has(f.path)) {
    f.disposition = 'excluded'
    f.reason = REASONS.find(([re]) => re.test(f.path))[1]
  } else if (mapped.has(f.path)) {
    f.disposition = 'converted'
    delete f.reason
  }
contract.pending = []
contract.revision = (contract.revision ?? 0) + 1
contract.distribution = {
  include: withPatches([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'template.config.json',
    'astro.config.mjs',
    'tsconfig.json',
    'components.json',
    'emdash-env.d.ts',
    'Dockerfile',
    'public',
    'seed',
    'src',
    'tools',
    'ingest',
    'contract',
    'tests',
    'docs',
    'README.md',
    'AGENTS.md',
    'PROVENANCE.md',
    'LICENSE',
    'artifact.json',
    '.env.example'
  ]),
  required: [
    'tools/qa.mjs',
    'tools/qa-contract.mjs',
    'tools/distribution.mjs',
    'tools/qa-receipt.mjs',
    'tools/admin-session.mjs',
    'tools/admin-roundtrip.mjs',
    'tools/recovery-check.mjs',
    'tools/clean-install.sh',
    'tools/personalize.mjs',
    'tools/forms.json',
    'public/favicon.svg',
        'seed/seed.json',
    'seed/media-map.json',
    'seed/field-map.json',
    'seed/questions.json',
    'seed/personalize.json'
  ]
}
writeFileSync(OUT, JSON.stringify(contract, null, 2) + '\n')
console.log(
  `build-contract: ${contract.pages.length} pages, ${contract.design.rules.length} rules x ${ALL.length} variants, revision ${contract.revision}`
)
