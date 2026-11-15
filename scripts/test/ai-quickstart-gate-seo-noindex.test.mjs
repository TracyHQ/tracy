// A page that asks search engines not to index it (robots noindex: the kit marks the system pages so) is skipped by
// the search engine items: its title may be shared, and it needs no description, og:image or alt. It still needs a
// title, a viewport, a language and a favicon. An invented bakery: two noindex system pages sharing a title, beside an
// indexed page with every item.
import assert from 'node:assert/strict'
import test from 'node:test'
import { seoOf } from '../ai-quickstart/gate/quality-seo.mjs'

const page = (path, head, body = '') => ({
  path,
  status: 200,
  html: `<html lang="en"><head><title>${head.title}</title><meta name="viewport" content="width=device-width">${head.extra ?? ''}<link rel="icon" href="/favicon.ico"></head><body>${body}</body></html>`
})
const FULL = '<meta name="description" content="Fresh bread"><meta property="og:image" content="/a.png">'
const NOINDEX = '<meta name="robots" content="noindex, follow">'
const favicons = new Map([['http://bakery.example/favicon.ico', 200]])

test('seo: noindex pages are skipped by the unique title and search engine items, and the record says so', () => {
  const r = seoOf(
    [
      page('index.php', { title: 'Bakery', extra: FULL }, '<img src="/a.png" alt="">'),
      page(
        'index.php?option=com_users&view=login',
        { title: 'Sign in', extra: NOINDEX },
        '<img src="/b.png">'
      ),
      page('index.php?option=com_users&view=reset', { title: 'Sign in', extra: NOINDEX })
    ],
    { origin: 'http://bakery.example', favicons }
  )
  assert.deepEqual(r.missing, [])
  assert.equal(r.status, 'passed')
  assert.deepEqual(r.noindex, [
    'index.php?option=com_users&view=login',
    'index.php?option=com_users&view=reset'
  ])
})

test('seo: a noindex page still needs its title, viewport and language', () => {
  const r = seoOf([{ path: 'x', status: 200, html: `<html><head>${NOINDEX}</head><body></body></html>` }], {
    origin: 'http://bakery.example'
  })
  assert.deepEqual(
    r.missing.map((m) => m.item),
    ['title', 'viewport', 'html[lang]', 'favicon']
  )
})
