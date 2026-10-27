import { opsFor } from '../lib/ops-signal.js'
/**
 * A site's team, on top of the seat book: My Sites, the roster, invitations by link, role
 * changes, leaving, and asking to join.
 *
 * Ported from two Workers that split this across a network hop — `workers/cowork-web/src/worker.js`
 * (`apiSites`, `apiTeam`, `apiTeamInvite`, `apiSeatGrant`, `apiAcceptInvitation`, `apiSiteLeave`,
 * `acceptInviteLink`) calling `workers/seat-registry/src/index.js` (`handleMySites`, `handleRoster`,
 * `handleTeamInvite`, `handleRosterRevoke`, `handleSetRole`, `handleGrantDecision`, `handleLeave`,
 * `handleSiteJoinRequest`, `handleTeamAccept`) over `env.SEATS.fetch(...)`. This app is one process
 * with one Postgres pool, so the two sides collapse into one handler each — same rules, same
 * response shapes, no round trip.
 *
 * ONE DEPARTURE FROM THE STORE'S OWN SHAPE, EVERYWHERE BELOW: `seat`'s primary key here is
 * `(site_key, account_id)` — there is no separate grant id. Wherever the Worker took a `grantId`
 * (a `/seats/:grantId` path segment, a roster row's `id`), this file uses `account_id` instead,
 * and the client already expects that (`TeamView.tsx` sends `seat.id` back verbatim, and Task 4's
 * brief records that `id` in a roster row IS `account_id`).
 *
 * `seatsOfSite` is NOT filtered by status — the store's own docstring says so, deliberately, so
 * the roster screen can show revoked/declined rows. `grantRowFor` below (this file's own, since
 * the store exports only `grantFor`, which filters to LIVE grants) is used everywhere a route
 * needs to see a row regardless of status — exactly where the Worker's own `grantRowFor` is used.
 */
import { Hono } from 'hono'
import { json, normalizeSiteKey, requireViewer, viewer as viewerOf } from '../lib/http.js'
import { importPendingKeys, importRecoveryPath } from '../lib/import-pending.js'
import { personFace } from '../lib/person-face.js'
import { overLimitOrClosed } from '../lib/rate.js'
import { requestLanguage, translate } from '../lib/i18n/index.js'
import { TEAM_MAX_EMAILS, TEAM_MAX_SITES, WRITE_LIMIT_PER_HOUR } from '../lib/policy.js'
import { siteSeatGrant } from '../lib/seat-grant.js'
import { renderedPage } from '../lib/security-headers.js'
import { bornSiteAddress } from '../lib/site-address.js'
import { publishingOf } from '../lib/site-publishing.js'
import {
  signTeamInvite,
  teamInviteAge,
  teamInviteDeclineUrl,
  teamInviteUrl,
  verifyTeamInvite
} from '../lib/team-invite.js'
import {
  declineInvitePage,
  expiredInvitePage,
  invalidInvitePage,
  inviteLandingPage,
  joinPage,
  messagePage,
  teamPage,
  tooManyRequestsPage,
  wrongAccountPage
} from './pages.js'
import { actingEditor, actingOwner, INVITABLE_ROLES, ROLES, toolsetsFor } from './roles.js'
import {
  acceptGrant,
  accountByEmail,
  answerEditAccess,
  approveSiteJoinRequest,
  declineGrant,
  displayNamesFor,
  emailsFor,
  enqueueSeatSync,
  ensureAccount,
  grantFor,
  grantSite,
  isRemovalKind,
  ownersOf,
  removalKindOf,
  requestEditAccess,
  requestSiteJoin,
  leaveGrant,
  revokeGrant,
  SeatStoreRejected,
  seatsOfSite,
  setGrantRole,
  sitesOfAccount,
  languagesByEmail
} from './store.js'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// `WRITE_LIMIT_PER_HOUR` is `lib/policy.js`'s — the Settings screen has to state the same number
// and `ops/` cannot import this domain. The Worker keys every one of these buckets by client IP;
// this app has no per-request IP wired through its routes yet, so each bucket below is keyed by
// whatever identifies the CALLER instead — a deliberate narrowing (a shared IP no longer shares a
// cap), not an oversight, and each call site says what it keyed by and why.

/** A seat row, any status — the store exports only `grantFor` (live grants only); this app's
 * write doors need to see revoked/declined/requested rows too, same as the Worker's own
 * `grantRowFor` does. Read-only, and scoped to this file: the store stays the one place seat rows
 * are WRITTEN. */
async function grantRowFor(pool, siteKey, accountId) {
  const { rows } = await pool.query('select * from seat where site_key = $1 and account_id = $2', [
    siteKey,
    accountId
  ])
  return rows[0] ?? null
}

/** An account's email, by id — the store has no such lookup (`displayNamesFor` is by id, but for
 * a NAME); `revokeSeatSessions` below needs the target's address to tell a dsh who to log out. */
async function accountEmailFor(pool, accountId) {
  const { rows } = await pool.query('select email from account where id = $1', [accountId])
  return rows[0]?.email ?? null
}

// ── Team notifications (spec #809, cases T1–T11 and T2b) ─────────────────────────────────────────
// Every write door below tells the people an event matters to through `notify` (bound in by
// `app.js`; this domain never imports `notifications/`). The notifier drops the actor itself, so a
// door may pass every candidate; the filters here only keep out people who are not on the team, or
// whom the spec names as excluded (the inviter of T7, the new member of T7). A notification never
// undoes or fails the write that caused it: `notify` swallows its own failures.

/** An account's address and name, by id, or null. */
async function accountFacts(pool, accountId) {
  if (!accountId) return null
  const { rows } = await pool.query('select id, email, display_name from account where id = $1', [accountId])
  return rows[0] ?? null
}

/** The people on a site's team right now: accepted seats, neither revoked nor declined. */
async function teamOf(pool, siteKey) {
  const book = await seatsOfSite(pool, siteKey)
  return book.filter((r) => r.accepted_at && !r.revoked_at && !r.declined_at)
}

/**
 * The people who answer a request to join (ADR 0028: Owners only — an Editor invites, but never
 * approves, changes roles or removes). Every request that waits on the site's Owners goes through
 * here, so a second kind of request (a Viewer asking for edit access, plan T5) reuses the same
 * recipients, the same `ref` shape and `announceJoinAnswer` rather than growing its own list.
 */
const isOwnerRow = (row) => row.role === 'owner'

/** The `ref` every Owner's row about one join request shares, so the first answer settles them all. */
const joinRef = (siteKey, requesterId) => `join:${siteKey}:${requesterId}`

/**
 * The `ref` every Owner's row about one Viewer's request for edit access shares (ADR 0028 §6): the
 * same recipients and the same settle-on-first-answer as a join request, under its own ref so a
 * person who once asked to join and later asks for edit access has two separate threads.
 */
const editRef = (siteKey, requesterId) => `edit:${siteKey}:${requesterId}`

/** The `ref` of the invitee's own "invited you" row: settled once they answer, so the Inbox stops offering Accept / Decline. */
const inviteRef = (siteKey, inviteeId) => `invite:${siteKey}:${inviteeId}`

/**
 * The address Tracy's mail comes from, as the "Request sent" tip names it (spam hints D1): the
 * address inside `MAIL_FROM` ("Tracy <noreply@…>"), or '' when mail is the console (local preview).
 */
const mailSender = (config) => {
  const from = config?.mail?.from
  if (typeof from !== 'string') return ''
  return (
    from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? (/^[^\s<>]+@[^\s<>]+$/.test(from.trim()) ? from.trim() : '')
  )
}

/**
 * T5 + T7: an invitation was accepted. The inviter hears it (T5); every other teammate hears that
 * someone joined (T7), except the new member and the inviter, who already got T5.
 * @param {object} row - the seat row after acceptance (`granted_by` is the inviter).
 */
async function announceAccepted(pool, notify, siteKey, memberId, row, settle = async () => 0) {
  await settle(inviteRef(siteKey, memberId), { outcome: 'accepted' })
  const inviterId = row.granted_by && row.granted_by !== memberId ? row.granted_by : null
  if (inviterId) {
    await notify({
      recipients: [inviterId],
      kind: 'team.invite_accepted',
      siteKey,
      actor: memberId,
      data: { role: row.role }
    })
  }
  const inviter = await accountFacts(pool, inviterId)
  const team = await teamOf(pool, siteKey)
  await notify({
    recipients: team.map((r) => r.account_id).filter((id) => id !== memberId && id !== inviterId),
    kind: 'team.joined',
    siteKey,
    actor: memberId,
    data: {
      role: row.role,
      ...(inviter ? { inviterName: inviter.display_name ?? null, inviterEmail: inviter.email } : {})
    }
  })
}

/**
 * T2b + T3/T4: an Owner answered a join request. The other Owners' rows about
 * it close (`settle`), they hear who answered (T2b), and the requester hears the answer: "You now
 * have access" (T3, never the invitation mail) or "declined" (T4). An approval is also a new
 * teammate (T7), for everyone except the new member and the approver.
 */
async function announceJoinAnswer(pool, deps, { siteKey, requesterId, answeredBy, decision, role }) {
  const { notify, settle } = deps
  // Every Owner's request row settles with how it ended, so Team updates reads
  // "… · Approved" / "… · Declined" (04/10/2026).
  await settle(joinRef(siteKey, requesterId), { outcome: decision === 'approved' ? 'approved' : 'declined' })
  const requester = await accountFacts(pool, requesterId)
  const team = await teamOf(pool, siteKey)
  await notify({
    recipients: team.filter((r) => isOwnerRow(r) && r.account_id !== requesterId).map((r) => r.account_id),
    kind: 'team.join_answered',
    siteKey,
    actor: answeredBy,
    data: {
      decision,
      // The display name only: a letter names a nameless person by the local part of the address.
      requesterName: requester?.display_name ?? null,
      requesterEmail: requester?.email ?? null,
      role
    }
  })
  if (decision !== 'approved') {
    await notify({ recipients: [requesterId], kind: 'team.declined', siteKey, actor: answeredBy })
    return
  }
  const written = await notify({
    recipients: [requesterId],
    kind: 'team.approved',
    siteKey,
    actor: answeredBy,
    data: { role }
  })
  await notify({
    recipients: team.map((r) => r.account_id).filter((id) => id !== requesterId && id !== answeredBy),
    kind: 'team.joined',
    siteKey,
    actor: requesterId,
    data: { role }
  })
  return written.length > 0
}

/**
 * An Owner answered a Viewer's request for edit access (ADR 0028 §6): the other Owners' rows about
 * it close (`settle`) and they hear who answered, the way T2b works for a join request; the Viewer
 * hears the answer. An approval is a role change, but the Viewer gets this answer instead of the
 * "your role changed" letter: they asked, and this says yes.
 */
async function announceEditAnswer(pool, deps, { siteKey, requesterId, answeredBy, decision }) {
  const { notify, settle } = deps
  const approved = decision === 'approved'
  await settle(editRef(siteKey, requesterId), { outcome: approved ? 'approved' : 'declined' })
  const requester = await accountFacts(pool, requesterId)
  const team = await teamOf(pool, siteKey)
  await notify({
    recipients: team.filter((r) => isOwnerRow(r) && r.account_id !== requesterId).map((r) => r.account_id),
    kind: 'team.edit_access_answered',
    siteKey,
    actor: answeredBy,
    data: {
      decision,
      requesterName: requester?.display_name ?? null,
      requesterEmail: requester?.email ?? null,
      role: 'editor'
    }
  })
  await notify({
    recipients: [requesterId],
    kind: approved ? 'team.edit_access_approved' : 'team.edit_access_declined',
    siteKey,
    actor: answeredBy,
    ...(approved ? { data: { role: 'editor' } } : {})
  })
}

/**
 * Decline one open invitation (the invitee says "no"), and tell the inviter (T6). Shared by the
 * mail's decline page and My Sites. Answers what happened, for the door to phrase.
 * @returns {Promise<'declined'|'already_declined'|'accepted'|'requested'|'gone'>}
 */
async function declineInvitation(pool, notify, siteKey, accountId, settle = async () => 0) {
  const row = await grantRowFor(pool, siteKey, accountId)
  if (!row || row.revoked_at) return 'gone'
  if (row.declined_at) return 'already_declined'
  if (row.accepted_at) return 'accepted'
  if (row.requested_at) return 'requested'
  const declined = await declineGrant(pool, siteKey, accountId)
  if (!declined) {
    const fresh = await grantRowFor(pool, siteKey, accountId)
    if (fresh?.accepted_at && !fresh.revoked_at) return 'accepted'
    return fresh?.declined_at ? 'already_declined' : 'gone'
  }
  await settle(inviteRef(siteKey, accountId), { outcome: 'declined' })
  if (declined.granted_by && declined.granted_by !== accountId) {
    await notify({
      recipients: [declined.granted_by],
      kind: 'team.invite_declined',
      siteKey,
      actor: accountId
    })
  }
  return 'declined'
}

/**
 * Revoke a person's live dsh session(s) after their seat is gone — the session-kill half of an
 * admin revoke. Ported from `revokeSeatSessions`/`dshDoorsFrom`
 * (`workers/seat-registry/src/seatRevoke.js`): a revoked seat only flips a column in Postgres, and
 * the person may still be sitting in a dsh with a cookie that lives up to twelve hours — exactly
 * the window a revoke exists to close.
 *
 * ASKS EVERY CONFIGURED HOST, NOT JUST THE ONE `siteKey` RESOLVES TO TODAY. Same reasoning as the
 * Worker's own docstring: identity is an email, not a site, so the person just revoked from one
 * site may hold a live session on ANY host's dsh (Plan 1's `hostsResolver.hostOf` always answers
 * the one configured default host anyway, so today this is one door — but it stays correct once a
 * later plan spreads sites across hosts, without this function changing).
 *
 * NEVER THROWS, NEVER UNDOES THE SEAT REVOKE THAT ALREADY COMMITTED. A door with no
 * `seatDoor.revokeSeatAtDoor` injected, or one that cannot be reached, is reported as a failed lane
 * (logged, and carried in the response as `{ok: false, revoked: null}`) — same discipline as the
 * Worker's own per-door try/catch, which answers rather than throws.
 * @param {object} config - `readConfig`'s value (reads `config.hosts`).
 * @param {{ revokeSeatAtDoor?: Function }} seatDoor - injected by `app.js` from
 *   `workspace/seat-door.js` (a sibling domain `seats/route.js` may not import directly).
 * @param {string|null} email - the revoked person's address, or null (nothing to do).
 * @param {string} siteKey - narrows the revoke to this one account, on a host whose dsh keeps one
 *   account per (person, site) — see `revokeSeatAtDoor`'s own docstring on `site`.
 * @returns {Promise<Array<{lane: string, ok: boolean, revoked: number|null}>>} one result per host
 *   that was actually configured with both an origin and a secret.
 */
async function revokeSeatSessions(config, seatDoor, email, siteKey, pool = null) {
  if (!email || typeof seatDoor?.revokeSeatAtDoor !== 'function') return []
  const hosts = [...config.hosts.entries()].filter(([, h]) => h.dshOrigin && h.seatSecret)
  return Promise.all(
    hosts.map(async ([name, host]) => {
      let outcome
      try {
        const answer = await seatDoor.revokeSeatAtDoor({
          origin: host.dshOrigin,
          secret: host.seatSecret,
          email,
          site: siteKey
        })
        outcome = { lane: name, ok: answer.ok, revoked: answer.revoked }
      } catch (error) {
        console.warn(`[seats] could not reach ${name}'s seat door to revoke ${email}: ${error.message}`)
        outcome = { lane: name, ok: false, revoked: null, error: error.message }
      }
      // 🔒 A HOST THAT DID NOT ANSWER IS NOT A HOST THAT WAS TOLD. The seat row is already
      // revoked, and every door this app answers refuses from here on; what that leaves is the
      // permission row inside that host's dsh, which a live session still runs on. Recorded, and
      // told again by `cron.js` until it answers — the response below says `queued` for that lane
      // rather than `ok`, and never that the revoke is complete on a host it is not.
      if (!outcome.ok && pool) {
        try {
          await enqueueSeatSync(pool, {
            kind: 'revoke',
            host: name,
            email,
            siteKey,
            error: outcome.error ?? 'refused'
          })
          outcome.queued = true
        } catch (error) {
          console.error(`[seats] could not queue the revoke for ${name}: ${error.message}`)
        }
      }
      return outcome
    })
  )
}

/**
 * Tell every configured host a seat's CURRENT grant — after a role changed (plan
 * first-site-build-onboarding §4, P07). The host's door upserts the seat's permission row
 * (`upsertSeatUser` in `vendor/tracy/dsh-passwords/src/tracy/seat.ts`) and drops its cached sessions,
 * so a session already open on that host runs on the new role and toolsets from its very next
 * request — no sign-out, no waiting for a cookie to age. The token the door answers with is
 * discarded: this call writes the row, it does not sign anyone in. The browser's own cookie is
 * re-minted on its next request anyway, because its fingerprint no longer matches the grant
 * (`workspace/scope.js`).
 *
 * Same shape and same discipline as `revokeSeatSessions`: every host, one result each, a host
 * that did not answer is queued for `cron.js`.
 * @param {object} config - `readConfig`'s value.
 * @param {{ mintSeatSession?: Function }} seatDoor
 * @param {object} grant - `siteSeatGrant`'s shape.
 * @param {import('pg').Pool|null} pool
 * @returns {Promise<Array<{lane: string, ok: boolean, queued?: boolean}>>}
 */
async function syncSeatSessions(config, seatDoor, grant, pool = null) {
  if (!grant?.email || typeof seatDoor?.mintSeatSession !== 'function') return []
  const hosts = [...config.hosts.entries()].filter(([, h]) => h.dshOrigin && h.seatSecret)
  return Promise.all(
    hosts.map(async ([name, host]) => {
      let outcome
      try {
        const token = await seatDoor.mintSeatSession({
          origin: host.dshOrigin,
          secret: host.seatSecret,
          grant
        })
        outcome = { lane: name, ok: typeof token === 'string' }
      } catch (error) {
        console.warn(`[seats] could not reach ${name}'s seat door to update ${grant.email}: ${error.message}`)
        outcome = { lane: name, ok: false, error: error.message }
      }
      if (!outcome.ok && pool) {
        try {
          await enqueueSeatSync(pool, {
            kind: 'mint',
            host: name,
            email: grant.email,
            siteKey: grant.site,
            payload: grant,
            error: outcome.error ?? 'refused'
          })
          outcome.queued = true
        } catch (error) {
          console.error(`[seats] could not queue the update for ${name}: ${error.message}`)
        }
      }
      return outcome
    })
  )
}

/** `platform`/`attached`/`address`/`label`/`origin` for a batch of sites, from the `site` table `002-book.sql`
 * lays down alongside `seat` — no domain owns a `site` store yet (that lands with a later task's
 * site resolver), so this file reads the columns `/api/sites` and `/api/team` need directly.
 *
 * `label` rides along so `GET /api/sites` does not ask `sites.labelOf` once per accepted seat: that
 * was one sequential query per site on a door every open page reads (issue #340). */
async function siteMetaFor(pool, siteKeys) {
  if (siteKeys.length === 0) return new Map()
  const { rows } = await pool.query(
    `select s.site_key, platform, attached, address, label, primary_name, created_at, publish, origin,
      array(select n.name from site_name n where n.site_key=s.site_key and n.state='active') as aliases
      from site s where site_key = any($1::text[])`,
    [siteKeys]
  )
  return new Map(rows.map((r) => [r.site_key, r]))
}

/**
 * The address to SHOW a seat holder for their site — the one they click, copy, and open
 * `/wp-admin` under.
 *
 * 🔒 THE SITE'S OWN `address` COLUMN COMES FIRST, and that is the whole fix. The Worker wrote
 * `https://<label>.tracy.ai/` as a literal (`workers/cowork-web/src/worker.js:1566`) and got away
 * with it because it only ever ran on one origin. Ported literally, it hands a laptop
 * `https://qatest1.localhost/` — wrong scheme, missing port, resolves to nothing — while the site
 * genuinely answers at `http://qatest1.localhost:8080/`, which is exactly what `sites/route.js`'s
 * `localAddress` already stored in that column at provision time. Measured 10/09 in a browser:
 * My Sites' "Live" fact, its copy-to-clipboard, its live-site tab and the `/wp-admin` link built
 * on top of it were all pointing at an address nothing served.
 *
 * The fallback is for a row provisioned before an address was published (an import mid-flight).
 * It is `bornSiteAddress` — the same derivation `sites/route.js` WRITES into that column and the
 * provision sweep writes when nobody polled — rather than a second copy of it: this function reads
 * back what that one wrote, so a disagreement between them shows up as a site whose address
 * changes depending on which door you asked.
 */
function siteAddress(site, label, config) {
  if (site?.address) return site.address
  return bornSiteAddress(label, config)
}

/** One row of a site's book, as `GET /api/team` returns it — ported from `rosterRow`
 * (`workers/seat-registry/src/index.js:4022`). `id` is `account_id` (see the module docstring).
 *
 * Exported since 16/09 for one more caller that must answer in the SAME shape: `lanes/route.js`'s
 * `GET /sites/:key/seats`, the door a site's dsh reads a person's role out of. It is injected there
 * by the composition root, never imported across domains (`test/module-graph.test.mjs`). */
export function rosterRow(row, granters = {}) {
  // The person's face (`lib/person-face.js`): the same letter and colour the comment doors and
  // `/auth/me` give this account. `account.avatar_url` holds the provider picture the last
  // Google/GitHub sign-in handed over (`identity/route.js`); `avatarUrl` is Tracy's own address
  // for it (`GET /auth/avatar/:accountId`), null for an account that only ever signed in by code.
  const face = personFace({
    id: row.account_id,
    email: row.seat?.email ?? null,
    display_name: row.seat?.display_name ?? null,
    avatar_url: row.seat?.avatar_url ?? null
  })
  return {
    id: row.account_id,
    email: row.seat?.email ?? null,
    displayName: row.seat?.display_name ?? null,
    initial: face.initial,
    color: face.color,
    avatarUrl: face.avatarUrl,
    role: row.role,
    status: row.revoked_at
      ? 'revoked'
      : row.declined_at
        ? 'declined'
        : row.accepted_at
          ? 'active'
          : 'invited',
    grantedAt: row.granted_at,
    // Departure from the Worker: there, `granted_by` is an email string. Here it is a uuid FK to
    // `account(id)` (002-book.sql), and `grantedBy` stays that id for the callers that compare it.
    // The Team tab PRINTS the granter ("Granted … by …"), and printed this id as text until 29/09
    // (cowork.tracy.site: "by 14283358-185e-…"), so the row also carries the granter's email,
    // looked up for the whole roster at once (`emailsFor`) and handed in as `granters`.
    grantedBy: row.granted_by,
    grantedByEmail: granters[row.granted_by] ?? null,
    revokedAt: row.revoked_at,
    // Which administrator act closed a revoked row (#792): `revoke`, `cancel_invite` or
    // `decline_request`. Null on a live row, on a row closed before the column existed, and on a
    // seat its holder left — nothing is guessed for those. `status` stays `revoked` for all of
    // them, so a reader older than #792 keeps working.
    removalKind: row.revoked_at ? (row.removal_kind ?? null) : null,
    requestedAt: row.requested_at ?? null,
    // A Viewer's request for edit access waiting on the Owners (ADR 0028 §6, migration 079), or
    // null. Separate from `requestedAt`, which says the row began as a request to join and stays
    // set after that request was approved.
    editRequestedAt: row.edit_requested_at ?? null,
    // Every row here is a SITE row — this app has no workspace-inherited seat concept yet.
    scope: 'site'
  }
}

/** `{siteKey, outcome}` list, from the accepted-or-not per-site outcome of one team invite —
 * shared by `POST /api/team/invite` and `GET /invite/:token`. Ported from `admitToSite`
 * (`workers/seat-registry/src/index.js:4225`), minus the join-request-approval branch's own audit
 * write (this app records no audit log yet — out of this task's scope).
 *
 * Inviting somebody whose request to join is waiting IS approving it, and approving is an Owner's
 * act (ADR 0028): an Editor's invitation to such a person is refused for that site
 * (`mayApprove` false), and the request stays for an Owner to answer. */
async function admitToSite(pool, { inviteeId, siteKey, role, grantedBy, mayApprove }) {
  const held = await grantRowFor(pool, siteKey, inviteeId)
  if (held && held.requested_at && !held.accepted_at && !held.revoked_at && !held.declined_at) {
    if (!mayApprove) return { outcome: 'refused', code: 'NOT_SITE_OWNER' }
    const approved = await approveSiteJoinRequest(pool, siteKey, inviteeId, role, grantedBy)
    if (!approved) return { outcome: 'conflict' }
    return { outcome: 'approved', row: approved }
  }
  // #804: an invitation still waiting for its answer is "already granted" to the row, and the row
  // stays as it is — but the link that answers it stops working after `TEAM_INVITE_TTL_S`, so the
  // caller may mail a fresh one for the same role (`pending`). An accepted seat has nothing left
  // to answer.
  if (held && !held.revoked_at && !held.declined_at) {
    return { outcome: 'already_granted', row: held, pending: !held.accepted_at }
  }
  const granted = await grantSite(pool, { siteKey, accountId: inviteeId, role, grantedBy })
  return { outcome: 'invited', row: granted }
}

/** The mail-sending half of an invitation is the caller's job; this door only writes the rows and
 * reports what happened — same discipline as the Worker (a failed send never fails the request). */
function refusalFor(grant) {
  if (!grant) return 'SEAT_NOT_AUTHORIZED'
  // ADR 0028: an Owner or an Editor invites (as Viewer or Editor — the role is checked before this);
  // a Viewer invites nobody.
  if (!actingEditor(grant)) return 'NOT_SITE_EDITOR'
  return null
}

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config - `readConfig`'s value.
 * @param {{ send: Function, inviteMail: Function, addedToWorkspace: Function, joinRequestMail: Function, teamInviteMail: Function }} deps.mail
 *   The transport plus the mail templates (`mail/emails.js`) bound in by `app.js` — this domain
 *   never imports `mail/` directly (the module-graph rule: a domain imports only `lib/`, `db/`,
 *   and itself), so the composition root hands both in together, the same way `identityRoutes`
 *   already receives its own `mail.send`. Only the invitation (`teamInviteMail`) is sent from here
 *   since #809: every other team mail, the join request included, is a notifier letter.
 * @param {ReturnType<import('../sites/resolver.js').hostsResolver>} deps.sites
 * @param {{ revokeSeatAtDoor?: Function }} [deps.seatDoor] - bound in by `app.js` from
 *   `workspace/seat-door.js`, same reasoning as `deps.mail` above. Defaults to `{}`, under which
 *   `revokeSeatSessions` reports zero lanes rather than failing — a missing door is "not wired
 *   here yet", not a 500.
 * @param {(event: object) => Promise<string[]>} [deps.notify] - the notifier's `notify`
 *   (`notifications/notify.js`), bound in by `app.js`: the one way a team event reaches the Inbox
 *   and the mailbox of the people it concerns (spec #809).
 * @param {(ref: string, options?: { outcome?: 'accepted' | 'declined' }) => Promise<number>} [deps.settleNotifications] - the notifier's `settle`:
 *   closes every open row about one join request once somebody answered it.
 * @param {() => number} [deps.now]
 * @returns {import('hono').Hono}
 */
export function seatsRoutes({
  pool,
  config,
  mail,
  sites,
  seatDoor = {},
  notify = async () => [],
  settleNotifications = async () => 0,
  now = Date.now
}) {
  const app = new Hono()
  const told = { notify, settle: settleNotifications }

  /** The grant a seat is minted with NOW — the same shape `workspace/route.js` mints on a visit:
   *  the role's fixed toolsets (ADR 0028), an empty list for a viewer. */
  async function currentGrant(email, role, siteKey) {
    return siteSeatGrant({
      email,
      role,
      label: await sites.labelOf(siteKey),
      siteKey,
      toolsets: toolsetsFor(role)
    })
  }

  // ── GET /api/sites — every site the viewer holds a live grant on ──────────────────────────────
  // Ported from `apiSites` (cowork-web) calling `handleMySites` (seat-registry).
  // ported: handleMySites
  app.get('/api/sites', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const account = await accountByEmail(pool, email)
    // No account row at all reads the same as "no sites" to the caller — same as the Worker's
    // `SEAT_NOT_AUTHORIZED` branch: signing in does not by itself create a seat anywhere.
    const rows = account ? await sitesOfAccount(pool, account.id) : []
    const meta = await siteMetaFor(
      pool,
      rows.map((r) => r.site_key)
    )
    // The publish or back-to-draft under way on each seated site, so the list and the site's own
    // Settings tab say the same thing while it runs. Read from the book only: no host is asked here.
    const underWay = await publishingOf(
      pool,
      rows.filter((r) => r.status === 'accepted').map((r) => r.site_key)
    )
    // Accepted seats on an import that never reached a build (`lib/import-pending.js`): listed, never
    // opened as a workspace, so My Sites can offer the recovery page instead of Start the agent.
    const unfinished = await importPendingKeys(
      pool,
      rows.filter((r) => r.status === 'accepted').map((r) => r.site_key)
    )
    const inviterIds = [...new Set(rows.map((r) => r.granted_by).filter(Boolean))]
    const inviterNames = await displayNamesFor(pool, inviterIds)
    // An inviter with no display name is named by their address, never left blank: My Sites'
    // Decline dialog says "{inviter} will need to invite you again" (04/10/2026).
    const inviterEmails = await emailsFor(pool, inviterIds)

    const list = []
    for (const row of rows) {
      const site = meta.get(row.site_key)
      // The label from the batch read; `labelOf` only when the batch found no site row, where it
      // falls back to `fleetLabel` exactly as before.
      const label = row.status === 'accepted' ? (site?.label ?? (await sites.labelOf(row.site_key))) : null
      const copyUrl = label === null ? null : siteAddress(site, label, config)
      list.push({
        siteKey: row.site_key,
        displayName: site?.primary_name || row.site_key,
        workspaceUrl: `/${encodeURIComponent(site?.primary_name || row.site_key)}/`,
        aliases: site?.aliases ?? [row.site_key],
        platform: site?.platform ?? null,
        role: row.role,
        status: row.status,
        workspaceId: row.workspace_id ?? null,
        inviterName: inviterNames[row.granted_by] ?? inviterEmails[row.granted_by] ?? null,
        grantedBy: row.granted_by,
        grantedAt: row.granted_at,
        requestedAt: row.requested_at ?? null,
        // The caller's own request for edit access, still waiting (a Viewer seat only), or null:
        // the chat's Viewer bar says "sent" from it after a reload.
        editRequestedAt: row.edit_requested_at ?? null,
        // When the site row was made — My Sites sorts on it, newest first (29/09). Null only
        // for a seat whose site row the batch read did not find.
        createdAt: site?.created_at ?? null,
        // The site's publish state, for a seat that sits on it: My Sites writes Draft or Live after
        // the name. Absent for an invitation not yet answered, and when the site row was not found.
        // `publishing`: the direction (`live` · `draft`) of the operation that holds the site right
        // now; absent when none does.
        ...(row.status === 'accepted' && site
          ? {
              publish: site.publish === 'published' ? 'published' : 'draft',
              ...(underWay.has(row.site_key) ? { publishing: underWay.get(row.site_key) } : {})
            }
          : {}),
        copyUrl,
        // Brought in with Import existing site (`origin = 'migrated'`): the site has a live original
        // that Sync from live reads (`sites/live-sync.js`). Absent otherwise.
        ...(site?.origin === 'migrated' ? { imported: true } : {}),
        // The import's read never reached a build: no folder on the host, so no workspace. Absent
        // otherwise.
        // `importRecovery` is the page that finishes it (Retry or Continue), for the row's one action.
        ...(unfinished.has(row.site_key)
          ? { importPending: true, importRecovery: importRecoveryPath(row.site_key) }
          : {}),
        // The folder this seat works in on the host's dsh (`siteSeatGrant`'s `folders`), or null for
        // an invitation. The label is stored per site and is not the first part of the key for an
        // imported site, so a client matching a dsh workspace row to its site reads it here.
        folder: label === null ? null : `/site/${label}`,
        // No fleet-attach signal exists yet beyond the `site.attached` flag itself; the Worker's
        // live "is dsh up" probe (`dshUp`) has no counterpart in this app yet — a site is shown as
        // reachable once it is attached, not once a lane answers.
        // An unfinished import has no agent even when an old Start the agent press attached it: that
        // press only made an empty folder (`lib/import-pending.js`).
        agent: copyUrl && site?.attached && !unfinished.has(row.site_key) ? '/' : null
      })
    }
    // The prefix a fleet-born site's address carries on THIS deployment (`''` on production,
    // `dev-` on dev). The wizard shows it beside the box a person types into, so what they read
    // there is the address they will actually get. Wired 10/09; it used to be a hardcoded `''`
    // with a note saying so.
    return json(c, { addressPrefix: config.siteAddressPrefix, sites: list })
  })

  // ── GET /api/team — every site the viewer holds, each with its roster ─────────────────────────
  // Ported from `apiTeam` calling `handleMySites` + `handleRoster` per accepted site.
  // ported: handleRoster
  app.get('/api/team', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const account = await accountByEmail(pool, email)
    const rows = account ? await sitesOfAccount(pool, account.id) : []
    const meta = await siteMetaFor(
      pool,
      rows.map((r) => r.site_key)
    )

    // Every accepted site's book first, then ONE email lookup for every granter across them.
    const books = new Map()
    for (const row of rows) {
      if (row.status === 'accepted') books.set(row.site_key, await seatsOfSite(pool, row.site_key))
    }
    const granters = await emailsFor(
      pool,
      [...books.values()].flat().map((r) => r.granted_by)
    )
    const list = []
    for (const row of rows) {
      const book = books.get(row.site_key)
      const seats = book ? book.map((r) => rosterRow(r, granters)) : null
      list.push({
        siteKey: row.site_key,
        platform: meta.get(row.site_key)?.platform ?? null,
        myRole: row.role,
        status: row.status,
        seats
      })
    }
    return json(c, { sites: list })
  })

  // ── POST /api/team/invite — N people, one role, N sites, one mail each ────────────────────────
  // Ported from `apiTeamInvite` calling `handleTeamInvite`.
  // ported: handleTeamInvite
  app.post('/api/team/invite', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email

    // Keyed by the inviting ACCOUNT (see the constant's own comment above).
    if (await overLimitOrClosed(pool, `team-invite:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }

    const body = await c.req.json().catch(() => null)
    if (!body) return json(c, { code: 'INVALID_REQUEST' }, 400)
    // Owners are made from the Team list, never by invitation (ADR 0028).
    const role = body.role
    if (!INVITABLE_ROLES.includes(role)) return json(c, { code: 'INVALID_REQUEST' }, 400)

    const rawEmails = Array.isArray(body.emails) ? body.emails : null
    if (!rawEmails || rawEmails.length === 0 || rawEmails.length > TEAM_MAX_EMAILS) {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    const emails = []
    for (const raw of rawEmails) {
      const e = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
      if (!EMAIL_SHAPE.test(e)) return json(c, { code: 'INVALID_REQUEST' }, 400)
      if (!emails.includes(e)) emails.push(e)
    }

    const rawSites = Array.isArray(body.siteKeys) ? body.siteKeys : null
    if (!rawSites || rawSites.length === 0 || rawSites.length > TEAM_MAX_SITES) {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    const siteKeys = []
    for (const raw of rawSites) {
      const key = typeof raw === 'string' && raw !== '' ? normalizeSiteKey(raw) : ''
      if (!key) return json(c, { code: 'INVALID_REQUEST' }, 400)
      if (!siteKeys.includes(key)) siteKeys.push(key)
    }

    const caller = await ensureAccount(pool, email)
    const callerName = (await accountFacts(pool, caller.id))?.display_name ?? null
    const refusals = new Map()
    const owns = new Set()
    for (const siteKey of siteKeys) {
      const grant = await grantFor(pool, caller.id, siteKey)
      const refusal = refusalFor(grant)
      if (refusal) refusals.set(siteKey, refusal)
      if (actingOwner(grant)) owns.add(siteKey)
    }
    const allowed = siteKeys.filter((k) => !refusals.has(k))

    const results = []
    for (const invited of emails) {
      const outcomes = new Map()
      for (const [siteKey, code] of refusals) outcomes.set(siteKey, { siteKey, outcome: 'refused', code })
      let notified = false
      // The accept link of this person's letter, for the INVITER's answer only (spam hints D2,
      // 05/10): a letter that lands in Spam still has a way through. It is the same signed
      // token the letter carries (invited address only, seven days), never stored anywhere.
      let inviteUrl

      if (allowed.length > 0) {
        const invitee = await ensureAccount(pool, invited)
        const granted = []
        for (const siteKey of allowed) {
          const admitted = await admitToSite(pool, {
            inviteeId: invitee.id,
            siteKey,
            role,
            grantedBy: caller.id,
            mayApprove: owns.has(siteKey)
          })
          if (admitted.outcome === 'conflict') {
            outcomes.set(siteKey, { siteKey, outcome: 'refused', code: 'GRANT_UNKNOWN' })
            continue
          }
          if (admitted.outcome === 'refused') {
            outcomes.set(siteKey, { siteKey, outcome: 'refused', code: admitted.code })
            continue
          }
          // #804: an invitation still waiting for its answer, asked for again in the role its row
          // holds, is renewed — no seat write, the site joins this person's ONE letter and answers
          // `invited` (with `renewed`), so `notified` says the same thing for every site it covers.
          // A waiting seat of another role stays `already_granted` and is not mailed: one letter
          // names one role, and a second letter would leave one `notified` describing two sends.
          const renewed =
            admitted.outcome === 'already_granted' && admitted.pending && admitted.row.role === role
          outcomes.set(
            siteKey,
            renewed ? { siteKey, outcome: 'invited', renewed: true } : { siteKey, outcome: admitted.outcome }
          )
          if (admitted.outcome === 'already_granted' && !renewed) continue
          await opsFor(pool).record('team.invite', {
            email,
            accountId: caller.id,
            siteKey,
            data: renewed ? { role, renewed: true } : { role }
          })
          if (admitted.outcome === 'approved') {
            // A join request answered "yes" (T3): the person asked, so they get "You now have
            // access", never the invitation mail — there is nothing left for them to accept.
            const answered = await announceJoinAnswer(pool, told, {
              siteKey,
              requesterId: invitee.id,
              answeredBy: caller.id,
              decision: 'approved',
              role
            })
            notified = notified || answered
            continue
          }
          granted.push(siteKey)
          // A renewed invitation's Inbox row (T1) is still waiting under the same ref; only the
          // letter goes again, with a fresh link.
          if (renewed) continue
          // T1: the Inbox row for each site; its email is the invitation below (it carries the
          // signed accept link the log cannot rebuild), so the row mails nothing itself.
          await notify({
            recipients: [invitee.id],
            kind: 'team.invited',
            siteKey,
            actor: caller.id,
            data: { role },
            ref: inviteRef(siteKey, invitee.id),
            mail: 'none'
          })
        }

        if (granted.length > 0) {
          try {
            const token = await signTeamInvite(
              { email: invited, role, siteKeys: granted },
              config.sessionSecret
            )
            inviteUrl = teamInviteUrl(token, config.origin)
            // The invitee's own language when they already chose one; a first-time invitee has
            // none yet, and the inviter's language is the best guess left (#809, user story 15).
            const chosen = (await languagesByEmail(pool, [invited])).get(invited.toLowerCase())
            const letter = mail.teamInviteMail({
              inviterName: callerName,
              inviterEmail: email,
              role,
              siteKeys: granted,
              acceptUrl: inviteUrl,
              declineUrl: teamInviteDeclineUrl(token, config.origin),
              // No "Manage notifications": the invitee may have no account yet, so there is no
              // settings page to open; Decline is what they can do (06/10/2026).
              lang: chosen ?? requestLanguage(c)
            })
            await mail.send({ to: invited, subject: letter.subject, text: letter.text, html: letter.html })
            notified = true
          } catch {
            // The invitation mail did not go; `notified` stays whatever an approval above made it.
          }
        }
      }

      results.push({
        email: invited,
        notified,
        sites: siteKeys.map((k) => outcomes.get(k)),
        ...(inviteUrl ? { inviteUrl } : {})
      })
    }
    return json(c, { results })
  })

  // ── PATCH|DELETE /api/sites/:key/seats/:grant — change a role, or take the row off the book ───
  // Ported from `apiSeatGrant` calling `handleSetRole`/`handleRosterRevoke`. `:grant` is the
  // target's `account_id` (module docstring).
  // ported: handleSetRole
  // ported: handleRosterRevoke
  app.on(['PATCH', 'DELETE'], '/api/sites/:key/seats/:grant', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const targetId = c.req.param('grant')
    // An account id is a UUID; anything else is "no such grant", not a 500 from Postgres refusing
    // to cast it (measured 13/09: `/seats/undefined` answered `Internal Server Error`).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId))
      return json(c, { code: 'GRANT_UNKNOWN' }, 404)

    const caller = await accountByEmail(pool, email)
    // NOT WORKSPACE-INHERITED, ON PURPOSE (ADR 0067, 19/08). A workspace admin's grant stays inside
    // workspace doors and never opens this one — a customer's site is authorised from `seat` alone,
    // full stop. `workers/seat-registry/src/index.js`'s `workspaceGrantFor` is read at EIGHT call
    // sites (4964, 5083, 5479, 5525, 7199, 7212, 7401, 7734; an earlier version of this comment
    // miscounted them as four — corrected in Fix Round 2). Seven decide a WORKSPACE-scoped question
    // inside a `/workspaces/*`-shaped handler; the site's own seats door
    // (`handleSetRole`/`handleRosterRevoke`) is not one of them and never touches it. The eighth,
    // `handleCreateRepo` (line 7734), is ADR 0067 §3's one documented bootstrap exception: a
    // workspace admin may create a site's GitHub repo when the site has no `seat` row yet, and
    // `ensureSiteOwnerSeat` grants the first real one immediately after so the site's own book
    // governs from the next call — that exception lives in the GitHub door, not this one, and does
    // not reopen this door. An earlier version of this file DID let a workspace grant escalate
    // here — a Care Point in Task 8's brief asked for it, written from a stale reading of the
    // Worker — and Fix Round 1 reverted it after checking these call sites directly: re-opening
    // this path would let a workspace admin change roles and revoke seats on a customer's site,
    // exactly the hole ADR 0067 closed. See `apps/tracy-web/test/workspaces.test.mjs` for the test
    // that pins this refusal down.
    const grant = caller ? await grantFor(pool, caller.id, siteKey) : null
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    // ADR 0028: changing a role and taking somebody off the team are an Owner's acts only.
    if (!actingOwner(grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)

    if (c.req.method === 'DELETE') {
      // ONE PRESS, ONE ACT (#792). The body names which of the three removals this is
      // (`{kind: 'revoke' | 'cancel_invite' | 'decline_request'}`), and a kind that is not the one
      // the row calls for right now is refused: a dialog that said "Cancel invitation" must not
      // revoke the seat of somebody who accepted while it was open.
      //
      // 🔒 A BODY IS STRICT AND IS EXACTLY `{kind}`. Anything else that was sent — not JSON, not
      // an object, an unknown or mistyped kind, a key beside `kind` — is a malformed request,
      // never a guess; nothing is written or recorded.
      //
      // COMPATIBILITY (v1): NO BODY AT ALL IS STILL ANSWERED, as it was before #792. A site's dsh
      // image changes only when someone rebuilds it, so a Team tab older than #792 keeps sending
      // this DELETE with nothing in it; refusing it would stop removing people on every such
      // site. It cannot name its act, so the act is read off the row — and is then stored and
      // recorded as that act, the same as a named one. Known limit: such a tab can still remove
      // on a row that changed after it loaded; every tab built from #792 on names its act.
      //
      // "No body" is decided BEFORE the content is looked at: the request declares no content (no
      // `transfer-encoding`, and `content-length` absent or zero) and there is not one byte to
      // read. A body that was sent and holds only whitespace is a body without a kind, not an
      // absent one.
      const raw = await c.req.text().catch(() => null)
      if (raw === null) return json(c, { code: 'INVALID_REQUEST' }, 400)
      const declared = c.req.header('content-length')
      const sent =
        raw.length > 0 ||
        c.req.header('transfer-encoding') !== undefined ||
        (declared !== undefined && !/^0+$/.test(declared.trim()))
      let asked = null
      if (sent) {
        let body
        try {
          body = JSON.parse(raw)
        } catch {
          return json(c, { code: 'INVALID_REQUEST' }, 400)
        }
        if (
          body === null ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).length !== 1 ||
          !isRemovalKind(body.kind)
        )
          return json(c, { code: 'INVALID_REQUEST' }, 400)
        asked = body.kind
      }
      const target = await grantRowFor(pool, siteKey, targetId)
      const current = removalKindOf(target)
      // Already removed, declined by the invitee, or never on this site's book: nothing to remove.
      if (!current) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
      if (asked !== null && asked !== current)
        return json(c, { code: 'SEAT_STATE_CHANGED', kind: current }, 409)
      const kind = asked ?? current
      if (target.account_id === caller.id) return json(c, { code: 'CANNOT_REVOKE_SELF' }, 403)
      if (target.role === 'owner' && (await ownersOf(pool, siteKey)).length <= 1) {
        return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
      }
      try {
        // The row's state AND its role are checked again INSIDE the write: what was read above
        // may be stale, and the owner rules above were decided on `target.role`. A seat promoted
        // to owner in between is refused here, for every kind, rather than removed on the rule
        // for the role it used to hold.
        const revoked = await revokeGrant(pool, siteKey, targetId, kind, target.role)
        if (!revoked) {
          const now = removalKindOf(await grantRowFor(pool, siteKey, targetId))
          if (!now) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
          return json(c, { code: 'SEAT_STATE_CHANGED', kind: now }, 409)
        }
        // Recorded from the row the write returned, and only now that it has landed. Best-effort
        // analytics like every other `team.*` event: a failure to record is logged by the service
        // and never fails or undoes the removal.
        await opsFor(pool).record(`team.${kind}`, {
          email,
          accountId: caller.id,
          siteKey,
          data: { role: revoked.role, target: revoked.account_id }
        })
        // Who hears it depends on what the row was: a seat (T8), a request to join (T4 + T2b), or
        // an invitation nobody answered yet (T11). A row already declined is nobody's news.
        if (target.accepted_at) {
          // A request for edit access the removed Viewer left waiting closes with them.
          if (target.edit_requested_at)
            await settleNotifications(editRef(siteKey, targetId), { outcome: 'declined' })
          await notify({ recipients: [targetId], kind: 'team.removed', siteKey, actor: caller.id })
        } else if (target.requested_at && !target.declined_at) {
          await announceJoinAnswer(pool, told, {
            siteKey,
            requesterId: targetId,
            answeredBy: caller.id,
            decision: 'declined',
            role: target.role
          })
        } else if (!target.declined_at) {
          await settleNotifications(inviteRef(siteKey, targetId))
          await notify({
            recipients: [targetId],
            kind: 'team.invite_cancelled',
            siteKey,
            actor: caller.id,
            data: { role: target.role }
          })
        }
        // Same as `handleRosterRevoke`: a revoked row does not by itself end a live dsh session
        // (a seat cookie lives up to 12 hours) — chase it down at every configured host, and
        // report which lanes answered, same shape as the Worker's `{revoked:true, lanes}`.
        const targetEmail = await accountEmailFor(pool, targetId)
        const lanes = await revokeSeatSessions(config, seatDoor, targetEmail, siteKey, pool)
        return json(c, lanes.length > 0 ? { revoked: true, kind, lanes } : { revoked: true, kind })
      } catch (error) {
        if (error instanceof SeatStoreRejected) return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
        throw error
      }
    }

    // PATCH
    const body = await c.req.json().catch(() => null)
    const role = body?.role
    if (!ROLES.includes(role)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const target = await grantRowFor(pool, siteKey, targetId)
    if (!target || target.revoked_at) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
    if (target.role === role) return json(c, { id: target.account_id, role })
    if (target.role === 'owner' && (await ownersOf(pool, siteKey)).length <= 1) {
      return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
    }
    try {
      // Compare-and-set on the role that was read (#792): the checks above were made against
      // `target.role`, and the record below says "from" that role, so the write lands only while
      // the row still holds it.
      const updated = await setGrantRole(pool, siteKey, targetId, role, target.role)
      if (!updated) {
        const now = await grantRowFor(pool, siteKey, targetId)
        if (!now || now.revoked_at) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
        return json(c, { code: 'SEAT_STATE_CHANGED' }, 409)
      }
      // A role that actually changed leaves a record (an unchanged one returned above). Same
      // best-effort analytics as the removal's.
      await opsFor(pool).record('team.role_change', {
        email,
        accountId: caller.id,
        siteKey,
        data: { from: target.role, to: updated.role, target: updated.account_id }
      })
      // A Viewer's waiting request for edit access is answered by any role change (the store
      // cleared it with the role): the other Owners' rows close as approved.
      if (target.edit_requested_at) {
        await settleNotifications(editRef(siteKey, targetId), { outcome: 'approved' })
      }
      // T9: only a seat the person holds. A role changed on an invitation they have not answered
      // yet is not news about their access (the invitation still names the role it was sent with).
      if (target.accepted_at && !target.declined_at) {
        await notify({
          recipients: [targetId],
          kind: 'team.role_changed',
          siteKey,
          actor: caller.id,
          data: { from: target.role, to: role }
        })
      }
      // The book is written; now every host's dsh hears the new role and toolsets, so a session
      // the person has open right now runs on them from its next request (P07). A host that does
      // not answer is queued — `lanes` says which.
      const targetEmail = await accountEmailFor(pool, targetId)
      const lanes = targetEmail
        ? await syncSeatSessions(config, seatDoor, await currentGrant(targetEmail, role, siteKey), pool)
        : []
      return json(c, { id: updated.account_id, role: updated.role, ...(lanes.length > 0 ? { lanes } : {}) })
    } catch (error) {
      if (error instanceof SeatStoreRejected) return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
      throw error
    }
  })

  // ── POST /api/sites/:key/edit-access-request — a Viewer asks for edit access (ADR 0028 §6) ────
  // The chat's Viewer bar (`@tracy/dsh-chat-input` `seat-role.mjs`) presses it. The request lives
  // on the caller's own seat row (`edit_requested_at`, migration 079); every Owner gets an Inbox
  // row and a letter (`team.edit_access_request`, the locked join-request group), all under one
  // `ref`, so the first answer settles them. Asking again while a request waits writes nothing and
  // answers 200 `{requested: true, already: true}`; the first ask answers 201 `already: false`.
  // Refusals: 401 NOT_SIGNED_IN; 403 SEAT_NOT_AUTHORIZED (no live seat on this site); 409
  // ALREADY_EDITOR (the seat already edits: editor or owner); 429 RATE_LIMITED.
  app.post('/api/sites/:key/edit-access-request', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    if (await overLimitOrClosed(pool, `edit-access:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const account = await accountByEmail(pool, email)
    const grant = account ? await grantFor(pool, account.id, siteKey) : null
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (grant.role !== 'viewer') return json(c, { code: 'ALREADY_EDITOR', role: grant.role }, 409)

    const written = await requestEditAccess(pool, siteKey, account.id)
    if (!written) {
      // Nothing written: a request is already waiting, or the seat changed under this call.
      const fresh = await grantRowFor(pool, siteKey, account.id)
      const live = fresh && fresh.accepted_at && !fresh.revoked_at && !fresh.declined_at
      if (!live) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
      if (fresh.role !== 'viewer') return json(c, { code: 'ALREADY_EDITOR', role: fresh.role }, 409)
      return json(c, { requested: true, already: true, requestedAt: fresh.edit_requested_at })
    }
    const team = await teamOf(pool, siteKey)
    await notify({
      recipients: team.filter(isOwnerRow).map((r) => r.account_id),
      kind: 'team.edit_access_request',
      siteKey,
      actor: account.id,
      ref: editRef(siteKey, account.id)
    })
    return json(c, { requested: true, already: false, requestedAt: written.edit_requested_at }, 201)
  })

  // ── POST /api/sites/:key/seats/:grant/edit-access — an Owner answers that request ─────────────
  // Body exactly `{decision: 'approve' | 'decline'}`. `approve` makes the Viewer an Editor and tells
  // every host the new grant (the role's fixed toolsets, as a role change does); `decline` only
  // clears the request. Either way the other Owners' rows close and the Viewer hears the answer.
  // Answers `{id, role, decision: 'approved'|'declined', lanes?}`. Refusals: 401 NOT_SIGNED_IN;
  // 403 SEAT_NOT_AUTHORIZED / NOT_SITE_OWNER; 400 INVALID_REQUEST; 404 GRANT_UNKNOWN; 409
  // NO_EDIT_REQUEST (nothing waiting: answered by another Owner, withdrawn, or never asked).
  app.post('/api/sites/:key/seats/:grant/edit-access', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const targetId = c.req.param('grant')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId))
      return json(c, { code: 'GRANT_UNKNOWN' }, 404)
    const caller = await accountByEmail(pool, email)
    const grant = caller ? await grantFor(pool, caller.id, siteKey) : null
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (!actingOwner(grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)
    const body = await c.req.json().catch(() => null)
    const decision = body?.decision
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      (decision !== 'approve' && decision !== 'decline')
    )
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const target = await grantRowFor(pool, siteKey, targetId)
    if (!target || target.revoked_at || target.declined_at || !target.accepted_at)
      return json(c, { code: 'GRANT_UNKNOWN' }, 404)

    const answered = await answerEditAccess(pool, siteKey, targetId, decision)
    if (!answered) return json(c, { code: 'NO_EDIT_REQUEST' }, 409)
    const outcome = decision === 'approve' ? 'approved' : 'declined'
    // An approval is a role change, recorded as one (the event list of `lib/ops-signal.js`).
    if (outcome === 'approved')
      await opsFor(pool).record('team.role_change', {
        email,
        accountId: caller.id,
        siteKey,
        data: { from: 'viewer', to: 'editor', target: targetId }
      })
    await announceEditAnswer(pool, told, {
      siteKey,
      requesterId: targetId,
      answeredBy: caller.id,
      decision: outcome
    })
    let lanes = []
    if (outcome === 'approved') {
      // Same as a role change: every host's dsh hears the new role and its toolsets, so a session
      // the person has open writes from its next request.
      const targetEmail = await accountEmailFor(pool, targetId)
      if (targetEmail)
        lanes = await syncSeatSessions(
          config,
          seatDoor,
          await currentGrant(targetEmail, 'editor', siteKey),
          pool
        )
    }
    return json(c, {
      id: answered.account_id,
      role: answered.role,
      decision: outcome,
      ...(lanes.length > 0 ? { lanes } : {})
    })
  })

  // ── POST /api/sites/:key/accept — clicking Join in My Sites ───────────────────────────────────
  // Ported from `apiAcceptInvitation` calling `handleGrantDecision(..., 'accept')`.
  // ported: handleGrantDecision
  app.post('/api/sites/:key/accept', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    // Keyed by the ACCEPTING account — see the "Care points" disclosure in the task report for
    // why this whole cluster is account-keyed rather than IP-keyed.
    if (await overLimitOrClosed(pool, `accept:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const account = await ensureAccount(pool, email)

    const row = await grantRowFor(pool, siteKey, account.id)
    if (!row || row.revoked_at) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (row.requested_at && !row.accepted_at) return json(c, { code: 'JOIN_REQUEST_PENDING' }, 409)
    if (row.declined_at) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (row.accepted_at) return json(c, { accepted: true })

    const accepted = await acceptGrant(pool, siteKey, account.id)
    if (!accepted) {
      const refetched = await grantRowFor(pool, siteKey, account.id)
      if (!refetched || refetched.revoked_at || refetched.declined_at) {
        return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
      }
      return json(c, { accepted: true })
    }
    await opsFor(pool).record('team.accept', {
      email,
      accountId: account.id,
      siteKey,
      data: { role: row.role }
    })
    await announceAccepted(pool, notify, siteKey, account.id, accepted, settleNotifications)
    return json(c, { accepted: true })
  })

  // ── POST /api/sites/:key/decline — clicking Decline in My Sites ───────────────────────────────
  // The JSON twin of the invitation mail's decline page (#809 case T6): the invitee says "no" to
  // an invitation they have not answered. Same answers as the workspace door
  // (`/me/workspaces/:id/decline`): idempotent once declined, 409 `ALREADY_GRANTED` for a seat
  // already accepted (leave instead), 409 `JOIN_REQUEST_PENDING` for the viewer's own request.
  app.post('/api/sites/:key/decline', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    if (await overLimitOrClosed(pool, `decline:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const account = await accountByEmail(pool, email)
    if (!account) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    const outcome = await declineInvitation(pool, notify, siteKey, account.id, settleNotifications)
    if (outcome === 'gone') return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (outcome === 'accepted') return json(c, { code: 'ALREADY_GRANTED' }, 409)
    if (outcome === 'requested') return json(c, { code: 'JOIN_REQUEST_PENDING' }, 409)
    return json(c, { declined: true })
  })

  // ── POST /api/sites/:key/leave — give up your own seat ────────────────────────────────────────
  // Ported from `apiSiteLeave` calling `handleLeave`.
  // ported: handleLeave
  app.post('/api/sites/:key/leave', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    if (await overLimitOrClosed(pool, `leave:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const account = await accountByEmail(pool, email)
    const grant = account ? await grantRowFor(pool, siteKey, account.id) : null
    if (!grant || grant.revoked_at || grant.declined_at) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (grant.role === 'owner' && (await ownersOf(pool, siteKey)).length <= 1) {
      return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
    }
    try {
      const revoked = await leaveGrant(pool, siteKey, account.id)
      if (!revoked) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
      // `left`, not `revoked` — matches the Worker's `handleLeave` (index.js:4863) verbatim. The
      // Worker did NOT chase the person's live sessions here, reading a voluntary leave as no
      // security response; since 13/09 it does (plan first-site-build-onboarding §4, P08): a seat
      // given up is a seat gone, and a session that keeps writing to the site for up to twelve
      // hours after "I left" is not what anybody who pressed Leave meant.
      const lanes = await revokeSeatSessions(config, seatDoor, email, siteKey, pool)
      await opsFor(pool).record('team.leave', { email, accountId: account.id, siteKey })
      // T10: everyone still on the team. Only a seat that was held counts as leaving; withdrawing
      // an unanswered invitation or a request through this door is nobody's news.
      if (grant.edit_requested_at) await settleNotifications(editRef(siteKey, account.id))
      if (grant.accepted_at) {
        const team = await teamOf(pool, siteKey)
        await notify({
          recipients: team.map((r) => r.account_id),
          kind: 'team.left',
          siteKey,
          actor: account.id,
          data: { role: grant.role }
        })
      }
      return json(c, lanes.length > 0 ? { left: true, lanes } : { left: true })
    } catch (error) {
      if (error instanceof SeatStoreRejected) return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
      throw error
    }
  })

  // ── POST /me/sites/:key/join-request — ask to join a site nobody invited you to ───────────────
  // Ported from `handleSiteJoinRequest`.
  // ported: handleSiteJoinRequest
  app.post('/me/sites/:key/join-request', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    if (await overLimitOrClosed(pool, `join-request:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const answer = await joinRequest(pool, notify, { siteKey, email })
    return json(c, answer.body, answer.status)
  })

  // ── GET|POST /invite/:token/decline — "Not for you? Decline" in the invitation mail ───────────
  // (#809 case T6). The signed token is the authority, as it is for the accept link's naming of the
  // person and sites: the person holding the mail may say "no" without signing in first, since a
  // decline grants nothing. The GET only shows what is still open and a button; the POST (sent by
  // that button, same address) declines every invitation the token names that is still open and
  // tells each inviter. Rate-limited by token, like the accept link.
  const declineState = async (invite) => {
    const account = await accountByEmail(pool, invite.email)
    const open = []
    let accepted = false
    let declined = false
    for (const siteKey of invite.siteKeys) {
      const row = account ? await grantRowFor(pool, siteKey, account.id) : null
      if (!row || row.revoked_at || row.requested_at) continue
      if (row.declined_at) declined = true
      else if (row.accepted_at) accepted = true
      else open.push(siteKey)
    }
    return { account, open, accepted, declined }
  }

  app.get('/invite/:token/decline', async (c) => {
    const token = c.req.param('token')
    const lang = requestLanguage(c)
    if (await overLimitOrClosed(pool, `invite-decline:${token}`, WRITE_LIMIT_PER_HOUR, now())) {
      return renderedPage(c, tooManyRequestsPage(lang), 429)
    }
    const invite = await verifyTeamInvite(token, config.sessionSecret)
    if (!invite) return renderedPage(c, invalidInvitePage(lang), 404)
    const { open, accepted, declined } = await declineState(invite)
    const state = open.length > 0 ? 'confirm' : declined ? 'declined' : accepted ? 'already' : 'revoked'
    return renderedPage(
      c,
      declineInvitePage({
        state,
        siteKeys: state === 'confirm' ? open : invite.siteKeys,
        action: `/invite/${encodeURIComponent(token)}/decline`,
        lang
      })
    )
  })

  app.post('/invite/:token/decline', async (c) => {
    const token = c.req.param('token')
    if (await overLimitOrClosed(pool, `invite-decline:${token}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const invite = await verifyTeamInvite(token, config.sessionSecret)
    if (!invite) return json(c, { code: 'INVITE_INVALID' }, 404)
    const { account, open } = await declineState(invite)
    const declined = []
    for (const siteKey of open) {
      if ((await declineInvitation(pool, notify, siteKey, account.id, settleNotifications)) === 'declined')
        declined.push(siteKey)
    }
    return json(c, { declined })
  })

  // ── GET /invite/:token — the button in the invitation mail; clicking it IS accepting ──────────
  // Ported from `acceptInviteLink` calling `handleTeamAccept`. Rate-limited by TOKEN, not by
  // account or IP: the viewer is not necessarily signed in yet when this fires (that is the whole
  // point of the door), so there is no account to key by, and — same gap as every other door in
  // this file — no client IP reaches this app's routes yet. A token is still something an
  // attacker cannot mint for free (it must be a real, signed invite), so keying by it caps
  // hammering any ONE link without needing either of the other two.
  // ported: handleTeamAccept
  app.get('/invite/:token', async (c) => {
    const token = c.req.param('token')
    if (await overLimitOrClosed(pool, `invite-accept:${token}`, WRITE_LIMIT_PER_HOUR, now())) {
      return renderedPage(c, tooManyRequestsPage(requestLanguage(c)), 429)
    }
    const invite = await verifyTeamInvite(token, config.sessionSecret)
    if (!invite) return renderedPage(c, invalidInvitePage(requestLanguage(c)), 404)
    // 🔒 #804: the link's age, before anyone is sent to sign in and before any account, seat or
    // audit row is touched. An expired link changes nothing: the pending row stays for a new
    // invitation, and a seat already accepted is not taken away.
    const age = teamInviteAge(invite, now())
    if (age === 'invalid') return renderedPage(c, invalidInvitePage(requestLanguage(c)), 404)
    if (age === 'expired') return renderedPage(c, expiredInvitePage(requestLanguage(c)), 410)

    const viewer = await viewerOf(c, config)
    const loginHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`
    if (!viewer) return c.redirect(loginHref, 303)
    if (viewer !== invite.email) {
      return renderedPage(
        c,
        wrongAccountPage({ email: invite.email, loginHref, lang: requestLanguage(c) }),
        403
      )
    }

    const account = await ensureAccount(pool, viewer)
    const outcomes = []
    let accepted = 0
    for (const siteKey of invite.siteKeys) {
      const row = await grantRowFor(pool, siteKey, account.id)
      if (!row || row.revoked_at || row.declined_at) {
        outcomes.push({ siteKey, outcome: 'revoked' })
        continue
      }
      if (row.accepted_at) {
        outcomes.push({ siteKey, outcome: 'already' })
        continue
      }
      if (row.requested_at) {
        outcomes.push({ siteKey, outcome: 'revoked' })
        continue
      }
      const flipped = await acceptGrant(pool, siteKey, account.id)
      if (!flipped) {
        const fresh = await grantRowFor(pool, siteKey, account.id)
        const stillOpen = fresh && !fresh.revoked_at && !fresh.declined_at
        outcomes.push({ siteKey, outcome: stillOpen && fresh.accepted_at ? 'already' : 'revoked' })
        continue
      }
      accepted += 1
      await opsFor(pool).record('team.accept', {
        email: viewer,
        accountId: account.id,
        siteKey,
        data: { role: row.role }
      })
      await announceAccepted(pool, notify, siteKey, account.id, flipped, settleNotifications)
      outcomes.push({ siteKey, outcome: 'accepted' })
    }
    const summary =
      accepted > 0 ? 'accepted' : outcomes.some((s) => s.outcome === 'already') ? 'already' : 'revoked'
    return renderedPage(
      c,
      inviteLandingPage({
        summary,
        role: invite.role,
        sites: outcomes,
        email: viewer,
        lang: requestLanguage(c)
      })
    )
  })

  // ── GET/POST /:label/team, /:label/join — the plain-HTML surface on cowork.tracy.ai ────────────
  // Ported from `workers/cowork/src/index.js` (`serve` at :56 for `/team`, `serveJoinRequest` at
  // :310 for `/join`). `label` never carries a dot (a site key always does) and is never `api` —
  // both guard against shadowing `/api/*` and the dotted-siteKey routes above.
  const LABEL = /^[a-z0-9-]+$/

  app.on(['GET', 'POST'], '/:label/team', async (c) => {
    const label = c.req.param('label')
    if (label === 'api' || !LABEL.test(label)) return c.notFound()
    const siteKey = await siteKeyForLabel(pool, label)
    if (!siteKey) {
      const lang = requestLanguage(c)
      return renderedPage(
        c,
        messagePage(
          translate(lang, 'seats.unknownSiteTitle'),
          translate(lang, 'seats.unknownSiteBody'),
          lang
        ),
        404
      )
    }

    const viewer = await viewerOf(c, config)
    if (!viewer) return c.redirect(`/login?next=${encodeURIComponent(`/${label}/team`)}`, 303)

    if (c.req.method === 'POST') {
      // The Worker's own invite form on this page has been dead since the team door moved to
      // `/api/team/invite` — it answers the same notice rather than pretend a form still works.
      const lang = requestLanguage(c)
      return renderedPage(
        c,
        messagePage(translate(lang, 'seats.teamMovedTitle'), translate(lang, 'seats.teamMovedBody'), lang)
      )
    }

    const account = await ensureAccount(pool, viewer)
    const grant = await grantFor(pool, account.id, siteKey)
    if (!grant) {
      const lang = requestLanguage(c)
      return renderedPage(
        c,
        messagePage(translate(lang, 'seats.cannotLoadTitle'), translate(lang, 'seats.cannotLoadBody'), lang),
        403
      )
    }
    const book = await seatsOfSite(pool, siteKey)
    const granters = await emailsFor(
      pool,
      book.map((r) => r.granted_by)
    )
    const rows = book.map((r) => rosterRow(r, granters))
    return renderedPage(c, teamPage({ siteKey, seats: rows, viewer, lang: requestLanguage(c) }))
  })

  app.on(['GET', 'POST'], '/:label/join', async (c) => {
    const label = c.req.param('label')
    if (label === 'api' || !LABEL.test(label)) return c.notFound()
    const siteKey = await siteKeyForLabel(pool, label)
    if (!siteKey) {
      const lang = requestLanguage(c)
      return renderedPage(
        c,
        messagePage(
          translate(lang, 'seats.unknownSiteTitle'),
          translate(lang, 'seats.unknownSiteBody'),
          lang
        ),
        404
      )
    }

    // Review round 2, finding 3: `next` used to go nowhere — `joinPage`'s accept form hardcoded
    // its landing spot to `/`. Read here from the query string only (never the POST body): the
    // "Ask for access" form below carries no `action`, so a browser posts back to THIS SAME URL,
    // query string included — no hidden field needed to survive the round trip. Defaults to this
    // site's own team page, matching the anonymous-visitor redirect just below.
    const next = c.req.query('next') ?? `/${label}/team`

    const viewer = await viewerOf(c, config)
    if (!viewer) return c.redirect(`/login?next=${encodeURIComponent(next)}`, 303)

    if (c.req.method !== 'POST') {
      // 🔒 ASK THE BOOK BEFORE DRAWING THE FORM. `joinPage` has always had an `invited` state with
      // an Accept button, and until 11/09 a GET could not reach it: the state was only ever passed
      // after a POST came back `ALREADY_INVITED`. So somebody holding an invitation was shown
      // "Ask for access", had to ask for something they already had, and only then met the button
      // — and `workspace/route.js`'s empty-handed page now links people straight here, which makes
      // that the first thing an invited person sees.
      //
      // Same reasoning as that page's own: a screen that tells you to ask for what you were
      // already given is a screen that says something untrue.
      // This file's own `grantRowFor` (see its note above), not the store's: same question, and
      // the argument order differs — `(pool, siteKey, accountId)`.
      const account = await accountByEmail(pool, viewer)
      const row = account ? await grantRowFor(pool, siteKey, account.id) : null
      const live = row && !row.revoked_at && !row.declined_at
      const settled = live ? (row.accepted_at ? 'granted' : row.requested_at ? null : 'invited') : null
      return renderedPage(
        c,
        joinPage({
          siteKey,
          viewer,
          next,
          origin: config.origin,
          settled,
          requested: Boolean(live && !row.accepted_at && row.requested_at),
          lang: requestLanguage(c)
        })
      )
    }

    const answer = await joinRequest(pool, notify, { siteKey, email: viewer })
    if (!answer.ok) {
      const settled = { ALREADY_INVITED: 'invited', ALREADY_GRANTED: 'granted', SITE_UNCLAIMED: 'unclaimed' }[
        answer.body.code
      ]
      const status = [400, 403, 404, 409].includes(answer.status) ? answer.status : 502
      return renderedPage(
        c,
        joinPage({
          siteKey,
          viewer,
          next,
          origin: config.origin,
          settled,
          error: settled ? null : translate(requestLanguage(c), 'seats.somethingWrong'),
          lang: requestLanguage(c)
        }),
        status
      )
    }
    return renderedPage(
      c,
      joinPage({
        siteKey,
        viewer,
        next,
        origin: config.origin,
        sender: mailSender(config),
        requested: true,
        lang: requestLanguage(c)
      })
    )
  })

  return app
}

/** Shared write for "ask to join" — the JSON door (`POST /me/sites/:key/join-request`) and the
 * plain-HTML door (`POST /:label/join`) do the same thing. Ported from `handleSiteJoinRequest`.
 * Every Owner (ADR 0028; Admins until then) is told through the notifier (T2): one row and one letter each, in THEIR
 * language (the notifier reads it per recipient), all sharing one `ref` so the first answer
 * settles the rest. */
async function joinRequest(pool, notify, { siteKey, email }) {
  const account = await ensureAccount(pool, email)
  const owners = await ownersOf(pool, siteKey)
  if (owners.length === 0) return { ok: false, status: 404, body: { code: 'SITE_UNCLAIMED' } }

  const existing = await grantRowFor(pool, siteKey, account.id)
  if (existing?.accepted_at && !existing.revoked_at) {
    return { ok: false, status: 409, body: { code: 'ALREADY_GRANTED' } }
  }
  if (existing && !existing.requested_at && !existing.revoked_at && !existing.declined_at) {
    return { ok: false, status: 409, body: { code: 'ALREADY_INVITED' } }
  }
  if (existing?.requested_at && !existing.accepted_at && !existing.revoked_at && !existing.declined_at) {
    return { ok: true, status: 200, body: { requested: true, already: true } }
  }

  await requestSiteJoin(pool, siteKey, account.id)

  try {
    const team = await teamOf(pool, siteKey)
    await notify({
      recipients: team.filter(isOwnerRow).map((r) => r.account_id),
      kind: 'team.join_request',
      siteKey,
      actor: account.id,
      ref: joinRef(siteKey, account.id)
    })
  } catch {
    // The bell failing does not undo the request already on the book.
  }

  return { ok: true, status: 201, body: { requested: true, already: false } }
}

/** `label -> site_key` — the reverse of `fleetLabel`, which cannot be inverted from the string
 * alone (its docstring says so). No domain owns the `site` table yet, so this reads it directly,
 * same reasoning as `siteMetaFor` above. */
async function siteKeyForLabel(pool, label) {
  const { rows } = await pool.query('select site_key from site where label = $1', [label])
  return rows[0]?.site_key ?? null
}

// Page rendering for this file's plain-HTML doors lives in `./pages.js` — same shared
// `pageShell` every other Tracy-owned page in this app uses (`docs/references/page-shell-tokens.md`).
