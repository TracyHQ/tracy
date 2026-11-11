/**
 * The value of one Site content brief item (#537, option E): hours as a seven day grid, photos as tiles with their
 * count, the brand as its logo and swatches, anything else as its words. Split from `brief-checklist-item.tsx`.
 */
import { User } from 'lucide-react'
import type { JSX } from 'react'

import { mediaUrl } from './api.ts'
import type { BriefMediaView } from './brief-media-model.ts'
import type { BriefRow } from './business-brief-model.ts'
import type { SourceLogoKey } from './source-logo.ts'
import { SourceGlyph } from './source-logo.tsx'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

/** `Monday: Open 24 hours; Tuesday: ...` as day and words, when every part reads that way; else null. */
export function hoursDays(value: string): { day: string; text: string }[] | null {
  const parts = value
    .split(/;|\n/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const days = parts.map((part) => {
    const at = part.indexOf(':')
    return at <= 0 ? null : { day: part.slice(0, at).trim(), text: part.slice(at + 1).trim() }
  })
  return days.length > 0 && days.every((d) => d !== null) ? (days as { day: string; text: string }[]) : null
}

export function Value({
  t,
  row,
  media
}: {
  t: Translate
  row: BriefRow
  media: BriefMediaView | null
}): JSX.Element {
  if (row.field === 'hours') {
    const days = hoursDays(row.value)
    if (days !== null)
      return (
        <div className="tracy-wo-brief-days">
          {days.map((d) => (
            <div key={d.day}>
              {/* The day's first three letters fit seven columns; the whole name is its title. */}
              <b title={d.day}>{d.day.slice(0, 3)}</b>
              {d.text}
            </div>
          ))}
        </div>
      )
  }
  if (row.field === 'photos' && media !== null)
    return (
      <>
        {media.tiles.length > 0 ? (
          <span className="tracy-wo-brief-tiles">
            {media.tiles.map((id) => (
              <img
                key={id}
                src={mediaUrl(id)}
                alt=""
                loading="lazy"
                decoding="async"
                // A photo the store can no longer serve leaves no empty tile behind.
                onError={(event) => {
                  event.currentTarget.hidden = true
                }}
              />
            ))}
          </span>
        ) : null}
        <span>{row.value}</span>
      </>
    )
  if (row.field === 'brand' && media !== null)
    return (
      <span className="tracy-wo-brief-brand">
        {media.logoId !== null ? (
          <img className="tracy-wo-brief-logo" src={mediaUrl(media.logoId)} alt={t('media.logo')} />
        ) : null}
        {media.colors.map((hex) => (
          <span key={hex} className="tracy-wo-brief-swatch">
            <i style={{ background: hex }} />
            {hex}
          </span>
        ))}
      </span>
    )
  return <span>{row.value}</span>
}

/** Where an item came from: the info status pill with the source logo (`status-pill.tsx`). */
export function SourcePill({
  text,
  logo
}: {
  text: string
  logo?: SourceLogoKey | 'you' | null
}): JSX.Element {
  const glyph =
    logo === undefined || logo === null ? null : logo === 'you' ? (
      <User aria-hidden="true" />
    ) : (
      <SourceGlyph logo={logo} />
    )
  return <StatusPill state="info" glyph={glyph} label={text} />
}
