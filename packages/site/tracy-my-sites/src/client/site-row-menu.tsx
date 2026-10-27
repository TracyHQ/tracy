import { tracyWebFetch as fetch } from '@tracy/core/web-path'
/**
 * The site's own row in dsh's sidebar, on a site page (TCH plan `tasks/todo-site-row-delete-site.md`).
 *
 * dsh lists the folder a seat works in as a "workspace" row whose `…` menu says Rename and Delete
 * workspace. On a site page that row IS the site, and Delete workspace only took a row off a list
 * that came back on the next visit. So on that row — and only that row — dsh's two entries step
 * aside and My Sites' own two take their place, with My Sites' own dialogs and flows:
 *
 * - Leave site, for every role on the site; the last Owner sees it greyed with the reason (ADR 0036).
 * - Delete site…, for an accepted Owner only, absent for anyone else (a greyed Delete is a dare).
 *
 * The section above the rows says Site instead of Workspaces while the page is a site page with
 * one row. Every other row (the creation workspace on `/new/`, another site's row an admin seat
 * sees) keeps dsh's menu untouched. Which row is the site is `site-row-plan.ts`.
 *
 * The slots are the Tracy fork's (`sidebar.workspaces.workspace.menu.item`,
 * `sidebar.workspaces.section.label`, dsh 0.2.0-rc.2-tracy.35): a shipped entry is replaced on some
 * rows by registering its id below priority 0 and rendering the owner's `shipped[id]` elsewhere.
 */
import {
  type ComponentType,
  type JSX,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore
} from 'react'
import { createRoot } from 'react-dom/client'
import { LogOut, Trash2 } from 'lucide-react'
import { siteKeyHere, siteRowFor } from '@tracy/core/site-key'
import { TRACY_MARK_COLOR, TRACY_MARK_PATH } from '@tracy/ui/brand'

import { readSites, SITES_CHANGED, sitesChanged } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'
import { runSiteDelete } from './delete-flow'
import { showDeleteResult } from './delete-result'
import { runSiteLeave } from './leave-flow'
import { DeleteDialog, LeaveDialog } from './more'
import { isLastOwner, type SiteRowFacts, siteRowPlan, type SiteRowPlan } from './site-row-plan'
import type { Translate } from './strings'

const MENU = 'sidebar.workspaces.workspace.menu.item'
const LABEL = 'sidebar.workspaces.section.label'

/** The host's menu row (dsh ui-primitives `MenuItemButton`), handed over by the slot owner. */
type MenuItemComponent = ComponentType<{
  children: ReactNode
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}>

/** What one entry of the workspace row menu receives (owner share + hook + this plugin's `t`). */
interface RowEntryProps {
  path: string
  shipped: { rename: ReactNode; delete: ReactNode }
  MenuItem: MenuItemComponent
  useMenuOpenState: () => readonly [boolean, (open: boolean) => void]
  t: Translate
}

// ── What the page knows: the viewer's sites, and whether they are this site's last Owner ──────

interface Facts {
  sites: readonly SiteRowFacts[]
  lastOwner: boolean
}

let facts: Facts = { sites: [], lastOwner: false }
const listeners = new Set<() => void>()
let loading: Promise<void> | null = null

function publish(next: Facts): void {
  facts = next
  for (const fn of listeners) fn()
}

/** The viewer's address on the seat book (`/auth/me`), or null. */
async function viewerEmail(): Promise<string | null> {
  try {
    const res = await fetch('/auth/me', { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const email = ((await res.json()) as { email?: unknown }).email
    return typeof email === 'string' ? email : null
  } catch {
    return null
  }
}

/** Whether the viewer is the only active Owner of `siteKey`, from the team book (`/api/team`). */
async function lastOwnerOf(siteKey: string): Promise<boolean> {
  try {
    const [res, email] = await Promise.all([
      fetch('/api/team', { headers: { accept: 'application/json' } }),
      viewerEmail()
    ])
    if (!res.ok) return false
    const body = (await res.json()) as {
      sites?: { siteKey?: string; seats?: Parameters<typeof isLastOwner>[0] }[]
    }
    return isLastOwner(body.sites?.find((s) => s.siteKey === siteKey)?.seats, email)
  } catch {
    return false
  }
}

/** Read the seat book (the page's shared answer), then — for an Owner here — the team book. */
function load(): Promise<void> {
  loading ??= (async () => {
    try {
      const { status, body } = await readSites()
      if (status < 200 || status >= 300) return
      const sites = ((body as { sites?: SiteRowFacts[] } | null)?.sites ?? []) as SiteRowFacts[]
      publish({ sites, lastOwner: false })
      // The last-Owner rule matters only to an Owner of this page's site.
      const here = siteRowFor(sites, siteKeyHere()) as SiteRowFacts | null
      if (here?.role === 'owner' && here.status === 'accepted') {
        publish({ sites, lastOwner: await lastOwnerOf(here.siteKey) })
      }
    } catch {
      /* the menu keeps dsh's rows until the book answers */
    } finally {
      loading = null
    }
  })()
  return loading
}

/**
 * The page's sites and last-Owner answer, shared with the Browser toolbar's More menu
 * (`site-toolbar.tsx`): one read of the seat book and the team book for both.
 */
export function subscribeSiteFacts(fn: () => void): () => void {
  return subscribe(fn)
}

/** The facts as last read: the viewer's `/api/sites` rows as sent, and the last-Owner answer. */
export function siteFactsNow(): { sites: readonly unknown[]; lastOwner: boolean } {
  return facts
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (listeners.size === 1) {
    void load()
    window.addEventListener(SITES_CHANGED, reload)
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) window.removeEventListener(SITES_CHANGED, reload)
  }
}

function reload(): void {
  void load()
}

/** This row's menu on this page, or null (dsh's rows stay). */
function useRowPlan(path: string): SiteRowPlan {
  const known = useSyncExternalStore(subscribe, () => facts)
  return siteRowPlan({ path, here: siteKeyHere(), sites: known.sites, lastOwner: known.lastOwner })
}

// ── The two dialogs, raised outside the menu (it unmounts as it closes) ──────────────────────

/**
 * Mount one of My Sites' dialogs on its own root, as `showDeleteResult` does: the row menu that
 * asked for it is gone the moment it closes, and the dialog must outlive it.
 */
/** The site a dialog is about. */
type DialogSite = Pick<NonNullable<SiteRowPlan>, 'siteKey' | 'siteName'>

export function raiseDialog(kind: 'leave' | 'delete', plan: DialogSite, t: Translate): void {
  const host = document.createElement('div')
  host.className = 'tms-site-row-dialog-host'
  document.body.append(host)
  const root = createRoot(host)
  const done = (): void => {
    root.unmount()
    host.remove()
  }
  root.render(<SiteRowDialog kind={kind} plan={plan} t={t} onDone={done} />)
}

function SiteRowDialog({
  kind,
  plan,
  t,
  onDone
}: {
  kind: 'leave' | 'delete'
  plan: DialogSite
  t: Translate
  onDone: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (!open) onDone()
  }, [open, onDone])
  const hooks = {
    current: plan.siteKey,
    t,
    setBusy: (b: boolean) => {
      setBusy(b)
      if (b) setError(null)
    },
    tellFailure: setError,
    closeDialog: () => setOpen(false),
    changed: sitesChanged
  }
  const onOpenChange = (o: boolean): void => {
    if (!o && !busy) setOpen(false)
  }
  if (kind === 'leave') {
    return (
      <LeaveDialog
        siteKey={plan.siteKey}
        siteName={plan.siteName}
        busy={busy}
        error={error}
        onOpenChange={onOpenChange}
        onConfirm={() => void runSiteLeave({ siteKey: plan.siteKey, ...hooks })}
        t={t}
      />
    )
  }
  return (
    <DeleteDialog
      siteKey={plan.siteKey}
      siteName={plan.siteName}
      busy={busy}
      error={error}
      onOpenChange={onOpenChange}
      onConfirm={() =>
        void runSiteDelete({
          siteKey: plan.siteKey,
          siteName: plan.siteName,
          ...hooks,
          showResult: showDeleteResult,
          mark: { path: TRACY_MARK_PATH, color: TRACY_MARK_COLOR }
        })
      }
      t={t}
    />
  )
}

// ── The slot entries ─────────────────────────────────────────────────────────────────────────

/** dsh's Rename, on every row but the site's own. */
function ShippedRename({ path, shipped }: RowEntryProps): ReactNode {
  return useRowPlan(path) === null ? shipped.rename : null
}

/** dsh's Delete workspace, on every row but the site's own. */
function ShippedDelete({ path, shipped }: RowEntryProps): ReactNode {
  return useRowPlan(path) === null ? shipped.delete : null
}

const ICON = { size: 16, 'aria-hidden': true } as const

function LeaveSiteItem({ path, MenuItem, useMenuOpenState, t }: RowEntryProps): ReactNode {
  const plan = useRowPlan(path)
  const [, setOpen] = useMenuOpenState()
  if (plan === null) return null
  return (
    <MenuItem
      icon={<LogOut {...ICON} />}
      disabled={plan.leave.lastOwner}
      onSelect={() => {
        setOpen(false)
        raiseDialog('leave', plan, t)
      }}
    >
      {t('more.leave')}
      {/* ADR 0036: the last Owner cannot leave — somebody has to be able to let people in. */}
      {plan.leave.lastOwner && <span style={{ opacity: 0.7 }}>{` · ${t('more.lastOwner')}`}</span>}
    </MenuItem>
  )
}

function DeleteSiteItem({ path, MenuItem, useMenuOpenState, t }: RowEntryProps): ReactNode {
  const plan = useRowPlan(path)
  const [, setOpen] = useMenuOpenState()
  if (plan === null || !plan.delete) return null
  return (
    <MenuItem
      danger
      icon={<Trash2 {...ICON} />}
      onSelect={() => {
        setOpen(false)
        raiseDialog('delete', plan, t)
      }}
    >
      {t('more.delete')}
    </MenuItem>
  )
}

/** The section label: Site on a site page whose list is that one site, dsh's label otherwise. */
function SectionLabel({
  label,
  useWorkspaces,
  t
}: {
  label: string
  useWorkspaces: <R>(select: (snapshot: { items: readonly unknown[] }) => R) => R
  t: Translate
}): ReactNode {
  const rows = useWorkspaces((s) => s.items.length)
  return siteKeyHere() !== null && rows === 1 ? t('section.site') : label
}

/**
 * Plug the entries into dsh's sidebar.
 * @param slots - `ctx.slots`.
 * @param t - this plugin's translator.
 */
export function registerSiteRow(
  slots: {
    inject: (name: string, fn: () => unknown) => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  },
  t: Translate
): void {
  const inject = () => ({ t })
  slots.inject(MENU, function* () {
    // Priority -1 shadows dsh's own `rename` / `delete` (priority 0): a list cell renders its lowest.
    yield slots.register({ name: MENU, id: 'rename', order: 100, priority: -1, inject }, ShippedRename)
    yield slots.register({ name: MENU, id: 'delete', order: 200, priority: -1, inject }, ShippedDelete)
    yield slots.register({ name: MENU, id: 'tracy-my-sites.leave-site', order: 300, inject }, LeaveSiteItem)
    yield slots.register({ name: MENU, id: 'tracy-my-sites.delete-site', order: 400, inject }, DeleteSiteItem)
  })
  slots.inject(LABEL, () => slots.register({ name: LABEL, priority: -1, inject }, SectionLabel))
}
