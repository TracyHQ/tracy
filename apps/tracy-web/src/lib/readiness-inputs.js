/**
 * What a stored Customize your site check was judged with (`customize-readiness.js`), as five short
 * versions, so a result judged with other inputs than this server has now is checked again.
 *
 *   files     the release's own assets (`fingerprintOf`): a file uploaded again under one version
 *   rules     the code of the check and `rule-severity.json`: every release when it changes
 *   profile   the template's OWN rows in `template-profiles.json`: only that template's releases
 *   contract  the contract that seals this version (its files) and its Claude Cowork pin in
 *             `quickstarts.json`: only the releases it seals
 *   plugin    the Claude Cowork plugin a new site gets (`cowork-install.js`): the pin or release zip
 *             it installs, or on the fleet's own road the latest claude-cowork names and the floor.
 *             A new latest plugin re-checks the releases that take it, with no deploy of this server
 *             (JA Boxing 1.0.3, 25/10/2026: the plugin, not the release, lost the showcase map)
 *
 * 🔒 WHY ALL OF THEM (12/10/2026). Tracy Business EmDash 1.7.16 was checked on dev while the server
 * still ran the image without its profile row: six must-fix rules failed on "no profile row", and
 * the result stayed, because only the release's files were remembered. A deploy that adds the row
 * changes no file of the release, so nothing looked again until somebody pressed Check again.
 *
 * 🔒 THE RULES VERSION IS THE CODE THE CHECK RUNS, FOUND, NOT LISTED. It hashes every file reached by
 * a relative import (or `new URL('./…', import.meta.url)`) from `check-runner.mjs`, the entry the
 * child process runs, plus `rule-severity.json`. A hand-kept list would miss the next helper a rule
 * imports. The two per-template tables the walk reaches (`template-profiles.json`,
 * `quickstarts.json`) are left out: they are the `profile` and `contract` inputs, so a row for one
 * template never re-checks every other one. Computed once per process: the image does not change
 * under a running server.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { contractFor, defaultContracts } from './contracts.js'
import { coworkSelection } from './cowork-install.js'
import { publishedTagOf } from './local-releases.js'
import { TEMPLATE_PROFILES } from './template-profiles.js'

const LIBRARY = fileURLToPath(new URL('./template-customization-question-readiness/', import.meta.url))
const RUNNER = path.join(LIBRARY, 'check-runner.mjs')
const SEVERITY = path.join(LIBRARY, 'rule-severity.json')
const PROFILES_FILE = fileURLToPath(new URL('./template-profiles.json', import.meta.url))
const PINS_FILE = fileURLToPath(new URL('../quickstarts.json', import.meta.url))
/** The per-template tables: inputs of their own, never part of the rules version. */
const PER_TEMPLATE = new Set([PROFILES_FILE, PINS_FILE])

/** The input names, in the order a log line lists them. */
export const INPUT_KEYS = Object.freeze(['files', 'rules', 'profile', 'contract', 'plugin'])

/**
 * `pluginEvidence` is not an input: it is what the plugin half of the check read (`customize-readiness.js`),
 * kept beside the inputs so a result whose plugin could not be read is tried again.
 * @typedef {{ files: string, rules: string, profile: string, contract: string, plugin: string, pluginEvidence?: { state: string, checkedAt: string, digests: (string | null)[], expected: string[] } }} ReadinessInputs
 */

const digest = (/** @type {string | Buffer} */ data) =>
  createHash('sha256').update(data).digest('hex').slice(0, 32)

/** A relative module or file named in source: `from './x.js'`, `import('./x.js')`, `new URL('./x', …)`. */
const RELATIVE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g

/**
 * Every file the check's code reaches from `entry`, through relative imports, as absolute paths.
 * @param {string} entry
 * @returns {string[]}
 */
export function codeFilesOf(entry) {
  const seen = new Set()
  const todo = [entry]
  while (todo.length > 0) {
    const file = /** @type {string} */ (todo.pop())
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.m?js$/.test(file)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(RELATIVE)) {
      const target = path.resolve(path.dirname(file), m[1])
      try {
        if (statSync(target).isFile()) todo.push(target)
      } catch {
        // A folder (`new URL('../contracts', …)`) or a path built at run time: not code.
      }
    }
  }
  return [...seen].sort()
}

let rulesMemo = /** @type {string | null} */ (null)

/** The version of the rule set this server runs: its code and `rule-severity.json`. */
export function rulesVersion() {
  if (rulesMemo !== null) return rulesMemo
  try {
    const files = [...codeFilesOf(RUNNER).filter((f) => !PER_TEMPLATE.has(f)), SEVERITY]
    const parts = [...new Set(files)].map((f) => `${path.relative(LIBRARY, f)}:${digest(readFileSync(f))}`)
    rulesMemo = digest(parts.join('\n'))
  } catch (e) {
    // Never stop the sweep over this: a fixed value, so an unreadable tree re-checks nothing by itself.
    rulesMemo = digest(`unreadable:${e instanceof Error ? e.message : String(e)}`)
  }
  return rulesMemo
}

/**
 * The version of one template's own rows in the profile table: every row of the release it is, or
 * stands for (the lookup may borrow a lower version's row, so all of them count).
 * @param {string} tag @param {any} [table]
 */
export function profileVersionOf(tag, table = TEMPLATE_PROFILES) {
  return digest(JSON.stringify(table?.releases?.[publishedTagOf(tag)] ?? null))
}

/** Every file under a contract profile's folder, digested once per process (the image is fixed). */
const folderMemo = new Map()
function folderDigest(dir) {
  if (folderMemo.has(dir)) return folderMemo.get(dir)
  const parts = []
  const walk = (/** @type {string} */ at) => {
    for (const name of readdirSync(at).sort()) {
      const full = path.join(at, name)
      if (statSync(full).isDirectory()) walk(full)
      else parts.push(`${path.relative(dir, full)}:${digest(readFileSync(full))}`)
    }
  }
  try {
    walk(dir)
    // The design file sits beside the folder (`contracts.js` `designOf`).
    if (existsSync(`${dir}.design.json`)) parts.push(`design:${digest(readFileSync(`${dir}.design.json`))}`)
  } catch (e) {
    parts.push(`unreadable:${e instanceof Error ? e.message : String(e)}`)
  }
  const value = digest(parts.join('\n'))
  folderMemo.set(dir, value)
  return value
}

let pinsMemo = /** @type {Record<string, any> | null} */ (null)
const shippedPins = () => {
  if (pinsMemo === null) {
    try {
      pinsMemo = JSON.parse(readFileSync(PINS_FILE, 'utf8'))
    } catch {
      pinsMemo = {}
    }
  }
  return /** @type {Record<string, any>} */ (pinsMemo)
}

/**
 * The version of the contract a release version is judged with: the profile `contractFor` picks
 * (its id and every file in it) and the release's pin in `quickstarts.json`.
 * @param {string} tag @param {string} version
 * @param {{ contracts?: import('./contracts.js').ContractIndex, pins?: Record<string, any> }} [opts]
 */
export function contractVersionOf(tag, version, { contracts, pins } = {}) {
  const sealed = contractFor(contracts ?? defaultContracts(), tag, version)
  const pin = (pins ?? shippedPins())[publishedTagOf(tag)] ?? null
  return digest(
    JSON.stringify({
      contract: sealed ? { id: sealed.id, files: folderDigest(sealed.dir) } : null,
      pin
    })
  )
}

/**
 * What claude-cowork's `update.json` named per platform when this process last read it
 * (`customize-readiness.js` reads it before each sweep): `'unread'` until a first answer, and a
 * failed read keeps the last answer, so one network blip re-checks nothing.
 * @type {Record<string, { version: string, package: string } | null | 'unread'>}
 */
const fleetLatest = { joomla: 'unread', wordpress: 'unread' }

/** @param {string} platform */
export const fleetLatestOf = (platform) => fleetLatest[platform] ?? 'unread'

/**
 * @param {string} platform
 * @param {{ version: string, package: string } | null | 'unread'} value `'unread'` keeps what was known
 */
export function setFleetLatest(platform, value) {
  if (value !== 'unread') fleetLatest[platform] = value
}

/**
 * Which Claude Cowork plugin a new site of this release version gets (`coworkSelection`), and the
 * contract that seals it.
 * @param {any} release a row of `readReleases`
 * @param {{ contracts?: import('./contracts.js').ContractIndex, pins?: Record<string, any>, latest?: { version: string, package: string } | null | 'unread' }} [opts]
 */
export function pluginSelectionOf(release, { contracts, pins, latest } = {}) {
  const { tag } = release
  const version = release.setting?.version
  const platform = release.setting?.platform ?? release.platform
  const sealed = contractFor(contracts ?? defaultContracts(), tag, version)
  const file = release.setting?.install?.cowork
  const asset = file ? (release.assets ?? []).find((/** @type {any} */ a) => a.name === file.file) : null
  const own = file?.file
    ? { file: file.file, sha256: file.sha256, bytes: asset?.size ?? null, githubAssetId: asset?.id ?? null }
    : null
  const selection = coworkSelection({
    platform,
    tag,
    version,
    own,
    contract: sealed,
    pins: pins ?? shippedPins(),
    latest: latest === undefined ? fleetLatestOf(platform) : latest
  })
  return { contract: sealed, selection }
}

/**
 * The version of the plugin a release version is judged with: every candidate's address and digest.
 * @param {any} release @param {Parameters<typeof pluginSelectionOf>[1]} [opts]
 */
export function pluginVersionOf(release, opts) {
  const { contract, selection } = pluginSelectionOf(release, opts)
  if (!contract || selection.source === 'none') return digest('none')
  return digest(
    JSON.stringify(
      selection.candidates.map((c) => [
        c.role,
        c.version,
        c.file,
        c.url,
        c.sha256 ?? null,
        c.githubAssetId ?? null
      ])
    )
  )
}

/**
 * The inputs this server would judge a release version with now.
 * @param {any} release a row of `readReleases`
 * @param {string} files the release's `fingerprintOf`
 * @param {{ profiles?: any, contracts?: import('./contracts.js').ContractIndex, pins?: Record<string, any>, rules?: string, latest?: { version: string, package: string } | null | 'unread' }} [opts]
 *   test seams: another profile table, contract index, pins, rules version or fleet latest
 * @returns {ReadinessInputs}
 */
export function currentInputs(release, files, opts = {}) {
  return {
    files,
    rules: opts.rules ?? rulesVersion(),
    profile: profileVersionOf(release.tag, opts.profiles),
    contract: contractVersionOf(release.tag, release.setting?.version, opts),
    plugin: pluginVersionOf(release, opts)
  }
}

/**
 * The inputs that differ between a stored result and now, by name. A result stored before inputs
 * were recorded differs in all of them: nobody knows what it was judged with.
 * @param {Partial<ReadinessInputs> | null | undefined} stored
 * @param {ReadinessInputs} now
 * @returns {string[]}
 */
export function changedInputs(stored, now) {
  if (!stored || typeof stored !== 'object') return [...INPUT_KEYS]
  return INPUT_KEYS.filter((k) => stored[k] !== now[k])
}
