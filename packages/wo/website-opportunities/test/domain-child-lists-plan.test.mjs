// Child list rows through the needs profile, the plan, the rules gate and Contract B (ticket #615). An invented
// pottery studio, the invented club template with child lists added, and a scripted fake build model; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-plan.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { buildNeedsProfile, needsProfileOf } from '../domain/needs-profile.mjs'
import { blockMapOf, composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { rowListProblems } from '../domain/plan-rows-check.mjs'
import {
  composeInputs,
  GLAZE,
  HAND,
  ODILE,
  pottery,
  potteryProfile,
  potteryStore,
  scriptedModel,
  WHEEL
} from './fixtures/child-lists/invented-pottery.mjs'
import * as Club from './fixtures/plan-composer/invented-club.mjs'

const composed = async (profile) => composePlan(composeInputs(profile))
const blockOf = (plan, type) => plan.pages.flatMap((p) => p.blocks).find((b) => b.block === type)
const listOf = (block, name, item) => block.lists.find((l) => l.name === name && l.item === item)
const rowIds = (entry) => entry.rows.map((r) => r.data)

test('the needs profile keeps grounded rows with their parts, and drops a row its evidence does not hold', async () => {
  const { research, reading } = pottery()
  const model = scriptedModel(JSON.stringify(reading))
  const profile = await buildNeedsProfile({ research, model })
  assert.match(model.calls[0].system, /Rows: when a source lists/)
  const wheel = profile.items.service.find((i) => i.id === WHEEL)
  assert.deepEqual(wheel.rows[0], {
    id: `${WHEEL}-row-1`,
    fields: { 'offering.schedule': { value: ['Tue and Thu', '18:00 to 20:00'] } },
    sources: ['site']
  })
  assert.equal(wheel.rows[3].rows[0].fields['step.description'].value, 'pressing out every air pocket')
  assert.equal(wheel.rows.length, 5)
  const dropped = profile.dropped.filter((d) => d.row)
  assert.deepEqual(
    dropped.map((d) => [d.code, d.field, d.row]),
    [['value_not_in_evidence', 'step.title', 'rows[5]']]
  )
  assert.deepEqual(
    profile.rows.map((r) => r.fields['offering.schedule'].value),
    ['Tue to Fri 10:00 to 21:00', 'Sat 09:00 to 17:00', 'Sun 12:00 to 16:00']
  )
  // A profile without rows keeps its old shape: no `rows` key at all.
  assert.equal(Object.hasOwn(Club.clubProfile(), 'rows'), false)
})

test('a row value outside its quote, an unknown kind and a page word kind are dropped with reason codes', () => {
  const { research, reading } = pottery()
  reading.items[1].rows.push(
    { fields: { 'offering.schedule': 'Fri, 08:00 to 09:00' }, evidence: 'Wed, 19:00 to 21:00' },
    { fields: { 'editorial.heading': 'Wed' }, evidence: 'Wed, 19:00 to 21:00' },
    { fields: { 'offering.schedule': 'Mon' }, evidence: 'not in the source text' }
  )
  const next = needsProfileOf(research, reading)
  const codes = next.dropped.filter((d) => d.row).map((d) => d.code)
  assert.deepEqual(codes.sort(), [
    'evidence_not_in_source',
    'row_without_fields',
    'unknown_kind',
    'value_not_in_evidence',
    'value_not_in_evidence'
  ])
  assert.equal(next.items.service.find((i) => i.id === HAND).rows.length, 1)
})

test('rows are planned from the business data, in order, cut at the stored places, and the rest is reported', async () => {
  const { plan, accounting, rows } = await composed()
  const grid = blockOf(plan, 'services-grid')
  // Wheel basics states 3 sessions: it takes the card storing the most (2), its third session is left out.
  assert.deepEqual(rowIds(listOf(grid, 'sessions', WHEEL)), [`${WHEEL}-row-1`, `${WHEEL}-row-2`])
  assert.deepEqual(rowIds(listOf(grid, 'sessions', HAND)), [`${HAND}-row-1`])
  // A list with no business data is planned empty: no invented rows.
  assert.deepEqual(listOf(grid, 'sessions', GLAZE).rows, [])
  assert.deepEqual(listOf(grid, 'steps', GLAZE).rows, [])
  const steps = listOf(grid, 'steps', WHEEL)
  assert.deepEqual(rowIds(steps), [`${WHEEL}-row-4`, `${WHEEL}-row-5`])
  assert.deepEqual(steps.rows[0].lists, [{ name: 'tips', rows: [{ data: `${WHEEL}-row-4-row-1` }] }])
  assert.deepEqual(steps.rows[1].lists, [{ name: 'tips', rows: [] }])
  assert.deepEqual(rowIds(listOf(blockOf(plan, 'team-cards'), 'links', ODILE)), [
    `${ODILE}-row-1`,
    `${ODILE}-row-2`
  ])
  assert.deepEqual(rowIds(listOf(blockOf(plan, 'footer-main'), 'hours')), [
    'business-row-1',
    'business-row-2'
  ])
  assert.deepEqual(
    rows.map((d) => [d.code, d.row]),
    [
      ['row_over_max', `${WHEEL}-row-3`],
      ['row_over_max', 'business-row-3']
    ]
  )
  assert.deepEqual(
    plan.leftOut.filter((e) => e.kind === 'item').map((e) => e.what),
    ['Sun 12:00 to 16:00', 'Sun, 14:00 to 16:00']
  )
  assert.deepEqual(accounting.unexplained, [])
  assert.equal(
    accounting.total,
    accounting.shown.length + accounting.placed.length + accounting.leftOut.length
  )
  console.log(
    `rows accounted: ${plan.rows.length} rows, ${accounting.total} data in all, left out ${accounting.leftOut.length}`
  )
  assert.deepEqual(checkBuildDocument(plan).problems, [])
})

test('three cards with two sessions each: the card in the place storing one keeps one, with the reason', async () => {
  const { research, reading } = pottery()
  const extra = (n, day) => ({ fields: { 'offering.schedule': day }, evidence: day })
  research.sources[0].text += ' Mon evening. Fri morning. Thu noon.'
  reading.items[1].rows.push(extra(1, 'Mon evening'))
  reading.items[2].rows = [extra(1, 'Fri morning'), extra(2, 'Thu noon')]
  const { plan, rows } = await composed(needsProfileOf(research, reading))
  const grid = blockOf(plan, 'services-grid')
  assert.deepEqual(
    [WHEEL, HAND, GLAZE].map((id) => listOf(grid, 'sessions', id).rows.length),
    [2, 2, 1]
  )
  assert.ok(rows.some((d) => d.code === 'row_beyond_stored_places' && d.item === GLAZE))
})

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
