/**
 * The sticky header of Details (#517): Back, the place's name and type, its status, and a ⋯ menu with Research again
 * and Delete. It stays in sight while the cards below scroll.
 */
import type { JSX, ReactNode } from 'react'
import { ChevronLeft, Ellipsis } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  buttonVariants
} from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

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
      <div className="tracy-wo-details-head-top">
        <Button type="button" size="sm" variant="ghost" className="tracy-wo-details-back" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          {t('details.back')}
        </Button>
      </div>
      <div className="tracy-wo-details-head-main">
        <div className="tracy-wo-details-head-name">
          <div className="tracy-wo-row tracy-wo-wrap">
            <h2 className="tracy-wo-page-title">
              {name}
              {branch ? <span className="tracy-wo-muted">{` · ${branch}`}</span> : null}
            </h2>
            {status}
          </div>
          {facts.length > 0 ? <p className="tracy-wo-muted tracy-wo-small">{facts.join(' · ')}</p> : null}
        </div>
        <div className="tracy-wo-row tracy-wo-details-head-acts">
          <DropdownMenu>
            {/* The trigger IS the button (React 18 drops a ref passed to a function component). */}
            <DropdownMenuTrigger
              type="button"
              disabled={busy}
              className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
              aria-label={t('details.more')}
            >
              <Ellipsis aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menu.onResearchAgain ? (
                <DropdownMenuItem onClick={menu.onResearchAgain}>
                  {t('details.researchAgain')}
                </DropdownMenuItem>
              ) : null}
              {menu.onResearchAgain ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem variant="destructive" onClick={menu.onDelete}>
                {t('details.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
