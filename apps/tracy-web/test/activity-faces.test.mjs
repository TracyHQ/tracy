// The face on every person Site changes, Changes and Backup name (`activity-store.js`
// `attachFaces`): one account read for the whole answer, the face `/api/team` gives that account,
// `face: null` for an address no account holds, and nothing added to a `by` that is not a person.
// A pool double, so it runs without Postgres; the doors that call it are measured against a real
// database in `site-activity*.test.mjs` and `sites-route.test.mjs`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { personFace } from '../src/lib/person-face.js'
import { attachFaces } from '../src/sites/activity-store.js'

const SQL = 'select id, email, display_name, avatar_url from account where email = any($1::text[])'
const MAI = { id: 'acc-mai', email: 'mai@example.test', display_name: 'Mai Tran', avatar_url: null }
const SAM = {
  id: 'acc-sam',
  email: 'sam@example.test',
  display_name: null,
  avatar_url: 'https://avatars.githubusercontent.com/u/7?v=4'
}

/** A pool that knows two accounts and answers only the one query `attachFaces` may send. */
function pool() {
  const calls = []
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params })
      assert.equal(sql, SQL)
      return { rows: [MAI, SAM].filter((a) => params[0].includes(a.email)) }
    }
  }
}

test('every person gets their account face in ONE query; an unknown address gets null', async () => {
  const db = pool()
  const people = [
    { kind: 'person', name: 'Mai', email: 'MAI@example.test' },
    { kind: 'person', name: 'Sam', email: 'sam@example.test' },
    { kind: 'person', name: 'Sam again', email: 'sam@example.test' },
    { kind: 'person', name: 'Ola', email: 'ola@outside.test' },
    { name: 'Mai Tran', email: 'mai@example.test' }
  ]
  const others = [{ kind: 'agent' }, { kind: 'outside' }, null, undefined, 'a.php']
  await attachFaces(db, [...people, ...others])

  assert.equal(db.calls.length, 1, 'one query for the whole answer, never one per row')
  assert.deepEqual(db.calls[0].params, [['mai@example.test', 'sam@example.test', 'ola@outside.test']])
  assert.deepEqual(people[0].face, personFace(MAI), 'the address is matched whatever its case')
  assert.deepEqual(people[1].face, personFace(SAM))
  assert.match(people[1].face.avatarUrl, /^\/auth\/avatar\/acc-sam\?v=[0-9a-f]{8}$/)
  assert.deepEqual(people[2].face, personFace(SAM))
  assert.equal(people[3].face, null, 'no account holds the address: no face, never a guessed one')
  assert.deepEqual(people[4].face, personFace(MAI), "Site changes' own {name, email} is a person too")
  assert.deepEqual(people[0], {
    kind: 'person',
    name: 'Mai',
    email: 'MAI@example.test',
    face: personFace(MAI)
  })
  assert.deepEqual(others.slice(0, 2), [{ kind: 'agent' }, { kind: 'outside' }], 'not a person: untouched')
})

test('a person with no email gets face null without a query; no person at all sends no query', async () => {
  const db = pool()
  const nameless = { kind: 'person', name: 'Who' }
  await attachFaces(db, [nameless, { kind: 'agent' }])
  assert.equal(nameless.face, null)
  assert.equal(db.calls.length, 0)
  await attachFaces(db, [{ kind: 'agent' }, null])
  assert.equal(db.calls.length, 0)
})
