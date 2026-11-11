/**
 * The two media items of the Site content brief checklist (#537, option E, step 5): Photos and video (a few tiles and
 * the counts) and Logo and colors (the logo and its swatches). Read from the Media row view (`mediaRowView`), shown
 * for reference only: no door edits them here and no switch keeps them off (Business facts does that).
 */
import type { BriefRow } from './business-brief-model.ts'
import { sourceNote } from './business-brief-model.ts'
import type { MediaRowView } from './detail-model.ts'
import type { Translate } from './strings.ts'

export interface BriefMediaView {
  /** Up to eight stored photos, ids for `mediaUrl`. */
  tiles: string[]
  photos: number
  videos: number
  /** The chosen logo's media id, or null. */
  logoId: string | null
  /** The brand colours seen, as hex. */
  colors: string[]
  /** The colours are observations, not an official brand. */
  observedOnly: boolean
}

const MAX_TILES = 8

export function briefMediaView(media: MediaRowView): BriefMediaView {
  const shown = media.photos.groups.flatMap((g) => g.tiles).filter((tile) => tile.stored && !tile.ownerHidden)
  return {
    tiles: shown.slice(0, MAX_TILES).map((tile) => tile.id),
    photos: media.photos.shown,
    videos: media.videos.state === 'found' ? media.videos.tiles.length : 0,
    logoId: media.logo.state === 'found' ? media.logo.mediaId : null,
    colors: media.colors.state === 'found' ? media.colors.colors.map((c) => c.hex) : [],
    observedOnly: media.colors.state === 'found' && media.colors.observedOnly
  }
}

const count = (t: Translate, kind: 'photo' | 'video', n: number): string =>
  t(n === 1 ? `brief.item.${kind}.one` : `brief.item.${kind}.other`, { n })

/** The media items as checklist rows (read only); none when research found no photo, video, logo or colour. */
export function briefMediaRows(
  media: MediaRowView,
  view: BriefMediaView,
  t: Translate,
  locale?: string
): BriefRow[] {
  const rows: BriefRow[] = []
  if (view.photos > 0 || view.videos > 0) {
    const kinds = [
      ...media.photos.groups.flatMap((g) => g.tiles.map((tile) => tile.source)),
      ...media.videos.tiles.map((tile) => tile.source)
    ].filter((s): s is string => s !== null)
    rows.push({
      id: 'brief-media-photos',
      field: 'photos',
      label: t('brief.item.photos'),
      value: t('brief.item.and', { a: count(t, 'photo', view.photos), b: count(t, 'video', view.videos) }),
      source: sourceNote([...new Set(kinds)], 'single-source', t, locale),
      onSite: true,
      ownerChoice: false,
      notes: [],
      readOnly: true
    })
  }
  if (view.logoId !== null || view.colors.length > 0) {
    const source = media.logo.state === 'found' ? media.logo.source : null
    rows.push({
      id: 'brief-media-brand',
      field: 'brand',
      label: t('brief.item.brand'),
      value: view.colors.join(', '),
      source: sourceNote(source === null ? [] : [source], 'single-source', t, locale),
      onSite: true,
      ownerChoice: false,
      notes: view.observedOnly ? [t('brief.item.brandNote')] : [],
      readOnly: true
    })
  }
  return rows
}
