import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { assetCache } from './asset-cache.js'

/** Source copied byte-for-byte into the image; regenerate the index when normalization changes. */
export function designAssetFingerprint(slotDirectory) {
  const hash = createHash('sha256')
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en')
    )) {
      const key = `${prefix}${entry.name}`
      if (entry.isDirectory()) visit(path.join(directory, entry.name), `${key}/`)
      else if (/\.(mjs|json)$/.test(entry.name)) {
        hash
          .update(key)
          .update('\0')
          .update(readFileSync(path.join(directory, entry.name)))
          .update('\0')
      }
    }
  }
  visit(path.join(slotDirectory, 'src'))
  for (const name of ['ds-slot.js', 'refero-names.js'])
    hash.update(name).update(readFileSync(new URL(name, import.meta.url)))
  return hash.digest('hex')
}

export function designAssets({ indexFile, origin, directory, fingerprint, fetchImpl }) {
  const bytes = readFileSync(indexFile)
  if (bytes.length > 4 * 1024 * 1024) throw new Error('Design asset index is too large.')
  const index = JSON.parse(bytes)
  if (
    index.schemaVersion !== 'tracy-design-assets/v1' ||
    index.fingerprint !== fingerprint ||
    !Array.isArray(index.systems)
  )
    throw new Error('Design asset index is incompatible; rebuild it with this Tracy version.')
  const rows = new Map()
  for (const row of index.systems) {
    if (
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.uuid) ||
      row.id !== `refero:${row.uuid}` ||
      row.ok !== true ||
      rows.has(row.uuid)
    )
      throw new Error('Invalid design asset index row.')
    for (const asset of [row.profile, row.thumbnail])
      if (
        !/^[a-f0-9]{64}$/.test(asset?.sha256 ?? '') ||
        !Number.isSafeInteger(asset?.bytes) ||
        asset.bytes < 1 ||
        asset.bytes > 16 * 1024 * 1024
      )
        throw new Error('Invalid design asset descriptor.')
    rows.set(row.uuid, row)
  }
  const cache = assetCache({ origin, directory, fetchImpl })
  return {
    library: () => index.systems.map(({ profile: _, thumbnail: __, ...row }) => ({ ...row })),
    async profile(uuid, fromRefero, gate) {
      const row = rows.get(uuid)
      if (!row) throw new Error('Unknown design system.')
      const raw = JSON.parse(await readFile(await cache.ensure(row.profile), 'utf8'))
      if (raw.manifest?.id !== uuid) throw new Error('Design system identity mismatch.')
      const profile = fromRefero(raw.system, raw.manifest)
      if (profile.id !== row.id || !gate(profile).ok) throw new Error('Design system quality check failed.')
      return profile
    },
    async screenshot(uuid) {
      const row = rows.get(uuid)
      return row ? cache.ensure(row.thumbnail) : null
    }
  }
}
