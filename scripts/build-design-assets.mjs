#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { referoLibrary, DS_SLOT_DIR, DS_ROOT } from '../apps/tracy-web/src/lib/ds-slot.js'
import { designAssetFingerprint } from '../apps/tracy-web/src/lib/design-assets.js'

if (process.env.TRACY_DESIGN_ASSET_INDEX)
  throw new Error('Build assets from the vendored source, not a remote index.')
if (process.argv.length !== 3)
  throw new Error('Usage: node scripts/build-design-assets.mjs <output-directory>')
const output = path.resolve(process.argv[2])
await mkdir(path.join(output, 'blobs'), { recursive: true })
let total = 0
async function blob(bytes) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await writeFile(path.join(output, 'blobs', sha256), bytes)
  total += bytes.length
  return { sha256, bytes: bytes.length }
}
const systems = []
for (const row of await referoLibrary()) {
  const source = path.join(DS_ROOT, 'vendor/tracy/refero/systems', row.uuid)
  const system = JSON.parse(await readFile(path.join(source, 'design-system.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'))
  const profile = await blob(Buffer.from(JSON.stringify({ system, manifest })))
  const thumbnail = await blob(await readFile(path.join(DS_SLOT_DIR, 'refero-thumbs', `${row.uuid}.webp`)))
  systems.push({ ...row, profile, thumbnail })
}
const index = Buffer.from(
  JSON.stringify({
    schemaVersion: 'tracy-design-assets/v1',
    fingerprint: designAssetFingerprint(DS_SLOT_DIR),
    systems
  })
)
await writeFile(path.join(output, 'index.json'), index)
console.log(JSON.stringify({ systems: systems.length, indexBytes: index.length, blobBytes: total, output }))
