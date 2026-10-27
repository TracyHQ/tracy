#!/usr/bin/env node
/**
 * Write the channel file a release publishes — `<channel>-mac.yml` from the command line (the one
 * electron-updater's generic provider reads; electron-builder writes it as `latest-mac.yml`; this app
 * is packaged by hand, so `build/release.sh` calls this instead), and the Windows and Linux ones
 * through `channelYml({ platform })` (build/update-channel.cjs `channelFile` names them).
 *
 *   RELEASE_DATE=<iso, optional> BUILD_ID=<id, optional> RELEASE_FOLDER=<channel/version/build id, optional> \
 *     node build/release-feed.mjs <version> <artifact>...   > dev-mac.yml
 *
 * Every artifact of the release goes in ONE file — arm64 and x64 alike; MacUpdater on Apple silicon
 * takes the zip whose name carries `arm64`, and on Intel one whose name does not (`-x64`).
 *
 * `buildId` (top-level, optional) names the exact build behind the version: the release preflight
 * (`feat/desktop-release`) reads it back to refuse replacing a published version with another build.
 *
 * The minimum version policy (tasks/todo-desktop-update-policy.md C1) is three optional top-level lines,
 * one set: `minimumVersion`, `minimumVersionAfter` (an ISO time with its timezone) and `policyRevision`
 * (an integer that only grows, independent of the app version). They sit inside the signed bytes of the
 * channel file (src/feed-signature.js signs the whole text), so they need no signature of their own.
 */

import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The oldest macOS the packaged app opens on — the `LSMinimumSystemVersion` of the Electron it is built
 * from (Electron 44 dropped macOS 12, so 13.0; 0.3.0 on Electron 40 still opened on 12). Written into
 * every channel file as `minimumSystemVersion`, so electron-updater on an older Mac skips the update
 * and keeps the app it has, instead of installing one that never opens. electron-updater compares it
 * with `os.release()`, which on a Mac is the DARWIN version (macOS 13 = Darwin 22). A test reads
 * Electron's own Info.plist, so an Electron bump that raises the floor fails until this follows.
 */
export const MAC_FLOOR = Object.freeze({ macOS: '13.0', darwin: '22.0.0' })

/** `X.Y.Z` for stable, `X.Y.Z-dev.N` for dev candidates — semver orders them as the updater does. */
export const VERSION_RE = /^\d+\.\d+\.\d+(-dev\.\d+)?$/
const PLAIN_RE = /^[A-Za-z0-9._-]+$/
// Same shape tracy-web's feed door serves (apps/tracy-web/src/desktop/update-feed.js).
const RELEASE_URL_RE =
  /^(?:stable|dev)\/\d+\.\d+\.\d+(?:-dev\.\d+)?\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * The file name of a release artifact (contract: tasks/todo-desktop-windows.md §4).
 *   mac    `<variant>-<version>-<arch>.zip|dmg` (arch: arm64, x64, universal)
 *   win    `<variant>-<version>-win-<arch>-setup.exe`
 *   linux  `<variant>-<version>-linux-<arch>.AppImage|deb`
 * @param {{ channel: 'stable' | 'dev', version: string, arch: string, ext: string, platform?: 'mac' | 'win' | 'linux' }} input
 * @returns {string} e.g. `Tracy-Cowork-Dev-0.2.1-arm64.zip`.
 */
export function artifactName({ channel, version, arch, ext, platform = 'mac' }) {
  const variant = channel === 'dev' ? 'Tracy-Cowork-Dev' : 'Tracy-Cowork'
  if (!(EXTENSIONS[platform] ?? []).includes(ext)) throw new Error(`a ${platform} artifact is never .${ext}`)
  if (platform === 'win') return `${variant}-${version}-win-${arch}-setup.exe`
  if (platform === 'linux') return `${variant}-${version}-linux-${arch}.${ext}`
  return `${variant}-${version}-${arch}.${ext}`
}

/** `2026-10-20T00:00:00Z` or `2026-10-20T07:00:00.000+07:00` — never a time without its zone. */
const ISO_ZONED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
const POLICY_KEYS = Object.freeze(['minimumVersion', 'minimumVersionAfter', 'policyRevision'])

/**
 * Order two versions of the forms `X.Y.Z` and `X.Y.Z-dev.N` (a release ranks above its dev builds) —
 * the same order build/release-preflight.mjs `compareVersions` and the updater use.
 * @returns {number} negative, zero or positive.
 */
function versionOrder(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-dev\.(\d+))?$/.exec(v)
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])]
  }
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

/**
 * Throws, saying how to fix it, unless `policy` is a well-formed minimum version policy a channel file
 * of `version` may carry.
 * @param {unknown} policy
 * @param {string} version - the version the channel file offers; its form names the channel.
 */
export function checkPolicy(policy, version) {
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy))
    throw new Error(`a minimum version policy is an object, got: ${JSON.stringify(policy)}`)
  const unknown = Object.keys(policy).filter((k) => !POLICY_KEYS.includes(k))
  if (unknown.length > 0) throw new Error(`a minimum version policy has no field ${unknown.join(', ')}`)
  const { minimumVersion: min, minimumVersionAfter: after, policyRevision: revision } = policy
  if (!Number.isSafeInteger(revision) || revision <= 0)
    throw new Error(`policyRevision must be a whole number above 0, got: ${JSON.stringify(revision)}`)
  if (min !== undefined) {
    if (typeof min !== 'string' || !VERSION_RE.test(min))
      throw new Error(`minimumVersion must be X.Y.Z or X.Y.Z-dev.N, got: ${JSON.stringify(min)}`)
    if (!version.includes('-dev.') && min.includes('-dev.'))
      throw new Error(`a stable channel file cannot require the dev build ${min}; name a stable version`)
    if (versionOrder(min, version) > 0)
      throw new Error(
        `minimumVersion ${min} is above ${version}, the version this channel file offers — a blocked app would have nothing to update to`
      )
  }
  if (after !== undefined) {
    if (min === undefined)
      throw new Error('minimumVersionAfter says when minimumVersion starts; there is no minimumVersion')
    if (typeof after !== 'string' || !ISO_ZONED_RE.test(after) || Number.isNaN(Date.parse(after)))
      throw new Error(
        `minimumVersionAfter must be an ISO time with its timezone (2026-10-20T00:00:00Z), got: ${JSON.stringify(after)}`
      )
  }
}

/** The policy's lines, in the order a channel file carries them. @param {object | undefined} policy */
function policyLines(policy) {
  if (policy === undefined || policy === null) return []
  return [
    ...(policy.minimumVersion === undefined ? [] : [`minimumVersion: ${policy.minimumVersion}`]),
    ...(policy.minimumVersionAfter === undefined
      ? []
      : [`minimumVersionAfter: '${policy.minimumVersionAfter}'`]),
    `policyRevision: ${policy.policyRevision}`
  ]
}

/**
 * The minimum version policy a channel file carries, or null when it carries none (revision 0).
 * Throws when the lines are there but not a well-formed set.
 * @param {string} yml
 * @returns {{ minimumVersion?: string, minimumVersionAfter?: string, policyRevision: number } | null}
 */
export function readPolicy(yml) {
  const found = {}
  for (const key of POLICY_KEYS) {
    const lines = [...String(yml).matchAll(new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'gm'))]
    if (lines.length > 1) throw new Error(`the channel file has ${lines.length} ${key} lines`)
    if (lines.length === 1) found[key] = lines[0][1].replace(/^(['"])(.*)\1$/, '$2')
  }
  if (Object.keys(found).length === 0) return null
  if (found.policyRevision === undefined)
    throw new Error('the channel file has a minimum version but no policyRevision')
  if (!/^\d+$/.test(found.policyRevision))
    throw new Error(`the channel file's policyRevision is not a whole number: ${found.policyRevision}`)
  const policy = { ...found, policyRevision: Number(found.policyRevision) }
  const version = /^version:[ \t]*['"]?([^'"\s]+)/m.exec(String(yml))?.[1]
  checkPolicy(policy, version && VERSION_RE.test(version) ? version : '999999.0.0-dev.999999')
  return policy
}

/**
 * Are two policies (as `readPolicy` returns them, null for none) the same set — all three fields?
 * @param {object | null} a
 * @param {object | null} b
 */
export function comparePolicy(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null)
  return POLICY_KEYS.every((key) => a[key] === b[key])
}

/**
 * The channel file `yml` carrying `policy` instead of the one it has — every other byte kept, the
 * lines where `channelYml` puts them (before the release notes block, which is always last). This is
 * how `build/release.mjs set-minimum` changes a published file without rebuilding it.
 *
 * Refuses a replay: a policy whose revision is below the file's, or equal to it with other values.
 * @param {string} yml
 * @param {{ minimumVersion?: string, minimumVersionAfter?: string, policyRevision: number }} policy
 */
export function withPolicy(yml, policy) {
  const version = /^version:[ \t]*['"]?([^'"\s]+)/m.exec(yml)?.[1]
  if (!version || !VERSION_RE.test(version)) throw new Error('the channel file has no readable version line')
  checkPolicy(policy, version)
  const old = readPolicy(yml)
  if (old !== null) {
    if (policy.policyRevision < old.policyRevision)
      throw new Error(
        `replay refused: the channel file already carries policy revision ${old.policyRevision}, newer than revision ${policy.policyRevision}`
      )
    if (policy.policyRevision === old.policyRevision) {
      if (comparePolicy(old, policy)) return yml
      throw new Error(
        `policy revision ${old.policyRevision} already names another policy in this channel file — a change takes the next revision`
      )
    }
  }
  const lines = yml.split('\n').filter((line) => !POLICY_KEYS.some((key) => line.startsWith(`${key}:`)))
  let at = lines.findIndex((line) => line.startsWith('releaseNotes:'))
  // The text ends with a newline: its last "line" is empty, and the policy goes before it.
  if (at === -1) at = lines.at(-1) === '' ? lines.length - 1 : lines.length
  lines.splice(at, 0, ...policyLines(policy))
  return lines.join('\n')
}

/** What each platform ships. */
const EXTENSIONS = Object.freeze({ mac: ['zip', 'dmg'], win: ['exe'], linux: ['AppImage', 'deb'] })
/** The archs a Windows release must hold: one installer each, in one channel file. */
const WIN_ARCHS = Object.freeze(['x64', 'arm64'])

/**
 * @param {string} file
 * @returns {Promise<{ url: string, sha512: string, size: number }>} `url` is the bare file name: the
 *   feed serves every artifact next to the channel file.
 */
export async function describeFile(file) {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return { url: path.basename(file), sha512: hash.digest('base64'), size: statSync(file).size }
}

/**
 * The channel file of one platform (and, on Linux, one arch). Every platform lists its artifacts with
 * size and base64 sha512, and repeats the first one as the top-level `path`/`sha512` electron-updater
 * reads when `files` is absent (old clients), as electron-builder writes it.
 *
 *   mac    the zips first (Squirrel.Mac installs only from one; MacUpdater takes the one of its chip),
 *          the dmgs after, and `minimumSystemVersion` (macOS only: it is compared with `os.release()`).
 *   win    exactly one installer per arch, x64 then arm64 — NsisUpdater takes the exe whose name holds
 *          `process.arch` and otherwise the first, so a missing arch would install the other one.
 *   linux  this arch only: its AppImage (what AppImageUpdater installs) first, its .deb (the download
 *          link of a .deb install) after; another arch's file would be taken by an AppImage that finds
 *          none of its own.
 * @param {{ version: string, releaseDate: string, buildId?: string, releaseNotes?: string,
 *   platform?: 'mac' | 'win' | 'linux', arch?: string,
 *   policy?: { minimumVersion?: string, minimumVersionAfter?: string, policyRevision: number } | null,
 *   files: { url: string, sha512: string, size: number }[] }} input - `releaseNotes`: the plain-text
 *   notes `build/release.mjs prepare` froze into the manifest; written as a YAML literal block.
 *   `policy`: the minimum version policy (`checkPolicy`); none writes no line, as before it existed.
 * @returns {string}
 */
export function channelYml({
  version,
  releaseDate,
  buildId,
  releaseNotes,
  files,
  platform = 'mac',
  arch,
  policy
}) {
  if (!VERSION_RE.test(version)) throw new Error(`version must be X.Y.Z or X.Y.Z-dev.N, got: ${version}`)
  if (policy !== undefined && policy !== null) checkPolicy(policy, version)
  if (buildId !== undefined && !PLAIN_RE.test(buildId))
    throw new Error(`build id must be letters, digits, dot, dash or underscore, got: ${buildId}`)
  const names = files.map((f) => f.url)
  if (new Set(names).size !== names.length)
    throw new Error(`an artifact is listed twice: ${names.join(', ')}`)
  // A zip of another version in this file would install a build the version line does not name.
  for (const n of names)
    if (!path.posix.basename(n).includes(`-${version}-`))
      throw new Error(`artifact ${n} is not version ${version}`)
  const ordered = ORDER[platform]?.(files, arch)
  if (!ordered) throw new Error(`unknown platform: ${platform}`)
  for (const f of ordered)
    if (!(PLAIN_RE.test(f.url) || RELEASE_URL_RE.test(f.url)) || f.url.includes('..'))
      throw new Error(`artifact must be a plain file name or <channel>/<version>/<build id>/<file>: ${f.url}`)
  const first = ordered[0]
  return [
    `version: ${version}`,
    'files:',
    ...ordered.flatMap((f) => [`  - url: ${f.url}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`]),
    `path: ${first.url}`,
    `sha512: ${first.sha512}`,
    `releaseDate: '${releaseDate}'`,
    ...(platform === 'mac' ? [`minimumSystemVersion: ${MAC_FLOOR.darwin}`] : []),
    ...(buildId === undefined ? [] : [`buildId: ${buildId}`]),
    ...policyLines(policy),
    ...notesBlock(releaseNotes),
    ''
  ].join('\n')
}

/** Each platform's rule for which files its channel file holds, in which order. Throws when wrong. */
const ORDER = {
  mac: (files) => {
    const ordered = [...files].sort((a, b) => Number(b.url.endsWith('.zip')) - Number(a.url.endsWith('.zip')))
    if (!ordered[0]?.url.endsWith('.zip'))
      throw new Error('a mac channel file needs a .zip: Squirrel.Mac installs only from one')
    return ordered
  },
  win: (files) => {
    for (const f of files)
      if (!/-win-(?:x64|arm64)-setup\.exe$/.test(f.url))
        throw new Error(`${f.url} is not a Windows installer`)
    return WIN_ARCHS.map((arch) => {
      const own = files.filter((f) => f.url.endsWith(`-win-${arch}-setup.exe`))
      if (own.length !== 1)
        throw new Error(
          `no installer for ${arch}: a Windows channel file lists one per arch (${WIN_ARCHS.join(', ')}), or NsisUpdater installs the wrong one`
        )
      return own[0]
    })
  },
  linux: (files, arch) => {
    if (arch !== 'x64' && arch !== 'arm64')
      throw new Error(`a Linux channel file is per arch (x64, arm64), got: ${arch}`)
    for (const f of files)
      if (!new RegExp(`-linux-${arch}\\.(?:AppImage|deb)$`).test(f.url))
        throw new Error(`${f.url} is not linux-${arch}`)
    const appImage = files.filter((f) => f.url.endsWith('.AppImage'))
    const deb = files.filter((f) => f.url.endsWith('.deb'))
    if (appImage.length !== 1)
      throw new Error(`no AppImage for ${arch}: it is what a Linux install updates from`)
    if (deb.length > 1) throw new Error(`more than one .deb for ${arch}`)
    return [...appImage, ...deb]
  }
}

/**
 * The `releaseDate` a channel file carries (as `channelYml` writes it), or undefined.
 * @param {string} yml
 */
export function releaseDateOf(yml) {
  return /^releaseDate: '([^']+)'$/m.exec(yml)?.[1]
}

/** @param {string | undefined} notes */
function notesBlock(notes) {
  const lines = (notes ?? '').split(/\r?\n/).map((line) => line.trimEnd())
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()
  while (lines.length > 0 && lines[0] === '') lines.shift()
  // `|-`: the lines exactly as written, no trailing newline; indentation makes any character safe.
  return lines.length === 0 ? [] : ['releaseNotes: |-', ...lines.map((line) => (line ? `  ${line}` : ''))]
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, ...artifacts] = process.argv.slice(2)
  if (!version || artifacts.length === 0) {
    process.stderr.write('usage: release-feed.mjs <version> <artifact>...\n')
    process.exit(2)
  }
  const folder = process.env.RELEASE_FOLDER?.replace(/\/+$/, '')
  const files = (await Promise.all(artifacts.map(describeFile))).map((f) =>
    folder ? { ...f, url: `${folder}/${f.url}` } : f
  )
  process.stdout.write(
    channelYml({
      version,
      releaseDate: process.env.RELEASE_DATE || new Date().toISOString(),
      buildId: process.env.BUILD_ID || undefined,
      files
    })
  )
}
