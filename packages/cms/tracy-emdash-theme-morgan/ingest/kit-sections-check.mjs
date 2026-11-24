#!/usr/bin/env node
// The template-kit gate that runs after every kit build: reads the sections each kit page prints (`emdash-sections.json` of the kit work
// folder) and fails when a section that holds visual content-map slots (a picture, an icon, a logo) is not a kit block, or when two
// sections of a page share one class set (the kit captures a section as a block through its own class). Prints the count; 0 = clean.
//   node ingest/kit-sections-check.mjs <kit work folder> [--map contracts/<version>/content-map.json]
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--'))
const mapFile = args.includes('--map') ? args[args.indexOf('--map') + 1] : null
if (!dir) {
  console.error('usage: kit-sections-check.mjs <kit work folder> [--map content-map.json]')
  process.exit(2)
}
const read = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
const sections = read('emdash-sections.json')
const kit = read('template-kit.json')
const mapPath = mapFile ?? new URL('../contracts/0.1.0/content-map.json', import.meta.url).pathname
const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : { slots: [] }

// every slot id a kit block owns (its text slots and its picture frames)
const owned = new Map()
for (const b of kit.blocks ?? []) {
  for (const s of b.slots ?? []) owned.set(s.id, b.id)
  for (const f of b.frames ?? []) owned.set(f.id ?? f.slot ?? f.key, b.id)
}
const visual = (id) => /(^|\.)(img|image|img_icon|img_intro|img_features|ft_bg|background|avatar|client_logo|logo|photo|cover|section_mask)(\.|$|\[)/.test(id)
const slotId = (st) => `${st.collection}.${st.slug}.${String(st.field).replace(/\.(\d+)\./g, '[$1].').replace(/\.(\d+)$/, '[$1]')}`
const problems = []
for (const [page, parts] of Object.entries(sections.pages ?? {})) {
  const list = [...(parts.before ?? []), ...(parts.main ?? []), ...(parts.after ?? [])]
  const seen = new Map()
  for (const part of list) {
    const key = (part.classes ?? []).join(' ')
    if (part.stamps?.length && key) {
      if (seen.has(key) && part.tag === 'section') problems.push(`${page}: sections ${seen.get(key)} and ${part.selector} share the class set "${key}"`)
      seen.set(key, part.selector)
    }
    const slots = (part.stamps ?? []).filter((s) => s.kind === 'field').map(slotId).filter(visual)
    const orphans = slots.filter((id) => !owned.has(id) && !owned.has(id.replace(/\[\d+\]/g, '[0]')))
    if (orphans.length) problems.push(`${page}: ${part.selector} holds visual slots that no kit block owns: ${orphans.slice(0, 3).join(', ')}${orphans.length > 3 ? ' …' : ''}`)
  }
}
void map
console.log(`kit-sections-check: ${problems.length} problem(s) on ${Object.keys(sections.pages ?? {}).length} page(s)`)
for (const p of problems) console.log(`  ${p}`)
process.exit(problems.length ? 1 : 0)
