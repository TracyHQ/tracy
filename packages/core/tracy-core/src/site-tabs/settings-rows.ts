/**
 * What the site Settings tab shows, as plain data (layout D, Akemi 04/10/2026): the header facts
 * (name, CMS and version) and the compact rows (label, value, where in the CMS admin it is edited).
 * Kept apart from the JSX so each CMS's rows are tested without a DOM.
 */
import type { Translate } from '../team/translate'

export const cmsNames: Record<string, string> = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }
export const rows: Record<string, [string, string][]> = {
  wordpress: [
    ['version', 'wp-admin/update-core.php'],
    ['title', 'wp-admin/options-general.php'],
    ['language', 'wp-admin/options-general.php'],
    ['timezone', 'wp-admin/options-general.php'],
    ['theme', 'wp-admin/themes.php'],
    ['homepage', 'wp-admin/options-reading.php'],
    ['permalinks', 'wp-admin/options-permalink.php']
  ],
  joomla: [
    ['version', 'administrator/index.php?option=com_joomlaupdate'],
    ['title', 'administrator/index.php?option=com_config'],
    ['language', 'administrator/index.php?option=com_languages&view=installed'],
    ['languages', 'administrator/index.php?option=com_languages&view=languages'],
    ['timezone', 'administrator/index.php?option=com_config'],
    ['template', 'administrator/index.php?option=com_templates&view=styles'],
    ['sef', 'administrator/index.php?option=com_config']
  ],
  emdash: [
    ['version', '_emdash/admin/'],
    ['title', '_emdash/admin/settings/general'],
    ['tagline', '_emdash/admin/settings/general'],
    ['template', '_emdash/admin/'],
    ['postsPerPage', '_emdash/admin/settings/general'],
    ['timezone', '_emdash/admin/settings/general'],
    ['titleSeparator', '_emdash/admin/settings/seo']
  ]
}
export type Snapshot = {
  /** The site the server read this snapshot of (`GET /api/sites/:key/settings`). */
  siteKey?: string
  siteUrl: string | null
  adminUrl: string | null
  platform: string
  state: string
  values: Record<string, string | number | boolean>
  displayName?: string
  addressChange?: {
    allowed: boolean
    managedDomain: string
    status: 'ready' | 'pending'
    /** The own domain being connected: its records, and what the last lookup returned for each. */
    pending?: OwnDomain
    /** The own domains the host's ingress carries. Absent from a server older than own domains. */
    connected?: OwnDomain[]
    /** Reservations that lapsed before their ownership was proven. Absent from an older server. */
    lapsed?: OwnDomain[]
  }
  /** Absent from a server older than the publish flow: the section then draws no state and no action. */
  publishing?: Publishing
}

/**
 * What the server says about a site's publishing (`GET /api/sites/:key/state`, and the `publishing`
 * part of `GET /api/sites/:key/settings`): the flag, what this seat may press, and the operation
 * that is running or that failed last.
 */
export interface Publishing {
  publish: 'draft' | 'published'
  mayPublish: boolean
  operation: PublishOperation | null
  /** When the site went live through this flow, when the server knows. */
  liveSince?: string
}
export interface PublishOperation {
  /** A publish, a back-to-draft, or one own domain being taken out of the site. */
  op: 'live' | 'draft' | 'drop-domain'
  /** The own domains the operation carries; empty when it carries none. */
  domains: string[]
  /** A cleanup that failed after the host took it: pressing again asks for the same operation. */
  retry: boolean
  state: 'running' | 'failed'
  /** While running: false until the host has said it has the job, and again when it stops answering for it. */
  confirmed?: boolean
  jobId: string | null
  startedAt: string
  code?: string
  endedAt?: string
}

/**
 * Fired on `window` when a site's publish flag is read to have changed (`detail.siteKey`): My Sites
 * reads its list again, so the row's chip never contradicts the Settings tab beside it.
 */
export const SITE_PUBLISH_EVENT = 'tracy:site-publish-changed'

/** The one state written beside the site's name. */
export type SiteStatus = 'draft' | 'publishing' | 'live'

/**
 * A snapshot's `publishing` part, or null when it is not one. Read from the wire, so every field is
 * checked: a screen that trusted a half-formed answer would offer a button on a guess.
 */
export function readPublishing(value: unknown): Publishing | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.publish !== 'draft' && v.publish !== 'published') return null
  if (typeof v.mayPublish !== 'boolean') return null
  let operation: PublishOperation | null = null
  if (v.operation !== null && v.operation !== undefined) {
    const o = v.operation as Record<string, unknown>
    if (typeof o !== 'object') return null
    if (o.op !== 'live' && o.op !== 'draft' && o.op !== 'drop-domain') return null
    if (o.state !== 'running' && o.state !== 'failed') return null
    if (typeof o.startedAt !== 'string') return null
    operation = {
      op: o.op,
      domains: Array.isArray(o.domains) ? o.domains.filter((d): d is string => typeof d === 'string') : [],
      retry: o.retry === true,
      state: o.state,
      jobId: typeof o.jobId === 'string' ? o.jobId : null,
      startedAt: o.startedAt,
      ...(typeof o.confirmed === 'boolean' ? { confirmed: o.confirmed } : {}),
      ...(typeof o.code === 'string' ? { code: o.code } : {}),
      ...(typeof o.endedAt === 'string' ? { endedAt: o.endedAt } : {})
    }
  }
  return {
    publish: v.publish,
    mayPublish: v.mayPublish,
    operation,
    ...(typeof v.liveSince === 'string' ? { liveSince: v.liveSince } : {})
  }
}

/** `Publishing…` only while a publish is running; going back to draft is a draft from its first moment,
 * and a domain being removed changes nothing about the site's own standing. */
export function siteStatus(publishing: Publishing): SiteStatus {
  if (publishing.operation?.state === 'running' && publishing.operation.op === 'live') return 'publishing'
  return publishing.publish === 'published' ? 'live' : 'draft'
}

/** The direction being worked on right now — a press still in flight, or the server's running operation. */
export function publishWork(
  publishing: Publishing,
  pressed: 'live' | 'draft' | null
): 'live' | 'draft' | 'drop-domain' | null {
  if (publishing.operation?.state === 'running') return publishing.operation.op
  return pressed
}

/**
 * The failure to tell, from what the server reads back — never from the press that failed:
 *   `publish`    a publish did not finish and the site is still a draft
 *   `republish`  a publish did not finish on a site that was already live, and still is
 *   `draft`      going back to draft did not finish; the site reads draft (the flag drops first)
 *   `domain`     the site IS live, and the host did not say it connected the own domain
 *   `removal`    an own domain could not be taken out; it may still open the site
 * The last two are about a domain, and are said on the domain's own card.
 */
export function publishFailure(
  publishing: Publishing
): { kind: 'publish' | 'republish' | 'draft' | 'domain' | 'removal'; operation: PublishOperation } | null {
  const operation = publishing.operation
  if (operation?.state !== 'failed') return null
  if (operation.op === 'drop-domain') return { kind: 'removal', operation }
  if (operation.op === 'live' && operation.code === 'DOMAIN_NOT_ROUTED' && publishing.publish === 'published')
    return { kind: 'domain', operation }
  if (operation.op === 'draft') return publishing.publish === 'draft' ? { kind: 'draft', operation } : null
  return { kind: publishing.publish === 'published' ? 'republish' : 'publish', operation }
}

/** Why a publish failed, as the key of its sentence under `Details`. Codes: `publish-store.js`. */
export function publishReasonKey(code: string | undefined): string {
  switch (code) {
    case 'NOT_CONFIGURED':
      return 'publish.reason.notConfigured'
    case 'JOB_FAILED':
      return 'publish.reason.jobFailed'
    case 'JOB_NO_RESULT':
      return 'publish.reason.noResult'
    case 'DOMAIN_NOT_ROUTED':
      return 'publish.reason.domainNotRouted'
    case 'DOMAIN_STILL_ROUTED':
      return 'publish.reason.domainStillRouted'
    case 'ROUTING_TARGET_CHANGED':
      return 'publish.reason.routingChanged'
    default:
      return 'publish.reason.refused'
  }
}

/**
 * What to say after a press the go-live door refused without starting anything, by the status and
 * code it sends (`apps/tracy-web/src/sites/publish.js`, and `requireGrant` in front of it). Null:
 * nothing to add — the state read back says it (a failed operation, or one that is running).
 */
export function publishRefusalKey(status: number, code: unknown): string | null {
  // An ended session is one thing whatever it carries, as at the address door.
  if (status === 401) return 'settings.url.signedOut'
  // ADR 0028: the door answers NOT_SITE_EDITOR to a viewer; an older server still says NOT_SITE_ADMIN.
  if (status === 403 && (code === 'NOT_SITE_EDITOR' || code === 'NOT_SITE_ADMIN')) return 'publish.adminOnly'
  if (status === 403 && code === 'SEAT_NOT_AUTHORIZED') return 'settings.url.noAccess'
  if (status === 404 && code === 'SITE_UNKNOWN') return 'settings.url.siteUnknown'
  if (status === 409 && code === 'PUBLISH_BUSY') return 'publish.busy'
  // Any other 4xx started nothing and names no reason this screen knows: say so, claim nothing.
  if (status >= 400 && status < 500) return 'publish.unknown'
  return null
}

/** The host of an address as it is written on the card: no scheme, no trailing slash. */
export function hostOf(siteUrl: string | null): string | null {
  if (siteUrl === null) return null
  try {
    return new URL(siteUrl).host
  } catch {
    return null
  }
}

/**
 * Whether a snapshot the server answered is of the site this screen is showing. The server names
 * the site it read (`siteKey`, normalised the way its doors normalise a key: lower case, no scheme,
 * no `www.`, no path); only a snapshot that names THIS site is drawn. One that names another site,
 * or none at all, has no identity to hold it to the screen and is never drawn — an address and a
 * Publish button are not put up from an answer that does not say whose they are.
 */
export function snapshotIsOf(snapshot: Snapshot, siteKey: string): boolean {
  if (typeof snapshot.siteKey !== 'string') return false
  const plain = (key: string): string =>
    key
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
  const named = plain(snapshot.siteKey)
  return named !== '' && named === plain(siteKey)
}
/** What one lookup returned for one DNS record of an own domain (`apps/tracy-web` `sites/address.js`). */
export interface DomainCheck {
  /**
   * `validation`: a record the domain's HTTPS certificate asked for (Cloudflare for SaaS), exactly as
   * it was returned; never looked up by Tracy, so always `unchecked` — the certificate says.
   */
  record: 'ownership' | 'routing' | 'validation'
  type: string
  name: string
  /** The value the record must have; absent for a seat that is not shown it, null when unknown. */
  expected?: string | null
  /** `unchecked`: no lookup yet. `unknown`: the lookup gave no usable answer (`error` says why). */
  status: 'ok' | 'wrong' | 'missing' | 'unknown' | 'unchecked'
  observed: string[]
  error?: string
  checkedAt?: string
}
export interface OwnDomain {
  name: string
  /** `lapsed`: the reservation no longer holds the name — its ownership was not proven in time. */
  state: 'pending' | 'connected' | 'lapsed'
  /**
   * Why a pending domain cannot be connected as it is (`DOMAIN_APEX_UNSUPPORTED`, `INVALID_SITE_KEY`),
   * and — for a bare domain only — what to use instead.
   */
  problem?: string
  suggestion?: string
  /** Until when a pending domain holds its name unless its ownership is proven. */
  holdUntil?: string
  /** When a lapsed reservation let its name go. */
  lapsedAt?: string
  /** The TXT record that proves the domain; the Owner alone is sent it. */
  verification?: { type: string; name: string; value: string }
  /** The record that points the domain at the site; absent when the host named no target. */
  routing?: { type: string; name: string; value: string }
  checks: DomainCheck[]
  checkedAt?: string
  /** Whether the real domain opens the site. Absent from a server older than the HTTPS probe. */
  connection?: DomainConnection
  /**
   * The registration that serves the domain with its certificate (Cloudflare for SaaS), once the
   * domain is proven: ready, or why not (`HOSTNAME_PENDING`, `CERT_PENDING`…).
   */
  hostname?: { ready: boolean; reason?: string }
}
/**
 * What asking the real domain over HTTPS found (`apps/tracy-web` `sites/address.js` `connectionOf`):
 *   `unchecked`  the host has not installed the domain's route, so nothing was asked
 *   `waiting`    the route is installed and no answer has come yet (`route: 'direct'`: a domain
 *                connected before routes were asked, being moved — read the same way)
 *   `ok`         the domain answered as this site
 *   `failed`     it did not; `error` says why
 */
export interface DomainConnection {
  status: 'unchecked' | 'waiting' | 'ok' | 'failed'
  error?: string
  checkedAt?: string
  route?: 'direct'
}
/** The name older code knows a pending own domain by. */
export type PendingAddress = OwnDomain

const CHECK_STATUSES = new Set(['ok', 'wrong', 'missing', 'unknown', 'unchecked'])
const CONNECTION_STATUSES = new Set(['unchecked', 'waiting', 'ok', 'failed'])

/**
 * The `connection` part of an own domain as the server sent it, or undefined when it is not one: a
 * status this screen does not know, or an `error` that is not a string, is no reading at all — the
 * card then follows the DNS records alone, as it does for a server that sends no `connection`.
 */
function readConnection(value: unknown): DomainConnection | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const c = value as Record<string, unknown>
  if (typeof c.status !== 'string' || !CONNECTION_STATUSES.has(c.status)) return undefined
  if (c.error !== undefined && typeof c.error !== 'string') return undefined
  return {
    status: c.status as DomainConnection['status'],
    ...(typeof c.error === 'string' ? { error: c.error } : {}),
    ...(typeof c.checkedAt === 'string' ? { checkedAt: c.checkedAt } : {}),
    ...(c.route === 'direct' ? { route: 'direct' as const } : {})
  }
}

/**
 * An own domain as the server sent it, or null when it is not one. Read from the wire like
 * `readPublishing`: a record is drawn as "found" only from an answer that says so in full, and a
 * server older than the per-record readings (no `checks`) reads as not checked — never as ready.
 */
export function readOwnDomain(value: unknown): OwnDomain | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.name !== 'string' || v.name === '') return null
  const record = (raw: unknown): { type: string; name: string; value: string } | undefined => {
    const r = raw as Record<string, unknown> | null
    return r !== null &&
      typeof r === 'object' &&
      typeof r.type === 'string' &&
      typeof r.name === 'string' &&
      typeof r.value === 'string'
      ? { type: r.type, name: r.name, value: r.value }
      : undefined
  }
  const verification = record(v.verification)
  const routing = record(v.routing)
  const checks: DomainCheck[] = []
  for (const raw of Array.isArray(v.checks) ? v.checks : []) {
    const c = raw as Record<string, unknown> | null
    if (c === null || typeof c !== 'object') continue
    if (c.record !== 'ownership' && c.record !== 'routing' && c.record !== 'validation') continue
    if (typeof c.type !== 'string' || typeof c.name !== 'string') continue
    if (typeof c.status !== 'string' || !CHECK_STATUSES.has(c.status)) continue
    // One ownership and one routing record; validation records as many as were sent, each once.
    if (
      checks.some(
        (known) =>
          known.record === c.record &&
          (c.record !== 'validation' ||
            (known.type === c.type && known.name === c.name && known.expected === c.expected))
      )
    )
      continue
    if (c.record === 'validation' && typeof c.expected !== 'string') continue
    checks.push({
      record: c.record,
      type: c.type,
      name: c.name,
      ...(typeof c.expected === 'string' || c.expected === null ? { expected: c.expected } : {}),
      status: c.status as DomainCheck['status'],
      observed: Array.isArray(c.observed) ? c.observed.filter((o): o is string => typeof o === 'string') : [],
      ...(typeof c.error === 'string' ? { error: c.error } : {}),
      ...(typeof c.checkedAt === 'string' ? { checkedAt: c.checkedAt } : {})
    })
  }
  // A server that sent no reading for a record: shown as not checked, with what is known of it.
  for (const kind of ['ownership', 'routing'] as const) {
    if (checks.some((check) => check.record === kind)) continue
    const known = kind === 'ownership' ? verification : routing
    checks.push({
      record: kind,
      type: known?.type ?? (kind === 'ownership' ? 'TXT' : 'CNAME'),
      name: known?.name ?? (kind === 'ownership' ? `_tracy.${v.name}` : v.name),
      ...(known ? { expected: known.value } : {}),
      status: 'unchecked',
      observed: []
    })
  }
  const order = { ownership: 0, routing: 1, validation: 2 } as const
  checks.sort((a, b) => order[a.record] - order[b.record])
  const state = v.state === 'connected' || v.state === 'lapsed' ? v.state : 'pending'
  // A lapsed reservation has no route to ask.
  const connection = state === 'lapsed' ? undefined : readConnection(v.connection)
  const h = v.hostname as Record<string, unknown> | null | undefined
  const hostname =
    state !== 'lapsed' && h !== null && typeof h === 'object' && typeof h.ready === 'boolean'
      ? { ready: h.ready, ...(typeof h.reason === 'string' ? { reason: h.reason } : {}) }
      : undefined
  return {
    name: v.name,
    state,
    ...(state === 'pending' && typeof v.problem === 'string' ? { problem: v.problem } : {}),
    ...(state === 'pending' && typeof v.suggestion === 'string' ? { suggestion: v.suggestion } : {}),
    ...(state === 'pending' && typeof v.holdUntil === 'string' ? { holdUntil: v.holdUntil } : {}),
    ...(state === 'lapsed' && typeof v.lapsedAt === 'string' ? { lapsedAt: v.lapsedAt } : {}),
    ...(verification ? { verification } : {}),
    ...(routing ? { routing } : {}),
    checks,
    ...(typeof v.checkedAt === 'string' ? { checkedAt: v.checkedAt } : {}),
    ...(connection ? { connection } : {}),
    ...(hostname ? { hostname } : {})
  }
}

/**
 * The site's own domains from a snapshot's `addressChange`: the one being connected, the connected
 * ones, then the reservations that lapsed. Each list is held to its own state: an entry of `lapsed`
 * that does not say `lapsed` is not one, and nothing outside it is read as lapsed.
 */
export function ownDomainsOf(addressChange: unknown): OwnDomain[] {
  if (typeof addressChange !== 'object' || addressChange === null) return []
  const a = addressChange as Record<string, unknown>
  const found: OwnDomain[] = []
  const lists: [unknown[], (domain: OwnDomain) => boolean][] = [
    [[a.pending], (domain) => domain.state === 'pending'],
    [Array.isArray(a.connected) ? a.connected : [], (domain) => domain.state === 'connected'],
    [Array.isArray(a.lapsed) ? a.lapsed : [], (domain) => domain.state === 'lapsed']
  ]
  for (const [list, fits] of lists) {
    for (const raw of list) {
      const domain = readOwnDomain(raw)
      if (domain !== null && fits(domain) && !found.some((known) => known.name === domain.name))
        found.push(domain)
    }
  }
  return found
}

/**
 * The one state a domain's card names, from what the server read back and nothing else:
 *   `removing`    a removal of this domain is running
 *   `connecting`  a publish that carries this domain is running
 *   `cleanup`     a removal (or a back-to-draft) did not take the domain out: it may still open the site
 *   `failed`      the site went live and the host did not say it connected the domain
 *   `live`        connected, on a published site
 *   `connected`   connected, on a site that is not published (between a draft and its cleanup)
 *   `unreachable` the host installed the domain's route, and the domain asked over HTTPS did not
 *                 answer as this site (`connection.error` says why)
 *   `opening`     the route is installed and the domain is being asked; no answer yet
 *   `verified`    the ownership record was found right at the last check — what the server connects
 *                 on; the routing record is a diagnostic, and may read anything
 *   `wrong`       the ownership record was found with another value
 *   `unknown`     the ownership lookup gave no usable answer
 *   `waiting`     the ownership record was not found, or nothing was looked up yet
 * A server older than the HTTPS probe sends no `connection`: the last four then read over BOTH
 * records, as they always did (`verified` = both right, `wrong` = either found with another value).
 *   `unsupported` it can never be connected as it is (a bare domain, or a name the server no longer
 *                 takes, reserved before that was refused)
 *   `lapsed`      the reservation let its name go: its ownership was not proven in time
 */
export type DomainState =
  | 'removing'
  | 'connecting'
  | 'cleanup'
  | 'failed'
  | 'live'
  | 'connected'
  | 'unreachable'
  | 'opening'
  | 'verified'
  | 'wrong'
  | 'unknown'
  | 'waiting'
  | 'unsupported'
  | 'lapsed'

export function domainState(domain: OwnDomain, publishing: Publishing | null): DomainState {
  // No operation carries a lapsed reservation: it is not the site's any more.
  if (domain.state === 'lapsed') return 'lapsed'
  const operation = publishing?.operation ?? null
  const mine = operation !== null && operation.domains.includes(domain.name)
  // Any problem the server names for a pending domain: a bare domain, or a name under a suffix the
  // server cannot tell is a registered one — Check DNS refuses either, so neither may offer it.
  const unsupported = domain.state !== 'connected' && domain.problem !== undefined
  if (mine && operation.state === 'running') {
    if (operation.op === 'drop-domain' || operation.op === 'draft') return 'removing'
    return 'connecting'
  }
  if (mine && operation.state === 'failed') {
    if (operation.op !== 'live' && operation.code === 'DOMAIN_STILL_ROUTED') return 'cleanup'
    if (operation.op === 'drop-domain') return 'cleanup'
    // A bare domain is not asked to connect again: it says why, and Remove (which takes it off the
    // host first when an operation handed it there) is its way out.
    if (operation.op === 'live' && domain.state !== 'connected') return unsupported ? 'unsupported' : 'failed'
  }
  if (domain.state === 'connected') return publishing?.publish === 'published' ? 'live' : 'connected'
  if (unsupported) return 'unsupported'
  const connection = domain.connection
  if (connection !== undefined) {
    if (connection.status === 'failed') return 'unreachable'
    if (connection.status === 'waiting') return 'opening'
    // The server connects a domain on its ownership record alone: a routing record that is not the
    // one Tracy names can be right for a domain that opens the site by another route.
    const ownership = domain.checks.find((check) => check.record === 'ownership')?.status
    if (ownership === 'ok') return 'verified'
    if (ownership === 'wrong') return 'wrong'
    if (ownership === 'unknown') return 'unknown'
    return 'waiting'
  }
  const statuses = domain.checks.map((check) => check.status)
  if (statuses.includes('wrong')) return 'wrong'
  if (statuses.length > 0 && statuses.every((status) => status === 'ok')) return 'verified'
  if (statuses.includes('unknown')) return 'unknown'
  return 'waiting'
}

/**
 * Why the domain did not answer as this site, as the key of its sentence. Codes: `apps/tracy-web`
 * `sites/domain-probe.js`. A code this screen does not know reads as the generic reason — never as
 * the code itself.
 */
export function unreachableReasonKey(error: string | undefined): string {
  switch (error) {
    case 'DNS_NXDOMAIN':
    case 'DNS_NO_ADDRESS':
    case 'DNS_TIMEOUT':
    case 'DNS_FAILED':
      return 'domains.unreachable.dns'
    case 'ADDRESS_NOT_PUBLIC':
      return 'domains.unreachable.address'
    case 'TLS_INVALID':
      return 'domains.unreachable.certificate'
    case 'CONNECT_FAILED':
    case 'TIMEOUT':
      return 'domains.unreachable.connect'
    case 'REDIRECT':
    case 'HTTP_STATUS':
    case 'EMPTY':
    case 'TOO_LARGE':
    case 'WRONG_ANSWER':
    case 'PAGE_NOT_SITE':
      return 'domains.unreachable.otherSite'
    case 'SITE_NOT_ANSWERING':
    case 'PAGE_EMPTY':
    case 'PAGE_INCOMPLETE':
    case 'PAGE_TOO_LARGE':
      return 'domains.unreachable.siteDown'
    case 'PAGE_REDIRECT':
      return 'domains.unreachable.redirect'
    // The registration that serves the name with its certificate (Cloudflare for SaaS, #1037).
    case 'HOSTNAME_PREPARING':
    case 'HOSTNAME_PENDING':
    case 'HOSTNAME_UNCONFIRMED':
      return 'domains.unreachable.hostnamePending'
    case 'CERT_PENDING':
      return 'domains.unreachable.certificatePending'
    case 'HOSTNAME_FAILED':
    case 'CERT_FAILED':
      return 'domains.unreachable.hostnameFailed'
    case 'HOSTNAME_CONFLICT':
      return 'domains.unreachable.hostnameTaken'
    // The last read of the registration failed: what was read before it is not believed.
    case 'HOSTNAME_UNREAD':
      return 'domains.unreachable.hostnameUnread'
    default:
      return 'domains.unreachable.generic'
  }
}

/** One compact row: what it is, what it says, and the admin page that changes it (or none). */
export interface SettingRow {
  key: string
  label: string
  value: string
  href: string | null
}

/** A stored value in the reader's words: booleans, WordPress's homepage kinds and empty values. */
export function formatSetting(
  t: Translate,
  key: string,
  value: string | number | boolean | undefined
): string {
  if (value === undefined) return t('settings.unavailable')
  if (typeof value === 'boolean') return t(value ? 'settings.enabled' : 'settings.disabled')
  if (key === 'homepage' && ['page', 'posts'].includes(String(value))) return t(`settings.homepage.${value}`)
  if (key === 'permalinks' && value === '') return t('settings.plain')
  return String(value) || t('settings.notSet')
}

/** The CMS admin first, then the platform's own rows in their fixed order. */
export function settingRows(snapshot: Snapshot, t: Translate): SettingRow[] {
  const name = cmsNames[snapshot.platform] ?? ''
  const base = snapshot.siteUrl ? snapshot.siteUrl.replace(/\/?$/, '/') : null
  const admin: SettingRow = {
    key: 'admin',
    label: t('settings.admin'),
    value: snapshot.adminUrl ?? t('settings.unavailable'),
    href: snapshot.adminUrl
  }
  return [
    admin,
    ...(rows[snapshot.platform] ?? []).map(([key, path]) => ({
      key,
      label: key === 'version' ? t('settings.version', { cms: name }) : t(`settings.${key}`),
      value: formatSetting(t, key, snapshot.values[key]),
      href: base ? new URL(path, base).href : null
    }))
  ]
}

/**
 * The header: the site's own title when the CMS answered, else the name it is shown by in Tracy;
 * under it the CMS and its version ("Joomla 6.1.1"), or the CMS alone when the version is unknown.
 */
export function siteSummary(snapshot: Snapshot, siteKey: string): { name: string; sub: string } {
  const title = snapshot.values.title
  const name = typeof title === 'string' && title.trim() ? title : (snapshot.displayName ?? siteKey)
  const cms = cmsNames[snapshot.platform] ?? snapshot.platform
  const version = snapshot.values.version
  return { name, sub: version === undefined || version === '' ? cms : `${cms} ${version}` }
}
