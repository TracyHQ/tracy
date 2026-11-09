/**
 * The Demo site block of Details (#515): Open demo once the demo is ready (Build demo, Try again and Build again are
 * the stepper's one action, mock r6-a), a ⋯ menu for the rest (Send demo, Rebuild) and one plain line (ready with its
 * address and days left, where a failed build stopped and why, when it expired). It replaces the scattered Try again,
 * Retry, Rebuild, Reopen, Extend and Review demo controls. The build progress card sits inside it while a build runs
 * or after one stopped. Under a Build demo button sits the same time and price line as the Build form.
 */
import type { JSX, ReactNode } from 'react'
import { ExternalLink, Ellipsis } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  buttonVariants
} from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

import {
  type DemoBlockView,
  type DemoCommand,
  type DemoControl,
  demoBlockView,
  demoCommand
} from './demo-block-model.ts'
import type { ChainEstimate } from '@tracy/wo-views'
import { BuildEstimate } from './demo-progress.tsx'
import type { OpportunityListRow } from './opportunity-row.ts'
import { Section } from './details-parts.tsx'
import type { Translate } from './strings.ts'

type Body = Record<string, unknown>

export function DemoSiteBlock({
  t,
  row,
  detail,
  locale,
  now,
  busy,
  limitReached = false,
  onCommand,
  progress,
  estimate
}: {
  t: Translate
  row: OpportunityListRow
  detail: Body | null
  locale?: string
  now?: number
  /** A press is in flight. */
  busy: boolean
  /** The daily build limit is used up: Build demo and Build again wait. */
  limitReached?: boolean
  onCommand: (command: Exclude<DemoCommand, null>) => void
  /** The build progress card, drawn while a build runs or after one stopped. */
  progress?: ReactNode
  /** The pinned or suggested template's measured time and price, drawn under Build demo as on the Build form. */
  estimate?: ChainEstimate | null
}): JSX.Element {
  const view = demoBlockView(row, detail, t, { now, locale })
  const press = (control: DemoControl): void => {
    const command = demoCommand(control, row, detail)
    if (command !== null) onCommand(command)
  }
  const failed = view.state === 'failed'
  const showProgress = view.state === 'queued' || view.state === 'building' || failed
  const builds = view.primary.action === 'build' || view.primary.action === 'rebuild'
  return (
    <Section title={t('demoBlock.title')}>
      <div className="tracy-wo-demo-block" data-state={view.state}>
        {view.line !== null ? (
          <p className={failed ? 'tracy-wo-error' : 'tracy-wo-muted'} role={failed ? 'alert' : undefined}>
            {view.line}
          </p>
        ) : null}
        {view.primary.action === 'open' || view.menu.length > 0 ? (
          <div className="tracy-wo-row tracy-wo-wrap tracy-wo-demo-block-acts">
            {/* Build, Try again and Build again live in the stepper (mock r6-a); the block keeps Open demo. */}
            {view.primary.action === 'open' ? (
              <DemoPrimaryButton
                view={view}
                busy={busy}
                limitReached={limitReached}
                onPress={() => press('primary')}
              />
            ) : null}
            {view.menu.length > 0 ? (
              <DropdownMenu>
                {/* The trigger IS the button (React 18 drops a ref passed to a function component). */}
                <DropdownMenuTrigger
                  type="button"
                  disabled={busy}
                  className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
                  aria-label={t('demoBlock.more')}
                >
                  <Ellipsis aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {view.menu.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      disabled={item.id === 'rebuild' && limitReached}
                      onClick={() => press(item.id === 'send' ? 'send' : 'rebuild')}
                    >
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
        {builds ? <BuildEstimate t={t} locale={locale} estimate={estimate} /> : null}
        {showProgress && progress ? progress : null}
      </div>
    </Section>
  )
}

/** The block's Open demo button (its other presses are the stepper's). */
export function DemoPrimaryButton({
  view,
  busy,
  limitReached = false,
  onPress
}: {
  view: DemoBlockView
  busy: boolean
  limitReached?: boolean
  onPress: () => void
}): JSX.Element {
  const builds = view.primary.action === 'build' || view.primary.action === 'rebuild'
  const running = view.state === 'queued' || view.state === 'building'
  return (
    <Button
      type="button"
      size="sm"
      disabled={view.primary.disabled || busy || (builds && limitReached)}
      onClick={onPress}
    >
      {running || busy ? <Spinner label={view.primary.label} /> : null}
      {view.primary.label}
      {view.primary.action === 'open' ? <ExternalLink aria-hidden="true" /> : null}
    </Button>
  )
}
