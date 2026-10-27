/**
 * THROWAWAY MOCK — the team folded into My Sites. Not shipped code.
 *
 * THE QUESTION IT EXISTED TO ANSWER, now answered (Lee, 04/09): where does "who is on my sites,
 * and how do I invite someone" live? Not in a tab of its own. It lives in MY SITES, on three
 * columns — Site · Team · Agent — and the roster opens under the row. Everything drawn here is
 * that one design; the alternatives (a people-first tab, a site-first tab, a roster in a sheet)
 * were drawn, reviewed, and removed the same day.
 *
 * WHAT IS HERE:
 *   1. My Sites on three columns, open and closed.
 *   2. The invite wizard — Who → Where (one site · every site you run · a chosen set) → Role →
 *      Review → Sent. Who takes SEVERAL addresses, and every later step applies to all of them:
 *      one set of sites, one role, no per-person branching (Lee, 04/09 — simpler system). The
 *      same wizard, entered at "Where" with one address fixed, sets one role for an existing
 *      member on every site at once. Owners and Editors invite Viewers and Editors; Owners are made
 *      from the Team list, never by invitation (ADR 0028).
 *   3. The invitation mail: what `inviteMail()` produces TODAY (imported, byte for byte), and
 *      the mail the batch door should send — ONE mail per person for N sites, the role named,
 *      one line per site, an Accept button and the bare link, no desktop download.
 *   4. What the link does. THE LINK IS THE ACCEPTANCE: nothing is granted until it is clicked.
 *      One link for everyone — the invite already called `ensureSupabaseUser()`, so "no account"
 *      is not a state the system has; what differs is whether THIS browser holds a session, and
 *      only the Worker knows that at click time. `/invite/<token>` branches there: a session for
 *      the invited address → accept → landing; none → today's OTP door (`loginPage()`, imported)
 *      with the address fixed → accept → landing. The link does not expire; it dies only when an
 *      Owner cancels the invitation.
 *
 * WHAT IS NOT BEING ASKED HERE: the words. Roles (`Owner · Editor · Viewer`, ADR 0028), statuses
 * (`Active · Invited · Asked to join · Declined · Revoked`) and the sentences in the wizard are
 * lifted from `tracy-desk` (`tracySites.config.team.*`) — two surfaces of one product do not get
 * two names for one thing. "Owner is granted by promotion, not by invitation" is ADR 0036.
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The real tab is `tracy-my-sites`, MODE B,
 * plain CSS with `tv-` prefixes, and the list must be REWRITTEN on the shape that plugin already
 * uses (`ul` + `divide-y`, no cards). The mail and the landing page are Worker HTML (mode C,
 * `worker-tokens.md`). The rewrite is what gets reviewed. `DESIGN.md` §0.
 *
 * ⚠ DELETE WHEN DONE.
 */
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PlatformGlyph,
  RadioGroup,
  RadioGroupItem,
  Separator,
  type Platform
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Check, CircleAlert, Pencil, RotateCcw, Trash2, UserPlus, Users, X } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'

// The real mail and the real sign-in door. Both are plain ESM with no fetch at import time, so
// the bench can call them the way `WorkerAuthPages.stories.tsx` calls the Worker's page
// functions: what shows here is what Resend receives and what the browser gets, byte for byte.
import { loginPage } from '../../../../../apps/tracy-web/src/identity/pages.js'
import { inviteMail } from '../../../../../apps/tracy-web/src/mail/emails.js'

const meta: Meta = {
  title: 'Mockups/My Team',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

// ── Fixtures — the shape `GET /sites/:key/seats` returns, flattened across the viewer's sites ──

type Role = 'owner' | 'editor' | 'viewer'
type InvitableRole = Exclude<Role, 'owner'>
type Status = 'active' | 'invited' | 'requested' | 'declined' | 'revoked'

const ME = 'patowner@example.com'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer'
}

/** One sentence per role, as the real role rows say it (ADR 0028). */
const ROLE_HINT: Record<Role, string> = {
  editor: 'Changes the site with Tracy: pages, design, settings',
  viewer: 'Sees the site and its changes, and can comment',
  owner: 'Also manages people, the domain and the site itself'
}

const STATUS_LABEL: Record<Status, string> = {
  active: 'Active',
  invited: 'Invited',
  requested: 'Asked to join',
  declined: 'Declined',
  revoked: 'Revoked'
}

/** What a role may do (ADR 0028), and who is refused. */
const PERMISSIONS: { label: string; from: Role }[] = [
  { label: 'Change the site with Tracy: pages, design, code, settings', from: 'editor' },
  { label: 'Publish and restore backups', from: 'editor' },
  { label: 'Invite Viewers and Editors', from: 'editor' },
  { label: 'Change roles or remove people', from: 'owner' },
  { label: 'Connect a custom domain', from: 'owner' },
  { label: 'Make someone an owner', from: 'owner' },
  { label: 'Delete the site', from: 'owner' }
]
const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 }

/** Sites the viewer may invite on — Owner or Editor. The wizard offers only these. */
interface MySite {
  key: string
  platform: Platform
  myRole: 'owner' | 'editor'
}
const mySites: MySite[] = [
  { key: 'beta.tracy.ai', platform: 'wordpress', myRole: 'owner' },
  { key: 'gymshark.com', platform: 'shopify', myRole: 'owner' },
  { key: 'joomlart.com', platform: 'joomla', myRole: 'owner' },
  { key: 'tracy.ai', platform: 'wordpress', myRole: 'owner' },
  { key: 'juneflower.tracy.ai', platform: 'wordpress', myRole: 'owner' },
  { key: 'demo-tracy.myshopify.com', platform: 'shopify', myRole: 'editor' },
  { key: 'tracy-demo-001.myshopify.com', platform: 'shopify', myRole: 'editor' },
  { key: 'fijitrips.example', platform: 'wordpress', myRole: 'owner' }
]
const ALL_KEYS = mySites.map((s) => s.key)

/** One row of a site's book. */
interface Grant {
  email: string
  name?: string
  site: string
  role: Role
  status: Status
  /** `tracySites.config.team.granted_by` and friends, already rendered. */
  access: string
}
const grants: Grant[] = [
  {
    email: 'alexshop@example.com',
    site: 'tracy.ai',
    role: 'editor',
    status: 'active',
    access: 'Granted 2 days ago by you'
  },
  {
    email: 'alexshop@example.com',
    site: 'joomlart.com',
    role: 'editor',
    status: 'active',
    access: 'Granted 2 days ago by you'
  },
  {
    email: 'alexshop@example.com',
    site: 'beta.tracy.ai',
    role: 'viewer',
    status: 'active',
    access: 'Granted 12 days ago by you'
  },
  {
    email: 'victorl@example.com',
    name: 'Vincent',
    site: 'joomlart.com',
    role: 'viewer',
    status: 'active',
    access: 'Granted 5 days ago by alexshop@example.com'
  },
  {
    email: 'victorl@example.com',
    name: 'Vincent',
    site: 'gymshark.com',
    role: 'viewer',
    status: 'invited',
    access: 'Invited yesterday by you'
  },
  {
    email: 'victorl@example.com',
    name: 'Vincent',
    site: 'tracy.ai',
    role: 'viewer',
    status: 'revoked',
    access: 'Revoked 5 days ago'
  },
  {
    email: 'maibuilds@example.com',
    name: 'Mai',
    site: 'tracy.ai',
    role: 'editor',
    status: 'invited',
    access: 'Invited yesterday by you'
  },
  {
    email: 'maibuilds@example.com',
    name: 'Mai',
    site: 'juneflower.tracy.ai',
    role: 'editor',
    status: 'active',
    access: 'Granted 3 weeks ago by you'
  },
  {
    email: 'jordanjoiner@example.com',
    site: 'fijitrips.example',
    role: 'editor',
    status: 'requested',
    access: 'Asked 3 hours ago'
  },
  {
    email: 'hanaops@example.com',
    name: 'Hana',
    site: 'demo-tracy.myshopify.com',
    role: 'editor',
    status: 'declined',
    access: 'Declined 4 days ago'
  }
]

function nameOf(p: { name?: string; email: string }) {
  return p.name ?? p.email
}
function initials(p: { name?: string; email: string }) {
  return (p.name ?? p.email).slice(0, 2).toUpperCase()
}

// ── Frame — the tab's surface, at the width the screenshot shows ─────────────────────────────

function Frame({ note, children }: { note?: string; children: ReactNode }) {
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl p-6">
        {note ? <p className="mb-4 text-muted-foreground text-xs">{note}</p> : null}
        {children}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'requested') return <Badge>{STATUS_LABEL.requested}</Badge>
  if (status === 'active') return null
  return (
    <Badge variant="outline" className={cn(status !== 'invited' && 'text-muted-foreground')}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={role === 'owner' ? 'default' : 'outline'}>{ROLE_LABEL[role]}</Badge>
}

/** The small per-row icons, `tracy-desk`'s SeatTable: shown on hover, Approve always. */
function RowActions({ grant }: { grant: Grant }) {
  const removeLabel =
    grant.status === 'requested'
      ? 'Decline request'
      : grant.status === 'invited'
        ? 'Cancel invitation'
        : 'Revoke access'
  const gone = grant.status === 'revoked' || grant.status === 'declined'
  const reveal = 'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100'
  return (
    <span className="flex items-center justify-end gap-0.5">
      {grant.status === 'requested' ? (
        <Button variant="outline" size="sm">
          Approve
        </Button>
      ) : null}
      {gone ? (
        <Button variant="ghost" size="sm" className={cn('px-2', reveal)} title="Re-invite">
          <RotateCcw className="size-3.5" />
        </Button>
      ) : null}
      {!gone && grant.role !== 'owner' ? (
        <Button variant="ghost" size="sm" className={cn('px-2', reveal)} title="Change role">
          <Pencil className="size-3.5" />
        </Button>
      ) : null}
      {!gone && grant.role !== 'owner' ? (
        <Button
          variant="ghost"
          size="sm"
          className={cn('px-2 text-destructive hover:text-destructive', reveal)}
          title={removeLabel}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </span>
  )
}

// ── The invite / set-role wizard ─────────────────────────────────────────────────────────────

type Step = 'who' | 'where' | 'role' | 'review' | 'sent'
type Scope = 'all' | 'pick'
const STEPS: { id: Step; label: string }[] = [
  { id: 'who', label: 'Who' },
  { id: 'where', label: 'Where' },
  { id: 'role', label: 'Role' },
  { id: 'review', label: 'Review' }
]

interface WizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** An existing member: the address is fixed and the wizard opens at "Where". */
  presetEmail?: string
  /** A story entering past "Who" still needs addresses to review. */
  initialEmails?: string[]
  initialStep?: Step
  initialScope?: Scope
  initialPicked?: string[]
  initialRole?: InvitableRole
}

function Stepper({ at }: { at: Step }) {
  const idx = STEPS.findIndex((s) => s.id === at)
  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0 text-xs">
      {STEPS.map((s, i) => {
        const done = at === 'sent' || i < idx
        const here = s.id === at
        return (
          <Fragment key={s.id}>
            {i > 0 ? <span className="h-px w-5 bg-border" /> : null}
            <li
              className={cn('flex items-center gap-1.5', here ? 'text-foreground' : 'text-muted-foreground')}
            >
              <span
                className={cn(
                  'grid size-5 place-content-center rounded-full border text-[10px]',
                  here && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-primary text-primary'
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              {s.label}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

function RoleOption({ role, current }: { role: InvitableRole; current: Role }) {
  const id = `role-${role}`
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
        current === role ? 'border-primary bg-primary/5' : 'border-border'
      )}
    >
      <RadioGroupItem id={id} value={role} className="mt-0.5" />
      <span className="grid gap-0.5">
        <span className="font-medium text-sm">{ROLE_LABEL[role]}</span>
        <span className="text-muted-foreground text-xs">{ROLE_HINT[role]}</span>
      </span>
    </label>
  )
}

/** `RolePermissionList` from tracy-desk: the legend re-renders for the checked radio. */
function PermissionLegend({ role }: { role: Role }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="m-0 mb-2 font-medium text-xs">What {ROLE_LABEL[role]} can do</p>
      <ul className="m-0 grid list-none gap-1 p-0 text-xs">
        {PERMISSIONS.map((p) => {
          const ok = RANK[role] >= RANK[p.from]
          return (
            <li key={p.label} className={cn('flex items-center gap-2', !ok && 'text-muted-foreground/70')}>
              {ok ? <Check className="size-3.5 text-primary" /> : <X className="size-3.5" />}
              {p.label}
            </li>
          )
        })}
      </ul>
      <p className="m-0 mt-2 text-[11px] text-muted-foreground/70">
        Owner is granted by promotion, not by invitation.
      </p>
    </div>
  )
}

function InviteWizard({
  open,
  onOpenChange,
  presetEmail,
  initialEmails,
  initialStep,
  initialScope = 'all',
  initialPicked = [],
  initialRole = 'editor'
}: WizardProps) {
  const [step, setStep] = useState<Step>(initialStep ?? (presetEmail ? 'where' : 'who'))
  // Several addresses at once (Lee, 04/09) — and ONE set of answers for all of them. Where and
  // Role are chosen once; nothing here lets two people get two different settings in one run.
  const [emails, setEmails] = useState<string[]>(presetEmail ? [presetEmail] : (initialEmails ?? []))
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState<Scope>(initialScope)
  const [picked, setPicked] = useState<string[]>(initialPicked)
  const [role, setRole] = useState<InvitableRole>(initialRole)

  /** Turn whatever is typed or pasted into chips; what does not look like an address stays in the box. */
  const commit = () => {
    const parts = draft
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
    const good = parts.filter((x) => EMAIL.test(x) && !emails.includes(x))
    if (good.length > 0) setEmails((e) => [...e, ...good])
    setDraft(parts.filter((x) => !EMAIL.test(x)).join(' '))
  }

  const targets = scope === 'all' ? mySites : mySites.filter((s) => picked.includes(s.key))
  const rerole = presetEmail !== undefined
  const email = emails[0] ?? ''
  const existing = (site: string) => grants.find((g) => g.email === email && g.site === site)

  const back = () => setStep(step === 'where' && !rerole ? 'who' : step === 'role' ? 'where' : 'role')
  const next = () => setStep(step === 'who' ? 'where' : step === 'where' ? 'role' : 'review')
  const canNext = step === 'who' ? emails.length > 0 : step === 'where' ? targets.length > 0 : true

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="Close" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rerole ? `Set one role for ${email}` : 'Invite member'}</DialogTitle>
          <DialogDescription>
            {rerole
              ? 'The same role on every site you choose. Sites you leave out keep their role.'
              : 'Everyone you add gets a seat on the same sites, at the same role, once they accept. Owner is never invited.'}
          </DialogDescription>
        </DialogHeader>
        <Stepper at={step} />

        {step === 'who' ? (
          <div className="grid gap-2">
            <Label htmlFor="wiz-email">Emails</Label>
            {emails.length > 0 ? (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {emails.map((e) => (
                  <li key={e}>
                    <Badge variant="secondary" className="gap-1 pr-1">
                      {e}
                      <button
                        type="button"
                        className="rounded-sm p-0.5 hover:bg-foreground/10"
                        aria-label={`Remove ${e}`}
                        onClick={() => setEmails((all) => all.filter((x) => x !== e))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <Input
              id="wiz-email"
              type="text"
              autoFocus
              placeholder={emails.length === 0 ? 'name@example.com, another@example.com' : 'Add another…'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                  e.preventDefault()
                  commit()
                }
              }}
            />
            <p className="m-0 text-muted-foreground text-xs">
              Paste a list or type one at a time. Everyone here gets the same sites and the same role — you
              choose them once, in the next two steps.
            </p>
          </div>
        ) : null}

        {step === 'where' ? (
          <div className="grid gap-3">
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="grid gap-2">
              <label className="flex items-center gap-3 text-sm">
                <RadioGroupItem value="all" />
                <span>
                  All sites <span className="text-muted-foreground">({mySites.length})</span>
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <RadioGroupItem value="pick" />
                Only select sites
              </label>
            </RadioGroup>
            <ul
              className={cn(
                'm-0 grid max-h-64 list-none gap-0 overflow-auto rounded-lg border p-0',
                scope === 'all' && 'pointer-events-none opacity-50'
              )}
            >
              {mySites.map((s, i) => {
                const on = scope === 'all' || picked.includes(s.key)
                const had = emails.length === 1 ? existing(s.key) : undefined
                return (
                  <li key={s.key}>
                    {i > 0 ? <Separator /> : null}
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(c) =>
                          setPicked((p) => (c ? [...p, s.key] : p.filter((k) => k !== s.key)))
                        }
                      />
                      <PlatformGlyph platform={s.platform} className="size-5 text-[9px]" />
                      <span className="min-w-0 flex-1 truncate">{s.key}</span>
                      <span className="shrink-0 text-muted-foreground text-xs">
                        you are {ROLE_LABEL[s.myRole]}
                      </span>
                      {had && had.status !== 'revoked' && had.status !== 'declined' ? (
                        <Badge variant="outline" className="shrink-0">
                          {ROLE_LABEL[had.role]}
                        </Badge>
                      ) : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {step === 'role' ? (
          <div className="grid gap-3">
            <RadioGroup
              value={role}
              onValueChange={(v) => setRole(v as InvitableRole)}
              className="grid gap-2"
            >
              <RoleOption role="editor" current={role} />
              <RoleOption role="viewer" current={role} />
            </RadioGroup>
            <PermissionLegend role={role} />
          </div>
        ) : null}

        {step === 'review' || step === 'sent' ? (
          <div className="grid gap-3">
            <div className="flex items-start gap-3 text-sm">
              <ul className="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
                {emails.map((e) => (
                  <li key={e} className="flex items-center gap-1.5">
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[8px]">{e.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{e}</span>
                  </li>
                ))}
              </ul>
              <RoleBadge role={role} />
            </div>
            <ul className="m-0 grid max-h-64 list-none overflow-auto rounded-lg border p-0 text-sm">
              {targets.map((s, i) => {
                // A "today" column only makes sense for one person; several people, several answers.
                const had = emails.length === 1 ? existing(s.key) : undefined
                const same = had && had.status === 'active' && had.role === role
                const outcome =
                  step !== 'sent'
                    ? null
                    : same
                      ? { text: 'Already has this role', muted: true }
                      : s.key === 'gymshark.com' && !rerole
                        ? { text: 'Refused, nothing changed', bad: true }
                        : { text: rerole ? 'Role updated' : 'Invited, waiting for them to accept' }
                return (
                  <li key={s.key}>
                    {i > 0 ? <Separator /> : null}
                    <div className="flex items-center gap-3 px-3 py-2">
                      <PlatformGlyph platform={s.platform} className="size-5 text-[9px]" />
                      <span className="min-w-0 flex-1 truncate">{s.key}</span>
                      {outcome ? (
                        <span
                          className={cn(
                            'flex shrink-0 items-center gap-1 text-xs',
                            outcome.muted && 'text-muted-foreground',
                            outcome.bad ? 'text-destructive' : 'text-primary'
                          )}
                        >
                          {outcome.bad ? (
                            <CircleAlert className="size-3.5" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                          {outcome.text}
                        </span>
                      ) : had && had.status !== 'revoked' && had.status !== 'declined' ? (
                        <span className="text-muted-foreground text-xs">
                          {ROLE_LABEL[had.role]} → {ROLE_LABEL[role]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">new seat</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            {step === 'review' ? (
              <p className="m-0 text-muted-foreground text-xs">
                {rerole
                  ? `${targets.length} seats change. Nothing is emailed.`
                  : `${emails.length === 1 ? 'One email' : `${emails.length} emails, one per person`}, each listing ${targets.length === 1 ? '1 site' : `${targets.length} sites`}. Seats are granted when they accept.`}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === 'sent' ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              {step !== 'who' && !(step === 'where' && rerole) ? (
                <Button variant="ghost" onClick={back}>
                  Back
                </Button>
              ) : null}
              {step === 'review' ? (
                <Button onClick={() => setStep('sent')}>
                  {rerole
                    ? `Set ${ROLE_LABEL[role]} on ${targets.length} sites`
                    : emails.length === 1
                      ? 'Send the invitation'
                      : `Send ${emails.length} invitations`}
                </Button>
              ) : (
                <Button disabled={!canNext} onClick={next}>
                  Continue
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── My Sites on three columns — Site · Team · Agent (chosen 04/09) ───────────────────────────
//
// The first column is the SITE (its key plus the role you hold there); the tab has no other name
// for a site. The header row exists because two things sit on the right of every row and the
// reader has to be told which is which once. Fixed widths on Team and Agent are what make the
// eight buttons line up. Agent keeps the one state the row had before this: Chat, Start the
// agent, Now chatting, Invitation pending.

/** A row exactly as `tracy-my-sites` draws it today — name, muted role, one state on the right. */
type TodayState = 'chat' | 'start' | 'current' | 'invited'
const todaySites: { key: string; platform: Platform; myRole: Role; state: TodayState }[] = [
  { key: 'beta.tracy.ai', platform: 'wordpress', myRole: 'owner', state: 'chat' },
  { key: 'gymshark.com', platform: 'shopify', myRole: 'owner', state: 'chat' },
  { key: 'joomlart.com', platform: 'joomla', myRole: 'owner', state: 'chat' },
  { key: 'tracy.ai', platform: 'wordpress', myRole: 'owner', state: 'chat' },
  { key: 'juneflower.tracy.ai', platform: 'wordpress', myRole: 'owner', state: 'start' },
  { key: 'demo-tracy.myshopify.com', platform: 'shopify', myRole: 'editor', state: 'chat' },
  { key: 'shop.acme.com', platform: 'shopify', myRole: 'viewer', state: 'invited' },
  { key: 'fijitrips.example', platform: 'wordpress', myRole: 'owner', state: 'current' }
]

function TodayAction({ state }: { state: TodayState }) {
  if (state === 'current') return <Badge variant="secondary">Now chatting</Badge>
  if (state === 'invited') return <Badge variant="outline">Invitation pending</Badge>
  return (
    <Button variant="outline" size="sm">
      {state === 'start' ? 'Start the agent' : 'Chat'}
    </Button>
  )
}

/** One site's book — `tracy-desk`'s Team table. Actions only where the seat book would allow them. */
function Roster({ siteKey, myRole }: { siteKey: string; myRole: Role }) {
  const rows = grants.filter((g) => g.site === siteKey)
  const runs = myRole === 'owner'
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Member</th>
            <th className="px-3 py-2 text-left font-medium">Role</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Access</th>
            {runs ? <th className="w-28 px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr>
            <td className="px-3 py-2">
              you <span className="text-muted-foreground text-xs">{ME}</span>
            </td>
            <td className="px-3 py-2">
              <RoleBadge role={myRole} />
            </td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-muted-foreground text-xs">Granted 3 weeks ago</td>
            {runs ? <td /> : null}
          </tr>
          {rows.map((g) => {
            const gone = g.status === 'revoked' || g.status === 'declined'
            return (
              <tr key={g.email} className={cn('group/row', gone && 'text-muted-foreground')}>
                <td className="px-3 py-2">
                  <span className="grid gap-0.5">
                    <span className="truncate">{nameOf(g)}</span>
                    {g.name ? (
                      <span className="truncate text-muted-foreground text-xs">{g.email}</span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <RoleBadge role={g.role} />
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={g.status} />
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{g.access}</td>
                {runs ? (
                  <td className="px-3 py-2">
                    <RowActions grant={g} />
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The Team cell: faces, a count, and the one thing waiting on the reader. */
function PeopleCluster({ siteKey, onClick, open }: { siteKey: string; onClick: () => void; open?: boolean }) {
  const rows = grants.filter((g) => g.site === siteKey)
  const live = rows.filter((g) => g.status === 'active' || g.status === 'invited')
  const asked = rows.filter((g) => g.status === 'requested').length
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground',
        open && 'bg-muted text-foreground'
      )}
      title="Team"
    >
      {asked > 0 ? <Badge>{asked} asked to join</Badge> : null}
      {live.length > 0 ? (
        <span className="flex -space-x-2">
          {live.slice(0, 3).map((g) => (
            <Avatar key={g.email} className="size-5 border-2 border-background">
              <AvatarFallback className="text-[8px]">{initials(g)}</AvatarFallback>
            </Avatar>
          ))}
        </span>
      ) : (
        <Users className="size-3.5" />
      )}
      {live.length === 0 ? 'only you' : `${live.length + 1}`}
    </button>
  )
}

const COLS = 'grid grid-cols-[minmax(0,1fr)_14rem_10rem] items-center gap-3'

function MySitesColumns({ expanded: initial = [] }: { expanded?: string[] }) {
  const [expanded, setExpanded] = useState<string[]>(initial)
  const [wizard, setWizard] = useState<{ open: boolean; site?: string }>({ open: false })
  const toggle = (key: string) =>
    setExpanded((e) => (e.includes(key) ? e.filter((x) => x !== key) : [...e, key]))
  return (
    <>
      <div className="mb-1 flex items-center justify-end">
        <Button size="sm" variant="ghost" onClick={() => setWizard({ open: true })}>
          <UserPlus />
          Invite member
        </Button>
      </div>
      <div className={cn(COLS, 'border-border border-b pb-2 text-muted-foreground text-xs')}>
        <span>Site</span>
        <span>Team</span>
        <span className="text-right">Agent</span>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-sm">
        {todaySites.map((site) => {
          const open = expanded.includes(site.key)
          const runs = site.myRole === 'owner'
          return (
            <li key={site.key}>
              <div className={cn(COLS, 'py-2.5')}>
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-semibold">{site.key}</span>
                  <span className="shrink-0 text-muted-foreground text-xs">{ROLE_LABEL[site.myRole]}</span>
                </div>
                <div className="flex items-center">
                  <PeopleCluster siteKey={site.key} open={open} onClick={() => toggle(site.key)} />
                </div>
                <div className="flex justify-end">
                  <TodayAction state={site.state} />
                </div>
              </div>
              {open ? (
                <div className="mb-3 grid gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      {runs ? 'People on this site.' : 'People on this site. Only an Owner can change them.'}
                    </span>
                    {runs ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWizard({ open: true, site: site.key })}
                      >
                        <UserPlus />
                        Invite member
                      </Button>
                    ) : null}
                  </div>
                  <Roster siteKey={site.key} myRole={site.myRole} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {wizard.open ? (
        <InviteWizard
          key={wizard.site ?? 'all'}
          open
          onOpenChange={(o) => setWizard({ open: o })}
          initialScope={wizard.site ? 'pick' : 'all'}
          initialPicked={wizard.site ? [wizard.site] : []}
        />
      ) : null}
    </>
  )
}

export const MySitesColumnsOpen: Story = {
  name: 'My Sites · three columns, one site open',
  render: () => (
    <Frame note="Site · Team · Agent. The Team cell opens that site's book underneath; Invite member at the top covers every site you run, the one inside the book covers this site.">
      <MySitesColumns expanded={['tracy.ai']} />
    </Frame>
  )
}

export const MySitesColumnsClosed: Story = {
  name: 'My Sites · three columns, all closed',
  render: () => (
    <Frame note="Nothing open — the resting state of the tab.">
      <MySitesColumns />
    </Frame>
  )
}

export const MySitesColumnsViewerSeat: Story = {
  name: 'My Sites · three columns, a site you do not run',
  render: () => (
    <Frame note="shop.acme.com, where you are a Viewer: the book is readable, no actions are drawn — the seat book would refuse them.">
      <MySitesColumns expanded={['shop.acme.com']} />
    </Frame>
  )
}

// ── The wizard on its own, one story per step ────────────────────────────────────────────────

const TWO = ['hanaops@example.com', 'tom.dev@agency.example']

function WizardOnly(props: Omit<WizardProps, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(true)
  return (
    <Frame note="The invite wizard. Click through: Who → Where → Role → Review → Sent.">
      <div className="text-muted-foreground text-sm">
        {open ? null : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus />
            Invite member
          </Button>
        )}
      </div>
      <InviteWizard open={open} onOpenChange={setOpen} {...props} />
    </Frame>
  )
}

export const WizardWho: Story = {
  name: 'Wizard · 1 Who, several addresses',
  render: () => <WizardOnly initialEmails={TWO} />
}
export const WizardWhere: Story = {
  name: 'Wizard · 2 Where',
  render: () => (
    <WizardOnly
      initialEmails={TWO}
      initialStep="where"
      initialScope="pick"
      initialPicked={['tracy.ai', 'joomlart.com']}
    />
  )
}
export const WizardRole: Story = {
  name: 'Wizard · 3 Role',
  render: () => <WizardOnly initialEmails={TWO} initialStep="role" initialRole="viewer" />
}
export const WizardReview: Story = {
  name: 'Wizard · 4 Review',
  render: () => <WizardOnly initialEmails={TWO} initialStep="review" initialRole="viewer" />
}
export const WizardSent: Story = {
  name: 'Wizard · 5 Sent, one site refused',
  render: () => <WizardOnly initialEmails={TWO} initialStep="sent" initialRole="viewer" />
}
export const WizardSetRoleExisting: Story = {
  name: 'Wizard · existing member, one role everywhere',
  render: () => <WizardOnly presetEmail="victorl@example.com" initialRole="editor" />
}

// ── The invitation mail — one mail per person, for N sites ───────────────────────────────────

function MailFrame({ subject, children }: { subject: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-muted/40 px-6 py-3 text-sm">
        <span className="text-muted-foreground">Subject · </span>
        <span className="font-medium">{subject}</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

export const InviteMailToday: Story = {
  name: 'Invite mail · today, eight sites (real template)',
  render: () => {
    const mail = inviteMail({
      inviterName: 'Lee',
      inviterEmail: ME,
      workspaceName: 'JoomlArt',
      siteKeys: ALL_KEYS
    })
    return (
      <div className="h-screen bg-background text-foreground">
        <MailFrame subject={mail.subject}>
          <iframe srcDoc={mail.html} title="Invite mail, today" className="h-full w-full border-0" />
        </MailFrame>
      </div>
    )
  }
}

/**
 * The proposed mail, drawn by hand because the generator has no slot for a role, a site list, or
 * an accept link. Same frame as the real one (white card, system font, one button), so the diff
 * is the words: the role in the subject and opening, one line per site, Accept, the bare link.
 */
function ProposedMail({ role, siteKeys }: { role: InvitableRole; siteKeys: string[] }) {
  const many = siteKeys.length > 1
  return (
    <div className="h-full overflow-auto bg-[#f4f4f5] px-4 py-8 text-[#18181b]">
      <div className="mx-auto max-w-[560px] rounded-lg bg-white px-8 py-7 font-sans text-[15px] leading-relaxed shadow-sm">
        <p className="m-0 mb-4">
          Lee invited you to {many ? `${siteKeys.length} websites` : siteKeys[0]} on Tracy, as{' '}
          <strong>{ROLE_LABEL[role]}</strong> — {ROLE_HINT[role]}.
        </p>
        <p className="m-0 mb-1 font-semibold text-[#71717a] text-[13px]">{many ? 'Websites' : 'Website'}</p>
        <ul className="m-0 mb-5 list-none p-0">
          {siteKeys.map((k) => (
            <li key={k} className="border-[#e4e4e7] border-b py-1.5 last:border-b-0">
              {k}
            </li>
          ))}
        </ul>
        <a
          href="https://cowork.tracy.ai/invite/3f9c…"
          className="inline-block rounded-md bg-[#5b8def] px-4 py-2 font-medium text-sm text-white no-underline"
        >
          Accept
        </a>
        <p className="m-0 mt-5 text-[#52525b] text-sm">Or click the link below:</p>
        <p className="m-0 mt-1 break-all text-[#5b8def] text-sm underline">
          https://cowork.tracy.ai/invite/3f9c2a7e-51d0-4b8e-9f0c-6a1e2b3c4d5e
        </p>
        <p className="m-0 mt-4 text-[#a1a1aa] text-xs">
          This link is for you alone. If you were not expecting it, ignore this mail; nothing happens until it
          is clicked.
        </p>
      </div>
    </div>
  )
}

export const InviteMailProposed: Story = {
  name: 'Invite mail · proposed, one mail for eight sites',
  render: () => (
    <div className="h-screen bg-background text-foreground">
      <MailFrame subject="Lee invited you to 8 websites on Tracy as Viewer">
        <ProposedMail role="viewer" siteKeys={ALL_KEYS} />
      </MailFrame>
    </div>
  )
}

export const InviteMailProposedOneSite: Story = {
  name: 'Invite mail · proposed, one site',
  render: () => (
    <div className="h-screen bg-background text-foreground">
      <MailFrame subject="Lee invited you to tracy.ai on Tracy as Editor">
        <ProposedMail role="editor" siteKeys={['tracy.ai']} />
      </MailFrame>
    </div>
  )
}

// ── What the link does ───────────────────────────────────────────────────────────────────────

export const InviteSignInStep: Story = {
  name: 'Invite link · no session yet: the real OTP door',
  render: () => (
    <div className="h-screen bg-background text-foreground">
      <MailFrame subject="cowork.tracy.ai/invite/3f9c… — this browser has no session, so: the code">
        <iframe
          srcDoc={loginPage({
            next: '/invite/3f9c2a7e-51d0-4b8e-9f0c-6a1e2b3c4d5e',
            email: 'hanaops@example.com',
            origin: 'https://cowork.tracy.ai',
            step: 'code'
          })}
          title="Sign-in step"
          className="h-full w-full border-0"
        />
      </MailFrame>
    </div>
  )
}

/**
 * Where the link lands, after the OTP sign-in — a Worker page (mode C, `cowork-web`), drawn by
 * hand here. It has to answer one question: WHAT just happened. The sites, the role, and the one
 * door onward. Two other answers the same page must give: the link already used, and the
 * invitation cancelled before the click — both without a dead end.
 */
function AcceptLanding({
  state,
  role,
  siteKeys
}: {
  state: 'accepted' | 'already' | 'revoked'
  role: InvitableRole
  siteKeys: string[]
}) {
  const title =
    state === 'accepted'
      ? `You are on ${siteKeys.length} sites now`
      : state === 'already'
        ? 'This invitation was already accepted'
        : 'This invitation was withdrawn'
  const body =
    state === 'accepted'
      ? `As ${ROLE_LABEL[role]} — ${ROLE_HINT[role]}.`
      : state === 'already'
        ? 'Your seats are in place. Open My Sites to see them.'
        : 'Whoever invited you cancelled it before you accepted. Ask them to invite you again.'
  return (
    <div className="flex h-full items-start justify-center overflow-auto bg-[#f4f4f5] px-4 py-16 text-[#18181b]">
      <div className="w-full max-w-[520px] rounded-lg bg-white px-8 py-7 font-sans text-[15px] leading-relaxed shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-[#5b8def]">
          {state === 'revoked' ? (
            <CircleAlert className="size-5 text-[#dc2626]" />
          ) : (
            <Check className="size-5" />
          )}
          <span className="font-semibold text-[#18181b] text-lg">{title}</span>
        </div>
        <p className="m-0 mb-4 text-[#52525b]">{body}</p>
        <ul className="m-0 mb-6 list-none p-0">
          {siteKeys.map((k) => (
            <li
              key={k}
              className="flex items-center justify-between border-[#e4e4e7] border-b py-1.5 last:border-b-0"
            >
              <span>{k}</span>
              <span className="text-[#71717a] text-xs">
                {state === 'revoked' ? 'cancelled' : ROLE_LABEL[role]}
              </span>
            </li>
          ))}
        </ul>
        {state === 'revoked' ? (
          <span className="inline-block rounded-md border border-[#e4e4e7] px-4 py-2 font-medium text-[#52525b] text-sm">
            Signed in as hanaops@example.com
          </span>
        ) : (
          <a
            href="https://cowork.tracy.ai/"
            className="inline-block rounded-md bg-[#5b8def] px-4 py-2 font-medium text-sm text-white no-underline"
          >
            Open My Sites
          </a>
        )}
      </div>
    </div>
  )
}

export const InviteAccepted: Story = {
  name: 'Invite link · accepted (Worker page)',
  render: () => (
    <div className="h-screen bg-background text-foreground">
      <MailFrame subject="cowork.tracy.ai/invite/3f9c… — after the code">
        <AcceptLanding state="accepted" role="viewer" siteKeys={ALL_KEYS} />
      </MailFrame>
    </div>
  )
}

export const InviteAlreadyAccepted: Story = {
  name: 'Invite link · clicked twice',
  render: () => (
    <div className="h-screen bg-background text-foreground">
      <MailFrame subject="cowork.tracy.ai/invite/3f9c… — second click">
        <AcceptLanding state="already" role="viewer" siteKeys={ALL_KEYS} />
      </MailFrame>
    </div>
  )
}

export const InviteWithdrawn: Story = {
  name: 'Invite link · invitation cancelled before the click',
  render: () => (
    <div className="h-screen bg-background text-foreground">
      <MailFrame subject="cowork.tracy.ai/invite/3f9c… — an Owner cancelled it first">
        <AcceptLanding state="revoked" role="viewer" siteKeys={ALL_KEYS} />
      </MailFrame>
    </div>
  )
}
