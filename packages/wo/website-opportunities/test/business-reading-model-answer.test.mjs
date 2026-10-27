// The reading step against the answer a DeepSeek thinking model gives (#1780). On dev (26/10/2026) Harbour Sport Club's
// reading came back `rules` / `unreadable`: the ledger row of that call (provider woEditorial, deepseek-v4-pro) settled at
// its 12 cent ceiling, which with a ~2.6k token prompt means ~3.8k of the 4k `max_tokens` went out as completion
// tokens. A thinking model counts its reasoning in `max_tokens`, so the reasoning used the budget and the JSON answer was
// cut off. The fake provider below follows that rule: reasoning first, then the answer, both inside `max_tokens`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBusiness } from '../src/business-reading.js'

const RESEARCH = {
  name: 'Harbour Sport Club',
  bio: '🙋 European Coaching in Dubai📍\n🎾 Tennis & Padel \n🏊 Swimming Lessons\n📱 +971 50 000 0000',
  posts: [
    {
      source: 'instagram',
      id: 'p1',
      url: 'https://www.instagram.com/p/p1/',
      caption: 'Join our padel sessions in Dubai!\n📍Locations across Dubai\nFor all ages & levels'
    }
  ],
  reviews: [{ author: 'A. Reviewer', text: 'Great padel coaching with Alex and Sam, highly recommend.' }]
}

/** A well-formed answer: every quote is in the text it names. */
const ANSWER = {
  services: [
    { name: 'Padel sessions', quote: 'Join our padel sessions in Dubai!', ref: 'post:instagram:p1' }
  ],
  audience: [{ label: 'all ages and levels', quote: 'For all ages & levels', ref: 'post:instagram:p1' }],
  team: [{ name: 'Alex', role: 'coach', quote: 'padel coaching with Alex and Sam', ref: 'review:1' }],
  story: [{ text: 'European coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  serviceAreas: [
    { text: 'Locations across Dubai', quote: 'Locations across Dubai', ref: 'post:instagram:p1' }
  ]
}

const DOOR = {
  state: 'ready',
  door: {
    url: 'https://api.deepseek.test/chat/completions',
    key: 'test-key',
    model: 'deepseek-v4-pro',
    effort: 'low'
  }
}
// The dev call spent its whole 4k budget (the ledger settled at the ceiling) and was cut off, at reasoning effort low.
const REASONING_TOKENS_MEASURED = 4_000
const tokensOf = (text) => Math.ceil(text.length / 3.5)

/**
 * A chat completion as DeepSeek's thinking mode returns it: `reasoning_content` beside `content`, and `max_tokens`
 * shared by both. An answer that does not fit is cut (`finish_reason: length`), empty when the reasoning took it all.
 */
function thinkingProvider({
  reasoningTokens = REASONING_TOKENS_MEASURED,
  content = JSON.stringify(ANSWER)
} = {}) {
  const seen = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    seen.push(body)
    const room = body.max_tokens - reasoningTokens
    const fits = room >= tokensOf(content)
    const text = fits ? content : content.slice(0, Math.max(0, Math.floor(room * 3.5)))
    return Response.json({
      id: 'reading-1',
      choices: [
        {
          finish_reason: fits ? 'stop' : 'length',
          message: { role: 'assistant', reasoning_content: 'Let me read the texts...', content: text }
        }
      ],
      usage: {
        prompt_tokens: 2_600,
        completion_tokens: Math.min(body.max_tokens, reasoningTokens + tokensOf(content)),
        completion_tokens_details: { reasoning_tokens: Math.min(body.max_tokens, reasoningTokens) }
      }
    })
  }
  return { fetchImpl, seen }
}

const read = (provider) =>
  readBusiness({
    ...RESEARCH,
    door: DOOR,
    charge: (_spec, call) => call(),
    fetchImpl: provider.fetchImpl,
    log: { warn() {} }
  })

test('a thinking model that reasons as it did on dev still has room to answer, and the answer is read', async () => {
  const reading = await read(thinkingProvider())
  assert.equal(reading.reason, undefined)
  assert.equal(reading.method, 'model')
  assert.deepEqual(
    reading.team.map((p) => p.label),
    ['Alex']
  )
  // The bio's "Tennis & Padel" keeps its tennis part beside the padel sessions (F10).
  assert.deepEqual(
    reading.services.map((s) => s.label),
    ['Padel sessions', 'Tennis']
  )
})

test('an answer in a json code fence is read', async () => {
  const fenced = `\`\`\`json\n${JSON.stringify(ANSWER, null, 2)}\n\`\`\``
  const reading = await read(thinkingProvider({ reasoningTokens: 200, content: fenced }))
  assert.equal(reading.method, 'model')
  assert.deepEqual(
    reading.team.map((p) => p.label),
    ['Alex']
  )
})

test('an answer cut off by the token limit falls back to the rules, and says it was cut off', async () => {
  const reading = await read(thinkingProvider({ reasoningTokens: 1_000_000 }))
  assert.equal(reading.method, 'rules')
  assert.equal(reading.reason, 'truncated')
  assert.equal(reading.model, 'deepseek-v4-pro')
  assert.ok(reading.services.length, 'the rules still read what they can')
})

test('an empty answer and an answer that is not JSON are told apart', async () => {
  const empty = await read(thinkingProvider({ reasoningTokens: 10, content: '' }))
  assert.equal(empty.method, 'rules')
  assert.equal(empty.reason, 'empty')
  const prose = await read(thinkingProvider({ reasoningTokens: 10, content: 'The business offers padel.' }))
  assert.equal(prose.method, 'rules')
  assert.equal(prose.reason, 'unreadable')
})

test('the same call picks the sub-trade from the trade’s list, quoting Google’s types or the social category', async () => {
  const content = JSON.stringify({
    ...ANSWER,
    subTrade: {
      id: 'coaching',
      quotes: [
        { quote: 'Personal Coach', ref: 'category:instagram' },
        { quote: 'European Coaching in Dubai', ref: 'bio' }
      ]
    }
  })
  const provider = thinkingProvider({ reasoningTokens: 200, content })
  const reading = await readBusiness({
    ...RESEARCH,
    trade: 'fitness',
    googleTypes: ['sports_club', 'association_or_organization', 'point_of_interest'],
    categories: [{ source: 'instagram', text: 'Personal Coach' }],
    door: DOOR,
    charge: (_spec, call) => call(),
    fetchImpl: provider.fetchImpl,
    log: { warn() {} }
  })
  assert.equal(provider.seen.length, 1, 'one model call reads the business and its sub-trade')
  const prompt = provider.seen[0].messages[1].content
  assert.match(prompt, /Kinds of business/)
  assert.match(prompt, /\[google:types\] \(google-types\)\n"sports_club, association_or_organization"/)
  assert.match(prompt, /\[category:instagram\] \(category on instagram\)\n"Personal Coach"/)
  assert.match(provider.seen[0].messages[0].content, /name is weak evidence/)
  assert.equal(reading.subTrade.id, 'coaching')
  assert.deepEqual(
    reading.subTrade.quotes.map((q) => q.source.ref),
    ['category:instagram', 'bio']
  )
  assert.match(reading.version, /^business-reading-4-/)
})
