#!/usr/bin/env node
// Reads what a kit says each page prints and fails when a section that holds visual content-map slots is no kit block.
//
//   node ingest/kit-sections-check.mjs [--kit <template-kit.json>] [--map <content-map.json>] [--sections <emdash-sections.json>]
//
// `--kit` is required; `--map` defaults to this theme's contracts/0.1.0/content-map.json.
// It runs the same judge Road to live runs (`sectionsMissingFromKit`, apps/tracy-web/src/lib/template-readiness/kit-modules-check.js)
// and, when `--sections` is given, also lists every top-level part of a page that has stamps but no class of its own
// (such a part cannot be captured as a block). Exit code 1 when anything is listed; the last line is `kit-sections-check: N`.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? resolve(process.argv[i + 1]) : fallback
}
const kitPath = arg('kit', null)
if (!kitPath) {
  console.error(
    'usage: kit-sections-check.mjs --kit <template-kit.json> [--map <content-map.json>] [--sections <emdash-sections.json>]'
  )
  process.exit(2)
}
const mapPath = arg('map', resolve(pkg, 'contracts/0.1.0/content-map.json'))
const sectionsPath = arg('sections', null)
const kit = JSON.parse(readFileSync(kitPath, 'utf8'))
const map = JSON.parse(readFileSync(mapPath, 'utf8'))
const judge = await import(
  pathToFileURL(resolve(pkg, '../../../apps/tracy-web/src/lib/template-readiness/kit-modules-check.js')).href
)
let count = 0
const missing = judge.sectionsMissingFromKit(kit, map)
if (missing === null) {
  console.log('the kit has no sectionsOfPage: build it with --reread-sections')
  count++
} else {
  for (const m of missing) {
    console.log(
      `section ${m.section} (${m.slots} visual slots) is printed on ${m.pages.join(', ')} and is no kit block`
    )
    count++
  }
}
if (sectionsPath) {
  const doc = JSON.parse(readFileSync(sectionsPath, 'utf8'))
  const seen = new Set()
  for (const [path, parts] of Object.entries(doc.pages ?? {}))
    for (const where of ['before', 'main', 'after'])
      for (const p of parts[where] ?? []) {
        if (!p.shown || !p.stamps?.length || p.classes?.length) continue
        const key = `${p.selector}`
        if (seen.has(key)) continue
        seen.add(key)
        console.log(`part ${p.selector} on ${path} prints stamped fields and has no class of its own`)
        count++
      }
}
console.log(`kit-sections-check: ${count}`)
process.exit(count ? 1 : 0)
