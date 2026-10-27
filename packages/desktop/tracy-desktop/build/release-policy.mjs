/**
 * The minimum version policy of a desktop channel, on the release side (tasks/todo-desktop-update-policy.md
 * C2–C3): what the feed carries now, and what a release or `set-minimum` may turn it into.
 *
 * A policy is ONE set — `{ minimumVersion?, minimumVersionAfter?, policyRevision }` (build/release-feed.mjs
 * `checkPolicy`) — carried by every channel file of a channel (`<ch>-mac.yml`, `<ch>.yml`, `<ch>-linux.yml`,
 * `<ch>-linux-arm64.yml`). Changing ANY field of it is a policy change: it needs a reason and takes the
 * next revision, so an app that stored the older set takes the newer one (apps accept only a higher
 * revision). Loosening it — a lower minimum, a later start, or no minimum at all — needs a flag of its
 * own on top, so that nobody lowers a lock by mistyping a version.
 */
import { checkPolicy, comparePolicy, readPolicy } from './release-feed.mjs'
import updateChannel from './update-channel.cjs'

/** The four channel files of a channel, in the order releases write them. @param {'stable' | 'dev'} channel */
export function channelFilesOf(channel) {
  return [
    updateChannel.channelFile({ channel, platform: 'mac' }),
    updateChannel.channelFile({ channel, platform: 'win' }),
    updateChannel.channelFile({ channel, platform: 'linux', arch: 'x64' }),
    updateChannel.channelFile({ channel, platform: 'linux', arch: 'arm64' })
  ]
}

/**
 * What each channel file on the store says now: its policy (null for none), revision (0 for none),
 * ETag (null when the file is not there) and text.
 * @param {{ get: (key: string) => Promise<{ body: Buffer, etag: string } | null> }} store
 * @param {string[]} files
 * @returns {Promise<Record<string, { policy: object | null, revision: number, etag: string | null, text: string | null }>>}
 */
export async function readFeedPolicies(store, files) {
  const out = {}
  for (const file of files) {
    const got = await store.get(file)
    if (!got) {
      out[file] = { policy: null, revision: 0, etag: null, text: null }
      continue
    }
    const text = got.body.toString('utf8')
    let policy
    try {
      policy = readPolicy(text)
    } catch (error) {
      throw new Error(`${file} on the target carries a broken policy: ${error.message}`)
    }
    out[file] = { policy, revision: policy?.policyRevision ?? 0, etag: got.etag, text }
  }
  return out
}

/** A policy in words, for messages. @param {object | null} policy */
export function describePolicy(policy) {
  if (policy === null || policy === undefined) return 'no policy (revision 0)'
  const min =
    policy.minimumVersion === undefined
      ? 'no minimum'
      : `minimum ${policy.minimumVersion}${policy.minimumVersionAfter ? ` after ${policy.minimumVersionAfter}` : ''}`
  return `${min}, revision ${policy.policyRevision}`
}

/**
 * The one policy the channel files there carry. A file that is not there yet takes no part (the first
 * release of a platform); files that disagree are a `set-minimum` that stopped half way.
 * @param {Record<string, { policy: object | null, etag: string | null }>} reads - `readFeedPolicies`
 * @returns {object | null}
 */
export function agreedPolicy(reads) {
  const present = Object.entries(reads).filter(([, r]) => r.etag !== null)
  if (present.length === 0) return null
  const first = present[0][1].policy
  if (present.every(([, r]) => comparePolicy(r.policy, first))) return first
  throw new Error(
    `the channel files on the target do not carry one policy — ${present
      .map(([file, r]) => `${file}: ${describePolicy(r.policy)}`)
      .join(
        '; '
      )} — a set-minimum stopped half way: finish it with \`release.mjs set-minimum … --resume\` first`
  )
}

/** When a policy's minimum starts to block: its `minimumVersionAfter`, or always. */
const startsAt = (p) => (p.minimumVersionAfter === undefined ? -Infinity : Date.parse(p.minimumVersionAfter))

/**
 * Does going from `from` to `to` let some app run that `from` would block, at some moment? A lower
 * minimum, a later start, or no minimum at all. `compare` orders versions.
 */
function loosens(from, to, compare) {
  if (from?.minimumVersion === undefined) return false
  if (to.minimumVersion === undefined) return true
  return compare(to.minimumVersion, from.minimumVersion) < 0 || startsAt(to) > startsAt(from)
}

/**
 * The policy a release or `set-minimum` writes, from the one the feed carries and the flags.
 *
 *   no flag                         the current policy, unchanged (same revision)
 *   minVersion [+ minVersionAfter]  the whole new set (no minVersionAfter = in force at once)
 *   clear                           no minimum (a revision line stays, one above)
 *
 * A change of any field needs `reason` and takes revision + 1; a change that loosens needs `lower`
 * (or `clear`), and `lower` on a change that does not loosen is refused as a mistake.
 * @param {{
 *   current: object | null,
 *   flags: { minVersion?: string, minVersionAfter?: string, reason?: string, lower?: boolean, clear?: boolean },
 *   version: string, - the version the channel files will offer (a release's own; for set-minimum, each file's)
 *   compare: (a: string, b: string) => number,
 *   names?: { reason: string } - the flag names, for messages
 * }} input
 * @returns {{ policy: object | null, changed: boolean, reason: string | null }}
 */
export function nextPolicy({ current, flags, version, compare, names = { reason: '--min-version-reason' } }) {
  const { minVersion, minVersionAfter, lower = false, clear = false } = flags
  const reason = typeof flags.reason === 'string' && flags.reason.trim() !== '' ? flags.reason.trim() : null
  if (clear && (minVersion !== undefined || minVersionAfter !== undefined || lower))
    throw new Error('--clear-min-version takes no --min-version, --min-version-after or --lower-min-version')
  if (minVersion === undefined && !clear) {
    if (minVersionAfter !== undefined || lower)
      throw new Error(
        '--min-version-after and --lower-min-version come with --min-version: name the whole policy you want'
      )
    return { policy: current, changed: false, reason: null }
  }
  /** The fields asked for, without a revision yet. */
  const wanted = clear
    ? {}
    : {
        minimumVersion: minVersion,
        ...(minVersionAfter === undefined ? {} : { minimumVersionAfter: minVersionAfter })
      }
  const revision = (current?.policyRevision ?? 0) + 1
  // Throws on a malformed version or date, the wrong channel, or a minimum above what is offered.
  checkPolicy({ ...wanted, policyRevision: revision }, version)
  const same =
    (current?.minimumVersion ?? undefined) === wanted.minimumVersion &&
    (current?.minimumVersionAfter ?? undefined) === wanted.minimumVersionAfter
  if (same) {
    if (lower) throw new Error('--lower-min-version given, but the policy asked for is the one in force')
    return { policy: current, changed: false, reason: null }
  }
  const loosening = loosens(current, wanted, compare)
  if (loosening && !lower && !clear)
    throw new Error(
      `this loosens the lock (${describePolicy(current)} → ${describePolicy({ ...wanted, policyRevision: revision })}): ` +
        'a lower minimum or a later start lets blocked apps run again — add --lower-min-version if that is meant'
    )
  if (!loosening && lower)
    throw new Error(
      `--lower-min-version given, but ${describePolicy(current)} → ${describePolicy({ ...wanted, policyRevision: revision })} does not loosen the lock`
    )
  if (reason === null)
    throw new Error(
      `changing the minimum version policy (${describePolicy(current)} → ${describePolicy({ ...wanted, policyRevision: revision })}) ` +
        `needs ${names.reason} "<why>" — it goes into the manifest and the policy log`
    )
  return { policy: { ...wanted, policyRevision: revision }, changed: true, reason }
}
