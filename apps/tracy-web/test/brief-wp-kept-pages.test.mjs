/**
 * On a WordPress site a page goes only when the customer UNTICKED it in the Pages question (product owner, 08/10/2026,
 * TCH #1013): a ticked page, a page the question never named and the template's showcase all stay published. Run over the REAL `tracy-base/wp7/1.1.2` contract, the release's own page tree (read from
 * `tracy-base-wp7-database-1.1.2.sql.gz`) and its page list (`tracy_site_pages.json`: Home, Product, Pricing).
 *
 * Measured 08/10/2026 on dev (tamq-7q-tbwp5, tamq-7q-tbwp6, a bakery, Pages = Home + Product): /product/ answered 404 and its
 * menu links led to the contact page. The judge, asked which of the template's pages a bakery would not want, named the
 * Product page (a SaaS template's product tour), and the sweep drafted it although the customer had ticked it. The judge is
 * no longer asked about pages at all, and the showcase rule no longer hides one.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import {
  keptById,
  slugsForIds,
  unpickedById,
  unpickedPages
} from '../src/sites/brief-engines/picked-pages.js'
import { sweepWordPress, writtenLines } from '../src/sites/brief-engines/wp-residue.js'

const contract = contractFor(defaultContracts(), 'tracy-base/wp7', '1.1.2')
assert.ok(contract, 'the checkout ships tracy-base/wp7 1.1.2')
const contentMap = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const entitySlugs = new Set(
  contentMap.entities.filter((e) => e.identity?.postType === 'page').map((e) => String(e.identity.slug))
)

/** The release's page list (`tracy_site_pages.json`, regenerated 08/10/2026), as the server hands it to the brief. */
const ALL = [
  { id: 'home', label: 'Home', home: true },
  { id: 'product', label: 'Product' },
  { id: 'pricing', label: 'Pricing' }
]

const HOST = 'https://tamq-7q-tbwp5.tracy.site'
/** The release's published pages: id, path, title, and whether the page carries text of its own (the others are empty or a shortcode). */
const TREE = [
  [94, 'home', 'Home', true],
  [95, 'pricing', 'Pricing', true],
  [96, 'product', 'Product', true],
  [97, 'resources', 'Resources', false],
  [98, 'company', 'Company', false],
  [99, 'account', 'Account', false],
  [100, 'services', 'Service', true],
  [101, 'pages', 'Pages', false],
  [102, 'resources/home-variation', 'Home variation', true],
  [103, 'resources/typography', 'Typography', true],
  [106, 'resources/style-guide', 'Design system', true],
  [107, 'resources/home-2', 'Home — variant', true],
  [108, 'company/about', 'About', true],
  [110, 'resources/sign-in', 'Sign in', false],
  [116, 'resources/contact', 'Contact us', true],
  [117, 'resources/faq', 'Help centre', true],
  [118, 'services/service-detail', 'Website design & build', true],
  [119, 'company/careers', 'Careers', true],
  [120, 'resources/marketing-samples', 'Marketing samples', true],
  [125, 'resources/home-onepage', 'Home - Onepage', true],
  [126, 'company/team', 'Team', true],
  [128, 'resources/blog', 'Blog', true]
]
const section = (title) =>
  `<!-- wp:group -->\n<div class="wp-block-group"><!-- wp:heading -->\n<h2>${title} of Orbitline</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>Orbitline ships websites for growing teams.</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group -->`
/** The main menu of the release (`wp_navigation` 137), its Product and Pricing links as the release stores them. */
const NAV = [
  `<!-- wp:navigation-link {"label":"Product","type":"page","id":96,"url":"${HOST}/product/","kind":"post-type"} /-->`,
  `<!-- wp:navigation-link {"label":"Pricing","type":"page","id":95,"url":"${HOST}/pricing/","kind":"post-type"} /-->`,
  `<!-- wp:navigation-link {"label":"About","type":"page","id":108,"url":"${HOST}/company/about/","kind":"post-type"} /-->`
].join('\n')

/** The site behind the door: pages and the menu, as listed, and every status written. */
function tracyBaseSite() {
  const pages = TREE.map(([id, at, title, text]) => ({
    id,
    slug: String(at).split('/').at(-1),
    title,
    status: 'publish',
    url: `${HOST}/${at}/`,
    content: text ? section(title) : ''
  }))
  const navs = [{ id: 137, slug: 'tracy', title: 'tracy', status: 'publish', content: NAV }]
  const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'content.update') {
      const row = [...pages, ...navs].find((r) => r.id === params.id)
      if (row && params.fields?.post_status !== undefined) row.status = params.fields.post_status
      if (row && params.fields?.post_content !== undefined) row.content = params.fields.post_content
      return { ok: true }
    }
    if (action === 'content.get') return { ok: true, item: {} }
    const rows = params.post_type === 'page' ? pages : navs
    const items = rows.slice(params.offset, params.offset + params.limit).map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      url: r.url,
      ...(params.include_body ? { content: r.content } : {})
    }))
    return { ok: true, items }
  }
  return { pages, navs, call }
}

/** The sweep's input as the WordPress engine builds it for a brief whose Pages answer is `picked`. */
const sweepFor = (/** @type {any} */ call, /** @type {string[]} */ picked) => {
  const sitePages = { all: ALL, picked }
  return {
    call,
    applyId: 'residue-tbwp',
    written: writtenLines(['Tamarind Bakery bakes sourdough bread']),
    entitySlugs,
    judged: { relabel: new Map() },
    unwanted: (/** @type {Array<{ slug: string, url?: string }>} */ pages) =>
      new Set([
        ...unpickedPages([], pages).hide.map((p) => p.slug),
        ...slugsForIds(unpickedById(sitePages), pages)
      ]),
    kept: (/** @type {Array<{ slug: string, url?: string }>} */ pages) =>
      slugsForIds(keptById(sitePages), pages)
  }
}

/** What the judge said of the bakery on dev, when it was still asked about pages: every page of the template it was shown. */
const JUDGED = new Set([
  'pricing',
  'product',
  'home-variation',
  'home-2',
  'faq',
  'service-detail',
  'careers',
  'marketing-samples',
  'home-onepage'
])

test('tracy-base wp7: a ticked Product page stays published and in the menu; the unticked Pricing goes', async () => {
  const site = tracyBaseSite()
  const out = await sweepWordPress(sweepFor(site.call, ['home', 'product']))
  const status = (/** @type {string} */ slug) => site.pages.find((p) => p.slug === slug)?.status
  assert.equal(status('product'), 'publish', 'the customer ticked Product')
  assert.equal(status('pricing'), 'draft', 'the customer unticked Pricing')
  assert.equal(status('home'), 'publish')
  assert.deepEqual(out.hidden, ['pricing'])
  const nav = site.navs[0].content
  assert.ok(nav.includes(`"label":"Product","type":"page","id":96,"url":"${HOST}/product/"`), nav)
  assert.equal(nav.includes('"label":"Pricing"'), false, 'the unticked page leaves the menu')
})

test('tracy-base wp7: the pages the Pages question never named stay published, the judged ones and the showcase alike', async () => {
  const site = tracyBaseSite()
  await sweepWordPress(sweepFor(site.call, ['home', 'product']))
  const status = (/** @type {string} */ slug) => site.pages.find((p) => p.slug === slug)?.status
  for (const slug of [...JUDGED].filter((s) => s !== 'pricing')) assert.equal(status(slug), 'publish', slug)
  assert.equal(status('team'), 'publish', 'a showcase page the contract has no slot on stays')
  for (const slug of ['about', 'contact', 'blog', 'services']) assert.equal(status(slug), 'publish', slug)
})

test('tracy-base wp7: with no Pages answer no page goes', async () => {
  const site = tracyBaseSite()
  const input = sweepFor(site.call, ['home', 'product'])
  const out = await sweepWordPress({
    ...input,
    unwanted: () => [],
    kept: (pages) => slugsForIds(keptById(null), pages)
  })
  assert.deepEqual(out.hidden, [])
  for (const page of site.pages) assert.equal(page.status, 'publish', page.slug)
})

// 🔒 AN UNTICKED PAGE'S CHILDREN GO WITH IT (product owner, 08/10/2026, TCH #1013). WordPress answers a child page at its own
// address (`/company/team/`) whatever its parent became. Run over the release's real tree with a page list that names Company
// and its Team page (the release's own list names neither: Home, Product, Pricing).
test('tracy-base wp7: an unticked page takes the pages under it along; a ticked child and every other page stay', async () => {
  const site = tracyBaseSite()
  const listed = [...ALL, { id: 'company', label: 'Company' }, { id: 'company/team', label: 'Team' }]
  const input = sweepFor(site.call, ['home', 'product', 'pricing', 'company/team'])
  const sitePages = { all: listed, picked: ['home', 'product', 'pricing', 'company/team'] }
  const out = await sweepWordPress({
    ...input,
    unwanted: (pages) => slugsForIds(unpickedById(sitePages), pages),
    kept: (pages) => slugsForIds(keptById(sitePages), pages)
  })
  const status = (/** @type {string} */ slug) => site.pages.find((p) => p.slug === slug)?.status
  assert.deepEqual(out.hidden.sort(), ['about', 'careers', 'company'])
  assert.equal(status('team'), 'publish', 'the customer ticked Team, under Company')
  for (const slug of ['home', 'product', 'pricing', 'contact', 'blog', 'services', 'service-detail'])
    assert.equal(status(slug), 'publish', slug)
  assert.equal(
    site.navs[0].content.includes('"label":"About"'),
    false,
    'a child that goes leaves the menu too'
  )
})

// Measured 13/10/2026 on the local stand (Site questions check, JA Impact WP 1.0.9): the release lists two pages that share the
// slug `category-blog` — "Blog" at /category-blog/ and the kit's "Category Blog" at /pages/j-content/category-blog/. The
// customer unticked Blog and kept Category Blog, and Blog stayed published and in the menu: the sweep matched pages by slug,
// so the ticked namesake held both. A page is named by its path, and two pages of one slug are told apart by it.
test('two pages sharing a slug are told apart by their path: the unticked one goes, its ticked namesake stays', async () => {
  const pages = [
    {
      id: 160,
      slug: 'home',
      title: 'Home',
      status: 'publish',
      url: `${HOST}/home/`,
      content: section('Home')
    },
    {
      id: 164,
      slug: 'category-blog',
      title: 'Blog',
      status: 'publish',
      url: `${HOST}/category-blog/`,
      content: section('Blog')
    },
    {
      id: 169,
      slug: 'j-content',
      title: 'J Content',
      status: 'publish',
      url: `${HOST}/pages/j-content/`,
      content: ''
    },
    {
      id: 177,
      slug: 'category-blog',
      title: 'Category Blog',
      status: 'publish',
      url: `${HOST}/pages/j-content/category-blog/`,
      content: section('Category Blog')
    }
  ]
  const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'content.update') {
      const row = pages.find((r) => r.id === params.id)
      if (row && params.fields?.post_status !== undefined) row.status = params.fields.post_status
      return { ok: true }
    }
    if (action === 'content.get') return { ok: true, item: {} }
    const rows = params.post_type === 'page' ? pages : []
    return {
      ok: true,
      items: rows.slice(params.offset, params.offset + params.limit).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        status: r.status,
        url: r.url,
        ...(params.include_body ? { content: r.content } : {})
      }))
    }
  }
  const sitePages = {
    all: [
      { id: 'home', label: 'Home', home: true },
      { id: 'category-blog', label: 'Blog' },
      { id: 'pages/j-content/category-blog', label: 'Category Blog' }
    ],
    picked: ['home', 'pages/j-content/category-blog']
  }
  const out = await sweepWordPress({
    call,
    applyId: 'residue-impact',
    written: writtenLines(['Tamarind Bakery bakes sourdough bread']),
    entitySlugs: new Set(['home', 'category-blog']),
    judged: { relabel: new Map() },
    unwanted: (/** @type {Array<{ slug: string, url?: string }>} */ list) =>
      slugsForIds(unpickedById(sitePages), list),
    kept: (/** @type {Array<{ slug: string, url?: string }>} */ list) =>
      slugsForIds(keptById(sitePages), list),
    unwantedPaths: unpickedById(sitePages),
    keptPaths: keptById(sitePages)
  })
  assert.equal(pages.find((p) => p.id === 164)?.status, 'draft', 'the customer unticked Blog')
  assert.equal(pages.find((p) => p.id === 177)?.status, 'publish', 'the customer kept Category Blog')
  assert.ok(out.hidden.includes('category-blog'))
})
