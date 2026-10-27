#!/usr/bin/env node
// Generates what the infra layer is responsible for, from the code, and the case manifests from the
// case table. Usage:
//   node tests/qa/layers/infra/generate-denominator.mjs --write   regenerate denominator.json + cases/*.json
//   node tests/qa/layers/infra/generate-denominator.mjs --check   fail (exit 1) if either differs from disk
// Exit 2 on bad usage.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { MAX_LAYER_FILE_BYTES, readBoundedSync } from '../../lib/bounded-reader.mjs'
import { LAYER_DIR, REPO } from './lib/harness.mjs'

/** JSON as the repository formatter writes it, so the files pass `biome format` AND reproduce byte for byte. */
function render(value, name) {
  const raw = `${JSON.stringify(value, null, 2)}\n`
  const run = spawnSync(path.join(REPO, 'node_modules/.bin/biome'), ['format', `--stdin-file-path=${name}`], {
    cwd: REPO,
    input: raw,
    encoding: 'utf8'
  })
  if (run.error || run.status !== 0)
    throw new Error(`biome could not format ${name}: ${run.error?.message ?? run.stderr}`)
  return run.stdout
}

export async function generate() {
  const { extract } = await import('./lib/extract.mjs')
  const { allDefs, areaOf, manifestOf } = await import('./lib/runner.mjs')
  const files = new Map()
  files.set('denominator.json', render(extract(), 'denominator.json'))
  const byArea = new Map()
  for (const def of allDefs()) {
    const area = areaOf(def.id)
    byArea.set(area, [...(byArea.get(area) ?? []), manifestOf(def)])
  }
  for (const [area, manifests] of [...byArea].sort())
    files.set(`cases/${area}.json`, render(manifests, `cases/${area}.json`))
  return files
}

export async function main(argv) {
  const modes = argv.filter((a) => a === '--write' || a === '--check')
  if (argv.length !== 1 || modes.length !== 1) {
    console.error('usage: generate-denominator.mjs --write | --check')
    return 2
  }
  const files = await generate()
  if (modes[0] === '--write') {
    mkdirSync(path.join(LAYER_DIR, 'cases'), { recursive: true })
    for (const f of readdirSync(path.join(LAYER_DIR, 'cases')).filter((f) => f.endsWith('.json'))) {
      if (!files.has(`cases/${f}`)) rmSync(path.join(LAYER_DIR, 'cases', f))
    }
    for (const [rel, body] of files) writeFileSync(path.join(LAYER_DIR, rel), body)
    console.log(`wrote ${files.size} files`)
    return 0
  }
  const stale = []
  for (const [rel, body] of files) {
    // Absent is stale; a symlink, FIFO, oversized or shifting file is an error, never a hang.
    const bytes = readBoundedSync(path.join(LAYER_DIR, rel), {
      maxBytes: MAX_LAYER_FILE_BYTES,
      allowMissing: true
    })
    const onDisk = bytes === null ? null : bytes.toString('utf8')
    if (onDisk !== body) stale.push(rel)
  }
  for (const f of readdirSync(path.join(LAYER_DIR, 'cases'), { withFileTypes: false }).filter((f) =>
    f.endsWith('.json')
  )) {
    if (!files.has(`cases/${f}`)) stale.push(`cases/${f} (no longer generated)`)
  }
  if (stale.length > 0) {
    console.error(
      `stale: ${stale.join(', ')}\nregenerate with: node tests/qa/layers/infra/generate-denominator.mjs --write`
    )
    return 1
  }
  console.log(`up to date: ${files.size} files`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
