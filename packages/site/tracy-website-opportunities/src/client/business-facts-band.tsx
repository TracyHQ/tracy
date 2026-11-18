/**
 * One section card of the Business facts sub-page (#537, layout B): a header row (the title, an amber Check this chip
 * when the band has a check note, the section's one source, a muted aside) with the action cluster at its right
 * (`facts-band-actions.tsx`), over its facts, one per row; a row chip naming the section's source is not drawn again
 * (`SectionSource`). Edit turns the body into the band's fields, in place, with Cancel and Save at the bottom right.
 * Each band reports its name, count, check flag and switch to the section rail (`facts-rail.tsx`). Missing facts read
 * N/A.
 */
import { type JSX, type ReactNode, useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import type { BandId } from './business-facts-model.ts'
import { BandCluster, type BandSwitchView, type EditDoor } from './facts-band-actions.tsx'
import { useBandReport } from './facts-rail.tsx'
import type { SourceChipView } from './source-chip-model.ts'
import { SectionFrom, SectionSource } from './source-chip.tsx'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

/** A missing fact: N/A, muted, the reason in its title. */
export function NotAvailable({
  t,
  state = 'none'
}: {
  t: Translate
  state?: 'none' | 'notCollected'
}): JSX.Element {
  return state === 'notCollected' ? (
    <span className="tracy-wo-facts-na">{t('reason.not_collected')}</span>
  ) : (
    <span className="tracy-wo-facts-na" title={t('reason.not_found')}>
      {t('facts.na')}
    </span>
  )
}

/** A long value on one line with an ellipsis; the full text shows on hover. Its chips follow it, never cut. */
export function OneLine({ text, children }: { text: string; children?: ReactNode }): JSX.Element {
  return (
    <span className="tracy-wo-facts-ln">
      <span className="tracy-wo-facts-ell" title={text}>
        {text}
      </span>
      {children}
    </span>
  )
}

/** The amber note of a band that needs a check: a chip in the header, a strip inside the band in Edit. */
export function CheckNote({
  t,
  note,
  strip = false
}: {
  t: Translate
  note: string
  strip?: boolean
}): JSX.Element {
  return strip ? (
    <div className="tracy-wo-facts-note" role="note">
      <TriangleAlert aria-hidden="true" />
      <span>{note}</span>
    </div>
  ) : (
    <StatusPill state="attention" label={t('name.chip.check')} title={note} />
  )
}

/**
 * A vertical wheel over a row that scrolls sideways moves the row, until the row reaches its end; a trackpad's
 * sideways swipe scrolls it natively. Rows carry the class tracy-wo-facts-row.
 */
function useSideWheel(body: { current: HTMLElement | null }, editing: boolean): void {
  useEffect(() => {
    const el = body.current
    if (el === null) return
    const wheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const row = (e.target as Element | null)?.closest?.('.tracy-wo-facts-row') as HTMLElement | null
      if (row === null || !el.contains(row) || row.scrollWidth <= row.clientWidth) return
      const end = row.scrollWidth - row.clientWidth
      if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= end - 1)) return
      e.preventDefault()
      row.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [body, editing])
}

export function FactsBand({
  t,
  id,
  title,
  label,
  chips,
  source = null,
  count = null,
  check,
  aside,
  add,
  onSite,
  edit,
  open = null,
  children
}: {
  t: Translate
  id: BandId
  /** The title words and its icon. */
  title: ReactNode
  /** The band's name in words, for the switch's accessible name. */
  label: string
  /** More chips after the title. */
  chips?: ReactNode
  /** The section's one source ("From Google"); a row chip naming the same source is not drawn (#537, layout B). */
  source?: SourceChipView | null
  /** How many items the band holds, for the section rail. */
  count?: number | null
  /** The band's check note: an amber Check this chip, the note on hover and as a strip in Edit. */
  check?: string | null
  aside?: ReactNode
  /** Add more (Photos & video): the first slot of the cluster. */
  add?: ReactNode
  onSite: BandSwitchView
  edit: EditDoor
  /** A row the band opens in place by itself (Add more of Social pages), drawn like Edit's fields; null when shut. */
  open?: ReactNode | null
  children?: ReactNode
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const body = useRef<HTMLDivElement | null>(null)
  useSideWheel(body, editing)
  useBandReport({ id, name: label, count, check: Boolean(check), on: onSite.on })
  const form = open ?? (editing && 'form' in edit ? edit.form(() => setEditing(false)) : null)
  return (
    <section
      className="tracy-wo-facts-band"
      data-card={id}
      data-editing={form === null ? undefined : ''}
      data-off={onSite.on ? undefined : ''}
      tabIndex={-1}
      aria-label={label}
    >
      <div className="tracy-wo-facts-bh">
        <h3>{title}</h3>
        {check ? <CheckNote t={t} note={check} /> : null}
        <SectionFrom t={t} chip={source} />
        {chips === undefined || chips === null ? null : (
          <span className="tracy-wo-facts-chips-h">{chips}</span>
        )}
        {aside}
        <BandCluster
          t={t}
          label={label}
          add={add}
          onSite={onSite}
          edit={edit}
          editing={form !== null}
          onEdit={() => setEditing(true)}
        />
      </div>
      {form === null ? (
        <div ref={body} className="tracy-wo-facts-band-body">
          <SectionSource.Provider value={source}>{children}</SectionSource.Provider>
        </div>
      ) : (
        <div ref={body} className="tracy-wo-facts-band-edit">
          {check ? <CheckNote t={t} note={check} strip /> : null}
          {form}
        </div>
      )}
    </section>
  )
}
