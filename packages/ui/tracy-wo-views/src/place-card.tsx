import { Button, Checkbox } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { ContactCell } from './cells/contact.tsx'
import { ReviewsCell } from './cells/reviews.tsx'
import { PlaceMeta, PlaceName } from './cells/place.tsx'
import { ScoreCell } from './cells/score.tsx'
import { SocialCell } from './cells/social.tsx'
import { StatusBadge } from './cells/status.tsx'
import { WebsiteCell } from './cells/website.tsx'
import { rowClickHandler, rowClickToggles } from './row-click.ts'
import type { RowClick } from './row-click.ts'
import type { CardOptions, PlaceRow, RowActions, Translate } from './types.ts'

/** Spec width (the server door's default too): a card is at most ~360 px wide, so 480 still covers a 1.3x screen. */
const PHOTO_WIDTH = 480
/** Where the cover photo comes from, by provider; product names. */
const PHOTO_SOURCE: Record<PlaceRow['provider'], string> = {
  'google-places': 'Google',
  'google-maps': 'Google',
  osm: 'OpenStreetMap'
}

function Cover({
  t,
  row,
  actions,
  selected
}: {
  t: Translate
  row: PlaceRow
  actions: RowActions
  selected: boolean
}) {
  const first = row.photo ? (actions.photoUrl?.(row, PHOTO_WIDTH) ?? null) : null
  const [src, setSrc] = useState<string | null>(first)
  const [triedFallback, setTriedFallback] = useState(false)
  useEffect(() => {
    setSrc(first)
    setTriedFallback(false)
  }, [first])
  const onError = () => {
    const next = triedFallback ? null : (actions.photoFallbackUrl?.(row, PHOTO_WIDTH) ?? null)
    setTriedFallback(true)
    setSrc(next)
  }
  const credit = row.photo?.credit
  return (
    <div className="tracy-wo-cover">
      {src ? (
        <>
          <img src={src} alt="" loading="lazy" decoding="async" onError={onError} />
          <span className="tracy-wo-credit">
            {credit ? `${t('cell.photo.credit', { credit })} · ` : ''}
            {PHOTO_SOURCE[row.provider]}
          </span>
        </>
      ) : (
        <span className="tracy-wo-cover-empty">{t('cell.photo.none')}</span>
      )}
      <Checkbox
        className="tracy-wo-cover-check"
        checked={selected}
        onCheckedChange={() => actions.onToggle(row.key)}
        aria-label={t('results.select', { name: row.name })}
      />
    </div>
  )
}

export interface PlaceCardProps {
  t: Translate
  row: PlaceRow
  selected: boolean
  actions: RowActions
  /** The map's card: a shorter cover, the website line only, ★ in the meta line. */
  compact?: boolean
  extra?: ReactNode
  locale?: string
  /** Shows a close button (the map's card). */
  onClose?(): void
  className?: string
  /** A click on the card's empty space: `toggle` its selection (default) or `open` it. */
  rowClick?: RowClick
  /** The card shown elsewhere (an inspector): marked `data-active`. */
  active?: boolean
  /** A consumer's cut of the card (`CardOptions`). */
  options?: CardOptions
}

/** One place as a card: the grid, the narrow layout and the map all draw this. */
export function PlaceCard({
  t,
  row,
  selected,
  actions,
  compact = false,
  extra,
  locale = 'en',
  onClose,
  className,
  rowClick,
  active = false,
  options = {}
}: PlaceCardProps) {
  const { score = true, facts = true, foot, demo } = options
  const demoFact = demo ? (
    <>
      <dt>{demo.label}</dt>
      <dd>{demo.cell(row)}</dd>
    </>
  ) : null
  return (
    <article
      className={cn('tracy-wo-card', compact && 'tracy-wo-card-compact', className)}
      data-selected={selected}
      data-active={active || undefined}
      onClick={(e) => {
        if (rowClickToggles(e)) rowClickHandler(rowClick, row, actions)()
      }}
    >
      <Cover t={t} row={row} actions={actions} selected={selected} />
      {onClose ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="tracy-wo-card-close"
          aria-label={t('results.map.close')}
          onClick={onClose}
        >
          <XIcon aria-hidden />
        </Button>
      ) : null}
      <div className="tracy-wo-card-top">
        <div className="tracy-wo-cell">
          <PlaceName t={t} row={row} actions={actions} />
          {options?.underName?.(row)}
          <PlaceMeta t={t} row={row} locale={locale} subtype="always" />
        </div>
        {score ? <ScoreCell t={t} row={row} locale={locale} /> : null}
      </div>
      {!facts ? (
        demoFact && <dl className="tracy-wo-card-facts">{demoFact}</dl>
      ) : compact ? (
        <div className="tracy-wo-small">
          <WebsiteCell t={t} row={row} />
        </div>
      ) : (
        <dl className="tracy-wo-card-facts">
          <dt>{t('columns.web')}</dt>
          <dd>
            <WebsiteCell t={t} row={row} />
          </dd>
          {demoFact}
          <dt>{t('columns.google')}</dt>
          <dd>
            <ReviewsCell t={t} row={row} locale={locale} />
          </dd>
          <dt>{t('columns.social')}</dt>
          <dd>
            <SocialCell t={t} row={row} actions={actions} locale={locale} />
          </dd>
          <dt>{t('columns.contact')}</dt>
          <dd>
            <ContactCell t={t} row={row} />
          </dd>
        </dl>
      )}
      {extra}
      <div className="tracy-wo-card-foot">
        {foot ? (
          foot(row)
        ) : (
          <>
            <StatusBadge t={t} status={row.status} research={row.research} locale={locale} />
            {actions.onResearch ? (
              <Button type="button" variant="outline" size="xs" onClick={() => actions.onResearch?.(row)}>
                {t('cell.research')}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}
