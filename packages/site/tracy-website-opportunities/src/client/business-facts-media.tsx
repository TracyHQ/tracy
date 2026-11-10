/**
 * Photos & video of the Business facts sub-page (#537, design A): the filters All / Photos / Videos, then every tile in
 * one filmstrip that scrolls sideways inside the band. The one Add more sits in the header cluster, the formats as
 * its title. Edit shows the formats, the menu files and the pictures kept but not shown as photographs, in place.
 * Every tile but the seller's own has its source's glyph in a corner. While research runs the strip waits (only Add
 * more stays): progress shows in the band.
 */
import { type JSX, useState } from 'react'
import { Play } from 'lucide-react'
import { Badge } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { sourceLabel } from './cms-label.ts'
import { FactsBand, NotAvailable } from './business-facts-band.tsx'
import { type MediaFilter, filterMedia } from './business-facts-model.ts'
import type { MediaRowView } from './detail-model.ts'
import { EditFooter } from './facts-band-actions.tsx'
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
  return (
    <FactsBand
      t={t}
      id="media"
      label={t('details.section.media')}
      title={t('details.section.media')}
      add={<AddMedia t={t} onUpload={onUpload} act />}
      onSite={{ on: true, set: null, why: t('facts.switch.notStored') }}
      edit={{
        form: (close) => (
          <>
            <p className="tracy-wo-muted tracy-wo-small">{t('media.addHint')}</p>
            {media.files.length > 0 ? (
              <ul className="tracy-wo-media">
                {media.files.map((file) => (
                  <File key={file.url} t={t} file={file} />
                ))}
              </ul>
            ) : null}
            <HiddenPictures t={t} tiles={show ? media.photos.hidden : []} />
            <EditFooter t={t} onCancel={close} />
          </>
        )
      }}
    >
      {tiles.length === 0 ? (
        <NotAvailable t={t} state={show ? 'none' : 'notCollected'} />
      ) : (
        <div className="tracy-wo-facts-mediarow">
          <span className="tracy-wo-facts-filters" role="group" aria-label={t('details.section.media')}>
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`facts.media.${f}`, { count: counts[f] })}
              </button>
            ))}
          </span>
          <ul className="tracy-wo-facts-strip tracy-wo-facts-row">
            {filterMedia(tiles, filter).map((tile) => (
              <MediaTile key={tile.id} t={t} tile={tile} />
            ))}
          </ul>
        </div>
      )}
    </FactsBand>
  )
}
