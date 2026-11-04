// The demo pictures of a kit's cut-out frames, as bytes (ADR 0043 section 3, the cut-out): the drawer is sent the
// demo picture a cut-out drawing replaces as a style reference only (ladder-draw.js). The kit names each frame's demo
// picture by its path on the site (`picture`, e.g. images/joomlart/hero/item-2.png); the files are in the quickstart
// release's webroot tar.gz, read once as a stream (demo-icons.js tarGzFilesEndingWith) and cached in the bench's file
// store folder under kit-demo/<release>/ beside the demo icons, with an index of their own. A picture whose sha256 the
// kit records (`pictureSha256`) is used only when its bytes match. Nothing here stops a run: no webroot, a failed
// download or a missing file reads as null, and the drawing is then made without a style reference.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
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

/**
 * A reader of a kit's cut-out demo pictures, cached under `dir`.
 * @param {{ dir: string, webroot: (release: string) => Promise<{ ok: true, bytes: Buffer } | { ok: false, reason: string }> }} deps
 * @returns {{ forKit: (kit: { ref: string, release?: string, doc: object }) => Promise<{ readDemo: (frame: object) =>
 *   Promise<Buffer | null>, note: string | null }> }}
 */
export function demoPictureReader({ dir, webroot }) {
  return {
    async forKit(kit) {
      const paths = demoCutoutPaths(kit?.doc)
      if (!paths.length) return none(null)
      const folder = path.join(
        dir,
        'kit-demo',
        String(kit.release ?? kit.ref).replace(/[^A-Za-z0-9._-]+/g, '_')
      )
      let index = await readJson(path.join(folder, INDEX))
      if (!index || paths.some((p) => !(p in index))) {
        const got = await webroot(kit.release).catch((e) => ({ ok: false, reason: String(e?.message ?? e) }))
        if (!got?.ok)
          return none(`the cut-out demo pictures could not be read: ${got?.reason ?? 'no webroot'}`)
        const files = await tarGzFilesEndingWith(got.bytes, paths)
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
