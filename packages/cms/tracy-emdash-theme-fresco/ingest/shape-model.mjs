#!/usr/bin/env node
// Applies the porting decisions of DECISIONS.md (D5-D7, D10, D11) to site-model.json before compile-seed: keeps the pages and
// the section entries the template ports, gives every kept section a stable name, adds what the model drops (site chrome,
// mastheads, the article that is a menu item, authors, tags) and names the header menu `primary`.
//   node ingest/shape-model.mjs <seed/site-model.json> <j6/inventory.json> <spec/sections.json> <spec/page-map.json>
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

const [file, inventoryFile, sectionsFile, pageMapFile] = process.argv.slice(2)
if (!file || !inventoryFile || !sectionsFile || !pageMapFile) {
  console.error('usage: shape-model.mjs <site-model.json> <inventory.json> <sections.json> <page-map.json>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(file, 'utf8'))
const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const sections = JSON.parse(readFileSync(sectionsFile, 'utf8'))
const pageMap = JSON.parse(readFileSync(pageMapFile, 'utf8'))
const before = model.records.length

// ---- sections: the model names a collection's entries by title (`gallery`, `gallery-124`); the module id is the only link back
// to the page that places it. Entries of one type are in module-id order in both files, so they pair by position.
const NAME = {
  112: 'home-hero',
  114: 'home-services',
  115: 'home-explore',
  116: 'home-events',
  117: 'home-sea',
  118: 'home-land',
  119: 'home-sky',
  121: 'home-gallery-1',
  122: 'home-desserts',
  123: 'home-tea',
  124: 'home-gallery-2',
  127: 'home-testimonials',
  128: 'home-visit',
  143: 'about-intro',
  150: 'about-features',
  168: 'about-testimonials',
  153: 'about-team',
  163: 'chiefs-team',
  148: 'gallery-two',
  165: 'gallery-one',
  158: 'menu-columns',
  164: 'menu-grid',
  159: 'menu-list-1',
  162: 'menu-list-2',
  169: 'offer-hour-1',
  170: 'offer-hour-2',
  171: 'offer-hour-3',
  172: 'book-table'
}
const KEEP_PATHS = new Set(['/', '/about', '/gallery', '/chiefs', '/menu', '/offer', '/contact'])
const usedBy = new Map()
for (const pg of pageMap.pages)
  for (const s of pg.sections)
    for (const m of s.modules) usedBy.set(String(m), [...(usedBy.get(String(m)) ?? []), pg.path])
const dropped = new Set()
const byType = {}
for (const m of sections.acm) (byType[m.type.replace(/-/g, '_')] ??= []).push(m)
const sectionStyle = {}
for (const [type, mods] of Object.entries(byType)) {
  const recs = model.records.filter((r) => r.type === type)
  if (recs.length !== mods.length) throw new Error(`${type}: ${recs.length} entries, ${mods.length} modules`)
  recs.forEach((rec, i) => {
    const id = String(mods[i].id)
    // module 172 (Book Table) is placed by the header, not by a page
    const keep = NAME[id] && (id === '172' || (usedBy.get(id) ?? []).some((p) => KEEP_PATHS.has(p)))
    if (!keep) return dropped.add(rec)
    rec.slug = NAME[id]
    sectionStyle[NAME[id]] = { type, style: mods[i].style, module: id, spacing: mods[i].spacing }
  })
}
model.records = model.records.filter((r) => !dropped.has(r))
const mark = (v) =>
  typeof v === 'string'
    ? v.replace(/<span class=['"](?:hightlight|text-highlight)['"]>([\s\S]*?)<\/span>/g, '<mark>$1</mark>')
    : Array.isArray(v)
      ? v.map(mark)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mark(x)]))
        : v
for (const r of model.records) if (r.type !== 'pages' && r.type !== 'posts') r.values = mark(r.values)
// The model keeps a picture as a bare basename (`item-1.jpg`), which several folders share; the module's own parameters carry the
// whole path (`images/joomlart/feature/item-1.jpg#joomlaImage://...`), so every picture field gets it back.
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
// the section's own heading block (Joomla module title when shown, `main-section`, `top-desc`): module parameters the model drops
const secText = (h) =>
  decode(
    stripTags(
      String(h ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, ' ')
    )
  )
    .replace(/[ \t]*\r?\n[ \t\r\n]*/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
for (const [slug, info] of Object.entries(sectionStyle)) {
  if (info.type === 'hero' || info.type === 'book_table') continue
  const mod = inventory.modules.find((m) => String(m.id) === info.module)
  const p = JSON.parse(mod.params)
  const type = model.types.find((t) => t.name === info.type)
  for (const name of ['section_label', 'section_title', 'section_desc'])
    if (!type.fields.some((f) => f.name === name)) type.fields.push({ name, type: 'text' })
  const rec = model.records.find((r) => r.type === info.type && r.slug === slug)
  Object.assign(rec.values, {
    section_label: String(mod.showtitle) === '1' ? decode(mod.title) : '',
    section_title: secText(p['main-section']),
    section_desc: secText(p['top-desc'])
  })
}
writeFileSync(
  new URL('../src/lib/page-layout.json', import.meta.url),
  JSON.stringify(sectionStyle, null, 2) + '\n'
)

// ---- pages
const KEEP_PAGES = new Set(['front-page', 'about', 'gallery', 'chiefs', 'menu', 'offer', 'contact'])
model.records = model.records.filter((r) => r.type !== 'pages' || KEEP_PAGES.has(r.slug))
for (const r of model.records) if (r.type === 'pages' && r.slug === 'front-page') r.slug = 'home'
// the blog gets a page record of its own, so a customer can hide it from the header
model.records.push({
  type: 'pages',
  slug: 'blog',
  locale: 'en',
  status: 'published',
  values: { title: 'Blog', body: '', view: 'blog' }
})
// routes: the pages, the blog list at /blog and every post under it (the source's /pages/j-content/... is the Joomla menu tree)
model.routes = [
  ...model.routes.filter((r) => r.kind === 'page' && KEEP_PATHS.has(r.path)),
  { path: '/blog', kind: 'list', type: 'posts' }
]
// the main menu without the Home demos, and the footer "About" menu (its links are `#` except one: see chrome.footer_links_text)
model.menus = model.menus.filter((m) => m.name === 'mainmenu')
for (const m of model.menus) {
  m.name = 'primary'
  m.label = { en: 'Primary' }
  m.items = (m.items ?? []).map(({ children: _c, ...it }) => it)
}

// ---- posts: the article that is a menu item (`blog-detail`) is a post too; author, creation date and tags
const postType = model.types.find((t) => t.name === 'posts')
// Search: the words of a post are what the search index holds; without a `searchable` field the CMS refuses to build it.
for (const f of postType.fields) if (['title', 'excerpt', 'body'].includes(f.name)) f.searchable = true
postType.fields.push(
  { name: 'created', type: 'date' },
  { name: 'author', type: 'text' },
  { name: 'author_avatar', type: 'image' },
  { name: 'tags', type: 'text' }
)
const byId = Object.fromEntries(inventory.users.map((u) => [u.id, u]))
const avatar = (uid) => {
  const row = inventory.user_profiles.find(
    (p) => p.user_id === uid && p.profile_key === 'profile.user_avatar'
  )
  return row ? String(JSON.parse(row.profile_value)).split('#')[0] : ''
}
const tagsOf = (cid) =>
  inventory.contentitem_tag_map
    .filter((m) => m.type_alias === 'com_content.article' && m.content_item_id === cid)
    .map((m) => inventory.tags.find((t) => t.id === m.tag_id)?.title)
    .filter(Boolean)
    .join('\n')
const coverOf = (row) => String(JSON.parse(row.images || '{}').image_intro ?? '').split('#')[0]
if (!model.records.some((r) => r.type === 'posts' && r.slug === 'soul-kitchen-kumquat-thyme-cocktail')) {
  const row = inventory.content.find((c) => c.alias === 'soul-kitchen-kumquat-thyme-cocktail')
  model.records.push({
    type: 'posts',
    slug: row.alias,
    locale: 'en',
    status: 'published',
    terms: { category: ['food'] },
    values: {
      title: decode(row.title),
      excerpt: '',
      body: `${row.introtext}\n${row.fulltext}`,
      date: row.publish_up,
      cover: coverOf(row)
    }
  })
}
for (const r of model.records.filter((x) => x.type === 'posts')) {
  const row = inventory.content.find((c) => c.alias === r.slug)
  const u = byId[row.created_by]
  // the model rewrites the body's pictures to bare basenames; the article's own text keeps their paths
  Object.assign(r.values, {
    body: `${row.introtext}\n${row.fulltext}`,
    cover: coverOf(row),
    created: row.created,
    author: u?.name ?? '',
    author_avatar: avatar(row.created_by),
    tags: tagsOf(row.id)
  })
}
{
  const posts = model.records
    .filter((r) => r.type === 'posts')
    .sort((a, b) => String(b.values.date).localeCompare(String(a.values.date)))
  model.records = [...model.records.filter((r) => r.type !== 'posts'), ...posts]
}

for (const r of model.records.filter((x) => x.type === 'posts'))
  model.routes.push({ path: `/blog/${r.slug}`, kind: 'detail', type: 'posts', slug: r.slug })

// ---- mastheads: module 136 keeps one title / description / background per menu item in its params
{
  const mod = inventory.modules.find((m) => String(m.id) === '136')
  const cfg = JSON.parse(mod.params).menuitem_config
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
  const SLUG = { 109: 'blog', 117: 'contact', 126: 'chiefs', 124: 'about' }
  for (const [i, ids] of Object.entries(cfg.item_id)) {
    const slug = SLUG[[].concat(ids)[0]]
    if (!slug) continue
    model.records.push({
      type: 'masthead',
      slug,
      locale: 'en',
      status: 'published',
      values: {
        title: cfg.title[i],
        description: cfg.description[i],
        background: String(cfg.background[i]).split('#')[0]
      }
    })
  }
  // an article page shows its own title in the band, over the article banner picture (the full text image every demo article carries)
  const bannerOf = (row) => String(JSON.parse(row.images || '{}').image_fulltext ?? '').split('#')[0]
  const banner = inventory.content.map(bannerOf).find(Boolean) || String(cfg.background[5]).split('#')[0]
  model.records.push({
    type: 'masthead',
    slug: 'post',
    locale: 'en',
    status: 'published',
    values: { title: '', description: '', background: banner }
  })
}

// ---- site chrome: top bar, footer columns, the words the template prints itself
const mod = (slug) => model.records.find((r) => r.type === 'modules' && r.slug === slug)?.values ?? {}
const lines = (h) =>
  decode(stripTags(String(h ?? '').replace(/<br\s*\/?>/gi, '\n')))
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
const welcome = mod('welcome-to-fresco'),
  visit = mod('visit'),
  hours = mod('hours'),
  resa = mod('reservations')
const tl = mod('topbar-left'),
  tr = mod('topbar-right')
const text = { type: 'text' }
model.types.push({
  name: 'chrome',
  mode: 'single',
  label: { en: 'Site chrome' },
  fields: [
    'title',
    'brand_name',
    'topbar_address',
    'topbar_phone_label',
    'topbar_phone',
    'footer_about_title',
    'footer_about',
    'footer_visit_title',
    'footer_address',
    'footer_phone',
    'footer_email',
    'footer_reservations_title',
    'footer_reservations_button',
    'footer_hours_title',
    'footer_hours',
    'footer_links_title',
    'footer_link_text',
    'footer_link_to',
    'footer_links_text',
    'copyright',
    'skip_label',
    'menu_label',
    'close_label',
    'prev_label',
    'next_label',
    'more_label',
    'read_more',
    'by_label',
    'related_title',
    'related_text',
    'tags_label',
    'share_label',
    'not_found_code',
    'not_found_title',
    'not_found_text',
    'not_found_back_label',
    'book_label',
    'book_link',
    'search_label',
    'search_placeholder',
    'search_button',
    'no_results'
  ]
    .map((name) => ({ name, ...text }))
    .concat([{ name: 'logo_dark', type: 'image' }])
})
const aboutMenu = inventory.menu.filter((m) => m.menutype === 'about' && m.published === '1')
model.records.push({
  type: 'chrome',
  slug: 'chrome',
  locale: 'en',
  status: 'published',
  values: {
    title: 'Site chrome',
    brand_name: 'JA Fresco',
    topbar_address: lines(tl.content).join(' '),
    topbar_phone_label: lines(tr.content)[0]?.replace(/\s*\d.*$/, '') ?? '',
    topbar_phone: lines(tr.content)
      .join(' ')
      .replace(/^.*?:\s*/, ''),
    footer_about_title: lines(welcome.title).join(' '),
    footer_about: lines(welcome.content).join('\n'),
    footer_visit_title: lines(visit.title).join(' '),
    footer_address: lines(visit.content)[0] ?? '',
    footer_phone: lines(visit.content)[1] ?? '',
    footer_email: lines(visit.content)[2] ?? '',
    footer_reservations_title: lines(resa.title).join(' '),
    footer_reservations_button: lines(resa.content)
      .join(' ')
      .replace(/^Book you table$/i, 'Book your table'),
    footer_hours_title: lines(hours.title).join(' '),
    footer_hours: lines(hours.content).join('\n'),
    footer_links_title: 'About',
    // the one linked entry of the "About" menu (the contact page) and the source's `#` entries, which print as plain text (DECISIONS D11)
    footer_link_text: aboutMenu.filter((m) => /Itemid=117/.test(m.link)).map((m) => decode(m.title))[0] ?? '',
    footer_link_to: aboutMenu.some((m) => /Itemid=117/.test(m.link)) ? '/contact' : '',
    footer_links_text: aboutMenu
      .filter((m) => !/Itemid=117/.test(m.link))
      .map((m) => decode(m.title))
      .join('\n'),
    copyright: 'Copyright © {year} {name}. All Rights Reserved.',
    skip_label: 'Skip to content',
    menu_label: 'Menu',
    close_label: 'Close',
    prev_label: 'Prev',
    next_label: 'Next',
    more_label: 'More Articles …',
    read_more: 'Read more',
    by_label: 'By',
    related_title: 'Related Posts',
    related_text:
      "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s...",
    tags_label: 'Tags:',
    share_label: 'Share article:',
    not_found_code: '404',
    not_found_title: 'Page not found',
    not_found_text: 'An error has occurred while processing your request.',
    not_found_back_label: 'Home Page',
    // the header button is a `#` link in the source; the hero's and the footer's "book a table" buttons go to the contact page
    book_label: 'Book Table',
    book_link: '/contact',
    search_label: 'Smart Search',
    search_placeholder: '',
    search_button: 'Search',
    no_results: 'No results found.'
  }
})
model.records = model.records.filter((r) => r.type !== 'modules')
model.types = model.types.filter((t) => t.name !== 'modules')
model.types = model.types.filter((t) => t.name !== 'text_slider')

// ---- the contact record and the words of its form
{
  const c = inventory.contact_details[0]
  model.types.push({
    name: 'contact',
    mode: 'single',
    label: { en: 'Contact' },
    fields: [
      'title',
      'heading',
      'intro',
      'email_label',
      'email',
      'address_label',
      'address',
      'phone_label',
      'phone',
      'form_title',
      'form_intro_text',
      'name_label',
      'email_field_label',
      'phone_field_label',
      'subject_label',
      'message_label',
      'submit_label',
      'socials',
      'form_id'
    ].map((name) => ({ name, ...text }))
  })
  model.records.push({
    type: 'contact',
    slug: 'contact-info',
    locale: 'en',
    status: 'published',
    values: {
      title: 'Contact',
      heading: 'Have question?\nGet in touch!',
      intro: decode(c.misc).trim(),
      email_label: 'Write email',
      email: c.email_to,
      address_label: 'Visit office',
      address: c.address,
      phone_label: 'Mobile',
      phone: c.mobile,
      form_title: 'Always here to help you',
      form_intro_text: 'Write a Message',
      name_label: 'Your name',
      email_field_label: 'Email address',
      phone_field_label: 'Your phone',
      subject_label: 'Subject',
      message_label: 'How we can help?',
      submit_label: 'Send a message',
      // the source draws no social row on its contact page (its three links are data of the contact entry that the template does not render): D36
      socials: '',
      form_id: ''
    }
  })
}

// the model's media list names the entries by their old slugs; the media map is built from the records and the webroot (build-media-map.mjs)
model.media = []

// the site identity template.config.json declares
// two typos of the demo data are corrected (DECISIONS D22): a dish name cut mid-word and the footer's booking button
for (const r of model.records)
  for (const it of r.values?.items ?? [])
    if (it?.dish_name === 'Blackened Fish Sandwic') it.dish_name = 'Blackened Fish Sandwich'
model.site = { ...model.site, title: { en: 'JA Fresco' }, tagline: { en: '' } }

// ---- a scalar field that arrives as a list holds the first non-empty value
for (const r of model.records) {
  const type = model.types.find((t) => t.name === r.type)
  for (const f of type.fields)
    if (f.type !== 'group' && Array.isArray(r.values[f.name]))
      r.values[f.name] = r.values[f.name].find((v) => v) ?? ''
}
console.log(
  `shape-model: ${before - model.records.length} record(s) net dropped, ${model.records.length} kept, menus: ${model.menus.map((m) => m.name)}`
)
writeFileSync(file, JSON.stringify(model, null, 2) + '\n')
