import assert from 'node:assert/strict'
import { channel } from 'node:diagnostics_channel'
import { test } from 'node:test'
import { chat } from '../src/model.mjs'

const calls = channel('tracy.picture-model-call')
const door = { url: 'https://model.test/chat', key: 'fictional-key' }

test('a fictional bakery drawing is observed through the response body read', async () => {
  const events = []
  const receive = (event) => events.push(event)
  calls.subscribe(receive)
  try {
    await chat(
      door,
      { model: 'drawing', images: true, messages: [{ role: 'user', content: 'A fictional bakery' }] },
      async () => ({
        ok: true,
        json: async () => {
          assert.equal(events.length, 1, 'the drawing is active while its answer is read')
          return { choices: [{ message: { content: 'done' } }] }
        }
      }),
      { retryDelayMs: 0 }
    )
    assert.deepEqual(
      events.map(({ phase, kind }) => ({ phase, kind })),
      [
        { phase: 'start', kind: 'drawing' },
        { phase: 'end', kind: 'drawing' }
      ]
    )
    assert.equal(events[0].token, events[1].token)
  } finally {
    calls.unsubscribe(receive)
  }
})

test('dental vision retries each failed provider call and always ends observation', async () => {
  const events = []
  const receive = (event) => events.push(event)
  calls.subscribe(receive)
  try {
    await assert.rejects(
      chat(
        door,
        {
          model: 'vision',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'A fictional dental clinic' },
                { type: 'input_image', image_url: 'data:image/png;base64,eA==' }
              ]
            }
          ]
        },
        async () => {
          throw new Error('provider unavailable')
        },
        { retryDelayMs: 0 }
      ),
      /provider unavailable/
    )
    assert.deepEqual(
      events.map(({ phase, kind }) => ({ phase, kind })),
      Array.from({ length: 3 }, () => [
        { phase: 'start', kind: 'vision' },
        { phase: 'end', kind: 'vision' }
      ]).flat()
    )
    for (let i = 0; i < events.length; i += 2) assert.equal(events[i].token, events[i + 1].token)
    assert.notEqual(events[0].token, events[2].token)
  } finally {
    calls.unsubscribe(receive)
  }
})

test('text-only model requests produce no picture observations', async () => {
  const events = []
  const receive = (event) => events.push(event)
  calls.subscribe(receive)
  try {
    await chat(
      door,
      { model: 'words', messages: [{ role: 'user', content: 'A fictional bakery' }] },
      async () => new Response(JSON.stringify({ choices: [] }))
    )
    assert.deepEqual(events, [])
  } finally {
    calls.unsubscribe(receive)
  }
})
