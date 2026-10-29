// Ticket TracyHQ/tracy#196 (spec #189): the sharper rules of the leftover kinds outside the content map (C08, C10, C11, C12,
// C14, C16, C19). Each runs on a made-up kickboxing demo and on a made-up dental clinic demo; every name is fictional.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'
import { leftoverHeadBlock } from '../domain/outside-map.mjs'

const kickboxing = {
  entities: [
    { key: 'article-14', kind: 'article', identity: { alias: 'beginner-kickboxing' } },
    { key: 'menuItem-40', kind: 'menuItem', identity: { path: 'about-us/our-team' } }
  ],
  pages: [],
  slots: [
    {
      key: 'article-14.12',
      entity: 'article-14',
      type: 'text',
      role: 'business.video',
      sample: 'AbCdEfGhIjK'
    },
    {
      key: 'module-10.0',
      entity: 'module-10',
      type: 'image',
      role: 'business.hero_image',
      sample: 'images/demo/hero/ring.jpg'
    },
    {
      key: 'module-20.0',
      entity: 'module-20',
      type: 'url',
      role: 'editorial.navigation_url',
      sample: 'index.php?Itemid=193'
    }
  ]
}
const dental = {
  entities: [{ key: 'article-3', kind: 'article', identity: { alias: 'whitening-myths' } }],
  pages: [],
  slots: [
    {
      key: 'article-3.4',
      entity: 'article-3',
      type: 'image',
      role: 'editorial.illustration',
      sample: 'images/clinic/smile.jpg'
    }
  ]
}
const bakery = { business: { name: 'Copperleaf Bakery', address: '14 Mill Lane, Ashby Vale' } }

const page = (body, head = '') => `<html><head>${head}</head><body>${body}</body></html>`
const kinds = (report, kind) => report.findings.filter((f) => f.kind === kind)

test('C08: a demo video hidden by the head block is not shown; a video the content map misses is found', () => {
  const head = leftoverHeadBlock({ videos: ['AbCdEfGhIjK'] })
  const hidden = checkDemoLeftovers({
    pages: [
      {
        path: '/classes',
        html: page('<a class="video-btn" data-src="https://www.youtube.com/embed/AbCdEfGhIjK">play</a>', head)
      }
    ],
    contentMap: kickboxing,
    brief: bakery
  })
  assert.deepEqual(kinds(hidden, 'C08'), [])
  const unmapped = checkDemoLeftovers({
    pages: [{ path: '/', html: page('<iframe src="https://www.youtube.com/embed/QqQqQqQqQq1"></iframe>') }],
    contentMap: dental,
    brief: bakery
  })
  assert.deepEqual(
    kinds(unmapped, 'C08').map((f) => f.found),
    ['QqQqQqQqQq1']
  )
})

test('C10: a background the template stylesheet paints is found by its selector; the head block repainting it clears it', () => {
  const styles = [
    {
      href: '/media/t4/css/site.css',
      css: '.t4-content{background-image:url(/images/demo/others/bg-cta.jpg)}'
    }
  ]
  const before = checkDemoLeftovers({
    pages: [{ path: '/', html: page('<main></main>') }],
    contentMap: kickboxing,
    brief: bakery,
    styles
  })
  assert.deepEqual(
    kinds(before, 'C10').map((f) => [f.place, f.found]),
    [['.t4-content', 'images/demo/others/bg-cta.jpg']]
  )
  const head = leftoverHeadBlock({
    backgrounds: [{ selector: '.t4-content', file: 'images/demo/others/bg-cta.jpg' }],
    picture: 'images/tracy-content/aa.jpg'
  })
  const after = checkDemoLeftovers({
    pages: [{ path: '/', html: page('<main></main>', head) }],
    contentMap: kickboxing,
    brief: bakery,
    styles
  })
  assert.deepEqual(kinds(after, 'C10'), [])
  const clinic = checkDemoLeftovers({
    pages: [
      { path: '/', html: page('<header style="background-image:url(/images/clinic/band.webp)"></header>') }
    ],
    contentMap: dental,
    brief: bakery
  })
  assert.deepEqual(
    kinds(clinic, 'C10').map((f) => f.found),
    ['images/clinic/band.webp']
  )
})

test('C11: a sign-in view, a typography sample and a link to a showcase page are showcase leftovers', () => {
  const report = checkDemoLeftovers({
    pages: [
      { path: '/', html: page('<a href="/index.php/pages/typography">Typography</a>') },
      { path: '/members', html: '<html><body class="site com_users view-login"><form></form></body></html>' },
      { path: '/style', html: page('<p>h1. Heading 1</p><p>h2. Heading 2</p>') }
    ],
    contentMap: dental,
    brief: bakery
  })
  assert.deepEqual(
    kinds(report, 'C11').map((f) => [f.page, f.place]),
    [
      ['/', 'a[href="/index.php/pages/typography"]'],
      ['/members', '/members'],
      ['/style', '/style']
    ]
  )
})

test('C12: a demo alias in an address is found, a generic page word of the demo is not', () => {
  const report = checkDemoLeftovers({
    pages: [
      {
        path: '/',
        html: page('<a href="/classes/beginner-kickboxing">Padel</a><a href="/about-us/our-team">Team</a>')
      }
    ],
    contentMap: kickboxing,
    brief: bakery
  })
  assert.deepEqual(
    kinds(report, 'C12').map((f) => f.found),
    ['beginner-kickboxing']
  )
  const clinic = checkDemoLeftovers({
    pages: [{ path: '/blog/whitening-myths', html: page('') }],
    contentMap: dental,
    brief: bakery
  })
  assert.deepEqual(
    kinds(clinic, 'C12').map((f) => f.found),
    ['whitening-myths']
  )
})

test('C14: credit lines of the template framework are found too, on the not-found page as well', () => {
  const report = checkDemoLeftovers({
    pages: [
      { path: '/', html: page('<footer>Copyright Copperleaf Bakery. Powered by T3 Framework.</footer>') },
      { path: '/missing', status: 404, html: page('<p>Designed by JoomlArt.com</p>') }
    ],
    contentMap: dental,
    brief: bakery
  })
  assert.deepEqual(
    kinds(report, 'C14').map((f) => f.page),
    ['/', '/missing']
  )
})

test('C16: a demo picture on the not-found page counts unless the head block hides it', () => {
  const html = page('<img src="/images/clinic/smile.jpg">')
  assert.equal(
    kinds(
      checkDemoLeftovers({
        pages: [{ path: '/missing', status: 404, html }],
        contentMap: dental,
        brief: bakery
      }),
      'C16'
    ).length,
    1
  )
  const head = leftoverHeadBlock({ files: ['images/clinic/smile.jpg'] })
  const hidden = page('<img src="/images/clinic/smile.jpg">', head)
  assert.equal(
    kinds(
      checkDemoLeftovers({
        pages: [{ path: '/missing', status: 404, html: hidden }],
        contentMap: dental,
        brief: bakery
      }),
      'C16'
    ).length,
    0
  )
})

test('C19: a link to a menu entry the router could not route leads nowhere, unless the head block hides it', () => {
  const body = '<a class="btn" href="/index.php?Itemid=168">Book a visit</a>'
  const report = checkDemoLeftovers({
    pages: [{ path: '/', html: page(body) }],
    contentMap: dental,
    brief: bakery
  })
  assert.deepEqual(
    kinds(report, 'C19').map((f) => f.place),
    ['/index.php?Itemid=168']
  )
  const hidden = checkDemoLeftovers({
    pages: [{ path: '/', html: page(body, leftoverHeadBlock({ links: ['Itemid=168'] })) }],
    contentMap: dental,
    brief: bakery
  })
  assert.deepEqual(kinds(hidden, 'C19'), [])
})
