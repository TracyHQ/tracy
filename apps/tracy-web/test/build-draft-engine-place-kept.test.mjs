// A research run again after it finished (#609): the place the owner chose for an ambiguous Google link is kept with
// the research, so a later research of the same Google link never asks it again; the same research asked for again
// runs again and keeps the owner's answers to the questions it asks the same way. Driven through the engine doors as `tracy_build` calls
// them; the gatherer and the model are fakes. Every business, place and link here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-engine-place-kept.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { placeAmbiguousError } from '../src/build-draft/gather-place.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import {
  KIT_ROOT,
  OWNER,
  actor,
  config,
  gatheredBrief,
  kits,
  needsReading
} from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

const GOOGLE = 'https://www.google.com/maps/search/?api=1&query=Larkfen+Racquet+Club'
const OTHER_GOOGLE = 'https://www.google.com/maps/search/?api=1&query=Larkfen+Racquet+Club+Annex'
const SITE = 'https://larkfen-racquets.example/'
const BRANCHES = [
  {
    provider: 'google-places',
    providerId: 'ChIJinventedLarkN1',
    name: 'Larkfen Racquet Club',
    address: '3 Willowmere Row'
  },
  {
    provider: 'google-places',
    providerId: 'ChIJinventedLarkS2',
    name: 'Larkfen Racquet Club',
    address: '9 Copsey Lane'
  }
]

/** A server whose gatherer asks which place a Google link means until it is handed one. */
function server() {
  const gathered = []
  const gather = async (input) => {
    gathered.push(input)
    if (input.links.some((l) => l.includes('google.com')) && !input.place) throw placeAmbiguousError(BRANCHES)
    return gatheredBrief()
  }
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine: {
      gather,
      buildModel: async () => async () => JSON.stringify(needsReading()),
      buildChatOn: async () => true
    }
  })
  async function call(method, path, body) {
    const headers = {
      'x-tracy-actor': actor(OWNER),
      'x-tracy-session': await buildSessionIdFor(OWNER, config.sessionSecret)
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${config.origin}/api/build-draft${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
    return { status: res.status, body: await res.json() }
  }
  const accountId = async () =>
    (await db.pool.query('select id from account where email = $1', [OWNER])).rows[0]?.id
  async function run(method, path, body) {
    const started = await call(method, path, body)
    await app.buildDraftEngine.settled(await accountId())
    return { started, ended: await call('GET', '/engine') }
  }
  return { call, run, gathered }
}

/** The owner's draft, asked the place, answered with the second branch, researched with it. */
async function researchedWithPlace(s) {
  const asked = await s.run('POST', '/research', { links: [GOOGLE, SITE] })
  assert.equal(asked.ended.body.state, 'asking', JSON.stringify(asked.ended.body))
  const question = asked.ended.body.result.questions[0]
  const pick = { schema: 'tracy-build-answer/v1', question: question.id, choice: BRANCHES[1].providerId }
  assert.equal((await s.call('PUT', '/answers', { question, answer: pick })).status, 200)
  const done = await s.run('POST', '/compose', {})
  assert.equal(done.ended.body.step, 'research')
  assert.equal(done.ended.body.state, 'done', JSON.stringify(done.ended.body))
  return done.ended.body
}

test(
  'a finished research run again for the same Google link reads the chosen place, never asks it again',
  opts,
  async () => {
    const s = server()
    await researchedWithPlace(s)
    assert.deepEqual(s.gathered.at(-1).place, BRANCHES[1])
    // The agent researches again with the owner's other words: the research runs, with the place already chosen.
    const again = await s.run('POST', '/research', {
      links: [GOOGLE, SITE],
      description: 'Courts open late.'
    })
    assert.equal(again.ended.body.state, 'done', JSON.stringify(again.ended.body))
    assert.equal(s.gathered.length, 3, 'the research ran again')
    assert.deepEqual(s.gathered.at(-1).place, BRANCHES[1])
    // Another Google link is another place: asked again.
    const other = await s.run('POST', '/research', { links: [OTHER_GOOGLE, SITE] })
    assert.equal(other.ended.body.state, 'asking')
    assert.equal(other.ended.body.result.questions[0].topic, 'place-choice')
  }
)

test(
  'the same research asked for again runs again and keeps the answers to the questions it asks the same way',
  opts,
  async () => {
    const s = server()
    const first = await researchedWithPlace(s)
    const question = first.result.questions[0]
    assert.ok(question, 'the profile asks a question')
    const answer = question.choices?.length
      ? { schema: 'tracy-build-answer/v1', question: question.id, choice: question.choices[0].id }
      : { schema: 'tracy-build-answer/v1', question: question.id, text: 'Book a court online' }
    assert.equal((await s.call('PUT', '/answers', { question, answer })).status, 200)
    const runs = s.gathered.length
    const repeat = await s.call('POST', '/research', { links: [GOOGLE, SITE] })
    assert.equal(repeat.status, 200)
    await s.run('GET', '/engine')
    const ended = (await s.call('GET', '/engine')).body
    assert.equal(ended.state, 'done', JSON.stringify(ended))
    assert.equal(s.gathered.length, runs + 1, 'the research ran again')
    assert.deepEqual(s.gathered.at(-1).place, BRANCHES[1], 'with the place already chosen')
    assert.ok(!(ended.result.ask?.questions ?? []).some((q) => q.id === question.id), 'the answer is kept')
    const draft = await s.call('GET', '')
    assert.ok(draft.body.draft.answers.some((a) => a.question === question.id))
  }
)
