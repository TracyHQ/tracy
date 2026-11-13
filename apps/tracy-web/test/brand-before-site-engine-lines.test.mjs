// The brand step before the site (#616) writes the step chain engine's record lines: the same kit and brand steps, run
// once by the engine itself and once by `createBrandBeforeSite`, leave the same lines (times aside). The engine's
// `attempt` is a closure of `createStepChainEngine`, so the adapter mirrors it; this test holds the two together.
// Scripted steps, no bench, no model; the data is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrandBeforeSite } from '../src/brand-before-site.js'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'

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
