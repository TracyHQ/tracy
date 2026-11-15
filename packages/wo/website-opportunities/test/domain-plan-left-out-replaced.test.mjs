// Left out reasons code writes in place of the model's (#609, sixth real run, `plan-left-out-plain.mjs`): a reason
// with a build word is a mechanical fault the gate fixes itself (never a retry); a section with nothing to show, a
// "no logo" reason on a plan with a logo, and photos no gallery has room for read code's sentence, the photos one
// agreeing with their number. The invented florist on the JA Boxing block store; scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-replaced.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { DERIVED_LEFT_OUT_REASONS } from '../domain/plan-left-out-wording.mjs'
import { NEUTRAL_LEFT_OUT, galleryRoomReason } from '../domain/plan-left-out-plain.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { INPUT, composition, contactPage, contextOf, homeOf } from './fixtures/write-order/boxing-gate.mjs'

// The shape of the three reasons that stopped the real first compose, in invented words.
const BUILD_WORD_ENTRIES = () => [
  { what: 'About page', kind: 'page', reason: 'No about text matching the main section fields was given.' },
  { what: 'Footer', kind: 'block', reason: 'This footer section has no fields or business data to show.' },
  {
    what: 'Contact details',
    kind: 'block',
    reason: 'Your phone is shown on the contact page in a section with fields for it.'
  }
]
const gated = (leftOut, { look, profile = boxingProfile() } = {}) => {
  const c = composition([homeOf(profile), contactPage()])
  c.leftOut = leftOut
  const context = contextOf(profile)
  return gatePlan(c, look ? { ...context, look: { ...context.look, ...look } } : context)
}
/** The florist with `n` more invented photos, which the home gallery (made from the first four) does not show. */
function withMorePhotos(n) {
  const profile = boxingProfile()
  const [first] = profile.items.gallery
  const home = profile.items.gallery.map((g) => g.id)
  for (let i = 1; i <= n; i++) {
    const url = `https://larkspur-florist.example/img/extra-${i}.jpg`
    profile.items.gallery.push({
      ...structuredClone(first),
      id: `gallery-extra-${i}`,
      label: `Shop photo extra ${i}`,
      fields: { 'business.gallery_image': { ...first.fields['business.gallery_image'], value: url } }
    })
  }
  return { profile, home }
}
const firstOf = (result, n) =>
  result.plan.leftOut.slice(0, n).map(({ what, reason, code }) => ({ what, reason, code }))

test('a left out reason with a build word is fixed by the gate and recorded, never sent back', () => {
  const result = gated(BUILD_WORD_ENTRIES())
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(firstOf(result, 3), [
    { what: 'About page', reason: NEUTRAL_LEFT_OUT.page, code: 'left_out_neutral' },
    { what: 'Footer', reason: DERIVED_LEFT_OUT_REASONS.no_items_to_show, code: 'no_items_to_show' },
    { what: 'Contact details', reason: NEUTRAL_LEFT_OUT.block, code: 'left_out_neutral' }
  ])
  assert.deepEqual(
    result.fixes.filter((f) => f.code === 'left_out_internal_wording').map((f) => f.at),
    ['leftOut[0].reason', 'leftOut[1].reason', 'leftOut[2].reason']
  )
  assert.equal(checkBuildDocument(result.plan).ok, true)
})

test('the first compose passes with build words in its left out reasons: no second model call', async () => {
  const profile = boxingProfile()
  const c = composition([homeOf(profile), contactPage()])
  c.leftOut = BUILD_WORD_ENTRIES()
  const model = scriptedModel(JSON.stringify(c))
  const composed = await composePlan({ ...INPUT, profile, model })
  assert.equal(composed.attempts.length, 1)
  assert.equal(model.calls.length, 1)
  assert.ok(composed.fixes.some((f) => f.code === 'left_out_internal_wording'))
})

test('a section reason saying it has no data to show reads the sentence of a section with nothing to show', () => {
  const result = gated([
    { what: 'Footer', kind: 'block', reason: 'This footer section has no available data to show.' }
  ])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(firstOf(result, 1), [
    { what: 'Footer', reason: DERIVED_LEFT_OUT_REASONS.no_items_to_show, code: 'no_items_to_show' }
  ])
  assert.equal(result.fixes.at(-1).code, 'left_out_reason_derived')
})

test('"no logo" is not said of a plan with a logo, own or drawn by Tracy; it stays on a plan with a text logo', () => {
  const entry = {
    what: 'Menu',
    kind: 'block',
    reason: 'You have no logo or menu links listed for this header.'
  }
  const drawn = gated([entry], {
    look: { logo: { kind: 'own', source: 'Tracy, drawn from your business name', code: 'logo_source_drawn' } }
  })
  assert.equal(drawn.ok, true, JSON.stringify(drawn.problems))
  assert.doesNotMatch(drawn.plan.leftOut[0].reason, /logo/i)
  assert.notEqual(drawn.plan.leftOut[0].code, 'model_reason')
  const text = gated([entry])
  assert.equal(text.plan.leftOut[0].reason, entry.reason)
  assert.equal(text.plan.leftOut[0].code, 'model_reason')
})

test('photos no gallery has room for read one sentence agreeing with their number, with params.count', () => {
  const reason =
    'You have more photos than the available gallery sections can show, so this photo is left out.'
  for (const n of [1, 2]) {
    const { profile, home } = withMorePhotos(n)
    const ids = profile.items.gallery.map((g) => g.id).filter((id) => !home.includes(id))
    const c = composition([homeOf(profile), contactPage()])
    c.pages[0].blocks.find((b) => b.block === 'block-166').data = home
    c.leftOut = ids.map((item) => ({ item, what: 'Photo', kind: 'item', reason }))
    const result = gatePlan(c, contextOf(profile))
    assert.equal(result.ok, true, JSON.stringify(result.problems))
    const photos = result.plan.leftOut.filter((e) => ids.includes(e.item))
    assert.equal(photos.length, n)
    for (const e of photos) {
      assert.equal(e.code, 'no_gallery_room')
      assert.deepEqual(e.params, { count: n })
      assert.equal(e.reason, galleryRoomReason(n))
    }
    assert.match(photos[0].reason, n === 1 ? /this photo\./ : /these 2 photos\. They/)
    assert.equal(checkBuildDocument(result.plan).ok, true)
  }
})
