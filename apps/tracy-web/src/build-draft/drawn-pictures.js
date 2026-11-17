/**
 * The drawings of a draft run's pictures step (#575 pictures, port 1), kept as draft pictures like an owner photo: one
 * row of `build_draft_picture` (migration 218: category `drawn`, source `drawer`) under the draft's object key
 * `build-drafts/<account>/<sha256>.jpg`, opened again by the one opener of draft pictures (`openDraftPicture`, origin
 * `draft`). The row's `source_url` is `drawn:<key>`, the hash of the drawing's whole request
 * (`step-chain-draft-drawer.js`), so a re-run of the step, or a revision that asks the same drawing, finds it and pays
 * nothing (the step chain kept its drawings by the same key, `ladder-draw.js`).
 *
 * The rows go with the draft like every draft picture. A newer research prunes them (`pictures.js` `prune` keeps only
 * what a research or a brand file names): a later build asks its drawings again. No migration.
 */
import { createHash, randomUUID } from 'node:crypto'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * @param {{pool: import('pg').Pool, objects: {get: Function, put?: Function} | null}} deps
 * @returns {{find: Function, keep: Function}} the `drawnPictures` of the draft steps
 */
export function drawnPicturesStore({ pool, objects }) {
  /** The stored drawing of a request key, with its bytes checked against its hash; null when none. */
  async function find(key, { accountId = null } = {}) {
    if (!accountId || !objects) return null
    const { rows } = await pool.query(
      `select id, sha256, object_key, mime from build_draft_picture
        where account_id = $1 and source_url = $2 order by created_at desc limit 1`,
      [accountId, `drawn:${key}`]
    )
    const row = rows[0]
    if (!row) return null
    const res = await objects.get(row.object_key).catch(() => null)
    if (!res?.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return sha256(bytes) === row.sha256 ? { id: row.id, sha256: row.sha256, mime: row.mime, bytes } : null
  }

  /** Store one drawing: answers `{id, sha256, mime}`, or null when no object store is wired or it refuses the bytes. */
  async function keep(
    { key, bytes, mime = 'image/jpeg', width = null, height = null },
    { accountId = null } = {}
  ) {
    if (!objects?.put || !accountId) return null
    const hash = sha256(bytes)
    const objectKey = `build-drafts/${accountId}/${hash}.jpg`
    if (!(await objects.put(objectKey, bytes, mime).catch(() => false))) return null
    const { rows } = await pool.query(
      `with made as (
         insert into build_draft_picture
           (account_id, research_run, kind, category, source, source_url, sha256, object_key, mime, bytes, width, height)
         values ($1, $2, 'image', 'drawn', 'drawer', $3, $4, $5, $6, $7, $8, $9)
         on conflict (account_id, sha256) do nothing
         returning id)
       select id from made
       union all select id from build_draft_picture where account_id = $1 and sha256 = $4
       limit 1`,
      [accountId, randomUUID(), `drawn:${key}`, hash, objectKey, mime, bytes.length, width, height]
    )
    const id = rows[0]?.id ?? null
    return id ? { id, sha256: hash, mime } : null
  }

  return { find, keep }
}
