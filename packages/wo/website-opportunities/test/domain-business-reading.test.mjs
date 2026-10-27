import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aboutLineOf,
  checkBusinessReading,
  readBusinessByRules,
  readingSourcesOf,
  withReadingPicks
} from '../domain/business-reading.mjs'

// A coaching business shaped like the one #1780 was measured on: a list-style bio, posts about sessions and lessons,
// reviews naming two coaches. Names and numbers are made up.
const RESEARCH = {
  bio: '🙋 Swiss Coaching in Lisbon📍\n🎾 Tennis & Padel \n🏊 Swimming Lessons\n📱 +351 900 000 000',
  posts: [
    {
      source: 'instagram',
      id: 'p1',
      url: 'https://www.instagram.com/p/p1/',
      caption: 'Join our padel sessions in Lisbon!\nFor all ages & levels\nDM us to book your spot!'
    },
    {
      source: 'instagram',
      id: 'p2',
      url: 'https://www.instagram.com/p/p2/',
      caption:
        'Join our customized fitness lessons and reach your goals!\nLocation: [Your Location]\nDM to book your first session!'
    },
    {
      source: 'instagram',
      id: 'p3',
      url: 'https://www.instagram.com/p/p3/',
      caption: 'Show up. Work hard. Believe in yourself.'
    }
  ],
  reviews: [
    { author: 'Reviewer A', text: 'Great padel coaching with Ana and Rui, my kids love tennis with them.' },
    { author: 'Reviewer A', text: 'Great padel coaching with Ana and Rui, my kids love tennis with them.' }
  ]
}

test('the texts read: template lines out, one copy of a review listed twice', () => {
  const sources = readingSourcesOf(RESEARCH)
  assert.deepEqual(
    sources.map((s) => s.ref),
    ['bio', 'post:instagram:p1', 'post:instagram:p2', 'post:instagram:p3', 'review:1']
  )
  assert.ok(sources.every((s) => !/\[Your Location\]/.test(s.text)))
})

test('an item survives only when its quote is in the source it names and its label in its quote', () => {
  const sources = readingSourcesOf(RESEARCH)
  const answer = {
    services: [
      { name: 'Padel sessions', quote: 'Join our padel sessions in Lisbon!', ref: 'post:instagram:p1' },
      { name: 'Personal fitness lessons', quote: 'customized fitness lessons', ref: 'post:instagram:p2' },
      { name: 'Swimming lessons', quote: 'Swimming Lessons', ref: 'bio' },
      // Invented: the quote is not in that post.
      { name: 'Yoga classes', quote: 'Join our yoga classes', ref: 'post:instagram:p1' },
      // A label word that is not in its quote.
      { name: 'Private tennis lessons', quote: 'Swimming Lessons', ref: 'bio' },
      // Template text never becomes a quote.
      { name: 'Location', quote: 'Location: [Your Location]', ref: 'post:instagram:p2' }
    ],
    audience: [{ label: 'all ages and levels', quote: 'For all ages & levels', ref: 'post:instagram:p1' }],
    team: [
      { name: 'Ana', role: 'coach', quote: 'padel coaching with Ana and Rui', ref: 'review:1' },
      { name: 'Marta', role: 'coach', quote: 'padel coaching with Ana and Rui', ref: 'review:1' }
    ],
    story: [{ text: 'Swiss coaching in Lisbon', quote: 'Swiss Coaching in Lisbon', ref: 'bio' }]
  }
  const read = checkBusinessReading(JSON.stringify(answer), sources)
  assert.deepEqual(
    read.services.map((s) => [s.label, s.kind, s.source.kind]),
    [
      ['Padel sessions', 'service', 'post'],
      ['Swimming lessons', 'service', 'bio'],
      // The bio lists "Tennis & Padel": the part no kept service names stays (F10).
      ['Tennis', 'service', 'bio']
    ]
  )
  assert.equal(
    read.dropped,
    5,
    'fitness lessons (personal is not quoted), yoga, private tennis, location, Marta'
  )
  assert.deepEqual(
    read.team.map((p) => [p.label, p.role, p.reviewsOnly]),
    [['Ana', 'coach', true]]
  )
  assert.equal(read.story[0].quote, 'Swiss Coaching in Lisbon')
  assert.equal(read.services[0].source.url, 'https://www.instagram.com/p/p1/')
  assert.equal(checkBusinessReading('not json', sources), null)
})

test('without a model the rules read the bio list and the posts: services, who it is for, story; no team', () => {
  const read = readBusinessByRules(readingSourcesOf(RESEARCH))
  assert.deepEqual(
    read.services.map((s) => s.label),
    ['Tennis & Padel', 'Swimming Lessons', 'Padel sessions', 'Customized fitness lessons']
  )
  assert.deepEqual(
    read.audience.map((a) => [a.label, a.quote]),
    [['all ages and levels', 'For all ages & levels']]
  )
  assert.deepEqual(
    read.story.map((s) => s.label),
    ['Swiss Coaching in Lisbon']
  )
  assert.deepEqual(read.team, [])
  assert.ok(!read.services.some((s) => /work hard/i.test(s.label)), 'a slogan is no service')
})

test('the About line uses only quoted words; removed items leave it; a review-only person is off the site', () => {
  const sources = readingSourcesOf(RESEARCH)
  const read = checkBusinessReading(
    {
      services: [
        { name: 'Tennis & Padel', quote: 'Tennis & Padel', ref: 'bio' },
        { name: 'Swimming lessons', quote: 'Swimming Lessons', ref: 'bio' }
      ],
      audience: [
        { label: 'kids', quote: 'my kids love tennis', ref: 'review:1' },
        { label: 'all ages and levels', quote: 'For all ages & levels', ref: 'post:instagram:p1' }
      ],
      team: [{ name: 'Rui', quote: 'Ana and Rui', ref: 'review:1' }],
      story: [{ text: 'Swiss coaching in Lisbon', quote: 'Swiss Coaching in Lisbon', ref: 'bio' }]
    },
    sources
  )
  assert.equal(
    aboutLineOf('Ace Coach', read),
    'Ace Coach offers Swiss coaching in Lisbon: Tennis & Padel and swimming lessons, for all ages and levels.'
  )
  const picked = withReadingPicks(read, { removed: [read.services[0].id], shown: [] })
  assert.deepEqual(
    picked.services.map((s) => s.label),
    ['Swimming lessons']
  )
  assert.equal(picked.team[0].onSite, false)
  assert.equal(withReadingPicks(read, { shown: [read.team[0].id] }).team[0].onSite, true)
  assert.equal(aboutLineOf('Ace Coach', { services: [], story: [], audience: [] }), null)
})
