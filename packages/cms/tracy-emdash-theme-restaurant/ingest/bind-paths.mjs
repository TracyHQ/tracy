#!/usr/bin/env node
// Gives every page and post the public path it is served at, and every page the section entries its view prints, so
// Tracy's Content API map can resolve each picture binding (`urlField: path` on pages and posts; a section entry
// reaches a page through that page's `sections` list). The router still decides the paths (src/lib/page-routes.json);
// these fields repeat what it serves. Runs after enrich-pages.mjs, before compile-seed.mjs; safe to run again.
//   node ingest/bind-paths.mjs <seed/site-model.json>
import { readFileSync, writeFileSync } from 'node:fs'

const modelFile = process.argv[2]
if (!modelFile) {
  console.error('usage: bind-paths.mjs <site-model.json>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const locale = model.locales.default

// The entries each view prints, by page slug (src/views/*.astro; the sitewide chrome and the Subscribe box are on every
// page and are not listed). A list page has no `pages` entry of its own in the source; it gets one here with view `list`.
const E = (collection, ...entries) => entries.map((entry) => ({ collection, entry }))
const SIDEBAR = E(
  'category_info',
  'restaurant-business',
  'restaurant-guide',
  'restaurant-marketing',
  'restaurant-news'
)
const SECTIONS = {
  home: [
    ...E('slideshow', 'slideshow'),
    ...E('hero', 'welcome-to-res-bar-restaurant'),
    ...E('features_intro', 'special-offers', 'features-intro'),
    ...E('tabs', 'discover-our-menu'),
    ...E('testimonials', 'happy-customers'),
    ...E('menu', 'snacks-x-salads', 'entrees', 'dessert'),
    ...SIDEBAR
  ],
  'about-us': [
    ...E('masthead', 'about-us'),
    ...E('features_intro', 'about-us'),
    ...E('statistics', 'you-re-in-good-restaurant'),
    ...E('teams', 'our-team')
  ],
  menu: [
    ...E('masthead', 'menu'),
    ...E('tabs', 'our-menu'),
    ...E('menu', 'dessert-117', 'sea-food', 'icream-and-juice')
  ],
  'featured-articles': [...E('masthead', 'featured-articles'), ...E('banner', 'banner'), ...SIDEBAR],
  'all-categories': [...E('masthead', 'all-categories'), ...SIDEBAR],
  'our-history': [...E('masthead', 'our-history'), ...E('timeline', 'our-history')],
  'phone-reservation': [...E('masthead', 'phone-reservation'), ...E('reservation', 'reservation')],
  'contact-us': E('contact', 'contact'),
  'simple-menu': [...E('masthead', 'default'), ...E('menu', 'simple-menu')],
  'menu-with-image': [...E('masthead', 'default'), ...E('menu', 'menu-with-image')],
  '2-column-menu': [...E('masthead', 'default'), ...E('menu', '2-column-menu')],
  offers: [
    ...E('masthead', 'offers'),
    ...E('happyhours', 'happy-hours-style-1', 'happy-hours-style-2', 'happy-hours-style-3')
  ],
  blog: [...E('masthead', 'blog'), ...E('banner', 'banner'), ...SIDEBAR],
  'tagged-items': E('masthead', 'tagged-items'),
  'smart-search': [...E('masthead', 'smart-search'), ...E('testimonials', 'happy-customers'), ...SIDEBAR],
  gallery: E('slideshow', 'gallery')
}
const LISTS = {
  blog: 'Blog',
  gallery: 'Gallery',
  'smart-search': 'Smart Search',
  'tagged-items': 'Tagged Items'
}

const type = (name) => model.types.find((t) => t.name === name)
const addField = (t, field) => {
  t.fields = t.fields.filter((f) => f.name !== field.name)
  t.fields.push(field)
}
addField(type('pages'), { name: 'path', type: 'text' })
addField(type('pages'), {
  name: 'sections',
  type: 'group',
  fields: [
    { name: 'collection', type: 'text' },
    { name: 'entry', type: 'text' }
  ]
})
addField(type('posts'), { name: 'path', type: 'text' })

const slugOf = (p) => (p === '/' ? 'home' : p.split('/').filter(Boolean).pop())
const pathOf = new Map(model.routes.filter((r) => r.kind === 'page').map((r) => [slugOf(r.path), r.path]))
for (const r of model.routes.filter((r) => r.kind === 'list')) pathOf.set(slugOf(r.path), r.path)
const postPath = new Map(model.routes.filter((r) => r.kind === 'detail').map((r) => [r.slug, r.path]))

// list pages: keep one record each, after the routed pages
model.records = model.records.filter((r) => !(r.type === 'pages' && r.values.view === 'list'))
for (const [slug, title] of Object.entries(LISTS)) {
  if (!pathOf.has(slug)) throw new Error(`no list route for ${slug}`)
  model.records.push({
    type: 'pages',
    slug,
    locale,
    status: 'published',
    values: { title, body: '', view: 'list' }
  })
}
const pageIndex = []
model.records.forEach((r, i) => r.type === 'pages' && pageIndex.push(i))
// routed pages first, lists last, so the admin order is unchanged for the existing ones
const pages = pageIndex.map((i) => model.records[i])
const rest = model.records.filter((r) => r.type !== 'pages')
const ordered = [
  ...pages.filter((r) => r.values.view !== 'list'),
  ...pages.filter((r) => r.values.view === 'list')
]
model.records = [...ordered, ...rest]

for (const r of model.records) {
  if (r.type === 'pages') {
    const path = pathOf.get(r.slug)
    if (!path) throw new Error(`pages/${r.slug} has no route`)
    r.values.path = path
    const sections = SECTIONS[r.slug]
    if (!sections) throw new Error(`pages/${r.slug} has no section list`)
    r.values.sections = sections
  } else if (r.type === 'posts') {
    const path = postPath.get(r.slug)
    if (!path) throw new Error(`posts/${r.slug} has no detail route`)
    r.values.path = path
  }
}
writeFileSync(modelFile, JSON.stringify(model, null, 2) + '\n')
console.log(`bind-paths: ${ordered.length} pages, ${[...postPath].length} posts`)
