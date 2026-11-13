// The built site check reads rendered pages the way a visitor sees them, and reads only a local site (ticket #601).
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { innermostHolding, linksOf, textOf, treeOf } from '../built-site-check/html-read.mjs'
import { fetchLocal, isLocalHost, localBaseOf } from '../built-site-check/local-fetch.mjs'
import { crawlSite, pagePathOf, pagesOfFolder } from '../built-site-check/site-pages.mjs'
import { folderOf } from './fixtures/built-site-check/florist.mjs'

test('words split across inline tags, entities and unicode read as a visitor reads them', () => {
  const tree = treeOf(
    '<div><script>var x = "<p>Nope</p>"</script><p>Fresh <em>tu</em>lips &amp; caf&eacute;&#x1F337;</p></div>'
  )
  assert.equal(textOf(tree), 'Fresh tulips & café🌷')
  assert.deepEqual(
    innermostHolding(tree, 'tulips & café').map((el) => el.name),
    ['p']
  )
})

test('a link in a nav or a menu class is a menu link; one in the page body is not', () => {
  const links = linksOf(
    treeOf(
      '<div class="t4-megamenu"><a href="/a">A</a></div><nav><a href="/b">B</a></nav><p><a href="/c">C</a></p>'
    )
  )
  assert.deepEqual(
    links.map((l) => [l.href, l.menu]),
    [
      ['/a', true],
      ['/b', true],
      ['/c', false]
    ]
  )
})

test('only a local base address is read', () => {
  for (const host of ['localhost', '127.0.0.1', 'florist.test', 'florist.ddev.site', 'a.localhost'])
    assert.equal(isLocalHost(host), true, host)
  for (const host of ['quillhaven-florist.example', 'test', 'localhost.example', 'florist.test.example'])
    assert.equal(isLocalHost(host), false, host)
  assert.throws(() => localBaseOf('https://quillhaven-florist.example/'), { code: 'site_not_local' })
  assert.throws(() => localBaseOf('ftp://localhost/'), { code: 'site_not_local' })
  assert.throws(() => localBaseOf('http://user:pw@localhost/'), { code: 'site_not_local' })
})

test('page addresses drop index.php, file endings and the base path', () => {
  assert.equal(pagePathOf('/index.php/visit-us'), '/visit-us')
  assert.equal(pagePathOf('/bouquets/'), '/bouquets')
  assert.equal(pagePathOf('/site/index.php'), '/site')
  assert.equal(pagePathOf('/site/about', '/site/'), '/about')
  assert.equal(pagePathOf('/'), '/')
})

test('a folder of saved pages: index is home, an empty page is still a page', () => {
  const dir = folderOf({ 'index.html': '<p>Hi</p>', 'about.html': '', 'shop/rings.html': '<p>R</p>' })
  assert.deepEqual(
    pagesOfFolder(dir).map((p) => p.path),
    ['/about', '/', '/shop/rings']
  )
})

/** A local test server: `routes` maps an address to [status, html, headers]. */
async function serve(routes) {
  const seen = []
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`)
    const [status, body, headers] = routes[req.url] ?? [404, '<p>Not found</p>', {}]
    res.writeHead(status, { 'content-type': 'text/html', ...headers })
    res.end(body)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = localBaseOf(`http://127.0.0.1:${server.address().port}/`)
  return { base, seen, close: () => new Promise((resolve) => server.close(resolve)) }
}

test('a crawl reads linked pages, keeps error statuses, follows no redirect off the base, sends GET only', async () => {
  const site = await serve({
    '/': [
      200,
      '<nav><a href="/a">A</a><a href="/broken">B</a><a href="/away">C</a><a href="/empty">E</a></nav>'
    ],
    '/a': [200, '<a href="https://elsewhere.example/x">off</a><a href="/a#top">self</a>'],
    '/broken': [500, '<p>Error</p>'],
    '/away': [302, '', { location: 'https://elsewhere.example/' }],
    '/empty': [200, '']
  })
  try {
    const { pages } = await crawlSite(site.base, { seeds: ['/plan-page'] })
    const by = Object.fromEntries(pages.map((p) => [p.path, p.status]))
    assert.deepEqual(by, {
      '/': 200,
      '/plan-page': 404,
      '/a': 200,
      '/broken': 500,
      '/away': 302,
      '/empty': 200
    })
    assert.equal(pages.find((p) => p.path === '/away').note, 'redirect_off_base')
    assert.ok(site.seen.every((line) => line.startsWith('GET ')))
    assert.ok(!site.seen.some((line) => line.includes('elsewhere')))
    const off = await fetchLocal(site.base, 'https://elsewhere.example/')
    assert.equal(off.note, 'off_base')
  } finally {
    await site.close()
  }
})

test('fifty pages are read with at most four requests at once', async () => {
  let running = 0
  let most = 0
  const fetchImpl = async (url) => {
    running++
    most = Math.max(most, running)
    await new Promise((resolve) => setTimeout(resolve, 2))
    running--
    const links =
      new URL(url).pathname === '/'
        ? Array.from({ length: 50 }, (_, i) => `<a href="/p${i}">P${i}</a>`).join('')
        : '<p>Page</p>'
    return new Response(links, { status: 200, headers: { 'content-type': 'text/html' } })
  }
  const { pages, capped } = await crawlSite(localBaseOf('http://florist.test/'), { fetchImpl })
  assert.equal(pages.length, 51)
  assert.equal(capped, false)
  assert.ok(most <= 4, `${most} at once`)
  const small = await crawlSite(localBaseOf('http://florist.test/'), { fetchImpl, max: 10 })
  assert.equal(small.pages.length, 10)
  assert.equal(small.capped, true)
})
