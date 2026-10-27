import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freshPool } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { pgIdentityStore } from '../src/identity/store.js'

test('local launch survives app restart, creates one account, and signout revokes its session', {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const db = await freshPool()
  try {
    const config = readConfig({
      TRACY_ORIGIN: 'http://localhost:8080',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(64),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://host',
      HOST_local_DSH_ORIGIN: 'http://dsh',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      TRACY_MODE: 'local',
      TRACY_ENVIRONMENT: 'local',
      LOCAL_ACCESS_SECRET: 'a'.repeat(64),
      LOCAL_INSTALLATION_ID: '12345678-1234-4123-8123-123456789abc',
      DATABASE_URL: db.url
    })
    let sent = 0
    const make = () =>
      buildApp({
        config,
        pool: db.pool,
        sites: dbSitesResolver(db.pool, config),
        identity: pgIdentityStore(db.pool),
        mail: {
          send: async () => {
            sent++
          }
        }
      })
    const app = make()
    const launch = await app.request(`${config.origin}/auth/local/launch`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.localAccess.secret}` }
    })
    assert.equal(launch.status, 200)
    const url = new URL((await launch.json()).url)
    const restarted = make()
    const exchange = () =>
      restarted.request(`${config.origin}/auth/local/exchange`, {
        method: 'POST',
        headers: { origin: config.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ code: url.hash.slice(1) })
      })
    const replies = await Promise.all([exchange(), exchange()])
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 401])
    const cookie = replies
      .find((r) => r.status === 200)
      .headers.get('set-cookie')
      .split(';')[0]
    const me = await restarted.request(`${config.origin}/auth/me`, { headers: { cookie } })
    assert.equal((await me.json()).email, `owner+${config.localAccess.installationId}@local.invalid`)
    const sites = await restarted.request(`${config.origin}/api/sites`, { headers: { cookie } })
    assert.equal(sites.status, 200)
    const accounts = await db.pool.query('select count(*)::int as n from account')
    assert.equal(accounts.rows[0].n, 1)
    assert.equal(sent, 0)
    const signout = await restarted.request(`${config.origin}/auth/signout`, {
      method: 'POST',
      headers: { cookie, origin: config.origin, 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(signout.status, 200)
    const after = await make().request(`${config.origin}/auth/me`, { headers: { cookie } })
    assert.equal((await after.json()).email, null)
    assert.equal((await exchange()).status, 401)
  } finally {
    await db.close()
  }
})
