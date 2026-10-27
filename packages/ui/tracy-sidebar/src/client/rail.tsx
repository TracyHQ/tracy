import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
/**
 * The left column, ported from `Rail` in packages/dev/tracy-design/src/pages/shell/index.tsx.
 *
 * Same geometry as dsh's own column (measured there and here): 280px wide / 56px rail, a 60px
 * logo row, a 38px New session button, the browsing region filling the middle, a footer with the
 * Settings trigger. What changes is the material: `@tracy/ui` Button on the Tracy tokens instead
 * of dsh's CSS module, and the session tree (still dsh's, mounted through `sidebar.workspaces`)
 * restyled by the CSS in styles.ts.
 *
 * The five child slots dsh declared keep its contracts exactly — `sidebar.brand.mark` gets `{ size }`,
 * `sidebar.workspaces` gets `{ wide, expandSidebar }`, the footer pair get `{ wide }` — so every
 * occupant dsh or Tracy already registers (brand, workspace tree, Settings trigger, footer
 * actions) lands here unchanged. A sixth, `sidebar.nav`, is Tracy's own: a list of rows below New
 * session (`{ wide }`), so a Tracy plugin can add an entry there (the Inbox, spec #809) through
 * `slots.inject` instead of editing this column.
 */
import type { ReactNode } from 'react'
import { PanelLeft, SquarePen } from 'lucide-react'
import { Button, cn } from '@tracy/ui'
import { uiSwitches } from '@tracy/core/ui-switches'
import type { SidebarKey } from './strings'
import { OtherSites, basePathname, showSite } from './other-sites'
import { inCreationWorkspace } from './sites.mjs'

type Slot =
  | 'sidebar.brand.mark'
  | 'sidebar.brand.name'
  | 'sidebar.workspaces'
  | 'sidebar.settings'
  | 'sidebar.footer.action'
  | 'sidebar.nav'

export interface RailProps {
  /** Owner params from ui-layout: whether the column is a rail, and its wide width in px. */
  collapsed: boolean
  width: number
  /** Injected by the plugin body. */
  startSession: () => void
  toggleSidebar: () => void
  t: (key: SidebarKey) => string
  renderSlot: (name: Slot, params: Record<string, unknown>, options?: { fallback?: ReactNode }) => ReactNode
}

/**
 * The session column opens closed (Lee, 06/09 18:3x: it takes room the customer came for the site
 * with). ui-layout's store is transient — every page load starts at SIDEBAR_DEFAULT (280 px) and
 * nothing persists the toggle — so the first Rail of a page closes it once, through the same
 * `toggleSidebar` the collapse button uses. Narrow viewports arrive collapsed already and are left
 * alone; the flag is per page, so a reload closes it again and a later click by the customer holds.
 */
let closedOnce = false

/**
 * The request a New session press fires (measured on production 08/09: `/api/subagents/list`,
 * 1014ms). Kept wide on purpose — any dsh API call that starts after the press and finishes means
 * the server answered, and matching the exact path would turn a rename in vendor into a button
 * that stays dimmed for the full timeout.
 */
const SETTLE_PATTERN = /\/api\//
/** Ceiling on the dim, for when nothing observable comes back. Above the 1014ms measured. */
const SETTLE_TIMEOUT_MS = 4000

/**
 * Whether an operator left a piece of this column on (/ops › User Interface), re-read once the
 * door answers. Defaults apply until then, so nothing flashes in and out.
 */
function useShown(id: string): boolean {
  const ui = uiSwitches()
  return useSyncExternalStore(ui.subscribe, () => ui.isShown(id))
}

export function Rail({ collapsed, width, startSession, toggleSidebar, t, renderSlot }: RailProps) {
  /**
   * Pressing New session looks broken for a second, and this is what fixes the LOOK of it.
   *
   * Measured on production 08/09: a press fires one request, `/api/subagents/list`, and it runs
   * for 1014ms while nothing on the column moves. So the wait is the server answering, not
   * anything drawn here, and shortening it means changing `startSession` in dsh's `ui-workspace`
   * (vendor, LAW #5).
   *
   * What a press can do immediately is say it landed: the button dims and stops accepting a
   * second press. What people call "it lagged" is usually "I could not tell it heard me".
   *
   * The flag clears when the session actually arrives, and the arrival is measurable without
   * dsh's help: the request the press fired shows up as a PerformanceResourceTiming entry the
   * moment it completes, the same seam the boot cover reads in tracy-brand. `buffered: true`
   * covers the fast case where it finished before the observer registered, and the startTime
   * filter throws away everything the page did before the press.
   *
   * The timer is a floor, not the mechanism: browsers without PerformanceObserver, and a dsh that
   * one day answers over the socket instead, both land there. It exists so the button can never
   * sit dimmed forever — which is exactly what the earlier clear-on-unmount version did, because
   * Rail is the persistent left column and never unmounts.
   */
  const [starting, setStarting] = useState(false)
  const [press, setPress] = useState(0)
  const pressAt = useRef(0)
  useEffect(() => {
    if (!press) return
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setStarting(false)
    }
    const timer = window.setTimeout(finish, SETTLE_TIMEOUT_MS)
    let observer: PerformanceObserver | undefined
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.startTime >= pressAt.current && SETTLE_PATTERN.test(entry.name)) return finish()
        }
      })
      observer.observe({ type: 'resource', buffered: true })
    } catch {
      // No PerformanceObserver on this browser: the timer above is the whole mechanism.
    }
    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [press])
  const onStartSession = () => {
    if (starting) return
    pressAt.current = performance.now()
    setStarting(true)
    setPress((n) => n + 1)
    startSession()
  }

  const wide = !collapsed
  const showTree = useShown('workspace-tree')
  const showOtherSites = useShown('other-sites')
  const showSettings = useShown('settings-button')
  useEffect(() => {
    if (closedOnce) return
    closedOnce = true
    if (!collapsed) toggleSidebar()
    // Once per page, on the first mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className={cn(
        'tsb-root flex h-full shrink-0 flex-col border-border border-e text-sidebar-foreground',
        wide ? '' : 'tsb-rail w-14'
      )}
      style={wide ? { width } : undefined}
    >
      {/* 44px — the macOS desktop app's traffic lights sit here, so the column starts below them.
          The strip drags the window (dsh's one rule, `[data-window-drag]`); hidden everywhere but the
          darwin window, and in fullscreen, where the lights are gone. Cherry Studio's rail does the same. */}
      <div className="tsb-window-strip shrink-0" data-window-drag aria-hidden="true" />
      {/* 60px — logo row. Wide: mark + name (the pair doubles as a New session shortcut, as in
          dsh) and the collapse toggle. Rail: the mark alone is the expand toggle. */}
      <div className={cn('flex h-15 shrink-0 items-center gap-2', wide ? 'px-3' : 'justify-center px-0')}>
        {wide ? (
          <>
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent p-0 text-start text-inherit text-sm"
              aria-label={t('session.new')}
              onClick={onStartSession}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                {renderSlot('sidebar.brand.mark', { size: 22 })}
              </span>
              {/* flex + items-center, not the default baseline: the brand name is drawn as an SVG
                  wordmark, and an SVG has no baseline to sit on, so an inline box lifts it by the
                  descender space it reserves. Measured on dsh 05/09: the mark and the collapse
                  toggle centred at 30px while Tracy and Cowork sat at 27.5. */}
              <span className="flex min-w-0 flex-1 items-center overflow-hidden">
                {renderSlot('sidebar.brand.name', {})}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={toggleSidebar}
              aria-label={t('toggle.collapse')}
            >
              <PanelLeft />
            </Button>
          </>
        ) : (
          // On Windows this button moves into the window's caption row (styles.ts `.tsb-rail-open`).
          <Button
            variant="ghost"
            size="icon"
            className="tsb-rail-open size-9"
            onClick={toggleSidebar}
            aria-label={t('toggle.open')}
          >
            <span className="flex size-6 items-center justify-center">
              {renderSlot('sidebar.brand.mark', { size: 22 })}
            </span>
          </Button>
        )}
      </div>

      {/* 38px — New session. Its fill and radius come from styles.ts, not from a token: see the
          `tsb-new-session` block there for why `secondary` alone leaves it invisible on light. */}
      <div className={cn('shrink-0', wide ? 'px-3' : 'flex justify-center')}>
        <Button
          variant="secondary"
          className={cn(
            'tsb-new-session gap-2 transition-opacity',
            starting && 'pointer-events-none opacity-60',
            wide ? 'h-9.5 w-full justify-center' : 'size-9'
          )}
          onClick={onStartSession}
          aria-busy={starting}
          aria-label={t('session.new')}
        >
          <SquarePen />
          {wide ? t('session.new') : null}
        </Button>
      </div>

      {/* Tracy's own rows right below New session (`sidebar.nav`, declared in index.tsx): the Inbox
          of @tracy/dsh-inbox today. A list slot, so a plugin adds a row without editing this file;
          each occupant draws itself for both widths from `{ wide }`. */}
      <div className={cn('shrink-0', wide ? 'px-3' : 'flex flex-col items-center')}>
        {renderSlot('sidebar.nav', { wide })}
      </div>

      {/* The browsing region: dsh's workspace tree, header and session list, restyled — then every
          other site the viewer holds (one workspace per site, 15/09/2026). The creation workspace
          (`/new/`) opens on no site, so its personal workspace is not listed: only the sites. */}
      {/* Pressing the open workspace's row, or one of its sessions, shows its site in the side card
          (no page load; the tree still does its own toggle and session switch underneath). Capture,
          so dsh's own handlers are left untouched. */}
      <div
        className={cn('flex min-h-0 flex-1 flex-col', wide ? 'mt-2 px-2' : 'mt-3 items-center')}
        onClickCapture={(event) => {
          const target = event.target as Element | null
          if (
            target?.closest?.(
              '[data-slot="sidebar.workspaces"] :is([class*="projectRow"], [class*="sessionRow"])'
            )
          )
            showSite()
        }}
      >
        {!showTree ? null : inCreationWorkspace(basePathname()) ? (
          wide ? (
            <div className="px-2 py-1 text-muted-foreground text-sm">{t('workspaces.title')}</div>
          ) : null
        ) : (
          renderSlot('sidebar.workspaces', {
            wide,
            expandSidebar: () => {
              if (collapsed) toggleSidebar()
            }
          })
        )}
        {wide && showOtherSites ? (
          <OtherSites className="mt-1 min-h-0 shrink overflow-y-auto" openLabel={t('workspaces.open')} />
        ) : null}
      </div>

      {/* Footer: extra actions above the Settings trigger, both in either width. */}
      <div className={cn('shrink-0 p-2', !wide && 'flex flex-col items-center')}>
        <div className={cn('flex flex-col gap-1', wide ? '' : 'items-center')}>
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        {showSettings ? renderSlot('sidebar.settings', { wide }) : null}
      </div>
    </div>
  )
}
