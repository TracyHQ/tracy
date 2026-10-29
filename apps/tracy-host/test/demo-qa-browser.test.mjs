/**
 * The browser half of the demo QA gate (`src/demo-qa-browser.js`) against a fixture site served here:
 * discovery from nav, footer and sitemap, pages that land on home, empty picture frames, placed
 * pictures in hidden blocks and a quoted Google review — read in a real browser, judged by the real judge.
 *
 * Needs a Chrome on CDP (`chrome-watch`, never `chromium.launch()`); skipped otherwise:
 *   DEMO_QA_CDP=http://127.0.0.1:9222 node --test apps/tracy-host/test/demo-qa-browser.test.mjs
 * The page is left open for a person to look at.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { after, test } from 'node:test'

import { readDemoPage } from '../src/demo-qa-browser.js'
import {
  baselineOf,
  checkContrastReadable,
  checkCssIntact,
  checkCtaReal,
  checkLookKept,
  checkNoEmptyBoxes,
  checkNoGoogleReviewQuoted,
  checkStructureKept,
  demoQaBody,
  runDemoQa
} from '../src/demo-qa.js'

const cdp = process.env.DEMO_QA_CDP
const opts = { skip: cdp ? false : 'set DEMO_QA_CDP (a chrome-watch CDP address)' }
// The CDP connection keeps the process alive and the watched pages must stay open: exit instead of closing.
if (cdp) after(() => setTimeout(() => process.exit(), 200))
const fixture = (name) => readFileSync(new URL(`./fixtures/demo-qa/${name}`, import.meta.url), 'utf8')

// 1×1 PNG: every picture of the fixture draws.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

// 8×8 PNG at 1% alpha: a decoration's pattern a visitor reads the words through.
const SEE_THROUGH = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQYlWNgYGBgJoBHggIAYugAwWYvKNsAAAAASUVORK5CYII=',
  'base64'
)

function site() {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const send = (type, body, status = 200) => {
      res.writeHead(status, { 'content-type': type })
      res.end(body)
    }
    if (path === '/see-through.png') return send('image/png', SEE_THROUGH)
    if (path.endsWith('.png')) return send('image/png', PNG)
    if (path === '/pricing/') {
      res.writeHead(301, { location: '/' })
      return res.end()
    }
    if (path === '/sitemap.xml') return send('application/xml', fixture('sitemap-index.xml'))
    if (path === '/sitemap-pages.xml') return send('application/xml', fixture('sitemap-pages.xml'))
    const pages = {
      '/': 'home.html',
      '/gallery': 'gallery.html',
      '/about': 'about.html',
      '/contact': 'contact.html',
      '/reviews': 'reviews.html',
      // The TripAdvisor case's page (#58adde5ec6 added the fixture and its test, not its route: the test read a 404).
      '/reviews-tripadvisor': 'reviews-tripadvisor.html',
      '/sections': 'sections.html',
      '/sections-after': 'sections-after.html'
    }
    if (pages[path]) return send('text/html; charset=utf-8', fixture(pages[path]))
    if (path === '/overlay') {
      // Two offer boxes as ja-diner draws them: an absolute decoration laid over static words.
      const box = (pattern, words) =>
        `<div class="box" style="position:relative;background:#222;color:#fff;padding:24px">` +
        `<div class="mark" style="position:absolute;inset:0;background:url(${pattern}) center/cover"></div>` +
        `<div class="inner"><p class="info">${words}</p></div></div>`
      return send(
        'text/html; charset=utf-8',
        '<!doctype html><title>Overlay</title><main>' +
          box('/see-through.png', 'Read through the pattern') +
          box('/solid.png', 'Hidden under the paint') +
          '</main>'
      )
    }
    if (path === '/stamp')
      // A masthead's stamp drawn by its ::after, as ja-diner's `.ja-masthead::after` draws it.
      return send(
        'text/html; charset=utf-8',
        '<!doctype html><title>Stamp</title><style>.masthead{position:relative;height:200px}' +
          ".masthead::after{content:'';position:absolute;right:0;top:0;width:120px;height:90px;" +
          'background:url(/decor_red.png) no-repeat}</style><main><div class="masthead"><h1>Offers</h1></div></main>'
      )
    if (path === '/cards')
      // Blog cards as ja-diner prints them: one picture in its post's anchor, one beside its title's only link,
      // and one in a box linking to two posts, which names neither.
      return send(
        'text/html; charset=utf-8',
        '<!doctype html><title>Cards</title><main>' +
          '<div class="card"><a href="/post-a/"><img src="/a.png" width="200" height="120" alt=""></a></div>' +
          '<div class="card"><div class="pic"><img src="/b.png" width="200" height="120" alt=""></div>' +
          '<h3><a href="/post-b/#top">Post B</a></h3></div>' +
          '<div class="pair"><img src="/c.png" width="200" height="120" alt="">' +
          '<a href="/post-c/">C</a><a href="/post-d/">D</a></div></main>'
      )
    if (path === '/classes')
      // Class cards and a coach card (#140): each picture's card is the box around it that holds no other picture.
      return send(
        'text/html; charset=utf-8',
        '<!doctype html><title>Classes</title><main><section><h2>Our classes</h2>' +
          '<div class="card"><div class="pic"><img src="/t.png" width="200" height="120" alt=""></div>' +
          '<h3>Tennis</h3><p>Courts for every level.</p></div>' +
          '<div class="card"><img src="/p.png" width="200" height="120" alt=""><p>Padel nights</p></div>' +
          '</section><div class="coach"><img src="/w.png" width="200" height="200" alt="">' +
          '<span class="coach-name">Wren Example</span></div></main>'
      )
    if (path === '/logo')
      // A theme's logo spot and its heading type: the wordmark takes the heading's font, the logo link's colour.
      return send(
        'text/html; charset=utf-8',
        '<!doctype html><title>Logo</title><header><a href="/" class="custom-logo-link" style="color:rgb(204, 51, 51)">' +
          '<img class="custom-logo" src="/logo.png" width="200" height="60" alt=""></a></header>' +
          '<main><h2 style="font-family:Georgia, serif;text-transform:uppercase">Our kitchen</h2></main>'
      )
    if (path === '/ctas')
      return send(
        'text/html; charset=utf-8',
        '<!doctype html><title>Ctas</title><nav><a href="/menu">Menu</a> <a href="/about">Book a table</a>' +
          '<ul><li><a href="">Reservation</a><ul><li><a href="/contact">Contact</a></li></ul></li></ul></nav><main>' +
          '<a href="https://www.facebook.com/place">Facebook</a> ' +
          '<a href="/how-to-order">Corn or flour: how to order a taco at the counter</a> ' +
          '<a class="wp-block-button__link wp-element-button" href="https://restaurant.example/menu">Explore dishes</a>' +
          ' <a href="https://live.example/book">Book a table</a> <a href="/about">Book a table</a>' +
          ' <a class="btn" href="tel:+842350000101">Call us</a>' +
          ' <a href="/contact">Book a table</a> <a href="https://live.example/about">Our story</a></main>'
      )
    return send('text/html', '<!doctype html><title>Not found</title><p>Not found</p>', 404)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

test(
  'a real read: nav + dropdown + footer + sitemap discovery, home-landing and 404 pages left out, empty frames, hidden placed pictures and a quoted review fail',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    const base = `http://127.0.0.1:${server.address().port}/`
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const result = await runDemoQa({
        asked: demoQaBody({
          label: 'fixture',
          platform: 'emdash',
          discover: true,
          placed: [
            'tracy-content/a.png',
            'tracy-content/b.png',
            'tracy-content/c.png',
            'tracy-content/d.png',
            'tracy-content/e.png'
          ],
          googleReviews: ['On the Thu Bồn River, between Old Town and the beach, with a wood-fired oven.']
        }),
        base,
        // One tab a read, as `makeDemoQa` opens them: pages after home are read a few at once.
        read: async (url, path, options) =>
          readDemoPage(await browser.contexts()[0].newPage(), url, path, options)
      })
      // `/gallery` is a nav link, `/about` only behind the "About ▾" button and in the footer, `/contact`
      // only in the sitemap; `/pricing/` (a drafted page) lands on home and `/gone` answers 404.
      assert.deepEqual(result.pages, ['/', '/gallery', '/about', '/contact'])
      const skipped = Object.fromEntries(
        result.visited.filter((v) => v.skipped).map((v) => [v.path, v.skipped])
      )
      assert.deepEqual(skipped, { '/pricing/': 'redirected home', '/gone': 'not found' })
      const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]))

      const empty = byId['no-empty-picture-slots']
      assert.equal(empty.pass, false)
      assert.deepEqual(empty.detail.map((d) => `${d.page} ${d.selector}`).sort(), [
        '/ div.zig > div.zig-visual',
        '/gallery figure.empty-figure',
        '/gallery figure.empty-quote-photo'
      ])

      const hidden = byId['placed-pictures-visible']
      assert.equal(hidden.pass, false)
      // b: closed <details>, c: [hidden]. a is shown; d is a carousel's next slide; e shows on phones only.
      assert.deepEqual(hidden.detail.map((d) => d.file).sort(), [
        'tracy-content/b.png',
        'tracy-content/c.png'
      ])

      const quoted = byId['no-google-review-quoted']
      assert.equal(quoted.pass, false)
      assert.deepEqual(
        quoted.detail.map((d) => [d.page, d.code]),
        [['/about', 'GOOGLE_REVIEW_QUOTED']]
      )
    } finally {
      server.close()
    }
  }
)

test(
  'served from the reachable address (the stand): a drafted page redirected inside `serveFrom` is still seen landing on home',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    const port = server.address().port
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const result = await runDemoQa({
        asked: demoQaBody({
          label: 'fixture',
          platform: 'wordpress',
          discover: true,
          host: 'published.test'
        }),
        base: `http://published.test:${port}/`,
        read: async (url, path, options) =>
          readDemoPage(await browser.contexts()[0].newPage(), url, path, {
            ...options,
            serveFrom: `http://127.0.0.1:${port}`
          })
      })
      const pricing = result.visited.find((v) => v.path === '/pricing/')
      assert.equal(pricing.skipped, 'redirected home')
      assert.equal(pricing.finalPath, '/')
      assert.ok(!result.pages.includes('/pricing/'))
    } finally {
      server.close()
    }
  }
)

test(
  'look-kept reads what paints besides stylesheets: <style> blocks and inline colours; the handed-over page holds to its own baseline',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    const port = server.address().port
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const home = await readDemoPage(page, `http://127.0.0.1:${port}/`, '/', { siteHosts: ['127.0.0.1'] })
      assert.equal(home.styles.length, 2, 'both <style> blocks of the fixture')
      assert.match(home.styles[0].text, /font-family:sans-serif/)
      assert.deepEqual(home.inline, [], 'display:none paints nothing')
      const baseline = baselineOf([home])
      assert.equal(checkLookKept([home], baseline).pass, true)
      // The agent's turn, served as a page: a colour written inline and a slot token set in a new <style> block.
      const painted = createServer((req, res) => {
        const path = new URL(req.url ?? '/', 'http://x').pathname
        if (path.endsWith('.png')) {
          res.writeHead(200, { 'content-type': 'image/png' })
          return res.end(PNG)
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          fixture('home.html')
            .replace('<h1', '<h1 style="color:#2a2319"')
            .replace('</head>', '<style id="wp-custom-css">:root{--ds-c-bg:#f7f4ef}</style></head>')
        )
      })
      await new Promise((resolve) => painted.listen(0, '127.0.0.1', resolve))
      try {
        const after = await readDemoPage(page, `http://127.0.0.1:${painted.address().port}/`, '/', {
          siteHosts: ['127.0.0.1']
        })
        const look = checkLookKept([after], baseline)
        assert.equal(look.pass, false)
        assert.ok(
          look.detail.some((d) => d.token === '--ds-c-bg' && d.style),
          JSON.stringify(look.detail)
        )
        assert.ok(
          look.detail.some((d) => d.selector && /h1/.test(d.selector) && d.style === 'color:#2a2319'),
          JSON.stringify(look.detail)
        )
      } finally {
        painted.close()
      }
    } finally {
      server.close()
    }
  }
)

test(
  'look-kept judges a token by what the browser computes on <html>: a sheet rewritten to read a slot with the old value as fallback is kept, a changed colour is not',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const serve = (css) =>
      createServer((req, res) => {
        const path = new URL(req.url ?? '/', 'http://x').pathname
        if (path === '/t.css') {
          res.writeHead(200, { 'content-type': 'text/css' })
          return res.end(css)
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          '<!doctype html><html><head><link rel="stylesheet" href="/t.css"></head><body><h1>Hi</h1><p>text</p></body></html>'
        )
      })
    const handed = serve(
      ':root{--ds-c-bg:#ffffff;--bg:#fff;--accent:#0071e3}body{background:var(--bg);color:var(--accent)}'
    )
    const reworded = serve(
      ':root{--ds-c-bg:#ffffff;--bg:var(--ds-c-bg, #fff);--accent:var(--ds-c-accent, #0071E3)}body{background:var(--bg);color:var(--accent)}'
    )
    const repainted = serve(
      ':root{--ds-c-bg:#ffffff;--bg:var(--paper, #f7f4ef);--accent:#0071e3}body{background:var(--bg);color:var(--accent)}'
    )
    for (const s of [handed, reworded, repainted])
      await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve))
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const read = (s) =>
        readDemoPage(page, `http://127.0.0.1:${s.address().port}/`, '/', { siteHosts: ['127.0.0.1'] })
      const home = await read(handed)
      assert.equal(home.computed['--bg'], '#fff', 'the browser computes the declared value')
      const baseline = baselineOf([home])
      assert.equal(baseline.look.computed['--accent'], '#0071e3')
      const kept = checkLookKept([await read(reworded)], baseline)
      assert.equal(kept.pass, true, `other text, same colours: ${JSON.stringify(kept.detail)}`)
      const changed = checkLookKept([await read(repainted)], baseline)
      assert.equal(changed.pass, false)
      assert.deepEqual(
        changed.detail.map((d) => [d.token, d.computedBefore, d.computedAfter]),
        [['--bg', '#fff', '#f7f4ef']]
      )
    } finally {
      for (const s of [handed, reworded, repainted]) s.close()
    }
  }
)

test(
  'a real read records the marked sections in order with their visible items; a hidden or thinned one fails structure-kept',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const origin = `http://127.0.0.1:${server.address().port}`
      const built = await readDemoPage(page, `${origin}/sections`, '/sections', {})
      assert.deepEqual(
        built.sections.map(({ name, items }) => [name, items]),
        [
          ['features-intro', 2],
          ['menu', 3],
          ['subscribe', 0]
        ]
      )
      const baseline = baselineOf([built])
      // The agent's turn, read as the same page: the subscribe section hidden, one dish item gone, the
      // specials' prices dropped (shorter text: a note, not a failure).
      const after = {
        ...(await readDemoPage(page, `${origin}/sections-after`, '/sections-after', {})),
        path: '/sections'
      }
      const check = checkStructureKept([after], baseline)
      assert.equal(check.pass, false)
      assert.deepEqual(check.detail[0].missing, ['subscribe'])
      assert.equal(check.detail[1].items, '2 of 3')
      assert.match(check.detail[2].note, /shorter text/)
    } finally {
      server.close()
    }
  }
)

test(
  'a real read preserves an attributed review; an absent source link is a note, an absent author fails',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const url = `http://127.0.0.1:${server.address().port}/reviews`
      const read = await readDemoPage(page, url, '/reviews', {})
      const review = {
        text: 'Wonderful dinner with fresh ingredients and lovely service every evening.',
        author: 'Lan N.',
        url: 'https://www.google.com/maps/reviews/123'
      }
      assert.ok(read.reviewLinks.includes(review.url))
      assert.equal(
        checkNoGoogleReviewQuoted([read], {
          googleReviews: [review.text],
          googleReviewTestimonials: [review]
        }).pass,
        true
      )
      const withoutLink = checkNoGoogleReviewQuoted([{ ...read, reviewLinks: [] }], {
        googleReviews: [review.text],
        googleReviewTestimonials: [review]
      })
      assert.equal(withoutLink.pass, true)
      assert.ok(withoutLink.detail.some((d) => d.canAdd?.includes('link')))
      assert.equal(
        checkNoGoogleReviewQuoted([{ ...read, text: read.text.replace('Lan N.', '') }], {
          googleReviewTestimonials: [review]
        }).pass,
        false
      )
    } finally {
      server.close()
    }
  }
)

test(
  'css-intact and look-kept: a stylesheet WordPress moved from <link> to an inline <style> with its sourceURL is still that stylesheet; a print-only block is not',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const NAV = 'wp-includes/blocks/navigation/style.min.css'
    const css = '.wp-block-navigation{display:flex}.wp-block-navigation a{color:#c00}'
    let shape = 'linked'
    const server = createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      if (path === `/${NAV}`) {
        res.writeHead(200, { 'content-type': 'text/css' })
        return res.end(css)
      }
      const inlined = (body, media = '') =>
        `<style id="wp-block-navigation-inline-css"${media}>${body}\n/*# sourceURL=http://127.0.0.1:${server.address().port}/${NAV}?ver=7.1 */</style>`
      const head = {
        linked: `<link rel="stylesheet" href="/${NAV}">`,
        inlined: inlined(css),
        cut: inlined('.wp-block-navigation{display:flex}'),
        print: inlined(css, ' media="print"')
      }[shape]
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><html><head><title>t</title>${head}</head><body><nav class="wp-block-navigation"><a href="/">Home</a></nav></body></html>`
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}/`
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const read = () => readDemoPage(page, url, '/', { siteHosts: ['127.0.0.1'] })
      const baseline = baselineOf([await read()])
      assert.equal(baseline.cssRules[NAV]?.rules, 2)
      shape = 'inlined'
      const inlined = await read()
      assert.equal(
        checkCssIntact([inlined], baseline).pass,
        true,
        JSON.stringify(checkCssIntact([inlined], baseline).detail)
      )
      assert.equal(inlined.styles.length, 0, 'the moved sheet is not also a new <style> block')
      assert.equal(
        checkLookKept([inlined], baseline).pass,
        true,
        JSON.stringify(checkLookKept([inlined], baseline).detail)
      )
      shape = 'cut'
      const cut = checkCssIntact([await read()], baseline)
      assert.equal(cut.pass, false)
      assert.ok(
        cut.detail.some((d) => d.file === NAV && d.after === 1),
        JSON.stringify(cut.detail)
      )
      shape = 'print'
      const print = checkCssIntact([await read()], baseline)
      assert.ok(
        print.detail.some((d) => d.file === NAV && d.problem === 'no longer loaded'),
        JSON.stringify(print.detail)
      )
    } finally {
      server.close()
    }
  }
)

test('serveFrom preserves public HTTPS proxy identity and refreshes it after each alias redirect', async () => {
  const seen = []
  const server = createServer((req, res) => {
    seen.push({
      path: req.url,
      host: req.headers.host,
      proto: req.headers['x-forwarded-proto'],
      forwardedHost: req.headers['x-forwarded-host'],
      port: req.headers['x-forwarded-port']
    })
    // A CMS behind HTTP redirects forever unless the proxy tells it the visitor is already on HTTPS.
    if (req.headers['x-forwarded-proto'] !== 'https') {
      res.writeHead(301, { location: `https://${req.headers.host}${req.url}` })
    } else if (req.url === '/start') {
      res.writeHead(302, { location: 'https://canonical.test/final?kept=1' })
    } else res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Native page</title>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let route, fulfilled, aborted
  const url = 'https://published.test:8443/start'
  const req = {
    url: () => url,
    headers: () => ({
      host: 'stale.test',
      'x-forwarded-host': 'stale.test',
      'x-forwarded-proto': 'http',
      'x-forwarded-port': '80'
    }),
    isNavigationRequest: () => true
  }
  const page = {
    on() {},
    off() {},
    route: async (_pattern, handler) => {
      route = handler
    },
    unroute: async () => {},
    setViewportSize: async () => {},
    url: () => url,
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => ({}),
    goto: async () => {
      await route({
        request: () => req,
        fetch: async (options) => {
          return new Promise((resolve, reject) => {
            const request = httpRequest(options.url, { headers: options.headers }, (response) => {
              response.resume()
              response.on('end', () =>
                resolve({ status: () => response.statusCode, headers: () => response.headers })
              )
            })
            request.on('error', reject)
            request.end()
          })
        },
        fulfill: async ({ response }) => {
          fulfilled = response
        },
        abort: async (reason) => {
          aborted = reason
        },
        continue: async () => {
          throw Error('Public alias must be served through reachable backend')
        }
      })
      if (aborted) throw Error(aborted)
      return fulfilled
    }
  }
  try {
    const read = await readDemoPage(page, url, '/start', {
      serveFrom: `http://127.0.0.1:${server.address().port}/`,
      siteHosts: ['canonical.test']
    })
    assert.equal(read.status, 200)
    assert.equal(read.error, null)
    assert.equal(read.finalUrl, 'https://canonical.test/final?kept=1')
    assert.deepEqual(seen, [
      {
        path: '/start',
        host: 'published.test:8443',
        proto: 'https',
        forwardedHost: 'published.test:8443',
        port: '8443'
      },
      {
        path: '/final?kept=1',
        host: 'canonical.test',
        proto: 'https',
        forwardedHost: 'canonical.test',
        port: '443'
      }
    ])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test(
  'a real read keeps TripAdvisor quotations with their author; provider and source links are notes',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const read = await readDemoPage(
        page,
        `http://127.0.0.1:${server.address().port}/reviews-tripadvisor`,
        '/reviews-tripadvisor',
        {}
      )
      const review = {
        text: 'Wonderful dinner with fresh ingredients and lovely service every evening.',
        author: 'Lan N.',
        provider: 'TripAdvisor',
        url: 'https://www.tripadvisor.com/ShowUserReviews-r123.html'
      }
      const asked = demoQaBody({ label: 'fixture', platform: 'emdash', googleReviewTestimonials: [review] })
      assert.ok(read.reviewLinks.includes(review.url))
      assert.equal(checkNoGoogleReviewQuoted([read], asked).pass, true)
      const withoutProvider = checkNoGoogleReviewQuoted(
        [{ ...read, text: read.text.replace('TripAdvisor', 'Google') }],
        asked
      )
      assert.equal(withoutProvider.pass, true)
      assert.ok(withoutProvider.detail.some((d) => d.canAdd?.includes('provider')))
      const withoutLink = checkNoGoogleReviewQuoted([{ ...read, reviewLinks: [] }], asked)
      assert.equal(withoutLink.pass, true)
      assert.ok(withoutLink.detail.some((d) => d.canAdd?.includes('link')))
      assert.equal(
        checkNoGoogleReviewQuoted([{ ...read, text: read.text.replace('Lan N.', '') }], asked).pass,
        false
      )
    } finally {
      server.close()
    }
  }
)

// Plan "10/10" P0-5 (26/10/2026): the picture under words is shot with the words hidden, at both widths, and the
// words are visible again afterwards.
test(
  'a real read measures what lies under words over a picture, and the judge fails white words on a bright one',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      await page.addInitScript(() => {
        const create = globalThis.createImageBitmap.bind(globalThis)
        globalThis.qaBitmaps = { created: 0, open: 0 }
        globalThis.createImageBitmap = async (...args) => {
          const bitmap = await create(...args)
          const close = bitmap.close.bind(bitmap)
          globalThis.qaBitmaps.created++
          globalThis.qaBitmaps.open++
          let closed = false
          bitmap.close = () => {
            if (!closed) globalThis.qaBitmaps.open--
            closed = true
            close()
          }
          return bitmap
        }
      })
      const read = await readDemoPage(
        page,
        `http://127.0.0.1:${server.address().port}/over-image`,
        '/over-image',
        {}
      )
      const over = read.contrast.filter((s) => s.overImage)
      assert.deepEqual(
        over.map((s) => s.text),
        ['Fresh cookies every morning', 'Baked by hand']
      )
      const [bright, dark] = over
      assert.ok(bright.under.p85 > 0.8 && bright.underPhone.p85 > 0.8, JSON.stringify(bright))
      assert.ok(dark.under.p85 < 0.02 && dark.underPhone.p85 < 0.02, JSON.stringify(dark))
      assert.equal(bright.large, true)
      const judged = checkContrastReadable([read])
      assert.deepEqual(
        judged.detail.map((d) => [d.text, d.viewport]),
        [
          ['Fresh cookies every morning', 'desktop'],
          ['Fresh cookies every morning', 'phone']
        ]
      )
      const left = await page.evaluate(() => ({
        hidden: document.querySelectorAll('[data-tracy-qa-hide]').length,
        tagged: document.querySelectorAll('[data-tracy-qa-over]').length,
        colour: getComputedStyle(document.querySelector('h1')).color
      }))
      assert.deepEqual(left, { hidden: 0, tagged: 0, colour: 'rgb(255, 255, 255)' })
      const bitmaps = await page.evaluate(() => globalThis.qaBitmaps)
      assert.ok(bitmaps.created > 0, 'the contrast read must decode real picture probes')
      assert.equal(bitmaps.open, 0, 'all decoded probes must be released before returning the read')
    } finally {
      server.close()
    }
  }
)

test('a real read distinguishes painted frames that reuse the same image at both widths', opts, async () => {
  const { chromium } = await import('playwright')
  const server = await site()
  const browser = await chromium.connectOverCDP(cdp)
  const context = await browser.newContext()
  try {
    const read = await readDemoPage(
      await context.newPage(),
      `http://127.0.0.1:${server.address().port}/shared-image-frames`,
      '/shared-image-frames',
      {}
    )
    const probes = read.contrast.filter((s) => s.overImage)
    assert.equal(probes.length, 3)
    assert.equal(new Set(probes.map((s) => s.underSrc)).size, 1)
    for (const key of ['underFrame', 'underPhoneFrame']) {
      assert.ok(probes[0][key])
      const byText = Object.fromEntries(probes.map((s) => [s.text, s[key]]))
      assert.equal(byText['One frame'], byText['Same frame'])
      assert.notEqual(byText['One frame'], byText['Another frame'])
    }
  } finally {
    await context.close()
    await browser.close()
    server.close()
  }
})

// Plan "10/10" §5 (David 26/10/2026): a box made for a service and shown empty is found by its class; a filled one
// and a decorative band are not.
test('a real read finds a service box shown empty, not a filled one or a decorative band', opts, async () => {
  const { chromium } = await import('playwright')
  const server = await site()
  try {
    const browser = await chromium.connectOverCDP(cdp)
    const page = await browser.contexts()[0].newPage()
    const read = await readDemoPage(page, `http://127.0.0.1:${server.address().port}/boxes`, '/boxes', {})
    assert.deepEqual(
      read.emptyBoxes.map((b) => b.selector),
      ['div.wp-block-group.acm-opentable > div.wp-block-group.ot-form', 'div > div.ot-form.collapsed']
    )
    assert.equal(checkNoEmptyBoxes([read]).pass, false)
  } finally {
    server.close()
  }
})

// Local round 35 (26/10/2026): a Joomla strip's carousel copies read as repeats; a selfie under a cover block's words
// was not seen as a background.
test('a real read marks a carousel copy and a picture that words lie on', opts, async () => {
  const { chromium } = await import('playwright')
  const server = await site()
  try {
    const browser = await chromium.connectOverCDP(cdp)
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } })
    const page = await context.newPage()
    const read = await readDemoPage(page, `http://127.0.0.1:${server.address().port}/strip`, '/strip', {})
    await context.close()
    assert.deepEqual(
      read.images.map((i) => [i.selector, Boolean(i.clone), Boolean(i.underWords)]),
      [
        ['div.owl-item > img', false, false],
        ['div.owl-item.cloned > img', true, false],
        ['div.wp-block-cover > img.wp-block-cover__image', false, true]
      ]
    )
    // the words name the picture they lie on (round 36: the template's own exemption ends on a placed photo)
    assert.match(read.contrast.find((c) => c.text === 'Our story')?.underSrc ?? '', /\/px\.png$/)
  } finally {
    server.close()
  }
})

// Plan "10/10" §7 S6 (26/10/2026): a page whose document did not change since the last check keeps its read.
test(
  'a real read of an unchanged page is reused by its fingerprint; a page that changes on each load is read again',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const ctx = browser.contexts()[0]
      const at = (p) => `http://127.0.0.1:${server.address().port}${p}`
      const first = await readDemoPage(await ctx.newPage(), at('/over-image'), '/over-image', {})
      assert.match(first.fingerprint, /^[0-9a-f]{64}$/)
      const again = await readDemoPage(await ctx.newPage(), at('/over-image'), '/over-image', {
        previous: { fingerprint: first.fingerprint, read: first }
      })
      assert.equal(again.reused, true)
      assert.deepEqual(again.contrast, first.contrast)
      const moving = await readDemoPage(await ctx.newPage(), at('/changing'), '/changing', {})
      const movedAgain = await readDemoPage(await ctx.newPage(), at('/changing'), '/changing', {
        previous: { fingerprint: moving.fingerprint, read: moving }
      })
      assert.equal(movedAgain.reused, undefined)
      assert.notEqual(movedAgain.fingerprint, moving.fingerprint)
    } finally {
      server.close()
    }
  }
)

// A demo keeps its visitor on the demo (product owner, 22/10/2026): a link naming the menu that leaves it is read as a call
// to action, the nav's own Menu entry is not.
test(
  'a real read marks buttons and nav links, and the judge fails an off-site button and booking off the Contact page',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const read = await readDemoPage(page, `http://127.0.0.1:${server.address().port}/ctas`, '/ctas', {})
      assert.deepEqual(
        read.ctas.map((c) => [c.text, c.booking, c.button, c.nav, c.opens ?? false]),
        [
          ['Menu', false, false, true, false],
          ['Book a table', true, false, true, false],
          // a nav item opening its own submenu goes there; "Facebook" is no booking (pilot 23/10/2026)
          ['Reservation', true, false, true, true],
          ['Contact', false, false, true, false],
          ['Explore dishes', false, true, false, false],
          ['Book a table', true, false, false, false],
          ['Book a table', true, false, false, false],
          ['Call us', false, true, false, false],
          ['Book a table', true, false, false, false]
        ]
      )
      assert.deepEqual(
        checkCtaReal([read]).detail.map((d) => d.href),
        ['https://restaurant.example/menu', 'https://live.example/book', '/about']
      )
      await page.close()
    } finally {
      server.close()
    }
  }
)

test('a see-through pattern laid over words covers nothing; a solid one still does', opts, async () => {
  const { chromium } = await import('playwright')
  const server = await site()
  const base = `http://127.0.0.1:${server.address().port}/`
  try {
    const browser = await chromium.connectOverCDP(cdp)
    const page = await browser.contexts()[0].newPage()
    const result = await runDemoQa({
      asked: demoQaBody({ label: 'fixture', platform: 'wordpress', pages: ['/overlay'] }),
      base,
      read: (url, path, options) => readDemoPage(page, url, path, options)
    })
    const overlap = result.checks.find((c) => c.id === 'no-text-overlap')
    assert.deepEqual(
      overlap.detail.map((d) => [d.text, d.coveredBy]),
      [['Hidden under the paint', 'div.box > div.mark']]
    )
  } finally {
    server.close()
  }
})

test(
  "a wordmark is the business's name drawn in the theme's heading type, the size of the template's logo",
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    const base = `http://127.0.0.1:${server.address().port}/`
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const result = await runDemoQa({
        asked: demoQaBody({
          label: 'fixture',
          platform: 'wordpress',
          pages: ['/logo'],
          wordmark: 'Ramen Bar'
        }),
        base,
        read: (url, path, options) => readDemoPage(page, url, path, options)
      })
      const mark = result.wordmark
      assert.ok(mark, 'a wordmark was drawn')
      assert.equal(mark.width / mark.height, 200 / 60)
      assert.match(mark.font, /Georgia/)
      assert.equal(mark.colour, 'rgb(204, 51, 51)')
      assert.equal(Buffer.from(mark.png, 'base64').subarray(1, 4).toString(), 'PNG')
      // Not asked, nothing drawn.
      const plain = await runDemoQa({
        asked: demoQaBody({ label: 'fixture', platform: 'wordpress', pages: ['/logo'] }),
        base,
        read: (url, path, options) => readDemoPage(page, url, path, options)
      })
      assert.equal(plain.wordmark, undefined)
      await page.close()
    } finally {
      server.close()
    }
  }
)

test(
  "a picture a pseudo-element draws is read with the page's other pictures, by its own size",
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const read = await readDemoPage(page, `http://127.0.0.1:${server.address().port}/stamp`, '/stamp', {})
      assert.deepEqual(
        read.images
          .filter((i) => i.src.endsWith('/decor_red.png'))
          .map((i) => [i.selector, i.width, i.height, i.kind]),
        [['main > div.masthead::after', 120, 90, 'background']]
      )
      await page.close()
    } finally {
      server.close()
    }
  }
)

test("a card's picture names the page it leads to: its anchor, or its box's only link", opts, async () => {
  const { chromium } = await import('playwright')
  const server = await site()
  try {
    const browser = await chromium.connectOverCDP(cdp)
    const page = await browser.contexts()[0].newPage()
    const at = `http://127.0.0.1:${server.address().port}`
    const read = await readDemoPage(page, `${at}/cards`, '/cards', {})
    assert.deepEqual(
      read.images.filter((i) => i.kind === 'img').map((i) => [i.src.split('/').at(-1), i.link ?? null]),
      [
        ['a.png', `${at}/post-a/`],
        ['b.png', `${at}/post-b/`],
        ['c.png', null]
      ]
    )
    await page.close()
  } finally {
    server.close()
  }
})

test("each picture carries its own card's words, never a neighbouring card's", opts, async () => {
  const { chromium } = await import('playwright')
  const server = await site()
  try {
    const browser = await chromium.connectOverCDP(cdp)
    const page = await browser.contexts()[0].newPage()
    const at = `http://127.0.0.1:${server.address().port}`
    const read = await readDemoPage(page, `${at}/classes`, '/classes', {})
    assert.deepEqual(
      read.images.filter((i) => i.kind === 'img').map((i) => [i.src.split('/').at(-1), i.card ?? null]),
      [
        ['t.png', 'Tennis'],
        ['p.png', 'Padel nights'],
        ['w.png', 'Wren Example']
      ]
    )
    await page.close()
  } finally {
    server.close()
  }
})
