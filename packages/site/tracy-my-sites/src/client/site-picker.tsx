/**
 * The site picker under the chat's site chip (dsh's "Choose workspace" button).
 *
 * dsh's own picker lists the workspaces this page's dsh can see, and one page serves one site, so
 * it only ever showed the current site (Akemi, 29/09: a person with two sites found no way to the
 * second one there). This occupant replaces it in the same slot, `conversation.hero.workspace`,
 * at a priority below dsh's (a single slot renders its lowest priority), the way
 * `@tracy/dsh-brand` replaces the hero mark. dsh keeps the chip and its open state; this draws
 * only the menu under it.
 *
 * Three groups: the current site's workspaces (a press picks one, exactly as dsh's picker did),
 * every other site the viewer can open (a press opens it in a new tab, like a My Sites row, Lee
 * 02/09), and "Manage sites", which opens the My Sites tab.
 *
 * Placement is by hand, like `Popover` in `@tracy/core/site-tabs`, for the reason written there:
 * the base UI positioner never finishes its first measurement inside dsh's page.
 */
import { type JSX, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ExternalLink, Layers2 } from 'lucide-react'
import { cn } from '@tracy/ui'
import { PopoverItem, PopoverLabel, PopoverSeparator } from '@tracy/core/site-tabs'
import { readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'

import { currentSiteKey } from './current-site'
import { siteNameFor, siteRowFor } from '@tracy/core/site-key'
import { roleLabelKey } from '@tracy/core/team'
import { otherOpenableSites } from './site-picker-rows'
import type { Translate } from './strings'

/** Distance kept from the chip, and from the edge of the viewport. */
const GAP = 4
const MARGIN = 8

/** The part of dsh's workspace list this menu reads. */
interface WorkspaceList {
  phase: string
  items: readonly { workspaceId: string; title: string }[]
}

/** An `/api/sites` row, as far as this menu reads it. */
interface PickerRow {
  siteKey: string
  /** The name the site is shown by; a rename changes it, never the key. */
  displayName?: string
  aliases?: string[]
  role: string | null
  status: string
  agent: string | null
}

/** What dsh hands the slot occupant, plus what `apply` injects. */
export interface SitePickerProps {
  open: boolean
  anchorRef?: RefObject<HTMLElement | null>
  selectedId?: string
  onPick: (workspaceId: string) => void
  onClose: () => void
  /** dsh's selector hook over the workspace list (a global standard prop of the slot). */
  useWorkspaces: <S>(selector: (state: WorkspaceList) => S) => S
  t: Translate
  /** Open the My Sites tab in the side card. */
  openMySites: () => void
}

/**
 * Open a site in its own browser tab, as a My Sites row does (`open` in `index.tsx`), and for the
 * same reasons: switching sites means another agent and another session tree, which a fresh page
 * builds at boot, and `noreferrer` cuts `window.opener`.
 */
function openSite(siteKey: string): void {
  window.open(`/${siteKey}`, '_blank', 'noreferrer')
}

export function SitePicker({
  open,
  anchorRef,
  selectedId,
  onPick,
  onClose,
  useWorkspaces,
  t,
  openMySites
}: SitePickerProps): JSX.Element | null {
  const workspaces = useWorkspaces((state) => state)
  const current = currentSiteKey()
  const [sites, setSites] = useState<PickerRow[] | null>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)

  // The seat book is read when the menu opens, not at boot: most sessions never open it, and a
  // list read at boot would be stale by the time someone does.
  useEffect(() => {
    if (!open) return
    let live = true
    void (async () => {
      const { status, body } = await readSites()
      if (!live) return
      const rows =
        status >= 200 && status < 300 ? ((body as { sites?: PickerRow[] } | null)?.sites ?? []) : []
      setSites(rows)
    })()
    return () => {
      live = false
    }
  }, [open])

  const measure = useCallback(() => {
    const chip = anchorRef?.current
    const box = panel.current
    if (!chip || !box) return
    const r = chip.getBoundingClientRect()
    const height = box.offsetHeight
    const width = box.offsetWidth
    const below =
      window.innerHeight - r.bottom >= height + GAP + MARGIN || window.innerHeight - r.bottom >= r.top
    const top = below ? r.bottom + GAP : Math.max(r.top - height - GAP, MARGIN)
    const left = Math.min(Math.max(r.left, MARGIN), Math.max(window.innerWidth - width - MARGIN, MARGIN))
    setPlace({ top, left })
  }, [anchorRef])

  // Before paint, and again when the list arrives and the panel grows.
  useLayoutEffect(() => {
    if (open) measure()
    else setPlace(null)
  }, [open, measure, sites])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return
      if (panel.current?.contains(event.target) === true) return
      // The chip toggles the menu itself; closing here as well would reopen it on the same press.
      if (anchorRef?.current?.contains(event.target) === true) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, onClose, anchorRef, measure])

  if (!open || typeof document === 'undefined') return null

  /** A role by its translated name, never the raw code; nothing for a word that is not a role. */
  const roleName = (raw: string | null): string | null => {
    const key = roleLabelKey(raw)
    return key === null ? null : t(key)
  }
  const role = roleName(siteRowFor(sites, current)?.role ?? null)
  const others = sites === null ? [] : otherOpenableSites(sites, current)

  const menu = (
    <div
      ref={panel}
      role="menu"
      aria-label={t('picker.label')}
      className={cn(
        'tracy-mysites fixed z-[2147483000] max-h-[min(70vh,32rem)] w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md',
        place === null && 'pointer-events-none opacity-0'
      )}
      style={{ top: place?.top ?? 0, left: place?.left ?? 0 }}
    >
      <PopoverLabel>{t('picker.label')}</PopoverLabel>
      {workspaces.items.map((w) => (
        <PopoverItem
          key={w.workspaceId}
          onClick={() => {
            onPick(w.workspaceId)
            onClose()
          }}
        >
          {/* The site's current name, not dsh's workspace title: that is the folder, named once
              by the site's key, and it kept a renamed site's old address (bug 03/10/2026). */}
          <span className="min-w-0 flex-1 truncate">
            {current !== null ? siteNameFor(sites, current) : w.title || w.workspaceId}
          </span>
          {role !== null && <span className="shrink-0 text-muted-foreground text-xs">{role}</span>}
          <Check
            className={cn('size-3.5 shrink-0', w.workspaceId !== selectedId && 'invisible')}
            aria-hidden="true"
          />
        </PopoverItem>
      ))}
      {others.map((s) => (
        <PopoverItem
          key={s.siteKey}
          onClick={() => {
            openSite(s.displayName || s.siteKey)
            onClose()
          }}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{s.displayName || s.siteKey}</span>
            <span className="text-muted-foreground text-xs">{t('picker.newTab')}</span>
          </span>
          {roleName(s.role) !== null && (
            <span className="shrink-0 text-muted-foreground text-xs">{roleName(s.role)}</span>
          )}
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PopoverItem>
      ))}
      {sites === null && <PopoverLabel>{t('picker.loading')}</PopoverLabel>}
      <PopoverSeparator />
      <PopoverItem
        onClick={() => {
          openMySites()
          onClose()
        }}
      >
        <Layers2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1">{t('picker.manage')}</span>
      </PopoverItem>
    </div>
  )
  return createPortal(menu, document.body)
}
