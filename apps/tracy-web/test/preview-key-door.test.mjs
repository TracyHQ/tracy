// The preview-key door (#189): `tracy-site-tools` asks it for the key its page reads send while a brief build holds the
// conversation's site on its rebuilding page. The key comes back only for a seat on that site, only while the row says
// locked, and is never cached. Fictional businesses of two trades.
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshPool } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'component-actor-test-key'
}

const KEY = 'P'.repeat(48)

test('the preview key reaches the conversation of a seat on a locked site only', opts, async () => {
  const { pool, close } = await freshPool()
  try {
    const config = readConfig(env)
    const app = buildApp({ config, pool, mail: { send: async () => {} }, host: { hostCall, hostJob } })
    for (const [siteKey, label, email] of [
      ['kiln-pottery.localhost', 'kiln-pottery', 'potter@x.y'],
      ['harbour-yoga.localhost', 'harbour-yoga', 'teacher@x.y']
    ]) {
      await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [
        siteKey,
        label,
        'local'
      ])
      const { rows } = await pool.query('insert into account (email) values ($1) returning id', [email])
      await pool.query(
        `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())`,
        [siteKey, rows[0].id]
      )
      await pool.query(
        `insert into site_brief (site_key, platform, brief, timings) values ($1, 'joomla', '{}'::jsonb, $2::jsonb)`,
        [siteKey, JSON.stringify({ siteLock: { version: 1, state: 'locked', previewKey: KEY } })]
      )
    }
    const actor = (email) => {
      const payload = Buffer.from(
        JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })
      ).toString('base64url')
      return `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
    }
    const ask = async (email, label) => {
      const res = await app.fetch(
        new Request('http://tracy.test/api/sites/_conversation/preview-key', {
          headers: {
            'x-tracy-actor': actor(email),
            'x-tracy-workspace-label': label,
            'x-tracy-session': 'sess-1'
          }
        })
      )
      return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
    }
    const mine = await ask('potter@x.y', 'kiln-pottery')
    assert.equal(mine.status, 200)
    assert.deepEqual(mine.body, { key: KEY })
    assert.match(mine.cache, /no-store/)
    assert.equal((await ask('potter@x.y', 'harbour-yoga')).status, 403, 'no seat on that site')
    await pool.query(
      `update site_brief set timings = jsonb_build_object('siteLock', '{"version":1,"state":"unlocked"}'::jsonb)
        where site_key = 'kiln-pottery.localhost'`
    )
    assert.deepEqual((await ask('potter@x.y', 'kiln-pottery')).body, { key: null }, 'unlocked: no key')
  } finally {
    await close()
  }
})
