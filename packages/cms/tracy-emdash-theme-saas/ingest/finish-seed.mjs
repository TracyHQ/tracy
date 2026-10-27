#!/usr/bin/env node
// finish-seed.mjs — the seed compile-seed.mjs writes → the seed EmDash 0.37 and seed-apply.mjs accept.
//
//   node ingest/finish-seed.mjs --seed seed --model seed/site-model.json --images <quickstart>/site/images
//   exit 0 = written · 1 = a body or image could not be carried over · 2 = usage
//
// WHY A SECOND STEP. The model is neutral on purpose (a `prose` value is the HTML the source wrote), and
// the kit compiler copies values as they are. Two things are EmDash's alone and so live here, after it:
//   1. portableText fields need blocks, not HTML — ingest/html-to-portable-text.mjs.
//   2. media never travels inside the seed (skill invariant #2). compile-seed lists files as
//      `{file, usedBy}`; seed-apply reads `{items: [{key, file, alt, mime, targets[]}]}` and the bytes under
//      seed/media/. This step writes that shape, copies the files, and clears the image values from the
//      seed content so the first setup does not store a bare file name where EmDash expects a media object.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { htmlToPortableText } from './html-to-portable-text.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const seedDir = flag('--seed')
const modelPath = flag('--model')
const imagesDir = flag('--images')
if (!seedDir || !modelPath || !imagesDir) {
  console.error('usage: finish-seed.mjs --seed <seed-dir> --model <site-model.json> --images <images-dir>')
  process.exit(2)
}
const fail = (message) => {
  console.error(message)
  process.exit(1)
}
const seedPath = path.join(seedDir, 'seed.json')
const seed = JSON.parse(readFileSync(seedPath, 'utf8'))
const model = JSON.parse(readFileSync(modelPath, 'utf8'))

// 0. datetime: Joomla writes `2026-06-19 21:00:00` (UTC, no zone). EmDash's first-run setup stores it as
// given, but every later PUT validates the field and answers `400 date: Invalid ISO date` — measured
// on bootstrap run 2, where it stopped the importer at the first cover image. ISO 8601 UTC here.
let dates = 0
for (const collection of seed.collections) {
  const dateFields = collection.fields.filter((f) => f.type === 'datetime').map((f) => f.slug)
  for (const entry of seed.content[collection.slug] ?? []) {
    for (const field of dateFields) {
      const value = entry.data[field]
      if (typeof value !== 'string' || value === '') continue
      const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/)
      if (m) {
        entry.data[field] = `${m[1]}T${m[2]}.000Z`
        dates++
      } else if (Number.isNaN(Date.parse(value)))
        fail(`${collection.slug}/${entry.slug}.${field}: unreadable date "${value}"`)
    }
  }
}

// 0b. term descriptions: the model carries them (category descriptions from Joomla); the kit compiler
// writes only id/slug/label for a term, so they are added here.
let described = 0
for (const tax of seed.taxonomies ?? []) {
  const source = model.taxonomies.find((t) => t.name === tax.name)
  for (const term of tax.terms ?? []) {
    const modelTerm = source?.terms.find((t) => t.slug === term.slug)
    const text = modelTerm?.description?.[tax.locale]
    if (text) {
      term.description = text
      described++
    }
    // Parent by slug, which is what EmDash's seed apply resolves (`${locale}::${term.parent}`).
    if (modelTerm?.parent && tax.hierarchical) term.parent = modelTerm.parent
  }
}

// 1. portableText
let converted = 0
for (const collection of seed.collections) {
  const ptFields = collection.fields.filter((f) => f.type === 'portableText').map((f) => f.slug)
  for (const entry of seed.content[collection.slug] ?? []) {
    for (const field of ptFields) {
      const value = entry.data[field]
      if (typeof value !== 'string') continue
      try {
        // Paired straight double quotes in prose become typographic ones. The display font draws a straight
        // `"` like a closing curly quote, so `"why"` read as ”why” (light-desktop N-d10020, SOURCE: the source
        // shows the same). Only text spans of prose blocks are touched — never code blocks, never markup.
        const blocks = htmlToPortableText(value)
        for (const b of blocks) {
          if (b._type !== 'block') continue
          for (const span of b.children ?? []) {
            if (span.marks?.includes('code')) continue
            span.text = span.text.replace(/"([^"\n]+)"/g, '“$1”')
          }
        }
        entry.data[field] = blocks
        converted++
      } catch (error) {
        fail(`${collection.slug}/${entry.slug}.${field}: ${error.message}`)
      }
    }
  }
}

// 2. media
const files = new Map()
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else files.set(name, [...(files.get(name) ?? []), path.relative(imagesDir, full)])
  }
}
walk(imagesDir)
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif'
}
const items = []
for (const m of model.media) {
  const found = files.get(m.file) ?? []
  if (found.length !== 1) fail(`media ${m.file}: ${found.length} files with that name under ${imagesDir}`)
  const rel = found[0]
  const targets = m.usedBy.map((u) => {
    const [ref, fieldPath] = u.split('#')
    const [collection, entrySlug] = ref.split('/')
    return { collection, slug: entrySlug, locale: model.locales.default, path: fieldPath }
  })
  items.push({
    key: rel.replace(/\.[^.]+$/, ''),
    file: rel,
    alt: m.alt?.[model.locales.default] ?? '',
    mime: MIME[path.extname(rel).toLowerCase()] ?? 'application/octet-stream',
    targets
  })
  mkdirSync(path.dirname(path.join(seedDir, 'media', rel)), { recursive: true })
  copyFileSync(path.join(imagesDir, rel), path.join(seedDir, 'media', rel))
  // Clear the value the compiler copied: the importer uploads the file and writes the media object.
  for (const t of targets) {
    const entry = seed.content[t.collection]?.find((e) => e.slug === t.slug && e.locale === t.locale)
    if (!entry) fail(`media ${m.file}: no seed entry ${t.collection}/${t.slug}`)
    const parts = t.path.match(/[^.[\]]+/g)
    let holder = entry.data
    for (const p of parts.slice(0, -1)) holder = holder?.[p]
    if (holder && typeof holder === 'object') delete holder[parts.at(-1)]
  }
}
writeFileSync(
  path.join(seedDir, 'media-map.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'quickstart images/ (ja-kinetic-j6-quickstart-1.0.0.zip)', items }, null, '\t')}\n`
)
writeFileSync(seedPath, `${JSON.stringify(seed, null, '\t')}\n`)
console.log(
  `finish-seed: ${converted} portableText values · ${items.length} media files (${items.reduce((n, i) => n + i.targets.length, 0)} targets) → ${seedDir}`
)
if (!existsSync(path.join(seedDir, 'media'))) fail('no media copied')
