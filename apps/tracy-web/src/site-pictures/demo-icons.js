// The demo icons of a kit, as bytes (#345): the icon step measures the weight, colour and plate of each demo icon a
// new icon replaces (icons/icon-style.js, icons/icon-ink.js). The kit names each icon frame's demo picture by its path
// on the site (`picture`, e.g. images/joomlart/icons/icon-1.png), and the kit's own zip carries only block shots; the
// demo pictures are in the quickstart release's webroot tar.gz. The first time a kit release is read, its webroot is
// downloaded once, every icon frame's picture is taken out of it while it is unpacked as a stream (the whole archive
// is never held unpacked), and the icons are cached in the bench's file store folder under kit-demo/<release>/; later
// runs read the cache. A picture whose sha256 the kit records (`pictureSha256`) is used only when its bytes match.
// Nothing here stops a run: no webroot, a failed download or a missing icon reads as null, and the icon step then
// renders without a measured style (its note says so).
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const pathOnly = (p) =>
  String(p ?? '')
    .split('#')[0]
    .replace(/^\/+/, '')
const INDEX = 'index.json'

/** The site paths of the kit's icon frame pictures. */
export const demoIconPaths = (doc) =>
  [
    ...new Set(
      (doc?.blocks ?? []).flatMap((b) =>
        (b?.frames ?? []).filter((f) => f?.kind === 'icon' && f.picture).map((f) => pathOnly(f.picture))
      )
    )
  ].filter(Boolean)

const field = (b, at, length) => {
  const raw = b.subarray(at, at + length)
  const end = raw.indexOf(0)
  return raw.toString('utf8', 0, end < 0 ? length : end)
}

/**
 * The files of a tar.gz whose name ends with one of `wanted` (a site path; the archive may put a folder in front),
 * read as a stream; the first match of a path wins. Ustar names, GNU long names and pax `path` records.
 * @param {Buffer} gzipped
 * @param {string[]} wanted site paths
 * @returns {Promise<Map<string, Buffer>>} by site path
 */
export async function tarGzFilesEndingWith(gzipped, wanted) {
  const want = new Set(wanted)
  const match = (name) => {
    const clean = name.replace(/^\.\//, '')
    if (want.has(clean)) return clean
    for (const w of want) if (clean.endsWith(`/${w}`)) return w
    return null
  }
  const out = new Map()
  let buf = Buffer.alloc(0)
  let entry = null // { left, pad, chunks, key, kind }: the body still to read, then its padding
  let skip = 0 // the padding after a body
  let longName = null
  for await (const chunk of Readable.from([gzipped]).pipe(createGunzip())) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    for (;;) {
      if (skip) {
        const n = Math.min(skip, buf.length)
        skip -= n
        buf = buf.subarray(n)
        if (skip) break
      }
      if (entry) {
        const take = Math.min(entry.left, buf.length)
        // Only a wanted file and a long name record are kept; every other body is skipped as it streams by.
        if (entry.key || entry.kind === 'L' || entry.kind === 'x') entry.chunks.push(buf.subarray(0, take))
        entry.left -= take
        buf = buf.subarray(take)
        if (entry.left > 0) break
        const body = Buffer.concat(entry.chunks)
        skip = entry.pad
        if (entry.kind === 'L') longName = body.toString('utf8').replace(/\0+$/, '')
        else if (entry.kind === 'x')
          longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))?.[1] ?? null
        else if (entry.key && !out.has(entry.key)) out.set(entry.key, body)
        entry = null
        if (out.size === want.size) return out
        continue
      }
      if (buf.length < 512) break
      const header = buf.subarray(0, 512)
      buf = buf.subarray(512)
      if (header.every((b) => b === 0)) continue
      const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8)
      const type = String.fromCharCode(header[156] || 48)
      const prefix = field(header, 345, 155)
      const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100))
      const kind = type === 'L' || type === 'x' ? type : type === '0' || type === '\0' ? 'file' : 'other'
      if (kind !== 'L' && kind !== 'x') longName = null
      const pad = Math.ceil(size / 512) * 512 - size
      entry = { left: size, pad, chunks: [], kind, key: kind === 'file' ? match(name) : null }
      if (size === 0) {
        if (entry.key && !out.has(entry.key)) out.set(entry.key, Buffer.alloc(0))
        entry = null
      }
    }
  }
  return out
}

/**
 * A reader of a kit's demo icons, cached under `dir`.
 * @param {{ dir: string, webroot: (release: string) => Promise<{ ok: true, bytes: Buffer } | { ok: false, reason: string }> }} deps
 *   `webroot` downloads the release's webroot tar.gz
 * @returns {{ forKit: (kit: { ref: string, release: string, doc: object }) => Promise<{ readDemo: (frame: object) =>
 *   Promise<Buffer | null>, note: string | null }> }}
 */
export function demoIconReader({ dir, webroot }) {
  return {
    async forKit(kit) {
      const paths = demoIconPaths(kit?.doc)
      const none = (note) => ({ readDemo: async () => null, note })
      if (!paths.length) return none(null)
      const folder = path.join(
        dir,
        'kit-demo',
        String(kit.release ?? kit.ref).replace(/[^A-Za-z0-9._-]+/g, '_')
      )
      let index = await readIndex(folder)
      if (!index || paths.some((p) => !(p in index))) {
        const got = await webroot(kit.release).catch((e) => ({ ok: false, reason: String(e?.message ?? e) }))
        if (!got?.ok) return none(`the demo icons could not be read: ${got?.reason ?? 'no webroot'}`)
        const files = await tarGzFilesEndingWith(got.bytes, paths)
        index = {}
        await mkdir(folder, { recursive: true })
        for (const p of paths) {
          const bytes = files.get(p)
          if (!bytes) {
            index[p] = null
            continue
          }
          const sha = sha256(bytes)
          await writeOnce(path.join(folder, sha), bytes)
          index[p] = sha
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

async function readIndex(folder) {
  try {
    return JSON.parse(await readFile(path.join(folder, INDEX), 'utf8'))
  } catch {
    return null
  }
}

async function writeOnce(file, bytes) {
  const temp = `${file}.${process.pid}.${Date.now()}.part`
  await writeFile(temp, bytes)
  await rename(temp, file)
}
