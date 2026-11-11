/**
 * The photo mosaic of the Business facts body (#537, option F): six square tiles in three columns by two rows, the
 * height of the facts block beside it; the last tile is dimmed with +N for every photo and video past the sixth.
 * Under 752px of card the six tiles sit in one row under the facts (`facts-body-css.ts`).
 */
import type { JSX } from 'react'
import { ImageIcon, Play } from 'lucide-react'

import { mediaUrl } from './api.ts'
import { STRIP_MAX, type FactsBodyView } from './facts-body-model.ts'
import type { Translate } from './strings.ts'

const plural = (t: Translate, n: number, one: string, many: string): string =>
  n === 1 ? t(one) : t(many, { count: n })

/** "25 photos · 10 videos" */
export function countsText(t: Translate, counts: FactsBodyView['counts']): string {
  return t('facts.body.counts', {
    photos: plural(t, counts.photos, 'facts.body.photosOne', 'facts.body.photosMany'),
    videos: plural(t, counts.videos, 'facts.body.videosOne', 'facts.body.videosMany')
  })
}

export function FactsMosaic({
  t,
  view,
  onOpen
}: {
  t: Translate
  view: FactsBodyView
  onOpen: () => void
}): JSX.Element {
  if (view.tiles.length === 0)
    return (
      <div className="tracy-wo-fb-nophoto">
        <ImageIcon aria-hidden="true" />
        {view.running ? (
          <b>{t('profile.collecting')}</b>
        ) : (
          <>
            <b>{t('facts.body.noPhotos')}</b>
            <span>{t('facts.body.noPhotosNote')}</span>
          </>
        )}
      </div>
    )
  const rest = view.total - STRIP_MAX
  const title = t('facts.body.openPhotos')
  return (
    <div className="tracy-wo-fb-strip" role="group" aria-label={countsText(t, view.counts)}>
      {Array.from({ length: STRIP_MAX }, (_, i) => {
        const tile = view.tiles[i]
        if (tile === undefined)
          return <span className="tracy-wo-fb-tile" data-empty="" key={`empty-${i}`} aria-hidden="true" />
        return (
          <button
            type="button"
            className="tracy-wo-fb-tile"
            data-kind={tile.kind}
            data-i={i + 1}
            key={tile.id}
            aria-label={title}
            title={title}
            onClick={onOpen}
          >
            {tile.kind === 'image' ? (
              <img src={mediaUrl(tile.id)} alt="" loading="lazy" decoding="async" />
            ) : (
              <Play aria-hidden="true" className="tracy-wo-fb-play" />
            )}
            {i === STRIP_MAX - 1 && rest > 0 ? (
              <span className="tracy-wo-fb-more" title={t('facts.body.moreMedia', { count: rest })}>
                +{rest}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
