import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codexResponsesBody } from '../lib/messages.js'

test('#92: fastMode sends service_tier priority', () => {
  const body = codexResponsesBody({ model: 'gpt-5.1-codex', messages: [] }, 'instr', { fastMode: true })
  assert.equal(body.service_tier, 'priority')
})

test('#92: no service_tier without fastMode', () => {
  const body = codexResponsesBody({ model: 'gpt-5.1-codex', messages: [] }, 'instr', {})
  assert.equal(body.service_tier, undefined)
})

test('#92: verbosity still works alongside fastMode', () => {
  const body = codexResponsesBody({ model: 'gpt-5.1', messages: [] }, 'instr', { fastMode: true, verbosity: 'low' })
  assert.equal(body.service_tier, 'priority')
  assert.deepEqual(body.text, { verbosity: 'low' })
})
