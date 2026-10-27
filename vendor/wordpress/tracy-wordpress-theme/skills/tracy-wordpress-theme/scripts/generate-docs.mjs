#!/usr/bin/env node
// generate-docs.mjs — the source inventory that ships with a theme, and the gate that says the
// authored docs are finished.
//
//   node scripts/generate-docs.mjs --theme <dir> [--spec <spec-pack dir>] [--seed-report <json>]
//        [--out <dir>] [--check]
//
// Reads FILES only — never a running site, a database or a runner. `--theme` is a built theme
// directory (style.css + theme.json) or a generator overlay (`theme.config.json`, no theme.json):
// an overlay resolves to its built tree `../../src/<slug>/` and is recorded as the target's own
// file list, so the inventory can say which patterns are the target's and which come from the
// source theme. `--out` defaults to `<theme>/docs/generated` (the directory given, so an overlay
// keeps the generated files where the build copies them from).
//
// Writes inventory.json + inventory.md: templates and parts (with the parts, patterns and
// navigation blocks each references), patterns (slug, title, categories, count of `role: content`
// blocks), style variations, custom templates, the presets of theme.json, blocks registered from
// blocks/*/block.json, assets enqueued by inc/*.php and functions.php, the options the theme
// reads, and — when given — the spec-pack's page-map routes and menus, and the seed report's
// counts, labelled "at seed time, not live". Deterministic: no timestamps of its own, sorted
// lists, sha256 of every input, so a rerun on unchanged inputs is byte-identical.
//
// `--check` writes nothing and exits 1 when a `DOCS_REQUIRED:` marker survives in AGENTS.md or
// docs/*.md, when one of the seven authored files is missing or empty, or when the generated
// files are missing or differ from what the inputs produce now (stale inventory). It checks
// completeness and freshness, not that the prose is true.

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import phpParser from 'php-parser'

export const DOC_NAMES = [
  'architecture',
  'install',
  'content-model',
  'content-rules',
  'design-system',
  'checks-and-recovery'
]
export const MARKER = 'DOCS_REQUIRED:'
/** Theme paths the fingerprint skips: the docs themselves (they would hash their own output) and Finder droppings. */
const SKIP_FINGERPRINT = (rel) =>
  rel === 'AGENTS.md' || rel === 'README.md' || rel.startsWith('docs/') || rel.endsWith('.DS_Store')

export class UsageError extends Error {}

export function parseArgs(argv) {
  const o = { theme: null, spec: null, seedReport: null, out: null, check: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`)
      return argv[++i]
    }
    if (a === '--theme') o.theme = next()
    else if (a === '--spec') o.spec = next()
    else if (a === '--seed-report') o.seedReport = next()
    else if (a === '--out') o.out = next()
    else if (a === '--check') o.check = true
    else if (a === '--help' || a === '-h') o.help = true
    else throw new UsageError(`unknown argument ${a}`)
  }
  if (!o.help && !o.theme) throw new UsageError('--theme <dir> is required')
  return o
}

const sha256 = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`
const sortKeys = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))

/** Every file under `dir`, posix-relative, sorted; the fingerprint skips docs and droppings. */
function walk(dir, rel = '') {
  const out = []
  const abs = path.join(dir, rel)
  if (!existsSync(abs)) return out
  for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const next = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(dir, next))
    else if (entry.isFile()) out.push(next)
  }
  return out
}

/**
 * Where the theme's files are. An overlay (theme.config.json, no theme.json) is the target's own
 * layer; the whole theme is the built tree beside it.
 */
function resolveTheme(given) {
  const dir = path.resolve(given)
  if (!existsSync(dir) || !statSync(dir).isDirectory())
    throw new UsageError(`--theme: not a directory: ${given}`)
  const hasThemeJson = existsSync(path.join(dir, 'theme.json'))
  const configPath = path.join(dir, 'theme.config.json')
  if (!hasThemeJson && existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const built = path.resolve(dir, '..', '..', 'src', String(config.slug))
    if (!existsSync(path.join(built, 'theme.json')))
      throw new UsageError(
        `--theme: ${given} is an overlay of ${config.slug} but its built tree ${built} has no theme.json — build the target first`
      )
    return { docsDir: dir, themeDir: built, overlayDir: dir, slug: String(config.slug) }
  }
  if (!existsSync(path.join(dir, 'style.css'))) throw new UsageError(`--theme: ${given} has no style.css`)
  return { docsDir: dir, themeDir: dir, overlayDir: null, slug: path.basename(dir) }
}

/** The `Key: value` header of style.css or a pattern file. */
export function parseHeader(text, keys) {
  const out = {}
  for (const key of keys) {
    const m = new RegExp(`^[\\s*/]*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+?)\\s*$`, 'mi').exec(
      text
    )
    if (m) out[key] = m[1]
  }
  return out
}

const PATTERN_KEYS = [
  'Title',
  'Slug',
  'Description',
  'Categories',
  'Block Types',
  'Post Types',
  'Template Types',
  'Inserter',
  'Keywords'
]
const STYLE_KEYS = [
  'Theme Name',
  'Version',
  'Requires at least',
  'Tested up to',
  'Requires PHP',
  'Text Domain',
  'Update URI',
  'License'
]

const list = (v) =>
  v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
const count = (re, text) => (text.match(re) ?? []).length
const uniq = (arr) => [...new Set(arr)].sort()

/** Blocks a template or part reaches for: parts by slug, patterns by slug, navigation refs, custom blocks. */
export function referencesIn(html) {
  const attrs = (name) =>
    [...html.matchAll(new RegExp(`<!-- wp:${name} (\\{[^\\n]*?\\}) /?-->`, 'g'))].map((m) => {
      try {
        return JSON.parse(m[1])
      } catch {
        return {}
      }
    })
  return {
    parts: uniq(
      attrs('template-part')
        .map((a) => a.slug)
        .filter(Boolean)
    ),
    patterns: uniq(
      attrs('pattern')
        .map((a) => a.slug)
        .filter(Boolean)
    ),
    navigationBlocks: count(/<!-- wp:navigation[ {]/g, html),
    customBlocks: uniq([...html.matchAll(/<!-- wp:((?!core\/)[a-z0-9-]+\/[a-z0-9-]+)/g)].map((m) => m[1]))
  }
}

function inventoryTheme(resolved) {
  const { themeDir, overlayDir } = resolved
  const files = walk(themeDir)
  const read = (rel) => readFileSync(path.join(themeDir, rel), 'utf8')
  const overlayFiles = overlayDir ? new Set(walk(overlayDir).filter((rel) => !SKIP_FINGERPRINT(rel))) : null
  const own = (rel) => (overlayFiles ? overlayFiles.has(rel) : true)

  const header = parseHeader(read('style.css'), STYLE_KEYS)
  const themeJson = JSON.parse(read('theme.json'))
  const s = themeJson.settings ?? {}
  const presets = {
    palette: (s.color?.palette ?? []).map((p) => ({ slug: p.slug, name: p.name })),
    fontFamilies: (s.typography?.fontFamilies ?? []).map((f) => ({ slug: f.slug, name: f.name })),
    fontSizes: (s.typography?.fontSizes ?? []).map((f) => f.slug),
    spacingSizes: (s.spacing?.spacingSizes ?? []).map((f) => f.slug),
    layout: { contentSize: s.layout?.contentSize ?? null, wideSize: s.layout?.wideSize ?? null },
    customKeys: Object.keys(s.custom ?? {}).sort(),
    inspiration: s.custom?.tracy?.inspiration ?? null,
    stylesCss: typeof themeJson.styles?.css === 'string' ? themeJson.styles.css.length : 0
  }

  const templates = files
    .filter((f) => /^templates\/[^/]+\.html$/.test(f))
    .map((f) => ({ name: path.basename(f, '.html'), own: own(f), ...referencesIn(read(f)) }))
  const parts = files
    .filter((f) => /^parts\/[^/]+\.html$/.test(f))
    .map((f) => ({ name: path.basename(f, '.html'), own: own(f), ...referencesIn(read(f)) }))
  const patterns = files
    .filter((f) => /^patterns\/[^/]+\.php$/.test(f))
    .map((f) => {
      const text = read(f)
      const h = parseHeader(text, PATTERN_KEYS)
      return {
        file: f,
        slug: h.Slug ?? null,
        title: h.Title ?? null,
        categories: list(h.Categories),
        blockTypes: list(h['Block Types']),
        postTypes: list(h['Post Types']),
        templateTypes: list(h['Template Types']),
        inserter: h.Inserter ? h.Inserter.toLowerCase() !== 'no' : true,
        contentBlocks: count(/"role":\s*"content"/g, text),
        namedBlocks: uniq([...text.matchAll(/"name":\s*"([^"]+)"/g)].map((m) => m[1])).length,
        own: own(f)
      }
    })
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
  const variations = files
    .filter((f) => /^styles\/[^/]+\.json$/.test(f))
    .map((f) => {
      const v = JSON.parse(read(f))
      return {
        id: path.basename(f, '.json'),
        title: v.title ?? null,
        inspiration: v.settings?.custom?.tracy?.inspiration ?? null
      }
    })
  const blocks = files
    .filter((f) => /^blocks\/[^/]+\/block\.json$/.test(f))
    .map((f) => {
      const b = JSON.parse(read(f))
      return {
        name: b.name ?? null,
        title: b.title ?? null,
        version: b.version ?? null,
        attributes: Object.keys(b.attributes ?? {}).sort(),
        render: b.render ?? null,
        editorScript: b.editorScript ?? null,
        dir: path.dirname(f)
      }
    })

  const php = files.filter((f) => f === 'functions.php' || /^inc\/[^/]+\.php$/.test(f))
  const enqueued = []
  const optionsRead = new Set()
  const hooks = []
  for (const f of php) {
    const text = read(f)
    for (const m of text.matchAll(
      /wp_enqueue_(style|script)\(\s*'([^']+)'\s*,\s*get_theme_file_uri\(\s*(?:'([^']+)'\s*|([^)]+))\)/g
    ))
      enqueued.push({ kind: m[1], handle: m[2], path: m[3] ?? `(${m[4].trim()})`, file: f })
    for (const m of text.matchAll(/\bget_option\(\s*'([a-z0-9_]+)'/g)) optionsRead.add(m[1])
    // A hook name built by concatenation ('admin_post_' . ACTION) is recorded with a trailing ellipsis.
    for (const m of text.matchAll(/\badd_(action|filter)\(\s*'([^']+)'(\s*\.)?/g))
      hooks.push({ kind: m[1], hook: m[3] ? `${m[2]}…` : m[2], file: f })
  }
  enqueued.sort((a, b) => a.handle.localeCompare(b.handle) || a.file.localeCompare(b.file))
  hooks.sort((a, b) => a.hook.localeCompare(b.hook) || a.file.localeCompare(b.file))

  const fingerprints = {}
  for (const f of files)
    if (!SKIP_FINGERPRINT(f)) fingerprints[f] = sha256(readFileSync(path.join(themeDir, f)))

  return {
    header: sortKeys(header),
    themeJson: {
      version: themeJson.version ?? null,
      customTemplates: (themeJson.customTemplates ?? []).map((c) => ({
        name: c.name,
        title: c.title,
        postTypes: c.postTypes ?? []
      })),
      templateParts: (themeJson.templateParts ?? []).map((p) => ({
        name: p.name,
        title: p.title,
        area: p.area
      }))
    },
    presets,
    templates,
    parts,
    patterns,
    variations,
    blocks,
    enqueued,
    optionsRead: [...optionsRead].sort(),
    hooks,
    overlay: overlayFiles ? { dir: path.basename(overlayDir), files: [...overlayFiles].sort() } : null,
    fileCount: Object.keys(fingerprints).length,
    fingerprints
  }
}

const countTree = (items) =>
  Array.isArray(items) ? items.reduce((n, i) => n + 1 + countTree(i.children), 0) : 0

function inventorySpec(specDir) {
  const dir = path.resolve(specDir)
  const read = (name) => {
    const p = path.join(dir, name)
    if (!existsSync(p)) return null
    const buf = readFileSync(p)
    return { json: JSON.parse(buf.toString('utf8')), hash: sha256(buf) }
  }
  const pageMap = read('page-map.json')
  const menus = read('menus.json')
  const redirects = read('redirects.json')
  const inputs = {}
  if (pageMap) inputs['page-map.json'] = pageMap.hash
  if (menus) inputs['menus.json'] = menus.hash
  if (redirects) inputs['redirects.json'] = redirects.hash
  const pages = pageMap?.json.pages ?? []
  const byView = {}
  for (const p of pages) byView[p.view ?? 'page'] = (byView[p.view ?? 'page'] ?? 0) + 1
  return {
    dir: path.basename(dir),
    theme: pageMap?.json.theme ?? null,
    routes: pages
      .map((p) => ({ path: p.path, view: p.view ?? null, title: p.title ?? null }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    routesByView: sortKeys(byView),
    gaps: pageMap?.json.gaps?.length ?? 0,
    menus: (menus?.json.menus ?? []).map((m) => ({
      slug: m.menutype,
      title: m.title,
      items: countTree(m.items)
    })),
    redirects: redirects?.json.rules?.length ?? 0,
    inputs
  }
}

function inventorySeed(file) {
  const buf = readFileSync(path.resolve(file))
  const r = JSON.parse(buf.toString('utf8'))
  const counts = {}
  for (const [kind, c] of Object.entries(r.counts ?? {}))
    counts[kind] = {
      total: (c.created ?? 0) + (c.updated ?? 0) + (c.skipped ?? 0),
      created: c.created ?? 0,
      updated: c.updated ?? 0,
      skipped: c.skipped ?? 0
    }
  const byPattern = {}
  const byKind = {}
  for (const s of r.sections ?? []) {
    byKind[s.kind] = (byKind[s.kind] ?? 0) + 1
    if (s.pattern) byPattern[s.pattern] = (byPattern[s.pattern] ?? 0) + 1
  }
  return {
    file: path.basename(file),
    startedAt: r.startedAt ?? null,
    label: 'at seed time, not live',
    counts: sortKeys(counts),
    navigation: Object.keys(r.navigation ?? {}).sort(),
    templateParts: Object.keys(r.templateParts ?? {}).sort(),
    redirects: (r.redirects ?? []).length,
    sections: {
      total: (r.sections ?? []).length,
      byKind: sortKeys(byKind),
      byPattern: sortKeys(byPattern),
      pages: uniq((r.sections ?? []).map((s) => s.page)).length
    },
    routes: { checked: (r.routes ?? []).length, ok: (r.routes ?? []).filter((x) => x.ok).length },
    media: r.media ?? null,
    notes: (r.notes ?? []).map((n) => n.note).filter(Boolean),
    hash: sha256(buf)
  }
}

export function buildInventory(o) {
  const resolved = resolveTheme(o.theme)
  const theme = inventoryTheme(resolved)
  const spec = o.spec ? inventorySpec(o.spec) : null
  const seed = o.seedReport ? inventorySeed(o.seedReport) : null
  return {
    format: 1,
    scope:
      'Read from theme files, the spec-pack and the seed report only. No live site, no database, no ids. Counts under "seed" are at seed time, not live.',
    theme: { slug: resolved.slug, dir: path.basename(resolved.themeDir), ...theme },
    spec,
    seed
  }
}

const cell = (v) =>
  String(v ?? '-')
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/g, ' ')
const table = (head, rows) =>
  rows.length
    ? [head, head.map(() => '---'), ...rows].map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')
    : '_none_'
const yes = (b) => (b ? 'yes' : 'no')

function renderMarkdown(inv) {
  const t = inv.theme
  const p = t.presets
  const ownCol = t.overlay ? ['Own'] : []
  const ownVal = (x) => (t.overlay ? [yes(x.own)] : [])
  const lines = [
    '# Generated source inventory',
    '',
    `Generated by generate-docs.mjs of the tracy-wordpress-theme skill from the files of theme \`${t.slug}\`. Edit sources, not this file. Read ../../AGENTS.md first.`,
    '',
    inv.scope,
    '',
    '## Theme',
    '',
    table(['Header', 'Value'], Object.entries(t.header)),
    '',
    `theme.json version ${t.themeJson.version}; ${t.fileCount} files fingerprinted` +
      (t.overlay
        ? `; ${t.overlay.files.length} of them are the \`${t.overlay.dir}\` overlay's own ("Own" below), the rest come from the source theme`
        : '') +
      (p.inspiration ? `; default look is the \`${p.inspiration}\` design system` : '') +
      '.',
    '',
    '## Templates',
    '',
    table(
      ['Template', ...ownCol, 'Parts', 'Patterns', 'Navigation blocks', 'Custom blocks'],
      t.templates.map((x) => [
        x.name,
        ...ownVal(x),
        x.parts.join(', '),
        x.patterns.join(', '),
        x.navigationBlocks,
        x.customBlocks.join(', ')
      ])
    ),
    '',
    'Custom templates (theme.json `customTemplates`):',
    '',
    table(
      ['Name', 'Title', 'Post types'],
      t.themeJson.customTemplates.map((c) => [c.name, c.title, c.postTypes.join(', ')])
    ),
    '',
    '## Template parts',
    '',
    table(
      ['Part', ...ownCol, 'Area', 'Patterns', 'Navigation blocks', 'Custom blocks'],
      t.parts.map((x) => [
        x.name,
        ...ownVal(x),
        t.themeJson.templateParts.find((q) => q.name === x.name)?.area ?? '-',
        x.patterns.join(', '),
        x.navigationBlocks,
        x.customBlocks.join(', ')
      ])
    ),
    '',
    'A `wp_template_part` row of the same name in the database shadows the file.',
    '',
    '## Patterns',
    '',
    `${t.patterns.length} patterns; "Content blocks" counts blocks carrying \`"role":"content"\`, "Names" the distinct \`metadata.name\` values.`,
    '',
    table(
      ['Slug', ...ownCol, 'Title', 'Categories', 'Block types', 'Content blocks', 'Names'],
      t.patterns.map((x) => [
        x.slug,
        ...ownVal(x),
        x.title,
        x.categories.join(', '),
        x.blockTypes.join(', '),
        x.contentBlocks,
        x.namedBlocks
      ])
    ),
    '',
    '## Style variations',
    '',
    table(
      ['Id', 'Title', 'Design system'],
      t.variations.map((v) => [v.id, v.title, v.inspiration])
    ),
    '',
    '## Presets (theme.json)',
    '',
    `- Palette (${p.palette.length}): ${p.palette.map((c) => `\`${c.slug}\``).join(', ') || '-'}`,
    `- Font families (${p.fontFamilies.length}): ${p.fontFamilies.map((c) => `\`${c.slug}\` ${c.name}`).join(', ') || '-'}`,
    `- Font sizes (${p.fontSizes.length}): ${p.fontSizes.map((c) => `\`${c}\``).join(', ') || '-'}`,
    `- Spacing sizes (${p.spacingSizes.length}): ${p.spacingSizes.map((c) => `\`${c}\``).join(', ') || '-'}`,
    `- Layout: contentSize ${p.layout.contentSize ?? '-'}, wideSize ${p.layout.wideSize ?? '-'}`,
    `- \`settings.custom\` keys: ${p.customKeys.map((c) => `\`${c}\``).join(', ') || '-'}`,
    `- \`styles.css\`: ${p.stylesCss ? `${p.stylesCss} characters (dark-mode overrides live here)` : 'none'}`,
    '',
    '## Blocks',
    '',
    table(
      ['Block', 'Title', 'Version', 'Attributes', 'Render', 'Directory'],
      t.blocks.map((b) => [b.name, b.title, b.version, b.attributes.join(', '), b.render, b.dir])
    ),
    '',
    '## Enqueued assets',
    '',
    table(
      ['Handle', 'Kind', 'Path', 'Enqueued in'],
      t.enqueued.map((e) => [e.handle, e.kind, e.path, e.file])
    ),
    '',
    '## Options read',
    '',
    t.optionsRead.length ? t.optionsRead.map((o) => `- \`${o}\``).join('\n') : '_none_',
    '',
    '## Hooks',
    '',
    table(
      ['Hook', 'Kind', 'File'],
      t.hooks.map((h) => [h.hook, h.kind, h.file])
    ),
    ''
  ]
  if (inv.spec) {
    const s = inv.spec
    lines.push(
      '## Spec-pack',
      '',
      `From \`${s.dir}\`: ${s.routes.length} routes in page-map.json (${s.gaps} gaps recorded), ${s.menus.length} menus, ${s.redirects} redirect rules.`,
      '',
      'Routes by template view:',
      '',
      table(['View', 'Routes'], Object.entries(s.routesByView)),
      '',
      table(
        ['Menu slug', 'Title', 'Items (tree)'],
        s.menus.map((m) => [m.slug, m.title, m.items])
      ),
      '',
      table(
        ['Route', 'View', 'Title'],
        s.routes.map((r) => [r.path, r.view, r.title])
      ),
      ''
    )
  }
  if (inv.seed) {
    const d = inv.seed
    lines.push(
      '## Seed report — at seed time, not live',
      '',
      `From \`${d.file}\` (run started ${d.startedAt ?? '-'}). Totals are what the seeder found or wrote; the live site may differ.`,
      '',
      table(
        ['Kind', 'Total', 'Created', 'Updated', 'Skipped (unchanged)'],
        Object.entries(d.counts).map(([k, c]) => [k, c.total, c.created, c.updated, c.skipped])
      ),
      '',
      `- Navigation posts (\`wp_navigation\`, by slug): ${d.navigation.map((n) => `\`${n}\``).join(', ') || '-'}`,
      `- Template part overrides (\`wp_template_part\`, by slug): ${d.templateParts.map((n) => `\`${n}\``).join(', ') || '-'}`,
      `- Redirect rules written: ${d.redirects}`,
      `- Sections placed: ${d.sections.total} on ${d.sections.pages} pages — ${
        Object.entries(d.sections.byKind)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ') || '-'
      }`,
      `- Routes checked after seeding: ${d.routes.ok}/${d.routes.checked} as expected`,
      `- Media: ${d.media ? `${d.media.files} files, ${d.media.imported} imported this run` : '-'}`,
      '',
      'Sections by pattern:',
      '',
      table(['Pattern', 'Placed'], Object.entries(d.sections.byPattern)),
      '',
      'Seeder notes:',
      '',
      d.notes.length ? d.notes.map((n) => `- ${n}`).join('\n') : '_none_',
      ''
    )
  }
  lines.push(
    '## Drift detection',
    '',
    'inventory.json carries a sha256 of every theme file (docs excluded) and of the spec and seed inputs. `generate-docs.mjs --check` fails when they no longer match; that proves the inventory is current, not that the authored guidance is true.',
    ''
  )
  return lines.join('\n')
}

function outputsFor(o) {
  const inv = buildInventory(o)
  return {
    inventory: inv,
    files: { 'inventory.json': `${JSON.stringify(inv, null, 2)}\n`, 'inventory.md': renderMarkdown(inv) }
  }
}


const PHP_Engine = phpParser.Engine ?? phpParser
const CATEGORY_FN = 'register_block_pattern_category'
/** PHP function names are case-insensitive and may be fully qualified. */
const phpFn = (name) => String(name).replace(/^\\/, '').toLowerCase()
const TRANSLATE_FNS = new Set(['__', '_x', 'esc_html__', 'esc_attr__', 'esc_html_x', 'esc_attr_x'])

/** Text of a regular file, or null when it is absent; a link, FIFO or other special file throws. */
function readRegular(file) {
  let st
  try {
    st = lstatSync(file)
  } catch {
    return null
  }
  if (!st.isFile()) throw new Error('not a regular file')
  return readFileSync(file, 'utf8')
}

/** Entries under `rel` (the theme root when empty) that are neither a regular file nor a directory (links, FIFOs); `walk` skips them. */
function unreadableEntries(dir, rel) {
  const abs = path.join(dir, rel)
  if (!existsSync(abs)) return []
  const out = []
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...unreadableEntries(dir, next))
    else if (!entry.isFile()) out.push(next)
  }
  return out
}

/** The static label of each `register_block_pattern_category()` call in one PHP source; `label: null` when not static. */
function categoryLabels(source) {
  const ast = new PHP_Engine({
    parser: { extractDoc: false, suppressErrors: false },
    ast: { withPositions: false }
  }).parseCode(source)
  const found = []
  const staticString = (n) => {
    if (n?.kind === 'string' && typeof n.value === 'string') return n.value
    if (n?.kind === 'call' && n.what?.kind === 'name' && TRANSLATE_FNS.has(phpFn(n.what.name)))
      return staticString(n.arguments?.[0])
    return null
  }
  const visit = (n) => {
    if (Array.isArray(n)) return n.forEach(visit)
    if (!n || typeof n !== 'object') return
    // The function name as a string (call_user_func, a variable callee) registers a category nobody can read.
    if (n.kind === 'string' && typeof n.value === 'string' && phpFn(n.value) === CATEGORY_FN) found.push({ label: null })
    if (n.kind === 'call' && n.what?.kind === 'name' && phpFn(n.what.name) === CATEGORY_FN) {
      const arr = n.arguments?.[1]
      const item =
        arr?.kind === 'array' ? arr.items.find((i) => (i.key ? staticString(i.key) === 'label' : false)) : null
      found.push({ label: item ? staticString(item.value) : null })
    }
    for (const k of Object.keys(n)) if (k !== 'loc') visit(n[k])
  }
  visit(ast.children)
  return found
}

/**
 * Naming rule for a `wp-ja-*` theme: Theme Name, readme.txt title and pattern category labels start
 * with "WP ", never "JA ". Other slugs are not touched.
 */
function checkThemeName(resolved) {
  if (!resolved.slug.startsWith('wp-ja-')) return []
  const errors = []
  const { themeDir } = resolved
  const wpOf = (name) => (name.startsWith('JA ') ? `WP ${name.slice(3)}` : null)
  let styleName = null
  try {
    const css = readRegular(path.join(themeDir, 'style.css'))
    styleName = css === null ? null : (parseHeader(css, ['Theme Name'])['Theme Name'] ?? null)
    if (!styleName?.startsWith('WP '))
      errors.push(
        `theme name: style.css Theme Name is ${JSON.stringify(styleName ?? '')}, expected it to start with "WP "` +
          (wpOf(styleName ?? '') ? ` (${JSON.stringify(wpOf(styleName))})` : '')
      )
  } catch {
    errors.push('theme name: style.css is not a regular file, cannot check Theme Name')
  }
  const wpName = styleName?.startsWith('WP ') ? styleName : (wpOf(styleName ?? '') ?? 'WP <Name>')
  try {
    const readme = readRegular(path.join(themeDir, 'readme.txt'))
    if (readme === null) errors.push('theme name: readme.txt is missing, cannot check its title')
    else {
      const title = /^\s*===\s*(.*?)\s*===\s*$/m.exec(readme)?.[1]
      if (title === undefined) errors.push('theme name: readme.txt has no "=== Name ===" title line')
      else if (title.startsWith('JA '))
        errors.push(`theme name: readme.txt title is "=== ${title} ===", expected "=== ${wpName} ==="`)
    }
  } catch {
    errors.push('theme name: readme.txt is not a regular file, cannot check its title')
  }
  // Any PHP file of the theme can register a category (functions.php, inc/, includes/, patterns/).
  const phpFiles = walk(themeDir).filter((f) => /\.(php|phtml)$/i.test(f))
  for (const rel of unreadableEntries(themeDir, ''))
    errors.push(`theme name: ${rel} is a link or special file, cannot check pattern category labels`)
  for (const rel of phpFiles) {
    let src
    try {
      src = readRegular(path.join(themeDir, rel))
    } catch {
      errors.push(`theme name: ${rel} is not a regular file, cannot check pattern category labels`)
      continue
    }
    if (src === null || !src.toLowerCase().includes(CATEGORY_FN)) continue
    let labels
    try {
      labels = categoryLabels(src)
    } catch {
      errors.push(`theme name: ${rel} cannot be parsed, pattern category labels were not checked`)
      continue
    }
    for (const { label } of labels) {
      if (label === null)
        errors.push(`theme name: ${rel} registers a pattern category whose label is not a static string, cannot check it`)
      else if (label.startsWith('JA '))
        errors.push(
          `theme name: ${rel} pattern category label is ${JSON.stringify(label)}, expected ${JSON.stringify(`WP ${label.slice(3)}`)}`
        )
    }
  }
  return errors
}

/** What --check reports; empty when the docs are complete and the inventory is current. */
export function checkDocs(o) {
  const resolved = resolveTheme(o.theme)
  const outDir = o.out ? path.resolve(o.out) : path.join(resolved.docsDir, 'docs', 'generated')
  const errors = [...checkThemeName(resolved)]
  // A link or special file named by the rule must not reach the inventory read below (a FIFO would block it).
  if (errors.some((e) => e.startsWith('theme name: style.css is not a regular file'))) return errors
  for (const rel of ['AGENTS.md', ...DOC_NAMES.map((n) => `docs/${n}.md`)]) {
    const p = path.join(resolved.docsDir, rel)
    if (!existsSync(p)) {
      errors.push(`missing authored document: ${rel}`)
      continue
    }
    const body = readFileSync(p, 'utf8')
    if (!body.trim()) errors.push(`empty authored document: ${rel}`)
    else if (body.includes(MARKER)) {
      const n = body.split(MARKER).length - 1
      errors.push(`unfinished authored document: ${rel} (${n} ${MARKER} marker${n === 1 ? '' : 's'} left)`)
    }
  }
  const { files } = outputsFor(o)
  for (const [name, expected] of Object.entries(files)) {
    const p = path.join(outDir, name)
    if (!existsSync(p)) errors.push(`missing generated file: ${path.relative(resolved.docsDir, p) || p}`)
    else if (readFileSync(p, 'utf8') !== expected)
      errors.push(`stale generated file: ${path.relative(resolved.docsDir, p) || p} — rerun without --check`)
  }
  return errors
}

function main(argv) {
  const o = parseArgs(argv)
  if (o.help) {
    console.log(
      'node scripts/generate-docs.mjs --theme <dir> [--spec <dir>] [--seed-report <json>] [--out <dir>] [--check]'
    )
    return 0
  }
  if (o.check) {
    const errors = checkDocs(o)
    if (errors.length) {
      console.error(errors.join('\n'))
      return 1
    }
    console.log(
      'Package documentation gate passed: authored files complete, generated inventory current (files only; no site was read).'
    )
    return 0
  }
  const resolved = resolveTheme(o.theme)
  const outDir = o.out ? path.resolve(o.out) : path.join(resolved.docsDir, 'docs', 'generated')
  const { inventory, files } = outputsFor(o)
  mkdirSync(outDir, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(outDir, name), body)
  const t = inventory.theme
  console.log(
    `Wrote ${path.join(outDir, 'inventory.json')} and inventory.md from ${resolved.themeDir}` +
      (resolved.overlayDir ? ` (overlay ${resolved.overlayDir})` : '') +
      `: ${t.templates.length} templates, ${t.parts.length} parts, ${t.patterns.length} patterns, ${t.variations.length} variations, ${t.blocks.length} blocks, ${t.enqueued.length} enqueued assets` +
      (inventory.spec ? `, spec ${inventory.spec.routes.length} routes` : '') +
      (inventory.seed ? `, seed report ${inventory.seed.file}` : '') +
      '. Authored docs untouched; no checks run.'
  )
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`generate-docs: ${e.message}`)
      process.exitCode = 2
    } else throw e
  }
}
