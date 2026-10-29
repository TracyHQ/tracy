// Seam 2 of spec TracyHQ/tracy#189 (ticket #192): the demo-leftover check reads the demo's offering cards (C03), people
// (C07), label words (C09), proof (C15) and facts (C17). It still reports the demo's values, reports none on the pages an
// honest build serves, and never reports an interface word every business uses. Templates and businesses are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'

const MINE = ['C03', 'C07', 'C09', 'C15', 'C17']
const page = (path, body) => ({ path, html: `<html><body>${body}</body></html>` })
const slot = (key, role, sample, type = 'text') => ({ key, entity: key.split('.')[0], type, role, sample })

/** A combat-sports demo: trainers, a priced plan, classes, a proof strip, a demo button and an interface button. */
const combat = {
  entities: [],
  pages: [],
  slots: [
    slot('module-1.0', 'person.name', 'Rowan Mercer'),
    slot('module-1.1', 'person.image', 'images/demo/team/rowan.jpg', 'image'),
    slot('module-2.0', 'package.price', '$141.00'),
    slot('module-2.1', 'package.name', 'Getfit casual'),
    slot('article-3.0', 'offering.name', 'Advanced Boxing'),
    slot('module-4.0', 'stat.proof_image', 'images/demo/others/avatar-1.png', 'image'),
    slot('module-4.1', 'stat.value', '100k'),
    slot('module-5.0', 'editorial.button_label', 'Try a boxing class'),
    slot('module-5.1', 'editorial.button_label', 'View more'),
    slot('module-5.2', 'editorial.menu_label', 'About us'),
    slot('module-6.0', 'contact.email', 'sale@getfit.example')
  ]
}
const club = {
  business: { name: 'Harbourline Racquet Club', phone: '+971 4 555 0199' },
  reading: { about: 'Tennis and padel coaching.', team: [{ id: 't1', label: 'Anouk' }] }
}

/** The pages the demo serves untouched. */
const demoPages = [
  page(
    '/',
    '<h4>Rowan Mercer</h4><img src="/images/demo/team/rowan.jpg"><img src="/images/demo/others/avatar-1.png"> Join over <span>100k</span>' +
      '<a class="btn" href="/classes">Try a boxing class</a><a href="/about">View more</a><a href="/about">About us</a>'
  ),
  page('/plans', '<h3>Getfit casual</h3><p>$141.00/class</p><p>Gift card $50.00</p>'),
  page('/classes', '<h3>Advanced Boxing</h3><p>Lorem ipsum dolor sit amet.</p>'),
  page('/contact', '<p>sale@getfit.example</p>')
]

/** The pages an honest build serves: real people, no price, interface labels kept, the demo's own words gone. */
const honestPages = [
  page(
    '/',
    '<h4>Anouk</h4><img src="/images/tracy-quickstart/a1.png">' +
      '<a class="btn" href="/contact">Contact</a><a href="/about">View more</a><a href="/about">About us</a>'
  ),
  page('/classes', '<h3>Tennis</h3><p>Tennis and padel coaching.</p>'),
  page('/contact', '<a href="tel:+97145550199">+971 4 555 0199</a>'),
  // A sample page of the template is the showcase's (C11), not an offering card.
  page('/pages/typography', '<p>Lorem ipsum dolor sit amet.</p>')
]

test('the demo pages still report every kind of ticket #192', () => {
  const { counts, findings } = checkDemoLeftovers({ pages: demoPages, contentMap: combat, brief: club })
  for (const kind of MINE) assert.ok(counts[kind] > 0, `${kind} is reported`)
  assert.ok(findings.some((f) => f.kind === 'C03' && f.place === 'lorem ipsum'))
  assert.ok(
    findings.some((f) => f.kind === 'C17' && f.place === 'price' && f.found === '$50.00'),
    'a price no slot holds'
  )
})

test('an honest build reports none of them', () => {
  const { counts } = checkDemoLeftovers({ pages: honestPages, contentMap: combat, brief: club })
  for (const kind of MINE) assert.equal(counts[kind], 0, kind)
})

test('an interface label is no leftover, a demo label is', () => {
  const { findings } = checkDemoLeftovers({ pages: demoPages, contentMap: combat, brief: club })
  const labels = findings.filter((f) => f.kind === 'C09').map((f) => f.place)
  assert.deepEqual(labels, ['module-5.0'])
})

test('a price the brief holds is the business’s own', () => {
  const brief = { ...club, content: { items: [{ name: 'Court hire', price: '$50.00' }] } }
  const { findings } = checkDemoLeftovers({
    pages: [page('/plans', '<p>Court hire $50.00</p>')],
    contentMap: combat,
    brief
  })
  assert.equal(findings.filter((f) => f.kind === 'C17').length, 0)
})

test('a dental clinic demo of another shape is judged by the same rules', () => {
  const dental = {
    entities: [],
    pages: [],
    slots: [
      slot('article-10.0', 'person.name', 'Dr. Lena Morrow'),
      slot('module-20.0', 'offering.price', 'from €200'),
      slot('module-21.0', 'contact.cta_label', 'Book your whitening'),
      slot('module-21.1', 'contact.cta_label', 'Book now')
    ]
  }
  const clinic = {
    business: { name: 'Brightwater Dental' },
    reading: { team: [{ id: 'p1', label: 'Dr. Mara Holt' }] }
  }
  const before = checkDemoLeftovers({
    pages: [page('/', '<h3>Dr. Lena Morrow</h3><p>from €200</p><a>Book your whitening</a><a>Book now</a>')],
    contentMap: dental,
    brief: clinic
  })
  assert.ok(before.counts.C07 > 0 && before.counts.C17 > 0)
  assert.deepEqual(
    before.findings.filter((f) => f.kind === 'C09').map((f) => f.place),
    ['module-21.0']
  )
  const after = checkDemoLeftovers({
    pages: [page('/', '<h3>Dr. Mara Holt</h3><a>Contact</a><a>Book now</a>')],
    contentMap: dental,
    brief: clinic
  })
  for (const kind of MINE) assert.equal(after.counts[kind], 0, kind)
})
