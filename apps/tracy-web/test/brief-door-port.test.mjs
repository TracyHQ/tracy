// The brief layer's port onto session C's provider book (`src/brief/door-port.js`).
//
// 🔒 WHAT THIS FILE GUARDS IS A BUDGET BOUNDARY, NOT A TRANSPORT DETAIL. The book answers
// `{apiKey, baseUrl, words}` per NAMED DOOR, and the failure that costs money is silent: a port
// that borrows `web`'s or `agent`'s credentials when `seedText` has nothing assigned still works
// on the machine that wrote it, bills the wrong job, and reports a model no operator chose. So
// the refusal case asserts the fetch was never made at all, and the door name is pinned to the
// literal string rather than read back from the module under test.
//
// 🔒 `temperature: 0` IS AN ASSERTION, NOT AN INCIDENTAL FIELD. Two runs over one brief that
// disagree are two briefs, and a compiler hashing the result cannot tell drift from a hand edit.
// The request body is compared whole, so raising the temperature turns this file red.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRIEF_DOOR, doorLlmPort } from '../src/brief/door-port.js'
import { LlmPortError } from '../src/brief/llm-port.js'
import { LLM_DOORS } from '../src/lib/llm-catalog.js'

const MODEL = { apiKey: 'sk-test-key', baseUrl: 'https://models.test/v1', words: 'test/model-1' }

/** A fetch that records every call and answers with one chat-completions body. */
function fakeFetch(content, { ok = true, status = 200 } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return {
      ok,
      status,
      json: async () => ({ choices: [{ message: { content } }] })
    }
  }
  impl.calls = calls
  return impl
}

/** The port, with the book silent (`pool: null`) and `config.model` deciding. */
const portWith = (model, fetchImpl, over = {}) =>
  doorLlmPort({ pool: null, config: { model, sessionSecret: 'x'.repeat(32) }, fetchImpl, ...over })

const bodyOf = (fetchImpl) => JSON.parse(fetchImpl.calls[0].init.body)
const systemOf = (fetchImpl) => bodyOf(fetchImpl).messages.find((m) => m.role === 'system').content

test('a door with no model assigned refuses with NOT_CONFIGURED and never borrows another door', async () => {
  const fetchImpl = fakeFetch('{}')
  const port = await portWith(null, fetchImpl)
  assert.equal(port.configured, false)
  for (const method of ['normalizeBrief', 'generateContent']) {
    const err = await port[method]({ any: 'input' }).then(
      () => null,
      (e) => e
    )
    assert.ok(err instanceof LlmPortError, `${method} threw ${err}`)
    assert.equal(err.code, 'NOT_CONFIGURED')
  }
  assert.equal(fetchImpl.calls.length, 0, 'a refusing door must not call a vendor at all')
})

test('a configured door calls the assigned address with the assigned key, at temperature 0', async () => {
  const fetchImpl = fakeFetch('{"ok":true}')
  const port = await portWith(MODEL, fetchImpl)
  assert.equal(port.configured, true)
  await port.normalizeBrief({ brief: 'one' })

  assert.equal(fetchImpl.calls.length, 1)
  const { url, init } = fetchImpl.calls[0]
  assert.equal(url, 'https://models.test/v1/chat/completions')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.authorization, 'Bearer sk-test-key')

  // Whole-body comparison: a changed temperature, a renamed model field or an extra sampling
  // knob all land here rather than slipping past a field-by-field check.
  const body = JSON.parse(init.body)
  assert.deepEqual(
    { model: body.model, temperature: body.temperature, roles: body.messages.map((m) => m.role) },
    { model: 'test/model-1', temperature: 0, roles: ['system', 'user'] }
  )
  assert.equal(Object.hasOwn(body, 'temperature'), true)
  assert.deepEqual(Object.keys(body).sort(), ['messages', 'model', 'temperature'])
})

test('an answer wrapped in a json fence is still the JSON that was asked for', async () => {
  const fetchImpl = fakeFetch('```json\n{"title":"Bakery","groups":[1,2]}\n```')
  const port = await portWith(MODEL, fetchImpl)
  assert.deepEqual(await port.generateContent({ group: 'hero' }), {
    title: 'Bakery',
    groups: [1, 2]
  })
})

test('an answer that is not JSON raises BAD_ANSWER rather than an empty object', async () => {
  const fetchImpl = fakeFetch('Sure! Here is your brief, rewritten nicely.')
  const port = await portWith(MODEL, fetchImpl)
  const err = await port.normalizeBrief({ brief: 'one' }).then(
    () => null,
    (e) => e
  )
  assert.ok(err instanceof LlmPortError)
  assert.equal(err.code, 'BAD_ANSWER')
})

test('a non-ok HTTP answer raises MODEL_CALL_FAILED and names the status code', async () => {
  const fetchImpl = fakeFetch('', { ok: false, status: 429 })
  const port = await portWith(MODEL, fetchImpl)
  const err = await port.generateContent({ group: 'hero' }).then(
    () => null,
    (e) => e
  )
  assert.ok(err instanceof LlmPortError)
  assert.equal(err.code, 'MODEL_CALL_FAILED')
  assert.match(err.message, /429/)
})

test('the caller signal reaches fetch, so a build that is cancelled cancels the request', async () => {
  const fetchImpl = fakeFetch('{}')
  const port = await portWith(MODEL, fetchImpl)
  const controller = new AbortController()
  await port.normalizeBrief({ brief: 'one' }, { signal: controller.signal })
  const sent = fetchImpl.calls[0].init.signal
  assert.equal(sent.aborted, false)
  controller.abort()
  assert.equal(sent.aborted, true, 'aborting the caller aborts the request')
})

test('the brief layer spends the seedText door by default, never web or agent', async () => {
  assert.equal(BRIEF_DOOR, 'seedText')
  assert.ok(
    LLM_DOORS.some((d) => d.id === 'seedText'),
    'seedText must be a door the catalogue actually publishes'
  )
  const fetchImpl = fakeFetch('{}')
  const port = await portWith(MODEL, fetchImpl)
  assert.equal(port.door, 'seedText')
  const refusing = await portWith(null, fetchImpl)
  assert.equal(refusing.door, 'seedText')
})

test('generateContent forbids the model from answering with a slot key, path, SQL or CMS id', async () => {
  // ADR 0016 §2's fence: copy is copy, and structure stays the compiler's. Deleting the line from
  // the prompt must be red here, not discovered on a customer's site.
  const fetchImpl = fakeFetch('{}')
  const port = await portWith(MODEL, fetchImpl)
  await port.generateContent({ group: 'hero' })
  const system = systemOf(fetchImpl)
  for (const word of ['slot key', 'entity', 'path', 'SQL', 'CMS identifier'])
    assert.ok(system.includes(word), `generateContent system prompt must forbid: ${word}`)
})

test('normalizeBrief forbids inventing an address, a person, a figure, a price or a claim', async () => {
  const fetchImpl = fakeFetch('{}')
  const port = await portWith(MODEL, fetchImpl)
  await port.normalizeBrief({ brief: 'one' })
  const system = systemOf(fetchImpl)
  assert.match(system, /Never invent/)
  for (const word of ['address', 'person', 'figure', 'price', 'testimonial', 'certification'])
    assert.ok(system.includes(word), `normalizeBrief system prompt must forbid inventing: ${word}`)
})

test('with a database, a door nobody assigned refuses even when the environment has a model', async () => {
  // The book answers "no assignment"; `config.model` is set, and must NOT be borrowed.
  const pool = { query: async () => ({ rows: [] }) }
  const fetchImpl = fakeFetch('{}')
  const port = await doorLlmPort({
    pool,
    config: { model: MODEL, sessionSecret: 'x'.repeat(32) },
    fetchImpl
  })
  assert.equal(port.configured, false)
  assert.equal(fetchImpl.calls.length, 0)
})

test('a network failure and a non-JSON body arrive typed, never as a bare error', async () => {
  const down = await portWith(MODEL, async () => {
    throw new TypeError('fetch failed')
  })
  const e1 = await down.normalizeBrief({ brief: 'x' }).then(
    () => null,
    (e) => e
  )
  assert.equal(e1.code, 'MODEL_CALL_FAILED')
  const junk = await portWith(MODEL, async () => new Response('<html>', { status: 200 }))
  const e2 = await junk.normalizeBrief({ brief: 'x' }).then(
    () => null,
    (e) => e
  )
  assert.equal(e2.code, 'BAD_ANSWER')
  const limited = await portWith(MODEL, async () => new Response('{}', { status: 429 }))
  const e3 = await limited.normalizeBrief({ brief: 'x' }).then(
    () => null,
    (e) => e
  )
  assert.equal(e3.code, 'MODEL_CALL_FAILED')
})
