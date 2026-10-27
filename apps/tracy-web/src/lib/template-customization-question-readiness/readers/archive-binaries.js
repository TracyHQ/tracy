/**
 * Files out of a release archive as BYTES, for the rules that read a picture (the demo logo's size
 * and brightness) as well as text: a zip (Joomla `installer`, EmDash `source`, WordPress theme zip)
 * and a tar.gz (`webroot`). `archives.js` reads the same two formats as text, which a PNG does not
 * survive. Node built-ins only; stored and deflated zip entries, ustar / GNU / pax tar entries.
 */
import { gunzipSync, inflateRawSync } from 'node:zlib'

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

/**
 * Every file of a zip whose path passes `test`, as bytes. An entry that cannot be inflated is left out.
 * @param {Buffer} bytes
 * @param {(name: string) => boolean} test
 * @returns {Map<string, Buffer>}
 */
export function zipFiles(bytes, test) {
  const out = new Map()
  const floor = Math.max(0, bytes.length - 0xffff - 22)
  let eocd = -1
  for (let at = bytes.length - 22; at >= floor; at -= 1)
    if (bytes.readUInt32LE(at) === EOCD) {
      eocd = at
      break
    }
  if (eocd < 0) return out
  const count = bytes.readUInt16LE(eocd + 10)
  let at = bytes.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== CENTRAL) break
    const nameLength = bytes.readUInt16LE(at + 28)
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength)
    const method = bytes.readUInt16LE(at + 10)
    const compressedSize = bytes.readUInt32LE(at + 20)
    const local = bytes.readUInt32LE(at + 42)
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
    if (name.endsWith('/') || !test(name)) continue
    // The local header repeats the name and extra field at its own lengths.
    const from = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const raw = bytes.subarray(from, from + compressedSize)
    try {
      if (method === 0) out.set(name, Buffer.from(raw))
      else if (method === 8) out.set(name, inflateRawSync(raw))
    } catch {
      // A damaged entry is the same as an absent one to a rule.
    }
  }
  return out
}

/** A NUL-terminated field of a tar header. */
const field = (/** @type {Buffer} */ b, /** @type {number} */ at, /** @type {number} */ length) => {
  const raw = b.subarray(at, at + length)
  const end = raw.indexOf(0)
  return raw.toString('utf8', 0, end < 0 ? length : end)
}

/**
 * Every regular file of a tar.gz whose path passes `test`, as bytes.
 * @param {Buffer} gzipped
 * @param {(name: string) => boolean} test
 * @returns {Map<string, Buffer>}
 */
export function tarGzFiles(gzipped, test) {
  const bytes = gunzipSync(gzipped)
  const out = new Map()
  let at = 0
  let longName = null
  while (at + 512 <= bytes.length) {
    const header = bytes.subarray(at, at + 512)
    if (header.every((b) => b === 0)) break
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156] || 48)
    const prefix = field(header, 345, 155)
    const body = bytes.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0+$/, '')
      continue
    }
    if (type === 'x') {
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))
      if (path) longName = path[1]
      continue
    }
    const name = (
      longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100))
    ).replace(/^\.\//, '')
    longName = null
    if ((type === '0' || type === '\0') && test(name)) out.set(name, Buffer.from(body))
  }
  return out
}
