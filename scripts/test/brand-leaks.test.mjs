// scripts/brand-leaks.py against a site served here: a leak anywhere a visitor reads it is red, a
// page that does not answer 200 is red, a sitemap URL left uncrawled is red — "0 spots" must never
// mean "0 pages read" (the first version skipped failing pages and stopped at 400 URLs).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../brand-leaks.py', import.meta.url))
const SHIM = fileURLToPath(
  new URL('../../packages/cms/tracy-joomla-quickstart/scripts/brand-leaks.py', import.meta.url)
)

/** A tiny site: `pages` maps a path to its HTML (or a number, the status it answers). */
async function serve(pages) {
  const server = http.createServer((req, res) => {
    const body = pages[new URL(req.url, 'http://x').pathname]
    if (body === undefined || typeof body === 'number') {
      res.writeHead(typeof body === 'number' ? body : 404)
      res.end('no')
      return
    }
    res.writeHead(200, { 'content-type': req.url.endsWith('.xml') ? 'application/xml' : 'text/html' })
    res.end(body)
  })
  const origin = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${String(server.address().port)}`))
  )
  return { origin, close: () => new Promise((r) => server.close(r)) }
}

const page = (title, body, links = []) =>
  `<html><head><title>${title}</title></head><body><p>${body}</p>${links.map((l) => `<a href="${l}">x</a>`).join('')}</body></html>`
const sitemap = (origin, paths) =>
  `<?xml version="1.0"?><urlset>${paths.map((p) => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`

function crawl(args) {
  return new Promise((resolve) => {
    execFile('python3', args, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }))
  })
}

test('a clean site with its sitemap fully crawled is green', async () => {
  const pages = { '/': page('Granite Works', 'Hello', ['/about']), '/about': page('About', 'We build') }
  const site = await serve(pages)
  pages['/sitemap.xml'] = sitemap(site.origin, ['/', '/about'])
  try {
    const out = await crawl([SCRIPT, `${site.origin}/`, '--require-sitemap', 'Northgate'])
    assert.equal(out.code, 0, out.stdout)
    assert.match(out.stdout, /sitemap: 2\/2 crawled \(coverage 100%\)/)
    assert.match(out.stdout, /RESULT: GREEN/)
  } finally {
    await site.close()
  }
})

test('the demo brand in a title, a mailto link or the text is red, and each spot is named', async () => {
  const pages = {
    '/': page('Northgate Industrial', 'Hello', ['/contact']),
    '/contact':
      '<html><head><title>Contact</title></head><body><a href="mailto:sales@northgate-ind.ru">write</a></body></html>'
  }
  const site = await serve(pages)
  pages['/sitemap.xml'] = sitemap(site.origin, ['/', '/contact'])
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-leaks-'))
  const identity = path.join(dir, 'id.json')
  writeFileSync(identity, JSON.stringify({ words: ['Northgate', 'northgate-ind.ru'] }))
  try {
    const out = await crawl([SCRIPT, `${site.origin}/`, '--identity', identity])
    assert.equal(out.code, 1)
    assert.match(out.stdout, /<title>\s+\| Northgate Industrial/)
    assert.match(out.stdout, /link mailto:/)
    assert.match(out.stdout, /RESULT: RED/)
  } finally {
    await site.close()
  }
})

test('a page that does not answer 200 is red — a crawl that cannot read a page has not proved it clean', async () => {
  const pages = { '/': page('Home', 'Hello', ['/gone']), '/gone': 500 }
  const site = await serve(pages)
  pages['/sitemap.xml'] = sitemap(site.origin, ['/'])
  try {
    const out = await crawl([SCRIPT, `${site.origin}/`, 'Northgate'])
    assert.equal(out.code, 1)
    assert.match(out.stdout, /HTTP 500 \| \/gone/)
  } finally {
    await site.close()
  }
})

test('a sitemap URL left uncrawled is red: coverage below 100 %', async () => {
  const pages = { '/': page('Home', 'Hello'), '/a': page('A', 'a'), '/b': page('B', 'b') }
  const site = await serve(pages)
  pages['/sitemap.xml'] = sitemap(site.origin, ['/', '/a', '/b'])
  try {
    const out = await crawl([SCRIPT, `${site.origin}/`, '--max', '2', 'Northgate'])
    assert.equal(out.code, 1)
    assert.match(out.stdout, /coverage 67%/)
  } finally {
    await site.close()
  }
})

test('--require-sitemap turns a site with no sitemap red; the old Joomla path still runs the shared script', async () => {
  const site = await serve({ '/': page('Home', 'Hello') })
  try {
    const required = await crawl([SCRIPT, `${site.origin}/`, '--require-sitemap', 'Northgate'])
    assert.equal(required.code, 1)
    assert.match(required.stdout, /sitemap: none at \/sitemap.xml \(required\)/)
    const shim = await crawl([SHIM, `${site.origin}/`, 'Northgate'])
    assert.equal(shim.code, 0, shim.stdout + shim.stderr)
    assert.match(shim.stdout, /RESULT: GREEN · coverage n\/a/)
  } finally {
    await site.close()
  }
})

test('a Joomla identity file lends its plain replace phrases, never its markup', async () => {
  const pages = { '/': page('Home', 'Call Норткейт today') }
  const site = await serve(pages)
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-leaks-'))
  const identity = path.join(dir, 'j.json')
  writeFileSync(
    identity,
    JSON.stringify({
      replace: [
        { from: 'Норткейт', to: '{site.name}' },
        { from: 'aria-hidden="true">NG</span>', to: 'x' }
      ]
    })
  )
  try {
    const out = await crawl([SCRIPT, `${site.origin}/`, '--identity', identity])
    assert.equal(out.code, 1)
    assert.match(out.stdout, /Call Норткейт today/)
  } finally {
    await site.close()
  }
})

test('a link with raw non-ASCII or a space is fetched percent-encoded, not crashed on', async () => {
  const pages = { '/': page('Home', 'Hello', ['/vi/sector/sản xuất']) }
  pages[encodeURI('/vi/sector/sản xuất')] = page('Sector', 'ok')
  const site = await serve(pages)
  try {
    const out = await crawl([SCRIPT, `${site.origin}/`, 'Northgate'])
    assert.equal(out.code, 0, out.stdout + out.stderr)
    assert.match(out.stdout, /pages crawled: 2/)
  } finally {
    await site.close()
  }
})

test('a page named 404 that answers 404 is the template showing its not-found page, not a broken link', async () => {
  const pages = { '/': page('Home', 'Hello', ['/404', '/vi/404']) }
  const site = await serve(pages)
  try {
    const out = await crawl([SCRIPT, `${site.origin}/`, 'Northgate'])
    assert.equal(out.code, 0, out.stdout)
    assert.match(out.stdout, /not 200: 0/)
  } finally {
    await site.close()
  }
})
