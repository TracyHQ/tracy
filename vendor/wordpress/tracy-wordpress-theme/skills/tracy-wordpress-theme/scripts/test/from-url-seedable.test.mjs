import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildSpecPack } from '../ingest/from-html.mjs'
import { serveStatic } from '../lib/html-render.mjs'

const run = promisify(execFile)
const skill = new URL('../..', import.meta.url).pathname
const tempDirs = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'from-url-seedable-'))
  tempDirs.push(dir)
  return dir
}
test.after(() => tempDirs.forEach((d) => rmSync(d, { recursive: true, force: true })))
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

async function site(routes, fn) {
  const server = createServer((req, res) => {
    const route = routes[req.url]
    if (route?.redirect) {
      res.writeHead(route.status ?? 301, { location: route.redirect })
      res.end()
    } else if (route) {
      res.writeHead(route.status ?? 200, { 'content-type': route.type ?? 'text/html; charset=utf-8' })
      res.end(route.body ?? '<!doctype html><html><head><title>Page</title></head><body><main><h1>Page</h1><section><p>Body copy</p></section></main></body></html>')
    } else {
      res.writeHead(404)
      res.end('missing')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try { await fn(`http://127.0.0.1:${server.address().port}`) }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
}

test('from-url captures linked stylesheets and inline and sheet @imports, and names an off-origin stylesheet gap', async () => {
  const routes = {
    '/': { body: '<!doctype html><html><head><base href="/css/"><title>CSS capture</title><link rel="stylesheet" href="main.css"><link rel="stylesheet" href="http://localhost:1/off-origin.css"><style>@import url("inline.css");body{font-family:Inline}</style></head><body><main><h1>CSS capture</h1><p>Body copy for capture</p></main></body></html>' },
    '/css/main.css': { type: 'text/css', body: '@import "more.css";h1{font-family:Display}' },
    '/css/more.css': { type: 'text/css', body: '@font-face{font-family:Display;src:url(/display.woff2)}' },
    '/css/inline.css': { type: 'text/css', body: 'body{font-family:Inline}' }
  }
  await site(routes, async (base) => {
    const root = temp(), pack = join(root, 'pack')
    await run('node', [join(skill, 'scripts/ingest/from-url.mjs'), `${base}/`, '--out', pack, '--max-pages', '1'], { cwd: skill })
    const map = read(join(pack, 'reference/capture/stylesheet-map.json'))
    assert.ok(map.urls[`${base}/css/main.css`])
    assert.ok(map.urls[`${base}/css/more.css`])
    assert.ok(map.urls[`${base}/css/inline.css`])
    assert.ok(readFileSync(join(pack, 'reference/capture', map.urls[`${base}/css/main.css`]), 'utf8').includes('/_captured-css/'))
    const captureHtml = readFileSync(join(pack, 'reference/capture/pages/index.html'), 'utf8')
    assert.match(captureHtml, /href="\/_captured-css\//)
    assert.match(captureHtml, /@import url\(["']\/_captured-css\//)
    assert.ok(map.gaps.some((g) => g.url === 'http://localhost:1/off-origin.css' && /off-origin/.test(g.reason)))
  })
})

test('from-url captures @font-face files, serves local URLs, and reports a failed font fetch', async () => {
  const routes = {
    '/': { body: '<!doctype html><html><head><title>Fonts</title><link rel="stylesheet" href="/css/main.css"></head><body><main><h1>Fonts</h1><p>Body copy</p></main></body></html>' },
    '/css/main.css': { type: 'text/css', body: '@font-face{font-family:Display;src:url(../fonts/display.woff2) format("woff2")}@font-face{font-family:Missing;src:url(../fonts/missing.woff2)}body{font-family:Display;background-image:url(../images/texture.svg)}' },
    '/fonts/display.woff2': { type: 'font/woff2', body: Buffer.from('font fixture') },
    '/fonts/missing.woff2': { status: 404, type: 'text/plain', body: 'missing font' }
  }
  await site(routes, async (base) => {
    const root = temp(), pack = join(root, 'pack')
    await run('node', [join(skill, 'scripts/ingest/from-url.mjs'), `${base}/`, '--out', pack, '--max-pages', '1'], { cwd: skill })
    const capture = join(pack, 'reference/capture')
    const map = read(join(capture, 'stylesheet-map.json'))
    const fontPath = map.assets[`${base}/fonts/display.woff2`]
    assert.ok(fontPath, 'the declared font URL maps to a captured file')
    assert.ok(existsSync(join(capture, fontPath)))
    const cssPath = map.urls[`${base}/css/main.css`]
    const css = readFileSync(join(capture, cssPath), 'utf8')
    assert.match(css, /url\("\/_captured-css\/[^" ]+\.woff2"\)/)
    assert.ok(css.includes(`url("${base}/fonts/missing.woff2")`))
    assert.ok(css.includes(`url("${base}/images/texture.svg")`), 'other relative CSS resources keep their original source URL')
    const served = await serveStatic(join(capture, 'pages'))
    try {
      const response = await fetch(`${served.origin}/${fontPath.replace(/^pages\//, '')}`)
      assert.equal(response.status, 200, 'the rewritten font URL is served from the capture bundle')
      assert.equal(await response.text(), 'font fixture')
    } finally { await served.close() }
    assert.ok(map.gaps.some((gap) => gap.url === `${base}/fonts/missing.woff2` && /@font-face file was not captured/.test(gap.reason)))
    assert.ok(read(join(pack, 'source-fonts.json')).static.gaps.some((gap) => gap.includes(`${base}/fonts/missing.woff2`)))
  })
})

test('from-url captures real routes, redirect rules, seed payloads and matches a from-html bundle', async () => {
  const body = (title, links = '') => `<!doctype html><html><head><title>${title}</title></head><body><header><a href="/">Home</a></header><main><h1>${title}</h1><section><p>${title} body</p>${links}</section></main></body></html>`
  const routes = {
    '/': { body: body('Home', '<a href="/about/">About</a><a href="/old">Old</a><a href="/old/">Old slash</a><a href="/blog/post-1?x=1">Post</a><a href="/a/index">A</a><a href="/b/index">B</a><a href="/index-2">Name collision</a><a href="/search?q=first">Search one</a><a href="/search?q=second">Search two</a><a href="/base">Base</a><a href="/redirect?q=1">Redirect query</a>') },
    '/about/': { body: body('About') },
    '/old': { redirect: '/about/', status: 301 },
    '/old/': { redirect: '/about/', status: 301 },
    '/blog/post-1?x=1': { body: body('Post') },
    '/a/index': { body: body('A') },
    '/b/index': { body: body('B') },
    '/index-2': { body: body('Name collision') },
    '/search?q=first': { body: body('Search first') },
    '/search?q=second': { body: body('Search second') },
    '/base': { body: '<!doctype html><html><head><base data-href="/wrong/" href="../assets/"><title>Base</title></head><body><main><h1>Base</h1></main></body></html>' },
    '/redirect?q=1': { redirect: '/landing?from=query', status: 302 },
    '/landing?from=query': { body: body('Landing') }
  }
  await site(routes, async (base) => {
    const root = temp()
    const pack = join(root, 'url-pack')
    await run('node', [join(skill, 'scripts/ingest/from-url.mjs'), `${base}/`, '--out', pack], { cwd: skill })
    const map = read(join(pack, 'page-map.json'))
    const ref = read(join(pack, 'reference.json'))
    const prov = read(join(pack, 'provenance.json'))
    const redirects = read(join(pack, 'redirects.json'))
    const content = read(join(pack, 'content.json'))
    const paths = new Map(map.pages.map((p) => [p.path, p.file]))
    for (const name of ['content', 'sections', 'menus', 'redirects']) assert.ok(read(join(pack, `${name}.json`)))
    assert.equal(paths.get('/'), 'index.html')
    assert.ok(paths.has('/about'))
    assert.ok(paths.has('/blog/post-1'))
    assert.ok(paths.has('/a/index'))
    assert.ok(paths.has('/b/index'))
    assert.ok(paths.has('/index-2'))
    const collisionFiles = ['/a/index', '/b/index', '/index-2'].map((p) => paths.get(p))
    assert.equal(new Set(collisionFiles).size, 3)
    assert.ok(paths.has('/search'), 'the query is excluded from the WordPress route')
    assert.ok(paths.has('/landing'))
    assert.ok(!map.pages.some((p) => p.path.includes('?')))
    assert.deepEqual(map.pages.filter((p) => p.view === 'front-page').map((p) => p.path), ['/'])
    assert.ok(redirects.rules.some((r) => r.from === '/old' && r.to === '/about' && r.status === 301))
    assert.ok(redirects.rules.some((r) => r.from === '/redirect' && r.to === '/landing' && r.status === 302))
    assert.equal(ref.kind, 'html', 'the captured HTML is the reference used by Phase 8')
    assert.equal(prov.adapter, 'from-url')
    assert.equal(prov.source.kind, 'url')
    assert.equal(prov.source.start, `${base}/`)
    assert.equal(prov.source.origin, base)
    assert.equal(prov.source.crawled, 9)
    assert.equal(prov.source.sameOrigin, true)
    assert.ok(prov.source.failures.some((f) => f.reason === 'query variant of /search'))
    for (const route of ['/a/index', '/b/index']) {
      const page = content.pages.find((p) => p.path === route)
      assert.equal(page.slug, 'index')
      assert.equal(page.parent, route.split('/').slice(0, -1).join('/'))
    }
    const capturedBase = readFileSync(join(pack, 'reference', 'capture', 'pages', paths.get('/base')), 'utf8')
    assert.ok(capturedBase.includes(`<base data-href="/wrong/" href="${base}/assets/">`), 'only the actual href attribute is rewritten against the final page URL')
    // This is the same read pattern used by seed.mjs loadSpec.
    for (const file of ['page-map', 'content', 'sections', 'menus', 'redirects']) read(join(pack, `${file}.json`))

    const capture = join(pack, 'reference', 'capture')
    const htmlPack = join(root, 'html-pack')
    await run('node', [join(skill, 'scripts/ingest/from-html.mjs'), capture, '--out', htmlPack], { cwd: skill })
    const htmlMap = read(join(htmlPack, 'page-map.json'))
    const urlSections = read(join(pack, 'sections.json'))
    const htmlSections = read(join(htmlPack, 'sections.json'))
    assert.deepEqual(map.pages.map(({ file, path, view, sections }) => ({ file, path, view, sections })), htmlMap.pages.map(({ file, path, view, sections }) => ({ file, path, view, sections })))
    assert.deepEqual(urlSections, htmlSections)

    const redirectedPack = join(root, 'redirected-start-pack')
    await run('node', [join(skill, 'scripts/ingest/from-url.mjs'), `${base}/old`, '--out', redirectedPack], { cwd: skill })
    const redirected = read(join(redirectedPack, 'redirects.json'))
    const redirectedCrawl = read(join(redirectedPack, 'reference', 'crawl.json'))
    assert.ok(redirected.rules.some((r) => r.from === '/old' && r.to === '/about' && r.status === 301))
    assert.equal(redirectedCrawl.pages[0].requestedUrl, `${base}/old`)
    assert.equal(redirectedCrawl.pages[0].url, `${base}/about/`)
  })
})

test('from-url records redirect loops and hop bound as failures', async () => {
  await site({
    '/': { body: '<!doctype html><a href="/loop">loop</a><a href="/hop">hop</a>' },
    '/loop': { redirect: '/loop' },
    '/hop': { redirect: '/hop/1' },
    '/hop/1': { redirect: '/hop/2' },
    '/hop/2': { redirect: '/hop/3' },
    '/hop/3': { redirect: '/hop/4' },
    '/hop/4': { redirect: '/hop/5' },
    '/hop/5': { redirect: '/hop/6' },
    '/hop/6': { redirect: '/hop/7' },
    '/hop/7': { redirect: '/hop/8' },
    '/hop/8': { redirect: '/hop/9' },
    '/hop/9': { redirect: '/hop/10' },
    '/hop/10': { redirect: '/hop/11' }
  }, async (base) => {
    const pack = join(temp(), 'pack')
    await run('node', [join(skill, 'scripts/ingest/from-url.mjs'), `${base}/`, '--out', pack], { cwd: skill })
    const failures = read(join(pack, 'reference', 'crawl.json')).failures
    assert.ok(failures.some((f) => /redirect loop/.test(f.error)))
    assert.ok(failures.some((f) => /redirect hop bound \(10\)/.test(f.error)))
  })
})

test('from-html rejects duplicate manifest routes and names both pages', async () => {
  const root = temp()
  const src = join(root, 'bundle')
  const pages = join(src, 'pages')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(pages, { recursive: true })
  writeFileSync(join(pages, 'one.html'), '<main><h1>One</h1></main>')
  writeFileSync(join(pages, 'two.html'), '<main><h1>Two</h1></main>')
  writeFileSync(join(src, 'manifest.json'), JSON.stringify({ pages: [
    { file: 'one.html', path: '/same' }, { file: 'two.html', path: '/same' }
  ] }))
  await assert.rejects(
    run('node', [join(skill, 'scripts/ingest/from-html.mjs'), src, '--out', join(root, 'pack')], { cwd: skill }),
    (error) => /one\.html/.test(error.stderr) && /two\.html/.test(error.stderr) && /same path/.test(error.stderr)
  )
})

test('from-html normalizes trailing slashes before deriving nested page parents', async () => {
  const root = temp()
  const src = join(root, 'bundle')
  const pages = join(src, 'pages')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(pages, { recursive: true })
  writeFileSync(join(pages, 'about.html'), '<main><h1>About</h1></main>')
  writeFileSync(join(pages, 'team.html'), '<main><h1>Team</h1></main>')
  writeFileSync(join(src, 'manifest.json'), JSON.stringify({ pages: [
    { file: 'about.html', path: '/about/' }, { file: 'team.html', path: '/about/team' }
  ] }))
  const pack = join(root, 'pack')
  await buildSpecPack({
    src, out: pack, pageFloor: 1,
    redirectRules: [{ from: '/old/', to: '/about/', status: 301, reason: 'captured redirect' }]
  })
  const map = read(join(pack, 'page-map.json'))
  const content = read(join(pack, 'content.json'))
  const redirects = read(join(pack, 'redirects.json'))
  assert.deepEqual(map.pages.map((p) => p.path).sort(), ['/about', '/about/team'])
  const parent = content.pages.find((p) => p.path === '/about')
  const child = content.pages.find((p) => p.path === '/about/team')
  assert.ok(parent)
  assert.equal(child.parent, parent.path)
  assert.deepEqual(redirects.rules.map(({ from, to }) => ({ from, to })), [{ from: '/old', to: '/about' }])
})

test('from-url documentation distinguishes captured HTML reference from URL provenance', () => {
  const fromUrl = readFileSync(join(skill, 'references/inputs/from-url.md'), 'utf8')
  const specPack = readFileSync(join(skill, 'references/inputs/spec-pack.md'), 'utf8')
  assert.match(fromUrl, /reference\.json`? emits `kind: "html"`/)
  assert.match(fromUrl, /provenance\.json`? records adapter `from-url` and source kind `url`/)
  assert.match(specPack, /\| `url` \| `from-joomla` \|/)
  assert.match(specPack, /\| `html` \| `from-html` · `from-url` \|/)
})

test('from-url without --force refuses before replacing an existing capture', async () => {
  let title = 'Original snapshot'
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const pack = join(temp(), 'pack')
    await run('node', [join(skill, 'scripts/ingest/from-url.mjs'), `${base}/`, '--out', pack], { cwd: skill })
    const capture = join(pack, 'reference', 'capture', 'pages', 'index.html')
    const before = readFileSync(capture, 'utf8')
    title = 'Changed live site'
    await assert.rejects(
      run('node', [join(skill, 'scripts/ingest/from-url.mjs'), `${base}/`, '--out', pack], { cwd: skill }),
      (error) => /spec-pack already exists/.test(error.stderr)
    )
    assert.equal(readFileSync(capture, 'utf8'), before)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})
