// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/verify-render.mjs — WordPress changes: none.
/**
 * verify-render.mjs
 * Deterministic comparison of two computed-style snapshots.
 *
 * A snapshot is: { "<selector>": { color, backgroundColor, fontFamily, ... } }
 *
 * CLI usage:
 *   node verify-render.mjs <snapshotA.json> <snapshotB.json> [--tolerance N]
 *   Exits 1 if mismatches exist, else 0.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { emitResult, takeOutputFlags } from './lib/cli-output.mjs'

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSS color string to { r, g, b } or null if unrecognised.
 * Handles: #rgb  #rrggbb  rgb(r,g,b)  rgba(r,g,b,a)
 */
function parseColor(str) {
  if (typeof str !== 'string') return null
  const s = str.trim()

  // #rgb
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = parseInt(s[1] + s[1], 16)
    const g = parseInt(s[2] + s[2], 16)
    const b = parseInt(s[3] + s[3], 16)
    return { r, g, b, a: 1 }
  }

  // #rrggbb
  if (/^#[0-9a-fA-F]{6}$/.test(s)) {
    const r = parseInt(s.slice(1, 3), 16)
    const g = parseInt(s.slice(3, 5), 16)
    const b = parseInt(s.slice(5, 7), 16)
    return { r, g, b, a: 1 }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4])
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Color-like detection
// ---------------------------------------------------------------------------

function isColorLike(val) {
  if (typeof val !== 'string') return false
  const s = val.trim()
  return /^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s) || /^rgba?\(/.test(s)
}

// ---------------------------------------------------------------------------
// Core diff
// ---------------------------------------------------------------------------

/**
 * Diff two computed-style snapshots.
 *
 * @param {Object} a  - Snapshot A  { selector: { prop: value, ... }, ... }
 * @param {Object} b  - Snapshot B
 * @param {Object} opts
 * @param {number} [opts.hexTolerance=8] - Max per-channel delta to be "equal"
 * @returns {{ mismatches: Array<{selector,property,a,b}>, checked: number }}
 */
export function diffSnapshots(a, b, opts = {}) {
  const tolerance = typeof opts.hexTolerance === 'number' ? opts.hexTolerance : 8
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255)
    throw new Error('tolerance must be between 0 and 255')
  for (const [label, snapshot] of [
    ['A', a],
    ['B', b]
  ]) {
    if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object' || !Object.keys(snapshot).length)
      throw new Error(`snapshot ${label} must contain selectors`)
    for (const [selector, props] of Object.entries(snapshot)) {
      if (!props || Array.isArray(props) || typeof props !== 'object' || !Object.keys(props).length)
        throw new Error(`snapshot ${label}: ${selector} has no properties`)
      if (Object.values(props).some((v) => typeof v !== 'string' || !v.trim()))
        throw new Error(`snapshot ${label}: ${selector} properties must be nonempty strings`)
    }
  }
  for (const [selector, properties] of Object.entries(opts.required ?? {})) {
    for (const property of properties) {
      if (!(property in (a[selector] ?? {})) || !(property in (b[selector] ?? {})))
        throw new Error(`required measurement missing: ${selector}.${property}`)
    }
  }
  const mismatches = []
  let checked = 0

  // Union of selectors
  const selectors = new Set([...Object.keys(a), ...Object.keys(b)])

  for (const selector of selectors) {
    const propsA = a[selector] && typeof a[selector] === 'object' ? a[selector] : null
    const propsB = b[selector] && typeof b[selector] === 'object' ? b[selector] : null

    if (!propsA || !propsB) {
      // Entire selector missing on one side — count each property as a mismatch
      const props = propsA ? Object.keys(propsA) : Object.keys(propsB)
      for (const property of props) {
        checked++
        mismatches.push({
          selector,
          property,
          a: propsA ? propsA[property] : undefined,
          b: propsB ? propsB[property] : undefined
        })
      }
      continue
    }

    // Union of property keys
    const properties = new Set([...Object.keys(propsA), ...Object.keys(propsB)])

    for (const property of properties) {
      checked++
      const valA = propsA[property]
      const valB = propsB[property]

      // Missing on one side
      if (valA === undefined || valB === undefined) {
        mismatches.push({ selector, property, a: valA, b: valB })
        continue
      }

      // Color comparison
      if (isColorLike(valA) || isColorLike(valB)) {
        const ca = parseColor(valA)
        const cb = parseColor(valB)

        if (!ca || !cb) {
          // Can't parse one side — fall back to string comparison
          const sA = String(valA).trim()
          const sB = String(valB).trim()
          if (sA !== sB) mismatches.push({ selector, property, a: valA, b: valB })
          continue
        }

        const maxDelta = Math.max(Math.abs(ca.r - cb.r), Math.abs(ca.g - cb.g), Math.abs(ca.b - cb.b))

        if (maxDelta > tolerance || Math.abs(ca.a - cb.a) > 0.001) {
          mismatches.push({ selector, property, a: valA, b: valB })
        }
        continue
      }

      // String comparison — normalize whitespace for fontFamily/fontSize
      const normalize = (v) => String(v).trim().replace(/\s+/g, ' ')
      if (normalize(valA) !== normalize(valB)) {
        mismatches.push({ selector, property, a: valA, b: valB })
      }
    }
  }

  return { mismatches, checked }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

// Compare decoded paths. `file://${process.argv[1]}` breaks whenever the path contains a space,
// '#' or a non-ASCII character, because import.meta.url is percent-encoded and argv[1] is not —
// the CLI then silently does nothing.
// Realpath both sides: import.meta.url is percent-encoded AND symlink-resolved, argv[1] is
// neither. See the long note in scripts/ingest/spec-pack.mjs for why getting this wrong is
// worse than it looks.
const realp = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  realp(fileURLToPath(import.meta.url)) === realp(process.argv[1])

if (isMain) {
  let args = process.argv.slice(2)
  let json = false
  let out = null
  try {
    ;({ argv: args, json, out } = takeOutputFlags(args))
  } catch (err) {
    console.error(err.message)
    process.exit(2)
  }

  const tolIdx = args.indexOf('--tolerance')
  const tolerance = tolIdx !== -1 ? Number(args[tolIdx + 1]) : undefined

  const pathA = args[0]
  const pathB = args[1]

  if (!pathA || !pathB) {
    console.error('Usage: verify-render.mjs <snapshotA.json> <snapshotB.json> [--tolerance N] [--required FILE] [--json] [--out FILE]')
    process.exit(2)
  }

  let snapshotA, snapshotB
  try {
    snapshotA = JSON.parse(readFileSync(pathA, 'utf8'))
    snapshotB = JSON.parse(readFileSync(pathB, 'utf8'))
  } catch (err) {
    console.error('Error reading snapshot files:', err.message)
    process.exit(2)
  }

  const opts = {}
  if (tolerance !== undefined) opts.hexTolerance = tolerance

  try {
    const reqIdx = args.indexOf('--required')
    if (reqIdx !== -1) opts.required = JSON.parse(readFileSync(args[reqIdx + 1], 'utf8'))
    const result = diffSnapshots(snapshotA, snapshotB, opts)
    emitResult({
      result,
      json,
      out,
      script: 'verify-render',
      label: 'diff',
      key: `${pathA}\0${pathB}`,
      protect: [pathA, pathB, reqIdx !== -1 ? args[reqIdx + 1] : null],
      summary: `mismatches=${result.mismatches.length} checked=${result.checked}`
    })
    process.exit(result.mismatches.length > 0 ? 1 : 0)
  } catch (err) {
    console.error(err.message)
    process.exit(2)
  }
}
