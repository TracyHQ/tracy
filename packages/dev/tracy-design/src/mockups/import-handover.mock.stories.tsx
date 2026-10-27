/**
 * THROWAWAY MOCK — the handover screen after an import or a new site. Not shipped code.
 *
 * THE QUESTION IT EXISTS TO ANSWER: when the fleet reports the copy is built, the wizard will now
 * start the site's agent itself (Lee, 04/09) instead of sending people to My Sites for a second
 * button. So the handover gains a state and loses a decision: what does the screen look like
 * while the agent is starting, and what is the ONE thing it offers once it is up? Three states,
 * argued on one page: starting, ready, failed.
 *
 * WHAT DECIDES IT: the agent takes thirty to sixty seconds after the copy is built (tunnel, DNS,
 * dsh boot), and that wait has to read as the last step of the same job, not a new spinner in a
 * new place. Once it answers, the only button that matters is the one into the workspace; the
 * site's public address stays, but as a secondary link. When starting fails, the retry is the
 * same words as on My Sites — "Start the agent" — because pressing IS the retry there too.
 *
 * WHAT IS NOT BEING ASKED HERE: the words. "Starting the agent", "Open the workspace" and the
 * failure sentence follow `docs/references/vocabulary.md` and the strings My Sites already ships.
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The real screen is the `dsh-add-site` plugin,
 * MODE B, plain CSS with `tv-` prefixes. Whatever wins here is REWRITTEN in `wizard.tsx`, not
 * copied, and the rewrite is what gets reviewed. `DESIGN.md` §0.
 */
import { Alert, AlertDescription, Button, Card, CardContent, cn } from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckCircle2, Circle, ExternalLink, Loader2, XCircle } from 'lucide-react'

const meta: Meta = {
  title: 'Mockups/Import handover',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

type Mark = { label: string; state: 'done' | 'active' | 'failed' | 'pending' }

/** The fleet's own milestones, as the wizard console already lists them, plus the new last one. */
const MILESTONES = (last: Mark['state']): Mark[] => [
  { label: 'Reading the site', state: 'done' },
  { label: 'Building the copy', state: 'done' },
  { label: 'Connecting your address', state: 'done' },
  { label: 'Saving the starting point', state: 'done' },
  { label: 'Starting the agent', state: last }
]

function Frame({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <p className="mb-6 text-muted-foreground text-sm">{note}</p>
        <Card>
          <CardContent className="flex flex-col gap-6 py-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}

function Console({ marks }: { marks: Mark[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {marks.map((m) => (
        <div key={m.label} className="flex items-center gap-2.5 text-sm">
          {m.state === 'done' ? (
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
          ) : m.state === 'active' ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : m.state === 'failed' ? (
            <XCircle className="size-4 text-destructive" />
          ) : (
            <Circle className="size-4 text-muted-foreground/40" />
          )}
          <span className={cn(m.state === 'pending' && 'text-muted-foreground')}>{m.label}</span>
        </div>
      ))}
    </div>
  )
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="font-semibold text-base tracking-tight">{title}</h1>
      <p className="mt-1 text-muted-foreground text-sm">{sub}</p>
    </div>
  )
}

/** The copy is built; the agent is coming up. Same console, one more line, nothing else moves. */
export const Starting: Story = {
  render: () => (
    <Frame note="State 1 — the fleet said done; the wizard called /agent itself. The wait is the last line of the same list, not a new screen.">
      <Heading title="Setting up fijitrips.example" sub="Tracy is making its own copy to work on safely." />
      <Console marks={MILESTONES('active')} />
      <p className="text-muted-foreground text-sm">
        Your copy is at fijitrips-example.tracy.ai. The agent takes about a minute to start.
      </p>
    </Frame>
  )
}

/** The agent answered. One primary button; the public address is a secondary link. */
export const Ready: Story = {
  render: () => (
    <Frame note="State 2 — the agent answered. One button that matters; the site address stays as a link, not a competing button.">
      <Heading
        title="fijitrips.example is ready"
        sub="Tracy has its own copy to work on, and the agent is up."
      />
      <Console marks={MILESTONES('done')} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button">Open the workspace</Button>
        <Button type="button" variant="link" className="gap-1.5 px-0">
          Open the site copy
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </Frame>
  )
}

/** Starting failed or took too long. The retry is the same button My Sites has, same words. */
export const Failed: Story = {
  render: () => (
    <Frame note="State 3 — the agent did not come up (refused, or a minute passed). The copy is fine; only the agent is missing. Pressing IS the retry, same words as My Sites.">
      <Heading title="Setting up fijitrips.example" sub="Tracy has its own copy to work on." />
      <Console marks={MILESTONES('failed')} />
      <Alert variant="destructive">
        <AlertDescription>
          The agent could not start. Your copy is safe — try starting it again.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button">Start the agent</Button>
        <Button type="button" variant="link" className="gap-1.5 px-0">
          Open the site copy
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </Frame>
  )
}
