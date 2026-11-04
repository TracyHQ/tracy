// A revision's owner photo bytes, shared by the brief picture labels and the picture bench.
import { createHash } from 'node:crypto'

const PICTURE_MAX_BYTES = 25 * 1024 * 1024

/**
 * The stored bytes of each picture, read by id and checked against its sha256: a place picture from wo_place_media, the
 * account's own from wo_media. A row whose bytes are missing, too large or of another hash is left out. Also the picture
 * bench's reader of a revision's owner photos (site-pictures/owner-photos.js).
 * @param {{pool: {query: Function}, objects: {get: (key: string) => Promise<Response | null>} | null}} store
 * @param {Array<{id: string, sha256: string, origin?: string}>} rows
 * @param {string | null} accountId
 * @returns {Promise<Array<{id: string, bytes: Buffer}>>}
 */
export async function briefPictureBytes({ pool, objects }, rows, accountId) {
  const place = rows.filter((r) => r.origin === 'place').map((r) => r.id)
  const own = rows.filter((r) => r.origin !== 'place').map((r) => r.id)
  const keys = new Map()
  if (place.length) {
    const { rows: got } = await pool.query(
      `select id, sha256, object_key from wo_place_media
       where id = any($1::uuid[]) and status = 'stored' and revoked_at is null`,
      [place]
    )
    for (const r of got) keys.set(r.id, r)
  }
  if (own.length && accountId) {
    const { rows: got } = await pool.query(
      `select id, sha256, object_key from wo_media where id = any($1::uuid[]) and account_id = $2 and status = 'stored'`,
      [own, accountId]
    )
    for (const r of got) keys.set(r.id, r)
  }
  const pictures = []
  for (const r of rows) {
    const held = keys.get(r.id)
    if (!held?.object_key || held.sha256 !== r.sha256 || !objects) continue
    const res = await objects.get(held.object_key).catch(() => null)
    if (!res?.ok) continue
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > PICTURE_MAX_BYTES) continue
    if (createHash('sha256').update(bytes).digest('hex') === r.sha256) pictures.push({ id: r.id, bytes })
  }
  return pictures
}
