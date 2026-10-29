// Ticket #193: the sharpened reads of C02 (demo post), C13 (demo logo) and C18 (demo social link or map). Fixture pages of two
// made-up businesses of different trades; the demo is a made-up template.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'

const contentMap = {
  entities: [{ key: 'article-5', kind: 'article', identity: { alias: 'ring-legends-remembered' } }],
  slots: [
    {
      key: 'article-5.0',
      entity: 'article-5',
      type: 'text',
      role: 'article.title',
      sample: 'Ring legends remembered'
    }
  ]
}
const bakery = {
  business: {
    name: 'Copperleaf Bakery',
    address: '14 Mill Lane',
    socials: { instagram: 'https://instagram.com/copperleaf.example' }
  }
}
const dental = { business: { name: 'Northgate Dental' } }
const run = (html, brief) => checkDemoLeftovers({ pages: [{ path: '/', html }], contentMap, brief })
const kinds = (r) => r.findings.map((f) => f.kind)

test('C02 reports a link to a demo post by its address though its words are gone', () => {
  const r = run('<a href="/blog/ring-legends-remembered">Our news</a>', bakery)
  assert.ok(kinds(r).includes('C02'))
})

test('C13 reports a demo logo picture the content map has no slot for, and not the business upload', () => {
  assert.deepEqual(kinds(run('<img src="/images/joomlart/logo/item-2.png" alt="x">', dental)), ['C13'])
  assert.deepEqual(kinds(run('<img class="navbar-logo" src="/images/brand-x.png">', dental)), ['C13'])
  assert.deepEqual(
    kinds(run('<img src="/images/tracy-brand/logo-light-ab12.png" alt="Northgate Dental">', dental)),
    []
  )
})

test('C18 reports a social icon drawn as a glyph that links nowhere or to a profile the brief does not hold', () => {
  const r = run(
    '<a href="#"><i class="fab fa-facebook"></i></a><a href="https://twitter.com/demo"><i class="fa-twitter"></i></a>',
    bakery
  )
  assert.equal(r.counts.C18, 2)
})

test('C18 passes the brief profile, ignores share buttons, and flags a map of somewhere else', () => {
  const clean =
    '<a href="https://instagram.com/copperleaf.example"><i class="fa-instagram"></i></a><a href="https://www.facebook.com/sharer/sharer.php?u=1"><i class="fa-facebook"></i></a>'
  assert.deepEqual(kinds(run(clean, bakery)), [])
  assert.deepEqual(
    kinds(run('<iframe src="https://www.google.com/maps/embed?pb=!1m18!demo"></iframe>', bakery)),
    ['C18']
  )
  assert.deepEqual(
    kinds(run('<iframe src="https://www.google.com/maps?q=14%20Mill%20Lane&output=embed"></iframe>', bakery)),
    []
  )
})

test('C18 accepts a map embedded by the brief Google place, and flags one of another place', () => {
  const brief = { business: { name: 'Northgate Dental' }, googlePlace: { placeId: 'ChIJexample123' } }
  assert.deepEqual(
    kinds(
      run(
        '<iframe src="https://www.google.com/maps?q=place_id%3AChIJexample123&output=embed"></iframe>',
        brief
      )
    ),
    []
  )
  assert.deepEqual(
    kinds(
      run('<iframe src="https://www.google.com/maps?q=place_id%3AChIJother999&output=embed"></iframe>', brief)
    ),
    ['C18']
  )
})
