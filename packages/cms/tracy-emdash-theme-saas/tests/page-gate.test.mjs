// TCH #1013, decided 08/10/2026: when the customer unticks a page, (1) a button or link that leads to it goes on its own
// (its section stays, nothing is relinked), and (2) the page's children go with it: Blog unticked, `/product/blog/<post>`
// and the blog's category, tag, author, archive and search views answer 404 like `/product/blog`. Both read the `pages`
// row Apply unpublishes, so re-publishing it (or `personalize --revert`) brings every link and child back.
//
// Pages here carry their own nested `path`, so the route table is keyed by path. The pure half
// (`src/lib/page-records.ts`, the same file in every EmDash theme) runs here; the wiring is held at the SOURCE.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkChecker, pageRecordFor } from '../src/lib/page-records.ts'
import { listedChildren, slugify } from '../src/lib/listed-children.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')

test('page-records.ts is the same file in every EmDash theme', () => {
  const mine = read('src/lib/page-records.ts')
  for (const t of ['business', 'base'])
    assert.equal(
      mine,
      readFileSync(path.join(ROOT, `../tracy-emdash-theme-${t}/src/lib/page-records.ts`), 'utf8'),
      t
    )
})

/** The table `src/lib/link-gate.ts` declares, read from its source (it imports `emdash`, which node cannot load). */
const table = () => {
  const src = read('src/lib/link-gate.ts')
  const body = src.slice(
    src.indexOf('export const RECORDS'),
    src.indexOf('\n}\n', src.indexOf('export const RECORDS'))
  )
  return Object.fromEntries(
    [...body.matchAll(/^\s*'?([a-z0-9/-]+)'?: page\('([a-z0-9-]+)'\)/gm)].map(([, key, slug]) => [
      key,
      { collection: 'pages', slug }
    ])
  )
}

test('every page a customer can untick is in the table, at the path its row serves', () => {
  const seed = JSON.parse(read('seed/seed.json'))
  const rows = seed.content.pages.filter((e) => (e.locale ?? 'en') === 'en')
  const t = table()
  for (const slug of [
    'features',
    'integrations',
    'changelog',
    'blog',
    'all-categories',
    'faq',
    'pricing',
    'about',
    'team',
    'contact',
    'engineering',
    'helixql',
    'landing'
  ]) {
    const row = rows.find((e) => e.slug === slug)
    assert.ok(row, slug)
    assert.deepEqual(
      pageRecordFor(row.data.path, t),
      { collection: 'pages', slug },
      `${slug} at ${row.data.path}`
    )
  }
})

test("the blog's posts, list views and system pages land on the blog page", () => {
  const t = table()
  for (const url of [
    '/product/blog/some-post',
    '/product/blog/category/x',
    '/product/blog/tag/y',
    '/product/authors/z',
    '/product/article-archive',
    '/pages/tags',
    '/pages/search',
    '/pages/author'
  ])
    assert.equal(pageRecordFor(url, t)?.slug, 'blog', url)
  assert.equal(pageRecordFor('/privacy-policy', t), null)
})

// ── a child a kept page still lists stays reachable (Akemi, 08/10/2026) ────────────────────────────────────────────
/** The demo as Apply leaves it when the customer unticks `off`: the kept pages, the published posts, the categories. */
const demo = (off) => {
  const seed = JSON.parse(read('seed/seed.json'))
  const en = (list) =>
    list.filter((e) => (e.locale ?? 'en') === 'en' && (e.status ?? 'published') === 'published')
  const t = table()
  const pages = en(seed.content.pages).filter((e) => !off.includes(e.slug))
  const published = new Set(pages.map((e) => e.slug))
  const kept = pages
    .filter((e) => {
      const record = pageRecordFor(e.data.path, t)
      return !record || published.has(record.slug)
    })
    .map((e) => ({ path: e.data.path, view: e.data.view, filter: e.data.filter }))
  const posts = en(seed.content.posts).map((e) => ({
    slug: e.slug,
    category: e.taxonomies?.category?.[0],
    tags: e.taxonomies?.tag ?? [],
    authorSlug: slugify(String(e.data.author ?? ''))
  }))
  const tax = seed.taxonomies.find((x) => x.name === 'category' && (x.locale ?? 'en') === 'en')
  const categories = tax.terms.map((x) => ({ slug: x.slug, parent: x.parent }))
  return { kept, posts, categories }
}
const TOPICS = ['engineering', 'incident-retros', 'product', 'tutorials', 'practice', 'culture']

test('Blog unticked, Engineering and All categories kept: their posts and category views stay listed, nothing else', () => {
  const { kept, posts, categories } = demo(['blog'])
  const listed = listedChildren(kept, posts, categories)
  const engineering = posts.filter((p) => p.category === 'engineering')
  assert.ok(engineering.length > 0)
  for (const p of engineering) assert.ok(listed.has(`/product/blog/${p.slug}`), p.slug)
  for (const c of TOPICS) assert.ok(listed.has(`/product/blog/category/${c}`), c)
  for (const p of posts.filter((x) => TOPICS.includes(x.category)))
    assert.ok(listed.has(`/product/blog/${p.slug}`), p.slug)
  // The blog's own root category is listed only by the blog page itself.
  const rootOnly = posts.filter((p) => p.category === 'field-notes-from-the-on-call')
  assert.ok(rootOnly.length > 0)
  for (const p of rootOnly) assert.equal(listed.has(`/product/blog/${p.slug}`), false, p.slug)
  assert.equal(listed.has('/product/blog'), false)
  assert.equal(
    [...listed].some((u) => u.includes('/tag/') || u.startsWith('/product/authors')),
    false
  )
})

test('Blog, Engineering and All categories all unticked: no kept page lists a post, every child answers 404', () => {
  const { kept, posts, categories } = demo(['blog', 'engineering', 'all-categories'])
  assert.equal(listedChildren(kept, posts, categories).size, 0)
})

test('only All categories kept: its category views and their posts stay, Engineering is no longer a lister', () => {
  const { kept, posts, categories } = demo(['blog', 'engineering'])
  const listed = listedChildren(kept, posts, categories)
  for (const c of TOPICS) assert.ok(listed.has(`/product/blog/category/${c}`), c)
  const { kept: k2 } = demo(['blog', 'all-categories'])
  const onlyEngineering = listedChildren(k2, posts, categories)
  assert.equal(
    onlyEngineering.has('/product/blog/category/engineering'),
    false,
    'Engineering lists posts, not views'
  )
  assert.ok(
    [...onlyEngineering].every((u) =>
      posts.some((p) => u === `/product/blog/${p.slug}` && p.category === 'engineering')
    )
  )
})

test('the gate answers through the listed set: a listed post is live with Blog off, the Blog page and a stray post are not', async () => {
  const { kept, posts, categories } = demo(['blog'])
  const listed = listedChildren(kept, posts, categories)
  const check = linkChecker(
    async (r) => r.slug !== 'blog',
    table(),
    ['en', 'vi'],
    async () => listed
  )
  const eng = posts.find((p) => p.category === 'engineering').slug
  const root = posts.find((p) => p.category === 'field-notes-from-the-on-call').slug
  const urls = [
    '/product/blog',
    `/product/blog/${eng}`,
    `/vi/product/blog/${eng}`,
    `/product/blog/${root}`,
    '/product/blog/category/practice',
    '/product/blog/tag/slo',
    '/product/authors/x',
    '/pages/engineering'
  ]
  const live = await check(urls)
  assert.deepEqual(urls.map(live), [false, true, true, false, true, false, false, true])
})

test('the SaaS gate wires the listed set: kept pages are published rows whose own record is published', () => {
  const src = read('src/lib/link-gate.ts')
  assert.match(src, /listedChildren\(/)
  assert.match(src, /linkChecker\([\s\S]*RECORDS,\s*LOCALES,\s*listed/)
})

for (const [file, guards] of [
  [
    'src/components/sections/Cta.astro',
    [
      'const show1 = Boolean(data.btn1_label) && live(data.btn1_link)',
      'const show2 = Boolean(data.btn2_label) && live(data.btn2_link)'
    ]
  ],
  [
    'src/components/sections/Hero.astro',
    [
      'const show1 = Boolean(data.cta1_label) && live(data.cta1_link)',
      'const show2 = Boolean(data.cta2_label) && live(data.cta2_link)'
    ]
  ],
  ['src/components/sections/FaqSupport.astro', ['{data.btn_label && live(data.btn_link) && (']],
  ['src/components/sections/KineticqlSplit.astro', ['{data.cta_label && live(data.cta_link) && (']],
  [
    'src/components/sections/Pricing.astro',
    ['{plan.cta_label && live(plan.cta_link) && (', '{data.inc_cta_label && live(data.inc_cta_link) && (']
  ],
  ['src/views/NotFound.astro', ['{live(blogUrl) && <a href={blogUrl}']]
])
  test(`${path.basename(file)} draws each link into a page only while that page is published`, () => {
    const src = read(file)
    assert.match(src, /await liveLinks\(\s*Astro\.request,\s*/)
    for (const g of guards) assert.ok(src.includes(g), g)
  })

test('the chrome menus drop links into an unticked page or its children, and a heading left empty', () => {
  const src = read('src/lib/chrome.ts')
  assert.match(src, /if \(!live\(i\.url\)\) return \[\]/)
  assert.match(src, /children\.length === 0 && !String\(i\.url\)\.startsWith\('\/'\)\) return \[\]/)
})

test('the router answers 404 for a child of an unticked page', () => {
  assert.match(
    read('src/pages/[...path].astro'),
    /if \(view && record && record\.slug !== page\?\.slug && !\(await liveLinks\(\s*Astro\.request,\s*locale, \[path\]\)\)\(path\)\)\s*view = null/
  )
})

// A post or category view that a kept page keeps alive renders with the blog off, so its own links into the blog
// family are drawn only while their target is reachable: the Blog crumb, other categories, tags, the byline, related
// posts. With the blog on every one of them is live and the page is unchanged.
test('a post list kept alive by a kept page draws its crumbs, categories and tags only while they are reachable', () => {
  const src = read('src/views/Blog.astro')
  assert.match(src, /const live = await liveLinks\(\s*Astro\.request,\s*locale, \[/)
  assert.match(src, /const crumbs = allCrumbs\.filter\(\(c\) => !c\.href \|\| live\(c\.href\)\)/)
  assert.match(
    src,
    /const categories = allCategories\.filter\(\(c\) => catCounts\.get\(c\.slug\) && live\(categoryPath\(c\.slug\)\)\)/
  )
  assert.match(src, /\.filter\(\(t\) => tagCounts\.get\(t\.slug\) && live\(tagPath\(t\.slug\)\)\)/)
})

test('a post kept alive by a kept page draws its crumbs, category, byline, tags and related posts only while reachable', () => {
  const src = read('src/views/Article.astro')
  assert.match(src, /const live = await liveLinks\(\s*Astro\.request,\s*locale, \[/)
  assert.match(src, /\]\.filter\(\(c\) => !c\.href \|\| live\(c\.href\)\)/)
  assert.match(src, /const categoryUrl =\s*post\?\.category && live\(categoryPath\(post\.category\.slug\)\)/)
  assert.match(src, /const authorUrl =\s*post\?\.author && live\(authorPath\(post\.authorSlug\)\)/)
  assert.match(
    src,
    /const tagItems = \(post\?\.tags \?\? \[\]\)\.filter\(\(t\) => live\(tagPath\(t\.slug\)\)\)/
  )
  assert.match(
    src,
    /\.filter\(\(p\) => p\.id !== post\.id && p\.category\?\.slug === post\.category\?\.slug && live\(postPath\(p\.slug\)\)\)/
  )
})
