#!/usr/bin/env node
// The gallery albums keep their photos in a Joomla gallery folder the content model does not carry. Read them from the
// mirror of the source (the list page gives each album's cover, every album page its photos, in order).
//   node ingest/extract-albums.mjs <source-snapshot-dir> ingest/albums.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [snap, out] = process.argv.slice(2)
if (!snap || !out) {
  console.error('usage: extract-albums.mjs <source-snapshot> <albums.json>')
  process.exit(2)
}
const img = (html) =>
  [...html.matchAll(/<img[^>]*\bsrc="\/?(images\/joomlart\/gallery\/intro-\d+\.jpg)"[^>]*>/g)].map((m) => ({
    file: m[1],
    alt: m[0].match(/alt="([^"]*)"/)?.[1] ?? ''
  }))
const list = readFileSync(path.join(snap, 'index.php/gallery/index.html'), 'utf8')
const covers = img(list)
const albums = {}
for (const dir of readdirSync(path.join(snap, 'index.php/gallery')).filter((d) => /^\d+-/.test(d))) {
  const slug = dir.replace(/^\d+-/, '')
  const html = readFileSync(path.join(snap, 'index.php/gallery', dir, 'index.html'), 'utf8')
  const cover = covers.find((c) => c.alt.toLowerCase().replace(/\s+/g, '-') === slug)
  const photos = img(
    html.slice(html.indexOf('gallery-detail-slide') >= 0 ? html.indexOf('gallery-detail-slide') : 0)
  ).map((p) => p.file)
  albums[slug] = { cover: cover?.file ?? '', photos: [...new Set(photos)] }
}
writeFileSync(out, JSON.stringify({ source: 'mirror of the source site, /gallery', albums }, null, 2) + '\n')
console.log(`extract-albums: ${Object.keys(albums).length} albums`)
