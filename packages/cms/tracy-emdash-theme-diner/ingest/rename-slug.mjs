#!/usr/bin/env node
// Renames the slug of one record of seed/site-model.json: `<type> <from> <to>`.
//   node ingest/rename-slug.mjs <seed/site-model.json> <type> <from> <to>
// A section collection that holds one entry counts, for Tracy's page rule, as a page record at the path of its slug, so a
// section whose slug equals a page's (the Our History timeline and the Our History page) made the page match two
// records and kept it out of the Pages question (REL-2). The rebuild renames the section right after the source model is
// copied (DECISIONS D59). A second run changes nothing.
import { readFileSync, writeFileSync } from 'node:fs'

const [file, type, from, to] = process.argv.slice(2)
if (!file || !type || !from || !to) {
  console.error('usage: rename-slug.mjs <site-model.json> <type> <from> <to>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(file, 'utf8'))
let n = 0
for (const r of model.records ?? [])
  if (r.type === type && r.slug === from) {
    r.slug = to
    n++
  }
writeFileSync(file, `${JSON.stringify(model, null, 2)}\n`)
console.log(`rename-slug: ${type}/${from} -> ${to}: ${n} record(s)`)
