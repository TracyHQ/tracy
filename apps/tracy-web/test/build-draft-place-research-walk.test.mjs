// What a real owner's walk of the build chat's research of links met (#575, 17/11/2026): a research call again on a
// running research spent the research limit, start over was refused while the place research waited, and the owner's
// own words no longer reached the business reading once they gave links. The doors are called as the dsh tool calls
// them; the domain's network doors and the models are fakes. Every business, link and sentence here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-place-research-walk.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { FACEBOOK, SITE } from './build-draft-gather-fakes.mjs'
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

const one = async (sql, params) => (await db.pool.query(sql, params)).rows[0]
const WORDS = 'Hollowmere Bakehouse repairs bread ovens for other bakers on Mondays, from 40 dollars.'
const ASK = { links: [SITE, FACEBOOK], name: 'Hollowmere Bakehouse', description: WORDS }

/** An invented model door for the business reading of the owner's words: it quotes the oven repairs. */
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
    const ref = [...prompt.matchAll(/^\[([^\]]+)\] \([^)]*\)\n"(.*)"$/gm)].find((m) =>
      m[2].includes('repairs')
    )?.[1]
    const answer = ref
      ? { services: [{ name: 'Oven repairs', quote: WORDS, ref, price: '' }] }
      : { uspThemes: [] }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 400, completion_tokens: 100, total_tokens: 500 }
    })
  }
}

/** The research starts this account counted, in every window. */
const researchCount = async () =>
  Number(
    (
      await one(
        `select coalesce(sum(count), 0) as n from rate_bucket where bucket like 'build-chat:research%'`
      )
    ).n
  )

async function started({ gatherDoors } = {}) {
  const objects = memoryObjects()
  const { domain } = await bakeryDomain({ png: await pngBytes() })
  const s = server(db.pool, { domain, objects, ...(gatherDoors ? { gatherDoors } : {}) })
  const ex = placeExecutor(db.pool, domain, objects)
  const start = await s.call('POST', '/research', ASK)
  await s.app.buildDraftEngine.settled(await s.accountId())
  return { s, ex, start }
}

test('a research call again on a running research starts nothing and spends no count', opts, async () => {
  const { s } = await started()
  assert.equal(await researchCount(), 1, 'the start that spends is counted once')
  for (let n = 0; n < 4; n++) {
    const again = await s.call('POST', '/research', ASK)
    assert.equal(again.status, 200, JSON.stringify(again.body))
    assert.equal(again.body.state, 'running')
  }
  assert.equal(await researchCount(), 1, 'calls again on the running research are not counted')
  assert.equal(Number((await one('select count(*) as n from wo_job')).n), 1, 'and start no second job')
})

test('a research call again on a finished research of the same links answers it as it is', opts, async () => {
  const { s, ex } = await started()
  await drain(ex)
  const { later } = await s.poll()
  assert.equal(later.body.state, 'done', JSON.stringify(later.body))
  const again = await s.call('POST', '/research', ASK)
  assert.equal(again.body.state, 'done', JSON.stringify(again.body))
  assert.equal(await researchCount(), 1)
  assert.ok(Array.isArray(again.body.result.missing), 'the result says what is still missing')
})

test('start over while the place research waits lets go of it and starts a fresh draft', opts, async () => {
  const { s } = await started()
  const accountId = await s.accountId()
  const before = await one('select id from build_draft where account_id = $1', [accountId])
  const res = await s.call('POST', '/start-over', { confirm: true })
  assert.ok(res.status < 300, JSON.stringify(res.body))
  const after = await one('select id, engine from build_draft where account_id = $1', [accountId])
  assert.notEqual(after?.id, before.id, 'a fresh draft')
  assert.ok(
    await one(`select id from wo_job where kind = 'research'`),
    'the shared place research is not deleted'
  )
  assert.notEqual(after?.engine?.state, 'running', 'no step of the old draft runs on the fresh one')
})

test(
  'with links, the owner words still reach the business reading, never verbatim in the brief',
  opts,
  async () => {
    const { s, ex } = await started({ gatherDoors: READING })
    await drain(ex)
    const { later } = await s.poll()
    assert.equal(later.body.state, 'done', JSON.stringify(later.body))
    const { research } = await one('select research from build_draft where account_id = $1', [
      await s.accountId()
    ])
    assert.ok(research.descriptionFacts, `the reading of the owner words is kept: ${Object.keys(research)}`)
    assert.ok(
      !JSON.stringify(research.brief).includes(WORDS),
      'the owner sentence is never copied into the brief (D46)'
    )
  }
)
