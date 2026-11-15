// The gate's wording rules (#617 review, 2026-11-14): a block reason that counts items the block no longer shows (the
// gate took one off for its length: "All three services" over two), and a block label that is the name of its one
// datum ("Business name" over the business name). Each goes back to the model once; the plan it then gives passes.
// The invented pottery studio and the invented club; scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-wording.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { countedClaimsOf } from '../domain/plan-gate-wording.mjs'
import * as Club from './fixtures/plan-composer/invented-club.mjs'
import { composeInputs, pottery, potteryComposition } from './fixtures/child-lists/invented-pottery.mjs'

const NAME = 'Evening wheel basics for absolute beginners'
const codesOf = (attempt) => attempt.problems.map((p) => p.code)

function profileWithLongName() {
  const { research, reading } = pottery()
  research.sources[0].text += ` ${NAME}: Mon.`
  reading.items.push({ source: 'site', kind: 'service', fields: { 'offering.name': NAME }, evidence: NAME })
  const profile = needsProfileOf(research, reading)
  return { profile, long: profile.items.service.find((i) => i.fields['offering.name'].value === NAME).id }
}

test('a reason counting an item the gate took off goes back once, naming it; the reworded plan passes', async () => {
  const { profile, long } = profileWithLongName()
  const first = potteryComposition()
  first.pages[0].blocks[1].data.push(long)
  first.pages[0].blocks[1].reason = 'All four classes you teach, with their times.'
  const second = potteryComposition()
  second.pages[0].blocks[1].reason = 'All three classes you teach, with their times.'
  second.leftOut = [{ item: long, reason: 'Its name is longer than this section can show.' }]
  const model = Club.scriptedModel(JSON.stringify(first), JSON.stringify(second))
  const { plan, attempts } = await composePlan({ ...composeInputs(profile), model })
  assert.equal(attempts.length, 2)
  const problem = attempts[0].problems.find((p) => p.code === 'reason_count_mismatch')
  assert.ok(problem, JSON.stringify(attempts[0].problems))
  assert.match(problem.message, /"All four classes" and the block shows 3/)
  assert.ok(problem.message.includes(JSON.stringify(long)))
  assert.deepEqual(attempts[1].problems, [])
  assert.equal(plan.pages[0].blocks[1].reason, 'All three classes you teach, with their times.')
})

test('a block label that is the name of its one datum takes the section name of its block, recorded (#614)', async () => {
  const first = potteryComposition()
  first.pages[0].blocks[0].label = 'Business name'
  const model = Club.scriptedModel(JSON.stringify(first))
  const { attempts, plan, fixes } = await composePlan({ ...composeInputs(), model })
  assert.equal(attempts.length, 1)
  assert.deepEqual(attempts[0].problems, [])
  assert.equal(plan.pages[0].blocks[0].label, 'Page header')
  assert.deepEqual(fixes, [
    {
      code: 'label_repeats_data',
      at: 'pages[0].blocks[0].label',
      rule: "a label that is the name of the block's one datum takes the section name of the block",
      was: 'Business name',
      now: 'Page header'
    }
  ])
})

test('on a plan that is not in English a repeated label goes back once; a section name passes', async () => {
  const profile = needsProfileOf(pottery().research, pottery().reading)
  profile.language = { ...profile.language, value: 'fr' }
  const first = potteryComposition()
  first.pages[0].blocks[0].label = 'Business name'
  const model = Club.scriptedModel(JSON.stringify(first), JSON.stringify(potteryComposition()))
  const { attempts } = await composePlan({ ...composeInputs(profile), model })
  assert.deepEqual(codesOf(attempts[0]), ['label_repeats_data'])
  assert.match(attempts[0].problems[0].message, /"Business name" is the name of the one thing/)
  assert.deepEqual(attempts[1].problems, [])
})

test('only a counted claim of the block items is read; other numbers in a reason are not', () => {
  assert.deepEqual(
    countedClaimsOf('All three services you offer are easy to find.', ['service']).map((c) => c.said),
    [3]
  )
  assert.deepEqual(
    countedClaimsOf('Your 4 trainers, together.', ['person']).map((c) => c.said),
    [4]
  )
  assert.deepEqual(countedClaimsOf('Two sessions a week, all in one place.', ['service']), [])
  assert.deepEqual(countedClaimsOf('All three services you offer.', ['person']), [])
})
