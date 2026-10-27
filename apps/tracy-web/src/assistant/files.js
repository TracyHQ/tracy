/**
 * Files a customer attaches to a Help question in the creation workspace's chat (David, 26/10/2026:
 * "files uploaded in the chat are not stored anywhere"). The bytes go to the artifact store (MinIO on a
 * local stand, R2 on a server) under a key chosen here; the row is an `assistant_attachment` with
 * `source = 'customer'` (`178-assistant-customer-files.sql`), the same table as a staff member's picture.
 *
 * A file is uploaded the moment it is picked, before the question is sent: it waits LOOSE (`turn_id`
 * null) in the chat box, and the question that carries it claims it. A loose file older than a day is
 * swept with its bytes on the account's next upload, so a draft left behind costs nothing for long.
 *
 * 🔒 ONLY THE OWNER READS IT. Every read joins the account and a conversation that was not cleared; the
 * door answers 404 for anyone else's id, the same as for an unknown one.
 *
 * 🔒 THE TYPE IS DECIDED HERE, FROM THE NAME. The browser's claimed type is not trusted: the extension
 * picks one of the types below or the file is refused. Pictures are served inline (a thumbnail, opened
 * in a tab); everything else downloads, with `nosniff` and a sandboxing CSP, so a file can never run as a
 * page on Tracy's own origin.
 *
 * Module graph: `lib/` and its own files only.
 */
import { randomUUID } from 'node:crypto'
import { tx } from './store.js'

/** One file: the same cap as a comment's file (`sites/comment-attachments.js`). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024
/** Files one question may carry. */
export const MAX_FILES_PER_QUESTION = 10
/** Uploads one account may make per hour: a person attaching a handful, not a script filling the store. */
export const UPLOADS_PER_HOUR = 60
/** A file nobody sent within this long is removed. */
export const LOOSE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_NAME = 255

/** What a customer may attach, by extension: the stored type and whether it is shown inline. */
const KINDS = {
  png: { type: 'image/png', picture: true },
  jpg: { type: 'image/jpeg', picture: true },
  jpeg: { type: 'image/jpeg', picture: true },
  gif: { type: 'image/gif', picture: true },
  webp: { type: 'image/webp', picture: true },
  pdf: { type: 'application/pdf', picture: false },
  docx: {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    picture: false
  },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', picture: false },
  txt: { type: 'text/plain', picture: false },
  csv: { type: 'text/csv', picture: false }
}

/** The extensions the chat box accepts, for its file picker and its refusal line. */
export const ACCEPTED_EXTENSIONS = Object.keys(KINDS)

/** Words the model reads about a file's kind; it never sees the content. */
const KIND_WORDS = {
  'image/png': 'PNG image',
  'image/jpeg': 'JPEG image',
  'image/gif': 'GIF image',
  'image/webp': 'WebP image',
  'application/pdf': 'PDF document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel spreadsheet',
  'text/plain': 'text file',
  'text/csv': 'CSV file'
}

/**
 * The kind of a file by its name, or null when it is not one the chat takes.
 * @param {string} name
 * @returns {{ type: string, picture: boolean } | null}
 */
export function kindOf(name) {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  const ext = name.slice(dot + 1).toLowerCase()
  return Object.hasOwn(KINDS, ext) ? KINDS[ext] : null
}

/** A picture must carry its format signature before it can be served inline. */
export function matchesPicture(type, bytes) {
  const starts = (values) => values.every((value, i) => bytes[i] === value)
  if (type === 'image/png') return starts([137, 80, 78, 71, 13, 10, 26, 10])
  if (type === 'image/jpeg') return starts([255, 216, 255])
  if (type === 'image/gif') return /^GIF8[79]a$/.test(Buffer.from(bytes.subarray(0, 6)).toString('ascii'))
  if (type === 'image/webp')
    return (
      Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
    )
  return true
}

/**
 * A file name safe for a `content-disposition` header and a chip: the last path segment, no control
 * characters or quotes, at most 255 characters with the extension kept. Same rule as a comment's file.
 * @param {unknown} raw
 */
export function cleanName(raw) {
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()
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

/** `Content-Disposition`: an ASCII fallback plus the RFC 5987 UTF-8 name. */
export function disposition(kind, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** @param {number} bytes */
function sizeWords(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * The line the model reads under a question that carried files: names, kinds and sizes as data.
 * @param {readonly { name: string, type: string, bytes: number }[]} files
 */
export function filesNote(files) {
  if (files.length === 0) return ''
  const list = files.map((f) => `${f.name} (${KIND_WORDS[f.type] ?? 'file'}, ${sizeWords(f.bytes)})`)
  return `[Files the person attached to this message, stored in their Tracy account: ${list.join('; ')}. You cannot open or see their content.]`
}

/**
 * The wire shape of one file: `url` is this server's own owner-only door.
 * @param {{ id: string, name: string | null, content_type: string, bytes: number }} row
 */
export function fileShape(row) {
  return {
    id: row.id,
    name: row.name ?? 'file',
    type: row.content_type,
    bytes: Number(row.bytes),
    url: `/api/assistant/attachments/${row.id}`
  }
}

/**
 * Store one picked file, loose, in the asker's conversation of that session.
 * @param {import('pg').Pool} pool
 * @param {{ put: (key: string, bytes: Uint8Array, type: string) => Promise<boolean> }} objects
 * @param {{ accountId: string, conversationId: string, name: string, type: string, bytes: Uint8Array }} file
 * @returns {Promise<ReturnType<typeof fileShape> | null>} null when the store refused the bytes
 */
export async function saveFile(pool, objects, { accountId, conversationId, name, type, bytes }) {
  const id = randomUUID()
  const key = `assistant/${accountId}/${id}`
  // Reserve the key before moving bytes so a failed upload always has a cleanup record.
  await pool.query(
    `insert into assistant_attachment (id, account_id, conversation_id, object_key, content_type, bytes, source, name)
     values ($1, $2, $3, $4, $5, $6, 'customer', $7)`,
    [id, accountId, conversationId, key, type, bytes.length, name]
  )
  if (!(await objects.put(key, bytes, type).catch(() => false))) {
    await pool.query("update assistant_attachment set created_at = now() - interval '2 days' where id = $1", [
      id
    ])
    return null
  }
  return fileShape({ id, name, content_type: type, bytes: bytes.length })
}

/**
 * The loose files of `ids` that the asker uploaded into this conversation, in the order asked. Any id
 * that is someone else's, already sent, or of another conversation makes the whole list refused.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} accountId
 * @param {string} conversationId
 * @param {readonly string[]} ids
 * @returns {Promise<{ id: string, name: string, type: string, bytes: number }[] | null>}
 */
export async function looseFiles(db, accountId, conversationId, ids, retryTurnId = null) {
  if (ids.length === 0) return []
  const { rows } = await db.query(
    `select id, name, content_type, bytes from assistant_attachment
      where id = any($1::uuid[]) and account_id = $2 and conversation_id = $3
        and source = 'customer' and (turn_id is null or turn_id = $4::bigint)`,
    [ids, accountId, conversationId, retryTurnId]
  )
  if (rows.length !== ids.length) return null
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => {
    const r = byId.get(id)
    return { id: r.id, name: r.name ?? 'file', type: r.content_type, bytes: Number(r.bytes) }
  })
}

/**
 * The question `turnId` carried these files; inside the turn's own transaction.
 * @param {import('pg').PoolClient} client
 */
export async function claimFiles(client, accountId, turnId, ids) {
  if (ids.length === 0) return
  const result = await client.query(
    `update assistant_attachment set turn_id = $3
      where id = any($1::uuid[]) and account_id = $2 and source = 'customer' and turn_id is null`,
    [ids, accountId, turnId]
  )
  if (result.rowCount !== ids.length) {
    throw Object.assign(new Error('Attachment already claimed'), { code: 'ATTACHMENT_NOT_FOUND' })
  }
}

/**
 * The files each of these user turns carried, by turn id.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @param {readonly string[]} turnIds
 * @returns {Promise<Map<string, ReturnType<typeof fileShape>[]>>}
 */
export async function filesOfTurns(pool, accountId, turnIds) {
  const out = new Map()
  if (turnIds.length === 0) return out
  const { rows } = await pool.query(
    `select id, name, content_type, bytes, turn_id from assistant_attachment
      where account_id = $1 and source = 'customer' and turn_id = any($2::bigint[])
      order by created_at, id`,
    [accountId, turnIds]
  )
  for (const row of rows) {
    const key = String(row.turn_id)
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(fileShape(row))
  }
  return out
}

/**
 * One file the asker owns (theirs or a staff member's picture to them), in a conversation not cleared.
 * @returns {Promise<{ object_key: string, content_type: string, name: string | null, source: string } | null>}
 */
export async function ownFile(pool, accountId, id) {
  const { rows } = await pool.query(
    `select a.object_key, a.content_type, a.name, a.source from assistant_attachment a
       join assistant_conversation c on c.id = a.conversation_id
      where a.id = $1 and a.account_id = $2 and c.account_id = $2 and c.cleared_at is null`,
    [id, accountId]
  )
  return rows[0] ?? null
}

/** Whether a stored type is shown inline (a picture) rather than downloaded. */
export const isPicture = (type) => Object.values(KINDS).some((k) => k.picture && k.type === type)

/**
 * Remove this account's files that were never sent within `LOOSE_TTL_MS`, bytes first.
 * @param {import('pg').Pool} pool
 * @param {{ delete: (key: string) => Promise<unknown> } | null} objects
 */
export async function sweepLoose(pool, objects, accountId, now = Date.now()) {
  if (!objects) return 0
  return tx(pool, async (client) => {
    const { rows } = await client.query(
      `select id, object_key from assistant_attachment
        where account_id = $1 and source = 'customer' and turn_id is null and created_at < $2
        for update skip locked`,
      [accountId, new Date(now - LOOSE_TTL_MS)]
    )
    let removed = 0
    for (const row of rows) {
      // Keep the row when deletion fails: a later sweep retries the same object key.
      const deleted = await objects.delete(row.object_key).then(
        (out) => out !== false,
        () => false
      )
      if (!deleted) continue
      await client.query('delete from assistant_attachment where id = $1', [row.id])
      removed++
    }
    return removed
  })
}
