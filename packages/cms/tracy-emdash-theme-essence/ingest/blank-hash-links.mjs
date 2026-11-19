// A demo link that is "#" leads nowhere: the readiness rule PAGE-5 wants none in site-model.json, and the views treat an empty
// link the same as "#" (a social glyph or the picture strip's button is drawn without a link). Run on seed/site-model.json.
import { readFileSync, writeFileSync } from 'node:fs'
const file = process.argv[2]
const model = JSON.parse(readFileSync(file, 'utf8'))
let n = 0
const walk = (v) => {
  if (Array.isArray(v)) return v.forEach(walk)
  if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (x === '#' && /(url|href|link)$/i.test(k)) {
        v[k] = ''
        n++
      } else walk(x)
    }
}
walk(model)
writeFileSync(file, JSON.stringify(model, null, 2) + '\n')
console.log(`blank-hash-links: ${n} link fields emptied`)
