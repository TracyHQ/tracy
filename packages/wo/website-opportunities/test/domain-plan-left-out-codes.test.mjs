// Every left out line the plan card shows is said by a code (#575 stand: a Vietnamese card read "N services. You asked
// to take this off the plan." and "Posts. This stays off your site until you confirm it." in English). The codes are
// listed in `plan-left-out-codes.mjs`; the card's words for each are held by the tracy-build-chat test
// `plan-left-out-codes`. Here: the plan writes those codes on every path that wrote a bare sentence, and a plan stored
// before a code existed is read by its exact sentence. Invented club, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-codes.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { heldBackLeftOutOf } from '../domain/plan-held-back.mjs'
import {
  LEFT_OUT_CODES,
  LEFT_OUT_SENTENCES,
  MODEL_LEFT_OUT_CODES,
  withSentenceCodes
} from '../domain/plan-left-out-codes.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { REQUESTED_OFF_REASON } from '../domain/plan-request-taken-off.mjs'
import { goodComposition, SERVICES } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, revision } from './fixtures/plan-composer/plan-request.mjs'

/** Codes of entries the card never lists: sections, and the template's empty picture spots (tracy-core). */
const NOT_LISTED = new Set([
  'no_generated_people',
  'no_own_logo',
  'gallery_own_photos_only',
  'documentary_not_drawn'
])
/** Every left out entry of `plan` the card lists has a code the card has words for, or the model's own. */
function assertCoded(plan, where) {
  for (const e of plan.leftOut) {
    if (e.kind === 'block' || NOT_LISTED.has(e.code)) continue
    assert.ok(
      LEFT_OUT_CODES.includes(e.code) || MODEL_LEFT_OUT_CODES.includes(e.code),
      `${where}: ${JSON.stringify(e)}`
    )
    // A sentence code writes is never said as the model's words.
    if (MODEL_LEFT_OUT_CODES.includes(e.code))
      assert.ok(!Object.values(LEFT_OUT_SENTENCES).includes(e.reason), `${where}: ${JSON.stringify(e)}`)
  }
}

test('a sentence code writes is read by its code when it carries none, or the model code; an own code stays', () => {
  const sentences = Object.values(LEFT_OUT_SENTENCES)
  for (const [code, reason] of Object.entries(LEFT_OUT_SENTENCES)) {
    // A sentence two codes share (the rows' "no room") names neither: it stays as it is.
    const shared = sentences.filter((r) => r === reason).length > 1
    for (const carried of [undefined, 'model_reason', 'stated'])
      assert.equal(
        withSentenceCodes([{ what: 'x', kind: 'item', reason, code: carried }])[0].code,
        shared ? carried : code,
        code
      )
  }
  const own = { what: 'x', kind: 'feature', reason: REQUESTED_OFF_REASON, code: 'owner_withheld' }
  assert.deepEqual(withSentenceCodes([own]), [own])
  // Not an exact sentence: kept as the model wrote it.
  const near = { what: 'x', kind: 'item', reason: `${REQUESTED_OFF_REASON} Thanks.`, code: 'model_reason' }
  assert.deepEqual(withSentenceCodes([near]), [near])
})

test('a brief reason the card has no words for is held as kept off the site, one line per field', () => {
  const lines = heldBackLeftOutOf({
    heldBack: [
      { field: 'posts', code: 'stale', count: 2 },
      { field: 'posts', code: 'evidence_not_found', count: 1 },
      { field: 'prices', code: 'kept_off_site', count: 1 }
    ]
  })
  assert.deepEqual(
    lines.map((l) => [l.params.field, l.code, l.params.count]),
    [
      ['posts', 'kept_off_site', 3],
      ['prices', 'kept_off_site', 1]
    ]
  )
  for (const l of lines) assert.equal(l.reason, LEFT_OUT_SENTENCES.kept_off_site)
})

test('what a change request takes off is said by its code, and so is it in every later revision', async () => {
  const first = await firstPlan()
  const services = first.plan.pages[0].blocks.find((b) => b.block === 'services-grid')
  const { input } = revision(
    first,
    'Remove the services.',
    answer([{ op: 'remove_block', page: 'home', block: services.id, request: 'Remove the services' }])
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false, JSON.stringify(result.problems ?? result.notDone))
  const off = result.plan.leftOut.filter((e) => SERVICES.includes(e.item))
  assert.ok(off.length > 0, JSON.stringify(result.plan.leftOut))
  for (const e of off) assert.deepEqual([e.code, e.reason], ['requested_off', REQUESTED_OFF_REASON])
  assertCoded(result.plan, 'removed')
  // A later request keeps them off with the same code.
  const reviews = result.plan.pages[0].blocks.find((b) => b.type === 'reviews' || b.block === 'reviews-strip')
  const later = revision(
    { plan: result.plan, profile: result.profile },
    'Remove the reviews.',
    answer([{ op: 'remove_block', page: 'home', block: reviews.id, request: 'Remove the reviews' }])
  )
  const again = await revisePlan(later.input)
  assert.equal(again.unchanged, false, JSON.stringify(again.problems ?? again.notDone))
  for (const e of again.plan.leftOut.filter((x) => SERVICES.includes(x.item)))
    assert.equal(e.code, 'requested_off')
  assertCoded(again.plan, 'removed again')
  assert.ok(checkBuildDocument(again.plan).ok)
})

test('data only a removed page showed is said by its code', async () => {
  const first = await firstPlan()
  const team = first.plan.pages.find((p) => p.id === 'team')
  assert.ok(team, 'the plan has a team page')
  const { input } = revision(
    first,
    'Remove the coaches page.',
    answer([{ op: 'remove_page', page: 'team', request: 'Remove the coaches page' }])
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false, JSON.stringify(result.problems ?? result.notDone))
  const codes = result.plan.leftOut.filter((e) => e.kind !== 'block').map((e) => e.code)
  assert.ok(codes.includes('removed_page_data'), JSON.stringify(result.plan.leftOut))
  assert.ok(codes.includes('page_removed'), JSON.stringify(result.plan.leftOut))
  assertCoded(result.plan, 'page removed')
})

test('a plan stored with the sentence as model words is said by its code after the next change request', async () => {
  const composition = goodComposition()
  composition.pages[0].blocks[2].data = SERVICES.filter((id) => id !== 'service-cardio-tennis')
  composition.leftOut.push({ item: 'service-cardio-tennis', reason: REQUESTED_OFF_REASON })
  const first = await firstPlan(composition)
  // As a plan stored before the code: the entry the model's, its sentence the code's.
  const stored = structuredClone(first.plan)
  for (const e of stored.leftOut) if (e.item === 'service-cardio-tennis') e.code = 'model_reason'
  const reviews = stored.pages[0].blocks.find((b) => b.type === 'reviews' || b.block === 'reviews-strip')
  const { input } = revision(
    { plan: stored, profile: first.profile },
    'Remove the reviews.',
    answer([{ op: 'remove_block', page: 'home', block: reviews.id, request: 'Remove the reviews' }])
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false, JSON.stringify(result.problems ?? result.notDone))
  const entry = result.plan.leftOut.find((e) => e.item === 'service-cardio-tennis')
  assert.deepEqual([entry.code, entry.reason], ['requested_off', REQUESTED_OFF_REASON])
  assertCoded(result.plan, 'stored')
})
