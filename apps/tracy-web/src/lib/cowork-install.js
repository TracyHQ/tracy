/**
 * Which Claude Cowork plugin a NEW site built from a quickstart gets, answered offline from the facts
 * this server holds: the release's own `install.cowork`, the pin in `quickstarts.json`, the contract
 * that seals the version, and (for the fleet's own road) what claude-cowork's `update.json` said when
 * it was last read. One answer for the two readers that must agree on it: `resolveInstall`
 * (`quickstart-releases.js`, what a host is told to install) and the Customize your site check
 * (`customize-readiness.js` → STAB-1, whether that plugin carries the contract's files).
 *
 * The order, exactly `resolveInstall`'s:
 *   1. a valid pin that says `overridesRelease`;
 *   2. the release's own `install.cowork`;
 *   3. a pin that applies to this version (its entry's version or `contractVersions`; a local pack
 *      reads the pin of the release it stands for; a pin is only asked when a contract, exact or the
 *      nearer lower one, seals the version);
 *   4. otherwise the fleet installs `cowork_latest <platform> <floor>`
 *      (`packages/fleet/tracy-fleet-operation/scripts/lib/cowork-extension.sh`): the version
 *      `update.json` names, or the floor when the manifest cannot be read, names a package outside
 *      claude-cowork's releases, is not above the floor, or names a package not uploaded yet. Which of
 *      the two a given host takes depends on its network at that minute, so both are candidates.
 *
 * Pure: no network, no file read except the pins file `coworkPinFor` is pointed at.
 */
import { publishedTagOf } from './local-releases.js'

/** Where every Claude Cowork package the fleet installs on its own road is published. */
export const COWORK_RELEASE_BASE_URL = 'https://github.com/TracyHQ/claude-cowork/releases/download/'

/**
 * The floor each platform file passes to `cowork_latest` when no contract names one
 * (`platform/joomla.sh` `COWORK_FLOOR=0.24.1`, `platform/wordpress.sh` `tracy_wp_install_doors 0.8.0`).
 * A sealed quickstart passes its contract's `coworkMinVersion` instead (`provision.sh --cowork-min-version`).
 */
export const DEFAULT_COWORK_FLOOR = Object.freeze(
  /** @type {Record<string, string>} */ ({ joomla: '0.24.1', wordpress: '0.8.0' })
)

/**
 * @typedef {{ file: string, sha256: string, bytes: number, githubAssetId?: number, url: string, version?: string, overridesRelease?: true }} CoworkPin
 * @typedef {{ role: 'pin' | 'release' | 'latest' | 'floor', version: string | null, file: string | null, url: string | null, sha256?: string, bytes?: number | null, githubAssetId?: number | null }} CoworkCandidate
 * @typedef {{ source: 'pin' | 'release' | 'fleet' | 'none', candidates: CoworkCandidate[], floor?: string, latest?: { version: string, package: string } | null | 'unread' }} CoworkSelection
 */

/** A download address a host may fetch without a credential: https, no userinfo, no fragment. */
function isPublicUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}

/**
 * The pin of `quickstarts.json` (already parsed) that applies to this release and version, or null:
 * the rules `coworkPinFor` has always applied, without the file read.
 * @param {Record<string, any> | null | undefined} catalogue
 * @param {string} release the release tag; a local pack reads the pin of the release it stands for
 * @param {string} version
 * @returns {CoworkPin | null}
 */
export function pinOf(catalogue, release, version) {
  const entry = catalogue?.[publishedTagOf(release)]
  const pin = entry?.cowork
  // The pin applies to the entry's own version, and to every other quickstart version the
  // Claude Cowork plugin zip also carries a profile for (`contractVersions`): one plugin, two archives.
  const carries = Array.isArray(pin?.contractVersions) ? pin.contractVersions : []
  if (!entry || !pin || (entry.version !== version && !carries.includes(version))) return null
  // Two ways to fetch it, both whole: an asset id on the private releases repository (the host
  // downloads it with a token), or no id and a public https address (the Claude Cowork plugin's own
  // GitHub release — Tracy Base and JA Kinetic pin that way). A pin with neither is half-written:
  // dropping only the id used to drop the whole pin, and the site came out with no Claude Cowork plugin.
  const hasAssetId = pin.githubAssetId !== undefined && pin.githubAssetId !== null
  if (
    typeof pin.file !== 'string' ||
    typeof pin.sha256 !== 'string' ||
    !Number.isInteger(pin.bytes) ||
    (hasAssetId ? !Number.isSafeInteger(pin.githubAssetId) || pin.githubAssetId <= 0 : !isPublicUrl(pin.url))
  )
    return null
  return {
    file: pin.file,
    sha256: pin.sha256,
    bytes: pin.bytes,
    ...(hasAssetId ? { githubAssetId: pin.githubAssetId } : {}),
    url: String(pin.url ?? ''),
    ...(typeof pin.version === 'string' ? { version: pin.version } : {}),
    ...(pin.overridesRelease === true ? { overridesRelease: true } : {})
  }
}

/**
 * Steps 1 to 3: the plugin a host is handed in the entry, or null when the fleet picks its own.
 * @template O
 * @param {O | null | undefined} own the release's own `install.cowork` (as the entry carries it)
 * @param {CoworkPin | null} pin what `pinOf` answered, or null when no contract seals the version
 * @returns {{ source: 'pin', cowork: Omit<CoworkPin, 'overridesRelease'> } | { source: 'release', cowork: O } | null}
 */
export function installedCowork(own, pin) {
  if (pin && (!own || pin.overridesRelease === true)) {
    const { overridesRelease: _, ...cowork } = pin
    return { source: 'pin', cowork }
  }
  return own ? { source: 'release', cowork: own } : null
}

/**
 * `cowork_newer`: part by part as numbers, a part that is not a number reads 0, a missing one 0.
 * @param {string} a @param {string} b
 * @returns {boolean} whether `a` is strictly newer than `b`
 */
export function coworkNewer(a, b) {
  const parts = (/** @type {string} */ v) =>
    String(v)
      .split('.')
      .map((p) => (/^-?\d+$/.test(p) ? Number(p) : 0))
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

/**
 * `cowork_floor_url`: where the fleet fetches one version of the package.
 * @param {string} platform @param {string} version
 * @returns {string | null}
 */
export function coworkPackageUrl(platform, version) {
  if (platform === 'joomla')
    return `${COWORK_RELEASE_BASE_URL}joomla-v${version}/pkg_claudecowork-${version}.zip`
  if (platform === 'wordpress')
    return `${COWORK_RELEASE_BASE_URL}wordpress-v${version}/claude-cowork-${version}.zip`
  return null
}

/**
 * Step 4: the packages `cowork_latest` may hand a new site, newest first.
 * @param {string} platform
 * @param {string} floor
 * @param {{ version: string, package: string } | null | 'unread'} latest what `update.json` said when this
 *   server last read it: null when it read but named no usable version or package, `'unread'` when
 *   this server never got an answer (the latest is then a candidate nobody can name)
 * @returns {CoworkCandidate[]}
 */
export function fleetCandidates(platform, floor, latest) {
  const floorUrl = coworkPackageUrl(platform, floor)
  const atFloor = /** @type {CoworkCandidate} */ ({
    role: 'floor',
    version: floor,
    file: floorUrl ? floorUrl.slice(floorUrl.lastIndexOf('/') + 1) : null,
    url: floorUrl
  })
  if (latest === 'unread') return [{ role: 'latest', version: null, file: null, url: null }, atFloor]
  if (
    !latest ||
    typeof latest.version !== 'string' ||
    typeof latest.package !== 'string' ||
    !latest.version ||
    !latest.package.startsWith(COWORK_RELEASE_BASE_URL) ||
    !coworkNewer(latest.version, floor)
  )
    return [atFloor]
  return [
    {
      role: 'latest',
      version: latest.version,
      file: latest.package.slice(latest.package.lastIndexOf('/') + 1),
      url: latest.package
    },
    atFloor
  ]
}

/**
 * The whole answer: which plugin, or plugins, a new site of this release version may get.
 * @param {{
 *   platform: string, tag: string, version: string,
 *   own?: { file: string, sha256?: string, bytes?: number | null, githubAssetId?: number | null, url?: string } | null,
 *   contract: { coworkMinVersion?: string | null } | null,
 *   pins: Record<string, any> | null,
 *   latest?: { version: string, package: string } | null | 'unread'
 * }} input `own`: the release's `install.cowork` as the entry carries it; `latest`: per this platform
 * @returns {CoworkSelection}
 */
export function coworkSelection({ platform, tag, version, own = null, contract, pins, latest = 'unread' }) {
  // `resolveInstall` asks for a pin only when a contract seals the version.
  const pin = contract ? pinOf(pins, tag, version) : null
  const chosen = installedCowork(own, pin)
  if (chosen?.source === 'pin') {
    const p = chosen.cowork
    return {
      source: 'pin',
      candidates: [
        {
          role: 'pin',
          version: p.version ?? null,
          file: p.file,
          url: p.url || null,
          sha256: p.sha256,
          bytes: p.bytes,
          githubAssetId: p.githubAssetId ?? null
        }
      ]
    }
  }
  if (chosen?.source === 'release') {
    const o = chosen.cowork
    return {
      source: 'release',
      candidates: [
        {
          role: 'release',
          version: null,
          file: o.file,
          url: o.url ?? null,
          ...(o.sha256 ? { sha256: o.sha256 } : {}),
          bytes: o.bytes ?? null,
          githubAssetId: o.githubAssetId ?? null
        }
      ]
    }
  }
  if (!DEFAULT_COWORK_FLOOR[platform]) return { source: 'none', candidates: [] }
  const floor =
    typeof contract?.coworkMinVersion === 'string' && /^\d+\.\d+\.\d+$/.test(contract.coworkMinVersion)
      ? contract.coworkMinVersion
      : DEFAULT_COWORK_FLOOR[platform]
  return { source: 'fleet', floor, latest, candidates: fleetCandidates(platform, floor, latest) }
}
