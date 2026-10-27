/**
 * The pure half of the app's self-update — no Electron here, so `node --test` covers all of it
 * (test/update-plan.test.mjs). `src/updater.js` is the half that talks to Electron and
 * `electron-updater`. Which feed and channel a build follows is decided at package time
 * (`build/update-channel.cjs`); the app only reads what `build/package.sh` wrote into the bundle.
 *
 * Learned from Cherry Studio's `AppUpdaterService` (tasks/todo-desktop-auto-update.md): the same
 * `electron-updater` generic provider, the same schedule, the same headers minus what Tracy does not
 * have (edition, region).
 */

/** First check after start: lets the window and the boot I/O settle first. */
const INITIAL_CHECK_DELAY_MS = 5_000
/** Base interval between checks. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
/** ± share of random jitter per cycle, so apps started together do not ask on the same beat. */
const CHECK_JITTER_RATIO = 0.15
/** Backoff after failed checks: 5, 10, 20, 40 minutes, then 60 — always shorter than the interval. */
const BACKOFF_BASE_MS = 5 * 60 * 1000
const BACKOFF_MAX_MS = 60 * 60 * 1000

/**
 * How long until the next automatic check.
 * @param {{ failures: number, random: number, intervalMs?: number }} input - consecutive failed checks
 *   so far (0 after a good one), a number in [0, 1] (`Math.random()` in the app), and the base interval
 *   (CHECK_INTERVAL_MS unless a test run shortens it, src/debug-switches.js `updateTestSwitches`). A
 *   backoff never waits longer than the interval itself.
 * @returns {number} milliseconds.
 */
function nextCheckDelay({ failures, random, intervalMs = CHECK_INTERVAL_MS }) {
  if (failures > 0)
    return Math.min(BACKOFF_BASE_MS * 2 ** Math.min(failures - 1, 30), BACKOFF_MAX_MS, intervalMs)
  return Math.round(intervalMs * (1 + (random * 2 - 1) * CHECK_JITTER_RATIO))
}

/**
 * Headers on every feed request, besides the `x-user-staging-id` install id `electron-updater`
 * adds by itself (kept on purpose: tracy-web records it in `desktop_install`, Lee 09/10).
 * @param {{ version: string, channel: string, arch: string, osVersion: string }} input
 * @returns {Record<string, string>}
 */
function updateHeaders({ version, channel, arch, osVersion }) {
  return {
    'Cache-Control': 'no-cache',
    'App-Name': 'Tracy Cowork',
    'App-Version': version,
    'X-Channel': channel,
    'X-Arch': arch,
    'X-OS-Version': osVersion
  }
}

/**
 * Can this copy replace itself? Squirrel.Mac installs only a bundle that satisfies the running
 * app's designated requirement. With a certificate that requirement names the certificate, so the
 * next release, signed the same way, passes; an ad-hoc signature's requirement is its own hash,
 * which no other build can match — such a copy is told a new version exists and given the
 * download link instead.
 * @param {string} codesignOutput - stderr of `codesign -dv --verbose=2 <app>`.
 * @returns {boolean} true when the app is signed with a certificate (an `Authority=` line).
 */
function canInstallInPlace(codesignOutput) {
  return /^Authority=\S/m.test(codesignOutput) && !/^Signature=adhoc$/m.test(codesignOutput)
}

/**
 * Which electron-updater class a PACKAGED copy runs, and whether it can replace itself.
 *
 *   macOS    MacUpdater (Squirrel.Mac): in place only when signed with a certificate (`canInstallInPlace`).
 *   Windows  NsisUpdater: in place. The installer is not code-signed (decision D1, tasks/todo-desktop-
 *            windows.md), so there is no publisher to check; what makes the download trusted is the
 *            signed channel file (src/signed-feed-provider.js) and the sha512 it lists.
 *   Linux    an AppImage (the AppImage runtime sets `APPIMAGE`) replaces its own file: AppImageUpdater,
 *            in place. Anything else is the .deb, which a package manager owns: DebUpdater only to read
 *            the feed, never in place — the person is offered the new .deb instead.
 * @param {{ platform: string, env: Record<string, string | undefined>, codesignOutput?: string }} input
 * @returns {{ updater: 'MacUpdater' | 'NsisUpdater' | 'AppImageUpdater' | 'DebUpdater', inPlace: boolean } | null}
 *   null on a platform Tracy ships no build for.
 */
function selfUpdateMode({ platform, env, codesignOutput = '' }) {
  if (platform === 'darwin') return { updater: 'MacUpdater', inPlace: canInstallInPlace(codesignOutput) }
  if (platform === 'win32') return { updater: 'NsisUpdater', inPlace: true }
  if (platform === 'linux')
    return env.APPIMAGE
      ? { updater: 'AppImageUpdater', inPlace: true }
      : { updater: 'DebUpdater', inPlace: false }
  return null
}

// ── Minimum version policy (tasks/todo-desktop-update-policy.md C4) ──────────────────────────────

/** `X.Y.Z` or `X.Y.Z-dev.N`: the only versions a policy is compared with (build/release-feed.mjs VERSION_RE). */
const ORDERED_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-dev\.(\d+))?$/

/** @returns {number[] | null} [major, minor, patch, dev number or Infinity for a release]. */
function versionParts(version) {
  const m = ORDERED_VERSION.exec(String(version))
  if (m === null) return null
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])]
}

/**
 * Order two versions as the release tools do (build/release-feed.mjs `versionOrder`): a release
 * ranks above its own dev builds.
 * @returns {number} negative, zero or positive; NaN when either is not `X.Y.Z[-dev.N]`.
 */
function compareVersions(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)]
  if (x === null || y === null) return Number.NaN
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

/**
 * @typedef {{ minimumVersion?: string, minimumVersionAfter?: string, policyRevision: number }} Policy
 * @typedef {{ level: 'ok' | 'warn' | 'blocked', minimumVersion: string | null, after: number | null }} PolicyVerdict
 */

/**
 * What the minimum version policy says of the running version, now.
 *   ok       no policy, no minimum, at or above it — or a version that is not `X.Y.Z[-dev.N]` (a
 *            source run never stops itself);
 *   warn     below it, before `minimumVersionAfter` (`after` = that deadline);
 *   blocked  below it, with no date or past it.
 * @param {{ running: string, policy: Policy | null, now: number }} input
 * @returns {PolicyVerdict}
 */
function policyOf({ running, policy, now }) {
  const ok = { level: 'ok', minimumVersion: null, after: null }
  const min = policy?.minimumVersion
  if (typeof min !== 'string') return ok
  const order = compareVersions(running, min)
  if (Number.isNaN(order) || order >= 0) return ok
  const after =
    typeof policy.minimumVersionAfter === 'string' ? Date.parse(policy.minimumVersionAfter) : Number.NaN
  if (Number.isFinite(after) && now < after) return { level: 'warn', minimumVersion: min, after }
  return { level: 'blocked', minimumVersion: min, after: Number.isFinite(after) ? after : null }
}

/**
 * Whether a policy just read from a verified channel file replaces the stored one: only a HIGHER
 * revision does. A signed file served again later (a replay of an older revision) is ignored; a
 * lowered or cleared policy is a new revision (build/release-policy.mjs), so it passes. A channel
 * file without policy lines is revision 0.
 * @param {{ revision: number } | null} stored
 * @param {Policy | null} incoming
 */
function acceptPolicy(stored, incoming) {
  const have = Number.isSafeInteger(stored?.revision) ? stored.revision : 0
  const got = Number.isSafeInteger(incoming?.policyRevision) ? incoming.policyRevision : 0
  return got > have
}

// ── What's new (D2) ───────────────────────────────────────────────────────────────────────────────

/** `X.Y` of a version, from the part before any `-`; null when it has no such part. */
function minorOf(version) {
  const m = /^(\d+)\.(\d+)\.\d+(?:-|$)/.exec(String(version ?? ''))
  return m === null ? null : [Number(m[1]), Number(m[2])]
}

/**
 * Whether this run is news worth a "What's new": a higher major or minor than the last run (as VS
 * Code does). A patch, the same version, a downgrade or a fresh install is not. `earlierRun`: the app
 * ran on this device before `lastRunVersion` existed (an app from before this), so it counts as older.
 * @param {{ lastRun: string | null, running: string, earlierRun?: boolean }} input
 * @returns {{ from: string | null, to: string, page: string } | null}
 */
function whatsNewDecision({ lastRun, running, earlierRun = false }) {
  const now = minorOf(running)
  if (now === null) return null
  const page = `${now[0]}.${now[1]}`
  if (lastRun === null || lastRun === undefined) return earlierRun ? { from: null, to: running, page } : null
  const before = minorOf(lastRun)
  if (before === null) return null
  const newer = now[0] > before[0] || (now[0] === before[0] && now[1] > before[1])
  return newer ? { from: lastRun, to: running, page } : null
}

// ── Restart reminder (A3) ─────────────────────────────────────────────────────────────────────────

/** A downloaded version waits this long before the first "Restart to update" reminder. */
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000
/** Then at most one reminder per this long. */
const REMIND_EVERY_MS = 24 * 60 * 60 * 1000

/**
 * Whether the reminder is due now.
 * @param {{ readySince: number | null, lastRemindedAt: number | null, now: number, afterMs?: number, everyMs?: number }} input
 */
function reminderDue({
  readySince,
  lastRemindedAt,
  now,
  afterMs = REMIND_AFTER_MS,
  everyMs = REMIND_EVERY_MS
}) {
  if (typeof readySince !== 'number') return false
  if (now - readySince < afterMs) return false
  return typeof lastRemindedAt !== 'number' || now - lastRemindedAt >= everyMs
}

module.exports = {
  selfUpdateMode,
  INITIAL_CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  nextCheckDelay,
  updateHeaders,
  canInstallInPlace,
  compareVersions,
  policyOf,
  acceptPolicy,
  whatsNewDecision,
  REMIND_AFTER_MS,
  REMIND_EVERY_MS,
  reminderDue
}
