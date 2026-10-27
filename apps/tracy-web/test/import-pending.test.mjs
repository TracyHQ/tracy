// An unfinished import is never opened as a workspace (`src/lib/import-pending.js`).
//
// The report: "an import fails, then the customer opens the app and cannot choose a workspace". The
// import claims its row (an accepted seat) before the read; a failed read keeps the row for Retry
// (#1578); the host folder is built only by the provision at the end. Landing on `/` picked the
// earliest accepted seat and sent the person into that folder-less site, where dsh answered
// `workspace/invalid-path`. These cases pin every way in: the landing, a named path, the pointer
// cookie, the Start the agent door and the site list.
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { importPending, importRecoveryPath } from '../src/lib/import-pending.js'
import { mintSession } from '../src/lib/session.js'
import { labelPrefix } from '../src/sites/label.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { pendingInvitesFor } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'

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
  ARTIFACT_S3_ENDPOINT: 'http://r2.test',
  ARTIFACT_S3_BUCKET: 'artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'AK',
  ARTIFACT_S3_SECRET_KEY: 'SK'
}

const IMPORTED = 'old-shop.example.com'
const READY = 'quayside.localhost'

/** The app on the test schema, with a fake host and dsh that record every call. */
function harness(pool) {
  const calls = []
  const fetchImpl = async (input) => {
    const u = new URL(String(input))
    calls.push(u.pathname)
    if (u.pathname === '/_host/provision') return Response.json({ jobId: 'job-1' })
    if (u.pathname === '/_host/attach') return Response.json({ lane: 'ok' })
    if (u.pathname === '/_host/agent-token') return Response.json({ token: 'x'.repeat(40) })
    return Response.json({ ok: true })
  }
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, { body, html = false } = {}) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(html ? { accept: 'text/html' } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  return { calls, cookieFor, send }
}

/** The claim the import wizard makes before its read: the row and an accepted owner seat. */
async function claimImport(send, cookie) {
  const res = await send('POST', '/api/sites', cookie, {
    body: { origin: 'import', siteKey: IMPORTED, platform: 'wordpress' }
  })
  assert.equal(res.status, 201)
}

/** A built site with a lane, its owner seat granted `ago` before now. */
async function readySite(pool, email, { siteKey = READY, origin = 'fleet_born', ago = '1 hour' } = {}) {
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, attached, port)
     values ($1, $2, 'local', 'wordpress', $3, true, 41000)`,
    [siteKey, siteKey.split('.')[0], origin]
  )
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at, granted_at)
     values ($1, $2, 'owner', $2, now(), now() + $3::interval)`,
    [siteKey, rows[0].id, ago]
  )
}

const location = (res) => res.headers.get('location')

test(
  'landing on / with only a failed import goes to the recovery page, not into the site',
  opts,
  async () => {
    const { send, cookieFor } = harness(db.pool)
    const owner = await cookieFor('owner@x.y')
    await claimImport(send, owner)

    const res = await send('GET', '/', owner, { html: true })
    assert.equal(res.status, 302)
    assert.equal(location(res), importRecoveryPath(IMPORTED))
    assert.equal(location(res), `/new/?tab=tracy:add-site&import=${IMPORTED}`)
  }
)

test('landing on / with a ready site and a failed import lands on the ready one', opts, async () => {
  const { send, cookieFor } = harness(db.pool)
  const owner = await cookieFor('owner@x.y')
  // The import's seat is the EARLIER one: the order alone used to pick it.
  await claimImport(send, owner)
  await readySite(db.pool, 'owner@x.y', { ago: '1 hour' })

  const res = await send('GET', '/', owner, { html: true })
  assert.equal(location(res), `/${READY}/`)
})

test(
  'a named path to a failed import goes to the recovery page; a fetch gets IMPORT_NOT_FINISHED',
  opts,
  async () => {
    const { send, cookieFor, calls } = harness(db.pool)
    const owner = await cookieFor('owner@x.y')
    await claimImport(send, owner)
    const before = calls.length

    const page = await send('GET', `/${IMPORTED}/`, owner, { html: true })
    assert.equal(page.status, 302)
    assert.equal(location(page), importRecoveryPath(IMPORTED))

    const fetched = await send('GET', `/${IMPORTED}/api/anything`, owner)
    assert.equal(fetched.status, 409)
    assert.equal((await fetched.json()).code, 'IMPORT_NOT_FINISHED')
    assert.deepEqual(calls.slice(before), [], 'no seat was minted and no dsh was asked')
  }
)

test('a stranger naming a failed import still gets the join page', opts, async () => {
  const { send, cookieFor } = harness(db.pool)
  await claimImport(send, await cookieFor('owner@x.y'))

  const res = await send('GET', `/${IMPORTED}/`, await cookieFor('stranger@x.y'), { html: true })
  assert.match(location(res), /\/join\?next=/)
})

test(
  'an old tracy_site pointer to a failed import is forgotten; the person lands as themselves',
  opts,
  async () => {
    const { send, cookieFor } = harness(db.pool)
    const owner = await cookieFor('owner@x.y')
    await claimImport(send, owner)
    await readySite(db.pool, 'owner@x.y')

    const pointed = `${owner}; tracy_site=${IMPORTED}`
    const res = await send('GET', '/', pointed, { html: true })
    assert.equal(location(res), `/${READY}/`)
    assert.match(res.headers.get('set-cookie') ?? '', /tracy_site=;.*Max-Age=0/)

    // With nothing else, the same pointer ends on the recovery page.
    await db.pool.query('delete from site where site_key = $1', [READY])
    const alone = await send('GET', '/', pointed, { html: true })
    assert.equal(location(alone), importRecoveryPath(IMPORTED))
  }
)

test(
  'POST /api/sites/:key/agent on a failed import is refused, the host is not asked, nothing is attached',
  opts,
  async () => {
    const { send, cookieFor, calls } = harness(db.pool)
    const owner = await cookieFor('owner@x.y')
    await claimImport(send, owner)

    const res = await send('POST', `/api/sites/${IMPORTED}/agent`, owner)
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), {
      code: 'IMPORT_NOT_FINISHED',
      recovery: importRecoveryPath(IMPORTED)
    })
    assert.equal(calls.includes('/_host/attach'), false, 'no skeleton folder was asked for')
    const { rows } = await db.pool.query('select attached from site where site_key = $1', [IMPORTED])
    assert.equal(rows[0].attached, false)
  }
)

test(
  'GET /api/sites flags the unfinished import and keeps it listed; finished and created sites carry no flag',
  opts,
  async () => {
    const { send, cookieFor } = harness(db.pool)
    const owner = await cookieFor('owner@x.y')
    await claimImport(send, owner)
    // An earlier Start the agent press attached it: still no agent, still pending.
    await db.pool.query('update site set attached = true where site_key = $1', [IMPORTED])
    await readySite(db.pool, 'owner@x.y')

    const { sites } = await (await send('GET', '/api/sites', owner)).json()
    const imported = sites.find((s) => s.siteKey === IMPORTED)
    assert.equal(imported.importPending, true)
    assert.equal(imported.importRecovery, importRecoveryPath(IMPORTED))
    assert.equal(imported.imported, true)
    assert.equal(imported.agent, null)
    const ready = sites.find((s) => s.siteKey === READY)
    assert.equal(ready.importPending, undefined)
    assert.equal(ready.agent, '/')
  }
)

test('a finished import (provision filed) is a workspace like any other', opts, async () => {
  const { send, cookieFor } = harness(db.pool)
  const owner = await cookieFor('owner@x.y')
  await claimImport(send, owner)
  const provisioned = await send('POST', `/api/sites/${IMPORTED}/provision`, owner, {
    body: { platform: 'wordpress', webrootKey: `sites/${labelPrefix(IMPORTED)}/webroot.tar` }
  })
  assert.equal(provisioned.status, 202)
  assert.equal(await importPending(db.pool, IMPORTED), false)

  const landing = await send('GET', '/', owner, { html: true })
  assert.equal(location(landing), `/${IMPORTED}/`)
  const { sites } = await (await send('GET', '/api/sites', owner)).json()
  assert.equal(sites.find((s) => s.siteKey === IMPORTED).importPending, undefined)
  // …and its claim is no longer one a second read may reuse (#1578).
  const again = await send('POST', '/api/sites', owner, {
    body: { origin: 'import', siteKey: IMPORTED, platform: 'wordpress' }
  })
  assert.equal((await again.json()).retryable, undefined)
})

test(
  'a migrated row a host already built (it has a port) is never read as unfinished, job on record or not',
  opts,
  async () => {
    await readySite(db.pool, 'owner@x.y', { siteKey: 'legacy.example.com', origin: 'migrated' })
    assert.equal(await importPending(db.pool, 'legacy.example.com'), false)
  }
)

test(
  'an unanswered invitation is still listed apart; the recovery page comes before the Inbox',
  opts,
  async () => {
    const { send, cookieFor } = harness(db.pool)
    const owner = await cookieFor('owner@x.y')
    await claimImport(send, owner)
    await readySite(db.pool, 'other@x.y')
    const { rows } = await db.pool.query(`select id from account where email = 'owner@x.y'`)
    await db.pool.query(`insert into seat (site_key, account_id, role) values ($1, $2, 'editor')`, [
      READY,
      rows[0].id
    ])

    assert.deepEqual(await pendingInvitesFor(db.pool, 'owner@x.y'), [{ siteKey: READY, label: 'quayside' }])
    const res = await send('GET', '/', owner, { html: true })
    assert.equal(location(res), importRecoveryPath(IMPORTED))
  }
)
