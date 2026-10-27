import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { Context } from '../../../vendor/tracy/deepseek-harness/vendor/cordis/lib/index.js'
import LocalAttachmentStore from '../../../vendor/tracy/deepseek-harness/packages/attachment/attachment-local/lib/index.js'
import {
  DeepSeekAdapter,
  DeepSeekFileStore,
  DeepSeekUploadIndex,
  resolveAdapterOptions,
  DEFAULT_MAX_INLINE_REQUEST_IMAGE_BYTES
} from '../../../vendor/tracy/deepseek-harness/packages/llm/llm-deepseek/lib/index.js'
import {
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
  BlockAssembler
} from '../../../vendor/tracy/deepseek-harness/packages/llm/llm/lib/index.js'

const model = 'deepseek-flash',
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const events = [
  { type: 'message_start', message: { id: 'native-message', model, usage: { input_tokens: 10 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'Native thinking stays in the native stream.' }
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'native-signature' }
  },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Pixel review ✓' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } },
  { type: 'message_stop' }
]
const sse = Buffer.from(
  events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
)

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'wo-quality-native-inline-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const attachments = new LocalAttachmentStore(new Context(), { dshHome: join(home, 'attachments-home') })
  const requests = [],
    files = new Map(),
    state = { inline: false, filesCalls: 0 }
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const chunks = []
      for await (const chunk of incoming) chunks.push(chunk)
      const bytes = Buffer.concat(chunks)
      const url = `http://127.0.0.1${incoming.url}`
      if (incoming.url.endsWith('/files')) {
        state.filesCalls++
        outgoing.setHeader('content-type', 'application/json')
        if (state.inline) {
          outgoing.statusCode = 400
          outgoing.end(
            JSON.stringify({
              error: { type: 'invalid_request_error', message: 'LEGACY_FILES_DISABLED_INLINE_ONLY' }
            })
          )
          return
        }
        const form = await new Request(url, {
          method: incoming.method,
          body: bytes,
          headers: incoming.headers
        }).formData()
        const file = form.get('file'),
          content = Buffer.from(await file.arrayBuffer()),
          id = `file-${files.size + 1}`
        files.set(id, { bytes: content, mime: file.type })
        outgoing.end(
          JSON.stringify({
            id,
            type: 'file',
            mime_type: file.type,
            size_bytes: content.length,
            filename: file.name,
            created_at: new Date().toISOString()
          })
        )
        return
      }
      assert.equal(incoming.url, '/anthropic/v1/messages')
      requests.push({ body: JSON.parse(bytes.toString()), headers: incoming.headers, bytes })
      outgoing.setHeader('content-type', 'text/event-stream')
      // Real HTTP and split UTF-8/SSE framing exercise the native transport parser.
      for (let i = 0; i < sse.length; i += 37) outgoing.write(sse.subarray(i, i + 37))
      outgoing.end()
    })().catch((error) => outgoing.destroy(error))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const baseURL = `http://127.0.0.1:${server.address().port}/anthropic`
  let index = 0
  const adapter = () =>
    new DeepSeekAdapter({
      options: () => resolveAdapterOptions({ baseURL, reasoningEffort: 'low' }),
      resolveAuth: async () => ({ headers: { 'x-api-key': 'fixture-key' } }),
      resolveUserId: () => 'fixture-user',
      resolveAttachments: () => attachments,
      resolveImageAccess: (_store, ref) => ({ readonlyPath: `/site/fixture/${ref.name ?? 'image.png'}` }),
      resolveFiles: () =>
        new DeepSeekFileStore({ index: new DeepSeekUploadIndex(join(home, `files-${++index}.json`)) }),
      prepareExtensions: async () => ({ fields: {}, accept: async () => {} })
    })
  const saveImage = async (width, height, color) =>
    attachments.saveImage({
      data: await sharp({ create: { width, height, channels: 3, background: color } })
        .png()
        .toBuffer(),
      mediaType: 'image/png',
      name: `${color.replace('#', '')}.png`
    })
  return { home, attachments, requests, files, state, adapter, saveImage }
}
const options = (messages) => ({
  provider: 'deepseek-official',
  model,
  sessionId: 'owned-session',
  messages,
  tools: [
    {
      name: 'read_image',
      description: 'Read the selected image.',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
})
async function run(adapter, input) {
  const chunks = [],
    assembler = new BlockAssembler()
  for await (const chunk of adapter.stream(input)) {
    chunks.push(chunk)
    assembler.push(chunk)
  }
  return {
    chunks,
    message: createAssistantMessage({
      content: assembler.blocks(),
      source: {
        provider: 'deepseek-official',
        model,
        replayState: assembler.replayState
      }
    })
  }
}
function semanticWire(value, files) {
  if (Array.isArray(value)) return value.map((entry) => semanticWire(entry, files))
  if (!value || typeof value !== 'object') return value
  if (value.type === 'image') {
    const image =
      value.source.type === 'file'
        ? files.get(value.source.file_id)
        : {
            bytes: Buffer.from(value.source.data, 'base64'),
            mime: value.source.media_type
          }
    assert.ok(image)
    return { type: 'image', sha256: hash(image.bytes), mime: image.mime, bytes: image.bytes.length }
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, semanticWire(entry, files)]))
}

test('actual native adapter and Files client retain image versions, ordering, tools, thinking and replay through HTTP inline fallback', async (t) => {
  const f = await fixture(t),
    first = await f.saveImage(800, 600, '#805a32'),
    second = await f.saveImage(500, 700, '#aabbcc')
  const messages = [
    createUserMessage({
      source: { kind: 'user' },
      content: [
        { type: 'text', text: 'Keep text and pixels in order.' },
        { type: 'image', attachment: first }
      ]
    }),
    createAssistantMessage({
      source: { provider: 'deepseek-official', model },
      content: [{ type: 'tool-call', id: 'image-call', name: 'read_image', arguments: '{}' }]
    }),
    createToolResultMessage({
      callId: 'image-call',
      isError: false,
      content: [
        { type: 'text', text: 'Tool image result.' },
        { type: 'image', attachment: second },
        { type: 'image', attachment: first }
      ]
    })
  ]
  const input = options(messages),
    before = JSON.stringify(input)
  const nativeFiles = await run(f.adapter(), input)
  assert.equal(f.files.size, 2)
  const filesWire = f.requests[0].body
  f.state.inline = true
  const inline = await run(f.adapter(), input),
    inlineWire = f.requests[1].body
  assert.deepEqual(semanticWire(inlineWire, f.files), semanticWire(filesWire, f.files))
  assert.deepEqual(inline.chunks, nativeFiles.chunks)
  assert.equal(inlineWire.max_tokens, 256000)
  assert.deepEqual(inlineWire.thinking, { type: 'enabled' })
  assert.equal(inlineWire.output_config.effort, 'low')
  assert.equal(JSON.stringify(input), before)
  assert.equal(f.requests[1].headers['anthropic-beta'], undefined)
  assert.equal(f.requests[1].headers['x-deepseek-harness-session-id'], 'owned-session')
  for (const image of f.files.values()) {
    const info = await sharp(image.bytes).metadata()
    assert.ok(
      [
        [800, 600],
        [500, 700]
      ].some(([w, h]) => info.width === w && info.height === h)
    )
    assert.equal(image.mime, 'image/png')
  }
  const replay = options([
    ...messages,
    inline.message,
    createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] })
  ])
  await run(f.adapter(), replay)
  const replayWire = f.requests[2].body
  assert.ok(JSON.stringify(replayWire).includes('native-signature'))
  assert.ok(JSON.stringify(replayWire).includes('Native thinking stays in the native stream.'))
})

test('actual adapter preserves images below the default 20 MiB inline cap and reports durable offload before sending a larger request', async (t) => {
  const f = await fixture(t),
    pixels = Buffer.alloc(1024 * 1024 * 3)
  let seed = 0x2545f491
  for (let i = 0; i < pixels.length; i++) {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    pixels[i] = seed & 255
  }
  const attachment = await f.attachments.saveImage({
    data: await sharp(pixels, {
      raw: { width: 1024, height: 1024, channels: 3 }
    })
      .png()
      .toBuffer(),
    mediaType: 'image/png'
  })
  const message = (count) =>
    options([
      createUserMessage({
        source: { kind: 'user' },
        content: Array.from({ length: count }, () => ({ type: 'image', attachment }))
      })
    ])
  await run(f.adapter(), message(1))
  const image = [...f.files.values()][0],
    encodedBytes = 4 * Math.ceil(image.bytes.length / 3)
  const below = Math.floor(DEFAULT_MAX_INLINE_REQUEST_IMAGE_BYTES / encodedBytes)
  assert.ok(below >= 1 && below < 600)
  f.state.inline = true
  await run(f.adapter(), message(below))
  const countBefore = f.requests.length
  await assert.rejects(run(f.adapter(), message(below + 1)), (error) => {
    assert.equal(error.failure.code, 'IMAGE_OFFLOAD_REQUIRED')
    assert.ok(error.failure.offloadImages >= 1)
    return true
  })
  assert.equal(f.requests.length, countBefore)
  assert.ok(below * encodedBytes <= DEFAULT_MAX_INLINE_REQUEST_IMAGE_BYTES)
  assert.ok((below + 1) * encodedBytes > DEFAULT_MAX_INLINE_REQUEST_IMAGE_BYTES)
  assert.ok(f.state.filesCalls >= 3)
})
