#!/usr/bin/env node
/**
 * Generate `demo-trim-map.json` for every WordPress contract that carries an `inventory.json`,
 * and with `--check` refuse when the committed file differs.
 *
 * WHY A MACHINE: a bound site may hide the vendor's demo posts, and only those. The Claude Cowork plugin
 * (`DemoTrimProfile.php` in the WordPress plugin) trusts the rows this file lists — id, kind,
 * status before and after — and pins the file to the three base files through `baseHash`. A
 * hand-kept list would drift from the archive the first time the release is cut again, and the
 * Claude Cowork plugin would then hide a customer's page or leave a demo article on the customer's site,
 * with no error on either side. The rule, the same as Joomla's:
 *   - a `post` (a news article) that no published navigation opens directly is demo → hidden
 *     (`publish` → `draft`, never deleted);
 *   - a `page` is the site's structure → kept, with the reason (which navigation opens it, or
 *     that the contract maps it);
 *   - the rows of every edition are listed, so a trim on a site whose other languages were
 *     retired first still knows them.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseHashOf } from './build-wordpress-editions.mjs'
import { createHash } from 'node:crypto'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// `TRACY_WP_CONTRACTS` lets the gate test point at a throwaway copy of the tree.
const CONTRACTS =
  process.env.TRACY_WP_CONTRACTS ??
  path.resolve(HERE, '..', 'packages/cms/tracy-wordpress-quickstart/contracts')
const check = process.argv.includes('--check')
const only = process.argv.find((a, i) => process.argv[i - 1] === '--contract')
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/**
 * The trim map of one contract, from its inventory. Pure, so the gate test can feed it a
 * small one and a broken one.
 * @returns {{map: object, problems: string[]}}
 */
export function buildDemoTrim(inventory, contentMap, baseHash, baseFiles) {
  const problems = []
  const mapped = new Set(contentMap.entities.map((e) => e.key))
  const hide = []
  const kept = []
  // Claude Cowork reads every row's language (DemoTrimProfile: a BCP 47-like code is required) and matches it against the
  // editions a retire took down. A site without Polylang has no post language: all its content is the source edition, whose
  // language the inventory records (the plugin's own fallback is 'en', QuickstartContract::SOURCE_LANGUAGE).
  const sourceLanguage = inventory.source?.language || 'en'
  const languageOf = (post) => post.language || sourceLanguage
  for (const post of inventory.posts) {
    const key = `${post.type}-${post.id}`
    const openers = inventory.openedBy[String(post.id)] ?? []
    if (post.type === 'page') {
      const why =
        post.entity && mapped.has(post.entity)
          ? `contract maps it as ${post.entity}`
          : openers.length
            ? `navigation ${openers.join(', ')} opens it`
            : post.status === 'draft'
              ? 'a utility page the theme keeps as a draft'
              : 'a page: the site structure stays'
      kept.push({ key, kind: 'page', id: post.id, language: post.language, reason: why })
      continue
    }
    if (post.type !== 'post') {
      problems.push(`${key}: unexpected type ${post.type} in the inventory`)
      continue
    }
    if (openers.length) {
      kept.push({
        key,
        kind: 'post',
        id: post.id,
        language: post.language,
        reason: `navigation ${openers.join(', ')} opens it`
      })
      continue
    }
    if (post.status !== 'publish') {
      kept.push({ key, kind: 'post', id: post.id, language: post.language, reason: `already ${post.status}` })
      continue
    }
    hide.push({
      key,
      kind: 'post',
      id: post.id,
      field: 'post_status',
      from: 'publish',
      to: 'draft',
      language: languageOf(post),
      reason: 'demo article no navigation opens'
    })
  }
  hide.sort((a, b) => a.id - b.id)
  kept.sort((a, b) => a.id - b.id)
  const map = {
    schemaVersion: 'tracy-quickstart-demo-trim/wordpress/v1',
    extensionVersion: '1.0.0',
    contract: inventory.contract,
    baseHash,
    baseFiles,
    kept,
    hide,
    counts: { hide: hide.length, kept: kept.length, languages: new Set(hide.map((h) => h.language)).size }
  }
  return { map, problems }
}

function* contractDirs() {
  for (const design of readdirSync(CONTRACTS)) {
    const d = path.join(CONTRACTS, design)
    if (!readdirSync(d, { withFileTypes: true }).some((e) => e.isDirectory())) continue
    for (const major of readdirSync(d))
      for (const version of readdirSync(path.join(d, major)))
        yield { id: `${design}/${major}/${version}`, dir: path.join(d, major, version) }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let bad = 0
  let seen = 0
  for (const { id, dir } of contractDirs()) {
    if (only && only !== id) continue
    const inventoryFile = path.join(dir, 'inventory.json')
    if (!existsSync(inventoryFile)) continue
    seen += 1
    const baseFiles = Object.fromEntries(
      ['manifest.json', 'content-map.json', 'presentation-lock.json'].map((n) => [
        n,
        sha256(readFileSync(path.join(dir, n)))
      ])
    )
    const { map, problems } = buildDemoTrim(
      readJson(inventoryFile),
      readJson(path.join(dir, 'content-map.json')),
      baseHashOf(dir),
      baseFiles
    )
    for (const p of problems) {
      console.error(`${id}: ${p}`)
      bad += 1
    }
    const text = JSON.stringify(map, null, 2) + '\n'
    const file = path.join(dir, 'demo-trim-map.json')
    if (check) {
      const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
      if (current !== text) {
        console.error(
          `${id}: demo-trim-map.json differs from the inventory — run scripts/build-wordpress-demo-trim.mjs`
        )
        bad += 1
      } else
        console.log(
          `${id}: demo-trim-map.json up to date (${map.counts.hide} hidden, ${map.counts.kept} kept)`
        )
    } else {
      writeFileSync(file, text)
      console.log(`${id}: wrote demo-trim-map.json (${map.counts.hide} hidden, ${map.counts.kept} kept)`)
    }
  }
  if (!seen) {
    console.error('no WordPress contract carries an inventory.json')
    process.exit(1)
  }
  process.exit(bad ? 1 : 0)
}
