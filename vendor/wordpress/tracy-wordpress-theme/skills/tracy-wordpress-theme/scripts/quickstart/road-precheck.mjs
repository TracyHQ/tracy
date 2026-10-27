#!/usr/bin/env node
// Road-to-live precheck: ask TCQR (Customize your site) and TDSR (Design system) of the TracyHQ repo what they
// already say about a port, at the pilot instead of after the release. /ops scores a release with the same two
// checkers; a port that fails them has finished all its visual work for nothing (JA Diner, 8 h: TCQR ABOUT-1/2/3,
// TDSR SLOT-1 and a preview nobody measured; JA Restaurant: released with slot ready:false).
//
//   --prereq              the measurement stand image exists (docker image inspect); --build builds it when missing
//   --theme-zip <zip>     assemble a PROVISIONAL release folder from the pilot build and run both checkers on it
//   --release <dir>       or check a folder as it is (release.mjs --out, or `--fetch` of a published tag)
//
// What a provisional folder holds: the theme zip, a tracy_setting.json written here (or the published one of the
// port, --setting-template), and whatever of database / webroot / tracy_site_pages.json you give it (--pack takes the
// two archives of a pack.mjs run). A rule that reads an asset not given reports that on its own line; the missing
// assets are listed under `inputs` so a gap is never read as a pass.
//
// Exit: 0 nothing blocks; 1 something blocks (listed); 2 the check could not run.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, UsageError } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TCQR = 'scripts/template-customization-question-readiness.mjs'
const TDSR = 'scripts/template-design-system-readiness.mjs'
const STAND = 'packages/design/tracy-ds-slot/scripts/stand.mjs'
const IMAGE_TAGS = 'packages/fleet/tracy-fleet-operation/web/IMAGE_TAGS'
const SEVERITY = {
  tcqr: 'apps/tracy-web/src/lib/template-customization-question-readiness/rule-severity.json',
  tdsr: 'apps/tracy-web/src/lib/template-design-system-readiness/rule-severity.json'
}
export const BUILD_COMMAND = 'DEFAULTS_ONLY=1 bash web/build.sh wordpress'
const BUILD_DIR = 'packages/fleet/tracy-fleet-operation'
const ROLE_SCAN = 'packages/design/tracy-ds-slot/scripts/role-scan.mjs'
const SLOT_RULES = new Set(['SLOT-1', 'SLOT-2'])

const SPEC = {
  '--tch': { placeholder: 'dir', help: 'the TracyHQ checkout holding the checkers (default: $TCH_REPO, else the checkout this skill sits in, else the current directory upward)' },
  '--prereq': { value: false, help: 'check that the web-wordpress image the TDSR measure commands use is on this machine' },
  '--build': { value: false, help: `with --prereq: build the image when it is missing (${BUILD_COMMAND}, in ${BUILD_DIR}) instead of only reporting it` },
  '--theme-zip': { placeholder: 'zip', help: 'the built theme zip of the pilot (package.mjs): assembles a provisional release folder' },
  '--release': { placeholder: 'dir', help: 'check this release folder instead of assembling one' },
  '--pack': { placeholder: 'dir', help: 'a pack.mjs output: its *-webroot-*.tar.gz and *-database-*.sql.gz join the provisional folder' },
  '--webroot': { placeholder: 'file', help: 'webroot archive (instead of --pack)' },
  '--database': { placeholder: 'file', help: 'database dump (instead of --pack)' },
  '--roles': { placeholder: 'file', help: 'design-system-roles.json (VARS-1); default: written here by role-scan.mjs of the repo from the theme zip' },
  '--allow-gaps': { value: false, help: 'run without the demo database (TCQR rules that read it then report the gap and block; use only to see the rest)' },
  '--site-pages': { placeholder: 'file', help: 'tracy_site_pages.json (tracy-dev site-pages … --out): REL-2 and PAGE-* read it' },
  '--setting-template': { placeholder: 'file', help: 'a published tracy_setting.json of this port, used instead of writing one' },
  '--label': { placeholder: 'text', help: 'the name a person sees (written into tracy_setting.json; default: the slug)' },
  '--version': { placeholder: 'x.y.z', help: 'version of the pilot build (required with --theme-zip): written into tracy_setting.json and the role scan, and the --pack archives of that version are the ones taken' },
  '--slug': { placeholder: 'ja-name', help: 'product slug, e.g. ja-diner (needed with --theme-zip)' },
  '--tag': { placeholder: 'tag', help: 'release tag the checkers report (default quickstart/<slug>/wp7)' },
  '--stage': { placeholder: 'pilot|release', default: 'pilot', help: 'release: a preview rule still unmeasured also blocks (/ops ds-not-at-probe); pilot lists it as pending' },
  '--online': { value: false, help: 'let TCQR ask Google Fonts (LANG-2); default offline' },
  '--json': { value: false, help: 'print the verdict as JSON' },
  '--keep': { value: false, help: 'keep the provisional folder and print its path' }
}
const USAGE = `usage: road-precheck.mjs --prereq [--build]
   or: road-precheck.mjs --theme-zip <zip> --slug <ja-name> [--pack <dir>|--webroot f --database f] --version <x.y.z> [--site-pages f] [--stage pilot|release]
   or: road-precheck.mjs --release <dir> --tag <tag> [--stage release]`

// ---------------------------------------------------------------- pure pieces
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

/** The checkout holding the checkers: --tch, $TCH_REPO, the checkout this file sits in, then cwd upward. */
export function findRepo(explicit, { env = process.env, cwd = process.cwd(), here = HERE } = {}) {
  const has = (d) => existsSync(path.join(d, TDSR)) && existsSync(path.join(d, TCQR))
  const climb = (d) => {
    for (let cur = path.resolve(d); ; cur = path.dirname(cur)) {
      if (has(cur)) return cur
      if (cur === path.dirname(cur)) return null
    }
  }
  for (const c of [explicit, env.TCH_REPO]) {
    if (c) {
      if (!has(path.resolve(c))) throw new UsageError(`${c} does not hold ${TDSR} and ${TCQR}`)
      return path.resolve(c)
    }
  }
  const found = climb(here) ?? climb(cwd)
  if (!found) throw new UsageError('no TracyHQ checkout found: pass --tch <dir> or set TCH_REPO')
  return found
}

/** The image tag the TDSR measure commands start: `IMAGES.wordpress` of stand.mjs, else the `wordpress=` line of IMAGE_TAGS. */
export function standImage(repo) {
  const stand = path.join(repo, STAND)
  if (existsSync(stand)) {
    const m = /wordpress:\s*'(tracy\/web-wordpress:[^']+)'/.exec(readFileSync(stand, 'utf8'))
    if (m) return m[1]
  }
  const tags = path.join(repo, IMAGE_TAGS)
  if (existsSync(tags)) {
    const m = /^wordpress=(\S+)/m.exec(readFileSync(tags, 'utf8'))
    if (m) return m[1]
  }
  throw new Error(`cannot tell which web-wordpress image the stand uses (${STAND}, ${IMAGE_TAGS})`)
}

/**
 * Is the measurement image here, and if not, build it. `run(cmd, args, opts)` is spawnSync-shaped so a test injects a fake.
 * @returns {{ image: string, present: boolean, built: boolean, ok: boolean, note: string }}
 */
export function checkPrereq(repo, { build = false, run = spawnSync } = {}) {
  const image = standImage(repo)
  const have = () => run('docker', ['image', 'inspect', image], { encoding: 'utf8' })
  const first = have()
  if (first.error) return { image, present: false, built: false, ok: false, note: `docker did not run: ${first.error.message}` }
  if (first.status === 0) return { image, present: true, built: false, ok: true, note: `${image} is on this machine` }
  const how = `${BUILD_COMMAND} (in ${BUILD_DIR})`
  if (!build) return { image, present: false, built: false, ok: false, note: `${image} is missing: build it with ${how} (or rerun with --build); without it the preview and built-site rules cannot be measured` }
  const built = run('bash', ['web/build.sh', 'wordpress'], { cwd: path.join(repo, BUILD_DIR), env: { ...process.env, DEFAULTS_ONLY: '1' }, stdio: 'inherit' })
  const now = built.status === 0 ? have() : null
  const ok = now?.status === 0
  return { image, present: ok, built: ok, ok, note: ok ? `${image} built` : `building ${image} failed (${how}, exit ${built.status})` }
}

/** Severity table of a checker, `rulesFromProbe` merged; a rule it does not name is must-fix. */
export function loadSeverity(repo, which) {
  const doc = JSON.parse(readFileSync(path.join(repo, SEVERITY[which]), 'utf8'))
  const rules = { ...doc.rules, ...Object.assign({}, ...Object.values(doc.rulesFromProbe ?? {})) }
  return { rules, unmeasuredPreview: doc.unmeasuredPreview ?? null }
}

/**
 * Turn one checker report into lines. A line is `blocker` (the gate fails), `warn` (worth-fixing: fix it or write a
 * decision naming the id in DECISIONS.md), or `pending` (not measurable yet at this stage).
 */
export function classify(which, report, severity, stage, { sitePagesMissing = false } = {}) {
  const lines = []
  for (const r of report.results) {
    if (r.status === 'fail' && stage === 'pilot' && sitePagesMissing && /tracy_site_pages\.json/.test(r.message)) {
      // an input the pilot cannot have yet (tracy-dev builds it from the pack): said, not passed, not blocking
      lines.push({ checker: which, id: r.id, level: 'pending', gap: true, owner: r.owner, message: r.message, fix: null })
    } else if (r.status === 'fail' && stage === 'pilot' && r.id === 'SLOT-1' && /not ready/.test(r.message)) {
      // a draft contract is what the pilot can have: `ready: true` comes from flow.mjs on a stand restored from the pack
      lines.push({ checker: which, id: r.id, level: 'pending', gap: true, slot: true, owner: r.owner, message: r.message, fix: r.fix ?? null })
    } else if (r.status === 'fail') {
      const group = SLOT_RULES.has(r.id) ? 'must-fix' : (severity.rules[r.id]?.group ?? 'must-fix')
      lines.push({ checker: which, id: r.id, level: group === 'must-fix' ? 'blocker' : 'warn', owner: r.owner, message: r.message, fix: r.fix ?? null, slot: SLOT_RULES.has(r.id) })
    } else if (r.status === 'unmeasured') {
      const preview = severity.rules[r.id]?.question === 'Preview' && severity.unmeasuredPreview?.group === 'must-fix'
      lines.push({ checker: which, id: r.id, level: stage === 'release' && preview ? 'blocker' : stage === 'release' ? 'warn' : 'pending', unmeasured: true, preview, owner: r.owner, message: r.message, fix: r.fix ?? null })
    }
  }
  return lines
}

/** The verdict of a run. `blocked` = at least one blocker. */
export function verdict(lines) {
  const by = (level) => lines.filter((l) => l.level === level)
  return { blocked: by('blocker').length > 0, blockers: by('blocker'), warnings: by('warn'), pending: by('pending') }
}

/** Write the provisional release folder; returns what it holds and what is missing. */
export function assembleProvisional(dir, o) {
  const slug = o.slug
  const version = o.version
  const copy = (from, name) => {
    copyFileSync(from, path.join(dir, name))
    return name
  }
  // Only this slug's archives of the requested version (pack.mjs names them `<slug>-wp7-<kind>-<version>.<ext>`): a pack
  // dir reused across versions or products holds several.
  const wanted = { webroot: `${slug}-wp7-webroot-${version}.tar.gz`, database: `${slug}-wp7-database-${version}.sql.gz` }
  const pick = (packDir, kind) => {
    if (!packDir || !existsSync(packDir)) return null
    const names = readdirSync(packDir)
    if (names.includes(wanted[kind])) return path.join(packDir, wanted[kind])
    const other = names.filter((n) => new RegExp(`-${kind}-.*\\.(tar|sql)\\.gz$`).test(n))
    if (other.length) throw new UsageError(`${packDir} has no ${kind} archive ${wanted[kind]} (it holds: ${other.join(', ')})`)
    return null
  }
  const webroot = o.webroot ?? pick(o.pack, 'webroot')
  const database = o.database ?? pick(o.pack, 'database')
  const files = { theme: copy(o.themeZip, path.basename(o.themeZip)) }
  const inputs = { themeZip: true, webroot: !!webroot, database: !!database, sitePages: !!o.sitePages, settingTemplate: !!o.settingTemplate, roles: false }
  const names = { webroot: `${slug}-wp7-webroot-${version}.tar.gz`, database: `${slug}-wp7-database-${version}.sql.gz` }
  if (webroot) files.webroot = copy(webroot, path.basename(webroot))
  if (database) files.database = copy(database, path.basename(database))
  if (o.sitePages) copy(o.sitePages, 'tracy_site_pages.json')
  if (o.roles) copy(o.roles, 'design-system-roles.json')
  inputs.roles = !!o.roles
  const zeros = '0'.repeat(64)
  const install = (kind) => ({
    file: files[kind] ?? names[kind],
    sha256: files[kind] ? sha256(path.join(dir, files[kind])) : zeros
  })
  // A published setting belongs to the version it was released as: carry its other fields, but never its version or
  // archive names/hashes (they would make the checkers judge the old release against the new zip).
  const fromTemplate = () => {
    const t = JSON.parse(readFileSync(o.settingTemplate, 'utf8'))
    const stale = t.version !== version
    const keep = (kind) => (files[kind] || stale || !t.install?.[kind] ? install(kind) : t.install[kind])
    return `${JSON.stringify({ ...t, version, install: { ...t.install, webroot: keep('webroot'), database: keep('database') } }, null, 2)}\n`
  }
  const settingText = o.settingTemplate
    ? fromTemplate()
    : `${JSON.stringify(
        {
          schemaVersion: 'tracy-setting/v1',
          platform: 'wordpress',
          label: o.label ?? slug,
          version,
          cms: '7',
          install: { webroot: install('webroot'), database: install('database') },
          template: slug
        },
        null,
        2
      )}\n`
  writeFileSync(path.join(dir, 'tracy_setting.json'), settingText)
  return { files, inputs }
}

// ---------------------------------------------------------------- checker calls
/** VARS-1 reads design-system-roles.json; the repo's role scanner writes it from the theme's sources (the zip, unpacked). */
function roleScan(repo, themeZip, scratch, version) {
  const unpacked = path.join(scratch, 'theme-src')
  mkdirSync(unpacked, { recursive: true })
  execFileSync('unzip', ['-q', '-o', path.resolve(themeZip), '-d', unpacked])
  const top = readdirSync(unpacked, { withFileTypes: true }).filter((e) => e.isDirectory())
  if (top.length !== 1) throw new UsageError(`${themeZip}: expected one theme folder at the top of the zip`)
  const out = path.join(scratch, 'design-system-roles.json')
  // exit 1 = unresolved findings: the report is still written and VARS-1 judges it
  const r = spawnSync(process.execPath, [path.join(repo, ROLE_SCAN), path.join(unpacked, top[0].name), '--check', '--out', out, '--platform', 'wordpress', '--template', top[0].name, '--version', version], { cwd: repo, encoding: 'utf8' })
  if (r.status === 2 || !existsSync(out)) throw new Error(`role-scan.mjs could not run: ${(r.stderr || '').trim().split('\n')[0]}`)
  return out
}

function runChecker(repo, script, dir, tag, extra = []) {
  const r = spawnSync(process.execPath, [path.join(repo, script), dir, '--tag', tag, '--json', ...extra], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status === 2 || r.error || !r.stdout.trim().startsWith('{')) throw new Error(`${script} could not run (exit ${r.status}): ${(r.stderr || r.error?.message || r.stdout).trim().split('\n')[0]}`)
  return JSON.parse(r.stdout)
}

function printLines(title, lines, mark) {
  if (!lines.length) return
  console.log(`\n${title}`)
  const measured = lines.filter((l) => !l.unmeasured)
  for (const l of measured) {
    console.log(`  ${mark} ${l.checker.toUpperCase()} ${l.id}  (owner: ${l.owner})  ${l.message.replace(/\s+/g, ' ').slice(0, 220)}`)
    if (l.fix) console.log(`      fix: ${l.fix.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
  // Unmeasured rules share one cause and one fix: one line, ids listed.
  const unmeasured = lines.filter((l) => l.unmeasured)
  if (unmeasured.length) {
    console.log(`  ${mark} TDSR unmeasured ×${unmeasured.length}: ${unmeasured.map((l) => l.id).join(' ')}`)
    const fix = unmeasured.find((l) => l.fix)?.fix
    if (fix) console.log(`      fix: ${fix.replace(/\s+/g, ' ').slice(0, 700)}`)
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2), SPEC, USAGE)
  if (!['pilot', 'release'].includes(o.stage)) throw new UsageError('--stage is pilot or release')
  const repo = findRepo(o.tch)
  let failed = false
  const out = {}

  if (o.prereq) {
    out.prereq = checkPrereq(repo, { build: o.build })
    if (!o.json) console.log(`${out.prereq.ok ? 'OK  ' : 'FAIL'} measurement image: ${out.prereq.note}`)
    failed ||= !out.prereq.ok
    if (!o.themeZip && !o.release) {
      if (o.json) console.log(JSON.stringify(out, null, 2))
      return failed ? 1 : 0
    }
  }

  if (!o.themeZip && !o.release) throw new UsageError('give --prereq, --theme-zip or --release')
  let dir = o.release
  let scratch = null
  let inputs = null
  try {
    if (!dir) {
      if (!o.slug) throw new UsageError('--theme-zip needs --slug')
      if (!o.version) throw new UsageError('--theme-zip needs --version <x.y.z> (the version of this build; a default would judge the wrong release)')
      if (!existsSync(o.themeZip)) throw new UsageError(`${o.themeZip} does not exist`)
      scratch = mkdtempSync(path.join(tmpdir(), 'road-precheck-'))
      dir = path.join(scratch, 'release')
      mkdirSync(dir)
      if (!o.roles) o.roles = roleScan(repo, o.themeZip, scratch, o.version)
      inputs = assembleProvisional(dir, o).inputs
      if (!inputs.database && !o.allowGaps)
        throw new UsageError('the demo database is missing: TCQR reads it for ABOUT-*, NAME-*, LOGO-*, PAGE-*. Dump it from the pilot stand with pack.mjs (--pack <dir>) or pass --database <sql.gz>; --allow-gaps runs without it')
    }
    const tag = o.tag ?? (o.slug ? `quickstart/${o.slug}/wp7` : null)
    if (!tag) throw new UsageError('--release needs --tag')
    const tcqr = runChecker(repo, TCQR, dir, tag, o.online ? [] : ['--offline'])
    const tdsr = runChecker(repo, TDSR, dir, tag)
    const gaps = { sitePagesMissing: inputs ? !inputs.sitePages : false }
    const lines = [...classify('tcqr', tcqr, loadSeverity(repo, 'tcqr'), o.stage, gaps), ...classify('tdsr', tdsr, loadSeverity(repo, 'tdsr'), o.stage)]
    const v = verdict(lines)
    Object.assign(out, { stage: o.stage, tag, folder: o.keep && scratch ? dir : (o.release ?? null), inputs, ...v })
    failed ||= v.blocked
    if (o.json) console.log(JSON.stringify(out, null, 2))
    else {
      console.log(`Road to live precheck (${o.stage}) — ${tdsr.template ?? tcqr.template ?? '?'} ${tdsr.version}  [${tag}]`)
      if (inputs) console.log(`provisional folder inputs: ${Object.entries(inputs).map(([k, ok]) => `${k} ${ok ? 'yes' : 'MISSING'}`).join(', ')}${Object.values(inputs).includes(false) ? ' — rules that read a missing asset say so below; they are not passes' : ''}`)
      printLines('BLOCKERS (must-fix, or slot contract missing / not ready) — the gate fails', v.blockers, 'X')
      printLines('WORTH FIXING — fix, or a decision in DECISIONS.md naming the rule id', v.warnings, '!')
      printLines(`PENDING — cannot be measured at the ${o.stage} stage; the release step measures it (stand.mjs up, flow.mjs --measure-version, preview-check.mjs --write)`, v.pending, '.')
      console.log(`\n${v.blocked ? 'BLOCKED' : 'CLEAR'}: ${v.blockers.length} blocker(s), ${v.warnings.length} worth-fixing, ${v.pending.length} pending`)
      if (o.keep && scratch) console.log(`provisional folder kept at ${dir}`)
    }
  } finally {
    if (scratch && !o.keep) rmSync(scratch, { recursive: true, force: true })
  }
  return failed ? 1 : 0
}

// exit 2 for anything that stops the check from running (the shared cli() would answer 1, which here means "blocked")
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main()
  } catch (e) {
    console.error(e instanceof UsageError ? `usage error: ${e.message} (try --help)` : `error: ${e.message}`)
    process.exitCode = 2
  }
}
