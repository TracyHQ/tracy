// A Viewer asks for edit access (ADR 0028 §6, plan T5), end to end through the real doors: who may
// ask, that asking twice writes one request, that every Owner (and nobody else) is told, that the
// Team roster shows the request, and that an Owner's answer reaches the Viewer and the other Owners.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const visible = (html) => String(html).replaceAll('&zwnj;', '')

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const SITE = 'kinetic.vn'

async function world() {
  const { pool } = db
  const sent = []
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async (m) => void sent.push(m) },
    sites: dbSitesResolver(pool, config)
  })
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, 'kinetic', 'local'])

  const person = async (name, { role = null, accepted = true } = {}) => {
    const email = `${name.toLowerCase()}@lab3.example`
    const { rows } = await pool.query(
      'insert into account (email, display_name) values ($1, $2) returning id',
      [email, name]
    )
    const id = rows[0].id
    if (role) {
      await pool.query(
        'insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, $4)',
        [SITE, id, role, accepted ? new Date() : null]
      )
    }
    return { id, email, name }
  }

  const call = async (who, method, path, body) => {
    const headers = who ? { cookie: `tracy_sess=${await mintSession(who.email, config.sessionSecret)}` } : {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
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

  const rows = async () =>
    (
      await pool.query(
        `select n.kind, a.email, n.data, n.ref, n.settled_at
           from notification n join account a on a.id = n.account_id order by n.created_at, a.email`
      )
    ).rows
  const seat = async (who) =>
    (await pool.query('select * from seat where site_key = $1 and account_id = $2', [SITE, who.id])).rows[0]
  const mailTo = (who) => sent.filter((m) => m.to === who.email)
  const ask = (who) => call(who, 'POST', `/api/sites/${SITE}/edit-access-request`, {})

  return { pool, sent, person, call, rows, seat, mailTo, ask }
}

test(
  'a Viewer asks once: every Owner is told, nobody else, and asking again writes nothing',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const lee = await w.person('Lee', { role: 'owner' })
    const hano = await w.person('Hano', { role: 'editor' })
    const vincent = await w.person('Vincent', { role: 'viewer' })

    const first = await w.ask(vincent)
    assert.equal(first.status, 201)
    assert.equal(first.json.requested, true)
    assert.equal(first.json.already, false)
    assert.ok((await w.seat(vincent)).edit_requested_at, 'the request is on the seat row')
    assert.equal((await w.seat(vincent)).role, 'viewer', 'asking grants nothing')

    const rows = await w.rows()
    assert.deepEqual(rows.map((r) => [r.kind, r.email]).sort(), [
      ['team.edit_access_request', akemi.email],
      ['team.edit_access_request', lee.email]
    ])
    assert.ok(rows.every((r) => r.ref === `edit:${SITE}:${vincent.id}`))
    assert.deepEqual(
      w.mailTo(akemi).map((m) => m.subject),
      ['Vincent asked for edit access on kinetic.vn']
    )
    const html = visible(w.mailTo(akemi)[0].html)
    assert.match(
      html,
      /Vincent \(vincent@lab3\.example\) can see kinetic\.vn as a Viewer and would like to edit it\./
    )
    assert.match(html, /Every Owner of this site received this request\./)
    assert.match(html, /member=vincent%40lab3\.example/)
    // The request waits in the locked group: no unsubscribe header on it.
    assert.equal(w.mailTo(akemi)[0].headers, undefined)
    assert.equal(w.mailTo(hano).length + w.mailTo(vincent).length, 0)

    const again = await w.ask(vincent)
    assert.equal(again.status, 200)
    assert.deepEqual([again.json.requested, again.json.already], [true, true])
    assert.equal((await w.rows()).length, 2, 'no second round of notifications')
    assert.equal(w.sent.length, 2, 'no second round of mail')
  }
)

test('only a live Viewer may ask', opts, async () => {
  const w = await world()
  await w.person('Akemi', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  const stranger = await w.person('Stranger')
  const invited = await w.person('Invited', { role: 'viewer', accepted: false })

  const editor = await w.ask(hano)
  assert.equal(editor.status, 409)
  assert.equal(editor.json.code, 'ALREADY_EDITOR')
  assert.equal((await w.ask(stranger)).json.code, 'SEAT_NOT_AUTHORIZED')
  assert.equal((await w.ask(invited)).status, 403, 'an invitation not yet accepted is no seat')
  const signedOut = await w.call(null, 'POST', `/api/sites/${SITE}/edit-access-request`, {})
  assert.deepEqual([signedOut.status, signedOut.json.code], [401, 'NOT_SIGNED_IN'])
  assert.equal(w.sent.length, 0)
})

test('the Team roster and My Sites carry the waiting request', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const vincent = await w.person('Vincent', { role: 'viewer' })
  await w.ask(vincent)
  const team = await w.call(akemi, 'GET', '/api/team')
  const row = team.json.sites[0].seats.find((s) => s.id === vincent.id)
  assert.equal(row.role, 'viewer')
  assert.equal(row.status, 'active')
  assert.equal(typeof row.editRequestedAt, 'string')
  assert.equal(team.json.sites[0].seats.find((s) => s.id === akemi.id).editRequestedAt, null)
  const mine = await w.call(vincent, 'GET', '/api/sites')
  assert.equal(typeof mine.json.sites[0].editRequestedAt, 'string')
})

test('Approve makes the Viewer an Editor, tells them, and closes the other Owners’ rows', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const lee = await w.person('Lee', { role: 'owner' })
  const vincent = await w.person('Vincent', { role: 'viewer' })
  await w.ask(vincent)
  w.sent.length = 0

  const res = await w.call(akemi, 'POST', `/api/sites/${SITE}/seats/${vincent.id}/edit-access`, {
    decision: 'approve'
  })
  assert.equal(res.status, 200)
  assert.deepEqual([res.json.role, res.json.decision], ['editor', 'approved'])
  const seat = await w.seat(vincent)
  assert.deepEqual([seat.role, seat.edit_requested_at], ['editor', null])

  const rows = await w.rows()
  assert.ok(
    rows
      .filter((r) => r.kind === 'team.edit_access_request')
      .every((r) => r.settled_at && r.data.outcome === 'approved'),
    'every Owner’s request row is settled as approved'
  )
  assert.deepEqual(
    rows.filter((r) => r.kind !== 'team.edit_access_request').map((r) => [r.kind, r.email]),
    [
      ['team.edit_access_answered', lee.email],
      ['team.edit_access_approved', vincent.email]
    ]
  )
  assert.deepEqual(
    w.mailTo(vincent).map((m) => m.subject),
    ['You can now edit kinetic.vn']
  )
  assert.match(
    visible(w.mailTo(vincent)[0].html),
    /Akemi \(akemi@lab3\.example\) approved your request\. You are now an Editor on kinetic\.vn\./
  )
  assert.deepEqual(
    w.mailTo(lee).map((m) => m.subject),
    ['Akemi approved Vincent’s request for edit access on kinetic.vn']
  )
  assert.equal(w.mailTo(akemi).length, 0, 'the Owner who answered is told nothing')

  const twice = await w.call(lee, 'POST', `/api/sites/${SITE}/seats/${vincent.id}/edit-access`, {
    decision: 'decline'
  })
  assert.deepEqual([twice.status, twice.json.code], [409, 'NO_EDIT_REQUEST'])
})

test('Decline keeps the Viewer a Viewer, clears the request, and they may ask again', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const vincent = await w.person('Vincent', { role: 'viewer' })
  await w.ask(vincent)
  w.sent.length = 0

  const res = await w.call(akemi, 'POST', `/api/sites/${SITE}/seats/${vincent.id}/edit-access`, {
    decision: 'decline'
  })
  assert.equal(res.status, 200)
  assert.deepEqual([res.json.role, res.json.decision], ['viewer', 'declined'])
  assert.deepEqual(
    [(await w.seat(vincent)).role, (await w.seat(vincent)).edit_requested_at],
    ['viewer', null]
  )
  assert.deepEqual(
    w.mailTo(vincent).map((m) => m.subject),
    ['Your request for edit access on kinetic.vn was declined']
  )
  assert.doesNotMatch(visible(w.mailTo(vincent)[0].html), /Akemi/, 'who declined is not named')

  const again = await w.ask(vincent)
  assert.deepEqual([again.status, again.json.already], [201, false])
})

test('only an Owner answers, and only with a decision', opts, async () => {
  const w = await world()
  await w.person('Akemi', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  const owner = await w.person('Lee', { role: 'owner' })
  const vincent = await w.person('Vincent', { role: 'viewer' })
  await w.ask(vincent)
  const path = `/api/sites/${SITE}/seats/${vincent.id}/edit-access`
  assert.equal((await w.call(hano, 'POST', path, { decision: 'approve' })).json.code, 'NOT_SITE_OWNER')
  assert.equal((await w.call(owner, 'POST', path, { decision: 'yes' })).status, 400)
  assert.equal((await w.call(owner, 'POST', path, { decision: 'approve', role: 'owner' })).status, 400)
  assert.equal((await w.seat(vincent)).role, 'viewer')
})

test('a role change answers the request too, and its rows close', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const vincent = await w.person('Vincent', { role: 'viewer' })
  await w.ask(vincent)
  const res = await w.call(akemi, 'PATCH', `/api/sites/${SITE}/seats/${vincent.id}`, { role: 'editor' })
  assert.equal(res.status, 200)
  assert.equal((await w.seat(vincent)).edit_requested_at, null)
  const request = (await w.rows()).find((r) => r.kind === 'team.edit_access_request')
  assert.ok(request.settled_at)
})
