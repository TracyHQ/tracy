/**
 * Whether search engines may index the public Templates pages (issue #1762).
 *
 * The same app runs on production (`cowork.tracy.ai`), on dev (`cowork.tracy.site`) and on laptops.
 * Only production is indexable, or dev would duplicate production in search results.
 *
 * 🔒 THE RULE has two parts, both required:
 *   1. the DEPLOYMENT is production: its own origin (`config.origin`, from `TRACY_ORIGIN`, which every
 *      environment already sets) is exactly `https://cowork.tracy.ai`. Dev (`cowork.tracy.site`) and
 *      laptops are never indexable, whatever public origin they are given;
 *   2. the PUBLIC origin the pages state for themselves (`TEMPLATES_PUBLIC_ORIGIN`, default
 *      `https://tracy.ai` on production and `TRACY_ORIGIN` elsewhere, set in `config.js`) is `https://cowork.tracy.ai` or `https://tracy.ai` (the Cloudflare proxy that will
 *      serve the same pages). Any other public origin would put a non-canonical host in search results.
 * `config.indexTemplates === true` is a code-injected override for a local review
 * stand that must behave like production; `loadConfig` never sets it, so no deployment can.
 *
 * DOMAIN-PURE (`test/module-graph.test.mjs`): imports nothing.
 */
/** The production deployment's own origin (`TRACY_ORIGIN` there): the only deployment that may be indexed. */
const DEFAULT_PRODUCTION_ORIGIN = 'https://cowork.tracy.ai'
/** The landing site's origin, which will serve the same pages through its proxy. */
const DEFAULT_LANDING_ORIGIN = 'https://tracy.ai'
export const PRODUCTION_ORIGIN = DEFAULT_PRODUCTION_ORIGIN
/** The public origins whose pages may be indexed (only on the production deployment). */
export const INDEXABLE_PUBLIC_ORIGINS = [PRODUCTION_ORIGIN, DEFAULT_LANDING_ORIGIN]

const trimmed = (value) => String(value ?? '').replace(/\/+$/, '')

/** The origin the public Templates pages state for themselves; the app origin unless a proxy host is set. */
export const publicOriginOf = (config) => trimmed(config?.templatesPublicOrigin) || trimmed(config?.origin)

/** Whether the Templates pages live on another host than this app (a proxy serves them there). */
export const servedElsewhere = (config) => publicOriginOf(config) !== trimmed(config?.origin)

/**
 * Whether a request is the public origin's own Worker fetching the page: Cloudflare stamps every
 * Worker subrequest with `CF-Worker: <zone>`, and the zone is the public origin's host. Such a request
 * is served; any other request for a Templates address is sent to the public origin (301).
 */
export function fromPublicProxy(config, cfWorker) {
  if (!cfWorker) return false
  try {
    return cfWorker.trim().toLowerCase() === new URL(publicOriginOf(config)).hostname
  } catch {
    return false
  }
}

/** @param {{origin?: string, templatesPublicOrigin?: string, indexTemplates?: boolean}} config */
export function isIndexable(config) {
  if (config?.indexTemplates === true) return true
  return (
    trimmed(config?.origin) === PRODUCTION_ORIGIN && INDEXABLE_PUBLIC_ORIGINS.includes(publicOriginOf(config))
  )
}

/** The page's HTML with a robots noindex meta added when it does not carry one already. */
export function withNoindexMeta(html) {
  if (/<meta name="robots"/.test(html)) return html
  return html.replace('</head>', '<meta name="robots" content="noindex"></head>')
}
