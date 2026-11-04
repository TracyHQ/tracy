// TCH #1013, decided 08/10/2026: when the customer unticks a page, (1) a button or link in content that leads to it goes
// on its own (its section stays, nothing is relinked), and (2) the page's children go with it: `/blog/<slug>`
// answers 404 like its list page. Both read the page record Apply unpublishes, on the
// very test the list view answers 404 on (`!entry`), so re-publishing the page (or `personalize --revert`) brings every
// button and child back with no second step.
//
// The pure half (`src/lib/page-records.ts`) runs here; the wiring in the views is held at the SOURCE, since no Astro
// renderer runs in this package's node tests.
//
// Source of PAGE_RECORDS_SHA256: sha256 of `src/lib/page-records.ts` of Tracy Base at `tracy` commit 9800b339f (package
// 0.5.6, the snapshot this template was copied from — PROVENANCE.md), which is byte-identical in every EmDash theme there.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkChecker, pageRecordFor } from '../src/lib/page-records.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAGE_RECORDS_SHA256 = '490bbe348ae80ac7e429e0342e2f898768e2c43c1331905b83c71e2f51eca1ea'
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
    ['menu', 'menu_page', 'menu_page'],
    ['blog', 'blog', 'blog'],
    ['about', 'about', 'about'],
    ['contact', 'contact', 'contact']
  ])
    assert.match(gate, new RegExp(`${seg}: \\{ collection: '${collection}', slug: '${slug}' \\}`), seg)
})

test('page-records.ts is the same file in every EmDash theme', () => {
  // This repo has no Business theme beside it: the file is held to Tracy Base's copy, frozen at `tracy` 9800b339f.
  assert.equal(
    createHash('sha256').update(read('src/lib/page-records.ts')).digest('hex'),
    PAGE_RECORDS_SHA256
  )
})

// ── (1) a button or link into an unticked page goes on its own: the sections every view composes ────────────────────
for (const [file, guards] of [
  [
    'src/components/sections/CtaBand.astro',
    ['{btnLabel && live(btnUrl) && <a', '{linkLabel && live(linkUrl) && <a']
  ],
  ['src/components/sections/Chapter.astro', ['{linkLabel && live(linkUrl) && (']],
  ['src/components/site/Header.astro', ['{live(contactUrl) && <a href={contactUrl}']],
  [
    'src/views/Home.astro',
    [
      '{h.intro_cta_label && live(h.intro_cta_url) && <a',
      '{h.featured_cta_label && live(h.featured_cta_url) && <p',
      '{h.contact_label && live(h.contact_url) && <a',
      // a featured card stays, only its link into the menu goes
      'const link = live(menuHref(c.slug)) ? menuHref(c.slug) : undefined',
      "const Card = link ? 'a' : 'div'"
    ]
  ],
  ['src/views/Menu.astro', ['const buttons = asked.filter((b) => live(b.href))']],
  ['src/views/Search.astro', ['const shown = results.filter((r) => live(target(r)))']]
])
  test(`${path.basename(file)} draws each link into a page only while that page is published`, () => {
    const src = read(file)
    assert.match(src, /await liveLinks\(\s*Astro\.request,\s*/, 'it asks the gate')
    for (const g of guards) assert.ok(src.includes(g), g)
  })

// ── (2) the children of an unticked page answer 404 with it ─────────────────────────────────────────────────────────
for (const [file, base] of [['src/views/Article.astro', '/blog/']])
  test(`${path.basename(file)} answers 404 when its list page is off`, () => {
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

test('the footer columns and the mobile drawer groups list a link only while the page it leads into is published', () => {
  const footer = read('src/components/site/Footer.astro')
  assert.match(footer, /links: c\.links\.filter\(\(l\) => live\(l\.url\)\)/)
  assert.match(footer, /\.filter\(\(c\) => c\.links\.length > 0\)/)
  const header = read('src/components/site/Header.astro')
  assert.match(header, /links: g\.links\.filter\(\(l\) => liveGroup\(l\.url\)\)/)
})

test('the sitemap page lists a group or link only while the page it leads into is published', () => {
  const src = read('src/views/Sitemap.astro')
  assert.match(src, /items: g\.items\.filter\(\(i\) => live\(i\.url\)\)/)
  assert.match(src, /\.filter\(\(g\) => g\.items\.length > 0 && live\(g\.url\)\)/)
})
