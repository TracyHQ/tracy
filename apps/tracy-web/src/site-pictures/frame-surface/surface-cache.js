// The frame surface of a kit, computed once per kit version and quickstart archive and kept in the bench's file store
// (ADR 0043 section 3e), the way the demo icons are (demo-icons.js): kit-surface/<kit>/<quickstart sha256>.json. The
// quickstart is the installer zip the kit's contract names (`quickstart.parts.installer`), downloaded from its release
// once and checked against the sha256 the contract records; only the template's stylesheets, its ACM layouts and the
// demo data SQL are taken out of it. Nothing here stops a run: no installer named, a failed download or a hash that does
// not match gives the surface from the kit alone (every overlay "unknown"), with the reason, and is not kept, so a later
// run tries again.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { measureSurface, SURFACE_VERSION, wantedQuickstartFile } from './surface.js'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const safe = (s) => String(s ?? '').replace(/[^A-Za-z0-9._-]+/g, '_')
// Share only the same destination, release and exact measurement inputs; never retain a failed attempt.
const inFlight = new Map()

/** The files of a quickstart installer zip the surface reads, by their path in the archive, as text. */
export function quickstartFilesOf(zipBytes, template) {
  const files = unzipSync(new Uint8Array(zipBytes), {
    filter: (f) => wantedQuickstartFile(f.name.replace(/^\.\//, ''), template)
  })
  return new Map(
    Object.entries(files).map(([n, b]) => [n.replace(/^\.\//, ''), Buffer.from(b).toString('utf8')])
  )
}

/**
 * @param {{ dir: string, kit: { ref: string, release?: string, doc: object, installer?: { file: string, sha256: string } | null },
 *   kitId: string, fetchAsset?: ((a: { release: string, name: string }) => Promise<{ ok: boolean, bytes?: Buffer, reason?: string }>) | null }} input
 * @returns {Promise<{ surface: object, note: string | null }>}
 */
export async function surfaceFor(input) {
  const { dir, kit, kitId } = input
  const identity = sha256(
    Buffer.from(
      JSON.stringify({
        dir: path.resolve(dir),
        kitId,
        release: kit?.release,
        installer: kit?.installer,
        version: SURFACE_VERSION,
        doc: kit?.doc
      })
    )
  )
  if (!inFlight.has(identity))
    inFlight.set(
      identity,
      readSurface(input).finally(() => inFlight.delete(identity))
    )
  return inFlight.get(identity)
}

async function readSurface({ dir, kit, kitId, fetchAsset = null }) {
  const doc = kit?.doc
  const base = { kit: doc, contentMap: doc?.contentMap ?? null, kitId }
  const alone = (note) => ({ surface: measureSurface(base), note })
  const installer = kit?.installer
  if (!installer?.file || !/^[0-9a-f]{64}$/.test(String(installer.sha256 ?? '')))
    return alone('the contract names no quickstart installer: template overlays are unknown')
  const file = path.join(dir, 'kit-surface', safe(kitId), `${installer.sha256}.json`)
  const kept = await readFile(file, 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  if (kept?.version === SURFACE_VERSION && kept.quickstart?.sha256 === installer.sha256)
    return { surface: kept, note: null }
  if (!fetchAsset) return alone('no release reader: template overlays are unknown')
  const got = await fetchAsset({ release: kit.release, name: installer.file }).catch((e) => ({
    ok: false,
    reason: String(e?.message ?? e)
  }))
  if (!got?.ok)
    return alone(`the quickstart ${installer.file} could not be read: ${got?.reason ?? 'no answer'}`)
  if (sha256(got.bytes) !== installer.sha256)
    return alone(`the quickstart ${installer.file} does not match the sha256 its contract records`)
  const surface = measureSurface({
    ...base,
    quickstart: {
      file: installer.file,
      sha256: installer.sha256,
      files: quickstartFilesOf(got.bytes, doc?.template?.name)
    }
  })
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.part`
  await writeFile(temp, JSON.stringify(surface))
  await rename(temp, file)
  return { surface, note: null }
}
