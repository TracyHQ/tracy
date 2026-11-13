// The owner's chat statement in the business reading (decision D46): a source whose facts are read and whose words are
// never copy. An invented pottery studio, a scripted fake model; no real business, person or model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-statement-reading.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  BUSINESS_READING_SYSTEM,
  checkBusinessReading,
  readBusinessByRules,
  readingSourcesOf,
  withListedServiceParts
} from '../domain/business-reading.mjs'
import { OWNER_STATEMENT_RULE, businessReadingSystemOf } from '../domain/owner-statement-prompt.mjs'
import { OWNER_STATEMENT_MAX, ownerPassageOf } from '../domain/owner-statement.mjs'
import { readBusiness, readingInputOf } from '../src/business-reading.js'
import { fingerprintOf } from './fixtures/owner-statement/fingerprint.mjs'
import {
  ANSWER_ECHOING_OWNER,
  ANSWER_READING_OWNER,
  COACHING,
  COACHING_ANSWER,
  HELD_PERSON,
  OWNER_STATEMENT,
  RESEARCH
} from './fixtures/owner-statement/research.mjs'

const BASELINE = JSON.parse(
  readFileSync(new URL('./fixtures/owner-statement/baseline.json', import.meta.url), 'utf8')
)
const DOOR = {
  state: 'ready',
  door: { url: 'https://model.example.test/chat/completions', key: 'k', model: 'fake-model', effort: 'off' }
}

/** Read with a scripted model answering `answer`; returns the reading and every request body the model received. */
async function readWith(input, answer) {
  const bodies = []
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      })
    }
  }
  const reading = await readBusiness({
    ...input,
    door: DOOR,
    charge: (_spec, call) => call(),
    fetchImpl,
    log: { warn() {} }
  })
  return { reading, bodies }
}

test('without a statement, a blank one or one of spaces, the reading sends and returns what it did before', async () => {
  for (const extra of [{}, { ownerStatement: null }, { ownerStatement: '' }, { ownerStatement: '  \n\t ' }]) {
    assert.deepEqual(await fingerprintOf(RESEARCH, ANSWER_READING_OWNER, extra), BASELINE.pottery)
    assert.deepEqual(await fingerprintOf(COACHING, COACHING_ANSWER, extra), BASELINE.coaching)
  }
  assert.equal(businessReadingSystemOf(readingSourcesOf(RESEARCH)), BUSINESS_READING_SYSTEM)
})

test('readingInputOf leaves the statement out of the input unless it holds words', () => {
  const profile = { name: RESEARCH.name, bio: RESEARCH.bio }
  const base = readingInputOf({ profile, google: null, collected: [] })
  assert.deepEqual(readingInputOf({ profile, google: null, collected: [], ownerStatement: '   ' }), base)
  assert.equal('ownerStatement' in base, false)
  const typed = readingInputOf({ profile, google: null, collected: [], ownerStatement: OWNER_STATEMENT })
  assert.equal(typed.ownerStatement, OWNER_STATEMENT)
})

test('the statement is one passage, first, and the model is told it is the owner speaking, never copy', async () => {
  const sources = readingSourcesOf({ ...RESEARCH, ownerStatement: OWNER_STATEMENT })
  assert.deepEqual({ ref: sources[0].ref, kind: sources[0].kind }, { ref: 'owner', kind: 'owner-statement' })
  assert.equal(sources.filter((s) => s.kind === 'owner-statement').length, 1)
  const { bodies } = await readWith({ ...RESEARCH, ownerStatement: OWNER_STATEMENT }, ANSWER_READING_OWNER)
  const [system, user] = bodies[0].messages
  assert.ok(system.content.endsWith(OWNER_STATEMENT_RULE))
  assert.match(OWNER_STATEMENT_RULE, /owner's own statement/)
  assert.match(OWNER_STATEMENT_RULE, /never copy/)
  assert.match(user.content, /\[owner\] \(owner-statement\)/)
})

test("the statement's facts are read, and every item from it names the owner statement as its source", () => {
  const sources = readingSourcesOf({ ...RESEARCH, ownerStatement: OWNER_STATEMENT })
  const read = checkBusinessReading(ANSWER_READING_OWNER, sources, { trade: 'other' })
  const fromOwner = (group) =>
    read[group].filter((i) => i.source.kind === 'owner-statement').map((i) => i.label)
  assert.deepEqual(fromOwner('services'), ['Kiln space rental'])
  assert.deepEqual(fromOwner('story'), ['family studio since 2009'])
  assert.deepEqual(fromOwner('facts'), ['six students per class at most'])
  assert.deepEqual(
    read.keyMessages.map((m) => m.label),
    ['small classes of six']
  )
  assert.deepEqual(read.services.find((i) => i.label === 'Kiln space rental').source, {
    kind: 'owner-statement',
    ref: 'owner'
  })
})

test('a label echoing a sentence of the statement word for word leaves the copy, its fact kept, and is recorded', () => {
  const sources = readingSourcesOf({ ...RESEARCH, ownerStatement: OWNER_STATEMENT })
  const read = checkBusinessReading(ANSWER_ECHOING_OWNER, sources, { trade: 'other' })
  assert.deepEqual(
    read.story.map((i) => i.label),
    ['family studio since 2009']
  )
  assert.deepEqual(read.ownerEchoDropped, [
    {
      group: 'story',
      field: 'label',
      rule: 'run',
      weight: 13,
      why: 'copies_owner_statement',
      kept: 'owner-fact'
    }
  ])
  assert.deepEqual(
    read.ownerFacts.map((f) => [f.kind, f.group, f.text]),
    [['owner-fact', 'story', 'Every class is capped at six students so nobody waits for the wheel']]
  )
  // The same answer read without the statement: nothing to echo, so the guard leaves the reading alone.
  const plain = checkBusinessReading(ANSWER_ECHOING_OWNER, readingSourcesOf(RESEARCH), { trade: 'other' })
  assert.equal(plain.ownerEchoDropped, undefined)
})

test('the rules never echo the statement either, and never list a joined part or a mention from it', () => {
  const statement =
    'We teach Wheel & Handbuilding for beginners. Our glazing workshops sell out every single month.'
  const sources = readingSourcesOf({ ...RESEARCH, ownerStatement: statement })
  const rules = readBusinessByRules(sources)
  assert.equal(rules.ownerEchoDropped, undefined)
  const parts = withListedServiceParts([], sources)
  assert.ok(parts.every((s) => s.source.kind === 'bio'))
  assert.ok(parts.every((s) => (s.mentions ?? []).every((m) => m.source.kind !== 'owner-statement')))
  const answer = {
    services: [
      {
        name: 'Glazing workshops',
        quote: 'Join our glazing workshops this month!',
        ref: 'post:instagram:c1',
        mentions: [{ quote: 'Our glazing workshops sell out every single month.', ref: 'owner' }]
      }
    ]
  }
  const read = checkBusinessReading(answer, sources, { trade: 'other' })
  assert.equal(read.services[0].mentions, undefined)
})

test('a sentence naming a held person never reaches the model, the rest of the statement does', async () => {
  const input = { ...RESEARCH, ownerStatement: OWNER_STATEMENT, heldTexts: [HELD_PERSON] }
  const { bodies, reading } = await readWith(input, ANSWER_READING_OWNER)
  const sent = JSON.stringify(bodies)
  assert.equal(sent.includes('Brannoch'), false)
  assert.ok(sent.includes('capped at six students'))
  assert.deepEqual(reading.ownerStatement, { read: true, heldOut: 1, cut: false })
  // Mutant check: without the held text the same sentence is sent, so the test above fails if stripping is removed.
  const open = await readWith({ ...RESEARCH, ownerStatement: OWNER_STATEMENT }, ANSWER_READING_OWNER)
  assert.ok(JSON.stringify(open.bodies).includes('Brannoch'))
})

test('a held name in slug form is held too, and the held business name through readingInputOf', () => {
  const slug = ownerPassageOf('Find our mugs at brannoch-vey-ceramics on the market list.', [HELD_PERSON])
  assert.deepEqual(slug, { passage: null, heldOut: 1, cut: false })
  const input = readingInputOf({
    profile: { name: 'Corvane Clay Studio', bio: RESEARCH.bio },
    google: null,
    collected: [],
    ownerStatement: 'Corvane Clay Studio opened in a former bakery. We fire twice a week.',
    withheld: { name: true }
  })
  assert.equal(input.nameHeld, true)
  assert.equal('heldTexts' in input, false)
  const passage = readingSourcesOf({ ...input, heldName: input.name }).find(
    (s) => s.kind === 'owner-statement'
  )
  assert.equal(passage.text, 'We fire twice a week.')
})

test('a statement longer than the passage cap is cut at it, and the reading says so', async () => {
  const sentence = 'We glaze every mug by hand in small batches. '
  const long = sentence.repeat(60)
  assert.ok(long.length > OWNER_STATEMENT_MAX)
  const { passage, cut } = ownerPassageOf(long)
  assert.equal(OWNER_STATEMENT_MAX, 1500)
  assert.ok(passage.text.length <= OWNER_STATEMENT_MAX)
  assert.equal(cut, true)
  const { reading } = await readWith({ ...RESEARCH, ownerStatement: long }, ANSWER_READING_OWNER)
  assert.equal(reading.ownerStatement.cut, true)
})
