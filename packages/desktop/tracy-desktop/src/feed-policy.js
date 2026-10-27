/**
 * The minimum version policy a channel file carries (tasks/todo-desktop-update-policy.md C5), read the
 * way the release tools write and read it: a copy of build/release-feed.mjs `readPolicy` and
 * `checkPolicy`. The packaged app carries only `src/`, so it cannot import that file; test/feed-policy
 * .test.mjs holds the two to the same answer on every case, so a change to one fails until the other
 * follows.
 *
 * Only ever given the text of a channel file whose signature verified (src/signed-feed-provider.js,
 * src/policy-check.js): the policy lines are inside the signed bytes and need no signature of their own.
 */

const VERSION_RE = /^\d+\.\d+\.\d+(-dev\.\d+)?$/
const ISO_ZONED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
const POLICY_KEYS = Object.freeze(['minimumVersion', 'minimumVersionAfter', 'policyRevision'])

/** Order of `X.Y.Z` / `X.Y.Z-dev.N` (a release ranks above its dev builds). */
function versionOrder(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-dev\.(\d+))?$/.exec(v)
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])]
  }
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

/** Throws unless `policy` is a well-formed policy a channel file of `version` may carry. */
function checkPolicy(policy, version) {
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy))
    throw new Error('a minimum version policy is an object')
  const unknown = Object.keys(policy).filter((k) => !POLICY_KEYS.includes(k))
  if (unknown.length > 0) throw new Error(`a minimum version policy has no field ${unknown.join(', ')}`)
  const { minimumVersion: min, minimumVersionAfter: after, policyRevision: revision } = policy
  if (!Number.isSafeInteger(revision) || revision <= 0)
    throw new Error('policyRevision must be a whole number above 0')
  if (min !== undefined) {
    if (typeof min !== 'string' || !VERSION_RE.test(min))
      throw new Error('minimumVersion must be X.Y.Z or X.Y.Z-dev.N')
    if (!version.includes('-dev.') && min.includes('-dev.'))
      throw new Error('a stable channel file cannot require a dev build')
    if (versionOrder(min, version) > 0)
      throw new Error(`minimumVersion ${min} is above ${version}, the version this channel file offers`)
  }
  if (after !== undefined) {
    if (min === undefined) throw new Error('minimumVersionAfter without minimumVersion')
    if (typeof after !== 'string' || !ISO_ZONED_RE.test(after) || Number.isNaN(Date.parse(after)))
      throw new Error('minimumVersionAfter must be an ISO time with its timezone')
  }
}

/**
 * @param {string} yml - a verified channel file.
 * @returns {{ minimumVersion?: string, minimumVersionAfter?: string, policyRevision: number } | null}
 *   null when it carries no policy; throws when the lines are there but not a well-formed set.
 */
function readPolicy(yml) {
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
 * The channel file this copy's electron-updater reads under the feed (build/update-channel.cjs
 * `channelFile`, by `process.platform`): `<channel>-mac.yml`, `<channel>.yml` on Windows,
 * `<channel>-linux[-arm64].yml`. Null on a platform Tracy ships nothing for.
 * @param {{ channel: string, platform: string, arch: string }} input
 */
function channelFileName({ channel, platform, arch }) {
  if (platform === 'darwin') return `${channel}-mac.yml`
  if (platform === 'win32') return `${channel}.yml`
  if (platform === 'linux') return arch === 'x64' ? `${channel}-linux.yml` : `${channel}-linux-${arch}.yml`
  return null
}

module.exports = { readPolicy, channelFileName }
