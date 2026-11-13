// The build chat's engine doors (#609, `build-draft/engine-route.js`): research, templates, compose, edit and the
// engine state, driven through the app as the dsh tool `tracy_build` calls them (signed actor and build session). The
// research gatherer, the brand step and the build model are fakes; the needs profile, the plan composer and its rules
// gate, the edit gate and the draft are the real ones. Every business, link and template here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-engine.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import { brandLookOf } from 'website-opportunities/domain/brand-before-site.mjs'
import * as brands from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-brands.mjs'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { changeDraft, createDraft, putComposed } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
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

/** An en or em dash, written by code point. */
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

/** One running server (one process): its doors, called as the owner's build chat, and its engine. */
function server(buildEngine = {}) {
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine
  })
  async function call(method, path, body, { as = OWNER, session } = {}) {
    const headers = {}
    if (as) {
      headers['x-tracy-actor'] = actor(as)
      headers['x-tracy-session'] = session ?? (await buildSessionIdFor(as, config.sessionSecret))
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
  /** Start a step and wait for its end, as the tool's polling does. */
  async function run(method, path, body) {
    const started = await call(method, path, body)
    await app.buildDraftEngine.settled(await accountId())
    return { started, ended: await call('GET', '/engine') }
  }
  return { call, run, accountId, engine: app.buildDraftEngine }
}

const row = async (s) =>
  (await db.pool.query('select * from build_draft where account_id = $1', [await s.accountId()])).rows[0]
/** The invented club's research record, as the research step stores it. */
const clubResearch = () => ({
  links: ['https://brindlewick-tennis.example/'],
  trade: 'fitness',
  profile: club.clubProfile()
})
/**
 * A draft researched as the invented club (its stored needs profile) with the club's template chosen; with `brand`,
 * the brand step's record for that template is stored too.
 */
async function researchedClub(_server, { brand } = {}) {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
  const { accent: _accent, ...template } = club.template()
  await changeDraft(db.pool, id, () => ({
    research: clubResearch(),
    template,
    ...(brand
      ? { brand: { record: brand, template: { slug: template.slug, version: template.version } } }
      : {})
  }))
}
/**
 * Ask for the plan as the tool does: a draft without a look record for its template runs the brand step first, and
 * the plan is asked for again once it is done.
 */
async function askPlan(s, body = {}) {
  const first = await s.run('POST', '/compose', body)
  if (first.ended.body.step !== 'brand' || first.ended.body.state !== 'done') return first
  return s.run('POST', '/compose', body)
}
const research = (gather, model) => ({
  gather,
  buildModel: async () => model,
  buildChatOn: async () => true
})
const ownBrand = async () => club.brand()
/** The invented club's plan, composed through the rules gate with its brand record. */
const composeClub = () =>
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
/** The brand step's look record of an invented business of #616's fixtures. */
const recordOf = ({ brandFile, brief }) => brandLookOf({ brandFile, brief })

test(
  'research from an invented link: running at once, then the profile and its questions',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(needsReading()))
    const gathered = []
    const s = server(research(async (input) => (gathered.push(input), gatheredBrief()), model))
    const { started, ended } = await s.run('POST', '/research', {
      links: ['https://larkfen-racquets.example/']
    })
    assert.deepEqual(started, { status: 200, body: { step: 'research', state: 'running' } })
    assert.deepEqual(gathered, [{ links: ['https://larkfen-racquets.example/'], description: null }])
    assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
    const { profile, questions, ask } = ended.body.result
    assert.equal(profile.business, 'Larkfen Racquet Club')
    assert.ok(questions.length >= 1, 'the needs profile issued questions')
    assert.ok(questions.every((q) => q.schema === 'tracy-build-question/v1'))
    assert.ok(ask.questions.length <= 3 && ask.questions.length >= 1)
    const stored = await row(s)
    assert.deepEqual(stored.needs_profile.questions, questions, 'the needs profile is kept in the draft')
    assert.equal(stored.research.trade, 'fitness')
    for (const table of ['wo_opportunity', 'wo_revision', 'site'])
      assert.equal((await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0, table)

    // An answered question never comes back on the next card.
    const first = questions[0]
    const choice = first.choices[0]?.id
    const answer = choice
      ? { schema: 'tracy-build-answer/v1', question: first.id, choice }
      : { schema: 'tracy-build-answer/v1', question: first.id, text: 'Book a court' }
    const put = await s.call('PUT', '/answers', { question: first, answer })
    assert.equal(put.status, 200, JSON.stringify(put.body))
    const again = await s.call('GET', '/engine')
    assert.ok(!(again.body.result.ask?.questions ?? []).some((q) => q.id === first.id))
  }
)

test(
  'the doors answer only the person in their own build session, with the build chat on',
  opts,
  async () => {
    const s = server(
      research(
        async () => gatheredBrief(),
        async () => '{}'
      )
    )
    const wrong = await s.call('GET', '/engine', undefined, {
      session: 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
    })
    assert.equal(wrong.status, 403)
    assert.equal(wrong.body.code, 'NOT_BUILD_SESSION')
    assert.equal((await s.call('POST', '/research', { links: [] }, { as: null })).status, 401)
    const off = server({
      ...research(
        async () => gatheredBrief(),
        async () => '{}'
      ),
      buildChatOn: async () => false
    })
    assert.equal((await off.call('GET', '/templates')).status, 403)
    assert.equal((await s.call('POST', '/research', { links: ['ftp://larkfen.example/'] })).status, 400)
    assert.deepEqual((await s.call('GET', '/engine')).body, { step: null, state: 'idle' })
  }
)

test(
  'research with no gatherer on the server stops with a sentence, and the team gets the fault',
  opts,
  async () => {
    const s = server({ buildModel: async () => async () => '{}', buildChatOn: async () => true })
    const { ended } = await s.run('POST', '/research', { links: ['https://larkfen-racquets.example/'] })
    assert.equal(ended.body.state, 'stopped')
    assert.doesNotMatch(ended.body.say, DASHES)
    assert.doesNotMatch(ended.body.say, /research_unavailable/)
    assert.equal(ended.body.result, undefined)
    assert.equal((await row(s)).fault.code, 'research_unavailable')
  }
)

test(
  'templates come from the catalogue for the researched trade; none researched is an empty list',
  opts,
  async () => {
    const s = server(
      research(async () => gatheredBrief(), club.scriptedModel(JSON.stringify(needsReading())))
    )
    assert.deepEqual((await s.call('GET', '/templates')).body, { templates: [] })
    await s.run('POST', '/research', { links: ['https://larkfen-racquets.example/'] })
    const offered = (await s.call('GET', '/templates')).body.templates
    assert.deepEqual(
      offered.map((t) => t.slug),
      ['example-court']
    )
  }
)

test(
  'compose without a brand record of the business stops before any model call, never with the template look',
  opts,
  async () => {
    const model = club.scriptedModel()
    // The server's own brand step: the draft research holds no research revision for it.
    const s = server({ buildModel: async () => model, buildChatOn: async () => true })
    await researchedClub(s)
    const { started, ended } = await askPlan(s)
    assert.deepEqual(started.body, { step: 'brand', state: 'running' }, 'compose starts the brand step first')
    assert.equal(ended.body.state, 'stopped')
    assert.equal(ended.body.reason, 'brand-unavailable')
    assert.equal(model.calls.length, 0)
    const stored = await row(s)
    assert.equal(stored.plan, null, 'no plan reaches the draft')
    assert.equal(stored.fault.code, 'brand_input_missing')
    // Something that is not the brand step's look record is no brand: the composer refuses it (#616).
    for (const [brandStep, code] of [
      [async () => ({ website: { colors: [{ hex: '#1F7A4D', role: 'primary' }] } }), 'brand_missing'],
      [async () => null, 'brand_missing'],
      // The brand step kept the template accent for a blue logo: no rule of #616 covers it.
      [async () => recordOf(brands.saltmarshKayaks()), 'brand_accent_unsettled']
    ]) {
      const t = server({ buildModel: async () => model, brandStep, buildChatOn: async () => true })
      // A brand step that stopped for this template answers again as stopped: the next case starts afresh.
      await changeDraft(db.pool, await t.accountId(), () => ({ engine: null, brand: null }))
      assert.equal((await askPlan(t)).ended.body.reason, 'brand-unavailable', code)
      assert.equal((await row(t)).fault.code, code)
      assert.equal((await row(t)).plan, null)
    }
    assert.equal(model.calls.length, 0)
  }
)

test(
  'a business with no logo follows the rule of #616: the template accent, said to the owner',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
    const s = server({
      buildModel: async () => model,
      brandStep: async () => recordOf(brands.quaysidePianoCare()),
      buildChatOn: async () => true
    })
    await researchedClub(s)
    const { ended } = await askPlan(s)
    assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
    const { plan } = ended.body.result
    assert.equal(plan.look.logo.kind, 'text', 'the temporary logo is a text logo on the plan')
    assert.ok(plan.assumptions.some((a) => a.field === 'look.logo' && /temporary/.test(a.said)))
  }
)

test('compose with the own brand puts a gated plan with the business colour in the draft', opts, async () => {
  const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
  const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
  await researchedClub(s)
  const { ended } = await askPlan(s)
  assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
  assert.equal(ended.body.result.brand, 'own')
  const { plan } = ended.body.result
  assert.equal(plan.look.accent, '#1f7a4d', 'the business colour, not the template accent #225588')
  assert.deepEqual((await row(s)).plan, plan)
  assert.equal(model.calls.length, 1)
  // Where the accent and the logo came from, as the composer answered them, kept and answered untouched.
  assert.equal(typeof ended.body.result.lookSources?.accent?.from, 'string')
  assert.deepEqual((await row(s)).brand.lookSources, ended.body.result.lookSources)
})

test(
  'choosing a template after research runs the brand step early and keeps its record; compose only reads it',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
    const seen = []
    const brandStep = async (input) => (seen.push(input), club.brand())
    const s = server({ buildModel: async () => model, brandStep, buildChatOn: async () => true })
    const { id } = await ensureAccount(db.pool, OWNER)
    await createDraft(db.pool, id)
    await changeDraft(db.pool, id, () => ({ research: clubResearch() }))
    const { accent: _accent, ...template } = club.template()
    const chosen = await s.call('PUT', '/template', { template })
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body))
    await s.engine.settled(id)
    const read = await s.call('GET', '/engine')
    assert.deepEqual(read.body, { step: 'brand', state: 'done', result: { look: 'ready' } })
    assert.deepEqual((await row(s)).brand.record, club.brand())
    assert.equal(model.calls.length, 0, 'the brand step spends none of the build model')
    // Compose reads the stored record: one run, no brand step again.
    const { ended } = await s.run('POST', '/compose', {})
    assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
    assert.equal(seen.length, 1)
    // No record (new research writes none): the next compose runs the brand step again.
    await changeDraft(db.pool, id, () => ({ brand: null }))
    assert.equal((await s.run('POST', '/compose', {})).ended.body.step, 'brand')
    assert.equal(seen.length, 2)
  }
)

test(
  'a failure is run once more with the same inputs; a second failure stops and is recorded',
  opts,
  async () => {
    const boom = () => {
      throw new Error('the provider hung up')
    }
    const seen = []
    const brandStep = async (input) => (seen.push(input), club.brand())
    const once = club.scriptedModel(boom, JSON.stringify(club.goodComposition()))
    const s = server({ buildModel: async () => once, brandStep, buildChatOn: async () => true })
    await researchedClub(s)
    assert.equal((await askPlan(s)).ended.body.state, 'done')
    assert.equal(seen.length, 1, 'the brand step runs once: it keeps its own attempts')
    assert.equal(once.calls.length, 2)
    assert.deepEqual(once.calls[0], once.calls[1], 'the rerun read exactly the inputs of the first run')

    const twice = club.scriptedModel(boom, boom)
    const t = server({ buildModel: async () => twice, brandStep: ownBrand, buildChatOn: async () => true })
    const { ended } = await askPlan(t)
    assert.equal(ended.body.state, 'stopped')
    assert.equal(ended.body.reason, undefined)
    assert.deepEqual([(await row(t)).fault.code, (await row(t)).fault.attempts], ['step_failed', 2])
  }
)

test('a failure that says noRerun is never run again; a missing model stops at once', opts, async () => {
  const unreadable = club.scriptedModel('not json', 'still not json')
  const s = server({ buildModel: async () => unreadable, brandStep: ownBrand, buildChatOn: async () => true })
  await researchedClub(s)
  const { ended } = await askPlan(s)
  assert.equal(ended.body.state, 'stopped')
  assert.equal(unreadable.calls.length, 2, 'the composer own two attempts, no third')
  assert.deepEqual([(await row(s)).fault.code, (await row(s)).fault.attempts], ['plan_gate_failed', 1])

  const missing = server({
    buildModel: async () => {
      throw Object.assign(new Error('no model'), { code: 'model_missing', noRerun: true })
    },
    brandStep: ownBrand,
    buildChatOn: async () => true
  })
  const stopped = (await askPlan(missing)).ended.body
  assert.equal(stopped.state, 'stopped')
  assert.equal(stopped.ask, undefined, 'a system fault is never a question')
  assert.equal((await row(missing)).fault.code, 'model_missing')
})

test(
  'an edit applies to the current revision; a refused edit is 422 with owner sentences',
  opts,
  async () => {
    const s = server({
      buildModel: async () => club.scriptedModel(JSON.stringify(club.goodComposition())),
      brandStep: ownBrand,
      buildChatOn: async () => true
    })
    await researchedClub(s)
    const composed = (await askPlan(s)).ended.body.result.plan
    const item = composed.items[0].id
    const edited = await s.call('POST', '/edit', {
      changes: [{ field: `items[${item}].label`, value: 'Courts and coaching' }]
    })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    assert.equal(edited.body.step, 'edit')
    assert.equal(edited.body.result.plan.revision, composed.revision + 1)
    assert.equal(edited.body.result.plan.items[0].label, 'Courts and coaching')
    const refused = await s.call('POST', '/edit', { changes: [{ field: 'look.accent', value: 'red' }] })
    assert.equal(refused.status, 422)
    assert.ok(refused.body.problems.length > 0 && refused.body.problems.every((p) => typeof p === 'string'))
    assert.equal((await s.call('POST', '/edit', { changes: [] })).status, 400)
  }
)

test('a step left running by a process that ended reads as stopped, with a fault', opts, async () => {
  let release
  const hanging = new Promise((resolve) => (release = resolve))
  const s = server({
    buildModel: async () => (await hanging, async () => '{}'),
    brandStep: ownBrand,
    buildChatOn: async () => true
  })
  await researchedClub(s, { brand: club.brand() })
  assert.equal((await s.call('POST', '/compose', {})).body.state, 'running')
  assert.equal((await s.call('GET', '/engine')).body.state, 'running', 'the same process still runs it')
  const restarted = server({ buildChatOn: async () => true })
  const read = await restarted.call('GET', '/engine')
  assert.equal(read.body.state, 'stopped')
  assert.equal((await row(s)).fault.code, 'step_interrupted')
  release()
  await s.engine.settled(await s.accountId())
  assert.equal((await restarted.call('GET', '/engine')).body.state, 'stopped', 'the old run changes nothing')
})

test('the composed plan and the done state of its step are one write', opts, async () => {
  const s = server({ buildChatOn: async () => true })
  await researchedClub(s)
  const id = await s.accountId()
  const composed = await composeClub()
  await changeDraft(db.pool, id, () => ({ engine: { step: 'compose', state: 'running', runner: 'gone' } }))
  assert.equal((await putComposed(db.pool, id, composed, { runner: 'other' })).error, 'NOT_RUNNING')
  assert.equal((await row(s)).plan, null, 'a step no longer this runner writes no plan')
  assert.equal((await putComposed(db.pool, id, composed, { runner: 'gone' })).error, undefined)
  // The process that wrote it is gone: the next read is done, not stopped.
  const read = await s.call('GET', '/engine')
  assert.equal(read.body.state, 'done')
  assert.equal(read.body.result.plan.id, composed.plan.id)
})
