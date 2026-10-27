import { Badge, Button, Card, CardContent } from '@tracy/ui'
import { ArrowUpCircle, Search, Upload, Wrench } from 'lucide-react'

import { skills } from '../../fixtures'
import { SettingsPage } from './SettingsLayout'

export function SkillsPage() {
  return (
    <SettingsPage>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-lg tracking-tight">Skills</h1>
          <p className="mt-0.5 text-muted-foreground text-sm">Instructions your team uses on its sites.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Search />
            Browse registry
          </Button>
          <Button variant="outline">
            <Upload />
            Install from ZIP
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {skills.map((s) => (
          <Card key={s.name}>
            <CardContent className="flex items-center gap-3 py-3">
              <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted">
                <Wrench className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{s.name}</span>
                  <Badge variant="outline">v{s.version}</Badge>
                </div>
                <p className="mt-0.5 truncate text-muted-foreground text-xs">
                  {s.origin} · {s.updated}
                </p>
              </div>
              {s.updated === 'Update available' ? (
                <Button size="sm" variant="outline">
                  <ArrowUpCircle />
                  Update
                </Button>
              ) : null}
              <Button size="sm" variant="ghost">
                View source
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </SettingsPage>
  )
}
