#!/usr/bin/env node
// normalize-joomla-model.mjs — what `from-joomla.mjs` emits → the site-model.json this template compiles.
//
//   node ingest/normalize-joomla-model.mjs --spec <spec-dir> --j6 <j6-dir> --out seed/site-model.json
//   exit 0 = written · 1 = something could not be traced to exactly one source row · 2 = usage
//
// Reads (all produced from the running quickstart, never edited by hand):
//   <spec>/site-model.json · <spec>/sections.json · <spec>/page-map.json   (from-joomla.mjs)
//   <j6>/inventory.json                                                   (joomla-dump.mjs)
//   <j6>/extra.json                                                       (ingest/joomla-extra.mjs)
//
// What it settles, each one a decision in tasks/emdash-ja-kinetic/DECISIONS.md:
//   D3  posts sharing a title-derived slug take their own Joomla alias
//   D7  pages carry their URL `path`, colour `style` and the ordered `sections` they show
//   D8  the five com_users pages and the four synthetic WordPress parent pages are not pages here
//   D9  posts carry author, author role, featured flag and tags — the byline and tag archive the
//       source renders, which the adapter does not read
//   D10 section images are image fields (avatars, integration icons, bento tile, the per-direction
//       hero and query panels that the template's own layouts fall back to)
// Anything that does not match exactly one source row stops the run: a wrong match would put a
// byline, an avatar or a section on the wrong record without any error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const specDir = flag('--spec')
const j6Dir = flag('--j6')
const outPath = flag('--out')
if (!specDir || !j6Dir || !outPath) {
  console.error('usage: normalize-joomla-model.mjs --spec <spec-dir> --j6 <j6-dir> --out <site-model.json>')
  process.exit(2)
}
const read = (dir, name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
const model = read(specDir, 'site-model.json')
const sections = read(specDir, 'sections.json')
const pageMap = read(specDir, 'page-map.json')
const inventory = read(j6Dir, 'inventory.json')
const extra = read(j6Dir, 'extra.json')
const locale = model.locales.default
const notes = []

function fail(message) {
  console.error(message)
  process.exit(1)
}
// Same slug rule as the adapter (vendor/wordpress/…/ingest/site-model.mjs), so section records resolve.
const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item'
const key = (s) => slug(s).replace(/-/g, '_')
const basename = (src) => (src ? path.basename(String(src).split('?')[0].split('#')[0]) : '')
const typeOf = (name) => model.types.find((t) => t.name === name) ?? fail(`no type ${name} in the model`)
const recordsOf = (name) => model.records.filter((r) => r.type === name)
const addField = (typeName, field) => {
  const type = typeOf(typeName)
  if (!type.fields.some((f) => f.name === field.name)) type.fields.push(field)
}
const media = new Map(model.media.map((m) => [m.file, m]))
const useMedia = (file, usedBy, alt) => {
  if (!file) return
  const entry = media.get(file) ?? { file, alt: {}, usedBy: [] }
  if (alt && !entry.alt[locale]) entry.alt[locale] = alt
  if (!entry.usedBy.includes(usedBy)) entry.usedBy.push(usedBy)
  media.set(file, entry)
}

// ── D3: posts that share a slug ─────────────────────────────────────────────
const articleFor = (record) => {
  const byTitle = inventory.content.filter((a) => a.title === record.values.title)
  if (byTitle.length === 1) return byTitle[0]
  const byDate = byTitle.filter(
    (a) => a.created === record.values.date || a.publish_up === record.values.date
  )
  if (byDate.length === 1) return byDate[0]
  const byAlias = byTitle.filter((a) => a.alias === record.slug)
  if (byAlias.length === 1) return byAlias[0]
  return fail(
    `posts/${record.slug}: ${byTitle.length} articles by title, ${byDate.length} by date — refusing to guess`
  )
}
const bySlug = new Map()
for (const record of recordsOf('posts')) bySlug.set(record.slug, [...(bySlug.get(record.slug) ?? []), record])
const renames = []
for (const [, group] of bySlug) {
  if (group.length < 2) continue
  for (const record of group) {
    const article = articleFor(record)
    if (article.alias !== record.slug)
      renames.push({ record, from: record.slug, to: article.alias, articleId: article.id })
  }
}
for (const r of renames) {
  if (recordsOf('posts').some((p) => p.slug === r.to))
    fail(`alias "${r.to}" is already a post slug — refusing to guess`)
  // Cover references follow the rename. A file named after the alias belongs to the renamed post;
  // when both posts of a pair use one file, the reference listed second is the renamed one's
  // (the adapter emits records in article order, and the renamed article is always the later id).
  const oldRef = `posts/${r.from}#cover`
  const named = [...media.values()].find((m) => m.file.startsWith(`${r.to}.`) && m.usedBy.includes(oldRef))
  const shared = [...media.values()].find((m) => m.usedBy.filter((u) => u === oldRef).length > 1)
  if (named) named.usedBy[named.usedBy.indexOf(oldRef)] = `posts/${r.to}#cover`
  else if (shared) shared.usedBy[shared.usedBy.lastIndexOf(oldRef)] = `posts/${r.to}#cover`
  r.record.slug = r.to
  model.routes.push({ path: `/product/blog/${r.to}`, kind: 'detail', type: 'posts', slug: r.to })
  notes.push(`D3 posts: ${r.from} → ${r.to} (Joomla #${r.articleId})`)
}

// ── D23: every post takes its Joomla alias as its slug ──────────────────────
// The adapter slugs posts from their titles, so URLs differed from the source (`/…/136-automatic-incident-
// timeline` on Joomla, `/…/building-an-incident-timeline-automatically-from-telemetry` here). Joomla's alias
// is the author's chosen URL word and is unique across all 240 posts (measured), so it becomes the slug.
// Two passes: targets are computed and checked for uniqueness before anything is renamed, so a chain
// (A's alias equals B's old slug) cannot be mistaken for a collision.
{
  const plan = recordsOf('posts').map((record) => ({
    record,
    from: record.slug,
    to: articleFor(record).alias
  }))
  const targets = new Set(plan.map((p) => p.to))
  if (targets.size !== plan.length)
    fail(`post aliases are not unique (${targets.size} distinct for ${plan.length} posts)`)
  const refs = new Map()
  let renamed = 0
  for (const { record, from, to } of plan) {
    if (from === to) continue
    refs.set(`posts/${from}#cover`, `posts/${to}#cover`)
    for (const route of model.routes)
      if (route.type === 'posts' && route.slug === from)
        Object.assign(route, { slug: to, path: route.path.replace(/[^/]+$/, to) })
    record.slug = to
    renamed++
  }
  for (const m of media.values()) m.usedBy = m.usedBy.map((u) => refs.get(u) ?? u)
  notes.push(`D23 ${renamed} post slug(s) → Joomla alias`)
}

// ── D9: byline, role, featured, tags ────────────────────────────────────────
const extraById = new Map(extra.articles.map((a) => [a.id, a]))
addField('posts', { name: 'author', type: 'text' })
addField('posts', { name: 'author_role', type: 'text' })
addField('posts', { name: 'featured', type: 'boolean' })
const tagById = new Map(extra.tags.filter((t) => t.published === '1').map((t) => [t.id, t]))
model.taxonomies = model.taxonomies.filter((t) => t.name !== 'tag')
model.taxonomies.push({
  name: 'tag',
  label: { [locale]: 'Tags' },
  labelSingular: { [locale]: 'Tag' },
  hierarchical: false,
  appliesTo: ['posts'],
  // Tag descriptions are data (`#__tags.description`); the tag archive shows one under its heading.
  terms: [...tagById.values()].map((t) => {
    const description = String(t.description ?? '')
      .replace(/<[^>]+>/g, '')
      .trim()
    return {
      slug: t.alias,
      label: { [locale]: t.title },
      ...(description ? { description: { [locale]: description } } : {})
    }
  })
})
for (const record of recordsOf('posts')) {
  const article = articleFor(record)
  const facts =
    extraById.get(article.id) ?? fail(`posts/${record.slug}: Joomla #${article.id} missing from extra.json`)
  record.values.author = facts.author
  record.values.author_role = facts.authorRole
  record.values.featured = facts.featured === '1'
  const tags = extra.tagMap
    .filter((m) => m.articleId === article.id && tagById.has(m.tagId))
    .map((m) => tagById.get(m.tagId).alias)
  record.terms = { ...record.terms, ...(tags.length ? { tag: tags } : {}) }
}

// ── section records by Joomla module id ─────────────────────────────────────
const sectionByModule = new Map()
const usedSlugs = new Map()
for (const acm of sections.acm) {
  const kind = key(acm.type)
  const used = usedSlugs.get(kind) ?? new Set()
  let s = slug(String(acm.title ?? '').replace(/^\[[^\]]+\]\s*/, '')) || `${kind}-${acm.id}`
  while (used.has(s)) s = `${s}-${acm.id}`
  used.add(s)
  usedSlugs.set(kind, used)
  if (!recordsOf(kind).some((r) => r.slug === s)) fail(`module #${acm.id} → ${kind}/${s}: no such record`)
  sectionByModule.set(acm.id, { collection: kind, entry: s, scope: acm.scope })
}

// ── D8: pages that are not pages here ───────────────────────────────────────
const ACCOUNT_VIEWS = new Set(['page-login', 'page-register', 'page-account', 'page-password'])
const mapped = pageMap.pages.filter((p) => p.source?.menuId)
const pageFor = (record) => {
  const hits = mapped.filter((p) => p.title === record.values.title && p.view === record.values.view)
  return hits.length === 1 ? hits[0] : null
}
const dropped = []
model.records = model.records.filter((record) => {
  if (record.type !== 'pages') return true
  const page = pageFor(record)
  if (page && !ACCOUNT_VIEWS.has(page.view)) return true
  dropped.push({
    slug: record.slug,
    path: page?.path ?? null,
    why: page ? 'com_users page (D8)' : 'synthetic WordPress parent (D8)'
  })
  return false
})
const droppedPaths = new Set(dropped.map((d) => d.path).filter(Boolean))
for (const d of dropped) if (!d.path) droppedPaths.add(`/${d.slug}`)
model.routes = model.routes.filter((r) => !droppedPaths.has(r.path))
const pruneMenu = (items) =>
  items
    .filter((i) => !droppedPaths.has(i.path))
    .map((i) => (i.children ? { ...i, children: pruneMenu(i.children) } : i))
for (const menu of model.menus) menu.items = pruneMenu(menu.items)
notes.push(`D8 pages not built: ${dropped.map((d) => `${d.slug} (${d.why})`).join(', ')}`)

// Menu items that list posts (blog category, archive, authors, search) are routes in the adapter's
// model, not page records — but they have a title, a layout and sections of their own (the blog shows
// a CTA module), so here they become pages too. `filter` names what the list shows, read from the
// menu item: a category id becomes that category's term, an author id that author's username.
addField('pages', { name: 'filter', type: 'text' })
const categoryTerm = (id) => {
  const cat = inventory.categories.find((c) => c.id === id) ?? fail(`category #${id} missing`)
  const terms = model.taxonomies.find((t) => t.name === 'category')?.terms ?? []
  return (
    terms.find((t) => t.label?.[locale] === cat.title) ?? fail(`no category term labelled "${cat.title}"`)
  ).slug
}
for (const page of mapped) {
  if (ACCOUNT_VIEWS.has(page.view)) continue
  if (recordsOf('pages').some((r) => pageFor(r) === page)) continue
  const s = slug(page.path.split('/').filter(Boolean).at(-1))
  if (recordsOf('pages').some((r) => r.slug === s)) fail(`list page ${page.path}: slug "${s}" already taken`)
  let filter = ''
  if (page.view === 'category' && page.source.id) filter = `category:${categoryTerm(page.source.id)}`
  if (page.view === 'author' && page.source.id) {
    const user = extra.articles.find(
      (a) => a.authorUsername && inventory.content.find((c) => c.id === a.id)?.created_by === page.source.id
    )
    filter = user
      ? `author:${user.authorUsername}`
      : fail(`author page ${page.path}: user #${page.source.id} has no article`)
  }
  model.records.push({
    type: 'pages',
    slug: s,
    locale,
    status: 'published',
    values: { title: page.title, body: '', view: page.view, filter }
  })
  notes.push(`D7 list page ${page.path} → pages/${s} (${page.view}${filter ? `, ${filter}` : ''})`)
}

// ── D7: path, style, ordered sections ───────────────────────────────────────
addField('pages', { name: 'path', type: 'text' })
addField('pages', { name: 'style', type: 'text' })
addField('pages', {
  name: 'sections',
  type: 'group',
  fields: [
    { name: 'collection', type: 'text' },
    { name: 'entry', type: 'text' }
  ]
})
const styleTitle = new Map(inventory.template_styles.map((s) => [s.id, s.title]))
for (const record of recordsOf('pages')) {
  const page = pageFor(record)
  const menu =
    inventory.menu.find((m) => m.id === page.source.menuId) ?? fail(`menu #${page.source.menuId} missing`)
  const title = styleTitle.get(menu.template_style_id) ?? ''
  record.values.path = page.path
  record.values.style = /blueprint/i.test(title) ? 'blueprint' : /signal/i.test(title) ? 'signal' : 'terminal'
  // D24: heading and sub line. Data first: a menu item's `page_heading` (shown when `show_page_heading`),
  // and a single-article page's standfirst is its article's meta description. Words the list layouts print
  // from their own markup ("Browse by tag", "Our writers" and the line under them) were captured from the
  // rendered source into ingest/rendered-extras.json → pages.
  addField('pages', { name: 'heading', type: 'text' })
  addField('pages', { name: 'sub', type: 'text' })
  {
    let params = {}
    try {
      params = JSON.parse(menu.params || '{}')
    } catch {}
    const rendered =
      JSON.parse(readFileSync(new URL('./rendered-extras.json', import.meta.url), 'utf8')).pages?.[
        page.path
      ] ?? {}
    const heading =
      String(params.show_page_heading) === '1' && params.page_heading ? params.page_heading : rendered.heading
    if (heading && heading !== record.values.title) record.values.heading = heading
    const article =
      page.source.option === 'com_content' && page.view === 'page' && page.source.id
        ? inventory.content.find((a) => a.id === page.source.id)
        : null
    const sub =
      rendered.sub ||
      (article && !page.sections.some((s) => s.modules.length > 0)
        ? String(article.metadesc ?? '').trim()
        : '')
    if (sub) record.values.sub = sub
    // D32: a `view=categories&id=N` menu item lists the children of category N — that is its filter.
    if (page.source.view === 'categories' && page.source.id)
      record.values.filter = `category:${categoryTerm(page.source.id)}`
  }
  // A menu item that shows ONE article (privacy, terms, the HelixQL deep-dive) carries that article as
  // its body; the adapter leaves composed pages' bodies empty and would leave these empty too.
  if (
    page.source.option === 'com_content' &&
    page.view !== 'category' &&
    page.source.id &&
    record.values.sections === undefined
  ) {
    const article = inventory.content.find((a) => a.id === page.source.id)
    const composed = page.sections.some((s) => s.modules.length > 0)
    if (article && !composed) {
      record.values.body = [article.introtext, article.fulltext].filter((p) => p && p.trim()).join('\n')
      notes.push(`D7 ${page.path}: body ← Joomla article #${article.id}`)
    }
  }
  record.values.sections = page.sections
    .flatMap((s) => s.modules)
    .map((id) => sectionByModule.get(id) ?? fail(`${page.path}: module #${id} is not a known section`))
    .filter((s) => s.scope === 'page')
    .map(({ collection, entry }) => ({ collection, entry }))
}

// ── D10: section images ─────────────────────────────────────────────────────
const setKind = (typeName, fieldName, kind) => {
  const type = typeOf(typeName)
  for (const f of type.fields) {
    if (f.name === fieldName) f.type = kind
    if (f.type === 'group') for (const sub of f.fields ?? []) if (sub.name === fieldName) sub.type = kind
  }
}
setKind('testimonials', 'avatar', 'image')
setKind('teams', 'avatar', 'image')
// D12: EmDash refuses SVG uploads (GLOBAL_UPLOAD_ALLOWLIST has no image/svg+xml). The integration strip's
// ten SVGs are generic glyphs, and every other section already names its icon as text ("bell",
// "git-branch"), so these become icon names too and the template draws them from one icon set.
const SVG_ICON = {
  code: 'code',
  cloud: 'cloud',
  container: 'container',
  server: 'server',
  message: 'message-square',
  bell: 'bell',
  git: 'git-branch',
  ticket: 'ticket',
  webhook: 'webhook',
  chart: 'chart-line'
}
{
  const clients = typeOf('clients')
  const items = clients.fields.find((f) => f.name === 'items')
  if (items && items.fields.some((f) => f.name === 'item_image')) {
    items.fields = items.fields.flatMap((f) =>
      f.name === 'item_image' ? [{ name: 'item_icon', type: 'text' }] : [f]
    )
    for (const record of recordsOf('clients')) {
      for (const item of record.values.items ?? []) {
        if (!item.item_image) continue
        const glyph = basename(item.item_image).match(/^icon-([a-z]+)\.svg$/)?.[1]
        item.item_icon =
          SVG_ICON[glyph] ?? fail(`clients/${record.slug}: no icon name for ${item.item_image}`)
        delete item.item_image
      }
    }
    notes.push('D12 clients.items.item_image (SVG) → item_icon (icon name)')
  }
}
// D13: the entry slug `authors` is shadowed by EmDash's own `GET /_emdash/api/content/<collection>/authors`
// route (measured: the API answers `{"items":[]}` while the row exists), so seed-apply reads it as drifted.
// Pages are found by `path`, not slug, so the slug is free to change.
for (const record of recordsOf('pages')) if (record.slug === 'authors') record.slug = 'writers'

// The adapter guesses `image` from a field NAME (`logo_name` holds "Vercel"). A field is an image only
// when every value it holds is a file name with an image extension; otherwise it is text.
const IMAGE_FILE = /\.(png|jpe?g|webp|svg|gif|avif)$/i
for (const type of model.types) {
  if (type.name === 'posts' || type.name === 'pages') continue
  const values = (name, sub) =>
    recordsOf(type.name)
      .flatMap((r) => (sub ? (r.values.items ?? []).map((i) => i[name]) : [r.values[name]]))
      .filter((v) => v !== undefined && v !== '')
  for (const f of type.fields) {
    if (f.type === 'image' && !values(f.name, false).every((v) => IMAGE_FILE.test(String(v)))) f.type = 'text'
    if (f.type === 'group')
      for (const sub of f.fields ?? [])
        if (sub.type === 'image' && !values(sub.name, true).every((v) => IMAGE_FILE.test(String(v)))) {
          sub.type = 'text'
          notes.push(`D10 ${type.name}.items.${sub.name}: text, not image (values are not file names)`)
        }
  }
}
for (const type of model.types) {
  if (type.name === 'posts' || type.name === 'pages') continue
  const imageTop = type.fields.filter((f) => f.type === 'image').map((f) => f.name)
  const imageSub =
    type.fields
      .find((f) => f.name === 'items')
      ?.fields?.filter((f) => f.type === 'image')
      .map((f) => f.name) ?? []
  for (const record of recordsOf(type.name)) {
    for (const name of imageTop) {
      record.values[name] = basename(record.values[name])
      if (record.values[name]) useMedia(record.values[name], `${type.name}/${record.slug}#${name}`)
      else delete record.values[name]
    }
    for (const [i, item] of (record.values.items ?? []).entries()) {
      for (const name of imageSub) {
        item[name] = basename(item[name])
        if (item[name])
          useMedia(
            item[name],
            `${type.name}/${record.slug}#items[${i}].${name}`,
            item.name || item.item_name || item.tile_title
          )
        else delete item[name]
      }
    }
  }
}
// The hero and query-split layouts show one panel image per colour direction; the database leaves
// them empty and the layouts fall back to files shipped in images/kinetic/. Those files ARE the
// design, so they become the fields' values instead of a fallback hidden in code.
const PANELS = { hero: 'hero-terminal-panel', kineticql_split: 'kineticql-code-panel' }
for (const [typeName, stem] of Object.entries(PANELS)) {
  for (const dir of ['terminal', 'blueprint', 'signal']) {
    addField(typeName, { name: `image_${dir}`, type: 'image' })
    for (const record of recordsOf(typeName)) {
      record.values[`image_${dir}`] ||= `${stem}-${dir}.webp`
      useMedia(record.values[`image_${dir}`], `${typeName}/${record.slug}#image_${dir}`, record.values.title)
    }
  }
}
model.media = [...media.values()].filter((m) => m.usedBy.length > 0)

// ── D14: footer chrome the adapter leaves out ───────────────────────────────
// Footer column titles are the TITLES of the mod_menu modules that show each menu ("Product",
// "Developers", "Company"); the adapter labels menus with their machine name instead.
for (const mod of sections.other.filter((o) => o.module === 'mod_menu' && o.scope === 'footer')) {
  const menu = model.menus.find((m) => m.name === mod.params?.menutype)
  if (menu) menu.label = { [locale]: mod.title }
}

// D20: megamenu columns. T4 keeps each dropdown's column layout — a title and the menu item ids it
// lists — in the template's navigation settings (`etc/navigation/default.json` → mega_settings), not
// in the menu table. Each column becomes a heading item with its links as children; a child listed in
// no column (FAQ under Product) stays a plain child after the columns, as the source's mobile drawer
// shows it. Items of pages that are not built (D8) are already pruned, and a column left empty goes.
{
  const navFile = path.join(j6Dir, 'capture/templates/ja_kinetic/etc/navigation/default.json')
  const nav = JSON.parse(readFileSync(navFile, 'utf8'))
  // T4 stores mega_settings as a JSON STRING inside the JSON file.
  const settingsAll =
    typeof nav.mega_settings === 'string' ? JSON.parse(nav.mega_settings) : (nav.mega_settings ?? {})
  const mega = settingsAll[nav.menu_type ?? 'mainmenu'] ?? {}
  const menu =
    model.menus.find((m) => m.name === (nav.menu_type ?? 'mainmenu')) ?? fail('no mainmenu in the model')
  // Route path of a site menu item, the same rule joomla-dump.mjs uses for render-routes.json.
  const itemPath = (id) => {
    const item = inventory.menu.find((m) => m.id === id && String(m.client_id) === '0')
    if (!item) return null
    const p = `/${String(item.path ?? '').replace(/^\/+/, '')}`
    return p === '/home-menu/home' ? '/' : p
  }
  let columns = 0
  for (const [topId, settings] of Object.entries(mega)) {
    const topItem = inventory.menu.find((m) => m.id === topId)
    const holder = menu.items.find((i) => i.label?.[locale] === topItem?.title) ?? null
    if (!holder) {
      notes.push(`D20 megamenu #${topId}: no top menu item labelled "${topItem?.title}"`)
      continue
    }
    const children = holder.children ?? []
    const used = new Set()
    const cols = []
    for (const row of settings.settings ?? []) {
      for (const content of row.contents ?? []) {
        if (content.type !== 'items') continue
        const links = String(content.items ?? '')
          .split(',')
          .map((id) => itemPath(id.trim()))
          .map((p) => children.find((c) => c.path === p))
          .filter(Boolean)
        links.forEach((l) => used.add(l))
        if (links.length)
          cols.push({ label: { [locale]: content.title }, path: '', kind: 'heading', children: links })
      }
    }
    if (!cols.length) continue
    holder.children = [...cols, ...children.filter((c) => !used.has(c))]
    columns += cols.length
  }
  notes.push(`D20 mainmenu: ${columns} megamenu column heading(s) ← etc/navigation/default.json`)
}

// D21: the footer brand's RSS link is Joomla's category feed URL; this site serves no such feed, so the
// icon would lead to a 404. It is removed until a feed exists (content-gaps G10).
for (const record of recordsOf('social')) {
  const before = record.values.items?.length ?? 0
  record.values.items = (record.values.items ?? []).filter((i) => !/format=feed/.test(String(i.url ?? '')))
  if (record.values.items.length !== before)
    notes.push(`D21 social/${record.slug}: RSS link to the Joomla feed removed`)
}
// The newsletter band is an AcyMailing module; its words live in the module params (intro HTML + button).
const acym = sections.other.find((o) => o.module === 'mod_acym')
if (acym) {
  const intro = String(acym.params?.introtext ?? '')
  const text = (re) => (intro.match(re)?.[1] ?? '').replace(/<[^>]+>/g, '').trim()
  model.types.push({
    name: 'newsletter',
    mode: 'single',
    label: { [locale]: 'Newsletter band' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'text', type: 'text' },
      { name: 'placeholder', type: 'text' },
      { name: 'button_label', type: 'text' },
      // Id of the Forms-plugin form the band submits to; written by `seed-apply forms` (template.config.json bindings).
      { name: 'form_id', type: 'text' }
    ]
  })
  model.records.push({
    type: 'newsletter',
    slug: 'footer-newsletter',
    locale,
    status: 'published',
    values: {
      title: text(/<h3[^>]*>([\s\S]*?)<\/h3>/i),
      text: text(/<p[^>]*>([\s\S]*?)<\/p>/i),
      // The email field's placeholder is rendered by AcyMailing from its field #2 config, not stored in
      // the module; the rendered page shows "you@company.com" (source render 15/09).
      placeholder: 'you@company.com',
      button_label: acym.params?.subtext ?? ''
    }
  })
  notes.push('D14 newsletter band ← mod_acym #236 params (placeholder read from the rendered page)')
}
// D16: a few values are Joomla's non-SEF links (`index.php?option=com_contact&view=contact&id=1&Itemid=227`).
// The menu item id names the route the link means, so it becomes that route's path. A link with no
// Itemid (the category RSS feed) has no route here and is left as the gap it is (content-gaps G10).
let resolved = 0
const menuPath = (id) => {
  const item = inventory.menu.find((m) => m.id === id && String(m.client_id) === '0')
  if (!item) return null
  const p = `/${String(item.path ?? '').replace(/^\/+/, '')}`
  return p === '/home-menu/home' ? '/' : p
}
const resolveLinks = (holder) => {
  for (const [k, v] of Object.entries(holder)) {
    if (typeof v === 'string' && /(^|\/)index\.php\?/.test(v)) {
      const id = v.replace(/&amp;/g, '&').match(/[?&]Itemid=(\d+)/)?.[1]
      const target = id ? menuPath(id) : null
      if (target) {
        holder[k] = target
        resolved++
      }
    } else if (Array.isArray(v)) v.forEach((item) => item && typeof item === 'object' && resolveLinks(item))
  }
}
for (const record of model.records) resolveLinks(record.values)
notes.push(`D16 ${resolved} Joomla non-SEF link(s) → route path`)

// D17: `pricing.items[].popular` is a flag ("1"/"0") whose badge WORDS live in the source layout, not the
// database (rendered "MOST POPULAR", 15/09). The words become the value, so an editor can change them;
// an empty value means no badge. The component uppercases it, as the source does.
for (const record of recordsOf('pricing'))
  for (const item of record.values.items ?? []) item.popular = item.popular === '1' ? 'Most popular' : ''
notes.push('D17 pricing.items.popular: flag → badge text ("Most popular", read from the rendered source)')

// D19: the live-stats ticker under the home and landing hero is printed by the clients layout from its
// own markup. Its words were captured from the rendered source into ingest/rendered-extras.json and
// become fields of the clients entries that show it: `ticker_label` and `ticker[] {text, bright}`.
{
  const extras = JSON.parse(readFileSync(new URL('./rendered-extras.json', import.meta.url), 'utf8'))
  const clients = typeOf('clients')
  if (!clients.fields.some((f) => f.name === 'ticker_label'))
    clients.fields.push({ name: 'ticker_label', type: 'text' })
  if (!clients.fields.some((f) => f.name === 'ticker'))
    clients.fields.push({
      name: 'ticker',
      type: 'group',
      fields: [
        { name: 'text', type: 'text' },
        { name: 'bright', type: 'boolean' }
      ]
    })
  for (const [entrySlug, ticker] of Object.entries(extras.clientsTicker ?? {})) {
    if (!ticker) continue
    const record =
      recordsOf('clients').find((r) => r.slug === entrySlug) ??
      fail(`rendered-extras: no clients/${entrySlug}`)
    record.values.ticker_label = ticker.label
    record.values.ticker = ticker.items
  }
  notes.push(`D19 clients ticker ← ingest/rendered-extras.json (captured ${extras.capturedAt})`)

  // D22: writers. The author pages print a role and a one-line bio per writer from the template's author
  // override, not from the database; they were captured the same way as the ticker. Name and photo come
  // from data: the display name the posts carry for that username, and `images/people/<name>.jpg` when the
  // quickstart ships one (the same files the team section uses).
  if (extras.writers?.length) {
    model.types.push({
      name: 'writers',
      mode: 'list',
      label: { [locale]: 'Writers' },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'username', type: 'text' },
        { name: 'role', type: 'text' },
        { name: 'bio', type: 'text' },
        // The line under the name on the writer's own page ("Staff SRE. Writes about …"); `bio` is the aside.
        { name: 'tagline', type: 'text' },
        { name: 'avatar', type: 'image' },
        // Directory order as the source lists writers (capture order); editors reorder by changing it.
        { name: 'sort', type: 'number' }
      ]
    })
    for (const [index, w] of extras.writers.entries()) {
      const name =
        extra.articles.find((a) => a.authorUsername === w.username)?.author ??
        fail(`writer ${w.username}: no post by that username`)
      const photo = `${slug(name)}.jpg`
      const hasPhoto =
        [...media.keys()].includes(photo) ||
        model.records.some((r) => (r.values.items ?? []).some((i) => i.avatar === photo))
      model.records.push({
        type: 'writers',
        slug: slug(name),
        locale,
        status: 'published',
        values: {
          name,
          username: w.username,
          role: w.role,
          bio: w.bio,
          tagline: w.tagline ?? '',
          sort: index + 1,
          ...(hasPhoto ? { avatar: photo } : {})
        }
      })
      if (hasPhoto) useMedia(photo, `writers/${slug(name)}#avatar`, name)
    }
    notes.push(`D22 writers: ${extras.writers.length} ← ingest/rendered-extras.json + post bylines`)
  }
}

// D22: category descriptions are data (`#__categories.description`); the blog shows the category's as its
// subtitle. They ride on the taxonomy terms as plain text.
{
  const categories = model.taxonomies.find((t) => t.name === 'category')
  for (const term of categories?.terms ?? []) {
    const cat = inventory.categories.find(
      (c) => c.title === term.label?.[locale] && c.extension === 'com_content'
    )
    const description = String(cat?.description ?? '')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (description) term.description = { [locale]: description }
    // D32: the adapter drops `parent_id`, so the model lost that the six topics are children of "Field notes"
    // (All Categories lists the children of that one category). Parent = the parent category's term slug.
    const parent =
      cat && inventory.categories.find((c) => c.id === cat.parent_id && c.extension === 'com_content')
    const parentTerm = parent && categories.terms.find((t) => t.label?.[locale] === parent.title)
    if (parentTerm) term.parent = parentTerm.slug
  }
}
model.media = [...media.values()].filter((m) => m.usedBy.length > 0)

// D35: the contact page is com_contact — method cards from the contact's `misc` HTML, a form that sends to
// `email_to`. The form's words (heading, labels, consent, submit) are Joomla language strings, captured from the
// rendered source into rendered-extras.json; the labels themselves live in tools/forms.json (the Forms plugin).
{
  const extrasFile = JSON.parse(readFileSync(new URL('./rendered-extras.json', import.meta.url), 'utf8'))
  const contact = (extra.contacts ?? []).find((c) => c.published === '1')
  const contactPage = recordsOf('pages').find((r) => r.values.view === 'page-contact')
  if (contact && contactPage) {
    const text = (s) =>
      String(s ?? '')
        .replace(/<svg[\s\S]*?<\/svg>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
    const items = [
      ...String(contact.misc).matchAll(/<div class="hx-method">([\s\S]*?hx-method__email[\s\S]*?<\/div>)/g)
    ].map((m) => {
      const title = text(m[1].match(/hx-method__title[^>]*>([\s\S]*?)<\//)?.[1])
      return {
        title,
        desc: text(m[1].match(/hx-method__desc[^>]*>([\s\S]*?)<\//)?.[1]),
        email: text(m[1].match(/hx-method__email[^>]*>([\s\S]*?)<\//)?.[1]),
        icon:
          extrasFile.contactIcons?.[title] ??
          fail(`contact card "${title}": no icon name in rendered-extras.json`)
      }
    })
    if (items.length === 0) fail('contact misc: no hx-method cards found')
    model.types.push({
      name: 'contact_block',
      mode: 'list',
      label: { [locale]: 'Contact block' },
      fields: [
        { name: 'heading', type: 'text' },
        // Id of the Forms-plugin form shown beside the cards; written by `seed-apply forms` (template.config.json).
        { name: 'form_id', type: 'text' },
        {
          name: 'items',
          type: 'group',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'desc', type: 'text' },
            { name: 'email', type: 'email' },
            { name: 'icon', type: 'text' }
          ]
        }
      ]
    })
    const slugOf = slug(contact.alias || contact.name)
    model.records.push({
      type: 'contact_block',
      slug: slugOf,
      locale,
      status: 'published',
      values: { heading: extrasFile.contactForm?.heading ?? '', items }
    })
    const sections = contactPage.values.sections ?? []
    const at = sections.findIndex((s) => s.collection === 'page_masthead')
    sections.splice(at + 1, 0, { collection: 'contact_block', entry: slugOf })
    contactPage.values.sections = sections
    notes.push(
      `D35 contact_block/${slugOf}: ${items.length} card(s) from #__contact_details #${contact.id}; inserted after the masthead on ${contactPage.values.path}`
    )
  }
}

// D8: links to the account pages that are not built keep their button and label but lose the
// destination — `#`, the source's own convention for a link with nowhere to go (footer "Status").
const ACCOUNT_PATHS = new Set([
  '/pages/login',
  '/pages/register',
  '/pages/profile',
  '/pages/reset',
  '/pages/remind'
])
let unlinked = 0
const unlink = (holder) => {
  for (const [k, v] of Object.entries(holder)) {
    if (typeof v === 'string' && ACCOUNT_PATHS.has(v)) {
      holder[k] = '#'
      unlinked++
    } else if (Array.isArray(v)) v.forEach((item) => item && typeof item === 'object' && unlink(item))
  }
}
for (const record of model.records) unlink(record.values)
notes.push(`D8 ${unlinked} link(s) to account pages → "#"`)

model.provenance = { ...model.provenance, normalizedBy: 'ingest/normalize-joomla-model.mjs', notes }
mkdirSync(path.dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`)
for (const n of notes) console.log(n)
console.log(
  `normalize-joomla-model: ${recordsOf('pages').length} pages · ${recordsOf('posts').length} posts · ${model.media.length} media → ${outPath}`
)
