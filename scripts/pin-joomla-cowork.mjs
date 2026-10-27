#!/usr/bin/env node
/**
 * Move the Joomla quickstarts' Claude Cowork pins onto a published `joomla-v<X.Y.Z>` release of
 * TracyHQ/claude-cowork, in BOTH `quickstarts.json` copies at once.
 *
 *   node scripts/pin-joomla-cowork.mjs --tag joomla-v0.24.9 --dry-run   # print the diff, write nothing
 *   node scripts/pin-joomla-cowork.mjs --tag joomla-v0.24.9             # rewrite both copies
 *   node scripts/pin-joomla-cowork.mjs --tag joomla-v0.24.9 --quickstart quickstart/ja-kinetic/j6
 *
 * WHY A MACHINE. A running site updates itself, but a NEW site installs the plugin its quickstart pins
 * (`coworkPinFor`, `apps/tracy-web/src/lib/contracts.js`), so a fix in the plugin reaches new sites
 * only through these pins. Until 10/10/2026 every pin was moved by hand: five values per entry
 * (file, version, bytes, sha256, url), eight Joomla entries, two files that must stay byte-identical
 * (the web image reads one, the host image the other), and the asset's size and hash copied out of a
 * download — #1013 (0.24.5), #1091 (0.24.7) and #1098 (0.24.8). This script reads the same facts from
 * the release and writes the same five values: replayed on the tree before #1013's move, it writes
 * both files byte for byte as that commit did, but for one sentence of prose in a note.
 *
 * 🔒 IT MOVES THE PLUGIN, NEVER THE CONTRACT. `contractFiles`, `alsoCarries` and `contractVersions` say
 * which profile bytes the pinned zip carries; the seeder build and the `design-templates` gate hold
 * them to this tree. The script opens the downloaded zip and refuses, writing nothing, unless the new
 * release carries every profile the pin records with exactly the recorded files and bytes. A release
 * that re-cut a contract needs a person to re-pin it (and usually a new quickstart), not this.
 *
 * TWO SHAPES OF RELEASE, told apart by what the component holds. Up to `joomla-v0.24.53` the
 * profiles sit in it (`administrator/lib/contracts/<id>/`). Later releases hold only an index,
 * `administrator/lib/contracts.json` (id -> `asset`, `sha256`, `bytes`), and attach each profile as
 * its own asset of the same release (`<id with "/" -> "--">.zip`, files at its root), which a site
 * fetches when it binds. For such a release every profile a pin records must be in the index, and
 * its asset is downloaded, held to the index's sha256 and bytes and to what GitHub states, and its
 * files compared with the recorded ones as a carried profile's are.
 *
 * Every Joomla entry with a `cowork` pin is a candidate (`--quickstart` narrows it). An entry already
 * on the release is verified and left alone; an entry on a NEWER release is left alone; only older
 * pins move. A pin that fetches by `githubAssetId` (a copy on the private releases repository) is
 * refused: dropping the id changes where the host downloads from, which is a decision, not a bump.
 *
 * Offline (tests, or a release checked by hand): `--release <file>` is the JSON `gh api
 * repos/TracyHQ/claude-cowork/releases/tags/<tag>` answers, `--zip <file>` the asset's bytes,
 * `--assets <dir>` a folder holding the profile assets by their file names (a slim release), and
 * `--root <dir>` a tree holding both catalogues and `packages/cms/tracy-joomla-quickstart/contracts`.
 *
 * Exit 0 = written, or nothing to move; 1 = refused, nothing written; 2 = bad arguments.
 * The diff goes to stdout, everything else to stderr.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { contractFor, readContracts } from '../apps/tracy-web/src/lib/contracts.js'
import { zipFiles } from '../apps/tracy-web/src/lib/template-customization-question-readiness/readers/archive-binaries.js'

const REPO = 'TracyHQ/claude-cowork'
/** The web image reads the first, the host image (provision, seeder build) the second. */
export const CATALOGUES = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'
/** The only values a move rewrites; everything else in the entry is about the contract. */
const MOVED = ['file', 'version', 'bytes', 'sha256', 'url']
const CONTRACT_DIR = 'administrator/lib/contracts/'
/** A slim release's index of the profiles it attaches as assets. */
const CONTRACT_INDEX = 'administrator/lib/contracts.json'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** `0.24.9` -> [0, 24, 9]; anything else (a release candidate included) is not pinned. */
function triple(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? ''))
  return m ? m.slice(1).map(Number) : null
}
function compare(a, b) {
  const [x, y] = [triple(a), triple(b)]
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}

/**
 * Where each value of the document sits in the text, keyed by its path (keys joined by NUL), so a
 * move replaces five values and leaves every other byte — layout, key order, notes — as it was.
 * @param {string} text
 * @returns {Map<string, { start: number, end: number }>}
 */
export function valueSpans(text) {
  const spans = new Map()
  let at = 0
  const space = () => {
    while (at < text.length && ' \t\n\r'.includes(text[at])) at += 1
  }
  const string = () => {
    const start = at
    at += 1
    while (text[at] !== '"') {
      if (at >= text.length) throw new Error(`unterminated string at ${start}`)
      at += text[at] === '\\' ? 2 : 1
    }
    at += 1
    return JSON.parse(text.slice(start, at))
  }
  const value = (key) => {
    space()
    const start = at
    if (text[at] === '{') {
      at += 1
      space()
      if (text[at] === '}') at += 1
      else
        for (;;) {
          space()
          const name = string()
          space()
          if (text[at] !== ':') throw new Error(`expected ':' at ${at}`)
          at += 1
          value([...key, name])
          space()
          if (text[at] === ',') at += 1
          else if (text[at] === '}') {
            at += 1
            break
          } else throw new Error(`expected ',' or '}' at ${at}`)
        }
    } else if (text[at] === '[') {
      at += 1
      space()
      if (text[at] === ']') at += 1
      else
        for (let i = 0; ; i += 1) {
          value([...key, String(i)])
          space()
          if (text[at] === ',') at += 1
          else if (text[at] === ']') {
            at += 1
            break
          } else throw new Error(`expected ',' or ']' at ${at}`)
        }
    } else if (text[at] === '"') string()
    else {
      const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(at, at + 64))
      if (!m) throw new Error(`unexpected '${text[at]}' at ${at}`)
      at += m[0].length
    }
    spans.set(key.join('\u0000'), { start, end: at })
  }
  value([])
  space()
  if (at !== text.length) throw new Error(`trailing text at ${at}`)
  return spans
}

/**
 * Every contract profile a Claude Cowork for Joomla package carries: id -> (file -> sha256). The
 * profiles sit in the component, one zip down (`packages/com_claudecowork.zip`).
 * @param {Buffer} pkg
 */
export function carriedContracts(pkg) {
  const component = zipFiles(pkg, (name) => name === 'packages/com_claudecowork.zip').get(
    'packages/com_claudecowork.zip'
  )
  if (!component) throw new Error('the package holds no packages/com_claudecowork.zip')
  /** @type {Map<string, Map<string, string>>} */
  const carried = new Map()
  for (const [name, bytes] of zipFiles(component, (n) => n.startsWith(CONTRACT_DIR))) {
    const parts = name.slice(CONTRACT_DIR.length).split('/')
    // `<slug>/<cms>/<version>/<file>`; the README beside the profiles is not one.
    if (parts.length < 4) continue
    const id = parts.slice(0, 3).join('/')
    if (!carried.has(id)) carried.set(id, new Map())
    carried.get(id).set(parts.slice(3).join('/'), sha256(bytes))
  }
  return carried
}

/**
 * A slim release's index (`administrator/lib/contracts.json`): id -> its row (`asset`, `sha256`,
 * `bytes`, …); undefined when the component holds none (profiles carried in the package).
 * @param {Buffer} pkg
 * @returns {Map<string, { asset?: unknown, sha256?: unknown, bytes?: unknown }> | undefined}
 */
export function publishedContracts(pkg) {
  const component = zipFiles(pkg, (name) => name === 'packages/com_claudecowork.zip').get(
    'packages/com_claudecowork.zip'
  )
  const index = component && zipFiles(component, (n) => n === CONTRACT_INDEX).get(CONTRACT_INDEX)
  if (!index) return undefined
  const contracts = JSON.parse(index.toString('utf8'))?.contracts
  if (!contracts || typeof contracts !== 'object') throw new Error(`${CONTRACT_INDEX} lists no contracts`)
  return new Map(Object.entries(contracts))
}

/**
 * A profile asset's files (file -> sha256), when `bytes` are the ones the index row names; the
 * problems otherwise.
 * @param {Buffer} bytes
 * @param {{ asset?: unknown, sha256?: unknown, bytes?: unknown }} row
 * @returns {{ files: Map<string, string> } | { problems: string[] }}
 */
export function assetProfile(bytes, row) {
  const problems = [
    bytes.length !== row.bytes && `${row.asset} is ${bytes.length} bytes, the index says ${row.bytes}`,
    sha256(bytes) !== String(row.sha256).toLowerCase() &&
      `${row.asset} hashes to ${sha256(bytes)}, the index says ${row.sha256}`
  ].filter(Boolean)
  if (problems.length) return { problems }
  const files = new Map([...zipFiles(bytes, () => true)].map(([name, data]) => [name, sha256(data)]))
  if (!files.has('manifest.json')) return { problems: [`${row.asset} holds no manifest.json at its root`] }
  return { files }
}

/** Every profile a pin records: the one its entry is sealed with, `alsoCarries`, and `contractVersions`'. */
function recordedProfiles(id, entry, index) {
  const pin = entry.cowork
  const tag = entry.release ?? id
  const out = new Set(Object.keys(pin.alsoCarries ?? {}))
  const sealed =
    typeof entry.contract === 'string' ? entry.contract : contractFor(index, tag, entry.version)?.id
  if (sealed && pin.contractFiles && Object.keys(pin.contractFiles).length > 0) out.add(sealed)
  for (const version of pin.contractVersions ?? []) {
    const profile = contractFor(index, tag, version)?.id
    if (profile) out.add(profile)
  }
  return out
}

/** The version the package's own manifest declares. */
function packageVersion(pkg) {
  const manifest = zipFiles(pkg, (name) => name === 'pkg_claudecowork.xml').get('pkg_claudecowork.xml')
  return manifest ? /<version>\s*([^<\s]+)\s*<\/version>/.exec(manifest.toString('utf8'))?.[1] : undefined
}

/**
 * What a pin records about the profiles its zip carries, and whether `carried` agrees: the profile the
 * entry is sealed with (`contractFiles`), every other one (`alsoCarries`), and a profile for every
 * quickstart version the pin also serves (`contractVersions`).
 */
function contractProblems(id, entry, carried, index, file) {
  const problems = []
  const pin = entry.cowork
  const tag = entry.release ?? id
  const sealed =
    typeof entry.contract === 'string' ? entry.contract : contractFor(index, tag, entry.version)?.id
  const recorded = []
  if (pin.contractFiles && Object.keys(pin.contractFiles).length > 0) {
    if (!sealed) problems.push(`${id}: no profile in ${CONTRACTS} seals ${tag}@${entry.version}`)
    else recorded.push([sealed, pin.contractFiles])
  }
  recorded.push(...Object.entries(pin.alsoCarries ?? {}))
  for (const [profile, files] of recorded) {
    const inZip = carried.get(profile)
    if (!inZip) {
      problems.push(`${id}: ${file} carries no ${profile}`)
      continue
    }
    for (const [name, hash] of Object.entries(files)) {
      if (!inZip.has(name)) problems.push(`${id}: ${file} carries ${profile} without ${name}`)
      else if (inZip.get(name) !== hash)
        problems.push(`${id}: ${profile}/${name} in ${file} is not the recorded ${hash.slice(0, 12)}…`)
    }
    for (const name of inZip.keys())
      if (!(name in files))
        problems.push(`${id}: ${file} carries ${profile}/${name}, which the pin does not record`)
  }
  for (const version of pin.contractVersions ?? []) {
    const profile = contractFor(index, tag, version)?.id
    if (!profile)
      problems.push(`${id}: no profile in ${CONTRACTS} seals ${tag}@${version} (contractVersions)`)
    else if (!carried.has(profile))
      problems.push(`${id}: ${file} carries no ${profile} for ${tag}@${version}`)
  }
  return problems
}

/** A git-style diff of two texts with the same lines in the same places (a move never adds a line). */
export function lineDiff(before, after, name, context = 3) {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length !== b.length) throw new Error('a move changed the number of lines')
  const changed = a.flatMap((line, i) => (line === b[i] ? [] : [i]))
  if (changed.length === 0) return ''
  const hunks = []
  for (const i of changed) {
    const last = hunks.at(-1)
    if (last && i - context <= last.to + context) last.to = i
    else hunks.push({ from: i, to: i })
  }
  const out = [`diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`]
  for (const { from, to } of hunks) {
    const start = Math.max(0, from - context)
    const end = Math.min(a.length - 1, to + context)
    const length = end - start + 1
    out.push(`@@ -${start + 1},${length} +${start + 1},${length} @@`)
    // A run of changed lines reads as git prints it: every removed line, then every added one.
    for (let i = start; i <= end; ) {
      if (a[i] === b[i]) {
        out.push(` ${a[i]}`)
        i += 1
        continue
      }
      let j = i
      while (j <= end && a[j] !== b[j]) j += 1
      out.push(...a.slice(i, j).map((l) => `-${l}`), ...b.slice(i, j).map((l) => `+${l}`))
      i = j
    }
  }
  return `${out.join('\n')}\n`
}

/** Read the release, check the asset, and plan or write the move. Returns the process exit code. */
export function main(argv) {
  let args
  try {
    ;({ values: args } = parseArgs({
      args: argv,
      options: {
        tag: { type: 'string' },
        quickstart: { type: 'string', multiple: true },
        'dry-run': { type: 'boolean', default: false },
        root: { type: 'string' },
        release: { type: 'string' },
        zip: { type: 'string' },
        assets: { type: 'string' }
      }
    }))
  } catch (error) {
    process.stderr.write(`pin-joomla-cowork: ${error.message}\n`)
    return 2
  }
  const version = /^joomla-v(\d+\.\d+\.\d+)$/.exec(args.tag ?? '')?.[1]
  if (!version) {
    process.stderr.write(
      'pin-joomla-cowork: --tag joomla-v<X.Y.Z> is required (a release candidate is never pinned)\n'
    )
    return 2
  }
  const root = path.resolve(args.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const tag = args.tag
  const file = `pkg_claudecowork-${version}.zip`
  const url = `https://github.com/${REPO}/releases/download/${tag}/${file}`
  const refuse = (problems) => {
    for (const p of problems) process.stderr.write(`pin-joomla-cowork: ${p}\n`)
    process.stderr.write('pin-joomla-cowork: refused, nothing written\n')
    return 1
  }
  const gh = (ghArgs) =>
    execFileSync('gh', ghArgs, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 1024 })

  // The release as GitHub serves it: published, not a candidate, with the package asset uploaded.
  let release
  try {
    release = JSON.parse(
      args.release
        ? readFileSync(args.release, 'utf8')
        : gh(['api', `repos/${REPO}/releases/tags/${tag}`]).toString('utf8')
    )
  } catch (error) {
    return refuse([
      `cannot read release ${tag} of ${REPO}: ${error.stderr?.toString().trim() || error.message}`
    ])
  }
  const asset = (release.assets ?? []).find((a) => a.name === file)
  const releaseProblems = [
    release.tag_name !== tag && `the release answers tag ${release.tag_name}, not ${tag}`,
    release.draft && `${tag} is a draft`,
    release.prerelease && `${tag} is a pre-release`,
    !asset && `${tag} has no asset ${file}`,
    asset && asset.state !== 'uploaded' && `${file} is ${asset.state}, not uploaded`,
    asset &&
      asset.browser_download_url !== url &&
      `${file} is served at ${asset.browser_download_url}, not ${url}`
  ].filter(Boolean)
  if (releaseProblems.length) return refuse(releaseProblems)

  // The bytes a host will download, hashed here: the size and digest GitHub states must agree, and the
  // package must declare the version its tag names.
  let pkg
  try {
    pkg = args.zip
      ? readFileSync(args.zip)
      : gh(['api', '-H', 'Accept: application/octet-stream', `repos/${REPO}/releases/assets/${asset.id}`])
  } catch (error) {
    return refuse([
      `cannot download ${file} (asset ${asset.id}): ${error.stderr?.toString().trim() || error.message}`
    ])
  }
  const digest = sha256(pkg)
  const assetProblems = [
    pkg.length !== asset.size && `${file} downloaded as ${pkg.length} bytes, GitHub states ${asset.size}`,
    asset.digest &&
      asset.digest !== `sha256:${digest}` &&
      `${file} hashes to ${digest}, GitHub states ${asset.digest}`,
    packageVersion(pkg) !== version &&
      `${file} declares version ${packageVersion(pkg) ?? '(none)'}, not ${version}`
  ].filter(Boolean)
  if (assetProblems.length) return refuse(assetProblems)
  let carried
  let published
  try {
    carried = carriedContracts(pkg)
    published = publishedContracts(pkg)
  } catch (error) {
    return refuse([`${file}: ${error.message}`])
  }
  const target = { file, version, bytes: pkg.length, sha256: digest, url }

  // Both catalogues, which must be one text before and after.
  const texts = CATALOGUES.map((name) => readFileSync(path.join(root, name), 'utf8'))
  if (texts[1] !== texts[0])
    return refuse([`${CATALOGUES[0]} and ${CATALOGUES[1]} differ; make them one text first`])
  const text = texts[0]
  const catalogue = JSON.parse(text)
  const joomla = Object.entries(catalogue).filter(([, e]) => e?.platform === 'joomla' && e.cowork)
  const named = [...new Set(args.quickstart ?? joomla.map(([id]) => id))]
  const unknown = named.filter((id) => !joomla.some(([j]) => j === id))
  if (unknown.length)
    return refuse(unknown.map((id) => `${id} is not a Joomla quickstart with a Claude Cowork pin`))

  const index = readContracts([path.join(root, CONTRACTS)])
  const problems = []
  const plan = []
  // A slim release: each profile a checked pin records and the package does not carry is fetched
  // from its own asset and checked against the index, then compared as a carried one.
  const checkedPin = (pin) =>
    pin.githubAssetId === undefined && triple(pin.version) && compare(pin.version, version) <= 0
  const fetched = new Set()
  if (published)
    for (const id of named.filter((n) => checkedPin(catalogue[n].cowork)))
      for (const profile of recordedProfiles(id, catalogue[id], index)) {
        if (carried.has(profile) || fetched.has(profile)) continue
        const row = published.get(profile)
        if (!row) continue // reported below as a profile the release carries not
        fetched.add(profile)
        const name = String(row.asset ?? '')
        // A plain `.zip` file name only: it becomes a path under `--assets`.
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(name) || name.includes('..')) {
          problems.push(`${id}: the index names ${profile}'s asset "${name}", not a plain .zip file name`)
          continue
        }
        const attached = (release.assets ?? []).find((a) => a.name === name)
        if (!attached || attached.state !== 'uploaded') {
          problems.push(`${id}: ${tag} has no uploaded asset ${name || '(none)'} for ${profile}`)
          continue
        }
        let bytes
        try {
          bytes = args.assets
            ? readFileSync(path.join(args.assets, name))
            : gh([
                'api',
                '-H',
                'Accept: application/octet-stream',
                `repos/${REPO}/releases/assets/${attached.id}`
              ])
        } catch (error) {
          problems.push(`${id}: cannot download ${name}: ${error.stderr?.toString().trim() || error.message}`)
          continue
        }
        const checked = assetProfile(bytes, row)
        if (bytes.length !== attached.size)
          problems.push(`${id}: ${name} downloaded as ${bytes.length} bytes, GitHub states ${attached.size}`)
        if (attached.digest && attached.digest !== `sha256:${sha256(bytes)}`)
          problems.push(`${id}: ${name} hashes to ${sha256(bytes)}, GitHub states ${attached.digest}`)
        if ('problems' in checked) problems.push(...checked.problems.map((p) => `${id}: ${p}`))
        else carried.set(profile, checked.files)
      }
  for (const id of named) {
    const entry = catalogue[id]
    const pin = entry.cowork
    if (pin.githubAssetId !== undefined)
      problems.push(
        `${id}: pinned by githubAssetId ${pin.githubAssetId} (a copy on the private releases repository); move it by hand`
      )
    else if (!triple(pin.version)) problems.push(`${id}: pinned version ${pin.version} is not X.Y.Z`)
    else if (compare(pin.version, version) > 0) plan.push({ id, from: pin.version, action: 'newer' })
    else {
      problems.push(...contractProblems(id, entry, carried, index, file))
      if (compare(pin.version, version) === 0) {
        const drift = MOVED.filter((k) => pin[k] !== target[k])
        if (drift.length)
          problems.push(
            `${id}: already on ${version} but ${drift.join(', ')} differ from the release — was ${tag} re-cut?`
          )
        plan.push({ id, from: pin.version, action: 'same' })
      } else plan.push({ id, from: pin.version, action: 'move' })
    }
  }
  if (problems.length) return refuse(problems)

  // Five values per moved entry, spliced where they stand; the result must parse to exactly the
  // catalogue with those values changed.
  const spans = valueSpans(text)
  const edits = []
  const expected = structuredClone(catalogue)
  for (const { id } of plan.filter((p) => p.action === 'move')) {
    for (const key of MOVED) {
      const span = spans.get([id, 'cowork', key].join('\u0000'))
      if (!span) return refuse([`${id}: the pin has no ${key} to rewrite`])
      edits.push({ ...span, value: JSON.stringify(target[key]) })
      expected[id].cowork[key] = target[key]
    }
  }
  let after = text
  for (const edit of edits.sort((x, y) => y.start - x.start))
    after = after.slice(0, edit.start) + edit.value + after.slice(edit.end)
  if (!isDeepStrictEqual(JSON.parse(after), expected))
    return refuse(['the rewritten catalogue is not the planned one'])

  for (const p of plan)
    process.stderr.write(
      `${p.id}: ${
        p.action === 'move'
          ? `${p.from} -> ${version}`
          : p.action === 'same'
            ? `already on ${version}, verified`
            : `on ${p.from}, newer than ${version}; left alone`
      }\n`
    )
  const checked = plan.filter((p) => p.action !== 'newer')
  process.stderr.write(
    `${file}: ${pkg.length} bytes, sha256 ${digest} (asset ${asset.id}); ${checked.length} pin(s) checked against the ${
      published
        ? `${published.size} profiles its index lists (${fetched.size} fetched)`
        : `${carried.size} profiles it carries`
    }\n`
  )
  for (const name of CATALOGUES) process.stdout.write(lineDiff(text, after, name))
  if (after === text) {
    process.stderr.write('nothing to move\n')
    return 0
  }
  if (args['dry-run']) {
    process.stderr.write('dry run: nothing written\n')
    return 0
  }
  for (const name of CATALOGUES) writeFileSync(path.join(root, name), after)
  process.stderr.write(`wrote ${CATALOGUES.join(' and ')}\n`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
