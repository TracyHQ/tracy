import { cn } from '@tracy/ui'
import { Database, Github, Info, Palette, Plug, ScanSearch, SlidersHorizontal, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { sites } from '../../../fixtures'

const TABS: { title?: string; items: { slug: string; label: string; icon: ReactNode }[] }[] = [
  {
    items: [
      { slug: 'general', label: 'General', icon: <Info /> },
      { slug: 'reskins', label: 'Reskins', icon: <Palette /> }
    ]
  },
  {
    title: 'Your team',
    items: [
      { slug: 'github', label: 'GitHub', icon: <Github /> },
      { slug: 'mcp', label: 'MCP', icon: <Plug /> },
      { slug: 'skills', label: 'Skills', icon: <Wrench /> }
    ]
  },
  {
    title: 'Data & scanning',
    items: [
      { slug: 'connection', label: 'Connection', icon: <Plug /> },
      { slug: 'data-sources', label: 'Data sources', icon: <Database /> },
      { slug: 'scans', label: 'Scans', icon: <ScanSearch /> }
    ]
  },
  {
    title: 'Advanced',
    items: [{ slug: 'advanced', label: 'Advanced', icon: <SlidersHorizontal /> }]
  }
]

export function SiteSettingsShell({ children }: { children: ReactNode }) {
  const { siteKey } = useParams()
  const { pathname } = useLocation()
  const site = sites.find((s) => s.key === siteKey) ?? sites[0]
  return (
    <div className="flex h-full min-w-0">
      <div className="w-52 flex-none overflow-auto border-border border-r">
        <div className="flex h-11 items-center px-4">
          <span className="truncate font-semibold text-sm tracking-tight">{site.name}</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 pb-4">
          {TABS.map((g, gi) => (
            <div key={g.title ?? gi} className="mb-1">
              {g.title ? (
                <p className="px-2 pt-3 pb-1 font-medium text-[11px] text-muted-foreground tracking-wide">
                  {g.title}
                </p>
              ) : null}
              {g.items.map((it) => {
                const to = `/settings/site/${site.key}/${it.slug}`
                const active = pathname === to
                return (
                  <Link
                    key={it.slug}
                    to={to}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground',
                      active ? 'bg-muted font-medium text-foreground' : 'text-foreground/80 hover:bg-muted/60'
                    )}
                  >
                    {it.icon}
                    {it.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}
