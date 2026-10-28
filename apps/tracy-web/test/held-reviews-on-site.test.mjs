// A review that names someone the brief holds off the site (a person named only in guest reviews) reaches no page:
// not the brief's own testimonials, not the quickstart's review fill, not the agent demo's research (#1791, 27/10/2026).
// One rule for every path (`website-opportunities/domain/held-reviews.mjs`). Every name and text here is fictional.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quickstartReviews } from '../src/lib/quickstart-reviews.js'
import { withheldOf } from '../src/opportunities-build/demo-qa.js'
import {
  AGENT_DEMO,
  agentDemoCollected,
  bundlePart,
  checkedResearch,
  freezeAgentResearch
} from '../src/opportunities-build/agent-demo.js'

const MISSING = [
  {
    field: 'team',
    why: 'Named only in guest reviews.',
    withheld: [{ source: 'reviews', values: ['Alex'] }]
  }
]
const googlePlace = {
  placeId: 'ChIJharbour',
  reviews: [
    {
      author: 'Google reviewer A',
      text: 'Alex is a brilliant padel coach.',
      googleMapsUri: 'https://maps.example/r/1'
    },
    { author: 'Google reviewer B', text: 'Great padel lessons.', googleMapsUri: 'https://maps.example/r/2' }
  ]
}
const reviewSources = {
  tripadvisor: {
    attribution: 'Tripadvisor',
    reviews: [
      { text: 'Lessons with ALEX made my week.', author: 'Trip reviewer A', url: 'https://trip.example/r/1' },
      { text: 'Friendly club.', author: 'Trip reviewer B', url: 'https://trip.example/r/2' }
    ]
  }
}

test('the quickstart review fill leaves out a review naming someone the brief holds off the site', () => {
  const profile = { googlePlace, reviewSources }
  assert.deepEqual(
    quickstartReviews(profile, { missing: MISSING }).map((r) => r.author),
    ['Google reviewer B', 'Trip reviewer B']
  )
  // Without a brief, or with nobody held, every review stays.
  assert.equal(quickstartReviews(profile).length, 4)
  assert.equal(quickstartReviews(profile, { missing: [] }).length, 4)
  // A name inside a longer word is not the held name.
  const alexander = {
    googlePlace: { ...googlePlace, reviews: [{ ...googlePlace.reviews[1], text: 'Alexandra loved it.' }] }
  }
  assert.equal(quickstartReviews(alexander, { missing: MISSING }).length, 1)
})

test("the agent demo's research offers no review naming someone the brief holds off the site", () => {
  const bundle = freezeAgentResearch({
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    at: '2026-10-27',
    read: {
      profile: { name: 'Harbour Sport Club', googlePlace },
      rawSources: [{ id: 'ta', source: 'tripadvisor', collected: reviewSources.tripadvisor }],
      media: [],
      posts: []
    }
  })
  const revision = {
    id: 'r',
    account_id: 'a',
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle, missing: MISSING }
  }
  const research = checkedResearch(revision)
  assert.equal(research.hash, bundle.hash)
  const texts = bundlePart(research, 'reviews').items.map((r) => r.review.text)
  assert.deepEqual(texts, ['Great padel lessons.', 'Friendly club.'])
  const { collected } = agentDemoCollected(revision, null)
  assert.deepEqual(
    collected.reviews.map((r) => r.text),
    ['Great padel lessons.', 'Friendly club.']
  )
  // A revision whose brief holds nobody reads every review.
  const open = { ...revision, brief: { ...revision.brief, missing: [] } }
  assert.equal(bundlePart(checkedResearch(open), 'reviews').items.length, 4)
})

test("demo QA holds the business's other name off the page text, as the brief withholds it", () => {
  const brief = {
    missing: [
      {
        field: 'name',
        why: 'The business also calls itself "Harbour Sport Club" on its own logo or social page.',
        withheld: [
          { source: 'google', values: ['Padel & Tennis Coach'] },
          { source: 'own-marks', values: ['Harbour Sport Club'] }
        ]
      }
    ]
  }
  assert.deepEqual(withheldOf(brief), [
    { field: 'name', values: ['Padel & Tennis Coach', 'Harbour Sport Club'] }
  ])
})
