/**
 * One band of the Business facts sub-page (#537, design A): a header row (the title, its source chips, an amber
 * Check this chip when the band has a check note, a muted aside) with the action cluster at its right
 * (`facts-band-actions.tsx`), over a body of one fixed height. What does not fit in the body scrolls sideways in one
 * row (the mouse wheel scrolls it too); a band never grows by itself, only Edit makes it taller: Edit turns the body
 * into the band's fields, in place, with Cancel and Save at the band's bottom right. Missing facts read N/A.
 */
import { type JSX, type ReactNode, useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import type { BandId } from './business-facts-model.ts'
import { BandCluster, type BandSwitchView, type EditDoor } from './facts-band-actions.tsx'
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
    <span className="tracy-wo-facts-chk" title={note}>
      <TriangleAlert aria-hidden="true" />
      {t('name.chip.check')}
    </span>
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
  /** The source chip or chips after the title. */
  chips?: ReactNode
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
  const form = open ?? (editing && 'form' in edit ? edit.form(() => setEditing(false)) : null)
  return (
    <section
      className="tracy-wo-facts-band"
      data-card={id}
      data-editing={form === null ? undefined : ''}
      data-off={onSite.on ? undefined : ''}
    >
      <div className="tracy-wo-facts-bh">
        <h3>{title}</h3>
        {check ? <CheckNote t={t} note={check} /> : null}
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
          {children}
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
