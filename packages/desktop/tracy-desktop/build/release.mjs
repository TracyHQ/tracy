#!/usr/bin/env node
/**
 * Release a desktop build in two steps that never meet (tasks/todo-desktop-release.md §2.2):
 *
 *   node build/release.mjs prepare --variant stable|dev --sha <rev> --target <store>
 *       [--version X.Y.Z-dev.N] [--arch arm64[,x64]] [--build-id <id>] [--notes <file> (dev only)]
 *       [--work-dir <dir>] [--feed <test feed url>]
 *       [--win-linux-run <run id> | --win-linux-dir <dir> [--allow-manual-win-linux "<why>"]]
 *       [--min-version <v> [--min-version-after <iso>] --min-version-reason "<why>" [--lower-min-version]
 *        | --clear-min-version --min-version-reason "<why>"]
 *   node build/release.mjs publish --manifest <path|url|store key> --digest <sha256> --target <store>
 *       [--public-url <feed url>] [--no-push-tag] [--waive <check>[,<check>]]
 *       [--docs-origin <url> (else DOCS_ORIGIN, else the channel's: docs.tracy.ai / docs.tracy.site)]
 *       [--skip-docs-check (dev only)]
 *   node build/release.mjs set-minimum --channel stable|dev --target <store> --reason "<why>"
 *       (--min-version <v> [--min-version-after <iso>] [--lower-min-version] | --clear-min-version) [--resume]
 *   node build/release.mjs tools      are 7zz, unsquashfs and bsdtar here (what publish unpacks with)?
 *
 * ONE RELEASE = MAC + WINDOWS + LINUX (tasks/todo-desktop-windows.md rule R): one prepare makes one
 * candidate of all three, at one sha, one version, one build id, one release date, one set of notes;
 * publish refuses a manifest missing any platform or arch (`releaseGaps`).

 * PREPARE (on the iMac, where the Developer ID is): a clean checkout of <sha> in a temporary git
 * worktree (never the working tree), the variant built there by ITS OWN `build/package.sh` (signed,
 * notarized, stapled), zipped and imaged by `build/release.sh`, uploaded to
 * `<variant>/<version>/<build id>/` on the target with a `manifest.json` that freezes everything
 * publish needs — including the exact channel file. It writes NO channel file: until publish, no
 * client is offered the build. It prints the manifest's sha256, the digest publish takes.
 *
 * RELEASE NOTES are the docs changelog page's (build/release-notes-page.mjs): prepare reads
 * `apps/tracy-docs/src/content/docs/changelog/desktop/<X.Y>.md` at the sha — Highlights for X.Y.0, the
 * `## X.Y.Z` section for a patch — and freezes them with their hash; stable without them is refused.
 * Publish then waits for the docs host to serve that page and its markdown with the same section.
 *
 * PUBLISH (no build, anywhere): the manifest whose sha256 is the digest given, judged by
 * `build/release-preflight.mjs` against what is on the target right now (every artifact downloaded
 * and hashed, the signature and arch of the app inside EVERY zip and dmg, the version, arch and fuses
 * of the app inside every Windows / Linux artifact, each channel file's version), under a lock only one
 * publisher holds. Every channel file is signed with Tracy's Ed25519 feed key
 * (`~/TracyHQ/.infra/tracy-feed-ed25519.key`, build/feed-key.mjs) and the signature must verify with the
 * keys the candidate pins (src/feed-key.js); the `.sig` files go up first, then the channel files,
 * exactly as frozen, LAST, each with a conditional write (it must still be the one the checks read),
 * and everything is read back. Stable then tags `desktop-vX.Y.Z` at the sha.
 *
 * WINDOWS + LINUX: prepare starts `.github/workflows/desktop-win-linux.yml` for the same candidate before
 * the Mac build (`gh workflow run` on `main` for stable — the production lane's runner — and `develop`
 * for dev; the workflow refuses a sha that is not on that branch), and while the Mac apps build here, the
 * runner builds the installers and leaves them in a draft release `desktop-win-linux-<run id>` (never an
 * Actions artifact: their org-wide quota blocked 0.6.0). Prepare then downloads them and the run's build record, and uploads
 * nothing unless the record names this exact candidate (sha, version, build id, date, origin, feed, and
 * the Electron and lockfile of the Mac build) and every file is the six the contract names, with the
 * bytes the record lists (build/release-win-linux.mjs). A dispatch needs the workflow on the default
 * branch; until it is there (it lands with the line's PR), `--win-linux-run <id>` takes a run that
 * already finished — its build id and release date become the candidate's. A run that a push started was
 * never checked to be on origin: only a test target takes it. `--win-linux-dir <dir>` takes installers
 * packed by hand in the pinned builder image (runbook §4 ②c) — a test target always, a real store only
 * with `--allow-manual-win-linux "<why>"`, whose reason the manifest keeps (`platforms.win.run.reason`).
 * A publish to a real store deletes the run's draft release (`discardWinLinux`); a sweep in the workflow
 * deletes drafts older than 14 days.
 *
 * A manifest (schema 2) holds the platforms: `files[].platform`, one `channels[]` entry per channel file
 * (build/update-channel.cjs `channelFile`) — `<ch>-mac.yml`, `<ch>.yml`, `<ch>-linux.yml`,
 * `<ch>-linux-arm64.yml`. A schema 1 manifest is a Mac release: still read, never published.
 *
 * Keys: a dev prepare or publish uses RELEASES_S3_ACCESS_KEY / RELEASES_S3_SECRET_KEY from the
 * environment (scoped to `tracy-releases-dev`). Anything aimed at the STABLE store, and every stable
 * publish (even to a test folder), reads its key only from `~/TracyHQ/.infra/tracy-releases-stable.env`
 * on the iMac (`readStableKey`), never from a variable a run could set.
 *
 * Stores (build/release-store.mjs): `/abs/folder`, `file:///abs/folder`, or `s3://<bucket>/<prefix>`
 * with RELEASES_S3_ENDPOINT. Two REAL stores, one channel each (`checkTarget`): stable is
 * `s3://tracy-releases/desktop` (update.tracy.ai), dev is `s3://tracy-releases-dev/desktop`
 * (update.tracy.site). Any other target is a test target.
 *
 * `--feed` builds the candidate against a TEST feed (a private stand's update door) instead of its
 * channel's own (build/update-channel.cjs `feedFor`), so the whole chain — install, self-update — can
 * be proven on a stand. The manifest records it; no real store takes such a candidate.
 *
 * `--waive` is for proving the pipeline on a TEST target from a sha that is not on origin yet: the
 * named checks still run and print WAIVED. Refused for stable and for both real stores.
 *
 * MINIMUM VERSION (tasks/todo-desktop-update-policy.md C1–C3): every channel file carries the channel's
 * policy `{ minimumVersion?, minimumVersionAfter?, policyRevision }` inside its signed bytes
 * (build/release-feed.mjs). prepare reads it, with each file's ETag, before building and carries it
 * over unless its flags change it (build/release-policy.mjs `nextPolicy`); the manifest records what
 * was read (`policy.read`) and what will be written (`policy.next`). publish, under its lock, refuses a
 * candidate when any channel file differs from `policy.read` — a candidate made before a lock was raised
 * or lowered must never put the old one back — and no flag passes that. set-minimum changes the policy
 * of a live channel without a release, under the same lock; `--resume` finishes one that stopped half
 * way. Every change is a line in `<channel>/policy-log.jsonl` on the target.
 */
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, hostname, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { nonEnglishLines } from './english.mjs'
import { thirdPartyLines } from './third-party-names.mjs'
import { readFeedSigningKey } from './feed-key.mjs'
import { bundleNotesProblems, docsServeNotes, notesForRelease, notesSha256 } from './release-notes-page.mjs'
import { UNPACK_TOOL, extractPayload, missingUnpackers } from './payload.mjs'
import {
  artifactName,
  channelYml,
  comparePolicy,
  describeFile,
  readPolicy,
  releaseDateOf,
  withPolicy
} from './release-feed.mjs'
import {
  CHANNELS,
  checkFeedUnchanged,
  compareVersions,
  containerProblems,
  gatherFacts,
  parseFeed,
  preflight,
  readContainer
} from './release-preflight.mjs'
import {
  agreedPolicy,
  channelFilesOf,
  describePolicy,
  nextPolicy,
  readFeedPolicies
} from './release-policy.mjs'
import { openStore, realStoreChannel } from './release-store.mjs'
import { githubWinLinux, localWinLinux } from './release-win-linux.mjs'
import updateChannel from './update-channel.cjs'
import { CI_REPOSITORY } from '../../../../scripts/ci/ci-repository.mjs'

const require = createRequire(import.meta.url)
const { publicKeyText, signFeed, verifyFeed } = require('../src/feed-signature.js')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = 'packages/desktop/tracy-desktop'
const LOCK = '.publish.lock'
const MANIFEST = 'manifest.json'
/**
 * The manifest's shape. 1: one Mac release (`channelFile`, `channelYml`, Mac fields at the top). 2: a
 * release of one or more platforms — `platforms.<mac|win|linux>`, `files[].platform`, and `channels[]`
 * (`{ platform, arch?, file, yml }`, one per channel file). `readManifest` reads both; a schema 1
 * manifest is a Mac release.
 */
const MANIFEST_SCHEMA = 2
const BUILD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
/** The stable store's write key, on the iMac (`readStableKey`). */
const STABLE_KEY_FILE = path.join(homedir(), 'TracyHQ/.infra/tracy-releases-stable.env')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** What `lipo -archs` must print for the app inside each kind of artifact. */
const EXPECT_ARCHS = Object.freeze({ arm64: ['arm64'], x64: ['x86_64'], universal: ['arm64', 'x86_64'] })

/** @param {string} command @param {string[]} args @param {object} [options] */
const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })

/**
 * May this candidate go to this target? A REAL store (release-store.mjs) takes only its own channel,
 * built against that channel's own feed, with no check waived; a test target takes anything. Throws
 * with the reason. Both prepare and publish ask, so a wrong pairing stops before a build and again
 * before the channel file.
 * @param {{ variant: 'stable' | 'dev', target?: string, feed: string, waive?: string[] }} input
 */
export function checkTarget({ variant, target, feed, waive = [] }) {
  if (waive.length > 0 && variant === 'stable')
    throw new Error('--waive is for a dev publish to a test target only')
  if (target === undefined) return
  const real = realStoreChannel(target)
  if (real === null) return
  const bucket = target.slice('s3://'.length).split('/')[0]
  if (real !== variant) throw new Error(`${bucket} serves ${real} only; this candidate is ${variant}`)
  if (waive.length > 0) throw new Error(`--waive is for a dev publish to a test target only, not ${bucket}`)
  const own = updateChannel.feedFor(variant)
  if (feed !== own)
    throw new Error(
      `this candidate was built against the test feed ${feed}; ${bucket} takes only ${own} builds`
    )
}

// ── prepare ──────────────────────────────────────────────────────────────────────────────────────

/** The archs every Windows and Linux release ships (tasks/todo-desktop-windows.md §4). */
const WIN_LINUX_ARCHS = Object.freeze(['x64', 'arm64'])
/** What each kind of artifact is served as (the same types the update host sends, apps/tracy-web update-feed.js). */
const CONTENT_TYPES = Object.freeze({
  zip: 'application/zip',
  dmg: 'application/x-apple-diskimage',
  exe: 'application/vnd.microsoft.portable-executable',
  AppImage: 'application/vnd.appimage',
  deb: 'application/vnd.debian.binary-package'
})

/**
 * The Windows + Linux files of a run, checked against the candidate before anything is uploaded: the
 * run's record must name this sha, variant, version, build id, release date, origin and feed, and the
 * Electron and lockfile the Mac half was built with (same sha, same tree); the files must be exactly
 * the six the contract names, each with the bytes the record lists. Throws with the first difference.
 * @param {{ run: { id: string, url: string }, info: object, artifacts: string[] }} got
 * @param {{ sha: string, variant: 'stable' | 'dev', version: string, buildId: string, releaseDate: string,
 *   feed: string, origin: string, electronVersion: string, lockfileSha256: string }} want
 */
async function winLinuxFiles({ run, info, artifacts }, want) {
  const where = `the Windows/Linux run ${run?.url ?? run?.id}`
  for (const [field, label] of [
    ['sha', 'sha'],
    ['variant', 'variant'],
    ['version', 'version'],
    ['buildId', 'build id'],
    ['releaseDate', 'release date'],
    ['origin', 'origin'],
    ['feed', 'feed'],
    ['electronVersion', 'Electron'],
    ['lockfileSha256', 'lockfile']
  ])
    if (info?.[field] !== want[field])
      throw new Error(`${where} built ${label} ${info?.[field]}, this candidate is ${want[field]}`)
  const expected = []
  for (const platform of ['win', 'linux'])
    for (const arch of WIN_LINUX_ARCHS)
      for (const ext of platform === 'win' ? ['exe'] : ['AppImage', 'deb'])
        expected.push({
          name: artifactName({ channel: want.variant, version: want.version, arch, ext, platform }),
          platform,
          arch,
          kind: ext
        })
  const byName = new Map(artifacts.map((a) => [path.basename(a), a]))
  const names = new Set(expected.map((e) => e.name))
  const stray = [...byName.keys()].filter((n) => !names.has(n))
  if (stray.length > 0) throw new Error(`${where} left files no release names: ${stray.join(', ')}`)
  const recorded = new Map((info.files ?? []).map((f) => [f.name, f]))
  const out = []
  for (const e of expected) {
    const local = byName.get(e.name)
    if (!local) throw new Error(`${where} left no ${e.name}`)
    const described = await describeFile(local)
    const record = recorded.get(e.name)
    if (!record || record.sha512 !== described.sha512 || record.size !== described.size)
      throw new Error(`${e.name} (${described.size} bytes) does not match the run's record`)
    out.push({ ...e, sha512: described.sha512, size: described.size, local })
  }
  return out
}

/**
 * Where prepare may take the Windows + Linux files from, for this target: a finished run (a real store
 * takes only one a release dispatch started — a push run was never checked to be on origin), or a folder
 * packed by hand (a real store takes it only with a stated reason, kept in the manifest). Throws why not.
 * @param {{ runId?: string, dir?: string, manualReason?: string, record: { run?: { trigger?: string } },
 *   realStore: boolean }} input
 */
export function checkWinLinuxSource({ runId, dir, manualReason, record, realStore }) {
  if (runId && dir) throw new Error('--win-linux-run and --win-linux-dir: give one source, not both')
  if (manualReason !== undefined && !dir)
    throw new Error('--allow-manual-win-linux goes with --win-linux-dir only')
  if (manualReason !== undefined && !manualReason.trim())
    throw new Error('--allow-manual-win-linux needs the reason, in words')
  if (runId && realStore && record.run?.trigger !== 'workflow_dispatch')
    throw new Error(
      `run ${runId} was started by ${record.run?.trigger}, not by a release dispatch — a real store takes only those`
    )
  if (dir && realStore && !manualReason)
    throw new Error(
      `a real store takes installers packed by hand only with --allow-manual-win-linux "<why>" (the reason goes into the manifest): ${dir}`
    )
}

/**
 * What a manifest lacks to be ONE release of all three platforms (rule R, tasks/todo-desktop-windows.md
 * §2): the Mac arm64 and x64 zips and the universal dmg, a Windows installer per arch, a Linux AppImage and
 * .deb per arch, and the four channel files. Empty when complete.
 * @param {{ variant: string, files: object[], channels: { file: string }[] }} m - the schema 2 shape
 * @returns {string[]}
 */
export function releaseGaps(m) {
  const gaps = []
  const has = (platform, arch, kind) =>
    m.files.some((f) => f.platform === platform && f.arch === arch && f.kind === kind)
  for (const platform of updateChannel.PLATFORMS)
    if (!m.files.some((f) => f.platform === platform)) gaps.push(`the ${platform} platform`)
  for (const [platform, arch, kind] of [
    ['mac', 'arm64', 'zip'],
    ['mac', 'x64', 'zip'],
    ['mac', 'universal', 'dmg'],
    ...WIN_LINUX_ARCHS.map((arch) => ['win', arch, 'exe']),
    ...WIN_LINUX_ARCHS.flatMap((arch) => [
      ['linux', arch, 'AppImage'],
      ['linux', arch, 'deb']
    ])
  ])
    if (m.files.some((f) => f.platform === platform) && !has(platform, arch, kind))
      gaps.push(`${platform} ${arch} ${kind}`)
  const channelFiles = new Set(m.channels.map((c) => c.file))
  for (const want of [
    updateChannel.channelFile({ channel: m.variant, platform: 'mac' }),
    updateChannel.channelFile({ channel: m.variant, platform: 'win' }),
    ...WIN_LINUX_ARCHS.map((arch) =>
      updateChannel.channelFile({ channel: m.variant, platform: 'linux', arch })
    )
  ])
    if (!channelFiles.has(want)) gaps.push(want)
  return gaps
}

/**
 * @param {{
 *   variant: string, sha: string, version?: string, buildId?: string, releaseDate?: string, archs?: string[],
 *   feed?: string, target?: string, - `buildId` and `releaseDate`: a finished Windows/Linux run's own (--win-linux-run)
 *   notes: { text: string, prs: { number: number, title?: string, url?: string }[], source?: string },
 *   policy?: { minVersion?: string, minVersionAfter?: string, reason?: string, lower?: boolean, clear?: boolean }
 *     - the minimum version flags (build/release-policy.mjs `nextPolicy`); none carries the feed's policy over
 * }} options
 * @param {{
 *   store: ReturnType<typeof openStore>,
 *   resolveSha: (rev: string) => string,
 *   packageVersion: (sha: string) => string,
 *   signingIdentity: () => string | null,
 *   checkout: (sha: string) => Promise<{ dir: string, cleanup: () => Promise<void> }>,
 *   build: (input: { dir: string, variant: 'stable' | 'dev', version: string, buildId: string, archs: string[],
 *     universal: boolean, feed: string, releaseDate: string, releaseNotes: string }) =>
 *     Promise<{ artifacts: string[], containers: Record<string, object>, bundleId: string, origin: string, electronVersion: string,
 *       lockfileSha256: string, feed: string }>, - `containers`: each dmg as an image (release-preflight `readContainer`)
 *   winLinux: (candidate: { sha: string, variant: 'stable' | 'dev', version: string, buildId: string,
 *     releaseDate: string, feed: string }) =>
 *     Promise<{ run: { id: string, url: string }, info: object, artifacts: string[] }>, - the Windows + Linux
 *     installers of that candidate and the record of the run that built them (build/release-win-linux.mjs)
 *   log: (line: string) => void,
 *   now?: () => Date
 * }} deps
 * @returns {Promise<{ manifestKey: string, digest: string, manifest: object }>}
 */
export async function prepare(options, deps) {
  const { variant } = options
  if (variant !== 'stable' && variant !== 'dev')
    throw new Error(
      `prepare builds stable or dev only, got: ${variant} (a Preview is \`pnpm desktop:preview\`)`
    )
  // Both archs by default: a zip per arch is what each Mac updates from, and the two merged into ONE
  // universal app give the dmg a person installs from, whatever their chip. `--arch` narrows to one.
  const archs = options.archs?.length ? options.archs : ['arm64', 'x64']
  for (const arch of archs) if (arch !== 'arm64' && arch !== 'x64') throw new Error(`unknown arch: ${arch}`)
  if (new Set(archs).size !== archs.length) throw new Error(`an arch is listed twice: ${archs.join(',')}`)
  const universal = archs.length === 2

  const sha = deps.resolveSha(options.sha)
  const base = deps.packageVersion(sha)
  let version
  if (variant === 'stable') {
    if (options.version !== undefined && options.version !== base)
      throw new Error(
        `stable is the package version at ${sha.slice(0, 10)}, ${base}; got --version ${options.version}`
      )
    version = base
  } else {
    if (options.version === undefined)
      throw new Error(`a dev build needs --version ${base}-dev.N (N above the dev feed's)`)
    if (!new RegExp(`^${base.replace(/\./g, '\\.')}-dev\\.\\d+$`).test(options.version))
      throw new Error(`a dev version at ${sha.slice(0, 10)} is ${base}-dev.N, got: ${options.version}`)
    version = options.version
  }
  // The feed the bundle's app-update.yml names: the channel's own, or a test run's (a private stand's
  // update door) — which no real store takes (checkTarget).
  const feed = (options.feed ?? updateChannel.feedFor(variant)).replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(feed)) throw new Error(`--feed must be a URL, got: ${feed}`)
  checkTarget({ variant, target: options.target, feed })
  const now = (deps.now ?? (() => new Date()))()
  const buildId =
    options.buildId ??
    `${now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z')}-${sha.slice(0, 7)}`
  if (!BUILD_ID_RE.test(buildId)) throw new Error(`bad build id: ${buildId}`)

  // The notes, from the changelog page at this sha (E5) — before anything is built.
  const notes = notesForRelease({
    variant,
    version,
    sha,
    explicit: options.notes,
    readPage: deps.readPage,
    collect: deps.collectNotes,
    log: deps.log
  })
  const notesText = notes.text.replace(/\r\n?/g, '\n').trim()
  const vietnamese = nonEnglishLines(notesText)
  if (vietnamese.length > 0)
    throw new Error(
      `release notes must be English (a public surface); Vietnamese in: ${vietnamese.join(' | ')}`
    )
  const named = thirdPartyLines(notesText)
  if (named.length > 0)
    throw new Error(
      `release notes name a third party; write the effect the user sees instead of: ${named.join(' | ')}`
    )

  // The minimum version policy, before anything is built: what each channel file carries now (with its
  // ETag — publish refuses this candidate if any of it changes before then), and what this release
  // writes. A flag error stops here, not after an hour of building.
  const policyRead = await readFeedPolicies(deps.store, channelFilesOf(variant))
  const policyNext = nextPolicy({
    current: agreedPolicy(policyRead),
    flags: options.policy ?? {},
    version,
    compare: compareVersions
  })
  deps.log(
    `prepare: minimum version policy ${policyNext.changed ? `changes to ${describePolicy(policyNext.policy)} (${policyNext.reason})` : `carried over: ${describePolicy(policyNext.policy)}`}`
  )

  // Before anything is built: a stable or dev build is Developer ID or nothing.
  const identity = deps.signingIdentity()
  if (!identity)
    throw new Error(
      'prepare needs a Developer ID Application identity on this machine — run it on the iMac, where ' +
        'build/unlock-signing.sh opens the signing keychain (runbook §7). It never falls back to ad-hoc for a feed build.'
    )
  deps.log(
    `prepare: ${variant} ${version} build ${buildId} at ${sha.slice(0, 10)}, ${archs.join('+')}${universal ? '+universal' : ''}, signing as ${identity}`
  )

  const folder = `${variant}/${version}/${buildId}`
  // ONE date for this candidate: every channel file frozen below, the one release.sh writes next to the
  // Mac artifacts and the Windows/Linux run's record all carry it. A finished run brings its own.
  const releaseDate = options.releaseDate ?? now.toISOString()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(releaseDate))
    throw new Error(`bad release date: ${releaseDate}`)
  // The Windows + Linux half runs on GitHub while the Mac half builds here (rule R: one candidate, one
  // sha). Its failure is read after the Mac build — a rejection noted now, so none goes unhandled.
  const winLinuxRun = deps.winLinux({ sha, variant, version, buildId, releaseDate, feed })
  winLinuxRun.catch(() => {})
  const checkout = await deps.checkout(sha)
  try {
    const built = await deps.build({
      dir: checkout.dir,
      variant,
      version,
      buildId,
      archs,
      universal,
      feed,
      releaseDate,
      releaseNotes: notesText
    })
    if (built.feed !== feed) throw new Error(`built against the feed ${built.feed}, asked for ${feed}`)
    const files = []
    for (const file of built.artifacts) {
      const described = await describeFile(file)
      const name = described.url
      const arch = /-(arm64|x64|universal)\.(zip|dmg)$/.exec(name)
      if (!arch) throw new Error(`artifact name names no arch or kind: ${name}`)
      // A universal zip would sit next to the x64 one on an Intel Mac, where the updater takes the
      // first zip it finds: updates come from the per-arch zips only.
      if (arch[1] === 'universal' && arch[2] !== 'dmg')
        throw new Error(`a universal build ships as a dmg only, got: ${name}`)
      files.push({
        name,
        arch: arch[1],
        kind: arch[2],
        sha512: described.sha512,
        size: described.size,
        local: file
      })
    }
    for (const arch of archs)
      if (!files.some((f) => f.arch === arch && f.kind === 'zip'))
        throw new Error(
          `the build made no zip for ${arch}: Macs of that arch would have nothing to update from`
        )
    if (universal && !files.some((f) => f.arch === 'universal' && f.kind === 'dmg'))
      throw new Error('the build made no universal dmg: a person would have nothing to install from')
    // Every dmg is a signed, notarized, stapled image itself — not only the app inside it.
    for (const f of files.filter((x) => x.kind === 'dmg')) {
      const problems = containerProblems(built.containers?.[f.name])
      if (problems.length > 0) throw new Error(`${f.name}: ${problems.join('; ')}`)
    }
    const yml = channelYml({
      version,
      releaseDate,
      buildId,
      releaseNotes: notesText,
      policy: policyNext.policy,
      files: files.map((f) => ({ url: `${folder}/${f.name}`, sha512: f.sha512, size: f.size }))
    })

    const winLinux = await winLinuxRun
    const others = await winLinuxFiles(winLinux, {
      sha,
      variant,
      version,
      buildId,
      releaseDate,
      feed,
      origin: CHANNELS[variant].origin,
      electronVersion: built.electronVersion,
      lockfileSha256: built.lockfileSha256
    })
    const listed = (pred) =>
      others.filter(pred).map((f) => ({ url: `${folder}/${f.name}`, sha512: f.sha512, size: f.size }))
    const frozen = (platform, arch) =>
      channelYml({
        platform,
        arch,
        version,
        releaseDate,
        buildId,
        releaseNotes: notesText,
        policy: policyNext.policy,
        files: listed((f) => f.platform === platform && (arch === undefined || f.arch === arch))
      })
    // Where the six files came from: the run and its draft release, or a folder packed by hand and why.
    const run = {
      id: winLinux.run.id,
      url: winLinux.run.url,
      event: winLinux.run.event ?? null,
      ...(winLinux.run.release ? { release: winLinux.run.release } : {}),
      ...(winLinux.run.reason ? { reason: winLinux.run.reason } : {})
    }
    if (run.reason) deps.log(`prepare: windows/linux packed by hand — ${run.reason}`)
    const manifest = {
      schema: MANIFEST_SCHEMA,
      variant,
      version,
      buildId,
      folder,
      sha,
      lockfileSha256: built.lockfileSha256,
      electronVersion: built.electronVersion,
      origin: built.origin,
      feed,
      platforms: {
        mac: { archs, universal, bundleId: built.bundleId, signedBy: identity },
        win: { archs: [...WIN_LINUX_ARCHS], signed: false, run },
        linux: { archs: [...WIN_LINUX_ARCHS], run }
      },
      files: [
        ...files.map(({ local: _local, ...f }) => ({ platform: 'mac', ...f })),
        ...others.map(({ local: _local, ...f }) => f)
      ],
      channels: [
        { platform: 'mac', file: updateChannel.channelFile({ channel: variant, platform: 'mac' }), yml },
        {
          platform: 'win',
          file: updateChannel.channelFile({ channel: variant, platform: 'win' }),
          yml: frozen('win')
        },
        ...WIN_LINUX_ARCHS.map((arch) => ({
          platform: 'linux',
          arch,
          file: updateChannel.channelFile({ channel: variant, platform: 'linux', arch }),
          yml: frozen('linux', arch)
        }))
      ],
      releaseDate,
      // `contentSha256`: what publish finds again on the docs host before a stable feed moves (E8).
      // `noMedia`: the Highlights the page says have no picture or clip, and why (release-notes-page.mjs
      // `highlightMedia`), for the person releasing to see before publish.
      notes: {
        text: notesText,
        prs: notes.prs,
        source: notes.source,
        contentSha256: notesSha256(notesText),
        noMedia: notes.noMedia
      },
      // What the feed carried when this candidate was made, and what it will carry: publish re-reads
      // every channel file under its lock and refuses the candidate if any differs from `read`.
      policy: {
        read: Object.fromEntries(
          Object.entries(policyRead).map(([file, r]) => [
            file,
            { policy: r.policy, revision: r.revision, etag: r.etag }
          ])
        ),
        next: policyNext.policy,
        reason: policyNext.reason,
        changed: policyNext.changed
      },
      preparedAt: releaseDate,
      preparedOn: hostname()
    }
    const want = CHANNELS[variant]
    if (built.bundleId !== want.bundleId || manifest.origin !== want.origin)
      throw new Error(
        `built ${built.bundleId} → ${manifest.origin}, a ${variant} build is ${want.bundleId} → ${want.origin}`
      )

    const gaps = releaseGaps(manifest)
    if (gaps.length > 0)
      deps.log(
        `prepare: this candidate can be tried but never published (rule R) — missing ${gaps.join(', ')}`
      )

    // Artifacts first, the manifest last; every key create-only — a release folder is immutable.
    for (const f of [...files, ...others]) {
      deps.log(`prepare: upload ${deps.store.describe(`${folder}/${f.name}`)}`)
      await deps.store.put(`${folder}/${f.name}`, readFileSync(f.local), {
        contentType: CONTENT_TYPES[f.kind],
        ifNoneMatch: '*'
      })
    }
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
    const manifestKey = `${folder}/${MANIFEST}`
    await deps.store.put(manifestKey, bytes, { contentType: 'application/json', ifNoneMatch: '*' })
    return { manifestKey, digest: sha256(bytes), manifest }
  } finally {
    await checkout.cleanup()
  }
}

/**
 * Refuse a publish whose notes the docs host does not serve yet. A stable candidate always carries
 * page notes (prepare); a dev candidate is checked when its notes came from a page, and may skip.
 * @param {object} m - the manifest
 * @param {{ docsOrigin?: string, skipDocsCheck?: boolean }} options
 * @param {{ fetchDocs?: (url: string) => Promise<{ status: number, text: string }>, log: (line: string) => void }} deps
 */
async function checkDocs(m, options, deps) {
  if (options.skipDocsCheck) {
    if (m.variant === 'stable')
      throw new Error('publish refused: --skip-docs-check is for a dev publish only; deploy the docs first')
    deps.log('publish: docs check skipped (--skip-docs-check)')
    return
  }
  const fromPage = /^docs changelog\/desktop\/\d+\.\d+\.md#/.test(m.notes?.source ?? '')
  if (!fromPage || !m.notes?.contentSha256) {
    if (m.variant === 'stable')
      throw new Error(
        'publish refused: this stable candidate carries notes from no changelog page — prepare it again from a sha whose page has them'
      )
    deps.log(
      `publish: notes from ${m.notes?.source ?? 'nowhere recorded'}, on no changelog page — no docs check`
    )
    return
  }
  const own = updateChannel.docsOriginFor(m.variant)
  const origin = (options.docsOrigin ?? own).replace(/\/+$/, '')
  // Like the feed (checkTarget): a real store's clients read their channel's own docs host.
  const store = realStoreChannel(options.target)
  if (store !== null && origin !== own)
    throw new Error(
      `publish refused: ${options.target} serves ${store}, whose clients read the docs at ${own}, not ${origin}`
    )
  const problem = await docsServeNotes({
    origin,
    version: m.version,
    contentSha256: m.notes.contentSha256,
    fetchDocs: deps.fetchDocs ?? fetchDocs
  })
  if (problem) throw new Error(`publish refused: deploy docs first — ${problem}`)
  deps.log(`publish: ${origin} serves the notes of ${m.version}`)
}

/** @param {string} url */
async function fetchDocs(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  return { status: response.status, text: await response.text() }
}

// ── publish ──────────────────────────────────────────────────────────────────────────────────────

/** What a channel file lists, as `channelYml` writes it. */
const listedFiles = (yml) =>
  [...yml.matchAll(/^ {2}- url: (\S+)\n {4}sha512: (\S+)\n {4}size: (\d+)$/gm)].map((x) => ({
    url: x[1],
    sha512: x[2],
    size: Number(x[3])
  }))

/**
 * A schema 1 manifest (one Mac release) in the schema 2 shape publish reads.
 * @param {object} m
 */
function fromSchema1(m) {
  const { channelFile, channelYml: yml, bundleId, archs, universal, signedBy, ...rest } = m
  return {
    ...rest,
    schema: 1,
    platforms: { mac: { archs, universal, bundleId, signedBy } },
    files: (Array.isArray(m.files) ? m.files : []).map((f) => ({ platform: 'mac', ...f })),
    channels: [{ platform: 'mac', file: channelFile, yml }]
  }
}

/**
 * Parse and cross-check a manifest: every channel file it froze must be the one its platform reads,
 * and the channel files together must list exactly its files, in its folder, with its hashes —
 * publish writes that text without reading it again. A Windows or Linux channel file must also be
 * exactly what `channelYml` makes of those files, so a frozen one missing an arch (or holding another
 * arch's file) is refused here, not served.
 * @param {Buffer} bytes
 * @returns {object} the manifest in the schema 2 shape (a schema 1 manifest is a Mac release).
 */
export function readManifest(bytes) {
  let raw
  try {
    raw = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`manifest is not JSON: ${error.message}`)
  }
  if (raw?.schema !== 1 && raw?.schema !== MANIFEST_SCHEMA)
    throw new Error(`manifest schema ${raw?.schema}, this publish reads 1 and ${MANIFEST_SCHEMA}`)
  const m = raw.schema === 1 ? fromSchema1(raw) : raw
  if (m.variant !== 'stable' && m.variant !== 'dev') throw new Error(`manifest variant ${m.variant}`)
  if (m.folder !== `${m.variant}/${m.version}/${m.buildId}`)
    throw new Error(`manifest folder ${m.folder} does not match its variant/version/build id`)
  if (!/^[0-9a-f]{40}$/.test(m.sha)) throw new Error(`manifest sha ${m.sha}`)
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error('manifest lists no file')
  if (!Array.isArray(m.channels) || m.channels.length === 0) throw new Error('manifest has no channel file')
  for (const f of m.files)
    if (!updateChannel.PLATFORMS.includes(f.platform))
      throw new Error(`manifest file ${f.name}: platform ${f.platform}`)
  const files = new Set(m.channels.map((c) => c.file))
  if (files.size !== m.channels.length) throw new Error('manifest lists a channel file twice')

  const key = (f) => `${f.url} ${f.sha512} ${f.size}`
  const allListed = []
  for (const c of m.channels) {
    const want = updateChannel.channelFile({ channel: m.variant, platform: c.platform, arch: c.arch })
    if (c.file !== want)
      throw new Error(`manifest channel file ${c.file}, a ${c.platform} ${m.variant} release writes ${want}`)
    if (typeof c.yml !== 'string') throw new Error(`manifest channel file ${c.file} has no text`)
    const feed = parseFeed(c.yml)
    if (feed.version !== m.version || feed.buildId !== m.buildId)
      throw new Error(
        `the frozen ${c.file} says ${feed.version} build ${feed.buildId}, the manifest ${m.version} build ${m.buildId}`
      )
    // One date per candidate (prepare freezes it): every channel file publish writes says that date.
    const frozenDate = releaseDateOf(c.yml)
    if (m.releaseDate !== undefined && frozenDate !== m.releaseDate)
      throw new Error(`the frozen ${c.file} says releaseDate ${frozenDate}, the manifest ${m.releaseDate}`)
    const own = m.files.filter(
      (f) => f.platform === c.platform && (c.arch === undefined || f.arch === c.arch)
    )
    const expected = own.map((f) => ({ url: `${m.folder}/${f.name}`, sha512: f.sha512, size: f.size }))
    // Every channel file carries the one policy the manifest says it will (none before policies existed).
    if (!comparePolicy(readPolicy(c.yml), m.policy?.next ?? null))
      throw new Error(
        `the frozen ${c.file} carries ${describePolicy(readPolicy(c.yml))}, the manifest ${describePolicy(m.policy?.next ?? null)}`
      )
    const listed = listedFiles(c.yml)
    if (JSON.stringify(listed.map(key).sort()) !== JSON.stringify(expected.map(key).sort()))
      throw new Error(`the frozen ${c.file} does not list exactly the manifest's ${c.platform} files`)
    if (c.platform !== 'mac') {
      // Throws on a missing arch or a stray file, with the reason.
      const again = channelYml({
        platform: c.platform,
        arch: c.arch,
        version: m.version,
        releaseDate: m.releaseDate,
        buildId: m.buildId,
        releaseNotes: m.notes?.text,
        policy: m.policy?.next ?? undefined,
        files: expected
      })
      if (again !== c.yml) throw new Error(`the frozen ${c.file} is not the channel file its files make`)
    }
    allListed.push(...listed)
  }
  const every = m.files.map((f) => ({ url: `${m.folder}/${f.name}`, sha512: f.sha512, size: f.size }))
  if (JSON.stringify(allListed.map(key).sort()) !== JSON.stringify(every.map(key).sort()))
    throw new Error('the frozen channel files do not list exactly the manifest files, each once')
  return m
}

/**
 * How the channel files on the target differ from what this candidate's prepare read (C2). A file
 * that is exactly what the candidate froze is this very candidate, published before — no drift.
 * A manifest from before policies existed recorded nothing: it may only go over files carrying none.
 * @param {object} m - the manifest (readManifest)
 * @param {Map<string, { body: Buffer, etag: string } | null>} now - each channel file as read under the lock
 * @returns {string[]} one line per file that changed; empty when none did.
 */
export function policyDrift(m, now) {
  const lines = []
  const state = (s) => (s.etag === null ? 'no file' : `etag ${s.etag} (${describePolicy(s.policy)})`)
  for (const c of m.channels) {
    const got = now.get(c.file) ?? null
    const text = got ? got.body.toString('utf8') : null
    if (text === c.yml) continue
    const live = { etag: got?.etag ?? null, policy: text === null ? null : readPolicy(text) }
    if (m.policy === undefined) {
      if (live.policy !== null)
        lines.push(
          `this manifest was prepared before the minimum version policy, and ${c.file} carries ${describePolicy(live.policy)}`
        )
      continue
    }
    const read = m.policy.read?.[c.file] ?? { policy: null, revision: 0, etag: null }
    if (read.etag !== live.etag || !comparePolicy(read.policy, live.policy))
      lines.push(`${c.file}: prepare read ${state(read)}, the feed has ${state(live)}`)
  }
  return lines
}

/**
 * @param {{
 *   manifest: string, digest: string, target: string, publicUrl?: string, pushTag?: boolean,
 *   waive?: string[], repo?: string, fetch?: boolean
 * }} options
 * @param {{
 *   openStore: (target: string, credentials: object | undefined) => ReturnType<typeof openStore>,
 *   credentialsFor: (channel: 'stable' | 'dev') => object | undefined,
 *   feedSigningKey: () => import('node:crypto').KeyObject, - the Ed25519 key every channel file is signed with
 *   loadManifest?: (ref: string, store: () => ReturnType<typeof openStore>) => Promise<Buffer>,
 *   extractApp: (artifact: { name: string, kind: 'zip' | 'dmg', body: Buffer }) =>
 *     Promise<{ app: string, container?: string, cleanup: () => void } | null>, - null where the app cannot be opened (no macOS)
 *   extractPayload?: (artifact: { name: string, platform: 'win' | 'linux', kind: string, body: Buffer }) =>
 *     Promise<{ root: string, cleanup: () => void } | null>, - the unpacked Windows/Linux app; null where this machine cannot unpack it
 *   missingUnpackers?: () => { tool: string, hint: string }[], - payload.mjs `missingUnpackers`
 *   gather: typeof gatherFacts,
 *   canTag: (input: { name: string, sha: string, push: boolean }) => Promise<void>, - throws when the tag points elsewhere
 *   tag: (input: { name: string, sha: string, push: boolean }) => Promise<void>, - after the feed; a failed push is reported, the feed stays
 *   discardWinLinux?: (run: { id: string, release?: string }) => Promise<void>, - deletes the run's draft release (release-win-linux.mjs `discard`)
 *   fetchText?: (url: string) => Promise<string>,
 *   log: (line: string) => void
 * }} deps
 */
export async function publish(options, deps) {
  const waive = options.waive ?? []
  // The channel comes from the manifest — but to read a manifest kept on the target we need a key,
  // and which key depends on the channel. A store key starts with the variant, so that settles it.
  const keyChannel = /^(stable|dev)\//.exec(options.manifest)?.[1]
  let credentials
  let store
  const storeFor = (channel) => {
    if (!store) {
      credentials = deps.credentialsFor(channel)
      store = deps.openStore(options.target, credentials)
    }
    return store
  }
  if (keyChannel) storeFor(keyChannel)

  const bytes = await (deps.loadManifest ?? loadManifest)(options.manifest, () => storeFor(keyChannel))
  const digest = sha256(bytes)
  if (digest !== String(options.digest).toLowerCase())
    throw new Error(
      `manifest digest is ${digest}, not the ${options.digest} given — not the candidate that was accepted`
    )
  const m = readManifest(bytes)
  if (keyChannel && keyChannel !== m.variant)
    throw new Error(`manifest at ${options.manifest} is ${m.variant}`)
  // A manifest from before the feed was recorded was built against its channel's own feed.
  const updateFeed = m.feed ?? updateChannel.feedFor(m.variant)
  checkTarget({ variant: m.variant, target: options.target, feed: updateFeed, waive })
  // Rule R: one release is Mac + Windows + Linux, every arch, or nothing — no feed moves alone.
  const gaps = releaseGaps(m)
  if (gaps.length > 0)
    throw new Error(
      `publish refused: this manifest is not one release of all three platforms — missing ${gaps.join(', ')}`
    )
  // The docs host serves this release's notes before any client is offered the build that links to
  // them (E8): read-only, before the lock and before anything is written.
  await checkDocs(m, options, deps)
  // The Windows and Linux apps are judged by unpacking them here; without the tools a real store is refused now,
  // before the lock, and a test target says up front which lines will read "not checked".
  const missingTools = (deps.missingUnpackers ?? missingUnpackers)()
  if (missingTools.length > 0) {
    const list = missingTools.map((t) => `${t.tool} (${t.hint})`).join(', ')
    if (realStoreChannel(options.target) !== null)
      throw new Error(
        `publish refused: this machine cannot unpack the Windows/Linux apps to check them — install ${list}`
      )
    deps.log(`publish: not checked here: ${list} — the Windows/Linux payload lines will say SKIP`)
  }
  // The feed key before anything is touched: no channel file is ever written unsigned.
  const signingKey = deps.feedSigningKey()
  const s = storeFor(m.variant)
  deps.log(
    `publish: ${m.variant} ${m.version} build ${m.buildId} (${m.sha.slice(0, 10)}) to ${m.channels.map((c) => s.describe(c.file)).join(', ')}`
  )

  await takeLock(s, { version: m.version, buildId: m.buildId })

  /** Apps opened from the artifacts, removed when publish ends. */
  const openedApps = []
  try {
    /** Each channel file as the checks read it, for the version rule and the conditional write. */
    const before = new Map()
    const feedReads = []
    for (const c of m.channels) {
      const got = await s.get(c.file)
      before.set(c.file, got)
      feedReads.push(
        got
          ? { file: c.file, url: s.describe(c.file), text: got.body.toString('utf8') }
          : { file: c.file, url: s.describe(c.file), missing: true }
      )
    }
    // The minimum version policy must be the one prepare read, file by file: a candidate made before a
    // lock was raised (or lowered to let people back in) would otherwise put the old lock back. No flag
    // passes this — the way on is a new prepare, which carries the feed's current policy.
    const drift = policyDrift(m, before)
    if (drift.length > 0)
      throw new Error(
        `publish refused: ${drift.join('; ')} — re-run prepare, so the candidate carries the feed's current minimum version policy`
      )
    // Every channel file signed now, with the key the apps pin (checked below), never at prepare:
    // the private key stays on the publishing machine.
    const feedSignatures = m.channels.map((c) => ({
      file: c.file,
      yml: c.yml,
      signature: signFeed({ channelFile: c.file, text: c.yml, privateKey: signingKey })
    }))

    // Every artifact from the target itself, hashed, and the app inside EACH one opened for the
    // checks — a client gets whichever its machine picks. An app that cannot be opened here is
    // "not checked" for a test target and a failure for a real store: nothing reaches a real feed unchecked.
    const realStore = realStoreChannel(options.target) !== null
    const downloaded = []
    const apps = []
    const payloads = []
    for (const f of m.files) {
      const mac = f.platform === 'mac'
      const entry = mac
        ? { artifact: f.name, expectArchs: EXPECT_ARCHS[f.arch] }
        : { artifact: f.name, platform: f.platform, expectArch: f.arch }
      ;(mac ? apps : payloads).push(entry)
      const verdict = mac ? 'signature' : 'payload'
      const got = await s.get(`${m.folder}/${f.name}`)
      if (!got) {
        downloaded.push({ name: f.name, error: 'not on the target' })
        entry[verdict] = { error: 'not on the target' }
        continue
      }
      downloaded.push({
        name: f.name,
        sha512: createHash('sha512').update(got.body).digest('base64'),
        size: got.body.length
      })
      let opened
      try {
        opened = mac
          ? await deps.extractApp({ name: f.name, kind: f.kind, body: got.body })
          : await (deps.extractPayload ?? extractPayload)({
              name: f.name,
              platform: f.platform,
              kind: f.kind,
              body: got.body
            })
      } catch (error) {
        // An artifact that does not unpack is this artifact's failure, reported in its own line with
        // the others — not a crash that hides the rest of the checks.
        entry[verdict] = { error: `cannot open ${f.name}: ${error.message}` }
        continue
      }
      if (opened) {
        openedApps.push(opened)
        if (mac) {
          entry.app = opened.app
          // A dmg is judged as an image too (its own signature, notarization and staple).
          if (opened.container) entry.container = opened.container
        } else entry.root = opened.root
      } else {
        const why = mac
          ? `cannot open the ${f.kind} on this machine (codesign, spctl and hdiutil need macOS)`
          : `cannot unpack the ${f.kind} on this machine (${UNPACK_TOOL[f.kind] ?? 'no unpacker'})`
        entry[verdict] = realStore
          ? { error: `${why} — a real store is never published unchecked` }
          : { skipped: why }
      }
    }

    const notesDir = mkdtempSync(path.join(tmpdir(), 'release-notes-'))
    let results
    try {
      const notesFile = path.join(notesDir, 'notes.txt')
      writeFileSync(notesFile, m.notes?.text ?? '')
      const facts = await deps.gather({
        channel: m.variant,
        sha: m.sha,
        version: m.version,
        buildId: m.buildId,
        origin: m.origin,
        updateFeed,
        notes: notesFile,
        apps,
        payloads,
        feedReads,
        feedSignatures,
        artifacts: { expected: m.files, downloaded },
        repo: undefined,
        fetch: options.fetch,
        cwd: options.repo
      })
      results = preflight(facts).map((r) =>
        r.status === 'FAIL' && waive.includes(r.check) ? { ...r, status: 'WAIVED' } : r
      )
    } finally {
      rmSync(notesDir, { recursive: true, force: true })
    }
    for (const r of results) deps.log(`${r.status.padEnd(6)} ${r.check} — ${r.detail}`)
    const failed = results.filter((r) => r.status === 'FAIL')
    if (failed.length > 0) throw new Error(`publish refused: ${failed.map((r) => r.check).join(', ')} failed`)

    // A stable tag that already points elsewhere would leave a live feed with no tag: refuse now.
    const tag =
      m.variant === 'stable'
        ? { name: `desktop-v${m.version}`, sha: m.sha, push: options.pushTag !== false }
        : null
    if (tag) await deps.canTag(tag)

    // The last moment: every channel file must still be what the checks read.
    for (const c of m.channels) {
      const was = before.get(c.file)
      const now = await s.get(c.file)
      const unchanged = checkFeedUnchanged(
        was ? { etag: was.etag } : { missing: true },
        now ? { etag: now.etag } : { missing: true }
      )
      deps.log(`${unchanged.status.padEnd(6)} ${unchanged.check} ${c.file} — ${unchanged.detail}`)
      if (unchanged.status !== 'PASS') throw new Error(`publish refused: ${c.file}: ${unchanged.detail}`)
    }

    // The signatures first, then the channel files LAST: until a channel file changes, no client is
    // offered anything; a client that reads a new signature next to the old file refuses that check
    // and tries again later — it never takes an unverified update.
    for (const sig of feedSignatures)
      await s.put(`${sig.file}.sig`, Buffer.from(sig.signature), { contentType: 'text/plain' })
    for (const c of m.channels) {
      const was = before.get(c.file)
      try {
        await s.put(c.file, Buffer.from(c.yml), {
          contentType: 'text/yaml',
          ...(was ? { ifMatch: was.etag } : { ifNoneMatch: '*' })
        })
      } catch (error) {
        if (error.code === 'PRECONDITION')
          throw new Error(`publish refused: ${c.file} unchanged — ${error.message}; another publish ran`)
        throw error
      }
    }
    for (const sig of feedSignatures) {
      const back = await s.get(sig.file)
      const backSig = await s.get(`${sig.file}.sig`)
      if (back?.body.toString('utf8') !== sig.yml)
        throw new Error(`read back ${s.describe(sig.file)}: not the channel file just written`)
      if (backSig?.body.toString('utf8') !== sig.signature)
        throw new Error(`read back ${s.describe(`${sig.file}.sig`)}: not the signature just written`)
      deps.log(`publish: wrote and read back ${s.describe(sig.file)} and its signature`)
    }
    // A release that changed the minimum version policy goes into the same log as set-minimum.
    if (m.policy?.changed)
      await appendPolicyLog(s, m.variant, {
        at: new Date().toISOString(),
        command: 'publish',
        channel: m.variant,
        from: agreedPolicy(m.policy.read),
        to: m.policy.next,
        revision: m.policy.next?.policyRevision ?? 0,
        reason: m.policy.reason,
        host: hostname(),
        version: m.version,
        buildId: m.buildId,
        files: m.channels.map((c) => c.file)
      })
    if (options.publicUrl) {
      for (const sig of feedSignatures)
        for (const [file, want] of [
          [sig.file, sig.yml],
          [`${sig.file}.sig`, sig.signature]
        ]) {
          const url = `${options.publicUrl.replace(/\/+$/, '')}/${file}`
          const text = await (deps.fetchText ?? fetchText)(url)
          if (text !== want)
            throw new Error(`${url} does not serve the file just written (a cache in front?)`)
          deps.log(`publish: ${url} serves it`)
        }
    }

    if (tag) {
      await deps.tag(tag)
      deps.log(
        `publish: tagged ${tag.name} at ${m.sha.slice(0, 10)}${tag.push ? ' and pushed it' : ' (not pushed)'}`
      )
    }
    // The Windows/Linux files are on a real store now: their draft release is no longer needed. A test
    // target keeps it (a rehearsal may prepare the real store from the same run next). The feed is live,
    // so a draft that will not go is said, not a failed publish — the workflow's sweep removes it later.
    const winRun = m.platforms?.win?.run
    if (realStoreChannel(options.target) !== null && winRun?.release && deps.discardWinLinux) {
      try {
        await deps.discardWinLinux(winRun)
      } catch (error) {
        deps.log(`publish: the draft release ${winRun.release} stays (${error.message}) — delete it by hand`)
      }
    }
    return { published: true, results, manifest: m }
  } finally {
    for (const opened of openedApps) opened.cleanup()
    await s.remove(LOCK)
  }
}

/**
 * Take the ONE lock every writer of a channel's feed holds — publish and set-minimum alike — so two
 * of them never interleave. Throws, naming the holder, when another run has it.
 * @param {ReturnType<typeof openStore>} s
 * @param {object} about - what this run is, written into the lock for whoever finds it
 */
async function takeLock(s, about) {
  const body = JSON.stringify({
    host: hostname(),
    pid: process.pid,
    since: new Date().toISOString(),
    ...about
  })
  try {
    await s.put(LOCK, Buffer.from(body), { ifNoneMatch: '*', contentType: 'application/json' })
  } catch (error) {
    if (error.code !== 'PRECONDITION') throw error
    const holder = (await s.get(LOCK))?.body.toString() ?? '(gone)'
    throw new Error(
      `another publish holds the lock ${s.describe(LOCK)}: ${holder} — wait for it; if that run is dead, remove the lock by hand`
    )
  }
}

/**
 * One line more in `<channel>/policy-log.jsonl` on the target: who changed the minimum version policy,
 * when, from what to what, and why. A conditional write, so two appends never lose one another.
 * @param {ReturnType<typeof openStore>} s
 * @param {'stable' | 'dev'} channel
 * @param {object} entry
 */
async function appendPolicyLog(s, channel, entry) {
  const key = `${channel}/policy-log.jsonl`
  const got = await s.get(key)
  const body = Buffer.concat([got?.body ?? Buffer.alloc(0), Buffer.from(`${JSON.stringify(entry)}\n`)])
  await s.put(key, body, {
    contentType: 'application/x-ndjson',
    ...(got ? { ifMatch: got.etag } : { ifNoneMatch: '*' })
  })
}

// ── set-minimum ──────────────────────────────────────────────────────────────────────────────────

/**
 * Change the minimum version policy of a live channel without a release (C3): nothing is built and no
 * artifact is touched; each channel file of the channel gets the new policy lines and a new signature.
 *
 * Under the publish lock it reads all four channel files and their `.sig` (a file not there is skipped
 * and said). Without `resume` they must be in ONE state — one policy, every signature verifying —
 * and the new policy takes revision + 1 (build/release-policy.mjs `nextPolicy`: a change needs its
 * reason, loosening needs `lower` or `clear`). Every new text is made and checked before the first
 * write; then, file by file, the `.yml` (a conditional write on the ETag read) and its `.sig`. A run
 * that stops in between leaves files in two states, which a client refuses until they match (it never
 * takes an unverified file); `resume` — the same command again with `--resume` — finishes it: a file
 * already carrying the policy only gets its signature made again if it does not verify, the others get
 * the policy. A policy older than one a file already carries is never written (replay).
 *
 * @param {{ channel: 'stable' | 'dev', target: string, minVersion?: string, minVersionAfter?: string,
 *   reason?: string, lower?: boolean, clear?: boolean, resume?: boolean }} options
 * @param {{ store: ReturnType<typeof openStore>, feedSigningKey: () => import('node:crypto').KeyObject,
 *   pinnedKeys?: readonly string[], - the keys the apps pin (default: src/feed-key.js of this checkout)
 *   log: (line: string) => void, now?: () => Date }} deps
 * @returns {Promise<{ changed: boolean, policy: object | null, written: string[] }>}
 */
export async function setMinimum(options, deps) {
  const { channel } = options
  if (channel !== 'stable' && channel !== 'dev')
    throw new Error(`--channel is stable or dev, got: ${channel}`)
  checkTarget({ variant: channel, target: options.target, feed: updateChannel.feedFor(channel) })
  const reason = typeof options.reason === 'string' ? options.reason.trim() : ''
  if (reason === '')
    throw new Error('set-minimum needs --reason "<why>" — it goes into the policy log on the target')
  if (options.minVersion === undefined && !options.clear)
    throw new Error('set-minimum needs --min-version <X.Y.Z> (or --clear-min-version to lift the lock)')
  const flags = {
    minVersion: options.minVersion,
    minVersionAfter: options.minVersionAfter,
    reason,
    lower: options.lower === true,
    clear: options.clear === true
  }
  // The key before anything is touched, and it must be one the apps pin: a file they cannot verify
  // is a file they refuse.
  const signingKey = deps.feedSigningKey()
  const pinned = deps.pinnedKeys ?? require('../src/feed-key.js').FEED_PUBLIC_KEYS
  if (!pinned.includes(publicKeyText(createPublicKey(signingKey))))
    throw new Error(
      'the feed signing key is not one the apps pin (src/feed-key.js): they would refuse every file'
    )
  const s = deps.store
  const log = deps.log
  await takeLock(s, { command: 'set-minimum', channel })
  try {
    const files = channelFilesOf(channel)
    const reads = await readFeedPolicies(s, files)
    const present = files.filter((f) => reads[f].etag !== null)
    if (present.length === 0) throw new Error(`no ${channel} channel file on ${s.target}: nothing to set`)
    for (const f of files.filter((x) => !present.includes(x)))
      log(`set-minimum: ${s.describe(f)} is not there — skipped`)
    const signed = {}
    for (const f of present) {
      const sig = await s.get(`${f}.sig`)
      signed[f] = verifyFeed({
        channelFile: f,
        text: reads[f].text,
        signature: sig?.body.toString('utf8'),
        publicKeys: pinned
      }).ok
    }
    const state = (f) =>
      `${f}: ${describePolicy(reads[f].policy)}${signed[f] ? '' : ', signature does not verify'}`
    const versionOf = (f) => parseFeed(reads[f].text).version
    // The lowest version a file offers: the minimum must be one every platform can update to.
    const lowest = present.map(versionOf).sort(compareVersions)[0]
    const sameFields = (a, b) =>
      (a?.minimumVersion ?? undefined) === (b?.minimumVersion ?? undefined) &&
      (a?.minimumVersionAfter ?? undefined) === (b?.minimumVersionAfter ?? undefined)
    const wanted = flags.clear
      ? {}
      : {
          minimumVersion: flags.minVersion,
          ...(flags.minVersionAfter ? { minimumVersionAfter: flags.minVersionAfter } : {})
        }
    const top = Math.max(...present.map((f) => reads[f].revision))
    const atTop = present.filter((f) => reads[f].revision === top)
    const oneState = present.every(
      (f) => comparePolicy(reads[f].policy, reads[present[0]].policy) && signed[f]
    )

    let from
    let target
    if (!options.resume || (oneState && !sameFields(reads[atTop[0]].policy, wanted))) {
      if (!oneState)
        throw new Error(
          `the ${channel} channel files are not in one state — ${present.map(state).join('; ')} — ` +
            'a set-minimum stopped half way: re-run the same command with --resume'
        )
      from = reads[present[0]].policy
      const next = nextPolicy({
        current: from,
        flags,
        version: lowest,
        compare: compareVersions,
        names: { reason: '--reason' }
      })
      if (!next.changed) {
        log(
          `set-minimum: ${describePolicy(from)} is already in force on every ${channel} channel file — nothing written`
        )
        return { changed: false, policy: from, written: [] }
      }
      target = next.policy
    } else {
      // --resume: the run being finished is the one whose policy the newest files carry.
      if (!atTop.every((f) => comparePolicy(reads[f].policy, reads[atTop[0]].policy)))
        throw new Error(
          `two channel files carry revision ${top} with different policies — ${present.map(state).join('; ')} — fix the feed by hand`
        )
      target = reads[atTop[0]].policy
      if (!sameFields(target, wanted)) {
        const older = present.find((f) => sameFields(reads[f].policy, wanted) && reads[f].revision < top)
        if (older)
          throw new Error(
            `replay refused: ${older} carries this policy at revision ${reads[older].revision}, but ${atTop[0]} already ` +
              `carries ${describePolicy(target)} — a newer policy is in force; run set-minimum without --resume to change it`
          )
        throw new Error(
          `--resume finishes the run that set ${describePolicy(target)} (${atTop.join(', ')}); this command asks for ` +
            `${describePolicy({ ...wanted, policyRevision: top })} — re-run that run's own command with --resume`
        )
      }
      const behind = present.filter((f) => reads[f].revision < top)
      from = behind.length > 0 ? reads[behind[0]].policy : null
      if (behind.some((f) => !comparePolicy(reads[f].policy, from)))
        throw new Error(
          `the files behind revision ${top} disagree too — ${present.map(state).join('; ')} — fix the feed by hand`
        )
      // The interrupted run's own flags must still be a valid change from where it started.
      if (behind.length > 0)
        nextPolicy({
          current: from,
          flags,
          version: lowest,
          compare: compareVersions,
          names: { reason: '--reason' }
        })
    }

    // Every new text made (and checked against its file's version) before the first write.
    const plan = present.map((f) => {
      const done = comparePolicy(reads[f].policy, target)
      return { file: f, done, text: done ? reads[f].text : withPolicy(reads[f].text, target) }
    })
    const written = []
    for (const p of plan) {
      if (p.done && signed[p.file]) continue
      if (!p.done) {
        try {
          await s.put(p.file, Buffer.from(p.text), { contentType: 'text/yaml', ifMatch: reads[p.file].etag })
        } catch (error) {
          if (error.code === 'PRECONDITION')
            throw new Error(
              `set-minimum stopped: ${p.file} changed while it ran (${error.message}) — run it again with --resume`
            )
          throw error
        }
      }
      await s.put(
        `${p.file}.sig`,
        Buffer.from(signFeed({ channelFile: p.file, text: p.text, privateKey: signingKey })),
        {
          contentType: 'text/plain'
        }
      )
      written.push(p.file)
      log(
        `set-minimum: ${p.done ? 'signed again' : `wrote ${describePolicy(target)} to`} ${s.describe(p.file)}`
      )
    }
    // Read back what a client will read: every file carries the policy and verifies.
    for (const f of present) {
      const text = (await s.get(f))?.body
      const sig = (await s.get(`${f}.sig`))?.body.toString('utf8')
      if (!text || !comparePolicy(readPolicy(text.toString('utf8')), target))
        throw new Error(`read back ${s.describe(f)}: it does not carry ${describePolicy(target)}`)
      const verdict = verifyFeed({ channelFile: f, text, signature: sig, publicKeys: pinned })
      if (!verdict.ok) throw new Error(`read back ${s.describe(f)}: ${verdict.reason}`)
    }
    if (written.length > 0)
      await appendPolicyLog(s, channel, {
        at: (deps.now ?? (() => new Date()))().toISOString(),
        command: 'set-minimum',
        channel,
        from,
        to: target,
        revision: target.policyRevision,
        reason,
        host: hostname(),
        files: written,
        skipped: files.filter((f) => !present.includes(f)),
        resumed: options.resume === true
      })
    log(`set-minimum: every ${channel} channel file carries ${describePolicy(target)} and verifies`)
    return { changed: written.length > 0, policy: target, written }
  } finally {
    await s.remove(LOCK)
  }
}

// ── B4: the stable key ───────────────────────────────────────────────────────────────────────────

/**
 * The key allowed to write `stable-mac.yml` (and to prepare a stable candidate on the stable store):
 * an env file only its owner reads, `~/TracyHQ/.infra/tracy-releases-stable.env` on the iMac, with
 * `ACCESS_KEY=` and `SECRET_KEY=` (Lee, 10/10/2026: a release must run from a phone, with nobody at
 * the iMac to unlock a keychain).
 *
 * The env key prepare and dev publishes use is scoped to `tracy-releases-dev` only, so it cannot
 * touch the stable store. An R2 token is scoped by bucket, never by object: whoever holds this key
 * can write `stable-mac.yml`, so the file stays `chmod 600` and the gate for a stable release is Lee
 * saying so (runbook §4).
 * @param {{ file?: string }} [options] `file` is for tests.
 * @returns {{ accessKeyId: string, secretAccessKey: string }}
 */
export function readStableKey(options = {}) {
  const file = options.file ?? STABLE_KEY_FILE
  let mode
  try {
    mode = statSync(file).mode
  } catch {
    throw new Error(
      `no stable key: ${file} does not exist — it holds the tracy-releases write key as ACCESS_KEY=<key id> ` +
        'and SECRET_KEY=<secret>, chmod 600 (runbook §4)'
    )
  }
  if (mode & 0o077) throw new Error(`the stable key file ${file} is readable by others — chmod 600 it first`)
  const values = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const found = /^\s*(ACCESS_KEY|SECRET_KEY)\s*=\s*(.*?)\s*$/.exec(line)
    if (found) values[found[1]] = found[2].replace(/^(["'])(.*)\1$/, '$2')
  }
  if (!values.ACCESS_KEY || !values.SECRET_KEY)
    throw new Error(`the stable key file ${file} needs both ACCESS_KEY and SECRET_KEY`)
  return { accessKeyId: values.ACCESS_KEY, secretAccessKey: values.SECRET_KEY }
}

/** The dev / prepare key, from the environment; undefined when unset (a folder target needs none). */
function envKey() {
  const accessKeyId = process.env.RELEASES_S3_ACCESS_KEY
  const secretAccessKey = process.env.RELEASES_S3_SECRET_KEY
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
}

// ── the real adapters ────────────────────────────────────────────────────────────────────────────

/** @param {string} ref @param {() => ReturnType<typeof openStore>} store */
async function loadManifest(ref, store) {
  if (/^https?:\/\//.test(ref)) {
    const response = await fetch(ref, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`${ref}: HTTP ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
  if (/^(stable|dev)\//.test(ref)) {
    const got = await store().get(ref)
    if (!got) throw new Error(`no manifest at ${store().describe(ref)}`)
    return got.body
  }
  return readFileSync(ref)
}

/** @param {string} url */
async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

/**
 * The app inside one artifact, copied out to a temp folder: a zip unpacked with `ditto`, a dmg
 * mounted read-only, its app copied out, and unmounted at once (the image itself is returned as
 * `container`). Null where that needs macOS.
 * @param {{ name: string, kind: 'zip' | 'dmg', body: Buffer }} artifact
 */
export async function extractApp({ name, kind, body }) {
  if (process.platform !== 'darwin') return null
  const dir = mkdtempSync(path.join(tmpdir(), 'release-app-'))
  const cleanup = () => rmSync(dir, { recursive: true, force: true })
  try {
    const file = path.join(dir, `artifact.${kind}`)
    writeFileSync(file, body)
    const out = path.join(dir, 'x')
    if (kind === 'zip') run('ditto', ['-x', '-k', file, out])
    else {
      // A mount point of our own, made first. (09/10 on the iMac over SSH, a mount point on the external
      // Corsair volume was refused with "Permission denied"; one under the temp folder mounts.)
      const mount = path.join(dir, 'mnt')
      mkdirSync(mount)
      run('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, file])
      try {
        const inside = readdirSync(mount).find((n) => n.endsWith('.app'))
        if (!inside) throw new Error(`${name} holds no .app`)
        run('ditto', [path.join(mount, inside), path.join(out, inside)])
      } finally {
        run('hdiutil', ['detach', mount, '-force'])
      }
    }
    const app = readdirSync(out).find((n) => n.endsWith('.app'))
    if (!app) throw new Error(`${name} holds no .app`)
    // A dmg's image stays next to its app until cleanup: the checks judge the container as well.
    return { app: path.join(out, app), ...(kind === 'dmg' ? { container: file } : {}), cleanup }
  } catch (error) {
    cleanup()
    throw error
  }
}

/** The GitHub repository the Windows/Linux workflow runs in (TRACY_SOURCE_REPO, scripts/ci/ci-repository.mjs). */
const GITHUB_REPO = CI_REPOSITORY

/** `gh` with these arguments; resolves its stdout (the caller's own `gh` login). */
async function ghCommand(args) {
  return run('gh', args, { maxBuffer: 64 * 1024 * 1024 })
}

/** The repo this script runs from. */
const repoRoot = () => run('git', ['rev-parse', '--show-toplevel'], { cwd: HERE }).trim()

/** @param {string} repo @param {string} workDir */
function realCheckout(repo, workDir, log) {
  return async (sha) => {
    const dir = mkdtempSync(path.join(workDir, `tracy-desktop-${sha.slice(0, 7)}-`))
    rmSync(dir, { recursive: true, force: true })
    const cleanup = async () => {
      try {
        run('git', ['worktree', 'remove', '--force', '--force', dir], { cwd: repo })
      } catch {}
      rmSync(dir, { recursive: true, force: true })
      run('git', ['worktree', 'prune'], { cwd: repo })
    }
    const sh = (command, args, cwd = dir) => {
      log(`prepare: $ ${command} ${args.join(' ')}`)
      execFileSync(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] })
    }
    try {
      sh('git', ['worktree', 'add', '--detach', dir, sha], repo)
      // The dsh submodule, borrowing objects from this repo's copy when it has one.
      const common = path.resolve(repo, run('git', ['rev-parse', '--git-common-dir'], { cwd: repo }).trim())
      const reference = path.join(common, 'modules/vendor/tracy/deepseek-harness')
      sh('git', [
        'submodule',
        'update',
        '--init',
        ...(existsSync(reference) ? ['--reference', reference] : []),
        'vendor/tracy/deepseek-harness'
      ])
      // Order matters (scripts/build-dsh.mjs): dsh first, then the install that links its members.
      sh('pnpm', ['dsh:build'])
      // CI=1: the root `prepare` script would otherwise (re)install git hooks into the shared repo.
      execFileSync('pnpm', ['install', '--frozen-lockfile', '--filter', '@tracy/desktop...'], {
        cwd: dir,
        env: { ...process.env, CI: '1' },
        stdio: ['ignore', 'inherit', 'inherit']
      })
    } catch (error) {
      await cleanup()
      throw error
    }
    return { dir, cleanup }
  }
}

function realBuild(log) {
  return async ({ dir, variant, version, buildId, archs, universal, feed, releaseDate, releaseNotes }) => {
    const pkg = path.join(dir, PACKAGE_DIR)
    const { origin } = CHANNELS[variant]
    // The notes this release froze, written into every app by package.sh (D1).
    const notesFile = path.join(mkdtempSync(path.join(dir, 'release-notes-')), 'release-notes.txt')
    writeFileSync(notesFile, `${releaseNotes}\n`)
    const apps = []
    // Each arch signed on its own (its zip is what that Mac updates from), then — with both archs —
    // the universal merge, signed too: the app the install dmg carries.
    for (const arch of universal ? [...archs, 'universal'] : archs) {
      log(`prepare: package ${variant} ${arch} (${pkg}/build/package.sh at the checkout)`)
      // TRACY_DESKTOP_NO_SIGN is cleared: a feed build is signed here or not at all.
      const env = {
        ...process.env,
        TRACY_DESKTOP_ORIGIN: origin,
        TRACY_DESKTOP_ARCH: arch,
        TRACY_DESKTOP_VERSION: version,
        TRACY_DESKTOP_UPDATE_FEED: feed,
        TRACY_DESKTOP_RELEASE_NOTES: notesFile
      }
      delete env.TRACY_DESKTOP_NO_SIGN
      delete env.TRACY_DESKTOP_DOCS_ORIGIN
      delete env.TRACY_DESKTOP_TEST_NAME
      delete env.TRACY_DESKTOP_UPDATE_CHANNEL
      execFileSync('bash', [path.join(pkg, 'build/package.sh')], {
        cwd: pkg,
        env,
        stdio: ['ignore', 'inherit', 'inherit']
      })
      const out = path.join(pkg, 'dist', arch)
      const app = readdirSync(out).find((n) => n.endsWith('.app'))
      if (!app) throw new Error(`package.sh left no app in ${out}`)
      const notesProblems = bundleNotesProblems(path.join(out, app, 'Contents/Resources'), {
        version,
        channel: variant,
        notes: releaseNotes
      })
      if (notesProblems.length > 0) throw new Error(`${app} (${arch}): ${notesProblems.join('; ')}`)
      apps.push(path.join(out, app))
    }
    // Zip + dmg, and the Developer ID / staple checks, by the release.sh next to THIS script — part of
    // the release tooling (like this file), not of the build, so it is not taken from the checkout.
    const stage = mkdtempSync(path.join(dir, 'release-stage-'))
    execFileSync('bash', [path.join(HERE, 'release.sh'), stage, ...apps], {
      env: { ...process.env, BUILD_ID: buildId, RELEASE_DATE: releaseDate },
      stdio: ['ignore', 'inherit', 'inherit']
    })
    // release.sh's own channel file must carry the date prepare froze (RELEASE_DATE above).
    const written = readdirSync(stage).find((n) => n.endsWith('-mac.yml'))
    const writtenDate = written && releaseDateOf(readFileSync(path.join(stage, written), 'utf8'))
    if (writtenDate !== releaseDate)
      throw new Error(`release.sh wrote releaseDate ${writtenDate}, prepare froze ${releaseDate}`)
    const artifacts = readdirSync(stage)
      .filter((n) => /\.(zip|dmg)$/.test(n))
      .map((n) => path.join(stage, n))
    // Every arch's app must say the same bundle id, origin and feed; the manifest records that one set.
    const identities = apps.map((app) => ({
      feed:
        updateChannel.feedOf(readFileSync(path.join(app, 'Contents/Resources/app-update.yml'), 'utf8')) ?? '',
      bundleId: run('/usr/libexec/PlistBuddy', [
        '-c',
        'Print :CFBundleIdentifier',
        path.join(app, 'Contents/Info.plist')
      ]).trim(),
      origin: readFileSync(path.join(app, 'Contents/Resources/app/origin'), 'utf8').trim()
    }))
    if (new Set(identities.map((i) => `${i.bundleId} ${i.origin} ${i.feed}`)).size !== 1)
      throw new Error(`the archs disagree on bundle id / origin / feed: ${JSON.stringify(identities)}`)
    return {
      artifacts,
      containers: Object.fromEntries(
        artifacts.filter((a) => a.endsWith('.dmg')).map((a) => [path.basename(a), readContainer(a)])
      ),
      ...identities[0],
      electronVersion: JSON.parse(readFileSync(path.join(pkg, 'node_modules/electron/package.json'), 'utf8'))
        .version,
      lockfileSha256: sha256(readFileSync(path.join(dir, 'pnpm-lock.yaml')))
    }
  }
}

function signingIdentity() {
  // The signing keychain opens from its password file; a failure here says why (runbook §7).
  run('bash', [path.join(HERE, 'unlock-signing.sh')])
  try {
    const found = /"(Developer ID Application: [^"]+)"/.exec(
      run('security', ['find-identity', '-v', '-p', 'codesigning'])
    )
    return found ? found[1] : null
  } catch {
    return null
  }
}

/**
 * The notary papers sign.sh falls back to when the build checkout has no .env.apple-notary (every
 * release.mjs build: a temporary worktree): `KEY=value` lines of ~/TracyHQ/.infra/apple-notary.env.
 * @returns {Record<string, string>}
 */
function notaryEnvFile() {
  const file = process.env.TRACY_NOTARY_ENV || path.join(homedir(), 'TracyHQ/.infra/apple-notary.env')
  if (!existsSync(file)) return {}
  const values = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const found = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (found) values[found[1]] = found[2].replace(/^(["'])(.*)\1$/, '$2')
  }
  return values
}

/** Notarization must work before an hour of building: the same check sign.sh makes. */
function checkNotary() {
  const papers = { ...notaryEnvFile(), ...process.env }
  if (papers.TRACY_NOTARY_KEY && papers.TRACY_NOTARY_KEY_ID && papers.TRACY_NOTARY_ISSUER) {
    if (!existsSync(papers.TRACY_NOTARY_KEY))
      throw new Error(`notarization would fail: no API key file at ${papers.TRACY_NOTARY_KEY} — runbook §7`)
    return
  }
  const profile = process.env.TRACY_NOTARY_PROFILE || 'tracy-notary'
  try {
    run('xcrun', ['notarytool', 'history', '--keychain-profile', profile])
  } catch (error) {
    throw new Error(
      `notarization would fail: keychain profile '${profile}' does not work (${
        String(error.stderr ?? error.message)
          .trim()
          .split('\n')[0]
      }) — runbook §7`
    )
  }
}

/** The commit a tag points at, here or on origin; null when neither has it. */
function existingTag(name, repo) {
  try {
    return run('git', ['rev-parse', '--verify', `refs/tags/${name}^{commit}`], { cwd: repo }).trim()
  } catch {}
  try {
    const remote = run('git', ['ls-remote', 'origin', `refs/tags/${name}^{}`], { cwd: repo }).trim()
    return remote ? remote.split(/\s/)[0] : null
  } catch {
    return null
  }
}

/** @param {{ name: string, sha: string }} t @param {string} repo */
async function realCanTag({ name, sha }, repo) {
  const existing = existingTag(name, repo)
  if (existing && existing !== sha)
    throw new Error(
      `tag ${name} already points at ${existing.slice(0, 10)}, not ${sha.slice(0, 10)} — tags never move`
    )
}

/** @param {{ name: string, sha: string, push: boolean }} t @param {string} repo */
async function realTag({ name, sha, push }, repo) {
  await realCanTag({ name, sha }, repo)
  let existing = null
  try {
    existing = run('git', ['rev-parse', '--verify', `refs/tags/${name}^{commit}`], { cwd: repo }).trim()
  } catch {}
  if (!existing)
    run('git', ['tag', '-a', name, sha, '-m', `Tracy Cowork ${name.replace(/^desktop-v/, '')}`], {
      cwd: repo
    })
  if (push) run('git', ['push', 'origin', `refs/tags/${name}`], { cwd: repo })
}

// ── command line ─────────────────────────────────────────────────────────────────────────────────

/** The minimum version flags `prepare` and `set-minimum` share (their reason flag differs). */
const POLICY_OPTIONS = Object.freeze({
  'min-version': { type: 'string' },
  'min-version-after': { type: 'string' },
  'lower-min-version': { type: 'boolean' },
  'clear-min-version': { type: 'boolean' }
})

/** @param {Record<string, unknown>} values @param {string} reasonFlag */
const policyFlags = (values, reasonFlag) => ({
  minVersion: values['min-version'],
  minVersionAfter: values['min-version-after'],
  reason: values[reasonFlag],
  lower: values['lower-min-version'] === true,
  clear: values['clear-min-version'] === true
})

async function main(argv) {
  const [command, ...rest] = argv
  const text = { type: 'string' }
  const log = (line) => process.stderr.write(`${line}\n`)
  if (command === 'prepare') {
    const { values } = parseArgs({
      args: rest,
      options: {
        variant: text,
        sha: text,
        target: text,
        version: text,
        arch: text,
        'build-id': text,
        notes: text,
        'work-dir': text,
        feed: text,
        'win-linux-run': text,
        'win-linux-dir': text,
        'allow-manual-win-linux': text,
        ...POLICY_OPTIONS,
        'min-version-reason': text
      },
      strict: true
    })
    if (!values.variant || !values.sha || !values.target)
      throw new Error('prepare needs --variant, --sha and --target')
    const repo = repoRoot()
    const sha = run('git', ['rev-parse', '--verify', `${values.sha}^{commit}`], { cwd: repo }).trim()
    const workDir = values['work-dir'] ?? tmpdir()
    const winLinuxAdapter = githubWinLinux({ gh: ghCommand, repo: GITHUB_REPO, workDir, log })
    // A finished run (the way in while the workflow is not on the default branch), or a folder packed
    // by hand: its build id and release date become the candidate's, so the Mac half is built to match it.
    let fromRun
    const runId = values['win-linux-run']
    const manualDir = values['win-linux-dir']
    const manualReason = values['allow-manual-win-linux']
    if (runId && !/^\d+$/.test(runId)) throw new Error(`--win-linux-run takes a run id, got: ${runId}`)
    if (runId || manualDir || manualReason !== undefined) {
      const local = manualDir ? localWinLinux(manualDir) : null
      const record = local ? local.readInfo() : runId ? await winLinuxAdapter.readInfo(runId) : {}
      checkWinLinuxSource({
        runId,
        dir: manualDir,
        manualReason,
        record,
        realStore: realStoreChannel(values.target) !== null
      })
      const source = runId ? `run ${runId}` : `the folder ${manualDir}`
      if (values['build-id'] && values['build-id'] !== record.buildId)
        throw new Error(`${source} built build ${record.buildId}; --build-id says ${values['build-id']}`)
      fromRun = {
        collect: local
          ? async () => {
              const got = local.collect()
              return { ...got, run: { ...got.run, ...(manualReason ? { reason: manualReason.trim() } : {}) } }
            }
          : () => winLinuxAdapter.fromRun(runId),
        buildId: record.buildId,
        releaseDate: record.releaseDate
      }
      log(`prepare: windows/linux from ${source}: build ${record.buildId}, released ${record.releaseDate}`)
    }
    // `--notes <file>`: a dev build only (prepare refuses it for stable). Otherwise the notes are the
    // changelog page's at the sha (build/release-notes-page.mjs); a dev build without a section falls
    // back to the PR notes, gathered only then.
    const notes = values.notes
      ? { text: readFileSync(values.notes, 'utf8'), prs: [], source: `file ${path.basename(values.notes)}` }
      : undefined
    const collectNotes = () => {
      const base = values.variant === 'stable' ? 'main' : 'develop'
      let collected
      try {
        collected = JSON.parse(
          run('node', [path.join(HERE, 'collect-release-notes.mjs'), '--base', base], { cwd: repo })
        )
      } catch (error) {
        throw new Error(
          `collecting release notes failed (write the changelog page section, or pass --notes <file>): ${String(error.stderr ?? error.message).trim()}`
        )
      }
      return {
        text: collected.notes.map((n) => n.note).join('\n'),
        prs: collected.notes.map((n) => ({ number: n.pr, title: n.title, url: n.url })),
        source: `PRs into ${base} merged ${collected.merged}`
      }
    }
    checkNotary()
    const result = await prepare(
      {
        variant: values.variant,
        sha,
        version: values.version,
        buildId: fromRun?.buildId ?? values['build-id'],
        releaseDate: fromRun?.releaseDate,
        archs: values.arch?.split(','),
        feed: values.feed,
        target: values.target,
        notes,
        policy: policyFlags(values, 'min-version-reason')
      },
      {
        store: openStore(values.target, {
          credentials: realStoreChannel(values.target) === 'stable' ? readStableKey() : envKey()
        }),
        resolveSha: () => sha,
        packageVersion: (at) =>
          JSON.parse(run('git', ['show', `${at}:${PACKAGE_DIR}/package.json`], { cwd: repo })).version,
        signingIdentity,
        readPage: (at, file) => {
          try {
            return run('git', ['show', `${at}:${file}`], { cwd: repo })
          } catch {
            return null
          }
        },
        collectNotes,
        checkout: realCheckout(repo, workDir, log),
        build: realBuild(log),
        winLinux: fromRun ? fromRun.collect : (candidate) => winLinuxAdapter.dispatch(candidate),
        log
      }
    )
    process.stdout.write(
      `${JSON.stringify({ manifest: result.manifestKey, digest: result.digest, target: values.target }, null, 2)}\n`
    )
    log(
      `prepare: next — node build/release.mjs publish --manifest ${result.manifestKey} --digest ${result.digest} --target ${values.target}`
    )
    return 0
  }
  if (command === 'publish') {
    const { values } = parseArgs({
      args: rest,
      options: {
        manifest: text,
        digest: text,
        target: text,
        'public-url': text,
        'no-push-tag': { type: 'boolean' },
        'no-fetch': { type: 'boolean' },
        'docs-origin': text,
        'skip-docs-check': { type: 'boolean' },
        waive: text
      },
      strict: true
    })
    if (!values.manifest || !values.digest || !values.target)
      throw new Error('publish needs --manifest, --digest and --target')
    const repo = repoRoot()
    const publicUrl =
      values['public-url'] ??
      (realStoreChannel(values.target) ? updateChannel.feedFor(realStoreChannel(values.target)) : undefined)
    await publish(
      {
        manifest: values.manifest,
        digest: values.digest,
        target: values.target,
        publicUrl,
        pushTag: !values['no-push-tag'],
        waive: values.waive ? values.waive.split(',').map((s) => s.trim()) : [],
        repo,
        fetch: !values['no-fetch'],
        docsOrigin: values['docs-origin'] ?? (process.env.DOCS_ORIGIN || undefined),
        skipDocsCheck: values['skip-docs-check'] === true
      },
      {
        openStore: (target, credentials) => openStore(target, { credentials }),
        credentialsFor: (channel) => (channel === 'stable' ? readStableKey() : envKey()),
        feedSigningKey: () => readFeedSigningKey(),
        extractApp,
        extractPayload,
        gather: gatherFacts,
        canTag: (t) => realCanTag(t, repo),
        tag: (t) => realTag(t, repo),
        discardWinLinux: (winRun) =>
          githubWinLinux({ gh: ghCommand, repo: GITHUB_REPO, workDir: tmpdir(), log }).discard(winRun),
        log
      }
    )
    return 0
  }
  if (command === 'set-minimum') {
    const { values } = parseArgs({
      args: rest,
      options: { channel: text, target: text, reason: text, resume: { type: 'boolean' }, ...POLICY_OPTIONS },
      strict: true
    })
    if (!values.channel || !values.target) throw new Error('set-minimum needs --channel and --target')
    await setMinimum(
      {
        channel: values.channel,
        target: values.target,
        ...policyFlags(values, 'reason'),
        resume: values.resume === true
      },
      {
        // The same keys publish uses: the stable store's from its file only, the feed key from its file.
        store: openStore(values.target, {
          credentials: values.channel === 'stable' ? readStableKey() : envKey()
        }),
        feedSigningKey: () => readFeedSigningKey(),
        log
      }
    )
    return 0
  }
  if (command === 'tools') {
    // What a publishing machine needs to judge the Windows/Linux apps (payload.mjs).
    const missing = missingUnpackers()
    for (const t of missing) process.stderr.write(`missing ${t.tool} — ${t.hint}\n`)
    if (missing.length === 0) process.stderr.write('tools: 7zz, unsquashfs and bsdtar are all here\n')
    return missing.length === 0 ? 0 : 1
  }
  process.stderr.write(
    'usage: release.mjs prepare|publish|set-minimum|tools … (see the header of build/release.mjs)\n'
  )
  return 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`release: ${error.message}\n`)
      process.exit(1)
    }
  )
}
