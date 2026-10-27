import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea
} from '@tracy/ui'
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  Cloud,
  Command,
  CreditCard,
  Info,
  LogOut,
  Package,
  Palette,
  Plug,
  Radio,
  Search,
  Settings2,
  Wrench
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { sitesInWorkspace } from '../../fixtures'
import { useShell } from '../../app/app-context'
import { PlatformGlyph } from '../../app/PlatformGlyph'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

const buildGroups = (workspaceId: string): { title?: string; items: NavItem[]; user?: boolean }[] => [
  {
    // User settings merged in here — opened from the avatar at the bottom of the rail.
    title: 'User settings',
    user: true,
    items: [
      { to: '/settings/account', label: 'Account', icon: <BadgeCheck /> },
      { to: '/settings/billing', label: 'Billing', icon: <CreditCard /> },
      { to: '/settings/notifications', label: 'Notifications', icon: <Bell /> }
    ]
  },
  {
    items: [
      { to: '/settings/model-provider', label: 'Model Provider', icon: <Cloud /> },
      { to: '/settings/default-model', label: 'Default Model', icon: <Package /> }
    ]
  },
  {
    title: 'Tools',
    items: [
      { to: '/settings/mcp', label: 'MCP', icon: <Plug /> },
      { to: '/settings/skills', label: 'Skills', icon: <Wrench /> },
      { to: '/settings/web-search', label: 'Web Search', icon: <Search /> }
    ]
  },
  {
    title: 'Sites',
    items: sitesInWorkspace(workspaceId).map((s) => ({
      to: `/settings/site/${s.key}/general`,
      label: s.name,
      icon: <PlatformGlyph platform={s.platform} className="size-4 text-[9px]" />
    }))
  },
  {
    title: 'Preferences',
    items: [{ to: '/settings/appearance', label: 'Appearance', icon: <Palette /> }]
  },
  {
    title: 'Efficiency',
    items: [
      { to: '/settings/channels', label: 'Channels', icon: <Radio /> },
      { to: '/settings/scheduled-tasks', label: 'Scheduled Tasks', icon: <CalendarClock /> },
      { to: '/settings/shortcuts', label: 'Keyboard Shortcuts', icon: <Command /> }
    ]
  },
  {
    title: 'System',
    items: [
      { to: '/settings/system', label: 'System', icon: <Settings2 /> },
      { to: '/settings/about', label: 'About & Feedback', icon: <Info /> }
    ]
  }
]

export function SettingsLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { workspaceId } = useShell()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const groups = buildGroups(workspaceId)
  return (
    <div className="flex h-full min-w-0">
      <div className="flex w-60 flex-none flex-col border-border border-r bg-sidebar">
        <div className="flex h-11 flex-none items-center px-4">
          <span className="font-semibold text-sm tracking-tight">Settings</span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="flex flex-col gap-0.5 px-2 pb-4">
            {groups.map((g, gi) => (
              <div key={g.title ?? gi} className="mb-1">
                {g.title ? (
                  <p className="px-2 pt-3 pb-1 font-medium text-[11px] text-muted-foreground tracking-wide">
                    {g.title}
                  </p>
                ) : null}
                {g.items.map((it) => {
                  const active = it.to.startsWith('/settings/site/')
                    ? pathname.startsWith(it.to.replace(/\/general$/, ''))
                    : pathname === it.to
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground',
                        active
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-foreground/80 hover:bg-muted/60'
                      )}
                    >
                      {it.icon}
                      <span className="truncate">{it.label}</span>
                    </Link>
                  )
                })}
                {g.user ? (
                  <button
                    onClick={() => setConfirmSignOut(true)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-destructive text-sm transition-colors hover:bg-destructive/10 [&_svg]:size-4"
                  >
                    <LogOut />
                    Sign out
                  </button>
                ) : null}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-background">{children}</div>

      <Dialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <DialogContent closeLabel="Close">
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out? You’ll need your seat’s email to get back in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton closeLabel="Close">
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmSignOut(false)
                navigate('/auth/sign-in')
              }}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Standard content block of a settings page: group title + a card holding the rows. */
export function SettingsSection({
  title,
  badge,
  children
}: {
  title: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-border border-b px-5 py-3.5">
        <h2 className="font-semibold text-sm tracking-tight">{title}</h2>
        {badge}
      </div>
      <div className="divide-y divide-border px-5">{children}</div>
    </section>
  )
}

export function SettingsRow({
  label,
  hint,
  children
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-13 items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint ? <div className="mt-0.5 text-muted-foreground text-xs">{hint}</div> : null}
      </div>
      <div className="flex flex-none items-center gap-2">{children}</div>
    </div>
  )
}

export function SettingsPage({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-6">
      {title ? <h1 className="font-semibold text-lg tracking-tight">{title}</h1> : null}
      {children}
    </div>
  )
}
