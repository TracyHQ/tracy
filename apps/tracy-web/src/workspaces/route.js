/**
 * Workspaces: an agency's grant across its sites, and Tracy's own staff team
 * (`workspace.kind = 'tracy_admin'`) — both live in the same book (`002-book.sql`'s
 * `workspace`/`seat_workspace`), same as `workers/seat-registry/src/index.js` keeps them in one
 * table with `handleTracyAdminOnly` (`workers/seat-registry/src/index.js` amendment A1) as the
 * narrower gate onto the second kind.
 *
 * Ported from `workers/seat-registry/src/index.js`'s workspace/tracy-admin cluster:
 * `handleCreateWorkspace` (7142), `handleWorkspaceRoster` (4921), `handleWorkspaceRosterRevoke`
 * (5123), `handleWorkspaceSetRole` (5169), `handlePatchWorkspace` (5224), `handleSiteWorkspaceRead`
 * (5046), `handleDeclareSiteWorkspace` (5499), `handleJoinRequest` (5074), `handleMyWorkspaces`
 * (7283), `handleWorkspaceDecision` (7341), `handleWorkspaceLeave` (7395), `handleTracyAdminMembers`
 * (5626), `handleTracyAdminAddMember` (5672), `handleTracyAdminRemovalCode` (5867),
 * `handleTracyAdminRemoveMember` (5928), `handleTracyAdminOverview` (6037, Fix Round 2), and
 * `/tracy-admin/whoami` (8636).
 *
 * ONE DEPARTURE FROM THE STORE'S OWN SHAPE, EVERYWHERE BELOW, same as `seats/route.js` already
 * documents for `seat`: `seat_workspace`'s primary key is `(workspace_id, account_id)` — there is
 * no separate grant id. Wherever the Worker took a `grantId` (a `/workspaces/:id/seats/:grantId`
 * path segment, a roster row's `id`), this file uses `account_id` instead.
 *
 * MODULE-GRAPH BOUNDARY: this domain may import only `lib/`, `db/`, and itself (`test/module-graph
 * .test.mjs`). One thing it needs lives in a sibling domain — a site's own seat book, to check that
 * whoever declares a site's workspace already sits on that site as owner/admin (#663), and an
 * account lookup by email. Both arrive through `deps.seats`, the same way `sites/route.js` already
 * receives them; this file never imports `../seats/store.js` directly.
 *
 * NOTHING FLOWS THE OTHER WAY. `seats/route.js` never imports `./store.js` here, and — since Fix
 * Round 1 — never receives anything FROM it either: an earlier version of this task let a workspace
 * admin's grant escalate onto `/api/sites/:key/seats/:grant` (a `deps.workspaces.workspaceGrantForSite`
 * function, wired by `app.js`). That was a Care Point in this task's brief, written from a stale
 * reading of the Worker — checked directly against `workers/seat-registry/src/index.js`,
 * `workspaceGrantFor` is read at EIGHT call sites (4964, 5083, 5479, 5525, 7199, 7212, 7401, 7734;
 * an earlier version of this comment miscounted them as four — corrected in Fix Round 2). Seven of
 * the eight decide a WORKSPACE-scoped question inside a `/workspaces/*`-shaped handler; the site's
 * own seats door is not one of them and never touches it (ADR 0067, 19/08, deliberately removed
 * that inheritance). The eighth, `handleCreateRepo` (line 7734), is ADR 0067 §3's one documented
 * bootstrap exception — a workspace admin may create a site's GitHub repo when the site has no
 * `seat` row yet, and `ensureSiteOwnerSeat` grants the first real one immediately after so the
 * site's own book governs from the next call. That exception lives in the GitHub door, not here,
 * and is someone else's task to carry, not a reason to restore a general escalation in this file.
 * Reverted; see `seats/route.js`'s own comment on that door and `test/workspaces.test.mjs` for the
 * test that pins the refusal down. Workspace grants stay inside workspace doors, full stop.
 *
 * NOT PORTED, WITH REASON (CLAUDE.md §0 rule 3):
 *   - `/tracy-admin/sites` — needs live fleet tunnel ingress and a KV-style health cache this app has
 *     no equivalent of anywhere yet. Per the coordinator's ruling (Fix Round 2): this belongs to
 *     Plan 3 (the per-host service) and Plan 4 (the ops surface), after there is a host to ask — NOT
 *     this task. Left absent, not stubbed. `/tracy-admin/overview` WAS built this round (below) —
 *     it needed only one more `deps.seats` read, not fleet infrastructure.
 *   - `/workspaces/:id/mcp*`, `/role-policy*`, `/credentials*` HTTP doors — spec §8 excludes them by
 *     name (Desk-only). `workspaceRolePolicy`/`writeWorkspaceRolePolicy` themselves ARE ported
 *     (`store.js`) for the Apply precedence fix in `sites/route.js` — see that file.
 *   - A signed accept-token for the Tracy-staff invite mail (`tracyTeamInviteMail` in the Worker) —
 *     see `mail/emails.js`'s own docstring for why the generic accept-while-signed-in door already
 *     carries the same security property here.
 */
import { Hono } from 'hono'
import { json, requireViewer, normalizeSiteKey } from '../lib/http.js'
import { overLimitOrClosed } from '../lib/rate.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { staffInviteUrl } from '../lib/team-invite.js'
import {
  workspaceById,
  createWorkspace,
  updateWorkspace,
  workspaceGrantFor,
  grantWorkspace,
  approveWorkspaceJoinRequest,
  acceptWorkspaceGrant,
  declineWorkspaceGrant,
  setWorkspaceGrantRole,
  revokeWorkspaceGrant,
  unrevokeWorkspaceGrant,
  ownersOfWorkspace,
  seatsOfWorkspace,
  workspacesOfAccount,
  sitesOfWorkspace,
  workspaceOfSite,
  declareSiteWorkspace,
  tracyAdminWorkspace,
  tracyAdminRoleOf,
  allWorkspaces,
  allWorkspaceSiteLinks,
  allLiveWorkspaceGrants
} from './store.js'

const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REVENUE_MODES = ['goods', 'services', 'software', 'audience']
const WRITE_LIMIT_PER_HOUR = 600

/** A grant row that still stands: not taken back, not declined — same predicate `seats/route.js`
 * keeps under a different name (there, filtering happens inline). */
const liveGrant = (row) => !row.revoked_at && !row.declined_at

/**
 * The roles a seat in an agency (customer) workspace may hold, and the ones an invitation may carry
 * — ADR 0028's three, restated from `seats/roles.js` (`ROLES`, `INVITABLE_ROLES`) because this
 * domain may not import that one. Tracy's own staff workspace (`kind = 'tracy_admin'`) keeps its
 * own ranks (`STAFF_RANKS`) and is managed through the `/tracy-admin/*` doors below; migration 078's
 * trigger refuses a role from the wrong ladder whichever door writes it.
 */
const WORKSPACE_ROLES = ['owner', 'editor', 'viewer']
const WORKSPACE_INVITABLE = ['editor', 'viewer']
// `editor` in the staff workspace is a read-only staff seat (`ops/admit.js` admits any rank).
const STAFF_RANKS = ['owner', 'admin', 'developer', 'editor']
const isStaffWorkspace = (workspace) => workspace?.kind === 'tracy_admin'

/** One roster row, as every door below returns it. Ported from `workspaceRosterRow`. `id` is
 * `account_id` — see the module docstring's departure. */
function workspaceRosterRow(row) {
  return {
    id: row.account_id,
    email: row.seat?.email ?? null,
    displayName: row.seat?.display_name ?? null,
    role: row.role,
    status: row.revoked_at
      ? 'revoked'
      : row.declined_at
        ? 'declined'
        : row.accepted_at
          ? 'active'
          : 'invited',
    grantedAt: row.granted_at,
    grantedBy: row.granted_by,
    revokedAt: row.revoked_at,
    requestedAt: row.requested_at ?? null,
    acceptedAt: row.accepted_at ?? null
  }
}

/** A `seat_workspace` row of ANY status — the store exports only `workspaceGrantFor` (live grants
 * only); write doors below need to see revoked/declined rows too, same reasoning as `seats/route.js`'s
 * own local `grantRowFor`. Read-only, and scoped to this file: the store stays the one place rows
 * are written. */
async function grantRowFor(pool, workspaceId, accountId) {
  const { rows } = await pool.query(
    'select * from seat_workspace where workspace_id = $1 and account_id = $2',
    [workspaceId, accountId]
  )
  return rows[0] ?? null
}

/** The profile half of a workspace, read off a request body — ported from `readProfile`. A field
 * absent stays untouched at the patch door; `null` return means the body was the wrong shape. */
function readProfile(body) {
  const profile = {}
  if (body?.revenueModes !== undefined) {
    if (!Array.isArray(body.revenueModes) || body.revenueModes.some((m) => !REVENUE_MODES.includes(m))) {
      return null
    }
    profile.revenueModes = [...new Set(body.revenueModes)]
  }
  if (body?.industry === null) {
    profile.industry = null
  } else if (body?.industry !== undefined) {
    if (typeof body.industry !== 'string') return null
    const trimmed = body.industry.trim()
    if (trimmed === '' || trimmed.length > 120) return null
    profile.industry = trimmed
  }
  return profile
}

/** Ported from `maskEmail` — for the removal-code response, which must confirm WHERE a code went
 * without printing an address a screenshot could leak in full. */
function maskEmail(email) {
  const [local, domain] = String(email).split('@')
  if (!domain) return '***'
  const lm =
    local.length <= 1 ? local : local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local[local.length - 1]
  const parts = domain.split('.')
  return `${lm}@***.${parts.length > 1 ? parts[parts.length - 1] : domain}`
}

/**
 * The invitation mail for a workspace roster grant — shared by the ordinary agency door and the
 * `tracy-admin` one, since both are "a role on ONE workspace, granted right now" (unlike a site
 * invite, which covers N sites). Ported in spirit from `workspaceInviteLetter`; picks `inviteMail`
 * vs `addedToWorkspace` the same way the Worker's `ensureSupabaseUser(...).created` does, using a
 * pre-check read instead (this app's `ensureAccount` reports no such flag).
 */
async function sendWorkspaceInvite(
  pool,
  mail,
  { alreadyHadAccount, inviterEmail, workspace, workspaceId, to, acceptUrl, lang = 'en' }
) {
  const siteKeys = (await sitesOfWorkspace(pool, workspaceId)).map((row) => row.site_key)
  try {
    // Inside the `try`: a builder that refuses its input (an `acceptUrl` that is not http(s)) is
    // a mail that did not go, reported as `notified: false` like any other, not a 500 after the
    // grant is already on the book.
    const letter = (alreadyHadAccount ? mail.addedToWorkspace : mail.inviteMail)({
      inviterEmail,
      workspaceName: workspace.display_name,
      siteKeys,
      // Only the Tracy staff door has a link to give (#794); an agency invitation has no accept
      // door of its own yet, so its mail keeps saying "sign in" and names no address.
      ...(acceptUrl === undefined ? {} : { acceptUrl }),
      lang
    })
    await mail.send({ to, subject: letter.subject, text: letter.text, html: letter.html })
    return true
  } catch {
    return false
  }
}

/**
 * owner/admin/developer read the Tracy Admin desk; only owner/admin write to it — ported verbatim
 * from `TRACY_ADMIN_READ`/`TRACY_ADMIN_WRITE`. `developer` reads every screen; changing who is
 * Tracy staff is not a decision this task hands them.
 */
const TRACY_ADMIN_READ = ['owner', 'admin', 'developer']
const TRACY_ADMIN_WRITE = ['owner', 'admin']

/** Who may grant which role — ported verbatim from `memberRoleAllowed`. `owner` grants anything;
 * `admin` grants up to `developer`; nobody grants above their own rank. */
function memberRoleAllowed(actorRole, targetRole) {
  if (actorRole === 'owner') return ['owner', 'admin', 'developer'].includes(targetRole)
  if (actorRole === 'admin') return ['admin', 'developer'].includes(targetRole)
  return false
}

const REMOVAL_CODE_TTL_MS = 10 * 60 * 1000
const REMOVAL_CODE_TRIES = 5

function sixDigitCode() {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 1000000).padStart(6, '0')
}

/** Constant-time compare — ported from `codesMatch`: a code read back is not a signature, and `===`
 * on a secret leaks its prefix through timing. */
function codesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config - `readConfig`'s value.
 * @param {{ send: Function, inviteMail: Function, addedToWorkspace: Function, removalCodeMail: Function }} deps.mail
 *   Transport plus the templates this domain uses — bound in by `app.js`, same discipline as
 *   `seatsRoutes`' own `mail` dep (this domain never imports `mail/` directly).
 * @param {{ accountByEmail: Function, ensureAccount: Function, grantFor: Function, actingEditor: Function,
 *   actingOwner: Function, liveSiteKeys: Function }} deps.seats
 *   the ONE sibling-domain reach this file is allowed, per the module docstring. `liveSiteKeys`
 *   feeds `/tracy-admin/overview`'s "not yet declared into any workspace" queue.
 * @param {() => number} [deps.now]
 */
export function workspacesRoutes({ pool, config, mail, seats, now = Date.now }) {
  const app = new Hono()

  // ── POST /workspaces — register an agency; the creator becomes its accepted Owner ────────────
  // ported: handleCreateWorkspace
  app.post('/workspaces', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    if (await overLimitOrClosed(pool, `workspace-create:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }

    const body = await c.req.json().catch(() => null)
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    if (displayName === '' || displayName.length > 120) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const profile = readProfile(body)
    if (!profile) return json(c, { code: 'INVALID_REQUEST' }, 400)

    const account = await seats.ensureAccount(pool, email)
    let row
    try {
      // `kind` is NEVER taken from `body` — see `store.js`'s own docstring on `createWorkspace`.
      row = await createWorkspace(pool, { displayName, ...profile, createdBy: account.id })
    } catch (error) {
      if (error?.code === '23505') return json(c, { code: 'WORKSPACE_NAME_TAKEN' }, 409)
      throw error
    }
    await grantWorkspace(pool, {
      workspaceId: row.id,
      accountId: account.id,
      role: 'owner',
      grantedBy: account.id,
      activate: true
    })
    return json(c, { id: row.id, displayName: row.display_name }, 201)
  })

  // ── PATCH /workspaces/:id — the profile-only write door, Owner only ───────────────────────────
  // ported: handlePatchWorkspace
  app.patch('/workspaces/:id', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const workspaceId = c.req.param('id')
    if (!WORKSPACE_ID.test(workspaceId)) return json(c, { code: 'INVALID_REQUEST' }, 400)

    const account = await seats.accountByEmail(pool, email)
    const grant = account ? await workspaceGrantFor(pool, account.id, workspaceId) : null
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (!seats.actingOwner(grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)

    const body = await c.req.json().catch(() => null)
    const patch = readProfile(body)
    if (!patch) return json(c, { code: 'INVALID_REQUEST' }, 400)
    if (body?.displayName !== undefined) {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
      if (displayName === '' || displayName.length > 120) return json(c, { code: 'INVALID_REQUEST' }, 400)
      patch.displayName = displayName
    }
    if (Object.keys(patch).length === 0) return json(c, { code: 'INVALID_REQUEST' }, 400)

    let row
    try {
      row = await updateWorkspace(pool, workspaceId, patch)
    } catch (error) {
      if (error?.code === '23505') return json(c, { code: 'WORKSPACE_NAME_TAKEN' }, 409)
      throw error
    }
    if (!row) return json(c, { code: 'SEAT_STORE_UNAVAILABLE' }, 502)
    return json(c, { id: row.id, displayName: row.display_name })
  })

  // ── GET|POST /workspaces/:id/seats — the roster: read, or invite ──────────────────────────────
  // ported: handleWorkspaceRoster
  app.on(['GET', 'POST'], '/workspaces/:id/seats', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const workspaceId = c.req.param('id')
    if (!WORKSPACE_ID.test(workspaceId)) return json(c, { code: 'INVALID_REQUEST' }, 400)

    const caller = await seats.accountByEmail(pool, email)
    const grant = caller ? await workspaceGrantFor(pool, caller.id, workspaceId) : null
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)

    if (c.req.method === 'GET') {
      return json(c, { seats: (await seatsOfWorkspace(pool, workspaceId)).map(workspaceRosterRow) })
    }

    if (await overLimitOrClosed(pool, `workspace-invite:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const body = await c.req.json().catch(() => null)
    const invited = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!EMAIL_SHAPE.test(invited)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    // ADR 0028: an Owner or an Editor invites, as Viewer or Editor; Owners are made from the
    // roster, never by invitation; a Viewer invites nobody.
    const role = body?.role === undefined ? 'editor' : body.role
    if (!WORKSPACE_INVITABLE.includes(role)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    if (!seats.actingEditor(grant)) return json(c, { code: 'NOT_SITE_EDITOR' }, 403)

    const workspace = await workspaceById(pool, workspaceId)
    if (!workspace) return json(c, { code: 'SEAT_STORE_UNAVAILABLE' }, 502)
    // Tracy staff are added at `/tracy-admin/members`, at a staff rank; a customer role has no
    // meaning in that workspace.
    if (isStaffWorkspace(workspace)) return json(c, { code: 'INVALID_REQUEST' }, 400)

    const alreadyHadAccount = Boolean(await seats.accountByEmail(pool, invited))
    const invitee = await seats.ensureAccount(pool, invited)
    const existing = await workspaceGrantFor(pool, invitee.id, workspaceId)
    if (existing?.requested_at && !existing.accepted_at) {
      // Inviting somebody whose request is waiting IS approving it — an Owner's act only.
      if (!seats.actingOwner(grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)
      const approved = await approveWorkspaceJoinRequest(pool, {
        workspaceId,
        accountId: invitee.id,
        role,
        approvedBy: caller.id
      })
      if (!approved) return json(c, { code: 'GRANT_UNKNOWN' }, 409)
      const notified = await sendWorkspaceInvite(pool, mail, {
        lang: requestLanguage(c),
        alreadyHadAccount,
        inviterEmail: email,
        workspace,
        workspaceId,
        to: invited
      })
      return json(c, {
        seat: workspaceRosterRow({ ...approved, seat: { email: invited, display_name: null } }),
        notified,
        approved: true
      })
    }
    if (existing) return json(c, { code: 'ALREADY_GRANTED' }, 409)

    const granted = await grantWorkspace(pool, {
      workspaceId,
      accountId: invitee.id,
      role,
      grantedBy: caller.id
    })
    const notified = await sendWorkspaceInvite(pool, mail, {
      lang: requestLanguage(c),
      alreadyHadAccount,
      inviterEmail: email,
      workspace,
      workspaceId,
      to: invited
    })
    return json(
      c,
      { seat: workspaceRosterRow({ ...granted, seat: { email: invited, display_name: null } }), notified },
      201
    )
  })

  // ── PATCH|DELETE /workspaces/:id/seats/:accountId — change a role, or withdraw it ─────────────
  // ported: handleWorkspaceSetRole
  // ported: handleWorkspaceRosterRevoke
  app.on(['PATCH', 'DELETE'], '/workspaces/:id/seats/:accountId', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const workspaceId = c.req.param('id')
    const targetId = c.req.param('accountId')
    if (!WORKSPACE_ID.test(workspaceId)) return json(c, { code: 'INVALID_REQUEST' }, 400)

    const caller = await seats.accountByEmail(pool, email)
    const grant = caller ? await workspaceGrantFor(pool, caller.id, workspaceId) : null
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    // ADR 0028: changing a role and removing somebody are an Owner's acts only.
    if (!seats.actingOwner(grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)

    if (c.req.method === 'DELETE') {
      const target = await grantRowFor(pool, workspaceId, targetId)
      if (!target || target.revoked_at || target.declined_at) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
      if (target.account_id === caller.id) return json(c, { code: 'CANNOT_REVOKE_SELF' }, 403)
      if (
        target.role === 'owner' &&
        target.accepted_at &&
        (await ownersOfWorkspace(pool, workspaceId)).length <= 1
      ) {
        return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
      }
      const revoked = await revokeWorkspaceGrant(pool, workspaceId, targetId)
      if (!revoked) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
      return json(c, { revoked: true })
    }

    const body = await c.req.json().catch(() => null)
    const role = body?.role
    // Each workspace kind on its own ladder: staff ranks in Tracy's own, ADR 0028's roles elsewhere.
    const ladder = isStaffWorkspace(await workspaceById(pool, workspaceId)) ? STAFF_RANKS : WORKSPACE_ROLES
    if (!ladder.includes(role)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const target = await grantRowFor(pool, workspaceId, targetId)
    if (!target || target.revoked_at || target.declined_at) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
    if (target.role === role) return json(c, { id: target.account_id, role })
    if (
      target.role === 'owner' &&
      target.accepted_at &&
      (await ownersOfWorkspace(pool, workspaceId)).length <= 1
    ) {
      return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
    }
    const updated = await setWorkspaceGrantRole(pool, workspaceId, targetId, role)
    if (!updated) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
    return json(c, { id: updated.account_id, role: updated.role })
  })

  // ── GET /me/workspaces — every workspace the viewer holds a live grant on ─────────────────────
  // ported: handleMyWorkspaces
  app.get('/me/workspaces', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const account = await seats.accountByEmail(pool, email)
    const rows = account ? await workspacesOfAccount(pool, account.id) : []
    const workspaces = []
    for (const row of rows) {
      const sites = await sitesOfWorkspace(pool, row.workspace_id)
      workspaces.push({
        id: row.workspace_id,
        displayName: row.display_name,
        kind: row.kind,
        revenueModes: row.revenue_modes ?? [],
        industry: row.industry,
        role: row.role,
        grantedAt: row.granted_at,
        grantedBy: row.granted_by,
        status: row.accepted_at ? 'accepted' : 'pending',
        sites: sites.map((s) => ({ siteKey: s.site_key }))
      })
    }
    return json(c, { workspaces })
  })

  // ── POST /me/workspaces/:id/accept|decline ────────────────────────────────────────────────────
  // ported: handleWorkspaceDecision
  const workspaceDecision = async (c, decision) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const workspaceId = c.req.param('id')
    if (!WORKSPACE_ID.test(workspaceId)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    if (await overLimitOrClosed(pool, `workspace-decision:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const account = await seats.ensureAccount(pool, email)
    const row = await grantRowFor(pool, workspaceId, account.id)
    if (!row || row.revoked_at) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (row.requested_at && !row.accepted_at) return json(c, { code: 'JOIN_REQUEST_PENDING' }, 409)

    if (decision === 'accept') {
      if (row.declined_at) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
      if (!row.accepted_at) {
        const accepted = await acceptWorkspaceGrant(pool, workspaceId, account.id)
        if (!accepted) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
      }
      return json(c, { accepted: true })
    }
    if (row.declined_at) return json(c, { declined: true })
    if (row.accepted_at) return json(c, { code: 'ALREADY_GRANTED' }, 409)
    await declineWorkspaceGrant(pool, workspaceId, account.id)
    return json(c, { declined: true })
  }
  app.post('/me/workspaces/:id/accept', (c) => workspaceDecision(c, 'accept'))
  app.post('/me/workspaces/:id/decline', (c) => workspaceDecision(c, 'decline'))

  // ── POST /me/workspaces/:id/leave ─────────────────────────────────────────────────────────────
  // ported: handleWorkspaceLeave
  app.post('/me/workspaces/:id/leave', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const workspaceId = c.req.param('id')
    if (!WORKSPACE_ID.test(workspaceId)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    if (await overLimitOrClosed(pool, `workspace-leave:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const account = await seats.accountByEmail(pool, email)
    const grant = account ? await workspaceGrantFor(pool, account.id, workspaceId) : null
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (
      grant.role === 'owner' &&
      grant.accepted_at &&
      (await ownersOfWorkspace(pool, workspaceId)).length <= 1
    ) {
      return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
    }
    const revoked = await revokeWorkspaceGrant(pool, workspaceId, account.id)
    if (!revoked) return json(c, { code: 'GRANT_UNKNOWN' }, 404)
    if (
      grant.role === 'owner' &&
      grant.accepted_at &&
      (await ownersOfWorkspace(pool, workspaceId)).length === 0
    ) {
      await unrevokeWorkspaceGrant(pool, workspaceId, account.id)
      return json(c, { code: 'CANNOT_REVOKE_LAST_OWNER' }, 403)
    }
    return json(c, { left: true })
  })

  // ── POST /me/workspaces/:id/join-request — ask to join a workspace nobody invited you to ──────
  // ported: handleJoinRequest
  app.post('/me/workspaces/:id/join-request', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const workspaceId = c.req.param('id')
    if (!WORKSPACE_ID.test(workspaceId)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    if (await overLimitOrClosed(pool, `workspace-join-request:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const account = await seats.ensureAccount(pool, email)
    const workspace = await workspaceById(pool, workspaceId)
    if (!workspace) return json(c, { code: 'WORKSPACE_UNKNOWN' }, 404)

    const existing = await workspaceGrantFor(pool, account.id, workspaceId)
    if (existing?.accepted_at) return json(c, { code: 'ALREADY_GRANTED' }, 409)
    if (existing) {
      return json(c, {
        requested: true,
        already: true,
        workspace: { id: workspaceId, displayName: workspace.display_name ?? null }
      })
    }
    await grantWorkspace(pool, { workspaceId, accountId: account.id, grantedBy: account.id, requested: true })
    return json(
      c,
      {
        requested: true,
        already: false,
        workspace: { id: workspaceId, displayName: workspace.display_name ?? null }
      },
      201
    )
  })

  // ── GET|PUT /api/sites/:key/workspace — which workspace owns this site, and declaring one ─────
  // ported: handleSiteWorkspaceRead
  // ported: handleDeclareSiteWorkspace
  app.on(['GET', 'PUT'], '/api/sites/:key/workspace', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const siteKey = normalizeSiteKey(c.req.param('key'))

    if (c.req.method === 'GET') {
      const owner = await workspaceOfSite(pool, siteKey)
      if (!owner) return json(c, { workspace: null })
      const workspace = await workspaceById(pool, owner.workspace_id)
      return json(c, { workspace: { id: owner.workspace_id, displayName: workspace?.display_name ?? null } })
    }

    if (await overLimitOrClosed(pool, `workspace-declare:${email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const body = await c.req.json().catch(() => null)
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : ''
    if (!WORKSPACE_ID.test(workspaceId)) return json(c, { code: 'INVALID_REQUEST' }, 400)

    const caller = await seats.accountByEmail(pool, email)
    // 🔒 THE SITE'S OWN BOOK FIRST (#663). Being an owner of the TARGET workspace proves nothing
    // about the site — anyone can create a workspace. The caller must already hold a live OWNER
    // seat on this very site: declaring where a site belongs is administration, an Owner's act
    // (ADR 0028, Q3), and a workspace grant still never reaches a site's own doors. A site with no
    // such seat for them (owned by someone else, or owned by nobody) is refused before anything is
    // written. This door never grants a site seat: the creator's owner seat comes from
    // `sites/route.js`'s `claimOwnership`, when the site is made.
    const siteGrant = caller && siteKey ? await seats.grantFor(pool, caller.id, siteKey) : null
    if (!siteGrant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (!seats.actingOwner(siteGrant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)
    const grant = await workspaceGrantFor(pool, caller.id, workspaceId)
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if (!seats.actingOwner(grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)

    // A site already claimed by ANOTHER workspace is not taken by a plain overwrite — the caller
    // must hold an owner seat on BOTH sides (the workspace giving it up, and the one receiving it). Ported from
    // `handleDeclareSiteWorkspace`'s own hard-won rule (measured incident: a desktop's own startup
    // re-declare silently moved a live customer to a brand-new workspace nobody chose).
    const current = await workspaceOfSite(pool, siteKey)
    if (current && current.workspace_id !== workspaceId) {
      const onCurrent = await workspaceGrantFor(pool, caller.id, current.workspace_id)
      if (!seats.actingOwner(onCurrent)) {
        const owner = await workspaceById(pool, current.workspace_id)
        return json(
          c,
          {
            code: 'SITE_HAS_OWNER',
            workspace: { id: current.workspace_id, displayName: owner?.display_name ?? null }
          },
          409
        )
      }
    }

    const row = await declareSiteWorkspace(pool, { siteKey, workspaceId, declaredBy: caller.id })
    return json(c, { siteKey: row.site_key, workspaceId: row.workspace_id })
  })

  // ── GET /tracy-admin/overview — every workspace, its seats, and sites not yet declared ─────────
  // Ported from `handleTracyAdminOverview` (`workers/seat-registry/src/index.js:6037-6101`), same
  // response shape. `allLegacySiteGrants` has no counterpart here (see `store.js`'s docstring) —
  // `seats.liveSiteKeys` answers the same question against the one book this schema keeps.
  // ported: handleTracyAdminOverview
  app.get('/tracy-admin/overview', async (c) => {
    const auth = await tracyAdminOnly(c, TRACY_ADMIN_READ)
    if (auth.error) return auth.error

    const [workspaces, links, grants, liveKeys] = await Promise.all([
      allWorkspaces(pool),
      allWorkspaceSiteLinks(pool),
      allLiveWorkspaceGrants(pool),
      seats.liveSiteKeys(pool)
    ])

    const seatsByWorkspace = {}
    for (const grant of grants) {
      const bucket = (seatsByWorkspace[grant.workspace_id] ??= {
        total: 0,
        pending: 0,
        byRole: {},
        admins: []
      })
      bucket.total += 1
      // Empty `accepted_at` means an invitation sent and not yet answered — a number worth showing
      // on its own, since it is work waiting rather than a settled state.
      if (!grant.accepted_at) bucket.pending += 1
      bucket.byRole[grant.role] = (bucket.byRole[grant.role] ?? 0) + 1
      // owner/admin only: this desk reads ACROSS every customer, and the question it answers is
      // "who holds power here" — not "list everyone on every team", which is that team's own
      // business, not this desk's.
      if (grant.role === 'owner' || grant.role === 'admin') {
        bucket.admins.push({
          email: grant.seat?.email ?? null,
          role: grant.role,
          accepted: Boolean(grant.accepted_at)
        })
      }
    }

    const sitesByWorkspace = {}
    for (const link of links) {
      ;(sitesByWorkspace[link.workspace_id] ??= []).push(link.site_key)
    }

    const declared = new Set(links.map((row) => row.site_key))
    const undeclared = [...new Set(liveKeys)].filter((key) => !declared.has(key)).sort()

    const empty = { total: 0, pending: 0, byRole: {}, admins: [] }
    return json(c, {
      viewerRole: auth.role,
      workspaces: workspaces.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        kind: row.kind ?? 'customer',
        revenueModes: row.revenue_modes ?? [],
        industry: row.industry ?? null,
        sites: sitesByWorkspace[row.id] ?? [],
        seats: seatsByWorkspace[row.id] ?? empty
      })),
      undeclaredSites: undeclared
    })
  })

  // ── GET /tracy-admin/whoami — "is the viewer Tracy staff, and at what rank" ───────────────────
  app.get('/tracy-admin/whoami', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const account = await seats.accountByEmail(pool, email)
    const role = account ? await tracyAdminRoleOf(pool, account.id) : null
    if (!role || !TRACY_ADMIN_READ.includes(role)) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    return json(c, { email, role })
  })

  /** The gate onto every `/tracy-admin/*` write/read below — Care Point #1: prove a non-member gets
   *  403, not a partial answer. Returns `{ email, account, role }` or the Response to return. */
  async function tracyAdminOnly(c, allowed) {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return { error: email }
    const account = await seats.accountByEmail(pool, email)
    const role = account ? await tracyAdminRoleOf(pool, account.id) : null
    if (!role || !allowed.includes(role)) return { error: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    return { email, account, role }
  }

  // ── GET|POST /tracy-admin/members ─────────────────────────────────────────────────────────────
  // ported: handleTracyAdminMembers
  // ported: handleTracyAdminAddMember
  app.on(['GET', 'POST'], '/tracy-admin/members', async (c) => {
    const readDoor = c.req.method === 'GET'
    const auth = await tracyAdminOnly(c, readDoor ? TRACY_ADMIN_READ : TRACY_ADMIN_WRITE)
    if (auth.error) return auth.error
    const workspace = await tracyAdminWorkspace(pool)
    if (!workspace) return json(c, { code: 'TRACY_WORKSPACE_MISSING' }, 502)

    if (readDoor) {
      const rows = await seatsOfWorkspace(pool, workspace.id)
      return json(c, {
        viewer: { email: auth.email, role: auth.role },
        members: rows.filter(liveGrant).map(workspaceRosterRow)
      })
    }

    if (await overLimitOrClosed(pool, `tracy-admin-add:${auth.email}`, WRITE_LIMIT_PER_HOUR, now())) {
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    const body = await c.req.json().catch(() => null)
    const invited = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!EMAIL_SHAPE.test(invited)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const role = String(body?.role ?? '')
    if (!memberRoleAllowed(auth.role, role)) {
      return json(c, { code: 'ROLE_NOT_ALLOWED', detail: `${auth.role} cannot grant ${role}` }, 403)
    }

    const rows = await seatsOfWorkspace(pool, workspace.id)
    const live = rows.find((r) => r.seat?.email === invited && liveGrant(r))
    if (live?.accepted_at) return json(c, { code: 'ALREADY_A_MEMBER', member: workspaceRosterRow(live) }, 409)
    if (live && !memberRoleAllowed(auth.role, live.role)) {
      return json(c, { code: 'ROLE_NOT_ALLOWED', detail: `${auth.role} cannot grant ${live.role}` }, 403)
    }

    const alreadyHadAccount = Boolean(await seats.accountByEmail(pool, invited))
    const invitee = alreadyHadAccount
      ? await seats.accountByEmail(pool, invited)
      : await seats.ensureAccount(pool, invited)
    if (!live) {
      await grantWorkspace(pool, {
        workspaceId: workspace.id,
        accountId: invitee.id,
        role,
        grantedBy: auth.account.id
      })
    }
    const after = (await seatsOfWorkspace(pool, workspace.id)).find(
      (r) => r.seat?.email === invited && liveGrant(r)
    )
    if (!after) return json(c, { code: 'GRANT_NOT_WRITTEN' }, 502)

    const notified = await sendWorkspaceInvite(pool, mail, {
      lang: requestLanguage(c),
      alreadyHadAccount,
      inviterEmail: auth.email,
      workspace,
      workspaceId: workspace.id,
      acceptUrl: staffInviteUrl(workspace.id, config.origin),
      to: invited
    })
    return json(c, { member: workspaceRosterRow(after), invited: true, notified }, notified ? 201 : 202)
  })

  // In-memory, one Map per `workspacesRoutes()` instance (one per running process, same as the
  // Worker's KV was one per account): removal codes are a ten-minute, single-use secret, not
  // durable state — see `store.js`'s module docstring for why this task does not add a table for
  // it. Declared here, not at module scope, so tests (and separate processes) never share state.
  const removalCodes = new Map()

  // ── POST /tracy-admin/members/:accountId/code — ask for the removal code ─────────────────────
  // ported: handleTracyAdminRemovalCode
  app.post('/tracy-admin/members/:accountId/code', async (c) => {
    const auth = await tracyAdminOnly(c, TRACY_ADMIN_WRITE)
    if (auth.error) return auth.error
    const grantId = c.req.param('accountId')

    const workspace = await tracyAdminWorkspace(pool)
    if (!workspace) return json(c, { code: 'TRACY_WORKSPACE_MISSING' }, 502)
    const rows = await seatsOfWorkspace(pool, workspace.id)
    const target = rows.find((r) => r.account_id === grantId && liveGrant(r))
    if (!target) return json(c, { code: 'MEMBER_NOT_FOUND' }, 404)
    if (target.role === 'owner' && auth.role !== 'owner')
      return json(c, { code: 'OWNER_REMOVAL_NEEDS_OWNER' }, 403)
    if (
      target.role === 'owner' &&
      target.accepted_at &&
      (await ownersOfWorkspace(pool, workspace.id)).length <= 1
    ) {
      return json(c, { code: 'LAST_OWNER' }, 409)
    }

    const code = sixDigitCode()
    removalCodes.set(`${grantId}:${auth.email}`, { code, tries: 0, expiresAt: now() + REMOVAL_CODE_TTL_MS })
    try {
      const letter = mail.removalCodeMail({
        code,
        targetEmail: target.seat?.email ?? null,
        lang: requestLanguage(c)
      })
      await mail.send({ to: auth.email, subject: letter.subject, text: letter.text, html: letter.html })
    } catch {
      return json(c, { code: 'MAIL_NOT_SENT' }, 502)
    }
    return json(c, { sent: true, to: maskEmail(auth.email), expiresInSeconds: REMOVAL_CODE_TTL_MS / 1000 })
  })

  // ── DELETE /tracy-admin/members/:accountId — take somebody off Tracy ─────────────────────────
  // ported: handleTracyAdminRemoveMember
  app.delete('/tracy-admin/members/:accountId', async (c) => {
    const auth = await tracyAdminOnly(c, TRACY_ADMIN_WRITE)
    if (auth.error) return auth.error
    const grantId = c.req.param('accountId')
    const workspace = await tracyAdminWorkspace(pool)
    if (!workspace) return json(c, { code: 'TRACY_WORKSPACE_MISSING' }, 502)

    const body = await c.req.json().catch(() => ({}))
    const supplied = typeof body?.code === 'string' ? body.code.trim() : ''
    const key = `${grantId}:${auth.email}`
    const stored = removalCodes.get(key)
    if (!stored || stored.expiresAt <= now()) {
      removalCodes.delete(key)
      return json(c, { code: 'REMOVAL_CODE_REQUIRED' }, 428)
    }
    if (!supplied || !codesMatch(supplied, stored.code)) {
      stored.tries += 1
      if (stored.tries >= REMOVAL_CODE_TRIES) {
        removalCodes.delete(key)
        return json(c, { code: 'REMOVAL_CODE_EXHAUSTED' }, 429)
      }
      return json(c, { code: 'REMOVAL_CODE_INVALID', triesLeft: REMOVAL_CODE_TRIES - stored.tries }, 403)
    }
    removalCodes.delete(key)

    const rows = await seatsOfWorkspace(pool, workspace.id)
    const target = rows.find((r) => r.account_id === grantId && liveGrant(r))
    if (!target) return json(c, { code: 'MEMBER_NOT_FOUND' }, 404)
    if (target.role === 'owner' && auth.role !== 'owner')
      return json(c, { code: 'OWNER_REMOVAL_NEEDS_OWNER' }, 403)
    if (target.role === 'owner' && target.accepted_at) {
      const owners = await ownersOfWorkspace(pool, workspace.id)
      if (owners.length <= 1) return json(c, { code: 'LAST_OWNER' }, 409)
    }

    const revoked = await revokeWorkspaceGrant(pool, workspace.id, grantId)
    if (!revoked) return json(c, { code: 'ALREADY_REMOVED' }, 409)
    if (
      target.role === 'owner' &&
      target.accepted_at &&
      (await ownersOfWorkspace(pool, workspace.id)).length === 0
    ) {
      await unrevokeWorkspaceGrant(pool, workspace.id, grantId)
      return json(c, { code: 'LAST_OWNER' }, 409)
    }
    return json(c, { removed: workspaceRosterRow({ ...target, revoked_at: revoked.revoked_at }) })
  })

  return app
}
