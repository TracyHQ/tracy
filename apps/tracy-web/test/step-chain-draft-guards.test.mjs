// The guards of a step chain run built from a build draft (#597): what the owner keeps off the site never reaches a
// model call or the write order, even when the stored plan still shows it; a write order that fails its check and a
// placed picture with no usable alt text each stop the build with their own code. The invented florist, fakes only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-guards.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAGE_WRITER_PROMPT } from 'website-opportunities/domain/page-writer.mjs'
import { setUp } from './step-chain-draft-harness.mjs'
import { HELD_NAME, HELD_PERSON, fakeBuildModel, heldIn } from './step-chain-draft-fixtures.mjs'

test('held data in every form of the stored profile and plan never reaches any model call nor the write order', async () => {
  const { engine, ctx, draft, model } = await setUp({ heldInPlan: true })
  // The stored draft really carries it: a fact, a review quoting the name, reviews by the held person, `withheld`,
  // and the plan shows them.
  const stored = draft.engine.needsProfile
  assert.deepEqual(stored.withheld.names, [HELD_NAME])
  assert.deepEqual(stored.withheld.people, [HELD_PERSON])
  assert.deepEqual(heldIn(stored.facts), [HELD_NAME])
  assert.deepEqual(heldIn(stored.items.quote).sort(), [HELD_NAME, HELD_PERSON].sort())
  const shown = draft.approved.plan.pages.flatMap((pg) => pg.blocks.flatMap((b) => b.data))
  const heldIds = [...stored.items.quote.filter((q) => heldIn(q).length).map((q) => q.id), 'business-story']
  assert.equal(heldIds.length, 4)
  for (const id of heldIds) assert.ok(shown.includes(id), id)
  const run = await engine.prepare(ctx)
  // Every request of every step: the writer, the picture labelling and the icon ranking.
  const kinds = new Set(
    model.requests.map((r) =>
      r.images?.length ? 'vision' : r.system === PAGE_WRITER_PROMPT ? 'writer' : 'icons'
    )
  )
  assert.deepEqual([...kinds].sort(), ['icons', 'vision', 'writer'])
  for (const request of model.requests) assert.deepEqual(heldIn(request), [], request.system?.slice(0, 40))
  // Every value of the write order, every alt text with it.
  const { order } = run.inputs.order
  assert.deepEqual(heldIn(order), [])
  for (const p of order.pictures) assert.deepEqual(heldIn(p.alt ?? ''), [], p.frame)
  // Nor what the copy and pictures steps hand on.
  assert.deepEqual(heldIn(run.inputs.copy.pages), [])
  assert.deepEqual(heldIn(run.inputs.pictures.frames), [])
})

/** The inputs of a finished assembled run, to call its `order` step again with one of them changed. */
async function finished() {
  const { engine, steps, ctx } = await setUp({ model: fakeBuildModel() })
  const run = await engine.prepare(ctx)
  return { steps, ctx, inputs: structuredClone(run.inputs) }
}

test('a write order that fails its check stops the order step with the problems listed, never re-run', async () => {
  const { steps, ctx, inputs } = await finished()
  const page = inputs.copy.pages[0]
  const written = page.fields.find((f) => f.from === 'writer')
  page.fields.push({ ...written, key: `${written.key}-ghost`, field: 'ghost-field' })
  const error = await steps.order(ctx, inputs, {}).catch((e) => e)
  assert.equal(error.code, 'write_order_check_failed')
  assert.equal(error.noRerun, true)
  assert.deepEqual(
    error.details.problems.map((p) => p.code),
    ['entry_unplaced']
  )
})

test('a placed picture left with no alt text stops the order step with alt_text_unusable', async () => {
  const { steps, ctx, inputs } = await finished()
  inputs.pictures.profile.facts['business.name'] = []
  for (const g of inputs.pictures.profile.items.gallery) g.label = null
  for (const f of inputs.pictures.frames) f.label = null
  const error = await steps.order(ctx, inputs, {}).catch((e) => e)
  assert.equal(error.code, 'alt_text_unusable')
  assert.equal(error.noRerun, true)
  assert.ok(error.details.problems.every((p) => p.code === 'alt_text_missing'))
})
