#!/usr/bin/env node
// Builds qa.contract.json: every DECISION (which pages, which rules, the strings the source says) is written here; every number is
// MEASURED on the running site (SITE_URL) per variant and frozen in the contract. The source has no light/dark switch, so the
// `-light` and `-dark` variants draw the same page (DECISIONS D12).
//   node tools/qa-contract.mjs init source/snapshot qa.contract.json --config template.config.json   # once
//   node ingest/build-contract.mjs --site http://127.0.0.1:4360 [--out qa.contract.json]
import { withPatches } from '../tools/qa-contract.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { launchBrowser } from '../tools/qa-browser.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const SITE = opt('--site', 'http://127.0.0.1:4360')
const OUT = opt('--out', 'qa.contract.json')
const contract = JSON.parse(readFileSync(OUT, 'utf8'))
const ALL = contract.variants.map((v) => v.id)
const seed = JSON.parse(readFileSync('seed/seed.json', 'utf8'))

// ── rules: id → site selector, source file, optional?, properties ──
const HOME = 'index.html'
const POST = 'pages/j-content/category-blog/valentines-day-at-soul-kitchen/index.html'
const RULES = [
  ['body-type', 'body', HOME],
  ['nav-link', '.fr-nav li:not(.is-active) a:not(:hover)', HOME, true],
  ['nav-font', '.fr-nav a', HOME, true, ['font-size']],
  ['p-font', 'main p:not(blockquote p)', HOME, false, ['font-family']],
  ['footer-title', '.fr-footer h3', HOME],
  ['footer-text', '.fr-footer-cols > div:nth-child(1) p', HOME],
  ['copyright', '.fr-copyright p', HOME],
  ['sr-title', 'main > h1.sr-only', 'menu/index.html'],
  ['hero-title', '.fr-hero-title', HOME],
  ['section-label', '.fr-section-title', HOME],
  ['main-title', '.fr-main-title', HOME],
  ['dish-name', '.fr-menu-list.cols-2 .fr-dish-name', HOME],
  ['dish-name-3', '.fr-menu-list.cols-3 .fr-dish-name', HOME],
  ['dish-price', '.fr-menu-list.cols-2 .fr-dish-price', HOME],
  ['dish-price-3', '.fr-menu-list.cols-3 .fr-dish-price', HOME],
  ['t-quote', '.fr-t-desc', HOME],
  ['fi-title', '.fr-fi-inner h3', HOME],
  ['fi2-title', '.fr-fi2-item.is-primary .fr-fi2-title', HOME],
  ['fi2-title-dark', '.fr-fi2-item.is-dark .fr-fi2-title', HOME],
  ['fi2-action', '.fr-fi2-item.is-primary .fr-fi2-action-title h3', HOME],
  ['fi2-action-dark', '.fr-fi2-item.is-dark .fr-fi2-action-title h3', HOME],
  ['menu-card-title', '.fr-menu-card-title', 'menu/index.html'],
  ['menu-image-name', '.fr-menu-image-name', 'menu/index.html'],
  ['fa4-title', '.fr-fa4-title', 'about/index.html'],
  ['fa5-title', '.fr-fa5-title', 'about/index.html'],
  ['member-name', '.fr-member-name', 'about/index.html'],
  ['hh-title', '.fr-hh-title', 'offer/index.html'],
  ['contact-h2', '.fr-contact-info h2', 'contact/index.html'],
  ['contact-lead', '.fr-contact-lead h2', 'contact/index.html'],
  ['post-lead-title', '.fr-post-lead .fr-post-title', 'pages/j-content/category-blog/index.html'],
  ['post-card-title', '.fr-post-card .fr-post-title', 'pages/j-content/category-blog/index.html'],
  ['post-related-title', '.fr-post-related .fr-post-title', POST],
  ['blog-more', '.fr-blog-more h3', 'pages/j-content/category-blog/index.html'],
  ['article-quote', '.fr-prose blockquote p:first-child', POST],
  ['article-quote-author', '.fr-prose blockquote p + p', POST],
  ['prose-h2', '.fr-prose h2', POST],
  ['search-count', '.fr-search-count', 'pages/j-pages/smart-search/index.html'],
  [
    'search-result-title',
    '.fr-search-results h3',
    'pages/j-content/category-blog/index.html',
    false,
    ['font-family', 'font-weight']
  ],
  ['masthead-title', '.fr-masthead:not(:has(.fr-post-band-chip)) .fr-masthead-title', 'about/index.html'],
  ['post-masthead-title', '.fr-masthead:has(.fr-post-band-chip) .fr-masthead-title', POST],
  ['nf-code', '.fr-error-code', 'nope-404/index.html'],
  ['nf-title', '.fr-error h1', 'nope-404/index.html']
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
const BASE = ['body-type', 'nav-link', 'nav-font', 'p-font', 'footer-title', 'footer-text', 'copyright']
const postSlugs = [
  'valentines-day-at-soul-kitchen',
  'mother-s-day-lunch-special',
  'an-interview-with-chef-milo-ferndandes',
  'culinary-journeys-around-the-world',
  'savoring-the-art-of-cooking',
  'farm-to-fork-sustainable-eating'
]
const POSTS = Object.fromEntries(seed.content.posts.map((p) => [p.slug, p.data.title]))
const postSrc = (s) => `pages/j-content/category-blog/${s}/index.html`
const PAGES = [
  {
    id: 'en-home',
    path: '/',
    src: HOME,
    view: 'Home',
    identity: '.fr-hero',
    cols: ['chrome', 'pages', 'hero', 'features_intro', 'menu', 'gallery', 'testimonials', 'book_table'],
    rules: [...BASE, 'hero-title', 'section-label', 'main-title', 'dish-name', 'dish-price', 't-quote'],
    content: [['hero', '.fr-hero-title', 'field', 'hero/home-hero.items[0].title', 'Restaurant & Fresco']]
  },
  {
    id: 'en-menu',
    path: '/menu',
    src: 'menu/index.html',
    view: 'MenuPage',
    identity: '.fr-menu-list',
    cols: ['chrome', 'pages', 'menu'],
    rules: [...BASE, 'main-title', 'dish-name', 'dish-price'],
    content: [['title', '.fr-main-title', 'field', 'menu/menu-columns.section_title', 'Multi Column Layout']]
  },
  {
    id: 'en-about',
    path: '/about',
    src: 'about/index.html',
    view: 'About',
    identity: '.fr-masthead',
    cols: ['chrome', 'pages', 'masthead', 'features_intro', 'testimonials', 'teams'],
    rules: [...BASE, 'masthead-title', 'main-title'],
    content: [['masthead', '.fr-masthead-title', 'field', 'masthead/about.title', 'About']]
  },
  {
    id: 'en-gallery',
    path: '/gallery',
    src: 'gallery/index.html',
    view: 'GalleryPage',
    identity: 'main section',
    cols: ['chrome', 'pages', 'gallery'],
    rules: [...BASE, 'main-title'],
    content: [['title', '.fr-main-title', 'field', 'gallery/gallery-one.section_title', 'Gallery 1']]
  },
  {
    id: 'en-chiefs',
    path: '/chiefs',
    src: 'chiefs/index.html',
    view: 'Chiefs',
    identity: '.fr-masthead',
    cols: ['chrome', 'pages', 'masthead', 'teams'],
    rules: [...BASE, 'masthead-title'],
    content: [['masthead', '.fr-masthead-title', 'field', 'masthead/chiefs.title', 'Chiefs']]
  },
  {
    id: 'en-offer',
    path: '/offer',
    src: 'offer/index.html',
    view: 'Offer',
    identity: 'main section',
    cols: ['chrome', 'pages', 'happyhours'],
    rules: [...BASE],
    content: [['title', '.fr-hh-title', 'field', 'happyhours/offer-hour-1.hp_title', 'Happy Hours']]
  },
  {
    id: 'en-contact',
    path: '/contact',
    src: 'contact/index.html',
    view: 'Contact',
    identity: '.fr-masthead',
    cols: ['chrome', 'pages', 'masthead', 'contact'],
    rules: [...BASE, 'masthead-title'],
    content: [['masthead', '.fr-masthead-title', 'field', 'masthead/contact.title', 'Contact Us']]
  },
  {
    id: 'en-blog',
    path: '/blog',
    src: 'pages/j-content/category-blog/index.html',
    view: 'BlogList',
    identity: '.fr-masthead',
    cols: ['chrome', 'pages', 'masthead', 'posts'],
    rules: [...BASE, 'masthead-title'],
    family: 'list',
    content: [['masthead', '.fr-masthead-title', 'field', 'masthead/blog.title', 'Category Blog']]
  },
  {
    id: 'en-search',
    path: '/search',
    src: 'pages/j-pages/smart-search/index.html',
    view: 'Search',
    identity: 'main',
    cols: ['chrome', 'posts'],
    rules: [...BASE],
    content: [['h1', '.fr-masthead-title', 'field', 'chrome.search_label', 'Smart Search']]
  },
  {
    // the results state of the port has no source page (the source snapshot is the landing page); it is held to the
    // rules the template shares and its tiles are read against the landing page under D36
    id: 'en-search-results',
    path: '/search?q=food',
    src: 'pages/j-pages/smart-search/index.html',
    view: 'Search',
    identity: 'main',
    cols: ['chrome', 'posts'],
    rules: [...BASE],
    content: [['h1', '.fr-masthead-title', 'field', 'chrome.search_label', 'Smart Search']]
  },
  {
    id: 'en-not-found',
    path: '/404',
    src: 'nope-404/index.html',
    view: 'NotFound',
    identity: '.fr-error',
    cols: ['chrome'],
    status: 404,
    rules: ['nf-code', 'nf-title'],
    content: [['code', '.fr-error-code', 'field', 'chrome.not_found_code', '404']]
  },
  ...postSlugs.map((s, i) => ({
    id: i === 0 ? 'en-post' : `en-post-${i + 1}`,
    path: `/blog/${s}`,
    src: postSrc(s),
    view: 'Post',
    identity: '.fr-masthead',
    cols: ['chrome', 'posts', 'masthead'],
    rules: [...BASE, 'post-masthead-title'],
    family: 'detail',
    content: [['title', '.fr-masthead-title', 'field', 'posts.title', POSTS[s]]]
  }))
]
const PAGE_URL = Object.fromEntries(PAGES.map((p) => [p.id, p.path]))
// a page carries every rule whose selector matches a visible element on it (found at the widest variant), so the coverage
// check (every heading belongs to a rule) is decided by the rules, not by a hand-kept list
const PAGES_OF = Object.fromEntries(PAGES.map((p) => [p.id, []]))
{
  const b0 = await launchBrowser()
  const ctx0 = await b0.newContext({ viewport: { width: 1440, height: 1000 } })
  for (const p of PAGES) {
    const pg = await ctx0.newPage()
    await pg.goto(new URL(p.path, SITE).href, { waitUntil: 'load' })
    PAGES_OF[p.id] = await pg.evaluate(
      (rules) =>
        rules
          .filter(([, sel]) =>
            [...document.querySelectorAll(sel)].some((e) => e.getBoundingClientRect().width > 0)
          )
          .map((r) => r[0]),
      RULES.map((r) => [r[0], r[1]])
    )
    p.rules = PAGES_OF[p.id]
    await pg.close()
  }
  await b0.close()
}
const MEASURE_ON = (id) => (Object.entries(PAGES_OF).find(([, ids]) => ids.includes(id)) ?? [])[0]

const browser = await launchBrowser()
const measured = {}
for (const v of contract.variants) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    reducedMotion: v.reducedMotion,
    colorScheme: v.theme
  })
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
    const got = byPage[MEASURE_ON(id)]?.[id]
    if (got) (measured[id] ??= {})[v.id] = got
  }
}
await browser.close()

contract.design.theme = JSON.parse(readFileSync('template.config.json', 'utf8')).qa.theme
contract.design.rules = RULES.map(([id, selector, source, optional]) => {
  const styles = measured[id] ?? {}
  if (optional) for (const v of contract.variants) styles[v.id] ??= styles[`1440-${v.theme}`]
  const rule = { id, selector, source, styles }
  if (optional) rule.optional = true
  if (!optional && Object.keys(styles).length !== ALL.length)
    throw new Error(
      `rule ${id} (${selector}) has no element on ${MEASURE_ON(id)} in ${ALL.filter((x) => !styles[x]).join(', ')}`
    )
  return rule
})

// content: strings the SOURCE says, as the visitor reads them (after text-transform)
const F = (id, selector, source, owner, binding, expected, attribute = 'text') => ({
  id,
  selector: selector.includes('>>') ? selector : `${selector} >> nth=0`,
  source,
  owner,
  binding,
  attribute,
  expected
})
const common = { locale: 'en', variants: ALL, states: ['default'] }
contract.pages = PAGES.map((p) => ({
  id: p.id,
  path: p.path,
  ...common,
  ...(p.states ? { states: p.states } : {}),
  status: p.status ?? 200,
  identity: p.identity,
  source: [p.src],
  render: { view: `src/views/${p.view}.astro`, collections: p.cols },
  rules: p.rules,
  parity: p.id === 'en-not-found' ? ['ground'] : ['nav', 'footerTitle', 'ground'],
  ...(p.id === 'en-home' ? { images: 'placeholders' } : {}),
  content: p.content.map((c) => F(c[0], c[1], p.src, c[2], c[3], c[4]))
}))
const byView = new Map()
for (const p of PAGES) byView.set(p.view, [...(byView.get(p.view) ?? []), p])
contract.layouts = [...byView.entries()].map(([view, ps]) => ({
  id: view,
  view: `src/views/${view}.astro`,
  representative: ps[0].id,
  pages: ps.map((p) => p.id),
  states: ps[0].states ?? ['default'],
  ...(ps[0].family ? { family: ps[0].family } : {}),
  hasSource: true
}))
contract.design.parity = {
  selectors: {
    nav: { site: '.fr-nav li:nth-child(3) a', source: '.t4-megamenu .nav-item:nth-child(3) .nav-link' },
    footerTitle: { site: '.fr-footer h3', source: '#t4-footer .module-title' },
    ground: 'html'
  },
  properties: ['font-size', 'font-weight', 'letter-spacing', 'padding-top', 'padding-left'],
  hexTolerance: 8,
  pxTolerance: 1
}
contract.design.coverage = [
  { selector: 'main h1, main h2, main h3', properties: ['font-family', 'font-weight'] },
  { selector: 'main p', properties: ['font-family'] },
  { selector: '.fr-nav a', properties: ['font-size'] }
]
contract.design.images = { scope: 'body', placeholder: null }
contract.design.exceptions = [
  {
    kind: 'scan:bright-border',
    match: '^div\\.fr-hh-info',
    reason:
      'The Happy Hours info box has the 1 px light frame the source draws (acm happyhours style-1 `.hp-info`)',
    decision: 'DECISIONS D19'
  },
  {
    kind: 'scan:dark-on-dark',
    match: '^(h2\\.fr-fi2-title|h3\\.|span\\.)$',
    reason:
      'The Private Events tile prints #111 text on its accent colour mask exactly as the source does (docs/blocks.md features-intro style-2: only Dark tiles switch to white); the scanner reads the page behind the mask',
    decision: 'DECISIONS D19'
  }
]
// differences the owner already decided (DECISIONS): read as accepted by the lens readers and closers, listed in ingest/accepted-differences.json; they match
// review notes (kind `lens-note`), never a machine finding
for (const x of JSON.parse(readFileSync(new URL('./accepted-differences.json', import.meta.url), 'utf8')))
  contract.design.exceptions.push({
    kind: 'lens-note',
    match: x.match,
    ...(x.pages ? { pages: x.pages } : {}),
    ...(x.ids ? { ids: x.ids } : {}),
    reason: x.reason,
    decision: x.decision
  })
contract.design.accentBorders = ['rgb(230, 201, 162)']
// the off-canvas menu exists below 992 px only (its button is hidden above), so no `interactions` state is declared for the 1440 frame
contract.interactions = {}
contract.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span', 'li'],
  platform:
    'Chromium (Playwright). Two families are shipped locally (src/fonts.json): Playfair Display (display) and Roboto (body).',
  allowed: { en: ['Playfair Display', 'Roboto'] }
}
contract.capabilities = ['audit-log', 'seo', 'media', 'forms']
contract.reviews.forms = { mode: 'required' }
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
      { page: 'en-about', reason: 'About draws the feature cards and the team grid (own components)' },
      { page: 'en-offer', reason: 'Offer draws the three happy-hour panels (own components)' },
      { page: 'en-gallery', reason: 'Gallery draws the lightbox grids (own components)' },
      { page: 'en-menu', reason: 'Menu draws the image lists and the dish cards (own components)' }
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
const mapped = new Set(contract.pages.flatMap((p) => p.source))
const REASONS = [
  [/home\/home-/, 'Home 2 and Home 3 are not ported (DECISIONS D6)'],
  [
    /author|j-pages|users/,
    'Joomla utility pages (authors, accounts, demo pages) are not ported (DECISIONS D7)'
  ],
  [/.*/, 'no built page reads this file (see DECISIONS)']
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
    'public/brand/logo.png',
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
