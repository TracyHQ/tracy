// The SEO items of template quality (ticket #586, product decision 4: a missing item blocks): read from the renders the
// marker test already took, no second visit. Every page has a title no other page shares, a meta description, an
// og:image, a viewport meta, a language on html, alt on every picture, and a favicon that loads.
import assert from 'node:assert/strict'
import test from 'node:test'
import { faviconsOf, seoOf } from '../ai-quickstart/gate/quality-seo.mjs'

const ORIGIN = 'http://florist.example'
const head = ({ title = 'Petal', description = true, og = true, viewport = true, icon = '/icon.png' } = {}) =>
  (title == null ? '' : '<title>' + title + '</title>') +
  (description ? '<meta name="description" content="Fresh flowers">' : '') +
  (og ? '<meta property="og:image" content="' + ORIGIN + '/og.png">' : '') +
  (viewport ? '<meta name="viewport" content="width=device-width">' : '') +
  (icon ? '<link rel="icon" href="' + icon + '">' : '')
const page = (path, { lang = 'en', body = '<img src="/a.png" alt="A rose">', ...h } = {}) => ({
  path,
  pageType: path || 'home',
  status: 200,
  theme: 'light',
  width: 1440,
  html:
    '<html' +
    (lang ? ' lang="' + lang + '"' : '') +
    '><head>' +
    head(h) +
    '</head><body>' +
    body +
    '</body></html>'
})
const loads = new Map([[ORIGIN + '/icon.png', 200]])

test('a page with every item passes; the same page rendered at several widths counts once', () => {
  const renders = [page('/', { title: 'Home' }), page('/about', { title: 'About' })]
  const twice = [...renders, { ...renders[0], width: 390 }, { ...renders[1], theme: 'dark' }]
  const r = seoOf(twice, { origin: ORIGIN, favicons: loads })
  assert.equal(r.status, 'passed')
  assert.equal(r.pages, 2)
  assert.deepEqual(r.missing, [])
})

test('each missing item is named with its page, and blocks', () => {
  const cases = [
    [{ title: null }, 'title'],
    [{ description: false }, 'description'],
    [{ og: false }, 'og:image'],
    [{ viewport: false }, 'viewport'],
    [{ lang: '' }, 'html[lang]'],
    [{ body: '<img src="/b.png">' }, 'alt'],
    [{ icon: null }, 'favicon']
  ]
  for (const [options, item] of cases) {
    const r = seoOf([page('/', { title: 'Home' }), page('/x', { title: 'X', ...options })], {
      origin: ORIGIN,
      favicons: loads
    })
    assert.equal(r.status, 'failed', item)
    assert.deepEqual(
      r.missing.map((m) => [m.page, m.item]),
      [['/x', item]],
      item
    )
  }
})

test('two pages that share a title are both named; a favicon that does not load blocks', () => {
  const r = seoOf([page('/', { title: 'Petal' }), page('/x', { title: 'Petal' })], {
    origin: ORIGIN,
    favicons: new Map([[ORIGIN + '/icon.png', 404]])
  })
  assert.equal(r.status, 'failed')
  assert.deepEqual(r.missing.map((m) => m.item).sort(), [
    'favicon',
    'favicon',
    'unique title',
    'unique title'
  ])
})

test('the favicons to load are read from the renders, absolute; one never fetched leaves the measure incomplete', () => {
  const renders = [page('/', { title: 'Home' }), page('/x', { title: 'X', icon: 'images/i.ico' })]
  assert.deepEqual(faviconsOf(renders, ORIGIN), [ORIGIN + '/icon.png', ORIGIN + '/images/i.ico'])
  const r = seoOf(renders, { origin: ORIGIN, favicons: loads })
  assert.equal(r.status, 'incomplete')
  assert.deepEqual(r.unchecked, [ORIGIN + '/images/i.ico'])
  // No page with markup: nothing was measured.
  assert.equal(seoOf([{ path: '/', status: 500, html: null }], { origin: ORIGIN }).status, 'incomplete')
})
