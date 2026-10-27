// The seeder's `chat()` sends the temperature its caller asked for. It used to build the request
// body from model, messages, modalities and max_tokens only, so a caller asking for a steady answer
// (`temperature: 0`) got the provider's default and the same plan came out different run to run
// (JA Boxing 1.0.4 on dev, 25/10/2026: three identical briefs renamed 25, 5 and 2 menu labels).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chat } from '../src/model.mjs'

const door = { url: 'https://model.test/v1/chat', key: 'k' }
const answer = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], model: 'm' }), { status: 200 })

/** The JSON body `chat()` sends for `req`. */
async function bodyOf(req) {
  let sent = null
  await chat(
    door,
    req,
    async (_url, init) => {
      sent = JSON.parse(String(init.body))
      return answer()
    },
    { retryDelayMs: 0 }
  )
  return sent
}

test('a temperature the caller sets reaches the provider, zero included', async () => {
  const messages = [{ role: 'user', content: 'hi' }]
  assert.equal((await bodyOf({ model: 'm', messages, temperature: 0 })).temperature, 0)
  assert.equal((await bodyOf({ model: 'm', messages, temperature: 0.4 })).temperature, 0.4)
})

test('no temperature asked: none is sent, the provider default stays', async () => {
  const body = await bodyOf({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })
  assert.equal('temperature' in body, false)
})
