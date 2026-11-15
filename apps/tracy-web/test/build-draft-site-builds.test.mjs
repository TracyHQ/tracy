// The builds a site holds (#612, `build-draft/site-builds.js`, migration 220): the Postgres store a step chain run built
// from a build draft is given as `deps.builds`, held to the contract of `docs/references/draft-revision-run.md` ("What
// the caller passes"), then driven by the real draft steps of Part 3: a first build, a revision run that renames one
// service and the restore of the first build, on the invented florist's memory site. Invented data only.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-site-builds.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { restoreBuild } from '../src/step-chain-draft-restore.js'
import { siteBuildStore } from '../src/build-draft/site-builds.js'
import { fileDb } from './_db.mjs'
import { runOn } from './build-draft-rebuild-fixtures.mjs'
import { NEW_NAME, revisedBy } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const SITE = { siteKey: 'larkspur-florist.localhost' }
const OTHER = { siteKey: 'harrow-bakery.localhost' }
const buildOf = (ref, previous = null) => ({ ref, previous, plan: { id: 'plan-x', revision: 1 } })

test(
  'keep is compare and set: the first build over null, a revision over its own build only',
  opts,
  async () => {
    const store = siteBuildStore(db.pool)
    assert.equal(await store.current(SITE), null, 'a blank site holds no build')
    assert.equal(await store.keep(buildOf('run-1'), SITE, { expected: 'run-0' }), false)
    assert.equal(await store.read('run-1', SITE), null, 'a refused keep stores nothing')
    assert.equal(await store.keep(buildOf('run-1'), SITE, { expected: null }), true)
    assert.equal(await store.current(SITE), 'run-1')
    assert.equal(await store.keep(buildOf('run-2', 'run-1'), SITE, { expected: null }), false)
    assert.equal(await store.keep(buildOf('run-2', 'run-1'), SITE, { expected: 'run-1' }), true)
    assert.equal(await store.current(SITE), 'run-2')
    // The earlier build stays, so it can be restored; keeping it again makes it the site's build.
    assert.deepEqual(await store.read('run-1', SITE), buildOf('run-1'))
    assert.equal(await store.keep(buildOf('run-1'), SITE, { expected: 'run-2' }), true)
    assert.equal(await store.current(SITE), 'run-1')
    assert.deepEqual(
      (await store.history(SITE.siteKey)).map((b) => b.ref).sort(),
      ['run-1', 'run-2'],
      'nothing is deleted'
    )
    // Sites never see each other's builds.
    assert.equal(await store.current(OTHER), null)
    assert.equal(await store.read('run-1', OTHER), null)
  }
)

test('two keeps at once over the same build: exactly one becomes the site build', opts, async () => {
  const store = siteBuildStore(db.pool)
  await store.keep(buildOf('run-1'), SITE, { expected: null })
  for (let round = 0; round < 5; round += 1) {
    const from = await store.current(SITE)
    const a = `run-a${round}`
    const b = `run-b${round}`
    const kept = await Promise.all([
      store.keep(buildOf(a, from), SITE, { expected: from }),
      store.keep(buildOf(b, from), SITE, { expected: from })
    ])
    assert.deepEqual(kept.filter(Boolean).length, 1, `round ${round}: one keep wins, the other answers false`)
    const won = kept[0] ? a : b
    const lost = kept[0] ? b : a
    assert.equal(await store.current(SITE), won)
    assert.equal(await store.read(lost, SITE), null, 'the losing build is not stored')
  }
})

test('one unfinished run per site: begin, a resume, another run refused, end', opts, async () => {
  const store = siteBuildStore(db.pool)
  assert.equal(await store.unfinished(SITE), null)
  assert.equal(await store.begin({ runId: 'run-2', from: 'run-1' }, SITE), true)
  assert.equal(await store.begin({ runId: 'run-2', from: 'run-1' }, SITE), true, 'the same run resumes')
  assert.equal(await store.begin({ runId: 'run-3', from: 'run-1' }, SITE), false)
  // The mark is the run as given, as the memory store keeps it.
  assert.deepEqual(await store.unfinished(SITE), { runId: 'run-2', from: 'run-1' })
  const both = await Promise.all([
    store.begin({ runId: 'run-4', from: 'run-1' }, OTHER),
    store.begin({ runId: 'run-5', from: 'run-1' }, OTHER)
  ])
  assert.equal(both.filter(Boolean).length, 1, 'two runs racing on a site: one is marked')
  await store.end('run-3', SITE)
  assert.equal((await store.unfinished(SITE)).runId, 'run-2', 'another run id ends nothing')
  await store.end('run-2', SITE)
  assert.equal(await store.unfinished(SITE), null)
})

test(
  'forget keeps the ref and the reason only; a reset site and a site made again hold no build',
  opts,
  async () => {
    const store = siteBuildStore(db.pool)
    await store.keep({ ...buildOf('run-1'), words: { secret: 'Wenna' } }, SITE, { expected: null })
    await store.keep(buildOf('run-2', 'run-1'), SITE, { expected: 'run-1' })
    await store.forget('run-1', SITE, { reason: 'restore_shows_held_text' })
    assert.equal(await store.read('run-1', SITE), null)
    const kept = (await db.pool.query('select * from site_draft_build where ref = $1', ['run-1'])).rows[0]
    assert.equal(kept.build, null)
    assert.equal(kept.forgotten_reason, 'restore_shows_held_text')
    assert.equal(JSON.stringify(kept).includes('Wenna'), false)
    await store.begin({ runId: 'run-3', from: 'run-2' }, SITE)
    await store.reset(SITE.siteKey)
    assert.equal(await store.current(SITE), null)
    assert.equal(await store.unfinished(SITE), null)
    // A site row made after the builds were kept: the key names another site now.
    await store.keep(buildOf('run-7'), OTHER, { expected: null })
    await db.pool.query(
      `insert into site (site_key, label, host, created_at) values ($1, 'harrow', 'local', now() + interval '1 minute')`,
      [OTHER.siteKey]
    )
    assert.equal(await store.current(OTHER), null)
    assert.equal(await store.read('run-7', OTHER), null)
    assert.equal(await store.keep(buildOf('run-8'), OTHER, { expected: null }), true)
    assert.equal(await store.current(OTHER), 'run-8')
    await assert.rejects(store.current({}), { code: 'site_key_missing' })
  }
)

test(
  'the real draft steps keep, revise and restore through this store: the previous version comes back',
  opts,
  async () => {
    const store = siteBuildStore(db.pool)
    const memory = blankSite()
    const first = await runOn({ memory, store, site: SITE, runId: 'run-larkspur-1' })
    const ref = first.write.build.ref
    assert.equal(await store.current(SITE), ref)
    const before = snapshotOf(memory)
    // A full build again on the built site is refused before any model call: it would make every record twice.
    await assert.rejects(runOn({ memory, store, site: SITE, runId: 'run-larkspur-x' }), {
      code: 'site_already_built'
    })
    const revised = revisedBy('rename a service')
    const second = await runOn({
      memory,
      store,
      site: SITE,
      revised,
      runId: 'run-larkspur-2',
      rebuildFrom: ref
    })
    const impact = second.planned.revision.impact
    assert.ok(impact.write.length > 0 && impact.reuse.length > 0, 'some pages written again, others kept')
    assert.equal(await store.current(SITE), second.write.build.ref)
    assert.equal(await store.unfinished(SITE), null, 'the revision ended its mark')
    assert.ok(JSON.stringify(snapshotOf(memory)).includes(NEW_NAME))
    // Restore the build before the revision.
    const build = await store.read(second.write.build.ref, SITE)
    const restored = await restoreBuild({
      build,
      doors: memory.doors,
      record: {},
      runId: 'restore-1',
      builds: store,
      ctx: SITE
    })
    assert.equal(restored.status, 'done')
    assert.equal(await store.current(SITE), ref, 'the site holds the first build again')
    const now = snapshotOf(memory)
    const left = new Set(build.write.state.undo.uploads)
    now.uploads = now.uploads.filter(([path]) => !left.has(path))
    assert.deepEqual(now, before)
  }
)
