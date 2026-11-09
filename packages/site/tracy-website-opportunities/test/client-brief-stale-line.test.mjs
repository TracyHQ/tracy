/**
 * The Details page line for a brief whose freshness key no longer matches (`current: false`): it must name both
 * causes (the research or the brief rules changed) and keep the number and the time of the brief.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { en } from '../src/client/strings.ts'

test('the stale brief line names the number, the time and both causes', () => {
  const line = en['brief.stale']
  assert.match(line, /\{n\}/)
  assert.match(line, /\{when\}/)
  assert.match(line, /research/)
  assert.match(line, /brief rules/)
  assert.doesNotMatch(line, /[–—]/)
  assert.notEqual(line, en['brief.current'])
})
