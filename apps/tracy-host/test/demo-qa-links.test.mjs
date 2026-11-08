// Link status for the site check's page measures, on invented addresses and a fake `fetch`: only the site's own links are
// requested, a HEAD refused is asked again as a GET, a redirect inside the site is followed, and the run is bounded.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_LINKS_CHECKED, siteLinkTarget, withLinkStatus } from '../src/demo-qa-links.js'

const BASE = 'http://shop.test:8080/'
const entry = (path, width, hrefs) => ({
  path,
  width,
  links: hrefs.map((href) => ({ href, text: href.slice(-12) }))
})

/** A fake `fetch` answering by path, recording every call. */
function fake(answers) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers })
    const a = answers[new URL(url).pathname]
    if (a === 'throw') throw new Error('refused')
    const [status, headers = {}, onlyGet = false] = a ?? [404]
    const real = onlyGet && init.method === 'HEAD' ? 405 : status
    return { status: real, headers: new Headers(headers), body: { cancel: async () => {} } }
  }
  return { fetchImpl, calls }
}

test('a same-site link gets the status its address answers, a dead one 404, a refused HEAD is asked again as GET', async () => {
  const { fetchImpl, calls } = fake({
    '/menu': [200],
    '/gone': [404],
    '/picky': [200, {}, true]
  })
  const { measures, summary } = await withLinkStatus(
    [entry('/', 1440, [`${BASE}menu`, `${BASE}gone`, `${BASE}picky`])],
    { base: BASE, fetchImpl }
  )
  assert.deepEqual(
    measures[0].links.map((l) => [l.href.replace(BASE, ''), l.status]),
    [
      ['menu', 200],
      ['gone', 404],
      ['picky', 200]
    ]
  )
  assert.deepEqual(
    calls.filter((c) => c.url.endsWith('/picky')).map((c) => c.method),
    ['HEAD', 'GET']
  )
  assert.equal(summary.checked, 3)
})

test('a request that fails answers no status at all, which the judge reads as dead', async () => {
  const { fetchImpl } = fake({ '/down': 'throw' })
  const { measures } = await withLinkStatus([entry('/', 390, [`${BASE}down`])], { base: BASE, fetchImpl })
  assert.equal(measures[0].links[0].status, null)
})

test('an external link is never requested, and is left out of the answer', async () => {
  const { fetchImpl, calls } = fake({ '/menu': [200] })
  const { measures, summary } = await withLinkStatus(
    [
      entry('/', 1440, [
        'https://elsewhere.example/page',
        'http://metadata.internal.example/latest',
        `${BASE}menu`
      ])
    ],
    { base: BASE, fetchImpl }
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(
    measures[0].links.map((l) => l.href),
    [`${BASE}menu`]
  )
  assert.equal(summary.external, 2)
})

test('one address linked from several pages and both widths is asked once and answers each of them', async () => {
  const { fetchImpl, calls } = fake({ '/menu': [200] })
  const { measures } = await withLinkStatus(
    [
      entry('/', 1440, [`${BASE}menu`]),
      entry('/', 390, [`${BASE}menu`]),
      entry('/about', 1440, [`${BASE}menu`])
    ],
    { base: BASE, fetchImpl }
  )
  assert.equal(calls.filter((c) => c.method === 'HEAD').length, 1)
  assert.deepEqual(
    measures.map((m) => m.links[0].status),
    [200, 200, 200]
  )
})

test('a redirect inside the site is followed to its end; one that leaves the site stops as it is', async () => {
  const { fetchImpl } = fake({
    '/old': [301, { location: '/new' }],
    '/new': [404],
    '/away': [302, { location: 'https://elsewhere.example/' }]
  })
  const { measures } = await withLinkStatus([entry('/', 1440, [`${BASE}old`, `${BASE}away`])], {
    base: BASE,
    fetchImpl
  })
  assert.deepEqual(
    measures[0].links.map((l) => l.status),
    [404, 302]
  )
})

test('a site served from another address is asked there, under the name it gives itself', async () => {
  const { fetchImpl, calls } = fake({ '/menu': [200] })
  await withLinkStatus([entry('/', 1440, ['https://shop.example/menu'])], {
    base: 'https://shop.example/',
    serveFrom: 'http://web-1:8080/',
    fetchImpl
  })
  assert.equal(calls[0].url, 'http://web-1:8080/menu')
  assert.equal(calls[0].headers.host, 'shop.example')
})

test("a proxy answer that is not the site's own counts as no answer", async () => {
  const { fetchImpl } = fake({ '/menu': [200, { 'x-tracy-site-response': 'someone-else' }] })
  const { measures } = await withLinkStatus([entry('/', 1440, ['https://shop.example/menu'])], {
    base: 'https://shop.example/',
    serveFrom: 'http://proxy:8080/',
    serveFromIsProxy: true,
    proxySiteLabel: 'mine',
    fetchImpl
  })
  assert.equal(measures[0].links[0].status, null)
})

test('the count is bounded: addresses past the cap are left out and counted, never called dead', async () => {
  const { fetchImpl, calls } = fake({})
  const hrefs = Array.from({ length: MAX_LINKS_CHECKED + 5 }, (_, i) => `${BASE}p${i}`)
  const { measures, summary } = await withLinkStatus([entry('/', 1440, hrefs)], { base: BASE, fetchImpl })
  assert.equal(summary.overCap, 5)
  assert.equal(measures[0].links.length, MAX_LINKS_CHECKED)
  assert.ok(calls.length <= MAX_LINKS_CHECKED * 2)
})

test('the time is bounded: once the deadline has passed no further request starts', async () => {
  const { fetchImpl, calls } = fake({})
  const { measures, summary } = await withLinkStatus([entry('/', 1440, [`${BASE}a`, `${BASE}b`])], {
    base: BASE,
    fetchImpl,
    deadlineAt: 0
  })
  assert.equal(calls.length, 0)
  assert.equal(summary.outOfTime, 2)
  assert.deepEqual(measures[0].links, [])
})

test('only http and https addresses of the site resolve to a target', () => {
  const target = siteLinkTarget({ base: BASE })
  assert.ok(target(`${BASE}x?y=1`))
  assert.equal(target('ftp://shop.test/x'), null)
  assert.equal(target('not a url'), null)
})

// ── A first answer that never comes in time (alarm: a picture link "answers nothing" while it answers 200 afterwards) ──────────
import { createServer } from 'node:http'

/** A real local server; `slowFirst` paths stay silent past the timeout on their first request only, `dead` paths are 404. */
async function serve({ slowFirst = [], resetFirst = [], dead = [] }) {
  const seen = new Map()
  const server = createServer((req, res) => {
    const n = (seen.get(req.url) ?? 0) + 1
    seen.set(req.url, n)
    if (resetFirst.includes(req.url) && n === 1) return req.socket.destroy()
    if (slowFirst.includes(req.url) && n <= 2) return void setTimeout(() => res.end(), 400)
    res.statusCode = dead.includes(req.url) ? 404 : 200
    res.setHeader('content-type', 'image/jpeg')
    res.end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}/`
  return { base, seen, close: () => new Promise((r) => server.close(r)) }
}

test('a picture link whose first answer is too slow is asked once more, so a link that answers is not dead', async () => {
  const s = await serve({ slowFirst: ['/images/a1.jpg'] })
  try {
    const { measures } = await withLinkStatus(
      [entry('/a', 1440, [`${s.base}images/a1.jpg`]), entry('/b', 1440, [`${s.base}images/a1.jpg`])],
      { base: s.base, requestTimeoutMs: 150 }
    )
    assert.deepEqual(
      measures.map((m) => m.links[0].status),
      [200, 200]
    )
  } finally {
    await s.close()
  }
})

test('a connection reset on the first try is asked again', async () => {
  const s = await serve({ resetFirst: ['/images/b2.jpg'] })
  try {
    const { measures } = await withLinkStatus([entry('/a', 1440, [`${s.base}images/b2.jpg`])], {
      base: s.base,
      requestTimeoutMs: 150
    })
    assert.equal(measures[0].links[0].status, 200)
  } finally {
    await s.close()
  }
})

test('a picture link that is truly dead stays dead: a 404, and an address nobody answers', async () => {
  const s = await serve({ dead: ['/images/gone.jpg'] })
  const dark = await serve({})
  const darkBase = dark.base
  await dark.close()
  try {
    const { measures } = await withLinkStatus([entry('/a', 1440, [`${s.base}images/gone.jpg`])], {
      base: s.base,
      requestTimeoutMs: 150
    })
    assert.equal(measures[0].links[0].status, 404)
    const refused = await withLinkStatus([entry('/a', 1440, [`${darkBase}images/x.jpg`])], {
      base: darkBase,
      requestTimeoutMs: 150
    })
    assert.equal(refused.measures[0].links[0].status, null)
  } finally {
    await s.close()
  }
})

// The real default request, not a fake: a site proxy routes by the Host header, and Node's fetch drops that header, so every
// link of a site read through the proxy answered nothing (a local step chain run: 124 dead links, each a live page).
test('through the site proxy, the default request carries the virtual Host, so a live link is not dead', async () => {
  const { createServer } = await import('node:http')
  const proxy = createServer((req, res) => {
    const own = req.headers.host === 'padel-invented.tracy.test:51710'
    res.writeHead(own ? 200 : 404, own ? { 'x-tracy-site-response': 'padel-invented' } : {})
    res.end()
  })
  await new Promise((resolve) => proxy.listen(0, resolve))
  try {
    const via = `http://localhost:${proxy.address().port}/`
    const site = 'http://padel-invented.tracy.test:51710/'
    const { measures } = await withLinkStatus([entry('/', 1440, [`${site}index.php/about`])], {
      base: site,
      serveFrom: via,
      serveFromIsProxy: true,
      proxySiteLabel: 'padel-invented'
    })
    assert.deepEqual(
      measures[0].links.map((l) => l.status),
      [200]
    )
  } finally {
    proxy.close()
  }
})
