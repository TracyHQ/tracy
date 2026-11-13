/**
 * An icon selection failure of the pictures step (#595) follows the stop and report rule (ADR 0047, #591): the step
 * chain runs the pictures step again once from the same inputs, and a second failure stops the build with a report
 * naming the `pictures` step and the typed code. On this path an unusable ranker is a failure, never "the shortlist
 * order decides". No database: the engine's `prepare` runs with step doubles; the pictures step is the real domain step
 * with the real icon library (Phosphor) and a scripted fake build model over an invented dental practice.
 *
 * The written copy is the REAL page writer's output (`writePages`, a scripted writer), handed to the pictures step as
 * the copy step's output would be: today the engine runs the copy and pictures steps side by side, so the wiring that
 * gives the pictures step the copy is still to come (#597). The ranking is a text call: the step takes `model`, never
 * the vision door in its place.
 *
 *   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-icon-selection.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from 'website-opportunities/domain/page-writer.mjs'
import { picturesStep } from 'website-opportunities/domain/picture-step.mjs'
import { PHOSPHOR_SET, phosphorCatalog } from '../src/lib/picture-paint/icons/phosphor-set.js'
import { createStepChainEngine, STEP_CHAIN_STOPPED } from '../src/sites/brief-engines/step-chain.js'

const sources = ['site']
const ITEMS = ['service-whitening', 'service-emergency']
/** An invented dental practice with two services. */
const profile = {
  sources: [{ id: 'site', origin: 'website' }],
  facts: { 'business.name': [{ value: 'Example Bramblegate Dental', sources }] },
  items: {
    service: ITEMS.map((id, n) => ({
      id,
      kind: 'service',
      fields: { 'offering.name': { value: `Service ${n + 1}`, sources } },
      sources
    }))
  }
}
/** A features block shaped like JA Boxing's: a heading and two icon fields of a 100 by 100 frame per item. */
const blockStore = {
  blocks: [
    {
      id: 'features-row',
      type: 'services',
      items: { min: 1, max: 4 },
      fields: [],
      itemFields: [
        { name: 'heading-2', kind: 'editorial.heading', type: 'text', limit: 36 },
        { name: 'paragraph-2', kind: 'editorial.paragraph', type: 'text', limit: 106 },
        ...['item-icon', 'item-icon-2'].map((name) => ({
          name,
          kind: 'editorial.item_icon',
          type: 'icon',
          frame: { width: 100, height: 100 },
          storage: 'image-file'
        }))
      ]
    }
  ]
}
const plan = {
  pages: [
    {
      id: 'home',
      pageType: 'home',
      blocks: [{ id: 'home-b1', type: 'services', block: 'features-row', data: [...ITEMS] }]
    }
  ],
  pictures: { own: { frames: 0, from: [] }, generated: { frames: 0 } }
}
/** What the scripted writer writes: a heading and a text per service; a body number word must not call an icon. */
const WRITTEN = {
  [`home-b1/${ITEMS[0]}/heading-2`]: 'Teeth cleaning',
  [`home-b1/${ITEMS[0]}/paragraph-2`]: 'A gentle clean every six months.',
  [`home-b1/${ITEMS[1]}/heading-2`]: 'Emergency first aid',
  [`home-b1/${ITEMS[1]}/paragraph-2`]: 'Seen the same day, one to one.'
}
const writer = async (request) => {
  const fields = {}
  for (const block of JSON.parse(request.user).blocks)
    for (const slot of block.fields) fields[slot.key] = WRITTEN[slot.key] ?? 'Gentle care'
  return JSON.stringify({ fields })
}
const copy = await writePages({ plan, profile, blockStore, model: writer })
const iconLibrary = { set: PHOSPHOR_SET, icons: phosphorCatalog() }

/** A fake build model: each call answers with the next scripted answer, a function of the request. */
function scriptedModel(...answers) {
  const calls = []
  const model = async (request) => {
    calls.push(request)
    return answers[calls.length - 1](JSON.parse(request.user))
  }
  return Object.assign(model, { calls })
}
const first = (asked) => ({
  icons: Object.fromEntries(asked.items.map((i) => [i.id, i.candidates.slice(0, 1)]))
})
const invents = (asked) => ({ icons: Object.fromEntries(asked.items.map((i) => [i.id, ['boxing-glove']])) })

function engineWith(model) {
  const answer = (value) => async () => ({ value, usd: 0 })
  return createStepChainEngine({
    steps: {
      kit: answer({ ref: 'example-clinic/1.0.0' }),
      brand: answer({ file: 'brand.json' }),
      plan: answer({ file: 'plan.json' }),
      copy: answer({ file: 'copy.json' }),
      pictures: async () => ({
        value: await picturesStep({ plan, profile, blockStore, vision: model, model, copy, iconLibrary }),
        usd: 0
      }),
      write: answer({ report: { status: 'done' } })
    },
    applyFor: () => async () => ({}),
    timer: () => () => {}
  })
}
const ctx = () => ({ runId: 'run-1', signal: new AbortController().signal, progress: async () => {} })

test('a ranker naming an icon outside the candidates is re-run once, then the build stops naming the pictures step', async () => {
  const model = scriptedModel(invents, invents)
  await assert.rejects(engineWith(model).prepare(ctx()), (error) => {
    assert.equal(error.code, STEP_CHAIN_STOPPED)
    assert.equal(error.stop.step, 'pictures')
    assert.equal(error.stop.attempts, 2)
    assert.equal(error.stop.code, 'icon_name_outside_candidates')
    const lines = error.prepared.record.filter((l) => l.step === 'pictures')
    assert.deepEqual(
      lines.map((l) => [l.outcome, l.code]),
      [
        ['failed, re-running', 'icon_name_outside_candidates'],
        ['failed', 'icon_name_outside_candidates']
      ]
    )
    return true
  })
  assert.equal(model.calls.length, 2, 'ranked twice, never skipped')
})

test('a missing ranker stops the build too: on this path it never falls back to a shortlist order', async () => {
  const engine = createStepChainEngine({
    steps: {
      kit: async () => ({ value: { ref: 'example-clinic/1.0.0' }, usd: 0 }),
      brand: async () => ({ value: {}, usd: 0 }),
      plan: async () => ({ value: {}, usd: 0 }),
      copy: async () => ({ value: {}, usd: 0 }),
      pictures: async () => ({
        // A vision door is given and still no text model: the ranking never falls back to the vision door.
        value: await picturesStep({ plan, profile, blockStore, vision: async () => ({}), copy, iconLibrary }),
        usd: 0
      }),
      write: async () => ({ value: { report: { status: 'done' } }, usd: 0 })
    },
    applyFor: () => async () => ({}),
    timer: () => () => {}
  })
  await assert.rejects(engine.prepare(ctx()), (error) => {
    assert.equal(error.stop.step, 'pictures')
    assert.equal(error.stop.code, 'icon_ranker_missing')
    return true
  })
})

test('a ranking that passes on the re-run fills the icons from the library by each item heading', async () => {
  const model = scriptedModel(invents, first)
  const run = await engineWith(model).prepare(ctx())
  const icons = run.inputs.pictures.icons
  const named = (item) => icons.find((i) => i.id === `home.home-b1.${item}.item-icon`).icon.name
  assert.equal(named(ITEMS[0]), 'tooth', 'the heading leads: every six months never calls dice-six')
  const asked = model.calls[1] && JSON.parse(model.calls[1].user).items
  assert.ok(!asked[0].candidates.includes('dice-six'))
  assert.equal(asked[0].candidates[0], 'tooth')
  assert.equal(named(ITEMS[1]), 'first-aid')
  assert.ok(icons.every((i) => i.source === 'library' && i.variants.light && i.variants.dark))
  assert.ok(!icons.some((i) => i.icon.name === 'boxing-glove'))
})
