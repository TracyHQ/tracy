/**
 * One press = one request id. A second press while the first is still in flight, or a retry after a
 * press that failed, sends the SAME id, so the server answers with the job or build it already has.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRequestIds } from '../src/client/request-ids.ts'

function counter() {
  let n = 0
  return () => `id-${++n}`
}

test('a double press while the first is in flight reuses the id and says so', () => {
  const ids = createRequestIds(counter())
  assert.deepEqual(ids.begin('research:a'), { id: 'id-1', repeat: false })
  assert.deepEqual(ids.begin('research:a'), { id: 'id-1', repeat: true })
})

test('a press after success draws a new id; a retry after failure keeps the old one', () => {
  const ids = createRequestIds(counter())
  ids.begin('build:r1')
  ids.fail('build:r1')
  assert.deepEqual(ids.begin('build:r1'), { id: 'id-1', repeat: false })
  ids.succeed('build:r1')
  assert.deepEqual(ids.begin('build:r1'), { id: 'id-2', repeat: false })
})

test('different actions never share an id', () => {
  const ids = createRequestIds(counter())
  assert.equal(ids.begin('research:a').id, 'id-1')
  assert.equal(ids.begin('research:b').id, 'id-2')
  assert.equal(ids.pending('research:a'), true)
  ids.succeed('research:a')
  assert.equal(ids.pending('research:a'), false)
})
