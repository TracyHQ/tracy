/** Full synthetic handoff over an owned HTTP stand, private database and private vault. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { serve } from '@hono/node-server'
import { withRealDb, syntheticSnapshot, snapshotCsv } from './_invitations-real.mjs'
import { realOps, realBase } from './_invitations-real-ops.mjs'
import { contentZip } from './_invitations-real-content.mjs'

test(
  'real campaign HTTP handoff preserves 1340 by 43, five image templates and customized approval fences without transport',
  { skip: !process.env.TEST_DATABASE_URL },
  async () =>
    withRealDb(async (deps) => {
      let h
      const server = serve({ hostname: '127.0.0.1', port: 0, fetch: (req) => h.app.fetch(req) })
      try {
        if (!server.listening) await once(server, 'listening')
        const origin = `http://127.0.0.1:${server.address().port}`
        h = await realOps({ ...deps, origin })
        const request = async (path, { role = 'owner', method = 'GET', body, bytes, metadata } = {}) =>
          fetch(`${origin}${realBase}${path}`, {
            method,
            headers: {
              cookie: h.sessions[role],
              ...(method === 'GET' ? {} : { origin }),
              ...(body === undefined ? {} : { 'content-type': 'application/json' }),
              ...(bytes === undefined ? {} : { 'content-type': 'application/octet-stream' }),
              ...(metadata === undefined
                ? {}
                : { 'x-invitations-input': encodeURIComponent(JSON.stringify(metadata)) })
            },
            ...(body === undefined
              ? bytes === undefined
                ? {}
                : { body: bytes }
              : { body: JSON.stringify(body) })
          })
        const read = async (path, options, status = 200) => {
          const response = await request(path, options)
          assert.equal(response.status, status, await response.clone().text())
          assert.equal(response.headers.get('cache-control'), 'no-store')
          return response.json()
        }
        const fixture = syntheticSnapshot()
        let campaign, revision
        for (const [start, end] of [
          [0, 800],
          [800, 1340]
        ]) {
          const preview = await read('/imports/preview', {
            method: 'POST',
            bytes: snapshotCsv(fixture.headers, fixture.rows.slice(start, end)),
            metadata: {
              ...(campaign ? { campaignId: campaign.id } : {}),
              name: 'Synthetic HTTP handoff',
              sourceDate: '2026-10-07'
            }
          })
          const input = {
            previewId: preview.previewId,
            digest: preview.digest,
            revision: preview.revision,
            requestKey: randomUUID()
          }
          campaign = await read('/imports/commit', { method: 'POST', body: input }, 201)
          assert.deepEqual(await read('/imports/commit', { method: 'POST', body: input }, 201), campaign)
          revision = campaign.revision
        }
        assert.deepEqual(campaign.counts, {
          total: 1340,
          groups: [318, 276, 103, 351, 292],
          suppressed: 42,
          recheck: 1298
        })
        assert.equal(campaign.sourceDate, '2026-10-07')
        assert.equal(campaign.sendingEnabled, false)
        assert.equal(campaign.eligibleNow, null)
        assert.equal(Date.parse(campaign.expiresAt) - Date.parse(campaign.firstImportedAt), 30 * 86400000)
        const base = `/campaigns/${campaign.id}`
        const post = async (path, body) => {
          const value = await read(base + path, { method: 'POST', body })
          if (value.revision) revision = value.revision
          return value
        }
        const first = await post('/recipients/query', { limit: 100 })
        assert.equal(first.items.length, 100)
        assert.equal(first.total, 1340)
        const second = await post('/recipients/query', { limit: 100, cursor: first.nextCursor })
        assert.equal(second.items.length, 100)
        assert.equal(new Set([...first.items, ...second.items].map((r) => r.id)).size, 200)
        const filtered = await post('/recipients/query', {
          group: 'group_1',
          state: 'recheck',
          search: 'synthetic50@example.test',
          limit: 100
        })
        assert.equal(filtered.items.length, 1)
        const rid = filtered.items[0].id
        let detail = await read(`${base}/recipients/${rid}`)
        assert.deepEqual(detail.rawSource, { headers: fixture.headers, values: fixture.rows[50] })
        assert.equal(detail.rawSource.headers.length, 43)
        const unknownZip = await contentZip({ html: '<p>{{custom.opening}}</p><img src="images/logo.png">' })
        const unknown = await read(`${base}/templates/preview`, {
          method: 'POST',
          bytes: unknownZip,
          metadata: { group: 'group_1', subject: 'Synthetic', revision, requestKey: randomUUID() }
        })
        assert.deepEqual(unknown.unknownTokens, ['custom.opening'])
        assert.equal(
          (
            await request(`${base}/templates/commit`, {
              method: 'POST',
              body: { uploadId: unknown.uploadId, revision, requestKey: randomUUID() }
            })
          ).status,
          409
        )
        let registry = await read(`${base}/fields`)
        registry.fields.push({
          key: 'custom.opening',
          label: 'Opening',
          source: { kind: 'column', column: 'cong_ty' },
          missing: 'required'
        })
        await post('/fields', { revision, registry })
        const assets = []
        for (let group = 1; group <= 5; group++) {
          const preview = await read(`${base}/templates/preview`, {
            method: 'POST',
            bytes: unknownZip,
            metadata: {
              group: `group_${group}`,
              subject: `Synthetic group ${group} {{first_name}}`,
              revision,
              requestKey: randomUUID()
            }
          })
          await post('/templates/commit', { uploadId: preview.uploadId, revision, requestKey: randomUUID() })
          const saved = await read(`${base}/templates/group_${group}`)
          assert.equal(saved.version, 1)
          assert.equal(saved.subject, `Synthetic group ${group} {{first_name}}`)
          assets.push(saved.assets[0])
          const image = await request(`${base}/assets/${saved.assets[0].id}`)
          assert.equal(image.status, 200)
          assert.equal(image.headers.get('content-type'), 'image/png')
          assert.ok((await image.arrayBuffer()).byteLength > 0)
        }
        assert.equal(new Set(assets.map((a) => a.id)).size, 5)
        const rendered = await post('/content-preview', { group: 'group_1', recipientId: rid, revision })
        assert.ok(rendered.html.includes('&lt;script&gt;literal&lt;/script&gt;'))
        let cursor = null
        do {
          const generated = await post('/generate', {
            group: 'group_1',
            limit: 100,
            replaceExisting: false,
            revision,
            cursor
          })
          cursor = generated.nextCursor
        } while (cursor)
        detail = await read(`${base}/recipients/${rid}`)
        const custom = '<p>Customized synthetic handoff text.</p>'
        await post(`/recipients/${rid}/draft`, {
          subject: 'Synthetic personal subject',
          html: custom,
          text: 'Customized synthetic handoff text.',
          revision,
          draftRevision: detail.draft.revision
        })
        detail = await read(`${base}/recipients/${rid}`)
        await post(`/recipients/${rid}/approve`, { revision, draftRevision: detail.draft.revision })
        detail = await read(`${base}/recipients/${rid}`)
        assert.equal(detail.draft.contentApproved, true)
        assert.ok(detail.draft.html.includes(custom))
        registry = await read(`${base}/fields`)
        registry.fields.find((f) => f.key === 'custom.opening').source = { kind: 'manual' }
        registry.fields.find((f) => f.key === 'custom.opening').missing = 'default'
        registry.fields.find((f) => f.key === 'custom.opening').defaultValue = 'Changed synthetic source'
        await post('/fields', { revision, registry })
        detail = await read(`${base}/recipients/${rid}`)
        assert.equal(detail.draft.contentApproved, false)
        assert.equal(detail.draft.stale, true)
        assert.ok(detail.draft.html.includes(custom))
        assert.equal((await request(`${base}/simulate`, { method: 'POST', body: { revision } })).status, 404)
        assert.equal((await request(`${base}/send`, { method: 'POST', body: { revision } })).status, 404)
        assert.equal((await request(`${base}/assets/${assets[0].id}`, { role: 'developer' })).status, 403)
        await deps.pool.query('delete from seat_workspace where account_id=$1', [h.ids.owner])
        assert.equal((await request(`${base}/assets/${assets[0].id}`)).status, 403)
        assert.equal((await request(`${base}/recipients/${rid}`)).status, 403)
        await deps.pool.query(
          "update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second' where id=$1",
          [campaign.id]
        )
        assert.equal((await request(`${base}/assets/${assets[0].id}`, { role: 'admin' })).status, 410)
        assert.equal((await request(base, { role: 'admin' })).status, 410)
        assert.deepEqual(h.outbound, [])
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    })
)
