// The design source is captured offline (visual-lib.mjs keepSourceOffline, owner decisions 2026-11-17): a page that
// renders the source aborts every request to another origin and lists it, except the font hosts (SOURCE_FONT_HOSTS),
// which the source's webfonts need for visual parity. Measured on JA Restaurant 1.0.3: the source home page embeds an
// OpenTable frame that never answers a headless Chromium, so every home axis crashed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  SOURCE_FONT_HOSTS,
  blockedForSource,
  keepSourceOffline,
  offSourceOrigin
} from '../tools/visual-lib.mjs'
import { launchBrowser } from '../tools/qa-browser.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

describe('offSourceOrigin', () => {
  const source = 'http://127.0.0.1:18217'
  it('keeps the source origin, and what is not a network request', () => {
    assert.equal(offSourceOrigin('http://127.0.0.1:18217/index.html', source), false)
    assert.equal(offSourceOrigin('http://127.0.0.1:18217/media/a.js?v=1', `${source}/`), false)
    assert.equal(offSourceOrigin('data:image/png;base64,AAAA', source), false)
    assert.equal(offSourceOrigin('blob:http://127.0.0.1:18217/x', source), false)
  })
  it('names another host, another port of loopback and another scheme as off the source', () => {
    assert.equal(offSourceOrigin('http://secure.opentable.com/frontdoor/default.aspx', source), true)
    assert.equal(offSourceOrigin('https://fonts.googleapis.com/css?fam' + 'ily=Beta', source), true)
    assert.equal(offSourceOrigin('http://127.0.0.1:18216/templates/logo.png', source), true)
    assert.equal(offSourceOrigin('http://localhost:18217/index.html', source), true)
    assert.equal(offSourceOrigin('https://127.0.0.1:18217/index.html', source), true)
  })
})

describe('blockedForSource', () => {
  const source = 'http://127.0.0.1:18217'
  it('lets exactly the two Google Fonts hosts through, on either scheme', () => {
    assert.deepEqual([...SOURCE_FONT_HOSTS], ['fonts.googleapis.com', 'fonts.gstatic.com'])
    assert.equal(blockedForSource('http://fonts.googleapis.com/css?fam' + 'ily=Alpha:300,400', source), false)
    assert.equal(blockedForSource('https://fonts.googleapis.com/css?fam' + 'ily=Beta', source), false)
    assert.equal(blockedForSource('https://fonts.gstatic.com/s/teko/v20/a.woff2', source), false)
    assert.equal(blockedForSource('http://127.0.0.1:18217/media/a.js', source), false)
  })
  it('blocks widgets, maps, analytics and look-alike hosts', () => {
    assert.equal(blockedForSource('http://secure.opentable.com/frontdoor/default.aspx', source), true)
    assert.equal(blockedForSource('https://www.google.com/maps?q=x&output=embed', source), true)
    assert.equal(blockedForSource('https://www.googletagmanager.com/gtag/js?id=G-1', source), true)
    assert.equal(blockedForSource('https://fonts.googleapis.com.evil.example/css', source), true)
    assert.equal(blockedForSource('https://use.typekit.net/abc.css', source), true)
    assert.equal(blockedForSource('http://127.0.0.1:18216/templates/logo.png', source), true)
  })
})

describe('keepSourceOffline', () => {
  let browser, source, other
  const otherHits = []
  const listen = (handler) =>
    new Promise((resolve) => {
      const srv = http.createServer(handler)
      srv.listen(0, '127.0.0.1', () => resolve(srv))
    })
  const origin = (srv) => `http://127.0.0.1:${srv.address().port}`
  before(async () => {
    browser = await launchBrowser()
    other = await listen((req, res) => {
      otherHits.push(req.url)
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('should not be reached')
    })
    source = await listen((req, res) => {
      if (req.url === '/dot.svg') {
        res.writeHead(200, { 'content-type': 'image/svg+xml' })
        return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<!doctype html><title>source</title>
        <img src="/dot.svg" alt="">
        <img src="${origin(other)}/remote.png" alt="">
        <script src="${origin(other)}/widget.js"></script>
        <iframe src="${origin(other)}/frame"></iframe>
        <link rel="stylesheet" href="http://localhost:${other.address().port}/font.css">`)
    })
  })
  after(async () => {
    await browser?.close()
    source?.close()
    other?.close()
  })

  it('aborts every request to another origin, lists it, and lets the source origin and the font hosts through', async () => {
    const page = await browser.newPage()
    const blocked = new Set()
    // `localhost` stands in for a font host: the test cannot reach Google, and the rule is by host name
    await keepSourceOffline(page, origin(source), blocked, { fontHosts: ['localhost'] })
    const loaded = []
    page.on('requestfinished', (r) => loaded.push(new URL(r.url()).pathname))
    await page.goto(`${origin(source)}/index.html`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.close()
    assert.deepEqual(otherHits, ['/font.css'], 'only the font request reached the other server')
    assert.deepEqual([...blocked].sort(), [
      `${origin(other)}/frame`,
      `${origin(other)}/remote.png`,
      `${origin(other)}/widget.js`
    ])
    assert.ok(loaded.includes('/index.html') && loaded.includes('/dot.svg'), `loaded: ${loaded.join(', ')}`)
  })
})

it('visual-qa.mjs routes the source page offline before it opens it, and reports what it blocked', () => {
  const tool = readFileSync(path.join(HERE, '../tools/visual-qa.mjs'), 'utf8')
  const route = tool.indexOf('await keepSourceOffline(ref, sourceSite, blocked)')
  assert.ok(route > 0, 'the source page is routed')
  assert.ok(route < tool.indexOf('await ref.goto(sourceUrl'), 'before the first navigation')
  assert.match(tool, /axis\.sourceBlocked = \[\.\.\.blocked\]\.sort\(\)/)
  assert.match(tool, /## Source requests blocked \(the source is captured offline\)/)
  assert.match(tool, /sourceBlocked: summary\.sourceBlocked,\n\s*stages: summary\.stages/)
})
