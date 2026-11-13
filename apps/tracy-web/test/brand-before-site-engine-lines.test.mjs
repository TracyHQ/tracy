// The brand step before the site (#616) writes the step chain engine's record lines: the same kit and brand steps, run
// once by the engine itself and once by `createBrandBeforeSite`, leave the same lines (times aside). The engine's
// `attempt` is a closure of `createStepChainEngine`, so the adapter mirrors it; this test holds the two together.
// Scripted steps, no bench, no model; the data is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrandBeforeSite } from '../src/brand-before-site.js'
import {
  STEP_CHAIN_NO_OUTPUT,
  chainSummary,
  createStepChainEngine
} from '../src/sites/brief-engines/step-chain.js'

/** A kit step, and a brand step that fails twice: an unknown spend with details, then a value and a code. */
function scriptedSteps() {
  let brandCalls = 0
  return {
    kit: async (ctx) => ({
      value: { ref: ctx.contract?.id ?? 'example-court@1.0.0', doc: { site: {} } },
      usd: 0
    }),
    brand: async () => {
      brandCalls += 1
      if (brandCalls === 1)
        throw Object.assign(new Error('the brand gate failed'), {
          usd: null,
          knownUsd: 0.12,
          details: { gate: 'finish', problems: ['no owner task'] }
        })
      throw Object.assign(new Error('the brand gate failed again'), {
        code: 'brand_gate_failed',
        usd: 0.3,
        value: { file: 'brand-attempt-2/brand-file.json' }
      })
    },
    // The plan branch of a build waits until the failing brand step stops the build.
    plan: (_ctx, _inputs, how) =>
      new Promise((_resolve, reject) =>
        how.signal.addEventListener('abort', () => reject(how.signal.reason))
      ),
    copy: async () => ({ value: { file: 'copy.json' } }),
    pictures: async () => ({ value: { file: 'mapping.json' } }),
    write: async () => ({ value: { report: { status: 'done' } } }),
    dispose: async () => {}
  }
}

const timeless = (line) => {
  const { startMs, endMs, ...rest } = line
  assert.equal(typeof startMs, 'number')
  assert.equal(typeof endMs, 'number')
  return rest
}

test('the adapter writes the kit and brand lines the engine writes for the same steps', async () => {
  const engine = createStepChainEngine({ steps: scriptedSteps(), applyFor: () => async () => ({}) })
  let engineRecord
  try {
    await engine.prepare({
      runId: 'r1',
      contract: { id: 'example-court@1.0.0' },
      email: 'owner@example.test',
      signal: new AbortController().signal
    })
    assert.fail('the engine build did not stop')
  } catch (error) {
    engineRecord = error.prepared.record
  }
  const ours = await createBrandBeforeSite({
    steps: scriptedSteps(),
    briefOf: async () => ({ brand: {} }),
    readJson: async () => ({})
  })({ revisionId: 'rev-1', kitRef: 'example-court@1.0.0' }).catch((error) => error)
  assert.equal(ours.code, 'brand_step_failed')
  const theirs = engineRecord.filter((l) => l.step === 'kit' || l.step === 'brand').map(timeless)
  assert.deepEqual(ours.details.records.map(timeless), theirs)
  assert.deepEqual(
    theirs.map((l) => [l.step, l.outcome]),
    [
      ['kit', 'done'],
      ['brand', 'failed, re-running'],
      ['brand', 'failed']
    ]
  )
  assert.equal(theirs[1].usd, null)
  assert.equal(theirs[1].knownUsd, 0.12)
})

const keysOf = (chain) => Object.keys(chain).sort()

test('dispose keeps the chain in the engine shape, stopped and complete alike, never a plain list', async () => {
  let engineChain
  const engineSteps = { ...scriptedSteps(), dispose: async (p) => (engineChain = p.chain) }
  const engine = createStepChainEngine({ steps: engineSteps, applyFor: () => async () => ({}) })
  const prepared = await engine
    .prepare({ runId: 'r2', contract: { id: 'example-court@1.0.0' }, signal: new AbortController().signal })
    .catch((error) => error.prepared)
  await engine.dispose(prepared)
  let kept
  const stoppedSteps = { ...scriptedSteps(), dispose: async (p) => (kept = p) }
  await createBrandBeforeSite({ steps: stoppedSteps, briefOf: async () => ({ brand: {} }) })({
    revisionId: 'rev-1',
    kitRef: 'example-court@1.0.0'
  }).catch(() => null)
  assert.equal(Array.isArray(kept.chain), false)
  assert.deepEqual(keysOf(kept.chain), keysOf(engineChain))
  assert.deepEqual(
    [kept.chain.ending, kept.chain.failedStep, kept.chain.stop.step],
    ['stopped', 'brand', 'brand']
  )
  assert.deepEqual(
    kept.chain.steps.map((s) => s.step),
    ['kit', 'brand', 'brand']
  )
  // A complete brand run has the keys of a complete engine run: no stop, no failed step, no unfinished Write step.
  const done = chainSummary(
    [{ step: 'write', attempt: 1, startMs: 0, endMs: 1, usd: 0, outcome: 'done' }],
    null,
    1
  )
  const okSteps = {
    ...scriptedSteps(),
    brand: async () => ({ value: { file: 'brand-file.json' }, usd: 0.2 }),
    dispose: async (p) => (kept = p)
  }
  await createBrandBeforeSite({
    steps: okSteps,
    briefOf: async () => ({ brand: {} }),
    readJson: async () => ({
      kind: 'brand-file',
      version: 10,
      colours: { decision: 'new-accent', accent: '#2a6f97' },
      logo: { material: { mediaId: 'm' }, mark: { decision: 'cut' } }
    })
  })({ revisionId: 'rev-1', kitRef: 'example-court@1.0.0' })
  assert.deepEqual(keysOf(kept.chain), keysOf(done))
  assert.equal(kept.chain.ending, 'complete')
  assert.equal(kept.chain.totalUsd, 0.2)
})

test('a brand step value without a brand file is no output: a failed attempt, never a success without a record', async () => {
  let calls = 0
  const steps = {
    ...scriptedSteps(),
    brand: async () => {
      calls += 1
      return { value: { other: 1 }, usd: 0.2 }
    }
  }
  const error = await createBrandBeforeSite({ steps, briefOf: async () => ({ brand: {} }) })({
    revisionId: 'rev-1',
    kitRef: 'example-court@1.0.0'
  }).catch((e) => e)
  assert.equal(error.code, 'brand_step_failed')
  assert.equal(calls, 2, 'no output is re-run once, as the engine does')
  const brand = error.details.records.filter((l) => l.step === 'brand')
  assert.deepEqual(
    brand.map((l) => [l.outcome, l.code, l.usd]),
    [
      ['failed, re-running', STEP_CHAIN_NO_OUTPUT, 0.2],
      ['failed', STEP_CHAIN_NO_OUTPUT, 0.2]
    ]
  )
})
