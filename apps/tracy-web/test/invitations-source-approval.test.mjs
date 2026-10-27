import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { before, beforeEach, after, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { sourceCampaign } from './_invitations-source.mjs'
import { syncSourceFixture } from '../src/invitations/source-sync.js'
import { SOURCE_POLICY } from '../src/invitations/source-contract.js'
import { sourceTransaction, lockSourceCampaigns, readSourceState } from '../src/invitations/source-store.js'
import {
  evaluateSourceRecipient,
  dependencyFingerprint,
  bindSourceApproval,
  approvalStatus,
  invalidateSourceApprovals,
  candidateFromRecipient
} from '../src/invitations/source-approval.js'
import { renderTemplate } from '../src/invitations/render.js'
import { getSourceFixture } from '../src/invitations/source-fixtures.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const options = { skip: !process.env.TEST_DATABASE_URL }
const customText = 'Customized synthetic body retained.'
function recipient(fields = ['first_name', 'group', 'company']) {
  return {
    id: randomUUID(),
    email: 'friend@fixture.test',
    identities: [{ source: 'amember', memberId: 'sandbox-amember-1' }],
    group: 'group_1',
    state: 'draft',
    firstName: 'Sandbox Friend',
    sourceCandidate: {
      state: 'recheck',
      needsReview: false,
      negativeAssertions: { internal: false, globalUnsubscribed: false }
    },
    draft: {
      revision: 1,
      subject: 'Synthetic subject',
      bodyText: customText,
      contentHash: createHash('sha256')
        .update(JSON.stringify({ subject: 'Synthetic subject', bodyText: customText }))
        .digest('hex'),
      dependencyFields: fields,
      approved: false
    },
    attempts: [],
    messages: []
  }
}
async function setup(fields) {
  const r = recipient(fields)
  const campaign = await sourceCampaign(db.pool, { recipients: [r] })
  const result = await sync(campaign, 'foundation-ready-v1', 'initial', 0)
  await sourceTransaction(db.pool, async (client, now) => {
    const readiness = await evaluateSourceRecipient({
      db: client,
      scopeId: campaign.scopeId,
      recipient: r,
      policy: SOURCE_POLICY,
      now
    })
    assert.equal(readiness.state, 'ready')
    r.draft.approved = true
    r.draft.approval = bindSourceApproval({
      draft: r.draft,
      readiness,
      destination: r.email,
      actor: 'owner@fixture.test',
      now
    })
    await client.query(
      "update invitations_sandbox_campaign set data=jsonb_set(data,'{recipients}',$2) where id=$1",
      [campaign.id, JSON.stringify([r])]
    )
  })
  return { campaign, r, result }
}
const sync = (campaign, fixtureId, requestKey, revision) =>
  syncSourceFixture({
    pool: db.pool,
    campaignId: campaign.id,
    actor: 'owner@fixture.test',
    revision,
    fixtureId,
    requestKey,
    onFactsChanged: invalidateSourceApprovals
  })
async function saved(campaign) {
  return (await db.pool.query('select data from invitations_sandbox_campaign where id=$1', [campaign.id]))
    .rows[0].data.recipients[0]
}
// Production decisions use PostgreSQL's clock, not the JavaScript test runner's shifted clock.
async function databaseNow(offsetMs = 0) {
  const { rows } = await db.pool.query(
    "select clock_timestamp() + $1::double precision * interval '1 millisecond' as now",
    [offsetMs]
  )
  return rows[0].now.toISOString()
}
async function readiness(campaign, r, now) {
  return evaluateSourceRecipient({
    db: db.pool,
    scopeId: campaign.scopeId,
    recipient: r,
    policy: SOURCE_POLICY,
    now: now ?? (await databaseNow())
  })
}

test('source candidate lifecycle is not mistaken for source eligibility', () => {
  const r = recipient()
  assert.equal(candidateFromRecipient(r).state, 'recheck')
  delete r.sourceCandidate
  assert.equal(candidateFromRecipient(r).needsReview, true)
})

test('dependency fingerprint includes hidden conditions and distinguishes absent and null', () => {
  const rendered = renderTemplate({
    template: {
      id: 'synthetic',
      version: '1',
      subject: 'Hi {{first_name}}',
      paragraphs: [
        { text: 'Last {{last_template}}', whenPresent: 'last_template' },
        { text: 'CMS {{cms}}', whenPresent: 'cms' }
      ]
    },
    personalization: { first_name: 'Friend' },
    systemLinks: {
      invitationUrl: 'https://invitations.invalid/join',
      unsubscribeUrl: 'https://invitations.invalid/stop'
    }
  })
  assert.ok(rendered.dependencyFields.includes('last_template'))
  assert.ok(rendered.dependencyFields.includes('cms'))
  assert.equal(rendered.usedFields.includes('last_template'), false)
  const args = {
    fields: rendered.dependencyFields,
    personalization: { first_name: 'Friend' },
    destination: 'friend@fixture.test',
    identities: ['member:sandbox-1'],
    policyVersion: SOURCE_POLICY.version
  }
  assert.notEqual(
    dependencyFingerprint(args),
    dependencyFingerprint({
      ...args,
      personalization: { ...args.personalization, last_template: 'Synthetic Template' }
    })
  )
  assert.notEqual(
    dependencyFingerprint(args),
    dependencyFingerprint({ ...args, personalization: { ...args.personalization, last_template: null } })
  )
  assert.equal(
    dependencyFingerprint(args),
    dependencyFingerprint({ ...args, personalization: { ...args.personalization, company: 'Unused' } })
  )
})

test('complete synthetic facts produce readiness but never tracking consent', options, async () => {
  const { campaign, r } = await setup()
  const value = await readiness(campaign, r)
  assert.equal(value.state, 'ready')
  assert.equal(value.trackingBasis, 'unknown')
  assert.equal(
    approvalStatus({ draft: r.draft, readiness: value, destination: r.email, now: value.checkedAt })
      .effective,
    true
  )
  const expired = await readiness(campaign, r, r.draft.approval.validatedThrough)
  assert.notEqual(expired.state, 'ready')
  assert.equal(
    approvalStatus({ draft: r.draft, readiness: expired, destination: r.email, now: expired.checkedAt })
      .effective,
    false
  )
})

test('continuous identical refresh extends validation without reapproval', options, async () => {
  const { campaign, r, result } = await setup()
  // An earlier successful validation is still continuous at refresh time.
  r.draft.approval.validatedThrough = await databaseNow(60000)
  await db.pool.query(
    "update invitations_sandbox_campaign set data=jsonb_set(data,'{recipients}',$2) where id=$1",
    [campaign.id, JSON.stringify([r])]
  )
  await sync(campaign, 'foundation-unused-v2', 'unused', result.campaignRevision)
  const fresh = await saved(campaign)
  assert.equal(fresh.draft.approved, true)
  assert.equal(fresh.draft.approval.actor, r.draft.approval.actor)
  assert.equal(fresh.draft.approval.createdAt, r.draft.approval.createdAt)
  assert.equal(fresh.draft.approval.contentHash, r.draft.approval.contentHash)
  assert.ok(fresh.draft.approval.validatedThrough > r.draft.approval.validatedThrough)
  const afterOriginalDeadline = new Date(Date.parse(r.draft.approval.validatedThrough) + 1).toISOString()
  const value = await readiness(campaign, fresh, afterOriginalDeadline)
  assert.equal(
    approvalStatus({
      draft: fresh.draft,
      readiness: value,
      destination: fresh.email,
      now: afterOriginalDeadline
    }).effective,
    true
  )
})

test('expired approval cannot revive after refresh or A B A changes', options, async () => {
  const { campaign, r, result } = await setup()
  const changed = await sync(campaign, 'foundation-company-v2', 'change', result.campaignRevision)
  assert.equal((await saved(campaign)).draft.approved, false)
  await sync(campaign, 'foundation-ready-v1', 'recover', changed.campaignRevision)
  const after = await saved(campaign)
  assert.equal(after.draft.approved, false)
  assert.equal(after.draft.bodyText, customText)
  assert.equal(after.draft.revision, 1)
  assert.deepEqual(after.attempts, r.attempts)
  assert.deepEqual(after.messages, r.messages)
  assert.equal(
    (await db.pool.query('select count(*) from invitations_source_invalidation')).rows[0].count,
    '1'
  )
})

test('same-dependency refresh after an expired validation gap invalidates permanently', options, async () => {
  const { campaign, r, result } = await setup()
  r.draft.approval.validatedThrough = await databaseNow(-1)
  await db.pool.query(
    "update invitations_sandbox_campaign set data=jsonb_set(data,'{recipients}',$2) where id=$1",
    [campaign.id, JSON.stringify([r])]
  )
  await sync(campaign, 'foundation-ready-v1', 'gap', result.campaignRevision)
  const after = await saved(campaign)
  assert.equal(after.draft.approved, false)
  assert.ok(after.draft.approvalInvalidation.reasons.includes('APPROVAL_VALIDATION_GAP'))
})

for (const [fixture, reason] of [
  ['foundation-optout-v2', 'KNOWN_SUPPRESSION'],
  ['foundation-email-v2', 'SOURCE_DESTINATION_CHANGED'],
  ['foundation-unknown-v2', 'MARKETING_BASIS_UNKNOWN']
])
  test(
    `${fixture} invalidates approval without changing destination or customized text`,
    options,
    async () => {
      const { campaign, r, result } = await setup()
      const stopped = await sync(campaign, fixture, 'changed', result.campaignRevision)
      const after = await saved(campaign)
      assert.equal(after.draft.approved, false)
      assert.equal(after.email, r.email)
      assert.equal(after.draft.bodyText, customText)
      assert.ok((await readiness(campaign, after)).reasons.includes(reason))
      await sync(campaign, 'foundation-ready-v1', 'recover', stopped.campaignRevision)
      assert.equal((await saved(campaign)).draft.approved, false)
      if (fixture === 'foundation-optout-v2')
        assert.equal((await readiness(campaign, after)).state, 'suppressed')
    }
  )

test(
  'a new alias invalidates approvals in every linked source campaign but leaves attempts immutable',
  options,
  async () => {
    const { campaign, r } = await setup()
    const other = await sourceCampaign(db.pool, {
      recipients: [
        {
          ...structuredClone(r),
          id: randomUUID(),
          attempts: [{ id: 'synthetic-attempt' }],
          messages: [{ id: 'synthetic-message' }]
        }
      ]
    })
    await sourceTransaction(db.pool, async (client, now) => {
      await client.query(
        "insert into invitations_sandbox_alias values('member:sandbox-amember-1','member:sandbox-new-alias')"
      )
      const affectedCampaigns = await lockSourceCampaigns(client, campaign.scopeId)
      const current = (await readSourceState(client, campaign.scopeId)).current
      await invalidateSourceApprovals({
        db: client,
        scopeId: campaign.scopeId,
        previous: current,
        current,
        affectedCampaigns,
        now
      })
      for (const row of affectedCampaigns)
        await client.query('update invitations_sandbox_campaign set data=$2 where id=$1', [row.id, row.data])
    })
    assert.equal((await saved(campaign)).draft.approved, false)
    const after = await saved(other)
    assert.equal(after.draft.approved, false)
    assert.deepEqual(after.attempts, [{ id: 'synthetic-attempt' }])
    assert.deepEqual(after.messages, [{ id: 'synthetic-message' }])
  }
)

test('omitted optional source dependency appearing later invalidates approval', options, async () => {
  const { campaign, result } = await setup(['last_template', 'cms'])
  const refreshed = await syncSourceFixture({
    pool: db.pool,
    campaignId: campaign.id,
    actor: 'owner@fixture.test',
    revision: result.campaignRevision,
    fixtureId: 'foundation-ready-v1',
    requestKey: 'optional-present',
    onFactsChanged: invalidateSourceApprovals,
    resolveFixture: (id, context) => {
      const adapter = getSourceFixture(id, context)
      return {
        ...adapter,
        async changesPage(args) {
          const page = await adapter.changesPage(args)
          for (const observation of page.observations) observation.personalization.cms = 'Synthetic CMS'
          return page
        }
      }
    }
  })
  assert.equal(refreshed.status, 'ready')
  assert.equal((await saved(campaign)).draft.approved, false)
})

test('source readiness refuses a missing Sendy fact even with an existing approval', options, async () => {
  const { campaign, r } = await setup()
  await db.pool.query("delete from invitations_source_current where source='sendy'")
  const value = await readiness(campaign, r)
  assert.equal(value.state, 'recheck')
  assert.ok(value.reasons.includes('SENDY_MISSING'))
  assert.equal(
    approvalStatus({ draft: r.draft, readiness: value, destination: r.email, now: value.checkedAt })
      .effective,
    false
  )
})
