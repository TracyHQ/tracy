// The page writer and the step chain (#597): the main button label the customer answered is kept word for word (a
// `data` field, never asked of the model), a label nobody answered stays copy, and a page that fails its own rewrite
// stops the build at once (`noRerun`) with the attempts it made. Invented club, scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-page-writer-answered.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { PageWriterError, writePages } from '../domain/page-writer.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

// Two spaces and a mark the model would tidy away: the answer must reach the site exactly as typed.
const ANSWERED = 'Reserve  a court!'
const WRITTEN = 'Book now'

/** The club's plan with the main button label on the top bar; `answer` is the customer's typed label, if any. */
async function planWithButton(answer) {
  const composition = goodComposition()
  const header = composition.pages[0].blocks.find((b) => b.block === 'header-main')
  if (answer) header.data = [...header.data, 'contact-cta-label']
  const answers = answer ? [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: answer }] : []
  const { plan, profile } = await composePlan({
    profile: clubProfile(),
    answers,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(composition))
  })
  return { plan, profile }
}

/** A scripted writer that answers every asked field with a fitting value; the button label with `WRITTEN`. */
function writer(override = () => undefined) {
  const calls = []
  const model = async (request) => {
    calls.push(JSON.parse(request.user))
    const fields = {}
    for (const block of calls.at(-1).blocks)
      for (const field of block.fields)
        fields[field.key] =
          override(field) ??
          (field.kind === 'contact.cta_label' ? WRITTEN : `${field.name} ok`.slice(0, field.limit))
    return JSON.stringify({ fields })
  }
  model.calls = calls
  return model
}

const asked = (model) => model.calls.flatMap((c) => c.blocks.flatMap((b) => b.fields.map((f) => f.key)))

test('the main button label the customer answered is a data field with that exact value', async () => {
  const { plan, profile } = await planWithButton(ANSWERED)
  const model = writer()
  const { pages } = await writePages({ plan, profile, blockStore: blockStore(), library: library(), model })
  const header = plan.pages[0].blocks.find((b) => b.block === 'header-main')
  const label = pages[0].fields.find((f) => f.key === `${header.id}/cta_label`)
  assert.deepEqual(
    { from: label.from, value: label.value, data: label.data, kind: label.kind },
    { from: 'data', value: ANSWERED, data: 'contact-cta-label', kind: 'contact.cta_label' }
  )
  assert.ok(!asked(model).includes(label.key), 'the model is never asked for the answered label')
})

test('a main button label nobody answered stays copy, written by the model', async () => {
  const { plan, profile } = await planWithButton(null)
  const model = writer()
  const { pages } = await writePages({ plan, profile, blockStore: blockStore(), library: library(), model })
  const header = plan.pages[0].blocks.find((b) => b.block === 'header-main')
  const label = pages[0].fields.find((f) => f.key === `${header.id}/cta_label`)
  assert.deepEqual([label.from, label.value], ['writer', WRITTEN])
  assert.ok(asked(model).includes(label.key))
})

test('a label the customer answered but the block does not show stays copy', async () => {
  const { plan, profile } = await planWithButton(ANSWERED)
  const header = plan.pages[0].blocks.find((b) => b.block === 'header-main')
  header.data = header.data.filter((id) => id !== 'contact-cta-label')
  const { pages } = await writePages({
    plan,
    profile,
    blockStore: blockStore(),
    library: library(),
    model: writer()
  })
  assert.equal(pages[0].fields.find((f) => f.key === `${header.id}/cta_label`).from, 'writer')
})

test('a page that fails its own rewrite throws noRerun with the two attempts it made', async () => {
  const { plan, profile } = await planWithButton(null)
  const team = plan.pages.find((p) => p.id === 'team')
  const model = writer((f) => (f.key === 'team-b1/heading' ? 'y'.repeat(31) : undefined))
  await assert.rejects(
    writePages({
      plan: { ...plan, pages: [team] },
      profile,
      blockStore: blockStore(),
      library: library(),
      model
    }),
    (error) => {
      assert.ok(error instanceof PageWriterError)
      assert.deepEqual([error.code, error.noRerun, error.details.attempts], ['copy_check_failed', true, 2])
      return true
    }
  )
  assert.equal(model.calls.length, 2, 'one page, one writing and one rewrite')
})

test('a deterministic writer failure before any call is not marked noRerun', async () => {
  const error = await writePages({
    plan: { pages: [] },
    profile: clubProfile(),
    blockStore: blockStore(),
    model: writer()
  }).catch((e) => e)
  assert.equal(error.code, 'plan_missing')
  assert.equal(error.noRerun, undefined)
})
