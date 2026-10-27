import { StarIcon } from 'lucide-react'
import { formatNumber, formatRating } from '../model.ts'
import type { PlaceRow, Translate } from '../types.ts'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Each provider keeps its own rating and review count; these numbers are never combined. */
export function ReviewsCell({ t, row, locale = 'en' }: { t: Translate; row: PlaceRow; locale?: string }) {
  const sources = [
    { id: 'google', rating: row.rating, reviews: row.reviews, url: row.mapsUrl },
    ...(row.tripadvisor ? [{ id: 'tripadvisor', ...row.tripadvisor }] : [])
  ].filter((source) => isNum(source.rating) || isNum(source.reviews))
  if (!sources.length) return <span className="tracy-wo-muted">{t('cell.google.none')}</span>
  return (
    <div className="tracy-wo-cell">
      {sources.map((source) => (
        <div key={source.id} className="tracy-wo-cell">
          <span className="tracy-wo-line">
            {source.url ? (
              <a className="tracy-wo-link" href={source.url} target="_blank" rel="noopener noreferrer">
                {t(`cell.reviews.${source.id}`)}
              </a>
            ) : (
              <span>{t(`cell.reviews.${source.id}`)}</span>
            )}
            {isNum(source.rating) ? (
              <>
                <StarIcon className="size-3" aria-hidden />
                <b className="tracy-wo-strong">{formatRating(source.rating, locale)}</b>
              </>
            ) : null}
          </span>
          {isNum(source.reviews) ? (
            <span className="tracy-wo-small tracy-wo-muted">
              {t('cell.google.reviews', { count: formatNumber(source.reviews, locale) })}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
