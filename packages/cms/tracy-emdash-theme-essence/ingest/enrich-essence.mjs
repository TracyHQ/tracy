#!/usr/bin/env node
// Shapes the adapter's site-model.json into this template's content model (DECISIONS D8, D10-D14): what the
// design needs and the model drops (author, hits, tags, pictures, article kind, home placement), the ported pages
// and menus, the site chrome and the words the source prints, and the routes. Runs on a fresh copy of the model.
//   node ingest/enrich-essence.mjs <seed/site-model.json> <spec/content.json> <j6/inventory.json> <webroot>
// Nothing is invented: every value is read from the three inputs, or is a word the source prints (read from the
// rendered pages and the template's language files). The pictures are cited by their path under `images/`.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dedupeSlugs } from './dedupe-slugs.mjs'

const [modelFile, contentFile, inventoryFile, webroot] = process.argv.slice(2)
if (!modelFile || !contentFile || !inventoryFile || !webroot) {
  console.error('usage: enrich-essence.mjs <site-model.json> <content.json> <inventory.json> <webroot>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const content = JSON.parse(readFileSync(contentFile, 'utf8'))
const inv = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const locale = model.locales.default
const label = (text) => ({ [locale]: text })
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** `images/a/b.jpg#joomlaImage://…?width=1` → `images/a/b.jpg`; '' when there is none. */
const imagePath = (v) => String(v ?? '').split('#')[0].replace(/^\//, '')
const exists = (rel) => rel && existsSync(path.join(webroot, rel))

// ── posts ─────────────────────────────────────────────────────────────────────────────────────────
const MAIN_CATEGORIES = ['blog-health', 'blog-design', 'blog-fashion'] // Joomla categories 9, 10, 11
const articleById = new Map(inv.content.map((a) => [a.id, a]))
const authorsById = new Map(content.authors.map((a) => [a.id, a]))
// the model names a post by its WordPress-style slug; the content row also keeps the Joomla alias
const bySlug = new Map()
for (const p of content.posts) for (const k of [p.slug, p.joomla.alias]) bySlug.set(`${k}|${p.category}`, p)
const youtube = new Set(['youtube'])
const tagSet = new Map()
const usedCategories = new Set()
const used = (rel) => {
  if (rel && !exists(rel)) throw new Error(`picture missing in the webroot: ${rel}`)
  return rel
}
const media = (obj) => {
  const rows = obj?.src ? (Array.isArray(obj.src) ? obj.src : Object.values(obj.src)) : []
  return rows.map(imagePath).filter(Boolean).map((p) => ({ image: used(p) }))
}
// The adapter makes a page of every article a menu item points at (here the five "Detail" demos: the three article
// layouts, the video and the gallery article) and leaves it with no text. They are posts of this template: their
// layout, video and gallery fields are what the Detail demos show.
const CATEGORY_OF = { 9: 'blog-health', 10: 'blog-design', 11: 'blog-fashion' }
const tagTitle = new Map(inv.tags.map((t) => [t.id, t.title]))
const frontOrder = new Map(inv.content_frontpage.map((x) => [x.content_id, Number(x.ordering)]))
const plain = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
for (const page of content.pages.filter((p) => ['11', '12', '13', '14', '23'].includes(p.joomla?.articleId))) {
  const art = articleById.get(page.joomla.articleId)
  const cat = CATEGORY_OF[art.catid]
  const tags = inv.contentitem_tag_map
    .filter((m) => m.type_alias === 'com_content.article' && m.content_item_id === art.id)
    .map((m) => tagTitle.get(m.tag_id))
    .filter(Boolean)
  const row = {
    slug: art.alias,
    category: cat,
    excerpt: plain(art.introtext),
    modified: art.modified,
    tags,
    sticky: art.featured === '1',
    author: { id: `joomla-user-${art.created_by}` },
    joomla: { articleId: art.id, alias: art.alias, hits: Number(art.hits), featuredOrdering: frontOrder.get(art.id) ?? 0 }
  }
  bySlug.set(`${art.alias}|${cat}`, row)
  model.records.push({
    type: 'posts',
    slug: art.alias,
    locale,
    status: 'published',
    terms: { category: [cat] },
    values: { title: art.title, date: art.created, body: `${art.introtext}\n${art.fulltext}`.trim() }
  })
}
for (const r of model.records.filter((x) => x.type === 'posts')) {
  const cat = (r.terms?.category ?? [])[0]
  const src = bySlug.get(`${r.slug}|${cat}`)
  if (!src) throw new Error(`no content row for post ${r.slug} (${cat})`)
  const art = articleById.get(src.joomla.articleId)
  const images = JSON.parse(art.images || '{}')
  const attribs = JSON.parse(art.attribs || '{}')
  const intro = imagePath(images.image_intro)
  const full = imagePath(images.image_fulltext)
  usedCategories.add(cat)
  const kind = attribs.ctm_content_type === 'video' || attribs.ctm_content_type === 'gallery' ? attribs.ctm_content_type : 'standard'
  const v = r.values
  v.excerpt = src.excerpt ? `<p>${esc(src.excerpt)}</p>` : ''
  v.modified = src.modified
  v.cover = used(intro || full)
  v.hero = used(full || intro)
  v.author = slugify(authorsById.get(src.author.id)?.name ?? '')
  v.hits = src.joomla.hits
  v.featured = Boolean(src.sticky) && MAIN_CATEGORIES.includes(cat)
  v.featured_order = v.featured ? Number(src.joomla.featuredOrdering) : 0
  v.home_lead = false
  v.kind = kind
  v.layout = (attribs.article_layout ?? '').replace(/^.*:/, '').replace(/^default$/, '') || 'default'
  v.video_source = kind === 'video' && youtube.has(attribs.ctm_source) ? attribs.ctm_source : ''
  v.video_id = kind === 'video' ? attribs.ctm_embed_url : ''
  v.gallery = kind === 'gallery' ? media(attribs.ctm_gallery) : []
  r.terms = { category: [cat], tag: src.tags.map(slugify) }
  for (const t of src.tags) tagSet.set(slugify(t), t)
  // The body cites pictures by bare file name; `data-path` carries the folder.
  v.body = v.body.replace(/src="([^"]+)"([^>]*?)data-path="local-images:\/([^"]+)"/g, (m, _src, mid, p) =>
    `src="${used(`images/${p}`)}"${mid}data-path="local-images:/${p}"`
  )
}
// Home: the featured posts of the three main categories; the top strip is the six first titles of those
// categories (the source's "Features Lead" modules sort by title).
for (const r of model.records
  .filter((x) => x.type === 'posts' && MAIN_CATEGORIES.includes(x.terms.category[0]))
  .sort((a, b) => a.values.title.localeCompare(b.values.title))
  .slice(0, 6))
  r.values.home_lead = true

dedupeSlugs(model)

const field = (name, type, extra = {}) => ({ name, type, ...extra })
const setType = (t) => {
  const i = model.types.findIndex((x) => x.name === t.name)
  if (i >= 0) model.types.splice(i, 1, t)
  else model.types.push(t)
}
const dropType = (name) => {
  model.types = model.types.filter((t) => t.name !== name)
  model.records = model.records.filter((r) => r.type !== name)
}
const rec = (type, slug, values, extra = {}) =>
  model.records.push({ type, slug, locale, status: 'published', values, ...extra })

setType({
  name: 'posts',
  mode: 'list',
  label: label('Posts'),
  fields: [
    // the words of a post are what the search index holds; without a `searchable` field the CMS refuses to build it
    field('title', 'text', { searchable: true }),
    field('excerpt', 'prose', { searchable: true }),
    field('body', 'prose', { searchable: true }),
    field('date', 'date'),
    field('modified', 'date'),
    field('cover', 'image'),
    field('hero', 'image'),
    field('author', 'text'),
    field('hits', 'number'),
    field('featured', 'boolean'),
    field('featured_order', 'number'),
    field('home_lead', 'boolean'),
    field('kind', 'text'),
    field('layout', 'text'),
    field('video_source', 'text'),
    field('video_id', 'text'),
    field('gallery', 'group', { fields: [field('image', 'image')] })
  ]
})

// ── authors ───────────────────────────────────────────────────────────────────────────────────────
setType({
  name: 'authors',
  mode: 'list',
  label: label('Authors'),
  fields: [field('name', 'text'), field('avatar', 'image'), field('job_title', 'text'), field('bio', 'text')]
})
for (const a of content.authors)
  rec('authors', slugify(a.name), {
    name: a.name,
    avatar: used(imagePath(a.avatar)),
    job_title: a.jobTitle,
    bio: a.description
  })

// ── taxonomies ────────────────────────────────────────────────────────────────────────────────────
const cats = model.taxonomies.find((t) => t.name === 'category')
cats.terms = cats.terms.filter((t) => usedCategories.has(t.slug))
model.taxonomies.push({
  name: 'tag',
  label: label('Tags'),
  hierarchical: false,
  appliesTo: ['posts'],
  terms: [...tagSet].map(([slug, title]) => ({ slug, label: label(title) }))
})

// ── category pages: description, picture and list style (the menu params of the source) ───────────────
const CATEGORY_ROW = {
  'blog-health': { id: '9', style: 'grid' },
  'blog-design': { id: '10', style: 'stack' },
  'blog-fashion': { id: '11', style: 'grid' },
  'blog-normal-health': { id: '13', style: 'sidebar' },
  'blog-normal-design': { id: '14', style: 'sidebar' },
  'blog-normal-fashion': { id: '15', style: 'sidebar' },
  resources: { id: '16', style: 'grid' },
  'resources-2': { id: '17', style: 'grid' }
}
setType({
  name: 'category_info',
  mode: 'list',
  label: label('Category pages'),
  fields: [field('title', 'text'), field('description', 'text'), field('image', 'image'), field('list_style', 'text')]
})
for (const [slug, row] of Object.entries(CATEGORY_ROW)) {
  if (!usedCategories.has(slug)) continue
  const c = inv.categories.find((x) => x.id === row.id)
  const text = String(c.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const img = imagePath(JSON.parse(c.params || '{}').image)
  rec('category_info', slug, { title: c.title, description: text, image: img ? used(img) : '', list_style: row.style })
}

// ── pages ─────────────────────────────────────────────────────────────────────────────────────────
dropType('modules')
const KEEP = new Set(['home-3'])
model.records = model.records.filter((r) => r.type !== 'pages' || KEEP.has(r.slug))
const home = model.records.find((r) => r.type === 'pages' && r.slug === 'home-3')
home.slug = 'home'
home.values = { title: 'Home', body: '', view: 'home' }
rec('pages', 'our-authors', { title: 'Authors', body: '', view: 'authors' })
rec('pages', 'contact', { title: 'Contact', body: '', view: 'contact' })

// ── contact page (a singleton named so Tracy's page rule does not count it as a second `contact` page) ─
setType({
  name: 'contact',
  mode: 'single',
  label: label('Contact page'),
  fields: [
    field('title', 'text'),
    field('intro', 'text'),
    field('name_label', 'text'),
    field('email_label', 'text'),
    field('subject_label', 'text'),
    field('message_label', 'text'),
    field('copy_label', 'text'),
    field('send_label', 'text'),
    field('form_id', 'text')
  ]
})
rec('contact', 'contact-layout', {
  title: 'We’d love to hear from you',
  intro:
    'It’s remarkable to watch a five-year-old draw, void of any anxiety about what the world will think. We all start our lives creatively confident, happy to create and share our work with pride. And then, as we age, our comfort with creative expression declines.',
  name_label: 'Name',
  email_label: 'Email',
  subject_label: 'Subject',
  message_label: 'Your message',
  copy_label: 'Send a copy to yourself',
  send_label: 'Send message',
  form_id: ''
})

// ── chrome: brand, header and footer, the newsletter box and the words the design prints ──────────────
const footerLogo = used('images/joomlart/logo/item-1.png')
setType({
  name: 'chrome',
  mode: 'single',
  label: label('Site chrome'),
  fields: [
    field('brand_name', 'text'),
    field('logo_dark', 'image'),
    field('skip_label', 'text'),
    field('menu_label', 'text'),
    field('theme_label', 'text'),
    field('search_label', 'text'),
    field('subscribe_label', 'text'),
    field('subscribe_link', 'text'),
    field('footer_logo', 'image'),
    field('footer_text', 'text'),
    field('footer_cta_label', 'text'),
    field('footer_cta_text', 'text'),
    field('copyright', 'text'),
    field('newsletter_title', 'text'),
    field('newsletter_text', 'text'),
    field('newsletter_email', 'text'),
    field('newsletter_button', 'text'),
    field('newsletter_terms', 'text'),
    field('form_id', 'text'),
    field('latest_title', 'text'),
    field('features_title', 'text'),
    field('tags_title', 'text'),
    field('follow_title', 'text'),
    field('more_read_title', 'text'),
    field('author_articles_title', 'text'),
    field('written_by', 'text'),
    field('share_label', 'text'),
    field('tags_in_label', 'text'),
    field('read_more', 'text'),
    field('prev_label', 'text'),
    field('next_label', 'text'),
    field('by_label', 'text'),
    field('hits_label', 'text'),
    field('search_placeholder', 'text'),
    field('articles_label', 'text')
  ]
})
rec('chrome', 'chrome', {
  brand_name: 'JA Essence',
  logo_dark: '',
  skip_label: 'Skip to content',
  menu_label: 'Menu',
  theme_label: 'Toggle dark mode',
  search_label: 'Search',
  subscribe_label: 'Subscribe',
  subscribe_link: '/contact',
  footer_logo: footerLogo,
  footer_text: 'A super modern theme following the latest trends with premium membership',
  footer_cta_label: 'Become a subscriber',
  footer_cta_text: 'Get all the latest posts delivered straight to inbox.',
  copyright: 'Copyright © {year} {name}. All Rights Reserved.',
  newsletter_title: 'Newsletter',
  newsletter_text: 'Join 70,000 subscribers!',
  newsletter_email: 'Email',
  newsletter_button: 'Sign up',
  newsletter_terms: 'I agree with the Terms and conditions and the Privacy policy',
  form_id: '',
  latest_title: 'Articles - Latest',
  features_title: 'Features post',
  tags_title: 'Tags cloud',
  follow_title: 'Follow me',
  more_read_title: 'More Read',
  author_articles_title: 'Author’s latest articles',
  written_by: 'Written by',
  share_label: 'Share article:',
  tags_in_label: 'Tags in:',
  read_more: 'Read more ...',
  prev_label: 'Prev',
  next_label: 'Next',
  by_label: 'By',
  hits_label: 'Hits',
  search_placeholder: 'Search',
  articles_label: 'Articles'
})

// ── gallery strip and social buttons: pictures by their folder ───────────────────────────────────────
// `gallery-140` and `follow-me-143` are the copies the Home 5 demo uses (DECISIONS D8)
model.records = model.records.filter((r) => !(r.type === 'gallery' && r.slug === 'gallery-140') && !(r.type === 'social' && r.slug === 'follow-me-143'))
const galleryDir = 'images/joomlart/gallery'
const galleryFiles = new Set(readdirSync(path.join(webroot, galleryDir)))
for (const r of model.records.filter((x) => x.type === 'gallery'))
  for (const it of r.values.items) {
    if (!it.gallery_image) continue
    const file = path.basename(it.gallery_image)
    if (!galleryFiles.has(file)) throw new Error(`gallery picture missing: ${file}`)
    it.gallery_image = `${galleryDir}/${file}`
  }
model.media = []

// ── menus and routes ──────────────────────────────────────────────────────────────────────────────
const CATEGORY_MENU = [
  ['Health', 'blog-health'],
  ['Design', 'blog-design'],
  ['Fashion', 'blog-fashion'],
  ['Resources', 'resources'],
  ['Lifestyle', 'resources-2']
]
const catItem = ([text, slug]) => ({ label: label(text), path: `/category/${slug}` })
model.menus = [
  {
    name: 'primary',
    label: label('Primary'),
    items: [
      { label: label('Home'), path: '/' },
      { label: label('Categories'), path: '', kind: 'heading', children: CATEGORY_MENU.map(catItem) },
      { label: label('Authors'), path: '/our-authors' },
      { label: label('Contact'), path: '/contact' }
    ]
  },
  { name: 'footer', label: label('Footer'), items: CATEGORY_MENU.map(catItem) }
]
model.routes = [
  { path: '/', kind: 'page' },
  { path: '/our-authors', kind: 'page' },
  { path: '/contact', kind: 'page' },
  ...[...usedCategories].map((slug) => ({ path: `/category/${slug}`, kind: 'archive', type: 'posts' })),
  ...model.records
    .filter((r) => r.type === 'posts')
    .map((r) => ({ path: `/blog/${r.slug}`, kind: 'detail', type: 'posts', slug: r.slug }))
]
model.redirects = []

writeFileSync(modelFile, `${JSON.stringify(model, null, 2)}\n`)
const count = (t) => model.records.filter((r) => r.type === t).length
console.log(
  `enrich-essence: ${count('posts')} posts, ${count('authors')} authors, ${count('category_info')} category pages, ${tagSet.size} tags, ${model.routes.length} routes`
)
