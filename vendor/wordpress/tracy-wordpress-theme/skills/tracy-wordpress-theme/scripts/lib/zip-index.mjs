import { inflateRawSync } from 'node:zlib'
// What a theme zip holds, read from its central directory (no extraction): name → {crc, size}.
// Two zips that differ in a member's crc32 or size differ in that member; the compression the
// archiver chose does not matter. Zip64 archives are refused (a theme zip is megabytes).
const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

/** `bytes` (a Buffer) → Map of member name → {crc, size}; directories (names ending `/`) are left out. Throws on a zip it cannot read. */
export function zipIndex(bytes) {
  let at = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (bytes.readUInt32LE(i) === EOCD) {
      at = i
      break
    }
  if (at < 0) throw new Error('not a zip: no end-of-central-directory record')
  const entries = bytes.readUInt16LE(at + 10)
  const size = bytes.readUInt32LE(at + 12)
  const offset = bytes.readUInt32LE(at + 16)
  if (entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new Error('zip64 archives are not read')
  const out = new Map()
  let p = offset
  for (let i = 0; i < entries; i++) {
    if (p + 46 > bytes.length || bytes.readUInt32LE(p) !== CENTRAL) throw new Error(`zip central directory is cut at entry ${i}`)
    const nameLen = bytes.readUInt16LE(p + 28)
    const extraLen = bytes.readUInt16LE(p + 30)
    const commentLen = bytes.readUInt16LE(p + 32)
    const name = bytes.toString('utf8', p + 46, p + 46 + nameLen)
    if (!name.endsWith('/')) out.set(name, { crc: bytes.readUInt32LE(p + 16), size: bytes.readUInt32LE(p + 24) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** The members that differ: `{added, removed, changed}`, each a sorted list of names (relative to the zip's own top directory when both have the same one). */
export function diffZips(before, after) {
  const top = (m) => {
    const tops = new Set([...m.keys()].map((n) => n.split('/')[0]))
    return tops.size === 1 && [...m.keys()].every((n) => n.includes('/')) ? [...tops][0] : null
  }
  const rel = (m) => {
    const t = top(m)
    return t ? new Map([...m].map(([n, v]) => [n.slice(t.length + 1), v])) : m
  }
  const a = rel(before)
  const b = rel(after)
  return {
    added: [...b.keys()].filter((n) => !a.has(n)).sort(),
    removed: [...a.keys()].filter((n) => !b.has(n)).sort(),
    changed: [...b.keys()].filter((n) => a.has(n) && (a.get(n).crc !== b.get(n).crc || a.get(n).size !== b.get(n).size)).sort()
  }
}

/**
 * The text of the first member whose name satisfies `pick` (stored or deflated), or null when none does.
 * Read from the central directory like `zipIndex`; used for a theme's `style.css` header.
 */
export function zipMemberText(bytes, pick) {
  let at = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (bytes.readUInt32LE(i) === EOCD) {
      at = i
      break
    }
  if (at < 0) throw new Error('not a zip: no end-of-central-directory record')
  const entries = bytes.readUInt16LE(at + 10)
  let p = bytes.readUInt32LE(at + 16)
  for (let i = 0; i < entries; i++) {
    if (p + 46 > bytes.length || bytes.readUInt32LE(p) !== CENTRAL) throw new Error(`zip central directory is cut at entry ${i}`)
    const method = bytes.readUInt16LE(p + 10)
    const compressed = bytes.readUInt32LE(p + 20)
    const nameLen = bytes.readUInt16LE(p + 28)
    const extraLen = bytes.readUInt16LE(p + 30)
    const commentLen = bytes.readUInt16LE(p + 32)
    const local = bytes.readUInt32LE(p + 42)
    const name = bytes.toString('utf8', p + 46, p + 46 + nameLen)
    if (!name.endsWith('/') && pick(name)) {
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
      const raw = bytes.subarray(start, start + compressed)
      if (method === 0) return raw.toString('utf8')
      if (method === 8) return inflateRawSync(raw).toString('utf8')
      throw new Error(`zip member ${name}: compression method ${method} is not read`)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}
