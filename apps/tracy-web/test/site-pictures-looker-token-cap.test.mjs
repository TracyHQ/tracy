// The looker's token cap leaves room for a reasoning model's thinking (ADR 0043 section 3b): its reasoning tokens count
// against max_tokens, so a cap near the answer's own size cuts the answer off before its JSON object, and the look
// is unreadable. A cut answer says so. A fake endpoint stands in for the model; no real call.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askLooker } from '../src/site-pictures/looker-call.js'

const door = {
  providerId: 'openrouter',
  baseUrl: 'https://models.test/api/v1',
  apiKey: 'k',
  model: 'openai/gpt-6-luna'
}
const image = { base64: 'AAAA', width: 448, height: 437 }
const words = { shows: 'a coach holding pads', mustInclude: [], avoid: [], mood: 'calm' }
const ANSWER = '{"verdict":"pass","faults":[],"seen":"A coach holds pads for a boxer in a gym."}'

// A reasoning model that thinks for `thinking` tokens before it writes a 40 token answer.
const reasoningModel = (thinking) => async (_url, init) => {
  const cap = JSON.parse(init.body).max_tokens
  const cut = thinking + 40 > cap
  const body = {
    model: door.model,
    choices: [
      { finish_reason: cut ? 'length' : 'stop', message: { role: 'assistant', content: cut ? '' : ANSWER } }
    ],
    usage: {
      prompt_tokens: 1064,
      completion_tokens: cut ? cap : thinking + 40,
      completion_tokens_details: { reasoning_tokens: cut ? cap : thinking },
      cost: 0.0004
    }
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('a look whose model thinks for 600 tokens still gets its answer', async () => {
  const got = await askLooker({
    door,
    system: 'look',
    words,
    image,
    outlined: false,
    fetchImpl: reasoningModel(600)
  })
  assert.equal(got.problem, undefined)
  assert.equal(got.verdict, 'pass')
})

test('an answer cut off at the token cap says so', async () => {
  const got = await askLooker({
    door,
    system: 'look',
    words,
    image,
    outlined: false,
    fetchImpl: reasoningModel(100_000)
  })
  assert.equal(got.verdict, null)
  assert.match(got.problem, /cut off at the token cap/)
})
