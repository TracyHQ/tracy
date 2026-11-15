// The section key beside every block label (#609, sixth real run): the composer writes `label` in its own words, so
// the plan card cannot translate it; every block whose type has a known section name now carries `labelCode`, the
// key a change line names as `section` (`plan-wording-codes.mjs`). The model's label is kept as the English fallback.
// The invented florist on the JA Boxing block store; scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-label-codes.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { blockMapOf, composePlan } from '../domain/plan-composer.mjs'
import { sectionCodeOf } from '../domain/plan-wording-codes.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import { boxingComposition, boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { INPUT } from './fixtures/write-order/boxing-gate.mjs'

test('every block of a known section carries its labelCode, and keeps the label the model wrote', async () => {
  const profile = boxingProfile()
  const c = boxingComposition(profile)
  const model = scriptedModel(JSON.stringify(c))
  const { plan } = await composePlan({ ...INPUT, profile, model })
  const store = blockMapOf(INPUT.blockStore, INPUT.library)
  const blocks = plan.pages.flatMap((p) => p.blocks)
  for (const block of blocks)
    assert.equal(block.labelCode, sectionCodeOf(store.get(block.block)) ?? undefined, block.id)
  const byBlock = (id) => blocks.find((x) => x.block === id)
  assert.equal(byBlock('block-160').labelCode, 'services')
  assert.equal(byBlock('block-160').label, 'block-160')
  assert.equal(byBlock('contact-details').labelCode, 'contact')
  assert.equal(checkBuildDocument(plan).ok, true)
})

test('Contract B accepts a labelCode and refuses one that is no code', async () => {
  const profile = boxingProfile()
  const { plan } = await composePlan({
    ...INPUT,
    profile,
    model: scriptedModel(JSON.stringify(boxingComposition(profile)))
  })
  plan.pages[0].blocks[0].labelCode = 'Page Header'
  assert.deepEqual(
    checkBuildDocument(plan).problems.map((p) => p.at),
    [`pages[${plan.pages[0].id}].blocks[${plan.pages[0].blocks[0].id}].labelCode`]
  )
})
