#!/usr/bin/env node
// Run in a template package: node tools/generate-docs.mjs [--check]
// Only docs/generated/inventory.{json,md} are generator-owned. No CMS/network access.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const names = [
  'architecture',
  'install',
  'content-model',
  'content-api',
  'design-system',
  'languages',
  'content-rules',
  'checks-and-recovery'
]
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(
    'node tools/generate-docs.mjs [--check]\nGenerate source inventory; --check checks authored docs and exact generated output without writing.'
  )
  process.exit(0)
}
if (args.some((a) => a !== '--check')) throw new Error('Unknown argument; use --help')
const check = args.includes('--check')
const root = process.cwd()
const safe = (rel) => {
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error(`Unsafe input path: ${rel}`)
  let p = root
  for (const part of rel.split('/')) {
    p = path.join(p, part)
    if (
      existsSync(p) ||
      (() => {
        try {
          return lstatSync(p).isSymbolicLink()
        } catch {
          return false
        }
      })()
    ) {
      if (lstatSync(p).isSymbolicLink()) throw new Error(`Symlink not allowed: ${rel}`)
    }
  }
  return p
}
const hashes = {}
const read = (rel) => {
  const bytes = readFileSync(safe(rel))
  hashes[rel] = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  return bytes.toString('utf8')
}
const json = (rel) => JSON.parse(read(rel))
const pkg = json('package.json')
const config = json('template.config.json')
const seed = json('seed/seed.json')
read('pnpm-lock.yaml')
read('astro.config.mjs')
read('tools/generate-docs.mjs')
if (!Array.isArray(seed.collections) || !seed.content || !Array.isArray(config.locales)) {
  throw new Error('Expected seed.collections array, seed.content object and config.locales array')
}
const sourceFiles = []
const walk = (dir) => {
  for (const name of readdirSync(safe(dir)).sort()) {
    const rel = `${dir}/${name}`
    const stat = lstatSync(safe(rel))
    if (stat.isDirectory()) walk(rel)
    else if (stat.isFile() && /\.(astro|[cm]?[jt]sx?|css|scss|json)$/.test(name)) {
      read(rel)
      sourceFiles.push(rel)
    }
  }
}
walk('src')
for (const rel of ['seed/field-map.json', 'seed/media-map.json']) if (existsSync(safe(rel))) read(rel)
// Hash forms only; never copy notification configuration or secret values into docs.
if (config.forms?.file) read(config.forms.file)
const text = (v) => (typeof v === 'string' ? v : null)
const fields = (list) =>
  (Array.isArray(list) ? list : []).map((f) => ({
    slug: text(f.slug),
    label: text(f.label),
    type: text(f.type),
    required: f.required === true,
    ...(Array.isArray(f.fields) ? { fields: fields(f.fields) } : {})
  }))
const countItems = (items) =>
  (Array.isArray(items) ? items : []).reduce((n, i) => n + 1 + countItems(i.children ?? i.items), 0)
const inventory = {
  format: 1,
  scope: 'Source baseline only. No live IDs, credentials, entry bodies or runtime verification.',
  template: { id: text(config.id), label: text(config.label), version: text(config.version ?? pkg.version) },
  locales: { default: text(config.defaultLocale), all: config.locales.map(text) },
  collections: seed.collections.map((c) => ({
    slug: text(c.slug),
    label: text(c.label),
    routable: c.routable === true,
    fields: fields(c.fields),
    seedEntries: Array.isArray(seed.content[c.slug]) ? seed.content[c.slug].length : 0
  })),
  menus: (seed.menus ?? []).map((m) => ({
    name: text(m.name),
    label: text(m.label),
    locale: text(m.locale),
    items: countItems(m.items)
  })),
  taxonomies: (seed.taxonomies ?? []).map((t) => ({
    name: text(t.name),
    locale: text(t.locale),
    collections: (t.collections ?? []).map(text),
    terms: (t.terms ?? []).length
  })),
  formBindings: (config.forms?.bindings ?? []).map((b) => ({
    form: text(b.form),
    collection: text(b.collection),
    slug: text(b.slug),
    field: text(b.field)
  })),
  dependencies: Object.fromEntries(
    Object.entries(pkg.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))
  ),
  dependencyNotice:
    'Declared pins only; enabled plugin registration is owned by astro.config.mjs. Native CMS capabilities need not be separate dependencies.',
  routeFiles: sourceFiles.filter((f) => f.startsWith('src/pages/')),
  routeNotice:
    'Route source files only, not expanded URLs. Dynamic/catch-all dispatch and CMS routes require authored guidance and runtime crawl evidence.',
  sourceFiles,
  inputs: Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)))
}
const cell = (v) =>
  String(v ?? '-')
    .replaceAll('|', '\\|')
    .replace(/[\r\n]/g, ' ')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const table = (head, rows) =>
  [head, head.map(() => '---'), ...rows].map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')
const flattenFields = (list, prefix = '') =>
  list.flatMap((f) => {
    const slug = `${prefix}${f.slug ?? '?'}`
    return [[slug, f.type, f.required ? 'yes' : 'no', f.label], ...flattenFields(f.fields ?? [], `${slug}.`)]
  })
const md = [
  '# Generated source inventory',
  '',
  'Generated by tools/generate-docs.mjs. Edit sources, not this file.',
  'Read ../../AGENTS.md and ../architecture.md for operating instructions.',
  '',
  inventory.scope,
  '',
  `Template: ${cell(config.label)} (${cell(config.id)}). Default locale: ${cell(config.defaultLocale)}. Locales: ${config.locales.map(cell).join(', ')}.`,
  '',
  '## Collections',
  '',
  table(
    ['Collection', 'Label', 'Baseline entries', 'Routable'],
    inventory.collections.map((c) => [c.slug, c.label, c.seedEntries, c.routable])
  ),
  '',
  ...inventory.collections.flatMap((c) => [
    `### ${cell(c.slug)}`,
    '',
    table(['Field', 'Type', 'Required', 'Label'], flattenFields(c.fields)),
    ''
  ]),
  '## Menus',
  '',
  table(
    ['Name', 'Locale', 'Items including children'],
    inventory.menus.map((m) => [m.name, m.locale, m.items])
  ),
  '',
  '## Taxonomies',
  '',
  table(
    ['Name', 'Locale', 'Collections', 'Baseline terms'],
    inventory.taxonomies.map((t) => [t.name, t.locale, t.collections.join(', '), t.terms])
  ),
  '',
  '## Form bindings',
  '',
  table(
    ['Form pattern', 'Collection', 'Slug', 'Field'],
    inventory.formBindings.map((b) => [b.form, b.collection, b.slug, b.field])
  ),
  '',
  '## Dependencies',
  '',
  inventory.dependencyNotice,
  '',
  table(['Dependency', 'Declared version'], Object.entries(inventory.dependencies)),
  '',
  '## Route sources',
  '',
  inventory.routeNotice,
  '',
  ...inventory.routeFiles.map((f) => `- ${cell(f)}`),
  '',
  '## Drift detection',
  '',
  'inventory.json contains deterministic source fingerprints. These do not prove runtime behavior or correctness of authored guidance.',
  ''
].join('\n')
const outputs = {
  'docs/generated/inventory.json': `${JSON.stringify(inventory, null, 2)}\n`,
  'docs/generated/inventory.md': md
}
if (check) {
  const errors = []
  for (const rel of ['AGENTS.md', ...names.map((n) => `docs/${n}.md`)]) {
    const p = safe(rel)
    if (!existsSync(p)) {
      errors.push(`Missing authored document: ${rel}`)
      continue
    }
    const body = readFileSync(p, 'utf8')
    if (!body.trim() || body.includes('DOCS_REQUIRED:')) errors.push(`Unfinished authored document: ${rel}`)
  }
  for (const [rel, expected] of Object.entries(outputs)) {
    const p = safe(rel)
    if (!existsSync(p) || readFileSync(p, 'utf8') !== expected) errors.push(`Missing or stale: ${rel}`)
  }
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else
    console.log('Package documentation gate passed (source inventory and authored-file completeness only).')
} else {
  for (const rel of Object.keys(outputs)) safe(rel)
  mkdirSync(safe('docs/generated'), { recursive: true })
  for (const [rel, body] of Object.entries(outputs)) writeFileSync(safe(rel), body)
  console.log(
    'Generated docs/generated/inventory.json and inventory.md; authored guidance unchanged. No checks run.'
  )
}
