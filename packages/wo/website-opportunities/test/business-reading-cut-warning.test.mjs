// A business reading cut off by the token limit is a recorded warning, never a silent fall back to the rules (#617
// review, 2026-11-14): on a machine whose provider model list was never refreshed the door cannot turn reasoning off,
// the model reasons through its whole budget, and the reading used to fall back to rules with nothing said. The
// reading now carries a typed `warning` (and the brief keeps it), and the step logs it. A fresh list (reasoning off)
// reads as before. Invented studio, fake provider.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/business-reading-cut-warning.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { readBusiness } from '../src/business-reading.js'

const ANSWER = {
  services: [{ name: 'Wheel classes', quote: 'Wheel classes every Monday', ref: 'bio' }],
  audience: [],
  team: [],
  story: []
}
const door = (effort) => ({
  state: 'ready',
  door: { url: 'https://model.test/chat/completions', key: 'k', model: 'model-test', effort }
})
/** A provider that reasons `reasoning` tokens inside `max_tokens`, then answers when room is left. */
const provider = (reasoning) => async (_url, init) => {
  const body = JSON.parse(init.body)
  const cut = reasoning >= body.max_tokens
  return Response.json({
    choices: [
      { finish_reason: cut ? 'length' : 'stop', message: { content: cut ? '' : JSON.stringify(ANSWER) } }
    ],
    usage: {
      prompt_tokens: 900,
      completion_tokens: cut ? body.max_tokens : reasoning + 200,
      completion_tokens_details: { reasoning_tokens: Math.min(reasoning, body.max_tokens) }
    }
  })
}
async function read(effort, reasoning) {
  const warned = []
  const reading = await readBusiness({
    name: 'Kilnmere Pottery Studio',
    bio: 'Wheel classes every Monday at Kilnmere Pottery Studio.',
    door: door(effort),
    charge: (_spec, call) => call(),
    fetchImpl: provider(reasoning),
    log: { warn: (...args) => warned.push(args) }
  })
  return { reading, warned }
}

test('reasoning that could not be turned off and used the whole budget is a typed, logged warning', async () => {
  const { reading, warned } = await read(null, 1_000_000)
  assert.equal(reading.method, 'rules')
  assert.equal(reading.reason, 'truncated')
  assert.equal(reading.warning.code, 'reasoning_not_off')
  assert.equal(reading.warning.maxTokens, 12_000)
  assert.equal(reading.warning.reasoningTokens, 12_000)
  assert.match(reading.warning.message, /model list/)
  assert.equal(warned.length, 1)
  assert.match(warned[0][0], /cut off/)
})

test('an answer cut with reasoning off is a warning of its own kind', async () => {
  const { reading, warned } = await read('off', 1_000_000)
  assert.equal(reading.reason, 'truncated')
  assert.equal(reading.warning.code, 'answer_cut')
  assert.equal(warned.length, 1)
})

test('with a fresh model list (reasoning off) a reading that fits has no warning', async () => {
  const { reading, warned } = await read('off', 0)
  assert.equal(reading.method, 'model')
  assert.equal(reading.warning, undefined)
  assert.equal(warned.length, 0)
})
