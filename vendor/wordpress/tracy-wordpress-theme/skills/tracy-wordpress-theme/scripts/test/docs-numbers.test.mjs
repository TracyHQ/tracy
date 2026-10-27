import { test } from 'node:test'
import assert from 'node:assert/strict'
import { check, measure } from '../check-docs-numbers.mjs'

test('docs-numbers: the counts the docs quote match the tree, and gotchas run 1..N', () => {
  const m = measure()
  assert.ok(m.testCalls > 200 && m.scripts > 40 && m.packets > 20, JSON.stringify(m))
  const { problems } = check()
  assert.deepEqual(problems, [])
})
