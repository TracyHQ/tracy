/**
 * "Sync from live" doors (`src/sites/live-sync.js`, `GET|POST /api/sites/:key/sync…`): who may, what
 * the host is handed (and what never leaves this process), how the host's answer becomes the row a
 * person sees, decisions, and the resolver that can only pick a side.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/live-sync.test.mjs
 */
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent, currentComponent, notePresence, takeWriteLease } from '../src/sites/store.js'
import { liveSync, openConflicts, partOfTable, phpTooOldOf, view } from '../src/sites/live-sync.js'
import { sweepLiveSyncReads } from '../src/cron.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'live-sync-actor-test-key',
  HOST_NAME: 'local',
  // The import's provision signs its archive keys for the host (`sites/route.js` signGet).
  ARTIFACT_S3_ENDPOINT: 'http://r2.test',
  ARTIFACT_S3_BUCKET: 'artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'AK',
  ARTIFACT_S3_SECRET_KEY: 'SK'
}
const LIVE = 'https://shop.example/index.php?option=com_claudecowork&task=api.exec&format=json'
const COPY = 'http://shop-example-1-web-1/index.php?option=com_claudecowork&task=api.exec&format=json'
const LIVE_TOKEN = 'l'.repeat(40)
const COPY_TOKEN = 'c'.repeat(48)

const CONFLICTED = {
  ok: true,
  state: 'needs_resolution',
  liveReadAt: '2026-10-20T03:37:43Z',
  files: { fromTheirs: 1, merged: 0, tracyOwned: 0 },
  database: { rowsFromTheirs: 2 },
  conflicts: [
    {
      id: 'db:jos_content:["2"]:title',
      kind: 'column',
      table: 'jos_content',
      column: 'title',
      key: { id: '2' },
      values: {
        base: { title: { text: 'Hours' } },
        ours: { title: { text: 'Hours (Tracy)' } },
        theirs: { title: { text: 'When we are open' } }
      }
    },
    {
      id: 'db:jos_content:["3"]',
      kind: 'row',
      table: 'jos_content',
      reason: 'delete-modify',
      key: { id: '3' },
      values: null
    }
  ]
}

/** A host that answers every job with `answers[kind]` (or `{ok:true,state:'applied'}`), and a model. */
function network({ answers = {}, model = '[]' } = {}) {
  const jobs = new Map()
  // `held.on`: every host job says it still runs.
  const held = { on: false }
  const calls = []
  const fetchImpl = async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(init.body) : null
    calls.push({ url, body })
    if (url.endsWith('/_host/site')) {
      const id = `job-${jobs.size + 1}`
      jobs.set(id, body)
      return Response.json({ jobId: id }, { status: 202 })
    }
    const m = /\/_host\/jobs\/(.+)$/.exec(url)
    if (m) {
      const job = jobs.get(m[1])
      if (held.on)
        return Response.json({
          state: 'running',
          step: job.kind,
          progress: ['==> [3s] reading the live site']
        })
      const answer = answers[job.kind] ?? { ok: true, state: 'applied', apply: { ok: true, version: 4 } }
      return Response.json({ state: 'done', step: job.kind, output: `==> done\n${JSON.stringify(answer)}` })
    }
    if (url.endsWith('/chat/completions')) {
      return Response.json({ choices: [{ message: { content: model } }] })
    }
    return new Response('{}', { status: 404 })
  }
  return { fetchImpl, calls, jobs, held }
}

function harness(pool, fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  return { send, cookieFor }
}

async function seat(pool, siteKey, email, role) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, rows[0].id, role]
  )
}

async function importedSite(
  pool,
  {
    platform = 'joomla',
    config = { endpoint: COPY, token: COPY_TOKEN, liveEndpoint: LIVE, liveToken: LIVE_TOKEN }
  } = {}
) {
  await pool.query(
    'insert into site (site_key, label, host, platform, origin, port) values ($1, $2, $3, $4, $5, $6)',
    ['shop.example', 'shop-example-1', 'local', platform, 'migrated', 52001]
  )
  await seat(pool, 'shop.example', 'owner@x.y', 'owner')
  await seat(pool, 'shop.example', 'editor@x.y', 'editor')
  await writeComponent(pool, 'shop.example', config, 'owner@x.y')
}

test(
  'only an owner may sync; the host is handed the live door and token, and no answer carries either',
  opts,
  async () => {
    const { pool } = db
    const net = network()
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)

    const editor = await send('POST', '/api/sites/shop.example/sync', await cookieFor('editor@x.y'))
    assert.equal(editor.status, 403)

    const owner = await cookieFor('owner@x.y')
    const started = await send('POST', '/api/sites/shop.example/sync', owner)
    assert.equal(started.status, 202)
    const startedText = await started.text()
    assert.equal(JSON.parse(startedText).sync.state, 'running')
    const job = [...net.jobs.values()][0]
    assert.equal(job.kind, 'webroot-sync')
    assert.equal(job.endpoint, LIVE)
    assert.equal(job.token, LIVE_TOKEN)

    const read = await send('GET', '/api/sites/shop.example/sync', owner)
    const text = await read.text()
    const answer = JSON.parse(text)
    assert.equal(answer.available, true)
    assert.equal(answer.sync.state, 'applied')
    assert.equal(answer.sync.summary.backup, 4)
    for (const body of [startedText, text]) assert.ok(!body.includes(LIVE_TOKEN) && !body.includes(LIVE))
    const { rows } = await pool.query('select * from site_sync')
    assert.ok(!JSON.stringify(rows).includes(LIVE_TOKEN), 'no token in the row')
  }
)

test(
  'a kept place inside a JSON column says which keys, and a value carrying a NUL is stored all the same',
  opts,
  async () => {
    const { pool } = db
    const ANSWER = {
      ok: true,
      state: 'applied',
      liveReadAt: '2026-10-23T07:20:00Z',
      conflicts: [],
      kept: [
        {
          id: 'db:ng_modules:["441"]:params',
          kind: 'column',
          table: 'ng_modules',
          column: 'params',
          key: { id: '441' },
          fields: ['jatools-config › tb-hero › tb-hero[title]'],
          values: { base: null, ours: null, theirs: null }
        },
        {
          id: 'db:ng_finder_links:["43"]:object',
          kind: 'column',
          table: 'ng_finder_links',
          column: 'object',
          key: { link_id: '43' },
          // PHP's serialized protected property, as Joomla stores an indexed item.
          values: { base: null, ours: { object: { text: 's:7:"\u0000*\u0000data"' } }, theirs: null }
        }
      ],
      apply: { ok: true, version: 9 }
    }
    const net = network({ answers: { 'webroot-sync': ANSWER } })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await send('POST', '/api/sites/shop.example/sync', owner)
    const res = await send('GET', '/api/sites/shop.example/sync', owner)
    assert.equal(res.status, 200)
    const done = (await res.json()).sync
    assert.equal(done.state, 'applied')
    assert.deepEqual(done.kept[0].fields, ['jatools-config › tb-hero › tb-hero[title]'])
    assert.equal(done.kept[1].values.ours.object.text, 's:7:"\uFFFD*\uFFFDdata"')
  }
)

test('a copy that still holds the live token gets its own before the first sync', opts, async () => {
  const { pool } = db
  const net = network({ answers: { 'webroot-sync-copy-token': { ok: true } } })
  const { send, cookieFor } = harness(pool, net.fetchImpl)
  await importedSite(pool, { config: { endpoint: COPY, token: LIVE_TOKEN, liveEndpoint: LIVE } })
  const res = await send('POST', '/api/sites/shop.example/sync', await cookieFor('owner@x.y'))
  assert.equal(res.status, 202)
  const kinds = [...net.jobs.values()].map((j) => j.kind)
  assert.deepEqual(kinds, ['webroot-sync-copy-token', 'webroot-sync'])
  const cred = (await currentComponent(pool, 'shop.example')).config
  assert.notEqual(cred.token, LIVE_TOKEN)
  assert.equal(cred.liveToken, LIVE_TOKEN)
  assert.equal([...net.jobs.values()][0].copyToken, cred.token)
})

test('a site that was not imported, or is neither Joomla nor WordPress, has no sync', opts, async () => {
  const { pool } = db
  const net = network()
  const { send, cookieFor } = harness(pool, net.fetchImpl)
  await importedSite(pool, { platform: 'emdash' })
  const owner = await cookieFor('owner@x.y')
  assert.deepEqual(await (await send('GET', '/api/sites/shop.example/sync', owner)).json(), {
    available: false,
    why: 'platform',
    sync: null
  })
  const res = await send('POST', '/api/sites/shop.example/sync', owner)
  assert.equal(res.status, 409)
  assert.equal((await res.json()).code, 'SYNC_UNSUPPORTED_PLATFORM')
  assert.equal(net.jobs.size, 0)
})

test(
  'a sync that kept Tracy’s side somewhere says where, with what the live site had there',
  opts,
  async () => {
    const { pool } = db
    const KEPT = {
      ok: true,
      state: 'applied',
      liveReadAt: '2026-10-20T03:37:43Z',
      files: { fromTheirs: 1 },
      database: { rowsFromTheirs: 2 },
      conflicts: [],
      kept: CONFLICTED.conflicts,
      apply: { ok: true, version: 6 }
    }
    const net = network({ answers: { 'webroot-sync': KEPT } })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await send('POST', '/api/sites/shop.example/sync', owner)
    const done = (await (await send('GET', '/api/sites/shop.example/sync', owner)).json()).sync
    assert.equal(done.state, 'applied')
    assert.deepEqual(done.conflicts, [])
    assert.deepEqual(
      done.kept.map((c) => c.id),
      ['db:jos_content:["2"]:title', 'db:jos_content:["3"]']
    )
    assert.deepEqual(done.kept[0].values.theirs, { title: { text: 'When we are open' } })
    assert.equal(done.summary.backup, 6)
    for (const gone of ['decisions', 'resolve']) {
      const res = await send('POST', `/api/sites/shop.example/sync/${done.id}/${gone}`, owner, {})
      assert.equal(res.status, 404, `${gone} is no door`)
    }
  }
)

test('pure pieces: open conflicts count settings one by one, and a step reads without its job kind', () => {
  const row = {
    decisions: { 'file:configuration.php#a': 'ours' },
    answer: {
      conflicts: [
        {
          id: 'file:configuration.php',
          kind: 'settings',
          path: 'configuration.php',
          settings: [{ id: 'file:configuration.php#a' }, { id: 'file:configuration.php#b' }]
        }
      ]
    }
  }
  assert.deepEqual(
    openConflicts(row).map((c) => c.id),
    ['file:configuration.php#b']
  )
  const v = view({
    id: 'x',
    state: 'running',
    step: 'webroot-sync:merging',
    created_at: new Date(),
    updated_at: new Date()
  })
  assert.equal(v.step, 'merging')
})

test('pure pieces: an applied sync names what it left out of the live site, and each kept place reads (#1648)', () => {
  const held = {
    id: 'db:ng_phocacart_products:["6"]',
    kind: 'row',
    table: 'ng_phocacart_products',
    reason: 'added-both',
    key: { id: '6' },
    values: { base: null, ours: { title: { text: 'Tracy mug' } }, theirs: { title: { text: 'Live mug' } } },
    belonging: [
      { table: 'ng_phocacart_product_categories', key: { product_id: '6', category_id: '2' } },
      { table: 'ng_phocacart_product_images', key: { id: '1' }, changed: true }
    ],
    belongingCount: 2
  }
  const skipped = {
    id: 'db:ng_action_logs:["37"]',
    kind: 'row',
    table: 'ng_action_logs',
    key: { id: '37' },
    reason: 'log-added-both'
  }
  const answer = {
    held: [held],
    skipped: [skipped],
    kept: [
      // A host before #1648: configuration.php's clashes as one file entry.
      {
        id: 'file:configuration.php',
        kind: 'settings',
        path: 'configuration.php',
        settings: [
          {
            id: 'file:configuration.php#sitename',
            kind: 'setting',
            setting: 'sitename',
            base: "'Shop'",
            ours: "'Shop (Tracy)'",
            theirs: "'Shop & Co'"
          }
        ]
      },
      {
        id: 'db:ng_template_styles:["12"]:params',
        kind: 'column',
        table: 'ng_template_styles',
        column: 'params',
        key: { id: '12' },
        fields: ['logo'],
        fieldValues: [{ path: 'logo', ours: 'tracy.png', theirs: 'live.png' }]
      },
      {
        id: 'db:ng_menu:order:["1", "footer", "0"]',
        kind: 'order',
        table: 'ng_menu',
        key: { parent_id: '1', menutype: 'footer', client_id: '0' },
        base: ['Legal', 'Privacy'],
        ours: ['Privacy', 'Legal'],
        theirs: ['Legal', 'Cookies', 'Privacy']
      }
    ]
  }
  const at = { id: 'x', created_at: new Date(), updated_at: new Date(), answer }
  const applied = view({ ...at, state: 'applied' })
  assert.deepEqual(
    applied.dropped.map((d) => [d.id, d.reason]),
    [['db:ng_phocacart_products:["6"]', 'added-both']],
    'only content records: a skipped log row is not one'
  )
  assert.deepEqual(
    applied.skipped.map((d) => [d.id, d.reason]),
    [['db:ng_action_logs:["37"]', 'log-added-both']],
    'the skipped log rows stay in the record'
  )
  assert.equal(applied.dropped[0].values.theirs.title.text, 'Live mug')
  // The held product's own rows left out with it: named with it, so its category is not lost silently.
  assert.deepEqual(applied.dropped[0].belonging, held.belonging)
  assert.equal(applied.dropped[0].belongingCount, 2)
  assert.deepEqual(applied.kept[0], {
    id: 'file:configuration.php#sitename',
    kind: 'setting',
    reason: null,
    path: 'configuration.php',
    setting: 'sitename',
    base: "'Shop'",
    ours: "'Shop (Tracy)'",
    theirs: "'Shop & Co'"
  })
  assert.deepEqual(applied.kept[1].fieldValues, [{ path: 'logo', ours: 'tracy.png', theirs: 'live.png' }])
  assert.deepEqual(applied.kept[2].ours, ['Privacy', 'Legal'])
  assert.deepEqual(applied.kept[2].theirs, ['Legal', 'Cookies', 'Privacy'])
  // Held and not applied: nothing was left out yet; the held list asks the person.
  const waiting = view({ ...at, state: 'needs_resolution' })
  assert.deepEqual(waiting.dropped, [])
  assert.equal(waiting.held.length, 1)
  assert.deepEqual(waiting.held[0].belonging, held.belonging)
})

test(
  'the sync holds the site write lease while it runs; a session holding it already is answered, not overwritten',
  opts,
  async () => {
    const { pool } = db
    const net = network({
      answers: { 'webroot-sync': { ok: true, state: 'applied', apply: { ok: true, version: 3 } } }
    })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await pool.query(
      `insert into site_write_lease (site_key, holder_session, holder_actor, taken_at, wrote_at) values ('shop.example', 'chat-1', 'editor@x.y', now(), now())`
    )
    const busy = await send('POST', '/api/sites/shop.example/sync', owner)
    assert.equal(busy.status, 409)
    assert.deepEqual(await busy.json(), { code: 'SYNC_SITE_BUSY', holder: 'editor@x.y' })
    assert.equal(net.jobs.size, 0)

    await pool.query(
      `update site_write_lease set holder_session = null, holder_actor = null where site_key = 'shop.example'`
    )
    const started = await send('POST', '/api/sites/shop.example/sync', owner)
    assert.equal(started.status, 202)
    const id = (await started.json()).sync.id
    assert.deepEqual((await pool.query('select holder_session from site_write_lease')).rows, [
      { holder_session: `sync:${id}` }
    ])
    await send('GET', '/api/sites/shop.example/sync', owner)
    assert.deepEqual(
      (await pool.query('select holder_session from site_write_lease')).rows,
      [{ holder_session: null }],
      'released once ended'
    )
  }
)

test(
  'a sync that held records says which, and a person can go on keeping Tracy’s (allowHeld reaches the host)',
  opts,
  async () => {
    const { pool } = db
    const HELD = {
      ok: true,
      state: 'needs_attention',
      conflicts: [],
      kept: [],
      held: [
        { id: 'db:jos_forms:["1"]', kind: 'row', table: 'jos_forms', reason: 'added-both', key: { id: '1' } }
      ]
    }
    const net = network({ answers: { 'webroot-sync': HELD } })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await send('POST', '/api/sites/shop.example/sync', owner)
    const waiting = (await (await send('GET', '/api/sites/shop.example/sync', owner)).json()).sync
    assert.equal(waiting.state, 'needs_resolution')
    assert.deepEqual(
      waiting.held.map((h) => [h.id, h.reason]),
      [['db:jos_forms:["1"]', 'added-both']]
    )
    const again = await send('POST', '/api/sites/shop.example/sync', owner, { allowHeld: true })
    assert.equal(again.status, 202)
    assert.equal([...net.jobs.values()].at(-1).allowHeld, true)
    assert.equal(
      (await send('POST', '/api/sites/shop.example/sync', owner, { allowHeld: 'yes' })).status,
      400
    )
  }
)

test('a site that has not synced for thirty days has the host forget the live read, once', opts, async () => {
  const { pool } = db
  const net = network()
  const { send, cookieFor } = harness(pool, net.fetchImpl)
  await importedSite(pool)
  await send('POST', '/api/sites/shop.example/sync', await cookieFor('owner@x.y'))
  const config = readConfig(env)
  assert.equal(
    await sweepLiveSyncReads(pool, config, { fetchImpl: net.fetchImpl }),
    0,
    'a fresh sync is kept'
  )
  await pool.query(
    `update site_sync set created_at = now() - interval '31 days', updated_at = now() - interval '31 days'`
  )
  assert.equal(await sweepLiveSyncReads(pool, config, { fetchImpl: net.fetchImpl }), 1)
  assert.deepEqual([...net.jobs.values()].at(-1).kind, 'webroot-sync-forget')
  assert.equal(await sweepLiveSyncReads(pool, config, { fetchImpl: net.fetchImpl }), 0, 'asked once')
  const { rows } = await pool.query(`select action from audit where action = 'site.sync.forgotten'`)
  assert.equal(rows.length, 1)
})

test(
  'an applied sync whose tree rebuild failed is failed, not applied: the copy has wrong lft/rgt',
  opts,
  async () => {
    const { pool } = db
    const AFTER = {
      ok: true,
      state: 'applied',
      apply: { ok: true, version: 5, after: { rebuild: 'menu:failed', cache: 'cleared' } }
    }
    const net = network({ answers: { 'webroot-sync': AFTER } })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await send('POST', '/api/sites/shop.example/sync', owner)
    const done = (await (await send('GET', '/api/sites/shop.example/sync', owner)).json()).sync
    assert.equal(done.state, 'failed')
    assert.equal(done.error, 'SYNC_AFTER_FAILED')
    assert.equal(done.summary.backup, 5, 'the point it reached is still said')
  }
)

test(
  'a running sync keeps the write lease from the same account’s newer chat, and past the ten-minute ceiling',
  opts,
  async () => {
    const { pool } = db
    const net = network()
    // A host job that is still running, so the sync stays running.
    const running = async (input, init) => {
      const url = String(input)
      if (/\/_host\/jobs\//.test(url))
        return Response.json({ state: 'running', step: 'webroot-sync:reading' })
      return net.fetchImpl(input, init)
    }
    const { send, cookieFor } = harness(pool, running)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const started = await send('POST', '/api/sites/shop.example/sync', owner)
    assert.equal(started.status, 202)
    await notePresence(pool, {
      siteKey: 'shop.example',
      sessionId: 'chat-new',
      actor: 'owner@x.y',
      preset: null
    })
    const taken = await takeWriteLease(pool, {
      siteKey: 'shop.example',
      sessionId: 'chat-new',
      actor: 'owner@x.y'
    })
    assert.equal(taken.ok, false, 'the Owner’s own new chat waits for the sync')
    await pool.query(
      `update site_write_lease set taken_at = now() - interval '20 minutes' where site_key = 'shop.example'`
    )
    const late = await takeWriteLease(pool, {
      siteKey: 'shop.example',
      sessionId: 'chat-new',
      actor: 'owner@x.y'
    })
    assert.equal(late.ok, false, 'a long first read is not cut by the ceiling')
  }
)

test(
  'while the host job runs, the row carries its real step and the time so far; once ended, all its steps (#1649)',
  opts,
  async () => {
    const { pool } = db
    const net = network()
    const READ =
      '{"ok":true,"liveReadAt":"2026-10-23T09:00:00Z","mode":"incremental","timing":{"database":477},"seconds":480}'
    let progress = ['==> [0s] reading the live site']
    let ended = false
    const host = async (input, init) => {
      const url = String(input)
      if (/\/_host\/jobs\//.test(url)) {
        if (!ended) return Response.json({ state: 'running', step: 'webroot-sync', progress })
        // The output's last lines only: the first steps of a long run fell out of it.
        return Response.json({
          state: 'done',
          step: 'webroot-sync',
          progress,
          output:
            '==> [900s] restored; what Joomla must redo\n{"ok":true,"state":"applied","files":{"fromTheirs":1},"apply":{"ok":true,"version":4}}'
        })
      }
      return net.fetchImpl(input, init)
    }
    const { send, cookieFor } = harness(pool, host)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    assert.equal((await send('POST', '/api/sites/shop.example/sync', owner)).status, 202)
    const read = async () => (await (await send('GET', '/api/sites/shop.example/sync', owner)).json()).sync

    let now = await read()
    assert.equal(now.state, 'running')
    assert.equal(now.step, 'reading')
    assert.deepEqual(now.timing.steps, [{ at: 0, step: 'reading the live site', stage: 'reading' }])

    progress = [...progress, READ, '==> [480s] the live site read', '==> [481s] the copy: sealing its files']
    now = await read()
    assert.equal(now.step, 'merging', 'the read ended: the dialog moves on')
    assert.equal(now.timing.read.seconds, 480)
    assert.equal(now.timing.steps.at(-1).at, 481)
    assert.equal(now.summary, null, 'a running sync has no summary yet')

    // A step outside the stages (a cut-off sync settled first) leaves the stage where it was.
    progress = [
      ...progress,
      '==> [600s] merging the databases',
      '==> [880s] putting the result in place (Restore everything to v4)'
    ]
    assert.equal((await read()).step, 'applying')

    ended = true
    const done = await read()
    assert.equal(done.state, 'applied')
    assert.deepEqual(
      done.timing.steps.map((s) => s.at),
      [0, 480, 481, 600, 880],
      'from the progress the host kept, not the last lines of the output'
    )
    assert.equal(done.timing.read.seconds, 480)
  }
)

test(
  'Sync anyway names the held sync it goes on from; a plain Sync, or one after a failure, names none (#1649)',
  opts,
  async () => {
    const { pool } = db
    const HELD = {
      ok: true,
      state: 'needs_attention',
      liveReadAt: '2026-10-23T09:00:00Z',
      conflicts: [],
      kept: [],
      held: [{ id: 'db:jos_extensions:["30"]', kind: 'row', table: 'jos_extensions', reason: 'added-both' }],
      files: { fromTheirs: 0 },
      database: { rowsFromTheirs: 1 }
    }
    let answer = HELD
    const net = network()
    const host = async (input, init) => {
      const url = String(input)
      if (/\/_host\/jobs\//.test(url))
        return Response.json({ state: 'done', step: 'webroot-sync', output: JSON.stringify(answer) })
      return net.fetchImpl(input, init)
    }
    const { send, cookieFor } = harness(pool, host)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const started = await (await send('POST', '/api/sites/shop.example/sync', owner)).json()
    const held = await (await send('GET', '/api/sites/shop.example/sync', owner)).json()
    assert.equal(held.sync.state, 'needs_resolution')
    assert.equal(held.sync.held.length, 1)

    assert.equal((await send('POST', '/api/sites/shop.example/sync', owner, { allowHeld: true })).status, 202)
    const jobs = net.calls.filter((c) => c.body?.kind === 'webroot-sync').map((c) => c.body)
    assert.equal(jobs.at(-1).allowHeld, true)
    assert.equal(jobs.at(-1).resumeSyncId, started.sync.id)

    // A failed sync holds nothing to go on from; a plain press never asks for it.
    answer = { ok: false, code: 'MERGE_FAILED' }
    await send('GET', '/api/sites/shop.example/sync', owner)
    await send('POST', '/api/sites/shop.example/sync', owner, { allowHeld: true })
    await send('GET', '/api/sites/shop.example/sync', owner)
    await send('POST', '/api/sites/shop.example/sync', owner)
    const later = net.calls.filter((c) => c.body?.kind === 'webroot-sync').map((c) => c.body)
    assert.equal(later.length, 4)
    assert.equal(later[2].resumeSyncId, undefined)
    assert.equal(later[3].resumeSyncId, undefined)
  }
)

test(
  'an import without a live door says not-connected, so the panel can say why instead of a dead button',
  opts,
  async () => {
    const { pool } = db
    const net = network()
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool, { config: { endpoint: COPY, token: COPY_TOKEN } })
    const owner = await cookieFor('owner@x.y')
    assert.deepEqual(await (await send('GET', '/api/sites/shop.example/sync', owner)).json(), {
      available: false,
      why: 'not-connected',
      sync: null
    })
  }
)

test(
  'a live site that did not move: applied, audited as unchanged, and not stamped as a write to the site',
  opts,
  async () => {
    const { pool } = db
    const unchanged = {
      ok: true,
      state: 'applied',
      unchanged: 'fingerprint',
      liveReadAt: '2026-10-21T15:00:00.000Z',
      conflicts: [],
      held: [],
      kept: [],
      files: { fromTheirs: 0, merged: 0, tracyOwned: 0 },
      database: { tablesFromTheirs: 0, rowsFromTheirs: 0, rowsDeleted: 0, rowsMerged: 0 }
    }
    const net = network({ answers: { 'webroot-sync': unchanged } })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    assert.equal((await send('POST', '/api/sites/shop.example/sync', owner)).status, 202)
    const { sync } = await (await send('GET', '/api/sites/shop.example/sync', owner)).json()
    assert.equal(sync.state, 'applied')
    assert.equal(sync.liveReadAt, '2026-10-21T15:00:00.000Z')
    assert.deepEqual(sync.summary.files, unchanged.files)
    const { rows: audits } = await pool.query(
      "select action from audit where site_key = 'shop.example' and action like 'site.sync.%'"
    )
    assert.deepEqual(
      audits.map((r) => r.action),
      ['site.sync.unchanged']
    )
    const { rows } = await pool.query("select last_write_at from site where site_key = 'shop.example'")
    assert.equal(rows[0].last_write_at, null, 'nothing was written to the copy')
  }
)

test(
  'a sync cut off by a host restart says so, and the next press starts at once (#1563)',
  opts,
  async () => {
    const { pool } = db
    const net = network()
    let orphaned = true
    // The first job is what `orphanJobs` leaves after a deploy replaced tracy-host; later ones finish.
    const restarted = async (input, init) => {
      const url = String(input)
      if (orphaned && url.endsWith('/_host/jobs/job-1'))
        return Response.json({
          state: 'failed',
          step: 'webroot-sync:merging',
          detail: 'tracy-host restarted before this job finished (was running at "webroot-sync:merging")',
          orphanedAt: 1_760_000_000_000,
          output: '==> [12s] the copy: dumping its database\n'
        })
      return net.fetchImpl(input, init)
    }
    const { send, cookieFor } = harness(pool, restarted)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    assert.equal((await send('POST', '/api/sites/shop.example/sync', owner)).status, 202)
    const cut = (await (await send('GET', '/api/sites/shop.example/sync', owner)).json()).sync
    assert.equal(cut.state, 'failed')
    assert.equal(cut.error, 'SYNC_INTERRUPTED')
    orphaned = false
    const again = await send('POST', '/api/sites/shop.example/sync', owner)
    assert.equal(again.status, 202, 'no lease or running row is left to refuse it')
    const done = (await (await send('GET', '/api/sites/shop.example/sync', owner)).json()).sync
    assert.equal(done.state, 'applied')
  }
)

test(
  'a live site that kept changing is filed LIVE_BUSY, also from a host that wraps it (#1564)',
  opts,
  async () => {
    const { pool } = db
    const busy = {
      ok: false,
      code: 'LIVE_BUSY',
      detail: 'the database kept changing (ng_content (2 rows); ng_weblinks (1 row))',
      moved: {
        tables: [
          { table: 'ng_content', rows: 2, housekeeping: false },
          { table: 'ng_weblinks', rows: 1, housekeeping: false }
        ]
      }
    }
    for (const answer of [
      { ok: false, code: 'LIVE_BUSY', read: busy },
      { ok: false, code: 'LIVE_READ_FAILED', read: busy }
    ]) {
      await db.reset()
      const net = network({ answers: { 'webroot-sync': answer } })
      const { send, cookieFor } = harness(pool, net.fetchImpl)
      await importedSite(pool)
      const owner = await cookieFor('owner@x.y')
      await send('POST', '/api/sites/shop.example/sync', owner)
      const { sync } = await (await send('GET', '/api/sites/shop.example/sync', owner)).json()
      assert.equal(sync.state, 'failed')
      assert.equal(sync.error, 'LIVE_BUSY', JSON.stringify(answer))
      // What kept changing reaches the dialog (#1664).
      assert.deepEqual(sync.busy, {
        parts: ['content', 'other'],
        tables: [
          { table: 'ng_content', rows: 2, names: [] },
          { table: 'ng_weblinks', rows: 1, names: [] }
        ],
        files: [],
        detail: 'the database kept changing (ng_content (2 rows); ng_weblinks (1 row))'
      })
    }
    for (const code of [
      'TOKEN_REFUSED',
      'LIVE_PASSWORD_PROTECTED',
      'LIVE_BLOCKED',
      'LIVE_RATE_LIMITED',
      'UNKNOWN_READ_FAILURE'
    ]) {
      const net = network({
        answers: {
          'webroot-sync': { ok: false, code: 'LIVE_READ_FAILED', read: { ok: false, code } }
        }
      })
      await db.reset()
      const { send, cookieFor } = harness(pool, net.fetchImpl)
      await importedSite(pool)
      const owner = await cookieFor('owner@x.y')
      await send('POST', '/api/sites/shop.example/sync', owner)
      const { sync } = await (await send('GET', '/api/sites/shop.example/sync', owner)).json()
      assert.equal(sync.error, code === 'UNKNOWN_READ_FAILURE' ? 'LIVE_READ_FAILED' : code)
      assert.equal(sync.busy, null)
    }
  }
)

test(
  'a live site whose PHP is too old for Claude Cowork is filed LIVE_PHP_TOO_OLD with both versions',
  opts,
  async () => {
    const { pool } = db
    // live-pull.mjs's answer to claude-cowork 0.24.73 refusing PHP 7.3.33, wrapped or not by the host.
    const read = { ok: false, code: 'LIVE_PHP_TOO_OLD', php: '7.3.33', min: '7.4.0' }
    for (const answer of [
      { ok: false, code: 'LIVE_PHP_TOO_OLD', read },
      { ok: false, code: 'LIVE_READ_FAILED', read }
    ]) {
      await db.reset()
      const net = network({ answers: { 'webroot-sync': answer } })
      const { send, cookieFor } = harness(pool, net.fetchImpl)
      await importedSite(pool)
      const owner = await cookieFor('owner@x.y')
      await send('POST', '/api/sites/shop.example/sync', owner)
      const { sync } = await (await send('GET', '/api/sites/shop.example/sync', owner)).json()
      assert.equal(sync.error, 'LIVE_PHP_TOO_OLD', JSON.stringify(answer))
      assert.deepEqual(sync.php, { php: '7.3.33', min: '7.4.0' })
    }
  }
)

test('pure pieces: LIVE_PHP_TOO_OLD names only versions, from the answer, its read or a push sync', () => {
  assert.deepEqual(phpTooOldOf({ ok: false, code: 'LIVE_PHP_TOO_OLD', php: '7.3.33', min: '7.4.0' }), {
    php: '7.3.33',
    min: '7.4.0'
  })
  assert.deepEqual(
    phpTooOldOf({
      ok: false,
      code: 'SYNC_FAILED',
      sync: {
        ok: false,
        code: 'LIVE_READ_FAILED',
        read: { code: 'LIVE_PHP_TOO_OLD', php: '7.2.1', min: '7.4.0' }
      }
    }),
    { php: '7.2.1', min: '7.4.0' }
  )
  // Anything but a bare version is dropped, never shown to the owner.
  assert.deepEqual(phpTooOldOf({ code: 'LIVE_PHP_TOO_OLD', php: '<b>7.3</b>', min: null }), {
    php: null,
    min: null
  })
  assert.equal(phpTooOldOf({ ok: false, code: 'LIVE_BLOCKED' }), null)
  const row = { id: 'x', state: 'failed', created_at: new Date(), updated_at: new Date() }
  const answer = {
    ok: false,
    code: 'LIVE_PHP_TOO_OLD',
    read: { code: 'LIVE_PHP_TOO_OLD', php: '7.3.33', min: '7.4.0' }
  }
  assert.deepEqual(view({ ...row, error: 'LIVE_PHP_TOO_OLD', answer }).php, { php: '7.3.33', min: '7.4.0' })
  assert.equal(view({ ...row, error: 'SYNC_FAILED', answer }).php, null)
})

test('pure pieces: a busy live read names the parts of the site that kept changing, cut short (#1664)', () => {
  const row = (answer) => ({
    id: 'x',
    state: 'failed',
    error: 'LIVE_BUSY',
    answer,
    created_at: new Date(),
    updated_at: new Date()
  })
  const read = {
    ok: false,
    code: 'LIVE_BUSY',
    detail: 'the database kept changing (wp_options (blogname); wp_posts (1 row))',
    moved: {
      tables: [
        { table: 'wp_options', rows: 1, names: ['blogname'], housekeeping: false },
        { table: 'wp_posts', rows: 1, housekeeping: false },
        { table: 'wp_usermeta', rows: 3, names: ['x'.repeat(200)], housekeeping: true },
        { table: 'wp_comments', rows: null, count: true },
        { table: 'wp_wc_orders', rows: 4 }
      ],
      files: ['wp-content/debug.log']
    }
  }
  const busy = view(row({ ok: false, code: 'LIVE_BUSY', read })).busy
  assert.deepEqual(busy.parts, ['settings', 'content', 'users', 'comments', 'other', 'files'])
  assert.deepEqual(busy.tables[0], { table: 'wp_options', rows: 1, names: ['blogname'] })
  assert.equal(busy.tables[2].names[0].length, 80)
  assert.deepEqual(busy.files, ['wp-content/debug.log'])
  assert.match(busy.detail, /wp_options \(blogname\)/)
  // A host before #1664 said only the code: no parts to name, still filed LIVE_BUSY.
  assert.deepEqual(view(row({ ok: false, code: 'LIVE_BUSY', read: { ok: false, code: 'LIVE_BUSY' } })).busy, {
    parts: [],
    tables: [],
    files: [],
    detail: null
  })
  assert.equal(view({ ...row(read), error: 'SYNC_FAILED' }).busy, null)
  assert.equal(partOfTable('jos_menu'), 'content')
  assert.equal(partOfTable('ng_extensions'), 'settings')
  assert.equal(partOfTable('wp_actionscheduler_actions'), 'other')
})

test("the import's fingerprint is kept with the live token and handed to the first sync", opts, async () => {
  const { pool } = db
  const net = network()
  const { send, cookieFor } = harness(pool, net.fetchImpl)
  await importedSite(pool)
  const owner = await cookieFor('owner@x.y')
  const fingerprint = {
    version: 1,
    pageSize: 50000,
    skip: ['hits', 'lastvisitDate'],
    files: { count: 3, bytes: 30, pages: ['a'.repeat(40)] },
    tables: { jos_content: '5:123', jos_session: null }
  }
  // The import's hand-over (tracy-add-site provisionImported) carries it beside the archive keys.
  const provisioned = await send('POST', '/api/sites/shop.example/provision', owner, {
    platform: 'joomla',
    webrootKey: 'sites/shop-example/webroot.tar',
    dbKey: 'sites/shop-example/db.sql.gz',
    liveSite: 'https://shop.example',
    fingerprint
  })
  assert.notEqual(provisioned.status, 503, await provisioned.text())
  const kept = await currentComponent(pool, 'shop.example')
  assert.deepEqual(kept.config.importFingerprint, fingerprint)
  assert.equal(kept.config.liveToken ?? kept.config.token, LIVE_TOKEN, 'the live token stays')

  assert.equal((await send('POST', '/api/sites/shop.example/sync', owner)).status, 202)
  const job = [...net.jobs.values()].find((j) => j.kind === 'webroot-sync')
  assert.deepEqual(job.baseFingerprint, fingerprint)

  // Anything but that shape is not kept, and an import without one drops an earlier one.
  await send('POST', '/api/sites/shop.example/provision', owner, {
    platform: 'joomla',
    webrootKey: 'sites/shop-example/webroot.tar',
    dbKey: 'sites/shop-example/db.sql.gz',
    liveSite: 'https://shop.example',
    fingerprint: { ...fingerprint, files: { ...fingerprint.files, pages: ['not-a-digest'] } }
  })
  assert.equal((await currentComponent(pool, 'shop.example')).config.importFingerprint, undefined)
})

test(
  'a sync still running when tracy-web restarts keeps its lease; once its job ends the lease goes (#123)',
  opts,
  async () => {
    const { pool } = db
    const net = network()
    net.held.on = true
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    assert.equal((await send('POST', '/api/sites/shop.example/sync', owner)).status, 202)
    await pool.query(
      "update site_write_lease set wrote_at = now() - interval '100 seconds' where site_key = $1",
      ['shop.example']
    )
    const config = readConfig(env)
    const again = liveSync({
      pool,
      config,
      host: { hostCall, hostJob },
      fetchImpl: net.fetchImpl,
      currentComponent,
      writeComponent,
      watchEveryMs: 0
    })
    assert.equal(await again.resume(), 1)
    const chat = await takeWriteLease(pool, {
      siteKey: 'shop.example',
      sessionId: 'chat-1',
      actor: 'owner@x.y'
    })
    assert.equal(chat.ok, false, 'the chat may not write while the sync job still runs')
    net.held.on = false
    assert.equal(await again.resume(), 1)
    const { rows } = await pool.query('select state from site_sync where site_key = $1', ['shop.example'])
    assert.notEqual(rows[0].state, 'running')
    assert.equal(
      (await takeWriteLease(pool, { siteKey: 'shop.example', sessionId: 'chat-1', actor: 'owner@x.y' })).ok,
      true
    )
  }
)

test(
  'a sync read back while the host does not answer keeps its lease: a chat stays refused until it ends (#224)',
  opts,
  async () => {
    const { pool } = db
    const net = network()
    net.held.on = true
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    assert.equal((await send('POST', '/api/sites/shop.example/sync', owner)).status, 202)
    await pool.query(
      "update site_write_lease set wrote_at = now() - interval '100 seconds' where site_key = $1",
      ['shop.example']
    )
    let hostDown = true
    const flaky = async (input, init) => {
      if (hostDown && /\/_host\/jobs\//.test(String(input))) throw new TypeError('fetch failed')
      return net.fetchImpl(input, init)
    }
    const again = liveSync({
      pool,
      config: readConfig(env),
      host: { hostCall, hostJob },
      fetchImpl: flaky,
      currentComponent,
      writeComponent,
      watchEveryMs: 0
    })
    assert.equal(await again.resume(), 1)
    const chat = await takeWriteLease(pool, {
      siteKey: 'shop.example',
      sessionId: 'chat-1',
      actor: 'owner@x.y'
    })
    assert.equal(chat.ok, false, 'the chat may not write while the sync may still run')
    hostDown = false
    net.held.on = false
    assert.equal(await again.resume(), 1)
    const { rows } = await pool.query('select state from site_sync where site_key = $1', ['shop.example'])
    assert.notEqual(rows[0].state, 'running')
    assert.equal(
      (await takeWriteLease(pool, { siteKey: 'shop.example', sessionId: 'chat-1', actor: 'owner@x.y' })).ok,
      true
    )
  }
)

test('a sync row names what the live site has that a sync does not bring, names only (#120)', () => {
  const row = {
    id: 's1',
    state: 'applied',
    created_at: '2026-10-29T10:00:00Z',
    updated_at: '2026-10-29T10:01:00Z',
    answer: {
      notCarried: {
        triggers: [
          { name: 'shop_after_insert', table: 'wp_shop', event: 'INSERT', timing: 'AFTER', body: 'SECRET' }
        ],
        tables: ['wp_shop_log', 42]
      }
    }
  }
  assert.deepEqual(view(row).notCarried, {
    triggers: [{ name: 'shop_after_insert', table: 'wp_shop' }],
    tables: ['wp_shop_log']
  })
  assert.equal(view({ ...row, answer: {} }).notCarried, null)
})
