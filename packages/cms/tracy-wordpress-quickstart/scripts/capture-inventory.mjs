#!/usr/bin/env node
/**
 * Capture the inventory of a WordPress quickstart release from its OWN archive, and pin the
 * presentation lock to the same bytes.
 *
 * WHY FROM THE ARCHIVE: the content map of `tracy-business/wp7` 1.1.0 names 8 English pages and
 * two options — nothing about the 205 demo posts, the 165 navigation menus, the 41 Polylang
 * editions or the two template parts the database overrides. Demo trim, editions and the
 * identity slots all need that inventory, and the only source that does not drift is the
 * release's `<slug>-database-<v>.sql.gz` (sha256 in `manifest.json`). A running site is the
 * customer's, not the vendor's.
 *
 * Usage:
 *   node packages/cms/tracy-wordpress-quickstart/scripts/capture-inventory.mjs \
 *     --contract tracy-business/wp7/1.1.0 --dump <database.sql.gz> [--webroot <webroot.tar.gz>] [--check]
 *
 * Writes `contracts/<id>/inventory.json` and rewrites `contracts/<id>/presentation-lock.json`
 * with `files` (sha256 of every file under `fileRoots`, from the webroot tar), `templateParts`
 * (sha256 of each DB template part of the theme) and `entities` (per mapped page: post fields and
 * the skeleton hash — the content with every slot masked to `{{slot}}` by the seeder's own
 * `setBlockValue`, so the Claude Cowork plugin can tell "only slot values changed" from "structure changed").
 * `--check` regenerates in memory and exits 1 when either file differs from what is committed.
 * Two runs on the same inputs are byte-identical (no timestamps).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { phpArray, readDump, tableRows, wordpressPrefix } from '../../tracy-quickstart-tools/mysqldump.mjs'
import { setBlockValue } from '../../tracy-seeder/src/apply-wordpress-contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--'))
    args[a.slice(2)] =
      process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[++i]
}
const contractId = args.contract
const dumpFile = args.dump
if (!contractId || !dumpFile) {
  console.error(
    'usage: capture-inventory.mjs --contract <design>/wp<major>/<version> --dump <database.sql.gz> [--webroot <tar.gz>] [--contracts-root <dir>] [--check]'
  )
  process.exit(2)
}
// `--contracts-root` lets a batch run work on a scratch tree; without it the committed tree is used.
const CONTRACTS =
  typeof args['contracts-root'] === 'string'
    ? path.resolve(args['contracts-root'])
    : path.resolve(HERE, '..', 'contracts')
const dir = path.join(CONTRACTS, contractId)
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const manifest = readJson(path.join(dir, 'manifest.json'))
const contentMap = readJson(path.join(dir, 'content-map.json'))
const lockFile = path.join(dir, 'presentation-lock.json')
const lock = readJson(lockFile)
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

// ---------- provenance: the dump must be the one the manifest names ----------
const dumpBytes = readFileSync(dumpFile)
const dumpSha = sha256(dumpBytes)
const declared = manifest.quickstart?.parts?.database?.sha256
if (declared && declared !== dumpSha) {
  console.error(`the dump ${path.basename(dumpFile)} is ${dumpSha}, but manifest.json names ${declared}`)
  process.exit(1)
}

// ---------- the dump ----------
const sql = readDump(dumpFile)
const prefix = wordpressPrefix(sql)
if (manifest.quickstart?.tablePrefix && manifest.quickstart.tablePrefix !== prefix) {
  console.error(`the dump uses prefix ${prefix}, manifest.json says ${manifest.quickstart.tablePrefix}`)
  process.exit(1)
}
const posts = tableRows(sql, `${prefix}posts`)
const terms = new Map(tableRows(sql, `${prefix}terms`).map((t) => [t.term_id, t]))
const taxonomies = tableRows(sql, `${prefix}term_taxonomy`)
const relationships = tableRows(sql, `${prefix}term_relationships`)
const options = new Map(tableRows(sql, `${prefix}options`).map((o) => [o.option_name, o.option_value]))

const byTaxonomy = new Map(taxonomies.map((tt) => [tt.term_taxonomy_id, tt]))
/** object id → [{taxonomy, slug, description}] */
const termsOf = new Map()
for (const r of relationships) {
  const tt = byTaxonomy.get(r.term_taxonomy_id)
  if (!tt) continue
  const t = terms.get(tt.term_id)
  const list = termsOf.get(r.object_id) ?? []
  list.push({
    taxonomy: tt.taxonomy,
    slug: t?.slug ?? '',
    name: t?.name ?? '',
    description: tt.description ?? '',
    termId: tt.term_id
  })
  termsOf.set(r.object_id, list)
}
const languages = taxonomies
  .filter((tt) => tt.taxonomy === 'language')
  .map((tt) => {
    const t = terms.get(tt.term_id)
    const meta = phpArray(tt.description) ?? {}
    return {
      slug: t.slug,
      name: t.name,
      locale: String(meta.locale ?? ''),
      rtl: !!meta.rtl,
      termId: Number(tt.term_id)
    }
  })
  .sort((a, b) => a.slug.localeCompare(b.slug))
const languageSlugs = new Set(languages.map((l) => l.slug))
const polylang = phpArray(options.get('polylang') ?? '') ?? {}
const sourceSlug = String(polylang.default_lang ?? 'en')
const source = languages.find((l) => l.slug === sourceSlug) ?? { slug: sourceSlug, locale: 'en_US' }

const languageOf = (id) => termsOf.get(id)?.find((t) => t.taxonomy === 'language')?.slug ?? null
const groupOf = (id) => termsOf.get(id)?.find((t) => t.taxonomy === 'post_translations')
const translations = {}
for (const tt of taxonomies.filter((t) => t.taxonomy === 'post_translations')) {
  const t = terms.get(tt.term_id)
  const map = phpArray(tt.description) ?? {}
  translations[t.slug] = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Number(v)]))
}

/** Block names in an opening comment: `<!-- wp:x {"metadata":{"name":"hero.eyebrow"}} -->`. */
const blockNames = (content) =>
  [...content.matchAll(/<!-- wp:[a-z0-9/-]+ \{[^\n]*?"name":"([^"]+)"[^\n]*\} -->/g)].map((m) => m[1])

const stylesheet = options.get('stylesheet')
const themeOf = (id) => termsOf.get(id)?.find((t) => t.taxonomy === 'wp_theme')?.slug ?? null

// ---------- entities the map knows, and their skeleton ----------
const slotsByEntity = new Map()
for (const slot of contentMap.slots) {
  const list = slotsByEntity.get(slot.entity) ?? []
  list.push(slot)
  slotsByEntity.set(slot.entity, list)
}
function skeletonOf(content, entityKey) {
  let masked = content
  for (const slot of slotsByEntity.get(entityKey) ?? []) {
    if (!slot.target?.block) continue
    // An image slot is put back to its demo picture, not masked — the Claude Cowork plugin does the same, so a
    // page nobody touched hashes as it shipped and image slots never move the lock.
    masked =
      slot.type === 'image'
        ? setBlockValue(masked, slot.target.block, 'src', slot.sample, slot.sampleId)
        : setBlockValue(masked, slot.target.block, slot.target.attr ?? 'content', '{{slot}}')
  }
  return sha256(masked)
}
const entityOfPost = new Map()
for (const entity of contentMap.entities) {
  if (entity.kind !== 'page' && entity.kind !== 'post') continue
  const wanted = entity.identity
  const rows = posts.filter(
    (p) =>
      p.post_type === (wanted.postType ?? entity.kind) &&
      p.post_name === wanted.slug &&
      (!wanted.language || languageOf(p.ID) === wanted.language) &&
      p.post_status !== 'trash'
  )
  if (rows.length !== 1) {
    console.error(`entity ${entity.key} resolves to ${rows.length} rows in the dump`)
    process.exit(1)
  }
  entityOfPost.set(rows[0].ID, entity)
}
// An option entity is a row of the dump, or a site identity: every slot a `siteIdentity` field, which
// the archive may lack (absent = every field empty; the first contract apply creates it) — the rule
// the Claude Cowork plugin binds by since WordPress 0.14.9. Any other option the dump lacks is a
// profile describing another archive, and every bind of a site built from it refuses.
for (const entity of contentMap.entities) {
  if (entity.kind !== 'option' || options.has(entity.identity?.name)) continue
  const slots = contentMap.slots.filter((s) => s.entity === entity.key)
  const siteIdentity = slots.length > 0 && slots.every((s) => s.siteIdentity === true && s.target?.field)
  if (!siteIdentity) {
    console.error(`entity ${entity.key}: option ${entity.identity?.name} is not in the dump`)
    process.exit(1)
  }
}

// ---------- posts, navigations, template parts ----------
const CONTENT_TYPES = new Set(['post', 'page'])
const inventoryPosts = posts
  .filter(
    (p) =>
      CONTENT_TYPES.has(p.post_type) &&
      p.post_status !== 'auto-draft' &&
      p.post_status !== 'trash' &&
      p.post_status !== 'inherit'
  )
  .map((p) => {
    const entity = entityOfPost.get(p.ID)
    const row = {
      id: Number(p.ID),
      type: p.post_type,
      status: p.post_status,
      slug: p.post_name,
      title: p.post_title,
      language: languageOf(p.ID),
      parent: Number(p.post_parent) || 0,
      group: groupOf(p.ID)?.slug ?? null,
      blocks: blockNames(p.post_content),
      contentSha256: sha256(p.post_content)
    }
    if (entity) {
      row.entity = entity.key
      row.skeleton = skeletonOf(p.post_content, entity.key)
    }
    return row
  })
  .sort((a, b) => a.id - b.id)

const navigations = posts
  .filter((p) => p.post_type === 'wp_navigation' && p.post_status === 'publish')
  .map((p) => {
    const links = [...p.post_content.matchAll(/<!-- wp:navigation-link (\{[^\n]*?\}) \/?-->/g)]
      .map((m) => {
        try {
          const a = JSON.parse(m[1])
          return { label: a.label ?? '', pageId: a.id ? Number(a.id) : null, url: a.url ?? '' }
        } catch {
          return null
        }
      })
      .filter(Boolean)
    // Language: Polylang's term when present, else the `-<slug>` suffix the archive uses, else the source.
    let language = languageOf(p.ID)
    if (!language) {
      const m = /-([a-z]{2}(?:-[a-z]{2})?)$/.exec(p.post_name)
      language = m && languageSlugs.has(m[1]) ? m[1] : sourceSlug
    }
    return {
      id: Number(p.ID),
      slug: p.post_name,
      title: p.post_title,
      language,
      pageList: p.post_content.includes('wp:page-list'),
      links
    }
  })
  .sort((a, b) => a.id - b.id)

const templateParts = posts
  .filter(
    (p) => p.post_type === 'wp_template_part' && p.post_status === 'publish' && themeOf(p.ID) === stylesheet
  )
  .map((p) => ({
    id: Number(p.ID),
    slug: p.post_name,
    area: termsOf.get(p.ID)?.find((t) => t.taxonomy === 'wp_template_part_area')?.slug ?? null,
    sha256: sha256(p.post_content),
    blocks: blockNames(p.post_content)
  }))
  .sort((a, b) => a.id - b.id)

/** page id → navigation ids whose links open it directly */
const openedBy = {}
for (const nav of navigations)
  for (const l of nav.links) if (l.pageId) (openedBy[l.pageId] ??= []).push(nav.id)
for (const k of Object.keys(openedBy)) openedBy[k].sort((a, b) => a - b)

const OPTIONS = [
  'blogname',
  'blogdescription',
  'page_on_front',
  'page_for_posts',
  'show_on_front',
  'stylesheet',
  'template',
  'permalink_structure',
  'WPLANG',
  'users_can_register',
  'tracy_nav',
  'tracy_hero',
  'tracy_inspiration'
]
const inventory = {
  schemaVersion: 'tracy-quickstart-inventory/wordpress/v1',
  contract: contractId,
  provenance: {
    database: { file: path.basename(dumpFile), sha256: dumpSha },
    webroot: args.webroot
      ? { file: path.basename(args.webroot), sha256: sha256(readFileSync(args.webroot)) }
      : null
  },
  tablePrefix: prefix,
  stylesheet,
  source: { language: source.slug, locale: source.locale },
  languages,
  options: Object.fromEntries(OPTIONS.filter((o) => options.has(o)).map((o) => [o, options.get(o)])),
  counts: {
    posts: inventoryPosts.filter((p) => p.type === 'post').length,
    pages: inventoryPosts.filter((p) => p.type === 'page').length,
    navigations: navigations.length,
    templateParts: templateParts.length,
    languages: languages.length,
    translationGroups: Object.keys(translations).length
  },
  posts: inventoryPosts,
  navigations,
  templateParts,
  translations,
  openedBy
}

// ---------- the lock: theme files from the webroot, template parts and entities from the dump ----------
const nextLock = { ...lock }
if (args.webroot) {
  const webrootBytes = readFileSync(args.webroot)
  const declaredWebroot = manifest.quickstart?.parts?.webroot?.sha256
  if (declaredWebroot && declaredWebroot !== sha256(webrootBytes)) {
    console.error(`the webroot ${path.basename(args.webroot)} does not match manifest.json`)
    process.exit(1)
  }
  const roots = lock.fileRoots ?? []
  const tmp = mkdtempSync(path.join(tmpdir(), 'wp-lock-'))
  try {
    execFileSync('tar', ['-xzf', args.webroot, '-C', tmp, ...roots], { stdio: ['ignore', 'ignore', 'pipe'] })
    const files = {}
    const walk = (rel) => {
      const abs = path.join(tmp, rel)
      for (const name of readdirSync(abs).sort()) {
        const child = path.join(rel, name)
        const st = statSync(path.join(tmp, child))
        if (st.isDirectory()) walk(child)
        else if (st.isFile()) files[child] = sha256(readFileSync(path.join(tmp, child)))
      }
    }
    for (const r of roots) if (existsSync(path.join(tmp, r))) walk(r)
    nextLock.files = files
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
} else if (Array.isArray(nextLock.files)) nextLock.files = {}
nextLock.templateParts = Object.fromEntries(templateParts.map((p) => [p.slug, { sha256: p.sha256 }]))
nextLock.entities = {}
for (const entity of contentMap.entities) {
  if (entity.kind === 'option') {
    nextLock.entities[entity.key] = {}
    continue
  }
  const row = inventoryPosts.find((p) => p.entity === entity.key)
  nextLock.entities[entity.key] = {
    post_type: row.type,
    post_name: row.slug,
    post_status: row.status,
    post_parent: row.parent,
    language: row.language,
    skeleton: row.skeleton
  }
}

// ---------- write or check ----------
const stable = (v) => JSON.stringify(v, null, 2) + '\n'
const outputs = [
  [path.join(dir, 'inventory.json'), stable(inventory)],
  [lockFile, stable(nextLock)]
]
if (args.check) {
  let bad = 0
  for (const [file, text] of outputs) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (current !== text) {
      console.error(`${path.relative(process.cwd(), file)} differs from the archive`)
      bad += 1
    }
  }
  if (bad) process.exit(1)
  console.log(
    `inventory and lock match the archive (${inventory.counts.posts} posts, ${inventory.counts.pages} pages, ${inventory.counts.navigations} navigations, ${inventory.counts.languages} languages)`
  )
} else {
  for (const [file, text] of outputs) writeFileSync(file, text)
  console.log(
    `wrote ${path.relative(process.cwd(), outputs[0][0])} — ${inventory.counts.posts} posts, ${inventory.counts.pages} pages, ${inventory.counts.navigations} navigations, ${inventory.counts.templateParts} template parts, ${inventory.counts.languages} languages, ${inventory.counts.translationGroups} translation groups`
  )
  console.log(
    `wrote ${path.relative(process.cwd(), lockFile)} — ${Object.keys(nextLock.files ?? {}).length} theme files, ${Object.keys(nextLock.templateParts).length} template parts, ${Object.keys(nextLock.entities).length} entities`
  )
}
