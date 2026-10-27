/**
 * The Team tab: one site's book — every seat, its role and status, and the three things an Owner
 * does to a row (change role, revoke, re-invite / approve). Moved out from under the My
 * Sites row on 04/09: a tab of its own, opened from the row's people cluster, from the `+` menu,
 * or from the link in the "somebody asked to join" mail.
 *
 * Invite is offered to every ACCEPTED Owner or Editor seat; a Viewer invites nobody (ADR 0028).
 * Which roles the wizard then offers is `inviteRolesFor`'s answer, not this file's.
 */
import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button, useTabLoading } from '@tracy/ui'

import { editAccessErrorKey, teamWriteErrorKey } from '../team/refusals'
import {
  acceptedInviteRole,
  approveRequestInit,
  type EditDecision,
  editAccessAnswer,
  type InvitableRole,
  type RemovalKind,
  type SeatRole,
  type SeatRow,
  type TeamSite
} from '../team/roster'
import { TEAM_CHANGED_EVENT } from '../team/face'
import { ApproveDialog, ChangeRoleDialog, RevokeDialog, Roster } from '../team/team'
import type { Translate } from '../team/translate'
import { type InvitableSite, InviteWizard, type WizardPreset } from '../team/wizard'
import { shortNameOf } from '../team/wizard-plan'
import { type PickableSite, TabHeader } from './pieces'

/**
 * The page under the tab header: the Publish page shell without its stepper (24/10/2026). A
 * full-width column, the panel's own gutters (16, 24 from 600px, 32 from
 * 900px; `tv-page` in site-tabs-rules.css), and the Publish title and lead (`tas-wizard-*`).
 */
function TeamPage({
  title,
  lead = null,
  children
}: {
  title: string
  lead?: string | null
  children: ReactNode
}): JSX.Element {
  return (
    <div className="tv-page" data-team-page="">
      <div className="tas-wizard-head">
        <h2 className="tas-wizard-title">{title}</h2>
        {lead !== null && <p className="tas-wizard-desc">{lead}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

type Load =
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'failed' }
  | { state: 'ready'; site: TeamSite; all: TeamSite[] }

export function TeamView({
  siteKey,
  role,
  sites,
  onPick,
  highlight = null,
  inviteOnOpen = false,
  t
}: {
  siteKey: string
  role: string | null
  sites: PickableSite[]
  onPick: (siteKey: string) => void
  /** The address a link pointed at: that row is marked and scrolled into view once. */
  highlight?: string | null
  /** Open the invite wizard as soon as the book is up — My Sites' "Invite member" lands here. */
  inviteOnOpen?: boolean
  t: Translate
}): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [viewerEmail, setViewerEmail] = useState<string | null>(null)
  const [wizard, setWizard] = useState<{ open: boolean; preset?: WizardPreset; key: number }>({
    open: inviteOnOpen,
    preset: inviteOnOpen ? { emails: [], siteKeys: [siteKey] } : undefined,
    key: 0
  })
  const [changing, setChanging] = useState<SeatRow | null>(null)
  /** The join request whose Approve was pressed: its role pick is open. */
  const [approving, setApproving] = useState<SeatRow | null>(null)
  const [removing, setRemoving] = useState<SeatRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // False once the tab is gone: an answer that arrives afterwards is nobody's to act on, and must
  // not start another read of a book no one is looking at.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const read = useCallback(
    async (silent = false) => {
      if (!alive.current) return
      if (!silent) setLoad({ state: 'loading' })
      try {
        const res = await fetch('/api/team', { headers: { accept: 'application/json' } })
        if (!alive.current) return
        if (res.status === 401) {
          setLoad({ state: 'signedOut' })
          return
        }
        if (!res.ok) {
          setLoad({ state: 'failed' })
          return
        }
        const body = (await res.json()) as { sites?: TeamSite[] }
        if (!alive.current) return
        const all = Array.isArray(body.sites) ? body.sites : []
        const site = all.find((s) => s.siteKey === siteKey)
        setLoad(site ? { state: 'ready', site, all } : { state: 'failed' })
      } catch {
        if (alive.current) setLoad({ state: 'failed' })
      }
    },
    [siteKey]
  )
  useEffect(() => {
    void read()
  }, [read])
  // Someone else changed this site's book while the tab is open: the Inbox saw the approval or role
  // change the server wrote for this person, or another tab wrote a seat (#1036). Read it again
  // quietly, so the actions follow the viewer's new role (an Editor made Owner gets the role menus, an
  // Owner made Editor loses them) without a reload. This tab's own writes already read it again.
  useEffect(() => {
    const onChanged = (event: Event): void => {
      if (writing.current) return
      const changed = (event as CustomEvent<{ siteKey?: unknown } | null>).detail?.siteKey
      if (changed === undefined || changed === siteKey) void read(true)
    }
    window.addEventListener(TEAM_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(TEAM_CHANGED_EVENT, onChanged)
  }, [read, siteKey])
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/auth/me', { headers: { accept: 'application/json' } })
        const body = (await res.json()) as { email?: string | null }
        setViewerEmail(body.email ?? null)
      } catch {
        setViewerEmail(null)
      }
    })()
  }, [])

  /** The seat book's refusal, in the reader's words; `error.failed` for anything unnamed. */
  const explain = (status: number, code: string | undefined): string => {
    if (status === 429 || code === 'RATE_LIMITED') return t('error.rateLimited')
    if (code === 'NOT_SITE_OWNER') return t('error.notSiteOwner')
    if (code === 'CANNOT_REVOKE_LAST_OWNER') return t('error.lastOwner')
    if (code === 'CANNOT_REVOKE_SELF') return t('error.self')
    // The row is no longer in the state the press was about (an invitation accepted while its
    // dialog said "Cancel invitation"): nothing was done, and the refreshed list shows it as it is.
    if (code === 'SEAT_STATE_CHANGED') return t('error.changed')
    if (code === 'GRANT_UNKNOWN' || status === 404) return t('error.gone')
    return t('error.failed')
  }
  /**
   * The refusal of a write on ONE seat (`PATCH|DELETE /api/sites/:key/seats/:grant`), read by the
   * exact status and code that door sends (#796). Approve goes to another door and keeps `explain`.
   */
  const explainSeatWrite = (status: number, code: string | undefined): string =>
    t(teamWriteErrorKey(status, code))

  /**
   * Tell the page this site's book changed, after a write the seat book accepted: the Team start
   * card (`@tracy/dsh-chat-input`) counts the same book and reads it again. Sent even when the tab
   * is closing — the write happened either way. An invitation is not sent from here: the wizard
   * tells every site it wrote (`writtenSites`), since one send can write several sites.
   */
  const teamChanged = (): void => {
    // The window's own `CustomEvent`: an event made in another realm is refused by its `dispatchEvent`.
    window.dispatchEvent(new window.CustomEvent(TEAM_CHANGED_EVENT, { detail: { siteKey } }))
  }

  // One write at a time. `busy` disables the buttons on the next render; two presses inside one
  // tick both run before that render, and the second would be a second request for the same act.
  const writing = useRef(false)
  const write = async (path: string, init: RequestInit, say: typeof explain = explain): Promise<void> => {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(path, { credentials: 'same-origin', ...init })
      if (res.ok) teamChanged()
      else {
        let code: unknown
        try {
          code = ((await res.json()) as { code?: unknown } | null)?.code
        } catch {
          code = undefined
        }
        // Only text is a code: a refusal whose `code` is anything else is an unnamed one.
        if (alive.current) setError(say(res.status, typeof code === 'string' ? code : undefined))
      }
    } catch {
      if (alive.current) setError(t('error.failed'))
    } finally {
      writing.current = false
      if (alive.current) {
        setBusy(false)
        void read(true)
      }
    }
  }

  const grantPath = (seat: SeatRow): string =>
    `/api/sites/${encodeURIComponent(siteKey)}/seats/${encodeURIComponent(seat.id)}`

  const setRole = async (seat: SeatRow, nextRole: SeatRole): Promise<void> => {
    setChanging(null)
    await write(
      grantPath(seat),
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ role: nextRole })
      },
      explainSeatWrite
    )
  }
  /**
   * Take a row off the book as ONE named act (#792): `kind` is the dialog's own, the same entry its
   * title and consequence were read from. The seat book refuses a kind the row no longer calls for.
   */
  const remove = async (seat: SeatRow, kind: RemovalKind): Promise<void> => {
    setRemoving(null)
    await write(
      grantPath(seat),
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ kind })
      },
      explainSeatWrite
    )
  }
  /**
   * Approve a join request: a role pick, then ONE call, and the seat is accepted at once (Akemi
   * 04/10/2026). It used to open the invite wizard ("Seats are granted when they accept"), which
   * read as an invitation the requester still had to accept. Re-inviting keeps the wizard.
   */
  const approve = async (seat: SeatRow, role: InvitableRole): Promise<void> => {
    setApproving(null)
    if (seat.email === null) return
    await write('/api/team/invite', approveRequestInit({ siteKey, email: seat.email, role }))
  }
  /**
   * An Owner answers a Viewer's request for edit access (ADR 0028 §6): approve makes them an
   * Editor, decline clears the request. The book is read again after either, like every write.
   */
  const answerEdit = async (seat: SeatRow, decision: EditDecision): Promise<void> => {
    const call = editAccessAnswer({ siteKey, seatId: seat.id, decision })
    await write(call.path, call.init, (status, code) => t(editAccessErrorKey(status, code)))
  }
  /** Re-inviting is "invite this address here" — the wizard, at Role. */
  const inviteAgain = (seat: SeatRow): void => {
    if (seat.email === null) return
    setWizard((w) => ({
      open: true,
      preset: { emails: [seat.email as string], siteKeys: [siteKey] },
      key: w.key + 1
    }))
  }

  /**
   * The viewer's accepted role on THIS site, or null until the book just read establishes it. A
   * book that is loading, failed, pending or without a role offers no invitation — the door would
   * refuse it.
   */
  const myRole = load.state === 'ready' ? acceptedInviteRole(load.site) : null
  const invites = myRole !== null
  /**
   * Every site the viewer may invite on — the wizard's Sites step lists them all, not just this
   * one. Each site's role comes from the SAME `GET /api/team` answer as this one's: the
   * accepted-sites list the tab was opened with (`sites`) may be older, and a seat lowered or
   * revoked elsewhere since would offer a role, or a site, the door refuses. That list only
   * lends the name a site is shown by.
   */
  const invitable: InvitableSite[] =
    invites && load.state === 'ready'
      ? load.all.flatMap((s) => {
          const inviteRole = acceptedInviteRole(s)
          if (inviteRole === null) return []
          const displayName = sites.find((known) => known.siteKey === s.siteKey)?.displayName
          return [
            {
              siteKey: s.siteKey,
              ...(displayName !== undefined ? { displayName } : {}),
              // The CMS logo on the wizard's Sites rows: the book's own field, never a guess.
              platform: s.platform,
              myRole: inviteRole
            }
          ]
        })
      : []

  const header = (
    <TabHeader
      siteKey={siteKey}
      role={role}
      sites={sites}
      onPick={onPick}
      action={
        invites ? (
          <Button
            type="button"
            size="sm"
            title={t('action.invite')}
            onClick={() =>
              setWizard((w) => ({ open: true, preset: { emails: [], siteKeys: [siteKey] }, key: w.key + 1 }))
            }
          >
            <UserPlus aria-hidden="true" />
            {/* Icon only in a narrow panel (< 560px; the header box is the panel minus its px-3),
                still named for screen readers. */}
            <span className="@max-[536px]:sr-only!">{t('action.invite')}</span>
          </Button>
        ) : undefined
      }
      t={t}
    />
  )

  // The tab's shared loading bar runs meanwhile; under the header, nothing (Akemi, 30/09).
  useTabLoading(load.state === 'loading')
  if (load.state === 'loading') return header
  if (load.state === 'signedOut')
    return (
      <>
        {header}
        <TeamPage title={t('tab.team')}>
          <p className="m-0 text-muted-foreground text-sm">{t('state.signedOut')}</p>
        </TeamPage>
      </>
    )
  if (load.state === 'failed')
    return (
      <>
        {header}
        <TeamPage title={t('tab.team')}>
          <div className="text-muted-foreground text-sm">
            <p className="m-0">{t('team.failed')}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void read()}>
              {t('action.retry')}
            </Button>
          </div>
        </TeamPage>
      </>
    )

  const { site } = load
  return (
    <>
      {header}
      {/* The three roles in one sentence, the same for every reader (ADR 0028): the page's lead line,
          as Publish has one under its title. It used to sit under the table (Akemi, 29/09), never
          in the header bar, and it still is not there. */}
      <TeamPage title={t('tab.team')} lead={site.seats !== null ? t('team.rolesHint') : null}>
        {error !== null && (
          <p className="m-0 mb-3 text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
        {site.seats === null ? (
          <p className="m-0 text-muted-foreground text-sm">{t('team.failed')}</p>
        ) : (
          <Roster
            site={site}
            viewer={{ email: viewerEmail, role: site.myRole }}
            busy={busy}
            highlight={highlight}
            onChangeRole={setChanging}
            onRemove={setRemoving}
            onReinvite={inviteAgain}
            onApprove={setApproving}
            onAnswerEdit={(seat, decision) => {
              void answerEdit(seat, decision)
            }}
            t={t}
          />
        )}
      </TeamPage>
      {wizard.open && invites && (
        <InviteWizard
          key={wizard.key}
          open
          onOpenChange={(o) => {
            if (!o) setWizard((w) => ({ open: false, key: w.key }))
          }}
          sites={invitable}
          preset={wizard.preset}
          inviter={viewerEmail ? shortNameOf({ email: viewerEmail }) : ''}
          // The wizard tells the page itself, once per site the send wrote (this one or others).
          onSent={() => {
            void read(true)
          }}
          t={t}
        />
      )}
      <ApproveDialog
        seat={approving}
        siteName={siteKey}
        viewerRole={site.myRole}
        busy={busy}
        onOpenChange={(o) => {
          if (!o) setApproving(null)
        }}
        onSubmit={(role) => {
          if (approving) void approve(approving, role)
        }}
        t={t}
      />
      <ChangeRoleDialog
        seat={changing}
        viewerRole={site.myRole}
        ownerCount={(site.seats ?? []).filter((s) => s.role === 'owner' && s.status === 'active').length}
        busy={busy}
        onOpenChange={(o) => {
          if (!o) setChanging(null)
        }}
        onSubmit={(next) => {
          if (changing) void setRole(changing, next)
        }}
        t={t}
      />
      <RevokeDialog
        seat={removing}
        busy={busy}
        onOpenChange={(o) => {
          if (!o) setRemoving(null)
        }}
        onConfirm={(kind) => {
          if (removing) void remove(removing, kind)
        }}
        t={t}
      />
    </>
  )
}
