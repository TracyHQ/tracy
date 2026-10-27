/**
 * Move a deployment's old place pictures into the shared bucket (shared places plan §7):
 * every stored `wo_place_media` row keyed `places/<place uuid>/<sha>.<ext>` in the artifact store gets
 * the content-addressed shared key `media/<google|other>/<sha[0:2]>/<sha>.<ext>`
 * (`opportunities/place-media-store.js`). Run by `scripts/copy-place-media-to-shared-bucket.mjs`.
 *
 * 🔒 COPY, NEVER DELETE. Per row: read the source, check its sha256 and size against the row, write it
 * to the shared bucket, read it back and check the sha256 again, and only then re-key the row and
 * record the old key in `wo_place_media_rekey` (migration 166), in one transaction. A source that is
 * missing or does not hash to the row is skipped and listed, never "fixed". The source object stays.
 * Reruns skip rows already moved (their key no longer starts `places/`). `ROLLBACK_SQL` undoes it.
 */
import { createHash } from 'node:crypto'

import { placeMediaOrigin, sharedMediaKey } from './place-media-store.js'

export const ROLLBACK_SQL = `update wo_place_media m set object_key = r.old_key
  from wo_place_media_rekey r where r.media_id = m.id and m.object_key = r.new_key`

const OLD_KEY = 'places/%'
const EXT = /\.([A-Za-z0-9]{2,5})$/
const PARALLEL = 8
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function inParallel(items, fn) {
  const out = []
  for (let i = 0; i < items.length; i += PARALLEL)
    out.push(...(await Promise.all(items.slice(i, i + PARALLEL).map(fn))))
  return out
}

/** What a move would do, writing nothing: row counts, bytes, and sources the artifact store lacks. */
export async function surveyPlaceMedia({ pool, local }) {
  const totals = (
    await pool.query(
      `select count(*)::int as rows,
         count(*) filter (where status = 'stored' and object_key is not null)::int as stored_rows,
         coalesce(sum(bytes) filter (where status = 'stored' and object_key is not null), 0)::bigint as total_bytes,
         count(*) filter (where status <> 'stored' or object_key is null)::int as no_stored_bytes,
         count(*) filter (where status = 'stored' and object_key like 'media/%')::int as already_shared
       from wo_place_media`
    )
  ).rows[0]
  const pending = (
    await pool.query(
      `select id, object_key, source, provider, credit from wo_place_media
       where status = 'stored' and object_key like $1 order by id`,
      [OLD_KEY]
    )
  ).rows
  const present = await inParallel(pending, async (r) =>
    Boolean(await local?.head?.(r.object_key).catch(() => null))
  )
  const byOrigin = { google: 0, other: 0 }
  for (const r of pending) byOrigin[placeMediaOrigin(r)] += 1
  return {
    rows: totals.rows,
    storedRows: totals.stored_rows,
    totalBytes: Number(totals.total_bytes),
    noStoredBytes: totals.no_stored_bytes,
    alreadyShared: totals.already_shared,
    toMove: pending.length,
    sourceMissing: present.filter((p) => !p).length,
    byOrigin
  }
}

async function readBytes(store, key) {
  const res = await store.get(key).catch(() => null)
  if (!res?.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

/** One row: copied, verified, re-keyed → null; otherwise the reason it was skipped. */
async function moveOne({ pool, local, shared, keyRoot }, row) {
  const bytes = await readBytes(local, row.object_key)
  if (!bytes) return 'source_missing'
  if (sha256(bytes) !== row.sha256 || (row.bytes !== null && Number(row.bytes) !== bytes.length))
    return 'source_mismatch'
  const ext = (EXT.exec(row.object_key)?.[1] ?? 'bin').toLowerCase()
  const key = `${keyRoot}${sharedMediaKey({ sha256: row.sha256, ext, origin: placeMediaOrigin(row) })}`
  if (!(await shared.put(key, bytes, row.mime ?? 'application/octet-stream'))) return 'write_failed'
  const back = await readBytes(shared, key)
  if (!back || sha256(back) !== row.sha256) return 'write_unverified'
  const client = await pool.connect()
  try {
    await client.query('begin')
    const updated = await client.query(
      'update wo_place_media set object_key = $2 where id = $1 and object_key = $3',
      [row.id, key, row.object_key]
    )
    if (updated.rowCount === 1)
      await client.query(
        `insert into wo_place_media_rekey (media_id, old_key, new_key) values ($1, $2, $3)
         on conflict (media_id) do update set old_key = excluded.old_key, new_key = excluded.new_key, moved_at = now()`,
        [row.id, row.object_key, key]
      )
    await client.query('commit')
    return updated.rowCount === 1 ? null : 'row_changed'
  } catch (error) {
    await client.query('rollback').catch(() => {})
    // The immutability guard refused this key: list the row, keep moving the others.
    if (error?.code === 'P0001') return 'rekey_refused'
    throw error
  } finally {
    client.release()
  }
}

/**
 * Move every pending row, `batch` at a time in id order. `keyRoot` prefixes the new keys (tests write
 * under `test/<random>/`; the script never sets it). `onBatch` gets running counts after each batch.
 * @returns {Promise<{moved: number, movedBytes: number, skipped: {id: string, reason: string}[]}>}
 */
export async function movePlaceMedia({ pool, local, shared, batch = 50, keyRoot = '', onBatch = () => {} }) {
  if (!local || !shared) throw new Error('movePlaceMedia needs both the artifact store and the shared bucket')
  const result = { moved: 0, movedBytes: 0, skipped: [] }
  let after = '00000000-0000-0000-0000-000000000000'
  for (;;) {
    const { rows } = await pool.query(
      `select id, sha256, object_key, mime, bytes, source, provider, credit from wo_place_media
       where status = 'stored' and object_key like $1 and id > $2 order by id limit $3`,
      [OLD_KEY, after, batch]
    )
    if (rows.length === 0) return result
    after = rows[rows.length - 1].id
    const reasons = await inParallel(rows, (row) => moveOne({ pool, local, shared, keyRoot }, row))
    rows.forEach((row, i) => {
      if (reasons[i]) result.skipped.push({ id: row.id, reason: reasons[i] })
      else {
        result.moved += 1
        result.movedBytes += Number(row.bytes ?? 0)
      }
    })
    onBatch({ moved: result.moved, movedBytes: result.movedBytes, skipped: result.skipped.length })
  }
}
