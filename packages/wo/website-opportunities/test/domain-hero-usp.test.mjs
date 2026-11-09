// What sets a business apart (its USP) counts only when the brief proves it (spec TracyHQ/tracy#189): specific,
// differentiating, and a fact of the brief or a theme two reviews state. Pure: no model, no site. Every business below
// is made up. The hero planner's own tests live with the hero planner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkUspTheme, findUsp, isSpecificClaim } from '../domain/hero-usp.mjs'

/** A made-up swim school: generic key message, but two reviews say the same coaches teach their children and them. */
function swimBrief() {
  return {
    business: {
      name: 'Tidewater Swim Club',
      trade: 'fitness',
      subTrade: { id: 'coaching' },
      phone: '+44 20 7946 0123',
      address: '4 Quay Lane - Port Marlow - Exampleland'
    },
    keyMessages: [{ id: 'k1', label: 'Premium European swim coaching', factRefs: ['f1'] }],
    facts: [
      { id: 'f1', field: 'story', value: { text: 'Premium European swim coaching' }, onSite: true },
      { id: 'f2', field: 'phone', value: '+44 20 7946 0123', onSite: true }
    ],
    reading: {
      services: [
        { label: 'Swimming Lessons', quote: 'swimming lessons' },
        { label: 'Water Polo', quote: 'water polo' },
        { label: 'Aqua Fitness', quote: 'aqua fitness' }
      ],
      audience: [{ label: 'all ages and levels', quote: 'For all ages and levels' }]
    },
    googlePlace: {
      reviews: [
        {
          rating: 5,
          text: 'Great coaches. My kids also swim with the same coaches as me, and they love it.'
        },
        {
          rating: 4,
          text: 'They coach my daughter, and my husband trains with them too. Patient with every level.'
        },
        { rating: 5, text: 'Friendly team, highly recommend.' }
      ]
    },
    sitemap: [],
    content: { items: [] }
  }
}

/** A made-up yoga studio: only generic praise, in its own words and in every review. */
function yogaBrief() {
  return {
    business: {
      name: 'Lumen Yoga Loft',
      trade: 'fitness',
      subTrade: { id: 'studio' },
      address: '9 Mill Yard - Port Marlow - Exampleland'
    },
    keyMessages: [{ id: 'k1', label: 'Quality yoga for everyone', factRefs: ['f1'] }],
    facts: [{ id: 'f1', field: 'story', value: { text: 'Quality yoga for everyone' }, onSite: true }],
    reading: { services: [{ label: 'Yoga Classes', quote: 'yoga classes' }] },
    googlePlace: {
      reviews: [
        { rating: 5, text: 'Friendly teachers and great classes.' },
        { rating: 5, text: 'Best studio in town, highly recommend!' },
        { rating: 3, text: 'Nice place, good vibe.' }
      ]
    },
    sitemap: [],
    content: { items: [] }
  }
}

test('generic words never make a USP; a concrete method, credential or promise does', () => {
  const others = ['coaching team', 'Port Marlow', 'swimming lessons']
  assert.equal(isSpecificClaim('European coaching in Port Marlow', { others }).specific, false)
  assert.equal(isSpecificClaim('For all ages & levels', { others }).specific, false)
  assert.equal(isSpecificClaim('Friendly, premium, the best quality', { others }).specific, false)
  assert.equal(isSpecificClaim('Former national champion, coaching since 2009', { others }).specific, true)
  assert.equal(isSpecificClaim('The same coaches teach the whole family', { others }).specific, true)
})

test('a review theme two reviews state is the USP, and a generic key message is refused', () => {
  const found = findUsp(swimBrief(), { places: ['Port Marlow'] })
  assert.equal(found.usp.id, 'whole-family')
  assert.deepEqual(
    found.usp.evidence.map((e) => e.review),
    [0, 1]
  )
  assert.match(found.usp.evidence[0].quote, /same coaches/)
  const msg = found.weighed.find((w) => w.kind === 'key-message')
  assert.equal(msg.pass, false)
})

test('only generic praise: no USP', () => {
  assert.equal(findUsp(yogaBrief(), { places: ['Port Marlow'] }).usp, null)
})

test("a model's review theme passes only with quotes found word for word in two reviews, or a fact", () => {
  const brief = swimBrief()
  const quoted = {
    label: 'The same coaches teach the whole family',
    quotes: [
      { review: 0, text: 'My kids also swim with the same coaches as me' },
      { review: 1, text: 'They coach my daughter, and my husband trains with them too.' }
    ]
  }
  assert.equal(checkUspTheme(quoted, brief).pass, true)
  const invented = {
    ...quoted,
    quotes: [{ review: 0, text: 'The same coaches teach us all' }, quoted.quotes[1]]
  }
  assert.equal(checkUspTheme(invented, brief).pass, false)
  const once = { ...quoted, quotes: [quoted.quotes[0]] }
  assert.equal(checkUspTheme(once, brief).pass, false)
  const generic = { label: 'Friendly and professional', quotes: quoted.quotes }
  assert.equal(checkUspTheme(generic, brief).pass, false)
})
