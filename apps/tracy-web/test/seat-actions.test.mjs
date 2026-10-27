/**
 * One control, one action on a site's seat book (#792), without a database.
 *
 *   - Revoke access, Cancel invitation and Decline request went through one bodyless DELETE and
 *     all three were stored as the same revoke. Each now carries its own `kind`, is refused when
 *     the row is no longer in the state that kind acts on, and is stored under its own
 *     `removal_kind`.
 *   - Neither a removal nor a role change left a record. Each successful one now records its own
 *     event with the actor, the site and the target; a refusal, a repeat and an unchanged role
 *     record nothing.
 *
 * The real `seatsRoutes` handlers and the real `createOpsSignal` run against a pool double that
 * interprets the handful of statement shapes these doors send (a `select`/`update` on `seat` with
 * `and`-joined conditions) over rows held in memory. A statement the double does not know throws,
 * so a door cannot pass here by sending something unexamined. What the double cannot show:
 * PostgreSQL itself (the migration, the check constraints, the last-owner trigger, a real race).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Hono } from 'hono'

import { readConfig } from '../src/config.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { mintSession } from '../src/lib/session.js'
import { rosterRow, seatsRoutes } from '../src/seats/route.js'
import * as store from '../src/seats/store.js'

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
const SITE = 'one.example'
const OTHER_SITE = 'two.example'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const OWNER = id(1)
const VIEWER = id(2)
const EDITOR = id(3)
const INVITED = id(4)
const ASKED = id(5)
const DECLINED = id(6)
const SECOND_OWNER = id(7)
const OUTSIDER = id(8)
const WORKSPACE_ADMIN = id(9)
const EMAILS = {
  [OWNER]: 'owner@x.y',
  [VIEWER]: 'viewer@x.y',
  [EDITOR]: 'editor@x.y',
  [INVITED]: 'invited@x.y',
  [ASKED]: 'asked@x.y',
  [DECLINED]: 'declined@x.y',
  [SECOND_OWNER]: 'owner2@x.y',
  [OUTSIDER]: 'outsider@x.y',
  [WORKSPACE_ADMIN]: 'wsadmin@x.y'
}
const T0 = new Date('2026-10-01T00:00:00Z')

const seat = (accountId, over = {}) => ({
  site_key: SITE,
  account_id: accountId,
  role: 'editor',
  granted_by: OWNER,
  granted_at: T0,
  seen_at: null,
  accepted_at: T0,
  requested_at: null,
  declined_at: null,
  revoked_at: null,
  removal_kind: null,
  created_by_proof: null,
  ...over
})

/** The book every test starts from: one of each lifecycle state on SITE, an outsider on OTHER_SITE. */
const book = () => [
  seat(OWNER, { role: 'owner' }),
  seat(VIEWER, { role: 'viewer' }),
  seat(EDITOR),
  seat(INVITED, { accepted_at: null }),
  seat(ASKED, { accepted_at: null, requested_at: T0, granted_by: ASKED }),
  seat(DECLINED, { accepted_at: null, declined_at: T0 }),
  seat(OUTSIDER, { site_key: OTHER_SITE, role: 'owner' })
]

const squash = (sql) => sql.replace(/\s+/g, ' ').trim()

/** `a = $1 and b is null and c = 'x'` as a predicate over a row. An unknown condition throws. */
function conditionsOf(clause, values) {
  return clause.split(/ and /i).map((raw) => {
    const part = raw.trim()
    let m = part.match(/^(\w+) = \$(\d+)$/)
    if (m) return (row) => String(row[m[1]]) === String(values[Number(m[2]) - 1])
    m = part.match(/^(\w+) = '([^']*)'$/)
    if (m) return (row) => row[m[1]] === m[2]
    m = part.match(/^(\w+) is null$/i)
    if (m) return (row) => row[m[1]] === null || row[m[1]] === undefined
    m = part.match(/^(\w+) is not null$/i)
    if (m) return (row) => row[m[1]] !== null && row[m[1]] !== undefined
    throw new Error(`pool double: unknown condition "${part}"`)
  })
}

/** `a = now(), b = $3, c = null` as a patch. An unknown assignment throws. */
function patchOf(clause, values, now) {
  const patch = {}
  for (const raw of clause.split(',')) {
    const part = raw.trim()
    let m = part.match(/^(\w+) = now\(\)$/i)
    if (m) {
      patch[m[1]] = now()
      continue
    }
    m = part.match(/^(\w+) = \$(\d+)$/)
    if (m) {
      patch[m[1]] = values[Number(m[2]) - 1]
      continue
    }
    m = part.match(/^(\w+) = null$/i)
    if (m) {
      patch[m[1]] = null
      continue
    }
    throw new Error(`pool double: unknown assignment "${part}"`)
  }
  return patch
}

/**
 * The pool double. `beforeSeatUpdate(seats)` runs between a door's read and its write, which is
 * where a second administrator's change lands; `failSeatUpdate` is thrown in place of the write.
 */
function fakePool(seats = book()) {
  const state = {
    seats,
    signals: [],
    synced: [],
    statements: [],
    beforeSeatUpdate: null,
    failSeatUpdate: null,
    failSignals: false
  }
  const now = () => new Date('2026-10-03T12:00:00Z')

  async function query(input, params) {
    const text = squash(typeof input === 'string' ? input : input.text)
    const values = (typeof input === 'string' ? params : input.values) ?? []
    state.statements.push(text)
    if (/^(begin|commit|rollback|set local )/i.test(text)) return { rows: [], rowCount: 0 }

    let m = text.match(/^select (\*|account_id) from seat where (.+)$/i)
    if (m) {
      const tests = conditionsOf(m[2], values)
      const rows = state.seats.filter((row) => tests.every((ok) => ok(row))).map((row) => ({ ...row }))
      return { rows, rowCount: rows.length }
    }
    m = text.match(/^update seat set (.+) where (.+) returning \*$/i)
    if (m) {
      if (state.beforeSeatUpdate) {
        const hook = state.beforeSeatUpdate
        state.beforeSeatUpdate = null
        hook(state.seats)
      }
      if (state.failSeatUpdate) throw state.failSeatUpdate
      const tests = conditionsOf(m[2], values)
      const patch = patchOf(m[1], values, now)
      const hit = state.seats.filter((row) => tests.every((ok) => ok(row)))
      for (const row of hit) Object.assign(row, patch)
      return { rows: hit.map((row) => ({ ...row })), rowCount: hit.length }
    }
    if (/^select email from account where id = \$1$/i.test(text)) {
      const email = EMAILS[values[0]]
      return { rows: email ? [{ email }] : [], rowCount: email ? 1 : 0 }
    }
    if (/^select id, email, display_name, avatar_url from account where email = \$1$/i.test(text)) {
      const found = Object.entries(EMAILS).find(([, email]) => email === values[0])
      return { rows: found ? [{ id: found[0], email: found[1], display_name: null, avatar_url: null }] : [] }
    }
    if (/^select id, beta_admission from account where email = \$1$/i.test(text)) {
      const found = Object.entries(EMAILS).find(([, email]) => email === values[0])
      return { rows: found ? [{ id: found[0], beta_admission: null }] : [] }
    }
    if (/^select site_key, policy, updated_by, updated_at from site_role_policy where/i.test(text)) {
      return { rows: [], rowCount: 0 }
    }
    if (/^insert into seat_sync /i.test(text)) {
      state.synced.push({ kind: values[0], host: values[1], email: values[2], siteKey: values[3] })
      return { rows: [{ id: state.synced.length }], rowCount: 1 }
    }
    if (/^insert into ops_signal /i.test(text)) {
      if (state.failSignals) throw new Error('ops_signal is down')
      const [kind, accountId, siteKey, data] = values
      const row = { id: state.signals.length + 1, kind, account_id: accountId, site_key: siteKey, data }
      state.signals.push(row)
      return { rows: [row], rowCount: 1 }
    }
    // The reads the #809 notifier adds to a declined join request: the requester's name and the
    // site's team for the rows it writes. This file pins the seat writes, so they answer empty.
    if (/^select id, email, display_name from account where id = \$1$/i.test(text)) {
      return { rows: [], rowCount: 0 }
    }
    if (
      /^select s\.\*, a\.email as account_email, a\.display_name as account_display_name, a\.avatar_url as account_avatar_url from seat s join account a on a\.id = s\.account_id where s\.site_key = \$1\b/i.test(
        text
      )
    ) {
      return { rows: [], rowCount: 0 }
    }
    throw new Error(`pool double: unknown statement "${text}"`)
  }
  const pool = {
    query,
    connect: async () => ({ query, release() {} })
  }
  return { pool, state }
}

/** The seats doors over a pool double, with the real ops-signal service bound to that pool. */
function harness({ seats, seatDoor = {} } = {}) {
  const { pool, state } = fakePool(seats)
  const config = readConfig(env)
  const warnings = []
  // The service says once at start that Telegram is off here; only what it could not record is kept.
  const log = { warn: (line) => void (/could not record/.test(line) && warnings.push(line)) }
  createOpsSignal({ pool, config, log })
  const app = new Hono()
  // A statement the double fails is a 500 here, as it is in the real app; said without a stack.
  app.onError((_error, c) => c.text('Internal Server Error', 500))
  app.route(
    '/',
    seatsRoutes({
      pool,
      config,
      mail: { send: async () => {} },
      sites: { labelOf: async () => 'one' },
      seatDoor
    })
  )
  const send = async (method, accountId, target, { body, raw, headers = {}, site = SITE } = {}) => {
    const cookie = accountId
      ? `tracy_sess=${await mintSession(EMAILS[accountId], config.sessionSecret)}`
      : null
    const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
    return app.fetch(
      new Request(`http://tracy.test/api/sites/${site}/seats/${target}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(payload !== undefined && payload !== '' ? { 'content-type': 'application/json' } : {}),
          ...headers
        },
        ...(payload !== undefined ? { body: payload } : {})
      })
    )
  }
  const rowOf = (accountId, site = SITE) =>
    state.seats.find((row) => row.account_id === accountId && row.site_key === site)
  return { state, send, rowOf, warnings }
}

const KINDS = [
  { kind: 'revoke', target: EDITOR, event: 'team.revoke' },
  { kind: 'cancel_invite', target: INVITED, event: 'team.cancel_invite' },
  { kind: 'decline_request', target: ASKED, event: 'team.decline_request' }
]

// ── Finding 1: three removals, three kinds, three stored states ─────────────────────────────────

for (const { kind, target } of KINDS) {
  test(`DELETE {kind: ${kind}} stores ${kind}, answers it, and closes the seat`, async () => {
    const h = harness()
    const res = await h.send('DELETE', OWNER, target, { body: { kind } })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { revoked: true, kind })
    const row = h.rowOf(target)
    // `revoked_at` stays the fence every authorisation read uses; the kind says which act it was.
    assert.ok(row.revoked_at instanceof Date)
    assert.equal(row.removal_kind, kind)
    // `declined_at` is the invitee's own "no" and is never written by an administrator's press.
    assert.equal(row.declined_at, null)
    assert.equal(rosterRow(row).removalKind, kind)
    assert.equal(rosterRow(row).status, 'revoked')
  })
}

test('an explicit kind that does not match the row is refused and nothing is written', async () => {
  for (const { kind } of KINDS) {
    for (const { kind: actual, target } of KINDS) {
      if (kind === actual) continue
      const h = harness()
      const res = await h.send('DELETE', OWNER, target, { body: { kind } })
      assert.equal(res.status, 409, `${kind} on a row that is ${actual}`)
      assert.deepEqual(await res.json(), { code: 'SEAT_STATE_CHANGED', kind: actual })
      assert.equal(h.rowOf(target).revoked_at, null)
      assert.equal(h.rowOf(target).removal_kind, null)
      assert.deepEqual(h.state.signals, [])
    }
  }
})

test('a confirmation that went stale between the read and the write does not act on the new state', async () => {
  // The dialog said "Cancel invitation"; the invitee accepted before the write. Cancelling an
  // invitation must not revoke the seat they now hold.
  const h = harness()
  h.state.beforeSeatUpdate = (seats) => {
    seats.find((row) => row.account_id === INVITED).accepted_at = new Date()
  }
  const res = await h.send('DELETE', OWNER, INVITED, { body: { kind: 'cancel_invite' } })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'SEAT_STATE_CHANGED', kind: 'revoke' })
  assert.equal(h.rowOf(INVITED).revoked_at, null)
  assert.equal(h.rowOf(INVITED).removal_kind, null)
  assert.deepEqual(h.state.signals, [])
})

test('a row removed by somebody else between the read and the write answers 404, with no record', async () => {
  const h = harness()
  h.state.beforeSeatUpdate = (seats) => {
    const row = seats.find((r) => r.account_id === EDITOR)
    row.revoked_at = new Date()
    row.removal_kind = 'revoke'
  }
  const res = await h.send('DELETE', OWNER, EDITOR, { body: { kind: 'revoke' } })
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { code: 'GRANT_UNKNOWN' })
  assert.deepEqual(h.state.signals, [])
})

test('a body that is not exactly {kind: <known>} is refused before anything is read or written', async () => {
  const bad = [
    ['{}', 'no kind'],
    ['{"kind":"remove"}', 'unknown kind'],
    ['{"kind":"REVOKE"}', 'wrong case'],
    ['{"kind":1}', 'number'],
    ['{"kind":null}', 'null'],
    ['{"kind":["revoke"]}', 'list'],
    ['{"kind":{"is":"revoke"}}', 'object'],
    ['{"kind":"__proto__"}', 'prototype key'],
    ['{"kind":"toString"}', 'inherited key'],
    ['["revoke"]', 'array body'],
    ['"revoke"', 'string body'],
    ['null', 'null body'],
    ['{"kind":', 'broken JSON']
  ]
  for (const [raw, name] of bad) {
    const h = harness()
    const res = await h.send('DELETE', OWNER, EDITOR, { raw })
    assert.equal(res.status, 400, name)
    assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' }, name)
    assert.equal(h.rowOf(EDITOR).revoked_at, null, name)
    assert.deepEqual(h.state.signals, [], name)
    assert.equal(
      h.state.statements.some((s) => /^update /i.test(s)),
      false,
      name
    )
  }
})

// COMPATIBILITY (v1). A dsh image built before #792 sends this DELETE with no body at all. It is
// still answered exactly as before #792 — the act is read off the row — and the act that ran is
// stored and recorded as that act. A body that was SENT is another matter: it names its kind or
// it is refused. "No body" is a request that declares no content and has nothing to read; a body
// of whitespace, or a declared body that turns out empty, was sent.
const NO_BODY = [
  ['no body', {}],
  ['no body and content-length: 0', { headers: { 'content-length': '0' } }]
]
const BODY_WITHOUT_KIND = [
  ['a whitespace body', { raw: ' \n\t ' }],
  ['a single space', { raw: ' ' }],
  ['a newline', { raw: '\n' }],
  ['a declared length with nothing in it', { headers: { 'content-length': '2' } }],
  ['a chunked body with nothing in it', { headers: { 'transfer-encoding': 'chunked' } }],
  ['empty object', { raw: '{}' }],
  ['a kind beside another key', { raw: '{"kind":"revoke","force":true}' }],
  ['a kind under another name', { raw: '{"action":"revoke"}' }]
]

for (const { kind, target, event } of KINDS)
  for (const [name, options] of NO_BODY)
    test(`DELETE with ${name} (an older tab) runs the act the row calls for, ${kind}, and stores it as that`, async () => {
      const h = harness()
      const res = await h.send('DELETE', OWNER, target, options)
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { revoked: true, kind })
      assert.notEqual(h.rowOf(target).revoked_at, null)
      assert.equal(h.rowOf(target).removal_kind, kind)
      assert.deepEqual(
        h.state.signals.map((s) => s.kind),
        [event]
      )
    })

for (const { kind, target } of KINDS)
  for (const [name, options] of BODY_WITHOUT_KIND)
    test(`DELETE with ${name} is refused where the row calls for ${kind}: nothing removed, recorded or synced`, async () => {
      const h = harness()
      const res = await h.send('DELETE', OWNER, target, options)
      assert.equal(res.status, 400)
      assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' })
      assert.equal(h.rowOf(target).revoked_at, null)
      assert.equal(h.rowOf(target).removal_kind, null)
      assert.deepEqual(h.state.signals, [])
      assert.deepEqual(h.state.synced, [])
      assert.equal(
        h.state.statements.some((s) => /^update /i.test(s)),
        false
      )
    })

// ACCEPTED PROPERTY, stated rather than implied. A `Request` built with `body: ''` and no header
// announcing content is, on the wire, the same request as one built with no body: neither
// HTTP/1.1 nor HTTP/2 carries a bit that tells a zero-length body from an absent one (no
// `transfer-encoding`, `content-length` absent or 0, no bytes). A server cannot observe the
// difference the constructor seems to make, so the door answers both as the bodyless v1 call.
test("a zero-length body with no content header is the bodyless call: body '' and no body answer alike", async () => {
  for (const { kind, target, event } of KINDS) {
    const outcomes = []
    for (const options of [{}, { raw: '' }]) {
      const h = harness()
      const res = await h.send('DELETE', OWNER, target, options)
      outcomes.push({
        status: res.status,
        answer: await res.json(),
        stored: h.rowOf(target).removal_kind,
        removed: h.rowOf(target).revoked_at !== null,
        recorded: h.state.signals.map((s) => s.kind)
      })
    }
    const [absent, empty] = outcomes
    assert.deepEqual(empty, absent, kind)
    assert.deepEqual(
      empty,
      { status: 200, answer: { revoked: true, kind }, stored: kind, removed: true, recorded: [event] },
      kind
    )
  }
})

test('a tab that names its act is told when the row has moved on; a bodyless one keeps its v1 meaning', async () => {
  // The tab loaded while the row was an invitation; the invitee accepted; the button is pressed.
  // A tab built from #792 on names what its button said, and is refused: nobody pressed Revoke.
  const h = harness()
  h.rowOf(INVITED).accepted_at = new Date()
  const named = await h.send('DELETE', OWNER, INVITED, { body: { kind: 'cancel_invite' } })
  assert.equal(named.status, 409)
  assert.deepEqual(await named.json(), { code: 'SEAT_STATE_CHANGED', kind: 'revoke' })
  assert.equal(h.rowOf(INVITED).revoked_at, null)
  assert.deepEqual(h.state.signals, [])
  // A body that was sent and names no kind is refused in the same state.
  for (const [name, options] of BODY_WITHOUT_KIND) {
    const sent = harness()
    sent.rowOf(INVITED).accepted_at = new Date()
    const res = await sent.send('DELETE', OWNER, INVITED, options)
    assert.equal(res.status, 400, name)
    assert.equal(sent.rowOf(INVITED).revoked_at, null, name)
    assert.deepEqual(sent.state.signals, [], name)
  }
  // KNOWN LIMIT, kept on purpose (v1 is not broken): a tab from before #792 sends no body, so the
  // door does what it did before #792 — removes the seat as the row stands — and at least stores
  // and records the act that actually ran, never the label the old tab showed.
  const old = harness()
  old.rowOf(INVITED).accepted_at = new Date()
  const bodyless = await old.send('DELETE', OWNER, INVITED)
  assert.equal(bodyless.status, 200)
  assert.deepEqual(await bodyless.json(), { revoked: true, kind: 'revoke' })
  assert.equal(old.rowOf(INVITED).removal_kind, 'revoke')
  assert.deepEqual(
    old.state.signals.map((s) => s.kind),
    ['team.revoke']
  )
})

test('a bodyless request does not get past who may ask: the caller is judged first', async () => {
  const h = harness()
  assert.equal((await h.send('DELETE', null, EDITOR)).status, 401)
  assert.equal((await h.send('DELETE', EDITOR, VIEWER)).status, 403)
  assert.equal(h.rowOf(VIEWER).revoked_at, null)
  assert.deepEqual(h.state.signals, [])
})

test('a target that is missing, already removed, declined or malformed answers 404 for every kind', async () => {
  for (const kind of [...KINDS.map((k) => k.kind), undefined]) {
    const body = kind ? { body: { kind } } : {}
    const h = harness()
    // Declined by the invitee: there is nothing left for an administrator to remove.
    assert.equal((await h.send('DELETE', OWNER, DECLINED, body)).status, 404)
    assert.equal(h.rowOf(DECLINED).revoked_at, null)
    // No row on this site at all (the account holds a seat on another site only).
    assert.equal((await h.send('DELETE', OWNER, OUTSIDER, body)).status, 404)
    assert.equal(h.rowOf(OUTSIDER, OTHER_SITE).revoked_at, null)
    // Malformed grant ids never reach the book.
    for (const junk of ['undefined', '42', `${EDITOR}x`, '%27or%201=1'])
      assert.equal((await h.send('DELETE', OWNER, junk, body)).status, 404)
    assert.deepEqual(h.state.signals, [])
  }
})

test('a repeated removal is not a second removal: 404, the stored kind stays, one record', async () => {
  const h = harness()
  assert.equal((await h.send('DELETE', OWNER, ASKED, { body: { kind: 'decline_request' } })).status, 200)
  const stamped = h.rowOf(ASKED).revoked_at
  for (const kind of ['decline_request', 'revoke', 'cancel_invite']) {
    const again = await h.send('DELETE', OWNER, ASKED, { body: { kind } })
    assert.equal(again.status, 404)
  }
  assert.equal((await h.send('DELETE', OWNER, ASKED)).status, 404)
  assert.equal(h.rowOf(ASKED).removal_kind, 'decline_request')
  assert.equal(h.rowOf(ASKED).revoked_at, stamped)
  assert.deepEqual(
    h.state.signals.map((s) => s.kind),
    ['team.decline_request']
  )
})

// ── Authorisation stays where it was ─────────────────────────────────────────────────────────────

test('who may remove: signed in, a live OWNER seat on THIS site (ADR 0028), never yourself', async () => {
  const h = harness({
    seats: [...book(), seat(SECOND_OWNER, { role: 'owner' })]
  })
  const body = { body: { kind: 'revoke' } }
  // Not signed in.
  const anonymous = await h.send('DELETE', null, EDITOR, body)
  assert.equal(anonymous.status, 401)
  // Signed in, no seat on this site: an owner of another site, and an account with no seat at all
  // (a workspace-level role never opens this door, ADR 0067).
  for (const stranger of [OUTSIDER, WORKSPACE_ADMIN]) {
    const res = await h.send('DELETE', stranger, EDITOR, body)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'SEAT_NOT_AUTHORIZED' })
  }
  // A seat that is not an owner's, and seats that are not live (invited, asked, declined).
  for (const [who, code] of [
    [EDITOR, 'NOT_SITE_OWNER'],
    [VIEWER, 'NOT_SITE_OWNER'],
    [INVITED, 'SEAT_NOT_AUTHORIZED'],
    [ASKED, 'SEAT_NOT_AUTHORIZED'],
    [DECLINED, 'SEAT_NOT_AUTHORIZED']
  ]) {
    const res = await h.send('DELETE', who, who === VIEWER ? EDITOR : VIEWER, body)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code })
  }
  // An editor may not remove an owner either; nobody removes themselves.
  const editorOnOwner = await h.send('DELETE', EDITOR, OWNER, body)
  assert.deepEqual([editorOnOwner.status, await editorOnOwner.json()], [403, { code: 'NOT_SITE_OWNER' }])
  const self = await h.send('DELETE', OWNER, OWNER, body)
  assert.deepEqual([self.status, await self.json()], [403, { code: 'CANNOT_REVOKE_SELF' }])
  // A target on another site is not reachable through this site's door.
  const crossSite = await h.send('DELETE', OWNER, OUTSIDER, body)
  assert.equal(crossSite.status, 404)
  for (const row of h.state.seats) assert.equal(row.revoked_at, null)
  assert.deepEqual(h.state.signals, [])
})

test('the last owner is kept, by the count and by the store’s own refusal', async () => {
  // Two owners on the book, one of them not accepted yet: the count of LIVE owners is one.
  const h = harness({ seats: [...book(), seat(SECOND_OWNER, { role: 'owner', accepted_at: null })] })
  const demote = await h.send('PATCH', OWNER, OWNER, { body: { role: 'editor' } })
  assert.deepEqual([demote.status, await demote.json()], [403, { code: 'CANNOT_REVOKE_LAST_OWNER' }])
  assert.equal(h.rowOf(OWNER).role, 'owner')

  // Two live owners: the count allows it, the trigger refuses (a race the count did not see).
  const trigger = Object.assign(new Error('site one.example must keep one owner'), { code: '23514' })
  for (const [method, body] of [
    ['DELETE', { kind: 'revoke' }],
    ['PATCH', { role: 'editor' }]
  ]) {
    const two = harness({ seats: [...book(), seat(SECOND_OWNER, { role: 'owner' })] })
    two.state.failSeatUpdate = trigger
    const res = await two.send(method, OWNER, SECOND_OWNER, { body })
    assert.deepEqual([res.status, await res.json()], [403, { code: 'CANNOT_REVOKE_LAST_OWNER' }])
    assert.deepEqual(two.state.signals, [], `${method} refused by the trigger records nothing`)
  }
})

test('a target whose role changed between the read and the write is not removed, for any kind', async () => {
  // The removal is decided on the role that was read (the last-owner rule reads it); a target
  // promoted to owner by a second owner in between is not removed on the rule for its old role.
  for (const { kind, target } of KINDS) {
    const h = harness({ seats: [...book(), seat(SECOND_OWNER, { role: 'owner' })] })
    h.state.beforeSeatUpdate = (seats) => {
      seats.find((row) => row.account_id === target).role = 'owner'
    }
    const res = await h.send('DELETE', OWNER, target, { body: { kind } })
    assert.equal(res.status, 409, kind)
    assert.deepEqual(await res.json(), { code: 'SEAT_STATE_CHANGED', kind })
    assert.equal(h.rowOf(target).revoked_at, null, kind)
    assert.equal(h.rowOf(target).removal_kind, null, kind)
    assert.equal(h.rowOf(target).role, 'owner', kind)
    assert.deepEqual(h.state.signals, [], kind)
    assert.deepEqual(h.state.synced, [], kind)
  }
  // The same race under a caller with no body (an older tab): the act is read off the row, and the
  // role it was decided on is still the one the write checks.
  const old = harness({ seats: [...book(), seat(SECOND_OWNER, { role: 'owner' })] })
  old.state.beforeSeatUpdate = (seats) => {
    seats.find((row) => row.account_id === EDITOR).role = 'owner'
  }
  const res = await old.send('DELETE', OWNER, EDITOR)
  assert.equal(res.status, 409)
  assert.equal(old.rowOf(EDITOR).revoked_at, null)
  assert.deepEqual(old.state.signals, [])
})

test('the removal write names the role it was decided on; a leave names none', async () => {
  const h = harness()
  assert.equal((await h.send('DELETE', OWNER, EDITOR, { body: { kind: 'revoke' } })).status, 200)
  const write = h.state.statements.find((text) => /^update seat set revoked_at/i.test(text))
  assert.match(write, / and role = \$4 returning \*$/)
  await assert.rejects(
    () => store.revokeGrant({ query: async () => ({ rows: [] }) }, SITE, EDITOR, null, 'editor'),
    TypeError
  )
})

// ── Finding 2: a removal and a role change each leave a record ───────────────────────────────────

for (const { kind, target, event } of KINDS) {
  test(`a successful ${kind} records ${event} with the actor, the site and the target`, async () => {
    const h = harness()
    const role = h.rowOf(target).role
    assert.equal((await h.send('DELETE', OWNER, target, { body: { kind } })).status, 200)
    assert.deepEqual(h.state.signals, [
      {
        id: 1,
        kind: event,
        account_id: OWNER,
        site_key: SITE,
        data: { role, target, email: EMAILS[OWNER] }
      }
    ])
  })
}

test('a role change records team.role_change with the role it left and the role it took', async () => {
  const h = harness()
  const res = await h.send('PATCH', OWNER, EDITOR, { body: { role: 'viewer' } })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { id: EDITOR, role: 'viewer' })
  assert.equal(h.rowOf(EDITOR).role, 'viewer')
  assert.deepEqual(h.state.signals, [
    {
      id: 1,
      kind: 'team.role_change',
      account_id: OWNER,
      site_key: SITE,
      data: { from: 'editor', to: 'viewer', target: EDITOR, email: EMAILS[OWNER] }
    }
  ])
})

test('an unchanged role, an invalid role and a refused change record nothing', async () => {
  const h = harness()
  const same = await h.send('PATCH', OWNER, EDITOR, { body: { role: 'editor' } })
  assert.deepEqual([same.status, await same.json()], [200, { id: EDITOR, role: 'editor' }])
  // The retired roles are not roles any more (ADR 0028).
  for (const raw of [
    '{"role":"king"}',
    '{"role":1}',
    '{}',
    'null',
    '{"role":',
    '{"role":"admin"}',
    '{"role":"developer"}'
  ])
    assert.equal((await h.send('PATCH', OWNER, EDITOR, { raw })).status, 400)
  // Only an owner changes a role: an editor or a viewer changes none, owner or not.
  assert.equal((await h.send('PATCH', EDITOR, VIEWER, { body: { role: 'editor' } })).status, 403)
  assert.equal((await h.send('PATCH', EDITOR, OWNER, { body: { role: 'editor' } })).status, 403)
  assert.equal((await h.send('PATCH', VIEWER, EDITOR, { body: { role: 'viewer' } })).status, 403)
  assert.equal((await h.send('PATCH', null, EDITOR, { body: { role: 'viewer' } })).status, 401)
  assert.equal((await h.send('PATCH', OWNER, OUTSIDER, { body: { role: 'viewer' } })).status, 404)
  assert.equal(h.rowOf(EDITOR).role, 'editor')
  assert.equal(h.rowOf(OWNER).role, 'owner')
  assert.deepEqual(h.state.signals, [])
})

test('a role changed by somebody else between the read and the write is refused, not overwritten', async () => {
  const h = harness()
  h.state.beforeSeatUpdate = (seats) => {
    seats.find((row) => row.account_id === EDITOR).role = 'viewer'
  }
  const res = await h.send('PATCH', OWNER, EDITOR, { body: { role: 'owner' } })
  assert.deepEqual([res.status, await res.json()], [409, { code: 'SEAT_STATE_CHANGED' }])
  assert.equal(h.rowOf(EDITOR).role, 'viewer')
  assert.deepEqual(h.state.signals, [])
})

test('a write the database fails is a failure: no success answer and no record', async () => {
  for (const [method, body] of [
    ['DELETE', { kind: 'revoke' }],
    ['PATCH', { role: 'viewer' }]
  ]) {
    const h = harness()
    h.state.failSeatUpdate = new Error('connection terminated')
    const res = await h.send(method, OWNER, EDITOR, { body })
    assert.equal(res.status, 500, method)
    assert.deepEqual(h.state.signals, [], method)
    assert.equal(h.rowOf(EDITOR).revoked_at, null)
    assert.equal(h.rowOf(EDITOR).role, 'editor')
  }
})

test('the record is best-effort: analytics down is logged and never undoes or fails the change', async () => {
  const h = harness()
  h.state.failSignals = true
  const removed = await h.send('DELETE', OWNER, EDITOR, { body: { kind: 'revoke' } })
  assert.deepEqual([removed.status, await removed.json()], [200, { revoked: true, kind: 'revoke' }])
  const changed = await h.send('PATCH', OWNER, VIEWER, { body: { role: 'editor' } })
  assert.equal(changed.status, 200)
  assert.equal(h.rowOf(EDITOR).removal_kind, 'revoke')
  assert.equal(h.rowOf(VIEWER).role, 'editor')
  assert.deepEqual(h.warnings, [
    '[ops-signal] could not record team.revoke',
    '[ops-signal] could not record team.role_change'
  ])
})

test('the live session is still chased after a removal, and a host that is down is still queued', async () => {
  const calls = []
  const up = harness({
    seatDoor: {
      revokeSeatAtDoor: async (call) => {
        calls.push(call)
        return { ok: true, revoked: 1 }
      }
    }
  })
  const res = await up.send('DELETE', OWNER, EDITOR, { body: { kind: 'revoke' } })
  assert.deepEqual(await res.json(), {
    revoked: true,
    kind: 'revoke',
    lanes: [{ lane: 'local', ok: true, revoked: 1 }]
  })
  assert.deepEqual(calls, [{ origin: 'http://dsh', secret: 'k', email: EMAILS[EDITOR], site: SITE }])

  const warn = console.warn
  console.warn = () => {}
  try {
    const down = harness({
      seatDoor: {
        revokeSeatAtDoor: async () => {
          throw new Error('ECONNREFUSED')
        },
        mintSeatSession: async () => {
          throw new Error('ECONNREFUSED')
        }
      }
    })
    const removed = await down.send('DELETE', OWNER, EDITOR, { body: { kind: 'revoke' } })
    assert.deepEqual(await removed.json(), {
      revoked: true,
      kind: 'revoke',
      lanes: [{ lane: 'local', ok: false, revoked: null, error: 'ECONNREFUSED', queued: true }]
    })
    const changed = await down.send('PATCH', OWNER, VIEWER, { body: { role: 'editor' } })
    assert.deepEqual((await changed.json()).lanes, [
      { lane: 'local', ok: false, error: 'ECONNREFUSED', queued: true }
    ])
    assert.deepEqual(
      down.state.synced.map((s) => [s.kind, s.email]),
      [
        ['revoke', EMAILS[EDITOR]],
        ['mint', EMAILS[VIEWER]]
      ]
    )
    // The book changed and was recorded even though no host heard it yet.
    assert.deepEqual(
      down.state.signals.map((s) => s.kind),
      ['team.revoke', 'team.role_change']
    )
  } finally {
    console.warn = warn
  }
})

// ── The stored kind, in the store and on the roster ──────────────────────────────────────────────

test('a row removed before #792, or by leaving, carries no kind: nothing is guessed for it', async () => {
  const legacy = seat(EDITOR, { revoked_at: T0 })
  assert.equal(rosterRow(legacy).removalKind, null)
  assert.equal(rosterRow(legacy).status, 'revoked')
  // A server row from before the column existed has no such field at all.
  const { removal_kind: _dropped, ...older } = legacy
  assert.equal(rosterRow(older).removalKind, null)

  // Leaving is the person's own act and has its own record (`team.leave`); it is not one of the
  // three administrator removals and stores none of their kinds.
  const { pool, state } = fakePool()
  const left = await store.revokeGrant(pool, SITE, EDITOR)
  assert.ok(left.revoked_at instanceof Date)
  assert.equal(state.seats.find((row) => row.account_id === EDITOR).removal_kind, null)
})

test('a grant that is revived starts clean: the old removal kind does not follow it', async () => {
  const statements = []
  const pool = {
    query: async (text, values) => {
      statements.push(squash(text))
      return { rows: [{ site_key: values[0], account_id: values[1] }] }
    }
  }
  await store.grantSite(pool, { siteKey: SITE, accountId: EDITOR, role: 'editor', grantedBy: OWNER })
  await store.requestSiteJoin(pool, SITE, EDITOR)
  assert.equal(statements.length, 2)
  for (const sql of statements) {
    assert.match(sql, /revoked_at = null/)
    assert.match(sql, /removal_kind = null/, 'a revival that kept the kind would show a live seat as removed')
  }
})

test('the API document says what the door does: the DELETE body may be left out, a sent body names its kind', () => {
  // The `api-spec` gate keeps this snapshot equal to what `spec.js` builds from the route rows.
  const snapshot = JSON.parse(
    readFileSync(new URL('../api-reference.snapshot.json', import.meta.url), 'utf8')
  )
  const seat = snapshot.public.paths['/api/sites/{key}/seats/{grant}']
  assert.equal(seat.delete.requestBody.required, false)
  const schema = seat.delete.requestBody.content['application/json'].schema
  assert.deepEqual(schema.required, ['kind'])
  assert.deepEqual(schema.properties.kind.enum, ['revoke', 'cancel_invite', 'decline_request'])
  // A row that does not say its body is optional keeps a required one.
  assert.equal(seat.patch.requestBody.required, true)
})
