import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import { placeProfileFromResearch } from 'website-opportunities/domain/place-profile-from-research.mjs'
import {
  createRevision,
  currentResearchKey,
  freezeDemoResearchInput
} from '../src/opportunities-build/revisions.js'
import { researchHash } from '../src/opportunities-build/agent-demo.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const at = '2026-10-26T12:00:00.000Z'

async function world() {
  const account = (
    await db.pool.query("insert into account(email) values ('profile@test.example') returning id")
  ).rows[0]
  const opp = (
    await db.pool.query(
      "insert into wo_opportunity(account_id,name,provider,provider_id,candidate) values($1,'North Studio','google','place-1','{}') returning *",
      [account.id]
    )
  ).rows[0]
  await db.pool.query('insert into wo_profile(opportunity_id,profile) values($1,$2)', [
    opp.id,
    {
      name: 'North Studio',
      phone: '+1 555 0100',
      provenance: { phone: { source: 'website', seenAt: '2026-10-25T00:00:00Z' } }
    }
  ])
  await db.pool.query(
    "insert into wo_source(opportunity_id,source,ref,status,collected) values($1,'website','https://studio.example','complete',$2)",
    [opp.id, { pages: [{ url: 'https://studio.example', text: 'North Studio' }] }]
  )
  return { opp, args: { accountId: account.id, opportunityId: opp.id, domain, now: () => Date.parse(at) } }
}

test(
  'internal revisions freeze the acceptance read, assessment and hash despite later research changes',
  opts,
  async () => {
    const { args } = await world()
    const read = await freezeDemoResearchInput(db.pool, args.opportunityId, args.accountId)
    await db.pool.query(
      "update wo_profile set profile=jsonb_set(profile,'{name}','\"Changed later\"') where opportunity_id=$1",
      [args.opportunityId]
    )
    const first = (
      await createRevision(db.pool, { ...args, frozenResearchRead: read, researchSnapshotAt: at })
    ).revision
    const snapshot = first.place_profile
    assert.deepEqual(
      snapshot.profile,
      placeProfileFromResearch({
        identity: read.opportunity,
        profile: read.profile,
        brand: read.brand,
        sources: read.rawSources,
        media: read.media,
        posts: read.posts
      })
    )
    assert.equal(snapshot.profile.business.name.value, 'North Studio')
    assert.equal(snapshot.origin, 'research')
    assert.equal(
      snapshot.assessment.facts.find((f) => f.factId === snapshot.profile.business.phone.id).status,
      'accepted'
    )
    assert.equal(snapshot.assessment.profileHash, snapshot.profileHash)
    const second = (await createRevision(db.pool, args)).revision
    assert.notEqual(second.place_profile.profileHash, snapshot.profileHash)
    assert.equal(second.place_profile.profile.business.name.value, 'Changed later')
    assert.notEqual(second.id, first.id)
    assert.equal(
      (await createRevision(db.pool, { ...args, revisionId: first.id })).revision.place_profile.profileHash,
      snapshot.profileHash
    )
    const changedProfile = {
      name: 'Changed later',
      phone: '+1 555 0100',
      provenance: { phone: { source: 'website', seenAt: '2020-01-01T00:00:00Z' } }
    }
    await db.pool.query('update wo_profile set profile=$2 where opportunity_id=$1', [
      args.opportunityId,
      changedProfile
    ])
    const stale = (await createRevision(db.pool, args)).revision.place_profile
    assert.equal(
      stale.assessment.facts.find((f) => f.factId === stale.profile.business.phone.id).status,
      'stale'
    )
  }
)

test('new acceptances do not reuse a legacy revision, while explicit retries retain it', opts, async () => {
  const { args, opp } = await world()
  const read = await freezeDemoResearchInput(db.pool, args.opportunityId, args.accountId)
  const oldHash = researchHash({ schemaVersion: domain.BRIEF_SCHEMA_VERSION, research: read })
  const old = (
    await db.pool.query(
      "insert into wo_revision(opportunity_id,account_id,n,brief,brief_md,research_hash) values($1,$2,1,'{}','',$3) returning *",
      [args.opportunityId, args.accountId, oldHash]
    )
  ).rows[0]
  assert.equal((await createRevision(db.pool, { ...args, revisionId: old.id })).revision.place_profile, null)
  const made = (await createRevision(db.pool, args)).revision
  assert.notEqual(made.id, old.id)
  assert.equal(made.place_profile.profile.business.name.value, 'North Studio')
  assert.equal(await currentResearchKey(db.pool, opp, domain), made.research_hash)
  assert.equal((await createRevision(db.pool, args)).revision.id, made.id)
})

test(
  'a cached Instagram follower count reaches the frozen place profile and fills a stat card',
  opts,
  async () => {
    const { args, opp } = await world()
    const before = await freezeDemoResearchInput(db.pool, args.opportunityId, args.accountId)
    assert.equal('socialStats' in before, false, 'a place with no cached count reads as it did before')
    await db.pool.query(
      "update wo_profile set profile=jsonb_set(profile,'{socials}',$2::jsonb) where opportunity_id=$1",
      [opp.id, JSON.stringify({ instagram: 'https://www.instagram.com/northstudio/' })]
    )
    await db.pool.query(
      `insert into wo_social_stat(stat_key,network,url,status,handle,followers,posts,coverage,provider,fetched_at)
       values ('instagram:northstudio','instagram','https://www.instagram.com/northstudio','done','northstudio',12400,80,'complete','looter2',$1),
              ('instagram:someoneelse','instagram','https://www.instagram.com/someoneelse','done','someoneelse',99,1,'complete','looter2',$1)`,
      ['2026-10-20T00:00:00Z']
    )
    const { profile, assessment } = (await createRevision(db.pool, args)).revision.place_profile
    const ig = profile.claims.statistics.filter((f) => f.value.label === 'followers')
    assert.deepEqual(
      ig.map((f) => [f.value.amount, f.value.scope, f.value.asOf]),
      [[12400, 'https://www.instagram.com/northstudio', '2026-10-20T00:00:00.000Z']]
    )
    const source = profile.sources.find(
      (s) => s.id === profile.evidence.find((e) => e.id === ig[0].evidenceRefs[0]).sourceId
    )
    assert.equal(source.kind, 'instagram')
    assert.equal(source.collectorVersion, 'instagram/looter2')
    const plan = domain.planSlotFill({
      slotRoles: {
        schemaVersion: 'tracy-quickstart-slot-roles/v1',
        groups: [{ id: 'stat.0', entityKind: 'stat_item', allowedKinds: ['stat_item'], itemIndex: 0 }],
        bindings: [
          { slotKey: 'value.0', groupId: 'stat.0', role: 'stat.value', mode: 'verbatim' },
          { slotKey: 'label.0', groupId: 'stat.0', role: 'stat.label', mode: 'copy' }
        ]
      },
      profile,
      assessment: assessment.facts,
      neutralFor: domain.neutralFor
    })
    const w = Object.fromEntries(plan.writes.map((x) => [x.slotKey, x]))
    assert.equal(w['value.0'].value, '12,400')
    assert.equal(w['label.0'].value, 'Instagram followers')
    assert.deepEqual(w['value.0'].factRefs, [ig[0].id])
  }
)
