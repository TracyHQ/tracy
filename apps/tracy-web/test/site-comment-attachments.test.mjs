/**
 * Files attached to site comments (contract `tasks/evidence/comment-people/attachments-contract.md`):
 * table `site_comment_attachment`, the doors `POST /api/sites/:key/comments/attachments` and
 * `GET /api/sites/:key/comments/attachments/:id` (`src/sites/comment-attachments.js`), and
 * `attachments` on the comment doors (`src/sites/comments.js`).
 *
 * Every case goes through `buildApp` against Postgres. The artifact store is a fake S3 behind
 * `fetchImpl` that keeps objects in a Map and checks every call is SigV4-signed for its bucket — so the
 * seat gate, the mount lines, the migration and the store calls are covered together.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { LOOSE_TTL_MS, MAX_ATTACHMENT_BYTES, sweepSite } from '../src/sites/comment-attachments.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { createSite } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'
import { answerAddSiteHold, laneSeatDoor } from './_add-site-hold.mjs'
import { answerTeardown } from './_host-teardown.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const SECRET = 's'.repeat(32)
const SITE = 'lantern.example'
const OTHER = 'harbor.example'
const S3 = 'http://store.test:9000'
const BUCKET = 'tracy-artifacts'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

/** An S3 that keeps objects in memory and refuses unsigned calls or calls outside its bucket. */
function fakeStore() {
  const objects = new Map()
  const calls = []
  let failPuts = false
  let failDeletes = false
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(String(input))
    const method = init.method ?? 'GET'
    assert.equal(u.origin, S3, 'only the artifact store is dialled')
    assert.ok(u.pathname.startsWith(`/${BUCKET}/`), 'inside the bucket')
    const signed =
      u.searchParams.has('X-Amz-Signature') || /AWS4-HMAC-SHA256/.test(init.headers?.authorization ?? '')
    assert.ok(signed, 'every store call is signed')
    const key = decodeURIComponent(u.pathname.slice(BUCKET.length + 2))
    calls.push({ method, key })
    if (method === 'PUT') {
      if (failPuts) return new Response('nope', { status: 500 })
      const bytes = new Uint8Array(await new Response(init.body).arrayBuffer())
      objects.set(key, bytes)
      return new Response('', { status: 200 })
    }
    if (method === 'GET') {
      const bytes = objects.get(key)
      return bytes ? new Response(bytes, { status: 200 }) : new Response('<NoSuchKey/>', { status: 404 })
    }
    if (method === 'DELETE') {
      if (failDeletes) return new Response('nope', { status: 500 })
      objects.delete(key)
      // A 204 carries no body: `new Response('', {status: 204})` throws, which once made every
      // delete here look like an error the old `deleteObjects` swallowed (#676).
      return new Response(null, { status: 204 })
    }
    throw new Error(`unexpected ${method}`)
  }
  return {
    objects,
    calls,
    fetchImpl,
    failNextPuts: (on = true) => (failPuts = on),
    failDeletes: (on = true) => (failDeletes = on)
  }
}

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function world(t, { store = true, otherHosts = false } = {}) {
  const { pool } = db
  const cfg = readConfig({
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: SECRET,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k',
    ...(store
      ? {
          ARTIFACT_S3_ENDPOINT: S3,
          ARTIFACT_S3_BUCKET: BUCKET,
          ARTIFACT_S3_ACCESS_KEY: 'ak',
          ARTIFACT_S3_SECRET_KEY: 'sk'
        }
      : {})
  })
  await createSite(pool, { siteKey: SITE, label: 'lantern', host: 'local' })
  await createSite(pool, { siteKey: OTHER, label: 'harbor', host: 'local' })
  const seat = async (email, siteKey, role) => {
    const { rows } = await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [siteKey, rows[0].id, role]
    )
    return rows[0].id
  }
  await seat('owner@x.y', SITE, 'owner')
  await seat('editor@x.y', SITE, 'editor')
  await seat('stranger@x.y', OTHER, 'owner')
  const s3 = fakeStore()
  let clock = Date.now()
  const app = buildApp({
    config: cfg,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, cfg),
    host: { hostCall, hostJob },
    // `otherHosts`: a site teardown also dials tracy-host and the dsh. The host takes the site off
    // itself (the row goes only on its word); everything else answers 404 here, and every call to
    // the store is still checked by the fake S3.
    fetchImpl: otherHosts
      ? async (input, init) =>
          new URL(String(input)).origin === S3
            ? s3.fetchImpl(input, init)
            : (answerTeardown(input, init) ??
              answerAddSiteHold(input, init) ??
              new Response('', { status: 404 }))
      : s3.fetchImpl,
    // An unfinished import's release asks the host that ran its read (`sites/import-remove.js`).
    seatDoor: laneSeatDoor,
    now: () => clock
  })
  const cookie = async (email) => (email ? { cookie: `tracy_sess=${await mintSession(email, SECRET)}` } : {})
  const call = async (email, method, path, body) => {
    const headers = await cookie(email)
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    )
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const upload = async (
    email,
    file = new File([PNG], 'shot.png', { type: 'image/png' }),
    siteKey = SITE,
    headers = {}
  ) => {
    const form = new FormData()
    if (file) form.set('file', file)
    const res = await app.fetch(
      new Request(`http://tracy.test/api/sites/${siteKey}/comments/attachments`, {
        method: 'POST',
        headers: { ...(await cookie(email)), ...headers },
        body: form
      })
    )
    return { status: res.status, body: await res.json() }
  }
  const download = async (email, path, headers = {}) =>
    app.fetch(new Request(`http://tracy.test${path}`, { headers: { ...(await cookie(email)), ...headers } }))
  const base = `/api/sites/${SITE}/comments`
  const post = (email, body) =>
    call(email, 'POST', base, { url: 'http://lantern.localhost/', text: 'Look', ...body })
  return { pool, s3, call, upload, download, post, base, advance: (ms) => (clock += ms) }
}

test('upload then attach: every seat sees the file on the comment and can open it', opts, async (t) => {
  const { upload, post, call, download, base } = await world(t)
  const up = await upload('owner@x.y')
  assert.equal(up.status, 201)
  const { id } = up.body.attachment
  assert.deepEqual(up.body.attachment, {
    id,
    name: 'shot.png',
    size: PNG.length,
    type: 'image/png',
    url: `/api/sites/${SITE}/comments/attachments/${id}`
  })

  const made = await post('owner@x.y', { attachments: [id] })
  assert.equal(made.status, 201)
  assert.deepEqual(made.body.comment.attachments, [up.body.attachment])

  const listed = await call('editor@x.y', 'GET', base)
  assert.deepEqual(listed.body.comments[0].attachments, [up.body.attachment])
  assert.deepEqual(listed.body.attachments, { enabled: true, maxBytes: MAX_ATTACHMENT_BYTES, maxFiles: 20 })

  const res = await download('editor@x.y', up.body.attachment.url)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/png')
  assert.match(res.headers.get('content-disposition'), /^inline; /)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.match(res.headers.get('cache-control'), /private/)
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG)
})

// #662: the browser's own upload (multipart, `Sec-Fetch-Site: same-origin`) is the one non-JSON
// body this door takes; the same upload from a customer page (`same-site`) is refused before a byte
// reaches the store.
test(
  'a browser upload from Tracy’s origin lands; the same upload from another origin does not',
  opts,
  async (t) => {
    const w = await world(t)
    const png = () => new File([PNG], 'shot.png', { type: 'image/png' })
    const ours = await w.upload('owner@x.y', png(), SITE, {
      origin: 'http://tracy.test:8080',
      'sec-fetch-site': 'same-origin'
    })
    assert.equal(ours.status, 201)
    const theirs = await w.upload('owner@x.y', png(), SITE, {
      origin: 'http://lantern.localhost:8080',
      'sec-fetch-site': 'same-site'
    })
    assert.equal(theirs.status, 403)
    assert.deepEqual(theirs.body, { code: 'CSRF_ORIGIN' })
    const { rows } = await w.pool.query('select count(*)::int as n from site_comment_attachment')
    assert.equal(rows[0].n, 1)
    assert.equal(w.s3.objects.size, 1)
  }
)

test('a comment without files carries an empty list', opts, async (t) => {
  const { post } = await world(t)
  const made = await post('owner@x.y', {})
  assert.deepEqual(made.body.comment.attachments, [])
})

test('a file that is not an image downloads under its own name', opts, async (t) => {
  const { upload, post, download } = await world(t)
  const up = await upload(
    'owner@x.y',
    new File(['<svg onload=alert(1)/>'], 'Bản vẽ "1".svg', { type: 'image/svg+xml' })
  )
  assert.equal(up.status, 201)
  assert.equal(up.body.attachment.name, 'Bản vẽ 1.svg', 'quotes stripped, letters kept')
  await post('owner@x.y', { attachments: [up.body.attachment.id] })
  const res = await download('owner@x.y', up.body.attachment.url)
  assert.equal(res.headers.get('content-type'), 'image/svg+xml')
  assert.equal(
    res.headers.get('content-disposition'),
    `attachment; filename="B_n v_ 1.svg"; filename*=UTF-8''${encodeURIComponent('Bản vẽ 1.svg')}`
  )
  assert.match(res.headers.get('content-security-policy'), /sandbox/)
})

test('the seat gate holds on both doors, and a file of one site is unknown on another', opts, async (t) => {
  const { upload, download, post } = await world(t)
  assert.equal((await upload(null)).status, 401)
  assert.equal((await upload('stranger@x.y')).body.code, 'SEAT_NOT_AUTHORIZED')

  const up = await upload('owner@x.y')
  // On a live comment, so the 404 below is the site check and not the loose-upload rule.
  await post('owner@x.y', { attachments: [up.body.attachment.id] })
  assert.equal((await download(null, up.body.attachment.url)).status, 401)
  assert.equal((await download('stranger@x.y', up.body.attachment.url)).status, 403)
  const other = await download(
    'stranger@x.y',
    `/api/sites/${OTHER}/comments/attachments/${up.body.attachment.id}`
  )
  assert.equal(other.status, 404)
  assert.equal((await other.json()).code, 'ATTACHMENT_NOT_FOUND')

  // Attaching another site's upload is refused the same way.
  const theirs = await upload('stranger@x.y', undefined, OTHER)
  const refused = await post('owner@x.y', { attachments: [theirs.body.attachment.id] })
  assert.equal(refused.status, 404)
  assert.equal(refused.body.code, 'ATTACHMENT_NOT_FOUND')
  assert.deepEqual(refused.body.ids, [theirs.body.attachment.id])
  assert.ok(refused.body.next)
})

test('object keys are chosen by the server, outside the artifact door prefix', opts, async (t) => {
  const { upload, s3 } = await world(t)
  const up = await upload('owner@x.y')
  const put = s3.calls.find((c) => c.method === 'PUT')
  assert.equal(put.key, `comments/lantern-example/${up.body.attachment.id}`)
  assert.ok(!put.key.startsWith('sites/'))
})

test('refusals: no file, too large, store off, store failing', opts, async (t) => {
  const w = await world(t)
  const none = await w.upload('owner@x.y', null)
  assert.equal(none.status, 400)
  assert.equal(none.body.code, 'ATTACHMENT_BAD_INPUT')
  assert.ok(none.body.next)

  const big = await w.upload('owner@x.y', new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.bin'))
  assert.equal(big.status, 413)
  assert.equal(big.body.code, 'ATTACHMENT_TOO_LARGE')
  assert.equal(big.body.limit, MAX_ATTACHMENT_BYTES)

  w.s3.failNextPuts()
  const failed = await w.upload('owner@x.y')
  assert.equal(failed.status, 502)
  assert.equal(failed.body.code, 'ATTACHMENT_STORE_FAILED')
  const { rows } = await w.pool.query('select count(*)::int as n from site_comment_attachment')
  assert.equal(rows[0].n, 0, 'no row for a file the store did not keep')
})

test(
  'without an artifact store the upload says so and the list says attachments are off',
  opts,
  async (t) => {
    const { upload, call, base } = await world(t, { store: false })
    const up = await upload('owner@x.y')
    assert.equal(up.status, 503)
    assert.equal(up.body.code, 'ATTACHMENT_STORE_UNAVAILABLE')
    const listed = await call('owner@x.y', 'GET', base)
    assert.equal(listed.body.attachments.enabled, false)
  }
)

test('one upload belongs to one comment; a comment carries at most 20', opts, async (t) => {
  const { upload, post } = await world(t)
  const up = await upload('owner@x.y')
  assert.equal((await post('owner@x.y', { attachments: [up.body.attachment.id] })).status, 201)
  const again = await post('editor@x.y', { attachments: [up.body.attachment.id] })
  assert.equal(again.status, 409)
  assert.equal(again.body.code, 'ATTACHMENT_IN_USE')

  const many = []
  for (let i = 0; i < 21; i++) many.push((await upload('owner@x.y')).body.attachment.id)
  const over = await post('owner@x.y', { attachments: many })
  assert.equal(over.status, 409)
  assert.equal(over.body.code, 'ATTACHMENT_LIMIT')

  const bad = await post('owner@x.y', { attachments: 'nope' })
  assert.equal(bad.body.code, 'COMMENT_BAD_INPUT')
  assert.equal(bad.body.field, 'attachments')
})

test('a reply carries its own files; PATCH replaces the list, author only', opts, async (t) => {
  const { upload, post, call, base } = await world(t)
  const first = await post('owner@x.y', {})
  const a = (await upload('editor@x.y')).body.attachment
  const b = (await upload('editor@x.y', new File(['hello'], 'notes.txt', { type: 'text/plain' }))).body
    .attachment
  const reply = await post('editor@x.y', { replyTo: first.body.comment.id, attachments: [a.id, b.id] })
  assert.equal(reply.status, 201)
  assert.deepEqual(
    reply.body.comment.attachments.map((f) => f.name),
    ['shot.png', 'notes.txt']
  )

  const id = reply.body.comment.id
  const foreign = await call('owner@x.y', 'PATCH', `${base}/${id}`, { attachments: [] })
  assert.equal(foreign.body.code, 'COMMENT_NOT_YOURS')

  const reordered = await call('editor@x.y', 'PATCH', `${base}/${id}`, { attachments: [b.id] })
  assert.equal(reordered.status, 200)
  assert.deepEqual(reordered.body.comment.attachments, [b])
  assert.equal(reordered.body.comment.text, 'Look', 'files alone may change')

  const c = (await upload('editor@x.y')).body.attachment
  const both = await call('editor@x.y', 'PATCH', `${base}/${id}`, {
    text: 'Look again',
    attachments: [c.id, b.id]
  })
  assert.deepEqual(
    both.body.comment.attachments.map((f) => f.id),
    [c.id, b.id]
  )
  // `a` left the comment: loose again, attachable elsewhere.
  assert.equal((await post('editor@x.y', { attachments: [a.id] })).status, 201)
})

test(
  'a deleted comment stops serving its files at once; the sweep removes them a day later',
  opts,
  async (t) => {
    const { upload, post, call, download, base, pool, s3, advance } = await world(t)
    const up = (await upload('owner@x.y')).body.attachment
    const made = await post('owner@x.y', { attachments: [up.id] })
    const gone = await call('owner@x.y', 'DELETE', `${base}/${made.body.comment.id}`)
    assert.deepEqual(gone.body.comment.attachments, [])
    assert.equal((await download('owner@x.y', up.url)).status, 404)
    assert.ok(s3.objects.has(`comments/lantern-example/${up.id}`), 'kept for now')

    const store = { endpoint: S3, bucket: BUCKET, accessKey: 'ak', secretKey: 'sk' }
    assert.deepEqual(await sweepSite(pool, store, SITE, Date.now(), s3.fetchImpl), [], 'not before a day')
    advance(LOOSE_TTL_MS + 1000)
    await pool.query(`update site_comment set deleted_at = now() - interval '25 hours'`)
    // The next upload on the site sweeps.
    await upload('owner@x.y')
    assert.ok(!s3.objects.has(`comments/lantern-example/${up.id}`))
    const { rows } = await pool.query('select purged_at from site_comment_attachment where id = $1', [up.id])
    assert.ok(rows[0].purged_at, 'the row stays, marked purged')
  }
)

test('a file removed from a comment stops downloading at once, even from a cached copy', opts, async (t) => {
  const { upload, post, call, download, base } = await world(t)
  const a = (await upload('owner@x.y')).body.attachment
  const b = (await upload('owner@x.y', new File(['hello'], 'notes.txt', { type: 'text/plain' }))).body
    .attachment
  assert.equal((await download('owner@x.y', a.url)).status, 404, 'an upload on no comment is not served')
  const made = (await post('owner@x.y', { attachments: [a.id, b.id] })).body.comment

  const first = await download('editor@x.y', a.url)
  assert.equal(first.status, 200)
  assert.match(first.headers.get('cache-control'), /private/)
  assert.match(first.headers.get('cache-control'), /no-cache/, 'every use asks the server again')
  const etag = first.headers.get('etag')
  assert.ok(etag, 'an ETag, so asking again costs no bytes')
  const again = await download('editor@x.y', a.url, { 'if-none-match': etag })
  assert.equal(again.status, 304)

  await call('owner@x.y', 'PATCH', `${base}/${made.id}`, { attachments: [b.id] })
  for (const who of ['owner@x.y', 'editor@x.y']) {
    assert.equal((await download(who, a.url)).status, 404, `${who}: removed means gone`)
    assert.equal((await download(who, a.url, { 'if-none-match': etag })).status, 404, 'no 304 either')
  }
  assert.equal((await download('editor@x.y', b.url)).status, 200, 'the file still on it is served')
  // Put back (on any comment) it is served again: the object stays for the day the sweep waits.
  await post('owner@x.y', { attachments: [a.id] })
  assert.equal((await download('owner@x.y', a.url)).status, 200)
})

test(
  'only PNG, JPEG, GIF and WebP open inline; every other type downloads under its name',
  opts,
  async (t) => {
    const { upload, post, download } = await world(t)
    const cases = [
      ['a.png', 'image/png', 'inline'],
      ['a.jpg', 'image/jpeg', 'inline'],
      ['a.gif', 'image/gif', 'inline'],
      ['a.webp', 'image/webp', 'inline'],
      ['Báo giá.pdf', 'application/pdf', 'attachment'],
      ['notes.txt', 'text/plain', 'attachment'],
      ['page.html', 'text/html', 'attachment'],
      ['tool.exe', 'application/octet-stream', 'attachment']
    ]
    const ups = []
    for (const [name, type] of cases)
      ups.push((await upload('owner@x.y', new File(['x'], name, { type }))).body.attachment)
    await post('owner@x.y', { attachments: ups.map((u) => u.id) })
    for (const [i, [name, , kind]] of cases.entries()) {
      const res = await download('owner@x.y', ups[i].url)
      const header = res.headers.get('content-disposition')
      assert.ok(header.startsWith(`${kind}; `), `${name}: ${header}`)
      assert.ok(header.includes(`filename*=UTF-8''${encodeURIComponent(name)}`), `${name}: ${header}`)
    }
  }
)

test('an upload nobody attaches within a day is swept, row and object', opts, async (t) => {
  const { upload, pool, s3 } = await world(t)
  const stray = (await upload('owner@x.y')).body.attachment
  assert.ok(
    s3.objects.has(`comments/lantern-example/${stray.id}`),
    'stored under the key the sweep looks for'
  )
  await pool.query(
    `update site_comment_attachment set created_at = now() - interval '25 hours' where id = $1`,
    [stray.id]
  )
  await upload('owner@x.y')
  assert.ok(!s3.objects.has(`comments/lantern-example/${stray.id}`))
  const { rows } = await pool.query('select 1 from site_comment_attachment where id = $1', [stray.id])
  assert.equal(rows.length, 0)
})

/** `s3.fetchImpl` with every DELETE answered by `onDelete(key)` first; it returns a Response to use
 * instead of the store's own, or nothing to let the store answer. */
function withDeletes(s3, onDelete) {
  return async (input, init = {}) => {
    if ((init.method ?? 'GET') === 'DELETE') {
      const key = decodeURIComponent(new URL(String(input)).pathname.slice(BUCKET.length + 2))
      const answer = await onDelete(key)
      if (answer) return answer
    }
    return s3.fetchImpl(input, init)
  }
}

const STORE = { endpoint: S3, bucket: BUCKET, accessKey: 'ak', secretKey: 'sk' }

test(
  'a store delete that fails, errors or never answers keeps the row for the next sweep; a retry, 204 or 404 lets it go (#676)',
  opts,
  async (t) => {
    const { upload, post, call, base, pool, s3 } = await world(t)
    const stray = (await upload('owner@x.y')).body.attachment
    const onComment = (await upload('owner@x.y')).body.attachment
    const made = (await post('owner@x.y', { attachments: [onComment.id] })).body.comment
    assert.equal((await call('owner@x.y', 'DELETE', `${base}/${made.id}`)).status, 200)
    await pool.query(`update site_comment_attachment set created_at = now() - interval '25 hours'`)
    await pool.query(`update site_comment set deleted_at = now() - interval '25 hours'`)
    const keyOf = (id) => `comments/lantern-example/${id}`
    const rows = async () =>
      (await pool.query('select id, purged_at from site_comment_attachment order by id')).rows

    const failures = [
      ['the store refuses (500)', async () => new Response('nope', { status: 500 })],
      ['the store forbids (403)', async () => new Response('denied', { status: 403 })],
      [
        'the call throws',
        async () => {
          throw new TypeError('fetch failed')
        }
      ]
    ]
    for (const [label, answer] of failures) {
      const swept = await sweepSite(pool, STORE, SITE, Date.now(), withDeletes(s3, answer))
      assert.deepEqual(swept, [], `${label}: nothing reported swept`)
      const left = await rows()
      assert.deepEqual(
        left.map((r) => r.id),
        [stray.id, onComment.id].sort(),
        `${label}: both rows kept`
      )
      assert.ok(
        left.every((r) => r.purged_at === null),
        `${label}: neither marked purged`
      )
      assert.ok(s3.objects.has(keyOf(stray.id)) && s3.objects.has(keyOf(onComment.id)), label)
    }

    // The next sweep, with the store answering again, finishes both.
    const swept = await sweepSite(pool, STORE, SITE, Date.now(), s3.fetchImpl)
    assert.deepEqual([...swept].sort(), [stray.id, onComment.id].sort())
    assert.ok(!s3.objects.has(keyOf(stray.id)) && !s3.objects.has(keyOf(onComment.id)))
    const after = await rows()
    assert.deepEqual(
      after.map((r) => r.id),
      [onComment.id],
      'the loose row is deleted'
    )
    assert.ok(after[0].purged_at, "the deleted comment's row is marked purged")

    // An object the store no longer has (404) is gone too.
    const already = (await upload('owner@x.y')).body.attachment
    await pool.query(
      `update site_comment_attachment set created_at = now() - interval '25 hours' where id = $1`,
      [already.id]
    )
    s3.objects.delete(keyOf(already.id))
    const notFound = withDeletes(s3, async () => new Response('<NoSuchKey/>', { status: 404 }))
    assert.deepEqual(await sweepSite(pool, STORE, SITE, Date.now(), notFound), [already.id])
    assert.equal(
      (await pool.query('select 1 from site_comment_attachment where id = $1', [already.id])).rows.length,
      0
    )
  }
)

test(
  'the sweep never deletes the row of a file a comment took while the sweep ran (#676)',
  opts,
  async (t) => {
    const { upload, post, pool, s3 } = await world(t)
    const late = (await upload('owner@x.y')).body.attachment
    const other = (await upload('owner@x.y')).body.attachment
    await pool.query(`update site_comment_attachment set created_at = now() - interval '25 hours'`)
    const comment = (await post('owner@x.y', { text: 'takes a file later' })).body.comment
    // Between the sweep's select and its row delete: the store call for `late` is the moment a
    // comment write attaches it (the same update `setCommentAttachments` runs).
    let attachedMidSweep = false
    const racing = withDeletes(s3, async (key) => {
      if (key !== `comments/lantern-example/${late.id}`) return
      const { rowCount } = await pool.query(
        `update site_comment_attachment set comment_id = $2, position = 0
          where id = $1 and comment_id is null and purged_at is null`,
        [late.id, comment.id]
      )
      attachedMidSweep = rowCount === 1
    })

    const swept = await sweepSite(pool, STORE, SITE, Date.now(), racing)
    assert.ok(attachedMidSweep, 'the attach landed during the sweep')
    assert.deepEqual(swept, [other.id], 'only the file still loose is reported swept')
    const { rows } = await pool.query(
      'select id, comment_id, purged_at from site_comment_attachment order by id'
    )
    assert.deepEqual(rows, [{ id: late.id, comment_id: comment.id, purged_at: null }])
  }
)

test(
  'two sweeps over the same files: only the one that changed a row reports it swept (#676)',
  opts,
  async (t) => {
    const { upload, post, call, base, pool, s3 } = await world(t)
    const stray = (await upload('owner@x.y')).body.attachment
    const onComment = (await upload('owner@x.y')).body.attachment
    const made = (await post('owner@x.y', { attachments: [onComment.id] })).body.comment
    assert.equal((await call('owner@x.y', 'DELETE', `${base}/${made.id}`)).status, 200)
    await pool.query(`update site_comment_attachment set created_at = now() - interval '25 hours'`)
    await pool.query(`update site_comment set deleted_at = now() - interval '25 hours'`)
    // Sweep A selects both rows; its first store call is the moment sweep B runs start to finish.
    let inner = null
    let stampedByB = null
    const racing = withDeletes(s3, async () => {
      if (inner) return
      inner = await sweepSite(pool, STORE, SITE, Date.now(), s3.fetchImpl)
      ;({
        rows: [{ purged_at: stampedByB }]
      } = await pool.query('select purged_at from site_comment_attachment where id = $1', [onComment.id]))
    })

    const outer = await sweepSite(pool, STORE, SITE, Date.now(), racing)
    assert.deepEqual([...inner].sort(), [stray.id, onComment.id].sort(), 'sweep B swept both')
    assert.deepEqual(outer, [], 'sweep A changed no row, so reports none')
    const { rows } = await pool.query('select id, purged_at from site_comment_attachment order by id')
    assert.deepEqual(
      rows.map((r) => r.id),
      [onComment.id]
    )
    assert.ok(stampedByB, 'sweep B marked the deleted comment’s file purged')
    assert.deepEqual(rows[0].purged_at, stampedByB, 'sweep A did not stamp it again')
  }
)

test('deleting a site removes its comment files, rows and objects, and no other site’s', opts, async (t) => {
  const { upload, post, pool, s3, call } = await world(t, { otherHosts: true })
  const attached = (await upload('owner@x.y')).body.attachment
  assert.equal((await post('owner@x.y', { attachments: [attached.id] })).status, 201)
  const loose = (await upload('editor@x.y')).body.attachment
  const theirs = (await upload('stranger@x.y', undefined, OTHER)).body.attachment
  const keys = {
    attached: `comments/lantern-example/${attached.id}`,
    loose: `comments/lantern-example/${loose.id}`,
    theirs: `comments/harbor-example/${theirs.id}`
  }
  for (const key of Object.values(keys)) assert.ok(s3.objects.has(key), key)

  const removed = await call('owner@x.y', 'DELETE', `/api/sites/${SITE}`)
  assert.equal(removed.status, 200)
  assert.equal(removed.body.removed, true)
  assert.ok(!s3.objects.has(keys.attached), 'a file on a comment goes with the site')
  assert.ok(!s3.objects.has(keys.loose), 'an upload nobody attached goes too')
  assert.ok(s3.objects.has(keys.theirs), 'another site keeps its files')
  const { rows } = await pool.query('select site_key from site_comment_attachment')
  assert.deepEqual(
    rows.map((r) => r.site_key),
    [OTHER]
  )
})

test(
  'a store that will not delete never keeps the site alive; the stray keys are logged',
  opts,
  async (t) => {
    const { upload, post, pool, s3, call } = await world(t, { otherHosts: true })
    const attached = (await upload('owner@x.y')).body.attachment
    assert.equal((await post('owner@x.y', { attachments: [attached.id] })).status, 201)
    const warned = []
    t.mock.method(console, 'warn', (...args) => warned.push(args.join(' ')))
    s3.failDeletes(true)
    const removed = await call('owner@x.y', 'DELETE', `/api/sites/${SITE}`)
    assert.equal(removed.status, 200)
    assert.equal(removed.body.removed, true)
    const { rows } = await pool.query('select 1 from site where site_key = $1', [SITE])
    assert.equal(rows.length, 0, 'the site row is gone')
    assert.ok(s3.objects.has(`comments/lantern-example/${attached.id}`), 'the object the store kept')
    assert.ok(
      warned.some((line) => line.includes(`comments/lantern-example/${attached.id}`)),
      warned.join('\n')
    )
  }
)

test('an import released before any build drops its comment files too', opts, async (t) => {
  const { upload, pool, s3, call } = await world(t, { otherHosts: true })
  await pool.query(`update site set origin = 'migrated' where site_key = $1`, [SITE])
  const loose = (await upload('owner@x.y')).body.attachment
  const released = await call('owner@x.y', 'DELETE', `/api/sites/${SITE}/claim`)
  assert.equal(released.status, 200)
  assert.ok(!s3.objects.has(`comments/lantern-example/${loose.id}`))
})
