/**
 * How research reads a business's website (`place-executor.js` collection stage), as one function both the place
 * executor and the build chat's research call (#575): the operator's reader order (/ops/wo `website-content`), the
 * direct crawl, the Apify browser when the crawl answered a thin page (`needsBrowser`), and the rendered readers (Jina,
 * Firecrawl) after them. The caller owns every paid door: `runDirect` (the crawl), `browser` (null when the caller may
 * not pay for a browser run) and `charge` (how a reader's call is paid for).
 */

const USABLE = new Set(['complete', 'partial'])

/**
 * The website-content order when it does not open with the direct crawl then the Apify browser, or the readers after
 * those two when it does: each reader in turn until one gives a page that is not thin (`needsBrowser`). A reader without
 * its key, or a resumed crawl for a one-page reader, is skipped; nothing usable keeps the first answer, as the browser
 * fallback did.
 * @param {{domain: any, keys: Record<string, any>, order: string[], ref: string, cursor: any,
 *   runDirect: () => Promise<any>, browser: (() => Promise<{result: any, fetchedAt: any}>) | null,
 *   charge: (provider: string, call: () => Promise<any>) => Promise<any>, fetch: typeof fetch}} input
 * @returns {Promise<{result: any, fetchedAt: any}>}
 */
export async function readWebsiteInOrder({
  domain,
  keys,
  order,
  ref,
  cursor,
  runDirect,
  browser,
  charge,
  fetch
}) {
  const readers = { jina: domain.readWithJina, firecrawl: domain.readWithFirecrawl }
  let first = null
  let firstUsable = null
  for (const id of order) {
    let result = null
    let fetchedAt = null
    if (id === 'direct') result = await runDirect()
    else if (id === 'apify-browser') {
      if (!browser || !keys.apify || cursor) continue
      const receipt = await browser()
      result = receipt.result
      fetchedAt = receipt.fetchedAt
    } else if (readers[id]) {
      if (!keys[id] || cursor) continue
      result = await charge(id, () => readers[id](ref, { key: keys[id], fetch }))
    } else continue
    first ??= result
    const usable = USABLE.has(result.status)
    if (usable) firstUsable ??= { result, fetchedAt }
    if (usable && !domain.needsBrowser(result))
      return {
        result:
          result === first
            ? result
            : { ...result, fallbackFrom: { status: first.status, reason: first.reason ?? null } },
        fetchedAt
      }
  }
  if (firstUsable) return firstUsable
  return { result: first ?? { status: 'skipped', reason: 'credential_missing' }, fetchedAt: null }
}

/**
 * One read of a website. `order`: the website-content order (`resolveProviderOrder(settings, 'website-content')`), or
 * null for a read that follows no order (a prefetch). An order opening with the direct crawl then the Apify browser
 * (the default does) runs those two as research always has: the crawl, then the browser when the crawl answered a
 * thin page; the readers after them read a page they left thin. Any other order is read in turn
 * (`readWebsiteInOrder`). `fetchedAt` is the paid run's time when one answered, else null (the caller's clock).
 * @param {Parameters<typeof readWebsiteInOrder>[0] & {order: string[] | null}} input
 * @returns {Promise<{result: any, fetchedAt: any}>}
 */
export async function readWebsite(input) {
  const { domain, keys, order, cursor, runDirect, browser } = input
  const legacy = order?.[0] === 'direct' && order[1] === 'apify-browser'
  if (order !== null && !legacy) return readWebsiteInOrder({ ...input, order })
  let result = await runDirect()
  let fetchedAt = null
  if (browser && keys.apify && !cursor && domain.needsBrowser(result)) {
    const receipt = await browser()
    if (USABLE.has(receipt.result.status)) {
      result = { ...receipt.result, fallbackFrom: { status: result.status, reason: result.reason ?? null } }
      fetchedAt = receipt.fetchedAt
    } else
      result = {
        ...result,
        fallback: { provider: 'apify-browser', status: receipt.result.status, reason: receipt.result.reason }
      }
  }
  const rest = legacy ? order.slice(2) : []
  if (rest.length && !cursor && (!USABLE.has(result.status) || domain.needsBrowser(result))) {
    const r = await readWebsiteInOrder({ ...input, order: rest })
    if (USABLE.has(r.result.status) && !domain.needsBrowser(r.result)) {
      result = { ...r.result, fallbackFrom: { status: result.status, reason: result.reason ?? null } }
      if (r.fetchedAt) fetchedAt = r.fetchedAt
    }
  }
  return { result, fetchedAt }
}
