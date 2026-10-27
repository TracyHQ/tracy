/** Mutable public names, with immutable site/seat/fleet identity. */
import { randomBytes, randomUUID } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import { domainToASCII } from 'node:url'
import { parse as parseDomain } from 'tldts'
import { probeAddressOnce } from '../lib/address-probe.js'
import { normalizeSiteKey } from '../lib/http.js'
import { uiSwitchOn } from '../lib/ui-setting.js'
import { siteLabelRefusal, zoneLabelRefusal } from './label.js'
import { probeDomain, readWhole, servedPage } from './domain-probe.js'
import { lifecycleHolds, withSiteNames } from './publish-store.js'
import { siteTarget } from './resolver.js'
import {
  gateOf,
  hostnameGate,
  hostnameOfReservation,
  reconcileHostnames,
  releasing
} from './site-domain-provider.js'
import { siteByKey } from './store.js'

/** Resolve only activated names; a pending domain never grants access to a site. */
export async function canonicalSiteKey(pool, name) {
  const { rows } = await pool.query("select site_key from site_name where name=$1 and state='active'", [name])
  return rows[0]?.site_key ?? name
}

export async function siteByPublicName(pool, name, token = null) {
  const { rows } = await pool.query(
    `select s.* from site_name n join site s on s.site_key=n.site_key
    where n.name=$1 and n.kind <> 'custom'
      and (n.state='active' or (n.state='applying' and n.token=$2))`,
    [name, token]
  )
  return rows[0] ?? null
}

/**
 * The row a customer's own domain resolves to, for the one router that serves such names
 * (`bar/route.js` `serveOwnDomain`), or null for a name this deployment has never held.
 *
 *   { name, state, routedAt, probeSecret, page, site }   a site holds the name; `state` is the row's own
 *       (`active` = connected). Only the router decides what each state may be served.
 *   { name, state: 'released', site: null }        a site let the name go (removed, or lapsed):
 *       still answered by the router — with its refusal page — for as long as the customer's DNS
 *       points here, rather than falling through to Tracy's own app on a stranger's hostname.
 *
 * 🔒 BY THE EXACT NAME AND KIND, NEVER BY LABEL OR BY A NEAR NAME. One name is one row
 * (`site_name.name` is the key), so one hostname can never open two sites, and a name that is not
 * a `custom` row of some site opens none.
 * @param {{ query: Function }} pool
 * @param {string} name - the request's host name, lower case, without a port
 */
export async function ownDomainByName(pool, name) {
  const { rows } = await pool.query(
    `select n.name as own_name, n.state as own_state, n.routed_at as own_routed_at,
            n.probe_secret as own_probe_secret, n.probe_page_nonce as own_page_nonce,
            n.probe_page_path as own_page_path,
            coalesce(n.probe_page_until > clock_timestamp(), false) as own_page_open, s.*
       from site_name n join site s on s.site_key = n.site_key
      where n.name = $1 and n.kind = 'custom'`,
    [name]
  )
  if (rows[0]) {
    const {
      own_name: ownName,
      own_state: state,
      own_routed_at: routedAt,
      own_probe_secret: probeSecret,
      own_page_nonce: nonce,
      own_page_path: path,
      own_page_open: open,
      ...site
    } = rows[0]
    // The page the probe is asking for right now (`domain-probe.js` `probePage`), while its window
    // is open on the database's clock.
    const page = open === true && nonce && path ? { nonce, path } : null
    return { name: ownName, state, routedAt, probeSecret, page, site }
  }
  const gone = await pool.query(
    `select 1 from site_name_released where name = $1
     union all select 1 from site_name_lapse where name = $1 limit 1`,
    [name]
  )
  return gone.rows.length > 0
    ? { name, state: 'released', routedAt: null, probeSecret: null, site: null }
    : null
}

export function publicSiteFields(site) {
  const displayName = site.primary_name || site.site_key
  return {
    siteKey: site.site_key,
    displayName,
    siteUrl: site.address,
    workspaceUrl: `/${encodeURIComponent(displayName)}/`
  }
}

/** One label of a host name as DNS registries take it: letters, digits, inner hyphens. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
/** Names nobody can own on the public internet: they must never reach an ingress rule. */
const PRIVATE_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'home', 'corp', 'intranet']
/** The most own domains a site holds at once, pending and connected together. */
export const OWN_DOMAIN_LIMIT = 1
/** How long one DNS question may take before it counts as "no answer". */
const DNS_ASK_MS = 5000
/**
 * How long an own domain still being connected holds its name before its ownership is proven: a
 * customer has three days to add one TXT record (DNS itself may take a day to show it), and a name
 * nobody proves is not kept from its real owner for longer than that.
 */
export const OWN_DOMAIN_HOLD_HOURS = 72
/**
 * A reservation that no longer holds its name (`077-site-own-domain-hold.sql`): an own domain still
 * being connected, never handed to the host, whose ownership was never read right, past its
 * deadline — on the database's clock. Every reader treats such a row as gone; `releaseLapsed` takes
 * it out and leaves its site the notice.
 *
 * 🔒 `clock_timestamp()`, NOT `now()`. `now()` is when the TRANSACTION began: a write that began
 * before the deadline and waited for the row's lock until after it would still see the row as held,
 * and prove a name that was already free. Every statement measures the deadline on the clock of the
 * moment it looks at the row.
 *
 * 🔒 AND A WRITE LOCKS THE ROW FIRST (`lockNames`), THEN READS THIS. A statement that both waits for
 * the lock and tests this condition tests it BEFORE it waits: PostgreSQL looks at the condition again
 * after the wait only when the holder CHANGED the row, so a holder that only locked it (`for update`)
 * and let go after the deadline would leave a proof written, or a name refused, on the clock of
 * before the wait.
 */
const LAPSED = `(kind = 'custom' and state = 'pending' and carried_at is null
  and ownership_proven_at is null and hold_until is not null and hold_until <= clock_timestamp())`
/** The UI switch that lets an Owner start an own domain (`@tracy/core/ui-switches/catalogue.json`). */
const CONNECT_DOMAIN_SWITCH = 'site-connect-domain'

/**
 * The name a person typed, as the one name it means — or why it is not one (`refusal`).
 *
 * 🔒 NOT `normalizeSiteKey`. That function is for an address somebody pasted to FIND a site: it
 * drops a scheme, a path and a leading `www.` without a word. Here the name becomes a DNS record
 * the customer adds and an ingress rule on the host, so nothing is dropped silently:
 *
 *   refused, named    a scheme, a path, a query, a port, userinfo, a space (`DOMAIN_NOT_BARE`);
 *                     a name or a label over DNS's own limits (`DOMAIN_TOO_LONG`)
 *   refused, generic  empty, one label, a wildcard, an underscore, an IP address, a name nobody
 *                     can own (`localhost`, `.local`, `.internal`…), Tracy's own host
 *   made canonical    upper case → lower; one trailing dot dropped; a Unicode name → its ASCII
 *                     (punycode) form, which is what DNS and the host see
 *   kept as typed     `www.` — `www.example.com` and `example.com` are two names, each proven
 *                     on its own
 *   refused, named    a registrable domain itself (`example.com`, `example.co.uk`:
 *                     `DOMAIN_APEX_UNSUPPORTED`, with `www.` of it to enter instead) — see `ownable`
 *
 * `want` says which of the two kinds the caller's form is for, and the other is refused by name:
 * `custom` (Connect domain) never renames the Tracy address (`DOMAIN_IS_TRACY`), `managed` (the
 * Tracy address) never reserves a domain (`ADDRESS_NOT_TRACY`). Left out, either kind is taken.
 * @param {unknown} raw
 * @param {{ origin: string, siteDomain: string, siteAddressPrefix?: string }} config
 * @param {unknown} [want]
 */
export function candidate(raw, config, want) {
  const any = anyCandidate(raw, config)
  const found = ownable(any)
  if (want === undefined || want === null) {
    // A caller that names no kind is an older one renaming the Tracy address: that form keeps the
    // leniency it always had (a pasted address, a leading `www.`). A domain of the customer's own
    // never does — see above.
    const pasted = any.kind === 'custom' || any.refusal ? managedFromPasted(raw, config) : null
    if (pasted) return pasted
    return found.refusal ? refusalOf(found) : found
  }
  if (want !== 'custom' && want !== 'managed') return { refusal: 'INVALID_SITE_KEY' }
  // A name under Tracy's own domain is said to be one even when it is no valid Tracy address:
  // "that is a Tracy address" is the thing to tell somebody connecting a domain of their own.
  if (want === 'custom' && any.kind === 'managed') return { refusal: 'DOMAIN_IS_TRACY' }
  if (found.refusal) return refusalOf(found)
  return want === found.kind ? found : { refusal: 'ADDRESS_NOT_TRACY' }
}

/**
 * An own domain the site already holds, as typed to REMOVE it: the same shape rules as `candidate`,
 * without `ownable`. A name reserved before a rule existed (a bare domain, say) is never one its
 * holder cannot let go of.
 */
function heldCandidate(raw, config) {
  const found = anyCandidate(raw, config)
  if (found.kind === 'managed') return { refusal: 'DOMAIN_IS_TRACY' }
  return found.refusal ? { refusal: found.refusal } : found
}

const refusalOf = (found) => ({ refusal: found.refusal, ...(found.detail ? { detail: found.detail } : {}) })

/**
 * Whether a domain of the customer's own is one a site can be connected on, by the public suffix
 * list (`tldts`, its ICANN part):
 *
 *   refused, named    the registrable domain itself (`example.com`, `example.co.uk`, `www.ck`):
 *                     `DOMAIN_APEX_UNSUPPORTED`. Its routing record is a CNAME, and a name at the
 *                     top of a zone cannot carry one (a provider's flattening or ALIAS reads as no
 *                     CNAME at all), so it would wait for ever. `detail` names `www.` of it instead
 *   refused, generic  a public suffix itself (`co.uk`, `foo.ck` under `*.ck`), and a name under a
 *                     suffix the list does not know (`.example`, `.test`, a TLD newer than the
 *                     list): nobody can register it, or this cannot tell which part is theirs
 *
 * 🔒 WHAT THE LIST GETS WRONG, BOTH WAYS. It knows where names are REGISTERED, not where zones are
 * cut: a subdomain delegated as a zone of its own (`shop.example.com` with its own NS records) is
 * taken here and has the same CNAME problem; and a name under a private suffix (`foo.github.io`)
 * is taken as a subdomain of `github.io`, whose provider decides what it can carry. A TLD added
 * after the pinned `tldts` is refused until the dependency is bumped.
 */
function ownable(found) {
  if (found.refusal || found.kind !== 'custom') return found
  const parsed = parseDomain(found.name, { allowPrivateDomains: false, extractHostname: false })
  if (parsed.isIcann !== true || !parsed.domain) return { refusal: 'INVALID_SITE_KEY' }
  if (parsed.domain === found.name)
    return {
      refusal: 'DOMAIN_APEX_UNSUPPORTED',
      detail: { name: found.name, suggestion: `www.${found.name}` }
    }
  return found
}

/**
 * Why a name a site holds could not be connected if it were reserved now, or null: EVERY refusal of
 * `ownable`, not only the bare domain — a name reserved before a rule existed (a bare domain, a name
 * under a suffix the pinned list does not know) is refused by Check DNS too, and would otherwise wait
 * for ever. `detail` (the name to use instead) only for a bare domain.
 */
function heldProblem(name) {
  const found = ownable({ name, kind: 'custom' })
  return found.refusal ? found : null
}

/** A pasted address that names a Tracy address of this deployment, as the rename form always took it. */
function managedFromPasted(raw, config) {
  let name
  try {
    name = normalizeSiteKey(typeof raw === 'string' ? raw : '')
  } catch {
    return null
  }
  if (!name || !name.endsWith(`.${config.siteDomain}`)) return null
  const strict = anyCandidate(name, config)
  return strict.kind === 'managed' && !strict.refusal ? strict : null
}

function anyCandidate(raw, config) {
  const refuse = (refusal) => ({ refusal })
  if (typeof raw !== 'string') return refuse('INVALID_SITE_KEY')
  let text = raw.trim()
  if (text === '') return refuse('INVALID_SITE_KEY')
  if (text.length > 1024) return refuse('DOMAIN_TOO_LONG')
  if (/[/\\?#@:\s]/.test(text)) return refuse('DOMAIN_NOT_BARE')
  if (text.endsWith('.')) text = text.slice(0, -1)
  const name = domainToASCII(text.toLowerCase())
  if (name === '') return refuse('INVALID_SITE_KEY')
  const labels = name.split('.')
  if (name.length > 253 || labels.some((label) => label.length > 63)) return refuse('DOMAIN_TOO_LONG')
  if (labels.length < 2 || !labels.every((label) => HOST_LABEL.test(label))) return refuse('INVALID_SITE_KEY')
  // A top-level label of digits only is an IP address or a typo, never a domain.
  if (/^\d+$/.test(labels.at(-1))) return refuse('INVALID_SITE_KEY')
  if (name === config.siteDomain) return { refusal: 'INVALID_SITE_KEY', kind: 'managed' }
  if (name === new URL(config.origin).hostname) return refuse('INVALID_SITE_KEY')
  const suffix = `.${config.siteDomain}`
  if (name.endsWith(suffix)) {
    const label = name.slice(0, -suffix.length)
    const typed =
      config.siteAddressPrefix && label.startsWith(config.siteAddressPrefix)
        ? label.slice(config.siteAddressPrefix.length)
        : label
    if (siteLabelRefusal(typed) !== null || zoneLabelRefusal(label, config) !== null)
      return { refusal: 'INVALID_SITE_KEY', kind: 'managed' }
    const { protocol, port } = new URL(config.origin)
    return { name, kind: 'managed', url: `${protocol}//${name}${port ? `:${port}` : ''}/` }
  }
  if (PRIVATE_SUFFIXES.includes(labels.at(-1))) return refuse('INVALID_SITE_KEY')
  // A custom domain is reserved and proven here; the host's ingress takes it when the site is published.
  return { name, kind: 'custom', url: `https://${name}/` }
}

/** How many names a CNAME chain may go through before it is given up as unmeasurable. */
const CNAME_HOPS = 5
/** The most values of a record kept from one answer, and the most of each value. */
const OBSERVED_MAX = 8
const OBSERVED_VALUE_MAX = 255
/** What a resolver may say instead of an answer, as it is kept and shown. Anything else: `LOOKUP_FAILED`. */
const DNS_ERRORS = new Set([
  'ESERVFAIL',
  'EREFUSED',
  'ECONNREFUSED',
  'ETIMEOUT',
  'EBADRESP',
  'EFORMERR',
  'ENOTIMP'
])

/**
 * The resolver DNS is read with: the machine's own, or the one a deployment names
 * (`TRACY_DNS_RESOLVER`, `ip[:port]`, several separated by commas) — how a local stand reads the
 * zone it owns instead of the internet's.
 *
 * Made at the first question, never while routes are mounted: `config.js` refuses a value that is
 * not a list of addresses when it reads the environment, and a value that reaches here another way
 * costs one lookup its answer (`LOOKUP_FAILED`, shown as unknown) instead of every door of the app.
 */
function resolverFor(config) {
  let made = null
  return () => {
    if (made) return made
    const resolver = new Resolver({ timeout: DNS_ASK_MS, tries: 1 })
    const named = typeof config.dnsResolver === 'string' ? config.dnsResolver.trim() : ''
    if (named !== '') resolver.setServers(named.split(',').map((server) => server.trim()))
    made = resolver
    return made
  }
}

/** How DNS of own domains is read outside the doors (`cron.js`): the deployment's resolver. */
export function ownDomainDns(config) {
  const resolver = resolverFor(config)
  return { dnsTxt: (name) => resolver().resolveTxt(name), dnsCname: (name) => resolver().resolveCname(name) }
}

const bounded = (value) => String(value).slice(0, OBSERVED_VALUE_MAX)
/** A host name as DNS answers one: labels of letters, digits, `-` and `_`, at least two of them. */
const DNS_NAME = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)+$/
const hostName = (value) => (typeof value === 'string' ? value.toLowerCase().replace(/\.$/, '') : null)

/**
 * One DNS question with a bound: `{ answer }`, or `{ error }` with why there is none —
 * `NXDOMAIN` (the name does not exist), `NODATA` (it exists, with no record of that type),
 * `TIMEOUT`, or what the resolver said (`ESERVFAIL`…). Never throws, never waits past the bound.
 */
async function ask(question, askMs) {
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ error: 'TIMEOUT' }), askMs)
    timer.unref?.()
  })
  const asked = Promise.resolve()
    // `then(question)`: a resolver that throws before it returns a promise is "no answer" too.
    .then(question)
    .then(
      (answer) => ({ answer }),
      (error) => {
        const code = typeof error?.code === 'string' ? error.code : ''
        if (code === 'ENOTFOUND') return { error: 'NXDOMAIN' }
        if (code === 'ENODATA') return { error: 'NODATA' }
        if (code === 'ETIMEOUT') return { error: 'TIMEOUT' }
        return { error: DNS_ERRORS.has(code) ? code : 'LOOKUP_FAILED' }
      }
    )
  try {
    return await Promise.race([asked, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The TXT record that proves a domain is the customer's, as measured now.
 *   ok       a value of `_tracy.<name>` is the site's token
 *   wrong    the record is there with other values (`observed`)
 *   missing  the name, or a TXT record at it, does not exist (`error`: NXDOMAIN · NODATA)
 *   unknown  the lookup gave no usable answer (`error`) — which proves nothing either way
 */
async function measureOwnership(name, token, dnsTxt, askMs) {
  const result = await ask(() => dnsTxt(`_tracy.${name}`), askMs)
  if (result.error === 'NXDOMAIN' || result.error === 'NODATA')
    return { status: 'missing', observed: [], error: result.error }
  if (result.error) return { status: 'unknown', observed: [], error: result.error }
  const records = result.answer
  // One TXT record arrives as its chunks; anything else is not an answer this can read.
  if (
    !Array.isArray(records) ||
    !records.every((parts) => Array.isArray(parts) && parts.every((p) => typeof p === 'string'))
  )
    return { status: 'unknown', observed: [], error: 'MALFORMED' }
  const values = records.map((parts) => parts.join(''))
  if (values.length === 0) return { status: 'missing', observed: [], error: 'NODATA' }
  const owned = typeof token === 'string' && token !== '' && values.includes(token)
  return { status: owned ? 'ok' : 'wrong', observed: values.slice(0, OBSERVED_MAX).map(bounded) }
}

/**
 * Whether `name` points at the host's `target`, by DNS alone: a CNAME chain that reaches the
 * target's own name. Nothing is fetched from the customer's host name.
 *
 * 🔒 ONLY THE NAME PROVES THE TUNNEL. Two names that resolve to the same addresses share an edge,
 * not a tunnel — every tunnel of the provider answers from the same addresses — so "the same A
 * records" would call a domain ready that points at somebody else's. A name whose provider hides
 * the CNAME (flattening at the apex, a proxy in front) has no CNAME to read: it is reported as
 * `missing` (`NODATA`), never guessed ready.
 *   ok       the chain reaches the target
 *   wrong    the chain ends somewhere else, or loops (`observed`: the names it went through)
 *   missing  there is no CNAME at the name (`error`: NXDOMAIN · NODATA)
 *   unknown  no target to measure against (`NO_TARGET`), a lookup that gave no usable answer, or a
 *            chain longer than this follows (`TOO_MANY_HOPS`)
 */
async function measureRouting(name, target, dnsCname, askMs) {
  const wanted = hostName(target)
  if (!wanted) return { status: 'unknown', observed: [], error: 'NO_TARGET' }
  const seen = []
  let at = name
  for (let hop = 0; hop < CNAME_HOPS; hop++) {
    const result = await ask(() => dnsCname(at), askMs)
    if (result.error === 'NXDOMAIN' || result.error === 'NODATA') {
      // Nothing at the customer's own name: the record is not there. Further down the chain it is
      // an alias that leads nowhere near the target.
      return seen.length === 0
        ? { status: 'missing', observed: [], error: result.error }
        : { status: 'wrong', observed: seen }
    }
    if (result.error) return { status: 'unknown', observed: seen, error: result.error }
    // 🔒 A NAME HAS ONE CNAME OR NONE, AND THE ANSWER IS READ WHOLE. Reading the first of several
    // called a domain ready on an answer no resolver may give for a working name — which of them the
    // world follows is not the first one listed. Anything but exactly one host name is an answer
    // this cannot read: `unknown`, never `ok`.
    const alias =
      Array.isArray(result.answer) && result.answer.length === 1 ? hostName(result.answer[0]) : null
    if (alias === null || alias.length > 253 || !DNS_NAME.test(alias))
      return { status: 'unknown', observed: seen, error: 'MALFORMED' }
    if (seen.includes(bounded(alias)) || alias === name) {
      return { status: 'wrong', observed: [...seen, bounded(alias)].slice(0, OBSERVED_MAX), error: 'LOOP' }
    }
    seen.push(bounded(alias))
    if (alias === wanted) return { status: 'ok', observed: seen }
    at = alias
  }
  return { status: 'unknown', observed: seen, error: 'TOO_MANY_HOPS' }
}

const STATUSES = new Set(['ok', 'wrong', 'missing', 'unknown'])

/** One half of a kept reading, as the screen may be told it — or "not checked" when it is not one. */
function keptCheck(half) {
  if (!half || typeof half !== 'object' || !STATUSES.has(half.status))
    return { status: 'unchecked', observed: [] }
  return {
    status: half.status,
    observed: Array.isArray(half.observed)
      ? half.observed.filter((v) => typeof v === 'string').slice(0, OBSERVED_MAX)
      : [],
    ...(typeof half.error === 'string' ? { error: half.error.slice(0, 40) } : {})
  }
}

/**
 * A domain of the customer's own, as the screen is told it: the records to add, and for each what
 * the LAST lookup returned and when (`checks`, `checkedAt`). Nothing here is worked out from
 * anything but that lookup: a domain never checked reads `unchecked`, a lookup that failed reads
 * `unknown` with why, and there is no HTTPS row because nothing here measures it.
 *
 * 🔒 A READING COUNTS ONLY FOR THE RESERVATION AND THE TARGET IT WAS TAKEN FOR. The row keeps the
 * token and the routing target each reading was measured against. A reading taken for an earlier
 * reservation of the name (removed and saved again since: a new token) is not this one's, and a
 * routing reading taken while the host was on another tunnel proved the domain points THERE: it
 * reads `unknown` (`TARGET_CHANGED`) beside the record the host names now, never "ready".
 *
 * A pending name that could not be reserved today (a bare domain, from before that was refused)
 * says why (`problem`, and the name to connect instead) and asks for no CNAME it cannot carry; one
 * whose ownership is not proven yet says until when it holds the name (`holdUntil`).
 * @param {Record<string, any>} row - a `site_name` row of kind `custom`
 * @param {string | null} target - the host's routing target now, or null when it has none to give
 */
/**
 * Whether an own-domain row is shown as CONNECTED. 🔒 NOT EVERY `active` ROW IS: one made active
 * before #1037 (`routed_at` null) was connected on the host's log line alone, by a rule that leads
 * straight to the site — nobody ever asked the domain, and its requests do not pass this app. It
 * goes on being served while its route is moved (`cron.js` `sweepLegacyOwnDomains`), but it reads
 * `pending` until an HTTPS probe of the real domain has been answered by this site through that
 * route (`connected_at`, written by `confirmOwnDomains` and by nothing else).
 *
 * 🔒 AND `connected_at` IS OF ONE CONNECTION ATTEMPT. Every hand-over to the host clears it with
 * the attempt's secret and the route mark (`publish-store.js` `reserveIn`), so a name published
 * again reads `pending` — while it goes on being served — until THIS attempt's route is installed
 * and THIS attempt's probe was answered. A publish that fails, or whose probe fails, never shows
 * the connection an earlier attempt proved.
 *
 * 🔒 AND WITH CLOUDFLARE FOR SAAS, ONLY WHILE ITS HOSTNAME IS READY AS LAST READ. The rule the probe
 * is gated on (`site-domain-provider.js` `gateOf`): the hostname made for THIS reservation, its last
 * read successful, it and its certificate active. A hostname Cloudflare later reports not active, or
 * that cannot be read, takes the domain back to `pending` with the reason on its card. A name with
 * no hostname row at all is the one legacy path: connected before Cloudflare for SaaS, or on a server
 * without it — judged as above. Serving does not read this: a request for the name reaches tracy-web
 * only through Cloudflare, which answers the name only while its hostname is active
 * (`bar/route.js` `serveOwnDomain`).
 */
const shownConnected = (row) =>
  row.state === 'active' && Boolean(row.connected_at) && (!row.hostname_state || hostnameOf(row).ready)

function ownDomainOf(row, target) {
  const reading = row.dns_reading && typeof row.dns_reading === 'object' ? row.dns_reading : null
  const mine = reading !== null && reading.token === row.token && row.checked_at !== null
  const ownership = mine ? keptCheck(reading.ownership) : { status: 'unchecked', observed: [] }
  let routing = mine ? keptCheck(reading.routing) : { status: 'unchecked', observed: [] }
  if (!target && routing.status !== 'unchecked')
    routing = { status: 'unknown', observed: [], error: 'NO_TARGET' }
  else if (target && routing.status === 'ok' && reading.target !== target)
    routing = { status: 'unknown', observed: routing.observed, error: 'TARGET_CHANGED' }
  const checkedAt = mine ? new Date(row.checked_at).toISOString() : null
  const stamped = (check) => (check.status === 'unchecked' ? check : { ...check, checkedAt })
  const problem = row.state === 'active' ? null : heldProblem(row.name)
  const hostname = hostnameOf(row)
  // 🔒 ONE RULE FOR THE CARD AND THE PROBE: a proof that the domain opened this site does not stand
  // for a hostname that is not ready as last read — the card says why it is not (the gate's reason,
  // translated), never "verified" on a proof the hostname has since gone back on.
  const proved = connectionOf(row)
  const connection =
    hostname && !hostname.ready && proved.status === 'ok'
      ? { status: 'failed', error: hostname.reason, checkedAt: proved.checkedAt }
      : proved
  const validation = Array.isArray(row.hostname_records)
    ? row.hostname_records.filter(
        (r) =>
          r && ['TXT', 'CNAME'].includes(r.type) && typeof r.name === 'string' && typeof r.value === 'string'
      )
    : []
  const holds =
    row.state !== 'active' && row.hold_until && !row.ownership_proven_at && row.carried_at === null
      ? new Date(row.hold_until).toISOString()
      : null
  return {
    name: row.name,
    kind: 'custom',
    state: shownConnected(row) ? 'connected' : 'pending',
    ...(problem ? { problem: problem.refusal } : {}),
    ...(problem?.detail ? { suggestion: problem.detail.suggestion } : {}),
    ...(holds ? { holdUntil: holds } : {}),
    verification: { type: 'TXT', name: `_tracy.${row.name}`, value: row.token },
    ...(target && !problem ? { routing: { type: 'CNAME', name: row.name, value: target } } : {}),
    // `tls`: the real domain was asked over HTTPS and this site answered (`connection`).
    readiness: {
      ownership: ownership.status === 'ok',
      routing: routing.status === 'ok',
      tls: connection.status === 'ok'
    },
    connection,
    // The custom hostname at Cloudflare for SaaS that serves the name, when one was made for this
    // reservation: whether it and its certificate are active, and why not (`HOSTNAME_REASONS`).
    ...(hostname ? { hostname } : {}),
    checks: [
      {
        record: 'ownership',
        type: 'TXT',
        name: `_tracy.${row.name}`,
        expected: row.token,
        ...stamped(ownership)
      },
      { record: 'routing', type: 'CNAME', name: row.name, expected: target ?? null, ...stamped(routing) },
      // The records the certificate's validation asked for, exactly as Cloudflare returned them —
      // none with HTTP validation, which Cloudflare serves itself once the CNAME is there. Tracy
      // does not read them: the certificate's own status says whether they were found.
      ...validation.map((record) => ({
        record: 'validation',
        type: record.type,
        name: record.name,
        expected: record.value,
        status: 'unchecked',
        observed: []
      }))
    ],
    // How old the reading is. DNS is not watched: a reading is from the last time somebody asked
    // (Check DNS, a publish), and the screen says when that was.
    ...(checkedAt ? { checkedAt } : {})
  }
}

/**
 * The custom hostname of a row read by `ownDomainRows`, as the card is told it, or null when none was
 * made for this reservation: `{ ready, reason? }` (`site-domain-provider.js` `gateOf`).
 */
function hostnameOf(row) {
  if (!row.hostname_state) return null
  const gate = gateOf({
    state: row.hostname_state,
    hostname_status: row.hostname_status,
    ssl_status: row.hostname_ssl,
    reason: row.hostname_reason
  })
  return gate.ready ? { ready: true } : { ready: false, reason: gate.reason }
}

/**
 * Whether the real domain opens the site, as the last HTTPS probe of this connection attempt found
 * it (`domain-probe.js`) — the reason a domain whose records are right is still `pending`.
 *   unchecked  the host has not installed the name's route (nothing to ask yet)
 *   waiting    the route is installed and no probe of this attempt has ended yet — or the name is
 *              being served (`active`) while the route of its current attempt is not installed
 *              yet: published again, or, with `route: 'direct'`, connected before routes went
 *              through tracy-web and never handed over since (its old rule is being replaced by
 *              the sweep). It reads `pending` and is asked as soon as the route is in
 *   ok         the domain answered as this site (`checkedAt`)
 *   failed     it did not, and why (`error`, `domain-probe.js` `probeDomain`)
 */
function connectionOf(row) {
  if (!row.routed_at) {
    if (row.state !== 'active') return { status: 'unchecked' }
    return row.probe_secret ? { status: 'waiting' } : { status: 'waiting', route: 'direct' }
  }
  const reading = row.probe_reading && typeof row.probe_reading === 'object' ? row.probe_reading : null
  if (!reading || !row.probed_at) return { status: 'waiting' }
  const checkedAt = new Date(row.probed_at).toISOString()
  if (reading.status === 'ok') return { status: 'ok', checkedAt }
  return {
    status: 'failed',
    error: typeof reading.error === 'string' ? reading.error.slice(0, 40) : 'UNKNOWN',
    checkedAt
  }
}

/** One `site_name` row with its reservation's custom hostname, as `ownDomainRows` reads them. */
async function withHostname(db, row) {
  const found = await hostnameOfReservation(db, { name: row.name, siteKey: row.site_key, token: row.token })
  if (!found) return row
  return {
    ...row,
    hostname_state: found.state,
    hostname_status: found.hostname_status,
    hostname_ssl: found.ssl_status,
    hostname_records: found.records,
    hostname_reason: found.reason
  }
}

/** The site's own domains — being connected, or connected — oldest first. A lapsed one is not. */
async function ownDomainRows(db, siteKey) {
  // With the custom hostname made for exactly this reservation, when there is one (`hostname_*`).
  const { rows } = await db.query(
    `select n.*, h.state as hostname_state, h.hostname_status, h.ssl_status as hostname_ssl,
            h.records as hostname_records, h.reason as hostname_reason
       from (select * from site_name
              where site_key = $1 and kind = 'custom' and state in ('pending', 'active') and not ${LAPSED}) n
       left join site_custom_hostname h on h.name = n.name and h.site_key = n.site_key and h.token = n.token
      order by n.created_at, n.name`,
    [siteKey]
  )
  return rows
}

/**
 * The reservations of a site that lapsed: the notices kept for it, and its rows past their deadline
 * that nothing has let go yet. Oldest first; nothing in them is the name's holder now.
 */
async function lapsedRows(db, siteKey) {
  const { rows } = await db.query(
    `select name, min(lapsed_at) as lapsed_at from (
       select name, lapsed_at from site_name_lapse where site_key = $1
       union all
       select name, hold_until as lapsed_at from site_name where site_key = $1 and ${LAPSED}
     ) lapsed group by name order by min(lapsed_at), name`,
    [siteKey]
  )
  return rows.map((row) => ({
    name: row.name,
    kind: 'custom',
    state: 'lapsed',
    lapsedAt: new Date(row.lapsed_at).toISOString()
  }))
}

/** Whether `name` is a reservation of this site that lapsed (a notice, or a row past its deadline). */
async function lapsedHere(db, siteKey, name) {
  const { rows } = await db.query(
    `select 1 from site_name_lapse where site_key = $1 and name = $2
     union all
     select 1 from site_name where site_key = $1 and name = $2 and ${LAPSED}
     limit 1`,
    [siteKey, name]
  )
  return rows.length > 0
}

/**
 * Let lapsed reservations go: each row out of `site_name` and a notice in for its site, in ONE
 * statement, so the name is never free without its holder being told, nor told while still held.
 * `name` / `siteKey` narrow it to one name and one site's own (the reserve door); neither = every
 * one (the hourly sweep, `cron.js`). Two of these at once on one row: the row lock lets the first
 * delete it, and the second finds it gone. Answers what it let go.
 * @param {{ query: Function }} db
 * @param {{ name?: string | null, siteKey?: string | null }} [which]
 */
export async function releaseLapsed(db, { name = null, siteKey = null } = {}) {
  // Narrowed to one name or one site: its rows locked first, so the deadline below is read after any
  // wait for them (`LAPSED`). The hourly sweep locks nothing first: a row it finds still held is
  // simply left for the next hour.
  if (name !== null || siteKey !== null)
    await lockNames(db, `name = $1 or (site_key = $2 and kind = 'custom')`, [name, siteKey])
  const { rows } = await db.query(
    `with gone as (
       delete from site_name
        where ${LAPSED}
          and (($1::text is null and $2::text is null) or name = $1 or site_key = $2)
        returning name, site_key
     )
     insert into site_name_lapse (site_key, name)
     select site_key, name from gone
     on conflict (site_key, name) do update set lapsed_at = excluded.lapsed_at
     returning site_key, name`,
    [name, siteKey]
  )
  return rows
}

/**
 * Lock the `site_name` rows `where` names, in one order (by name, so two writers never wait on each
 * other in a circle), waiting for whoever holds them. What the caller reads next — the deadline above
 * all (`LAPSED`) — is then read on the clock of after that wait: in a transaction (Check DNS, a
 * publish) with the rows still locked; outside one (the reserve door) once their holder let go.
 */
async function lockNames(db, where, params) {
  await db.query(`select 1 from site_name where ${where} order by name for update`, params)
}

/**
 * The own domain a visitor of the site's Tracy address is sent to (`bar/route.js`), or null when the
 * site has none connected: a name the Settings tab shows `connected` (`shownConnected`), which
 * `serveOwnDomain` serves on a published site.
 *
 * With several connected names, the one connected first (then by name): the redirect must name the
 * same domain on every request, or a search engine is told the page moved to two places at once — and
 * the first one connected is the one the customer has been sending people to longest.
 * @param {{ query: Function }} db
 * @param {string} siteKey
 * @returns {Promise<string | null>}
 */
export async function connectedOwnDomain(db, siteKey) {
  const connected = (await ownDomainRows(db, siteKey)).filter(shownConnected)
  if (connected.length === 0) return null
  const at = (row) => new Date(row.connected_at).getTime()
  connected.sort((a, b) => at(a) - at(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return connected[0].name
}

/** Whether the site has a domain of its own at all — asked before the host is, so a site without one costs no call. */
export async function hasOwnDomain(db, siteKey) {
  return (await ownDomainRows(db, siteKey)).length > 0
}

/**
 * What the Settings tab is told about a site's addresses: who may change them, the own domain being
 * connected (`pending`) and the ones the host's ingress carries (`connected`).
 * @param {{ query: Function }} db - the pool, or the one transaction the caller reads a snapshot on
 * @param {string | null} [target] - the host's routing target as the host said it for THIS read
 *   (asked by the caller before it opens its snapshot, and only for a site with an own domain);
 *   null when the host has none to give or did not answer
 */
export async function addressChangeState(db, site, role, config, target = null) {
  const rows = await ownDomainRows(db, site.site_key)
  const connected = rows.filter(shownConnected)
  const pending = rows.find((row) => !shownConnected(row))
  return {
    allowed: role === 'owner',
    managedDomain: config.siteDomain,
    status: pending ? 'pending' : 'ready',
    // An own domain's proof of ownership is the Owner's to read; everyone else sees its name and state.
    ...(pending ? { pending: forRole(ownDomainOf(pending, target), role) } : {}),
    connected: connected.map((row) => forRole(ownDomainOf(row, target), role)),
    // Reservations that lapsed before their ownership was proven: the name only, never who holds it now.
    lapsed: await lapsedRows(db, site.site_key)
  }
}

/**
 * The TXT token is shown to the Owner alone: whoever holds it can prove the domain to this site.
 * It is in `verification`, and again as what the ownership check expected and — once the record is
 * right — observed, so all three are kept from every other role.
 */
function forRole(domain, role) {
  if (role === 'owner') return domain
  const { verification: _verification, checks, ...rest } = domain
  return {
    ...rest,
    checks: checks.map((check) => {
      if (check.record !== 'ownership') return check
      const { expected: _expected, observed: _observed, ...kept } = check
      return kept
    })
  }
}

/**
 * The code a host put on a site-address job it refused (`{ok:false, code}`, the job's output, which
 * `runSiteJob` hands back as `reason`), or null when the job has no such answer — a timeout, a lost
 * call, a host that never ran it.
 */
export function hostRefusal(result) {
  if (!result || result.ok === true || typeof result.reason !== 'string') return null
  try {
    const answer = JSON.parse(result.reason.trim().split('\n').pop())
    return answer && answer.ok === false && typeof answer.code === 'string' ? answer.code : null
  } catch {
    return null
  }
}

/**
 * Whether a rollback left the site as it was. `CHANGE_UNKNOWN` (a host older than the rollback
 * tombstone in site-address.py) means the host holds no journal for the change, i.e. it wrote
 * nothing — but only when the apply itself ANSWERED a refusal: an apply that timed out may still be
 * queued on the host behind this rollback, so its `CHANGE_UNKNOWN` proves nothing.
 */
function rolledBack(result, applyRefused) {
  return result?.ok === true || (applyRefused && hostRefusal(result) === 'CHANGE_UNKNOWN')
}

/** How many redirects that stay on the Tracy address are followed to reach the site's page. */
const STANDING_HOPS = 5
/** How long one hop of that check may take, from asking to the last byte of the answer read. */
const STANDING_MS = 20000

/**
 * Whether the site serves its page at its Tracy address — asked THROUGH TRACY'S OWN PROXY, as the
 * Tracy address: the request is the one `bar/site-proxy.js` makes for a visitor of
 * `https://<label>.<zone>/` (`proxySite`, the canonical authority as the viewer's, nobody signed
 * in), so what is judged is what that visitor is sent — headers reframed, the site's copy told its
 * own address — and not merely that a container answers something.
 *   'ok'           the site's own page WAS SERVED: status 200 with an HTML document, the whole body
 *                  read to its end without an error (`domain-probe.js` `readWhole`, `servedPage` —
 *                  the same rules an own domain is connected on), reached directly or by redirects
 *                  that stay on the Tracy address's ORIGIN (`/` → `/en/`), each followed as a
 *                  browser there would
 *   'moved'        the CMS redirects its Tracy address to `name`: its canonical address was changed
 *   'elsewhere'    it redirects off the Tracy address's origin — another host, another port, plain
 *                  `http` where the address is `https`, a URL with credentials — or nowhere a
 *                  browser could go: with the domain gone, a visitor of the Tracy address would not
 *                  be shown this site there
 *   'unreachable'  no page: an error status (404 and 503 alike), an answer with no page in it (a
 *                  204, a 206, an empty body, something that is not HTML), a body that broke off,
 *                  stalled or ran past the ceiling, redirects that go round without arriving
 *                  (`/` → `/`, or more hops than `STANDING_HOPS`), or no answer
 * 🔒 ONLY A WHOLE PAGE THE SITE SERVES AT THE TRACY ADDRESS IS 'ok'. A 404, an empty 204, a page
 * that begins and breaks off, a redirect to a third host, to plain `http` or back to where it
 * started are answers too, but none of them is the site being reachable there — and this reading is
 * what a removal takes the customer's domain away on.
 * @param {object} deps
 * @param {typeof import('../bar/site-proxy.js').proxySite} deps.proxy - handed in, not imported:
 *   `bar/` is another domain of the module graph
 * @returns {Promise<'ok' | 'moved' | 'elsewhere' | 'unreachable'>}
 */
export async function addressStanding(site, name, { config, fetchImpl = fetch, proxy, ms = STANDING_MS }) {
  // No proxy to ask through is no answer, and no answer is never 'ok'.
  if (typeof proxy !== 'function') return 'unreachable'
  const canonical = new URL(new URL(site.address).origin)
  const seen = new Set()
  let path = '/'
  for (let hop = 0; hop <= STANDING_HOPS; hop++) {
    // The same place twice is a circle, however long.
    if (seen.has(path)) return 'unreachable'
    seen.add(path)
    const target = new URL(path, siteTarget(site, config))
    // One deadline for the hop, the site's answer and the reading of it: the request is aborted
    // with it, and an answer that has not wholly arrived by then is no answer.
    const deadline = AbortSignal.timeout(ms)
    const asked = new Request(new URL(path, canonical), {
      headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
      signal: deadline
    })
    const late = new Promise((resolve) =>
      deadline.addEventListener('abort', () => resolve(null), { once: true })
    )
    const response = await Promise.race([
      Promise.resolve()
        .then(() =>
          proxy(asked, target, {
            email: null,
            role: null,
            sameHost: site.host === config.hostName,
            viewerHost: canonical.host,
            viewerProto: canonical.protocol.replace(':', ''),
            publish: 'published',
            variant: 'none',
            badgeUrl: config.badgeUrl,
            fetchImpl
          })
        )
        // A body that broke off while the proxy read it, a dial that failed: no page.
        .catch(() => null),
      late
    ])
    if (response === null) return 'unreachable'
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {})
      const location = response.headers.get('location')
      let to = null
      try {
        if (location) to = new URL(location, new URL(path, canonical))
      } catch {
        /* A Location that is no URL sends a browser nowhere. */
      }
      if (to === null || !['http:', 'https:'].includes(to.protocol)) return 'elsewhere'
      if (to.hostname.toLowerCase() === name) return 'moved'
      // 🔒 THE ORIGIN — scheme, host and port — NOT THE HOST NAME: `http://<the same host>/` is not
      // the `https` Tracy address, and a URL carrying credentials is not an address of the site.
      if (to.origin !== canonical.origin || to.username !== '' || to.password !== '') return 'elsewhere'
      path = `${to.pathname}${to.search}`
      continue
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {})
      return 'unreachable'
    }
    const read = await readWhole(response.body, { ms })
    if (read.error) return 'unreachable'
    return servedPage({
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: read.bytes.toString('latin1')
    })
      ? 'ok'
      : 'unreachable'
  }
  return 'unreachable'
}

/**
 * Whether taking `name` as an own domain would put the site over its limit: it already has
 * `OWN_DOMAIN_LIMIT` domains — being connected or connected — and `name` is not one of them.
 */
async function limitRefusal(db, siteKey, name) {
  const rows = await ownDomainRows(db, siteKey)
  if (rows.some((row) => row.name === name)) return false
  return rows.length >= OWN_DOMAIN_LIMIT
}

/** How long a claimed probe keeps other askers off its row: longer than one probe can take. */
const PROBE_CLAIM = "interval '90 seconds'"
/** How long the page a probe is about to ask for stays open on the row: longer than one request. */
const PAGE_WINDOW = "interval '15 seconds'"
/** A probe that failed is asked again after 15 s, doubling to 30 min. Never given up: DNS is slow. */
const PROBE_BACKOFF = "least(interval '30 minutes', interval '15 seconds' * power(2, least(probe_tries, 7)))"

/**
 * The probe of one row as a deployment runs it: the real domain, over HTTPS, by the resolver own
 * domains are read with (`domain-probe.js`). `config.ownDomainProbe` is a local stand's own.
 */
export function ownDomainProber(config, resolver = resolverFor(config)) {
  return (row, page) => probeDomain(row, { resolver: resolver(), options: config.ownDomainProbe ?? {}, page })
}

/**
 * The page window of one row, for the probe of this attempt (`domain-probe.js`): `open` writes the
 * nonce and the path the prober is about to ask — on this attempt's row only (same name, site and
 * secret, route installed) — and answers whether it did; `close` shuts it. While it is open the
 * proxy signs that one page's status, and a name still being connected is shown that one page.
 */
function pageWindow(pool, row) {
  const mine = [row.name, row.site_key, row.probe_secret]
  return {
    open: async ({ path, nonce }) => {
      const { rowCount } = await pool.query(
        `update site_name
            set probe_page_nonce = $4, probe_page_path = $5,
                probe_page_until = clock_timestamp() + ${PAGE_WINDOW}
          where name = $1 and site_key = $2 and kind = 'custom' and probe_secret = $3
            and routed_at is not null and state in ('pending', 'active')`,
        [...mine, nonce, path]
      )
      return rowCount === 1
    },
    close: () =>
      pool.query(
        `update site_name set probe_page_nonce = null, probe_page_path = null, probe_page_until = null
          where name = $1 and site_key = $2 and kind = 'custom' and probe_secret = $3`,
        mine
      )
  }
}

/**
 * Ask every own domain that is due whether it opens its site, and write what was found: a domain
 * still being connected becomes CONNECTED on its own proof, and on nothing else (#1037).
 *
 *   due      the host said the name's route is installed (`routed_at`), this attempt has its secret,
 *            and its next look has come (`probe_next_at`) — or `force`, for the Owner's Check DNS
 *   claimed  in one statement that pushes the next look out, so two replicas, a sweep and a screen
 *            never ask one row at once
 *   asked    outside every transaction and lock: a probe takes seconds
 *   written  under the site's names lock, on the row that was asked — same name, site AND secret —
 *            and only while no operation holds the site (one may be taking this very name out) and
 *            the site is still published. A probe that ends after the name was removed, saved again
 *            or handed to a newer attempt matches no row and writes nothing
 *
 * A domain this attempt already proved stays connected when a later look of the SAME attempt fails
 * (Check DNS pressed again) — its visitors are being served; the reading says what was found. A new
 * attempt starts with no proof at all (`publish-store.js` `reserveIn`).
 * @param {import('pg').Pool} pool
 * @param {{ probe: (row: { name: string, siteKey: string, secret: string },
 *   page: ReturnType<typeof pageWindow>) =>
 *   Promise<{ status: string, error?: string }>, siteKey?: string | null, force?: boolean,
 *   limit?: number }} input
 * @returns {Promise<{ asked: number, connected: string[] }>}
 */
export async function confirmOwnDomains(
  pool,
  { probe, siteKey = null, force = false, limit = 20, hostname = null }
) {
  const { rows } = await pool.query(
    `with due as (
       select name from site_name
        where kind = 'custom' and state in ('pending', 'active')
          and routed_at is not null and probe_secret is not null
          and ($1::text is null or site_key = $1)
          and ($2 or (probe_next_at is not null and probe_next_at <= clock_timestamp()))
        order by probe_next_at nulls last, name
        limit $3
        for update skip locked)
     update site_name n set probe_next_at = clock_timestamp() + ${PROBE_CLAIM}
       from due where n.name = due.name
     returning n.name, n.site_key, n.probe_secret`,
    [siteKey, force, limit]
  )
  const connected = []
  for (const row of rows) {
    let reading
    // 🔒 WITH CLOUDFLARE FOR SAAS, THE NAME'S HOSTNAME AND ITS CERTIFICATE COME FIRST: until both are
    // active nothing serves the name, and the domain is not asked — the reading says which is missing.
    // And they are read FRESH: a refresh that did not read this name's hostname itself (another pass
    // holds it, or the refresh failed) asks nothing and writes nothing; the name stays due, and is
    // asked again once its claim (`PROBE_CLAIM`) runs out.
    let gated = { ready: true }
    if (hostname) {
      const fresh = await Promise.resolve()
        .then(() => hostname.refresh(row.name))
        .catch(() => null)
      if (fresh?.taken !== 1) continue
      gated = await hostnameGate(pool, { name: row.name, siteKey: row.site_key }).catch(() => null)
      if (gated === null) continue
    }
    if (!gated.ready) reading = { status: 'failed', error: gated.reason }
    else
      try {
        reading = await probe(
          { name: row.name, siteKey: row.site_key, secret: row.probe_secret },
          pageWindow(pool, row)
        )
      } catch {
        reading = { status: 'failed', error: 'PROBE_FAILED' }
      }
    let ok = reading?.status === 'ok'
    let kept = ok ? { status: 'ok' } : { status: 'failed', error: String(reading?.error ?? 'UNKNOWN') }
    const written = await withSiteNames(pool, row.site_key, async (db) => {
      if (await lifecycleHolds(db, row.site_key)) return null
      // Read again on the transaction that writes: a hostname taken away while the domain was being
      // asked does not connect it.
      if (ok && hostname) {
        const again = await hostnameGate(db, { name: row.name, siteKey: row.site_key })
        if (!again.ready) {
          ok = false
          kept = { status: 'failed', error: again.reason }
        }
      }
      const before = (
        await db.query(
          `select n.state, s.publish from site_name n join site s on s.site_key = n.site_key
            where n.name = $1 and n.site_key = $2 and n.kind = 'custom' and n.probe_secret = $3
              and n.routed_at is not null and n.state in ('pending', 'active')
            for update of n`,
          [row.name, row.site_key, row.probe_secret]
        )
      ).rows[0]
      if (!before) return null
      // Connected only as a published site's name: a draft's domain serves nothing (`bar/route.js`).
      const connects = ok && before.state === 'pending' && before.publish === 'published'
      await db.query(
        `update site_name
            set state = case when $2 then 'active' else state end,
                hold_until = case when $2 then null else hold_until end,
                connected_at = case when $4 then coalesce(connected_at, clock_timestamp()) else connected_at end,
                probe_reading = $3::jsonb, probed_at = clock_timestamp(),
                probe_tries = case when $4 then 0 else probe_tries + 1 end,
                probe_next_at = case when $4 then null else clock_timestamp() + ${PROBE_BACKOFF} end,
                updated_at = now()
          where name = $1`,
        [row.name, connects, JSON.stringify(kept), ok]
      )
      if (connects)
        await db.query(
          "insert into audit(actor,action,site_key,detail) values(null,'site.domain.connect',$1,$2::jsonb)",
          [row.site_key, JSON.stringify({ name: row.name })]
        )
      return connects
    }).catch((error) => {
      console.warn(`[own-domain] ${row.name}: probe reading not written`, error?.message ?? error)
      return { busy: true }
    })
    if (!written.busy && written.value === true) connected.push(row.name)
  }
  return { asked: rows.length, connected }
}

/**
 * DNS of a site's own domains, read and written as every caller does — the address doors, a
 * publish, and the background sweep that connects a published site's proven domain by itself
 * (`cron.js` `sweepOwnDomainStarts`).
 * @param {object} deps
 * @param {{ query: Function }} deps.pool
 * @param {(name: string) => Promise<string[][]>} deps.dnsTxt
 * @param {(name: string) => Promise<string[]>} deps.dnsCname
 * @param {number} [deps.dnsAskMs]
 * @param {(site: Record<string, any>) => Promise<string | null>} deps.routingTarget - the name a
 *   customer's domain must point at for this site, or null when there is none to give
 * @param {boolean} [deps.saas] - that name is Cloudflare for SaaS's (`connect.<zone>`), not the
 *   host's tunnel: a `live` then names no target to the host
 */
export function ownDomainReader({
  pool,
  dnsTxt,
  dnsCname,
  dnsAskMs = DNS_ASK_MS,
  routingTarget,
  saas = false
}) {
  /** The routing target for this read, or null: no answer and a refusal are both "none". */
  const targetOf = async (site) => {
    try {
      return hostName(await routingTarget(site)) || null
    } catch {
      return null
    }
  }

  /**
   * What DNS says about one own domain NOW, against `target`: the reading, bound to the row's token
   * and to its place among the lookups (`turn`, `askedAt`).
   *
   * 🔒 EVERY LOOKUP TAKES ITS NUMBER BEFORE IT ASKS. Two lookups of one domain can end in the other
   * order than they began (one resolver slow, one quick); the number — the database's own sequence,
   * taken here, and its clock at that moment — is what says which of them is the later LOOK, and
   * the time a reading is shown with is when it was asked, never when it happened to be written.
   */
  async function measureRow(row, target) {
    const asked = (
      await pool.query("select nextval('site_name_dns_turn') as turn, clock_timestamp() as asked_at")
    ).rows[0]
    const [ownership, routing] = await Promise.all([
      measureOwnership(row.name, row.token, dnsTxt, dnsAskMs),
      measureRouting(row.name, target, dnsCname, dnsAskMs)
    ])
    return {
      name: row.name,
      token: row.token,
      target: target ?? null,
      ownership,
      routing,
      turn: String(asked.turn),
      askedAt: asked.asked_at
    }
  }

  /**
   * Write one reading, on the row it was read for: the same name, site AND token. A reading that
   * arrives after the name was removed, saved again (a new token) or taken by another site matches
   * no row and writes nothing — and one OLDER than the reading on record (`dns_turn`) writes no reading:
   * a lookup that began first and ended last never paints over the later one, let alone dated as
   * new. Each check is what was measured then: a record taken away again reads as missing again.
   * The time is the database's own, taken when the lookup was asked. Null when nothing was written.
   *
   * Any reading that finds the TXT record right also marks the reservation PROVEN
   * (`ownership_proven_at`), which no later reading clears: from then on age never lets the name go.
   * That mark does NOT follow the order of the lookups: a reading that found the record and ended
   * after a later one that did not is too old to be the reading on record, but what it found was
   * still found — it proves the name and leaves the later reading in place (and is answered null,
   * like any reading that did not become the one on record). A reading that arrives after the
   * reservation lapsed matches no row — a lookup asked before the deadline proves nothing once the
   * name is free (`LAPSED`, read once the row is locked — `lockNames` — on the clock of after the wait).
   */
  async function writeReading(db, siteKey, reading) {
    const owned = reading.ownership.status === 'ok'
    const routed = reading.routing.status === 'ok' && reading.target !== null
    await lockNames(db, `name = $1 and site_key = $2 and kind = 'custom' and token = $3`, [
      reading.name,
      siteKey,
      reading.token
    ])
    // Each reading column keeps what is on record when a later lookup is already there
    // (`dns_turn >= $9`); only the proof is taken from an older one.
    const { rows } = await db.query(
      `update site_name
          set ownership_proven_at = case when $4 then coalesce(ownership_proven_at, clock_timestamp())
                                         else ownership_proven_at end,
              ownership_verified_at = case when dns_turn >= $9::bigint then ownership_verified_at
                                           when $4 then now() else null end,
              routing_verified_at = case when dns_turn >= $9::bigint then routing_verified_at
                                         when $5 then now() else null end,
              routing_target = case when dns_turn >= $9::bigint then routing_target else $6 end,
              checked_at = case when dns_turn >= $9::bigint then checked_at else $8 end,
              dns_reading = case when dns_turn >= $9::bigint then dns_reading else $7::jsonb end,
              updated_at = case when dns_turn >= $9::bigint then updated_at else now() end,
              dns_turn = greatest(dns_turn, $9::bigint)
        where name = $1 and site_key = $2 and kind = 'custom' and token = $3
          and state in ('pending', 'active') and not ${LAPSED}
          and (dns_turn < $9::bigint or ($4 and ownership_proven_at is null))
        returning *`,
      [
        reading.name,
        siteKey,
        reading.token,
        owned,
        routed,
        routed ? reading.target : null,
        JSON.stringify({
          token: reading.token,
          target: reading.target,
          ownership: reading.ownership,
          routing: reading.routing
        }),
        reading.askedAt,
        reading.turn
      ]
    )
    const row = rows[0]
    return row && String(row.dns_turn) === String(reading.turn) ? row : null
  }

  /**
   * DNS, read now, for every own domain of the site — what a publish carries is chosen from this —
   * and the routing target it was read against, asked of the host for this reading. A host that
   * gives none proves no routing: nothing is carried.
   */
  async function measure(site) {
    const rows = await ownDomainRows(pool, site.site_key)
    if (rows.length === 0) return { target: null, hostTarget: null, readings: [] }
    const target = await targetOf(site)
    return {
      target,
      // What a `live` names to the host as the target its domains were measured against: none
      // when they point at Cloudflare for SaaS (`connect.<zone>`), which is not the host's tunnel.
      hostTarget: saas ? null : target,
      readings: await Promise.all(rows.map((row) => measureRow(row, target)))
    }
  }

  /**
   * Write what `measure` read (under the caller's names lock) and answer the domains it proves:
   * ownership AND routing, measured against the target the operation will name to the host, on a
   * row that is still the one measured. Oldest first.
   */
  async function record(db, siteKey, measured) {
    const proven = []
    for (const reading of measured.readings ?? []) {
      const row = await writeReading(db, siteKey, reading)
      if (!row || measured.target === null || reading.target !== measured.target) continue
      // 🔒 OWNERSHIP IS WHAT A PUBLISH CARRIES A DOMAIN ON; WHERE ITS DNS POINTS IS NOT. The routing
      // reading stays on the card as a diagnosis, but no particular record is demanded (the name a
      // customer is told to point at is not this host's tunnel for ever — #1037). Whether the
      // domain reaches the site is asked of the domain itself, after the host installed its route.
      if (reading.ownership.status === 'ok') proven.push(row)
    }
    return proven
      .sort((a, b) => a.created_at - b.created_at || a.name.localeCompare(b.name))
      .map((row) => row.name)
  }

  return { measure, record, measureRow, writeReading, targetOf }
}

export function mountSiteAddress(
  app,
  {
    pool,
    config,
    requireGrant,
    run,
    probe = null,
    fetchImpl = fetch,
    resolver = resolverFor(config),
    dnsTxt = (name) => resolver().resolveTxt(name),
    dnsCname = (name) => resolver().resolveCname(name),
    // How long one DNS question may take before it counts as "no answer".
    dnsAskMs = DNS_ASK_MS,
    // The host's own routing target for a site's custom domains (its tunnel's public name), or
    // null when that host has none: then no routing record is shown and nothing is measured.
    // Always the host's answer NOW: nothing here keeps one (the host may have moved to another
    // tunnel since), so a reading is written, and a record shown, against the tunnel that is there.
    routingTarget = async () => null,
    // Takes one own domain out of the host's ingress as an operation of the site (`publish.js`
    // `dropDomain`): `(site, auth, choose) => { status, body }`.
    dropDomain = async () => ({ status: 501, body: { code: 'NOT_CONFIGURED' } }),
    // Hears the ending of an operation the host has finished, before a door looks whether one holds
    // the site (`publish.js` `refresh`). What decides is the row, read under the names lock.
    settlePublish = async () => {},
    // Told once a new address is active (`{site, from, to, auth}`), for the team's notification.
    // Its failure never undoes or fails the change.
    onRenamed = async () => {},
    // Shard beta: hold a NEW Tracy address at the master before it is taken here
    // (`({site, name}) => {reserved} | {taken} | {unavailable}`); on the master, always held.
    reserveName = async () => ({ reserved: true }),
    // Whether the operator lets Owners START an own domain (`site-connect-domain`, `/ops` › User
    // Interface): read per request, and a read that fails throws — the door then refuses for now.
    connectDomainOn = () => uiSwitchOn(pool, CONNECT_DOMAIN_SWITCH),
    // Asks the real domain, over HTTPS, whether it opens this site (`domain-probe.js`).
    domainProbe = ownDomainProber(config, resolver),
    // `bar/site-proxy.js` `proxySite`, for the check below.
    siteProxy = null,
    // Whether the site serves its whole page at its Tracy address, asked through Tracy's own proxy
    // as that address (`addressStanding`): what a removal checks before anything is taken away.
    standing = (site, name) => addressStanding(site, name, { config, fetchImpl, proxy: siteProxy }),
    // The zone's custom hostnames at Cloudflare for SaaS (`site-domain-provider.js`
    // `cloudflareHostnames`), or null when this server has none configured: then no new own domain
    // is started (`OWN_DOMAIN_UNAVAILABLE`), and a domain the site already has is read, probed and
    // removed as before.
    customHostnames = null,
    // The shard beta's global label book (`shards/labels.js` via `sites/route.js`): a Tracy name is a
    // label across this master and every shard. Null: this database alone decides, as before.
    holdLabel = null
  }
) {
  const hostnames = customHostnames
  const reader = ownDomainReader({
    pool,
    dnsTxt,
    dnsCname,
    dnsAskMs,
    routingTarget,
    saas: hostnames !== null
  })
  const { measure, record, measureRow, writeReading, targetOf } = reader
  /**
   * Bring one name's custom hostname up to date with Cloudflare now; never fails the caller. Answers
   * what the pass did (`taken` 0 when another pass holds the row), or null when it failed.
   */
  const syncHostname = async (name, force = true) => {
    if (!hostnames) return null
    try {
      return await reconcileHostnames(pool, { hostnames, name, force, limit: 1 })
    } catch (error) {
      console.warn(`[own-domain] ${name}: custom hostname not synced`, error?.message ?? error)
      return null
    }
  }
  /** Probe the site's own domains that are due (or all of them, `force`), and write what was found. */
  const confirm = (site, { force = false } = {}) =>
    confirmOwnDomains(pool, {
      probe: domainProbe,
      siteKey: site.site_key,
      force,
      hostname: hostnames ? { refresh: (name) => syncHostname(name) } : null
    })

  const authorize = async (c) => {
    let key
    try {
      key = normalizeSiteKey(c.req.param('key'))
    } catch {
      return { error: c.json({ code: 'INVALID_SITE_KEY' }, 400) }
    }
    const siteKey = await canonicalSiteKey(pool, key)
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth
    if (auth.grant.role !== 'owner') return { error: c.json({ code: 'NOT_SITE_OWNER' }, 403) }
    const site = await siteByKey(pool, siteKey)
    if (!site) return { error: c.json({ code: 'SITE_UNKNOWN' }, 404) }
    return { site, auth }
  }
  /** A JSON body that is an object, or null: `null`, a list and a string have no `name` to read. */
  const objectBody = async (c) => {
    const body = await c.req.json().catch(() => null)
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  }
  /**
   * What is wrong with the SHAPE of a body, before anything in it is read — or null. Each door names
   * the fields it takes; a field it does not take is refused by name rather than dropped (a caller
   * that sent `domains` or `force` to a door that reads neither must not be told it worked), and a
   * `kind` that is there must be one of the two words: `null` is not "no kind". A `name` of the
   * wrong type is `candidate`'s to refuse, as it always was.
   */
  const shapeRefusal = (body, fields) => {
    if (!body) return null
    const extra = Object.keys(body).find((key) => !fields.includes(key))
    if (extra !== undefined)
      return { code: 'INVALID_REQUEST', reason: `unknown field: ${extra.slice(0, 40)}` }
    if ('kind' in body && body.kind !== 'managed' && body.kind !== 'custom')
      return { code: 'INVALID_REQUEST', field: 'kind' }
    return null
  }
  /**
   * The answer of a door that STARTS an own domain (reserve, check) while the operator has turned
   * `site-connect-domain` off — or null when it is on. A switch that cannot be read is not "on": the
   * door refuses for now (503) and writes nothing. A domain the site already has is not started:
   * it is still read, kept on the host and removed as before.
   */
  const startClosed = async (c) => {
    let on
    try {
      on = (await connectDomainOn()) === true
    } catch {
      return c.json({ code: 'UI_SETTING_UNREADABLE' }, 503)
    }
    if (!on) return c.json({ code: 'OWN_DOMAIN_DISABLED' }, 403)
    // 🔒 NO CLOUDFLARE FOR SAAS, NO NEW DOMAIN: nothing would ever serve the name with a certificate,
    // and a reservation that can never connect is a promise this server cannot keep.
    return hostnames ? null : c.json({ code: 'OWN_DOMAIN_UNAVAILABLE' }, 503)
  }
  /** A refusal of `candidate`, with what it names (`DOMAIN_APEX_UNSUPPORTED`: the name to enter instead). */
  const refuse = (c, next) => c.json({ code: next.refusal, ...next.detail }, 400)
  /** What a door answers for what holds the site (`lifecycleHolds`). */
  const heldRefusal = (holds) =>
    holds === 'gone'
      ? { status: 404, body: { code: 'SITE_UNKNOWN' } }
      : { status: 409, body: { code: 'ADDRESS_CHANGE_BUSY' } }

  app.get('/api/sites/:key/address/availability', async (c) => {
    const own = await authorize(c)
    if (own.error) return own.error
    const next = candidate(c.req.query('name'), config, c.req.query('kind'))
    if (next.refusal) return refuse(c, next)
    if (next.kind === 'custom') {
      const closed = await startClosed(c)
      if (closed) return closed
    }
    // A reservation that lapsed holds nothing: the name is free for whoever reserves it next.
    const held = (
      await pool.query(`select site_key from site_name where name=$1 and not ${LAPSED}`, [next.name])
    ).rows[0]
    if (held && held.site_key !== own.site.site_key)
      return c.json({ name: next.name, kind: next.kind, available: false, code: 'NAME_TAKEN' })
    // One own domain at a time: a second one is refused here, before the person saves it.
    if (next.kind === 'custom' && (await limitRefusal(pool, own.site.site_key, next.name)))
      return c.json({ code: 'DOMAIN_LIMIT', max: OWN_DOMAIN_LIMIT }, 409)
    return c.json({ name: next.name, kind: next.kind, available: true })
  })

  /**
   * Read DNS now for one own domain of the site, write the reading, and answer what the Domains card
   * shows — the whole of the Owner's "Check again", as `{status, body}`. The door below and the guide
   * door (an agent asked "I added the record, why does it not work?") both call it, so a recheck by
   * chat is the very same act as the button: the same lookup, the same names lock, the same refusals,
   * never a second path to the resolver. The caller has already checked the role (Owner), the switch
   * and the name's shape.
   * @param {any} site
   * @param {string} name
   * @returns {Promise<{ status: number, body: any }>}
   */
  const verifyOwnDomain = async (site, name) => {
    // Not reserved by this site: lapsed (it held the name once, and is told so), or never reserved.
    const notReserved = async () =>
      (await lapsedHere(pool, site.site_key, name))
        ? { status: 409, body: { code: 'RESERVATION_LAPSED' } }
        : { status: 404, body: { code: 'NAME_NOT_RESERVED' } }
    const row = (
      await pool.query(
        `select * from site_name where name=$1 and site_key=$2 and kind='custom'
            and state in ('pending','active') and not ${LAPSED}`,
        [name, site.site_key]
      )
    ).rows[0]
    if (!row) return notReserved()
    // Asked of the host now, as every target is: a kept one could be a tunnel the host has left.
    const target = await targetOf(site)
    const reading = await measureRow(row, target)
    await settlePublish(site)
    // Written under the names lock, and only on the row that was read: a domain an operation is
    // carrying keeps the proof it was reserved on, and a name saved again meanwhile keeps its own.
    const written = await withSiteNames(pool, site.site_key, async (db) => {
      const holds = await lifecycleHolds(db, site.site_key)
      if (holds) return { held: holds }
      const mine = await writeReading(db, site.site_key, reading)
      if (mine) return { updated: mine }
      // Nothing written: the reservation is gone, or a LATER lookup is already on record. The
      // answer is then what is on record for this reservation — the later reading, with its own
      // time — never this older one.
      const { rows } = await db.query(
        `select * from site_name
          where name = $1 and site_key = $2 and kind = 'custom' and token = $3
            and state in ('pending', 'active') and not ${LAPSED}`,
        [reading.name, site.site_key, reading.token]
      )
      return { updated: rows[0] ?? null }
    })
    if (written.busy) return { status: 409, body: { code: 'ADDRESS_CHANGE_BUSY' } }
    if (written.value.held) {
      return heldRefusal(written.value.held)
    }
    if (!written.value.updated) return notReserved()
    // A reservation proven by now gets its custom hostname at Cloudflare at once, rather than on the
    // sweep's next pass (`site-domain-provider.js`).
    if (written.value.updated.ownership_proven_at) await syncHostname(reading.name)
    // The Owner asked to check: a name whose route the host installed is asked itself, now.
    let updated = written.value.updated
    if (updated.routed_at) {
      await confirm(site, { force: true })
      updated =
        (
          await pool.query(
            `select * from site_name where name = $1 and site_key = $2 and kind = 'custom' and token = $3
                and state in ('pending', 'active')`,
            [reading.name, site.site_key, reading.token]
          )
        ).rows[0] ?? updated
    }
    const domain = ownDomainOf(await withHostname(pool, updated), target)
    return {
      status: 202,
      body: {
        state: domain.state,
        ...publicSiteFields(site),
        ...(domain.state === 'connected' ? { connected: domain } : { pending: domain })
      }
    }
  }

  app.post('/api/sites/:key/address/verify', async (c) => {
    const own = await authorize(c)
    if (own.error) return own.error
    const body = await objectBody(c)
    const shape = shapeRefusal(body, ['name'])
    if (shape) return c.json(shape, 400)
    const next = candidate(body?.name, config, 'custom')
    if (next.refusal) return refuse(c, next)
    const closed = await startClosed(c)
    if (closed) return closed
    const done = await verifyOwnDomain(own.site, next.name)
    return c.json(done.body, done.status)
  })

  /**
   * `DELETE /api/sites/:key/address/domain` `{name}` — take an own domain away from the site.
   *
   * One still being connected that no operation ever handed to the host is only a reservation: its
   * row goes, here (200). A connected one is in the host's ingress, which sends the name straight
   * to the site past every gate of this app — and so may be one still `pending` that a publish
   * handed to the host without ever hearing it was added (`carried_at`). Those are removed as an
   * OPERATION of the site (`drop-domain`, 202): the same reservation, keyed host job and release
   * rule as a publish. The row goes only when the host's script said the rule is out; a removal
   * that failed is on record as failed, and asking again takes the same operation back.
   */
  app.delete('/api/sites/:key/address/domain', async (c) => {
    const own = await authorize(c)
    if (own.error) return own.error
    const body = await objectBody(c)
    const shape = shapeRefusal(body, ['name'])
    if (shape) return c.json(shape, 400)
    // Any name the site may hold, including one that could not be reserved today.
    const next = heldCandidate(body?.name, config)
    if (next.refusal) return c.json({ code: next.refusal }, 400)
    const siteKey = own.site.site_key
    await settlePublish(own.site)
    const find = async (db) =>
      (
        await db.query(
          "select * from site_name where name=$1 and site_key=$2 and kind='custom' and state in ('pending','active')",
          [next.name, siteKey]
        )
      ).rows[0]
    const forget = async (db, row) => {
      await db.query("delete from site_name where name=$1 and site_key=$2 and kind='custom' and token=$3", [
        row.name,
        siteKey,
        row.token
      ])
      await db.query(
        'insert into site_name_released(name) values($1) on conflict (name) do update set released_at = now()',
        [row.name]
      )
      await db.query(
        "insert into audit(actor,action,site_key,detail) values($1,'site.domain.remove',$2,$3::jsonb)",
        [own.auth.email ?? null, siteKey, JSON.stringify({ name: row.name, was: row.state })]
      )
    }
    /** The notice of a lapsed reservation of this name: the Owner has read it. Whether there was one. */
    const dismiss = async (db) =>
      (await db.query('delete from site_name_lapse where site_key = $1 and name = $2', [siteKey, next.name]))
        .rowCount > 0
    const removed = { status: 200, body: { ok: true, removed: next.name, ...publicSiteFields(own.site) } }
    // Only a reservation: nothing of it can be on the host.
    const plain = await withSiteNames(pool, siteKey, async (db) => {
      const row = await find(db)
      if (!row) {
        // A reservation that lapsed and was let go: only its notice is left, and that goes.
        if (await dismiss(db)) return removed
        return { status: 404, body: { code: 'NAME_NOT_RESERVED' } }
      }
      if (row.state === 'active' || row.carried_at !== null) return null
      const holds = await lifecycleHolds(db, siteKey)
      if (holds) return heldRefusal(holds)
      await forget(db, row)
      await dismiss(db)
      return removed
    })
    if (plain.busy) return c.json({ code: 'ADDRESS_CHANGE_BUSY' }, 409)
    if (plain.value) {
      // The name is not served any more (its row is gone): its custom hostname at Cloudflare goes now.
      // One that cannot be deleted yet stays on record and the sweep tries again.
      if (plain.value.status === 200) await syncHostname(next.name)
      return c.json(plain.value.body, plain.value.status)
    }
    // 🔒 THE SITE ANSWERS AT ITS TRACY ADDRESS BEFORE THE NAME IS TAKEN AWAY — CHECKED, NOT ASSUMED.
    // Connecting a domain never moves the CMS off its Tracy address, so normally there is nothing
    // to put back; but a CMS somebody pointed at the domain by hand would, with the domain gone,
    // redirect every visitor of the Tracy address to a name that opens nothing. So the site is
    // asked first. One that sends its Tracy address to the domain is put back by the same job a
    // rename uses (journal and rollback on the host), and asked again. Nothing has been removed
    // when this refuses: the answer names the step, and the domain goes on serving.
    // For EVERY name whose route may be on the host — connected, or handed to a publish whose
    // answer was never heard: either may be what visitors reach the site by right now.
    const restored = await restoreCanonical(own.site, next.name, own.auth)
    if (restored) return c.json(restored.body, restored.status)
    // The host may have its rule: out through the host, as an operation of the site. Reserving it
    // stops this app serving the name (`publish-store.js` `reserveIn`), before the host is asked.
    const answer = await dropDomain(own.site, own.auth, async (db) => {
      const row = await find(db)
      if (!row) return { refusal: { status: 404, body: { code: 'NAME_NOT_RESERVED' } } }
      return { domains: [row.name] }
    })
    // A removal that did not start says which step it stopped at, like the two above.
    const failed = answer.status >= 500 || answer.body?.code === 'NOT_CONFIGURED'
    return c.json({ ...answer.body, ...(failed ? { step: 'remove-route' } : {}) }, answer.status)
  })

  /**
   * Make sure the site is served at its Tracy address before `name` is removed: null when it is, or
   * the refusal to answer — `DOMAIN_REMOVE_FAILED` with the `step` that failed:
   *   verify-address    the Tracy address does not serve the site (`reason`: `SITE_NOT_READY` — no
   *                     copy or no address to ask; `ADDRESS_REDIRECTS_ELSEWHERE`; none when the site
   *                     gave an error or no answer), or still does not after it was put back
   *   restore-address   the host could not put the CMS back (`reason`: the host's own code)
   *   rollback-address  the restore failed AND undoing it could not be confirmed: the CMS's address
   *                     is not known (`uncertain: true`, `changeId` — the host's journal entry)
   * Nothing of the domain has been touched in any of them.
   */
  async function restoreCanonical(site, name, auth) {
    const refuse = (step, extra = {}) => ({
      status: 502,
      body: { code: 'DOMAIN_REMOVE_FAILED', step, ...extra }
    })
    // 🔒 A SITE THAT CANNOT BE ASKED IS NOT A SITE THAT ANSWERS. With no copy on a host, or no
    // address on record, nothing can say the Tracy address serves it — and the customer's domain may
    // be the only way in that still works.
    if (!site.attached || !site.address) return refuse('verify-address', { reason: 'SITE_NOT_READY' })
    const ask = async () => {
      try {
        const found = await standing(site, name)
        return ['ok', 'moved', 'elsewhere'].includes(found) ? found : 'unreachable'
      } catch {
        return 'unreachable'
      }
    }
    const notServing = (found) =>
      refuse('verify-address', found === 'elsewhere' ? { reason: 'ADDRESS_REDIRECTS_ELSEWHERE' } : {})
    const found = await ask()
    if (found === 'ok') return null
    if (found !== 'moved') return notServing(found)
    const input = {
      kind: 'site-address',
      oldUrl: `https://${name}/`,
      newUrl: site.address,
      changeId: randomUUID()
    }
    let applied = null
    try {
      applied = await run(site, { ...input, operation: 'apply' })
    } catch {
      /* Rolled back below like any uncertain result. */
    }
    const back = applied?.ok === true ? await ask() : null
    if (back === 'ok') return null
    // Not restored, or restored and still not serving: the host's journal puts the CMS back as it
    // was, and the domain — untouched — goes on opening the site.
    const refused = applied ? hostRefusal(applied) : null
    let rolled = false
    try {
      rolled = rolledBack(await run(site, { ...input, operation: 'rollback' }), refused !== null)
    } catch {
      /* Not confirmed: said so below. */
    }
    if (!rolled) {
      // 🔒 AN UNDO NOBODY CONFIRMED IS SAID AND KEPT, NEVER SWALLOWED. The CMS may be at either
      // address now. The change id is the host's journal entry (`site-address.py`): written down
      // here so whoever looks next can finish it, and handed to the caller.
      console.error(
        `[own-domain] ${site.site_key}: restoring the address before removing ${name} failed and its rollback is unconfirmed (change ${input.changeId})`
      )
      await pool
        .query(
          "insert into audit(actor,action,site_key,detail) values($1,'site.domain.restore.uncertain',$2,$3::jsonb)",
          [
            auth?.email ?? null,
            site.site_key,
            JSON.stringify({ name, changeId: input.changeId, oldUrl: input.oldUrl, newUrl: input.newUrl })
          ]
        )
        .catch((error) =>
          console.error('[own-domain] uncertain restore not recorded', error?.message ?? error)
        )
      return refuse('rollback-address', {
        uncertain: true,
        changeId: input.changeId,
        ...(refused ? { reason: refused } : {})
      })
    }
    if (applied?.ok === true) return notServing(back)
    return refuse('restore-address', refused ? { reason: refused } : {})
  }

  app.put('/api/sites/:key/address', async (c) => {
    const own = await authorize(c)
    if (own.error) return own.error
    const body = await objectBody(c)
    const shape = shapeRefusal(body, ['name', 'kind'])
    if (shape) return c.json(shape, 400)
    const next = candidate(body?.name, config, body?.kind)
    if (next.refusal) return refuse(c, next)
    if (next.kind === 'custom') {
      const closed = await startClosed(c)
      if (closed) return closed
    }
    await settlePublish(own.site)
    const client = await pool.connect()
    let locked = false
    try {
      locked = (
        await client.query('select pg_try_advisory_lock(hashtext($1)) as locked', [
          `site-address:${own.site.site_key}`
        ])
      ).rows[0].locked
      if (!locked) return c.json({ code: 'ADDRESS_CHANGE_BUSY' }, 409)
      // Under the lock an operation takes to reserve: while one holds the site its names stay as
      // they are — the domains it carries were chosen from them.
      const holds = await lifecycleHolds(client, own.site.site_key)
      if (holds) {
        const refusal = heldRefusal(holds)
        return c.json(refusal.body, refusal.status)
      }
      const site = await siteByKey(client, own.site.site_key)
      const current = publicSiteFields(site)
      if (site.primary_name === next.name) return c.json({ state: 'active', ...current })
      const inFlight = (
        await client.query("select * from site_name where site_key=$1 and state='applying'", [site.site_key])
      ).rows[0]
      if (inFlight) {
        // A process may die after recording `applying`. Retry that same name by undoing its
        // durable host-side journal first; a different name stays locked until an operator can
        // inspect the unresolved change.
        if (inFlight.name !== next.name || !inFlight.change_id || !inFlight.previous_url)
          return c.json({ code: 'ADDRESS_CHANGE_BUSY' }, 409)
        const oldUrl = inFlight.previous_url
        const newUrl = candidate(inFlight.name, config).url
        let rolled = false
        try {
          rolled = Boolean(
            newUrl &&
              (
                await run(site, {
                  kind: 'site-address',
                  oldUrl,
                  newUrl,
                  changeId: inFlight.change_id,
                  operation: 'rollback'
                })
              ).ok === true
          )
        } catch {
          /* Keep the applying reservation if host recovery is uncertain. */
        }
        if (!rolled) return c.json({ code: 'ADDRESS_ROLLBACK_FAILED' }, 502)
        await client.query("update site_name set state='failed',token=null,updated_at=now() where name=$1", [
          inFlight.name
        ])
      }
      // 🔒 A NAME NOBODY PROVED IS FREE AGAIN AFTER ITS DEADLINE. Before this reserves, the lapsed
      // reservation of the name (whoever held it) and the site's own lapsed ones are let go, each
      // with its notice — one statement (`releaseLapsed`); the unique name then decides between
      // two sites reserving it at once: one insert lands, the other reads the winner's row.
      if (next.kind === 'custom') await releaseLapsed(client, { name: next.name, siteKey: site.site_key })
      if (next.kind === 'custom' && (await limitRefusal(client, site.site_key, next.name)))
        return c.json({ code: 'DOMAIN_LIMIT', max: OWN_DOMAIN_LIMIT }, 409)
      // 🔒 A NAME WHOSE EARLIER CUSTOM HOSTNAME IS STILL AT CLOUDFLARE IS NOT RESERVED AGAIN YET — by
      // another site or by this one: the old hostname is deleted first (asked now, once), so a new
      // reservation never inherits a hostname, or a certificate, made for an earlier one.
      if (next.kind === 'custom') {
        const holder = (
          await client.query('select site_key, token from site_name where name = $1', [next.name])
        ).rows[0]
        const mine = holder?.site_key === site.site_key ? holder.token : null
        if (!holder || mine !== null) {
          const ask = () => releasing(client, { name: next.name, siteKey: site.site_key, token: mine })
          if ((await ask()) !== null) await syncHostname(next.name)
          if ((await ask()) !== null) return c.json({ code: 'DOMAIN_RELEASING' }, 409)
        }
      }
      // A Tracy name is a label across this master and every shard (shard beta): one a shard holds or
      // uses is not this site's to take.
      if (next.kind === 'managed' && holdLabel) {
        const label = next.name.slice(0, -(config.siteDomain.length + 1))
        if (!(await holdLabel(label, site.site_key)).ok) return c.json({ code: 'NAME_TAKEN' }, 409)
      }
      // A Tracy address is one zone shared by every shard: held at the master before it is taken here.
      if (next.kind === 'managed') {
        const held = await reserveName({ site, name: next.name })
        if (held.taken) return c.json({ code: 'NAME_TAKEN' }, 409)
        if (!held.reserved) return c.json({ code: 'LABEL_REGISTRY_UNAVAILABLE' }, 503)
      }
      const token = randomBytes(24).toString('hex')
      // An own domain holds its name for `OWN_DOMAIN_HOLD_HOURS` unless its ownership is proven;
      // saving the same name again finds this row and never moves the deadline.
      await client.query(
        `insert into site_name(name,site_key,kind,state,token,hold_until)
         values($1,$2,$3,'pending',$4,case when $3 = 'custom' then now() + make_interval(hours => $5) end)
         on conflict(name) do nothing`,
        [next.name, site.site_key, next.kind, token, OWN_DOMAIN_HOLD_HOURS]
      )
      let row = (await client.query('select * from site_name where name=$1', [next.name])).rows[0]
      if (row.site_key !== site.site_key) return c.json({ code: 'NAME_TAKEN' }, 409)
      if (next.kind === 'custom') {
        // A name of the site's own that failed or was let go earlier starts over, with a new token:
        // nothing measured for the earlier reservation counts for this one.
        if (row.state === 'failed')
          row = (
            await client.query(
              `update site_name set state='pending', token=$2, ownership_verified_at=null,
                      ownership_proven_at=null, hold_until=now() + make_interval(hours => $3),
                      routing_verified_at=null, routing_target=null, checked_at=null, dns_reading=null,
                      carried_at=null, routed_at=null, connected_at=null, probe_secret=null, probe_reading=null,
                      probed_at=null, probe_next_at=null, probe_tries=0, updated_at=now()
                where name=$1 returning *`,
              [next.name, token, OWN_DOMAIN_HOLD_HOURS]
            )
          ).rows[0]
        // A reservation made: the notices of the site's lapsed ones have been answered by it.
        await client.query('delete from site_name_lapse where site_key = $1', [site.site_key])
        // Held again: the name is no longer one that was let go.
        await client.query('delete from site_name_released where name = $1', [next.name])
        // The record the customer is told to add: the host's target as it is now.
        const target = await targetOf(site)
        const domain = ownDomainOf(await withHostname(client, row), target)
        if (domain.state === 'connected') return c.json({ state: 'connected', ...current, connected: domain })
        return c.json({ state: 'pending', ...current, pending: domain }, 202)
      }
      if (!site.attached || !site.address) return c.json({ code: 'SITE_NOT_READY' }, 409)
      const changeId = randomUUID()
      const wasActive = row.state === 'active'
      await client.query(
        "update site_name set state='applying',token=$2,change_id=$3,previous_url=$4,updated_at=now() where name=$1",
        [next.name, token, changeId, site.address]
      )
      const input = { kind: 'site-address', oldUrl: site.address, newUrl: next.url, changeId }
      let applied = false,
        verified = false,
        refused = null
      try {
        const answer = await run(site, { ...input, operation: 'apply' })
        applied = answer.ok === true
        refused = hostRefusal(answer)
        if (applied)
          verified = await (probe ? probe(next.url, token) : probeAddressOnce(next.url, token, fetchImpl))
      } catch {
        /* Roll back an uncertain host result as well. */
      }
      if (!applied || !verified) {
        let rolled = false
        try {
          rolled = rolledBack(await run(site, { ...input, operation: 'rollback' }), refused !== null)
        } catch {
          /* Keep applying state for recovery. */
        }
        if (rolled)
          await client.query('update site_name set state=$2,token=null,updated_at=now() where name=$1', [
            next.name,
            wasActive ? 'active' : 'failed'
          ])
        return c.json(
          {
            code: !rolled
              ? 'ADDRESS_ROLLBACK_FAILED'
              : !applied
                ? 'ADDRESS_APPLY_FAILED'
                : 'ADDRESS_PROBE_FAILED',
            // Why the host refused (`WP_ADDRESS_CONSTANT`, `ADDRESS_CONFLICT`, …): the person is
            // told that, not only that it failed.
            ...(rolled && !applied && refused !== null ? { reason: refused } : {})
          },
          502
        )
      }
      await client.query('begin')
      try {
        await client.query("update site_name set state='active',token=null,updated_at=now() where name=$1", [
          next.name
        ])
        await client.query('update site set primary_name=$2,address=$3 where site_key=$1', [
          site.site_key,
          next.name,
          next.url
        ])
        await client.query(
          "insert into audit(actor,action,site_key,detail) values($1,'site.address',$2,$3::jsonb)",
          [
            own.auth.email ?? null,
            site.site_key,
            JSON.stringify({ from: site.address, to: next.url, changeId })
          ]
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
      try {
        await onRenamed({
          site,
          from: site.primary_name || site.site_key,
          to: next.name,
          auth: own.auth
        })
      } catch (error) {
        console.warn('[sites] rename notification not written', error?.message ?? error)
      }
      return c.json({
        state: 'active',
        ...publicSiteFields({ ...site, primary_name: next.name, address: next.url })
      })
    } finally {
      if (locked)
        await client
          .query('select pg_advisory_unlock(hashtext($1))', [`site-address:${own.site.site_key}`])
          .catch(() => {})
      client.release()
    }
  })
  return {
    /** DNS read now for every own domain of a site (`publish.js` asks before it reserves). */
    measure,
    /** Writes that reading under the caller's names lock; answers the domains it proves. */
    record,
    /** The host's routing target for a site, as the host says it now, or null. */
    targetOf,
    /** Probe the site's own domains whose route is installed; connected only on their own proof. */
    confirm,
    /** "Check again" for one own domain, as `{status, body}` — the verify door's whole act. */
    verifyOwnDomain,
    /** Whether this server can start an own domain at all (Cloudflare for SaaS is configured). */
    canConnect: () => hostnames !== null
  }
}
