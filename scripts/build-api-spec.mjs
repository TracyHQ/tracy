#!/usr/bin/env node
/**
 * Write `apps/tracy-web/api-reference.snapshot.json`: the public AND internal API references, built by
 * the same `buildOpenApi` that `/docs/api` serves, reduced to their CONTRACT.
 *
 * WHY A SNAPSHOT. The reference is built from the door's own tables at request time, so it can never
 * disagree with the code — which also means a route or a field can leave the API without any file
 * saying so. The snapshot is the last agreed shape, committed; the `api-spec` gate
 * (`scripts/check-api-spec.ts`) rebuilds the documents and names every difference, and a difference
 * that breaks a caller is red until the API version moves.
 *
 * WHAT "CONTRACT" MEANS HERE. Keys sorted, `servers` dropped (the origin belongs to the deployment,
 * not the API), and prose dropped — `description`, `summary`, `example(s)`: rewording a sentence is
 * not an API change and must not ask for a changelog line. Property names are never stripped: a
 * schema property literally called `description` stays.
 *
 * `recorded` is the date the PUBLIC part last changed. It moves only when that part changes, so
 * regenerating an unchanged API keeps the file byte-identical, and the gate can hold
 * `docs/references/api-changelog.md` to it without reading the clock.
 *
 * Usage:  pnpm api:snapshot     (node scripts/build-api-spec.mjs, then biome format on the file)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOpenApi } from '../apps/tracy-web/src/api-reference/spec.js'
import { APPLY_ACTIONS, applyToolsetLabel } from '../apps/tracy-web/src/sites/route.js'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SNAPSHOT_PATH = path.join(ROOT, 'apps', 'tracy-web', 'api-reference.snapshot.json')

/** Any origin: it is dropped from the snapshot, it only has to be a valid URL. */
const ORIGIN = 'https://api.example'

/** Keys whose value is words for people, not contract. */
const PROSE = new Set(['description', 'summary', 'example', 'examples'])

/** Objects whose keys are NAMES (a property, a path, a status), never keywords to strip. */
const NAMED_MAPS = new Set([
  'properties',
  'patternProperties',
  'schemas',
  'paths',
  'responses',
  'securitySchemes',
  'content',
  '$defs'
])

/**
 * Both references, as `buildOpenApi` builds them for `/docs/api` and `/ops/api`.
 * @returns {{ public: object, internal: object }}
 */
export function buildDocuments() {
  const input = { origin: ORIGIN, applyActions: APPLY_ACTIONS, toolsetOf: applyToolsetLabel }
  return { public: buildOpenApi(input), internal: buildOpenApi({ ...input, internal: true }) }
}

/**
 * One document reduced to its contract: sorted keys, no `servers`, no prose.
 * @param {unknown} node
 * @param {string | null} [parentKey] the key this node sits under
 * @returns {unknown}
 */
export function normalize(node, parentKey = null) {
  if (Array.isArray(node)) return node.map((item) => normalize(item, null))
  if (node === null || typeof node !== 'object') return node
  const named = parentKey !== null && NAMED_MAPS.has(parentKey)
  const out = {}
  for (const key of Object.keys(node).sort()) {
    if (!named && PROSE.has(key)) continue
    if (parentKey === null && key === 'servers') continue
    if (node[key] === undefined) continue
    out[key] = normalize(node[key], named ? null : key)
  }
  return out
}

/**
 * The snapshot to write, given the documents and the snapshot already on disk.
 * @param {{ public: object, internal: object }} documents already normalized
 * @param {{ recorded?: string, public?: object } | null} previous the committed snapshot, if any
 * @param {string} today YYYY-MM-DD
 * @returns {{ recorded: string, public: object, internal: object }}
 */
export function nextSnapshot(documents, previous, today) {
  const unchanged = previous?.public && JSON.stringify(previous.public) === JSON.stringify(documents.public)
  const recorded = unchanged && previous.recorded ? previous.recorded : today
  return { recorded, public: documents.public, internal: documents.internal }
}

/** Today's date on this machine, YYYY-MM-DD (the same calendar a person writes the changelog in). */
export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The committed snapshot, or null. */
export function readSnapshot(file = SNAPSHOT_PATH) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

function main() {
  const built = buildDocuments()
  const documents = { public: normalize(built.public), internal: normalize(built.internal) }
  const previous = readSnapshot()
  const snapshot = nextSnapshot(documents, previous, localDate())
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
  const moved = previous?.recorded !== snapshot.recorded
  process.stdout.write(
    `build-api-spec: wrote ${path.relative(ROOT, SNAPSHOT_PATH)} (public part recorded ${snapshot.recorded}` +
      `${moved ? ', changed — add a dated line to docs/references/api-changelog.md' : ''})\n`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
