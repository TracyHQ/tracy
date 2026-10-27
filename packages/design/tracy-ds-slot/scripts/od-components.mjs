#!/usr/bin/env node
/**
 * `src/od-components.json`: what each OpenDesign system's reference page says its components look
 * like (src/components.mjs), for every system of the library, keyed by its folder name.
 *
 *   node scripts/od-components.mjs           write it
 *   node scripts/od-components.mjs --check   exit 1 when it differs from what the systems say now
 *
 * A file, not a read at run time: tracy-web's image carries each system's tokens.css and manifest.json
 * only (apps/tracy-web/Dockerfile), and src/ goes into the image whole. The systems are read-only
 * source data; this is derived from them and checked against them (test/components.test.mjs).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokensOf } from '@tracy/wordpress-theme/variation'
import { componentsOf } from '../src/components.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const SYSTEMS = join(ROOT, 'vendor/tracy/od-design-system/systems')
const OUT = join(HERE, '../src/od-components.json')

export function build() {
  const out = {}
  for (const key of readdirSync(SYSTEMS).sort()) {
    const html = join(SYSTEMS, key, 'components.html')
    const css = join(SYSTEMS, key, 'tokens.css')
    if (!existsSync(html) || !existsSync(css)) continue
    out[key] = componentsOf(readFileSync(html, 'utf8'), tokensOf(readFileSync(css, 'utf8')))
  }
  return `${JSON.stringify(out, null, 1)}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = build()
  if (process.argv.includes('--check')) {
    // compared as data: the repository's formatter lays the file out its own way
    const same =
      existsSync(OUT) &&
      JSON.stringify(JSON.parse(readFileSync(OUT, 'utf8'))) === JSON.stringify(JSON.parse(text))
    if (!same)
      console.error('src/od-components.json is not what the systems say: run node scripts/od-components.mjs')
    process.exit(same ? 0 : 1)
  }
  writeFileSync(OUT, text)
  console.log(`${Object.keys(JSON.parse(text)).length} systems → src/od-components.json`)
}
