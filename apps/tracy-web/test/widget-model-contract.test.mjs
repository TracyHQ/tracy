import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WidgetModelError, widgetConversation } from '../src/widget/model.js'

const facts = {
  schema: 'widget-build-status/v1',
  state: 'done',
  completion: { siteReady: true, briefState: 'applied', designSystemState: 'applied' },
  links: { openWebsite: 'https://private-site.test/', continueTracy: '/private-site.test/' }
}
const statusCall = (args = '{}') => ({
  role: 'assistant',
  content: null,
  tool_calls: [
    {
      id: 'private-tool-id',
      type: 'function',
      function: { name: 'get_current_build_status', arguments: args }
    }
  ]
})
const response = (message, finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message }] })
function fixture(t, replies, statusFacts = facts) {
  let calls = 0,
    saves = 0
  const diagnostics = []
  const v = {
    history: [{ role: 'user', text: 'private-history' }],
    brief: {
      name: 'Keep name',
      about: 'Keep brief',
      platform: 'wordpress',
      goal: 'contact',
      style: 'modern'
    },
    selectedTemplate: 'keep-template',
    selectedSystem: 'keep-system',
    templateIds: ['keep-template'],
    systemIds: ['keep-system'],
    inflight: { kind: 'turn', message: 'private-prompt' }
  }
  const before = structuredClone(v)
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    assert.ok(calls < replies.length, 'must not replay or add corrective requests')
    return replies[calls++]()
  })
  const conversation = widgetConversation({
    pool: null,
    config: { model: { apiKey: 'private-provider-key', baseUrl: 'https://model.invalid', words: 'test' } },
    catalog: async () => ({ templates: [], systems: [] }),
    state: (x) => ({
      brief: x.brief,
      selectedTemplate: x.selectedTemplate,
      selectedSystem: x.selectedSystem,
      templateIds: x.templateIds,
      systemIds: x.systemIds
    }),
    save: async () => saves++,
    isSignedIn: async () => true,
    buildStatus: async () => statusFacts,
    onDiagnostic: (entry) => diagnostics.push(structuredClone(entry))
  })
  return {
    v,
    before,
    diagnostics,
    fetch,
    get calls() {
      return calls
    },
    get saves() {
      return saves
    },
    turn: () => conversation.turn({}, v, 'private-prompt')
  }
}
test('read-only status tool plain stop answer becomes speech only without changing brief, choices or actions', async (t) => {
  const text = 'Your website is ready.'
  const f = fixture(t, [
    () => response(statusCall(), 'tool_calls'),
    () => response({ role: 'assistant', content: text })
  ])
  const out = await f.turn()
  assert.equal(out.speak, text)
  assert.equal(out.action, null)
  assert.deepEqual(out.buildStatus, facts)
  for (const key of ['brief', 'selectedTemplate', 'selectedSystem', 'templateIds', 'systemIds'])
    assert.deepEqual(f.v[key], f.before[key])
  assert.equal(f.v.history.length, 3)
  assert.equal(f.v.inflight, null)
  assert.equal(f.calls, 2)
  assert.equal(f.saves, 1)
  const accepted = f.diagnostics.find((x) => x.stage === 'plain_status_answer')
  assert.equal(accepted.iteration, 2)
  assert.equal(accepted.providerHTTP, 200)
  assert.equal(accepted.finishReason, 'stop')
  assert.equal(accepted.contentLength, text.length)
  assert.doesNotMatch(
    JSON.stringify(f.diagnostics),
    /private-history|private-prompt|private-provider-key|private-tool-id|private-site|Your website is ready|Keep name|Keep brief/
  )
})
test('structured final answer after status tool keeps the signed-in action gate and existing choices', async (t) => {
  const f = fixture(t, [
    () => response(statusCall(), 'tool_calls'),
    () => response({ content: JSON.stringify({ speak: 'Ready.', action: { type: 'open_login' } }) })
  ])
  const out = await f.turn()
  assert.equal(out.action, null)
  assert.deepEqual(out.brief, f.before.brief)
  assert.equal(out.selectedTemplate, 'keep-template')
  assert.equal(f.calls, 2)
})
test('plain completed conversational replies become speech without changing brief, choices or actions', async (t) => {
  for (const text of [
    'Hello! How can I help?',
    'Có, mình nói được tiếng Việt. Bạn muốn tạo website như thế nào?'
  ]) {
    const f = fixture(t, [() => response({ role: 'assistant', content: text })])
    const out = await f.turn()
    assert.equal(out.speak, text)
    assert.equal(out.action, null)
    for (const key of ['brief', 'selectedTemplate', 'selectedSystem', 'templateIds', 'systemIds'])
      assert.deepEqual(f.v[key], f.before[key])
    assert.deepEqual(f.v.history.slice(-2), [
      { role: 'user', text: 'private-prompt' },
      { role: 'assistant', text }
    ])
    assert.equal(f.v.inflight, null)
    assert.equal(f.calls, 1)
    assert.equal(f.saves, 1)
    assert.ok(f.diagnostics.some((entry) => entry.stage === 'plain_speech_answer'))
    f.fetch.mock.restore()
  }
})
test('plain compatibility requires a completed safe reply; malformed/truncated/tool-loop answers still refuse', async (t) => {
  for (const [first, content, finish] of [
    [null, 'Partial answer', 'length'],
    [null, '{"speak":', 'stop'],
    [null, '```json\nnot-json\n```', 'stop'],
    [null, 'Visit https://unverified.example/ to continue.', 'stop'],
    [null, '<a href="/login">Log in</a>', 'stop'],
    [null, 'x'.repeat(1801), 'stop'],
    [statusCall('{"jobId":"private-other-job"}'), 'Plain answer', 'stop'],
    [statusCall(), 'Partial answer', 'length'],
    [statusCall(), '{"speak":', 'stop'],
    [statusCall(), '```json\nnot-json\n```', 'stop'],
    [statusCall(), '', 'stop']
  ]) {
    const replies = first
      ? [() => response(first, 'tool_calls'), () => response({ content }, finish)]
      : [() => response({ content }, finish)]
    const f = fixture(t, replies)
    await assert.rejects(
      f.turn(),
      (e) => e instanceof WidgetModelError && e.status === 502 && e.reason === 'upstream'
    )
    assert.equal(f.saves, 0)
    assert.deepEqual(f.v, f.before)
    assert.equal(f.calls, replies.length)
    f.fetch.mock.restore()
  }
})
test('a provider refusal cannot become a plain conversational answer', async (t) => {
  const f = fixture(t, [() => response({ role: 'assistant', content: 'Unavailable.', refusal: 'Refused' })])
  await assert.rejects(f.turn(), WidgetModelError)
  assert.equal(f.saves, 0)
  assert.deepEqual(f.v, f.before)
  assert.equal(f.calls, 1)
})
test('safe diagnostics distinguish provider, JSON, answer shape and bounded tool errors without raw keys or names', async (t) => {
  const cases = [
    [
      () =>
        new Response('secret-provider-body', {
          status: 429,
          headers: { 'content-type': 'application/x-secret-key' }
        }),
      'provider_http',
      429
    ],
    [
      () => new Response('secret-invalid-json', { headers: { 'content-type': 'text/html' } }),
      'provider_json',
      502
    ],
    [() => Response.json({ 'private-secret-as-key': 'secret-value' }), 'message_shape', 502],
    [
      () => response({ content: JSON.stringify({ 'private-secret-as-key': 'secret-value' }) }),
      'answer_shape',
      502
    ],
    [
      () =>
        response({ content: null, tool_calls: [{ function: { name: 'secret-tool-name' } }] }, 'tool_calls'),
      'tool_shape',
      502
    ]
  ]
  for (const [make, stage, status] of cases) {
    const f = fixture(t, [make])
    await assert.rejects(f.turn(), (e) => e.status === status)
    assert.equal(f.diagnostics.at(-1).stage, stage)
    assert.doesNotMatch(
      JSON.stringify(f.diagnostics),
      /secret-provider-body|secret-invalid-json|private-secret-as-key|secret-value|secret-tool-name|private-provider-key/
    )
    f.fetch.mock.restore()
  }
  const f = fixture(
    t,
    Array.from({ length: 4 }, () => () => response(statusCall(), 'tool_calls'))
  )
  await assert.rejects(f.turn(), (e) => e.status === 502)
  assert.equal(f.calls, 4)
  assert.equal(f.diagnostics.at(-1).stage, 'tool_budget')
  assert.equal(f.saves, 0)
})

test('plain status speech requires authoritative known build facts, not an unavailable transport result', async (t) => {
  const f = fixture(
    t,
    [
      () => response(statusCall(), 'tool_calls'),
      () => response({ role: 'assistant', content: 'Your website is ready.' })
    ],
    { state: 'unavailable', links: null }
  )
  await assert.rejects(f.turn(), (e) => e instanceof WidgetModelError && e.status === 502)
  assert.equal(f.saves, 0)
  assert.deepEqual(f.v, f.before)
})

test('transport/auth fallback or invalid build facts never unlock plain speech compatibility', async (t) => {
  for (const status of [
    { state: 'unavailable' },
    { state: 'signed_out' },
    { schema: 'wrong', state: 'done' },
    { ...facts, state: 'unknown' },
    { ...facts, completion: { siteReady: false } },
    { ...facts, completion: null }
  ]) {
    const f = fixture(
      t,
      [() => response(statusCall(), 'tool_calls'), () => response({ content: 'Plain status answer' })],
      status
    )
    await assert.rejects(f.turn(), (e) => e.status === 502)
    assert.equal(f.calls, 2)
    assert.equal(f.saves, 0)
    assert.deepEqual(f.v, f.before)
    f.fetch.mock.restore()
  }
})

test('action-looking plain speech never becomes a brief, selection or login action', async (t) => {
  const text = 'brief.name=Wrong; selectedTemplate=wrong; action=open_login'
  const f = fixture(t, [() => response(statusCall(), 'tool_calls'), () => response({ content: text })])
  const out = await f.turn()
  assert.equal(out.speak, text)
  assert.equal(out.action, null)
  assert.deepEqual(out.brief, f.before.brief)
  assert.equal(out.selectedTemplate, f.before.selectedTemplate)
  assert.equal(out.selectedSystem, f.before.selectedSystem)
  assert.equal(f.calls, 2)
})
