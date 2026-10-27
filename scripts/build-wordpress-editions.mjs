#!/usr/bin/env node
/**
 * Generate `editions.json` for every WordPress contract that carries an `inventory.json`, and
 * with `--check` refuse when the committed file differs.
 *
 * WHY A MACHINE: the Tracy Business archive ships 41 Polylang editions of every page, and the
 * seeder writes the customer's words into the edition of each chosen language by post id. Those
 * ids come from Polylang's translation groups in the release dump (`inventory.json`, itself
 * captured from the archive by `capture-inventory.mjs`). A hand-kept table would pass review
 * with one wrong id, and the customer's Vietnamese hero would land on the Danish page — no
 * error anywhere. The gate also lists, per edition, every mapped slot whose block is MISSING on
 * that edition's page (`missing`): those are reported, never silently skipped.
 *
 * Shape (`tracy-quickstart-editions/wordpress/v1`):
 *   { contract, baseHash, source: {language, locale, tag}, locales: { <slug>: { locale, tag,
 *     wpLocale, ids: { <entityKey>: <postId> }, missing: ["<entityKey>:<block>"] } } }
 * `baseHash` pins the three base files the way `demo-trim-map.json` does, so a regenerated
 * content map turns this file stale at once.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// `TRACY_WP_CONTRACTS` lets the gate test point at a throwaway copy of the tree.
const CONTRACTS =
  process.env.TRACY_WP_CONTRACTS ??
  path.resolve(HERE, '..', 'packages/cms/tracy-wordpress-quickstart/contracts')
const check = process.argv.includes('--check')
const only = process.argv.find((a, i) => process.argv[i - 1] === '--contract')

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))

/** The Joomla formula: `name:sha256\n` for the three base files, in this order. */
export function baseHashOf(dir) {
  let lines = ''
  for (const name of ['manifest.json', 'content-map.json', 'presentation-lock.json'])
    lines += `${name}:${sha256(readFileSync(path.join(dir, name)))}\n`
  return sha256(lines)
}

/** `de_DE` → `de-de`; `af` → `af` (tag = the locale in BCP-47 lower case, as the questionnaire spells it). */
export const tagOf = (locale) => locale.replace('_', '-').toLowerCase()

/**
 * Editions of one contract, from its inventory. Pure, so the gate test can feed it a small one.
 * @param {object} inventory `inventory.json`
 * @param {object} contentMap `content-map.json`
 * @returns {{editions: object, problems: string[]}}
 */
export function buildEditions(inventory, contentMap, baseHash) {
  const problems = []
  const posts = new Map(inventory.posts.map((p) => [p.id, p]))
  const blocksOf = new Map(inventory.posts.map((p) => [p.id, new Set(p.blocks)]))
  const slotsByEntity = new Map()
  for (const slot of contentMap.slots) {
    if (!slot.target?.block) continue
    const list = slotsByEntity.get(slot.entity) ?? []
    list.push(slot)
    slotsByEntity.set(slot.entity, list)
  }
  const source = inventory.source.language
  const locales = {}
  for (const language of inventory.languages) {
    const entry = {
      locale: language.locale,
      tag: tagOf(language.locale),
      wpLocale: language.locale,
      ids: {},
      missing: []
    }
    for (const entity of contentMap.entities) {
      if (entity.kind !== 'page' && entity.kind !== 'post') continue
      const sourceRow = inventory.posts.find((p) => p.entity === entity.key)
      if (!sourceRow) {
        problems.push(`${entity.key}: not in the inventory`)
        continue
      }
      let id = null
      if (language.slug === source) id = sourceRow.id
      else if (sourceRow.group && inventory.translations[sourceRow.group])
        id = inventory.translations[sourceRow.group][language.slug] ?? null
      if (id === null || !posts.has(id)) {
        entry.missing.push(`${entity.key}:*`)
        continue
      }
      const row = posts.get(id)
      if (row.language !== language.slug)
        problems.push(
          `${entity.key}: edition ${language.slug} points at post ${id}, which is ${row.language}`
        )
      if (row.type !== sourceRow.type)
        problems.push(`${entity.key}: edition ${language.slug} post ${id} is a ${row.type}`)
      entry.ids[entity.key] = id
      const have = blocksOf.get(id) ?? new Set()
      for (const slot of slotsByEntity.get(entity.key) ?? [])
        if (!have.has(slot.target.block)) entry.missing.push(`${entity.key}:${slot.target.block}`)
    }
    entry.missing.sort()
    locales[language.slug] = entry
  }
  const editions = {
    schemaVersion: 'tracy-quickstart-editions/wordpress/v1',
    contract: inventory.contract,
    baseHash,
    source: { language: source, locale: inventory.source.locale, tag: tagOf(inventory.source.locale) },
    locales
  }
  return { editions, problems }
}

function* contractDirs() {
  for (const design of readdirSync(CONTRACTS)) {
    const d = path.join(CONTRACTS, design)
    if (
      !existsSync(path.join(d, '..')) ||
      !readdirSync(d, { withFileTypes: true }).some((e) => e.isDirectory())
    )
      continue
    for (const major of readdirSync(d))
      for (const version of readdirSync(path.join(d, major)))
        yield { id: `${design}/${major}/${version}`, dir: path.join(d, major, version) }
  }
}

/** `1.10.0` after `1.3.2`: versions compared part by part as numbers. */
const byVersion = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Contract versions that dropped the inventory an earlier version of the same release carried.
 *
 * 🔒 AN INVENTORY IS NOT OPTIONAL ONCE A RELEASE HAS ONE (measured 08/10/2026, Tracy Business wp7 1.3.4 carried from
 * 1.3.2 without `inventory.json`, `editions.json` and `demo-trim-map.json`). Without them the seeder sees one language,
 * the Claude Cowork plugin has no editions to retire, every Polylang edition stays live, and an unticked page is still
 * reached through its translations (`/news/` -> `/af/news-af/`). This gate only looked at versions that carry an
 * inventory, so it skipped that version without a word.
 * @param {Iterable<{ id: string, dir: string }>} dirs
 * @returns {string[]}
 */
export function droppedInventories(dirs) {
  /** @type {Map<string, Array<{ id: string, version: string, has: boolean }>>} */
  const releases = new Map()
  for (const { id, dir } of dirs) {
    if (!existsSync(path.join(dir, 'manifest.json'))) continue
    const at = id.lastIndexOf('/')
    const list = releases.get(id.slice(0, at)) ?? []
    list.push({ id, version: id.slice(at + 1), has: existsSync(path.join(dir, 'inventory.json')) })
    releases.set(id.slice(0, at), list)
  }
  const problems = []
  for (const list of releases.values()) {
    list.sort((a, b) => byVersion(a.version, b.version))
    let carried = null
    for (const v of list) {
      if (v.has) carried = v.version
      else if (carried)
        problems.push(
          `${v.id}: no inventory.json, but ${carried} carries one — capture it from this release's own archive (capture-inventory.mjs), then run this script, build-wordpress-demo-trim.mjs and build-wordpress-superseded.mjs`
        )
    }
  }
  return problems
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let bad = 0
  let seen = 0
  for (const p of droppedInventories(contractDirs())) {
    if (only && !p.startsWith(`${only}:`)) continue
    console.error(p)
    bad += 1
  }
  for (const { id, dir } of contractDirs()) {
    if (only && only !== id) continue
    const inventoryFile = path.join(dir, 'inventory.json')
    if (!existsSync(inventoryFile)) continue
    seen += 1
    const { editions, problems } = buildEditions(
      readJson(inventoryFile),
      readJson(path.join(dir, 'content-map.json')),
      baseHashOf(dir)
    )
    for (const p of problems) {
      console.error(`${id}: ${p}`)
      bad += 1
    }
    const text = JSON.stringify(editions, null, 2) + '\n'
    const file = path.join(dir, 'editions.json')
    const missing = Object.values(editions.locales).reduce((n, l) => n + l.missing.length, 0)
    if (check) {
      const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
      if (current !== text) {
        console.error(
          `${id}: editions.json differs from the inventory — run scripts/build-wordpress-editions.mjs`
        )
        bad += 1
      } else
        console.log(
          `${id}: editions.json up to date (${Object.keys(editions.locales).length} editions, ${missing} missing slot targets)`
        )
    } else {
      writeFileSync(file, text)
      console.log(
        `${id}: wrote editions.json (${Object.keys(editions.locales).length} editions, ${missing} missing slot targets)`
      )
    }
    for (const [slug, l] of Object.entries(editions.locales))
      if (l.missing.length)
        console.log(
          `  ${slug}: missing ${l.missing.length} — ${l.missing.slice(0, 3).join(', ')}${l.missing.length > 3 ? ' …' : ''}`
        )
  }
  if (!seen) {
    console.error('no WordPress contract carries an inventory.json')
    process.exit(1)
  }
  process.exit(bad ? 1 : 0)
}
