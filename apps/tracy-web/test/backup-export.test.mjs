// A backup point downloaded by its Owner (plan `tasks/todo-backup-export.md`, S2): the two doors
// `POST /api/sites/:key/backups/:version/export` and `GET …/export/:exportId`, the sweep, and the
// artifact doors' refusal of the export namespace — against a scripted tracy-host and artifact
// store that answer as each test says.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { createBackupExports, downloadName, exportKey, issueLink } from '../src/sites/backup-export.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
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
  ARTIFACT_S3_ENDPOINT: 'https://store.test',
  ARTIFACT_S3_BUCKET: 'tracy-artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'ak',
  ARTIFACT_S3_SECRET_KEY: 'sk',
  // The doors exist only where the deployment turns them on (ADR 0024, amendment 3, unsigned).
  BACKUP_EXPORT: 'on'
}
const STORE = { endpoint: 'https://store.test', bucket: 'tracy-artifacts', accessKey: 'ak', secretKey: 'sk' }

const SITE = 'lantern.localhost'
const ZIP_BYTES = 4096
const ZIP_SHA = 'c'.repeat(64)
const EXPORTED = { ok: true, version: 3, commit: '3'.repeat(40), bytes: ZIP_BYTES, sha256: ZIP_SHA }

// ── pure: the key and the link ───────────────────────────────────────────────────────────────

test('exportKey: its own namespace, never under sites/<label>/', () => {
  const key = exportKey('lantern', '6f1c2d4e-0000-4000-8000-000000000001')
  assert.equal(key, 'backup-exports/lantern/6f1c2d4e-0000-4000-8000-000000000001.zip')
  assert.ok(!key.startsWith('sites/'))
})

test('issueLink: a fresh five-minute GET that downloads as <label>-backup-vN-<random>.zip, only for a ready, unexpired row', async () => {
  const now = Date.UTC(2026, 9, 11, 9, 0, 0)
  const row = {
    id: '6f1d2c3b-4a59-4e6f-8a7b-1c2d3e4f5a6b',
    state: 'ready',
    version: 3,
    key: 'backup-exports/lantern/e1.zip',
    expires_at: new Date(now + 3600_000)
  }
  const url = new URL(await issueLink(STORE, row, 'lantern', now))
  assert.equal(url.origin, 'https://store.test')
  assert.equal(url.pathname, '/tracy-artifacts/backup-exports/lantern/e1.zip')
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300')
  const name = /^attachment; filename="lantern-backup-v3-([0-9a-f]{16})\.zip"$/.exec(
    url.searchParams.get('response-content-disposition')
  )
  assert.ok(name, url.searchParams.get('response-content-disposition'))
  assert.ok(!row.id.replaceAll('-', '').includes(name[1]), 'the random part is not a piece of the id')
  assert.equal(url.searchParams.get('response-cache-control'), 'no-store')
  assert.equal(await issueLink(STORE, { ...row, expires_at: new Date(now - 1) }, 'lantern', now), null)
  assert.equal(await issueLink(STORE, { ...row, state: 'packing' }, 'lantern', now), null)
  // A browser fetches it: signed for the store's public address when there is one.
  const publicUrl = new URL(
    await issueLink({ ...STORE, publicEndpoint: 'https://files.example' }, row, 'lantern', now)
  )
  assert.equal(publicUrl.origin, 'https://files.example')
})

test('downloadName: the same name for one export every time, a different one for every other export', () => {
  const a = { id: '6f1d2c3b-4a59-4e6f-8a7b-1c2d3e4f5a6b', version: 3 }
  assert.match(downloadName('lantern', a), /^lantern-backup-v3-[0-9a-f]{16}\.zip$/)
  assert.equal(downloadName('lantern', a), downloadName('lantern', { ...a }))
  const names = new Set()
  for (let i = 0; i < 1000; i++) names.add(downloadName('lantern', { id: crypto.randomUUID(), version: 3 }))
  assert.equal(names.size, 1000)
})

// ── the doors, against a scripted host and store ─────────────────────────────────────────────

/**
 * One fetch for both sides: tracy-host (`/_host/site`, `/_host/jobs/<id>`) answering each job kind
 * from `answers[kind]`, with `states[kind]` overriding the poll's state; and the artifact store,
 * whose objects are `objects` (key → size): HEAD answers the size, DELETE removes it — except the
 * first `failDeletes` DELETEs, and every DELETE of a key in `refuse`, which answer 500 and remove nothing.
 * `beforeDelete`, when given, is awaited before each DELETE answers (to line up a race).
 */
function fakeWorld({
  answers = {},
  states = {},
  objects = new Map(),
  failDeletes = 0,
  refuse = new Set(),
  beforeDelete = async () => {},
  // A host's own validator: a body it refuses gets its 400 `{code: 'BAD_REQUEST', why}`.
  validate = () => null
} = {}) {
  const calls = []
  const storeCalls = []
  let n = 0
  const jobs = new Map()
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(String(input))
    if (u.origin === 'https://store.test') {
      const key = decodeURIComponent(u.pathname.replace('/tracy-artifacts/', ''))
      storeCalls.push({ method: init.method ?? 'GET', key })
      if (init.method === 'HEAD') {
        if (!objects.has(key)) return new Response(null, { status: 404 })
        return new Response(null, { status: 200, headers: { 'content-length': String(objects.get(key)) } })
      }
      if (init.method === 'DELETE') {
        await beforeDelete(key)
        if (refuse.has(key) || failDeletes > 0) {
          if (!refuse.has(key)) failDeletes--
          return new Response(null, { status: 500 })
        }
        objects.delete(key)
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 400 })
    }
    if (u.pathname === '/_host/site') {
      const body = JSON.parse(init.body)
      calls.push(body)
      const why = validate(body)
      if (why) return new Response(JSON.stringify({ code: 'BAD_REQUEST', why }), { status: 400 })
      const id = `job-${++n}`
      jobs.set(id, { kind: body.kind, input: body, polls: 0 })
      return new Response(JSON.stringify({ jobId: id }), { status: 200 })
    }
    const id = u.pathname.replace('/_host/jobs/', '')
    const job = jobs.get(id)
    if (!job) return new Response(null, { status: 404 })
    job.polls++
    const state = states[job.kind]?.(job) ?? 'done'
    if (state === 'running' || state === 'uploading')
      return new Response(
        JSON.stringify({
          state: 'running',
          step: state === 'uploading' ? 'webroot-export:uploading' : job.kind
        }),
        { status: 200 }
      )
    if (state === 'failed')
      return new Response(JSON.stringify({ state: 'failed', output: 'boom' }), { status: 200 })
    const answer = answers[job.kind]
    const out = typeof answer === 'function' ? answer(job.input) : (answer ?? { ok: true })
    return new Response(JSON.stringify({ state: 'done', output: JSON.stringify(out) }), { status: 200 })
  }
  return { fetchImpl, calls, storeCalls, objects, jobs }
}

/**
 * The host's export answer, with the object landing in the store under the key it was signed for —
 * ONCE per address, as one PUT does: every later poll of the same job only reads the answer again
 * (a poll after the object was deleted must not put it back).
 */
const uploads = (objects, answer = EXPORTED) => {
  const put = new Set()
  return (input) => {
    if (!put.has(input.uploadUrl)) {
      put.add(input.uploadUrl)
      objects.set(
        decodeURIComponent(new URL(input.uploadUrl).pathname.replace('/tracy-artifacts/', '')),
        answer.bytes
      )
    }
    return answer
  }
}

function harness(pool, fetchImpl, now = () => Date.now(), over = {}, { refuseMail = () => false } = {}) {
  const config = readConfig({ ...env, ...over })
  const mailedCodes = []
  const app = buildApp({
    config,
    pool,
    mail: {
      send: async (message) => {
        if (refuseMail(message)) throw new Error('the mail server refused')
        mailedCodes.push(message)
      },
      signInCodeMail: (code) => ({ subject: 'Sign-in code', text: code }),
      available: true
    },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl,
    now
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    )
  const exports = createBackupExports({ pool, config, host: { hostCall, hostJob }, fetchImpl, now })
  return { cookieFor, send, exports, config, mailedCodes }
}

async function seat(pool, email, role, siteKey = SITE) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, rows[0].id, role]
  )
}

async function site(pool, siteKey = SITE, label = 'lantern', platform = 'wordpress') {
  await pool.query(`insert into site (site_key, label, host, platform) values ($1, $2, 'local', $3)`, [
    siteKey,
    label,
    platform
  ])
  await seat(pool, 'owner@x.y', 'owner', siteKey)
}

/** Ask the status door until the export leaves flight (the job finishes in the background). */
async function settled(send, cookie, exportId, version = 3, siteKey = SITE) {
  for (let i = 0; i < 100; i++) {
    const res = await send('GET', `/api/sites/${siteKey}/backups/${version}/export/${exportId}`, cookie)
    const body = await res.json()
    if (!['queued', 'packing', 'uploading'].includes(body.state)) return { status: res.status, body }
    await new Promise((r) => setTimeout(r, 30))
  }
  throw new Error('the export never settled')
}

const audits = async (pool) =>
  (
    await pool.query(
      `select detail->>'event' as event from audit where action = 'site.backup.export' order by at, id`
    )
  ).rows.map((r) => r.event)

test(
  'export: an Owner gets 202 at once, the host packs and uploads, and the status door hands a fresh download link',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    // The answer names the key it was signed for: the store keeps what the host PUT.
    const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const res = await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)
    assert.equal(res.status, 202)
    const started = await res.json()
    assert.equal(started.state, 'queued')
    assert.match(started.exportId, /^[0-9a-f-]{36}$/)

    const done = await settled(h.send, owner, started.exportId)
    assert.equal(done.status, 200)
    assert.equal(done.body.state, 'ready')
    assert.equal(done.body.bytes, ZIP_BYTES)
    assert.equal(done.body.sha256, ZIP_SHA)
    assert.equal(done.body.url, undefined, 'status never issues a download link')
    const codeRes = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/${started.exportId}/code`,
      owner
    )
    assert.equal(codeRes.status, 202)
    const { challengeId } = await codeRes.json()
    assert.equal(h.mailedCodes.length, 1)
    const code = h.mailedCodes[0].text.match(/\n([0-9]{6})\n/)?.[1]
    assert.ok(code, 'email contains a six-digit code')
    const missing = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/${started.exportId}/download`,
      owner,
      { challengeId }
    )
    assert.equal(missing.status, 400)
    const wrong = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/${started.exportId}/download`,
      owner,
      { challengeId, code: '000000' }
    )
    assert.equal(wrong.status, 401)
    assert.equal((await wrong.json()).code, 'DOWNLOAD_CODE_INVALID')
    const issued = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/${started.exportId}/download`,
      owner,
      { challengeId, code }
    )
    const issuedBody = await issued.json()
    assert.equal(issued.status, 200, JSON.stringify(issuedBody))
    const link = new URL(issuedBody.url)
    const disposition = link.searchParams.get('response-content-disposition')
    assert.match(disposition, /^attachment; filename="lantern-backup-v3-[0-9a-f]{16}\.zip"$/)
    assert.equal(link.searchParams.get('X-Amz-Expires'), '300')
    // A second download of the same export: a fresh link, the same unguessable name.
    const again2 = await download(h, owner, started.exportId)
    assert.equal(again2.status, 200)
    assert.equal(
      new URL((await again2.json()).url).searchParams.get('response-content-disposition'),
      disposition
    )
    assert.ok(Date.parse(done.body.expiresAt) > Date.now() + 23 * 3600_000)

    // The host was asked once, with an address under the export namespace and the ceiling.
    const asked = w.calls.filter((c) => c.kind === 'webroot-export')
    assert.equal(asked.length, 1)
    assert.equal(asked[0].version, 3)
    assert.equal(asked[0].maxBytes, 1024 ** 3)
    assert.equal(asked[0].includeLarge, false)
    assert.match(
      new URL(asked[0].uploadUrl).pathname,
      /^\/tracy-artifacts\/backup-exports\/lantern\/[0-9a-f-]{36}\.zip$/
    )
    // Status reads do not issue additional links.
    const again = await (
      await h.send('GET', `/api/sites/${SITE}/backups/3/export/${started.exportId}`, owner)
    ).json()
    assert.equal(again.url, undefined)
    assert.deepEqual(await audits(pool), ['requested', 'ready', 'link-issued', 'link-issued'])
    // Nothing anyone can read back keeps the upload address.
    const { rows } = await pool.query(`select * from backup_export`)
    assert.ok(!JSON.stringify(rows).includes('X-Amz-Signature'))
    const jobRows = await pool.query(`select detail from job`)
    assert.ok(!JSON.stringify(jobRows.rows).includes('X-Amz-Signature'))
  }
)

/** Ask for a download code and spend it: the link, as the dialog gets it. */
async function download(h, cookie, exportId, version = 3) {
  const codeRes = await h.send(
    'POST',
    `/api/sites/${SITE}/backups/${version}/export/${exportId}/code`,
    cookie
  )
  assert.equal(codeRes.status, 202)
  const { challengeId } = await codeRes.json()
  const code = h.mailedCodes
    .findLast((m) => !m.subject.startsWith('Install code for '))
    ?.text.match(/\n([0-9]{6})\n/)?.[1]
  assert.ok(code, 'a download code was mailed')
  return h.send('POST', `/api/sites/${SITE}/backups/${version}/export/${exportId}/download`, cookie, {
    challengeId,
    code
  })
}

/** The host's export job input, once the background job has filed it. */
async function exportJob(w) {
  for (let i = 0; i < 200; i++) {
    const found = w.calls.find((c) => c.kind === 'webroot-export')
    if (found) return found
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('the host was never asked')
}

const installMails = (h) => h.mailedCodes.filter((m) => m.subject.startsWith('Install code for '))

test(
  'install code: made per WordPress export, sent to the host only in the job input, kept sealed, shown to the Owner once ready',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    const asked = await exportJob(w)
    assert.match(asked.installCode, /^[0-9]{6}$/, 'the host is given six digits')
    const code = asked.installCode
    // In flight: no code to show yet.
    const early = await (
      await h.send('GET', `/api/sites/${SITE}/backups/3/export/${a.exportId}`, owner)
    ).json()
    if (['queued', 'packing', 'uploading'].includes(early.state)) assert.equal(early.installCode, undefined)
    const done = await settled(h.send, owner, a.exportId)
    assert.equal(done.body.state, 'ready')
    assert.equal(done.body.installCode, code, 'the status door shows it once ready')
    assert.equal(done.body.downloaded, false)
    const latest = await h.send('GET', `/api/sites/${SITE}/export/latest`, owner)
    assert.equal(latest.status, 200)
    assert.equal(latest.headers.get('cache-control'), 'no-store')
    const shown = (await latest.json()).export
    assert.equal(shown.exportId, a.exportId)
    assert.equal(shown.installCode, code)
    // Nothing anyone can read back holds it in the clear: not the row, not the job, not the audit.
    const { rows } = await pool.query(`select * from backup_export`)
    assert.match(rows[0].install_code_sealed, /^v1\./)
    for (const table of ['backup_export', 'job', 'audit'])
      assert.ok(
        !JSON.stringify((await pool.query(`select * from ${table}`)).rows).includes(code),
        `${table} does not hold the code`
      )
  }
)

test(
  'install code: a host still on the old tracy-host refuses the code; the export is retried once without it and has none',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    // The old validator: any key it does not know is refused by name.
    const w = fakeWorld({
      answers: { 'webroot-export': uploads(objects) },
      objects,
      validate: (body) => ('installCode' in body ? 'refused installCode' : null)
    })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const res = await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)
    assert.equal(res.status, 202)
    const a = await res.json()
    const done = await settled(h.send, owner, a.exportId)
    assert.equal(done.body.state, 'ready', 'the export still works')
    const asked = w.calls.filter((c) => c.kind === 'webroot-export')
    assert.equal(asked.length, 2, 'asked twice: with the code, then without it')
    assert.match(asked[0].installCode, /^[0-9]{6}$/)
    assert.equal(asked[1].installCode, undefined)
    assert.equal(asked[1].uploadUrl, asked[0].uploadUrl, 'the same job')
    assert.equal(done.body.installCode, undefined, 'the dialog shows no code')
    assert.equal(
      (await pool.query(`select install_code_sealed from backup_export`)).rows[0].install_code_sealed,
      null
    )
    const latest = (await (await h.send('GET', `/api/sites/${SITE}/export/latest`, owner)).json()).export
    assert.equal(latest.installCode, undefined)
    assert.equal((await download(h, owner, a.exportId)).status, 200)
    assert.equal(installMails(h).length, 0, 'and no mail names a code')
    assert.deepEqual(await audits(pool), ['requested', 'ready', 'link-issued'])
  }
)

test(
  'install code: any other refusal of the host is not retried, the export fails as before',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    const w = fakeWorld({
      answers: { 'webroot-export': uploads(objects) },
      objects,
      // A refusal that names another key, or names the code inside a longer reason: not the old host.
      validate: () => 'refused uploadUrl'
    })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    const done = await settled(h.send, owner, a.exportId)
    assert.equal(done.body.state, 'failed')
    assert.equal(done.body.error, 'BAD_REQUEST: refused uploadUrl')
    assert.equal(w.calls.filter((c) => c.kind === 'webroot-export').length, 1, 'asked once')
    assert.match(
      (await pool.query(`select install_code_sealed from backup_export`)).rows[0].install_code_sealed,
      /^v1\./
    )
    // Terminal state is visible before the background cleanup writes its final audit.
    let deleted = false
    for (let i = 0; i < 100; i++) {
      const { rows } = await pool.query(
        "select 1 from audit where action = 'site.backup.export' and detail->>'event' = 'deleted' and detail->>'exportId' = $1 limit 1",
        [a.exportId]
      )
      if (rows.length) {
        deleted = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    assert.equal(
      deleted,
      true,
      'the failed export cleanup audit completes before the shared fixture is reset'
    )
  }
)

test('install code: an editor and a viewer cannot read it; the latest door is Owner-only', opts, async () => {
  const { pool } = db
  await site(pool)
  await seat(pool, 'editor@x.y', 'editor')
  await seat(pool, 'viewer@x.y', 'viewer')
  const objects = new Map()
  const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
  const h = harness(pool, w.fetchImpl)
  const owner = await h.cookieFor('owner@x.y')
  const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
  await settled(h.send, owner, a.exportId)
  for (const who of ['editor@x.y', 'viewer@x.y']) {
    const cookie = await h.cookieFor(who)
    const latest = await h.send('GET', `/api/sites/${SITE}/export/latest`, cookie)
    assert.equal(latest.status, 403, who)
    assert.equal((await latest.json()).code, 'FORBIDDEN_EXPORT')
    const status = await h.send('GET', `/api/sites/${SITE}/backups/3/export/${a.exportId}`, cookie)
    assert.equal(status.status, 403, who)
  }
  const nobody = await h.send('GET', `/api/sites/${SITE}/export/latest`)
  assert.equal(nobody.status, 401)
})

test('install code: none for EmDash, which has no installer', opts, async () => {
  const { pool } = db
  await site(pool, SITE, 'lantern', 'emdash')
  const objects = new Map()
  const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
  const h = harness(pool, w.fetchImpl)
  const owner = await h.cookieFor('owner@x.y')
  const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
  assert.equal((await exportJob(w)).installCode, undefined)
  const done = await settled(h.send, owner, a.exportId)
  assert.equal(done.body.installCode, undefined)
  assert.equal(
    (await pool.query(`select install_code_sealed from backup_export`)).rows[0].install_code_sealed,
    null
  )
  const issued = await download(h, owner, a.exportId)
  assert.equal(issued.status, 200)
  assert.equal(installMails(h).length, 0, 'no install code mail')
})

test(
  'install code: mailed once after the first download, shown again after the package expires, and only for a downloaded one',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    let clock = Date.now()
    const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
    const h = harness(pool, w.fetchImpl, () => clock)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    const code = (await exportJob(w)).installCode
    await settled(h.send, owner, a.exportId)
    assert.equal(installMails(h).length, 0, 'nothing is mailed before a download')
    assert.equal((await download(h, owner, a.exportId)).status, 200)
    const mails = installMails(h)
    assert.equal(mails.length, 1)
    assert.equal(mails[0].to, 'owner@x.y')
    assert.equal(mails[0].subject, 'Install code for lantern')
    assert.ok(!mails[0].subject.includes(code), 'the code is not in the subject')
    assert.match(mails[0].text, new RegExp(`Install code: ${code}`))
    assert.match(mails[0].text, /My Sites, the … menu of the site, Export site as ZIP/)
    assert.match(mails[0].html, new RegExp(`>${code}<`))
    assert.equal((await download(h, owner, a.exportId)).status, 200)
    assert.equal(installMails(h).length, 1, 'a second download mails nothing more')
    // A day later the package is gone, but the customer may install now: the dialog still shows it.
    clock += 25 * 3600_000
    await h.exports.sweepExpired()
    const latest = (await (await h.send('GET', `/api/sites/${SITE}/export/latest`, owner)).json()).export
    assert.equal(latest.state, 'expired')
    assert.equal(latest.downloaded, true)
    assert.equal(latest.installCode, code)
    // A package that expired without being downloaded is not offered.
    const b = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    await settled(h.send, owner, b.exportId)
    clock += 25 * 3600_000
    await h.exports.sweepExpired()
    const after = (await (await h.send('GET', `/api/sites/${SITE}/export/latest`, owner)).json()).export
    assert.equal(after.exportId, a.exportId, 'the downloaded one, not the newer unused one')
  }
)

test(
  'install code: a mail that fails does not fail the download, and the next download sends it',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    let refuse = true
    const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
    const h = harness(
      pool,
      w.fetchImpl,
      undefined,
      {},
      {
        refuseMail: (m) => refuse && m.subject.startsWith('Install code for ')
      }
    )
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    await settled(h.send, owner, a.exportId)
    assert.equal((await download(h, owner, a.exportId)).status, 200)
    assert.equal(installMails(h).length, 0)
    assert.equal(
      (await pool.query(`select install_code_mailed_at from backup_export`)).rows[0].install_code_mailed_at,
      null
    )
    refuse = false
    assert.equal((await download(h, owner, a.exportId)).status, 200)
    assert.equal(installMails(h).length, 1)
  }
)

test('export: an editor and a viewer are refused, on both doors; the host is never asked', opts, async () => {
  const { pool } = db
  await site(pool)
  await seat(pool, 'editor@x.y', 'editor')
  await seat(pool, 'viewer@x.y', 'viewer')
  const w = fakeWorld({ answers: {} })
  const h = harness(pool, w.fetchImpl)
  for (const who of ['editor@x.y', 'viewer@x.y']) {
    const res = await h.send('POST', `/api/sites/${SITE}/backups/3/export`, await h.cookieFor(who))
    assert.equal(res.status, 403, who)
    assert.equal((await res.json()).code, 'FORBIDDEN_EXPORT')
    const look = await h.send(
      'GET',
      `/api/sites/${SITE}/backups/3/export/6f1c2d4e-0000-4000-8000-000000000001`,
      await h.cookieFor(who)
    )
    assert.equal(look.status, 403, who)
    const code = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/6f1c2d4e-0000-4000-8000-000000000001/code`,
      await h.cookieFor(who)
    )
    assert.equal(code.status, 403, who)
    const download = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/6f1c2d4e-0000-4000-8000-000000000001/download`,
      await h.cookieFor(who),
      { challengeId: '6f1c2d4e-0000-4000-8000-000000000001', code: '123456' }
    )
    assert.equal(download.status, 403, who)
  }
  assert.equal(w.calls.length, 0)
})

test('export: a code older than ten minutes cannot issue a download link', opts, async () => {
  const { pool } = db
  await site(pool)
  let clock = Date.UTC(2026, 9, 16, 12)
  const objects = new Map()
  const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
  const h = harness(pool, w.fetchImpl, () => clock)
  const owner = await h.cookieFor('owner@x.y')
  const started = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
  const ready = await settled(h.send, owner, started.exportId)
  assert.equal(ready.body.state, 'ready')
  const codeResponse = await h.send(
    'POST',
    `/api/sites/${SITE}/backups/3/export/${started.exportId}/code`,
    owner
  )
  const { challengeId } = await codeResponse.json()
  clock += 10 * 60_000 + 1
  const refused = await h.send(
    'POST',
    `/api/sites/${SITE}/backups/3/export/${started.exportId}/download`,
    owner,
    {
      challengeId,
      code: h.mailedCodes[0].text.match(/\n([0-9]{6})\n/)?.[1]
    }
  )
  assert.equal(refused.status, 401)
  assert.equal((await refused.json()).code, 'DOWNLOAD_CODE_EXPIRED')
})

test('export: too many wrong code attempts have their own refusal code', opts, async () => {
  const { pool } = db
  await site(pool)
  const objects = new Map()
  const w = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
  const h = harness(pool, w.fetchImpl)
  const owner = await h.cookieFor('owner@x.y')
  const started = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
  await settled(h.send, owner, started.exportId)
  const sent = await h.send('POST', `/api/sites/${SITE}/backups/3/export/${started.exportId}/code`, owner)
  const { challengeId } = await sent.json()
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/${started.exportId}/download`,
      owner,
      { challengeId, code: '000000' }
    )
    assert.equal((await response.json()).code, 'DOWNLOAD_CODE_INVALID')
  }
  const refused = await h.send(
    'POST',
    `/api/sites/${SITE}/backups/3/export/${started.exportId}/download`,
    owner,
    { challengeId, code: '000000' }
  )
  assert.equal(refused.status, 401)
  assert.equal((await refused.json()).code, 'DOWNLOAD_CODE_TOO_MANY_ATTEMPTS')
})

test(
  'export: a fresh backup can be packed with the same-lock large-file snapshot enabled',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    const w = fakeWorld({
      answers: {
        'webroot-backup': { ok: true, version: 4, title: 'Site export', fleetSha: '4'.repeat(40) },
        'webroot-export': uploads(objects)
      },
      objects
    })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const backup = await h.send('POST', `/api/sites/${SITE}/backup`, owner, {
      title: 'Site export',
      includeLarge: true
    })
    assert.equal(backup.status, 200)
    assert.equal((await backup.json()).version, 4)
    assert.equal(w.calls.find((call) => call.kind === 'webroot-backup')?.includeLarge, true)
    const exportResponse = await h.send('POST', `/api/sites/${SITE}/backups/4/export`, owner, {
      includeLarge: true
    })
    assert.equal(exportResponse.status, 202)
    for (let i = 0; i < 20 && w.calls.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    const exportJob = w.calls.find((call) => call.kind === 'webroot-export')
    assert.equal(exportJob?.version, 4)
    assert.equal(exportJob?.includeLarge, true)
    const started = await exportResponse.json()
    const ready = await settled(h.send, owner, started.exportId, 4)
    assert.equal(ready.body.state, 'ready')
    const link = await h.send('GET', `/api/sites/${SITE}/backups/4/export/${started.exportId}`, owner)
    assert.equal((await link.json()).url, undefined)
  }
)

test(
  'export: a second request while one is in flight is 409; an EmDash site and a bad version are refused up front',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const w = fakeWorld({ states: { 'webroot-export': () => 'running' } })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    assert.equal((await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).status, 202)
    const second = await h.send('POST', `/api/sites/${SITE}/backups/2/export`, owner)
    assert.equal(second.status, 409)
    assert.equal((await second.json()).code, 'EXPORT_IN_PROGRESS')
    assert.equal((await h.send('POST', `/api/sites/${SITE}/backups/0/export`, owner)).status, 400)
    assert.equal((await h.send('POST', `/api/sites/${SITE}/backups/x/export`, owner)).status, 400)

    await site(pool, 'ember.localhost', 'ember', 'emdash')
    const em = await h.send('POST', `/api/sites/ember.localhost/backups/1/export`, owner, {
      includeLarge: true
    })
    assert.equal(em.status, 202)
    for (let i = 0; i < 20 && w.calls.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(w.calls.at(-1).includeLarge, true)
  }
)

test('export: past ten requests in an hour, or two in flight, an account is told 429', opts, async () => {
  const { pool } = db
  const w = fakeWorld({ states: { 'webroot-export': () => 'running' } })
  const h = harness(pool, w.fetchImpl)
  // Three sites, one owner: two exports may run at once, the third waits.
  for (const [key, label] of [
    [SITE, 'lantern'],
    ['b.localhost', 'b'],
    ['c.localhost', 'c']
  ])
    await site(pool, key, label)
  const owner = await h.cookieFor('owner@x.y')
  assert.equal((await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).status, 202)
  assert.equal((await h.send('POST', `/api/sites/b.localhost/backups/3/export`, owner)).status, 202)
  const third = await h.send('POST', `/api/sites/c.localhost/backups/3/export`, owner)
  assert.equal(third.status, 429)
  assert.equal((await third.json()).code, 'EXPORT_LIMIT_IN_FLIGHT')

  // Ten in the last hour, all ended: the eleventh is refused.
  await pool.query(`update backup_export set state = 'failed'`)
  const { rows } = await pool.query(`select id from account where email = 'owner@x.y'`)
  for (let i = 0; i < 8; i++)
    await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key)
       values (gen_random_uuid(), 'c.localhost', 1, $1, 'owner@x.y', 'failed', 'k')`,
      [rows[0].id]
    )
  const eleventh = await h.send('POST', `/api/sites/c.localhost/backups/3/export`, owner)
  assert.equal(eleventh.status, 429)
  assert.equal((await eleventh.json()).code, 'EXPORT_RATE_LIMITED')
})

test(
  'export: a host that refuses the point, or an upload the store does not hold, ends failed with no link',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const refused = fakeWorld({
      answers: { 'webroot-export': { ok: false, code: 'BACKUP_NOT_FULL', error: 'no verified database' } }
    })
    const h = harness(pool, refused.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    const end = await settled(h.send, owner, a.exportId)
    assert.equal(end.body.state, 'failed')
    assert.equal(end.body.error, 'BACKUP_NOT_FULL')
    assert.equal(end.body.url, undefined)

    // The host says it uploaded, but the store holds nothing under the key: not ready.
    const lost = fakeWorld({ answers: { 'webroot-export': EXPORTED } })
    const h2 = harness(pool, lost.fetchImpl)
    const b = await (await h2.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    const end2 = await settled(h2.send, owner, b.exportId)
    assert.equal(end2.body.state, 'failed')
    assert.equal(end2.body.error, 'UPLOAD_NOT_FOUND')
    // Each failure deletes whatever the host may have put there; the store answering "nothing" counts.
    assert.deepEqual(await audits(pool), ['requested', 'failed', 'deleted', 'requested', 'failed', 'deleted'])
  }
)

/** The row of one export, read once its object has been dealt with or after `ms`. */
async function cleaned(pool, exportId, ms = 3000) {
  for (let i = 0; i < ms / 30; i++) {
    const { rows } = await pool.query(`select * from backup_export where id = $1`, [exportId])
    if (rows[0]?.object_deleted_at) return rows[0]
    await new Promise((r) => setTimeout(r, 30))
  }
  return (await pool.query(`select * from backup_export where id = $1`, [exportId])).rows[0]
}

/** The host answers EXPORTED but PUTs a different size: the store holds an object, the row fails. */
const shortUpload = (objects) => (input) => {
  objects.set(
    decodeURIComponent(new URL(input.uploadUrl).pathname.replace('/tracy-artifacts/', '')),
    ZIP_BYTES - 1
  )
  return EXPORTED
}

test(
  "export: an upload whose size differs from the host's word fails, and its object is deleted from the store",
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    const w = fakeWorld({ answers: { 'webroot-export': shortUpload(objects) }, objects })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    const end = await settled(h.send, owner, a.exportId)
    assert.equal(end.body.state, 'failed')
    assert.equal(end.body.error, 'UPLOAD_NOT_FOUND')
    const row = await cleaned(pool, a.exportId)
    assert.ok(row.object_deleted_at, 'the row records the object as deleted')
    assert.equal(objects.size, 0, 'nothing is left in the store')
    assert.deepEqual(await audits(pool), ['requested', 'failed', 'deleted'])
    // Done once: the sweep finds nothing more to delete.
    assert.equal((await h.exports.sweepExpired()).deleted, 0)
  }
)

test(
  'export: a failed export whose object the store would not delete is retried by the next sweep',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    const w = fakeWorld({ answers: { 'webroot-export': shortUpload(objects) }, objects, failDeletes: 1 })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    assert.equal((await settled(h.send, owner, a.exportId)).body.state, 'failed')
    // Wait for the one refused DELETE, made when the row failed.
    for (let i = 0; i < 100 && !w.storeCalls.some((c) => c.method === 'DELETE'); i++)
      await new Promise((r) => setTimeout(r, 30))
    const before = await cleaned(pool, a.exportId, 300)
    assert.equal(before.object_deleted_at, null)
    assert.equal(objects.size, 1, 'the store still holds the object')

    assert.equal((await h.exports.sweepExpired()).deleted, 1)
    assert.equal(objects.size, 0)
    assert.ok((await cleaned(pool, a.exportId)).object_deleted_at)
    assert.equal((await h.exports.sweepExpired()).deleted, 0, 'and only once')
    assert.deepEqual(await audits(pool), ['requested', 'failed', 'deleted'])
  }
)

test(
  'export: a failed export whose object was never deleted goes with its site (forgetSite)',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    const w = fakeWorld({ answers: { 'webroot-export': shortUpload(objects) }, objects, failDeletes: 1 })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    assert.equal((await settled(h.send, owner, a.exportId)).body.state, 'failed')
    for (let i = 0; i < 100 && !w.storeCalls.some((c) => c.method === 'DELETE'); i++)
      await new Promise((r) => setTimeout(r, 30))
    assert.equal(objects.size, 1)
    const gone = await h.exports.forgetSite(SITE)
    assert.deepEqual(gone, { removed: 1, kept: [] })
    assert.equal(objects.size, 0)
  }
)

test(
  'export: failed objects the store keeps refusing do not starve a newer failed export out of the sweep',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const { rows } = await pool.query(`select id from account where email = 'owner@x.y'`)
    // 201 old failed rows whose DELETE the store always refuses: more than one sweep's batch of 200.
    const { rows: stale } = await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key, created_at)
       select gen_random_uuid(), $1, 1, $2, 'owner@x.y', 'failed', 'backup-exports/lantern/stale-' || i || '.zip',
              now() - interval '2 days' + i * interval '1 second'
         from generate_series(1, 201) as i
       returning key`,
      [SITE, rows[0].id]
    )
    const fresh = 'backup-exports/lantern/6f1c2d4e-0000-4000-8000-000000000003.zip'
    await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key)
       values ('6f1c2d4e-0000-4000-8000-000000000003', $1, 3, $2, 'owner@x.y', 'failed', $3)`,
      [SITE, rows[0].id, fresh]
    )
    const objects = new Map([...stale.map((r) => [r.key, ZIP_BYTES]), [fresh, ZIP_BYTES]])
    const w = fakeWorld({ objects, refuse: new Set(stale.map((r) => r.key)) })
    const h = harness(pool, w.fetchImpl)

    // The first sweep spends its batch on the 200 oldest; the second reaches the rows not yet tried.
    assert.equal((await h.exports.sweepExpired()).deleted, 0)
    assert.equal((await h.exports.sweepExpired()).deleted, 1)
    assert.equal(objects.has(fresh), false, 'the newer failed object is deleted')
    assert.equal(objects.size, 201, 'the refused ones stay, to be tried again')
    const tried = await pool.query(
      `select count(*)::int as n from backup_export where object_delete_tried_at is not null`
    )
    assert.equal(tried.rows[0].n, 201, 'every refused row was tried once')
  }
)

test(
  'export: a site delete racing the sweep on one failed object audits its deletion once',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    // Once armed, the next DELETE (the site delete's) waits until the sweep has run.
    let hold = null
    const w = fakeWorld({
      answers: { 'webroot-export': shortUpload(objects) },
      objects,
      failDeletes: 1,
      beforeDelete: async () => {
        const wait = hold
        hold = null
        if (wait) await wait.promise
      }
    })
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    assert.equal((await settled(h.send, owner, a.exportId)).body.state, 'failed')
    let cleanupFinished = false
    for (let i = 0; i < 100; i++) {
      const { rows } = await pool.query('select object_delete_tried_at from backup_export where id = $1', [
        a.exportId
      ])
      if (rows[0]?.object_delete_tried_at) {
        cleanupFinished = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    assert.equal(
      cleanupFinished,
      true,
      'the first failed DELETE completed before the site-delete race starts'
    )
    assert.equal(objects.size, 1)

    // forgetSite reads the row (object not yet deleted) and is held at the store; the sweep then
    // deletes and marks it; forgetSite resumes with the row it read.
    const gate = Promise.withResolvers()
    hold = gate
    const forgetting = h.exports.forgetSite(SITE)
    for (let i = 0; i < 100 && hold; i++) await new Promise((r) => setTimeout(r, 10))
    assert.equal(hold, null, "the site delete's DELETE is held")
    assert.equal((await h.exports.sweepExpired()).deleted, 1)
    gate.resolve()
    const gone = await forgetting
    assert.equal(objects.size, 0)
    assert.equal(gone.removed, 0, 'the sweep claimed the deletion first')
    assert.deepEqual(await audits(pool), ['requested', 'failed', 'deleted'])
    // Called again on an already-forgotten site: nothing more is audited.
    assert.deepEqual(await h.exports.forgetSite(SITE), { removed: 0, kept: [] })
    assert.deepEqual(await audits(pool), ['requested', 'failed', 'deleted'])
  }
)

test(
  'export: past its 24 hours a ready export issues no link, and the sweep deletes the object',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    let clock = Date.now()
    const objects = new Map()
    const world = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
    const h = harness(pool, world.fetchImpl, () => clock)
    const owner = await h.cookieFor('owner@x.y')
    const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
    assert.equal((await settled(h.send, owner, a.exportId)).body.state, 'ready')
    assert.equal(world.objects.size, 1)

    clock += 24 * 3600_000 + 1000
    const late = await (
      await h.send('GET', `/api/sites/${SITE}/backups/3/export/${a.exportId}`, owner)
    ).json()
    assert.equal(late.state, 'expired')
    assert.equal(late.url, undefined)

    const swept = await h.exports.sweepExpired()
    assert.equal(swept.deleted, 1)
    assert.equal(world.objects.size, 0, 'the object is gone from the store')
    const { rows } = await pool.query(`select state from backup_export where id = $1`, [a.exportId])
    assert.equal(rows[0].state, 'expired')
    assert.ok((await audits(pool)).includes('deleted'))
  }
)

test(
  'export: ready rows whose object is already deleted are settled by the sweep and do not block due rows behind them',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const { rows } = await pool.query(`select id from account where email = 'owner@x.y'`)
    // 200 rows a half-done site delete left behind: ready, past their day, object already deleted
    // and audited. They expired before the normal row, so they head the sweep's batch.
    await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key,
                                  ready_at, expires_at, object_deleted_at)
       select gen_random_uuid(), $1, 1, $2, 'owner@x.y', 'ready', 'backup-exports/lantern/gone-' || i || '.zip',
              now() - interval '3 days', now() - interval '2 days' + i * interval '1 second', now() - interval '1 day'
         from generate_series(1, 200) as i`,
      [SITE, rows[0].id]
    )
    const due = 'backup-exports/lantern/6f1c2d4e-0000-4000-8000-000000000004.zip'
    await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key, ready_at, expires_at)
       values ('6f1c2d4e-0000-4000-8000-000000000004', $1, 3, $2, 'owner@x.y', 'ready', $3,
               now() - interval '25 hours', now() - interval '1 hour')`,
      [SITE, rows[0].id, due]
    )
    const objects = new Map([[due, ZIP_BYTES]])
    const w = fakeWorld({ objects })
    const h = harness(pool, w.fetchImpl)

    assert.equal((await h.exports.sweepExpired()).deleted, 1, 'the due row behind them is swept')
    assert.equal(objects.size, 0)
    const left = await pool.query(
      `select state, count(*)::int as n from backup_export group by state order by state`
    )
    assert.deepEqual(left.rows, [{ state: 'expired', n: 201 }], 'the 200 are settled as expired too')
    const deletes = w.storeCalls.filter((c) => c.method === 'DELETE').map((c) => c.key)
    assert.deepEqual(deletes, [due], 'no second DELETE for an object already deleted')
    assert.deepEqual(await audits(pool), ['deleted'], 'and no second audit')
    assert.deepEqual(await h.exports.sweepExpired(), { deleted: 0, ended: 0 })
  }
)

test(
  'export: ready objects the store keeps refusing do not starve a later due export, and a deleted object issues no code',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const { rows } = await pool.query(`select id from account where email = 'owner@x.y'`)
    const { rows: stale } = await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key, ready_at, expires_at)
       select gen_random_uuid(), $1, 1, $2, 'owner@x.y', 'ready', 'backup-exports/lantern/stuck-' || i || '.zip',
              now() - interval '3 days', now() - interval '2 days' + i * interval '1 second'
         from generate_series(1, 200) as i
       returning key`,
      [SITE, rows[0].id]
    )
    const due = 'backup-exports/lantern/6f1c2d4e-0000-4000-8000-000000000005.zip'
    await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key, ready_at, expires_at)
       values ('6f1c2d4e-0000-4000-8000-000000000005', $1, 3, $2, 'owner@x.y', 'ready', $3,
               now() - interval '25 hours', now() - interval '1 hour')`,
      [SITE, rows[0].id, due]
    )
    const objects = new Map([...stale.map((r) => [r.key, ZIP_BYTES]), [due, ZIP_BYTES]])
    const w = fakeWorld({ objects, refuse: new Set(stale.map((r) => r.key)) })
    const h = harness(pool, w.fetchImpl)
    assert.equal((await h.exports.sweepExpired()).deleted, 0)
    assert.equal((await h.exports.sweepExpired()).deleted, 1)
    assert.equal(objects.has(due), false, 'the later due object is deleted')

    // A ready, unexpired row whose object a site delete already removed: no download code for it.
    await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key,
                                  ready_at, expires_at, object_deleted_at)
       values ('6f1c2d4e-0000-4000-8000-000000000006', $1, 3, $2, 'owner@x.y', 'ready',
               'backup-exports/lantern/6f1c2d4e-0000-4000-8000-000000000006.zip', now(), now() + interval '1 day', now())`,
      [SITE, rows[0].id]
    )
    const owner = await h.cookieFor('owner@x.y')
    const code = await h.send(
      'POST',
      `/api/sites/${SITE}/backups/3/export/6f1c2d4e-0000-4000-8000-000000000006/code`,
      owner
    )
    assert.equal(code.status, 409)
    assert.equal((await code.json()).code, 'EXPORT_NOT_READY')
  }
)

test('export: a deleted site takes its exports with it (forgetSite)', opts, async () => {
  const { pool } = db
  await site(pool)
  const objects = new Map()
  const world = fakeWorld({ answers: { 'webroot-export': uploads(objects) }, objects })
  const h = harness(pool, world.fetchImpl)
  const owner = await h.cookieFor('owner@x.y')
  const a = await (await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)).json()
  await settled(h.send, owner, a.exportId)
  assert.equal(world.objects.size, 1)
  const gone = await h.exports.forgetSite(SITE)
  assert.equal(gone.removed, 1)
  assert.equal(world.objects.size, 0)
  assert.equal((await pool.query(`select 1 from backup_export where site_key = $1`, [SITE])).rows.length, 0)
})

test(
  'artifact doors: no key in the export namespace is fetched, put, deleted or finished through them',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const w = fakeWorld()
    const h = harness(pool, w.fetchImpl)
    const owner = await h.cookieFor('owner@x.y')
    for (const key of [
      'backup-exports/lantern/6f1c2d4e-0000-4000-8000-000000000001.zip',
      'sites/lantern/../backup-exports/lantern/x.zip',
      'sites/lantern/../../backup-exports/lantern/x.zip'
    ]) {
      for (const step of ['fetch', 'delete', 'part', 'finish', 'abort']) {
        const res = await h.send('POST', `/api/sites/${SITE}/artifacts/${step}`, owner, {
          key,
          uploadId: 'u',
          partNumber: 1,
          parts: [{ PartNumber: 1, ETag: 'e' }]
        })
        assert.equal(res.status, 403, `${step} ${key}`)
        assert.equal((await res.json()).code, 'KEY_NOT_YOURS')
      }
    }
    assert.equal(w.storeCalls.length, 0, 'the store was never asked')
  }
)

test('GET /backups: may.export says whether this seat may download a backup (Owner only)', opts, async () => {
  const { pool } = db
  await site(pool)
  await seat(pool, 'editor@x.y', 'editor')
  const w = fakeWorld({ answers: { 'webroot-history': { ok: true, rows: [], latest: null } } })
  const h = harness(pool, w.fetchImpl)
  const may = async (who) =>
    (await (await h.send('GET', `/api/sites/${SITE}/backups`, await h.cookieFor(who))).json()).may
  assert.equal((await may('owner@x.y')).export, true)
  assert.equal((await may('editor@x.y')).export, false)
})

test(
  'BACKUP_EXPORT off: both doors answer 404 EXPORT_OFF before anything is filed, /backups says may.export false, the sweep still runs',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const objects = new Map()
    const w = fakeWorld({
      answers: {
        'webroot-export': uploads(objects),
        'webroot-history': { ok: true, rows: [], latest: null }
      },
      objects
    })
    const h = harness(pool, w.fetchImpl, () => Date.now(), { BACKUP_EXPORT: 'off' })
    const owner = await h.cookieFor('owner@x.y')
    const post = await h.send('POST', `/api/sites/${SITE}/backups/3/export`, owner)
    assert.equal(post.status, 404)
    assert.deepEqual(await post.json(), { code: 'EXPORT_OFF' })
    const look = await h.send(
      'GET',
      `/api/sites/${SITE}/backups/3/export/6f1c2d4e-0000-4000-8000-000000000001`,
      owner
    )
    assert.equal(look.status, 404)
    assert.deepEqual(await look.json(), { code: 'EXPORT_OFF' })
    assert.equal(w.calls.filter((c) => c.kind === 'webroot-export').length, 0, 'the host was never asked')
    assert.equal((await pool.query('select count(*)::int as n from backup_export')).rows[0].n, 0)
    const may = (await (await h.send('GET', `/api/sites/${SITE}/backups`, owner)).json()).may
    assert.equal(may.export, false, 'an owner is not offered a door that is off')

    // A package made while the doors were on is still deleted after its day.
    const { rows } = await pool.query(`select id from account where email = 'owner@x.y'`)
    const key = 'backup-exports/lantern/6f1c2d4e-0000-4000-8000-000000000002.zip'
    objects.set(key, ZIP_BYTES)
    await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, state, key, ready_at, expires_at)
     values ('6f1c2d4e-0000-4000-8000-000000000002', $1, 3, $2, 'owner@x.y', 'ready', $3, now() - interval '25 hours', now() - interval '1 hour')`,
      [SITE, rows[0].id, key]
    )
    assert.equal((await h.exports.sweepExpired()).deleted, 1)
    assert.equal(objects.size, 0)
  }
)
