// The structure measurement judges a link by the page it reaches (ticket #586, review 4 X1 to X3), on an invented
// Joomla-like site whose pages name their menu item and title: a link to one of the template's demo routes that still
// answers stays broken (X2); a planned article read at another menu address is that article, not a page the plan has
// not got (X1); a hidden page that still answers at a second address fails the link to it (X3), and the row names the
// page the link leads to and the half that was hidden.
import assert from 'node:assert/strict'
import test from 'node:test'
import { joomlaPageIdentity } from '../ai-quickstart/gate/adapters/joomla-page-identity.mjs'
import { hiddenVariant } from '../ai-quickstart/gate/structure-hidden.mjs'
import { linksOf } from '../ai-quickstart/gate/structure-read.mjs'

const base = 'http://shop.example/'
const page = (item, title, body = '') =>
  `<html><head><title>${title}</title></head><body class="item-${item}">${body}</body></html>`

test('X2: a link to a demo route that still answers stays broken', async () => {
  const pages = {
    [base + 'index.php']: page(101, 'Home', '<a href="/index.php/blog">Blog</a>'),
    [base + 'index.php/blog']: page(312, 'Blog of the demo')
  }
  const site = {
    fetch: async (u) => (pages[u] != null ? { status: 200, html: pages[u] } : { status: 404, html: '' })
  }
  const read = [
    {
      pageType: 'home',
      path: 'index.php',
      url: base + 'index.php',
      status: 200,
      expected: 200,
      html: pages[base + 'index.php']
    }
  ]
  const r = await linksOf(site, read, { base, demoRoutes: ['index.php/blog'], identify: joomlaPageIdentity })
  assert.deepEqual(
    r.broken.map((b) => [b.kind, b.href]),
    [['demo_page', '/index.php/blog']]
  )
  assert.deepEqual(r.unplanned, [])
})

test('X1: a planned article reached at another menu address is that article, not a page the plan has not got', async () => {
  const pages = {
    [base + 'index.php']: page(
      101,
      'Home',
      '<a href="/index.php/about/qxals">Read</a><a href="/index.php/other">Other</a>'
    ),
    [base + 'index.php?option=com_content&view=article&id=13&Itemid=249']: page(249, 'Qxals'),
    [base + 'index.php/about/qxals']: page(254, 'Qxals'),
    [base + 'index.php/other']: page(400, 'A page of nobody')
  }
  const site = {
    fetch: async (u) => (pages[u] != null ? { status: 200, html: pages[u] } : { status: 404, html: '' })
  }
  const read = ['index.php', 'index.php?option=com_content&view=article&id=13&Itemid=249'].map((p, i) => ({
    pageType: i ? 'article:post-1' : 'home',
    path: p,
    url: base + p,
    status: 200,
    expected: 200,
    html: pages[base + p]
  }))
  const r = await linksOf(site, read, { base, demoRoutes: [], identify: joomlaPageIdentity })
  assert.deepEqual(r.broken, [])
  assert.deepEqual(
    r.unplanned.map((u) => u.href),
    ['/index.php/other']
  )
  assert.deepEqual(
    r.elsewhere.map((u) => [u.href, u.target]),
    [['/index.php/about/qxals', 'article:post-1']]
  )
})

test('X3: a hidden page that still answers at a second address fails the link to it, naming the page', async () => {
  const hidden = new Set()
  const fetch = async (u) => {
    if (u === base + 'index.php')
      return {
        status: 200,
        html: page(101, 'Home', '<a href="/index.php/news">News</a><a href="/index.php/about">About</a>')
      }
    if (u === base + 'index.php?Itemid=245')
      return hidden.has('news') ? { status: 404, html: '' } : { status: 200, html: page(245, 'News') }
    if (u === base + 'index.php?Itemid=246')
      return hidden.has('about') ? { status: 404, html: '' } : { status: 200, html: page(246, 'About') }
    if (u === base + 'index.php/news') return { status: 200, html: page(245, 'News') }
    if (u === base + 'index.php/about')
      return hidden.has('about') ? { status: 404, html: '' } : { status: 200, html: page(246, 'About') }
    return { status: 404, html: '' }
  }
  const pages = [
    { pageType: 'home', path: 'index.php', url: base + 'index.php', expected: 200, record: null },
    {
      pageType: 'news',
      path: 'index.php?Itemid=245',
      url: base + 'index.php?Itemid=245',
      expected: 200,
      record: { id: 'news' }
    },
    {
      pageType: 'about',
      path: 'index.php?Itemid=246',
      url: base + 'index.php?Itemid=246',
      expected: 200,
      record: { id: 'about' }
    }
  ]
  const site = {
    fetch,
    hide: async (r) => void hidden.add(r.id),
    show: async (r) => void hidden.delete(r.id)
  }
  const v = await hiddenVariant(
    { state: { pages, record: {}, built: {} } },
    { site, base, demoRoutes: [], identify: joomlaPageIdentity }
  )
  assert.equal(v.status, 'failed')
  assert.deepEqual(v.broken.map((b) => [b.kind, b.href, b.target]).sort(), [
    ['hidden_page_still_answers', '/index.php/news', 'news'],
    ['missing_page', '/index.php/about', 'about']
  ])
  assert.ok(v.broken.every((b) => b.hidden.length))
  assert.ok((v.unplanned ?? []).every((u) => u.hidden?.length))
})
