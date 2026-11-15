// The link check of the release gate (tickets #585, #586): missing pages, dead anchors, links to demo pages. Pure given
// the pages; `probe` is called only when given. Invented site only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkCheck } from '../ai-quickstart/rendered-scan.mjs'

const base = 'http://site.invalid/'
const pages = () => [
  {
    path: '/',
    url: '/',
    status: 200,
    html: `<nav class="mainmenu"><a href="/lessons">Lessons</a><a href="/gone">Gone</a><a href="/demo-regatta">Old</a></nav>
      <a href="#prices">Prices</a><a href="#top">Up</a><a href="/lessons#times">Times</a><a href="/lessons#nowhere">X</a>
      <a href="mailto:hi@site.invalid">Mail</a><a href="https://other.invalid/x">Other</a><a href="/files/menu.pdf">PDF</a>
      <a href="/index.php?option=com_users&amp;view=login">Login</a>`
  },
  { path: '/lessons', url: '/lessons', status: 200, html: '<h2 id="times">Times</h2>' },
  { path: '/gone', url: '/gone', status: 404, html: '' }
]
const expected = { paths: ['/', '/lessons', '/gone'] }
const kinds = (found) => found.map((f) => [f.kind, f.page, f.href]).sort()

test('a link to a page that answers 404, a dead anchor, and links to pages the plan does not have', async () => {
  const found = await linkCheck({ pages: pages(), base, expected })
  assert.deepEqual(kinds(found), [
    ['anchor_missing', '/', '#prices'],
    ['anchor_missing', '/', '/lessons#nowhere'],
    ['demo_page', '/', '/demo-regatta'],
    ['demo_page', '/', '/index.php?option=com_users&view=login'],
    ['missing_page', '/', '/gone']
  ])
  const gone = found.find((f) => f.kind === 'missing_page')
  assert.deepEqual(gone.place, { element: 'a', menu: true })
  assert.deepEqual(found.find((f) => f.href === '#prices').place, { element: 'a', anchor: 'prices' })
})

test('near miss: anchors that land, planned pages, other sites and mail links give nothing', async () => {
  const quiet = [
    {
      path: '/',
      url: '/',
      status: 200,
      html: '<a href="#a">A</a><p id="a"></p><a href="/lessons">L</a><a href="mailto:x@y.invalid">M</a>'
    },
    { path: '/lessons', url: '/lessons', status: 200, html: '' }
  ]
  assert.deepEqual(await linkCheck({ pages: quiet, base, expected: { paths: ['/', '/lessons'] } }), [])
})

test('a demo route is demo_page; a page not read is asked of probe only when probe is given', async () => {
  const one = [
    { path: '/', url: '/', status: 200, html: '<a href="/demo-regatta">R</a><a href="/later">L</a>' }
  ]
  const plan = { paths: ['/', '/later'] }
  assert.deepEqual(
    kinds(await linkCheck({ pages: one, base, expected: plan, demoRoutes: ['demo-regatta'] })),
    [['demo_page', '/', '/demo-regatta']]
  )
  const asked = []
  const probe = async (url) => {
    asked.push(url)
    return { status: url.endsWith('/later') ? 404 : 200 }
  }
  assert.deepEqual(kinds(await linkCheck({ pages: one, base, expected: plan, probe })), [
    ['demo_page', '/', '/demo-regatta'],
    ['missing_page', '/', '/later']
  ])
  assert.ok(asked.includes('http://site.invalid/later'))
})

test('the links the built site check hands over are used as given', async () => {
  const links = [
    {
      page: '/',
      href: '/lessons',
      url: `${base}lessons`,
      path: '/lessons',
      query: '',
      hash: '',
      kind: 'page',
      menu: true
    },
    { page: '/', href: '#gone', url: null, path: '/', query: '', hash: 'gone', kind: 'anchor' },
    { page: '/', href: 'tel:123', url: null, path: null, query: '', hash: '', kind: 'scheme', scheme: 'tel' }
  ]
  const found = await linkCheck({ pages: pages(), base, expected: { paths: ['/'] }, links, probe: null })
  assert.deepEqual(kinds(found), [
    ['anchor_missing', '/', '#gone'],
    ['demo_page', '/', '/lessons']
  ])
})
