#!/usr/bin/env node
// Builds qa.contract.json for the pages built so far. Everything that is a DECISION (which pages, which rules, which
// strings the source says) is written here; every number is MEASURED:
//   - `design.rules[].styles` are measured on the running site (SITE_URL), per variant, then frozen in the contract;
//     light values were compared with the source by `design.parity` (geometry and type) before being frozen, and the
//     dark values are the declared dark palette (DECISIONS D8 -- the source has no dark frame);
//   - `source.files` are hashed by `tools/qa-contract.mjs init` (run first; this script keeps its `source` block).
//   node ingest/build-contract.mjs --site http://127.0.0.1:18301 [--out qa.contract.json]
// Run it from the package root after `node tools/qa-contract.mjs init source/snapshot qa.contract.json --config template.config.json`.
import { readFileSync, writeFileSync } from 'node:fs'
import { launchBrowser } from '../tools/qa-browser.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const SITE = opt('--site', 'http://127.0.0.1:18301')
const OUT = opt('--out', 'qa.contract.json')
const contract = JSON.parse(readFileSync(OUT, 'utf8'))
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const HOME_SRC = 'index.html'
const POST_SRC =
  'index.php/blog/9-restaurant-marketing/14-how-the-gop-and-dems-differ-on-restaurant-issues/index.html'
const E404_SRC = 'index.php/nope-404/index.html'
const SRC = {
  blog: 'index.php/blog/index.html',
  category: 'index.php/blog/8-restaurant-business/index.html',
  featured: 'index.php/explore/j-pages/featured-articles/index.html',
  tagged: 'index.php/explore/j-pages/tagged-items/index.html',
  categories: 'index.php/explore/j-pages/all-categories/index.html',
  search: 'index.php/explore/j-pages/smart-search/index.html',
  about: 'index.php/about-us/index.html',
  history: 'index.php/about-us/our-history/index.html',
  menu: 'index.php/menu/index.html',
  simple: 'index.php/menu/simple-menu/index.html',
  image: 'index.php/menu/menu-with-image/index.html',
  twocol: 'index.php/menu/2-column-menu/index.html',
  offers: 'index.php/offers/index.html',
  reservation: 'index.php/contact/phone-reservation/index.html',
  contact: 'index.php/contact/contact-us/index.html',
  gallery: 'index.php/gallery/index.html',
  album: 'index.php/gallery/18-sample-album-1/index.html'
}
const POST_PATH = '/restaurant-marketing/how-the-gop-and-dems-differ-on-restaurant-issues'
const ALL = contract.variants.map((v) => v.id)

// ── rules: id → site selector, which page file it is read from, optional on pages that may lack it ─────────
const RULES = [
  ['body-type', 'body', HOME_SRC],
  ['topbar-text', '.rs-topbar span', HOME_SRC],
  ['nav-link', '.rs-nav-main > li:nth-child(3) > a', HOME_SRC, true],
  ['nav-bar', '.rs-nav-inner', HOME_SRC, true],
  ['slide-title', '.rs-slide.is-active .rs-slide-title', HOME_SRC],
  ['display-h1', '.rs-hero h1', HOME_SRC],
  ['hero-intro', '.rs-hero-intro', HOME_SRC],
  ['section-title', 'main .rs-section-title', HOME_SRC],
  ['section-desc', '.rs-section-desc', HOME_SRC],
  ['offer-title', '.rs-offer-text h3', HOME_SRC],
  ['offer-price', '.rs-offer-price', HOME_SRC],
  ['tabs-heading', '.rs-tabs-box h2', HOME_SRC],
  ['tab-active', '.rs-tablist button[aria-selected=true]', HOME_SRC],
  ['dish-name', '.rs-dish h3', HOME_SRC],
  ['dish-price', '.rs-dish-price', HOME_SRC],
  ['list-heading', '.rs-main :is(h1, h2).rs-display', HOME_SRC],
  ['post-card-title', '.rs-post-card h2', HOME_SRC],
  ['post-badge', '.rs-cat-badge', HOME_SRC],
  ['side-title', '.rs-side-title', HOME_SRC],
  ['side-link', '.rs-side-mod.is-primary li a', HOME_SRC],
  ['quote', '.rs-quote p', HOME_SRC],
  ['footer-title', '.rs-footer-title', HOME_SRC],
  ['footer-text', '.rs-footer-cols p', HOME_SRC],
  ['copyright', '.rs-copyright p', HOME_SRC],
  ['masthead-title', '.rs-masthead :is(h1, .rs-masthead-title)', POST_SRC],
  ['article-title', '.rs-article h1', POST_SRC],
  ['article-meta', '.rs-article .rs-meta', POST_SRC],
  ['article-body', '.rs-prose p', POST_SRC],
  ['pager', '.rs-pager a', POST_SRC],
  ['p-font', 'main p', HOME_SRC, false, ['font-family']],
  ['nav-font', '.rs-nav a', HOME_SRC, true, ['font-size']],
  ['collage-title', '.rs-collage-card .rs-display', HOME_SRC],
  ['more-title', '.rs-more-title', SRC.blog],
  ['cat-card-title', '.rs-category-card h3', SRC.categories],
  ['features-title', '.rs-features-text h1', SRC.about],
  ['team-name', '.rs-team-name', SRC.about],
  ['history-h1', '.rs-history-text h1', SRC.history],
  ['history-h2', '.rs-history-text h2', SRC.history],
  ['lead-title', '.rs-lead h2', SRC.history],
  ['timeline-title', '.rs-timeline-title', SRC.history],
  ['dish-name-1', '.rs-dishes.is-style-1 .rs-dish-name', SRC.simple, true],
  ['dish-name-2', '.rs-dishes.is-style-2 .rs-dish-name', SRC.image, true],
  ['dish-name-3', '.rs-dishes.is-style-3 .rs-dish-name', SRC.twocol, true],
  [
    'hh-title',
    '.rs-hh.is-style-1 .rs-hh-title',
    SRC.offers,
    false,
    ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform']
  ],
  // the 2nd and 3rd banners draw a bigger title (measured against the source in P7): a rule compares every match with the first one (SF-26)
  [
    'hh-title-2',
    '.rs-hh:not(.is-style-1) .rs-hh-title',
    SRC.offers,
    false,
    ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform']
  ],
  ['tag-heading', '.rs-list-title.is-plain', SRC.tagged],
  ['tag-title', '.rs-tag-title', SRC.tagged],
  ['reserve-title', '.rs-reserve-title', SRC.reservation],
  ['reserve-h3', '.rs-reserve-text h3', SRC.reservation],
  ['reserve-online', '.rs-reserve-online h3', SRC.reservation],
  ['contact-title', '.rs-contact-title', SRC.contact],
  ['contact-card-h2', '.rs-contact-card.is-accent h2', SRC.contact],
  ['contact-details-h2', '.rs-contact-details h2', SRC.contact],
  ['album-title', '.rs-album-title', SRC.album],
  ['nf-code', '.rs-notfound .rs-code', E404_SRC],
  ['nf-title', '.rs-notfound h1', E404_SRC],
  ['nf-button', '.rs-notfound .rs-btn', E404_SRC]
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
const BASE = [
  'body-type',
  'topbar-text',
  'nav-link',
  'nav-bar',
  'nav-font',
  'p-font',
  'footer-title',
  'footer-text',
  'copyright'
]
const LIST = [...BASE, 'masthead-title', 'post-card-title', 'post-badge', 'side-title', 'side-link']
// Order matters: a rule is measured on the first page that carries it, so the pages where an optional role is visible come first.
const PAGES_OF = {
  'en-home': [
    ...BASE,
    'slide-title',
    'display-h1',
    'hero-intro',
    'section-title',
    'section-desc',
    'offer-title',
    'offer-price',
    'collage-title',
    'tabs-heading',
    'tab-active',
    'dish-name',
    'dish-price',
    'list-heading',
    'post-card-title',
    'post-badge',
    'side-title',
    'side-link',
    'quote'
  ],
  'en-post': [
    ...BASE,
    'masthead-title',
    'article-title',
    'article-meta',
    'article-body',
    'pager',
    'side-title',
    'side-link'
  ],
  'en-not-found': [...BASE, 'nf-code', 'nf-title', 'nf-button'],
  'en-blog': [...LIST, 'more-title'],
  'en-category': LIST,
  'en-featured': [...BASE, 'masthead-title', 'post-card-title', 'post-badge'],
  'en-tagged': BASE.filter((r) => r !== 'p-font').concat([
    'masthead-title',
    'tag-heading',
    'tag-title',
    'side-title',
    'side-link'
  ]),
  'en-categories': [...BASE, 'masthead-title', 'cat-card-title'],
  'en-search': [...BASE, 'masthead-title', 'side-title', 'side-link', 'quote'],
  'en-about': [...BASE, 'masthead-title', 'features-title', 'section-title', 'team-name'],
  'en-history': [
    ...BASE,
    'masthead-title',
    'history-h1',
    'history-h2',
    'lead-title',
    'section-title',
    'timeline-title'
  ],
  'en-menu-simple': [...BASE, 'masthead-title', 'section-title', 'dish-name-1'],
  'en-menu-image': [...BASE, 'masthead-title', 'section-title', 'dish-name-2'],
  'en-menu-2col': [...BASE, 'masthead-title', 'section-title', 'dish-name-3'],
  'en-menu': [
    ...BASE,
    'masthead-title',
    'tabs-heading',
    'tab-active',
    'dish-name-1',
    'dish-name-2',
    'dish-name-3'
  ],
  'en-offers': BASE.filter((r) => r !== 'nav-link').concat(['masthead-title', 'hh-title', 'hh-title-2']),
  'en-reservation': [...BASE, 'masthead-title', 'reserve-title', 'reserve-h3', 'reserve-online'],
  'en-contact': [...BASE, 'contact-title', 'contact-card-h2', 'contact-details-h2'],
  'en-gallery': BASE.filter((r) => r !== 'p-font').concat('list-heading'),
  'en-album': BASE.filter((r) => r !== 'p-font').concat('album-title')
}
// ── the other articles, category lists and albums: the same views as en-post / en-category / en-album, one contract
// page each (P7 full scope). The source file of an article is found by its <title>: Joomla's numbered folder names are
// stale (`2-8-habits-…` is "4 Habits…"), the title is what the source says.
const SEED = JSON.parse(readFileSync('seed/seed.json', 'utf8'))
const decode = (t) =>
  t
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;|&rsquo;/g, '\u2019')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()
const srcTitles = new Map()
for (const f of contract.source.files)
  if (/^index\.php\/(blog\/\d+-[a-z-]+\/\d+-|gallery\/\d+-sample-album)[^/]*\/index\.html$/.test(f.path)) {
    const m = /<title>([^<]*)/.exec(readFileSync(`source/snapshot/${f.path}`, 'utf8'))
    if (m) srcTitles.set(decode(m[1]), f.path)
  }
const GEN_POSTS = SEED.content.posts.filter(
  (e) =>
    !['gallery', 'pages'].includes(e.taxonomies.category[0]) &&
    e.slug !== 'how-the-gop-and-dems-differ-on-restaurant-issues'
)
const GEN_ALBUMS = SEED.content.posts.filter(
  (e) => e.taxonomies.category[0] === 'gallery' && e.slug !== 'sample-album-1'
)
const GEN_CATS = [
  ['restaurant-news', 'blog/11-restaurant-news'],
  ['restaurant-guide', 'blog/12-restaurant-guide'],
  ['restaurant-marketing', 'blog/9-restaurant-marketing']
]
for (const e of GEN_POSTS) PAGES_OF[`en-post-${e.slug}`] = PAGES_OF['en-post']
for (const e of GEN_ALBUMS) PAGES_OF[`en-${e.slug}`] = PAGES_OF['en-album']
for (const [slug] of GEN_CATS) PAGES_OF[`en-category-${slug}`] = PAGES_OF['en-category']
const PAGE_URL = {
  'en-home': '/',
  'en-post': POST_PATH,
  'en-not-found': '/404',
  'en-blog': '/blog',
  'en-category': '/restaurant-business',
  'en-featured': '/explore/j-pages/featured-articles',
  'en-tagged': '/explore/j-pages/tagged-items',
  'en-categories': '/explore/j-pages/all-categories',
  'en-search': '/explore/j-pages/smart-search?q=fish',
  'en-about': '/about-us',
  'en-history': '/about-us/our-history',
  'en-menu-simple': '/menu/simple-menu',
  'en-menu-image': '/menu/menu-with-image',
  'en-menu-2col': '/menu/2-column-menu',
  'en-menu': '/menu',
  'en-offers': '/offers',
  'en-reservation': '/contact/phone-reservation',
  'en-contact': '/contact/contact-us',
  'en-gallery': '/gallery',
  'en-album': '/gallery/sample-album-1'
}
// rule id → a page that has it (measured there)
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
  // an optional rule's element can be absent on a variant (the desktop menu is hidden below 992px, where the off-canvas
  // button takes its place): the validator still wants a measured value per variant, so the same theme's 1440 value is
  // repeated there. The tools skip an optional rule that matches nothing, so the repeated value is never compared.
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
// qa-browser compares EVERY match of a selector, case-sensitively, with innerText (SF-38): a selector names ONE element
// (`>> nth=0`, Playwright's own engine) and `expected` is the text as the visitor reads it, so a heading the theme sets
// in capitals is expected in capitals. UPPER lists the selectors whose element has `text-transform: uppercase`.
const UPPER = new Set([
  '.ec-form-submit',
  '.rs-contact-card.is-accent h2',
  '.rs-contact-title',
  '.rs-hero h1',
  '.rs-lead h2',
  '.rs-masthead :is(h1, .rs-masthead-title)',
  '.rs-notfound .rs-btn',
  '.rs-notfound h1',
  '.rs-offers .rs-section-title',
  '.rs-reserve-title',
  '.rs-side-title',
  '.rs-slide.is-active .rs-slide-title',
  '.rs-tabs-box h2',
  '.rs-topbar span',
  '.rs-main h2.rs-display',
  'h1.rs-list-title',
  'h1.rs-section-title',
  '.rs-footer-title',
  '.rs-pager a',
  '.rs-team-name'
])
const F = (id, selector, source, owner, binding, expected, attribute = 'text') => ({
  id,
  selector: selector.includes('>>') ? selector : `${selector} >> nth=0`,
  source,
  owner,
  binding,
  attribute,
  expected: UPPER.has(selector) ? expected.toUpperCase() : expected
})
const homeContent = [
  F(
    'topbar',
    '.rs-topbar span',
    HOME_SRC,
    'field',
    'chrome.topbar_text (module 94)',
    '7.00am - 6.30pm Monday to Sunday'
  ),
  F(
    'slide',
    '.rs-slide.is-active .rs-slide-title',
    HOME_SRC,
    'field',
    'slideshow.items[0].slide_title',
    'The Best Bar & Restaurant in Brooklyn'
  ),
  F('hero-h1', '.rs-hero h1', HOME_SRC, 'field', 'hero.hero_heading', 'Welcome to RES Bar & Restaurant'),
  F(
    'offers-title',
    '.rs-offers .rs-section-title',
    HOME_SRC,
    'field',
    'features_intro/special-offers.title',
    'Special Offers'
  ),
  F(
    'offers-intro',
    '.rs-section-desc',
    HOME_SRC,
    'field',
    'features_intro/special-offers.section_intro (module-intro)',
    "This week's chef specials, cooked in small batches while the market lasts. Ask your server what is fresh today."
  ),
  F(
    'offer-1',
    '.rs-offer-text h3 >> nth=1',
    HOME_SRC,
    'field',
    'features_intro/special-offers.items[1].title',
    'Roasted Steak Roulade'
  ),
  F(
    'offer-price',
    '.rs-offer-price',
    HOME_SRC,
    'field',
    'features_intro/special-offers.items[0].price',
    '$14.95'
  ),
  F('tabs-h', '.rs-tabs-box h2', HOME_SRC, 'field', 'tabs/discover-our-menu.heading', 'Discover Our Menu'),
  F('dish-1', '.rs-dish h3', HOME_SRC, 'field', 'menu/snacks-x-salads.items[0].dish_name', 'Chili Chicken'),
  F('blog-h', '.rs-main h2.rs-display', HOME_SRC, 'field', 'pages/home.title', 'Read the latest News + Blog'),
  F(
    'post-1',
    '.rs-post-card h2',
    HOME_SRC,
    'field',
    'posts (featured, order 1)',
    'How the GOP and Dems differ on restaurant issues'
  ),
  F('cats', '.rs-side-title', HOME_SRC, 'setting', 'chrome.categories_title', 'Categories'),
  F('footer-loc', '.rs-footer-title', HOME_SRC, 'field', 'chrome.footer_location_title', 'Location')
]
const postContent = [
  F(
    'masthead',
    '.rs-masthead :is(h1, .rs-masthead-title)',
    POST_SRC,
    'field',
    'masthead/blog.title (module 99 params)',
    'Restaurant News'
  ),
  F(
    'h1',
    '.rs-article h1',
    POST_SRC,
    'field',
    'posts.title',
    'How the GOP and Dems differ on restaurant issues'
  ),
  F(
    'p1',
    '.rs-prose p',
    POST_SRC,
    'field',
    'posts.body',
    'Minimum wage, tipping, tax credits and health rules: restaurant owners follow policy debates closely because the outcomes land directly on their payroll and their menus.'
  ),
  F('cat', '.rs-article .rs-meta a', POST_SRC, 'derived', 'posts category term', 'Restaurant Marketing'),
  F('prev', '.rs-pager a', POST_SRC, 'setting', 'chrome.prev_label', 'Prev')
]
const nfContent = [
  F('code', '.rs-notfound .rs-code', E404_SRC, 'field', 'chrome.not_found_code', '404'),
  F('h1', '.rs-notfound h1', E404_SRC, 'field', 'chrome.not_found_title', 'Page not found'),
  F(
    'text',
    '.rs-notfound p',
    E404_SRC,
    'field',
    'chrome.not_found_text',
    'Please try one of the following pages:'
  ),
  F('back', '.rs-notfound .rs-btn', E404_SRC, 'field', 'chrome.not_found_back_label', 'Home Page')
]
const common = { locale: 'en', variants: ALL, states: ['default'] }
const mast = (src, slug, title) =>
  F(
    'masthead',
    '.rs-masthead :is(h1, .rs-masthead-title)',
    src,
    'field',
    `masthead/${slug}.title (module 99 params)`,
    title
  )
const page = (id, path, src, identity, view, collections, content, extra = {}) => ({
  id,
  path,
  ...common,
  status: 200,
  identity,
  source: [src],
  render: { view, collections: ['chrome', 'subscribe', ...collections] },
  rules: PAGES_OF[id],
  parity: extra.parity ?? ['nav', 'footerTitle', 'ground'],
  content,
  ...(extra.images ? { images: extra.images } : {})
})
const P = 'src/views/Page.astro'
contract.pages = [
  {
    id: 'en-home',
    path: '/',
    ...common,
    status: 200,
    identity: '.rs-slideshow',
    source: [HOME_SRC],
    render: {
      view: 'src/views/Home.astro',
      collections: [
        'chrome',
        'subscribe',
        'pages',
        'slideshow',
        'hero',
        'features_intro',
        'tabs',
        'menu',
        'testimonials',
        'posts'
      ]
    },
    rules: PAGES_OF['en-home'],
    parity: ['nav', 'heroH1', 'offerTitle', 'dishName', 'sideTitle', 'footerTitle', 'ground'],
    content: homeContent
  },
  {
    id: 'en-post',
    path: POST_PATH,
    ...common,
    status: 200,
    identity: '.rs-article',
    source: [POST_SRC],
    render: {
      view: 'src/views/Post.astro',
      collections: ['chrome', 'subscribe', 'posts', 'masthead', 'banner']
    },
    rules: PAGES_OF['en-post'],
    parity: ['nav', 'articleTitle', 'sideTitle', 'footerTitle', 'ground'],
    content: postContent
  },
  {
    id: 'en-not-found',
    path: '/404',
    ...common,
    status: 404,
    identity: '.rs-notfound',
    source: [E404_SRC],
    render: { view: 'src/views/NotFound.astro', collections: ['chrome'] },
    rules: PAGES_OF['en-not-found'],
    parity: ['ground'],
    content: nfContent
  },
  page(
    'en-blog',
    '/blog',
    SRC.blog,
    '.rs-post-card',
    'src/views/BlogList.astro',
    ['posts', 'masthead', 'banner'],
    [
      mast(SRC.blog, 'blog', 'Restaurant News'),
      F('side', '.rs-side-title', SRC.blog, 'setting', 'chrome.categories_title', 'Categories')
    ],
    { parity: ['nav', 'sideTitle', 'footerTitle', 'ground'] }
  ),
  page(
    'en-category',
    '/restaurant-business',
    SRC.category,
    '.rs-post-card',
    'src/views/BlogList.astro',
    ['posts', 'masthead', 'banner'],
    [
      mast(SRC.category, 'blog', 'Restaurant News'),
      F(
        'card',
        '.rs-post-card h2',
        SRC.category,
        'field',
        'posts (Restaurant Business, list_order 1)',
        '4 Habits That Can Improve Your Customer Service'
      )
    ],
    { parity: ['nav', 'sideTitle', 'footerTitle', 'ground'] }
  ),
  page(
    'en-featured',
    '/explore/j-pages/featured-articles',
    SRC.featured,
    '.rs-post-card',
    'src/views/BlogList.astro',
    ['posts', 'masthead'],
    [
      mast(SRC.featured, 'featured-articles', 'Featured Articles'),
      F(
        'card',
        '.rs-post-card h2',
        SRC.featured,
        'field',
        'posts (featured, order 1)',
        'How the GOP and Dems differ on restaurant issues'
      )
    ]
  ),
  page(
    'en-tagged',
    '/explore/j-pages/tagged-items',
    SRC.tagged,
    '.rs-tagged-list',
    'src/views/BlogList.astro',
    ['posts', 'masthead', 'banner'],
    [
      mast(SRC.tagged, 'tagged-items', 'Tagged Items'),
      F('h1', 'main h1.rs-list-title', SRC.tagged, 'field', 'masthead/tagged-items.title', 'Tagged Items')
    ],
    { parity: ['nav', 'sideTitle', 'footerTitle', 'ground'] }
  ),
  page(
    'en-categories',
    '/explore/j-pages/all-categories',
    SRC.categories,
    '.rs-category-card',
    P,
    ['pages', 'masthead', 'category_info', 'posts'],
    [
      mast(SRC.categories, 'all-categories', 'All Categories'),
      F(
        'card',
        '.rs-category-card h3 a',
        SRC.categories,
        'field',
        'category_info/restaurant-business.title',
        'Restaurant Business'
      )
    ]
  ),
  page(
    'en-search',
    '/explore/j-pages/smart-search?q=fish',
    SRC.search,
    '.rs-search-form',
    'src/views/Search.astro',
    ['posts', 'masthead'],
    [mast(SRC.search, 'smart-search', 'Search')]
  ),
  page(
    'en-about',
    '/about-us',
    SRC.about,
    '.rs-features-intro',
    P,
    ['pages', 'masthead', 'features_intro', 'statistics', 'teams'],
    [
      mast(SRC.about, 'about-us', 'About Us'),
      F(
        'features',
        '.rs-features-text h1',
        SRC.about,
        'field',
        'features_intro/about-us.title',
        'Our Food Network'
      ),
      F('team', '.rs-team-name', SRC.about, 'field', 'teams/our-team.items[0].member_name', 'Dewey Hall')
    ]
  ),
  page(
    'en-history',
    '/about-us/our-history',
    SRC.history,
    '.rs-history',
    P,
    ['pages', 'masthead', 'timeline'],
    [
      mast(SRC.history, 'our-history', 'Our History'),
      F(
        'h1',
        '.rs-history-text h1',
        SRC.history,
        'field',
        'pages/our-history.body',
        'Four decades on 5th Avenue'
      ),
      F(
        'lead',
        '.rs-lead h2',
        SRC.history,
        'field',
        'pages/our-history.lead_title',
        'Cooking for Brooklyn since 1982'
      )
    ]
  ),
  page(
    'en-menu',
    '/menu',
    SRC.menu,
    '.rs-tabs-box',
    P,
    ['pages', 'masthead', 'tabs', 'menu'],
    [
      mast(SRC.menu, 'menu', 'Menu'),
      F('tabs', '.rs-tabs-box h2', SRC.menu, 'field', 'tabs/our-menu.heading', 'Our Menu')
    ]
  ),
  page(
    'en-menu-simple',
    '/menu/simple-menu',
    SRC.simple,
    '.rs-dishes.is-style-1',
    P,
    ['pages', 'masthead', 'menu'],
    [
      mast(SRC.simple, 'default', 'RES Bar & Restaurant'),
      F('h1', 'h1.rs-section-title', SRC.simple, 'field', 'menu/simple-menu.title', 'Simple Menu'),
      F('dish', '.rs-dish-name', SRC.simple, 'field', 'menu/simple-menu.items[0].dish_name', 'Chili Chicken')
    ]
  ),
  page(
    'en-menu-image',
    '/menu/menu-with-image',
    SRC.image,
    '.rs-dishes.is-style-2',
    P,
    ['pages', 'masthead', 'menu'],
    [
      mast(SRC.image, 'default', 'RES Bar & Restaurant'),
      F('h1', 'h1.rs-section-title', SRC.image, 'field', 'menu/menu-with-image.title', 'Menu with Image')
    ]
  ),
  page(
    'en-menu-2col',
    '/menu/2-column-menu',
    SRC.twocol,
    '.rs-dishes.is-style-3',
    P,
    ['pages', 'masthead', 'menu'],
    [
      mast(SRC.twocol, 'default', 'RES Bar & Restaurant'),
      F('h1', 'h1.rs-section-title', SRC.twocol, 'field', 'menu/2-column-menu.title', '2 Column Menu')
    ]
  ),
  page(
    'en-offers',
    '/offers',
    SRC.offers,
    '.rs-hh',
    P,
    ['pages', 'masthead', 'happyhours'],
    [
      mast(SRC.offers, 'offers', 'Offers'),
      F('hh', '.rs-hh-title', SRC.offers, 'field', 'happyhours/happy-hours-style-1.hp_title', 'Happy Hours')
    ]
  ),
  page(
    'en-reservation',
    '/contact/phone-reservation',
    SRC.reservation,
    '.rs-reserve',
    P,
    ['pages', 'masthead', 'reservation'],
    [
      mast(SRC.reservation, 'phone-reservation', 'Make A Reservation'),
      F(
        'title',
        '.rs-reserve-title',
        SRC.reservation,
        'field',
        'reservation/reservation.title',
        'Reserve by Phone'
      ),
      F(
        'lunch',
        '.rs-reserve-text h3',
        SRC.reservation,
        'field',
        'reservation/reservation.blocks[0].title',
        'Reservations for lunch'
      )
    ]
  ),
  page(
    'en-contact',
    '/contact/contact-us',
    SRC.contact,
    '.rs-contact',
    P,
    ['pages', 'contact'],
    [
      F('form', '.rs-contact-title', SRC.contact, 'field', 'contact/contact.form_title', 'Contact Form'),
      F(
        'card',
        '.rs-contact-card.is-accent h2',
        SRC.contact,
        'field',
        'contact/contact.card_title',
        'Contact Us'
      ),
      F(
        'send',
        '.ec-form-submit',
        SRC.contact,
        'field',
        'forms/contact-en.settings.submitLabel',
        'Send Email'
      )
    ]
  ),
  page(
    'en-gallery',
    '/gallery',
    SRC.gallery,
    '.rs-albums',
    'src/views/Gallery.astro',
    ['posts', 'slideshow'],
    [F('h1', 'h1.rs-list-title', SRC.gallery, 'derived', 'posts category `gallery` label', 'Gallery')]
  ),
  page(
    'en-album',
    '/gallery/sample-album-1',
    SRC.album,
    '.rs-album',
    'src/views/Gallery.astro',
    ['posts', 'slideshow'],
    [F('h1', '.rs-album-title', SRC.album, 'field', 'posts/sample-album-1.title', 'Sample Album 1')]
  )
]
for (const [slug, dir] of GEN_CATS)
  contract.pages.push(
    page(
      `en-category-${slug}`,
      `/${slug}`,
      `index.php/${dir}/index.html`,
      '.rs-post-card',
      'src/views/BlogList.astro',
      ['posts', 'masthead', 'banner'],
      [
        mast(`index.php/${dir}/index.html`, 'blog', 'Restaurant News'),
        F(
          'side',
          '.rs-side-title',
          `index.php/${dir}/index.html`,
          'setting',
          'chrome.categories_title',
          'Categories'
        )
      ],
      { parity: ['nav', 'sideTitle', 'footerTitle', 'ground'] }
    )
  )
for (const e of GEN_POSTS) {
  const src = srcTitles.get(e.data.title)
  if (!src) throw new Error(`no source file with <title> ${e.data.title}`)
  contract.pages.push(
    page(
      `en-post-${e.slug}`,
      `/${e.taxonomies.category[0]}/${e.slug}`,
      src,
      '.rs-article',
      'src/views/Post.astro',
      ['posts', 'masthead', 'banner'],
      [F('h1', '.rs-article h1', src, 'field', 'posts.title', e.data.title)],
      { parity: ['nav', 'articleTitle', 'sideTitle', 'footerTitle', 'ground'] }
    )
  )
}
for (const e of GEN_ALBUMS) {
  const src = srcTitles.get(e.data.title)
  if (!src) throw new Error(`no source file with <title> ${e.data.title}`)
  contract.pages.push(
    page(
      `en-${e.slug}`,
      `/gallery/${e.slug}`,
      src,
      '.rs-album',
      'src/views/Gallery.astro',
      ['posts', 'slideshow'],
      [F('h1', '.rs-album-title', src, 'field', `posts/${e.slug}.title`, e.data.title)]
    )
  )
}
const layout = (id, view, rep, pages, family) => ({
  id,
  view,
  representative: rep,
  pages,
  states: ['default'],
  ...(family ? { family } : {}),
  hasSource: true
})
// One layout per look, not per view file: eyes look per layout (one representative page), so a view that prints
// several looks (the menu styles, the history timeline, the offers banners, the album) is several layouts here. The
// view stays the same file; `family` stays on the first layout of each kind so that the Fast Gate picks one of each.
contract.layouts = [
  layout('Home', 'src/views/Home.astro', 'en-home', ['en-home']),
  layout(
    'Post',
    'src/views/Post.astro',
    'en-post',
    ['en-post', ...GEN_POSTS.map((e) => `en-post-${e.slug}`)],
    'detail'
  ),
  layout('NotFound', 'src/views/NotFound.astro', 'en-not-found', ['en-not-found']),
  layout(
    'BlogList',
    'src/views/BlogList.astro',
    'en-blog',
    ['en-blog', 'en-category', ...GEN_CATS.map(([s]) => `en-category-${s}`)],
    'list'
  ),
  layout('Featured', 'src/views/BlogList.astro', 'en-featured', ['en-featured']),
  layout('Tagged', 'src/views/BlogList.astro', 'en-tagged', ['en-tagged']),
  layout('Search', 'src/views/Search.astro', 'en-search', ['en-search'], 'search'),
  layout('Gallery', 'src/views/Gallery.astro', 'en-gallery', ['en-gallery'], 'gallery'),
  layout('Album', 'src/views/Gallery.astro', 'en-album', [
    'en-album',
    ...GEN_ALBUMS.map((e) => `en-${e.slug}`)
  ]),
  layout('Page', P, 'en-about', ['en-about'], 'page'),
  layout('History', P, 'en-history', ['en-history']),
  layout('Menu', P, 'en-menu', ['en-menu']),
  layout('MenuSimple', P, 'en-menu-simple', ['en-menu-simple']),
  layout('MenuImage', P, 'en-menu-image', ['en-menu-image']),
  layout('Menu2Col', P, 'en-menu-2col', ['en-menu-2col']),
  layout('Offers', P, 'en-offers', ['en-offers']),
  layout('Reservation', P, 'en-reservation', ['en-reservation']),
  layout('Categories', P, 'en-categories', ['en-categories']),
  layout('Contact', 'src/components/sections/Contact.astro', 'en-contact', ['en-contact'], 'form')
]

// ── parity: the same logical element on the source render and on the site ─────────────────────────────────────
// Geometry and type only: colours differ in dark by design (D8) and are held by `design.rules`.
contract.design.parity = {
  selectors: {
    nav: { site: '.rs-nav-main > li:nth-child(3) > a', source: '#t3-mainnav .nav > li:nth-child(4) > a' },
    heroH1: { site: '.rs-hero h1', source: '#Mod100 h1' },
    offerTitle: { site: '.rs-offers .rs-section-title', source: '#Mod108 .t3-section-title' },
    dishName: { site: '.rs-dish h3', source: '#Mod103 .dish-name' },
    sideTitle: { site: '.rs-side-mod.is-primary .rs-side-title', source: '.t3-sidebar .module-title' },
    footerTitle: { site: '.rs-footer-title', source: '#t3-footer .module-title' },
    articleTitle: {
      site: '.rs-article h1',
      source: 'article .article-title, .article-header h1, .page-header h1'
    },
    ground: 'body'
  },
  properties: ['font-size', 'font-weight', 'letter-spacing', 'padding-top', 'padding-left'],
  hexTolerance: 8,
  pxTolerance: 1
}
contract.design.coverage = [
  { selector: 'main h1, main h2, main h3', properties: ['font-family', 'font-weight'] },
  { selector: 'main p', properties: ['font-family'] },
  { selector: '.rs-nav a', properties: ['font-size'] }
]
contract.design.images = { scope: 'body', placeholder: null }
contract.design.exceptions = []
contract.interactions = {}
contract.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span', 'li'],
  platform:
    'Chromium (Playwright). Three Google families are self-hosted by Astro (src/fonts.json): Teko (display), Noticia Text (body), Roboto Mono (UI).',
  allowed: { en: ['Teko', 'Teko Light', 'Noticia Text', 'Roboto Mono'] }
}
// forms and search join when a form / the search page is built (P5); declaring them now would demand receipts for
// things that do not exist yet
contract.capabilities = ['audit-log', 'seo', 'media', 'forms']
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
// source pages no built view reads: `excluded` with the reason (DECISIONS D21), never a silent drop
const mapped = new Set(contract.pages.flatMap((p) => p.source))
const REASONS = [
  [
    /explore\/j-pages\/(login|registration|reminder|reset-password)|your-profile|user-profile/,
    'visitor accounts are not ported: a customer site has no front-end sign-in (DECISIONS D21)'
  ],
  [
    /explore\/(bonus-pages|themes)|category-blog/,
    'demo page of the source (error and offline pages, colour variants, typography): not ported (DECISIONS D21)'
  ],
  [
    /component\/tags\/tag/,
    'Joomla tag listing: tags are printed as labels, not as links (content-gaps G-15)'
  ],
  [
    /blog\/(8|9|11|12)-restaurant-[a-z]+\/\d+-/,
    'same view as en-post (detail family); each article joins `pages` at P7 (full scope)'
  ],
  [
    /blog\/(9|11|12)-restaurant-[a-z]+\/index/,
    'same view as en-category (list family); joins `pages` at P7 (full scope)'
  ],
  [
    /gallery\/(19|2\d)-sample-album/,
    'same view as en-album (gallery family); joins `pages` at P7 (full scope)'
  ]
]
for (const f of contract.source.files)
  if ((f.disposition === 'converted' || f.disposition === 'excluded') && !mapped.has(f.path)) {
    f.disposition = 'excluded'
    f.reason = REASONS.find(([re]) => re.test(f.path))?.[1] ?? 'not ported: see DECISIONS D21'
  } else if (mapped.has(f.path)) {
    f.disposition = 'converted'
    delete f.reason
  }
// the Forms plugin is in use now (Contact, Subscribe): its review gate is required (P7 signs it)
contract.reviews = { ...contract.reviews, forms: { mode: 'required' } }
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
    'compile.config.json',
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
    'public/brand/subscribe-decor.png',
    'public/brand/masthead-default.jpg',
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
