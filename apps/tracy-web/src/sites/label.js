import { createHash } from 'node:crypto'

// The site-name rule lives in lib/ so other domains (opportunities/) can use it without importing sites/.
export { RESERVED_LABELS, SITE_LABEL_RE, siteLabelRefusal } from '../lib/site-label-rules.js'

/**
 * The label a site's copy is filed under on the fleet, ported verbatim from
 * `workers/seat-registry/src/fleet.js` with the zone as a parameter instead of a module
 * constant — `tracy-web` serves more than one zone (production plus local dev), and the
 * legacy Worker never had to.
 *
 * The lookup is a one-way table: `label -> siteKey` cannot be recovered from the label alone,
 * because it carries a hash suffix of the hostname. Both sides of a link (whoever writes it,
 * whoever resolves it) must compute the same string, or a mint points at an address nobody
 * serves.
 *
 * @param {string} siteKey - the site's hostname, or a full URL naming it.
 * @param {string} zone - the fleet's own domain, e.g. `tracy.ai`.
 * @returns {Promise<string>} the fleet label.
 */
export async function fleetLabel(siteKey, zone) {
  // Reduced to its hostname first, as the Worker's own copy does since `ee26710c`: a URL and the
  // bare host must not produce two labels for one site.
  const name = siteKey
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  // A site born on the fleet already carries its label as the first part of its own hostname —
  // same rule as `fleetLabelFor` in tracy-desk's index.js, and it must stay identical there.
  const own = name.match(new RegExp(`^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${zone.replace('.', '\\.')}$`))
  if (own) return own[1]
  const readable = name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name))
  const digest = [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8)
  // 63 is the DNS label cap; the part that must survive truncation is the hash suffix, not the
  // readable prefix.
  return `${readable.slice(0, 63 - digest.length - 1).replace(/-+$/, '')}-${digest}`
}

/** The DNS-label cap: Docker resolves a container by a name on a shared network, and that name is a
 * DNS label — 63 octets at most. */
const DNS_LABEL_MAX = 63

/**
 * The name to DIAL a site's web container by on the shared `tracy` docker network. NOT the
 * container's own name — that stays `<label>-web-1` for `docker exec`/`docker cp` however long the
 * label is (ADR 0014 §2), and this function never changes it.
 *
 * A fleet label runs up to 63 characters (`fleetLabel`), and the web container answers to
 * `<label>-web-1`, six longer — up to 69, past the cap. A dial at an over-long name fails
 * `ENOTFOUND` before a byte leaves the process: measured on Node 22.17 in an isolated docker
 * network, a 60-character label gives a 66-octet `<label>-web-1` name that does not resolve, while
 * the same container's short alias does (issue #165).
 *
 * So: for every label short enough that `<label>-web-1` fits a DNS label, that IS the name — a site
 * deployed today keeps the exact target it has and needs no re-provisioning. Only when
 * `<label>-web-1` would exceed 63 octets is a bounded alias used: `tracy-web-` and the first 32 hex
 * digits (128 bits) of SHA-256 over the WHOLE label. `render-compose.sh` adds this same alias to the
 * container's `tracy`-network attachment, so the two must derive it identically — the parity test in
 * `packages/fleet/tracy-fleet-operation/test/render-compose.test.mjs` holds them together, as does
 * the copy in `apps/tracy-host/src/capture.js` (a separate app image that cannot import this module).
 *
 * 32 hex is 128 bits: two distinct labels collide only on a full 128-bit SHA-256 prefix match — a
 * ~2^64 birthday bound, astronomically past any fleet's site count — and the whole label is hashed,
 * so no distinguishing character is dropped. It is a valid DNS label by construction:
 * `tracy-web-<hex>` is 42 octets, starts with a letter, ends in a hex digit, no other punctuation.
 *
 * @param {string} label - a fleet label (`fleetLabel`'s output shape).
 * @returns {string} the docker-network name to dial (never a URL, never a port).
 */
export function webDnsName(label) {
  const name = `${label}-web-1`
  if (name.length <= DNS_LABEL_MAX) return name
  return `tracy-web-${createHash('sha256').update(label).digest('hex').slice(0, 32)}`
}

/**
 * `https://joomlart.com` → `joomlart-com` — the readable half of a fleet label, with no hash
 * suffix. Ported verbatim from `labelPrefix` in `workers/seat-registry/src/artifacts.js`: it is
 * the namespace an artifact's object key is filed under (`sites/<labelPrefix>/...`) and the
 * prefix `sites/route.js`'s artifact door checks a caller-supplied key against
 * (`KEY_NOT_YOURS`) — a caller-chosen key is how a valid seat on one site would otherwise
 * overwrite another site's artifact.
 *
 * @param {string} siteKey - the site's hostname, or a full URL naming it.
 * @returns {string} the readable prefix.
 */
export function labelPrefix(siteKey) {
  return siteKey
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Whether a site's FULL label (`config.siteAddressPrefix` + what was typed) is one of the site zone's
 * own names for customers' own domains (`config.ownDomainLabels`: the CNAME target and the fallback
 * origin, `connect` and `origin` unless configured): `'reserved'`, or null. Not in `RESERVED_LABELS`
 * because the names come from configuration, and the client copies of that set cannot read it.
 * @param {string} label
 * @param {{ ownDomainLabels?: { connect: string, origin: string } }} config
 * @returns {'reserved' | null}
 */
export function zoneLabelRefusal(label, config) {
  const own = config?.ownDomainLabels ?? { connect: 'connect', origin: 'origin' }
  return label === own.connect || label === own.origin ? 'reserved' : null
}
