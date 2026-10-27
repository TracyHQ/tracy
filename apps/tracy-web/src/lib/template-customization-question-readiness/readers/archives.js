/**
 * Text files out of the two archive kinds a release carries: a zip (a Joomla `installer`, an EmDash
 * `source`, a WordPress theme `wp-<theme>-<version>.zip`) and a tar.gz (a `webroot`). Node built-ins
 * only; the zip half is the central-directory reader `setting-proposal.js` already uses.
 */
import { gunzipSync } from 'node:zlib'

import { fileIn, namesIn } from '../../setting-proposal.js'

/**
 * Every file of a zip whose path passes `test`, as text, in the zip's own order.
 * @param {Buffer} bytes
 * @param {(name: string) => boolean} test
 * @returns {Map<string, string>}
 */
export function zipTexts(bytes, test) {
  const out = new Map()
  for (const name of namesIn(bytes)) {
    if (name.endsWith('/') || !test(name)) continue
    const text = fileIn(bytes, name)
    if (text !== null) out.set(name, text)
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
 * Every regular file of a tar.gz whose path passes `test`, as text. Reads ustar, GNU long names
 * (`L`) and pax `path` records (`x`), the three a `tar czf` on macOS or Linux writes.
 * @param {Buffer} gzipped
 * @param {(name: string) => boolean} test
 * @returns {Map<string, string>}
 */
export function tarGzTexts(gzipped, test) {
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
    if ((type === '0' || type === '\0') && test(name)) out.set(name, body.toString('utf8'))
  }
  return out
}

/**
 * Every member of a tar.gz as `{ name, type, mode }` (mode = the permission bits, `0o7777` mask),
 * names read like `tarGzTexts` reads them. Pax (`x`, `g`) and GNU long-name (`L`, `K`) records are
 * headers of the next member, not members.
 * @param {Buffer} gzipped
 * @returns {{ name: string, type: string, mode: number }[]}
 */
export function tarGzMembers(gzipped) {
  const bytes = gunzipSync(gzipped)
  const out = []
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
    if (type === 'g' || type === 'K') continue
    const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100))
    longName = null
    const mode = Number.parseInt(field(header, 100, 8).trim() || '0', 8) & 0o7777
    out.push({ name, type: type === '\0' ? '0' : type, mode })
  }
  return out
}
