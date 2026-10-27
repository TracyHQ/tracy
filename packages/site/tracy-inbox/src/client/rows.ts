/**
 * One notification → what its Inbox row says and where a press on it goes.
 *
 * The log stores no sentence (spec #809): a row is `kind` + `data`, and the words are built here in
 * the READER's language at the moment the row is drawn. So this module answers in translation keys
 * and parameters, never in English; `inbox.tsx` hands them to `t`.
 *
 * A kind this build does not know (a newer server, a typo) gives `null`, and the row is skipped:
 * a row with no sentence is worse than no row.
 *
 * Pure and dependency-free, so `test/rows.test.mjs` pins every kind in Node.
 */

/** The seat book's roles (`@tracy/core/team` `SeatRole`), restated so this file imports nothing. */
export type Role = 'owner' | 'editor' | 'viewer'

const ROLES: readonly Role[] = ['owner', 'editor', 'viewer']

/**
 * Roles retired by ADR 0028 and what each became. The log keeps rows written before the
 * migration, so an old "invited you as an Admin" row now reads as the role that seat holds today.
 */
const RETIRED_ROLES: Readonly<Record<string, Role>> = { admin: 'editor', developer: 'editor' }

/** A person's face as tracy-web decides it (`personFace`), restated so this file imports nothing. */
export interface InboxFace {
  initial: string
  color: string
  avatarUrl: string | null
}

export interface InboxActor {
  id: string
  email: string
  name: string | null
  /** Their face as tracy-web sends it; the Inbox rows do not draw it (Akemi 04/10/2026, option I). */
  face?: InboxFace | null
}

/** One row as `GET /api/notifications` answers it. */
export interface InboxNotification {
  id: string
  kind: string
  siteKey: string | null
  /**
   * The site's address now (Akemi 04/10): a renamed site reads by its new name on old rows too, a
   * deleted one by the name it had. Absent from an older server: the key is shown instead.
   */
  siteName?: string | null
  actor: InboxActor | null
  data: Record<string, unknown>
  settledAt: string | null
  createdAt: string
  readAt: string | null
}

/** Where a press on a row goes, after it is marked read. */
export type RowTarget =
  | { kind: 'team'; siteKey: string; member?: string }
  | { kind: 'comments'; siteKey: string; commentId?: string; page?: string }
  /** The site's Site changes tab (`@tracy/dsh-site-tabs` `tracy:changes`). */
  | { kind: 'changes'; siteKey: string }
  | null

export interface RowView {
  /** Translation key of the sentence (namespace `tracy-inbox`). */
  key: string
  /**
   * Values for the sentence's placeholders except `{actor}` (drawn bold by the caller) and
   * `{asRole}` / `{role}`, which the caller translates from {@link RowView.asRole} and
   * {@link RowView.role}.
   */
  params: Record<string, string>
  /** The actor's display name, or null for a row nobody acted on. */
  actorName: string | null
  /** The role phrase the sentence needs after "as" (`{asRole}`), or null. */
  asRole: Role | null
  /** The bare role name a sentence needs (`{role}`), translated by the caller from `role.*`, or null. */
  role: Role | null
  /** The quoted comment, or who deleted it (rule R3), or nothing. */
  quote: { text: string } | { deletedBy: string } | null
  /** What the muted line under the sentence names. */
  context: { place: 'team' | 'comment'; site: string | null; page: string | null; role: Role | null }
  /** False when the site must not be a link (T13: the site no longer exists). */
  siteLink: boolean
  /** The button at the right of the row. */
  /** `answer`: Accept / Decline on an invitation still open (`settledAt` null). */
  action: 'review' | 'answer' | null
  /** How an answered invitation ended (`data.outcome`, written when it settled), else null. */
  outcome: 'accepted' | 'declined' | 'approved' | null
  target: RowTarget
}

/** A display name: the account's name, else the local part of its address. */
export function actorName(actor: InboxActor | null): string | null {
  if (actor === null) return null
  const name = typeof actor.name === 'string' ? actor.name.trim() : ''
  if (name !== '') return name
  const local = typeof actor.email === 'string' ? actor.email.split('@')[0] : ''
  return local !== undefined && local !== '' ? local : null
}

const roleOf = (value: unknown): Role | null => {
  if (typeof value !== 'string') return null
  if ((ROLES as readonly string[]).includes(value)) return value as Role
  return Object.hasOwn(RETIRED_ROLES, value) ? (RETIRED_ROLES[value] as Role) : null
}

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/**
 * The string an outcome reads with. A declined join request has its own key: the word agrees with
 * its noun in gendered languages (Italian "invito" is masculine, "richiesta" feminine: "Rifiutato" /
 * "Rifiutata").
 */
export function outcomeKeyOf(kind: string, outcome: 'accepted' | 'declined' | 'approved'): string {
  return (kind === 'team.join_request' || kind === 'team.edit_access_request') && outcome === 'declined'
    ? 'outcome.requestDeclined'
    : `outcome.${outcome}`
}

/** An invitation's recorded outcome, or null for anything else. */
export function outcomeOf(value: unknown): 'accepted' | 'declined' | 'approved' | null {
  return value === 'accepted' || value === 'declined' || value === 'approved' ? value : null
}

/**
 * The row for one notification, or null when it cannot be drawn.
 * @param n - one notification from the doors.
 */
export function describe(n: InboxNotification): RowView | null {
  if (n === null || typeof n !== 'object' || typeof n.kind !== 'string') return null
  const data = n.data !== null && typeof n.data === 'object' ? n.data : {}
  // The key finds the site (targets, links); the name is what the sentence says.
  const siteKey = textOf(n.siteKey) ?? ''
  const site = textOf(n.siteName) ?? siteKey
  const who = actorName(n.actor)
  const role = roleOf(data.role)
  const teamTarget: RowTarget = siteKey !== '' ? { kind: 'team', siteKey } : null

  const team = (key: string, extra: Partial<RowView> = {}): RowView => ({
    key,
    params: { site },
    actorName: who,
    asRole: null,
    role: null,
    quote: null,
    context: { place: 'team', site, page: null, role },
    siteLink: true,
    action: null,
    outcome: null,
    target: teamTarget,
    ...extra
  })

  /** A sentence that names the actor needs one; without it the row has no subject. */
  const needsActor = (view: RowView): RowView | null => (who === null ? null : view)

  switch (n.kind) {
    case 'team.invited': // Accept / Decline until the invitation is answered anywhere (Inbox, email, My Sites): the
      // server settles this row then (`inviteRef` in seats/route.js).
      // Once answered it reads "… · Accepted" / "… · Declined" (Akemi 04/10/2026); a row settled
      // by a cancel carries no outcome and stays as it was (the cancel has its own row).
      {
        const answered = n.settledAt ? outcomeOf(data.outcome) : null
        const action = n.settledAt ? null : 'answer'
        return needsActor(
          role === null
            ? team('act.team.invitedNoRole', { action, outcome: answered })
            : team('act.team.invited', { asRole: role, action, outcome: answered })
        )
      }
    case 'team.join_request': {
      const member = n.actor?.email
      return needsActor(
        team('act.team.joinRequest', {
          action: n.settledAt ? null : 'review',
          // Once answered it reads "… · Approved" / "… · Declined" (Akemi 04/10/2026).
          outcome: n.settledAt ? outcomeOf(data.outcome) : null,
          target: siteKey !== '' ? { kind: 'team', siteKey, ...(member ? { member } : {}) } : null
        })
      )
    }
    case 'team.edit_access_request': {
      // A Viewer asked the Owners for edit access (ADR 0028 §6): Review opens the Team tab on that
      // person, where an Owner approves or declines, until any Owner has answered.
      const member = n.actor?.email
      return needsActor(
        team('act.team.editAccessRequest', {
          action: n.settledAt ? null : 'review',
          outcome: n.settledAt ? outcomeOf(data.outcome) : null,
          target: siteKey !== '' ? { kind: 'team', siteKey, ...(member ? { member } : {}) } : null
        })
      )
    }
    case 'team.edit_access_answered': {
      // Another Owner answered that request: news for the Owners who did not.
      const decision = data.decision
      if (decision !== 'approved' && decision !== 'declined') return null
      const named = textOf(data.requesterName)
      const requester = actorName({
        id: '',
        name: named?.includes('@') ? null : named,
        email: textOf(data.requesterEmail) ?? ''
      })
      if (requester === null) return null
      return needsActor(
        team(decision === 'approved' ? 'act.team.editAccessApproved' : 'act.team.editAccessDeclined', {
          params: { site, requester }
        })
      )
    }
    case 'team.edit_access_approved':
      // The Viewer is an Editor now.
      return team(who === null ? 'act.team.editAccessGrantedPassive' : 'act.team.editAccessGranted')
    case 'team.edit_access_declined':
      // Who declined is never named, as in the letter; the seat stays a Viewer.
      return team('act.team.editAccessRefused')
    case 'team.join_answered': {
      const decision = data.decision
      if (decision !== 'approved' && decision !== 'declined') return null
      // The same rule as every actor: the display name, else the local part of the address (a row
      // from before 04/10 may carry the address as its name).
      const named = textOf(data.requesterName)
      const requester = actorName({
        id: '',
        name: named?.includes('@') ? null : named,
        email: textOf(data.requesterEmail) ?? ''
      })
      if (requester === null) return null
      return needsActor(
        team(decision === 'approved' ? 'act.team.joinApproved' : 'act.team.joinDeclined', {
          params: { site, requester }
        })
      )
    }
    case 'team.approved':
      return team(who === null ? 'act.team.approvedPassive' : 'act.team.approved')
    case 'team.declined':
      // The person has no seat on the site: the Team tab would have nothing to show them.
      return team('act.team.declined', { target: null })
    case 'team.invite_accepted':
      return needsActor(team('act.team.inviteAccepted'))
    case 'team.invite_declined':
      return needsActor(team('act.team.inviteDeclined'))
    case 'team.joined':
      return needsActor(
        role === null ? team('act.team.joinedNoRole') : team('act.team.joined', { asRole: role })
      )
    case 'team.removed':
      return needsActor(team('act.team.removed', { target: null }))
    case 'team.role_changed': {
      const to = roleOf(data.to)
      if (to === null) return null
      return team(who === null ? 'act.team.roleChangedPassive' : 'act.team.roleChanged', {
        params: { site },
        role: to,
        context: { place: 'team', site, page: null, role: null }
      })
    }
    case 'team.left':
      return needsActor(team('act.team.left'))
    case 'team.invite_cancelled':
      return team(who === null ? 'act.team.inviteCancelledPassive' : 'act.team.inviteCancelled', {
        target: null
      })
    case 'team.site_restored': {
      // T12: "Restore everything", named by the backup's title. It opens the site's Site changes
      // tab, not the Team tab: the restore is a row of that ledger, lit there as new since the
      // reader last looked, and the Site changes badge clears in the same press (plan
      // `tasks/todo-site-changes-badge-count.md` §4). The row is marked read as every row is.
      const backup = textOf(data.backup)
      if (backup === null) return null
      return needsActor(
        team('act.team.siteRestored', {
          params: { site, backup },
          target: siteKey !== '' ? { kind: 'changes', siteKey } : null
        })
      )
    }
    case 'team.site_deleted':
      // T13: the site is gone, so its name is plain text and nothing opens.
      return needsActor(team('act.team.siteDeleted', { siteLink: false, target: null }))
    case 'team.site_renamed': {
      // T14: `oldSite` and `newSite` are the two addresses of THAT step, kept when it happened. The
      // site's name now is not that step's "to": a site renamed wp → wpx → wp read "Renamed wp to wp"
      // on its first row (E2E dev 04/10 E9.1b). A row written before `newSite` was kept reads the
      // name now, as before. The press still finds the site by its key. Unlike T12 it keeps the Team
      // tab: a rename is a team event about the site's address, not a row of the Site changes ledger,
      // so that tab would have nothing lit to show for it.
      const oldSite = textOf(data.oldSite)
      if (oldSite === null) return null
      const newSite = textOf(data.newSite) ?? site
      return needsActor(
        team('act.team.siteRenamed', {
          params: { site: newSite, oldSite },
          context: { place: 'team', site: newSite, page: null, role }
        })
      )
    }
    case 'comment.mention':
    case 'comment.reply':
    case 'comment.resolved':
    case 'comment.reopened': {
      if (who === null) return null
      const key =
        n.kind === 'comment.mention'
          ? 'act.comment.mention'
          : n.kind === 'comment.reply'
            ? data.yours === true
              ? 'act.comment.replyYours'
              : 'act.comment.replyThread'
            : n.kind === 'comment.resolved'
              ? 'act.comment.resolved'
              : 'act.comment.reopened'
      const quoted = textOf(data.quote)
      const quote = data.deleted === true ? { deletedBy: who } : quoted !== null ? { text: quoted } : null
      return {
        key,
        params: { site },
        actorName: who,
        asRole: null,
        role: null,
        quote,
        context: { place: 'comment', site: site !== '' ? site : null, page: textOf(data.page), role: null },
        siteLink: true,
        action: null,
        outcome: null,
        target:
          siteKey === ''
            ? null
            : {
                kind: 'comments',
                siteKey,
                ...(textOf(data.commentId) && data.deleted !== true
                  ? { commentId: textOf(data.commentId) as string }
                  : {}),
                ...(textOf(data.page) ? { page: textOf(data.page) as string } : {})
              }
      }
    }
    default:
      return null
  }
}
