// Child list rows through the page writer and the icon step (ticket #615): an invented pottery studio, a scripted
// fake writer and a scripted fake ranking model; no real model. The real JA Boxing store: `domain-child-lists-boxing`.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-writer.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf, picturesStep } from '../domain/picture-step.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { declaredRowFieldsOf, rowFieldAccountOf } from '../domain/plan-row-coverage.mjs'
import { composeInputs, HAND, ODILE, potteryStore, WHEEL } from './fixtures/child-lists/invented-pottery.mjs'
import { firstCandidate, scriptedModel, scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

const writer = () => scriptedWriter((key) => (key.includes('tip') ? 'Press firmly' : 'Calm practice'))
const icons = () => ({
  set: '@phosphor-icons/core@2.1.1',
  icons: [
    { name: 'hand-grabbing', tags: ['wedge', 'clay', 'press'], categories: [] },
    { name: 'circle-notch', tags: ['center', 'spin'], categories: [] },
    { name: 'leaf', tags: ['tea', 'plants'], categories: [] }
  ]
})

async function writtenPottery() {
  const { plan, profile } = await composePlan(composeInputs())
  const model = writer()
  const copy = await writePages({ plan, profile, blockStore: potteryStore(), model })
  return { plan, profile, copy, model }
}
const entry = (copy, key) => copy.pages.flatMap((p) => p.fields).find((f) => f.key === key)

test('the writer reports every declared field of every planned row, row N of the business in place N', async () => {
  const { plan, profile, copy, model } = await writtenPottery()
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid').id
  const at = (item, row, field) => entry(copy, `${grid}/${item}/${row}/${field}`)
  const pick = (f) => [f.from, f.value ?? f.action]
  assert.deepEqual(pick(at(WHEEL, 'sessions.1', 'days')), ['data', 'Tue and Thu'])
  assert.deepEqual(pick(at(WHEEL, 'sessions.1', 'times')), ['data', '18:00 to 20:00'])
  assert.deepEqual(pick(at(WHEEL, 'sessions.2', 'days')), ['data', 'Sat'])
  assert.deepEqual(pick(at(WHEEL, 'sessions.2', 'times')), ['data', '10:00 to 12:00'])
  assert.deepEqual(pick(at(HAND, 'sessions.1', 'days')), ['data', 'Wed'])
  assert.deepEqual(pick(at(WHEEL, 'steps.1', 'step')), ['data', 'Wedge the clay'])
  assert.deepEqual(pick(at(WHEEL, 'steps.2', 'step')), ['data', 'Center on the wheel'])
  assert.deepEqual(pick(at(WHEEL, 'steps.1', 'icon')), ['no-data', 'pictures'])
  assert.deepEqual(pick(at(WHEEL, 'steps.1.tips.1', 'tip')), ['writer', 'Press firmly'])
  assert.equal(at(WHEEL, 'steps.2.tips.1', 'tip'), undefined)
  const team = plan.pages[1].blocks[0].id
  assert.deepEqual(
    [1, 2].map((n) => pick(entry(copy, `${team}/${ODILE}/links.${n}/link`))),
    [
      ['data', 'https://instagram.com/kilnmere.odile'],
      ['data', 'https://youtube.com/@odile-throws']
    ]
  )
  assert.deepEqual(pick(entry(copy, `${team}/${ODILE}/links.1/network-icon`)), ['no-data', 'network'])
  const footer = plan.pages[0].blocks.find((b) => b.block === 'footer-main').id
  assert.deepEqual(pick(entry(copy, `${footer}/hours.2/line`)), ['data', 'Sat 09:00 to 17:00'])
  // The model writes the tip from its row's data, read as context; it never writes a data field.
  const home = JSON.parse(model.calls.find((c) => JSON.parse(c.user).page.id === 'home').user)
  const block = home.blocks.find((b) => b.id === grid)
  assert.deepEqual(
    block.fields.filter((f) => f.row).map((f) => f.key),
    [`${grid}/${WHEEL}/steps.1.tips.1/tip`]
  )
  assert.ok(block.rows.some((r) => r.fields['step.description']?.[0] === 'pressing out every air pocket'))
  // Held to the declaration: every field of every planned row has a decision, none unexplained.
  const declared = declaredRowFieldsOf(plan.pages, blocksOf(potteryStore()), planDataOf(profile))
  const account = rowFieldAccountOf(declared, copy)
  console.log(
    `pottery child list fields: declared ${account.declared} (stored ${account.stored}), decisions ${JSON.stringify(account.decisions)}`
  )
  assert.deepEqual([account.unexplained, account.extra], [[], []])
  assert.equal(account.decided, account.declared)
})

test('with written row text the icon step chooses row icons instead of icon_words_missing', async () => {
  const { plan, profile, copy } = await writtenPottery()
  const step = (written) =>
    picturesStep({
      plan,
      profile,
      blockStore: potteryStore(),
      vision: scriptedModel(),
      model: scriptedModel(firstCandidate()),
      copy: written,
      iconLibrary: icons()
    })
  const id = (n) => `home.${plan.pages[0].blocks[1].id}.${WHEEL}.steps.${n}.icon`
  const rowless = { pages: copy.pages.map((p) => ({ ...p, fields: p.fields.filter((f) => !f.row) })) }
  const before = (await step(rowless)).icons.filter((i) => [id(1), id(2)].includes(i.id))
  assert.deepEqual(
    before.map((i) => i.reason),
    ['icon_words_missing', 'icon_words_missing']
  )
  const after = (await step(copy)).icons.filter((i) => [id(1), id(2)].includes(i.id))
  console.log(
    `row icons: ${after.map((i) => `${i.id} -> ${i.source} ${i.icon?.name ?? i.name ?? i.reason}`).join('; ')}`
  )
  assert.deepEqual(
    after.map((i) => i.source),
    ['library', 'library']
  )
})
