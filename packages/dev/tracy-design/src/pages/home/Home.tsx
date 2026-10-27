import { Badge, Button, Card, CardContent, CardDescription, CardTitle } from '@tracy/ui'
import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { sitesInWorkspace } from '../../fixtures'
import { useShell } from '../../app/app-context'
import { PlatformGlyph } from '../../app/PlatformGlyph'

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  editor: 'Editor'
}

export function Home() {
  const { workspaceId } = useShell()
  const sites = sitesInWorkspace(workspaceId)
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">Your sites</h1>
            <p className="mt-1 text-muted-foreground text-sm">Choose a site to work on with its agent.</p>
          </div>
          <Button variant="outline" render={<Link to="/add-site" />}>
            <Plus />
            Add site
          </Button>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {sites.map((site) => (
            <Card key={site.key} className="transition-colors hover:ring-primary/50">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformGlyph platform={site.platform} className="size-8 text-xs" />
                  <div className="min-w-0">
                    <CardTitle className="truncate">{site.name}</CardTitle>
                    <CardDescription className="truncate">Working on this site</CardDescription>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Badge variant={site.role === 'owner' ? 'default' : 'outline'}>
                    {ROLE_LABEL[site.role]}
                  </Badge>
                  <Button size="sm" render={<Link to={`/workspace/${site.key}`} />}>
                    Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <CardTitle className="truncate">ghostblog.org</CardTitle>
                <CardDescription className="truncate">Invited by Mai</CardDescription>
              </div>
              <div className="flex flex-none items-center gap-2">
                <Badge variant="secondary">Invite</Badge>
                <Button size="sm" variant="outline">
                  Accept
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <CardTitle className="truncate">shop.example.com</CardTitle>
                <CardDescription className="truncate">
                  Waiting for an admin to approve your request
                </CardDescription>
              </div>
              <Badge variant="outline">Requested</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
