// The owner photo bytes of a picture run (#340), each checked against the sha256 the brief records for it. A run on a
// WO revision reads them through the brief asset reader (opportunities-build/brief-picture-labels.js
// briefPictureBytes): the revision's asset manifest says which store holds each picture (a place picture or one of the
// account's own), and the reader checks the hash. A run on a brief file reads the copies the bench CLI put in the
// bench's file store when the run started (file-store.js readPhoto checks the hash again). A photo whose bytes are
// missing or changed is left out; the shortlist then says so for that photo.
import { briefPictureBytes } from '../opportunities-build/brief-picture-labels.js'
import { UUID } from '../lib/bench-sql.js'

const HEX64 = /^[0-9a-f]{64}$/

/** The brief's still images with a hash, the only assets whose bytes are read. */
export const briefImages = (brief) =>
  (Array.isArray(brief?.assets) ? brief.assets : []).filter(
    (a) => a?.kind === 'image' && typeof a.id === 'string' && HEX64.test(String(a.sha256))
  )

/**
 * @param {{ pool: import('pg').Pool, objects?: { get: Function } | null, store: ReturnType<
 *   typeof import('./file-store.js').fileStore> }} deps
 * @param {{ brief: object, photo_source: { kind: string, revisionId?: string } }} row the run row
 * @returns {Promise<Map<string, Buffer>>} by brief asset id
 */
export async function ownerPhotoBytes({ pool, objects = null, store }, row) {
  const images = briefImages(row.brief)
  const found = new Map()
  if (row.photo_source?.kind === 'folder') {
    for (const a of images) {
      const bytes = await store.readPhoto(a.sha256)
      if (bytes) found.set(a.id, bytes)
    }
    return found
  }
  if (row.photo_source?.kind !== 'revision' || !UUID.test(String(row.photo_source.revisionId))) return found
  const { rows } = await pool.query('select account_id, asset_manifest from wo_revision where id = $1', [
    row.photo_source.revisionId
  ])
  if (!rows[0]) return found
  const origin = new Map(
    (rows[0].asset_manifest ?? []).map((m) => [m?.id, m?.origin === 'place' ? 'place' : 'own'])
  )
  const wanted = images.map((a) => ({ id: a.id, sha256: a.sha256, origin: origin.get(a.id) ?? 'own' }))
  for (const { id, bytes } of await briefPictureBytes({ pool, objects }, wanted, rows[0].account_id))
    found.set(id, bytes)
  return found
}
