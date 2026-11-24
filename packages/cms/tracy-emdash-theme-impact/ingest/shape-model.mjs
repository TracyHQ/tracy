#!/usr/bin/env node
// Applies the porting decisions of DECISIONS.md (D5-D9) to site-model.json before compile-seed: keeps the pages and the section
// entries the template ports, gives every kept section a stable name and its Joomla module parameters (heading, spacing, colour),
// splits the one `posts` list the model has into blog posts, donations and events (the article's own custom fields come back
// from the dump), adds what the model drops (site chrome, mastheads, authors, tags) and names the header menu `primary`.
//   node ingest/shape-model.mjs <seed/site-model.json> <j6/inventory.json> <spec/sections.json> <spec/page-map.json> <spec/content.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeWith, stripTags } from './text.mjs'

const decode = decodeWith({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' '
})

const [file, inventoryFile, sectionsFile, pageMapFile, contentFile] = process.argv.slice(2)
if (!file || !inventoryFile || !sectionsFile || !pageMapFile || !contentFile) {
  console.error('usage: shape-model.mjs <site-model.json> <inventory.json> <sections.json> <page-map.json> <content.json>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(file, 'utf8'))
const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const sections = JSON.parse(readFileSync(sectionsFile, 'utf8'))
const content = JSON.parse(readFileSync(contentFile, 'utf8'))
const text = { type: 'text' }

// ---- sections: the model names a collection's entries by title; the module id is the only link back to the page that places
// it. Entries of one type are in module-id order in both files, so they pair by position.
const NAME = {
  110: 'home-hero',
  111: 'about-activities',
  112: 'topbar-contact',
  116: 'about-mission',
  125: 'meet-us',
  129: 'home-donor-base',
  132: 'about-give',
  133: 'what-we-do',
  146: 'home-connected',
  147: 'home-follow',
  155: 'footer-contact',
  157: 'home-helpline',
  160: 'faq',
  161: 'home-raise-fund',
  163: 'footer-follow'
}
const byType = {}
for (const m of sections.acm) (byType[m.type.replace(/-/g, '_')] ??= []).push(m)
const dropped = new Set()
const sectionStyle = {}
for (const [type, mods] of Object.entries(byType)) {
  const recs = model.records.filter((r) => r.type === type)
  if (recs.length !== mods.length) throw new Error(`${type}: ${recs.length} entries, ${mods.length} modules`)
  recs.forEach((rec, i) => {
    const id = String(mods[i].id)
    if (!NAME[id]) return dropped.add(rec)
    rec.slug = NAME[id]
    sectionStyle[NAME[id]] = { type, style: mods[i].style, module: id, spacing: mods[i].spacing }
  })
}
model.records = model.records.filter((r) => !dropped.has(r))

// A heading the source breaks by hand (`</br>`, `((/br))`) holds a line break in the field: a newline, never markup.
const breaks = (t) => t.replace(/[ \t]*(?:<\/?br\s*\/?>|\(\(\/?br\)\))[ \t]*/gi, '\n').replace(/[ \t]{2,}/g, ' ')
const mark = (v) =>
  typeof v === 'string'
    ? breaks(v).replace(/<span class=['"](?:hightlight|text-highlight)['"]>([\s\S]*?)<\/span>/g, '<mark>$1</mark>')
    : Array.isArray(v)
      ? v.map(mark)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mark(x)]))
        : v
for (const r of model.records) if (r.type !== 'pages' && r.type !== 'posts') r.values = mark(r.values)

// The model keeps a picture as a bare basename; the module's own parameters carry the whole path.
const fullPath = (v) => String(v).split('#')[0]
const isImg = (v) => typeof v === 'string' && /^images\/.+\.(jpe?g|png|gif|svg|webp)(#|$)/i.test(v)
for (const [slug, info] of Object.entries(sectionStyle)) {
  const rec = model.records.find((r) => r.type === info.type && r.slug === slug)
  const mod = sections.acm.find((m) => String(m.id) === info.module)
  const norm = (k) => k.replace(/-/g, '_')
  for (const [k, v] of Object.entries(mod.fields ?? {}))
    if (isImg(v) && norm(k) in rec.values) rec.values[norm(k)] = fullPath(v)
  ;(mod.items ?? []).forEach((it, i) => {
    for (const [k, v] of Object.entries(it))
      if (isImg(v) && rec.values.items?.[i] && norm(k) in rec.values.items[i])
        rec.values.items[i][norm(k)] = fullPath(v)
  })
}
// the section's own heading block: the module title when shown, `sub-title` (the eyebrow), colour, background, spacing
const secText = (h) =>
  decode(stripTags(String(h ?? '').replace(/\r?\n/g, ' ').replace(/<br\s*\/?>/gi, ' ')))
    .replace(/[ \t]+/g, ' ')
    .trim()
for (const [slug, info] of Object.entries(sectionStyle)) {
  if (info.type === 'hero') continue
  const mod = inventory.modules.find((m) => String(m.id) === info.module)
  const p = JSON.parse(mod.params)
  const type = model.types.find((t) => t.name === info.type)
  for (const name of slug === 'home-raise-fund' ? ['section_label', 'section_title', 'section_class', 'charity_label', 'donation_label'] : ['section_label', 'section_title', 'section_class'])
    if (!type.fields.some((f) => f.name === name)) type.fields.push({ name, ...text })
  const rec = model.records.find((r) => r.type === info.type && r.slug === slug)
  Object.assign(rec.values, {
    section_label: secText(p['sub-title']),
    section_title: String(mod.showtitle) === '1' ? secText(mod.title) : '',
    section_class: String(p.moduleclass_sfx ?? '')
  })
  if (slug === 'home-raise-fund') Object.assign(rec.values, { charity_label: 'Charity', donation_label: 'Donation' })
  sectionStyle[slug].bg = p['bg-color'] ?? ''
  sectionStyle[slug].spacing = {
    top: p['top-space'] ?? '',
    bottom: p['bottom-space'] ?? '',
    title: p['title-space'] ?? ''
  }
  sectionStyle[slug].titleColor = p['title-color'] ?? ''
  sectionStyle[slug].subColor = p['sub-title-color'] ?? ''
  sectionStyle[slug].align = p['sub-align'] ?? ''
}
writeFileSync(
  new URL('../src/lib/page-layout.json', import.meta.url),
  JSON.stringify(sectionStyle, null, 2) + '\n'
)

// ---- pages: Home, About, Contact, Help & FAQs; the three lists get a page record of their own, so a customer can hide them
const KEEP_PAGES = new Set(['home', 'about', 'contact', 'help-faqs'])
model.records = model.records.filter((r) => r.type !== 'pages' || KEEP_PAGES.has(r.slug))
for (const [slug, title, view] of [
  ['donations', 'Our causes', 'donations'],
  ['events', 'Our Events', 'events'],
  ['blog', 'Blog', 'blog']
])
  model.records.push({ type: 'pages', slug, locale: 'en', status: 'published', values: { title, body: '', view } })
const KEEP_PATHS = new Set(['/', '/about', '/contact', '/help-faqs'])
model.routes = [
  ...model.routes.filter((r) => r.kind === 'page' && KEEP_PATHS.has(r.path)),
  { path: '/donations', kind: 'list', type: 'donations' },
  { path: '/events', kind: 'list', type: 'events' },
  { path: '/blog', kind: 'list', type: 'posts' }
]

// ---- menus: the header menu without the `Pages` demo drop-down (D7); the footer columns are chrome text
model.menus = model.menus.filter((m) => m.name === 'mainmenu')
for (const m of model.menus) {
  m.name = 'primary'
  m.label = { en: 'Primary' }
  m.items = (m.items ?? [])
    .filter((it) => it.path)
    .map(({ children: _c, ...it }) => (it.path === '/category-blog' ? { ...it, path: '/blog' } : it))
}

// ---- articles: blog posts (category `animals`), donations and events; the rest of the model's posts are Joomla demo pages
const usersById = Object.fromEntries(inventory.users.map((u) => [u.id, u]))
const avatar = (uid) => {
  const row = inventory.user_profiles.find((p) => p.user_id === uid && p.profile_key === 'profile.user_avatar')
  return row ? String(JSON.parse(row.profile_value)).split('#')[0] : ''
}
const tagsOf = (cid) =>
  inventory.contentitem_tag_map
    .filter((m) => m.type_alias === 'com_content.article' && m.content_item_id === cid)
    .map((m) => inventory.tags.find((t) => t.id === m.tag_id)?.title)
    .filter(Boolean)
    .join('\n')
const img = (row, key) => String(JSON.parse(row.images || '{}')[key] ?? '').split('#')[0]
const featured = new Set(inventory.content_frontpage.map((f) => String(f.content_id)))
const fieldsOf = (id) => content.posts.find((p) => String(p.joomla?.articleId) === String(id))?.joomla?.fields ?? {}

const common = [
  ['title', 'text'],
  ['excerpt', 'prose'],
  ['body', 'prose'],
  ['date', 'date'],
  ['cover', 'image'],
  ['banner', 'image'],
  ['author', 'text'],
  ['author_avatar', 'image'],
  ['tags', 'text']
]
const defineType = (name, label, extra) =>
  model.types.push({
    name,
    mode: 'list',
    label: { en: label },
    fields: [...common, ...extra].map(([n, t]) => ({
      name: n,
      type: t,
      ...(['title', 'excerpt', 'body'].includes(n) ? { searchable: true } : {})
    }))
  })
model.types = model.types.filter((t) => t.name !== 'posts')
defineType('posts', 'Posts', [['created', 'date']])
defineType('donations', 'Donations', [
  ['location', 'text'],
  ['raise', 'text'],
  ['goal', 'text'],
  ['featured', 'text'],
  ['ordering', 'number']
])
defineType('events', 'Events', [
  ['start_date', 'text'],
  ['event_time', 'text'],
  ['event_location', 'text'],
  ['event_fee', 'text'],
  ['card_bg', 'text'],
  ['date_bg', 'text'],
  ['button_type', 'text'],
  ['button_link', 'text'],
  ['featured', 'text'],
  ['ordering', 'number']
])
model.records = model.records.filter((r) => r.type !== 'posts')
// Straight from the dump: the model drops an article whose title another one already has (the Blog holds "Charity of the month
// plan international UK" twice, 17 July and 2 August, and the Home prints the second), so every published article of the three
// categories is built from its own row. The Joomla alias is the slug.
const TYPE_OF_CAT = { 8: 'posts', 13: 'donations', 10: 'events' }
const rows = inventory.content
  .filter((c) => String(c.state) === '1' && TYPE_OF_CAT[c.catid])
  .sort((a, b) => Number(a.catid) - Number(b.catid) || Number(a.ordering) - Number(b.ordering) || Number(a.id) - Number(b.id))
for (const row of rows) {
  const type = TYPE_OF_CAT[row.catid]
  const f = fieldsOf(row.id)
  const u = usersById[row.created_by]
  const values = {
    title: decode(row.title),
    excerpt: secText(row.introtext),
    body: `${row.introtext}\n${row.fulltext}`,
    date: row.publish_up || row.created,
    cover: img(row, 'image_intro'),
    banner: img(row, 'image_fulltext'),
    author: u?.name ?? '',
    author_avatar: avatar(row.created_by),
    tags: tagsOf(row.id)
  }
  if (type === 'posts') values.created = row.created
  if (type === 'donations')
    Object.assign(values, {
      location: f.location ?? '',
      raise: f.raise ?? '',
      goal: f.goal ?? '',
      ordering: Number(row.ordering),
      featured: featured.has(String(row.id)) ? '1' : ''
    })
  if (type === 'events')
    Object.assign(values, {
      start_date: f['start-date'] ?? '',
      event_time: f['event-time'] ?? '',
      event_location: f['event-location'] ?? '',
      event_fee: f['event-fee'] ?? '',
      card_bg: f['bg-content'] ?? '',
      date_bg: f['bg-startdate'] ?? '',
      button_type: f['btn-type'] ?? '',
      button_link: f['btn-redirect-link'] ?? '',
      ordering: Number(row.ordering),
      featured: featured.has(String(row.id)) ? '1' : ''
    })
  model.records.push({
    type,
    slug: row.alias,
    locale: 'en',
    status: 'published',
    terms: type === 'posts' ? { category: ['blog'] } : {},
    values
  })
}
for (const t of ['posts', 'donations', 'events'])
  for (const r of model.records.filter((x) => x.type === t))
    model.routes.push({ path: `/${t === 'posts' ? 'blog' : t}/${r.slug}`, kind: 'detail', type: t, slug: r.slug })
for (const tax of model.taxonomies ?? []) {
  tax.terms = [{ slug: 'blog', label: { en: 'Blog' } }]
  tax.appliesTo = ['posts']
}

// ---- mastheads: module 145 keeps one title per menu item in its params; every menu item shares the same background
{
  const cfg = JSON.parse(inventory.modules.find((m) => String(m.id) === '145').params).menuitem_config
  model.types.push({
    name: 'masthead',
    mode: 'list',
    label: { en: 'Mastheads' },
    fields: [
      { name: 'title', ...text },
      { name: 'description', ...text },
      { name: 'background', type: 'image' }
    ]
  })
  const SLUG = { 102: 'about', 103: 'donations', 104: 'events', 119: 'contact', 120: 'faq', 116: 'blog', 136: 'post' }
  for (const [i, ids] of Object.entries(cfg.item_id)) {
    const slug = SLUG[[].concat(ids)[0]]
    if (!slug) continue
    model.records.push({
      type: 'masthead',
      slug,
      locale: 'en',
      status: 'published',
      values: {
        title: decode(cfg.title[i]),
        description: cfg.description[i] ?? '',
        background: String(cfg.background[i]).split('#')[0]
      }
    })
  }
}

// ---- site chrome: the words the template prints itself, the footer columns and the Donate now button
const mod = (slug) => model.records.find((r) => r.type === 'modules' && r.slug === slug)?.values ?? {}
const aboutHtml = String(mod('about-impact').content ?? '')
const footerAbout = secText((aboutHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/) ?? [])[1] ?? '')
const footerMenus = Object.fromEntries(
  JSON.parse(readFileSync(file, 'utf8')).menus
    .filter((m) => m.name !== 'mainmenu')
    .map((m) => [m.name, m.items.map((i) => ({ label: i.label.en, path: i.path }))])
)
const col = (name) =>
  footerMenus[name]
    .map((i) => `${i.label}${i.path && i.path !== '#' ? ` | ${i.path}` : ''}`)
    .join('\n')
const chromeFields = [
  'title',
  'brand_name',
  'donate_label',
  'donate_link',
  'footer_about',
  'footer_col1_title',
  'footer_col1_links',
  'footer_col2_title',
  'footer_col2_links',
  'footer_col3_title',
  'footer_col3_links',
  'footer_col4_title',
  'footer_col4_links',
  'copyright',
  'license_line',
  'skip_label',
  'menu_label',
  'close_label',
  'prev_label',
  'next_label',
  'more_label',
  'read_more',
  'by_label',
  'related_title',
  'tags_label',
  'share_label',
  'raise_label',
  'goal_label',
  'location_label',
  'fee_label',
  'time_label',
  'join_label',
  'donate_cta',
  'view_all_label',
  'view_all_blog_label',
  'stories_label',
  'stories_title',
  'events_label',
  'events_title',
  'blog_label',
  'blog_title',
  'not_found_code',
  'not_found_title',
  'not_found_text',
  'not_found_back_label',
  'search_label',
  'search_placeholder',
  'search_button',
  'no_results',
  'newsletter_title',
  'newsletter_text',
  'newsletter_name_label',
  'newsletter_email_label',
  'newsletter_button',
  'newsletter_done',
  'play_label',
  'slides_label',
  'slide_label',
  'currency_symbol',
  'form_id',
  'logo_dark'
]
model.types.push({
  name: 'chrome',
  mode: 'single',
  label: { en: 'Site chrome' },
  fields: chromeFields.map((name) => ({ name, ...text }))
})
model.records.push({
  type: 'chrome',
  slug: 'chrome',
  locale: 'en',
  status: 'published',
  values: {
    title: 'Site chrome',
    brand_name: 'JA Impact',
    donate_label: 'Donate now',
    donate_link: '/donations',
    footer_about: footerAbout,
    footer_col1_title: 'Get to know us',
    footer_col1_links: col('get-to-know-us'),
    footer_col2_title: 'Guide',
    footer_col2_links: col('guide'),
    footer_col3_title: 'Need help',
    footer_col3_links: col('need-help'),
    footer_col4_title: 'Follow us',
    footer_col4_links: col('follow-us'),
    copyright: 'Copyright © {year} {name}. All Rights Reserved.',
    license_line: '',
    skip_label: 'Skip to content',
    menu_label: 'Menu',
    close_label: 'Close',
    prev_label: 'Previous',
    next_label: 'Next',
    more_label: 'Read more',
    read_more: 'Read more',
    by_label: 'By',
    related_title: 'Related posts',
    tags_label: 'Tags',
    share_label: 'Share',
    raise_label: 'Raise',
    goal_label: 'Goal',
    location_label: 'Location',
    fee_label: 'Fee',
    time_label: 'Time',
    join_label: 'Join our event',
    donate_cta: 'Donate now',
    view_all_label: 'View all',
    view_all_blog_label: 'View all our blog',
    stories_label: 'Funds',
    stories_title: 'Listen to their stories',
    events_label: 'Coming soon',
    events_title: 'You can check out our work our best events.',
    blog_label: 'Our blog',
    blog_title: 'Latest news & articles',
    not_found_code: '404',
    not_found_title: 'Page not found',
    not_found_text: 'An error has occurred while processing your request.',
    not_found_back_label: 'Back to the home page',
    search_label: 'Search',
    search_placeholder: 'Search…',
    search_button: 'Search',
    no_results: 'No results found.',
    newsletter_title: 'Stay connected',
    newsletter_text: 'Share in the latest transformations within our community and opportunities to get involved.',
    newsletter_name_label: 'Name',
    newsletter_email_label: 'Email',
    newsletter_button: 'Subscribe',
    newsletter_done: 'Thank you for subscribing.',
    play_label: 'Play video',
    slides_label: 'Slides',
    slide_label: 'Slide',
    currency_symbol: '$',
    form_id: '',
    logo_dark: ''
  }
})
// the Joomla custom modules (footer about, Donate now button, map) are chrome text or not ported (D7)
model.records = model.records.filter((r) => r.type !== 'modules')
model.types = model.types.filter((t) => t.name !== 'modules')
// pictures are listed by build-media-map.mjs from the compiled seed; the model's own list names basenames of records dropped above
model.media = []
writeFileSync(file, JSON.stringify(model, null, 2) + '\n')
console.log(`shape-model: ${model.records.length} records, ${model.routes.length} routes, ${model.menus.length} menu(s)`)
