#!/usr/bin/env node
/**
 * Every repo-side artifact of a WordPress quickstart PATCH release (1.0.0 → 1.0.1), in one command, from the
 * release folder and the previous version's dossier.
 *
 * WHY: each patch took four to five hours of hand steps (`docs/references/quickstart-release.md`, "Every new
 * Joomla/WordPress version needs TWO things"), and every step is one /ops checks: STAB-1 wants a dossier cut from the
 * archive itself, STAB-6 a lock of the shipped theme bytes, REL-3/FAV-1/LOGO-1..3 an exact profile row, the
 * Design system step a measurement of the exact version. This script does the steps; it weakens none of the
 * checks: anything it cannot prove from the release or from a measurement on a stand, it stops on.
 *
 *   node packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs \
 *     --release-dir <folder with SHA256SUMS, manifest.json, the archives, the theme zip> \
 *     --previous <slug>/wp7/<previous version> [--previous-release-dir <folder>] \
 *     [--accept-content-change] [--no-measure] [--check]
 *
 * What it writes:
 *   contracts/<slug>/wp7/<v>/  manifest.json (the previous one, id/version/parts from SHA256SUMS and the release's
 *                              own manifest), content-map.json (carried, image slots re-captured from the dump:
 *                              `capture-image-slots.mjs`), inventory.json + presentation-lock.json
 *                              (`capture-inventory.mjs`), editions.json, demo-trim-map.json, superseded.json
 *                              (`scripts/build-wordpress-{editions,demo-trim,superseded}.mjs`), patch-evidence.json
 *   contracts/<slug>/wp7/<v>.copy.json, <v>.design.json   carried from the previous version, byte for byte
 *   the slot contract's maxVersion, moved to the theme's Version only when CSS-1 and CSS-2 pass on the release
 *   design-system-measurement.json  carried (`inheritedFrom`) ONLY when both presentation locks hold the same theme
 *                              (so the same slot contract), the content maps are the same bytes and maxVersion did not
 *                              move; otherwise measured (`release-measure.mjs`)
 *   apps/tracy-web/src/lib/template-profiles.json  the previous row, ONLY when the brand facts measured on both
 *                              releases (`brand-facts.json`, `release-measure.mjs`) are equal
 *
 * It stops (exit 1, nothing written) when the content map or the image slots differ from the previous version's
 * (unless --accept-content-change), when the brand facts differ, when CSS-1/CSS-2 fail on a theme past maxVersion,
 * or when a measurement is missing and --no-measure was given (it then prints the command to run).
 * Missing measurements are otherwise taken by `release-measure.mjs` on a stand of the release (several templates:
 * run `release-measure.mjs --jobs 2` once for all of them first). --check regenerates in a scratch tree and
 * exits 1 when any committed byte differs. --previous-release-dir: the previous release's folder, to measure its
 * brand facts when it has none stored, and to print the classified diff of the whole webroot.
 *
 * 🔒 THE EVIDENCE HOLDS NOTHING THE GATE CANNOT RECOMPUTE. Every hash in `patch-evidence.json` is of a file committed
 * for one of the two versions (manifest parts, locks, content maps, brand facts, the profile row), and
 * `scripts/check-contracts.ts` hashes those files again; the theme zip and the slot contract file, whose bytes are
 * not committed per version, are not hashed at all: the theme is compared through both locks.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BRAND_FACTS_FILE,
  brandFactDifferences,
  brandFactsProblem,
  themeFilesHash
} from '../../../design/tracy-ds-slot/src/brand-facts.mjs'
import { inheritanceProblem } from '../../../design/tracy-ds-slot/src/measurement.mjs'
import {
  canonical,
  compareVersions,
  EVIDENCE_COMMENT,
  EVIDENCE_FILE,
  EVIDENCE_SCHEMA,
  inheritanceProofAt,
  rowFacts,
  slotContractFileOf,
  themeFilesDiff,
  themeOf
} from '../../../../apps/tracy-web/src/lib/template-design-system-readiness/readers/measurement-inheritance.js'

// shared with /ops and the contracts gate (one definition each), named here for the scripts and tests that import them
export { canonical, compareVersions, EVIDENCE_FILE, EVIDENCE_SCHEMA, rowFacts, themeFilesDiff }

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../../..')
const MEASUREMENT_FILE = 'design-system-measurement.json'
/** The dossier files this script cuts (the measurement and brand facts come from a stand). */
export const DOSSIER_FILES = Object.freeze([
  'manifest.json',
  'content-map.json',
  'presentation-lock.json',
  'inventory.json',
  'editions.json',
  'demo-trim-map.json',
  'superseded.json',
  EVIDENCE_FILE
])

const sha256 = (/** @type {string | Buffer} */ data) => createHash('sha256').update(data).digest('hex')
const shaOfFile = (/** @type {string} */ f) => sha256(readFileSync(f))
const json = (/** @type {unknown} */ v) => JSON.stringify(v, null, 2) + '\n'
const readJson = (/** @type {string} */ f) => JSON.parse(readFileSync(f, 'utf8'))
const readJsonOr = (/** @type {string} */ f, /** @type {any} */ or = null) =>
  existsSync(f) ? readJson(f) : or

/** `SHA256SUMS` → file → sha256. */
export const sumsOf = (/** @type {string} */ text) =>
  Object.fromEntries(
    text
      .split('\n')
      .map((l) => /^([0-9a-f]{64})\s+\*?(.+)$/.exec(l.trim()))
      .filter(Boolean)
      .map((m) => [/** @type {RegExpExecArray} */ (m)[2], /** @type {RegExpExecArray} */ (m)[1]])
  )

/**
 * The new dossier's manifest: the previous one with its id, version and parts moved to the release. What the
 * release's own `manifest.json` says about the runtime (WordPress, PHP, prefix, placeholder) is taken from it.
 * @param {any} previous the previous dossier's manifest.json
 * @param {{ version: string, wpVersion?: string, phpVersion?: string, prefix?: string, placeholderUrl?: string, theme?: { name?: string } }} release
 * @param {{ webroot: { file: string, bytes: number, sha256: string }, database: { file: string, bytes: number, sha256: string } }} parts
 */
export function manifestFor(previous, release, parts) {
  const out = structuredClone(previous)
  const [slug, line] = String(previous.id).split('/')
  out.id = `${slug}/${line}/${release.version}`
  const q = out.quickstart
  q.version = release.version
  if (release.wpVersion) q.platformVersion = release.wpVersion
  if (release.phpVersion) q.phpVersion = release.phpVersion
  if (release.prefix) q.tablePrefix = release.prefix
  if (release.placeholderUrl) q.placeholderUrl = release.placeholderUrl
  for (const kind of /** @type {const} */ (['webroot', 'database'])) {
    const before = q.parts?.[kind] ?? {}
    const url = typeof before.url === 'string' ? before.url.replace(/[^/]+$/, parts[kind].file) : undefined
    q.parts[kind] = {
      file: parts[kind].file,
      bytes: parts[kind].bytes,
      sha256: parts[kind].sha256,
      ...(url ? { url } : {})
    }
  }
  return out
}

/** Which part of a WordPress webroot a path is (`wp-content/themes/<theme>/…` is the theme). */
export function areaOf(/** @type {string} */ file, /** @type {string} */ theme) {
  const f = file.replace(/^\.\//, '')
  if (f.startsWith(`wp-content/themes/${theme}/`)) return 'theme'
  if (f.startsWith('wp-content/themes/')) return 'otherThemes'
  if (f.startsWith('wp-content/plugins/') || f.startsWith('wp-content/mu-plugins/')) return 'plugins'
  if (f.startsWith('wp-content/uploads/')) return 'uploads'
  if (f.startsWith('wp-admin/') || f.startsWith('wp-includes/') || /^wp-[a-z-]+\.php$/.test(f)) return 'core'
  return 'other'
}

/** Two webroot listings (path → size) classified by area: added, removed, resized per area. */
export function classifyListing(
  /** @type {Record<string, number>} */ before,
  /** @type {Record<string, number>} */ after,
  /** @type {string} */ theme
) {
  /** @type {Record<string, { added: string[], removed: string[], resized: string[] }>} */
  const out = {}
  const at = (/** @type {string} */ f) => (out[areaOf(f, theme)] ??= { added: [], removed: [], resized: [] })
  for (const f of Object.keys(after).sort())
    if (!(f in before)) at(f).added.push(f)
    else if (before[f] !== after[f]) at(f).resized.push(f)
  for (const f of Object.keys(before).sort()) if (!(f in after)) at(f).removed.push(f)
  return out
}

/** Row fields the brand facts measure (`logoHeight` is the `heightHeld` rule): equal facts carry them. */
export const MEASURED_ROW_FIELDS = Object.freeze([
  'logos',
  'brandReady',
  'faviconReady',
  'darkLogo',
  'nameFallback',
  'frame',
  'logoHeight'
])
/** Row fields that describe the theme's own files: carried only when the theme is the same bytes. */
export const THEME_ROW_FIELDS = Object.freeze(['framework', 'profiles', 'darkSpots'])

/**
 * Why a row field the brand facts do not measure cannot be carried, or null.
 * @param {string} field @param {any} value
 * @param {{ themeSame: boolean, contentMapBefore: any, contentMapAfter: any }} carry
 */
export function carryProblem(field, value, carry) {
  if (MEASURED_ROW_FIELDS.includes(field) || field === 'note') return null
  if (THEME_ROW_FIELDS.includes(field))
    return carry.themeSame
      ? null
      : `${field}: the theme is not the same bytes as the previous version's (the theme files of the two presentation locks), so ${field} must be checked and written by hand`
  if (field === 'footerSlot') {
    const entry = (/** @type {any} */ map) =>
      JSON.stringify((map?.slots ?? []).filter((/** @type {any} */ x) => x?.key === value))
    const before = entry(carry.contentMapBefore)
    if (before === '[]' || before !== entry(carry.contentMapAfter))
      return `footerSlot: the slot ${value} is not the same entry in both content maps, so footerSlot must be checked and written by hand`
    return null
  }
  if (field === 'unverified')
    return 'unverified: the previous row lists fields research could not prove; check them on this release and write the row by hand'
  return `${field}: not a field patch-artifacts.mjs knows how to prove; write the row by hand`
}

/**
 * The profile row of the new version: the previous row, each field carried only on proof (the measured brand facts
 * equal on both releases; the theme or the footer slot unchanged for the fields that describe them), with a note
 * that says where it came from and why; or the reasons it cannot be carried, each naming its field.
 * @param {{ from: string, themeSame: boolean, contentMapBefore: any, contentMapAfter: any }} carry
 * @returns {{ row: any, problems: string[] }}
 */
export function rowFor(
  /** @type {any} */ previousRow,
  /** @type {any} */ previousFacts,
  /** @type {any} */ facts,
  /** @type {string} */ id,
  carry
) {
  if (!previousRow)
    return { row: null, problems: [`template-profiles.json has no row for the previous version of ${id}`] }
  if (!previousFacts || !facts)
    return {
      row: null,
      problems: [`${!previousFacts ? 'the previous version' : id} has no ${BRAND_FACTS_FILE} of its own`]
    }
  const problems = brandFactDifferences(previousFacts, facts)
  for (const [field, value] of Object.entries(previousRow)) {
    const why = carryProblem(field, value, carry)
    if (why) problems.push(why)
  }
  if (problems.length) return { row: null, problems }
  const { note: _note, ...rest } = previousRow
  const f = facts.facts
  const row = {
    ...rest,
    note: `Carried from ${carry.from} by patch-artifacts.mjs: the brand facts measured on both releases are equal (brand-facts.json of each: ${f.logos} logos, ${f.spots.length} spot(s), frame ${f.frame ? `${f.frame.width} x ${f.frame.height}` : 'none'}, favicon ${f.faviconReady ? 'shown' : 'not shown'})${carry.themeSame ? ' and the theme is the same bytes' : ''}; evidence in contracts/${id}/${EVIDENCE_FILE}.`
  }
  return { row, problems: [] }
}

/**
 * `template-profiles.json` with `row` as `<release>` › `<version>`, written right after the `<previous>` row, the
 * rest of the file byte for byte. A row already there is replaced.
 */
export function withRow(
  /** @type {string} */ text,
  /** @type {string} */ release,
  /** @type {string} */ previous,
  /** @type {string} */ version,
  /** @type {any} */ row
) {
  const lines = text.split('\n')
  const start = lines.indexOf(`    ${JSON.stringify(release)}: {`)
  if (start === -1) throw new Error(`template-profiles.json: no release ${release}`)
  let end = start + 1
  while (end < lines.length && !/^ {4}\}/.test(lines[end])) end++
  /** The [first, last] line of a version row inside the release block, or null. */
  const rowAt = (/** @type {string} */ v) => {
    const first = lines.findIndex((l, i) => i > start && i < end && l === `      ${JSON.stringify(v)}: {`)
    if (first === -1) return null
    let last = first + 1
    while (!/^ {6}\}/.test(lines[last])) last++
    return [first, last]
  }
  const body = JSON.stringify(row, null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : `      ${l}`))
  const existing = rowAt(version)
  if (existing) {
    const comma = lines[existing[1]].endsWith(',') ? ',' : ''
    const block = [`      ${JSON.stringify(version)}: ${body[0]}`, ...body.slice(1)]
    block[block.length - 1] += comma
    lines.splice(existing[0], existing[1] - existing[0] + 1, ...block)
    return lines.join('\n')
  }
  const prev = rowAt(previous)
  if (!prev) throw new Error(`template-profiles.json: no row ${release} ${previous}`)
  const last = prev[1]
  const comma = lines[last].endsWith(',')
  if (!comma) lines[last] += ','
  const block = [`      ${JSON.stringify(version)}: ${body[0]}`, ...body.slice(1)]
  if (comma) block[block.length - 1] += ','
  lines.splice(last + 1, 0, ...block)
  return lines.join('\n')
}

/** The slot contract's text with `maxVersion[theme]` moved to `version` and a dated line added to its note. */
export function withMaxVersion(
  /** @type {string} */ text,
  /** @type {string} */ theme,
  /** @type {string} */ version,
  /** @type {string} */ note
) {
  const doc = JSON.parse(text)
  if (!doc.maxVersion || !(theme in doc.maxVersion))
    throw new Error(`the slot contract has no maxVersion for ${theme}`)
  const key = new RegExp(
    `("maxVersion":\\s*\\{[^}]*${JSON.stringify(theme).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*)"[^"]*"`
  )
  if (!key.test(text)) throw new Error(`maxVersion of ${theme} not found as text`)
  let out = text.replace(key, `$1${JSON.stringify(version)}`)
  if (typeof doc.maxVersionNote === 'string') {
    const old = JSON.stringify(doc.maxVersionNote)
    out = out.replace(
      `"maxVersionNote": ${old}`,
      `"maxVersionNote": ${JSON.stringify(`${doc.maxVersionNote} ${note}`)}`
    )
  }
  return out
}

/** The design-system measurement of the previous version, carried to `version` with `inheritedFrom` = that version. */
export function inheritedMeasurement(/** @type {any} */ previous, /** @type {string} */ version) {
  /** @type {Record<string, any>} */
  const out = {}
  for (const [k, v] of Object.entries(previous)) {
    if (k === 'inheritedFrom') continue
    out[k] = k === 'version' ? version : v
    // the link before this one, never the root: each link of a chain is proven by its own evidence
    if (k === 'version') out.inheritedFrom = previous.version
  }
  return out
}

/** The theme's `Version:` header in a style.css text, or null. */
export const themeVersionOf = (/** @type {string} */ css) =>
  /^[ \t/*#@]*Version:[ \t]*([^\r\n]+)/im.exec(css.slice(0, 4096))?.[1].trim() ?? null

/** One child tool; its output is shown only when it fails. */
function tool(
  /** @type {string} */ script,
  /** @type {string[]} */ argv,
  /** @type {Record<string, string>} */ env = {}
) {
  const r = spawnSync(process.execPath, [script, ...argv], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024
  })
  if (r.status !== 0)
    throw new Error(
      `${path.relative(ROOT, script)} exited ${r.status}:\n${(r.stderr || r.stdout).trim().split('\n').slice(-15).join('\n')}`
    )
  return r.stdout
}

/** path → size of every file in a .tar.gz (GNU and BSD tar listings both end in the size, date, name). */
function listing(/** @type {string} */ tar) {
  /** @type {Record<string, number>} */
  const out = {}
  const text = execFileSync('tar', ['-tvzf', tar], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  for (const line of text.split('\n')) {
    if (!line.startsWith('-')) continue
    const m = /^\S+\s+\S+\s+\S+\s+(?:\S+\s+)?(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(line)
    if (m) out[m[2].replace(/^\.\//, '')] = Number(m[1])
  }
  return out
}

function parse(/** @type {string[]} */ argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const next = argv[i + 1]
    out[a.slice(2)] = next === undefined || next.startsWith('--') ? true : (i++, next)
  }
  return out
}

/** Every artifact of the patch, built in `scratch`; returns what goes where, or throws with the reasons. */
export function build(/** @type {any} */ o) {
  const contracts = path.resolve(
    o.contractsRoot ?? path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')
  )
  const profilesFile = path.resolve(
    o.profiles ?? path.join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json')
  )
  const slotDir = path.resolve(o.slotTemplates ?? path.join(ROOT, 'packages/design/tracy-ds-slot/templates'))
  const releaseDir = path.resolve(o.releaseDir)
  const [slug, line, v0] = String(o.previous).split('/')
  if (!slug || !/^wp\d+$/.test(line ?? '') || !/^\d+\.\d+\.\d+$/.test(v0 ?? ''))
    throw new Error(`--previous ${o.previous}: <slug>/wp<n>/<x.y.z>`)
  const previousDir = path.join(contracts, slug, line, v0)
  const previousManifest = readJson(path.join(previousDir, 'manifest.json'))
  const tag = previousManifest.quickstart.release
  const theme = previousManifest.theme

  // ---------- the release: its own manifest, sums, and the archives they name ----------
  const release = readJson(path.join(releaseDir, 'manifest.json'))
  const version = release.version
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`${releaseDir}/manifest.json names no version`)
  if (compareVersions(version, v0) <= 0) throw new Error(`the release is ${version}, not past ${v0}`)
  if (release.theme?.name && release.theme.name !== theme)
    throw new Error(`the release's theme is ${release.theme.name}, the previous dossier's ${theme}`)
  const sums = sumsOf(readFileSync(path.join(releaseDir, 'SHA256SUMS'), 'utf8'))
  const named = (/** @type {RegExp} */ re, /** @type {string} */ what) => {
    const f = Object.keys(sums).filter((n) => re.test(n))
    if (f.length !== 1)
      throw new Error(`SHA256SUMS names ${f.length} ${what} files (${f.join(', ') || 'none'})`)
    const file = path.join(releaseDir, f[0])
    if (!existsSync(file)) throw new Error(`${f[0]} is named by SHA256SUMS but not in the release folder`)
    const sha = shaOfFile(file)
    if (sha !== sums[f[0]]) throw new Error(`${f[0]} is ${sha}, SHA256SUMS says ${sums[f[0]]}`)
    return { file: f[0], bytes: readFileSync(file).length, sha256: sha, at: file }
  }
  const webroot = named(new RegExp(`-webroot-${version.replace(/\./g, '\\.')}\\.tar\\.gz$`), 'webroot')
  const database = named(new RegExp(`-database-${version.replace(/\./g, '\\.')}\\.sql\\.gz$`), 'database')
  const zip = named(new RegExp(`^${theme}-${version.replace(/\./g, '\\.')}\\.zip$`), 'theme zip')
  const id = `${slug}/${line}/${version}`

  const scratch = mkdtempSync(path.join(tmpdir(), 'wp-patch-artifacts-'))
  try {
    const sNew = path.join(scratch, slug, line, version)
    // the whole line, so the shared proof can follow a chain of inherited measurements in the scratch tree
    cpSync(path.join(contracts, slug, line), path.join(scratch, slug, line), {
      recursive: true,
      filter: (f) => path.resolve(f) !== path.resolve(contracts, slug, line, version)
    })
    mkdirSync(sNew, { recursive: true })
    const parts = { webroot, database }
    writeFileSync(path.join(sNew, 'manifest.json'), json(manifestFor(previousManifest, release, parts)))
    for (const f of ['content-map.json', 'presentation-lock.json'])
      copyFileSync(path.join(previousDir, f), path.join(sNew, f))

    // ---------- content map: carried, image slots captured again from the dump; a difference stops ----------
    // the inventory first (the image slots read it), again after them (a slot that moved moves the lock)
    const inventory = () =>
      tool(path.join(HERE, 'capture-inventory.mjs'), [
        '--contract',
        id,
        '--dump',
        database.at,
        '--webroot',
        webroot.at,
        '--contracts-root',
        scratch
      ])
    inventory()
    const capture = path.join(HERE, 'capture-image-slots.mjs')
    tool(capture, ['--contract', id, '--dump', database.at, '--contracts-root', scratch])
    const mapBefore = readFileSync(path.join(previousDir, 'content-map.json'))
    const mapAfter = readFileSync(path.join(sNew, 'content-map.json'))
    const contentChanged = !mapBefore.equals(mapAfter)
    if (contentChanged && !o.acceptContentChange)
      throw new Error(
        `${id}: the content map or its image slots differ from ${v0}'s (${sha256(mapBefore).slice(0, 12)} → ${sha256(mapAfter).slice(0, 12)}); review the change, then run again with --accept-content-change`
      )
    inventory()
    const env = { TRACY_WP_CONTRACTS: scratch }
    tool(path.join(ROOT, 'scripts/build-wordpress-editions.mjs'), ['--contract', id], env)
    tool(path.join(ROOT, 'scripts/build-wordpress-demo-trim.mjs'), ['--contract', id], env)
    tool(path.join(ROOT, 'scripts/build-wordpress-superseded.mjs'), [], env)

    // ---------- the theme: the Version in its zip against the slot contract ----------
    const slotFile = path.join(slotDir, `wordpress-${theme}.json`)
    const slotText = readFileSync(slotFile, 'utf8')
    const themeVersion = themeVersionOf(
      execFileSync('unzip', ['-p', zip.at, `${theme}/style.css`], { encoding: 'utf8' })
    )
    if (!themeVersion) throw new Error(`${zip.file}: no Version header in ${theme}/style.css`)
    const max = JSON.parse(slotText).maxVersion?.[theme] ?? null
    let slotAfter = slotText
    /** @type {any} */
    let bump = null
    if (!max || compareVersions(themeVersion, max) > 0) {
      const out = tool(path.join(ROOT, 'scripts/template-design-system-readiness.mjs'), [
        releaseDir,
        '--tag',
        tag,
        '--only',
        'CSS-1,CSS-2',
        '--json'
      ])
      const results = JSON.parse(out).results ?? []
      const failed = results.filter((/** @type {any} */ r) => r.status !== 'pass')
      if (failed.length || results.length !== 2)
        throw new Error(
          `${theme} ${themeVersion} is past maxVersion ${max}, and CSS-1/CSS-2 do not both pass on the release: ${results.map((/** @type {any} */ r) => `${r.id} ${r.status}: ${r.message}`).join('; ')}`
        )
      slotAfter = withMaxVersion(
        slotText,
        theme,
        themeVersion,
        `${themeVersion}: patch of ${v0} (patch-artifacts.mjs); CSS-1 and CSS-2 pass on the release.`
      )
      bump = { from: max, to: themeVersion }
    }

    // ---------- the webroot against the previous one ----------
    const lockBefore = readJson(path.join(previousDir, 'presentation-lock.json'))
    const lockAfter = readJson(path.join(sNew, 'presentation-lock.json'))
    /** @type {any} */
    const webrootDiff = {
      theme: themeFilesDiff(lockBefore, lockAfter),
      database: database.sha256 === previousManifest.quickstart.parts.database.sha256 ? 'same' : 'changed'
    }
    // the whole webroot is printed, never written into the evidence: the gate has no archive to compare it with
    const areas = o.previousReleaseDir
      ? classifyListing(
          listing(path.join(o.previousReleaseDir, previousManifest.quickstart.parts.webroot.file)),
          listing(webroot.at),
          theme
        )
      : null

    // ---------- measurements: inherited only on proof, else measured on a stand ----------
    // the theme is the same when both locks (cut from each release's own webroot, committed) hold the same theme
    // files and stylesheet: the slot contract the door picks follows from those, so it is the same too
    const themeCarried = themeOf(lockBefore) === themeOf(lockAfter) && !bump
    const contentSame = !contentChanged
    const realNew = path.join(contracts, slug, line, version)
    const previousMeasurement = readJsonOr(path.join(previousDir, MEASUREMENT_FILE))
    // the previous version's numbers are its own, or inherited and proven link by link
    const previousProven =
      !!previousMeasurement &&
      previousMeasurement.version === v0 &&
      (previousMeasurement.inheritedFrom === undefined ||
        inheritanceProofAt(previousDir, { tag, version: v0 }, previousMeasurement.inheritedFrom, {
          selfProblem: inheritanceProblem
        }).problem === null)
    /** @type {any} */
    let measurement = null
    // a measurement of this very version (no inheritedFrom) is never replaced by an inherited one
    const own = readJsonOr(path.join(realNew, MEASUREMENT_FILE))
    const measuredHere = !!own && own.inheritedFrom === undefined
    if (themeCarried && contentSame && previousProven && !measuredHere)
      measurement = inheritedMeasurement(previousMeasurement, version)
    /** The brand facts of a version, or why the file there is not its own measurement. */
    const factsOf = (/** @type {string} */ dir, /** @type {string} */ v, /** @type {any} */ lock) => {
      const doc = readJsonOr(path.join(dir, BRAND_FACTS_FILE))
      const problem = brandFactsProblem(doc, { tag, version: v, lock })
      return problem ? { doc: null, problem } : { doc, problem: null }
    }
    const facts = factsOf(realNew, version, lockAfter)
    const previousFacts = factsOf(previousDir, v0, lockBefore)
    const needs = {
      measure: !measurement && !measuredHere,
      brand: !!facts.problem,
      previousBrand: !!previousFacts.problem
    }

    // ---------- the profile row ----------
    const profilesText = readFileSync(profilesFile, 'utf8')
    const rows = JSON.parse(profilesText).releases?.[tag] ?? {}
    return {
      id,
      slug,
      line,
      v0,
      version,
      tag,
      theme,
      scratch,
      sNew,
      realNew,
      previousDir,
      contracts,
      profilesFile,
      profilesText,
      rows,
      slotFile,
      slotText,
      slotAfter,
      bump,
      zip,
      areas,
      webroot,
      database,
      webrootDiff,
      contentChanged,
      measurement,
      needs,
      facts,
      previousFacts,
      themeCarried,
      lockBefore,
      lockAfter,
      releaseDir,
      previousManifest
    }
  } catch (e) {
    rmSync(scratch, { recursive: true, force: true })
    throw e
  }
}

/** The evidence file: what was compared, as hashes; no timestamps, so --check can compare bytes. */
export function evidenceOf(
  /** @type {any} */ b,
  /** @type {any} */ row,
  /** @type {any} */ facts,
  /** @type {any} */ previousFacts
) {
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    $comment: EVIDENCE_COMMENT,
    contract: b.id,
    tag: b.tag,
    version: b.version,
    previous: `${b.slug}/${b.line}/${b.v0}`,
    archives: {
      webroot: { file: b.webroot.file, bytes: b.webroot.bytes, sha256: b.webroot.sha256 },
      database: { file: b.database.file, bytes: b.database.bytes, sha256: b.database.sha256 }
    },
    slotContract: { file: slotContractFileOf(b.theme), maxVersion: b.bump },
    themeFiles: {
      sha256: themeFilesHash(b.lockAfter.files),
      previousSha256: themeFilesHash(b.lockBefore.files)
    },
    presentationLock: {
      sha256: shaOfFile(path.join(b.sNew, 'presentation-lock.json')),
      previousSha256: shaOfFile(path.join(b.previousDir, 'presentation-lock.json'))
    },
    contentMap: {
      sha256: shaOfFile(path.join(b.sNew, 'content-map.json')),
      previousSha256: shaOfFile(path.join(b.previousDir, 'content-map.json')),
      changeAccepted: b.contentChanged
    },
    webrootDiff: b.webrootDiff,
    brandFacts: {
      sha256: sha256(canonical(facts.facts)),
      previousSha256: sha256(canonical(previousFacts.facts))
    },
    profileRow: sha256(canonical(rowFacts(row))),
    measurement: b.measurement ? 'inherited' : 'own'
  }
}

/** The release-measure.mjs command lines a patch still needs. */
export function measureCommands(/** @type {any} */ b, /** @type {string | null} */ previousReleaseDir) {
  const script = 'packages/design/tracy-ds-slot/scripts/release-measure.mjs'
  const full = []
  const brand = []
  const self = `${b.tag}@${b.version}=${b.releaseDir}`
  if (b.needs.measure) full.push(self)
  else if (b.needs.brand) brand.push(self)
  if (b.needs.previousBrand)
    brand.push(previousReleaseDir ? `${b.tag}@${b.v0}=${previousReleaseDir}` : `${b.tag}@${b.v0}`)
  return [
    ...(full.length ? [['node', script, '--jobs', '2', ...full]] : []),
    ...(brand.length ? [['node', script, '--brand-only', '--jobs', '2', ...brand]] : [])
  ]
}

/**
 * The command; resolves to its exit code. Every path out, failures included, removes the scratch tree (`build`
 * removes it itself when it throws). `deps.build` lets the test give a build of its own.
 * @param {string[]} argv @param {{ build?: typeof build }} [deps]
 */
export async function run(argv, { build: buildOf = build } = {}) {
  const args = parse(argv)
  if (typeof args['release-dir'] !== 'string' || typeof args.previous !== 'string') {
    console.error(
      'usage: patch-artifacts.mjs --release-dir <dir> --previous <slug>/wp<n>/<x.y.z> [--previous-release-dir <dir>] [--accept-content-change] [--no-measure] [--check]'
    )
    return 2
  }
  const check = args.check === true
  const opts = {
    releaseDir: args['release-dir'],
    previous: args.previous,
    previousReleaseDir:
      typeof args['previous-release-dir'] === 'string' ? path.resolve(args['previous-release-dir']) : null,
    acceptContentChange: args['accept-content-change'] === true,
    contractsRoot: typeof args['contracts-root'] === 'string' ? args['contracts-root'] : undefined,
    profiles: typeof args.profiles === 'string' ? args.profiles : undefined,
    slotTemplates: typeof args['slot-templates'] === 'string' ? args['slot-templates'] : undefined
  }
  // --check: the slot contract may already carry this patch's maxVersion; the move is the one the committed
  // evidence recorded (it cannot be read back from a file the patch itself moved)
  const committed = (() => {
    const [slug, line] = String(opts.previous).split('/')
    const rel = readJsonOr(path.join(path.resolve(opts.releaseDir), 'manifest.json'))
    const root = path.resolve(
      opts.contractsRoot ?? path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')
    )
    return rel ? readJsonOr(path.join(root, slug, line, rel.version, EVIDENCE_FILE)) : null
  })()
  let b = buildOf(opts)
  try {
    // --check after the patch moved maxVersion: the move is the committed one (the file already carries it)
    if (check && !b.bump && committed?.slotContract?.maxVersion) b.bump = committed.slotContract.maxVersion
    // ---------- measurements a stand still has to take ----------
    const commands = measureCommands(b, opts.previousReleaseDir)
    if (commands.length) {
      const why = [
        b.needs.brand && b.facts?.problem,
        b.needs.previousBrand && b.previousFacts?.problem
      ].filter(Boolean)
      if (check || args['no-measure'] === true) {
        console.error(
          `${b.id}: measurements missing${why.length ? ` (${why.join('; ')})` : ''}; run:\n${commands.map((c) => `  ${c.join(' ')}`).join('\n')}`
        )
        return 1
      }
      for (const c of commands) {
        console.log(`$ ${c.join(' ')}`)
        const r = spawnSync(c[0] === 'node' ? process.execPath : c[0], c.slice(1), {
          cwd: ROOT,
          stdio: 'inherit'
        })
        if (r.status !== 0) throw new Error(`release-measure.mjs exited ${r.status}`)
      }
      rmSync(b.scratch, { recursive: true, force: true })
      b = buildOf(opts)
      const still = [b.facts.problem, b.previousFacts.problem].filter(Boolean)
      if (still.length) {
        console.error(`${b.id}: after measuring, ${still.join('; ')}`)
        return 1
      }
    }
    const facts = b.facts.doc
    const previousFacts = b.previousFacts.doc
    const { row, problems } = rowFor(b.rows[b.v0], previousFacts, facts, b.id, {
      from: b.v0,
      themeSame: b.themeCarried,
      contentMapBefore: readJson(path.join(b.previousDir, 'content-map.json')),
      contentMapAfter: readJson(path.join(b.sNew, 'content-map.json'))
    })
    if (problems.length) {
      console.error(
        `${b.id}: the profile row of ${b.v0} cannot be carried:\n${problems.map((p) => `  ${p}`).join('\n')}\nWrite the ${b.version} row in template-profiles.json by hand from these measurements.`
      )
      return 1
    }
    // a row already there with the same facts keeps its words (a person's note beats the generated one)
    const kept = b.rows[b.version]
    const finalRow = kept && canonical(rowFacts(kept)) === canonical(rowFacts(row)) ? kept : row
    if (kept && finalRow !== kept && check) {
      console.error(`${b.id}: template-profiles.json row ${b.version} differs from the measured facts`)
      return 1
    }
    writeFileSync(path.join(b.sNew, EVIDENCE_FILE), json(evidenceOf(b, finalRow, facts, previousFacts)))
    if (b.measurement) {
      writeFileSync(path.join(b.sNew, MEASUREMENT_FILE), json(b.measurement))
      // the inherited numbers must pass the very proof /ops and the gate will apply to the committed files
      copyFileSync(path.join(b.realNew, BRAND_FACTS_FILE), path.join(b.sNew, BRAND_FACTS_FILE))
      const profilesNow =
        finalRow === kept
          ? JSON.parse(b.profilesText)
          : JSON.parse(withRow(b.profilesText, b.tag, b.v0, b.version, finalRow))
      const proof = inheritanceProofAt(b.sNew, { tag: b.tag, version: b.version }, b.v0, {
        selfProblem: inheritanceProblem,
        profiles: profilesNow,
        slotTemplates: path.dirname(b.slotFile)
      })
      if (proof.problem)
        throw new Error(`${b.id}: the inherited measurement fails the shared proof: ${proof.problem}`)
    }

    /** @type {[string, string | Buffer][]} */
    const outputs = DOSSIER_FILES.map((f) => [path.join(b.realNew, f), readFileSync(path.join(b.sNew, f))])
    if (b.measurement)
      outputs.push([
        path.join(b.realNew, MEASUREMENT_FILE),
        readFileSync(path.join(b.sNew, MEASUREMENT_FILE))
      ])
    for (const ext of ['copy.json', 'design.json']) {
      const from = path.join(b.contracts, b.slug, b.line, `${b.v0}.${ext}`)
      if (existsSync(from))
        outputs.push([path.join(b.contracts, b.slug, b.line, `${b.version}.${ext}`), readFileSync(from)])
    }
    outputs.push([b.slotFile, b.slotAfter])
    if (finalRow !== kept)
      outputs.push([b.profilesFile, withRow(b.profilesText, b.tag, b.v0, b.version, finalRow)])

    if (check) {
      const stale = outputs.filter(
        ([f, bytes]) => !existsSync(f) || !readFileSync(f).equals(Buffer.from(bytes))
      )
      if (stale.length) {
        console.error(
          `${b.id}: ${stale.length} file(s) differ from a fresh cut:\n${stale.map(([f]) => `  ${path.relative(ROOT, f)}`).join('\n')}`
        )
        return 1
      }
      console.log(`${b.id}: every artifact is the bytes a fresh cut makes.`)
      return 0
    }
    mkdirSync(b.realNew, { recursive: true })
    for (const [f, bytes] of outputs) writeFileSync(f, bytes)
    if (b.areas) console.log(`webroot against ${b.v0}, by area: ${JSON.stringify(b.areas)}`)
    console.log(
      `${b.id}: dossier, evidence and row written (measurement ${b.measurement ? `inherited from ${b.v0}` : 'own'}${b.bump ? `, maxVersion ${b.bump.from} → ${b.bump.to}` : ''}${b.contentChanged ? ', content change accepted' : ''}).`
    )
    return 0
  } finally {
    rmSync(b.scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(String(e?.message ?? e))
      process.exitCode = 1
    }
  )
