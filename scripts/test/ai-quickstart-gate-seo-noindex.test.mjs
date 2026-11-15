// A system page that asks search engines not to index it (robots noindex: the kit marks the system pages so) is skipped
// by the search engine items: its title may be shared, and it needs no description or og:image. It still needs a title,
// a viewport, a language, a favicon, and an alt on every picture (an accessibility item too, review 5 Z3). A planned
// page that is no system page and carries noindex is itself a finding, and is held to every item. An invented bakery:
// two noindex system pages sharing a title, beside an indexed page with every item.
import assert from 'node:assert/strict'
import test from 'node:test'
import { seoOf } from '../ai-quickstart/gate/quality-seo.mjs'

const page = (path, head, body = '', pageType = /com_users/.test(path) ? 'system-login' : 'home') => ({
  path,
  pageType,
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
        '<img src="/b.png" alt="">'
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
  const r = seoOf(
    [
      {
        path: 'x',
        pageType: 'system-404',
        status: 200,
        html: `<html><head>${NOINDEX}</head><body></body></html>`
      }
    ],
    {
      origin: 'http://bakery.example'
    }
  )
  assert.deepEqual(
    r.missing.map((m) => m.item),
    ['title', 'viewport', 'html[lang]', 'favicon']
  )
})

test('Z3: a planned page with noindex is a finding and is held to every search engine item', () => {
  const r = seoOf(
    [
      page('index.php', { title: 'Bakery', extra: FULL }, '<img src="/a.png" alt="">'),
      page('index.php?Itemid=2', { title: 'Bakery', extra: NOINDEX }, '', 'about')
    ],
    { origin: 'http://bakery.example', favicons }
  )
  assert.deepEqual(r.missing.map((m) => [m.page, m.item]).sort(), [
    ['index.php', 'unique title'],
    ['index.php?Itemid=2', 'description'],
    ['index.php?Itemid=2', 'noindex'],
    ['index.php?Itemid=2', 'og:image'],
    ['index.php?Itemid=2', 'unique title']
  ])
  assert.equal(r.status, 'failed')
})

test('Z3: a noindex system page still needs an alt on every picture', () => {
  const r = seoOf(
    [
      page(
        'index.php?option=com_users&view=login',
        { title: 'Sign in', extra: NOINDEX },
        '<img src="/b.png">'
      )
    ],
    { origin: 'http://bakery.example', favicons }
  )
  assert.deepEqual(
    r.missing.map((m) => m.item),
    ['alt']
  )
})

test('a further page of a paged list shares its list title by design', () => {
  const r = seoOf(
    [
      page('index.php?Itemid=8', { title: 'News', extra: FULL }, '', 'news'),
      page('index.php?Itemid=8&start=3', { title: 'News', extra: FULL }, '', 'news:page-2'),
      page('index.php', { title: 'Bakery', extra: FULL }, '', 'home')
    ],
    { origin: 'http://bakery.example', favicons }
  )
  assert.deepEqual(r.missing, [])
})
