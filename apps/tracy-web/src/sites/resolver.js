import { fleetLabel, webDnsName } from './label.js'
import { canonicalSiteKey } from './address.js'
import { importPending } from '../lib/import-pending.js'

/**
 * Where a site's dsh lives, and what to call its session cookie — the one seam the workspace
 * proxy (`workspace/route.js`, `server.js`'s `upgrade` handler) reads through.
 *
 * Plan 2 (this task): `hostOf` now reads `site.host` — the column `sites/store.js`'s
 * `createSite`/`setHost` write — instead of Plan 1's `hostsResolver`, which always answered
 * `config.defaultHost` because no `site` table existed yet. The other three functions keep the
 * exact same shape Plan 1 shipped, plus `siteOf` (new — the site row itself, for callers that
 * need more than host/label): nothing outside this file needed to change for the switch.
 *
 * @param {import('pg').Pool} pool
 * @param {object} config - the value `readConfig` returns.
 * @returns {{hostOf: Function, dshOf: Function, labelOf: Function, siteScope: Function, siteOf: Function, prefixAwareOf: Function}} the resolver.
 */
export function dbSitesResolver(pool, config) {
  return {
    canonicalKey: (name) => canonicalSiteKey(pool, name),
    /** The host recorded for this site, or null for a siteKey the book has never heard of — a
     * caller reads that as "no dsh configured" (`workspaceRoutes` answers 501), never as
     * `config.defaultHost` by default: guessing a host for an unknown site would proxy it into
     * somebody else's copy. */
    async hostOf(siteKey) {
      const { rows } = await pool.query('select host from site where site_key = $1', [siteKey])
      return rows[0]?.host ?? null
    },
    dshOf(hostName) {
      const h = config.hosts.get(hostName)
      // `dshOrigin` is the host's dsh (the seat door); `origin` is tracy-host — two different
      // doors on one machine.
      // A demo-only host runs no dsh (`config.js`, `readHosts`): no door is the same answer as no
      // host, never a door with an empty origin.
      return h?.dshOrigin && h.seatSecret ? { origin: h.dshOrigin, seatSecret: h.seatSecret } : null
    },
    /** The label this site's copy is filed under. Reads the stored column rather than
     * recomputing `fleetLabel`: `sites/store.js`'s `createSite` already ran that algorithm once,
     * at the moment the site was claimed, and the two must never drift — falling back to a fresh
     * computation only for a site this resolver has otherwise never heard of (a caller that
     * reaches here before a row exists, or a row from before this column existed). */
    async labelOf(siteKey) {
      const { rows } = await pool.query('select label from site where site_key = $1', [siteKey])
      return rows[0]?.label ?? (await fleetLabel(siteKey, config.siteDomain))
    },
    async siteScope(siteKey) {
      return (await this.labelOf(siteKey)).replace(/[^a-z0-9]/gi, '_').toLowerCase()
    },
    /** Whether this site is served under its own `/<siteKey>/` mount (`workspace/scope.js`,
     * `keepsMount`). The column came across from KV `prefix:<label>` on 09/09 and was read by
     * nothing until 20/09; it is now the per-site way OUT of the prefix, not the way in — a site
     * the book has never heard of keeps the default, `true`. */
    async prefixAwareOf(siteKey) {
      const { rows } = await pool.query('select prefix_aware from site where site_key = $1', [siteKey])
      return rows[0]?.prefix_aware ?? true
    },
    /** Whether this site is an import whose read never reached a build (`lib/import-pending.js`):
     * the workspace proxy never opens such a site, it sends the person to the import recovery page. */
    importPending: (siteKey) => importPending(pool, siteKey),
    /** The site's whole row, or null. For callers that need more than a host/label pair —
     * `sites/route.js`'s doors, which read `platform`/`attached`/`port`/`repo` directly. */
    async siteOf(siteKey) {
      const { rows } = await pool.query('select * from site where site_key = $1', [siteKey])
      return rows[0] ?? null
    }
  }
}

/**
 * Where to reach a site's own copy — not its dsh, its webroot container — for a command run on
 * its behalf. Defined here because it is one line of arithmetic on a site row, and Plan 4 (the
 * direct site-content proxy) reuses it verbatim rather than re-deriving the same rule.
 *
 * Two branches, one fact each side of ADR 0014 §2 already guarantees:
 *
 * - `site.host === config.hostName`: this process runs BESIDE that host's `tracy-host` — Plan 3's
 *   `render-compose.sh` puts every site's containers on that host's own external `tracy_tracy`
 *   Docker network, unconditionally, so the web container resolves over plain Docker DNS. The name
 *   to dial is `webDnsName(label)`, NOT the raw `<label>-web-1`: a label near the 63-char limit
 *   makes `<label>-web-1` exceed the DNS-label cap and fail ENOTFOUND (issue #165), so `webDnsName`
 *   falls back to a bounded `tracy-web-<hash>` alias that `render-compose.sh` puts on the same
 *   network. A site's own `publish` port (`127.0.0.1:<port>`) is not an alternative here: it is
 *   bound to the host's loopback, which a container on the same Docker network cannot reach through
 *   the host gateway (measured 09/09, `render-compose.sh:198`).
 * - Any other host: reached over its public address instead, since this process has no Docker
 *   network in common with a site that lives on a different machine.
 *
 * @param {{host: string, label: string, platform?: string}} site - a row from `sites/store.js`/`resolver.js`.
 * @param {object} config - `readConfig`'s value (`hostName`, `siteDomain`).
 * @returns {URL}
 */
export function siteTarget(site, config) {
  // EmDash's standalone Node server uses 4321; PHP platforms keep Apache's port 80.
  const port = site.platform === 'emdash' ? ':4321' : ''
  return site.host === config.hostName
    ? new URL(`http://${webDnsName(site.label)}${port}/`)
    : new URL(`https://${site.label}.${site.host}-sites.${config.siteDomain}/`)
}

/**
 * Where this process READS a site's pages (a design system preview): its web container when it lives on this host
 * ({@link siteTarget}), its own public `address` when it lives on another one. `siteTarget`'s remote name
 * (`<label>.<host>-sites.<domain>`) is two levels deep, which the edge certificate does not cover: measured
 * 14/10/2026, every demo on host `fleet01` failed its TLS handshake there while its public address answered 200.
 * Throws when a remote site has no address that parses; the callers already refuse such a site.
 * @param {{host: string, label: string, platform?: string, address?: string | null}} site
 * @param {object} config - `readConfig`'s value (`hostName`, `siteDomain`).
 * @param {string | null} [address] - the site's public address, when the row's own is not the one to use.
 * @returns {URL}
 */
export function siteReadOrigin(site, config, address = site.address) {
  if (site.host === config.hostName) return siteTarget(site, config)
  return new URL(`${new URL(String(address)).origin}/`)
}

/** Keep public asset paths while reading this host's sites through their container origin. */
export function siteReadUrl(site, config, input) {
  const publicOrigin = new URL(site.address)
  const url = new URL(input, publicOrigin)
  if (url.origin !== publicOrigin.origin) return url
  const target = siteReadOrigin(site, config)
  url.protocol = target.protocol
  url.host = target.host
  url.port = target.port
  return url
}
