import {
  Avatar,
  AvatarFallback,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@tracy/ui'
import {
  Check,
  ChevronsUpDown,
  Grid2x2,
  Inbox,
  LayoutGrid,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Rocket,
  Settings,
  Sun,
  X
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { currentUser, sites, sitesInWorkspace, workspaces } from '../fixtures'
import { useShell } from './app-context'
import { PlatformGlyph } from './PlatformGlyph'

/* ---------- the kit's toolbar (not part of the product UI) ---------- */

function KitBar() {
  const { mode, setMode, dark, setDark } = useShell()
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/95 p-1 opacity-40 shadow-lg backdrop-blur transition-opacity hover:opacity-100">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={() => setMode(mode === 'desktop' ? 'web' : 'desktop')}
            />
          }
        >
          {mode === 'desktop' ? <Monitor /> : <Grid2x2 />}
        </TooltipTrigger>
        <TooltipContent>
          {mode === 'desktop' ? 'Desktop shell — click for web' : 'Web shell — click for desktop'}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setDark(!dark)} />
          }
        >
          {dark ? <Sun /> : <Moon />}
        </TooltipTrigger>
        <TooltipContent>Toggle theme</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="sm" className="rounded-full" render={<Link to="/" />}>
        Gallery
      </Button>
    </div>
  )
}

/* ---------- Chrome-style tabs — desktop ONLY (Electron owns the window shell) ---------- */

interface TabDef {
  id: string
  to: string
  /** tab is active when the pathname starts with this prefix */
  prefix: string
  title: string
  icon: ReactNode
}

const TAB_DEFS: TabDef[] = [
  ...sites.map((s) => ({
    id: s.key,
    to: `/workspace/${s.key}`,
    prefix: `/workspace/${s.key}`,
    title: s.name,
    icon: <PlatformGlyph platform={s.platform} className="size-4 text-[9px]" />
  })),
  {
    id: 'launchpad',
    to: '/launchpad',
    prefix: '/launchpad',
    title: 'Launchpad',
    icon: <Rocket className="size-3.5 text-muted-foreground" />
  },
  {
    id: 'home',
    to: '/home',
    prefix: '/home',
    title: 'Your workspace',
    icon: <LayoutGrid className="size-3.5 text-muted-foreground" />
  },
  {
    id: 'inbox',
    to: '/inbox',
    prefix: '/inbox',
    title: 'Inbox',
    icon: <Inbox className="size-3.5 text-muted-foreground" />
  },
  {
    id: 'add-site',
    to: '/add-site',
    prefix: '/add-site',
    title: 'Add site',
    icon: <Plus className="size-3.5 text-muted-foreground" />
  },
  {
    id: 'settings',
    to: '/settings/appearance',
    prefix: '/settings',
    title: 'Settings',
    icon: <Settings className="size-3.5 text-muted-foreground" />
  }
]

const tabForPath = (pathname: string) => TAB_DEFS.find((t) => pathname.startsWith(t.prefix))

function TrafficLights() {
  return (
    <div className="flex items-center gap-2 pl-4">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  )
}

function ChromeTabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const activeTab = tabForPath(pathname)
  // The user's open tabs — desktop has full control, each tab can be closed/opened.
  const [open, setOpen] = useState<string[]>(() => {
    const initial = ['joomlart.com', 'tracy.ai', 'launchpad', 'home']
    return activeTab && !initial.includes(activeTab.id) ? [...initial, activeTab.id] : initial
  })

  // Navigating to a page with no tab yet (from the rail, Gallery…) → a new tab opens, like Electron opening a window.
  useEffect(() => {
    if (activeTab && !open.includes(activeTab.id)) setOpen((o) => [...o, activeTab.id])
  }, [activeTab, open])

  function close(id: string) {
    const rest = open.filter((t) => t !== id)
    setOpen(rest)
    if (activeTab?.id === id) {
      const next = TAB_DEFS.find((t) => t.id === rest[rest.length - 1])
      navigate(next?.to ?? '/home')
    }
  }

  const openDefs = open.map((id) => TAB_DEFS.find((t) => t.id === id)).filter((t): t is TabDef => !!t)
  const recent = TAB_DEFS.filter((t) => !open.includes(t.id))

  return (
    <div className="flex h-10 flex-none items-end gap-0 bg-sidebar pr-3">
      <div className="flex h-full items-center">
        <TrafficLights />
      </div>
      <div className="ml-3 flex h-full min-w-0 flex-1 items-end gap-0">
        {openDefs.map((t, i) => {
          const active = activeTab?.id === t.id
          const prevActive = openDefs[i - 1] && activeTab?.id === openDefs[i - 1].id
          return (
            <div key={t.id} className="flex h-8 min-w-0 max-w-52 items-end">
              {/* Chrome-style divider between inactive tabs */}
              {i > 0 && !active && !prevActive ? (
                <span className="mb-2 h-4 w-px flex-none bg-border" />
              ) : null}
              <Link
                to={t.to}
                className={cn(
                  'group flex h-8 min-w-0 items-center gap-1.5 rounded-t-[10px] pr-1.5 pl-3 text-xs transition-colors',
                  active
                    ? 'bg-background font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                )}
              >
                <span className="flex-none">{t.icon}</span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <button
                  aria-label={`Close ${t.title}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    close(t.id)
                  }}
                  className={cn(
                    'flex size-4 flex-none items-center justify-center rounded-full transition-colors hover:bg-muted-foreground/20',
                    active ? '' : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  <X className="size-3" />
                </button>
              </Link>
            </div>
          )
        })}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="mb-1 ml-1 flex-none rounded-full"
                aria-label="New tab"
              />
            }
          >
            <Plus />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Recently closed</DropdownMenuLabel>
            {recent.length === 0 ? (
              <DropdownMenuItem disabled>Everything is open</DropdownMenuItem>
            ) : (
              recent.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => navigate(t.to)}>
                  {t.icon}
                  {t.title}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Open tabs</DropdownMenuLabel>
            {openDefs.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => navigate(t.to)}>
                {t.icon}
                {t.title}
                {activeTab?.id === t.id ? <Check className="ml-auto size-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

/* ---------- icon rail — IDENTICAL on web and desktop ---------- */

function RailButton({
  to,
  active,
  label,
  expanded,
  children
}: {
  to: string
  active?: boolean
  label: string
  expanded: boolean
  children: ReactNode
}) {
  if (expanded) {
    return (
      <Link
        to={to}
        className={cn(
          'flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors',
          active
            ? 'bg-muted font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <span className="flex w-5 flex-none justify-center">{children}</span>
        <span className="truncate">{label}</span>
      </Link>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={to}
            className={cn(
              'flex size-9 items-center justify-center rounded-lg transition-colors',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Workspace switcher — ported from shadcn-admin's team-switcher; Tracy switches workspace. */
function WorkspaceSwitcher({ expanded }: { expanded: boolean }) {
  const { workspaceId, setWorkspaceId } = useShell()
  const current = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          expanded ? (
            <button
              aria-label="Switch workspace"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-sm">
                {current.name[0]}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-semibold text-sm">{current.name}</span>
                <span className="truncate text-muted-foreground text-xs">{current.hint}</span>
              </span>
              <ChevronsUpDown className="size-3.5 flex-none text-muted-foreground" />
            </button>
          ) : (
            <button
              aria-label="Switch workspace"
              className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-sm outline-none transition-opacity hover:opacity-90 focus-visible:ring-1 focus-visible:ring-ring"
            >
              {current.name[0]}
            </button>
          )
        }
      />
      <DropdownMenuContent align="start" side="right" sideOffset={6} className="w-64">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-sm">
              {current.name[0]}
            </span>
            <div className="grid flex-1 leading-tight">
              <span className="truncate font-semibold">{current.name}</span>
              <span className="truncate text-muted-foreground text-xs">{current.hint}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Sitespaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => setWorkspaceId(w.id)}>
            <span className="flex size-6 flex-none items-center justify-center rounded-md border border-border font-semibold text-xs">
              {w.name[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{w.name}</span>
              <span className="block truncate text-muted-foreground text-xs">{w.hint}</span>
            </span>
            {w.id === current.id ? <Check className="size-3.5 flex-none" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus />
          Add workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function IconRail() {
  const { pathname } = useLocation()
  const { railExpanded, setRailExpanded, workspaceId } = useShell()
  const wsSites = sitesInWorkspace(workspaceId)
  const toggle = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={railExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="text-muted-foreground"
            onClick={() => setRailExpanded(!railExpanded)}
          />
        }
      >
        {railExpanded ? <PanelLeftClose /> : <PanelLeftOpen />}
      </TooltipTrigger>
      <TooltipContent side="right">{railExpanded ? 'Collapse' : 'Expand'}</TooltipContent>
    </Tooltip>
  )
  return (
    <div
      className={cn(
        'flex flex-none flex-col gap-1 border-border border-r bg-sidebar py-3 transition-[width] duration-150',
        railExpanded ? 'w-56 px-2' : 'w-13 items-center'
      )}
    >
      {railExpanded ? (
        // Expand: the collapse button sits RIGHT NEXT TO the workspace icon/name.
        <div className="mb-2 flex items-center gap-1">
          <WorkspaceSwitcher expanded />
          {toggle}
        </div>
      ) : (
        // Compact: the expand button sits RIGHT BELOW the workspace icon.
        <div className="mb-2 flex flex-col items-center gap-1">
          <WorkspaceSwitcher expanded={false} />
          {toggle}
        </div>
      )}
      <RailButton expanded={railExpanded} to="/home" active={pathname === '/home'} label="Your workspace">
        <MessageSquare className="size-4.5" />
      </RailButton>
      <RailButton
        expanded={railExpanded}
        to="/launchpad"
        active={pathname === '/launchpad'}
        label="Launchpad"
      >
        <LayoutGrid className="size-4.5" />
      </RailButton>
      <div className={cn('my-2 h-px bg-border', railExpanded ? 'mx-2' : 'w-6')} />
      {wsSites.map((s) => (
        <RailButton
          key={s.key}
          expanded={railExpanded}
          to={`/workspace/${s.key}`}
          active={pathname === `/workspace/${s.key}`}
          label={s.name}
        >
          <PlatformGlyph platform={s.platform} />
        </RailButton>
      ))}
      <RailButton expanded={railExpanded} to="/add-site" active={pathname === '/add-site'} label="Add site">
        <Plus className="size-4.5" />
      </RailButton>
      <div className="flex-1" />
      <RailButton expanded={railExpanded} to="/inbox" active={pathname === '/inbox'} label="Inbox">
        <span className="relative">
          <Inbox className="size-4.5" />
          <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary font-semibold text-[9px] text-primary-foreground">
            1
          </span>
        </span>
      </RailButton>
      {/* User avatar instead of a gear — user settings merged into system settings. */}
      <RailButton
        expanded={railExpanded}
        to="/settings/account"
        active={pathname.startsWith('/settings')}
        label="Settings"
      >
        <Avatar className={railExpanded ? 'size-5' : 'size-7'}>
          <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
            {currentUser.name[0]}
          </AvatarFallback>
        </Avatar>
      </RailButton>
    </div>
  )
}

/* ---------- Frame: one view, two shells ----------
   The rail is identical on web/desktop. The ONLY difference is tabs:
   - desktop (Electron owns the window shell): Chrome-style tab bar, close/open + recent tabs;
   - web (cannot control the browser's tabs): no tab bar — the page being viewed is
     the last opened page when the user goes to cowork.tracy.ai. */

export function App({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { mode } = useShell()
  if (bare) {
    // A view that stands alone (auth…) — no shell, only KitBar.
    return (
      <div className="flex h-full flex-col bg-background text-foreground text-sm">
        <div className="min-h-0 flex-1">{children}</div>
        <KitBar />
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col bg-background text-foreground text-sm">
      {mode === 'desktop' ? <ChromeTabBar /> : null}
      <div className="flex min-h-0 flex-1">
        <IconRail />
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
      <KitBar />
    </div>
  )
}
