// The build doors of the build chat (#610, `build-draft/build-route.js`): approving the plan keeps an immutable
// snapshot, asks the create door for ONE site per draft, and reads the run back in Contract B. Driven through the app
// as the dsh tool `tracy_build` calls them. The create door and the run are fakes standing in for `POST /api/sites`
// (idempotent on `buildId`, as `sites/route.js` is) and the step chain's record; the draft, its gates and the plan
// composer are the real ones. Every business, link and template here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-build.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { draftRunReader, draftSiteStarter } from '../src/build-draft-build-wiring.js'
import { endBuild, readBuild } from '../src/build-draft/build-store.js'
import { createDraftPictures } from '../src/build-draft/pictures.js'
import {
  changeDraft,
  createDraft,
  draftPlanForBuild,
  putComposed,
  readEngineDraft
} from '../src/build-draft/store.js'
import { draftBuildApproved, draftBuildName } from '../src/lib/draft-build.js'
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

const RUN_A = '11111111-1111-4111-8111-111111111111'
const RUN_B = '22222222-2222-4222-8222-222222222222'
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)

/** A create door that keeps one site per buildId, as `POST /api/sites` does. */
function fakeCreateDoor({ refuseFirst = false } = {}) {
  const sites = new Map()
  const asks = []
  let refused = false
  return {
    asks,
    sites,
    startSite: async ({ build, draftId }) => {
      asks.push({ buildId: build.id, draftId, plan: build.plan })
      if (refuseFirst && !refused) {
        refused = true
        return { refusal: { code: 'QUICKSTART_UNREACHABLE', status: 503 } }
      }
      if (!sites.has(build.id))
        sites.set(build.id, {
          siteKey: `site-${sites.size + 1}.localhost`,
          label: 'larkfen',
          jobId: `job-${build.id}`
        })
      return { site: sites.get(build.id) }
    }
  }
}

function server({ door = fakeCreateDoor(), runs = new Map(), pruned = [] } = {}) {
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine: {
      buildChatOn: async () => true,
      startSite: door.startSite,
      readRun: async (siteKey) => runs.get(siteKey) ?? { brief: null, job: null },
      prunePictures: async (accountId, keep) => pruned.push({ accountId, keep })
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
  return { app, call, door, runs, pruned }
}

/** A draft holding the invented club's composed plan, its needs profile and a research record of run A. */
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
  const research = {
    links: ['https://larkfen-racquets.example/'],
    trade: 'fitness',
    profile: club.clubProfile(),
    brief: { business: { name: 'Larkfen Racquet Club' } },
    manifest: [{ id: 'pic-1', origin: 'draft', width: 1600, height: 900 }],
    pictureRun: RUN_A
  }
  const put = await putComposed(db.pool, id, composed, { research })
  assert.equal(put.error, undefined)
  return { accountId: id, plan: composed.plan, research }
}
const pinOf = (plan) => ({ id: plan.id, revision: plan.revision })

test(
  'approving creates the site through the create door and freezes the plan, profile and research',
  opts,
  async () => {
    const s = server()
    const { accountId, plan, research } = await plannedDraft()
    const approved = await s.call('POST', '/build', { plan: pinOf(plan) })
    assert.equal(approved.status, 201)
    assert.equal(approved.body.build.state, 'building')
    assert.equal(approved.body.build.siteKey, 'site-1.localhost')
    assert.equal(s.door.asks.length, 1)
    assert.deepEqual(s.door.asks[0].plan, pinOf(plan))
    // The run is Contract B from the first read: every step pending while the host installs the site.
    const event = approved.body.run.events[0]
    assert.equal(event.schema, 'tracy-build-progress/v1')
    assert.equal(event.planId, plan.id)
    assert.ok(event.steps.every((st) => st.state === 'pending'))
    assert.equal(event.steps.at(-1).kind, 'write')
    // The engine reads the snapshot: a research run after approval would not change what it builds.
    await db.pool.query(
      `update build_draft set research = jsonb_set(research, '{pictureRun}', to_jsonb($2::text)) where account_id = $1`,
      [accountId, RUN_B]
    )
    const forBuild = await draftPlanForBuild(db.pool, accountId)
    assert.deepEqual(forBuild.plan, plan)
    assert.equal(forBuild.research.pictureRun, RUN_A)
    assert.deepEqual(forBuild.research.manifest, research.manifest)
    const engine = await readEngineDraft(db.pool, accountId)
    assert.equal(engine.research.pictureRun, RUN_A)
    assert.equal(engine.fault, null)
    assert.ok(engine.needsProfile)
  }
)

test('approving twice, at once or again later, asks for one site under one build id', opts, async () => {
  const s = server()
  const { plan } = await plannedDraft()
  const [a, b] = await Promise.all([
    s.call('POST', '/build', { plan: pinOf(plan) }),
    s.call('POST', '/build', { plan: pinOf(plan) })
  ])
  assert.deepEqual([a.status, b.status].sort(), [200, 201])
  const again = await s.call('POST', '/build', { plan: pinOf(plan) })
  assert.equal(again.status, 200)
  assert.equal(s.door.sites.size, 1, 'one site')
  assert.equal(new Set(s.door.asks.map((x) => x.buildId)).size, 1, 'one build id')
  assert.equal(again.body.build.siteKey, a.body.build.siteKey ?? b.body.build.siteKey)
})

test(
  'a refused create stops plainly; approving again retries the same build and makes its site',
  opts,
  async () => {
    const s = server({ door: fakeCreateDoor({ refuseFirst: true }) })
    const { plan } = await plannedDraft()
    const first = await s.call('POST', '/build', { plan: pinOf(plan) })
    assert.equal(first.body.build.state, 'stopped')
    const outcome = first.body.run.outcome
    assert.equal(outcome.result, 'stopped')
    assert.equal(outcome.stopped.teamNotified, true)
    assert.equal(JSON.stringify(first.body).includes('"ask"'), false, 'a fault is never a question')
    const retry = await s.call('POST', '/build', { plan: pinOf(plan) })
    assert.equal(retry.body.build.state, 'building')
    assert.equal(s.door.sites.size, 1)
    assert.equal(new Set(s.door.asks.map((x) => x.buildId)).size, 1)
  }
)

test('a plan that moved, or another revision once a build exists, is refused', opts, async () => {
  const s = server()
  const { plan } = await plannedDraft()
  const stale = await s.call('POST', '/build', { plan: { id: plan.id, revision: plan.revision + 1 } })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.code, 'STALE_PLAN')
  assert.equal((await s.call('POST', '/build', { plan: 'nope' })).status, 400)
  await s.call('POST', '/build', { plan: pinOf(plan) })
  const other = await s.call('POST', '/build', { plan: { id: plan.id, revision: plan.revision - 1 } })
  assert.equal(other.body.code, 'BUILT_FROM_OTHER_PLAN')
  assert.equal(s.door.sites.size, 1)
})

test('while the build runs, the plan and the research do not move', opts, async () => {
  const s = server()
  const { accountId, plan } = await plannedDraft()
  await s.call('POST', '/build', { plan: pinOf(plan) })
  const edit = await s.call('POST', '/edit', { changes: [{ field: 'look.accent', value: '#1F4E9C' }] })
  assert.equal(edit.status, 409)
  assert.equal(edit.body.code, 'BUILD_RUNNING')
  const research = await s.call('POST', '/research', { links: ['https://larkfen-racquets.example/'] })
  assert.equal(research.body.code, 'BUILD_RUNNING')
  const compose = await s.call('POST', '/compose', { request: 'Add a page about our juniors.' })
  assert.equal(compose.body.code, 'BUILD_RUNNING')
  const stored = (await db.pool.query('select plan from build_draft where account_id = $1', [accountId]))
    .rows[0]
  assert.deepEqual(stored.plan, plan)
})

test(
  'progress and the done outcome reach the chat in Contract B; the ended build lets old pictures go',
  opts,
  async () => {
    const runs = new Map()
    const s = server({ runs })
    const { accountId, plan } = await plannedDraft()
    const approved = await s.call('POST', '/build', { plan: pinOf(plan) })
    const siteKey = approved.body.build.siteKey
    const line = (step) => ({ step, attempt: 1, outcome: 'done' })
    runs.set(siteKey, {
      brief: {
        state: 'preparing',
        timings: {
          chain: { ending: 'running', steps: ['doors', 'kit', 'brand', 'plan'].map(line), running: ['copy'] }
        }
      },
      job: { state: 'running' }
    })
    const going = await s.call('GET', '/build')
    const event = going.body.run.events[0]
    assert.equal(event.steps[0].state, 'done')
    assert.ok(event.steps.filter((st) => st.kind === 'writer').every((st) => st.state === 'running'))
    assert.equal(going.body.build.state, 'building')
    const all = ['doors', 'kit', 'brand', 'plan', 'copy', 'pictures', 'icons', 'order', 'write'].map(line)
    runs.set(siteKey, {
      brief: { state: 'applied', timings: { chain: { ending: 'complete', steps: all } } },
      job: null
    })
    const done = await s.call('GET', '/build')
    assert.equal(done.body.run.outcome.result, 'done')
    assert.equal(done.body.build.state, 'done')
    assert.ok((await readBuild(db.pool, accountId)).endedAt)
    assert.deepEqual(s.pruned, [{ accountId, keep: RUN_A }])
    // Once ended, the owner may shape the draft again (a rebuild is #612's).
    const edit = await s.call('POST', '/edit', { changes: [{ field: 'look.accent', value: '#1F4E9C' }] })
    assert.notEqual(edit.body.code, 'BUILD_RUNNING')
  }
)

test("the approved research run's pictures are kept until the build ends", opts, async () => {
  const s = server()
  const { accountId, plan } = await plannedDraft()
  await s.call('POST', '/build', { plan: pinOf(plan) })
  const insert = (run, sha) =>
    db.pool.query(
      `insert into build_draft_picture (account_id, research_run, kind, source, source_url, sha256, object_key, mime, bytes)
       values ($1, $2, 'image', 'website', 'https://larkfen-racquets.example/p.jpg', $3, $4, 'image/jpeg', 10)`,
      [accountId, run, sha, `build-drafts/${accountId}/${sha}.jpg`]
    )
  await insert(RUN_A, 'a'.repeat(64))
  await insert(RUN_B, 'b'.repeat(64))
  const deleted = []
  const pictures = createDraftPictures({
    pool: db.pool,
    objects: { get: async () => null, delete: async (key) => deleted.push(key) },
    mediaStoreOf: () => ({}),
    withinTime: async (run) => run()
  })
  assert.equal(await pictures.prune(accountId, RUN_B), 0, 'the approved run is kept while the build is open')
  const build = await readBuild(db.pool, accountId)
  await endBuild(db.pool, accountId, build.id, 'done')
  assert.equal(await pictures.prune(accountId, RUN_B), 1)
  assert.equal(deleted.length, 1)
})

test('the create door is asked as the owner, for the approved draft, with the kit site', opts, async () => {
  const { accountId, plan } = await plannedDraft()
  const s = server()
  await s.call('POST', '/build', { plan: pinOf(plan) })
  const build = await readBuild(db.pool, accountId)
  const draftId = (await db.pool.query('select id from build_draft where account_id = $1', [accountId]))
    .rows[0].id
  const asked = []
  const request = async (path, init) => {
    asked.push({ path, init })
    return new Response(
      JSON.stringify({ siteKey: 'larkfen.localhost', jobId: 'job-9', workspacePath: '/site/larkfen' }),
      {
        status: 202
      }
    )
  }
  const withSite = {
    loadKit: (slug) => ({
      ...kits.loadKit(slug),
      site: { platform: 'joomla', design: 'club', quickstart: 'quickstart/club/j6/1.0.0' }
    })
  }
  const start = draftSiteStarter({ pool: db.pool, config, kits: withSite, request })
  const started = await start({ accountId, email: OWNER, draftId, build: { ...build, site: null } })
  assert.equal(started.site.siteKey, 'larkfen.localhost')
  const body = JSON.parse(asked[0].init.body)
  assert.equal(asked[0].path, '/api/sites')
  assert.match(asked[0].init.headers.cookie, /^tracy_sess=/)
  assert.deepEqual(
    {
      workflow: body.workflow,
      draftId: body.draftId,
      plan: body.plan,
      buildId: body.buildId,
      design: body.design,
      quickstart: body.quickstart
    },
    {
      workflow: 'step-chain/1',
      draftId,
      plan: pinOf(plan),
      buildId: build.id,
      design: 'club',
      quickstart: 'quickstart/club/j6/1.0.0'
    }
  )
  assert.equal(body.researchRevisionId, undefined)
  // The label is kept on the build: a retry sends the same one, so the door's idempotency holds.
  const label = (await readBuild(db.pool, accountId)).label
  assert.equal(body.label, label)
  await start({ accountId, email: OWNER, draftId, build: await readBuild(db.pool, accountId) })
  assert.equal(JSON.parse(asked[1].init.body).label, label)
  // A kit naming no site is a fault for the team, never a stand in site.
  const none = draftSiteStarter({ pool: db.pool, config, kits, request })
  assert.deepEqual(await none({ accountId, email: OWNER, draftId, build }), {
    refusal: { code: 'SITE_SOURCE_MISSING', status: 409 }
  })
  // The create door's own check, and the run frame's site name.
  assert.equal(await draftBuildApproved(db.pool, { draftId, accountId, plan: pinOf(plan) }), true)
  assert.equal(
    await draftBuildApproved(db.pool, {
      draftId,
      accountId,
      plan: { id: plan.id, revision: plan.revision + 1 }
    }),
    false
  )
  assert.equal(typeof (await draftBuildName(db.pool, draftId)), 'string')
  assert.deepEqual(await draftRunReader({ pool: db.pool })('larkfen.localhost'), { brief: null, job: null })
})

test(
  'the build doors answer no em or en dash and refuse a session that is not the build session',
  opts,
  async () => {
    const s = server()
    const { plan } = await plannedDraft()
    const answered = await s.call('POST', '/build', { plan: pinOf(plan) })
    assert.equal(DASHES.test(JSON.stringify(answered.body)), false)
    const res = await s.app.fetch(
      new Request(`${config.origin}/api/build-draft/build`, {
        headers: { 'x-tracy-actor': actor(OWNER), 'x-tracy-session': 'session-build-0' }
      })
    )
    assert.equal(res.status, 403)
    await changeDraft(db.pool, (await ensureAccount(db.pool, OWNER)).id, () => ({}))
  }
)
