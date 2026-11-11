/**
 * The sticky header of Details (#517): the round back button, the place's name and type, its status, and a ⋯ menu
 * with Research again and Delete. It stays in sight while the cards below scroll.
 */
import type { JSX, ReactNode } from 'react'
import { Ellipsis } from 'lucide-react'
import { Button } from '@tracy/ui'
import { Popover, PopoverItem, PopoverSeparator } from '@tracy/core/site-tabs/popover'

import { BackButton } from './back-button.tsx'
import type { Translate } from './strings.ts'

export interface HeaderMenu {
  /** Absent: research is running, or the place was never researched. */
  onResearchAgain?: () => void
  onDelete: () => void
}

export function DetailsHeader({
  t,
  name,
  branch,
  facts,
  status,
  menu,
  busy,
  onBack
}: {
  t: Translate
  name: string
  branch: string | null
  /** The line under the name: type, distance, price, when it was added. */
  facts: string[]
  status: ReactNode
  menu: HeaderMenu
  busy: boolean
  onBack: () => void
}): JSX.Element {
  return (
    <header className="tracy-wo-details-head">
      <div className="tracy-wo-details-head-main">
        <div className="tracy-wo-details-head-name">
          <div className="tracy-wo-details-head-line">
            <BackButton label={t('details.backToList')} onClick={onBack} />
            <div className="tracy-wo-row tracy-wo-wrap">
              <h2 className="tracy-wo-page-title">
                {name}
                {branch ? <span className="tracy-wo-muted">{` · ${branch}`}</span> : null}
              </h2>
              {status}
            </div>
          </div>
          {facts.length > 0 ? (
            <p className="tracy-wo-muted tracy-wo-small tracy-wo-details-head-facts">{facts.join(' · ')}</p>
          ) : null}
        </div>
        <div className="tracy-wo-row tracy-wo-details-head-acts">
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
                aria-label={t('details.more')}
                {...props}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            )}
          >
            {menu.onResearchAgain ? (
              <PopoverItem itemId="research-again" onClick={menu.onResearchAgain}>
                {t('details.researchAgain')}
              </PopoverItem>
            ) : null}
            {menu.onResearchAgain ? <PopoverSeparator /> : null}
            <PopoverItem itemId="delete" danger onClick={menu.onDelete}>
              {t('details.delete')}
            </PopoverItem>
          </Popover>
        </div>
      </div>
    </header>
  )
}
