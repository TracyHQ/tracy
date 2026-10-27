/** Attributed TripAdvisor guest quotations in the customer's existing Details page. */
import type { JSX } from 'react'
import { Section } from './inspector.tsx'
import { mediaUrl } from './api.ts'
import { type MediaTile, tripadvisorListingView, tripadvisorReviewView } from './detail-model.ts'
import type { Translate } from './strings.ts'

export function TripadvisorReviews({
  t,
  profile,
  media = []
}: {
  t: Translate
  profile: unknown
  media?: MediaTile[]
}): JSX.Element | null {
  const reviews = tripadvisorReviewView(profile, media)
  const listing = tripadvisorListingView(profile)
  if (reviews.length === 0) return null
  return (
    <Section title={t('detail.tripadvisor.reviews')}>
      {listing ? (
        <p className="tracy-wo-small" data-tracy-tripadvisor-listing>
          <a href={listing.url} target="_blank" rel="noopener noreferrer">
            {listing.name}
          </a>
          {listing.address ? <span className="tracy-wo-muted"> · {listing.address}</span> : null}
        </p>
      ) : null}
      <div className="tracy-wo-reviews" data-tracy-tripadvisor-reviews>
        {reviews.map((review) => (
          <blockquote key={review.id} className="tracy-wo-review">
            <q>{review.text}</q>
            <span className="tracy-wo-muted tracy-wo-small tracy-wo-review-author">
              {review.authorAvatarUrl ? (
                <img
                  src={review.authorAvatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              {review.authorUrl ? (
                <a href={review.authorUrl} target="_blank" rel="noopener noreferrer">
                  {review.rating === null
                    ? t('detail.tripadvisor.by', { author: review.author })
                    : t('detail.tripadvisor.byRated', { author: review.author, rating: review.rating })}
                </a>
              ) : review.rating === null ? (
                t('detail.tripadvisor.by', { author: review.author })
              ) : (
                t('detail.tripadvisor.byRated', { author: review.author, rating: review.rating })
              )}
            </span>
            {review.photos.length > 0 ? (
              <ul className="tracy-wo-media" data-tracy-review-photos={review.id}>
                {review.photos.map((photo) => (
                  <li key={photo.url} className="tracy-wo-tile">
                    <a
                      href={photo.mediaId ? mediaUrl(photo.mediaId) : photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('media.openOriginal')}
                    >
                      {photo.mediaId ? (
                        <img src={mediaUrl(photo.mediaId)} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="tracy-wo-action-link tracy-wo-small">{t('media.openOriginal')}</span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <a href={review.url} target="_blank" rel="noopener noreferrer" className="tracy-wo-action-link">
              {t('detail.tripadvisor.source')}
            </a>
          </blockquote>
        ))}
      </div>
    </Section>
  )
}
