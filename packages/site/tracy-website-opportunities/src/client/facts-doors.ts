/**
 * The calls the bands of the Business facts sub-page save through (#537): the profile rows, the hours, the reading
 * rows, the owner's choices and, once research made the saved profile (#537 R18), the facts door.
 */
import type { JSX } from 'react'

import type { BandSwitchView } from './facts-band-actions.tsx'
import type { ProfileField } from './facts-band-edit.tsx'
import type { SetFactOn } from './facts-generic-row.tsx'
import type { SaveFactValue } from './facts-value-edit.tsx'
import type { OwnerDoors } from './owner-edits-model.ts'
import type { HoursChoice, HoursSaved } from './profile-hours-row.tsx'
import type { ReadingPick } from './profile-reading-model.ts'

/** The calls the bands save through: each one the Business facts rows already had. */
export interface FactsDoors {
  /** "Name on the site" with its own choices, or null when research decided no name (the plain field then). */
  nameRow: JSX.Element | null
  saveName: (name: string) => Promise<boolean>
  /** A plain profile row (`phone`, `address`, `bio`) with its save, or null when no call edits it. */
  profileField: (field: string, value: string) => ProfileField | null
  saveHours: (choice: HoursChoice) => Promise<HoursSaved>
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
  /** The site's facts of some fields on or off together (`setFact`), or null when the brief states none of them. */
  factSwitch: (fields: readonly string[]) => BandSwitchView | null
  /** Reading rows of some groups, with Remove / Put back / Show / Leave off. */
  readingRows: (
    groups: ReadonlyArray<'services' | 'audience' | 'team' | 'serviceAreas'>
  ) => JSX.Element | null
  /** The key messages editor (labels, order, delete). */
  keyMessages: JSX.Element | null
  uploadMedia: (file: File) => Promise<string | null>
  retryLogo: { busy: boolean; failed: boolean; onPress: () => void }
  /** The owner's choices for the site: band switches, team, social links, photos and reviews kept off. */
  owner: OwnerDoors
  /** One fact of the saved profile on or off (`PUT …/:id/facts {factId, onSite}`); null when no call reaches it. */
  setFactOn?: SetFactOn | null
  /** One fact's value (`PUT …/:id/facts {factId, value}`); null when no call reaches it. */
  saveFactValue?: SaveFactValue | null
}
