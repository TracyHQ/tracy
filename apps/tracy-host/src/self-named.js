/**
 * A demo opened at the name it gives itself, served from the address that answers here. On the macOS stand the
 * site's name (`<label>.tracy.test:8080`) does not resolve inside tracy-host, while WordPress writes every link and
 * redirect with it — and sends a request for its container name to that name's port (`<label>-web-1:8080`), where
 * nothing listens. So a request on one of the site's names is fetched at `serveFrom` with that name as its Host,
 * and a redirect to another of its names is followed the same way. The QA reader (`demo-qa-browser.js`) and the
 * screenshotter (`browser.js`) both route through it.
 */
import { hostIn } from './demo-qa.js'

/** One fetch of a self-named request at the reachable address. */
const SERVE_TIMEOUT_MS = 20_000

/**
 * @param {{url: string, serveFrom: string | null, siteHosts?: string[], serveFromIsProxy?: boolean, proxySiteLabel?: string | null, onLanded?: (requested: string, landed: string) => void}} input
 * @returns {{selfNamed: (u: URL) => boolean, serve: (route: any, u: URL) => Promise<unknown>, hosts: string[]}}
 */
export function selfNamedServer({
  url,
  serveFrom,
  siteHosts = [],
  serveFromIsProxy = false,
  proxySiteLabel = null,
  onLanded = () => {}
}) {
  const via = serveFrom ? new URL(serveFrom).origin : null
  const hosts = [
    ...siteHosts,
    new URL(url).hostname,
    ...(via && !serveFromIsProxy ? [new URL(via).hostname] : [])
  ]
  const selfNamed = (u) => via !== null && u.origin !== via && hostIn(u.hostname, hosts)
  const serve = async (r, u) => {
    const req = r.request()
    let at = u
    for (let hop = 0; hop < 5; hop++) {
      const res = await r.fetch({
        url: via + at.pathname + at.search,
        // The reachable backend may be HTTP while the visitor's address is HTTPS.
        // Refresh proxy identity at every redirect hop so CMS canonical redirects see that address.
        headers: {
          ...req.headers(),
          host: at.host,
          'x-forwarded-host': at.host,
          'x-forwarded-proto': at.protocol.slice(0, -1),
          'x-forwarded-port': at.port || (at.protocol === 'https:' ? '443' : '80')
        },
        maxRedirects: 0,
        timeout: SERVE_TIMEOUT_MS
      })
      try {
        if (
          serveFromIsProxy &&
          req.isNavigationRequest() &&
          (!proxySiteLabel || res.headers()['x-tracy-site-response'] !== proxySiteLabel)
        )
          return await r.abort('failed')
        const to = res.headers().location
        if (res.status() >= 300 && res.status() < 400 && to) {
          let t = null
          try {
            t = new URL(to, at.href)
          } catch {}
          if (t && selfNamed(t)) {
            at = t
            continue
          }
          if (serveFromIsProxy && req.isNavigationRequest() && t && !selfNamed(t))
            return await r.abort('failed')
        }
        if (at !== u && req.isNavigationRequest()) onLanded(req.url(), at.href)
        return await r.fulfill({ response: res })
      } finally {
        // Playwright retains fetched response bytes until disposal, even after the page closes.
        // Fulfillment must finish before those bytes are released; redirects need no body afterward.
        if (typeof res.dispose === 'function') await res.dispose().catch(() => {})
      }
    }
    return r.abort('failed')
  }
  return { selfNamed, serve, hosts }
}
