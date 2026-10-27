// Moving old place pictures (`places/<uuid>/<sha>.<ext>` in the artifact store) into the shared bucket
// (tasks/plan-wo-shared-places.md §7): copy, verify what was written, then re-key the row; never delete
// the source; one statement rolls it back. With PLACE_MEDIA_S3_* set the shared side is the REAL
// bucket under a throwaway `test/<random>/` prefix, deleted afterwards; without, an in-memory store.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { storeObjects } from '../src/app.js'
import { readPlaceMediaStore } from '../src/config.js'
import { movePlaceMedia, ROLLBACK_SQL, surveyPlaceMedia } from 'website-opportunities/src/place-media-move.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const ROOT = `test/${randomBytes(6).toString('hex')}/`
const realStore = readPlaceMediaStore(process.env)
const written = new Set()

function memoryStore() {
  const objects = new Map()
  return {
    objects,
    async put(key, bytes) {
      objects.set(key, Buffer.from(bytes))
      return true
    },
    async get(key) {
      return objects.has(key) ? new Response(objects.get(key)) : null
    },
    async head(key) {
      return objects.has(key) ? { size: objects.get(key).length } : null
    },
    async delete(key) {
      objects.delete(key)
    }
  }
}

/** The shared side: the real bucket (every key it writes remembered for cleanup) or memory. */
function sharedStore() {
  if (!realStore) return memoryStore()
  const real = storeObjects(realStore, fetch)
  return {
    ...real,
    async put(key, bytes, type) {
      written.add(key)
      return real.put(key, bytes, type)
    }
  }
}

after(async () => {
  if (!realStore) return
  const real = storeObjects(realStore, fetch)
  for (const key of written) await real.delete(key)
  for (const key of written) assert.equal(await real.head(key), null, `test object ${key} left behind`)
})

async function seed(local) {
  const pool = db.pool
  const placeId = (await pool.query(`insert into wo_place (display_name) values ('Old Pho') returning id`))
    .rows[0].id
  const rows = []
  const add = async ({
    bytes,
    source = 'website',
    provider = 'website',
    status = 'stored',
    store = true,
    ext = 'png',
    label
  }) => {
    const digest = sha(bytes ?? Buffer.from(label))
    const key = status === 'stored' ? `places/${placeId}/${digest}.${ext}` : null
    if (status === 'stored' && store) await local.put(key, bytes)
    const row = (
      await pool.query(
        `insert into wo_place_media (place_id, sha256, object_key, status, mime, bytes, kind, source, source_url, provider)
         values ($1, $2, $3, $4, 'image/png', $5, 'image', $6, $7, $8) returning *`,
        [
          placeId,
          digest,
          key,
          status,
          bytes?.length ?? null,
          source,
          `https://old.example/${label}.png`,
          provider
        ]
      )
    ).rows[0]
    rows.push({ ...row, label })
    return row
  }
  await add({ bytes: Buffer.from('website picture bytes'), label: 'site' })
  // The backfill kept the source's extension case (`place-backfill.js` copyObject).
  await add({ bytes: Buffer.from('upper case JPG'), ext: 'JPG', label: 'upper' })
  await add({
    bytes: Buffer.from('google picture bytes'),
    source: 'google-places',
    provider: 'google',
    label: 'google'
  })
  await add({
    bytes: Buffer.from('serpapi maps picture'),
    source: 'google-maps',
    provider: 'serpapi',
    label: 'serp'
  })
  await add({ bytes: Buffer.from('never stored'), store: false, label: 'missing' })
  await add({ status: 'reference', label: 'reference' })
  const tampered = await add({ bytes: Buffer.from('original bytes'), label: 'tampered' })
  local.objects.set(tampered.object_key, Buffer.from('changed bytes!'))
  return { placeId, rows }
}

const byLabel = async (rows, label) =>
  (
    await db.pool.query('select * from wo_place_media where id = $1', [
      rows.find((r) => r.label === label).id
    ])
  ).rows[0]

test('dry run counts rows, bytes, unstored and missing sources, and writes nothing', opts, async () => {
  const local = memoryStore()
  const shared = sharedStore()
  await seed(local)
  const before = (await db.pool.query('select id, object_key from wo_place_media order by id')).rows
  const survey = await surveyPlaceMedia({ pool: db.pool, local })
  assert.deepEqual(survey, {
    rows: 7,
    storedRows: 6,
    totalBytes: 21 + 14 + 20 + 20 + 12 + 14,
    noStoredBytes: 1,
    alreadyShared: 0,
    toMove: 6,
    sourceMissing: 1,
    byOrigin: { google: 2, other: 4 }
  })
  assert.deepEqual(
    (await db.pool.query('select id, object_key from wo_place_media order by id')).rows,
    before
  )
  assert.equal(
    await db.pool.query('select count(*)::int as n from wo_place_media_rekey').then((r) => r.rows[0].n),
    0
  )
  if (!realStore) assert.equal(shared.objects.size, 0)
})

test(
  'move copies, verifies and re-keys; skips missing and mismatched sources; reruns; rolls back',
  opts,
  async () => {
    const local = memoryStore()
    const shared = sharedStore()
    const { rows } = await seed(local)
    const sourcesBefore = new Map(local.objects)

    const first = await movePlaceMedia({ pool: db.pool, local, shared, batch: 2, keyRoot: ROOT })
    assert.equal(first.moved, 4)
    assert.deepEqual(first.skipped.map((s) => [rows.find((r) => r.id === s.id).label, s.reason]).sort(), [
      ['missing', 'source_missing'],
      ['tampered', 'source_mismatch']
    ])
    assert.equal(first.movedBytes, 21 + 14 + 20 + 20)
    const upper = await byLabel(rows, 'upper')
    assert.equal(upper.object_key, `${ROOT}media/other/${upper.sha256.slice(0, 2)}/${upper.sha256}.jpg`)

    const site = await byLabel(rows, 'site')
    assert.equal(site.object_key, `${ROOT}media/other/${site.sha256.slice(0, 2)}/${site.sha256}.png`)
    const google = await byLabel(rows, 'google')
    assert.equal(google.object_key, `${ROOT}media/google/${google.sha256.slice(0, 2)}/${google.sha256}.png`)
    const serp = await byLabel(rows, 'serp')
    assert.match(serp.object_key, /media\/google\//)
    for (const r of [site, google, serp]) {
      const got = await shared.get(r.object_key)
      assert.equal(sha(Buffer.from(await got.arrayBuffer())), r.sha256)
    }
    assert.equal(
      (await byLabel(rows, 'missing')).object_key,
      rows.find((r) => r.label === 'missing').object_key
    )
    assert.equal(
      (await byLabel(rows, 'tampered')).object_key,
      rows.find((r) => r.label === 'tampered').object_key
    )
    assert.deepEqual(new Map(local.objects), sourcesBefore, 'no source object was deleted or changed')

    const second = await movePlaceMedia({ pool: db.pool, local, shared, batch: 2, keyRoot: ROOT })
    assert.equal(second.moved, 0, 'a rerun moves nothing twice')
    assert.equal(second.skipped.length, 2)

    const rekeys = (await db.pool.query('select * from wo_place_media_rekey')).rows
    assert.equal(rekeys.length, 4)
    await db.pool.query(ROLLBACK_SQL)
    assert.equal((await byLabel(rows, 'upper')).object_key, rows.find((r) => r.label === 'upper').object_key)
    assert.equal((await byLabel(rows, 'site')).object_key, rows.find((r) => r.label === 'site').object_key)
    assert.equal(
      (await byLabel(rows, 'google')).object_key,
      rows.find((r) => r.label === 'google').object_key
    )
  }
)

test('the guard still refuses a key that names other bytes', opts, async () => {
  const local = memoryStore()
  const { rows } = await seed(local)
  const site = rows.find((r) => r.label === 'site')
  await assert.rejects(
    db.pool.query('update wo_place_media set object_key = $2 where id = $1', [
      site.id,
      `media/other/00/${'0'.repeat(64)}.png`
    ]),
    /same bytes/
  )
  await assert.rejects(
    db.pool.query(`update wo_place_media set caption = 'x' where id = $1`, [site.id]),
    /immutable/
  )
})
