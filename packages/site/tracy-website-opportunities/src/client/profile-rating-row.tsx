/**
 * "Google rating" on the Details Profile card: `5.0 ★ (4 reviews)`, a `Few reviews` chip under 5 reviews (left off the
 * site until the person shows it), and Show on the site · Leave off the site. Nothing blocks the build.
 */
import { type JSX, useState } from 'react'
import { Badge, Button } from '@tracy/ui'

import { type RatingRowView, ratingActions, ratingText } from './profile-rating-model.ts'
import type { Translate } from './strings.ts'

/** What the person asks the server to keep (`PUT …/:id/rating`). */
export type RatingChoice = 'show' | 'leave'

export function ProfileRatingRow({
  t,
  view,
  locale = 'en',
  onSave
}: {
  t: Translate
  view: RatingRowView
  locale?: string
  /** Resolves true once the choice is saved and the page read again. */
  onSave: (choice: RatingChoice) => Promise<boolean>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (choice: RatingChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onSave(choice)
    setBusy(false)
    setFailed(!ok)
  }
  const rating = ratingText(view.score, locale)
  const value =
    view.reviews === null
      ? t('rating.valueNoCount', { rating })
      : t(view.reviews === 1 ? 'rating.valueOne' : 'rating.value', {
          rating,
          count: new Intl.NumberFormat(locale).format(view.reviews)
        })
  return (
    <div className="tracy-wo-field">
      <dt className="tracy-wo-muted tracy-wo-small">{t('field.googleRating')}</dt>
      <dd>
        <span className="tracy-wo-row tracy-wo-wrap">
          <span>{value}</span>
          {view.few ? (
            <Badge variant="outline" className="tracy-wo-name-chip is-check">
              {t('rating.few')}
            </Badge>
          ) : null}
        </span>
        {view.few && !view.chosen ? (
          <span className="tracy-wo-muted tracy-wo-small">{t('rating.fewNote')}</span>
        ) : !view.shown ? (
          <span className="tracy-wo-muted tracy-wo-small">{t('rating.left')}</span>
        ) : null}
        <span className="tracy-wo-row tracy-wo-wrap tracy-wo-name-actions">
          {ratingActions(view).map((choice) => (
            <Button
              key={choice}
              type="button"
              size="xs"
              variant="link"
              disabled={busy}
              onClick={() => void save(choice)}
            >
              {t(choice === 'show' ? 'rating.show' : 'rating.leave')}
            </Button>
          ))}
        </span>
        {failed ? (
          <span className="tracy-wo-error" role="alert">
            {t('rating.failed')}
          </span>
        ) : null}
      </dd>
    </div>
  )
}
