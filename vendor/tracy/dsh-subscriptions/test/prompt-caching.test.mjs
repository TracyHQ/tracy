import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSystemPrefix,
  anthropicPayload,
  codexResponsesBody,
  googleContents,
} from '../lib/messages.js'

test('normalizeSystemPrefix handles whitespace and CRLF normalization', () => {
  assert.equal(normalizeSystemPrefix(null), '')
  assert.equal(normalizeSystemPrefix([]), '')
  assert.equal(normalizeSystemPrefix(['  ']), '')

  const input = [
    'System prompt line 1\r\nline 2   ',
    '  ',
    { text: '  Tool instructions \r\nline 3  ' },
  ]
  const expected = 'System prompt line 1\nline 2\n\nTool instructions \nline 3'
  assert.equal(normalizeSystemPrefix(input), expected)
})

test('anthropicPayload attaches ephemeral cache control to system and last tool by default', () => {
  const options = {
    model: 'claude-3-7-sonnet-20250219',
    system: 'Base system instructions\r\n',
    tools: [
      { name: 'read_file', description: 'Reads file', parameters: { type: 'object' } },
      { name: 'write_file', description: 'Writes file', parameters: { type: 'object' } },
    ],
    messages: [
      { role: 'user', content: 'hello' },
    ],
  }

  const payload = anthropicPayload(options, 'Prefix CLI identity')
  assert.deepEqual(payload.system, [
    {
      type: 'text',
      text: 'Prefix CLI identity\n\nBase system instructions',
      cache_control: { type: 'ephemeral' },
    },
  ])

  assert.equal(payload.tools.length, 2)
  assert.equal(payload.tools[0].cache_control, undefined)
  assert.deepEqual(payload.tools[1].cache_control, { type: 'ephemeral' })
})

test('anthropicPayload respects cacheControl: false', () => {
  const options = {
    model: 'claude-3-7-sonnet-20250219',
    system: 'Instructions',
    cacheControl: false,
    tools: [
      { name: 'search', description: 'Search', parameters: { type: 'object' } },
    ],
    messages: [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2' },
    ],
  }

  const payload = anthropicPayload(options)
  assert.equal(typeof payload.system, 'string')
  assert.equal(payload.system, 'Instructions')
  assert.equal(payload.tools[0].cache_control, undefined)
  assert.equal(payload.messages[0].content[0].cache_control, undefined)
})

test('anthropicPayload attaches cache control to the second-to-last user turn in multi-turn chat', () => {
  const options = {
    model: 'claude-3-7-sonnet-20250219',
    messages: [
      { role: 'user', content: 'First user query' },
      { role: 'assistant', content: 'First assistant response' },
      { role: 'user', content: 'Second user query' },
      { role: 'assistant', content: 'Second assistant response' },
      { role: 'user', content: 'Latest user query' },
    ],
  }

  const payload = anthropicPayload(options)
  assert.equal(payload.messages.length, 5)

  // Turn 0 (First user turn) should not have cache_control
  assert.equal(payload.messages[0].content[0].cache_control, undefined)

  // Turn 2 (Second-to-last user turn) should have ephemeral cache_control
  assert.deepEqual(payload.messages[2].content[0].cache_control, { type: 'ephemeral' })

  // Turn 4 (Latest user turn) should not have cache_control
  assert.equal(payload.messages[4].content[0].cache_control, undefined)
})

test('codexResponsesBody normalizes instructions prefix for stable cache key', () => {
  const options = {
    model: 'o3-mini',
    system: 'Instructions with CRLF\r\nand trailing spaces   ',
    messages: [{ role: 'user', content: 'hello' }],
  }

  const body = codexResponsesBody(options, 'fallback')
  assert.equal(body.instructions, 'Instructions with CRLF\nand trailing spaces')
})

test('googleContents normalizes system instructions prefix', () => {
  const options = {
    model: 'gemini-2.5-pro',
    system: 'Instructions line 1\r\nline 2   ',
    messages: [{ role: 'user', content: 'hello' }],
  }

  const contents = googleContents(options)
  assert.deepEqual(contents.systemInstruction, {
    parts: [{ text: 'Instructions line 1\nline 2' }],
  })
})
