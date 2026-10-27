/** Runtime origin wins over the Docker-internal request URL; never trust forwarded headers. */
export function publicOrigin(requestUrl: URL, configured = process.env.EMDASH_SITE_URL): string {
  if (!configured) return requestUrl.origin
  const url = new URL(configured)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('EMDASH_SITE_URL must be an HTTP(S) site origin without credentials, path or query')
  }
  return url.origin
}
