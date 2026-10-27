// ADR 0036: the open Website Opportunities layer reaches Tracy's infrastructure only through `host`.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { HOST_MEMBERS, requireHost } from 'website-opportunities/src/host.js'
import { createTracyWoHost } from '../src/wo-host.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
after(db.close)

test('requireHost names every member the host lacks', () => {
  assert.throws(
    () => requireHost({ json: () => {} }, ['json', 'sameSecret', 'clientIp']),
    (e) => /sameSecret/.test(e.message) && /clientIp/.test(e.message) && !/\bjson\b/.test(e.message)
  )
  assert.throws(() => requireHost(undefined, ['json']), /json/)
})

test('requireHost hands the host back when it has the members asked for', () => {
  const host = { json: () => {}, sameSecret: () => true }
  assert.equal(requireHost(host, ['json', 'sameSecret']), host)
})

test("Tracy's host provides every member of the contract", () => {
  const host = createTracyWoHost()
  assert.ok(HOST_MEMBERS.length >= 15)
  assert.ok(HOST_MEMBERS.includes('principalOf') && HOST_MEMBERS.includes('displayNameOf'))
  for (const name of HOST_MEMBERS) assert.equal(typeof host[name], 'function', name)
  assert.equal(requireHost(host, HOST_MEMBERS), host)
})

test("Tracy's principal is the person's account, and its display name signs outreach", opts, async () => {
  const { pool } = db
  const host = createTracyWoHost()
  const id = (
    await pool.query(
      "insert into account (email, display_name) values ('mai@test.example', 'Mai') returning id"
    )
  ).rows[0].id
  assert.equal(await host.principalOf(pool, 'mai@test.example'), id)
  assert.equal(await host.principalOf(pool, 'nobody@test.example'), null)
  assert.equal(await host.displayNameOf(pool, id), 'Mai')
  await pool.query('update account set display_name = null where id = $1', [id])
  assert.equal(await host.displayNameOf(pool, id), '')
})

test("Tracy's principal is found whatever the case of the email, as sign-in writes it", opts, async () => {
  const { pool } = db
  const host = createTracyWoHost()
  const id = (await pool.query("insert into account (email) values ('linh@test.example') returning id"))
    .rows[0].id
  assert.equal(await host.principalOf(pool, 'Linh@Test.Example'), id)
  assert.equal(await host.principalOf(pool, 'LINH@TEST.EXAMPLE'), id)
})

test("Tracy's host names a principal's email for the operator's place detail", opts, async () => {
  const { pool } = db
  const host = createTracyWoHost()
  const id = (await pool.query("insert into account (email) values ('an@test.example') returning id")).rows[0]
    .id
  assert.equal(await host.emailOf(pool, id), 'an@test.example')
  assert.equal(await host.emailOf(pool, '00000000-0000-4000-8000-000000000000'), null)
})
