// The build findings of the server review (#610, #612): a build whose site was never made, a build left creating, the
// create door's one site per draft, a revision that could not start, and a done run whose record has problems. Driven
// through the app's doors; the create door, the run record and the revision runner are fakes, the draft, the build and
// the build store are the real ones. Everything here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-build-review.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { readBuild } from '../src/build-draft/build-store.js'
import { UNAVAILABLE_SAY } from '../src/build-draft/rebuild-say.js'
import { siteBuildStore } from '../src/build-draft/site-builds.js'
import { createDraft, putComposed } from '../src/build-draft/store.js'
import { draftBuildApproved } from '../src/lib/draft-build.js'
import { ensureAccount } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import { OWNER, actor, config, kits } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const SITE_KEY = 'larkfen.localhost'
const ALL = ['doors', 'kit', 'brand', 'plan', 'copy', 'pictures', 'icons', 'order', 'write']
const doneRow = () => ({
  brief: {
    state: 'applied',
    timings: {
      chain: { ending: 'complete', steps: ALL.map((step) => ({ step, attempt: 1, outcome: 'done' })) }
    }
  },
  job: null
})

function server({ startSite, startRun, clock } = {}) {
  const runs = new Map()
  const asked = []
  const store = siteBuildStore(db.pool)
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    ...(clock ? { now: () => clock.at } : {}),
    buildEngine: {
      buildChatOn: async () => true,
      startSite: async (input) => (
        asked.push(input),
        startSite
          ? startSite(input, asked.length)
          : { site: { siteKey: SITE_KEY, label: 'larkfen', jobId: 'job-1' } }
      ),
      readRun: async (siteKey) => runs.get(siteKey) ?? { brief: null, job: null },
      prunePictures: async () => 0,
      builds: store,
      ...(startRun ? { startRun } : {})
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
  return { call, runs, asked, store }
}
const pin = (plan) => ({ id: plan.id, revision: plan.revision })

/** A draft holding the invented club's composed plan, the club template chosen. */
async function plannedDraft() {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
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
  await putComposed(db.pool, id, composed, { research: { trade: 'fitness', profile: club.clubProfile() } })
  return { accountId: id, plan: composed.plan }
}
async function edited(s) {
  const edit = await s.call('POST', '/edit', { changes: [{ field: 'look.accent', value: '#1F4E9C' }] })
  assert.equal(edit.status, 200, JSON.stringify(edit.body))
  return edit.body.result.plan
}

test('m1: a build the create door refused is replaced by the approval of a newer plan', opts, async () => {
  const s = server({
    startSite: (_input, n) =>
      n === 1
        ? { refusal: { code: 'SITE_SOURCE_MISSING', status: 409 } }
        : { site: { siteKey: SITE_KEY, label: 'larkfen', jobId: 'job-2' } }
  })
  const { accountId, plan } = await plannedDraft()
  await s.call('POST', '/build', { plan: pin(plan) })
  const refused = (await s.call('GET', '/build')).body
  assert.equal(refused.build.state, 'stopped')
  // A design with no site to build from: said as its own code, with no run and so no failed step.
  assert.equal(refused.build.notStarted, 'design-not-buildable')
  assert.equal(refused.run, null)
  assert.equal((await readBuild(db.pool, accountId)).refusal.code, 'SITE_SOURCE_MISSING', 'kept for the team')
  const before = await readBuild(db.pool, accountId)
  const next = await edited(s)
  const again = await s.call('POST', '/build', { plan: pin(next) })
  assert.ok(again.status < 300, JSON.stringify(again.body))
  const build = await readBuild(db.pool, accountId)
  assert.equal(build.id, before.id, 'one build id per draft: still one site at most')
  assert.deepEqual(build.plan, pin(next))
  assert.equal(build.snapshot.plan.revision, next.revision)
  assert.equal(build.site.siteKey, SITE_KEY)
  assert.equal(s.asked.length, 2)
})

test('m1: a build with its site is still never replaced by another plan', opts, async () => {
  const s = server()
  const { plan } = await plannedDraft()
  await s.call('POST', '/build', { plan: pin(plan) })
  s.runs.set(SITE_KEY, doneRow())
  await s.call('GET', '/build')
  const next = await edited(s)
  const again = await s.call('POST', '/build', { plan: pin(next) })
  assert.equal(again.body.code, 'BUILT_FROM_OTHER_PLAN')
})

test('m2: a build left creating asks the create door again once it waited long enough', opts, async () => {
  const clock = { at: Date.now() }
  const s = server({
    clock,
    startSite: (_input, n) =>
      n === 1 ? { pending: true } : { site: { siteKey: SITE_KEY, label: 'larkfen', jobId: 'job-1' } }
  })
  const { plan } = await plannedDraft()
  await s.call('POST', '/build', { plan: pin(plan) })
  assert.equal((await s.call('GET', '/build')).body.build.state, 'creating')
  assert.equal(s.asked.length, 1, 'not again at once')
  clock.at += 60_000
  const read = await s.call('GET', '/build')
  assert.equal(s.asked.length, 2)
  assert.equal(read.body.build.state, 'building')
  assert.equal(read.body.build.siteKey, SITE_KEY)
})

test('m3: the create door takes a draft build only under the build own id', opts, async () => {
  const s = server()
  const { accountId, plan } = await plannedDraft()
  await s.call('POST', '/build', { plan: pin(plan) })
  const build = await readBuild(db.pool, accountId)
  const draftId = (await db.pool.query('select id from build_draft where account_id = $1', [accountId]))
    .rows[0].id
  assert.equal(
    await draftBuildApproved(db.pool, { draftId, accountId, plan: pin(plan), buildId: build.id }),
    true
  )
  assert.equal(
    await draftBuildApproved(db.pool, {
      draftId,
      accountId,
      plan: pin(plan),
      buildId: '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d'
    }),
    false,
    'a fresh build id would make a second site from the same draft'
  )
})

test(
  'm4: a revision that cannot start leaves the build as it was, and presses do not grow it',
  opts,
  async () => {
    const s = server({ startRun: async () => ({ refusal: { code: 'REVISION_START_FAILED', status: 502 } }) })
    const { accountId, plan } = await plannedDraft()
    await s.call('POST', '/build', { plan: pin(plan) })
    s.runs.set(SITE_KEY, doneRow())
    assert.equal((await s.call('GET', '/build')).body.build.state, 'done')
    await s.store.keep({ ref: 'run-first', previous: null, plan }, { siteKey: SITE_KEY }, { expected: null })
    const before = await readBuild(db.pool, accountId)
    let next = plan
    for (let n = 0; n < 3; n++) {
      next = await edited(s)
      const revised = await s.call('POST', '/build/revise', { plan: pin(next) })
      assert.equal(revised.body.say, UNAVAILABLE_SAY)
      assert.equal(revised.body.build.state, 'done', 'the site still shows its build')
    }
    const after = await readBuild(db.pool, accountId)
    assert.deepEqual(after.plan, before.plan)
    assert.deepEqual(after.snapshot, before.snapshot)
    assert.equal(after.result, 'done')
    assert.equal((after.history ?? []).length, 0)
    assert.equal(
      (await db.pool.query('select plan from build_draft where account_id = $1', [accountId])).rows[0].plan
        .revision,
      next.revision,
      'the owner keeps the change'
    )
  }
)

test('m5: a done run whose record has problems still ends done', opts, async () => {
  const s = server()
  const { accountId, plan } = await plannedDraft()
  await s.call('POST', '/build', { plan: pin(plan) })
  const row = doneRow()
  row.brief.timings.chain.steps[0] = { step: 'doors', attempt: 7, outcome: 'done' }
  s.runs.set(SITE_KEY, row)
  await s.call('GET', '/build')
  assert.equal((await readBuild(db.pool, accountId)).result, 'done')
})
