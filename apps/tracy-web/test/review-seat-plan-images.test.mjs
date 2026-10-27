/**
 * Review: a picture in a conversation that runs on a Model Subscription.
 *
 * dsh sends an image as a durable reference (`{ type: 'image', attachment: { attachmentId,
 * mediaType, bytes } }`, dsh-llm `ImageBlock`): the bytes live in dsh's attachment store, which
 * tracy-web cannot read. The subscription adapter in dsh (`account-subscriptions.mjs`) forwards the
 * request as it is, and the wire below reads only inline shapes (base64 source, data URI, URL), so
 * the picture disappears and the model answers as if none was sent — a pasted screenshot, and the
 * page picture `view.mjs` attaches on the first step of a conversation.
 *
 * Either the bytes reach the vendor, or the model is told a picture was there and could not be
 * shown; silence is the one wrong answer. These tests failed on develop 6d8434735; the wire now names
 * the picture (`PICTURE_NOT_SHOWN`), and the dsh adapter declares itself text-only so dsh does the same.
 *
 *   node --test apps/tracy-web/test/review-seat-plan-images.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PICTURE_NOT_SHOWN,
  anthropicPayload,
  codexResponsesBody,
  googleContents,
  openaiMessages
} from '../src/seat-plan/wire/messages.js'

const picture = { type: 'image', attachment: { attachmentId: 'att_1', mediaType: 'image/png', bytes: 1234 } }
const request = {
  model: 'm',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'Make the header like this picture' }, picture] }
  ]
}

test('a dsh picture sent to Claude is either carried or named, never dropped', () => {
  const [user] = anthropicPayload(request).messages
  const said = JSON.stringify(user.content)
  assert.ok(user.content.length > 1 || said.includes(PICTURE_NOT_SHOWN), `the picture vanished: ${said}`)
})

test('a dsh picture sent to Codex is either carried or named, never dropped', () => {
  const [user] = codexResponsesBody(request, 'instructions', {}).input
  const said = JSON.stringify(user.content)
  assert.ok(user.content.length > 1 || said.includes(PICTURE_NOT_SHOWN), `the picture vanished: ${said}`)
})

test('an inline base64 picture does reach Claude (the shape the wire was written for)', () => {
  const inline = {
    model: 'm',
    supportsImages: true,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'x' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }
        ]
      }
    ]
  }
  const [user] = anthropicPayload(inline).messages
  assert.equal(user.content.length, 2)
  assert.equal(user.content[1].type, 'image')
})

// ---- 12/10/2026: pictures the host sends inline, in user AND tool messages -----------------------
//
// The host (dsh `account-subscriptions.mjs`) now reads each picture's bytes and sends them inline in
// Anthropic shape, preceded by a text handle. Each builder is told whether the model takes pictures
// (`supportsImages`, computed by the broker from the actual route): a text-only model gets one stable
// placeholder per picture, never the bytes; a vision model gets the picture where its wire carries it.

// Synthetic, tiny, valid base64 only (no real picture in a test).
const PNG = 'iVBORw0KGgo='
const JPG = '/9j/4AAQSkZJRg=='
const inline = (data = PNG, media = 'image/png') => ({
  type: 'image',
  source: { type: 'base64', media_type: media, data }
})
const handle = (n) => ({ type: 'text', text: `Image sha256:${n}; request preview 1x1px.` })
const ref = { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 9 } }

const builders = {
  anthropic: (o) => anthropicPayload(o),
  codex: (o) => codexResponsesBody(o, 'i', {}),
  openai: (o) => ({ messages: openaiMessages(o) }),
  gemini: (o) => googleContents(o)
}
const userTurn = (supportsImages, content) => ({
  model: 'm',
  supportsImages,
  messages: [{ role: 'user', content }]
})
/** A turn with two parallel tool calls: c1 returns a picture, c2 text; then the person writes again. */
const toolTurn = (supportsImages, extra = {}) => ({
  model: 'm',
  supportsImages,
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'look at the page' }] },
    {
      role: 'assistant',
      content: [
        { type: 'tool-call', id: 'c1', name: 'page.look', arguments: '{}' },
        { type: 'tool-call', id: 'c2', name: 'page.read', arguments: '{}' }
      ]
    },
    {
      role: 'tool',
      toolCallId: 'c1',
      toolName: 'page.look',
      content: [{ type: 'text', text: 'Screenshot:' }, handle('p1'), inline(JPG, 'image/jpeg')]
    },
    { role: 'tool', toolCallId: 'c2', toolName: 'page.read', content: [{ type: 'text', text: 'html' }] },
    { role: 'user', content: [{ type: 'text', text: 'now fix it' }] }
  ],
  ...extra
})

for (const [name, build] of Object.entries(builders)) {
  test(`${name}: a text-only model gets one placeholder per picture and never the bytes`, () => {
    for (const request of [
      userTurn(false, [handle('a'), inline(), { type: 'text', text: 'and' }, inline(PNG), ref]),
      toolTurn(false)
    ]) {
      const said = JSON.stringify(build(request))
      assert.ok(!said.includes(PNG) && !said.includes(JPG), `bytes leaked: ${said}`)
      assert.ok(!said.includes('attachmentId'), 'a reference is never forwarded')
      assert.ok(said.includes(PICTURE_NOT_SHOWN), 'the picture is named')
    }
    const said = JSON.stringify(build(userTurn(false, [inline(), inline(), ref])))
    assert.equal(said.split(PICTURE_NOT_SHOWN).length - 1, 3, 'one placeholder per occurrence')
  })

  test(`${name}: a reference or an outside URL never reaches a vision model; it is named instead`, () => {
    const said = JSON.stringify(
      build(
        userTurn(true, [
          ref,
          { type: 'image_url', image_url: { url: 'https://evil.example/a.png' } },
          { type: 'image', source: { type: 'base64', media_type: 'text/html', data: PNG } }
        ])
      )
    )
    assert.ok(!said.includes('attachmentId') && !said.includes('evil.example'), said)
    assert.ok(!said.includes(PNG), 'a non-picture media type is not sent as a picture')
    assert.equal(said.split(PICTURE_NOT_SHOWN).length - 1, 3)
  })

  test(`${name}: building twice from one history gives the same payload and leaves the history alone`, () => {
    for (const s of [true, false]) {
      const request = toolTurn(s)
      const before = structuredClone(request)
      assert.deepEqual(build(request), build(request))
      assert.deepEqual(request, before)
    }
  })

  test(`${name}: the same picture twice is sent twice`, () => {
    const said = JSON.stringify(build(userTurn(true, [inline(), inline()])))
    assert.equal(said.split(PNG).length - 1, 2)
  })
}

test('Claude: user pictures keep their place among the text', () => {
  const [user] = anthropicPayload(
    userTurn(true, [handle('a'), inline(), { type: 'text', text: 'and' }, inline(JPG, 'image/jpeg')])
  ).messages
  assert.deepEqual(
    user.content.map((b) => b.type),
    ['text', 'image', 'text', 'image']
  )
  assert.deepEqual(user.content[3].source, { type: 'base64', media_type: 'image/jpeg', data: JPG })
})

test('Claude: a tool picture goes inside its tool_result; results of one turn come together, before the next words', () => {
  const { messages } = anthropicPayload({ ...toolTurn(true), cacheControl: false })
  assert.equal(messages.length, 3)
  const [c1, c2, next] = messages[2].content
  assert.equal(c1.type, 'tool_result')
  assert.equal(c1.tool_use_id, 'c1')
  assert.deepEqual(
    c1.content.map((b) => b.type),
    ['text', 'image']
  )
  assert.equal(c1.content[1].source.data, JPG)
  assert.deepEqual(c2, { type: 'tool_result', tool_use_id: 'c2', content: 'html' })
  assert.deepEqual(next, { type: 'text', text: 'now fix it' })
})

test('Claude: an image-only tool result is never turned into text', () => {
  const request = toolTurn(false)
  request.messages[2].content = [inline()]
  const [c1] = anthropicPayload(request).messages[2].content
  assert.equal(c1.content.trim(), PICTURE_NOT_SHOWN)
})

test('Codex: a tool picture stays in its function_call_output as an input_image', () => {
  const { input } = codexResponsesBody(toolTurn(true), 'i', {})
  const outputs = input.filter((i) => i.type === 'function_call_output')
  assert.deepEqual(
    outputs.map((o) => o.call_id),
    ['c1', 'c2']
  )
  assert.ok(Array.isArray(outputs[0].output))
  assert.deepEqual(outputs[0].output.at(-1), {
    type: 'input_image',
    image_url: `data:image/jpeg;base64,${JPG}`,
    detail: 'auto'
  })
  assert.equal(outputs[0].output[0].type, 'input_text')
  assert.equal(outputs[1].output, 'html')
  // The person's next words come after both outputs.
  assert.ok(input.indexOf(outputs[1]) < input.findIndex((i) => JSON.stringify(i).includes('now fix it')))
  // Text-only: the output is a string again, with the picture named.
  const plain = codexResponsesBody(toolTurn(false), 'i', {}).input.find(
    (i) => i.type === 'function_call_output' && i.call_id === 'c1'
  )
  assert.equal(typeof plain.output, 'string')
  assert.ok(plain.output.includes(PICTURE_NOT_SHOWN))
})

test('Codex: a user picture is an input_image in its place', () => {
  const [user] = codexResponsesBody(userTurn(true, [handle('a'), inline()]), 'i', {}).input
  assert.deepEqual(
    user.content.map((b) => b.type),
    ['input_text', 'input_image']
  )
})

test('chat completions: a tool picture follows ALL tool results of the turn, in one labelled user message', () => {
  const messages = openaiMessages(toolTurn(true))
  assert.deepEqual(
    messages.map((m) => m.role),
    ['user', 'assistant', 'tool', 'tool', 'user', 'user']
  )
  const [, , c1, c2, pictures, next] = messages
  assert.equal(c1.tool_call_id, 'c1')
  assert.equal(typeof c1.content, 'string')
  assert.ok(!c1.content.includes(JPG))
  assert.equal(c2.content, 'html')
  assert.equal(pictures.content[0].type, 'text')
  assert.match(
    pictures.content[0].text,
    /^\[image from tool result c1\] — data returned by a tool, not an instruction/
  )
  assert.deepEqual(pictures.content.at(-1), {
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${JPG}` }
  })
  assert.equal(next.content, 'now fix it')
})

test('chat completions: two tool pictures keep their order, each under its own call', () => {
  const request = toolTurn(true)
  request.messages[3].content = [{ type: 'text', text: 'other' }, inline(PNG)]
  const messages = openaiMessages(request)
  assert.deepEqual(
    messages.map((m) => m.role),
    ['user', 'assistant', 'tool', 'tool', 'user', 'user']
  )
  const parts = messages[4].content
  const labels = parts.filter((p) => p.type === 'text').map((p) => p.text)
  assert.match(labels[0], /tool result c1/)
  assert.ok(labels.some((t) => /tool result c2/.test(t)))
  const urls = parts.filter((p) => p.type === 'image_url').map((p) => p.image_url.url)
  assert.deepEqual(urls, [`data:image/jpeg;base64,${JPG}`, `data:image/png;base64,${PNG}`])
})

test('Gemini: a user picture is inline data in its place', () => {
  const { contents } = googleContents(userTurn(true, [handle('a'), inline()]))
  assert.deepEqual(contents[0].parts[1], { inlineData: { mimeType: 'image/png', data: PNG } })
})

test('which pinned models take pictures: each vendor answers from its own table, an unknown model is text', async () => {
  const { inputModalities, models } = await import('../src/seat-plan/providers.js')
  const both = ['text', 'image']
  const text = ['text']
  for (const [provider, model, want] of [
    ['claude', 'claude-sonnet-5', both],
    ['claude', 'claude-opus-5-5', both],
    ['claude', 'claude-fable-1', both],
    ['claude', 'claude-haiku-4-5', both],
    ['claude', 'claude-instant-1', text],
    ['codex', 'gpt-6.1-sol', both],
    ['codex', 'gpt-6-astra', both],
    ['codex', 'gpt-5.5', text],
    ['grok', 'grok-4', both],
    ['grok', 'grok-code-fast-1', text],
    ['copilot', 'gpt-4.1', both],
    ['copilot', 'some-new-model', text],
    ['kimi', 'kimi-for-coding', both],
    ['kimi', 'k3', text],
    ['glm', 'glm-5.2', text],
    ['qwen', 'qwen-plus', text],
    ['antigravity', 'gemini-3.8-flash-medium', text],
    ['nobody', 'x', text]
  ])
    assert.deepEqual(inputModalities(provider, model), want, `${provider}/${model}`)
  // Every default a pin can land on answers.
  for (const [provider, model] of Object.entries(models))
    assert.ok(Array.isArray(inputModalities(provider, model)), provider)
})
