/**
 * The seat book's refusals, as the string key of a sentence with a next step (#796).
 *
 * Until 03/10/2026 three screens each kept their own short list and let every code they did not
 * name fall to one generic line: the invite wizard showed "Refused, nothing changed" for all three
 * per-site codes, the Team tab told a person whose session had ended that "the seat book could not
 * complete that", and the address form said "could not complete this request" for a site that no
 * longer exists. The codes are few and each means one thing, so each gets its own sentence.
 *
 * Pure functions returning KEYS, not text: the two plugins that mount these screens own the words
 * (`strings.ts` + the locale packages), and a key is what a test can pin without a translator.
 * A code nobody named still gets the screen's generic sentence — never the code itself — and that
 * sentence names a next step and no internal part of Tracy.
 */

/**
 * What to do about one site's refusal in an invite run (`POST /api/team/invite`,
 * `results[].sites[].code`), for the four codes the door puts on a refused site. The wizard reads
 * a refusal with any other code as an answer it cannot vouch for, so there is nothing to name here.
 */
export function inviteRefusalKey(code: unknown): string | null {
  // The viewer may invite an Editor, but not at this role.
  if (code === 'NOT_SITE_OWNER') return 'outcome.next.notSiteOwner'
  // The viewer is a Viewer on that site, and a Viewer invites nobody (ADR 0028).
  if (code === 'NOT_SITE_EDITOR') return 'outcome.next.notSiteEditor'
  // The viewer holds no accepted seat on that site.
  if (code === 'SEAT_NOT_AUTHORIZED') return 'outcome.next.notAuthorized'
  // The invitee's seat changed under the write (accepted, revoked or re-invited meanwhile).
  if (code === 'GRANT_UNKNOWN') return 'outcome.next.changed'
  return null
}

/**
 * A code is read ONLY on the status its door sends it with. Any other pairing — `404
 * NOT_SIGNED_IN`, `401 NOT_SITE_OWNER`, a 5xx naming anything — is not an answer of that door (a
 * layer in front of it wrote it, or the body is not its own), so the answer is read by its status
 * alone and the code decides nothing. One rule for every reader below, instead of a list of codes
 * each of them trusted on any status.
 */
type Pairs = Readonly<Record<number, Readonly<Record<string, string>>>>

function named(pairs: Pairs, status: number, code: unknown): string | null {
  if (typeof code !== 'string' || !Object.hasOwn(pairs, status)) return null
  const codes = pairs[status]
  return Object.hasOwn(codes, code) ? codes[code] : null
}

/**
 * A 5xx is a door that failed, not one that refused: it can arrive after part of the work was
 * written, so a failed write is never told as a clean refusal.
 */
const doorFailed = (status: number): boolean => status >= 500

/** What `PATCH|DELETE /api/sites/:key/seats/:grant` answers (`apps/tracy-web/src/seats/route.js`). */
const TEAM_WRITE_REFUSALS: Pairs = {
  401: { NOT_SIGNED_IN: 'error.signedOut' },
  403: {
    NOT_SITE_OWNER: 'error.notSiteOwner',
    CANNOT_REVOKE_LAST_OWNER: 'error.lastOwner',
    CANNOT_REVOKE_SELF: 'error.self',
    // No seat at all any more: not a question of role, so not `error.notSiteOwner`.
    SEAT_NOT_AUTHORIZED: 'error.noSeat'
  },
  404: { GRANT_UNKNOWN: 'error.gone' },
  // The row is no longer in the state the press was about (an invitation accepted while its
  // dialog said "Cancel invitation"): nothing was done, and the refreshed list shows it as it is.
  409: { SEAT_STATE_CHANGED: 'error.changed' }
}

/**
 * Why a write on one seat was refused; an answer no pair names is read by its status alone. Only a
 * 401 and a 429 mean one thing whatever they carry. A 403 has four reasons at this door and a 404
 * two (the seat, the site), so without the door's own code neither is guessed: the reader gets the
 * sentence that claims no reason and asks for a reload, which shows what is current.
 */
export function teamWriteErrorKey(status: number, code: unknown): string {
  const key = named(TEAM_WRITE_REFUSALS, status, code)
  if (key !== null) return key
  if (status === 401) return 'error.signedOut'
  if (status === 429) return 'error.rateLimited'
  // `error.failed` asks for a reload before a retry, which is what an unknown outcome needs.
  return 'error.failed'
}

/** What `POST /api/sites/:key/seats/:grant/edit-access` answers when it refuses (ADR 0028 §6). */
const EDIT_ACCESS_REFUSALS: Pairs = {
  401: { NOT_SIGNED_IN: 'error.signedOut' },
  403: { NOT_SITE_OWNER: 'error.notSiteOwner', SEAT_NOT_AUTHORIZED: 'error.noSeat' },
  404: { GRANT_UNKNOWN: 'error.gone' },
  // Nothing is waiting any more: another Owner answered, or the request was never there.
  409: { NO_EDIT_REQUEST: 'error.editRequestGone' }
}

/**
 * Why an Owner's answer to a request for edit access was refused; read like `teamWriteErrorKey`.
 * A 400 is this screen sending a wrong body, so it gets the generic sentence.
 */
export function editAccessErrorKey(status: number, code: unknown): string {
  const key = named(EDIT_ACCESS_REFUSALS, status, code)
  if (key !== null) return key
  if (status === 401) return 'error.signedOut'
  if (status === 429) return 'error.rateLimited'
  return 'error.failed'
}

const ADDRESS_ERRORS: Readonly<Record<string, string>> = {
  INVALID_SITE_KEY: 'invalid',
  NAME_TAKEN: 'taken',
  NOT_SITE_OWNER: 'ownerOnly',
  ADDRESS_CHANGE_BUSY: 'busy',
  ADDRESS_APPLY_FAILED: 'applyFailed',
  WP_ADDRESS_CONSTANT: 'wpAddressConstant',
  ADDRESS_PROBE_FAILED: 'probeFailed',
  ADDRESS_ROLLBACK_FAILED: 'rollbackFailed',
  SITE_UNKNOWN: 'siteUnknown',
  SITE_NOT_READY: 'notReady',
  NAME_NOT_RESERVED: 'notReserved',
  DOMAIN_NOT_BARE: 'notBare',
  DOMAIN_IS_TRACY: 'isTracy',
  ADDRESS_NOT_TRACY: 'notTracy',
  DOMAIN_TOO_LONG: 'tooLong',
  DOMAIN_LIMIT: 'limit',
  // A registrable domain itself: the sentence names the subdomain to enter instead.
  DOMAIN_APEX_UNSUPPORTED: 'apex',
  // The operator turned `site-connect-domain` off: nothing new is started.
  OWN_DOMAIN_DISABLED: 'ownDomainOff',
  // The reservation was not proven within its hold and no longer holds the name.
  RESERVATION_LAPSED: 'lapsed',
  // This server has no Cloudflare for SaaS configured: no new domain can be connected here.
  OWN_DOMAIN_UNAVAILABLE: 'ownDomainUnavailable',
  // The name's earlier registration is still being deleted: it can be reserved again shortly.
  DOMAIN_RELEASING: 'releasing',
  // A publish, a draft or a domain removal holds the site (`DELETE …/address/domain`).
  PUBLISH_BUSY: 'busy',
  NOT_SIGNED_IN: 'signedOut',
  SEAT_NOT_AUTHORIZED: 'noAccess'
}

/**
 * What the address door itself answers on a failed apply: always 502 (`sites/address.js`), with
 * one of these codes. The same code on another 5xx is not the door's answer.
 */
const ADDRESS_FAILURE_STATUS = 502
const ADDRESS_FAILURES: ReadonlySet<string> = new Set([
  'ADDRESS_APPLY_FAILED',
  'ADDRESS_PROBE_FAILED',
  'ADDRESS_ROLLBACK_FAILED'
])

/**
 * The host's own reasons that tell the person what to do, by the code the door sends them under.
 * A reason is read ONLY beside that code, on that status: the body of any other failed answer is
 * not the door's considered one, whatever it carries.
 */
const ADDRESS_REASONS: Readonly<Record<string, ReadonlySet<string>>> = {
  ADDRESS_APPLY_FAILED: new Set(['WP_ADDRESS_CONSTANT'])
}

/**
 * The refusals the address door gives before it changes anything, by the status it sends them
 * with (`apps/tracy-web/src/sites/address.js`, and `requireGrant` in front of it).
 */
const ADDRESS_REFUSALS: Readonly<Record<number, ReadonlySet<string>>> = {
  400: new Set([
    'INVALID_SITE_KEY',
    'DOMAIN_NOT_BARE',
    'DOMAIN_TOO_LONG',
    'DOMAIN_IS_TRACY',
    'ADDRESS_NOT_TRACY',
    'DOMAIN_APEX_UNSUPPORTED'
  ]),
  401: new Set(['NOT_SIGNED_IN']),
  403: new Set(['SEAT_NOT_AUTHORIZED', 'NOT_SITE_OWNER', 'OWN_DOMAIN_DISABLED']),
  404: new Set(['SITE_UNKNOWN', 'NAME_NOT_RESERVED']),
  409: new Set([
    'ADDRESS_CHANGE_BUSY',
    'NAME_TAKEN',
    'SITE_NOT_READY',
    'DOMAIN_LIMIT',
    'PUBLISH_BUSY',
    'RESERVATION_LAPSED',
    'DOMAIN_RELEASING'
  ]),
  // Not a failure of the door: the server has nothing to connect a domain through.
  503: new Set(['OWN_DOMAIN_UNAVAILABLE'])
}

/**
 * The code to explain for an address answer that was not a success. Only the exact pairs the door
 * sends are read: a 5xx as one of its named failures (502 with one of `ADDRESS_FAILURES`, and its
 * `reason` where that says more), a 4xx as one of `ADDRESS_REFUSALS` on its own status. Any other
 * pairing (`NOT_SIGNED_IN` on a 404 or from a broken layer in front of the door, `NAME_TAKEN` on a
 * 401) is not its considered answer: a 401 is the ended session whatever it carries, and the rest
 * reads as the unnamed failure.
 */
export function addressRefusalCode(status: number, code: unknown, reason?: unknown): string {
  if (doorFailed(status) && !(status === 503 && code === 'OWN_DOMAIN_UNAVAILABLE')) {
    if (status !== ADDRESS_FAILURE_STATUS || typeof code !== 'string' || !ADDRESS_FAILURES.has(code)) {
      return 'FAILED'
    }
    return typeof reason === 'string' && ADDRESS_REASONS[code]?.has(reason) ? reason : code
  }
  if (
    typeof code === 'string' &&
    Object.hasOwn(ADDRESS_REFUSALS, status) &&
    ADDRESS_REFUSALS[status].has(code)
  ) {
    return code
  }
  return status === 401 ? 'NOT_SIGNED_IN' : 'FAILED'
}

/** Why the address door refused (`/api/sites/:key/address*`); `settings.url.failed` when unnamed. */
export function addressErrorKey(code: unknown): string {
  const named =
    typeof code === 'string' && Object.hasOwn(ADDRESS_ERRORS, code) ? ADDRESS_ERRORS[code] : 'failed'
  return `settings.url.${named}`
}
