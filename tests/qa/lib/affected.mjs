// `pnpm qa affected`: changed paths → layers, via tests/qa/inventory/affected-map.json.
//
// Map shape (owned by W1):
//   { "schema_version": "1",
//     "rules": [ { "id": "session", "paths": ["apps/tracy-web/src/lib/session.js", "packages/x/**"],
//                  "layers": ["api", "flows"], "reason": "why these layers" } ] }
// Globs: `**` any depth, `*` within one segment, `?` one character. A changed path that matches
// no rule is "unmapped" and widens the selection to EVERY layer. A missing map does the same.
import path from 'node:path'
import { KNOWN_LAYERS } from './args.mjs'
import { readJsonFile } from './fsafe.mjs'
import { discoverLayers } from './runner.mjs'
import { validate } from './schema.mjs'

const MAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'rules'],
  properties: {
    schema_version: { const: '1' },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'paths', 'layers', 'reason'],
        properties: {
          id: { type: 'string', minLength: 1 },
          paths: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
          layers: { type: 'array', minItems: 1, items: { enum: KNOWN_LAYERS } },
          reason: { type: 'string', minLength: 1 }
        }
      }
    }
  }
}

export class AffectedError extends Error {}

export function globToRegExp(glob) {
  let re = '^'
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1
        if (glob[i + 1] === '/') {
          i += 1
          re += '(?:.*/)?'
        } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`${re}$`)
}

// Parses `git diff --name-status -z --no-renames` output: status NUL path NUL ...
export function parseNameStatus(output) {
  const parts = output.split('\0')
  if (parts.at(-1) === '') parts.pop()
  const paths = []
  for (let i = 0; i < parts.length; i += 2) {
    const status = parts[i]
    const file = parts[i + 1]
    if (!/^[ACDMRTUXB]\d*$/.test(status) || file === undefined || file === '') {
      throw new AffectedError(`unparseable git diff output near "${status}"`)
    }
    paths.push(file)
  }
  return [...new Set(paths)].sort()
}

async function resolveCommit(git, ref) {
  try {
    const out = await git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
    return out.trim()
  } catch (error) {
    throw new AffectedError(`cannot resolve git revision "${ref}": ${error.message}`)
  }
}

export async function loadAffectedMap(file) {
  const map = await readJsonFile(file)
  if (map === null) return null
  const errors = validate(MAP_SCHEMA, map)
  if (errors.length > 0) throw new AffectedError(`invalid affected-map.json: ${errors.join('; ')}`)
  return map
}

export async function computeAffected(deps, { base, head }) {
  const baseSha = await resolveCommit(deps.git, base)
  const headSha = await resolveCommit(deps.git, head)
  let changed
  try {
    changed = parseNameStatus(
      await deps.git(['diff', '--name-status', '-z', '--no-renames', baseSha, headSha, '--'])
    )
  } catch (error) {
    throw error instanceof AffectedError ? error : new AffectedError(`git diff failed: ${error.message}`)
  }
  const all = await discoverLayers(deps.layersDir)
  const selection = new Map()
  const add = (layer, why) => {
    if (!selection.has(layer)) selection.set(layer, [])
    selection.get(layer).push(why)
  }
  const mapFile = path.join(deps.inventoryDir, 'affected-map.json')
  const map = await loadAffectedMap(mapFile)
  const notes = []
  if (changed.length === 0) {
    notes.push('the diff changes no paths, so nothing is selected.')
  } else if (map === null) {
    notes.push('affected-map.json is absent (W1 owns it); every layer is selected.')
    for (const layer of all) add(layer, 'no affected-map.json')
  } else {
    const rules = map.rules.map((r) => ({ ...r, regexps: r.paths.map(globToRegExp) }))
    for (const file of changed) {
      const hits = rules.filter((r) => r.regexps.some((re) => re.test(file)))
      if (hits.length === 0) {
        notes.push(`unmapped path widens scope to all layers: ${file}`)
        for (const layer of all) add(layer, `${file} (unmapped)`)
        continue
      }
      for (const rule of hits)
        for (const layer of rule.layers) add(layer, `${file} (rule ${rule.id}: ${rule.reason})`)
    }
  }
  return { baseSha, headSha, changed, notes, selection, all }
}

export function renderAffected(result) {
  const lines = [
    `affected ${result.baseSha.slice(0, 12)}..${result.headSha.slice(0, 12)}: ${result.changed.length} changed path(s)`
  ]
  for (const note of result.notes) lines.push(`  note: ${note}`)
  if (result.selection.size === 0) lines.push('  no layer selected: the diff changes no paths')
  for (const layer of [...result.selection.keys()].sort()) {
    lines.push(`  layer ${layer}:`)
    for (const why of new Set(result.selection.get(layer))) lines.push(`    - ${why}`)
  }
  return `${lines.join('\n')}\n`
}
