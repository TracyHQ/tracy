/**
 * The pages a listing must carry (`src/lib/listing-pages.js`), read off the release's own
 * `tracy_site_pages.json`: its top-level pages, capped at six, in file order. Create listing drafts
 * that set first, then fills the slots left from the demo's own menu.
 *
 * The fixtures are the real pages files of released templates (Tracy Base EmDash 0.5.2, whose
 * Create listing drafted Home alone on dev, 12/10/2026; Tracy Business WordPress and Joomla).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { draftListingLayouts, listingPagesOf, listingProblems } from '../src/lib/listing-pages.js'

const FIXTURES = new URL('./fixtures/template-customization-question-readiness/', import.meta.url)
const pagesFile = (dir) =>
  JSON.parse(readFileSync(new URL(`${dir}/tracy_site_pages.json`, FIXTURES), 'utf8')).pages

const TRACY_BASE_EMDASH = { platform: 'emdash', pages: pagesFile('c/tracy-base_emdash-0.x') }
const TRACY_BUSINESS_WP7 = { platform: 'wordpress', pages: pagesFile('b/tracy-business_wp7') }
const TRACY_BUSINESS_J6 = { platform: 'joomla', pages: pagesFile('b/tracy-business_j6') }
const KINETIC_J6 = { platform: 'joomla', pages: pagesFile('b/quickstart_ja-kinetic_j6') }

const paths = (pages) => pages.map((p) => p.path)

test('EmDash: every page of the primary menu, its record slug mapped to the path it answers at', () => {
  assert.deepEqual(
    listingPagesOf(TRACY_BASE_EMDASH).map((p) => [p.id, p.label, p.path]),
    [
      ['home', 'Home', '/'],
      ['product', 'Product', '/product'],
      ['services_page', 'Service', '/services'],
      ['pricing', 'Pricing', '/pricing'],
      ['blog', 'Resources', '/blog'],
      ['about', 'Company', '/about']
    ]
  )
})

test('WordPress and Joomla: a page id is its path, so nested pages stay off the listing', () => {
  assert.deepEqual(paths(listingPagesOf(TRACY_BUSINESS_WP7)), [
    '/',
    '/about',
    '/services',
    '/projects',
    '/news',
    '/contact'
  ])
  assert.deepEqual(paths(listingPagesOf(TRACY_BUSINESS_J6)), paths(listingPagesOf(TRACY_BUSINESS_WP7)))
  // ja-kinetic lists 14 pages at every depth; its top row is Home and Pricing.
  assert.deepEqual(paths(listingPagesOf(KINETIC_J6)), ['/', '/pricing'])
})

test('at most six pages, in file order, with the home page first wherever the file lists it', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${String(i)}`, label: `P${String(i)}` }))
  const release = {
    platform: 'wordpress',
    pages: [...many.slice(0, 3), { id: 'front', label: 'Home', home: true }, ...many.slice(3)]
  }
  assert.deepEqual(paths(listingPagesOf(release)), ['/', '/p0', '/p1', '/p2', '/p3', '/p4'])
})

test('no pages file: no page list to cover', () => {
  assert.equal(listingPagesOf({ platform: 'joomla', pages: null }), null)
})

// ── Create listing: the draft carries the release's pages, then what the demo's menu adds ──────

test('Create listing on Tracy Base EmDash drafts its six pages, though the demo menu read Home alone', () => {
  const layouts = draftListingLayouts(TRACY_BASE_EMDASH, [{ label: 'Home', path: '/' }])
  assert.deepEqual(
    layouts.map((l) => [l.key, l.label, l.path]),
    [
      ['home', 'Home', '/'],
      ['product', 'Product', '/product'],
      ['services', 'Service', '/services'],
      ['pricing', 'Pricing', '/pricing'],
      ['blog', 'Resources', '/blog'],
      ['about', 'Company', '/about']
    ]
  )
})

test('the demo menu fills the slots the pages leave, and its address and count are kept', () => {
  // ja-kinetic Joomla: SEF on, rewriting off, so the demo answers at /index.php/<path>.
  const links = [
    { label: 'Home', path: '/', address: '/index.php' },
    { label: 'Features', path: '/product/features', address: '/index.php/product/features' },
    { label: 'Pricing', path: '/pricing', address: '/index.php/pricing', count: 3 }
  ]
  const layouts = draftListingLayouts(KINETIC_J6, links)
  assert.deepEqual(
    layouts.map((l) => [l.path, l.address, l.count]),
    [
      ['/', '/index.php', undefined],
      ['/pricing', '/index.php/pricing', 3],
      ['/product/features', '/index.php/product/features', undefined]
    ]
  )
})

test('a Joomla page the demo menu did not read takes the demo’s /index.php prefix', () => {
  const layouts = draftListingLayouts(TRACY_BUSINESS_J6, [
    { label: 'Home', path: '/', address: '/index.php' }
  ])
  assert.equal(layouts.find((l) => l.path === '/contact')?.address, '/index.php/contact')
})

test('no pages file: the draft is the demo menu, as before', () => {
  const links = [
    { label: 'Home', path: '/' },
    { label: 'About', path: '/about' }
  ]
  assert.deepEqual(
    draftListingLayouts({ platform: 'wordpress', pages: null }, links).map((l) => l.path),
    ['/', '/about']
  )
})

test('the demo menu never fills a slot with a system page or a language switch', () => {
  // Tracy Business Joomla on dev: its listing carried "Not found" and "Русский" from the menu.
  const links = [
    { label: 'Home', path: '/' },
    { label: 'Login', path: '/pages/user/login-form' },
    { label: 'Registration', path: '/registration-form' },
    { label: 'Typography', path: '/typography' },
    { label: 'Not found', path: '/nope-404' },
    { label: 'Русский', path: '/ru' },
    { label: 'Careers', path: '/careers' }
  ]
  assert.deepEqual(
    draftListingLayouts(KINETIC_J6, links).map((l) => l.path),
    ['/', '/pricing', '/careers']
  )
})

// ── The saved listing against the rule: Road to live's Listing step reads `listingProblems` ─────

const LISTINGS = new URL('./fixtures/listing-pages/', import.meta.url)
/** A released template as dev holds it: its pages file and its saved listing, both real. */
const released = (dir, platform) => ({
  release: {
    platform,
    pages: JSON.parse(readFileSync(new URL(`${dir}/tracy_site_pages.json`, LISTINGS), 'utf8')).pages
  },
  card: JSON.parse(readFileSync(new URL(`${dir}/tracy_design_inspiration.json`, LISTINGS), 'utf8'))
})
const named = ({ missing, forbidden }) => ({
  missing: missing.map((p) => p.label),
  forbidden: forbidden.map((p) => p.label)
})

test('Tracy Business Joomla: every page there, but Not found, Русский and Terms · Privacy may not be', () => {
  const { release, card } = released('tracy-business_j6', 'joomla')
  assert.deepEqual(named(listingProblems(release, card)), {
    missing: [],
    forbidden: ['Terms · Privacy', 'Русский', 'Not found']
  })
})

test('JA Social II Joomla: a Home-only listing misses News and Contact Us', () => {
  const { release, card } = released('quickstart_ja-social-ii_j6', 'joomla')
  assert.deepEqual(named(listingProblems(release, card)), { missing: ['News', 'Contact Us'], forbidden: [] })
})

// Its Authors tab is an author list, a system page by the pages file's own rule (`utilityName`).
test('JA Impact WordPress: misses Events and Blog, and carries Authors and Login', () => {
  const { release, card } = released('quickstart_ja-impact_wp7', 'wordpress')
  assert.deepEqual(named(listingProblems(release, card)), {
    missing: ['Events', 'Blog'],
    forbidden: ['Authors', 'Login']
  })
})

test('JA Phio Joomla: its six top-level pages, nothing else, is clean', () => {
  const { release, card } = released('quickstart_ja-phio_j6', 'joomla')
  assert.deepEqual(named(listingProblems(release, card)), { missing: [], forbidden: [] })
})

test('Tracy Base EmDash on dev (Home, Product, Service, Pricing) misses Resources and Company', () => {
  const { release, card } = released('tracy-base_emdash-0.x', 'emdash')
  assert.deepEqual(listingProblems(release, card).missing, [
    { id: 'blog', label: 'Resources', path: '/blog' },
    { id: 'about', label: 'Company', path: '/about' }
  ])
  // A record may be listed at its own slug too, and a trailing slash does not matter.
  const atSlugs = {
    layouts: ['/', '/product/', '/services_page', '/pricing', '/blog', '/about'].map((path) => ({ path }))
  }
  assert.deepEqual(named(listingProblems(release, atSlugs)), { missing: [], forbidden: [] })
})

test('no pages file: nothing is required, and system pages are still not allowed', () => {
  const card = {
    layouts: [
      { label: 'Home', path: '/' },
      { label: 'Login Form', path: '/login-form' }
    ]
  }
  assert.deepEqual(named(listingProblems({ platform: 'wordpress', pages: null }, card)), {
    missing: [],
    forbidden: ['Login Form']
  })
})

test('the drafter’s own draft breaks no rule', () => {
  for (const [dir, platform] of [
    ['tracy-business_j6', 'joomla'],
    ['quickstart_ja-impact_wp7', 'wordpress'],
    ['tracy-base_emdash-0.x', 'emdash']
  ]) {
    const { release, card } = released(dir, platform)
    const layouts = draftListingLayouts(release, card.layouts)
    assert.deepEqual(named(listingProblems(release, { layouts })), { missing: [], forbidden: [] }, dir)
  }
})
