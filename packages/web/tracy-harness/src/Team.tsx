/**
 * Who at Tracy can open this surface, and the two ways that list changes.
 *
 * NEITHER CHANGE IS A SINGLE CLICK, and that is the design rather than friction for its own sake.
 * Measured 04/09 (`workers/harness/test/forged-session.test.mjs`): one secret signs both the
 * session cookie and the actor assertion, so anybody holding `FLEET_ACTOR_SECRET` reaches this
 * screen as any address. Both flows therefore route through a mailbox that secret does not open —
 * an invitation the new member accepts themselves, and a code mailed to the remover.
 *
 * The screen holds NO rules. Ranks, the last owner, the code's lifetime — all of it is answered by
 * `seat-registry`, and refusals are shown verbatim. Disabled buttons here mirror those rules for
 * the reader's sake; they are not what enforces them.
 *
 * `/api/ops/team*`, NOT `/api/team` (Plan 4 Task 2). This screen used to live alone on
 * harness.tracy.ai, where `/api/team` named unambiguously. Now it is built into `tracy-web`,
 * mounted at `/ops`, on the SAME origin as `apps/tracy-web/src/seats/route.js`'s OWN `/api/team`
 * — a customer site's roster, an entirely different door. `apps/tracy-web/src/ops/route.js`
 * answers at `/api/ops/team*`; a leading `/` fetch ignores this build's `base: '/ops/'`
 * (vite.config.ts), so the path has to say so itself.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  Separator
} from '@tracy/ui'
import { Mail, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { ChoiceSelect } from './ChoiceSelect'
import { type T, tr, useT } from './i18n'

export type TeamRole = 'owner' | 'admin' | 'developer'

export type TeamMember = {
  id: string
  email: string | null
  role: TeamRole
  grantedAt: string | null
  acceptedAt: string | null
}

export type TeamPayload = {
  viewer: { email: string | null; role: TeamRole }
  members: TeamMember[]
}

/**
 * The seat book's refusals that have words (`team.refusal.<code>`), in words a person can act on.
 *
 * Unknown codes fall through to the code itself rather than a generic apology: an unfamiliar
 * string somebody can search for beats "something went wrong", which tells nobody anything.
 */
const REFUSALS = new Set([
  'LAST_OWNER',
  'OWNER_REMOVAL_NEEDS_OWNER',
  'ROLE_NOT_ALLOWED',
  'ALREADY_A_MEMBER',
  'REMOVAL_CODE_INVALID',
  'REMOVAL_CODE_EXHAUSTED',
  'MAIL_NOT_SENT',
  'INVALID_REQUEST',
  'CROSS_ORIGIN_REFUSED'
])

/**
 * Who may invite whom — at their own level or below, never above.
 *
 * A developer invites nobody. Reading every screen and changing who works at Tracy are different
 * rights, and the second one carries more than its name suggests: whoever may invite can mint a
 * second staff identity out of their own mailbox, one that outlives their own seat.
 *
 * Module scope, not inside the component: a fresh object every render is a dependency that changes
 * every render, and the day somebody puts it in a `useEffect` list the screen loops.
 *
 * This mirrors what `seat-registry` enforces. It is not the enforcement: a request that skips this
 * screen is refused there, and this exists so a button is never offered that would fail on click.
 */
const INVITABLE: Record<TeamRole, TeamRole[]> = {
  owner: ['owner', 'admin', 'developer'],
  admin: ['admin', 'developer'],
  developer: []
}

/** An address shape, not words. */
const EXAMPLE_EMAIL = 'name@example.com'

const say = (t: T, code: string | undefined) =>
  code ? (REFUSALS.has(code) ? t(`team.refusal.${code}`) : code) : t('team.refusal.none')

export function Team({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const t = useT()
  const doFetch = fetchImpl ?? fetch
  const [data, setData] = useState<TeamPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>('developer')

  // `removing` holds the row a code was asked for. `null` means no removal in flight — the code
  // box only exists while one is.
  const [removing, setRemoving] = useState<{ id: string; email: string | null } | null>(null)
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await doFetch('/api/ops/team', { headers: { accept: 'application/json' } })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(say(tr, body?.code))
      setData(body as TeamPayload)
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    }
  }, [doFetch])

  useEffect(() => {
    void load()
  }, [load])

  const owners = (data?.members ?? []).filter((m) => m.role === 'owner' && m.acceptedAt).length
  const viewerRole = data?.viewer.role ?? 'developer'
  const canInvite = INVITABLE[viewerRole] ?? []
  const canRemoveAnyone = viewerRole === 'owner' || viewerRole === 'admin'
  const canRemove = (m: TeamMember) =>
    canRemoveAnyone && !(m.role === 'owner' && (owners <= 1 || viewerRole !== 'owner'))
  const whyNot = (m: TeamMember) =>
    !canRemoveAnyone
      ? t('team.whyNot.notManager')
      : m.role !== 'owner'
        ? undefined
        : owners <= 1
          ? m.email === data?.viewer.email
            ? t('team.whyNot.lastOwnerSelf')
            : t('team.whyNot.lastOwner')
          : viewerRole !== 'owner'
            ? t('team.whyNot.ownerOnly')
            : undefined

  async function invite() {
    setBusy(true)
    try {
      const res = await doFetch('/api/ops/team', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role })
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(say(t, body?.code))
      // 202 means the row was written and the LETTER DID NOT GO. The seat book answers it rather
      // than 201 precisely because the two outcomes differ for the invitee: a pending row grants
      // nothing until the link in that mail is opened, and there is no other way in. Closing the
      // dialog on it would report success for somebody nobody can let in.
      await load()
      if (body?.notified === false) {
        setError(t('team.inviteNotMailed'))
        return
      }
      setAdding(false)
      setEmail('')
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function askCode(m: TeamMember) {
    setBusy(true)
    try {
      const res = await doFetch(`/api/ops/team/${m.id}/code`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(say(t, body?.code))
      setRemoving({ id: m.id, email: m.email })
      setSentTo(body?.to ?? null)
      setCode('')
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemoval() {
    if (!removing) return
    setBusy(true)
    try {
      const res = await doFetch(`/api/ops/team/${removing.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(say(t, body?.code))
      setRemoving(null)
      setError(null)
      await load()
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">{t('team.title')}</h1>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm">{t('team.lead')}</p>
        </div>
        {/* `data &&`: before the roster answers, `viewerRole` falls back to `developer`, which now
            carries an invite right. Offering the button on a guess would show it for a moment to a
            reader whose real level has not arrived yet. */}
        {data && canInvite.length > 0 ? (
          <Button
            size="sm"
            className="flex-none"
            onClick={() => {
              // Reset the role on every open. Keeping the last choice means the box reopens
              // carrying a level picked for SOMEBODY ELSE, and here a role is access, not a
              // preference.
              setRole(canInvite[canInvite.length - 1] ?? 'developer')
              setEmail('')
              setError(null)
              setAdding(true)
            }}
            disabled={busy}
          >
            <UserPlus /> {t('team.add.button')}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
        {(['owner', 'admin', 'developer'] as const).map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <Badge variant={r === 'owner' ? 'default' : 'secondary'} className="font-normal">
              {t(`team.role.${r}`)}
            </Badge>
            {t(`team.roleNote.${r}`)}
          </span>
        ))}
      </div>

      {error && !adding && !removing ? (
        <Card className="mt-4 border-destructive/40">
          <p className="px-4 py-3 text-sm">{error}</p>
        </Card>
      ) : null}

      {/* A DIALOG, not a panel spliced into the page. The mockup that was approved used one, and
          the reason shows up the moment a form opens inline: the roster below jumps down, and
          closing it jumps back. Both actions here are short, modal errands — say the address, or
          type the code — and the list underneath is the thing being acted on, so it should stay
          where the eye left it. */}
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (open) return
          setAdding(false)
          setError(null)
        }}
      >
        <DialogContent closeLabel={t('team.close')} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('team.add.title')}</DialogTitle>
            <DialogDescription>{t('team.add.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <Field>
              <FieldLabel htmlFor="team-email">{t('team.add.email')}</FieldLabel>
              <Input
                id="team-email"
                value={email}
                placeholder={EXAMPLE_EMAIL}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="team-role">{t('team.add.role')}</FieldLabel>
              <ChoiceSelect
                id="team-role"
                value={role}
                onValueChange={(v) => setRole(v as TeamRole)}
                // Only what this reader may actually grant: a level the seat book refuses is a button that fails after the click.
                choices={canInvite.map((r) => ({
                  value: r,
                  label: t(`team.role.${r}`),
                  option: t('team.roleOption', { role: t(`team.role.${r}`), note: t(`team.roleNote.${r}`) })
                }))}
              />
            </Field>
          </div>
          {/* The refusal belongs INSIDE the dialog. The first version only fed the card up on
              the page, which the open dialog covers — so a rejected address looked like nothing
              happened at all. */}
          {error && adding ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAdding(false)
                setError(null)
              }}
              disabled={busy}
            >
              {t('team.cancel')}
            </Button>
            <Button onClick={() => void invite()} disabled={busy || email === ''}>
              {t('team.add.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog, not Dialog: this one destroys something, and the approved mockup used the
          alert variant for that reason. It also names WHO and says WHEN — "are you sure?" alone
          leaves the reader guessing at the timing, and the timing is the surprising part. */}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (open) return
          setRemoving(null)
          setError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              {t('team.remove.title', { email: removing?.email ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.remove.description', { to: sentTo ?? t('team.remove.you') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="team-code">{t('team.remove.code')}</FieldLabel>
            <Input
              id="team-code"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          {/* Same reason, and it weighs more here: a mistyped code is the COMMONEST outcome of
              this box, so "that code is wrong" has to sit beside the field just typed into. */}
          {error && removing ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('team.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // The alert's action closes the dialog by default. A wrong code has to leave it
                // open, or the reader loses the box the moment they need it most.
                e.preventDefault()
                void confirmRemoval()
              }}
              disabled={busy || code === ''}
            >
              {t('team.remove.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {data === null ? null : data.members.length === 0 ? (
        <Card className="mt-6 border-dashed">
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-sm">{t('team.empty')}</p>
          </div>
        </Card>
      ) : (
        <Card className="mt-6 gap-0 overflow-hidden py-0">
          <div className="flex items-center gap-2 px-4 py-3 [&_svg]:size-4 [&_svg]:text-muted-foreground">
            <Users />
            <h3 className="font-medium text-sm">{t('team.members')}</h3>
            <span className="text-muted-foreground text-xs tabular-nums">{data.members.length}</span>
            <span className="ms-auto text-muted-foreground text-xs">{t('team.newestLast')}</span>
          </div>
          <Separator />
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-mono text-sm">{m.email}</span>
                  {m.email === data.viewer.email ? (
                    <span className="flex-none text-muted-foreground text-xs">{t('team.you')}</span>
                  ) : null}
                  {/* An invitation is not a seat. Saying so on the row is the difference between
                      "they can read this" and "they have been asked". */}
                  {m.acceptedAt ? null : (
                    <Badge variant="outline" className="flex-none font-normal">
                      {t('team.invited')}
                    </Badge>
                  )}
                </span>
                <span className="ms-auto grid flex-none grid-cols-[4.75rem_4.5rem] items-center gap-3">
                  <Badge
                    variant={m.role === 'owner' ? 'default' : 'secondary'}
                    className={cn('w-full justify-center font-normal')}
                  >
                    {t(`team.role.${m.role}`)}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="justify-self-end"
                    disabled={!canRemove(m) || busy}
                    title={whyNot(m)}
                    onClick={() => void askCode(m)}
                  >
                    {t('team.removeButton')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
