// The copy step of a draft run holds every written word to what the owner typed in the build chat (decision D46,
// #609): the research record's `description` reaches the writer's owner echo check. A writer whose words copy the
// statement is asked once for other words, then the run stops typed (`copy_check_failed`, noRerun, `copies_owner`).
// The invented florist of the revision tests; no model.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-owner-statement.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blankSite, draftOf, revisionModel, runBuild, stepsOf } from './draft-revision-fixtures.mjs'

/** The florist's draft with what the owner typed beside its research. */
function draftWith(description) {
  const draft = draftOf()
  draft.engine = { ...draft.engine, research: { ...draft.engine.research, description } }
  return draft
}

test('a statement the writer copies is rewritten once, then given back and listed; one it does not copy passes', async () => {
  const first = await runBuild({
    steps: stepsOf({ draft: draftOf(), model: revisionModel(), memory: blankSite() }),
    plan: draftOf().approved.plan
  })
  const long = first.copy.pages
    .flatMap((p) => p.fields)
    .find((f) => f.from === 'writer' && String(f.value).split(' ').length >= 6)
  assert.ok(long, 'a written value of six words or more')
  const statement = `${long.value}.`
  // Asked for other words, the writer gives new ones: the page is written twice and the run goes on.
  const again = revisionModel()
  await runBuild({
    steps: stepsOf({ draft: draftWith(statement), model: again, memory: blankSite() }),
    plan: draftOf().approved.plan
  })
  assert.equal(again.pages[long.key.split('-')[0]], 2, 'the first writing and one rewrite')
  // A writer that keeps the owner's words: after that one rewrite the field is given back and listed (#575), and the
  // owner's words are written nowhere.
  const stuck = revisionModel({ fixed: new Map([[long.key, long.value]]) })
  const built = await runBuild({
    steps: stepsOf({ draft: draftWith(statement), model: stuck, memory: blankSite() }),
    plan: draftOf().approved.plan
  })
  assert.deepEqual(built.copy.skippedItems, [
    { code: 'copy_check_failed', op: null, place: `home:${long.key}`, reason: 'copies_owner', at: 'copy' }
  ])
  const field = built.copy.pages.flatMap((p) => p.fields).find((f) => f.key === long.key)
  assert.equal(field.from, 'no-data')
  const quiet = await runBuild({
    steps: stepsOf({
      draft: draftWith('We tie flowers by hand in a small shop.'),
      model: revisionModel(),
      memory: blankSite()
    }),
    plan: draftOf().approved.plan
  })
  assert.equal(quiet.copy.pages.length, first.copy.pages.length)
})
