// The tool's own limits on what it reads (ticket #601): the page cap, the body cap, the base path, saved page folders
// with links in them, and the links handed to Part 1.
import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { MAX_BYTES, fetchLocal, localBaseOf, onBase } from '../built-site-check/local-fetch.mjs'
import { seamLinkOf } from '../built-site-check/part-one-links.mjs'
import { crawlSite, folderPages, pagePathOf } from '../built-site-check/site-pages.mjs'
import { folderOf } from './fixtures/built-site-check/florist.mjs'

/** A site whose home page links `count - 1` pages; the first of them links one page more when `deeper`. */
const siteOf =
  (count, deeper = false) =>
  async (url) => {
    const at = new URL(url).pathname
    const body =
      at === '/'
        ? Array.from({ length: count - 1 }, (_, i) => `<a href="/p${i}">P</a>`).join('')
        : at === '/p0' && deeper
          ? '<a href="/deeper">D</a>'
          : '<p>x</p>'
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
  }

test('a crawl whose last wave fills the cap exactly, with a page left, says capped; one that read all does not', async () => {
  const base = localBaseOf('http://florist.test/')
  const exact = await crawlSite(base, { fetchImpl: siteOf(10, true), max: 10 })
  assert.deepEqual([exact.pages.length, exact.capped], [10, true])
  const all = await crawlSite(base, { fetchImpl: siteOf(10), max: 10 })
  assert.deepEqual([all.pages.length, all.capped], [10, false])
})

test('a body over the cap is read as a stream and cut there, never read whole', async () => {
  let pulled = 0
  const chunk = new Uint8Array(1 << 20).fill(120)
  const body = new ReadableStream({
    pull(controller) {
      pulled++
      if (pulled > 40) controller.close()
      else controller.enqueue(chunk)
    }
  })
  const fetchImpl = async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
  const page = await fetchLocal(localBaseOf('http://florist.test/'), '/', { fetchImpl })
  assert.equal(page.html.length, MAX_BYTES)
  assert.equal(page.note, 'body_capped')
  assert.ok(pulled <= 8, `${pulled} chunks pulled`)
})

test('a base of /site/ takes /site and below, never /site-evil/', () => {
  const base = localBaseOf('http://florist.test/site/')
  for (const p of ['/site', '/site/', '/site/about']) assert.equal(onBase(new URL(p, base), base), true, p)
  for (const p of ['/site-evil/', '/sites', '/other']) assert.equal(onBase(new URL(p, base), base), false, p)
  assert.equal(pagePathOf('/site-evil/x', '/site/'), '/site-evil/x')
})

test('a saved pages folder never follows a link out or in a loop, and stops at the page cap', () => {
  const outside = folderOf({ 'secret.html': '<p>Outside</p>' })
  const dir = folderOf({ 'index.html': '<p>Hi</p>', 'a.html': '<p>A</p>', 'b.html': '<p>B</p>' })
  symlinkSync(outside, path.join(dir, 'out'))
  symlinkSync(dir, path.join(dir, 'again'))
  symlinkSync(path.join(outside, 'secret.html'), path.join(dir, 'secret.html'))
  const read = folderPages(dir)
  assert.deepEqual(
    read.pages.map((p) => p.path),
    ['/a', '/b', '/']
  )
  assert.deepEqual([read.capped, read.links], [false, 3])
  mkdirSync(path.join(dir, 'more'))
  writeFileSync(path.join(dir, 'more', 'c.html'), '<p>C</p>')
  const capped = folderPages(dir, { max: 3 })
  assert.deepEqual([capped.pages.length, capped.capped], [3, true])
})

test('a link handed to Part 1 keeps its query and anchor, and a file link is named asset', () => {
  const base = new URL('http://florist.test/')
  const page = { path: '/', abs: 'http://florist.test/' }
  const query = seamLinkOf('/index.php?option=com_content&view=article&id=3', page, base)
  assert.deepEqual(
    [query.kind, query.path, query.query],
    ['page', '/', 'option=com_content&view=article&id=3']
  )
  assert.deepEqual(
    ['/images/menu.pdf', '#top', 'mailto:hi@florist.example', 'https://elsewhere.example/'].map(
      (h) => seamLinkOf(h, page, base).kind
    ),
    ['asset', 'anchor', 'scheme', 'other_site']
  )
})
