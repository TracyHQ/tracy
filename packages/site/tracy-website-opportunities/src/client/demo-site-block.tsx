/**
 * The Demo site block of Details (#515): Open demo once the demo is ready (Build demo, Try again and Build again are
 * the stepper's one action, mock r6-a), a ⋯ menu for the rest (Send demo, Rebuild) and one plain line (ready with its
 * address and days left, where a failed build stopped and why, when it expired). It replaces the scattered Try again,
 * Retry, Rebuild, Reopen, Extend and Review demo controls. The build progress card sits inside it while a build runs
 * or after one stopped. Under a Build demo button sits the same time and price line as the Build form.
 */
import type { JSX, ReactNode } from 'react'
import { ExternalLink, Ellipsis } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'
import { Popover, PopoverItem } from '@tracy/core/site-tabs/popover'

import {
  type DemoBlockView,
  type DemoCommand,
  type DemoControl,
  demoBlockView,
  demoCommand,
  siteCardView
} from './demo-block-model.ts'
import { SiteCard } from './site-card.tsx'
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
  estimate,
  bare = false,
  siteName = '',
  brand = null
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
  /** Inside the Demo site section of Details, which carries the title: no card of its own. */
  bare?: boolean
  /** The site's name, drawn on the Your site card's picture box when there is no picture. */
  siteName?: string
  /** The first brand colour of the saved profile, the ground of that box; null for the theme's primary. */
  brand?: string | null
}): JSX.Element {
  const view = demoBlockView(row, detail, t, { now, locale })
  const press = (control: DemoControl): void => {
    const command = demoCommand(control, row, detail)
    if (command !== null) onCommand(command)
  }
  const failed = view.state === 'failed'
  const showProgress = view.state === 'queued' || view.state === 'building' || failed
  const builds = view.primary.action === 'build' || view.primary.action === 'rebuild'
  // A built demo is the Your site card (#537, option A); every other state keeps its line and the progress card.
  if (view.state === 'ready')
    return (
      <Section title={t('demoBlock.title')} bare={bare}>
        <div className="tracy-wo-demo-block" data-state={view.state}>
          <SiteCard
            t={t}
            view={siteCardView(row, detail, t, { now, locale })}
            siteName={siteName || row.name || ''}
            brand={brand}
            busy={busy}
            limitReached={limitReached}
            onOpen={() => press('primary')}
            onSend={() => press('send')}
            onRebuild={() => press('rebuild')}
          />
        </div>
      </Section>
    )
  return (
    <Section title={t('demoBlock.title')} bare={bare}>
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
              <Popover
                align="end"
                // Portalled out of the plugin root, so it carries the root class to keep the scoped reset.
                scopeClass="tracy-wo"
                trigger={(props) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={t('demoBlock.more')}
                    {...props}
                  >
                    <Ellipsis aria-hidden="true" />
                  </Button>
                )}
              >
                {view.menu.map((item) => (
                  <PopoverItem
                    key={item.id}
                    itemId={item.id}
                    disabled={item.id === 'rebuild' && limitReached}
                    onClick={() => press(item.id === 'send' ? 'send' : 'rebuild')}
                  >
                    {item.label}
                  </PopoverItem>
                ))}
              </Popover>
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
