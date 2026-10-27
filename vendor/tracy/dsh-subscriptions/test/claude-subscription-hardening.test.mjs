import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVendor } from '../lib/vendors/index.js'
import { makeClaudeBillingHeader, applyClaudeBillingHeader } from '../lib/vendors/claude.js'
import { deepestUsedPercent, usageWindows, windowLabel } from '../lib/usage.js'

function sse(lines) {
  return lines.map((l) => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n'
}

test('GH #14: claude listModels sends Bearer for OAuth tokens and x-api-key for static api keys', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers })
    return Response.json({
      data: [
        { id: 'claude-opus-5', display_name: 'Claude Opus 5' },
        { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
      ],
    })
  }

  const vendor = getVendor('claude')

  // 1. sk-ant-oat01 token (OAuth access token) -> Bearer
  calls.length = 0
  await vendor.listModels({ accessToken: 'sk-ant-oat01-test-access-token' }, {}, fetchImpl)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-ant-oat01-test-access-token')
  assert.equal(calls[0].headers['x-api-key'], undefined)

  // 2. sk-ant-ort01 token (OAuth refresh token) -> Bearer
  calls.length = 0
  await vendor.listModels({ accessToken: 'sk-ant-ort01-test-refresh-token' }, {}, fetchImpl)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-ant-ort01-test-refresh-token')
  assert.equal(calls[0].headers['x-api-key'], undefined)

  // 3. sk-ant-api03 token (Static API key) -> x-api-key
  calls.length = 0
  await vendor.listModels({ accessToken: 'sk-ant-api03-test-static-key' }, {}, fetchImpl)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers['x-api-key'], 'sk-ant-api03-test-static-key')
  assert.equal(calls[0].headers.Authorization, undefined)
})

test('GH #15: makeClaudeBillingHeader produces valid attribution header with version and turn index', () => {
  const header1 = makeClaudeBillingHeader()
  assert.match(header1, /^x-anthropic-billing-header: cc_version=2\.1\.289\.7e2; cc_entrypoint=sdk-cli; cch=[0-9a-f]{4,}; cc_turn_origin=sdk; cc_prompt_index=0; cc_turn_index=\d+;$/)

  // Custom version override
  const header2 = makeClaudeBillingHeader({ claudeCcVersion: '3.0.0.abc' })
  assert.match(header2, /cc_version=3\.0\.0\.abc;/)
})

test('GH #15: applyClaudeBillingHeader injects billing block and respects suppression', () => {
  // Array system
  const p1 = { system: [{ type: 'text', text: 'You are Claude Code' }] }
  applyClaudeBillingHeader(p1)
  assert.equal(p1.system.length, 2)
  assert.equal(p1.system[0].type, 'text')
  assert.match(p1.system[0].text, /^x-anthropic-billing-header:/)
  assert.equal(p1.system[1].text, 'You are Claude Code')

  // No duplicate injection
  applyClaudeBillingHeader(p1)
  assert.equal(p1.system.length, 2)

  // String system
  const p2 = { system: 'Base prompt' }
  applyClaudeBillingHeader(p2)
  assert.equal(p2.system.length, 2)
  assert.match(p2.system[0].text, /^x-anthropic-billing-header:/)
  assert.equal(p2.system[1].text, 'Base prompt')

  // Empty/missing system
  const p3 = {}
  applyClaudeBillingHeader(p3)
  assert.equal(p3.system.length, 1)
  assert.match(p3.system[0].text, /^x-anthropic-billing-header:/)

  // Suppression via env
  process.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0'
  try {
    const p4 = { system: [{ type: 'text', text: 'Prompt' }] }
    applyClaudeBillingHeader(p4)
    assert.equal(p4.system.length, 1)
    assert.equal(p4.system[0].text, 'Prompt')
  } finally {
    delete process.env.CLAUDE_CODE_ATTRIBUTION_HEADER
  }
})

test('GH #15: claude streamOnce sends x-anthropic-billing-header in body.system', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return new Response(sse([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const vendor = getVendor('claude')
  for await (const _ of vendor.streamOnce({
    blob: { accessToken: 'sk-ant-oat01-test' },
    options: { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'test' }] },
    fetchImpl,
    headers: {},
    config: {},
  })) { /* drain */ }

  assert.equal(calls.length, 1)
  const body = calls[0].body
  assert.ok(Array.isArray(body.system))
  assert.match(body.system[0].text, /^x-anthropic-billing-header: cc_version=2\.1\.289\.7e2;/)
  assert.match(body.system[1].text, /You are Claude Code/)
})

test('GH #15: deepestUsedPercent isolates extra_usage overage from subscription quota', () => {
  const anthropicUsageResponse = {
    five_hour: {
      utilization: 1.0,
      resets_at: '2026-10-04T20:29:59Z',
    },
    seven_day: {
      utilization: 41.0,
      resets_at: '2026-10-07T15:59:59Z',
    },
    extra_usage: {
      used_credits: 110,
      monthly_limit: 100,
      utilization: 100,
    },
  }

  // Must return 41 (the max of five_hour: 1 and seven_day: 41), ignoring extra_usage: 100
  const used = deepestUsedPercent(anthropicUsageResponse)
  assert.equal(used, 41.0)
})

test('GH #15: usageWindows labels extra_usage window for UI visibility', () => {
  const label = windowLabel('extra_usage')
  assert.equal(label.en, 'extra')
  assert.equal(label.zh, '额外用量')

  const wins = usageWindows({
    five_hour: { utilization: 25 },
    extra_usage: { utilization: 90 },
  })
  assert.equal(wins.length, 2)
  const extraWin = wins.find((w) => w.id === 'extra_usage')
  assert.ok(extraWin)
  assert.equal(extraWin.usedPercent, 90)
  assert.equal(extraWin.en, 'extra')
  assert.equal(extraWin.zh, '额外用量')
})
