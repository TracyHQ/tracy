import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AgentError, runAgent } from '../src/lib/agent-over-door.js'
import { DOOR, finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'

const SYSTEM = 'You answer questions about a small invented catalogue.'
const FIRST = 'Which part is called beta? Read the parts first.'
const DETAILS_1 = [{ type: 'reasoning.encrypted', data: 'opaque-signature-1', format: 'anthropic-claude-v1' }]
const DETAILS_2 = [{ type: 'reasoning.encrypted', data: 'opaque-signature-2', format: 'anthropic-claude-v1' }]

function catalogueTools(log = []) {
  return [
    {
      name: 'read_part',
      description: 'Read one catalogue part by id.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      run: async ({ id }) => {
        log.push(id)
        return JSON.stringify({ id, name: id === 'p2' ? 'beta' : 'alpha' })
      }
    }
  ]
}

const twoToolScript = () => [
  toolCallReply({
    calls: [['read_part', { id: 'p1' }]],
    reasoningDetails: DETAILS_1,
    usage: usageOf({ cacheWrite: 900, cost: 0.01 })
  }),
  toolCallReply({
    calls: [['read_part', { id: 'p2' }]],
    reasoningDetails: DETAILS_2,
    usage: usageOf({ cached: 900, cost: 0.002 })
  }),
  finalReply({ content: '{"answer":"p2"}', usage: usageOf({ cached: 1100, cost: 0.003 }) })
]

test('a two tool call conversation ends in the final answer, each turn saved before the next call', async () => {
  const events = []
  const model = scriptedModel(twoToolScript())
  const fetchImpl = async (url, init) => {
    events.push('fetch')
    return model.fetchImpl(url, init)
  }
  const read = []
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: catalogueTools(read),
    fetchImpl,
    onTurn: async (turn) => {
      await new Promise((r) => setTimeout(r, 1))
      events.push(`${turn.n}:${turn.state}`)
    }
  })
  assert.equal(result.answer, '{"answer":"p2"}')
  assert.deepEqual(read, ['p1', 'p2'])
  assert.deepEqual(events, [
    '0:dispatched',
    'fetch',
    '0:answered',
    '1:dispatched',
    'fetch',
    '1:answered',
    '2:dispatched',
    'fetch',
    '2:answered'
  ])
  assert.equal(result.turns.length, 3)
  assert.deepEqual(
    result.turns.map((t) => t.state),
    ['answered', 'answered', 'answered']
  )

  const [first, second, third] = model.requests
  assert.equal(first.url, 'https://models.example.test/api/v1/chat/completions')
  assert.equal(first.headers.authorization, 'Bearer test-key')
  assert.equal(first.body.model, 'vendor/test-model')
  assert.deepEqual(first.body.reasoning, { enabled: true, effort: 'high' })
  assert.ok(first.body.max_tokens >= 64000)
  assert.deepEqual(first.body.tools, [
    {
      type: 'function',
      function: {
        name: 'read_part',
        description: 'Read one catalogue part by id.',
        parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
      }
    }
  ])
  assert.equal(second.body.messages.at(-1).role, 'tool')
  assert.equal(second.body.messages.at(-1).tool_call_id, result.turns[0].message.tool_calls[0].id)
  assert.match(JSON.stringify(third.body.messages.at(-1)), /beta/)
})

test('reasoning details come back on the assistant turn of the next request, unchanged', async () => {
  const model = scriptedModel(twoToolScript())
  await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: catalogueTools(),
    fetchImpl: model.fetchImpl
  })
  const assistants = (i) => model.requests[i].body.messages.filter((m) => m.role === 'assistant')
  assert.deepEqual(
    assistants(1).map((m) => m.reasoning_details),
    [DETAILS_1]
  )
  assert.deepEqual(
    assistants(2).map((m) => m.reasoning_details),
    [DETAILS_1, DETAILS_2]
  )
  assert.equal(assistants(1)[0].tool_calls[0].function.name, 'read_part')
})

test('cache markers: the system prompt with its own TTL, one rolling marker on the newest message', async () => {
  const model = scriptedModel(twoToolScript())
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: catalogueTools(),
    fetchImpl: model.fetchImpl,
    cacheTtl: { system: '1h', rolling: '5m' }
  })
  const marked = (body) =>
    body.messages.flatMap((m, i) =>
      Array.isArray(m.content)
        ? m.content.filter((p) => p.cache_control).map((p) => [i, m.role, p.cache_control])
        : []
    )
  for (const { body } of model.requests) {
    assert.deepEqual(body.messages[0].content, [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }
    ])
  }
  assert.deepEqual(marked(model.requests[0].body), [
    [0, 'system', { type: 'ephemeral', ttl: '1h' }],
    [1, 'user', { type: 'ephemeral' }]
  ])
  const second = model.requests[1].body
  assert.deepEqual(marked(second), [
    [0, 'system', { type: 'ephemeral', ttl: '1h' }],
    [second.messages.length - 1, 'tool', { type: 'ephemeral' }]
  ])
  assert.equal(marked(model.requests[2].body).length, 2)
  // Markers belong to the request, never to the saved conversation.
  assert.doesNotMatch(JSON.stringify(result.turns), /cache_control/)
})

test('a 1h rolling TTL is passed through, and an unknown TTL is refused before any call', async () => {
  const model = scriptedModel([finalReply({ content: 'done' })])
  await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [],
    fetchImpl: model.fetchImpl,
    cacheTtl: { system: '5m', rolling: '1h' }
  })
  const body = model.requests[0].body
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: 'ephemeral' })
  assert.deepEqual(body.messages[1].content.at(-1).cache_control, { type: 'ephemeral', ttl: '1h' })
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: model.fetchImpl,
      cacheTtl: { system: '2h' }
    }),
    (e) => e instanceof AgentError && e.code === 'AGENT_SETTINGS_INVALID'
  )
})

test('a truncated answer is an error, and the paid turn is still saved', async () => {
  const saved = []
  const model = scriptedModel([
    finalReply({ content: '{"pages":[', finishReason: 'length', usage: usageOf({ cost: 0.4 }) })
  ])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: model.fetchImpl,
      onTurn: (t) => saved.push(t)
    }),
    (e) => e instanceof AgentError && e.code === 'AGENT_TRUNCATED'
  )
  assert.deepEqual(
    saved.map((t) => t.state),
    ['dispatched', 'answered']
  )
  assert.equal(saved[1].finishReason, 'length')
  assert.equal(saved[1].cost, 0.4)
})

test('a provider 5xx is an error with the provider reason, and the turn is saved as failed', async () => {
  const saved = []
  const model = scriptedModel([
    { status: 503, body: { error: { code: 503, message: 'Overloaded upstream' } } }
  ])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: model.fetchImpl,
      onTurn: (t) => saved.push(t)
    }),
    (e) =>
      e instanceof AgentError &&
      e.code === 'AGENT_PROVIDER_HTTP' &&
      e.status === 503 &&
      /Overloaded/.test(e.reason)
  )
  assert.deepEqual(
    saved.map((t) => t.state),
    ['dispatched', 'failed']
  )
  assert.equal(saved[1].error.code, 'AGENT_PROVIDER_HTTP')
  assert.equal(saved[1].error.uncertain, false)
})

test('an error inside a 200 answer is a provider error too', async () => {
  const model = scriptedModel([
    {
      body: {
        choices: [
          {
            finish_reason: 'error',
            error: { message: 'Provider returned error' },
            message: { role: 'assistant', content: '' }
          }
        ]
      }
    }
  ])
  await assert.rejects(
    runAgent({ door: DOOR, system: SYSTEM, firstUser: FIRST, tools: [], fetchImpl: model.fetchImpl }),
    (e) =>
      e instanceof AgentError && e.code === 'AGENT_PROVIDER_ERROR' && /Provider returned error/.test(e.reason)
  )
})

test('a network failure is saved as failed and uncertain: the provider may have answered', async () => {
  const saved = []
  const model = scriptedModel([{ throw: new TypeError('fetch failed') }])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: model.fetchImpl,
      onTurn: (t) => saved.push(t)
    }),
    (e) => e instanceof AgentError && e.code === 'AGENT_NETWORK'
  )
  assert.equal(saved[1].error.uncertain, true)
})

test('an unknown tool, bad arguments and a failing tool each answer the model with an error result', async () => {
  const model = scriptedModel([
    toolCallReply({
      calls: [
        ['open_drawer', {}],
        ['read_part', '{not json'],
        ['explode', {}]
      ]
    }),
    finalReply({ content: 'done' })
  ])
  const tools = [
    ...catalogueTools(),
    {
      name: 'explode',
      description: 'Always fails.',
      parameters: { type: 'object', properties: {} },
      run: async () => {
        throw new Error('disk on fire')
      }
    }
  ]
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools,
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.answer, 'done')
  const toolMessages = model.requests[1].body.messages.filter((m) => m.role === 'tool')
  const text = (m) => (Array.isArray(m.content) ? m.content.map((p) => p.text).join('') : m.content)
  assert.deepEqual(
    toolMessages.map((m) => JSON.parse(text(m)).error),
    ['UNKNOWN_TOOL', 'INVALID_ARGUMENTS', 'TOOL_FAILED']
  )
  assert.match(text(toolMessages[2]), /disk on fire/)
})

test('resume from saved turns sends only the next call, with the saved reasoning details', async () => {
  const saved = new Map()
  const stop = new AbortController()
  const first = scriptedModel(twoToolScript())
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: catalogueTools(),
      fetchImpl: first.fetchImpl,
      signal: stop.signal,
      onTurn: (t) => {
        saved.set(t.n, structuredClone(t))
        if (t.n === 1 && t.state === 'answered') stop.abort()
      }
    }),
    (e) => e instanceof AgentError && e.code === 'AGENT_ABORTED'
  )
  assert.equal(first.requests.length, 2)
  const history = [...saved.values()]
  assert.deepEqual(
    history.map((t) => t.state),
    ['answered', 'answered']
  )

  const read = []
  const again = scriptedModel([finalReply({ content: '{"answer":"p2"}', usage: usageOf({ cost: 0.003 }) })])
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: catalogueTools(read),
    history,
    fetchImpl: again.fetchImpl
  })
  assert.equal(result.answer, '{"answer":"p2"}')
  assert.equal(again.requests.length, 1)
  assert.deepEqual(read, ['p2'], 'only the tool calls of the last saved turn run again')
  const resent = again.requests[0].body.messages
  const original = first.requests[1].body.messages
  // The resumed request is the uninterrupted one plus the new tool result.
  assert.deepEqual(
    resent.slice(0, original.length - 1).map(stripMarkers),
    original.slice(0, -1).map(stripMarkers)
  )
  assert.deepEqual(
    resent.filter((m) => m.role === 'assistant').map((m) => m.reasoning_details),
    [DETAILS_1, DETAILS_2]
  )
  assert.equal(result.turns.length, 3)
  assert.equal(result.turns[2].n, 2)
})

test('resume after a final answer returns it without calling the model', async () => {
  const done = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: catalogueTools(),
    fetchImpl: scriptedModel(twoToolScript()).fetchImpl
  })
  const model = scriptedModel([])
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: catalogueTools(),
    history: done.turns,
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.answer, done.answer)
  assert.equal(model.requests.length, 0)
  assert.deepEqual(result.totals, done.totals)
})

test('a saved turn that was dispatched but never answered is refused, and nothing is sent', async () => {
  const saved = []
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: scriptedModel([{ throw: new TypeError('fetch failed') }]).fetchImpl,
      onTurn: (t) => saved.push(structuredClone(t))
    })
  )
  const model = scriptedModel([finalReply({ content: 'late' })])
  for (const history of [[saved[0]], [saved[1]]]) {
    await assert.rejects(
      runAgent({
        door: DOOR,
        system: SYSTEM,
        firstUser: FIRST,
        tools: [],
        history,
        fetchImpl: model.fetchImpl
      }),
      (e) => e instanceof AgentError && e.code === 'AGENT_TURN_UNANSWERED' && e.turn === 0
    )
  }
  assert.equal(model.requests.length, 0)
})

test('a saved turn the provider refused for sure is sent again as the next turn', async () => {
  const saved = []
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: scriptedModel([{ status: 502, body: 'bad gateway' }]).fetchImpl,
      onTurn: (t) => saved.push(structuredClone(t))
    })
  )
  const model = scriptedModel([finalReply({ content: 'ok' })])
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [],
    history: [saved[1]],
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.answer, 'ok')
  assert.equal(model.requests[0].body.messages.length, 2)
  assert.deepEqual(
    result.turns.map((t) => [t.n, t.state]),
    [
      [0, 'failed'],
      [1, 'answered']
    ]
  )
})

test('usage and cost are kept per turn and summed, cached tokens included', async () => {
  const model = scriptedModel(twoToolScript())
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: catalogueTools(),
    fetchImpl: model.fetchImpl
  })
  assert.deepEqual(result.turns[1].usage, {
    promptTokens: 1000,
    completionTokens: 200,
    cachedTokens: 900,
    cacheWriteTokens: 0,
    reasoningTokens: 50
  })
  assert.equal(result.turns[1].cost, 0.002)
  assert.deepEqual(result.totals, {
    turns: 3,
    promptTokens: 3000,
    completionTokens: 600,
    cachedTokens: 2000,
    cacheWriteTokens: 900,
    reasoningTokens: 150,
    cost: 0.015,
    turnsWithoutCost: 0
  })
})

test('a turn without a provider cost is counted, not guessed', async () => {
  const model = scriptedModel([finalReply({ content: 'ok', usage: usageOf() })])
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [],
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.turns[0].cost, null)
  assert.equal(result.totals.cost, 0)
  assert.equal(result.totals.turnsWithoutCost, 1)
})

test('an abort is honoured between turns, never by cutting a call short', async () => {
  const stop = new AbortController()
  stop.abort()
  const model = scriptedModel([finalReply({ content: 'ok' })])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: model.fetchImpl,
      signal: stop.signal
    }),
    (e) => e instanceof AgentError && e.code === 'AGENT_ABORTED'
  )
  assert.equal(model.requests.length, 0)
})

test('a tool result with an image is sent inline, or as a user message after the tool results', async () => {
  const png = 'iVBORw0KGgo='
  const tools = [
    {
      name: 'open_image',
      description: 'Open one image.',
      parameters: { type: 'object', properties: {} },
      run: async () => ({ text: 'image i1, 4x4', images: [{ mediaType: 'image/png', base64: png }] })
    }
  ]
  for (const toolImages of ['inline', 'user-message']) {
    const model = scriptedModel([
      toolCallReply({ calls: [['open_image', {}]] }),
      finalReply({ content: 'a red square' })
    ])
    await runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools,
      fetchImpl: model.fetchImpl,
      toolImages
    })
    const messages = model.requests[1].body.messages.map(stripMarkers)
    const url = `data:image/png;base64,${png}`
    if (toolImages === 'inline') {
      assert.equal(messages.at(-1).role, 'tool')
      assert.deepEqual(messages.at(-1).content, [
        { type: 'text', text: 'image i1, 4x4' },
        { type: 'image_url', image_url: { url } }
      ])
    } else {
      assert.equal(messages.at(-2).role, 'tool')
      assert.equal(messages.at(-2).content, 'image i1, 4x4')
      assert.equal(messages.at(-1).role, 'user')
      assert.deepEqual(messages.at(-1).content.at(-1), { type: 'image_url', image_url: { url } })
    }
  }
})

test('an image with a ref is saved as the ref and sent in full; a resume reads it back through resolveImage', async () => {
  const png = 'iVBORw0KGgo='
  const ref = { image: 'i1' }
  const tools = [
    {
      name: 'open_image',
      description: 'Open one image.',
      parameters: { type: 'object', properties: {} },
      run: async () => ({ text: 'image i1', images: [{ mediaType: 'image/png', base64: png, ref }] })
    }
  ]
  const url = `data:image/png;base64,${png}`
  const imagesIn = (request) =>
    request.body.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((p) => p.type === 'image_url')
  const saved = []
  const model = scriptedModel([
    toolCallReply({ calls: [['open_image', {}]] }),
    finalReply({ content: 'seen' })
  ])
  await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools,
    fetchImpl: model.fetchImpl,
    onTurn: async (turn) => saved.push(turn)
  })
  assert.deepEqual(imagesIn(model.requests[1]), [{ type: 'image_url', image_url: { url } }])
  const turns = saved.filter((t) => t.state === 'answered')
  assert.doesNotMatch(JSON.stringify(turns), /iVBORw0KGgo=/)
  assert.deepEqual(turns[1].sent[0].content[1], { type: 'image_ref', ref, media_type: 'image/png' })

  // A follow-up on the saved turns sends the image in full again, resolved once.
  const resolved = []
  const next = scriptedModel([finalReply({ content: 'again' })])
  await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools,
    history: turns,
    followUp: 'look again',
    fetchImpl: next.fetchImpl,
    resolveImage: async (r) => {
      resolved.push(r)
      return { mediaType: 'image/png', base64: png }
    }
  })
  assert.deepEqual(imagesIn(next.requests[0]), [{ type: 'image_url', image_url: { url } }])
  assert.deepEqual(resolved, [ref])

  // An image that cannot be read back stops the run before anything is dispatched.
  const none = scriptedModel([finalReply({ content: 'never' })])
  const dispatched = []
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools,
      history: turns,
      followUp: 'look again',
      fetchImpl: none.fetchImpl,
      onTurn: async (turn) => dispatched.push(turn),
      resolveImage: async () => null
    }),
    (e) => e instanceof AgentError && e.code === 'AGENT_IMAGE_UNAVAILABLE'
  )
  assert.equal(none.requests.length, 0)
  assert.deepEqual(dispatched, [])
})

function stripMarkers(m) {
  if (!Array.isArray(m.content)) return m
  return { ...m, content: m.content.map(({ cache_control: _marker, ...p }) => p) }
}

test('a refusal is an error carrying the provider refusal text, and the turn is saved', async () => {
  const saved = []
  const model = scriptedModel([
    {
      body: {
        choices: [
          {
            finish_reason: 'content_filter',
            native_finish_reason: 'refusal',
            message: {
              role: 'assistant',
              content: null,
              refusal: 'This request was blocked by a usage policy.'
            }
          }
        ]
      }
    }
  ])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      fetchImpl: model.fetchImpl,
      onTurn: (t) => saved.push(structuredClone(t))
    }),
    (e) => e instanceof AgentError && e.code === 'AGENT_REFUSED' && /usage policy/.test(e.reason)
  )
  assert.deepEqual(
    saved.map((t) => t.state),
    ['dispatched', 'answered']
  )
  assert.equal(saved[1].finishReason, 'content_filter')
  assert.match(saved[1].refusal, /usage policy/)
  // Resuming a refused conversation refuses again without a call.
  const again = scriptedModel([])
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [],
      history: [saved[1]],
      fetchImpl: again.fetchImpl
    }),
    (e) => e.code === 'AGENT_REFUSED'
  )
  assert.equal(again.requests.length, 0)
})

test('a reply body padded with leading whitespace (provider keep-alive) is read normally', async () => {
  const reply = finalReply({ content: 'ok', usage: usageOf({ cost: 0.001 }) })
  const model = scriptedModel([{ body: `\n\n   \n${JSON.stringify(reply.body)}` }])
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [],
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.answer, 'ok')
  assert.equal(result.turns[0].cost, 0.001)
})
