// TCH #1013, decided 08/10/2026: when the customer unticks a page, (1) a button or link in content that leads to it goes
// on its own (its section stays, nothing is relinked), and (2) the page's children go with it: `/team/<slug>`,
// `/blog/<slug>`, `/services/<slug>` answer 404 like their list page. Both read the page record Apply unpublishes, on the
// very test the list view answers 404 on (`!entry`), so re-publishing the page (or `personalize --revert`) brings every
// button and child back with no second step.
//
// The pure half (`src/lib/page-records.ts`) runs here; the wiring in the views is held at the SOURCE, since no Astro
// renderer runs in this package's node tests.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkChecker, pageRecordFor } from '../src/lib/page-records.ts'
import { listedChildren } from '../src/lib/listed-children.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const TABLE = {
  services: { collection: 'services_page', slug: 'services' },
  projects: { collection: 'projects_page', slug: 'projects' },
  contact: { collection: 'contact', slug: 'contact' }
}

test('an internal link lands on the record its first segment names, through a locale prefix and into children', () => {
  assert.deepEqual(pageRecordFor('/services', TABLE, ['en', 'vi']), TABLE.services)
  assert.deepEqual(pageRecordFor('/vi/services', TABLE, ['en', 'vi']), TABLE.services)
  assert.deepEqual(pageRecordFor('/projects/harbour-bridge', TABLE, ['en']), TABLE.projects)
  assert.deepEqual(pageRecordFor('/projects/sector/energy?x=1#top', TABLE, ['en']), TABLE.projects)
  assert.deepEqual(pageRecordFor('/contact/', TABLE, ['en']), TABLE.contact)
})

test('a link that lands on no page record is nothing to check', () => {
  for (const url of [
    undefined,
    null,
    '',
    '#',
    '#top',
    '/',
    '/vi',
    '/search',
    'https://example.com/services',
    '//cdn.x/services',
    'mailto:a@b.c',
    'tel:+1'
  ])
    assert.equal(pageRecordFor(url, TABLE, ['en', 'vi']), null, String(url))
})

test('the checker hides a link only when its page record is off, and asks each record once', async () => {
  const asked = []
  const published = new Set(['contact/contact'])
  const check = linkChecker(
    async (r) => {
      asked.push(`${r.collection}/${r.slug}`)
      return published.has(`${r.collection}/${r.slug}`)
    },
    TABLE,
    ['en']
  )
  const live = await check(['/services', '/services/design', '/contact', 'https://x.y', undefined])
  assert.equal(live('/services'), false)
  assert.equal(live('/services/design'), false)
  assert.equal(live('/contact'), true)
  assert.equal(live('https://x.y'), true)
  assert.equal(live(undefined), true)
  await check(['/services'])
  assert.deepEqual(asked, ['services_page/services', 'contact/contact'])
})

test('a record the checker could not read keeps its link (a lookup error never hides content)', async () => {
  const check = linkChecker(
    async () => {
      throw new Error('db down')
    },
    TABLE,
    ['en']
  )
  assert.equal((await check(['/services']))('/services'), true)
})

test('the route table covers every page a customer can untick (tracy_site_pages.json)', () => {
  const gate = read('src/lib/link-gate.ts')
  for (const [seg, collection, slug] of [
    ['product', 'product', 'product'],
    ['services', 'services_page', 'services_page'],
    ['pricing', 'pricing', 'pricing'],
    ['blog', 'blog', 'blog'],
    ['about', 'about', 'about']
  ])
    assert.match(gate, new RegExp(`${seg}: \\{ collection: '${collection}', slug: '${slug}' \\}`), seg)
})

test('page-records.ts is the same file in every EmDash theme', () => {
  const mine = read('src/lib/page-records.ts')
  assert.equal(
    mine,
    readFileSync(path.join(ROOT, '../tracy-emdash-theme-business/src/lib/page-records.ts'), 'utf8')
  )
})

// ── (1) a button or link into an unticked page goes on its own: the sections every view composes ────────────────────
for (const [file, guards] of [
  [
    'src/components/sections/CtaBand.astro',
    ['{btnLabel && live(btnUrl) && <a', '{linkLabel && live(linkUrl) && <a']
  ],
  [
    'src/components/sections/HeroAcm.astro',
    ['{cta1Label && live(cta1Url) && (', '{cta2Label && live(cta2Url) && <a']
  ],
  [
    'src/components/sections/HeroOd.astro',
    ['{cta1Label && live(cta1Url) && <a', '{cta2Label && live(cta2Url) && <a']
  ],
  ['src/components/sections/Chapter.astro', ['{linkLabel && live(linkUrl) && (']],
  ['src/components/sections/InlineCta.astro', ['{label && live(url) && <a']],
  ['src/components/sections/FeaturesIntro.astro', ['{c.link_label && live(c.link_url) && (']],
  ['src/components/sections/FeatureRows.astro', ['{it.link_label && live(it.link_url) && <a']],
  ['src/components/sections/PricingTiers.astro', ['{t.cta_label && live(t.cta_url) && <a']],
  ['src/components/site/Header.astro', ['{live(contactUrl) && <a href={contactUrl}']],
  [
    'src/views/Onepage.astro',
    ['{o.hero_cta1_label && live(o.hero_cta1_url) &&', '{o.contact_cta_label && live(o.contact_cta_url) &&']
  ],
  ['src/views/Product.astro', ["link_url: live(s.link_url) ? s.link_url : ''"]]
])
  test(`${path.basename(file)} draws each link into a page only while that page is published`, () => {
    const src = read(file)
    assert.match(src, /await liveLinks\(\s*Astro\.request,\s*/, 'it asks the gate')
    for (const g of guards) assert.ok(src.includes(g), g)
  })

// ── (2) the children of an unticked page answer 404 with it ─────────────────────────────────────────────────────────
for (const [file, base] of [
  ['src/views/Article.astro', '/blog/'],
  ['src/views/Service.astro', '/services/'],
  ['src/views/Person.astro', '/team/']
])
  test(`${path.basename(file)} answers 404 when its list page is off and no kept page lists it`, () => {
    const src = read(file)
    assert.ok(
      src.includes(`const reachable = await childLive(Astro.request, locale, \`${base}\${slug}\`)`),
      base
    )
    assert.match(
      src,
      /if \(!entry \|\| entry\.data\.status !== 'published' \|\| !reachable\) \{\s*Astro\.response\.status = 404/
    )
  })

// Decided 08/10/2026: a child stays reachable while a page the customer KEPT still lists it. The Team page lists the
// posts of category `people` (its notes), so Blog unticked with Team kept leaves those posts open and listed there.
test('Blog unticked, Team kept: the notes Team lists stay listed, no other post does', () => {
  const seed = JSON.parse(read('seed/seed.json'))
  const posts = seed.content.posts.filter((e) => (e.locale ?? 'en') === 'en')
  const notes = posts.filter((e) => (e.taxonomies?.category ?? []).includes('people')).map((e) => e.slug)
  assert.ok(notes.length > 0)
  const listed = listedChildren({ team: true }, notes)
  assert.deepEqual([...listed].sort(), notes.map((s) => `/blog/${s}`).sort())
  assert.equal(listedChildren({ team: false }, notes).size, 0)
})

test('the Base gate wires the listed set, and Team lists its notes whether or not Blog is ticked', () => {
  const gate = read('src/lib/link-gate.ts')
  assert.match(gate, /listedChildren\(\s*\{ team: Boolean\(/)
  assert.match(gate, /RECORDS,\s*LOCALES,\s*\(\) => listed\(locale\)/)
  assert.match(
    read('src/views/Team.astro'),
    /const notes = posts\.filter\(\(p\) => noteSlugs\.has\(p\.slug\)\)/
  )
})

test('a post kept alive by Team draws its crumbs, category, tags and neighbours only while reachable', () => {
  const src = read('src/views/Article.astro')
  assert.match(src, /\]\.filter\(\(i\) => !i\.url \|\| live\(i\.url\)\)/)
  assert.match(src, /const tagLinks = tags\.filter\(\(t\) => live\(`\/blog\/tag\/\$\{t\.slug\}`\)\)/)
  assert.match(src, /const prev = older && live\(`\/blog\/\$\{older\.slug\}`\) \? older : undefined/)
  assert.match(src, /const next = newer && live\(`\/blog\/\$\{newer\.slug\}`\) \? newer : undefined/)
  const card = read('src/components/site/PostCard.astro')
  assert.match(card, /post\.category && live\(categoryUrl\)/)
  assert.match(card, /\(post\.tags \?\? \[\]\)\.filter\(\(t\) => live\(`\/blog\/tag\/\$\{t\.slug\}`\)\)/)
})

test('the footer columns and the mobile drawer groups list a link only while the page it leads into is published', () => {
  const footer = read('src/components/site/Footer.astro')
  assert.match(footer, /links: c\.links\.filter\(\(l\) => live\(l\.url\)\)/)
  assert.match(footer, /\.filter\(\(c\) => c\.links\.length > 0\)/)
  const header = read('src/components/site/Header.astro')
  assert.match(header, /links: g\.links\.filter\(\(l\) => liveGroup\(l\.url\)\)/)
})

test('the latest-posts list of a service goes when the blog page is off (it is the blog feed, not a list Services keeps)', () => {
  assert.match(read('src/views/Service.astro'), /const latest = blogLive \?/)
})

test('the sitemap page lists a group or link only while the page it leads into is published', () => {
  const src = read('src/views/Sitemap.astro')
  assert.match(src, /items: g\.items\.filter\(\(i\) => live\(i\.url\)\)/)
  assert.match(src, /\.filter\(\(g\) => g\.items\.length > 0 && live\(g\.url\)\)/)
})
