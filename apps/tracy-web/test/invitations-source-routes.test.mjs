import assert from 'node:assert/strict'
import { before, beforeEach, after, test } from 'node:test'
import { Hono } from 'hono'
import { fileDb } from './_db.mjs'
import { invitationsRoutes } from '../src/invitations/route.js'
import { syncSourceFixture } from '../src/invitations/source-sync.js'
import { invalidateSourceApprovals } from '../src/invitations/source-approval.js'
import { getSourceFixture } from '../src/invitations/source-fixtures.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pg = { skip: !process.env.TEST_DATABASE_URL }
function app(role = 'owner', enabled = true) {
  const a = new Hono()
  a.route(
    '/api/ops/invitations',
    invitationsRoutes({
      pool: db.pool,
      config: { invitationsSandbox: enabled, origin: 'http://localhost' },
      admit: async () => (role ? { email: 'owner@fixture.test', role } : null)
    })
  )
  return a
}
async function request(a, path = '', input, origin = 'http://localhost') {
  const response = await a.request(`http://localhost/api/ops/invitations${path}`, {
    method: input ? 'POST' : 'GET',
    headers: { origin, 'content-type': 'application/json' },
    body: input ? JSON.stringify(input) : undefined
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { code: text }
  }
  return { status: response.status, body }
}
const csv =
  'email,source_member_id,group_key,global_unsubscribed,internal\nfriend@fixture.test,sandbox-amember-1,group_1,0,0'
async function imported(a = app(), source = true) {
  let row = (await request(a, '', { name: 'Synthetic source API test' })).body
  if (source) {
    const enabled = await request(a, `/${row.id}/source-check`, {
      revision: row.revision,
      fixtureSetId: 'foundation-v1'
    })
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body))
    row = enabled.body
  }
  const preview = await request(a, `/${row.id}/preview`, { revision: row.revision, csv })
  assert.equal(preview.status, 200)
  row = (
    await request(a, `/${row.id}/commit`, {
      revision: row.revision,
      previewId: preview.body.id,
      digest: preview.body.digest
    })
  ).body
  return row
}
async function draft(a = app(), source = true) {
  let row = await imported(a, source)
  if (source) {
    const synced = await request(a, `/${row.id}/sources/sync`, {
      revision: row.revision,
      fixtureId: 'foundation-ready-v1',
      requestKey: 'initial'
    })
    assert.equal(synced.status, 200)
    assert.equal(synced.body.status, 'ready')
    row = (await request(a, `/${row.id}`)).body
  }
  row = (
    await request(a, `/${row.id}/content`, {
      revision: row.revision,
      group: 'group_1',
      subject: 'Hello {{first_name}}',
      bodyText: 'Synthetic invitation for {{group}}. Reply STOP.'
    })
  ).body
  const generated = await request(a, `/${row.id}/generate`, { revision: row.revision })
  assert.equal(generated.status, 200)
  return generated.body
}
async function approve(a, row) {
  const r = row.recipients[0]
  return request(a, `/${row.id}/recipients/${r.id}/approve`, {
    revision: row.revision,
    contentHash: r.draft.contentHash
  })
}

test('source mode is explicit irreversible and cannot upgrade legacy QA', pg, async () => {
  const a = app()
  const legacy = await imported(a, false)
  assert.equal(
    (
      await request(a, `/${legacy.id}/source-check`, {
        revision: legacy.revision,
        fixtureSetId: 'foundation-v1'
      })
    ).status,
    409
  )
  const row = await imported(a)
  assert.equal(row.recipients[0].readiness.state, 'recheck')
  assert.equal(row.recipients[0].state, 'recheck')
  assert.equal(
    (await request(a, `/${row.id}/source-check`, { revision: row.revision, fixtureSetId: 'foundation-v1' }))
      .status,
    409
  )
  assert.equal(
    (await request(a, `/${row.id}/generate`, { revision: row.revision })).body.recipients[0].draft,
    null
  )
  assert.equal((await request(a, `/${legacy.id}`)).body.sourceCheck, undefined)
})

test('source Ops permissions and same-origin use the existing sandbox guard', pg, async () => {
  const owner = app()
  const row = await imported(owner)
  const body = { revision: row.revision, fixtureId: 'foundation-ready-v1', requestKey: 'initial' }
  assert.equal((await request(owner, `/${row.id}/sources/sync`, body, 'https://wrong.invalid')).status, 403)
  assert.equal((await request(app('developer'), `/${row.id}/sources/sync`, body)).status, 403)
  assert.equal((await request(app(null), `/${row.id}/sources`)).status, 403)
  assert.equal((await request(app('owner', false), `/${row.id}/sources`)).status, 404)
  assert.equal((await request(app('admin'), `/${row.id}/sources/sync`, body)).status, 200)
  const aggregate = await request(app('developer'), `/${row.id}/sources`)
  assert.equal(aggregate.status, 200)
  assert.deepEqual(Object.keys(aggregate.body).sort(), ['counts', 'reasons', 'status'])
  assert.equal(JSON.stringify(aggregate.body).includes('friend@'), false)
  assert.equal(JSON.stringify(aggregate.body).includes('sandbox-amember'), false)
})

for (const extra of [
  { facts: {} },
  { url: 'https://arbitrary.invalid' },
  { clock: '2026-10-10' },
  { policy: {} },
  { namespace: 'synthetic:other' }
])
  test(`source sync refuses browser supplied ${Object.keys(extra)[0]}`, pg, async () => {
    const a = app()
    const row = await imported(a)
    assert.equal(
      (
        await request(a, `/${row.id}/sources/sync`, {
          revision: row.revision,
          fixtureId: 'foundation-ready-v1',
          requestKey: 'initial',
          ...extra
        })
      ).status,
      400
    )
    assert.equal((await db.pool.query('select count(*) from invitations_source_run')).rows[0].count, '0')
  })

test('source HTTP sync binds request replay and rejects stale revision or unknown fixtures', pg, async () => {
  const a = app()
  const row = await imported(a)
  const payload = { revision: row.revision, fixtureId: 'foundation-ready-v1', requestKey: 'initial' }
  assert.equal(
    (await request(a, `/${row.id}/sources/sync`, { ...payload, fixtureId: 'unknown' })).status,
    400
  )
  assert.equal((await request(a, `/${row.id}/sources/sync`, { ...payload, revision: 0 })).status, 409)
  const first = await request(a, `/${row.id}/sources/sync`, payload)
  assert.equal(first.body.status, 'ready')
  assert.deepEqual(await request(a, `/${row.id}/sources/sync`, payload), first)
  assert.equal(
    (await request(a, `/${row.id}/sources/sync`, { ...payload, fixtureId: 'foundation-company-v2' })).status,
    409
  )
})

test(
  'source changes invalidate customized draft, and a changed address that cannot be re-approved is left out of the run',
  pg,
  async () => {
    const a = app()
    let row = await draft(a)
    const r = row.recipients[0]
    row = (
      await request(a, `/${row.id}/recipients/${r.id}/draft`, {
        revision: row.revision,
        subject: r.draft.subject,
        bodyText: 'Customized synthetic body.'
      })
    ).body
    row = (await approve(a, row)).body
    assert.equal(row.recipients[0].draft.approved, true)
    const sync = await request(a, `/${row.id}/sources/sync`, {
      revision: row.revision,
      fixtureId: 'foundation-email-v2',
      requestKey: 'changed'
    })
    row = (await request(a, `/${row.id}`)).body
    assert.equal(row.recipients[0].draft.approved, false)
    assert.equal(row.recipients[0].draft.bodyText, 'Customized synthetic body.')
    assert.equal(row.recipients[0].email, 'friend@fixture.test')
    // The changed address cannot be re-approved, so it no longer holds the run: it is left out.
    const run = await request(a, `/${row.id}/simulate`, { revision: sync.body.campaignRevision })
    assert.equal(run.status, 200)
    assert.equal(run.body.recipients[0].attempts.length, 0)
    assert.equal((await db.pool.query('select count(*) from invitations_sandbox_attempt')).rows[0].count, '0')
  }
)

test(
  'a recipient who opts out after approval is left out of the run instead of blocking it',
  pg,
  async () => {
    const a = app()
    let row = (await approve(a, await draft(a))).body
    assert.equal(row.recipients[0].draft.approved, true)
    const sync = await request(a, `/${row.id}/sources/sync`, {
      revision: row.revision,
      fixtureId: 'foundation-optout-v2',
      requestKey: 'opted-out'
    })
    assert.equal(sync.status, 200)
    row = (await request(a, `/${row.id}`)).body
    assert.equal(row.recipients[0].approvalStatus.effective, false)
    const r = row.recipients[0]
    assert.equal(
      (
        await request(a, `/${row.id}/recipients/${r.id}/approve`, {
          revision: row.revision,
          contentHash: r.draft.contentHash
        })
      ).status,
      409,
      'the opted-out recipient cannot be approved again'
    )
    const run = await request(a, `/${row.id}/simulate`, { revision: row.revision })
    assert.equal(run.status, 200, 'the campaign is not stuck on a recipient nobody can re-approve')
    assert.equal(run.body.recipients[0].attempts.length, 0)
    assert.equal((await db.pool.query('select count(*) from invitations_sandbox_attempt')).rows[0].count, '0')
  }
)

test(
  'source save invalidates approval and explicit reapproval permits only synthetic simulation',
  pg,
  async () => {
    const a = app()
    let row = (await approve(a, await draft(a))).body
    const r = row.recipients[0]
    row = (
      await request(a, `/${row.id}/recipients/${r.id}/draft`, {
        revision: row.revision,
        subject: r.draft.subject,
        bodyText: 'Changed synthetic body.'
      })
    ).body
    assert.equal(row.recipients[0].draft.approved, false)
    assert.equal((await request(a, `/${row.id}/simulate`, { revision: row.revision })).status, 409)
    row = (await approve(a, row)).body
    const simulated = await request(a, `/${row.id}/simulate`, { revision: row.revision })
    assert.equal(simulated.status, 200)
    assert.equal(simulated.body.recipients[0].attempts[0].state, 'simulated')
    const snapshot = simulated.body.recipients[0].attempts[0].snapshot
    const stopped = await request(a, `/${row.id}/recipients/${r.id}/message`, {
      revision: simulated.body.revision,
      direction: 'inbound',
      bodyText: 'STOP'
    })
    assert.equal(stopped.body.recipients[0].state, 'suppressed')
    assert.deepEqual(stopped.body.recipients[0].attempts[0].snapshot, snapshot)
  }
)

// A bounded observable barrier: no timing guesses; watchdog releases every owned lock.
async function barrier() {
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const watchdog = setTimeout(release, 5000)
  return {
    held,
    release() {
      clearTimeout(watchdog)
      release()
    }
  }
}
async function waiter(lockId) {
  const deadline = Date.now() + 4500
  while (Date.now() < deadline) {
    const result = await db.pool.query(
      "select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted limit 1",
      [lockId]
    )
    if (result.rowCount) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail('expected PostgreSQL lock waiter not observed')
}
const serviceInput = (row, requestKey, fixtureId = 'foundation-email-v2') => ({
  pool: db.pool,
  campaignId: row.id,
  actor: 'owner@fixture.test',
  revision: row.revision,
  fixtureId,
  requestKey
})

test('source sync before approve rejects stale campaign revision', pg, async () => {
  const a = app()
  const row = await draft(a)
  const gate = await barrier()
  let enter
  const entered = new Promise((resolve) => {
    enter = resolve
  })
  const syncing = syncSourceFixture({
    ...serviceInput(row, 'before'),
    onFactsChanged: async (context) => {
      await invalidateSourceApprovals(context)
      enter()
      await gate.held
    }
  })
  let approving
  try {
    await entered
    approving = approve(a, row)
    await waiter(7243080)
  } finally {
    gate.release()
  }
  assert.equal((await syncing).status, 'ready')
  assert.equal((await approving).status, 409)
})

test('source sync after approve invalidates before commit', pg, async () => {
  const a = app()
  const row = await draft(a)
  const blocker = await db.pool.connect()
  let approving, syncing
  const watchdog = setTimeout(() => blocker.query('select pg_advisory_unlock(7243081)').catch(() => {}), 5000)
  try {
    await db.pool.query(
      `create function source_test_approve_barrier() returns trigger language plpgsql as $$ begin if new.data->'recipients'->0->'draft'->>'approved'='true' then perform pg_advisory_xact_lock(7243081); end if; return new; end; $$; create trigger source_test_approve_barrier before update on invitations_sandbox_campaign for each row execute function source_test_approve_barrier()`
    )
    await blocker.query('select pg_advisory_lock(7243081)')
    approving = approve(a, row)
    await waiter(7243081)
    // The approve transaction already owns 7243080; sync cannot read an old approval.
    syncing = syncSourceFixture({
      ...serviceInput(row, 'after'),
      revision: row.revision + 1,
      onFactsChanged: invalidateSourceApprovals
    })
    await waiter(7243080)
  } finally {
    clearTimeout(watchdog)
    await blocker.query('select pg_advisory_unlock(7243081)')
    blocker.release()
  }
  assert.equal((await approving).status, 200)
  assert.equal((await syncing).status, 'ready')
  await db.pool.query(
    'drop trigger source_test_approve_barrier on invitations_sandbox_campaign; drop function source_test_approve_barrier()'
  )
  const after = (await request(a, `/${row.id}`)).body.recipients[0]
  assert.equal(after.draft.approved, false)
  assert.equal(after.draft.bodyText, row.recipients[0].draft.bodyText)
})

test('source read cannot combine different fact and approval snapshots', pg, async () => {
  const a = app()
  const row = (await approve(a, await draft(a))).body
  const gate = await barrier()
  let enter
  const entered = new Promise((resolve) => {
    enter = resolve
  })
  const syncing = syncSourceFixture({
    ...serviceInput(row, 'read'),
    onFactsChanged: async (context) => {
      await invalidateSourceApprovals(context)
      enter()
      await gate.held
    }
  })
  let reading
  try {
    await entered
    reading = request(a, `/${row.id}`)
    await waiter(7243080)
  } finally {
    gate.release()
  }
  await syncing
  const after = (await reading).body.recipients[0]
  assert.ok(after.readiness.reasons.includes('SOURCE_DESTINATION_CHANGED'))
  assert.equal(after.draft.approved, false)
  const aggregate = await request(app('developer'))
  assert.equal(aggregate.body.campaigns.find((c) => c.id === row.id).counts.approved, 0)
})

test('approval takes database clock after waiting past a source deadline', pg, async () => {
  const a = app()
  let row = await draft(a)
  let deadline
  const refreshed = await syncSourceFixture({
    ...serviceInput(row, 'short', 'foundation-ready-v1'),
    onFactsChanged: invalidateSourceApprovals,
    resolveFixture: (id, context) => {
      const adapter = getSourceFixture(id, context)
      deadline = new Date(Date.parse(context.anchor) + 800).toISOString()
      return {
        ...adapter,
        async changesPage(args) {
          const page = await adapter.changesPage(args)
          for (const o of page.observations) o.fact.validUntil = deadline
          return page
        }
      }
    }
  })
  row = (await request(a, `/${row.id}`)).body
  assert.equal(row.revision, refreshed.campaignRevision)
  const blocker = await db.pool.connect()
  let approving
  const watchdog = setTimeout(() => blocker.query('select pg_advisory_unlock(7243080)').catch(() => {}), 5000)
  try {
    await blocker.query('select pg_advisory_lock(7243080)')
    approving = approve(a, row)
    await waiter(7243080)
    await blocker.query(
      'select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',
      [deadline]
    )
  } finally {
    clearTimeout(watchdog)
    await blocker.query('select pg_advisory_unlock(7243080)')
    blocker.release()
  }
  assert.equal((await approving).status, 409)
})

test('source generation binds actual template fields and unused changes retain approval', pg, async () => {
  const a = app()
  let row = await draft(a)
  assert.equal(row.recipients[0].draft.subject, 'Hello Synthetic Friend')
  assert.deepEqual(row.recipients[0].draft.dependencyFields.sort(), ['first_name', 'group'])
  row = (await approve(a, row)).body
  const original = row.recipients[0].draft
  assert.equal(
    (
      await request(a, `/${row.id}/sources/sync`, {
        revision: row.revision,
        fixtureId: 'foundation-unused-v2',
        requestKey: 'unused'
      })
    ).status,
    200
  )
  row = (await request(a, `/${row.id}`)).body
  assert.equal(row.recipients[0].draft.approved, true)
  assert.equal(row.recipients[0].draft.bodyText, original.bodyText)
  assert.equal(row.recipients[0].draft.approval.createdAt, original.approval.createdAt)
})

test('source sync request keys never replay another campaign result', pg, async () => {
  const a = app()
  const first = await imported(a)
  const second = await imported(a)
  const payload = { revision: first.revision, fixtureId: 'foundation-ready-v1', requestKey: 'same-key' }
  const result = await request(a, `/${first.id}/sources/sync`, payload)
  const other = (await request(a, `/${second.id}`)).body
  const next = await request(a, `/${second.id}/sources/sync`, { ...payload, revision: other.revision })
  assert.equal(next.status, 200)
  assert.notEqual(next.body.runId, result.body.runId)
  assert.equal((await db.pool.query('select count(*) from invitations_source_run')).rows[0].count, '2')
})

test('legacy STOP invalidates linked source approvals without touching customized text', pg, async () => {
  const a = app()
  const checked = (await approve(a, await draft(a))).body
  const legacy = await imported(a, false)
  const recipient = legacy.recipients[0]
  assert.equal(
    (
      await request(a, `/${legacy.id}/recipients/${recipient.id}/message`, {
        revision: legacy.revision,
        direction: 'inbound',
        bodyText: 'STOP'
      })
    ).status,
    200
  )
  const after = (await request(a, `/${checked.id}`)).body
  assert.equal(after.recipients[0].draft.approved, false)
  assert.equal(after.recipients[0].state, 'suppressed')
  assert.equal(after.recipients[0].draft.bodyText, checked.recipients[0].draft.bodyText)
  assert.ok(
    (await db.pool.query('select 1 from invitations_source_invalidation where campaign_id=$1', [checked.id]))
      .rowCount
  )
})

test('source content preview matches the generated draft personalization', pg, async () => {
  const a = app()
  const row = await draft(a)
  const preview = await request(a, `/${row.id}/content-preview`, {
    revision: row.revision,
    group: 'group_1',
    recipientId: row.recipients[0].id
  })
  assert.equal(preview.status, 200)
  assert.equal(preview.body.subject, 'Hello Synthetic Friend')
  const generated = await request(a, `/${row.id}/generate`, { revision: row.revision, replaceExisting: true })
  assert.equal(generated.status, 200)
  assert.equal(preview.body.subject, generated.body.recipients[0].draft.subject)
  assert.equal(preview.body.bodyText, generated.body.recipients[0].draft.bodyText)
})

test('source admission refuses campaign 101 without blocking existing sync or legacy STOP', pg, async () => {
  const a = app()
  let checked = (await approve(a, await draft(a))).body
  const legacy = await imported(a, false)
  for (let i = 1; i < 100; i++) {
    const row = (await request(a, '', { name: 'Synthetic capacity test' })).body
    assert.equal(
      (await request(a, `/${row.id}/source-check`, { revision: row.revision, fixtureSetId: 'foundation-v1' }))
        .status,
      200
    )
  }
  const overflow = (await request(a, '', { name: 'Synthetic capacity overflow' })).body
  const refused = await request(a, `/${overflow.id}/source-check`, {
    revision: overflow.revision,
    fixtureSetId: 'foundation-v1'
  })
  assert.equal(refused.status, 409)
  assert.equal(refused.body.code, 'source_transaction_limit')
  assert.equal((await request(a, `/${overflow.id}`)).body.sourceCheck, undefined)
  checked = (await request(a, `/${checked.id}`)).body
  assert.equal(
    (
      await request(a, `/${checked.id}/sources/sync`, {
        revision: checked.revision,
        fixtureId: 'foundation-ready-v1',
        requestKey: 'capacity-refresh'
      })
    ).status,
    200
  )
  const stopped = await request(a, `/${legacy.id}/recipients/${legacy.recipients[0].id}/message`, {
    revision: legacy.revision,
    direction: 'inbound',
    bodyText: 'STOP'
  })
  assert.equal(stopped.status, 200)
  assert.equal(stopped.body.recipients[0].state, 'suppressed')
  assert.equal((await request(a, `/${checked.id}`)).body.recipients[0].draft.approved, false)
})
