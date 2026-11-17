// A customer's answer fits the template's fields (ticket #615): the main button question offers no choice longer than
// the template's button field holds, and the gate reports an answer too long as a problem, never a silent drop. Since
// 16/11 a typed answer is read by the model (`answer-reading.mjs`): its box is not capped by the template and it is
// never rejected for its length before the model. The invented pottery template (button label of 18 characters); no
// real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-answer-field-limits.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kindLimitsOf, storeBlocksOf } from '../domain/answer-field-limits.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { ANSWER_SOURCE, settleAnswers } from '../domain/plan-answers.mjs'
import { answerOverLimitProblems, dropOverLimitData } from '../domain/plan-data-limits.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { pottery, potteryProfile, potteryStore } from './fixtures/child-lists/invented-pottery.mjs'

const answer = (question, fields) => ({ schema: 'tracy-build-answer/v1', question, ...fields })
const mainButton = (profile) => profile.questions.find((q) => q.topic === 'main-button')

test('with the template known, the main button question offers what its button field holds', () => {
  const { research, reading } = pottery()
  // A typed answer is an owner statement the model reads: only the transport bound, with or without a template.
  assert.equal(mainButton(needsProfileOf(research, reading)).freeText.maxLength, 1000)
  const question = mainButton(needsProfileOf(research, reading, { blockStore: potteryStore() }))
  assert.equal(question.freeText.maxLength, 1000)
  assert.ok(question.choices.length > 0)
  for (const choice of question.choices) assert.ok([...choice.label].length <= 18, choice.label)
})

test('the answer settling rejects a value longer than the template field of its kind, naming the limit', async () => {
  // A typed main button answer is an owner statement, not the label: no limit applies to it.
  const typed = answer('main-button', { text: 'Book your first pottery class' })
  const settled = settleAnswers(potteryProfile(), [typed], kindLimitsOf(storeBlocksOf(potteryStore())))
  assert.equal(settled.profile.facts['contact.cta_label'], undefined)
  assert.equal(settled.profile.ownerFacts.at(-1).text, 'Book your first pottery class')
  // A typed contact detail is held to the fields of its own kind: an invented store with a short email field.
  const store = potteryStore()
  store.blocks[0].fields.push({
    name: 'email',
    kind: 'contact.email',
    type: 'text',
    limit: 20,
    slot: 'invented.email'
  })
  const limits = kindLimitsOf(storeBlocksOf(store))
  const profile = { ...potteryProfile(), facts: {} }
  profile.questions = needsProfileOf(pottery().research, { ...pottery().reading, facts: [] }).questions
  const contact = profile.questions.find((q) => q.topic === 'contact-method')
  // A typed contact answer is read by the model (`answer-reading.mjs`), never held to the field before it: unread, it
  // writes nothing and stops nothing; read, its value is written and the plan gate judges its length.
  const long = answer(contact.id, { text: 'bookings@kilnmere-studio.example' })
  assert.equal(settleAnswers(profile, [long], limits).profile.facts['contact.email'], undefined)
  const read = new Map([
    [
      contact.id,
      { facts: [{ kind: 'contact.email', value: 'bookings@kilnmere-studio.example', primary: false }] }
    ]
  ])
  assert.equal(
    settleAnswers(profile, [long], limits, read).profile.facts['contact.email'][0].value,
    'bookings@kilnmere-studio.example'
  )
})

test('the gate reports an answer longer than its field as a problem, never a silent drop', () => {
  const profile = potteryProfile()
  profile.facts['contact.cta_label'] = [{ value: 'Book your first pottery class', sources: [ANSWER_SOURCE] }]
  profile.sources = [...profile.sources, { id: ANSWER_SOURCE, origin: 'answer' }]
  const data = planDataOf(profile)
  const id = [...data.byId].find(([, e]) => e.kind === 'contact.cta_label')[0]
  const pages = [{ id: 'home', blocks: [{ id: 'top', type: 'header', block: 'header-main', data: [id] }] }]
  const limited = dropOverLimitData(pages, blocksOf(potteryStore()), data)
  assert.deepEqual(
    answerOverLimitProblems(limited.dropped).map((p) => [p.code, p.at]),
    [['answer_over_limit', 'pages[home].blocks[top].data']]
  )
})
