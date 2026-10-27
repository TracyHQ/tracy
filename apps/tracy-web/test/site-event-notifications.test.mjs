// Site events as notifications (spec #809, Akemi 04/10/2026, after develop added rename, delete
// and "Restore everything"): a site is named by its CURRENT name in the Inbox and in every email,
// old rows included, and three new cases reach the team through the real doors:
//   T12 team.site_restored  "Restore everything" succeeded   → the team except the presser
//   T13 team.site_deleted   the Owner deleted the site       → every other member, rows survive
//   T14 team.site_renamed   the site address changed         → the team except the person who changed it
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { resetReconcileThrottle } from '../src/sites/operations.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'
import { answerTeardown } from './_host-teardown.mjs'

/** Letter HTML as the reader sees it: the invisible joiners that stop autolinks taken out. */
const visible = (html) => String(html).replaceAll('&zwnj;', '')

const db = fileDb()
before(db.open)
beforeEach(async () => {
  await db.reset()
  resetReconcileThrottle()
})
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
  SEAT_local_SECRET: 'k'
}

const SITE = 'lantern.localhost'
const sha = (c) => c.repeat(40)
const S3 = sha('3')
const HEAD = sha('9')
const DB3 = 'a'.repeat(64)

/** The host's history with one full backup, v3 "Before the menu change". */
const HISTORY = {
  ok: true,
  head: HEAD,
  latest: { version: 3, sha: S3 },
  rows: [
    {
      kind: 'backup',
      version: 3,
      sha: S3,
      title: 'Before the menu change',
      notes: null,
      at: 1_759_400_000,
      by: { kind: 'agent' },
      files: 2,
      database: { engine: 'mariadb', bytes: 1_880_000, sha256: DB3, ok: true }
    }
  ],
  truncated: false
}
const EVERYTHING_OK = {
  ok: true,
  files: 2,
  head: HEAD,
  database: { restored: true, sha256: DB3 },
  beforeRestore: { version: 7, sha: 'f'.repeat(40), database: { ok: true } }
}
const RESTORE_COMMIT = {
  ok: true,
  sha: HEAD,
  author: 'fleet@tracy.ai',
  subject: `restore: back to ${S3.slice(0, 7)}`,
  files: [],
  total: 2
}

/**
 * A tracy-host and dsh that answer everything these doors ask: site jobs by kind (`answers`), the
 * teardown, the dsh's session and seat calls, and the address probe (it echoes its token back).
 */
function fakeNetwork(answers = {}) {
  const jobs = new Map()
  let n = 0
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    // A site's delete: the host takes the site off itself, and says so.
    const torn = answerTeardown(input, init)
    if (torn) return torn
    if (u.pathname === '/_host/site') {
      const body = JSON.parse(init.body)
      const id = `job-${++n}`
      jobs.set(id, body)
      return new Response(JSON.stringify({ jobId: id }), { status: 200 })
    }
    if (u.pathname.startsWith('/_host/jobs/')) {
      const job = jobs.get(u.pathname.replace('/_host/jobs/', ''))
      if (!job) return new Response(JSON.stringify({ state: 'done' }), { status: 200 })
      const answer = answers[job.kind]
      const out = typeof answer === 'function' ? answer(job) : (answer ?? { ok: true })
      return new Response(JSON.stringify({ state: 'done', output: JSON.stringify(out) }), { status: 200 })
    }
    if (u.pathname === '/_host/teardown') return new Response(JSON.stringify({ ok: true }), { status: 200 })
    if (u.pathname === '/__tracy/address-probe')
      return new Response(new Headers(init?.headers).get('x-tracy-address-probe') ?? '', { status: 200 })
    if (u.host === 'dsh.test' && u.pathname === '/gateway/seat/forget-workspace')
      return new Response(JSON.stringify({ ok: true, archived: [], deleted: true }), { status: 200 })
    if (u.host === 'dsh.test' && u.pathname === '/gateway/seat/archive-sessions')
      return new Response(JSON.stringify({ ok: true, archivedTo: 'x', sessions: 0 }), { status: 200 })
    if (u.host === 'dsh.test' && u.pathname === '/gateway/seat/revoke')
      return new Response(JSON.stringify({ ok: true, revoked: 1 }), { status: 200 })
    return new Response(null, { status: 404 })
  }
  return { fetchImpl }
}

/** One app over the test database with every mail captured, a site, and a team of three. */
async function world(answers) {
  const { pool } = db
  const sent = []
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async (m) => void sent.push(m) },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl: fakeNetwork(answers).fetchImpl
  })
  await pool.query(
    `insert into site (site_key, label, host, platform, address, attached)
     values ($1, 'lantern', 'local', 'wordpress', 'http://lantern.localhost:8080/', true)`,
    [SITE]
  )
  await pool.query(`insert into site_name (name, site_key) values ($1, $1) on conflict do nothing`, [SITE])
  const person = async (name, role) => {
    const email = `${name.toLowerCase()}@lab3.example`
    const { rows } = await pool.query(
      'insert into account (email, display_name) values ($1, $2) returning id',
      [email, name]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [SITE, rows[0].id, role]
    )
    return { id: rows[0].id, email, name }
  }
  const akemi = await person('Akemi', 'owner')
  const lee = await person('Lee', 'editor')
  const david = await person('David', 'editor')
  const call = async (who, method, path, body) => {
    const headers = { cookie: `tracy_sess=${await mintSession(who.email, config.sessionSecret)}` }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test:8080${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, json }
  }
  const rowsOf = async (kind) =>
    (
      await pool.query(
        `select a.email, n.data, n.site_key from notification n join account a on a.id = n.account_id
          where n.kind = $1 order by a.email`,
        [kind]
      )
    ).rows
  const mailTo = (who) => sent.filter((m) => m.to === who.email)
  return { app, pool, sent, akemi, lee, david, call, rowsOf, mailTo }
}

test(
  'a renamed site reads by its current name in the Inbox and in mail, old rows included',
  opts,
  async () => {
    const w = await world()
    // A row written while the site still had its first name.
    await w.app.notifier.notify({
      recipients: [w.akemi.id],
      kind: 'team.left',
      siteKey: SITE,
      actor: w.david.id,
      data: { role: 'editor' }
    })
    assert.match(w.mailTo(w.akemi)[0].subject, /lantern\.localhost/)
    await w.pool.query(`update site set primary_name = 'beacon.localhost' where site_key = $1`, [SITE])
    const list = await w.call(w.akemi, 'GET', '/api/notifications')
    assert.equal(list.status, 200)
    const [row] = list.json.notifications
    assert.equal(row.siteKey, SITE, 'the key stays, for links and lookups')
    assert.equal(row.siteName, 'beacon.localhost')
    // A letter rendered now (a retry, a later event) names the current address too.
    await w.app.notifier.notify({
      recipients: [w.akemi.id],
      kind: 'team.left',
      siteKey: SITE,
      actor: w.lee.id,
      data: { role: 'editor' }
    })
    const last = w.mailTo(w.akemi).at(-1)
    assert.match(last.subject, /beacon\.localhost/)
    assert.doesNotMatch(last.subject, /lantern\.localhost/)
  }
)

test('T12: Restore everything tells the team except the presser, naming the backup', opts, async () => {
  const w = await world({
    'webroot-history': HISTORY,
    'webroot-restore-everything': EVERYTHING_OK,
    'webroot-commit': RESTORE_COMMIT
  })
  const res = await w.call(w.lee, 'POST', `/api/sites/${SITE}/restore`, {
    mode: 'everything',
    version: 3,
    confirm: 'restore',
    idemKey: 'press-0001'
  })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  const rows = await w.rowsOf('team.site_restored')
  assert.deepEqual(
    rows.map((r) => [r.email, r.data.backup, r.data.version]),
    [
      ['akemi@lab3.example', 'Before the menu change', 3],
      ['david@lab3.example', 'Before the menu change', 3]
    ]
  )
  const [mail] = w.mailTo(w.david)
  assert.equal(mail.subject, 'Lee restored lantern.localhost to an earlier backup')
  assert.match(
    mail.text,
    /Lee \(lee@lab3\.example\) restored lantern\.localhost to the backup “Before the menu change”\. Changes saved after that backup are gone\. If you were working on this site, check your recent edits\./
  )
  assert.match(mail.text, /Open lantern\.localhost/)
  assert.equal(w.mailTo(w.lee).length, 0, 'the presser gets nothing')
  // A retry with the same idemKey answers the same operation and does not tell anyone twice.
  await w.call(w.lee, 'POST', `/api/sites/${SITE}/restore`, {
    mode: 'everything',
    version: 3,
    confirm: 'restore',
    idemKey: 'press-0001'
  })
  assert.equal((await w.rowsOf('team.site_restored')).length, 2)
})

test('T12: undo and reset of files only tell nobody', opts, async () => {
  const w = await world({
    'webroot-restore-reset': { ok: true, files: 1, head: HEAD },
    'webroot-commit': RESTORE_COMMIT
  })
  const res = await w.call(w.lee, 'POST', `/api/sites/${SITE}/restore`, { mode: 'reset', sha: S3 })
  assert.equal(res.status, 200)
  assert.equal((await w.rowsOf('team.site_restored')).length, 0)
})

test('T13: deleting the site tells every other member; the rows outlive the site', opts, async () => {
  const w = await world()
  const res = await w.call(w.akemi, 'DELETE', `/api/sites/${SITE}`)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  const rows = await w.rowsOf('team.site_deleted')
  assert.deepEqual(
    rows.map((r) => [r.email, r.data.siteName, r.site_key]),
    [
      ['david@lab3.example', SITE, SITE],
      ['lee@lab3.example', SITE, SITE]
    ]
  )
  const [mail] = w.mailTo(w.lee)
  assert.equal(mail.subject, 'Akemi deleted lantern.localhost')
  assert.match(
    mail.text,
    /Akemi \(akemi@lab3\.example\) deleted lantern\.localhost\. You no longer have access to it\./
  )
  assert.doesNotMatch(visible(mail.html), /class="button"|>Open /, 'no button: there is no site left to open')
  assert.equal(w.mailTo(w.akemi).length, 0)
  const list = await w.call(w.lee, 'GET', '/api/notifications')
  assert.equal(list.json.notifications[0].kind, 'team.site_deleted')
  assert.equal(list.json.notifications[0].siteName, SITE, 'named by the name it had, the site row is gone')
})

test('T13: deleting the site closes the invitations and requests still open on it', opts, async () => {
  // Live on dev 09/10/2026: e2ef-jo was deleted while an invitation to it stood open, and the
  // invitee's Inbox still offered Accept, which the gone site could only refuse.
  const w = await world()
  const { rows } = await w.pool.query(
    `insert into account (email, display_name) values ('nora@lab3.example', 'Nora') returning id`
  )
  const nora = { id: rows[0].id, email: 'nora@lab3.example', name: 'Nora' }
  await w.pool.query(
    `insert into notification (account_id, kind, site_key, actor_account_id, data, ref)
     values ($1, 'team.invited', $3, $2, '{"role":"editor"}', $4),
            ($2, 'team.join_request', $3, $1, '{}', $5)`,
    [nora.id, w.akemi.id, SITE, `invite:${SITE}:${nora.id}`, `join:${SITE}:${nora.id}`]
  )
  const res = await w.call(w.akemi, 'DELETE', `/api/sites/${SITE}`)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  const open = await w.pool.query(
    `select kind from notification where site_key = $1 and settled_at is null
       and kind in ('team.invited', 'team.join_request', 'team.edit_access_request')`,
    [SITE]
  )
  assert.deepEqual(open.rows, [], 'nothing on a deleted site waits for an answer')
  const list = await w.call(nora, 'GET', '/api/notifications')
  const invite = list.json.notifications.find((n) => n.kind === 'team.invited')
  assert.ok(invite.settledAt, 'settled: the Inbox shows no Accept or Decline on it')
  assert.equal(invite.data.outcome, undefined, 'nobody answered it')
})

test('T14: a new address tells the team except the person who changed it', opts, async () => {
  const w = await world({ 'site-address': { ok: true } })
  const res = await w.call(w.akemi, 'PUT', `/api/sites/${SITE}/address`, { name: 'beacon.localhost' })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  const rows = await w.rowsOf('team.site_renamed')
  assert.deepEqual(
    rows.map((r) => [r.email, r.data.oldSite, r.data.newSite]),
    [
      // Both names of this step: read after a later rename, the site's name then is not this "to".
      ['david@lab3.example', SITE, 'beacon.localhost'],
      ['lee@lab3.example', SITE, 'beacon.localhost']
    ]
  )
  const [mail] = w.mailTo(w.david)
  assert.equal(mail.subject, 'lantern.localhost is now beacon.localhost')
  assert.match(
    mail.text,
    /Akemi \(akemi@lab3\.example\) changed the address of lantern\.localhost to beacon\.localhost\. Links to the old address may no longer work\./
  )
  assert.match(mail.text, /Open beacon\.localhost/)
  assert.equal(w.mailTo(w.akemi).length, 0)
  const list = await w.call(w.lee, 'GET', '/api/notifications')
  assert.equal(list.json.notifications[0].siteName, 'beacon.localhost')
})
