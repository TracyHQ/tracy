import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evidenceData } from '../src/opportunities-build/agent-demo.js'

test('evidence keeps a Date as its ISO string, not an empty object', () => {
  assert.deepEqual(evidenceData({ at: new Date('2026-10-20T08:00:00.000Z') }), {
    at: '2026-10-20T08:00:00.000Z'
  })
})
