// Path -> layers selection from affected-map.json. Pure functions plus a tiny CLI:
//   node tests/qa/inventory/affected.mjs path/one path/two
// Specific rules are unioned; only when none matches does the top-level directory's fallback rule apply;
// a path nothing classifies is UNKNOWN and selects every layer. The result is never empty.

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonSync } from '../lib/bounded-reader.mjs'
import { LAYERS } from './build.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CATCH_ALL = new Set(['**', '**/*', '*', '*/**', '**/**', '/**', ''])

/** Compile a glob (`**`, `*`, `?`, `{a,b}`) to an anchored RegExp over `/`-separated repo-relative paths. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 2
        } else {
          re += '.*'
          i += 1
        }
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      if (end < 0) throw new Error(`unclosed { in glob: ${glob}`)
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&'))
        .join('|')})`
      i = end
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export const loadMap = (path = join(HERE, 'affected-map.json')) =>
  readBoundedJsonSync(path, { maxBytes: MAX_LAYER_FILE_BYTES })

/** Structural validation of the map; returns a list of problems (empty = valid). */
export function validateMap(map) {
  const problems = []
  if (!map || !Array.isArray(map.rules) || map.rules.length === 0) return ['rules must be a non-empty array']
  if (
    !Array.isArray(map.unknown?.layers) ||
    map.unknown.layers.length !== LAYERS.length ||
    !LAYERS.every((l) => map.unknown.layers.includes(l))
  )
    problems.push('unknown.layers must list every layer')
  const ids = new Set()
  for (const rule of map.rules) {
    const where = `rule ${rule?.id ?? '?'}`
    if (typeof rule?.id !== 'string' || rule.id === '') problems.push('rule without id')
    else if (ids.has(rule.id)) problems.push(`${where}: duplicate id`)
    else ids.add(rule.id)
    if (!Array.isArray(rule.globs) || rule.globs.length === 0)
      problems.push(`${where}: globs must be non-empty`)
    for (const g of rule.globs ?? []) {
      if (typeof g !== 'string' || CATCH_ALL.has(g))
        problems.push(`${where}: catch-all or invalid glob "${g}"`)
      else
        try {
          globToRegExp(g)
        } catch (error) {
          problems.push(`${where}: ${error.message}`)
        }
    }
    if (!Array.isArray(rule.layers) || rule.layers.length === 0)
      problems.push(`${where}: layers must be non-empty`)
    else for (const l of rule.layers) if (!LAYERS.includes(l)) problems.push(`${where}: unknown layer "${l}"`)
    if (typeof rule.reason !== 'string' || rule.reason.trim() === '')
      problems.push(`${where}: reason required`)
    if (typeof rule.source !== 'string' || rule.source.trim() === '')
      problems.push(`${where}: source required`)
  }
  return problems
}

const normalizePath = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '')

/**
 * Select layers for changed paths. `perPath` explains every choice; `unknown` lists paths no rule
 * classified (they select every layer). Throws on an invalid map or an empty path list: asking about
 * no files must not read as "nothing to run".
 */
export function selectLayers(paths, map = loadMap()) {
  const problems = validateMap(map)
  if (problems.length) throw new Error(`affected-map invalid: ${problems.join('; ')}`)
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('no paths given')
  const compiled = map.rules.map((rule) => ({ rule, res: rule.globs.map(globToRegExp) }))
  const layers = new Set()
  const extras = new Set()
  const unknown = []
  const perPath = []
  for (const raw of paths) {
    const path = normalizePath(String(raw))
    if (path === '' || path.startsWith('/') || path.split('/').includes('..')) {
      unknown.push(path)
      for (const l of map.unknown.layers) layers.add(l)
      perPath.push({
        path,
        rules: [],
        layers: [...map.unknown.layers],
        unknown: true,
        reason: 'path is empty, absolute or leaves the repo'
      })
      continue
    }
    const hits = compiled.filter(({ res }) => res.some((r) => r.test(path)))
    let chosen = hits.filter(({ rule }) => !rule.fallback)
    if (chosen.length === 0) chosen = hits.filter(({ rule }) => rule.fallback)
    if (chosen.length === 0) {
      unknown.push(path)
      for (const l of map.unknown.layers) layers.add(l)
      perPath.push({
        path,
        rules: [],
        layers: [...map.unknown.layers],
        unknown: true,
        reason: map.unknown.reason
      })
      continue
    }
    const mine = new Set()
    for (const { rule } of chosen) {
      for (const l of rule.layers) {
        layers.add(l)
        mine.add(l)
      }
      for (const e of rule.extras ?? []) extras.add(e)
    }
    perPath.push({
      path,
      rules: chosen.map(({ rule }) => rule.id),
      layers: LAYERS.filter((l) => mine.has(l)),
      unknown: false,
      reason: chosen.map(({ rule }) => `${rule.id}: ${rule.reason}`).join(' | ')
    })
  }
  return { layers: LAYERS.filter((l) => layers.has(l)), extras: [...extras].sort(), unknown, perPath }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2)
  try {
    const r = selectLayers(paths)
    for (const p of r.perPath)
      process.stdout.write(
        `${p.path}\n  -> ${p.layers.join(', ')}${p.unknown ? '  (UNKNOWN: widened to every layer)' : ''}\n  ${p.reason}\n`
      )
    process.stdout.write(
      `layers: ${r.layers.join(', ')}${r.extras.length ? `; also: ${r.extras.join(', ')}` : ''}\n`
    )
  } catch (error) {
    process.stderr.write(`${error.message}\nusage: node tests/qa/inventory/affected.mjs <changed path>...\n`)
    process.exitCode = 2
  }
}
