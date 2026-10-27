// from-url.test.mjs — the crawler, against a server that behaves like a real site misbehaves.
//
// Everything here is measured against a local http server rather than a fixture folder, because
// the failures worth catching are protocol-shaped: a redirect off-origin, a page that is only a
// shell, an asset that a stylesheet asks for. A fixture cannot redirect.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const SCRIPT = join(import.meta.dirname, '..', 'ingest', 'from-url.mjs')

const PAGES = {
  '/': `<html lang="en"><head><title>Home</title><link rel="stylesheet" href="/css/site.css"></head>
        <body><a href="/about">About</a><a href="/deep/page.html">Deep</a><a href="/gone">Gone</a>
        <a href="mailto:a@b.c">mail</a><a href="/leaving">Off</a><img src="/img/hero.png"></body></html>`,
  '/about': `<html lang="en"><head><title>About</title></head><body><p>About us, at some length.</p></body></html>`,
  '/deep/page.html': `<html lang="en"><head><title>Deep</title></head><body><p>Deep page body text.</p></body></html>`
}
const CSS = `@font-face { src: url("/fonts/x.woff2"); } .a { background: url('/img/bg.jpg'); }`

let server
let base
// A SECOND local origin, so "off-origin" is a real origin this test controls. Pointing the
// redirect at example.com would make the case depend on the internet — and then it fails for the
// one reason it must never fail for: the network, not the crawler.
let other
let otherBase

before(async () => {
  server = createServer((req, res) => {
    const url = req.url.split('?')[0]
    if (url === '/leaving') {
      res.writeHead(302, { location: `${otherBase}/elsewhere` })
      return res.end()
    }
    if (url === '/gone') {
      res.writeHead(404, { 'content-type': 'text/html' })
      return res.end('<html><body>no</body></html>')
    }
    if (url === '/css/site.css') {
      res.writeHead(200, { 'content-type': 'text/css' })
      return res.end(CSS)
    }
    if (['/img/hero.png', '/img/bg.jpg', '/fonts/x.woff2'].includes(url)) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      return res.end(Buffer.from('binary-ish'))
    }
    const page = PAGES[url] ?? PAGES[`${url}/`]
    if (!page) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
  })
  other = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html lang="en"><head><title>Elsewhere</title></head><body>another origin</body></html>')
  })
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve))
  // Same host, different port — a different origin by the only definition that matters here.
  otherBase = `http://localhost:${other.address().port}`

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  server?.close()
  other?.close()
})

// The crawler must run in a CHILD process and be awaited: the test server lives in this one, and
// a synchronous spawn would block the event loop that has to answer its requests — the crawl then
// waits for a server that cannot reply until the crawl ends. Measured the hard way.
const run = promisify(execFile)

async function crawl(extra = []) {
  const out = mkdtempSync(join(tmpdir(), 'from-url-'))
  const { stdout } = await run(process.execPath, [SCRIPT, `${base}/`, '--out', out, ...extra], {
    encoding: 'utf8'
  })
  return { out, stdout, report: JSON.parse(readFileSync(join(out, 'crawl.json'), 'utf8')) }
}

test('pages are saved at the path the site serves them from, so relative links still resolve', async () => {
  const { out, report } = await crawl()
  try {
    assert.ok(existsSync(join(out, 'index.html')), '/ becomes index.html')
    assert.ok(existsSync(join(out, 'about', 'index.html')), '/about becomes about/index.html')
    assert.ok(existsSync(join(out, 'deep', 'page.html')), 'a real .html path is kept as is')
    assert.equal(report.pages.length, 3)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('an asset a stylesheet asks for comes too — otherwise the design arrives without its typeface', async () => {
  const { out, report } = await crawl()
  try {
    const files = report.assets.map((a) => a.file)
    assert.ok(files.includes('css/site.css'))
    assert.ok(files.includes('img/hero.png'), 'referenced in markup')
    assert.ok(files.includes('fonts/x.woff2'), 'referenced only inside the CSS')
    assert.ok(files.includes('img/bg.jpg'), 'ditto, in a url() background')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('a redirect to another origin is refused and recorded, not followed quietly', async () => {
  const { out, report } = await crawl()
  try {
    const off = report.failures.find((f) => f.reason === 'redirected off-origin')
    assert.ok(off, 'the off-origin redirect is in the record')
    assert.ok(
      !report.pages.some((p) => p.url.includes('localhost')),
      'the other origin never entered the crawl'
    )
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('a page that 404s is a recorded failure, not a saved page', async () => {
  const { out, report } = await crawl()
  try {
    assert.ok(report.failures.some((f) => f.status === 404))
    assert.ok(!report.pages.some((p) => p.url.endsWith('/gone')))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('--no-assets takes only the markup', async () => {
  const { out, report } = await crawl(['--no-assets'])
  try {
    assert.equal(report.assets.length, 0)
    assert.ok(report.pages.length > 0)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('hitting --max-pages is said out loud, with how many URLs were left', async () => {
  const { out, stdout, report } = await crawl(['--max-pages', '1'])
  try {
    assert.equal(report.pages.length, 1)
    assert.match(stdout, /hit the --max-pages 1 ceiling/)
    assert.match(stdout, /\d+ URLs still in the queue/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('crawl.json is the record a rights question gets answered from', async () => {
  const { out, report } = await crawl()
  try {
    assert.equal(report.start, `${base}/`)
    assert.equal(report.sameOrigin, true)
    assert.ok(Date.parse(report.crawledAt) > 0)
    for (const page of report.pages) assert.ok(page.bytes > 0 && page.url.startsWith(base))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
