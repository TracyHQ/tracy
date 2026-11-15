// The build chat engine findings of the server review (#609): a research whose end was not recorded, a plan edit
// under a running step, answers that outlive their research, the pictures a living plan still names, and the owner
// triggered spend. Each test drives the app's doors as the dsh tool calls them; the gatherer, the model and the brand
// step are fakes, the draft, the needs profile and the picture store are the real ones. Everything here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-engine-review.test.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { PLAN_EDIT_SCHEMA, composePlan } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { answersStillAsked } from '../src/build-draft/answers-kept.js'
import { BUSY_SAY } from '../src/build-draft/engine-state.js'
import { SPEND_LIMITS, TRY_LATER_SAY } from '../src/build-draft/spend-limits.js'
import { changeDraft, createDraft, putComposed } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import { OWNER, actor, config, gatheredBrief, kits, needsReading } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const RUN_1 = '6b0c1f8e-2d4a-4c71-9a3e-0f5d7b2c9e11'
const RUN_2 = '7c1d2a9f-3e5b-4d82-8b4f-1a6e8c3d0f22'
const SITE = 'https://larkfen-racquets.example/'
const PICTURE_URL = 'https://larkfen-racquets.example/courts.jpg'
const anyReading = async () => JSON.stringify(needsReading())

function server(buildEngine) {
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine
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
  const settled = async () => app.buildDraftEngine.settled(await accountId())
  return { app, call, accountId, settled }
}
const row = async (id) =>
  (await db.pool.query('select * from build_draft where account_id = $1', [id])).rows[0]

/** A gate a fake step waits on, so the test acts while the step runs. */
function gate() {
  let open
  const shut = new Promise((resolve) => (open = resolve))
  return { shut, open }
}

/** One stored draft picture of `run`; answers its id. */
async function storePicture(accountId, run, sha) {
  const { rows } = await db.pool.query(
    `insert into build_draft_picture (account_id, research_run, kind, source, source_url, sha256, object_key, mime, bytes)
     values ($1, $2, 'image', 'website', $3, $4, $5, 'image/jpeg', 10) returning id`,
    [accountId, run, PICTURE_URL, sha, `build-drafts/${accountId}/${sha}.jpg`]
  )
  return rows[0].id
}
const pictureIds = async (accountId) =>
  (await db.pool.query('select id from build_draft_picture where account_id = $1', [accountId])).rows.map(
    (r) => r.id
  )

/** A draft researched as R1 (run 1, one stored picture its manifest names), the club template chosen. */
async function researchedR1({ plan = false } = {}) {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
  const picture = await storePicture(id, RUN_1, 'a'.repeat(64))
  const research = {
    links: [SITE],
    trade: 'fitness',
    profile: club.clubProfile(),
    brief: { business: { name: 'Larkfen Racquet Club' } },
    manifest: [{ id: picture, origin: 'draft', sourceUrl: PICTURE_URL, mime: 'image/jpeg' }],
    pictureRun: RUN_1
  }
  const { accent: _accent, ...template } = club.template()
  await changeDraft(db.pool, id, () => ({
    research,
    template,
    brand: { record: club.brand(), template: { slug: template.slug, version: template.version } }
  }))
  if (plan) {
    const composed = await composePlan({
      blockStore: club.blockStore(),
      pageRecipes: club.pageRecipes(),
      library: club.library(),
      template: club.template(),
      brand: club.brand(),
      profile: club.clubProfile(),
      planId: 'plan-club',
      model: club.scriptedModel(JSON.stringify(club.goodComposition()))
    })
    assert.equal((await putComposed(db.pool, id, composed)).error, undefined)
  }
  return { accountId: id, picture, research }
}

/** A research of run 2 that waits on `held` and stores no picture of run 1. */
const researchR2 = (held) => ({
  gather: async () => {
    await held?.shut
    return { ...gatheredBrief(), pictureRun: RUN_2 }
  },
  buildModel: async () => anyReading,
  buildChatOn: async () => true,
  brandStep: async () => club.brand()
})

test('M1: a research whose end was not recorded prunes nothing', opts, async () => {
  const { accountId, picture } = await researchedR1()
  const held = gate()
  const s = server(researchR2(held))
  assert.equal((await s.call('POST', '/research', { links: [SITE] })).body.state, 'running')
  // The running step is taken from its runner (what an edit's ended step used to write): R2's end is refused.
  await changeDraft(db.pool, accountId, () => ({ engine: { step: 'edit', state: 'done' } }))
  held.open()
  await s.settled()
  const after = await row(accountId)
  assert.equal(after.research.pictureRun, RUN_1, 'the draft still names research 1')
  assert.ok((await pictureIds(accountId)).includes(picture), 'the picture research 1 names is kept')
})

test(
  'M2: a plan edit while a research runs is refused with a sentence, and the research still ends',
  opts,
  async () => {
    const { accountId } = await researchedR1({ plan: true })
    const held = gate()
    const s = server(researchR2(held))
    assert.equal((await s.call('POST', '/research', { links: [SITE] })).body.state, 'running')
    const edit = await s.call('POST', '/edit', { changes: [{ field: 'look.accent', value: '#1F4E9C' }] })
    assert.equal(edit.status, 409, JSON.stringify(edit.body))
    assert.equal(edit.body.code, 'ENGINE_BUSY')
    assert.equal(edit.body.say, BUSY_SAY)
    const plan = (await row(accountId)).plan
    const card = await s.call('POST', '/plan-edits', {
      edit: {
        schema: PLAN_EDIT_SCHEMA,
        id: `edit-${randomUUID()}`,
        plan: { id: plan.id, revision: plan.revision },
        changes: [{ field: 'look.accent', value: '#1F4E9C' }]
      }
    })
    assert.equal(card.status, 409, JSON.stringify(card.body))
    assert.equal(card.body.code, 'ENGINE_BUSY')
    assert.equal(card.body.next, BUSY_SAY)
    held.open()
    await s.settled()
    const ended = await s.call('GET', '/engine')
    assert.deepEqual([ended.body.step, ended.body.state], ['research', 'done'])
    assert.equal(
      (await row(accountId)).research.pictureRun,
      RUN_2,
      'the research the owner asked for is kept'
    )
  }
)

test(
  'M6: research after a plan keeps the pictures the plan names, and approval freezes the plan research',
  opts,
  async () => {
    const { accountId, picture } = await researchedR1({ plan: true })
    const s = server({
      ...researchR2(null),
      startSite: async () => ({ pending: true }),
      readRun: async () => ({ brief: null, job: null })
    })
    await s.call('POST', '/research', { links: [SITE] })
    await s.settled()
    assert.equal((await row(accountId)).research.pictureRun, RUN_2)
    assert.ok((await pictureIds(accountId)).includes(picture), 'the living plan still names this picture')
    const plan = (await row(accountId)).plan
    const approved = await s.call('POST', '/build', { plan: { id: plan.id, revision: plan.revision } })
    assert.ok(approved.status < 300, JSON.stringify(approved.body))
    const { build } = await row(accountId)
    assert.equal(
      build.snapshot.research.pictureRun,
      RUN_1,
      'the plan is built from the research it was made from'
    )
  }
)

/** A brief whose two sources give two phone numbers: the website's first. */
function twoPhones(websitePhone, googlePhone) {
  const g = gatheredBrief()
  const f = (id, value, evidence) => ({
    id,
    field: 'phone',
    value,
    evidence,
    confidence: 'single-source',
    onSite: true,
    decidedBy: 'rule',
    reasons: []
  })
  g.brief.facts = [
    ...g.brief.facts.filter((x) => x.field !== 'phone'),
    f('f-p1', websitePhone, [{ source: 'website', ref: SITE }]),
    f('f-p2', googlePhone, [{ source: 'google' }])
  ]
  return g
}
const PHONE_Q = 'fact-conflict.facts.contact.phone'

/** Research with `brief`, then answer the phone question with its first choice. */
async function researchAndAnswer(s, brief) {
  s.next = brief
  await s.call('POST', '/research', { links: [SITE] })
  await s.settled()
  const done = await s.call('GET', '/engine')
  return done.body.result
}
function phoneServer() {
  const s = server({
    gather: async () => s.next,
    buildModel: async () => anyReading,
    buildChatOn: async () => true
  })
  return s
}

test('M4: an answer to a question the new research no longer asks is dropped', opts, async () => {
  const s = phoneServer()
  const first = await researchAndAnswer(s, twoPhones('+1 555 0177 204', '+1 555 0177 999'))
  const question = first.questions.find((q) => q.id === PHONE_Q)
  assert.ok(question, 'research 1 asks which phone number is right')
  const answer = { schema: 'tracy-build-answer/v1', question: PHONE_Q, choice: 'value-1' }
  assert.equal((await s.call('PUT', '/answers', { question, answer })).status, 200)
  await researchAndAnswer(s, gatheredBrief())
  const { answers, questions } = await row(await s.accountId())
  assert.ok(!answers.some((a) => a.question === PHONE_Q), JSON.stringify(answers))
  assert.ok(!questions.some((q) => q.id === PHONE_Q))
})

test(
  'M4: an answer whose question came back with its choices in another order is asked again',
  opts,
  async () => {
    const s = phoneServer()
    const first = await researchAndAnswer(s, twoPhones('+1 555 0177 204', '+1 555 0177 999'))
    const question = first.questions.find((q) => q.id === PHONE_Q)
    const answer = { schema: 'tracy-build-answer/v1', question: PHONE_Q, choice: 'value-1' }
    assert.equal((await s.call('PUT', '/answers', { question, answer })).status, 200)
    const second = await researchAndAnswer(s, twoPhones('+1 555 0177 999', '+1 555 0177 204'))
    assert.equal(second.questions.find((q) => q.id === PHONE_Q).choices[0].label, '+1 555 0177 999')
    assert.ok(
      (second.ask?.questions ?? []).some((q) => q.id === PHONE_Q),
      'the phone question is back on the card'
    )
    assert.ok(!(await row(await s.accountId())).answers.some((a) => a.question === PHONE_Q))
  }
)

test('M5: research is held to its limit per account, with a plain sentence', opts, async () => {
  const s = phoneServer()
  const limit = SPEND_LIMITS.research.perHour
  for (let n = 0; n < limit; n++) {
    s.next = gatheredBrief()
    const started = await s.call('POST', '/research', { links: [SITE] })
    assert.equal(started.status, 200, `research ${n + 1}: ${JSON.stringify(started.body)}`)
    await s.settled()
  }
  const refused = await s.call('POST', '/research', { links: [SITE] })
  assert.equal(refused.status, 429, JSON.stringify(refused.body))
  assert.equal(refused.body.code, 'TRY_LATER')
  assert.equal(refused.body.say, TRY_LATER_SAY)
})

test('M5: compose and the brand step are held to their limits per account', opts, async () => {
  await researchedR1()
  let brandRuns = 0
  const s = server({
    gather: async () => gatheredBrief(),
    // No model: every compose stops at once, so each press is one more start.
    buildModel: async () => {
      throw Object.assign(new Error('no model'), { code: 'model_missing', noRerun: true })
    },
    buildChatOn: async () => true,
    brandStep: async () => (brandRuns++, null)
  })
  for (let n = 0; n < SPEND_LIMITS.compose.perHour; n++) {
    const started = await s.call('POST', '/compose', {})
    assert.equal(started.status, 200, `compose ${n + 1}: ${JSON.stringify(started.body)}`)
    await s.settled()
  }
  const refused = await s.call('POST', '/compose', {})
  assert.equal(refused.status, 429, JSON.stringify(refused.body))
  assert.equal(refused.body.say, TRY_LATER_SAY)
  // The brand step: the record goes, and each compose would start the brand step again.
  const id = await s.accountId()
  for (let n = 0; n < SPEND_LIMITS.brand.perHour; n++) {
    await changeDraft(db.pool, id, () => ({ brand: null, engine: null }))
    await s.app.buildDraftEngine.brandIfDue(id)
    await s.settled()
  }
  await changeDraft(db.pool, id, () => ({ brand: null, engine: null }))
  assert.equal(await s.app.buildDraftEngine.brandIfDue(id), null, 'no brand step past its limit')
  assert.equal(brandRuns, SPEND_LIMITS.brand.perHour)
})

test('M5: a restart past the compose limit keeps the living plan', opts, async () => {
  const { accountId } = await researchedR1({ plan: true })
  const s = server({ ...researchR2(null) })
  const at = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  await db.pool.query('insert into rate_bucket (bucket, window_start, count) values ($1, $2, $3)', [
    `build-chat:compose:${accountId}`,
    at,
    SPEND_LIMITS.compose.perHour
  ])
  const refused = await s.call('POST', '/compose', { restart: true })
  assert.equal(refused.status, 429, JSON.stringify(refused.body))
  assert.ok((await row(accountId)).plan, 'the plan was not discarded')
})

test('M4: an answer to the same question asked the same way is kept', () => {
  const question = club.clubProfile().questions[0]
  const answer = { schema: 'tracy-build-answer/v1', question: question.id, choice: 'value-1' }
  assert.deepEqual(
    answersStillAsked({ questions: [question], answers: [answer] }, [structuredClone(question)]),
    {
      questions: [question],
      answers: [answer]
    }
  )
})

test('M5: each research is recorded in the research cost ledger, for the build chat', opts, async () => {
  const s = phoneServer()
  s.next = gatheredBrief()
  await s.call('POST', '/research', { links: [SITE] })
  await s.settled()
  const { rows } = await db.pool.query(
    `select provider, operation, purpose, payer, payer_account_id from wo_cost_ledger`
  )
  assert.deepEqual(rows, [
    {
      provider: 'tracy-build-chat',
      operation: 'research',
      purpose: 'build-chat',
      payer: 'account',
      payer_account_id: await s.accountId()
    }
  ])
})
