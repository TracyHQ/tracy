// A fact the owner typed in the build chat is never lost without a reason (decision D46, #609): an item read from the
// owner's statement whose quote is not word for word in it is recorded with why, asked again once in a short call on
// the statement alone, and kept when that answer quotes it. An invented climbing hall and a scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/business-reading-owner-quote.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { OWNER_QUOTE_RETRY_SYSTEM } from '../domain/owner-quote-prompt.mjs'
import { readBusiness } from '../src/business-reading.js'
import {
  CLUB_LABEL,
  EXACT_QUOTE,
  FIRST_ANSWER,
  HALL_CLUB_SENTENCE,
  HALL_NAME,
  HALL_PAGES,
  HALL_STATEMENT,
  RETRY_ANSWER,
  RETRY_REWORDED
} from './fixtures/owner-statement/climbing-hall.mjs'

const DOOR = {
  state: 'ready',
  door: { url: 'https://model.example.test/chat/completions', key: 'k', model: 'fake-model', effort: 'off' }
}
const INPUT = { name: HALL_NAME, websitePages: HALL_PAGES, ownerStatement: HALL_STATEMENT }

/** Read with a scripted model giving `answers` in turn (the last one again); returns the reading and every request. */
async function readWith(input, answers) {
  const bodies = []
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    const answer = answers[Math.min(bodies.length, answers.length) - 1]
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

const owned = (reading) => reading.services.filter((s) => s.source.kind === 'owner-statement')

test('an owner item whose quote rewords the statement is dropped with its reason, never silently', () => {
  const sources = readingSourcesOf(INPUT)
  const read = checkBusinessReading(FIRST_ANSWER, sources, { trade: 'fitness' })
  assert.deepEqual(owned(read), [])
  assert.deepEqual(read.ownerItemsDropped, [
    { group: 'services', label: CLUB_LABEL, why: 'quote_not_found' },
    { group: 'uspThemes', label: 'evening climbing clubs for teens', why: 'quote_not_found' }
  ])
})

test('an owner item quoting a word for word span of the statement stands, case and spacing aside', () => {
  const sources = readingSourcesOf(INPUT)
  const read = checkBusinessReading(
    { services: [{ name: CLUB_LABEL, quote: `  ${EXACT_QUOTE.toUpperCase()} `, ref: 'owner' }] },
    sources
  )
  assert.deepEqual(
    owned(read).map((s) => s.label),
    [CLUB_LABEL]
  )
  assert.equal('ownerItemsDropped' in read, false)
})

test('an owner item naming the passage by its kind is read against the statement, never against web text', () => {
  const sources = readingSourcesOf(INPUT)
  const read = checkBusinessReading(
    { services: [{ name: CLUB_LABEL, quote: EXACT_QUOTE, ref: 'owner-statement' }] },
    sources
  )
  assert.deepEqual(
    owned(read).map((s) => s.source),
    [{ kind: 'owner-statement', ref: 'owner' }]
  )
  // A web quote under the owner's ref is not the owner's words: it is dropped, with its reason.
  const web = checkBusinessReading(
    { services: [{ name: 'Shoe rental', quote: 'shoe rental', ref: 'owner' }] },
    sources
  )
  assert.deepEqual(web.services, [])
  assert.deepEqual(web.ownerItemsDropped, [
    { group: 'services', label: 'Shoe rental', why: 'quote_not_found' }
  ])
})

test('the one owner quote retry reads the statement alone and keeps the item it now quotes exactly', async () => {
  const { reading, bodies } = await readWith(INPUT, [FIRST_ANSWER, RETRY_ANSWER])
  assert.equal(bodies.length, 2)
  const retry = bodies[1]
  assert.equal(retry.messages[0].content, OWNER_QUOTE_RETRY_SYSTEM)
  const user = retry.messages[1].content
  assert.ok(user.includes(JSON.stringify(HALL_STATEMENT)), 'the passage the reading read')
  assert.equal(user.includes('shoe rental'), false, 'no web text')
  assert.ok(user.includes(CLUB_LABEL))
  assert.deepEqual(
    owned(reading).map((s) => [s.label, s.quote]),
    [[CLUB_LABEL, EXACT_QUOTE]]
  )
  assert.equal(reading.ownerQuoteRetry, 'done')
  assert.deepEqual(
    reading.ownerItemsDropped.map((d) => [d.group, d.why, d.retry]),
    [
      ['services', 'quote_not_found', 'kept'],
      ['uspThemes', 'quote_not_found', 'kept']
    ]
  )
  assert.ok(HALL_CLUB_SENTENCE.includes(reading.services.at(-1).quote))
})

test('a retry that rewords again leaves the drop recorded as rejected, and no second retry', async () => {
  const { reading, bodies } = await readWith(INPUT, [FIRST_ANSWER, RETRY_REWORDED])
  assert.equal(bodies.length, 2)
  assert.deepEqual(owned(reading), [])
  assert.deepEqual(
    reading.ownerItemsDropped.map((d) => [d.group, d.why, d.retry ?? d.detail]),
    [
      ['services', 'quote_not_found', 'rejected'],
      ['uspThemes', 'quote_not_found', 'rejected'],
      ['services', 'retry_rejected', 'quote_not_found']
    ]
  )
})

test('the retry answer is checked against the statement alone: a web quote in it never stands', async () => {
  const web = { services: [{ name: 'Shoe rental', quote: 'shoe rental', ref: 'website:1:1' }] }
  const { reading } = await readWith(INPUT, [FIRST_ANSWER, web])
  assert.equal(
    reading.services.some((s) => s.label === 'Shoe rental'),
    false
  )
  assert.deepEqual(
    reading.ownerItemsDropped.map((d) => [d.group, d.why, d.retry ?? d.detail]),
    [
      ['services', 'quote_not_found', 'rejected'],
      ['uspThemes', 'quote_not_found', 'rejected'],
      ['services', 'retry_rejected', 'unknown_source']
    ]
  )
})

test('a failed retry keeps the reading and its recorded drops', async () => {
  let n = 0
  const fetchImpl = async () => {
    n += 1
    if (n > 1) throw new Error('network down')
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(FIRST_ANSWER) }, finish_reason: 'stop' }],
        usage: {}
      })
    }
  }
  const reading = await readBusiness({
    ...INPUT,
    door: DOOR,
    charge: (_spec, call) => call(),
    fetchImpl,
    log: { warn() {} }
  })
  assert.equal(reading.ownerQuoteRetry, 'failed')
  assert.equal(reading.ownerItemsDropped.length, 2)
})

test('without an owner statement nothing is recorded and no retry is asked', async () => {
  const { reading, bodies } = await readWith({ name: HALL_NAME, websitePages: HALL_PAGES }, [
    { services: [{ name: 'Rope courses', quote: 'rope courses', ref: 'website:1:1' }] }
  ])
  assert.equal('ownerItemsDropped' in reading, false)
  assert.equal('ownerQuoteRetry' in reading, false)
  assert.ok(bodies.every((b) => b.messages[0].content !== OWNER_QUOTE_RETRY_SYSTEM))
})
