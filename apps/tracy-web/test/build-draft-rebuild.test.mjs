// A built site's update, restore and abandon (#612, `build-draft/rebuild-route.js`): the owner changes the plan after
// the build and the site is updated by a revision run that writes only what the change touched, the previous version
// can be restored, an update that stopped half way can be undone, and every stop reaches the owner as one plain
// sentence. Driven through the app's doors. The create door, the run frame and the brief row are fakes standing in for
// `POST /api/sites` and the step chain's record; the draft, the edit gate, the build store (Postgres) and Part 3's
// restore on the invented florist's memory site are the real ones. Invented data only.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-rebuild.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { readBuild } from '../src/build-draft/build-store.js'
import { DONE_SAY, REBUILD_SAY, UNAVAILABLE_SAY } from '../src/build-draft/rebuild-say.js'
import { siteBuildStore } from '../src/build-draft/site-builds.js'
import { createDraft, putComposed } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import { KIT_ROOT, OWNER, actor, config, kits } from './build-draft-engine-fixtures.mjs'
import { runOn } from './build-draft-rebuild-fixtures.mjs'
import { revisedBy } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

const SITE_KEY = 'site-1.localhost'
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)
const line = (step, extra = {}) => ({ step, attempt: 1, outcome: 'done', ...extra })
const ALL = ['doors', 'kit', 'brand', 'plan', 'copy', 'pictures', 'icons', 'order', 'write']
const doneRow = (extra = {}) => ({
  brief: {
    state: 'applied',
    timings: { chain: { ending: 'complete', steps: ALL.map((s) => line(s)) } },
    ...extra
  },
  job: null
})

function server({
  runs = new Map(),
  store = siteBuildStore(db.pool),
  startRun,
  siteDoorsFor,
  runRecordOf
} = {}) {
  const started = []
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine: {
      buildChatOn: async () => true,
      startSite: async () => ({ site: { siteKey: SITE_KEY, label: 'larkfen', jobId: 'job-1' } }),
      readRun: async (siteKey) => runs.get(siteKey) ?? { brief: null, job: null },
      prunePictures: async () => 0,
      builds: store,
      ...(startRun !== false
        ? {
            startRun:
              startRun ??
              (async (input) => {
                started.push(input)
                return { started: true }
              })
          }
        : {}),
      ...(siteDoorsFor ? { siteDoorsFor } : {}),
      ...(runRecordOf ? { runRecordOf } : {})
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
  return { call, runs, store, started }
}

/** A draft holding the invented club's plan, approved and built: the site holds build `run-first`. */
async function builtSite(s) {
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
  const plan = composed.plan
  await s.call('POST', '/build', { plan: { id: plan.id, revision: plan.revision } })
  s.runs.set(SITE_KEY, doneRow())
  const done = await s.call('GET', '/build')
  assert.equal(done.body.build.state, 'done')
  // The site chat the build handed off to: what every later door must leave in place.
  await db.pool.query(
    `update build_draft set build = jsonb_set(build, '{handoff}', $2::jsonb) where account_id = $1`,
    [id, JSON.stringify(HANDOFF)]
  )
  await s.store.keep({ ref: 'run-first', previous: null, plan }, { siteKey: SITE_KEY }, { expected: null })
  return { accountId: id, plan }
}

/** Rename the first service on the living plan, as the plan card does. */
async function renamed(s, plan, label = 'Little Racquets academy') {
  const service = plan.items.find((i) => i.kind === 'service')
  const edit = await s.call('POST', '/edit', {
    changes: [{ field: `items[${service.id}].label`, value: label }]
  })
  assert.equal(edit.status, 200, JSON.stringify(edit.body))
  return edit.body.result.plan
}
const HANDOFF = { sessionId: 'session-site-chat-1', promptedAt: '2026-11-15T08:00:00.000Z' }
const pin = (plan) => ({ id: plan.id, revision: plan.revision })
/** Contract B for a partial run: the run names its edit and has at least two steps. */
function assertPartial(event) {
  assert.equal(event.run.kind, 'partial')
  assert.equal(typeof event.run.edit, 'string')
  if (event.steps) assert.ok(event.steps.length >= 2)
}

test(
  'a plan change after the build starts a revision run of the new revision from the site build',
  opts,
  async () => {
    const s = server()
    const { accountId, plan } = await builtSite(s)
    const before = await readBuild(db.pool, accountId)
    const next = await renamed(s, plan)
    assert.equal(next.revision, plan.revision + 1)
    const revised = await s.call('POST', '/build/revise', { plan: pin(next) })
    assert.equal(revised.status, 202, JSON.stringify(revised.body))
    assert.equal(revised.body.build.state, 'building')
    assert.equal(revised.body.build.kind, 'partial')
    assert.equal(revised.body.build.siteKey, SITE_KEY, 'the same site')
    // The run is asked for exactly the new revision, from the build the site holds, under its own id.
    const [asked] = s.started
    assert.equal(s.started.length, 1)
    assert.equal(asked.siteKey, SITE_KEY)
    assert.deepEqual(
      { ...asked.brief, buildRun: typeof asked.brief.buildRun },
      {
        workflow: 'step-chain/1',
        draftId: asked.draftId,
        plan: pin(next),
        rebuildFrom: 'run-first',
        buildRun: 'string'
      }
    )
    // The build keeps its id, its site and its hand off; the first run is kept in the history.
    const after = await readBuild(db.pool, accountId)
    assert.equal(after.id, before.id)
    assert.deepEqual(after.site, before.site)
    assert.deepEqual(after.handoff, HANDOFF, 'the site chat is kept')
    assert.deepEqual(after.snapshot.plan, next)
    assert.deepEqual(
      after.history.map((h) => [h.kind, h.result, h.plan.revision]),
      [['build', 'done', plan.revision]]
    )
    // While it runs, the plan does not move and a second update is not started: one run at a time per site.
    const again = await s.call('POST', '/build/revise', { plan: pin(next) })
    assert.equal(again.body.code, 'BUILD_RUNNING')
    assert.equal(
      (await s.call('POST', '/edit', { changes: [{ field: 'look.accent', value: '#1F4E9C' }] })).body.code,
      'BUILD_RUNNING'
    )
    assert.equal(s.started.length, 1)
  }
)

test(
  'the rebuild shows only the touched pages in Contract B, then says it is done and offers restore',
  opts,
  async () => {
    const s = server()
    const { plan } = await builtSite(s)
    const next = await renamed(s, plan)
    await s.call('POST', '/build/revise', { plan: pin(next) })
    const run = s.started[0].brief.buildRun
    // Before the run's own row exists, the first build's row is not read as this run.
    const waiting = await s.call('GET', '/build')
    const first = waiting.body.run.events[0]
    assert.equal(first.run.kind, 'partial')
    assert.equal(typeof first.run.edit, 'string')
    assert.ok(first.steps.every((st) => st.state === 'pending'))
    assertPartial(first)
    const touched = next.pages[0].id
    const planLine = line('plan', {
      output: { rebuild: { write: [{ page: touched, reasons: ['data:x'] }] } }
    })
    s.runs.set(SITE_KEY, {
      brief: {
        state: 'preparing',
        run,
        timings: {
          chain: {
            ending: 'running',
            steps: [...['doors', 'kit', 'brand'].map((x) => line(x)), planLine],
            running: ['copy']
          }
        }
      },
      job: null
    })
    const going = await s.call('GET', '/build')
    const event = going.body.run.events[0]
    const writers = event.steps.filter((st) => st.kind === 'writer')
    assert.deepEqual(
      writers.map((w) => w.page),
      [touched],
      'one writer step: the page the change touched'
    )
    assert.equal(writers[0].state, 'running')
    assertPartial(event)
    s.runs.set(SITE_KEY, {
      brief: {
        state: 'applied',
        run,
        timings: { chain: { ending: 'complete', steps: ALL.map((x) => (x === 'plan' ? planLine : line(x))) } }
      },
      job: null
    })
    const done = await s.call('GET', '/build')
    assert.equal(done.body.run.outcome.result, 'done')
    assert.equal(done.body.run.outcome.run.kind, 'partial')
    assertPartial(done.body.run.outcome)
    assert.equal(done.body.build.state, 'done')
    assert.equal(done.body.build.say, DONE_SAY.partial)
    assert.equal(done.body.build.restorable, true)
    // The plan the site shows now is the one asked for again: nothing to update.
    await s.store.keep(
      { ref: run, previous: 'run-first', plan: next },
      { siteKey: SITE_KEY },
      { expected: 'run-first' }
    )
    const same = await s.call('POST', '/build/revise', { plan: pin(next) })
    assert.equal(same.body.say, DONE_SAY.unchanged)
    assert.equal(s.started.length, 1)
  }
)

test(
  'every stop of an update reaches the owner as one plain statement; a held file is shown',
  opts,
  async () => {
    const s = server()
    const { accountId, plan } = await builtSite(s)
    for (const [n, code] of Object.keys(REBUILD_SAY).entries()) {
      const living = await renamed(
        s,
        (await readBuild(db.pool, accountId)).snapshot.plan,
        `Racquet course ${n}`
      )
      const revised = await s.call('POST', '/build/revise', { plan: pin(living) })
      assert.equal(revised.status, 202, `${code}: ${JSON.stringify(revised.body)}`)
      const run = s.started.at(-1).brief.buildRun
      const failed = { step: 'write', attempt: 1, outcome: 'failed', code, error: `${code}: invented` }
      s.runs.set(SITE_KEY, {
        brief: {
          state: 'failed',
          run,
          timings: {
            chain: {
              ending: 'stopped',
              steps: [...ALL.slice(0, -1).map((x) => line(x)), failed],
              stop: { step: 'write', attempts: 1, code, error: failed.error }
            }
          }
        },
        job: null
      })
      const stopped = await s.call('GET', '/build')
      assert.equal(stopped.body.run.outcome.result, 'stopped', code)
      assert.equal(stopped.body.build.say, REBUILD_SAY[code], code)
      assert.equal(stopped.body.build.restorable, false)
      assert.equal(stopped.body.build.say.includes('?'), false, `${code} is a statement`)
      assert.equal(DASHES.test(stopped.body.build.say), false)
      assert.equal(JSON.stringify(stopped.body.build).includes(code), false, 'the owner never sees the code')
    }
    // The flag of a held person's photo left on the site, with the file.
    const living = await renamed(
      s,
      (await readBuild(db.pool, accountId)).snapshot.plan,
      'Racquet course held'
    )
    await s.call('POST', '/build/revise', { plan: pin(living) })
    const run = s.started.at(-1).brief.buildRun
    const flags = [
      {
        code: 'held_file_left_on_site',
        places: [{ op: 'held:0a1b2c3d4e5f', file: 'images/tracy/coach-1.jpg' }]
      }
    ]
    s.runs.set(SITE_KEY, {
      brief: {
        state: 'applied',
        run,
        timings: {
          chain: {
            ending: 'complete',
            steps: ALL.map((x) => (x === 'write' ? line(x, { output: { flags } }) : line(x)))
          }
        }
      },
      job: null
    })
    const flagged = await s.call('GET', '/build')
    assert.deepEqual(flagged.body.build.heldFile.files, ['images/tracy/coach-1.jpg'])
    assert.match(flagged.body.build.heldFile.say, /keep private/)
    assert.equal(plan.id, living.id)
  }
)

test('a server that cannot start the run says so; the site build does not move', opts, async () => {
  const s = server({ startRun: false })
  const { accountId, plan } = await builtSite(s)
  const next = await renamed(s, plan)
  const revised = await s.call('POST', '/build/revise', { plan: pin(next) })
  assert.equal(revised.body.say, UNAVAILABLE_SAY)
  // Nothing was written: the build still reads as the site shows it, and its history did not grow.
  assert.equal(revised.body.build.state, 'done')
  assert.equal(await s.store.current({ siteKey: SITE_KEY }), 'run-first')
  const build = await readBuild(db.pool, accountId)
  assert.equal(build.plan.revision, plan.revision)
  assert.equal((build.history ?? []).length, 0)
  assert.equal(build.revisionRefusal.code, 'REVISION_RUN_UNAVAILABLE')
  // The draft keeps the change: the owner can try again later.
  const living = (await db.pool.query('select plan from build_draft where account_id = $1', [accountId]))
    .rows[0]
  assert.equal(living.plan.revision, next.revision)
})

test('an update is only for a built site; an unfinished update must be undone first', opts, async () => {
  const s = server()
  const { plan } = await builtSite(s)
  await s.store.reset(SITE_KEY)
  const next = await renamed(s, plan)
  assert.equal((await s.call('POST', '/build/revise', { plan: pin(next) })).body.code, 'NOT_BUILT')
  await s.store.keep({ ref: 'run-first', previous: null, plan }, { siteKey: SITE_KEY }, { expected: null })
  await s.store.begin({ runId: 'run-crashed', from: 'run-first' }, { siteKey: SITE_KEY })
  const refused = await s.call('POST', '/build/revise', { plan: pin(next) })
  assert.equal(refused.status, 409)
  assert.equal(refused.body.say, REBUILD_SAY.previous_run_unfinished)
  const read = await s.call('GET', '/build')
  assert.equal(read.body.build.unfinished, true)
  assert.equal(read.body.build.say, REBUILD_SAY.previous_run_unfinished)
  assert.equal(s.started.length, 0)
  // Without the run's record the server cannot undo it, and says so; the mark stays.
  const cannot = await s.call('POST', '/build/abandon')
  assert.equal(cannot.body.say, UNAVAILABLE_SAY)
  assert.equal((await s.store.unfinished({ siteKey: SITE_KEY })).runId, 'run-crashed')
})

test('undo the unfinished update: the mark ends and a new update can start', opts, async () => {
  const memory = blankSite()
  const s = server({ siteDoorsFor: async () => memory.doors, runRecordOf: async () => ({}) })
  const { plan } = await builtSite(s)
  await s.store.begin({ runId: 'run-crashed', from: 'run-first' }, { siteKey: SITE_KEY })
  const undone = await s.call('POST', '/build/abandon')
  assert.equal(undone.status, 200, JSON.stringify(undone.body))
  assert.equal(undone.body.say, DONE_SAY.abandon)
  assert.equal(await s.store.unfinished({ siteKey: SITE_KEY }), null)
  assert.equal(await s.store.current({ siteKey: SITE_KEY }), 'run-first', 'the site build does not change')
  const next = await renamed(s, plan)
  assert.equal((await s.call('POST', '/build/revise', { plan: pin(next) })).status, 202)
})

test('restore the previous version: the site is the build before the update again', opts, async () => {
  const memory = blankSite()
  const store = siteBuildStore(db.pool)
  const s = server({ store, siteDoorsFor: async () => memory.doors })
  const site = { siteKey: SITE_KEY }
  const { accountId } = await builtSite(s)
  // Real builds on the memory site: the first build, then a revision renaming a service.
  await store.reset(SITE_KEY)
  const first = await runOn({ memory, store, site, runId: 'run-florist-1' })
  const before = snapshotOf(memory)
  const second = await runOn({
    memory,
    store,
    site,
    revised: revisedBy('rename a service'),
    runId: 'run-florist-2',
    rebuildFrom: first.write.build.ref
  })
  assert.notDeepEqual(snapshotOf(memory), before)
  const kept = await store.read(second.write.build.ref, site)
  const restored = await s.call('POST', '/build/restore')
  assert.equal(restored.status, 200, JSON.stringify(restored.body))
  assert.equal(restored.body.say, DONE_SAY.restore)
  assert.equal(await store.current(site), first.write.build.ref)
  const now = snapshotOf(memory)
  const left = new Set(kept.write.state.undo.uploads)
  now.uploads = now.uploads.filter(([path]) => !left.has(path))
  assert.deepEqual(now, before)
  // Nothing else went: the later build is still in the store, the build keeps its site and its chat.
  assert.ok(await store.read(second.write.build.ref, site))
  const after = await readBuild(db.pool, accountId)
  assert.equal(after.site.siteKey, SITE_KEY)
  assert.deepEqual(after.handoff, HANDOFF)
  // The first build has no build before it: there is nothing more to restore.
  const again = await s.call('POST', '/build/restore')
  assert.equal(again.body.code, 'NOTHING_TO_RESTORE')
})

test('a restore that would show a held text stops with its sentence and changes nothing', opts, async () => {
  const memory = blankSite()
  const store = siteBuildStore(db.pool)
  const s = server({ store, siteDoorsFor: async () => memory.doors })
  const site = { siteKey: SITE_KEY }
  await builtSite(s)
  await store.reset(SITE_KEY)
  const first = await runOn({ memory, store, site, runId: 'run-florist-1' })
  await runOn({
    memory,
    store,
    site,
    revised: revisedBy('hold a reviewer'),
    runId: 'run-florist-2',
    rebuildFrom: first.write.build.ref
  }).catch(() => null)
  const held = await store.current(site)
  const stopped = await s.call('POST', '/build/restore')
  assert.notEqual(held, first.write.build.ref, 'the held revision is the site build')
  assert.equal(stopped.body.say, REBUILD_SAY.restore_shows_held_text)
  assert.equal(await store.current(site), held)
})

test('no door of the build chat deletes the site or the chat', opts, async () => {
  // Every door the build draft folder serves, read from the route files: none is a DELETE.
  const { readFileSync, readdirSync } = await import('node:fs')
  const folder = new URL('../src/build-draft/', import.meta.url)
  const doors = readdirSync(folder)
    .filter((f) => f.endsWith('.js'))
    .flatMap((f) =>
      [...readFileSync(new URL(f, folder), 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(/g)].map(
        (m) => [f, m[1]]
      )
    )
  assert.ok(doors.length > 0)
  assert.deepEqual(
    doors.filter(([, verb]) => verb === 'delete'),
    []
  )
  // Run every write-back door on a built site: the site row, the build session's site and the hand off all stay.
  const memory = blankSite()
  const s = server({ siteDoorsFor: async () => memory.doors, runRecordOf: async () => ({}) })
  const { accountId, plan } = await builtSite(s)
  const before = await readBuild(db.pool, accountId)
  await s.store.begin({ runId: 'run-crashed', from: 'run-first' }, { siteKey: SITE_KEY })
  await s.call('POST', '/build/abandon')
  await s.call('POST', '/build/restore')
  await s.call('POST', '/build/revise', { plan: pin(await renamed(s, plan)) })
  // Start the draft again, restart the plan, choose another template: the draft may change, the site and chat stay.
  await s.call('POST', '')
  await s.call('POST', '/compose', { restart: true })
  await s.call('PUT', '/template', { template: { slug: 'ja-invented' } })
  const after = await readBuild(db.pool, accountId)
  assert.deepEqual(after.site, before.site)
  assert.deepEqual(after.handoff, HANDOFF)
  assert.equal(after.id, before.id)
  assert.ok(await s.store.read('run-first', { siteKey: SITE_KEY }), 'the earlier build is kept')
})
