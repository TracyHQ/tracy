/**
 * Photos & video of the Business facts sub-page (#537, design A): filter chips All / Photos / Videos, a grid that
 * starts with an Add more tile, the seller's own media captioned Added by you, then menu files and the pictures kept
 * but not shown as photographs. While research runs the grid waits (only Add more stays): progress shows in the band.
 */
import { type JSX, useState } from 'react'
import { Badge } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { sourceLabel } from './cms-label.ts'
import { type MediaFilter, filterMedia } from './business-facts-model.ts'
import type { MediaRowView } from './detail-model.ts'
import { File, HiddenPictures } from './media-row.tsx'
import { AddMedia } from './seller-review.tsx'
import type { Translate } from './strings.ts'

const FILTERS: MediaFilter[] = ['all', 'photos', 'videos']

export function FactsMedia({
  t,
  media,
  show,
  onUpload
}: {
  t: Translate
  media: MediaRowView
  /** false while research runs: the tiles wait, Add more stays. */
  show: boolean
  onUpload: (file: File) => Promise<string | null>
}): JSX.Element {
  const [filter, setFilter] = useState<MediaFilter>('all')
  const tiles = show
    ? [...media.photos.groups.flatMap((g) => g.tiles), ...media.videos.tiles].filter((m) => m.stored)
    : []
  const counts: Record<MediaFilter, number> = {
    all: tiles.length,
    photos: filterMedia(tiles, 'photos').length,
    videos: filterMedia(tiles, 'videos').length
  }
  const shown = filterMedia(tiles, filter)
  return (
    <section className="tracy-wo-facts-card" data-card="media" data-wide="" data-media-section="">
      <div className="tracy-wo-facts-card-head">
        <h3>{t('details.section.media')}</h3>
        {counts.all > 0 ? (
          <span className="tracy-wo-facts-filters" role="group" aria-label={t('details.section.media')}>
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`facts.media.${f}`, { count: counts[f] })}
              </button>
            ))}
          </span>
        ) : null}
        <AddMedia t={t} onUpload={onUpload} />
      </div>
      <ul className="tracy-wo-facts-grid-media">
        {filter === 'videos' ? null : (
          <li>
            <AddMedia t={t} onUpload={onUpload} tile />
          </li>
        )}
        {shown.map((tile) => {
          const source = tile.source === null ? '' : sourceLabel(t, tile.source)
          const label = t('media.item', {
            category: tile.kind === 'video' ? t('media.video') : t(`media.category.${tile.category}`),
            source
          })
          // A video is a square tile: a tall phone clip would fill a whole column.
          const ratio =
            tile.kind === 'video'
              ? '1 / 1'
              : tile.width !== null && tile.height !== null && tile.width > 0
                ? `${tile.width} / ${tile.height}`
                : '1 / 1'
          return (
            <li
              key={tile.id}
              className="tracy-wo-tile"
              data-video={tile.kind === 'video' ? '' : undefined}
              style={{ aspectRatio: ratio }}
            >
              {tile.kind === 'video' ? (
                <video
                  src={mediaUrl(tile.id)}
                  preload="metadata"
                  muted
                  playsInline
                  controls
                  aria-label={label}
                />
              ) : (
                <img src={mediaUrl(tile.id)} alt={label} loading="lazy" decoding="async" />
              )}
              {tile.source === 'owner' ? (
                <Badge variant="secondary" className="tracy-wo-facts-owner">
                  {t('source.owner')}
                </Badge>
              ) : null}
            </li>
          )
        })}
      </ul>
      {show && media.files.length > 0 ? (
        <ul className="tracy-wo-media">
          {media.files.map((file) => (
            <File key={file.url} t={t} file={file} />
          ))}
        </ul>
      ) : null}
      {show ? <HiddenPictures t={t} tiles={media.photos.hidden} /> : null}
    </section>
  )
}
