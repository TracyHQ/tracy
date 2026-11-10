/**
 * The small muted source chip after a Business facts value, and the glyph badge in the corner of a photo or video
 * (#537, design A). What a chip says is `source-chip-model.ts`; the glyphs are `source-logo.tsx`.
 */
import type { JSX } from 'react'
import { User } from 'lucide-react'

import { sourceLabel } from './cms-label.ts'
import {
  type SourceChipView,
  chipLogo,
  chipTitle,
  mediaBadgeLogo,
  normalSource
} from './source-chip-model.ts'
import { SourceGlyph } from './source-logo.tsx'
import type { Translate } from './strings.ts'

export function SourceChip({
  t,
  chip,
  locale,
  looked
}: {
  t: Translate
  chip: SourceChipView | null
  locale: string
  /** What research read, named, for the Not found title. */
  looked?: string[]
}): JSX.Element | null {
  if (chip === null) return null
  const logo = chipLogo(chip)
  const title = chipTitle(t, chip, locale, (s, ref) => sourceLabel(t, s, ref), looked)
  return (
    <span className="tracy-wo-sc" data-word={chip.word} title={title}>
      {logo === 'you' ? (
        <User aria-hidden="true" width={10} height={10} />
      ) : (
        <SourceGlyph logo={logo} size={10} />
      )}
      {t(`chip.word.${chip.word}`)}
    </span>
  )
}

/** The glyph badge in a tile corner; none for the seller's own media or a tile with no source. */
export function MediaSourceBadge({
  t,
  source,
  sourceUrl
}: {
  t: Translate
  source: string | null
  sourceUrl: string | null
}): JSX.Element | null {
  const logo = mediaBadgeLogo(source, sourceUrl)
  if (logo === null || source === null) return null
  return (
    <span className="tracy-wo-facts-bdg" title={sourceLabel(t, normalSource(source), sourceUrl)}>
      <SourceGlyph logo={logo} size={11} />
    </span>
  )
}
