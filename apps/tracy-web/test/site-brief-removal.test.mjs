// #1749: a removed site takes its `site_brief` row with it, on every road that removes a site row. A row left
// behind outlived its site: a WO demo build that reused the key was refused `AGENT_DEMO_OTHER_WRITER`
// (`opportunities-build/handoff.js` reads any brief of the key as another writer). The table has no foreign key
// on purpose (a quality build writes its brief before the site row exists), so each removal deletes it itself,
// in the same statement as the site row; a brief whose site is not there (yet) is never touched.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { sweepClaims } from '../src/cron.js'
import { removeDemoSite } from '../src/lib/demo-sites.js'
import { deleteTornDownSite, PUBLISH_CODES } from '../src/sites/publish-store.js'
import { deleteSite } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

async function account() {
  return (await db.pool.query("insert into account (email) values ('o@x.y') returning id")).rows[0].id
}
async function site(label, accountId, { demo = false } = {}) {
  await db.pool.query(
    "insert into site (site_key, label, host, platform, origin, created_by, demo) values ($1, $2, 'local', 'emdash', 'fleet_born', $3, $4)",
    [`${label}.localhost`, label, accountId, demo]
  )
}
async function brief(label) {
  await db.pool.query(
    'insert into site_brief (site_key, platform, brief) values ($1, \'emdash\', \'{"about":"A cafe"}\'::jsonb)',
    [`${label}.localhost`]
  )
}
const briefs = async () =>
  (await db.pool.query('select site_key from site_brief order by site_key')).rows.map((r) => r.site_key)

test(
  'Remove (deleteSite): the site row and its brief go together; a brief of a site not made yet stays',
  opts,
  async () => {
    const id = await account()
    await site('gone', id)
    await brief('gone')
    await brief('coming')
    await deleteSite(db.pool, 'gone.localhost')
    assert.deepEqual(await briefs(), ['coming.localhost'])
    await deleteSite(db.pool, 'coming.localhost')
    assert.deepEqual(await briefs(), ['coming.localhost'], 'no site row removed, no brief removed')
  }
)

test('a torn-down site (deleteTornDownSite) takes its brief with it', opts, async () => {
  const id = await account()
  await site('torn', id)
  await brief('torn')
  await db.pool.query(
    "insert into site_publish_op (site_key, op, state, ref, code) values ('torn.localhost', 'delete', 'running', 'r1', $1)",
    [PUBLISH_CODES.tornDown]
  )
  assert.equal(await deleteTornDownSite(db.pool, { siteKey: 'torn.localhost', ref: 'r1' }), true)
  assert.deepEqual(await briefs(), [])
})

test(
  'a forgotten demo (removeDemoSite) takes its brief with it; a site that is not a demo keeps both',
  opts,
  async () => {
    const id = await account()
    await site('demo', id, { demo: true })
    await site('real', id)
    await brief('demo')
    await brief('real')
    assert.equal(await removeDemoSite(db.pool, 'demo.localhost'), true)
    assert.equal(await removeDemoSite(db.pool, 'real.localhost'), false)
    assert.deepEqual(await briefs(), ['real.localhost'])
  }
)

test('a stale claim the sweep gives back (sweepClaims) takes its brief with it', opts, async () => {
  const id = await account()
  await site('claim', id)
  await brief('claim')
  await db.pool.query(
    "insert into site_creation (account_id, build_id, payload_hash, state, site_key, updated_at) values ($1, 'b', 'h', 'claimed', 'claim.localhost', now() - interval '30 hours')",
    [id]
  )
  const hostCall = async () => ({ ok: true, status: 200, body: { ok: true, removed: true } })
  const result = await sweepClaims(
    db.pool,
    { hosts: new Map() },
    { hostCall, log: { warn() {}, error() {} } }
  )
  assert.deepEqual(result.released, ['claim.localhost'])
  assert.deepEqual(await briefs(), [])
})
