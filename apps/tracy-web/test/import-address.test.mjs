import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { mintSession } from '../src/lib/session.js'
import * as seats from '../src/seats/store.js'
import { importAddressHandler, importJoinPath } from '../src/sites/import-address.js'

const config = { sessionSecret: 's'.repeat(32) }
const site = { site_key: 'example.com', label: 'example-com', owner_email: 'never-disclose@secret.test' }

async function probe({
  raw = 'example.com',
  found = site,
  account = { id: 7 },
  grant = null,
  job = false,
  signedIn = true
} = {}) {
  const queries = []
  const pool = {
    query: async (sql, values) => {
      queries.push({ sql, values })
      assert.match(sql, /^select /i, 'preflight must never write or claim')
      // The unfinished-import read (`lib/import-pending.js`): the row only while no build job stands.
      if (sql.includes('from site s') && sql.includes('from job j'))
        return { rows: found && !job ? [found] : [] }
      if (sql.includes('from site ')) return { rows: found ? [found] : [] }
      if (sql.includes('from account ')) return { rows: account ? [account] : [] }
      if (sql.includes('from seat')) {
        assert.match(sql, /accepted_at is not null/)
        assert.match(sql, /revoked_at is null/)
        assert.match(sql, /declined_at is null/)
        return { rows: grant ? [grant] : [] }
      }
      throw new Error('unexpected query')
    }
  }
  const app = new Hono()
  app.get('/api/sites/import-address', importAddressHandler(pool, config, seats))
  const cookie = signedIn ? `tracy_sess=${await mintSession('viewer@example.com', config.sessionSecret)}` : ''
  const result = await app.request(`/api/sites/import-address?siteKey=${encodeURIComponent(raw)}`, {
    headers: { cookie }
  })
  return { result, body: await result.json(), queries }
}

test('address ownership requires a session before any site lookup', async () => {
  const { result, body, queries } = await probe({ signedIn: false })
  assert.equal(result.status, 401)
  assert.deepEqual(body, { code: 'NOT_SIGNED_IN' })
  assert.equal(queries.length, 0)
})

test('a free address is read-only and responses are not cached', async () => {
  const { result, body, queries } = await probe({ found: null })
  assert.deepEqual(body, { ownership: 'available' })
  assert.equal(result.headers.get('cache-control'), 'no-store')
  assert.equal(queries.length, 1)
})

test('normalization looks up the same site and an accepted seat reports mine', async () => {
  const { body, queries } = await probe({ raw: 'https://WWW.EXAMPLE.COM/path/', grant: { role: 'editor' } })
  assert.deepEqual(queries[0].values, ['example.com'])
  assert.deepEqual(body, { ownership: 'mine' })
})

test('another account is reported without identity, only the actual safe join path', async () => {
  const { body } = await probe()
  assert.deepEqual(body, { ownership: 'other', joinPath: '/example-com/join' })
  assert.equal(JSON.stringify(body).includes('secret'), false)
  const noAccount = await probe({ account: null })
  assert.deepEqual(noAccount.body, body)
})

test('D1: an owned import claim without a build is available for another read', async () => {
  const { body } = await probe({ found: { ...site, origin: 'migrated' }, grant: { role: 'owner' } })
  assert.deepEqual(body, { ownership: 'available' })
})

test('D1: an imported site with a build remains in the account', async () => {
  const { body } = await probe({
    found: { ...site, origin: 'migrated' },
    grant: { role: 'owner' },
    job: true
  })
  assert.deepEqual(body, { ownership: 'mine' })
})

test('invalid and malformed input fails before querying, and unsafe labels yield no link', async () => {
  for (const raw of ['', 'not-a-domain', '%broken']) {
    const { result, queries } = await probe({ raw })
    assert.equal(result.status, 400)
    assert.equal(queries.length, 0)
  }
  for (const label of ['//evil.test', '../escape', 'a/b', 'a'.repeat(64), 'UPPER', '-bad'])
    assert.equal(importJoinPath({ label }), undefined)
  const { body } = await probe({ found: { ...site, label: '../escape' } })
  assert.deepEqual(body, { ownership: 'other' })
})
