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
function _recordsTable() {
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
function _menuPaths() {
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

// ── a nested page hangs under its parent (parent-gate.ts) ──────────────────────────────────────────────────────────
import { withParents } from '../src/lib/parent-gate.ts'
import { menuUrls, pruneMenu } from '../src/lib/menu-gate.ts'

const NESTED = {
  menu: { collection: 'pages', slug: 'menu' },
  'menu/simple-menu': { collection: 'pages', slug: 'simple-menu' },
  'about-us': { collection: 'pages', slug: 'about-us' },
  'about-us/our-history': { collection: 'pages', slug: 'our-history' }
}
const published =
  (off) =>
  async ({ slug }) =>
    !off.includes(slug)

test('the longest key alone lets a child outlive its unticked parent (the defect)', async () => {
  const plain = await linkChecker(published(['menu']), NESTED, ['en'])(['/menu', '/menu/simple-menu'])
  assert.equal(plain('/menu'), false)
  assert.equal(plain('/menu/simple-menu'), true, 'what the kit checker answers: the child is its own record')
})

test('a child of an unticked page is unreachable, a child of a kept page stays, and the parent of a kept child is its own', async () => {
  const check = withParents(linkChecker(published(['menu']), NESTED, ['en']), NESTED, ['en'])
  const live = await check([
    '/menu',
    '/menu/simple-menu',
    '/en/menu/simple-menu',
    '/about-us/our-history',
    '/about-us'
  ])
  assert.equal(live('/menu'), false)
  assert.equal(live('/menu/simple-menu'), false, 'under the unticked Menu')
  assert.equal(live('/en/menu/simple-menu'), false, 'through a locale prefix')
  assert.equal(live('/about-us'), true)
  assert.equal(live('/about-us/our-history'), true)
  const childOff = await withParents(linkChecker(published(['simple-menu']), NESTED, ['en']), NESTED, ['en'])(
    ['/menu', '/menu/simple-menu']
  )
  assert.equal(childOff('/menu'), true, 'unticking a child leaves its parent')
  assert.equal(childOff('/menu/simple-menu'), false)
})

test('the router asks the page and its parents (link-gate.ts wires withParents)', () => {
  const gate = read('src/lib/link-gate.ts')
  assert.match(gate, /withParents\(\s*linkChecker\(/)
})

// ── the main menu draws no link to an unticked page (menu-gate.ts) ─────────────────────────────────────────────────────
test('the menu drops an unticked page with everything under it, and a heading with nothing left', async () => {
  const menu = [
    { label: 'Home', url: '/', children: [] },
    { label: 'Menu', url: '/menu', children: [{ label: 'Simple', url: '/menu/simple-menu', children: [] }] },
    {
      label: 'About',
      url: '/about-us',
      children: [{ label: 'History', url: '/about-us/our-history', children: [] }]
    },
    { label: 'Explore', url: '', children: [{ label: 'Menu again', url: '/menu/simple-menu', children: [] }] }
  ]
  const check = withParents(linkChecker(published(['menu']), NESTED, ['en']), NESTED, ['en'])
  const live = await check(menuUrls(menu))
  const kept = pruneMenu(menu, live)
  assert.deepEqual(
    kept.map((i) => i.label),
    ['Home', 'About'],
    'Menu goes with its child; Explore had only that child'
  )
  assert.deepEqual(
    kept[1].children.map((c) => c.label),
    ['History']
  )
  const all = pruneMenu(menu, () => true)
  assert.equal(all.length, 4)
})

test('the header draws the menu through the gate, and no other component renders menu URLs', () => {
  const header = read('src/components/site/Header.astro')
  assert.match(header, /pruneMenu\(chrome\.primary, live\)/)
  assert.doesNotMatch(header, /chrome\.primary\.(map|find|filter)/, 'every draw reads the pruned menu')
  for (const file of ['src/components/site/Footer.astro', 'src/layouts/Base.astro'])
    assert.doesNotMatch(read(file), /chrome\.primary|getMenu\(/, file)
})
