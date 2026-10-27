import { bornSiteAddress } from '../lib/site-address.js'
import { siteTarget } from './resolver.js'

/** Read only this site's homepage; never accept a URL supplied by the caller. */
export async function declaredSiteIcon(site, config, fetchImpl = fetch) {
  const address = new URL(site.address || bornSiteAddress(site.label, config))
  const target = siteTarget(site, config)
  const response = await fetchImpl(target, {
    headers: { 'x-forwarded-host': address.host, 'x-forwarded-proto': address.protocol.slice(0, -1) },
    redirect: 'manual',
    signal: AbortSignal.timeout(4000)
  })
  if (!response.ok || !response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  try {
    while (html.length < 65536) {
      const { value, done } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const head = html.split(/<\/head\s*>/i, 1)[0]
  for (const [, tag] of head.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
        ([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare]
      )
    )
    if (!attrs.rel?.toLowerCase().split(/\s+/).includes('icon') || !attrs.href) continue
    const icon = new URL(attrs.href, address)
    if (icon.protocol === 'http:' || icon.protocol === 'https:') return icon.href
  }
  return null
}
