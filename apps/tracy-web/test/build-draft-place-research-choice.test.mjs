// The place question of the build chat's research of links (#575): a Google link matching two branches of one name is
// asked about in the chat before anything is saved; the branch the owner picks is the saved opportunity's place, and a
// later research of the same Google link reads it from there, so the question never comes back. The owner's words
// alone are still read without any link. Every business, branch and link here is invented; no place id is real.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-place-research-choice.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { SITE } from './build-draft-gather-fakes.mjs'
import {
  bakeryDomain,
  drain,
  memoryObjects,
  placeExecutor,
  pngBytes,
  server
} from './build-draft-place-research-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const NORTH = 'ChIJinventedNorth01'
const SOUTH = 'ChIJinventedSouth02'
const BRANCHES = [
  { provider: 'google-places', providerId: NORTH, name: 'Hollowmere Bakehouse', address: '12 Quillan Lane' },
  { provider: 'google-places', providerId: SOUTH, name: 'Hollowmere Bakehouse', address: '4 Fernwick Road' }
]
const WORDS = 'https://www.google.com/maps/search/?api=1&query=Hollowmere+Bakehouse'

/** The invented bakery with two branches of one name: a text search finds both, a place id search the one. */
async function twoBranches() {
  const { domain, calls } = await bakeryDomain({ png: await pngBytes() })
  domain.searchNamedPlaces = async (query) => {
    calls.push(['search', query])
    const one = BRANCHES.find((b) => b.providerId === query?.placeId)
    return { candidates: one ? [one] : BRANCHES }
  }
  return { domain, calls }
}

const count = async (table) => (await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n

test(
  'an ambiguous Google link is a chat question; the pick is saved and never asked again',
  opts,
  async () => {
    const objects = memoryObjects()
    const { domain } = await twoBranches()
    const s = server(db.pool, { domain, objects })
    const ex = placeExecutor(db.pool, domain, objects)
    await s.call('POST', '/research', { links: [WORDS, SITE] })
    await s.app.buildDraftEngine.settled(await s.accountId())
    const asked = await s.call('GET', '/engine')
    const fault = (await db.pool.query('select fault from build_draft')).rows[0]?.fault
    assert.equal(asked.body.state, 'asking', JSON.stringify(fault))
    const question = asked.body.result.questions[0]
    assert.equal(await count('wo_opportunity'), 0, 'nothing is saved before the owner picks')

    // The owner picks the south branch: the research starts on that place.
    const south = question.choices.find((c) => /Fernwick/.test(`${c.label} ${c.detail ?? ''}`))
    assert.ok(south, JSON.stringify(question.choices))
    const answered = await s.call('PUT', '/answers', {
      question,
      answer: { schema: 'tracy-build-answer/v1', question: question.id, choice: south.id }
    })
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
    await s.call('POST', '/research', { links: [WORDS, SITE] })
    await s.app.buildDraftEngine.settled(await s.accountId())
    await drain(ex)
    const { later } = await s.poll()
    assert.equal(later.body.state, 'done', JSON.stringify(later.body))
    const saved = (await db.pool.query('select provider_id from wo_opportunity')).rows
    assert.deepEqual(
      saved.map((r) => r.provider_id),
      [SOUTH]
    )

    // A second research of the same links asks nothing: the saved opportunity names the place.
    await s.call('POST', '/research', { links: [WORDS, SITE] })
    await s.app.buildDraftEngine.settled(await s.accountId())
    const again = await s.call('GET', '/engine')
    assert.notEqual(again.body.state, 'asking', JSON.stringify(again.body))
    const ids = (await db.pool.query('select provider_id from wo_opportunity')).rows.map((r) => r.provider_id)
    assert.deepEqual(ids, [SOUTH], 'the same place, the same opportunity')
  }
)

test(
  'a research refused for its limit after the place question stops with when, never stuck asking (#575)',
  opts,
  async () => {
    const objects = memoryObjects()
    const { domain } = await twoBranches()
    const s = server(db.pool, { domain, objects })
    await s.call('POST', '/research', { links: [WORDS, SITE] })
    await s.app.buildDraftEngine.settled(await s.accountId())
    const asked = await s.call('GET', '/engine')
    assert.equal(asked.body.state, 'asking')
    const question = asked.body.result.questions[0]
    await s.call('PUT', '/answers', {
      question,
      answer: { schema: 'tracy-build-answer/v1', question: question.id, choice: question.choices[0].id }
    })
    // Every research start of this hour is spent.
    await db.pool.query(`update rate_bucket set count = 1000 where bucket like 'build-chat:research%'`)
    const refused = await s.call('POST', '/research', { links: [WORDS, SITE] })
    assert.equal(refused.body.state, 'stopped', JSON.stringify(refused.body))
    assert.match(refused.body.say, /try again in about \d+ (minute|minutes|hours)\./)
    assert.ok(Date.parse(refused.body.retryAt) > Date.now())
    assert.equal((await s.call('GET', '/engine')).body.state, 'stopped', 'the draft is not left asking')
  }
)
