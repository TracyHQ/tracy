#!/usr/bin/env node
/**
 * The next version of a released JA Joomla quickstart whose stylesheets follow a worn system — built
 * LOCALLY, published nowhere:
 *
 *   node scripts/release-joomla.mjs <release tag> --template <contract> --out <dir> [--from <x.y.z>]
 *                                   [--rolling-as <x.y.z>]   (a rolling pre-release with one zip and no switch)
 *                                   [--as <x.y.z>]           (the new version, when the next patch is already taken)
 *                                   [--contract-from <x.y.z>] (the tch contract the new one starts from; default: the release's)
 *                                   [--overlay <dir>] [--sql <file>] [--replace <file>] [--no-tokenize] [--devmode-off]
 *
 * From the release's current pair (webroot + database, SHA-256 checked against its manifest):
 *  1. webroot: every templates/<tpl>/css/*.css tokenized (scripts/tokenize.mjs: a palette hex becomes
 *     `var(--ds-c-<role>, <that hex>)`, undefined until a system is worn — the default look is the
 *     same), and T4's combined-CSS cache (media/t4/optimize) emptied: T4 rebuilds it on the first
 *     request, from the tokenized files (it compares mtimes; the cache is outside the contract);
 *  1b. design-system-roles.json: the role scan of templates/<tpl> as it ships (release-role-scan.mjs),
 *     run before anything is packed; the build stops while rule VARS-1 would hold anything it finds;
 *  2. database: the same dump, under the new version's name;
 *  3. manifest.json + SHA256SUMS for the release;
 *  4. the tch contract for the new version: contracts/<slug>/j6/<new>/ — manifest.json re-embedding
 *     the new release manifest, presentation-lock.json with the changed files' hashes, content-map.json
 *     unchanged — and <new>.design.json / <new>.copy.json copied.
 * A release that is broken as published is repaired in the same build (JA Intranet 1.0.0, 11/10/2026: its
 * front page answered 500 on Joomla 6): --overlay copies a folder over the webroot (an extension in the
 * version the other releases ship), --sql appends a file to the installer's demo data
 * (installation/sql/mysql/custom.sql), --replace makes literal edits of the demo content in the
 * database AND in the lock that pins it (src/release-content-edits.mjs; Tracy Base 1.0.3: a kicker
 * painted with the warning colour in a module's HTML). --no-tokenize builds the repair alone — the baseline the
 * tokenized version is verified against, since the published one never rendered — and needs no contract;
 * --devmode-off does what a contract's t3DevmodeOff does.
 * Prints a JSON summary. Uploading, the Claude Cowork plugin that carries the contract and the pins
 * are the release owner's steps (quickstart-contract skill §8–9).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractBase, loadContract } from '../src/library.mjs'
import { manifestFromSetting } from '../src/release-manifest.mjs'
import { editContentMap, editDump, editLock, loadContentEdits } from '../src/release-content-edits.mjs'
import { pinAddedFiles } from '../src/release-lock-added.mjs'
import { packTar, packZip } from '../src/release-pack.mjs'
import { releaseRoleScan, ROLE_SCAN_FILE, roleScanError } from '../src/release-role-scan.mjs'
import { siteLanguageTwins } from '../src/release-site-language.mjs'
import { paletteForFile, tokenizeCss } from '../src/tokenize.mjs'
import { COLOUR_TOKENS } from '../src/tokens56.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const CONTRACTS = join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const REPO = 'JoomlArt-Products/ja-products'
const args = process.argv.slice(2)
const opt = (n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : args.splice(i, 2)[1]
}
const name = opt('--template')
const OUT = opt('--out')
const FROM = opt('--from')
const ROLLING_AS = opt('--rolling-as')
// --as: the version to cut, when the next patch is already taken by another line's build that is not on the
// release yet (JA Kinetic 1.0.7 of #1375, 16/10/2026: its contract is in the tree, its files are not uploaded);
// --contract-from: the tch contract the new one is copied from, when a newer one than the release's own exists
// (that same 1.0.7, whose content map was regated): the files still come from the release's current pair
const AS = opt('--as')
const CONTRACT_FROM = opt('--contract-from')
// --move-only: the re-cut moves only what it was cut for (status text, the contract's reRole) and tokenizes
// nothing new; a sheet the contract gives its own palette (filePalettes) is tokenized whole, never having been
const MOVE_ONLY = process.argv.includes('--move-only')
const OVERLAY = opt('--overlay')
const SQL = opt('--sql')
const REPLACE = opt('--replace')
const edits = REPLACE ? loadContentEdits(REPLACE) : []
const NO_TOKENIZE = args.includes('--no-tokenize')
const DEVMODE_OFF = args.includes('--devmode-off')
const STAND_PORT = Number(opt('--port') ?? 52371)
const tag = args.find((a) => !a.startsWith('--'))
if (!tag || (!name && !NO_TOKENIZE) || !OUT) {
  console.error(
    'usage: release-joomla.mjs <release tag> --template <contract> --out <dir> [--from <x.y.z>] [--rolling-as <x.y.z>] [--overlay <dir>] [--sql <file>] [--replace <file>] [--no-tokenize] [--devmode-off]'
  )
  process.exit(1)
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const shaFile = (f) => sha(readFileSync(f))
// three tries: a download that meets a network blip ("error connecting to api.github.com") is retried
const gh = (...a) => {
  for (let i = 1; ; i++)
    try {
      return execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      if (i >= 3 || !/connecting|timeout|EOF|reset|5\d\d/i.test(String(e.stderr ?? e.message))) throw e
      execFileSync('sleep', [String(10 * i)])
    }
}
const bump = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) + 1))

// ── the current pair ──
const dl = join(OUT, 'from')
mkdirSync(dl, { recursive: true })
// the release's own manifest, else (older JA releases: an installer zip, or a pair cut by hand)
// the one its latest tch contract embeds — what the fleet's catalog reads
const product = tag.replace(/^quickstart\//, '').split('/')[0]
let cur
try {
  gh('release', 'download', tag, '-R', REPO, '-D', dl, '-p', 'manifest.json', '--clobber')
  cur = JSON.parse(readFileSync(join(dl, 'manifest.json'), 'utf8'))
  // an older single-zip manifest is not the release's current state (tracy-business/j6)
  if (!cur.platform || !cur.parts) throw new Error('stale manifest')
} catch {
  const base = join(CONTRACTS, product, 'j6')
  // the version the release serves is the one its switch names (a contract built here for the next
  // version is newer, and its files are not on the release yet)
  let live = null
  try {
    gh('release', 'download', tag, '-R', REPO, '-D', dl, '-p', 'tracy_setting.json', '--clobber')
    live = JSON.parse(readFileSync(join(dl, 'tracy_setting.json'), 'utf8')).version
  } catch {}
  const versions = existsSync(base) ? readdirSync(base).filter((x) => /^\d+\.\d+\.\d+$/.test(x)) : []
  // no tch contract either (gavick-gk-*, purity-iii, t3/t4-framework): the switch itself names the
  // installer zip and its SHA-256 — what the fleet reads
  let sw = existsSync(join(dl, 'tracy_setting.json'))
    ? JSON.parse(readFileSync(join(dl, 'tracy_setting.json'), 'utf8'))
    : null
  // --rolling-as <x.y.z>: a rolling pre-release (JA Civica, 11/10/2026: one unversioned installer
  // zip that upload_quickstart_to_release.rb replaces, no switch, no manifest, no tch contract) is read
  // as that version (the one /ops' setting proposal gives it by default, setting-proposal.js: 1.0.0),
  // so the next version is the first switch that names a tokenized zip. Its SHA-256 is GitHub's asset
  // digest, its Joomla the installer's own libraries/src/Version.php. Opt-in: without the flag such a
  // release still fails below, as before
  if (ROLLING_AS && !sw && !versions.length) {
    const assets = JSON.parse(gh('release', 'view', tag, '-R', REPO, '--json', 'assets')).assets
    const zips = assets.filter((a) => a.name.endsWith('.zip'))
    if (zips.length !== 1)
      throw new Error(`${tag}: --rolling-as needs exactly one zip asset, found ${zips.length}`)
    const digest = /^sha256:([0-9a-f]{64})$/.exec(zips[0].digest ?? '')?.[1]
    if (!digest) throw new Error(`${tag}: ${zips[0].name} has no sha256 digest`)
    gh('release', 'download', tag, '-R', REPO, '-D', dl, '-p', zips[0].name, '--clobber')
    const php = execFileSync('unzip', ['-p', join(dl, zips[0].name), 'libraries/src/Version.php'], {
      encoding: 'utf8',
      maxBuffer: 1 << 24
    })
    const cms = ['MAJOR_VERSION', 'MINOR_VERSION', 'PATCH_VERSION'].map(
      (k) => new RegExp(`const\\s+${k}\\s*=\\s*(\\d+)\\s*;`).exec(php)?.[1]
    )
    if (cms.some((x) => x === undefined)) throw new Error(`${tag}: no Joomla version in the installer`)
    sw = {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      version: ROLLING_AS,
      cms: cms.join('.'),
      template: loadContract(name).template?.split('/').pop()?.replace(/-/g, '_'),
      install: { installer: { file: zips[0].name, sha256: digest } }
    }
    // the rolling zip laid out as a release of that version, so release-batch.mjs verify can stand
    // it up beside the next one (stand.mjs --from-dir <out>/from)
    writeFileSync(
      join(dl, 'manifest.json'),
      `${JSON.stringify({ product, platform: 'joomla', version: ROLLING_AS, cms: { version: sw.cms }, template: sw.template, parts: { installer: { file: zips[0].name, bytes: statSync(join(dl, zips[0].name)).size, sha256: digest } } }, null, 2)}\n`
    )
  }
  // --from <x.y.z>: a version cut and uploaded but not switched on yet (its switch waits for the deploy:
  // Tracy Business 1.2.4 on 16/10/2026) is the base of the next cut, from its tch contract's manifest
  const v =
    FROM && versions.includes(FROM)
      ? FROM
      : live && versions.includes(live)
        ? live
        : versions
            .sort((a, b) =>
              a
                .split('.')
                .map(Number)
                .reduce((r, x, i) => r || x - b.split('.').map(Number)[i], 0)
            )
            .pop()
  // (the Joomla the installer carries, `cms.version`, is what release-batch.mjs writes into the next switch)
  cur =
    v || !sw
      ? JSON.parse(readFileSync(join(base, v, 'manifest.json'), 'utf8')).quickstart
      : manifestFromSetting(tag, sw)
}
if (cur.platform !== 'joomla' || !cur.parts) throw new Error(`${tag} is not a Joomla quickstart release`)
if (FROM && FROM !== cur.version) throw new Error(`${tag} is at ${cur.version}, not ${FROM}`)
const slug = cur.product ?? product
const newer = (a, b) =>
  a
    .split('.')
    .map(Number)
    .reduce((r, x, i) => r || x - b.split('.').map(Number)[i], 0) > 0
if (AS && (!/^\d+\.\d+\.\d+$/.test(AS) || !newer(AS, cur.version)))
  throw new Error(`--as ${AS}: not a version above ${cur.version}`)
const next = AS ?? bump(cur.version)
const INSTALLER = !!cur.parts.installer
const inParts = INSTALLER ? [cur.parts.installer] : [cur.parts.webroot, cur.parts.database]
for (const p of inParts)
  if (!existsSync(join(dl, p.file)) || shaFile(join(dl, p.file)) !== p.sha256)
    gh('release', 'download', tag, '-R', REPO, '-D', dl, '-p', p.file, '--clobber')
for (const p of inParts)
  if (shaFile(join(dl, p.file)) !== p.sha256) throw new Error(`${p.file}: SHA-256 does not match the release`)

// ── 1. webroot, tokenized ──
const site = join(OUT, 'webroot')
rmSync(site, { recursive: true, force: true })
mkdirSync(site, { recursive: true })
if (INSTALLER) execFileSync('unzip', ['-q', join(dl, cur.parts.installer.file), '-d', site])
else execFileSync('tar', ['-xzf', join(dl, cur.parts.webroot.file), '-C', site])
const contract = name ? loadContract(name) : {}
if (DEVMODE_OFF) contract.t3DevmodeOff = true
const template = cur.template ?? contract.template?.split('/').pop()?.replace(/-/g, '_')
const base = name ? contractBase(ROOT, contract) : {}
const light = Object.fromEntries(COLOUR_TOKENS.map((n) => [n, base[`--${n}`]]))
const dark = Object.fromEntries(
  Object.entries(contract.darkTokens ?? {}).map(([k, v]) => [k.replace(/^--/, ''), v])
)
const palette = [light, ...(Object.keys(dark).length ? [dark] : []), ...(contract.extraPalettes ?? [])]
// every stylesheet the template ships: css/ (T3's css/themes/* included) and its ACM modules'
const tplRoot = join(site, 'templates', template)
const changed = {}
let replaced = 0
// the repair, before anything is tokenized: an overlay's stylesheets are tokenized like the release's
const repair = []
const overlaid = new Set()
if (OVERLAY) {
  const files = readdirSync(OVERLAY, { recursive: true })
    .map(String)
    .filter((f) => statSync(join(OVERLAY, f)).isFile())
  for (const f of files) {
    mkdirSync(dirname(join(site, f)), { recursive: true })
    copyFileSync(join(OVERLAY, f), join(site, f))
    changed[f] = shaFile(join(site, f))
    overlaid.add(f)
  }
  repair.push(
    `${files.length} files replaced (${[...new Set(files.map((f) => f.split('/').slice(0, 3).join('/')))].join(', ')})`
  )
  // the template language files Joomla reads first: the site's installed copies (src/release-site-language.mjs)
  const twins = siteLanguageTwins(files, (f) => existsSync(join(site, f)))
  for (const { from, to } of twins) {
    copyFileSync(join(OVERLAY, from), join(site, to))
    changed[to] = shaFile(join(site, to))
    overlaid.add(to)
  }
  if (twins.length)
    repair.push(`${twins.length} installed language files (${twins.map((t) => t.to).join(', ')})`)
}
if (SQL) {
  if (!INSTALLER)
    throw new Error(
      "--sql appends to an installer zip's demo data; this release is a webroot + database pair"
    )
  const custom = join(site, 'installation/sql/mysql/custom.sql')
  if (!existsSync(custom)) throw new Error('--sql: the installer has no installation/sql/mysql/custom.sql')
  // bytes, not text: a demo dump is not always valid UTF-8
  writeFileSync(custom, Buffer.concat([readFileSync(custom), Buffer.from('\n'), readFileSync(SQL)]))
  repair.push(
    `demo data: ${(readFileSync(SQL, 'utf8').match(/^(INSERT|UPDATE|DELETE|ALTER)\b/gm) ?? []).length} statements appended`
  )
}
for (const f of NO_TOKENIZE
  ? []
  : readdirSync(tplRoot, { recursive: true })
      .map(String)
      .filter((x) => x.endsWith('.css') && /^(css|acm|local)\//.test(x))) {
  const file = join(tplRoot, f)
  const before = readFileSync(file, 'utf8')
  const r = tokenizeCss(before, paletteForFile(palette, contract, file), {
    moveOnly: MOVE_ONLY && paletteForFile(palette, contract, file) === palette,
    accentVars: contract.accentVars,
    keepScopes: contract.keepScopes,
    classifyText: contract.classifyText,
    varRoles: contract.varRoles,
    t4Placeholders: contract.t4Placeholders,
    alphaText: contract.alphaText,
    pairVarFill: contract.pairVarFill,
    reRole: contract.reRole
  })
  if (r.css === before) continue
  writeFileSync(file, r.css)
  replaced += r.replaced
  changed[`templates/${template}/${f}`] = sha(Buffer.from(r.css))
}
// a contract with t4SiteCss: T4's generated per-style sheets too (media/t4/css/<style id>.css), where
// the template style's typography writes body colours as literals. No ready contract uses it since
// 11/10/2026: T4 writes those sheets again whenever their content changes (a style saved, the folder
// emptied), and the tokenized copy goes back to literals — JA Justitia, Helple and Landscape measured
// 4/12 once T4 had rewritten them, and read the slot through t4Placeholders instead
const t4css = join(site, 'media/t4/css')
if (contract.t4SiteCss && !NO_TOKENIZE && existsSync(t4css))
  for (const f of readdirSync(t4css).filter((x) => /^\d+\.css$/.test(x))) {
    const file = join(t4css, f)
    const before = readFileSync(file, 'utf8')
    const r = tokenizeCss(before, paletteForFile(palette, contract, file), {
      moveOnly: MOVE_ONLY && paletteForFile(palette, contract, file) === palette,
      accentVars: contract.accentVars,
      keepScopes: contract.keepScopes,
      classifyText: contract.classifyText,
      varRoles: contract.varRoles,
      t4Placeholders: contract.t4Placeholders,
      alphaText: contract.alphaText,
      pairVarFill: contract.pairVarFill,
      reRole: contract.reRole
    })
    if (r.css === before) continue
    writeFileSync(file, r.css)
    replaced += r.replaced
    changed[`media/t4/css/${f}`] = sha(Buffer.from(r.css))
  }
// A T3 template in dev mode compiles its LESS on every request and never serves css/*.css, so its
// tokenized stylesheets would never reach the page (JA Resume and JA Sensei 1.0.0 ship devmode 1: under
// every system 7-21% of the page followed, 09/10/2026). A contract's `t3DevmodeOff` ships the next
// version with T3's dev mode off in every template style — the database is then no longer the same
// bytes, and the release's verify compares the default look against the version as released.
const DEVMODE_ON = /\\"devmode\\":\\"1\\"/g
const devmodeOff = (sql) => sql.replace(DEVMODE_ON, '\\"devmode\\":\\"0\\"')
let devmodeRows = 0
if (contract.t3DevmodeOff && INSTALLER)
  for (const f of readdirSync(join(site, 'installation/sql'), { recursive: true }).map(String))
    if (f.endsWith('.sql')) {
      const file = join(site, 'installation/sql', f)
      const before = readFileSync(file, 'utf8')
      devmodeRows += (before.match(DEVMODE_ON) ?? []).length
      if (before.match(DEVMODE_ON)) writeFileSync(file, devmodeOff(before))
    }
// A GavickPro Gavern template style with "Recompile CSS" on compiles less/ into css/ on every request,
// over the tokenized sheets (GK Spotlight 1.0.0 ships its default style so). A contract's
// `gavernRecompileOff` ships the next version with it off in every template style; the css/ it then
// serves is the css/ the release ships, which must be what its LESS compiles to (checked for GK Spotlight
// on a stand: the shipped sheets and the compiled ones tokenize to the same bytes)
const RECOMPILE_ON = /\\"recompile_css\\":\\"1\\"/g
let recompileRows = 0
if (contract.gavernRecompileOff && INSTALLER)
  for (const f of readdirSync(join(site, 'installation/sql'), { recursive: true }).map(String))
    if (f.endsWith('.sql')) {
      const file = join(site, 'installation/sql', f)
      const before = readFileSync(file, 'utf8')
      recompileRows += (before.match(RECOMPILE_ON) ?? []).length
      if (before.match(RECOMPILE_ON))
        writeFileSync(file, before.replace(RECOMPILE_ON, '\\"recompile_css\\":\\"0\\"'))
    }
// --replace in an installer: its SQL files, counted together (latin1 keeps every byte of a dump that is
// not valid UTF-8; the edits are ASCII)
if (edits.length && INSTALLER) {
  const files = readdirSync(join(site, 'installation/sql'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join(site, 'installation/sql', f))
  const after = editDump(
    files.map((f) => readFileSync(f, 'latin1')),
    edits
  )
  files.forEach((f, i) => writeFileSync(f, after[i], 'latin1'))
}
if (edits.length)
  repair.push(`demo content: ${edits.length} edits (${edits.map((e) => e.entity).join(', ')})`)
const cache = join(site, 'media/t4/optimize')
if (existsSync(cache))
  for (const d of readdirSync(cache)) rmSync(join(cache, d), { recursive: true, force: true })
const prefix = tag.replace(/^quickstart\//, '').replace('/', '-')
// What T4 writes for this build's template styles (see the installer branch below): the build's
// zip installed as a stand (one at a time), its pages asked for, the sheets and their hashes read back
// and the stand taken down. Returns [{ path, content, css }] relative to the site root.
function t4Sheets(zipFile) {
  writeFileSync(
    join(rel, 'manifest.json'),
    `${JSON.stringify({ ...cur, version: next, parts: { installer: part(zipFile) } }, null, 2)}\n`
  )
  writeFileSync(join(rel, 'SHA256SUMS'), `${shaFile(join(rel, zipFile))}  ${zipFile}\n`)
  const stand = (...a) =>
    execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'stand.mjs'), ...a], {
      encoding: 'utf8',
      maxBuffer: 1 << 26
    })
  const standName = `${slug}-t4css`.slice(0, 40)
  const out = []
  try {
    const st = JSON.parse(
      stand('up', tag, '--port', String(STAND_PORT), '--name', standName, '--from-dir', rel)
        .trim()
        .split('\n')
        .pop()
    )
    // not followed: a page that redirects off the site (a banner's click link) renders nothing here
    const get = (h) => {
      try {
        return execFileSync('curl', ['-s', '--noproxy', '*', '-m', '300', `${st.site}${h}`], {
          encoding: 'utf8',
          maxBuffer: 1 << 26
        })
      } catch {
        return ''
      }
    }
    const links = [
      '/',
      ...new Set(
        [...get('/').matchAll(/href="(\/[^"#?]*)"/g)]
          .map((x) => x[1])
          .filter((h) => h !== '/' && !/\.(css|js|png|jpe?g|svg|webp|ico|woff2?|xml)$/.test(h))
      )
    ].slice(0, 120)
    const cssDir = join(st.dir, 'site/media/t4/css')
    const hashDirs = ['administrator/cache/t4asset', 'cache/t4asset']
    const snap = () =>
      Object.fromEntries(
        (existsSync(cssDir) ? readdirSync(cssDir) : [])
          .filter((f) => /^\d+(-sub)?\.css$/.test(f))
          .map((f) => [f, shaFile(join(cssDir, f))])
      )
    for (const h of links) get(h)
    const first = snap()
    for (const h of links) get(h)
    const second = snap()
    for (const [f, h] of Object.entries(second)) {
      // a sheet T4 wrote differently on a second visit is rewritten per page: shipping it would not hold
      if (first[f] !== h) continue
      const hashDir = hashDirs.find((d) => existsSync(join(st.dir, 'site', d, `${f}.txt`)))
      if (!hashDir) continue
      const before = readFileSync(join(cssDir, f), 'utf8')
      const r = tokenizeCss(before, paletteForFile(palette, contract, f), {
        moveOnly: MOVE_ONLY && paletteForFile(palette, contract, f) === palette,
        accentVars: contract.accentVars,
        keepScopes: contract.keepScopes,
        classifyText: contract.classifyText,
        varRoles: contract.varRoles,
        t4Placeholders: contract.t4Placeholders,
        alphaText: contract.alphaText,
        pairVarFill: contract.pairVarFill,
        reRole: contract.reRole
      })
      replaced += r.replaced
      out.push({ path: `media/t4/css/${f}`, content: r.css, css: true })
      out.push({
        path: `${hashDir}/${f}.txt`,
        content: readFileSync(join(st.dir, 'site', hashDir, `${f}.txt`), 'utf8')
      })
    }
  } finally {
    stand('down', '--name', standName)
  }
  return out
}
const rel = join(OUT, 'release')
mkdirSync(rel, { recursive: true })
// ── 1b. role scan of the template as it will ship (VARS-1's design-system-roles.json) ──
// Before anything is packed: a template that still hardcodes a role, or never reads a required role
// variable, stops the build here, not on /ops after the upload. The repair-only baseline
// (--no-tokenize) is never released and is not scanned.
let roleScan = null
if (!NO_TOKENIZE) {
  const r = releaseRoleScan({
    templateDir: tplRoot,
    releaseDir: rel,
    summaryDir: OUT,
    template: cur.template ?? template,
    platform: 'joomla',
    version: next
  })
  if (r.blockers.length) {
    console.error(roleScanError(r, `templates/${template}`).message)
    process.exit(1)
  }
  roleScan = { file: ROLE_SCAN_FILE, files: r.report.totals.files, keep: r.report.totals.keep }
}
const part = (f) => ({ file: f, bytes: statSync(join(rel, f)).size, sha256: shaFile(join(rel, f)) })
let parts
let outFiles
if (INSTALLER) {
  // the installer zip, versioned (the published one has no version in its name: a new zip under
  // the same name would change what the pinned contract of the old version points at)
  const zipFile = `${prefix}-quickstart-${next}.zip`
  // every pack sets the tree's modes first (rule STAB-1) and writes the archive anew (src/release-pack.mjs)
  packZip(site, join(rel, zipFile))
  parts = { installer: part(zipFile) }
  outFiles = [zipFile]
  // T4 writes each template style's colours into media/t4/css/<style id>.css on a page's first
  // render, and writes it again whenever what it would write differs from the hash it keeps in
  // administrator/cache/t4asset/<file>.txt (plugins/system/t4 Template::renderCustomCss). An installer
  // zip ships no such hash, so a stylesheet tokenized into the zip was overwritten with literals on a
  // new site's first page (JA Helple 1.0.1, 11/10/2026: measured on the build, 42–76% of the page
  // followed instead of 73–94%). A contract with t4SiteCss therefore gets them from this very build:
  // installed once, every menu page asked for twice, each sheet T4 wrote the same both times
  // tokenized and shipped WITH the hash T4 wrote for it — a new site's first render computes that same
  // hash and leaves the tokenized sheet alone
  if (contract.t4SiteCss && !NO_TOKENIZE) {
    const t4 = t4Sheets(zipFile)
    if (t4.length) {
      for (const f of t4) {
        mkdirSync(dirname(join(site, f.path)), { recursive: true })
        writeFileSync(join(site, f.path), f.content)
        if (f.css) changed[f.path] = sha(Buffer.from(f.content))
      }
      packZip(site, join(rel, zipFile))
      parts = { installer: part(zipFile) }
    }
  }
} else {
  const webFile = `${prefix}-webroot-${next}.tar.gz`
  const dbFile = `${prefix}-database-${next}.sql.gz`
  // same layout as the published archive (entries under ./), no macOS metadata, modes set (STAB-1)
  packTar(site, join(rel, webFile))
  // ── 2. database, same dump ──
  if (contract.t3DevmodeOff || edits.length) {
    // latin1: every byte of the dump kept, valid UTF-8 or not (both edits touch ASCII only)
    let dump = execFileSync('gunzip', ['-c', join(dl, cur.parts.database.file)], {
      maxBuffer: 1 << 30
    }).toString('latin1')
    if (contract.t3DevmodeOff) {
      devmodeRows += (dump.match(DEVMODE_ON) ?? []).length
      dump = devmodeOff(dump)
    }
    if (edits.length) dump = editDump(dump, edits)
    writeFileSync(
      join(rel, dbFile),
      execFileSync('gzip', ['-n', '-9', '-c'], { input: Buffer.from(dump, 'latin1'), maxBuffer: 1 << 30 })
    )
  } else copyFileSync(join(dl, cur.parts.database.file), join(rel, dbFile))
  parts = { webroot: part(webFile), database: part(dbFile) }
  outFiles = [webFile, dbFile]
}

// ── 3. release manifest ──
const manifest = {
  ...cur,
  version: next,
  parts,
  createdAt: new Date().toISOString(),
  builtFrom: {
    from: `${tag}@${cur.version}`,
    by: 'tracy-ds-slot release-joomla.mjs',
    change: [
      ...(repair.length ? [`repaired: ${repair.join('; ')}`] : []),
      ...(NO_TOKENIZE ? [] : ['stylesheets read the worn design system (--ds-c-*)']),
      ...(devmodeRows ? [`T3 dev mode off (${devmodeRows} template styles)`] : []),
      ...(recompileRows ? [`Gavern "Recompile CSS" off (${recompileRows} template styles)`] : [])
    ].join('; ')
  }
}
writeFileSync(join(rel, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(
  join(rel, 'SHA256SUMS'),
  [...outFiles, 'manifest.json'].map((f) => `${shaFile(join(rel, f))}  ${f}\n`).join('')
)

// ── 4. the tch contract for the new version ──
const cdir = join(CONTRACTS, slug, 'j6')
const prev = join(cdir, CONTRACT_FROM ?? cur.version)
if (CONTRACT_FROM && !existsSync(join(prev, 'manifest.json')))
  throw new Error(`--contract-from ${CONTRACT_FROM}: no contract`)
let contractOut = null
// a release with a content contract: its folder holds the manifest (a folder may hold only the design system's
// measurement file, design-system-measurement.json, for a template that has no content contract)
if (existsSync(join(prev, 'manifest.json'))) {
  const dst = join(OUT, 'contract', slug, 'j6', next)
  mkdirSync(dst, { recursive: true })
  const cm = JSON.parse(readFileSync(join(prev, 'manifest.json'), 'utf8'))
  cm.id = `${slug}/j6/${next}`
  // the release the contract seals, which tracy-web keys every contract by: a release manifest cut by this
  // script carries none (JA Fresco 1.0.2, so 1.0.3's contract named no quickstart)
  cm.quickstart = { ...manifest, release: manifest.release ?? tag }
  writeFileSync(join(dst, 'manifest.json'), `${JSON.stringify(cm, null, 2)}\n`)
  // the lock is written by the capture tool (PHP's JSON escaping): swap each changed hash as text, so
  // every other byte stays the capture's own
  let lockText = readFileSync(join(prev, 'presentation-lock.json'), 'utf8')
  const lock = JSON.parse(lockText)
  let swapped = 0
  for (const [f, h] of Object.entries(changed)) {
    const was = lock.files[f]
    if (!was) continue
    const key = JSON.stringify(f).replace(/\//g, '(?:\\\\)?/')
    const re = new RegExp(`(${key}\\s*:\\s*")${was}"`)
    if (!re.test(lockText)) throw new Error(`lock: ${f} not found as text`)
    lockText = lockText.replace(re, `$1${h}"`)
    swapped += 1
  }
  // The lock pins every template style's params (entities.templateStyle-<id>.params, the same escaped
  // JSON text as the dump), and the plugin compares them with the site's rows when it binds. A build
  // that switched T3's dev mode or Gavern's recompile off in the database must say so in the lock too,
  // or every site of the new version is refused at bind ("Presentation drift: templateStyle-<id> —
  // params"; JA Resume / JA Sensei 1.0.1 shipped so, found 11/10/2026)
  for (const [rows, on, off] of [
    [devmodeRows, DEVMODE_ON, '\\"devmode\\":\\"0\\"'],
    [recompileRows, RECOMPILE_ON, '\\"recompile_css\\":\\"0\\"']
  ])
    if (rows) {
      const inLock = (lockText.match(on) ?? []).length
      if (inLock !== rows)
        throw new Error(`lock: ${inLock} template styles switched on, the database had ${rows}`)
      lockText = lockText.replace(on, off)
    }
  // --replace: the lock pins the edited module's content, so it carries the same edit
  if (edits.length) lockText = editLock(lockText, edits)
  // a file the build adds under a file root (an overlay's new partial) is pinned too, or the plugin
  // refuses every site of the new version at bind ("Unexpected presentation file")
  const added = Object.fromEntries(Object.entries(changed).filter(([f]) => !(f in lock.files)))
  lockText = pinAddedFiles(lockText, added).text
  const check = JSON.parse(lockText)
  for (const [f, h] of Object.entries(changed))
    if (f in lock.files && check.files[f] !== h) throw new Error(`lock: ${f} not swapped`)
  writeFileSync(join(dst, 'presentation-lock.json'), lockText)
  if (swapped !== Object.keys(changed).filter((f) => f in lock.files).length)
    throw new Error('lock: swap count')
  // every other file of the profile, as it is — not the design system's measurement, which is of the release
  // before (a new release is measured on its own, or not at all: /ops says "not measured yet")
  // --replace: a slot whose sample is the text an edit replaces names the new text
  if (edits.length && existsSync(join(prev, 'content-map.json')))
    writeFileSync(
      join(dst, 'content-map.json'),
      editContentMap(readFileSync(join(prev, 'content-map.json'), 'utf8'), edits).text
    )
  for (const f of readdirSync(prev))
    if (f !== 'design-system-measurement.json' && !existsSync(join(dst, f)))
      copyFileSync(join(prev, f), join(dst, f))
  // the files beside the version directory travel with it: <v>.design.json, and <v>.copy.json (the demo
  // names and kept text tracy-web's contract-copy.js reads — the content is the same bytes)
  for (const ext of ['design', 'copy'])
    if (existsSync(`${prev}.${ext}.json`))
      copyFileSync(`${prev}.${ext}.json`, join(OUT, 'contract', slug, 'j6', `${next}.${ext}.json`))
  contractOut = dst
}
console.log(
  JSON.stringify({
    tag,
    from: cur.version,
    to: next,
    cssFiles: Object.keys(changed).filter((f) => !overlaid.has(f)).length,
    ...(overlaid.size && { overlaid: overlaid.size }),
    replaced,
    ...(contract.t3DevmodeOff && { devmodeOff: devmodeRows }),
    ...(contract.gavernRecompileOff && { recompileOff: recompileRows }),
    parts: manifest.parts,
    roleScan,
    contract: contractOut
  })
)
