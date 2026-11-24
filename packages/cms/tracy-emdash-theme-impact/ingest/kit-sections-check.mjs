#!/usr/bin/env node
// The EmDash counterpart of the Joomla `kit-modules-missing` check (apps/tracy-web/src/lib/template-readiness/kit-modules-check.js,
// which skips EmDash): every section a page prints that holds slots of the content map must be a block of the kit (its source,
// or inside one). A section the kit never read is a block no plan decides and no write step touches: its demo words, pictures
// and buttons would reach every customer site as the demo had them.
//   node ingest/kit-sections-check.mjs <kit dir (holding template-kit.json and emdash-sections.json)> [<content-map.json>]
// Reads: the sections the page prints with their provenance stamps (`emdash-sections.json`, written by template-kit build),
// the kit's pages and blocks, and the content map's slots. Exit 1 and one line per missing section when any is not a block.
import { readFileSync } from 'node:fs'
import path from 'node:path'

const [dir, mapFile = new URL('../contracts/0.1.0/content-map.json', import.meta.url).pathname] = process.argv.slice(2)
if (!dir) {
  console.error('usage: kit-sections-check.mjs <kit dir> [content-map.json]')
  process.exit(2)
}
const read = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
const kit = read('template-kit.json')
const sections = read('emdash-sections.json').pages
const map = JSON.parse(readFileSync(mapFile, 'utf8'))
const slotIds = new Set((map.slots ?? []).map((s) => s.key ?? s.id))
const blocks = new Map(kit.blocks.map((b) => [b.id, b]))
const groupOf = new Map((kit.pageGroups ?? []).map((g) => [g.id, g]))
// a page of a group is read through the blocks of every page of its group (the kit shoots one representative and the others point at it)
const groupBlocks = new Map()
for (const page of kit.pages)
  groupBlocks.set(page.group, [...(groupBlocks.get(page.group) ?? []), ...(page.blocks?.['1440'] ?? [])])
// a detail page's own parts (its breadcrumb bar) are blocks named after it and listed outside the group's representative page
const ofPage = (page) => kit.blocks.filter((b) => b.id.includes(`-${page.path.slice(1).replace(/\//g, '_')}-`) || b.id.startsWith(`block-${page.path.slice(1).replace(/\//g, '_')}-`)).map((b) => b.id)
const everywhere = new Set(kit.blocks.flatMap((b) => (b.slots ?? []).map((x) => x.id)))
const has = (set, k) => [...set].some((id) => id === k || id.startsWith(`${k}.`) || id.startsWith(`${k}[`))
const missing = []
const repeated = []
let checked = 0
for (const page of kit.pages) {
  const printed = sections[page.path]
  if (!printed) continue
  const ids = [...(groupBlocks.get(page.group) ?? []), ...ofPage(page)]
  const have = new Set(ids.flatMap((id) => (blocks.get(id)?.slots ?? []).map((s) => s.id)))
  for (const part of ['before', 'main', 'after'])
    for (const sec of printed[part] ?? []) {
      if (sec.shown === false) continue
      // the stamps of the section: `collection.slug[.field]`; a slot of the map starts with that
      const keys = [...new Set((sec.stamps ?? []).map((s) => [s.collection, s.slug, s.field].filter(Boolean).join('.')))]
      const inMap = keys.filter((k) => [...slotIds].some((id) => id === k || id.startsWith(`${k}.`) || id.startsWith(`${k}[`)))
      if (inMap.length === 0) continue
      checked++
      const covered = inMap.some((k) => has(have, k))
      // a part of a page the kit names after it (a detail page's breadcrumb bar: its words map to the page title slot by text)
      const own = ofPage(page).some((id) => (sec.classes ?? []).some((c) => id.endsWith(`-${c.replace(/^im-/, '')}`)))
      // a listing strip a page repeats from another page (the Home's events): its slots are held by the block of the page that owns the list
      if (!covered && !own && inMap.every((k) => has(everywhere, k))) {
        repeated.push(`${page.path}  ${part}  ${sec.selector.split(' > ').slice(-1)[0]}`)
        continue
      }
      if (!covered && !own) missing.push(`${page.path}  ${part}  ${sec.selector.split(' > ').slice(-1)[0]}  (${inMap.slice(0, 3).join(', ')})`)
    }
}
console.log(`kit-sections-check: ${checked} sections with slots on ${kit.pages.length} pages, ${missing.length} not a block of the kit, ${repeated.length} a strip repeated from the block of another page`)
for (const r of repeated) console.log(`  repeated: ${r}`)
for (const m of missing) console.log(`  ${m}`)
process.exit(missing.length ? 1 : 0)
