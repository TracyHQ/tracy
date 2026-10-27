/**
 * The seat book, in SQL — the data layer behind every site-membership route.
 *
 * Ported from `workers/seat-registry/src/seats.js` (PostgREST over Supabase) to plain
 * parameterised SQL against `002-book.sql`'s `seat`/`account` tables. Every function here answers
 * the SAME question, in the SAME shape, as the function of the same name in that file — read the
 * one there before touching the one here. Three deliberate departures, each because our schema
 * merged what the Worker split across `seat` + `seat_site`:
 *
 * 1. There is no separate grant id: `seat`'s primary key is `(site_key, account_id)`, so every
 *    function here takes those two directly where the Worker took a `seatId`/`siteKey` pair to
 *    look up a `grantId` first.
 * 2. `displayNamesFor` is keyed by `account_id`, not email — `granted_by` here is a uuid FK to
 *    `account(id)`, never an email string, so there is no email-keyed map to build.
 * 3. `rolePolicy`/`writeRolePolicy` read from two tables (`site_role_policy` — one current row per
 *    site — and `site_role_policy_history` — an append-only log), where the Worker's single
 *    append-only table serves both. `writeRolePolicy` upserts the former and appends to the
 *    latter in one transaction.
 */

import { importPendingKeys } from '../lib/import-pending.js'

/**
 * The seat book refused a write — today this means exactly one thing: `seat_keep_one_owner`
 * (002-book.sql) raised `errcode 23514` rather than let a site lose its last accepted owner.
 * Ported in spirit from `SeatStoreRejected` in `workers/seat-registry/src/seats.js`: that class
 * wraps ANY PostgREST 4xx so a route can read `status`/`detail`; this one wraps only the ONE
 * check-violation this app's schema can raise from a trigger with no declared constraint name, so
 * a route can map it straight to `{ code: 'LAST_OWNER' }` (index.js:5895) without also catching an
 * unrelated `role` check-constraint typo and mislabelling it the same way.
 */
export class SeatStoreRejected extends Error {
  constructor(code, detail) {
    super(`seat store refused the statement (${code})`)
    this.code = code
    this.detail = detail
  }
}

// `seat_keep_one_owner` (002-book.sql) raises this exact message via `raise exception ... using
// errcode = '23514'` — no declared constraint name, unlike a real `check (...)` violation (whose
// `error.constraint` names it and whose message never says "must keep one owner"). Matching on
// the message is how the two are told apart.
function rejectionFor(error) {
  if (error?.code === '23514' && /must keep one owner/.test(error.message ?? '')) {
    return new SeatStoreRejected('LAST_OWNER', error.message)
  }
  return error
}

/**
 * An account by email, or null. Ported from `seatByEmail` (seats.js:83-97) — same shape, our own
 * table. Lower-cased before the query, matching `seatByEmail`'s own `email.toLowerCase()`: without
 * it, `Foo@x.y` and `foo@x.y` would silently resolve to two different accounts on a
 * case-sensitive `text` column, the exact kind of gap that a caller passing an unnormalized
 * address later would trip on without any error to point at it.
 */
/**
 * The interface language each address last chose (`account.language`, stored by the Inbox poll
 * when the person picks one in Settings, #809), so mail someone else triggers reaches them in it.
 * Addresses with no account or no choice are absent from the map.
 * @returns {Promise<Map<string, string>>} lower-cased email → language id
 */
export async function languagesByEmail(pool, emails) {
  const wanted = [...new Set(emails.filter((e) => typeof e === 'string').map((e) => e.toLowerCase()))]
  if (wanted.length === 0) return new Map()
  const { rows } = await pool.query(
    'select email, language from account where email = any($1::text[]) and language is not null',
    [wanted]
  )
  return new Map(rows.map((r) => [r.email, r.language]))
}

export async function accountByEmail(pool, email) {
  const { rows } = await pool.query(
    'select id, email, display_name, avatar_url from account where email = $1',
    [email.toLowerCase()]
  )
  return rows[0] ?? null
}

/**
 * The account for this email, creating it if needed. Ported from `ensureSeat`'s shape (`{ id }`),
 * simplified to email-only: this app has no `supabase_user_id` to key on, and `account.email` is
 * already unique. Idempotent — a second call for the same email returns the same id and touches
 * no other column (`identity/store.js`'s `touchAccount` owns `last_seen_at`; this is not that).
 */
export async function ensureAccount(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1)
     on conflict (email) do update set email = excluded.email
     returning id`,
    [email]
  )
  return { id: rows[0].id }
}

/**
 * This account's live grant on this site — accepted, not revoked, not declined — or null. Ported
 * from `liveSiteGrant`/`grantFor`: same three filters, same meaning (an unanswered invite or a
 * pending join request is not a seat).
 */
export async function grantFor(pool, accountId, siteKey) {
  const { rows } = await pool.query(
    `select * from seat
     where account_id = $1 and site_key = $2
       and revoked_at is null and declined_at is null and accepted_at is not null`,
    [accountId, siteKey]
  )
  return rows[0] ?? null
}

/**
 * The raw seat row for this (account, site) pair, at ANY status — revoked, declined, still-pending
 * (invited or requested but not yet accepted), or accepted — or null when no row was ever written.
 * Ported from `grantRowFor`, and deliberately NOT filtered the way `grantFor` is: `grantFor`'s
 * accepted-only view collapses "no row exists" and "a row exists but is not currently live" into
 * the same `null`, which is exactly right for authorization (an unanswered invite is not a seat)
 * but wrong for a caller that needs to tell those two states apart before deciding whether to
 * revive an existing row (`setGrantRole`) or write a fresh one (`grantSite`) — `grantSite`'s own
 * `ON CONFLICT ... WHERE revoked_at IS NOT NULL OR declined_at IS NOT NULL` silently no-ops against
 * a row that is live but still unaccepted, so a caller that mistook "unaccepted" for "no row" would
 * insert nothing and lose the write. `sites/route.js`'s `ensureSiteOwnerSeat` is that caller.
 */
export async function grantRowFor(pool, accountId, siteKey) {
  const { rows } = await pool.query('select * from seat where account_id = $1 and site_key = $2', [
    accountId,
    siteKey
  ])
  return rows[0] ?? null
}

/**
 * Every grant ever written for this site, joined with the account's email, display name and
 * picture (what `rosterRow` builds a face from, `lib/person-face.js`) — ported
 * from `seatsOfSite`. NOT FILTERED BY STATUS, on purpose and against this task's own brief: the
 * Worker's `seatsOfSite` carries no `revoked_at`/`declined_at` filter either (its SQL selects every
 * row unconditionally), and its one caller that renders a roster screen (`rosterRow`, index.js:4040)
 * deliberately shows `status: 'revoked'` rows so Admin sees who used to be here. Filtering here
 * would take that screen away. Callers that want only live grants filter client-side, same as
 * `handleFleetAccess` (index.js:597) already does.
 *
 * `order by granted_at asc` IS OURS, not the Worker's. PostgREST's `seatsOfSite` has no `order`
 * clause at all — Postgres gives no guarantee on row order without one, and the Worker has simply
 * never needed a stable one. This is a deliberate addition (determinism for a roster list), not a
 * gap: do not delete it in the name of matching the Worker more closely.
 */
export async function seatsOfSite(pool, siteKey) {
  const { rows } = await pool.query(
    `select s.*, a.email as account_email, a.display_name as account_display_name,
            a.avatar_url as account_avatar_url
     from seat s join account a on a.id = s.account_id
     where s.site_key = $1
     order by s.granted_at asc`,
    [siteKey]
  )
  return rows.map(({ account_email, account_display_name, account_avatar_url, ...seat }) => ({
    ...seat,
    seat: { email: account_email, display_name: account_display_name, avatar_url: account_avatar_url }
  }))
}

/**
 * Every site this account holds a LIVE grant on (not revoked, not declined — same filter as
 * `sitesOfSeat`), each carrying a computed `status`. `sitesOfSeat` itself returns no such field —
 * it is `handleMySites` (index.js:7492) that computes `accepted | requested | pending` from
 * `accepted_at`/`requested_at`. That computation is ported here rather than left to a caller,
 * since this app has no second module standing between the store and the route for it to live in.
 */
export async function sitesOfAccount(pool, accountId) {
  const { rows } = await pool.query(
    `select * from seat
     where account_id = $1 and revoked_at is null and declined_at is null
     order by granted_at asc`,
    [accountId]
  )
  return rows.map((row) => ({
    ...row,
    status: row.accepted_at ? 'accepted' : row.requested_at ? 'requested' : 'pending'
  }))
}

/**
 * The first site this email holds an ACCEPTED seat on, in `sitesOfAccount`'s own order (earliest
 * `granted_at`), or null — Plan 2 T9's `defaultSite`: where a signed-in viewer with no site named
 * by the path, the Referer, or the `tracy_site` cookie is sent (`workspace/route.js`'s bare-root
 * branch) and what `GET /auth/me` reports for the shell to open on its own.
 *
 * NOT a port of `workers/cowork-web/src/worker.js`'s `defaultSite` (:1154) — that function takes an
 * already-decided siteKey (the viewer's `tracy_site` pointer, or `env.GUEST_SITE_KEY`) and returns
 * a rich descriptor (`{siteKey, label, siteUrl, agent, guestView}`) for it; it never asks what
 * sites an ACCOUNT holds. This task's brief names this same field for a different, simpler
 * question this app actually needs answered — reusing the name, not the Worker's logic — and there
 * is nothing in the Worker to disagree with here: it has no equivalent lookup to carry over.
 */
export async function defaultSiteFor(pool, email) {
  return (await landingFor(pool, email)).site
}

/**
 * The first accepted seat whose import is NOT finished (`lib/import-pending.js`), or null — where a
 * person whose only accepted seats are unfinished imports is sent instead of a workspace (the
 * import recovery page, `workspace/route.js`'s bare-root branch).
 */
export async function unfinishedImportFor(pool, email) {
  return (await landingFor(pool, email)).unfinished
}

/**
 * 🔒 AN UNFINISHED IMPORT IS NOT A WORKSPACE. An import's seat is accepted the moment its row is
 * claimed, before the read; a read that failed keeps the row so Retry can reuse it (#1578). Picking
 * the earliest accepted seat sent such a person straight into a site with no folder on its host,
 * where dsh answers `workspace/invalid-path` and draws "Choose workspace" with a dead composer. A
 * ready site comes first; the unfinished import is named apart.
 */
async function landingFor(pool, email) {
  const account = await accountByEmail(pool, email)
  if (!account) return { site: null, unfinished: null }
  const accepted = (await sitesOfAccount(pool, account.id)).filter((s) => s.status === 'accepted')
  const unfinished = await importPendingKeys(
    pool,
    accepted.map((s) => s.site_key)
  )
  return {
    site: accepted.find((s) => !unfinished.has(s.site_key))?.site_key ?? null,
    unfinished: accepted.find((s) => unfinished.has(s.site_key))?.site_key ?? null
  }
}

/**
 * Site keys this email has been INVITED to and has not yet answered — the state that sits between
 * "has no sites" and "has a site".
 *
 * 🔒 IT EXISTS BECAUSE THE NO-SITES PAGE WOULD OTHERWISE LIE. `workspace/route.js` reaches its
 * empty-handed branch on `defaultSiteFor` returning null, and that function counts only ACCEPTED
 * seats — so a person invited an hour ago and standing at the door is, to that branch,
 * indistinguishable from a stranger. Telling them "nobody has invited this address" when the
 * invitation is sitting in their inbox is worse than saying nothing.
 *
 * Returns the LABEL too, because the page that acts on this links to `/<label>/join`
 * (`seats/route.js`'s plain-HTML surface, whose `:label` never carries a dot), not to the site key.
 */
export async function pendingInvitesFor(pool, email) {
  const account = await accountByEmail(pool, email)
  if (!account) return []
  const { rows } = await pool.query(
    `select seat.site_key, site.label from seat
     join site on site.site_key = seat.site_key
     where seat.account_id = $1
       and seat.revoked_at is null and seat.declined_at is null
       and seat.accepted_at is null and seat.requested_at is null
     order by seat.granted_at asc`,
    [account.id]
  )
  return rows.map((r) => ({ siteKey: r.site_key, label: r.label }))
}

/**
 * Accounts holding a LIVE owner grant on this site — accepted, not revoked, not declined. Ported
 * from `ownersOf`: the last-owner guard (`setGrantRole`/`revokeGrant` callers) counts with this,
 * same as the Worker counts before calling `setGrantRole`/`revokeGrant` (index.js:4547, 4611,
 * 4848) rather than relying solely on the trigger.
 */
export async function ownersOf(pool, siteKey) {
  const { rows } = await pool.query(
    `select account_id from seat
     where site_key = $1 and role = 'owner'
       and revoked_at is null and declined_at is null and accepted_at is not null`,
    [siteKey]
  )
  return rows
}

/**
 * Grant (or re-grant) a site seat. Ported from `grantSite`'s revival rule: a row that is currently
 * revoked or declined is REVIVED — every prior answer (`accepted_at`, `declined_at`, `seen_at`,
 * and since #792 the `removal_kind` an administrator closed it with) resets, because a re-invitation is a new invitation, not the old one continuing. A row that is
 * currently LIVE (neither revoked nor declined) is left untouched and this returns null — same as
 * the Worker, whose PATCH-then-fallback-to-POST also only revives a dead row and otherwise leaves
 * a live one alone (callers are expected to check `grantRowFor`/`grantFor` first, exactly as
 * `admitToSite`, index.js:4225, does before ever calling `grantSite`).
 *
 * `activate`/`requested` are new here, replacing what the Worker does with a second call
 * (`grantSite` then `acceptGrant`): with one write statement instead of a REST round trip, folding
 * "grant it already-accepted" into the same statement removes a call rather than adding one.
 *
 * The two flags are INDEPENDENT, not mutually exclusive, and neither one "wins" over the other:
 * passing both stamps both `requested_at` and `accepted_at` to the same `now()`. This is not an
 * unhandled edge case — it is the exact final shape `requestSiteJoin` followed by
 * `approveSiteJoinRequest` produces (a request that is also accepted, with `requested_at`
 * preserved through the approval, seats.js:1958-1979's own comment says so). Passing both here
 * lets a caller record an immediately-approved join request in one write instead of two.
 */
export async function grantSite(
  pool,
  {
    siteKey,
    accountId,
    role = 'editor',
    grantedBy,
    activate = false,
    requested = false,
    createdByProof = null
  }
) {
  const acceptedAt = activate ? new Date() : null
  const requestedAt = requested ? new Date() : null
  const { rows } = await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, granted_at, accepted_at, requested_at, created_by_proof)
     values ($1, $2, $3, $4, now(), $5, $6, $7)
     on conflict (site_key, account_id) do update set
       role = excluded.role,
       granted_by = excluded.granted_by,
       granted_at = now(),
       accepted_at = excluded.accepted_at,
       requested_at = excluded.requested_at,
       declined_at = null,
       revoked_at = null,
       removal_kind = null,
       seen_at = null,
       edit_requested_at = null,
       created_by_proof = coalesce(excluded.created_by_proof, seat.created_by_proof)
     where seat.revoked_at is not null or seat.declined_at is not null
     returning *`,
    [siteKey, accountId, role, grantedBy, acceptedAt, requestedAt, createdByProof]
  )
  return rows[0] ?? null
}

/**
 * The invitee says "in" — a conditional UPDATE, same shape as `acceptGrant`: a second call matches
 * nothing (already accepted, or never invited) and returns null rather than erroring.
 */
export async function acceptGrant(pool, siteKey, accountId) {
  const { rows } = await pool.query(
    `update seat set accepted_at = now()
     where site_key = $1 and account_id = $2
       and revoked_at is null and declined_at is null and accepted_at is null
     returning *`,
    [siteKey, accountId]
  )
  return rows[0] ?? null
}

/** The invitee says "no" — ported from `declineGrant`, same conditional-UPDATE shape as `acceptGrant`. */
export async function declineGrant(pool, siteKey, accountId) {
  const { rows } = await pool.query(
    `update seat set declined_at = now()
     where site_key = $1 and account_id = $2
       and revoked_at is null and declined_at is null and accepted_at is null
     returning *`,
    [siteKey, accountId]
  )
  return rows[0] ?? null
}

/**
 * Change a live grant's role. Ported from `setGrantRole`. The last-owner guard lives in the
 * CALLER (read `ownersOf` first, same as index.js:4547/4611) — this only carries the trigger's
 * refusal upward as `SeatStoreRejected` when the caller's own count was stale or skipped.
 *
 * `expectedRole` (#792) makes the write a compare-and-set: it lands only while the row still
 * holds the role the caller read, so the role a caller reports as "changed from" is the role this
 * statement replaced, and a change somebody else made in between is refused (null) rather than
 * overwritten. Left out, the write is unconditional as before (`sites/route.js`'s bootstrap).
 */
export async function setGrantRole(pool, siteKey, accountId, role, expectedRole = null) {
  try {
    const { rows } = await pool.query(
      // Any role change answers a Viewer's request for edit access (079), so the request goes too.
      `update seat set role = $3, edit_requested_at = null
       where site_key = $1 and account_id = $2 and revoked_at is null${expectedRole === null ? '' : ' and role = $4'}
       returning *`,
      expectedRole === null ? [siteKey, accountId, role] : [siteKey, accountId, role, expectedRole]
    )
    return rows[0] ?? null
  } catch (error) {
    throw rejectionFor(error)
  }
}

/**
 * The three ways an administrator takes a row off a site's book (#792), each with the state of
 * the row it acts on. One press is one of these: Revoke access ends a seat somebody holds, Cancel
 * invitation withdraws an invitation nobody answered, Decline request turns down somebody who
 * asked. The condition is repeated in the UPDATE (`revokeGrant`), so a confirmation read off an
 * older state of the row cannot act on the state it has now.
 *
 * Fixed text, never built from input: a kind is looked up here with `Object.hasOwn` first.
 */
const REMOVAL_STATE = Object.freeze({
  revoke: 'accepted_at is not null',
  cancel_invite: 'accepted_at is null and requested_at is null',
  decline_request: 'accepted_at is null and requested_at is not null'
})

/** Whether `kind` names one of the three administrator removals. */
export const isRemovalKind = (kind) => typeof kind === 'string' && Object.hasOwn(REMOVAL_STATE, kind)

/**
 * Which removal a row calls for right now, or null when there is nothing left to remove (already
 * revoked, or declined by the invitee). The same three states as `REMOVAL_STATE`, read off a row.
 * @param {object|null} row - a `seat` row at any status.
 * @returns {'revoke'|'cancel_invite'|'decline_request'|null}
 */
export function removalKindOf(row) {
  if (!row || row.revoked_at || row.declined_at) return null
  if (row.accepted_at) return 'revoke'
  return row.requested_at ? 'decline_request' : 'cancel_invite'
}

/**
 * Revoke one grant. Ported from `revokeGrant`. Same last-owner note as `setGrantRole`: the guard
 * is the caller's job, this only translates the trigger's refusal into `SeatStoreRejected`.
 *
 * With a `kind` (#792) the row is closed AS that act: `removal_kind` is written in the same
 * statement as `revoked_at`, and only while the row is still in the state that kind acts on.
 * `revoked_at` stays the one fence every authorisation read uses; `declined_at` stays the
 * invitee's own answer. Without a kind (a person leaving) the row closes with no kind, as before.
 *
 * `expectedRole` makes the write a compare-and-set on the role as well, for every kind: who may
 * remove a row depends on the role it holds (only an owner removes an owner), and the caller made
 * that decision on the role it read. The write lands only while the row still holds that role, so
 * a seat promoted to owner between the read and the write is not removed on the editor's rule.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string} accountId
 * @param {'revoke'|'cancel_invite'|'decline_request'|null} [kind]
 * @param {string|null} [expectedRole] only with a kind
 */
/**
 * Give up one's own seat: closed as `left` (059-seat-removal-left.sql), so the Team tab says "Left",
 * not "Revoked". Same fence as `revokeGrant` without a kind.
 */
export async function leaveGrant(pool, siteKey, accountId) {
  try {
    const { rows } = await pool.query(
      `update seat set revoked_at = now(), removal_kind = 'left'
        where site_key = $1 and account_id = $2 and revoked_at is null
        returning *`,
      [siteKey, accountId]
    )
    return rows[0] ?? null
  } catch (error) {
    throw rejectionFor(error)
  }
}

export async function revokeGrant(pool, siteKey, accountId, kind = null, expectedRole = null) {
  if (kind !== null && !isRemovalKind(kind)) throw new TypeError('unknown removal kind')
  if (expectedRole !== null && (kind === null || typeof expectedRole !== 'string'))
    throw new TypeError('an expected role goes with a removal kind')
  try {
    const { rows } = await pool.query(
      kind === null
        ? `update seat set revoked_at = now()
       where site_key = $1 and account_id = $2 and revoked_at is null
       returning *`
        : `update seat set revoked_at = now(), removal_kind = $3
       where site_key = $1 and account_id = $2 and revoked_at is null and declined_at is null
         and ${REMOVAL_STATE[kind]}${expectedRole === null ? '' : ' and role = $4'}
       returning *`,
      kind === null
        ? [siteKey, accountId]
        : expectedRole === null
          ? [siteKey, accountId, kind]
          : [siteKey, accountId, kind, expectedRole]
    )
    return rows[0] ?? null
  } catch (error) {
    throw rejectionFor(error)
  }
}

/**
 * Revoke every living grant on a site in one statement — whole-site teardown. Ported from
 * `revokeAllGrants`, which returns a COUNT, not rows — same here. Goes through
 * `seat_revoke_all_site_grants` (002-book.sql), the one function allowed to set
 * `tracy.site_teardown` and open `seat_keep_one_owner`'s escape hatch for exactly this site; a
 * plain `update` here would hit the same trigger `revokeAllGrants`'s Worker-side docstring warns
 * about (seats.js:427).
 */
export async function revokeAllGrants(pool, siteKey) {
  const { rows } = await pool.query('select * from seat_revoke_all_site_grants($1)', [siteKey])
  return rows.length
}

/**
 * A self-request to join a site — ported from `requestSiteJoin`. Same revival rule as `grantSite`,
 * widened by one case: a row that is already a PENDING REQUEST (not yet answered) also revives,
 * making a repeat request idempotent instead of erroring, exactly as the Worker's `or=(...)` filter
 * does. `grantedBy` is the requester's own account — Worker passes `seat.email ?? seat.id`
 * (index.js:4690), i.e. the requester identifying themselves; there being no email-shaped
 * `granted_by` here, that is the account id.
 */
export async function requestSiteJoin(pool, siteKey, accountId) {
  // The role on a request is a placeholder until an Owner answers: approving writes the role the
  // Owner picks (`approveSiteJoinRequest`), and a request grants nothing before that.
  const { rows } = await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, granted_at, requested_at)
     values ($1, $2, 'editor', $2, now(), now())
     on conflict (site_key, account_id) do update set
       role = 'editor',
       granted_by = excluded.granted_by,
       granted_at = now(),
       requested_at = now(),
       accepted_at = null,
       declined_at = null,
       revoked_at = null,
       removal_kind = null,
       seen_at = null,
       edit_requested_at = null
     where seat.revoked_at is not null or seat.declined_at is not null or seat.requested_at is not null
     returning *`,
    [siteKey, accountId]
  )
  return rows[0] ?? null
}

/**
 * Approve a pending join request — ported from `approveSiteJoinRequest`. Conditional UPDATE, same
 * discipline as the Worker's comment on `approveJoinRequest` (seats.js:629): filtering at the
 * write, not at a read taken earlier, so a request revoked or approved by someone else between
 * read and write cannot be silently resurrected. `requested_at` is left untouched — it still says
 * who asked, after approval.
 */
export async function approveSiteJoinRequest(pool, siteKey, accountId, role, approvedBy) {
  const { rows } = await pool.query(
    // `granted_at` is the approval, not the request: the row was written when the person asked, and
    // the Team tab read "Granted 53 minutes ago" for an approval made just now (dev, 04/10/2026).
    // `requested_at` keeps when they asked.
    `update seat set role = $3, granted_by = $4, granted_at = now(), accepted_at = now(), declined_at = null, revoked_at = null
     where site_key = $1 and account_id = $2
       and revoked_at is null and declined_at is null and accepted_at is null
     returning *`,
    [siteKey, accountId, role, approvedBy]
  )
  return rows[0] ?? null
}

/**
 * A Viewer asks the site's Owners for edit access (ADR 0028 §6, migration 079). Stamps
 * `edit_requested_at` on the person's own LIVE `viewer` seat, only while no request is waiting, so
 * a second ask writes nothing. Returns the row when this call wrote the request, null otherwise
 * (already asked, or the seat is no longer a live viewer seat): the caller reads the row again to
 * tell which.
 */
export async function requestEditAccess(pool, siteKey, accountId) {
  const { rows } = await pool.query(
    `update seat set edit_requested_at = now()
     where site_key = $1 and account_id = $2 and role = 'viewer'
       and accepted_at is not null and revoked_at is null and declined_at is null
       and edit_requested_at is null
     returning *`,
    [siteKey, accountId]
  )
  return rows[0] ?? null
}

/**
 * An Owner answers a Viewer's request for edit access. `approve` makes the seat an `editor`;
 * `decline` only clears the request. Conditional on the request still waiting on a live viewer
 * seat, so two Owners answering at once settle it once: the second gets null.
 * @param {'approve'|'decline'} decision
 */
export async function answerEditAccess(pool, siteKey, accountId, decision) {
  if (decision !== 'approve' && decision !== 'decline') throw new TypeError('unknown decision')
  const { rows } = await pool.query(
    `update seat set edit_requested_at = null${decision === 'approve' ? ", role = 'editor'" : ''}
     where site_key = $1 and account_id = $2 and role = 'viewer'
       and accepted_at is not null and revoked_at is null and declined_at is null
       and edit_requested_at is not null
     returning *`,
    [siteKey, accountId]
  )
  return rows[0] ?? null
}

/**
 * Display names for a set of accounts, keyed by account id. Ported from `displayNamesFor`, keyed
 * by `account_id` instead of email — see the module docstring's departure #2. An id the book does
 * not know, or one with no display name set, is simply absent from the result; the caller falls
 * back to something else (usually the email), same discipline as the Worker's version.
 */
export async function displayNamesFor(pool, accountIds) {
  if (accountIds.length === 0) return {}
  const { rows } = await pool.query('select id, display_name from account where id = any($1::uuid[])', [
    accountIds
  ])
  const names = {}
  for (const row of rows) if (row.display_name) names[row.id] = row.display_name
  return names
}

/**
 * Emails for a set of accounts, keyed by account id — one query for a whole roster. The roster's
 * "granted by" is an account id in this book (`seat.granted_by`, 002-book.sql); the Team tab names
 * the granter, and an id is not a name (cowork.tracy.site, 29/09: "Granted … by 14283358-185e-…").
 * An id the book does not know is absent; the caller shows "someone" then.
 */
export async function emailsFor(pool, accountIds) {
  const ids = [...new Set(accountIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const { rows } = await pool.query('select id, email from account where id = any($1::uuid[])', [ids])
  const emails = {}
  for (const row of rows) emails[row.id] = row.email
  return emails
}

/**
 * NO LONGER IN FORCE (ADR 0028): each role holds a fixed set of toolsets (`seats/roles.js`), and
 * nothing that decides access reads this. Kept, with `writeRolePolicy`, only until the composition
 * root and the old tests stop naming it; the table stays as history.
 *
 * The role → toolset matrix once in force for a site, or null when it used the shipped default.
 * Ported from `siteRolePolicy`, reading our
 * schema's CURRENT-row table rather than taking the latest row of an append-only one — see the
 * module docstring's departure #3.
 */
export async function rolePolicy(pool, siteKey) {
  const { rows } = await pool.query(
    'select site_key, policy, updated_by, updated_at from site_role_policy where site_key = $1',
    [siteKey]
  )
  return rows[0] ?? null
}

/**
 * Write a new role policy for a site. Ported from `writeSiteRolePolicy`'s effect (a new current
 * matrix, and a history entry recording it), split across our two tables in one transaction:
 * upsert `site_role_policy` (the current row `rolePolicy` reads) and append to
 * `site_role_policy_history` (the log, latest first via its own index). Both write the same
 * `policy`/`updated_by`, or neither does.
 */
export async function writeRolePolicy(pool, siteKey, policy, updatedBy) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query(
      `insert into site_role_policy (site_key, policy, updated_by, updated_at)
       values ($1, $2::jsonb, $3, now())
       on conflict (site_key) do update set
         policy = excluded.policy, updated_by = excluded.updated_by, updated_at = now()
       returning site_key, policy, updated_by, updated_at`,
      [siteKey, JSON.stringify(policy), updatedBy]
    )
    await client.query(
      'insert into site_role_policy_history (site_key, policy, updated_by) values ($1, $2::jsonb, $3)',
      [siteKey, JSON.stringify(policy), updatedBy]
    )
    await client.query('commit')
    return rows[0]
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Distinct site keys carrying at least one live (not revoked, not declined) grant — the input
 * `workspaces/route.js`'s `/tracy-admin/overview` needs for its "declared vs. not yet declared into
 * a workspace" queue, handed through `deps.seats` (module-graph rule: that domain may not import
 * this store directly).
 *
 * Ported in spirit from the Worker's `allLegacySiteGrants`, but there is no legacy/current split to
 * port here: ADR 0067 made `seat` the only site book there ever was in this schema, so this reads
 * the exact table `grantFor` reads, distinct on `site_key` — not a second, older table.
 */
export async function liveSiteKeys(pool) {
  const { rows } = await pool.query(
    'select distinct site_key from seat where revoked_at is null and declined_at is null'
  )
  return rows.map((row) => row.site_key)
}

// ── The seat-sync outbox (`010-seat-sync.sql`) ────────────────────────────────────────────────

/**
 * Record one host that still has to hear about a seat's change.
 * @param {import('pg').Pool} pool
 * @param {{kind: 'revoke'|'mint', host: string, email: string, siteKey: string, payload?: object, error?: string|null}} input
 * @returns {Promise<number>} the row id.
 */
export async function enqueueSeatSync(pool, { kind, host, email, siteKey, payload = {}, error = null }) {
  const { rows } = await pool.query(
    `insert into seat_sync (kind, host, email, site_key, payload, attempts, last_error, next_at)
     values ($1, $2, $3, $4, $5::jsonb, 1, $6, now() + interval '30 seconds')
     returning id`,
    [kind, host, email, siteKey, JSON.stringify(payload), error]
  )
  return rows[0].id
}

/** The rows whose turn it is, oldest first. */
export async function dueSeatSyncs(pool, limit = 20) {
  const { rows } = await pool.query(
    'select * from seat_sync where done_at is null and next_at <= now() order by id limit $1',
    [limit]
  )
  return rows
}

/**
 * Settle one attempt: done, or back in the queue with a growing wait (30s · 2^attempts, capped
 * at an hour) and the reason it failed.
 * @param {import('pg').Pool} pool
 * @param {number} id
 * @param {{ok: boolean, error?: string|null}} outcome
 */
export async function settleSeatSync(pool, id, { ok, error = null }) {
  if (ok) {
    await pool.query('update seat_sync set done_at = now(), last_error = null where id = $1', [id])
    return
  }
  await pool.query(
    `update seat_sync set
       attempts = attempts + 1,
       last_error = $2,
       next_at = now() + least(interval '1 hour', interval '30 seconds' * power(2, attempts))
     where id = $1`,
    [id, error]
  )
}

/** Whether any host still owes a change for this (person, site) — what a caller reads before
 * reporting a revoke as complete. */
export async function pendingSeatSyncFor(pool, email, siteKey) {
  const { rows } = await pool.query(
    'select count(*)::int as n from seat_sync where done_at is null and email = $1 and site_key = $2',
    [email, siteKey]
  )
  return rows[0].n > 0
}
