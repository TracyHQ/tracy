#!/usr/bin/env node
/**
 * Generate `packages/design/tracy-ds-slot/refero-thumbs/<uuid>.webp`: the card picture of every Refero
 * system the library OFFERS, shrunk from `vendor/tracy/refero/systems/<uuid>/assets/screenshot.jpg`.
 *
 * WHY A GENERATOR, AND WHY THE OUTPUT IS COMMITTED. The library door
 * (`GET /api/design-system/library/refero/:uuid/screenshot.jpg`, `apps/tracy-web/src/sites/design-system.js`)
 * serves one picture per card, drawn 16:10 at a few hundred CSS pixels wide. The originals are
 * 1440x900 JPEGs, 151 MB for 1,342 systems, and shipping them grew the tracy-web image by that much.
 * A 480-px WebP is enough for a 2x card and about a seventh of the bytes. The Refero tree is a pinned
 * snapshot that Tracy must not edit in place (`vendor/tracy/refero/IMPORT-NOTE.md`: derived data lives
 * outside it), so the thumbnails live in the Tracy package that adapts Refero (`@tracy/ds-slot`), and
 * the image copies only them. Committed rather than made during the image build: the build then needs
 * no originals in its context and no resize step, and the bytes a customer gets are the bytes in git.
 *
 * ONLY THE OFFERED SYSTEMS (12/10/2026). The set is `referoLibrary()` of
 * `apps/tracy-web/src/lib/ds-slot.js` itself: the systems whose profile loads and passes the quality
 * gate, by the same code the doors run, so it cannot disagree with what they offer. A system the gate
 * refuses gets no thumbnail, and the folder doubles as the image's list of offered systems: the
 * Dockerfile's `dslib` stage keeps a system's Refero data files only when its thumbnail is here.
 *
 * Deterministic: the same originals and the same sharp version give the same bytes (no metadata kept).
 * Rerun after a new Refero snapshot or a change to the quality gate.
 *
 * Usage:  node scripts/build-refero-thumbs.mjs            # writes the missing ones, removes the rest
 *         node scripts/build-refero-thumbs.mjs --all      # rewrites every offered one (new snapshot)
 *         node scripts/build-refero-thumbs.mjs --check    # exits 1 when an offered system has none,
 *                                                         # or a system not offered has one
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SYSTEMS = path.join(ROOT, 'vendor/tracy/refero/systems')
const OUT = path.join(ROOT, 'packages/design/tracy-ds-slot/refero-thumbs')
/** Card width at 2x; the originals are 16:10, so 480x300. */
const WIDTH = 480
const QUALITY = 72
const check = process.argv.includes('--check')
const all = process.argv.includes('--all')

// The offered list, read the way the doors read it (a checkout: every system's data in place).
const { referoLibrary } = await import(path.join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js'))
const uuids = (await referoLibrary()).map((r) => r.uuid).sort()
if (uuids.length === 0) {
  console.error('refero-thumbs: the library offers no system (is vendor/tracy/refero checked out?)')
  process.exit(1)
}
const want = new Set(uuids.map((u) => `${u}.webp`))
const have = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.webp')) : []

if (check) {
  const missing = [...want].filter((f) => !have.includes(f))
  const refused = have.filter((f) => !want.has(f))
  if (missing.length || refused.length) {
    console.error(
      `refero-thumbs stale: ${missing.length} offered without a thumbnail, ` +
        `${refused.length} thumbnails of systems not offered`
    )
    console.error('Run: node scripts/build-refero-thumbs.mjs')
    process.exit(1)
  }
  console.log(`refero-thumbs: ${have.length} thumbnails, one per offered system`)
  process.exit(0)
}

// sharp is a dependency of apps/tracy-web (it resizes pictures there at run time); borrow it from
// there instead of adding a root dependency.
const sharp = createRequire(path.join(ROOT, 'apps/tracy-web/package.json'))('sharp')
const todo = all ? uuids : uuids.filter((u) => !have.includes(`${u}.webp`))

mkdirSync(OUT, { recursive: true })
const started = Date.now()
let inBytes = 0
let outBytes = 0
// A few at a time: sharp runs on libuv's pool, so a small batch keeps every core busy.
const BATCH = 8
for (let i = 0; i < todo.length; i += BATCH) {
  await Promise.all(
    todo.slice(i, i + BATCH).map(async (u) => {
      const src = path.join(SYSTEMS, u, 'assets/screenshot.jpg')
      try {
        const bytes = await sharp(src)
          .resize({ width: WIDTH, withoutEnlargement: true })
          .webp({ quality: QUALITY, effort: 6 })
          .toBuffer()
        writeFileSync(path.join(OUT, `${u}.webp`), bytes)
        inBytes += statSync(src).size
        outBytes += bytes.length
      } catch (error) {
        console.error(`${u}: ${error instanceof Error ? error.message : error}`)
        process.exitCode = 1
      }
    })
  )
}
for (const f of have) if (!want.has(f)) rmSync(path.join(OUT, f))

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`
console.log(
  `refero-thumbs: ${uuids.length} offered, ${todo.length} written in ` +
    `${((Date.now() - started) / 1000).toFixed(1)} s (${mb(inBytes)} -> ${mb(outBytes)}), ` +
    `${have.filter((f) => !want.has(f)).length} removed`
)
