/** Read a frozen export's pictures through a caller-owned, authoritative finite grant.
 * This is a composition seam, not an HTTP door or a grant issuer. Every cache use must call
 * check again; a receipt proves access at checkedAt, not immunity from a later withdrawal.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const MAX_BYTES = 25 * 1024 * 1024
const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const SHA = /^[a-f0-9]{64}$/
const TYPES = new Map([
  ['png', 'image/png'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp']
])
const fail = (reason) =>
  Object.assign(new Error(`Snapshot media ${reason}`), {
    code: `SNAPSHOT_MEDIA_${reason}`
  })
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const size = (value) => (/^(0|[1-9][0-9]*)$/.test(String(value)) ? Number(value) : NaN)

export function createSnapshotMediaReader({
  pool,
  objects,
  exportBytes,
  exportSha256,
  authorityId,
  bindingId,
  resolveGrant,
  now = Date.now,
  timeoutMs = 15000,
  maxBytes = MAX_BYTES
}) {
  if (
    !pool?.query ||
    !objects?.get ||
    typeof resolveGrant !== 'function' ||
    typeof authorityId !== 'string' ||
    !authorityId ||
    typeof bindingId !== 'string' ||
    !bindingId ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_BYTES ||
    !SHA.test(exportSha256 ?? '') ||
    !(exportBytes instanceof Uint8Array) ||
    exportBytes.byteLength > 16 * 1024 * 1024 ||
    hash(exportBytes) !== exportSha256
  )
    throw fail('CONFIG')
  let manifest
  try {
    manifest = JSON.parse(Buffer.from(exportBytes).toString('utf8'))
  } catch {
    throw fail('EXPORT')
  }
  const snapshot = manifest?.snapshot
  if (
    manifest?.schemaVersion !== 'tracy-wo-public-snapshot-export/v1' ||
    !UUID.test(snapshot?.id ?? '') ||
    !UUID.test(snapshot?.place_id ?? '') ||
    !['published', 'superseded'].includes(snapshot?.state) ||
    snapshot?.enrichment_scope !== 'full' ||
    !Number.isFinite(Date.parse(snapshot?.published_at)) ||
    !Array.isArray(manifest.media) ||
    !Array.isArray(manifest.membership) ||
    manifest.media.length > 10000 ||
    manifest.membership.length !== manifest.media.length
  )
    throw fail('EXPORT')
  const members = new Map()
  for (const row of manifest.media) {
    if (
      !row ||
      !UUID.test(row.id ?? '') ||
      row.place_id !== snapshot.place_id ||
      !SHA.test(row.sha256 ?? '') ||
      members.has(row.id)
    )
      throw fail('EXPORT')
    members.set(row.id, row)
  }
  const membership = new Set()
  for (const row of manifest.membership) {
    if (!row || row.snapshot_id !== snapshot.id || !members.has(row.media_id) || membership.has(row.media_id))
      throw fail('EXPORT')
    membership.add(row.media_id)
  }

  // Do not keep a database transaction open across an object read. The second lookup must observe
  // withdrawals committed during the read, rather than a repeatable-read snapshot of the first lookup.
  async function inspect(mediaId, signal) {
    const expected = members.get(mediaId)
    if (!expected) throw fail('SCOPE')
    if (expected.status !== 'stored' || expected.revoked_at || expected.kind !== 'image')
      throw fail('UNAVAILABLE')
    const grant = await resolveGrant()
    if (signal.aborted) throw fail('TIMEOUT')
    if (
      !grant ||
      grant.revokedAt != null ||
      grant.authorityId !== authorityId ||
      grant.bindingId !== bindingId ||
      !UUID.test(grant.accountId ?? '') ||
      !UUID.test(grant.opportunityId ?? '') ||
      grant.placeId !== snapshot.place_id ||
      grant.snapshotId !== snapshot.id ||
      grant.exportSha256 !== exportSha256 ||
      !Number.isFinite(Date.parse(grant.expiresAt)) ||
      Date.parse(grant.expiresAt) <= now() ||
      !Array.isArray(grant.media) ||
      !grant.media.some((m) => m?.id === mediaId && m.sha256 === expected.sha256)
    )
      throw fail('GRANT')
    const grantIdentity = { accountId: grant.accountId, opportunityId: grant.opportunityId }
    const expiresAt = Date.parse(grant.expiresAt)
    const row = (
      await pool.query(
        `select m.*, s.state as snapshot_state, s.enrichment_scope, s.published_at
       from wo_place_snapshot_media sm
       join wo_place_snapshot s on s.id=sm.snapshot_id
       join wo_place_media m on m.id=sm.media_id and m.place_id=s.place_id
       where s.id=$1 and s.place_id=$2 and m.id=$3`,
        [snapshot.id, snapshot.place_id, mediaId]
      )
    ).rows[0]
    if (signal.aborted) throw fail('TIMEOUT')
    if (
      !row ||
      !['published', 'superseded'].includes(row.snapshot_state) ||
      row.enrichment_scope !== 'full' ||
      !row.published_at ||
      row.revoked_at ||
      row.status !== 'stored' ||
      !row.object_key ||
      row.sha256 !== expected.sha256 ||
      row.mime !== expected.mime ||
      size(row.bytes) !== size(expected.bytes) ||
      !Number.isSafeInteger(size(row.bytes)) ||
      size(row.bytes) < 1 ||
      size(row.bytes) > maxBytes ||
      ![...TYPES.values()].includes(row.mime) ||
      row.kind !== 'image' ||
      !Number.isInteger(row.width) ||
      !Number.isInteger(row.height) ||
      row.width < 1 ||
      row.height < 1 ||
      row.width > 8192 ||
      row.height > 8192 ||
      row.width !== expected.width ||
      row.height !== expected.height
    )
      throw fail('UNAVAILABLE')
    if (expiresAt <= now()) throw fail('GRANT')
    return {
      row,
      grant: grantIdentity,
      receipt: {
        authorityId,
        bindingId,
        ...grantIdentity,
        exportSha256,
        placeId: snapshot.place_id,
        snapshotId: snapshot.id,
        mediaId,
        sha256: row.sha256,
        bytes: size(row.bytes),
        mime: row.mime,
        grantExpiresAt: new Date(expiresAt).toISOString(),
        sourceCollectedAt: row.collected_at == null ? null : new Date(row.collected_at).toISOString(),
        checkedAt: new Date(now()).toISOString()
      }
    }
  }

  async function boundedRead(response, signal) {
    if (!response?.ok || !response.body?.getReader) {
      void response?.body?.cancel().catch(() => {})
      throw fail('STORE')
    }
    const length = response.headers?.get('content-length')
    if (length != null && (!Number.isSafeInteger(size(length)) || size(length) > maxBytes)) {
      void response.body.cancel().catch(() => {})
      throw fail('SIZE')
    }
    const reader = response.body.getReader(),
      chunks = []
    const abort = () => {
      void reader.cancel().catch(() => {})
    }
    signal.addEventListener('abort', abort, { once: true })
    let total = 0
    try {
      while (true) {
        if (signal.aborted) throw fail('TIMEOUT')
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) throw fail('SIZE')
        chunks.push(value)
      }
      if (length != null && size(length) !== total) throw fail('SIZE')
      return Buffer.concat(chunks, total)
    } finally {
      signal.removeEventListener('abort', abort)
      void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }

  async function run(mediaId, withBytes) {
    const controller = new AbortController()
    let timer
    // Existing objects.get may not consume a signal. The race still bounds this operation; a late
    // response is cancelled and can never release bytes to a consumer after the operation expired.
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(fail('TIMEOUT'))
      }, timeoutMs)
    })
    const work = async () => {
      const first = await inspect(mediaId, controller.signal)
      if (controller.signal.aborted) throw fail('TIMEOUT')
      if (!withBytes)
        return {
          receipt: first.receipt,
          mime: first.row.mime,
          width: first.row.width,
          height: first.row.height
        }
      const response = await objects.get(first.row.object_key)
      if (controller.signal.aborted) {
        void response?.body?.cancel().catch(() => {})
        throw fail('TIMEOUT')
      }
      const bytes = await boundedRead(response, controller.signal)
      if (controller.signal.aborted) throw fail('TIMEOUT')
      if (bytes.length !== size(first.row.bytes) || hash(bytes) !== first.row.sha256) throw fail('BYTES')
      let info
      try {
        const image = sharp(bytes, { limitInputPixels: 100000000 })
        info = await image.metadata()
        if (controller.signal.aborted) throw fail('TIMEOUT')
        if (
          TYPES.get(info.format) !== first.row.mime ||
          info.width !== first.row.width ||
          info.height !== first.row.height
        )
          throw fail('FORMAT')
        await image.resize(1, 1).toBuffer()
      } catch {
        if (controller.signal.aborted) throw fail('TIMEOUT')
        throw fail('FORMAT')
      }
      if (controller.signal.aborted) throw fail('TIMEOUT')
      const last = await inspect(mediaId, controller.signal)
      if (controller.signal.aborted) throw fail('TIMEOUT')
      if (
        last.row.object_key !== first.row.object_key ||
        last.grant.accountId !== first.grant.accountId ||
        last.grant.opportunityId !== first.grant.opportunityId
      )
        throw fail('CHANGED')
      return {
        bytes,
        mime: last.row.mime,
        width: last.row.width,
        height: last.row.height,
        receipt: last.receipt
      }
    }
    try {
      return await Promise.race([work(), expired])
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('SNAPSHOT_MEDIA_')) throw error
      throw fail('BOUNDARY')
    } finally {
      clearTimeout(timer)
    }
  }
  return { check: (mediaId) => run(mediaId, false), read: (mediaId) => run(mediaId, true) }
}
