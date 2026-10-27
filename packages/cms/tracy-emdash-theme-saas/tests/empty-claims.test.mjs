// What a personalised site draws once Apply has emptied the demo company's claims (seed/personalize.json `facts`, only
// for a customer who described the business): a section whose rows were all claims goes with them, never a heading over
// an empty list. Held at the SOURCE: no Astro renderer runs in this package's node tests, so each guard is read where it
// is written, and a refactor that drops one fails here (TCH #1013, measured on Tracy Business 11/10/2026).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, 'src/components/sections', file), 'utf8')

test('testimonials: no quote, no section', () => {
  assert.match(read('Testimonials.astro'), /\{items\.length > 0 && \(\n<section class:list=\{\['t'/)
})

test('features ledger: no row, no section, whatever the layout', () => {
  assert.match(read('FeaturesLedger.astro'), /\{items\.length > 0 && \(\n<section class:list=\{\['fl'/)
})

test('clients: a heading alone is no logo strip', () => {
  const src = read('Clients.astro')
  assert.match(src, /const hasStrip = logos\.length > 0 \|\| Boolean\(data\.caption\)\n/)
})

test('teams, pricing, comparison matrix: already drawn only with a row to show', () => {
  assert.match(read('Teams.astro'), /members\.length > 0 && \(/)
  assert.match(read('Pricing.astro'), /\(hasHead \|\| plans\.length > 0 \|\| hasIncludes\) && \(/)
  assert.match(read('PricingMatrix.astro'), /rows\.length > 0 && \(/)
})
