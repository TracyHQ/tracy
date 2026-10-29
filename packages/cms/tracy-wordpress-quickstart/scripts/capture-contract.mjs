#!/usr/bin/env node
/**
 * Derive the FIRST content map of a WordPress quickstart from its own database dump.
 *
 * WHY: `capture-inventory.mjs` and `capture-image-slots.mjs` finish a profile (lock hashes, image
 * slots) but both start from a `content-map.json` somebody already wrote — for tracy-base and
 * tracy-business that was done by hand. A card template that has no profile yet has no map, so the
 * batch tool needs one made from the release itself: the entities and the text/link slots that the
 * Claude Cowork plugin can really address, found by the rule it addresses them with.
 *
 * THE RULE (QuickstartContract::findBlock / setBlockValue): a slot lives in a block named by
 * `metadata.name` in its opening comment, the FIRST block of that name in the page, and the value
 * is the text of the one element the block wraps (a button's is its link's text). So a slot is made
 * only for a block that
 *   - has a name, and is the first with that name in its page,
 *   - is a heading, paragraph, list item or button whose element holds plain text (no inline
 *     markup — such text cannot round-trip through a single-value slot), and
 *   - survives the seeder's own `setBlockValue` (the same function `capture-inventory.mjs` hashes
 *     with), so the lock and the plugin agree about the bytes around it.
 * Everything else is reported in `coverage`, never invented: named blocks with inline markup,
 * second blocks of a name, pages that are ambiguous or carry no slot.
 *
 * Entities: the site name and tagline options, and every published page whose type+slug is exactly
 * one non-trashed row. The release's own languages (Polylang) are out of scope: a multilingual
 * dump is refused, because a map of one edition does not describe the others.
 *
 * Usage (writes the three profile files into `<contracts-root>/<contract>/`, ready for
 * `capture-inventory.mjs --contracts-root <dir>`):
 *   node capture-contract.mjs --contract <slug>/wp7/<version> --dump <database.sql.gz>
 *     --release-manifest <manifest.json> --tag <release tag> --cowork-version <x.y.z>
 *     --contracts-root <dir> [--webroot-members <file listing the archive's paths>]
 *     [--previous-map <previous version's content-map.json>] [--unplaced-report <file>]
 *     [--all-text] [--role-vocabulary 2|3]
 *
 * ALL VISIBLE TEXT (spec #37, issue #43): `--all-text` also makes a slot for every heading, paragraph, list item, button,
 * table cell, cite and menu label that has no `metadata.name` (or repeats one), and a url slot for each link in them.
 * Such a slot is addressed by position (`target.blockType` + `target.occurrence`, see `capture-all-text.mjs`); a named
 * first block keeps its name key and target. Off by default so every released profile re-captures byte for byte.
 * `--role-vocabulary 3` writes version 3 roles (default 2), as the Joomla capture does. With `--all-text` the header and
 * the footer the theme stores are captured too, each a `templatePart` entity (`partSlots`, TracyHQ/tracy#139).
 *
 * SLOT ROLES (ADR 0038): every text and image slot of the map carries a `role` and a `group`. A recapture passes the
 * previous version's content map as --previous-map: a slot whose key AND sample are unchanged keeps its role and group
 * (the packaging agent reviewed them), the rule tables place the rest, and the slots they cannot place are printed on
 * stdout (and written to --unplaced-report, a file kept outside the contract) for the agent to bind.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDump, tableRows, wordpressPrefix } from '../../tracy-quickstart-tools/mysqldump.mjs'
import { setBlockValue } from '../../tracy-seeder/src/apply-wordpress-contract.mjs'
import { proposeContentMapRoles } from '../../../../scripts/slot-roles/rule-tables.mjs'
import { allTextSlots } from './capture-all-text.mjs'

const TEXT_BLOCKS = new Set(['heading', 'paragraph', 'list-item', 'button'])
const OPTION_SLOTS = [
  { option: 'blogname', key: 'site.name', input: 'name', label: 'Site name', max: 80 },
  { option: 'blogdescription', key: 'site.tagline', input: 'tagline', label: 'Tagline', max: 160 }
]
const LOCK_OPTIONS = ['stylesheet', 'template', 'show_on_front', 'permalink_structure', 'users_can_register']

const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n]
    )

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The block `findBlock` would find for `name`: its comment, its inner markup and attributes. */
export function findNamedBlock(markup, name) {
  const open = new RegExp(
    `<!-- wp:([a-z0-9-]+/)?([a-z0-9-]+) (\\{[^\\n]*"name":"${escapeRegExp(name)}"[^\\n]*\\}) -->`
  )
  const m = open.exec(markup)
  if (!m) return null
  const ns = m[1] ?? ''
  const block = m[2]
  const innerStart = m.index + m[0].length
  const innerEnd = markup.indexOf(`<!-- /wp:${ns}${block} -->`, innerStart)
  if (innerEnd === -1) return null
  return { ns, block, attrs: m[3], start: m.index, inner: markup.slice(innerStart, innerEnd) }
}

/** The text a `content` slot reads (`getBlockValue`), or null when the block has no single text element. */
export function readText(found) {
  const pattern =
    found.block === 'button' ? /<a\b[^>]*>([\s\S]*?)<\/a>/ : /^\s*<([a-z0-9]+)\b[^>]*>([\s\S]*?)<\/\1>\s*$/
  const m = pattern.exec(found.inner)
  if (!m) return null
  return found.block === 'button' ? m[1] : m[2]
}

/** A button's link, as `getBlockValue(…, 'url')` reads it, or null. */
export function readUrl(found) {
  try {
    const attrs = JSON.parse(found.attrs)
    if (attrs && typeof attrs.url === 'string') return attrs.url
  } catch {
    return null
  }
  const m = /<a\b[^>]*\bhref="([^"]*)"/.exec(found.inner)
  return m ? decodeEntities(m[1]) : null
}

/** Why the plugin cannot address the first block of `name` by its name, or null: the check the named path always made. */
const nameProblemIn = (content) => (name, start) => {
  const found = findNamedBlock(content, name)
  if (!found || found.start !== start) return 'the plugin would find another block under that name'
  try {
    if (setBlockValue(content, name, 'content', '{{slot}}') === content)
      throw new Error('masking changed nothing')
  } catch (e) {
    if (found.block !== 'button' || !/no text element/.test(e.message))
      return `setBlockValue refuses it: ${e.message}`
  }
  return null
}

/**
 * The slots of one page and everything that was left out of it, with the reason.
 * @returns {{ slots: object[], skipped: string[] }}
 */
export function pageSlots({ content, entityKey, prefix, allText = false }) {
  if (allText) return allTextSlots({ content, entityKey, prefix, nameProblem: nameProblemIn(content) })
  const slots = []
  const skipped = []
  const seen = new Set()
  const opening = /<!-- wp:([a-z0-9-]+\/)?([a-z0-9-]+) (\{[^\n]*\}) -->/g
  for (const m of content.matchAll(opening)) {
    let name
    try {
      name = JSON.parse(m[3])?.metadata?.name
    } catch {
      continue
    }
    if (typeof name !== 'string' || name === '') continue
    const blockType = m[2]
    if (seen.has(name)) {
      skipped.push(`${entityKey}:${name} (a second block of that name; only the first is addressable)`)
      continue
    }
    seen.add(name)
    if (blockType === 'image') continue // `capture-image-slots.mjs` owns pictures
    if (!TEXT_BLOCKS.has(blockType) || (m[1] && m[1] !== 'core/')) {
      continue
    }
    const found = findNamedBlock(content, name)
    if (!found || found.start !== m.index) {
      skipped.push(`${entityKey}:${name} (the plugin would find another block under that name)`)
      continue
    }
    const raw = readText(found)
    if (raw === null || raw.includes('<')) {
      skipped.push(`${entityKey}:${name} (${raw === null ? 'no single text element' : 'inline markup'})`)
      continue
    }
    const sample = decodeEntities(raw)
    if (sample.trim() === '') continue
    try {
      const masked = setBlockValue(content, name, 'content', '{{slot}}')
      if (masked === content) throw new Error('masking changed nothing')
    } catch (e) {
      skipped.push(`${entityKey}:${name} (setBlockValue refuses it: ${e.message})`)
      continue
    }
    const base = `${prefix}.${name}`
    slots.push({
      key: base,
      entity: entityKey,
      target: { block: name, attr: 'content' },
      type: 'text',
      sample,
      maxCharacters: Math.max(80, Math.min(2000, sample.length * 2 + 20)),
      label: `${prefix} — ${name}`
    })
    if (blockType === 'button') {
      const url = readUrl(found)
      if (url !== null) {
        try {
          setBlockValue(content, name, 'url', '{{slot}}')
          slots.push({
            key: `${base}.url`,
            entity: entityKey,
            target: { block: name, attr: 'url' },
            type: 'url',
            sample: url,
            maxCharacters: 2048,
            label: `${prefix} — ${name} (link)`
          })
        } catch (e) {
          skipped.push(`${entityKey}:${name} link (setBlockValue refuses it: ${e.message})`)
        }
      }
    }
  }
  return { slots, skipped }
}

/** The template parts a theme prints on every page, captured as content map entities with every text (#139). */
export const CAPTURED_PARTS = ['header', 'footer']

/** The rows of a table, or none when the dump has no such table (an older dump without terms). */
const rowsOf = (sql, name) => {
  try {
    return tableRows(sql, name)
  } catch {
    return []
  }
}

/**
 * The header and the footer the active theme stores in the database (`wp_template_part`, its `wp_theme` term), each a
 * `templatePart` entity found by its slug, as the Claude Cowork plugin's contract finds one, with a slot for every text
 * (`allTextSlots`: by name, else by position). A part the theme keeps only as a file is not in the dump and is not
 * captured; the build's sweep keeps handling it.
 * @param {{ sql: string, prefix: string, posts: any[], stylesheet: string }} input
 */
export function partSlots({ sql, prefix, posts, stylesheet }) {
  const terms = new Map(rowsOf(sql, `${prefix}terms`).map((t) => [t.term_id, t.slug]))
  const themeTerms = new Map(
    rowsOf(sql, `${prefix}term_taxonomy`)
      .filter((tt) => tt.taxonomy === 'wp_theme')
      .map((tt) => [tt.term_taxonomy_id, terms.get(tt.term_id)])
  )
  const themeOf = new Map(
    rowsOf(sql, `${prefix}term_relationships`)
      .filter((r) => themeTerms.has(r.term_taxonomy_id))
      .map((r) => [r.object_id, themeTerms.get(r.term_taxonomy_id)])
  )
  const entities = []
  const slots = []
  const skipped = []
  for (const slug of CAPTURED_PARTS) {
    const rows = posts.filter(
      (p) =>
        p.post_type === 'wp_template_part' &&
        p.post_status === 'publish' &&
        p.post_name === slug &&
        themeOf.get(p.ID) === stylesheet
    )
    if (rows.length !== 1) {
      if (rows.length > 1) skipped.push(`part-${slug} (${rows.length} rows of the theme)`)
      continue
    }
    const key = `part-${slug}`
    const got = pageSlots({ content: rows[0].post_content, entityKey: key, prefix: key, allText: true })
    skipped.push(...got.skipped)
    if (got.slots.length === 0) continue
    entities.push({ key, kind: 'templatePart', identity: { slug } })
    slots.push(...got.slots)
  }
  return { entities, slots, skipped }
}

/**
 * The fields of a release's `manifest.json` this tool reads, whichever of the two shapes it has: the
 * older one (`webroot`/`database` at the top, `wpVersion`, `phpVersion`, `theme` as a name or object)
 * and the newer `tracy-quickstart/v1` one (`parts`, `cms: {version}`, no PHP version). A field the
 * manifest does not state stays undefined; none is guessed.
 */
export function normalizeRelease(m) {
  const part = (name) => m[name] ?? m.parts?.[name]
  return {
    version: m.version,
    prefix: m.prefix,
    wpVersion: m.wpVersion ?? (typeof m.cms === 'object' ? m.cms?.version : m.cms),
    phpVersion: m.phpVersion,
    placeholderUrl: m.placeholderUrl,
    theme: typeof m.theme === 'string' ? m.theme : m.theme?.name,
    webroot: part('webroot'),
    database: part('database')
  }
}

/**
 * The whole profile (manifest, content map, lock skeleton) of one release, from its dump.
 * `release` is the release's own manifest.json; `card` carries tag, version, install parts.
 * Throws a plain Error naming the first thing that makes a profile impossible.
 */
export function deriveProfile({
  sql,
  release: raw,
  card,
  coworkVersion,
  themeRoots,
  previousMap,
  allText = false,
  vocabulary
}) {
  const release = normalizeRelease(raw)
  if (!release.webroot?.file || !release.database?.file)
    throw new Error('manifest.json names no webroot/database archive')
  const prefix = wordpressPrefix(sql)
  if (release.prefix && release.prefix !== prefix)
    throw new Error(`the dump uses table prefix ${prefix}, manifest.json says ${release.prefix}`)
  const options = new Map(tableRows(sql, `${prefix}options`).map((o) => [o.option_name, o.option_value]))
  const taxonomies = tableRows(sql, `${prefix}term_taxonomy`)
  if (taxonomies.some((t) => t.taxonomy === 'language'))
    throw new Error('the dump carries Polylang languages; a map of one edition does not describe the others')
  const stylesheet = options.get('stylesheet')
  const themeName = release.theme
  if (!stylesheet || stylesheet !== themeName)
    throw new Error(`the active theme is ${stylesheet}, manifest.json names ${themeName}`)

  const entities = []
  const slots = []
  const coverage = { pages: 0, pagesWithoutSlots: [], ambiguousPages: [], skipped: [] }
  for (const o of OPTION_SLOTS) {
    if (!options.has(o.option)) continue
    const value = options.get(o.option)
    entities.push({ key: `option-${o.option}`, kind: 'option', identity: { name: o.option }, initial: value })
    slots.push({
      key: o.key,
      entity: `option-${o.option}`,
      target: { option: o.option },
      type: 'text',
      sample: value,
      maxCharacters: o.max,
      input: o.input,
      label: o.label
    })
  }
  const posts = tableRows(sql, `${prefix}posts`)
  const taken = new Set()
  for (const p of posts
    .filter((x) => x.post_type === 'page' && x.post_status === 'publish')
    .sort((a, b) => Number(a.ID) - Number(b.ID))) {
    coverage.pages += 1
    const same = posts.filter(
      (x) => x.post_type === 'page' && x.post_name === p.post_name && x.post_status !== 'trash'
    )
    if (p.post_name === '' || same.length !== 1 || taken.has(p.post_name)) {
      coverage.ambiguousPages.push(`${p.post_name || '(no slug)'} (${same.length} rows)`)
      continue
    }
    taken.add(p.post_name)
    const key = `page-${p.post_name}`
    const got = pageSlots({ content: p.post_content, entityKey: key, prefix: p.post_name, allText })
    coverage.skipped.push(...got.skipped)
    if (got.slots.length === 0) {
      coverage.pagesWithoutSlots.push(p.post_name)
      continue
    }
    entities.push({ key, kind: 'page', identity: { postType: 'page', slug: p.post_name } })
    slots.push(...got.slots)
  }
  if (allText) {
    const got = partSlots({ sql, prefix, posts, stylesheet })
    entities.push(...got.entities)
    slots.push(...got.slots)
    coverage.skipped.push(...got.skipped)
    coverage.parts = got.entities.map((e) => e.identity.slug)
  }
  const keys = new Set()
  for (const s of slots) {
    if (keys.has(s.key)) throw new Error(`slot key ${s.key} is made twice`)
    keys.add(s.key)
  }
  const pageSlotCount = slots.filter((s) => !s.target.option).length
  if (entities.filter((e) => e.kind === 'page').length === 0 || pageSlotCount === 0)
    throw new Error(
      'no page of the dump has a named text block the plugin can address; the map would hold only the site name'
    )

  const sha = (name) => release[name]
  const part = (name) => ({
    file: sha(name).file,
    bytes: sha(name).bytes,
    sha256: sha(name).sha256,
    githubAssetId: card.assets?.[sha(name).file]?.id,
    url: `https://github.com/${card.repo}/releases/download/${encodeURIComponent(card.tag)}/${sha(name).file}`
  })
  const manifest = {
    schemaVersion: 'tracy-quickstart-contract/v1',
    id: `${card.slug}/wp7/${card.version}`,
    platform: 'wordpress',
    theme: stylesheet,
    quickstart: {
      schemaVersion: 'tracy-runtime-quickstart/v1',
      release: card.tag,
      version: card.version,
      platform: 'wordpress',
      platformVersion: release.wpVersion,
      phpVersion: release.phpVersion,
      tablePrefix: prefix,
      placeholderUrl: release.placeholderUrl,
      theme: stylesheet,
      coworkVersion: null,
      writeDoor: 'installed-at-provision',
      parts: { webroot: part('webroot'), database: part('database') }
    },
    coworkContractVersion: coworkVersion,
    mode: 'content-recommendation'
  }
  const contentMap = {
    schemaVersion: 'tracy-quickstart-content-map/wordpress/v1',
    $comment: `Derived from ${card.tag} ${card.version}'s own database by capture-contract.mjs: the site name and tagline, and every named heading, paragraph, list item and button of a published page whose text is plain. A block is found by its metadata.name, never by position.`,
    entities,
    slots
  }
  const carried = carryRoles(contentMap, previousMap)
  const { contentMap: mapWithRoles, unplaced } = proposeContentMapRoles(carried, {
    cms: 'wordpress',
    ...(vocabulary ? { vocabulary } : {})
  })
  const lock = {
    schemaVersion: 'tracy-quickstart-presentation-lock/wordpress/v1',
    $comment: `What a build must leave alone on a restored ${card.tag} ${card.version} site. Options are compared by value; files by sha256 of the shipped theme, captured from the release's webroot archive; each governed page by the hash of its markup with every slot masked.`,
    options: Object.fromEntries(LOCK_OPTIONS.filter((o) => options.has(o)).map((o) => [o, options.get(o)])),
    themeMods: { theme: stylesheet, protected: ['custom_css_post_id', 'nav_menu_locations'] },
    fileRoots: themeRoots,
    files: {}
  }
  return {
    manifest,
    contentMap: mapWithRoles,
    unplaced,
    lock,
    coverage,
    stylesheet,
    template: options.get('template') ?? stylesheet
  }
}

/** The map with the role and group of every slot of `previousMap` whose key and sample are unchanged. */
function carryRoles(contentMap, previousMap) {
  if (!previousMap) return contentMap
  const before = new Map((previousMap.slots ?? []).map((s) => [s.key, s]))
  const slots = contentMap.slots.map((slot) => {
    const old = before.get(slot.key)
    if (!old || old.role === undefined || old.sample !== slot.sample) return slot
    return { ...slot, role: old.role, ...(old.group ? { group: old.group } : {}) }
  })
  return { ...contentMap, slots }
}

const stable = (v) => `${JSON.stringify(v, null, 2)}\n`

function main() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a === '--all-text') args['all-text'] = true
    else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
  }
  const need = [
    'contract',
    'dump',
    'release-manifest',
    'tag',
    'cowork-version',
    'contracts-root',
    'theme-roots'
  ]
  const missing = need.filter((k) => !args[k])
  if (missing.length) {
    console.error(`usage: capture-contract.mjs ${need.map((k) => `--${k} <v>`).join(' ')}`)
    process.exit(2)
  }
  const [slug, , version] = args.contract.split('/')
  const release = JSON.parse(readFileSync(args['release-manifest'], 'utf8'))
  const dumpSha = createHash('sha256').update(readFileSync(args.dump)).digest('hex')
  const named = normalizeRelease(release).database?.sha256
  if (named !== dumpSha) {
    console.error(`the dump is ${dumpSha}, manifest.json names ${named}`)
    process.exit(1)
  }
  const out = deriveProfile({
    sql: readDump(args.dump),
    release,
    card: { slug, version, tag: args.tag, repo: args.repo ?? 'JoomlArt-Products/ja-products', assets: {} },
    coworkVersion: args['cowork-version'],
    themeRoots: args['theme-roots'].split(','),
    allText: args['all-text'] === true,
    vocabulary: args['role-vocabulary'] === '3' ? 'place-content-roles/3' : undefined,
    previousMap: args['previous-map'] ? JSON.parse(readFileSync(args['previous-map'], 'utf8')) : undefined
  })
  const dir = path.join(path.resolve(args['contracts-root']), args.contract)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'manifest.json'), stable(out.manifest))
  writeFileSync(path.join(dir, 'content-map.json'), stable(out.contentMap))
  writeFileSync(path.join(dir, 'presentation-lock.json'), stable(out.lock))
  if (args['unplaced-report']) writeFileSync(args['unplaced-report'], stable({ unplaced: out.unplaced }))
  console.log(
    `Slots without a role (${out.unplaced.length}), for the packaging agent to bind: ${out.unplaced.join(', ') || 'none'}`
  )
  console.log(
    JSON.stringify({
      entities: out.contentMap.entities.length,
      slots: out.contentMap.slots.length,
      coverage: out.coverage
    })
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
