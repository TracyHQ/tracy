/**
 * The workspace book, in SQL — an agency's grant across its sites, and Tracy's own staff team
 * (`workspace.kind = 'tracy_admin'`).
 *
 * Ported from the workspace-level book section of `workers/seat-registry/src/seats.js` (ADR 0046 —
 * functions named `workspace*`/`*Workspace*`/`tracyAdmin*`) to plain parameterised SQL against
 * `002-book.sql`'s `workspace`/`seat_workspace`/`workspace_site` tables. Read the Worker function of
 * the same name before touching the one here — same question, same shape, three departures:
 *
 * 1. NO SEPARATE GRANT ID. `seat_workspace`'s primary key is `(workspace_id, account_id)`, exactly
 *    the same departure `seats/store.js` already documents for `seat` — every function here takes
 *    those two directly where the Worker took a `grantId` to look up first.
 * 2. `workspace.display_name` IS A REAL UNIQUE COLUMN here (`002-book.sql:183`), where the Worker's
 *    equivalent check died with ADR 0046's org-entity cutover (`workspaceByName`'s own docstring
 *    records this history) — production has no such constraint any more, ours still does. Rather
 *    than re-add an app-level pre-check that only reintroduces the exact race `workspaceByName`'s
 *    docstring warns against ("two machines of the same person registering at once"), `createWorkspace`
 *    and `updateWorkspace` let Postgres raise `23505` and the route translates it — atomic, and the
 *    one place that can actually see the race lose.
 * 3. `workspace_site` IS A MANY-TO-MANY JOIN TABLE here (`002-book.sql:211-220`'s own comment flags
 *    this as "an already-flagged structural question"), where the Worker's `site.workspace_id` is a
 *    1:1 column. `declareSiteWorkspace` below enforces the Worker's actual invariant — "a site
 *    always belongs to exactly one workspace" — at the SQL layer, in one transaction, rather than
 *    leaving the many-to-many shape open for two owners to coexist by accident.
 *
 * NOT PORTED, WITH REASON (CLAUDE.md §0 rule 3):
 *   - `workspaceMcpConfig`/`workspaceCredentials` and their writers, and the `/workspaces/:id/{mcp,
 *     credentials,role-policy/history}` HTTP doors (all three, including role-policy's OWN door) —
 *     spec §8 says so by name — its deletion table lists `/api/workspaces` (SPA-only) and
 *     `/workspaces/:id/{mcp,credentials,role-policy/history}` (Desk-only) as explicitly not carried
 *     — confirmed by the coordinator as intentionally out of scope, not a gap.
 *     `workspaceRolePolicy`/`writeWorkspaceRolePolicy`
 *     THEMSELVES are the one exception in this list — see below — but no HTTP door for them exists,
 *     matching the spec's exclusion of the door while the data layer still gets built.
 *   - `fleetHostnames`/`probeCopy` and the rest of `/tracy-admin/sites`'s reads — that door needs
 *     live fleet tunnel ingress and a KV-style health cache this app has no equivalent of anywhere
 *     yet (no Worker, no tunnel, no host-reachability API). Per the coordinator's ruling (Fix Round
 *     2): this belongs to Plan 3 (the per-host service) and Plan 4 (the ops surface), after there is
 *     a host to ask — NOT this task. Left absent, not stubbed.
 *
 * `allWorkspaces`/`allWorkspaceSiteLinks`/`allLiveWorkspaceGrants` below (Fix Round 2) ARE ported —
 * `/tracy-admin/overview` is confirmed in scope (spec line 222 lists it among what IS carried). The
 * fourth Worker input, `allLegacySiteGrants`, has no equivalent question here: this schema has no
 * legacy/current split (`seat` — ADR 0067 — is the only site book there ever was), so the "which
 * sites have a live seat but are not yet declared into a workspace" queue reads `seats/store.js`'s
 * `liveSiteKeys` instead, handed in through `deps.seats` by `app.js` (module-graph rule).
 *
 * `workspaceRolePolicy`/`writeWorkspaceRolePolicy`/`workspaceRolePolicyForSite` (Fix Round 2) ARE
 * ported too — named in this task's own Interfaces line, backed by `002-book.sql`'s
 * `workspace_role_policy` table since Task 1, and never built until now was an OVERSIGHT, not a
 * decision (unlike the mcp/credentials pair right above, which the spec excludes by name). Production
 * has a workspace policy OVERRIDE a site's policy wholesale — see `sites/route.js`'s
 * `effectiveRolePolicy` for the exact precedence and its Worker citation. `004-workspace-role-policy
 * .sql` adds the history table `002-book.sql` never gave this pair (that migration's
 * `workspace_role_policy` has `workspace_id` as its primary key, so it can only ever hold ONE row
 * per workspace — it cannot also be the append-only log the Worker's single table doubles as).
 *
 * NO `workspaceGrantForSite` (removed, Fix Round 1). This module briefly carried a function of that
 * name so a workspace admin's grant would escalate onto a site's own seats door
 * (`/api/sites/:key/seats/:grant` in `seats/route.js`). Checked against
 * `workers/seat-registry/src/index.js` directly: `workspaceGrantFor` is read at EIGHT call sites
 * (4964, 5083, 5479, 5525, 7199, 7212, 7401, 7734) — corrected here in Fix Round 2 after an earlier
 * version of this comment miscounted them as four. Seven of the eight decide a WORKSPACE-scoped
 * question, inside a `/workspaces/*`-shaped handler; the site's own seats door
 * (`handleSetRole`/`handleRosterRevoke`) is not among them and never touches it. The eighth,
 * `handleCreateRepo` (line 7734), is ADR 0067 §3's one documented bootstrap exception: when a site
 * has no `seat` row at all yet (so its own book cannot answer), a workspace admin may create that
 * site's GitHub repo, and `ensureSiteOwnerSeat` immediately grants the first real site seat so the
 * site's own book governs from the very next call. That exception belongs to the GitHub door
 * (`github/route.js`/`createRepoFor`), not here — it is not built in this file, and building it is
 * someone else's task. The conclusion this module docstring drew stands regardless: ordinary site
 * authorization (every door in `seats/route.js`) decides from the site's own book alone. Do not
 * reintroduce a general escalation here on the mistaken belief that the count was wrong.
 */

/**
 * A workspace by id, or null.
 * @param {import('pg').Pool} pool
 * @param {string} workspaceId
 */
export async function workspaceById(pool, workspaceId) {
  const { rows } = await pool.query(
    'select id, display_name, revenue_modes, industry, kind, created_by, created_at from workspace where id = $1',
    [workspaceId]
  )
  return rows[0] ?? null
}

/**
 * Register a workspace. The creator becomes its Owner — this is the ONE place a first Owner is
 * minted (`handleCreateWorkspace`'s own docstring says the same of its Worker counterpart) — but
 * that grant is the ROUTE's job (`grantWorkspace`, right after), not this function's: this one only
 * writes the workspace row.
 *
 * `kind` defaults to `'customer'` and MUST NEVER be taken from a request body — a workspace
 * declaring itself `tracy_admin` is a workspace granting itself read access to the whole system
 * (`002-book.sql:187-190`'s own comment). The route enforces this by never passing `kind` through
 * from a caller; it exists as a parameter here only so a test (or a one-time seeding script) can
 * stand up the `tracy_admin` workspace directly.
 *
 * Throws Postgres `23505` on a duplicate `display_name` — see the module docstring's departure #2.
 */
export async function createWorkspace(
  pool,
  { displayName, revenueModes = [], industry = null, createdBy, kind = 'customer' }
) {
  const { rows } = await pool.query(
    `insert into workspace (display_name, revenue_modes, industry, created_by, kind)
     values ($1, $2, $3, $4, $5)
     returning id, display_name, revenue_modes, industry, kind, created_by, created_at`,
    [displayName, revenueModes, industry, createdBy, kind]
  )
  return rows[0]
}

/**
 * The profile-only write door — `display_name`/`revenue_modes`/`industry`, never `kind`. A field
 * absent from `patch` is left untouched, not erased: same discipline as `updateWorkspace`'s Worker
 * counterpart (`seats.js:526-547`) and as `seats/store.js` documents nowhere else needing repeating.
 * Throws `23505` on a name clash, same as `createWorkspace`.
 */
export async function updateWorkspace(pool, workspaceId, patch) {
  const sets = []
  const params = [workspaceId]
  if (patch.displayName !== undefined) {
    params.push(patch.displayName)
    sets.push(`display_name = $${params.length}`)
  }
  if (patch.revenueModes !== undefined) {
    params.push(patch.revenueModes)
    sets.push(`revenue_modes = $${params.length}`)
  }
  if (patch.industry !== undefined) {
    params.push(patch.industry)
    sets.push(`industry = $${params.length}`)
  }
  if (sets.length === 0) return workspaceById(pool, workspaceId)
  const { rows } = await pool.query(
    `update workspace set ${sets.join(', ')} where id = $1
     returning id, display_name, revenue_modes, industry, kind, created_by, created_at`,
    params
  )
  return rows[0] ?? null
}

/**
 * This account's live grant on this workspace — accepted OR still-pending, just not revoked/declined
 * — or null. Ported from `workspaceGrantFor`. NOT filtered to `accepted_at is not null`, on purpose:
 * a door that invites people (`POST .../seats`) must tell "already has a live row" apart from
 * "standing outside, asking to be let in" (`requested_at`), and both answers come from this one read.
 * Callers that need "is this account ACTUALLY seated" (role checks) use `accepted_at` on the row
 * this returns — `seats/roles.js`'s `actingEditor`/`actingOwner` already do exactly that.
 */
export async function workspaceGrantFor(pool, accountId, workspaceId) {
  const { rows } = await pool.query(
    `select workspace_id, account_id, role, accepted_at, requested_at
     from seat_workspace
     where account_id = $1 and workspace_id = $2
       and revoked_at is null and declined_at is null`,
    [accountId, workspaceId]
  )
  return rows[0] ?? null
}

/**
 * Grant (or re-grant) a workspace seat. Same revival rule as `seats/store.js`'s `grantSite`: a row
 * currently revoked or declined is REVIVED (every prior answer resets — a re-invitation is a new
 * invitation); a row that is currently LIVE (invited-and-pending, or accepted) is left untouched and
 * this returns null. `activate`/`requested` fold "grant it already-accepted" and "grant it as a
 * pending join request" into the one write statement, same shape as `grantSite`.
 */
export async function grantWorkspace(
  pool,
  { workspaceId, accountId, role = 'editor', grantedBy, activate = false, requested = false }
) {
  const acceptedAt = activate ? new Date() : null
  const requestedAt = requested ? new Date() : null
  const { rows } = await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, granted_at, accepted_at, requested_at)
     values ($1, $2, $3, $4, now(), $5, $6)
     on conflict (workspace_id, account_id) do update set
       role = excluded.role,
       granted_by = excluded.granted_by,
       granted_at = now(),
       accepted_at = excluded.accepted_at,
       requested_at = excluded.requested_at,
       declined_at = null,
       revoked_at = null,
       seen_at = null
     where seat_workspace.revoked_at is not null or seat_workspace.declined_at is not null
     returning *`,
    [workspaceId, accountId, role, grantedBy, acceptedAt, requestedAt]
  )
  return rows[0] ?? null
}

/**
 * Approve a pending join request, at a role the approver chooses — ported from `approveJoinRequest`.
 * A conditional UPDATE, not `grantWorkspace`: the row is already live and pending
 * (`requested_at` set, `accepted_at` null), which `grantWorkspace`'s revival branch does not touch
 * (it only revives revoked/declined rows) — calling that here would silently no-op. `requested_at`
 * is left as-is: it still says who asked, after approval.
 */
export async function approveWorkspaceJoinRequest(pool, { workspaceId, accountId, role, approvedBy }) {
  const { rows } = await pool.query(
    `update seat_workspace set role = $3, granted_by = $4, accepted_at = now(), declined_at = null, revoked_at = null
     where workspace_id = $1 and account_id = $2
       and revoked_at is null and declined_at is null and accepted_at is null
     returning *`,
    [workspaceId, accountId, role, approvedBy]
  )
  return rows[0] ?? null
}

/** The invitee says "in". Ported from `acceptWorkspaceGrant`. */
export async function acceptWorkspaceGrant(pool, workspaceId, accountId) {
  const { rows } = await pool.query(
    `update seat_workspace set accepted_at = now()
     where workspace_id = $1 and account_id = $2
       and revoked_at is null and declined_at is null and accepted_at is null
     returning *`,
    [workspaceId, accountId]
  )
  return rows[0] ?? null
}

/** The invitee says "no". Ported from `declineWorkspaceGrant`. */
export async function declineWorkspaceGrant(pool, workspaceId, accountId) {
  const { rows } = await pool.query(
    `update seat_workspace set declined_at = now()
     where workspace_id = $1 and account_id = $2
       and revoked_at is null and declined_at is null and accepted_at is null
     returning *`,
    [workspaceId, accountId]
  )
  return rows[0] ?? null
}

/** Change a live grant's role. Last-owner guard lives in the CALLER — ported from `setWorkspaceGrantRole`. */
export async function setWorkspaceGrantRole(pool, workspaceId, accountId, role) {
  const { rows } = await pool.query(
    `update seat_workspace set role = $3
     where workspace_id = $1 and account_id = $2 and revoked_at is null
     returning *`,
    [workspaceId, accountId, role]
  )
  return rows[0] ?? null
}

/** Revoke one grant. Ported from `revokeWorkspaceGrant`. */
export async function revokeWorkspaceGrant(pool, workspaceId, accountId) {
  const { rows } = await pool.query(
    `update seat_workspace set revoked_at = now()
     where workspace_id = $1 and account_id = $2 and revoked_at is null
     returning *`,
    [workspaceId, accountId]
  )
  return rows[0] ?? null
}

/**
 * Undo a revoke inside the SAME request that just wrote it — the last-owner recovery `handleLeave`
 * and `handleTracyAdminRemoveMember` both need when a read-then-write race leaves a workspace with
 * zero owners. Ported from `unrevokeWorkspaceGrant`; unconditional, on purpose, exactly as the
 * Worker's own comment explains: it only ever touches the row this same request just revoked.
 */
export async function unrevokeWorkspaceGrant(pool, workspaceId, accountId) {
  const { rows } = await pool.query(
    `update seat_workspace set revoked_at = null
     where workspace_id = $1 and account_id = $2
     returning *`,
    [workspaceId, accountId]
  )
  return rows[0] ?? null
}

/**
 * Owners actually holding the door on this workspace — accepted, not revoked, not declined. Guard
 * last-owner counts with this. Ported from `ownersOfWorkspace`.
 */
export async function ownersOfWorkspace(pool, workspaceId) {
  const { rows } = await pool.query(
    `select account_id from seat_workspace
     where workspace_id = $1 and role = 'owner'
       and revoked_at is null and declined_at is null and accepted_at is not null`,
    [workspaceId]
  )
  return rows
}

/**
 * Every grant row of a workspace, joined with the account's email/display name — EVERY status,
 * including revoked: the Team screen shows who used to be here. Ported from `seatsOfWorkspace`,
 * shaped like `seats/store.js`'s `seatsOfSite` (`{...row, seat: {email, display_name}}`).
 *
 * `order by granted_at asc` is ours, not the Worker's PostgREST query — same deliberate addition
 * `seatsOfSite` already carries, for the same reason (a stable roster order).
 */
export async function seatsOfWorkspace(pool, workspaceId) {
  const { rows } = await pool.query(
    `select sw.*, a.email as account_email, a.display_name as account_display_name
     from seat_workspace sw join account a on a.id = sw.account_id
     where sw.workspace_id = $1
     order by sw.granted_at asc`,
    [workspaceId]
  )
  return rows.map(({ account_email, account_display_name, ...seat }) => ({
    ...seat,
    seat: { email: account_email, display_name: account_display_name }
  }))
}

/**
 * Every workspace an account holds a LIVE grant on (accepted or still-pending), for `/me/workspaces`.
 * Ported from `workspacesOfSeat`. `inviterName` is not resolved here (`granted_by` is an account
 * uuid, not an email, in this schema — same departure `seats/route.js`'s `rosterRow` already
 * documents and the same reason: nothing in this task renders it as text).
 */
export async function workspacesOfAccount(pool, accountId) {
  const { rows } = await pool.query(
    `select sw.workspace_id, sw.role, sw.granted_by, sw.granted_at, sw.accepted_at,
            w.display_name, w.kind, w.revenue_modes, w.industry
     from seat_workspace sw join workspace w on w.id = sw.workspace_id
     where sw.account_id = $1 and sw.revoked_at is null and sw.declined_at is null
     order by sw.granted_at asc`,
    [accountId]
  )
  return rows
}

/** Site keys currently in one workspace. Ported from `sitesOfWorkspace`. */
export async function sitesOfWorkspace(pool, workspaceId) {
  const { rows } = await pool.query(
    'select site_key from workspace_site where workspace_id = $1 order by site_key asc',
    [workspaceId]
  )
  return rows
}

/** The workspace owning a site, or null when the site has not been declared into one yet. Ported
 *  from `workspaceOfSite`. */
export async function workspaceOfSite(pool, siteKey) {
  const { rows } = await pool.query('select workspace_id, site_key from workspace_site where site_key = $1', [
    siteKey
  ])
  return rows[0] ?? null
}

/**
 * Declare `site → owning workspace` — ported from `declareSiteWorkspace`, adapted to this schema's
 * many-to-many `workspace_site` (module docstring departure #3): DELETE any existing link for this
 * `site_key`, then INSERT the new one, in one transaction — enforcing "a site belongs to exactly one
 * workspace" the same way the Worker's `on_conflict=site_key` upsert does, since our table has no
 * unique constraint on `site_key` alone to upsert against.
 *
 * `declaredBy` is accepted for interface parity with the Worker but not persisted — `workspace_site`
 * here carries no `declared_by`/`declared_at` columns (unlike `site` in the Worker's schema).
 */
export async function declareSiteWorkspace(pool, { siteKey, workspaceId, declaredBy: _declaredBy }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from workspace_site where site_key = $1', [siteKey])
    const { rows } = await client.query(
      'insert into workspace_site (workspace_id, site_key) values ($1, $2) returning workspace_id, site_key',
      [workspaceId, siteKey]
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

/** Remove a site's link to any workspace. Ported from `undeclareSiteWorkspace`. */
export async function undeclareSiteWorkspace(pool, siteKey) {
  await pool.query('delete from workspace_site where site_key = $1', [siteKey])
}

/**
 * Tracy's own workspace row — the one `kind = 'tracy_admin'`. Ported from `tracyAdminWorkspace`,
 * same fail-closed-on-anything-but-exactly-one discipline: `limit 2`, not 1, so two such rows (a
 * state the schema does not forbid) is DETECTED rather than silently answered with whichever one
 * came first. `null` means "the question cannot be answered" — none at all, or more than one —
 * never "nobody is staff".
 */
export async function tracyAdminWorkspace(pool) {
  const { rows } = await pool.query(
    "select id, display_name from workspace where kind = 'tracy_admin' limit 2"
  )
  return rows.length === 1 ? rows[0] : null
}

/**
 * This account's role in the `tracy_admin` workspace, or null for everybody else — "is this person
 * Tracy staff, and at what rank". Ported from `tracyAdminRoleOf`. Requires `accepted_at`, unlike
 * `workspaceGrantFor`: a pending invitation opens no doors here, only an accepted one does.
 */
export async function tracyAdminRoleOf(pool, accountId) {
  const { rows } = await pool.query(
    `select sw.role
     from seat_workspace sw join workspace w on w.id = sw.workspace_id
     where sw.account_id = $1 and w.kind = 'tracy_admin'
       and sw.revoked_at is null and sw.declined_at is null and sw.accepted_at is not null
     limit 1`,
    [accountId]
  )
  return rows[0]?.role ?? null
}

/**
 * Every workspace, every kind — the `/tracy-admin/overview` read's first input. Ported from
 * `allWorkspaces`. Ordered by name for a stable screen, same discipline as `seatsOfWorkspace`'s own
 * `order by granted_at`.
 */
export async function allWorkspaces(pool) {
  const { rows } = await pool.query(
    'select id, display_name, revenue_modes, industry, kind, created_at from workspace order by display_name asc'
  )
  return rows
}

/** Every `workspace_site` link, across every workspace — ported from `allSiteLinks`. Unlike the
 *  Worker's `site` row, this schema's `workspace_site` carries no `declared_by`/`declared_at`
 *  (see the module docstring's departure #3), so there is nothing more to select. */
export async function allWorkspaceSiteLinks(pool) {
  const { rows } = await pool.query('select workspace_id, site_key from workspace_site order by site_key asc')
  return rows
}

/**
 * Every LIVE grant, across every workspace, with the account's email — ported from
 * `allLiveWorkspaceGrants`. `accepted_at` travels un-filtered (a pending invite is still "live" for
 * this count, same as `workspaceGrantFor`) so the route can tell "seated" from "invited, waiting".
 */
export async function allLiveWorkspaceGrants(pool) {
  const { rows } = await pool.query(
    `select sw.workspace_id, sw.role, sw.accepted_at, a.email as account_email
     from seat_workspace sw join account a on a.id = sw.account_id
     where sw.revoked_at is null and sw.declined_at is null`
  )
  return rows.map(({ account_email, ...row }) => ({ ...row, seat: { email: account_email } }))
}

/**
 * The role → toolset matrix currently in force for a workspace, or null when it still uses the
 * legacy/default fallback — ported from `workspaceRolePolicy`. Named in this task's own Interfaces
 * line and backed by `002-book.sql`'s `workspace_role_policy` table since Task 1; not building it
 * was an oversight (Fix Round 2), not a declared cut — unlike `workspace_mcp`/`workspace_credentials`,
 * which spec §8 names as explicitly not carried.
 *
 * NO HTTP DOOR WRITES OR READS THIS DIRECTLY YET. `/workspaces/:id/role-policy[/history]` is the
 * Desk-only door spec §8 excludes by name (its "not carried" list names `role-policy/history`
 * explicitly), so this pair exists for exactly one caller: `sites/route.js`'s Apply authorization,
 * which must consult it under the SAME precedence production applies (see that file's
 * `effectiveRolePolicy` and its citation of `workers/seat-registry/src/index.js:6999-7008`).
 */
export async function workspaceRolePolicy(pool, workspaceId) {
  const { rows } = await pool.query(
    'select workspace_id, policy, updated_by, updated_at from workspace_role_policy where workspace_id = $1',
    [workspaceId]
  )
  return rows[0] ?? null
}

/**
 * Write a new role policy for a workspace. Ported from `writeWorkspaceRolePolicy`'s effect (a new
 * current matrix, and a history entry recording it) — same split `seats/store.js`'s `writeRolePolicy`
 * already keeps for sites, across the two tables `004-workspace-role-policy.sql` lays down
 * (`workspace_role_policy` — one current row per workspace — and `workspace_role_policy_history` —
 * an append-only log). Both write the same `policy`/`updated_by`, or neither does.
 */
export async function writeWorkspaceRolePolicy(pool, workspaceId, policy, updatedBy) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query(
      `insert into workspace_role_policy (workspace_id, policy, updated_by, updated_at)
       values ($1, $2::jsonb, $3, now())
       on conflict (workspace_id) do update set
         policy = excluded.policy, updated_by = excluded.updated_by, updated_at = now()
       returning workspace_id, policy, updated_by, updated_at`,
      [workspaceId, JSON.stringify(policy), updatedBy]
    )
    await client.query(
      'insert into workspace_role_policy_history (workspace_id, policy, updated_by) values ($1, $2::jsonb, $3)',
      [workspaceId, JSON.stringify(policy), updatedBy]
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
 * The workspace-tier half of Apply's precedence check: this site's OWNING workspace's role policy,
 * or null when the site has no workspace or that workspace has never set one. Composed from
 * `workspaceOfSite` + `workspaceRolePolicy` — not a new query — so the two stay one source of truth.
 * This is the ONE function `sites/route.js` is handed through `deps.workspaces` for the Apply door;
 * see that file's `effectiveRolePolicy` for the full precedence (workspace, then site, then default).
 */
export async function workspaceRolePolicyForSite(pool, siteKey) {
  const link = await workspaceOfSite(pool, siteKey)
  if (!link) return null
  return workspaceRolePolicy(pool, link.workspace_id)
}
