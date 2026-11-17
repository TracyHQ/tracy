// The build chat's research with no link goes through the step chain (#575): the business is looked for by its name
// and city with the step chain's own name search; a place found is asked about on the same place question card as an
// ambiguous Google link, and the chosen place runs exactly the link flow. With no place, the content brief is the
// step chain's own (`createRevision`) made from the owner's statements, and what is asked next comes from that
// brief's readiness. The doors are called as the dsh tool calls them; the domain's network doors, the business
// reading's model and the needs profile's model are fakes. Every business, place, link and price is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-no-link-research.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { ANSWER_READING_PROMPT } from 'website-opportunities/domain/answer-reading.mjs'
import { briefGapQuestionsOf } from 'website-opportunities/domain'
import { moveToNextGeneration } from '../src/build-draft/fresh-start.js'
import { fileDb } from './_db.mjs'
import {
  bakeryDomain,
  drain,
  memoryObjects,
  placeExecutor,
  pngBytes,
  server
} from './build-draft-place-research-fixtures.mjs'
import { needsReading } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const one = async (sql, params) => (await db.pool.query(sql, params)).rows[0]
const NAME = 'Pellmoor Cycle Workshop'
const CITY = 'Quarrytown'
const WORDS = 'Pellmoor Cycle Workshop is a small workshop for bicycles in Quarrytown, run by two friends.'
const REPAIRS = 'We repair bikes the same day, from 25 dollars.'
const FOUND = {
  provider: 'google-places',
  providerId: 'ChIJinventedPellmoor01',
  name: NAME,
  address: '3 Tinder Row'
}

/** An invented model door for the business reading: it quotes the repair service when the owner's words name it. */
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
  readingFetch: async (_url, init) => {
    const prompt = JSON.parse(init.body).messages[1].content
    const ref = [...prompt.matchAll(/^\[([^\]]+)\] \([^)]*\)\n"([\s\S]*?)"$/gm)].find((m) =>
      m[2].includes('repair bikes')
    )?.[1]
    const answer = ref
      ? { services: [{ name: 'Bike repairs', quote: REPAIRS, ref, price: '' }] }
      : { uspThemes: [] }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 400, completion_tokens: 100, total_tokens: 500 }
    })
  }
}

/** A server whose Google name search answers `found` (a list of candidates), recording each query. */
async function serverFinding(found) {
  const objects = memoryObjects()
  const { domain, calls } = await bakeryDomain({ png: await pngBytes() })
  domain.searchNamedPlaces = async (query) => {
    calls.push(['search', query])
    if (query?.placeId) return { candidates: found.filter((c) => c.providerId === query.placeId) }
    return { candidates: found }
  }
  // The build model door: the needs profile's reading each research, and the answer reading, which reads no fact in
  // a typed answer here (the business reading reads the answer as an owner statement).
  const model = async (request) =>
    request?.system === ANSWER_READING_PROMPT
      ? JSON.stringify({ answers: [] })
      : JSON.stringify(needsReading())
  const s = server(db.pool, { domain, objects, model, gatherDoors: READING })
  return { s, domain, objects, calls }
}

/** Research with no link, waited until the step ends, and the engine state then. */
async function research(s, body = { links: [], name: NAME, city: CITY, description: WORDS }) {
  const started = await s.call('POST', '/research', body)
  await s.app.buildDraftEngine.settled(await s.accountId())
  return { started, ended: await s.call('GET', '/engine') }
}

const fault = async () => JSON.stringify((await one('select fault from build_draft'))?.fault ?? null)

test(
  'no link, the name and city found: the place question, then the link flow on the chosen place',
  opts,
  async () => {
    const { s, domain, objects, calls } = await serverFinding([FOUND])
    const { ended } = await research(s)
    assert.equal(ended.body.state, 'asking', await fault())
    const question = ended.body.result.questions[0]
    assert.equal(question.topic, 'place-choice')
    assert.deepEqual(
      question.choices.map((c) => c.id),
      [FOUND.providerId, 'none']
    )
    const search = calls.find(([door, q]) => door === 'search' && q?.query)
    assert.match(search[1].query, /Pellmoor Cycle Workshop/)
    assert.match(search[1].query, /Quarrytown/)
    assert.equal(
      (await one('select count(*)::int as n from wo_opportunity')).n,
      0,
      'nothing saved before the pick'
    )

    await s.call('PUT', '/answers', {
      question,
      answer: { schema: 'tracy-build-answer/v1', question: question.id, choice: FOUND.providerId }
    })
    const picked = await research(s)
    assert.equal(picked.ended.body.state, 'running', JSON.stringify(picked.ended.body))
    await drain(placeExecutor(db.pool, domain, objects))
    const { later } = await s.poll()
    assert.equal(later.body.state, 'done', await fault())
    const opp = await one('select id, provider, provider_id, place_id from wo_opportunity')
    assert.equal(opp.provider_id, FOUND.providerId, 'the chosen place is the saved business')
    assert.ok(opp.place_id, 'researched as a shared place, as a link is')
    const { research: record } = await one('select research from build_draft')
    assert.equal(record.ids.opportunityId, opp.id)
    assert.ok(record.ids.revisionId)
  }
)

test('none of these: the brief is the step chain brief made from the owner statements', opts, async () => {
  const { s } = await serverFinding([FOUND])
  const { ended } = await research(s)
  const question = ended.body.result.questions[0]
  await s.call('PUT', '/answers', {
    question,
    answer: { schema: 'tracy-build-answer/v1', question: question.id, choice: 'none' }
  })
  const { ended: done } = await research(s)
  assert.equal(done.body.state, 'done', await fault())
  const { id: draftId, research: record } = await one('select id, research from build_draft')
  const opp = await one('select * from wo_opportunity')
  assert.equal(opp.place_id, null, 'no place: the owner statements are its only source')
  assert.equal(opp.candidate.ownSite.buildDraft, draftId)
  const revision = await one('select id, brief, asset_manifest from wo_revision where opportunity_id = $1', [
    opp.id
  ])
  assert.deepEqual(record.ids, { opportunityId: opp.id, placeId: null, revisionId: revision.id })
  assert.equal(record.brief.business.name, NAME)
  assert.equal(revision.brief.business.name, NAME)
  assert.ok(Array.isArray(record.manifest))
  assert.ok(record.brief.readiness?.ownerQuestions, 'the brief carries the step chain readiness')
  const source = await one('select status, collected from wo_source where opportunity_id = $1', [opp.id])
  assert.equal(source.status, 'complete')
  assert.ok(
    source.collected.statements.includes(WORDS),
    'the owner words are kept as the owner-statement source'
  )
  // D46: the owner's sentence never reaches the brief word for word.
  assert.ok(!JSON.stringify(record.brief).includes(WORDS))
})

test(
  'nothing found: no question about places; the readiness of the brief drives the next questions',
  opts,
  async () => {
    const { s } = await serverFinding([])
    const { ended } = await research(s)
    assert.equal(ended.body.state, 'done', await fault())
    const { research: record } = await one('select research from build_draft')
    const expected = briefGapQuestionsOf(record.brief.readiness)
    assert.ok(expected.length > 0 && expected.length <= 3, JSON.stringify(expected))
    const asked = ended.body.result.questions.filter((q) => q.topic === 'brief-gap')
    assert.deepEqual(
      asked.map((q) => q.id),
      expected.map((q) => q.id)
    )
    // Blocking first: no offering was found, so the first question asks what the business offers.
    assert.equal(asked[0].id, 'brief-gap.offerings')
    assert.ok(
      asked.every((q) => q.choices.length >= 1),
      'each question has a button'
    )
    assert.ok(ended.body.result.ask.questions.length <= 3, 'at most three on the card')
  }
)

test(
  'an answer fills the brief, its question goes, and the sentence is never copied (D46)',
  opts,
  async () => {
    const { s } = await serverFinding([])
    const { ended } = await research(s)
    const question = ended.body.result.questions.find((q) => q.id === 'brief-gap.offerings')
    const answered = await s.call('PUT', '/answers', {
      question,
      answer: { schema: 'tracy-build-answer/v1', question: question.id, text: REPAIRS }
    })
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
    // The same research again rebuilds the brief with the answer.
    const { ended: again } = await research(s)
    assert.equal(again.body.state, 'done', await fault())
    const { research: record } = await one('select research from build_draft')
    assert.deepEqual(
      (record.brief.reading?.services ?? []).map((x) => x.label ?? x.name),
      ['Bike repairs']
    )
    assert.ok(
      !again.body.result.questions.some((q) => q.id === 'brief-gap.offerings'),
      'answered, not asked again'
    )
    assert.ok(record.owner.statements.includes(REPAIRS))
    const paths = []
    const walk = (v, at) => {
      // Evidence quotes are where a fact was read, never copy the site shows (`description-guard.js`).
      if (at.endsWith('.evidence')) return
      if (typeof v === 'string' && v.includes(REPAIRS)) paths.push(at)
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`)
    }
    walk(record.brief, 'brief')
    assert.deepEqual(paths, [], 'the answer is never copied word for word')
    const revisions = (await one('select count(*)::int as n from wo_revision')).n
    assert.ok(revisions >= 2, 'the step chain brief was made again')
    // Nothing waits any more: the same research answers what it has, and makes no new brief.
    await research(s)
    assert.equal((await one('select count(*)::int as n from wo_revision')).n, revisions)
  }
)

test('start over forgets the owner business; a new research saves a new one', opts, async () => {
  const { s } = await serverFinding([])
  await research(s)
  const accountId = await s.accountId()
  const first = await one('select id from wo_opportunity')
  const moved = await moveToNextGeneration(db.pool, accountId, { only: 'asked' })
  assert.ok(moved.generation >= 1, JSON.stringify(moved))
  const forgot = await one('select candidate from wo_opportunity where id = $1', [first.id])
  assert.equal(forgot.candidate.ownSite.buildDraft, undefined)
  const { started, ended } = await research(s)
  assert.equal(ended.body.state, 'done', JSON.stringify({ started: started.body, ended: ended.body }))
  const { research: record } = await one('select research from build_draft')
  assert.notEqual(record.ids.opportunityId, first.id)
})
