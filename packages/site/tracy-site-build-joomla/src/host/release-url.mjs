/** Resolve a private release on the harness; the GitHub credential never reaches a customer site. */
/** @param {{url: string, githubAssetId?: number}} artifact
 * @param {{token?: string, fetch?: typeof globalThis.fetch}} [options] */
export async function releaseUrl(artifact, options = {}) {
  if (!artifact.githubAssetId) return artifact.url
  if (!Number.isSafeInteger(artifact.githubAssetId) || artifact.githubAssetId < 1)
    throw new Error('Invalid release asset id')
  const token = options.token ?? process.env.TRACY_RELEASES_GITHUB_TOKEN
  if (!token)
    throw new Error(
      'The build host needs access to the private template release (TRACY_RELEASES_GITHUB_TOKEN).'
    )
  const response = await (options.fetch ?? globalThis.fetch)(
    `https://api.github.com/repos/JoomlArt-Products/joomlart-products/releases/assets/${artifact.githubAssetId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/octet-stream',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000)
    }
  )
  // Binary responses cannot be relayed by URL. Refuse rather than pass the host credential on.
  if (response.status !== 302) {
    await response.body?.cancel()
    throw new Error(`The private template download could not be authorized (HTTP ${response.status}).`)
  }
  const location = new URL(response.headers.get('location') ?? '')
  if (
    location.protocol !== 'https:' ||
    location.hostname !== 'release-assets.githubusercontent.com' ||
    location.username ||
    location.password
  )
    throw new Error('The template release returned an unexpected download host')
  return location.href
}
