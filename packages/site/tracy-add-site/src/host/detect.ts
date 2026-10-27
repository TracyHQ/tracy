/** Public-page checks for import. Unknown platform stays a warning, never a refusal. */
import { diagnosticError } from './diagnostic.mjs'
import { firewallOf, USER_AGENT } from './firewall.mjs'
import { inspectAdminPage, isTlsFailure } from './joomla.js'
import { isSupportedUrl, nextRedirectUrl } from './url-policy.mjs'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 512 * 1024
export type Detected = 'joomla' | 'wordpress' | null

const MARKS: Array<{ platform: Exclude<Detected, null>; pattern: RegExp }> = [
  { platform: 'wordpress', pattern: /\/wp-(?:content|includes)\//i },
  { platform: 'joomla', pattern: /\/media\/(?:system|templates)\/js\//i },
  { platform: 'joomla', pattern: /\/templates\/[a-z0-9_-]+\/(?:css|js)\//i },
  { platform: 'wordpress', pattern: /<meta[^>]+name=["']generator["'][^>]+WordPress/i },
  { platform: 'joomla', pattern: /<meta[^>]+name=["']generator["'][^>]+Joomla/i },
  { platform: 'joomla', pattern: /\/index\.php\?option=com_/i }
]

export interface Detection {
  platform: Detected
  reachable: boolean
  secure: boolean | null
  blocked: boolean
  status?: number
  error?: string
  firewall?: string
  admin?: { signInFound: boolean | null; locked: boolean; basicAuthRequired: boolean }
}

/** Keep the read bounded even when a server streams a large or endless document. */
async function readPrefix(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const chunk = value.subarray(0, MAX_BYTES - size)
      chunks.push(chunk)
      size += chunk.length
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** A read-only GET with verified TLS, no cookies or credentials, and no HTTPS downgrade. */
export async function inspectAddress(
  address: string,
  fetchImpl: typeof fetch = fetch,
  admin = false,
  platform: Detected = 'joomla'
): Promise<Detection> {
  const initial = /^https?:\/\//i.test(address) ? address : `https://${address}`
  const unknown: Detection = { platform: null, reachable: false, secure: null, blocked: false }
  if (admin) unknown.admin = { signInFound: null, locked: false, basicAuthRequired: false }
  if (!isSupportedUrl(initial)) return { ...unknown, error: 'other' }
  const secure = new URL(initial).protocol === 'https:'
  let url = initial
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    let response: Response | undefined
    for (let hop = 0; hop < 6; hop++) {
      response = await fetchImpl(url, { redirect: 'manual', signal, headers: { 'user-agent': USER_AGENT } })
      const location = response.headers.get('location')
      if (response.status < 300 || response.status >= 400 || !location) break
      await response.body?.cancel().catch(() => undefined)
      if (hop === 5) throw new Error('too many redirects')
      const next = nextRedirectUrl(url, location)
      if (!next || (secure && new URL(next).protocol !== 'https:'))
        throw new Error('untrusted redirect target')
      url = next
    }
    if (!response) return unknown
    const html = await readPrefix(response)
    const blockedBy = firewallOf(response.status, response.headers, html)
    // CDN identification warns about protection; only a challenge/block proves it acted.
    const firewall =
      blockedBy ?? (/cloudflare/i.test(response.headers.get('server') ?? '') ? 'cloudflare' : null)
    const basicAuthRequired =
      response.status === 401 && /^basic\b/i.test(response.headers.get('www-authenticate') ?? '')
    const answer: Detection = {
      platform: MARKS.find((mark) => mark.pattern.test(html))?.platform ?? null,
      reachable: response.ok || basicAuthRequired || !!blockedBy || (admin && response.status === 403),
      secure: new URL(url).protocol === 'https:',
      blocked: !!blockedBy,
      status: response.status,
      ...(firewall ? { firewall } : {})
    }
    if (admin)
      answer.admin = {
        ...(basicAuthRequired || blockedBy
          ? { signInFound: null, locked: false }
          : platform === 'wordpress'
            ? {
                signInFound: response.ok && /<form\b[^>]*\bid=["']loginform["']/i.test(html),
                locked: response.status === 403
              }
            : inspectAdminPage(html, response.status, url, initial)),
        basicAuthRequired
      }
    return answer
  } catch (error) {
    return {
      ...unknown,
      ...(isTlsFailure(error) ? { reachable: true, secure: false } : {}),
      error: diagnosticError(error)
    }
  }
}

/** Compatibility for callers that only need the platform guess. */
export async function detectPlatform(siteKey: string, fetchImpl: typeof fetch = fetch): Promise<Detected> {
  return (await inspectAddress(siteKey, fetchImpl)).platform
}
