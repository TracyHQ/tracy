/**
 * Can THIS page frame THAT demo? One GET at the demo, its headers read and cached, the body dropped.
 *
 * The question is asked by a template card about to mount a live iframe (see `lib/frame-allowed.js`
 * for why the client cannot answer it alone). It is asked from a public page by strangers, so the
 * cost is bounded three ways: one request per demo per TTL whatever the number of askers or
 * origins (the HEADERS are cached, the origin is compared afterwards), a short timeout, and a
 * failure cached like an answer — a demo that is down is not knocked on by every card that opens.
 *
 * GET, NOT HEAD. Measured 20/09 on `apple-joomla.tracy.site`: HEAD answered `301` and a stale
 * `X-Frame-Options`, GET answered `200` with the CSP the card needs. And `200` + `text/html` is
 * required: the bar proxy answers a 502 page for a demo that is down, and that page fires `load`
 * in an iframe exactly like a demo would.
 */
import { frameAllowed } from './frame-allowed.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 3000

/**
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {number} [deps.ttlMs] - how long one demo's headers are kept
 * @param {number} [deps.timeoutMs] - how long one demo has to answer
 * @param {() => number} [deps.now]
 * @returns {(demoUrl: string, origin: string) => Promise<{ framable: boolean, reason: string }>}
 */
export function makeDemoFrameProbe({
  fetchImpl = fetch,
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now
} = {}) {
  /** @type {Map<string, { at: number, answer: { csp: string | null, xfo: string | null, demoOrigin: string } | { failure: string } }>} */
  const cache = new Map()

  async function read(demoUrl) {
    const held = cache.get(demoUrl)
    if (held && now() - held.at < ttlMs) return held.answer
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let answer
    try {
      const res = await fetchImpl(demoUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { accept: 'text/html' },
        signal: ac.signal
      })
      // The headers are the answer; the body is a whole home page nobody here reads.
      res.body?.cancel().catch(() => undefined)
      if (res.status !== 200) answer = { failure: `status:${res.status}` }
      else if (!/^text\/html\b/i.test(res.headers.get('content-type') ?? '')) answer = { failure: 'not-html' }
      else
        answer = {
          csp: res.headers.get('content-security-policy'),
          xfo: res.headers.get('x-frame-options'),
          demoOrigin: new URL(res.url || demoUrl).origin
        }
    } catch {
      answer = { failure: 'unreachable' }
    } finally {
      clearTimeout(timer)
    }
    cache.set(demoUrl, { at: now(), answer })
    return answer
  }

  return async (demoUrl, origin) => {
    if (typeof demoUrl !== 'string' || !/^https?:\/\//i.test(demoUrl))
      return { framable: false, reason: 'no-demo' }
    const answer = await read(demoUrl)
    if ('failure' in answer) return { framable: false, reason: answer.failure }
    const verdict = frameAllowed(answer, origin)
    return { framable: verdict.allowed, reason: verdict.reason }
  }
}
