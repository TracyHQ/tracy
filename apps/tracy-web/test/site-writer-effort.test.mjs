import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runAgent } from '../src/lib/agent-over-door.js'
import { benchHarnessFor, capsOf } from '../src/lib/bench-harness.js'
import { runCli } from '../src/site-writer/bench-cli.js'
import { deepseekStreamOf, finalReply, scriptedModel } from './_agent-over-door-fake.mjs'

test('an explicit writer effort reaches the native wire without reducing answer capacity or changing retries', async () => {
  const original = benchHarnessFor('deepseek-flash', 'deepseek')
  const chosen = benchHarnessFor('deepseek-flash', 'deepseek', { effort: 'high' })
  assert.deepEqual(chosen, { ...original, effort: 'high' })
  const harness = capsOf(chosen, true)
  assert.equal(harness.budgetUsd, undefined)
  assert.equal(harness.maxTokens, 128000)
  assert.deepEqual(harness.retry, original.retry)
  const model = scriptedModel([{ sse: deepseekStreamOf(finalReply({ content: '{"slots":[]}' })) }])
  const result = await runAgent({
    door: { baseUrl: 'https://models.example.test/v1', apiKey: 'test-key', model: 'deepseek-flash' },
    system: 'Write the requested copy as JSON.',
    firstUser: 'Return an empty slots array for this empty test plan.',
    tools: [],
    ...harness,
    sleep: async () => {},
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.answer, '{"slots":[]}')
  assert.equal(model.requests[0].body.reasoning_effort, 'high')
  assert.equal(model.requests[0].body.max_tokens, 128000)
  assert.equal(benchHarnessFor('deepseek-flash', 'deepseek').effort, 'max')
})

test('effort overrides accept only measured native Flash choices and never guess another profile support', () => {
  for (const effort of ['low', 'high', 'max'])
    assert.equal(benchHarnessFor('deepseek-flash', 'deepseek', { effort }).effort, effort)
  for (const effort of ['', null, 'medium', 'off', 1])
    assert.throws(() => benchHarnessFor('deepseek-flash', 'deepseek', { effort }), {
      code: 'BENCH_EFFORT_UNSUPPORTED'
    })
  for (const [model, provider] of [
    ['deepseek-flash', 'openrouter'],
    ['deepseek-v4-pro', 'deepseek'],
    ['anthropic/test-model', 'openrouter'],
    ['unknown-model', 'other']
  ])
    assert.throws(() => benchHarnessFor(model, provider, { effort: 'high' }), {
      code: 'BENCH_EFFORT_UNSUPPORTED'
    })
})

test('the writer CLI rejects invalid effort before reading files or touching the database', async () => {
  const errors = []
  const code = await runCli(
    [
      'run',
      '--plan-file',
      'absent.json',
      '--kit',
      'test-kit',
      '--brief-file',
      'absent.json',
      '--effort',
      'medium'
    ],
    {
      pool: {
        query() {
          assert.fail('invalid effort must not query the database')
        }
      },
      secret: '',
      out() {},
      err: (line) => errors.push(line)
    }
  )
  assert.equal(code, 2)
  assert.match(errors[0], /--effort takes low, high or max/)
})
