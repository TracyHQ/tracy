// The build chat's sample scenarios (#604): every stage the chat renders is a slice of a Contract B scenario,
// and every slice still passes the Contract B check of #590. A later ticket adds a stage to `STAGES` and its
// expected screen; this test then holds the new stage to the contract without any change here.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkBuildDocument,
  checkBuildScenario
} from '../../../wo/website-opportunities/domain/build-contract.mjs'
import { STAGE_NAMES, STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

test('the stages cover every moment of the build chat named in #578', () => {
  assert.deepEqual(STAGE_NAMES, [
    'research',
    'questions',
    'template-choice',
    'plan',
    'plan-edit-undo',
    'building',
    'done',
    'could-not-finish',
    'stopped-without-rerun',
    'cancelled',
    'rebuild'
  ])
  assert.deepEqual(
    STAGES.map((s) => s.name),
    STAGE_NAMES
  )
})

for (const stage of STAGES) {
  test(`stage ${stage.name}: what the chat has received so far passes the Contract B check`, () => {
    const docs = stageDocuments(stage)
    if (docs.scenario) {
      const res = checkBuildScenario(docs.scenario)
      assert.deepEqual(res.problems, [], `${stage.name}: ${JSON.stringify(res.problems)}`)
    }
    for (const doc of docs.loose) {
      const res = checkBuildDocument(doc)
      assert.deepEqual(res.problems, [], `${stage.name}: ${JSON.stringify(res.problems)}`)
    }
  })
}

test('the plan carries a look section, a pictures summary, assumptions and a reason per block', () => {
  const plan = stageDocuments(STAGES.find((s) => s.name === 'template-choice')).scenario.plan
  assert.equal(plan.look.template.name, 'JA Boxing')
  assert.ok(plan.pictures.own.frames > 0 && plan.pictures.generated.frames <= 6)
  assert.ok(plan.assumptions.length > 0)
  for (const page of plan.pages) for (const block of page.blocks) assert.ok(block.reason.length > 0, block.id)
})

test('no run has a site check step, and done follows the write step', () => {
  for (const stage of STAGES) {
    for (const run of stageDocuments(stage).scenario?.runs ?? []) {
      const steps = (run.outcome ?? run.events.at(-1)).steps
      assert.ok(!steps.some((s) => s.kind === 'site-check'), stage.name)
      assert.equal(steps.at(-1).kind, 'write', stage.name)
      if (run.outcome?.result === 'done')
        assert.ok(
          steps.every((s) => s.state === 'done'),
          stage.name
        )
    }
  }
})

test('the edited value is undone before the build, so the build runs the plan as composed', () => {
  const { scenario } = stageDocuments(STAGES.find((s) => s.name === 'plan-edit-undo'))
  assert.deepEqual(
    scenario.edits.map((e) => e.changes[0]),
    [
      { field: 'facts[tagline].value', value: 'Tennis for every age' },
      { field: 'facts[tagline].value', value: 'Tennis for every age and level' }
    ]
  )
})
