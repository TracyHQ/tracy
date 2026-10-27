/**
 * "Design system" in the Add site form (U1 A + U7 A, Akemi 12/10/2026): a card right under "Customize your site", built
 * from the same markup and parts (`.tas-qcard`, `CardBadge`, `CardTitleLine`): line 1 the title and Optional, line 2
 * the pick ("Template default" or the system's name), line 3 one description, a chevron on the right. It opens the
 * sheet of systems (`design-system-sheet.tsx`).
 *
 * A template build that cannot wear a system shows NO card (Akemi, 15/10/2026: no dead button), and none while the
 * support door is still asked, so a template that cannot wear one never flashes it. That replaces the dimmed card of
 * U7 A: until a template is design system ready, customers are not offered the feature on it at all (the customer
 * lock, tracy-web `lib/design-system-customer-lock.js`). The new site gets the pick once it is up (`wizard.tsx`,
 * `design-system-pick.mjs`).
 */
import { cn, Skeleton } from '@tracy/ui'
import { Palette } from 'lucide-react'
import type { JSX, RefObject } from 'react'

import type { DesignSystemPick } from './design-system-pick.mjs'
import type { DesignSystemState } from './design-system-state'
import { CardBadge, CardTitleLine } from './questions-badge'
import type { Translate } from './strings'

const BOX = 'tas-qcard tas-dscard rounded-[10px] border border-border bg-card text-left'

/** The badge cell: the palette with no pick, else the picked system's library picture, or its "Aa" swatch without one. */
function Thumb({ t, pick }: { t: Translate; pick: DesignSystemPick | null }): JSX.Element {
  if (!pick) return <CardBadge icon={Palette} />
  if (pick.image) return <img aria-hidden="true" alt="" src={pick.image} className="tas-ds-thumb" />
  return (
    <span
      aria-hidden="true"
      className="tas-ds-thumb grid place-items-center bg-primary/10 font-semibold text-lg text-primary dark:bg-primary/15"
      style={pick.font ? { fontFamily: `"${pick.font}", var(--font-sans, sans-serif)` } : undefined}
    >
      {t('ds_swatch')}
    </span>
  )
}

export interface DesignSystemCardProps {
  t: Translate
  state: DesignSystemState
  onOpen: () => void
  cardRef: RefObject<HTMLButtonElement | null>
}

export function DesignSystemCard({ t, state, onOpen, cardRef }: DesignSystemCardProps): JSX.Element | null {
  // Not offered for this template build (or not known yet): no card at all, the site keeps the template's look.
  if (state.support !== 'yes') return null
  const title = <CardTitleLine title={t('ds_title')} optional={t('sheet_optional')} />
  if (state.library === 'loading')
    return (
      <div className="tas-qcard-wrap">
        <div className={BOX} aria-busy="true" aria-label={t('ds_loading')} data-design-system-card="loading">
          <Skeleton className="tas-qcard-badge" />
          <Skeleton className="tas-qcard-l1 h-3 w-[55%]" />
          <Skeleton className="tas-qcard-l2 h-3 w-[30%]" />
          <Skeleton className="tas-qcard-l3 h-3 w-[85%]" />
        </div>
      </div>
    )
  if (state.library === null)
    return (
      <div className="tas-qcard-wrap">
        <div className={BOX} role="alert" data-design-system-card="failed">
          <CardBadge icon={Palette} />
          {title}
          <span className="tas-qcard-l2 text-muted-foreground text-xs">
            {t('ds_failed')}{' '}
            <button type="button" className="border-0 bg-transparent p-0" onClick={state.retryLibrary}>
              <span className="text-primary underline-offset-2 hover:underline">{t('ds_retry')}</span>
            </button>
          </span>
        </div>
      </div>
    )

  // Nothing picked: how many systems the sheet offers, like the question count of Customize your site.
  const count = Array.isArray(state.library) ? state.library.length : 0
  const name = state.pick ? t('ds_picked', { name: state.pick.name }) : t('ds_choices', { count })
  return (
    <div className="tas-qcard-wrap">
      <button
        ref={cardRef}
        type="button"
        aria-haspopup="dialog"
        // The whole card is the button and shows no action word, so its name says what pressing gives.
        aria-label={`${t('ds_title')}, ${name}. ${t('ds_desc')}`}
        data-design-system-card="ready"
        className={cn(
          BOX,
          'cursor-pointer text-inherit outline-none [font:inherit] hover:border-primary focus-visible:border-primary dark:hover:border-primary dark:focus-visible:border-primary'
        )}
        onClick={onOpen}
      >
        <Thumb t={t} pick={state.pick} />
        {title}
        {/* Line 2: "<name> selected" in the text colour, or the number to choose from in muted, like the count of Customize
            your site. Line 3: the description, which gives way first. */}
        <span
          className={cn('tas-qcard-l2 text-xs', state.pick ? 'text-foreground' : 'text-muted-foreground')}
          data-design-system-name="1"
        >
          {name}
        </span>
        <span className="tas-qcard-l3 text-muted-foreground text-xs">{t('ds_desc')}</span>
        <span aria-hidden="true" className="tas-qcard-go text-base text-muted-foreground">
          ›
        </span>
      </button>
    </div>
  )
}
