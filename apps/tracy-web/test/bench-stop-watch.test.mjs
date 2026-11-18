import assert from 'node:assert/strict'
import { test } from 'node:test'
import { watchBenchStop } from '../src/lib/bench-run-loop.js'

test('the bench Stop watcher aborts the active signal when the durable Stop flag is set', async () => {
  const stop = new AbortController()
  const reads = []
  const pool = {}
  const store = {
    async cancelAsked(actualPool, runId) {
      reads.push([actualPool, runId])
      return reads.length >= 2
    }
  }
  const stopWatching = watchBenchStop(store, pool, 'run-1', stop, 1)
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Stop was not observed')), 500)
      stop.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true }
      )
    })
    assert.equal(reads.length, 2)
    assert.deepEqual(reads[0], [pool, 'run-1'])
  } finally {
    stopWatching()
  }
})
