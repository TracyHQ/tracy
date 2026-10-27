#!/usr/bin/env node
/**
 * Declare the IMAGE slots of a WordPress contract from its own archive: one per named `core/image`
 * block of every page the content map governs.
 *
 * WHY: a sealed Tracy Business site took words and links only, so an agent asked for a new hero
 * photo answered "I cannot change pictures on this site" (measured 26/09/2026, session on
 * `r1w1734`). An image slot is how a picture gets in: `media.upload` puts the file in the media
 * library, `content.contract apply` points the block at it. The slot needs the DEMO picture's path
 * and attachment id (`sample` + `sampleId`), because the Claude Cowork plugin hashes a page's skeleton with
 * each image slot put back to that demo picture — so a page nobody touched keeps the hash it
 * shipped with, and adding these slots leaves `presentation-lock.json` the same bytes (the profile
 * is corrected in place; `superseded.json` keeps sites already sealed to it working).
 *
 * The demo path and id come from the release's `<slug>-database-<v>.sql.gz` (sha256 in
 * `manifest.json`), never from a running site: a site is the customer's, the archive is not.
 *
 * Usage:
 *   node packages/cms/tracy-wordpress-quickstart/scripts/capture-image-slots.mjs \
 *     --contract tracy-business/wp7/1.2.0 --dump <database.sql.gz> [--check]
 *
 * Rewrites `contracts/<id>/content-map.json`: every existing `type: "image"` slot is dropped and
 * the captured ones are appended, in entity order then document order. Run after it, in this
 * order: `capture-inventory.mjs --check` (the lock must not move), `build-wordpress-editions.mjs`,
 * `build-wordpress-demo-trim.mjs`, `build-wordpress-superseded.mjs`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDump, tableRows, wordpressPrefix } from '../../tracy-quickstart-tools/mysqldump.mjs'

const UPLOADS = /^\/?(wp-content\/uploads\/[A-Za-z0-9/_.-]+\.(?:png|jpe?g|webp))$/

/**
 * The image slots of one page: every `core/image` block with a `metadata.name`, a top-level
 * attachment `id` and a picture under `wp-content/uploads/`. Pure, so the test feeds it markup.
 * @param {{ content: string, entityKey: string, prefix: string }} page `prefix` is the slot key's
 *   first segment (the page slug), as every text slot of the entity already spells it.
 * @returns {{ slots: object[], skipped: string[] }}
 */
export function imageSlotsOf({ content, entityKey, prefix }) {
  const slots = []
  const skipped = []
  // A block is found by its name, first match in the page (`setBlockValue` on both sides), so a
  // second block of the same name is out of reach: a slot for it would write into the FIRST one.
  // Measured on the About page, which repeats `text.img` three times.
  const named = new Set()
  const open = /<!-- wp:image (\{[^\n]*\}) -->([\s\S]*?)<!-- \/wp:image -->/g
  for (const m of content.matchAll(open)) {
    const attrs = JSON.parse(m[1])
    const name = attrs?.metadata?.name
    if (typeof name !== 'string' || name === '') continue
    if (named.has(name)) {
      skipped.push(`${entityKey}:${name} (a second block of that name; only the first is addressable)`)
      continue
    }
    named.add(name)
    const src = /<img\b[^>]*\bsrc="([^"]*)"/.exec(m[2])?.[1] ?? ''
    const file = UPLOADS.exec(src)?.[1]
    if (!Number.isInteger(attrs.id) || !file) {
      skipped.push(
        `${entityKey}:${name} (${!Number.isInteger(attrs.id) ? 'no attachment id' : `picture not in uploads: ${src}`})`
      )
      continue
    }
    slots.push({
      key: `${prefix}.${name}`,
      entity: entityKey,
      target: { block: name, attr: 'src' },
      type: 'image',
      sample: file,
      sampleId: attrs.id,
      maxCharacters: 255,
      label: `${prefix} — ${name}`
    })
  }
  return { slots, skipped }
}

/**
 * The content map with its image slots replaced by `captured`.
 * @param {{ slots: object[] }} contentMap @param {object[]} captured
 */
export function withImageSlots(contentMap, captured) {
  return { ...contentMap, slots: [...contentMap.slots.filter((s) => s.type !== 'image'), ...captured] }
}

function main() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--'))
      args[a.slice(2)] =
        process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[++i]
  }
  if (!args.contract || !args.dump) {
    console.error(
      'usage: capture-image-slots.mjs --contract <design>/wp<major>/<version> --dump <database.sql.gz> [--contracts-root <dir>] [--check]'
    )
    process.exit(2)
  }
  const here = path.dirname(fileURLToPath(import.meta.url))
  // `--contracts-root` lets a batch run work on a scratch tree; without it the committed tree is used.
  const root =
    typeof args['contracts-root'] === 'string'
      ? path.resolve(args['contracts-root'])
      : path.resolve(here, '..', 'contracts')
  const dir = path.resolve(root, args.contract)
  const readJson = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
  const manifest = readJson('manifest.json')
  const contentMap = readJson('content-map.json')
  const inventory = readJson('inventory.json')

  const dumpSha = createHash('sha256').update(readFileSync(args.dump)).digest('hex')
  const declared = manifest.quickstart?.parts?.database?.sha256
  if (declared && declared !== dumpSha) {
    console.error(`the dump ${path.basename(args.dump)} is ${dumpSha}, but manifest.json names ${declared}`)
    process.exit(1)
  }
  const sql = readDump(args.dump)
  const posts = new Map(tableRows(sql, `${wordpressPrefix(sql)}posts`).map((p) => [Number(p.ID), p]))

  const captured = []
  const problems = []
  for (const entity of contentMap.entities) {
    if (entity.kind !== 'page' && entity.kind !== 'post') continue
    const { postType = entity.kind, slug, language } = entity.identity
    const rows = inventory.posts.filter(
      (p) => p.type === postType && p.slug === slug && (!language || p.language === language)
    )
    if (rows.length !== 1) {
      problems.push(`${entity.key}: ${rows.length} rows in inventory.json`)
      continue
    }
    const content = posts.get(rows[0].id)?.post_content
    if (typeof content !== 'string') {
      problems.push(`${entity.key}: post ${rows[0].id} is not in the dump`)
      continue
    }
    const prefix =
      contentMap.slots.find((s) => s.entity === entity.key && s.type !== 'image')?.key.split('.')[0] ?? slug
    const { slots, skipped } = imageSlotsOf({ content, entityKey: entity.key, prefix })
    captured.push(...slots)
    for (const s of skipped) console.error(`  skipped ${s}`)
  }
  if (problems.length) {
    for (const p of problems) console.error(`  ✖ ${p}`)
    process.exit(1)
  }
  const next = `${JSON.stringify(withImageSlots(contentMap, captured), null, 2)}\n`
  const file = path.join(dir, 'content-map.json')
  if (args.check) {
    if (readFileSync(file, 'utf8') !== next) {
      console.error(
        `${args.contract}: content-map.json image slots differ from the archive — rerun without --check`
      )
      process.exit(1)
    }
    console.log(`${args.contract}: ${captured.length} image slots match the archive`)
    return
  }
  writeFileSync(file, next)
  console.log(`${args.contract}: ${captured.length} image slots written`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
