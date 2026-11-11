/**
 * The small muted source chip after a Business facts value, and the glyph badge in the corner of a photo or video
 * (#537, design A). What a chip says is `source-chip-model.ts`; the glyphs are `source-logo.tsx`.
 */
import { createContext, type JSX, useContext } from 'react'
import { User } from 'lucide-react'

import { sourceLabel } from './cms-label.ts'
import {
  type SourceChipView,
  chipLogo,
  chipTitle,
  mediaBadgeLogo,
  normalSource
} from './source-chip-model.ts'
import { fromLabel, sameSource } from './facts-section-model.ts'
import { SourceGlyph } from './source-logo.tsx'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

/** The source a Business facts section names in its header (#537, layout B): a row chip naming it again is not drawn. */
export const SectionSource = createContext<SourceChipView | null>(null)

/** A section's one source in its header: the platform glyph, then "From Google", "From your website". */
export function SectionFrom({ t, chip }: { t: Translate; chip: SourceChipView | null }): JSX.Element | null {
  if (chip === null) return null
  const logo = chipLogo(chip)
  return (
    <span className="tracy-wo-facts-from">
      {logo === 'you' ? (
        <User aria-hidden="true" width={13} height={13} />
      ) : (
        <SourceGlyph logo={logo} size={13} />
      )}
      {fromLabel(t, chip)}
    </span>
  )
}

export function SourceChip({
  t,
  chip,
  locale,
  looked,
  pill = false
}: {
  t: Translate
  chip: SourceChipView | null
  locale: string
  /** What research read, named, for the Not found title. */
  looked?: string[]
  /** The source line of a band heading: the info status pill with the source logo (`status-pill.tsx`). */
  pill?: boolean
}): JSX.Element | null {
  const section = useContext(SectionSource)
  if (chip === null || (!pill && sameSource(chip, section))) return null
  const logo = chipLogo(chip)
  const title = chipTitle(t, chip, locale, (s, ref) => sourceLabel(t, s, ref), looked)
  if (pill)
    return (
      <StatusPill
        state="info"
        glyph={logo === 'you' ? <User aria-hidden="true" /> : <SourceGlyph logo={logo} />}
        label={t(`chip.word.${chip.word}`)}
        title={title}
      />
    )
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
