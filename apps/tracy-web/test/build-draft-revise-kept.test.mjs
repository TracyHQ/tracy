// A change asked for in the build chat is kept and can be taken back (#609 over #617): the revise step keeps the
// profile the plan step settled (`draftProfile`, with the owner's typed values), carries the stable codes of its lines
// to the chat, and leaves one step of undo like a card edit. Driven through the app's doors with the real plan step
// (`revisePlan`), needs profile, plan composer, rules gate and draft; only the build model is a script. Every business
// and value here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-revise-kept.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { reviseStep, revisionOf } from '../src/build-draft/engine-revise.js'
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
  /** A written change request, waited on to its end: the engine state it ended with. */
  const request = async (text) => (await run('POST', '/compose', { request: text })).ended.body
  return { call, run, request, accountId }
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
const RENAME_AGAIN = { ...RENAME_TEAM, name: 'The coaches', request: 'call the coaches page The coaches' }

/** The invented club researched, its template chosen and its first plan composed through the doors. */
async function composedClub(model) {
  const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
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
  return { s, accountId: id, plan: composed.ended.body.result.plan }
}

/** The owner's typed opening hours, and how the plan step keeps them (its own opening hours notation). */
const TYPED_HOURS = 'Mon to Sat 06:30 to 21:30'
const SAVED_HOURS = 'Mo-Sa 06:30-21:30'
/**
 * How the owner reads those hours (`plan-hours-display.mjs`, #609): the line the plan step writes says the display
 * form, while the stored value stays the machine form above.
 */
const SHOWN_HOURS = 'Monday to Saturday, 6:30 to 21:30'
const OWNER_SOURCE = 'owner-statement'
const WITH_HOURS = `We open ${TYPED_HOURS}. Please call the coaches page Our team.`

/** The profile with other opening hours saved as the owner's answer: a plan step answer for the unit test. */
function withOtherHours(profile) {
  const next = structuredClone(profile)
  next.facts['contact.hours'] = [
    { value: 'Tu-Su 09:00-17:00', sources: [OWNER_SOURCE], confidence: 'single-source' }
  ]
  return next
}

test('the revise step keeps the plan step profile when it has one, else composes it as before', async () => {
  const shared = {
    template: club.template(),
    brand: club.brand(),
    plan: { id: 'p', revision: 1 },
    profile: club.clubProfile(),
    request: {}
  }
  // A stand in for the plan step only here, to reach the answers it no longer gives (no `draftProfile`).
  const tools = (answer) => ({
    model: async () => '',
    kit: { blockStore: club.blockStore(), pageRecipes: club.pageRecipes(), library: club.library() },
    revisePlan: async () => answer
  })
  const kept = withOtherHours(club.clubProfile())
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
  // More codes than lines, or fewer: which code names which line is unknown, so none is kept.
  const longer = revisionOf({
    changed: ['A line.', 'The Coaches page is now called Our team.'],
    notDone: [],
    codes: { changed: ['owner_value_saved', 'page-renamed', 'page-renamed'], notDone: [] }
  })
  assert.deepEqual(longer.codes, { changed: [null, null], notDone: [] })
  const shorter = revisionOf({
    changed: ['A line.', 'The Coaches page is now called Our team.'],
    notDone: [],
    codes: { changed: ['page-renamed'], notDone: [] }
  })
  assert.deepEqual(shorter.codes, { changed: [null, null], notDone: [] })
})

test(
  'an opening time the owner typed in a change request is in the stored profile and survives the next request',
  opts,
  async () => {
    const model = club.scriptedModel(
      JSON.stringify(club.goodComposition()),
      revisionReply([RENAME_TEAM]),
      revisionReply([RENAME_AGAIN])
    )
    const { s, accountId } = await composedClub(model)

    const ended = await s.request(WITH_HOURS)
    assert.equal(ended.state, 'done', JSON.stringify((await row(accountId)).fault))
    const stored = await row(accountId)
    assert.deepEqual(stored.needs_profile.facts['contact.hours'][0], {
      ...club.clubProfile().facts['contact.hours'][0],
      value: SAVED_HOURS,
      sources: [OWNER_SOURCE]
    })
    // The plan step's own lines and codes reach the chat side by side.
    assert.deepEqual(ended.result.revision.changed, [
      `Your answer is saved: Opening hours, ${SHOWN_HOURS}.`,
      'The Coaches page is now called Our team.'
    ])
    // Beside the codes, their params (#609): the card fills its own sentence from them, never from the English line.
    assert.deepEqual(ended.result.revision.codes, {
      changed: ['owner_value_saved', 'page-renamed'],
      notDone: [],
      changedParams: [
        {
          kind: 'contact.hours',
          label: 'Opening hours',
          value: SAVED_HOURS,
          display: SHOWN_HOURS
        },
        ended.result.revision.codes.changedParams[1]
      ],
      notDoneParams: [],
      notDoneReasons: []
    })
    assert.equal(ended.result.revision.codes.changedParams[1].name, 'Our team')

    // Asked for again with no request, the plan and its profile stay.
    assert.equal((await s.call('POST', '/compose', {})).body.result.unchanged, true)
    assert.equal((await row(accountId)).needs_profile.facts['contact.hours'][0].value, SAVED_HOURS)

    // The next request names no hours: the owner's hours are sent with it and kept.
    const next = await s.request('Please call the coaches page The coaches.')
    assert.equal(next.state, 'done', JSON.stringify((await row(accountId)).fault))
    assert.equal(JSON.parse(model.calls[2].user).request, 'Please call the coaches page The coaches.')
    const kept = await row(accountId)
    assert.equal(kept.plan.pages.find((p) => p.id === 'team').name, 'The coaches')
    assert.deepEqual(
      kept.needs_profile.facts['contact.hours'][0],
      stored.needs_profile.facts['contact.hours'][0]
    )
    assert.deepEqual(next.result.revision.codes, {
      changed: ['page-renamed'],
      notDone: [],
      changedParams: [next.result.revision.codes.changedParams[0]],
      notDoneParams: [],
      notDoneReasons: []
    })
    assert.equal(next.result.revision.codes.changedParams[0].name, 'The coaches')
  }
)

test(
  'a change asked for in the chat can be undone one step: the plan and profile before it come back',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()), revisionReply([RENAME_TEAM]))
    const { s, accountId, plan: composed } = await composedClub(model)
    const before = await row(accountId)
    const ended = await s.request(WITH_HOURS)
    assert.equal(ended.state, 'done', JSON.stringify((await row(accountId)).fault))
    const revised = ended.result.plan
    assert.equal(revised.revision, composed.revision + 1)
    assert.equal((await row(accountId)).needs_profile.facts['contact.hours'][0].value, SAVED_HOURS)

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
    assert.notEqual(
      stored.needs_profile.facts['contact.hours'][0].value,
      SAVED_HOURS,
      'the typed hours went too'
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
      revisionReply([RENAME_AGAIN])
    )
    const { s, accountId, plan } = await composedClub(model)
    await s.request('Please call the coaches page Our team.')

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
    const again = await s.request('Please call the coaches page The coaches.')
    assert.equal(again.state, 'done', JSON.stringify((await row(accountId)).fault))
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
    const { s, accountId } = await composedClub(model)
    await s.request('Please call the coaches page Our team.')
    const held = await row(accountId)
    assert.notEqual(held.undo_plan, null)

    // A running step refuses the undo (the door would first stop a step of another process, so the store is called).
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
