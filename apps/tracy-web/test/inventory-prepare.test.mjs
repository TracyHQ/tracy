/**
 * `inventory/prepare.js` — what a stock instance IS, proved against the real schema.
 *
 * The three facts these tests are here for, each of which fails silently if it regresses:
 *   1. a stock site row is owned by NOBODY (no `created_by`, no seat) and is not a demo;
 *   2. the identity is written before the host is called and never changes afterwards;
 *   3. `verifyInstance` asks the INSTANCE, not the job row.
 *
 * `inventory/store.js` is another branch's file and may not exist yet, so the store is injected:
 * the one below is not a mock of the counts — it is the real SQL against the real tables from
 * `026-site-inventory.sql`, so every assertion here is about the database that will run in
 * production. Only the host and the site probe are doubles, because they are the network.
 */

import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { prepareInstance, stockLabel, verifyInstance } from '../src/inventory/prepare.js'
import { createSite, putJob, siteByKey } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/**
 * What the composition root passes down. It is imported HERE, in a test file, and never from
 * `src/inventory/` — `test/module-graph.test.mjs` forbids that directory from reaching another
 * domain, which is exactly why `prepareInstance` takes it as a parameter.
 */
const sites = { createSite, putJob, siteByKey }

const dbUrl = process.env.TEST_DATABASE_URL
const dbOpts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

const config = {
  origin: 'http://tracy.test:8080',
  siteDomain: 'localhost',
  siteAddressPrefix: '',
  hostName: 'local',
  hosts: new Map([['local', { origin: 'http://host.test', hostSecret: 's'.repeat(32) }]])
}

/** The real tables, spoken to directly — see the file header for why this is not a mock. */
const store = {
  async readPool(pool, poolKey) {
    const { rows } = await pool.query('select * from inventory_pool where pool_key = $1', [poolKey])
    return rows[0] ?? null
  },
  async insertInstance(client, { poolKey, siteKey, label, host, generation }) {
    const { rows } = await client.query(
      `insert into inventory_instance (pool_key, site_key, label, host, generation)
       values ($1, $2, $3, $4, $5) returning *`,
      [poolKey, siteKey, label, host, generation]
    )
    return rows[0]
  },
  async instanceById(pool, id) {
    const { rows } = await pool.query('select * from inventory_instance where id = $1', [id])
    return rows[0] ?? null
  },
  async setInstanceState(pool, id, patch = {}) {
    const { rows } = await pool.query(
      `update inventory_instance set
         state = coalesce($2, state),
         job_id = coalesce($3, job_id),
         last_error = coalesce($4, last_error),
         health_ok = coalesce($5, health_ok),
         health_checked_at = case when $5 is null then health_checked_at else now() end,
         health_detail = coalesce($6::jsonb, health_detail),
         hashes = coalesce($7::jsonb, hashes),
         attempts = attempts + case when $8 then 1 else 0 end,
         updated_at = now()
       where id = $1 returning *`,
      [
        id,
        patch.state ?? null,
        patch.jobId ?? null,
        patch.lastError ?? null,
        patch.healthOk ?? null,
        patch.healthDetail !== undefined ? JSON.stringify(patch.healthDetail) : null,
        patch.hashes !== undefined ? JSON.stringify(patch.hashes) : null,
        patch.bumpAttempt === true
      ]
    )
    return rows[0] ?? null
  }
}

async function seedPool(pool, over = {}) {
  const row = {
    poolKey: 'dev:local:joomla:tracy-business|j6:1.0.0:abcdef012345',
    environment: 'dev',
    host: 'local',
    platform: 'joomla',
    tag: 'tracy-business/j6',
    version: '1.0.0',
    generation: 'abcdef012345deadbeef',
    ...over
  }
  await pool.query(
    `insert into inventory_pool (pool_key, environment, host, platform, quickstart_tag,
       quickstart_version, generation, enabled, low_watermark, target_ready, max_stock)
     values ($1, $2, $3, $4, $5, $6, $7, true, 1, 3, 5)`,
    [row.poolKey, row.environment, row.host, row.platform, row.tag, row.version, row.generation]
  )
  return row
}

const install = {
  platform: 'joomla',
  version: '1.0.0',
  format: 'tracy-setting/v1',
  archive: { file: 'site.tar.zst', sha256: 'aa'.repeat(32), bytes: 10, githubAssetId: 1, url: 'https://x/y' },
  contract: 'tracy-business-j6@1.0.0',
  coworkMinVersion: '0.14.0'
}
const release = { tag: 'tracy-business/j6', platform: 'joomla' }

/** A host that says yes and records what it was asked. */
function fakeHost(jobId = 'job-1', ok = true, status = 200) {
  const calls = []
  return {
    calls,
    hostCall: async (_config, hostName, path, instruction) => {
      calls.push({ hostName, path, instruction })
      return ok
        ? { ok: true, status, body: { jobId } }
        : { ok: false, status, body: { code: 'FLEET_REFUSED' } }
    }
  }
}

// ── 1. Stock is a site nobody owns, and is not a demo ──────────────────────────────────────────

test(
  'prepare: the site row has no owner, no seat and no demo flag — the three things that keep stock invisible',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool)
    const host = fakeHost()
    const result = await prepareInstance({
      pool,
      config,
      host,
      poolKey,
      install,
      release,
      releasesToken: 'tok',
      store,
      sites,
      labelOf: () => 'inv-aaaaaa'
    })
    assert.equal(result.ok, true)

    const { rows } = await pool.query('select * from site where label = $1', ['inv-aaaaaa'])
    assert.equal(rows.length, 1)
    const site = rows[0]
    assert.equal(site.created_by, null, 'created_by must stay null: nobody owns stock yet')
    assert.equal(site.demo, false, 'a demo is marketing and may be torn down under us')
    assert.equal(site.origin, 'fleet_born')
    assert.equal(site.site_key, 'inv-aaaaaa.localhost')

    // The measured invariant, not the asserted one: My Sites answers from the seat book.
    const seats = await pool.query('select count(*)::int as n from seat where site_key = $1', [site.site_key])
    assert.equal(seats.rows[0].n, 0, 'a seat on stock would list it to whoever holds it')

    // And it is invisible to the demo surfaces by construction.
    const live = await pool.query("select count(*)::int as n from site where demo and publish = 'published'")
    assert.equal(live.rows[0].n, 0)
  }
)

test(
  'prepare: the instruction is the customer shape — no frameAncestors, no demo, no badge',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool)
    const host = fakeHost()
    await prepareInstance({
      pool,
      config,
      host,
      poolKey,
      install,
      release,
      releasesToken: 'tok',
      store,
      sites,
      labelOf: () => 'inv-bbbbbb'
    })
    assert.equal(host.calls.length, 1)
    const { path, instruction } = host.calls[0]
    assert.equal(path, '/provision')
    for (const forbidden of ['frameAncestors', 'demo', 'badge', 'goLive', 'workflow'])
      assert.equal(
        Object.hasOwn(instruction, forbidden),
        false,
        `${forbidden} belongs to the demo road and must never reach a customer's site`
      )
    assert.equal(instruction.liveSite, 'http://inv-bbbbbb.localhost:8080/')
    assert.equal(instruction.coworkMinVersion, '0.14.0')
    assert.equal(instruction.quickstartEntry, install)
    assert.equal(instruction.fresh, true)
  }
)

test(
  'prepare: the job key says `inv:`, so a demo job of the same label can never collapse into it',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool)
    const host = fakeHost()
    await prepareInstance({
      pool,
      config,
      host,
      poolKey,
      install,
      release,
      store,
      sites,
      labelOf: () => 'inv-cccccc'
    })
    assert.equal(host.calls[0].instruction.jobKey, 'inv:inv-cccccc:1.0.0:1')
    assert.equal(host.calls[0].instruction.jobKey.startsWith('demo:'), false)
  }
)

// ── 2. Identity exists before the host is called, and survives ─────────────────────────────────

test(
  'prepare: the rows are COMMITTED before the host call — the host itself can read them',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool)
    let seenFromInsideTheCall = null
    const host = {
      hostCall: async () => {
        // A second connection, taken while the "network call" is in flight. If the writes were
        // still inside an open transaction this read would see nothing — which is the failure this
        // test exists to catch, because a host that installs under a transaction that then rolls
        // back leaves a site nothing knows about.
        const { rows } = await pool.query(
          `select i.site_key, i.state, s.created_by
           from inventory_instance i join site s on s.site_key = i.site_key`
        )
        seenFromInsideTheCall = rows
        return { ok: true, status: 200, body: { jobId: 'job-c' } }
      }
    }
    const out = await prepareInstance({
      pool,
      config,
      host,
      poolKey,
      install,
      release,
      store,
      sites,
      labelOf: () => 'inv-dddddd'
    })
    assert.equal(out.ok, true)
    assert.equal(seenFromInsideTheCall.length, 1)
    assert.equal(seenFromInsideTheCall[0].site_key, 'inv-dddddd.localhost')
    assert.equal(seenFromInsideTheCall[0].created_by, null)
  }
)

test(
  'prepare: a retry keeps the same siteKey and label, and only the attempt number moves',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool)
    const refusing = fakeHost('job-x', false, 502)
    const first = await prepareInstance({
      pool,
      config,
      host: refusing,
      poolKey,
      install,
      release,
      store,
      sites,
      labelOf: () => 'inv-eeeeee'
    })
    assert.deepEqual({ ok: first.ok, code: first.code }, { ok: false, code: 'HOST_REFUSED' })
    const { rows: after } = await pool.query('select * from inventory_instance')
    assert.equal(after.length, 1)
    assert.equal(after[0].state, 'queued', 'one refusal is for the backoff, not a verdict')
    assert.match(after[0].last_error, /host refused/)

    const host = fakeHost('job-y')
    const second = await prepareInstance({
      pool,
      config,
      host,
      poolKey,
      install,
      release,
      store,
      sites,
      instanceId: after[0].id,
      // A label generator is passed and deliberately ignored: a retry must not rename anything.
      labelOf: () => 'inv-somethingelse'
    })
    assert.equal(second.ok, true)
    assert.equal(second.instanceId, after[0].id)
    assert.equal(host.calls[0].instruction.label, 'inv-eeeeee')
    assert.equal(host.calls[0].instruction.jobKey, 'inv:inv-eeeeee:1.0.0:2')
    const { rows: siteRows } = await pool.query('select count(*)::int as n from site')
    assert.equal(siteRows[0].n, 1, 'a retry must not leave a second site row behind as debris')
  }
)

test('prepare: a name already taken is refused without leaving an inventory row', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool)
  await pool.query("insert into site (site_key, label, host) values ($1, $2, 'local')", [
    'inv-ffffff.localhost',
    'inv-ffffff'
  ])
  const host = fakeHost()
  const out = await prepareInstance({
    pool,
    config,
    host,
    poolKey,
    install,
    release,
    store,
    sites,
    labelOf: () => 'inv-ffffff'
  })
  assert.deepEqual({ ok: out.ok, code: out.code }, { ok: false, code: 'LABEL_TAKEN' })
  assert.equal(host.calls.length, 0, 'nothing is installed for a name we could not claim')
  const { rows } = await pool.query('select count(*)::int as n from inventory_instance')
  assert.equal(rows[0].n, 0)
})

test('stockLabel: carries the deployment prefix, inv-, the CMS and a six-character tail', () => {
  assert.equal(
    stockLabel({ siteAddressPrefix: 'dev-' }, 'joomla', () => 0.123456789),
    'dev-inv-j-4fzzzx'
  )
  assert.match(stockLabel({}, 'wordpress', Math.random), /^inv-wp-[a-z0-9]{6}$/)
  assert.match(stockLabel({}, 'emdash', Math.random), /^inv-ed-[a-z0-9]{6}$/)
})

// ── 3. Verification asks the instance ──────────────────────────────────────────────────────────

async function readyInstance(pool, poolKey, label = 'inv-verify') {
  await pool.query(
    "insert into site (site_key, label, host, platform, origin) values ($1, $2, 'local', 'joomla', 'fleet_born')",
    [`${label}.localhost`, label]
  )
  const { rows } = await pool.query(
    `insert into inventory_instance (pool_key, site_key, label, host, generation, state, job_id)
     values ($1, $2, $3, 'local', 'g', 'verifying', 'job-v') returning *`,
    [poolKey, `${label}.localhost`, label]
  )
  return rows[0]
}

test('verify: a job written down as done does NOT make an instance healthy', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool)
  const instance = await readyInstance(pool, poolKey)
  // The job row says the script exited 0. The site does not answer. The verdict must follow the
  // site, which is the whole reason this function does not read `job.state`.
  await pool.query(
    "insert into job (id, site_key, host, kind, state) values ('job-v', $1, 'local', 'provision', 'done')",
    [instance.site_key]
  )
  const out = await verifyInstance({
    pool,
    config,
    host: fakeHost(),
    instanceId: instance.id,
    store,
    sites,
    probe: async () => ({ ok: false, detail: 'the instance could not be reached' }),
    verifierVersion: 1
  })
  assert.equal(out.healthOk, false)
  assert.equal(out.detail, 'the instance could not be reached')
  const { rows } = await pool.query('select health_ok, last_error from inventory_instance where id = $1', [
    instance.id
  ])
  assert.equal(rows[0].health_ok, false)
  assert.match(rows[0].last_error, /could not be reached/)
})

test('verify: what is written to `hashes` is what came back off the instance', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool)
  const instance = await readyInstance(pool, poolKey, 'inv-good')
  const out = await verifyInstance({
    pool,
    config,
    host: fakeHost(),
    instanceId: instance.id,
    install,
    store,
    sites,
    probe: async () => ({
      ok: true,
      manifest: {
        platform: 'joomla',
        platformVersion: '6.0.2',
        extensions: [{ element: 'com_claudecowork', version: '0.14.3' }]
      }
    }),
    verifierVersion: 1
  })
  assert.equal(out.healthOk, true)
  assert.deepEqual(out.hashes, {
    platform: 'joomla',
    platformVersion: '6.0.2',
    cowork: '0.14.3',
    contractDeclared: 'tracy-business-j6@1.0.0',
    verifierVersion: 1
  })
  const { rows } = await pool.query(
    'select hashes, health_ok, health_checked_at from inventory_instance where id = $1',
    [instance.id]
  )
  assert.equal(rows[0].hashes.cowork, '0.14.3')
  assert.equal(rows[0].health_ok, true)
  assert.notEqual(rows[0].health_checked_at, null)
})

test('verify: an instance answering for the wrong platform is not healthy', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool)
  const instance = await readyInstance(pool, poolKey, 'inv-wrong')
  const out = await verifyInstance({
    pool,
    config,
    host: fakeHost(),
    instanceId: instance.id,
    store,
    sites,
    probe: async () => ({ ok: true, manifest: { platform: 'wordpress' } }),
    verifierVersion: 1
  })
  assert.equal(out.healthOk, false)
  assert.match(out.detail, /did not report this platform/)
})

// ── 4. EmDash is read back the way EmDash answers ──────────────────────────────────────────────
//
// These cases run the REAL `manifestProbe`/`emdashProbe` — no `probe` seam — because everything
// they are here to hold is inside that function: the branch on `platform`, the SSE unwrapping, the
// header set, the URL, and the refusal to file an MCP server version as a CMS version. Only the
// host channel and `fetch` are doubles.
//
// ⚠ `ok` AT THIS LEVEL IS NOT THE PROBE'S `ok`. A probe that comes back `{ok: false}` for a
// transient reason (a bad token, an HTTP error, a body that is not a handshake) is still a
// COMPLETED verification as far as `verifyInstance` is concerned: it writes `health_ok = false`
// and returns `{ok: true, healthOk: false, detail}`. So the refusal cases below assert
// `healthOk === false` plus the sentence, which is the same fact seen from the caller.

const MEASURED_SSE_BODY =
  'event: message\n' +
  'data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"logging":{},"tools":{"listChanged":true}},"serverInfo":{"name":"emdash","version":"0.1.0"}},"jsonrpc":"2.0","id":1}\n\n'

/** A stock EmDash instance, ready to be verified. */
async function emdashInstance(pool, poolKey, label = 'inv-ed-aaaaaa') {
  await pool.query(
    "insert into site (site_key, label, host, platform, origin) values ($1, $2, 'local', 'emdash', 'fleet_born')",
    [`${label}.localhost`, label]
  )
  const { rows } = await pool.query(
    `insert into inventory_instance (pool_key, site_key, label, host, generation, state, job_id)
     values ($1, $2, $3, 'local', 'g', 'verifying', 'job-v') returning *`,
    [poolKey, `${label}.localhost`, label]
  )
  return rows[0]
}

/** A host that mints an EmDash agent token and records what it was asked for. */
function emdashHost(token = 'ec_pat_0123456789abcdef', ok = true, status = 200) {
  const calls = []
  return {
    calls,
    hostCall: async (_config, hostName, path, instruction) => {
      calls.push({ hostName, path, instruction })
      return { ok, status, body: ok ? { token } : { code: 'HOST_REFUSED' } }
    }
  }
}

/** A `fetch` double that records every call and answers with one canned body. */
function fakeFetch({ ok = true, status = 200, body = MEASURED_SSE_BODY } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return { ok, status, text: async () => body, json: async () => JSON.parse(body) }
  }
  impl.calls = calls
  return impl
}

const emdashPool = {
  poolKey: 'dev:local:emdash:tracy-business|ed:1.0.0:abcdef012345',
  platform: 'emdash',
  tag: 'tracy-business/ed'
}

test('verify: an EmDash site is read back over MCP and never asks for a content door', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool, emdashPool)
  const instance = await emdashInstance(pool, poolKey)
  const fetchImpl = fakeFetch()
  const out = await verifyInstance({
    pool,
    config,
    host: emdashHost(),
    fetchImpl,
    instanceId: instance.id,
    store,
    sites,
    // Doors are injected and deliberately EMPTY. Before the `emdash` branch existed this was
    // the shape that produced `NO_DOOR_FOR_PLATFORM`; an EmDash site must not reach that path,
    // because EmDash has no Cowork component to name.
    doors: {},
    verifierVersion: 1
  })
  assert.equal(out.code, undefined, 'EmDash must not be reported as a platform without a door')
  assert.equal(out.verifiable, undefined)
  assert.equal(out.healthOk, true)
  assert.equal(fetchImpl.calls.length, 1, 'the MCP door was dialled exactly once')
})

test('verify: the EmDash handshake arrives as an event stream and is read as one', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool, emdashPool)
  const instance = await emdashInstance(pool, poolKey, 'inv-ed-sse')
  const out = await verifyInstance({
    pool,
    config,
    host: emdashHost(),
    // The body measured 22/09 against `business-emdash`, byte for byte. Hand this to `JSON.parse`
    // and it throws, which is how a correct answer became "unreachable" once already.
    fetchImpl: fakeFetch({ body: MEASURED_SSE_BODY }),
    instanceId: instance.id,
    store,
    sites,
    doors: {},
    verifierVersion: 1
  })
  assert.equal(out.healthOk, true)
  assert.equal(out.hashes.platform, 'emdash')
  const { rows } = await pool.query('select health_ok from inventory_instance where id = $1', [instance.id])
  assert.equal(rows[0].health_ok, true)
})

test('verify: a plain-JSON EmDash answer — no SSE framing — is read too', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool, emdashPool)
  const instance = await emdashInstance(pool, poolKey, 'inv-ed-json')
  const out = await verifyInstance({
    pool,
    config,
    host: emdashHost(),
    fetchImpl: fakeFetch({
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'emdash', version: '0.1.0' }
        }
      })
    }),
    instanceId: instance.id,
    store,
    sites,
    doors: {},
    verifierVersion: 1
  })
  assert.equal(out.healthOk, true)
  assert.equal(out.hashes.platform, 'emdash')
})

test(
  'verify: the EmDash request names text/event-stream, bears the token and carries the CSRF marker',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool, emdashPool)
    const instance = await emdashInstance(pool, poolKey, 'inv-ed-head')
    const fetchImpl = fakeFetch()
    await verifyInstance({
      pool,
      config,
      host: emdashHost('ec_pat_deadbeefdeadbeef'),
      fetchImpl,
      instanceId: instance.id,
      store,
      sites,
      doors: {},
      verifierVersion: 1
    })
    assert.equal(fetchImpl.calls.length, 1)
    const { init } = fetchImpl.calls[0]
    assert.equal(init.method, 'POST')
    // 🔒 EmDash 0.37 answers **406** to an `accept` that names `application/json` alone. So the
    // assertion is on the presence of the stream type, not on the whole header string: drop
    // `text/event-stream` and this line goes red.
    assert.match(
      String(init.headers.accept),
      /text\/event-stream/,
      'accept must name text/event-stream or EmDash answers 406'
    )
    assert.equal(init.headers.authorization, 'Bearer ec_pat_deadbeefdeadbeef')
    assert.equal(init.headers['X-EmDash-Request'], '1')
    assert.equal(JSON.parse(init.body).method, 'initialize')
  }
)

test('verify: the EmDash read-back goes to the site itself at /_emdash/api/mcp', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool, emdashPool)
  const instance = await emdashInstance(pool, poolKey, 'inv-ed-url')
  const fetchImpl = fakeFetch()
  await verifyInstance({
    pool,
    config,
    host: emdashHost(),
    fetchImpl,
    instanceId: instance.id,
    store,
    sites,
    doors: {},
    verifierVersion: 1
  })
  assert.equal(fetchImpl.calls[0].url, 'http://inv-ed-url.localhost:8080/_emdash/api/mcp')
})

test('verify: a token of the wrong shape is refused before the site is dialled at all', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool, emdashPool)
  const instance = await emdashInstance(pool, poolKey, 'inv-ed-token')
  const fetchImpl = fakeFetch()
  const out = await verifyInstance({
    pool,
    config,
    // A truncated or wrongly-provisioned token file. Sending it would come back 401, which reads
    // like a permission problem on the site rather than a broken token on ours.
    host: emdashHost('not-an-agent-token'),
    fetchImpl,
    instanceId: instance.id,
    store,
    sites,
    doors: {},
    verifierVersion: 1
  })
  assert.equal(out.healthOk, false)
  // The sentence names the TOKEN, not the host: a host answering 200 with a truncated file is a
  // different fault from a host saying no, and one sentence for both sends whoever reads it to
  // the wrong machine.
  assert.match(out.detail, /not the shape provision writes/)
  assert.doesNotMatch(out.detail, /would not mint/)
  assert.equal(fetchImpl.calls.length, 0, 'nothing may be sent to the site on a token we distrust')
})

test(
  'verify: an HTTP error from the EmDash door is a sentence with the code, not a throw',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool, emdashPool)
    const instance = await emdashInstance(pool, poolKey, 'inv-ed-406')
    const out = await verifyInstance({
      pool,
      config,
      host: emdashHost(),
      fetchImpl: fakeFetch({ ok: false, status: 406, body: '' }),
      instanceId: instance.id,
      store,
      sites,
      doors: {},
      verifierVersion: 1
    })
    assert.equal(out.healthOk, false)
    assert.match(out.detail, /406/, 'the HTTP code is the whole diagnosis and must survive into the sentence')
  }
)

test(
  'verify: a body that is not an MCP handshake says so, rather than reporting a platform',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool, emdashPool)
    const instance = await emdashInstance(pool, poolKey, 'inv-ed-nohand')
    const out = await verifyInstance({
      pool,
      config,
      host: emdashHost(),
      // Well-formed JSON-RPC, no `serverInfo` — what a proxy or a wrong path can answer.
      fetchImpl: fakeFetch({ body: 'data: {"result":{"protocolVersion":"2024-11-05"},"id":1}\n' }),
      instanceId: instance.id,
      store,
      sites,
      doors: {},
      verifierVersion: 1
    })
    assert.equal(out.healthOk, false)
    assert.match(out.detail, /MCP handshake/)
  }
)

test(
  'verify: the MCP server version lands under `cowork`, and `platformVersion` stays null',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool, emdashPool)
    const instance = await emdashInstance(pool, poolKey, 'inv-ed-ver')
    const out = await verifyInstance({
      pool,
      config,
      host: emdashHost(),
      fetchImpl: fakeFetch(),
      instanceId: instance.id,
      store,
      sites,
      doors: {},
      verifierVersion: 1
    })
    // 🔒 `0.1.0` IS THE MCP SERVER'S VERSION, NOT EMDASH'S. Filing it as `platformVersion` would
    // put a number meaning "the door" into the field that means "the CMS" on every other
    // platform — a tidying-up anyone reading `hashes` would be tempted to make.
    assert.equal(out.hashes.cowork, '0.1.0')
    assert.equal(out.hashes.platformVersion, null)
    const { rows } = await pool.query('select hashes, health_detail from inventory_instance where id = $1', [
      instance.id
    ])
    assert.equal(rows[0].hashes.cowork, '0.1.0')
    assert.equal(rows[0].hashes.platformVersion, null)
    assert.equal(rows[0].health_detail.manifest.platformVersion, null)
  }
)

test('verify: an EmDash site whose door names another platform is not healthy', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool, emdashPool)
  const instance = await emdashInstance(pool, poolKey, 'inv-ed-other')
  const out = await verifyInstance({
    pool,
    config,
    host: emdashHost(),
    fetchImpl: fakeFetch({
      body: 'data: {"result":{"serverInfo":{"name":"wordpress","version":"0.1.0"}},"id":1}\n'
    }),
    instanceId: instance.id,
    store,
    sites,
    doors: {},
    verifierVersion: 1
  })
  assert.equal(out.healthOk, false)
  assert.match(out.detail, /did not report this platform/)
})

// ── #827 regression: stock has no buyer, so its mail sender is its relay address ────────────────
//
// Measured 11/10/2026: `inv-ed-v5m9wz` is stuck with "the host refused the install at step
// provision". Stock omits `ownerEmail` on purpose (nobody owns it), so `configure-mail` met an EmDash
// site with no fromEmail and no sender and refused with NO_SENDER. The relay address is the site's
// own (`<label>@SITE_MAIL_DOMAIN`, what `/api/ops/mail` shows as `fromAddress`) and invents nobody.
test(
  'prepare: an EmDash stock instance carries its relay sender and still names no owner',
  dbOpts,
  async () => {
    const { pool } = db
    const { poolKey } = await seedPool(pool, {
      poolKey: 'dev:local:emdash:tracy-business|emdash-0.x:1.0.0:abcdef012345',
      platform: 'emdash',
      tag: 'tracy-business/emdash-0.x'
    })
    const host = fakeHost()
    await prepareInstance({
      pool,
      config: { ...config, siteMail: { domain: 'sites.tracy.test' } },
      host,
      poolKey,
      install: { ...install, platform: 'emdash' },
      release: { tag: 'tracy-business/emdash-0.x', platform: 'emdash' },
      releasesToken: 'tok',
      store,
      sites,
      labelOf: () => 'inv-ed-aaaaaa'
    })
    const { instruction } = host.calls[0]
    assert.equal(instruction.mailSender, 'inv-ed-aaaaaa@sites.tracy.test')
    assert.equal(Object.hasOwn(instruction, 'ownerEmail'), false, 'stock still has no buyer')
  }
)

test('prepare: with no site mail domain configured, no sender is invented', dbOpts, async () => {
  const { pool } = db
  const { poolKey } = await seedPool(pool)
  const host = fakeHost()
  await prepareInstance({
    pool,
    config,
    host,
    poolKey,
    install,
    release,
    releasesToken: 'tok',
    store,
    sites,
    labelOf: () => 'inv-cccccc'
  })
  assert.equal(Object.hasOwn(host.calls[0].instruction, 'mailSender'), false)
})
