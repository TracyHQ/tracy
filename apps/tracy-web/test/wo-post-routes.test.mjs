/**
 * A template post's slug and route (`src/opportunities-build/post-routes.js`): a rewritten post takes a slug from its
 * new title (product owner, 26/10/2026), so the QA reads it where it answers now and the sweep moves links to it.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  blockUrlsOf,
  currentPostRoutes,
  movedHref,
  postMoves,
  slugOf,
  uniqueSlug
} from '../src/opportunities-build/post-routes.js'

test('slugOf: lowercase ASCII words joined by hyphens, the accents dropped; nothing to slug is null', () => {
  assert.equal(
    slugOf('The Chocolate Mocha & the coffee cave — downstairs'),
    'the-chocolate-mocha-and-the-coffee-cave-downstairs'
  )
  assert.equal(slugOf('Phở Đà Nẵng, mở cửa 9:00'), 'pho-da-nang-mo-cua-9-00')
  assert.equal(slugOf('Straße'), 'strasse')
  assert.equal(slugOf(' — '), null)
  assert.ok(slugOf('a'.repeat(200)).length <= 80)
  assert.equal(uniqueSlug('reservations', new Set(['reservations', 'reservations-2'])), 'reservations-3')
  assert.equal(uniqueSlug('hours', new Set(['reservations'])), 'hours')
})

test('postMoves: each template post route with the route it answers at now, on WordPress, Joomla and EmDash', () => {
  const all = () => true
  // WordPress: the live record's own route.
  const wp = postMoves(
    [
      {
        identity: { kind: 'post', id: 58 },
        routes: ['/burger/'],
        data: { post_title: 'Burger', post_name: 'burger' }
      }
    ],
    [{ identity: { kind: 'post', id: 58 }, routes: ['/reservations/'], data: { post_name: 'reservations' } }],
    'wordpress',
    all
  )
  assert.deepEqual(wp, [
    { was: '/burger/', route: '/reservations/', post: { kind: 'post', id: 58 }, title: 'Burger', tried: [] }
  ])
  // Joomla with no live route: the alias swapped into the `12-alias` segment.
  const joomla = postMoves(
    [
      {
        identity: { kind: 'article', id: 12 },
        routes: ['/index.php/blog/12-sample-12'],
        data: { title: 'Sample', alias: 'sample-12' }
      }
    ],
    [{ identity: { kind: 'article', id: 12 }, routes: [], data: { alias: 'our-story' } }],
    'joomla',
    all
  )
  assert.equal(joomla[0].route, '/index.php/blog/12-our-story')
  assert.deepEqual(joomla[0].tried, [
    'the live record carries no route',
    'the old route with the post\'s slug "our-story"'
  ])
  // EmDash: the route pattern with the slug filled, per locale.
  const emdash = postMoves(
    [
      {
        identity: { collection: 'posts', id: 'p1', slug: 'sample', locale: 'en' },
        routes: [{ pattern: '/posts/sample' }],
        titleField: 'title',
        data: { title: 'Sample' }
      }
    ],
    [
      {
        identity: { collection: 'posts', id: 'p1', slug: 'our-story', locale: 'en' },
        routes: [{ pattern: '/posts/our-story' }],
        data: {}
      }
    ],
    'emdash',
    all
  )
  assert.deepEqual(emdash[0].post, { collection: 'posts', id: 'p1', locale: 'en' })
  assert.equal(emdash[0].route, '/posts/our-story')
  // A post the live site no longer holds: no route, and why.
  const gone = postMoves(
    [
      {
        identity: { kind: 'post', id: 60 },
        routes: ['/gone/'],
        data: { post_title: 'Gone', post_name: 'gone' }
      }
    ],
    [],
    'wordpress',
    all
  )
  assert.deepEqual(gone[0], {
    was: '/gone/',
    route: null,
    post: { kind: 'post', id: 60 },
    title: 'Gone',
    tried: ['the live inventory has no record of this post']
  })
})

test("currentPostRoutes: the frozen routes keep their order, a moved post's in its place, a lost one named and not read", () => {
  const moves = [
    { was: '/burger/', route: '/reservations/', post: { kind: 'post', id: 58 }, title: 'Burger', tried: [] },
    {
      was: '/gone/',
      route: null,
      post: { kind: 'post', id: 60 },
      title: 'Gone',
      tried: ['the live inventory has no record of this post']
    }
  ]
  assert.deepEqual(currentPostRoutes(['/', '/burger/', '/menu/', '/gone/'], moves), {
    routes: ['/', '/reservations/', '/menu/'],
    postRoutes: [
      { was: '/burger/', route: '/reservations/', post: { kind: 'post', id: 58 }, title: 'Burger' },
      {
        was: '/gone/',
        route: null,
        post: { kind: 'post', id: 60 },
        title: 'Gone',
        tried: ['the live inventory has no record of this post']
      }
    ]
  })
})

test('movedHref keeps the form the link was written in; an address to another page or site is not moved', () => {
  const origin = 'https://site.invalid'
  assert.equal(
    movedHref('https://site.invalid/burger/', '/burger/', '/reservations/', origin),
    'https://site.invalid/reservations/'
  )
  assert.equal(movedHref('/burger#comments', '/burger/', '/reservations/', origin), '/reservations#comments')
  assert.equal(
    movedHref(
      '/index.php/blog/12-sample-12?x=1',
      '/index.php/blog/12-sample-12',
      '/index.php/blog/12-our-story',
      origin
    ),
    '/index.php/blog/12-our-story?x=1'
  )
  assert.equal(movedHref('/burger-king/', '/burger/', '/reservations/', origin), null)
  assert.equal(movedHref('https://other.invalid/burger/', '/burger/', '/reservations/', origin), null)
})

test("blockUrlsOf counts a block's url only when its own markup shows no anchor to it, a block inside it aside", () => {
  const page = [
    '<!-- wp:cover {"url":"/c.jpg"} --><div><!-- wp:button {"url":"/old/"} --><div><a href="/old/">Book</a></div><!-- /wp:button --></div><!-- /wp:cover -->',
    '<!-- wp:navigation-link {"label":"News","url":"/old/"} /-->'
  ].join('\n')
  assert.deepEqual(blockUrlsOf(page), ['/c.jpg', '/old/'])
})
