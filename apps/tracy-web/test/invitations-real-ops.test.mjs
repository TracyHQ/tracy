import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { withRealDb, syntheticSnapshot } from './_invitations-real.mjs'
import { realOps } from './_invitations-real-ops.mjs'
const opts = { skip: !process.env.TEST_DATABASE_URL }
test(
  'real Ops admission, developer aggregates, revocation and real sender remain separate from sandbox',
  opts,
  async () =>
    withRealDb(async (deps) => {
      const h = await realOps(deps)
      assert.equal((await h.request('', { role: null })).status, 401)
      const outsider = await h.request('', { role: 'outsider' })
      assert.equal(outsider.status, 403)
      assert.equal(await outsider.text(), '')
      const response = await h.request('/imports/preview', {
        method: 'POST',
        bytes: syntheticSnapshot({ total: 2, offset: 50 }).csvBytes,
        metadata: { name: 'Private synthetic campaign', sourceDate: '2026-10-07' }
      })
      assert.equal(response.status, 200)
      const p = await response.json()
      const committed = await h.request('/imports/commit', {
        method: 'POST',
        body: { previewId: p.previewId, digest: p.digest, revision: p.revision, requestKey: randomUUID() }
      })
      assert.equal(committed.status, 201)
      const c = await committed.json()
      assert.equal(c.sourceDate, '2026-10-07')
      assert.equal((await (await h.request(`/campaigns/${c.id}`)).json()).sourceDate, '2026-10-07')
      const developer = await h.request('', { role: 'developer' })
      assert.equal(developer.status, 200)
      const overview = await developer.json()
      assert.equal(overview.writable, false)
      assert.equal(overview.sendingEnabled, false)
      assert.equal(overview.campaigns[0].counts.total, 2)
      assert.equal(overview.campaigns[0].sourceDate, '2026-10-07')
      assert.equal(overview.campaigns[0].name, undefined)
      assert.ok(!JSON.stringify(overview).includes('synthetic50@example.test'))
      for (const path of ['/settings', `/campaigns/${c.id}`, `/campaigns/${c.id}/fields`])
        assert.equal((await h.request(path, { role: 'developer' })).status, 403)
      for (const action of ['send', 'simulate'])
        assert.equal(
          (
            await h.request(`/campaigns/${c.id}/${action}`, {
              method: 'POST',
              body: { revision: c.revision }
            })
          ).status,
          404
        )
      assert.equal(
        (await deps.pool.query('select count(*)::int n from invitations_sandbox_campaign')).rows[0].n,
        0
      )
      await deps.pool.query('update seat_workspace set revoked_at=clock_timestamp() where account_id=$1', [
        h.ids.owner
      ])
      const revoked = await h.request(`/campaigns/${c.id}`)
      assert.equal(revoked.status, 403)
      assert.equal(await revoked.text(), '')
      assert.deepEqual(h.outbound, [])
    })
)
test('real writes require same Origin and disabled or production real prefix stays closed', opts, async () =>
  withRealDb(async (deps) => {
    const h = await realOps(deps)
    for (const origin of [null, 'http://other.test']) {
      const r = await h.request('/settings', { method: 'POST', origin, body: { days: 60 } })
      assert.equal(r.status, 403)
    }
    assert.equal(
      (await h.request('/settings', { method: 'POST', role: 'developer', body: { days: 60 } })).status,
      403
    )
    assert.equal(
      (await h.request('/settings', { method: 'POST', role: 'admin', body: { days: 60 } })).status,
      200
    )
    assert.equal((await (await h.request('/settings')).json()).days, 60)
    for (const settings of [{ enabled: false }, { production: true }]) {
      const closed = await realOps({ ...deps, ...settings })
      assert.equal((await (await closed.request('')).json()).enabled, false)
      assert.equal((await closed.request('/settings')).status, 404)
      assert.equal(
        (
          await closed.request('/imports/preview', {
            method: 'POST',
            bytes: Buffer.from('Synthetic'),
            metadata: { name: 'Synthetic', sourceDate: '2026-10-07' }
          })
        ).status,
        404
      )
    }
    assert.deepEqual(h.outbound, [])
  })
)
