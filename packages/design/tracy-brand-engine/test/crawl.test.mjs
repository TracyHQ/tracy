/**
 * Phase 1 of "Fork a site": one URL becomes a folder of static pages the rest of the pipeline reads
 * from. No network — `fetch` is injected with a small fake site, so the test pins the crawl's rules
 * (same host only, breadth first, bounded, HTML only, scripts defused) and the files it leaves.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { crawlSite } from '../src/host/crawl.mjs'

/** A fake site: `pages` maps a URL (after normalisation) to its body; anything else is a 404. */
function fakeFetch(pages, { types = {} } = {}) {
  const calls = []
  const fetch = async (url) => {
    calls.push(url)
    const body = pages[url]
    if (body === undefined) return new Response('not here', { status: 404 })
    const type = types[url] ?? (url.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8')
    return new Response(body, { status: 200, headers: { 'content-type': type } })
  }
  return { fetch, calls }
}

const SITE = {
  'https://acme.example/':
    '<!doctype html><html><head><title>Acme</title><link rel="stylesheet" href="/main.css"><script src="/x.js"></script></head>' +
    '<body><h1>Tools that outlive their owners.</h1><nav><a href="/tools/">Tools</a><a href="/about">About</a>' +
    '<a href="https://twitter.com/acme">Twitter</a><a href="/catalogue.pdf">Catalogue</a><a href="/">Home</a>' +
    '<a href="/tools/?sort=asc">Sorted</a><a href="/about#team">Team</a><a href="/wp-admin/">Admin</a></nav></body></html>',
  'https://acme.example/tools/':
    '<html><head><title>Tools</title></head><body><h1>Every tool</h1><a href="/tools/hammer">Hammer</a><a href="/">Home</a></body></html>',
  'https://acme.example/about':
    '<html><head><title>About</title></head><body><h1>Since 1950</h1><script>alert(1)</script></body></html>',
  'https://acme.example/tools/hammer':
    '<html><head><title>Hammer</title></head><body><h1>The hammer</h1></body></html>',
  'https://acme.example/main.css': 'body{color:#222}',
  'https://acme.example/catalogue.pdf': '%PDF-1.4',
  'https://acme.example/wp-admin/': '<html><body>login</body></html>'
}

test('crawlSite: breadth first over the same host, HTML only, scripts defused, one entry per page', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-crawl-'))
  try {
    const { fetch, calls } = fakeFetch(SITE, {
      types: { 'https://acme.example/catalogue.pdf': 'application/pdf' }
    })
    const result = await crawlSite('https://acme.example/', root, { fetch })

    assert.equal(result.pages.length, 4, 'home, tools, about, hammer — external, pdf, admin, loop skipped')
    assert.deepEqual(
      result.pages.map((p) => p.url),
      [
        'https://acme.example/',
        'https://acme.example/tools/',
        'https://acme.example/about',
        'https://acme.example/tools/hammer'
      ],
      'breadth first: depth 1 before depth 2'
    )
    assert.deepEqual(
      result.pages.map((p) => p.depth),
      [0, 1, 1, 2]
    )
    assert.equal(result.pages[0].title, 'Acme')
    assert.equal(result.pages[0].h1, 'Tools that outlive their owners.')
    assert.equal(result.pages[0].file, 'pages/01-home.html')
    assert.equal(result.pages[1].file, 'pages/02-tools.html')
    assert.equal(result.pages[3].file, 'pages/04-tools-hammer.html')

    assert.ok(!calls.includes('https://twitter.com/acme'), 'never leaves the host')
    assert.ok(!calls.includes('https://acme.example/wp-admin/'), 'admin doors are not pages')
    assert.equal(
      calls.filter((u) => u === 'https://acme.example/').length,
      1,
      'the loop back home fetched once'
    )
    assert.equal(
      calls.filter((u) => u === 'https://acme.example/tools/').length,
      1,
      '?sort=asc is the same page'
    )

    const about = readFileSync(path.join(root, 'pages', '03-about.html'), 'utf8')
    assert.ok(!/<script>alert/.test(about), 'scripts defused in the saved page')
    assert.ok(/od-defused-script/.test(about))
    assert.equal(
      readFileSync(path.join(root, 'pages', 'styles.css'), 'utf8'),
      'body{color:#222}',
      "the home page's stylesheets, concatenated"
    )
    const index = JSON.parse(readFileSync(path.join(root, 'pages', 'pages.json'), 'utf8'))
    assert.equal(index.schemaVersion, 'tracy-site-pages/v1')
    assert.equal(index.pages.length, 4)
    assert.equal(index.pages[2].status, 200)
    assert.ok(!existsSync(path.join(root, 'pages', 'catalogue.pdf')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('crawlSite: maxPages and maxDepth bound the walk; www and apex are one host', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-crawl-'))
  try {
    const pages = { 'https://www.acme.example/': '<html><head><title>Home</title></head><body>' }
    for (let i = 1; i <= 30; i += 1) {
      pages['https://www.acme.example/'] += `<a href="/p${i}">p${i}</a>`
      pages[`https://www.acme.example/p${i}`] =
        `<html><head><title>P${i}</title></head><body><a href="https://acme.example/deep${i}">d</a></body></html>`
      pages[`https://acme.example/deep${i}`] = `<html><head><title>D${i}</title></head><body></body></html>`
    }
    const { fetch } = fakeFetch(pages)
    const result = await crawlSite('https://www.acme.example/', root, { fetch, maxPages: 5, maxDepth: 1 })
    assert.equal(result.pages.length, 5, 'maxPages caps the walk')
    assert.ok(
      result.pages.every((p) => p.depth <= 1),
      'maxDepth respected'
    )
    assert.equal(result.truncated, true)

    const wide = await crawlSite('https://www.acme.example/', root, { fetch, maxPages: 40, maxDepth: 2 })
    assert.ok(
      wide.pages.some((p) => p.url === 'https://acme.example/deep1'),
      'apex and www are the same site'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
