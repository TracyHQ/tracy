// The step chain engine on its own (ADR 0047, #591): what counts as a failed step, what each attempt is given, what a
// line and a stop report carry, and how a run that never completed its Write step is recorded. Scripted steps, no
// database, no model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createStepChainEngine,
  STEP_CHAIN_DOORS_EMPTY,
  STEP_CHAIN_INCOMPLETE,
  STEP_CHAIN_NO_OUTPUT,
  STEP_CHAIN_STOPPED,
  STEP_CHAIN_STOPPED_MESSAGE
} from '../src/sites/brief-engines/step-chain.js'
import { MAX_ERROR_DETAILS_BYTES } from '../src/sites/brief-engines/step-chain-record.js'

const ok = (value) => async () => ({ value, usd: 0 })
const written = async () => ({ value: { report: { status: 'done', counts: { written: 3 } } }, usd: 0 })

/** An engine over scripted steps; `over` replaces some. Disposal hands its record to `kept`. */
function engineWith(over = {}) {
  const kept = []
  const steps = {
    kit: ok({ ref: 'kit-ref', doc: { pages: [] } }),
    brand: ok({ file: 'brand-file.json' }),
    plan: ok({ file: 'plan.json' }),
    copy: ok({ file: 'site-copy.json' }),
    pictures: ok({ file: 'mapping.json' }),
    write: written,
    dispose: async (prepared) => {
      kept.push(prepared.chain)
    },
    ...over
  }
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({}) })
  return { engine, kept }
}

const ctx = () => ({ runId: 'r1', email: 'owner@example.test', signal: new AbortController().signal })
const lines = (chain) => chain.steps.map((s) => `${s.step}#${s.attempt}:${s.outcome}`)

/** prepare, then apply; the stop error when the build stopped. */
async function build(engine) {
  const c = ctx()
  try {
    const prepared = await engine.prepare(c)
    return { result: await engine.apply(c, prepared), prepared }
  } catch (error) {
    return { error, prepared: error.prepared }
  }
}

test('a door check that throws stops the build at doors with the customer sentence, and the record is kept', async () => {
  const { engine, kept } = engineWith({
    doors: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED the door book'), { code: 'ECONNREFUSED' })
    }
  })
  const { error, prepared } = await build(engine)
  assert.equal(error.code, STEP_CHAIN_STOPPED)
  assert.equal(error.message, STEP_CHAIN_STOPPED_MESSAGE)
  assert.equal(error.stop.step, 'doors')
  assert.equal(error.stop.code, 'ECONNREFUSED')
  assert.equal(error.chain.ending, 'stopped')
  await engine.dispose(prepared)
  assert.equal(kept[0].failedStep, 'doors')
  assert.deepEqual(lines(kept[0]), ['doors#1:failed, re-running', 'doors#2:failed'])
})

test('an empty door is not re-run: the build stops at once, before any model step', async () => {
  let kitRan = false
  const { engine } = engineWith({
    doors: async () => [{ door: 'siteWriter', state: 'unassigned' }],
    kit: async () => ((kitRan = true), { value: { ref: 'k' }, usd: 0 })
  })
  const { error } = await build(engine)
  assert.equal(error.stop.code, STEP_CHAIN_DOORS_EMPTY)
  assert.deepEqual(error.stop.output, { empty: [{ door: 'siteWriter', state: 'unassigned' }] })
  assert.deepEqual(lines(error.chain), ['doors#1:failed'])
  assert.equal(kitRan, false)
})

for (const [label, answer] of [
  ['{ value: null }', { value: null, usd: 0.01 }],
  ['nothing at all', undefined]
])
  test(`a step that answers ${label} has failed, is re-run once, and stops the build at that step`, async () => {
    const { engine } = engineWith({ pictures: async () => answer })
    const { error } = await build(engine)
    assert.equal(error.stop.step, 'pictures')
    assert.equal(error.stop.code, STEP_CHAIN_NO_OUTPUT)
    const pictures = error.chain.steps.filter((s) => s.step === 'pictures').map((s) => s.outcome)
    assert.deepEqual(pictures, ['failed, re-running', 'failed'])
    assert.ok(!error.chain.steps.some((s) => s.step === 'write'), 'it never reaches the write')
  })

test('each attempt gets its own copy of its inputs and its number: a parallel step or an attempt cannot change them', async () => {
  const seen = []
  let calls = 0
  const { engine } = engineWith({
    copy: async (_c, { plan }) => {
      plan.extra = 'changed by copy'
      plan.file = 'changed'
      return { value: { file: 'site-copy.json' }, usd: 0 }
    },
    pictures: async (_c, { plan }, how) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      seen.push({ plan: structuredClone(plan), attempt: how.attempt })
      plan.file = 'changed by the first attempt'
      calls += 1
      if (calls === 1) throw new Error('first attempt fails')
      return { value: { file: 'mapping.json' }, usd: 0 }
    }
  })
  const { result } = await build(engine)
  assert.equal(result.chain.ending, 'complete')
  assert.deepEqual(seen, [
    { plan: { file: 'plan.json' }, attempt: 1 },
    { plan: { file: 'plan.json' }, attempt: 2 }
  ])
})

test('error details are kept on the line and the stop report, bounded and JSON safe', async () => {
  const failing = [{ field: 'hero.title', limit: 40, length: 52 }]
  const { engine } = engineWith({
    copy: async () => {
      const details = { failing, note: () => 'dropped', count: 10n }
      details.self = details
      throw Object.assign(new Error('fields over their limit'), { code: 'PAGE_WRITER_FAILED', details })
    }
  })
  const { error } = await build(engine)
  assert.deepEqual(error.stop.details, { failing, count: '10', self: '[circular]' })
  const copy = error.chain.steps.filter((s) => s.step === 'copy')
  assert.deepEqual(copy[0].details, error.stop.details)
  assert.doesNotThrow(() => JSON.stringify(error.chain))

  const { engine: heavy } = engineWith({
    pictures: async () => {
      throw Object.assign(new Error('pictures refused'), {
        details: {
          pictures: Array.from({ length: 2000 }, (_, i) => ({ frame: `frame-${i}`, reason: 'too small' }))
        }
      })
    }
  })
  const { error: big } = await build(heavy)
  assert.equal(big.stop.details.truncated, true)
  assert.ok(Buffer.byteLength(big.stop.details.json) <= MAX_ERROR_DETAILS_BYTES)
})

test('an error marked noRerun stops the build at once, without the second attempt', async () => {
  let calls = 0
  const { engine } = engineWith({
    plan: async () => {
      calls += 1
      throw Object.assign(new Error('the plan failed its gate twice'), {
        code: 'plan_gate_failed',
        noRerun: true
      })
    }
  })
  const { error } = await build(engine)
  assert.equal(calls, 1)
  assert.equal(error.stop.step, 'plan')
  assert.equal(error.stop.attempts, 1)
  assert.equal(error.stop.code, 'plan_gate_failed')
  assert.deepEqual(
    error.chain.steps.filter((s) => s.step === 'plan').map((s) => s.outcome),
    ['failed']
  )
})

test('a run whose apply never ran is never kept as complete: dispose records it stopped, incomplete', async () => {
  const { engine, kept } = engineWith()
  const prepared = await engine.prepare(ctx())
  await engine.dispose(prepared)
  assert.equal(kept[0].ending, 'stopped')
  assert.equal(kept[0].stop.code, STEP_CHAIN_INCOMPLETE)
  assert.ok(!kept[0].steps.some((s) => s.step === 'write'))
})

test('the frame ends a run with its own reason: the row measurement and the kept record agree', async () => {
  const { engine, kept } = engineWith()
  const prepared = await engine.prepare(ctx())
  const reason = Object.assign(new Error('the site did not come up in time'), { code: 'SITE_NOT_UP' })
  const row = engine.end(prepared, reason)
  await engine.dispose(prepared)
  assert.equal(row.ending, 'stopped')
  assert.deepEqual(row.stop, {
    step: 'run',
    attempts: 0,
    code: 'SITE_NOT_UP',
    error: 'the site did not come up in time'
  })
  assert.equal(kept[0].ending, row.ending)
  assert.deepEqual(kept[0].stop, row.stop)
})

test('a run that completed its Write step is kept complete', async () => {
  const { engine, kept } = engineWith()
  const { result, prepared } = await build(engine)
  assert.equal(result.chain.ending, 'complete')
  await engine.dispose(prepared)
  assert.equal(kept[0].ending, 'complete')
})
