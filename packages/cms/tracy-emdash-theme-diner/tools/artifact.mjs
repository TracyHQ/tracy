#!/usr/bin/env node
// Write artifact.json: the local contract a later integration reads (template id/version, CMS and
// runtime pins, locales, capabilities, env NAMES, entrypoints, checksums of the shipped inputs).
//   node tools/artifact.mjs [out=artifact.json]
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
// Identity and locales come from template.config.json (the same file the tools consume), never
// from the package name: the package is a repo convention, the template id is the product.
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const cfg = readFileSync('astro.config.mjs', 'utf8')
// A template that lists its locales as data writes `locales: templateConfig.locales` here, and the
// literal-array read below sees nothing — it then reported ["en"] against a four-language template
// (measured 20/09/2026 on tracy-business) and refused to write the artifact at all. Honour that
// spelling: the config IS template.config.json's list in that case, by construction.
const literalLocales = cfg.match(/locales:\s*(\[[^\]]*\])/)
const astroLocales = literalLocales
  ? JSON.parse(literalLocales[1].replace(/'/g, '"'))
  : /locales:\s*templateConfig\.locales\b/.test(cfg)
    ? (config.locales ?? ['en'])
    : ['en']
const locales = config.locales ?? astroLocales
if (JSON.stringify([...astroLocales].sort()) !== JSON.stringify([...locales].sort())) {
  console.error(
    `astro.config.mjs locales ${JSON.stringify(astroLocales)} != template.config.json ${JSON.stringify(locales)}`
  )
  process.exit(1)
}
const defaultLocale = config.defaultLocale ?? (cfg.match(/defaultLocale:\s*"([a-z-]+)"/) ?? [null, 'en'])[1]
const sha = (p) => `sha256:${createHash('sha256').update(readFileSync(p)).digest('hex')}`
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = path.join(d, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const checksums = {}
for (const f of ['AGENTS.md', ...walk('docs').sort()]) checksums[f] = sha(f)
for (const f of [
  'template.config.json',
  'seed/seed.json',
  'seed/media-map.json',
  'seed/field-map.json',
  'pnpm-lock.yaml',
  config.forms?.file ?? 'tools/forms.json'
])
  checksums[f] = sha(f)
const mediaFiles = walk('seed/media').sort()
const media = createHash('sha256')
for (const f of mediaFiles) media.update(readFileSync(f))
checksums['seed/media/*'] = `sha256:${media.digest('hex')} (${mediaFiles.length} files)`
const env = [...new Set([...readFileSync('.env.example', 'utf8').matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]))]
const out = {
  templateId: config.id,
  label: config.label,
  version: config.version ?? pkg.version,
  package: { name: pkg.name, version: pkg.version },
  demoContent: config.site?.title ?? null,
  generatedAt: new Date().toISOString(),
  cms: { name: 'emdash', version: pkg.dependencies.emdash },
  runtime: {
    node: pkg.engines?.node ?? '>=22.16',
    astro: pkg.dependencies.astro,
    adapter: '@astrojs/node standalone',
    database: 'sqlite (data/data.db)',
    storage: 'local (uploads/)'
  },
  locales: { default: defaultLocale, all: locales, prefixed: locales.filter((l) => l !== defaultLocale) },
  capabilities: ['forms', 'smtp', 'audit-log', 'search', 'i18n', 'seo', 'media'],
  plugins: Object.fromEntries(Object.entries(pkg.dependencies).filter(([k]) => /plugin|smtp/.test(k))),
  env,
  entrypoints: {
    install: 'pnpm install --frozen-lockfile',
    build: 'pnpm build',
    start: 'node dist/server/entry.mjs',
    dev: 'pnpm dev',
    bootstrap: 'tools/bootstrap-site.sh <origin> <data-dir>',
    seed: 'node tools/seed-apply.mjs <status|schema|content|media|forms|all>',
    backup: 'tools/backup.sh',
    restore: 'tools/restore.sh <archive>',
    cleanInstall: 'tools/clean-install.sh <dir> <port>',
    smtp: 'node tools/configure-smtp.mjs'
  },
  seed: {
    file: 'seed/seed.json',
    mediaMap: 'seed/media-map.json',
    forms: config.forms?.file ?? 'tools/forms.json',
    config: 'template.config.json'
  },
  checksums
}
writeFileSync(process.argv[2] ?? 'artifact.json', JSON.stringify(out, null, '\t') + '\n')
console.log(
  JSON.stringify({
    templateId: out.templateId,
    label: out.label,
    version: out.version,
    checksums: Object.keys(checksums).length,
    env
  })
)
