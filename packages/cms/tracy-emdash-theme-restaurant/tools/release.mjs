#!/usr/bin/env node
// Assemble a quickstart release from a packed artifact and a gate-verified clean site, in the
// shape the Joomla/WordPress quickstarts use on JoomlArt-Products/joomlart-products (schema
// tracy-quickstart/v1): one zip anyone can build from, one state snapshot that skips the seed,
// a manifest with hashes, gate results and receipts, SHA256SUMS and the release notes.
//
//   node tools/release.mjs --artifact <packed-dir> --site <clean-site-dir> --report <qa-run>/report.json
//        --out <new-dir> [--version 1.0.0] [--tag tracy-business/emdash-0.x] [--repo owner/name]
//
// The artifact is the output of `distribution.mjs pack` (already an allowlist, already verified by
// qa.mjs against the same contract). The site is the clean install the gate ran against: its
// data/data.db and uploads/ become the snapshot, minus everything that belongs to that one
// machine — the agent user and its token, sign-in state, 404 and audit logs, the local site URL.
// A restored site mints its own agent token (tools/mint-admin.cjs), like the Joomla quickstart
// generates its Cowork token after restore. Nothing here publishes: the last line prints the
// `gh release create --draft` command for a person to run.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { verifyDistribution } from './distribution.mjs'
import { personalizeProblems, questionProblems } from './personalize-gate.mjs'
import { contentApiProblems } from './content-api-gate.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const fileHash = (p) => sha256(readFileSync(p))
const fail = (m) => {
  console.error(`!! ${m}`)
  process.exit(1)
}

// ── tracy_site_pages.json: the pages a customer may keep or hide ─────────────────────────────
// Tracy's "Pages" question lists THIS release's own pages: the level-1 items of the primary menu
// in seed/site-model.json (else the first menu), each resolved to the page record its path serves.
// The id is that record's slug (Tracy's engine unpublishes by it); the front page is always listed,
// marked home, and never hidden. A heading without a page is skipped and said. An id that is not
// exactly one page record stops the release here, by name. Same rules as tracy-dev's
// lib/site-pages.mjs, which writes this file for WordPress, Joomla and releases already published.
const sitePagesName = 'tracy_site_pages.json'
/**
 * @param {string} root a packed artifact or a template checkout
 * @returns {{ pages: { id: string, label: string, home?: true }[], warnings: string[] }}
 */
function sitePagesFor(root) {
  const file = path.join(root, 'seed', 'site-model.json')
  if (!existsSync(file)) fail(`${sitePagesName}: ${file} is missing`)
  const model = JSON.parse(readFileSync(file, 'utf8'))
  const locale = model.locales?.default ?? 'en'
  const rows = (model.records ?? []).filter(
    (r) => r.type !== 'site' && (r.locale ?? locale) === locale && r.status !== 'draft'
  )
  const perType = {}
  for (const r of rows) perType[r.type] = (perType[r.type] ?? 0) + 1
  // a page record: a `pages` row, or the one record of a singleton type (about, services_page…)
  const records = rows.filter((r) => r.type === 'pages' || r.type === 'page' || perType[r.type] === 1)
  const home = records.find((r) => r.type === 'home') ?? records.find((r) => r.slug === 'home')
  if (!home) fail(`${sitePagesName}: seed/site-model.json has no home page record`)
  const menu =
    model.menus?.find((m) => m.name === 'primary') ??
    model.menus?.find((m) => /main/.test(m.name)) ??
    model.menus?.[0]
  if (!menu) fail(`${sitePagesName}: seed/site-model.json has no menu`)
  const warnings = menu.name === 'primary' ? [] : [`no "primary" menu: used "${menu.name}"`]
  const labelOf = (item) => item.label?.[locale] ?? Object.values(item.label ?? {})[0] ?? ''
  const leaves = (item) => (item.children ?? []).flatMap((c) => (c.children?.length ? leaves(c) : [c]))
  const recordsAt = (p) => {
    if (p === '/') return [home]
    const seg = p
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .split('/')
      .pop()
    const tests = [
      (r) => r.slug === seg,
      (r) => r.type === seg,
      (r) => r.slug === `${seg}_page` || r.type === `${seg}_page`
    ]
    for (const test of tests) {
      const hits = records.filter(test)
      if (hits.length > 0) return hits
    }
    return []
  }
  const pages = []
  let homeLabel = null
  for (const item of menu.items ?? []) {
    const label = labelOf(item)
    if (!item.path) {
      if (leaves(item).some((c) => c.path === '/')) homeLabel ??= label
      const kids = leaves(item).map(labelOf).join(', ') || 'none'
      warnings.push(`level-1 "${label}" is a heading, not a page (children: ${kids}): skipped`)
      continue
    }
    const hits = recordsAt(item.path)
    if (hits.length !== 1) {
      warnings.push(`level-1 "${label}" (${item.path}) matches ${hits.length} page records: skipped`)
      continue
    }
    if (pages.some((p) => p.id === hits[0].slug)) {
      warnings.push(`"${label}" links "${hits[0].slug}" again: kept the first`)
      continue
    }
    pages.push({ id: hits[0].slug, label })
  }
  const listed = pages.find((p) => p.id === home.slug)
  if (listed) listed.home = true
  else {
    warnings.push(`the menu does not link the front page "${home.slug}": added it first`)
    pages.unshift({ id: home.slug, label: homeLabel ?? home.values?.title ?? 'Home', home: true })
  }
  // what Tracy holds the file to: one home, unique ids, a label each, every id one page record
  const problems = []
  const seen = new Set()
  for (const p of pages) {
    if (!String(p.label).trim()) problems.push(`"${p.id}" has no label`)
    if (seen.has(p.id)) problems.push(`"${p.id}" appears twice`)
    seen.add(p.id)
    const n = records.filter((r) => r.slug === p.id).length
    if (n !== 1) problems.push(`id "${p.id}" (${p.label}) matches ${n} page records`)
  }
  if (pages.filter((p) => p.home).length !== 1) problems.push('exactly one page must be home')
  if (problems.length > 0) fail(`${sitePagesName} would be refused:\n  - ${problems.join('\n  - ')}`)
  return { pages, warnings }
}
// `--site-pages <dir>`: print the file a release of that artifact (or checkout) carries, and stop.
if (args.includes('--site-pages')) {
  const { pages, warnings } = sitePagesFor(path.resolve(opt('--site-pages')))
  for (const w of warnings) console.error(`warning: ${w}`)
  console.log(JSON.stringify({ pages }, null, 2))
  process.exit(0)
}

const artifact = path.resolve(opt('--artifact') ?? fail('--artifact <packed-dir> required'))
const site = path.resolve(opt('--site') ?? fail('--site <clean-site-dir> required'))
const reportPath = path.resolve(opt('--report') ?? fail('--report <qa-run>/report.json required'))
const out = path.resolve(opt('--out') ?? fail('--out <new-dir> required'))
if (existsSync(out)) fail(`${out} exists; the release directory must be new`)
// Read before the slow part (scrub, hashes), so a menu Tracy would refuse costs seconds.
const sitePages = sitePagesFor(artifact)
for (const w of sitePages.warnings) console.error(`warning: ${sitePagesName}: ${w}`)

// ── identity: everything comes from the shipped bytes, never from this checkout ─────────────
const tcfg = JSON.parse(readFileSync(path.join(artifact, 'template.config.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(path.join(artifact, 'package.json'), 'utf8'))
const dist = JSON.parse(readFileSync(path.join(artifact, 'distribution.json'), 'utf8'))
const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const product = tcfg.id
const version = opt('--version', tcfg.version)
// 🔒 ONE VERSION. The release tag's version and the template's own (template.config.json, which
// artifact.json, the Dockerfile label and the `check` stage all read) used to be allowed to differ:
// Business 1.3.0 shipped a template that called itself 1.0.0, so the Build card and the image
// label named a release that never existed (measured 25/09/2026). The template's version is bumped
// BEFORE pack — the artifact hash is measured over it — and the tag simply repeats it.
if (version !== tcfg.version)
  fail(
    `--version ${version} != template.config.json version ${tcfg.version}: bump the template (package.json, template.config.json, Dockerfile label) and pack again`
  )
const cmsVersion = pkg.dependencies?.emdash ?? fail('artifact package.json pins no emdash version')
const line = `emdash-${cmsVersion.split('.')[0]}.x`
const tag = opt('--tag', `${product}/${line}`)
const repo = opt('--repo', 'JoomlArt-Products/joomlart-products')
// Asset names carry the CMS the way the Joomla ones carry `j6`: tracy-business-emdash-quickstart-1.0.0.zip
const slug = `${product}-emdash`

// The artifact must still verify: a hand-edited copy is not the thing the gate measured.
const v = verifyDistribution(artifact)
if (v.errors?.length) fail(`artifact does not verify: ${v.errors.join('; ')}`)
// The fleet turns this zip into a running site with `docker build` on the unpacked directory. A
// package the contract let through without these (an older kit, a hand-written allowlist) packs,
// uploads and dies on the host at "app.new/Dockerfile: no such file" — measured 16/09/2026 with
// tracy-saas. Refuse here, where the fix is one commit away, not on a customer's provision.
for (const needed of ['Dockerfile', 'tools/docker-entrypoint.sh'])
  if (!existsSync(path.join(artifact, needed)))
    fail(
      `the packed template has no ${needed}; the fleet cannot build it (add it and list it in distribution.include/required)`
    )
// 🔒 A TEMPLATE THAT CANNOT PUT THE CUSTOMER'S OWN WORDS IN IS NOT READY TO SHIP, AND IT FAILS
// SILENTLY — the reasons, and what it cost on tracy-saas, are in tools/personalize-gate.mjs.
{
  const problems = personalizeProblems(artifact)
  if (problems.length > 0) fail(problems.join('\n  - '))
}
// 🔒 A TEMPLATE TRACY CANNOT READ, OR WHOSE PAGES NAME NO SOURCE, ALSO SHIPS SILENTLY: the site
// serves and every gate is green, while Tracy's agent edits blind — tools/content-api-gate.mjs.
{
  const problems = contentApiProblems(artifact)
  if (problems.length > 0) fail(problems.join('\n  - '))
}
if (
  report.artifactHash &&
  report.artifactHash !== `sha256:${dist.artifactHash}` &&
  report.artifactHash !== dist.artifactHash
)
  fail(`report artifactHash ${report.artifactHash} is not this artifact (${dist.artifactHash})`)

// ── secrets: refuse before writing anything ──────────────────────────────────────────────────
const walk = (d, base = d) =>
  readdirSync(d).flatMap((n) => {
    const p = path.join(d, n)
    return statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p)]
  })
const DENY_FILES =
  /(^|\/)(\.env(\..*)?|.*\.token|data\.db.*|seed-receipts\.json|node_modules\/|dist\/|evidence\/|uploads\/)/
// A real agent token is ec_pat_ + 43 base64url chars; test fixtures are shorter on purpose.
const DENY_TEXT = [
  /ec_pat_[A-Za-z0-9_-]{40,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/
]
for (const f of walk(artifact)) {
  if (f !== '.env.example' && DENY_FILES.test(f))
    fail(`artifact carries runtime state or a secret file: ${f}`)
  if (/\.(mjs|cjs|js|ts|tsx|astro|json|md|sh|css|yaml|yml|txt)$/.test(f)) {
    const text = readFileSync(path.join(artifact, f), 'latin1')
    for (const re of DENY_TEXT) if (re.test(text)) fail(`secret-shaped string in ${f} (${re})`)
  }
}

// ── state snapshot: copy, scrub, vacuum, then check the scrub held ───────────────────────────
const stage = path.join(out, '_stage')
mkdirSync(path.join(stage, 'data'), { recursive: true })
const dbSrc = path.join(site, 'data', 'data.db')
if (!existsSync(dbSrc)) fail(`no ${dbSrc}; --site must be a site that has run`)
const db = path.join(stage, 'data', 'data.db')
// `.backup` gives a consistent copy even if the site is still serving; a plain cp would not.
execFileSync('sqlite3', [dbSrc, `.backup '${db}'`])
const sql = (q) => execFileSync('sqlite3', [db, q], { encoding: 'utf8' }).trim()
// `users` stays: the agent account (email + role, no credential) is what keeps EmDash's setup
// marked complete — without a user the site reports `needsSetup` and bootstrap would seed twice.
// mint-admin.cjs reuses that user by email and mints a fresh token for it.
const SCRUB = [
  ['_emdash_api_tokens', 'agent token (hash) — re-minted per site'],
  ['auth_tokens', 'sign-in state'],
  ['auth_challenges', 'sign-in state'],
  ['credentials', 'passkeys'],
  ['oauth_accounts', 'linked accounts'],
  ['_emdash_oauth_tokens', 'OAuth state'],
  ['_emdash_oauth_clients', 'OAuth state'],
  ['_emdash_authorization_codes', 'OAuth state'],
  ['_emdash_device_codes', 'OAuth state'],
  ['_emdash_404_log', 'this machine’s traffic'],
  ['_emdash_rate_limits', 'this machine’s traffic'],
  ['_emdash_media_upload_attempts', 'this machine’s traffic'],
  ['audit_logs', 'this machine’s history'],
  // EmDash ≥0.40 site transfer (migration 084): operations, approvals and staged payloads of
  // this machine's transfers, never a new site's.
  ['_emdash_transfer_approvals', 'this machine’s transfers'],
  ['_emdash_transfer_media_blobs', 'this machine’s transfers'],
  ['_emdash_transfer_package_index', 'this machine’s transfers'],
  ['_emdash_transfer_staged_files', 'this machine’s transfers'],
  ['_emdash_transfer_identity_map', 'this machine’s transfers'],
  ['_emdash_transfer_operations', 'this machine’s transfers'],
  ['_emdash_redirect_write_lock', 'this machine’s write lease (cleared; the singleton row stays)']
]
// 🔒 A SINGLETON ROW IS CLEARED, NEVER DELETED. `_emdash_redirect_write_lock` holds exactly one row
// (id 1, put there by migration 081) that every redirect write takes a lease on with an UPDATE ...
// WHERE id = 1. Deleting it left no row to lease, so every redirect create/update/delete on a restored
// site answered REDIRECT_BUSY forever — measured 04/10/2026 on the published Base 0.3.0, Business 1.5.1
// and SaaS 1.2.0 states (EmDash 1.0.1) and again on 1.1.0; the migration never runs again, so nothing puts the row back.
const KEEP_ROW = new Map([
  ['_emdash_redirect_write_lock', "update _emdash_redirect_write_lock set token = '', expires_at = 0"]
])
const scrubbed = {}
for (const [table, why] of SCRUB) {
  const n = Number(sql(`select count(*) from ${table}`))
  if (KEEP_ROW.has(table)) sql(KEEP_ROW.get(table))
  else sql(`delete from ${table}`)
  scrubbed[table] = {
    removed: KEEP_ROW.has(table) ? 0 : n,
    ...(KEEP_ROW.has(table) ? { cleared: n } : {}),
    why
  }
}
const audit = Number(sql(`select count(*) from _plugin_storage where plugin_id='audit-log'`))
sql(`delete from _plugin_storage where plugin_id='audit-log'`)
scrubbed['_plugin_storage:audit-log'] = { removed: audit, why: 'seeding history of this machine' }
// The site URL is the one thing a restore must set itself; leaving the local one behind makes
// absolute links point at a laptop.
sql(`delete from options where name in ('emdash:site_url','system:scheduler:last_completed_at')`)
sql('vacuum')
for (const [table] of SCRUB) {
  if (KEEP_ROW.has(table)) {
    if (sql(`select count(*) from ${table} where token <> '' or expires_at <> 0`) !== '0')
      fail(`scrub failed: ${table} still holds a lease`)
    if (sql(`select count(*) from ${table} where id = 1`) !== '1')
      fail(`scrub failed: ${table} lost its singleton row`)
  } else if (sql(`select count(*) from ${table}`) !== '0') fail(`scrub failed: ${table}`)
}
if (sql(`select count(*) from options where name='emdash:site_url'`) !== '0') fail('scrub failed: site_url')
// Content stays untouched — say how much, so a restore can be checked against the snapshot.
const collections = Object.fromEntries(
  sql(`select name from sqlite_master where type='table' and name like 'ec\\_%' escape '\\' order by name`)
    .split('\n')
    .filter(Boolean)
    .map((t) => [t.slice(3), Number(sql(`select count(*) from ${t}`))])
)
const media = Number(sql('select count(*) from media'))
copyFileSync(path.join(site, 'data', 'seed-receipts.json'), path.join(stage, 'data', 'seed-receipts.json'))
const uploads = walk(path.join(site, 'uploads'))
if (uploads.length !== media) console.warn(`?? ${uploads.length} files in uploads/ vs ${media} media rows`)
mkdirSync(path.join(stage, 'uploads'))
for (const f of uploads) copyFileSync(path.join(site, 'uploads', f), path.join(stage, 'uploads', f))

// ── assets ───────────────────────────────────────────────────────────────────────────────────
const zipName = `${slug}-quickstart-${version}.zip`
const stateName = `${slug}-state-${version}.tar.gz`
execFileSync('zip', ['-q', '-r', '-X', path.join(out, zipName), '.'], { cwd: artifact })
execFileSync('tar', ['-czf', path.join(out, stateName), '-C', stage, 'data', 'uploads'])
rmSync(stage, { recursive: true })
const asset = (name) => {
  const p = path.join(out, name)
  return { file: name, bytes: statSync(p).size, sha256: fileHash(p) }
}
// The state tarball must not carry the token file or a live DB row — list the tar, don't trust the copy.
const tarList = execFileSync('tar', ['-tzf', path.join(out, stateName)], { encoding: 'utf8' })
if (/\.token$/m.test(tarList)) fail('state snapshot lists a token file')

// ── manifest, verification, sums, notes ──────────────────────────────────────────────────────
const gates = Object.fromEntries(Object.entries(report.gates ?? {}).map(([k, g]) => [k, g.status]))
const receipts = Object.fromEntries(
  Object.entries(report.gates ?? {})
    .filter(([, g]) => g.receipt)
    .map(([k, g]) => [k, { reviewer: g.receipt.reviewer, method: g.receipt.method, status: g.status }])
)
const manifest = {
  schemaVersion: 'tracy-quickstart/v1',
  product,
  version,
  release: tag,
  repository: repo,
  cms: { name: 'emdash', version: cmsVersion },
  artifact: zipName,
  ...asset(zipName),
  format:
    'zip of the packed template source (build with pnpm + Docker or node); distribution.json inside carries the per-file checksums',
  defaultTemplate: product,
  templateVersion: tcfg.version,
  license: pkg.license,
  languages: { live: tcfg.locales, default: tcfg.defaultLocale },
  agent: { token: 'minted per site after restore (tools/mint-admin.cjs, tools/bootstrap-site.sh)' },
  template: {
    artifactHash: dist.artifactHash,
    contractHash: dist.contractHash,
    files: Object.keys(dist.checksums).length
  },
  state: {
    ...asset(stateName),
    contents:
      'data/data.db (SQLite, scrubbed; keeps the agent user row without credentials), data/seed-receipts.json, uploads/',
    scrubbed,
    collections,
    media
  },
  gates,
  receipts
}
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(
  path.join(out, 'VERIFICATION.json'),
  JSON.stringify(
    {
      release: tag,
      version,
      report: {
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        origin: report.origin,
        status: report.status,
        node: report.node
      },
      gates: report.gates,
      artifactHash: dist.artifactHash,
      contractHash: dist.contractHash,
      state: { scrubbed, collections, media }
    },
    null,
    2
  ) + '\n'
)
const notes = `## ${tcfg.label} ${version} for EmDash ${cmsVersion}

Tracy quickstart: ${pkg.description}

- EmDash ${cmsVersion} on Astro SSR (Node ${report.node ?? '24'}), Tailwind CSS 4, shadcn/ui; ${tcfg.locales.join('/').toUpperCase()} content, row-per-locale.
- Agent-ready: \`AGENTS.md\` + \`docs/\` ship inside the zip; the admin API token is minted per site (\`tools/mint-admin.cjs\`).
- Verified: ${Object.entries(gates)
  .map(([k, s]) => `${k} ${s}`)
  .join(' · ')} (\`VERIFICATION.json\`).
- License: ${pkg.license} (\`LICENSE\` inside the zip).

### Install

\`\`\`
unzip ${zipName} -d ${slug} && cd ${slug}
tar -xzf ../${stateName}            # optional: skip the seed, start with the demo content in place
docker build -t ${slug}:${version} . && docker run -d -p 4321:4321 -v "$PWD/data:/app/data" -v "$PWD/uploads:/app/uploads" -e EMDASH_SITE_URL=https://your.host ${slug}:${version}
tools/bootstrap-site.sh http://127.0.0.1:4321 ./data   # seeds when the state was not restored; mints the agent token either way
\`\`\`

Without Docker: \`pnpm install --frozen-lockfile && pnpm build && node dist/server/entry.mjs\` (Node ≥ 22.16).

### Files

| File | Bytes | SHA-256 |
|---|---:|---|
| ${zipName} | ${manifest.bytes} | ${manifest.sha256} |
| ${stateName} | ${manifest.state.bytes} | ${manifest.state.sha256} |
`
writeFileSync(path.join(out, 'README.md'), notes)
copyFileSync(path.join(artifact, 'LICENSE'), path.join(out, 'LICENSE'))
// The questionnaire Tracy asks this template's customers (ADR 0017: the release is the source of
// truth). Copied byte for byte out of the package -- the set is authored in seed/questions.json and
// nowhere else -- so the form a customer fills in and the map that consumes it can never be two
// different documents. Parsed first: a set Tracy would refuse must cost a re-release, not a build.
const questionsName = 'tracy_site_question.json'
const questionsRaw = readFileSync(path.join(artifact, 'seed', 'questions.json'), 'utf8')
{
  const problems = questionProblems(questionsRaw)
  if (problems.length > 0) fail(`${questionsName} would be refused:\n  - ${problems.join('\n  - ')}`)
}
writeFileSync(path.join(out, questionsName), questionsRaw)

writeFileSync(path.join(out, sitePagesName), `${JSON.stringify({ pages: sitePages.pages }, null, 2)}\n`)

const sums = [
  'manifest.json',
  'VERIFICATION.json',
  'README.md',
  'LICENSE',
  zipName,
  stateName,
  questionsName,
  sitePagesName
]
writeFileSync(
  path.join(out, 'SHA256SUMS'),
  sums.map((f) => `${fileHash(path.join(out, f))}  ${f}`).join('\n') + '\n'
)

console.log(
  JSON.stringify(
    {
      out,
      tag,
      version,
      cms: cmsVersion,
      artifactHash: dist.artifactHash,
      gates,
      receipts: Object.keys(receipts).length,
      collections,
      media
    },
    null,
    2
  )
)
console.log(
  `\nDraft release (a person runs this; it does not run here):\n  gh release create '${tag}' -R ${repo} --draft --title 'Quickstart: ${tcfg.label} / EmDash ${cmsVersion.split('.').slice(0, 2).join('.')}' --notes-file '${path.join(out, 'README.md')}' ${[...sums, 'SHA256SUMS'].map((f) => `'${path.join(out, f)}'`).join(' ')}`
)
