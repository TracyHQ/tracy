/**
 * A labelling failure of the pictures step (#595) follows the stop and report rule (ADR 0047, #591): the step chain runs
 * the pictures step again once from the same inputs, and a second failure stops the build with a report naming the
 * `pictures` step and the typed code. No database: the engine's `prepare` runs with step doubles, and the pictures step
 * is the real domain step with a scripted fake vision call over an invented business.
 *
 *   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-picture-labelling.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { picturesStep } from 'website-opportunities/domain/picture-step.mjs'
import { createStepChainEngine, STEP_CHAIN_STOPPED } from '../src/sites/brief-engines/step-chain.js'

/** An invented club with one own photo that research did not label. */
const profile = {
  sources: [{ id: 'site', origin: 'website' }],
  facts: { 'business.name': [{ value: 'Example Padel Club', sources: ['site'] }] },
  items: {
    gallery: [
      {
        id: 'gallery-courts',
        kind: 'gallery',
        fields: {
          'business.gallery_image': { value: 'https://padel-club.example/img/courts.jpg', sources: ['site'] }
        },
        sources: ['site']
      }
    ]
  }
}
const blockStore = {
  blocks: [
    {
      id: 'gallery-strip',
      type: 'gallery',
      items: { min: 1, max: 6 },
      fields: [],
      itemFields: [{ name: 'photo', kind: 'business.gallery_image', type: 'image' }]
    }
  ]
}
const plan = {
  pages: [
    {
      id: 'home',
      pageType: 'home',
      blocks: [{ id: 'home-b1', type: 'gallery', block: 'gallery-strip', data: ['gallery-courts'] }]
    }
  ],
  pictures: { own: { frames: 1, from: ['Website'] }, generated: { frames: 0 } }
}
const LABEL = {
  pictures: [{ id: 'gallery-courts', label: 'Two padel courts under lights', content: 'venue-exterior' }]
}

/** A fake vision call answering each call with the next scripted answer (an Error is thrown). */
function scriptedVision(...answers) {
  const calls = []
  const vision = async (request) => {
    calls.push(request)
    const answer = answers[calls.length - 1]
    if (answer instanceof Error) throw answer
    return answer
  }
  return Object.assign(vision, { calls })
}

function engineWith(vision) {
  const answer = (value) => async () => ({ value, usd: 0 })
  return createStepChainEngine({
    steps: {
      kit: answer({ ref: 'example-court/1.0.0' }),
      brand: answer({ file: 'brand.json' }),
      plan: answer({ file: 'plan.json' }),
      copy: answer({ file: 'copy.json' }),
      pictures: async () => ({ value: await picturesStep({ plan, profile, blockStore, vision }), usd: 0 }),
      write: answer({ report: { status: 'done' } })
    },
    applyFor: () => async () => ({}),
    timer: () => () => {}
  })
}
const ctx = () => ({ runId: 'run-1', signal: new AbortController().signal, progress: async () => {} })

test('a labelling failure is re-run once, then the build stops with a report naming the pictures step', async () => {
  const vision = scriptedVision(new Error('vision door timed out'), { pictures: [] })
  await assert.rejects(engineWith(vision).prepare(ctx()), (error) => {
    assert.equal(error.code, STEP_CHAIN_STOPPED)
    assert.equal(error.stop.step, 'pictures')
    assert.equal(error.stop.attempts, 2)
    assert.equal(error.stop.code, 'picture_labelling_failed')
    const lines = error.prepared.record.filter((l) => l.step === 'pictures')
    assert.deepEqual(
      lines.map((l) => [l.outcome, l.code]),
      [
        ['failed, re-running', 'picture_labelling_failed'],
        ['failed', 'picture_labelling_failed']
      ]
    )
    return true
  })
  assert.equal(vision.calls.length, 2, 'labelled twice, never skipped')
})

test('a labelling failure that passes on the re-run places the labelled photo', async () => {
  const vision = scriptedVision(new Error('vision door timed out'), LABEL)
  const run = await engineWith(vision).prepare(ctx())
  const [frame] = run.inputs.pictures.frames
  assert.deepEqual([frame.source, frame.label], ['own', 'Two padel courts under lights'])
})
