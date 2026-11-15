// Handover (`opportunities-build/handover.js`, `POST /api/website-opportunities/builds/:buildId/handover`): one press
// hands a demo site to its business owner through the doors Tracy already has (Team invite, the Team table's role
// change, the demo clock, the site address door), each step idempotent and reported. Real Postgres; the seat and address
// doors are answered by a stand-in that records what the builder asked them, so no letter or host call goes out.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { keepDemo, startDemoClock, touchDemo } from '../src/opportunities-build/demo-retention.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'http://tracy.test:8080'
const BASE = '/api/website-opportunities'
const AGENCY = 'agency@tracy.test'
const OWNER = 'owner@pho-ba.example'
const DAY = 86_400_000

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

let seq = 0
async function account(pool, email) {
  return (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

/** One demo build of `accountId` with a site and a running clock (or the columns given). */
async function demo(
  pool,
  accountId,
  {
    siteKey = `demo${++seq}.localhost`,
    expires = Date.now() + 14 * DAY,
    frozen = null,
    deleted = null,
    withSite = true
  } = {}
) {
  const n = ++seq
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, 'Pho Ba', 'osm', $2) returning id`,
      [accountId, `n/${n}`]
    )
  ).rows[0].id
  const rev = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
       values ($1, $2, 1, '{}'::jsonb, 'Pho Ba') returning id`,
      [opp, accountId]
    )
  ).rows[0].id
  if (withSite)
    await pool.query(
      `insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'joomla')`,
      [siteKey, siteKey.split('.')[0]]
    )
  const id = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, state,
         demo_expires_at, demo_frozen_at, demo_deleted_at, choice, choice_key)
       values ($1, $2, $3, gen_random_uuid(), $4, 'done', $5, $6, $7,
         '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb,
         'fixture') returning id`,
      [
        accountId,
        rev,
        `req-${n}`,
        withSite ? siteKey : null,
        expires === null ? null : new Date(expires),
        frozen === null ? null : new Date(frozen),
        deleted === null ? null : new Date(deleted)
      ]
    )
  ).rows[0].id
  return { id, siteKey, opp }
}

/**
 * The app with the builder's requests answered by a stand-in for the Team and address doors: `team` is the site's book
 * as `GET /api/team` lists it; `state` turns a door's refusal on.
 */
async function world() {
  const { pool } = db
  const config = readConfig(env)
  const calls = []
  const team = new Map() // siteKey → seats
  const state = { inviteRefusal: null, patchRefusal: null, address: null }
  const seatsOf = (siteKey) => team.get(siteKey) ?? []
  const request = async (path, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ path, method, body, headers: init.headers ?? {} })
    if (path === '/api/team' && method === 'GET')
      return Response.json({
        sites: [...team.keys()].map((siteKey) => ({
          siteKey,
          myRole: 'owner',
          status: 'accepted',
          seats: seatsOf(siteKey)
        }))
      })
    if (path === '/api/team/invite' && method === 'POST') {
      if (state.inviteRefusal) return Response.json({ code: state.inviteRefusal }, { status: 429 })
      const [siteKey] = body.siteKeys
      seatsOf(siteKey).push({ id: randomUUID(), email: body.emails[0], role: body.role, status: 'invited' })
      return Response.json({
        results: [{ email: body.emails[0], notified: true, sites: [{ siteKey, outcome: 'invited' }] }]
      })
    }
    const seat = path.match(/^\/api\/sites\/([^/]+)\/seats\/([^/]+)$/)
    if (seat && method === 'PATCH') {
      if (state.patchRefusal) return Response.json({ code: state.patchRefusal }, { status: 403 })
      const row = seatsOf(decodeURIComponent(seat[1])).find((s) => s.id === decodeURIComponent(seat[2]))
      if (!row) return Response.json({ code: 'GRANT_UNKNOWN' }, { status: 404 })
      row.role = body.role
      return Response.json({ id: row.id, role: row.role })
    }
    if (/^\/api\/sites\/[^/]+\/address$/.test(path) && method === 'PUT') {
      if (state.address) return Response.json(state.address.body, { status: state.address.status })
      return Response.json(
        { state: 'pending', pending: { name: body.name, records: [{ type: 'CNAME', name: body.name }] } },
        { status: 202 }
      )
    }
    return Response.json({ code: 'UNEXPECTED' }, { status: 500 })
  }
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    websiteOpportunitiesRequest: request,
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  const setSwitch = (on) =>
    pool.query(
      `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
       on conflict (id) do update set overrides = excluded.overrides`,
      [JSON.stringify({ 'website-opportunities': on })]
    )
  await setSwitch(true)
  const press = async (email, buildId, body) => {
    const res = await app.fetch(
      new Request(`${ORIGIN}${BASE}/builds/${buildId}/handover`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`
        },
        body: JSON.stringify(body)
      })
    )
    return { status: res.status, body: await res.json() }
  }
  return { pool, app, calls, team, state, press, setSwitch }
}

const stepsOf = (answer) => answer.body.handover.steps.map((s) => [s.step, s.state, s.reason])
const clock = async (pool, id) =>
  (
    await pool.query('select demo_expires_at, demo_frozen_at, demo_touched_at from wo_build where id = $1', [
      id
    ])
  ).rows[0]

test(
  'the first press invites the owner, keeps the demo for good and waits for them to accept before Owner',
  opts,
  async () => {
    const w = await world()
    const build = await demo(w.pool, await account(w.pool, AGENCY))
    w.team.set(build.siteKey, [])
    const answer = await w.press(AGENCY, build.id, { email: ' Owner@Pho-Ba.example ' })
    assert.equal(answer.status, 200)
    assert.deepEqual(stepsOf(answer), [
      ['team_invite', 'done', 'INVITED'],
      ['owner_role', 'skipped', 'INVITE_PENDING'],
      ['keep_demo', 'done', 'KEPT'],
      ['domain', 'skipped', 'NOT_ASKED']
    ])
    assert.equal(answer.body.handover.email, OWNER)
    assert.equal(answer.body.handover.siteKey, build.siteKey)
    assert.equal(answer.body.handover.complete, false, 'the owner is not an Owner yet')
    // 🔒 ADR 0028: invited as an Editor, the highest role an invitation carries; the caller's own session asked it.
    const invite = w.calls.find((c) => c.path === '/api/team/invite')
    assert.deepEqual(invite.body, { emails: [OWNER], role: 'editor', siteKeys: [build.siteKey] })
    assert.match(invite.headers.cookie, /^tracy_sess=/)
    assert.equal(invite.headers.origin, ORIGIN)
    assert.equal(
      w.calls.filter((c) => c.method === 'PATCH').length,
      0,
      'no Owner role on an unanswered invitation'
    )
    const kept = await clock(w.pool, build.id)
    assert.equal(kept.demo_expires_at, null, 'kept for good')
    assert.ok(kept.demo_touched_at)
    // Kept is kept: the clock does not start again, a touch gives it no expiry.
    const settings = { ...DEFAULT_WO_OPS_SETTINGS }
    assert.equal(await startDemoClock(w.pool, build.id, { now: Date.now(), settings }), null)
    assert.equal(await touchDemo(w.pool, build.id, { now: Date.now(), settings }), null)
    assert.equal((await clock(w.pool, build.id)).demo_expires_at, null)
  }
)

test(
  'pressed again once the owner accepted: no second letter, Owner role, the domain connected',
  opts,
  async () => {
    const w = await world()
    const build = await demo(w.pool, await account(w.pool, AGENCY))
    w.team.set(build.siteKey, [])
    await w.press(AGENCY, build.id, { email: OWNER })
    w.team.get(build.siteKey)[0].status = 'active'
    const again = await w.press(AGENCY, build.id, { email: OWNER, domain: 'Pho-Ba.example' })
    assert.equal(again.status, 200)
    assert.deepEqual(stepsOf(again), [
      ['team_invite', 'skipped', 'ALREADY_ON_TEAM'],
      ['owner_role', 'done', 'PROMOTED'],
      ['keep_demo', 'skipped', 'ALREADY_KEPT'],
      ['domain', 'done', 'DNS_PENDING']
    ])
    assert.equal(again.body.handover.complete, true)
    assert.equal(w.calls.filter((c) => c.path === '/api/team/invite').length, 1, 'one invitation in all')
    const patch = w.calls.find((c) => c.method === 'PATCH')
    assert.deepEqual(patch.body, { role: 'owner' })
    const address = w.calls.find((c) => c.method === 'PUT')
    assert.deepEqual(address.body, { name: 'pho-ba.example', kind: 'custom' })
    assert.deepEqual(again.body.handover.steps[3].detail.pending.name, 'pho-ba.example')
    // A third press changes nothing and says so.
    w.state.address = { status: 200, body: { state: 'active', primaryName: 'pho-ba.example' } }
    const third = await w.press(AGENCY, build.id, { email: OWNER, domain: 'pho-ba.example' })
    assert.deepEqual(stepsOf(third), [
      ['team_invite', 'skipped', 'ALREADY_ON_TEAM'],
      ['owner_role', 'skipped', 'ALREADY_OWNER'],
      ['keep_demo', 'skipped', 'ALREADY_KEPT'],
      ['domain', 'skipped', 'ALREADY_CONNECTED']
    ])
    assert.equal(third.body.handover.complete, true)
    assert.equal(w.calls.filter((c) => c.method === 'PATCH').length, 1)
  }
)

test(
  'a failed step is reported (207) and nothing that depends on it runs: the demo keeps its clock',
  opts,
  async () => {
    const w = await world()
    const build = await demo(w.pool, await account(w.pool, AGENCY))
    w.team.set(build.siteKey, [])
    const before = await clock(w.pool, build.id)
    w.state.inviteRefusal = 'RATE_LIMITED'
    const answer = await w.press(AGENCY, build.id, { email: OWNER, domain: 'pho-ba.example' })
    assert.equal(answer.status, 207)
    assert.deepEqual(stepsOf(answer), [
      ['team_invite', 'failed', 'RATE_LIMITED'],
      ['owner_role', 'skipped', 'INVITE_FAILED'],
      ['keep_demo', 'skipped', 'INVITE_FAILED'],
      ['domain', 'skipped', 'DEMO_NOT_KEPT']
    ])
    assert.equal(answer.body.handover.complete, false)
    assert.deepEqual(await clock(w.pool, build.id), before)
    // The Owner role refused after the owner joined: that step fails, the others still run.
    w.state.inviteRefusal = null
    w.team.get(build.siteKey).push({ id: randomUUID(), email: OWNER, role: 'editor', status: 'active' })
    w.state.patchRefusal = 'NOT_SITE_OWNER'
    const partial = await w.press(AGENCY, build.id, { email: OWNER })
    assert.equal(partial.status, 207)
    assert.deepEqual(stepsOf(partial), [
      ['team_invite', 'skipped', 'ALREADY_ON_TEAM'],
      ['owner_role', 'failed', 'NOT_SITE_OWNER'],
      ['keep_demo', 'done', 'KEPT'],
      ['domain', 'skipped', 'NOT_ASKED']
    ])
  }
)

test(
  'a deployment that cannot connect a domain answers that step not_available, never a made-up success',
  opts,
  async () => {
    const w = await world()
    const build = await demo(w.pool, await account(w.pool, AGENCY))
    w.team.set(build.siteKey, [{ id: randomUUID(), email: OWNER, role: 'owner', status: 'active' }])
    w.state.address = { status: 403, body: { code: 'OWN_DOMAIN_DISABLED' } }
    const off = await w.press(AGENCY, build.id, { email: OWNER, domain: 'pho-ba.example' })
    assert.equal(off.status, 200)
    assert.deepEqual(off.body.handover.steps.at(-1), {
      step: 'domain',
      state: 'not_available',
      reason: 'OWN_DOMAIN_DISABLED'
    })
    assert.equal(off.body.handover.complete, false)
    w.state.address = { status: 409, body: { code: 'DOMAIN_TAKEN' } }
    const taken = await w.press(AGENCY, build.id, { email: OWNER, domain: 'pho-ba.example' })
    assert.equal(taken.status, 207)
    assert.deepEqual(taken.body.handover.steps.at(-1).state, 'failed')
    assert.deepEqual(taken.body.handover.steps.at(-1).reason, 'DOMAIN_TAKEN')
  }
)

test('only the build’s own account, a live demo, and a well-formed body', opts, async () => {
  const w = await world()
  const mine = await account(w.pool, AGENCY)
  await account(w.pool, 'other@tracy.test')
  const build = await demo(w.pool, mine)
  w.team.set(build.siteKey, [])
  const stranger = await w.press('other@tracy.test', build.id, { email: OWNER })
  assert.equal(stranger.status, 404)
  assert.equal((await w.press(AGENCY, randomUUID(), { email: OWNER })).status, 404)
  assert.equal((await w.press(AGENCY, build.id, { email: 'not-an-email' })).body.code, 'INVALID_EMAIL')
  assert.equal(
    (await w.press(AGENCY, build.id, { email: OWNER, role: 'owner' })).body.code,
    'INVALID_REQUEST'
  )
  assert.equal((await w.press(AGENCY, build.id, { email: OWNER, domain: 7 })).body.code, 'INVALID_DOMAIN')
  assert.equal((await w.press(AGENCY, build.id, { email: AGENCY })).body.code, 'HANDOVER_TO_SELF')
  const frozen = await demo(w.pool, mine, { frozen: Date.now() - DAY })
  assert.equal((await w.press(AGENCY, frozen.id, { email: OWNER })).body.code, 'DEMO_FROZEN')
  const gone = await demo(w.pool, mine, { deleted: Date.now() - DAY })
  assert.equal((await w.press(AGENCY, gone.id, { email: OWNER })).body.code, 'DEMO_DELETED')
  const unbuilt = await demo(w.pool, mine, { withSite: false, expires: null })
  assert.equal((await w.press(AGENCY, unbuilt.id, { email: OWNER })).body.code, 'NO_DEMO')
  await w.setSwitch(false)
  assert.equal((await w.press(AGENCY, build.id, { email: OWNER })).body.code, 'FEATURE_OFF')
  assert.equal(w.calls.length, 0, 'no refused press asked any door')
})

test(
  'keepDemo: kept once, already kept after, gone for a deleted demo; a frozen demo is thawed',
  opts,
  async () => {
    const { pool } = db
    const acc = await account(pool, AGENCY)
    const live = await demo(pool, acc)
    assert.equal((await keepDemo(pool, live.id, { now: Date.now() })).state, 'kept')
    assert.equal((await keepDemo(pool, live.id, { now: Date.now() })).state, 'already')
    const frozen = await demo(pool, acc, { frozen: Date.now() - DAY })
    assert.equal((await keepDemo(pool, frozen.id, { now: Date.now() })).state, 'kept')
    assert.equal((await clock(pool, frozen.id)).demo_frozen_at, null)
    const gone = await demo(pool, acc, { deleted: Date.now() - DAY })
    assert.equal((await keepDemo(pool, gone.id, { now: Date.now() })).state, 'gone')
  }
)
