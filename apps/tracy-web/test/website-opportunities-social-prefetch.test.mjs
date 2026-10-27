// Pre-enrichment is a read-only contract seam: synthetic cities and provider-free scratch Postgres.
import assert from 'node:assert/strict'
import { before, after, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import {
  createSocialPreEnrichmentPlanner,
  validateSocialSeedManifest
} from 'website-opportunities/src/social-prefetch.js'
import { backfillSocialVersion } from 'website-opportunities/src/social-version.js'
const db = fileDb(),
  options = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
const NOW = Date.parse('2026-10-20T12:00:00Z'),
  WEEK = 7 * 86400000
const URL = 'https://www.instagram.com/fixture.restaurant/',
  ID = 'instagram:id:123456'
const manifest = () => ({
  version: 1,
  source: {
    id: 'fixture-source',
    revision: 'fixture-revision-1',
    url: 'https://fixtures.example.test/seeds',
    fetchedAt: new Date(NOW - 1000).toISOString()
  },
  selection: { rule: 'Synthetic fixtures only; not a real city ranking' },
  cities: [{ id: 'fixture-city-a', places: [{ namespace: 'google', externalId: 'fixture-place-1' }] }]
})
const verifySeed = async ({ source, selection, cityId, placeIdentity }) => ({
  eligible: true,
  selectionRule: selection.rule,
  proofId: 'fixture-authority-proof',
  sourceId: source.id,
  sourceRevision: source.revision,
  cityId,
  ...placeIdentity,
  verifiedAt: new Date(NOW - 1000).toISOString(),
  expiresAt: new Date(NOW + 86400000).toISOString()
})
async function seed({
  externalId = 'fixture-place-1',
  fetchedAt = NOW - WEEK - 1,
  phase = null,
  status = 'done',
  retryAt = null,
  aliasAt = NOW,
  linkAt = NOW
} = {}) {
  const place = (
    await db.pool.query("insert into wo_place(display_name) values('Synthetic restaurant') returning id")
  ).rows[0].id
  await db.pool.query(
    "insert into wo_place_identity(namespace,external_id,place_id,source,confidence) values('google',$1,$2,'google-places',1)",
    [externalId, place]
  )
  await db.pool.query(
    "insert into wo_place_link(place_id,kind,url,verified_by,created_at) values($1,'instagram',$2,'website',$3)",
    [place, URL, new Date(linkAt)]
  )
  await db.pool.query(
    `insert into wo_social_stat(stat_key,network,url,status,platform_id,followers,posts,provider,coverage,fetched_at,next_retry_at,apify_attempt)
    values($1,'instagram',$2,$3,'123456',47,130,'instagram/apify','partial',$4,$5,$6) on conflict do nothing`,
    [
      ID,
      URL,
      status,
      new Date(fetchedAt),
      retryAt ? new Date(retryAt) : null,
      phase ? { id: 'fixture-attempt', phase } : null
    ]
  )
  await db.pool.query(
    `insert into wo_social_alias(alias_key,owner_key,network,platform_id,provider,observed_at,verified_at)
    values('instagram:fixture.restaurant',$1,'instagram','123456','instagram/apify',$2,$2) on conflict do nothing`,
    [ID, new Date(aliasAt)]
  )
  await backfillSocialVersion(db.pool, ID)
  await db.pool.query('insert into wo_social_authority(singleton) values(true) on conflict do nothing')
  await db.pool.query(
    `insert into wo_place_social_link(place_id,kind,url,origin,authority_id,identity_key,binding_revision,alias_key,verified_at)
    select $1,'instagram',$2,'https://fixture-central.example.test',a.authority_id,$3,s.revision,s.alias_key,$4
    from wo_social_authority a cross join wo_social_alias s where s.alias_key='instagram:fixture.restaurant'`,
    [place, URL, ID, new Date(NOW)]
  )
  return place
}
async function planner(over = {}) {
  const domain = await websiteOpportunitiesDomain()
  // Any accidental mutation, queue admission or provider call must fail this test immediately.
  const pool = {
    async query(sql, args) {
      assert.match(sql.trim(), /^select\b/i)
      return db.pool.query(sql, args)
    }
  }
  return createSocialPreEnrichmentPlanner({
    pool,
    domain,
    role: 'central',
    verifySeed,
    now: () => NOW,
    ...over
  })
}

test('seed manifest bounds are explicit, without invented major cities or top places', () => {
  assert.doesNotThrow(() => validateSocialSeedManifest(manifest(), NOW))
  for (const mutate of [
    (m) => (m.cities = Array.from({ length: 11 }, (_, i) => ({ id: 'fixture-' + i, places: [] }))),
    (m) => (m.cities[0].places = Array(51).fill(m.cities[0].places[0])),
    (m) => (m.source.revision = ''),
    (m) => (m.source.url = 'https://u:p@fixture.test'),
    (m) => m.cities.push(m.cities[0]),
    (m) => (m.cities[0].places[0].namespace = 'name')
  ]) {
    const m = manifest()
    mutate(m)
    assert.throws(() => validateSocialSeedManifest(m, NOW), /Invalid/)
  }
})

test(
  'planning is central-only, seed authority missing blocks all work and tick cannot dispatch',
  options,
  async () => {
    await seed()
    const disabled = await planner({ verifySeed: null })
    const plan = await disabled.plan(manifest())
    assert.equal(plan.metrics.verifiedPlaces, 0)
    assert.equal(plan.metrics.blockedByReason.authoritative_seed_not_verified, 1)
    assert.equal(plan.intents.length, 0)
    assert.equal(plan.executable, false)
    const local = await planner({ role: 'client' })
    await assert.rejects(local.plan(manifest()), /central/)
    assert.deepEqual(await local.tick(), { ran: false, reason: 'central_only', providerStarts: 0 })
    assert.deepEqual(await disabled.tick(), {
      ran: false,
      reason: 'scheduler_not_activated',
      providerStarts: 0
    })
  }
)

test(
  'dry-run preserves original version/age/provenance without changing provider rows or ledger',
  options,
  async () => {
    await seed()
    const before = (await db.pool.query('select * from wo_social_stat')).rows
    const p = await planner(),
      plan = await p.plan(manifest())
    assert.equal(plan.dryRun, true)
    assert.equal(plan.controls.killSwitch, true)
    assert.equal(plan.controls.maxPrefetchConcurrency, 0)
    assert.equal(plan.metrics.providerStarts, 0)
    assert.equal(plan.metrics.reservedCostCents, 0)
    assert.equal(plan.metrics.estimatedCostCents, null)
    assert.equal(plan.metrics.sharedPlaceProfiles, 0)
    assert.equal(plan.metrics.dueIntents, 1)
    assert.equal(plan.intents[0].fetchedAt, new Date(NOW - WEEK - 1).toISOString())
    assert.equal(plan.intents[0].enqueueAllowed, false)
    assert.equal(plan.intents[0].priority, 'prefetch')
    assert.equal(plan.intents[0].provenance[0].seedProof.proofId, 'fixture-authority-proof')
    assert.equal(plan.intents[0].provenance[0].placeSource.verifiedBy, 'website')
    assert.equal(plan.intents[0].provenance[0].placeSocialBinding.identityKey, ID)
    assert.deepEqual((await db.pool.query('select * from wo_social_stat')).rows, before)
    assert.equal((await p.plan(manifest())).intents[0].idempotencyKey, plan.intents[0].idempotencyKey)
  }
)

test(
  'several verified places sharing a social identity create one intent without merging places',
  options,
  async () => {
    await seed()
    await seed({ externalId: 'fixture-place-2' })
    const m = manifest()
    m.cities[0].places.push(
      { namespace: 'google', externalId: 'fixture-place-2' },
      { namespace: 'google', externalId: 'fixture-place-1' }
    )
    const result = await (await planner()).plan(m)
    assert.equal(result.metrics.verifiedPlaces, 2)
    assert.equal(result.intents.length, 1)
    assert.equal(result.intents[0].provenance.length, 2)
    assert.equal(result.metrics.blockedByReason.duplicate_place_identity, 1)
    assert.equal(
      (await db.pool.query('select count(*)::int as n from wo_place where merged_into is null')).rows[0].n,
      2
    )
  }
)

test(
  'unknown receipts and held jobs are observation-only, never cancelled or reserved again',
  options,
  async () => {
    await seed({ phase: 'start_uncertain', status: 'failed' })
    const before = (await db.pool.query('select * from wo_social_stat')).rows
    const p = await planner(),
      unknown = await p.plan(manifest())
    assert.equal(unknown.intents[0].disposition, 'unknown_receipt')
    assert.deepEqual(unknown.intents[0].blockers, ['existing_attempt_requires_reconciliation'])
    await p.tick()
    assert.deepEqual((await db.pool.query('select * from wo_social_stat')).rows, before)
    await db.pool.query("update wo_social_stat set status='queued',apify_attempt=$1", [
      { phase: 'running', id: 'fixture-attempt' }
    ])
    assert.equal((await p.plan(manifest())).intents[0].disposition, 'in_flight')
  }
)

test(
  'freshness and retry cooldown determine coverage, a new snapshot creates a new cycle key',
  options,
  async () => {
    await seed({ status: 'failed', retryAt: NOW + 3600000 })
    const p = await planner(),
      cold = await p.plan(manifest())
    assert.equal(cold.intents[0].disposition, 'cooldown')
    assert.equal(cold.metrics.dueIntents, 0)
    await db.pool.query("update wo_social_stat set status='done',fetched_at=$2 where stat_key=$1", [
      ID,
      new Date(NOW)
    ])
    await backfillSocialVersion(db.pool, ID)
    const warm = await p.plan(manifest())
    assert.equal(warm.metrics.freshSocialIdentities, 1)
    assert.equal(warm.intents[0].fetchedAt, new Date(NOW).toISOString())
    assert.notEqual(warm.intents[0].idempotencyKey, cold.intents[0].idempotencyKey)
  }
)

test(
  'seed membership, local identity and source evidence must each verify independently',
  options,
  async () => {
    await seed({ aliasAt: NOW - WEEK - 1 })
    const p = await planner(),
      expired = await p.plan(manifest())
    assert.equal(expired.intents.length, 0)
    assert.equal(expired.metrics.blockedByReason.social_identity_revalidation_required, 1)
    const forged = await planner({
      verifySeed: async (input) => ({ ...(await verifySeed(input)), cityId: 'another-fixture-city' })
    })
    assert.equal((await forged.plan(manifest())).metrics.blockedByReason.authoritative_seed_not_verified, 1)
    const m = manifest()
    m.cities[0].places[0].externalId = 'unknown-fixture-place'
    assert.equal((await p.plan(m)).metrics.blockedByReason.verified_local_place_missing, 1)
  }
)

test(
  'a fresh URL is insufficient to relink a place after handle reassignment or edge revocation',
  options,
  async () => {
    const first = await seed()
    await seed({ externalId: 'fixture-place-2' })
    const m = manifest()
    m.cities[0].places.push({ namespace: 'google', externalId: 'fixture-place-2' })
    const p = await planner()
    await db.pool.query('update wo_place_social_link set revoked_at=$1 where place_id=$2', [
      new Date(NOW),
      first
    ])
    assert.equal((await p.plan(m)).metrics.blockedByReason.verified_place_social_binding_required, 1)
    await db.pool.query(
      `insert into wo_social_stat(stat_key,network,url,status,platform_id,followers,provider,coverage,fetched_at)
    values('instagram:id:654321','instagram',$1,'done','654321',8,'instagram/apify','partial',$2)`,
      [URL, new Date(NOW)]
    )
    await db.pool.query(
      "update wo_social_alias set owner_key='instagram:id:654321',platform_id='654321' where alias_key='instagram:fixture.restaurant'"
    )
    await backfillSocialVersion(db.pool, 'instagram:id:654321')
    const moved = await p.plan(m)
    assert.equal(moved.intents.length, 0)
    assert.equal(moved.metrics.blockedByReason.verified_place_social_binding_required, 2)
    assert.equal(
      (await db.pool.query('select count(*)::int as n from wo_place_social_link where revoked_at is null'))
        .rows[0].n,
      1
    )
    assert.equal(
      (await db.pool.query('select identity_key from wo_place_social_link')).rows[0].identity_key,
      ID
    )
  }
)

test('verified Google and OSM identities of one local place count once', options, async () => {
  const place = await seed()
  await db.pool.query(
    "insert into wo_place_identity(namespace,external_id,place_id,source,confidence) values('osm','fixture-node-1',$1,'osm',1)",
    [place]
  )
  const m = manifest()
  m.cities[0].places.push({ namespace: 'osm', externalId: 'fixture-node-1' })
  const result = await (await planner()).plan(m)
  assert.equal(result.metrics.verifiedPlaces, 1)
  assert.equal(result.metrics.blockedByReason.duplicate_verified_place, 1)
  assert.equal(result.intents.length, 1)
  assert.equal(result.intents[0].provenance.length, 1)
})
