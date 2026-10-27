/**
 * The `…` on a My Sites row: everything about one site that is not a click on the row itself
 * (Phase B of `tasks/plan-my-sites-tabs.md`, drawn as `Mockups/My Sites More menu`).
 *
 * Three groups, and the order is the argument: where the site lives, what has happened to it,
 * and how to stop being part of it. Leave and Delete sit last, behind a separator, and Delete
 * asks for the site's name in the hand of the person deleting it.
 *
 * 🔒 NOT `DropdownMenu` FROM `@tracy/ui` — see `@tracy/core/site-tabs`'s `Popover`: base UI's
 * anchored menu never finishes positioning inside dsh's page (measured 04/09), so it opens
 * invisibly. A dialog is fine there and is used as-is.
 */
import { type JSX, type ReactNode, useState, useSyncExternalStore } from 'react'
import {
  Copy,
  Download,
  ExternalLink,
  Globe,
  ListChecks,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  Users
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label
} from '@tracy/ui'
import { Popover, PopoverItem, type PopoverProps, PopoverSeparator } from '@tracy/core/site-tabs'

import { showsPublish, showsSettings } from './more-actions'
import type { Translate } from './strings'
import { uiSwitches } from '@tracy/core/ui-switches'

/** What the menu needs to know about the row it belongs to. */
export interface MoreSite {
  siteKey: string
  role: string | null
  status: string
  /** The public address, or null while the site has none yet. */
  liveUrl: string | null
  /** The platform's admin door, or null when there is none to open (Shopify). */
  adminUrl: string | null
  /** Set when this viewer is the only Owner: they cannot leave, and the row says why. */
  lastOwner: boolean
  /** `draft` | `published` as `/api/sites` says it; absent when it does not. */
  publish?: string | null
  /** `live` | `draft` while that operation runs on the site; absent when none does. */
  publishing?: string | null
  /**
   * An imported Joomla or WordPress site: its live original can be synced into it (Sync from live),
   * and Tracy's changes sent back to it (Sync to live) — the same sites for both.
   */
  syncsFromLive?: boolean
}

export type MoreAction =
  | { kind: 'live' }
  | { kind: 'admin' }
  | { kind: 'copy' }
  | { kind: 'team' }
  | { kind: 'changes' }
  | { kind: 'settings' }
  /**
   * The Publish tab; `entry` lands on its ZIP flow (Export site as ZIP), that flow's Sync step, or its
   * Sync to live flow (`push`).
   */
  | { kind: 'publish'; entry?: 'zip' | 'sync' | 'push' }
  | { kind: 'leave' }
  | { kind: 'delete' }

/** The trigger props `Popover` hands over. */
type TriggerProps = Parameters<PopoverProps['trigger']>[0]

/**
 * The menu, with the row's own `…` button. The Browser toolbar raises the same menu from the fork's
 * More button (`site-toolbar.tsx`): it passes its own `trigger`, laid over that button, and
 * `defaultOpen` / `onOpenChange` to open on mount and go away on close. Export site as ZIP and Sync
 * from live open the site's Publish tab on its ZIP flow (23/10/2026), as Publish opens it; Sync to live
 * opens it on its own flow (25/10/2026).
 */
export function MoreMenu({
  site,
  onAction,
  t,
  trigger,
  defaultOpen,
  onOpenChange
}: {
  site: MoreSite
  onAction: (action: MoreAction) => void
  t: Translate
  trigger?: (props: TriggerProps) => ReactNode
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}): JSX.Element {
  const owner = site.role === 'owner'
  // Subscribed, so a row whose switch is off by default appears once the door says it is on: the
  // menu can be drawn before `/api/ui` answers (25/10/2026, dev: Sync to live never showed).
  const switches = uiSwitches()
  const syncFromLiveOn = useSyncExternalStore(switches.subscribe, () =>
    switches.isShown('site-sync-from-live')
  )
  const syncToLiveOn = useSyncExternalStore(switches.subscribe, () => switches.isShown('site-sync-to-live'))
  return (
    <>
      <Popover
        align="end"
        // Portalled out of the row's scroll container, so it carries this plugin's root class or it
        // loses the scoped reset that mode B has instead of a preflight.
        scopeClass="tracy-mysites"
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        trigger={
          trigger ??
          ((props) => (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t('action.more')} {...props}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          ))
        }
      >
        <PopoverItem onClick={() => onAction({ kind: 'live' })} disabled={site.liveUrl === null}>
          <ExternalLink className="size-4 flex-none" aria-hidden="true" />
          {t('more.live')}
        </PopoverItem>
        {/* Shopify's admin lives on admin.shopify.com — a host this surface never opens. The row
          stays, greyed, naming the platform: a missing row reads as a bug, a greyed one as a fact. */}
        <PopoverItem onClick={() => onAction({ kind: 'admin' })} disabled={site.adminUrl === null}>
          <ExternalLink className="size-4 flex-none" aria-hidden="true" />
          {t('more.admin')}
        </PopoverItem>
        <PopoverItem onClick={() => onAction({ kind: 'copy' })} disabled={site.liveUrl === null}>
          <Copy className="size-4 flex-none" aria-hidden="true" />
          {t('more.copyAddress')}
        </PopoverItem>
        <PopoverSeparator />
        <PopoverItem onClick={() => onAction({ kind: 'team' })}>
          <Users className="size-4 flex-none" aria-hidden="true" />
          {t('more.team')}
        </PopoverItem>
        <PopoverItem onClick={() => onAction({ kind: 'changes' })}>
          <ListChecks className="size-4 flex-none" aria-hidden="true" />
          {t('more.changes')}
        </PopoverItem>
        {/* The site's Settings tab, the same gear the site-tab menu uses (Akemi 04/10/2026). */}
        {showsSettings(site) && (
          <PopoverItem onClick={() => onAction({ kind: 'settings' })}>
            <Settings className="size-4 flex-none" aria-hidden="true" />
            {t('more.settings')}
          </PopoverItem>
        )}
        {/* The site's Publish tab: one line, the same for a draft and a live site (07/10/2026). */}
        {showsPublish(site) && (
          <PopoverItem onClick={() => onAction({ kind: 'publish' })}>
            <Globe className="size-4 flex-none" aria-hidden="true" />
            {t('more.publish')}
          </PopoverItem>
        )}
        {/* Its switch: /ops › User Interface › Sync from live (`site-sync-from-live`). */}
        {owner && site.syncsFromLive && syncFromLiveOn && (
          <PopoverItem data-sync-from-live onClick={() => onAction({ kind: 'publish', entry: 'sync' })}>
            <RefreshCw className="size-4 flex-none" aria-hidden="true" />
            {t('more.syncFromLive')}
          </PopoverItem>
        )}
        {/* Its switch: /ops › User Interface › Sync to live (`site-sync-to-live`), off by default. */}
        {owner && site.syncsFromLive && syncToLiveOn && (
          <PopoverItem data-sync-to-live onClick={() => onAction({ kind: 'publish', entry: 'push' })}>
            <Upload className="size-4 flex-none" aria-hidden="true" />
            {t('more.syncToLive')}
          </PopoverItem>
        )}
        {owner && (
          <PopoverItem data-export-site onClick={() => onAction({ kind: 'publish', entry: 'zip' })}>
            <Download className="size-4 flex-none" aria-hidden="true" />
            {t('more.export')}
          </PopoverItem>
        )}
        <PopoverSeparator />
        {/* ADR 0036: the last Owner cannot leave — somebody has to be able to let people in. */}
        <PopoverItem
          onClick={() => onAction({ kind: 'leave' })}
          disabled={site.lastOwner}
          hint={site.lastOwner ? t('more.lastOwner') : undefined}
        >
          <LogOut className="size-4 flex-none" aria-hidden="true" />
          {t('more.leave')}
        </PopoverItem>
        {/* Owner only, and absent rather than greyed for anyone else: a greyed Delete is a dare. */}
        {owner && (
          <PopoverItem danger onClick={() => onAction({ kind: 'delete' })}>
            <Trash2 className="size-4 flex-none" aria-hidden="true" />
            {t('more.delete')}
          </PopoverItem>
        )}
      </Popover>
    </>
  )
}

export function LeaveDialog({
  siteKey,
  siteName = siteKey,
  busy,
  error,
  onOpenChange,
  onConfirm,
  t
}: {
  siteKey: string
  /** The name the site is shown by (`/api/sites` `displayName`); a rename changes it, never the key. */
  siteName?: string
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  t: Translate
}): JSX.Element {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('leave.title', { site: siteName })}</DialogTitle>
          <DialogDescription>{t('leave.body')}</DialogDescription>
        </DialogHeader>
        {error !== null && (
          <p className="m-0 text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? t('leave.working') : t('leave.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Declining an invitation cannot be undone from this side: the inviter has to invite again. So
 * Decline asks first, naming the site and who sent it (develop #800, Akemi 04/10/2026).
 */
export function DeclineDialog({
  siteName,
  inviter,
  busy,
  error,
  onOpenChange,
  onConfirm,
  t
}: {
  /** The name the site is shown by (`/api/sites` `displayName`). */
  siteName: string
  /** Who sent the invitation (`/api/sites` `inviterName`), or null when the book does not know. */
  inviter: string | null
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  t: Translate
}): JSX.Element {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('decline.title', { site: siteName })}</DialogTitle>
          {inviter !== null && <DialogDescription>{t('decline.body', { inviter })}</DialogDescription>}
        </DialogHeader>
        {error !== null && (
          <p className="m-0 text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? t('action.declining') : t('action.decline')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Remove an unfinished import (`DELETE /api/sites/:key/import`): asks first, since the row and what
 * the read copied so far go; the live site is not touched. Owner only, like Delete.
 */
export function RemoveImportDialog({
  siteName,
  busy,
  error,
  onOpenChange,
  onConfirm,
  t
}: {
  siteName: string
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  t: Translate
}): JSX.Element {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('removeImport.title', { site: siteName })}</DialogTitle>
          <DialogDescription>{t('removeImport.body')}</DialogDescription>
        </DialogHeader>
        {error !== null && (
          <p className="m-0 text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? t('action.removingImport') : t('action.removeImport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Delete is delete (Lee, 04/09): the site, its database, its history and the seats go, and
 * nothing of it is kept for three days. The dialog says all of it, then asks the reader to type
 * the word — one gate that cannot be passed by muscle memory. The word, not the site's name
 * (Lee, 06/09): a long hostname in a gate is friction without extra safety, since the row that
 * opened this dialog already names the site in the title.
 */
const DELETE_WORD = 'delete'
export function DeleteDialog({
  siteKey,
  siteName = siteKey,
  busy,
  error,
  onOpenChange,
  onConfirm,
  t
}: {
  siteKey: string
  /** The name the site is shown by (`/api/sites` `displayName`); a rename changes it, never the key. */
  siteName?: string
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  t: Translate
}): JSX.Element {
  const [typed, setTyped] = useState('')
  const ready = typed.trim().toLowerCase() === DELETE_WORD
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('delete.title', { site: siteName })}</DialogTitle>
          <DialogDescription>{t('delete.body')}</DialogDescription>
        </DialogHeader>
        <ul className="m-0 grid list-none gap-2 p-0 text-sm">
          {['delete.goesSite', 'delete.goesData', 'delete.goesSeats', 'delete.goesRepo'].map((key) => (
            <li key={key} className="flex gap-2">
              <Trash2 className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 pt-1">
          <Label htmlFor="tracy-delete-name" className="font-normal text-muted-foreground">
            {t('delete.typeName')}
          </Label>
          <Input
            id="tracy-delete-name"
            placeholder="Delete"
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {error !== null && (
          <p className="m-0 text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy || !ready} onClick={onConfirm}>
            {busy ? t('delete.working') : t('delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
