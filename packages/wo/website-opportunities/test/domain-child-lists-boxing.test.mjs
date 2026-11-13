// Child list rows on the real JA Boxing block store (ticket #615), read for its declaration only: every declared child
// list field has a decision, item N of a block's data sits in stored place N, and the real icon step draws every social
// row's network from the link in that same row. Invented items and rows, a scripted fake writer and ranking model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-boxing.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { networkOf } from '../domain/icon-social.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf, picturesStep } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { declaredRowFieldsOf, rowFieldAccountOf } from '../domain/plan-row-coverage.mjs'
import { planRows } from '../domain/plan-rows.mjs'
import { boxingPlan, boxingStore, CLUB_LINKS } from './fixtures/child-lists/boxing-plan.mjs'
import {
  firstCandidate,
  iconLibrary,
  scriptedModel,
  scriptedWriter
} from './fixtures/icon-fields/invented-yoga.mjs'

const writer = () => scriptedWriter(() => 'Calm practice')
const count = (list) => list.reduce((acc, d) => ({ ...acc, [d.code]: (acc[d.code] ?? 0) + 1 }), {})

test('JA Boxing: every declared child list field has a decision, counted per items.max and per stored place', async () => {
  const store = boxingStore()
  const { plan, profile, data, dropped } = boxingPlan(store)
  const copy = await writePages({ plan, profile, blockStore: store, model: writer() })
  const declared = declaredRowFieldsOf(plan.pages, blocksOf(store), data)
  const account = rowFieldAccountOf(declared, copy)
  console.log(
    `JA Boxing child list fields: declared ${account.declared} (items.max, the declared total), stored ${account.stored}, ` +
      `decided ${account.decided}; ${JSON.stringify(account.decisions)}; rows report ${JSON.stringify(count(dropped))}`
  )
  assert.deepEqual([account.declared, account.stored, account.decided], [422, 383, 422])
  assert.deepEqual([account.unexplained, account.extra], [[], []])
  assert.equal(declared.filter((d) => d.field.iconOf === 'network').length, 68)
  const value = (page, item, row, field) =>
    account.byId.get([page, 'b1', item, row, field].filter(Boolean).join('.'))?.value
  assert.equal(value('block-160', 'block-160-item-1', 'calendar.1', 'days'), 'Day 1')
  assert.equal(value('block-160', 'block-160-item-1', 'calendar.1', 'times'), '9:00 to 10:00')
  assert.equal(value('block-163', 'block-163-item-2', 'social.4', 'link'), 'https://x.com/coach-2-invented')
  assert.equal(value('news-post', null, 'points.3', 'point'), 'Point 3 of the article')
  assert.equal(account.byId.get('block-162.b1.pages.1.page').action, 'derived')
  // A list the business has no rows for and whose minimum is above zero is reported, never padded.
  const below = dropped.find((d) => d.code === 'list_below_min' && d.page === 'block-167')
  assert.deepEqual([below.rows, below.min, below.reason.includes('stay empty')], [0, 1, true])
})

test('JA Boxing: a planned row whose writer entries are lost, or hold another value, is unexplained, never empty', async () => {
  const store = boxingStore()
  const { plan, profile, data } = boxingPlan(store)
  const copy = await writePages({ plan, profile, blockStore: store, model: writer() })
  const lost = (f) => !(f.block === 'b1' && f.item === 'block-160-item-1' && f.row === 'calendar.1')
  const cut = { pages: copy.pages.map((p) => ({ ...p, fields: p.fields.filter(lost) })) }
  const account = rowFieldAccountOf(declaredRowFieldsOf(plan.pages, blocksOf(store), data), cut)
  assert.deepEqual(account.unexplained, [
    'block-160.b1.block-160-item-1.calendar.1.days',
    'block-160.b1.block-160-item-1.calendar.1.times'
  ])
  // A data entry holding another row's value is unexplained too.
  const swapped = structuredClone(copy)
  const days = swapped.pages
    .flatMap((p) => p.fields)
    .find((f) => f.item === 'block-160-item-1' && f.row === 'calendar.1' && f.field === 'days')
  days.value = 'Day 2'
  const wrong = rowFieldAccountOf(declaredRowFieldsOf(plan.pages, blocksOf(store), data), swapped)
  assert.deepEqual(wrong.unexplained, ['block-160.b1.block-160-item-1.calendar.1.days'])
})

test('JA Boxing block-160: item N of the data sits in stored place N, its rows cut at that place', () => {
  const store = boxingStore()
  const block = store.blocks.find((b) => b.id === 'block-160')
  const calendar = block.itemLists[0].fields[0].slots
  assert.deepEqual(
    calendar.map((p) => p.length),
    [1, 1, 2, 0]
  )
  const sources = ['site']
  const service = (n, rows) => ({
    id: `class-${n}`,
    kind: 'service',
    fields: { 'offering.name': { value: `Class ${n}`, sources } },
    sources,
    rows: Array.from({ length: rows }, (_, r) => ({
      id: `class-${n}-row-${r + 1}`,
      fields: { 'offering.schedule': { value: [`Day ${r + 1}`, `${r + 9}:00`] } },
      sources
    }))
  })
  const profile = {
    sources: [{ id: 'site', origin: 'website' }],
    facts: {},
    items: { service: [service(0, 2), service(1, 1), service(2, 1), service(3, 0)] }
  }
  const data = planDataOf(profile)
  const pages = [
    {
      id: 'home',
      blocks: [
        { id: 'b1', type: block.type, block: 'block-160', data: ['class-0', 'class-1', 'class-2', 'class-3'] }
      ]
    }
  ]
  const planned = planRows(pages, blocksOf(store), data)
  const out = planned.pages[0].blocks[0]
  // Class 0 states two sessions: it moves to position 2, the only place storing two calendar rows; class 1 keeps its
  // own place and class 2 takes the free one.
  assert.deepEqual(out.data, ['class-2', 'class-1', 'class-0', 'class-3'])
  assert.deepEqual(
    out.data.map((item) => out.lists.find((l) => l.item === item).rows.length),
    calendar.map((p) => p.length)
  )
  assert.deepEqual(planned.dropped, [])
})

test('JA Boxing: the real icon step draws every planned social row from the link written in that row', async () => {
  const store = boxingStore()
  const { plan, profile } = boxingPlan(store)
  const copy = await writePages({ plan, profile, blockStore: store, model: writer() })
  const { icons } = await picturesStep({
    plan,
    profile,
    blockStore: store,
    vision: scriptedModel(),
    model: scriptedModel(firstCandidate()),
    copy,
    iconLibrary: iconLibrary()
  })
  const rows = copy.pages.flatMap((p) =>
    p.fields
      .filter((f) => f.row && f.field === 'link' && f.from === 'data')
      .map((f) => ({ at: [p.id, f.block, f.item, f.row].filter(Boolean).join('.'), link: f.value }))
  )
  assert.equal(rows.length, 68)
  for (const { at, link } of rows) {
    const icon = icons.find((i) => i.id === `${at}.network-icon`)
    assert.equal(icon?.network, networkOf(link).network, at)
  }
})

test('JA Boxing block-180 follows the kind its store declares (a store question, not the wanted result)', () => {
  // block-180 is a trainer hero whose social list declares contact.social_url today, so it lists the club's own links.
  // The Contract A team will declare person.social_url there (#584); the rules read the declared kind and need no
  // change then (the invented store test in `domain-child-lists-social.test.mjs` shows a single person block list).
  const { plan } = boxingPlan()
  const list = plan.pages.find((p) => p.id === 'block-180').blocks[0].lists.find((l) => l.name === 'social')
  assert.deepEqual(
    list.rows.map((r) => r.data),
    ['block-180-item-1-row-1', 'block-180-item-1-row-2', 'block-180-item-1-row-3', 'block-180-item-1-row-4']
  )
  assert.equal(CLUB_LINKS.length, 2)
})
