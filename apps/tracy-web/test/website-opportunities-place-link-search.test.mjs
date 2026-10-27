// A social page found by web search (`verified_by = 'search'`, migration 158) is a place's source but
// never evidence that two places are one: the URL ↔ Google auto-merge ignores it (plan contract §6).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { autoMergeFor } from 'website-opportunities/src/place-merge.js'
import { addLink, identityOf } from 'website-opportunities/src/places.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const FB = 'https://www.facebook.com/sundriftjbr'

async function place(pool, namespace, externalId) {
  const id = (await pool.query('insert into wo_place (display_name) values ($1) returning id', ['Sundrift']))
    .rows[0].id
  await pool.query(
    `insert into wo_place_identity (namespace, external_id, place_id, source) values ($1, $2, $3, 'test')`,
    [namespace, externalId, id]
  )
  return id
}

/** A Google place with `FB` as a link verified by `verifiedBy`, and a pasted-URL place of `FB`. */
async function googleAndPastedFacebook(pool, verifiedBy) {
  const google = await place(pool, 'google', 'ChIJsundriftJBR')
  const url = identityOf('url', FB)
  const pasted = await place(pool, 'url', url.externalId)
  await addLink(pool, google, 'facebook', url.externalId, verifiedBy, {
    query: 'Sundrift Café Dubai facebook'
  })
  return { google, pasted }
}

const mergedInto = async (pool, id) =>
  (await pool.query('select merged_into from wo_place where id = $1', [id])).rows[0].merged_into

test('migration 158: a link may be verified by search; junk is still refused', opts, async () => {
  const { pool } = db
  const id = await place(pool, 'google', 'ChIJmigration158')
  await addLink(pool, id, 'facebook', FB, 'search', { proofs: ['address'] })
  const row = (await pool.query('select verified_by, evidence from wo_place_link where place_id = $1', [id]))
    .rows[0]
  assert.equal(row.verified_by, 'search')
  assert.deepEqual(row.evidence, { proofs: ['address'] })
  await assert.rejects(
    addLink(pool, id, 'instagram', 'https://www.instagram.com/x/', 'guess', {}),
    /check constraint/
  )
  for (const kept of ['identity', 'google', 'website', 'operator', 'osm'])
    await addLink(pool, id, 'website', `https://example.test/${kept}`, kept, {})
})

test('a Google-verified link drives the URL ↔ Google auto-merge (control)', opts, async () => {
  const { pool } = db
  const { google, pasted } = await googleAndPastedFacebook(pool, 'google')
  await autoMergeFor(pool, pasted)
  assert.equal(await mergedInto(pool, pasted), google)
})

test('a search-verified link never drives an auto-merge, from either side', opts, async () => {
  const { pool } = db
  const { google, pasted } = await googleAndPastedFacebook(pool, 'search')
  assert.deepEqual(await autoMergeFor(pool, google), { merged: 0, waiting: 0, queued: 0 })
  assert.deepEqual(await autoMergeFor(pool, pasted), { merged: 0, waiting: 0, queued: 0 })
  assert.equal(await mergedInto(pool, pasted), null)
  assert.equal(
    (await pool.query('select count(*)::int as n from wo_place_merge_candidate')).rows[0].n,
    0,
    'no candidate, not even one waiting for an operator'
  )
})
