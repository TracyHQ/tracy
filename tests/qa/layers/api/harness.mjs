// In-process boot of apps/tracy-web for the api layer.
//
// The product is imported from an APP ROOT (the tree under test, or a scratch copy carrying a
// mutation). Everything outside the process is a stand-in: a mail sink, a host fake that records
// and answers from a script, a seat-door fake, an outbound-fetch allowlist that refuses every real
// network call. Identity and the site book live in an owned PostgreSQL database (database.mjs).
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

export const ORIGIN = 'http://tracy.test:8080'
export const API_ORIGIN = 'http://api.test'

// Planted secrets: long, distinctive, and absent from any legitimate response.
export const SECRETS = Object.freeze({
  SESSION_SECRET: `qa-session-secret-${'s'.repeat(24)}`,
  API_KEY_PEPPER: `qa-pepper-secret-${'p'.repeat(24)}`,
  HOST_local_SECRET: 'qa-host-secret-hhhhhhhhhhhhhhhhhhhhhhhh',
  SEAT_local_SECRET: 'qa-seat-secret-kkkkkkkkkkkkkkkkkkkkkkkk',
  // dsh's actor assertion is signed with its own secret, not the session one.
  MCP_TRACY_ACTOR_SECRET: `qa-actor-secret-${'a'.repeat(24)}`,
  GITHUB_WEBHOOK_SECRET: `qa-github-webhook-${'w'.repeat(24)}`,
  GITHUB_APP_PRIVATE_KEY: `qa-github-private-key-${'g'.repeat(24)}`,
  WHITELIST_CONFIRMATION_SECRET: `qa-whitelist-${'c'.repeat(24)}`,
  CS_TELEGRAM_WEBHOOK_SECRET: `qa-telegram-hook-${'t'.repeat(24)}`
})

export const ENV = Object.freeze({
  TRACY_ORIGIN: ORIGIN,
  API_ORIGIN,
  SITE_DOMAIN: 'localhost',
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  GITHUB_APP_ID: '424242',
  GITHUB_ORG: 'qa-org',
  CS_TELEGRAM_MODE: 'webhook',
  CS_TELEGRAM_BOT_TOKEN: '424242:qa-telegram-bot-token',
  CS_TELEGRAM_CHAT_ID: '-1001234567890',
  ...SECRETS
})

/** Fixture people and sites; see seed(). Emails are inert (.test). */
export const FIXTURE = Object.freeze({
  siteA: 'qa-a.localhost',
  siteB: 'qa-b.localhost',
  owner: 'owner-a@qa.test',
  editor: 'editor-a@qa.test',
  viewer: 'viewer-a@qa.test',
  outsider: 'owner-b@qa.test',
  nobody: 'nobody@qa.test',
  staff: 'staff@qa.test',
  canary: 'QA-CANARY-SITE-A-PRIVATE-LABEL'
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Import the product modules this harness needs from an app root. */
export async function loadProduct(appRoot) {
  const at = (p) => import(pathToFileURL(join(appRoot, 'src', p)).href)
  const [app, config, db, identity, resolver, session, apiKey, hostClient, routeDocs, siteStore, cron] =
    await Promise.all([
      at('app.js'),
      at('config.js'),
      at('db/index.js'),
      at('identity/store.js'),
      at('sites/resolver.js'),
      at('lib/session.js'),
      at('lib/api-key.js'),
      at('host/client.js'),
      at('api-reference/routes/index.js'),
      at('sites/store.js'),
      at('cron.js')
    ])
  return {
    appRoot,
    app,
    config,
    db,
    identity,
    resolver,
    session,
    apiKey,
    hostClient,
    routeDocs,
    siteStore,
    cron
  }
}

/**
 * A probe usable by startOwnedDatabase: a real connection and a real statement, bounded. `pg` is not
 * a dependency of tests/qa, so pools come from the product's own createPool.
 */
export function probeDatabase(product) {
  return async (url) => {
    const pool = product.db.createPool(`${url}${url.includes('?') ? '&' : '?'}connect_timeout=2`)
    pool.on('error', () => {})
    try {
      const r = await pool.query('select 1 as ok')
      return r.rows[0]?.ok === 1
    } catch {
      return false
    } finally {
      await pool.end().catch(() => {})
    }
  }
}

/** A database of its own inside the owned cluster, migrated by the product's own migrator. */
export async function createRunDatabase(clusterUrl, product, label) {
  const name = `qa_${label}_${randomBytes(4).toString('hex')}`
  const admin = product.db.createPool(clusterUrl)
  admin.on('error', () => {})
  try {
    await admin.query(`create database ${name}`)
  } finally {
    await admin.end()
  }
  const url = new URL(clusterUrl)
  url.pathname = `/${name}`
  const pool = product.db.createPool(url.toString())
  pool.on('error', () => {})
  await product.db.migrate(pool)
  return {
    name,
    url: url.toString(),
    pool,
    async close() {
      await pool.end().catch(() => {})
      const drop = product.db.createPool(clusterUrl)
      drop.on('error', () => {})
      try {
        await drop.query(`drop database if exists ${name} with (force)`)
      } finally {
        await drop.end()
      }
    }
  }
}

/**
 * Snapshot of the seeded state, taken inside the database itself (schema `qa_tmpl`), and the reset
 * that puts it back: truncate every base table of the live schema and copy the snapshot rows in.
 * One boot then serves every door, each from the same fixtures, even after a control request that
 * really wrote (DELETE /api/sites/{key}…). Sequences are left to run on: restored rows carry older ids.
 */
export async function makeSnapshot(pool) {
  const { rows } = await pool.query(
    `select table_name from information_schema.tables
      where table_schema = current_schema() and table_type = 'BASE TABLE' order by 1`
  )
  const tables = rows.map((r) => r.table_name)
  await pool.query('create schema qa_tmpl')
  for (const t of tables) await pool.query(`create table qa_tmpl."${t}" as select * from "${t}"`)
  const list = tables.map((t) => `"${t}"`).join(', ')
  return async function reset() {
    const client = await pool.connect()
    try {
      await client.query('set session_replication_role = replica')
      await client.query(`truncate ${list}`)
      for (const t of tables) await client.query(`insert into "${t}" select * from qa_tmpl."${t}"`)
      await client.query('reset session_replication_role')
    } finally {
      client.release()
    }
  }
}

export async function dropDatabase(clusterUrl, product, name) {
  const drop = product.db.createPool(clusterUrl)
  drop.on('error', () => {})
  try {
    await drop.query(`drop database if exists ${name} with (force)`)
  } finally {
    await drop.end()
  }
}

async function accountId(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  return rows[0].id
}

/**
 * Two tenants and every role:
 *   site A (owner / admin / developer / editor seats) in workspace WA; site B (its own owner) in WB;
 *   a Tracy staff seat in the tracy_admin workspace; one person with an account and no seat.
 * Returns ids the cases need (workspace ids, the API keys).
 */
export async function seed(product, pool) {
  const ids = {}
  const mk = (email) => accountId(pool, email)
  for (const [key, label] of [
    [FIXTURE.siteA, 'qa-a'],
    [FIXTURE.siteB, 'qa-b']
  ])
    await pool.query(
      `insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'joomla')`,
      [key, label]
    )
  const seat = async (siteKey, email, role) =>
    pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [siteKey, await mk(email), role]
    )
  // A paired plugin on each site, so a door gets past "no component registered" to its own validation.
  for (const key of [FIXTURE.siteA, FIXTURE.siteB])
    await product.siteStore.writeComponent(
      pool,
      key,
      { endpoint: `https://${key}.example/cowork`, token: 'z'.repeat(24) },
      FIXTURE.owner
    )
  await seat(FIXTURE.siteA, FIXTURE.owner, 'owner')
  await seat(FIXTURE.siteA, FIXTURE.editor, 'editor')
  await seat(FIXTURE.siteA, FIXTURE.viewer, 'viewer')
  await seat(FIXTURE.siteB, FIXTURE.outsider, 'owner')
  await mk(FIXTURE.nobody)
  // The canary: a private value that lives only on site A's book row.
  await pool.query('update site set repo = $2 where site_key = $1', [FIXTURE.siteA, FIXTURE.canary])

  const workspace = async (name, kind, ownerEmail, siteKey) => {
    const w = (
      await pool.query(`insert into workspace (display_name, kind) values ($1, $2) returning id`, [
        name,
        kind
      ])
    ).rows[0].id
    await pool.query(
      `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
       values ($1, $2, 'owner', $2, now())`,
      [w, await mk(ownerEmail)]
    )
    if (siteKey)
      await pool.query('insert into workspace_site (workspace_id, site_key) values ($1, $2)', [w, siteKey])
    return w
  }
  ids.workspaceA = await workspace('QA Workspace A', 'customer', FIXTURE.owner, FIXTURE.siteA)
  ids.workspaceB = await workspace('QA Workspace B', 'customer', FIXTURE.outsider, FIXTURE.siteB)
  ids.workspaceAdmin = await workspace('QA Tracy', 'tracy_admin', FIXTURE.staff, null)

  const keyFor = async (email, siteKey) =>
    product.apiKey.mintKey({
      pool,
      accountId: await mk(email),
      siteKey,
      label: 'qa',
      scopes: ['content', 'code', 'site', 'lifecycle'],
      pepper: SECRETS.API_KEY_PEPPER
    })
  ids.keyOwnerA = await keyFor(FIXTURE.owner, FIXTURE.siteA)
  ids.keyOutsiderB = await keyFor(FIXTURE.outsider, FIXTURE.siteB)
  ids.keyRevoked = await keyFor(FIXTURE.owner, FIXTURE.siteA)
  await product.apiKey.revokeKey(pool, await mk(FIXTURE.owner), ids.keyRevoked.id)
  // The values a response must never carry: the pepper-derived hash and the secret half of each key.
  const hashes = await pool.query('select secret_hash from api_key')
  ids.secretValues = {
    ...SECRETS,
    keyOwnerSecret: ids.keyOwnerA.key.split('.')[1],
    keyOutsiderSecret: ids.keyOutsiderB.key.split('.')[1],
    keyRevokedSecret: ids.keyRevoked.key.split('.')[1],
    ...Object.fromEntries(hashes.rows.map((r, i) => [`apiKeyHash${i}`, r.secret_hash]))
  }
  return ids
}

/** Tables a refused request is ALLOWED to touch: per-caller counters kept to throttle abuse. */
export const BOOKKEEPING_TABLES = Object.freeze(['rate_bucket'])

/**
 * Columns a refused request is ALLOWED to touch, and only on the caller's own row: a valid key is
 * marked used when it authenticates (`lib/api-key.js`, throttled), before any site check runs, so a
 * foreign request refused 403 still moves it. Every other key's row, and the rest of the caller's,
 * stays in the witness: a write to another tenant's key is a finding.
 */
export const BOOKKEEPING_COLUMNS = Object.freeze({ api_key: Object.freeze(['last_used_at']) })

/**
 * Row count and a content hash of every base table — the "nothing was written" witness (an UPDATE that
 * keeps the count still changes the hash) for a refused request — in one
 * round trip. The table list is read once; a table created later is not part of the witness. The
 * returned function takes the ids of the caller's own rows (`own`), the only rows whose
 * BOOKKEEPING_COLUMNS are left out; before and after must be taken with the same ids.
 */
export async function makeFingerprint(pool) {
  const { rows } = await pool.query(
    `select table_name from information_schema.tables
      where table_schema = current_schema() and table_type = 'BASE TABLE' order by 1`
  )
  const names = rows.map((r) => r.table_name).filter((t) => !BOOKKEEPING_TABLES.includes(t))
  const row = (t) =>
    BOOKKEEPING_COLUMNS[t]
      ? `(case when x.id::text = any($1::text[]) then to_jsonb(x) ${BOOKKEEPING_COLUMNS[t].map((c) => `- '${c}'`).join(' ')} else to_jsonb(x) end)::text`
      : 'x::text'
  const sql = names
    .map(
      (t) =>
        `select '${t}' as t, count(*)::text || ':' || coalesce(md5(string_agg(${row(t)}, '|' order by ${row(t)})), '') as n from "${t}" x`
    )
    .join(' union all ')
  return async (own = []) =>
    Object.fromEntries((await pool.query(sql, [own.map(String)])).rows.map((r) => [r.t, r.n]))
}

/**
 * Boot the app. `mode.hostDown` makes the host fake throw (dependency-failure); `mode.log` collects
 * what the host fake, mail sink, seat door and blocked fetches saw.
 */
export function bootApp(product, pool, { hostDown = false } = {}) {
  const config = product.config.readConfig(ENV)
  const seen = { mail: [], host: [], seatDoor: [], blockedFetch: [] }
  const mail = { send: async (m) => void seen.mail.push(m), available: true }
  const host = {
    hostCall: async (...args) => {
      seen.host.push({ kind: 'call', args: args.length })
      if (hostDown) throw new Error('qa: host unreachable')
      return { ok: false, status: 503, body: { code: 'QA_HOST_STUB' } }
    },
    hostJob: async (...args) => {
      seen.host.push({ kind: 'job', args: args.length })
      if (hostDown) throw new Error('qa: host unreachable')
      return { ok: false, status: 503, body: { code: 'QA_HOST_STUB' } }
    }
  }
  const seatDoor = {
    mintSeatSession: async () => (seen.seatDoor.push('mint'), null),
    revokeSeatAtDoor: async () => (seen.seatDoor.push('revoke'), { ok: true }),
    forgetWorkspaceAtDoor: async () => (seen.seatDoor.push('forget'), { ok: true }),
    archiveSessionsAtDoor: async () => (seen.seatDoor.push('archive'), { ok: true })
  }
  // The allowlist is empty: nothing in-process may reach a real network.
  const fetchImpl = async (input) => {
    seen.blockedFetch.push(String(input?.url ?? input))
    throw new Error('qa: outbound network is blocked in the api layer')
  }
  const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} }
  const app = product.app.buildApp({
    config,
    env: ENV,
    log: silent,
    fetchImpl,
    identity: product.identity.pgIdentityStore(pool),
    pool,
    mail,
    sites: product.resolver.dbSitesResolver(pool, config),
    seatDoor,
    host
  })
  return { app, config, seen }
}

/** Build a Request-sender on an app. `where` is 'tracy' or 'api' (which hostname the call arrives on). */
export function sender(app) {
  return async function send({
    method,
    path,
    where = 'tracy',
    headers = {},
    body,
    timeoutMs = 15_000,
    signal
  }) {
    // `where` may also be a whole origin: a request on a name that is not Tracy's (a customer's own domain).
    const base = where === 'api' ? API_ORIGIN : /^https?:\/\//.test(where) ? where : ORIGIN
    const init = { method, headers: { ...headers } }
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
    if (signal) init.signal = signal
    const started = Date.now()
    let timer
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`qa: no answer within ${timeoutMs} ms`)), timeoutMs)
    })
    try {
      const res = await Promise.race([app.fetch(new Request(`${base}${path}`, init)), deadline])
      const text = await Promise.race([res.text(), deadline])
      let json
      try {
        json = JSON.parse(text)
      } catch {}
      const hdrs = {}
      res.headers.forEach((v, k) => (hdrs[k] = v))
      if (typeof res.headers.getSetCookie === 'function')
        hdrs['set-cookie'] = res.headers.getSetCookie().join('\n')
      return { status: res.status, headers: hdrs, text, json, ms: Date.now() - started }
    } catch (error) {
      return {
        status: 0,
        headers: {},
        text: '',
        error: String(error?.message ?? error),
        ms: Date.now() - started
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Cookies and bearer keys for the fixture people. */
export async function principals(product, ids) {
  const secret = SECRETS.SESSION_SECRET
  const actorSecret = SECRETS.MCP_TRACY_ACTOR_SECRET
  const cookie = async (email, at = Date.now()) =>
    `tracy_sess=${await product.session.mintSession(email, secret, at)}`
  const THIRTY_DAYS = 30 * 24 * 3600 * 1000
  return {
    cookie,
    expiredCookie: (email) => cookie(email, Date.now() - THIRTY_DAYS),
    // A syntactically perfect token signed with a key that is not ours.
    forgedCookie: async (email) => `tracy_sess=${await product.session.mintSession(email, 'x'.repeat(40))}`,
    // dsh's actor assertion is a session-shaped token that expires within five minutes.
    actor: async (email) =>
      await product.session.mintSession(email, actorSecret, Date.now() - 72 * 3600 * 1000 + 60_000),
    // The same shape, already past its expiry.
    staleActor: (email) =>
      product.session.mintSession(email, actorSecret, Date.now() - 72 * 3600 * 1000 - 3600_000),
    bearer: { ownerA: ids.keyOwnerA.key, outsiderB: ids.keyOutsiderB.key }
  }
}

export { wait }
