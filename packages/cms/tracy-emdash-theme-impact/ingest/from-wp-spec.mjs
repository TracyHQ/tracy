#!/usr/bin/env node
// from-wp-spec.mjs — a spec-pack produced by the WordPress skill's Joomla adapter → site-model.json.
//
//   node scripts/ingest/from-wp-spec.mjs <spec-dir> <out-dir>
//
// WHAT IT READS. tasks/tracy-base-wp7/spec/ in TCH: the output of `from-joomla.mjs` when Tracy
// Base (Joomla 6, 43 routes, 82 articles, 46 ACM instances) was ported to WordPress. Four files
// carry the content — content.json, sections.json, menus.json, redirects.json — plus page-map.json
// for routes.
//
// ⚠ THIS IS A BRIDGE, NOT THE ROAD. That spec-pack has already been half-translated into WordPress:
// post bodies are block markup, links are WordPress paths, images point at an uploads folder. The
// bridge undoes what it can and records what it cannot. The road is a Joomla adapter emitting
// site-model.json directly, before any of that happens — then nothing needs undoing.
//
// WHY IT EARNS ITS KEEP ANYWAY. It proves the contract carries a real site, today, from data that
// already exists in the repo — without a Joomla install, a dump, or Docker.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { emptyModel } from '../contract/site-model.mjs'

const read = (dir, name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
const slugify = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item'

/**
 * Strip the other CMS's packaging from a body: the block comments, the block-editor class names,
 * and the uploads path in front of every image.
 *
 * The comments are the obvious part. The other two are the part that got through the first run and
 * showed up in exactly one of 129 records — a 404 page whose body still carried
 * `class="wp-block-group"` and `src="/wp-content/uploads/error-page.png"`. One record out of 129 is
 * precisely the kind of leftover nobody reads their way to; a grep for the foreign vocabulary found
 * it in a second.
 *
 * `onImage` is called with each image file so the caller can register it as media.
 */
function cleanProse(html, onImage = () => {}) {
  return String(html ?? '')
    .replace(/<!--\s*\/?\s*wp:[^>]*?-->/g, '')
    .replace(/(src|href)="\/wp-content\/uploads\/([^"]+)"/g, (_, attr, file) => {
      const name = path.basename(file.split('?')[0])
      onImage(name)
      return `${attr}="${name}"`
    })
    .replace(/\sclass="([^"]*)"/g, (whole, classes) => {
      const kept = classes
        .split(/\s+/)
        .filter(
          (c) => c && !/^(wp-block|wp-image|wp-element|alignnone|aligncenter|is-layout|is-style)/.test(c)
        )
      return kept.length > 0 ? ` class="${kept.join(' ')}"` : ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** An uploads path is where the other CMS would have put the file; keep the file, drop the route. */
const mediaName = (src) => (src ? path.basename(String(src).split('?')[0].split('#')[0]) : null)

const FIELD_KIND = (key, value) => {
  if (/(^|[-_])(image|logo|photo|cover)([-_]|$)/.test(key)) return 'image'
  if (/(^|[-_])(url|link|href)([-_]|$)/.test(key)) return 'url'
  if (/(^|[-_])(email)([-_]|$)/.test(key)) return 'email'
  if (typeof value === 'string' && (value.includes('</p>') || value.length > 220)) return 'prose'
  return 'text'
}

export function fromSpec(spec) {
  const content = read(spec, 'content.json')
  const sections = read(spec, 'sections.json')
  const menusFile = read(spec, 'menus.json')
  const pageMap = read(spec, 'page-map.json')
  let redirects = { rules: [] }
  try {
    redirects = read(spec, 'redirects.json')
  } catch {
    // A source with nothing to redirect is not an error.
  }

  const locale = 'en'
  const model = emptyModel({
    kind: 'joomla',
    parity: 'measured',
    origin: pageMap.source?.path ?? 'tracy-base-j6'
  })
  model.locales = { default: locale, all: [locale] }
  model.site = {
    title: { [locale]: content.site?.name ?? 'Site' },
    tagline: { [locale]: content.site?.tagline ?? '' },
    postsPerPage: 10
  }

  const media = new Map()
  const useMedia = (src, alt, usedBy) => {
    const file = mediaName(src)
    if (!file) return null
    const known = media.get(file) ?? { file, alt: {}, usedBy: [] }
    if (alt) known.alt[locale] = alt
    known.usedBy.push(usedBy)
    media.set(file, known)
    return file
  }

  // ── pages and posts ───────────────────────────────────────────────────────
  model.types.push({
    name: 'pages',
    mode: 'list',
    label: { [locale]: 'Pages' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'prose' },
      { name: 'view', type: 'text' }
    ]
  })
  model.types.push({
    name: 'posts',
    mode: 'list',
    label: { [locale]: 'Posts' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'excerpt', type: 'prose' },
      { name: 'body', type: 'prose' },
      { name: 'date', type: 'date' },
      { name: 'author', type: 'text' },
      { name: 'cover', type: 'image' }
    ]
  })

  for (const page of content.pages ?? []) {
    model.records.push({
      type: 'pages',
      slug: page.slug ?? slugify(page.title),
      locale,
      status: page.status === 'publish' ? 'published' : 'draft',
      values: {
        title: page.title ?? '',
        body: cleanProse(page.content, (file) =>
          useMedia(file, null, `pages/${page.slug ?? slugify(page.title)}#body`)
        ),
        view: page.view ?? ''
      }
    })
  }
  for (const post of content.posts ?? []) {
    const slug = post.slug ?? slugify(post.title)
    const cover = useMedia(post.featuredImage, post.featuredImageAlt, `posts/${slug}#cover`)
    model.records.push({
      type: 'posts',
      slug,
      locale,
      status: post.status === 'publish' ? 'published' : 'draft',
      terms: post.category ? { category: [post.category] } : undefined,
      values: {
        title: post.title ?? '',
        excerpt: cleanProse(post.excerpt),
        body: cleanProse(post.content, (file) => useMedia(file, null, `posts/${slug}#body`)),
        date: post.date ?? '',
        author: post.author?.name ?? '',
        ...(cover ? { cover } : {})
      }
    })
  }

  // ── one type per section kind, fields inferred from what the instances carry ─
  const byKind = new Map()
  for (const acm of sections.acm ?? []) {
    const kind = slugify(acm.type).replace(/-/g, '_')
    const bucket = byKind.get(kind) ?? { fields: new Map(), itemFields: new Map(), instances: [] }
    for (const [key, value] of Object.entries(acm.fields ?? {})) {
      if (!bucket.fields.has(key)) bucket.fields.set(key, FIELD_KIND(key, value))
    }
    for (const item of acm.items ?? []) {
      for (const [key, value] of Object.entries(item)) {
        if (!bucket.itemFields.has(key)) bucket.itemFields.set(key, FIELD_KIND(key, value))
      }
    }
    bucket.instances.push(acm)
    byKind.set(kind, bucket)
  }
  for (const [kind, bucket] of byKind) {
    const fields = [...bucket.fields].map(([name, type]) => ({
      name: slugify(name).replace(/-/g, '_'),
      type
    }))
    if (bucket.itemFields.size > 0) {
      fields.push({
        name: 'items',
        type: 'group',
        fields: [...bucket.itemFields].map(([name, type]) => ({
          name: slugify(name).replace(/-/g, '_'),
          type
        }))
      })
    }
    model.types.push({ name: kind, mode: 'list', label: { [locale]: kind.replace(/_/g, ' ') }, fields })

    const used = new Set()
    for (const acm of bucket.instances) {
      let slug = slugify(acm.title.replace(/^\[[^\]]+\]\s*/, '')) || `${kind}-${acm.id}`
      while (used.has(slug)) slug = `${slug}-${acm.id}`
      used.add(slug)
      const values = {}
      for (const [key, value] of Object.entries(acm.fields ?? {})) {
        const name = slugify(key).replace(/-/g, '_')
        values[name] =
          FIELD_KIND(key, value) === 'image'
            ? (useMedia(value, null, `${kind}/${slug}#${name}`) ?? '')
            : value
      }
      if (acm.items?.length) {
        values.items = acm.items.map((item) =>
          Object.fromEntries(Object.entries(item).map(([k, v]) => [slugify(k).replace(/-/g, '_'), v]))
        )
      }
      model.records.push({ type: kind, slug, locale, status: acm.published ? 'published' : 'draft', values })
    }
  }

  // ── taxonomy, menus, routes, redirects ────────────────────────────────────
  if ((content.categories ?? []).length > 0) {
    model.taxonomies.push({
      name: 'category',
      label: { [locale]: 'Categories' },
      hierarchical: true,
      appliesTo: ['posts'],
      terms: content.categories.map((c) => ({
        slug: c.wpSlug ?? slugify(c.title),
        label: { [locale]: c.title }
      }))
    })
  }

  const routePaths = new Set()
  const addRoute = (route) => {
    if (routePaths.has(route.path)) return
    routePaths.add(route.path)
    model.routes.push(route)
  }
  for (const page of pageMap.pages ?? []) addRoute({ path: page.path, kind: 'page' })
  for (const archive of content.archives ?? []) addRoute({ path: archive.path, kind: 'list', type: 'posts' })
  for (const record of model.records.filter((r) => r.type === 'posts')) {
    const post = (content.posts ?? []).find((p) => (p.slug ?? slugify(p.title)) === record.slug)
    if (post?.path) addRoute({ path: post.path, kind: 'detail', type: 'posts', slug: record.slug })
  }

  const items = (nodes) =>
    (nodes ?? []).map((node) => ({
      label: { [locale]: node.label ?? '' },
      path: node.url ?? node.path ?? '',
      // Joomla's "heading" is a group label with no destination. The contract keeps the distinction
      // rather than inventing a link for it; what each CMS does with a group label is the
      // compiler's decision, not the adapter's.
      ...(node.type === 'heading' ? { kind: 'heading' } : {}),
      ...(node.children?.length ? { children: items(node.children) } : {})
    }))
  for (const menu of menusFile.menus ?? []) {
    model.menus.push({
      name: slugify(menu.menutype ?? menu.title),
      label: { [locale]: menu.title ?? menu.menutype },
      items: items((menu.items ?? []).filter((item) => item.published !== false))
    })
  }

  model.redirects = (redirects.rules ?? []).map((r) => ({ from: r.from, to: r.to, status: r.status ?? 301 }))
  model.media = [...media.values()]
  return model
}

function main(argv) {
  const [specDir, outDir] = argv
  if (!specDir || !outDir) {
    console.error('usage: from-wp-spec.mjs <spec-dir> <out-dir>')
    return 2
  }
  const model = fromSpec(path.resolve(specDir))
  mkdirSync(path.resolve(outDir), { recursive: true })
  writeFileSync(path.join(path.resolve(outDir), 'site-model.json'), `${JSON.stringify(model, null, '\t')}\n`)
  console.log(
    `from-wp-spec: ${model.types.length} types, ${model.records.length} records, ${model.menus.length} menus, ${model.media.length} media → ${outDir}`
  )
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)))
