/**
 * Writing one file onto a release of the quickstarts repository — and removing one.
 *
 * WHY THIS EXISTS WHEN `scripts/tracy-setting.mjs` REFUSES TO UPLOAD. The script prints a
 * `gh release upload` line for a person to run, on purpose: attaching a file to a customer-facing
 * release is a decision, and a script run from a laptop is not in a position to make it. On the
 * operations page the decision has already been made — an administrator pressed a button — so what
 * is left is doing it correctly. Same rule, different side of the press.
 *
 * 🔒 GITHUB DOES NOT REPLACE AN ASSET, IT REFUSES ONE. Uploading over a name that is already on the
 * release answers 422 and leaves the old bytes attached; a caller that ignored the status would
 * report success while the release still carried last week's card. So an upload is always
 * delete-then-upload, and the result says which of the two happened — `replaced: true` is a fact
 * the screen can show, not an implementation detail.
 *
 * Every failure is a sentence in `reason`, never a throw: the caller is a door answering a press,
 * and "GitHub answered 401" is something an administrator can act on where a stack trace is not.
 */
import { RELEASES_REPO, releasesToken } from './quickstart-releases.js'

const API = 'https://api.github.com'
/** Assets go to a different host from the rest of the API — GitHub's own split, not Tracy's. */
const UPLOADS = 'https://uploads.github.com'

const headers = (token) => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'user-agent': 'tracy-web',
  'x-github-api-version': '2022-11-28'
})

/**
 * The release behind a tag, or a sentence saying why there is none to write to.
 * @returns {Promise<{ release: any, reason: null } | { release: null, reason: string }>}
 */
async function releaseFor(fetchImpl, repo, tag, token) {
  const response = await fetchImpl(`${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: headers(token)
  })
  if (response.status === 404)
    return { release: null, reason: `${repo} has no release tagged ${JSON.stringify(tag)}.` }
  if (!response.ok)
    return {
      release: null,
      reason: `GitHub answered ${response.status} reading ${JSON.stringify(tag)} of ${repo}.`
    }
  return { release: await response.json(), reason: null }
}

/** Remove one asset by its id. A 404 counts as removed: the end state is what was asked for. */
async function removeAsset(fetchImpl, repo, id, token) {
  const response = await fetchImpl(`${API}/repos/${repo}/releases/assets/${id}`, {
    method: 'DELETE',
    headers: headers(token)
  })
  if (response.ok || response.status === 404) return null
  return `GitHub answered ${response.status} removing asset ${id} from ${repo}.`
}

/**
 * Put one file on a release, replacing what is there under that name.
 * @param {{ github: any, releasesToken: string | null }} config
 * @param {{ tag: string, name: string, body: string | Uint8Array, contentType?: string }} file
 * @param {{ fetchImpl?: typeof fetch, repo?: string }} [opts]
 * @returns {Promise<{ ok: true, replaced: boolean, id: number } | { ok: false, reason: string }>}
 */
export async function uploadReleaseAsset(
  config,
  { tag, name, body, contentType = 'application/json' },
  { fetchImpl = fetch, repo = RELEASES_REPO } = {}
) {
  const { token, reason: noToken } = await releasesToken(config, fetchImpl, repo)
  if (!token) return { ok: false, reason: noToken }

  const { release, reason } = await releaseFor(fetchImpl, repo, tag, token)
  if (!release) return { ok: false, reason }

  const existing = (release.assets ?? []).find((a) => a.name === name)
  if (existing) {
    const failed = await removeAsset(fetchImpl, repo, existing.id, token)
    if (failed) return { ok: false, reason: failed }
  }

  const response = await fetchImpl(
    `${UPLOADS}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    { method: 'POST', headers: { ...headers(token), 'content-type': contentType }, body }
  )
  if (!response.ok)
    return {
      ok: false,
      reason: `GitHub answered ${response.status} attaching ${JSON.stringify(name)} to ${tag}.`
    }
  const attached = await response.json()
  return { ok: true, replaced: Boolean(existing), id: attached.id }
}

/**
 * Take one file off a release. `deleted: false` means it was not there — which is the end state the
 * caller asked for, so it is not a failure.
 * @param {{ github: any, releasesToken: string | null }} config
 * @param {{ tag: string, name: string }} file
 * @param {{ fetchImpl?: typeof fetch, repo?: string }} [opts]
 * @returns {Promise<{ ok: true, deleted: boolean } | { ok: false, reason: string }>}
 */
export async function deleteReleaseAsset(
  config,
  { tag, name },
  { fetchImpl = fetch, repo = RELEASES_REPO } = {}
) {
  const { token, reason: noToken } = await releasesToken(config, fetchImpl, repo)
  if (!token) return { ok: false, reason: noToken }

  const { release, reason } = await releaseFor(fetchImpl, repo, tag, token)
  if (!release) return { ok: false, reason }

  const existing = (release.assets ?? []).find((a) => a.name === name)
  if (!existing) return { ok: true, deleted: false }
  const failed = await removeAsset(fetchImpl, repo, existing.id, token)
  return failed ? { ok: false, reason: failed } : { ok: true, deleted: true }
}

/**
 * Fetch one asset off a release, as bytes, and prove they are the bytes the release described.
 *
 * 🔒 THE CHECKSUM IS NOT OPTIONAL HERE. These bytes are about to be unpacked into a webroot on a
 * server Tracy does not own. A truncated download, a proxy's error page served with a 200, an
 * asset replaced since the setting was written — all three arrive as "a file" and only the hash
 * tells them apart. A package that does not match is not installed, and the sentence says so.
 *
 * @returns {Promise<{ bytes: Buffer, reason: null } | { bytes: null, reason: string }>}
 */
export async function downloadReleaseAsset(fetchImpl, { repo = RELEASES_REPO, tag, file, sha256, token }) {
  const { release, reason } = await releaseFor(fetchImpl, repo, tag, token)
  if (release === null) return { bytes: null, reason }
  const asset = (release.assets ?? []).find((a) => a.name === file)
  if (!asset) return { bytes: null, reason: `${tag} carries no asset called ${JSON.stringify(file)}.` }

  const response = await fetchImpl(`${API}/repos/${repo}/releases/assets/${asset.id}`, {
    headers: { ...headers(token), accept: 'application/octet-stream' }
  })
  if (!response.ok) return { bytes: null, reason: `GitHub answered ${response.status} downloading ${file}.` }
  const bytes = Buffer.from(await response.arrayBuffer())

  if (typeof sha256 === 'string' && sha256 !== '') {
    const { createHash } = await import('node:crypto')
    const got = createHash('sha256').update(bytes).digest('hex')
    if (got !== sha256)
      return {
        bytes: null,
        reason: `${file} does not match the checksum the release declared (got ${got.slice(0, 12)}…).`
      }
  }
  return { bytes, reason: null }
}
