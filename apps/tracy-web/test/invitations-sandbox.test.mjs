import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { invitationsRoutes } from '../src/invitations/route.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pg = { skip: !process.env.TEST_DATABASE_URL }
function app(role = 'owner', enabled = true, config = {}) {
  const a = new Hono()
  a.route(
    '/api/ops/invitations',
    invitationsRoutes({
      pool: db.pool,
      config: { invitationsSandbox: enabled, ...config },
      admit: async () => (role ? { email: 'owner@fixture.test', role } : null)
    })
  )
  return a
}
async function request(a, path = '', input, method) {
  const response = await a.request(`http://localhost/api/ops/invitations${path}`, {
    method: method ?? (input ? 'POST' : 'GET'),
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: input ? JSON.stringify(input) : undefined
  })
  return { status: response.status, body: await response.json() }
}
const csv = (email = 'friend@fixture.test', identity = 'sandbox-1', flag = '0') =>
  `email,source_member_id,group_key,first_name,global_unsubscribed,internal\n${email},${identity},group_1,Real name ignored,${flag},0`

test('local baseline inspection maps columns without persistence or a commit token', pg, async () => {
  const a = app('owner', true, { environment: 'local', origin: 'http://localhost' })
  const row = (await request(a, '', { name: 'Baseline inspection' })).body
  const baseline =
    'user_id,email,nhom_gui,unsubscribed_toan_bo,noi_bo,ten,ma_so_thue\n101,fixture@example.com,1 agency dang hoat dong,co,,Fictional full name,unused'
  const result = await request(a, `/${row.id}/preview`, { revision: 0, csv: baseline })
  assert.equal(result.status, 200)
  assert.equal(result.body.readOnly, true)
  assert.equal(result.body.id, undefined)
  assert.equal(result.body.eligibleNow, null)
  assert.equal(result.body.mapping.user_id, 'source_member_id')
  assert.equal(result.body.mapping.ten, undefined)
  assert.equal(result.body.candidates[0].state, 'suppressed')
  assert.equal(JSON.stringify(result.body).includes('Fictional full name'), false)
  assert.equal((await request(a, `/${row.id}`)).body.revision, 0)
  assert.equal((await db.pool.query('select count(*)::int n from invitations_sandbox_preview')).rows[0].n, 0)
  assert.equal(
    (await request(a, `/${row.id}/commit`, { revision: 0, digest: result.body.digest })).status,
    400
  )
  const dev = app('owner', true, { environment: 'dev', origin: 'http://localhost' })
  assert.equal((await request(dev, `/${row.id}/preview`, { revision: 0, csv: baseline })).status, 403)
  assert.equal(
    (await request(app('developer'), `/${row.id}/preview`, { revision: 0, csv: baseline })).status,
    403
  )
})
async function campaign(a, email, identity) {
  const created = (await request(a, '', { name: 'Sandbox campaign' })).body
  const preview = (await request(a, `/${created.id}/preview`, { revision: 0, csv: csv(email, identity) }))
    .body
  const result = await request(a, `/${created.id}/commit`, {
    revision: 0,
    previewId: preview.id,
    digest: preview.digest
  })
  assert.equal(result.status, 200)
  return result.body
}
async function approved(a, row) {
  row = (
    await request(a, `/${row.id}/content`, {
      revision: row.revision,
      group: 'group_1',
      subject: '[Sandbox] {{group}} invitation',
      bodyText:
        'Hello {{first_name}},\nFictional invitation.\nhttps://invitations.invalid/sandbox\nReply STOP.'
    })
  ).body
  row = (await request(a, `/${row.id}/generate`, { revision: row.revision })).body
  const r = row.recipients[0]
  return (
    await request(a, `/${row.id}/recipients/${r.id}/approve`, {
      revision: row.revision,
      contentHash: r.draft.contentHash
    })
  ).body
}
test('admission, developer aggregate and mutation same origin', pg, async () => {
  const owner = app()
  const c = await campaign(owner)
  const aggregate = await request(app('developer'))
  assert.equal(aggregate.status, 200)
  assert.equal(aggregate.body.campaigns[0].name, undefined)
  assert.equal(aggregate.body.campaigns[0].recipients, undefined)
  assert.equal(aggregate.body.campaigns[0].counts.recipients, 1)
  assert.equal((await request(app('developer'), `/${c.id}`)).status, 403)
  assert.equal((await request(app('developer'), '', { name: 'Sandbox' })).status, 403)
  assert.equal((await app(null).request('http://localhost/api/ops/invitations')).status, 403)
  assert.equal((await request(app('owner', false))).body.enabled, false)
  const response = await owner.request('http://localhost/api/ops/invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"name":"Sandbox"}'
  })
  assert.equal(response.status, 403)
})

test('group content versions survive fresh route reads without changing existing snapshots', pg, async () => {
  const a = app()
  let row = await approved(a, await campaign(a))
  row = (await request(a, `/${row.id}/simulate`, { revision: row.revision })).body
  const originalRecipient = structuredClone(row.recipients[0])
  const originalVersion = structuredClone(row.content[0].versions[0])
  row = (
    await request(a, `/${row.id}/content`, {
      revision: row.revision,
      group: 'group_1',
      subject: 'Revised fictional content',
      bodyText: 'Revised group message for {{first_name}}.'
    })
  ).body
  const persisted = (await request(app(), `/${row.id}`)).body
  assert.deepEqual(persisted.recipients[0], originalRecipient)
  assert.equal(persisted.content[0].activeVersion, 2)
  assert.deepEqual(persisted.content[0].versions[0], originalVersion)
  assert.equal(persisted.content[0].versions[1].subject, 'Revised fictional content')
  const preview = await request(a, `/${row.id}/content-preview`, {
    revision: row.revision,
    group: 'group_1',
    recipientId: originalRecipient.id
  })
  assert.equal(preview.status, 200)
  assert.equal(preview.body.bodyText, 'Revised group message for Sandbox Friend.')
  assert.deepEqual((await request(app(), `/${row.id}`)).body, persisted)
  const regenerated = await request(a, `/${row.id}/generate`, {
    revision: row.revision,
    replaceExisting: true
  })
  assert.deepEqual(regenerated.body.recipients[0], originalRecipient)
  const attempts = await db.pool.query('select snapshot from invitations_sandbox_attempt')
  assert.equal(attempts.rows.length, 1)
  assert.deepEqual(attempts.rows[0].snapshot, originalRecipient.attempts[0].snapshot)
})
test('real email rejected before persistent preview; rows capped; synthetic names replaced', pg, async () => {
  const a = app()
  const c = (await request(a, '', { name: 'Sandbox' })).body
  assert.equal(
    (await request(a, `/${c.id}/preview`, { revision: 0, csv: csv('person@example.com') })).status,
    400
  )
  assert.equal((await db.pool.query('select count(*)::int n from invitations_sandbox_preview')).rows[0].n, 0)
  const p = await request(a, `/${c.id}/preview`, { revision: 0, csv: csv() })
  assert.equal(p.body.candidates[0].personalization.first_name, 'Sandbox Friend')
  const rows = csv().split('\n')
  assert.equal(
    (
      await request(a, `/${c.id}/preview`, {
        revision: 0,
        csv: [rows[0], ...Array(201).fill(rows[1])].join('\n')
      })
    ).status,
    400
  )
})
test('CAS, commit replay and approval invalidation', pg, async () => {
  const a = app()
  const c = (await request(a, '', { name: 'Sandbox' })).body
  const p = (await request(a, `/${c.id}/preview`, { revision: 0, csv: csv() })).body
  const input = { revision: 0, previewId: p.id, digest: p.digest }
  let row = (await request(a, `/${c.id}/commit`, input)).body
  assert.equal((await request(a, `/${c.id}/commit`, input)).status, 200)
  assert.equal((await request(a, `/${c.id}/commit`, { ...input, digest: 'changed' })).status, 409)
  row = await approved(a, row)
  const rid = row.recipients[0].id
  const oldHash = row.recipients[0].draft.contentHash
  row = (
    await request(a, `/${row.id}/recipients/${rid}/draft`, {
      revision: row.revision,
      subject: 'Sandbox changed',
      bodyText: 'Fictional revised fixture'
    })
  ).body
  assert.equal(row.recipients[0].draft.approved, false)
  assert.equal(
    (
      await request(a, `/${row.id}/recipients/${rid}/approve`, {
        revision: row.revision,
        contentHash: oldHash
      })
    ).status,
    409
  )
  assert.equal((await request(a, `/${row.id}/generate`, { revision: 0 })).status, 409)
})
test(
  'persisted exact simulated snapshots, program aliases dedupe, STOP blocks later campaign and reply',
  pg,
  async () => {
    const a = app()
    let first = await approved(a, await campaign(a))
    first = (await request(a, `/${first.id}/simulate`, { revision: first.revision })).body
    assert.equal(first.recipients[0].attempts.length, 1)
    assert.equal(first.recipients[0].messages[0].bodyText, first.recipients[0].attempts[0].snapshot.bodyText)
    let alias = await approved(a, await campaign(a, 'alias@fixture.test', 'sandbox-1'))
    alias = (await request(a, `/${alias.id}/simulate`, { revision: alias.revision })).body
    assert.equal(alias.recipients[0].state, 'duplicate')
    first = (
      await request(a, `/${first.id}/recipients/${first.recipients[0].id}/message`, {
        revision: first.revision,
        direction: 'inbound',
        bodyText: 'STOP'
      })
    ).body
    assert.equal(
      (
        await request(a, `/${first.id}/recipients/${first.recipients[0].id}/message`, {
          revision: first.revision,
          direction: 'outbound',
          bodyText: 'Fictional reply'
        })
      ).status,
      409
    )
    let later = await campaign(a, 'another@fixture.test', 'sandbox-1')
    later = (await request(a, `/${later.id}/generate`, { revision: later.revision })).body
    assert.equal(later.recipients[0].state, 'suppressed')
    assert.equal(later.recipients[0].draft, null)
    assert.equal(
      (await db.pool.query('select count(*)::int n from invitations_sandbox_attempt')).rows[0].n,
      1
    )
    const persisted = (await request(app(), `/${first.id}`)).body
    assert.equal(persisted.recipients[0].messages.at(-1).bodyText, 'STOP')
    assert.ok(persisted.audit.length)
  }
)
test('identity bridges across campaigns cannot bypass prior simulation or STOP', pg, async () => {
  const a = app()
  let first = await approved(a, await campaign(a, 'original@fixture.test', 'sandbox-original'))
  first = (await request(a, `/${first.id}/simulate`, { revision: first.revision })).body
  await campaign(a, 'original@fixture.test', 'sandbox-alias')
  let linked = await approved(a, await campaign(a, 'new-alias@fixture.test', 'sandbox-alias'))
  linked = (await request(a, `/${linked.id}/simulate`, { revision: linked.revision })).body
  assert.equal(linked.recipients[0].state, 'duplicate')
  first = (
    await request(a, `/${first.id}/recipients/${first.recipients[0].id}/message`, {
      revision: first.revision,
      direction: 'inbound',
      bodyText: 'STOP'
    })
  ).body
  let stopped = await campaign(a, 'late-alias@fixture.test', 'sandbox-alias')
  stopped = (await request(a, `/${stopped.id}/generate`, { revision: stopped.revision })).body
  assert.equal(stopped.recipients[0].state, 'suppressed')
  assert.equal(stopped.recipients[0].draft, null)
})
test('preview actor binding, expiry, and concurrent compare-and-swap', pg, async () => {
  const a = app()
  const c = (await request(a, '', { name: 'Sandbox' })).body
  let p = (await request(a, `/${c.id}/preview`, { revision: 0, csv: csv() })).body
  await db.pool.query("update invitations_sandbox_preview set actor='other@fixture.test' where id=$1", [p.id])
  assert.equal(
    (await request(a, `/${c.id}/commit`, { revision: 0, previewId: p.id, digest: p.digest })).status,
    409
  )
  p = (await request(a, `/${c.id}/preview`, { revision: 0, csv: csv() })).body
  await db.pool.query(
    "update invitations_sandbox_preview set expires_at=now()-interval '1 second' where id=$1",
    [p.id]
  )
  assert.equal(
    (await request(a, `/${c.id}/commit`, { revision: 0, previewId: p.id, digest: p.digest })).status,
    409
  )
  p = (await request(a, `/${c.id}/preview`, { revision: 0, csv: csv() })).body
  const results = await Promise.all([
    request(a, `/${c.id}/commit`, { revision: 0, previewId: p.id, digest: p.digest }),
    request(a, `/${c.id}/generate`, { revision: 0 })
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  assert.equal((await request(a, `/${c.id}`)).body.revision, 1)
})

test('inbound fixture alone does not authorize an outbound reply', pg, async () => {
  const a = app()
  let row = await campaign(a)
  const rid = row.recipients[0].id
  row = (
    await request(a, `/${row.id}/recipients/${rid}/message`, {
      revision: row.revision,
      direction: 'inbound',
      bodyText: 'Fictional inbound before invitation'
    })
  ).body
  assert.equal(
    (
      await request(a, `/${row.id}/recipients/${rid}/message`, {
        revision: row.revision,
        direction: 'outbound',
        bodyText: 'Fictional unauthorized reply'
      })
    ).status,
    409
  )
  row = await approved(a, row)
  row = (await request(a, `/${row.id}/simulate`, { revision: row.revision })).body
  assert.equal(
    (
      await request(a, `/${row.id}/recipients/${rid}/message`, {
        revision: row.revision,
        direction: 'outbound',
        bodyText: 'Fictional authorized reply'
      })
    ).status,
    200
  )
})

test('reserved-prefix real domains cannot persist in campaign, draft, or message text', pg, async () => {
  const a = app()
  for (const domain of ['example.test.com', 'example.invalid.com']) {
    const contact = `realperson@${domain}`
    assert.equal((await request(a, '', { name: `Sandbox ${contact}` })).status, 400)
    let row = await campaign(a)
    const rid = row.recipients[0].id
    assert.equal(
      (
        await request(a, `/${row.id}/recipients/${rid}/draft`, {
          revision: row.revision,
          subject: 'Sandbox fixture',
          bodyText: `Fictional text ${contact}`
        })
      ).status,
      400
    )
    assert.equal(
      (
        await request(a, `/${row.id}/recipients/${rid}/message`, {
          revision: row.revision,
          direction: 'inbound',
          bodyText: `Fictional text ${contact}`
        })
      ).status,
      400
    )
    assert.equal(JSON.stringify((await request(a, `/${row.id}`)).body).includes(contact), false)
  }
  assert.equal((await request(a, '', { name: 'Sandbox friend@fixture.test.' })).status, 201)
})

test('concurrent cross-campaign simulation reserves a shared identity exactly once', pg, async () => {
  const a = app()
  const first = await approved(a, await campaign(a, 'first@fixture.test', 'sandbox-shared'))
  const second = await approved(a, await campaign(a, 'second@fixture.test', 'sandbox-shared'))
  const results = await Promise.all(
    [first, second].map((row) => request(a, `/${row.id}/simulate`, { revision: row.revision }))
  )
  assert.deepEqual(
    results.map((result) => result.status),
    [200, 200]
  )
  assert.deepEqual(results.map((result) => result.body.recipients[0].state).sort(), [
    'duplicate',
    'simulated'
  ])
  assert.equal((await db.pool.query('select count(*)::int n from invitations_sandbox_attempt')).rows[0].n, 1)
  assert.equal(
    results.reduce((total, result) => total + result.body.recipients[0].attempts.length, 0),
    1
  )
  assert.equal(
    results.reduce((total, result) => total + result.body.recipients[0].messages.length, 0),
    1
  )
})
