#!/usr/bin/env node
// Gives every page and post the public path it is served at, so Tracy's Content API map can resolve each picture
// binding (`urlField: path` on pages and posts). The router still decides the paths (src/lib/page-routes.json);
// the field repeats what it serves. Runs after enrich-diner.mjs, before compile-seed.mjs; safe to run again.
//   node ingest/bind-paths.mjs <seed/site-model.json>
import { readFileSync, writeFileSync } from 'node:fs'

const modelFile = process.argv[2]
if (!modelFile) {
  console.error('usage: bind-paths.mjs <site-model.json>')
  process.exit(2)
}
const model = JSON.parse(readFileSync(modelFile, 'utf8'))

const addPath = (name) => {
  const t = model.types.find((x) => x.name === name)
  t.fields = t.fields.filter((f) => f.name !== 'path')
  t.fields.push({ name: 'path', type: 'text' })
}
addPath('pages')
addPath('posts')

const slugOf = (p) => (p === '/' ? 'home' : p.split('/').filter(Boolean).pop())
const pagePath = new Map(
  model.routes.filter((r) => r.kind === 'page' || r.kind === 'list').map((r) => [slugOf(r.path), r.path])
)
const postPath = new Map(model.routes.filter((r) => r.kind === 'detail').map((r) => [r.slug, r.path]))

let pages = 0
let posts = 0
for (const r of model.records) {
  if (r.type === 'pages') {
    const path = pagePath.get(r.slug)
    if (!path) throw new Error(`pages/${r.slug} has no route`)
    r.values.path = path
    pages += 1
  } else if (r.type === 'posts') {
    const path = postPath.get(r.slug)
    if (!path) throw new Error(`posts/${r.slug} has no detail route`)
    r.values.path = path
    posts += 1
  }
}
writeFileSync(modelFile, JSON.stringify(model, null, 2) + '\n')
console.log(`bind-paths: ${pages} pages, ${posts} posts`)
