// A change asked for in the build chat is kept and can be taken back (#609 over #617): the revise step keeps the
// profile the plan step settled (`draftProfile`, with the owner's typed values), carries the stable codes of its lines
// to the chat, and leaves one step of undo like a card edit. The needs profile, the plan composer, its rules gate and
// the draft are the real ones; the build model is a script, and the plan step that saves an owner's typed value is a
// stand in for the one Part 3 is adding (it wraps the real `revisePlan`). Every business and value here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-revise-kept.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { revisePlan } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { createEngine } from '../src/build-draft/engine.js'
import { reviseStep, revisionOf } from '../src/build-draft/engine-revise.js'
import { readEngineRow } from '../src/build-draft/engine-store.js'
import { changeDraft, createDraft, undoPlanEdit } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import { KIT_ROOT, OWNER, actor, config, kits } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

/** One running server: its doors, called as the owner's build chat. */
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
  async function run(method, path, body) {
    const started = await call(method, path, body)
    await app.buildDraftEngine.settled(await accountId())
    return { started, ended: await call('GET', '/engine') }
  }
  return { call, run, accountId }
}

const row = async (accountId) =>
  (await db.pool.query('select * from build_draft where account_id = $1', [accountId])).rows[0]
const ownBrand = async () => club.brand()
const revisionReply = (changes = [], notDone = []) => JSON.stringify({ changes, notDone })
const RENAME_TEAM = {
  op: 'rename_page',
  page: 'team',
  name: 'Our team',
  request: 'call the coaches page Our team',
  said: 'x'
}

/** The invented club researched, its template chosen and its first plan composed through the doors. */
async function composedClub(s) {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
  const { accent: _accent, ...template } = club.template()
  await changeDraft(db.pool, id, () => ({
    research: {
      links: ['https://brindlewick-tennis.example/'],
      trade: 'fitness',
      profile: club.clubProfile()
    },
    template
  }))
  let composed = await s.run('POST', '/compose', {})
  if (composed.ended.body.step === 'brand') composed = await s.run('POST', '/compose', {})
  assert.equal(composed.ended.body.state, 'done', JSON.stringify(composed.ended.body))
  return { accountId: id, plan: composed.ended.body.result.plan }
}

/** The owner's typed opening hours, as an invented business would write them. */
const TYPED_HOURS = 'Mon to Sat 06:30 to 21:30'
const OWNER_SOURCE = 'owner-statement'

/** The profile with the owner's typed hours saved as the owner's answer, as Part 3's plan step does it. */
function withTypedHours(profile) {
  const next = structuredClone(profile)
  const held = next.facts['contact.hours'] ?? []
  next.facts['contact.hours'] = [
    { ...(held[0] ?? { confidence: 'single-source' }), value: TYPED_HOURS, sources: [OWNER_SOURCE] }
  ]
  if (!next.sources.some((s) => s.id === OWNER_SOURCE))
    next.sources.push({ id: OWNER_SOURCE, origin: 'answer' })
  return next
}

/**
 * The plan step as Part 3 is changing it: the real `revisePlan`, plus the owner's typed hours in `draftProfile` and a
 * code beside each line (`codes`), the way its result will carry them.
 */
async function revisePlanSavingHours(input) {
  const revised = await revisePlan(input)
  return {
    ...revised,
    draftProfile: withTypedHours(input.profile),
    changed: [`Your answer is saved: Opening hours, ${TYPED_HOURS}.`, ...revised.changed],
    codes: {
      changed: ['owner_value_saved', ...revised.changed.map(() => 'page-renamed')],
      notDone: revised.notDone.map(() => null)
    }
  }
}

/** An engine of its own on the same draft, whose plan step is `revise`. */
const engineWith = (model, revise) =>
  createEngine({
    pool: db.pool,
    kits,
    buildModel: async () => model,
    gather: async () => {
      throw new Error('research is not run here')
    },
    brandStep: ownBrand,
    revisePlan: revise
  })

/** Send a written change request through `engine` and wait for its end. */
async function requestThrough(engine, accountId, request) {
  const now = await readEngineRow(db.pool, accountId)
  await engine.compose(accountId, { request }, now, kits.loadKit(now.plan.look.template.slug))
  await engine.settled(accountId)
  return engine.read(accountId)
}

test('the revise step keeps the plan step profile when it has one, else composes it as before', async () => {
  const shared = {
    template: club.template(),
    brand: club.brand(),
    plan: { id: 'p', revision: 1 },
    profile: club.clubProfile(),
    request: {}
  }
  const tools = (answer) => ({
    model: async () => '',
    kit: { blockStore: club.blockStore(), pageRecipes: club.pageRecipes(), library: club.library() },
    revisePlan: async () => answer
  })
  const kept = withTypedHours(club.clubProfile())
  const withIt = await reviseStep(shared, tools({ unchanged: false, plan: {}, draftProfile: kept }))
  assert.deepEqual(withIt.profile, kept, 'the profile the plan step settled is the one the draft keeps')
  const without = await reviseStep(shared, tools({ unchanged: false, plan: {} }))
  assert.equal(
    without.profile.facts['contact.hours'][0].value,
    club.clubProfile().facts['contact.hours'][0].value
  )
  const unchanged = await reviseStep(shared, tools({ unchanged: true, plan: {}, draftProfile: kept }))
  assert.deepEqual(unchanged.profile, shared.profile, 'an unchanged plan keeps the profile it was sent')
})

test('the done state keeps the codes beside the lines; a result without codes keeps none', () => {
  const coded = revisionOf({
    changed: ['A line.', 'The Coaches page is now called Our team.'],
    notDone: [
      { what: 'Rename Kids', reason: 'outside_plan', why: 'The plan cannot take this name.', code: 'x' }
    ],
    codes: { changed: ['owner_value_saved', 'page-renamed'], notDone: ['item_rename_refused'] }
  })
  assert.deepEqual(coded, {
    changed: ['A line.', 'The Coaches page is now called Our team.'],
    notDone: [{ what: 'Rename Kids', reason: 'outside_plan', why: 'The plan cannot take this name.' }],
    codes: { changed: ['owner_value_saved', 'page-renamed'], notDone: ['item_rename_refused'] }
  })
  assert.deepEqual(revisionOf({ changed: ['A line.'], notDone: [] }), { changed: ['A line.'], notDone: [] })
  // A code list that does not run beside the lines is not kept: a code must never name another line.
  const crooked = revisionOf({ changed: ['A line.'], notDone: [], codes: { changed: [], notDone: [] } })
  assert.deepEqual(crooked.codes, { changed: [null], notDone: [] })
  const odd = revisionOf({ changed: ['A line.'], notDone: [], codes: { changed: [7], notDone: 'x' } })
  assert.deepEqual(odd.codes, { changed: [null], notDone: [] })
})

test(
  'an opening time the owner typed in a change request is in the stored profile and survives the next request',
  opts,
  async () => {
    const model = club.scriptedModel(
      JSON.stringify(club.goodComposition()),
      revisionReply([RENAME_TEAM]),
      revisionReply([{ ...RENAME_TEAM, name: 'The coaches', request: 'call the coaches page The coaches' }])
    )
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    const { accountId } = await composedClub(s)
    const engine = engineWith(model, revisePlanSavingHours)

    const ended = await requestThrough(
      engine,
      accountId,
      `We open ${TYPED_HOURS}. Please call the coaches page Our team.`
    )
    assert.equal(ended.state, 'done', JSON.stringify((await row(accountId)).fault))
    const stored = await row(accountId)
    assert.deepEqual(stored.needs_profile.facts['contact.hours'][0], {
      ...club.clubProfile().facts['contact.hours'][0],
      value: TYPED_HOURS,
      sources: [OWNER_SOURCE]
    })
    // The codes reach the chat beside the lines they name.
    assert.deepEqual(ended.result.revision.codes, {
      changed: ['owner_value_saved', 'page-renamed'],
      notDone: []
    })

    // Asked for again with no request, the plan and its profile stay.
    assert.equal((await s.call('POST', '/compose', {})).body.result.unchanged, true)
    assert.equal((await row(accountId)).needs_profile.facts['contact.hours'][0].value, TYPED_HOURS)

    // The next request goes through today's plan step (no `draftProfile`): the typed hours are sent and kept.
    const seen = []
    const today = engineWith(model, async (input) => {
      seen.push(input.profile)
      return revisePlan(input)
    })
    const next = await requestThrough(today, accountId, 'Please call the coaches page The coaches.')
    assert.equal(next.state, 'done', JSON.stringify((await row(accountId)).fault))
    assert.equal(
      seen[0].facts['contact.hours'][0].value,
      TYPED_HOURS,
      'the next request is sent the typed hours'
    )
    const kept = await row(accountId)
    assert.equal(kept.plan.pages.find((p) => p.id === 'team').name, 'The coaches')
    assert.equal(kept.needs_profile.facts['contact.hours'][0].value, TYPED_HOURS)
    assert.deepEqual(kept.needs_profile.facts['contact.hours'][0].sources, [OWNER_SOURCE])
    assert.equal(next.result.revision.codes, undefined, 'a plan step without codes answers none')
  }
)

test(
  'a change asked for in the chat can be undone one step: the plan and profile before it come back',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()), revisionReply([RENAME_TEAM]))
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    const { accountId, plan: composed } = await composedClub(s)
    const before = await row(accountId)
    const engine = engineWith(model, revisePlanSavingHours)
    const ended = await requestThrough(engine, accountId, 'Please call the coaches page Our team.')
    assert.equal(ended.state, 'done', JSON.stringify((await row(accountId)).fault))
    const revised = ended.result.plan
    assert.equal(revised.revision, composed.revision + 1)

    const draft = (await s.call('GET', '')).body.draft
    assert.equal(draft.canUndo, true, 'the change asked for in the chat can be taken back')
    assert.equal(draft.lastEdit, null, 'no card edit was made')

    const undone = await s.call('POST', '/plan-undo')
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    const back = undone.body.draft.plan
    assert.equal(
      back.revision,
      revised.revision + 1,
      'an undo is a new revision: no revision names two plans'
    )
    assert.deepEqual({ ...back, revision: before.plan.revision }, before.plan, 'the plan before the change')
    assert.equal(undone.body.draft.canUndo, false, 'one step only')
    const stored = await row(accountId)
    assert.deepEqual(stored.needs_profile, before.needs_profile, 'the profile before the change, exactly')
    assert.equal(
      stored.needs_profile.facts['contact.hours'][0].value,
      before.needs_profile.facts['contact.hours'][0].value
    )
    // The chat's note of the change is gone with it: the engine answers the plan, not the change request.
    const engineNow = (await s.call('GET', '/engine')).body
    assert.equal(engineNow.step, 'edit')
    assert.equal(engineNow.state, 'done')
    assert.equal(engineNow.result.revision, undefined)
    assert.deepEqual(engineNow.result.plan, back)

    const twice = await s.call('POST', '/plan-undo')
    assert.equal(twice.status, 409)
    assert.equal(twice.body.code, 'NOTHING_TO_UNDO')
  }
)

test(
  'a card edit after a chat change replaces its undo; a chat change after a card edit replaces that one',
  opts,
  async () => {
    const model = club.scriptedModel(
      JSON.stringify(club.goodComposition()),
      revisionReply([RENAME_TEAM]),
      revisionReply([{ ...RENAME_TEAM, name: 'The coaches', request: 'call the coaches page The coaches' }])
    )
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    const { accountId, plan } = await composedClub(s)
    const engine = engineWith(model, revisePlan)
    await requestThrough(engine, accountId, 'Please call the coaches page Our team.')

    // A card edit after the chat change: its undo takes back the card edit only.
    const field = `items[${plan.items[0].id}].label`
    const edited = await s.call('POST', '/edit', { changes: [{ field, value: 'Courts and coaching' }] })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    assert.equal((await row(accountId)).undo_plan, null)
    const undone = await s.call('POST', '/plan-undo')
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    assert.equal(undone.body.draft.plan.pages.find((p) => p.id === 'team').name, 'Our team')
    assert.notEqual(undone.body.draft.plan.items[0].label, 'Courts and coaching')
    assert.equal(undone.body.draft.canUndo, false)

    // A card edit, then a chat change: undo takes back the chat change, and the card edit stays.
    await s.call('POST', '/edit', { changes: [{ field, value: 'Courts and coaching' }] })
    await requestThrough(engine, accountId, 'Please call the coaches page The coaches.')
    const afterChat = await row(accountId)
    assert.equal(afterChat.undo_edit, null)
    const back = await s.call('POST', '/plan-undo')
    assert.equal(back.status, 200, JSON.stringify(back.body))
    assert.equal(back.body.draft.plan.pages.find((p) => p.id === 'team').name, 'Our team')
    assert.equal(back.body.draft.plan.items[0].label, 'Courts and coaching')
  }
)

test(
  'a chat change is not undone while a step runs or while an approved build holds the draft',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()), revisionReply([RENAME_TEAM]))
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    const { accountId } = await composedClub(s)
    await requestThrough(engineWith(model, revisePlan), accountId, 'Please call the coaches page Our team.')
    const held = await row(accountId)

    // A step that runs in this process (another runner's step would be stopped first as one whose process ended).
    const busy = await changeDraft(db.pool, accountId, (r) => ({ engine: { ...r.engine, state: 'running' } }))
    assert.equal(busy.error, undefined)
    assert.equal((await undoPlanEdit(db.pool, accountId, kits)).error, 'ENGINE_BUSY')
    await changeDraft(db.pool, accountId, () => ({ engine: held.engine }))

    await changeDraft(db.pool, accountId, () => ({ build: { approvedAt: new Date().toISOString() } }))
    const locked = await s.call('POST', '/plan-undo')
    assert.equal(locked.body.code, 'BUILD_RUNNING')
    const still = await row(accountId)
    assert.deepEqual([still.plan, still.needs_profile], [held.plan, held.needs_profile])
  }
)
