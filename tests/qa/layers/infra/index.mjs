// Layer module contract (tests/qa/layers/<layer>): `layer`, `listCases`, `run`.
// Contract files are read through the shared bounded reader in tests/qa/lib.
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonSync } from '../../lib/bounded-reader.mjs'
import { setScratchBase } from './lib/scratch.mjs'
import { LAYER_DIR } from './lib/harness.mjs'
import { AREAS, allDefs, areaOf, createMutantStore, manifestOf, runCase } from './lib/runner.mjs'

export const layer = 'infra'
export const areas = AREAS

export class ContractError extends Error {}

const REQUIRED = [
  'id',
  'itemIds',
  'requirement',
  'oracle',
  'edgeTags',
  'targets',
  'effects',
  'prerequisites',
  'assertionIds',
  'redProof',
  'legacyIds'
]

export function validateManifest(manifest) {
  for (const key of REQUIRED) {
    if (!(key in manifest)) throw new ContractError(`case ${manifest.id ?? '?'}: missing ${key}`)
  }
  if (!/^QA-INFRA-[A-Za-z0-9._-]+$/.test(manifest.id)) throw new ContractError(`bad case id ${manifest.id}`)
  if (!Array.isArray(manifest.itemIds) || manifest.itemIds.length === 0)
    throw new ContractError(`${manifest.id}: itemIds must not be empty`)
  for (const key of ['source', 'ref', 'invariant']) {
    if (typeof manifest.oracle?.[key] !== 'string' || manifest.oracle[key] === '')
      throw new ContractError(`${manifest.id}: oracle.${key} is empty`)
  }
  for (const target of manifest.targets) {
    if (!['local', 'dev', 'prod'].includes(target))
      throw new ContractError(`${manifest.id}: bad target ${target}`)
  }
}

/** Read cases/*.json. Fails (ContractError) on unreadable/malformed files and on drift from the code. */
export function readManifests(casesDir = path.join(LAYER_DIR, 'cases')) {
  const out = []
  let files
  try {
    files = readdirSync(casesDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  } catch (error) {
    throw new ContractError(`cannot read ${casesDir}: ${error.message}`)
  }
  if (files.length === 0) throw new ContractError(`no case manifests in ${casesDir}`)
  for (const file of files) {
    let parsed
    try {
      parsed = readBoundedJsonSync(path.join(casesDir, file), { maxBytes: MAX_LAYER_FILE_BYTES })
    } catch (error) {
      throw new ContractError(`${file} is not readable JSON: ${error.message}`)
    }
    if (!Array.isArray(parsed)) throw new ContractError(`${file} must hold an array of case manifests`)
    for (const manifest of parsed) {
      validateManifest(manifest)
      out.push(manifest)
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1))
}

export async function listCases({ area } = {}) {
  if (area !== undefined && !AREAS.includes(area))
    throw new ContractError(`unknown area ${area}; known: ${AREAS.join(', ')}`)
  const manifests = readManifests()
  const defs = new Map(allDefs().map((d) => [d.id, d]))
  const ids = new Set()
  for (const manifest of manifests) {
    const def = defs.get(manifest.id)
    if (!def) throw new ContractError(`manifest ${manifest.id} has no implementation`)
    if (JSON.stringify(manifest) !== JSON.stringify(manifestOf(def)))
      throw new ContractError(
        `manifest ${manifest.id} drifted from its implementation; regenerate with generate-denominator.mjs --write`
      )
    ids.add(manifest.id)
  }
  for (const id of defs.keys())
    if (!ids.has(id))
      throw new ContractError(
        `implementation ${id} has no manifest; regenerate with generate-denominator.mjs --write`
      )
  return area === undefined ? manifests : manifests.filter((m) => areaOf(m.id) === area)
}

export async function run({ cases, target = 'local', proveRed = false, outDir }) {
  if (!outDir) throw new ContractError('run() needs outDir')
  const defs = new Map(allDefs().map((d) => [d.id, d]))
  setScratchBase(outDir)
  const store = createMutantStore(outDir)
  const results = []
  try {
    for (const manifest of cases) {
      const def = defs.get(manifest.id)
      if (!def) throw new ContractError(`unknown case ${manifest.id}`)
      results.push(await runCase(def, { target, proveRed, outDir, store }))
    }
  } finally {
    store.cleanup()
    setScratchBase(undefined)
  }
  return results
}
