#!/usr/bin/env node
// Builds qa.contract.json for the pages built so far (P3: Home, one article, the 404). Everything that is a DECISION
// (which pages, which rules, which strings the source says) is written here; every number is MEASURED:
//   - `design.rules[].styles` are measured on the running site (SITE_URL), per variant, then frozen in the contract;
//     the dark values are the declared dark palette (DECISIONS D12 -- the source has no dark frame);
//   - `source.files` are hashed by `tools/qa-contract.mjs init` (run first; this script keeps its `source` block).
//   node ingest/build-contract.mjs --site http://127.0.0.1:4360 [--out qa.contract.json]
// Run it from the package root after `node tools/qa-contract.mjs init source/snapshot qa.contract.json --config template.config.json`.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { launchBrowser } from '../tools/qa-browser.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const SITE = opt('--site', 'http://127.0.0.1:4360')
const OUT = opt('--out', 'qa.contract.json')
const contract = JSON.parse(readFileSync(OUT, 'utf8'))
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const HOME_SRC = 'index.html'
const POST_SRC = 'index.php/our-blog/10-restaurant-news/6-three-broomsticks-s-autumn-menu-unveiled/index.html'
const E404_SRC = 'index.php/nope-404/index.html'
const POST_PATH = '/restaurant-news/three-broomsticks-s-autumn-menu-unveiled'
const ALL = contract.variants.map((v) => v.id)

// ── rules: id → site selector, which page file it is read from, optional on pages/variants that may lack it ───
const RULES = [
  ['body-type', 'body', HOME_SRC],
  ['nav-link', '.dn-nav-inner li:not(.is-active) a:not(:hover)', HOME_SRC, true],
  ['nav-font', '.dn-nav a', HOME_SRC, true, ['font-size']],
  ['p-font', 'main p', HOME_SRC, false, ['font-family']],
  ['slide-title', '.dn-slide.is-active h1', HOME_SRC],
  ['section-label', 'main .dn-label', HOME_SRC],
  ['section-title', '.dn-title', HOME_SRC],
  ['sub-heading', 'main .dn-sub', HOME_SRC],
  ['gallery-title', '.dn-gallery .dn-card-title', HOME_SRC],
  ['tab-active', '.dn-tabs button[aria-selected=true]', HOME_SRC],
  ['dish-name', '.dn-dish h4', HOME_SRC],
  ['dish-price', '.dn-dish-price', HOME_SRC],
  ['news-title', '.dn-card h3', HOME_SRC],
  ['news-date', '.dn-card-meta', HOME_SRC],
  ['chef-quote', '.dn-chef .dn-sub', HOME_SRC],
  ['chef-name', '.dn-chef h4', HOME_SRC],
  ['subscribe-title', '.dn-subscribe .dn-sub', HOME_SRC],
  ['footer-title', '.dn-footer-cols h3', HOME_SRC],
  ['footer-text', '.dn-footer-cols p', HOME_SRC],
  ['copyright', '.dn-copyright p', HOME_SRC],
  ['masthead-title', '.dn-masthead-title', POST_SRC],
  ['article-title', '.dn-article h1', POST_SRC],
  ['article-meta', '.dn-meta', POST_SRC],
  ['article-body', '.dn-prose > p', POST_SRC],
  ['article-quote', '.dn-prose blockquote p:first-child', POST_SRC],
  // a rule compares every match with the first one, so the author line (80%, muted) is its own rule
  ['article-quote-author', '.dn-prose blockquote p:last-child', POST_SRC],
  ['article-h3', '.dn-prose h3', POST_SRC],
  ['aside-title', '.dn-aside h3', POST_SRC],
  ['aside-link', '.dn-aside-cats a', POST_SRC],
  ['pager', '.dn-pager a', POST_SRC],
  ['nf-code', '.dn-notfound .dn-code', E404_SRC],
  ['nf-title', '.dn-notfound h1', E404_SRC],
  ['nf-text', '.dn-notfound p', E404_SRC],
  ['nf-button', '.dn-notfound .dn-btn', E404_SRC]
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
// Order matters: a rule is measured on the first page that carries it.
const PAGES_OF = {
  'en-home': [
    ...BASE,
    'slide-title',
    'section-label',
    'section-title',
    'sub-heading',
    'gallery-title',
    'tab-active',
    'dish-name',
    'dish-price',
    'news-title',
    'news-date',
    'chef-quote',
    'chef-name',
    'subscribe-title'
  ],
  'en-post': [
    ...BASE,
    'masthead-title',
    'article-title',
    'article-meta',
    'article-body',
    'article-quote',
    'article-quote-author',
    'article-h3',
    'aside-title',
    'aside-link',
    'pager'
  ],
  // the source's error page is a bare document (no header, footer or menu) set at 18px: the chrome rules that inherit the body size
  // are not read there; the 404 body is held by the nf-* rules and the parity pair
  'en-not-found': [
    ...BASE.filter((r) => !['p-font', 'body-type', 'copyright'].includes(r)),
    'nf-code',
    'nf-title',
    'nf-text',
    'nf-button'
  ]
}
const PAGE_URL = { 'en-home': '/', 'en-post': POST_PATH, 'en-not-found': '/404' }
// ── page families (P5): ingest/contract-pages/<family>.json, one per family, each written by the agent that built it.
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
    await p.goto(new URL(url, SITE).href, { waitUntil: 'networkidle' })
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
  // an optional rule's element can be absent on a variant (the top menu is hidden below 768px): the validator still
  // wants a measured value per variant, so the same theme's 1440 value is repeated there; the tools skip an optional rule
  // that matches nothing, so the repeated value is never compared.
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
// qa-browser compares with innerText, case-sensitively: `expected` is the text as the visitor reads it, so a label the
// theme sets in capitals is expected in capitals (UPPER lists those selectors).
const UPPER = new Set(['main .dn-label >> nth=0', '.dn-footer-cols h3', '.dn-notfound .dn-btn'])
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
  F(
    'slide',
    '.dn-slide.is-active h1',
    HOME_SRC,
    'field',
    'slideshow.items[0].title',
    'Hey Harry!!! Are you ready for restaurant week?'
  ),
  F(
    'intro-label',
    'main .dn-item.is-a .dn-label',
    HOME_SRC,
    'field',
    'features_intro/meet-three-broomsticks.items[0].title',
    'LOCATION.'
  ),
  F(
    'intro-sub',
    '.dn-intro .dn-sub',
    HOME_SRC,
    'field',
    'features_intro/meet-three-broomsticks.sub_heading (module 95 param)',
    'The Three Broomsticks is a café & restaurant nestled in the beautiful and quaint Hogsmeade Village.'
  ),
  F(
    'dish-1',
    '.dn-dish h4',
    HOME_SRC,
    'field',
    'menu/main-dishes.items[0].dish_name',
    'Candied Walnut Salad'
  ),
  F(
    'news-1',
    '.dn-card h3',
    HOME_SRC,
    'derived',
    'posts (four newest of the blog categories)',
    'Cocktail Bar Alchemist set to open at Mediacity in Salford Quays'
  ),
  F('footer-loc', '.dn-footer-cols h3', HOME_SRC, 'field', 'chrome.footer_location_title', 'Location.'),
  F(
    'subscribe',
    '.dn-subscribe .dn-sub',
    HOME_SRC,
    'field',
    'chrome.subscribe_title (module 127)',
    'Join our Newsletter list to get all the latest offers, discounts and other.'
  )
]
const postContent = [
  F(
    'masthead',
    '.dn-masthead-title',
    POST_SRC,
    'field',
    'masthead/our-blog.title (module 106 params)',
    'Our Blog'
  ),
  F('h1', '.dn-article h1', POST_SRC, 'field', 'posts.title', "Three Broomsticks's autumn menu unveiled"),
  F(
    'p1',
    '.dn-prose > p',
    POST_SRC,
    'field',
    'posts.body',
    'Convallis nulla mauris, eget aucibus elit interdum quis. Proin a est ac nisl porta hendrerit vel itae odio uisque egestas neque a mauris.'
  ),
  F('cats', '.dn-aside h3', POST_SRC, 'setting', 'chrome.categories_title', 'CATEGORIES')
]
const nfContent = [
  F('code', '.dn-notfound .dn-code', E404_SRC, 'field', 'chrome.not_found_code', '404'),
  F('h1', '.dn-notfound h1', E404_SRC, 'field', 'chrome.not_found_title', 'Page not found'),
  F(
    'text',
    '.dn-notfound p',
    E404_SRC,
    'field',
    'chrome.not_found_text',
    'Please try one of the following pages:'
  ),
  F('back', '.dn-notfound .dn-btn', E404_SRC, 'field', 'chrome.not_found_back_label', 'Home Page')
]
const common = { locale: 'en', variants: ALL, states: ['default'] }
contract.pages = [
  {
    id: 'en-home',
    path: '/',
    ...common,
    states: ['default', 'offcanvas'],
    status: 200,
    identity: '.dn-slides',
    source: [HOME_SRC],
    render: {
      view: 'src/views/Home.astro',
      collections: ['chrome', 'pages', 'slideshow', 'features_intro', 'container_tabs', 'menu', 'posts']
    },
    rules: PAGES_OF['en-home'],
    parity: ['nav', 'heroH1', 'label', 'sub', 'footerTitle', 'ground'],
    content: homeContent
  },
  {
    id: 'en-post',
    path: POST_PATH,
    ...common,
    status: 200,
    identity: '.dn-article',
    source: [POST_SRC],
    render: { view: 'src/views/Post.astro', collections: ['chrome', 'posts', 'masthead', 'modules'] },
    rules: PAGES_OF['en-post'],
    parity: ['nav', 'articleTitle', 'asideTitle', 'footerTitle', 'ground'],
    content: postContent
  },
  {
    id: 'en-not-found',
    path: '/404',
    ...common,
    status: 404,
    identity: '.dn-notfound',
    source: [E404_SRC],
    render: { view: 'src/views/NotFound.astro', collections: ['chrome'] },
    rules: PAGES_OF['en-not-found'],
    parity: ['ground'],
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
    content: (pg.content ?? []).map((c) => F(...c)),
    ...(pg.states ? { states: pg.states } : {})
  }))
)
contract.pages.push(...FRAGMENT_PAGES)
// Every other article of the blog is a page of the Post layout (P7): same rules, the title is the source page's own <title>.
const decodeEntities = (t) =>
  t
    .replace(/&#0*39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
// a rule for a block the article's own body lacks is left off that page (the cocktail-bar article has no quote and no h3)
const SEED_POSTS = JSON.parse(readFileSync('seed/seed.json', 'utf8')).content.posts
const bodyStyles = (path) =>
  new Set(
    (SEED_POSTS.find((p) => path.endsWith(`/${p.slug}`))?.data.body ?? []).map((x) => x.style ?? x._type)
  )
const BODY_RULES = { 'article-quote': 'blockquote', 'article-quote-author': 'blockquote', 'article-h3': 'h3' }
const POST_PAGES = JSON.parse(readFileSync('inventory/routes.json', 'utf8'))
  .routes.filter((r) => r.kind === 'detail' && r.source?.url && r.path !== POST_PATH)
  .map((r) => {
    const file = `${r.source.url.replace(/^\//, '')}/index.html`
    const title = decodeEntities(
      readFileSync(`source/snapshot/${file}`, 'utf8').match(/<title>([^<]*)<\/title>/)[1]
    ).trim()
    const id = `en-post-${r.source.url.match(/\/(\d+)-[^/]*$/)[1]}`
    return {
      id,
      path: r.path,
      ...common,
      status: 200,
      identity: '.dn-article',
      source: [file],
      render: { view: 'src/views/Post.astro', collections: ['chrome', 'posts', 'masthead', 'modules'] },
      rules: PAGES_OF['en-post'].filter(
        (rule) => !BODY_RULES[rule] || bodyStyles(r.path).has(BODY_RULES[rule])
      ),
      parity: ['nav', 'articleTitle', 'asideTitle', 'footerTitle', 'ground'],
      content: [
        F(
          'masthead',
          '.dn-masthead-title',
          file,
          'field',
          'masthead/our-blog.title (module 106 params)',
          'Our Blog'
        ),
        F('h1', '.dn-article h1', file, 'field', 'posts.title', title),
        F('cats', '.dn-aside h3', file, 'setting', 'chrome.categories_title', 'CATEGORIES')
      ]
    }
  })
contract.pages.push(...POST_PAGES)
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
  layout('Post', 'src/views/Post.astro', 'en-post', ['en-post', ...POST_PAGES.map((p) => p.id)], 'detail'),
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
    nav: { site: '.dn-nav-inner li:nth-child(3) a', source: '#t3-mainnav .nav > li:nth-child(3) > a' },
    heroH1: { site: '.dn-slide.is-active h1', source: '.t3-slideshow h1.slide-title' },
    label: { site: '.dn-intro .dn-label:not(.is-small)', source: '#Section95 h5.section-title' },
    sub: { site: '.dn-intro .dn-sub', source: '#Section95 .section-sub' },
    asideTitle: { site: '.dn-aside h3', source: '.t3-sidebar h3.module-title' },
    footerTitle: {
      site: '.dn-footer-cols h3',
      source: '#t3-footer h5, #t3-footer .module-title, #t3-footer h3'
    },
    articleTitle: { site: '.dn-article h1', source: 'article h1.article-title' },
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
  { selector: '.dn-nav a', properties: ['font-size'] }
]
contract.design.images = { scope: 'body', placeholder: null }
contract.design.exceptions = [
  {
    kind: 'scan:contrast',
    match: '^span\\.$',
    reason:
      'The Happy Hours discount badge is white on Bootstrap success green (#5cb85c) exactly as the source draws it (ratio 2.48); the badge is a decorative seal repeating the offer text beside it',
    decision: 'DECISIONS D16'
  }
]
// the active menu tab's underline is the brand colour in both themes (one value: the accent token `--color-accent-line`)
contract.design.accentBorders = ['rgb(195, 99, 73)']
// the off-canvas menu: the hamburger on every page at every width (the 768 tablet menu included); Home carries the state
contract.interactions = {
  offcanvas: {
    trigger: '[data-offcanvas-toggle]',
    panel: '#offcanvas',
    link: '#offcanvas li:nth-child(2) a',
    open: 'click',
    fullWidth: true
  }
}
contract.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span', 'li'],
  platform:
    'Chromium (Playwright). Two Google families are self-hosted by Astro (src/fonts.json): Eczar (display) and Work Sans (body).',
  allowed: { en: ['Eczar', 'Work Sans'] }
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
      { page: 'en-about', reason: 'About draws the feature rows and the team grid (own components)' },
      {
        page: 'en-offers',
        reason: 'Offers draws the three happy-hour panels (own components, not shared with About)'
      },
      {
        page: 'en-reservation',
        reason: 'Reservation draws the picture rows and the call band (own components)'
      }
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
  [
    /j-pages|your-profile|user-profile|password-reset|username-reminder/,
    'visitor accounts are not ported: a customer site has no front-end sign-in (DECISIONS D6)'
  ],
  [
    /joomla-content\/(typography|tagged|fetured)|other-pages|home\/home-/,
    'demo page of the source (error and offline pages, colour variants, typography): not ported (DECISIONS D6)'
  ],
  [
    /component\/tags|all-categories/,
    'Joomla tag and category index lists: a customer site has no tag pages or category index, the blog sidebar lists the four categories (DECISIONS D6, D-P7-2)'
  ],
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
  include: [
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
  ],
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
