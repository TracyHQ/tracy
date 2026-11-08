#!/usr/bin/env node
// P4.6/P5 additions to site-model.json that the model of the source drops. Runs after shape-model.mjs.
//   node ingest/enrich-diner.mjs <seed/site-model.json> <j6/inventory.json>
//  · pages: the front page record is named `home` (Tracy's Pages question finds the home page by that slug), and the blog
//    gets a page record of its own, `our-blog`, so a customer can hide it from the header.
//  · ADDED, each read from the source and nothing invented: `category_info` (title, description and picture of each blog
//    category), `contact` (the Joomla contact record, its social links and the words of its form), `reservation` (the
//    "Reservation" article, which is a layout: two picture rows and a call card), and `form_id` on `chrome` for the
//    newsletter band. Safe to run again.
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeWith, stripTags } from './text.mjs'

const [modelFile, inventoryFile] = process.argv.slice(2)
if (!modelFile || !inventoryFile) {
  console.error('usage: enrich-diner.mjs <site-model.json> <inventory.json>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const inv = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const locale = model.locales.default
const decode = decodeWith({ '&amp;': '&', '&nbsp;': ' ', '&#039;': "'", '&#39;': "'", '&quot;': '"' })
const text = (html) =>
  decode(stripTags(String(html ?? '').replace(/<br\s*\/?>/gi, '\n'), ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
const addType = (t) => {
  model.types = model.types.filter((x) => x.name !== t.name)
  model.types.push(t)
  model.records = model.records.filter((r) => r.type !== t.name)
}
const rec = (type, slug, values) => model.records.push({ type, slug, locale, status: 'published', values })

// ── pages: `home`, and the blog's own record ───────────────────────────────────────────────────────────────────
for (const r of model.records) if (r.type === 'pages' && r.slug === 'front-page') r.slug = 'home'
if (!model.records.some((r) => r.type === 'pages' && r.slug === 'our-blog'))
  model.records.push({
    type: 'pages',
    slug: 'our-blog',
    locale,
    status: 'published',
    values: { title: 'Our Blog', body: '', view: 'page-blog' }
  })

// the Joomla Smart Search and Tagged Items utility pages are not ported (DECISIONS D6)
model.routes = model.routes.filter(
  (r) => !/^\/(other-pages\/smart-search|joomla-content\/tagged-items)$/.test(r.path)
)

// ── category_info ─────────────────────────────────────────────────────────────────────────────────────────────
addType({
  name: 'category_info',
  mode: 'list',
  label: { en: 'Category pages' },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'description', type: 'text' },
    { name: 'image', type: 'image' }
  ]
})
for (const c of inv.categories.filter((x) =>
  ['restaurant-business', 'restaurant-marketing', 'restaurant-news', 'restaurant-guide'].includes(x.alias)
))
  rec('category_info', c.alias, {
    title: c.title,
    description: text(c.description),
    image: (JSON.parse(c.params || '{}').image ?? '').replace(/^\//, '')
  })

// ── contact ───────────────────────────────────────────────────────────────────────────────────────────────────
{
  const c = inv.contact_details[0]
  const p = JSON.parse(c.params || '{}')
  addType({
    name: 'contact',
    mode: 'single',
    label: { en: 'Contact page' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'image', type: 'image' },
      { name: 'card_title', type: 'text' },
      { name: 'card_text', type: 'prose' },
      { name: 'social_title', type: 'text' },
      {
        name: 'social_links',
        type: 'group',
        fields: [
          { name: 'label', type: 'text' },
          { name: 'url', type: 'url' }
        ]
      },
      { name: 'address', type: 'text' },
      { name: 'phone_label', type: 'text' },
      { name: 'phone', type: 'text' },
      { name: 'web_label', type: 'text' },
      { name: 'webpage', type: 'url' },
      { name: 'form_title', type: 'text' },
      { name: 'form_note', type: 'text' },
      { name: 'form_id', type: 'text' }
    ]
  })
  rec('contact', 'contact', {
    title: 'Contact',
    image: c.image,
    card_title: c.name,
    card_text: c.misc,
    social_title: 'Social Links',
    social_links: ['a', 'b', 'c', 'd', 'e']
      .filter((k) => p[`link${k}`])
      .map((k) => ({ label: p[`link${k}_name`], url: p[`link${k}`] })),
    address: c.address,
    phone_label: 'Phone',
    phone: c.telephone,
    web_label: 'Website',
    webpage: c.webpage,
    // Joomla's contact view words (language strings of the source)
    form_title: 'Contact Form',
    form_note: 'Send an Email. All fields with an asterisk (*) are required.',
    form_id: ''
  })
}

// ── reservation: the article is a layout (two picture rows and a call card) ──────────────────────────────────────
{
  const art = inv.content.find((r) => r.alias === 'reservation')
  const html = (art.introtext ?? '') + (art.fulltext ?? '')
  addType({
    name: 'reservation',
    mode: 'single',
    label: { en: 'Reservation page' },
    fields: [
      { name: 'title', type: 'text' },
      {
        name: 'blocks',
        type: 'group',
        fields: [
          { name: 'image', type: 'image' },
          { name: 'label', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'text', type: 'text' },
          { name: 'button_label', type: 'text' },
          { name: 'button_link', type: 'text' }
        ]
      },
      { name: 'online_image', type: 'image' },
      { name: 'online_title', type: 'text' },
      { name: 'online_text', type: 'text' },
      { name: 'online_phone', type: 'text' },
      { name: 'online_button', type: 'text' }
    ]
  })
  const mark = (h) =>
    h
      .replace(/<span class="hightlight">([\s\S]*?)<\/span>/g, '<mark>$1</mark>')
      .replace(/<(?!\/?mark)[^>]+>/g, '')
  const [top, s3 = ''] = html.split(/<div class="section-3/)
  const row = (chunk) => ({
    image: chunk.match(/<img src="([^"]+)"/)?.[1] ?? '',
    label: text(chunk.match(/<div class="title-small"><h5>([\s\S]*?)<\/h5>/)?.[1]),
    title: decode(mark(chunk.match(/<div class="title-large"><h2>([\s\S]*?)<\/h2>/)?.[1] ?? ''))
      .replace(/\s+/g, ' ')
      .trim(),
    text: text(chunk.match(/<div class="description">\s*<p>([\s\S]*?)<\/p>/)?.[1]),
    button_label: text(chunk.match(/<a class="btn[^"]*" href="[^"]*">([\s\S]*?)<\/a>/)?.[1]),
    button_link: (chunk.match(/<a class="btn[^"]*" href="([^"]*)"/)?.[1] ?? '').replace(/^\/index\.php/, '')
  })
  const rows12 = top.split(/<div class="section-2/).map(row)
  rec('reservation', 'reservation-layout', {
    title: 'Reservation',
    blocks: rows12,
    online_image:
      html.match(/section-3 content-group-3" style="background-image: url\('([^']+)'\)/)?.[1] ?? '',
    online_title: text(s3.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]),
    online_text: text(s3.match(/<div class="description">\s*<p>([\s\S]*?)<\/p>/)?.[1]),
    online_phone: text(s3.match(/<div class="num-phone">\s*<h3>([\s\S]*?)<\/h3>/)?.[1]),
    online_button: text(s3.match(/<a [^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1])
  })
}

// ── chrome: the form the newsletter band posts to (bound by tools/seed-apply.mjs forms) ───────────────────────────
{
  const chrome = model.types.find((t) => t.name === 'chrome')
  const r = model.records.find((x) => x.type === 'chrome')
  // The search page's words: Joomla's smart search form says "Search Terms:" and "Search"; the rest are the template's own.
  const WORDS = {
    form_id: '',
    search_title: 'Search',
    search_label: 'Search Terms:',
    search_placeholder: 'Search…',
    search_button: 'Search',
    search_results: 'Search results',
    search_empty: 'No results found.',
    page_label: 'Page',
    start_label: 'Start',
    end_label: 'End'
  }
  for (const [name, value] of Object.entries(WORDS)) {
    if (chrome && !chrome.fields.some((f) => f.name === name)) chrome.fields.push({ name, type: 'text' })
    if (r) r.values[name] ??= value
  }
}

// Search: the words of a post are what the search index holds; without a `searchable` field the CMS refuses to build it.
for (const f of model.types.find((t) => t.name === 'posts')?.fields ?? [])
  if (['title', 'excerpt', 'body'].includes(f.name)) f.searchable = true

writeFileSync(modelFile, `${JSON.stringify(model, null, 2)}\n`)
console.log(
  `enrich-diner: records=${model.records.length} types=${model.types.length} categories=${model.records.filter((r) => r.type === 'category_info').length}`
)
