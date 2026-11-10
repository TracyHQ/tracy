/**
 * The Rows view's own cells (#537, header C with row style 2): the header with the column titles, the address cell
 * (pin to Google Maps, at most two lines, the whole address on hover) and the Added cell (relative words, the exact
 * date and time on hover). Cards reuse the Added cell as one line ("Added 3 hours ago").
 */

import { MapPin } from 'lucide-react'
import type { JSX } from 'react'

import type { AddedAgo } from './added-ago.ts'
import type { PlacePieces } from './opportunity-pieces.ts'
import type { Translate } from './strings.ts'

/** The column titles over the rows; the same grid tracks as every row, so each title sits over its cells. */
export function ListHead({ t }: { t: Translate }): JSX.Element {
  return (
    <div className="tracy-wo-my-head" aria-hidden="true">
      <span data-col="place">{t('list.col.place')}</span>
      <span data-col="address">{t('list.col.address')}</span>
      <span data-col="step">{t('list.col.progress')}</span>
      <span data-col="added">{t('list.col.added')}</span>
      <span data-col="action">{t('list.col.action')}</span>
    </div>
  )
}

/** Name in bold with the type under it; the name is the keyboard way into Details. */
export function NameCell({ p, onOpen }: { p: PlacePieces; onOpen(): void }): JSX.Element {
  return (
    <div className="tracy-wo-p-place" data-col="place">
      <button type="button" className="tracy-wo-p-name" title={p.place.name} onClick={onOpen}>
        {p.place.name}
      </button>
      {p.place.type ? (
        <span className="tracy-wo-muted tracy-wo-small tracy-wo-p-type">{p.place.type}</span>
      ) : null}
    </div>
  )
}

export function AddressCell({ t, p }: { t: Translate; p: PlacePieces }): JSX.Element {
  return (
    <div className="tracy-wo-p-addr tracy-wo-small tracy-wo-muted" data-col="address">
      <a
        className="tracy-wo-p-pin"
        href={p.place.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('my.pin', { name: p.place.name })}
        title={t('my.pin', { name: p.place.name })}
      >
        <MapPin aria-hidden="true" />
      </a>
      {p.place.address ? (
        <span className="tracy-wo-p-addr-text" title={p.place.address}>
          {p.place.address}
        </span>
      ) : null}
    </div>
  )
}

/** "3 hours ago" in a row (the column says Added), "Added 3 hours ago" on a card; empty when the date is unknown. */
export function AddedCell({
  t,
  added,
  card
}: {
  t: Translate
  added: AddedAgo | null | undefined
  card: boolean
}): JSX.Element | null {
  if (!added) return card ? null : <div className="tracy-wo-p-added" data-col="added" />
  return (
    <div className="tracy-wo-p-added tracy-wo-small tracy-wo-muted" data-col="added">
      <time title={added.exact}>{card ? t('list.addedAgo', { when: added.text }) : added.text}</time>
    </div>
  )
}
