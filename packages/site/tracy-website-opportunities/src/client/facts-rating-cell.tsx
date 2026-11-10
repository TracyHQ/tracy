/**
 * The rating cell of the Business facts business band (#537): the star, the score and the count as one string that
 * never wraps, its source chip, and the rating's own choice (Show on the site / Leave off the site) beside it.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Badge } from '@tracy/ui'

import type { BusinessCardView } from './business-facts-model.ts'
import { ratingActions, ratingText } from './profile-rating-model.ts'
import type { RatingChoice } from './profile-rating-row.tsx'
import { SourceChip } from './source-chip.tsx'
import type { Translate } from './strings.ts'

/* The rating's own controls. */
/** The small muted tag beside a band or item the seller left off the site. */
export function LeftOffTag({ t }: { t: Translate }): JSX.Element {
  return <span className="tracy-wo-facts-off">{t('facts.leftOff')}</span>
}

/** One reading choice as a small text button. */
export function ActButton({
  children,
  disabled,
  onClick
}: {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button type="button" className="tracy-wo-facts-act" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

export function RatingCell({
  t,
  view,
  locale,
  chip,
  onRating
}: {
  t: Translate
  view: NonNullable<BusinessCardView['rating']>
  locale: string
  chip: BusinessCardView['chips']['rating']
  onRating: (choice: RatingChoice) => Promise<boolean>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (choice: RatingChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onRating(choice)
    setBusy(false)
    setFailed(!ok)
  }
  // A thin rating is already off the site: Leave off there would only repeat the sentence, so only Show is offered.
  const choices = ratingActions(view).filter((c) => !(c === 'leave' && view.few && !view.chosen))
  const note = view.shown
    ? 'facts.rating.shown'
    : view.few && !view.chosen
      ? 'facts.rating.left'
      : 'rating.left'
  const count =
    view.reviews === null
      ? ''
      : t(view.reviews === 1 ? 'facts.reviews.one' : 'facts.reviews.other', {
          count: new Intl.NumberFormat(locale).format(view.reviews)
        })
  const score = ratingText(view.score, locale)
  const full = count === '' ? `★ ${score}` : `★ ${score} · ${count}`
  return (
    <>
      <span className="tracy-wo-facts-ln">
        {/* One string that never wraps: the star, the score and the count; the count ends in an ellipsis first. */}
        <span className="tracy-wo-facts-ell tracy-wo-facts-rating" title={`${full}\n${t(note)}`}>
          <span className="tracy-wo-facts-stars" aria-hidden="true">
            ★
          </span>{' '}
          <b>{score}</b>
          {count === '' ? null : <span className="tracy-wo-facts-dim"> · {count}</span>}
        </span>
        <SourceChip t={t} chip={chip} locale={locale} />
      </span>
      <span className="tracy-wo-facts-ln tracy-wo-facts-rating-acts">
        {view.few ? (
          <Badge variant="outline" className="tracy-wo-chip-warn">
            {t('rating.few')}
          </Badge>
        ) : null}
        {note === 'rating.left' ? <LeftOffTag t={t} /> : null}
        {choices.map((choice) => (
          <ActButton key={choice} disabled={busy} onClick={() => void save(choice)}>
            {t(choice === 'show' ? 'rating.show' : 'rating.leave')}
          </ActButton>
        ))}
        {failed ? (
          <span className="tracy-wo-error" role="alert">
            {t('rating.failed')}
          </span>
        ) : null}
      </span>
    </>
  )
}
