/** Pure native session-file parsing shared by measurements and usage backfill. */
import { zstdDecompressSync } from 'node:zlib'
import { scanZstdFrames } from '../session-v4-audit.mjs'

const GENERATION = /^session\.v(\d+)\.jsonl(\.zstd)?$/

/**
 * The session log dsh would open among a directory's entry names: the highest `session.vN`.
 * @param {string[]} names
 * @returns {string | null}
 */
export function newestSessionLog(names) {
  let best = null
  let version = -1
  for (const name of names) {
    const m = GENERATION.exec(name)
    if (m && Number(m[1]) > version) {
      best = name
      version = Number(m[1])
    }
  }
  return best
}

/**
 * Header and body rows of one stored log. Frame reading is `scanZstdFrames` from
 * `scripts/session-v4-audit.mjs`; the line handling is copied from its `readSessionFile`, which takes
 * a path, while `wp-business.mjs` holds bytes fetched over SSH. A torn tail is dropped, as there.
 * @param {Buffer} bytes
 * @param {boolean} compressed - a `.zstd` log (concatenated frames) rather than raw JSONL.
 * @returns {{ header: Record<string, any> | null, rows: any[] }}
 */
export function parseSessionBytes(bytes, compressed) {
  const text = compressed
    ? scanZstdFrames(bytes)
        .frames.map(({ start, end }) => zstdDecompressSync(bytes.subarray(start, end)).toString('utf8'))
        .join('')
    : bytes.toString('utf8')
  const lines = text.split('\n')
  if (!text.endsWith('\n')) lines.pop()
  const rows = []
  for (const line of lines) {
    if (line.trim() === '') continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      break
    }
  }
  const [header, ...body] = rows
  return header?.type === 'session' ? { header, rows: body } : { header: null, rows }
}
