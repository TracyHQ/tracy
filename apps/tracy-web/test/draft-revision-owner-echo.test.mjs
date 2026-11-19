// The owner echo guard in a revision run (#599, D46): what the owner typed in the build chat never comes back word for
// word in a block the revision writes again. A writer that copies the owner's sentence into the renamed service's row
// is sent back once, and still copying, the revision stops `copy_check_failed` before any door; the same revision
// with a writer that does not copy runs. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-owner-echo.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revisedBy, SERVICE } from './draft-revision-edits.mjs'
import { blankSite, draftOf, revisionModel, runBuild, stepsOf } from './draft-revision-fixtures.mjs'

const STATEMENT = 'We cut every stem ourselves at dawn on the hill behind the shop.'
const ECHOED = `classes-b4/${SERVICE}/paragraph`

/** The florist's draft at a revision, with what the owner typed in the build chat. */
const withStatement = (revised) => {
  const draft = draftOf(revised)
  draft.engine.research.description = STATEMENT
  return draft
}

async function revise(model) {
  const memory = blankSite()
  const builds = new Map()
  const draft = withStatement(undefined)
  const first = await runBuild({
    steps: stepsOf({ draft, model: revisionModel(), memory, builds }),
    plan: draft.approved.plan
  })
  const revised = revisedBy('rename a service')
  const calls = memory.calls
  const out = await runBuild({
    steps: stepsOf({ draft: withStatement(revised), model, memory, builds }),
    plan: revised.plan,
    runId: 'run-larkspur-2',
    rebuildFrom: first.write.build.ref
  }).catch((error) => ({ error }))
  return { out, writes: memory.calls - calls }
}

test('a rewritten block that copies the owner sentence is given back and listed; the owner words reach no door', async () => {
  const model = revisionModel({
    leak: (page, key) => (page === 'classes' && key === ECHOED ? STATEMENT : null)
  })
  const { out } = await revise(model)
  assert.equal(out.write?.report.status, 'done', out.error?.code)
  const skipped = out.copy.skippedItems.find((f) => f.place === `classes:${ECHOED}`)
  assert.ok(skipped, 'the copying row is named')
  assert.equal(skipped.reason, 'copies_owner')
  assert.equal(model.pages.classes, 2, 'sent back once')
  assert.ok(!JSON.stringify(out.write.plan.ops).includes('hill behind'))
})

test('the same revision with a writer that does not copy the owner runs', async () => {
  const { out } = await revise(revisionModel())
  assert.equal(out.write?.report.status, 'done', out.error?.code)
})
