// No sentence said twice on a page, reworded or not, nor on two pages of a built site (spec TracyHQ/tracy#189, round 9
// class F), judged on served pages. Fictional businesses of two trades.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRepeatedCopy, pageSentences } from '../src/opportunities-build/repeated-copy-check.js'
import { containedCopy } from '../../../packages/cms/tracy-seeder/src/distinct-copy.mjs'

const page = (path, body) => ({
  path,
  status: 200,
  html: `<html><body><header><p>Opening hours are on our contact page for every visitor.</p></header>${body}<footer><p>Every visitor is welcome at our door during opening hours.</p></footer></body></html>`
})

for (const [name, intro, reworded, framing] of [
  [
    'Cedar Bakery',
    'Cedar Bakery bakes sourdough, rye and seeded loaves in Lindenfield for every table in town.',
    'At Cedar Bakery we bake sourdough, rye and seeded loaves in Lindenfield every morning.',
    'Every loaf is shaped by hand and baked slowly in our stone oven.'
  ],
  [
    'Willow Dental',
    'Willow Dental offers gentle checkups, fillings and whitening in Harborview for the whole family.',
    'At Willow Dental we offer gentle checkups, fillings and whitening in Harborview every weekday.',
    'Every visit starts with a calm conversation about what you need today.'
  ]
]) {
  test(`${name}: a line reworded in a second section of one page is a repeat (a div lead line included)`, () => {
    const about = page(
      '/about',
      `<section id="Mod1"><div class="lead">${intro}</div></section><section id="Mod2"><p>${reworded}</p></section>`
    )
    const found = checkRepeatedCopy({ pages: [about], near: containedCopy })
    assert.equal(found.length, 1)
    assert.match(found[0].why, /reworded/)
    assert.equal(
      checkRepeatedCopy({ pages: [about] }).length,
      0,
      'without a near test only the same words count'
    )
  })

  test(`${name}: the same sentence written into two pages is a repeat; chrome and one shared block are not`, () => {
    const pages = [
      page('/', `<section id="Mod1"><p>${intro}</p></section>`),
      page(
        '/first',
        `<section id="Mod5"><p>${framing}</p></section><section id="Mod9"><p>Shared block shown on two pages only.</p></section>`
      ),
      page(
        '/second',
        `<section id="Mod6"><p>${framing}</p></section><section id="Mod9"><p>Shared block shown on two pages only.</p></section>`
      )
    ]
    const found = checkRepeatedCopy({ pages, near: containedCopy })
    assert.deepEqual(
      found.map((f) => f.paths),
      [['/first', '/second']]
    )
    assert.equal(found[0].severity, 'major')
  })
}

test('a label beside its button and a not-found page are not judged', () => {
  const pages = [
    page('/', '<div><a>Personal Training</a> <a>View details</a></div>'),
    page('/a', '<div><a>Personal Training</a> <a>View details</a></div>'),
    page('/b', '<p>Different words on this page about our lessons today.</p>'),
    { path: '/missing', status: 404, html: '<p>Different words on this page about our lessons today.</p>' }
  ]
  assert.deepEqual(checkRepeatedCopy({ pages }), [])
  assert.deepEqual(pageSentences('<p>Fresh bread daily.</p>'), [])
})
