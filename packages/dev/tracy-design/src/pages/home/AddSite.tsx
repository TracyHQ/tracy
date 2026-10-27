import { Badge, Button, Card, CardContent, cn, Input, Label } from '@tracy/ui'
import { ArrowRight, CheckCircle2, Circle, Globe, Loader2 } from 'lucide-react'
import { useState } from 'react'

const STEPS = ['Your site', 'Admin login', 'Setting up'] as const

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full font-semibold text-[10px]',
              i < step
                ? 'bg-primary text-primary-foreground'
                : i === step
                  ? 'border-2 border-primary text-primary'
                  : 'border border-border text-muted-foreground'
            )}
          >
            {i + 1}
          </span>
          <span
            className={cn('text-xs', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}
          >
            {label}
          </span>
          {i < STEPS.length - 1 ? <span className="h-px w-8 bg-border" /> : null}
        </div>
      ))}
    </div>
  )
}

const PROGRESS = [
  { label: 'Creating site repository', done: true },
  { label: 'Installing Joomla', done: true },
  { label: 'Connecting your address', done: false, active: true },
  { label: 'Connecting the agent', done: false },
  { label: 'Saving the starting point', done: false }
]

export function AddSite() {
  const [step, setStep] = useState(0)
  return (
    <div className="flex h-full items-start justify-center overflow-auto bg-muted/30 p-6">
      <div className="w-full max-w-md pt-10">
        <StepDots step={step} />
        <Card className="mt-6">
          {step === 0 ? (
            <CardContent className="flex flex-col gap-4 py-5">
              <div>
                <h1 className="font-semibold text-base tracking-tight">Add a site</h1>
                <p className="mt-1 text-muted-foreground text-sm">
                  Import a site you already run, or create a new one.
                </p>
              </div>
              <div>
                <Label htmlFor="site-url">Your site URL</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="site-url"
                    placeholder="yoursite.com"
                    defaultValue="joomlart.com"
                    className="flex-1"
                  />
                  <Button variant="outline">Identify</Button>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <Globe className="size-4 flex-none text-muted-foreground" />
                <span className="text-sm">
                  This looks like a <Badge variant="secondary">Joomla</Badge> site.
                </span>
              </div>
              <Button onClick={() => setStep(1)}>
                Continue
                <ArrowRight />
              </Button>
              <p className="text-center text-muted-foreground text-xs">
                Starting fresh?{' '}
                <button className="underline underline-offset-2 hover:text-foreground">
                  Create a new site
                </button>
              </p>
            </CardContent>
          ) : null}

          {step === 1 ? (
            <CardContent className="flex flex-col gap-4 py-5">
              <div>
                <h1 className="font-semibold text-base tracking-tight">Connect your site</h1>
                <p className="mt-1 text-muted-foreground text-sm">
                  Tracy connects with your site’s own admin login.
                </p>
              </div>
              <div>
                <Label htmlFor="admin-url">Admin URL</Label>
                <Input id="admin-url" defaultValue="https://joomlart.com/administrator/" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="admin-user">Username</Label>
                  <Input id="admin-user" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="admin-pass">Password</Label>
                  <Input id="admin-pass" type="password" className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep(2)}>
                  Connect
                </Button>
              </div>
            </CardContent>
          ) : null}

          {step === 2 ? (
            <CardContent className="flex flex-col gap-4 py-5">
              <div>
                <h1 className="font-semibold text-base tracking-tight">Setting up joomlart.com</h1>
                <p className="mt-1 text-muted-foreground text-sm">
                  Tracy is making its own copy to work on safely.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                {PROGRESS.map((p) => (
                  <div key={p.label} className="flex items-center gap-2.5 text-sm">
                    {p.done ? (
                      <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                    ) : p.active ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/40" />
                    )}
                    <span className={cn(!p.done && !p.active && 'text-muted-foreground')}>{p.label}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={() => setStep(0)}>
                Start over (mock)
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
