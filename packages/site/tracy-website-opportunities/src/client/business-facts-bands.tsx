/**
 * Shared pieces of the Business facts bands (#537, design A): the body of a band that is not filled, and Research
 * details (locked off the site, the sources research read). Hours and amenities live in `facts-hours-band.tsx`, the
 * Team row in `facts-team-people.tsx`.
 */
import type { JSX } from 'react'

import { FactsBand, NotAvailable } from './business-facts-band.tsx'
import type { BusinessFactsView, FactsCardView } from './business-facts-model.ts'
import { sourceLabel } from './cms-label.ts'
import type { Translate } from './strings.ts'

/** A band body for a state that is not filled: N/A, or Not collected yet before research. */
export const Missing = ({ t, card }: { t: Translate; card: FactsCardView | undefined }): JSX.Element => (
  <NotAvailable t={t} state={card?.state === 'notCollected' ? 'notCollected' : 'none'} />
)

/** Research details: locked off the site, the sources research read in one row. */
export function ResearchBand({ t, view }: { t: Translate; view: BusinessFactsView }): JSX.Element {
  const researched = view.researched
  const looked = view.sources
    .filter((s) => typeof s.collectedAt === 'string' && s.collectedAt !== '')
    .map((s) => sourceLabel(t, s.source, s.ref ?? null))
    .filter((name, i, all) => all.indexOf(name) === i)
  return (
    <FactsBand
      t={t}
      id="research"
      label={t('facts.research')}
      title={t('facts.research')}
      aside={
        <span className="tracy-wo-facts-aside" title={t('facts.lock.research')}>
          {t('facts.lock.research')}
        </span>
      }
      onSite={{ on: false, set: null, lock: true, why: t('facts.lock.research') }}
      edit={{ why: t('facts.edit.research') }}
    >
      {researched && looked.length > 0 ? (
        <ul className="tracy-wo-facts-chiprow tracy-wo-facts-row">
          {looked.map((name) => (
            <li key={name} className="tracy-wo-facts-pill">
              <span className="tracy-wo-facts-ell">{name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <NotAvailable t={t} state={researched ? 'none' : 'notCollected'} />
      )}
    </FactsBand>
  )
}
