// TCH #1013, decided 08/10/2026: when the customer unticks a page, (1) a button or link in content that leads to it goes
// on its own (its section stays, nothing is relinked), and (2) the page's children go with it: `/projects/<slug>`,
// `/news/<slug>`, `/services/<slug>` answer 404 like their list page. Both read the page record Apply unpublishes, on the
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
import { linkChecker, pageRecordFor, sitePath } from '../src/lib/page-records.ts'
import { investorDisclosures, listedChildren } from '../src/lib/listed-children.ts'

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

test('a nested page path wins over a shorter one, and its children land on it (SaaS routes pages by their own path)', () => {
  const nested = {
    product: { collection: 'pages', slug: 'product' },
    'product/blog': { collection: 'pages', slug: 'blog' }
  }
  assert.deepEqual(pageRecordFor('/product/blog', nested), nested['product/blog'])
  assert.deepEqual(pageRecordFor('/product/blog/category/news', nested), nested['product/blog'])
  assert.deepEqual(pageRecordFor('/product/features', nested), nested.product)
  assert.equal(pageRecordFor('/company/about', nested), null)
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

test('sitePath reads an internal URL as its site path: no locale prefix, query, hash or trailing slash', () => {
  assert.equal(sitePath('/vi/news/a-post?x=1#top', ['en', 'vi']), '/news/a-post')
  assert.equal(sitePath('/news/a-post/', ['en']), '/news/a-post')
  assert.equal(sitePath('/', ['en']), '/')
  for (const url of [undefined, '', '#top', 'https://x.y/news', '//cdn/x', 'mailto:a@b.c'])
    assert.equal(sitePath(url, ['en']), null, String(url))
})

// Decided 08/10/2026: a child of an unticked page stays reachable while a page the customer KEPT still lists it, and
// answers 404 only when no kept page lists it. `listed` is that set of child paths, read only when a record is off.
test('a child a kept page still lists stays live under an unticked page; its siblings and the page itself do not', async () => {
  let reads = 0
  const check = linkChecker(
    async () => false,
    { news: { collection: 'news_page', slug: 'news' } },
    ['en', 'vi'],
    async () => {
      reads++
      return new Set(['/news/q3-results'])
    }
  )
  const live = await check([
    '/news',
    '/news/q3-results',
    '/vi/news/q3-results?ref=ir',
    '/news/other',
    '/news/category/x'
  ])
  assert.equal(live('/news'), false, 'the unticked page itself never comes back')
  assert.equal(live('/news/q3-results'), true)
  assert.equal(live('/vi/news/q3-results?ref=ir'), true)
  assert.equal(live('/news/other'), false)
  assert.equal(live('/news/category/x'), false)
  await check(['/news/other'])
  assert.equal(reads, 1, 'the listed set is read once per checker')
})

test('the listed set is never read while every record asked is published', async () => {
  const check = linkChecker(
    async () => true,
    { news: { collection: 'news_page', slug: 'news' } },
    ['en'],
    async () => {
      throw new Error('must not be read')
    }
  )
  assert.equal((await check(['/news/a']))('/news/a'), true)
})

test('a listed set that cannot be read keeps the old answer for an unticked page (its children go)', async () => {
  const check = linkChecker(
    async () => false,
    { news: { collection: 'news_page', slug: 'news' } },
    ['en'],
    async () => {
      throw new Error('db down')
    }
  )
  assert.equal((await check(['/news/a']))('/news/a'), false)
})

test('the route table covers every page a customer can untick (tracy_site_pages.json)', () => {
  const gate = read('src/lib/link-gate.ts')
  for (const [seg, collection, slug] of [
    ['about', 'about', 'about'],
    ['services', 'services_page', 'services'],
    ['projects', 'projects_page', 'projects'],
    ['news', 'news_page', 'news'],
    ['contact', 'contact', 'contact']
  ])
    assert.match(gate, new RegExp(`${seg}: \\{ collection: '${collection}', slug: '${slug}' \\}`), seg)
})

// ── (1) a button or link into an unticked page goes on its own ──────────────────────────────────────────────────────
for (const [file, marks] of [
  [
    'src/views/Home.astro',
    ['$page("hero_cta1_label")', '$page("services_all_label")', '$page("band_button")']
  ],
  ['src/views/About.astro', ['$page("cta_button")', '$page("cta_alt_label")']],
  ['src/views/Services.astro', ['$page("cta_button")', '$page("cta_alt_label")']],
  ['src/views/Service.astro', ['$sp("cta_button")']],
  ['src/views/Project.astro', ['$pp("cta_button")']],
  ['src/views/Article.astro', ['$np("aside_button")']],
  ['src/components/site/CtaBox.astro', ['at("button")', 'at("altLabel")']],
  ['src/components/site/Header.astro', ['s("quote_label")']],
  ['src/components/site/Footer.astro', ['s("footer_book_label")']]
])
  test(`${path.basename(file)} draws each link into a page only while that page is published`, () => {
    const src = read(file)
    assert.match(src, /await liveLinks\(\s*Astro\.request,\s*/, 'the view asks the gate')
    for (const mark of marks) {
      const at = src.indexOf(mark)
      assert.ok(at !== -1, `${mark} is still in the source`)
      const line = src.slice(src.lastIndexOf('\n', at), at)
      assert.match(line, /live\(/, `${mark} sits under live(…)`)
    }
  })

test('the 404 page lists a suggestion only while the page it leads to is published', () => {
  assert.match(read('src/views/NotFound.astro'), /\.filter\(\(s\) => live\(s\.url\)\)/)
})

// ── (2) the children of an unticked page answer 404 with it ─────────────────────────────────────────────────────────
for (const [file, base] of [
  ['src/views/Project.astro', '/projects/'],
  ['src/views/Article.astro', '/news/'],
  ['src/views/Service.astro', '/services/']
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

test('a news post draws its crumbs, tags, neighbours and related posts only while reachable, never the unpublished News words', () => {
  const src = read('src/views/Article.astro')
  assert.doesNotMatch(src, /status: 'draft'/)
  assert.match(src, /\]\.filter\(\(i\) => !i\.url \|\| live\(i\.url\)\)/)
  assert.match(src, /const tagLinks = tags\.filter\(\(t\) => live\(`\/news\/tag\/\$\{t\.slug\}`\)\)/)
  assert.match(src, /const prev = older && live\(`\/news\/\$\{older\.slug\}`\) \? older : undefined/)
  assert.match(src, /const next = newer && live\(`\/news\/\$\{newer\.slug\}`\) \? newer : undefined/)
  assert.match(src, /cat && p\.category\?\.slug === cat\.slug && live\(`\/news\/\$\{p\.slug\}`\)/)
})

test('search lists no result whose page is off (a child of an unticked page is a dead link)', () => {
  const src = read('src/views/Search.astro')
  assert.match(src, /const live = await liveLinks\(\s*Astro\.request,\s*locale, found\.map\(urlOf\)\)/)
  assert.match(src, /const all = found\.filter\(\(r\) => live\(urlOf\(r\)\)\)/)
})

// 🔒 AN UNTICKED PAGE LEAVES NO REACHABLE CHILD (Akemi, 11/10/2026, TCH #1013; replaces the Investors exception of
// 08/10). Measured on dev (g58-biz-emd-full, Tracy Business 1.7.5, News unticked): /news answered 404 while its four
// disclosures stayed 200, linked 30 times from /investors, /sitemap, /search and from each other. With News unticked
// every post goes like every project with Projects unticked: no kept page keeps one open.
const seedPosts = () => {
  const seed = JSON.parse(read('seed/seed.json'))
  return seed.content.posts
    .filter((e) => (e.locale ?? 'en') === 'en')
    .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
    .map((e) => ({
      slug: e.slug,
      category: e.taxonomies?.category?.[0] ? { slug: e.taxonomies.category[0] } : undefined
    }))
}

test('News unticked: no post stays listed, whether or not Investors is kept', () => {
  const posts = seedPosts()
  assert.equal(investorDisclosures(posts).length, 4, 'Investors still selects its four disclosures')
  assert.equal(listedChildren({ investors: true }, posts).size, 0, 'Investors kept')
  assert.equal(listedChildren({ investors: false }, posts).size, 0, 'Investors unticked too')
})

test('News unticked, Investors kept: a post answers 404 like a project with Projects unticked', async () => {
  const off = new Set(['news_page/news'])
  const check = linkChecker(
    async (r) => !off.has(`${r.collection}/${r.slug}`),
    {
      news: { collection: 'news_page', slug: 'news' },
      investors: { collection: 'investors', slug: 'investors' }
    },
    ['en']
  )
  const live = await check(['/news', `/news/${seedPosts()[0].slug}`, '/investors'])
  assert.equal(live('/news'), false)
  assert.equal(live(`/news/${seedPosts()[0].slug}`), false)
  assert.equal(live('/investors'), true)
})

test('the investors page lists its disclosures only while the News page is published', () => {
  const src = read('src/views/Investors.astro')
  assert.match(src, /investorDisclosures\(await loadPosts\(locale\)\)/)
  assert.match(src, /const newsLive = \(await liveLinks\(Astro\.request, locale, \[newsUrl\]\)\)\(newsUrl\)/)
  assert.match(src, /const disclosures = newsLive \? investorDisclosures/)
})

test('the Business gate keeps no child of an unticked page open', () => {
  const src = read('src/lib/link-gate.ts')
  assert.doesNotMatch(src, /listed\(locale\)/)
  assert.doesNotMatch(src, /listedChildren/)
})

test('the footer columns and the sitemap page list a link only while the page it leads into is published', () => {
  const footer = read('src/components/site/Footer.astro')
  assert.match(footer, /const services = chrome\.footerServices\.filter\(\(i\) => live\(i\.url\)\)/)
  assert.match(footer, /\{services\.length > 0 && \(/)
  assert.match(read('src/views/Sitemap.astro'), /g\.items = g\.items\.filter\(\(i\) => live\(i\.url\)\)/)
})

test('the header Resources panel drops the Projects or News column when that page is off', () => {
  const header = read('src/components/site/Header.astro')
  assert.match(header, /projects: \(live\(projectsUrl\) \? chrome\.recentProjects : \[\]\)/)
  assert.match(header, /news: \(live\(newsUrl\) \? chrome\.recentNews : \[\]\)/)
  const menu = read('src/components/islands/ResourcesMenu.tsx')
  assert.match(menu, /\{p\.projects\.length > 0 && \(/)
  assert.match(menu, /\{p\.news\.length > 0 && \(/)
  assert.match(read('src/components/islands/MobileMenu.tsx'), /\{p\.quoteUrl && \(/)
})

test('the sitemap titles its Projects and News groups by URL, never by a menu position an unticked page shifts', () => {
  const src = read('src/views/Sitemap.astro')
  assert.doesNotMatch(src, /chrome\.primary\[\d\]/)
  assert.match(src, /title: menuLabel\('\/projects'\) \?\? 'Projects'/)
  assert.match(src, /menuLabel\('\/news'\) \?\?/)
})

// The marketing kit (`/kit/*`) draws mockups of an email, a newsletter and a slide deck whose buttons lead into the
// site; a button into an unticked page goes the same way as anywhere else.
for (const [file, url, button] of [
  [
    'src/components/kit/KitNewsletter.astro',
    "const ctaUrl = s.ctaUrl ?? href(locale, '/news')",
    '{live(ctaUrl) && <a href={ctaUrl} '
  ],
  [
    'src/components/kit/KitEmail.astro',
    "const ctaUrl = s.ctaUrl ?? href(locale, '/contact')",
    '{live(ctaUrl) && <a href={ctaUrl} '
  ],
  [
    'src/components/kit/KitSlides.astro',
    "const ctaUrl = href(locale, '/contact')",
    '{live(ctaUrl) && <a href={ctaUrl} '
  ]
])
  test(`${path.basename(file)} draws its button into the site only while that page is published`, () => {
    const src = read(file)
    assert.ok(src.includes(url), url)
    assert.match(src, /const live = await liveLinks\(\s*Astro\.request,\s*locale, \[ctaUrl\]\)/)
    assert.ok(src.includes(button), button)
  })
