/**
 * A compiled stylesheet's `.map` (source map v3), read just far enough to say which source file and
 * line a spot of the compiled CSS was built from. Reads the `.map` next to the file; PURE otherwise.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** One Base64 VLQ segment → its signed numbers. */
function vlq(segment) {
  const out = []
  let value = 0
  let shift = 0
  for (const ch of segment) {
    let digit = B64.indexOf(ch)
    if (digit < 0) return out
    const more = digit & 32
    digit &= 31
    value += digit * 2 ** shift
    if (more) shift += 5
    else {
      out.push(value % 2 ? -((value - 1) / 2) : value / 2)
      value = 0
      shift = 0
    }
  }
  return out
}

/** `mappings` → per generated line, its segments as `[column, source index, source line]` (0-based). */
export function decodeMappings(mappings) {
  const lines = []
  let src = 0
  let srcLine = 0
  for (const line of mappings.split(';')) {
    let col = 0
    const segs = []
    for (const seg of line.split(',')) {
      if (!seg) continue
      const v = vlq(seg)
      col += v[0] ?? 0
      if (v.length < 4) continue
      src += v[1]
      srcLine += v[2]
      segs.push([col, src, srcLine])
    }
    lines.push(segs)
  }
  return lines
}

/**
 * The source map of a compiled file, or null when it has none or no mappings.
 * @param {string} root @param {string} path absolute path of the compiled CSS
 * @returns {{ at: (line: number, column: number) => { source: string, line: number } | null } | null}
 *   `at` takes and returns 1-based lines; `source` is relative to the template root ('../…' outside it)
 */
export function sourceMapOf(root, path) {
  let map = null
  try {
    map = JSON.parse(readFileSync(`${path}.map`, 'utf8'))
  } catch {
    return null
  }
  if (typeof map?.mappings !== 'string' || !map.mappings.replace(/[;,]/g, '')) return null
  const sources = (map.sources ?? []).map((s) =>
    relative(root, normalize(join(dirname(path), map.sourceRoot ?? '', s)))
      .split('\\')
      .join('/')
  )
  const lines = decodeMappings(map.mappings)
  return {
    at(line, column) {
      const segs = lines[line - 1] ?? []
      let hit = null
      for (const s of segs) if (s[0] <= column) hit = s
      return hit && sources[hit[1]] ? { source: sources[hit[1]], line: hit[2] + 1 } : null
    }
  }
}
