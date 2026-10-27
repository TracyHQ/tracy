// review/functional.mjs on fixtures: a clean two-page site passes with what it examined counted;
// every defect fails by its own name; a search page that only repeats the query is no result.
// A page-map's 404 page and its synthetic pages are measured too (issue #7 item 4): the 404 page
// passes page-status on its declared 404 and is still read for lang, h1, alt, forms and links.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withBrowser } from '../lib/browser.mjs'
import { runFunctional, pickSearchWord, internalLinks, formatMarkdown } from '../review/functional.mjs'

const shell = (body, { lang = 'en', head = '' } = {}) => `<!doctype html><html${lang === null ? '' : ` lang="${lang}"`}><head><meta charset="utf-8"><link rel="icon" href="data:,">${head}</head><body>${body}</body></html>`
const HOME = shell(`<header><a href="/">Home</a> <a href="/about/">About</a> <a href="/about/#team">Team</a> <a href="https://elsewhere.example/">Out</a></header>
<main><h1>Welcome to Northwind</h1>
<img src="/pic.png" alt="The Northwind office"><img src="/pic.png" alt="">
<form action="/subscribe"><label for="email">Email</label><input id="email" type="email"><input type="hidden" name="nonce" value="x">
<input type="text" name="company" aria-label="Company"><input type="text" name="hp" style="display:none"><button>Subscribe</button></form>
<form role="search" action="/"><input type="search" name="s" title="Search"><input type="submit" value="Go"></form></main>`)
const ABOUT = shell(`<main><h1>About Northwind Traders</h1><p>Since 1998.</p><a href="/">Back</a></main>`)
const BAD = shell(
  `<main><h1>First</h1><h1>Second</h1><img src="/pic.png"><form action="/x"><input type="text" placeholder="Your name"></form>
<a href="/missing/">Gone</a><a href="/reset/">Reset</a><a href="/about/">About</a></main><script>console.error('boom'); undefinedFunction()</script>`,
  { lang: null }
)
const RESULTS = shell(`<main><h1>Search results for “northwind”</h1><ul class="wp-block-post-template"><li class="wp-block-post"><h2><a href="/about/">About Northwind Traders</a></h2></li></ul></main>`)
const ECHO = shell(`<main><h1>Search results for “northwind”</h1><p>Nothing found.</p></main>`).replace('<body>', '<body class="search search-no-results">')
// A finder list whose only children are the heading and a "nothing" line — and no search-no-results class.
const HEADING_ONLY = shell(`<main><div class="search-results"><h1>Results for northwind</h1><p>Nothing found</p></div></main>`).replace('<body>', '<body class="search">')
// The same, with the heading wrapped in an ordinary link — still only the query repeated.
const HEADING_LINKED = shell(`<main><div class="search-results"><h1><a href="/about/">Results for northwind</a></h1><p>Nothing found</p></div></main>`).replace('<body>', '<body class="search">')
// The page title outside, and inside the results area a plain wrapper holding a linked heading that
// repeats the query plus the "Nothing found" line — a wrapper is no result item.
const WRAPPED_EMPTY = shell(`<main><h1>Search</h1><div class="search-results"><div><h2><a href="/about/">Results for northwind</a></h2><p>Nothing found</p></div></div></main>`).replace('<body>', '<body class="search">')
// The same wrapper without the message: an item, but the word it carries is only the query repeated.
const WRAPPED_ECHO = shell(`<main><h1>Search</h1><div class="search-results"><div><h2><a href="/about/">Results for “northwind”</a></h2></div></div></main>`).replace('<body>', '<body class="search">')
// A ported finder list: a heading, then result items whose titles are linked headings.
const FINDER = shell(`<main><div class="search-results"><h1>Results for northwind</h1><div class="result-item"><h3><a href="/about/">About Northwind Traders</a></h3><p>Northwind since 1990.</p></div></div></main>`).replace('<body>', '<body class="search">')
// The port's 404 page: answers 404 on purpose, and still carries an unlabelled field, an image with
// no alt and a link to a page that is gone. Its skip link and `#` menu items point into the page
// itself — the browser resolves them to /lost/, which answers 404, and they are no broken link.
const LOST = shell(`<a href="#main">Skip to content</a><a href="#">Menu</a><main id="main"><h1>Page not found</h1><img src="/pic.png"><form role="search" action="/"><input type="search" name="s"><button>Go</button></form><a href="/missing/">Old page</a></main>`)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

function serve({ echoSearch = false, searchBody = null } = {}) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/reset/') return req.socket.destroy()
      if (u.pathname === '/lost/') return res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(LOST)
      if (u.pathname === '/pic.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
      const body = u.searchParams.has('s') ? (searchBody ?? (echoSearch ? ECHO : RESULTS)) : { '/': HOME, '/about/': ABOUT, '/bad/': BAD }[u.pathname]
      res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(body ?? shell('<main><h1>Not found</h1></main>'))
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

test('functional: pure helpers — the search word comes from the headings; internal links are deduplicated and fragments dropped', () => {
  assert.equal(pickSearchWord(['Welcome to Northwind', 'About Northwind Traders']), 'northwind')
  assert.equal(pickSearchWord(['Home', 'About']), null)
  assert.deepEqual(internalLinks(['http://s.test/a/#x', 'http://s.test/a/', '/b', 'https://other.test/', 'mailto:x@y', 'http://s.test/wp-admin/', 'http://s.test/wp-login.php?action=logout'], 'http://s.test/'), ['http://s.test/a/', 'http://s.test/b'])
})

test('functional: a clean site passes, counting what it examined; the search result contains the word', async () => {
  const srv = await serve()
  try {
    const r = await withBrowser((b) => runFunctional(b, { site: srv.origin, routes: ['/', '/about/'] }))
    assert.equal(r.ok, true, formatMarkdown(r))
    assert.equal(r.findings, 0)
    assert.deepEqual(r.examined, { pages: 2, links: 2, images: 2, forms: 2, fields: 3, searches: 1 })
    assert.deepEqual(r.links.map((l) => [new URL(l.url).pathname, l.status]), [['/', 200], ['/about/', 200]], 'the #team fragment is the same page; the external link is not checked')
    assert.equal(r.search.word, 'northwind')
    assert.equal(r.search.matching, 1)
    assert.match(formatMarkdown(r), /^PASS · 0 finding\(s\) · examined 2 pages, 2 internal links/m)
  } finally {
    await srv.close()
  }
})

test('functional: each defect fails by name — lang, h1 count, alt, label, submit, console, uncaught error, broken link; a search that only echoes the query fails', async () => {
  const srv = await serve({ echoSearch: true })
  try {
    const r = await withBrowser((b) => runFunctional(b, { site: srv.origin, routes: ['/bad/', '/nowhere/'] }))
    assert.equal(r.ok, false)
    const bad = r.routes.find((x) => x.route === '/bad/')
    const kinds = bad.findings.map((f) => f.kind)
    for (const k of ['html-lang', 'h1-count', 'img-alt', 'form-label', 'form-submit', 'console-error', 'link-broken']) assert.ok(kinds.includes(k), `${k} in ${kinds.join(', ')}`)
    assert.match(bad.findings.find((f) => f.kind === 'form-label').field, /placeholder "Your name" only/)
    assert.ok(bad.findings.some((f) => f.kind === 'console-error' && /boom/.test(f.message)))
    assert.ok(bad.findings.some((f) => f.kind === 'console-error' && /uncaught: .*undefinedFunction/.test(f.message)))
    assert.deepEqual(bad.findings.filter((f) => f.kind === 'link-broken').map((f) => [new URL(f.url).pathname, f.status]), [['/missing/', 404], ['/reset/', 0]], 'a link whose request fails is broken, not skipped')
    assert.ok(bad.findings.find((f) => f.url?.endsWith('/reset/'))?.error)
    assert.equal(bad.findings.find((f) => f.kind === 'h1-count').count, 2)
    assert.deepEqual(r.routes.find((x) => x.route === '/nowhere/').findings.map((f) => [f.kind, f.status]), [['page-status', 404]])
    assert.equal(r.search.ok, false)
    assert.equal(r.search.noResults, true)
    assert.equal(r.search.matching, 0, 'the heading repeating the query is not a result')
    assert.match(formatMarkdown(r), /Search: "[a-z]+" → FAIL/)
  } finally {
    await srv.close()
  }
})

test('functional: a results area holding only the heading and "Nothing found" is no result, class or not, linked heading or not, wrapped or not; a finder list with linked result titles is', async () => {
  for (const [name, searchBody, items] of [
    ['heading only', HEADING_ONLY, 0],
    ['heading in a link', HEADING_LINKED, 0],
    ['a wrapper around the linked heading and the message', WRAPPED_EMPTY, 0],
    ['a wrapper around the linked heading alone', WRAPPED_ECHO, 1]
  ]) {
    const srv = await serve({ searchBody })
    try {
      const r = await withBrowser((b) => runFunctional(b, { site: srv.origin, routes: ['/about/'], searchWord: 'northwind' }))
      assert.equal(r.search.noResults, false, name)
      assert.equal(r.search.items, items, `${name}: neither the heading nor the message is a found item`)
      assert.equal(r.search.matching, 0, name)
      assert.equal(r.search.ok, false, name)
      assert.equal(r.ok, false, name)
    } finally {
      await srv.close()
    }
  }
  const srv = await serve({ searchBody: FINDER })
  try {
    const r = await withBrowser((b) => runFunctional(b, { site: srv.origin, routes: ['/about/'], searchWord: 'northwind' }))
    assert.equal(r.search.items, 1, 'the result item counts; its linked h3 title is inside it, not an item of its own')
    assert.equal(r.search.matching, 1)
    assert.equal(r.search.ok, true, JSON.stringify(r.search))
  } finally {
    await srv.close()
  }
})

test('functional: a site that does not answer is page-status and a failed search, never a clean report', async () => {
  const dead = await serve()
  const origin = dead.origin
  await dead.close()
  const r = await withBrowser((b) => runFunctional(b, { site: origin, routes: ['/'], searchWord: 'northwind', timeoutMs: 5000 }))
  assert.equal(r.ok, false)
  assert.deepEqual(r.routes[0].findings.map((f) => f.kind), ['page-status'])
  assert.equal(r.search.ok, false)
  assert.equal(r.examined.links, 0)
})

test('functional: a route declared 404 passes page-status on its 404 and is still read for alt, labels and links; declared 404 served as 200 fails', async () => {
  const srv = await serve()
  try {
    const r = await withBrowser((b) => runFunctional(b, { site: srv.origin, routes: [{ path: '/lost/', status: 404 }, { path: '/about/', status: 404 }, '/nowhere/'], searchWord: 'northwind' }))
    const by = Object.fromEntries(r.routes.map((x) => [x.route, x]))
    const lost = by['/lost/'].findings.map((f) => f.kind)
    assert.ok(!lost.includes('page-status'), lost.join(', '))
    for (const k of ['img-alt', 'form-label', 'link-broken']) assert.ok(lost.includes(k), `${k} in ${lost.join(', ')}`)
    assert.deepEqual(by['/lost/'].findings.filter((f) => f.kind === 'link-broken').map((f) => new URL(f.url).pathname), ['/missing/'], 'a same-page fragment link is not a link to the 404 page')
    assert.equal(by['/lost/'].status, 404)
    assert.equal(by['/lost/'].expectedStatus, 404)
    assert.deepEqual(by['/about/'].findings.map((f) => [f.kind, f.status, f.expected]), [['page-status', 200, 404]])
    assert.deepEqual(by['/nowhere/'].findings.map((f) => [f.kind, f.status]), [['page-status', 404]], 'an undeclared 404 is still a finding')
  } finally {
    await srv.close()
  }
})

test('functional CLI: every page of a page-map is measured, synthetic ones included; the view "404" page is expected to answer 404', async () => {
  const srv = await serve()
  const scratch = mkdtempSync(join(tmpdir(), 'functional-cli-'))
  try {
    const map = join(scratch, 'page-map.json')
    writeFileSync(map, JSON.stringify({ pages: [{ path: '/', view: 'front-page' }, { path: '/about/', view: 'single', synthetic: true }, { path: '/lost/', view: '404', synthetic: true }] }))
    const out = join(scratch, 'functional.json')
    const child = spawn(process.execPath, [new URL('../review/functional.mjs', import.meta.url).pathname, srv.origin, '--routes', map, '--out', out, '--search-word', 'northwind'])
    child.stdout.resume()
    child.stderr.resume()
    await once(child, 'close')
    const r = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(r.examined.pages, 3)
    assert.deepEqual(r.routes.map((x) => x.route), ['/', '/about/', '/lost/'])
    assert.ok(!r.routes[2].findings.some((f) => f.kind === 'page-status'))
    assert.ok(r.routes[2].findings.some((f) => f.kind === 'img-alt'))
    const missing = spawn(process.execPath, [new URL('../review/functional.mjs', import.meta.url).pathname, srv.origin, '--routes', join(scratch, 'nope.json'), '--out', join(scratch, 'x.json')])
    let stderr = ''
    missing.stderr.on('data', (d) => (stderr += d))
    missing.stdout.resume()
    const [code] = await once(missing, 'close')
    assert.equal(code, 2, stderr)
    assert.match(stderr, /--routes.*nope\.json/)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
    await srv.close()
  }
})
