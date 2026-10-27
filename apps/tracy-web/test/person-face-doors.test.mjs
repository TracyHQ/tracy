/**
 * One account, one face, on every door that names a person (`tasks/evidence/team-badge-count/contract.md`
 * § 2): `GET /api/team`, a site's `GET /sites/:key/seats`, the comment doors (`author`, `resolvedBy`,
 * `sends[].author`, and a write's own answer) and `GET /auth/me`'s `face`.
 *
 * Read off REAL responses against Postgres: the api-spec gate only sees each door's description,
 * so it cannot catch a door that stops carrying `initial`/`color`.
 */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { personFace } from '../src/lib/person-face.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { createSite } from '../src/sites/store.js'
import { freshPool } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const SECRET = 's'.repeat(32)
const ACTOR_SECRET = 'face-doors-actor-secret'
const SITE = 'lantern.example'
const ELEMENT = { kind: 'text', tag: 'h1', text: 'Northgate Coffee', selector: 'main h1' }
const LOCATE = { path: '/', index: 0 }
const PICTURE = 'https://lh3.googleusercontent.com/a/sam-one=s96-c'

/** The assertion a lane signs for `/sites/:key/seats` (`gateway.ts` `actorAssertion`). */
function actor(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
    'base64url'
  )
  return `v1.${payload}.${createHmac('sha256', ACTOR_SECRET).update(payload).digest('base64url')}`
}

/** The face fields of one person on the wire. */
const faceOf = (p) => ({ initial: p.initial, color: p.color, avatarUrl: p.avatarUrl })

async function world(t) {
  const { pool, close } = await freshPool()
  t.after(close)
  const cfg = readConfig({
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: SECRET,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k',
    MCP_TRACY_ACTOR_SECRET: ACTOR_SECRET
  })
  await createSite(pool, { siteKey: SITE, label: 'lantern', host: 'local' })
  const seat = async (email, role, name = null, avatar = null) => {
    const { rows } = await pool.query(
      `insert into account (email, display_name, avatar_url) values ($1, $2, $3) returning id`,
      [email, name, avatar]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [SITE, rows[0].id, role]
    )
    return { id: rows[0].id, email, display_name: name, avatar_url: avatar }
  }
  // Two people of one name, one of them with a picture: the faces must stay apart by account.
  const people = {
    lee: await seat('lee@example.com', 'owner'),
    sam1: await seat('sam.one@example.com', 'editor', 'Sam Tester', PICTURE),
    sam2: await seat('sam.two@example.com', 'editor', 'Sam Tester')
  }
  const app = buildApp({
    config: cfg,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, cfg),
    host: { hostCall, hostJob }
  })
  const call = async (email, method, path, body, headers = {}) => {
    const h = { ...headers }
    if (email) h.cookie = `tracy_sess=${await mintSession(email, SECRET)}`
    if (body !== undefined) h['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    )
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  return { call, people }
}

test(
  'one account wears one face on /api/team, /sites/:key/seats, the comments and /auth/me',
  opts,
  async (t) => {
    const { call, people } = await world(t)
    const expected = Object.fromEntries(Object.entries(people).map(([k, a]) => [k, personFace(a)]))
    // The rule itself, read off the fixture shape: the picture comes through, namesakes keep their
    // own account-keyed colours (no step moves one), the letter is the name's or the email's.
    // Tracy's own address for it (`GET /auth/avatar/:accountId`), never the provider's.
    assert.match(expected.sam1.avatarUrl, new RegExp(`^/auth/avatar/${people.sam1.id}\\?v=[0-9a-f]{8}$`))
    assert.equal(expected.sam2.avatarUrl, null)
    assert.equal(expected.lee.initial, 'L')
    assert.equal(expected.sam1.initial, 'S')

    // GET /api/team — every seat of the site's book.
    const team = await call('lee@example.com', 'GET', '/api/team')
    assert.equal(team.status, 200)
    const book = team.body.sites.find((s) => s.siteKey === SITE).seats
    for (const [k, a] of Object.entries(people)) {
      const row = book.find((r) => r.id === a.id)
      assert.deepEqual(faceOf(row), expected[k], `/api/team ${k}`)
    }

    // GET /sites/:key/seats — the same rows, as a site's dsh reads them.
    const lane = await call(null, 'GET', `/sites/${SITE}/seats`, undefined, {
      'x-tracy-actor': actor('lane@example.com')
    })
    assert.equal(lane.status, 200)
    for (const [k, a] of Object.entries(people)) {
      const row = lane.body.seats.find((r) => r.id === a.id)
      assert.deepEqual(faceOf(row), expected[k], `/sites/:key/seats ${k}`)
    }

    // The comment doors: a write's own answer, then author, resolvedBy and sends[].author on the list.
    const base = `/api/sites/${SITE}/comments`
    const made = await call('sam.one@example.com', 'POST', base, {
      url: 'http://lantern.localhost/',
      element: ELEMENT,
      locate: LOCATE,
      text: 'Make the heading bigger'
    })
    assert.equal(made.status, 201)
    assert.deepEqual(faceOf(made.body.comment.author), expected.sam1, 'POST author')
    const sent = await call('sam.two@example.com', 'POST', `/api/sites/${SITE}/requests`, {
      sessionId: 'sess-1',
      requestId: 'req-1',
      items: [
        {
          url: made.body.comment.url,
          element: ELEMENT,
          text: 'Please do this',
          commentId: made.body.comment.id
        }
      ]
    })
    assert.equal(sent.status, 201)
    const resolved = await call('lee@example.com', 'POST', `${base}/${made.body.comment.id}/resolve`)
    assert.equal(resolved.status, 200)
    assert.deepEqual(faceOf(resolved.body.comment.resolvedBy), expected.lee, 'resolve resolvedBy')
    assert.deepEqual(faceOf(resolved.body.comment.author), expected.sam1, 'resolve author')

    const list = await call('sam.two@example.com', 'GET', base)
    assert.equal(list.status, 200)
    const [row] = list.body.comments
    assert.deepEqual(faceOf(row.author), expected.sam1, 'list author')
    assert.deepEqual(faceOf(row.resolvedBy), expected.lee, 'list resolvedBy')
    assert.equal(row.sends.length, 1)
    assert.deepEqual(faceOf(row.sends[0].author), expected.sam2, 'list sends[].author')
    assert.equal(row.author.name, 'Sam Tester')
    assert.equal(row.sends[0].author.name, 'Sam Tester')

    // GET /auth/me — the viewer's own face; none for nobody.
    for (const [k, a] of Object.entries(people)) {
      const me = await call(a.email, 'GET', '/auth/me')
      assert.equal(me.status, 200)
      assert.deepEqual(me.body.face, expected[k], `/auth/me ${k}`)
    }
    const nobody = await call(null, 'GET', '/auth/me')
    assert.equal(nobody.body.face, null)
  }
)
