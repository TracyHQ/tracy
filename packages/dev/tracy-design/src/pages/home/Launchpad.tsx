import { Badge, Button, Card, CardContent } from '@tracy/ui'
import { ExternalLink, ListTodo, MessageSquarePlus, ScanSearch } from 'lucide-react'
import { Link } from 'react-router-dom'

import { sitesInWorkspace, tasks } from '../../fixtures'
import { useShell } from '../../app/app-context'
import { PlatformGlyph } from '../../app/PlatformGlyph'

export function Launchpad() {
  const { workspaceId } = useShell()
  const sites = sitesInWorkspace(workspaceId)
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="font-semibold text-lg tracking-tight">Launchpad</h1>
        <p className="mt-1 text-muted-foreground text-sm">Pick up where each site left off.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {sites.map((site, i) => (
            <Card key={site.key}>
              <CardContent className="py-4">
                <div className="flex items-center gap-2.5">
                  <PlatformGlyph platform={site.platform} className="size-7 text-xs" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-sm">{site.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    render={<Link to={`/workspace/${site.key}`} aria-label="Open workspace" />}
                  >
                    <ExternalLink />
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {tasks.slice(i, i + 2).map((t) => (
                    <Link
                      key={t.id}
                      to={`/workspace/${site.key}`}
                      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs transition-colors hover:bg-muted/60"
                    >
                      <ListTodo className="size-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.pending ? <Badge variant="secondary">Pending</Badge> : null}
                    </Link>
                  ))}
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Button variant="outline" size="xs" render={<Link to={`/workspace/${site.key}`} />}>
                    <MessageSquarePlus />
                    New task
                  </Button>
                  <Button variant="outline" size="xs">
                    <ScanSearch />
                    Scan now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
