// The Tracy library declaration passes the AI quickstart contract check (ticket #596 over #581), and the plan composer
// (#593) takes its reviews block as a library block, holding the plan to the block's content rules. Invented club,
// invented template, scripted composition: no model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLibraryDeclaration } from '../domain/ai-quickstart-library.mjs'
import { TRACY_LIBRARY, TRACY_LIBRARY_DECLARATION, libraryItemProblem } from '../domain/library.mjs'
import { composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  REVIEWS,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const declaration = () => structuredClone(TRACY_LIBRARY_DECLARATION)
const ats = (res) => res.problems.map((p) => p.at)
const blocksOf = (plan) => plan.pages.flatMap((p) => p.blocks)

/** The invented club's profile, its second review given `rating`. */
function profileWithRating(rating) {
  const profile = clubProfile()
  profile.items.quote[1].fields['quote.rating_or_source'].value = rating
  return profile
}
const contextOf = (profile = clubProfile()) =>
  composerContextOf({
    profile,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: TRACY_LIBRARY,
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })

test('the Tracy library declaration passes the contract check', () => {
  assert.deepEqual(checkLibraryDeclaration(declaration()), { ok: true, blocks: 1, problems: [] })
})

test('a library block breaking a block store rule fails, with its place', () => {
  const doc = declaration()
  delete doc.blocks[0].itemFields[0].limit
  doc.blocks[0].type = 'testimonials'
  delete doc.blocks[0].noData
  assert.deepEqual(ats(checkLibraryDeclaration(doc)).sort(), [
    'blocks[tracy-reviews].itemFields[text].limit',
    'blocks[tracy-reviews].noData',
    'blocks[tracy-reviews].type'
  ])
})

test('a library block must say it is one, and bind its design roles to template variables only', () => {
  const doc = declaration()
  doc.blocks[0].source = 'template'
  doc.blocks[0].designVariables.accent = { variables: ['--color-primary'], fallback: '#f44141' }
  doc.blocks[0].designVariables.text = { variables: ['color-text'] }
  doc.blocks[0].designVariables.radius = { variables: ['--t4-border-radius'], fallback: 'red' }
  assert.deepEqual(ats(checkLibraryDeclaration(doc)), [
    'blocks[tracy-reviews].source',
    'blocks[tracy-reviews].designVariables.accent.fallback',
    'blocks[tracy-reviews].designVariables.text.variables[0]',
    'blocks[tracy-reviews].designVariables.radius.fallback'
  ])
  delete doc.blocks[0].designVariables
  assert.ok(ats(checkLibraryDeclaration(doc)).includes('blocks[tracy-reviews].designVariables'))
})

test('the plan composer takes the real reviews block from the library and places the reviews in it', async () => {
  const replies = [goodComposition()]
  const { plan, placed } = await composePlan({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: TRACY_LIBRARY,
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: async (request) => {
      assert.ok(
        JSON.parse(request.user).blocks.some((b) => b.id === 'tracy-reviews' && b.source === 'library')
      )
      return JSON.stringify(replies.shift())
    }
  })
  const reviews = blocksOf(plan).find((b) => b.type === 'reviews')
  assert.deepEqual([reviews.block, reviews.source, reviews.data], ['tracy-reviews', 'library', REVIEWS])
  assert.deepEqual(new Set(placed.map((p) => p.how)), new Set(['Tracy library block']))
})

test('a review below four stars is not placed in the library block: the plan reports it left out, with the reason', () => {
  const { ok, plan, placed } = gatePlan(goodComposition(), contextOf(profileWithRating('3')))
  assert.equal(ok, true)
  assert.deepEqual(
    placed.map((p) => p.item),
    [REVIEWS[0]]
  )
  const left = plan.leftOut.find((l) => /Osric Vale/.test(l.what))
  assert.match(left.reason, /four or five stars/)
})

test('the gate refuses a composition that puts a review the library block does not show into it', () => {
  const c = goodComposition()
  c.pages[0].blocks.splice(-1, 0, {
    block: 'tracy-reviews',
    label: 'Reviews',
    data: [...REVIEWS],
    reason: 'What members say.'
  })
  const result = gatePlan(c, contextOf(profileWithRating('2')))
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => p.code),
    ['library_rule']
  )
  assert.ok(gatePlan(c, contextOf()).ok)
})

test('content rules apply to library blocks only', () => {
  const item = { fields: { 'quote.text': { value: 'Fine.' }, 'quote.rating_or_source': { value: '1' } } }
  assert.equal(libraryItemProblem({ source: 'template', type: 'reviews' }, item), null)
  assert.match(libraryItemProblem(TRACY_LIBRARY[0], item), /four or five stars/)
})
