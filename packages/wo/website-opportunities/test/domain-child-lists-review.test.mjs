// Child list rows, review findings (ticket #615): the grounding of row values, row ids, rows that cannot be written
// whole, and a plan edit. The link rules of social rows: `domain-child-lists-social.test.mjs`. An invented pottery studio and invented stores; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-review.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { provenBy } from '../domain/needs-profile-grounding.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { CHILD_LIST_REASONS } from '../domain/plan-rows.mjs'
import {
  composeInputs,
  GLAZE,
  HAND,
  pottery,
  potteryStore,
  WHEEL
} from './fixtures/child-lists/invented-pottery.mjs'
import * as Club from './fixtures/plan-composer/invented-club.mjs'

const site = (text) => ({
  sources: [{ id: 'site', origin: 'website', ref: 'https://k.example', language: 'en', text }]
})
const reading = (items) => ({ languages: [{ source: 'site', language: 'en' }], facts: [], items, rows: [] })

test('every part of a row, a summary kind too, stands inside its own quote as whole words', () => {
  const text = 'Kilnmere. Classes: Tue and Thu, 18:00 to 20:00. Members train hard.'
  const item = (rows) => ({
    source: 'site',
    kind: 'service',
    fields: { 'offering.name': 'Classes' },
    evidence: 'Classes: Tue and Thu',
    rows
  })
  const profile = needsProfileOf(
    site(text),
    reading([
      item([
        { fields: { 'offering.schedule': ['Tue', '00 to 20'] }, evidence: 'Tue and Thu, 18:00 to 20:00' },
        { fields: { 'offering.schedule': ['Thu', '18:00 to 20:00'] }, evidence: 'Thu, 18:00 to 20:00' }
      ])
    ])
  )
  assert.deepEqual(
    profile.dropped.filter((d) => d.row).map((d) => [d.code, d.field, d.row]),
    [['value_not_in_evidence', 'offering.schedule', 'rows[0]']]
  )
  assert.deepEqual(
    profile.items.service[0].rows.map((r) => r.fields['offering.schedule'].value),
    [['Thu', '18:00 to 20:00']]
  )
  // The shared rule: part of a number is never a word of its own.
  assert.equal(provenBy('business.name', '00 to 20', '18:00 to 20:00'), false)
  assert.equal(provenBy('business.name', '18:00 to 20:00', 'Tue, 18:00 to 20:00.'), true)
})

test('a summary kind of a row that its quote does not hold is dropped, the row kept', () => {
  const text = 'Kilnmere. Classes: Tue and Thu, 18:00 to 20:00. Members train hard.'
  const profile = needsProfileOf(
    site(text),
    reading([
      {
        source: 'site',
        kind: 'service',
        fields: { 'offering.name': 'Classes' },
        evidence: 'Classes: Tue and Thu',
        rows: [
          {
            fields: { 'offering.schedule': 'Tue', 'offering.description': 'Free sauna access' },
            evidence: 'Tue and Thu'
          }
        ]
      }
    ])
  )
  assert.deepEqual(
    profile.dropped.filter((d) => d.row).map((d) => [d.code, d.field]),
    [['summary_not_in_evidence', 'offering.description']]
  )
  assert.deepEqual(profile.items.service[0].rows[0].fields, { 'offering.schedule': { value: 'Tue' } })
})

test('a row id another item uses takes a free id: no row is lost to a name', () => {
  const text = 'Boxing: Mon 18:00. Boxing row 1: Tue 19:00.'
  const profile = needsProfileOf(
    site(text),
    reading([
      {
        source: 'site',
        kind: 'service',
        fields: { 'offering.name': 'Boxing' },
        evidence: 'Boxing: Mon 18:00',
        rows: [{ fields: { 'offering.schedule': 'Mon 18:00' }, evidence: 'Boxing: Mon 18:00' }]
      },
      {
        source: 'site',
        kind: 'service',
        fields: { 'offering.name': 'Boxing row 1' },
        evidence: 'Boxing row 1: Tue 19:00'
      }
    ])
  )
  const data = planDataOf(profile)
  assert.deepEqual(
    data.rows.map((r) => [r.id, r.label]),
    [['service-boxing-row-1-2', 'Mon 18:00']]
  )
  assert.deepEqual(data.rowsOf('service-boxing'), ['service-boxing-row-1-2'])
  assert.equal(data.byId.get('service-boxing-row-1').what, 'item')
})

test('a row longer than its field, or with more parts than fields, is dropped with a reason; written order is kept', async () => {
  const { research, reading: read } = pottery()
  research.sources[0].text +=
    ' Thu, 18:00 to 20:30 with a long cooldown. Fri, 08:00, 09:00, 10:00. Sat late, 21:00 to 22:00.'
  read.items[1].rows = [
    {
      fields: { 'offering.schedule': ['Thu', '18:00 to 20:30 with a long cooldown'] },
      evidence: 'Thu, 18:00 to 20:30 with a long cooldown'
    },
    { fields: { 'offering.schedule': ['Fri', '08:00', '09:00'] }, evidence: 'Fri, 08:00, 09:00, 10:00' },
    { fields: { 'offering.schedule': ['21:00 to 22:00', 'Sat late'] }, evidence: 'Sat late, 21:00 to 22:00' }
  ]
  const { plan, rows } = await composePlan(composeInputs(needsProfileOf(research, read)))
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid')
  assert.deepEqual(
    rows.filter((d) => d.item === HAND).map((d) => [d.code, d.row]),
    [
      ['row_value_over_limit', `${HAND}-row-1`],
      ['row_parts_over_fields', `${HAND}-row-2`]
    ]
  )
  // Two parts of one kind fill its fields in the order the source writes them: never reordered by guess.
  assert.deepEqual(grid.lists.find((l) => l.name === 'sessions' && l.item === HAND).rows, [
    { data: `${HAND}-row-3` }
  ])
  assert.ok(plan.leftOut.some((e) => e.reason === CHILD_LIST_REASONS.row_value_over_limit))
})

test('a plan edit reports the left out rows again from the new rows, and accounts for every row', async () => {
  const { plan, profile } = await composePlan(composeInputs())
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid')
  const rowsOut = (p) => p.leftOut.filter((e) => e.kind === 'item').map((e) => e.what)
  assert.deepEqual(rowsOut(plan), ['Sun 12:00 to 16:00', 'Sun, 14:00 to 16:00'])
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
  // Wheel basics left the block: its third session goes with it; the footer's third line is still left out.
  assert.deepEqual(rowsOut(gated.plan), ['Sun 12:00 to 16:00'])
  assert.deepEqual(gated.plan.rows, plan.rows)
  assert.ok(gated.plan.rows.some((r) => r.id === `${WHEEL}-row-1`))
})

test('the needs profile prompt asks for package and post rows too', () => {
  const prompt = readFileSync(new URL('../domain/needs-profile-prompt.md', import.meta.url), 'utf8')
  assert.match(prompt, /`package\.feature_item`/)
  assert.match(prompt, /`article\.lead`/)
})
