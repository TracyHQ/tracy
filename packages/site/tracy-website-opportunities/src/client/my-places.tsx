/**
 * My opportunities' two views (spec #512, ticket #518): **Cards** and **Rows**, both drawn from the same
 * pieces per place (`opportunity-pieces.ts`): the place, the step it reached with its state, and the step's one action
 * (#537, option A). A card's top area is the demo preview once a site exists, else the step. A click on the row or the
 * name opens Details; the pin beside the address opens Google Maps in a new tab, and is the only link out. A place's
 * checkbox shows only in selection mode; Rows sit under one header of column titles (#537, header C, row style 2).
 */

import { Checkbox } from '@tracy/ui'
import { MapPin } from 'lucide-react'
import type { JSX, MouseEvent } from 'react'

import type { AddedAgo } from './added-ago.ts'
import { AddedCell, AddressCell, ListHead, NameCell } from './list-row.tsx'
import type { NextRun, PlacePieces } from './opportunity-pieces.ts'
import { ActionPiece, StepPiece } from './place-step-cells.tsx'
import { SameAsLine } from './same-as-line.tsx'
import { type PillState, StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

export interface MyPlacesProps {
  t: Translate
  view: 'cards' | 'rows'
  places: readonly PlacePieces[]
  /** Selection mode: each place shows its checkbox. */
  selecting: boolean
  /** When each place was added (`added-ago.ts`), by place id. */
  added: ReadonlyMap<string, AddedAgo | null>
  selected: ReadonlySet<string>
  busy: ReadonlySet<string>
  onToggle(id: string): void
  onOpen(id: string): void
  onNext(id: string, run: NextRun): void
}

/** Controls inside a place keep their own job; a click anywhere else opens Details. */
const OWN_JOB = 'a, button, input, label, [role="checkbox"], [role="menu"], [data-slot="tooltip-content"]'
const opensDetails = (e: MouseEvent<HTMLElement>): boolean =>
  !(e.target instanceof Element && e.target.closest(OWN_JOB))

function PlacePiece({
  t,
  p,
  onOpen,
  onOpenOther
}: {
  t: Translate
  p: PlacePieces
  onOpen(): void
  onOpenOther(id: string): void
}): JSX.Element {
  return (
    <div className="tracy-wo-p-place">
      <button type="button" className="tracy-wo-p-name" onClick={onOpen}>
        {p.place.name}
      </button>
      {p.place.type ? <span className="tracy-wo-muted tracy-wo-small">{p.place.type}</span> : null}
      <span className="tracy-wo-p-address tracy-wo-small tracy-wo-muted">
        {p.place.address ? <span className="tracy-wo-p-address-text">{p.place.address}</span> : null}
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
      </span>
      <SameAsLine t={t} cards={p.sameAs} onOpen={onOpenOther} />
    </div>
  )
}

/** The demo preview at the top of a card, drawn only once a site exists. */
function DemoThumb({ t, p }: { t: Translate; p: PlacePieces }): JSX.Element | null {
  const d = p.demo
  if (d.kind !== 'thumb') return null
  return (
    <div className="tracy-wo-p-demo" data-kind="thumb">
      <span className="tracy-wo-p-thumb" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="tracy-wo-p-demo-text">
        <span className="tracy-wo-p-live">
          {d.daysLeft === null
            ? t('my.demo.live')
            : t(d.daysLeft === 1 ? 'my.demo.daysLeft.one' : 'my.demo.daysLeft.other', {
                count: d.daysLeft
              })}
        </span>
        <span className="tracy-wo-small tracy-wo-p-site">{d.address}</span>
      </span>
    </div>
  )
}

/** A place status tone as the one status pill's state (`status-pill.tsx`). */
const PILL_OF_TONE: Record<PlacePieces['status']['tone'], PillState> = {
  outline: 'neutral',
  secondary: 'running',
  destructive: 'failed',
  ok: 'done',
  live: 'done',
  running: 'running'
}

/** The status chip of a place (`placeStatus`); the Details header draws the same one. */
export function StatusBadge({ status }: { status: PlacePieces['status'] }): JSX.Element {
  return <StatusPill state={PILL_OF_TONE[status.tone]} label={status.label} />
}

export function MyPlaces({
  t,
  view,
  places,
  selecting,
  added,
  selected,
  busy,
  onToggle,
  onOpen,
  onNext
}: MyPlacesProps) {
  const list = (
    <ul
      className={view === 'cards' ? 'tracy-wo-my-cards' : 'tracy-wo-my-rows'}
      data-view={view}
      data-selecting={selecting || undefined}
    >
      {places.map((p) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the name button is the keyboard way in; the row click is a mouse shortcut
        <li
          key={p.id}
          className="tracy-wo-my-place"
          data-state={p.state}
          data-selected={selected.has(p.id) || undefined}
          onClick={(e) => {
            if (opensDetails(e)) onOpen(p.id)
          }}
        >
          {selecting ? (
            <Checkbox
              className="tracy-wo-my-check"
              checked={selected.has(p.id)}
              onCheckedChange={() => onToggle(p.id)}
              aria-label={t('results.select', { name: p.place.name })}
            />
          ) : null}
          {/*
            Cards and rows show the same pieces (#537, option A): the place, the step it reached and the step's action.
            A card's top area is the demo preview once a site exists, else the step; a row draws the step in its middle.
          */}
          {view === 'cards' ? (
            p.demo.kind === 'thumb' ? (
              <DemoThumb t={t} p={p} />
            ) : (
              <div className="tracy-wo-p-top">
                <StepPiece t={t} p={p} />
              </div>
            )
          ) : null}
          {/* Row style 2: name and type, the address, the step, Added, the action; one grid track each. */}
          {view === 'cards' ? (
            <>
              <PlacePiece t={t} p={p} onOpen={() => onOpen(p.id)} onOpenOther={onOpen} />
              <AddedCell t={t} added={added.get(p.id)} card />
            </>
          ) : (
            <>
              <NameCell t={t} p={p} onOpen={() => onOpen(p.id)} onOpenOther={onOpen} />
              <AddressCell t={t} p={p} />
              <StepPiece t={t} p={p} />
              <AddedCell t={t} added={added.get(p.id)} card={false} />
            </>
          )}
          <ActionPiece t={t} p={p} busy={busy.has(p.id)} onNext={(run) => onNext(p.id, run)} />
        </li>
      ))}
    </ul>
  )
  if (view === 'cards') return list
  return (
    <div className="tracy-wo-my-table" data-selecting={selecting || undefined}>
      <ListHead t={t} />
      {list}
    </div>
  )
}
