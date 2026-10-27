import { Badge, Card, CardContent, cn } from '@tracy/ui'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { views, type ViewDef } from '../views'

const GROUPS: ViewDef['group'][] = [
  'Site & Inbox',
  'Home & Launchpad',
  'Auth & onboarding',
  'Settings',
  'Site settings'
]

/** A route with a param opens with the first site as the sample. */
function samplePath(path: string) {
  return path.replace(':siteKey', 'joomlart.com')
}

export function Gallery() {
  const built = views.filter((v) => v.status === 'built').length
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <p className="font-semibold text-primary text-xs uppercase tracking-widest">Tracy Cowork</p>
        <h1 className="mt-1 font-semibold text-2xl tracking-tight">UI Kit — every view, one code</h1>
        <p className="mt-2 max-w-lg text-muted-foreground text-sm">
          UI-only mockups for the Cowork product, web and desktop, built on{' '}
          <code className="text-foreground">@tracy/ui</code>. Use the floating switch on any view to flip
          between the web and desktop shell. {built}/{views.length} views built.
        </p>

        {GROUPS.map((group) => {
          const items = views.filter((v) => v.group === group)
          if (items.length === 0) return null
          return (
            <section key={group} className="mt-10">
              <h2 className="font-semibold text-muted-foreground text-sm tracking-tight">{group}</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((v) => (
                  <Card
                    key={v.path}
                    className={cn(
                      'transition-colors',
                      v.status === 'built' ? 'hover:ring-primary/50' : 'opacity-70'
                    )}
                  >
                    <CardContent className="py-3">
                      <Link to={samplePath(v.path)} className="group flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-sm group-hover:text-primary">
                              {v.title}
                            </span>
                            <ArrowUpRight className="size-3.5 flex-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                          {v.note ? (
                            <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">{v.note}</p>
                          ) : null}
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">{v.path}</p>
                        </div>
                        <Badge variant={v.status === 'built' ? 'default' : 'outline'} className="flex-none">
                          {v.status === 'built' ? 'Built' : 'Planned'}
                        </Badge>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
