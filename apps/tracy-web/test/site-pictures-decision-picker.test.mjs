// The picture picker on Gemini Decision 1 (site-pictures/decision-picker.js): one `choice` question per frame among its
// photos, the answer written as the chat picker's picks, a fix round asking again only for the frames it names without
// the photos picked before, and the endpoint's failures said as a failed turn.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SITE_PICTURES_STEP } from '../src/site-pictures/bench-worker.js'
import {
  DECISION_MODEL,
  DECISION_RETRIES,
  decisionAgent,
  decisionRequest,
  decisionsUrl,
  picksFrom
} from '../src/site-pictures/decision-picker.js'

const thumb = (n) => ({ base64: Buffer.from(`photo ${n}`).toString('base64'), mediaType: 'image/jpeg' })
const frame = (id, codes, shows) => ({
  frame: id,
  words: { shows, mustInclude: ['coach'], avoid: ['logos'], mood: 'calm', size: 'landscape, 800 x 600' },
  candidates: new Map(codes.map((c) => [c, { asset: `a-${c}` }]))
})
const picker = {
  frames: [
    frame('block-1.0', ['P1', 'P2'], 'a coach holding pads'),
    frame('article-2.5', ['P2', 'P3'], 'a yoga class')
  ],
  thumbnails: new Map([
    ['P1', thumb(1)],
    ['P2', thumb(2)],
    ['P3', thumb(3)]
  ])
}
const door = {
  providerId: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  apiKey: 'k',
  model: DECISION_MODEL
}

test('the decisions address is the Google base without its OpenAI-compatible suffix', () => {
  assert.equal(decisionsUrl(door.baseUrl), 'https://generativelanguage.googleapis.com/v1beta/decisions')
  assert.equal(decisionsUrl('https://x.test/v1beta/'), 'https://x.test/v1beta/decisions')
})

test('each frame is one choice among its own photos and "other"; the photos follow once each, after their code', () => {
  const { body, asked } = decisionRequest({ frames: picker.frames, thumbnails: picker.thumbnails })
  assert.equal(body.model, DECISION_MODEL)
  assert.deepEqual(Object.keys(body.questions), ['block-1_0', 'article-2_5'])
  assert.deepEqual(Object.keys(body.questions['block-1_0'].criteria), ['P1', 'P2', 'other'])
  assert.match(body.questions['block-1_0'].instructions, /a coach holding pads.*coach.*logos.*calm/)
  assert.deepEqual(
    body.input.filter((p) => p.type === 'image').map((p) => p.resolution),
    ['low', 'low', 'low']
  )
  assert.deepEqual(
    body.input
      .filter((p) => p.type === 'text')
      .map((p) => p.text.trim())
      .slice(1),
    ['Photo P1:', 'Photo P2:', 'Photo P3:']
  )
  assert.deepEqual(
    asked.map((a) => a.options),
    [
      ['P1', 'P2'],
      ['P2', 'P3']
    ]
  )
  // A photo a frame may no longer take is not offered; a photo no frame offers is not sent.
  const fix = decisionRequest({
    frames: [picker.frames[0]],
    thumbnails: picker.thumbnails,
    exclude: new Map([['block-1.0', new Set(['P1'])]])
  })
  assert.deepEqual(Object.keys(fix.body.questions['block-1_0'].criteria), ['P2', 'other'])
  assert.equal(fix.body.input.filter((p) => p.type === 'image').length, 1)
})

test('the answers become picks: a chosen photo, "none" for other, for an unknown answer and for a frame left without photos', () => {
  const asked = [
    { frame: 'block-1.0', key: 'block-1_0', options: ['P1', 'P2'] },
    { frame: 'article-2.5', key: 'article-2_5', options: ['P2', 'P3'] },
    { frame: 'article-3.1', key: 'article-3_1', options: ['P4'] },
    { frame: 'article-4.1', key: 'article-4_1', options: [] }
  ]
  const { picks } = picksFrom(asked, {
    'block-1_0': { choice: 'P2', confidence: 0.81 },
    'article-2_5': { choice: 'other', probabilities: { other: 0.7 } },
    'article-3_1': { choice: 'P9', confidence: 0.9 }
  })
  assert.deepEqual(
    picks.map((p) => [p.frame, p.photo]),
    [
      ['block-1.0', 'P2'],
      ['article-2.5', 'none'],
      ['article-3.1', 'none'],
      ['article-4.1', 'none']
    ]
  )
  assert.match(picks[0].reason, /Decision 1 chose P2 \(0\.81\)/)
})

function endpoint(replies) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), key: init.headers['x-goog-api-key'] })
    const r = replies.shift()
    return {
      ok: r.status === 200,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body ?? {})
    }
  }
  return { calls, fetchImpl }
}

test('round 0 asks every frame in one call and answers with the picks; the call is one answered turn', async () => {
  const { calls, fetchImpl } = endpoint([
    {
      status: 200,
      body: {
        answers: {
          'block-1_0': { choice: 'P1', confidence: 0.9 },
          'article-2_5': { choice: 'P3', confidence: 0.7 }
        },
        usage: { total_input_tokens: 2000 }
      }
    }
  ])
  const saved = []
  const run = decisionAgent(picker, { sleep: async () => {} })
  const out = await run({ door, history: [], onTurn: async (t) => saved.push(t), fetchImpl })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/decisions')
  assert.equal(calls[0].key, 'k')
  assert.deepEqual(
    JSON.parse(out.answer).picks.map((p) => p.photo),
    ['P1', 'P3']
  )
  assert.deepEqual(
    saved.map((t) => t.state),
    ['dispatched', 'answered']
  )
  assert.equal(out.turns.length, 1)
  assert.equal(out.totals.turns, 1)
  assert.equal(out.totals.promptTokens, 2000)
  assert.ok(Math.abs(out.totals.cost - 0.0002) < 1e-12)
  // A resumed round whose call was answered and recorded gives that answer again, without a call.
  const again = await run({ door, history: out.turns, fetchImpl })
  assert.equal(again.answer, out.answer)
  assert.equal(calls.length, 1)
})

test('a fix round asks only the frames its failure list names, without the photos picked for them before', async () => {
  const first = {
    n: 0,
    state: 'answered',
    message: { role: 'assistant', content: JSON.stringify({ picks: [{ frame: 'block-1.0', photo: 'P1' }] }) }
  }
  const { calls, fetchImpl } = endpoint([
    {
      status: 200,
      body: {
        answers: { 'block-1_0': { choice: 'P2', confidence: 0.6 } },
        usage: { total_input_tokens: 900 }
      }
    }
  ])
  const out = await decisionAgent(picker)({
    door,
    history: [first],
    followUp: 'L01 | The looker passes every finished picture | block-1.0 | the looker rejected the picture',
    fetchImpl
  })
  assert.deepEqual(Object.keys(calls[0].body.questions), ['block-1_0'])
  assert.deepEqual(Object.keys(calls[0].body.questions['block-1_0'].criteria), ['P2', 'other'])
  assert.deepEqual(JSON.parse(out.answer).picks, [
    { frame: 'block-1.0', photo: 'P2', reason: 'Decision 1 chose P2 (0.60).' }
  ])
  assert.equal(out.turns.length, 2)
})

test('a rate limit is waited out and asked again; a refusal fails the turn with the endpoint status', async () => {
  const waits = []
  const ok = { status: 200, body: { answers: {}, usage: { total_input_tokens: 10 } } }
  const limited = endpoint([{ status: 429, body: { error: 'quota' } }, ok])
  const out = await decisionAgent(picker, { sleep: async (ms) => waits.push(ms) })({
    door,
    fetchImpl: limited.fetchImpl
  })
  assert.deepEqual(waits, [DECISION_RETRIES[0]])
  assert.deepEqual(
    JSON.parse(out.answer).picks.map((p) => p.photo),
    ['none', 'none']
  )
  const saved = []
  const refused = endpoint([{ status: 400, body: { error: { code: 'safety', message: 'blocked' } } }])
  await assert.rejects(
    decisionAgent(picker)({ door, fetchImpl: refused.fetchImpl, onTurn: async (t) => saved.push(t) }),
    (e) => e.code === 'AGENT_CALL_FAILED' && /answered 400/.test(e.message)
  )
  assert.deepEqual(
    saved.map((t) => t.state),
    ['dispatched', 'failed']
  )
})

test('the picture step answers through Decision 1 only when its door is assigned that model', () => {
  assert.equal(typeof SITE_PICTURES_STEP.runAgentFor({ ready: { door, picker } }), 'function')
  assert.equal(
    SITE_PICTURES_STEP.runAgentFor({ ready: { door: { ...door, model: 'deepseek-flash' }, picker } }),
    null
  )
  assert.equal(SITE_PICTURES_STEP.runAgentFor({ ready: { door, picker: null } }), null)
})
