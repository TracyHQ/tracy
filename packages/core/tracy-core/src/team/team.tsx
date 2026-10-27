/**
 * The Team column of My Sites: the people cluster on a row, the book that opens under it, and the
 * two dialogs the book's actions need. Ported from `tracy-desk`'s `SeatTable` / `SeatDialogs`
 * (Site settings › Team) — same columns, same gating, same words — folded into the tab so a site's
 * people sit beside its agent (Lee, 04/09).
 *
 * 🔒 NO ACTION IS DRAWN THAT THE SEAT BOOK WOULD REFUSE. Every icon is gated by `actionsFor`, which
 * encodes what the registry's write doors enforce. A row with nothing to offer shows an empty
 * cell; a viewer who runs no site sees the book and no column of icons at all.
 *
 * Mode B, like the rest of this plugin: `@tracy/ui` + Tailwind utilities, no preflight. `table`,
 * `th`, `td` therefore still carry UA styles — every cell sets its own alignment and weight.
 */
import { type JSX, useEffect, useRef, useState } from 'react'
import { Pencil, RotateCcw, Trash2, UserPlus, Users } from 'lucide-react'
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@tracy/ui'

import {
  actionsFor,
  agoOf,
  agoUnitsOf,
  approveRolesFor,
  assignableRoles,
  type InvitableRole,
  closedAs,
  clusterOf,
  type EditDecision,
  granterOf,
  isEditRequest,
  isJoinRequest,
  nameOf,
  PERMISSIONS,
  type RemovalKind,
  removalOf,
  roleAllows,
  runsSite,
  seatRoleOf,
  type SeatRole,
  type SeatRow,
  type TeamSite
} from './roster'
import { Face, FaceStack } from './face'
import { RolePermissions, RoleRows } from './role-rows'
import { shortNameOf } from './wizard-plan'
import type { Translate } from './translate'

export interface Viewer {
  email: string | null
  role: SeatRole | null
}

/**
 * Owner is the filled brand chip; every other role is a soft chip filled with a tint of the text
 * colour. It was an outline until 01/10, and on a light panel that hairline measured 1.17:1 against
 * the ground, so "Admin" read as loose text (Akemi chose the filled chip on the options page).
 */
export function RoleBadge({ role, t }: { role: SeatRole; t: Translate }): JSX.Element {
  // Always the translated name, never the raw code (a retired one from an older server included).
  const known = seatRoleOf(role)
  const label = known === null ? '' : t(`role.${known}`)
  if (known === 'owner') return <Badge>{label}</Badge>
  return (
    <Badge variant="outline" className="border-transparent bg-foreground/8 text-foreground">
      {label}
    </Badge>
  )
}

/**
 * Every row carries exactly one status. "Active" is drawn too (Akemi, 30/09): a Status column that
 * stays empty for every ordinary seat read as a broken table. A status is a dot and a word, not a
 * chip (Akemi, 01/10), so it never looks like a second role: green for active, grey for the rest.
 * Only "Asked to join" and "Asked for edit access" stay filled chips: the rows waiting on an Owner.
 *
 * `editChip` says whether this place draws the edit-access chip. The Status column does not: the
 * Viewer who asked is an active member, and the chip with its Approve and Decline ride their own line
 * under the email (`EditRequestLine`), so the request costs the Member column nothing (measured
 * 08/10/2026: in Status and the actions column they took Member from 469px to 243px and cut every
 * row's email). The folded badge line under a narrow panel draws it, as before.
 */
function StatusBadge({
  seat,
  t,
  editChip = true
}: {
  seat: SeatRow
  t: Translate
  editChip?: boolean
}): JSX.Element {
  if (isJoinRequest(seat)) return <Badge data-status="">{t('status.requested')}</Badge>
  if (editChip && isEditRequest(seat)) return <Badge data-status="">{t('status.editRequested')}</Badge>
  const gone = seat.status === 'revoked' || seat.status === 'declined'
  return (
    <span
      data-status=""
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-xs leading-4',
        gone ? 'text-muted-foreground' : 'text-foreground'
      )}
    >
      <span
        data-status-dot=""
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          seat.status === 'active' ? 'bg-success' : gone ? 'bg-muted-foreground/50' : 'bg-muted-foreground'
        )}
      />
      {/* A row an administrator closed is worded by the act that closed it (#792). */}
      {t(seat.status === 'revoked' ? closedAs(seat).statusKey : `status.${seat.status}`)}
    </span>
  )
}

/** What the selected role can do — re-rendered the moment the radio changes. */
export function PermissionLegend({ role, t }: { role: SeatRole; t: Translate }): JSX.Element {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="m-0 mb-2 font-medium text-xs">
        {/* One whole sentence per role, so each language words its own article (ADR 0028). */}
        {t(`wizard.permissionsTitle.${role}`)}
      </p>
      <ul className="m-0 grid list-none gap-1 p-0 text-xs">
        {PERMISSIONS.map((p) => {
          const ok = roleAllows(role, p.from)
          return (
            <li key={p.key} className={cn('flex items-center gap-2', !ok && 'text-muted-foreground/70')}>
              <span aria-hidden="true" className={cn('w-3 text-center', ok ? 'text-primary' : '')}>
                {ok ? '✓' : '×'}
              </span>
              {t(p.key)}
            </li>
          )
        })}
      </ul>
      <p className="m-0 mt-2 text-[11px] text-muted-foreground/70">{t('dialog.changeRole.ownerNote')}</p>
    </div>
  )
}

/**
 * The Team cell: faces, a count, and the one thing waiting on the reader.
 *
 * `seats === null` means the book could not be read — the seat is not accepted yet, or the
 * registry refused — and the cell says nothing rather than "only you", which would be a claim.
 */
export function PeopleCluster({
  site,
  viewerEmail,
  open,
  loading,
  onClick,
  t
}: {
  site: TeamSite
  viewerEmail: string | null
  open: boolean
  loading: boolean
  onClick: () => void
  t: Translate
}): JSX.Element {
  // The faces are the OTHERS; the number counts every member, the viewer included, straight — it
  // was "the others + 1" until 04/10, one too many while `/auth/me` had not answered. A site with
  // nobody else on it says "only you" rather than "1", once the viewer is known (`clusterOf`).
  const cluster = clusterOf(site.seats, viewerEmail)
  const faces = cluster?.faces ?? []
  const asked = (site.seats ?? []).filter(isJoinRequest).length
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={site.seats === null && !loading}
      className={cn(
        'flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground disabled:opacity-60 disabled:hover:bg-transparent',
        open && 'bg-muted text-foreground'
      )}
      title={t('team.open')}
    >
      {asked > 0 && <Badge>{t('team.asked', { count: asked })}</Badge>}
      {faces.length > 0 ? (
        <FaceStack people={faces} size={20} ring="var(--background, #ffffff)" />
      ) : (
        <Users className="size-3.5" aria-hidden="true" />
      )}
      {loading ? '…' : cluster === null ? '' : cluster.onlyYou ? t('team.onlyYou') : String(cluster.count)}
    </button>
  )
}

/**
 * One site's book. The viewer's own row is the registry's, not a synthetic one.
 *
 * Layout (Akemi, 30/09): Role, Status and the actions are only as wide as their content
 * (`w-px` + `whitespace-nowrap`), and Member takes everything left (`w-full max-w-0`, the one cell
 * that may ellipsize) — so an email is cut only when the row is really out of room. Columns may sit
 * a few pixels apart from one site to the next; that trade was approved. One real `<table>`, one
 * padding for `th` and `td`, so every header stands over its own cells at every width.
 *
 * There is no Access column (Akemi, 01/10): its line ("Granted … · by …") sits under the member's
 * email at every width. As a column it was capped at 160px and cut the granter's address while
 * Member stood half empty.
 *
 * The book is its own size container. Below a 600px panel its box is the panel minus 34px (the
 * page's 16px gutters and this border), so below a 560px panel (box < 526px) Role and Status fold into a badge line under
 * the name and Approve moves onto that line. Status is visible at every width; nothing scrolls
 * sideways. A Viewer's request for edit access never sits in a content-sized column: its chip,
 * Approve and Decline ride a line of their own under the access line, so one request cannot narrow
 * Member for every row (ADR 0028 §6).
 */
export function Roster({
  site,
  viewer,
  busy,
  highlight = null,
  onChangeRole,
  onRemove,
  onReinvite,
  onApprove,
  onAnswerEdit,
  t
}: {
  site: TeamSite
  viewer: Viewer
  busy: boolean
  /** The address a link pointed at: that row is marked and scrolled into view once. */
  highlight?: string | null
  onChangeRole: (seat: SeatRow) => void
  onRemove: (seat: SeatRow) => void
  onReinvite: (seat: SeatRow) => void
  onApprove: (seat: SeatRow) => void
  /** An Owner's answer to a Viewer's request for edit access (ADR 0028 §6). */
  onAnswerEdit: (seat: SeatRow, decision: EditDecision) => void
  t: Translate
}): JSX.Element {
  // One clock per render, not one per row: a table where two rows disagree about "now" is a
  // table that says "2 minutes ago" and "3 minutes ago" for the same second.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [site.seats])
  const seats = site.seats ?? []
  const viewerOnSite: Viewer = { email: viewer.email, role: site.myRole }
  const ownerCount = seats.filter((s) => s.role === 'owner' && s.status === 'active').length
  // The actions column follows the VIEWER's role, not this site's rows: an Owner or Admin gets it on
  // every site (a cell stays empty where a row offers nothing), a Developer or Editor never does —
  // so one viewer sees one frame everywhere instead of a column that comes and goes per site.
  const showActions = runsSite(site.myRole)
  const unit = agoUnitsOf(t)
  /**
   * The access line in two parts: `head` says what happened and when, `sub` says where the access
   * came from — "from your workspace" for an inherited seat, else who gave it ("by …").
   */
  const accessOf = (seat: SeatRow): { head: string; sub: string | null } => {
    // Named by email via `granterOf`, never `grantedBy` — that is an account id, and it was printed
    // as one until 29/09 ("by 14283358-185e-…"); comparing it with an email never matched either.
    const granter = granterOf(seat, viewer.email)
    // No line names a granter the server did not name (`unsaid`: an older tracy-web).
    const named = granter.kind !== 'self' && granter.kind !== 'unsaid'
    const who =
      granter.kind === 'email'
        ? granter.email
        : granter.kind === 'you'
          ? t('access.you')
          : t('access.unknownGranter')
    const workspace = seat.scope === 'workspace' ? t('access.fromWorkspace') : null
    const by = workspace ?? (named ? t('access.by', { by: who }) : null)
    if (seat.status === 'revoked')
      return {
        head: t(closedAs(seat).accessKey, { ago: agoOf(seat.revokedAt, now, unit) }),
        sub: workspace
      }
    if (isJoinRequest(seat))
      return { head: t('access.asked', { ago: agoOf(seat.requestedAt, now, unit) }), sub: workspace }
    // A declined row is an invitation that was turned down: `grantedAt` is when it was sent, and the
    // Status badge already says "Declined". It read "Granted …" until 30/09, as if access was given.
    if (seat.status === 'invited' || seat.status === 'declined')
      return { head: t('access.invited', { ago: agoOf(seat.grantedAt, now, unit) }), sub: by }
    return { head: t('access.granted', { ago: agoOf(seat.grantedAt, now, unit) }), sub: by }
  }
  // Touch screens never hover, so there the icons are always shown.
  const reveal =
    'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100'
  // A callback ref, not an effect: it fires when the marked row mounts, which is the one moment
  // the row is certainly in the DOM. Guarded so a re-render does not scroll the reader again.
  const scrolled = useRef(false)
  const scrollOnce = (row: HTMLTableRowElement | null): void => {
    if (row === null || scrolled.current) return
    scrolled.current = true
    row.scrollIntoView({ block: 'center' })
  }
  // One padding and one alignment for a column's header and its cells, so they share a left edge.
  // The fold toggles are `!important` on purpose: every plugin injects its own Tailwind sheet into
  // dsh's page, all in one `utilities` layer, so a plain `.hidden` or `.block` from a sheet loaded
  // later outranks a container-query rule of ours (measured 30/09: the folded Access line stayed
  // hidden in the live app while the single-sheet test passed).
  const cell = 'px-3 py-2 text-left align-middle'
  const fit = 'w-px whitespace-nowrap'
  const roleCol = cn(cell, fit, '@max-[526px]:hidden!')
  const statusCol = cn(cell, fit, '@max-[526px]:hidden!')
  const actionsCol = cn(fit, 'py-2 pr-2 pl-1 align-middle')
  return (
    <div className="@container overflow-x-auto rounded-lg border border-border" data-team-roster="">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-xs">
          <tr>
            <th className={cn(cell, 'w-full font-medium')}>{t('roster.member')}</th>
            <th className={cn(roleCol, 'font-medium')}>{t('roster.role')}</th>
            <th className={cn(statusCol, 'font-medium')}>{t('roster.status')}</th>
            {showActions && <th className={actionsCol} />}
          </tr>
        </thead>
        {/* Cells centre vertically: the Member cell is the tallest (avatar), and top-aligned cells
            left the role badge and access text riding above the name (Akemi, 29/09). */}
        <tbody className="divide-y divide-border">
          {seats.map((seat) => {
            const gone = seat.status === 'revoked' || seat.status === 'declined'
            const isYou = seat.email !== null && seat.email === viewer.email
            const actions = actionsFor(seat, viewerOnSite, ownerCount)
            const access = accessOf(seat)
            const accessFull = access.sub === null ? access.head : `${access.head} · ${access.sub}`
            return (
              <tr
                key={seat.id}
                ref={seat.email !== null && seat.email === highlight ? scrollOnce : undefined}
                className={cn(
                  'group/row',
                  // The viewer's own row is tinted so it is found at a glance — "(you)" alone was too
                  // small (Akemi, 29/09). A tint of the text colour, visible on dark and light alike.
                  isYou && 'bg-foreground/5',
                  gone && 'text-muted-foreground',
                  seat.email !== null &&
                    seat.email === highlight &&
                    'bg-primary/5 ring-1 ring-primary/40 ring-inset'
                )}
              >
                {/* `max-w-0` keeps the long email out of the table's width sums; `w-full` then hands
                    this cell whatever the content-sized columns leave. */}
                <td className={cn(cell, 'w-full max-w-0')} data-col="member">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Face face={seat} size={28} />
                    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate" title={nameOf(seat)} data-member-name="">
                          {nameOf(seat)}
                        </span>
                        {isYou && (
                          <span className="shrink-0 text-muted-foreground text-xs">{t('roster.you')}</span>
                        )}
                      </span>
                      {seat.displayName !== null && seat.email !== null && (
                        <span className="truncate text-muted-foreground text-xs" title={seat.email}>
                          {seat.email}
                        </span>
                      )}
                      {/* Narrow panel: Role and Status ride under the name, Approve beside them. */}
                      <span className="mt-0.5 hidden flex-wrap items-center gap-1 @max-[526px]:flex!">
                        <RoleBadge role={seat.role} t={t} />
                        <StatusBadge seat={seat} t={t} />
                        {showActions && actions.approve && (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={busy}
                            className="h-5"
                            onClick={() => onApprove(seat)}
                          >
                            {t('action.approve')}
                          </Button>
                        )}
                        {showActions && actions.answerEdit && (
                          <>
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={busy}
                              className="h-5"
                              onClick={() => onAnswerEdit(seat, 'approve')}
                            >
                              {t('action.approve')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busy}
                              className="h-5"
                              onClick={() => onAnswerEdit(seat, 'decline')}
                            >
                              {t('action.decline')}
                            </Button>
                          </>
                        )}
                      </span>
                      {/* Where the access came from, under the email at every width. */}
                      <span className="truncate text-[11px] text-muted-foreground" title={accessFull}>
                        {accessFull}
                      </span>
                      {/* A Viewer's request for edit access, on its own line (wide panel; the folded
                          badge line above carries it below 560px). Approve makes them an Editor at
                          once, Decline only clears the request (they may ask again). No dialog:
                          neither answer takes anything away. */}
                      {isEditRequest(seat) && (
                        <span
                          className="mt-0.5 flex flex-wrap items-center gap-1 @max-[526px]:hidden!"
                          data-edit-request=""
                        >
                          <Badge>{t('status.editRequested')}</Badge>
                          {showActions && actions.answerEdit && (
                            <>
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={busy}
                                className="h-5"
                                title={t('action.approveEdit')}
                                onClick={() => onAnswerEdit(seat, 'approve')}
                              >
                                {t('action.approve')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={busy}
                                className="h-5"
                                title={t('action.declineEdit')}
                                onClick={() => onAnswerEdit(seat, 'decline')}
                              >
                                {t('action.decline')}
                              </Button>
                            </>
                          )}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className={roleCol}>
                  <RoleBadge role={seat.role} t={t} />
                </td>
                <td className={statusCol}>
                  <StatusBadge seat={seat} t={t} editChip={false} />
                </td>
                {showActions && (
                  <td className={actionsCol}>
                    <span className="flex items-center justify-end gap-0.5">
                      {actions.approve && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="@max-[526px]:hidden!"
                          onClick={() => onApprove(seat)}
                        >
                          {t('action.approve')}
                        </Button>
                      )}
                      {actions.changeRole && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          className={cn('px-2', reveal)}
                          title={t('action.changeRole')}
                          aria-label={t('action.changeRole')}
                          onClick={() => onChangeRole(seat)}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      {actions.reinvite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          className={cn('px-2', reveal)}
                          title={t('action.reinvite')}
                          aria-label={t('action.reinvite')}
                          onClick={() => onReinvite(seat)}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      {actions.remove && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          className={cn('px-2 text-destructive hover:text-destructive', reveal)}
                          title={t(removalOf(seat).labelKey)}
                          aria-label={t(removalOf(seat).labelKey)}
                          onClick={() => onRemove(seat)}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </span>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Change one seat's role. The rows ARE `assignableRoles`, so nothing here can be chosen and then
 * refused. Seeded to the seat's current role; picking the same role just closes.
 *
 * The same icon rows as the invite wizard (Editor, Viewer, Owner with a crown), approved 08/10
 * (ADR 0028). The popup carries `tv-team-dialog` itself: it is portalled out of the plugin root,
 * and the rows are styled under that scope (`site-tabs-rules.css`, DESIGN.md 3.1).
 */
export function ChangeRoleDialog({
  seat,
  viewerRole,
  ownerCount,
  busy,
  onOpenChange,
  onSubmit,
  t
}: {
  seat: SeatRow | null
  viewerRole: SeatRole | null
  ownerCount: number
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (role: SeatRole) => void
  t: Translate
}): JSX.Element {
  const [role, setRole] = useState<SeatRole>('editor')
  useEffect(() => {
    if (seat) setRole(seatRoleOf(seat.role) ?? 'editor')
  }, [seat])
  const roles = seat ? assignableRoles(viewerRole, seat, ownerCount) : []
  const current = seat ? seatRoleOf(seat.role) : null
  return (
    <Dialog open={seat !== null} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites tracy-site-tabs tv-team-dialog">
        <DialogHeader>
          <DialogTitle>{t('action.changeRole')}</DialogTitle>
          {seat && (
            <DialogDescription>{t('dialog.changeRoleBody', { name: nameOf(seat) })}</DialogDescription>
          )}
        </DialogHeader>
        <div className="tv-team-body">
          <RoleRows<SeatRole> roles={roles} value={role} onChange={setRole} t={t} />
          <PermissionLegend role={role} t={t} />
        </div>
        <DialogFooter className="tv-team-foot">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button size="sm" disabled={busy || !seat || role === current} onClick={() => onSubmit(role)}>
            {t('action.changeRole')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Approve a join request (Akemi 04/10/2026): pick a role, Editor by default, and the person joins
 * the team at once. No invitation is sent and there is nothing for them to accept.
 *
 * Layout V3 (Akemi 04/10): the requester on top as the Inbox's "Needs your answer" card (short
 * name, address, when they asked), the approved sentence, the D3 role rows shared with the invite
 * wizard, and what the role can do folded behind "See what {role} can do".
 */
export function ApproveDialog({
  seat,
  siteName,
  viewerRole,
  busy,
  onOpenChange,
  onSubmit,
  t
}: {
  seat: SeatRow | null
  siteName: string
  viewerRole: SeatRole | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (role: InvitableRole) => void
  t: Translate
}): JSX.Element {
  const [role, setRole] = useState<InvitableRole>('editor')
  useEffect(() => {
    if (seat) setRole('editor')
  }, [seat])
  const roles = approveRolesFor(viewerRole)
  const email = seat?.email ?? ''
  return (
    <Dialog open={seat !== null} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites tracy-site-tabs tv-team-dialog">
        <DialogHeader>
          <DialogTitle>{t('dialog.approveTitle')}</DialogTitle>
        </DialogHeader>
        {seat && (
          <div className="tv-team-body">
            <div className="tv-team-card tv-team-person">
              <span className="tv-team-tile tv-team-tile-40" aria-hidden="true">
                <UserPlus />
              </span>
              <div className="tv-team-grow">
                <div className="tv-team-name">{shortNameOf(seat)}</div>
                <div className="tv-team-line tv-team-muted">
                  {email}
                  {seat.requestedAt !== null &&
                    ` · ${t('access.asked', { ago: agoOf(seat.requestedAt, Date.now(), agoUnitsOf(t)) })}`}
                </div>
              </div>
            </div>
            <DialogDescription className="tv-team-sentence">
              {t('dialog.approveBody', { email, site: siteName })}
            </DialogDescription>
            <RoleRows roles={roles} value={roles.includes(role) ? role : null} onChange={setRole} t={t} />
            <RolePermissions role={role} t={t} />
          </div>
        )}
        <DialogFooter className="tv-team-foot">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button size="sm" disabled={busy || !seat || !roles.includes(role)} onClick={() => onSubmit(role)}>
            {t('action.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Remove someone — "Decline request" for somebody who asked, "Cancel invitation" for a pending
 * invite, "Revoke access" for an active seat. Three acts, each stored and recorded as itself
 * (#792); its own confirm step, because the seat book does not undo this.
 *
 * The title, the consequence, the button and the `kind` handed to `onConfirm` all come from ONE
 * `removalOf(seat)`, read off the row the dialog was opened on — so what the dialog says is what
 * the write names, and the seat book refuses it if the row has moved on since.
 */
export function RevokeDialog({
  seat,
  busy,
  onOpenChange,
  onConfirm,
  t
}: {
  seat: SeatRow | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (kind: RemovalKind) => void
  t: Translate
}): JSX.Element {
  const removal = seat === null ? null : removalOf(seat)
  return (
    <Dialog open={seat !== null} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{removal ? t(removal.labelKey) : ''}</DialogTitle>
          {seat && removal && (
            <DialogDescription>{t(removal.consequenceKey, { name: nameOf(seat) })}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || removal === null}
            data-removal-kind={removal?.kind}
            onClick={() => {
              if (removal) onConfirm(removal.kind)
            }}
          >
            {removal ? t(removal.labelKey) : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
