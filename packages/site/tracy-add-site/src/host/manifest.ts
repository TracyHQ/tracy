/**
 * Which Claude Cowork release is current, and where to get the package — asks EXACTLY one source.
 *
 * That source is two files on the `main` branch of `TracyHQ/claude-cowork`, the same files the customer's
 * site itself reads when it checks for updates. The `releases` page is only **where the zip is stored**, not
 * where the version question is answered.
 *
 * 🔒 NO TAG SCANNING, NO RELEASES API. The fleet tried that and broke **silently**:
 * a hard-coded glob (`wordpress-v0.6.*`) could not match `0.8.x`, so the fleet stood still at 0.6.3 while
 * Desk installed 0.8.0 — measured 29/08/2026 on a real new-born site. One number, three places answering
 * differently, none looking wrong to someone holding only one.
 *
 * 🔒 NO "FLOOR" (`BUNDLED_VERSION`) HERE. That constant in `tracy-desk` was called *bundled* from when the zip
 * still lived inside the app — a physical fact about the copy on disk. After bundling was dropped it was kept
 * as a floor and lost all footing. The rule is enough: read the manifest → compare with the installed copy → older means install.
 * Two numbers, both read at runtime, neither typed into this code.
 *
 * The ONLY guard left is **not a number**: the package must be a release asset of that very repo.
 * A package arrives over the network and is handed to the customer's site to download and install itself; a
 * foreign address installed on the customer's server is a security matter.
 */

const MANIFEST_URL: Record<CoworkPlatform, string> = {
  joomla: 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json',
  wordpress: 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/update.json'
}

/** The only address a package may come from. */
const RELEASE_PREFIX = 'https://github.com/TracyHQ/claude-cowork/releases/download/'

/** Long enough for a slow network, short enough that an install does not hang while GitHub has a bad minute. */
const MANIFEST_TIMEOUT_MS = 15_000

export type CoworkPlatform = 'joomla' | 'wordpress'

export interface LatestExtension {
  version: string
  /** The `.zip` file — what gets installed. */
  packageUrl: string
  /** The release page, shown for people installing by hand. */
  releaseUrl: string | null
  /** The `requires_php` the manifest declares, when it declares one (`joomla/update.json` does). */
  requiresPhp?: string
}

/**
 * Why it could not be fetched — four reasons, and they need four different sentences on screen.
 *
 * Folding them into "could not download the installer" makes the reader guess whether to retry, wait, or
 * call someone.
 */
export type ManifestRefusal = 'unreachable' | 'unreadable' | 'no_version' | 'untrusted_url'

export class ManifestUnavailable extends Error {
  constructor(readonly reason: ManifestRefusal) {
    super(`Could not read the Claude Cowork manifest: ${reason}`)
    this.name = 'ManifestUnavailable'
  }
}

/**
 * Compare two versions part by number part.
 *
 * NOT a string comparison, and that is the whole reason this function exists: as text `'0.10.0'` sorts BEFORE
 * `'0.9.0'`, so the tenth minor would read as older than the ninth. Missing parts read as 0, so `0.2` equals `0.2.0`.
 */
export function isNewer(a: string, b: string): boolean {
  const parts = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const [left, right] = [parts(a), parts(b)]
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const [l, r] = [left[index] ?? 0, right[index] ?? 0]
    if (l !== r) return l > r
  }
  return false
}

/**
 * Whether the copy installed on the site needs replacing.
 *
 * `undefined` means the site cannot say which version it runs (an old extension without an answering door)
 * — and the right answer to "don't know" is YES, install over it: a copy that cannot declare its own
 * version is almost certainly older than one that can.
 */
export function needsInstall(installed: string | undefined, latest: string): boolean {
  if (!installed) return true
  return isNewer(latest, installed)
}

/** Read a readable version from the manifest body, or null. */
function versionOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as { version?: unknown }).version
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function stringField(payload: unknown, field: string): string | null {
  const value = (payload as Record<string, unknown> | null)?.[field]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The current release and where to get it.
 *
 * 🔒 **An unreadable manifest THROWS; never guess.** There is no floor to fall back to, and silently
 * installing an old copy breaks somewhere else, later, where nobody can trace it back. A plain sentence — "could not
 * fetch the Claude Cowork installer yet, try again later" — is something people can act on.
 *
 * 🔒 **The `.zip` suffix is not cosmetic.** Joomla derives the file name from the URL and keeps the query string,
 * so a presigned URL reads as a file without extension and the install dies with "Unable to detect
 * manifest file". Every address that passes the release-prefix guard ends in `.zip`.
 * @param platform The site's platform.
 * @param fetchImpl Injected for tests; defaults to the global `fetch`.
 * @returns The version, the package URL, the release page URL.
 */
export async function latestExtension(
  platform: CoworkPlatform,
  fetchImpl: typeof fetch = fetch
): Promise<LatestExtension> {
  let response: Response
  try {
    response = await fetchImpl(MANIFEST_URL[platform], {
      signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS)
    })
  } catch {
    throw new ManifestUnavailable('unreachable')
  }
  if (!response.ok) throw new ManifestUnavailable('unreachable')

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ManifestUnavailable('unreadable')
  }

  const version = versionOf(payload)
  const packageUrl = stringField(payload, 'package')
  if (!version || !packageUrl) throw new ManifestUnavailable('no_version')
  if (!packageUrl.startsWith(RELEASE_PREFIX)) throw new ManifestUnavailable('untrusted_url')

  const releaseUrl = stringField(payload, 'url')
  const requiresPhp = stringField(payload, 'requires_php') ?? undefined
  return {
    version,
    packageUrl,
    ...(requiresPhp ? { requiresPhp } : {}),
    // The release page must belong to that repo too — it is what users are shown to press.
    releaseUrl:
      releaseUrl && releaseUrl.startsWith('https://github.com/TracyHQ/claude-cowork/') ? releaseUrl : null
  }
}
