// The `cms-log-pull` job (src/cms-log.js): read a CMS's own admin log after a cursor, keep only
// what a person did in the CMS admin, and hand back `{entries, cursor, enabled}`.
//
// Fixtures: `wordpress-scwp1002.json` is the WordPress adapter's real output on stand site scwp1002
// (02/10/2026, the P2.1 hook in tracy-access.php, emails masked): admin actions by two WordPress
// users, and one WP-Cron publish of a scheduled post (user 0).
// `wordpress-producer-v2.json` is CONSTRUCTED in the schema-2 shape (hook 0.3.0, Site changes V2):
// one row per producer case — legacy, cron, unknown version, user 0 without cron context, a person.
// tracy-web's classifier test reads the same file (`apps/tracy-web/test/activity-source.test.mjs`).
// `joomla-e3sj0330.json` is the Joomla adapter's real output on the stand site e3sj0330
// (01/10/2026, emails masked). Between 2026-09-30 00:07 and 13:13 UTC Tracy's agent made 14
// successful Apply writes on that site (audit rows, P0 cms-hooks.md §2); the log has no row for
// any of them, which is what lets the Joomla adapter take every row as "outside Tracy".
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import { runCmsLogJob, validateCmsLogBody } from '../src/cms-log.js'

const fixture = (name) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', 'cms-log', name), 'utf8'))

function fakeJobs() {
  const all = new Map()
  return {
    all,
    put: async (id, fields) => all.set(id, { ...all.get(id), ...fields }),
    get: async (id) => all.get(id) ?? null
  }
}

/** Run the job with an adapter that prints `answer`; returns the parsed job result and the argv. */
async function pull(body, answer, { code = 0 } = {}) {
  const jobs = fakeJobs()
  const calls = []
  const run = async (input) => {
    calls.push(input)
    return { code, tail: ['some noise', typeof answer === 'string' ? answer : JSON.stringify(answer)] }
  }
  await runCmsLogJob({
    jobId: 'j1',
    body: { kind: 'cms-log-pull', label: 'site1', ...body },
    config: { scriptsDir: '/opt/tracy-fleet' },
    jobs,
    run
  })
  const job = jobs.all.get('j1')
  return { job, result: job.state === 'done' ? JSON.parse(job.output) : null, calls }
}

const joomlaRow = (id, over = {}) => ({
  id,
  key: 'PLG_SYSTEM_ACTIONLOGS_CONTENT_UPDATED',
  extension: 'com_content.article',
  userId: 546,
  itemId: 7,
  logDate: '2026-10-01 19:30:00',
  typeTitle: 'article',
  message: {
    action: 'update',
    type: 'PLG_ACTIONLOG_JOOMLA_TYPE_ARTICLE',
    id: 7,
    title: 'About us',
    username: 'minh'
  },
  ...over
})
const joomla = (rows, over = {}) => ({
  ok: true,
  platform: 'joomla',
  now: '2026-10-01 20:00:00',
  maxId: rows.length ? rows[rows.length - 1].id : 0,
  reset: false,
  enabled: { component: true, systemPlugin: true, joomlaPlugin: true },
  rows,
  ...over
})

test('validateCmsLogBody: takes a known platform and a cursor of that platform’s shape', () => {
  assert.equal(
    validateCmsLogBody({ kind: 'cms-log-pull', label: 'a', platform: 'joomla', cursor: '116' }),
    null
  )
  assert.equal(validateCmsLogBody({ kind: 'cms-log-pull', label: 'a', platform: 'joomla' }), null)
  assert.equal(
    validateCmsLogBody({
      kind: 'cms-log-pull',
      label: 'a',
      platform: 'emdash',
      cursor: '1790728619735-01M3PJRBF0GQ7B4HVY1WVH70XN'
    }),
    null
  )
  assert.equal(
    validateCmsLogBody({ kind: 'cms-log-pull', label: 'a', platform: 'drupal' }),
    'refused platform'
  )
  assert.equal(
    validateCmsLogBody({ kind: 'cms-log-pull', label: 'a', platform: 'joomla', cursor: '1; drop' }),
    'refused cursor'
  )
  assert.equal(
    validateCmsLogBody({ kind: 'cms-log-pull', label: 'a', platform: 'joomla', extra: 1 }),
    'refused extra'
  )
})

test('validateCmsLogBody: an EmDash publish-state snapshot is an object or nothing', () => {
  const body = { kind: 'cms-log-pull', label: 'a', platform: 'emdash' }
  assert.equal(validateCmsLogBody({ ...body, state: { w: '2026-10-04T13:00:00.000Z', e: {} } }), null)
  assert.equal(validateCmsLogBody({ ...body, state: null }), null)
  assert.equal(validateCmsLogBody({ ...body, state: '$(id)' }), 'refused state')
  assert.equal(validateCmsLogBody({ ...body, state: [] }), 'refused state')
})

test('emdash: the snapshot’s mark reaches the adapter as --since; a snapshot the host did not write does not', async () => {
  const answer = {
    ok: true,
    platform: 'emdash',
    now: Date.now(),
    enabled: true,
    maxId: '',
    reset: false,
    rows: []
  }
  const good = await pull({ platform: 'emdash', state: { w: '2026-10-04T13:00:00.000Z', e: {} } }, answer)
  assert.deepEqual(good.calls[0].args.slice(-2), ['--since', '2026-10-04T13:00:00.000Z'])
  const bad = await pull({ platform: 'emdash', state: { w: '$(id)', e: {} } }, answer)
  assert.equal(bad.calls[0].args.includes('--since'), false)
  assert.equal(bad.result.state, undefined, 'an adapter that read no state leaves the snapshot alone')
})

test('joomla: the real e3sj0330 log, written while Tracy made 14 Apply writes, yields no row — only installs, consent and a login', async () => {
  const { result, calls } = await pull({ platform: 'joomla' }, fixture('joomla-e3sj0330.json'))
  assert.deepEqual(result.entries, [])
  assert.equal(result.cursor, '116', 'the cursor still moves past every row it read')
  assert.equal(result.enabled, true)
  // The adapter is picked by platform, and the cursor reaches it through the environment.
  assert.deepEqual(calls[0].args.slice(0, 5), [
    '/opt/tracy-fleet/webroot/cms-log.sh',
    '--label',
    'site1',
    '--platform',
    'joomla'
  ])
})

test('joomla: an admin edit becomes one entry with the CMS user, the resource and the op', async () => {
  const { result } = await pull(
    { platform: 'joomla', cursor: '116' },
    joomla([
      joomlaRow(117),
      joomlaRow(118, {
        key: 'PLG_SYSTEM_ACTIONLOGS_CONTENT_ADDED',
        extension: 'com_menus.item',
        itemId: 101,
        typeTitle: 'menu_item',
        message: {
          action: 'add',
          type: 'PLG_ACTIONLOG_JOOMLA_TYPE_MENU_ITEM',
          id: 101,
          title: 'Pricing',
          username: 'minh'
        }
      }),
      joomlaRow(119, {
        key: 'PLG_ACTIONLOG_JOOMLA_APPLICATION_CONFIG_UPDATED',
        extension: 'com_config.application',
        itemId: 0,
        typeTitle: 'application_config',
        message: {
          action: 'update',
          type: 'PLG_ACTIONLOG_JOOMLA_TYPE_APPLICATION_CONFIG',
          id: 0,
          title: 'com_config',
          username: 'minh'
        }
      })
    ])
  )
  assert.deepEqual(result.entries, [
    {
      cursorKey: '117@2026-10-01T19:30:00Z',
      occurredAt: '2026-10-01T19:30:00Z',
      actor: { id: '546', name: 'minh' },
      resourceType: 'article',
      resourceId: '7',
      resourceTitle: 'About us',
      op: 'update',
      changeType: 'PLG_SYSTEM_ACTIONLOGS_CONTENT_UPDATED',
      producer: null
    },
    {
      cursorKey: '118@2026-10-01T19:30:00Z',
      occurredAt: '2026-10-01T19:30:00Z',
      actor: { id: '546', name: 'minh' },
      resourceType: 'menu_item',
      resourceId: '101',
      resourceTitle: 'Pricing',
      op: 'create',
      changeType: 'PLG_SYSTEM_ACTIONLOGS_CONTENT_ADDED',
      producer: null
    },
    {
      cursorKey: '119@2026-10-01T19:30:00Z',
      occurredAt: '2026-10-01T19:30:00Z',
      actor: { id: '546', name: 'minh' },
      resourceType: 'application_config',
      resourceId: null,
      resourceTitle: null,
      op: 'update',
      changeType: 'PLG_ACTIONLOG_JOOMLA_APPLICATION_CONFIG_UPDATED',
      producer: null
    }
  ])
  assert.equal(result.cursor, '119')
})

test('joomla: one module save that Joomla logs twice (ids 127/128 on scjo1002) is one entry', async () => {
  const twice = (id, itemId) =>
    joomlaRow(id, {
      extension: 'com_modules.module',
      itemId: 426,
      logDate: '2026-10-01 20:13:15',
      typeTitle: 'module',
      message: {
        action: 'update',
        type: 'PLG_ACTIONLOG_JOOMLA_TYPE_MODULE',
        id: itemId,
        title: 'Breadcrumbs (A14 2013)',
        username: 'minh'
      }
    })
  const { result } = await pull(
    { platform: 'joomla', cursor: '126' },
    joomla([twice(127, '426'), twice(128, 426)], { now: '2026-10-01 20:20:00' })
  )
  assert.deepEqual(
    result.entries.map((e) => [e.cursorKey, e.resourceType, e.resourceId, e.op]),
    [['127@2026-10-01T20:13:15Z', 'module', '426', 'update']]
  )
  assert.equal(result.cursor, '128')
})

test("joomla: the CMS user's display name is preferred over the login name when the adapter has it", async () => {
  const { result } = await pull(
    { platform: 'joomla', cursor: '0' },
    joomla([joomlaRow(1, { userName: 'Site Administrator' })])
  )
  assert.deepEqual(result.entries[0].actor, { id: '546', name: 'Site Administrator' })
})

test('joomla: logins, logouts, consent and system (user 0) rows are skipped, but the cursor passes them', async () => {
  const { result } = await pull(
    { platform: 'joomla', cursor: '0' },
    joomla([
      joomlaRow(1, {
        key: 'PLG_ACTIONLOG_JOOMLA_USER_LOGGED_IN',
        message: { action: 'login', app: 'PLG_ACTIONLOG_JOOMLA_APPLICATION_ADMINISTRATOR' }
      }),
      joomlaRow(2, { key: 'PLG_ACTIONLOG_JOOMLA_USER_LOGGED_OUT' }),
      joomlaRow(3, { key: 'PLG_USER_TERMS_LOGGING_CONSENT_TO_TERMS', extension: 'plg_user_terms' }),
      joomlaRow(4, { key: 'PLG_ACTIONLOG_JOOMLA_EXTENSION_UPDATED', userId: 0 }),
      joomlaRow(5, { key: 'PLG_ACTIONLOG_JOOMLA_USER_LOGIN_FAILED' })
    ])
  )
  assert.deepEqual(result.entries, [])
  assert.equal(result.cursor, '5')
})

test('joomla: a row newer than five seconds stops the read, so an insert still in flight is never stepped over', async () => {
  const { result } = await pull(
    { platform: 'joomla', cursor: '0' },
    joomla([joomlaRow(1), joomlaRow(2, { logDate: '2026-10-01 19:59:58' }), joomlaRow(3)], {
      now: '2026-10-01 20:00:00'
    })
  )
  assert.deepEqual(
    result.entries.map((e) => e.cursorKey),
    ['1@2026-10-01T19:30:00Z']
  )
  assert.equal(result.cursor, '1')
})

test('joomla: a log switched off reads enabled=false and still advances over what is there', async () => {
  const { result } = await pull(
    { platform: 'joomla', cursor: '10' },
    joomla([], { maxId: 10, enabled: { component: true, systemPlugin: false, joomlaPlugin: true } })
  )
  assert.equal(result.enabled, false)
  assert.equal(result.reason, 'log-disabled')
  assert.equal(result.cursor, '10')
})

test('joomla: an emptied log (cursor past the newest id) starts over, and a reused id is a new row key', async () => {
  const { result } = await pull(
    { platform: 'joomla', cursor: '119' },
    joomla([joomlaRow(1, { logDate: '2026-10-01 19:40:00' })], { reset: true, maxId: 1 })
  )
  assert.equal(result.reset, true)
  assert.equal(result.cursor, '1')
  assert.deepEqual(
    result.entries.map((e) => e.cursorKey),
    ['1@2026-10-01T19:40:00Z']
  )
})

test('a job whose adapter fails or prints no JSON is failed, with no cursor to move', async () => {
  const failed = await pull({ platform: 'joomla' }, 'PHP Fatal error', { code: 255 })
  assert.equal(failed.job.state, 'failed')
  const garbled = await pull({ platform: 'joomla' }, 'not json')
  assert.equal(garbled.job.state, 'failed')
})

test('wordpress: no tracy admin log table yet reads enabled=false, reason hook-not-installed', async () => {
  const { result } = await pull(
    { platform: 'wordpress' },
    { ok: true, platform: 'wordpress', installed: false }
  )
  assert.deepEqual(result, {
    entries: [],
    cursor: '0',
    enabled: false,
    reason: 'hook-not-installed',
    reset: false
  })
})

// F-L4-5: the hook creates its table on the first action it logs. A site nobody has edited in the
// admin yet has the hook and no table: an empty log, so the tab's counts stay complete.
test('wordpress: the hook in place but no table yet is an empty, enabled log', async () => {
  const { result } = await pull(
    { platform: 'wordpress', cursor: '' },
    { ok: true, platform: 'wordpress', installed: false, hook: { present: true, version: '0.3.0' } }
  )
  assert.deepEqual(result, { entries: [], cursor: '0', enabled: true, reset: false })
  const none = await pull(
    { platform: 'wordpress' },
    { ok: true, platform: 'wordpress', installed: false, hook: { present: false, version: null } }
  )
  assert.equal(none.result.reason, 'hook-not-installed')
})

// user 0: the hook writes such a row only from WP-Cron (an automatic core/plugin/theme update, a
// scheduled post going live) — a real change nobody typed, so it is kept, with no actor.
test('wordpress: rows of the table contract map one to one; a user-0 (WP-Cron) row has no actor', async () => {
  const { result } = await pull(
    { platform: 'wordpress', cursor: '4' },
    {
      ok: true,
      platform: 'wordpress',
      installed: true,
      now: '2026-10-01 20:00:00',
      maxId: 6,
      reset: false,
      rows: [
        {
          id: 5,
          at: '2026-10-01 19:00:00',
          user_id: 3,
          user_name: 'Minh',
          type: 'wp_after_insert_post',
          resource_type: 'page',
          resource_id: '42',
          resource_title: 'About us',
          op: 'update'
        },
        {
          id: 6,
          at: '2026-10-01 19:01:00',
          user_id: 0,
          user_name: '',
          type: 'upgrader_process_complete',
          resource_type: 'plugin',
          resource_id: 'claude-cowork/claude-cowork.php',
          resource_title: 'Claude Cowork',
          op: 'install'
        }
      ]
    }
  )
  assert.deepEqual(result.entries, [
    {
      cursorKey: '5@2026-10-01T19:00:00Z',
      occurredAt: '2026-10-01T19:00:00Z',
      actor: { id: '3', name: 'Minh' },
      resourceType: 'page',
      resourceId: '42',
      resourceTitle: 'About us',
      op: 'update',
      changeType: 'wp_after_insert_post',
      producer: null
    },
    {
      cursorKey: '6@2026-10-01T19:01:00Z',
      occurredAt: '2026-10-01T19:01:00Z',
      actor: null,
      resourceType: 'plugin',
      resourceId: 'claude-cowork/claude-cowork.php',
      resourceTitle: 'Claude Cowork',
      op: 'install',
      changeType: 'upgrader_process_complete',
      producer: null
    }
  ])
  assert.equal(result.cursor, '6')
  assert.equal(result.enabled, true)
})

test('wordpress: the real adapter answer from scwp1002 maps every row, WP-Cron with no actor', async () => {
  const { result } = await pull({ platform: 'wordpress' }, fixture('wordpress-scwp1002.json'))
  assert.equal(result.enabled, true)
  assert.equal(result.cursor, '7')
  assert.deepEqual(
    result.entries.map((e) => [
      e.cursorKey,
      e.actor?.id ?? null,
      e.actor?.name ?? null,
      e.resourceType,
      e.resourceId,
      e.op
    ]),
    [
      ['1@2026-10-01T21:02:03Z', '8', 'owner@example.test', 'option', 'blogdescription', 'update'],
      ['2@2026-10-01T21:07:17Z', null, null, 'post', '2108', 'update'],
      ['3@2026-10-01T21:07:54Z', '8', 'owner@example.test', 'page', '50', 'update'],
      ['4@2026-10-01T21:07:55Z', '8', 'owner@example.test', 'attachment', '2111', 'upload'],
      ['5@2026-10-01T21:07:57Z', '8', 'owner@example.test', 'plugin', 'hello.php', 'activate'],
      ['6@2026-10-01T21:07:58Z', '8', 'owner@example.test', 'plugin', 'hello.php', 'deactivate'],
      ['7@2026-10-01T21:08:05Z', '9', 'Minh Tran (A13)', 'page', '48', 'update']
    ]
  )
  assert.equal(result.entries[4].resourceTitle, 'Hello Dolly')
})

// Site changes V2 (contract D1): a schema-2 hook names its producer on every row, and the mapping
// passes it on with the hook's own event type, verbatim — tracy-web decides what it proves.
test('wordpress: schema-2 rows carry their producer and event type; schema-1 rows carry none', async () => {
  const { result } = await pull({ platform: 'wordpress' }, fixture('wordpress-producer-v2.json'))
  const hash = '9f2c4e1a7b3d5f60'.repeat(4)
  assert.deepEqual(
    result.entries.map((e) => [e.cursorKey.split('@')[0], e.actor?.id ?? null, e.changeType, e.producer]),
    [
      ['1', '8', 'wp_after_insert_post', null],
      ['2', null, 'wp_after_insert_post', null],
      ['3', '8', 'wp_after_insert_post', { schema: '2', version: '0.3.0', hash }],
      ['4', null, 'upgrader_process_complete', { schema: '2', version: '0.3.0', hash, context: 'cron' }],
      ['5', null, 'upgrader_process_complete', { schema: '2', version: '9.9.9', hash, context: 'cron' }],
      ['6', null, 'wp_after_insert_post', { schema: '2', version: '0.3.0', hash }],
      ['7', '9', 'updated_option', { schema: '2', version: '0.3.0', hash, context: 'cron' }],
      ['8', '8', 'updated_option', { schema: '2', version: '0.3.0', hash }],
      ['9', '8', 'activated_plugin', { schema: '2', version: '0.3.0' }]
    ]
  )
})

// ---------------------------------------------------------------------------------------------
// EmDash: the real in-container adapter (scripts/webroot/cms-log-emdash.mjs) against a real
// SQLite file shaped like a site's data.db, then the job's mapping on its answer.
// ---------------------------------------------------------------------------------------------

const EMDASH_ADAPTER = path.join(
  import.meta.dirname,
  '../../../packages/fleet/tracy-fleet-operation/scripts/webroot/cms-log-emdash.mjs'
)
const AGENT = '47309a3a-fc28-4e24-9f2e-65e4d9a8c1e2'
const MINH = '8391752f-ed41-49f3-9f69-cd81ae649202'

function emdashSite({ declared = true, entries = [] } = {}) {
  const app = mkdtempSync(path.join(tmpdir(), 'cms-log-emdash-'))
  mkdirSync(path.join(app, 'data'))
  writeFileSync(
    path.join(app, 'astro.config.mjs'),
    declared
      ? "import auditLog from '@emdash-cms/plugin-audit-log'\nexport default { plugins: [auditLog] }\n"
      : 'export default { plugins: [] }\n'
  )
  const db = new DatabaseSync(path.join(app, 'data', 'data.db'))
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, role INTEGER);
    CREATE TABLE _plugin_storage (plugin_id TEXT, collection TEXT, id TEXT, data TEXT, created_at TEXT, updated_at TEXT, revision INTEGER,
      PRIMARY KEY (plugin_id, collection, id));`)
  db.prepare('INSERT INTO users VALUES (?,?,?,50)').run(AGENT, 'tracy-agent@tracy.ai', 'Tracy')
  db.prepare('INSERT INTO users VALUES (?,?,?,50)').run(MINH, 'minh@example.test', 'Minh')
  const add = (id, data) =>
    db
      .prepare("INSERT INTO _plugin_storage VALUES ('audit-log','entries',?,?,'','',1)")
      .run(id, JSON.stringify(data))
  for (const [id, data] of entries) add(id, data)
  // Another plugin's rows must never be read as audit entries.
  db.prepare("INSERT INTO _plugin_storage VALUES ('emdash-forms','forms','f1','{}','','',1)").run()
  db.close()
  return {
    app,
    add: (id, data) => {
      const w = new DatabaseSync(path.join(app, 'data', 'data.db'))
      w.prepare("INSERT INTO _plugin_storage VALUES ('audit-log','entries',?,?,'','',1)").run(
        id,
        JSON.stringify(data)
      )
      w.close()
    },
    clear: () => {
      const w = new DatabaseSync(path.join(app, 'data', 'data.db'))
      w.exec("DELETE FROM _plugin_storage WHERE plugin_id='audit-log'")
      w.close()
    }
  }
}

const at = (ms) => new Date(ms).toISOString()
const OLD = Date.now() - 60_000
const entry = (ms, over = {}) => [
  `${ms}-${over.resourceId ?? '01HOME'}`,
  {
    timestamp: at(ms),
    action: 'update',
    collection: 'pages',
    resourceId: '01HOME',
    resourceType: 'content',
    userId: MINH,
    changes: {
      before: { title: 'Home', secret_field: 'old private text' },
      after: { title: 'Home page', secret_field: 'new private text' }
    },
    metadata: { slug: 'home', status: 'published' },
    ...over
  }
]

/** Run the job with `run` executing the real EmDash adapter on `app` instead of docker exec. */
async function pullEmdash(app, cursor) {
  const jobs = fakeJobs()
  const run = async ({ args }) => {
    const i = args.indexOf('--cursor')
    const out = execFileSync(process.execPath, ['--no-warnings', EMDASH_ADAPTER], {
      env: { ...process.env, TRACY_CMS_LOG_APP_DIR: app, TRACY_CMS_LOG_CURSOR: i >= 0 ? args[i + 1] : '' },
      encoding: 'utf8'
    })
    return { code: 0, tail: out.trim().split('\n') }
  }
  await runCmsLogJob({
    jobId: 'e1',
    body: { kind: 'cms-log-pull', label: 'em1', platform: 'emdash', ...(cursor ? { cursor } : {}) },
    config: { scriptsDir: '/opt/tracy-fleet' },
    jobs,
    run
  })
  const job = jobs.all.get('e1')
  assert.equal(job.state, 'done', job.detail ?? job.output)
  return JSON.parse(job.output)
}

test('emdash: an admin save is one entry with the EmDash user; the agent’s own saves are dropped', async () => {
  const site = emdashSite({
    entries: [
      entry(OLD),
      entry(OLD + 1000, { userId: AGENT }),
      entry(OLD + 2000, {
        action: 'create',
        resourceId: '01NEWS',
        collection: 'posts',
        changes: { after: { title: 'Launch' } },
        metadata: { slug: 'launch' }
      })
    ]
  })
  const result = await pullEmdash(site.app)
  assert.deepEqual(result.entries, [
    {
      cursorKey: `${OLD}-01HOME`,
      occurredAt: at(OLD),
      actor: { id: MINH, name: 'Minh' },
      resourceType: 'pages',
      resourceId: '01HOME',
      resourceTitle: 'Home page',
      op: 'update',
      changeType: 'update',
      producer: null
    },
    {
      cursorKey: `${OLD + 2000}-01NEWS`,
      occurredAt: at(OLD + 2000),
      actor: { id: MINH, name: 'Minh' },
      resourceType: 'posts',
      resourceId: '01NEWS',
      resourceTitle: 'Launch',
      op: 'create',
      changeType: 'create',
      producer: null
    }
  ])
  assert.equal(result.cursor, `${OLD + 2000}-01NEWS`)
  assert.equal(result.enabled, true)
  assert.doesNotMatch(JSON.stringify(result), /private text/, 'no content value leaves the site')
})

test('emdash: a delete and a media upload carry no actor and are kept with actor null', async () => {
  const site = emdashSite({
    entries: [
      // The real delete shape (scem1002, 01/10): `before` is the whole record, title under `data`,
      // and `authorId` (the page's author, not the person deleting — never read as the actor).
      entry(OLD, {
        action: 'delete',
        userId: undefined,
        changes: { before: { id: '01HOME', slug: 'old-page', data: { title: 'Old page' }, authorId: MINH } },
        metadata: undefined
      }),
      [
        `${OLD + 5}-01MEDIA`,
        { timestamp: at(OLD + 5), action: 'media:upload', resourceId: '01MEDIA', resourceType: 'media' }
      ]
    ]
  })
  const result = await pullEmdash(site.app)
  assert.deepEqual(
    result.entries.map((e) => [e.op, e.actor, e.resourceType, e.resourceTitle]),
    [
      ['delete', null, 'pages', 'Old page'],
      ['upload', null, 'media', null]
    ]
  )
})

test('emdash: pulling twice never repeats or loses an entry, and an entry under five seconds old waits', async () => {
  const site = emdashSite({ entries: [entry(OLD)] })
  const first = await pullEmdash(site.app)
  assert.equal(first.entries.length, 1)
  const again = await pullEmdash(site.app, first.cursor)
  assert.deepEqual(again.entries, [], 'nothing new, nothing repeated')
  assert.equal(again.cursor, first.cursor)
  const fresh = Date.now()
  site.add(...entry(OLD + 10, { resourceId: '01ABOUT' }))
  site.add(...entry(fresh, { resourceId: '01FRESH' }))
  const third = await pullEmdash(site.app, again.cursor)
  assert.deepEqual(
    third.entries.map((e) => e.resourceId),
    ['01ABOUT']
  )
  assert.equal(third.cursor, `${OLD + 10}-01ABOUT`, 'the cursor stops before the unsettled entry')
})

test('emdash: a site built before the theme had the audit log reads enabled=false', async () => {
  const site = emdashSite({ declared: false })
  const result = await pullEmdash(site.app)
  assert.equal(result.enabled, false)
  assert.equal(result.reason, 'log-disabled')
  assert.deepEqual(result.entries, [])
})

test('emdash: entries wiped after a pull start over from the beginning', async () => {
  const site = emdashSite({ entries: [entry(OLD + 50, { resourceId: '01ZZZ' })] })
  const first = await pullEmdash(site.app)
  site.clear()
  site.add(...entry(OLD, { resourceId: '01AAA' }))
  const after = await pullEmdash(site.app, first.cursor)
  assert.equal(after.reset, true)
  assert.deepEqual(
    after.entries.map((e) => e.resourceId),
    ['01AAA']
  )
})

// ---------------------------------------------------------------------------------------------
// EmDash publish state: the same adapter also reads each entry's publish state, and the mapping
// turns a change between two pulls into a `publish` / `unpublish` row (measured on c1em1004,
// tasks/evidence/emdash-attribution/publish-state-measure.md).
// ---------------------------------------------------------------------------------------------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** A ULID minted at `ms` (EmDash's revision ids): ten time characters, then sixteen of `tail`. */
function ulid(ms, tail = 'R') {
  let time = ''
  for (let n = ms, i = 0; i < 10; i++, n = Math.floor(n / 32)) time = CROCKFORD[n % 32] + time
  return time + tail.repeat(16).slice(0, 16)
}

/** A site whose data.db also holds `ec_posts` and `revisions`, as EmDash 1.0.1 shapes them. */
function emdashContentSite() {
  const site = emdashSite()
  const file = path.join(site.app, 'data', 'data.db')
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE ec_posts (id TEXT PRIMARY KEY, slug TEXT, status TEXT, author_id TEXT, created_at TEXT,
      updated_at TEXT, published_at TEXT, scheduled_at TEXT, deleted_at TEXT, version INTEGER,
      live_revision_id TEXT, draft_revision_id TEXT, locale TEXT, title TEXT, content TEXT);
    CREATE TABLE ec_settings_like (id TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE revisions (id TEXT PRIMARY KEY, collection TEXT, entry_id TEXT, data TEXT, author_id TEXT, created_at TEXT);`)
  db.close()
  const write = (fn) => {
    const w = new DatabaseSync(file)
    try {
      fn(w)
    } finally {
      w.close()
    }
  }
  return {
    ...site,
    /** Insert or replace one post; `content` stands for a field value that must never leave. */
    post: (row) =>
      write((w) =>
        w
          .prepare(
            `INSERT OR REPLACE INTO ec_posts (id, slug, status, created_at, updated_at, published_at, scheduled_at,
               deleted_at, version, live_revision_id, draft_revision_id, locale, title, content)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            row.id,
            row.slug ?? null,
            row.status,
            row.created_at,
            row.updated_at,
            row.published_at ?? null,
            row.scheduled_at ?? null,
            row.deleted_at ?? null,
            row.version ?? 1,
            row.live ?? null,
            row.draft ?? null,
            'en',
            row.title ?? null,
            'private body text'
          )
      ),
    revision: (id, entryId, ms) =>
      write((w) =>
        w
          .prepare('INSERT INTO revisions VALUES (?,?,?,?,?,?)')
          .run(id, 'posts', entryId, '{}', null, new Date(ms).toISOString().slice(0, 19).replace('T', ' '))
      )
  }
}

/** Pull with the publish-state snapshot tracy-web keeps (`state`), through the real adapter. */
async function pullState(app, { cursor = '', state = null } = {}) {
  const jobs = fakeJobs()
  const run = async ({ args }) => {
    const arg = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : '')
    const out = execFileSync(process.execPath, ['--no-warnings', EMDASH_ADAPTER], {
      env: {
        ...process.env,
        TRACY_CMS_LOG_APP_DIR: app,
        TRACY_CMS_LOG_CURSOR: arg('--cursor'),
        TRACY_CMS_LOG_SINCE: arg('--since')
      },
      encoding: 'utf8'
    })
    return { code: 0, tail: out.trim().split('\n') }
  }
  await runCmsLogJob({
    jobId: 's1',
    body: { kind: 'cms-log-pull', label: 'em1', platform: 'emdash', cursor, ...(state ? { state } : {}) },
    config: { scriptsDir: '/opt/tracy-fleet' },
    jobs,
    run
  })
  const job = jobs.all.get('s1')
  assert.equal(job.state, 'done', job.detail ?? job.output)
  return JSON.parse(job.output)
}

const T0 = Date.now() - 10 * 60_000 // the seed: every post written ten minutes ago
const LIVE = ulid(T0 - 1000, 'A')
const live = (id, over = {}) => ({
  id,
  slug: id.toLowerCase(),
  status: 'published',
  created_at: at(T0),
  updated_at: at(T0),
  published_at: at(T0),
  live: LIVE,
  title: `Title of ${id}`,
  ...over
})
/** The snapshot as if the last pull had been two minutes ago, so a change made "since" is settled. */
const rewind = (result) => ({
  ...result,
  state: { ...result.state, w: at(Date.parse(result.state.w) - 120_000) }
})
const stateRows = (result) => result.entries.filter((e) => e.changeType?.startsWith('entry-state:'))

test('emdash state: the first pull takes the snapshot silently — no row for entries already there', async () => {
  const site = emdashContentSite()
  site.post(live('01LIVE'))
  site.post(live('01DRAFT', { status: 'draft', live: null, published_at: null }))
  site.post(live('01PEND', { draft: ulid(T0, 'P') }))
  const result = await pullState(site.app)
  assert.deepEqual(stateRows(result), [])
  assert.equal(typeof result.state.w, 'string')
  assert.ok(
    Date.parse(result.state.w) <= Date.now() - 5000,
    'the mark stays behind what may still be written'
  )
  assert.deepEqual(
    result.state.e,
    {
      'posts/01DRAFT': ['draft', null, null],
      'posts/01PEND': ['published', LIVE, null]
    },
    'only entries that are not plainly live are kept: a live one is the default'
  )
  assert.doesNotMatch(JSON.stringify(result), /private body text/, 'no content value leaves the site')
})

test('emdash state: an unpublish and a publish between two pulls are one row each, with no actor', async () => {
  const site = emdashContentSite()
  site.post(live('01GONE'))
  site.post(live('01BACK', { status: 'draft', live: null, draft: ulid(T0, 'D') }))
  const first = rewind(await pullState(site.app))
  const t1 = Date.parse(first.state.w) + 1000
  site.post(
    live('01GONE', { status: 'draft', live: null, draft: ulid(t1, 'U'), updated_at: at(t1), version: 2 })
  )
  site.post(live('01BACK', { status: 'published', live: ulid(T0, 'D'), draft: null, updated_at: at(t1 + 1) }))
  const second = await pullState(site.app, { cursor: first.cursor, state: first.state })
  assert.deepEqual(stateRows(second), [
    {
      cursorKey: `state:${at(t1)}:posts/01GONE:unpublish`,
      occurredAt: at(t1),
      actor: null,
      resourceType: 'posts',
      resourceId: '01GONE',
      resourceTitle: 'Title of 01GONE',
      op: 'unpublish',
      changeType: 'entry-state:unpublish',
      producer: null
    },
    {
      cursorKey: `state:${at(t1 + 1)}:posts/01BACK:publish`,
      occurredAt: at(t1 + 1),
      actor: null,
      resourceType: 'posts',
      resourceId: '01BACK',
      resourceTitle: 'Title of 01BACK',
      op: 'publish',
      changeType: 'entry-state:publish',
      producer: null
    }
  ])
  assert.deepEqual(second.state.e, { 'posts/01GONE': ['draft', null, null] })
  const third = await pullState(site.app, { cursor: second.cursor, state: second.state })
  assert.deepEqual(stateRows(third), [], 'a pull with the new snapshot repeats nothing')
})

test('emdash state: a scheduled publish that fired on time is told apart from a person publishing early', async () => {
  const site = emdashContentSite()
  const s = T0 + 60_000
  site.post(live('01SCHED', { status: 'scheduled', live: null, published_at: null, scheduled_at: at(s) }))
  site.post(
    live('01EARLY', { status: 'scheduled', live: null, published_at: null, scheduled_at: at(s + 120_000) })
  )
  const first = await pullState(site.app, { state: { w: at(T0 + 1000), e: {} } })
  assert.deepEqual(first.state.e['posts/01SCHED'], ['scheduled', null, at(s)])
  // The sweep publishes 48 s after S (measured A7); a person presses Publish before the time.
  site.post(live('01SCHED', { live: ulid(s + 48_000, 'S'), published_at: at(s), updated_at: at(s + 48_000) }))
  site.post(
    live('01EARLY', { live: ulid(s + 50_000, 'E'), published_at: at(s + 50_000), updated_at: at(s + 50_000) })
  )
  const second = await pullState(site.app, {
    cursor: first.cursor,
    state: { ...first.state, w: at(T0 + 2000) }
  })
  assert.deepEqual(
    stateRows(second).map((e) => [e.resourceId, e.op, e.changeType]),
    [
      ['01SCHED', 'publish', 'entry-state:scheduled-publish'],
      ['01EARLY', 'publish', 'entry-state:publish']
    ],
    'in the order they happened'
  )
})

test('emdash state: an edit of a live entry is no publish; putting the pending change live is', async () => {
  const site = emdashContentSite()
  site.post(live('01EDIT'))
  const first = rewind(await pullState(site.app))
  // The admin's Save on a live entry stages a draft revision and leaves updated_at alone (A3).
  const pending = ulid(Date.parse(first.state.w) + 500, 'P')
  site.post(live('01EDIT', { draft: pending, version: 2 }))
  const second = rewind(await pullState(site.app, { cursor: first.cursor, state: first.state }))
  assert.deepEqual(stateRows(second), [])
  assert.deepEqual(second.state.e, { 'posts/01EDIT': ['published', LIVE, null] })
  // Publish of the pending change: the draft revision becomes the live one (A4).
  const t2 = Date.parse(second.state.w) + 1000
  site.post(live('01EDIT', { live: pending, draft: null, updated_at: at(t2), version: 3 }))
  const third = await pullState(site.app, { cursor: second.cursor, state: second.state })
  assert.deepEqual(
    stateRows(third).map((e) => [e.resourceId, e.op]),
    [['01EDIT', 'publish']]
  )
  assert.deepEqual(third.state.e, {})
})

test('emdash state: edit and publish inside one interval is a publish; a touch that keeps the live revision is not', async () => {
  const site = emdashContentSite()
  site.post(live('01QUICK'))
  site.post(live('01TOUCH'))
  const first = rewind(await pullState(site.app))
  const t1 = Date.parse(first.state.w) + 1000
  site.post(live('01QUICK', { live: ulid(t1 - 200, 'Q'), updated_at: at(t1) }))
  site.post(live('01TOUCH', { updated_at: at(t1) }))
  const second = await pullState(site.app, { cursor: first.cursor, state: first.state })
  assert.deepEqual(
    stateRows(second).map((e) => [e.resourceId, e.op]),
    [['01QUICK', 'publish']]
  )
})

test('emdash state: a new entry created and published since the last pull is a publish; a new draft is not', async () => {
  const site = emdashContentSite()
  const first = rewind(await pullState(site.app))
  const t1 = Date.parse(first.state.w) + 1000
  site.post(live('01FRESH', { created_at: at(t1), updated_at: at(t1 + 10), live: ulid(t1 + 10, 'F') }))
  site.post(live('01NDRAFT', { status: 'draft', live: null, created_at: at(t1), updated_at: at(t1) }))
  const second = await pullState(site.app, { cursor: first.cursor, state: first.state })
  assert.deepEqual(
    stateRows(second).map((e) => [e.resourceId, e.op]),
    [['01FRESH', 'publish']]
  )
  assert.deepEqual(second.state.e, { 'posts/01NDRAFT': ['draft', null, null] })
})

test('emdash state: an entry in the trash gets no publish or unpublish row', async () => {
  const site = emdashContentSite()
  site.post(live('01BIN'))
  const first = rewind(await pullState(site.app))
  const t1 = Date.parse(first.state.w) + 1000
  site.post(live('01BIN', { status: 'draft', live: null, updated_at: at(t1), deleted_at: at(t1 + 5) }))
  const second = await pullState(site.app, { cursor: first.cursor, state: first.state })
  assert.deepEqual(stateRows(second), [])
})

test('emdash state: a change younger than five seconds waits for the next pull, and is not lost', async () => {
  const site = emdashContentSite()
  site.post(live('01SLOW'))
  const first = await pullState(site.app)
  const now = Date.now()
  site.post(live('01SLOW', { status: 'draft', live: null, updated_at: at(now) }))
  const second = await pullState(site.app, { cursor: first.cursor, state: first.state })
  assert.deepEqual(stateRows(second), [])
  assert.equal(second.state.e['posts/01SLOW'], undefined, 'the unsettled entry keeps its old state')
  assert.ok(Date.parse(second.state.w) < now)
  await new Promise((resolve) => setTimeout(resolve, 5200))
  const third = await pullState(site.app, { cursor: second.cursor, state: second.state })
  assert.deepEqual(
    stateRows(third).map((e) => [e.resourceId, e.op]),
    [['01SLOW', 'unpublish']]
  )
})

test('emdash state: a snapshot that is not one the mapping wrote is ignored and taken again silently', async () => {
  const site = emdashContentSite()
  site.post(live('01ANY', { status: 'draft', live: null }))
  for (const state of [{ w: 'yesterday', e: {} }, { w: at(T0 - 1000), e: { 'posts/01ANY': 'x' } }, 'nope']) {
    const result = await pullState(site.app, { state })
    assert.deepEqual(stateRows(result), [], JSON.stringify(state))
    assert.deepEqual(result.state.e, { 'posts/01ANY': ['draft', null, null] })
  }
})

// ---------------------------------------------------------------------------------------------
// The door: `POST /_host/site` with kind `cms-log-pull`
// ---------------------------------------------------------------------------------------------

function hostConfig() {
  const dir = (name) => mkdtempSync(path.join(tmpdir(), `cms-log-${name}-`))
  return {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: dir('sites'),
    privateRoot: dir('private'),
    scriptsDir: '/opt/tracy-fleet',
    jobsDir: dir('jobs'),
    logDir: dir('logs'),
    cloudflare: null
  }
}

async function signed(app, method, urlPath, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload)
  const headers = await signHostCall({ secret: 'host-secret', path: urlPath, body })
  return app.fetch(
    new Request(`http://tracy-host.test${urlPath}`, { method, headers, ...(body ? { body } : {}) })
  )
}

test('POST /_host/site cms-log-pull: 202, then a done job whose output is the mapped answer', async () => {
  const jobs = fakeJobs()
  const run = async () => ({ code: 0, tail: [JSON.stringify(joomla([joomlaRow(117)]))] })
  const app = buildApp({ config: hostConfig(), jobs, run })
  const res = await signed(app, 'POST', '/_host/site', {
    kind: 'cms-log-pull',
    label: 'scjo1002',
    platform: 'joomla',
    cursor: '116'
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  let job
  for (let i = 0; i < 200 && job?.state !== 'done'; i++) {
    job = await (await signed(app, 'GET', `/_host/jobs/${jobId}`)).json()
    await new Promise((r) => setTimeout(r, 5))
  }
  assert.equal(job.state, 'done')
  assert.equal(JSON.parse(job.output).cursor, '117')
})

test('POST /_host/site cms-log-pull: a bad platform, cursor or label is refused 400 before any job runs', async () => {
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: hostConfig(), jobs: fakeJobs(), run })
  for (const body of [
    { kind: 'cms-log-pull', label: 'a', platform: 'drupal' },
    { kind: 'cms-log-pull', label: 'a', platform: 'joomla', cursor: '$(id)' },
    { kind: 'cms-log-pull', label: '../a', platform: 'joomla' }
  ]) {
    const res = await signed(app, 'POST', '/_host/site', body)
    assert.equal(res.status, 400, JSON.stringify(body))
  }
})
