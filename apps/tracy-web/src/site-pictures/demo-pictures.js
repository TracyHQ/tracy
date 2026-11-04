// The demo pictures of a kit's cut-out frames, as bytes (ADR 0043 section 3, the cut-out): the drawer is sent the
// demo picture a cut-out drawing replaces as a style reference only (ladder-draw.js). The kit names each frame's demo
// picture by its path on the site (`picture`, e.g. images/joomlart/hero/item-2.png). The files are read once from the
// quickstart installer zip the kit's contract names (`installer`, checked against the sha256 the contract records; the
// installer carries the site's images/ folder), else from the release's webroot tar.gz (demo-icons.js
// tarGzFilesEndingWith), and cached in the bench's file store folder under kit-demo/<kit>/ with an index of their own.
// A picture whose sha256 the kit records (`pictureSha256`) is used only when its bytes match. Nothing here stops a run:
// no archive, a failed download or a missing file reads as null, and the drawing is then made without a style
// reference.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { tarGzFilesEndingWith } from './demo-icons.js'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const pathOnly = (p) =>
  String(p ?? '')
    .split('#')[0]
    .replace(/^\/+/, '')
const INDEX = 'cutouts.json'

/** The site paths of the kit's cut-out frame pictures. */
export const demoCutoutPaths = (doc) =>
  [
    ...new Set(
      (doc?.blocks ?? []).flatMap((b) =>
        (b?.frames ?? []).filter((f) => f?.kind === 'cutout' && f.picture).map((f) => pathOnly(f.picture))
      )
    )
  ].filter(Boolean)

const none = (note) => ({ readDemo: async () => null, note })

/** The files of a zip whose name ends with one of `wanted` (a site path), by site path. */
export function zipFilesEndingWith(zipBytes, wanted) {
  const match = (name) => {
    const clean = name.replace(/^\.\//, '')
    return wanted.find((w) => clean === w || clean.endsWith(`/${w}`)) ?? null
  }
  const files = unzipSync(new Uint8Array(zipBytes), { filter: (f) => Boolean(match(f.name)) })
  const out = new Map()
  for (const [name, bytes] of Object.entries(files)) {
    const key = match(name)
    if (key && !out.has(key)) out.set(key, Buffer.from(bytes))
  }
  return out
}

// The wanted files out of the kit's installer zip, else its release's webroot, or the reasons neither could be read.
async function archiveFiles(kit, paths, { quickstart, webroot }) {
  const reasons = []
  const installer = kit?.installer
  if (quickstart && installer?.file) {
    const got = await quickstart({ release: kit.release, name: installer.file }).catch((e) => ({
      ok: false,
      reason: String(e?.message ?? e)
    }))
    if (!got?.ok) reasons.push(`the quickstart ${installer.file}: ${got?.reason ?? 'no answer'}`)
    else if (sha256(got.bytes) !== installer.sha256)
      reasons.push(`the quickstart ${installer.file} does not match the sha256 its contract records`)
    else return { files: zipFilesEndingWith(got.bytes, paths) }
  }
  if (webroot) {
    const got = await webroot(kit.release).catch((e) => ({ ok: false, reason: String(e?.message ?? e) }))
    if (got?.ok) return { files: await tarGzFilesEndingWith(got.bytes, paths) }
    reasons.push(got?.reason ?? 'no webroot')
  }
  return { reason: reasons.join('; ') || 'no release reader' }
}

/**
 * A reader of a kit's cut-out demo pictures, cached under `dir`.
 * @param {{ dir: string,
 *   quickstart?: ((a: { release: string, name: string }) => Promise<{ ok: boolean, bytes?: Buffer, reason?: string }>) | null,
 *   webroot?: ((release: string) => Promise<{ ok: boolean, bytes?: Buffer, reason?: string }>) | null }} deps
 *   `quickstart` downloads a release asset by name (the installer zip), `webroot` a release's webroot tar.gz
 * @returns {{ forKit: (kit: { ref: string, release?: string, doc: object, installer?: { file: string, sha256: string } | null })
 *   => Promise<{ readDemo: (frame: object) => Promise<Buffer | null>, note: string | null }> }}
 */
export function demoPictureReader({ dir, quickstart = null, webroot = null }) {
  return {
    async forKit(kit) {
      const paths = demoCutoutPaths(kit?.doc)
      if (!paths.length) return none(null)
      const folder = path.join(
        dir,
        'kit-demo',
        String(kit.ref ?? kit.release).replace(/[^A-Za-z0-9._-]+/g, '_')
      )
      let index = await readJson(path.join(folder, INDEX))
      if (!index || paths.some((p) => !(p in index))) {
        const got = await archiveFiles(kit, paths, { quickstart, webroot })
        if (!got.files) return none(`the cut-out demo pictures could not be read: ${got.reason}`)
        const files = got.files
        index = {}
        await mkdir(folder, { recursive: true })
        for (const p of paths) {
          const bytes = files.get(p)
          index[p] = bytes?.length ? sha256(bytes) : null
          if (index[p]) await writeOnce(path.join(folder, index[p]), bytes)
        }
        await writeOnce(path.join(folder, INDEX), Buffer.from(JSON.stringify(index)))
      }
      return {
        note: null,
        async readDemo(frame) {
          const sha = index[pathOnly(frame?.picture)]
          if (!sha) return null
          const want = typeof frame.pictureSha256 === 'string' ? frame.pictureSha256.toLowerCase() : sha
          if (want !== sha) return null
          try {
            const bytes = await readFile(path.join(folder, sha))
            return sha256(bytes) === sha ? bytes : null
          } catch {
            return null
          }
        }
      }
    }
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function writeOnce(file, bytes) {
  const temp = `${file}.${process.pid}.${Date.now()}.part`
  await writeFile(temp, bytes)
  await rename(temp, file)
}
