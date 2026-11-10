/**
 * My opportunities' two views (spec #512, ticket #518): **Cards** and **Compact rows**, both drawn from the same
 * pieces per place (`opportunity-pieces.ts`): the place, the step it reached with its state, and the step's one action
 * (#537, option A). A card's top area is the demo preview once a site exists, else the step. A click on the row or the
 * name opens Details; the pin beside the address opens Google Maps in a new tab, and is the only link out. Secondary fields chosen in Columns add lines or cells.
 */
import type { JSX, MouseEvent } from 'react'
import { AlertCircle, CheckIcon, MapPin } from 'lucide-react'
import { Badge, Button, Checkbox, Spinner, ToggleGroup, ToggleGroupItem } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { LayoutGridIcon, MapIcon, Rows3Icon } from 'lucide-react'

import type { MyView, SecondaryField } from './column-prefs.ts'
import type { NextRun, PlacePieces } from './opportunity-pieces.ts'
import type { Translate } from './strings.ts'

export interface MyPlacesProps {
  t: Translate
  view: 'cards' | 'rows'
  places: readonly PlacePieces[]
  /** Secondary lines per place id, already in Columns order. */
  lines: ReadonlyMap<string, Array<{ id: SecondaryField; label: string; value: string }>>
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

const BADGE = {
  outline: 'outline',
  secondary: 'secondary',
  destructive: 'destructive',
  ok: 'outline',
  live: 'secondary',
  running: 'outline'
} as const

function PlacePiece({ t, p, onOpen }: { t: Translate; p: PlacePieces; onOpen(): void }): JSX.Element {
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

/**
 * The step the place has reached (#537, option A): three segments with Step n of 3, the state of the current step in
 * the Details page's own words, and the one action of that step. Both come from `rowStepOf`, the Details band's view.
 */
function StepPiece({ t, p }: { t: Translate; p: PlacePieces }): JSX.Element {
  const s = p.step
  return (
    <div className="tracy-wo-p-step" data-tone={s.tone}>
      <span className="tracy-wo-p-step-kick">
        <span className="tracy-wo-p-segs" aria-hidden="true">
          {s.segments.map((seg, i) => (
            <i key={i} data-state={seg} />
          ))}
        </span>
        {t(s.kickerKey, s.kickerParams)}
      </span>
      <span className="tracy-wo-p-step-state">
        {s.running ? <Spinner label={t(s.stateKey)} className="size-3" /> : null}
        {s.tone === 'error' ? <AlertCircle aria-hidden="true" className="tracy-wo-p-alert" /> : null}
        {s.allDone ? <CheckIcon aria-hidden="true" className="tracy-wo-p-step-check" /> : null}
        {t(s.stateKey)}
      </span>
    </div>
  )
}

/** The current step's one action: primary when the step waits for the seller, a quiet Open while a job runs. */
function ActionPiece({
  t,
  p,
  busy,
  onNext
}: {
  t: Translate
  p: PlacePieces
  busy: boolean
  onNext(run: NextRun): void
}): JSX.Element {
  const run = p.next.run
  if (run === null) return <div className="tracy-wo-p-status" />
  const variant = p.next.look === 'primary' ? 'default' : p.next.look === 'outline' ? 'outline' : 'ghost'
  return (
    <div className="tracy-wo-p-status">
      <Button
        type="button"
        size="sm"
        variant={variant}
        className={cn(p.next.look === 'quiet' && 'tracy-wo-p-quiet')}
        disabled={p.next.disabled || busy}
        onClick={() => onNext(run)}
      >
        {busy ? <Spinner label={t('loading.label')} /> : null}
        {p.next.label}
      </Button>
    </div>
  )
}

/** The status chip of a place (`placeStatus`); the Details header draws the same one. */
export function StatusBadge({ status }: { status: PlacePieces['status'] }): JSX.Element {
  return (
    <Badge
      variant={BADGE[status.tone]}
      className={cn(
        status.tone === 'live' && 'tracy-wo-badge-live',
        status.tone === 'ok' && 'tracy-wo-badge-ok',
        // A job running (Researching): the brand terracotta, as in the mocks.
        status.tone === 'running' && 'tracy-wo-chip-brand'
      )}
    >
      {status.tone === 'live' ? <CheckIcon aria-hidden="true" /> : null}
      {status.label}
    </Badge>
  )
}

function Lines({ lines }: { lines: Array<{ id: string; label: string; value: string }> | undefined }) {
  if (!lines?.length) return null
  return (
    <dl className="tracy-wo-p-lines tracy-wo-small">
      {lines.map((l) => (
        <div key={l.id} data-field={l.id}>
          <dt className="tracy-wo-muted">{l.label}</dt>
          <dd>{l.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MyPlaces({
  t,
  view,
  places,
  lines,
  selected,
  busy,
  onToggle,
  onOpen,
  onNext
}: MyPlacesProps) {
  return (
    <ul className={view === 'cards' ? 'tracy-wo-my-cards' : 'tracy-wo-my-rows'} data-view={view}>
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
          <Checkbox
            className="tracy-wo-my-check"
            checked={selected.has(p.id)}
            onCheckedChange={() => onToggle(p.id)}
            aria-label={t('results.select', { name: p.place.name })}
          />
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
          <PlacePiece t={t} p={p} onOpen={() => onOpen(p.id)} />
          {view === 'rows' ? <StepPiece t={t} p={p} /> : null}
          {view === 'cards' ? <Lines lines={lines.get(p.id)} /> : null}
          <ActionPiece t={t} p={p} busy={busy.has(p.id)} onNext={(run) => onNext(p.id, run)} />
          {/* In rows the chosen fields take a second line under the row, after Status, so Status keeps its cell. */}
          {view === 'rows' ? <Lines lines={lines.get(p.id)} /> : null}
        </li>
      ))}
    </ul>
  )
}

const VIEW_ICON = { cards: LayoutGridIcon, rows: Rows3Icon, map: MapIcon } as const

/** Cards / Compact rows / Map; Map is not drawn at all where the deployment has no browser map key. */
export function MyViewSwitch({
  t,
  value,
  views,
  onChange
}: {
  t: Translate
  value: MyView
  views: readonly MyView[]
  onChange(v: MyView): void
}): JSX.Element {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      onValueChange={(next: unknown[]) => {
        const v = views.find((x) => x === next[0])
        if (v) onChange(v)
      }}
      aria-label={t('results.view.label')}
      className="tracy-wo-view-switch"
    >
      {views.map((id) => {
        const Icon = VIEW_ICON[id]
        return (
          <ToggleGroupItem key={id} value={id} data-view={id} aria-label={t(`my.view.${id}`)}>
            <Icon aria-hidden />
            <span className="tracy-wo-tool-label">{t(`my.view.${id}`)}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
