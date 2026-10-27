// Per-route result cache for the verify tools (http-parity, review/scan).
//
// A second verify run after an edit that touched three pages re-measures all forty; the cache
// lets it re-measure three. The key is everything a tool's verdict depends on, and nothing it
// does not:
//
//   sha256(source HTML the tool compared)   — the snapshot or rendered page (parity only)
//   sha256(target HTML the tool measured)   — fetched once, cheaply, before the browser runs
//   TOOL_VERSION                            — a constant in each tool, bumped when its logic changes
//   theme fingerprint                       — sha256 of style.css + theme.json + assets/css/*,
//                                             because a scanner's verdict is about RENDERED CSS
//                                             and the HTML alone does not carry it
//   extra                                   — the review config, the accept list: inputs to the
//                                             verdict that are neither page nor theme
//
// A hit is a valid piece of evidence only because the report says `cached: true` on the entry
// and `cached N/M` in the summary — a reviewer can always tell what was measured this run. A
// release run passes --no-cache and measures everything.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const sha256 = (text) => createHash('sha256').update(text ?? '').digest('hex')

export function cacheKey({ sourceHtml = null, targetHtml = null, toolVersion, theme = '', extra = '' }) {
  if (toolVersion === undefined) throw new Error('cacheKey needs toolVersion')
  return sha256(
    [
      'source:' + sha256(sourceHtml ?? ''),
      'target:' + sha256(targetHtml ?? ''),
      'tool:' + String(toolVersion),
      'theme:' + theme,
      'extra:' + sha256(typeof extra === 'string' ? extra : JSON.stringify(extra ?? ''))
    ].join('\n')
  )
}

// The files that decide how a page paints: style.css, theme.json and every stylesheet under
// assets/css. Templates and patterns are markup — the target HTML already carries them.
export function themeFingerprint(themeDir) {
  if (!themeDir || !fs.existsSync(themeDir)) return ''
  const files = ['style.css', 'theme.json'].map((f) => path.join(themeDir, f))
  const cssDir = path.join(themeDir, 'assets', 'css')
  if (fs.existsSync(cssDir))
    for (const f of fs.readdirSync(cssDir).sort()) if (/\.css$/.test(f)) files.push(path.join(cssDir, f))
  const h = createHash('sha256')
  for (const f of files) {
    if (!fs.existsSync(f)) continue
    h.update(path.relative(themeDir, f) + '\n')
    h.update(fs.readFileSync(f))
    h.update('\n')
  }
  return h.digest('hex')
}

export class RouteCache {
  constructor(dir, { enabled = true } = {}) {
    this.dir = dir
    this.enabled = Boolean(dir) && enabled
    this.hits = 0
    this.misses = 0
  }
  file(tool, key) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error(`cache key is not a sha256: ${key}`)
    return path.join(this.dir, tool, `${key}.json`)
  }
  get(tool, key) {
    if (!this.enabled) return null
    const f = this.file(tool, key)
    if (!fs.existsSync(f)) {
      this.misses++
      return null
    }
    try {
      const v = JSON.parse(fs.readFileSync(f, 'utf8'))
      this.hits++
      return v
    } catch {
      this.misses++
      return null
    }
  }
  put(tool, key, value) {
    if (!this.enabled) return
    const f = this.file(tool, key)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify(value))
  }
}
