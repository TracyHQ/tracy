// Child list rows, second review findings on the plan side (ticket #615): a business fact a list cannot show is left
// out with its reason, data a field cannot hold is taken off by the gate, a list short of its minimum is reported, the
// place order counts only the rows that fit, and a customer's item order is kept. Invented businesses and the invented
// pottery template, plus the JA Boxing block store read for its declaration; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-second-review.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { dataAccountingOf } from '../domain/plan-accounting.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { DATA_OVER_LIMIT_REASON } from '../domain/plan-data-limits.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { rowsLeftOut } from '../domain/plan-rows-check.mjs'
import { CHILD_LIST_REASONS, planRows } from '../domain/plan-rows.mjs'
import { boxingStore } from './fixtures/child-lists/boxing-plan.mjs'
import {
  composeInputs,
  GLAZE,
  HAND,
  pottery,
  potteryComposition,
  potteryStore,
  WHEEL
} from './fixtures/child-lists/invented-pottery.mjs'
import * as Club from './fixtures/plan-composer/invented-club.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'

const sources = ['site']
const gridOf = (plan) => plan.pages[0].blocks.find((b) => b.block === 'services-grid')

test('a business link a social list cannot show is left out with its reason, never counted as shown', () => {
  const links = [
    'https://bit.ly/invented-club',
    'https://instagram.com/invented-club',
    'https://instagram.com/invented-club-two',
    'https://youtube.com/@invented',
    'https://facebook.com/invented',
    'https://x.com/invented',
    'https://tiktok.com/@invented'
  ]
  const profile = {
    sources: [{ id: 'site', origin: 'website' }],
    facts: { 'contact.social_url': links.map((value) => ({ value, sources })) },
    items: {
      person: [
        { id: 'p1', kind: 'person', fields: { 'person.name': { value: 'Invented Coach', sources } }, sources }
      ]
    }
  }
  const data = planDataOf(profile)
  const ids = [...data.byId].filter(([, e]) => e.kind === 'contact.social_url').map(([id]) => id)
  const pages = [
    { id: 'home', blocks: [{ id: 'b1', type: 'team', block: 'block-180', data: ['p1', ...ids] }] }
  ]
  const out = planRows(pages, blocksOf(boxingStore()), data)
  const left = rowsLeftOut(data, out.planned, out.dropped, new Set())
  const codes = ['social_link_shortened', 'social_network_repeated', 'social_link_over_rows']
  assert.deepEqual(
    left.map((e) => [e.what, e.kind, e.reason]),
    [links[0], links[2], links[6]].map((what, n) => [what, 'feature', CHILD_LIST_REASONS[codes[n]]])
  )
  const account = dataAccountingOf({
    data,
    pages: out.pages,
    placed: [],
    leftOutIds: new Set(left.map((e) => e.id))
  })
  for (const e of left) {
    assert.ok(account.leftOut.includes(e.id))
    assert.ok(!account.shown.includes(e.id))
  }
  assert.deepEqual(account.unexplained, [])
})

test('an item whose name is longer than its field is taken off by the gate, so the writer never stops on it', async () => {
  const name = 'Evening wheel basics for absolute beginners'
  const { research, reading } = pottery()
  research.sources[0].text += ` ${name}: Mon.`
  reading.items.push({ source: 'site', kind: 'service', fields: { 'offering.name': name }, evidence: name })
  const profile = needsProfileOf(research, reading)
  const long = profile.items.service.find((i) => i.fields['offering.name'].value === name).id
  const composition = potteryComposition()
  composition.pages[0].blocks[1].data.push(long)
  const inputs = { ...composeInputs(profile), model: Club.scriptedModel(JSON.stringify(composition)) }
  const { plan, rows } = await composePlan(inputs)
  assert.ok(!gridOf(plan).data.includes(long))
  assert.ok(rows.some((r) => r.id === long && r.code === 'data_over_limit' && r.limit === 24))
  assert.ok(
    plan.leftOut.some((e) => e.what === name && e.kind === 'item' && e.reason === DATA_OVER_LIMIT_REASON)
  )
  await writePages({
    plan,
    profile,
    blockStore: potteryStore(),
    model: scriptedWriter(() => 'Calm practice')
  })
})

test('a list short of its minimum rows is reported in the plan left out list too', async () => {
  const store = potteryStore()
  const sessions = store.blocks.find((b) => b.id === 'services-grid').itemLists[0]
  sessions.items.min = 1
  for (const field of sessions.fields) field.slots[3] = [`services-grid.item4.${field.name}-1`]
  const { plan, rows } = await composePlan({ ...composeInputs(), blockStore: store })
  assert.ok(rows.some((r) => r.code === 'list_below_min' && r.item === GLAZE))
  assert.ok(
    plan.leftOut.some(
      (e) => e.what === 'Classes' && e.kind === 'block' && e.reason === CHILD_LIST_REASONS.list_below_min
    )
  )
})

test('the place order counts only the rows that fit: rows too long never win an item a place', () => {
  const row = (owner, n, parts) => ({
    id: `${owner}-row-${n}`,
    fields: { 'offering.schedule': { value: parts } },
    sources
  })
  const service = (id, rows) => ({
    id,
    kind: 'service',
    fields: { 'offering.name': { value: id, sources } },
    sources,
    rows: rows.map((parts, n) => row(id, n + 1, parts))
  })
  const late = '18:00 to 19:00 and on'
  const items = [
    service('svc-a', [
      ['Mon', late],
      ['Tue', late],
      ['Wed', '18:00 to 19:00']
    ]),
    service('svc-b', [
      ['Thu', '18:00 to 19:00'],
      ['Fri', '18:00 to 19:00']
    ])
  ]
  const data = planDataOf({
    sources: [{ id: 'site', origin: 'website' }],
    facts: {},
    items: { service: items }
  })
  const pages = [
    { id: 'home', blocks: [{ id: 'g', type: 'services', block: 'services-grid', data: ['svc-a', 'svc-b'] }] }
  ]
  const out = planRows(pages, blocksOf(potteryStore()), data)
  // Place 1 stores two rows, place 2 one: the card with two rows that fit takes place 1.
  assert.deepEqual(out.pages[0].blocks[0].data, ['svc-b', 'svc-a'])
  assert.deepEqual(
    out.dropped.filter((d) => d.list === 'sessions').map((d) => d.code),
    ['row_value_over_limit', 'row_value_over_limit']
  )
})

test('a customer edit that reorders items keeps their order and cuts each item rows at its new place', async () => {
  const { plan, profile } = await composePlan(composeInputs())
  const grid = gridOf(plan)
  const value = [GLAZE, HAND, WHEEL]
  const edit = {
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-order',
    plan: { id: plan.id, revision: plan.revision },
    changes: [{ field: `pages[home].blocks[${grid.id}].data`, value }]
  }
  const inputs = {
    plan,
    edit,
    profile,
    blockStore: potteryStore(),
    pageRecipes: Club.pageRecipes(),
    library: Club.library()
  }
  const gated = gateEditedPlan(inputs)
  assert.equal(gated.ok, true)
  const next = gridOf(gated.plan)
  assert.deepEqual(next.data, value)
  // The third place stores one step: the second step of Wheel basics no longer fits and is left out.
  const steps = next.lists.find((l) => l.name === 'steps' && l.item === WHEEL)
  assert.equal(steps.rows.length, 1)
  assert.ok(
    gated.plan.leftOut.some(
      (e) => e.what === 'Center on the wheel' && e.reason === CHILD_LIST_REASONS.row_beyond_stored_places
    )
  )
})
