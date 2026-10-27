import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { withRealDb, dbClock, syntheticSnapshot } from './_invitations-real.mjs'
import { contentCampaign, contentZip } from './_invitations-real-content.mjs'
import { realOps } from './_invitations-real-ops.mjs'
const opts = { skip: !process.env.TEST_DATABASE_URL }
test(
  'a recipient request waiting for its campaign lock rechecks revoked access before decrypting',
  opts,
  async () =>
    withRealDb(async (deps) => {
      const h = await realOps(deps),
        c = await contentCampaign(deps)
      const holder = await deps.pool.connect()
      let pending
      try {
        await holder.query('begin')
        await holder.query('select id from invitations_real_campaign where id=$1 for update', [c.campaignId])
        const pid = (await holder.query('select pg_backend_pid() as pid')).rows[0].pid
        pending = h.request(`/campaigns/${c.campaignId}/recipients/${c.recipients[0].id}`)
        let waiting = false
        for (let i = 0; i < 200 && !waiting; i++) {
          waiting = (
            await deps.pool.query(
              'select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) as waiting',
              [pid]
            )
          ).rows[0].waiting
          if (!waiting) await delay(5)
        }
        assert.ok(waiting, 'request reached the real row lock')
        await deps.pool.query('update seat_workspace set revoked_at=clock_timestamp() where account_id=$1', [
          h.ids.owner
        ])
        await holder.query('commit')
        const response = await pending
        assert.equal(response.status, 403)
        assert.ok(!(await response.text()).includes('synthetic50@example.test'))
      } finally {
        await holder.query('rollback')
        holder.release()
        if (pending) await pending
      }
    })
)
for (const path of ['/settings', '/imports/preview'])
  test(`revocation during body upload cannot publish ${path}`, opts, async () =>
    withRealDb(async (deps) => {
      const h = await realOps(deps)
      let ready, controller
      const started = new Promise((r) => {
        ready = r
      })
      const stream = new ReadableStream(
        {
          start(c) {
            controller = c
          },
          pull() {
            ready()
          }
        },
        { highWaterMark: 0 }
      )
      const binary = path === '/imports/preview'
      const request = h.app.fetch(
        new Request(`${h.config.origin}/api/ops/invitations/real${path}`, {
          method: 'POST',
          duplex: 'half',
          body: stream,
          headers: {
            cookie: h.sessions.owner,
            origin: h.config.origin,
            'content-type': binary ? 'text/csv' : 'application/json',
            ...(binary
              ? { 'x-invitations-input': JSON.stringify({ name: 'Synthetic', sourceDate: '2026-10-07' }) }
              : {})
          }
        })
      )
      await started
      await deps.pool.query("update seat_workspace set role='developer' where account_id=$1", [h.ids.owner])
      controller.enqueue(binary ? syntheticSnapshot({ total: 1 }).csvBytes : Buffer.from('{"days":60}'))
      controller.close()
      const response = await request
      assert.equal(response.status, 403)
      assert.equal(
        (await deps.pool.query('select count(*)::int as n from invitations_real_import')).rows[0].n,
        0
      )
      assert.equal(
        (await deps.pool.query('select retention_days from invitations_real_setting where id=1')).rows[0]
          ?.retention_days ?? 30,
        30
      )
    })
  )
test(
  'composed real content APIs preserve revision, asset ACL and fail closed on expiry or missing key',
  opts,
  async () =>
    withRealDb(async (deps) => {
      const h = await realOps(deps),
        c = await contentCampaign(deps),
        other = await contentCampaign(deps)
      const base = `/campaigns/${c.campaignId}`
      const campaign = await h.request(base)
      assert.equal(campaign.status, 200)
      assert.equal((await campaign.json()).sendingEnabled, false)
      const pResponse = await h.request(`${base}/templates/preview`, {
        method: 'POST',
        bytes: await contentZip(),
        metadata: {
          group: 'group_1',
          subject: 'Private synthetic subject',
          revision: c.revision,
          requestKey: randomUUID()
        }
      })
      assert.equal(pResponse.status, 200)
      const p = await pResponse.json()
      let assetPath = `${base}/assets/${p.preview.assets[0].id}`
      assert.equal((await h.request(assetPath, { role: null })).status, 401)
      assert.equal((await h.request(assetPath, { role: 'developer' })).status, 403)
      const image = await h.request(assetPath)
      assert.equal(image.status, 200)
      assert.equal(image.headers.get('cache-control'), 'no-store')
      assert.equal(image.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(image.headers.get('content-type'), 'image/png')
      assert.equal(
        (await h.request(`/campaigns/${other.campaignId}/assets/${p.preview.assets[0].id}`)).status,
        404
      )
      const saved = await h.request(`${base}/templates/commit`, {
        method: 'POST',
        body: { uploadId: p.uploadId, revision: c.revision, requestKey: randomUUID() }
      })
      assert.equal(saved.status, 200)
      c.revision = (await saved.json()).revision
      const generated = await h.request(`${base}/generate`, {
        method: 'POST',
        body: { group: 'group_1', limit: 100, replaceExisting: false, revision: c.revision }
      })
      assert.equal(generated.status, 200)
      c.revision = (await generated.json()).revision
      const queried = await h.request(`${base}/recipients/query`, {
        method: 'POST',
        body: { search: 'synthetic50@example.test', limit: 100 }
      })
      assert.equal(queried.status, 200)
      const page = await queried.json()
      assert.equal(page.items.length, 1)
      const rid = page.items[0].id
      let d = await (await h.request(`${base}/recipients/${rid}`)).json()
      assert.equal(d.rawSource.headers.length, 43)
      assert.equal(
        (
          await h.request(`${base}/recipients/${rid}/approve`, {
            method: 'POST',
            body: { revision: c.revision - 1, draftRevision: d.draft.revision }
          })
        ).status,
        409
      )
      const approved = await h.request(`${base}/recipients/${rid}/approve`, {
        method: 'POST',
        body: { revision: c.revision, draftRevision: d.draft.revision }
      })
      assert.equal(approved.status, 200)
      assert.equal((await approved.json()).sendingEnabled, false)
      await deps.keys.revoke({ campaignId: c.campaignId, now: await dbClock(deps.pool) })
      const unavailable = await h.request(assetPath)
      assert.notEqual(unavailable.status, 200)
      assert.ok(!(await unavailable.text()).includes('Private synthetic'))
      await deps.pool.query(
        "update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [other.campaignId]
      )
      const expired = await h.request(`/campaigns/${other.campaignId}`)
      assert.equal(expired.status, 410)
      assert.deepEqual(h.outbound, [])
    })
)
test(
  'UTF-8 metadata uses an ASCII-safe header and real binary exceptions do not widen other doors',
  opts,
  async () =>
    withRealDb(async (deps) => {
      const h = await realOps(deps)
      const name = 'Synthetic \u03a9 campaign'
      const response = await h.request('/imports/preview', {
        method: 'POST',
        bytes: syntheticSnapshot({ total: 1 }).csvBytes,
        headers: {
          'x-invitations-input': encodeURIComponent(JSON.stringify({ name, sourceDate: '2026-10-07' }))
        }
      })
      assert.equal(response.status, 200)
      for (const path of [
        '/settings',
        '/imports/commit',
        '/imports/preview/other',
        '/campaigns/not-an-id/templates/commit'
      ]) {
        assert.equal((await h.request(path, { method: 'POST', bytes: Buffer.from('Synthetic') })).status, 415)
      }
      for (const headers of [{ 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'cross-site' }]) {
        assert.equal(
          (
            await h.request('/imports/preview', {
              method: 'POST',
              bytes: Buffer.from('Synthetic'),
              headers,
              metadata: { name: 'Synthetic', sourceDate: '2026-10-07' }
            })
          ).status,
          403
        )
      }
      const c = await contentCampaign(deps)
      await unlink(join(deps.root, c.campaignId, 'key.json'))
      const missing = await h.request(`/campaigns/${c.campaignId}`)
      assert.equal(missing.status, 503)
      assert.ok(!(await missing.text()).includes('Synthetic content'))
      assert.deepEqual(h.outbound, [])
    })
)
test(
  'field template edit customized draft invalidation and explicit extension are bound through real APIs',
  opts,
  async () =>
    withRealDb(async (deps) => {
      const h = await realOps(deps),
        c = await contentCampaign(deps),
        rid = c.recipients[0].id,
        base = `/campaigns/${c.campaignId}`
      async function post(path, body) {
        const r = await h.request(`${base}${path}`, { method: 'POST', body })
        assert.equal(r.status, 200, await r.clone().text())
        const value = await r.json()
        if (value.revision) c.revision = value.revision
        return value
      }
      const registry = await (await h.request(`${base}/fields`)).json()
      registry.fields.push({
        key: 'custom.note',
        label: 'Note',
        source: { kind: 'manual' },
        missing: 'default',
        defaultValue: 'Default synthetic note'
      })
      await post('/fields', { revision: c.revision, registry })
      await post(`/recipients/${rid}/fields`, {
        revision: c.revision,
        values: { 'custom.note': 'Confirmed synthetic note' }
      })
      const upload = await h.request(`${base}/templates/preview`, {
        method: 'POST',
        bytes: await contentZip({ html: '<p>{{custom.note}}</p><img src="images/logo.png">' }),
        metadata: {
          group: 'group_1',
          subject: 'Synthetic note',
          revision: c.revision,
          requestKey: randomUUID()
        }
      })
      assert.equal(upload.status, 200)
      const p = await upload.json()
      await post('/templates/commit', {
        uploadId: p.uploadId,
        revision: c.revision,
        requestKey: randomUUID()
      })
      let t = await (await h.request(`${base}/templates/group_1`)).json()
      assert.equal(t.version, 1)
      const preview = await post('/content-preview', {
        group: 'group_1',
        recipientId: rid,
        revision: c.revision
      })
      assert.ok(preview.html.includes('Confirmed synthetic note'))
      assert.equal((await deps.pool.query('select count(*)::int n from invitations_real_draft')).rows[0].n, 0)
      await post('/templates/edit', {
        group: 'group_1',
        subject: 'Edited subject',
        html: t.html,
        text: null,
        assetIds: t.assets.map((a) => a.id),
        revision: c.revision,
        requestKey: randomUUID()
      })
      t = await (await h.request(`${base}/templates/group_1`)).json()
      assert.equal(t.version, 2)
      await post('/generate', { group: 'group_1', limit: 100, replaceExisting: false, revision: c.revision })
      let d = await (await h.request(`${base}/recipients/${rid}`)).json()
      await post(`/recipients/${rid}/draft`, {
        subject: 'Customized synthetic subject',
        html: '<p>Customized synthetic body</p>',
        text: 'Customized synthetic fallback',
        revision: c.revision,
        draftRevision: d.draft.revision
      })
      d = await (await h.request(`${base}/recipients/${rid}`)).json()
      await post(`/recipients/${rid}/approve`, { revision: c.revision, draftRevision: d.draft.revision })
      const approved = await (await h.request(`${base}/recipients/${rid}`)).json()
      assert.equal(approved.draft.contentApproved, true)
      await post(`/recipients/${rid}/fields`, {
        revision: c.revision,
        values: { 'custom.note': 'Changed synthetic note' }
      })
      d = await (await h.request(`${base}/recipients/${rid}`)).json()
      assert.equal(d.draft.contentApproved, false)
      assert.equal(d.draft.html, approved.draft.html)
      assert.equal(d.draft.bodyText, approved.draft.bodyText)
      assert.equal((await (await h.request(base)).json()).expiresAt, c.expiresAt)
      const expiresAt = new Date(Date.parse(c.expiresAt) + 86400000).toISOString()
      assert.equal(
        (
          await h.request(`${base}/extend`, {
            method: 'POST',
            body: { revision: c.revision, expiresAt, confirm: false }
          })
        ).status,
        400
      )
      await post('/extend', { revision: c.revision, expiresAt, confirm: true })
      assert.equal((await (await h.request(base)).json()).expiresAt, expiresAt)
      assert.deepEqual(h.outbound, [])
    })
)
test('real upload limits and invalid metadata refuse without echoing private input', opts, async () =>
  withRealDb(async (deps) => {
    const h = await realOps(deps)
    for (const headers of [
      { 'x-invitations-input': '{"private":"Synthetic private payload"' },
      { 'x-invitations-input': 'x'.repeat(4097) }
    ]) {
      const r = await h.request('/imports/preview', {
        method: 'POST',
        bytes: Buffer.from('Synthetic private payload'),
        headers
      })
      assert.ok([400, 413].includes(r.status))
      assert.ok(!(await r.text()).includes('Synthetic private payload'))
    }
    const over = await h.request('/imports/preview', {
      method: 'POST',
      bytes: Buffer.alloc(10 * 1024 * 1024 + 1),
      metadata: { name: 'Synthetic', sourceDate: '2026-10-07' }
    })
    assert.equal(over.status, 413)
    const jsonOver = await h.request('/settings', {
      method: 'POST',
      body: { days: 30, private: 'Synthetic private payload'.repeat(60000) }
    })
    assert.equal(jsonOver.status, 413)
    assert.ok(!(await jsonOver.text()).includes('Synthetic private payload'))
    for (const body of [
      { days: 30, actorId: randomUUID() },
      JSON.parse('{"days":30,"__proto__":{"private":"Synthetic private payload"}}'),
      { days: 30, pool: 'Synthetic private payload' }
    ]) {
      const invalid = await h.request('/settings', { method: 'POST', body })
      assert.equal(invalid.status, 400)
      assert.ok(!(await invalid.text()).includes('Synthetic private payload'))
    }
    assert.equal((await deps.pool.query('select count(*)::int n from invitations_real_import')).rows[0].n, 0)
    assert.deepEqual(h.outbound, [])
  })
)
