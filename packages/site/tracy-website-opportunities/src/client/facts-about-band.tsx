/**
 * The About band of the Business facts sub-page (#537, design A): the whole text in two lines, its source chip in the
 * header; Edit opens the text in place (`AboutEdit`).
 */
import type { JSX } from 'react'

import { FactsBand } from './business-facts-band.tsx'
import { Missing } from './business-facts-bands.tsx'
import type { FactsCardView } from './business-facts-model.ts'
import type { BandSwitchView } from './facts-band-actions.tsx'
import { AboutEdit, type ProfileField } from './facts-band-edit.tsx'
import { SourceChip } from './source-chip.tsx'
import type { Translate } from './strings.ts'

/** About: the whole text in two lines; Edit opens the text in place. */
export function AboutBand({
  t,
  locale,
  card,
  about,
  field,
  onSite
}: {
  t: Translate
  locale: string
  card: FactsCardView | undefined
  about: string | null
  /** The bio row and its save, or null when no call edits it. */
  field: ProfileField | null
  onSite: BandSwitchView
}): JSX.Element {
  const filled = card?.state === 'filled'
  return (
    <FactsBand
      t={t}
      id="about"
      label={t('field.bio')}
      title={t('field.bio')}
      chips={filled ? <SourceChip t={t} chip={card?.chip ?? null} locale={locale} /> : null}
      onSite={onSite}
      edit={
        card === undefined || card.state === 'notCollected' || field === null
          ? { why: t(field === null ? 'facts.edit.none' : 'reason.not_collected') }
          : { form: (close) => <AboutEdit t={t} close={close} about={field} /> }
      }
    >
      {filled ? (
        <p className="tracy-wo-facts-about tracy-wo-facts-clamp2" title={about ?? undefined}>
          {about}
        </p>
      ) : (
        <Missing t={t} card={card} />
      )}
    </FactsBand>
  )
}
