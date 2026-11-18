#!/usr/bin/env node
/**
 * Cut a patch-only release of a PUBLISHED Tracy EmDash quickstart: the published zip and state, the
 * repo's pnpm patches and a new version, nothing else.
 *
 *   node scripts/emdash-patch-release.mjs --from <dir> --version <new> --out <new-dir>
 *        [--theme-dir packages/cms/tracy-emdash-theme-<name>] [--patches patches] [--advisory GHSA-…]
 *        [--report <file>]
 *
 * `--from` holds the downloaded assets of the release tag (`gh release download <product>/emdash-0.x`):
 * `manifest.json`, `SHA256SUMS`, `tracy_setting.json`, `VERIFICATION.json`, `README.md`, the zip and
 * the state tarball the manifest names, and the other files `SHA256SUMS` lists. `--out` receives only
 * the files to upload: the new zip and state, `manifest.json`, `VERIFICATION.json`, `README.md`,
 * `tracy_setting.json` and `SHA256SUMS`. Every other asset of the tag stays as it is; the report
 * (`<out>.report.json` unless `--report`) lists them, the version strings left in the zip and why.
 *
 * WHY NOT THE RELEASE CHAIN. The theme's own `tools/release.mjs` packs a site that has run and
 * re-gates it; a security patch of a version already published changes no content, no
 * design and no database, so the published bytes are the source and the change is mechanical:
 *  - zip: `patches/` from this repo, the `patchedDependencies` block of `pnpm-workspace.yaml` and the
 *    `COPY patches` lines of the Dockerfile exactly as the theme on develop carries them, the lockfile
 *    as pnpm writes it for those patches (`patchLockfile`), the version wherever the zip states it
 *    (`VERSION_FIELDS`), the `sha256:` statements about the changed files (artifact.json, the
 *    inventory), and `distribution.json` re-hashed the way `tools/distribution.mjs` hashes it;
 *  - state: the same bytes under the new name. A restore compares no version
 *    (`emdash_restore_state` in the fleet's `quickstart-restore.sh` only wants `data/data.db`), and the
 *    report says where the old version still shows inside the tarball;
 *  - the template kit zip (`template-kit-<product>-<old>.zip`, when the theme's `contracts/<old>/` has a kit): the
 *    same bytes under the new name, the name the site planner asks for once `contracts/<new>/` names the version;
 *  - the manifest's gates and receipts stay the old version's, and `patchRelease` says so.
 *
 * 🔒 IT NEVER UPLOADS. The publisher attaches `--out` to the tag after reading the report.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SETTING_SCHEMA, validateSetting } from '../packages/site/tracy-site-build-core/src/tracy-setting.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ADVISORY = 'GHSA-fc5q-39xc-vjpf'

const sha256 = (/** @type {string | Buffer} */ bytes) => createHash('sha256').update(bytes).digest('hex')
const fileSha = (/** @type {string} */ p) => sha256(readFileSync(p))
const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `SHA256SUMS` → `[[file, sha]]` in the order written (GNU marks binary files with `*`). */
export function parseSums(text) {
  return text
    .split('\n')
    .map((l) => /^([a-f0-9]{64})\s+\*?(.+?)\s*$/.exec(l))
    .filter((m) => m !== null)
    .map((m) => [m[2], m[1]])
}

/** The patch hash pnpm records for a patch file: sha256 of its bytes, hex (pnpm 9-11, `createHexHashFromFile`). */
export const patchHash = (/** @type {string | Buffer} */ bytes) => sha256(bytes)

/** `{ 'picomatch@4.0.7': hash }` → `[{ name, version, hash }]` */
const entriesOf = (/** @type {Record<string, string>} */ patches) =>
  Object.entries(patches).map(([key, hash]) => {
    const at = key.lastIndexOf('@')
    return { key, name: key.slice(0, at), version: key.slice(at + 1), hash }
  })

/**
 * The lockfile pnpm writes for `patches` (`{ 'picomatch@4.0.7': '<patch hash>' }`), from the one it wrote without
 * them: a `patchedDependencies:` section before `importers:`, and every resolved reference to a patched version
 * (snapshot keys, dependency versions, peer suffixes, importer versions) carrying `(patch_hash=…)`. The `packages:`
 * section names the registry tarball and stays as it is. Checked against what pnpm 11 wrote for #684 on each theme.
 * @param {string} text @param {Record<string, string>} patches
 */
export function patchLockfile(text, patches) {
  if (/^patchedDependencies:/m.test(text)) throw new Error('the lockfile already has patchedDependencies')
  const entries = entriesOf(patches)
  const lines = text.split('\n')
  const at = lines.findIndex((l) => /^(?:pnpmfileChecksum|importers):/.test(l))
  if (at < 0) throw new Error('the lockfile has no importers section')
  let section = ''
  let importerDep = ''
  const out = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (i === at) {
      out.push('patchedDependencies:')
      for (const e of [...entries].sort((a, b) => (a.key < b.key ? -1 : 1))) out.push(`  ${e.key}: ${e.hash}`)
      out.push('')
    }
    const top = /^([A-Za-z]\w*):/.exec(line)
    if (top) section = top[1]
    if (section === 'snapshots' || section === 'importers') {
      for (const e of entries) {
        const ref = `${e.name}@${e.version}`
        const patched = `${e.version}(patch_hash=${e.hash})`
        // peer suffix: fdir@6.5.0(picomatch@4.0.7) → fdir@6.5.0(picomatch@4.0.7(patch_hash=…))
        line = line.replace(new RegExp(`\\(${esc(ref)}\\)`, 'g'), `(${e.name}@${patched})`)
        if (section === 'snapshots') {
          // the snapshot of the package itself: `  picomatch@4.0.7: {}`
          line = line.replace(new RegExp(`^(  ${esc(ref)})(:.*)$`), `$1(patch_hash=${e.hash})$2`)
          // a dependency on it: `      picomatch: 4.0.7`
          line = line.replace(new RegExp(`^(\\s+${esc(e.name)}: )${esc(e.version)}$`), `$1${patched}`)
        }
      }
      if (section === 'importers') {
        const dep = /^ {6}(\S+):$/.exec(line)
        if (dep) importerDep = dep[1].replace(/^['"]|['"]$/g, '')
        for (const e of entries)
          if (importerDep === e.name)
            line = line.replace(
              new RegExp(`^( {8}version: )${esc(e.version)}((?:\\(.*\\))?)$`),
              `$1${e.version}(patch_hash=${e.hash})$2`
            )
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

/** The exact versions of `name` the lockfile resolves (`packages:` keys). */
export function lockedVersions(text, name) {
  return [...text.matchAll(new RegExp(`^  '?${esc(name)}@(\\d[^:'(]*)'?:`, 'gm'))]
    .map((m) => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
}

/** The comment and `patchedDependencies:` block that closes the develop theme's `pnpm-workspace.yaml`. */
export function workspaceBlockOf(developText) {
  const lines = developText.replace(/\n+$/, '').split('\n')
  const at = lines.findIndex((l) => /^patchedDependencies:\s*$/.test(l))
  if (at < 0) throw new Error('the develop pnpm-workspace.yaml has no patchedDependencies')
  let start = at
  while (start > 0 && lines[start - 1].startsWith('#')) start--
  let end = at + 1
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++
  if (end !== lines.length)
    throw new Error('patchedDependencies is not the last block of the develop pnpm-workspace.yaml')
  return `${lines.slice(start).join('\n')}\n`
}

/** `pnpm-workspace.yaml` with the develop block appended, keeping only entries for `keys` (the patches the lockfile needs). */
export function patchWorkspace(text, block, keys) {
  if (/^patchedDependencies:/m.test(text))
    throw new Error('pnpm-workspace.yaml already has patchedDependencies')
  const kept = block
    .split('\n')
    .filter((l) => {
      const m = /^\s+'?([^'\s:]+@[^'\s:]+)'?:/.exec(l)
      return !m || keys.includes(m[1])
    })
    .join('\n')
  return `${text.replace(/\n*$/, '\n')}${kept}`
}

/** The Dockerfile with the develop theme's `COPY patches` lines put right after the manifest COPY, as #684 did. */
export function patchDockerfile(text, developText) {
  const anchor = /^COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\/$/m
  const dev = developText.split('\n')
  const a = dev.findIndex((l) => anchor.test(l))
  const c = dev.findIndex((l) => l.startsWith('COPY patches '))
  if (a < 0 || c < a) throw new Error('the develop Dockerfile has no COPY patches after the manifest COPY')
  const block = dev.slice(a + 1, c + 1).join('\n')
  if (/^COPY patches /m.test(text)) throw new Error('the Dockerfile already copies patches')
  const lines = text.split('\n')
  const at = lines.findIndex((l) => anchor.test(l))
  if (at < 0)
    throw new Error('the Dockerfile has no `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./`')
  if (lines.findIndex((l, i) => i > at && anchor.test(l)) > 0)
    throw new Error('the Dockerfile copies the manifests twice')
  lines.splice(at + 1, 0, block)
  return lines.join('\n')
}

/**
 * Where the zip states the template's own version: JSON pointers per file, and the Dockerfile label. A field is changed
 * only when it holds the old version (artifact.json of some themes lags the package, and stays as it was).
 */
export const VERSION_FIELDS = {
  'package.json': ['/version'],
  'template.config.json': ['/version'],
  'artifact.json': ['/version', '/package/version'],
  'docs/generated/inventory.json': ['/template/version']
}

/** Every JSON pointer whose value differs between `a` and `b` (objects and arrays walked). */
function changedPointers(a, b, at = '') {
  if (a === b) return []
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap((k) => changedPointers(a[k], b[k], `${at}/${k}`))
  }
  return [at]
}

/** `text` of `file` with the version fields `VERSION_FIELDS` names moved from `from` to `to`; formatting kept byte for byte. */
export function bumpJson(file, text, from, to) {
  const pointers = VERSION_FIELDS[file] ?? []
  const before = JSON.parse(text)
  const next = text.replace(new RegExp(`("version"\\s*:\\s*")${esc(from)}(")`, 'g'), `$1${to}$2`)
  const changed = changedPointers(before, JSON.parse(next))
  const stray = changed.filter((p) => !pointers.includes(p))
  if (stray.length > 0)
    throw new Error(
      `${file}: a version field outside ${pointers.join(', ')} holds ${from}: ${stray.join(', ')}`
    )
  return { text: next, changed }
}

/** Every file under `root`, relative, `/`-separated, sorted the way `tools/distribution.mjs` sorts. */
function walk(root, prefix = '') {
  return readdirSync(path.join(root, prefix))
    .sort()
    .flatMap((name) => {
      const rel = prefix ? `${prefix}/${name}` : name
      const st = lstatSync(path.join(root, rel))
      if (st.isSymbolicLink()) throw new Error(`symlink in the zip: ${rel}`)
      return st.isDirectory() ? walk(root, rel) : [rel]
    })
}

const TEXT =
  /\.(?:json|md|mjs|cjs|js|ts|tsx|astro|css|ya?ml|sh|txt|html|svg)$|(?:^|\/)(?:Dockerfile|LICENSE|\.env\.example)$/

/** Lines of the text files under `root` that hold `version` as a whole version (not 10.5.6 or 0.5.60). */
export function versionHits(root, version) {
  const re = new RegExp(`(?<![\\d.])${esc(version)}(?![\\d]|\\.\\d)`)
  const hits = []
  for (const rel of walk(root)) {
    if (!TEXT.test(rel)) continue
    readFileSync(path.join(root, rel), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (re.test(line)) hits.push({ file: rel, line: i + 1, text: line.trim().slice(0, 200) })
      })
  }
  return hits
}

/** Why a version hit left in the zip is not the template's version, when its place says so; otherwise null (a person reads it). */
export function hitReason(hit) {
  if (hit.file === 'pnpm-lock.yaml') return 'a dependency that has the same version number (lockfile)'
  return null
}

/** DOS times in a zip carry no zone: read and written in UTC, so the cut is the same on every machine. */
const UTC = { ...process.env, TZ: 'UTC' }
/** The time of every entry the cut writes into the zip (as the kit pack dates its entries). */
const PATCH_TIME = new Date(Date.UTC(2020, 0, 1))

const run = (/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {object} */ opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30, ...opts })

/**
 * Cut the release. Returns the report (also written to `report`).
 * @param {{ from: string, version: string, out: string, themeDir?: string, patchesDir?: string, advisory?: string,
 *   report?: string }} o
 */
export function cut(o) {
  const from = path.resolve(o.from)
  const out = path.resolve(o.out)
  const advisory = o.advisory ?? ADVISORY
  const read = (/** @type {string} */ f) => readFileSync(path.join(from, f), 'utf8')
  const manifest = JSON.parse(read('manifest.json'))
  const old = manifest.version
  const to = o.version
  const product = manifest.product
  if (!/^\d+\.\d+\.\d+$/.test(to)) throw new Error(`--version ${to} is not x.y.z`)
  if (to === old) throw new Error(`--version ${to} is the published version`)
  if (existsSync(out)) throw new Error(`${out} exists; --out must be new`)
  if (manifest.cms?.name !== 'emdash') throw new Error(`manifest cms is ${manifest.cms?.name}, not emdash`)
  const slug = `${product}-emdash`
  const zipName = `${slug}-quickstart-${to}.zip`
  const stateName = `${slug}-state-${to}.tar.gz`
  if (
    manifest.artifact !== `${slug}-quickstart-${old}.zip` ||
    manifest.state?.file !== `${slug}-state-${old}.tar.gz`
  )
    throw new Error(
      `manifest names ${manifest.artifact} / ${manifest.state?.file}, not the release.mjs names of ${old}`
    )
  for (const f of readdirSync(from))
    if (f === zipName || f === stateName) throw new Error(`${f} already exists among the published assets`)

  // ── the published release must be what it says ──────────────────────────────────────────────
  const sums = parseSums(read('SHA256SUMS'))
  const listed = new Map(sums)
  // Every file the cut reads or carries forward is held to the published sums: an unlisted one is unverified bytes.
  for (const f of [
    manifest.artifact,
    manifest.state.file,
    'manifest.json',
    'tracy_setting.json',
    'VERIFICATION.json',
    'README.md'
  ])
    if (!listed.has(f)) throw new Error(`SHA256SUMS does not list ${f}`)
  for (const [f, want] of sums) {
    if (!existsSync(path.join(from, f))) throw new Error(`${f} (listed in SHA256SUMS) was not downloaded`)
    if (fileSha(path.join(from, f)) !== want) throw new Error(`${f} does not match SHA256SUMS`)
  }
  if (
    manifest.sha256 !== listed.get(manifest.artifact) ||
    manifest.state.sha256 !== listed.get(manifest.state.file)
  )
    throw new Error('manifest.json and SHA256SUMS disagree on the zip or the state')
  const setting = JSON.parse(read('tracy_setting.json'))
  if (setting.version !== old)
    throw new Error(`tracy_setting.json is ${setting.version}, the manifest ${old}`)
  const gatesFrom = verificationGates(JSON.parse(read('VERIFICATION.json')), manifest, old)

  const themeDir = path.resolve(
    o.themeDir ?? path.join(ROOT, 'packages/cms', `tracy-emdash-theme-${product.replace(/^tracy-/, '')}`)
  )
  const patchesDir = path.resolve(o.patchesDir ?? path.join(ROOT, 'patches'))
  // The site planner fetches the kit images as `template-kit-<template>-<contract version>.zip` from the tag
  // (apps/tracy-web/src/lib/template-kit-images.js `kitZipName`, the road's `kit-zip-missing` in
  // template-kit/flow-reads.js), so the new version's contract needs its kit under the new name: the published kit,
  // checked against `contracts/<old>/`, carrying `contracts/<new>/template-kit.json` (`carryKit`).
  const kitFrom = `template-kit-${product}-${old}.zip`
  const kitTo = `template-kit-${product}-${to}.zip`
  const kitJson = (/** @type {string} */ v) => path.join(themeDir, 'contracts', v, 'template-kit.json')
  const hasKit = existsSync(kitJson(old))
  if (hasKit && !existsSync(path.join(from, kitFrom)))
    throw new Error(`contracts/${old} has a template kit: download ${kitFrom} from the tag too`)
  if (hasKit && !existsSync(kitJson(to)))
    throw new Error(
      `contracts/${old} has a template kit and contracts/${to}/template-kit.json does not exist yet`
    )
  if (existsSync(path.join(from, kitTo)))
    throw new Error(`${kitTo} already exists among the published assets`)
  const work = mkdtempSync(path.join(tmpdir(), 'emdash-patch-release-'))
  try {
    /** @type {{ rewritten: boolean } | null} */
    let kitPlan = null
    if (hasKit)
      kitPlan = checkKit({
        kit: path.join(from, kitFrom),
        name: kitFrom,
        oldJson: readFileSync(kitJson(old)),
        newJson: readFileSync(kitJson(to)),
        work: path.join(work, 'kit')
      })
    const tree = path.join(work, 'app')
    run('unzip', ['-q', path.join(from, manifest.artifact), '-d', tree], { env: UTC })
    const before = new Map(walk(tree).map((f) => [f, fileSha(path.join(tree, f))]))
    // every entry's published time (directories too), put back before zipping on all the cut did not change
    const published = new Map(
      execFileSync('find', ['.', '-mindepth', '1'], { cwd: tree, encoding: 'utf8', maxBuffer: 1 << 30 })
        .split('\n')
        .filter(Boolean)
        .map((f) => [f.slice(2), lstatSync(path.join(tree, f)).mtime])
    )
    const dist = JSON.parse(readFileSync(path.join(tree, 'distribution.json'), 'utf8'))
    const distHash = (/** @type {object} */ checksums) => `sha256:${sha256(JSON.stringify(checksums))}`
    if (distHash(dist.checksums) !== dist.artifactHash)
      throw new Error('published distribution.json: manifest hash mismatch')
    if (dist.artifactHash !== manifest.template?.artifactHash)
      throw new Error(
        `published distribution.json is ${dist.artifactHash}, the manifest ${manifest.template?.artifactHash}`
      )
    for (const [f, h] of Object.entries(dist.checksums))
      if (before.get(f) === undefined || `sha256:${before.get(f)}` !== h)
        throw new Error(`published zip: ${f} does not verify`)
    if (before.size !== Object.keys(dist.checksums).length + 1)
      throw new Error('published zip: file set differs from distribution.json')
    if (existsSync(path.join(tree, 'patches'))) throw new Error('the published zip already has patches/')

    // ── the patch ────────────────────────────────────────────────────────────────────────────
    const lock = readFileSync(path.join(tree, 'pnpm-lock.yaml'), 'utf8')
    const patchFiles = readdirSync(patchesDir)
      .filter((f) => f.endsWith('.patch'))
      .sort()
    const available = Object.fromEntries(patchFiles.map((f) => [f.slice(0, -'.patch'.length), f]))
    const names = [...new Set(Object.keys(available).map((k) => k.slice(0, k.lastIndexOf('@'))))]
    /** @type {Record<string, string>} */
    const patches = {}
    for (const name of names)
      for (const v of lockedVersions(lock, name)) {
        const key = `${name}@${v}`
        if (!available[key])
          throw new Error(`the lockfile resolves ${key} and ${patchesDir} has no patch for it`)
        patches[key] = patchHash(readFileSync(path.join(patchesDir, available[key])))
      }
    if (Object.keys(patches).length === 0)
      throw new Error('the lockfile resolves none of the patched packages')
    mkdirSync(path.join(tree, 'patches'))
    for (const key of Object.keys(patches))
      copyFileSync(path.join(patchesDir, available[key]), path.join(tree, 'patches', available[key]))
    writeFileSync(path.join(tree, 'pnpm-lock.yaml'), patchLockfile(lock, patches))
    const ws = path.join(tree, 'pnpm-workspace.yaml')
    writeFileSync(
      ws,
      patchWorkspace(
        readFileSync(ws, 'utf8'),
        workspaceBlockOf(readFileSync(path.join(themeDir, 'pnpm-workspace.yaml'), 'utf8')),
        Object.keys(patches)
      )
    )
    const df = path.join(tree, 'Dockerfile')
    writeFileSync(
      df,
      patchDockerfile(readFileSync(df, 'utf8'), readFileSync(path.join(themeDir, 'Dockerfile'), 'utf8'))
    )

    // ── the version ──────────────────────────────────────────────────────────────────────────
    /** @type {{ file: string, where: string }[]} */
    const bumped = []
    for (const file of Object.keys(VERSION_FIELDS)) {
      const p = path.join(tree, file)
      if (!existsSync(p)) continue
      const r = bumpJson(file, readFileSync(p, 'utf8'), old, to)
      // an untouched file keeps its published time in the zip: rewrite only what changed
      if (r.changed.length > 0) writeFileSync(p, r.text)
      for (const where of r.changed) bumped.push({ file, where })
    }
    for (const required of ['package.json', 'template.config.json'])
      if (!bumped.some((b) => b.file === required && b.where === '/version'))
        throw new Error(`${required} does not state ${old}`)
    {
      const label = new RegExp(`(io\\.tracy\\.template\\.version=")${esc(old)}(")`)
      const text = readFileSync(df, 'utf8')
      if (!label.test(text)) throw new Error(`the Dockerfile has no io.tracy.template.version="${old}"`)
      writeFileSync(df, text.replace(label, `$1${to}$2`))
      bumped.push({ file: 'Dockerfile', where: 'LABEL io.tracy.template.version' })
    }
    const pkgName = JSON.parse(readFileSync(path.join(tree, 'package.json'), 'utf8')).name
    for (const file of ['AGENTS.md', 'README.md']) {
      const p = path.join(tree, file)
      if (!existsSync(p)) continue
      const re = new RegExp(`(\`${esc(pkgName)}\` )${esc(old)}(?![\\d])`, 'g')
      const text = readFileSync(p, 'utf8')
      if (re.test(text)) {
        writeFileSync(p, text.replace(re, `$1${to}`))
        bumped.push({ file, where: `\`${pkgName}\` <version>` })
      }
    }

    // ── the files that state a changed file's sha256 (artifact.json, the inventory), to a fixed point ──
    /** @type {{ file: string, of: string }[]} */
    const restated = []
    // every hash a file has had during the cut: a statement written in round 1 names the file as it was then
    const seen = new Map(
      [...before].filter(([f]) => f !== 'distribution.json').map(([f, h]) => [f, new Set([h])])
    )
    for (let round = 0; ; round++) {
      if (round > 10) throw new Error('sha256 statements did not settle')
      const now = new Map([...seen.keys()].map((f) => [f, fileSha(path.join(tree, f))]))
      let again = false
      for (const f of walk(tree)) {
        if (f === 'distribution.json' || !/\.(?:json|md)$/.test(f)) continue
        const p = path.join(tree, f)
        let text = readFileSync(p, 'utf8')
        const was = text
        for (const [m, hashes] of seen)
          for (const h of hashes)
            if (h !== now.get(m) && text.includes(`sha256:${h}`)) {
              text = text.split(`sha256:${h}`).join(`sha256:${now.get(m)}`)
              if (!restated.some((r) => r.file === f && r.of === m)) restated.push({ file: f, of: m })
            }
        if (text !== was) {
          writeFileSync(p, text)
          again = true
        }
      }
      for (const [m, h] of now) seen.get(m)?.add(h)
      if (!again) break
    }

    // ── distribution.json, the way tools/distribution.mjs writes it ──────────────────────────
    const files = walk(tree).filter((f) => f !== 'distribution.json')
    const checksums = Object.fromEntries(
      [...files].sort().map((f) => [f, `sha256:${fileSha(path.join(tree, f))}`])
    )
    const artifactHash = distHash(checksums)
    writeFileSync(
      path.join(tree, 'distribution.json'),
      `${JSON.stringify({ ...dist, checksums, artifactHash }, null, 2)}\n`
    )

    const after = new Map(walk(tree).map((f) => [f, fileSha(path.join(tree, f))]))
    const changedFiles = [...after.keys()].filter((f) => before.get(f) !== after.get(f)).sort()
    const allowed = new Set(['distribution.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'Dockerfile'])
    for (const b of bumped) allowed.add(b.file)
    for (const r of restated) allowed.add(r.file)
    for (const f of changedFiles)
      if (!allowed.has(f) && !f.startsWith('patches/')) throw new Error(`unexpected change in the zip: ${f}`)
    const leftOld = versionHits(tree, old).map((h) => ({ ...h, reason: hitReason(h) }))

    // ── assets ───────────────────────────────────────────────────────────────────────────────
    mkdirSync(out, { recursive: true })
    // 🔒 THE SAME INPUT CUTS THE SAME BYTES. The zip's sha256 is pinned elsewhere (the where map, the fleet's
    // quickstarts.json), so a re-cut must not move it: what this cut wrote is dated PATCH_TIME, every other entry gets
    // back the published zip's own time, and both directions read DOS times in UTC.
    const wrote = new Set([...changedFiles, 'patches'])
    for (const [f, t] of published) if (!wrote.has(f)) utimesSync(path.join(tree, f), t, t)
    for (const f of wrote) utimesSync(path.join(tree, f), PATCH_TIME, PATCH_TIME)
    run('zip', ['-q', '-r', '-X', path.join(out, zipName), '.'], { cwd: tree, env: UTC })
    copyFileSync(path.join(from, manifest.state.file), path.join(out, stateName))
    if (hasKit)
      writeKit({
        kit: path.join(from, kitFrom),
        out: path.join(out, kitTo),
        newJson: readFileSync(kitJson(to)),
        rewrite: kitPlan?.rewritten === true,
        work: path.join(work, 'kit-entry')
      })
    const asset = (/** @type {string} */ name) => ({
      file: name,
      bytes: readFileSync(path.join(out, name)).length,
      sha256: fileSha(path.join(out, name))
    })
    const z = asset(zipName)
    const s = asset(stateName)
    if (s.sha256 !== manifest.state.sha256) throw new Error('the copied state is not the published bytes')

    // what the state tarball says of the version (nothing a restore compares; reported, not changed)
    const stateDir = path.join(work, 'state')
    mkdirSync(stateDir)
    const stateList = run('tar', ['-tzf', path.join(out, stateName)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    const small = stateList.filter((f) => /^(?:\.\/)?data\/[^/]+\.json$/.test(f))
    if (small.length > 0) run('tar', ['-xzf', path.join(out, stateName), '-C', stateDir, ...small])
    const stateHits = small.flatMap((f) =>
      readFileSync(path.join(stateDir, f), 'utf8')
        .split('\n')
        .map((line, i) => ({ file: f, line: i + 1, text: line.trim().slice(0, 200) }))
        .filter((h) => new RegExp(`(?<![\\d.])${esc(old)}(?![\\d]|\\.\\d)`).test(h.text))
    )

    // ── manifest, verification, notes, setting, sums ─────────────────────────────────────────
    const patchRelease = {
      of: old,
      advisory,
      reason: `security patch release of ${old}: pnpm patches for ${Object.keys(patches).join(', ')} (${advisory}); no content, design or state change`,
      changed: changedFiles,
      state: `the ${old} state tarball, byte for byte`,
      gates: `the gates and receipts are ${old}'s as published (${gatesFrom.pass.length} pass, ${gatesFrom.pending.length} pending); the release chain was not rerun`
    }
    const next = {
      ...manifest,
      version: to,
      artifact: zipName,
      file: manifest.file === undefined ? undefined : zipName,
      bytes: z.bytes,
      sha256: z.sha256,
      templateVersion: manifest.templateVersion === old ? to : manifest.templateVersion,
      template: { ...manifest.template, artifactHash, files: Object.keys(checksums).length },
      state: { ...manifest.state, file: stateName, bytes: s.bytes, sha256: s.sha256 },
      patchRelease
    }
    const write = (/** @type {string} */ name, /** @type {string} */ text) =>
      writeFileSync(path.join(out, name), text)
    write('manifest.json', `${JSON.stringify(next, null, 2)}\n`)
    const verification = JSON.parse(read('VERIFICATION.json'))
    write(
      'VERIFICATION.json',
      `${JSON.stringify({ ...verification, version: to, artifactHash, patchRelease }, null, 2)}\n`
    )
    const notes = notesFor(read('README.md'), {
      manifest,
      old,
      to,
      zipName,
      stateName,
      z,
      s,
      patches,
      advisory
    })
    write('README.md', notes.text)

    const nextSetting = {
      ...setting,
      version: to,
      install: {
        ...setting.install,
        source: { ...setting.install.source, file: zipName, sha256: z.sha256 },
        state: { ...setting.install.state, file: stateName, sha256: s.sha256 }
      }
    }
    if (setting.schemaVersion !== SETTING_SCHEMA)
      throw new Error(`tracy_setting.json is ${setting.schemaVersion}, not ${SETTING_SCHEMA}`)
    const sumNames = sums.map(([f]) =>
      f === manifest.artifact ? zipName : f === manifest.state.file ? stateName : f
    )
    const problems = validateSetting(structuredClone(nextSetting), { assets: sumNames })
    if (problems.length > 0)
      throw new Error(`tracy_setting.json would be refused:\n  - ${problems.join('\n  - ')}`)
    write('tracy_setting.json', `${JSON.stringify(nextSetting, null, 2)}\n`)

    const upload = new Set([
      'manifest.json',
      'VERIFICATION.json',
      'README.md',
      'tracy_setting.json',
      zipName,
      stateName
    ])
    const lines = sumNames.map((f) => `${fileSha(path.join(upload.has(f) ? out : from, f))}  ${f}`)
    write('SHA256SUMS', `${lines.join('\n')}\n`)
    for (const f of readdirSync(out))
      if (f.endsWith('.md') || f.endsWith('.json'))
        if (readFileSync(path.join(out, f), 'utf8').includes('{{'))
          throw new Error(`${f} carries an unfilled {{ }}`)

    const report = {
      product,
      tag: manifest.release,
      from: old,
      version: to,
      advisory,
      upload: [...readdirSync(out)].sort().map((f) => ({ file: f, sha256: fileSha(path.join(out, f)) })),
      untouched: sumNames.filter((f) => !upload.has(f) && f !== 'SHA256SUMS'),
      kit: hasKit
        ? {
            from: kitFrom,
            to: kitTo,
            sha256: fileSha(path.join(out, kitTo)),
            templateKitJson: kitPlan?.rewritten
              ? `rewritten with contracts/${to}/template-kit.json (every other entry kept)`
              : `contracts/${old} and contracts/${to} carry the same template-kit.json; copied as is`
          }
        : null,
      gates: gatesFrom,
      artifactHash: { from: dist.artifactHash, to: artifactHash },
      patches,
      zipChanged: changedFiles,
      versionFields: bumped,
      shaStatements: restated,
      oldVersionLeftInZip: leftOld,
      oldVersionInState: stateHits,
      oldVersionInNotes: notes.left
    }
    const reportFile = path.resolve(o.report ?? `${out}.report.json`)
    writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`)
    return report
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * The gates the published release recorded, refused unless each is `pass` or `pending`, `VERIFICATION.json` says
 * what `manifest.json` says, its `report.status` is what the gates add up to, and every receipt states its gate. A patch release re-labels a version as it was published; it never carries a failed gate.
 * `pending` stays allowed because three of the five published EmDash releases (Base 0.5.6, Business 1.7.23, SaaS
 * 1.4.14) were published with the browser and review gates pending, and their report status pending.
 * @returns {{ pass: string[], pending: string[] }}
 */
export function verificationGates(verification, manifest, old) {
  if (verification?.version !== old)
    throw new Error(`VERIFICATION.json is ${verification?.version}, the manifest ${old}`)
  const gates = verification.gates
  if (!gates || typeof gates !== 'object' || Array.isArray(gates))
    throw new Error('VERIFICATION.json has no gates')
  const status = Object.fromEntries(
    Object.entries(gates).map(([k, g]) => [k, typeof g === 'string' ? g : g?.status])
  )
  const bad = Object.entries(status).filter(([, s]) => s !== 'pass' && s !== 'pending')
  if (bad.length > 0)
    throw new Error(
      `VERIFICATION.json: gate ${bad.map(([k, s]) => `${k} is ${s}`).join(', ')}; only a release that passed is re-labelled`
    )
  const said = manifest.gates ?? {}
  if (JSON.stringify(Object.entries(status).sort()) !== JSON.stringify(Object.entries(said).sort()))
    throw new Error('VERIFICATION.json and manifest.json disagree on the gates')
  const of = (/** @type {string} */ s) => Object.keys(status).filter((k) => status[k] === s)
  // The aggregate the release step wrote (`report.status`, tools/release.mjs) must be what the gates add up to: `pass`
  // when every gate passed, `pending` when one is pending. Anything else (`fail`, missing, a pass over a pending gate)
  // is a release that did not pass as published.
  const aggregate = verification.report?.status
  const adds = of('pending').length > 0 ? 'pending' : 'pass'
  if (aggregate !== adds)
    throw new Error(
      `VERIFICATION.json: report.status is ${aggregate}, its gates add up to ${adds}; only a release that passed is re-labelled`
    )
  // A receipt (manifest.json) restates its gate's status: held to the same rule.
  for (const [k, r] of Object.entries(manifest.receipts ?? {}))
    if (r?.status !== status[k])
      throw new Error(`manifest.json: the receipt of ${k} says ${r?.status}, the gate ${status[k]}`)
  return { pass: of('pass'), pending: of('pending') }
}

/** `[name, CRC-32]` of every entry of a zip, as `unzip -lv` lists them; throws when it is not a zip. */
function zipEntries(zip, label) {
  let text
  try {
    text = run('unzip', ['-lv', zip], { encoding: 'utf8' })
  } catch {
    throw new Error(`${label} is not a zip`)
  }
  const rows = text
    .split('\n')
    .map((l) => /^\s*\d+\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+([0-9a-f]{8})\s+(.+)$/.exec(l))
    .filter((m) => m !== null)
  return rows.map((m) => [m[2], m[1]])
}

/**
 * The published kit, checked: a zip with exactly one `template-kit.json`, byte-identical to `contracts/<old>/`'s (the
 * kit rule of ops-demo-sync), whose every image `contracts/<new>/template-kit.json` lists is there with its sha256 (what
 * the site planner checks). `rewritten` says whether the new contract's json differs and so has to replace that entry.
 * @param {{ kit: string, name: string, oldJson: Buffer, newJson: Buffer, work: string }} o
 */
export function checkKit(o) {
  const entries = zipEntries(o.kit, o.name)
  const jsons = entries.filter(([n]) => n === 'template-kit.json')
  if (jsons.length !== 1) throw new Error(`${o.name} has ${jsons.length} template-kit.json entries, not one`)
  if (!run('unzip', ['-p', o.kit, 'template-kit.json']).equals(o.oldJson))
    throw new Error(`${o.name}: its template-kit.json is not the contract's, byte for byte`)
  mkdirSync(o.work, { recursive: true })
  run('unzip', ['-q', o.kit, '-d', o.work])
  const images = JSON.parse(o.newJson.toString('utf8')).images ?? []
  for (const image of images) {
    const p = path.join(o.work, image.path)
    if (!existsSync(p) || fileSha(p) !== String(image.sha256).toLowerCase())
      throw new Error(`${o.name}: image ${image.path} is missing or not the bytes the kit lists`)
  }
  return { rewritten: !o.oldJson.equals(o.newJson) }
}

/**
 * The kit under its new name: the same bytes, or (`rewrite`) the same zip with only `template-kit.json` replaced by the
 * new contract's, dated 2020-01-01 like every entry the kit pack writes. Checked after writing: the same entries, every
 * other entry's CRC unchanged, and the json the new contract's.
 * @param {{ kit: string, out: string, newJson: Buffer, rewrite: boolean, work: string }} o
 */
export function writeKit(o) {
  copyFileSync(o.kit, o.out)
  if (!o.rewrite) return
  mkdirSync(o.work, { recursive: true })
  const entry = path.join(o.work, 'template-kit.json')
  writeFileSync(entry, o.newJson)
  utimesSync(entry, PATCH_TIME, PATCH_TIME)
  run('zip', ['-q', '-X', o.out, 'template-kit.json'], { cwd: o.work, env: UTC })
  const was = new Map(zipEntries(o.kit, 'the published kit'))
  const now = new Map(zipEntries(o.out, 'the new kit'))
  if (was.size !== now.size || [...was.keys()].some((n) => !now.has(n)))
    throw new Error('the new kit does not hold the same entries as the published one')
  for (const [n, crc] of was)
    if (n !== 'template-kit.json' && now.get(n) !== crc) throw new Error(`the new kit changed ${n}`)
  if (!run('unzip', ['-p', o.out, 'template-kit.json']).equals(o.newJson))
    throw new Error("the new kit's template-kit.json is not the new contract's")
}

/** The published notes with the new version's heading, a security paragraph, and the new file names and sums. */
export function notesFor(published, { manifest, old, to, zipName, stateName, z, s, patches, advisory }) {
  let text = published
    .split(manifest.artifact)
    .join(zipName)
    .split(manifest.state.file)
    .join(stateName)
    .split(manifest.sha256)
    .join(z.sha256)
    .split(`| ${manifest.bytes} |`)
    .join(`| ${z.bytes} |`)
    .split(manifest.state.sha256)
    .join(s.sha256)
    // the image tag of the Install block: `docker build -t <product>-emdash:<version> .`
    .split(`${manifest.product}-emdash:${old}`)
    .join(`${manifest.product}-emdash:${to}`)
  const head = /^## (.+?) (\S+) for EmDash (.+)$/m.exec(text)
  if (!head || head[2] !== old)
    throw new Error(`README.md has no "## <label> ${old} for EmDash <cms>" heading`)
  const security = [
    '',
    `**Security patch release of ${old}** (${advisory}, picomatch ReDoS). The only change from ${old} is the pnpm patch`,
    `of ${Object.keys(patches).join(' and ')} (\`patches/\`, \`patchedDependencies\` in \`pnpm-workspace.yaml\` and the`,
    `lockfile, \`COPY patches\` in the Dockerfile) and the version: content, design and the state snapshot are byte for`,
    `byte the ${old} ones, and the gates in \`VERIFICATION.json\` are ${old}'s as published.`
  ].join('\n')
  text = text.replace(head[0], `## ${head[1]} ${to} for EmDash ${head[3]}\n${security}`)
  // Any other mention of the old version is the publisher's to read: it is reported, never guessed at.
  const left = text
    .replace(security, '')
    .split('\n')
    .filter((line) => new RegExp(`(?<![\\d.])${esc(old)}(?![\\d]|\\.\\d)`).test(line))
  return { text, left }
}

function args(argv) {
  /** @type {Record<string, string>} */
  const o = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad argument ${argv[i]}`)
    o[argv[i].slice(2)] = argv[i + 1]
  }
  return o
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const a = args(process.argv.slice(2))
    if (!a.from || !a.version || !a.out)
      throw new Error(
        'usage: emdash-patch-release.mjs --from <dir> --version <new> --out <new-dir> [--theme-dir d] [--patches d] [--report f]'
      )
    const r = cut({
      from: a.from,
      version: a.version,
      out: a.out,
      themeDir: a['theme-dir'],
      patchesDir: a.patches,
      advisory: a.advisory,
      report: a.report
    })
    console.log(
      JSON.stringify(
        {
          product: r.product,
          from: r.from,
          version: r.version,
          artifactHash: r.artifactHash,
          upload: r.upload,
          untouched: r.untouched,
          oldVersionLeftInZip: r.oldVersionLeftInZip.length,
          oldVersionInState: r.oldVersionInState.length
        },
        null,
        2
      )
    )
  } catch (error) {
    console.error(`!! ${error.message}`)
    process.exitCode = 1
  }
}
