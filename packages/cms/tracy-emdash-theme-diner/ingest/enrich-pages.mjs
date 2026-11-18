#!/usr/bin/env node
// P5 additions to site-model.json that the model of the source drops or that the template does not port. Runs after
// enrich-model.mjs.
//   node ingest/enrich-pages.mjs <spec/sections.json> <seed/site-model.json> <j6/inventory.json> <ingest/albums.json>
//
//  · NOT PORTED (DECISIONS D21): visitor accounts (login, registration, profile, reminder, reset), the typography demo
//    article, the offline and error demo pages, the four colour demos, and the menu groups that only held them. Their
//    pages, mastheads, routes and menu items leave the model.
//  · ADDED, each read from the source and nothing invented: `banner` (module 107, the sidebar offer), `category_info`
//    (title, description and picture of each blog category), `contact` (the Joomla contact record), `reservation` (the
//    "Phone Reservation" article, which is a layout, not prose), a default masthead, the History article, album photos.
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeWith, stripTags } from './text.mjs'

const [sectionsFile, modelFile, inventoryFile, albumsFile] = process.argv.slice(2)
if (!sectionsFile || !modelFile || !inventoryFile || !albumsFile) {
  console.error('usage: enrich-pages.mjs <sections.json> <site-model.json> <inventory.json> <albums.json>')
  process.exit(2)
}
const sections = JSON.parse(readFileSync(sectionsFile, 'utf8'))
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const inv = JSON.parse(readFileSync(inventoryFile, 'utf8'))
const albums = JSON.parse(readFileSync(albumsFile, 'utf8')).albums
const locale = model.locales.default
const decode = decodeWith({ '&amp;': '&', '&nbsp;': ' ', '&#039;': "'", '&#39;': "'", '&quot;': '"' })
const text = (html) =>
  decode(stripTags(String(html ?? '').replace(/<br\s*\/?>/gi, '\n'), ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
const kebab = (t) =>
  t
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const mod = (id) => sections.custom.find((m) => String(m.id) === String(id))?.html ?? ''
const addType = (t) => {
  model.types = model.types.filter((x) => x.name !== t.name)
  model.types.push(t)
  model.records = model.records.filter((r) => r.type !== t.name)
}
const rec = (type, slug, values) => model.records.push({ type, slug, locale, status: 'published', values })

// ── not ported ──────────────────────────────────────────────────────────────────────────────────────────────────
const DROP = [
  /^\/your-profile$/,
  /^\/explore\/j-pages\/(login|registration|user-profile|reminder|reset-password|category-blog)$/,
  /^\/explore\/bonus-pages(\/|$)/,
  /^\/explore\/themes(\/|$)/,
  /^\/explore$/,
  /^\/explore\/j-pages$/,
  /^\/contact$/
]
const dropped = (p) => DROP.some((re) => re.test(p))
const dropSlugs = new Set([
  'your-profile',
  'login',
  'registration',
  'user-profile',
  'reminder',
  'reset-password',
  'category-blog',
  'offline-page',
  'erro-page',
  'blue-color',
  'green-color',
  'pink-color',
  'purple-color',
  'explore',
  'j-pages',
  'bonus-pages',
  'themes',
  'contact'
])
model.routes = model.routes.filter((r) => !dropped(r.path))
model.records = model.records.filter(
  (r) => !((r.type === 'pages' || r.type === 'masthead') && dropSlugs.has(r.slug))
)
const prune = (items) =>
  items
    .filter(
      (i) =>
        !/^\/explore\/(bonus-pages|themes)/.test(i.path ?? '') &&
        !(i.label.en === 'Bonus Pages' || i.label.en === 'Themes')
    )
    .filter((i) => !dropped(i.path ?? '#') || (i.children?.length ?? 0) > 0 || !i.path)
    .map((i) => {
      const kids = i.children ? prune(i.children) : undefined
      const out = { ...i }
      if (kids) out.children = kids
      if (i.path && dropped(i.path)) out.path = ''
      return out
    })
    .filter((i) => i.path || (i.children?.length ?? 0) > 0)
for (const m of model.menus) m.items = prune(m.items)

// ── default masthead: module 99's own title and description, for pages with no entry of their own ───────────────────
const m99 = JSON.parse(inv.modules.find((m) => String(m.id) === '99').params)
rec('masthead', 'default', {
  title: m99['default-title'],
  description: m99['default-description'],
  // the template's own picture (public/brand/masthead-default.jpg) shows while this is empty
  background: ''
})

// ── banner (module 107) ──────────────────────────────────────────────────────────────────────────────────────────
{
  const html = mod(107)
  addType({
    name: 'banner',
    mode: 'single',
    label: { en: 'Sidebar banner' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'image', type: 'image' },
      { name: 'price', type: 'text' },
      { name: 'points', type: 'group', fields: [{ name: 'text', type: 'text' }] },
      { name: 'button_label', type: 'text' },
      { name: 'button_link', type: 'text' }
    ]
  })
  const a = html.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
  rec('banner', 'banner', {
    title: 'Sidebar banner',
    image: html.match(/<img src="([^"]+)"/)?.[1].replace(/^\//, '') ?? '',
    price: text(html.match(/class="price">([\s\S]*?)<\/div>/)?.[1] ?? ''),
    points: [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => ({ text: text(m[1]) })),
    button_label: text(a?.[2] ?? ''),
    button_link: (a?.[1] ?? '').replace(/^\/index\.php/, '')
  })
}

// ── category_info ────────────────────────────────────────────────────────────────────────────────────────────────
{
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
  // The two source descriptions are Latin placeholder text: real restaurant copy replaces them (kept in seed/seed.json too).
  const COPY = {
    'restaurant-news':
      'Restaurant openings, chef moves, awards and the food stories everyone is talking about this month.',
    'restaurant-guide': 'Where to eat now: reviews, tasting notes and neighbourhood picks from our critics.'
  }
  for (const c of inv.categories.filter((x) =>
    ['restaurant-business', 'restaurant-marketing', 'restaurant-news', 'restaurant-guide'].includes(x.alias)
  ))
    rec('category_info', c.alias, {
      title: c.title,
      description: COPY[c.alias] ?? text(c.description),
      image: (JSON.parse(c.params || '{}').image ?? '').replace(/^\//, '')
    })
}

// ── subscribe (module 147, the AcyMailing form printed under every page) ─────────────────────────────────────────────
{
  const m = sections.other.find((x) => String(x.id) === '147')
  addType({
    name: 'subscribe',
    mode: 'single',
    label: { en: 'Subscribe box' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'intro', type: 'text' },
      { name: 'placeholder', type: 'text' },
      { name: 'button', type: 'text' },
      { name: 'form_id', type: 'text' }
    ]
  })
  rec('subscribe', 'subscribe', {
    title: m.title,
    intro: m.params.introtext,
    // the field placeholder is the field's name in AcyMailing's markup
    placeholder: 'Email',
    button: m.params.subtext,
    form_id: ''
  })
}

// ── contact ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const c = inv.contact_details[0]
  addType({
    name: 'contact',
    mode: 'single',
    label: { en: 'Contact page' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'form_title', type: 'text' },
      { name: 'form_note', type: 'text' },
      { name: 'form_id', type: 'text' },
      { name: 'card_title', type: 'text' },
      { name: 'card_text', type: 'prose' },
      { name: 'details_title', type: 'text' },
      { name: 'image', type: 'image' },
      { name: 'address', type: 'text' },
      { name: 'phone', type: 'text' },
      { name: 'mobile', type: 'text' }
    ]
  })
  rec('contact', 'contact', {
    title: 'Contact',
    // Joomla's contact view words (language strings of the source)
    form_title: 'Contact Form',
    form_note: 'Send an Email. All fields with an asterisk (*) are required.',
    form_id: '',
    card_title: c.name,
    card_text: c.misc,
    details_title: 'Contact',
    image: c.image,
    address: c.address,
    phone: c.telephone,
    mobile: c.mobile
  })
}

// ── reservation: the Phone Reservation article is a layout (two picture rows and a call card) ─────────────────────
{
  const art = inv.content.find((r) => r.alias === 'phone-reservation')
  const html = (art.introtext ?? '') + (art.fulltext ?? '')
  addType({
    name: 'reservation',
    mode: 'single',
    label: { en: 'Phone reservation' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'intro', type: 'prose' },
      {
        name: 'blocks',
        type: 'group',
        fields: [
          { name: 'image', type: 'image' },
          { name: 'image_alt', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'text', type: 'text' },
          { name: 'points', type: 'text' },
          { name: 'button_label', type: 'text' },
          { name: 'button_link', type: 'text' }
        ]
      },
      { name: 'online_title', type: 'text' },
      { name: 'online_text', type: 'text' },
      { name: 'online_button', type: 'text' },
      { name: 'online_link', type: 'text' }
    ]
  })
  const head = html.match(/<h2>([\s\S]*?)<\/h2>\s*<span>([\s\S]*?)<\/span>/)
  const rows = [
    ...html.matchAll(/<div class="row">([\s\S]*?)<\/ul>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)
  ]
  const online = html.match(
    /class="online-reservation">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
  )
  rec('reservation', 'reservation', {
    title: text(head[1]),
    intro: `<p>${head[2]
      .replace(/<br\s*\/?>\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()}</p>`,
    blocks: rows.map((m) => ({
      image: m[1].match(/<img src="([^"]+)"/)[1],
      image_alt: decode(m[1].match(/alt="([^"]*)"/)?.[1] ?? ''),
      title: text(m[1].match(/<h3>([\s\S]*?)<\/h3>/)[1]),
      text: text(m[1].match(/<span>([\s\S]*?)<\/span>/)[1]),
      points: [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((l) => text(l[1])).join('\n'),
      button_label: text(m[3]),
      button_link: m[2].replace(/^\/index\.php/, '')
    })),
    online_title: text(online[1]),
    online_text: text(online[2]),
    online_button: text(online[4]),
    online_link: online[3]
  })
}

// ── pages: the History article (a picture, a heading, a short list) ─────────────────────────────────────────────────
{
  const pages = model.types.find((t) => t.name === 'pages')
  for (const f of [
    { name: 'image', type: 'image' },
    { name: 'caption', type: 'text' },
    { name: 'lead_title', type: 'text' },
    { name: 'lead_text', type: 'text' }
  ])
    if (!pages.fields.some((x) => x.name === f.name)) pages.fields.push(f)
  const art = inv.content.find((r) => r.alias === 'history')
  const html = (art.introtext ?? '') + (art.fulltext ?? '')
  const fig = html.match(/<figure>\s*<img src="([^"]+)"[^>]*>\s*<figcaption>([\s\S]*?)<\/figcaption>/)
  const col = html.match(/<div class="col-sm-8">([\s\S]*?)<\/div>\s*<\/div>\s*$/)?.[1] ?? ''
  const body = col
    // the "at a glance" lines carry an icon each; they become one list
    .replace(/<p>\s*<i class="fas[^"]*"><\/i>\s*([\s\S]*?)<\/p>/g, '<li>$1</li>')
    .replace(/((?:<li>[\s\S]*?<\/li>\s*)+)/, '<ul>$1</ul>')
    .replace(/<\/?i>/g, '')
  const rec2 = model.records.find((r) => r.type === 'pages' && r.slug === 'our-history')
  rec2.values.body = body.trim()
  rec2.values.image = fig?.[1] ?? ''
  rec2.values.caption = text(fig?.[2] ?? '')
  // module 130, "[Chefs] More Info": a line and a short text under the article
  const more = mod(130)
  rec2.values.lead_title = text(more.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '')
  rec2.values.lead_text = text(more.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '')
}

// ── posts: the blog's order. Joomla lists a blog by category order, then article order; articles that tie keep the order the
// source printed them in (read from its first blog page: 4 Habits, 8 trends, Starbucks…, Chipotle, GOP, How To Help, McDonald’s, Indies).
{
  const posts = model.types.find((t) => t.name === 'posts')
  if (!posts.fields.some((f) => f.name === 'list_order'))
    posts.fields.push({ name: 'list_order', type: 'number' })
  const lft = new Map(inv.categories.map((c) => [c.id, Number(c.lft)]))
  const seen = [
    '4-habits-that-can-improve-your-customer-service',
    '8-trends-trickling-down-to-mainstream-menus',
    'starbucks-brings-under-armour-exec-on-board',
    'chipotle-to-launch-burger-spinoff-this-fall',
    'how-the-gop-and-dems-differ-on-restaurant-issues',
    'how-to-help-your-chef-achieve-a-better-work-life-balance',
    'mcdonald-s-makes-clean-tweaks-to-some-menu-items',
    'indies-aren-t-sold-on-tech'
  ]
  const rows = inv.content
    .filter(
      (c) =>
        c.state === '1' &&
        lft.has(c.catid) &&
        model.records.some((r) => r.type === 'posts' && r.slug === kebab(c.title))
    )
    .sort(
      (a, b) =>
        lft.get(a.catid) - lft.get(b.catid) ||
        Number(a.ordering) - Number(b.ordering) ||
        (seen.indexOf(kebab(a.title)) + 1 || 99) - (seen.indexOf(kebab(b.title)) + 1 || 99) ||
        Number(a.id) - Number(b.id)
    )
  rows.forEach((c, i) => {
    const r = model.records.find((x) => x.type === 'posts' && x.slug === kebab(c.title))
    r.values.list_order = i + 1
  })
}

// ── search: the words of posts are what the search page looks through (pages answer no list of their own)
for (const [t, names] of [['posts', ['title', 'excerpt', 'body']]])
  for (const f of model.types.find((x) => x.name === t).fields)
    if (names.includes(f.name)) f.searchable = true

// ── posts: album photos and covers; the Chefs article's own text ────────────────────────────────────────────────────
{
  const posts = model.types.find((t) => t.name === 'posts')
  if (!posts.fields.some((f) => f.name === 'photos'))
    posts.fields.push({ name: 'photos', type: 'group', fields: [{ name: 'image', type: 'image' }] })
  for (const r of model.records.filter((x) => x.type === 'posts')) {
    const a = albums[r.slug]
    if (a) {
      r.values.cover = a.cover
      r.values.photos = a.photos.map((image) => ({ image }))
    }
    if (r.slug === 'chefs') {
      const art = inv.content.find((c) => kebab(c.title) === 'chefs')
      r.values.body = (art.introtext ?? '').trim()
      r.values.excerpt = ''
    }
  }
}

// ── the "Meet Our Team" button points at the team section of the same page, which the template calls #our-team ────────
for (const r of model.records)
  if (r.type === 'features_intro' && typeof r.values.description === 'string')
    r.values.description = r.values.description.replace('#Mod128', '#our-team')

writeFileSync(modelFile, JSON.stringify(model, null, 2) + '\n')
console.log(
  `enrich-pages: routes=${model.routes.length} records=${model.records.length} menu=${model.menus[0].items.length}`
)
