#!/usr/bin/env node
// Regenerates denominator.json and cases/*.json. `--check` writes nothing and exits 1 when the files on disk differ.
//   node tests/qa/layers/related/generate.mjs [--check]
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicWrite, canonicalJson, formatWithBiome } from '../cms/lib/kit.mjs'
import { MAX_LAYER_FILE_BYTES, readBoundedAsync } from '../../lib/bounded-reader.mjs'
import { assertDenominator } from '../../lib/denominator.mjs'
import { buildDenominator, buildManifests, LAYER } from './specs/index.mjs'

export const COMMAND = 'node tests/qa/layers/related/generate.mjs'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')

export function generateFiles(repoRoot = REPO) {
  const manifests = buildManifests(repoRoot)
  const ids = new Set()
  for (const m of manifests) {
    if (ids.has(m.id)) throw new Error(`generated two cases with the id ${m.id}`)
    ids.add(m.id)
  }
  const denominator = assertDenominator({ layer: LAYER, ...buildDenominator(COMMAND) }, LAYER)
  const known = new Set(denominator.items.map((i) => i.id))
  for (const m of manifests)
    for (const item of m.itemIds)
      if (!known.has(item)) throw new Error(`${m.id} names the item ${item}, which is not in the denominator`)
  const groups = new Map()
  for (const m of manifests) groups.set(m.area, [...(groups.get(m.area) ?? []), m])
  const files = { 'denominator.json': canonicalJson(denominator) }
  for (const [group, list] of groups)
    files[`cases/${group}.json`] = canonicalJson(list.sort((a, b) => a.id.localeCompare(b.id)))
  for (const key of Object.keys(files))
    files[key] = formatWithBiome(repoRoot, `tests/qa/layers/related/${key}`, files[key])
  return { files, manifests, denominator }
}

async function main() {
  const check = process.argv.includes('--check')
  const unknown = process.argv.slice(2).filter((a) => a !== '--check')
  if (unknown.length) {
    process.stderr.write(`unknown argument ${unknown[0]}\n`)
    return 2
  }
  const { files, manifests, denominator } = generateFiles()
  const stale = []
  const existing = new Set(
    (await fs.readdir(path.join(HERE, 'cases')).catch(() => [])).map((n) => `cases/${n}`)
  )
  for (const [rel, content] of Object.entries(files)) {
    const onDisk = await readBoundedAsync(path.join(HERE, rel), {
      maxBytes: MAX_LAYER_FILE_BYTES,
      allowMissing: true
    })
    const current = onDisk === null ? null : onDisk.toString('utf8')
    existing.delete(rel)
    if (current !== content) stale.push(rel)
  }
  for (const rel of existing) stale.push(`${rel} (no longer generated)`)
  if (check) {
    if (stale.length) {
      process.stderr.write(
        `related layer is out of date; run ${COMMAND}\n${stale.map((s) => `  ${s}`).join('\n')}\n`
      )
      return 1
    }
    process.stdout.write(
      `related layer up to date: ${denominator.items.length} items, ${manifests.length} cases (${denominator.revision})\n`
    )
    return 0
  }
  await fs.mkdir(path.join(HERE, 'cases'), { recursive: true })
  for (const rel of existing) await fs.rm(path.join(HERE, rel))
  for (const [rel, content] of Object.entries(files)) await atomicWrite(path.join(HERE, rel), content)
  process.stdout.write(
    `wrote ${Object.keys(files).length} files: ${denominator.items.length} items, ${manifests.length} cases (${denominator.revision})\n`
  )
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main()
