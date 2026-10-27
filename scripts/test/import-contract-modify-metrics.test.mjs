import assert from 'node:assert/strict'
import test from 'node:test'
import { correlatedTurn, turnMetrics, totalMetrics } from '../e2e/import-contract-metrics.mjs'

test('substring requests cannot impersonate a prompt and coalesced repeats share the same turn', () => {
  const rows = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'replace title completely' }] } },
    { type: 'turn/end' },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'replace title' }] } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'replace title' }] } },
    { type: 'turn/end' }
  ]
  assert.equal(correlatedTurn(rows, 'replace title').rows[0].data.turn, 2)
  assert.equal(correlatedTurn(rows, 'replace title', 1).rows[0].data.turn, 2)
  assert.equal(correlatedTurn(rows, 'title').completed, false)
})

test('V4 turn starts before consumed user messages; repeated queued prompts map to distinct turns', () => {
  const rows = [1, 2].flatMap((turn) => [
    { type: 'turn/start', data: { turn } },
    { type: 'user/message', data: { text: 'same\nrequest' } },
    { type: 'tool/call', data: { name: `tool-${turn}` } },
    { type: 'turn/end' }
  ])
  assert.equal(correlatedTurn(rows, 'same\nrequest', 0).rows[0].data.turn, 1)
  assert.equal(correlatedTurn(rows, 'same\nrequest', 1).rows[0].data.turn, 2)
  assert.deepEqual(correlatedTurn(rows, 'same\nrequest', 2).rows, [])
})

test('normalized uncached input fallback is disjoint from explicitly measured cache counters', () => {
  const metrics = turnMetrics([
    {
      type: 'assistant/message',
      data: { usage: { inputTokens: 7, cacheReadTokens: 40, cacheWriteTokens: 3, outputTokens: 8 } }
    }
  ])
  assert.equal(metrics.newInput, 7)
  assert.equal(metrics.totalInput, 50)
  assert.equal(
    turnMetrics([{ type: 'assistant/message', data: { usage: { inputTokens: 7 } } }]).totalInput,
    null
  )
})

test('correlation excludes earlier and later turns while preserving incomplete diagnostics', () => {
  const rows = [
    { type: 'tool/call' },
    { type: 'user/message', data: { text: 'replace title' } },
    { type: 'turn/start' },
    { type: 'tool/call', data: { name: 'tracy_site' } },
    { type: 'turn/end' },
    { type: 'tool/call', data: { name: 'other' } }
  ]
  const turn = correlatedTurn(rows, 'replace title')
  assert.equal(turn.completed, true)
  assert.equal(turnMetrics(turn.rows).toolCalls, 1)
  const partial = correlatedTurn(rows.slice(0, 4), 'replace title')
  assert.equal(partial.completed, false)
  assert.equal(turnMetrics(partial.rows).toolCalls, 1)
  assert.equal(turnMetrics(correlatedTurn(rows, 'another prompt').rows).toolCalls, 0)
})

test('missing usage remains unknown and payload failures count despite a false wrapper flag', () => {
  const row = {
    type: 'tool/result',
    data: {
      message: { isError: false, content: [{ type: 'text', text: '{"ok":false,"code":"NO_VIEWER"}' }] }
    }
  }
  const metrics = turnMetrics([row, { type: 'assistant/message', data: {} }])
  assert.equal(metrics.errors, 1)
  assert.equal(metrics.noViewer, 1)
  assert.equal(metrics.newInput, null)
  assert.equal(metrics.output, null)
})

test('case totals sum continuous turns without hiding absent usage or failed oracles', () => {
  const measured = turnMetrics([
    { type: 'tool/call', data: { name: 'tracy_site' } },
    {
      type: 'assistant/message',
      data: { usage: { cacheReadTokens: 40, uncachedInputTokens: 7, outputTokens: 8, llmMs: 20 } }
    }
  ])
  const turns = [
    { ...measured, completed: true, oraclePassed: true, elapsedMs: 30 },
    { ...measured, completed: false, oraclePassed: false, elapsedMs: 50, output: null }
  ]
  const totals = totalMetrics(turns)
  assert.equal(totals.toolCalls, 2)
  assert.equal(totals.cacheRead, 80)
  assert.equal(totals.elapsedMs, 80)
  assert.equal(totals.output, null)
  assert.equal(totals.oraclePassed, 1)
  assert.deepEqual(totals.byTool, { tracy_site: 2 })
})
