#!/usr/bin/env node
// Builds qa.contract.json: every DECISION (which pages, which rules, the strings the source says) is written here; every number is
// MEASURED on the running site (SITE_URL) per variant and frozen in the contract. The source has a light/dark switch (DECISIONS D15).
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
const HOME = 'index.php/home/home-style-1/index.html'
const ABOUT = 'index.php/about-us/index.html'
const SERVICES = 'index.php/services-page/index.html'
const CONTACT = 'index.php/contact-us/index.html'
const BLOG = 'index.php/joomlart-content/category-blog/index.html'
const POST = 'index.php/joomlart-content/single-article/index.html'
const POST2 =
  'index.php/joomlart-content/category-blog/3-student-loan-borrowers-who-say-they-were-defrauded-sue-betsy-devos-for-failing-to-cancel-their-debt/index.html'
const SEARCH = 'index.php/other-pages/smart-search/index.html'
const NOT_FOUND = 'index.php/nope-404/index.html'
const RULES = [
  ['body-type', 'body', HOME],
  ['nav-link', '.mg-nav li:not(.is-active) a:not(:hover)', HOME, true],
  ['nav-font', '.mg-nav a', HOME, true, ['font-size']],
  ['p-font', 'main p:not(blockquote p)', HOME, false, ['font-family']],
  ['footer-title', '.mg-footer h3', HOME],
  ['footer-text', '.mg-footer li', HOME],
  ['copyright', '.mg-copyright p', HOME],
  ['topbar', '.mg-topbar-item', HOME, true],
  ['slide-title', '.mg-slide-h', HOME],
  ['section-label', '.mg-sub', HOME],
  ['section-title', '.mg-sec-h', HOME],
  ['card-title', '.mg-card h4', HOME],
  ['box-title', '.mg-box h4', HOME],
  ['panel-title', '.mg-panel summary', HOME],
  ['case-title', '.mg-case h4', HOME],
  ['member-name', '.mg-member h4', HOME],
  ['hiring', '.mg-hiring', HOME],
  ['quote-text', '.mg-fquote blockquote', HOME],
  ['tile-title', '.mg-tile-text h4', SERVICES],
  ['praise-text', '.mg-quote-card blockquote', SERVICES],
  ['cta-title', '.mg-cta-panel .mg-sec-h', SERVICES],
  ['masthead-title', '.mg-masthead:not(:has(.mg-post-band-chip)) .mg-masthead-title', ABOUT],
  ['masthead-desc', '.mg-masthead-desc', ABOUT],
  ['contact-card-title', '.mg-contact-card h4', CONTACT],
  ['contact-form-title', '.mg-contact-form .mg-sec-h', CONTACT],
  ['post-card-title', '.mg-post-card .mg-post-title, .mg-post .mg-post-title', BLOG],
  ['post-card-meta', '.mg-meta', BLOG],
  ['side-title', '.mg-side-title', BLOG],
  ['pagination', '.mg-pagination li a, .mg-pagination li span', BLOG],
  ['post-masthead-title', '.mg-masthead:has(.mg-post-band-chip) .mg-masthead-title', POST],
  ['prose-h3', '.mg-prose h3', POST],
  ['prose-text', '.mg-prose p', POST],
  ['search-count', '.mg-search-count', SEARCH],
  ['nf-code', '.mg-error-code', NOT_FOUND],
  ['nf-title', '.mg-error h1', NOT_FOUND]
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
const BASE = ['body-type', 'nav-link', 'nav-font', 'p-font', 'footer-title', 'footer-text', 'copyright', 'topbar']
const POSTS = Object.fromEntries(seed.content.posts.map((p) => [p.slug, p.data.title]))
const POST_SLUG = 'strong-job-growth-is-back-payrolls-jump-in-june-well-above-expectations'
const POST2_SLUG = 'student-loan-borrowers-who-say-they-were-defrauded-sue-betsy-devos-for-failing-to-cancel-their-debt'
const PAGES = [
  {
    id: 'en-home',
    path: '/',
    src: HOME,
    view: 'Home',
    identity: '.mg-slideshow',
    cols: ['chrome', 'footer_links', 'pages', 'slideshow', 'features_intro', 'accordion', 'testimonials', 'teams', 'clients', 'contact'],
    rules: [...BASE, 'slide-title', 'section-label', 'section-title', 'card-title', 'box-title', 'panel-title', 'case-title', 'member-name', 'hiring', 'quote-text'],
    content: [
      ['slide', '.mg-slide-h', 'field', 'slideshow/home-slideshow.items[0].title', 'Not for Profit.\nFor People.'],
      ['intro', '.mg-sec-intro .mg-sec-h', 'field', 'features_intro/home-intro.title', 'Morgan help Business Performance and Scalability.']
    ]
  },
  {
    id: 'en-about',
    path: '/about-us',
    src: ABOUT,
    view: 'About',
    identity: '.mg-masthead',
    cols: ['chrome', 'footer_links', 'pages', 'masthead', 'features_intro', 'teams', 'clients'],
    rules: [...BASE, 'masthead-title', 'masthead-desc', 'section-label', 'section-title', 'card-title', 'member-name'],
    content: [['title', '.mg-masthead-title', 'field', 'masthead/about-us.title', 'About Us']]
  },
  {
    id: 'en-services',
    path: '/services',
    src: SERVICES,
    view: 'Services',
    identity: '.mg-tiles',
    cols: ['chrome', 'footer_links', 'pages', 'masthead', 'features_intro', 'testimonials', 'clients'],
    rules: [...BASE, 'masthead-title', 'masthead-desc', 'section-label', 'section-title', 'tile-title', 'case-title', 'praise-text', 'cta-title'],
    content: [['title', '.mg-masthead-title', 'field', 'masthead/services.title', 'Our Services']]
  },
  {
    id: 'en-blog',
    path: '/blog',
    src: BLOG,
    view: 'BlogList',
    identity: '.mg-blog-grid',
    cols: ['chrome', 'footer_links', 'pages', 'posts', 'masthead'],
    rules: [...BASE, 'masthead-title', 'masthead-desc', 'post-card-title', 'post-card-meta', 'side-title', 'pagination'],
    content: [['title', '.mg-masthead-title', 'field', 'masthead/blog.title', 'JA Morgan']]
  },
  {
    id: 'en-contact',
    path: '/contact-us',
    src: CONTACT,
    view: 'Contact',
    identity: '.mg-contact-cards',
    cols: ['chrome', 'footer_links', 'pages', 'contact'],
    rules: [...BASE, 'section-label', 'section-title', 'contact-card-title', 'contact-form-title'],
    content: [['heading', '.mg-sec-contact-cards .mg-sec-h', 'field', 'contact/contact-info.heading', 'JA Morgan']]
  },
  {
    id: 'en-search',
    path: '/search?q=growth',
    src: SEARCH,
    view: 'Search',
    identity: '.mg-search',
    cols: ['chrome', 'footer_links', 'posts', 'masthead'],
    rules: [...BASE, 'masthead-title', 'masthead-desc', 'search-count'],
    content: [['title', '.mg-masthead-title', 'field', 'chrome.search_label', 'Smart Search']]
  },
  {
    id: 'en-not-found',
    path: '/404',
    src: NOT_FOUND,
    view: 'NotFound',
    identity: '.mg-error',
    cols: ['chrome', 'masthead'],
    status: 404,
    rules: ['nf-code', 'nf-title'],
    content: [['code', '.mg-error-code', 'field', 'chrome.not_found_code', '404']]
  },
  {
    id: 'en-post',
    path: `/blog/${POST_SLUG}`,
    src: POST,
    view: 'Post',
    identity: '.mg-masthead',
    cols: ['chrome', 'footer_links', 'posts', 'masthead'],
    rules: [...BASE, 'post-masthead-title', 'prose-h3', 'prose-text', 'side-title'],
    family: 'detail',
    content: [['title', '.mg-masthead-title', 'field', 'posts.title', POSTS[POST_SLUG]]]
  },
  {
    id: 'en-post-2',
    path: `/blog/${POST2_SLUG}`,
    src: POST2,
    view: 'Post',
    identity: '.mg-masthead',
    cols: ['chrome', 'footer_links', 'posts', 'masthead'],
    rules: [...BASE, 'post-masthead-title', 'prose-text', 'side-title'],
    family: 'detail',
    content: [['title', '.mg-masthead-title', 'field', 'posts.title', POSTS[POST2_SLUG]]]
  }
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
    nav: { site: '.mg-nav li:nth-child(3) a', source: '.t3-megamenu .navbar-nav > li:nth-child(3) > a' },
    footerTitle: { site: '.mg-footer h3', source: '.t3-footer .t3-module .module-title' },
    ground: 'html'
  },
  properties: ['font-size', 'font-weight', 'letter-spacing', 'padding-top', 'padding-left'],
  hexTolerance: 8,
  pxTolerance: 1
}
contract.design.coverage = [
  { selector: 'main h1, main h2, main h3', properties: ['font-family', 'font-weight'] },
  { selector: 'main p', properties: ['font-family'] },
  { selector: '.mg-nav a', properties: ['font-size'] }
]
contract.design.images = { scope: 'body', placeholder: null }
contract.design.exceptions = []
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
contract.design.accentBorders = ['rgb(217, 48, 48)']
// the off-canvas menu exists below 992 px only (its button is hidden above), so no `interactions` state is declared for the 1440 frame
contract.interactions = {}
contract.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span', 'li'],
  platform:
    'Chromium (Playwright). One family is shipped locally (src/fonts.json): PT Root UI 400, 500 and 700 for the display and the body.',
  allowed: { en: ['PT Root UI'] }
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
      { page: 'en-about', reason: 'About draws the split bands and the team grid (own components)' },
      { page: 'en-services', reason: 'Services draws the tile grid and the call to action (own components)' },
      { page: 'en-contact', reason: 'Contact draws the info cards and the form on navy (own components)' },
      { page: 'en-post', reason: 'A post draws the title band, the prose and the sidebar' }
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
  [/home\/home-/, 'Home Styles 2 to 4 are not ported (DECISIONS D6)'],
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
