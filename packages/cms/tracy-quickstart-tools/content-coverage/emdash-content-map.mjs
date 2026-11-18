#!/usr/bin/env node
// Generate the content map of an EmDash theme into its contract folder, or check that the committed one is current.
// An EmDash theme declares its content in files (seed, field map, content API map), so there is nothing to capture:
// see lib/emdash-content-map.mjs.
//
//   node packages/cms/tracy-quickstart-tools/content-coverage/emdash-content-map.mjs --theme <theme folder> [--write | --check]
//
// --write  writes <theme>/contracts/<version>/content-map.json (the Slot fit the audit measured into the old file is kept
//          only if the rest of the map is unchanged; otherwise measure again with emdash-audit.mjs --fit)
// --check  exit 1 when the committed map differs from what the theme's files generate (Slot fit is ignored)
// default  prints the label rules (R2 to R9, no crawl) of the generated map
//
// Exit: 0 ok · 1 not current, or a label rule fails · 2 usage or unreadable input.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { emdashContentMapOfTheme, serializeMap, withoutMeasured } from './lib/emdash-content-map.mjs'
import { labelRulesOf } from './lib/label-rules.mjs'

const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i > 0 ? process.argv[i + 1] : undefined
}
const flag = (n) => process.argv.includes(n)
const theme = arg('--theme')
if (!theme) {
  console.error('usage: emdash-content-map.mjs --theme <theme folder> [--write | --check]')
  process.exit(2)
}

let built
try {
  built = emdashContentMapOfTheme(resolve(theme))
} catch (e) {
  console.error(`emdash-content-map: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(2)
}
const dir = join(resolve(theme), 'contracts', built.version)
const file = join(dir, 'content-map.json')

if (flag('--write')) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, serializeMap(built.map))
  console.log(`wrote ${file}: ${built.map.slots.length} slots, ${built.map.pages.length} pages`)
}

if (flag('--check')) {
  if (!existsSync(file)) {
    console.error(`content-map-missing ${file}: run emdash-content-map.mjs --theme ${theme} --write`)
    process.exit(1)
  }
  const committed = withoutMeasured(JSON.parse(readFileSync(file, 'utf8')))
  if (serializeMap(committed) !== serializeMap(withoutMeasured(built.map))) {
    console.error(
      `content-map-stale ${file}: it differs from what the theme's seed, field map and content API map generate; run emdash-content-map.mjs --theme ${theme} --write`
    )
    process.exit(1)
  }
}

const res = labelRulesOf({ map: built.map, pages: [], holes: [] })
if (!res.applies) {
  console.log(`label rules: not applicable (vocabulary ${res.roleVocabularyVersion ?? 'none'})`)
  process.exit(0)
}
const failing = Object.entries(res.rules).filter(([, r]) => r.count > 0)
for (const [id, r] of failing)
  console.log(`label-rule-${id} ${r.count} ${r.title}: ${r.keys.slice(0, 8).join(' ')}`)
console.log(`label rules: ${failing.length} failing (R8 and R9 need a crawl)`)
process.exit(failing.length ? 1 : 0)
