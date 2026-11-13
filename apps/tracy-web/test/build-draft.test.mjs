// The pre site build draft (#603, #609): answers, the chosen template and the living plan of a site that does not exist
// yet, tied to the account. Driven through the app's own doors, as the chat will call them; the build engine's read
// (`draftPlanForBuild`) is checked against the plan card's read (`GET /api/build-draft`). The plan is written only by
// the engine: `putComposed` with a plan the plan composer returned (the WO package's invented club, composed through
// its rules gate), and edits held to the edit gate with the invented template's kit. Invented data only.
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { composePlan, siteNameQuestionOf } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { aiQuickstartCatalogue } from '../src/build-draft/ai-quickstarts.js'
import { draftPlanForBuild, putComposed, readEngineDraft, recordFault } from '../src/build-draft/store.js'
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
const WO_FIXTURES = fileURLToPath(
  new URL('../../../packages/wo/website-opportunities/test/fixtures/', import.meta.url)
)
const scenario = JSON.parse(
  readFileSync(path.join(WO_FIXTURES, 'build-contract/sunrise-tennis-club.build-scenario.json'), 'utf8')
)
const [question] = scenario.questions

// The invented template's kit, as the catalogue reads it: its block store and recipes, mapping still pending.
const kitRoot = mkdtempSync(path.join(tmpdir(), 'tracy-draft-kits-'))
const kitDir = path.join(kitRoot, club.template().slug, 'j6', club.template().version)
mkdirSync(kitDir, { recursive: true })
for (const file of ['block-store.json', 'page-recipes.json'])
  cpSync(path.join(WO_FIXTURES, 'plan-composer', file), path.join(kitDir, file))
writeFileSync(path.join(kitDir, 'mapping.pending.json'), JSON.stringify({ ticket: '#1' }))
const catalogue = aiQuickstartCatalogue({ root: kitRoot, library: club.library() })
// The pending mapping keeps the real offer rule from listing this kit (its own test: build-draft-kits.test.mjs), so the
// offer list is a stand-in: the invented club template for the trade 'fitness' only.
const OFFERED_TRADE = 'fitness'
const aiQuickstarts = {
  loadKit: catalogue.loadKit,
  skipped: catalogue.skipped,
  templatesFor: (trade) => (trade === OFFERED_TRADE ? [{ ...club.template() }] : [])
}

/** A plan the composer returns for the invented club, through its rules gate. */
const compose = () =>
  composePlan({
    blockStore: club.blockStore(),
    pageRecipes: club.pageRecipes(),
    library: club.library(),
    template: club.template(),
    brand: club.brand(),
    profile: club.clubProfile(),
    planId: 'plan-club',
    model: club.scriptedModel(JSON.stringify(club.goodComposition()))
  })
/** @type {{plan: any, profile: any}} */
let composed
let plan
let template
const research = { schema: 'invented-research/v1', sources: ['site'] }
const OWNER = 'owner@brindlewick-tennis.test'
const ITEM = () => plan.items[0].id
const rename = (revision, label, id = `edit-${revision}`) => ({
  schema: 'tracy-build-plan-edit/v1',
  id,
  plan: { id: plan.id, revision },
  changes: [{ field: `items[${ITEM()}].label`, value: label }]
})
const labelOf = (p) => p.items.find((item) => item.id === ITEM()).label
const servicesOf = (p) => p.pages[0].blocks.find((b) => b.type === 'services')
const dataEdit = (revision, data, id = 'edit-data') => ({
  schema: 'tracy-build-plan-edit/v1',
  id,
  plan: { id: plan.id, revision },
  changes: [{ field: `pages[home].blocks[${servicesOf(plan).id}].data`, value: data }]
})

const db = fileDb()
before(async () => {
  composed = await compose()
  plan = composed.plan
  template = plan.look.template
})
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(kitRoot, { recursive: true, force: true }))

/** One request on a NEW app (a reload of the server) with a NEWLY minted session (a new sign in). */
async function call(email, method, path = '', body) {
  const app = buildApp({ config, pool: db.pool, mail: { send: async () => {} }, aiQuickstarts })
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
  const text = await res.text()
  const answer = (() => {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  })()
  return { status: res.status, body: answer, cache: res.headers.get('cache-control') }
}
const accountIdOf = async (email) =>
  (await db.pool.query('select id from account where email = $1', [email])).rows[0].id
/** The engine puts the composed plan in the owner's draft (no door does). */
const putPlan = async (p = plan, extra) =>
  putComposed(db.pool, await accountIdOf(OWNER), { plan: p, profile: composed.profile }, extra)

test('every door needs a signed-in person', opts, async () => {
  for (const [method, path] of [
    ['GET', ''],
    ['POST', ''],
    ['PUT', '/answers'],
    ['PUT', '/template'],
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
    await db.pool.query(`update build_draft set research = $1::jsonb`, [
      JSON.stringify({ trade: OFFERED_TRADE })
    ])
    const chosen = await call(OWNER, 'PUT', '/template', { template })
    assert.equal(chosen.status, 200)
    assert.deepEqual(chosen.body.draft.template, template)
    const planned = await putPlan(plan, { research })
    assert.equal(planned.error, undefined)

    const read = (await call(OWNER.toUpperCase(), 'GET')).body.draft
    assert.deepEqual(read.questions, [question])
    assert.deepEqual(read.answers, [scenario.answers[0]])
    assert.deepEqual(read.template, template)
    assert.deepEqual(read.plan, plan)
    const engine = await readEngineDraft(db.pool, await accountIdOf(OWNER))
    assert.deepEqual(engine.needsProfile, composed.profile)
    assert.deepEqual(engine.research, research)
    assert.equal(engine.fault, null)
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
  'a site name answer is typed text with no choice; a choice or a name past the limit is refused',
  opts,
  async () => {
    await call(OWNER, 'POST')
    const siteName = siteNameQuestionOf(new Map([['business.name', 20]]))
    assert.deepEqual(siteName.choices, [])
    const answer = (extra) => ({ schema: 'tracy-build-answer/v1', question: 'site-name', ...extra })
    const typed = answer({ text: 'Riverside Courts' })
    const stored = await call(OWNER, 'PUT', '/answers', { question: siteName, answer: typed })
    assert.equal(stored.status, 200, JSON.stringify(stored.body))
    assert.deepEqual(stored.body.draft.answers, [typed])
    for (const wrong of [
      answer({ choice: 'riverside' }),
      answer({ text: 'Riverside Courts and Racquets' })
    ]) {
      const refused = await call(OWNER, 'PUT', '/answers', { question: siteName, answer: wrong })
      assert.equal(refused.status, 422, JSON.stringify(wrong))
      assert.equal(refused.body.code, 'INVALID_ANSWER')
    }
    // A site name question that offers a choice could show the held name: it is refused.
    const offering = { ...siteName, choices: [{ id: 'held', label: 'Some held name' }] }
    assert.equal((await call(OWNER, 'PUT', '/answers', { question: offering, answer: typed })).status, 422)
    assert.deepEqual((await call(OWNER, 'GET')).body.draft.answers, [typed])
  }
)

test('a browser cannot put a plan: there is no such door', opts, async () => {
  await call(OWNER, 'POST')
  const put = await call(OWNER, 'PUT', '/plan', { plan })
  assert.equal(put.status, 404)
  assert.equal((await call(OWNER, 'GET')).body.draft.plan, null)
})

test(
  'the engine needs a started draft, and puts only a plan that passes Contract B with its profile',
  opts,
  async () => {
    await db.pool.query('insert into account (email) values ($1)', [OWNER])
    assert.equal((await putPlan()).error, 'NO_DRAFT')
    await call(OWNER, 'POST')
    const bad = await putPlan({ ...plan, leftOut: undefined })
    assert.equal(bad.error, 'INVALID_PLAN')
    const noProfile = await putComposed(db.pool, await accountIdOf(OWNER), { plan })
    assert.equal(noProfile.error, 'INVALID_PLAN')
    const badTemplate = await call(OWNER, 'PUT', '/template', { template: { slug: 'x' } })
    assert.equal(badTemplate.status, 400)
    assert.equal((await call(OWNER, 'GET')).body.draft.plan, null)
  }
)

test(
  'a template the catalogue does not offer for the researched trade is refused and not stored',
  opts,
  async () => {
    await call(OWNER, 'POST')
    const body = (t) => ({ template: t })
    const noTrade = await call(OWNER, 'PUT', '/template', body(template))
    assert.equal(noTrade.status, 422, 'no researched trade offers nothing')
    assert.equal(noTrade.body.code, 'TEMPLATE_NOT_OFFERED')
    assert.match(noTrade.body.next, /not offered/)
    await db.pool.query(`update build_draft set research = $1::jsonb`, [
      JSON.stringify({ trade: OFFERED_TRADE })
    ])
    for (const sent of [
      { ...template, slug: 'invented-other-template' },
      { ...template, version: '9.9.9' }
    ]) {
      const refused = await call(OWNER, 'PUT', '/template', body(sent))
      assert.equal(refused.status, 422)
      assert.equal(refused.body.code, 'TEMPLATE_NOT_OFFERED')
    }
    await db.pool.query(`update build_draft set research = $1::jsonb`, [
      JSON.stringify({ trade: 'other-trade' })
    ])
    assert.equal((await call(OWNER, 'PUT', '/template', body(template))).status, 422)
    assert.equal((await call(OWNER, 'GET')).body.draft.template, null)
  }
)

test('an edit before any composed plan is refused', opts, async () => {
  await call(OWNER, 'POST')
  const res = await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Kids tennis') })
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'NO_PLAN')
})

test('once a plan exists the template cannot be chosen again through the template door', opts, async () => {
  await call(OWNER, 'POST')
  await putPlan()
  const refused = await call(OWNER, 'PUT', '/template', { template: { ...template, version: '2.0.0' } })
  assert.equal(refused.status, 409)
  assert.equal(refused.body.code, 'PLAN_EXISTS')
})

test('a gated plan edit is applied; undo puts the previous value back, one step only', opts, async () => {
  await call(OWNER, 'POST')
  await putPlan()
  const edited = await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Kids tennis') })
  assert.equal(edited.status, 200)
  assert.equal(labelOf(edited.body.draft.plan), 'Kids tennis')
  assert.equal(edited.body.draft.plan.revision, 2)
  assert.deepEqual(edited.body.draft.lastEdit, rename(1, 'Kids tennis'))
  assert.equal(edited.body.draft.canUndo, true)

  const second = await call(OWNER, 'POST', '/plan-edits', { edit: rename(2, 'Junior squad') })
  assert.equal(labelOf(second.body.draft.plan), 'Junior squad')

  const undone = await call(OWNER, 'POST', '/plan-undo')
  assert.equal(undone.status, 200)
  assert.equal(labelOf(undone.body.draft.plan), 'Kids tennis', 'undo goes back one step, to the value before')
  assert.equal(undone.body.draft.plan.revision, 4, 'an undo is an edit: the revision keeps rising')
  assert.equal(undone.body.draft.lastEdit.id, 'undo-edit-2')
  assert.equal(undone.body.draft.canUndo, false)

  const twice = await call(OWNER, 'POST', '/plan-undo')
  assert.equal(twice.status, 409)
  assert.equal(twice.body.code, 'NOTHING_TO_UNDO')
  assert.equal(labelOf((await call(OWNER, 'GET')).body.draft.plan), 'Kids tennis')
})

test(
  'an edit that leaves a block too few items is refused in the owner words, and nothing changes',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await putPlan()
    const services = servicesOf(plan)
    const refused = await call(OWNER, 'POST', '/plan-edits', { edit: dataEdit(1, [services.data[0]]) })
    assert.equal(refused.status, 422)
    assert.equal(refused.body.code, 'INVALID_EDIT')
    assert.deepEqual(
      refused.body.problems.map((p) => p.code),
      ['too_few_items']
    )
    assert.match(
      refused.body.problems[0].message,
      /^The .+ section shows at least 2 .+; this change leaves 1\.$/
    )
    const after = (await call(OWNER, 'GET')).body.draft
    assert.deepEqual(after.plan, plan)
    assert.equal(after.canUndo, false)
    assert.deepEqual(
      (await readEngineDraft(db.pool, await accountIdOf(OWNER))).needsProfile,
      composed.profile
    )
  }
)

test('an edit naming an item the business does not have is refused, and nothing changes', opts, async () => {
  await call(OWNER, 'POST')
  await putPlan()
  const services = servicesOf(plan)
  const refused = await call(OWNER, 'POST', '/plan-edits', {
    edit: dataEdit(1, [...services.data.slice(0, 2), 'service-invented-by-a-model'])
  })
  assert.equal(refused.status, 422)
  assert.equal(refused.body.code, 'INVALID_EDIT')
  assert.ok(refused.body.problems.length > 0)
  for (const p of refused.body.problems)
    assert.match(p.message, /^[A-Z].*\.$/, 'a sentence the card can show')
  assert.deepEqual((await call(OWNER, 'GET')).body.draft.plan, plan)
})

test('undo restores the plan and the needs profile exactly', opts, async () => {
  await call(OWNER, 'POST')
  await putPlan()
  const phone = plan.facts.find((f) => f.kind === 'contact.phone')
  const edit = {
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-phone',
    plan: { id: plan.id, revision: 1 },
    changes: [{ field: `facts[${phone.id}].value`, value: '+1 555 0100 000' }]
  }
  const edited = await call(OWNER, 'POST', '/plan-edits', { edit })
  assert.equal(edited.status, 200)
  const changed = (await readEngineDraft(db.pool, await accountIdOf(OWNER))).needsProfile
  assert.notDeepEqual(changed, composed.profile, 'a changed fact is written back to the needs profile')
  assert.equal(changed.facts['contact.phone'][0].value, '+1 555 0100 000')

  const undone = await call(OWNER, 'POST', '/plan-undo')
  assert.equal(undone.status, 200)
  const { revision: _r, ...restored } = undone.body.draft.plan
  const { revision: _o, ...original } = plan
  assert.deepEqual(restored, original)
  assert.deepEqual((await readEngineDraft(db.pool, await accountIdOf(OWNER))).needsProfile, composed.profile)
})

test('a stale or invalid plan edit is refused and changes nothing', opts, async () => {
  await call(OWNER, 'POST')
  await putPlan()
  await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Kids tennis') })
  const stale = await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Late words', 'edit-late') })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.code, 'STALE_EDIT')
  const invalid = await call(OWNER, 'POST', '/plan-edits', {
    edit: {
      schema: 'tracy-build-plan-edit/v1',
      id: 'edit-x',
      plan: { id: plan.id, revision: 2 },
      changes: [{ field: `items[${ITEM()}].sources`, value: [] }]
    }
  })
  assert.equal(invalid.status, 422)
  assert.equal(invalid.body.code, 'INVALID_EDIT')
  assert.ok(invalid.body.problems.length > 0)
  const after = (await call(OWNER, 'GET')).body.draft
  assert.equal(after.plan.revision, 2)
  assert.equal(labelOf(after.plan), 'Kids tennis')
  assert.equal(after.canUndo, true, 'a refused edit keeps the undo of the last applied one')
})

test('an edit of a plan whose template has no kit on this server is refused', opts, async () => {
  await call(OWNER, 'POST')
  const orphan = structuredClone(plan)
  orphan.look.template = { ...orphan.look.template, slug: 'no-kit-here' }
  await putPlan(orphan)
  const res = await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Kids tennis') })
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'NO_KIT')
})

test(
  'a newly composed plan replaces the living plan only with a higher revision, and clears the undo',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await putPlan()
    await call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Kids tennis') })
    const older = await putPlan()
    assert.equal(older.error, 'STALE_PLAN')
    const recomposed = await putPlan({ ...plan, revision: 3 })
    assert.equal(recomposed.draft.canUndo, false)
    assert.equal(recomposed.draft.lastEdit, null)
    assert.equal((await call(OWNER, 'GET')).body.draft.canUndo, false)
  }
)

test('a system fault is kept for the team and never answered by a door', opts, async () => {
  await call(OWNER, 'POST')
  await recordFault(db.pool, await accountIdOf(OWNER), { step: 'plan', code: 'plan_gate_failed' })
  const engine = await readEngineDraft(db.pool, await accountIdOf(OWNER))
  assert.equal(engine.fault.code, 'plan_gate_failed')
  const card = await call(OWNER, 'GET')
  assert.equal(JSON.stringify(card.body).includes('plan_gate_failed'), false)
})

test('the plan card and the build engine read the same plan from the draft', opts, async () => {
  await call(OWNER, 'POST')
  assert.equal(
    await draftPlanForBuild(db.pool, await accountIdOf(OWNER)),
    null,
    'no plan yet, nothing to build'
  )
  await putPlan()
  for (const step of [
    async () => {},
    () => call(OWNER, 'POST', '/plan-edits', { edit: rename(1, 'Kids tennis') }),
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
