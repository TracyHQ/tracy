import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pg = { skip: !process.env.TEST_DATABASE_URL }
const origin = 'http://tracy.test'
function harness(enabled = true) {
  const config = readConfig({
    TRACY_ORIGIN: origin,
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k',
    TRACY_ENVIRONMENT: 'local',
    INVITATIONS_SANDBOX_ENABLED: enabled ? '1' : '0'
  })
  const app = buildApp({
    config,
    pool: db.pool,
    mail: {
      send: async () => {
        throw new Error('Sandbox must never send mail')
      }
    },
    sites: dbSitesResolver(db.pool, config)
  })
  const cookie = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const request = (path, session, input, requestOrigin = origin) =>
    app.fetch(
      new Request(`${origin}${path}`, {
        method: input ? 'POST' : 'GET',
        redirect: 'manual',
        headers: {
          ...(session ? { cookie: session } : {}),
          ...(input ? { 'content-type': 'application/json', origin: requestOrigin } : {})
        },
        ...(input ? { body: JSON.stringify(input) } : {})
      })
    )
  return { request, cookie }
}
async function staff() {
  const w = (
    await db.pool.query(
      "insert into workspace(display_name,kind) values('Sandbox Ops','tracy_admin') returning id"
    )
  ).rows[0].id
  const ids = {}
  for (const [email, role] of [
    ['owner@fixture.test', 'owner'],
    ['developer@fixture.test', 'developer']
  ]) {
    const id = (await db.pool.query('insert into account(email) values($1) returning id', [email])).rows[0].id
    await db.pool.query(
      'insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,$3,$2,now())',
      [w, id, role]
    )
    ids[role] = id
  }
  return ids
}
test('real session, accepted Ops seat, revocation and developer contact isolation', pg, async () => {
  const ids = await staff()
  const h = harness()
  const base = '/api/ops/invitations'
  assert.equal((await h.request(base)).status, 401)
  const outsider = await h.cookie('outsider@fixture.test')
  const denied = await h.request(base, outsider)
  assert.equal(denied.status, 403)
  assert.equal(await denied.text(), '')
  const owner = await h.cookie('owner@fixture.test')
  const developer = await h.cookie('developer@fixture.test')
  assert.equal((await (await h.request(`${base}/gmail`, owner)).json()).status, 'not_configured')
  assert.equal((await h.request(`${base}/gmail`, developer)).status, 403)
  const me = await h.request('/api/ops/me', owner)
  assert.equal(me.status, 200)
  assert.equal((await me.json()).role, 'owner')
  let result = await h.request(base, owner, { name: 'Sandbox fixture campaign' })
  assert.equal(result.status, 201)
  const campaign = await result.json()
  result = await h.request(`${base}/${campaign.id}`, owner)
  assert.equal(result.status, 200)
  result = await h.request(base, developer)
  assert.equal(result.status, 200)
  const overview = await result.json()
  assert.equal(overview.writable, false)
  assert.equal(overview.campaigns.length, 1)
  assert.equal(overview.campaigns[0].name, undefined)
  assert.equal(overview.campaigns[0].recipients, undefined)
  assert.equal(overview.campaigns[0].counts.recipients, 0)
  assert.equal((await h.request(`${base}/${campaign.id}`, developer)).status, 403)
  assert.equal((await h.request(base, developer, { name: 'Forbidden fixture' })).status, 403)
  await db.pool.query('update seat_workspace set revoked_at=now() where account_id=$1', [ids.owner])
  const revoked = await h.request(`${base}/${campaign.id}`, owner)
  assert.equal(revoked.status, 403)
  assert.equal(await revoked.text(), '')
  assert.equal((await h.request('/api/ops/me', owner)).status, 403)
})
test(
  'real CSRF rejects cross-origin writes and disabled prefix preserves Ops and login routes',
  pg,
  async () => {
    await staff()
    const h = harness()
    const owner = await h.cookie('owner@fixture.test')
    const denied = await h.request(
      '/api/ops/invitations',
      owner,
      { name: 'Sandbox fixture' },
      'http://other.test'
    )
    assert.equal(denied.status, 403)
    assert.equal(
      (await db.pool.query('select count(*)::int n from invitations_sandbox_campaign')).rows[0].n,
      0
    )
    const disabled = harness(false)
    assert.equal((await (await disabled.request('/api/ops/invitations', owner)).json()).enabled, false)
    assert.equal((await disabled.request('/api/ops/me', owner)).status, 200)
    const ops = await disabled.request('/ops')
    assert.equal(ops.status, 302)
    assert.ok(ops.headers.get('location').startsWith('/login'))
    const login = await disabled.request('/login')
    assert.equal(login.status, 200)
    assert.match(await login.text(), /<html/)
  }
)
