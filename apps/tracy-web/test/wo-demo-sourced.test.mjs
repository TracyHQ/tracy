import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkResearchSourced } from '../src/opportunities-build/demo-sourced.js'

const inventory = (records) => ({ complete: true, records })
const record = (key, data) => ({ key, data })
const bundle = {
  profile: { name: 'QuillHaus', phone: '+971 4 555 0199', email: 'hello@quillhaus.example' },
  menu: [{ name: 'Hummus', price: 'AED 32' }],
  sources: [{ data: { text: 'Mezze platter 1,200 AED' } }]
}

test('a build that writes an email, phone or price the research never had fails, naming the field', () => {
  // QuillHaus / ja-fresco (24/10/2026): an invented reservation email and AED prices passed every check.
  const before = inventory([
    record('article/1', { introtext: '<p>Call +1 202 555 0100 or mail demo@fresco.example. Pasta $12</p>' })
  ])
  const after = inventory([
    record('article/1', {
      introtext:
        '<p>Book at <a href="mailto:reservations@quillhaus.example">us</a>, call <a href="tel:+97145550123">now</a>. Hummus AED 32, Falafel AED 28, Mezze 1.200 AED</p>'
    }),
    record('module/9', { content: 'Write to hello@quillhaus.example or +971 4 555 0199. Pasta $12' })
  ])
  const check = checkResearchSourced(before, after, bundle)
  assert.equal(check.id, 'research-sourced')
  assert.equal(check.pass, false)
  assert.deepEqual(
    check.detail.map((d) => [d.what, d.value, d.record, d.field]),
    [
      ['email', 'reservations@quillhaus.example', 'article/1', 'introtext'],
      ['phone', '+97145550123', 'article/1', 'introtext'],
      ['price', 'AED 28', 'article/1', 'introtext']
    ]
  )
})

test('a build that writes only what the research or the template had passes', () => {
  const before = inventory([record('a/1', { body: [{ _type: 'block', children: [{ text: 'Pasta $12' }] }] })])
  const after = inventory([
    record('a/1', {
      body: [{ _type: 'block', children: [{ text: 'Hummus AED 32 · hello@quillhaus.example' }] }]
    })
  ])
  assert.equal(checkResearchSourced(before, after, bundle).pass, true)
  assert.equal(checkResearchSourced({ complete: false }, after, bundle).skipped, true)
})

// Local round 23, 25/10/2026: an EmDash hero_image holding its media id read as a price of 4268 AED.
test('research-sourced: digits inside an id are no price; a price standing as a word still counts', () => {
  const inventory = (data) => ({ complete: true, records: [{ key: 'home/1@en', data }] })
  const before = inventory({ hero_image: '', text: '' })
  const id = checkResearchSourced(
    before,
    inventory({ hero_image: '01M5R3TSZGG4268aedQ86X8Y9E9Z', text: '' }),
    {}
  )
  assert.equal(id.pass, true, JSON.stringify(id.detail))
  const price = checkResearchSourced(before, inventory({ hero_image: '', text: 'Box of six: AED 120' }), {})
  assert.equal(price.pass, false)
})

// Tin Lantern Saigon (stand, 24/10/2026): the research keeps "110" with `priceScale: 1000`; the demo writes the amount.
test('a price the research printed in thousands is sourced when the build writes its full amount', () => {
  const research = { menu: { items: [{ name: 'Mojito', price: '110', currency: 'VND', priceScale: 1000 }] } }
  const before = inventory([record('a/1', { body: 'Cocktail 99 USD' })])
  const after = inventory([
    record('a/1', { body: 'Mojito 110.000 ₫ · Mojito 110,000 VND · Negroni 220.000 ₫' })
  ])
  const check = checkResearchSourced(before, after, research)
  assert.deepEqual(
    check.detail.map((d) => d.value),
    ['220.000 ₫']
  )
})
