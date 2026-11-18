import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { websiteReadingSources } from '../domain/website-reading-sources.mjs'

test('owner pages and reviews survive a large post feed; quotes retain the actual page URL', () => {
  const sources = readingSourcesOf({
    posts: Array.from({ length: 60 }, (_, id) => ({ id, caption: `An own post ${id}` })),
    reviews: Array.from({ length: 60 }, (_, id) => ({ author: `Guest ${id}`, text: `Review ${id}` })),
    websitePages: [
      { url: 'https://gym.example/classes', text: 'Boxing classes for adults. Membership $69 monthly.' },
      { url: 'https://gym.example/coaches', text: 'Ana is our boxing coach.' }
    ]
  })
  assert.ok(sources.length <= 40)
  assert.ok(sources.some((s) => s.kind === 'review'))
  const classes = sources.find((s) => s.url?.endsWith('/classes'))
  const coaches = sources.find((s) => s.url?.endsWith('/coaches'))
  const reading = checkBusinessReading(
    {
      services: [
        { name: 'Membership', quote: 'Membership $69 monthly.', ref: classes.ref, price: '$69 monthly' }
      ],
      team: [{ name: 'Ana', role: 'boxing coach', quote: 'Ana is our boxing coach.', ref: coaches.ref }]
    },
    sources
  )
  assert.equal(reading.services[0].price, '$69 monthly')
  assert.equal(reading.services[0].source.kind, 'website')
  assert.equal(reading.services[0].source.url, classes.url)
  assert.equal(reading.team[0].label, 'Ana')
  assert.equal(reading.team[0].reviewsOnly, false)
  const invented = checkBusinessReading(
    {
      services: [
        { name: 'Membership', quote: 'Membership $69 monthly.', ref: classes.ref, price: '$89 monthly' }
      ]
    },
    sources
  )
  assert.equal(invented.services[0].price, undefined)
})

test('website passage budget covers important pages before long landing-page tails', () => {
  const pages = [
    { url: 'https://gym.example/', text: 'Landing page.\n'.repeat(1000) },
    ...Array.from({ length: 82 }, (_, n) => ({ url: `https://gym.example/news/${n}`, text: `News ${n}` })),
    { url: 'https://gym.example/pricing', text: 'Day pass $20.' },
    { url: 'https://gym.example/team', text: 'Coach Ana.' }
  ]
  const sources = websiteReadingSources(pages)
  assert.equal(sources.length, 20)
  assert.ok(sources.some((s) => s.text === 'Day pass $20.'))
  assert.ok(sources.some((s) => s.text === 'Coach Ana.'))
  assert.ok(sources.every((s) => s.text.length <= 2400))
  assert.deepEqual(websiteReadingSources([{ url: 'javascript:alert(1)', text: 'bad' }]), [])
  assert.equal(websiteReadingSources([pages[0], pages[0]]).filter((s) => s.ref.endsWith(':1')).length, 1)
})

test('many class pages cannot crowd the team or story out of the reading budget', () => {
  const sources = websiteReadingSources([
    ...Array.from({ length: 80 }, (_, n) => ({
      url: `https://gym.example/classes/${n}`,
      text: `Class ${n}`
    })),
    { url: 'https://gym.example/team', text: 'Coach Ana.' },
    { url: 'https://gym.example/about', text: 'Founded by two sisters.' }
  ])
  assert.equal(sources.length, 20)
  assert.ok(sources.some((s) => s.text === 'Coach Ana.'))
  assert.ok(sources.some((s) => s.text === 'Founded by two sisters.'))
})
