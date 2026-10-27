/**
 * One logical build per press — `POST /api/sites` with a `buildId` (plan
 * first-site-build-onboarding §5, cases B02–B04). Every case here fails against the door as it
 * stood on 13/09: a second request for a name the caller owned was answered `alreadyMine` and
 * provisioned AGAIN, so a double press, a reload, or a lost response started a second
 * `provision.sh` over the same webroot.
 *
 * The fake host records every `/_host/provision` it sees and answers a job id derived from the
 * `jobKey` it was sent, the way `tracy-host` now does (`keyedJobId`) — so the count of provision
 * calls IS the count of attempts.
 */

import assert from 'node:assert/strict'
import pg from 'pg'
import { test, after, before, beforeEach } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { saveDesignSystemsShown } from '../src/lib/design-systems-setting.js'
import { mintSession } from '../src/lib/session.js'
import { createSiteContent } from '../src/opportunities-build/site-content.js'
import { createBuildDesignSystems } from '../src/sites/design-system-at-create.js'
import { buildDesignSystemStore } from '../src/sites/design-system-at-create-store.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'
import { answerTeardown } from './_host-teardown.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

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
  SEAT_local_SECRET: 'k'
}

const BUILD = '11111111-2222-4333-8444-555555555555'

/** A host that keys its jobs like the real one, and whose job state a test can set. */
function fakeHost() {
  const provisions = []
  let markProvisionStarted
  const provisionStarted = new Promise((resolve) => {
    markProvisionStarted = resolve
  })
  const jobs = new Map()
  let refuse = false
  let hang = null
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    const teardown = answerTeardown(input, init)
    if (teardown) return teardown
    if (u.pathname === '/_host/provision') {
      const body = JSON.parse(init.body)
      provisions.push(body)
      markProvisionStarted()
      if (refuse) return new Response(JSON.stringify({ code: 'FLEET_REFUSED' }), { status: 502 })
      if (hang) await hang
      const id = body.jobKey ? `k-${body.jobKey}` : `r-${provisions.length}`
      if (!jobs.has(id)) jobs.set(id, { state: 'running' })
      return new Response(JSON.stringify({ jobId: id }), { status: 200 })
    }
    if (u.pathname.startsWith('/_host/jobs/')) {
      const job = jobs.get(u.pathname.slice('/_host/jobs/'.length))
      return new Response(JSON.stringify(job ?? { state: 'unknown' }), { status: job ? 200 : 404 })
    }
    if (u.pathname === '/_host/attach') return new Response(JSON.stringify({ lane: 'ok' }), { status: 200 })
    return new Response(null, { status: 404 })
  }
  return {
    provisions,
    provisionStarted,
    jobs,
    fetchImpl,
    refuse: (v) => {
      refuse = v
    },
    hangOn: (p) => {
      hang = p
    }
  }
}

function harness(pool, fetchImpl, overrides = {}, deps = {}) {
  const config = readConfig({ ...env, ...overrides })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl,
    ...deps
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const post = (path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    )
  const get = (path, cookie) => app.fetch(new Request(`http://tracy.test${path}`, { headers: { cookie } }))
  const del = (path, cookie) =>
    app.fetch(new Request(`http://tracy.test${path}`, { method: 'DELETE', headers: { cookie } }))
  return { cookieFor, post, get, del }
}

test('the create door commits WO identity before starting the brief engine', opts, async () => {
  const { pool } = db
  const account = (
    await pool.query("insert into account(email) values ('wo-owner@example.test') returning id")
  ).rows[0].id
  const opportunity = (
    await pool.query(
      "insert into wo_opportunity(account_id,name,provider,provider_id,candidate) values ($1,'Pho','url','https://pho.example','{}') returning id",
      [account]
    )
  ).rows[0].id
  const revision = (
    await pool.query(
      "insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest) values ($1,$2,1,'{}','','[]') returning id",
      [opportunity, account]
    )
  ).rows[0].id
  await pool.query(
    `insert into wo_build (account_id,revision_id,request_id,build_id, choice, choice_key) values ($1,$2,'identity-test',$3, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture')`,
    [account, revision, BUILD]
  )
  let observed = false
  const host = fakeHost()
  const { cookieFor, post } = harness(
    pool,
    host.fetchImpl,
    {},
    {
      briefs: {
        async start(input) {
          assert.equal(
            await createSiteContent({ pool }).isOpportunity({ siteKey: input.siteKey, email: input.email }),
            true
          )
          observed = true
          return { started: true }
        }
      }
    }
  )
  const response = await post('/api/sites', await cookieFor('wo-owner@example.test'), {
    label: 'pho-house',
    platform: 'wordpress',
    buildId: BUILD,
    brief: { about: 'A restaurant in Hoi An.', goal: null, style: null }
  })
  assert.equal(response.status, 202, await response.text())
  assert.equal(observed, true)
})

test(
  'B02: the same press asked again — double click, reload, lost response — is ONE site, ONE owner seat, ONE provision',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const want = { label: 'lantern', platform: 'wordpress', buildId: BUILD }
    const first = await post('/api/sites', a, want)
    assert.equal(first.status, 202)
    const one = await first.json()
    assert.equal(one.siteKey, 'lantern.localhost')
    assert.equal(one.buildId, BUILD)
    assert.equal(one.attempt, 1)
    assert.ok(host.provisions.at(-1).jobKey.endsWith(`:${BUILD}:1`))

    // The response was lost; the tab asks again. Same site, same job, no second provision.
    for (let i = 0; i < 3; i++) {
      const again = await post('/api/sites', a, want)
      assert.equal(again.status, 202)
      const body = await again.json()
      assert.equal(body.siteKey, one.siteKey)
      assert.equal(body.jobId, one.jobId)
      assert.equal(body.reused, true)
    }
    assert.equal(host.provisions.length, 1)
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 1)
    assert.equal((await pool.query("select count(*)::int as n from seat where role = 'owner'")).rows[0].n, 1)
    assert.equal((await pool.query('select count(*)::int as n from job')).rows[0].n, 1)
    const row = (await pool.query('select * from site_creation')).rows[0]
    assert.equal(row.state, 'provisioning')
    assert.equal(row.job_id, one.jobId)
    assert.equal(row.attempt, 1)
  }
)

test(
  'B02: same build id, different payload — a conflict, and nothing provisioned for the second shape',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    assert.equal(
      (await post('/api/sites', a, { label: 'lantern', platform: 'wordpress', buildId: BUILD })).status,
      202
    )
    const other = await post('/api/sites', a, { label: 'beacon', platform: 'wordpress', buildId: BUILD })
    assert.equal(other.status, 409)
    const body = await other.json()
    assert.equal(body.code, 'IDEMPOTENCY_CONFLICT')
    assert.equal(body.siteKey, 'lantern.localhost')
    assert.equal(host.provisions.length, 1)
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 1)
    // A malformed id is refused before anything is claimed.
    const bad = await post('/api/sites', a, {
      label: 'beacon',
      platform: 'wordpress',
      buildId: 'not-a-uuid'
    })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).code, 'INVALID_BUILD_ID')
  }
)

test(
  "B02: two accounts may use the same build id — they are two builds; and B's id never reads A's site",
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const b = await cookieFor('b@x.y')
    assert.equal(
      (await post('/api/sites', a, { label: 'lantern', platform: 'wordpress', buildId: BUILD })).status,
      202
    )
    const bs = await post('/api/sites', b, { label: 'beacon', platform: 'wordpress', buildId: BUILD })
    assert.equal(bs.status, 202)
    assert.equal((await bs.json()).siteKey, 'beacon.localhost')
    assert.equal(host.provisions.length, 2)
    // B asking for A's name under B's own build id: A owns it — taken, and B's claim is left refused.
    const taken = await post('/api/sites', b, {
      label: 'lantern',
      platform: 'wordpress',
      buildId: '22222222-2222-4333-8444-555555555555'
    })
    assert.equal(taken.status, 409)
    assert.equal((await taken.json()).code, 'TAKEN')
    assert.equal(host.provisions.length, 2)
  }
)

test(
  "B04: two requests race the same claim — the second waits (CREATE_PENDING) and is then handed the first's job",
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    let release
    host.hangOn(new Promise((r) => (release = r)))
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const want = { label: 'lantern', platform: 'joomla', buildId: BUILD }
    const first = post('/api/sites', a, want)
    // Let the first request reach the host (it is now hanging there) before the second arrives.
    await host.provisionStarted
    assert.equal(host.provisions.length, 1)
    const second = await post('/api/sites', a, want)
    assert.equal(second.status, 202)
    const pending = await second.json()
    assert.equal(pending.code, 'CREATE_PENDING')
    assert.equal(pending.buildId, BUILD)
    assert.equal(pending.siteKey, 'lantern.localhost')
    release()
    const one = await (await first).json()
    assert.ok(one.jobId)
    const third = await (await post('/api/sites', a, want)).json()
    assert.equal(third.jobId, one.jobId)
    assert.equal(third.reused, true)
    assert.equal(host.provisions.length, 1)
  }
)

test(
  'B04: a claim that died before the host answered is taken over after it goes stale — one site, one provision',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const want = { label: 'lantern', platform: 'wordpress', buildId: BUILD }
    // A crash after the site row and the owner seat, before the host was ever reached: the
    // creation row stands `claiming`, no job, stamped in the past.
    const { rows } = await pool.query('insert into account (email) values ($1) returning id', ['a@x.y'])
    await pool.query(
      `insert into site_creation (account_id, build_id, payload_hash, state, updated_at)
     values ($1, $2, 'x', 'claiming', now() - interval '5 minutes')`,
      [rows[0].id, BUILD]
    )
    // The hash the door computes for this payload is not 'x' — write the real one by asking once
    // with a fresh id, then copying it over, so the stale row is a genuine earlier attempt.
    const probe = await (
      await post('/api/sites', a, { ...want, buildId: '33333333-2222-4333-8444-555555555555' })
    ).json()
    assert.ok(probe.jobId)
    const hash = (
      await pool.query(
        "select payload_hash from site_creation where build_id = '33333333-2222-4333-8444-555555555555'"
      )
    ).rows[0].payload_hash
    await pool.query('update site_creation set payload_hash = $1 where build_id = $2', [hash, BUILD])
    host.provisions.length = 0
    await pool.query('delete from job')
    await pool.query("delete from site_creation where build_id = '33333333-2222-4333-8444-555555555555'")

    const res = await post('/api/sites', a, want)
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.siteKey, 'lantern.localhost')
    assert.equal(body.attempt, 1)
    assert.equal(host.provisions.length, 1)
    assert.ok(host.provisions[0].jobKey.endsWith(`:${BUILD}:1`))
    const row = (await pool.query('select * from site_creation where build_id = $1', [BUILD])).rows[0]
    assert.equal(row.state, 'provisioning')
    assert.equal(
      (await pool.query("select count(*)::int as n from site where site_key = 'lantern.localhost'")).rows[0]
        .n,
      1
    )
  }
)

test(
  'B05: a FAILED attempt, asked again, is attempt 2 of the same build — same site, a new host job, never a second site',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post, get } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const want = { label: 'lantern', platform: 'wordpress', buildId: BUILD }
    const one = await (await post('/api/sites', a, want)).json()
    // The fleet fails it; the tab polls and learns so (the poll writes the state on the job row).
    host.jobs.get(one.jobId).state = 'failed'
    const polled = await get(`/api/sites/${one.siteKey}/jobs/${one.jobId}`, a)
    assert.equal((await polled.json()).state, 'failed')
    // Retry: the same press again.
    const two = await (await post('/api/sites', a, want)).json()
    assert.equal(two.siteKey, one.siteKey)
    assert.notEqual(two.jobId, one.jobId)
    assert.equal(two.attempt, 2)
    assert.equal(host.provisions.length, 2)
    assert.ok(host.provisions[1].jobKey.endsWith(`:${BUILD}:2`))
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 1)
    assert.equal((await pool.query("select count(*)::int as n from seat where role = 'owner'")).rows[0].n, 1)
    // And asked once more while attempt 2 runs: attempt 2, again.
    const again = await (await post('/api/sites', a, want)).json()
    assert.equal(again.jobId, two.jobId)
    assert.equal(host.provisions.length, 2)
  }
)

test(
  'B04: the host refusing the job leaves the claim refused, and the next request with the same id tries again at once',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const want = { label: 'lantern', platform: 'wordpress', buildId: BUILD }
    host.refuse(true)
    const refused = await post('/api/sites', a, want)
    assert.equal(refused.status, 502)
    assert.equal((await pool.query('select state from site_creation')).rows[0].state, 'refused')
    host.refuse(false)
    const ok = await post('/api/sites', a, want)
    assert.equal(ok.status, 202)
    assert.equal((await ok.json()).siteKey, 'lantern.localhost')
    assert.equal(host.provisions.length, 2)
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 1)
  }
)

test(
  'B03: a stale design revision is refused BEFORE any claim is written — the answers keep their id for the next press',
  opts,
  async () => {
    const { pool } = db
    // `apple` named by id is a library design: the operator's switch is on, as before there was one.
    await saveDesignSystemsShown(pool, true, 'ops@x.y')
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const stale = await post('/api/sites', a, {
      label: 'lantern',
      platform: 'joomla',
      buildId: BUILD,
      design: 'apple',
      designRevision: 'not-the-revision'
    })
    assert.equal(stale.status, 409)
    const body = await stale.json()
    assert.equal(body.code, 'DESIGN_PLAN_CHANGED')
    assert.ok(body.plan?.registryRevision)
    assert.equal((await pool.query('select count(*)::int as n from site_creation')).rows[0].n, 0)
    assert.equal(host.provisions.length, 0)
    // Pressing again with the revision the answer carried claims the build under the same id.
    const fresh = await post('/api/sites', a, {
      label: 'lantern',
      platform: 'joomla',
      buildId: BUILD,
      design: 'apple',
      designRevision: body.plan.registryRevision
    })
    assert.equal(fresh.status, 202)
    assert.equal((await fresh.json()).buildId, BUILD)
  }
)

test('without a buildId repeated requests still share one logical provision', opts, async () => {
  const { pool } = db
  const host = fakeHost()
  const { cookieFor, post } = harness(pool, host.fetchImpl)
  const a = await cookieFor('a@x.y')
  assert.equal((await post('/api/sites', a, { label: 'lantern', platform: 'wordpress' })).status, 202)
  assert.equal((await post('/api/sites', a, { label: 'lantern', platform: 'wordpress' })).status, 202)
  assert.equal(host.provisions.length, 1)
  assert.ok(host.provisions[0].jobKey.includes(':legacy:lantern.localhost:1'))
  assert.equal((await pool.query('select count(*)::int as n from site_creation')).rows[0].n, 1)
})

test(
  'the press keeps the questionnaire it answers — the sweep that finishes it has no form to ask',
  opts,
  async () => {
    // 🔒 Measured 23/09/2026 on the local stand: a press written without its questionnaire was
    // finished by the sweep into a brief that named no set, with an answer to a HIDDEN question
    // still in it, because the server evaluator only runs when the snapshot comes along.
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const questionnaire = {
      set: { id: 'tracy-business/wp7#gen-x', revision: 1, contentHash: 'b'.repeat(64) },
      questions: [{ id: 'name', kind: 'text', label: 'Name', required: true }]
    }
    const res = await post('/api/sites', a, {
      label: 'lantern',
      platform: 'wordpress',
      buildId: BUILD,
      press: { id: 'apple', answers: { name: 'Lantern' }, questionnaire }
    })
    assert.equal(res.status, 202)
    const { press } = (await pool.query('select press from site_creation')).rows[0]
    assert.deepEqual(press.questionnaire, questionnaire)
    assert.deepEqual(press.answers, { name: 'Lantern' })

    // A press from a form that had no questionnaire to send keeps no key for one.
    const other = '22222222-3333-4444-8555-666666666666'
    await post('/api/sites', a, {
      label: 'beacon',
      platform: 'wordpress',
      buildId: other,
      press: { id: 'apple', answers: { name: 'Beacon' } }
    })
    const bare = (await pool.query('select press from site_creation where build_id = $1', [other])).rows[0]
    assert.equal(Object.hasOwn(bare.press, 'questionnaire'), false)
  }
)

test(
  'the press door hands a press back to the account that made it, and only while its build has not started',
  opts,
  async () => {
    // 🔒 Measured 23/09/2026: a customer who pressed Build and closed the tab came back to the
    // questionnaire — the answers lived in the tab's `sessionStorage`, and the copy on the creation
    // row was read only by the sweep, which no longer builds Joomla/WordPress sites (#249).
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post, get } = harness(pool, host.fetchImpl)
    const a = await cookieFor('a@x.y')
    const b = await cookieFor('b@x.y')
    const press = { id: 'tracy-business', answers: { name: 'Lantern' } }
    const made = await post('/api/sites', a, {
      label: 'lantern',
      platform: 'wordpress',
      buildId: BUILD,
      press
    })
    assert.equal(made.status, 202)
    const { siteKey, jobId } = await made.json()

    const back = await get(`/api/sites/${siteKey}/press`, a)
    assert.equal(back.status, 200)
    const body = await back.json()
    assert.deepEqual(body.press, press)
    assert.equal(body.jobId, jobId)

    const stranger = await get(`/api/sites/${siteKey}/press`, b)
    assert.equal(stranger.status, 403, 'an account with no seat on the site reads nothing')

    await pool.query('update site_creation set build_started_at = now()')
    const started = await (await get(`/api/sites/${siteKey}/press`, a)).json()
    assert.equal(started.press, null, 'a build that has started is not resumed twice')
  }
)

for (const withBuildId of [false, true])
  test(
    `two accounts race for one domain (${withBuildId ? 'Build' : 'Add site'}) while provision is running: the loser gets actionable words and no job`,
    opts,
    async () => {
      const { pool } = db
      const host = fakeHost()
      const { cookieFor, post } = harness(pool, host.fetchImpl)
      const a = await cookieFor('race-a@x.y')
      const b = await cookieFor('race-b@x.y')
      let release
      host.hangOn(
        new Promise((resolve) => {
          release = resolve
        })
      )
      const requests = [
        post('/api/sites', a, {
          label: 'race-domain',
          platform: 'wordpress',
          ...(withBuildId ? { buildId: BUILD } : {})
        }),
        post('/api/sites', b, {
          label: 'race-domain',
          platform: 'wordpress',
          ...(withBuildId ? { buildId: '22222222-2222-4333-8444-555555555555' } : {})
        })
      ]
      let timer
      try {
        // The winner is held inside provision; the other request must finish without waiting for it.
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('The domain refusal waited for provision')), 5000)
        })
        const loser = await Promise.race([...requests, deadline])
        assert.equal(loser.status, 409)
        const body = await loser.json()
        assert.equal(body.code, 'TAKEN')
        assert.equal(body.message, 'That domain is already taken. Choose another site address.')
        assert.equal(body.jobId, undefined)
        // The refusal can arrive before the winner reaches the host.
        await Promise.race([host.provisionStarted, deadline])
        assert.equal(host.provisions.length, 1)
        const owners = await pool.query(
          "select * from seat where site_key='race-domain.localhost' and role='owner'"
        )
        assert.equal(owners.rows.length, 1)
      } finally {
        clearTimeout(timer)
        release()
        await Promise.all(requests)
      }
      const responses = await Promise.all(requests)
      const loserCookie = responses[0].status === 409 ? a : b
      const retry = await post('/api/sites', loserCookie, {
        label: 'another-domain',
        platform: 'wordpress',
        buildId: '33333333-2222-4333-8444-555555555555'
      })
      assert.equal(retry.status, 202)
      assert.equal(host.provisions.length, 2)
    }
  )

for (const legacy of [false, true]) {
  test(
    `domain reservation: ${legacy ? 'legacy' : 'keyed'} repeated press and a fresh build cannot reinstall a completed site`,
    opts,
    async () => {
      const { pool } = db
      const host = fakeHost()
      const { cookieFor, post, get } = harness(pool, host.fetchImpl)
      const owner = await cookieFor('owner@x.y')
      const stranger = await cookieFor('stranger@x.y')
      const payload = {
        label: 'reserved-domain',
        platform: 'wordpress',
        ...(legacy ? {} : { buildId: BUILD })
      }
      const first = await post('/api/sites', owner, payload)
      assert.equal(first.status, 202)
      const created = await first.json()
      host.jobs.get(created.jobId).state = 'done'
      await get(`/api/sites/${created.siteKey}/jobs/${created.jobId}`, owner)
      const replay = await post('/api/sites', owner, payload)
      assert.equal(replay.status, 202)
      assert.equal((await replay.json()).jobId, created.jobId)
      const fresh = await post('/api/sites', owner, {
        ...payload,
        buildId: '99999999-2222-4333-8444-555555555555'
      })
      assert.equal(fresh.status, 409)
      assert.equal((await fresh.json()).code, 'TAKEN')
      const foreign = await post('/api/sites', stranger, payload)
      assert.equal(foreign.status, 409)
      assert.equal((await foreign.json()).code, 'TAKEN')
      const claim = await post('/api/sites/claim', owner, {
        ...payload,
        buildId: '88888888-2222-4333-8444-555555555555'
      })
      assert.equal(claim.status, 409)
      assert.equal((await claim.json()).code, 'TAKEN')
      assert.equal(host.provisions.length, 1)
      assert.equal(
        (await pool.query('select count(*)::int as n from job where site_key=$1', [created.siteKey])).rows[0]
          .n,
        1
      )
    }
  )
}

test(
  'domain reservation: two fresh builds by one owner race before the host answers, only one provisions',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post } = harness(pool, host.fetchImpl)
    const cookie = await cookieFor('owner@x.y')
    let release
    host.hangOn(
      new Promise((resolve) => {
        release = resolve
      })
    )
    const first = post('/api/sites', cookie, {
      label: 'one-owner-race',
      platform: 'wordpress',
      buildId: BUILD
    })
    await host.provisionStarted
    try {
      const second = await post('/api/sites', cookie, {
        label: 'one-owner-race',
        platform: 'joomla',
        buildId: '99999999-2222-4333-8444-555555555555'
      })
      assert.equal(second.status, 409)
      assert.equal((await second.json()).code, 'TAKEN')
      assert.equal(host.provisions.length, 1)
    } finally {
      release()
      await first
    }
  }
)

for (const zone of ['tracy.ai', 'tracy.site']) {
  test(`two web instances sharing PostgreSQL reserve exactly one domain in ${zone}`, opts, async () => {
    const { pool } = db
    const host = fakeHost()
    const firstApp = harness(pool, host.fetchImpl, { SITE_DOMAIN: zone })
    const secondApp = harness(pool, host.fetchImpl, { SITE_DOMAIN: zone })
    const firstCookie = await firstApp.cookieFor('first@x.y')
    const secondCookie = await secondApp.cookieFor('second@x.y')
    const payload = { label: 'shared-domain', platform: 'wordpress', buildId: BUILD }
    const results = await Promise.all([
      firstApp.post('/api/sites', firstCookie, payload),
      secondApp.post('/api/sites', secondCookie, { ...payload, label: ' SHARED-DOMAIN ' })
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), [202, 409])
    assert.equal((await results.find((r) => r.status === 409).json()).code, 'TAKEN')
    assert.equal(host.provisions.length, 1)
    const sameOwner = await firstApp.cookieFor('first@x.y')
    const alias = `alias-domain.${zone}`
    await pool.query('insert into site_name(name,site_key) values($1,$2)', [alias, `shared-domain.${zone}`])
    const reservedAlias = await firstApp.post('/api/sites', sameOwner, {
      label: 'alias-domain',
      platform: 'wordpress',
      buildId: '99999999-2222-4333-8444-555555555555'
    })
    assert.equal(reservedAlias.status, 409)
    assert.equal((await reservedAlias.json()).code, 'TAKEN')
    assert.equal(host.provisions.length, 1)
  })
}

test('an owned fleet site cannot be provisioned through the import endpoint', opts, async () => {
  const { pool } = db
  const host = fakeHost()
  const { cookieFor, post } = harness(pool, host.fetchImpl)
  const cookie = await cookieFor('owner@x.y')
  const first = await post('/api/sites', cookie, {
    label: 'fleet-domain',
    platform: 'wordpress',
    buildId: BUILD
  })
  const { siteKey } = await first.json()
  const again = await post(`/api/sites/${siteKey}/provision`, cookie, {
    platform: 'joomla',
    webrootKey: 'sites/fleet-domain/webroot.tar'
  })
  assert.equal(again.status, 409)
  assert.equal((await again.json()).code, 'TAKEN')
  assert.equal(host.provisions.length, 1)
})

test(
  'domain lock and all provisioning queries share one connection, even with a one-slot pool',
  opts,
  async () => {
    const pool = new pg.Pool({ connectionString: db.url, max: 1, connectionTimeoutMillis: 1000 })
    try {
      const host = fakeHost()
      const { cookieFor, post } = harness(pool, host.fetchImpl)
      const cookie = await cookieFor('single-slot@x.y')
      const result = await post('/api/sites', cookie, {
        label: 'single-slot',
        platform: 'wordpress',
        buildId: BUILD
      })
      assert.equal(result.status, 202)
      assert.equal(host.provisions.length, 1)
      assert.equal(
        (await pool.query("select count(*)::int as n from job where site_key='single-slot.localhost'"))
          .rows[0].n,
        1
      )
    } finally {
      await pool.end()
    }
  }
)

/**
 * A deleted site's name is free again. Measured on dev 09/10/2026: `POST /api/sites` for `e2e-em`,
 * whose site had been deleted, answered 409 TAKEN — and left a NEW site row and owner seat behind
 * (a site in the list with no job and no container), because the claim was written first and the
 * "occupied" test then found the provision job of the DELETED site (jobs outlive their site).
 * A site row goes only after the host said the site is off it (`deleteTornDownSite`), so a job
 * older than the row standing under that name belongs to a site that is gone.
 */
async function builtThenDeleted(pool, host, { cookieFor, post, get, del }, payload) {
  const owner = await cookieFor('owner@x.y')
  const first = await post('/api/sites', owner, payload)
  assert.equal(first.status, 202)
  const created = await first.json()
  host.jobs.get(created.jobId).state = 'done'
  await get(`/api/sites/${created.siteKey}/jobs/${created.jobId}`, owner)
  const gone = await del(`/api/sites/${created.siteKey}`, owner)
  assert.equal(gone.status, 200, await gone.clone().text())
  assert.equal((await gone.json()).removed, true)
  assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 0)
  // The old job stays on record, which is what used to block the name.
  assert.equal((await pool.query("select count(*)::int as n from job where kind = 'provision'")).rows[0].n, 1)
  return { owner, created }
}

for (const who of ['the same owner', 'another account']) {
  for (const legacy of [false, true]) {
    test(
      `a deleted site's name can be built again by ${who} (${legacy ? 'legacy' : 'keyed'} press)`,
      opts,
      async () => {
        const { pool } = db
        const host = fakeHost()
        const app = harness(pool, host.fetchImpl)
        const payload = { label: 'e2e-em', platform: 'wordpress', ...(legacy ? {} : { buildId: BUILD }) }
        const { owner, created } = await builtThenDeleted(pool, host, app, payload)
        const cookie = who === 'the same owner' ? owner : await app.cookieFor('other@x.y')
        const again = await app.post('/api/sites', cookie, {
          ...payload,
          ...(legacy ? {} : { buildId: '99999999-2222-4333-8444-555555555555' })
        })
        assert.equal(again.status, 202, await again.clone().text())
        const body = await again.json()
        assert.equal(body.siteKey, created.siteKey)
        assert.notEqual(body.jobId, created.jobId, 'a new provision, not the deleted site’s job handed back')
        assert.equal(host.provisions.length, 2)
        assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 1)
        assert.equal(
          (
            await pool.query(
              "select count(*)::int as n from seat where role = 'owner' and revoked_at is null"
            )
          ).rows[0].n,
          1
        )
      }
    )
  }
}

test(
  'a press refused TAKEN on a live site writes nothing: no site row, no seat, no provision',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post, get } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const first = await post('/api/sites', owner, {
      label: 'live-one',
      platform: 'wordpress',
      buildId: BUILD
    })
    const created = await first.json()
    host.jobs.get(created.jobId).state = 'done'
    await get(`/api/sites/${created.siteKey}/jobs/${created.jobId}`, owner)
    const before = (
      await pool.query('select (select count(*) from site)::int as s, (select count(*) from seat)::int as t')
    ).rows[0]
    for (const [cookie, buildId] of [
      [owner, '99999999-2222-4333-8444-555555555555'],
      [await cookieFor('stranger@x.y'), '77777777-2222-4333-8444-555555555555']
    ]) {
      const refused = await post('/api/sites', cookie, { label: 'live-one', platform: 'emdash', buildId })
      assert.equal(refused.status, 409)
      assert.equal((await refused.json()).code, 'TAKEN')
    }
    const afterwards = (
      await pool.query('select (select count(*) from site)::int as s, (select count(*) from seat)::int as t')
    ).rows[0]
    assert.deepEqual(afterwards, before)
    assert.equal(host.provisions.length, 1)
  }
)

test(
  "an imported domain whose site was deleted is imported again, not handed the deleted site's job",
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const store = {
      ARTIFACT_S3_ENDPOINT: 'http://r2.test',
      ARTIFACT_S3_BUCKET: 'artifacts',
      ARTIFACT_S3_ACCESS_KEY: 'AK',
      ARTIFACT_S3_SECRET_KEY: 'SK'
    }
    const { cookieFor, post, get, del } = harness(pool, host.fetchImpl, store)
    const owner = await cookieFor('owner@x.y')
    const importOnce = async () => {
      const claim = await post('/api/sites', owner, {
        origin: 'import',
        siteKey: 'fijitrips.example',
        platform: 'wordpress'
      })
      assert.equal(claim.status, 201, await claim.clone().text())
      const started = await post('/api/sites/fijitrips.example/provision', owner, {
        platform: 'wordpress',
        webrootKey: 'sites/fijitrips-example/webroot.tar'
      })
      assert.equal(started.status, 202, await started.clone().text())
      return started.json()
    }
    const first = await importOnce()
    host.jobs.get(first.jobId).state = 'done'
    await get(`/api/sites/fijitrips.example/jobs/${first.jobId}`, owner)
    const gone = await del('/api/sites/fijitrips.example', owner)
    assert.equal(gone.status, 200, await gone.clone().text())
    const second = await importOnce()
    assert.notEqual(second.jobId, first.jobId)
    assert.equal(second.reused, undefined)
    assert.equal(host.provisions.length, 2)
  }
)

test(
  'deleting a site while its provision still runs ends the provision row — it does not stay `running` forever (#888 item 3)',
  opts,
  async () => {
    // Measured 04/10/2026 on dev (run `killtest1`, site `e2ekilltest1w`): the E2E run was killed
    // mid-build, the next run deleted the site (`removed/host/repo` all true, 0 containers left), and
    // the provision row in `job` still said `running`. Nothing can ever end it: the site row is gone,
    // and `teardown.sh` step 5 drops the host's finished job records of the label, so the sweep
    // (`settleQuietJobs`) only ever hears 404 for it and puts it back in the queue (`touchJob`).
    const { pool } = db
    const host = fakeHost()
    const { cookieFor, post, del } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const started = await post('/api/sites', owner, {
      label: 'halfbuilt',
      platform: 'wordpress',
      buildId: BUILD
    })
    assert.equal(started.status, 202, await started.clone().text())
    const { jobId } = await started.json()
    // A second site of the same owner whose provision also still runs: not this delete's to end.
    const other = await post('/api/sites', owner, {
      label: 'bystander',
      platform: 'wordpress',
      buildId: '22222222-3333-4444-8555-666666666666'
    })
    assert.equal(other.status, 202, await other.clone().text())
    const otherJob = (await other.json()).jobId

    const gone = await del('/api/sites/halfbuilt.localhost', owner)
    assert.equal(gone.status, 200, await gone.clone().text())
    assert.equal((await gone.json()).removed, true)
    // The host's teardown pruned what it knew of the label; the sweep can only hear 404 from now on.
    host.jobs.delete(jobId)

    const row = async (id) =>
      (await pool.query('select state, step, detail from job where id = $1', [id])).rows[0]
    const ended = await row(jobId)
    assert.equal(ended.state, 'failed', 'a provision whose site was deleted is over')
    assert.equal(ended.step, 'site-deleted')
    assert.equal(ended.detail?.code, 'SITE_DELETED')
    // And the sweep leaves it ended: it lists only rows still open.
    const { settleQuietJobs } = await import('../src/cron.js')
    const config = readConfig(env)
    await settleQuietJobs(pool, config, {
      fetchImpl: host.fetchImpl,
      staleMs: 0,
      log: { info() {}, warn() {} }
    })
    assert.equal((await row(jobId)).state, 'failed')
    // The other site's provision is untouched.
    assert.ok(!['done', 'failed'].includes((await row(otherJob)).state))
  }
)

test('deleting a site whose provision already ENDED keeps that ending as it was', opts, async () => {
  const { pool } = db
  const host = fakeHost()
  const { cookieFor, post, get, del } = harness(pool, host.fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const started = await post('/api/sites', owner, {
    label: 'finished',
    platform: 'wordpress',
    buildId: BUILD
  })
  assert.equal(started.status, 202, await started.clone().text())
  const { jobId } = await started.json()
  host.jobs.get(jobId).state = 'done'
  await get(`/api/sites/finished.localhost/jobs/${jobId}`, owner)
  const gone = await del('/api/sites/finished.localhost', owner)
  assert.equal(gone.status, 200, await gone.clone().text())
  const { rows } = await pool.query('select state, step from job where id = $1', [jobId])
  assert.equal(rows[0].state, 'done')
  assert.notEqual(rows[0].step, 'site-deleted')
})

// ── The design system picked in the Add site form travels with the create request (Akemi, 12/10/2026) ──

const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'

/** A design-system runner over the real store whose host and write are the test's: nothing is applied unless asked. */
function dsRunner(pool, { hostState = () => 'running' } = {}) {
  const applied = []
  const runner = createBuildDesignSystems({
    store: buildDesignSystemStore(pool),
    hostJob: async () => ({ state: hostState() }),
    briefOpen: async () => false,
    apply: async (siteKey, ask) => {
      applied.push({ siteKey, ...ask })
      return { status: 200, body: { ok: true, applyId: 'a1b2c3d4e5f6' } }
    },
    log: { info() {}, warn() {} },
    sleep: () => new Promise((r) => setTimeout(r, 5)),
    limits: { jobPollMs: 5, pollMs: 5 }
  })
  return { runner, applied }
}

test(
  'a create request carrying a design system keeps it on the new site, for the build to apply',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const { runner } = dsRunner(pool)
    const { cookieFor, post } = harness(pool, host.fetchImpl, {}, { designSystemsAtCreate: runner })
    const a = await cookieFor('a@x.y')
    const res = await post('/api/sites', a, {
      label: 'picked',
      platform: 'wordpress',
      buildId: BUILD,
      designSystem: MOXIE
    })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.deepEqual(body.designSystem, { id: MOXIE, name: 'Moxie', state: 'queued' })
    const row = (await pool.query('select * from site_create_design_system')).rows[0]
    assert.equal(row.site_key, 'picked.localhost')
    assert.equal(row.system_id, MOXIE)
    assert.equal(row.system_name, 'Moxie')
    assert.equal(row.actor, 'a@x.y', 'applied as the person who created the site')
    assert.equal(row.job_id, body.jobId)
    assert.equal(row.state, 'queued')
    await runner.stop()
  }
)

test('a create request with no design system writes no row, as it always did', opts, async () => {
  const { pool } = db
  const host = fakeHost()
  const { runner } = dsRunner(pool)
  const { cookieFor, post } = harness(pool, host.fetchImpl, {}, { designSystemsAtCreate: runner })
  const res = await post('/api/sites', await cookieFor('a@x.y'), { label: 'unpicked', platform: 'wordpress' })
  assert.equal(res.status, 202)
  assert.equal('designSystem' in (await res.json()), false)
  assert.equal((await pool.query('select count(*)::int as n from site_create_design_system')).rows[0].n, 0)
  await runner.stop()
})

for (const [why, designSystem] of [
  ['an OpenDesign id', 'od:stripe'],
  ['an unknown id', 'refero:00000000-0000-4000-8000-000000000000'],
  ['a system the quality gate refuses', 'refero:057d7c66-76b7-4272-849c-4058543e6799'],
  ['not a string', { id: MOXIE }],
  ['an empty string', '']
])
  test(`a create request naming ${why} is refused 400 before anything is created`, opts, async () => {
    const { pool } = db
    const host = fakeHost()
    const { runner } = dsRunner(pool)
    const { cookieFor, post } = harness(pool, host.fetchImpl, {}, { designSystemsAtCreate: runner })
    const res = await post('/api/sites', await cookieFor('a@x.y'), {
      label: 'refused',
      platform: 'wordpress',
      buildId: BUILD,
      designSystem
    })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'DS_UNKNOWN')
    assert.equal(host.provisions.length, 0)
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 0)
    assert.equal((await pool.query('select count(*)::int as n from site_creation')).rows[0].n, 0)
    await runner.stop()
  })

test(
  'the poll door holds "running" while the pick is applied, then says how it ended beside done',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    let state = 'running'
    const { runner, applied } = dsRunner(pool, { hostState: () => state })
    const { cookieFor, post, get } = harness(pool, host.fetchImpl, {}, { designSystemsAtCreate: runner })
    const a = await cookieFor('a@x.y')
    const made = await (
      await post('/api/sites', a, {
        label: 'polled',
        platform: 'wordpress',
        buildId: BUILD,
        designSystem: MOXIE
      })
    ).json()
    // Installed, but the pick not written yet: the customer is told the build still works.
    host.jobs.set(made.jobId, { state: 'done', port: 51801 })
    await pool.query(`update site_create_design_system set state = 'applying'`)
    const during = await (await get(`/api/sites/${made.siteKey}/jobs/${made.jobId}`, a)).json()
    assert.equal(during.state, 'running')
    assert.equal(during.step, 'applying your design system')
    assert.deepEqual(during.designSystem, { id: MOXIE, name: 'Moxie', state: 'applying' })
    // Written: `done`, with the ending beside it.
    await pool.query(`update site_create_design_system set state = 'applied', apply_id = 'a1b2c3d4e5f6'`)
    const done = await (await get(`/api/sites/${made.siteKey}/jobs/${made.jobId}`, a)).json()
    assert.equal(done.state, 'done')
    assert.deepEqual(done.designSystem, {
      id: MOXIE,
      name: 'Moxie',
      state: 'applied',
      applyId: 'a1b2c3d4e5f6'
    })
    assert.equal(applied.length, 0, 'the test drove the row; the runner never wrote')
    state = 'done'
    await runner.stop()
  }
)

test('a pick the template could not wear: the site is still done, and the reason is said', opts, async () => {
  const { pool } = db
  const host = fakeHost()
  const { runner } = dsRunner(pool)
  const { cookieFor, post, get } = harness(pool, host.fetchImpl, {}, { designSystemsAtCreate: runner })
  const a = await cookieFor('a@x.y')
  const made = await (
    await post('/api/sites', a, {
      label: 'skipped',
      platform: 'wordpress',
      buildId: BUILD,
      designSystem: MOXIE
    })
  ).json()
  host.jobs.set(made.jobId, { state: 'done', port: 51802 })
  await pool.query(
    `update site_create_design_system set state = 'skipped', reason = 'DS_TEMPLATE_CANNOT_WEAR: TEMPLATE_HAS_NO_SLOT'`
  )
  const done = await (await get(`/api/sites/${made.siteKey}/jobs/${made.jobId}`, a)).json()
  assert.equal(done.state, 'done')
  assert.deepEqual(done.designSystem, {
    id: MOXIE,
    name: 'Moxie',
    state: 'skipped',
    reason: 'DS_TEMPLATE_CANNOT_WEAR: TEMPLATE_HAS_NO_SLOT'
  })
  await runner.stop()
})
