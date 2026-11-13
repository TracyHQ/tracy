// A review that is not from Google is never shown as a Google review (ticket #596), checked through the whole seam:
// research -> needs profile -> plan -> rules gate -> reviews block. The invented club's website gains a testimonial
// with five stars; the block refuses it, the gate refuses a plan that puts it in the block, and placement lists it as
// left out with the reason. Invented club, invented template, scripted composition: no model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { TRACY_LIBRARY, tracyLibraryBlock } from '../domain/library.mjs'
import { renderReviewsBlock } from '../domain/library-reviews-render.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  REVIEWS,
  blockStore,
  brand,
  clubResearch,
  goodComposition,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const TESTIMONIAL = { author: 'Wren Ashdown', text: 'Praise written on the club website only.', rating: 5 }

/** The invented club with one five star testimonial on its own website, through the needs profile. */
function seam() {
  const { research, reading } = clubResearch()
  research.sources.find((s) => s.origin === 'website').reviews = [TESTIMONIAL]
  const profile = needsProfileOf(research, reading)
  const context = composerContextOf({
    profile,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: TRACY_LIBRARY,
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
  const testimonial = profile.items.quote.find((q) => q.fields['quote.text'].value === TESTIMONIAL.text)
  return { profile, context, testimonial }
}

test('the needs profile holds the website testimonial, from the website source only', () => {
  const { profile, testimonial } = seam()
  assert.ok(testimonial, 'the testimonial reaches the needs profile')
  const origins = testimonial.sources.map((id) => profile.sources.find((s) => s.id === id).origin)
  assert.deepEqual(origins, ['website'])
})

test('placement leaves the website testimonial out, with the reason, and places the Google reviews', () => {
  const { context, testimonial } = seam()
  const { ok, plan, placed } = gatePlan(goodComposition(), context)
  assert.equal(ok, true)
  assert.deepEqual(
    placed.map((p) => p.item),
    REVIEWS
  )
  const reviews = plan.pages.flatMap((p) => p.blocks).find((b) => b.block === 'tracy-reviews')
  assert.deepEqual(reviews.data, REVIEWS)
  assert.ok(!reviews.data.includes(testimonial.id))
  const left = plan.leftOut.find((l) => /Wren Ashdown/.test(l.what))
  assert.match(left.reason, /not a Google review/)
})

test('the gate refuses a plan that puts the website testimonial in the reviews block', () => {
  const { context, testimonial } = seam()
  const c = goodComposition()
  c.pages[0].blocks.splice(-1, 0, {
    block: 'tracy-reviews',
    label: 'Reviews',
    data: [...REVIEWS, testimonial.id],
    reason: 'What members say.'
  })
  const result = gatePlan(c, context)
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => [p.code, p.at]),
    [['library_rule', 'pages[0].blocks[5].data[2]']]
  )
  assert.match(result.problems[0].message, /not a Google review/)
})

test('the block itself refuses the testimonial when handed the profile items, and shows the Google ones', () => {
  const { profile } = seam()
  const google = profile.sources.find((s) => s.origin === 'google')
  const { shown, setAside } = renderReviewsBlock(tracyLibraryBlock('tracy-reviews'), {
    google,
    sources: profile.sources,
    reviews: profile.items.quote
  })
  assert.deepEqual(
    shown.map((r) => r.author),
    ['Mara T.', 'Osric V.']
  )
  assert.equal(setAside.length, 1)
  assert.match(setAside[0].reason, /not a Google review/)
  // Without the profile's sources, a source id cannot be read as Google: nothing is shown as a Google review.
  assert.throws(
    () => renderReviewsBlock(tracyLibraryBlock('tracy-reviews'), { google, reviews: profile.items.quote }),
    (e) => e.code === 'no_reviews'
  )
})
