// The old URL → new page map (`domain/url-map.mjs`): each page research read on the business's current website, the
// demo page its old address should lead to and why, or `unmatched`; skipped addresses say why. Pure, no fetch.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { URL_MAP_MATCHES, URL_MAP_SKIPS, oldUrlMap, urlMapProof } from '../domain/url-map.mjs'

const SITE = 'https://www.phoba.example/'
const page = (path, title, extra = {}) => ({
  url: `https://www.phoba.example${path}`,
  title,
  text: 'x',
  ...extra
})
const read = (pages, status = 'complete') => ({ source: 'website', ref: SITE, status, collected: { pages } })
const DEMO = {
  readAt: '2026-11-15T08:00:00.000Z',
  truncated: false,
  pages: [
    { path: '/', title: 'Home', type: 'page' },
    { path: '/menu', title: 'Menu', type: 'page' },
    { path: '/gallery', title: 'Gallery', type: 'page' },
    { path: '/contact', title: 'Contact', type: 'page' },
    { path: '/our-story', title: 'Our story', type: 'page' },
    { path: '/typography', title: 'Typography', type: 'page' },
    { path: '/blog/hello-world', title: 'Hello world', type: 'article' }
  ]
}
const map = (pages, demo = DEMO, status = 'complete') =>
  oldUrlMap({ website: SITE, row: read(pages, status), demo })
const entry = (m, path) => m.pages.find((p) => p.path === path)

test('the old home page leads to the demo home; a page at the same address keeps it with no redirect', () => {
  const m = map([page('/', 'Pho Ba | Best pho in Hanoi'), page('/gallery', 'Photos | Pho Ba')])
  assert.equal(m.state, 'ready')
  assert.deepEqual(entry(m, '/').to, { path: '/', title: 'Home' })
  assert.equal(entry(m, '/').match, 'home')
  assert.equal(entry(m, '/').redirect, false)
  assert.equal(entry(m, '/gallery').match, 'same-slug')
  assert.deepEqual(entry(m, '/gallery').to, { path: '/gallery', title: 'Gallery' })
  assert.equal(entry(m, '/gallery').redirect, false, 'the same path needs no redirect')
})

test('slug match: the last part of the address, whatever its parent, extension or trailing slash', () => {
  const m = map([
    page('/', 'Pho Ba'),
    page('/restaurant/menu.html', 'Food | Pho Ba'),
    page('/en/contact/', 'Reach us')
  ])
  assert.equal(entry(m, '/restaurant/menu.html').match, 'same-slug')
  assert.equal(entry(m, '/restaurant/menu.html').to.path, '/menu')
  assert.equal(entry(m, '/restaurant/menu.html').redirect, true)
  assert.equal(entry(m, '/en/contact/').match, 'same-slug', 'a leading language part is not the slug')
})

test('title match: the old title with the site name taken out, or the first heading, equals a demo page title', () => {
  const m = map([
    page('/', 'Pho Ba'),
    page('/p/12', 'Gallery | Pho Ba'),
    page('/find-us', 'Getting here | Pho Ba', { heading: 'Contact' }),
    page('/x', 'Our Story — Pho Ba')
  ])
  assert.equal(entry(m, '/p/12').match, 'same-title')
  assert.equal(entry(m, '/p/12').to.path, '/gallery')
  assert.equal(entry(m, '/find-us').match, 'same-title', 'the first heading counts as the page title')
  assert.equal(entry(m, '/find-us').to.path, '/contact')
  assert.equal(entry(m, '/x').match, 'same-title')
  assert.equal(entry(m, '/x').to.path, '/our-story')
})

test('topic match: the same kind of page by its words; the demo page with the shortest address wins', () => {
  const demo = {
    ...DEMO,
    pages: [...DEMO.pages, { path: '/menu/drinks', title: 'Drinks menu', type: 'page' }]
  }
  const m = map(
    [page('/', 'Pho Ba'), page('/our-menu', 'Our Menu | Pho Ba'), page('/contact-us', 'Contact Us | Pho Ba')],
    demo
  )
  assert.equal(entry(m, '/our-menu').match, 'same-topic')
  assert.equal(entry(m, '/our-menu').to.path, '/menu')
  assert.equal(entry(m, '/contact-us').match, 'same-topic')
  assert.equal(entry(m, '/contact-us').to.path, '/contact')
})

test('unmatched stays unmatched: no target, never the home page, never a template sample or an article', () => {
  const m = map([
    page('/', 'Pho Ba'),
    page('/tet-2024', 'Tet 2024 | Pho Ba'),
    page('/typography', 'Typography | Pho Ba'),
    page('/hello-world', 'Hello world | Pho Ba')
  ])
  for (const path of ['/tet-2024', '/typography', '/hello-world']) {
    assert.equal(entry(m, path).match, 'unmatched', path)
    assert.equal(entry(m, path).to, null, path)
    assert.equal(entry(m, path).redirect, false, path)
  }
  assert.deepEqual(m.counts, {
    pages: 4,
    matched: 1,
    unmatched: 3,
    skipped: 0,
    byMatch: { home: 1, 'same-slug': 0, 'same-title': 0, 'same-topic': 0 }
  })
})

test('a demo whose CMS names no page type is matched on every listed page', () => {
  const demo = {
    readAt: DEMO.readAt,
    pages: [{ path: '/' }, { path: '/menu', title: 'Menu', type: 'pages' }]
  }
  assert.equal(entry(map([page('/', 'A'), page('/menu', 'Menu | A')], demo), '/menu').to.path, '/menu')
})

test('assets, system, archive, pagination, error pages, other hosts and duplicates are skipped, each with why', () => {
  const m = map([
    page('/', 'Pho Ba'),
    page('/menu', 'Menu | Pho Ba'),
    page('/menu?utm_source=facebook&fbclid=1', 'Menu | Pho Ba'),
    { url: 'http://phoba.example/menu/', title: 'Menu | Pho Ba' },
    page('/menu?replytocom=4', 'Menu | Pho Ba'),
    page('/files/menu.pdf', ''),
    page('/img/front.JPG', ''),
    page('/wp-login.php', 'Log in'),
    page('/cart/', 'Cart | Pho Ba'),
    page('/?s=pho', 'Search | Pho Ba'),
    page('/index.php?option=com_users&view=login', 'Login'),
    page('/tag/noodles/', 'Noodles | Pho Ba'),
    page('/author/admin/', 'Admin | Pho Ba'),
    page('/2024/05/', 'May 2024 | Pho Ba'),
    page('/blog/page/2/', 'Blog | Pho Ba'),
    page('/blog?paged=3', 'Blog | Pho Ba'),
    page('/news?start=10', 'News | Pho Ba'),
    page('/missing', 'Page not found | Pho Ba'),
    { url: 'https://partner.example/deal', title: 'Deal' },
    { url: 'not a url', title: 'x' }
  ])
  const why = Object.fromEntries(m.skipped.map((s) => [s.url, s.reason]))
  assert.equal(why['https://www.phoba.example/menu?utm_source=facebook&fbclid=1'], 'duplicate')
  assert.equal(
    why['http://phoba.example/menu/'],
    'duplicate',
    'http, no www and a trailing slash are one page'
  )
  assert.equal(why['https://www.phoba.example/menu?replytocom=4'], 'duplicate')
  assert.ok(
    m.skipped
      .filter((s) => s.reason === 'duplicate')
      .every((s) => s.sameAs === 'https://www.phoba.example/menu'),
    'a duplicate names the address kept'
  )
  assert.equal(why['https://www.phoba.example/files/menu.pdf'], 'asset')
  assert.equal(why['https://www.phoba.example/img/front.JPG'], 'asset')
  for (const p of ['/wp-login.php', '/cart/', '/?s=pho', '/index.php?option=com_users&view=login'])
    assert.equal(why[`https://www.phoba.example${p}`], 'system', p)
  for (const p of ['/tag/noodles/', '/author/admin/', '/2024/05/'])
    assert.equal(why[`https://www.phoba.example${p}`], 'archive', p)
  for (const p of ['/blog/page/2/', '/blog?paged=3', '/news?start=10'])
    assert.equal(why[`https://www.phoba.example${p}`], 'pagination', p)
  assert.equal(why['https://www.phoba.example/missing'], 'not-found')
  assert.equal(why['https://partner.example/deal'], 'other-host')
  assert.equal(why['not a url'], 'invalid')
  assert.ok(m.skipped.every((s) => URL_MAP_SKIPS.includes(s.reason)))
  assert.deepEqual(
    m.pages.map((p) => p.path),
    ['/', '/menu'],
    'only the content pages are mapped'
  )
  assert.equal(m.counts.skipped, m.skipped.length)
})

test('the plainest address of a page is kept, whichever was read first', () => {
  const m = map([page('/', 'A'), page('/menu?utm_medium=qr', 'Menu | A'), page('/menu', 'Menu | A')])
  assert.equal(entry(m, '/menu').from, 'https://www.phoba.example/menu')
  assert.deepEqual(m.skipped, [
    {
      url: 'https://www.phoba.example/menu?utm_medium=qr',
      reason: 'duplicate',
      sameAs: 'https://www.phoba.example/menu'
    }
  ])
})

test('a query that names a page is kept as its own page and matched by its title', () => {
  const m = map([page('/', 'A'), page('/?page_id=12', 'Gallery | A'), page('/?lang=vi', 'A')])
  assert.equal(entry(m, '/?page_id=12').match, 'same-title')
  assert.equal(entry(m, '/?page_id=12').to.path, '/gallery')
  assert.notEqual(entry(m, '/?lang=vi').match, 'home', 'a query that names a page is not the home page')
})

test('a site that moved to a new domain is read there: its pages are not other hosts', () => {
  const pages = [
    { url: 'https://phoba-hanoi.example/', title: 'Pho Ba' },
    { url: 'https://phoba-hanoi.example/menu', title: 'Menu | Pho Ba' }
  ]
  const m = oldUrlMap({ website: SITE, row: read(pages), demo: DEMO })
  assert.equal(m.counts.pages, 2)
  assert.equal(entry(m, '/menu').to.path, '/menu')
})

test('the old title, meta description and heading are carried over as read; none kept is null, never guessed', () => {
  const m = map([
    page('/', 'Pho Ba | Best pho in Hanoi', { description: 'Pho since 1990.', heading: 'Welcome' }),
    page('/menu', 'Menu | Pho Ba')
  ])
  assert.deepEqual(
    { title: entry(m, '/').title, description: entry(m, '/').description, heading: entry(m, '/').heading },
    { title: 'Pho Ba | Best pho in Hanoi', description: 'Pho since 1990.', heading: 'Welcome' }
  )
  assert.equal(entry(m, '/menu').description, null)
  assert.equal(entry(m, '/menu').heading, null)
  assert.equal(entry(m, '/menu').from, 'https://www.phoba.example/menu')
})

test('no map without a website of its own, a read of it, or the demo pages: each says why', () => {
  assert.equal(oldUrlMap({ website: null, row: null, demo: DEMO }).state, 'no-website')
  assert.equal(
    oldUrlMap({ website: 'https://www.tripadvisor.com/Restaurant_Review-g1-d2', row: null, demo: DEMO })
      .state,
    'no-website',
    'a listing page is not the business’s own website'
  )
  assert.equal(oldUrlMap({ website: SITE, row: null, demo: DEMO }).state, 'old-site-not-read')
  assert.equal(
    oldUrlMap({ website: SITE, row: { ...read([]), status: 'failed' }, demo: DEMO }).state,
    'old-site-not-read'
  )
  const notRead = oldUrlMap({
    website: SITE,
    row: read([page('/', 'A')]),
    demo: { readAt: DEMO.readAt, reason: 'TIMEOUT' }
  })
  assert.equal(notRead.state, 'demo-not-read')
  assert.equal(notRead.reason, 'TIMEOUT')
  assert.equal(notRead.demo, null)
  assert.deepEqual(notRead.pages, [])
  assert.equal(oldUrlMap({ website: SITE, row: read([page('/', 'A')]), demo: null }).state, 'demo-not-read')
  for (const m of [notRead, oldUrlMap({ website: null })]) {
    assert.equal(m.version, 'old-url-map/1')
    assert.equal(urlMapProof(m), null)
  }
})

test('every match the map gives is one it names, and its target is a page the demo listed', () => {
  const m = map([
    page('/', 'Pho Ba'),
    page('/menu', 'Menu | Pho Ba'),
    page('/our-menu', 'Our Menu | Pho Ba'),
    page('/contact-us', 'Contact Us | Pho Ba'),
    page('/tet', 'Tet | Pho Ba')
  ])
  const listed = new Set(DEMO.pages.map((p) => p.path))
  for (const p of m.pages) {
    if (p.match === 'unmatched') continue
    assert.ok(URL_MAP_MATCHES.includes(p.match), p.match)
    assert.ok(listed.has(p.to.path), p.to.path)
  }
})

test('the outreach line counts matched pages, names the whole only after a complete read, never says 0', () => {
  const pages = [page('/', 'Pho Ba'), page('/menu', 'Menu | Pho Ba'), page('/tet', 'Tet | Pho Ba')]
  assert.equal(
    urlMapProof(map(pages)),
    '2 of your 3 current pages have a matching page on the demo, so their old addresses can lead there.'
  )
  assert.equal(
    urlMapProof(map(pages, DEMO, 'partial')),
    '2 of your current pages have a matching page on the demo, so their old addresses can lead there.'
  )
  assert.equal(
    urlMapProof(map(pages.slice(0, 2))),
    'All 2 of your current pages have a matching page on the demo, so their old addresses can lead there.'
  )
  assert.equal(
    urlMapProof(map(pages.slice(0, 1))),
    'Your current page has a matching page on the demo, so its old address can lead there.'
  )
  assert.equal(
    urlMapProof(map([page('/', 'A'), page('/tet', 'Tet | A')], DEMO, 'partial')),
    '1 of your current pages has a matching page on the demo, so its old address can lead there.'
  )
  const none = map([page('/tet', 'Tet | Pho Ba'), page('/lunar', 'Lunar | Pho Ba')])
  assert.equal(none.counts.matched, 0)
  assert.equal(urlMapProof(none), null)
})
