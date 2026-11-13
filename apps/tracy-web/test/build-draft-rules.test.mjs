// The pure rules of the pre site build draft (#603): what a draft accepts and how its one step of undo is made.
// The sample plan is the invented tennis club of the Contract B fixtures (#590).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkPlanEdit } from 'website-opportunities/domain'
import { answerProblem, planProblem, readTemplate, undoEditOf } from '../src/build-draft/rules.js'

const scenario = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/wo/website-opportunities/test/fixtures/build-contract/sunrise-tennis-club.build-scenario.json',
      import.meta.url
    ),
    'utf8'
  )
)
const plan = scenario.plan
const edit = scenario.edits[0]

test('a template is {slug, name, version}, each a non-empty text, and nothing else is kept', () => {
  assert.deepEqual(
    readTemplate({ slug: 'example-sports-template', name: 'Example Sports', version: '1.0.0', x: 1 }),
    {
      slug: 'example-sports-template',
      name: 'Example Sports',
      version: '1.0.0'
    }
  )
  for (const bad of [null, 'example', { slug: 'a', name: 'b' }, { slug: ' ', name: 'b', version: '1' }])
    assert.equal(readTemplate(bad), null)
})

test('an answer is checked against its question with the Contract B check', () => {
  const [question] = scenario.questions
  assert.equal(answerProblem(question, scenario.answers[0]), null)
  const wrong = answerProblem(question, {
    schema: 'tracy-build-answer/v1',
    question: question.id,
    choice: 'nope'
  })
  assert.ok(wrong.length > 0)
  assert.ok(answerProblem({ schema: 'tracy-build-question/v1', id: 'x' }, scenario.answers[0]).length > 0)
})

test('a plan is checked with the Contract B plan check', () => {
  assert.equal(planProblem(plan), null)
  assert.ok(planProblem({ ...plan, look: undefined }).length > 0)
  assert.ok(planProblem({ ...plan, schema: 'something-else' }).length > 0)
})

test('the undo of an edit is itself a Contract B plan edit that puts back the previous values', () => {
  const applied = checkPlanEdit(edit, plan)
  assert.equal(applied.ok, true)
  const undo = undoEditOf(plan, edit)
  assert.deepEqual(undo, {
    schema: 'tracy-build-plan-edit/v1',
    id: `undo-${edit.id}`,
    plan: { id: plan.id, revision: plan.revision + 1 },
    changes: [{ field: 'items[s2].label', value: 'Junior squad' }]
  })
  const undone = checkPlanEdit(undo, applied.plan)
  assert.equal(undone.ok, true)
  const { revision, ...rest } = undone.plan
  const { revision: was, ...before } = plan
  assert.deepEqual(rest, before, 'every value is back as it was')
  assert.equal(revision, was + 2, 'the revision keeps rising, so no revision names two plans')
})
