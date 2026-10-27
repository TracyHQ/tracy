import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  legacyMessagesUsage,
  legacyRequestBudget,
  legacyUsageCost
} from '../src/opportunities-build/quality-legacy-wire.js'

const now = () => Date.parse('2026-10-20T12:00:00Z')
const config = {
  acceptedModels: ['deepseek-flash', 'deepseek-v4-flash'],
  capabilities: { vision: true },
  price: {
    inputCentsPerM: 30,
    outputCentsPerM: 120,
    cacheCentsPerM: 0.6,
    maxImageTokens: 1024,
    validUntil: '2026-10-27T00:00:00Z',
    searchCentsPerUse: 0,
    searchValidUntil: '2026-10-31T16:00:00Z'
  }
}
const body = () => ({
  model: 'deepseek-flash',
  max_tokens: 256000,
  thinking: { type: 'enabled' },
  output_config: { effort: 'low' },
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Keep this prompt unchanged.' }] }]
})
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
test('legacy wire preserves the actual output/effort/tool limits and accounts for ordered image occurrences', async () => {
  const images = await Promise.all(
    ['#79583d', '#aabbcc'].map((background) =>
      sharp({ create: { width: 800, height: 600, channels: 3, background } })
        .png()
        .toBuffer()
    )
  )
  const blocks = images.map((bytes) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: bytes.toString('base64') }
  }))
  const request = body()
  request.messages[0].content.push(blocks[0], {
    type: 'tool_result',
    tool_use_id: 'tool',
    content: [blocks[1], blocks[0]]
  })
  request.tools = [{ name: 'read', input_schema: { type: 'object', properties: {} } }]
  const saved = JSON.stringify(request),
    budget = await legacyRequestBudget(request, config, { now })
  assert.equal(JSON.stringify(request), saved)
  assert.equal(budget.maxOutputTokens, 256000)
  assert.deepEqual(budget.thinking, { type: 'enabled' })
  assert.equal(budget.reasoningEffort, 'low')
  assert.deepEqual(
    budget.images.map((i) => i.sha256),
    [hash(images[0]), hash(images[1]), hash(images[0])]
  )
  assert.ok(budget.images.every((i) => i.mime === 'image/png' && i.width === 800 && i.height === 600))
  assert.equal(JSON.stringify(budget).includes('Keep this prompt'), false)
  assert.equal(JSON.stringify(budget).includes(blocks[0].source.data), false)
})
test('remote file IDs, unsupported providers/tools/images and unknown price cannot escape preflight', async () => {
  for (const change of [
    { model: 'another-model' },
    { max_tokens: 0 },
    { max_tokens: 384001 },
    {
      messages: [
        { role: 'user', content: [{ type: 'image', source: { type: 'file', file_id: 'not-ours' } }] }
      ]
    },
    { messages: [{ role: 'user', content: [{ type: 'file', file_id: 'not-ours' }] }] },
    { tools: [{ type: 'unknown-paid-tool' }] },
    { tools: [{ type: 'web_search_20250305', max_uses: 6 }] }
  ])
    await assert.rejects(legacyRequestBudget({ ...body(), ...change }, config, { now }))
  await assert.rejects(
    legacyRequestBudget(body(), config, { now: () => Date.parse('2026-10-28T00:00:00Z') }),
    /PRICE_UNKNOWN/
  )
  const search = {
    ...body(),
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
  }
  assert.equal((await legacyRequestBudget(search, config, { now })).serverToolMaxUses, 5)
})
test('native history attachment references and tool JSON remain opaque while actual wire pixels are measured', async () => {
  const pixels = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#79583d' } })
    .png()
    .toBuffer()
  const request = body()
  request.messages[0].content.push({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: pixels.toString('base64') }
  })
  request.messages.push({
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'cms-read', name: 'cms', input: { type: 'image', file_id: 'cms-id' } }]
  })
  request.tools = [
    {
      name: 'cms',
      input_schema: { type: 'object', properties: { example: { default: { type: 'image' } } } }
    }
  ]
  const plain = await legacyRequestBudget(request, config, { now })
  request.dsh_session_log = {
    events: [
      {
        data: {
          message: {
            content: [
              {
                type: 'image',
                attachment: {
                  attachmentId: `sha256:${hash(pixels)}`,
                  mediaType: 'image/png',
                  width: 32,
                  height: 24
                },
                note: 'Synthetic private replay metadata'
              }
            ]
          }
        }
      }
    ]
  }
  const saved = JSON.stringify(request)
  const budget = await legacyRequestBudget(request, config, { now })
  assert.equal(JSON.stringify(request), saved)
  assert.deepEqual(
    budget.images.map(({ sha256, width, height }) => ({ sha256, width, height })),
    [{ sha256: hash(pixels), width: 32, height: 24 }]
  )
  assert.equal(budget.maxInputTokens - plain.maxInputTokens, budget.requestBytes - plain.requestBytes)
  assert.equal(JSON.stringify(budget).includes('Synthetic private replay metadata'), false)
  const metadataOnly = structuredClone(request)
  metadataOnly.messages[0].content = [{ type: 'text', text: 'Metadata is not vision input.' }]
  assert.equal(
    (await legacyRequestBudget(metadataOnly, { ...config, capabilities: { vision: false } }, { now })).images
      .length,
    0
  )
  for (const invalid of [
    { type: 'file', file_id: 'provider-file' },
    { type: 'image', source: { type: 'file', file_id: 'provider-file' } }
  ]) {
    const bad = structuredClone(request)
    bad.messages[0].content = [{ type: 'tool_result', tool_use_id: 'tool', content: [invalid] }]
    await assert.rejects(legacyRequestBudget(bad, config, { now }), /REMOTE_FILE_FORBIDDEN/)
  }
})
test('an unsupported image reports its wire location and shape without retaining pixels or a remote secret', async () => {
  const remote = 'https://private.example/image?token=synthetic-secret'
  const request = body()
  request.messages[0].content = [
    { type: 'image', source: { type: 'url', url: remote, media_type: 'image/avif', data: 'private pixels' } }
  ]
  await assert.rejects(legacyRequestBudget(request, config, { now }), (error) => {
    assert.equal(error.code, 'LEGACY_IMAGE_SOURCE_UNSUPPORTED')
    assert.deepEqual(error.details, {
      at: '$.messages[0].content[0]',
      sourceType: 'url',
      mediaType: 'image/avif',
      dataType: 'string',
      dataLength: 14,
      validBase64: false
    })
    assert.equal(JSON.stringify(error.details).includes(remote), false)
    assert.equal(JSON.stringify(error.details).includes('private pixels'), false)
    return true
  })
})
test('SSE usage accepts arbitrary byte boundaries and CRLF without persisting thinking or tool content', () => {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'receipt',
        model: 'deepseek-flash',
        usage: { input_tokens: 100, cache_read_input_tokens: 200 }
      }
    },
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Private reasoning — chữ.' } },
    {
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"privateToolInput":true}' }
    },
    { type: 'message_delta', usage: { output_tokens: 50 } },
    { type: 'message_stop' }
  ]
  const wire = Buffer.from(
    events.map((event) => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join('')
  )
  const parser = legacyMessagesUsage()
  for (const byte of wire) parser.push(Buffer.from([byte]))
  const receipt = parser.finish()
  assert.deepEqual(receipt, {
    requestId: 'receipt',
    model: 'deepseek-flash',
    usage: { input_tokens: 100, cache_read_input_tokens: 200, output_tokens: 50 }
  })
  assert.equal(JSON.stringify(receipt).includes('Private'), false)
  assert.equal(JSON.stringify(receipt).includes('privateToolInput'), false)
})
test('incomplete and in-band error streams retain unknown spend instead of inventing zero usage', () => {
  const parser = legacyMessagesUsage()
  parser.push(Buffer.from('data: {"type":"message_start","message":{"usage":{"input_tokens":1}}}\n\n'))
  assert.throws(() => parser.finish(), /INCOMPLETE/)
  const errored = legacyMessagesUsage()
  assert.throws(
    () => errored.push(Buffer.from('data: {"type":"error","error":{"message":"private"}}\n\n')),
    /STREAM_ERROR/
  )
})
test('a complete message_stop receipt is available before HTTP EOF without claiming unseen trailing bytes', () => {
  const parser = legacyMessagesUsage()
  parser.push(
    Buffer.from(
      'data: {"type":"message_start","message":{"id":"message","model":"deepseek-flash","usage":{"input_tokens":10}}}\n\n'
    )
  )
  assert.equal(parser.ready(), null)
  parser.push(Buffer.from('data: {"type":"message_delta","usage":{"output_tokens":20}}\n\n'))
  assert.equal(parser.ready(), null)
  parser.push(Buffer.from('data: {"type":"message_stop"}\n\n'))
  assert.deepEqual(parser.ready(), {
    requestId: 'message',
    model: 'deepseek-flash',
    usage: { input_tokens: 10, output_tokens: 20 }
  })
  const snapshot = parser.ready()
  snapshot.usage.input_tokens = 999
  assert.equal(parser.ready().usage.input_tokens, 10)
  // A caller choosing to read beyond stop can detect errors; a stop receipt has no such coverage.
  assert.throws(() => parser.push(Buffer.from('data: {"type":"error"}\n\n')), /AFTER_STOP/)
})
test('Messages cumulative cache tokens and Chat total tokens use their respective peak upper bounds', () => {
  const receipt = {
    model: 'deepseek-flash',
    startedAt: new Date(now()).toISOString(),
    usage: {
      input_tokens: 1000,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 200,
      output_tokens: 100
    }
  }
  assert.equal(legacyUsageCost(receipt, config), 0.051)
  const chat = {
    ...receipt,
    usage: { prompt_tokens: 6200, prompt_cache_hit_tokens: 5000, completion_tokens: 100 }
  }
  assert.equal(legacyUsageCost(chat, config, { flavor: 'chat' }), 0.051)
  for (const change of [
    { model: 'unknown' },
    { startedAt: 'bad' },
    { usage: null },
    { usage: { input_tokens: 1 } }
  ])
    assert.equal(legacyUsageCost({ ...receipt, ...change }, config), null)
})
