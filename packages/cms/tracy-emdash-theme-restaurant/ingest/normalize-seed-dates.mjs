#!/usr/bin/env node
// compile-seed copies the model's dates as written (`2021-09-27 00:02:00`); EmDash stores a datetime as UTC ISO
// (`2021-09-27T00:02:00.000Z`) and `seed-apply content` then calls every first-run entry a conflict ("live content
// differs from the seed in date"). Writes the stored form into seed/seed.json (SF-17).
//   node ingest/normalize-seed-dates.mjs <seed/seed.json>
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const seed = JSON.parse(readFileSync(file, 'utf8'))
let n = 0
for (const col of seed.collections) {
  const fields = col.fields.filter((f) => f.type === 'datetime').map((f) => f.slug)
  for (const entry of seed.content?.[col.slug] ?? [])
    for (const f of fields) {
      const v = entry.data?.[f]
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(v)) {
        entry.data[f] = `${v.replace(' ', 'T')}${v.length === 16 ? ':00' : ''}.000Z`
        n++
      }
    }
}
writeFileSync(file, JSON.stringify(seed, null, '\t') + '\n')
console.log(`normalize-seed-dates: ${n} value(s)`)
