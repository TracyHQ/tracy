#!/usr/bin/env node
/**
 * Capture the raw navigation markup of a WordPress quickstart release from its OWN database archive:
 * every published `wp_navigation`, every published template part of the theme, and the block names of
 * every post a navigation links to. A template part the theme ships as `parts/<slug>.html` with no
 * database override resolves to that file, so its markup is carried too (`themeParts`), read from a
 * theme directory and kept only when its sha256 is the one `presentation-lock.json` pins for the
 * release; otherwise its content is null and the map of the contract is not covered. Written to `contracts/<id>/navigation-source.json`, the input
 * `scripts/build-wordpress-showcase-nav.mjs` fingerprints its operations on.
 *
 * What a post listing reaches is carried too, for the planner's only-route guard: `listings` holds the
 * filters of every listing block (query, latest posts, category list, tag cloud) on a published page or
 * post, `listedPosts` the published posts those blocks can list with their author, date, language and
 * terms, `terms` the terms of those posts, and `stickyPosts` the sticky ones. A filtered listing only
 * proves a route to what it filters to.
 *
 * WHY A SEPARATE FILE: `inventory.json` keeps the navigation links flat (no submenus, no markup), and
 * its bytes are pinned by other generators; an operation pinned to the bytes of a post needs those
 * bytes. This file adds them without touching `inventory.json` or `presentation-lock.json`.
 *
 * Usage:
 *   node packages/cms/tracy-wordpress-quickstart/scripts/capture-navigation-source.mjs \
 *     --contract ja-diner/wp7/1.0.1 --dump <database.sql.gz> --theme <theme dir> [--contracts-root <dir>] [--check]
 *
 * `--theme` is any copy of the release's theme (the webroot's `wp-content/themes/<stylesheet>`, or the
 * overlay under `packages/cms/tracy-wordpress-theme/overlays/<stylesheet>`): only bytes the lock pins count.
 *
 * The dump must be the release's own: its sha256 is checked against `manifest.json`
 * (`quickstart.parts.database.sha256`) before a byte of it is read. `--check` regenerates in memory and
 * exits 1 when the committed file differs. Two runs on the same dump are byte-identical.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { phpArray, readDump, tableRows, wordpressPrefix } from '../../tracy-quickstart-tools/mysqldump.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const SOURCE_FILE = 'navigation-source.json'
export const SOURCE_SCHEMA = 'tracy-quickstart-navigation-source/wordpress/v1'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const wordpressStylesheet = (sql) =>
  new Map(tableRows(sql, `${wordpressPrefix(sql)}options`).map((o) => [o.option_name, o.option_value])).get(
    'stylesheet'
  ) ?? ''
const BLOCK_OPEN = /<!--\s+wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)[\s{/]/g
const blockNamesOf = (markup) =>
  [
    ...new Set(
      [...String(markup).matchAll(BLOCK_OPEN)].map((m) => (m[1].includes('/') ? m[1] : `core/${m[1]}`))
    )
  ].sort()

/** Blocks whose filters `listings` carries: what each lists is read from its attributes. */
const LISTING_BLOCKS = new Set([
  'core/query',
  'core/latest-posts',
  'core/categories',
  'core/tag-cloud',
  'core/page-list'
])
const BLOCK_COMMENT =
  /<!--\s+(\/?)wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s+(?:(\{[\s\S]*?\})\s+)?(\/?)-->/g
// Query keys whose filter `queryOf` reads; any other key with a value narrows the listing in a way
// the guard cannot follow, so it is named in `unsupported`.
const QUERY_KEYS = new Set([
  'perPage',
  'pages',
  'offset',
  'postType',
  'order',
  'orderBy',
  'author',
  'search',
  'exclude',
  'sticky',
  'inherit',
  'taxQuery',
  'categoryIds',
  'tagIds',
  'parents',
  'format'
])
const blank = (v) =>
  v === undefined ||
  v === null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
const ids = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((x) => Number(typeof x === 'object' && x !== null ? x.id : x))
    .filter((n) => Number.isInteger(n) && n > 0)
const termIds = (map) => {
  const out = {}
  for (const [taxonomy, list] of Object.entries(map ?? {})) {
    const found = ids(list)
    if (found.length) out[taxonomy] = found
  }
  return out
}

/** The filters of one core/query block: what it lists, normalised. `paginated` when it pages on. */
function queryOf(attrs, paginated) {
  const q = attrs.query ?? {}
  const unsupported = Object.keys(q)
    .filter((k) => !QUERY_KEYS.has(k) && !blank(q[k]))
    .concat(['parents', 'format'].filter((k) => !blank(q[k])))
    .sort()
  // WordPress 6.x writes `taxQuery: { <taxonomy>: [ids] }`; later releases split it into `include` and
  // `exclude`; the oldest blocks carry `categoryIds` and `tagIds`.
  const split = q.taxQuery && (q.taxQuery.include || q.taxQuery.exclude)
  const include = termIds(split ? q.taxQuery.include : q.taxQuery)
  if (ids(q.categoryIds).length) include.category = ids(q.categoryIds)
  if (ids(q.tagIds).length) include.post_tag = ids(q.tagIds)
  return {
    block: 'core/query',
    postType: q.postType ?? 'post',
    inherit: q.inherit === true,
    taxQuery: include,
    taxExclude: split ? termIds(q.taxQuery.exclude) : {},
    author: ids(q.author),
    search: String(q.search ?? ''),
    sticky: String(q.sticky ?? ''),
    exclude: ids(q.exclude),
    offset: Number(q.offset) || 0,
    perPage: Number(q.perPage) || null,
    pages: Number(q.pages) || 0,
    paginated,
    order: String(q.order ?? 'desc'),
    orderBy: String(q.orderBy ?? 'date'),
    termLinks: [],
    unsupported
  }
}

/** The filters of a core/latest-posts block, in the shape of `queryOf`; it never pages on. */
function latestPostsOf(attrs) {
  const author = ids(attrs.selectedAuthor)
  const categories = ids(attrs.categories)
  return {
    block: 'core/latest-posts',
    postType: 'post',
    inherit: false,
    taxQuery: categories.length ? { category: categories } : {},
    taxExclude: {},
    author,
    search: '',
    sticky: '',
    exclude: [],
    offset: 0,
    perPage: Number(attrs.postsToShow) || 5,
    pages: 0,
    paginated: false,
    order: String(attrs.order ?? 'desc'),
    orderBy: String(attrs.orderBy ?? 'date'),
    termLinks: [],
    unsupported: []
  }
}

/**
 * The listing blocks of one post's markup, in document order: a query or latest-posts block as its
 * filters (`termLinks` the taxonomies whose archives its post cards link), a category list or tag cloud
 * as the taxonomy whose term archives it links, a page list as itself. Pure.
 */
export function listingsOf(markup) {
  const out = []
  const open = []
  for (const m of String(markup).matchAll(BLOCK_COMMENT)) {
    const [, closing, raw, json, selfClosing] = m
    const name = raw.includes('/') ? raw : `core/${raw}`
    if (closing) {
      const at = open.findLastIndex((b) => b.name === name)
      if (at >= 0) open.length = at
      continue
    }
    let attrs = {}
    try {
      attrs = json ? JSON.parse(json) : {}
    } catch {
      attrs = null
    }
    const query = open.findLast((b) => b.name === 'core/query')
    if (query?.listing.termLinks && name === 'core/query-pagination') query.listing.paginated = true
    if (query?.listing.termLinks && name === 'core/post-terms' && attrs?.term) {
      const taxonomy = String(attrs.term)
      if (!query.listing.termLinks.includes(taxonomy)) query.listing.termLinks.push(taxonomy)
    }
    if (LISTING_BLOCKS.has(name)) {
      let listing
      if (attrs === null) listing = { block: name, unsupported: ['attributes'] }
      else if (name === 'core/query') listing = queryOf(attrs, false)
      else if (name === 'core/latest-posts') listing = latestPostsOf(attrs)
      else if (name === 'core/page-list') listing = { block: name }
      else
        listing = {
          block: name,
          taxonomy: String(attrs.taxonomy ?? (name === 'core/categories' ? 'category' : 'post_tag'))
        }
      out.push(listing)
      if (!selfClosing) open.push({ name, listing })
    } else if (!selfClosing) open.push({ name, listing: null })
  }
  return out
}

/**
 * The theme's own part files, from `presentation-lock.json` (`files`, under the theme's file root):
 * `{ slug, file, sha256 }` with `file` relative to the theme directory.
 */
export function themePartFilesOf(lock, stylesheet) {
  const root = `wp-content/themes/${stylesheet}/`
  return Object.entries(lock.files ?? {})
    .filter(([file]) => file.startsWith(root) && /^parts\/[^/]+\.html$/.test(file.slice(root.length)))
    .map(([file, sha]) => ({
      slug: path.basename(file, '.html'),
      file: file.slice(root.length),
      sha256: typeof sha === 'string' ? sha : sha?.sha256
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
}

/**
 * The source document of one release, from the dump text. `themeFiles` are the theme's part files
 * (`themePartFilesOf`) with `content` (null when the bytes at hand are not the pinned ones). Pure.
 */
export function captureSource({ sql, contract, database, themeFiles = [] }) {
  const prefix = wordpressPrefix(sql)
  const posts = tableRows(sql, `${prefix}posts`)
  const options = new Map(tableRows(sql, `${prefix}options`).map((o) => [o.option_name, o.option_value]))
  const terms = new Map(tableRows(sql, `${prefix}terms`).map((t) => [t.term_id, t]))
  const taxonomies = new Map(tableRows(sql, `${prefix}term_taxonomy`).map((tt) => [tt.term_taxonomy_id, tt]))
  const termsOf = new Map()
  for (const r of tableRows(sql, `${prefix}term_relationships`)) {
    const tt = taxonomies.get(r.term_taxonomy_id)
    if (!tt) continue
    const list = termsOf.get(r.object_id) ?? []
    list.push({ taxonomy: tt.taxonomy, id: Number(tt.term_id), slug: terms.get(tt.term_id)?.slug ?? '' })
    termsOf.set(r.object_id, list)
  }
  const termOf = (id, taxonomy) => termsOf.get(id)?.find((t) => t.taxonomy === taxonomy)?.slug ?? null
  const stylesheet = options.get('stylesheet') ?? null
  const byId = (a, b) => Number(a.ID) - Number(b.ID)
  const published = (type) =>
    posts.filter((p) => p.post_type === type && p.post_status === 'publish').sort(byId)

  // A navigation's language, by the rule capture-inventory.mjs uses: Polylang's term, else the
  // `-<slug>` suffix of a known language, else the source language.
  const languageSlugs = new Set(
    [...taxonomies.values()]
      .filter((tt) => tt.taxonomy === 'language')
      .map((tt) => terms.get(tt.term_id)?.slug)
  )
  const sourceLanguage = String((phpArray(options.get('polylang') ?? '') ?? {}).default_lang ?? 'en')
  const languageOf = (p) => {
    const term = termOf(p.ID, 'language')
    if (term) return term
    const m = /-([a-z]{2}(?:-[a-z]{2})?)$/.exec(p.post_name)
    return m && languageSlugs.has(m[1]) ? m[1] : sourceLanguage
  }
  const navigations = published('wp_navigation').map((p) => ({
    id: Number(p.ID),
    slug: p.post_name,
    title: p.post_title,
    language: languageOf(p),
    sha256: sha256(p.post_content),
    content: p.post_content
  }))
  const templateParts = published('wp_template_part')
    .filter((p) => termOf(p.ID, 'wp_theme') === stylesheet)
    .map((p) => ({
      id: Number(p.ID),
      slug: p.post_name,
      theme: termOf(p.ID, 'wp_theme'),
      area: termOf(p.ID, 'wp_template_part_area'),
      sha256: sha256(p.post_content),
      content: p.post_content
    }))
  const overridden = new Set(templateParts.map((p) => p.slug))
  const themeParts = themeFiles
    .filter((f) => !overridden.has(f.slug))
    .map((f) => ({ slug: f.slug, file: f.file, sha256: f.sha256, content: f.content ?? null }))
  const linked = new Set()
  for (const n of navigations)
    for (const m of n.content.matchAll(/<!--\s+wp:navigation-(?:link|submenu)\s+(\{[^\n]*?\})\s+\/?-->/g)) {
      try {
        const id = Number(JSON.parse(m[1]).id)
        if (id) linked.add(id)
      } catch {}
    }
  const linkedPosts = posts
    .filter((p) => linked.has(Number(p.ID)))
    .sort(byId)
    .map((p) => ({
      id: Number(p.ID),
      type: p.post_type,
      status: p.post_status,
      slug: p.post_name,
      blocks: blockNamesOf(p.post_content)
    }))
  const frontPage =
    options.get('show_on_front') === 'page' ? Number(options.get('page_on_front')) || null : null

  // What the listing blocks of published pages and posts can reach.
  const listings = posts
    .filter((p) => p.post_status === 'publish' && (p.post_type === 'page' || p.post_type === 'post'))
    .sort(byId)
    .map((p) => ({
      id: Number(p.ID),
      type: p.post_type,
      language: languageOf(p),
      blocks: listingsOf(p.post_content)
    }))
    .filter((p) => p.blocks.length)
  const listedTypes = new Set(['post'])
  for (const p of listings) for (const b of p.blocks) if (b.postType) listedTypes.add(b.postType)
  // Taxonomies that only tie a post to its translations or its theme filter nothing a listing shows.
  const ignored = new Set(['language', 'post_translations', 'wp_theme', 'wp_template_part_area'])
  const listedPosts = posts
    .filter((p) => p.post_status === 'publish' && listedTypes.has(p.post_type))
    .sort(byId)
    .map((p) => {
      const own = {}
      for (const t of termsOf.get(p.ID) ?? []) {
        if (ignored.has(t.taxonomy)) continue
        own[t.taxonomy] = [...(own[t.taxonomy] ?? []), t.id].sort((a, b) => a - b)
      }
      return {
        id: Number(p.ID),
        type: p.post_type,
        slug: p.post_name,
        author: Number(p.post_author),
        date: p.post_date,
        language: languageOf(p),
        terms: Object.fromEntries(Object.entries(own).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      }
    })
  const usedTaxonomies = new Set(listedPosts.flatMap((p) => Object.keys(p.terms)))
  const termList = [...taxonomies.values()]
    .filter((tt) => usedTaxonomies.has(tt.taxonomy))
    .map((tt) => ({
      id: Number(tt.term_id),
      taxonomy: tt.taxonomy,
      slug: terms.get(tt.term_id)?.slug ?? '',
      parent: Number(tt.parent) || 0
    }))
    .sort((a, b) => (a.taxonomy < b.taxonomy ? -1 : a.taxonomy > b.taxonomy ? 1 : a.id - b.id))
  const stickyPosts = ids(Object.values(phpArray(options.get('sticky_posts') ?? '') ?? {})).sort(
    (a, b) => a - b
  )
  return {
    $comment: `Raw navigation markup of the release, captured by capture-navigation-source.mjs from its own database archive. Input of scripts/build-wordpress-showcase-nav.mjs; never edit by hand.`,
    schemaVersion: SOURCE_SCHEMA,
    contract,
    database,
    stylesheet,
    frontPage,
    navigations,
    templateParts,
    themeParts,
    linkedPosts,
    listings,
    listedPosts,
    terms: termList,
    stickyPosts
  }
}

function main() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--'))
      args[a.slice(2)] =
        process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[++i]
  }
  if (typeof args.contract !== 'string' || typeof args.dump !== 'string' || typeof args.theme !== 'string') {
    console.error(
      'usage: capture-navigation-source.mjs --contract <design>/wp<major>/<version> --dump <database.sql.gz> --theme <theme dir> [--contracts-root <dir>] [--check]'
    )
    process.exit(2)
  }
  const root =
    typeof args['contracts-root'] === 'string'
      ? path.resolve(args['contracts-root'])
      : path.resolve(HERE, '..', 'contracts')
  const dir = path.join(root, args.contract)
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const part = manifest.quickstart?.parts?.database
  if (!part?.sha256) {
    console.error(`${args.contract}: manifest.json names no database archive`)
    process.exit(1)
  }
  const actual = sha256(readFileSync(args.dump))
  if (actual !== part.sha256) {
    console.error(`${args.dump}: sha256 ${actual} is not the release's ${part.sha256} (manifest.json)`)
    process.exit(1)
  }
  const sql = readDump(args.dump)
  const lock = JSON.parse(readFileSync(path.join(dir, 'presentation-lock.json'), 'utf8'))
  const themeFiles = themePartFilesOf(lock, wordpressStylesheet(sql)).map((f) => {
    const file = path.join(path.resolve(args.theme), f.file)
    const bytes = existsSync(file) ? readFileSync(file) : null
    return { ...f, content: bytes && sha256(bytes) === f.sha256 ? bytes.toString('utf8') : null }
  })
  const doc = captureSource({
    sql,
    contract: args.contract,
    database: { file: part.file, sha256: part.sha256 },
    themeFiles
  })
  for (const t of doc.themeParts.filter((t) => t.content === null))
    console.error(
      `${args.contract}: ${args.theme}/${t.file} is not the bytes presentation-lock.json pins — its content stays null`
    )
  const text = `${JSON.stringify(doc, null, 2)}\n`
  const file = path.join(dir, SOURCE_FILE)
  if (args.check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error(`${args.contract}/${SOURCE_FILE} differs from the archive — run without --check`)
      process.exit(1)
    }
  } else writeFileSync(file, text)
  console.log(
    `${args.contract}  ${doc.navigations.length} navigation(s), ${doc.templateParts.length} template part(s), ${doc.themeParts.length} theme part file(s), ${doc.linkedPosts.length} linked post(s), ${doc.listings.length} page(s) with listings, ${doc.listedPosts.length} listed post(s)`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
