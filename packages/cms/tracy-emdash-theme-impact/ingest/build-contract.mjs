#!/usr/bin/env node
// Builds qa.contract.json: every DECISION (which pages, which rules, the strings the source says) is written here; every number is
// MEASURED on the running site (SITE_URL) per variant and frozen in the contract. The source draws no switch but has a dark theme that follows the OS
// (DECISIONS D12): the `-dark` variants load `?theme=dark` through the storage key of `template.config.json`.
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
const RULES = [
  ['body-type', 'body', HOME],
  ['nav-link', '.im-nav li:not(.is-active) a:not(:hover)', HOME, true],
  ['nav-font', '.im-nav a', HOME, true, ['font-size']],
  ['p-font', 'main p', HOME, false, ['font-family']],
  ['footer-title', '.im-footnav h3', HOME],
  ['footer-text', '.im-footnav-about p', HOME],
  ['copyright', '.im-copyright p', HOME],
  ['hero-title', '.im-hero-title', HOME],
  ['hero-sub', '.im-hero-sub', HOME],
  ['eyebrow', 'main .im-section-head .im-eyebrow', HOME],
  ['section-title', 'main .im-section-title', HOME],
  ['intro-title', '.im-intro-title', HOME],
  ['cta-title', '.im-cta-title', HOME],
  ['cta-highlight', '.im-cta-highlight', HOME],
  ['fund-title', '.im-fund-title', HOME],
  ['card-title', '.im-card-feature h3', HOME],
  ['donation-title', '.im-donation-title', HOME],
  ['stats-figure-success', '.im-tile-figure.is-success', HOME],
  ['stats-figure-warning', '.im-tile-figure.is-warning', HOME],
  ['stats-figure-primary', '.im-tile-figure.is-primary', HOME],
  ['event-title', '.im-event h3', HOME],
  ['post-title', '.im-post h3', HOME],
  ['connected-title', '.im-connected h2', HOME],
  ['contact-heading', '.im-contact-heading', HOME],
  ['btn', 'main .im-btn', HOME, false, ['font-size', 'font-weight', 'border-radius', 'padding-top', 'padding-left']]
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
const POST = 'category-blog/charity-branding-is-yourbrand-digital-ready/index.html'
const DON = 'donations/community-center/index.html'
const EVT = 'events/feed-the-world/index.html'
const TYPE = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing']
RULES.push(
  ['masthead-title', '.im-masthead-title', 'about/index.html'],
  ['detail-title', '.im-detail-title', DON],
  ['article-title', '.im-article-title', POST],
  ['widget-title', '.im-widget h3', POST],
  ['stats-head-title', '.im-stats-head h2', HOME],
  ['follow-title', '.im-connected-follow h3', HOME],
  ['mission-title', '.im-mission h3', 'about/index.html', false, TYPE],
  ['give-title', '.im-give h3', 'about/index.html', false, TYPE],
  ['prose-h3', '.im-prose h3', POST, false, TYPE],
  ['cta-card-title', '.im-cta-card-title', EVT, false, TYPE],
  ['accordion-title', '.im-accordion-title', 'help-faqs/index.html'],
  ['contact-head', '.im-contact-head', 'contact/index.html'],
  ['pagination', '.im-pagination a', 'blog/index.html', true],
  ['nf-title', '.im-error h1', 'nope-404/index.html']
)
const mast = (id, path, src, view, title, cols, extra = {}) => ({
  id, path, src, view, identity: '.im-masthead', cols: ['chrome', 'pages', 'masthead', ...cols],
  rules: [], content: [['masthead', '.im-masthead-title', 'field', `pages/${path === '/help-faqs' ? 'help-faqs' : path.slice(1)}.title`, title]], ...extra
})
const PAGES = [
  {
    id: 'en-home', path: '/', src: HOME, view: 'Home', identity: '.im-hero',
    cols: ['chrome', 'pages', 'hero', 'features', 'cta', 'social', 'contact_info', 'donations', 'events', 'posts'],
    rules: [], content: [['hero', '.im-hero-title', 'field', 'hero/home-hero.items[0].title', 'How to engage help our planet']]
  },
  mast('en-about', '/about', 'about/index.html', 'About', 'Who we are', ['features']),
  mast('en-donations', '/donations', 'donations/index.html', 'DonationsList', 'Our causes', ['donations'], { family: 'list' }),
  { id: 'en-donation', path: '/donations/community-center', src: DON, view: 'Donation', identity: '.im-crumb-bar', cols: ['chrome', 'donations'], rules: [], family: 'detail',
    content: [['title', '.im-detail-title', 'field', 'donations/community-center.title', 'Community center']] },
  mast('en-events', '/events', 'events/index.html', 'EventsList', 'Our Events', ['events'], { family: 'list' }),
  { id: 'en-event', path: '/events/feed-the-world', src: EVT, view: 'Event', identity: '.im-crumb-bar', cols: ['chrome', 'events', 'cta'], rules: [], family: 'detail',
    content: [['title', '.im-detail-title', 'field', 'events/feed-the-world.title', 'Feed the world']] },
  mast('en-blog', '/blog', 'blog/index.html', 'BlogList', 'Blog', ['posts'], { family: 'list' }),
  { id: 'en-post', path: '/blog/charity-branding-is-yourbrand-digital-ready', src: POST, view: 'Post', identity: '.im-crumb-bar', cols: ['chrome', 'posts'], rules: [], family: 'detail',
    content: [['title', '.im-article-title', 'field', 'posts/charity-branding-is-yourbrand-digital-ready.title', 'Charity branding: is yourbrand digital ready?']] },
  mast('en-faq', '/help-faqs', 'help-faqs/index.html', 'Faq', 'Help & FAQs', ['accordion']),
  mast('en-contact', '/contact', 'contact/index.html', 'Contact', 'Contact', ['contact']),
  { id: 'en-not-found', path: '/404', src: 'nope-404/index.html', view: 'NotFound', identity: '.im-error', cols: ['chrome'], status: 404, rules: [],
    content: [['code', '.im-error-digits', 'field', 'chrome.not_found_code', '404']] }
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
  ...(['en-home', 'en-about'].includes(p.id) ? { images: 'placeholders' } : {}),
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
    nav: { site: '.im-nav li:nth-child(3) a', source: '#t4-header .navbar-nav > li:nth-child(3) > a' },
    footerTitle: { site: '.im-footnav h3', source: '#t4-footnav .module-title' },
    ground: 'html'
  },
  properties: ['font-size', 'font-weight', 'letter-spacing', 'padding-top', 'padding-left'],
  hexTolerance: 8,
  pxTolerance: 1
}
contract.design.coverage = [
  { selector: 'main h1, main h2, main h3', properties: ['font-family', 'font-weight'] },
  { selector: 'main p', properties: ['font-family'] },
  { selector: '.im-nav a', properties: ['font-size'] }
]
contract.design.images = { scope: 'body', placeholder: null }
contract.design.exceptions = [
  {
    kind: 'scan:contrast',
    match: '^(span\\.im-give-count|li\\.im-give-item)$',
    reason: 'The 01 and 02 numerals of the give cards are decorative, aria-hidden and drawn light grey as in the source (acm features style-5)',
    decision: 'DECISIONS D23'
  },
  {
    kind: 'scan:dark-on-dark',
    match: '^(span\\.im-give-count|li\\.im-give-item)$',
    reason: 'The 01 and 02 numerals of the give cards are decorative, aria-hidden and drawn light grey as in the source (acm features style-5)',
    decision: 'DECISIONS D23'
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
// the off-canvas menu exists below 992 px only (its button is hidden above), so no `interactions` state is declared for the 1440 frame
contract.interactions = {}
contract.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span', 'li'],
  platform: 'Chromium (Playwright). One family is shipped locally (src/fonts.json): Readex Pro, a variable file per subset.',
  allowed: { en: ['Readex Pro', 'Font Awesome 6 Free Solid', 'Font Awesome 6 Brands Regular'] }
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
      { page: 'en-about', reason: 'About draws the mission boxes, the give cards and the fact tiles (own components)' },
      { page: 'en-contact', reason: 'Contact draws the form, the map link and the sidebar cards (own components)' },
      { page: 'en-donations', reason: 'The causes list draws the donation card grid and its pagination (own components)' },
      { page: 'en-event', reason: 'The event page draws the info panel and the join card (own components)' },
      { page: 'en-events', reason: 'The events list draws the event cards in a grid (own components)' },
      { page: 'en-faq', reason: 'FAQ draws the accordion (own component)' },
      { page: 'en-post', reason: 'The post draws the share row, the neighbours and the related posts (own components)' }
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
  [
    /author|j-page|user|featured|category-blog|tagged|password|username/,
    'Joomla utility and demo pages (accounts, authors, featured, category blog demo) are not ported (DECISIONS D7)'
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
