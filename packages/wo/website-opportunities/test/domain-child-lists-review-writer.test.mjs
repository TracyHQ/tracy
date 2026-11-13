// Child list rows, review findings on the writer side and Contract B (ticket #615): a row's copy never carries another
// row's data, a data value too long for its field never reaches the writer, every field is written within the smallest
// limit of the stored places it shares, and the plan's lists are held to their shape. An invented pottery studio and a
// scripted fake writer; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-review-writer.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { fieldValueProblems } from '../domain/page-copy-check.mjs'
import { pageFieldsOf } from '../domain/page-writer-fields.mjs'
import { foreignValuesOf } from '../domain/page-writer-rows.mjs'
import { placeLimitsOf } from '../domain/field-place-limits.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  composeInputs,
  HAND,
  pottery,
  potteryStore,
  WHEEL
} from './fixtures/child-lists/invented-pottery.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

const TIP = (grid) => `${grid}/${WHEEL}/steps.1.tips.1/tip`

test('a row copy field may name the data of a row of ANOTHER list: only its own list is checked', async () => {
  const { plan, profile } = await composePlan(composeInputs())
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid').id
  // The tip of the first step names the times of a session: a session is not a tip, so this is no other row's data.
  const model = scriptedWriter((key) => (key === TIP(grid) ? 'Sat 10:00 to 12:00' : 'Calm practice'))
  const copy = await writePages({ plan, profile, blockStore: potteryStore(), model })
  assert.equal(copy.pages[0].fields.find((f) => f.key === TIP(grid)).value, 'Sat 10:00 to 12:00')
})

test('only the OTHER rows of the same list instance count, and only values with a digit, a link or an email', () => {
  const record = (id, values, parent = null) => [id, { id, owner: 'service-x', parent, values, rows: [] }]
  const data = {
    rowsById: new Map([
      record('step-1', { 'step.title': ['Throw the pot'] }),
      record('step-1-tip', { 'step.description': ['Keep it wet'] }, 'step-1'),
      record('step-1-tip-2', { 'step.description': ['Rest it 10 minutes'] }, 'step-1'),
      record('step-2', { 'step.title': ['Glaze'] }),
      record('step-2-tip', { 'step.description': ['Dry it 2 days'] }, 'step-2'),
      record('session-1', { 'offering.schedule': ['Mon', '10:00 to 12:00'] }),
      record('session-2', { 'offering.schedule': ['Sat', '09:00 to 11:00'] }),
      record('session-b', { 'offering.schedule': ['Sun', '09:00 to 11:00'] }),
      record('session-c', { 'offering.schedule': ['Tue', '18:00 to 20:00'] })
    ])
  }
  // One page: block b1 item WHEEL lists steps (each with tips) and sessions; item HAND lists sessions; block b2 too.
  const row = (block, item, list, row, rowData) => ({ block, item, list, row, rowData, from: 'writer' })
  const fields = [
    row('b1', WHEEL, 'steps', 'steps.1', 'step-1'),
    row('b1', WHEEL, 'tips', 'steps.1.tips.1', 'step-1-tip'),
    row('b1', WHEEL, 'tips', 'steps.1.tips.2', 'step-1-tip-2'),
    row('b1', WHEEL, 'steps', 'steps.2', 'step-2'),
    row('b1', WHEEL, 'tips', 'steps.2.tips.1', 'step-2-tip'),
    row('b1', WHEEL, 'sessions', 'sessions.1', 'session-1'),
    row('b1', WHEEL, 'sessions', 'sessions.2', 'session-2'),
    row('b1', HAND, 'sessions', 'sessions.1', 'session-b'),
    row('b2', WHEEL, 'sessions', 'sessions.1', 'session-c'),
    { block: 'b1', key: 'b1/title', from: 'writer' }
  ]
  const foreign = (i) => foreignValuesOf(fields[i], fields, data)
  // A tip against the other tips of the SAME step only: never the tips of another step.
  assert.deepEqual(foreign(1), ['Rest it 10 minutes'])
  assert.deepEqual(foreign(4), [])
  // A session against the other sessions of the same item's list: their times, never a plain day name.
  assert.deepEqual(foreign(6), ['10:00 to 12:00'])
  // The same times held by another item's list, or by a list of another block, are not this list's.
  assert.deepEqual(foreign(7), [])
  assert.deepEqual(foreign(8), [])
  // A field outside a row has no foreign values.
  assert.deepEqual(foreign(9), [])
  const field = { name: 'tip', type: 'text', kind: 'step.description', limit: 60 }
  const codes = (value, i) => fieldValueProblems(field, value, { foreign: foreign(i) }).map((p) => p.code)
  // A time from a sibling row of the same list still fails ...
  assert.deepEqual(codes('Mon 10:00 to 12:00', 6), ['other_row_data'])
  assert.deepEqual(codes('Rest it 10 minutes after', 1), ['other_row_data'])
  // ... the same time held by a row of another item's list, or of another block, passes.
  assert.deepEqual(codes('Sat 09:00 to 11:00', 7), [])
  assert.deepEqual(codes('Sun 09:00 to 11:00', 8), [])
  assert.deepEqual(codes('Rest it 10 minutes after', 4), [])
  // A phrase of words alone is never data: another step's title may be used freely.
  assert.deepEqual(foreign(3), [])
  assert.match(
    fieldValueProblems(field, 'Rest it 10 minutes after', { foreign: foreign(1) }).at(-1).message,
    /belongs to another row/
  )
})

test('a row value too long for its field is left out by the plan, so the writer never stops on it', async () => {
  const { research, reading } = pottery()
  research.sources[0].text += ' Thu, 18:00 to 20:30 with a long cooldown.'
  reading.items[1].rows = [
    {
      fields: { 'offering.schedule': ['Thu', '18:00 to 20:30 with a long cooldown'] },
      evidence: 'Thu, 18:00 to 20:30 with a long cooldown'
    }
  ]
  const profile = needsProfileOf(research, reading)
  const { plan } = await composePlan(composeInputs(profile))
  const copy = await writePages({
    plan,
    profile,
    blockStore: potteryStore(),
    model: scriptedWriter(() => 'Calm')
  })
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid').id
  // The plan holds no session row for Hand building, so its session places stay empty (no writer entry at all).
  assert.deepEqual(
    plan.pages[0].blocks
      .find((b) => b.id === grid)
      .lists.find((l) => l.item === HAND && l.name === 'sessions').rows,
    []
  )
  assert.deepEqual(
    copy.pages[0].fields.filter((f) => f.item === HAND && f.list === 'sessions'),
    []
  )
})

test('block and item fields are written within the smallest limit of a stored place they share, by place', async () => {
  const store = potteryStore()
  const grid = store.blocks.find((b) => b.id === 'services-grid')
  const name = grid.itemFields.find((f) => f.type === 'text')
  // An invented second block writing the same stored places as the card names, with a smaller limit.
  const places = Array.isArray(name.slots) ? name.slots : [name.slot]
  store.blocks.push({
    ...structuredClone(grid),
    id: 'services-mini',
    itemFields: [{ ...name, limit: 12, slots: places }],
    itemLists: undefined
  })
  const limits = placeLimitsOf(store.blocks)
  const { plan, profile } = await composePlan(composeInputs())
  const blocks = new Map(store.blocks.map((b) => [b.id, b]))
  const data = planDataOf(profile)
  const fields = pageFieldsOf(plan.pages[0], { blocks, byId: data.byId, data, placeLimits: limits })
  const card = fields.find((f) => f.item === WHEEL && f.field.name === name.name)
  assert.equal(card.field.limit, Math.min(12, name.limit))
  // Two lists of one block with fields of the same name keep their own limits: places, not names, are shared.
  const steps = fields.find((f) => f.row === 'steps.1' && f.field.name === 'step')
  assert.equal(steps.field.limit, 24)
})

test('Contract B: a list name is length limited and a list item names an item, never a fact', async () => {
  const { plan } = await composePlan(composeInputs())
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid')
  const messages = (p) => checkBuildDocument(p).problems.map((x) => `${x.at}: ${x.message}`)
  const long = structuredClone(plan)
  long.pages[0].blocks.find((b) => b.id === grid.id).lists[0].name = 'x'.repeat(65)
  assert.match(messages(long).join('\n'), /lists\[0\]\.name: at most 64 characters/)
  const fact = structuredClone(plan)
  const block = fact.pages[0].blocks.find((b) => b.id === grid.id)
  block.data.push('contact-phone')
  block.lists[0].item = 'contact-phone'
  assert.match(messages(fact).join('\n'), /lists\[0\]\.item: "contact-phone" is not an item of the plan/)
})
