import { Badge, Button, Card, CardContent, Switch } from '@tracy/ui'
import { Plug, Plus } from 'lucide-react'

import { mcpServers } from '../../fixtures'
import { SettingsPage } from './SettingsLayout'

export function Mcp() {
  return (
    <SettingsPage>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-lg tracking-tight">MCP</h1>
          <p className="mt-0.5 text-muted-foreground text-sm">Servers the agent can reach on every site.</p>
        </div>
        <Button>
          <Plus />
          Add server
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {mcpServers.map((s) => (
          <Card key={s.name}>
            <CardContent className="flex items-center gap-3 py-3">
              <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted">
                <Plug className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{s.name}</span>
                  {s.builtIn ? <Badge variant="outline">Built-in</Badge> : null}
                  <Badge variant={s.status === 'Connected' ? 'secondary' : 'destructive'}>{s.status}</Badge>
                </div>
                <p className="mt-0.5 truncate text-muted-foreground text-xs">{s.description}</p>
              </div>
              {s.status === 'Needs re-connect' ? (
                <Button variant="outline" size="sm">
                  Re-connect
                </Button>
              ) : null}
              <Switch defaultChecked={s.status === 'Connected'} disabled={s.builtIn} />
            </CardContent>
          </Card>
        ))}
      </div>
    </SettingsPage>
  )
}
