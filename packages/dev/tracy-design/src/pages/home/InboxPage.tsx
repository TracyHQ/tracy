import { Avatar, AvatarFallback, Badge, Button, Card, CardContent } from '@tracy/ui'
import { Bell } from 'lucide-react'

export function InboxPage() {
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <h1 className="font-semibold text-lg tracking-tight">Inbox</h1>
        <p className="mt-1 text-muted-foreground text-sm">Things that need you across your sites.</p>

        <div className="mt-6 flex flex-col gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-3">
              <Avatar>
                <AvatarFallback className="bg-primary/15 text-primary">T</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">jordanjoiner@example.com</span> asked to join{' '}
                  <span className="font-medium">joomlart.com</span> as <Badge variant="outline">Admin</Badge>
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs">3 hours ago</p>
              </div>
              <div className="flex flex-none gap-1.5">
                <Button size="sm">Approve</Button>
                <Button size="sm" variant="ghost">
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 py-3">
              <span className="flex size-8 flex-none items-center justify-center rounded-full bg-muted">
                <Bell className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  Nightly Sync on <span className="font-medium">tracy.ai</span> found 2 new issues.
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs">Last night</p>
              </div>
              <Button size="sm" variant="outline" className="flex-none">
                View scan
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
