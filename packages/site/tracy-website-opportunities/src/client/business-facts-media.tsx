/**
 * Photos & video of the Business facts sub-page (#537, layout C): a fixed-height band whose body is a one-row
 * filmstrip that starts with an Add more tile, then the first tiles; more than fits ends in a +N tile and Show all
 * (n) opens the whole grid in the side sheet, with the filters All / Photos / Videos, the menu files and the
 * pictures kept but not shown as photographs. Every tile but the seller's own has its source's glyph in a corner.
 * While research runs the strip waits (only Add more stays): progress shows in the band.
 */
import { type JSX, useState } from 'react'
import { Play } from 'lucide-react'
import { Badge } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { sourceLabel } from './cms-label.ts'
import { FactsBand, NotAvailable } from './business-facts-band.tsx'
import { BAND_CAPACITY, type MediaFilter, filterMedia, overflows } from './business-facts-model.ts'
import type { MediaRowView } from './detail-model.ts'
import { File, HiddenPictures } from './media-row.tsx'
import { AddMedia } from './seller-review.tsx'
import { MediaSourceBadge } from './source-chip.tsx'
import type { Translate } from './strings.ts'

const FILTERS: MediaFilter[] = ['all', 'photos', 'videos']
type Tile = MediaRowView['videos']['tiles'][number]

function MediaTile({ t, tile }: { t: Translate; tile: Tile }): JSX.Element {
  const source = tile.source === null ? '' : sourceLabel(t, tile.source)
  const label = t('media.item', {
    category: tile.kind === 'video' ? t('media.video') : t(`media.category.${tile.category}`),
    source
  })
  return (
    <li className="tracy-wo-tile" data-video={tile.kind === 'video' ? '' : undefined}>
      {tile.kind === 'video' ? (
        // No poster is stored for a video: a neutral tile with a play glyph that opens the file.
        <a href={mediaUrl(tile.id)} target="_blank" rel="noreferrer" aria-label={label} title={label}>
          <Play aria-hidden="true" />
        </a>
      ) : (
        <img src={mediaUrl(tile.id)} alt={label} title={label} loading="lazy" decoding="async" />
      )}
      {tile.source === 'owner' ? (
        <Badge variant="secondary" className="tracy-wo-facts-owner">
          {t('source.owner')}
        </Badge>
      ) : (
        <MediaSourceBadge t={t} source={tile.source} sourceUrl={tile.sourceUrl} />
      )}
    </li>
  )
}

/** The whole grid in the sheet, with its filters, the menu files and the hidden pictures. */
function MediaAll({ t, media, tiles }: { t: Translate; media: MediaRowView; tiles: Tile[] }): JSX.Element {
  const [filter, setFilter] = useState<MediaFilter>('all')
  const counts: Record<MediaFilter, number> = {
    all: tiles.length,
    photos: filterMedia(tiles, 'photos').length,
    videos: filterMedia(tiles, 'videos').length
  }
  return (
    <div className="tracy-wo-facts-sheet-media">
      <span className="tracy-wo-facts-filters" role="group" aria-label={t('details.section.media')}>
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`facts.media.${f}`, { count: counts[f] })}
          </button>
        ))}
      </span>
      <ul className="tracy-wo-facts-grid-media">
        {filterMedia(tiles, filter).map((tile) => (
          <MediaTile key={tile.id} t={t} tile={tile} />
        ))}
      </ul>
      {media.files.length > 0 ? (
        <ul className="tracy-wo-media">
          {media.files.map((file) => (
            <File key={file.url} t={t} file={file} />
          ))}
        </ul>
      ) : null}
      <HiddenPictures t={t} tiles={media.photos.hidden} />
    </div>
  )
}

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
  const tiles = show
    ? [...media.photos.groups.flatMap((g) => g.tiles), ...media.videos.tiles].filter((m) => m.stored)
    : []
  const photos = filterMedia(tiles, 'photos').length
  const videos = filterMedia(tiles, 'videos').length
  const extra =
    (show && (media.files.length > 0 || media.photos.hidden.length > 0)) || overflows('media', tiles.length)
  const strip = tiles.slice(0, BAND_CAPACITY.media)
  const rest = tiles.length - strip.length
  return (
    <FactsBand
      t={t}
      id="media"
      title={t('details.section.media')}
      aside={
        tiles.length > 0 ? (
          <span className="tracy-wo-facts-aside">
            {t('facts.media.photos', { count: photos })} · {t('facts.media.videos', { count: videos })}
          </span>
        ) : null
      }
      actions={[<AddMedia key="add" t={t} onUpload={onUpload} />]}
      edit={null}
      more={
        extra && tiles.length > 0
          ? { count: tiles.length, render: () => <MediaAll t={t} media={media} tiles={tiles} /> }
          : null
      }
    >
      <ul className="tracy-wo-facts-strip">
        <li>
          <AddMedia t={t} onUpload={onUpload} tile />
        </li>
        {strip.map((tile) => (
          <MediaTile key={tile.id} t={t} tile={tile} />
        ))}
        {rest > 0 ? (
          <li className="tracy-wo-facts-more-tile">
            <span aria-hidden="true">{t('facts.media.more', { count: rest })}</span>
          </li>
        ) : null}
        {tiles.length === 0 ? (
          <li className="tracy-wo-facts-strip-na">
            <NotAvailable t={t} state={show ? 'none' : 'notCollected'} />
          </li>
        ) : null}
      </ul>
    </FactsBand>
  )
}
