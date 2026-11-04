#!/usr/bin/env node
// Adds what site-model.json drops but the design needs: the site chrome (top bar, footer columns: Joomla mod_custom
// HTML), the mastheads, section backgrounds, and the posts' intro text and front-page flags.
// The site chrome (top bar, footer columns) is Joomla mod_custom HTML. site-model.json does not carry
// it (from-joomla.mjs keeps those modules only in the WordPress spec-pack's sections.json), so this adds
// one `chrome` entry -- a labelled singleton the editor can change -- with every value read from the
// source module it came from. Nothing is invented: a module that is missing leaves its field empty.
//   node ingest/enrich-model.mjs <spec/sections.json> <seed/site-model.json> <j6/inventory.json>
// It also adds the `masthead` list: the title, description and background of the banner under the menu,
// which Joomla keeps in the params of module 99 (mod_jamasthead) per menu item, not in any article.
import { readFileSync, writeFileSync } from 'node:fs'

const [sectionsFile, modelFile, inventoryFile] = process.argv.slice(2)
if (!sectionsFile || !modelFile || !inventoryFile) {
  console.error('usage: enrich-model.mjs <sections.json> <site-model.json> <inventory.json>')
  process.exit(2)
}
const sections = JSON.parse(readFileSync(sectionsFile, 'utf8'))
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const mod = (id) => sections.custom.find((m) => String(m.id) === String(id))?.html ?? ''
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
const text = (html) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

// The demo logo is design, not content: it ships as public/brand/logo.png (+ small-logo.png) and is the default slot
// of <BrandLogo>; `logo_dark` stays empty until a customer gives one.
// 94 = top bar "Open Daily", 122 = footer Location, 123 = footer Hours, 124 = footer Contact
const topbar = text(mod(94))
const locationHtml = mod(122)
const address = text(locationHtml.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '')
const mapUrl = decode(locationHtml.match(/href="([^"]+)"/)?.[1] ?? '')
const mapLabel = text(locationHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '')
const rows = (html) =>
  [...html.matchAll(/<p>\s*<span class="highlight">([\s\S]*?)<\/span>([\s\S]*?)<\/p>/g)].map((m) => ({
    label: text(m[1]).replace(/:$/, ''),
    value: text(m[2])
  }))
const hours = rows(mod(123)).map((r) => ({ days: r.label, time: r.value }))
const contactHtml = mod(124)
const contact = rows(contactHtml).map((r) => ({ label: r.label, value: r.value }))
const email = contactHtml.match(/href="mailto:([^"]+)"/)?.[1] ?? ''

if (!model.types.some((t) => t.name === 'chrome')) {
  model.types.push({
    name: 'chrome',
    mode: 'single',
    label: { en: 'Site chrome' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'brand_name', type: 'text' },
      { name: 'topbar_text', type: 'text' },
      { name: 'logo_dark', type: 'image' },
      { name: 'footer_location_title', type: 'text' },
      { name: 'footer_address', type: 'text' },
      { name: 'footer_map_label', type: 'text' },
      { name: 'footer_map_url', type: 'url' },
      { name: 'footer_hours_title', type: 'text' },
      {
        name: 'footer_hours',
        type: 'group',
        fields: [
          { name: 'days', type: 'text' },
          { name: 'time', type: 'text' }
        ]
      },
      { name: 'footer_contact_title', type: 'text' },
      {
        name: 'footer_contact',
        type: 'group',
        fields: [
          { name: 'label', type: 'text' },
          { name: 'value', type: 'text' },
          { name: 'href', type: 'text' }
        ]
      },
      { name: 'copyright', type: 'text' },
      // the words the template itself prints; the source's own (Joomla language strings / its 404 document)
      { name: 'skip_label', type: 'text' },
      { name: 'menu_label', type: 'text' },
      { name: 'appearance_label', type: 'text' },
      { name: 'categories_title', type: 'text' },
      { name: 'prev_label', type: 'text' },
      { name: 'next_label', type: 'text' },
      { name: 'more_label', type: 'text' },
      { name: 'photos_label', type: 'text' },
      { name: 'gallery_link_label', type: 'text' },
      { name: 'not_found_code', type: 'text' },
      { name: 'not_found_title', type: 'text' },
      { name: 'not_found_text', type: 'text' },
      { name: 'not_found_back_label', type: 'text' }
    ]
  })
  model.records.push({
    type: 'chrome',
    slug: 'chrome',
    locale: model.locales.default,
    status: 'published',
    values: {
      title: 'Site chrome',
      // the site name of the source (`<title>`, logo alt, copyright line)
      brand_name: 'JA Restaurant',
      topbar_text: topbar,
      footer_location_title: 'Location',
      footer_address: address,
      footer_map_label: mapLabel,
      footer_map_url: mapUrl,
      footer_hours_title: 'Hours',
      footer_hours: hours,
      footer_contact_title: 'Contact',
      footer_contact: contact.map((c) => ({
        ...c,
        href: /^Email$/i.test(c.label) && email ? `mailto:${email}` : ''
      })),
      copyright: 'Copyright © {year} {name}. All Rights Reserved. Designed by JoomlArt.com.',
      skip_label: 'Skip to content',
      menu_label: 'Menu',
      appearance_label: 'Switch between light and dark appearance',
      categories_title: 'Categories',
      prev_label: 'Prev',
      next_label: 'Next',
      more_label: 'More Articles ...',
      photos_label: 'Photos',
      gallery_link_label: 'View more our gallery',
      not_found_code: '404',
      not_found_title: 'Page not found',
      not_found_text: 'Please try one of the following pages:',
      not_found_back_label: 'Home Page'
    }
  })
}
// masthead: module 99, per menu item
const m99 = inventory.modules.find((m) => String(m.id) === '99')
const cfg = JSON.parse(m99?.params ?? '{}').menuitem_config ?? {}
if (m99 && !model.types.some((t) => t.name === 'masthead')) {
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
  const first = (v) => (Array.isArray(v) ? v[0] : v)
  for (const [i, ids] of Object.entries(cfg.item_id ?? {})) {
    const menu = inventory.menu.find((x) => String(x.id) === String(first(ids)))
    if (!menu) continue
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
}
// section backgrounds: the ACM modules keep `module-background` / `module-style` in their params, which the model drops
const kebab = (t) =>
  t
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
let backgrounds = 0
for (const mod of inventory.modules.filter((m) => m.module === 'mod_ja_acm')) {
  const params = JSON.parse(mod.params ?? '{}')
  const slug = kebab(mod.title)
  const record = model.records.find(
    (r) => r.slug === slug && r.type !== 'masthead' && r.type !== 'pages' && r.type !== 'posts'
  )
  if (!record) continue
  const type = model.types.find((t) => t.name === record.type)
  for (const [name, kind] of [
    ['background', 'image'],
    ['section_style', 'text'],
    ['section_intro', 'text']
  ]) {
    if (!type.fields.some((f) => f.name === name)) type.fields.push({ name, type: kind })
  }
  record.values.background = (params['module-background'] ?? '').replace(/^\//, '')
  record.values.section_style = params['module-style'] ?? 'default'
  record.values.section_intro = params['module-intro'] ?? ''
  backgrounds++
}
// posts: the intro text (what the blog list prints) and the front page flags (what the home page lists, in order)
const plain = (h) =>
  decode(String(h ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
const posts = model.types.find((t) => t.name === 'posts')
for (const [name, kind] of [
  ['featured', 'boolean'],
  ['featured_order', 'number']
])
  if (!posts.fields.some((f) => f.name === name)) posts.fields.push({ name, type: kind })
const front = new Map(
  (inventory.content_frontpage ?? []).map((r) => [String(r.content_id), Number(r.ordering)])
)
let enriched = 0
for (const row of inventory.content) {
  const record = model.records.find((r) => r.type === 'posts' && r.slug === kebab(row.title))
  if (!record) continue
  if (!record.values.excerpt) record.values.excerpt = plain(row.introtext)
  record.values.featured = front.has(String(row.id))
  if (front.has(String(row.id))) record.values.featured_order = Number(row.ordering) * 1000 + Number(row.id)
  enriched++
}
// tags (the source shows them under an article and in blog lists; DECISIONS D19): a non-hierarchical taxonomy on posts.
// Only tags an article of the model actually carries become terms ("Joomla" belongs to a demo article that is not ported).
const tagRows = new Map(
  (inventory.tags ?? []).filter((t) => t.alias !== 'root').map((t) => [String(t.id), t])
)
const used = new Map()
for (const m of inventory.contentitem_tag_map ?? []) {
  const row = inventory.content.find((c) => String(c.id) === String(m.content_item_id))
  const tag = tagRows.get(String(m.tag_id))
  const record = row && tag && model.records.find((r) => r.type === 'posts' && r.slug === kebab(row.title))
  if (!record) continue
  used.set(tag.alias, tag.title)
  record.terms = { ...record.terms, tag: [...new Set([...(record.terms?.tag ?? []), tag.alias])] }
}
model.taxonomies = (model.taxonomies ?? []).filter((t) => t.name !== 'tag')
if (used.size)
  model.taxonomies.push({
    name: 'tag',
    label: { en: 'Tags' },
    labelSingular: { en: 'Tag' },
    hierarchical: false,
    appliesTo: ['posts'],
    terms: [...used].map(([slug, label]) => ({ slug, label: { en: label.trim() } }))
  })
// menus: the header menu is `primary` (the name Tracy's Pages question and personalize.mjs read); Joomla's `usermenu`
// (profile, Joomla administrator and settings links) has no place on a customer site and is not seeded
model.menus = (model.menus ?? [])
  .filter((m) => m.name !== 'usermenu')
  .map((m) => (m.name === 'mainmenu' ? { ...m, name: 'primary' } : m))
// the front page is `home`: the slug the release tool and Tracy's Pages question look for to mark the home page.
// The source's own alias `homepage` stays as a 301 to `/` (seed redirects).
for (const r of model.records) if (r.type === 'pages' && r.slug === 'homepage') r.slug = 'home'
console.log(`enrich-model: tags=${used.size}`)
console.log(`enrich-model: posts enriched=${enriched}`)
console.log(
  `enrich-model: masthead=${model.records.filter((r) => r.type === 'masthead').length} backgrounds=${backgrounds}`
)
writeFileSync(modelFile, JSON.stringify(model, null, 2) + '\n')
console.log(`enrich-model: topbar="${topbar}" hours=${hours.length} contact=${contact.length}`)
