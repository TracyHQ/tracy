// Explicit own-post offers survive a model omission before any CMS consumes the brief.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBrief } from '../domain/brief.mjs'
import { checkBusinessReading, readBusinessByRules, readingSourcesOf } from '../domain/business-reading.mjs'
import { readBusiness } from '../src/business-reading.js'

const post = (caption, id = 'offer') => ({
  source: 'instagram',
  id,
  url: `https://www.instagram.com/p/${id}/`,
  caption
})
const cases = [
  {
    trade: 'food',
    name: 'Willow Bakery',
    bio: 'Bread and cakes',
    caption: 'Join our weekend baking classes and learn at your pace! DM to book your place.',
    label: 'Weekend baking classes'
  },
  {
    trade: 'retail',
    name: 'Meadow Optical',
    bio: 'Eye examinations and frames',
    caption: 'We now offer handmade glasses cases. Message us to buy yours.',
    label: 'Handmade glasses cases'
  }
]

for (const c of cases) {
  test(`${c.trade}: an own-post offer omitted by the model becomes a sourced on-site offering`, () => {
    const input = { bio: c.bio, posts: [post(c.caption)] }
    const reading = checkBusinessReading({ services: [] }, readingSourcesOf(input))
    assert.deepEqual(
      reading.services.map((s) => s.label),
      [c.label]
    )
    const offer = reading.services[0]
    assert.equal(offer.source.url, input.posts[0].url)
    assert.ok(c.caption.includes(offer.quote))
    const brief = buildBrief({
      opportunity: { id: 'fictional-offer', name: c.name, candidate: { trade: c.trade } },
      profile: { name: c.name, bio: c.bio, businessReading: { ...reading, method: 'model' } },
      posts: input.posts,
      madeAt: '2026-10-29T10:00:00Z'
    })
    const fact = brief.facts.find((f) => ['menu', 'services'].includes(f.field) && f.value.name === c.label)
    assert.ok(fact, 'the offering reaches the public facts boundary')
    assert.equal(fact.onSite, true)
    assert.equal(fact.evidence[0].ref, input.posts[0].url)
    assert.equal(fact.evidence[0].quote, offer.quote)
  })
}

test('an explicitly sold service does not need a second mention even when the model calls it repeated', () => {
  const c = cases[0]
  const sources = readingSourcesOf({ posts: [post(c.caption)] })
  const reading = checkBusinessReading(
    {
      services: [
        {
          name: c.label,
          quote: 'weekend baking classes',
          ref: sources[0].ref,
          basis: 'repeated'
        }
      ]
    },
    sources
  )
  assert.deepEqual(
    reading.services.map((s) => s.label),
    [c.label]
  )
  assert.equal(reading.services[0].basis, undefined)
  assert.equal(reading.dropped, 0)
})

test('hashtags, one-off events, partner products and negated offers never become offerings', () => {
  for (const caption of [
    '#BakingClasses #HandmadeCases',
    '#BakingClasses DM to book.',
    'Join our one-off baking workshop this Saturday. DM to book.',
    "We offer our partner's handmade glasses cases. Message us to buy.",
    'We do not offer baking classes. DM to book bread orders.'
  ]) {
    const sources = readingSourcesOf({ posts: [post(caption)] })
    assert.deepEqual(checkBusinessReading({ services: [] }, sources).services, [], caption)
    assert.deepEqual(readBusinessByRules(sources).services, [], caption)
  }
})

test('the no-model reading keeps an explicit product offer too', () => {
  const c = cases[1]
  assert.deepEqual(
    readBusinessByRules(readingSourcesOf({ posts: [post(c.caption)] })).services.map((s) => s.label),
    [c.label]
  )
})

test('a model cannot turn hashtag-only evidence into a service', () => {
  const sources = readingSourcesOf({ posts: [post('#Yoga DM to book.')] })
  const checked = checkBusinessReading(
    { services: [{ name: 'Yoga', quote: 'Yoga', ref: sources[0].ref }] },
    sources
  )
  assert.deepEqual(checked.services, [])
  assert.equal(checked.dropped, 1)
})

test('recurring own offers keep ordinary prose evidence beside hashtags, without duplicating a bio offering', () => {
  const sources = readingSourcesOf({
    bio: 'Baking classes',
    posts: [post('Join our weekend baking classes every weekend. DM to book. #BakingClasses')]
  })
  const found = checkBusinessReading({ services: [] }, sources)
  assert.deepEqual(
    found.services.map((s) => s.label),
    ['Weekend baking classes']
  )
  const listed = checkBusinessReading(
    { services: [{ name: 'Baking classes', quote: 'Baking classes', ref: 'bio' }] },
    sources
  )
  assert.deepEqual(
    listed.services.map((s) => s.label),
    ['Baking classes']
  )
})

test('the model cannot promote a one-off event or a partner product to an offering either', () => {
  for (const [caption, label] of [
    ['Join our baking workshop on November 3. DM to book.', 'baking workshop'],
    ["We offer our partner's handmade glasses cases. Message us to buy.", 'handmade glasses cases']
  ]) {
    const sources = readingSourcesOf({ posts: [post(caption)] })
    const checked = checkBusinessReading(
      { services: [{ name: label, quote: label, ref: sources[0].ref }] },
      sources
    )
    assert.deepEqual(checked.services, [])
  }
})

test('a cached model omission is repaired without paying for another model call', async () => {
  const c = cases[0]
  let calls = 0
  const input = {
    bio: c.bio,
    posts: [post(c.caption)],
    door: {
      state: 'ready',
      door: { url: 'https://model.test/chat', key: 'fictional-key', model: 'fictional-model' }
    },
    charge: (_spec, call) => call(),
    fetchImpl: async () => {
      calls++
      return Response.json({ choices: [{ message: { content: '{"services":[]}' } }] })
    }
  }
  const first = await readBusiness(input)
  const repaired = await readBusiness({ ...input, held: { ...first, services: [] } })
  assert.deepEqual(
    repaired.services.map((s) => s.label),
    [c.label]
  )
  assert.equal(calls, 1)
})

test('a product and a class teaching how to make it are distinct offerings', () => {
  const sources = readingSourcesOf({
    bio: 'Wedding cakes',
    posts: [post('Join our wedding cake decorating classes. DM to book.')]
  })
  const reading = checkBusinessReading(
    { services: [{ name: 'Wedding cakes', quote: 'Wedding cakes', ref: 'bio' }] },
    sources
  )
  assert.deepEqual(
    reading.services.map((s) => s.label),
    ['Wedding cakes', 'Wedding cake decorating classes']
  )
})

test('an unrelated partner mention does not invalidate an own offering in the same post', () => {
  const sources = readingSourcesOf({
    posts: [post('Join our weekly baking classes. Meet our partner farmers. DM to book your class.')]
  })
  const reading = checkBusinessReading(
    { services: [{ name: 'Weekly baking classes', quote: 'weekly baking classes', ref: sources[0].ref }] },
    sources
  )
  assert.deepEqual(
    reading.services.map((s) => s.label),
    ['Weekly baking classes']
  )
})

test('an invitation to a gala and an abstract promise are not permanent offerings', () => {
  for (const caption of [
    'Join our charity gala. DM to book tickets.',
    'We offer unforgettable moments. Book your next holiday today.'
  ]) {
    assert.deepEqual(
      checkBusinessReading({ services: [] }, readingSourcesOf({ posts: [post(caption)] })).services,
      []
    )
  }
})
