// The pre site build draft (#603): answers, the chosen template and the living plan of a site that does not exist yet,
// tied to the account. Driven through the app's own doors, as the chat will call them; the build engine's read
// (`draftPlanForBuild`) is checked against the plan card's read (`GET /api/build-draft`). Invented data only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { draftPlanForBuild } from '../src/build-draft/store.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})
const scenario = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/wo/website-opportunities/test/fixtures/build-contract/sunrise-tennis-club.build-scenario.json',
      import.meta.url
    ),
    'utf8'
  )
)
const { plan } = scenario
const [question] = scenario.questions
const template = plan.look.template
const OWNER = 'owner@sunrise-tennis.test'
const rename = (revision, label, id = `edit-${revision}`) => ({
  schema: 'tracy-build-plan-edit/v1',
  id,
  plan: { id: plan.id, revision },
  changes: [{ field: 'items[s2].label', value: label }]
})
const labelOf = (p) => p.items.find((item) => item.id === 's2').label

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** One request on a NEW app (a reload of the server) with a NEWLY minted session (a new sign in). */
async function call(email, method, path = '', body) {
  const app = buildApp({ config, pool: db.pool, mail: { send: async () => {} } })
  const headers = { 'sec-fetch-site': 'same-origin' }
  if (email) headers.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await app.fetch(
    new Request(`${config.origin}/api/build-draft${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  )
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
}
const accountIdOf = async (email) =>
  (await db.pool.query('select id from account where email = $1', [email])).rows[0].id

test('every door needs a signed-in person', opts, async () => {
  for (const [method, path] of [
    ['GET', ''],
    ['POST', ''],
    ['PUT', '/answers'],
    ['PUT', '/template'],
    ['PUT', '/plan'],
    ['POST', '/plan-edits'],
    ['POST', '/plan-undo']
  ]) {
    const res = await call(null, method, path, method === 'GET' ? undefined : {})
    assert.equal(res.status, 401, `${method} ${path}`)
  }
})

test('a draft is created with no website opportunity and no site, once per account', opts, async () => {
  assert.deepEqual((await call(OWNER, 'GET')).body, { draft: null })
  const made = await call(OWNER, 'POST')
  assert.equal(made.status, 201)
  assert.equal(made.cache, 'no-store')
  assert.deepEqual(
    { ...made.body.draft, id: 'x', createdAt: 'x', updatedAt: 'x' },
    {
      id: 'x',
      questions: [],
      answers: [],
      template: null,
      plan: null,
      lastEdit: null,
      canUndo: false,
      createdAt: 'x',
      updatedAt: 'x'
    }
  )
  const again = await call(OWNER, 'POST')
  assert.equal(again.status, 200, 'a second start answers the same draft')
  assert.equal(again.body.draft.id, made.body.draft.id)
  for (const table of ['wo_opportunity', 'wo_revision', 'site', 'site_brief'])
    assert.equal((await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0, table)
})

test(
  'answers, the template and the plan survive a reload and a new sign in, and stay with their account',
  opts,
  async () => {
    await call(OWNER, 'POST')
    const answered = await call(OWNER, 'PUT', '/answers', { question, answer: scenario.answers[0] })
    assert.equal(answered.status, 200)
    const chosen = await call(OWNER, 'PUT', '/template', { template })
    assert.equal(chosen.status, 200)
    assert.deepEqual(chosen.body.draft.template, template)
    const planned = await call(OWNER, 'PUT', '/plan', { plan })
    assert.equal(planned.status, 200)

    const read = (await call(OWNER.toUpperCase(), 'GET')).body.draft
    assert.deepEqual(read.questions, [question])
    assert.deepEqual(read.answers, [scenario.answers[0]])
    assert.deepEqual(read.template, template)
    assert.deepEqual(read.plan, plan)
    assert.deepEqual((await call('someone-else@example.test', 'GET')).body, { draft: null })
  }
)

test(
  'an answer is held to its question, and a second answer to the same question replaces the first',
  opts,
  async () => {
    await call(OWNER, 'POST')
    const wrong = await call(OWNER, 'PUT', '/answers', {
      question,
      answer: { schema: 'tracy-build-answer/v1', question: question.id, choice: 'not-a-choice' }
    })
    assert.equal(wrong.status, 422)
    assert.equal(wrong.body.code, 'INVALID_ANSWER')
    assert.ok(wrong.body.problems.length > 0)
    const text = { schema: 'tracy-build-answer/v1', question: question.id, text: 'Book a trial lesson' }
    await call(OWNER, 'PUT', '/answers', { question, answer: scenario.answers[0] })
    const second = await call(OWNER, 'PUT', '/answers', { question, answer: text })
    assert.deepEqual(second.body.draft.answers, [text])
    assert.equal(second.body.draft.questions.length, 1)
  }
)

test(
  'a door that writes needs a started draft, and a plan must pass the Contract B check',
  opts,
  async () => {
    const none = await call(OWNER, 'PUT', '/plan', { plan })
    assert.equal(none.status, 404)
    assert.equal(none.body.code, 'NO_DRAFT')
    await call(OWNER, 'POST')
    const bad = await call(OWNER, 'PUT', '/plan', { plan: { ...plan, leftOut: undefined } })
    assert.equal(bad.status, 422)
    assert.equal(bad.body.code, 'INVALID_PLAN')
    const badTemplate = await call(OWNER, 'PUT', '/template', { template: { slug: 'x' } })
    assert.equal(badTemplate.status, 400)
  }
)

test(
  'once a plan exists the template is changed by a plan edit, and the draft follows the plan',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await call(OWNER, 'PUT', '/plan', { plan })
    const refused = await call(OWNER, 'PUT', '/template', { template: { ...template, version: '2.0.0' } })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'PLAN_EXISTS')
    const next = { ...template, version: '2.0.0' }
    const edited = await call(OWNER, 'POST', '/plan-edits', {
      edit: {
        schema: 'tracy-build-plan-edit/v1',
        id: 'edit-template',
        plan: { id: plan.id, revision: 1 },
        changes: [{ field: 'look.template', value: next }]
      }
    })
    assert.equal(edited.status, 200)
    assert.deepEqual(edited.body.draft.template, next)
  }
)

test('a plan edit is applied; undo puts the previous value back, one step only', opts, async () => {
  await call(OWNER, 'POST')
  await call(OWNER, 'PUT', '/plan', { plan })
  const edited = await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Junior academy') })
  assert.equal(edited.status, 200)
  assert.equal(labelOf(edited.body.draft.plan), 'Junior academy')
  assert.equal(edited.body.draft.plan.revision, 2)
  assert.deepEqual(edited.body.draft.lastEdit, rename(1, 'Junior academy'))
  assert.equal(edited.body.draft.canUndo, true)

  const second = await call(OWNER, 'POST', '/plan-edits', { edit: rename(2, 'Youth academy') })
  assert.equal(labelOf(second.body.draft.plan), 'Youth academy')

  const undone = await call(OWNER, 'POST', '/plan-undo')
  assert.equal(undone.status, 200)
  assert.equal(
    labelOf(undone.body.draft.plan),
    'Junior academy',
    'undo goes back one step, to the value before'
  )
  assert.equal(undone.body.draft.plan.revision, 4, 'an undo is an edit: the revision keeps rising')
  assert.equal(undone.body.draft.lastEdit.id, 'undo-edit-2')
  assert.equal(undone.body.draft.canUndo, false)

  const twice = await call(OWNER, 'POST', '/plan-undo')
  assert.equal(twice.status, 409)
  assert.equal(twice.body.code, 'NOTHING_TO_UNDO')
  assert.equal(labelOf((await call(OWNER, 'GET')).body.draft.plan), 'Junior academy')
})

test('a stale or invalid plan edit is refused and changes nothing', opts, async () => {
  await call(OWNER, 'POST')
  await call(OWNER, 'PUT', '/plan', { plan })
  await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Junior academy') })
  const stale = await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Late words', 'edit-late') })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.code, 'STALE_EDIT')
  const invalid = await call(OWNER, 'POST', '/plan-edits', {
    edit: {
      schema: 'tracy-build-plan-edit/v1',
      id: 'edit-x',
      plan: { id: plan.id, revision: 2 },
      changes: [{ field: 'items[s2].sources', value: [] }]
    }
  })
  assert.equal(invalid.status, 422)
  assert.equal(invalid.body.code, 'INVALID_EDIT')
  assert.ok(invalid.body.problems.length > 0)
  const after = (await call(OWNER, 'GET')).body.draft
  assert.equal(after.plan.revision, 2)
  assert.equal(labelOf(after.plan), 'Junior academy')
  assert.equal(after.canUndo, true, 'a refused edit keeps the undo of the last applied one')
})

test(
  'a newly composed plan replaces the living plan only with a higher revision, and clears the undo',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await call(OWNER, 'PUT', '/plan', { plan })
    await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Junior academy') })
    const older = await call(OWNER, 'PUT', '/plan', { plan })
    assert.equal(older.status, 409)
    assert.equal(older.body.code, 'STALE_PLAN')
    const recomposed = await call(OWNER, 'PUT', '/plan', { plan: { ...plan, revision: 3 } })
    assert.equal(recomposed.status, 200)
    assert.equal(recomposed.body.draft.canUndo, false)
    assert.equal(recomposed.body.draft.lastEdit, null)
  }
)

test('the plan card and the build engine read the same plan from the draft', opts, async () => {
  await call(OWNER, 'POST')
  assert.equal(
    await draftPlanForBuild(db.pool, await accountIdOf(OWNER)),
    null,
    'no plan yet, nothing to build'
  )
  await call(OWNER, 'PUT', '/plan', { plan })
  for (const step of [
    () => call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Junior academy') }),
    () => call(OWNER, 'POST', '/plan-undo')
  ]) {
    await step()
    const card = (await call(OWNER, 'GET')).body.draft
    const engine = await draftPlanForBuild(db.pool, await accountIdOf(OWNER))
    assert.deepEqual(engine.plan, card.plan)
    assert.equal(engine.draftId, card.id)
    assert.deepEqual(engine.lastEdit, card.lastEdit)
  }
  assert.equal(await draftPlanForBuild(db.pool, '00000000-0000-4000-8000-000000000000'), null)
})

test('deleting the account deletes its draft', opts, async () => {
  await call(OWNER, 'POST')
  await db.pool.query('delete from account where email = $1', [OWNER])
  assert.equal((await db.pool.query('select count(*)::int as n from build_draft')).rows[0].n, 0)
})
