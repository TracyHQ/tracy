// Real PNG pixels and isolated Postgres; object storage is an in-memory transport.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { createSnapshotMediaReader } from '../src/opportunities-build/snapshot-media.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
const opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const failure = (error) => typeof error?.code === 'string' && error.code.startsWith('SNAPSHOT_MEDIA_')
const at = Date.parse('2026-10-20T15:00:00.000Z')

// The snapshot guard (schema 0004) keeps a published snapshot's pictures; the reader must still fail closed if one went.
const dropMembership = (snapshotId) =>
  db.pool.query(
    `set local session_replication_role = replica;
     delete from wo_place_snapshot_media where snapshot_id = '${snapshotId}'`
  )

async function fixture({ mime = 'image/png', body, maxBytes, timeoutMs = 1000 } = {}) {
  const pixels = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#79583d' } })
    .png()
    .toBuffer()
  const placeId = (
    await db.pool.query("insert into wo_place(display_name) values('Synthetic restaurant') returning id")
  ).rows[0].id
  const snapshot = (
    await db.pool.query(
      "insert into wo_place_snapshot(place_id,state,published_at,enrichment_scope) values($1,'preparing',$2,'full') returning *",
      [placeId, new Date(at)]
    )
  ).rows[0]
  const media = (
    await db.pool.query(
      `insert into wo_place_media(place_id,sha256,object_key,mime,bytes,width,height,kind,source,source_url,collected_at)
       values($1,$2,'owned/object.png',$3,$4,80,60,'image','website','https://fixture.example/photo.png',$5) returning *`,
      [placeId, digest(pixels), mime, pixels.length, new Date(at - 60000)]
    )
  ).rows[0]
  await db.pool.query('insert into wo_place_snapshot_media(snapshot_id,media_id) values($1,$2)', [
    snapshot.id,
    media.id
  ])
  // Published once its parts are in: the snapshot guard (schema 0004) refuses parts added after.
  Object.assign(
    snapshot,
    (
      await db.pool.query("update wo_place_snapshot set state='published' where id=$1 returning *", [
        snapshot.id
      ])
    ).rows[0]
  )
  await db.pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [placeId, snapshot.id])
  const manifest = {
    schemaVersion: 'tracy-wo-public-snapshot-export/v1',
    snapshot,
    media: [media],
    membership: [{ snapshot_id: snapshot.id, media_id: media.id }]
  }
  const exportBytes = Buffer.from(JSON.stringify(manifest))
  const grant = {
    authorityId: 'producer-test-authority',
    bindingId: 'consumer-test-binding',
    accountId: randomUUID(),
    opportunityId: randomUUID(),
    placeId,
    snapshotId: snapshot.id,
    exportSha256: digest(exportBytes),
    expiresAt: new Date(at + 60000).toISOString(),
    media: [{ id: media.id, sha256: media.sha256 }]
  }
  const state = { grant, reads: 0, checks: 0, afterFetch: false, object: body ?? pixels }
  const config = {
    pool: db.pool,
    objects: {
      get: async (key) => {
        assert.equal(key, media.object_key)
        state.reads++
        state.afterFetch = true
        return new Response(state.object)
      }
    },
    exportBytes,
    exportSha256: digest(exportBytes),
    authorityId: grant.authorityId,
    bindingId: grant.bindingId,
    resolveGrant: async () => {
      state.checks++
      return state.grant
    },
    now: () => at,
    timeoutMs,
    ...(maxBytes ? { maxBytes } : {})
  }
  return { config, state, grant, manifest, media, snapshot, pixels, placeId }
}

test(
  'fixed snapshot read returns verified pixels and scoped receipts without leaking storage keys',
  opts,
  async () => {
    const f = await fixture()
    const reader = await createSnapshotMediaReader(f.config)
    const check = await reader.check(f.media.id)
    assert.equal(f.state.reads, 0)
    assert.equal(check.receipt.snapshotId, f.snapshot.id)
    const loaded = await reader.read(f.media.id)
    assert.deepEqual(Buffer.from(loaded.bytes), f.pixels)
    assert.equal(loaded.mime, 'image/png')
    assert.equal(loaded.width, 80)
    assert.equal(loaded.height, 60)
    for (const field of ['authorityId', 'bindingId', 'accountId', 'opportunityId', 'exportSha256', 'placeId'])
      assert.equal(loaded.receipt[field], f.grant[field])
    assert.equal(loaded.receipt.mediaId, f.media.id)
    assert.equal(loaded.receipt.sha256, digest(f.pixels))
    assert.equal(Number(loaded.receipt.bytes), f.pixels.length)
    assert.equal(f.state.reads, 1)
    assert.ok(f.state.checks >= 3, 'the read revalidates the live grant after fetching')
    for (const result of [check, loaded.receipt]) {
      const text = JSON.stringify(result)
      assert.equal(text.includes('owned/object.png'), false)
      assert.equal(text.includes('https://'), false)
    }
  }
)

test('an exported superseded snapshot stays readable after a later publication', opts, async () => {
  const f = await fixture()
  const newer = (
    await db.pool.query(
      "insert into wo_place_snapshot(place_id,state,published_at) values($1,'published',now()) returning id",
      [f.placeId]
    )
  ).rows[0]
  await db.pool.query("update wo_place_snapshot set state='superseded' where id=$1", [f.snapshot.id])
  await db.pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [f.placeId, newer.id])
  const loaded = await (await createSnapshotMediaReader(f.config)).read(f.media.id)
  assert.equal(loaded.receipt.snapshotId, f.snapshot.id)
  assert.equal(digest(loaded.bytes), f.media.sha256)
})

test('manifest tampering fails before storage access', opts, async () => {
  const f = await fixture()
  await assert.rejects(
    async () => createSnapshotMediaReader({ ...f.config, exportSha256: '0'.repeat(64) }),
    failure
  )
  const reader = await createSnapshotMediaReader(f.config)
  f.config.exportBytes.fill(0)
  f.manifest.media[0].sha256 = '0'.repeat(64)
  assert.equal((await reader.check(f.media.id)).receipt.sha256, digest(f.pixels))
  assert.equal(f.state.reads, 0)
})

test('scope, expiry and missing membership fail closed before storage access', opts, async () => {
  const f = await fixture()
  const reader = await createSnapshotMediaReader(f.config)
  for (const patch of [
    { authorityId: 'other-authority' },
    { bindingId: 'other-binding' },
    { accountId: 'not-a-uuid' },
    { snapshotId: randomUUID() },
    { placeId: randomUUID() },
    { exportSha256: '0'.repeat(64) },
    { expiresAt: new Date(at).toISOString() },
    { revokedAt: new Date(at - 1).toISOString() },
    { media: [] },
    { media: [{ id: f.media.id, sha256: '0'.repeat(64) }] }
  ]) {
    f.state.grant = { ...f.grant, ...patch }
    await assert.rejects(reader.read(f.media.id), failure)
  }
  f.state.grant = f.grant
  await assert.rejects(reader.read(randomUUID()), failure)
  await dropMembership(f.snapshot.id)
  await assert.rejects(reader.read(f.media.id), failure)
  assert.equal(f.state.reads, 0)
})

test('revocation during object retrieval prevents release of downloaded bytes', opts, async () => {
  const f = await fixture()
  f.config.objects.get = async () => {
    f.state.reads++
    await db.pool.query('update wo_place_media set revoked_at=now() where id=$1', [f.media.id])
    return new Response(f.pixels)
  }
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  assert.equal(f.state.reads, 1)
})

test('membership removal during object retrieval prevents release of downloaded bytes', opts, async () => {
  const f = await fixture()
  f.config.objects.get = async () => {
    await dropMembership(f.snapshot.id)
    return new Response(f.pixels)
  }
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
})

test('grant withdrawal and canonical read failure after download both fail closed', opts, async () => {
  const f = await fixture()
  f.config.objects.get = async () => {
    f.state.grant = null
    return new Response(f.pixels)
  }
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  f.state.grant = f.grant
  let fetched = false
  f.config.pool = {
    query: (...args) => {
      if (fetched) throw new Error('Synthetic canonical boundary unavailable')
      return db.pool.query(...args)
    }
  }
  f.config.objects.get = async () => {
    fetched = true
    return new Response(f.pixels)
  }
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
})

test('object replacement and mismatched decoded MIME never become verified images', opts, async () => {
  const f = await fixture()
  f.state.object = Buffer.from(f.pixels)
  f.state.object[0] ^= 1
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  const wrongMime = await fixture({ mime: 'image/jpeg' })
  await assert.rejects((await createSnapshotMediaReader(wrongMime.config)).read(wrongMime.media.id), failure)
})

test('oversized metadata and unsupported types are refused without an object request', opts, async () => {
  const f = await fixture({ maxBytes: 1 })
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  assert.equal(f.state.reads, 0)
  const unsupported = await fixture({ mime: 'image/gif' })
  await assert.rejects(
    (await createSnapshotMediaReader(unsupported.config)).read(unsupported.media.id),
    failure
  )
  assert.equal(unsupported.state.reads, 0)
})

test(
  'chunked bodies are bounded without Content-Length and dishonest lengths are rejected',
  opts,
  async () => {
    const f = await fixture()
    let canceled = false
    f.config.maxBytes = f.pixels.length + 1
    f.config.objects.get = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(f.pixels)
            controller.enqueue(new Uint8Array(2))
          },
          cancel() {
            canceled = true
          }
        })
      )
    await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
    assert.equal(canceled, true)
    f.config.objects.get = async () =>
      new Response(f.pixels, { headers: { 'content-length': String(f.pixels.length - 1) } })
    await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  }
)

test('object, canonical and authority reads all have a bounded deadline', opts, async () => {
  for (const boundary of ['objects', 'pool', 'grant']) {
    const f = await fixture({ timeoutMs: 30 })
    const hanging = async () => new Promise(() => {})
    if (boundary === 'objects') f.config.objects.get = hanging
    else if (boundary === 'pool') f.config.pool = { query: hanging }
    else f.config.resolveGrant = hanging
    await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  }
})

test('each cached-media check consults current canonical revocation and grant authority', opts, async () => {
  const f = await fixture()
  const reader = await createSnapshotMediaReader(f.config)
  await reader.read(f.media.id)
  await db.pool.query('update wo_place_media set revoked_at=now() where id=$1', [f.media.id])
  await assert.rejects(reader.check(f.media.id), failure)
  assert.equal(f.state.reads, 1)
})

test(
  'a grant expiring during the canonical lookup cannot authorize even a metadata check',
  opts,
  async () => {
    const f = await fixture()
    let clock = at
    f.config.now = () => clock
    f.config.pool = {
      query: async (...args) => {
        const answer = await db.pool.query(...args)
        clock = at + 60000
        return answer
      }
    }
    await assert.rejects((await createSnapshotMediaReader(f.config)).check(f.media.id), failure)
    assert.equal(f.state.reads, 0)
  }
)

test('body deadlines cancel a stalled stream and cancel a response arriving after expiry', opts, async () => {
  const f = await fixture({ timeoutMs: 30 })
  let canceled = false
  f.config.objects.get = async () =>
    new Response(
      new ReadableStream({
        cancel() {
          canceled = true
        }
      })
    )
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  assert.equal(canceled, true)

  let release, confirmCancellation
  const response = new Promise((resolve) => {
    release = resolve
  })
  const cancellation = new Promise((resolve) => {
    confirmCancellation = resolve
  })
  f.config.objects.get = async () => response
  await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
  release(
    new Response(
      new ReadableStream({
        cancel() {
          confirmCancellation(true)
        }
      })
    )
  )
  // Waits for the cancel itself: a 100 ms race lost on a loaded CI runner; a cancel that never comes hits the test timeout.
  assert.equal(await cancellation, true)
})

test(
  'authority resolving after the deadline cannot start a canonical lookup or object request',
  opts,
  async () => {
    const f = await fixture({ timeoutMs: 30 })
    let release,
      canonicalCalls = 0
    const grant = new Promise((resolve) => {
      release = resolve
    })
    f.config.resolveGrant = async () => grant
    f.config.pool = {
      query: (...args) => {
        canonicalCalls++
        return db.pool.query(...args)
      }
    }
    await assert.rejects((await createSnapshotMediaReader(f.config)).read(f.media.id), failure)
    release(f.grant)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(canonicalCalls, 0)
    assert.equal(f.state.reads, 0)
  }
)
