#!/usr/bin/env node
// Applies the porting decisions of DECISIONS.md to site-model.json before compile-seed: names every ACM section, restores the
// picture paths the model cut to basenames, turns the Joomla articles that are menu items into posts or pages, adds what the
// model drops (site chrome, contact, authors, tags, project fields) and writes src/lib/page-layout.json (which sections a page prints).
//   node ingest/shape-model.mjs <seed/site-model.json> <j6/inventory.json> <spec/sections.json> <spec/page-map.json> <spec/content.json>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { decodeWith, stripTags } from './text.mjs'

const decode = decodeWith({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#39;': "'", '&nbsp;': ' ' })
const [file, inventoryFile, sectionsFile, pageMapFile, contentFile] = process.argv.slice(2)
if (!file || !inventoryFile || !sectionsFile || !pageMapFile || !contentFile) {
  console.error('usage: shape-model.mjs <site-model.json> <inventory.json> <sections.json> <page-map.json> <content.json>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(file, 'utf8'))
const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const sections = JSON.parse(readFileSync(sectionsFile, 'utf8'))
const pageMap = JSON.parse(readFileSync(pageMapFile, 'utf8'))
const content = JSON.parse(readFileSync(contentFile, 'utf8'))
const before = model.records.length
const text = { type: 'text' }

// ---- sections: records of one type are in module-id order in both files, so they pair by position.
const NAME = {
  111: 'home-hero',
  112: 'home-intro-1',
  114: 'home-chips-1',
  115: 'home-chips-2',
  116: 'products-cards',
  121: 'home-cta',
  122: 'clients',
  123: 'home-intro-2',
  124: 'team',
  125: 'home-intro-3',
  126: 'home-stats',
  127: 'pricing',
  130: 'faq',
  131: 'cta-contact',
  137: 'about-intro',
  139: 'about-video',
  140: 'about-intro-2',
  141: 'about-expertise',
  142: 'about-stats',
  143: 'services-intro',
  144: 'services-cards',
  145: 'career-positions',
  148: 'social'
}
const byType = {}
for (const m of sections.acm) (byType[m.type.replace(/-/g, '_')] ??= []).push(m)
const sectionInfo = {}
for (const [type, mods] of Object.entries(byType)) {
  const recs = model.records.filter((r) => r.type === type)
  if (recs.length !== mods.length) throw new Error(`${type}: ${recs.length} entries, ${mods.length} modules`)
  recs.forEach((rec, i) => {
    const id = String(mods[i].id)
    if (!NAME[id]) throw new Error(`module ${id} (${type}) has no name`)
    rec.slug = NAME[id]
    sectionInfo[NAME[id]] = { type, style: mods[i].style, module: id, spacing: mods[i].spacing, position: mods[i].position }
  })
}
// the model keeps a picture as a bare basename (`item-1.jpg`), which several folders share; the module's own parameters carry the
// whole path, so every picture field gets it back.
const fullPath = (v) => String(v).split('#')[0]
const isImg = (v) => typeof v === 'string' && /^images\/.+\.(jpe?g|png|gif|svg|webp)(#|$)/i.test(v)
for (const [slug, info] of Object.entries(sectionInfo)) {
  const rec = model.records.find((r) => r.type === info.type && r.slug === slug)
  const mod = sections.acm.find((m) => String(m.id) === info.module)
  const norm = (k) => k.replace(/-/g, '_')
  for (const [k, v] of Object.entries(mod.fields ?? {})) if (isImg(v) && norm(k) in rec.values) rec.values[norm(k)] = fullPath(v)
  ;(mod.items ?? []).forEach((it, i) => {
    for (const [k, v] of Object.entries(it))
      if (isImg(v) && rec.values.items?.[i] && norm(k) in rec.values.items[i]) rec.values.items[i][norm(k)] = fullPath(v)
  })
}

// the section's own heading block and bottom button: module parameters the model drops (`main-section`, `bottom-desc`, `title-btn`, `link-btn`)
{
  const menuPath = (link) => {
    const id = /Itemid=(\d+)/.exec(link ?? '')?.[1]
    const row = inventory.menu.find((m) => m.id === id)
    if (!row) return ''
    const p = `/${row.path}`
    return { '/about-us-2': '/about', '/about-us-2/contact': '/contact', '/about-us-2/career': '/career' }[p] ?? p
  }
  for (const [slug, info] of Object.entries(sectionInfo)) {
    if (info.type === 'hero') continue
    const p = JSON.parse(inventory.modules.find((m) => String(m.id) === info.module).params)
    const vals = {
      main_title: String(p['main-section'] ?? ''),
      bottom_desc: String(p['bottom-desc'] ?? ''),
      bottom_btn_title: String(p['title-btn'] ?? ''),
      bottom_btn_link: p['title-btn'] ? menuPath(p['link-btn']) : '',
      bottom_btn_type: p['title-btn'] ? String(p['type-btn'] ?? 'primary') : ''
    }
    const type = model.types.find((t) => t.name === info.type)
    for (const name of Object.keys(vals)) if (!type.fields.some((f) => f.name === name)) type.fields.push({ name, type: 'text' })
    Object.assign(model.records.find((r) => r.type === info.type && r.slug === slug).values, vals)
  }
}

// ---- page layout: which sections a page prints, in the order of its positions. 131 (CTA) and 136 (copyright) are on every page: chrome.
const DYN = {
  117: 'latest-news',
  118: 'search',
  120: 'popular-tags',
  128: 'news-band',
  129: 'category-tabs',
  113: 'related-posts',
  138: 'recent-work',
  149: 'related-posts',
  146: 'service-menu'
}
const pages = {}
for (const pg of pageMap.pages) {
  const list = []
  for (const s of pg.sections)
    for (const id of s.modules.map(String)) {
      if (id === '131' || id === '136') continue
      if (NAME[id]) list.push({ section: NAME[id] })
      else if (DYN[id]) list.push({ dynamic: DYN[id] })
    }
  const RENAME = { '/about-us-2': '/about', '/about-us-2/contact': '/contact', '/about-us-2/career': '/career', '/category-blog': '/blog' }
  pages[RENAME[pg.path] ?? pg.path] = list
}
writeFileSync(new URL('../src/lib/page-layout.json', import.meta.url), JSON.stringify({ sections: sectionInfo, pages }, null, 2) + '\n')

// ---- pages kept (DECISIONS D8): the ported set
const SERVICE_SLUGS = ['illustration', 'development', 'mobile-application', 'cloud-solutions', 'it-infrastructure', 'cybersecurity', 'virtualization']
const KEEP = new Set(['home', 'about-us-2', 'contact', 'career', 'project', 'services', ...SERVICE_SLUGS])
model.records = model.records.filter((r) => r.type !== 'pages' || KEEP.has(r.slug))
for (const r of model.records.filter((x) => x.type === 'pages')) {
  if (r.slug === 'about-us-2') r.slug = 'about'
  r.values.view = r.slug === 'home' ? 'home' : SERVICE_SLUGS.includes(r.slug) ? 'service' : (r.slug === 'about' || r.slug === 'project' || r.slug === 'services' || r.slug === 'career' || r.slug === 'contact') ? r.slug : 'page'
}
// the article behind each service menu item is the page's text and banner picture
const rowOf = (alias) => inventory.content.find((c) => c.alias === alias)
const imgOf = (row, key) => String(JSON.parse(row.images || '{}')[key] ?? '').split('#')[0]
const pageType = model.types.find((t) => t.name === 'pages')
for (const f of ['banner', 'summary', 'sub_title']) if (!pageType.fields.some((x) => x.name === f)) pageType.fields.push({ name: f, type: f === 'banner' ? 'image' : 'text' })
for (const slug of SERVICE_SLUGS) {
  const rec = model.records.find((r) => r.type === 'pages' && r.slug === slug)
  const row = rowOf(slug)
  Object.assign(rec.values, { body: `${row.introtext}\n${row.fulltext}`, banner: imgOf(row, 'image_fulltext') || imgOf(row, 'image_intro') })
}
// the blog gets a page record of its own, so a customer can hide it from the header
model.records.push({ type: 'pages', slug: 'blog', locale: 'en', status: 'published', values: { title: 'Blog', body: '', view: 'blog' } })

// ---- posts: the two articles that are menu items (5 = blog detail demo, 42 = project detail demo) are posts too
const postType = model.types.find((t) => t.name === 'posts')
for (const f of postType.fields) if (['title', 'excerpt', 'body'].includes(f.name)) f.searchable = true
const extra = [
  ['created', 'date'], ['author', 'text'], ['author_avatar', 'image'], ['tags', 'text'], ['hits', 'text'], ['kind', 'text'],
  ['banner', 'image'], ['project_client', 'text'], ['project_budget', 'text'], ['project_client_name', 'text'], ['project_services', 'text'],
  ['project_date', 'text'], ['project_link', 'text'], ['sort', 'text']
]
for (const [name, type] of extra) if (!postType.fields.some((f) => f.name === name)) postType.fields.push({ name, type })
const slugOfModel = (alias) => alias.replace(/[^a-z0-9]+/g, '-')
const post = (alias) => model.records.find((r) => r.type === 'posts' && (r.slug === alias || r.slug === slugOfModel(alias)))
const catAlias = { 8: 'blog', 10: 'branding', 11: 'ui-ux-design', 12: 'illustration' }
for (const id of ['5', '42']) {
  const row = inventory.content.find((c) => c.id === id)
  if (post(row.alias)) continue
  model.records.push({
    type: 'posts',
    slug: row.alias,
    locale: 'en',
    status: 'published',
    terms: { category: [catAlias[row.catid] ?? 'blog'] },
    values: { title: decode(row.title), excerpt: '', body: '', date: row.publish_up, cover: '' }
  })
}
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
const rows = new Map(inventory.content.map((c) => [c.id, c]))
for (const r of model.records.filter((x) => x.type === 'posts')) {
  const cj0 = content.posts.find((p) => p.slug === r.slug)
  const row = cj0 ? rows.get(String(cj0.joomla.articleId)) : inventory.content.find((c) => c.alias === r.slug)
  if (!row) throw new Error(`no article for post ${r.slug}`)
  const f = Object.fromEntries(
    inventory.fields_values?.filter?.((v) => v.item_id === row.id).map((v) => [v.field_id, v.value]) ?? []
  )
  const cj = content.posts.find((p) => String(p.joomla?.articleId) === row.id)
  const fields = cj?.joomla?.fields ?? f
  const u = byId[row.created_by]
  Object.assign(r.values, {
    body: `${row.introtext}\n${row.fulltext}`,
    cover: imgOf(row, 'image_intro'),
    banner: imgOf(row, 'image_fulltext'),
    created: row.created,
    author: u?.name ?? '',
    author_avatar: avatar(row.created_by),
    tags: tagsOf(row.id),
    hits: String(row.hits ?? ''),
    kind: /project/.test(row.attribs) ? 'project' : 'article',
    project_client: fields['prj-client'] ?? '',
    project_budget: fields['prj-budget'] ?? '',
    project_client_name: (fields['prj-client-name'] ?? '').trim(),
    project_services: fields['prj-services'] ?? '',
    project_date: fields['prj-date'] ?? '',
    project_link: fields['prj-completed'] ?? '',
    sort: String(row.ordering ?? '').padStart(4, '0')
  })
}
{
  const posts = model.records.filter((r) => r.type === 'posts').sort((a, b) => String(b.values.date).localeCompare(String(a.values.date)))
  model.records = [...model.records.filter((r) => r.type !== 'posts'), ...posts]
}
// routes: the pages, the blog at /blog, the project lists, every post under its list (D8 drops the Joomla system pages)
const KEEP_PATHS = new Set(['/', '/about-us-2', '/about-us-2/contact', '/about-us-2/career', '/project', '/services', ...SERVICE_SLUGS.map((s) => `/${s}`)])
model.routes = [
  ...model.routes
    .filter((r) => r.kind === 'page' && KEEP_PATHS.has(r.path))
    .map((r) => (r.path === '/about-us-2' ? { ...r, path: '/about' } : r.path === '/about-us-2/contact' ? { ...r, path: '/contact' } : r.path === '/about-us-2/career' ? { ...r, path: '/career' } : r)),
  { path: '/blog', kind: 'list', type: 'posts' },
  { path: '/project/branding', kind: 'list', type: 'posts' },
  { path: '/project/ui-ux-design', kind: 'list', type: 'posts' },
  { path: '/project/illustration', kind: 'list', type: 'posts' }
]
for (const r of model.records.filter((x) => x.type === 'posts')) {
  const cat = r.terms?.category?.[0]
  const base = cat === 'blog' || !cat ? '/blog' : `/project/${cat}`
  model.routes.push({ path: `${base}/${r.slug}`, kind: 'detail', type: 'posts', slug: r.slug })
}

// ---- menus: the header menu is `primary`; the services menu is the side menu of the service pages; the three demo footer
// menus (Users, J!Pages, J! Content) link Joomla system pages that are not ported, so the footer columns are rebuilt (D11).
const ren = { '/about-us-2': '/about', '/about-us-2/contact': '/contact', '/about-us-2/career': '/career' }
const fixItem = ({ children, ...it }) => ({ ...it, path: ren[it.path] ?? it.path, ...(children ? { children: children.map(fixItem) } : {}) })
const main = model.menus.find((m) => m.name === 'mainmenu')
const services = model.menus.find((m) => m.name === 'services')
const mk = (name, label, items) => ({ name, label: { en: label }, items })
const leaf = (label, path) => ({ label: { en: label }, path })
model.menus = [
  { ...main, name: 'primary', label: { en: 'Primary' }, items: main.items.map(fixItem) },
  { ...services, name: 'services', label: { en: 'Services' }, items: services.items.map(fixItem) },
  mk('footer-company', 'Company', [leaf('About Us', '/about'), leaf('Career', '/career'), leaf('Contact', '/contact')]),
  mk('footer-work', 'Work', [leaf('Blog', '/blog'), leaf('Branding', '/project/branding'), leaf('UI/UX design', '/project/ui-ux-design'), leaf('Illustration', '/project/illustration')])
]
// the project detail menu item points at a project post
const pd = main.items.flatMap((i) => i.children ?? []).find((c) => c.path === '/project/project-detail')
if (pd) {
  const pm = model.menus[0].items.find((i) => i.path === '/project')
  const it = pm.children.find((c) => c.label.en === 'Project Detail')
  if (it) it.path = '/project/illustration/brochure-flyer-design'
}

// ---- site chrome: header contact row, footer text, copyright, the words the template prints itself
const mod = (slug) => model.records.find((r) => r.type === 'modules' && r.slug === slug)?.values ?? {}
const lines = (h) =>
  decode(stripTags(String(h ?? '').replace(/<br\s*\/?>/gi, '\n')))
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
const qc = mod('quick-contact').content ?? ''
const phone = /tel:([^"']+)/.exec(qc)?.[1] ?? ''
const email = /mailto:([^"']+)/.exec(qc)?.[1] ?? ''
const footerLines = lines(mod('footer-info').content)
model.types.push({
  name: 'chrome',
  mode: 'single',
  label: { en: 'Site chrome' },
  fields: [
    'title', 'brand_name', 'header_phone', 'header_email', 'footer_about', 'footer_company_title', 'footer_work_title',
    'footer_services_title', 'copyright', 'skip_label', 'menu_label', 'close_label', 'prev_label', 'next_label', 'more_label',
    'read_more', 'by_label', 'tags_label', 'share_label', 'not_found_code', 'not_found_title', 'not_found_text', 'not_found_back_label',
    'search_label', 'search_placeholder', 'search_button', 'no_results', 'theme_toggle_label', 'breadcrumb_home',
    'categories_all_label', 'client_label', 'services_label', 'date_label', 'completed_label', 'see_live_label', 'budget_label',
    'client_name_label', 'recent_work_title', 'related_title', 'latest_news_title', 'popular_tags_title', 'service_menu_title',
    'follow_label', 'subscribe_label'
  ]
    .map((name) => ({ name, ...text }))
    .concat([{ name: 'logo_dark', type: 'image' }, { name: 'social_items', type: 'text' }])
})
model.records.push({
  type: 'chrome',
  slug: 'chrome',
  locale: 'en',
  status: 'published',
  values: {
    title: 'Site chrome',
    brand_name: 'JA Nova',
    header_phone: phone,
    header_email: email,
    footer_about: footerLines.join(' '),
    footer_company_title: 'Company',
    footer_work_title: 'Work',
    footer_services_title: 'Services',
    copyright: 'Copyright © {year} {name}. All Rights Reserved.',
    skip_label: 'Skip to content',
    menu_label: 'Menu',
    close_label: 'Close',
    prev_label: 'Prev',
    next_label: 'Next',
    more_label: 'More Articles …',
    read_more: 'Read more',
    by_label: 'By',
    tags_label: 'Tags:',
    share_label: 'Share this story',
    not_found_code: '404',
    not_found_title: 'Page not found',
    not_found_text: 'An error has occurred while processing your request.',
    not_found_back_label: 'Home Page',
    search_label: 'Search',
    search_placeholder: 'Search …',
    search_button: 'Search',
    no_results: 'No results found.',
    theme_toggle_label: 'Toggle light and dark mode',
    breadcrumb_home: 'Home',
    categories_all_label: 'All',
    client_label: 'Client',
    services_label: 'Services',
    date_label: 'Date',
    completed_label: 'Completed',
    see_live_label: 'See live',
    budget_label: 'Budget',
    client_name_label: 'Client name',
    recent_work_title: 'Check some of recent work',
    related_title: 'Related Posts',
    latest_news_title: 'Latest news from us',
    popular_tags_title: 'Tags Popular',
    service_menu_title: 'Service Category',
    follow_label: 'Follow us:'
  }
})
// words the components print (accessible names, button labels, messages): one file per author in ingest/words/*.json, `{ "field_name": "English words" }`
{
  const chromeType = model.types.find((t) => t.name === 'chrome')
  const chromeRec = model.records.find((r) => r.type === 'chrome')
  for (const f of readdirSync(new URL('./words/', import.meta.url)).filter((n) => n.endsWith('.json')).sort())
    for (const [name, value] of Object.entries(JSON.parse(readFileSync(new URL(`./words/${f}`, import.meta.url), 'utf8')))) {
      if (!chromeType.fields.some((x) => x.name === name)) chromeType.fields.push({ name, ...text })
      chromeRec.values[name] = value
    }
}
model.records = model.records.filter((r) => r.type !== 'modules')
model.types = model.types.filter((t) => t.name !== 'modules')

// ---- the contact record and the words of its form
{
  const c = inventory.contact_details[0]
  model.types.push({
    name: 'contact',
    mode: 'single',
    label: { en: 'Contact' },
    fields: [
      'title', 'address_label', 'address', 'phone_label', 'phone', 'email_label', 'email', 'heading', 'intro', 'follow_label',
      'name_label', 'email_field_label', 'phone_field_label', 'subject_label', 'message_label', 'submit_label', 'banner', 'socials', 'form_id'
    ].map((name) => ({ name, ...text })).map((f) => (f.name === 'banner' ? { name: 'banner', type: 'image' } : f))
  })
  model.records.push({
    type: 'contact',
    slug: 'contact-layout',
    locale: 'en',
    status: 'published',
    values: {
      title: 'Contact',
      address_label: 'Address',
      address: c.address,
      phone_label: 'Phone',
      phone: c.telephone || c.mobile,
      email_label: 'Email',
      email: email || c.email_to,
      heading: "We'd love to hear\nfrom you",
      intro: decode(c.misc).trim(),
      follow_label: 'Follow us:',
      name_label: 'Full name',
      email_field_label: 'Your email',
      phone_field_label: 'Your phone',
      subject_label: 'Your subject',
      message_label: 'Message',
      submit_label: 'Send your request',
      banner: String(c.image ?? '').split('#')[0],
      socials: '',
      form_id: ''
    }
  })
}
model.media = []
model.site = { ...model.site, title: { en: 'JA Nova' }, tagline: { en: '' } }

// ---- links the model keeps at the Joomla paths of the ported pages
{
  const MOVED = { '/about-us-2/contact': '/contact', '/about-us-2/career': '/career', '/about-us-2': '/about', '/category-blog': '/blog' }
  const walk = (v, set) => {
    if (typeof v === 'string') return MOVED[v] ?? v
    if (Array.isArray(v)) return v.map((x) => walk(x))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  for (const r of model.records) if (r.type !== 'posts' && r.type !== 'pages') r.values = walk(r.values)
}

// ---- a scalar field that arrives as a list holds the first non-empty value
for (const r of model.records) {
  const type = model.types.find((t) => t.name === r.type)
  for (const f of type.fields) if (f.type !== 'group' && Array.isArray(r.values[f.name])) r.values[f.name] = r.values[f.name].find((v) => v) ?? ''
}
console.log(`shape-model: ${before} -> ${model.records.length} records, menus: ${model.menus.map((m) => m.name)}`)
writeFileSync(file, JSON.stringify(model, null, 2) + '\n')
