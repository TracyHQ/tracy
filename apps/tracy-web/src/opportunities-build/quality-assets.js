/** Freeze source pictures without modifying shared media. Every use rechecks access and original bytes. */
import { createHash } from 'node:crypto'
import { pictureFeatures } from '../lib/picture-cut.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { qualityHash } from './quality-dossier.js'
import { buildPlaced } from './build-store.js'

const imageInfo = imageInfoWith({ pictureFeatures })
const MAX_BYTES = 25 * 1024 * 1024
const fail = (code) => Object.assign(new Error(code), { code })
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const duplicate = (a, b) => {
  if (!/^[a-f0-9]{16}$/.test(a ?? '') || !/^[a-f0-9]{16}$/.test(b ?? '')) return false
  let difference = BigInt(`0x${a}`) ^ BigInt(`0x${b}`),
    bits = 0
  while (difference) {
    bits++
    difference &= difference - 1n
  }
  return bits <= 6
}
async function bytesOf(row, { objects, measure = imageInfo }) {
  if (
    !row.object_key ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(row.mime) ||
    row.bytes > MAX_BYTES
  )
    throw fail('QUALITY_ASSET_UNSUPPORTED')
  const response = await objects.get(row.object_key)
  if (!response?.ok) throw fail('QUALITY_ASSET_UNAVAILABLE')
  const declared = Number(response.headers?.get('content-length'))
  if (declared > MAX_BYTES) throw fail('QUALITY_ASSET_TOO_LARGE')
  // Read a bounded stream: an object store response must not allocate an unbounded body first.
  const reader = response.body.getReader(),
    chunks = []
  let count = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      count += value.byteLength
      if (count > MAX_BYTES) throw fail('QUALITY_ASSET_TOO_LARGE')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks)
  if (sha(bytes) !== row.sha256) throw fail('QUALITY_ASSET_BYTES_CHANGED')
  const info = await measure(bytes)
  if (
    !Number.isInteger(info.width) ||
    !Number.isInteger(info.height) ||
    info.width < 1 ||
    info.height < 1 ||
    info.width > 8192 ||
    info.height > 8192 ||
    info.width * info.height > 100000000
  )
    throw fail('QUALITY_ASSET_DIMENSIONS')
  return { bytes, info }
}

export async function prepareQualityAssets({
  pool,
  objects,
  frozen,
  maxPictures = 24,
  readRows = buildPlaced,
  measure = imageInfo
}) {
  if (!objects?.get || !Number.isInteger(maxPictures) || maxPictures < 0 || maxPictures > 24)
    throw fail('QUALITY_ASSET_POLICY')
  const rows = await readRows(pool, frozen.account_id, frozen),
    selected = [],
    excluded = [],
    seen = new Set(),
    hashes = []
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const entry of frozen.asset_manifest.filter((a) => a.kind === 'image')) {
    const row = byId.get(entry.id)
    if (!row || row.sha256 !== entry.sha256) {
      excluded.push({ id: entry.id, reason: 'unavailable-or-revoked' })
      continue
    }
    if (seen.has(entry.sha256)) {
      excluded.push({ id: entry.id, reason: 'duplicate-bytes' })
      continue
    }
    seen.add(entry.sha256)
    if (selected.length >= maxPictures) {
      excluded.push({ id: entry.id, reason: 'picture-limit' })
      continue
    }
    let loaded
    try {
      loaded = await bytesOf(row, { objects, measure })
    } catch (error) {
      if (error.code === 'QUALITY_ASSET_BYTES_CHANGED') throw error
      excluded.push({ id: entry.id, reason: error.code ?? 'decode-failed' })
      continue
    }
    if (hashes.some((h) => duplicate(h, loaded.info.dhash))) {
      excluded.push({ id: entry.id, reason: 'near-duplicate-pixels' })
      continue
    }
    if (Math.max(loaded.info.width, loaded.info.height) < 480) {
      excluded.push({ id: entry.id, reason: 'too-small' })
      continue
    }
    hashes.push(loaded.info.dhash)
    selected.push({
      id: row.id,
      accountId: frozen.account_id,
      sha256: row.sha256,
      mime: row.mime,
      bytes: loaded.bytes.length,
      width: loaded.info.width,
      height: loaded.info.height,
      dhash: loaded.info.dhash,
      origin: entry.origin ?? 'opportunity',
      source: row.source,
      sourceUrl: row.source_url,
      postId: row.post_id ?? null,
      postedAt: row.posted_at ?? null,
      caption: row.caption ?? '',
      alt: row.alt ?? '',
      credit: row.labels?.credit ?? null
    })
  }
  const artifact = {
    schemaVersion: 'tracy-wo-assets/v1',
    accountId: frozen.account_id,
    revisionId: frozen.id,
    selected,
    excluded,
    coverage: {
      declared: frozen.asset_manifest.filter((a) => a.kind === 'image').length,
      selected: selected.length,
      excluded: excluded.length
    }
  }
  return { ...artifact, hash: qualityHash(artifact) }
}

export async function qualityAssetPixels({
  pool,
  objects,
  frozen,
  assets,
  ids,
  readRows = buildPlaced,
  measure = imageInfo
}) {
  if (
    assets.accountId !== frozen.account_id ||
    assets.revisionId !== frozen.id ||
    new Set(ids).size !== ids.length
  )
    throw fail('QUALITY_ASSET_SCOPE')
  const rows = await readRows(pool, frozen.account_id, frozen),
    images = []
  for (const id of ids) {
    const selected = assets.selected.find((a) => a.id === id),
      row = rows.find((r) => r.id === id)
    if (!selected || !row || row.sha256 !== selected.sha256) throw fail('QUALITY_ASSET_REVOKED')
    const { bytes, info } = await bytesOf(row, { objects, measure })
    if (info.width !== selected.width || info.height !== selected.height)
      throw fail('QUALITY_ASSET_DIMENSIONS_CHANGED')
    images.push({ id, sha256: row.sha256, dataUrl: `data:${row.mime};base64,${bytes.toString('base64')}` })
  }
  return images
}
