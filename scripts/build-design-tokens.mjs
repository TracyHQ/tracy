#!/usr/bin/env node
/**
 * Generate `apps/tracy-web/src/design-tokens.json` from the vendored design systems — see
 * `scripts/lib/design-tokens-map.mjs` for why tracy-web needs it.
 *
 * Usage:  node scripts/build-design-tokens.mjs            # writes the map
 *         node scripts/build-design-tokens.mjs --check    # exits 1 when the map is stale
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildTokenMap } from './lib/design-tokens-map.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'vendor', 'tracy', 'od-design-system')
const OUT = path.join(ROOT, 'apps', 'tracy-web', 'src', 'design-tokens.json')

const catalog = JSON.parse(readFileSync(path.join(PKG, 'catalog.json'), 'utf8'))
const map = buildTokenMap(path.join(PKG, 'systems'), catalog)
const next = `${JSON.stringify(map)}\n`

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current !== next) {
    console.error(
      'build-design-tokens: apps/tracy-web/src/design-tokens.json is stale — run `node scripts/build-design-tokens.mjs`.'
    )
    process.exit(1)
  }
  console.log(
    `build-design-tokens: design-tokens.json matches ${String(Object.keys(map.ids).length)} systems.`
  )
} else {
  writeFileSync(OUT, next)
  console.log(
    `build-design-tokens: ${String(Object.keys(map.ids).length)} systems with tokens, ${String(Object.keys(map.names).length)} names — ${String(Buffer.byteLength(next))} bytes`
  )
}
