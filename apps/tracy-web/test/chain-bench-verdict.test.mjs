import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAIN_BENCH_CHECK_FAILED, chainBenchFailure, chainQaPassed } from '../src/lib/chain-bench-verdict.js'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'

const exported = { code: 0, err: [] }

test('a completed model run with remaining check failures is not a successful chain step', () => {
  for (const step of ['plan', 'copy', 'pictures']) {
    const failure = chainBenchFailure(
      step,
      'run-1',
      {
        status: 'succeeded',
        standing_failures: 'P01: the kept route is hidden'
      },
      exported
    )
    assert.match(failure, /exhausted its fix rounds/)
    assert.match(failure, /P01/)
  }
  assert.equal(
    chainBenchFailure('plan', 'r', { status: 'succeeded', standing_failures: ' \n' }, exported),
    null
  )
  assert.equal(chainBenchFailure('pictures', 'r', { status: 'succeeded' }, exported), null)
  assert.match(
    chainBenchFailure('plan', 'r', { status: 'failed', error: 'provider refused' }, exported),
    /provider refused/
  )
  assert.match(
    chainBenchFailure('copy', 'r', { status: 'succeeded' }, { code: 1, err: ['missing copy'] }),
    /missing copy/
  )
})

test('checked planner failures twice stop the build: the best content is reported, never written', async () => {
  const best = { file: 'best-plan.json' }
  const received = []
  const engine = createStepChainEngine({
    applyFor: () => async () => ({ ok: true }),
    steps: {
      kit: async () => ({ value: { ref: 'fixture' } }),
      brand: async () => ({ value: {} }),
      plan: async () => {
        const failure = chainBenchFailure(
          'plan',
          'run-1',
          {
            status: 'succeeded',
            standing_failures: 'P01: invalid route'
          },
          exported
        )
        throw Object.assign(new Error(failure), { value: best, usd: 0.25, code: CHAIN_BENCH_CHECK_FAILED })
      },
      copy: async (_ctx, input) => {
        received.push(input.plan)
        return { value: {} }
      },
      pictures: async (_ctx, input) => {
        received.push(input.plan)
        return { value: {} }
      },
      write: async (_ctx, input) => {
        received.push(input.plan)
        return { value: { report: { status: 'done', counts: { written: 3, skipped: 0 } } } }
      }
    }
  })
  const ctx = { runId: 'chain-1', email: 'owner@example.test', signal: new AbortController().signal }
  const stopped = await engine.prepare(ctx).catch((error) => error)
  assert.deepEqual(received, [], 'no later step is given the rejected plan')
  assert.equal(stopped.chain.ending, 'stopped')
  assert.equal(stopped.chain.failedStep, 'plan')
  assert.equal(stopped.chain.totalUsd, 0.5, 'both attempts are counted')
  assert.deepEqual(
    [stopped.stop.code, stopped.stop.output, stopped.stop.attempts],
    [CHAIN_BENCH_CHECK_FAILED, best, 2]
  )
  assert.equal(chainQaPassed({ state: 'failed', timings: { chain: stopped.chain } }), false)
})

test('final QA rejects unresolved upstream checks while keeping verified fallback semantics', () => {
  const write = { step: 'write', outcome: 'done' }
  const run = (chain, state = 'applied') => ({ state, timings: { chain } })
  assert.equal(chainQaPassed(run({ ending: 'complete', steps: [write] })), true)
  assert.equal(
    chainQaPassed(run({ ending: 'soft-failure', steps: [{ step: 'brand', outcome: 'failed' }, write] })),
    true
  )
  for (const step of ['plan', 'copy', 'pictures'])
    assert.equal(
      chainQaPassed(
        run({
          ending: 'soft-failure',
          steps: [{ step, outcome: 'failed, best version used', code: CHAIN_BENCH_CHECK_FAILED }, write]
        })
      ),
      false
    )
  assert.equal(chainQaPassed(null), false)
  assert.equal(chainQaPassed(run({ ending: 'complete', steps: [write] }, 'failed')), false)
  assert.equal(chainQaPassed(run({ ending: 'running', steps: [write] })), false)
  assert.equal(chainQaPassed(run({ ending: 'complete', running: ['copy'], steps: [write] })), false)
  assert.equal(chainQaPassed(run({ ending: 'complete', steps: [] })), false)
  assert.equal(
    chainQaPassed(run({ ending: 'complete', steps: [write, { step: 'write', outcome: 'failed' }] })),
    false
  )
})
