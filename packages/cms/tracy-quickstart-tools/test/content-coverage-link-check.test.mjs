/**
 * The audit asks every link the pages render, as the browser follows it. A site served without URL rewriting answers
 * `/index.php/pages/contact` but not `/pages/contact`; the crawl folds the two into one page, so a home page button
 * written `/pages/contact` was a dead link the measure never asked.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

import { deadLinksOf, fetchStatus, renderedLinksOf } from '../content-coverage/lib/link-check.mjs'

test('a rendered link that does not answer 2xx is dead, named with the pages that show it', async () => {
  const server = createServer((req, res) => {
    const ok = new Set(['/', '/index.php/pages/contact', '/index.php/tours', '/images/map.pdf'])
    if (req.url === '/old-tours') {
      res.writeHead(301, { location: '/index.php/tours' })
      return res.end()
    }
    res.writeHead(ok.has(req.url) ? 200 : 404)
    res.end()
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const site = `http://127.0.0.1:${server.address().port}/`
  try {
    const link = (value) => ({ kind: 'link', source: 'a', value })
    const pages = [
      {
        url: `${site}index.php`,
        items: [
          link('/pages/contact'),
          link('/index.php/pages/contact#form'),
          link('/old-tours'),
          link('/images/map.pdf'),
          link('https://elsewhere.example/'),
          link('/index.php/pages/submit?task=article.add'),
          { kind: 'link', source: 'meta:og:url', value: '/nowhere' }
        ]
      },
      { url: `${site}index.php/tours`, items: [link('/pages/contact')] }
    ]
    const links = renderedLinksOf(pages, site)
    assert.deepEqual([...links.keys()].map((h) => new URL(h).pathname).sort(), [
      '/images/map.pdf',
      '/index.php/pages/contact',
      '/old-tours',
      '/pages/contact'
    ])
    const dead = await deadLinksOf(links, (h) => fetchStatus(h))
    assert.deepEqual(
      dead.map((d) => [new URL(d.url).pathname, d.status]),
      [['/pages/contact', 404]]
    )
    assert.match(dead[0].error, /^dead link \(404\) shown on 2 page\(s\): \/index\.php, \/index\.php\/tours$/)
  } finally {
    server.close()
  }
})
