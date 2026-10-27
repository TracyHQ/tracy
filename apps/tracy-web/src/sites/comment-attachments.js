/**
 * Files attached to a site comment ("Comment → edit" stage 6, contract
 * `tasks/evidence/comment-people/attachments-contract.md`). Table `site_comment_attachment`
 * (`041-site-comment-attachment.sql`); bytes in the artifact store (`config.artifactStore`, MinIO on
 * a local stand, R2 on a server).
 *
 *   POST /api/sites/:key/comments/attachments      multipart `file` → 201 {attachment}
 *   GET  /api/sites/:key/comments/attachments/:id  → the bytes (seat-authed, never a public URL)
 *
 * A comment then names its files by id: `POST`/`PATCH /api/sites/:key/comments` with
 * `attachments: [id…]` (`sites/comments.js` calls `attach` below inside its own transaction).
 *
 * 🔒 THIS DOOR CARRIES THE BYTES, unlike the artifact door (`sites/artifacts.js`: "this relay signs,
 * it never carries bytes"). That rule is about 300 MB webroots; a comment file is capped at
 * `MAX_ATTACHMENT_BYTES`. And a signed store URL cannot serve here either way: the browser that
 * shows a thumbnail cannot reach a stand's MinIO (`host.docker.internal`), R2 would need CORS for
 * every site origin, and a signed GET is a public URL for its lifetime — the contract says every
 * read goes through the seat check.
 *
 * Object keys are chosen HERE (`comments/<label>/<uuid>`), outside the `sites/<label>/` prefix the
 * artifact door lets any seat `fetch` or `delete` by key.
 */
import { json, normalizeSiteKey } from '../lib/http.js'
import { presign, signedCall } from './artifacts.js'
import { labelPrefix } from './label.js'
import { audit } from './store.js'

/** One file: the dsh composer's own cap for one image (`DEFAULT_MAX_IMAGE_BYTES`, contract § A/C). */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
/** Files on one comment: the composer's cap for images in one message (`DEFAULT_MAX_IMAGES_PER_MESSAGE`). */
export const MAX_ATTACHMENTS_PER_COMMENT = 20
/** An upload nobody attached to a comment within this long is purged. */
export const LOOSE_TTL_MS = 24 * 60 * 60 * 1000
/** Signed store URLs are used by this process at once; they never leave it. */
const STORE_URL_TTL_S = 60
const MAX_NAME = 255
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A media type as `type/subtype`, parameters dropped. */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/
/** Shown inline (thumbnail, opened in the tab). Everything else downloads. SVG is not here: it can
 * carry script, and it is served from the same origin as the seat cookie. */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export const ATTACHMENT_NEXT = {
  ATTACHMENT_NOT_FOUND:
    'Upload the file again with POST /api/sites/:key/comments/attachments; this id is unknown on this site or its file was removed.',
  ATTACHMENT_TOO_LARGE: `Send a smaller file; one attachment may be at most ${MAX_ATTACHMENT_BYTES} bytes.`,
  ATTACHMENT_IN_USE: 'This file already belongs to another comment; upload it again to attach it here.',
  ATTACHMENT_LIMIT: `Remove some files; one comment may carry at most ${MAX_ATTACHMENTS_PER_COMMENT}.`,
  ATTACHMENT_STORE_UNAVAILABLE:
    'Attachments are off on this server (no artifact store configured); send the comment without files.',
  ATTACHMENT_STORE_FAILED: 'The file store did not answer; try again in a moment.',
  ATTACHMENT_BAD_INPUT: 'Send the file as multipart/form-data in a field named `file`.'
}

function refuse(c, code, status, extra = {}) {
  return json(c, { code, next: ATTACHMENT_NEXT[code], ...extra }, status)
}

/** The wire shape of one file on a comment; `url` is this server's own seat-authed door. */
export function attachmentShape(siteKey, row) {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    type: row.type,
    url: `/api/sites/${encodeURIComponent(siteKey)}/comments/attachments/${row.id}`
  }
}

/** A person's file name, kept readable but never a path or a header breaker. */
export function cleanName(raw) {
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()
    // Control characters and `"` would break the `content-disposition` header the file is served with.
    .split('')
    .filter((ch) => ch !== '"' && ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .trim()
  const name = base || 'file'
  if (name.length <= MAX_NAME) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : ''
  return name.slice(0, MAX_NAME - ext.length) + ext
}

/** The file's declared media type, or `application/octet-stream` when it declares none we accept. */
export function cleanType(raw) {
  const t = String(raw ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  return MEDIA_TYPE.test(t) ? t : 'application/octet-stream'
}

/** `Content-Disposition` for a download: ASCII fallback plus the RFC 5987 UTF-8 name. */
export function disposition(kind, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

async function putObject(store, key, bytes, type, fetchImpl) {
  const url = await presign(store, { method: 'PUT', key, expiresIn: STORE_URL_TTL_S })
  return fetchImpl(url, { method: 'PUT', headers: { 'content-type': type }, body: bytes })
}

/** Delete each key from the store; false as soon as one is not confirmed gone (a refusal, an error,
 * no answer), so the caller keeps that row and the next sweep tries again (#676). A 404 is gone. */
async function deleteObjects(store, keys, fetchImpl) {
  for (const key of keys) {
    const res = await signedCall(store, { method: 'DELETE', key }, fetchImpl).catch(() => null)
    if (!res || (!res.ok && res.status !== 404)) return false
  }
  return true
}

/**
 * The sweep, run after each upload so the site that leaves strays is the one that pays for them:
 * uploads on this site nobody attached within `LOOSE_TTL_MS` (rows deleted), and files of comments
 * deleted more than `LOOSE_TTL_MS` ago (rows kept, `purged_at` set — the comment's placeholder
 * still says who wrote it). Objects first; a row is only let go once its object is.
 * @returns the ids swept, for tests.
 */
export async function sweepSite(pool, store, siteKey, now, fetchImpl = fetch) {
  const before = new Date(now - LOOSE_TTL_MS)
  const { rows } = await pool.query(
    `select f.id, f.object_key, f.comment_id from site_comment_attachment f
       left join site_comment c on c.id = f.comment_id
      where f.site_key = $1 and f.purged_at is null
        and ((f.comment_id is null and f.created_at < $2) or c.deleted_at < $2)
      limit 50`,
    [siteKey, before]
  )
  const swept = []
  for (const row of rows) {
    if (!(await deleteObjects(store, [row.object_key], fetchImpl))) continue
    // Each write re-checks the state the select saw: another sweep may have finished this row
    // since, and a comment may have taken a loose file (its row stays). Only a row this sweep
    // actually changed is reported swept.
    const { rowCount } = row.comment_id
      ? await pool.query(
          'update site_comment_attachment set purged_at = now() where id = $1 and purged_at is null',
          [row.id]
        )
      : await pool.query(
          `delete from site_comment_attachment where id = $1 and comment_id is null and purged_at is null`,
          [row.id]
        )
    if (rowCount !== 1) continue
    swept.push(row.id)
  }
  return swept
}

/**
 * A site being deleted takes its comment files with it: every object of the site in the store, then
 * the rows whose object went. Called right BEFORE the site row is erased (`deleteSite`): the rows
 * cascade away with it, and they are the only record of which keys the site used.
 *
 * 🔒 BEST-EFFORT, NEVER IN THE WAY OF THE DELETION. It never throws; a store that is off or refuses
 * a delete leaves that object behind and says so with its key in the log (`console.warn`), since
 * once the row is gone nothing else could find it. The deletion goes on either way.
 * @param {import('pg').Pool} pool
 * @param {object | null} store - `config.artifactStore`
 * @param {string} siteKey
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{removed: number, kept: string[]}>} kept: object keys still in the store.
 */
export async function forgetSiteAttachments(pool, store, siteKey, fetchImpl = fetch) {
  let rows = []
  try {
    ;({ rows } = await pool.query(
      'select id, object_key from site_comment_attachment where site_key = $1 and purged_at is null',
      [siteKey]
    ))
  } catch (err) {
    console.warn(
      `[comments] ${siteKey}: could not list its comment files before deletion: ${err?.message ?? err}`
    )
    return { removed: 0, kept: [] }
  }
  if (rows.length === 0) return { removed: 0, kept: [] }
  const kept = []
  const gone = []
  for (const row of rows) {
    const ok = store ? await deleteObjects(store, [row.object_key], fetchImpl).catch(() => false) : false
    if (ok) gone.push(row.id)
    else kept.push(row.object_key)
  }
  if (gone.length)
    await pool.query('delete from site_comment_attachment where id = any($1::uuid[])', [gone]).catch(() => {})
  if (kept.length)
    console.warn(
      `[comments] ${siteKey}: deleted without ${kept.length} comment file(s) the store kept${store ? '' : ' (no artifact store configured)'}: ${kept.join(', ')}`
    )
  return { removed: gone.length, kept }
}

/**
 * Check `ids` for a comment write, before anything is written: the list shape, and that each id is
 * a live upload of this site by… anyone holding a seat, not yet on another comment. Returns
 * `{ids}` or `{refusal: {code, status, extra}}`.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function checkAttachmentIds(db, siteKey, ids, commentId = null) {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
    return {
      refusal: { code: 'COMMENT_BAD_INPUT', field: 'attachments', reason: 'an array of attachment ids' }
    }
  const unique = [...new Set(ids)]
  if (unique.length > MAX_ATTACHMENTS_PER_COMMENT)
    return { refusal: { code: 'ATTACHMENT_LIMIT', limit: MAX_ATTACHMENTS_PER_COMMENT } }
  const wanted = unique.filter((id) => UUID.test(id))
  const { rows } = await db.query(
    `select id, comment_id from site_comment_attachment
      where site_key = $1 and id = any($2::uuid[]) and purged_at is null`,
    [siteKey, wanted]
  )
  const found = new Map(rows.map((r) => [r.id, r.comment_id]))
  const missing = unique.filter((id) => !found.has(id))
  if (missing.length) return { refusal: { code: 'ATTACHMENT_NOT_FOUND', ids: missing } }
  const taken = unique.filter((id) => found.get(id) && found.get(id) !== commentId)
  if (taken.length) return { refusal: { code: 'ATTACHMENT_IN_USE', ids: taken } }
  return { ids: unique }
}

/**
 * Make `ids` (already checked) the files of `commentId`, in that order. Files the comment had and
 * the list no longer names are detached, not deleted: they become loose uploads again and the next
 * sweep removes them, so a PATCH that drops a file by mistake can be undone for a day.
 * @param {import('pg').PoolClient} client - inside the comment write's transaction.
 * @returns false when one of `ids` was taken by another comment since it was checked (a race
 *   between two writes); the caller rolls back.
 */
export async function setCommentAttachments(client, siteKey, commentId, ids) {
  await client.query(
    `update site_comment_attachment set comment_id = null, created_at = now()
      where site_key = $1 and comment_id = $2 and not (id = any($3::uuid[]))`,
    [siteKey, commentId, ids]
  )
  for (const [position, id] of ids.entries()) {
    const { rowCount } = await client.query(
      `update site_comment_attachment set comment_id = $3, position = $4
        where site_key = $1 and id = $2 and purged_at is null and (comment_id is null or comment_id = $3)`,
      [siteKey, id, commentId, position]
    )
    if (rowCount !== 1) return false
  }
  return true
}

/** SQL for a comment row's `attachments` (select list, `c` = `site_comment`). */
export const ATTACHMENTS_SELECT = `(select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'name', f.name, 'size', f.size, 'type', f.type) order by f.position, f.created_at),
         '[]'::jsonb)
      from site_comment_attachment f where f.comment_id = c.id and f.purged_at is null) as attachments`

/**
 * @param {import('hono').Hono} app
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {(c: any, siteKey: string) => Promise<any>} deps.requireGrant
 * @param {object | null} deps.store - `config.artifactStore`
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 */
export function mountCommentAttachments(
  app,
  { pool, requireGrant, store, fetchImpl = fetch, now = Date.now }
) {
  async function caller(c) {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return { error: auth.error }
    return { siteKey, email: auth.email, accountId: auth.account.id }
  }

  app.post('/api/sites/:key/comments/attachments', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    c.header('cache-control', 'no-store')
    if (!store) return refuse(c, 'ATTACHMENT_STORE_UNAVAILABLE', 503)
    // Refused on the announced length BEFORE reading: a caller saying 400 MB should not get to move
    // 400 MB through this process first (the same rule as the Ops picture door). Multipart framing
    // adds a little, hence the slack.
    const announced = Number(c.req.header('content-length') ?? '0')
    if (announced > MAX_ATTACHMENT_BYTES + 64 * 1024)
      return refuse(c, 'ATTACHMENT_TOO_LARGE', 413, { limit: MAX_ATTACHMENT_BYTES })
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function')
      return refuse(c, 'ATTACHMENT_BAD_INPUT', 400, { field: 'file' })
    if (file.size > MAX_ATTACHMENT_BYTES)
      return refuse(c, 'ATTACHMENT_TOO_LARGE', 413, { limit: MAX_ATTACHMENT_BYTES })
    if (file.size === 0)
      return refuse(c, 'ATTACHMENT_BAD_INPUT', 400, { field: 'file', reason: 'empty file' })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const name = cleanName(file.name)
    const type = cleanType(file.type)
    const id = crypto.randomUUID()
    const objectKey = `comments/${labelPrefix(me.siteKey)}/${id}`
    const put = await putObject(store, objectKey, bytes, type, fetchImpl).catch(() => null)
    if (!put?.ok) return refuse(c, 'ATTACHMENT_STORE_FAILED', 502, put ? { status: put.status } : {})
    await pool.query(
      `insert into site_comment_attachment (id, site_key, uploaded_by, name, size, type, object_key)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, me.siteKey, me.accountId, name, bytes.length, type, objectKey]
    )
    await audit(pool, {
      actor: me.email,
      action: 'comment.attachment.upload',
      siteKey: me.siteKey,
      detail: { id, size: bytes.length, type }
    })
    await sweepSite(pool, store, me.siteKey, now(), fetchImpl).catch(() => {})
    return json(c, { attachment: attachmentShape(me.siteKey, { id, name, size: bytes.length, type }) }, 201)
  })

  app.get('/api/sites/:key/comments/attachments/:id', async (c) => {
    const me = await caller(c)
    if (me.error) return me.error
    const id = c.req.param('id')
    const { rows } = UUID.test(id)
      ? await pool.query(
          `select f.*, c.deleted_at as comment_deleted_at from site_comment_attachment f
             left join site_comment c on c.id = f.comment_id
            where f.site_key = $1 and f.id = $2 and f.purged_at is null`,
          [me.siteKey, id]
        )
      : { rows: [] }
    const row = rows[0]
    // Served only while it is on a live comment. A deleted comment's files are kept (Undo) but no
    // longer served: what it said went with it (G2). A file removed from a comment (PATCH) or never
    // attached is a loose upload, kept a day so it can be put back, and not served either: whoever
    // removed it expects it gone at once (A13, TH-12). Nothing reads a loose upload — the box shows
    // a picked file from the browser's own copy.
    if (!row || !row.comment_id || row.comment_deleted_at) {
      c.header('cache-control', 'no-store')
      return refuse(c, 'ATTACHMENT_NOT_FOUND', 404)
    }
    if (!store) return refuse(c, 'ATTACHMENT_STORE_UNAVAILABLE', 503)
    // The bytes under an id never change, but whether they may be read does (seat, removal, delete):
    // so every use asks again (`no-cache`) and a copy still good answers 304 without the bytes.
    const etag = `"${row.id}"`
    const cacheHeaders = { etag, 'cache-control': 'private, no-cache' }
    if ((c.req.header('if-none-match') ?? '').split(/\s*,\s*/).includes(etag))
      return new Response(null, { status: 304, headers: cacheHeaders })
    const url = await presign(store, { method: 'GET', key: row.object_key, expiresIn: STORE_URL_TTL_S })
    const res = await fetchImpl(url, { method: 'GET' }).catch(() => null)
    if (!res?.ok || !res.body) {
      c.header('cache-control', 'no-store')
      return refuse(c, 'ATTACHMENT_STORE_FAILED', 502, res ? { status: res.status } : {})
    }
    const inline = INLINE_TYPES.has(row.type)
    return new Response(res.body, {
      status: 200,
      headers: {
        'content-type': row.type,
        'content-length': String(row.size),
        'content-disposition': disposition(inline ? 'inline' : 'attachment', row.name),
        ...cacheHeaders,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox"
      }
    })
  })
}
