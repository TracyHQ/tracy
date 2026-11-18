/**
 * Shared pieces of the Business facts bands (#537, design A): the body of a band that is not filled. Hours and amenities
 * live in `facts-hours-band.tsx`, the Team row in `facts-team-people.tsx`. The sources research read are listed by the
 * Workspace card's Sources table, not on this page.
 */
import type { JSX } from 'react'

import { NotAvailable } from './business-facts-band.tsx'
import type { FactsCardView } from './business-facts-model.ts'
import type { Translate } from './strings.ts'

/** A band body for a state that is not filled: N/A, or Not collected yet before research. */
export const Missing = ({ t, card }: { t: Translate; card: FactsCardView | undefined }): JSX.Element => (
  <NotAvailable t={t} state={card?.state === 'notCollected' ? 'notCollected' : 'none'} />
)
