/**
 * Link status for the site check's `pageMeasures` (`demo-qa-page-measures.js`): a real HEAD request, then a GET when the
 * HEAD is refused or fails, for the links that lead into the site itself.
 *
 * 🔒 EXTERNAL LINKS ARE NOT REQUESTED. The page's own author, not the visitor, wrote them, and a request from the host
 * to an address a page names is a request to any address (an internal service, a metadata endpoint). Third parties also
 * rate-limit and block a crawler, so a "dead" answer from one would be noise. An external link is left out of `links`
 * (no status is not a status: the judge reads a missing one as dead) and counted in the summary as `external`.
 *
 * Bounded: at most MAX_LINKS_CHECKED distinct addresses a run, LINKS_AT_ONCE at a time, REQUEST_TIMEOUT_MS each, and the
 * whole phase stops starting requests after PHASE_MS or at the run's own limit. An address not reached in time is left
 * out and counted as `overCap` or `outOfTime`, never reported as dead.
 */
import { hostIn } from './demo-qa.js'

export const MAX_LINKS_CHECKED = 120
export const LINKS_AT_ONCE = 4
export const REQUEST_TIMEOUT_MS = 5_000
export const PHASE_MS = 20_000
const REDIRECT_HOPS = 3

/**
 * @param {{ base: string, serveFrom?: string | null, serveFromIsProxy?: boolean, proxySiteLabel?: string | null, siteHosts?: string[] }} site
 */
export function siteLinkTarget({ base, serveFrom = null, serveFromIsProxy = false, siteHosts = [] }) {
  const via = serveFrom ? new URL(serveFrom).origin : null
  const own = [
    new URL(base).hostname,
    ...siteHosts,
    ...(via && !serveFromIsProxy ? [new URL(via).hostname] : [])
  ]
  /** Where to ask for this address and with which headers, or null when it is not the site's. */
  return (href) => {
    let u
    try {
      u = new URL(href)
    } catch {
      return null
    }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !hostIn(u.hostname, own)) return null
    if (!via) return { url: new URL(u.pathname + u.search, base).href, headers: {} }
    return {
      url: via + u.pathname + u.search,
      headers: {
        host: u.host,
        'x-forwarded-host': u.host,
        'x-forwarded-proto': u.protocol.slice(0, -1),
        'x-forwarded-port': u.port || (u.protocol === 'https:' ? '443' : '80')
      }
    }
  }
}

/** One request's answer: HEAD, then GET when that answers an error or fails. Status null when nothing answered. */
async function ask(
  t,
  { fetchImpl, signal, proxySiteLabel, serveFromIsProxy, requestTimeoutMs = REQUEST_TIMEOUT_MS }
) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetchImpl(t.url, {
        method,
        redirect: 'manual',
        headers: t.headers,
        signal: AbortSignal.any([AbortSignal.timeout(requestTimeoutMs), ...(signal ? [signal] : [])])
      })
      await res.body?.cancel().catch(() => {})
      // A proxied answer that is not the site's own is no answer of the site.
      if (
        serveFromIsProxy &&
        proxySiteLabel &&
        res.headers?.get?.('x-tracy-site-response') !== proxySiteLabel
      )
        return { status: null, location: null }
      if (res.status < 400 || method === 'GET')
        return { status: res.status, location: res.headers?.get?.('location') ?? null }
    } catch {
      signal?.throwIfAborted()
      if (method === 'GET') return { status: null, location: null }
    }
  }
  return { status: null, location: null }
}

/**
 * A silent address is asked a second time, with twice the time: one slow or dropped first answer (a picture made on first use, a
 * connection limit) is no proof the link is dead, and its status is shared by every page that carries the link. An address that
 * answers an error status is not asked again; one that stays silent twice stays without a status.
 */
async function askTwice(t, how) {
  const first = await ask(t, how)
  if (first.status !== null) return first
  how.signal?.throwIfAborted()
  await new Promise((r) => setTimeout(r, 100))
  return ask(t, { ...how, requestTimeoutMs: (how.requestTimeoutMs ?? REQUEST_TIMEOUT_MS) * 2 })
}

/** One address's final status, a redirect to another address of the site followed for a few hops. */
async function statusOf(href, target, how) {
  let at = href
  let answer = { status: null, location: null }
  for (let hop = 0; hop <= REDIRECT_HOPS; hop++) {
    const t = target(at)
    if (!t) break
    answer = await askTwice(t, how)
    if (answer.status === null || answer.status < 300 || answer.status >= 400 || !answer.location) break
    let next = null
    try {
      next = new URL(answer.location, at).href
    } catch {}
    if (!next || !target(next)) break
    at = next
  }
  return answer.status
}

/**
 * Give every same-site link of these measures its status. Links not reached are dropped from the answer.
 * @param {{ path: string, width: number, links: { href: string, text: string }[] }[]} measures
 * @param {object} site `siteLinkTarget`'s input, plus `fetchImpl`, `signal`, `now`, `deadlineAt`
 */
export async function withLinkStatus(
  measures,
  {
    fetchImpl = fetch,
    signal,
    now = Date.now,
    deadlineAt = Infinity,
    maxChecked = MAX_LINKS_CHECKED,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    ...site
  }
) {
  const target = siteLinkTarget(site)
  const summary = { checked: 0, external: 0, overCap: 0, outOfTime: 0 }
  /** @type {Map<string, number | null>} */
  const status = new Map()
  const queue = []
  const external = new Set()
  for (const m of measures)
    for (const link of m.links) {
      const t = target(link.href)
      if (!t) {
        external.add(link.href)
        continue
      }
      if (!status.has(t.url) && !queue.some((q) => q.url === t.url))
        queue.push({ url: t.url, href: link.href })
    }
  summary.external = external.size
  const stopAt = Math.min(deadlineAt, now() + PHASE_MS)
  const due = queue.slice(0, maxChecked)
  summary.overCap = queue.length - due.length
  let next = 0
  const worker = async () => {
    while (next < due.length) {
      const item = due[next++]
      if (now() >= stopAt) {
        summary.outOfTime++
        continue
      }
      signal?.throwIfAborted()
      const s = await statusOf(item.href, target, { fetchImpl, signal, requestTimeoutMs, ...site })
      status.set(item.url, s)
      summary.checked++
    }
  }
  await Promise.all(Array.from({ length: Math.min(LINKS_AT_ONCE, due.length) }, worker))
  const answered = measures.map((m) => ({
    ...m,
    links: m.links.flatMap((link) => {
      const t = target(link.href)
      return t && status.has(t.url) ? [{ ...link, status: status.get(t.url) }] : []
    })
  }))
  return { measures: answered, summary }
}
