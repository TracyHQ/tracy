// Template kit crawl: every page reached, dead paths listed apart, duplicate addresses merged.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { crawlSite, extractLinks } from '../template-kit/lib/crawl.mjs'
import { accountOfPath, decideExclusions, knownAccounts, pathPattern } from '../template-kit/lib/exclude.mjs'
import {
  canonicalPath,
  pathOfRoute,
  siteAddress,
  slugOfPath,
  urlOfPath
} from '../template-kit/lib/kit-paths.mjs'
import { applyExclusions, seedsOf } from '../template-kit/lib/read-pass.mjs'

const SITE = 'http://site.example:8080'
const ALIAS = ['studio.example.test']

test('canonical paths merge index.php, trailing slashes, query noise and the served host name', () => {
  assert.equal(canonicalPath('/index.php', SITE), '/')
  assert.equal(canonicalPath('/index.php/', SITE), '/')
  assert.equal(canonicalPath('http://site.example:8080/', SITE), '/')
  assert.equal(canonicalPath('/index.php/Classes/', SITE), '/classes')
  assert.equal(canonicalPath('/index.php/index.php/blog/author/sam', SITE), '/blog/author/sam')
  assert.equal(canonicalPath('/classes?utm_source=x', SITE), '/classes')
  assert.equal(canonicalPath('/index.php/blog?start=6', SITE), '/blog?start=6')
  assert.equal(canonicalPath('/index.php/blog?limitstart=0', SITE), '/blog')
  assert.equal(canonicalPath('http://studio.example.test/index.php/about-us', SITE, ALIAS), '/about-us')
  assert.equal(canonicalPath('http://studio.example.test/index.php/about-us', SITE), null)
})

test('links that are not pages are left out', () => {
  for (const href of [
    '#top',
    'mailto:hello@example.test',
    'tel:+10000000',
    'https://elsewhere.example/page',
    '/images/hero.jpg',
    '/index.php/blog?format=feed&type=rss',
    '/index.php/blog?tmpl=component&print=1',
    '/administrator/index.php',
    '/index.php/component/users/?view=login&return=x'
  ])
    assert.equal(canonicalPath(href, SITE), null, href)
})

test('an address of the site itself loses the host it was read on, so the kit never names the capture machine', () => {
  // A shop prints its form actions and product picture links absolute, on the host the capture reached it at.
  assert.equal(
    siteAddress('http://site.example:8080/index.php/blog/82-a-post', SITE),
    '/index.php/blog/82-a-post'
  )
  assert.equal(
    siteAddress('http://site.example:8080/images/shop/c-82.jpg?v=2', SITE),
    '/images/shop/c-82.jpg?v=2'
  )
  assert.equal(siteAddress('http://studio.example.test/images/a.png', SITE, ALIAS), '/images/a.png')
  assert.equal(
    siteAddress('/index.php/contact', SITE),
    '/index.php/contact',
    'a relative address is already a path'
  )
  assert.equal(siteAddress('https://elsewhere.example/page', SITE), null, 'another site is not this one')
  assert.equal(siteAddress('mailto:hello@example.test', SITE), null)
  assert.equal(siteAddress('', SITE), null)
})

test('paths turn into request addresses and file names', () => {
  assert.equal(urlOfPath('/', SITE), `${SITE}/index.php`)
  assert.equal(urlOfPath('/blog?start=6', SITE), `${SITE}/index.php/blog?start=6`)
  assert.equal(pathOfRoute('home'), '/')
  assert.equal(pathOfRoute('about-us/contact'), '/about-us/contact')
  assert.equal(slugOfPath('/'), 'home')
  assert.equal(slugOfPath('/blog/first-post'), 'blog_first-post')
  assert.equal(slugOfPath('/blog?start=6'), 'blog--start-6')
})

test('extractLinks reads every href however it is quoted', () => {
  const html = `<a href="/a">A</a><a class="x" href='/b?x=1&amp;start=2'>B</a><a href=/c>C</a><link href="/style.css">`
  assert.deepEqual(extractLinks(html), ['/a', '/b?x=1&start=2', '/c'])
})

/** A fabricated site: pages by request path, with redirects and dead routes. */
function fakeSite(routes) {
  const calls = []
  const fetchPage = async (url) => {
    const u = new URL(url)
    const key = u.pathname + u.search
    calls.push(key)
    const r = routes[key]
    if (!r) return { status: 404, finalUrl: url, html: '' }
    if (r.redirect)
      return { status: 200, finalUrl: new URL(r.redirect, SITE).href, html: routes[r.redirect].html }
    return { status: 200, finalUrl: url, html: r.html }
  }
  return { fetchPage, calls }
}

test('the crawl follows every link until no new page appears, and lists dead paths apart', async () => {
  const { fetchPage, calls } = fakeSite({
    '/index.php': {
      html: '<a href="/index.php/classes/">Classes</a><a href="http://studio.example.test/index.php/blog">Blog</a>'
    },
    '/index.php/classes': {
      html: '<a href="/index.php">Home</a><a href="/index.php/classes/boxing-basics">Basics</a>'
    },
    '/index.php/classes/boxing-basics': { html: '<a href="/index.php/tag/2-gloves">Gloves</a>' },
    '/index.php/tag/2-gloves': { html: '<a href="/index.php/missing-page">Gone</a>' },
    '/index.php/blog': {
      html: '<a href="/index.php/blog?start=3">Next</a><a href="/index.php/blog?start=3#c">Next</a>'
    },
    '/index.php/blog?start=3': { html: '<a href="/index.php/blog?start=0">First</a>' },
    '/index.php/old-home': { redirect: '/index.php' }
  })
  const r = await crawlSite({
    seeds: [
      { path: '/', from: 'content-map' },
      { path: '/about', from: 'content-map' },
      { path: '/old-home', from: 'content-map' }
    ],
    fetchPage,
    siteUrl: SITE,
    aliasHosts: ALIAS
  })
  assert.deepEqual(r.pages.map((p) => p.path).sort(), [
    '/',
    '/blog',
    '/blog?start=3',
    '/classes',
    '/classes/boxing-basics',
    '/tag/2-gloves'
  ])
  assert.deepEqual(r.dead.map((d) => [d.path, d.status]).sort(), [
    ['/about', 404],
    ['/missing-page', 404]
  ])
  assert.deepEqual(r.dead.find((d) => d.path === '/missing-page').from, ['/tag/2-gloves'])
  assert.deepEqual(r.pages.find((p) => p.path === '/').aliases, ['/old-home'])
  assert.equal(new Set(calls).size, calls.length, 'no address is fetched twice')
  assert.equal(r.capReached, false)
})

test('the page cap is reported, never applied silently', async () => {
  const { fetchPage } = fakeSite({
    '/index.php': { html: '<a href="/index.php/a">a</a><a href="/index.php/b">b</a>' },
    '/index.php/a': { html: '' },
    '/index.php/b': { html: '' }
  })
  const r = await crawlSite({ seeds: [{ path: '/', from: 'content-map' }], fetchPage, siteUrl: SITE, cap: 2 })
  assert.equal(r.pages.length, 2)
  assert.equal(r.capReached, true)
})

// A made-up site: two demo coaches the quickstart ships, its own owner account with posts, and a sign-in
// account the local restore added (no posts), shown alone on the second page of the coach list.
const EXCLUSION_MAP = {
  entities: [
    { key: 'user-7', kind: 'user', identity: { username: 'Rita_Moss' } },
    { key: 'user-8', kind: 'user', identity: { username: 'Omar Pike' } }
  ],
  slots: [{ entity: 'user-7', column: 'name', sample: 'Rita Moss ' }],
  pages: [{ route: 'home' }, { route: 'coaches' }, { route: 'members/sign-in' }]
}
const CHROME = ['/', '/coaches', '/members/sign-in']
const exclusionPages = () => [
  {
    path: '/',
    aliases: [],
    // The front page features the founder's only post: still the founder's own content, not chrome.
    links: [...CHROME, '/coaches/author/rita_moss', '/blog/left-hook'],
    refs: ['content-map']
  },
  {
    path: '/coaches',
    aliases: [],
    links: [
      ...CHROME,
      '/coaches/author/rita_moss',
      '/coaches/author/omar pike',
      '/coaches/author/owner',
      '/coaches?start=3'
    ],
    refs: ['/']
  },
  {
    path: '/coaches?start=3',
    aliases: [],
    links: [...CHROME, '/coaches', '/coaches/author/sign-in-tester'],
    refs: ['/coaches']
  },
  { path: '/coaches/author/rita_moss', aliases: [], links: [...CHROME, '/blog/left-hook'], refs: ['/'] },
  { path: '/coaches/author/omar pike', aliases: [], links: CHROME, refs: ['/coaches'] },
  {
    path: '/coaches/author/owner',
    aliases: [],
    links: [...CHROME, '/blog/jab', '/blog/left-hook'],
    refs: ['/coaches']
  },
  {
    path: '/coaches/author/sign-in-tester',
    aliases: ['/x/coaches/author/sign-in-tester'],
    links: [...CHROME, '/coaches/author/sign-in-tester?start=2'],
    refs: ['/coaches?start=3']
  },
  { path: '/coaches/author/founder', aliases: [], links: [...CHROME, '/blog/left-hook'], refs: ['/coaches'] },
  { path: '/members/sign-in', aliases: [], links: CHROME, refs: ['/'] },
  { path: '/blog/jab', aliases: [], links: CHROME, refs: ['/coaches/author/owner'] },
  {
    path: '/blog/left-hook',
    aliases: [],
    links: CHROME,
    refs: ['/', '/coaches/author/owner', '/coaches/author/rita_moss']
  }
]

test('account pages: told by path, declared accounts known by user name and display name', () => {
  const routes = new Set(['/members/sign-in'])
  assert.equal(accountOfPath('/coaches/author/Sign-In Tester', routes), 'sign_in_tester')
  assert.equal(accountOfPath('/members/sign-in', routes), null)
  assert.equal(accountOfPath('/coaches', routes), null)
  assert.deepEqual([...knownAccounts(EXCLUSION_MAP)].sort(), ['omar_pike', 'rita_moss'])
  assert.ok(pathPattern('/coaches/*/sign-*')('/coaches/author/sign-in-tester'))
  assert.ok(!pathPattern('/coaches')('/coaches/author/owner'))
})

test('test-data pages are left out without naming them: undeclared account with no content, what lists only it', () => {
  const routes = new Set(['/', '/coaches', '/members/sign-in'])
  const left = decideExclusions({ pages: exclusionPages(), map: EXCLUSION_MAP, routes })
  assert.deepEqual([...left.keys()].sort(), ['/coaches/author/sign-in-tester', '/coaches?start=3'])
  // A declared account is kept even with no posts; an undeclared one with posts (the site owner) is kept.
  assert.ok(!left.has('/coaches/author/omar pike'))
  assert.ok(!left.has('/coaches/author/owner'))
  assert.ok(!left.has('/coaches/author/founder'), 'content the front page features is still its own')
  // An undeclared account whose first page lists only what the chrome links to, its later page its own posts.
  const later = decideExclusions({
    pages: [
      ...exclusionPages(),
      { path: '/coaches/author/admin', aliases: [], links: CHROME, refs: ['/coaches'] },
      {
        path: '/coaches/author/admin?start=3',
        aliases: [],
        links: [...CHROME, '/blog/jab'],
        refs: ['/coaches/author/admin']
      }
    ],
    map: EXCLUSION_MAP,
    routes
  })
  assert.ok(!later.has('/coaches/author/admin'))
  assert.ok(!later.has('/coaches/author/admin?start=3'))
  const byFlag = decideExclusions({
    pages: exclusionPages(),
    map: EXCLUSION_MAP,
    routes,
    patterns: ['/coaches/author/own*']
  })
  assert.equal(byFlag.get('/coaches/author/owner'), 'matches an --exclude-path pattern')
  assert.equal(byFlag.get('/blog/jab'), 'reached only through left-out pages')
  assert.ok(!byFlag.has('/blog/left-hook'), 'still linked from a kept page')

  const kept = applyExclusions(
    {
      pages: exclusionPages(),
      dead: [
        { path: '/gone-a', status: 404, refs: ['/coaches/author/sign-in-tester'] },
        { path: '/gone-b', status: 404, refs: ['/coaches/author/sign-in-tester', '/coaches'] }
      ]
    },
    { map: EXCLUSION_MAP }
  )
  const text = JSON.stringify({ pages: kept.pages, dead: kept.dead, excluded: kept.excluded })
  assert.ok(!/tester/.test(text), 'nothing kept names the left-out account')
  assert.equal(kept.pages.length, 9)
  assert.deepEqual(
    kept.dead.map((d) => [d.path, d.from]),
    [['/gone-b', ['/coaches']]]
  )
  assert.deepEqual(
    kept.excluded.map((e) => e.count).reduce((a, b) => a + b),
    2
  )
  assert.ok(kept.pages.every((p) => !('links' in p) && !('refs' in p)))
  assert.equal(kept.hide.length, 2)
})

test('crawl seeds skip menu headings, # links, aliases to nothing and unpublished entries', () => {
  const map = {
    entities: [{ key: 'menuItem-9', kind: 'menuItem', identity: { published: '0' } }],
    pages: [
      { entity: 'menuItem-1', route: 'home', link: 'index.php?option=com_content&view=featured' },
      { entity: 'menuItem-2', route: 'classes', link: 'index.php?option=com_content&view=category&id=3' },
      { entity: 'menuItem-3', route: 'more', link: '' },
      { entity: 'menuItem-4', route: 'soon', link: '#' },
      { entity: 'menuItem-5', route: 'about/alias', link: 'index.php?Itemid=' },
      { entity: 'menuItem-6', route: 'old', link: 'index.php?option=com_content&view=archive', published: 0 },
      { entity: 'menuItem-9', route: 'hidden', link: 'index.php?option=com_content&view=article&id=4' },
      { entity: 'menuItem-10', route: 'about', link: 'index.php?Itemid=2' },
      {
        entity: 'menuItem-11',
        route: 'one-class',
        link: 'index.php?option=com_content&view=article&id=4&Itemid=2'
      }
    ]
  }
  assert.deepEqual(
    seedsOf(map).map((s) => s.path),
    ['/', '/classes']
  )
})
