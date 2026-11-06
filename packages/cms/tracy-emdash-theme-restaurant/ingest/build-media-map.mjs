#!/usr/bin/env node
// seed/media-map.json in the shape tools/seed-apply.mjs reads (`items[]` with `key`, `file`, `mime`, `alt`,
// `targets[{collection,slug,locale,path}]`), plus the files themselves under seed/media/<source path>.
// compile-seed.mjs writes a different shape (`files[]` with `usedBy`) and only for the model's `media[]`
// (7 of 42 images here) -- see perf/skill-findings.md SF-8 and SF-16.
//   node ingest/build-media-map.mjs <seed dir> <source webroot>
// Every image the seed's CONTENT cites in a field of type `image` (top level or a repeater sub-field) becomes a
// target; an image no entry cites is not copied. Alt text is empty: the source carries none (content-gaps G-13).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const [seedDir, webroot] = process.argv.slice(2)
if (!seedDir || !webroot) {
  console.error('usage: build-media-map.mjs <seed dir> <source webroot>')
  process.exit(2)
}
const seed = JSON.parse(readFileSync(path.join(seedDir, 'seed.json'), 'utf8'))
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}
const items = new Map()
const missing = []

// from-joomla.mjs writes post covers as a bare basename (`rest-3.jpg`); the file is under images/ -- resolve it when
// exactly one file of that name exists there, otherwise leave it missing rather than guess.
const byBase = new Map()
const index = (dir) => {
  for (const e of readdirSync(path.join(webroot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) index(rel)
    else byBase.set(e.name, [...(byBase.get(e.name) ?? []), rel])
  }
}
index('images')
const resolve = (file) =>
  file.includes('/') ? file : byBase.get(file)?.length === 1 ? byBase.get(file)[0] : file

const note = (raw, target) => {
  const file = resolve(raw)
  const abs = path.join(webroot, file)
  if (!existsSync(abs)) return void missing.push(file)
  if (!items.has(file)) {
    const bytes = readFileSync(abs)
    mkdirSync(path.dirname(path.join(seedDir, 'media', file)), { recursive: true })
    copyFileSync(abs, path.join(seedDir, 'media', file))
    items.set(file, {
      key: file.replace(/\.[a-z]+$/i, ''),
      file,
      alt: '',
      mime: MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      targets: []
    })
  }
  items.get(file).targets.push(target)
}

for (const col of seed.collections) {
  const imageFields = col.fields.filter((f) => f.type === 'image').map((f) => f.slug)
  const imageSubs = new Map(
    col.fields
      .filter((f) => f.type === 'repeater')
      .map((f) => [
        f.slug,
        (f.validation?.subFields ?? []).filter((s) => s.type === 'image').map((s) => s.slug)
      ])
  )
  for (const entry of seed.content?.[col.slug] ?? []) {
    const where = { collection: col.slug, slug: entry.slug, locale: entry.locale }
    for (const f of imageFields)
      if (typeof entry.data?.[f] === 'string' && entry.data[f]) note(entry.data[f], { ...where, path: f })
    for (const [rep, subs] of imageSubs) {
      ;(entry.data?.[rep] ?? []).forEach((row, i) => {
        for (const s of subs)
          if (typeof row?.[s] === 'string' && row[s]) note(row[s], { ...where, path: `${rep}[${i}].${s}` })
      })
    }
  }
}
writeFileSync(
  path.join(seedDir, 'media-map.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'JA Restaurant j6 1.0.6 webroot',
      items: [...items.values()]
    },
    null,
    '\t'
  ) + '\n'
)
console.log(
  `build-media-map: ${items.size} images, ${[...items.values()].reduce((n, i) => n + i.targets.length, 0)} targets${missing.length ? `, ${missing.length} missing: ${missing.join(', ')}` : ''}`
)
