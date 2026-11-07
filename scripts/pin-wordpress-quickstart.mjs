#!/usr/bin/env node
/**
 * Write a WordPress quickstart's catalogue entry (`<design>/wp7`) from two published releases, in BOTH
 * `quickstarts.json` copies at once:
 *
 *   node scripts/pin-wordpress-quickstart.mjs --quickstart quickstart/ja-diner/wp7 --plugin-tag wordpress-v0.18.37 --dry-run
 *   node scripts/pin-wordpress-quickstart.mjs --quickstart quickstart/ja-diner/wp7 --plugin-tag wordpress-v0.18.37
 *   node scripts/pin-wordpress-quickstart.mjs --quickstart quickstart/ja-diner/wp7 --plugin-tag wordpress-v0.18.37 --version 1.0.2
 *
 * WHY A MACHINE. A new site installs the Claude Cowork plugin its quickstart pins, and the plugin carries the
 * contract files byte for byte (`wordpress/cowork/lib/contracts/<design>/wp7/<version>/` in TracyHQ/claude-cowork,
 * copied by its `build.sh`). The `contracts` gate (`scripts/check-contracts.ts`) holds the pin's hashes to this tree.
 * Until now every WordPress pin was written by hand: file, version, bytes, sha256, url, `contractFiles`,
 * `alsoCarries`, two copies that must stay byte-identical. This is the WordPress sibling of
 * `scripts/pin-joomla-cowork.mjs`; the order of a contract change is:
 *   contract change -> claude-cowork `node scripts/release-wordpress.mjs X.Y.Z` (a `release/<tag>` PR, tag
 *   `wordpress-vX.Y.Z`, zip `claude-cowork-X.Y.Z.zip`) -> this script -> PR.
 *
 * WHAT IT WRITES for each named entry: `cowork` (file, version, bytes, sha256, url from the plugin release;
 * `contractFiles` and `alsoCarries` hashed from the profile folders of this tree; `contractVersions` kept, plus the
 * quickstart version when `--version` moves it). With `--version X` it also writes `version`, `contract`,
 * `webroot` and `database` from the quickstart release (tag = the entry key unless `--quickstart-tag`), sized and
 * hashed from the downloaded assets.
 *
 * 🔒 IT REFUSES, WRITING NOTHING, unless the plugin zip carries the entry's contract (`<design>/wp7/<version>`) with
 * every pinned file byte for byte as this tree holds it, no file this tree lacks, every other profile of the design
 * it carries identical to the tree, and a plugin version not older than the manifest's `coworkContractVersion`. A
 * plugin cut before the contract change is re-cut, never pinned. A draft, a pre-release, an asset that is not
 * uploaded or whose size or digest disagrees with the bytes, or a zip whose `Version:` header is not the tag's, is
 * refused. Only `wordpress` entries are touched; `tracy-base`-style entries with a `githubAssetId` keep it unless
 * the quickstart release states a new one.
 *
 * `design-templates.json` lists Joomla design templates only (`platform: "joomla"`), so a WordPress pin never
 * touches it.
 *
 * Offline (tests, or a release checked by hand): `--release <file>` is the JSON `gh api
 * repos/TracyHQ/claude-cowork/releases/tags/<tag>` answers, `--zip <file>` the plugin bytes,
 * `--quickstart-release <file>` the same for the quickstart release, `--webroot <file>` and `--database <file>`
 * its two parts, `--root <dir>` a tree holding both catalogues and the contract folders.
 *
 * Exit 0 = written (or nothing to move); 1 = refused, nothing written; 2 = bad arguments. The diff goes to
 * stdout, everything else to stderr.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { zipFiles } from '../apps/tracy-web/src/lib/template-customization-question-readiness/readers/archive-binaries.js'
import { CATALOGUES, valueSpans } from './pin-joomla-cowork.mjs'

const PLUGIN_REPO = 'TracyHQ/claude-cowork'
const QUICKSTART_REPO = 'JoomlArt-Products/joomlart-products'
const CONTRACTS = 'packages/cms/tracy-wordpress-quickstart/contracts'
/** The files the plugin carries of a profile (the rest of a profile folder stays in this repository). */
const CARRIED = [
  'content-map.json',
  'demo-trim-map.json',
  'editions.json',
  'manifest.json',
  'presentation-lock.json',
  'showcase-nav-map.json',
  'superseded.json'
]
const PROFILE_PATH = /^[^/]+\/lib\/contracts\/([^/]+\/wp7\/[^/]+)\/([^/]+)$/

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const triple = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''))
  return m ? m.slice(1).map(Number) : null
}
const compare = (a, b) => {
  const [x, y] = [triple(a), triple(b)]
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}
const sortedObject = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))

/** JSON in the catalogue's layout: two spaces, arrays of scalars on one line. */
export function render(value, depth = 0) {
  const pad = '  '.repeat(depth + 1)
  if (Array.isArray(value) && value.every((v) => v === null || typeof v !== 'object'))
    return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
  if (value && typeof value === 'object') {
    const rows = Object.entries(value).map(([k, v]) =>
      Array.isArray(value)
        ? `${pad}${render(v, depth + 1)}`
        : `${pad}${JSON.stringify(k)}: ${render(v, depth + 1)}`
    )
    const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}']
    return rows.length ? `${open}\n${rows.join(',\n')}\n${'  '.repeat(depth)}${close}` : `${open}${close}`
  }
  return JSON.stringify(value)
}

/** A diff of two texts that may differ in length: the common head and tail trimmed, the rest as one hunk. */
export function textDiff(before, after, name) {
  if (before === after) return ''
  const a = before.split('\n')
  const b = after.split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a.at(-1 - tail) === b.at(-1 - tail)) tail += 1
  const from = Math.max(0, head - 3)
  const ctxA = a.slice(from, head)
  const ctxB = a.slice(a.length - tail, Math.min(a.length, a.length - tail + 3))
  return `${[
    `diff --git a/${name} b/${name}`,
    `--- a/${name}`,
    `+++ b/${name}`,
    `@@ -${from + 1} +${from + 1} @@`,
    ...ctxA.map((l) => ` ${l}`),
    ...a.slice(head, a.length - tail).map((l) => `-${l}`),
    ...b.slice(head, b.length - tail).map((l) => `+${l}`),
    ...ctxB.map((l) => ` ${l}`)
  ].join('\n')}\n`
}

/** Every profile a plugin zip carries: id -> (file -> sha256). */
export function carriedProfiles(pkg) {
  const carried = new Map()
  for (const [name, bytes] of zipFiles(pkg, (n) => PROFILE_PATH.test(n))) {
    const [, id, file] = PROFILE_PATH.exec(name)
    if (!carried.has(id)) carried.set(id, new Map())
    carried.get(id).set(file, sha256(bytes))
  }
  return carried
}

/** The hashes of a profile folder of this tree, for the files the plugin carries; null without a manifest. */
function treeProfile(root, id) {
  const dir = path.join(root, CONTRACTS, id)
  if (!existsSync(path.join(dir, 'manifest.json'))) return null
  return Object.fromEntries(
    CARRIED.filter((n) => existsSync(path.join(dir, n))).map((n) => [
      n,
      sha256(readFileSync(path.join(dir, n)))
    ])
  )
}

/** What a published release must be, and its asset, or the problems. */
function releaseAsset(release, tag, name, label) {
  const asset = (release.assets ?? []).find((a) => a.name === name)
  const problems = [
    release.tag_name !== tag && `${label}: the release answers tag ${release.tag_name}, not ${tag}`,
    release.draft && `${label}: ${tag} is a draft`,
    release.prerelease && `${label}: ${tag} is a pre-release`,
    !asset && `${label}: ${tag} has no asset ${name}`,
    asset && asset.state !== 'uploaded' && `${label}: ${name} is ${asset.state}, not uploaded`
  ].filter(Boolean)
  return { asset, problems }
}

/** The bytes of an asset must be what GitHub states. */
function bytesProblems(bytes, asset, label) {
  const digest = sha256(bytes)
  return [
    bytes.length !== asset.size &&
      `${label}: ${asset.name} is ${bytes.length} bytes, GitHub states ${asset.size}`,
    asset.digest &&
      asset.digest !== `sha256:${digest}` &&
      `${label}: ${asset.name} hashes to ${digest}, GitHub states ${asset.digest}`
  ].filter(Boolean)
}

/** The design of a catalogue key: `quickstart/ja-diner/wp7` and `tracy-base/wp7` -> `ja-diner`, `tracy-base`. */
const designOf = (key) => key.replace(/^quickstart\//, '').replace(/\/wp7$/, '')

export function main(argv) {
  let args
  try {
    ;({ values: args } = parseArgs({
      args: argv,
      options: {
        quickstart: { type: 'string', multiple: true },
        'plugin-tag': { type: 'string' },
        version: { type: 'string' },
        'quickstart-tag': { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        root: { type: 'string' },
        release: { type: 'string' },
        zip: { type: 'string' },
        'quickstart-release': { type: 'string' },
        webroot: { type: 'string' },
        database: { type: 'string' }
      }
    }))
  } catch (error) {
    process.stderr.write(`pin-wordpress-quickstart: ${error.message}\n`)
    return 2
  }
  const pluginVersion = /^wordpress-v(\d+\.\d+\.\d+)$/.exec(args['plugin-tag'] ?? '')?.[1]
  const named = [...new Set(args.quickstart ?? [])]
  if (!pluginVersion || named.length === 0 || (args.version && !triple(args.version))) {
    process.stderr.write(
      'pin-wordpress-quickstart: --quickstart <key> (repeatable), --plugin-tag wordpress-v<X.Y.Z> and, to move the quickstart itself, --version <X.Y.Z> are required\n'
    )
    return 2
  }
  if (args.version && named.length > 1) {
    process.stderr.write(
      'pin-wordpress-quickstart: --version moves one quickstart; name exactly one --quickstart\n'
    )
    return 2
  }
  const root = path.resolve(args.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const refuse = (problems) => {
    for (const p of problems) process.stderr.write(`pin-wordpress-quickstart: ${p}\n`)
    process.stderr.write('pin-wordpress-quickstart: refused, nothing written\n')
    return 1
  }
  const gh = (ghArgs) =>
    execFileSync('gh', ghArgs, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 1024 })
  const fetchRelease = (repo, tag, file) => {
    try {
      return JSON.parse(
        file ? readFileSync(file, 'utf8') : gh(['api', `repos/${repo}/releases/tags/${tag}`]).toString('utf8')
      )
    } catch (error) {
      throw new Error(
        `cannot read release ${tag} of ${repo}: ${error.stderr?.toString().trim() || error.message}`
      )
    }
  }
  const download = (repo, asset, file) => {
    try {
      return file
        ? readFileSync(file)
        : gh(['api', '-H', 'Accept: application/octet-stream', `repos/${repo}/releases/assets/${asset.id}`])
    } catch (error) {
      throw new Error(`cannot download ${asset.name}: ${error.stderr?.toString().trim() || error.message}`)
    }
  }

  // The catalogues first: both copies must be one text, and every name a WordPress entry.
  const texts = CATALOGUES.map((name) => readFileSync(path.join(root, name), 'utf8'))
  if (texts[1] !== texts[0])
    return refuse([`${CATALOGUES[0]} and ${CATALOGUES[1]} differ; make them one text first`])
  const text = texts[0]
  const catalogue = JSON.parse(text)
  const unfit = named.filter((id) =>
    catalogue[id]
      ? catalogue[id].platform !== 'wordpress'
      : !args.version || !/^(?:quickstart\/)?[a-z0-9-]+\/wp7$/.test(id)
  )
  if (unfit.length)
    return refuse(
      unfit.map((id) => `${id} is not a WordPress quickstart of the catalogue (a new one needs --version)`)
    )

  // The plugin release and the bytes a host will download.
  const pluginTag = args['plugin-tag']
  const file = `claude-cowork-${pluginVersion}.zip`
  const url = `https://github.com/${PLUGIN_REPO}/releases/download/${pluginTag}/${file}`
  let pkg
  let carried
  let pluginAsset
  try {
    const release = fetchRelease(PLUGIN_REPO, pluginTag, args.release)
    const found = releaseAsset(release, pluginTag, file, 'plugin')
    if (found.problems.length) return refuse(found.problems)
    pluginAsset = found.asset
    if (pluginAsset.browser_download_url && pluginAsset.browser_download_url !== url)
      return refuse([`plugin: ${file} is served at ${pluginAsset.browser_download_url}, not ${url}`])
    pkg = download(PLUGIN_REPO, pluginAsset, args.zip)
    const problems = bytesProblems(pkg, pluginAsset, 'plugin')
    const header = zipFiles(pkg, (n) => /^[^/]+\/claude-cowork\.php$/.test(n))
      .values()
      .next().value
    const declared = header && /^\s*\*\s*Version:\s*(\S+)/m.exec(header.toString('utf8'))?.[1]
    if (declared !== pluginVersion)
      problems.push(`plugin: ${file} declares version ${declared ?? '(none)'}, not ${pluginVersion}`)
    if (problems.length) return refuse(problems)
    carried = carriedProfiles(pkg)
  } catch (error) {
    return refuse([error.message])
  }
  const cowork = { file, version: pluginVersion, bytes: pkg.length, sha256: sha256(pkg), url }

  // The quickstart itself, when --version moves it.
  const parts = {}
  if (args.version) {
    const id = named[0]
    const qTag = args['quickstart-tag'] ?? id
    try {
      const release = fetchRelease(QUICKSTART_REPO, qTag, args['quickstart-release'])
      const slug = designOf(id)
      const problems = []
      for (const [part, pattern, local] of [
        ['webroot', `${slug}-wp7-webroot-${args.version}.tar.gz`, args.webroot],
        ['database', `${slug}-wp7-database-${args.version}.sql.gz`, args.database]
      ]) {
        const found = releaseAsset(release, qTag, pattern, 'quickstart')
        problems.push(...found.problems)
        if (!found.asset) continue
        const bytes = download(QUICKSTART_REPO, found.asset, local)
        problems.push(...bytesProblems(bytes, found.asset, 'quickstart'))
        parts[part] = {
          file: pattern,
          bytes: bytes.length,
          sha256: sha256(bytes),
          ...(typeof found.asset.id === 'number' ? { githubAssetId: found.asset.id } : {}),
          url: found.asset.browser_download_url
        }
      }
      if (problems.length) return refuse(problems)
    } catch (error) {
      return refuse([error.message])
    }
  }

  // Per entry: the plugin must carry the contract and its siblings exactly as this tree holds them.
  const problems = []
  const next = {}
  for (const id of named) {
    const was = catalogue[id]
    const design = designOf(id)
    const version = args.version ?? was?.version
    const contract = args.version
      ? `${design}/wp7/${args.version}`
      : (was?.contract ?? `${design}/wp7/${version}`)
    const sealed = treeProfile(root, contract)
    if (!sealed) {
      problems.push(`${id}: ${CONTRACTS}/${contract} has no manifest.json; cut the contract first`)
      continue
    }
    const inZip = carried.get(contract)
    if (!inZip) {
      problems.push(`${id}: ${file} carries no ${contract}; re-cut the plugin from a tree holding it`)
      continue
    }
    for (const [name, hash] of Object.entries(sealed))
      if (
        !inZip.has(name) &&
        name === 'showcase-nav-map.json' &&
        was?.cowork?.contractFiles &&
        !(name in was.cowork.contractFiles)
      )
        delete sealed[name] // a plugin cut before the navigation map existed; the pin never recorded it
      else if (!inZip.has(name)) problems.push(`${id}: ${file} carries ${contract} without ${name}`)
      else if (inZip.get(name) !== hash)
        problems.push(
          `${id}: ${contract}/${name} in ${file} is not this tree's (${inZip.get(name).slice(0, 12)}… vs ${hash.slice(0, 12)}…); re-cut the plugin`
        )
    for (const name of inZip.keys())
      if (!(name in sealed))
        problems.push(`${id}: ${file} carries ${contract}/${name}, which this tree does not have`)
    const floor = JSON.parse(
      readFileSync(path.join(root, CONTRACTS, contract, 'manifest.json'), 'utf8')
    ).coworkContractVersion
    if (triple(floor) && compare(pluginVersion, floor) < 0)
      problems.push(
        `${id}: plugin ${pluginVersion} is older than the coworkContractVersion ${floor} of ${contract}`
      )
    // Other profiles of the design: identical to the tree where the tree has them.
    const also = {}
    for (const [other, files] of carried) {
      if (other === contract || !other.startsWith(`${design}/wp7/`)) continue
      const here = treeProfile(root, other)
      if (!here) {
        process.stderr.write(`${id}: ${file} carries ${other}, which this tree does not have; not recorded\n`)
        continue
      }
      const bad = [...files].filter(([n, h]) => here[n] !== h).map(([n]) => n)
      for (const n of Object.keys(here)) if (!files.has(n)) bad.push(n)
      if (bad.length)
        problems.push(
          `${id}: ${other} in ${file} differs from this tree (${[...new Set(bad)].join(', ')}); re-cut the plugin`
        )
      else also[other] = sortedObject(here)
    }
    const versions = new Set(was?.cowork?.contractVersions ?? [])
    if (args.version || versions.size === 0) versions.add(contract.split('/')[2])
    next[id] = {
      ...(was ?? { platform: 'wordpress' }),
      ...(args.version ? { version, ...parts } : {}),
      cowork: {
        ...cowork,
        contractVersions: [...versions].sort(compare),
        ...(Object.keys(also).length ? { alsoCarries: also } : {}),
        contractFiles: sortedObject(sealed)
      },
      contract
    }
    // Key order of a moved entry stays as it was; a new entry gets the layout of the others.
    if (was) next[id] = Object.fromEntries(Object.keys(was).map((k) => [k, next[id][k]]))
    else
      next[id] = Object.fromEntries(
        ['platform', 'version', 'webroot', 'database', 'cowork', 'contract'].map((k) => [k, next[id][k]])
      )
  }
  if (problems.length) return refuse(problems)

  // Splice each changed value where it stands, so every other byte of the catalogue is kept.
  const spans = valueSpans(text)
  const edits = []
  const expected = structuredClone(catalogue)
  for (const id of named) {
    const was = catalogue[id]
    if (!was) {
      const entry = `  ${JSON.stringify(id)}: ${render(next[id], 1)}`
      const end = text.lastIndexOf('}')
      const head = text.slice(0, end).trimEnd()
      edits.push({ start: head.length, end: text.length, value: `,\n${entry}\n}\n` })
      expected[id] = next[id]
      continue
    }
    for (const key of Object.keys(next[id])) {
      if (isDeepStrictEqual(was[key], next[id][key])) continue
      const span = spans.get([id, key].join('\u0000'))
      if (!span) return refuse([`${id}: the entry has no ${key} to rewrite`])
      edits.push({ ...span, value: render(next[id][key], 2) })
      expected[id][key] = next[id][key]
    }
  }
  let after = text
  for (const edit of edits.sort((x, y) => y.start - x.start))
    after = after.slice(0, edit.start) + edit.value + after.slice(edit.end)
  if (!isDeepStrictEqual(JSON.parse(after), expected))
    return refuse(['the rewritten catalogue is not the planned one'])

  for (const id of named)
    process.stderr.write(
      `${id}: plugin ${catalogue[id]?.cowork?.version ?? '(none)'} -> ${pluginVersion}${args.version ? `, quickstart ${catalogue[id]?.version ?? '(new)'} -> ${args.version}` : ''}, contract ${next[id].contract} carried byte for byte\n`
    )
  for (const name of CATALOGUES) process.stdout.write(textDiff(text, after, name))
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
