#!/usr/bin/env node
// Applies the porting decisions of DECISIONS.md (D5-D7, D9-D12) to site-model.json before compile-seed: keeps the pages and
// the section entries the template ports, gives every kept section a stable name, adds what the model drops (site chrome,
// mastheads, authors, tags, the footer links) and names the header menu `primary`.
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
const before = model.records.length

// ---- sections: the model names a collection's entries by title; the module id is the only link back to the page that places it.
// Entries of one type are in module-id order in both files, so they pair by position. Module ids that are not named here are
// dropped (the other Home styles, the showcase front page, the Joomla pages).
const NAME = {
  98: 'home-slideshow',
  101: 'home-intro',
  102: 'home-services',
  104: 'home-missions',
  105: 'home-missions-list',
  106: 'home-cases',
  108: 'home-philosophy',
  109: 'home-team',
  113: 'home-consult',
  118: 'clients',
  120: 'footer-quote',
  144: 'about-intro',
  138: 'about-careers',
  139: 'about-people',
  140: 'about-team',
  151: 'services-tiles',
  153: 'services-cases',
  155: 'services-praise',
  156: 'services-cta'
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
// no collection is left empty: a type with no kept entry (hero) is dropped, so the admin does not list a dead collection
const usedTypes = new Set(model.records.map((r) => r.type))
model.types = model.types.filter((t) => usedTypes.has(t.name) || ['pages', 'posts'].includes(t.name))

// the demo's `<span class="hightlight">` marks a word; the seed keeps it as <mark>
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

// `<br/>` inside a text field is a line break; the field holds the line break itself (the template prints it as one)
const brs = (v, key = '') =>
  Array.isArray(v)
    ? v.map((x) => brs(x, key))
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, brs(x, k)]))
      : typeof v === 'string' && key !== 'description'
        ? v.replace(/<br\s*\/?>\s*\n?/gi, '\n').replace(/[ \t]+\n/g, '\n')
        : v
for (const r of model.records) if (r.type !== 'pages' && r.type !== 'posts') r.values = brs(r.values)
// the team band's hiring line carries its call to action in a <b>: two fields, the sentence and the words that link
for (const r of model.records.filter((x) => x.type === 'teams')) {
  const m = /^([\s\S]*?)\s*<b>([\s\S]*?)<\/b>\s*$/.exec(r.values.more_title ?? '')
  const type = model.types.find((t) => t.name === 'teams')
  if (!type.fields.some((f) => f.name === 'more_cta')) type.fields.push({ name: 'more_cta', type: 'text' })
  r.values.more_cta = m ? m[2] : ''
  r.values.more_title = m ? m[1] : (r.values.more_title ?? '')
}

// `position` names the Joomla module position a style-3 band hangs its extras on (an accordion, the form): the template places them
// by its own composition, so the field is dropped
{
  const t = model.types.find((x) => x.name === 'features_intro')
  t.fields = t.fields.filter((f) => f.name !== 'position')
  for (const r of model.records.filter((x) => x.type === 'features_intro')) delete r.values.position
}

// a link that is `#` in the source goes nowhere: the field is empty and the page prints no link (DECISIONS D10)
const clearHash = (v) =>
  Array.isArray(v)
    ? v.map(clearHash)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clearHash(x)]))
      : v === '#'
        ? ''
        : v
for (const r of model.records) if (r.type !== 'pages' && r.type !== 'posts') r.values = clearHash(r.values)
// the home services button points at the services page it is for (DECISIONS D10)
{
  const r = model.records.find((x) => x.type === 'features_intro' && x.slug === 'home-services')
  if (r && !r.values.link_more) r.values.link_more = '/services'
}
// the demo's own addresses move to the ported ones
const PATHS = { '/services-page': '/services', '/contact-us': '/contact-us', '/about-us': '/about-us' }
const fixLinks = (v) =>
  Array.isArray(v)
    ? v.map(fixLinks)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixLinks(x)]))
      : typeof v === 'string' && PATHS[v]
        ? PATHS[v]
        : v
for (const r of model.records) if (r.type !== 'pages' && r.type !== 'posts') r.values = fixLinks(r.values)

// the section's own heading: the module title when shown, the small red label above it is the module's `sub-heading`; the
// background (white / gray / secondary) and the faint world map behind it are the module's `color-module` / `bg-module`
const text = { type: 'text' }
for (const [slug, info] of Object.entries(sectionStyle)) {
  const mod = inventory.modules.find((m) => String(m.id) === info.module)
  const p = JSON.parse(mod.params)
  const type = model.types.find((t) => t.name === info.type)
  for (const [name, t] of [
    ['section_label', 'text'],
    ['section_style', 'text'],
    ['section_mask', 'image']
  ])
    if (!type.fields.some((f) => f.name === name)) type.fields.push({ name, type: t })
  const rec = model.records.find((r) => r.type === info.type && r.slug === slug)
  const label = decode(stripTags(String(p['sub-heading'] ?? ''))).trim()
  Object.assign(rec.values, {
    section_label: label,
    section_style: ['gray', 'secondary'].includes(p['color-module']) ? p['color-module'] : 'white',
    section_mask: isImg(p['bg-module']) ? fullPath(p['bg-module']) : ''
  })
}
writeFileSync(
  new URL('../src/lib/page-layout.json', import.meta.url),
  JSON.stringify(sectionStyle, null, 2) + '\n'
)

// ---- pages: Home is the "Home Style 1" article (DECISIONS D6)
const KEEP = { 'home-style-1': 'home', 'about-us': 'about-us', 'services-page': 'services', 'contact-us': 'contact-us' }
model.records = model.records.filter((r) => r.type !== 'pages' || KEEP[r.slug])
for (const r of model.records) if (r.type === 'pages') r.slug = KEEP[r.slug]
const PAGE_TITLE = { home: 'Home', services: 'Services' }
for (const r of model.records)
  if (r.type === 'pages') {
    if (PAGE_TITLE[r.slug]) r.values.title = PAGE_TITLE[r.slug]
    r.values.view = r.slug === 'home' ? 'front-page' : r.slug === 'contact-us' ? 'page-contact' : 'page-landing'
  }
// the blog gets a page record of its own, so a customer can hide it from the header
model.records.push({
  type: 'pages',
  slug: 'blog',
  locale: 'en',
  status: 'published',
  values: { title: 'News & Update', body: '', view: 'blog' }
})
model.routes = [
  { path: '/', kind: 'page' },
  { path: '/about-us', kind: 'page' },
  { path: '/services', kind: 'page' },
  { path: '/contact-us', kind: 'page' },
  { path: '/blog', kind: 'list', type: 'posts' }
]
// the main menu without the Home styles
model.menus = model.menus.filter((m) => m.name === 'mainmenu')
for (const m of model.menus) {
  m.name = 'primary'
  m.label = { en: 'Primary' }
  m.items = (m.items ?? []).map(({ children: _c, ...it }) => ({
    ...it,
    path: { '/joomlart-content/category-blog': '/blog', '/services-page': '/services' }[it.path] ?? it.path
  }))
}

// ---- posts: author, creation date and tags; only the articles of the blog categories (the demo's page articles are not posts)
const postType = model.types.find((t) => t.name === 'posts')
for (const f of postType.fields) if (['title', 'excerpt', 'body'].includes(f.name)) f.searchable = true
postType.fields.push(
  { name: 'created', type: 'date' },
  { name: 'author', type: 'text' },
  { name: 'author_avatar', type: 'image' },
  { name: 'tags', type: 'text' }
)
const byId = Object.fromEntries(inventory.users.map((u) => [u.id, u]))
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
const imagesOf = (row, key) => String(JSON.parse(row.images || '{}')[key] ?? '').split('#')[0]
const POST_CATS = new Set(['9', '10', '11', '12', '13', '14', '15'])
const isPost = (r) => {
  const row = inventory.content.find((c) => c.alias === r.slug)
  return Boolean(row && POST_CATS.has(row.catid))
}
// the article that is a menu item ("Single Article") is a post too: the blog's first card
{
  const row = inventory.content.find((c) => c.id === '2')
  if (row && !model.records.some((r) => r.type === 'posts' && r.slug === row.alias)) {
    const sibling = model.records.find(
      (r) => r.type === 'posts' && inventory.content.find((c) => c.alias === r.slug)?.catid === row.catid
    )
    model.records.push({
      type: 'posts',
      slug: row.alias,
      locale: 'en',
      status: 'published',
      terms: sibling?.terms,
      values: { title: decode(row.title), excerpt: '', body: '', date: row.publish_up, cover: '' }
    })
  }
}
model.records = model.records.filter((r) => r.type !== 'posts' || isPost(r))
for (const r of model.records.filter((x) => x.type === 'posts')) {
  const row = inventory.content.find((c) => c.alias === r.slug)
  const u = byId[row.created_by]
  Object.assign(r.values, {
    body: `${row.introtext}\n${row.fulltext}`,
    cover: imagesOf(row, 'image_intro'),
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
  for (const r of posts) model.routes.push({ path: `/blog/${r.slug}`, kind: 'detail', type: 'posts', slug: r.slug })
}

// ---- mastheads: module 103 keeps one title / description / background per menu item in its params; the blog, the search and the
// article pages print the module's default title and description
{
  const p = JSON.parse(inventory.modules.find((m) => String(m.id) === '103').params)
  const cfg = p.menuitem_config
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
  const SLUG = { 154: 'about-us', 156: 'services' }
  for (const [i, ids] of Object.entries(cfg.item_id)) {
    const slug = SLUG[[].concat(ids)[0]]
    if (!slug) continue
    model.records.push({
      type: 'masthead',
      slug,
      locale: 'en',
      status: 'published',
      values: { title: cfg.title[i], description: cfg.description[i], background: fullPath(cfg.background[i]) }
    })
  }
  const dflt = fullPath(cfg.background[3])
  // the error page's own picture (templates/ja_morgan/error.php): a full-screen photo with no title band
  model.records.push({
    type: 'masthead',
    slug: 'not-found',
    locale: 'en',
    status: 'published',
    values: { title: '', description: '', background: 'templates/ja_morgan/images/bg-404.jpg' }
  })
  for (const slug of ['blog', 'post', 'search'])
    model.records.push({
      type: 'masthead',
      slug,
      locale: 'en',
      status: 'published',
      values: { title: p['default-title'], description: p['default-description'], background: dflt }
    })
}

// ---- site chrome: top bar, header contact, footer, the words the template prints itself
const mod = (slug) => model.records.find((r) => r.type === 'modules' && r.slug === slug)?.values ?? {}
const lines = (h) =>
  decode(stripTags(String(h ?? '').replace(/<br\s*\/?>/gi, '\n')))
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
const tl = mod('topbar-left')
const office = mod('morgan-office')
const talk = mod('start-a-conversation')
const copy = mod('copyright')
const c = inventory.contact_details[0]
model.types.push({
  name: 'chrome',
  mode: 'single',
  label: { en: 'Site chrome' },
  fields: [
    'title',
    'brand_name',
    'topbar_address',
    'topbar_phone',
    'footer_social_title',
    'footer_social_facebook_url',
    'footer_social_twitter_url',
    'footer_social_instagram_url',
    'copyright',
    'copyright_credit',
    'skip_label',
    'menu_label',
    'close_label',
    'theme_label',
    'prev_label',
    'next_label',
    'read_more',
    'by_label',
    'hits_label',
    'tags_label',
    'categories_label',
    'recent_label',
    'share_label',
    'not_found_code',
    'not_found_title',
    'not_found_text',
    'not_found_back_label',
    'search_label',
    'search_placeholder',
    'search_button',
    'no_results'
  ]
    .map((name) => ({ name, ...text }))
    .concat([{ name: 'logo_dark', type: 'image' }])
})
model.records.push({
  type: 'chrome',
  slug: 'chrome',
  locale: 'en',
  status: 'published',
  values: {
    title: 'Site chrome',
    brand_name: 'Morgan',
    topbar_address: lines(tl.content)[0] ?? '',
    topbar_phone: lines(tl.content)[1] ?? '',
    footer_social_title: 'Social.',
    footer_social_facebook_url: 'https://www.joomlart.com/',
    footer_social_twitter_url: 'https://www.joomlart.com/',
    footer_social_instagram_url: 'https://www.joomlart.com/',
    copyright: 'Copyright © {year} {name}. All Rights Reserved.',
    copyright_credit: 'Designed by JoomlArt.',
    skip_label: 'Skip to content',
    menu_label: 'Menu',
    close_label: 'Close',
    theme_label: 'Switch colour theme',
    prev_label: 'Previous',
    next_label: 'Next',
    read_more: 'Read more',
    by_label: 'By',
    hits_label: 'Hits',
    tags_label: 'Tags.',
    categories_label: 'Categories.',
    recent_label: 'News & Update.',
    share_label: 'Share article:',
    not_found_code: '404',
    not_found_title: 'Page not found',
    not_found_text: 'An error has occurred while processing your request.',
    not_found_back_label: 'Home Page',
    search_label: 'Smart Search',
    search_placeholder: 'Search …',
    search_button: 'Search',
    no_results: 'No results found.'
  }
})
void office
void talk
void copy

// ---- the footer: five columns of links; a link with no destination in the source is a plain label (empty address slot)
{
  model.types.push({
    name: 'footer_links',
    mode: 'list',
    label: { en: 'Footer links' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'column', type: 'text' },
      { name: 'label', type: 'text' },
      { name: 'link', type: 'url' }
    ]
  })
  const COLUMNS = { navigate: 'Navigate.', services: 'Services.', support: 'Support.', careers: 'Careers.', 'terms-privacy': 'Terms & Privacy.' }
  const TO = { Home: '/', Services: '/services', News: '/blog', Testimonials: '/services', Advisors: '/about-us', 'Contact Us': '/contact-us' }
  for (const [ci, [menutype, column]] of Object.entries(COLUMNS).entries())
    for (const [i, row] of inventory.menu
      .filter((m) => m.menutype === menutype && m.published === '1')
      .sort((a, b) => Number(a.lft ?? 0) - Number(b.lft ?? 0))
      .entries()) {
      const label = decode(row.title).trim()
      model.records.push({
        type: 'footer_links',
        slug: `col${ci + 1}-${String(i + 1).padStart(2, '0')}`,
        locale: 'en',
        status: 'published',
        values: { title: `${column}: ${label}`, column, label, link: menutype === 'navigate' ? (TO[label] ?? '') : '' }
      })
    }
}

model.records = model.records.filter((r) => r.type !== 'modules')
model.types = model.types.filter((t) => t.name !== 'modules')

// ---- the contact record: the four cards (address, email, phone, website), the form and its words
{
  model.types.push({
    name: 'contact',
    mode: 'single',
    label: { en: 'Contact' },
    fields: [
      'title',
      'label',
      'heading',
      'address_label',
      'address',
      'email_label',
      'email',
      'phone_label',
      'phone',
      'website_label',
      'website_url',
      'form_title',
      'form_intro_text',
      'name_label',
      'email_field_label',
      'subject_label',
      'message_label',
      'copy_label',
      'submit_label',
      'form_id'
    ]
      .map((name) => ({ name, ...text }))
      .concat([{ name: 'photo', type: 'image' }])
  })
  model.records.push({
    type: 'contact',
    slug: 'contact-info',
    locale: 'en',
    status: 'published',
    values: {
      title: 'Contact',
      label: 'Contact.',
      heading: c.name.replace(/^Ja /, 'JA '),
      address_label: 'Address',
      address: decode(c.address).replace(/\r?\n/g, ', '),
      email_label: 'Email',
      email: c.email_to,
      phone_label: 'Phone',
      phone: c.telephone,
      website_label: 'Website',
      website_url: c.webpage,
      form_title: 'Contact Form',
      form_intro_text: 'Send an Email. All fields with an asterisk (*) are required.',
      name_label: 'Name',
      email_field_label: 'Email',
      subject_label: 'Subject',
      message_label: 'Message',
      copy_label: 'Send a copy to yourself',
      submit_label: 'Send Email',
      photo: fullPath(c.image),
      form_id: ''
    }
  })
}

// the model's media list names the entries by their old slugs; the media map is built from the records and the webroot
model.media = []
// two typos of the demo data are corrected (DECISIONS D14)
for (const r of model.records) if (r.type === 'masthead' && r.values?.title === 'Our Sevices') r.values.title = 'Our Services'
// a demo headline that quotes a price reads as a claim about the customer's business (the label rule R2 of the content map): the figure is dropped (DECISIONS D19)
for (const r of model.records)
  if (r.type === 'posts' && /\s+for \$?29\.5M\b/i.test(r.values.title ?? '')) r.values.title = r.values.title.replace(/\s+for \$?29\.5M\b/i, '')
model.site = { ...model.site, title: { en: 'JA Morgan' }, tagline: { en: '' } }

// ---- a scalar field that arrives as a list holds the first non-empty value
for (const r of model.records) {
  const type = model.types.find((t) => t.name === r.type)
  for (const f of type.fields)
    if (f.type !== 'group' && Array.isArray(r.values[f.name])) r.values[f.name] = r.values[f.name].find((v) => v) ?? ''
}
console.log(
  `shape-model: ${before - model.records.length} record(s) net dropped, ${model.records.length} kept, menus: ${model.menus.map((m) => m.name)}`
)
writeFileSync(file, JSON.stringify(model, null, 2) + '\n')
