// Google's rating left off the site stays one fact even when a listing page shows a different copy of it (#1791). On
// dev (27/10/2026) a coach's Google rating counted 4 reviews while a directory page copied it as 5.0 from 16; the
// disagreeing copy cancelled both statistics, so the rating was no fact at all, and the brief, the agent prompt and QA
// stopped naming it as withheld. A copy that disagrees still never stands, and the Google fact stays, off the site.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { factDecisions } from '../domain/fact-assessment.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const LISTING = 'https://listing.test/harbour-sport-club'
// A directory page that shows Google's rating as it once was: 5.0 from 16 reviews, not its own.
const copiedListing = {
  source: 'listing',
  ref: LISTING,
  status: 'complete',
  collected_at: '2026-10-26T10:00:00.000Z',
  collected: {
    listings: [{ ok: true, url: LISTING, facts: { rating: 5, reviews: 16, ratingOf: 'google' } }]
  }
}
const brief = (sources = [copiedListing]) =>
  buildBrief({
    opportunity: HSC.opportunity,
    profile: HSC.profile,
    googlePlace: HSC.profile.googlePlace,
    sources,
    media: HSC.media,
    posts: HSC.posts,
    brand: HSC.brand,
    madeAt: HSC.madeAt
  })
const ratingFacts = (b) => b.facts.filter((f) => f.field === 'googleRating')

test('a disagreeing copy of Google’s rating leaves the 4-review rating one fact, off the site for few reviews', () => {
  const doc = placeProfileFromResearch({
    identity: HSC.opportunity,
    profile: HSC.profile,
    sources: [copiedListing],
    madeAt: HSC.madeAt
  })
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
  const ratings = doc.claims.statistics.filter((f) => f.value.label === 'rating')
  // Only Google's own: the listing's copy never stands beside it.
  assert.equal(ratings.length, 1, JSON.stringify(ratings.map((f) => f.value)))
  assert.equal(ratings[0].value.amount, 5)
  assert.match(ratings[0].derivation?.reason ?? '', /^few-reviews:/)
  // The decision the card shows: off, with its reason.
  const decided = factDecisions(doc).get(ratings[0].id)
  assert.equal(decided.onSite, false)
  assert.ok(decided.reasons.includes('few-reviews'), JSON.stringify(decided.reasons))
})

test('the brief, its markdown and the agent prompt name the withheld rating; the card decisions hold it off', () => {
  const b = brief()
  assert.deepEqual(validateBrief(b), { ok: true, errors: [] })
  const [rating, count] = ['rating', 'reviewCount'].map((label) =>
    ratingFacts(b).find((f) => f.value?.label === label)
  )
  assert.ok(rating && count, JSON.stringify(ratingFacts(b)))
  for (const f of [rating, count]) {
    assert.equal(f.onSite, false)
    assert.ok(f.reasons.includes('few-reviews'), JSON.stringify(f.reasons))
  }
  assert.equal(count.value.amount, 4)
  const held = b.missing.find((m) => m.field === 'googleRating')
  assert.ok(held, JSON.stringify(b.missing.map((m) => m.field)))
  assert.match(held.why, /only 4 reviews/)
  const values = held.withheld.flatMap((w) => w.values)
  for (const v of ['5.0 ★', '5.0/5', '4 reviews']) assert.ok(values.includes(v), v)
  assert.equal(b.googlePlace.rating ?? null, null)
  const md = renderBriefMarkdown(b)
  assert.match(md, /- googleRating: 5 \(rating\) · .* · off the site: .*few-reviews/)
  assert.match(md, /5\.0 ★/)
  const prompt = renderAgentPrompt({ revision: { id: 'r1', n: 1, cms: 'joomla', brief: b, brief_md: md } })
  assert.match(prompt, /5\.0 ★/)
  assert.match(prompt, /4 reviews/)
})

test('counter-case: with no listing copy the same rating is held the same way', () => {
  const plain = brief([])
  assert.deepEqual(
    ratingFacts(plain).map((f) => [f.value.label, f.onSite]),
    ratingFacts(brief()).map((f) => [f.value.label, f.onSite])
  )
})
