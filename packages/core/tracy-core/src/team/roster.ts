/**
 * The seat book's rules, ported from `tracy-desk` (`src/renderer/components/seats/seatRoster.ts`)
 * so the two surfaces of one product offer the same actions for the same row. Pure data and
 * predicates — no React, no fetch — so the rules can be read in one place and tested without a
 * browser.
 *
 * Every predicate here encodes exactly what `workers/seat-registry` enforces: the tab must never
 * draw an action the registry would refuse, because a button that answers 403 is worse than no
 * button.
 */

import type { Translate } from './translate'

export type SeatRole = 'owner' | 'editor' | 'viewer'
export type InvitableRole = Exclude<SeatRole, 'owner'>
export type SeatStatus = 'active' | 'invited' | 'revoked' | 'declined'
/** The three ways an administrator takes a row off the book — one press each (#792). */
export type RemovalKind = 'revoke' | 'cancel_invite' | 'decline_request'

/** One row of a site's book, as `GET /api/team` returns it (the registry's `rosterRow`). */
export interface SeatRow {
  id: string
  email: string | null
  displayName: string | null
  /**
   * The person's face, decided by the server (`personFace`, `apps/tracy-web/src/lib/person-face.js`)
   * and only drawn here: one letter, on the colour of their ACCOUNT, the same on every surface.
   */
  initial: string
  color: string
  /** The account's photo (`account.avatar_url`); null while nobody has one. */
  avatarUrl?: string | null
  role: SeatRole
  status: SeatStatus
  grantedAt: string | null
  /** The granter's ACCOUNT ID — compare with it, never print it. */
  grantedBy: string | null
  /** The granter's email, what the access line names; absent from a server older than 29/09. */
  grantedByEmail?: string | null
  revokedAt: string | null
  /**
   * Which act closed a `revoked` row. Null when the book does not say (closed before #792, or by
   * its holder leaving); absent from a server older than #792. Never guessed here.
   */
  /** How a closed row was closed: one of the three removals, or `left` (its holder gave it up). */
  removalKind?: RemovalKind | 'left' | null
  /** Set when the person asked to join rather than being invited (ADR 0067 §7). */
  requestedAt: string | null
  /**
   * A Viewer's request for edit access, waiting on the Owners (ADR 0028 §6), or null. Separate from
   * `requestedAt`, which stays set on a row that began as a join request. Absent from an older server.
   */
  editRequestedAt?: string | null
  scope: 'site' | 'workspace'
}

/** One site with its book, as `GET /api/team` returns it. */
export interface TeamSite {
  siteKey: string
  platform: string | null
  myRole: SeatRole | null
  status: string
  /** `null` when the book could not be read — the seat is not accepted, or the registry refused. */
  seats: SeatRow[] | null
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Roles retired by ADR 0028 and what each became (`RETIRED_ROLES` in
 * `apps/tracy-web/src/seats/roles.js`). tracy-web and the dsh image deploy apart, so a tab may
 * still meet one from an older server; it is read as its successor, never printed raw.
 */
const RETIRED_ROLES: Readonly<Record<string, SeatRole>> = { admin: 'editor', developer: 'editor' }
const ROLES: readonly SeatRole[] = ['owner', 'editor', 'viewer']

/**
 * A current role for any role word, or null when it is not a seat role at all. Exact words only:
 * `Owner` or `EDITOR` is not a role the seat book writes.
 * @param role - a role as a server sent it.
 */
export function seatRoleOf(role: string | null | undefined): SeatRole | null {
  if (typeof role !== 'string') return null
  if ((ROLES as readonly string[]).includes(role)) return role as SeatRole
  return Object.hasOwn(RETIRED_ROLES, role) ? (RETIRED_ROLES[role] as SeatRole) : null
}

/**
 * The translation key of a role's name (`role.owner`, `role.editor`, `role.viewer`), or null for
 * a word that is not a role. Every surface prints a role through this, never the raw code.
 */
export const roleLabelKey = (role: string | null | undefined): string | null => {
  const known = seatRoleOf(role)
  return known === null ? null : `role.${known}`
}

/** The order the wizard offers roles in — Editor first, the default pick (ADR 0028). */
export const INVITABLE_ROLES: readonly InvitableRole[] = ['editor', 'viewer']

/** Only an Owner changes a site's book: role changes, removals, approving a request (ADR 0028 §5). */
export const runsSite = (role: string | null | undefined): boolean => seatRoleOf(role) === 'owner'

/** An Owner or an Editor: changes the site through Tracy, publishes, restores, invites. */
export const editsSite = (role: string | null | undefined): boolean => {
  const known = seatRoleOf(role)
  return known === 'owner' || known === 'editor'
}

/** A Viewer: sees the site and its changes, comments, asks the agent; changes nothing. */
export const viewsOnly = (role: string | null | undefined): boolean => seatRoleOf(role) === 'viewer'

const NO_ROLES: readonly InvitableRole[] = []

/**
 * Who may invite whom — the screen's ONE description of the rule `POST /api/team/invite` enforces
 * (`refusalFor`, `apps/tracy-web/src/seats/route.js`): an Owner or an Editor may invite a Viewer
 * or an Editor; a Viewer invites nobody; an Owner is never invited (ADR 0028 §4–5). The Invite
 * control, the sites the wizard lists and the roles it offers all read this, so they cannot drift
 * apart (#798).
 *
 * `role` must be the role of an ACCEPTED seat: a pending, revoked or declined seat invites nobody
 * at the door, and the caller says so by passing `null`. A word the seat book does not have gets
 * nothing either.
 * @param role - the viewer's accepted role on one site, or null/undefined when there is none.
 * @returns the roles that seat may invite, Editor first; empty when it may not invite.
 */
export const inviteRolesFor = (role: string | null | undefined): readonly InvitableRole[] =>
  editsSite(role) ? INVITABLE_ROLES : NO_ROLES

/** Whether an accepted seat of this role is offered Invite at all. */
export const canInvite = (role: string | null | undefined): boolean => inviteRolesFor(role).length > 0

/**
 * The role the viewer invites with on one site of a `GET /api/team` answer, or null when that
 * answer does not establish an accepted seat there: the seat is still pending, its book could not
 * be read, or it carries a role that invites nobody. A site the answer does not list (the seat was
 * revoked or declined) has no row to pass, which is null as well.
 * @param site - the site's row in the answer just read, or undefined when it has none.
 */
export const acceptedInviteRole = (site: TeamSite | null | undefined): SeatRole | null =>
  site != null && site.status === 'accepted' && site.seats !== null && canInvite(site.myRole)
    ? seatRoleOf(site.myRole)
    : null

/**
 * The roles ONE invitation may carry to several sites: those every site would accept, since the
 * wizard sends one role to all of them. No site, or one site that accepts nothing, is no role.
 * @param roles - the viewer's accepted role on each selected site.
 */
export const inviteRolesAcross = (roles: readonly (string | null | undefined)[]): readonly InvitableRole[] =>
  roles.length === 0
    ? NO_ROLES
    : INVITABLE_ROLES.filter((invited) => roles.every((role) => inviteRolesFor(role).includes(invited)))

/**
 * Somebody who ASKED to be let in, as opposed to somebody an admin invited.
 *
 * The registry sends both as `invited` and `requestedAt` is the only field that separates them.
 * They need opposite things from whoever reads the row: one is waiting on a decision here, the
 * other on a reply elsewhere.
 */
export const isJoinRequest = (seat: Pick<SeatRow, 'status' | 'requestedAt'>): boolean =>
  seat.status === 'invited' && seat.requestedAt != null

/**
 * A live Viewer who asked for edit access and has no answer yet (ADR 0028 §6). The row is a member
 * already; only its role is in question.
 */
export const isEditRequest = (seat: Pick<SeatRow, 'status' | 'role' | 'editRequestedAt'>): boolean =>
  seat.status === 'active' && seatRoleOf(seat.role) === 'viewer' && seat.editRequestedAt != null

/**
 * A seat that counts as a member of the site: an active one, or an invitation an administrator
 * sent. Somebody who only ASKED to join is not one yet, and a revoked or declined row is not one
 * any more.
 */
export const isMember = (seat: Pick<SeatRow, 'status' | 'requestedAt'>): boolean =>
  seat.status === 'active' || (seat.status === 'invited' && !isJoinRequest(seat))

/** What a people cluster says about one site's book. */
export interface Cluster<S> {
  /** Every member, the viewer included — counted straight, never "the others + 1". */
  count: number
  /** Up to three members other than the viewer, in the book's order. */
  faces: S[]
  /** The viewer is known and is the site's only member. */
  onlyYou: boolean
}

/**
 * The count, the faces and "only you" of one site's people cluster (the My Sites row and the Team
 * start card read the same answer).
 *
 * The number never depends on knowing who is looking: until `/auth/me` answers, the viewer is
 * counted like anybody else (they are a member), their face may stand among the three, and "only
 * you" is never said — it is a claim about the viewer, and the viewer is not known yet.
 * @param seats - the site's book as `GET /api/team` returns it; null when it could not be read.
 * @param viewerEmail - the signed-in person's address, or null while it is not known.
 * @returns null for an unread book: the cluster says nothing rather than a number it does not have.
 */
export function clusterOf<S extends Pick<SeatRow, 'status' | 'requestedAt' | 'email'>>(
  seats: readonly S[] | null,
  viewerEmail: string | null | undefined
): Cluster<S> | null {
  if (seats === null) return null
  const members = seats.filter(isMember)
  const viewer = viewerEmail?.trim().toLowerCase() || null
  const isViewer = (seat: S): boolean => viewer !== null && seat.email?.trim().toLowerCase() === viewer
  const others = members.filter((seat) => !isViewer(seat))
  return {
    count: members.length,
    faces: others.slice(0, 3),
    onlyYou: viewer !== null && members.length === 1 && isViewer(members[0] as S)
  }
}

/** The order the Change role dialog lists roles in: Editor, Viewer, then Owner (ADR 0028). */
const ASSIGN_ORDER: readonly SeatRole[] = ['editor', 'viewer', 'owner']

/**
 * The roles the viewer may assign to this seat — empty means "no role change offered".
 *  - only `active` seats have a role to change;
 *  - only an Owner changes roles, and may make another Owner (ADR 0028 §5);
 *  - the last Owner cannot be demoted.
 * The viewer's own seat is excluded by the caller.
 */
export const assignableRoles = (
  viewerRole: SeatRole | null,
  seat: SeatRow,
  ownerCount: number
): SeatRole[] => {
  if (seat.status !== 'active') return []
  if (!runsSite(viewerRole)) return []
  if (seatRoleOf(seat.role) === 'owner' && ownerCount < 2) return []
  return [...ASSIGN_ORDER]
}

/** Which of the row's actions the seat book would accept for this viewer: every one is an Owner's. */
export function actionsFor(
  seat: SeatRow,
  viewer: { email: string | null; role: SeatRole | null },
  ownerCount: number
): { changeRole: boolean; reinvite: boolean; approve: boolean; answerEdit: boolean; remove: boolean } {
  const isYou = seat.email !== null && seat.email === viewer.email
  const revoked = seat.status === 'revoked'
  const declined = seat.status === 'declined'
  const canTouch = runsSite(viewer.role)
  const lastOwner = seatRoleOf(seat.role) === 'owner' && ownerCount < 2
  // A seat inherited from the workspace has no row in this site's book; every write here answers
  // 404 for it, so nothing is offered.
  const inherited = seat.scope === 'workspace'
  return {
    changeRole: !inherited && !isYou && assignableRoles(viewer.role, seat, ownerCount).length > 0,
    reinvite: !inherited && declined && canTouch && seat.email !== null,
    approve: !inherited && isJoinRequest(seat) && canTouch && seat.email !== null,
    // A Viewer's request for edit access: only an Owner answers it (ADR 0028 §6).
    answerEdit: !inherited && isEditRequest(seat) && canTouch && !isYou,
    remove: !inherited && canTouch && !revoked && !declined && !isYou && !lastOwner
  }
}

/**
 * One removal as the tab offers it: what the press is called, what the confirm step says will
 * happen, and the `kind` the write names. The label, the consequence and the kind are ONE entry, so
 * a dialog can never say one act and send another.
 */
export interface Removal {
  kind: RemovalKind
  labelKey: 'action.revoke' | 'action.cancelInvite' | 'action.declineRequest'
  consequenceKey:
    | 'dialog.revokeConsequence'
    | 'dialog.cancelInviteConsequence'
    | 'dialog.declineRequestConsequence'
}

const REMOVALS: Readonly<Record<RemovalKind, Removal>> = {
  revoke: { kind: 'revoke', labelKey: 'action.revoke', consequenceKey: 'dialog.revokeConsequence' },
  cancel_invite: {
    kind: 'cancel_invite',
    labelKey: 'action.cancelInvite',
    consequenceKey: 'dialog.cancelInviteConsequence'
  },
  decline_request: {
    kind: 'decline_request',
    labelKey: 'action.declineRequest',
    consequenceKey: 'dialog.declineRequestConsequence'
  }
}

/**
 * The destructive action on a row — three acts, not one (#792): declining somebody who asked,
 * cancelling an invitation nobody answered, revoking a seat somebody holds. The seat book checks
 * the same three states (`removalKindOf` in `apps/tracy-web/src/seats/store.js`) and refuses a
 * kind that is not the one the row calls for.
 * @param seat - a row `actionsFor` offers `remove` on.
 */
export const removalOf = (seat: SeatRow): Removal =>
  REMOVALS[isJoinRequest(seat) ? 'decline_request' : seat.status === 'invited' ? 'cancel_invite' : 'revoke']

/** What the destructive action on a row is called. */
export const removeLabelKey = (seat: SeatRow): Removal['labelKey'] => removalOf(seat).labelKey

/**
 * How a `revoked` row is worded: by the act that closed it. A cancelled invitation and a declined
 * request are not revokes and are not printed as one. A row whose kind the book does not say, or
 * says in a word this build does not know, stays "Revoked" — the act is not guessed.
 * @param seat - a row whose `status` is `revoked`.
 */
export function closedAs(seat: Pick<SeatRow, 'removalKind'>): {
  statusKey: 'status.revoked' | 'status.inviteCancelled' | 'status.requestDeclined' | 'status.left'
  accessKey: 'access.revoked' | 'access.inviteCancelled' | 'access.requestDeclined' | 'access.left'
} {
  // The holder gave the seat up themselves (My Sites › Leave): not a removal (Akemi 04/10/2026).
  if (seat.removalKind === 'left') return { statusKey: 'status.left', accessKey: 'access.left' }
  if (seat.removalKind === 'cancel_invite')
    return { statusKey: 'status.inviteCancelled', accessKey: 'access.inviteCancelled' }
  if (seat.removalKind === 'decline_request')
    return { statusKey: 'status.requestDeclined', accessKey: 'access.requestDeclined' }
  return { statusKey: 'status.revoked', accessKey: 'access.revoked' }
}

export const nameOf = (seat: { displayName: string | null; email: string | null }): string =>
  seat.displayName ?? seat.email ?? ''

/**
 * What each role can do, as data (ADR 0028): each role adds to the one before it, and every row
 * is a permission the seat book enforces. The first rows are what every role holds, so the
 * legend never reads as "a Viewer can do nothing".
 */
export const PERMISSIONS: readonly { key: string; from: SeatRole }[] = [
  { key: 'permission.view', from: 'viewer' },
  { key: 'permission.commentAsk', from: 'viewer' },
  { key: 'permission.changeSite', from: 'editor' },
  { key: 'permission.publish', from: 'editor' },
  { key: 'permission.invite', from: 'editor' },
  { key: 'permission.manageRoster', from: 'owner' },
  { key: 'permission.domain', from: 'owner' },
  { key: 'permission.makeOwner', from: 'owner' },
  { key: 'permission.deleteSite', from: 'owner' }
]
const RANK: Record<SeatRole, number> = { viewer: 0, editor: 1, owner: 2 }
export const roleAllows = (role: SeatRole, from: SeatRole): boolean =>
  RANK[seatRoleOf(role) ?? 'viewer'] >= RANK[from]

/**
 * Relative-time phrases for `agoOf`, already resolved by `t`. Each unit is a whole phrase built
 * around the number ("{count} minutes ago", "vor {count} Minuten", "hace {count} minutos"), so a
 * language places the number where its grammar wants it; one singular and one plural per unit.
 */
export interface AgoUnits {
  justNow: string
  minute: (count: number) => string
  minutes: (count: number) => string
  hour: (count: number) => string
  hours: (count: number) => string
  day: (count: number) => string
  days: (count: number) => string
}

/**
 * "3 days ago" from an ISO stamp. The tab's `t` has no plural rules, so a count of one takes the
 * singular phrase: the plural alone printed "Granted 1 days ago" (29/09). The number is never
 * glued in front of a word here (02/10): "{n} <unit>" read wrong in every language that says
 * "vor 3 Tagen" or "il y a 3 jours".
 * @param iso - the registry's timestamp.
 * @param now - the moment to measure from.
 * @param unit - `t`-resolved phrases.
 */
export function agoOf(iso: string | null, now: number, unit: AgoUnits): string {
  const at = iso ? Date.parse(iso) : Number.NaN
  if (Number.isNaN(at)) return iso ?? ''
  const minutes = Math.max(0, Math.round((now - at) / 60000))
  if (minutes < 1) return unit.justNow
  if (minutes < 60) return (minutes === 1 ? unit.minute : unit.minutes)(minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return (hours === 1 ? unit.hour : unit.hours)(hours)
  const days = Math.round(hours / 24)
  return (days === 1 ? unit.day : unit.days)(days)
}

/**
 * `AgoUnits` from a tab's `t`: the seven `ago.*` keys every tab that shows an age ships.
 * @param t - the tab's translate function.
 */
export function agoUnitsOf(t: Translate): AgoUnits {
  return {
    justNow: t('ago.justNow'),
    minute: (count) => t('ago.minute', { count }),
    minutes: (count) => t('ago.minutes', { count }),
    hour: (count) => t('ago.hour', { count }),
    hours: (count) => t('ago.hours', { count }),
    day: (count) => t('ago.day', { count }),
    days: (count) => t('ago.days', { count })
  }
}

/** Split whatever was typed or pasted into addresses; what does not look like one is returned as `rest`. */
export function splitEmails(draft: string, known: readonly string[]): { good: string[]; rest: string } {
  const parts = draft
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  const good: string[] = []
  for (const part of parts) {
    if (EMAIL_PATTERN.test(part) && !known.includes(part) && !good.includes(part)) good.push(part)
  }
  return { good, rest: parts.filter((x) => !EMAIL_PATTERN.test(x)).join(' ') }
}

/**
 * What a link asked the tab to do (Lee, 04/09): `?open=my-sites&team=<siteKey>&member=<email>`.
 *
 * `open` names the tab; the other two are this tab's own — the book to open and the row to
 * mark. The Worker that mints such links (`workers/shared/team-invite.js`, `siteTeamUrl`) and
 * this reader agree on the names by test, not by convention.
 * @param search - `location.search`, with or without the leading `?`.
 * @returns the request, or `null` when the link did not ask for this tab.
 */
export function readDeepLink(search: string): { team: string | null; member: string | null } | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (params.get('open') !== 'my-sites') return null
  const team = params.get('team')?.trim().toLowerCase() || null
  const member = params.get('member')?.trim().toLowerCase() || null
  return { team, member }
}

/** The same `location.search`, with this tab's three parameters removed; `''` when nothing is left. */
export function stripDeepLink(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const key of ['open', 'team', 'member']) params.delete(key)
  const rest = params.toString()
  return rest === '' ? '' : `?${rest}`
}

/** Who the access line says gave a seat. */
export type Granter =
  | { kind: 'self' }
  | { kind: 'you' }
  | { kind: 'email'; email: string }
  | { kind: 'unknown' }
  | { kind: 'unsaid' }

/**
 * Who granted `seat`, as the Team tab words it (29/09: it printed the granter's account id —
 * "Granted 14 days ago by 14283358-185e-…"). By EMAIL, never by `grantedBy`, which is an id.
 * - `self`: the person granted their own seat (a site's first owner) — "Granted … ago".
 * - `you`: the viewer granted it — "Granted … by you".
 * - `email`: someone else did — "Granted … by <email>".
 * - `unknown`: the server says the granter is gone from the book (null).
 * - `unsaid`: the server is older than 29/09 and sends no email — "Granted … ago", naming nobody.
 *   tracy-web and the dsh image deploy apart, so a new tab can meet an old server.
 * @param seat - a roster row.
 * @param viewerEmail - the person looking at the tab.
 */
export function granterOf(
  seat: Pick<SeatRow, 'email' | 'grantedByEmail'>,
  viewerEmail: string | null
): Granter {
  if (seat.grantedByEmail === undefined) return { kind: 'unsaid' }
  const by = seat.grantedByEmail
  if (by === null) return { kind: 'unknown' }
  if (seat.email !== null && by === seat.email) return { kind: 'self' }
  if (viewerEmail !== null && by === viewerEmail) return { kind: 'you' }
  return { kind: 'email', email: by }
}

/**
 * Approving a join request (Akemi 04/10/2026): the person joins at once, in the role the approver
 * picks, Editor first (the default pick) or Viewer. Only an Owner approves (ADR 0028 §5).
 * @param viewerRole - the approver's accepted role on the site.
 */
export function approveRolesFor(viewerRole: string | null | undefined): readonly InvitableRole[] {
  return runsSite(viewerRole) ? INVITABLE_ROLES : NO_ROLES
}

/**
 * The approve call. It is the invite door for that one address and site: the seat book sees the
 * open request and grants the seat, accepted, with "You now have access" and no invitation mail
 * (`admitToSite` → `approveSiteJoinRequest` in apps/tracy-web/src/seats).
 */
export function approveRequestInit({
  siteKey,
  email,
  role
}: {
  siteKey: string
  email: string
  role: InvitableRole
}): { method: 'POST'; credentials: 'same-origin'; headers: Record<string, string>; body: string } {
  return {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ emails: [email], role, siteKeys: [siteKey] })
  }
}

/** What the door did for that site: `approved` when the seat was granted, else its own word. */
export function approvalOutcome(body: unknown, siteKey: string): string {
  const results = (body as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) return 'unknown'
  for (const result of results) {
    const sites = (result as { sites?: unknown } | null)?.sites
    if (!Array.isArray(sites)) continue
    for (const site of sites) {
      const s = site as { siteKey?: unknown; outcome?: unknown } | null
      if (s?.siteKey === siteKey && typeof s.outcome === 'string') return s.outcome
    }
  }
  return 'unknown'
}

/** An Owner's answer to a request for edit access: approve makes the Viewer an Editor. */
export type EditDecision = 'approve' | 'decline'

/**
 * The answer call, `POST /api/sites/:key/seats/:grant/edit-access` with exactly `{decision}`
 * (`apps/tracy-web/src/seats/route.js`). The door refuses any other field.
 */
export function editAccessAnswer({
  siteKey,
  seatId,
  decision
}: {
  siteKey: string
  seatId: string
  decision: EditDecision
}): {
  path: string
  init: { method: 'POST'; credentials: 'same-origin'; headers: Record<string, string>; body: string }
} {
  return {
    path: `/api/sites/${encodeURIComponent(siteKey)}/seats/${encodeURIComponent(seatId)}/edit-access`,
    init: {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ decision })
    }
  }
}
