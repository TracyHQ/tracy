// The link gate (TCH #1013; readiness PAGE-4 / PAGE-7): every page a customer can untick is a row of the RECORDS table at
// its menu path, a child of an unticked page goes with it, and nothing keeps a child alive on a kept page's behalf.
// The pure half (`src/lib/page-records.ts`) runs here; `link-gate.ts` imports EmDash, so the table and the wiring are held
// at the SOURCE, as in the other EmDash themes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkChecker, pageRecordFor } from '../src/lib/page-records.ts'
import { listedChildren } from '../src/lib/listed-children.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')

/** The rows of the RECORDS table of link-gate.ts: key → page slug. */
function recordsTable() {
  const gate = read('src/lib/link-gate.ts')
  const body = /const RECORDS: RecordTable = \{([^]*?)\n\}/.exec(gate)?.[1] ?? ''
  return new Map(
    [...body.matchAll(/^\s*(?:'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*page\('([^']+)'\)/gm)].map((m) => [
      m[1] ?? m[2],
      m[3]
    ])
  )
}

const SYSTEM = new Set(['smart-search', 'tagged-items'])

/** The menu path of every page record the primary menu opens, from the seed: path (no slashes) → slug. */
function menuPaths() {
  const model = JSON.parse(read('seed/site-model.json'))
  const pages = new Map(
    model.records
      .filter((r) => r.type === 'pages' && r.status !== 'draft')
      .map((r) => [r.values.path, r.slug])
  )
  const out = new Map()
  const walk = (items) => {
    for (const item of items) {
      const slug = item.path && pages.get(item.path)
      // Smart Search and Tagged Items are system pages: Tracy never lists them, the router serves them always
      if (slug && item.path !== '/' && !SYSTEM.has(slug)) out.set(item.path.replace(/^\/+|\/+$/g, ''), slug)
      walk(item.children ?? [])
    }
  }
  walk(model.menus.find((m) => m.name === 'primary').items)
  return out
}

test('every page of the main menu is a row of the link gate, at its menu path', () => {
  const table = recordsTable()
  const paths = menuPaths()
  assert.ok(paths.size >= 13, `the menu opens ${paths.size} pages`)
  for (const [pathKey, slug] of paths) assert.equal(table.get(pathKey), slug, `/${pathKey} -> ${slug}`)
})

test('the blog categories and the albums hang under their list page', () => {
  const table = Object.fromEntries(recordsTable())
  const gate = read('src/lib/link-gate.ts')
  assert.match(
    gate,
    /BLOG_CATEGORIES\.map\(\(c\) => \[c, page\('blog'\)\]\)/,
    'a category and its articles go with Blog'
  )
  assert.equal(table.gallery, 'gallery', 'an album (/gallery/<slug>) goes with Gallery by prefix')
})

test('a path lands on the record of the longest key that prefixes it', () => {
  const table = {
    menu: { collection: 'pages', slug: 'menu' },
    'menu/simple-menu': { collection: 'pages', slug: 'simple-menu' },
    gallery: { collection: 'pages', slug: 'gallery' }
  }
  assert.equal(pageRecordFor('/menu', table, ['en'])?.slug, 'menu')
  assert.equal(pageRecordFor('/menu/simple-menu', table, ['en'])?.slug, 'simple-menu')
  assert.equal(pageRecordFor('/en/gallery/sample-album-7', table, ['en'])?.slug, 'gallery')
  assert.equal(pageRecordFor('/restaurant-news/x', table, ['en']), null, 'a path no key owns is never gated')
})

test('a page that is off takes its children with it, and no kept page keeps one alive', async () => {
  const table = {
    blog: { collection: 'pages', slug: 'blog' },
    gallery: { collection: 'pages', slug: 'gallery' }
  }
  const off = new Set(['pages/blog'])
  const check = linkChecker(
    async ({ collection, slug }) => !off.has(`${collection}/${slug}`),
    table,
    ['en'],
    async () => listedChildren()
  )
  const live = await check(['/blog', '/blog/x', '/gallery/album', '/'])
  assert.equal(live('/blog'), false)
  assert.equal(live('/blog/x'), false)
  assert.equal(live('/gallery/album'), true)
  assert.equal(live('/'), true)
  assert.deepEqual([...listedChildren()], [])
})

test('the router answers 404 for a path whose page is off, and the lists draw no card that would lead there', () => {
  assert.match(
    read('src/pages/[...path].astro'),
    /!\(await childLive\(Astro\.request, locale, clean\)\)\) view = null/
  )
  for (const file of [
    'src/views/Home.astro',
    'src/views/BlogList.astro',
    'src/views/Search.astro',
    'src/views/Post.astro',
    'src/components/sections/Categories.astro'
  ])
    assert.match(read(file), /await livePosts\(Astro\.request, locale,/, file)
})
