import assert from 'node:assert/strict'
import { before, beforeEach, after, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { sourceCampaign, sourceDump } from './_invitations-source.mjs'
import { beginSourceRun, applySourcePage, readSourceState } from '../src/invitations/source-store.js'
import { getSourceFixture } from '../src/invitations/source-fixtures.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const options = { skip: !process.env.TEST_DATABASE_URL }
async function setup(actor = 'owner@fixture.test', requestKey = 'key1') {
  const campaign = await sourceCampaign(db.pool)
  const run = await beginSourceRun({
    pool: db.pool,
    campaignId: campaign.id,
    revision: 0,
    actor,
    fixtureId: 'foundation-ready-v1',
    requestKey,
    requestDigest: 'synthetic-digest'
  })
  const fixture = getSourceFixture(run.fixture_id, {
    anchor: run.anchor.toISOString(),
    versionBase: Number(run.version_base)
  })
  const page = await fixture.snapshotPage({ pageToken: null })
  return { campaign, run, page }
}

test('source migration preserves append-only observations across fresh pool reads', options, async () => {
  const { campaign, run, page } = await setup()
  await applySourcePage({ pool: db.pool, runId: run.id, page })
  const state = await readSourceState(db.pool, campaign.scopeId, ['sandbox-amember-1'])
  assert.equal(state.current.length, 5)
  assert.equal(state.current[0].sourceVersion, 1)
  assert.equal(state.factsRevision, 1)
  await assert.rejects(
    db.pool.query('update invitations_source_observation set payload=payload'),
    /source_observation_immutable/
  )
  await assert.rejects(
    db.pool.query('delete from invitations_source_observation'),
    /source_observation_immutable/
  )
})

test('source page rollback retains current facts and cursor', options, async () => {
  const { campaign, run, page } = await setup()
  page.observations[2].fact.value.globalUnsubscribed = true
  const beforePage = await sourceDump(db.pool, campaign.scopeId)
  await assert.rejects(
    applySourcePage({
      pool: db.pool,
      runId: run.id,
      page,
      onFactsChanged: async () => {
        throw new Error('synthetic fault')
      }
    }),
    /synthetic fault/
  )
  assert.deepEqual(await sourceDump(db.pool, campaign.scopeId), beforePage)
  await applySourcePage({ pool: db.pool, runId: run.id, page })
  const afterPage = await sourceDump(db.pool, campaign.scopeId)
  assert.equal(afterPage.observations.length, 5)
  assert.equal(afterPage.pages.length, 1)
  assert.equal(afterPage.suppressions.length, 2)
  const replay = await applySourcePage({ pool: db.pool, runId: run.id, page })
  assert.equal(replay.replayed, true)
  assert.deepEqual(await sourceDump(db.pool, campaign.scopeId), afterPage)
})

test('source page rejects same version changed payload atomically', options, async () => {
  const { campaign, run, page } = await setup()
  await applySourcePage({ pool: db.pool, runId: run.id, page })
  const beforePage = await sourceDump(db.pool, campaign.scopeId)
  const changed = structuredClone(page)
  changed.observations[0].personalization.company = 'Changed'
  await assert.rejects(applySourcePage({ pool: db.pool, runId: run.id, page: changed }), {
    code: 'source_page_conflict'
  })
  assert.deepEqual(await sourceDump(db.pool, campaign.scopeId), beforePage)
  changed.phase = 'changes'
  changed.inputToken = page.fenceCursor
  changed.nextToken = 'synthetic:other'
  await assert.rejects(applySourcePage({ pool: db.pool, runId: run.id, page: changed }), {
    code: 'source_version_conflict'
  })
})

test('source tombstone version cannot be resurrected by an older upsert', options, async () => {
  const { campaign, run, page } = await setup()
  const tombstone = structuredClone(page)
  tombstone.observations = [
    { ...tombstone.observations[0], sourceVersion: 3, operation: 'delete', fact: null }
  ]
  await applySourcePage({ pool: db.pool, runId: run.id, page: tombstone })
  const changes = { ...page, phase: 'changes', inputToken: page.fenceCursor, nextToken: 'synthetic:next' }
  await applySourcePage({ pool: db.pool, runId: run.id, page: changes })
  const current = (await readSourceState(db.pool, campaign.scopeId, ['sandbox-amember-1'])).current
  assert.equal(current.find((o) => o.source === 'membership').operation, 'delete')
  assert.equal(current.find((o) => o.source === 'membership').sourceVersion, 3)
})

test(
  'source request replay binds actor campaign and input before stale revision check',
  options,
  async () => {
    const { campaign, run } = await setup()
    const input = {
      pool: db.pool,
      campaignId: campaign.id,
      revision: 0,
      actor: 'owner@fixture.test',
      fixtureId: 'foundation-ready-v1',
      requestKey: 'key1',
      requestDigest: 'synthetic-digest'
    }
    assert.equal((await beginSourceRun(input)).id, run.id)
    await assert.rejects(beginSourceRun({ ...input, requestDigest: 'different' }), {
      code: 'source_request_conflict'
    })
    await assert.rejects(beginSourceRun({ ...input, actor: 'other@fixture.test' }), {
      code: 'source_sync_busy'
    })
    const other = await sourceCampaign(db.pool)
    await assert.rejects(beginSourceRun({ ...input, campaignId: other.id }), { code: 'source_sync_busy' })
  }
)

test('source page callback receives locked campaigns and post-lock database clock', options, async () => {
  const { run, page } = await setup()
  let observed
  await applySourcePage({
    pool: db.pool,
    runId: run.id,
    page,
    onFactsChanged: async (context) => {
      observed = context
      assert.equal(
        (await context.db.query('select pg_try_advisory_xact_lock(7243080) held')).rows[0].held,
        true
      )
    }
  })
  assert.equal(observed.affectedCampaigns.length, 1)
  assert.equal(observed.previous.length, 0)
  assert.equal(observed.current.length, 5)
  assert.ok(Number.isFinite(Date.parse(observed.now)))
})
