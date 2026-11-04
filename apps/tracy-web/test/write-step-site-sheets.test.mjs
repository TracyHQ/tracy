// The stylesheets a template serves, read for the accent module (#378). Pages and sheets are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSiteSheets, sheetsOfPage } from '../src/write-step/site-sheets.js'

const PAGE = `<html><head>
<link rel="stylesheet" href="/media/merged-a.css?1">
<link rel="stylesheet" href="https://fonts.example.test/css?family=X">
<link rel="icon" href="/favicon.ico">
<style>.head{color:#111}</style></head><body>
<link rel="stylesheet" href="https://fonts.example.test/two"><style id="tracy-ds-slot">/* tracy-ds-slot: brand:x */ a{color:red}</style>
</body></html>`

test('a page gives its links and inline styles, the brand style left out', () => {
  const got = sheetsOfPage(PAGE)
  assert.deepEqual(got.inline, ['.head{color:#111}'])
  assert.equal(got.links.length, 3)
  assert.ok(!got.inline.join('').includes('brand:x'))
})

const site = (pages, sheets) => {
  const asked = []
  return {
    asked,
    text: async (url) => {
      asked.push(url.pathname + url.search)
      return pages[url.pathname] ?? sheets[url.pathname] ?? null
    }
  }
}

test('every listed page is read, each sheet once by its path, and only from the site itself', async () => {
  const s = site(
    {
      '/': PAGE,
      '/index.php/about':
        '<link rel="stylesheet" href="/media/merged-b.css?2"><link rel="stylesheet" href="/media/merged-a.css?9">',
      '/index.php/gone': null
    },
    { '/media/merged-a.css': 'a{}', '/media/merged-b.css': 'b{}' }
  )
  const got = await readSiteSheets({
    origin: 'http://inner.example.test:8080/',
    publicOrigin: 'https://site.example.test',
    platform: 'joomla',
    paths: ['/', '/about', '/gone'],
    text: s.text
  })
  assert.deepEqual(got, ['a{}', '.head{color:#111}', 'b{}'])
  assert.ok(!s.asked.some((a) => a.includes('family')))
})

test('a public address in a link is read at the address the site is read at', async () => {
  const seen = []
  await readSiteSheets({
    origin: 'http://inner.example.test:8080/',
    publicOrigin: 'https://site.example.test',
    paths: ['/'],
    text: async (url) => {
      seen.push(url.href)
      return url.pathname === '/' ? '<link rel="stylesheet" href="https://site.example.test/x.css">' : 'x{}'
    }
  })
  assert.ok(seen.includes('http://inner.example.test:8080/x.css'))
})

test('a site that answers nothing, or serves no sheet, is an error and not an empty answer', async () => {
  const none = { origin: 'http://inner.example.test/', paths: ['/'] }
  await assert.rejects(readSiteSheets({ ...none, text: async () => null }), /no page/)
  await assert.rejects(readSiteSheets({ ...none, text: async () => '<p>hello</p>' }), /no stylesheet/)
})
