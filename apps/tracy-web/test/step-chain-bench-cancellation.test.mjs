// A chain that stops while a bench start is pending must cancel the row that start eventually creates.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainSteps } from '../src/step-chain-steps.js'

test('a bench run created after chain cancellation is cancelled before polling or export', async () => {
  const starting = Promise.withResolvers()
  const release = Promise.withResolvers()
  const cancelled = Promise.withResolvers()
  const stop = new AbortController()
  const reason = new Error('the base has no full recovery point')
  const calls = []
  let polls = 0
  const steps = createStepChainSteps({
    config: {},
    pool: {
      async query() {
        polls++
        throw new Error('a cancelled start must never poll')
      }
    },
    benchCli: {
      async brand(argv, io) {
        calls.push(argv)
        if (argv[0] === 'run') {
          starting.resolve()
          await release.promise
          io.out('late-brand-run')
        } else if (argv[0] === 'cancel') cancelled.resolve(argv[1])
        else throw new Error(`unexpected bench command ${argv[0]}`)
        return 0
      }
    }
  })
  const ctx = { runId: 'cancelled-while-starting', brief: { researchRevisionId: 'revision' } }
  try {
    const pending = steps.brand(ctx, { kit: { ref: 'test-kit' } }, { signal: stop.signal })
    const rejected = assert.rejects(pending, (error) => error === reason)
    await starting.promise
    stop.abort(reason)
    release.resolve()
    await rejected
    assert.equal(await cancelled.promise, 'late-brand-run')
    assert.deepEqual(
      calls.map((argv) => argv[0]),
      ['run', 'cancel']
    )
    assert.equal(polls, 0)
  } finally {
    release.resolve()
    await steps.dispose(ctx)
  }
})

test('a chain cancelled before bench creation never queues a run', async () => {
  const stop = new AbortController()
  const reason = new Error('the chain already stopped')
  stop.abort(reason)
  let starts = 0
  const steps = createStepChainSteps({
    config: {},
    pool: {},
    benchCli: { brand: async () => starts++ }
  })
  const ctx = { runId: 'cancelled-before-start', brief: { researchRevisionId: 'revision' } }
  try {
    await assert.rejects(
      steps.brand(ctx, { kit: { ref: 'test-kit' } }, { signal: stop.signal }),
      (error) => error === reason
    )
    assert.equal(starts, 0)
  } finally {
    await steps.dispose(ctx)
  }
})
