/** The public browser origin is supplied by tracy-web inside the signed job body. */
export function publicOriginOf(value) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^https?:\/\/[^\s/?#]+\/?$/.test(value))
    throw new Error('refused publicOrigin')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('refused publicOrigin')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('refused publicOrigin')
  return url.origin
}

/** Do not mutate the host environment: jobs for different deployments may overlap. */
export function publicOriginEnv(body, inherited = process.env) {
  const env = { ...inherited }
  const origin = publicOriginOf(body.publicOrigin)
  if (origin !== undefined) env.TRACY_ORIGIN = origin
  return env
}

/**
 * The origin a demo gives itself, held to its own hostname (`/demo-qa`, `/capture`): `null` when none is named,
 * `undefined` when the value is refused — an origin on any other host could point the browser anywhere.
 * @param {unknown} value @param {string | null} host
 */
export function ownPublicOrigin(value, host) {
  if (value === undefined || value === null) return null
  try {
    const origin = new URL(String(value))
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.hostname !== host ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      return undefined
    return origin.origin
  } catch {
    return undefined
  }
}
