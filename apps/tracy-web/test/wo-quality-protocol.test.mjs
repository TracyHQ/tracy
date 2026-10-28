import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { deterministicBuildId } from '../src/opportunities-build/builds.js'
import { acceptDemoActions } from '../src/opportunities-build/demo-actions.js'
import { createDemoRunner } from '../src/opportunities-build/demo-runner.js'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import { prepareQualityRun } from '../src/opportunities-build/quality-preparation.js'
import {
  bindQualityAction,
  putQualityBrief,
  qualityCreateContext
} from '../src/opportunities-build/quality-protocol.js'
import { createQualityDemoRunner } from '../src/opportunities-build/quality-runner.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'
import { savePreference } from 'website-opportunities/src/store.js'
import { insertBuild, saveBuildLabel } from '../src/opportunities-build/build-store.js'
import { claimWork, restartBrief } from '../src/sites/brief-store.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' },
  db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const tag = 'synthetic/emdash',
  sha = 'a'.repeat(64)
/**
 * The domain with every brief ready: the synthetic cafe collected no photo, and these tests are about the quality
 * protocol, not brief readiness (`brief-readiness.test.mjs`).
 */
const readyDomain = async () => ({
  ...(await websiteOpportunitiesDomain()),
  briefReadinessOf: () => ({
    version: 'brief-readiness/1',
    verdict: 'pass',
    next: 'build',
    checks: [],
    ownerQuestions: []
  })
})
async function world() {
  const account = (
    await db.pool.query("insert into account(email)values('quality-protocol@example.test')returning id")
  ).rows[0]
  const opp = (
    await db.pool.query(
      "insert into wo_opportunity(account_id,name,provider,provider_id,candidate)values($1,'Synthetic cafe','url','https://synthetic.invalid','{}')returning id",
      [account.id]
    )
  ).rows[0]
  await savePreference(db.pool, account.id, 'emdash', 'apply')
  const accepted = await acceptDemoActions(db.pool, {
    accountId: account.id,
    protocol: 'quality-v1',
    entries: [{ opportunityId: opp.id, requestId: 'quality-protocol-press' }]
  })
  assert.equal(accepted.status, 202)
  const action = (
    await db.pool.query('update wo_demo_action set lease_token=1,lease_until=$1 returning *', [
      new Date(Date.now() + 10 * 60_000)
    ])
  ).rows[0]
  let run
  // The brief and its one build's choice are made the way the quality runner makes them (`revisionForAction`).
  const prepared = await revisionForAction(db.pool, {
    action,
    domain: await readyDomain(),
    ops: { defaultCms: 'emdash' },
    templates: async () => [{ id: 'business', platforms: [{ platform: 'emdash', tag, version: '1' }] }],
    editorial: async (frozen) => {
      run = await prepareQualityRun(db.pool, {
        frozen,
        actionId: action.id,
        semanticInput: { accountId: account.id, opportunityId: opp.id },
        manifest: { hash: 'manifest', release: { tag, version: '1', archiveSha256: sha } },
        questions: { languages: ['en'] },
        models: { editorial: { hash: 'model' } },
        mode: 'apply',
        policy: { maxAttempts: 32, accountDailyCapCents: 50, maxRunMs: 172800000 }
      })
      return {
        frozenHash: qualityHash(frozen),
        reference: { protocol: 'quality-v1', runId: run.id, frozenHash: qualityHash(frozen), planHash: sha },
        markdown: ''
      }
    }
  })
  const buildId = deterministicBuildId(account.id, action.revision_id, action.build_request_id)
  const build = (
    await insertBuild(db.pool, {
      accountId: account.id,
      revisionId: action.revision_id,
      requestId: action.build_request_id,
      buildId,
      choice: prepared.revision.build_choice
    })
  ).row
  await saveBuildLabel(db.pool, build.id, 'quality-fixture')
  await bindQualityAction(db.pool, { action, run, lease: { token: 1 } })
  const input = {
    accountId: account.id,
    buildId,
    actionId: action.id,
    token: 1,
    body: { platform: 'emdash', design: 'business', quickstart: tag, label: 'quality-fixture', buildId },
    install: { version: '1', state: { sha256: sha } },
    available: async () => true
  }
  return { account, opp, action, run, build, input }
}
test(
  'quality create infers ownership from the book, checks the live fence and pins release before provisioning',
  opts,
  async () => {
    const { input, run } = await world()
    assert.equal((await qualityCreateContext(db.pool, input)).runId, run.id)
    await assert.rejects(qualityCreateContext(db.pool, { ...input, token: 0 }), /ACTION_FENCE/)
    await assert.rejects(
      qualityCreateContext(db.pool, { ...input, install: { version: '2', state: { sha256: sha } } }),
      /RELEASE_CHANGED/
    )
    await assert.rejects(
      qualityCreateContext(db.pool, {
        ...input,
        body: { ...input.body, brief: { about: 'Bypass the planner' } }
      }),
      /CREATE_PAYLOAD/
    )
    await assert.rejects(
      qualityCreateContext(db.pool, { ...input, available: async () => false }),
      /UNAVAILABLE/
    )
    await savePreference(db.pool, input.accountId, 'emdash', 'off')
    await assert.rejects(qualityCreateContext(db.pool, input), /APPLY_DISABLED/)
  }
)

test(
  'the normal quality queue creates without a legacy brief and the default worker cannot take its row',
  opts,
  async () => {
    const { account, action } = await world()
    await db.pool.query('update wo_demo_action set lease_until=null,lease_token=0 where id=$1', [action.id])
    let creates = 0
    const deps = {
      pool: db.pool,
      config: { origin: 'http://tracy.test', sessionSecret: 's'.repeat(32) },
      loadDomain: readyDomain,
      runtime: async () => ({ settings: {} }),
      switchOn: async () => true,
      log: { warn() {}, error() {} },
      request: async (path, init) => {
        if (path === '/api/templates')
          return Response.json({ templates: [{ id: 'business', platforms: [{ platform: 'emdash', tag }] }] })
        if (path === '/api/sites') {
          creates++
          const body = JSON.parse(init.body)
          assert.equal(body.brief, undefined)
          assert.equal(init.headers['X-Tracy-WO-Action'], action.id)
          assert.ok(Number(init.headers['X-Tracy-WO-Fence']) > 0)
          return Response.json(
            { siteKey: 'quality-fixture.localhost', jobId: 'quality-provision' },
            { status: 202 }
          )
        }
        if (path.includes('/jobs/')) return Response.json({ state: 'running' })
        assert.fail(`Unexpected legacy or unbounded request: ${path}`)
      }
    }
    const legacy = createDemoRunner(deps)
    await legacy.tick()
    await legacy.drain()
    assert.equal(creates, 0)
    const quality = createQualityDemoRunner({
      ...deps,
      accountIds: [account.id],
      quality: {
        available: async () => true,
        checkAllowed: async () => {},
        editorialFor: () => async () => assert.fail('Prepared revision must be reused'),
        adopt: async () => {},
        fill: async () => assert.fail('Provision is not done'),
        review: async () => assert.fail('Nothing was filled')
      }
    })
    await quality.tick()
    await quality.drain()
    assert.equal(creates, 1)
    const held = (await db.pool.query('select status,step from wo_demo_action where id=$1', [action.id]))
      .rows[0]
    assert.deepEqual(held, { status: 'quality-queued-v1', step: 'build' })
    await assert.rejects(
      db.pool.query("update wo_demo_action set status='queued' where id=$1", [action.id]),
      /quality_namespace/
    )
  }
)
test(
  'a quality marker survives idempotent create replay and legacy consumers cannot claim or restart it',
  opts,
  async () => {
    const { input } = await world(),
      context = await qualityCreateContext(db.pool, input)
    const args = { siteKey: 'quality-fixture.localhost', context, platform: 'emdash', quickstart: tag }
    await putQualityBrief(db.pool, args)
    assert.equal(await claimWork(db.pool, args.siteKey), false)
    assert.equal(await restartBrief(db.pool, args.siteKey, { about: 'Legacy retry' }), false)
    await db.pool.query("update site_brief set state='quality-review-v1',timings='{}' where site_key=$1", [
      args.siteKey
    ])
    assert.equal((await putQualityBrief(db.pool, args)).state, 'quality-review-v1')
  }
)
test(
  'quality retries inherit protocol after mode changes; a legacy press cannot race an active quality action',
  opts,
  async () => {
    const { account, opp, action } = await world()
    const blocked = await acceptDemoActions(db.pool, {
      accountId: account.id,
      entries: [{ opportunityId: opp.id, requestId: 'legacy-competing-press' }]
    })
    assert.equal(blocked.body.code, 'DEMO_BUILD_ACTIVE')
    await db.pool.query("update wo_demo_action set status='quality-failed-v1',lease_until=null where id=$1", [
      action.id
    ])
    await savePreference(db.pool, account.id, 'emdash', 'off')
    const retry = await acceptDemoActions(db.pool, {
      accountId: account.id,
      entries: [{ opportunityId: opp.id, requestId: 'retry-quality-press', retryOf: action.id }]
    })
    assert.equal(retry.status, 202)
    assert.equal(retry.body.actions[0].state, 'queued')
    const row = (
      await db.pool.query('select protocol,status from wo_demo_action where id=$1', [
        retry.body.actions[0].id
      ])
    ).rows[0]
    assert.deepEqual(row, { protocol: 'quality-v1', status: 'quality-queued-v1' })
  }
)
