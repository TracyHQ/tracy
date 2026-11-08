#!/usr/bin/env node
// Applies the porting decisions of DECISIONS.md D6 to site-model.json before compile-seed: keeps the pages the
// template ports, drops the Joomla demo/account pages and the menus they live in, and names the header menu `primary`.
//   node ingest/shape-model.mjs <seed/site-model.json> <j6/inventory.json>
import { readFileSync, writeFileSync } from 'node:fs'

const [file, inventoryFile] = process.argv.slice(2)
if (!file || !inventoryFile) {
  console.error('usage: shape-model.mjs <site-model.json> <inventory.json>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(file, 'utf8'))
const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const KEEP_PAGES = new Set(['front-page', 'about-us', 'offers', 'reservation', 'contact-us'])
const before = model.records.length
model.records = model.records.filter((r) => r.type !== 'pages' || KEEP_PAGES.has(r.slug))
const pagePaths = new Set(['/', '/about-us', '/offers', '/reservation', '/contact-us'])
model.routes = model.routes.filter((r) => r.kind !== 'page' || pagePaths.has(r.path))
model.menus = model.menus.filter((m) => m.name === 'mainmenu')
for (const m of model.menus) {
  m.name = 'primary'
  m.label = { en: 'Primary' }
  m.items = (m.items ?? []).map(({ children: _children, ...it }) => it) // the four Home - <colour> demo variants are not ported
}

// The site chrome: one labelled singleton (brand, footer columns, newsletter band words). The footer columns are the
// mod_custom modules 109/110/111 of the source, which the model keeps as `modules` entries; the newsletter words are those of
// module 127 (AcyMailing, not ported: the model has no record for it), read from the rendered source.
const strip = (h) =>
  String(h ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r]*\n[ \t\r\n]*/g, '\n')
    .trim()
const mod = (slug) => model.records.find((r) => r.type === 'modules' && r.slug === slug)?.values ?? {}
const loc = mod('location'),
  hrs = mod('hours'),
  con = mod('contact')
const first = (re, h) => String(h ?? '').match(re)?.[1] ?? ''
const text = { type: 'text' }
model.types.push({
  name: 'chrome',
  mode: 'single',
  label: { en: 'Site chrome' },
  fields: [
    'title',
    'brand_name',
    'footer_location_title',
    'footer_address',
    'footer_map_label',
    'footer_hours_title',
    'footer_hours',
    'footer_contact_title',
    'footer_phone',
    'footer_email',
    'subscribe_label',
    'subscribe_title',
    'subscribe_placeholder',
    'subscribe_button',
    'subscribe_note',
    'news_label',
    'news_title',
    'copyright',
    'skip_label',
    'menu_label',
    'appearance_label',
    'categories_title',
    'prev_label',
    'next_label',
    'more_label',
    'read_more',
    'breadcrumb_home',
    'latest_title',
    'not_found_code',
    'not_found_title',
    'not_found_text',
    'not_found_back_label'
  ]
    .map((name) => ({ name, ...text }))
    .concat([
      { name: 'footer_map_url', type: 'url' },
      { name: 'logo_dark', type: 'image' }
    ])
})
model.records.push({
  type: 'chrome',
  slug: 'chrome',
  locale: 'en',
  status: 'published',
  values: {
    title: 'Site chrome',
    brand_name: 'JA Diner',
    footer_location_title: strip(loc.title).replace(/\.$/, ''),
    footer_address: strip(first(/<span>([\s\S]*?)<\/span>/, loc.content)),
    footer_map_label: strip(first(/<a[^>]*>([\s\S]*?)<\/a>/, loc.content)),
    footer_map_url: first(/href="([^"]+)"/, loc.content).replace(/^\/index\.php/, ''),
    footer_hours_title: strip(hrs.title).replace(/\.$/, ''),
    footer_hours: strip(first(/<span>([\s\S]*?)<\/span>/, hrs.content)),
    footer_contact_title: strip(con.title).replace(/\.$/, ''),
    footer_phone: strip(first(/<span>([\s\S]*?)<\/span>/, con.content)),
    footer_email: first(/mailto:([^"]+)"/, con.content),
    subscribe_label: 'Subscribe',
    subscribe_title: 'Join our Newsletter list to get all the latest offers, discounts and other.',
    subscribe_placeholder: 'Email',
    subscribe_button: 'Subscribe',
    subscribe_note: "We don't do spam. Because we are Wizard :).",
    // module 103 (mod_articles_latest): its heading and sub-heading are module parameters the model does not carry
    news_label: 'News & Events.',
    news_title: 'Three Broomsticks <mark>is your best</mark> café & restaurant in the Hogsmeade.',
    // the words the template prints itself: the source's (Joomla language strings, T3 offcanvas label, its footer line)
    copyright: 'Copyright © {year} {name}. All Rights Reserved. Designed by JoomlArt.com.',
    skip_label: 'Skip to content',
    menu_label: 'Menu',
    appearance_label: 'Switch between light and dark appearance',
    categories_title: 'Categories',
    prev_label: 'Prev',
    next_label: 'Next',
    more_label: 'More Articles …',
    read_more: 'Read More',
    breadcrumb_home: 'Home',
    latest_title: 'Latest News + Updates.',
    not_found_code: '404',
    not_found_title: 'Page not found',
    not_found_text: 'Please try one of the following pages:',
    not_found_back_label: 'Home Page'
  }
})
// What is left of `modules` is the sidebar banner. Joomla's placement bookkeeping (`placement` is a JSON list in a string field,
// which EmDash's first-run seed turns into an array and the admin API then refuses to write back) is not content: it goes.
{
  const type = model.types.find((t) => t.name === 'modules')
  const keep = new Set(['title', 'content'])
  type.fields = type.fields.filter((f) => keep.has(f.name))
  for (const r of model.records.filter((x) => x.type === 'modules'))
    r.values = Object.fromEntries(Object.entries(r.values).filter(([k]) => keep.has(k)))
}
model.records = model.records.filter(
  (r) => !(r.type === 'modules' && ['location', 'hours', 'contact'].includes(r.slug))
)

// The source marks the phrase it highlights with a span (`hightlight` is the template's own spelling); it becomes <mark>.
const mark = (v) =>
  typeof v === 'string'
    ? v.replace(/<span class=['"](?:hightlight|text-highlight)['"]>([\s\S]*?)<\/span>/g, '<mark>$1</mark>')
    : Array.isArray(v)
      ? v.map(mark)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mark(x)]))
        : v
for (const r of model.records) if (r.type === 'features_intro') r.values = mark(r.values)

// The big heading of a section is the module's own `sub-heading` parameter, which from-joomla.mjs does not carry
// (perf/skill-findings.md SF-D1). It is read back from the module row and put on the section's entry.
const SUB_HEADING = {
  95: 'meet-three-broomsticks',
  96: 'gallery',
  97: 'discover-our-menu',
  104: 'meet-our-chef'
}
for (const t of model.types)
  if (['features_intro', 'container_tabs'].includes(t.name))
    t.fields.push({ name: 'sub_heading', type: 'text' })
for (const [id, slug] of Object.entries(SUB_HEADING)) {
  const row = inventory.modules.find((m) => String(m.id) === id)
  const sub = JSON.parse(row?.params ?? '{}')['sub-heading']
  const rec = model.records.find(
    (r) => ['features_intro', 'container_tabs'].includes(r.type) && r.slug === slug
  )
  if (rec && sub)
    rec.values.sub_heading = mark(
      String(sub)
        .replace(/\r?\n/g, ' ')
        .replace(/<br\s*\/?>\s*/g, '<br/>')
    )
}

// The article's full-text picture (`images.image_fulltext`, the one the article page prints above its text) is not in the
// model, which keeps only the intro picture as `cover` (SF-D8).
model.types
  .find((t) => t.name === 'posts')
  .fields.push({ name: 'detail_image', type: 'image' }, { name: 'created', type: 'date' })
for (const r of model.records.filter((x) => x.type === 'posts')) {
  const row = inventory.content.find((c) => c.title === r.values.title)
  const full = row ? JSON.parse(row.images || '{}').image_fulltext : ''
  if (full) r.values.detail_image = full
  // the lists print the creation date (06.09.2021), the article page the publishing date (10 September 2021): the model keeps one
  if (row?.created) r.values.created = row.created
}

// The banner under the menu: module 106 (mod_jamasthead) keeps one title / description / background per menu item in its
// params; the model carries none of it (SF-D9). One `masthead` entry per kept menu item.
{
  const cfg =
    JSON.parse(inventory.modules.find((m) => String(m.id) === '106')?.params ?? '{}').menuitem_config ?? {}
  model.types.push({
    name: 'masthead',
    mode: 'list',
    label: { en: 'Mastheads' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'description', type: 'text' },
      { name: 'background', type: 'image' }
    ]
  })
  const KEEP = new Set(['our-blog', 'offers', 'about-us', 'reservation', 'contact-us'])
  for (const [i, ids] of Object.entries(cfg.item_id ?? {})) {
    const menu = inventory.menu.find((x) => String(x.id) === String([].concat(ids)[0]))
    if (!menu || !KEEP.has(menu.alias)) continue
    model.records.push({
      type: 'masthead',
      slug: menu.alias,
      locale: model.locales.default,
      status: 'published',
      values: {
        title: cfg.title?.[i] ?? '',
        description: cfg.description?.[i] ?? '',
        background: (cfg.background?.[i] ?? '').replace(/^\//, '')
      }
    })
  }
  // the smart-search page has no menu item of its own: the template's default banner (bg-martsearch.jpg) stands behind it
  model.records.push({
    type: 'masthead',
    slug: 'search',
    locale: model.locales.default,
    status: 'published',
    values: {
      title: 'Search',
      description: cfg.description?.[Object.keys(cfg.description ?? {})[0]] ?? '',
      background: 'images/joomlart/other/bg-martsearch.jpg'
    }
  })
}

// A scalar field that arrives as a list (slideshow `title_link` is ["", ""]: one empty value per slide) holds the first
// non-empty value, or nothing (SF-D7).
for (const r of model.records) {
  const type = model.types.find((t) => t.name === r.type)
  for (const f of type.fields)
    if (f.type !== 'group' && Array.isArray(r.values[f.name]))
      r.values[f.name] = r.values[f.name].find((v) => v) ?? ''
}

console.log(
  `shape-model: ${before - model.records.length} record(s) dropped, menus: ${model.menus.map((m) => m.name)}`
)
writeFileSync(file, JSON.stringify(model, null, 2) + '\n')
