// Keep passive external assets at their original URLs and bytes. Chromium's native external requests can stall
// independently of the site; Playwright's request transport shares the request and response semantics instead.
export const MAX_ASSET_BYTES = 16 * 1024 * 1024
const PASSIVE = new Set(['image', 'font', 'stylesheet'])

export function externalPassiveAsset(request, { siteUrl, hostHeader }) {
  const url = new URL(request.url())
  return (
    request.method() === 'GET' &&
    PASSIVE.has(request.resourceType()) &&
    ['http:', 'https:'].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    url.host !== new URL(siteUrl).host &&
    (!hostHeader || url.host.toLowerCase() !== hostHeader.toLowerCase())
  )
}

/** A fulfilled-body limit, not a hard download limit: Playwright fetch buffers its response before returning. */
export async function fulfillExternalAsset(route) {
  let response
  let body
  try {
    try {
      response = await route.fetch({ timeout: 15000, maxRedirects: 0 })
      if (Number(response.headers()['content-length']) > MAX_ASSET_BYTES) return false
      body = await response.body()
      if (body.length > MAX_ASSET_BYTES) return false
    } catch {
      return false
    }
    // The response keeps its status, headers and redirect location. The browser follows redirects normally.
    await route.fulfill({ response, body })
    return true
  } finally {
    await response?.dispose().catch(() => {})
  }
}

/** Shared by one browser context; a full queue uses the original browser transport instead of growing forever. */
export function createAssetTransport({ maxConcurrent = 6, maxWaiting = 32 } = {}) {
  let active = 0
  const waiting = []
  return async (route) => {
    if (active >= maxConcurrent) {
      if (waiting.length >= maxWaiting) return false
      await new Promise((resolve) => waiting.push(resolve))
    } else active++
    try {
      return await fulfillExternalAsset(route)
    } finally {
      if (waiting.length) waiting.shift()()
      else active--
    }
  }
}
