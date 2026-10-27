import assert from 'node:assert/strict'
import { before, beforeEach, after, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { sourceCampaign } from './_invitations-source.mjs'
import { syncSourceFixture, getSourceHealth } from '../src/invitations/source-sync.js'
import { readSourceState } from '../src/invitations/source-store.js'
import { getSourceFixture } from '../src/invitations/source-fixtures.js'
import { sourceError } from '../src/invitations/source-contract.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const options = { skip: !process.env.TEST_DATABASE_URL }
const input = (campaign) => ({
  pool: db.pool,
  campaignId: campaign.id,
  actor: 'owner@fixture.test',
  revision: 0,
  fixtureId: 'foundation-ready-v1',
  requestKey: 'sync1'
})

test('source snapshot requires replay from its fence', options, async () => {
  const campaign = await sourceCampaign(db.pool)
  let beforeCatchup
  const result = await syncSourceFixture({
    ...input(campaign),
    resolveFixture: (id, context) => {
      const adapter = getSourceFixture(id, context)
      return {
        ...adapter,
        async changesPage({ cursor }) {
          beforeCatchup = await readSourceState(db.pool, campaign.scopeId)
          assert.equal(cursor, `synthetic:checkpoint:${context.versionBase}`)
          const page = await adapter.snapshotPage({ pageToken: null })
          page.phase = 'changes'
          page.inputToken = cursor
          page.nextToken = 'synthetic:opaque-last'
          page.observations = [page.observations[0]]
          page.observations[0].sourceVersion++
          page.observations[0].fact.sourceVersion = String(page.observations[0].sourceVersion)
          page.observations[0].personalization.company = 'After fence'
          return page
        }
      }
    }
  })
  assert.equal(beforeCatchup.scope.status, 'pending')
  const afterCatchup = await readSourceState(db.pool, campaign.scopeId)
  assert.equal(afterCatchup.current.find((o) => o.source === 'membership').sourceVersion, 2)
  assert.equal(afterCatchup.current.length, 5)
  assert.equal(afterCatchup.scope.status, 'ready')
  assert.equal(afterCatchup.scope.cursor, 'synthetic:opaque-last')
  assert.equal(result.status, 'ready')
})

test('partial negative survives a later failed page', options, async () => {
  const campaign = await sourceCampaign(db.pool)
  const resolver = (id, context) => {
    const adapter = getSourceFixture(id, context)
    return {
      ...adapter,
      async snapshotPage({ pageToken }) {
        if (pageToken !== null) throw new Error('private upstream failure sentinel')
        const page = await adapter.snapshotPage({ pageToken: null })
        page.observations[2].fact.value.globalUnsubscribed = true
        page.complete = false
        page.nextToken = 'opaque-page-two'
        return page
      }
    }
  }
  const result = await syncSourceFixture({ ...input(campaign), resolveFixture: resolver })
  assert.equal(result.status, 'failed')
  assert.deepEqual(result.scope.reasons, ['source_sync_failed'])
  assert.equal(result.scope.completedAt, null)
  assert.equal(
    (await db.pool.query('select count(*) from invitations_sandbox_suppression')).rows[0].count,
    '2'
  )
  assert.equal((await readSourceState(db.pool, campaign.scopeId)).current.length, 5)
  const again = await syncSourceFixture({ ...input(campaign), resolveFixture: resolver })
  assert.equal(again.runId, result.runId)
  assert.equal((await db.pool.query('select count(*) from invitations_source_page')).rows[0].count, '1')
})

test('bounded source sync resumes after sixteen pages using its persisted anchor', options, async () => {
  const campaign = await sourceCampaign(db.pool)
  const anchors = []
  const resolver = (id, context) => {
    anchors.push(context.anchor)
    const adapter = getSourceFixture(id, context)
    return {
      ...adapter,
      async snapshotPage({ pageToken }) {
        const n = pageToken === null ? 0 : Number(pageToken.slice(2))
        const page = await adapter.snapshotPage({ pageToken: null })
        page.inputToken = pageToken
        page.complete = n === 16
        page.nextToken = page.complete ? null : `p:${n + 1}`
        if (n > 0) page.observations = []
        return page
      }
    }
  }
  const first = await syncSourceFixture({ ...input(campaign), resolveFixture: resolver })
  assert.equal(first.status, 'pending')
  assert.equal(first.scope.completedAt, null)
  const resumed = await syncSourceFixture({ ...input(campaign), resolveFixture: resolver })
  assert.equal(resumed.status, 'ready')
  assert.equal(resumed.runId, first.runId)
  assert.equal(new Set(anchors).size, 1)
  assert.equal((await db.pool.query('select count(*) from invitations_source_page')).rows[0].count, '18')
  const replay = await syncSourceFixture({ ...input(campaign), resolveFixture: resolver })
  assert.deepEqual(replay, resumed)
})

test('source refresh uses committed changes cursor and does not resnapshot', options, async () => {
  const campaign = await sourceCampaign(db.pool)
  const first = await syncSourceFixture(input(campaign))
  let cursorSeen
  const second = await syncSourceFixture({
    ...input(campaign),
    requestKey: 'refresh',
    revision: first.campaignRevision,
    resolveFixture: (id, context) => {
      const adapter = getSourceFixture(id, context)
      return {
        ...adapter,
        async snapshotPage() {
          assert.fail('refresh resnapshotted')
        },
        async changesPage({ cursor }) {
          cursorSeen = cursor
          return adapter.changesPage({ cursor })
        }
      }
    }
  })
  assert.equal(cursorSeen, first.scope.cursor)
  assert.equal(second.status, 'ready')
  assert.equal((await readSourceState(db.pool, campaign.scopeId)).current[0].sourceVersion, 2)
})

for (const scenario of ['unavailable', 'expired', 'loop', 'missing-coverage'])
  test(`source sync keeps ${scenario} blocked without false completion`, options, async () => {
    const campaign = await sourceCampaign(db.pool)
    const resolver = (id, context) => {
      const adapter = getSourceFixture(id, context)
      return {
        ...adapter,
        async status() {
          return {
            ready: scenario !== 'unavailable',
            coverage: ['membership', 'marketingBasis', 'amember', 'sendy', 'tracy']
          }
        },
        async snapshotPage(args) {
          if (scenario === 'expired') throw sourceError('source_cursor_expired', 409)
          const page = await adapter.snapshotPage(args)
          if (scenario === 'loop') {
            page.complete = false
            page.nextToken = page.inputToken
          }
          if (scenario === 'missing-coverage') page.coverage = ['amember']
          return page
        },
        async changesPage(args) {
          const page = await adapter.changesPage(args)
          if (scenario === 'missing-coverage') page.coverage = ['amember']
          return page
        }
      }
    }
    const result = await syncSourceFixture({ ...input(campaign), resolveFixture: resolver })
    assert.equal(result.status, 'failed')
    assert.equal((await getSourceHealth(db.pool, campaign.scopeId)).completedAt, null)
    if (scenario === 'expired') {
      const fresh = await syncSourceFixture({
        ...input(campaign),
        requestKey: 'new-snapshot',
        revision: result.campaignRevision
      })
      assert.equal(fresh.status, 'ready')
      await assert.rejects(syncSourceFixture({ ...input(campaign), resolveFixture: resolver }), {
        code: 'source_run_superseded'
      })
    }
  })
