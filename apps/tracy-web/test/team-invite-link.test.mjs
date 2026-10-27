// The invite link in the inviter's own answer (spam hints D2, Akemi 05/10): `POST /api/team/invite`
// hands the inviter the same accept link the invitation mail carries, so a mail that lands in Spam
// still has a way through. The link is the signed token of that mail: it works only for the
// invited address and for seven days, exactly as the mail's link does. It must reach nobody else:
// no table row, no other door's answer, no notification.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

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

async function world({ failMail = false } = {}) {
  const { pool } = db
  const sent = []
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: {
      send: async (m) => {
        if (failMail) throw new Error('mail transport down')
        sent.push(m)
      }
    },
    sites: dbSitesResolver(pool, config)
  })
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, 'kinetic', 'local'])

  const person = async (name, role = null) => {
    const email = `${name.toLowerCase()}@lab3.example`
    const { rows } = await pool.query(
      'insert into account (email, display_name) values ($1, $2) returning id',
      [email, name]
    )
    const id = rows[0].id
    if (role) {
      await pool.query(
        `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
        [SITE, id, role]
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
    return { status: res.status, text, json }
  }

  /** Every public table whose rows, read as text, contain `needle`. */
  const tablesHolding = async (needle) => {
    const { rows } = await pool.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`
    )
    const holding = []
    for (const { table_name } of rows) {
      const hit = await pool.query(
        `select 1 from "${table_name}" t where t::text like '%' || $1 || '%' limit 1`,
        [needle]
      )
      if (hit.rowCount > 0) holding.push(table_name)
    }
    return holding
  }

  return { sent, person, call, tablesHolding }
}

const tokenOf = (url) => url.match(/\/invite\/([\w.-]+)$/)[1]

test('the inviter gets the accept link of the invitation mail, and only the inviter', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', 'owner')
  const res = await w.call(akemi, 'POST', '/api/team/invite', {
    emails: ['vincent@lab3.example'],
    role: 'editor',
    siteKeys: [SITE]
  })
  assert.equal(res.status, 200)
  const [result] = res.json.results
  assert.equal(result.notified, true)
  assert.match(result.inviteUrl, /^http:\/\/tracy\.test\/invite\/[\w.-]+$/)

  // The very link the mail carries, not a second token with its own life.
  const [mail] = w.sent
  assert.ok(mail.text.includes(result.inviteUrl), 'the mail carries the same link')

  // Kept nowhere: the token exists in the inviter's answer and in the mail, nowhere else.
  const token = tokenOf(result.inviteUrl)
  assert.deepEqual(await w.tablesHolding(token), [])

  // No other door hands it out: not the team book, not the invitee's Inbox.
  const vincent = { email: 'vincent@lab3.example' }
  for (const [who, path] of [
    [akemi, '/api/team'],
    [akemi, '/api/sites'],
    [akemi, '/api/notifications'],
    [vincent, '/api/notifications'],
    [vincent, '/api/sites']
  ]) {
    const answer = await w.call(who, 'GET', path)
    assert.ok(!answer.text.includes(token), `${path} for ${who.email} must not carry the token`)
  }
})

test('the link still comes back when the invitation mail could not be sent', opts, async () => {
  const w = await world({ failMail: true })
  const akemi = await w.person('Akemi', 'owner')
  const res = await w.call(akemi, 'POST', '/api/team/invite', {
    emails: ['vincent@lab3.example'],
    role: 'editor',
    siteKeys: [SITE]
  })
  assert.equal(res.status, 200)
  const [result] = res.json.results
  assert.equal(result.notified, false)
  assert.match(result.inviteUrl, /^http:\/\/tracy\.test\/invite\/[\w.-]+$/)
})

test('no link when nothing was granted: already on the team, or refused', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', 'owner')
  await w.person('Vincent', 'editor')
  const already = await w.call(akemi, 'POST', '/api/team/invite', {
    emails: ['vincent@lab3.example'],
    role: 'editor',
    siteKeys: [SITE]
  })
  assert.equal(already.status, 200)
  assert.equal(already.json.results[0].inviteUrl, undefined)

  const viewer = await w.person('Lee', 'viewer')
  const refused = await w.call(viewer, 'POST', '/api/team/invite', {
    emails: ['hano@lab3.example'],
    role: 'editor',
    siteKeys: [SITE]
  })
  assert.equal(refused.status, 200)
  assert.equal(refused.json.results[0].sites[0].outcome, 'refused')
  assert.equal(refused.json.results[0].inviteUrl, undefined)
})

test('the link opens only for the invited address', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', 'owner')
  const res = await w.call(akemi, 'POST', '/api/team/invite', {
    emails: ['vincent@lab3.example'],
    role: 'editor',
    siteKeys: [SITE]
  })
  const path = new URL(res.json.results[0].inviteUrl).pathname
  const stranger = await w.person('Mallory')
  await w.call(stranger, 'GET', path)
  await w.call(stranger, 'POST', path)
  // Mallory holds no seat on the site afterwards, whatever the page said.
  const team = await w.call(stranger, 'GET', '/api/sites')
  assert.ok(!team.text.includes(SITE), 'a stranger with the link gets no seat')
})
