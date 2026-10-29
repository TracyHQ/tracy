/**
 * The Demos doors: every installable quickstart with the address its public demo answers at, the
 * pin a person writes, and the press that puts (or re-puts) one on the demo host.
 *
 * Releases are seeded the way a read of GitHub leaves them; the host is a fake `fetch` that
 * records what tracy-web asked of it, so what these assert is the SCREEN's contract and the exact
 * calls the demo host receives — never the network.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const env = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1,demo',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1',
  HOST_demo_ORIGIN: 'http://demo-host',
  HOST_demo_DSH_ORIGIN: 'http://demo-host',
  HOST_demo_SECRET: 'h2',
  SEAT_demo_SECRET: 'k2'
}
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const J6 = 'tracy-business/j6'
const EMDASH = 'tracy-business/emdash-0.x'

/** A fake demo host: answers like tracy-host, remembers every call. */
function fakeHost() {
  const calls = []
  let jobState = { state: 'done', step: 'ready', port: 8084 }
  let provisions = 0
  let teardowns = 0
  let prefetches = 0
  let shadowed = false
  // Mirror tracy-host's `keyedJobId` dedup: a named attempt (`jobKey`) is idempotent — the same key
  // answers the job it already started rather than racing a second one (apps/tracy-host/src/app.js).
  const provisionByKey = new Map()
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url)
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ origin: u.origin, path: u.pathname, method: init.method ?? 'GET', body })
    if (u.pathname === '/_host/provision') {
      const key = typeof body?.jobKey === 'string' ? body.jobKey : ''
      if (key !== '' && provisionByKey.has(key))
        return Response.json({ jobId: provisionByKey.get(key), reused: true }, { status: 202 })
      const jobId = `job-provision-${++provisions}`
      if (key !== '') provisionByKey.set(key, jobId)
      return Response.json({ jobId }, { status: 202 })
    }
    if (u.pathname === '/_host/teardown')
      return Response.json({ jobId: `job-teardown-${++teardowns}` }, { status: 202 })
    // The update's first step: the host fetches and verifies the new release into its cache.
    if (u.pathname === '/_host/prefetch') {
      const key = typeof body?.jobKey === 'string' ? body.jobKey : ''
      if (key !== '' && provisionByKey.has(key))
        return Response.json({ jobId: provisionByKey.get(key), reused: true }, { status: 202 })
      const jobId = `job-prefetch-${++prefetches}`
      if (key !== '') provisionByKey.set(key, jobId)
      return Response.json({ jobId }, { status: 202 })
    }
    if (u.pathname === '/_host/address') return Response.json({ ok: true })
    if (u.pathname === '/_host/go-live') return Response.json({ jobId: 'job-golive-1' }, { status: 202 })
    if (u.pathname.startsWith('/_host/jobs/'))
      return Response.json({ id: u.pathname.split('/').pop(), ...jobState })
    // The demo's public name, asked before it is marked live: routed to this tracy-web, it echoes.
    if (u.pathname === '/__tracy/address-probe' && !shadowed)
      return new Response(init.headers?.['x-tracy-address-probe'] ?? '')
    return Response.json({ error: 'unexpected' }, { status: 500 })
  }
  return { calls, fetchImpl, setJob: (s) => (jobState = s), shadow: () => (shadowed = true) }
}

function harness(pool, fetchImpl, extraEnv = {}, configExtra = {}) {
  const config = { ...readConfig({ ...env, ...extraEnv }), ...configExtra }
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        headers: cookie ? { cookie } : {},
        redirect: 'manual'
      })
    )
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'https://cowork.tracy.test',
          'content-type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
  return { app, get, send, cookieFor }
}

async function seedStaff(pool, email, role = 'owner') {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') on conflict (display_name) do update set kind = excluded.kind returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
}

async function seedReleases(pool) {
  const insert = (tag, release, setting) =>
    pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, $3::jsonb, $4, null)`,
      [
        tag,
        JSON.stringify(release),
        setting ? JSON.stringify(setting) : null,
        setting ? 'ready' : 'no-setting'
      ]
    )
  const published = (name, at) => ({
    name,
    kind: 'quickstart',
    github: 'published',
    publishedAt: at,
    assets: []
  })
  await insert(
    J6,
    {
      ...published('Quickstart: Tracy Business / Joomla 6', '2026-09-13T11:21:00Z'),
      // The release's own asset list: the setting names files, GitHub pins their size and id.
      assets: [
        { name: 'tracy-business-j6-webroot-1.0.0.tar.gz', size: 41000000, id: 559000001 },
        { name: 'tracy-business-j6-database-1.0.0.sql.gz', size: 900000, id: 559000002 },
        { name: 'tracy_setting.json', size: 400, id: 559000003 }
      ]
    },
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'Tracy Business',
      version: '1.0.0',
      cms: '6.1.1',
      install: {
        webroot: { file: 'tracy-business-j6-webroot-1.0.0.tar.gz', sha256: 'a'.repeat(64) },
        database: { file: 'tracy-business-j6-database-1.0.0.sql.gz', sha256: 'b'.repeat(64) }
      },
      template: 'tracy'
    }
  )
  await insert(EMDASH, published('Quickstart: Tracy Business / EmDash 0.37', '2026-09-15T17:30:00Z'), {
    schemaVersion: 'tracy-setting/v1',
    platform: 'emdash',
    label: 'Tracy Business',
    version: '1.0.0',
    cms: '0.37.0',
    install: {
      source: { file: 'q.zip', sha256: 'c'.repeat(64) },
      state: { file: 's.tar.gz', sha256: 'd'.repeat(64) }
    }
  })
  await insert(
    'quickstart/ja-kinetic/j6',
    { ...published('Quickstart: ja_kinetic / Joomla 6', '2026-09-14T10:55:00Z'), github: 'prerelease' },
    null
  )
}

test(
  'the list names every installable quickstart with its demo address, and only staff may read it',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const h = harness(pool, fakeHost().fetchImpl)
    assert.equal((await h.get('/api/ops/demos')).status, 302, 'no session: sent to sign in')
    await pool.query("insert into account (email) values ('nobody@tracy.test')")
    assert.equal((await h.get('/api/ops/demos', await h.cookieFor('nobody@tracy.test'))).status, 403)

    const res = await h.get('/api/ops/demos', await h.cookieFor('owner@tracy.test'))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.writable, true)
    assert.equal(body.host, 'demo', 'the host demos are put on, by name')
    assert.deepEqual(
      body.demos.map((d) => [d.tag, d.platform, d.label, d.address, d.pinned, d.deployed]),
      [
        [EMDASH, 'emdash', 'business-emdash', 'https://business-emdash.tracy.test/', false, null],
        [J6, 'joomla', 'business-joomla', 'https://business-joomla.tracy.test/', false, null]
      ],
      'newest release first, as the Quickstarts list orders them; a release with no setting has no demo to offer'
    )
  }
)

test('an owner pins a demo address by revision; an editor may look but not write', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedStaff(pool, 'editor@tracy.test', 'editor')
  const h = harness(pool, fakeHost().fetchImpl)
  const owner = await h.cookieFor('owner@tracy.test')
  const editor = await h.cookieFor('editor@tracy.test')

  assert.equal(
    (await h.send('PUT', '/api/ops/demos/domain', editor, { tag: J6, label: 'biz-joomla', revision: 0 }))
      .status,
    403
  )
  assert.equal(
    (await h.send('PUT', '/api/ops/demos/domain', owner, { tag: 'nope/j6', label: 'x', revision: 0 })).status,
    404
  )

  const pinned = await h.send('PUT', '/api/ops/demos/domain', owner, {
    tag: J6,
    label: 'biz-joomla',
    revision: 0
  })
  assert.equal(pinned.status, 200)
  assert.deepEqual(await pinned.json(), { ok: true, revision: 1 })

  const stale = await h.send('PUT', '/api/ops/demos/domain', owner, {
    tag: J6,
    label: 'biz2-joomla',
    revision: 0
  })
  assert.equal(stale.status, 409)
  assert.deepEqual(await stale.json(), { error: 'DEMO_CHANGED' })

  const taken = await h.send('PUT', '/api/ops/demos/domain', owner, {
    tag: EMDASH,
    label: 'biz-joomla',
    revision: 0
  })
  assert.equal(taken.status, 409)
  assert.deepEqual(await taken.json(), { error: 'LABEL_TAKEN', by: J6 })

  const bad = await h.send('PUT', '/api/ops/demos/domain', owner, {
    tag: J6,
    label: 'Biz Joomla',
    revision: 1
  })
  assert.equal(bad.status, 400)

  const list = await (await h.get('/api/ops/demos', editor)).json()
  const j6 = list.demos.find((d) => d.tag === J6)
  assert.deepEqual(
    [j6.label, j6.address, j6.pinned, j6.revision, j6.defaultLabel],
    ['biz-joomla', 'https://biz-joomla.tracy.test/', true, 1, 'business-joomla']
  )
  assert.equal(list.writable, false, 'an editor sees the list read-only')
})

test(
  'Install demo provisions the release on the demo host under its demo address, and the list shows it',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')

    assert.equal(
      (await h.send('POST', '/api/ops/demos/install', owner, { tag: 'quickstart/ja-kinetic/j6' })).status,
      404,
      'no setting, nothing to install'
    )

    const res = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.deepEqual(body, {
      jobId: 'job-provision-1',
      siteKey: 'business-joomla.tracy.test',
      label: 'business-joomla',
      host: 'demo',
      address: 'https://business-joomla.tracy.test/'
    })

    const provision = fake.calls.filter((c) => c.path === '/_host/provision')
    assert.equal(provision.length, 1)
    assert.equal(provision[0].origin, 'http://demo-host', 'the demo host, not the default one')
    assert.deepEqual(provision[0].body, {
      publicOrigin: 'https://cowork.tracy.test',
      site: 'business-joomla.tracy.test',
      siteKey: 'business-joomla.tracy.test',
      liveSite: 'https://business-joomla.tracy.test/',
      label: 'business-joomla',
      platform: 'joomla',
      // Every demo instruction carries the preview origin so an EmDash demo may be framed by the
      // Design inspiration preview — a demo-only field, set here (config.origin) and nowhere on
      // the customer road. It is harmless on a Joomla demo, whose template has no such middleware.
      frameAncestors: 'https://cowork.tracy.test',
      fresh: true,
      quickstart: J6,
      quickstartEntry: {
        platform: 'joomla',
        version: '1.0.0',
        format: 'tracy-setting/v1',
        // Sealed since 21/09: the profile `tracy-business/j6/1.0.0` names this tag, so the
        // entry carries the contract and the minimum Claude Cowork plugin version it needs (`resolveInstall`).
        contract: 'tracy-business/j6/1.0.0',
        coworkMinVersion: '0.15.0',
        webroot: {
          file: 'tracy-business-j6-webroot-1.0.0.tar.gz',
          sha256: 'a'.repeat(64),
          bytes: 41000000,
          githubAssetId: 559000001,
          url: `https://github.com/JoomlArt-Products/joomlart-products/releases/download/${encodeURIComponent(J6)}/tracy-business-j6-webroot-1.0.0.tar.gz`
        },
        database: {
          file: 'tracy-business-j6-database-1.0.0.sql.gz',
          sha256: 'b'.repeat(64),
          bytes: 900000,
          githubAssetId: 559000002,
          url: `https://github.com/JoomlArt-Products/joomlart-products/releases/download/${encodeURIComponent(J6)}/tracy-business-j6-database-1.0.0.sql.gz`
        },
        template: { id: 'tracy' }
      },
      workflow: 'template',
      demo: true,
      // The floor travels as its own flag too: `joomla.sh` refuses a sealed card without
      // `--cowork-min-version`, whatever the entry says (measured 21/09 on ja-voyara 1.0.2).
      coworkMinVersion: '0.15.0',
      ownerEmail: 'owner@tracy.test',
      jobKey: 'demo:business-joomla:1.0.0:1'
    })
    assert.equal(
      fake.calls.some((c) => c.path === '/_host/teardown'),
      false,
      'nothing to tear down the first time'
    )

    const site = (
      await pool.query(
        "select host, platform, demo, quickstart_tag, quickstart_version, quickstart_sha256, origin from site where site_key = 'business-joomla.tracy.test'"
      )
    ).rows[0]
    assert.deepEqual(site, {
      host: 'demo',
      platform: 'joomla',
      demo: true,
      quickstart_tag: J6,
      quickstart_version: '1.0.0',
      quickstart_sha256: 'a'.repeat(64),
      origin: 'demo'
    })
    const job = (await pool.query("select site_key, host, kind, state from job where id = 'job-provision-1'"))
      .rows[0]
    assert.deepEqual(job, {
      site_key: 'business-joomla.tracy.test',
      host: 'demo',
      kind: 'provision',
      state: 'queued'
    })

    const list = await (await h.get('/api/ops/demos', owner)).json()
    const j6 = list.demos.find((d) => d.tag === J6)
    const { deployedAt, ...deployed } = j6.deployed
    assert.deepEqual(deployed, {
      label: 'business-joomla',
      host: 'demo',
      address: 'https://business-joomla.tracy.test/',
      version: '1.0.0',
      jobId: 'job-provision-1',
      kind: 'provision',
      state: 'queued',
      step: null,
      live: false
    })
    assert.ok(
      typeof deployedAt === 'string' && !Number.isNaN(Date.parse(deployedAt)),
      'the latest job carries an ISO deploy time for the column to read'
    )
  }
)

test('polling follows the demo through provision, going public, and a fresh redeploy', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const fake = fakeHost()
  const h = harness(pool, fake.fetchImpl)
  const owner = await h.cookieFor('owner@tracy.test')
  const poll = async (id) => (await h.get(`/api/ops/demos/job?id=${encodeURIComponent(id)}`, owner)).json()
  const paths = () => fake.calls.map((c) => c.path)

  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
  fake.setJob({ state: 'running', step: 'restore' })
  assert.deepEqual(await poll('job-provision-1'), {
    jobId: 'job-provision-1',
    kind: 'provision',
    state: 'running',
    step: 'restore',
    live: false
  })
  assert.equal(
    paths().filter((p) => p === '/_host/address').length,
    0,
    'nothing is published while the host is still building'
  )

  fake.setJob({ state: 'done', step: 'ready', port: 8084 })
  assert.deepEqual(await poll('job-provision-1'), {
    jobId: 'job-provision-1',
    kind: 'provision',
    state: 'done',
    step: 'ready',
    live: true
  })
  const address = fake.calls.find((c) => c.path === '/_host/address')
  assert.deepEqual(address.body, {
    label: 'business-joomla',
    hostname: 'business-joomla.tracy.test',
    port: 8084,
    dns: true
  })
  const goLive = fake.calls.find((c) => c.path === '/_host/go-live')
  assert.deepEqual(goLive.body, {
    label: 'business-joomla',
    op: 'live',
    domains: [],
    publicOrigin: 'https://cowork.tracy.test'
  })
  const site = (
    await pool.query("select publish, address, port from site where site_key = 'business-joomla.tracy.test'")
  ).rows[0]
  assert.deepEqual(site, {
    publish: 'published',
    address: 'https://business-joomla.tracy.test/',
    port: 8084
  })

  const before = fake.calls.length
  assert.equal((await poll('job-provision-1')).live, true)
  assert.equal(fake.calls.length, before + 1, 'a second poll asks the host once and publishes nothing twice')

  // Redeploy: the new release is fetched and verified first, while the old copy still serves; the
  // old copy goes only then, and the new one is asked for once it is gone.
  const again = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
  assert.equal(again.status, 202)
  assert.equal((await again.json()).jobId, 'job-prefetch-1')
  const prefetch = fake.calls.at(-1)
  assert.equal(prefetch.path, '/_host/prefetch')
  assert.equal(prefetch.body.label, 'business-joomla')
  assert.equal(prefetch.body.quickstart, J6)
  assert.equal(prefetch.body.quickstartEntry.version, '1.0.0')
  assert.match(prefetch.body.jobKey, /^demo:business-joomla:prefetch:[0-9a-f]{16}$/)
  assert.equal(paths().filter((p) => p === '/_host/teardown').length, 0, 'nothing comes down yet')

  fake.setJob({ state: 'running', step: 'fetching the new release' })
  const fetching = await poll('job-prefetch-1')
  assert.equal(fetching.live, false, 'a running update is not settled, so the screen keeps following it')
  assert.equal(
    (await pool.query("select publish from site where site_key = 'business-joomla.tracy.test'")).rows[0]
      .publish,
    'published',
    'the old copy serves while the new release is fetched'
  )
  fake.setJob({ state: 'done', step: 'fetched' })
  assert.deepEqual(await poll('job-prefetch-1'), {
    jobId: 'job-teardown-1',
    kind: 'teardown',
    state: 'queued',
    step: null,
    live: false
  })
  assert.equal(fake.calls.at(-1).body.label, 'business-joomla')
  // Derived from the prefetch job, so every poll and the sweep name the same teardown.
  assert.equal(fake.calls.at(-1).body.jobKey, 'demo:business-joomla:teardown:job-prefetch-1')
  assert.match(fake.calls.at(-1).body.jobKey, /^[A-Za-z0-9:._-]{8,120}$/, 'the shape tracy-host accepts')
  assert.equal(paths().filter((p) => p === '/_host/provision').length, 1, 'no second provision yet')
  const teardownsBefore = paths().filter((p) => p === '/_host/teardown').length
  assert.equal(
    (await poll('job-prefetch-1')).jobId,
    'job-teardown-1',
    'a late poll of the prefetch follows it'
  )
  assert.equal(
    paths().filter((p) => p === '/_host/teardown').length,
    teardownsBefore,
    'and asks nothing twice'
  )

  fake.setJob({ state: 'running', step: 'teardown' })
  assert.deepEqual(await poll('job-teardown-1'), {
    jobId: 'job-teardown-1',
    kind: 'teardown',
    state: 'running',
    step: 'teardown',
    live: false
  })
  fake.setJob({ state: 'done', step: 'gone' })
  assert.deepEqual(await poll('job-teardown-1'), {
    jobId: 'job-provision-2',
    kind: 'provision',
    state: 'queued',
    step: null,
    live: false
  })
  const second = fake.calls.filter((c) => c.path === '/_host/provision')[1]
  // A redeploy's key is derived from its teardown job, not an attempt count — the same for every
  // concurrent poll of that teardown, so tracy-host collapses duplicates into one provision.
  assert.equal(second.body.jobKey, 'demo:business-joomla:redeploy:job-teardown-1')
  assert.match(second.body.jobKey, /^[A-Za-z0-9:._-]{8,120}$/, 'the shape tracy-host accepts (SAFE_JOB_KEY)')
  const list = await (await h.get('/api/ops/demos', owner)).json()
  const { deployedAt: redeployAt, ...redeployed } = list.demos.find((d) => d.tag === J6).deployed
  assert.deepEqual(redeployed, {
    label: 'business-joomla',
    host: 'demo',
    address: 'https://business-joomla.tracy.test/',
    version: '1.0.0',
    jobId: 'job-provision-2',
    kind: 'provision',
    state: 'queued',
    step: null,
    live: false
  })
  assert.ok(typeof redeployAt === 'string' && !Number.isNaN(Date.parse(redeployAt)))
})

test(
  'two concurrent polls of a done teardown start ONE provision, not a race of several',
  opts,
  async (t) => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const poll = (id) => h.get(`/api/ops/demos/job?id=${encodeURIComponent(id)}`, owner)

    // Install and go live so a redeploy has an old copy to tear down first.
    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    assert.equal((await (await poll('job-provision-1')).json()).live, true)

    // Redeploy: the install door asks for the teardown; the poll of that teardown is where the new
    // copy is asked for — and a screen (or the cron sweep) can poll it more than once at a time.
    // (A live demo's update fetches first; two polls of that done prefetch ask one teardown key.)
    const again = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
    assert.equal((await again.json()).jobId, 'job-prefetch-1')
    fake.setJob({ state: 'done', step: 'gone' })
    const [pa, pb] = await Promise.all([poll('job-prefetch-1'), poll('job-prefetch-1')])
    assert.equal((await pa.json()).kind, 'teardown')
    assert.equal((await pb.json()).kind, 'teardown')
    const teardownKeys = new Set(
      fake.calls.filter((c) => c.path === '/_host/teardown').map((c) => c.body.jobKey)
    )
    assert.equal(teardownKeys.size, 1, 'concurrent polls of one prefetch name one teardown')

    const provisionsBefore = fake.calls.filter((c) => c.path === '/_host/provision').length
    const [a, b] = await Promise.all([poll('job-teardown-1'), poll('job-teardown-1')])
    const [va, vb] = [await a.json(), await b.json()]

    // Both polls advance the same teardown to the same, single provision.
    assert.equal(va.kind, 'provision')
    assert.equal(vb.kind, 'provision')
    assert.equal(va.jobId, vb.jobId, 'concurrent polls converge on ONE provision job id')

    // Every provision the host was asked for during the redeploy carried the same stable key —
    // that is what lets tracy-host dedup them — and only ONE provision job row was created for it.
    const redeployKeys = new Set(
      fake.calls
        .filter((c) => c.path === '/_host/provision')
        .slice(provisionsBefore)
        .map((c) => c.body.jobKey)
    )
    assert.deepEqual([...redeployKeys], ['demo:business-joomla:redeploy:job-teardown-1'])
    const provisionRows = (
      await pool.query(
        "select count(*)::int as n from job where site_key = 'business-joomla.tracy.test' and kind = 'provision'"
      )
    ).rows[0].n
    assert.equal(provisionRows, 2, 'one provision for the install, one for the redeploy — not three')
    t.diagnostic(`redeploy converged on ${va.jobId}`)
  }
)

test(
  'a template card points its preview at the live demo, and at the authored address until there is one',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    // Both releases of Business carry the card, with a hand-written demo address of the EmDash twin.
    const card = {
      provider: 'JoomlArt',
      template: 'tracy-business',
      image: 'x.png',
      demo: { url: 'https://business-emdash.tracy.ai', version: '0.9.0' }
    }
    for (const tag of [J6, EMDASH])
      await pool.query(`update quickstart_releases set setting = setting || $2::jsonb where tag = $1`, [
        tag,
        JSON.stringify({ card })
      ])
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const cardOf = async () =>
      (await (await h.get('/api/templates')).json()).templates.find((t) => t.id === 'tracy-business')

    let t = await cardOf()
    // Since 20/09 a card's demo also names the door a card asks before framing it (`demo.probe`).
    assert.deepEqual(
      t.card.demo,
      {
        url: 'https://business-emdash.tracy.ai',
        version: '0.9.0',
        probe: 'https://cowork.tracy.test/api/templates/tracy-business/demo-frame'
      },
      'nothing live yet: the authored address stands'
    )
    assert.deepEqual(
      t.platforms.map((p) => [p.platform, p.demo]),
      [
        ['emdash', null],
        ['joomla', null]
      ]
    )

    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    t = await cardOf()
    assert.deepEqual(
      t.card.demo,
      {
        url: 'https://business-emdash.tracy.ai',
        version: '0.9.0',
        probe: 'https://cowork.tracy.test/api/templates/tracy-business/demo-frame'
      },
      'a demo still building is not shown'
    )

    fake.setJob({ state: 'done', step: 'ready', port: 8084 })
    await h.get('/api/ops/demos/job?id=job-provision-1', owner)
    t = await cardOf()
    assert.deepEqual(t.platforms.find((p) => p.platform === 'joomla').demo, {
      url: 'https://business-joomla.tracy.test/',
      version: '1.0.0'
    })
    assert.deepEqual(
      t.card.demo,
      {
        url: 'https://business-joomla.tracy.test/',
        version: '1.0.0',
        probe: 'https://cowork.tracy.test/api/templates/tracy-business/demo-frame'
      },
      'the live demo replaces the authored address: it is the bytes the fleet installs'
    )
  }
)

test(
  'a write is admitted by the PUBLIC origin: behind the tunnel the app sees http while the browser says https',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const h = harness(pool, fakeHost().fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const res = await h.app.fetch(
      new Request('http://cowork.tracy.test/api/ops/demos/domain', {
        method: 'PUT',
        redirect: 'manual',
        headers: { cookie: owner, origin: 'https://cowork.tracy.test', 'content-type': 'application/json' },
        body: JSON.stringify({ tag: J6, label: 'biz-joomla', revision: 0 })
      })
    )
    assert.equal(
      res.status,
      200,
      'TRACY_ORIGIN is https; the tunnel handed the app http; the browser is right'
    )
    const foreign = await h.app.fetch(
      new Request('http://cowork.tracy.test/api/ops/demos/domain', {
        method: 'PUT',
        redirect: 'manual',
        headers: { cookie: owner, origin: 'https://evil.test', 'content-type': 'application/json' },
        body: JSON.stringify({ tag: J6, label: 'biz2-joomla', revision: 1 })
      })
    )
    assert.equal(foreign.status, 403)
  }
)

test(
  'the provision carries a releases token when this deployment has one, so the host can fetch a private release',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const config = readConfig({ ...env, TRACY_RELEASES_GITHUB_TOKEN: 'ghp_' + 'r'.repeat(36) })
    const app = buildApp({
      config,
      pool,
      host,
      mail: { send: async () => {} },
      sites: dbSitesResolver(pool, config),
      fetchImpl: fake.fetchImpl
    })
    const cookie = `tracy_sess=${await mintSession('owner@tracy.test', config.sessionSecret)}`
    const res = await app.fetch(
      new Request('https://cowork.tracy.test/api/ops/demos/install', {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie, origin: 'https://cowork.tracy.test', 'content-type': 'application/json' },
        body: JSON.stringify({ tag: J6 })
      })
    )
    assert.equal(res.status, 202)
    const provision = fake.calls.find((c) => c.path === '/_host/provision')
    assert.equal(provision.body.releasesToken, 'ghp_' + 'r'.repeat(36))
  }
)

import { sweepDemos } from '../src/lib/demo-sites.js'
import { readReleases, releasesToken, resolveInstall } from '../src/lib/quickstart-releases.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

test(
  'the cron sweep takes a demo public and starts the copy a teardown owes — with nobody polling',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const config = readConfig(env)
    const lookups = {
      releases: () => readReleases(pool),
      install: (tag) => resolveInstall(pool, tag),
      token: async () => (await releasesToken(config, fake.fetchImpl)).token
    }
    const sweep = () =>
      sweepDemos(pool, config, {
        host,
        fetchImpl: fake.fetchImpl,
        log: { warn() {}, error() {} },
        releases: lookups
      })

    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    fake.setJob({ state: 'running', step: 'restore' })
    let r = await sweep()
    assert.deepEqual(
      r.advanced.map((a) => [a.tag, a.state, a.live]),
      [[J6, 'running', false]]
    )

    fake.setJob({ state: 'done', step: 'ready', port: 8084 })
    r = await sweep()
    assert.deepEqual(
      r.advanced.map((a) => [a.tag, a.state, a.live]),
      [[J6, 'done', true]]
    )
    assert.equal(fake.calls.filter((c) => c.path === '/_host/go-live').length, 1)
    r = await sweep()
    assert.deepEqual(r.advanced, [], 'a live demo is settled: the sweep leaves it alone')

    // A redeploy: the install door asks for the prefetch; the SWEEP asks for the teardown once the
    // new release is in hand, and for the new copy once the old one is gone.
    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    fake.setJob({ state: 'done', step: 'gone' })
    r = await sweep()
    assert.deepEqual(
      r.advanced.map((a) => [a.tag, a.kind, a.state]),
      [[J6, 'teardown', 'queued']]
    )
    r = await sweep()
    assert.deepEqual(
      r.advanced.map((a) => [a.tag, a.kind, a.state]),
      [[J6, 'provision', 'queued']]
    )
    const second = fake.calls.filter((c) => c.path === '/_host/provision')[1]
    assert.equal(
      second.body.ownerEmail,
      'owner@tracy.test',
      'the presser is remembered on the job, not invented by the clock'
    )
  }
)

/** The env that makes this deployment aware of JoomlArt's machine. Nothing else changes. */
const withJoomlart = {
  DEMO_SERVER_NAME: 'demo-host',
  DEMO_SERVER_IP: '10.0.0.9',
  DEMO_JOOMLART_ZONE: 'demo.joomlart.com',
  DEMO_JOOMLART_SERVER_NAME: 'j-ja-demo',
  DEMO_JOOMLART_SERVER_IP: '203.0.113.46'
}

test('the door names both servers, so the screen can say which machine a press lands on', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedReleases(pool)
  const { get, cookieFor } = harness(pool, fakeHost().fetchImpl, withJoomlart)
  const body = await (await get('/api/ops/demos', await cookieFor('owner@tracy.test'))).json()
  assert.deepEqual(
    body.targets.map((t) => [t.name, t.kind, t.zone, t.serverName, t.serverIp]),
    [
      ['tracy', 'host', 'tracy.test', 'demo-host', '10.0.0.9'],
      ['joomlart', 'record', 'demo.joomlart.com', 'j-ja-demo', '203.0.113.46']
    ]
  )
})

test("a demo on this process's own host goes public without an ingress rule of its own", opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const fake = fakeHost()
  // tracy-web itself runs on the demo host (the dev machine's shape: DEMO_HOST=dev).
  const h = harness(pool, fake.fetchImpl, { HOST_NAME: 'demo' })
  const owner = await h.cookieFor('owner@tracy.test')
  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
  fake.setJob({ state: 'done', step: 'ready', port: 8084 })
  const view = await (await h.get('/api/ops/demos/job?id=job-provision-1', owner)).json()
  assert.equal(view.live, true)
  const paths = fake.calls.map((c) => c.path)
  assert.equal(
    paths.filter((p) => p === '/_host/address').length,
    0,
    'the zone wildcard already lands on tracy-web, whose bar stamps the Create with Tracy pill'
  )
  assert.equal(paths.filter((p) => p === '/_host/go-live').length, 1)
  const site = (
    await pool.query("select publish, port from site where site_key = 'business-joomla.tracy.test'")
  ).rows[0]
  assert.deepEqual(site, { publish: 'published', port: 8084 })
})

test(
  'a demo goes on the server a person picks, moves between servers, and a name outside the list is refused',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    // The dev machine's shape after 22/09: tracy-web runs beside `demo`, and a second machine
    // that only carries demos (no dsh lines at all) sits in the list beside it.
    const h = harness(pool, fake.fetchImpl, {
      HOST_NAME: 'demo',
      HOSTS: 'prod1,demo,fleet01',
      HOST_fleet01_ORIGIN: 'http://fleet01-host',
      HOST_fleet01_SECRET: 'h3',
      DEMO_HOSTS: 'demo=contabo2,fleet01=tracy-fleet-01'
    })
    const owner = await h.cookieFor('owner@tracy.test')
    const poll = async (id) => (await h.get(`/api/ops/demos/job?id=${encodeURIComponent(id)}`, owner)).json()
    const hostOfRow = async () =>
      (await pool.query("select host from site where site_key = 'business-joomla.tracy.test'")).rows[0]?.host
    const since = (n) => fake.calls.slice(n)

    const listing = await (await h.get('/api/ops/demos', owner)).json()
    assert.deepEqual(listing.servers, [
      { name: 'demo', serverName: 'contabo2', serverIp: null },
      { name: 'fleet01', serverName: 'tracy-fleet-01', serverIp: null }
    ])
    assert.equal(listing.defaultServer, 'demo')

    // 🔒 A name outside the list is refused by name — never defaulted onto some machine.
    const wrong = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6, host: 'prod1' })
    assert.equal(wrong.status, 404)
    assert.equal((await wrong.json()).error, 'UNKNOWN_HOST')
    assert.equal(fake.calls.length, 0, 'nothing was asked of any host')

    // Nobody chose: the default demo host, as before.
    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    assert.equal(fake.calls.at(-1).origin, 'http://demo-host')
    fake.setJob({ state: 'done', step: 'ready', port: 8084 })
    assert.equal((await poll('job-provision-1')).live, true)

    // Move it to the second machine: fetched where it is GOING, torn down where it IS, built where
    // it is going. The fetch comes first and changes nothing: the row still names the old machine.
    let mark = fake.calls.length
    const move = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6, host: 'fleet01' })
    assert.equal(move.status, 202)
    const moved = await move.json()
    assert.equal(moved.host, 'fleet01')
    assert.equal(moved.warning, undefined)
    assert.deepEqual(
      since(mark).map((c) => `${c.origin}${c.path}`),
      ['http://fleet01-host/_host/prefetch'],
      'the new release is fetched onto the machine that will run it'
    )
    assert.equal(await hostOfRow(), 'demo', 'nothing moves until the new release is in hand')
    fake.setJob({ state: 'done', step: 'fetched' })
    mark = fake.calls.length
    const teardown = await poll(moved.jobId)
    assert.deepEqual(
      since(mark).map((c) => `${c.origin}${c.path}`),
      ['http://fleet01-host/_host/jobs/job-prefetch-1', 'http://demo-host/_host/teardown'],
      "the old copy sat on this process's own host, which never had a record of its own to take off"
    )
    assert.equal(await hostOfRow(), 'fleet01', 'the row names where the demo is going once the old copy goes')
    mark = fake.calls.length
    await poll(teardown.jobId)
    const built = since(mark).find((c) => c.path === '/_host/provision')
    assert.equal(built.origin, 'http://fleet01-host', 'the new copy is built on the machine that was picked')
    fake.setJob({ state: 'done', step: 'ready', port: 8090 })
    mark = fake.calls.length
    assert.equal((await poll('job-provision-2')).live, true)
    const published = since(mark).map((c) => `${c.origin}${c.path}`)
    assert.ok(published.includes('http://fleet01-host/_host/address'), 'its own hostname at that tunnel')
    assert.ok(published.includes('http://fleet01-host/_host/go-live'))
    const listed = (await (await h.get('/api/ops/demos', owner)).json()).demos.find((d) => d.tag === J6)
    assert.equal(listed.deployed.host, 'fleet01')
    assert.equal(listed.address, 'https://business-joomla.tracy.test/', 'the address does not move with it')

    // A redeploy with no server named stays where the demo is.
    mark = fake.calls.length
    const again = await (await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).json()
    assert.equal(again.host, 'fleet01')
    assert.deepEqual(
      since(mark).map((c) => `${c.origin}${c.path}`),
      ['http://fleet01-host/_host/prefetch']
    )
    fake.setJob({ state: 'done', step: 'gone' })
    const againTeardown = await poll(again.jobId)
    assert.equal(fake.calls.at(-1).origin, 'http://fleet01-host')
    mark = fake.calls.length
    await poll(againTeardown.jobId)
    assert.equal(since(mark).find((c) => c.path === '/_host/provision').origin, 'http://fleet01-host')
    fake.setJob({ state: 'done', step: 'ready', port: 8090 })
    await poll('job-provision-3')

    // And back: leaving the second machine takes its own DNS record with it, or the record would
    // outrank the zone's wildcard and the copy on this host would answer 404.
    mark = fake.calls.length
    const back = await (
      await h.send('POST', '/api/ops/demos/install', owner, { tag: J6, host: 'demo' })
    ).json()
    assert.equal(back.host, 'demo')
    assert.deepEqual(
      since(mark).map((c) => `${c.origin}${c.path}`),
      ['http://demo-host/_host/prefetch']
    )
    fake.setJob({ state: 'done', step: 'fetched' })
    mark = fake.calls.length
    const backTeardown = await poll(back.jobId)
    const leaving = since(mark).filter((c) => !c.path.startsWith('/_host/jobs/'))
    assert.deepEqual(
      leaving.map((c) => `${c.origin}${c.path}`),
      ['http://fleet01-host/_host/teardown', 'http://fleet01-host/_host/address']
    )
    assert.deepEqual(leaving[1].body, {
      label: 'business-joomla',
      hostname: 'business-joomla.tracy.test',
      remove: true,
      dns: true
    })
    fake.setJob({ state: 'done', step: 'gone' })
    mark = fake.calls.length
    await poll(backTeardown.jobId)
    assert.equal(since(mark).find((c) => c.path === '/_host/provision').origin, 'http://demo-host')
    assert.equal(await hostOfRow(), 'demo')
  }
)

test(
  'without a login, the JoomlArt listing says what is missing instead of drawing a dead Install',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedReleases(pool)
    // `withJoomlart` names the machine but configures no way in — the shape a deployment has
    // before anyone gives it the key.
    const { get, send, cookieFor } = harness(pool, fakeHost().fetchImpl, withJoomlart)
    const cookie = await cookieFor('owner@tracy.test')
    const listing = await (await get('/api/ops/demos?target=joomlart', cookie)).json()
    assert.equal(listing.zone, 'demo.joomlart.com')
    assert.equal(listing.writable, false)
    assert.match(listing.reason, /j-ja-demo/)

    // And the refusal is by NAME at the door, not merely a greyed button: a press that got
    // through anyway must not start work against a server this deployment cannot reach.
    const refused = await send('POST', '/api/ops/demos/install', cookie, {
      tag: J6,
      target: 'joomlart'
    })
    assert.equal(refused.status, 503)
    assert.equal((await refused.json()).error, 'NO_SSH_FOR_TARGET')
  }
)

test(
  'with a login, a quickstart that is not an installer package is refused rather than half-started',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedReleases(pool)
    const { get, send, cookieFor } = harness(pool, fakeHost().fetchImpl, {
      ...withJoomlart,
      DEMO_JOOMLART_SSH_HOST: '127.0.0.1',
      DEMO_JOOMLART_SSH_PORT: '1',
      DEMO_JOOMLART_SSH_USER: 'nobody',
      DEMO_JOOMLART_SSH_KEY: 'not-a-key'
    })
    const cookie = await cookieFor('owner@tracy.test')
    // Installable now: a record target with a way in is one Install may be pressed on.
    const answer = await get('/api/ops/demos?target=joomlart', cookie)
    const raw = await answer.text()
    const listing = JSON.parse(raw)
    assert.equal(listing.writable, true)
    assert.equal(listing.reason, null)
    // The way in stays on the server: until 23/09 the listing carried the machine's private key.
    assert.ok(!raw.includes('not-a-key'), 'the ssh key never leaves the server')
    assert.ok(
      listing.targets.every((t) => !('ssh' in t)),
      'no target carries its ssh block'
    )

    // `J6` is a Tracy release captured as webroot+database, not a Joomla installer zip. Refused
    // by name BEFORE anything is downloaded or dialled — the 77 MB is the expensive half.
    const refused = await send('POST', '/api/ops/demos/install', cookie, {
      tag: J6,
      target: 'joomlart'
    })
    assert.equal(refused.status, 409)
    assert.equal((await refused.json()).error, 'NOT_AN_INSTALLER_QUICKSTART')
  }
)

test(
  'a target this deployment never heard of is refused, never quietly treated as Tracy’s own',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedReleases(pool)
    const { get, send, cookieFor } = harness(pool, fakeHost().fetchImpl, withJoomlart)
    const cookie = await cookieFor('owner@tracy.test')
    assert.equal((await get('/api/ops/demos?target=elsewhere', cookie)).status, 404)
    assert.equal(
      (await send('POST', '/api/ops/demos/install', cookie, { tag: J6, target: 'elsewhere' })).status,
      404
    )
  }
)

test('a target with no login says so, instead of drawing addresses it has never checked', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedReleases(pool)
  const { get, cookieFor } = harness(pool, fakeHost().fetchImpl, withJoomlart)
  const cookie = await cookieFor('owner@tracy.test')
  // `withJoomlart` declares the zone and the machine, but no SSH credentials — the shape a
  // deployment has before anyone gives it the key.
  const answer = await get('/api/ops/demos/present?target=joomlart', cookie)
  assert.equal(answer.status, 503)
  assert.equal((await answer.json()).error, 'NO_SSH_FOR_TARGET')
})

test(
  'asking a target this deployment never heard of is refused before any login is attempted',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedReleases(pool)
    const { get, cookieFor } = harness(pool, fakeHost().fetchImpl, withJoomlart)
    const cookie = await cookieFor('owner@tracy.test')
    assert.equal((await get('/api/ops/demos/present?target=elsewhere', cookie)).status, 404)
    assert.equal((await get('/api/ops/demos/on-server?target=elsewhere&label=x', cookie)).status, 404)
  }
)

test('a demo name outside the shape never reaches the far side', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedReleases(pool)
  const { get, cookieFor } = harness(pool, fakeHost().fetchImpl, {
    ...withJoomlart,
    DEMO_JOOMLART_SSH_HOST: '127.0.0.1',
    DEMO_JOOMLART_SSH_PORT: '1',
    DEMO_JOOMLART_SSH_USER: 'nobody',
    DEMO_JOOMLART_SSH_KEY: 'not-a-key'
  })
  const cookie = await cookieFor('owner@tracy.test')
  // Port 1 would refuse the connection in milliseconds — so a `../../etc` that came back with
  // INVALID_LABEL proves the name was judged HERE, before a socket was opened at all.
  const answer = await get('/api/ops/demos/on-server?target=joomlart&label=../../etc', cookie)
  assert.equal(answer.status, 400)
  assert.equal((await answer.json()).error, 'INVALID_LABEL')
})

test(
  "the history door lists a demo's jobs newest-first, staff only, unknown tag/target 404s, no jobs is empty",
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const h = harness(pool, fakeHost().fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')

    // Jobs are recorded under `<label>.<siteDomain>`, the same site_key `install` derives (no site
    // row is needed — the door reads the label from the demo domain and the jobs by that key).
    const siteKey = 'business-joomla.tracy.test'
    const jobRow = (id, kind, state, step, ago) =>
      pool.query(
        `insert into job (id, site_key, host, kind, state, step, created_at)
         values ($1, $2, 'demo', $3, $4, $5, now() - $6::interval)`,
        [id, siteKey, kind, state, step, ago]
      )
    await jobRow('j-old', 'provision', 'failed', 'restore', '2 hours')
    await jobRow('j-new', 'teardown', 'done', 'gone', '1 minute')

    const path = `/api/ops/demos/history?tag=${encodeURIComponent(J6)}`
    assert.equal((await h.get(path)).status, 302, 'no session: sent to sign in')
    await pool.query("insert into account (email) values ('nobody@tracy.test')")
    assert.equal((await h.get(path, await h.cookieFor('nobody@tracy.test'))).status, 403)

    const res = await h.get(path, owner)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const body = await res.json()
    assert.equal(body.siteKey, siteKey)
    assert.deepEqual(
      body.jobs.map((j) => [j.jobId, j.kind, j.state, j.step]),
      [
        ['j-new', 'teardown', 'done', 'gone'],
        ['j-old', 'provision', 'failed', 'restore']
      ],
      'newest first'
    )
    assert.ok(
      typeof body.jobs[0].createdAt === 'string' && !Number.isNaN(Date.parse(body.jobs[0].createdAt)),
      'each job carries an ISO created_at'
    )

    const unknown = await h.get('/api/ops/demos/history?tag=nope%2Fj6', owner)
    assert.equal(unknown.status, 404)
    assert.deepEqual(await unknown.json(), { error: 'UNKNOWN_QUICKSTART' })

    // An explicit target this deployment does not carry is refused by name, never defaulted onto
    // the wrong machine — the same guard the install and listing doors keep.
    const badTarget = await h.get(
      `/api/ops/demos/history?tag=${encodeURIComponent(J6)}&target=joomlart`,
      owner
    )
    assert.equal(badTarget.status, 404)
    assert.deepEqual(await badTarget.json(), { error: 'UNKNOWN_TARGET' })

    const empty = await (
      await h.get(`/api/ops/demos/history?tag=${encodeURIComponent(EMDASH)}`, owner)
    ).json()
    assert.deepEqual(empty, { tag: EMDASH, siteKey: 'business-emdash.tracy.test', jobs: [] })
  }
)

test(
  'removing a demo tears it down and forgets the row, so the release reads as not installed',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const poll = async (id) => (await h.get(`/api/ops/demos/job?id=${encodeURIComponent(id)}`, owner)).json()
    const siteKey = 'business-joomla.tracy.test'
    const rowsOf = async () =>
      (await pool.query('select count(*)::int as n from site where site_key = $1', [siteKey])).rows[0].n

    // A demo has to exist before it can be removed, and it has to be live: the row is only
    // interesting to this door once the host is actually holding containers for it.
    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    fake.setJob({ state: 'done', step: 'ready', port: 8084 })
    assert.equal((await poll('job-provision-1')).live, true)
    assert.equal(await rowsOf(), 1)

    const asked = await h.send('DELETE', `/api/ops/demos?tag=${encodeURIComponent(J6)}`, owner)
    assert.equal(asked.status, 202, 'a removal answers a job, like every other demo press')
    const { jobId } = await asked.json()
    assert.equal(jobId, 'job-teardown-1')
    const [teardown, forgot] = fake.calls.slice(-2)
    assert.deepEqual(teardown.body, { label: 'business-joomla' })
    assert.equal(
      teardown.path,
      '/_host/teardown',
      'the host is asked to tear the demo down, not to build anything'
    )
    // The demo sat on a host other than this process's own, so its own hostname — rule AND DNS
    // record — is taken off that host too. Left behind, the record would outrank the zone's
    // wildcard and answer 404 for the same address installed again anywhere else.
    assert.equal(forgot.path, '/_host/address')
    assert.deepEqual(forgot.body, {
      label: 'business-joomla',
      hostname: 'business-joomla.tracy.test',
      remove: true,
      dns: true
    })
    assert.equal(await rowsOf(), 1, 'the row survives until the host says the containers are gone')

    fake.setJob({ state: 'running', step: 'teardown' })
    assert.equal((await poll(jobId)).removed, undefined, 'nothing is forgotten mid-teardown')
    assert.equal(await rowsOf(), 1)

    fake.setJob({ state: 'done', step: 'gone' })
    const settled = await poll(jobId)
    assert.equal(settled.kind, 'remove')
    assert.equal(settled.removed, true)
    assert.equal(await rowsOf(), 0, 'the row is gone, so the screen draws the tag as not installed')

    // 🔒 THE REMOVAL IS NOT A REDEPLOY IN DISGUISE. A `teardown` that finishes asks the host for a
    // fresh copy; this one must not, or "remove" would put the demo straight back.
    assert.equal(
      fake.calls.filter((c) => c.path === '/_host/provision').length,
      1,
      'no second provision was ever asked for'
    )

    // The job outlives the row on purpose (it is the history of the address), but the poll reads
    // it through the site, so the demo that is gone answers as gone.
    assert.equal((await h.get(`/api/ops/demos/job?id=${jobId}`, owner)).status, 404)
    assert.equal(
      (await pool.query('select count(*)::int as n from job where site_key = $1', [siteKey])).rows[0].n > 0,
      true,
      'the deploy history is kept'
    )
  }
)

test('a removal is refused for a tag with no demo, and for anyone but an owner or admin', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  await seedStaff(pool, 'editor@tracy.test', 'developer')
  const fake = fakeHost()
  const h = harness(pool, fake.fetchImpl)
  const owner = await h.cookieFor('owner@tracy.test')
  const editor = await h.cookieFor('editor@tracy.test')

  const none = await h.send('DELETE', `/api/ops/demos?tag=${encodeURIComponent(J6)}`, owner)
  assert.equal(none.status, 404)
  assert.equal((await none.json()).error, 'NO_DEMO')

  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
  assert.equal(
    (await h.send('DELETE', `/api/ops/demos?tag=${encodeURIComponent(J6)}`, editor)).status,
    403,
    'a developer may read the screen and may not empty it'
  )
})

test('a failed provision says the line it died on, not only "provision"', async () => {
  const { failureReason } = await import('../src/lib/demo-sites.js')
  // The three tails measured on the dev host 21/09 — each read "Failed at provision" on the screen.
  const checksum = [
    '!! tracy/web-joomla:6-apache-20260913-r1 is not built on this host',
    '   staying on joomla:6-apache, whose agent has no git/rg/jq',
    '==> fetching the quickstart package (ja-teline-v-j6-quickstart.zip)',
    'quickstart checksum mismatch',
    '[stage]     3s  +2s    ja-teline-v-joomla.tracy.site',
    '[stage] ── 3s total, slowest stages first ──'
  ].join('\n')
  assert.equal(failureReason({ state: 'failed', output: checksum }), 'quickstart checksum mismatch')
  const floor = [
    '==> this card is sealed by ja-voyara/j6/1.0.2',
    '!! ja-voyara/j6/1.0.2 seals this card but no --cowork-min-version was passed; refusing to install a Claude Cowork plugin that may not bind',
    '[stage]     4s  +3s    starting database'
  ].join('\n')
  assert.match(
    failureReason({ output: floor }) ?? '',
    /^ja-voyara\/j6\/1\.0\.2 seals this card but no --cowork-min-version/
  )
  const fatal = [
    'Contract Claude Cowork plugin installed',
    '[21-Sep-2026 10:09:07 UTC] PHP Fatal error:  Uncaught RuntimeException: Cowork token probe failed in Standard input code:133',
    'Stack trace:',
    '#0 {main}',
    '  thrown in Standard input code on line 133'
  ].join('\n')
  assert.match(
    failureReason({ output: fatal }) ?? '',
    /^PHP Fatal error: {2}Uncaught RuntimeException: Cowork token probe failed/
  )
  // A thrown error is its own reason; a pointer to a log file on the host is not one.
  assert.equal(failureReason({ detail: 'spawn bash ENOENT' }), 'spawn bash ENOENT')
  assert.equal(failureReason({ detail: 'see /var/lib/tracy-host/logs/provision-x.log', output: '' }), null)
  assert.equal(failureReason(null), null)
})

// ── #827 regression: a demo the sweep redeploys must have a sender, and no invented identity ────
//
// Measured 11/10/2026 on dev: every EmDash demo redeploy died at `configure-mail` with "the sender
// is not a plain email address", because the sweep provisioned with `ownerEmail: demo-sweep@tracy`.
// The presser's `by` had been lost: every poll that sees a new state writes the host's answer over
// `detail` (`noteDemoJob`), so a teardown polled once while still running forgot who pressed it.

const withSiteMail = { SITE_MAIL_DOMAIN: 'sites.tracy.test' }

/** Install EmDash, take it live, press again (a redeploy), and let the sweep see the teardown run then end. */
async function sweepRedeploy(pool, { forgetPresser = false } = {}) {
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const fake = fakeHost()
  const h = harness(pool, fake.fetchImpl, withSiteMail)
  const owner = await h.cookieFor('owner@tracy.test')
  const config = readConfig({ ...env, ...withSiteMail })
  const lookups = {
    releases: () => readReleases(pool),
    install: (tag) => resolveInstall(pool, tag),
    token: async () => (await releasesToken(config, fake.fetchImpl)).token
  }
  const sweep = () =>
    sweepDemos(pool, config, {
      host,
      fetchImpl: fake.fetchImpl,
      log: { warn() {}, error() {} },
      releases: lookups
    })

  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: EMDASH })).status, 202)
  fake.setJob({ state: 'done', step: 'ready', port: 8084 })
  await sweep()
  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: EMDASH })).status, 202)
  // The update fetches the new release first; done, the sweep asks for the teardown.
  fake.setJob({ state: 'done', step: 'fetched' })
  await sweep()
  // The teardown is polled while it still runs: this is the write that used to drop `by`.
  fake.setJob({ state: 'running', step: 'teardown' })
  await sweep()
  // A row written before `by` was kept (or by hand) has no presser at all.
  if (forgetPresser) await pool.query("update job set detail = '{}'::jsonb where kind = 'teardown'")
  fake.setJob({ state: 'done', step: 'gone' })
  const r = await sweep()
  assert.deepEqual(
    r.advanced.map((a) => [a.tag, a.kind, a.state]),
    [[EMDASH, 'provision', 'queued']]
  )
  return fake.calls.filter((c) => c.path === '/_host/provision').at(-1).body
}

test(
  'a sweep-driven redeploy keeps the presser through a poll that rewrote the job, and gives the site its relay sender',
  opts,
  async () => {
    const body = await sweepRedeploy(db.pool)
    assert.equal(body.ownerEmail, 'owner@tracy.test', 'the presser survives a poll of the running teardown')
    assert.equal(body.mailSender, 'business-emdash@sites.tracy.test')
  }
)

test(
  'a sweep-driven redeploy with no known presser names no owner, never demo-sweep@tracy, and still has a sender',
  opts,
  async () => {
    const body = await sweepRedeploy(db.pool, { forgetPresser: true })
    assert.equal(Object.hasOwn(body, 'ownerEmail') && body.ownerEmail != null, false, JSON.stringify(body))
    assert.doesNotMatch(JSON.stringify(body), /demo-sweep@tracy/)
    assert.equal(body.mailSender, 'business-emdash@sites.tracy.test')
  }
)

test('a failed mail step says the helper line, not the generic refusal printed after it', async () => {
  const { failureReason } = await import('../src/lib/demo-sites.js')
  const tail = [
    "==> routing this site's mail through the Tracy relay",
    'configure-mail: the site has no sender address and no owner email was passed — none is invented',
    "!! could not configure this site's mail — refusing to mark this site ready",
    '!! provision failed at post_up',
    '[stage]    61s  +2s    business-emdash'
  ].join('\n')
  assert.equal(
    failureReason({ state: 'failed', output: tail }),
    'configure-mail: the site has no sender address and no owner email was passed — none is invented'
  )
})

test("a Joomla CLI installer failure says the installer's error, never its usage synopsis", async () => {
  const { failureReason } = await import('../src/lib/demo-sites.js')
  // Symfony Console's shape when a command throws (ja-restaurant 1.0.0): the error block is indented,
  // and the unindented line after it is the usage synopsis.
  const block = [
    "==> building the quickstart with Joomla's own CLI installer",
    '',
    'In InstallCommand.php line 123:',
    '',
    '  Table jos_users already exists  ',
    '',
    '',
    'install [--site-name SITE-NAME] [--admin-user ADMIN-USER] [--db-pass [DB-PASS]] [--db-prefix DB-PREFIX]',
    ''
  ]
  assert.equal(failureReason({ output: block.join('\n') }), 'Table jos_users already exists')
  // A host with the new joomla.sh adds its own line; later generic lines do not hide it.
  const named = [...block, '!! installer: Table jos_users already exists', '!! provision failed at post_up']
  assert.equal(failureReason({ output: named.join('\n') }), 'installer: Table jos_users already exists')
  // A usage synopsis alone is no reason at all.
  assert.equal(failureReason({ output: block.at(-2) }), null)
})

// ── One press, at most one job (11/10/2026, ja-restaurant on dev) ────────────────────────────────
//
// One Retry install left three provision jobs inside 35 seconds, all racing over one label. The
// door had no notion of "a job is already running here": every request that reached it started
// another one. It now refuses by name while the address's latest job is in flight, and two
// requests that arrive together start one job between them.

test('a second install while one is in flight is refused by name and starts nothing', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const fake = fakeHost()
  const h = harness(pool, fake.fetchImpl)
  const owner = await h.cookieFor('owner@tracy.test')
  const provisions = () => fake.calls.filter((c) => c.path === '/_host/provision').length
  const jobs = async () =>
    (await pool.query("select count(*)::int as n from job where site_key = 'business-joomla.tracy.test'"))
      .rows[0].n

  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
  const again = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
  assert.equal(again.status, 409)
  assert.equal((await again.json()).error, 'DEMO_BUSY')
  assert.equal(provisions(), 1, 'the host was asked once')
  assert.equal(await jobs(), 1, 'one job row for one press')

  // Running, as the host reports it after the first poll: still busy.
  fake.setJob({ state: 'running', step: 'provision' })
  await h.get('/api/ops/demos/job?id=job-provision-1', owner)
  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 409)
  assert.equal(provisions(), 1)
})

test('two installs that arrive together start one job between them', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const fake = fakeHost()
  const h = harness(pool, fake.fetchImpl)
  const owner = await h.cookieFor('owner@tracy.test')
  const answers = await Promise.all([
    h.send('POST', '/api/ops/demos/install', owner, { tag: J6 }),
    h.send('POST', '/api/ops/demos/install', owner, { tag: J6 }),
    h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
  ])
  assert.deepEqual(answers.map((a) => a.status).sort(), [202, 409, 409])
  assert.equal(fake.calls.filter((c) => c.path === '/_host/provision').length, 1)
})

test(
  'a retry after a failed install tears the broken copy down first, then builds the new one',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const poll = async (id) => (await h.get(`/api/ops/demos/job?id=${encodeURIComponent(id)}`, owner)).json()

    // The first attempt dies on the copy an earlier broken attempt left in the label's directory.
    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    fake.setJob({
      state: 'failed',
      step: 'provision',
      output: 'quickstart restore refuses a nonempty site not owned by this provision'
    })
    const failed = await poll('job-provision-1')
    assert.equal(failed.state, 'failed')
    assert.match(failed.reason, /refuses a nonempty site/)

    // Retry: the copy at the address goes first, as it does for a live one.
    const retry = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
    assert.equal(retry.status, 202)
    assert.equal((await retry.json()).jobId, 'job-teardown-1')
    const teardown = fake.calls.filter((c) => c.path === '/_host/teardown')
    assert.equal(teardown.length, 1)
    assert.equal(teardown[0].body.label, 'business-joomla')
    // Named, so the door knows the host's id before it answers (`handOff`).
    assert.match(teardown[0].body.jobKey, /^demo:business-joomla:teardown:[0-9a-f]{16}$/)
    assert.equal(fake.calls.filter((c) => c.path === '/_host/provision').length, 1, 'nothing built yet')

    // The teardown done, the poll asks for the new copy under the teardown's own key.
    fake.setJob({ state: 'done', step: 'gone' })
    await poll('job-teardown-1')
    const provisions = fake.calls.filter((c) => c.path === '/_host/provision')
    assert.equal(provisions.length, 2)
    assert.equal(provisions[1].body.jobKey, 'demo:business-joomla:redeploy:job-teardown-1')
  }
)

test(
  'the listing says what kind of job is in flight, so a reload mid-removal reads as a removal',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    let j6 = (await (await h.get('/api/ops/demos', owner)).json()).demos.find((d) => d.tag === J6)
    assert.equal(j6.deployed.kind, 'provision')
    fake.setJob({ state: 'done', step: 'ready', port: 8084 })
    await h.get('/api/ops/demos/job?id=job-provision-1', owner)
    assert.equal((await h.send('DELETE', `/api/ops/demos?tag=${encodeURIComponent(J6)}`, owner)).status, 202)
    j6 = (await (await h.get('/api/ops/demos', owner)).json()).demos.find((d) => d.tag === J6)
    assert.equal(j6.deployed.kind, 'remove')
  }
)

/**
 * 12/10/2026 on dev: eight provisions already running on fleet01, then installs pressed one after
 * another. The first held its request for about 40 s waiting on the demo host before its 202; the
 * next thirteen came back as Cloudflare's own 502 page, not as anything this door wrote. So the door
 * bounds its wait on the host, and a host that cannot take the job is a JSON 503 with a reason and
 * a Retry-After, never a 502 and never a request held open until the proxy gives up.
 */
function busyHost(answer) {
  const fake = fakeHost()
  const asked = []
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname
    if (path === '/_host/provision' || path === '/_host/teardown') {
      asked.push(JSON.parse(init.body))
      return answer(init)
    }
    return fake.fetchImpl(url, init)
  }
  return { fetchImpl, asked }
}

test('a demo host answering 502 is a JSON 503 with a reason, never our own 502', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  // What a Cloudflare tunnel in front of a busy tracy-host hands back: an HTML error page.
  const host = busyHost(
    async () =>
      new Response('<!DOCTYPE html><html><title>502 Bad gateway</title></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' }
      })
  )
  const h = harness(pool, host.fetchImpl)
  const owner = await h.cookieFor('owner@tracy.test')
  const res = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
  assert.equal(res.status, 503)
  assert.match(res.headers.get('content-type') ?? '', /application\/json/)
  assert.equal(res.headers.get('retry-after'), '60')
  const body = await res.json()
  assert.equal(body.error, 'DEMO_HOST_UNAVAILABLE')
  assert.equal(body.host, 'demo')
  assert.match(body.reason, /demo/)
  assert.match(body.reason, /502/)
})

test('a demo host that does not answer is given a bounded wait, then a JSON 503', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  // Never answers; gives up only when the caller's own signal aborts, as a real socket would.
  const host = busyHost(
    (init) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
  )
  const h = harness(pool, host.fetchImpl, {}, { demoHostCallTimeoutMs: 200 })
  const owner = await h.cookieFor('owner@tracy.test')
  const started = Date.now()
  const res = await Promise.race([
    h.send('POST', '/api/ops/demos/install', owner, { tag: J6 }),
    new Promise((resolve) => setTimeout(() => resolve(null), 5000))
  ])
  assert.ok(res, 'the door answered instead of holding the request open')
  assert.ok(Date.now() - started < 3000, `answered in ${String(Date.now() - started)} ms`)
  assert.equal(res.status, 503)
  const body = await res.json()
  assert.equal(body.error, 'DEMO_HOST_UNAVAILABLE')
  assert.match(body.reason, /did not answer/)

  // Pressed again once the host is free: the SAME attempt name, so a provision the host did start
  // behind our timeout is answered as that job (tracy-host `keyedJobId`), never started twice.
  const first = host.asked[0].jobKey
  const free = fakeHost()
  const h2 = harness(pool, free.fetchImpl)
  assert.equal((await h2.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
  const again = free.calls.find((c) => c.path === '/_host/provision')
  assert.equal(again.body.jobKey, first)
})

/** The id tracy-host gives a named job (`keyedJobId`, apps/tracy-host/src/app.js). */
const { keyedJobId: hostKeyedJobId } = await import('../../tracy-host/src/app.js')

test(
  'a demo host slower than the quick window: 202 at once with the id the host will use, followed to the end',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    // Takes the provision the way a busy fleet01 did: it answers, but late, under the key's own id.
    const host = busyHost(
      (init) =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                Response.json({ jobId: hostKeyedJobId(JSON.parse(init.body).jobKey) }, { status: 202 })
              ),
            600
          )
        )
    )
    const fetchImpl = (url, init) =>
      new URL(url).pathname.startsWith('/_host/jobs/') ? fake.fetchImpl(url, init) : host.fetchImpl(url, init)
    const h = harness(pool, fetchImpl, {}, { demoHostQuickMs: 50 })
    const owner = await h.cookieFor('owner@tracy.test')
    const started = Date.now()
    const res = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
    assert.ok(
      Date.now() - started < 500,
      `answered in ${String(Date.now() - started)} ms, not after the host`
    )
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.jobId, hostKeyedJobId(host.asked[0].jobKey), 'the id the host is about to use')
    // Queued, not idle: a second press while the host has not answered is refused by name.
    assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 409)
    await new Promise((r) => setTimeout(r, 800))
    fake.setJob({ state: 'running', step: 'starting database' })
    const polled = await (
      await h.get(`/api/ops/demos/job?id=${encodeURIComponent(body.jobId)}`, owner)
    ).json()
    assert.equal(polled.jobId, body.jobId)
    assert.equal(polled.state, 'running')
    assert.equal(host.asked.length, 1, 'asked once')
  }
)

test(
  'a host that never takes the job after a 202: the job reads failed in words, and the next press is a clean retry',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const host = busyHost(
      (init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const h = harness(pool, host.fetchImpl, {}, { demoHostQuickMs: 50, demoHostCallTimeoutMs: 300 })
    const owner = await h.cookieFor('owner@tracy.test')
    const res = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
    assert.equal(res.status, 202)
    const { jobId } = await res.json()
    await new Promise((r) => setTimeout(r, 600))
    const polled = await (await h.get(`/api/ops/demos/job?id=${encodeURIComponent(jobId)}`, owner)).json()
    assert.equal(polled.state, 'failed')
    assert.match(polled.reason, /did not answer/)
    // The host never took that job, so the retry is the same attempt (same key) and nothing is torn
    // down first: there is no broken copy, only an unanswered ask.
    const free = fakeHost()
    const h2 = harness(pool, free.fetchImpl)
    assert.equal((await h2.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
    assert.equal(free.calls.filter((c) => c.path === '/_host/teardown').length, 0)
    assert.equal(free.calls.find((c) => c.path === '/_host/provision').body.jobKey, host.asked[0].jobKey)
  }
)

test('the door predicts the host job id with the same rule tracy-host names a keyed job by', async () => {
  const { keyedJobId } = await import('../src/lib/demo-sites.js')
  for (const key of ['demo:business-joomla:1.0.0:1', 'demo:ja-vogue-joomla:teardown:0123456789abcdef'])
    assert.equal(keyedJobId(key), hostKeyedJobId(key))
})

test('a demo provision says it is a demo, so the host gives it an install slot', opts, async () => {
  const { pool } = db
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const fake = fakeHost()
  const h = harness(pool, fake.fetchImpl)
  const owner = await h.cookieFor('owner@tracy.test')
  assert.equal((await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).status, 202)
  assert.equal(fake.calls.find((c) => c.path === '/_host/provision').body.demo, true)
})

// ── An update never leaves the demo blank (25/10/2026) ───────────────────────────────────────────
//
// JA Boxing 1.0.3 → 1.0.4 on dev: the press tore the live demo down first, then the host's download
// of 1.0.4 was answered 403 (the GitHub App's hourly quota was spent), twice. The public demo was
// blank from 08:56 to 09:08. A download that fails must cost nothing: the old copy keeps serving.
test(
  'an update whose new release cannot be fetched leaves the live demo serving, and says why',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const poll = async (id) => (await h.get(`/api/ops/demos/job?id=${encodeURIComponent(id)}`, owner)).json()

    // A live demo.
    const first = await (await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).json()
    fake.setJob({ state: 'done', step: 'ready', port: 8084 })
    assert.equal((await poll(first.jobId)).live, true)

    // The update: whatever the host is asked first fails on the download.
    const press = await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })
    assert.equal(press.status, 202)
    const { jobId } = await press.json()
    fake.setJob({
      state: 'failed',
      step: 'prefetch',
      output:
        '==> fetching the quickstart package\nquickstart download failed (HTTP 403); GitHub rate limit for the release credential is spent until 2026-10-25T09:05:13Z'
    })
    const view = await poll(jobId)
    assert.equal(view.state, 'failed')

    assert.equal(
      fake.calls.filter((c) => c.path === '/_host/teardown').length,
      0,
      'the live copy was never asked to come down'
    )
    const site = (
      await pool.query("select publish, port from site where site_key = 'business-joomla.tracy.test'")
    ).rows[0]
    assert.deepEqual(site, { publish: 'published', port: 8084 }, 'the old demo still serves')

    const list = await (await h.get('/api/ops/demos', owner)).json()
    const deployed = list.demos.find((d) => d.tag === J6).deployed
    assert.equal(deployed.live, true, 'the screen still shows the demo as live')
    assert.equal(deployed.state, 'failed')
    assert.match(deployed.reason, /403/, 'and says why the update stopped')
  }
)

test(
  'a release published while the update was fetching stops it before anything comes down',
  opts,
  async () => {
    const { pool } = db
    await seedReleases(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const fake = fakeHost()
    const h = harness(pool, fake.fetchImpl)
    const owner = await h.cookieFor('owner@tracy.test')
    const poll = async (id) => (await h.get(`/api/ops/demos/job?id=${encodeURIComponent(id)}`, owner)).json()
    const first = await (await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).json()
    fake.setJob({ state: 'done', step: 'ready', port: 8084 })
    assert.equal((await poll(first.jobId)).live, true)

    const { jobId } = await (await h.send('POST', '/api/ops/demos/install', owner, { tag: J6 })).json()
    await pool.query(
      `update quickstart_releases set setting = jsonb_set(setting, '{version}', '"1.0.1"') where tag = $1`,
      [J6]
    )
    fake.setJob({ state: 'done', step: 'fetched' })
    const view = await poll(jobId)
    assert.equal(view.state, 'failed')
    assert.match(view.reason, /1\.0\.1 was published while 1\.0\.0 was being fetched/)
    assert.equal(fake.calls.filter((c) => c.path === '/_host/teardown').length, 0)
    const site = (await pool.query("select publish from site where site_key = 'business-joomla.tracy.test'"))
      .rows[0]
    assert.equal(site.publish, 'published')
  }
)
