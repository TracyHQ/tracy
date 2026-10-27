/**
 * THROWAWAY MOCK — the "…" More column of My Sites, and every screen a menu item leads to. Not
 * shipped code.
 *
 * THE QUESTION IT EXISTS TO ANSWER (04/09): "when I click … and then pick those menu items, what
 * does the next screen look like?" Each item below is drawn to its end — the panel, the
 * dialog, the toast — so the review is of the whole gesture, not of a menu.
 *
 * THE MODEL, in one sentence: a row has ONE drawer under it (the place the Team book already
 * opens), and the drawer has two views — Team · Changes — while everything that is not a view is
 * a dialog. The menu items therefore fall into three kinds:
 *
 *   1. LEAVE THE PAGE — Open live site, Open admin (new window); Copy address (a toast).
 *   2. OPEN THE DRAWER ON A VIEW — Changes (what is unrecorded, with "Record a version" = the seal
 *      of ADR 0091).
 *   3. A DIALOG — Leave site; Delete Tracy's copy… (ADR 0048: doors shut now, data erased after
 *      three days, type the site's name, Owner only).
 *
 * WHAT IS NOT BEING ASKED: the words. Menu labels come from tracy-desk where it had them
 * (`tracySites.menu.*`, `tracySites.config.advanced.*`) and from ADR 0048/0091 where it did not.
 * Changes rows are the bench's own fixtures, the same ones the Site screen draws.
 *
 * ⚠ SUPERSEDED IN PART (04/09 evening): Team, Changes and History are no longer a drawer under
 * the row — they are three TAB TYPES of better-sidebar, opened from this menu, from the row's Team
 * cluster, or from `+` (see `Mockups/Sidebar site tabs`, Phase A). The drawer stories below stay
 * only so the Changes CONTENT and the dialogs (Leave, Delete) can still be reviewed here; the frame
 * around them is out of date. The History view with its Release and Restore dialogs went with the
 * History tab (03/10/2026, ADR 0024 amendment 2): a good point is a Backup in Site changes now.
 * "Delete Tracy's copy" is also gone as a concept: a site on Tracy is the site, and Delete tears
 * everything down (`tasks/plan-my-sites-tabs.md` §0). The menu row is now "Delete site…".
 *
 * ⚠ MODE A — Tailwind, Tracy owns `<html>`. The real thing lives in `tracy-my-sites` (mode B) and
 * must be REWRITTEN on that plugin's shape. ⚠ DELETE WHEN DONE.
 */
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Trash2,
  TriangleAlert,
  Users
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { changeGroups } from '../fixtures'

const meta: Meta = {
  title: 'Mockups/My Sites More menu',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

type Role = 'owner' | 'editor' | 'viewer'
interface Row {
  key: string
  role: Role
  people: number
  agent: 'chat' | 'start' | 'current'
  /** ADR 0086: a site born on the fleet has no Preview; restoring one edits the live site. */
  origin: 'fleet_born' | 'fleet_import'
  published: boolean
  lastOwner?: boolean
  platform: 'wordpress' | 'joomla' | 'shopify'
}
const rows: Row[] = [
  {
    key: 'beta.tracy.ai',
    role: 'owner',
    people: 3,
    agent: 'chat',
    origin: 'fleet_born',
    published: true,
    platform: 'wordpress'
  },
  {
    key: 'gymshark.com',
    role: 'owner',
    people: 1,
    agent: 'chat',
    origin: 'fleet_import',
    published: false,
    platform: 'shopify'
  },
  {
    key: 'joomlart.com',
    role: 'owner',
    people: 2,
    agent: 'chat',
    origin: 'fleet_import',
    published: true,
    platform: 'joomla'
  },
  {
    key: 'tracy.ai',
    role: 'owner',
    people: 21,
    agent: 'chat',
    origin: 'fleet_import',
    published: true,
    lastOwner: true,
    platform: 'wordpress'
  },
  {
    key: 'juneflower.tracy.ai',
    role: 'owner',
    people: 1,
    agent: 'start',
    origin: 'fleet_born',
    published: false,
    platform: 'wordpress'
  },
  {
    key: 'demo-tracy.myshopify.com',
    role: 'editor',
    people: 2,
    agent: 'chat',
    origin: 'fleet_import',
    published: true,
    platform: 'shopify'
  },
  {
    key: 'fijitrips.example',
    role: 'owner',
    people: 4,
    agent: 'current',
    origin: 'fleet_import',
    published: true,
    platform: 'wordpress'
  }
]

const ADMIN_PATH: Record<Row['platform'], string | null> = {
  wordpress: '/wp-admin',
  joomla: '/administrator',
  shopify: null
}

// ── Frame ────────────────────────────────────────────────────────────────────────────────────

function Frame({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl p-6">
        <p className="mb-4 text-muted-foreground text-xs">{note}</p>
        {children}
      </div>
    </div>
  )
}

const COLS = 'grid grid-cols-[minmax(0,1fr)_10rem_10rem_3rem] items-center gap-3'

type View = 'team' | 'changes'
type DialogKind = { kind: 'none' } | { kind: 'leave'; site: Row } | { kind: 'delete'; site: Row }

// ── The menu ─────────────────────────────────────────────────────────────────────────────────

function MoreMenu({
  site,
  open,
  onOpenChange,
  onView,
  onDialog,
  onCopied
}: {
  site: Row
  open?: boolean
  onOpenChange?: (o: boolean) => void
  onView: (v: View) => void
  onDialog: (d: DialogKind) => void
  onCopied: () => void
}) {
  const admin = ADMIN_PATH[site.platform]
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <ExternalLink /> Open live site
          </DropdownMenuItem>
          {/* Shopify's admin is on admin.shopify.com — a host this tab never opens (my-sites index.tsx). */}
          <DropdownMenuItem disabled={admin === null}>
            <ExternalLink /> Open admin
            {admin === null ? <span className="ml-auto text-muted-foreground text-xs">Shopify</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopied}>
            <Copy /> Copy address
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onView('changes')}>
            <ListChecks /> Changes
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* ADR 0036: the last Owner cannot leave; the item stays, greyed, with the reason. */}
          <DropdownMenuItem disabled={site.lastOwner} onClick={() => onDialog({ kind: 'leave', site })}>
            <LogOut /> Leave site
            {site.lastOwner ? (
              <span className="ml-auto text-muted-foreground text-xs">last Owner</span>
            ) : null}
          </DropdownMenuItem>
          {/* ADR 0036/0048: Owner only. An Editor does not see it at all — a greyed delete is a dare. */}
          {site.role === 'owner' ? (
            <DropdownMenuItem variant="destructive" onClick={() => onDialog({ kind: 'delete', site })}>
              <Trash2 /> Delete site…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── The drawer: Team · Changes ───────────────────────────────────────────────────────────────

function ViewSwitch({ view, onView }: { view: View; onView: (v: View) => void }) {
  const items: { id: View; label: string; icon: ReactNode }[] = [
    { id: 'team', label: 'Team', icon: <Users className="size-3.5" /> },
    { id: 'changes', label: 'Changes', icon: <ListChecks className="size-3.5" /> }
  ]
  return (
    <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => onView(i.id)}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1',
            view === i.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {i.icon}
          {i.label}
        </button>
      ))}
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  M: 'text-amber-600 dark:text-amber-400',
  A: 'text-green-600 dark:text-green-400',
  D: 'text-red-600 dark:text-red-400'
}

/** What is not recorded yet — the seal button turns it into a recorded moment (ADR 0091). */
function ChangesView({ empty = false, onRecord }: { empty?: boolean; onRecord: () => void }) {
  const total = changeGroups.reduce((n, g) => n + g.files.length, 0)
  if (empty) {
    return (
      <div className="rounded-lg border border-border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
        Nothing unrecorded. Every change on this site is already recorded.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border">
      <div className="px-3 py-2">
        {changeGroups.map((g) => (
          <div key={g.group} className="mb-3 last:mb-1">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
              {g.group === 'Core' ? <TriangleAlert className="size-3 text-amber-500" /> : null}
              {g.group}
            </div>
            {g.files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60"
              >
                <span className={cn('w-3 flex-none font-bold font-mono text-[11px]', STATUS_STYLE[f.status])}>
                  {f.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{f.path}</span>
                <span className="flex-none font-mono text-[11px]">
                  {f.additions ? (
                    <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                  ) : null}{' '}
                  {f.deletions ? (
                    <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-border border-t px-3 py-2">
        <span className="text-muted-foreground text-xs">
          {total} files changed since the last recorded version, including edits made outside Tracy.
        </span>
        <Button size="sm" onClick={onRecord}>
          <Camera />
          Record a version
        </Button>
      </div>
    </div>
  )
}

function TeamView() {
  return (
    <div className="rounded-lg border border-border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
      The Team book as it already ships — see Screens/In dsh › My Sites tab.
    </div>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────────────────────────

function LeaveDialog({ site, onClose }: { site: Row; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel="Close" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leave {site.key}?</DialogTitle>
          <DialogDescription>Your seat is removed. A teammate must invite you back.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm">
            Leave the team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** ADR 0048: two beats, Owner only, the site's name typed by hand. */
function DeleteDialog({ site, onClose, typed = '' }: { site: Row; onClose: () => void; typed?: string }) {
  const [name, setName] = useState(typed)
  const ready = name.trim().toLowerCase() === site.key
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel="Close" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Tracy’s copy of {site.key}</DialogTitle>
          <DialogDescription>The live site {site.key} is safe. Tracy never touches it.</DialogDescription>
        </DialogHeader>
        <ul className="m-0 grid list-none gap-2 p-0 text-sm">
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              <strong>Now:</strong> every seat is revoked, the address stops answering, and the agent shuts
              down.
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              <strong>After three days:</strong> the copy, its database and its History are erased. No way
              back.
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              The repository Tracy created goes with it. A repository of your own is left untouched.
            </span>
          </li>
        </ul>
        <div className="grid gap-1.5">
          <Label htmlFor="del-name">Type the site’s name to confirm</Label>
          <Input
            id="del-name"
            placeholder={site.key}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={!ready}>
            Delete everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── The list ─────────────────────────────────────────────────────────────────────────────────

function SiteList({
  initialDrawer,
  initialDialog,
  menuOpenOn,
  emptyChanges = false
}: {
  initialDrawer?: { site: string; view: View }
  initialDialog?: DialogKind
  menuOpenOn?: string
  emptyChanges?: boolean
}) {
  const [drawer, setDrawer] = useState(initialDrawer ?? null)
  const [dialog, setDialog] = useState<DialogKind>(initialDialog ?? { kind: 'none' })
  const [menu, setMenu] = useState<string | null>(menuOpenOn ?? null)
  const [toast, setToast] = useState<string | null>(null)
  const copied = (key: string) => {
    setToast(`Address copied — https://${key}/`)
    setTimeout(() => setToast(null), 2500)
  }
  return (
    <>
      <div className={cn(COLS, 'border-border border-b pb-2 text-muted-foreground text-xs')}>
        <span>Site</span>
        <span>Team</span>
        <span className="text-right">Agent</span>
        <span className="text-right">More</span>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-sm">
        {rows.map((site) => {
          const open = drawer?.site === site.key
          return (
            <li key={site.key}>
              <div className={cn(COLS, 'py-2.5')}>
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-semibold">{site.key}</span>
                  <span className="shrink-0 text-muted-foreground text-xs">{site.role}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDrawer(open && drawer?.view === 'team' ? null : { site: site.key, view: 'team' })
                  }
                  className={cn(
                    'flex w-fit items-center gap-2 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground',
                    open && drawer?.view === 'team' && 'bg-muted text-foreground'
                  )}
                >
                  <Users className="size-3.5" />
                  {site.people === 1 ? 'only you' : site.people}
                </button>
                <div className="flex justify-end">
                  {site.agent === 'current' ? (
                    <Badge variant="secondary">Now chatting</Badge>
                  ) : (
                    <Button variant="outline" size="sm">
                      {site.agent === 'start' ? 'Start the agent' : 'Chat'}
                    </Button>
                  )}
                </div>
                <div className="flex justify-end">
                  <MoreMenu
                    site={site}
                    open={menu === site.key ? true : undefined}
                    onOpenChange={(o) => setMenu(o ? site.key : null)}
                    onView={(v) => {
                      setMenu(null)
                      setDrawer({ site: site.key, view: v })
                    }}
                    onDialog={(d) => {
                      setMenu(null)
                      setDialog(d)
                    }}
                    onCopied={() => {
                      setMenu(null)
                      copied(site.key)
                    }}
                  />
                </div>
              </div>
              {open && drawer ? (
                <div className="mb-3 grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <ViewSwitch view={drawer.view} onView={(v) => setDrawer({ site: site.key, view: v })} />
                    <span className="text-muted-foreground text-xs">
                      {drawer.view === 'team' ? 'People on this site.' : 'Not recorded yet.'}
                    </span>
                  </div>
                  {drawer.view === 'team' ? <TeamView /> : null}
                  {drawer.view === 'changes' ? (
                    <ChangesView empty={emptyChanges} onRecord={() => setDrawer(null)} />
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {toast ? (
        <div className="fixed right-6 bottom-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
          <Check className="size-4 text-primary" />
          {toast}
        </div>
      ) : null}
      {dialog.kind === 'leave' ? (
        <LeaveDialog site={dialog.site} onClose={() => setDialog({ kind: 'none' })} />
      ) : null}
      {dialog.kind === 'delete' ? (
        <DeleteDialog site={dialog.site} onClose={() => setDialog({ kind: 'none' })} />
      ) : null}
    </>
  )
}

// ── Stories: the menu, then each item to its end ─────────────────────────────────────────────

export const MenuOpen: Story = {
  name: '1 · The … menu, open on joomlart.com (Owner)',
  render: () => (
    <Frame note="Site · Team · Agent · More. Three groups: leave the page, open the drawer, a dialog. Delete only for an Owner; Leave greyed for the last Owner.">
      <SiteList menuOpenOn="joomlart.com" />
    </Frame>
  )
}

export const MenuAsEditor: Story = {
  name: '1b · The … menu as an Editor (no Delete)',
  render: () => (
    <Frame note="demo-tracy.myshopify.com, where you are Editor: Delete is absent, and Open admin is greyed because Shopify's admin lives on admin.shopify.com.">
      <SiteList menuOpenOn="demo-tracy.myshopify.com" />
    </Frame>
  )
}

export const Copied: Story = {
  name: '2 · Copy address → toast',
  render: () => {
    const [go, setGo] = useState(false)
    return (
      <Frame note="Copy address leaves the page untouched; a toast confirms what went to the clipboard. Click the button to see it.">
        {go ? <SiteList /> : null}
        {!go ? (
          <Button size="sm" onClick={() => setGo(true)}>
            Show the list
          </Button>
        ) : null}
      </Frame>
    )
  }
}

export const DrawerChanges: Story = {
  name: '3 · Changes → the drawer, unrecorded work',
  render: () => (
    <Frame note="Changes opens the row's drawer on the Changes view (the same drawer the Team book uses; a switch moves between the two). Grouped by zone, Core flagged. Record a version seals it.">
      <SiteList initialDrawer={{ site: 'tracy.ai', view: 'changes' }} />
    </Frame>
  )
}

export const DrawerChangesEmpty: Story = {
  name: '3b · Changes → nothing unrecorded',
  render: () => (
    <Frame note="The same view when the site is fully recorded: a sentence, no button.">
      <SiteList initialDrawer={{ site: 'tracy.ai', view: 'changes' }} emptyChanges />
    </Frame>
  )
}

export const Leave: Story = {
  name: '7 · Leave site → confirm',
  render: () => (
    <Frame note="tracy-desk's rung 2, verbatim: your seat is removed, a teammate must invite you back.">
      <SiteList initialDialog={{ kind: 'leave', site: rows[2] }} />
    </Frame>
  )
}

export const DeleteCopy: Story = {
  name: '8 · Delete Tracy’s copy… → the two beats, type the name',
  render: () => (
    <Frame note="ADR 0048: doors shut now, data erased after three days, Owner only, the site's name typed by hand. The button stays disabled until the name matches.">
      <SiteList initialDialog={{ kind: 'delete', site: rows[2] }} />
    </Frame>
  )
}

export const DeleteCopyReady: Story = {
  name: '8b · Delete… with the name typed',
  render: () => (
    <Frame note="The same dialog once the name matches: Delete everything is armed.">
      <DeleteDialog site={rows[2]} onClose={() => {}} typed="joomlart.com" />
    </Frame>
  )
}
