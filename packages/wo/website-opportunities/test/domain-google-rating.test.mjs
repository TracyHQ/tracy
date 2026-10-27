// Google's rating on the site: shown from 5 reviews on, left off under it until the person shows it.
// Measured on dev 26/10/2026: Padel & Tennis Coach in Dubai, 5.0 from 4 reviews on Google, shown nowhere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideGoogleRating,
  FEW_GOOGLE_REVIEWS,
  googleRatingOf,
  ratingPickOf,
  ratingShownForms
} from '../domain/google-rating.mjs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import { placeFactsFromDetails } from '../domain/gplaces-details.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { withRatingDecision } from '../src/business-rating.js'

const PLACE_ID = 'ChIJtennisBarsha'
// The search listing the place was found by (`discovery-gplaces.mjs`): rating 5, 4 reviews, as dev holds it.
const CANDIDATE = (over = {}) => ({
  name: 'Padel & Tennis Coach',
  provider: 'google-places',
  providerId: PLACE_ID,
  trade: 'fitness',
  rating: 5,
  reviews: 4,
  mapsUrl: 'https://maps.google.com/?cid=42',
  ...over
})
const OPP = (candidate = {}) => ({
  id: 'o1',
  name: 'Padel & Tennis Coach',
  provider: 'google-places',
  providerId: PLACE_ID,
  candidate: CANDIDATE(candidate)
})
// Place Details as it was read before 26/10/2026: no rating field.
const DETAILS = { placeId: PLACE_ID, reviews: [], attribution: 'Google' }

test('Dubai case: 5.0 from 4 reviews is kept, and left off the site by default', () => {
  const d = decideGoogleRating({ googlePlace: DETAILS, candidate: CANDIDATE() })
  assert.deepEqual(d, {
    state: 'left',
    score: 5,
    reviews: 4,
    mapsUrl: 'https://maps.google.com/?cid=42',
    from: 'search',
    few: true,
    choice: null
  })
  // test-quality: contract the product treats fewer than five Google reviews as thin, a fixed rule of the rating card
  assert.equal(FEW_GOOGLE_REVIEWS, 5)
})

test('the person shows a thin rating, or leaves a well-reviewed one off', () => {
  const shown = decideGoogleRating({ googlePlace: DETAILS, candidate: CANDIDATE(), pick: { choice: 'show' } })
  assert.equal(shown.state, 'shown')
  assert.equal(shown.few, true)
  const many = decideGoogleRating({ googlePlace: DETAILS, candidate: CANDIDATE({ reviews: 5 }) })
  assert.deepEqual([many.state, many.few], ['shown', false])
  const left = decideGoogleRating({
    googlePlace: DETAILS,
    candidate: CANDIDATE({ reviews: 812 }),
    pick: { choice: 'leave' }
  })
  assert.deepEqual([left.state, left.choice], ['left', 'leave'])
  assert.deepEqual(ratingPickOf({ ratingPick: { choice: 'show', at: 'x' } }), { choice: 'show' })
  assert.equal(ratingPickOf({ ratingPick: { choice: 'maybe' } }), null)
})

test("Place Details' rating comes first; another place's listing is never this one's", () => {
  const details = placeFactsFromDetails({ id: PLACE_ID, rating: 4.4, userRatingCount: 120 })
  assert.deepEqual([details.rating, details.userRatingCount], [4.4, 120])
  assert.deepEqual(googleRatingOf({ googlePlace: details, candidate: CANDIDATE() }), {
    score: 4.4,
    reviews: 120,
    mapsUrl: 'https://maps.google.com/?cid=42',
    from: 'details'
  })
  assert.equal(googleRatingOf({ googlePlace: DETAILS, candidate: CANDIDATE({ providerId: 'other' }) }), null)
  assert.equal(googleRatingOf({ googlePlace: DETAILS, candidate: CANDIDATE({ provider: 'url' }) }), null)
  assert.equal(decideGoogleRating({ googlePlace: DETAILS, candidate: { provider: 'url' } }).state, 'none')
  // A rating without a review count is treated as few.
  assert.equal(decideGoogleRating({ candidate: CANDIDATE({ reviews: undefined }) }).state, 'left')
})

const briefOf = (candidate = {}) =>
  buildBrief({
    opportunity: OPP(candidate),
    profile: { phone: '+971 50 000 1234' },
    googlePlace: DETAILS,
    sources: [],
    media: [],
    brand: null,
    madeAt: '2026-10-26T00:00:00.000Z'
  })

test('the brief: a left-off rating is not given to the site, and the site check knows how it could be written', () => {
  const brief = briefOf()
  assert.equal(validateBrief(brief).ok, true, JSON.stringify(validateBrief(brief).errors))
  assert.equal(brief.googlePlace.rating, undefined)
  assert.equal(brief.googlePlace.userRatingCount, undefined)
  const missing = brief.missing.find((m) => m.field === 'googleRating')
  assert.match(missing.why, /only 4 reviews/)
  assert.deepEqual(missing.withheld, [
    { source: 'google', values: ratingShownForms({ state: 'left', score: 5, reviews: 4 }) }
  ])
  assert.ok(missing.withheld[0].values.includes('5.0 ★'))
  assert.ok(missing.withheld[0].values.includes('4 reviews'))
  const md = renderBriefMarkdown(brief)
  assert.doesNotMatch(md, /Rating on Google/)
  assert.match(md, /- google: "5\.0 ★"/)
  const prompt = renderAgentPrompt({ revision: { id: 'r', n: 1, cms: 'wordpress', brief, brief_md: md } })
  assert.match(prompt, /Google's rating is left off this site/)
})

test('the brief: a shown rating goes to the site with its count, credited to Google', () => {
  const brief = briefOf({ ratingPick: { choice: 'show' } })
  assert.equal(validateBrief(brief).ok, true, JSON.stringify(validateBrief(brief).errors))
  assert.deepEqual([brief.googlePlace.rating, brief.googlePlace.userRatingCount], [5, 4])
  assert.ok(!brief.missing.some((m) => m.field === 'googleRating'))
  assert.match(renderBriefMarkdown(brief), /Rating on Google: 5 \/ 5 from 4 reviews/)
  const left = briefOf({ reviews: 812, ratingPick: { choice: 'leave' } })
  assert.match(left.missing.find((m) => m.field === 'googleRating').why, /owner chose to leave/)
})

test('a brief lists a withheld value only as {source, hours} or {source, values}', () => {
  const brief = briefOf()
  brief.missing.find((m) => m.field === 'googleRating').withheld = [{ source: 'google' }]
  assert.equal(validateBrief(brief).ok, false)
})

test('the place profile holds a rating left off as a restricted statistic, and a shown one as a sourced statistic', () => {
  const read = (candidate) =>
    placeProfileFromResearch({
      identity: { provider: 'google-places', providerId: PLACE_ID, candidate: CANDIDATE(candidate) },
      profile: { name: 'Padel & Tennis Coach', googlePlace: DETAILS },
      sources: [{ source: 'google-places', ref: PLACE_ID, status: 'complete', collected: DETAILS }],
      madeAt: '2026-10-26T00:00:00.000Z'
    })
  // What a demo may show: the statistics no restriction keeps off it.
  const google = (doc) =>
    doc.claims.statistics
      .filter((s) => ['rating', 'reviewCount'].includes(s.value.label))
      .filter((s) => !s.value.restrictions?.includes('not-on-demo'))
      .map((s) => [s.value.label, s.value.amount])
  assert.deepEqual(google(read({})), [])
  // #1791: the rating left off is still one fact with a stable id, off the site with its reason.
  const held = read({}).claims.statistics.filter((s) => s.value.label === 'rating')
  assert.equal(held.length, 1)
  assert.match(held[0].derivation.reason, /^few-reviews: /)
  assert.equal(
    read({ ratingPick: { choice: 'show' } }).claims.statistics.find((s) => s.value.label === 'rating').id,
    held[0].id
  )
  assert.match(
    read({ ratingPick: { choice: 'leave' } }).claims.statistics.find((s) => s.value.label === 'rating')
      .derivation.reason,
    /^owner-left-off: /
  )
  assert.deepEqual(google(read({ ratingPick: { choice: 'show' } })), [
    ['rating', 5],
    ['reviewCount', 4]
  ])
  // Place Details' own field never slips past the decision.
  const fromDetails = placeProfileFromResearch({
    identity: { provider: 'google-places', providerId: PLACE_ID, candidate: CANDIDATE() },
    profile: { googlePlace: { ...DETAILS, rating: 5, userRatingCount: 4 } },
    sources: [
      {
        source: 'google-places',
        ref: PLACE_ID,
        status: 'complete',
        collected: { ...DETAILS, rating: 5, userRatingCount: 4 }
      }
    ],
    madeAt: '2026-10-26T00:00:00.000Z'
  })
  assert.deepEqual(google(fromDetails), [])
})

test('withRatingDecision: the Details page and the brief read the decision with the pick', () => {
  assert.equal(
    withRatingDecision({ googlePlace: DETAILS }, { opportunity: OPP() }).googleRating.state,
    'left'
  )
  assert.equal(
    withRatingDecision({ googlePlace: DETAILS }, { opportunity: OPP({ ratingPick: { choice: 'show' } }) })
      .googleRating.state,
    'shown'
  )
})
