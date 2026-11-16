/**
 * THE DEMO'S OWN PAGESPEED (10Web sells a site on its PageSpeed 90+): research measures the business's current website
 * (`profile.pageSpeed`), and once a demo build completes the same code (`website-opportunities/src/pagespeed.js`,
 * mobile) measures the demo's address, so a pitch can say "Current site 34 → demo 92 on mobile".
 *
 * Kept on the build row as `wo_build.built.pagespeed`, next to what the build took (`demo-preview.js`): the facts
 * PageSpeed answered (`performance`, `seo`, `lcpMs`, `https`, `mobileFriendly`, `checkedAt`, `url`), or `{reason, url,
 * checkedAt}` when there is no score. A demo on a stand (`*.test`, `localhost`, a private address, a port of its own) is
 * never sent to Google: it reads `not_public`, never a made up number.
 *
 * 🔒 NEVER FAILS OR DELAYS A BUILD: it runs from the demo runner's `onBuilt`, after the action completed and outside its
 * lease, and the measurement is bounded (`measurePageSpeed`).
 */
import { measurePageSpeed } from 'website-opportunities/src/pagespeed.js'
import { bornSiteAddress } from '../lib/site-address.js'

/** The address a demo answers at, as the Details `demo.url` gives it, or null. */
export function demoAddressOf(site, config) {
  if (typeof site?.address === 'string' && site.address) return site.address
  return site?.label && config?.siteDomain && config?.origin ? bornSiteAddress(site.label, config) : null
}

/**
 * The measurer the build hook calls with the demo's `site` row. `runtime()` gives the deployment's Google key and the
 * operator's `pageSpeedCheckEnabled`; an unreadable runtime is a `failed` measurement. Never throws.
 * @param {{ config: any, runtime: () => Promise<{ keys?: { google?: string|null }, settings?: object }>,
 *   fetchImpl?: typeof fetch, resolve?: ((host: string) => Promise<Array<{address: string}>>) | null,
 *   now?: () => number, timeoutMs?: number }} deps
 */
export function createDemoPageSpeed({
  config,
  runtime,
  fetchImpl = fetch,
  resolve = null,
  now = Date.now,
  timeoutMs
}) {
  return async function measureDemo(site) {
    const url = demoAddressOf(site, config)
    let keys = {}
    let settings = {}
    try {
      ;({ keys = {}, settings = {} } = (await runtime()) ?? {})
    } catch {
      return { url, reason: 'failed', checkedAt: new Date(now()).toISOString() }
    }
    return measurePageSpeed(url, keys?.google ?? null, {
      fetch: fetchImpl,
      now,
      resolve,
      enabled: settings?.pageSpeedCheckEnabled !== false,
      ...(timeoutMs ? { timeoutMs } : {})
    })
  }
}

/** Keep a demo's measurement on its build row, beside what the build took (`built`), whatever else `built` holds. */
export async function saveDemoPageSpeed(pool, buildId, measured) {
  await pool.query(
    `update wo_build set built = coalesce(built, '{}'::jsonb) || jsonb_build_object('pagespeed', $2::jsonb)
      where id = $1`,
    [buildId, JSON.stringify(measured)]
  )
}
