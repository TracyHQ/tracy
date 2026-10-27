/**
 * The seed plan on a real design system (brutalism from the vendored library, its landing built by
 * the engine, the section library's own markup): pages, bodies, links, the customer's chosen copy.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { slotsOf } from '../../../../scripts/lib/od-slots-dom.mjs'
import { buildArtifactDocsFor } from '../../../cms/tracy-cms-sections/lib/artifacts.mjs'
import { fragmentSlots } from '../src/host/seed-dom.mjs'
import {
  brandSlotOf,
  buildSeedPlan,
  copyFor,
  fillSections,
  landingHrefs,
  MENU,
  pricingFromSection,
  SECTION_ORDER,
  urlOf
} from '../src/host/seed-plan.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const VENDOR = path.join(ROOT, 'vendor/tracy/od-design-system')
const SECTIONS_DIR = path.join(ROOT, 'packages/cms/tracy-cms-sections/sections')

const fixtureHtml = readFileSync(path.join(VENDOR, 'systems/brutalism/components.html'), 'utf8')
const fixtureSlots = slotsOf(fixtureHtml, [])
const landingHtml = buildArtifactDocsFor('brutalism', VENDOR).landing
const landingSlots = slotsOf(landingHtml, [])
const sections = Object.fromEntries(
  readdirSync(SECTIONS_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), readFileSync(path.join(SECTIONS_DIR, f), 'utf8')])
)

const SITE = {
  name: 'Claude Studio',
  nav: ['Work', 'Pricing', 'About'],
  eyebrow: 'Websites for small teams',
  headline: 'A site in a week, held for review.',
  sub: 'Claude Studio builds and runs websites for small teams in Hanoi, and every change waits for your yes.',
  cta: 'Start a project',
  cta2: 'See our work'
}
const PAGES = [
  { path: '/', type: 'home', label: 'Home', data: {} },
  {
    path: '/pricing/',
    type: 'pricing',
    label: 'Pricing',
    data: { title: 'Per project, not per hour.', plans: ['Starter', 'Studio'], prices: ['$900', '$2,400'] }
  }
]
const base = (cms = 'wordpress') => ({
  system: 'brutalism',
  systemName: 'Brutalism',
  cms,
  site: SITE,
  pages: PAGES,
  fixtureHtml,
  fixtureSlots,
  landingHtml,
  landingSlots,
  sections
})

test('urlOf: pretty permalinks on WordPress, index.php routes on Joomla, home is /', () => {
  assert.equal(urlOf('wordpress', 'design'), '/design/')
  assert.equal(urlOf('joomla', 'style-guide'), '/index.php/style-guide')
  assert.equal(urlOf('joomla', 'home'), '/')
})

test('no words, no plan', () => {
  const r = buildSeedPlan({ ...base(), site: { name: '', headline: '' } })
  assert.deepEqual(r, { ok: false, error: 'NO_WORDS' })
  assert.equal(buildSeedPlan({ ...base('drupal') }).ok, false)
})

test('the plan: home is the landing artifact, design the fixture, pricing when the site has one; menu in order', () => {
  const r = buildSeedPlan(base())
  assert.equal(r.ok, true)
  const { plan } = r
  assert.equal(plan.schemaVersion, 'tracy-seed-plan/v1')
  assert.deepEqual(plan.style, { inspiration: 'brutalism' })
  assert.deepEqual(
    plan.pages.map((p) => [p.slug, p.kind]),
    [
      ['home', 'artifact'],
      ['design', 'fixture'],
      ['pricing', 'page'],
      ['product', 'landing'],
      ['service', 'landing'],
      ['about', 'landing'],
      ['sections', 'landing'],
      ['style-guide', 'page'],
      ['contact', 'page']
    ]
  )
  assert.match(
    plan.pages[0].body,
    /^<div class="tracy-artifact" data-inspiration="brutalism" data-artifact="landing">/
  )
  assert.match(plan.pages[1].body, /^<div class="tracy-fixture" data-inspiration="brutalism">/)
  // the menu names only what the plan seeds (blog is the theme's own listing)
  assert.deepEqual(
    plan.menu.map((m) => m.slug),
    ['home', 'design', 'sections', 'product', 'service', 'blog', 'about', 'pricing', 'style-guide', 'contact']
  )
  const noPricing = buildSeedPlan({ ...base(), pages: [PAGES[0]] })
  assert.equal(
    noPricing.plan.pages.some((p) => p.slug === 'pricing'),
    false
  )
})

test('contact: the address the site gave, and nothing when it gave none or gave junk', () => {
  const with_ = buildSeedPlan({ ...base(), site: { ...SITE, contact: '  hello@studio.test ' } })
  // The name and the lead are the contact section's own words, so Joomla's contact record says
  // what the WordPress page says.
  assert.deepEqual(with_.plan.contact, {
    email: 'hello@studio.test',
    name: 'Tell us about your sites',
    lead: 'A few lines is enough. We reply within one working day.'
  })
  assert.equal(buildSeedPlan(base()).plan.contact.email, null)
  assert.equal(buildSeedPlan({ ...base(), site: { ...SITE, contact: 'ring us' } }).plan.contact.email, null)
})

test('home: the brand is the site, its nav links lead to the seeded pages in menu order, the buttons to pricing and contact', () => {
  const r = buildSeedPlan({ ...base(), sections })
  const home = r.plan.pages.find((p) => p.slug === 'home').body
  assert.match(home, /Claude Studio/)
  const brand = brandSlotOf(landingSlots, 'Brutalism')
  assert.ok(brand, 'the landing header names the system')
  assert.doesNotMatch(home, /Introducing Brutalism/)
  assert.match(home, /Introducing Claude Studio/)
  const hrefs = landingHrefs(
    landingSlots,
    MENU.map((m) => ({ ...m, url: urlOf('wordpress', m.slug) })),
    brand.id
  )
  const navHrefs = hrefs
    .filter((h) => h.href !== '/' && !['/pricing/', '/contact/'].includes(h.href))
    .map((h) => h.href)
  assert.ok(navHrefs.length > 0, 'the landing has nav slots')
  assert.equal(navHrefs[0], '/design/')
  for (const h of hrefs) assert.match(home, new RegExp(`href="${h.href.replace(/\//g, '\\/')}"`))
  assert.match(home, /href="\/pricing\/"/)
  assert.match(home, /Start a project/)
  // the same plan on Joomla routes through index.php
  const j = buildSeedPlan({ ...base('joomla'), sections }).plan.pages.find((p) => p.slug === 'home').body
  assert.match(j, /href="\/index\.php\/design"/)
})

test('design carries the home page words cut to the fixture; pricing is the library section with the site plans', () => {
  const { plan } = buildSeedPlan(base())
  const design = plan.pages.find((p) => p.slug === 'design').body
  assert.match(design, /A site in a week, held…/)
  const pricing = plan.pages.find((p) => p.slug === 'pricing').body
  assert.match(pricing, /tracy-plans__grid/)
  assert.match(pricing, /<p class="tracy-eyebrow">Starter<\/p>/)
  assert.match(pricing, /\$2,400/)
  assert.doesNotMatch(pricing, /Signal quality|tracy-fixture/)
})

test('pricingFromSection: plan names and prices in order, extra cards dropped, model words kept, no plans → null', () => {
  const two = pricingFromSection(
    sections.pricing,
    { plans: ['Starter', 'Studio'], prices: ['$900', '$2,400'] },
    { 'h2.0': 'Plans for small teams' }
  )
  assert.match(two, /Plans for small teams/)
  assert.match(two, /<p class="tracy-eyebrow">Starter<\/p>/)
  assert.match(two, /<p class="tracy-eyebrow">Studio<\/p>/)
  assert.doesNotMatch(two, /Agency|\$299/)
  assert.equal((two.match(/tracy-plan\b/g) || []).length >= 2, true)
  assert.equal(pricingFromSection(sections.pricing, { plans: [] }, null), null)
})

test('the version the customer chose on a chip wins; built-ins fall back to the cut rule', () => {
  const headlineSlot = fixtureSlots.find((s) => s.role === 'headline')
  const copy = {
    pages: {
      '/': {
        versions: [{ id: 'v1', slots: { [headlineSlot.id]: 'Written by the model for this chip' } }],
        selected: 'v1'
      },
      landing: { versions: [{ id: 'v2', slots: {} }], selected: 'yours' }
    }
  }
  assert.deepEqual(copyFor(copy, '/'), { [headlineSlot.id]: 'Written by the model for this chip' })
  assert.equal(copyFor(copy, 'landing'), null)
  assert.equal(copyFor(copy, '/nowhere/'), null)
  const { plan } = buildSeedPlan({ ...base(), copy })
  assert.match(plan.pages.find((p) => p.slug === 'design').body, /Written by the model for this chip/)
})

test('sections: the library filled with the model words, block comments gone, composite in order, plus the two pages', () => {
  const heroSlots = fragmentSlots(sections.hero)
  const headline = heroSlots.find((s) => s.role === 'headline')
  const sectionsCopy = { hero: { [headline.id]: 'A site in a week' } }
  const filled = fillSections({ hero: sections.hero }, sectionsCopy)
  assert.match(filled.hero, /A site in a week/)
  assert.doesNotMatch(filled.hero, /<!-- wp:/)
  const { plan } = buildSeedPlan({
    ...base(),
    sections,
    sectionsCopy,
    posts: [{ title: 'P', slug: 'p', excerpt: 'e', paragraphs: ['a', 'b', 'c'], imagePrompt: '' }]
  })
  const composite = plan.pages.find((p) => p.slug === 'sections').body
  assert.match(composite, /A site in a week/)
  const CLASS = { 'how-it-works': 'tracy-how', proof: 'tracy-stats', pricing: 'tracy-plans' }
  for (const n of SECTION_ORDER)
    assert.match(composite, new RegExp(`class="[^"]*${CLASS[n] ?? `tracy-${n}`}\\b`))
  assert.ok(composite.indexOf('tracy-hero') < composite.indexOf('tracy-cta-final'))
  assert.deepEqual(
    plan.pages.map((p) => p.slug),
    ['home', 'design', 'pricing', 'product', 'service', 'about', 'sections', 'style-guide', 'contact']
  )
  assert.deepEqual(
    plan.menu.map((m) => m.slug),
    ['home', 'design', 'sections', 'product', 'service', 'blog', 'about', 'pricing', 'style-guide', 'contact']
  )
  assert.equal(plan.posts.length, 1)
})

test('wanted: the plan seeds only the pages the customer chose, and the menu follows', () => {
  // The six the form offers. Three of today's seven — design, sections, style-guide — are the
  // library's own showcase and are never among them, so a customer's site stops carrying them
  // (Lee, 08/09).
  const r = buildSeedPlan({ ...base(), wanted: ['home', 'pricing', 'contact'] })
  assert.equal(r.ok, true)
  assert.deepEqual(
    r.plan.pages.map((p) => p.slug),
    ['home', 'pricing', 'contact']
  )
  assert.deepEqual(
    r.plan.menu.map((m) => m.slug),
    ['home', 'pricing', 'contact']
  )
})

test('wanted: blog is a menu entry with no page of its own, so it follows the choice too', () => {
  const withBlog = buildSeedPlan({ ...base(), wanted: ['home', 'blog'] })
  assert.deepEqual(
    withBlog.plan.menu.map((m) => m.slug),
    ['home', 'blog']
  )
  const withoutBlog = buildSeedPlan({ ...base(), wanted: ['home'] })
  assert.deepEqual(
    withoutBlog.plan.menu.map((m) => m.slug),
    ['home']
  )
})

test('no wanted: everything — a design system stand asks for no pages and gets the lot', () => {
  const r = buildSeedPlan(base())
  assert.deepEqual(
    r.plan.pages.map((p) => p.slug),
    ['home', 'design', 'pricing', 'product', 'service', 'about', 'sections', 'style-guide', 'contact']
  )
})

test('product, service and about: the three pages the form offers, each from its own sections', () => {
  const r = buildSeedPlan({ ...base(), wanted: ['home', 'product', 'service', 'blog', 'about', 'contact'] })
  assert.equal(r.ok, true)
  assert.deepEqual(
    r.plan.pages.map((p) => p.slug),
    ['home', 'product', 'service', 'about', 'contact']
  )
  // The menu carries blog, which has no page of its own, in the order the form lists them.
  assert.deepEqual(
    r.plan.menu.map((m) => m.slug),
    ['home', 'product', 'service', 'blog', 'about', 'contact']
  )
  const body = (slug) => r.plan.pages.find((p) => p.slug === slug).body
  // Three pages, not one page three times: each is built from a different part of the library.
  assert.notEqual(body('product'), body('service'))
  assert.notEqual(body('service'), body('about'))
  assert.notEqual(body('product'), body('about'))
})

test('pricing is a page the customer can choose, like any other', () => {
  // Lee, 08/09: Pricing joins the list the form offers rather than riding hidden on Product. One
  // chip, one page — no page appears that nobody ticked, and none is smuggled inside another.
  const r = buildSeedPlan({ ...base(), wanted: ['home', 'product', 'pricing', 'contact'] })
  assert.deepEqual(
    r.plan.pages.map((p) => p.slug),
    ['home', 'pricing', 'product', 'contact']
  )
  // It carries the site's own plans and prices, not the library's sample cards.
  assert.match(r.plan.pages.find((p) => p.slug === 'pricing').body, /\$900/)
  const missing = buildSeedPlan({ ...base(), pages: [], wanted: ['home', 'pricing', 'contact'] })
  const missingPrices = missing.plan.pages.find((p) => p.slug === 'pricing').body
  assert.match(missingPrices, /Prices have not been published/)
  assert.match(missingPrices, /Contact us for current prices/)
  assert.doesNotMatch(missingPrices, /\$|Starter|Professional|Enterprise/)

  const without = buildSeedPlan({ ...base(), wanted: ['home', 'product'] })
  assert.equal(
    without.plan.pages.some((p) => p.slug === 'pricing'),
    false
  )
  assert.doesNotMatch(without.plan.pages.find((p) => p.slug === 'product').body, /class="[^"]*tracy-plans\b/)
})

test('a customer landing never ships sample endorsements or contact addresses absent from its brief', () => {
  const r = buildSeedPlan({
    ...base(),
    wanted: ['home'],
    landingSlots: [],
    landingHtml:
      '<html><head></head><body><main><section><h1>Hello</h1><p>Our coffee</p></section><section><h2>Reviews</h2><blockquote>Great</blockquote><cite>Northwind</cite></section><section><h2>Customer stories</h2><div><p>“A sample endorsement”</p><div>Maya Chen</div></div></section><p><a href="mailto:old@example.test">old@example.test</a></p></main></body></html>'
  })
  const home = r.plan.pages.find((p) => p.slug === 'home').body
  assert.match(home, /Our coffee/)
  assert.doesNotMatch(home, /Northwind|blockquote|Maya Chen|sample endorsement|old@example.test|mailto:/)
})

test("SECTION_ORDER is the section library's landing order, read from its generated regions.json — the eleven bands, hero first", () => {
  assert.deepEqual(
    [...SECTION_ORDER],
    [
      'hero',
      'social-proof',
      'problem',
      'pillars',
      'how-it-works',
      'cta-inline',
      'features',
      'proof',
      'faq',
      'pricing',
      'cta-final'
    ]
  )
})
