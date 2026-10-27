import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVendor } from '../lib/vendors/index.js'
import { effortLevelsForModel } from '../lib/vendors/claude.js'

function sse(lines) {
  return lines.map((l) => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n'
}

function claudeFetchImpl(calls) {
  return async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return new Response(sse([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } }),
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }
}

const BLOB = { accessToken: 'at', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' }

async function capturedBody(options) {
  const calls = []
  for await (const _ of getVendor('claude').streamOnce({
    blob: BLOB,
    options,
    fetchImpl: claudeFetchImpl(calls),
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: {},
  })) { /* drain */ }
  const hit = calls.find((row) => row.body)
  return hit ? hit.body : null
}

test('effortLevelsForModel gates levels by family and generation', () => {
  assert.deepEqual(effortLevelsForModel('claude-opus-5'), ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(effortLevelsForModel('claude-opus-4-7'), ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(effortLevelsForModel('claude-opus-4-6'), ['low', 'medium', 'high', 'max'])
  assert.equal(effortLevelsForModel('claude-opus-4-5'), null) // pre-adaptive generation
  assert.deepEqual(effortLevelsForModel('claude-sonnet-5'), ['low', 'medium', 'high'])
  assert.deepEqual(effortLevelsForModel('claude-sonnet-4-6'), ['low', 'medium', 'high'])
  assert.equal(effortLevelsForModel('claude-sonnet-4-5'), null)
  assert.equal(effortLevelsForModel('claude-haiku-4-5-20251001'), null)
  assert.equal(effortLevelsForModel('claude-fable-5'), null)
  assert.equal(effortLevelsForModel('some-other-model'), null)
})

test('claude listModels advertises reasoning efforts on adaptive models only', async () => {
  const rows = await getVendor('claude').listModels(BLOB, {})
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
  assert.deepEqual(byId['claude-opus-5'].reasoning.efforts.map((e) => e.id), ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(byId['claude-sonnet-5'].reasoning.efforts.map((e) => e.id), ['low', 'medium', 'high'])
  assert.equal(byId['claude-fable-5'].reasoning, undefined)
  assert.equal(byId['claude-haiku-4-5-20251001'].reasoning, undefined)
})

test('claude streamOnce sends adaptive thinking + effort for a supported level', async () => {
  const body = await capturedBody({
    model: 'claude-opus-5',
    reasoningEffort: 'high',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.deepEqual(body.thinking, { type: 'adaptive' })
  assert.deepEqual(body.output_config, { effort: 'high' })
})

test('claude streamOnce omits thinking when effort is off or unset', async () => {
  for (const reasoningEffort of ['off', undefined]) {
    const body = await capturedBody({
      model: 'claude-opus-5',
      ...(reasoningEffort ? { reasoningEffort } : {}),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    assert.equal(body.thinking, undefined, `thinking must be absent for effort=${reasoningEffort}`)
    assert.equal(body.output_config, undefined)
  }
})

test('claude streamOnce never sends effort to models that reject it', async () => {
  for (const model of ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'claude-fable-5']) {
    const body = await capturedBody({
      model,
      reasoningEffort: 'high',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    assert.equal(body.thinking, undefined, `thinking must be absent for ${model}`)
    assert.equal(body.output_config, undefined)
  }
})
