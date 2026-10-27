/**
 * A site key in an `/api/sites/{key}/…` path that is not text a site can be named by — a NUL, or a
 * percent-escape that decodes to nothing — is refused 400 `INVALID_SITE_KEY` by the alias
 * canonicaliser (`app.js`), before it reaches SQL. QA run 20/10/2026: `%00` answered 500 (Postgres
 * refuses a NUL in text) and `%FF` threw `URIError`.
 *
 *   TEST_DATABASE_URL=postgres://… node --test apps/tracy-web/test/site-key-encoding.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const ORIGIN = 'http://tracy.test'
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

function harness() {
  const config = readConfig(env)
  return buildApp({
    config,
    pool: db.pool,
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    sites: dbSitesResolver(db.pool, config),
    host: {
      hostCall: async () => ({ ok: false, status: 503, body: null }),
      hostJob: async () => ({ ok: false, status: 503, body: null })
    }
  })
}

test(
  '/api/sites/{key}: a NUL or a broken percent-escape in the key is 400 INVALID_SITE_KEY, not 500',
  opts,
  async () => {
    const app = harness()
    for (const key of ['a%00b', '%00', 'example.com%00', '%FF', '%FF%FE-x', '%E0%A4%A']) {
      const res = await app.fetch(new Request(`${ORIGIN}/api/sites/${key}/comments`))
      assert.equal(res.status, 400, `${key} answered ${res.status}`)
      assert.deepEqual(await res.json(), { code: 'INVALID_SITE_KEY' })
    }
    // A key that is text goes on to its door, which asks who is calling.
    const real = await app.fetch(new Request(`${ORIGIN}/api/sites/example.com/comments`))
    assert.equal(real.status, 401)
  }
)
