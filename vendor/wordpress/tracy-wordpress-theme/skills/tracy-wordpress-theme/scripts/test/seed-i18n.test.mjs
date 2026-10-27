// A whole seed against a fake site, in both --i18n modes. `none` is the baseline every existing
// site is on: a secondary-locale page is a child of the `/<locale>` page and no Polylang call is
// made. `polylang` makes those pages top-level translations (D11): languages created once,
// slug from the title when the spec's slug is already the default locale's, translations
// linked, posts paired by order, routes probed at the URL Polylang really serves.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseArgs, runSeed, wpPostName } from '../seed.mjs'
import { fakeSite } from './lib/fake-site.mjs'

// ---------------------------------------------------------------- the spec

const page = (path, file, locale, title, view = 'page', extra = {}) => ({
  file,
  path,
  slug: path === '/' ? 'home' : path.split('/').pop(),
  locale,
  title,
  view,
  ...extra
})

/** Two locales, four pages each side plus the posts index, two posts a side, one category. */
function writeSpec(dir) {
  const pm = [
    page('/', 'Home.html', 'en', 'Groundwork', 'front-page', { translations: { ru: 'RU/Home_ru.html' } }),
    page('/about', 'About.html', 'en', 'About us', 'page', { translations: { ru: 'RU/About_ru.html' } }),
    page('/404', '404.html', 'en', 'Not found', '404', { translations: { ru: 'RU/404_ru.html' } }),
    page('/article', 'Article.html', 'en', 'Sample article', 'single', { translations: { ru: 'RU/Article_ru.html' } }),
    page('/news', 'News.html', 'en', 'News', 'home', { translations: { ru: 'RU/News_ru.html' } }),
    page('/ru', 'RU/Home_ru.html', 'ru', 'Основание', 'front-page', { translationOf: 'Home.html', translations: { en: 'Home.html' } }),
    page('/ru/about', 'RU/About_ru.html', 'ru', 'О компании', 'page', { translationOf: 'About.html', translations: { en: 'About.html' } }),
    page('/ru/404', 'RU/404_ru.html', 'ru', 'Не найдено', '404', { translationOf: '404.html', translations: { en: '404.html' } }),
    page('/ru/article', 'RU/Article_ru.html', 'ru', 'Пример статьи', 'single', { translationOf: 'Article.html', translations: { en: 'Article.html' } }),
    page('/ru/news', 'RU/News_ru.html', 'ru', 'Новости', 'home', { translationOf: 'News.html', translations: { en: 'News.html' } })
  ]
  const body = (t) => `<!-- wp:paragraph --><p>${t}</p><!-- /wp:paragraph -->`
  const cp = (p, parent = null) => ({ ...p, parent, status: 'publish', content: body(p.title), meta: {}, images: [] })
  const content = {
    site: { name: 'Fake', tagline: 'Site', locales: ['en', 'ru'], defaultLocale: 'en' },
    pages: [
      cp(pm[0]),
      cp(pm[1]),
      cp(pm[2]),
      cp(pm[5]),
      cp(pm[6], '/ru'),
      cp(pm[7], '/ru')
    ],
    posts: [
      { slug: 'post-a', path: '/news/post-a', locale: 'en', category: 'news', title: 'Post A', content: body('A') },
      { slug: 'post-b', path: '/news/post-b', locale: 'en', category: 'news', title: 'Post B', content: body('B') },
      { slug: 'пост-а-ru', path: '/news/пост-а', locale: 'ru', category: 'news', title: 'Пост А', content: body('А') },
      { slug: 'пост-б-ru', path: '/news/пост-б', locale: 'ru', category: 'news', title: 'Пост Б', content: body('Б') }
    ],
    categories: [{ id: 'news', title: 'News', wpSlug: 'news', parent: null, description: '' }],
    archives: [
      { file: 'News.html', view: 'home', path: '/news', title: 'News', locale: 'en', category: 'news', sections: [], aside: [] },
      { file: 'RU/News_ru.html', view: 'home', path: '/ru/news', title: 'Новости', locale: 'ru', category: 'news', sections: [], aside: [] }
    ],
    images: []
  }
  const menus = {
    menus: [
      { menutype: 'tracy', locale: 'en', title: 'Header', items: [{ id: 't1', label: 'About', url: '/about', published: true, children: [] }] },
      { menutype: 'tracy-ru', locale: 'ru', title: 'Header (RU)', items: [{ id: 't2', label: 'О компании', url: '/ru/about', published: true, children: [] }] }
    ]
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'page-map.json'), JSON.stringify({ locales: ['en', 'ru'], defaultLocale: 'en', pages: pm }))
  writeFileSync(join(dir, 'content.json'), JSON.stringify(content))
  writeFileSync(join(dir, 'sections.json'), JSON.stringify({ acm: [], custom: [], other: [] }))
  writeFileSync(join(dir, 'menus.json'), JSON.stringify(menus))
  writeFileSync(join(dir, 'redirects.json'), JSON.stringify({ rules: [{ from: '/article', to: '/post-a/', status: 301 }] }))
  writeFileSync(join(dir, 'patterns.map.json'), JSON.stringify({ types: {} }))
}

const fetchOk = async () => ({ status: 200, headers: new Map() })
const scratchRoots = []
const scratch = (prefix) => {
  const root = mkdtempSync(join(tmpdir(), prefix))
  scratchRoots.push(root)
  return root
}
test.after(() => scratchRoots.forEach((root) => rmSync(root, { recursive: true, force: true })))

async function seed(site, i18n, n = 1) {
  const root = scratch('seed-i18n-')
  const spec = join(root, 'spec')
  writeSpec(spec)
  const opts = parseArgs([
    '--spec', spec, '--wp', 'fake', '--theme', 'wp-tracy-business',
    '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img',
    '--base-url', 'http://x', '--report', join(root, `report-${n}.json`),
    ...(i18n ? ['--i18n', i18n] : [])
  ])
  const stderr = console.error
  console.error = () => {}
  try {
    return await runSeed(opts, { runner: site.wp, fetch: fetchOk })
  } finally {
    console.error = stderr
  }
}

// ---------------------------------------------------------------- --i18n none

test('i18n none: a secondary-locale page is a child of the /<locale> page and no Polylang call is made', async () => {
  const site = fakeSite()
  const report = await seed(site, 'none')
  const ru = site.page((p) => p.post_name === 'ru')
  const about = site.page((p) => p.post_name === 'about' && p.post_parent === ru.ID)
  assert.ok(ru && about, 'RU about sits under the RU home page')
  assert.equal(report.i18n, undefined)
  assert.equal(site.evals.filter((c) => /pll_|PLL\(\)/.test(c)).length, 0)
  const second = await seed(site, 'none', 2)
  assert.deepEqual(second.counts.pages, { created: 0, updated: 0, skipped: 8 }, 'six pages and two posts-index pages')
})

test('i18n none is the default', () => {
  const o = parseArgs(['--spec', '/s', '--wp', 'w', '--theme', 't', '--patterns-map', '/m', '--images', '/i'])
  assert.equal(o.i18n, 'none')
  assert.throws(
    () => parseArgs(['--spec', '/s', '--wp', 'w', '--theme', 't', '--patterns-map', '/m', '--images', '/i', '--i18n', 'wpml']),
    /--i18n takes none or polylang/
  )
})

// ---------------------------------------------------------------- --i18n polylang

test('i18n polylang: languages are created once, the default set, and the URL options fixed', async () => {
  const site = fakeSite({ languages: [{ slug: 'en', locale: 'en_US', name: 'English' }] })
  const report = await seed(site, 'polylang')
  assert.deepEqual(report.i18n.created, ['ru'])
  assert.deepEqual(report.i18n.languages, ['en', 'ru'])
  assert.deepEqual(site.payloads('languages->add(')[0], { locale: 'ru_RU', slug: 'ru', term_group: 1 })
  assert.equal(site.defaultLang, 'en')
  assert.deepEqual(site.pllOptions, { force_lang: 1, hide_default: true, browser: false, redirect_lang: false })
  await seed(site, 'polylang', 2)
  assert.equal(site.payloads('languages->add(').length, 1, 'no second add')
})

test('i18n polylang: a secondary-locale page is top-level, slug from the title when the spec slug is the default locale\'s', async () => {
  const site = fakeSite()
  const report = await seed(site, 'polylang')
  const aboutRu = site.page((p) => p.post_title === 'О компании')
  assert.equal(aboutRu.post_parent, 0)
  assert.equal(aboutRu.post_name, wpPostName('О компании'))
  // The page-map title is the h1 ("About us"); the page is filed under its menu label ("About").
  assert.equal(site.page((p) => p.post_title === 'About').post_name, 'about', 'the default locale keeps its slug')
  assert.equal(site.page((p) => p.post_title === 'Основание').post_name, 'ru', 'the locale front page keeps its own slug')
  const notFound = site.page((p) => p.post_title === 'Не найдено')
  assert.equal(notFound.post_name, wpPostName('Не найдено'))
  assert.equal(notFound.post_parent, 0)
  const newsRu = site.page((p) => p.post_title === 'Новости')
  assert.equal(newsRu.post_parent, 0, 'the posts index of the locale too')
  assert.deepEqual(
    report.notes.filter((n) => /slug taken/.test(n.note)).map((n) => [n.page, n.slug]),
    [
      ['/ru/about', wpPostName('О компании')],
      ['/ru/404', wpPostName('Не найдено')],
      ['/ru/news', wpPostName('Новости')]
    ],
    'in spec order: content pages, then the posts index'
  )
  const second = await seed(site, 'polylang', 2)
  assert.deepEqual(second.counts.pages, { created: 0, updated: 0, skipped: 8 })
})

test('i18n polylang after a none seed: the child tree under /ru moves to the top level in place, no page is created twice', async () => {
  const site = fakeSite()
  await seed(site, 'none')
  const before = site.page((p) => p.post_title === 'О компании')
  const report = await seed(site, 'polylang', 2)
  const after = site.page((p) => p.post_title === 'О компании')
  assert.equal(after.ID, before.ID)
  assert.equal(after.post_parent, 0)
  assert.equal(after.post_name, wpPostName('О компании'))
  assert.deepEqual(report.counts.pages, { created: 0, updated: 3, skipped: 5 })
  assert.equal([...site.posts.values()].filter((p) => p.post_type === 'page').length, 8)
  assert.ok(report.notes.some((n) => n.page === '/ru/about' && /moved/.test(n.note)))
})

test('i18n polylang: every page and post gets its language, pages are linked by the page-map, posts by order with a note, the category gets a twin per locale', async () => {
  const site = fakeSite()
  const report = await seed(site, 'polylang')
  const id = (title) => (site.page((p) => p.post_title === title) ?? site.post((p) => p.post_title === title)).ID
  const [link] = site.payloads('pll_save_post_translations')
  // Languages: six content pages, two posts indexes, four posts.
  assert.equal(Object.keys(link.posts).length, 12)
  assert.equal(link.posts[id('О компании')], 'ru')
  assert.equal(link.posts[id('About')], 'en')
  assert.equal(link.posts[id('Post A')], 'en')
  assert.equal(link.posts[id('Пост Б')], 'ru')
  const groups = link.groups.map((g) => JSON.stringify(g))
  const has = (g) => assert.ok(groups.includes(JSON.stringify(g)), `group ${JSON.stringify(g)} in ${groups.join(' ')}`)
  has({ en: id('Groundwork'), ru: id('Основание') })
  has({ en: id('About'), ru: id('О компании') })
  has({ en: id('Not found'), ru: id('Не найдено') })
  has({ en: id('News'), ru: id('Новости') })
  has({ en: id('Post A'), ru: id('Пост А') })
  has({ en: id('Post B'), ru: id('Пост Б') })
  assert.equal(link.groups.length, 6, 'one group per pair, the /article pages are posts and not seeded')
  assert.ok(report.notes.some((n) => /posts paired by order; the spec carries no translationOf/.test(n.note)))
  // The category: `news` in en, `news-ru` in ru (same name — the spec carries no translation), linked.
  const news = [...site.terms.values()].find((t) => t.slug === 'news')
  const newsRu = [...site.terms.values()].find((t) => t.slug === 'news-ru')
  assert.ok(newsRu, 'news-ru created')
  assert.equal(newsRu.name, 'News')
  assert.deepEqual(link.terms, { [news.term_id]: 'en', [newsRu.term_id]: 'ru' })
  assert.deepEqual(link.termGroups, [{ en: news.term_id, ru: newsRu.term_id }])
  assert.equal(site.post((p) => p.post_title === 'Пост А').post_category, String(newsRu.term_id))
  assert.equal(site.post((p) => p.post_title === 'Post A').post_category, String(news.term_id))
  assert.deepEqual(report.i18n.linked, { lang: 12, groups: 6, termLang: 2, termGroups: 1 })
  // Polylang caches page_on_front / page_for_posts per language when the language is created —
  // before these translations existed; without a cache clean the RU posts index is a plain page.
  assert.ok(site.evals.some((c) => c.includes('pll_save_post_translations') && c.includes('clean_languages_cache()')))
  const second = await seed(site, 'polylang', 2)
  assert.deepEqual(second.i18n.linked, { lang: 0, groups: 0, termLang: 0, termGroups: 0 })
  assert.deepEqual(second.counts.categories, { created: 0, updated: 0, skipped: 2 })
})

test('i18n polylang: a secondary-locale route is probed at the URL Polylang serves, the 404 view at its page-map path, and every single view redirects to its locale\'s first post', async () => {
  const site = fakeSite()
  const report = await seed(site, 'polylang')
  const route = (path) => report.routes.find((r) => r.path === path)
  const aboutRu = `/ru/${wpPostName('О компании')}/`
  assert.ok(route(aboutRu), `route ${aboutRu} probed; have ${report.routes.map((r) => r.path).join(' ')}`)
  assert.equal(route(aboutRu).expect, 200)
  assert.equal(route(aboutRu).pagemapPath, '/ru/about')
  assert.equal(route('/ru/about'), undefined, 'the page-map path of a translation is not a route')
  assert.equal(route('/about').expect, 200, 'the default locale keeps its page-map path')
  assert.equal(route('/ru/404').expect, 404)
  assert.equal(route('/').expect, 200)
  const rule = report.redirects.find((r) => r.from === '/ru/article')
  assert.deepEqual(rule, { from: '/ru/article', to: `/ru/${wpPostName('пост-а-ru')}/`, status: 301 })
  assert.deepEqual(report.redirects[0], { from: '/article', to: '/post-a/', status: 301 }, 'the spec rule stays first and as written')
  assert.ok(report.notes.some((n) => n.page === '/ru/article' && /first post of its locale/.test(n.note)))
  assert.ok(report.routes.some((r) => r.path === '/ru/article' && r.expect === 301), 'the rule is probed as a redirect')
})

test('i18n none: a single view of a secondary locale still redirects to its locale\'s first post, at that post\'s URL', async () => {
  const site = fakeSite()
  const report = await seed(site, 'none')
  const rule = report.redirects.find((r) => r.from === '/ru/article')
  assert.deepEqual(rule, { from: '/ru/article', to: `/${wpPostName('пост-а-ru')}/`, status: 301 })
})

test('i18n polylang: a menu item that names a translation by its page-map path links the page by id, at the URL Polylang serves', async () => {
  const site = fakeSite()
  await seed(site, 'polylang')
  const nav = [...site.posts.values()].find((p) => p.post_type === 'wp_navigation' && p.post_name === 'tracy-ru')
  const aboutRu = site.page((p) => p.post_title === 'О компании')
  assert.match(nav.content, new RegExp(`"id":${aboutRu.ID},"url":"http://x/ru/${wpPostName('О компании')}/"`))
})

test('localizeCategories: a twin takes the title the adapter read in its locale, else keeps the base name', async () => {
  const { localizeCategories } = await import('../seed.mjs')
  const out = localizeCategories(
    [
      { id: 'news', title: 'News', wpSlug: 'news', parent: null },
      { id: 'engineering', title: 'Engineering', wpSlug: 'engineering', parent: 'news', titles: { ru: 'Инженерия' } }
    ],
    { i18n: 'polylang', locales: ['en', 'ru'], defaultLocale: 'en' }
  )
  assert.deepEqual(
    out.map((c) => [c.wpSlug, c.title, c.parent, c.locale, c.translationOf ?? null]),
    [
      ['news', 'News', null, 'en', null],
      ['engineering', 'Engineering', 'news', 'en', null],
      ['news-ru', 'News', null, 'ru', 'news'],
      ['engineering-ru', 'Инженерия', 'news-ru', 'ru', 'engineering']
    ]
  )
})

// ---------------------------------------------------------------- a theme that draws its own contact form

test('views[page-contact] in the map: the theme draws the contact form, so Contact Form 7 is neither installed nor filled', async () => {
  const site = fakeSite()
  const root = scratch('seed-views-')
  const spec = join(root, 'spec')
  writeSpec(spec)
  writeFileSync(
    join(spec, 'patterns.map.json'),
    JSON.stringify({ types: {}, views: { 'page-contact': { block: 'x/contact-form', after: 'page-top' } } })
  )
  const opts = parseArgs([
    '--spec', spec, '--wp', 'fake', '--theme', 'x', '--patterns-map', join(spec, 'patterns.map.json'),
    '--images', '/img', '--base-url', 'http://x', '--report', join(root, 'report.json')
  ])
  const stderr = console.error
  console.error = () => {}
  let report
  try {
    report = await runSeed(opts, { runner: site.wp, fetch: fetchOk })
  } finally {
    console.error = stderr
  }
  assert.equal(site.calls.filter((c) => c[0] === 'plugin').length, 0, 'no plugin list, no plugin install')
  assert.equal([...site.posts.values()].filter((p) => p.post_type === 'wpcf7_contact_form').length, 0)
  assert.equal(report.counts.forms, undefined)
  assert.ok(report.notes.some((n) => n.form === 'contact' && /x\/contact-form/.test(n.note)))
})

// ---------------------------------------------------------------- issue #9 (JA Vega M4)

/**
 * The i18n spec, single-locale use, with what a Joomla port brings: the 404 view synthetic (the
 * source serves error.php, no article), a category route whose articles all became child pages.
 */
async function seedPort(site, n = 1, edit = () => {}) {
  const root = scratch('seed-port-')
  const spec = join(root, 'spec')
  writeSpec(spec)
  const read = (f) => JSON.parse(readFileSync(join(spec, f), 'utf8'))
  const pm = read('page-map.json')
  const content = read('content.json')
  const nf = pm.pages.find((p) => p.path === '/404')
  Object.assign(nf, { synthetic: true, title: 'Page not found' })
  pm.pages.push({ file: 'Services.html', path: '/services', locale: 'en', title: 'Services', view: 'category' })
  content.pages = content.pages.filter((p) => p.path !== '/404')
  const svc = (slug, id, title) => ({
    path: `/services/${slug}`, slug, locale: 'en', title, view: 'page', parent: '/services', status: 'publish',
    content: `<!-- wp:paragraph --><p>${title}</p><!-- /wp:paragraph -->`, meta: {}, images: [],
    joomla: { articleId: String(id), ordering: 0, catid: '9' }
  })
  content.pages.push(svc('managed', 79, 'Managed'), svc('security', 13, 'Security'), svc('cloud', 77, 'Cloud'))
  content.categories.push({ id: '9', title: 'Services', wpSlug: 'services', parent: null, description: '' })
  content.archives.push({ file: 'Services.html', view: 'category', path: '/services', title: 'Services', locale: 'en', category: 'services', sections: [], aside: [] })
  edit(content)
  writeFileSync(join(spec, 'page-map.json'), JSON.stringify(pm))
  writeFileSync(join(spec, 'content.json'), JSON.stringify(content))
  const opts = parseArgs([
    '--spec', spec, '--wp', 'fake', '--theme', 'wp-tracy-business',
    '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img',
    '--base-url', 'http://x', '--report', join(root, `report-${n}.json`)
  ])
  const stderr = console.error
  console.error = () => {}
  try {
    return await runSeed(opts, { runner: site.wp, fetch: fetchOk })
  } finally {
    console.error = stderr
  }
}

test('seed (port): install samples trashed, source page order kept, no empty post query, the synthetic 404 gets its draft — and a second run changes nothing', async () => {
  const site = fakeSite()
  const at = '2026-09-01 10:00:00'
  site.posts.set(1, { ID: 1, post_type: 'post', post_name: 'hello-world', post_title: 'Hello world!', post_status: 'publish', post_parent: 0, post_date: at, post_modified: at, meta: {} })
  site.posts.set(2, { ID: 2, post_type: 'page', post_name: 'sample-page', post_title: 'Sample Page', post_status: 'publish', post_parent: 0, post_date: at, post_modified: '2026-09-03 09:00:00', meta: {} })
  const report = await seedPort(site)

  assert.equal(site.posts.get(1).post_status, 'trash', '"Hello world!" is in the trash, not deleted')
  assert.equal(site.posts.get(2).post_status, 'publish', 'a sample page someone edited is content')
  assert.deepEqual(report.counts.samples, { created: 0, updated: 1, skipped: 0 })

  const services = site.page((p) => p.post_name === 'services')
  const kids = ['security', 'cloud', 'managed'].map((s) => site.page((p) => p.post_name === s && p.post_parent === services.ID))
  assert.deepEqual(kids.map((p) => p.menu_order), [1, 2, 3], 'Joomla article order (ordering, then id), not insertion order')
  assert.match(services.content, /"parents":\[\d+\]/, 'the child pages are listed')
  assert.doesNotMatch(services.content, /"taxQuery"/, 'no post in the category: no "Nothing here yet." query')
  assert.deepEqual(report.routes.find((r) => r.path === '/services')?.served, 'page')

  const draft = site.page((p) => p.post_name === 'page-not-found')
  assert.equal(draft?.post_status, 'draft')
  assert.equal(draft.post_title, 'Page not found')
  assert.equal(site.options.get('wp_tracy_business_404_page'), String(draft.ID))
  assert.ok(report.routes.some((r) => r.path === '/404' && r.expect === 404), 'the 404 path is still probed for a 404')

  const second = await seedPort(site, 2)
  assert.equal(second.counts.pages.created + second.counts.pages.updated, 0, JSON.stringify(second.counts.pages))
  assert.equal(second.counts.samples, undefined, 'nothing left to trash')
  assert.equal(site.page((p) => p.post_name === 'page-not-found').ID, draft.ID)
  assert.equal(site.options.get('wp_tracy_business_404_page'), String(draft.ID))
})

test('seed (port): explicit hidden menu heading assigns page-no-title; custom and default headings keep their templates, second run is +0 ~0', async () => {
  const site = fakeSite()
  site.blockTemplates = ['page-no-title']
  const edit = (content) => {
    content.pages.find((p) => p.path === '/about').pageHeading = { hidden: true, from: 'menu item params show_page_heading 0' }
    const customPage = content.pages.find((p) => p.path === '/ru/about')
    customPage.title = 'Article source title'
    customPage.pageHeading = { text: 'Custom source heading', from: 'menu item params' }
  }
  const first = await seedPort(site, 1, edit)
  const hidden = site.page((p) => p.post_name === 'about' && p.post_parent === 0)
  const custom = site.page((p) => p.post_name === 'about' && p.post_parent !== 0)
  assert.equal(hidden.meta._wp_page_template, 'page-no-title')
  assert.notEqual(custom.meta._wp_page_template, 'page-no-title')
  assert.equal(custom.meta.tracy_page_heading, 'Custom source heading')
  assert.notEqual(site.page((p) => p.post_name === 'news').meta._wp_page_template, 'page-no-title')

  const second = await seedPort(site, 2, edit)
  assert.equal(second.counts.pages.created + second.counts.pages.updated, 0, JSON.stringify(second.counts.pages))
  assert.equal(site.page((p) => p.post_name === 'about' && p.post_parent === 0).ID, hidden.ID)
  assert.equal(site.page((p) => p.post_name === 'about' && p.post_parent !== 0).ID, custom.ID)
  assert.equal(first.counts.pages.created > 0, true)
})

test('seed (port): an install sample still in use — front page, menu item, linked from content — is kept and named', async () => {
  const site = fakeSite()
  const at = '2026-09-01 10:00:00'
  const sample = (ID, post_type, post_name, post_title) =>
    site.posts.set(ID, { ID, post_type, post_name, post_title, post_status: 'publish', post_parent: 0, post_date: at, post_modified: at, meta: {}, content: '' })
  sample(1, 'post', 'hello-world', 'Hello world!')
  sample(2, 'page', 'sample-page', 'Sample Page')
  site.options.set('page_on_front', '2')
  site.posts.set(3, { ID: 3, post_type: 'wp_block', post_name: 'owner-links', post_title: 'Links', post_status: 'publish', post_parent: 0, meta: {}, content: '<p><a href="http://x/2026/09/01/hello-world/">first post</a></p>' })
  const report = await seedPort(site)
  assert.equal(site.posts.get(2).post_status, 'publish', 'the front page is not trashed')
  assert.equal(site.posts.get(1).post_status, 'publish', 'a post other content links to is not trashed')
  assert.equal(report.counts.samples, undefined)
  assert.ok(report.notes.some((n) => /"Sample Page" \(#2\) kept: still used by option page_on_front/.test(n.note)))
  assert.ok(report.notes.some((n) => /"Hello world!" \(#1\) kept: still used by content of #3/.test(n.note)))

  const menu = fakeSite()
  menu.posts.set(2, { ID: 2, post_type: 'page', post_name: 'sample-page', post_title: 'Sample Page', post_status: 'publish', post_parent: 0, post_date: at, post_modified: at, meta: {}, content: '' })
  menu.posts.set(4, { ID: 4, post_type: 'nav_menu_item', post_name: '4', post_title: '', post_status: 'publish', post_parent: 0, meta: { _menu_item_object_id: '2' }, content: '' })
  const menuReport = await seedPort(menu)
  assert.equal(menu.posts.get(2).post_status, 'publish', 'a page a classic menu links to is not trashed')
  assert.ok(menuReport.notes.some((n) => /kept: still used by menu item #4/.test(n.note)))

  // A navigation menu the site owner built with a custom link: the address sits in the block's
  // attributes, no `href` in the saved content.
  const nav = fakeSite()
  nav.posts.set(2, { ID: 2, post_type: 'page', post_name: 'sample-page', post_title: 'Sample Page', post_status: 'publish', post_parent: 0, post_date: at, post_modified: at, meta: {}, content: '' })
  nav.posts.set(5, { ID: 5, post_type: 'wp_navigation', post_name: 'owner-menu', post_title: 'Menu', post_status: 'publish', post_parent: 0, meta: {}, content: '<!-- wp:navigation-link {"label":"About","url":"http://x/sample-page/","kind":"custom","isTopLevelLink":true} /-->' })
  const navReport = await seedPort(nav)
  assert.equal(nav.posts.get(2).post_status, 'publish', 'a page a custom navigation link points at is not trashed')
  assert.ok(navReport.notes.some((n) => /"Sample Page" \(#2\) kept: still used by content of #5/.test(n.note)))

  // The front page option could not be read this once: whether the sample is the front page is
  // unknown, so it stays — an option never set is the only failure that means "no reference".
  const flaky = fakeSite()
  flaky.posts.set(2, { ID: 2, post_type: 'page', post_name: 'sample-page', post_title: 'Sample Page', post_status: 'publish', post_parent: 0, post_date: at, post_modified: at, meta: {}, content: '' })
  flaky.options.set('page_on_front', '2')
  flaky.optionErrors = { page_on_front: 1 }
  const flakyReport = await seedPort(flaky)
  assert.equal(flaky.posts.get(2).post_status, 'publish', 'a failed option read does not trash the front page')
  assert.ok(flakyReport.notes.some((n) => /"Sample Page" \(#2\) kept: what refers to it could not be read/.test(n.note)))
})

test('seed (port): a post the site owner published in the category keeps the post query on the next run', async () => {
  const site = fakeSite()
  await seedPort(site)
  const services = () => site.page((p) => p.post_name === 'services')
  assert.doesNotMatch(services().content, /"taxQuery"/, 'no post anywhere: no query')
  const term = [...site.terms.values()].find((t) => t.slug === 'services')
  const child = site.nextId++
  site.terms.set(child, { term_id: child, slug: 'managed-news', parent: term.term_id, name: 'Managed news', description: '' })
  site.posts.set(900, { ID: 900, post_type: 'post', post_name: 'owner-news', post_title: 'Owner news', post_status: 'publish', post_parent: 0, post_category: String(child), meta: {}, content: '' })
  await seedPort(site, 2)
  // The query block leaves child categories out, so the owner's category must be named in it
  // for the post to appear.
  const ids = JSON.parse(services().content.match(/"taxQuery":\{"category":(\[[\d,]+\])\}/)?.[1] ?? '[]')
  assert.ok(ids.includes(term.term_id), 'the listing names its own category')
  assert.ok(ids.includes(child), `the owner's child category is in the filter, so its post shows: ${JSON.stringify(ids)}`)
})

test('seed (port): a category holding only archived articles still has no post query — the count leaves out what the query leaves out', async () => {
  const site = fakeSite()
  await seedPort(site, 1, (content) =>
    content.posts.push({
      slug: 'old-offer', path: '/services/old-offer', locale: 'en', category: 'services', title: 'Old offer',
      content: '<!-- wp:paragraph --><p>Old</p><!-- /wp:paragraph -->', joomla: { articleId: '80', state: 2 }
    })
  )
  const old = site.post((p) => p.post_name === 'old-offer')
  assert.equal(old?.post_status, 'publish')
  assert.match(String(old.tags_input), /\barchived\b/, 'the archived article is tagged archived')
  const services = site.page((p) => p.post_name === 'services')
  assert.doesNotMatch(services.content, /"taxQuery"/, 'the query would list nothing: no "Nothing here yet."')
})
