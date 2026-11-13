// Every field accounted for (ticket #597): the real JA Boxing block store description with every block placed, its
// copy from the real page writer and its pictures and icons from the real pictures step, each with scripted fake
// models (`fixtures/icon-fields/every-block-placed.mjs`). Every declared non-design field of every place the order
// shows has exactly one entry (a field entry, a picture or an icon) holding a value or an action, and every place it
// does not show is listed in `hidden` with its reason: zero unexplained. Walking the order's own places gives the same
// declared total. The same runs on the store as #584 will change it (block-180, a single trainer hero: its social row
// link becomes person.social_url and its label names the network, `textOf: "network"`). The totals are printed.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-coverage.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { placesOfBlock } from '../domain/picture-block-places.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { picturesStep } from '../domain/picture-step.mjs'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { boxingPlan } from './fixtures/child-lists/boxing-plan.mjs'
import { everyBlockPlaced } from './fixtures/icon-fields/every-block-placed.mjs'
import {
  firstCandidate,
  iconLibrary,
  scriptedModel,
  scriptedWriter
} from './fixtures/icon-fields/invented-yoga.mjs'

const BOXING = new URL(
  '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/block-store.json',
  import.meta.url
)
const declared = JSON.parse(readFileSync(BOXING, 'utf8'))
/** The store as #584 declares block-180, applied in memory: the trainer's own links, each row labelled by network. */
function as584(source) {
  const store = structuredClone(source)
  const social = store.blocks.find((b) => b.id === 'block-180').lists.find((l) => l.name === 'social')
  social.fields.find((f) => f.name === 'link').kind = 'person.social_url'
  social.fields.find((f) => f.name === 'label').textOf = 'network'
  return store
}
/** A plan as the composer makes it: one home page (every other page takes its id as its type), every page named. */
function oneHome(planned) {
  planned.plan.pages.forEach((page, n) => {
    if (n > 0) page.pageType = page.id
    page.name ??= `Page ${n + 1}`
  })
  return planned
}
/** The order of one plan over a JA Boxing store, from the real writer and pictures steps. */
async function orderOf(store, { plan, profile, copy }) {
  const pictures = await picturesStep({
    plan,
    profile,
    blockStore: store,
    vision: scriptedModel(),
    model: scriptedModel(firstCandidate()),
    copy,
    iconLibrary: iconLibrary()
  })
  const build = () =>
    buildWriteOrder({
      run: { id: 'run-boxing', kind: 'build' },
      aiq: {
        ref: 'ja-boxing/j6@1.0.11',
        blockStore: store,
        template: { slug: 'ja-boxing', version: '1.0.11' }
      },
      approval: { plan: { ...plan, id: 'plan-boxing', revision: 1 }, profile },
      writers: [copy],
      pictures,
      icons: pictures
    })
  return { plan, profile, build, store }
}
// Every block placed once with invented items; and every block with a child list placed with its rows planned by the
// rules (#615 `plan-rows.mjs`), so planned rows reach the order.
async function runsOf(store) {
  const rowsPlan = oneHome(boxingPlan(store))
  return {
    everyBlock: await orderOf(store, oneHome(await everyBlockPlaced(store))),
    withRows: await orderOf(store, {
      ...rowsPlan,
      copy: await writePages({ ...rowsPlan, blockStore: store, model: scriptedWriter(() => 'Calm practice') })
    })
  }
}
const today = await runsOf(declared)
const coming = await runsOf(as584(declared))
const { everyBlock } = today

/** Every declared field instance, enumerated from the declaration (not from the order), with the order's verdict. */
function accountOf(order, { plan, profile, store }) {
  const data = planDataOf(profile)
  const blocks = new Map(store.blocks.map((b) => [b.id, b]))
  const shown = new Set(
    placesOfOrder(order)
      .filter(({ place }) => place.state === 'show')
      .map(({ place }) => place.at)
  )
  const hiddenAt = order.hidden.map((h) => h.at)
  const covered = new Map()
  const add = (place, kind) => covered.set(place, [...(covered.get(place) ?? []), kind])
  for (const { place } of placesOfOrder(order))
    for (const e of place.fields)
      add(e.place, e.from === 'derived' ? 'derived' : e.value !== undefined ? 'value' : `action:${e.action}`)
  for (const p of order.pictures) add(p.frame, `picture:${p.source}`)
  for (const i of order.icons) add(i.id, `icon:${i.source}`)
  const totals = { declared: 0, design: 0, entries: {}, hidden: 0, unexplained: [] }
  for (const page of plan.pages)
    for (const block of page.blocks) {
      const description = blocks.get(block.block)
      const repeating = (description.itemFields ?? []).length > 0 || (description.itemLists ?? []).length > 0
      for (const at of placesOfBlock(page, block, description, data)) {
        if (at.level !== 'block' && at.item !== undefined && !repeating) continue
        for (const field of at.fields) {
          totals.declared += 1
          if (field.type === 'design') {
            totals.design += 1
            continue
          }
          const id = `${at.prefix}.${field.name}`
          const got = covered.get(id) ?? []
          if (shown.has(at.prefix) && got.length === 1)
            totals.entries[got[0]] = (totals.entries[got[0]] ?? 0) + 1
          else if (!shown.has(at.prefix) && got.length === 0 && hiddenAt.some((h) => id.startsWith(`${h}.`)))
            totals.hidden += 1
          else totals.unexplained.push({ id, got })
        }
      }
    }
  return totals
}

/** The declared fields of the order's own places, walked from the order alone. */
const walkedOf = (order) => placesOfOrder(order).reduce((n, { place }) => n + place.declared.length, 0)

for (const [label, run] of [
  ['every block placed', today.everyBlock],
  ['child list rows planned', today.withRows],
  ['every block placed, #584 store', coming.everyBlock],
  ['child list rows planned, #584 store', coming.withRows]
])
  test(`JA Boxing, ${label}: every declared field has exactly one entry or a hidden place, none unexplained`, () => {
    const order = run.build()
    const totals = accountOf(order, run)
    const reasons = {}
    for (const h of order.hidden) reasons[h.reason] = (reasons[h.reason] ?? 0) + 1
    const placed = Object.values(totals.entries).reduce((a, b) => a + b, 0)
    console.log(
      `JA Boxing write order, ${label}: declared ${totals.declared} field instances, design ${totals.design}, ` +
        `in entries ${placed} ${JSON.stringify(totals.entries)}, under hidden places ${totals.hidden}, ` +
        `unexplained ${totals.unexplained.length}; hidden places ${JSON.stringify(reasons)}`
    )
    assert.deepEqual(totals.unexplained, [])
    assert.equal(totals.declared, totals.design + totals.hidden + placed)
    assert.equal(walkedOf(order), totals.declared)
    assert.deepEqual(checkWriteOrder(order), [])
  })

test('removing any one entry is caught by the check and by the account', () => {
  const build = everyBlock.build
  const order = build()
  const block = placesOfOrder(order).find(
    ({ place }) => place.state === 'show' && place.fields.length > 0
  ).place
  const [removed] = block.fields.splice(0, 1)
  assert.deepEqual(
    checkWriteOrder(order).map((p) => [p.code, p.at]),
    [['field_unaccounted', removed.place]]
  )
  assert.deepEqual(accountOf(order, everyBlock).unexplained, [{ id: removed.place, got: [] }])
  const lost = build()
  lost.pictures.splice(0, 1)
  assert.ok(checkWriteOrder(lost).some((p) => p.code === 'field_unaccounted'))
  const twice = build()
  twice.icons.push(twice.icons[0])
  assert.ok(checkWriteOrder(twice).some((p) => p.code === 'field_twice'))
})

test('#584 store: each block-180 row link is the trainer own link N, each label the network of that link', () => {
  const order = coming.withRows.build()
  const block = order.pages.find((p) => p.id === 'block-180').blocks[0]
  const rows = block.lists.find((g) => g.list === 'social').rows.filter((r) => r.state === 'show')
  const data = planDataOf(coming.withRows.profile)
  const planned = coming.withRows.plan.pages.find((p) => p.id === 'block-180').blocks[0].lists[0].rows
  assert.equal(rows.length, 4)
  assert.deepEqual(
    rows.map((r) => {
      const link = r.fields.find((e) => e.field === 'link')
      const name = r.fields.find((e) => e.field === 'label')
      return [link.data, link.value, name.from, name.value]
    }),
    planned.slice(0, 4).map((row, n) => {
      const value = data.rowsById.get(row.data).values['person.social_url'][0]
      return [row.data, value, 'data', ['Instagram', 'Facebook', 'YouTube', 'X'][n]]
    })
  )
  assert.ok(rows.every((r) => r.fields.find((e) => e.field === 'link').value.includes('coach-1-invented')))
})
