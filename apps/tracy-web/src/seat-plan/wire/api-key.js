/**
 * What the three pasted-key vendors (Kimi, GLM, Qwen) share: the identity of a key, and the probe
 * that proves a key before the broker keeps it, with its failures sorted into three kinds the person
 * can act on — `key` (the vendor refused the key), `plan` (the key is known but has no plan or
 * balance behind it), `vendor` (the vendor could not be asked: down, 5xx, timeout).
 *
 * A passing probe proves the vendor knows the key; it does not prove a chat will be served.
 */
import { createHash } from 'node:crypto'
import { fetchWithTimeout } from './http.js'

const PROBE_TIMEOUT_MS = 15000
/** Words a vendor uses in a 429 when a known key has no plan, balance or quota left behind it. */
const PLAN_WORDS = /plan|package|subscri|membership|quota|balance|arrear|billing|recharge|not.?activated/i

/**
 * The sealed credential of a key vendor: the key, and the endpoint that accepted it when the vendor
 * has more than one (Qwen's regions).
 */
export const keyBlob = (apiKey, baseUrl) => ({ kind: 'key', v: 1, apiKey, ...(baseUrl ? { baseUrl } : {}) })

/** A key's identity: the full SHA-256 of the key (the credential, not the vendor account) and a label that shows its tail only. */
export function keyIdentity(apiKey) {
  return {
    subject: createHash('sha256').update(apiKey).digest('hex'),
    label: `API key …${apiKey.slice(-4)}`
  }
}

/** The key of a key blob, or a 401 the broker reads as "reconnect". */
export function apiKeyOf(blob) {
  const key = blob?.apiKey
  if (typeof key !== 'string' || !key) throw Object.assign(new Error('API key missing'), { status: 401 })
  return key
}

/** An error the broker maps by `code`; the vendor's answer stays out of the message beyond a short snippet. */
export function keyFailure(code, status, detail = '') {
  return Object.assign(new Error(`api key probe failed (${code}${status ? ` ${status}` : ''})`), {
    code,
    status,
    detail: String(detail).slice(0, 200)
  })
}

/**
 * Sorts a vendor's refusal into `key`, `plan` or `vendor`. Only a 401 says the key is wrong. A 403 is
 * an access or policy refusal of a key the vendor knows (Kimi's coding-agent check, the GLM Coding
 * Plan's tool limits, a Qwen model not activated), whatever its words, so it is never "wrong key".
 */
export function classifyRefusal(status, text = '') {
  if (status === 401) return 'key'
  if (status === 402 || status === 403) return 'plan'
  if (status === 429 && PLAN_WORDS.test(text)) return 'plan'
  return 'vendor'
}

/**
 * GETs `url` with the key and returns the parsed body; any refusal is a `keyFailure`.
 * @param {any} fetchImpl
 * @param {string} url
 * @param {Record<string, string>} headers
 */
export async function probe(fetchImpl, url, headers) {
  let res
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      url,
      { method: 'GET', headers: { Accept: 'application/json', ...headers } },
      { timeoutMs: PROBE_TIMEOUT_MS }
    )
  } catch (error) {
    throw keyFailure('vendor', 0, error?.name)
  }
  let text = ''
  try {
    text = await res.text()
  } catch (error) {
    throw keyFailure('vendor', res.status, error?.name)
  }
  if (!res.ok) throw keyFailure(classifyRefusal(res.status, text), res.status, text)
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
