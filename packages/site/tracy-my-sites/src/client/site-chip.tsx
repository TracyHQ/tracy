/**
 * The site chip at the top left of the chat column (start screen Case 2, Akemi 01/10/2026): the
 * site's CMS logo, its name and a chevron, in dsh's `conversation.header.leading` slot, which dsh
 * draws before the session title in every state, a blank session's included. A press opens the
 * same menu the hero's workspace chip opened (`SitePicker`: this site, every other site the viewer
 * can open, Manage sites), now that the hero row is gone from a site's start screen.
 *
 * It names the SITE, not the session: the conversation's own title stays in the sidebar list, and
 * the header no longer repeats it while the conversation is a single one (the subagent breadcrumb
 * `parent / child` still shows, see `HEADER_CSS`). The platform is shown here and only here, so the
 * composer carries no platform chip.
 *
 * Only on a site's workspace: the creation workspace (`/new/`) has no site to name.
 */
import { type JSX, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'
import { CmsCell } from './cms'
import { watchHeaderRoom } from './header-room'
import { currentSiteKey } from './current-site'
import { SitePicker, type SitePickerProps } from './site-picker'
import type { Translate } from './strings'

/** An `/api/sites` row, as far as the chip reads it. */
interface ChipRow {
  siteKey: string
  displayName?: string | null
  aliases?: string[]
  platform?: string | null
}

/** The workspace list the picker reads when dsh hands the slot none. */
const NO_WORKSPACES = { phase: 'ready', items: [] as { workspaceId: string; title: string }[] }

/** @returns the site this page is the workspace of, or null on the creation workspace. */
export function chipSiteKey(): string | null {
  try {
    if (['/new/', '/widget/native/'].includes(new URL(document.baseURI).pathname)) return null
  } catch {
    return null
  }
  return currentSiteKey()
}

/**
 * The name the chip shows: the seat book's display name when somebody gave the site one, else the
 * first label of its address (`kineticakemi` for `kineticakemi.tracy.site`). The full address is the
 * start screen's subtitle and the chip's tooltip.
 */
export function chipName(siteKey: string, displayName: string | null | undefined): string {
  const named = displayName?.trim()
  if (named && named !== siteKey) return named
  return siteKey.split('.')[0] || siteKey
}

export interface SiteChipProps {
  t: Translate
  openMySites: () => void
  /** dsh's selector hook over the workspace list, when the slot hands one. */
  useWorkspaces?: SitePickerProps['useWorkspaces']
}

export function SiteChip({ t, openMySites, useWorkspaces }: SiteChipProps): JSX.Element | null {
  const siteKey = chipSiteKey()
  const [row, setRow] = useState<ChipRow | null>(null)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (siteKey === null) return
    let live = true
    void readSites().then(({ status, body }) => {
      if (!live || status < 200 || status >= 300) return
      const rows = (body as { sites?: ChipRow[] } | null)?.sites ?? []
      setRow(rows.find((r) => r.siteKey === siteKey || (r.aliases ?? []).includes(siteKey)) ?? null)
    })
    return () => {
      live = false
    }
  }, [siteKey])

  // The chip gives way first when the header is narrow, so the header's own controls stay in view.
  useEffect(() => (anchor.current ? watchHeaderRoom(anchor.current) : undefined), [siteKey])

  const workspaces = useWorkspaces ?? ((select) => select(NO_WORKSPACES))
  // This page serves one site, so its workspace rows are all this site: the first one is ticked.
  const selectedId = workspaces((state) => state.items[0]?.workspaceId)
  if (siteKey === null) return null
  return (
    <span className="tracy-mysites tracy-site-chip-root">
      <button
        ref={anchor}
        type="button"
        className="tracy-site-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('picker.label')}
        title={siteKey}
        onClick={() => setOpen((v) => !v)}
      >
        {row?.platform ? <CmsCell platform={row.platform} /> : null}
        <span className="tracy-site-chip-name">{chipName(siteKey, row?.displayName)}</span>
        <ChevronDown className="tracy-site-chip-chevron" aria-hidden="true" />
      </button>
      <SitePicker
        open={open}
        anchorRef={anchor}
        selectedId={selectedId}
        onPick={() => setOpen(false)}
        onClose={() => setOpen(false)}
        useWorkspaces={workspaces}
        t={t}
        openMySites={openMySites}
      />
    </span>
  )
}

/**
 * The chip's look, and the session title it stands in for. Plain CSS (mode B, no backtick inside):
 * the chip is a 32px row with 8px corners and no border, its name 14px semibold, a 16px logo and a
 * 12px chevron; hover brightens it (the text colour mixed into the background), keyboard focus is
 * one --ring stroke. Its width stops at --tracy-site-chip-max (header-room.ts), the header's width less
 * what its own controls need, so the name truncates before those controls leave the column. While the chip is in the header, a session title that is a single crumb is not
 * drawn: the chip names where the person is. A subagent's breadcrumb (it has a separator) stays.
 */
export const HEADER_CSS = `
.tracy-site-chip-root { display: inline-flex; min-width: 0; }
.tracy-site-chip {
  display: inline-flex; align-items: center; gap: 7px; min-width: 0; max-width: min(260px, var(--tracy-site-chip-max, 260px));
  height: 32px; margin-left: -8px; padding: 0 8px; box-sizing: border-box;
  border: 0; border-radius: 8px; background: transparent; color: var(--foreground, #172026);
  font: inherit; font-size: 14px; font-weight: 600; line-height: 1; cursor: pointer;
  transition: background-color .12s;
}
.tracy-site-chip:hover { background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); }
.tracy-site-chip:focus { outline: none; }
.tracy-site-chip:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }
.tracy-site-chip-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-site-chip-chevron { width: 12px; height: 12px; flex: none; color: var(--muted-foreground, #6b7280); }
header:has(.tracy-site-chip) nav[class*="_crumbs"]:not(:has([class*="_crumbSep"])) { display: none; }
`
