#!/usr/bin/env node
// src/lib/page-routes.json: path -> {type, slug, view} for every route of the model that is served by one entry.
//   node ingest/build-route-table.mjs <seed/site-model.json> <src/lib/page-routes.json>
// Derived data (structure, not content): the router reads it to find which `pages` entry answers a path.
import { readFileSync, writeFileSync } from 'node:fs'

const [modelFile, outFile] = process.argv.slice(2)
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const pages = new Map(model.records.filter((r) => r.type === 'pages').map((r) => [r.slug, r]))
const rows = []
for (const r of model.routes) {
  if (r.kind !== 'page') continue
  const slug = r.path === '/' ? 'home' : r.path.split('/').filter(Boolean).pop()
  const rec = pages.get(slug)
  if (rec) rows.push({ path: r.path, slug, view: rec.values.view ?? 'page' })
}
for (const r of model.routes) {
  if (r.kind !== 'list') continue
  const slug = r.path.split('/').filter(Boolean).pop()
  const rec = pages.get(slug)
  if (rec) rows.push({ path: r.path, slug, view: rec.values.view ?? 'page' })
}
const lists = model.routes.filter((r) => r.kind === 'list').map((r) => ({ path: r.path, type: r.type }))
writeFileSync(outFile, JSON.stringify({ pages: rows, lists }, null, 2) + '\n')
console.log(`build-route-table: ${rows.length} pages, ${lists.length} lists`)
