// What the owner of a business with no link answers stays answered (#575 no link walk): the facts the answer reading
// reads in a typed answer become the business's own owner edits (the hours as the step chain's hours pick, the phone
// as its profile edit), so the brief made again holds them, its readiness no longer misses them, and the next round
// asks only what still blocks. Research called with no link and no name asks for them and records no fault. The
// doors are called as the dsh tool calls them; the network doors and every model are fakes. All data is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-no-link-answers-kept.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { ANSWER_READING_PROMPT } from 'website-opportunities/domain/answer-reading.mjs'
import { fileDb } from './_db.mjs'
import { bakeryDomain, memoryObjects, pngBytes, server } from './build-draft-place-research-fixtures.mjs'
import { needsReading } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const one = async (sql, params) => (await db.pool.query(sql, params)).rows[0]
const NAME = 'Tamsel Rope Gym'
const CITY = 'Brindlewick'
const WORDS = 'Tamsel Rope Gym is a small climbing gym in Brindlewick.'
const HOURS_SAID = 'we open Monday to Friday 7 to 22'
const PHONE = '+1 555 0100 233'
const TYPED = `Bouldering and rope classes; ${HOURS_SAID}, call ${PHONE}.`

/** The business reading's model door: it reads nothing (the facts here come from the answer reading). */
const READING = {
  readingDoor: async () => ({
    state: 'ready',
    door: {
      url: 'https://llm.example/v1/chat/completions',
      key: 'test-key',
      model: 'invented',
      effort: 'off'
    }
  }),
  readingFetch: async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify({ uspThemes: [] }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
    })
}

async function serverOf() {
  const { domain } = await bakeryDomain({ png: await pngBytes() })
  domain.searchNamedPlaces = async () => ({ candidates: [] })
  // The answer reading reads the hours as hours lines and the phone as written, on every typed answer.
  const model = async (request) => {
    if (request?.system !== ANSWER_READING_PROMPT) return JSON.stringify(needsReading())
    const { answers } = JSON.parse(request.user)
    return JSON.stringify({
      answers: answers.map((a) => ({
        question: a.question,
        facts: [
          { kind: 'contact.hours', value: 'Mo-Fr 07:00-22:00', evidence: HOURS_SAID },
          { kind: 'contact.phone', value: PHONE, evidence: `call ${PHONE}` }
        ]
      }))
    })
  }
  return server(db.pool, { domain, objects: memoryObjects(), model, gatherDoors: READING })
}

async function research(s, body = { links: [], name: NAME, city: CITY, description: WORDS }) {
  const started = await s.call('POST', '/research', body)
  await s.app.buildDraftEngine.settled(await s.accountId())
  return { started, ended: await s.call('GET', '/engine') }
}

test('typed hours and phone are kept on the business and never asked or missed again', opts, async () => {
  const s = await serverOf()
  const { ended } = await research(s)
  assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
  const first = ended.body.result.questions.filter((q) => q.topic === 'brief-gap')
  assert.ok(first.length > 0 && first.length <= 3)
  for (const question of first)
    await s.call('PUT', '/answers', {
      question,
      answer: { schema: 'tracy-build-answer/v1', question: question.id, text: TYPED }
    })
  const { ended: again } = await research(s)
  assert.equal(again.body.state, 'done', JSON.stringify(again.body))
  const opp = await one('select candidate from wo_opportunity')
  assert.deepEqual(opp.candidate.hoursPick.hours, ['Mo-Fr 07:00-22:00'])
  assert.equal(opp.candidate.profileEdits.phone.value, PHONE)
  const { research: record } = await one('select research from build_draft')
  const missing = (record.brief.readiness?.ownerQuestions ?? []).map((q) => q.field)
  assert.ok(!missing.includes('hours'), `hours still missing: ${missing}`)
  assert.ok(!missing.includes('phone'), `phone still missing: ${missing}`)
  // A later round asks only what blocks: none of the first round's fields, no field asked twice.
  const later = again.body.result.questions.filter((q) => q.topic === 'brief-gap').map((q) => q.id)
  for (const id of later) assert.ok(!first.some((q) => q.id === id), `${id} asked again`)
  const blocking = new Set(
    (record.brief.readiness?.checks ?? [])
      .filter((c) => c.verdict === 'block')
      .flatMap((c) => (c.questions ?? []).map((q) => q.field))
  )
  assert.ok(later.length <= blocking.size, `a later round asked more than blocks: ${later}`)
})

test('research with no link and no name asks for them and records no fault', opts, async () => {
  const s = await serverOf()
  const asked = await s.call('POST', '/research', { links: [], description: 'I want a website.' })
  assert.equal(asked.status, 200, JSON.stringify(asked.body))
  assert.equal(asked.body.state, 'needs')
  assert.deepEqual(asked.body.needs, ['name', 'city'])
  const row = await one('select fault, engine from build_draft')
  assert.equal(row?.fault ?? null, null, 'no fault recorded')
})
