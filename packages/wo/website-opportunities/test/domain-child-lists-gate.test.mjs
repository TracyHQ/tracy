// Child list rows through the rules gate, a plan edit and Contract B (ticket #615). An invented pottery studio, the
// invented club template with child lists added, and a scripted fake build model; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-gate.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { blockMapOf, composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { rowListProblems } from '../domain/plan-rows-check.mjs'
import {
  composeInputs,
  GLAZE,
  HAND,
  potteryProfile,
  potteryStore,
  WHEEL
} from './fixtures/child-lists/invented-pottery.mjs'
import * as Club from './fixtures/plan-composer/invented-club.mjs'

const composed = async (profile) => composePlan(composeInputs(profile))
const listOf = (block, name, item) => block.lists.find((l) => l.name === name && l.item === item)

test('the gate rejects rows over the limit, rows of another kind, unknown lists and rows of another item', async () => {
  const { plan } = await composed()
  const blocks = blockMapOf(potteryStore(), Club.library())
  const data = planDataOf(potteryProfile())
  const problems = (pages) => {
    const out = []
    rowListProblems(pages, blocks, data, (code, at, message) => out.push({ code, at, message }))
    return out
  }
  assert.deepEqual(problems(plan.pages), [])
  const bad = structuredClone(plan.pages)
  const grid = bad[0].blocks.find((b) => b.block === 'services-grid')
  listOf(grid, 'sessions', WHEEL).rows.push({ data: `${WHEEL}-row-3` })
  // Hand building sits in place 2, which stores one session row: a second row is too many for ITS place.
  listOf(grid, 'sessions', HAND).rows.push({ data: `${WHEEL}-row-4` })
  listOf(grid, 'steps', HAND).rows.push({ data: `${WHEEL}-row-5` })
  grid.lists.push({ name: 'prices', item: WHEEL, rows: [] })
  assert.deepEqual(
    problems(bad).map((p) => p.code),
    [
      'too_many_rows',
      'too_many_rows',
      'row_not_owned',
      'row_fields_undeclared',
      'row_not_owned',
      'unknown_list'
    ]
  )
})

test('a plan edit plans the rows again: an item taken off a block takes its rows with it', async () => {
  const { plan, profile } = await composed()
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid')
  const edit = {
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-1',
    plan: { id: plan.id, revision: plan.revision },
    changes: [{ field: `pages[home].blocks[${grid.id}].data`, value: [HAND, GLAZE] }]
  }
  const gated = gateEditedPlan({
    plan,
    edit,
    profile,
    blockStore: potteryStore(),
    pageRecipes: Club.pageRecipes(),
    library: Club.library()
  })
  assert.deepEqual(gated.problems, [])
  const after = gated.plan.pages[0].blocks.find((b) => b.block === 'services-grid')
  assert.deepEqual(
    after.lists.map((l) => `${l.name}:${l.item}:${l.rows.length}`),
    [`sessions:${HAND}:1`, `sessions:${GLAZE}:0`, `steps:${HAND}:0`, `steps:${GLAZE}:0`]
  )
})

test('Contract B: rows and lists are optional, closed and length limited; the sample plans need no edit', async () => {
  const { plan } = await composed()
  const sample = JSON.parse(
    readFileSync(
      new URL('./fixtures/build-contract/sunrise-tennis-club.build-scenario.json', import.meta.url),
      'utf8'
    )
  )
  assert.deepEqual(checkBuildDocument(sample.plan).problems, [])
  const at = (p) => checkBuildDocument(p).problems.map((x) => x.at)
  const withKey = structuredClone(plan)
  withKey.rows[0].heading = 'Evening wheel sessions for every level'
  assert.deepEqual(at(withKey), ['rows[business-row-1].heading'])
  const long = structuredClone(plan)
  long.rows[0].label = 'x'.repeat(81)
  assert.match(checkBuildDocument(long).problems[0].message, /at most 80 characters/)
  const both = structuredClone(plan)
  const footer = both.pages[0].blocks.find((b) => b.block === 'footer-main')
  footer.lists[0].rows[0] = { data: 'business-row-1', page: 'home' }
  footer.lists[0].rows[1].title = 'Open late'
  footer.lists[0].rows.push({ data: 'no-such-row' })
  assert.deepEqual(
    at(both).sort(),
    [
      `pages[home].blocks[${footer.id}].lists[0].rows[1].title`,
      `pages[home].blocks[${footer.id}].lists[0].rows[2].data`,
      `pages[home].blocks[${footer.id}].lists[0].rows[0]`
    ].sort()
  )
  const inData = structuredClone(plan)
  inData.pages[0].blocks.find((b) => b.block === 'footer-main').data.push('business-row-1')
  assert.match(checkBuildDocument(inData).problems[0].message, /is not a fact or item of the plan/)
})
